#!/usr/bin/env node
/* 忍び足 — ブラウザ版（shinobi-ashi/）の中身を Capacitor の www/ に写す。
 *
 *   node scripts/copy-web.mjs            … 写す（www/ は毎回作り直す）
 *   node scripts/copy-web.mjs --no-csp   … 通信を止める CSP の meta を入れない（調べもの用）
 *
 * 写すもの: index.html・*.js（sw.js を除く）・*.css・about.html・manifest.webmanifest・img/・icons/・vendor/
 * 写さないもの: sw.js（アプリでは Service Worker を使わない）・tools/・docs/・app/・README など
 * 足すもの:
 *   - capacitor.js（@capacitor/core の素の JS 版。registerPlugin を使えるようにする。ビルドなしのため）
 *   - www の HTML の先頭の <script> の前に capacitor.js を読む行
 *   - Content-Security-Policy（同じ場所のファイルだけを読む・外へ通信しない）
 * ブラウザ版のファイルそのものは変えない（www の写しだけを書き換える）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '..');            // shinobi-ashi/app
const SRC = path.resolve(APP, '..');             // shinobi-ashi
const OUT = path.join(APP, 'www');
const noCsp = process.argv.includes('--no-csp');

const FILE_RE = [/^index\.html$/, /^about\.html$/, /^manifest\.webmanifest$/, /\.js$/, /\.css$/];
const SKIP_FILES = new Set(['sw.js']);
const DIRS = ['img', 'icons', 'vendor'];

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ');

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) n += copyDir(a, b);
    else if (e.isFile()) { fs.copyFileSync(a, b); n++; }
  }
  return n;
}

function patchHtml(file) {
  let html = fs.readFileSync(file, 'utf8');
  const tag = '<script src="capacitor.js"></script>';
  if (!html.includes(tag)) {
    const i = html.search(/<script\b/i);
    if (i >= 0) html = html.slice(0, i) + tag + '\n  ' + html.slice(i);
    else html = html.replace(/<\/head>/i, '  ' + tag + '\n</head>');
  }
  if (!noCsp && !/http-equiv=["']Content-Security-Policy/i.test(html)) {
    const meta = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">';
    if (/<meta[^>]+charset[^>]*>/i.test(html)) html = html.replace(/(<meta[^>]+charset[^>]*>)/i, '$1\n  ' + meta);
    else html = html.replace(/<head[^>]*>/i, (m) => m + '\n  ' + meta);
  }
  fs.writeFileSync(file, html);
}

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });
let count = 0;
for (const e of fs.readdirSync(SRC, { withFileTypes: true })) {
  if (!e.isFile() || SKIP_FILES.has(e.name)) continue;
  if (!FILE_RE.some((re) => re.test(e.name))) continue;
  fs.copyFileSync(path.join(SRC, e.name), path.join(OUT, e.name));
  count++;
}
for (const d of DIRS) {
  const p = path.join(SRC, d);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) count += copyDir(p, path.join(OUT, d));
}

const core = path.join(APP, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js');
if (!fs.existsSync(core)) {
  console.error('[copy-web] @capacitor/core が見つかりません。先に app/ で npm install してください。');
  process.exit(1);
}
fs.copyFileSync(core, path.join(OUT, 'capacitor.js'));
count++;

const missing = [];
if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  missing.push('index.html');
  // まだ画面がないときでも cap sync が通るよう、仮のページを置く
  fs.writeFileSync(path.join(OUT, 'index.html'), '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>忍び足</title></head><body><p>index.html がまだありません。</p></body></html>\n');
}
for (const h of ['index.html', 'about.html']) {
  const f = path.join(OUT, h);
  if (fs.existsSync(f)) patchHtml(f);
}

console.log('[copy-web] ' + count + ' 個のファイルを ' + path.relative(process.cwd(), OUT) + '/ に写しました' + (noCsp ? '（CSP なし）' : ''));
if (missing.length) console.warn('[copy-web] 見つからないもの: ' + missing.join(', ') + '（仮のページを置きました）');
