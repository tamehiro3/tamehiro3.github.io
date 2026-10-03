// アイコン（192・512・apple-touch 180）を作る（開発用）
//   node ninja-sato-life/tools/build_icons.mjs
// 柴（公式に忠実な絵柄・約2.7頭身）が、月を背に里の地面に立つ絵。
// 必要：playwright-core と Chromium（PLAYWRIGHT_CORE・CHROME で場所を指定できる）
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const A = require(path.join(ROOT, 'art.js'));
globalThis.NinjaArt = A;
const C = require(path.join(ROOT, 'chars.js'));

// 人物は art.js の座標（足もと y=232）。上に 20 の余白をとって、足もとがアイコンの地面に来るように置く
const K = 2.02, fig = A.render(C.BY_ID.shiba.art, { pose: 'happy', yaw: 0, viewBox: '0 -20 200 260', w: Math.round(200 * K), h: Math.round(260 * K), shadow: false, prop: false, companions: false })
  .replace('<svg ', `<svg x="${Math.round(256 - 100 * K)}" y="${Math.round(492 - 252 * K)}" `);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e994e"/><stop offset=".86" stop-color="#507b3c"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e4939"/><stop offset="1" stop-color="#23392c"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#bg)"/>
<circle cx="256" cy="205" r="166" fill="#f3e3b8"/><circle cx="256" cy="205" r="146" fill="#fff6dc"/>
<rect y="442" width="512" height="70" fill="url(#gd)"/>
<ellipse cx="256" cy="494" rx="96" ry="14" fill="#1a2a20" opacity=".45"/>
${fig}
</svg>`;
const out = path.join(ROOT, 'icons');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log(name);
}
await browser.close();
