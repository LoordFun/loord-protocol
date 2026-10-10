import { sockets, callPoints, stats, steps, receipt, demos, flow, path, sketch } from './content.mjs';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const X_PATH = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z';
const GH_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

const icon = {
  x: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="${X_PATH}"/></svg>`,
  github: `<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${GH_PATH}"/></svg>`,
  copy: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5.5 1A1.5 1.5 0 0 0 4 2.5V3H3.5A1.5 1.5 0 0 0 2 4.5v9A1.5 1.5 0 0 0 3.5 15h7a1.5 1.5 0 0 0 1.5-1.5V13h.5a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 1zM5 2.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H12V4.5A1.5 1.5 0 0 0 10.5 3H5zm-1.5 1h7a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5"/></svg>`,
  burger: `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false"><path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>`
};

// URL is stored, the handle is derived from it. Nothing else is kept.
export function deriveHandle(id, url) {
  const u = new URL(url);
  const seg = u.pathname.split('/').filter(Boolean);
  if (id === 'x') return '@' + seg[0];
  if (id === 'github') return seg.slice(0, 2).join('/');
  return u.hostname;
}

function social(id, label, rec) {
  const ic = icon[id];
  if (rec.state === 'stated') {
    const handle = deriveHandle(id, rec.url);
    return `<a class="icon-btn" data-record="${id}" data-state="stated" href="${esc(rec.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)} ${esc(handle)}">${ic}</a>`;
  }
  return `<span class="icon-btn inert" data-record="${id}" data-state="${rec.state}" role="img" aria-disabled="true" aria-label="${esc(label)} pending" title="pending">${ic}</span>`;
}

function caSlot(rec) {
  if (rec.state === 'stated') {
    const v = esc(rec.value);
    return `<button class="ca-btn" type="button" data-record="ca" data-state="stated" data-copy="${v}" aria-label="Copy contract address"><span class="ca-addr">${v}</span><span class="ca-act" data-idle="Copy" data-done="Copied">${icon.copy}<span class="ca-act-text">Copy</span></span></button>`;
  }
  return `<div class="ca-btn inert" data-record="ca" data-state="${rec.state}" aria-disabled="true"><span class="ca-addr">pending</span></div>`;
}

function marketShell(rec) {
  if (rec.state !== 'stated') {
    return `<div class="mkt-inert" data-record="market-source" data-state="${rec.state}"><span class="mono-label">Market feed</span><b>pending</b></div>`;
  }
  const rows = Array.from({ length: 10 }, (_, i) => `<div class="mrow skel-row" aria-hidden="true"><span class="c-rank"><i class="skel" style="width:16px"></i></span><span class="c-logo"><i class="skel round"></i></span><span class="c-name"><i class="skel" style="width:70%"></i></span><span class="c-price"><i class="skel" style="width:60%"></i></span><span class="c-chg"><i class="skel" style="width:50%"></i></span><span class="c-vol"><i class="skel" style="width:60%"></i></span><span class="c-liq"><i class="skel" style="width:60%"></i></span><span class="c-copy"></span></div>`).join('');
  return `<div class="mkt" data-record="market-source" data-state="stated">
    <div class="mkt-bar">
      <div class="seg" role="tablist" aria-label="Sort the tape">
        <button type="button" role="tab" class="on" aria-selected="true" data-sort="vol">Volume</button>
        <button type="button" role="tab" aria-selected="false" data-sort="chg">Move</button>
        <button type="button" role="tab" aria-selected="false" data-sort="liq">Depth</button>
      </div>
      <span class="live" id="mkt-status" role="status"><i class="live-dot"></i><span id="mkt-status-text">Connecting</span></span>
    </div>
    <div class="card mtable" id="mtable">
      <div class="mhead" aria-hidden="true"><span class="c-rank">#</span><span class="c-logo"></span><span class="c-name">Token</span><span class="c-price">Price</span><span class="c-chg">Move</span><span class="c-vol">Volume</span><span class="c-liq">Depth</span><span class="c-copy"></span></div>
      <div id="mrows" aria-live="off">${rows}</div>
      <p class="mkt-err" id="mkt-err" hidden></p>
    </div>
    <div class="statline" id="mkt-stats">
      <div class="spot"><span class="mono-label">Tokens tracked</span><div class="v num" data-stat="count">—</div></div>
      <div class="spot"><span class="mono-label">Combined volume</span><div class="v num" data-stat="vol">—</div></div>
      <div class="spot"><span class="mono-label">Combined depth</span><div class="v num" data-stat="liq">—</div></div>
      <div class="spot"><span class="mono-label">Biggest mover</span><div class="v sm" data-stat="top">—</div></div>
    </div>
  </div>`;
}

