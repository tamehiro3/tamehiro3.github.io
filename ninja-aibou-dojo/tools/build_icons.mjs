// アイコン（相棒の見本の顔）を作る（開発用）
//   PLAYWRIGHT_CORE=... CHROME=... node ninja-aibou-dojo/tools/build_icons.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const A = require(path.join(ROOT, 'art.js')); globalThis.NinjaArt = A;
const C = require(path.join(ROOT, 'chars.js'));
const def = C.partnerArt({ outfit: 'ai', hair: 'buns', hairColor: 'cha', acc: 'scarf' });
const face = A.render(def, { yaw: -12, pose: 'stand', expr: 'happy', viewBox: A.faceBox(def, { size: 57 }), w: 512, h: 512, shadow: false, lw: 1.25 });
const html = (size, pad) => `<!doctype html><html><body style="margin:0;background:#fff"><div style="width:${size}px;height:${size}px;background:radial-gradient(circle at 50% 40%,#fff6e0,#e8cf9e);display:flex;align-items:center;justify-content:center;overflow:hidden"><div style="width:${size * (1 - pad)}px;height:${size * (1 - pad)}px">${face.replace('width="512" height="512"', `width="${size * (1 - pad)}" height="${size * (1 - pad)}"`)}</div></div></body></html>`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage();
fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
for (const [name, size, pad] of [['icon-192.png', 192, 0.06], ['icon-512.png', 512, 0.06], ['apple-touch-icon.png', 180, 0.04]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(size, pad));
  await page.screenshot({ path: path.join(ROOT, 'icons', name), omitBackground: false });
  console.log(name);
}
await browser.close();
