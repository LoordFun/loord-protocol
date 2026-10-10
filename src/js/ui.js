import { Spring, reduced } from './spring.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- copy + toast ---------- */
export function toast(msg) {
  const box = $('#toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast';
  const i = document.createElement('i');
  const s = document.createElement('span');
  s.textContent = msg;
  t.append(i, s);
  box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.remove(), 2200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function initCopy() {
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const ok = await copyText(btn.dataset.copy);
    const isCa = !!btn.closest('.ca-slot');
    const live = $('#ca-live');
    btn.classList.toggle('copied', ok);
    btn.classList.toggle('copy-failed', !ok);
    const act = btn.querySelector('.ca-act');
    if (act) act.querySelector('.ca-act-text').textContent = ok ? act.dataset.done : 'Blocked';
    toast(ok ? (isCa ? 'Contract address copied' : 'Address copied') : 'The browser blocked the copy');
    if (isCa && live) live.textContent = ok ? 'Contract address copied' : 'Copy failed';
    setTimeout(() => {
      btn.classList.remove('copied', 'copy-failed');
      if (act) act.querySelector('.ca-act-text').textContent = act.dataset.idle;
    }, 1600);
  });
}

/* ---------- scroll progress ---------- */
export function initProgress() {
  const bar = $('#progress i');
  if (!bar) return;
  let queued = false;
  const upd = () => {
    queued = false;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(upd); } }, { passive: true });
  addEventListener('resize', upd);
  upd();
}

/* ---------- spotlight ---------- */
export function initSpotlight() {
  if (reduced()) return;
  const sel = '.spot, .card, .mrow, .chip, .tape-item';
  let pending = 0, q = null;
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest && e.target.closest(sel);
    if (!t) return;
    q = { t, x: e.clientX, y: e.clientY };
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const r = q.t.getBoundingClientRect();
      q.t.style.setProperty('--mx', `${q.x - r.left}px`);
      q.t.style.setProperty('--my', `${q.y - r.top}px`);
    });
  }, { passive: true });
}

/* ---------- header geometry, burger, active link ---------- */
export function initChrome() {
  const strip = $('#ca-strip');
  const setStrip = () => document.documentElement.style.setProperty('--strip-h', `${strip.offsetHeight}px`);
  setStrip();
  if ('ResizeObserver' in window) new ResizeObserver(setStrip).observe(strip);
  addEventListener('resize', setStrip);

  const burger = $('#burger'), mnav = $('#mnav');
  const close = () => { mnav.hidden = true; burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Open menu'); };
  burger.addEventListener('click', () => {
    const open = mnav.hidden;
    mnav.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  mnav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !mnav.hidden) { close(); burger.focus(); } });

  const links = $$('[data-link]');
  const targets = links.map(a => $(a.getAttribute('href')));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      es.forEach(en => {
        if (!en.isIntersecting) return;
        const i = targets.indexOf(en.target);
        links.forEach((l, j) => l.classList.toggle('active', j === i));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    targets.forEach(t => t && io.observe(t));
  }
}

/* ---------- market sort tabs ---------- */
export function bindTabs(onSort) {
  const seg = $('.mkt-bar .seg');
  if (!seg) return;
  seg.addEventListener('click', e => {
    const b = e.target.closest('button[data-sort]');
    if (!b) return;
    $$('button', seg).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
    onSort(b.dataset.sort);
  });
  seg.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const bs = $$('button', seg), i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
    n.focus();
    n.click();
  });
}

/* ---------- module demos ---------- */
export function initDemos(demos) {
  $$('[data-demo]').forEach(card => {
    const d = demos.find(x => x.id === card.dataset.demo);
    const meter = $('.meter b', card), word = $('[data-demo-state]', card), line = $('[data-demo-line]', card);
    const w = new Spring(parseFloat(meter.style.width) || 0, {
      stiffness: 150, damping: 17,
      onUpdate: v => { meter.style.width = `${Math.max(0, Math.min(100, v))}%`; }
    });
    card.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const i = +b.dataset.i;
      $$('button', card).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      word.textContent = d.states[i];
      line.textContent = d.lines[i];
      w.to(d.meter[i]);
    });
  });
}

/* ---------- route trace ---------- */
export function initTrace() {
  const steps = $$('.trace-step'), svg = $('#trace-svg'), runner = $('#runner');
  if (!steps.length) return;
  const stops = [30, 187, 343, 490];
  const sp = new Spring(30, { stiffness: 90, damping: 11, onUpdate: v => runner.setAttribute('cx', v.toFixed(2)) });
  const set = i => {
    steps.forEach((s, j) => s.classList.toggle('on', j === i));
    $$('.stop', svg).forEach((g, j) => g.classList.toggle('on', j <= i));
    sp.to(stops[i]);
  };
  set(0);
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => {
    es.forEach(en => { if (en.isIntersecting) set(+en.target.dataset.step); });
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach(s => io.observe(s));
}

/* ---------- pool sheet tilt + drifting band ---------- */
export function initSheet() {
  const card = $('#sheet-card');
  if (!card) return;
  const fill = $('#range-fill'), mark = $('#range-mark');
  const place = (lo, hi, at) => {
    fill.style.left = `${lo}%`;
    fill.style.width = `${Math.max(2, hi - lo)}%`;
    mark.style.left = `${at}%`;
  };
  place(22, 74, 48);
  if (reduced()) return;

  const apply = () => { card.style.transform = `rotateX(${rx.value.toFixed(2)}deg) rotateY(${ry.value.toFixed(2)}deg)`; };
  const rx = new Spring(0, { stiffness: 140, damping: 18, onUpdate: apply });
  const ry = new Spring(0, { stiffness: 140, damping: 18, onUpdate: apply });
  const stage = card.parentElement;
  stage.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const r = card.getBoundingClientRect();
    ry.to(((e.clientX - r.left) / r.width - 0.5) * 12);
    rx.to(-((e.clientY - r.top) / r.height - 0.5) * 10);
  });
  stage.addEventListener('pointerleave', () => { rx.to(0); ry.to(0); });

  const draw = () => place(lo.value, hi.value, at.value);
  const lo = new Spring(22, { stiffness: 40, damping: 9, onUpdate: draw });
  const hi = new Spring(74, { stiffness: 40, damping: 9, onUpdate: draw });
  const at = new Spring(48, { stiffness: 60, damping: 8, onUpdate: draw });
  let timer = 0;
  const hop = () => {
    const l = 12 + Math.random() * 26, h = 58 + Math.random() * 30;
    lo.to(l);
    hi.to(h);
    at.to(l + (h - l) * (0.25 + Math.random() * 0.5));
  };
  new IntersectionObserver(es => {
    clearInterval(timer);
    if (es[0].isIntersecting) timer = setInterval(hop, 2600);
  }).observe(card);
}
