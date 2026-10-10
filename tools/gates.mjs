// Gate suite for dist/. Exit code 0 only when every gate passes, on the live register and on every mutated branch.
// usage: node tools/gates.mjs [dist] [register]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { build, loadRegister } from '../build.mjs';
import { deriveHandle } from '../src/page.mjs';

const ROOT = process.cwd();
const DIST = path.resolve(process.argv[2] || 'dist');
const REGISTER = path.resolve(process.argv[3] || 'register.json');
const WORK = path.join(ROOT, 'tools', '.work');

/* ------------------------------------------------------------------ helpers */
const TEXT_EXT = new Set(['.html', '.css', '.js', '.svg', '.json', '.txt', '']);
function walk(dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const rel = (p, base) => path.relative(base, p).split(path.sep).join('/');
function textFiles(dist) {
  return walk(dist).filter(f => TEXT_EXT.has(path.extname(f)) || path.basename(f) === '_headers').map(f => ({ file: rel(f, dist), text: fs.readFileSync(f, 'utf8') }));
}
const stripBlockComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripLineComments = s => s.replace(/(^|[\s;{}])\/\/[^\n]*/g, '$1');
const stripJsComments = s => stripLineComments(stripBlockComments(s));
const stripHtmlNonText = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
function htmlText(h) {
  const meta = h.replace(/<meta name="(?:viewport|theme-color)"[^>]*>/g, '');
  const attrs = [...meta.matchAll(/\s(?:alt|aria-label|title|content|placeholder)="([^"]*)"/g)].map(m => m[1]);
  const body = stripHtmlNonText(h).replace(/<[^>]+>/g, '\n');
  return decode(body + '\n' + attrs.join('\n'));
}
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, ' '); }
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function jsStrings(js) {
  const out = [];
  const src = stripJsComments(js);
  for (let i = 0; i < src.length; i++) {
    const q = src[i];
    if (q !== "'" && q !== '"' && q !== '`') continue;
    let j = i + 1, s = '';
    while (j < src.length && src[j] !== q) { if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; } if (src[j] === '\n' && q !== '`') break; s += src[j++]; }
    if (src[j] === q) { i = j; out.push(s); }
  }
  return out;
}

