import { Spring, critical, reduced } from './spring.js';
import { $, $$, bindTabs } from './ui.js';

// Live market board. Everything here follows the market-source register record and nothing else.
const POLL_MS = 60000;
const BACKOFF_BASE = 2000;
const BACKOFF_CAP = 60000;
const TOP_N = 10;
const TILE_COLOURS = ['orange', 'yellow', 'cobalt', 'magenta', 'green'];

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function fmtPrice(v) {
  if (!isFinite(v)) return '—';
  if (v >= 1000) return usd.format(Math.round(v));
  if (v >= 1) return '$' + v.toFixed(v >= 100 ? 2 : 3);
  if (v === 0) return '$0';
  const digits = Math.min(10, Math.max(3, 2 - Math.floor(Math.log10(v)) + 2));
  return '$' + v.toFixed(digits);
}
function fmtCompact(v) {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}
function fmtChange(v) {
  if (!isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}
const num = x => { const n = typeof x === 'number' ? x : parseFloat(x); return isFinite(n) ? n : NaN; };

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

/* animated number cell: counts toward the new value, then flashes the direction of the change */
function makeCell(el, format) {
  const cell = {
    el, format, value: NaN, shown: NaN, flashTimer: 0,
    spring: new Spring(0, { stiffness: 120, damping: critical(120), precision: 0.0005, onUpdate: v => { el.textContent = format(v); } }),
    set(next, { flash = true } = {}) {
      if (!isFinite(next)) { cell.value = NaN; cell.spring.snap(0); el.textContent = '—'; return; }
      const prev = cell.value;
      if (!isFinite(prev)) {
        cell.spring.value = 0; cell.spring.target = 0;
        cell.value = next;
        cell.spring.to(next);
        return;
      }
      if (next === prev) return;
      cell.value = next;
      cell.spring.to(next);
      if (flash) {
        const up = next > prev;
        el.classList.remove('flash-up', 'flash-down');
        void el.offsetWidth;
        el.classList.add(up ? 'flash-up' : 'flash-down');
        clearTimeout(cell.flashTimer);
        cell.flashTimer = setTimeout(() => el.classList.remove('flash-up', 'flash-down'), 1100);
      }
    }
  };
  return cell;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function startMarket(rec) {
  const rowsBox = $('#mrows'), err = $('#mkt-err'), statusEl = $('#mkt-status'), statusText = $('#mkt-status-text');
  const trackEl = $('#tape-track');
  const statCells = {
    count: makeCell($('[data-stat="count"]'), v => String(Math.round(v))),
    vol: makeCell($('[data-stat="vol"]'), fmtCompact),
    liq: makeCell($('[data-stat="liq"]'), fmtCompact)
  };
  const topEl = $('[data-stat="top"]');

  const base = rec.url.replace(/\/$/, '');
  const boostsUrl = base + rec.paths.boosts;
  const pairsUrl = base + rec.paths.pairs;

  let data = [];
  let sortKey = 'vol';
  let rowsByAddr = new Map();
  let firstPaint = true;
  let failures = 0, timer = 0, controller = null, inflight = false;

  const setStatus = (kind, label) => {
    statusEl.dataset.kind = kind;
    statusText.textContent = label;
  };
  setStatus('wait', 'Connecting');

  async function getJson(url, signal) {
    const r = await fetch(url, { signal, headers: { accept: 'application/json' }, cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function pull(signal) {
    const boosts = await getJson(boostsUrl, signal);
    if (!Array.isArray(boosts)) throw new Error('unexpected boosts shape');
    const seen = new Set();
    const addrs = [];
    for (const b of boosts) {
      if (!b || b.chainId !== 'solana' || typeof b.tokenAddress !== 'string' || seen.has(b.tokenAddress)) continue;
      seen.add(b.tokenAddress);
      addrs.push(b.tokenAddress);
      if (addrs.length === 30) break;
    }
    if (!addrs.length) throw new Error('no solana entries');
    const pairs = await getJson(pairsUrl + addrs.map(encodeURIComponent).join(','), signal);
    if (!Array.isArray(pairs)) throw new Error('unexpected pairs shape');
    const best = new Map();
    for (const p of pairs) {
      const a = p && p.baseToken && p.baseToken.address;
      if (!a || !seen.has(a) || p.chainId !== 'solana') continue;
      const liq = num(p.liquidity && p.liquidity.usd) || 0;
      const cur = best.get(a);
      if (!cur || liq > cur.liq) best.set(a, { p, liq });
    }
    const out = [];
    for (const [addr, { p, liq }] of best) {
      const img = p.info && typeof p.info.imageUrl === 'string' && p.info.imageUrl.startsWith('https://') ? p.info.imageUrl : '';
      out.push({
        addr,
        symbol: String(p.baseToken.symbol || '?').slice(0, 14),
        name: String(p.baseToken.name || '').slice(0, 40),
        img,
        price: num(p.priceUsd),
        chg: num(p.priceChange && p.priceChange.h24),
        vol: num(p.volume && p.volume.h24),
        liq
      });
    }
    out.sort((a, b) => (b.vol || 0) - (a.vol || 0));
    return out.slice(0, TOP_N);
  }

  /* ---------- rendering ---------- */
  function sorted() {
    const k = { vol: 'vol', chg: 'chg', liq: 'liq' }[sortKey];
    return [...data].sort((a, b) => (isFinite(b[k]) ? b[k] : -Infinity) - (isFinite(a[k]) ? a[k] : -Infinity));
  }

  function buildRow(t) {
    const row = el('div', 'mrow spot');
    row.dataset.addr = t.addr;
    const rank = el('span', 'c-rank num'); rank.dataset.l = 'Rank';
    const logo = el('span', 'c-logo');
    const tile = el('span', 'logo-tile', (t.symbol[0] || '?').toUpperCase());
    tile.style.setProperty('--tile', `var(--${TILE_COLOURS[hash(t.addr) % TILE_COLOURS.length]})`);
    logo.append(tile);
    if (t.img) {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => img.classList.add('ok'));
      img.addEventListener('error', () => img.remove());
      img.src = t.img;
      logo.append(img);
    }
    const name = el('span', 'c-name');
    name.append(el('b', 'sym', t.symbol), el('span', 'mono-label nm', t.name));
    const price = el('span', 'c-price num'); price.dataset.l = 'Price';
    const chg = el('span', 'c-chg'); chg.dataset.l = 'Move';
    const chgPill = el('span', 'chg num'); chg.append(chgPill);
    const vol = el('span', 'c-vol num'); vol.dataset.l = 'Volume';
    const liq = el('span', 'c-liq num'); liq.dataset.l = 'Depth';
    const copy = el('span', 'c-copy');
    const btn = el('button', 'icon-btn sm', '');
    btn.type = 'button';
    btn.dataset.copy = t.addr;
    btn.dataset.label = t.symbol;
    btn.setAttribute('aria-label', `Copy address for ${t.symbol}`);
    btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5.5 1A1.5 1.5 0 0 0 4 2.5V3H3.5A1.5 1.5 0 0 0 2 4.5v9A1.5 1.5 0 0 0 3.5 15h7a1.5 1.5 0 0 0 1.5-1.5V13h.5a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 1zM5 2.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H12V4.5A1.5 1.5 0 0 0 10.5 3H5zm-1.5 1h7a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5"/></svg>';
    copy.append(btn);
    row.append(rank, logo, name, price, chg, vol, liq, copy);
    const cells = {
      rank,
      price: makeCell(price, fmtPrice),
      chg: makeCell(chgPill, fmtChange),
      vol: makeCell(vol, fmtCompact),
      liq: makeCell(liq, fmtCompact)
    };
    return { row, cells, chgPill };
  }

  function paintChange(r, v) {
    r.chgPill.classList.toggle('pos', v > 0);
    r.chgPill.classList.toggle('neg', v < 0);
    r.chgPill.dataset.dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  }

  function render() {
    if (firstPaint && !reduced() && rowsBox.querySelector('.skel-row')) {
      rowsBox.classList.add('out');
      setTimeout(() => { rowsBox.classList.remove('out'); paint(); }, 180);
      return;
    }
    paint();
  }

  function paint() {
    const list = sorted();
    err.hidden = true;
    if (firstPaint) { rowsBox.replaceChildren(); }
    const keep = new Set(list.map(t => t.addr));
    for (const [a, r] of rowsByAddr) if (!keep.has(a)) { r.row.remove(); rowsByAddr.delete(a); }
    list.forEach((t, i) => {
      let r = rowsByAddr.get(t.addr);
      const fresh = !r;
      if (fresh) { r = buildRow(t); rowsByAddr.set(t.addr, r); }
      r.cells.rank.textContent = String(i + 1);
      r.cells.price.set(t.price, { flash: !firstPaint });
      r.cells.chg.set(t.chg, { flash: !firstPaint });
      r.cells.vol.set(t.vol, { flash: !firstPaint });
      r.cells.liq.set(t.liq, { flash: !firstPaint });
      paintChange(r, t.chg);
      rowsBox.append(r.row);
      if (fresh) enter(r.row, i);
    });
    renderStats(list);
    renderTape();
    firstPaint = false;
  }

  function enter(row, i) {
    if (reduced()) return;
    row.style.opacity = '0';
    row.style.transform = 'translate3d(0, 14px, 0)';
    const s = new Spring(0, {
      stiffness: 150, damping: 17,
      onUpdate: v => { row.style.opacity = String(Math.min(1, v * 1.5)); row.style.transform = `translate3d(0, ${(1 - v) * 14}px, 0)`; }
    });
    s.to(1, { delay: 60 * i }).then(() => { row.style.opacity = row.style.transform = ''; });
  }

  function renderStats(list) {
    statCells.count.set(list.length);
    statCells.vol.set(list.reduce((s, t) => s + (t.vol || 0), 0));
    statCells.liq.set(list.reduce((s, t) => s + (t.liq || 0), 0));
    const mover = [...list].filter(t => isFinite(t.chg)).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))[0];
    topEl.textContent = mover ? `${mover.symbol} ${fmtChange(mover.chg)}` : '—';
  }

  let tapeKey = '';
  const tapeCells = new Map();
  function renderTape() {
    const list = [...data].sort((a, b) => (b.vol || 0) - (a.vol || 0));
    const key = list.map(t => t.addr).join('|');
    if (key !== tapeKey) {
      tapeKey = key;
      tapeCells.clear();
      trackEl.replaceChildren();
      for (let pass = 0; pass < 2; pass++) {
        const half = el('div', 'tape-half');
        if (pass) half.setAttribute('aria-hidden', 'true');
        for (const t of list) {
          const item = el('span', 'tape-item');
          const tile = el('span', 'logo-tile xs', (t.symbol[0] || '?').toUpperCase());
          tile.style.setProperty('--tile', `var(--${TILE_COLOURS[hash(t.addr) % TILE_COLOURS.length]})`);
          const sym = el('b', null, t.symbol);
          const p = el('span', 'num');
          const c = el('span', 'num chg-s');
          item.append(tile, sym, p, c);
          half.append(item);
          if (!tapeCells.has(t.addr)) tapeCells.set(t.addr, []);
          tapeCells.get(t.addr).push({ p, c });
        }
        trackEl.append(half);
      }
    }
    for (const t of list) {
      for (const { p, c } of tapeCells.get(t.addr) || []) {
        p.textContent = fmtPrice(t.price);
        c.textContent = fmtChange(t.chg);
        c.dataset.dir = t.chg > 0 ? 'up' : t.chg < 0 ? 'down' : 'flat';
      }
    }
  }

  function showFailure(hasData) {
    err.hidden = false;
    err.textContent = hasData
      ? 'The feed skipped a beat. The last good board stays up while we retry.'
      : 'The market feed did not answer. Trying again shortly.';
    if (!hasData) {
      const row = el('div', 'mrow dash-row');
      for (const c of ['c-rank', 'c-logo', 'c-name', 'c-price', 'c-chg', 'c-vol', 'c-liq', 'c-copy']) row.append(el('span', c, c === 'c-logo' || c === 'c-copy' || c === 'c-rank' ? '' : '—'));
      rowsBox.replaceChildren(row);
      for (const k of ['count', 'vol', 'liq']) statCells[k].set(NaN);
      topEl.textContent = '—';
      trackEl.replaceChildren(el('span', 'tape-item', '— feed unavailable'));
      tapeKey = '';
    }
  }

  /* ---------- polling ---------- */
  async function tick() {
    if (inflight || document.hidden) return;
    inflight = true;
    clearTimeout(timer);
    controller = new AbortController();
    const guard = setTimeout(() => controller.abort(), 15000);
    try {
      const next = await pull(controller.signal);
      data = next;
      failures = 0;
      render();
      setStatus('live', 'Live');
      schedule(POLL_MS);
    } catch (e) {
      if (document.hidden && e && e.name === 'AbortError') { inflight = false; clearTimeout(guard); return; }
      failures++;
      showFailure(data.length > 0);
      setStatus('bad', data.length ? 'Retrying' : 'Offline');
      const wait = Math.min(BACKOFF_CAP, BACKOFF_BASE * 2 ** (failures - 1));
      schedule(wait * (0.8 + Math.random() * 0.4));
    } finally {
      clearTimeout(guard);
      inflight = false;
    }
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      if (controller) controller.abort();
    } else {
      tick();
    }
  });

  bindTabs(k => { sortKey = k; if (data.length) render(); });
  tick();
}
