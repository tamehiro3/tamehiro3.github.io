// 忍び足 — ホーム画面のアイコンを作る。node shinobi-ashi/tools/build_icons.mjs
// 図柄: 夜の空・月・足袋の足あと・巻物。キャラクターの絵も CryptoNinja の文字も入れない。
// SVG を Playwright（chromium）で描いて PNG にする:
//   icons/icon-192.png, icons/icon-512.png（purpose any）
//   icons/icon-maskable-512.png（purpose maskable。絵を中央 80% の安全な円の中に縮める）
//   icons/apple-touch-icon.png（180×180、透明なし）
//   icons/icon.svg（元の絵）
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
fs.mkdirSync(dir, { recursive: true });

// 足袋の足あと（上向き、原点が足の真ん中）。親指と残りの指が分かれている
function tabi(x, y, rot, s, fill) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="${fill}">` +
    '<path d="M0 -24C12 -24 16 -12 14 0C12 10 9 16 9 24C9 33 5 38 0 38C-5 38 -9 33 -9 24C-9 16 -13 8 -14 -2C-15 -14 -11 -24 0 -24Z"/>' +
    '<ellipse cx="-7" cy="-34" rx="6" ry="7.5"/>' +
    '<ellipse cx="7.5" cy="-32" rx="8.5" ry="6.5" transform="rotate(12 7.5 -32)"/>' +
    '</g>';
}

// 512×512 の絵。safe=true なら前景（月・足あと・巻物）を中央 80% に縮める（maskable）。空と丘は端まで
function art(safe) {
  const prints = [
    [104, 446, 24, 1.15], [170, 396, 30, 1.05], [184, 322, 20, 0.95], [244, 280, 34, 0.86], [250, 214, 24, 0.76]
  ].map(([x, y, r, s], i) => tabi(x + (i % 2 ? 12 : -12), y, r + (i % 2 ? 6 : -6), s, '#f7f1e5')).join('');
  const back =
    '<g fill="#f7f1e5"><circle cx="96" cy="96" r="4"/><circle cx="168" cy="58" r="3"/><circle cx="214" cy="140" r="2.6"/><circle cx="66" cy="200" r="2.6"/><circle cx="470" cy="300" r="3"/><circle cx="452" cy="40" r="2.6"/></g>' +
    '<path d="M-10 400C90 360 190 372 280 392S440 430 522 400V522H-10Z" fill="#132541"/>' +
    '<path d="M-10 452C120 420 260 436 380 456S480 470 522 460V522H-10Z" fill="#0d1a30"/>';
  const fore =
    // 月と光
    '<circle cx="356" cy="150" r="128" fill="#f6e9c6" opacity=".10"/>' +
    '<circle cx="356" cy="150" r="104" fill="#f6e9c6" opacity=".14"/>' +
    '<circle cx="356" cy="150" r="82" fill="#f6e9c6"/>' +
    '<circle cx="330" cy="128" r="12" fill="#e6d6ad"/><circle cx="378" cy="176" r="18" fill="#e6d6ad"/><circle cx="388" cy="118" r="7" fill="#e6d6ad"/>' +
    // 足あと（丘の手前から月へ）
    prints +
    // ひらいた巻物（右下）: 左に巻いた表紙、右に軸、紙に縦の筆の線と朱の印
    '<g transform="translate(392 418) rotate(-8)">' +
    '<rect x="-44" y="-38" width="112" height="76" fill="#f7f1e5" stroke="#3b2a20" stroke-width="6" stroke-linejoin="round"/>' +
    '<path d="M44 -24V22M24 -24V14M4 -24V22" stroke="#3b2a20" stroke-width="7" stroke-linecap="round"/>' +
    '<rect x="-30" y="10" width="16" height="16" fill="#b0342b"/>' +
    '<rect x="64" y="-46" width="14" height="92" rx="6" fill="#c9a46a" stroke="#3b2a20" stroke-width="6"/>' +
    '<rect x="-74" y="-44" width="34" height="88" rx="15" fill="#b0342b" stroke="#3b2a20" stroke-width="6"/>' +
    '<path d="M-57 -44V44" stroke="#8a2620" stroke-width="5"/>' +
    '<rect x="-64" y="-58" width="14" height="14" rx="4" fill="#6a4228" stroke="#3b2a20" stroke-width="5"/>' +
    '<rect x="-64" y="44" width="14" height="14" rx="4" fill="#6a4228" stroke="#3b2a20" stroke-width="5"/>' +
    '</g>';
  const front = safe ? `<g transform="translate(51.2 51.2) scale(0.8)">${fore}</g>` : fore;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
    '<defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a4c78"/><stop offset="1" stop-color="#14263f"/></linearGradient></defs>' +
    '<rect width="512" height="512" fill="url(#sky)"/>' + back + front + '</svg>';
}

const outputs = [
  { file: 'icon-192.png', size: 192, safe: false },
  { file: 'icon-512.png', size: 512, safe: false },
  { file: 'icon-maskable-512.png', size: 512, safe: true },
  { file: 'apple-touch-icon.png', size: 180, safe: false }
];

fs.writeFileSync(path.join(dir, 'icon.svg'), art(false) + '\n');
const browser = await chromium.launch();
try {
  for (const o of outputs) {
    const page = await browser.newPage({ viewport: { width: o.size, height: o.size }, deviceScaleFactor: 1 });
    const svg = art(o.safe).replace('width="512" height="512"', `width="${o.size}" height="${o.size}"`);
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#14263f">${svg}</body></html>`);
    await page.screenshot({ path: path.join(dir, o.file), clip: { x: 0, y: 0, width: o.size, height: o.size }, omitBackground: false });
    await page.close();
    console.log('作成', path.join('icons', o.file), o.size + '×' + o.size);
  }
} finally {
  await browser.close();
}