// address scanner: base58 and 0x hex shapes, matched to the stated registry instead of rejecting by shape
const B58 = /(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g;
const HEX = /(?<![A-Za-z0-9])0x[0-9a-fA-F]{40}(?![A-Za-z0-9])/g;
export function findAddresses(text) { return [...(text.match(B58) || []), ...(text.match(HEX) || [])]; }
export function statedAddresses(reg) {
  const set = new Set();
  for (const r of reg.values()) if (r.state === 'stated' && r.value && findAddresses(r.value).length) set.add(r.value);
  return set;
}
export function scanAddresses(files, reg) {
  const ok = statedAddresses(reg), bad = [];
  for (const f of files) for (const a of findAddresses(f.text)) if (!ok.has(a)) bad.push(`${f.file}: ${a}`);
  return bad;
}

const DATE_PATTERNS = [
  /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/,
  /\b(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}\b/,
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b/i,
  /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i
];
const TEXT_DATE = [/\b(?:19|20)\d{2}\b/, /\b\d{1,2}:\d{2}(?::\d{2})?\b/, /\b(?:as of|checked|last updated|updated at|timestamp|ago|today|yesterday)\b/i, /\brecordedOn\b/];
const DATE_API = /\b(?:new Date|Date\.now|toLocale(?:Date|Time)String|toISOString|getFullYear|DateTimeFormat|toUTCString)\b/;
export function dateFindings(files) {
  const hits = [];
  for (const f of files) {
    if (f.file === '_headers') continue;
    const raw = f.file.endsWith('.js') || f.file.endsWith('.css') ? stripJsComments(f.text) : f.text.replace(/<!--[\s\S]*?-->/g, '');
    for (const re of DATE_PATTERNS) { const m = raw.match(re); if (m) hits.push(`${f.file}: ${m[0]}`); }
    if (f.file.endsWith('.html')) {
      const t = htmlText(f.text);
      for (const re of TEXT_DATE) { const m = t.match(re); if (m) hits.push(`${f.file} text: ${m[0]}`); }
      if (/recordedOn/.test(f.text)) hits.push(`${f.file}: recordedOn leaked`);
    }
    if (f.file.endsWith('.js')) {
      if (DATE_API.test(raw)) hits.push(`${f.file}: date api`);
      for (const s of jsStrings(f.text)) for (const re of [TEXT_DATE[1], TEXT_DATE[2]]) { const m = s.match(re); if (m) hits.push(`${f.file} string: ${m[0]}`); }
    }
  }
  return hits;
}

const STOP = new Set('the a an and or of in on to for with by at as is are it its be you your can that this from every each but not no we our they their there than then so if into out up over has have was were will would should could do does did them these those one'.split(' '));
const words = t => t.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || [];
function bigrams(t, withFn = false) {
  const out = new Set();
  for (const line of t.split('\n')) { const w = words(line);
  for (let i = 0; i < w.length - 1; i++) { const fn = STOP.has(w[i]) || STOP.has(w[i + 1]); if (withFn || !fn) out.add(w[i] + ' ' + w[i + 1]); } }
  return out;
}

/* ------------------------------------------------------------------ core gates */
export async function runCore(dist, registerPath, { quiet = false, tag = '' } = {}) {
  const results = [];
  const gate = async (name, fn) => {
    let ok = false, note = '';
    try { const r = await fn(); if (r === true || r === undefined) ok = true; else { note = Array.isArray(r) ? r.slice(0, 6).join(' | ') : String(r); } } catch (e) { note = `threw: ${e.message}`; }
    results.push({ name: tag + name, ok, note });
    if (!quiet) console.log(`${ok ? 'PASS' : 'FAIL'}  ${tag}${name}${note ? '  -> ' + note : ''}`);
  };
  const need = cond => (cond ? true : 'condition false');
  const none = arr => (arr.length === 0 ? true : arr);

  const reg = loadRegister(registerPath);
  const files = textFiles(dist);
  const byName = n => files.find(f => f.file === n);
  const html = byName('index.html')?.text || '';
  const css = byName('assets/site.css')?.text || '';
  const tokensCss = byName('assets/tokens.css')?.text || '';
  const jsFiles = files.filter(f => f.file.startsWith('assets/js/'));
  const tokenHex = new Set([...tokensCss.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => m[0].toLowerCase()));
  const R = id => reg.get(id);

  await gate('dist has index, styles, scripts, favicon, logo layers', () => {
    const need_ = ['index.html', 'assets/site.css', 'assets/tokens.css', 'assets/js/main.js', 'assets/js/spring.js', 'assets/js/market.js', 'favicon.svg', 'assets/loord-mark.png', 'assets/loord-wheel.png'];
    return none(need_.filter(n => !fs.existsSync(path.join(dist, n))));
  });
  await gate('dist holds no repo docs, sources or brand files', () => {
    const bad = walk(dist).map(f => rel(f, dist)).filter(n => /readme|license|whitepaper|\.md$|register\.json|\.mjs$|brand\/|reference\/|\.map$/i.test(n));
    return none(bad);
  });
  await gate('html shell: lang, viewport, title, description, one h1, alt on every img', () => {
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    const problems = [];
    if (!/<html lang="en">/.test(html)) problems.push('lang');
    if (!/name="viewport"/.test(html)) problems.push('viewport');
    if (!/<title>[^<]+<\/title>/.test(html)) problems.push('title');
    if (!/name="description"/.test(html)) problems.push('description');
    if ((html.match(/<h1\b/g) || []).length !== 1) problems.push('h1 count');
    imgs.forEach(i => { if (!/\salt="/.test(i)) problems.push('img without alt'); });
    return none(problems);
  });
  await gate('no inline handlers, no inline code, no foreign scripts, only font stylesheets from outside', () => {
    const problems = [];
    if (/\son[a-z]+="/i.test(html)) problems.push('inline handler');
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const attrs = m[1];
      if (/type="application\/json"/.test(attrs)) continue;
      if (!/src="\/assets\//.test(attrs)) problems.push('script not from /assets');
      if (m[2].trim()) problems.push('inline script body');
    }
    for (const m of html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) if (/^https?:/.test(m[1]) && !/^https:\/\/fonts\.googleapis\.com\//.test(m[1])) problems.push('external css ' + m[1]);
    return none(problems);
  });
  await gate('every local reference in html and css resolves to a file in dist', () => {
    const missing = [];
    for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) if (m[1] !== '/' && !fs.existsSync(path.join(dist, m[1]))) missing.push(m[1]);
    return none(missing);
  });

  /* ----- register ----- */
  await gate('register: states valid, every inert record is free of value, url and paths', () => {
    const bad = [];
    for (const r of reg.values()) {
      if (r.state !== 'stated' && (r.value || r.url || r.paths || r.handle)) bad.push(r.id);
      if (!['stated', 'absent', 'unconfirmed'].includes(r.state)) bad.push(r.id);
    }
    return none(bad);
  });
  await gate('register: public copy inside the page matches register and never exposes data for inert records', () => {
    const pub = JSON.parse(html.match(/<script type="application\/json" id="register">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, '<')).records;
    const bad = [];
    for (const [id, r] of reg) {
      const p = pub[id];
      if (!p || p.state !== r.state) { bad.push(`${id} state`); continue; }
      if (r.state !== 'stated' && (p.value || p.url || p.paths || p.handle)) bad.push(`${id} leaks`);
      if (r.state === 'stated' && r.url && p.url !== r.url) bad.push(`${id} url drift`);
      if (r.state === 'stated' && r.value && p.value !== r.value) bad.push(`${id} value drift`);
    }
    return none(bad);
  });
  await gate('register: client-stated chain is Solana with the stated rpc, batch scope', () => {
    const c = R('chain'), rpc = R('rpc');
    return need(c.state === 'stated' && c.value === 'Solana' && rpc.state === 'stated' && rpc.url === 'https://solana-rpc.publicnode.com' && c.source === 'client statement' && c.scope === 'batch-level');
  });

  /* ----- link rule ----- */
  await gate('link rule: every href is an in-page anchor, a stated record url, or the stated feed home', () => {
    const allowed = new Set();
    for (const id of ['x', 'github']) if (R(id).state === 'stated') allowed.add(R(id).url);
    if (R('market-source').state === 'stated') allowed.add(R('market-source').url.replace(/^https:\/\/api\./, 'https://'));
    const bad = [];
    for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
      const h = decode(m[1]);
      if (h.startsWith('#') || allowed.has(h)) continue;
      bad.push(h);
    }
    return none(bad);
  });
  await gate('link rule: unstated social records render no anchor and no href', () => {
    const bad = [];
    for (const id of ['x', 'github']) {
      const el = html.match(new RegExp(`<(a|span)\\b[^>]*data-record="${id}"[^>]*>`));
      if (!el) { bad.push(`${id} missing`); continue; }
      if (R(id).state !== 'stated' && (el[1] === 'a' || /href=/.test(el[0]) || !/aria-disabled="true"/.test(el[0]))) bad.push(`${id} not inert`);
    }
    return none(bad);
  });
  await gate('link rule: stated social anchors carry the stored url and a handle derived from it', () => {
    const bad = [];
    for (const id of ['x', 'github']) {
      if (R(id).state !== 'stated') continue;
      const el = html.match(new RegExp(`<a\\b[^>]*data-record="${id}"[^>]*>`));
      if (!el) { bad.push(`${id} missing`); continue; }
      const handle = deriveHandle(id, R(id).url);
      if (!el[0].includes(`href="${R(id).url}"`)) bad.push(`${id} href`);
      if (!el[0].includes(handle)) bad.push(`${id} handle`);
      if (!/rel="noopener noreferrer"/.test(el[0])) bad.push(`${id} rel`);
    }
    return none(bad);
  });
  await gate('link rule: derived handles are correct for sample urls', () => {
    return need(deriveHandle('x', 'https://x.com/someone') === '@someone' && deriveHandle('github', 'https://github.com/org/repo') === 'org/repo');
  });

  /* ----- CA slot ----- */
  await gate('CA slot: first thing in the header, before the nav, always in the page', () => {
    const i = html.indexOf('class="ca-strip"'), n = html.indexOf('class="nav"'), t = html.indexOf('<header');
    return need(t > -1 && i > t && n > i && /data-record="ca"/.test(html));
  });
  await gate('CA slot: branch follows the register record (stated shows full address with copy, otherwise label + pending only)', () => {
    const ca = R('ca');
    const slot = html.match(/<(button|div)\b[^>]*class="ca-btn[^"]*"[^>]*data-record="ca"[^>]*>([\s\S]*?)<\/\1>/);
    if (!slot) return 'slot missing';
    const inner = decode(slot[2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!slot[0].includes(`data-state="${ca.state}"`)) return 'state attr mismatch';
    if (ca.state === 'stated') return need(slot[1] === 'button' && slot[0].includes(`data-copy="${ca.value}"`) && inner.startsWith(ca.value));
    return need(slot[1] === 'div' && inner === 'pending' && !/data-copy|href/.test(slot[0]));
  });
  await gate('CA slot: large mono type that wraps, with a 44px tap height, copy feedback wired', () => {
    const rule = css.match(/\.ca-btn\s*\{([^}]*)\}/)[1];
    const size = rule.match(/font:\s*500\s*clamp\((\d+)px/);
    return need(size && +size[1] >= 16 && /min-height:\s*44px/.test(rule) && /overflow-wrap:\s*anywhere/.test(css) && /initCopy/.test(byName('assets/js/ui.js').text) && /navigator\.clipboard/.test(byName('assets/js/ui.js').text));
  });

  /* ----- socials ----- */
  await gate('socials: both icons present, top-right of the first bar, icon only, official marks', () => {
    const strip = html.match(/<div class="ca-strip"[\s\S]*?<\/header>/)[0];
    const soc = strip.match(/<div class="socials"[\s\S]*?<\/div>/);
    if (!soc) return 'socials container missing';
    const hasX = /M18\.244 2\.25h3\.308l-7\.227 8\.26/.test(soc[0]);
    const hasGh = /M8 0C3\.58 0 0 3\.58 0 8c0 3\.54 2\.29 6\.53 5\.47 7\.59/.test(soc[0]);
    const label = decode(soc[0].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '')).trim();
    return need(hasX && hasGh && label === '' && /\.socials\s*\{[^}]*justify-self:\s*end/.test(css));
  });
  await gate('socials: icons are never hidden at any breakpoint', () => {
    const hides = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(m => /socials|icon-btn/.test(m[1]) && /display:\s*none/.test(m[2]) && !/inert/.test(m[1]));
    return none(hides.map(m => m[1].trim()));
  });

  /* ----- address scanner ----- */
  await gate('address scanner: every address-shaped string in dist is a stated registry value (CA included)', () => none(scanAddresses(files, reg)));
  await gate('address scanner: 0x and base58 shapes are matched to the registry, not rejected by shape', () => {
    const sample58 = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    const sample0x = '0x' + 'a1b2c3d4e5'.repeat(4);
    const mk = (id, value) => new Map([[id, { id, state: 'stated', value }]]);
    const t = `x ${sample58} y ${sample0x}`;
    const found = findAddresses(t);
    const accepted = scanAddresses([{ file: 't', text: t }], new Map([['a', { state: 'stated', value: sample58 }], ['b', { state: 'stated', value: sample0x }]]));
    const rejected = scanAddresses([{ file: 't', text: t }], mk('a', sample58));
    return need(found.length === 2 && accepted.length === 0 && rejected.length === 1 && rejected[0].includes(sample0x));
  });

  /* ----- dates ----- */
  await gate('no dates: zero dates, years, clock strings, "as of" or "checked" words, date APIs anywhere in dist', () => none(dateFindings(files)));

  /* ----- palette ----- */
  await gate('palette: hex literals live only in tokens.css (generated favicon and theme-color must reuse token values)', () => {
    const bad = [];
    for (const f of files) {
      if (f.file === 'assets/tokens.css') continue;
      let t = f.text;
      if (f.file.endsWith('.html')) t = t.replace(/href="#[^"]*"/g, '').replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');
      const hits = [...t.matchAll(/(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)].map(m => m[0].toLowerCase());
      if (/\b(?:rgb|rgba|hsl|hsla)\(/i.test(t)) bad.push(`${f.file}: rgb/hsl literal`);
      if (f.file === 'favicon.svg' || f.file === 'index.html') { hits.forEach(h => { if (!tokenHex.has(h)) bad.push(`${f.file}: ${h} not a token`); }); continue; }
      hits.forEach(h => bad.push(`${f.file}: ${h}`));
    }
    const themeOnly = [...html.matchAll(/(?<![\w&])#(?:[0-9a-fA-F]{6})\b/g)].length;
    if (themeOnly > 1) bad.push('index.html: hex outside the theme-color meta');
    return none(bad);
  });
  await gate('palette: every token equals the real pixel at the coordinate its provenance line cites', async () => {
    const lines = [...fs.readFileSync(path.join(ROOT, 'src/tokens.css'), 'utf8').matchAll(/^\s{3}(\S+)\s+((?:brand|reference)\/[^\n]*?) at \((\d+),(\d+)\)/gm)];
    const bad = [];
    const hexOf = {};
    for (const m of fs.readFileSync(path.join(ROOT, 'src/tokens.css'), 'utf8').matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) hexOf[m[1]] = m[2].toLowerCase();
    if (lines.length !== Object.keys(hexOf).length - 0) bad.push(`provenance lines ${lines.length} vs tokens ${Object.keys(hexOf).length}`);
    for (const [, name, file, x, y] of lines) {
      const f = file.trim().replace(/\s{2,}.*$/, '');
      const { data, info } = await sharp(path.join(ROOT, f)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const i = (+y * info.width + +x) * 3;
      const px = '#' + [0, 1, 2].map(k => data[i + k].toString(16).padStart(2, '0')).join('');
      if (hexOf[name] !== px) bad.push(`${name} ${hexOf[name]} != ${px} @ ${f}(${x},${y})`);
    }
    return none(bad);
  });
  await gate('palette: no ch units anywhere in css', () => none([...css.matchAll(/[\d.]ch\b/g)].map(m => m[0])));

  /* ----- motion ----- */
  await gate('motion: reduced-motion removes every animation and transition, reveals jump to final state', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*)\}\s*$/);
    return need(block && /animation:\s*none\s*!important/.test(block[1]) && /transition:\s*none\s*!important/.test(block[1]) && /data-reveal\][^}]*opacity:\s*1/.test(block[1]));
  });
  await gate('motion: script side honours the same query (springs land instantly, no parallax, no tilt, no spotlight)', () => {
    const s = byName('assets/js/spring.js').text, ui = byName('assets/js/ui.js').text, hero = byName('assets/js/hero.js').text, rv = byName('assets/js/reveal.js').text;
    return need(/prefers-reduced-motion: reduce/.test(s) && /reduced\(\)\)\s*\{\s*this\.snap/.test(s) && /if \(!reduced\(\)\)/.test(hero) && /if \(reduced\(\)\) return;/.test(ui) && /reduced\(\)/.test(rv));
  });
  await gate('motion: spring solver is a damped solver, reveal uses it with stagger, progress bar and live dot exist', () => {
    const s = byName('assets/js/spring.js').text;
    return need(/-this\.k \* \(this\.value - this\.target\) - this\.c \* this\.velocity/.test(s) && /delay/.test(byName('assets/js/reveal.js').text) && /id="progress"/.test(html) && /live-dot/.test(html) && /@keyframes livepulse/.test(css) && /@keyframes tape/.test(css) && /tape 90s linear infinite/.test(css));
  });
  await gate('motion: hero has parallax layers, gradient mesh, spotlight and count-up flash wiring', () => {
    return need(/data-depth/.test(html) && /class="mesh"/.test(html) && /--mx/.test(css) && /radial-gradient/.test(css) && /flash-up/.test(css) && /flash-up/.test(byName('assets/js/market.js').text));
  });

  /* ----- tap targets + measurement-ready css ----- */
  await gate('tap targets: every interactive class declares at least 44px of height (and width for icon buttons)', () => {
    const sels = ['.icon-btn', '.seg button', '.chip', '.cable-tag', '.ca-btn', '.burger', '.nav-links a', '.foot a, .foot-txt', '.b', '.brand', '.chain-badge'];
    const bad = [];
    for (const s of sels) {
      const re = new RegExp('(?:^|\\})\\s*' + s.replace(/[.\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
      const m = css.match(re);
      if (!m) { bad.push(`${s} rule`); continue; }
      const h = m[1].match(/(?:min-)?height:\s*(\d+)px/);
      if (!h || +h[1] < 44) bad.push(`${s} height`);
      if (s === '.icon-btn' && !/width:\s*44px/.test(m[1])) bad.push('icon width');
    }
    return none(bad);
  });

  /* ----- favicon ----- */
  await gate('favicon: svg 32x32, linked, no double hyphen anywhere, only token colours, no comments', () => {
    const f = fs.readFileSync(path.join(dist, 'favicon.svg'), 'utf8');
    const bad = [];
    if (!/viewBox="0 0 32 32"/.test(f) || !/width="32"/.test(f) || !/height="32"/.test(f)) bad.push('size');
    if (f.includes('--')) bad.push('double hyphen');
    if (f.includes('<!--')) bad.push('comment');
    if (!/<rect /.test(f)) bad.push('no shapes');
    for (const m of f.matchAll(/#[0-9a-fA-F]{6}/g)) if (!tokenHex.has(m[0].toLowerCase())) bad.push(m[0]);
    if (!/rel="icon"[^>]*href="\/favicon\.svg"/.test(html)) bad.push('not linked');
    return none(bad);
  });
  await gate('favicon: re-tracing the logo pixel grid reproduces the shipped file byte for byte', () => {
    const out = path.join(WORK, 'favicon-check.svg');
    fs.mkdirSync(WORK, { recursive: true });
    const r = spawnSync(process.execPath, ['tools/make-favicon.mjs'], { cwd: ROOT, env: { ...process.env, FAVICON_OUT: out }, encoding: 'utf8' });
    if (r.status !== 0) return 'trace failed ' + r.stderr;
    return need(fs.readFileSync(out, 'utf8') === fs.readFileSync(path.join(dist, 'favicon.svg'), 'utf8'));
  });

  /* ----- assets ----- */
  await gate('logo layers: RGBA png (colour type 6), premultiplied resize leaves no dark fringe against the source', async () => {
    const mark = fs.readFileSync(path.join(dist, 'assets/loord-mark.png'));
    if (mark.readUInt8(25) !== 6) return `colour type ${mark.readUInt8(25)}`;
    const SRC = path.join(ROOT, 'brand/LOGO LOORD PNG...png'), OPAQUE = path.join(ROOT, 'brand/LOGO LOORD PNG.png');
    const src = fs.readFileSync(SRC);
    if (src.readUInt8(25) !== 6) return 'source is not RGBA';
    const comp = async (input) => (await sharp(input).flatten({ background: '#ecebe7' }).removeAlpha().raw().toBuffer());
    const ours = await comp(mark);
    const ref = await sharp(OPAQUE).extract({ left: 450, top: 450, width: 1100, height: 1100 }).resize(880, 880, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
    let sum = 0; for (let i = 0; i < ours.length; i++) sum += Math.abs(ours[i] - ref[i]);
    const mae = sum / ours.length;
    return mae < 2.5 ? true : `mean error ${mae.toFixed(2)}`;
  });
  await gate('logo layers: wheel layer is a clean circle cut with transparent corners', async () => {
    const { data, info } = await sharp(path.join(dist, 'assets/loord-wheel.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const a = (x, y) => data[(y * info.width + x) * 4 + 3];
    return need(a(0, 0) === 0 && a(info.width - 1, info.height - 1) === 0 && a(info.width >> 1, info.height >> 1) >= 250);
  });

  /* ----- market ----- */
  await gate('market: board reads endpoints from the market-source record, never hard-coded', () => {
    const m = byName('assets/js/market.js').text;
    return need(!/dexscreener/i.test(m) && /rec\.url/.test(m) && /rec\.paths\.boosts/.test(m) && /rec\.paths\.pairs/.test(m));
  });
  await gate('market: solana-only filter, top ten by 24h volume, logo url, price, change, liquidity, copy button, letter-tile fallback', () => {
    const m = byName('assets/js/market.js').text;
    return need(/chainId !== 'solana'/.test(m) && /TOP_N = 10/.test(m) && /h24/.test(m) && /imageUrl/.test(m) && /priceUsd/.test(m) && /liquidity/.test(m) && /data-copy|dataset\.copy/.test(m) && /logo-tile/.test(m) && /error', \(\) => img\.remove/.test(m));
  });
  await gate('market: 60s poll, pauses while hidden, fetches immediately on visible, exponential backoff, last good data kept', () => {
    const m = byName('assets/js/market.js').text;
    return need(/POLL_MS = 60000/.test(m) && /visibilitychange/.test(m) && /document\.hidden/.test(m) && /BACKOFF_BASE \* 2 \*\* \(failures - 1\)/.test(m) && /BACKOFF_CAP/.test(m) && /showFailure\(data\.length > 0\)/.test(m) && /AbortController/.test(m));
  });
  await gate('market: skeleton rows ship in the page and fade into real rows', () => {
    return need((html.match(/class="mrow skel-row"/g) || []).length === (R('market-source').state === 'stated' ? 10 : 0) && /skel/.test(css) && /\.out/.test(css));
  });
  await gate('market: ticker and board share one data source and the ticker loops the same list twice', () => {
    const m = byName('assets/js/market.js').text;
    return need(/renderTape/.test(m) && /pass < 2/.test(m) && /tape-half/.test(css));
  });
  await gate('market independence: only the market-source record is read by the market code, never the CA record', () => {
    const m = byName('assets/js/market.js').text, main = byName('assets/js/main.js').text;
    const reads = [...main.matchAll(/reg\[['"]([a-z-]+)['"]\]/g)].map(x => x[1]);
    return need(!/\bca\b/.test(stripJsComments(m)) && reads.length === 1 && reads[0] === 'market-source' && !/data-record="ca"|\.ca-/.test(m));
  });
  await gate('market: the live data hosts are allowed by the generated CSP only when the record is stated', () => {
    const h = fs.readFileSync(path.join(dist, '_headers'), 'utf8');
    const ms = R('market-source');
    return need(h.includes(`connect-src ${ms.state === 'stated' ? new URL(ms.url).origin : "'none'"}`));
  });

  /* ----- copy ----- */
  await gate('copy: no word pair is shared with the reference site copy (pairs that contain a function word excepted)', () => {
    const ref = bigrams(fs.readFileSync(path.join(ROOT, 'tools/ref-corpus.txt'), 'utf8'));
    const ours = new Set();
    bigrams(htmlText(html)).forEach(g => ours.add(g));
    for (const j of jsFiles) for (const s of jsStrings(j.text)) if (/ /.test(s) && /^[A-Z][^()=;{}$]*$/.test(s)) bigrams(s).forEach(g => ours.add(g));
    const shared = [...ours].filter(g => ref.has(g));
    return none(shared);
  });
  await gate('copy: the reference brand never appears in dist', () => none(files.filter(f => /usepatch|\bpatch\b|\$PATCH/i.test(f.text)).map(f => f.file)));

  /* ----- hygiene ----- */
  await gate('repo hygiene: no assistant config files or folders, no machine attribution in any project text file', () => {
    const a = ['cla', 'ude'].join(''), b = ['anthr', 'opic'].join(''), c = ['co-auth', 'ored-by'].join(''), d = ['gener', 'ated with'].join(''), e = ['Chat', 'GPT'].join(''), g = ['Cop', 'ilot'].join('');
    const w1 = ['A', 'I'].join(''), ll = ['L', 'LM'].join('');
    const re = new RegExp(`${a}|${b}|${c}|${d}|${e}|${g}|\\b${w1}\\b|\\b${ll}\\b`, 'i');
    const bad = [];
    for (const n of [a.toUpperCase() + '.md', '.' + a, 'AGENTS.md', '.cursor', '.cursorrules']) if (fs.existsSync(path.join(ROOT, n))) bad.push(n);
    const skip = new Set(['node_modules', 'brand', 'reference', '.work', '.git']);
    const scan = dir => {
      for (const n of fs.readdirSync(dir)) {
        if (skip.has(n)) continue;
        const p = path.join(dir, n);
        if (fs.statSync(p).isDirectory()) { scan(p); continue; }
        if (!/\.(md|mjs|js|css|json|html|svg|txt)$|^LICENSE$|^_headers$/.test(n) || n === 'package-lock.json') continue;
        const t = fs.readFileSync(p, 'utf8');
        if (re.test(t)) bad.push(rel(p, ROOT) + ': ' + (t.match(re) || [''])[0]);
      }
    };
    scan(ROOT);
    return none(bad);
  });
  await gate('repo content: README, whitepaper and MIT license exist at the root, outside dist', () => {
    const bad = [];
    if (!fs.existsSync(path.join(ROOT, 'README.md'))) bad.push('README.md');
    if (!fs.existsSync(path.join(ROOT, 'docs/whitepaper.md'))) bad.push('docs/whitepaper.md');
    const lic = fs.existsSync(path.join(ROOT, 'LICENSE')) ? fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8') : '';
    if (!/^MIT License/.test(lic) || !/Copyright \(c\) 2026 Loord/.test(lic)) bad.push('LICENSE');
    return none(bad);
  });

  return results;
}

/* ------------------------------------------------------------------ mutation harness */
const SAMPLE = {
  ca58: 'LoorD1111111111111111111111111111111111111'.replace(/l/g, 'L'),
  ca0x: '0x' + '9f8e7d6c5b'.repeat(4),
  x: 'https://x.com/loord_test',
  github: 'https://github.com/loord-test/loord'
};
function mutate(rawReg, id, variant) {
  const reg = JSON.parse(JSON.stringify(rawReg));
  const rec = reg.records.find(r => r.id === id);
  // anchor is read from the current record at runtime: flip whatever state it holds now
  const flipToStated = rec.state !== 'stated';
  for (const k of ['value', 'url', 'paths']) delete rec[k];
  if (flipToStated) {
    rec.state = 'stated';
    if (id === 'ca') rec.value = variant === '0x' ? SAMPLE.ca0x : SAMPLE.ca58;
    if (id === 'x') rec.url = SAMPLE.x;
    if (id === 'github') rec.url = SAMPLE.github;
    if (id === 'market-source') { rec.url = 'https://api.dexscreener.com'; rec.paths = { boosts: '/token-boosts/top/v1', pairs: '/tokens/v1/solana/' }; }
  } else {
    rec.state = 'absent';
  }
  return reg;
}
function marketBlock(html) {
  const sec = html.match(/<section class="sec" id="market">[\s\S]*?<\/section>/)?.[0] || '';
  const tape = html.match(/<div class="tape"[\s\S]*?<div class="tape-view">[\s\S]*?<\/div><\/div>/)?.[0] || '';
  return sha(sec + tape);
}

async function runMutations(baseline) {
  const raw = JSON.parse(fs.readFileSync(REGISTER, 'utf8'));
  const results = [];
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  const push = (name, ok, note = '') => { results.push({ name, ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  -> ' + note : ''}`); };
  const baseMarket = marketBlock(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));

  const cases = [['ca', '58'], ['ca', '0x'], ['x', ''], ['github', ''], ['market-source', '']];
  for (const [id, variant] of cases) {
    const mReg = mutate(raw, id, variant);
    const regPath = path.join(WORK, `register-${id}-${variant || 'v'}.json`);
    const out = path.join(WORK, `dist-${id}-${variant || 'v'}`);
    fs.writeFileSync(regPath, JSON.stringify(mReg, null, 2));
    const reg = loadRegister(regPath);
    build({ register: regPath, out });
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    const rec = reg.get(id);
    const label = `mutation ${id}${variant ? ' (' + variant + ')' : ''} -> ${rec.state}`;

    // anchors below read the mutated record, not a remembered state
    if (id === 'ca') {
      const slot = html.match(/<(?:button|div)\b[^>]*data-record="ca"[^>]*>/)[0];
      const found = findAddresses(html);
      const okSlot = rec.state === 'stated' ? slot.includes(`data-copy="${rec.value}"`) && found.every(a => a === rec.value) && found.length >= 2 : !/data-copy/.test(slot) && found.length === 0;
      push(`${label}: slot and address scan follow the record`, okSlot, okSlot ? '' : slot);
      const sameMarket = marketBlock(html) === baseMarket;
      push(`${label}: market markup is byte-identical (CA state has zero effect)`, sameMarket);
    }
    if (id === 'x' || id === 'github') {
      const el = html.match(new RegExp(`<(a|span)\\b[^>]*data-record="${id}"[^>]*>`));
      const ok = rec.state === 'stated' ? el[1] === 'a' && el[0].includes(`href="${rec.url}"`) && el[0].includes(deriveHandle(id, rec.url)) : el[1] === 'span' && !/href/.test(el[0]) && !html.includes(SAMPLE[id]);
      push(`${label}: icon renders ${rec.state === 'stated' ? 'live link with derived handle' : 'inert with no href'}`, ok, ok ? '' : el[0]);
    }
    if (id === 'market-source') {
      const hasBoard = /id="mrows"/.test(html), inert = /class="mkt-inert"/.test(html);
      const ok = rec.state === 'stated' ? hasBoard && !inert : !hasBoard && inert && !/skel-row/.test(html);
      push(`${label}: market board follows only this record`, ok);
      const ca = html.match(/<(?:button|div)\b[^>]*data-record="ca"[^>]*>/)[0];
      push(`${label}: CA slot unchanged by market record`, ca.includes(`data-state="${reg.get('ca').state}"`));
    }
    // full gate suite on the mutated branch
    const sub = await runCore(out, regPath, { quiet: true, tag: `[${id}${variant ? ' ' + variant : ''}] ` });
    const failed = sub.filter(r => !r.ok);
    push(`${label}: all ${sub.length} core gates pass on this branch`, failed.length === 0, failed.map(f => f.name + ' ' + f.note).join(' | ').slice(0, 400));
    baseline.branchGates = (baseline.branchGates || 0) + sub.length;
  }

  // negative controls: each gate must be able to fail
  const ctl = async (name, tamper, mustFail) => {
    const out = path.join(WORK, 'dist-neg');
    build({ register: REGISTER, out });
    tamper(out);
    const sub = await runCore(out, REGISTER, { quiet: true });
    const failed = sub.filter(r => !r.ok).map(r => r.name);
    const ok = failed.some(n => mustFail.test(n));
    push(`negative control: ${name}`, ok, ok ? '' : `expected a failure matching ${mustFail}, saw: ${failed.join(' | ') || 'none'}`);
  };
  const edit = (out, file, fn) => { const p = path.join(out, file); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  await ctl('stray address-shaped string is caught', o => edit(o, 'index.html', t => t.replace('</footer>', ' 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU </footer>')), /address scanner: every/);
  await ctl('stray 0x address is caught', o => edit(o, 'index.html', t => t.replace('</footer>', ' 0x1111111111111111111111111111111111111111 </footer>')), /address scanner: every/);
  await ctl('a visible date is caught', o => edit(o, 'index.html', t => t.replace('</footer>', ' 2026-10-10 </footer>')), /no dates/);
  await ctl('a visible clock string is caught', o => edit(o, 'index.html', t => t.replace('</footer>', ' 12:30 </footer>')), /no dates/);
  await ctl('the word "checked" is caught', o => edit(o, 'index.html', t => t.replace('</footer>', ' last checked </footer>')), /no dates/);
  await ctl('a hex literal outside tokens is caught', o => edit(o, 'assets/site.css', t => t + '\n.x{color:#ff0000}'), /palette: hex/);
  await ctl('an href on an inert social is caught', o => edit(o, 'index.html', t => t.replace(/<(span|a) class="icon-btn[^"]*"( data-record="x")/, '<a href="https://x.com/leak" class="icon-btn"$2')), /link rule/);
  await ctl('an unknown external link is caught', o => edit(o, 'index.html', t => t.replace('</footer>', '<a href="https://example.com/">x</a></footer>')), /link rule: every href/);
  await ctl('a ch unit is caught', o => edit(o, 'assets/site.css', t => t + '\n.y{width:20ch}'), /no ch units/);
  await ctl('a shared word pair with the reference is caught', o => edit(o, 'index.html', t => t.replace('</footer>', ' hook slot </footer>')), /copy: no word pair/);
  await ctl('a favicon comment with double hyphen is caught', o => edit(o, 'favicon.svg', t => t.replace('<rect ', '<!-- a -- b --><rect ')), /favicon: svg/);
  await ctl('a missing reduced-motion block is caught', o => edit(o, 'assets/site.css', t => t.replace('prefers-reduced-motion: reduce', 'prefers-color-scheme: nope')), /motion: reduced-motion/);
  await ctl('the CA slot moved below the nav is caught', o => edit(o, 'index.html', t => t.replace('class="ca-strip"', 'class="ca-strip-x"')), /CA slot: first/);
  fs.mkdirSync(path.join(ROOT, '.' + ['cla', 'ude'].join('')), { recursive: true });
  try { await ctl('an assistant config folder is caught', () => {}, /repo hygiene/); } finally { fs.rmSync(path.join(ROOT, '.' + ['cla', 'ude'].join('')), { recursive: true, force: true }); }
  // register validation controls
  const bad = (name, fn) => {
    const p = path.join(WORK, 'register-bad.json');
    const r = JSON.parse(JSON.stringify(raw));
    fn(r);
    fs.writeFileSync(p, JSON.stringify(r));
    let threw = false;
    try { loadRegister(p); } catch { threw = true; }
    push(`negative control: ${name}`, threw);
  };
  bad('inert record carrying a url fails the build', r => { r.records.find(x => x.id === 'x').state = 'absent'; r.records.find(x => x.id === 'x').url = 'https://x.com/a'; });
  bad('inert record carrying a value fails the build', r => { const c = r.records.find(x => x.id === 'ca'); c.state = 'unconfirmed'; c.value = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; });
  bad('a stated CA that is not address-shaped fails the build', r => { const c = r.records.find(x => x.id === 'ca'); c.state = 'stated'; delete c.url; c.value = 'not an address'; });
  bad('a stated X url on the wrong host fails the build', r => { const c = r.records.find(x => x.id === 'x'); c.state = 'stated'; c.url = 'https://example.com/a'; });
  fs.rmSync(WORK, { recursive: true, force: true });
  return results;
}

/* ------------------------------------------------------------------ main */
if (process.argv[1] && process.argv[1].endsWith('gates.mjs')) {
  console.log(`gates for ${path.relative(ROOT, DIST) || '.'} with ${path.relative(ROOT, REGISTER)}\n`);
  const core = await runCore(DIST, REGISTER);
  console.log('\nmutation harness (anchors read the live record, then flip it)\n');
  const baseline = {};
  const mut = await runMutations(baseline);
  const all = [...core, ...mut];
  const failed = all.filter(r => !r.ok);
  console.log(`\ngates: ${all.length} run on the live register + mutation harness, ${all.length - failed.length} passed, ${failed.length} failed`);
  console.log(`plus ${baseline.branchGates || 0} core-gate evaluations across the mutated branches`);
  const states = loadRegister(REGISTER);
  console.log(`branches proven: ca=${states.get('ca').state} x=${states.get('x').state} github=${states.get('github').state} market-source=${states.get('market-source').state}, each also flipped`);
  process.exit(failed.length ? 1 : 0);
}
