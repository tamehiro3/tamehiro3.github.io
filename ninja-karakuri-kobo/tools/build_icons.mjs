// アイコン（192・512・apple-touch 180）を作る（開発用）
//   node ninja-karakuri-kobo/tools/build_icons.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function loadPlaywright() {
  for (const t of [process.env.PLAYWRIGHT, 'playwright-core', 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) { try { return require(t); } catch (e) { /* 次へ */ } }
  throw new Error('playwright が見つかりません');
}
const { chromium } = loadPlaywright();
const A = require(path.join(ROOT, 'art.js'));
globalThis.NinjaArt = A;
const C = require(path.join(ROOT, 'chars.js'));

function gear(cx, cy, r, teeth, col, rot) {
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    const a = rot + i * Math.PI / teeth, rr = i % 2 ? r * 0.8 : r;
    const a0 = a - Math.PI / teeth * 0.45, a1 = a + Math.PI / teeth * 0.45;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a0) * rr).toFixed(1) + ' ' + (cy + Math.sin(a0) * rr).toFixed(1) + 'L' + (cx + Math.cos(a1) * rr).toFixed(1) + ' ' + (cy + Math.sin(a1) * rr).toFixed(1);
  }
  return `<path d="${d}Z" fill="${col}" stroke="#2b1d16" stroke-width="6" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy}" r="${r * 0.32}" fill="#4a2f25" stroke="#2b1d16" stroke-width="6"/>`;
}
const face = A.render(C.apprenticeArt('ai', 'short'), { pose: 'stand', yaw: -15, w: 300, h: 288, viewBox: '30 18 140 134', shadow: false, prop: false, companions: false }).replace('<svg ', '<svg x="106" y="110" ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs><radialGradient id="bg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#7a5236"/><stop offset="1" stop-color="#3a2419"/></radialGradient></defs>
<rect width="512" height="512" fill="url(#bg)"/>
${gear(256, 262, 206, 12, '#d8a63a', 0.1)}
${gear(420, 420, 70, 8, '#c8452c', 0.3)}
<circle cx="256" cy="262" r="150" fill="#f6ead6" stroke="#2b1d16" stroke-width="6"/>
${face}
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
