// Traces the 32x32 favicon from the real pixel grid of the logo asset.
// Each cell is the area-averaged colour of its block in the source, snapped to the nearest token colour,
// then horizontal runs of equal colour are merged into rects.
import fs from 'node:fs';
import sharp from 'sharp';

const tokens = {};
for (const m of fs.readFileSync('src/tokens.css', 'utf8').matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) tokens[m[1]] = m[2].toLowerCase();
const pal = ['paper', 'ink', 'orange', 'yellow', 'cobalt', 'magenta', 'green'].map(n => ({ n, h: tokens[n], c: [1, 3, 5].map(i => parseInt(tokens[n].slice(i, i + 2), 16)) }));
const N = 32, SIZE = 1060, CX = 1000, CY = 1000;
const { data } = await sharp('brand/LOGO LOORD PNG.png').removeAlpha()
  .extract({ left: CX - SIZE / 2, top: CY - SIZE / 2, width: SIZE, height: SIZE })
  .resize(N, N, { kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
const grid = [];
for (let y = 0; y < N; y++) {
  const row = [];
  for (let x = 0; x < N; x++) {
    const p = [0, 1, 2].map(k => data[(y * N + x) * 3 + k]);
    let best = pal[0], bd = 1e9;
    // low-chroma cells are paper/ink blends, never a wheel hue
    const chroma = Math.max(...p) - Math.min(...p);
    for (const q of (chroma < 60 ? pal.slice(0, 2) : pal.slice(2))) { const d = q.c.reduce((s, v, k) => s + (v - p[k]) ** 2, 0); if (d < bd) { bd = d; best = q; } }
    row.push(best.n);
  }
  grid.push(row);
}
const hex = n => tokens[n];
let rects = '';
for (let y = 0; y < N; y++) {
  let x = 0;
  while (x < N) {
    const n = grid[y][x]; let e = x;
    while (e + 1 < N && grid[y][e + 1] === n) e++;
    if (n !== 'paper') rects += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1" fill="${hex(n)}"/>`;
    x = e + 1;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" fill="${hex('paper')}"/>${rects}</svg>\n`;
fs.writeFileSync(process.env.FAVICON_OUT || 'src/favicon.svg', svg);
console.log(svg.length, 'bytes');
console.log(grid.map(r => r.map(n => ({ paper: '.', ink: '#', orange: 'o', yellow: 'y', cobalt: 'b', magenta: 'm', green: 'g' })[n]).join('')).join('\n'));
