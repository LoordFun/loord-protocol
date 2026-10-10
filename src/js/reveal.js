import { Spring, reduced } from './spring.js';

// Scroll-reveal with staggered spring entrances. Siblings that enter together are delayed in sequence.
export function initReveal() {
  const els = [...document.querySelectorAll('[data-reveal]')];
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const queue = new Map();
  const io = new IntersectionObserver(entries => {
    const batch = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    batch.forEach((entry, i) => { io.unobserve(entry.target); play(entry.target, i * 70); });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach(e => io.observe(e));
}

function play(el, delay) {
  const sp = new Spring(0, { stiffness: 130, damping: 15, mass: 1, precision: 0.002 });
  sp.onUpdate = v => {
    el.style.opacity = String(Math.max(0, Math.min(1, v * 1.4)));
    el.style.transform = `translate3d(0, ${(1 - v) * 30}px, 0) scale(${0.97 + 0.03 * v})`;
  };
  el.style.willChange = 'transform, opacity';
  sp.to(1, { delay }).then(() => {
    el.classList.add('in');
    el.style.opacity = el.style.transform = el.style.willChange = '';
  });
}
