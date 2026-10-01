// キャラクターシート（39体＋相棒の見本）を画像にする（開発用・課金なし）
//   node ninja-aibou-dojo/tools/build_sheets.mjs              # 全員
//   node ninja-aibou-dojo/tools/build_sheets.mjs shiba oto    # 指定だけ（相棒は partner）
// 必要：playwright-core と Chromium。
//   PLAYWRIGHT_CORE … playwright-core の場所（省略時は require('playwright-core')）
//   CHROME          … Chromium の実行ファイル
//   SHEET_FONT_DIR  … フォントの置き場所。名前は筆文字（YujiBoku.ttf）、見出しは角ゴシック（ZenKakuGothicNew-700/900.ttf）、
//                     小物の字は丸ゴシック（ZenMaruGothic-500/700/900.ttf）。どれも Google Fonts（SIL OFL）
//   SHEET_STYLE     … cool にすると、かっこいい版（約5頭身・1536×1680）、cute にすると、かわいい版（ちびキャラ・1536×1410）で作る
//   OFFICIAL_ART    … 公式イラスト（CC0）の置き場所。省略時は ninja-sato-life/img/art（<id>.jpg）
// 出力：ninja-aibou-dojo/sheets/<id>.jpg（既定の公式に忠実な版は 1536×2110）と sheets/thumb/<id>.jpg（幅480）
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
const STYLE = ['cute', 'cool'].includes(process.env.SHEET_STYLE) ? process.env.SHEET_STYLE : 'official';
NinjaArt.style = STYLE;
const S = require(path.join(ROOT, 'sheet.js'));
const { W, H } = S.size(STYLE);
const ART_DIR = process.env.OFFICIAL_ART || path.join(ROOT, '..', 'ninja-sato-life', 'img', 'art');
// 公式イラストは data URI でシートに入れる。背景色は左上のすみの色（同じ向きの絵の背景にも使う）
const official = {};
const sheetSvg = ch => S.sheetSvg(ch, Object.assign({ style: STYLE }, official[ch.id] || {}));

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
const ff = (fam, w, file) => fs.existsSync(path.join(fontDir, file)) ? `@font-face{font-family:'${fam}';font-weight:${w};src:url('file://${path.join(fontDir, file)}')}` : '';
const face = fontDir ? [500, 700, 900].map(w => ff('Zen Maru Gothic', w, `ZenMaruGothic-${w}.ttf`)).join('') +
  [500, 700, 900].map(w => ff('Zen Kaku Gothic New', w, `ZenKakuGothicNew-${w === 500 ? 700 : w}.ttf`)).join('') +
  ff('Yuji Boku', 400, 'YujiBoku.ttf') : '';
const TW = 480, TH = Math.round(H * TW / W);

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
if (STYLE === 'official') {
  for (const ch of C.CHARS) {
    const f = path.join(ART_DIR, ch.id + '.jpg');
    if (!fs.existsSync(f)) { console.warn('公式イラストがありません: ' + f); continue; }
    const uri = 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
    const bg = await page.evaluate(async (uri) => {
      const img = new Image(); img.src = uri; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(2, 2, 8, 8).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4, h = v => Math.round(v / n).toString(16).padStart(2, '0');
      return '#' + h(r) + h(gg) + h(b);
    }, uri);
    official[ch.id] = { officialHref: uri, officialBg: bg };
  }
}
let n = 0;
for (const ch of C.CHARS.concat([partner])) {
  if (only.length && !only.includes(ch.id)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${face}html,body{margin:0;background:${STYLE === 'cute' ? '#f7f1e5' : '#eeebe5'}}</style></head><body>${sheetSvg(ch)}</body></html>`;
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
