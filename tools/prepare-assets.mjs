// Builds web-ready logo layers from the transparent brand PNG.
// The source carries pure-black RGB under fully transparent pixels, so every resize here is premultiplied:
// colour is multiplied by alpha before filtering and divided back afterwards.
import fs from 'node:fs';
import sharp from 'sharp';

const SRC = 'brand/LOGO LOORD PNG...png';
const CROP = { left: 450, top: 450, size: 1100 };
const OUT = 880;
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, n = W * H;

// geometry of the colour wheel, measured from saturated opaque pixels
const sat = [];
for (let i = 0; i < n; i++) {
  if (data[i*4+3] < 250) continue;
  const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
  if (Math.max(r, g, b) - Math.min(r, g, b) > 90) sat.push(i);
}
let sx = 0, sy = 0;
for (const i of sat) { sx += i % W; sy += (i / W) | 0; }
const cx = sx / sat.length, cy = sy / sat.length;
let rMin = 1e9, rMax = 0;
const wedgeRef = { orange: [251,84,14], yellow: [251,197,3], cobalt: [6,79,249], magenta: [225,20,129], green: [128,191,23] };
const ang = {}; for (const k in wedgeRef) ang[k] = [];
for (const i of sat) {
  const x = i % W, y = (i / W) | 0, d = Math.hypot(x - cx, y - cy);
  if (d < rMin) rMin = d; if (d > rMax) rMax = d;
  let best = null, bd = 1e9;
  for (const k in wedgeRef) { const c = wedgeRef[k]; const e = (c[0]-data[i*4])**2 + (c[1]-data[i*4+1])**2 + (c[2]-data[i*4+2])**2; if (e < bd) { bd = e; best = k; } }
  if (bd < 4000) ang[best].push(Math.atan2(y - cy, x - cx) * 180 / Math.PI);
}
const wedges = {};
for (const k in ang) {
  // circular mean via vector sum
  let vx = 0, vy = 0; for (const a of ang[k]) { vx += Math.cos(a*Math.PI/180); vy += Math.sin(a*Math.PI/180); }
  wedges[k] = +(Math.atan2(vy, vx) * 180 / Math.PI).toFixed(1);
}
const geo = {
  crop: CROP, out: OUT,
  wheel: { cx: +((cx - CROP.left) / CROP.size * 100).toFixed(2), cy: +((cy - CROP.top) / CROP.size * 100).toFixed(2), rOuter: +(rMax / CROP.size * 100).toFixed(2), rHub: +(rMin / CROP.size * 100).toFixed(2) },
  wedgeCentreDeg: wedges,
  srcWheel: { cx: +cx.toFixed(1), cy: +cy.toFixed(1), rMax: +rMax.toFixed(1), rMin: +rMin.toFixed(1) }
};

function premultiply(buf) {
  const o = Buffer.from(buf);
  for (let i = 0; i < o.length; i += 4) { const a = o[i+3] / 255; o[i] = Math.round(o[i] * a); o[i+1] = Math.round(o[i+1] * a); o[i+2] = Math.round(o[i+2] * a); }
  return o;
}
function unpremultiply(buf) {
  const o = Buffer.from(buf);
  for (let i = 0; i < o.length; i += 4) { const a = o[i+3]; if (a === 0) { o[i] = o[i+1] = o[i+2] = 0; continue; } const f = 255 / a; o[i] = Math.min(255, Math.round(o[i] * f)); o[i+1] = Math.min(255, Math.round(o[i+1] * f)); o[i+2] = Math.min(255, Math.round(o[i+2] * f)); }
  return o;
}
async function premultResize(rawBuf, w, h, tw, th) {
  const pm = premultiply(rawBuf);
  const r = await sharp(pm, { raw: { width: w, height: h, channels: 4 } }).resize(tw, th, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  return unpremultiply(r);
}
// crop to square
const crop = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).extract({ left: CROP.left, top: CROP.top, width: CROP.size, height: CROP.size }).raw().toBuffer();
const body = await premultResize(crop, CROP.size, CROP.size, OUT, OUT);
await sharp(body, { raw: { width: OUT, height: OUT, channels: 4 } }).png({ compressionLevel: 9 }).toFile('src/img/loord-mark.png');

// wheel layer: circular crop around the wheel centre at output scale
const k = OUT / CROP.size, R = Math.ceil(rMax * k + 1), D = R * 2;
const wcx = (cx - CROP.left) * k, wcy = (cy - CROP.top) * k;
const wl = Math.round(wcx - R), wt = Math.round(wcy - R);
const sub = Buffer.alloc(D * D * 4);
for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
  const sxp = wl + x, syp = wt + y, di = (y * D + x) * 4;
  const d = Math.hypot(sxp + .5 - wcx, syp + .5 - wcy);
  const si = (syp * OUT + sxp) * 4;
  const cover = Math.max(0, Math.min(1, R - d));
  sub[di] = body[si]; sub[di+1] = body[si+1]; sub[di+2] = body[si+2]; sub[di+3] = Math.round(body[si+3] * cover);
}
await sharp(sub, { raw: { width: D, height: D, channels: 4 } }).png({ compressionLevel: 9 }).toFile('src/img/loord-wheel.png');
geo.wheelPx = { size: D, left: wl, top: wt };
geo.wheel.sizePct = +(D / OUT * 100).toFixed(2);
geo.wheel.leftPct = +(wl / OUT * 100).toFixed(2);
geo.wheel.topPct = +(wt / OUT * 100).toFixed(2);
fs.writeFileSync('src/geometry.json', JSON.stringify(geo, null, 1));
console.log(JSON.stringify(geo));
