// キャラクターシートの一覧ページ（sheets/index.html）を作る（画像は build_sheets.mjs で作る）
//   node ninja-aibou-dojo/tools/build_sheet_index.mjs
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
globalThis.NinjaArt = require(path.join(ROOT, 'art.js'));
const C = require(path.join(ROOT, 'chars.js'));
const L = require(path.join(ROOT, 'lines.js'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KIND = { rescue: '救助', explore: '探索', escort: '護衛' };
const cards = C.CHARS.map(c => `    <a class="c" href="${c.id}.jpg" title="${esc(c.name)}のキャラクターシート（1536×1410）"><img src="thumb/${c.id}.jpg" alt="${esc(c.name)}のキャラクターシート" loading="lazy" width="480" height="441"><span><b>#${c.num} ${esc(c.name)}</b> ${esc(c.en)}<small>${esc(c.clan)}・${esc(c.jutsu)}　師匠として：${KIND[L[c.id].kind]}修行</small></span></a>`).join('\n');
const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>キャラクターシート（道場版）39体＋相棒 | ニンジャ相棒道場</title>
  <meta name="description" content="ニンジャ相棒道場に登場する CryptoNinja 39体と、ゲーム独自の相棒のキャラクターシート（まえ・ななめ・よこ・うしろ・色見本・しぐさ4種・あるく・かくれる・修行のうごき6種）。ゲーム用アレンジ案。">
  <meta name="theme-color" content="#3a2a20">
  <link rel="icon" href="../icons/icon-192.png">
  <style>
    :root { --washi:#f7f0e3; --ink:#2b2b33; --wood:#5a3a22; --gold:#b8934a; --card:#fffdf7; --line:#d9cdb4; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--washi); color: var(--ink); font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif; line-height: 1.7; }
    header { background: var(--wood); color: var(--washi); text-align: center; padding: 26px 16px 20px; }
    header h1 { margin: 0; font-size: 1.35rem; letter-spacing: .08em; }
    header p { margin: 6px 0 0; opacity: .9; font-size: .92rem; }
    main { max-width: 1100px; margin: 0 auto; padding: 14px 14px 40px; }
    .lead { font-size: .95rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 12px; }
    .c { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; }
    .c:hover { border-color: var(--ink); }
    .c.p { border: 2px solid var(--gold); }
    .c img { display: block; width: 100%; height: auto; }
    .c span { display: block; padding: 6px 10px 8px; font-size: .9rem; }
    .c small { display: block; color: #6b6555; font-size: .78rem; }
    .back { display: inline-block; margin-top: 8px; background: var(--wood); color: var(--washi); padding: 8px 16px; border-radius: 10px; text-decoration: none; font-weight: 700; }
    h2 { font-size: 1.1rem; border-left: 5px solid var(--gold); padding-left: 10px; margin-top: 26px; }
    footer { background: var(--wood); color: #d9c9b0; text-align: center; padding: 20px 16px; font-size: .85rem; }
    footer a { color: #e8c56b; }
  </style>
</head>
<body>
<header>
  <h1>キャラクターシート（道場版）</h1>
  <p>ニンジャ相棒道場 ゲーム用アレンジ案 ／ CryptoNinja 39体＋相棒</p>
</header>
<main>
  <p class="lead">
    ゲームに登場する CryptoNinja 39体と、ゲーム独自の相棒のキャラクターシートです。1枚に「まえ・ななめ・よこ・うしろ」「色見本」「しぐさ（ふつう・うれしい・びっくり・しんけん）」「うごき・擬態（あるく・かくれる）」に加えて、
    このゲームで使う「修行のうごき（こうげき・きゅうじょ・しらべる・さがる・へとへと・わーい）」をまとめています。
    画像をタップすると大きなサイズ（1536×1410）が開きます。ゲームの中の師匠・仲間・相棒も、同じ描き方で動いています。
  </p>
  <p class="lead" style="font-size:.85rem;color:#6b6555">公式イラスト（Ninja DAO・CC0）を参考にゲーム用に描き起こしたアレンジ案で、公式の設定画ではありません。相棒はこのゲーム独自のキャラクターで、見た目と呼び名はゲームの最初に選びます（この一覧の相棒は一例）。</p>
  <a class="back" href="../">▶ ニンジャ相棒道場を開く</a>
  <h2>相棒（ゲーム独自）</h2>
  <div class="grid">
    <a class="c p" href="partner.jpg" title="相棒（見本）のキャラクターシート（1536×1410）"><img src="thumb/partner.jpg" alt="相棒（見本）のキャラクターシート" loading="lazy" width="480" height="441"><span><b>相棒（見本）</b><small>外見6色×髪型5×髪の色4×小物4から選べる</small></span></a>
  </div>
  <h2>CryptoNinja 39体</h2>
  <div class="grid">
${cards}
  </div>
</main>
<footer>
  <p><a href="/">しのびのゲーム工房</a> ・ <a href="../about.html">遊び方</a> ・ <a href="/privacy.html">プライバシーポリシー</a></p>
  <p>キャラクター: CryptoNinja（CC0・Ninja DAO）／非公式ファンゲーム</p>
</footer>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'sheets', 'index.html'), html);
console.log('sheets/index.html: ' + (C.CHARS.length + 1) + ' cards');
