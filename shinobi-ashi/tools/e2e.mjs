// 忍び足 — Playwright の通しテスト（結合担当）
//   node shinobi-ashi/tools/e2e.mjs [--out <スクリーンショットの置き場>] [--only 390]
// リポジトリ直下で python3 -m http.server を立て、http://127.0.0.1:<port>/shinobi-ashi/ を 390×844 と 360×640 で開く。
// 通し: はじめて（手順0〜6・主相棒・こども）→ ためし歩き +10,000 を何日か（来訪・位・宿場・巻物）→ 出来事のカード
//   → 忍術の間 → 修行枠（来訪した体を入れて割り当てを変える）→ 歩いている（テスト）→ 道 → 図鑑の詳細（6欄・4面・公式イラスト）
//   → 里の掲示板（自分の QR を画像にして読み戻す）→ 保護者設定（関門）→ 書き出し → はじめから → 読み込みで戻る
//   → ふりかえり（一日・週）→ about.html。最後に WEB_TRIAL=false（data.js を書きかえて配る）で、ながめるモード。
// 数えるもの: 外部ホストへの要求（0 であること）、コンソールのエラーと pageerror（0 であること）、
//   ルビのない漢字（関門の問題文 #gate-q は除く）、{ | } の残り、横あふれ、「公認」「コラボ」「連続」の文字。
// 終了コード: 不合格が1つでもあれば 1。
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import http from 'http';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..');
const REPO = path.resolve(APP_DIR, '..');
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = path.resolve(argOf('--out', process.env.E2E_OUT || path.join(os.tmpdir(), 'shinobi-ashi-e2e')));
const ONLY = argOf('--only', '');
fs.mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright が見つかりません（npm i playwright）'); process.exit(2); }

/* ---------- 合否の記録 ---------- */
const R = { pass: 0, fail: 0, fails: [] };
function ok(cond, name, info) {
  if (cond) { R.pass++; console.log('  ok   ' + name); }
  else { R.fail++; R.fails.push(name + (info !== undefined ? ' … ' + JSON.stringify(info) : '')); console.log('  NG   ' + name + (info !== undefined ? ' … ' + JSON.stringify(info) : '')); }
  return !!cond;
}

/* ---------- サーバー ---------- */
function freePort() {
  return new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
}
function waitHttp(url, ms) {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    (function tryOnce() {
      http.get(url, r => { r.resume(); res(); }).on('error', () => { if (Date.now() - t0 > ms) rej(new Error('server timeout')); else setTimeout(tryOnce, 150); });
    })();
  });
}

/* ---------- ページの検査（ブラウザの中で走る） ---------- */
function pageTextChecks() {
  const vis = (el) => {
    for (let p = el; p && p !== document; p = p.parentElement) {
      if (p.hidden) return false;
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
    }
    return true;
  };
  const kanji = [], braces = [], texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const p = n.parentElement;
    if (!p || p.closest('script,style,noscript,svg,#gate-q')) continue;
    const t = n.textContent;
    if (!t.trim() || !vis(p)) continue;
    texts.push(t);
    if (/[{}|]/.test(t)) braces.push(t.trim().slice(0, 40));
    if (p.closest('rt')) continue;
    if (p.closest('ruby')) continue;              // ルビの親字
    const m = t.match(/[㐀-鿿々]+/g);
    if (m) kanji.push(m.join('') + '@' + p.tagName.toLowerCase() + (p.className ? '.' + String(p.className).split(' ')[0] : ''));
  }
  // 横あふれ（ページそのものが横に動くか）と、はみ出した要素
  const W = window.innerWidth;
  const scr = document.getElementById('screen');
  const pageScroll = document.documentElement.scrollWidth > W + 1 || (scr && scr.scrollWidth > scr.clientWidth + 1);
  const over = [];
  document.querySelectorAll('#app *, #layer *').forEach(el => {
    if (el.closest('.guests,.qr-pick,.road-map,.hold-fill,#sim,.tabs')) return;
    const b = el.getBoundingClientRect();
    if (b.width && b.height && (b.right > W + 1 || b.left < -1) && vis(el)) over.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' ' + Math.round(b.left) + '..' + Math.round(b.right));
  });
  const all = texts.join('\n');
  return { kanji, braces, pageScroll, over: over.slice(0, 6), banned: (all.match(/公認|コラボ/g) || []), streak: /連続/.test(all), blank: all.replace(/\s/g, '').length };
}

