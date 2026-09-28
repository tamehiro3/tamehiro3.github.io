// キャラクターシート（39体＋相棒の見本）を画像にする（開発用・課金なし）
//   node ninja-aibou-dojo/tools/build_sheets.mjs              # 全員
//   node ninja-aibou-dojo/tools/build_sheets.mjs shiba oto    # 指定だけ（相棒は partner）
// 必要：playwright-core と Chromium。
//   PLAYWRIGHT_CORE … playwright-core の場所（省略時は require('playwright-core')）
//   CHROME          … Chromium の実行ファイル
//   SHEET_FONT_DIR  … Zen Maru Gothic（ZenMaruGothic-500/700/900.ttf）の置き場所。見出しが丸ゴシックになる
// 出力：ninja-aibou-dojo/sheets/<id>.jpg（1536×1410）と sheets/thumb/<id>.jpg（幅480）
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
const C = require(path.join(ROOT, 'chars.js'));
const { sheetSvg, W, H } = require(path.join(ROOT, 'sheet.js'));

// 相棒の見本（タイトル画面・遊び方ページで使う既定の姿）
const PARTNER_SAMPLE = { outfit: 'ai', hair: 'buns', hairColor: 'cha', acc: 'scarf' };
const partner = {
  id: 'partner', name: '相棒（見本）', partner: true,
  info: '見習い忍者　外見と呼び名はゲームの最初に選ぶ（この絵は一例）',
  palette: ['#f7dcc2', '#6a4228', '#2f4a7a', '#1c2c4c', '#c8302c', '#d8b04a', '#e8e4da'],
  art: C.partnerArt(PARTNER_SAMPLE)
};

const OUT = path.join(ROOT, 'sheets');
const THUMB = path.join(OUT, 'thumb');
fs.mkdirSync(THUMB, { recursive: true });
const only = process.argv.slice(2);
const fontDir = process.env.SHEET_FONT_DIR || '';
const face = fontDir ? [500, 700, 900].map(w => `@font-face{font-family:'Zen Maru Gothic';font-weight:${w};src:url('file://${path.join(fontDir, `ZenMaruGothic-${w}.ttf`)}')}`).join('') : '';
const TW = 480, TH = Math.round(H * TW / W);

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
let n = 0;
for (const ch of C.CHARS.concat([partner])) {
  if (only.length && !only.includes(ch.id)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${face}html,body{margin:0;background:#f7f1e5}</style></head><body>${sheetSvg(ch)}</body></html>`;
  const tmp = path.join(OUT, `.tmp_${ch.id}.html`);
  fs.writeFileSync(tmp, html);
  await page.setViewportSize({ width: W, height: H });
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${ch.id}.jpg`), type: 'jpeg', quality: 88 });
  fs.writeFileSync(tmp, html.replace('<body>', `<body style="zoom:${TW / W}">`));
  await page.setViewportSize({ width: TW, height: TH });
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(THUMB, `${ch.id}.jpg`), type: 'jpeg', quality: 80 });
  fs.unlinkSync(tmp);
  n++;
  process.stdout.write(`${ch.num || '---'} ${ch.name}\n`);
}
await browser.close();
console.log(`sheets: ${n}`);
