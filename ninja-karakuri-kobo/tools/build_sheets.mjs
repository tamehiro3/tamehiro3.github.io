// キャラクターシート39枚を画像にする（開発用）
//   node ninja-karakuri-kobo/tools/build_sheets.mjs            # 全員
//   node ninja-karakuri-kobo/tools/build_sheets.mjs shiba oto  # 指定だけ
// 必要：playwright（または playwright-core）と Chromium。
//   PLAYWRIGHT=<playwright か playwright-core のフォルダ>  CHROME=<chrome の実行ファイル>
// フォント：SHEET_FONT_DIR に次の TTF を置くと、見本に近い書体になる（なければ代わりの書体）。
//   ZenOldMincho-700.ttf / ZenOldMincho-900.ttf（見出し・ラベル）、ZenMaruGothic-500.ttf（小さな説明）
// 出力：ninja-karakuri-kobo/sheets/<id>.jpg（1536×1024）と sheets/thumb/<id>.jpg（幅480）
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT, 'playwright-core', 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { /* 次へ */ } }
  throw new Error('playwright が見つかりません（PLAYWRIGHT に場所を指定してください）');
}
const { chromium } = loadPlaywright();
const NinjaArt = require(path.join(ROOT, 'art.js'));
globalThis.NinjaArt = NinjaArt;
const { CHARS } = require(path.join(ROOT, 'chars.js'));
const { sheetSvg } = require(path.join(ROOT, 'sheet.js'));

const OUT = path.join(ROOT, 'sheets');
const THUMB = path.join(OUT, 'thumb');
fs.mkdirSync(THUMB, { recursive: true });
const only = process.argv.slice(2);
const fontDir = process.env.SHEET_FONT_DIR || '';
const faces = [];
if (fontDir) {
  const add = (fam, file, w) => { const p = path.join(fontDir, file); if (fs.existsSync(p)) faces.push(`@font-face{font-family:'${fam}';font-weight:${w};src:url('file://${p}')}`); };
  add('Zen Old Mincho', 'ZenOldMincho-700.ttf', 700);
  add('Zen Old Mincho', 'ZenOldMincho-900.ttf', 900);
  add('Zen Maru Gothic', 'ZenMaruGothic-500.ttf', 500);
  add('Zen Maru Gothic', 'ZenMaruGothic-700.ttf', 700);
}
const face = faces.join('');

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
let n = 0;
for (const ch of CHARS) {
  if (only.length && !only.includes(ch.id)) continue;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${face}html,body{margin:0;background:#f6f0e4}</style></head><body>${sheetSvg(ch)}</body></html>`;
  const tmp = path.join(OUT, `.tmp_${ch.id}.html`);
  fs.writeFileSync(tmp, html);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, `${ch.id}.jpg`), type: 'jpeg', quality: 90 });
  fs.writeFileSync(tmp, html.replace('<body>', '<body style="zoom:.3125">'));
  await page.setViewportSize({ width: 480, height: 320 });
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(THUMB, `${ch.id}.jpg`), type: 'jpeg', quality: 82 });
  fs.unlinkSync(tmp);
  n++;
  process.stdout.write(`${ch.num} ${ch.name}\n`);
}
await browser.close();
console.log(`sheets: ${n}`);

// 一覧ページ（sheets/index.html）
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cards = CHARS.map(c => `    <a class="c" href="${c.id}.jpg" title="${esc(c.name)}のキャラクターシート（1536×1024）"><img src="thumb/${c.id}.jpg" alt="${esc(c.name)}のキャラクターシート" loading="lazy" width="480" height="320"><span><b>#${c.num} ${esc(c.name)}</b> ${esc(c.en)}<small>${esc(c.clan)}・${esc(c.jutsu)}／第${c.exam.stage}試験「${esc(c.exam.title)}」</small></span></a>`).join('\n');
const page2 = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>キャラクターシート39体 | ニンジャからくり工房</title>
  <meta name="description" content="ニンジャからくり工房の試験官として登場する CryptoNinja 39体のキャラクターシート（まえ・ななめ・よこ・うしろ・色見本・しぐさ4種・あるく・かくれる）。ゲーム用アレンジ案。">
  <meta name="theme-color" content="#4a2f25">
  <link rel="icon" href="../icons/icon-192.png">
  <style>
    :root { --washi:#f6f0e4; --ink:#2b2b33; --wood:#4a2f25; --shu:#c8452c; --card:#fffdf7; --line:#dccfb6; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--washi); color: var(--ink); font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif; line-height: 1.7; }
    header { background: var(--wood); color: var(--washi); text-align: center; padding: 26px 16px 20px; }
    header h1 { margin: 0; font-size: 1.35rem; letter-spacing: .08em; }
    header p { margin: 6px 0 0; opacity: .9; font-size: .92rem; }
    main { max-width: 1100px; margin: 0 auto; padding: 14px 16px 40px; }
    .lead { font-size: .95rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 12px; }
    .c { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; }
    .c:hover { border-color: var(--ink); }
    .c img { display: block; width: 100%; height: auto; }
    .c span { display: block; padding: 6px 10px 8px; font-size: .9rem; }
    .c small { display: block; color: #6b6555; font-size: .78rem; }
    .back { display: inline-block; margin-top: 8px; background: var(--shu); color: #fff; padding: 8px 16px; border-radius: 10px; text-decoration: none; font-weight: 700; }
    footer { background: var(--wood); color: #d9c9b8; text-align: center; padding: 20px 16px; font-size: .85rem; }
    footer a { color: #f0c96b; }
  </style>
</head>
<body>
<header>
  <h1>キャラクターシート 39体</h1>
  <p>ニンジャからくり工房 ゲーム用アレンジ案</p>
</header>
<main>
  <p class="lead">
    ニンジャからくり工房で試験官として登場する CryptoNinja 39体のキャラクターシートです。1枚に「まえ・ななめ・よこ・うしろ」「色見本」「しぐさ（ふつう・うれしい・びっくり・しんけん）」「うごき・擬態（あるく・かくれる）」と、担当する試験をまとめています。
    画像をタップすると大きなサイズ（1536×1024）が開きます。ゲームの中の試験官と見習いも、同じ描き方で動いています。
  </p>
  <p class="lead" style="font-size:.85rem;color:#6b6555">公式イラスト（Ninja DAO・CC0）を参考にゲーム用に描き起こしたアレンジ案で、公式の設定画ではありません。担当の試験・ひとことはゲームの創作です。</p>
  <a class="back" href="../">▶ ニンジャからくり工房を開く</a>
  <div class="grid">
${cards}
  </div>
</main>
<footer>
  <p><a href="../">ニンジャからくり工房</a> ・ <a href="../about.html">遊び方・保護者の方へ</a> ・ <a href="/">しのびのゲーム工房</a></p>
  <p>非公式ファンゲーム / キャラクター: CryptoNinja（CC0・Ninja DAO）</p>
</footer>
</body>
</html>
`;
if (!only.length) { fs.writeFileSync(path.join(OUT, 'index.html'), page2); console.log('index.html'); }
