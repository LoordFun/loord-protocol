import { Spring, reduced } from './spring.js';
import { $, $$ } from './ui.js';

// Hero: parallax depth layers (pointer + scroll), and the colour wheel that picks a socket.
export function initHero(data) {
  const art = $('#art'), stage = $('#stage'), hero = $('#hero');
  if (!art) return;
  const layers = $$('[data-depth]', stage);
  const blobs = $$('.mesh i', hero);

  const px = new Spring(0, { stiffness: 70, damping: 14, onUpdate: paint });
  const py = new Spring(0, { stiffness: 70, damping: 14, onUpdate: paint });
  let scrollShift = 0;

  function paint() {
    for (const el of layers) {
      const d = parseFloat(el.dataset.depth);
      const x = px.value * d * 22;
      const y = py.value * d * 16 + scrollShift * d;
      if (el.classList.contains('wheel')) {
        // the wheel sits inside the mark layer, so only its extra depth is applied here
        el.style.transform = `translate3d(${(px.value * (d - 1) * 22).toFixed(2)}px, ${(py.value * (d - 1) * 16).toFixed(2)}px, 0)`;
      } else {
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      }
    }
    blobs.forEach((b, i) => {
      const k = (i + 1) * -9;
      b.style.translate = `${(px.value * k).toFixed(1)}px ${(py.value * k + scrollShift * 0.4).toFixed(1)}px`;
    });
  }

  const onScroll = () => {
    const r = hero.getBoundingClientRect();
    scrollShift = Math.max(-120, Math.min(120, -r.top * 0.07));
    paint();
  };

  if (!reduced()) {
    hero.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const r = hero.getBoundingClientRect();
      px.to(((e.clientX - r.left) / r.width - 0.5) * 2);
      py.to(((e.clientY - r.top) / r.height - 0.5) * 2);
    });
    hero.addEventListener('pointerleave', () => { px.to(0); py.to(0); });
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ----- socket selection ----- */
  const socks = data.sockets;
  const spin = $('#wheel-spin'), dot = $('#ro-dot'), name = $('#ro-name'), text = $('#ro-text');
  const jacks = $$('#jacks li');
  const hits = $$('.wedge', spin);
  const triggers = $$('.cable-tag, .chip');
  let current = -1;
  const rot = new Spring(0, { stiffness: 85, damping: 11, onUpdate: v => { spin.style.transform = `rotate(${v.toFixed(2)}deg)`; } });

  const norm = a => ((a + 540) % 360) - 180;
  function select(i, animate = true) {
    if (i === current) return;
    const s = socks[i];
    const target = -90 - s.angle;
    const next = rot.value + norm(target - rot.value);
    if (animate) rot.to(next); else rot.snap(next);
    current = i;
    triggers.forEach(t => { const on = +t.dataset.sock === i; t.classList.toggle('on', on); t.setAttribute('aria-pressed', String(on)); });
    hits.forEach(h => h.classList.toggle('on', +h.dataset.sock === i));
    name.textContent = s.name;
    dot.style.background = `var(--${s.colour})`;
    text.classList.add('swap');
    setTimeout(() => { text.textContent = s.text; text.classList.remove('swap'); }, animate && !reduced() ? 140 : 0);
    jacks.forEach((li, j) => {
      const on = !!s.calls[j];
      li.classList.toggle('on', on);
      li.style.setProperty('--c', `var(--${s.colour})`);
      li.querySelector('.jack-bit').textContent = on ? 'answers' : 'idle';
    });
  }

  spin.addEventListener('click', e => {
    const h = e.target.closest('.wedge');
    if (h) select(+h.dataset.sock);
  });
  triggers.forEach(t => t.addEventListener('click', () => select(+t.dataset.sock)));
  select(0, false);
}
