// Damped spring solver. One shared frame loop steps every live spring with a fixed sub-step,
// so motion stays stable on slow frames. With reduced motion every spring lands instantly.
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mq.matches;

const live = new Set();
let raf = 0;
let prev = 0;
const STEP = 1 / 240;

function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000 || STEP);
  prev = now;
  for (const s of [...live]) s.advance(dt);
  raf = live.size ? requestAnimationFrame(frame) : 0;
}
function wake() {
  if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); }
}

export class Spring {
  constructor(value = 0, { stiffness = 170, damping = 22, mass = 1, precision = 0.001, onUpdate = null } = {}) {
    this.value = value; this.target = value; this.velocity = 0;
    this.k = stiffness; this.c = damping; this.m = mass; this.eps = precision;
    this.onUpdate = onUpdate; this.delayLeft = 0; this.resolvers = [];
  }
  to(target, { delay = 0 } = {}) {
    this.target = target;
    if (reduced()) { this.snap(target); return Promise.resolve(); }
    this.delayLeft = delay / 1000;
    live.add(this); wake();
    return new Promise(res => this.resolvers.push(res));
  }
  snap(v) {
    this.value = this.target = v; this.velocity = 0; live.delete(this);
    this.onUpdate && this.onUpdate(v);
    this.flush();
  }
  flush() { const r = this.resolvers; this.resolvers = []; r.forEach(f => f()); }
  advance(dt) {
    if (this.delayLeft > 0) { this.delayLeft -= dt; return; }
    let t = dt;
    while (t > 0) {
      const h = Math.min(STEP, t); t -= h;
      const a = (-this.k * (this.value - this.target) - this.c * this.velocity) / this.m;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    if (Math.abs(this.value - this.target) < this.eps && Math.abs(this.velocity) < this.eps) {
      this.value = this.target; this.velocity = 0; live.delete(this);
      this.onUpdate && this.onUpdate(this.value); this.flush(); return;
    }
    this.onUpdate && this.onUpdate(this.value);
  }
}

// critically damped settings for a given stiffness
export const critical = (k, m = 1) => 2 * Math.sqrt(k * m);

export function springFromTo(from, to, opts, onUpdate) {
  const s = new Spring(from, { ...opts, onUpdate });
  onUpdate(from);
  return s.to(to, { delay: opts && opts.delay || 0 });
}