export function render({ reg, geo }) {
  const R = id => reg.get(id);
  const ca = R('ca'), xr = R('x'), gh = R('github'), ms = R('market-source'), chain = R('chain');
  const pub = { records: {} };
  for (const [id, r] of reg) {
    const o = { state: r.state, label: r.label };
    if (r.state === 'stated') {
      if (r.value) o.value = r.value;
      if (r.url) { o.url = r.url; o.handle = deriveHandle(id, r.url); }
      if (r.paths) o.paths = r.paths;
    }
    pub.records[id] = o;
  }
  const wheel = geo.wheel;
  const wedges = Object.fromEntries(Object.entries(geo.wedgeCentreDeg));
  const colourOf = { orange: 'orange', cobalt: 'cobalt', green: 'green', magenta: 'magenta', yellow: 'yellow' };
  const sockData = sockets.map(s => ({ ...s, angle: wedges[s.colour] }));

  const tags = sockets.map((s, i) => `<button type="button" class="cable-tag" data-sock="${i}" style="--c:var(--${colourOf[s.colour]});--tag-x:${[18, 82, 90, 14, 50][i]}%;--tag-y:${[20, 18, 62, 74, 92][i]}%" data-depth="${[0.7, 0.9, 1.1, 0.8, 1.0][i]}"><i></i>${esc(s.name)}</button>`).join('');
  const chips = sockets.map((s, i) => `<button type="button" class="chip" data-sock="${i}" style="--c:var(--${colourOf[s.colour]})"><i></i>${esc(s.name)}</button>`).join('');
  const calls = callPoints.map((c, i) => `<li data-call="${i}"><span class="jack-dot"></span><span>${esc(c)}</span><span class="jack-bit"></span></li>`).join('');
  const s0 = sockets[0];

  const wedgeHit = sockets.map((s, i) => {
    const a = wedges[s.colour], r0 = 17.5, r1 = 50;
    const p = (r, d) => `${(50 + r * Math.cos(d * Math.PI / 180)).toFixed(2)} ${(50 + r * Math.sin(d * Math.PI / 180)).toFixed(2)}`;
    const d = `M${p(r0, a - 36)}L${p(r1, a - 36)}A${r1} ${r1} 0 0 1 ${p(r1, a + 36)}L${p(r0, a + 36)}A${r0} ${r0} 0 0 0 ${p(r0, a - 36)}Z`;
    return `<path class="wedge" data-sock="${i}" d="${d}" tabindex="-1"/>`;
  }).join('');

  const statTiles = stats.map(s => `<div class="spot" data-slot="pending"><span class="mono-label">${esc(s.label)}</span><div class="v num">—</div><span class="mono-label">pending</span></div>`).join('');

  const stepsHtml = steps.map((s, i) => `<div class="trace-step${i === 0 ? ' on' : ''}" data-step="${i}" data-reveal><span class="mono-label">Stop ${['one', 'two', 'three', 'four'][i]}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('');
  const receiptHtml = receipt.map((r, i) => `<div${i === receipt.length - 1 ? ' class="big"' : ''}><dt>${esc(r)}</dt><dd>pending</dd></div>`).join('');

  const demoHtml = demos.map(d => `<article class="mod card spot" data-reveal data-demo="${d.id}" style="--c:var(--${d.colour})">
      <header><i></i>${esc(d.name)}<span class="mono-label">illustration</span></header>
      <div class="mod-big" data-demo-state>${esc(d.states[1])}</div>
      <p data-demo-line>${esc(d.lines[1])}</p>
      <div class="meter" role="presentation"><b style="width:${d.meter[1]}%"></b></div>
      <div class="seg sm" role="group" aria-label="${esc(d.name)} setting">${d.states.map((st, i) => `<button type="button" class="${i === 1 ? 'on' : ''}" aria-pressed="${i === 1}" data-i="${i}">${esc(st)}</button>`).join('')}</div>
      <span class="mono-label">figure · pending</span>
    </article>`).join('');

  const flowHtml = flow.map((f, i) => `<div class="flow-step card spot" data-reveal><span class="mono-label">Step ${['one', 'two', 'three', 'four'][i]}</span><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div>`).join('');
  const pathHtml = path.map((p, i) => `<div class="phase card spot" data-reveal><span class="mono-label">Phase ${['one', 'two', 'three', 'four'][i]}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p><span class="pill-pending">pending</span></div>`).join('');

  const msHost = ms.state === 'stated' ? deriveHandle('market-source', ms.url) : '';
  const footFeed = ms.state === 'stated'
    ? `<a href="${esc(ms.url.replace(/^https:\/\/api\./, 'https://'))}" target="_blank" rel="noopener noreferrer">Market data from ${esc(msHost.replace(/^api\./, ''))}</a>`
    : `<span class="mono-label">Market feed · pending</span>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Loord · pools that answer to you</title>
<meta name="description" content="Loord is a range-based exchange for Solana. Every pool carries a socket for small programs, so trades, deposits and fees follow the rules you wire in.">
<meta name="theme-color" content="__THEME__">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Loord">
<meta property="og:title" content="Loord · pools that answer to you">
<meta property="og:description" content="A range-based exchange for Solana where every pool carries a socket for your own programs.">
<link rel="icon" type="image/svg+xml" sizes="32x32" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/tokens.css">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/js/boot.js"></script>
</head>
<body>
<div class="progress" id="progress" aria-hidden="true"><i></i></div>
<a class="skip" href="#main">Skip to content</a>

<header class="top" id="top">
  <div class="ca-strip" id="ca-strip">
    <div class="ca-in">
      <span class="ca-label">Contract address</span>
      <div class="ca-slot">${caSlot(ca)}<span class="sr" id="ca-live" role="status" aria-live="polite"></span></div>
      <div class="socials" aria-label="Social links">${social('x', 'X', xr)}${social('github', 'GitHub', gh)}</div>
    </div>
  </div>
  <nav class="nav" id="nav" aria-label="Primary">
    <div class="nav-in">
      <a class="brand" href="#top" aria-label="Loord home"><img src="/assets/loord-mark.png" width="28" height="28" alt="" decoding="async"><span>Loord</span></a>
      <div class="nav-links" id="nav-links">
        <a href="#sockets" data-link>Sockets</a><a href="#market" data-link>Market</a><a href="#path" data-link>Path</a>
      </div>
      <span class="chain-badge" data-record="chain" data-state="${chain.state}"><i></i>${chain.state === 'stated' ? esc(chain.value) : 'pending'}</span>
      <button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="mnav" aria-label="Open menu">${icon.burger}</button>
    </div>
    <div class="mnav" id="mnav" hidden><a href="#sockets">Sockets</a><a href="#market">Market</a><a href="#path">Path</a></div>
  </nav>
</header>

<div class="tape" id="tape" data-record="market-source" data-state="${ms.state}" aria-label="Live prices">
  <span class="tape-tag"><i class="live-dot"></i>Live</span>
  <div class="tape-view"><div class="tape-track" id="tape-track">${ms.state === 'stated' ? Array.from({ length: 10 }, () => '<span class="tape-item"><i class="skel" style="width:90px"></i></span>').join('') : '<span class="tape-item">Market feed · pending</span>'}</div></div>
</div>

<main id="main">
<section class="hero" id="hero">
  <div class="mesh" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div>
  <div class="hero-copy">
    <span class="mono-label" data-reveal>Built for Solana · programmable pools</span>
    <h1 class="display" data-reveal>Every pool answers to you.</h1>
    <p class="lede" data-reveal>Loord is a range-based exchange where each pool carries a socket for small programs. Wire in the rules you want, and trades, deposits and fees will follow them.</p>
    <div class="row-btns" data-reveal>
      <a class="b b-ink" href="#sockets">Explore the sockets</a>
      <a class="b b-line" href="#market">Watch the tape</a>
    </div>
    <p class="hint" data-reveal><span class="hint-dot"></span>Tap a colour on the wheel to change sockets.</p>
  </div>

  <div class="hero-stage" id="stage" aria-label="The Loord mark, with a colour wheel that picks a socket">
    <div class="art" id="art">
      <div class="layer ring-a" data-depth="0.4" aria-hidden="true"></div>
      <div class="layer ring-b" data-depth="0.7" aria-hidden="true"></div>
      <div class="layer mark" data-depth="1">
        <img src="/assets/loord-mark.png" width="880" height="880" alt="Loord mark" decoding="async" fetchpriority="high">
        <div class="wheel" id="wheel" style="left:${wheel.leftPct}%;top:${wheel.topPct}%;width:${wheel.sizePct}%;height:${wheel.sizePct}%" data-depth="1.6">
          <div class="wheel-spin" id="wheel-spin">
            <img src="/assets/loord-wheel.png" alt="" decoding="async">
            <svg viewBox="0 0 100 100" aria-hidden="true">${wedgeHit}</svg>
          </div>
          <i class="pointer" aria-hidden="true"></i>
        </div>
      </div>
      <div class="tags" aria-hidden="false">${tags}</div>
    </div>
  </div>

  <aside class="readout" aria-live="polite">
    <span class="mono-label">Selected socket</span>
    <div class="readout-title"><i id="ro-dot" style="background:var(--${s0.colour})"></i><span id="ro-name">${esc(s0.name)}</span></div>
    <p class="readout-text" id="ro-text">${esc(s0.text)}</p>
    <ul class="jack-list" id="jacks">${calls}</ul>
    <div class="readout-foot"><span>Five sockets, one wheel</span><span class="mono-label">tap to rotate</span></div>
  </aside>
  <div class="module-row">${chips}</div>
</section>

<section class="sec" id="stats">
  <div class="statline" aria-label="Protocol figures">${statTiles}</div>
</section>

<section class="sec" id="market">
  <div class="sec-head" data-reveal>
    <span class="mono-label">Market pulse</span>
    <h2 class="h2">What Solana is trading, right now</h2>
    <p class="sec-lede">Ten of the busiest boosted tokens, ranked by the volume they did over the last day. The board refreshes by itself and pauses while you look away.</p>
  </div>
  ${marketShell(ms)}
</section>

<section class="sec" id="sockets">
  <div class="sec-head" data-reveal>
    <span class="mono-label">Inside a trade</span>
    <h2 class="h2">Four stops between a click and a fill</h2>
    <p class="sec-lede">The socket sits on the road every trade takes. Scroll to walk the road with it.</p>
  </div>
  <div class="trace">
    <div class="trace-steps">${stepsHtml}</div>
    <div class="trace-sticky">
      <div class="card trace-card spot">
        <span class="mono-label">The route of one trade</span>
        <svg class="trace-svg" id="trace-svg" viewBox="0 0 520 150" role="img" aria-label="A trade passes the socket, the curve, and the socket again">
          <path class="route" d="M30 75H490" />
          <g class="stop" data-stop="0"><circle cx="30" cy="75" r="13"/><text x="30" y="118">arrive</text></g>
          <g class="stop" data-stop="1"><circle cx="187" cy="75" r="13"/><text x="187" y="118">socket</text></g>
          <g class="stop" data-stop="2"><circle cx="343" cy="75" r="13"/><text x="343" y="118">curve</text></g>
          <g class="stop" data-stop="3"><circle cx="490" cy="75" r="13"/><text x="490" y="118">notes</text></g>
          <circle class="runner" id="runner" cx="30" cy="75" r="7"/>
        </svg>
        <dl class="receipt">${receiptHtml}</dl>
      </div>
    </div>
  </div>
</section>

<section class="sec" id="rack">
  <div class="sec-head" data-reveal>
    <span class="mono-label">Ready-made sockets</span>
    <h2 class="h2">Pick a behaviour, then bend it</h2>
    <p class="sec-lede">Each card below is an illustration. Move the setting and watch what the program would do.</p>
  </div>
  <div class="mods">${demoHtml}</div>
</section>

<section class="sec split" id="sheet">
  <div class="sec-head" data-reveal>
    <span class="mono-label">The pool sheet</span>
    <h2 class="h2">One page tells you how a pool behaves</h2>
    <p class="sec-lede">Every pool states its price band, the program in its socket and the calls that program answers. Nothing hides behind the curve.</p>
    <ul class="ticks">
      <li>Price band shown as a bar, not a riddle</li>
      <li>Sockets listed by the calls they answer</li>
      <li>Figures stay blank until a real pool fills them</li>
    </ul>
  </div>
  <div class="tilt-stage" data-reveal>
    <article class="sheet card" id="sheet-card">
      <div class="sheet-top"><span class="mono-label">Sample pool</span><span class="lock">socket attached</span></div>
      <div class="sheet-pair">Pair<br>pending</div>
      <div class="range"><div class="range-bar"><b id="range-fill"></b><i id="range-mark"></i></div><div class="range-labels"><span class="mono-label">low edge</span><span class="mono-label">high edge</span></div></div>
      <dl class="sheet-dl"><div><dt>Band</dt><dd>pending</dd></div><div><dt>Rate</dt><dd>pending</dd></div><div><dt>Held</dt><dd>pending</dd></div></dl>
    </article>
  </div>
</section>

<section class="sec" id="build">
  <div class="sec-head" data-reveal>
    <span class="mono-label">For builders</span>
    <h2 class="h2">A socket is just a small program</h2>
    <p class="sec-lede">It answers two questions, before and after. Everything else is yours to decide.</p>
  </div>
  <div class="flow">${flowHtml}</div>
  <div class="code-card" data-reveal><div class="seg dark sm" role="presentation"><button type="button" class="on" tabindex="-1">sketch</button></div><pre><code>${esc(sketch)}</code></pre></div>
</section>

<section class="sec" id="path">
  <div class="sec-head" data-reveal>
    <span class="mono-label">The road ahead</span>
    <h2 class="h2">Four phases, no promises on the clock</h2>
    <p class="sec-lede">Order matters here, not dates. Each phase opens once the one before it is solid.</p>
  </div>
  <div class="phases">${pathHtml}</div>
</section>

<section class="closing">
  <h2 class="display" data-reveal>Loord</h2>
  <p class="sec-lede" data-reveal>Wire the pool you always wished existed.</p>
  <div class="row-btns" data-reveal><a class="b b-ink" href="#top">Back to the top</a><a class="b b-line" href="#market">See the tape</a></div>
</section>
</main>

<footer class="foot">
  <div class="foot-in">
    <div class="foot-grid">
      <div><span class="brand-sm">Loord</span><p class="foot-blurb">Programmable pools for Solana.</p></div>
      <div><h4>Explore</h4><a href="#sockets">Sockets</a><a href="#market">Market</a><a href="#path">Path</a></div>
      <div><h4>Network</h4><span class="foot-txt">${chain.state === 'stated' ? esc(chain.value) : 'pending'}</span></div>
      <div><h4>Feed</h4>${footFeed}</div>
    </div>
    <p class="foot-word" aria-hidden="true">Loord</p>
  </div>
</footer>

<div class="toasts" id="toasts" aria-live="polite"></div>
<script type="application/json" id="register">${JSON.stringify(pub).replace(/</g, '\\u003c')}</script>
<script type="application/json" id="sockets-data">${JSON.stringify({ sockets: sockData, calls: callPoints, demos }).replace(/</g, '\\u003c')}</script>
<script type="module" src="/assets/js/main.js"></script>
<noscript><style>[data-reveal]{opacity:1!important;transform:none!important}</style></noscript>
</body>
</html>
`;
}
