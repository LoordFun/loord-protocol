// Build: register.json + src/ -> dist/
// usage: node build.mjs [--register path] [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import { render } from './src/page.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REGISTER = opt('--register', 'register.json');
const OUT = opt('--out', 'dist');

const STATES = ['stated', 'absent', 'unconfirmed'];
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX40 = /^0x[0-9a-fA-F]{40}$/;
const INERT_KEYS = new Set(['id', 'label', 'state', 'source', 'scope', 'recordedOn']);

export function loadRegister(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const map = new Map();
  for (const r of raw.records) {
    if (map.has(r.id)) throw new Error(`register: duplicate id ${r.id}`);
    if (!STATES.includes(r.state)) throw new Error(`register: ${r.id} has bad state ${r.state}`);
    if (r.state !== 'stated') {
      for (const k of Object.keys(r)) if (!INERT_KEYS.has(k)) throw new Error(`register: inert record ${r.id} must not carry ${k}`);
    } else {
      if (!r.value && !r.url) throw new Error(`register: stated record ${r.id} needs a value or url`);
      if (r.url) {
        const u = new URL(r.url);
        if (u.protocol !== 'https:') throw new Error(`register: ${r.id} url must be https`);
        if (r.id === 'x' && !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(u.hostname)) throw new Error('register: x url must be on x.com');
        if (r.id === 'github' && !['github.com', 'www.github.com'].includes(u.hostname)) throw new Error('register: github url must be on github.com');
        if ((r.id === 'x' || r.id === 'github') && u.pathname.split('/').filter(Boolean).length < 1) throw new Error(`register: ${r.id} url has no handle`);
      }
      if (r.id === 'ca' && !(BASE58.test(r.value || '') || HEX40.test(r.value || ''))) throw new Error('register: ca value is not address-shaped');
    }
    map.set(r.id, r);
  }
  for (const id of ['chain', 'rpc', 'ca', 'x', 'github', 'market-source']) if (!map.has(id)) throw new Error(`register: missing ${id}`);
  return map;
}

export function build({ register = REGISTER, out = OUT } = {}) {
  const reg = loadRegister(register);
  const geo = JSON.parse(fs.readFileSync('src/geometry.json', 'utf8'));
  const tokens = fs.readFileSync('src/tokens.css', 'utf8');
  const theme = tokens.match(/--paper:\s*(#[0-9a-fA-F]{6})/)[1];

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'assets', 'js'), { recursive: true });

  fs.writeFileSync(path.join(out, 'index.html'), render({ reg, geo }).replace('__THEME__', theme));
  fs.copyFileSync('src/tokens.css', path.join(out, 'assets', 'tokens.css'));
  fs.copyFileSync('src/site.css', path.join(out, 'assets', 'site.css'));
  for (const f of fs.readdirSync('src/js')) fs.copyFileSync(path.join('src/js', f), path.join(out, 'assets', 'js', f));
  fs.copyFileSync('src/img/loord-mark.png', path.join(out, 'assets', 'loord-mark.png'));
  fs.copyFileSync('src/img/loord-wheel.png', path.join(out, 'assets', 'loord-wheel.png'));
  fs.copyFileSync('src/favicon.svg', path.join(out, 'favicon.svg'));
  const ms = reg.get('market-source');
  const connect = ms.state === 'stated' ? new URL(ms.url).origin : "'none'";
  const csp = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com", "img-src 'self' https: data:", `connect-src ${connect}`, "base-uri 'self'", "form-action 'none'", "frame-ancestors 'none'"].join("; ");
  fs.writeFileSync(path.join(out, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: ${csp}
`);
  return { reg, out };
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('build.mjs')) {
  const { out } = build();
  console.log(`built -> ${out}`);
}
