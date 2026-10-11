/* ニンジャからくり工房 — 最初の10分の案内（設計書 §3）
 *  0〜2分：30秒の見本（第1・第2試験）を遊ぶ → 2〜4分：第3試験で罠にかかり、すぐ再挑戦
 *  → 4〜6分：見本の1か所を編集 → 6〜8分：提案（AI／定型）から仕掛けを1つ追加 → 8〜10分：自分でクリアして下書きに保存
 *  公開は必須にしない。「遊ぶだけ」もはっきり選べる。案内役：試験官長ハヤテ（遊ぶ）・工房の親方 金鬼（作る）。
 */
(function (root) {
  'use strict';
  var UI = root.KK_UI, C = root.KK_CHARS, D = root.KK_DATA;
  if (!UI) return;
  var $ = function (id) { return document.getElementById(id); };
  var G = { hayate: C.BY_ID.hayate, kanaoni: C.BY_ID.kanaoni };
  var hideT = 0;

  function tut() { return UI.store.profile.tut; }
  function save() { UI.store.saveProfile(); }
  function setStep(n) { tut().step = n; save(); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // 案内の吹き出し。btns: [[label, fn, cls]]
  function say(who, text, btns, opt) {
    opt = opt || {};
    var g = $('guide'), ch = G[who];
    g.className = 'guide' + (opt.top ? ' top' : '') + (opt.under ? ' at' : '');
    g.style.top = '';
    // under：その要素のすぐ下に出す（作る画面では、上の道具のボタンをかくさないように）
    if (opt.under) { var el = typeof opt.under === 'string' ? $(opt.under) : opt.under, r = el && el.getBoundingClientRect(); g.style.top = (r ? Math.round(r.top + 6) : 64) + 'px'; }
    g.innerHTML = '<div class="gf">' + UI.face(ch.art, 64, 76, opt.pose || 'stand', -20) + '</div><div class="gt"><span class="gn">' + (who === 'hayate' ? '試験官長 ハヤテ' : '工房の親方 金鬼') + '</span>' + text +
      (btns && btns.length ? '<div class="row">' + btns.map(function (b, i) { return '<button class="btn small ' + (b[2] || '') + '" data-i="' + i + '">' + esc(b[0]) + '</button>'; }).join('') + '</div>' : '') + '</div>';
    g.hidden = false;
    g.dataset.scr = UI.screen; // 別の画面へ移ったら閉じる
    g.onclick = function (e) { var i = e.target.getAttribute('data-i'); if (i == null) return; var b = btns[+i]; if (b && b[1]) b[1](); };
    clearTimeout(hideT);
    if (opt.ms) hideT = setTimeout(hide, opt.ms);
  }
  function hide() { $('guide').hidden = true; }
  function skip() { tut().done = true; save(); hide(); UI.toast('案内をとばしました。遊び方はいつでも「遊び方・保護者の方へ」で見られます。', 3500); }

  function welcome() {
    say('hayate', 'ようこそ、からくり工房へ。ここは忍者の試験を<b>遊んで、作る</b>工房だ。まずは30秒ほどの試験をひとつ受けてみよう。', [
      ['試験を受ける', function () { hide(); setStep(1); UI.playOfficial(1); }, 'primary'],
      ['案内をとばす', skip, 'ghost']
    ]);
  }
  function makeChoice() {
    say('kanaoni', 'わしは工房の親方、金鬼だ。よく3つの試験をこえたな。こんどは<b>作る番</b>だ。見本の1か所を変えるだけで、自分の試験になるぞ。', [
      ['作ってみる', function () {
        hide();
        var r = UI.createFromTemplate('first_path');
        if (!r.ok) { UI.toast(r.error, 3500); return; }
        setStep(5); UI.openEditor(r.level_id);
      }, 'primary'],
      ['遊ぶだけにする', function () { tut().playOnly = true; tut().done = true; save(); hide(); UI.toast('いつでも「作る」から試験を作れます。', 3000); UI.go('catalog'); }, '']
    ], { pose: 'stand' });
  }

  UI.on('boot', function () {
    var t = tut();
    if (t.done) return;
    if (/[#&]t=KRK1-/.test(root.location.hash || '')) return; // 試験コードのリンクから開いたときは、まずコードの読みこみを優先する
    if (t.step === 0) setTimeout(welcome, 400);
    else if (t.step === 4) setTimeout(makeChoice, 400);
    else if (t.step >= 5) setTimeout(function () { say('kanaoni', '案内のつづきだ。工房の「編集」から、作りかけの試験をひらこう。', [['工房へ', function () { hide(); UI.go('workshop'); }, 'primary'], ['案内をとばす', skip, 'ghost']]); }, 400);
    else setTimeout(function () { say('hayate', '案内のつづきだ。第' + t.step + '試験から受けよう。', [['試験を受ける', function () { hide(); UI.playOfficial(Math.max(1, Math.min(3, t.step))); }, 'primary'], ['案内をとばす', skip, 'ghost']]); }, 400);
  });
  UI.on('play', function (d) {
    var t = tut(); if (t.done) return;
    var keysOnly = $('pad').offsetParent === null; // パソコン（画面のボタンなし）
    if (d.stage === 1) say('hayate', (keysOnly ? '← → で走り、<b>スペース</b>でジャンプ' : '◀ ▶ で走り、<b>ジャンプ</b>') + 'で段差をこえる。長く押すと高く跳べる。ゴールの<b>鳥居</b>をめざせ！', null, { top: true, ms: 6500 });
    if (d.stage === 2) say('hayate', '足場から足場へ。落ちても、旗（チェックポイント）やスタートからすぐ戻れる。', null, { top: true, ms: 5500 });
    if (d.stage === 3) say('hayate', '次は罠の試験だ。トゲは<b>光ってから</b>飛び出す。', null, { top: true, ms: 4500 });
  });
  UI.on('die', function (d) {
    var t = tut(); if (t.done || t.step > 3) return;
    if (d.stage === 3 && !t.sawRetry) { t.sawRetry = true; save(); say('hayate', '当たったな。だが心配いらない。<b>すぐにその場から再開</b>できる。はじめからは ↺ だ。何度でも挑め！', null, { top: true, ms: 5000 }); }
  });
  UI.on('finish', function (d) {
    var t = tut(); if (t.done || d.status !== 'clear') return;
    if (d.stage === 1 && t.step <= 1) { setStep(2); hide(); pulseNext(); }
    else if (d.stage === 2 && t.step <= 2) { setStep(3); hide(); pulseNext(); }
    else if (d.stage === 3 && t.step <= 3) { setStep(4); setTimeout(makeChoice, 1500); }
  });
  // 結果の板の「次の試験へ」を光らせる（吹き出しで板をかくさない）
  function pulseNext() { setTimeout(function () { var b = document.querySelector('#play-over [data-a="next"]'); if (b) b.classList.add('pulse'); }, 50); }
  UI.on('editor', function () {
    var t = tut(); if (t.done) return;
    if (t.step === 5) say('kanaoni', 'まず<b>1か所だけ</b>変えてみよう。パーツの「足場」をえらんで、マス目の空いている所をタップだ（なぞると長くなる）。', null, { under: 'ed-cv' });
    if (t.step === 6) askSuggest();
    if (t.step === 7) askTest();
  });
  UI.on('part_place', function () {
    var t = tut(); if (t.done || t.step !== 5) return;
    setStep(6); askSuggest();
  });
  function askSuggest() {
    say('kanaoni', 'うまいぞ。次は<b>提案</b>で、仕掛けをひとつ足してもらおう。「やさしい・水渡り」がおすすめだ。', [
      ['提案をもらう', function () { hide(); UI.suggestDialog({ level: 'easy', gimmick: 'water' }); }, 'primary']
    ], { under: 'ed-cv' });
  }
  UI.on('ai_draft_accepted', function () {
    var t = tut(); if (t.done || t.step !== 6) return;
    setStep(7); askTest();
  });
  function askTest() {
    say('kanaoni', '最後に<b>テスト</b>で、自分でクリアしてみよう。作った人がクリアできた試験だけが、公開できるのだ。', [
      ['▶ テスト', function () { hide(); document.getElementById('ed-test').click(); }, 'primary']
    ], { under: 'ed-cv' });
  }
  UI.on('creator_clear', function () {
    var t = tut(); if (t.done || t.step !== 7) return;
    t.done = true; t.step = 8; save();
    UI.store.grantSeals(D.SEAL.tutorial);
    setTimeout(function () {
      say('kanaoni', '見事だ！ 試験は<b>下書きに保存</b>したぞ。公開は、したくなったらでいい。案内のほうびに修行印を' + D.SEAL.tutorial + 'つやろう。', [
        ['工房を見る', function () { hide(); UI.go('workshop'); }, 'primary'], ['遊ぶ', function () { hide(); UI.go('catalog'); }, '']
      ], { pose: 'cheer' });
    }, 1200);
  });
  UI.on('screen', function (name) {
    var g = $('guide'), t = tut();
    if (!g.hidden && g.dataset.scr !== name) hide();
    // はじめの案内をまだ始めていなければ、入口に戻ったときにもう一度声をかける
    if (name === 'home' && !t.done && t.step === 0 && UI.booted) setTimeout(function () { if (UI.screen === 'home' && $('guide').hidden) welcome(); }, 500);
  });
})(typeof window !== 'undefined' ? window : globalThis);
