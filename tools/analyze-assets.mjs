// Reads every brand and reference asset byte-wise: container header, alpha histogram, k-means palette.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dirs = ['brand', 'reference'];
const out = {};
function ihdr(buf) {
  if (buf.slice(1, 4).toString() !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25], interlace: buf[28] };
}
function jpegInfo(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps: buf[i + 9] };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
function kmeans(px, k, iters = 12) {
  const n = px.length / 3, step = Math.max(1, Math.floor(n / 40000));
  const pts = [];
  for (let i = 0; i < n; i += step) pts.push([px[i * 3], px[i * 3 + 1], px[i * 3 + 2]]);
  let cent = Array.from({ length: k }, (_, i) => pts[Math.floor((i + 0.5) * pts.length / k)].slice());
  let cnt = [];
  for (let it = 0; it < iters; it++) {
    const sum = cent.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let b = 0, bd = 1e9;
      cent.forEach((c, j) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; b = j; } });
      sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++;
    }
    cent = sum.map((s, j) => s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cent[j]);
    cnt = sum.map(s => s[3]);
  }
  return cent.map((c, j) => ({ c, share: cnt[j] / pts.length })).sort((a, b) => b.share - a.share);
}
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

for (const d of dirs) for (const f of fs.readdirSync(d)) {
  const p = path.join(d, f), buf = fs.readFileSync(p);
  const rec = { bytes: buf.length, magic: buf.slice(0, 4).toString('hex') };
  rec.png = ihdr(buf); if (!rec.png) rec.jpeg = jpegInfo(buf);
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, n = W * H;
  const hist = new Array(8).fill(0); let pureBlackTransparent = 0;
  const rgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3]; hist[a >> 5]++;
    if (a === 0 && data[i * 4] === 0 && data[i * 4 + 1] === 0 && data[i * 4 + 2] === 0) pureBlackTransparent++;
    rgb[i * 3] = data[i * 4]; rgb[i * 3 + 1] = data[i * 4 + 1]; rgb[i * 3 + 2] = data[i * 4 + 2];
  }
  rec.size = [W, H]; rec.alphaHist8 = hist; rec.pureBlackTransparentPx = pureBlackTransparent;
  // dominant exact pixels
  const m = new Map();
  for (let i = 0; i < n; i += 3) { const k = (rgb[i * 3] >> 3) << 10 | (rgb[i * 3 + 1] >> 3) << 5 | (rgb[i * 3 + 2] >> 3); m.set(k, (m.get(k) || 0) + 1); }
  rec.dominantBuckets = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => ({ k, share: +(v * 3 / n).toFixed(3) }));
  const km = kmeans(rgb, 7);
  rec.kmeans = km.map(({ c, share }) => {
    let bi = 0, bd = 1e12;
    for (let i = 0; i < n; i += 1) { const d = (rgb[i * 3] - c[0]) ** 2 + (rgb[i * 3 + 1] - c[1]) ** 2 + (rgb[i * 3 + 2] - c[2]) ** 2; if (d < bd) { bd = d; bi = i; } }
    return { share: +share.toFixed(3), snapped: hex(rgb[bi * 3], rgb[bi * 3 + 1], rgb[bi * 3 + 2]), at: [bi % W, Math.floor(bi / W)] };
  });
  out[p] = rec;
}
fs.writeFileSync(process.argv[2] || 'asset-report.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => k === 'dominantBuckets' ? undefined : v));
