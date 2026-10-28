// 忍び足 — ホーム画面のアイコンを作る。node shinobi-ashi/tools/build_icons.mjs
// 図柄: 夜の空・月・足袋の足あと・巻物。キャラクターの絵も CryptoNinja の文字も入れない。
// SVG を Playwright（chromium）で描いて PNG にする:
//   icons/icon-192.png, icons/icon-512.png（purpose any）
//   icons/icon-maskable-512.png（purpose maskable。絵を中央 80% の安全な円の中に縮める）
//   icons/apple-touch-icon.png（180×180、透明なし）
//   icons/icon.svg（元の絵）
// アプリ（Capacitor）用。角丸なし・透明なし（前景だけ透明）。app で npx @capacitor/assets generate に使う:
//   icons/icon-1024.png（1024×1024、全面。iOS とストア用＝icon-only）
//   icons/icon-foreground-1024.png / icon-background-1024.png（Android のアダプティブアイコン。前景は中央 66% に収める）
//   icons/splash-2732.png（2732×2732。前景は中央。文字なし）
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

// 絵の部品（512×512 の座標）
function parts() {
  const prints = [
    [104, 446, 24, 1.15], [170, 396, 30, 1.05], [184, 322, 20, 0.95], [244, 280, 34, 0.86], [250, 214, 24, 0.76]
  ].map(([x, y, r, s], i) => tabi(x + (i % 2 ? 12 : -12), y, r + (i % 2 ? 6 : -6), s, '#f7f1e5')).join('');
  const stars = '<g fill="#f7f1e5"><circle cx="96" cy="96" r="4"/><circle cx="168" cy="58" r="3"/><circle cx="214" cy="140" r="2.6"/><circle cx="66" cy="200" r="2.6"/><circle cx="470" cy="300" r="3"/><circle cx="452" cy="40" r="2.6"/></g>';
  const hills =
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
  return { stars, hills, fore };
}
const SKY = '<defs><linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a4c78"/><stop offset="1" stop-color="#14263f"/></linearGradient></defs>';
// 前景（月・足あと・巻物）の中心は 512 座標でおよそ (270, 300)。scale 倍して中央に置く
function centered(fore, scale) {
  const t = 256 - 270 * scale, u = 256 - 300 * scale;
  return `<g transform="translate(${t} ${u}) scale(${scale})">${fore}</g>`;
}

// 512×512 の絵。mode:
//   'any'      … 全面（空・丘・前景）
//   'safe'     … 前景を中央 80% に縮める（maskable）
//   'fg'       … Android のアダプティブアイコンの前景（透明の上に前景だけ。中央 66% の安全域に収める）
//   'bg'       … アダプティブアイコンの背景（空・星・丘。前景なし）
function art(mode) {
  const { stars, hills, fore } = parts();
  let body;
  if (mode === 'fg') body = centered(fore, 0.6);
  else if (mode === 'bg') body = '<rect width="512" height="512" fill="url(#sky)"/>' + stars + hills;
  else body = '<rect width="512" height="512" fill="url(#sky)"/>' + stars + hills + (mode === 'safe' ? `<g transform="translate(51.2 51.2) scale(0.8)">${fore}</g>` : fore);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' + SKY + body + '</svg>';
}

// スプラッシュ 2732×2732（Capacitor の既定の大きさ）。端末の縦横比で四方が切られるので、
// 前景は中央（約 1000px 四方）に置き、空・星・丘は端まで描く。文字は入れない
function splash() {
  const { fore } = parts();
  const W = 2732;
  // 星は決まった並び（種を固定した擬似乱数。作り直しても同じ絵になる）
  let seed = 20261028;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let st = '<g fill="#f7f1e5">';
  for (let i = 0; i < 60; i++) {
    const x = Math.round(40 + rnd() * (W - 80)), y = Math.round(40 + rnd() * 2000), r = (3 + rnd() * 5).toFixed(1);
    st += `<circle cx="${x}" cy="${y}" r="${r}" opacity="${0.45 + (i % 5) * 0.12}"/>`;
  }
  st += '</g>';
  const hills =
    `<path d="M0 2200C500 2080 1000 2120 1450 2180S2300 2290 ${W} 2190V${W}H0Z" fill="#132541"/>` +
    `<path d="M0 2440C700 2340 1350 2390 1950 2450S2500 2480 ${W} 2460V${W}H0Z" fill="#0d1a30"/>`;
  const s = 2.4, cx = W / 2, cy = W / 2;
  const front = `<g transform="translate(${cx - 270 * s} ${cy - 300 * s}) scale(${s})">${fore}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}">` +
    '<defs><linearGradient id="sk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a4c78"/><stop offset="1" stop-color="#14263f"/></linearGradient></defs>' +
    `<rect width="${W}" height="${W}" fill="url(#sk2)"/>` + st + hills + front + '</svg>';
}

const outputs = [
  { file: 'icon-192.png', size: 192, mode: 'any' },
  { file: 'icon-512.png', size: 512, mode: 'any' },
  { file: 'icon-maskable-512.png', size: 512, mode: 'safe' },
  { file: 'apple-touch-icon.png', size: 180, mode: 'any' },
  // アプリ（Capacitor）用。@capacitor/assets の icon-only / icon-foreground / icon-background / splash に当たる
  { file: 'icon-1024.png', size: 1024, mode: 'any' },
  { file: 'icon-foreground-1024.png', size: 1024, mode: 'fg', transparent: true },
  { file: 'icon-background-1024.png', size: 1024, mode: 'bg' },
  { file: 'splash-2732.png', size: 2732, splash: true }
];

fs.writeFileSync(path.join(dir, 'icon.svg'), art('any') + '\n');
const browser = await chromium.launch();
try {
  for (const o of outputs) {
    const page = await browser.newPage({ viewport: { width: o.size, height: o.size }, deviceScaleFactor: 1 });
    const svg = o.splash ? splash() : art(o.mode).replace('width="512" height="512"', `width="${o.size}" height="${o.size}"`);
    const bg = o.transparent ? 'transparent' : '#14263f';
    await page.setContent(`<!doctype html><html><body style="margin:0;background:${bg}">${svg}</body></html>`);
    await page.screenshot({ path: path.join(dir, o.file), clip: { x: 0, y: 0, width: o.size, height: o.size }, omitBackground: !!o.transparent });
    await page.close();
    console.log('作成', path.join('icons', o.file), o.size + '×' + o.size);
  }
} finally {
  await browser.close();
}
