// キャラクターシート39枚を画像にする（開発用・課金なし）
//   node ninja-sato-life/tools/build_sheets.mjs            # 全員
//   node ninja-sato-life/tools/build_sheets.mjs shiba oto  # 指定だけ
// 必要：playwright-core と Chromium（環境変数 CHROME に実行ファイルのパス）。
// フォント：環境変数 SHEET_FONT_DIR に Zen Maru Gothic（ZenMaruGothic-500/700/900.ttf）を置くと、見出しが丸ゴシックになる。
// 出力：ninja-sato-life/sheets/<id>.jpg（1536×1024）と sheets/thumb/<id>.jpg（幅480）
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const NinjaArt = require(path.join(ROOT, 'art.js'));
globalThis.NinjaArt = NinjaArt;
const { CHARS } = require(path.join(ROOT, 'chars.js'));
const { sheetSvg } = require(path.join(ROOT, 'sheet.js'));

const OUT = path.join(ROOT, 'sheets');
const THUMB = path.join(OUT, 'thumb');
fs.mkdirSync(THUMB, { recursive: true });
const only = process.argv.slice(2);
const fontDir = process.env.SHEET_FONT_DIR || '';
const face = fontDir ? [500, 700, 900].map(w => `@font-face{font-family:'Zen Maru Gothic';font-weight:${w};src:url('file://${path.join(fontDir, `ZenMaruGothic-${w}.ttf`)}')}`).join('') : '';

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
let n = 0;
for (const ch of CHARS) {
  if (only.length && !only.includes(ch.id)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${face}html,body{margin:0;background:#f7f1e5}</style></head><body>${sheetSvg(ch)}</body></html>`;
  const tmp = path.join(OUT, `.tmp_${ch.id}.html`);
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${ch.id}.jpg`), type: 'jpeg', quality: 90 });
  await page.setViewportSize({ width: 1536, height: 1024 });
  const thumbHtml = html.replace('<body>', '<body style="zoom:.3125">');
  fs.writeFileSync(tmp, thumbHtml);
  await page.setViewportSize({ width: 480, height: 320 });
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(THUMB, `${ch.id}.jpg`), type: 'jpeg', quality: 82 });
  await page.setViewportSize({ width: 1536, height: 1024 });
  fs.unlinkSync(tmp);
  n++;
  process.stdout.write(`${ch.num} ${ch.name}\n`);
}
await browser.close();
console.log(`sheets: ${n}`);
