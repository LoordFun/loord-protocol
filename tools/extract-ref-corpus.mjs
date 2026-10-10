// Pulls readable copy out of the downloaded reference bundle so the gate can compare word pairs.
// A small scanner walks the bundle and collects string literals; no regex backtracking involved.
import fs from 'node:fs';

const [js, html, out] = process.argv.slice(2);
const src = fs.readFileSync(js, 'utf8');
const lines = new Set();

for (let i = 0; i < src.length; i++) {
  const q = src[i];
  if (q !== '"' && q !== '`') continue;
  let j = i + 1, s = '';
  while (j < src.length && src[j] !== q) {
    if (src[j] === '\\') { s += src[j + 1] === 'n' ? ' ' : src[j + 1]; j += 2; continue; }
    if (src[j] === '\n' && q === '"') break;
    s += src[j++];
  }
  if (src[j] === q) i = j;
  if (s.length < 4 || s.length > 900) continue;
  if (!/[a-z]{2,}[ -][a-z]{2,}/i.test(s)) continue;
  if (/=>|function ?\(|return |\bconst |\bvar /.test(s)) continue;
  lines.add(s.replace(/·/g, ' '));
}
// second pass: any prose-looking run of text, to catch strings the scanner lost sync on
for (const m of src.matchAll(/[A-Za-z][A-Za-z0-9 ,.%$'’/+()·-]{20,300}/g)) {
  const t = m[0];
  if ((t.match(/ /g) || []).length >= 3 && !/[{};=]/.test(t)) lines.add(t.replace(/·/g, ' '));
}
const h = fs.readFileSync(html, 'utf8');
for (const m of h.matchAll(/content="([^"]+)"|<title>([^<]+)</g)) lines.add(m[1] || m[2]);
fs.writeFileSync(out, [...lines].join('\n'));
console.log(lines.size, 'lines');