/* ---------- 1つの画面の大きさで通す ---------- */
async function runFlow(browser, base, W, H) {
  const tag = W + 'x' + H;
  const out = path.join(OUT, tag);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  console.log('\n■ ' + tag);
  const origin = new URL(base).origin;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, acceptDownloads: true, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const st = { tag, errors: [], pageerrors: [], external: [], warns: [], shots: 0 };
  // 外部への要求は数えてから止める（応答を待たない）
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    st.external.push(u); return route.abort();
  });
  ctx.on('request', r => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:') && !st.external.includes(u)) st.external.push(u); });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') st.errors.push(m.text()); });
  page.on('pageerror', e => st.pageerrors.push(e.message));

  const sleep = (ms) => page.waitForTimeout(ms);
  const snap = async (name) => { await sleep(250); const f = path.join(out, String(++st.shots).padStart(2, '0') + '-' + name + '.png'); await page.screenshot({ path: f }); return f; };
  const click = async (sel, wait = 150) => { await page.locator(sel).first().click(); await sleep(wait); };
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  const S = () => page.evaluate(() => SA.UI.App.state ? JSON.parse(JSON.stringify(SA.UI.App.state)) : null);
  const idle = () => page.waitForFunction(() => !SA.UI.App.syncing, null, { timeout: 10000 }).catch(() => { });
  const check = async (name, opt = {}) => {
    const r = await page.evaluate(pageTextChecks);
    if (!opt.noFuri) ok(r.kanji.length === 0, `[${tag}] ${name}: ルビのない漢字なし`, r.kanji.slice(0, 6));
    ok(r.braces.length === 0, `[${tag}] ${name}: { | } の残りなし`, r.braces.slice(0, 4));
    ok(!r.pageScroll, `[${tag}] ${name}: 横にはみ出さない`);
    ok(r.blank > 5, `[${tag}] ${name}: 真っ白でない`);
    ok(r.banned.length === 0, `[${tag}] ${name}: 「公認」「コラボ」がない`, r.banned);
    if (r.over.length) st.warns.push(name + ' はみ出し: ' + r.over.join(' | '));
    return r;
  };
  const seen = new Set();
  // 出来事のカードを順に閉じる（はじめて見る型はスクリーンショット）
  const closeCards = async (label) => {
    for (let i = 0; i < 60; i++) {
      const b = page.locator('[data-act="ev-next"]');
      if (!(await b.count())) break;
      const t = (await page.locator('.ev-modal [data-ev]').last().getAttribute('data-ev').catch(() => null)) || 'card';
      if (!seen.has(t)) { seen.add(t); await snap('card-' + t); await check('カード ' + t); }
      await b.first().click(); await sleep(70);
    }
  };
  const simOpen = async () => {
    if (!(await page.locator('[data-add="10000"]').isVisible().catch(() => false))) await click('[data-act="sim-toggle"]');
  };
  const solveGate = async () => {
    const q = await page.locator('#gate-q').textContent();
    const K = { '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
    const nums = q.split('の順')[0].split('、').map(x => K[x.trim()]);
    ok(nums.length === 3 && nums.every(x => x >= 0), `[${tag}] 関門の問題文が読める`, q);
    for (const d of nums) await click('[data-num="' + d + '"]', 120);
    await sleep(250);
  };
  const holdParent = async () => {
    await click('[data-nav="menu"]');
    const bb = await page.locator('[data-menu="parent-settings"]').boundingBox();
    await page.mouse.move(bb.x + 12, bb.y + 12); await page.mouse.down(); await sleep(3250); await page.mouse.up(); await sleep(250);
  };
  const onboard = async (rep, shots) => {
    await page.waitForSelector('[data-act="next"]');
    if (shots) { await snap('ob0-parent'); await check('手順0'); }
    await click('[data-act="next"]');
    if (shots) {
      await snap('ob1-title'); await check('手順1');
      const t = await page.locator('#screen').innerText();
      ok(t.includes('非公式'), `[${tag}] タイトルに非公式の表記`);
      ok(await has('[data-act="play"]') && await has('[data-act="view"]'), `[${tag}] 試遊と「ながめる」の2つ`);
    }
    await click('[data-act="play"]');
    if (shots) { await snap('ob2-reps'); await check('手順2'); ok((await page.locator('[data-rep]').count()) === 4, `[${tag}] 主相棒は4体から選ぶ`); }
    await click('[data-rep="' + rep + '"]'); await click('[data-act="next"]');
    if (shots) { await snap('ob3-mode'); await check('手順3'); }
    await click('[data-act="next"]');
    for (let i = 0; i < 3; i++) { if (shots) { await snap('ob4-panel' + i); await check('手順4-' + i); } await click('[data-act="next"]'); }
    if (shots) { await snap('ob5-permit'); await check('手順5'); }
    await click('[data-act="permit"]');
    if (shots) { await snap('ob6-start'); await check('手順6'); }
    await click('[data-act="start"]', 400);
    await idle();
    await page.waitForFunction(() => SA.UI.App.state && SA.UI.App.screen === 'home', null, { timeout: 8000 });
  };

  // ===== 1) はじめて =====
  await page.goto(base);
  await page.evaluate(() => {   // 出来事を記録する（画面の動きは変えない）
    window.__ev = []; window.__evLast = [];
    const o = SA.Screens.showEvents;
    SA.Screens.showEvents = function (l) { window.__evLast = (l || []).map(e => e.type); window.__ev.push(...window.__evLast); return o.apply(this, arguments); };
  });
  await onboard('sakuya', true);
  let s = await S();
  ok(s && s.mainId === 'sakuya' && s.mode === 'kodomo', `[${tag}] 主相棒＝咲耶・こども（既定）で始まる`, s && [s.mainId, s.mode]);
  ok(s && s.goal === 10000, `[${tag}] こどもの目標の既定は10,000`, s && s.goal);
  ok(s && s.route === 'sim', `[${tag}] 経路はためし歩き（sim）`, s && s.route);
  await closeCards('first');
  await snap('home0'); await check('ホーム（はじめ）');

  // ===== 2) ためし歩き +10,000 を何日か =====
  await simOpen(); await snap('sim-open'); await check('ためし歩き');
  const DAYS = 8;
  for (let d = 0; d < DAYS; d++) {
    await simOpen();
    if (d === DAYS - 1) { await click('[data-act="sim-skip7"]', 300); await idle(); await closeCards('skip'); await simOpen(); }
    await click('[data-add="10000"]', 300); await idle(); await sleep(200);
    if (d === 0) await snap('ev-day1');
    await closeCards('d' + d);
    if (d < DAYS - 1) { await simOpen(); await click('[data-act="sim-next"]', 300); await idle(); await closeCards('n' + d); }
  }
  const evTypes = await page.evaluate(() => window.__ev);
  const cnt = {}; evTypes.forEach(t => cnt[t] = (cnt[t] || 0) + 1);
  console.log('  出来事: ' + JSON.stringify(cnt));
  for (const t of ['visit', 'rank', 'station', 'scroll', 'goal', 'bond', 'dyeUnlock']) ok(cnt[t] > 0, `[${tag}] 出来事 ${t} が起きた`, cnt[t] || 0);
  s = await S();
  ok(s.visits >= 3, `[${tag}] 来訪が3回以上`, s.visits);
  ok(s.chars.sakuya.rank >= 2, `[${tag}] 主相棒の位が下忍以上`, s.chars.sakuya.rank);
  ok(s.stationsReached >= 3, `[${tag}] 宿場に3つ以上着いた`, s.stationsReached);
  ok(s.scrolls - s.scrollsOpened >= 60, `[${tag}] 巻物が60本以上ある`, s.scrolls - s.scrollsOpened);
  ok(Object.keys(s.recent).length <= 7, `[${tag}] 実歩数は7日分だけ`, Object.keys(s.recent).length);
  // 出来事のカードは「まとめて見る」でも見られる
  await page.evaluate(() => SA.Screens.showEvents([{ type: 'visit', id: 'kohaku', n: 1 }, { type: 'rank', id: 'sakuya', rank: 2 }, { type: 'station', idx: 1, round: 1 }, { type: 'scroll', n: 10 }]));
  await sleep(200);
  if (ok(await has('[data-act="ev-all"]'), `[${tag}] 「まとめて見る」がある`)) { await click('[data-act="ev-all"]'); await snap('ev-all'); await check('まとめて見る'); await click('[data-act="close"]'); }
  await closeCards('rest');
  if (await page.locator('[data-act="sim-toggle"][aria-expanded="true"]').count()) await click('[data-act="sim-toggle"]');
  await click('[data-nav="home"]');
  await snap('home1'); await check('ホーム（8日後）');
  await page.evaluate(() => document.getElementById('screen').scrollTo(0, 99999)); await snap('home1-bottom');
  await page.evaluate(() => document.getElementById('screen').scrollTo(0, 0));

  // ===== 3) 巻物を開いて忍術の間 =====
  const before = (await S()).scrollsOpened;
  await click('[data-act="scrolls"]', 300); await snap('jutsu'); await check('忍術の間');
  await click('[data-act="open-scroll"]', 1200);
  const cv = await page.evaluate(() => { const c = document.querySelector('#jutsu canvas'); const j = document.getElementById('jutsu'); return { canvas: !!c, w: c ? c.getBoundingClientRect().width : 0, shown: !j.hidden }; });
  ok(cv.canvas && cv.shown && cv.w >= W - 2, `[${tag}] 忍術の間の Canvas が全画面`, cv);
  await snap('fx');
  await page.waitForSelector('[data-act="jutsu-back"]', { timeout: 10000 });
  await snap('fx-done');
  ok((await S()).scrollsOpened === before + 1, `[${tag}] 巻物が1本開いた`);
  await click('[data-act="jutsu-back"]', 300);

  // ===== 4) 修行枠に来訪した体を入れて割り当てを変える =====
  await click('[data-nav="shugyo"]', 250); await snap('shugyo'); await check('修行枠');
  s = await S();
  const allocBefore = s.alloc.slice();
  await click('[data-slot="1"]', 250); await snap('shugyo-pick'); await check('枠に入れる体を選ぶ');
  const pickId = await page.locator('[data-pick]').first().getAttribute('data-pick');
  await click('[data-pick="' + pickId + '"]', 300);
  s = await S();
  ok(s.slots[1] === pickId && pickId !== 'sakuya', `[${tag}] 来訪した体（${pickId}）を枠2に入れた`, s.slots);
  await click('[data-inc="0"]', 250);
  s = await S();
  ok(s.alloc.join() !== allocBefore.join() && s.alloc.reduce((a, b) => a + b, 0) === 100 && s.alloc.every(x => x % 10 === 0), `[${tag}] 割り当てが変わり、合計100・10きざみ`, [allocBefore, s.alloc]);
  await snap('shugyo-after'); await check('修行枠（変更後）');
  // 割り当てのあとに歩くと、枠2の体にも修行値が入る
  const sh0 = s.chars[pickId].shugyo;
  await simOpen(); await click('[data-add="3000"]', 300); await idle(); await closeCards('after-slot');
  s = await S();
  ok(s.chars[pickId].shugyo > sh0, `[${tag}] 枠2の体にも修行値が配られた`, [sh0, s.chars[pickId].shugyo]);

  // ===== 歩いている（テスト）: ボタンを押せない =====
  await simOpen();
  await click('[data-act="sim-walking"]', 900);
  const wk = await page.evaluate(() => ({ walk: !document.getElementById('walk').hidden, inert: document.getElementById('app').inert === true || document.getElementById('app').hasAttribute('inert') }));
  ok(wk.walk && wk.inert, `[${tag}] 歩いているあいだは「止まってから見てね」でボタンを止める`, wk);
  await snap('walking'); await check('歩いている');
  await click('[data-act="sim-walking"]', 900);
  ok(await page.evaluate(() => document.getElementById('walk').hidden && !document.getElementById('app').hasAttribute('inert')), `[${tag}] 止まったら元にもどる`);
  if (await page.locator('[data-act="sim-toggle"][aria-expanded="true"]').count()) await click('[data-act="sim-toggle"]');

  // ===== 5) 忍びの道 =====
  await click('[data-nav="road"]', 300); await snap('road'); await check('忍びの道');
  ok((await page.locator('#screen').innerText()).includes('目安'), `[${tag}] 道に「距離は直線の目安です」`);
  await page.locator('[data-st="1"]').first().click(); await sleep(250);
  await snap('road-station'); await check('宿場の小話');
  await click('[data-act="close"]');
  await page.evaluate(() => document.getElementById('screen').scrollTo(0, 99999)); await snap('road-diary');

  // ===== 6) 図鑑の詳細（6欄と4面） =====
  await click('[data-nav="zukan"]', 300); await snap('zukan'); await check('図鑑');
  ok((await page.locator('[data-zk]').count()) === 39, `[${tag}] 図鑑は39体`);
  ok((await page.locator('#screen').innerText()).includes('非公式'), `[${tag}] 図鑑に非公式の表記`);
  await click('[data-zk="sakuya"]', 350); await snap('zukan-detail'); await check('図鑑の詳細');
  ok((await page.locator('.sa-sheet6 figure').count()) === 6, `[${tag}] 6つの顔（6欄）`, await page.locator('.sa-sheet6 figure').count());
  await page.locator('.modal').last().evaluate(el => { const b = el.querySelector('.modal-body') || el; b.scrollTo(0, 99999); });
  await snap('zukan-detail-bottom'); await check('図鑑の詳細（下）');
  await click('[data-tab="views"]', 250);
  ok((await page.locator('.views4 figure').count()) === 4, `[${tag}] 4つの向き（4面）`);
  await snap('zukan-views');
  await click('[data-tab="art"]', 800);
  const img = await page.evaluate(() => { const i = document.querySelector('figure.official img'); return i ? i.complete && i.naturalWidth > 0 : false; });
  ok(img, `[${tag}] 公式イラストが読める`);
  await snap('zukan-art'); await check('公式イラスト');
  await click('[data-act="close"]');

  // ===== 7) 里の掲示板: 自分の QR を出して、画像にして読み戻す =====
  await click('[data-nav="sato"]', 300); await snap('sato'); await check('里');
  const boardBefore = (await S()).board.length;
  await click('[data-act="qr-show"]', 400);
  const qrText = await page.locator('[data-qr]').first().getAttribute('data-qr');
  ok(/^SA1-[0-9A-Z]{29}$/.test(qrText || ''), `[${tag}] QR の中身は SA1- と29文字`, qrText);
  await snap('qr-show'); await check('QR を見せる');
  const qrPng = path.join(out, 'qr.png');
  await page.locator('.qr-box').first().screenshot({ path: qrPng });
  await click('[data-act="close"]');
  await click('[data-act="qr-read"]', 300); await snap('qr-read'); await check('QR を読む');
  await page.locator('input[data-file="qr-file"]').setInputFiles(qrPng); await sleep(1500);
  await snap('qr-read-done');
  s = await S();
  ok(s.board.length === boardBefore + 1, `[${tag}] 画像から読んだ札が掲示板に貼れた`, [boardBefore, s.board.length]);
  ok(s.board.length && s.board[s.board.length - 1].charIndex === (await page.evaluate(() => NSL_CHARS.CHARS.findIndex(c => c.id === 'sakuya'))), `[${tag}] 札は咲耶`);
  ok(s.guests.length >= 1, `[${tag}] 里の客になった`);
  while (await has('.modal [data-act="close"]')) await click('.modal [data-act="close"]');
  await snap('sato-board'); await check('掲示板');

  // ===== 8) 保護者設定（関門を正しく解く） =====
  await holdParent();
  ok(await has('#gate-q'), `[${tag}] 3秒の長押しで関門が出る`);
  await snap('gate');
  await solveGate();
  ok(await has('[data-act="export"]'), `[${tag}] 関門を解くと保護者設定が開く`);
  await snap('parent'); await check('保護者設定');
  await page.evaluate(() => document.getElementById('screen').scrollTo(0, 99999)); await snap('parent-bottom');

  // ===== 9) 書き出し =====
  const dlP = page.waitForEvent('download');
  await click('[data-act="export"]');
  const dl = await dlP;
  const expPath = path.join(out, 'export.json');
  await dl.saveAs(expPath);
  const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  ok(exp.app === 'shinobi-ashi' && exp.state && exp.state.mainId === 'sakuya' && typeof exp.crc32 !== 'undefined', `[${tag}] 書き出しファイル（${dl.suggestedFilename()}）`);
  ok(/^shinobi-ashi-\d{8}\.json$/.test(dl.suggestedFilename()), `[${tag}] 書き出しの名前`, dl.suggestedFilename());
  const saved = await S();

  // ===== 10) はじめから =====
  await click('[data-act="reset"]', 250);
  await snap('reset-1');
  await page.locator('.modal').last().locator('button.primary').click(); await sleep(250);
  await snap('reset-2');
  await page.locator('.modal').last().locator('button.primary').click(); await sleep(600);
  ok(await page.evaluate(() => SA.UI.App.state === null && SA.UI.App.screen === 'onboard'), `[${tag}] はじめからで、はじめての画面にもどる`);
  ok(await page.evaluate(() => { try { return localStorage.getItem('shinobi-ashi:v1') === null; } catch (e) { return true; } }), `[${tag}] 保存した記録が消えた`);
  await snap('reset-done');

  // ===== 11) 読み込みで戻る =====
  await onboard('anne', false);
  await closeCards('re');
  await holdParent(); await solveGate();
  await page.locator('input[data-file="import"]').setInputFiles(expPath); await sleep(400);
  await snap('import-confirm'); await check('読み込みの確認');
  await page.locator('.modal').last().locator('button.primary').click(); await sleep(600);
  s = await S();
  ok(s.mainId === 'sakuya' && s.visits === saved.visits && s.visitTotal === saved.visitTotal && s.board.length === saved.board.length, `[${tag}] 読み込みで書き出したときの記録にもどった`, [s.mainId, s.visits, s.visitTotal]);
  ok(await page.evaluate(() => { try { return !!localStorage.getItem('shinobi-ashi:v1'); } catch (e) { return false; } }), `[${tag}] 読み込んだ記録が保存された`);
  await snap('import-home'); await check('読み込んだあとのホーム');

  // ===== 12) ふりかえり（一日・週） =====
  await click('[data-nav="menu"]'); await snap('menu'); await check('メニュー');
  await click('[data-menu="review"]', 300);
  let rv = await check('ふりかえり（一日）');
  ok(!rv.streak, `[${tag}] ふりかえりに連続日数を出さない`);
  await snap('review-day');
  await click('[data-tab="week"]', 300);
  rv = await check('ふりかえり（週）');
  ok(!rv.streak, `[${tag}] 週のふりかえりに連続日数を出さない`);
  ok((await page.locator('#screen').innerText()).includes('目標'), `[${tag}] 週は「目標に届いた日」の数`);
  await snap('review-week');
  // 前の週へ（書き出したときの週に記録がある）
  if (await has('[data-act="prev"]:not([disabled])')) { await click('[data-act="prev"]:not([disabled])', 300); await snap('review-week-prev'); await check('ふりかえり（前の週）'); }

  // ===== 13) ふりがな「なし」 =====
  await click('[data-nav="menu"]'); await click('[data-toggle="furigana:off"]', 250);
  await click('[data-nav="home"]', 250); await snap('furigana-off');
  ok(!(await page.locator('#screen ruby').count()), `[${tag}] ふりがな「なし」でルビが消える`);
  await check('ふりがななし', { noFuri: true });
  await click('[data-nav="menu"]'); await click('[data-toggle="furigana:on"]', 250);

  // ===== 14) about.html =====
  await page.goto(base + 'about.html'); await sleep(400);
  await snap('about'); await check('about.html');
  ok((await page.locator('body').innerText()).includes('非公式'), `[${tag}] おうちの方へに非公式の表記`);

  await ctx.close();

  // ===== 15) ながめるモード（WEB_TRIAL=false の data.js を配る） =====
  console.log('  — ながめるモード');
  const vctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await vctx.route('**/*', async route => {
    const u = route.request().url();
    if (!(u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:'))) { st.external.push(u); return route.abort(); }
    if (/\/data\.js(\?|$)/.test(u)) {
      const res = await route.fetch();
      const body = (await res.text()).replace(/WEB_TRIAL:\s*true/, 'WEB_TRIAL: false');
      return route.fulfill({ response: res, body });
    }
    return route.continue();
  });
  const vp = await vctx.newPage();
  vp.on('console', m => { if (m.type() === 'error') st.errors.push('[view] ' + m.text()); });
  vp.on('pageerror', e => st.pageerrors.push('[view] ' + e.message));
  const vsnap = async (name) => { await vp.waitForTimeout(250); await vp.screenshot({ path: path.join(out, String(++st.shots).padStart(2, '0') + '-' + name + '.png') }); };
  const vcheck = async (name) => {
    const r = await vp.evaluate(pageTextChecks);
    ok(r.kanji.length === 0, `[${tag}] ${name}: ルビのない漢字なし`, r.kanji.slice(0, 6));
    ok(r.braces.length === 0 && !r.pageScroll && r.blank > 5, `[${tag}] ${name}: 崩れなし`, [r.braces.slice(0, 3), r.pageScroll]);
  };
  await vp.goto(base); await vp.waitForSelector('[data-act="next"]');
  ok(await vp.evaluate(() => SA.DATA.CONFIG.WEB_TRIAL === false && SA.Steps.sim === null), `[${tag}] WEB_TRIAL=false ではためし歩きがない`);
  await vp.locator('[data-act="next"]').click(); await vp.waitForTimeout(200);
  await vsnap('view-title'); await vcheck('ながめる（タイトル）');
  ok(!(await vp.locator('[data-act="play"]').count()) && (await vp.locator('[data-act="view"]').count()) > 0, `[${tag}] 「ながめる」だけが出る`);
  await vp.locator('[data-act="view"]').first().click(); await vp.waitForTimeout(300);
  await vsnap('view-zukan'); await vcheck('ながめる（図鑑）');
  const navs = await vp.locator('[data-nav]').evaluateAll(els => els.map(e => e.getAttribute('data-nav')));
  ok(navs.includes('zukan') && navs.includes('road') && navs.includes('viewfile') && !navs.includes('shugyo') && !navs.includes('sato'), `[${tag}] ながめるモードは図鑑・道・ファイル`, navs);
  ok(await vp.evaluate(() => document.getElementById('sim').hidden), `[${tag}] ながめるモードにためし歩きの引き出しがない`);
  await vp.locator('[data-nav="road"]').click(); await vp.waitForTimeout(300); await vsnap('view-road'); await vcheck('ながめる（道）');
  await vp.locator('[data-nav="viewfile"]').click(); await vp.waitForTimeout(200); await vsnap('view-file'); await vcheck('ながめる（ファイル）');
  await vp.locator('input[data-file="view-open"]').setInputFiles(expPath); await vp.waitForTimeout(500);
  const met = await vp.locator('[data-met]').getAttribute('data-met').catch(() => null);
  ok(+met === Object.keys(exp.state.chars).length, `[${tag}] 書き出しファイルを開くと、その記録の図鑑（会えた忍 ${met}）`);
  await vsnap('view-opened'); await vcheck('ながめる（記録を開いた）');
  ok(await vp.evaluate(() => { try { return localStorage.getItem('shinobi-ashi:v1') === null; } catch (e) { return true; } }), `[${tag}] ながめるモードは記録を書きかえない`);
  await vctx.close();

  // ===== まとめ =====
  const sev = st.errors.length + st.pageerrors.length;
  ok(st.external.length === 0, `[${tag}] 外部ホストへの要求 0`, st.external.slice(0, 5));
  ok(st.errors.length === 0, `[${tag}] コンソールのエラー 0`, st.errors.slice(0, 5));
  ok(st.pageerrors.length === 0, `[${tag}] pageerror 0`, st.pageerrors.slice(0, 5));
  if (st.warns.length) console.log('  注意（はみ出しの候補）:\n    ' + st.warns.slice(0, 10).join('\n    '));
  console.log(`  スクリーンショット ${st.shots} 枚 → ${out}`);
  return { tag, external: st.external.length, consoleErrors: st.errors.length, pageErrors: st.pageerrors.length, shots: st.shots, events: cnt, sev };
}

/* ---------- 本体 ---------- */
const port = await freePort();
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' });
let browser;
const results = [];
try {
  await waitHttp(`http://127.0.0.1:${port}/shinobi-ashi/index.html`, 10000);
  const base = `http://127.0.0.1:${port}/shinobi-ashi/`;
  browser = await chromium.launch();
  for (const [w, h] of [[390, 844], [360, 640]]) {
    if (ONLY && String(w) !== ONLY) continue;
    try { results.push(await runFlow(browser, base, w, h)); }
    catch (e) { ok(false, `[${w}x${h}] 通しが最後まで進んだ`, String(e && e.message || e).split('\n')[0]); }
  }
} finally {
  if (browser) await browser.close().catch(() => { });
  server.kill('SIGTERM');
}
console.log('\n結果:');
for (const r of results) console.log(`  ${r.tag}: 外部への要求 ${r.external} / コンソールのエラー ${r.consoleErrors} / pageerror ${r.pageErrors} / スクリーンショット ${r.shots}`);
console.log(`\n合格 ${R.pass} / 不合格 ${R.fail}`);
if (R.fail) { console.log('不合格:\n  ' + R.fails.join('\n  ')); process.exit(1); }
