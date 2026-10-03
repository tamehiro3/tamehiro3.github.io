/* ニンジャからくり工房 — 画面の切りかえと、それぞれの画面
 *  入口／試験を選ぶ／試験の前（試験官のひとこと）／結果／工房（自分の作品）／分析／試験官名鑑／身じたく／記録／設定／運営画面（試作）
 *  ダイアログ：見本えらび・題名と外観・保存の履歴・検証の結果・提案（AI／定型）・試験コード・コードの読みこみ・通報
 */
(function (root) {
  'use strict';
  var D = root.KK_DATA, E = root.KK_ENGINE, R = root.KK_RULES, ST = root.KK_STORE, A = root.NinjaArt, C = root.KK_CHARS;
  var RD = root.KK_RENDER, SND = root.KK_SOUND, PLAY = root.KK_PLAY, ED = root.KK_EDITOR, STG = root.KK_STAGES, SOL = root.KK_SOLUTIONS || {};
  var $ = function (id) { return document.getElementById(id); };
  var UI = { store: null, screen: '', listeners: {}, cache: { lv: {}, thumb: {} }, tab: 'first', prev: [] };
  root.KK_UI = UI;

  /* ================= 小道具 ================= */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function sec(f) { var s = f / 60; return s < 10 ? s.toFixed(2) : s.toFixed(1); }
  UI.on = function (name, fn) { (UI.listeners[name] = UI.listeners[name] || []).push(fn); };
  UI.emit = function (name, data) { (UI.listeners[name] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) { if (root.console) console.error(e); } }); };
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }
  UI.toast = toast;
  function modal(html, bind) {
    var m = $('modal'), b = $('modal-box');
    b.innerHTML = html; m.hidden = false;
    b.onclick = null;
    if (bind) bind(b);
    m.onclick = function (e) { if (e.target === m) closeModal(); };
    return b;
  }
  function closeModal() { $('modal').hidden = true; $('modal-box').innerHTML = ''; }
  UI.modal = modal; UI.closeModal = closeModal;
  function confirmBox(title, text, okLabel, fn, danger) {
    modal('<h2>' + esc(title) + '</h2><p>' + text + '</p><div class="foot"><button class="btn ghost" data-a="no">やめる</button><button class="btn ' + (danger ? 'primary' : 'green') + '" data-a="ok">' + esc(okLabel) + '</button></div>', function (b) {
      b.onclick = function (e) { var a = e.target.getAttribute('data-a'); if (a === 'no') closeModal(); if (a === 'ok') { closeModal(); fn(); } };
    });
  }
  // 人物の顔（上半身）の SVG。公式に忠実な絵柄（約2.7頭身）の頭と肩が入る枠
  function face(def, w, h, pose, yaw) {
    if (!def || !A) return '';
    return A.render(def, { pose: pose || 'stand', yaw: yaw == null ? -18 : yaw, expr: pose === 'cheer' ? 'happy' : undefined, w: w || 64, h: h || 76, viewBox: '33 -4 134 160', shadow: false, prop: false, companions: false });
  }
  UI.face = face;
  // 制作者の看板（修行印の店の飾りつき）
  function signHtml(sg) { var f = sg && sg.f; return '<span class="sign' + (f === 1 ? ' kin' : f === 2 ? ' hana' : '') + '">' + (f === 2 ? '✿ ' : '') + esc(R.signText(sg)) + '</span>'; }
  function sealChip() { return '<span class="seal-chip" title="修行印"><i>印</i>' + UI.store.profile.seals + '</span>'; }
  function bar(title, backTo, right) {
    return '<header class="bar">' + (backTo ? '<button class="back" data-back="' + backTo + '" aria-label="もどる">←</button>' : '') + '<h1>' + esc(title) + '</h1>' + (right || sealChip()) + '</header>';
  }
  function bindBack(el) { el.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { SND.play('tap'); go(b.getAttribute('data-back')); }); }); }

  /* ================= 画面の切りかえ ================= */
  var SCREENS = ['home', 'catalog', 'play', 'workshop', 'editor', 'analysis', 'roster', 'dress', 'records', 'settings', 'operator'];
  function show(name) {
    SCREENS.forEach(function (s) { var el = $('scr-' + s); if (el) el.className = el.className.replace(/\s*\bon\b/g, '') + (s === name ? ' on' : ''); });
    if (name !== 'play' && PLAY.active()) PLAY.stop();
    if (name !== 'editor' && ED.active()) ED.close();
    if (name !== 'home') homeStop();
    UI.screen = name;
    UI.emit('screen', name);
  }
  function go(name, arg) {
    closeModal();
    switch (name) {
      case 'home': renderHome(); break;
      case 'catalog': renderCatalog(arg); break;
      case 'workshop': renderWorkshop(); break;
      case 'roster': renderRoster(); break;
      case 'dress': renderDress(); break;
      case 'records': renderRecords(); break;
      case 'settings': renderSettings(); break;
      case 'operator': renderOperator(); break;
      case 'analysis': renderAnalysis(arg); break;
    }
  }
  UI.go = go; UI.show = show;

  /* ================= 見習い・試験官 ================= */
  function playerObj() {
    var p = UI.store.profile;
    return { key: 'me:' + p.outfit + ':' + p.hair, def: C.apprenticeArt(p.outfit, p.hair) };
  }
  UI.playerObj = playerObj;
  function examinerOf(stageId) {
    var ch = C.BY_STAGE[stageId]; if (!ch) return null;
    return { key: ch.id, def: ch.art, name: ch.name, ch: ch, hint: { face: face(ch.art, 44, 52), name: ch.name, text: ch.exam.hint } };
  }
  function fxCols() {
    var fx = UI.store.profile.fx;
    if (fx === 'fx_sakura') return ['#f7b8cc', '#f07aa0', '#ffffff', '#fbd3e0'];
    if (fx === 'fx_kitsunebi') return ['#8fd0ff', '#5ab0ff', '#d8f0ff', '#3a8fd8'];
    if (fx === 'fx_kami') return ['#e8423a', '#f5d040', '#3a9a4a', '#2f6fd0', '#ffffff'];
    return null;
  }

  /* ================= 運営ステージ ================= */
  function stageLevel(st) {
    if (!UI.cache.lv[st.id]) UI.cache.lv[st.id] = R.fromAscii(st.rows, Object.assign({ theme: st.theme }, st.meta || {}));
    return UI.cache.lv[st.id];
  }
  function stageById(id) { return STG.STAGES.filter(function (s) { return s.id === id; })[0]; }
  function solutionFor(st) { var s = SOL[String(st.id)]; return s && s.hash === R.contentHash(stageLevel(st)) ? s : null; }
  function targetSec(st) { var s = solutionFor(st); return s ? Math.max(15, Math.ceil(s.frames / 60 * 2.5 / 5) * 5) : 60; }
  UI.stageLevel = stageLevel; UI.targetSec = targetSec; UI.stageById = stageById;
  function chapterOf(id) { return id <= 13 ? '竹林の巻' : id <= 26 ? '屋敷の巻' : '天空道場の巻'; }
  function thumbURL(key, level) {
    if (UI.cache.thumb[key]) return UI.cache.thumb[key];
    var cv = RD.thumbnail(level, 320, 130);
    var url = cv ? cv.toDataURL('image/png') : '';
    UI.cache.thumb[key] = url;
    return url;
  }
  // 運営おすすめ（週2回入れかわる）
  function picks() {
    var now = UI.store.now(), half = Math.floor((now / 86400000 + 3) / 3.5), out = [], seen = {};
    for (var k = 0; out.length < 4 && k < 20; k++) { var id = ((half * 7 + k * 11) % 39 + 39) % 39 + 1; if (!seen[id]) { seen[id] = 1; out.push(id); } }
    return out;
  }

  /* ================= 入口 ================= */
  var homeAnim = null;
  function renderHome() {
    var el = $('scr-home'), p = UI.store.profile, wt = UI.store.weeklyTopic();
    var done = Object.keys(p.cleared).length;
    el.innerHTML = '<div class="home-stage"><canvas id="home-cv"></canvas></div>' +
      '<div class="home-top"><span></span>' + sealChip() + '</div>' +
      '<div class="home-card">' +
      '<h1 class="logo"><small>CryptoNinja 非公式ファンゲーム（試作版）</small>ニンジャからくり工房</h1>' +
      '<p class="tag">30〜90秒の忍者試験を遊んで、作って、<br>友だちの攻略で完成させよう。</p>' +
      '<div class="home-main"><button class="btn primary" data-go="play">遊ぶ<small>試験官39人の試験（合格 ' + done + '／39）</small></button>' +
      '<button class="btn ai" data-go="make">作る<small>見本から試験を作る</small></button></div>' +
      '<div class="home-sub"><button class="btn" data-go="roster"><b>🏮</b>試験官名鑑</button><button class="btn" data-go="dress"><b>👘</b>身じたく</button>' +
      '<button class="btn" data-go="records"><b>📜</b>記録</button><button class="btn" data-go="settings"><b>⚙</b>設定</button></div>' +
      '<div class="weekly">今週のお題：<b>' + esc(wt.topic.name) + '</b>（作者クリアすると修行印' + D.SEAL.weekly + 'つ）</div>' +
      '<div class="home-foot"><a href="about.html">遊び方・保護者の方へ</a> ・ <a href="sheets/">キャラクターシート</a> ・ <a href="/">しのびのゲーム工房</a></div>' +
      '</div>';
    show('home');
    el.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        SND.unlock(); SND.play('tap');
        var g = b.getAttribute('data-go');
        if (g === 'play') go('catalog'); else if (g === 'make') go('workshop'); else go(g);
      });
    });
    homeStart();
  }
  // 入口のうしろで、見本の試験を試験官が走る
  function homeStart() {
    homeStop();
    var cv = $('home-cv'); if (!cv) return;
    var st = stageById(1 + Math.floor(Math.random() * 13)), lv = stageLevel(st), sol = solutionFor(st);
    var k = Math.min(2, root.devicePixelRatio || 1), w = E.createWorld(lv), s = E.initState(w);
    cv.width = Math.round(cv.clientWidth * k); cv.height = Math.round(cv.clientHeight * k);
    var v = new RD.View(cv.width, cv.height, 'play'), layer = RD.tileLayer(lv, lv.theme, v);
    var ex = examinerOf(st.id), runner = { key: ex.key, def: ex.def };
    var runs = sol ? sol.runs : [[0, 99999]], ri = 0, rn = 0, t0 = performance.now(), last = t0, acc = 0;
    v.snap(s.px, s.py);
    homeAnim = { raf: 0 };
    function fr(ts) {
      if (!homeAnim) return;
      homeAnim.raf = requestAnimationFrame(fr);
      var dt = Math.min(0.1, (ts - last) / 1000); last = ts; acc += dt;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        var r = runs[ri], m = r ? r[0] : 0;
        if (r && ++rn >= r[1]) { ri++; rn = 0; }
        E.step(w, s, m, null);
        if (s.status >= 2 || ri >= runs.length) { s = E.initState(w); ri = 0; rn = 0; v.snap(s.px, s.py); }
      }
      v.follow(s.px, s.py, dt * 5);
      RD.drawStage(cv.getContext('2d'), { view: v, world: w, state: s, theme: lv.theme, layer: layer, t: (ts - t0) / 1000, player: runner, examiner: null });
    }
    homeAnim.raf = requestAnimationFrame(fr);
  }
  function homeStop() { if (homeAnim) { cancelAnimationFrame(homeAnim.raf); homeAnim = null; } }

  /* ================= 試験を選ぶ ================= */
  var TABS = [['first', '初めての試験'], ['short', '短い'], ['think', '考える'], ['pick', '運営おすすめ'], ['new', '新着'], ['all', '巻ごと'], ['friends', '友だちの試験']];
  function renderCatalog(tab) {
    if (tab) UI.tab = tab;
    var el = $('scr-catalog');
    el.innerHTML = bar('試験を選ぶ', 'home') + '<nav class="tabs">' + TABS.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (UI.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</nav><div class="scroll"><div class="wrap" id="cat-body"></div></div>';
    show('catalog');
    bindBack(el);
    el.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { SND.play('tap'); UI.tab = b.getAttribute('data-tab'); renderCatalog(); }); });
    var body = $('cat-body'), list = STG.STAGES;
    function grid(stages, lead) {
      return (lead ? '<p class="muted">' + lead + '</p>' : '') + '<div class="grid">' + stages.map(stageCard).join('') + '</div>';
    }
    var h = '';
    switch (UI.tab) {
      case 'first': h = grid(list.filter(function (s) { return s.tags.indexOf('first') >= 0; }), 'はじめての人は、ここから。操作と試験のしくみ（罠・水渡り・落とし穴）を覚えられます。'); break;
      case 'short': h = grid(list.filter(function (s) { return targetSec(s) <= 30; }), '目標タイムが30秒以内の、さっと遊べる試験。'); break;
      case 'think': h = grid(list.filter(function (s) { return s.tags.indexOf('think') >= 0; }), '扉とスイッチの順番や、術の回数を考える試験。'); break;
      case 'pick': h = grid(picks().map(stageById), '運営のおすすめ（週に2回入れかわります）。'); break;
      case 'new': {
        var fr = UI.store.friendList().slice(0, 6);
        h = (fr.length ? '<h2 class="sec">新しく受け取った友だちの試験</h2><div class="grid">' + fr.map(friendCard).join('') + '</div>' : '') +
          '<h2 class="sec">新しい運営の試験</h2>' + grid(list.slice(-5).reverse());
        break;
      }
      case 'all':
        h = ['竹林の巻（初級）', '屋敷の巻（中級）', '天空道場の巻（上級）'].map(function (name, ci) {
          return '<h2 class="sec">' + name + '</h2><div class="grid">' + list.slice(ci * 13, ci * 13 + 13).map(stageCard).join('') + '</div>';
        }).join('');
        break;
      case 'friends': {
        var fl = UI.store.friendList();
        h = '<div class="note">友だちが作った試験を「試験コード」で受け取って遊べます。<b>ユーザー作品</b>は運営の試験とは別です（公式の設定・ストーリーではありません）。遊んだあとは「攻略メモ」を作者に返すと、作者が試験を改良できます。</div>' +
          '<div class="row" style="margin:10px 0"><button class="btn primary" data-act="import">＋ 試験コードを読みこむ</button></div>' +
          (fl.length ? '<div class="grid">' + fl.map(friendCard).join('') + '</div>' : '<p class="empty">まだ友だちの試験はありません。</p>');
        break;
      }
    }
    body.innerHTML = h;
    body.onclick = function (e) {
      var c = e.target.closest('[data-stage],[data-friend],[data-act]'); if (!c) return;
      SND.play('tap');
      if (c.dataset.stage) openIntro(+c.dataset.stage);
      else if (c.dataset.friend) openFriend(c.dataset.friend);
      else if (c.dataset.act === 'import') importDialog();
    };
  }
  function stageCard(st) {
    var ex = C.BY_STAGE[st.id], rec = UI.store.profile.cleared[st.id], lv = stageLevel(st);
    return '<button class="card" data-stage="' + st.id + '"><img class="thumb" alt="" src="' + thumbURL('s' + st.id, lv) + '">' +
      '<span class="badges"><span class="pill shu">運営</span>' + (st.tags.indexOf('think') >= 0 ? '<span class="pill ai">考える</span>' : '') + '</span>' +
      '<span class="num">第' + st.id + '試験</span>' +
      '<span class="cb"><span class="face">' + face(ex.art, 44, 52) + '</span><span class="ct"><b>' + esc(ex.exam.title) + '</b><small>試験官：' + esc(ex.name) + '／目標 ' + targetSec(st) + '秒' + (rec ? '／自己ベスト ' + sec(rec.best) + '秒' : '') + '</small></span></span>' +
      (rec ? '<span class="stamp">' + (rec.under ? '秀' : '合格') + '</span>' : '') + '</button>';
  }
  function friendCard(f) {
    var best = UI.store.bestOf(f.content_hash);
    return '<button class="card" data-friend="' + esc(f.level_id) + '"><img class="thumb" alt="" src="' + thumbURL('f' + f.content_hash, f.content) + '">' +
      '<span class="badges"><span class="pill gold">ユーザー作品</span></span>' +
      '<span class="cb"><span class="ct"><b>' + esc(R.titleText(f.content.title)) + '</b><small>制作：' + signHtml(f.sign) + (best ? '／自己ベスト ' + sec(best) + '秒' : '') + '</small></span></span></button>';
  }

  /* ================= 試験の前・遊ぶ・結果（運営ステージ） ================= */
  function openIntro(id) {
    var st = stageById(id), ex = examinerOf(id), lv = stageLevel(st), rec = UI.store.profile.cleared[id], sol = solutionFor(st);
    modal('<div class="examiner" style="display:flex;gap:10px;align-items:center;background:#fbf4e2;border-radius:12px;padding:8px 10px"><div style="width:84px;height:100px;flex:none">' + face(ex.def, 84, 100, 'stand', -20) + '</div>' +
      '<div><b style="color:var(--shu);font-size:.8rem">第' + id + '試験・' + chapterOf(id) + '　試験官 ' + esc(ex.name) + '</b><h2 style="margin:2px 0">' + esc(ex.ch.exam.title) + '</h2><div>「' + esc(ex.ch.exam.intro) + '」</div></div></div>' +
      '<div class="stats"><div>目標タイム<b>' + targetSec(st) + '秒</b></div><div>制限時間<b>120秒</b></div><div>自己ベスト<b>' + (rec ? sec(rec.best) + '秒' : '—') + '</b></div></div>' +
      '<p class="muted">失敗しても、旗（チェックポイント）からすぐやり直せます。はじめからは ↺ で。' + (rec ? '' : '初めての合格で修行印1つ、目標タイム以内でもう1つ。') + '</p>' +
      '<p class="muted" style="font-size:.72rem">試験官のひとことはゲームの創作です（公式の設定ではありません）。</p>' +
      '<div class="foot"><button class="btn ghost" data-a="close">もどる</button>' + (sol ? '<button class="btn ai" data-a="demo">お手本を見る</button>' : '') + '<button class="btn primary big" data-a="start">試験をはじめる</button></div>', function (b) {
      b.onclick = function (e) {
        var a = e.target.getAttribute('data-a'); if (!a) return;
        SND.unlock();
        if (a === 'close') closeModal();
        if (a === 'start') { closeModal(); playOfficial(id); }
        if (a === 'demo') { closeModal(); playDemo(id); }
      };
    });
  }
  UI.openIntro = openIntro;
  function playOfficial(id, extra) {
    var st = stageById(id), ex = examinerOf(id), lv = stageLevel(st), hash = R.contentHash(lv), p = UI.store.profile;
    show('play');
    UI.store.log('level_start', { level: 's' + id });
    PLAY.start({
      level: lv, kind: 'official', title: '第' + id + '試験「' + ex.ch.exam.title + '」', player: playerObj(), examiner: ex, hint: ex.hint, lefty: p.settings.leftHanded, canDemo: !!solutionFor(st), fxCols: fxCols(),
      onDemo: function () { playDemo(id); },
      onRetry: function () { UI.store.log('level_retry', { level: 's' + id }); },
      onAttempt: function (r) { UI.store.addAttempt({ level_id: 's' + id, content_hash: hash, kind: 'official', result: r.status === 'clear' ? 'clear' : r.status === 'timeout' ? 'timeout' : r.status === 'quit' ? 'quit' : 'fail', frames: r.frames, deaths: r.deaths }); },
      onDie: function () { UI.emit('die', { stage: id }); },
      onEnd: function (r) {
        if (r.status === 'quit') { go('catalog'); return; }
        var best = UI.store.bestOf(hash), gain = null;
        UI.store.log('level_finish', { level: 's' + id, status: r.status, frames: r.frames });
        if (r.status === 'clear') gain = UI.store.officialClear(id, r.frames, targetSec(st));
        resultPanel({ kind: 'official', id: id, res: r, ex: ex, best: best, gain: gain, hash: hash, lid: 's' + id });
        UI.emit('finish', { stage: id, status: r.status, res: r });
      }
    });
    UI.emit('play', { stage: id });
  }
  UI.playOfficial = playOfficial;
  function playDemo(id) {
    var st = stageById(id), ex = examinerOf(id), sol = solutionFor(st);
    if (!sol) return;
    show('play');
    PLAY.start({ level: stageLevel(st), kind: 'demo', demoRuns: sol.runs, title: 'お手本：' + ex.ch.exam.title, player: { key: ex.key, def: ex.def }, examiner: null, onEnd: function () { openIntroAfterDemo(id); } });
  }
  function openIntroAfterDemo(id) { go('catalog'); openIntro(id); }
  function resultPanel(o) {
    var r = o.res, clear = r.status === 'clear', h = '<div class="panel">';
    if (o.kind === 'official') {
      var ch = o.ex.ch, next = o.id < 39 ? o.id + 1 : null;
      h += '<h2>' + (clear ? '合格！' : '時間切れ') + '</h2>' + (clear ? '<div class="big-time">' + sec(r.frames) + '<small style="font-size:.4em">秒</small></div>' : '') +
        '<div class="examiner"><div class="ef">' + face(o.ex.def, 64, 76, clear ? 'cheer' : 'stand', -15) + '</div><div><b>試験官 ' + esc(o.ex.name) + '</b>「' + esc(clear ? ch.exam.clear : ch.exam.hint) + '」</div></div>' +
        '<div class="stats"><div>自己ベスト<b>' + (clear ? sec(Math.min(o.best || r.frames, r.frames)) : o.best ? sec(o.best) : '—') + '</b></div><div>失敗<b>' + r.deathsCount + '回</b></div><div>目標<b>' + targetSec(stageById(o.id)) + '秒</b></div></div>' +
        (o.gain && o.gain.seals ? '<div class="note">修行印を <b>' + o.gain.seals + 'つ</b> もらいました（いま ' + UI.store.profile.seals + '）。身じたくで見た目と交換できます。</div>' : '') +
        reactsHtml(o.lid, o.hash) +
        '<div class="row center"><button class="btn" data-a="again">↺ もう一度</button>' + (next ? '<button class="btn primary" data-a="next">次の試験へ</button>' : '') + '<button class="btn ghost" data-a="list">一覧へ</button></div>';
    } else if (o.kind === 'friend' || o.kind === 'guest') {
      h += '<h2>' + (clear ? 'クリア！' : '時間切れ') + '</h2>' + (clear ? '<div class="big-time">' + sec(r.frames) + '<small style="font-size:.4em">秒</small></div>' : '') +
        '<p class="muted">' + esc(R.titleText(o.f.content.title)) + '（制作：' + signHtml(o.f.sign) + '・ユーザー作品）</p>' + reactsHtml(o.lid, o.hash) +
        (o.kind === 'friend' ? '<div class="row center"><button class="btn ai" data-a="memo">攻略メモを作る（作者へ返す）</button></div>' : '<p class="muted">この挑戦は「友だちの挑戦」として分析に入りました。</p>') +
        '<div class="row center" style="margin-top:8px"><button class="btn" data-a="again">↺ もう一度</button><button class="btn ghost" data-a="list">もどる</button>' + (o.kind === 'friend' ? '<button class="btn ghost small" data-a="report">通報</button>' : '') + '</div>';
    }
    h += '</div>';
    PLAY.showOverlay(h, function (e) {
      var t = e.target.closest('[data-a],[data-react]'); if (!t) return;
      SND.play('tap');
      if (t.dataset.react) { var rr = UI.store.react(o.lid, o.hash, t.dataset.react); t.classList.toggle('on', !!rr[t.dataset.react]); return; }
      var a = t.dataset.a;
      if (a === 'again') { if (o.kind === 'official') playOfficial(o.id); else playFriend(o.f, o.kind); }
      if (a === 'next') openIntroNext(o.id + 1);
      if (a === 'list') { if (o.kind === 'guest') go('analysis', o.f.lid || o.lid); else go('catalog'); }
      if (a === 'memo') memoDialog(o.lid);
      if (a === 'report') reportDialog(o.lid);
    });
  }
  function openIntroNext(id) { go('catalog'); openIntro(id); }
  function reactsHtml(lid, hash) {
    var cur = UI.store.reactionsFor(lid, hash);
    return '<div class="reacts">' + D.REACTIONS.map(function (r) { return '<button data-react="' + r.id + '" class="' + (cur[r.id] ? 'on' : '') + '">' + r.icon + ' ' + r.name + '</button>'; }).join('') + '</div>';
  }

  /* ================= 友だちの試験 ================= */
  function openFriend(lid) {
    var f = UI.store.friends[lid]; if (!f) return;
    var best = UI.store.bestOf(f.content_hash);
    modal('<h2>' + esc(R.titleText(f.content.title)) + '</h2><p class="muted">ユーザー作品・制作：' + signHtml(f.sign) + '（運営の試験ではありません）</p>' +
      '<div class="canvas-box"><img style="width:100%;display:block" alt="" src="' + thumbURL('f' + f.content_hash, f.content) + '"></div>' +
      '<div class="stats"><div>自己ベスト<b>' + (best ? sec(best) + '秒' : '—') + '</b></div><div>作者クリア<b>' + sec(E.replay(f.content, f.runs).frames) + '秒</b></div><div>外観<b>' + esc(D.THEMES[f.content.theme].name) + '</b></div></div>' +
      '<div class="foot"><button class="btn ghost small" data-a="block">この作者を非表示</button><button class="btn ghost small" data-a="report">通報</button><button class="btn" data-a="memo">攻略メモ</button><button class="btn primary big" data-a="play">遊ぶ</button></div>', function (b) {
      b.onclick = function (e) {
        var a = e.target.getAttribute('data-a'); if (!a) return;
        if (a === 'play') { closeModal(); playFriend(f, 'friend'); }
        if (a === 'report') reportDialog(lid);
        if (a === 'memo') memoDialog(lid);
        if (a === 'block') confirmBox('作者を非表示', 'この制作者（' + signHtml(f.sign) + '）の試験を、この端末で表示しないようにします。設定からもとに戻せます。', '非表示にする', function () { UI.store.blockOwner(f.owner_id, true); toast('非表示にしました。'); renderCatalog(); });
      };
    });
  }
  function playFriend(f, kind) {
    show('play');
    var lid = f.level_id || f.lid;
    UI.store.log('level_start', { level: lid });
    PLAY.start({
      level: f.content, kind: kind, title: R.titleText(f.content.title), player: playerObj(), examiner: null, lefty: UI.store.profile.settings.leftHanded, fxCols: fxCols(),
      onRetry: function () { UI.store.log('level_retry', { level: lid }); },
      onAttempt: function (r) { UI.store.addAttempt({ level_id: lid, content_hash: f.content_hash, kind: kind, player: kind === 'guest' ? UI.store.guestId() : undefined, result: r.status === 'clear' ? 'clear' : r.status === 'timeout' ? 'timeout' : r.status === 'quit' ? 'quit' : 'fail', frames: r.frames, deaths: r.deaths }); },
      onEnd: function (r) {
        UI.store.log('level_finish', { level: lid, status: r.status });
        if (r.status === 'quit') { if (kind === 'guest') go('analysis', lid); else go('catalog'); return; }
        resultPanel({ kind: kind, res: r, f: f, lid: lid, hash: f.content_hash });
      }
    });
  }
  function importDialog(prefill) {
    modal('<h2>試験コードを読みこむ</h2><p class="muted">友だちからもらった「KRK1-」ではじまるコードを貼りつけてください。読みこむときに、部品の検査と作者クリアの記録の再生で、遊べる試験かを確かめます。</p>' +
      '<textarea class="code" id="imp-code" placeholder="KRK1-...">' + esc(prefill || '') + '</textarea><div class="foot"><button class="btn ghost" data-a="no">やめる</button><button class="btn primary" data-a="ok">読みこむ</button></div>', function (b) {
      b.onclick = function (e) {
        var a = e.target.getAttribute('data-a');
        if (a === 'no') closeModal();
        if (a === 'ok') {
          var r = UI.store.importLevel($('imp-code').value);
          if (!r.ok) { SND.play('ng'); toast(r.error, 4000); return; }
          closeModal(); toast(r.updated ? '試験を新しい版に更新しました。' : '友だちの試験を受け取りました！'); UI.tab = 'friends'; renderCatalog();
        }
      };
    });
  }
  UI.importDialog = importDialog;
  function memoDialog(lid) {
    var r = UI.store.makeResult(lid);
    if (!r.ok) { toast(r.error); return; }
    modal('<h2>攻略メモ</h2><p class="muted">このコードを作者に送ると、作者の端末で「どこで失敗が多かったか」が見られます（名前などの個人情報は入っていません）。</p><textarea class="code" readonly id="memo-code">' + esc(r.code) + '</textarea><div class="foot"><button class="btn ghost" data-a="no">とじる</button><button class="btn primary" data-a="copy">コピー</button></div>', function (b) {
      b.onclick = function (e) { var a = e.target.getAttribute('data-a'); if (a === 'no') closeModal(); if (a === 'copy') copyText(r.code); };
    });
  }
  function reportDialog(lid) {
    modal('<h2>通報</h2><p class="muted">問題のある試験を知らせます。この端末ではすぐに表示を止め、運営が確認します（通報の数だけで消すことはしません）。</p><div class="choice" id="rep-cat">' + D.REPORTS.map(function (r) { return '<button data-val="' + r.id + '">' + r.name + '</button>'; }).join('') + '</div>' +
      '<div class="foot"><button class="btn ghost" data-a="no">やめる</button><button class="btn primary" data-a="ok">通報する</button></div>', function (b) {
      var cat = null;
      b.onclick = function (e) {
        var v = e.target.getAttribute('data-val');
        if (v) { cat = v; b.querySelectorAll('#rep-cat button').forEach(function (x) { x.classList.toggle('on', x === e.target); }); return; }
        var a = e.target.getAttribute('data-a');
        if (a === 'no') closeModal();
        if (a === 'ok') { if (!cat) { toast('種類を選んでください。'); return; } UI.store.report(lid, cat); closeModal(); toast('通報しました。この試験は表示を止めました。'); go('catalog'); }
      };
    });
  }
  function copyText(t) {
    function done() { toast('コピーしました。'); }
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, fallback); return; } } catch (e) { /* 下へ */ }
    fallback();
    function fallback() { var ta = document.querySelector('#modal-box textarea'); if (ta) { ta.focus(); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした。文字を長押しして選んでください。'); } } }
  }

  /* ================= 工房（自分の作品） ================= */
  function stateBadges(l) {
    var d = UI.store.getVersion(l.draft), lv = UI.store.getVersion(l.live), pv = UI.store.getVersion(l.priv), h = '';
    if (lv) h += '<span class="pill green">公開中 v' + lv.n + '</span>';
    if (pv) h += '<span class="pill gray">' + ST.STATES[pv.state] + ' v' + pv.n + '</span>';
    if (d) { var cls = d.state === 'cleared' ? 'green' : d.state === 'review' ? 'ai' : d.state === 'invalid' || d.state === 'rejected' ? 'shu' : ''; h += '<span class="pill ' + cls + '">' + (lv || pv ? '新版 v' + d.n + '：' : '') + ST.STATES[d.state] + '</span>'; }
    return h;
  }
  function renderWorkshop() {
    var el = $('scr-workshop'), s = UI.store, list = s.list(), wt = s.weeklyTopic();
    var h = bar('工房（自分の作品）', 'home') + '<div class="scroll"><div class="wrap">';
    h += '<div class="slots"><span class="slot">下書き <b>' + s.draftCount() + '</b>／' + s.draftLimit() + '</span><span class="slot">公開枠 <b>' + s.publishedCount() + '</b>／' + D.LIMIT.published + '</span><span class="slot">制作者の看板：<b>' + signHtml(s.profile.sign) + '</b></span></div>';
    h += '<div class="flow"><span>下書き</span>→<span>検証</span>→<span>作者クリア</span>→<span>公開申請</span>→<span>審査</span>→<span>公開中</span>→<span>攻略メモで改良</span>→<span>新版</span></div>';
    h += '<div class="row"><button class="btn primary big" data-a="new">＋ 新しく作る</button><button class="btn" data-a="memo">攻略メモを読みこむ</button>' + (s.profile.settings.operator ? '<button class="btn ghost" data-a="op">運営画面（試作）</button>' : '') + '</div>';
    h += '<div class="note" style="margin-top:10px">今週のお題：<b>' + esc(wt.topic.name) + '</b>。お題に合う試験を作者クリアすると、修行印を' + D.SEAL.weekly + 'つ受け取れます（週に1回）。' + (s.profile.weekly[wt.week] ? '<b>今週は受け取り済み。</b>' : '') + '</div>';
    if (!list.length) h += '<p class="empty">まだ作品はありません。「新しく作る」で見本を選ぶと、1か所変えるだけで自分の試験になります。<br>公開は必須ではありません。作って自分で遊ぶだけでも大丈夫です。</p>';
    h += '<div class="list" style="margin-top:12px">';
    list.forEach(function (l) {
      var d = s.getVersion(l.draft), lv = s.getVersion(l.live), pv = s.getVersion(l.priv), cur = d || lv || pv;
      if (!cur) return;
      var btns = '';
      if (d && ST.EDITABLE[d.state]) btns += '<button class="btn small primary" data-a="edit" data-l="' + l.level_id + '">編集</button>';
      if (d && d.state === 'cleared') btns += '<button class="btn small green" data-a="submit" data-l="' + l.level_id + '">公開申請</button>';
      if (d && d.state === 'review') btns += '<button class="btn small" data-a="withdraw" data-l="' + l.level_id + '">申請を取り消す</button>';
      if (lv) btns += '<button class="btn small ai" data-a="code" data-l="' + l.level_id + '">試験コード</button><button class="btn small" data-a="analysis" data-l="' + l.level_id + '">分析</button>';
      if ((lv || pv) && !d) btns += '<button class="btn small" data-a="newver" data-l="' + l.level_id + '">新版を作る</button>';
      if (lv) btns += '<button class="btn small ghost" data-a="unpub" data-l="' + l.level_id + '">非公開にする</button>';
      if (pv && !d) btns += '<button class="btn small" data-a="resub" data-l="' + l.level_id + '">再申請</button>';
      if (d && d.state !== 'review') btns += '<button class="btn small ghost" data-a="del" data-l="' + l.level_id + '">' + (lv || pv ? '新版を消す' : '削除') + '</button>';
      if (d && d.clear && d.state === 'cleared' && s.meetsTopic(wt.topic, d.content, d.clear.frames) && !s.profile.weekly[wt.week]) btns += '<button class="btn small" data-a="weekly" data-l="' + l.level_id + '">お題の修行印</button>';
      var rej = d && d.state === 'rejected' && d.reject ? '<div class="note" style="margin-top:6px">差戻しの理由：<b>' + esc(d.reject.text) + '</b>' + (d.reject.cell ? '（直す場所：' + d.reject.cell.x + ',' + d.reject.cell.y + '）' : '') + '。直して作者クリアし、もう一度申請できます。</div>' : '';
      h += '<div class="work"><img class="thumb" alt="" src="' + RD.thumbnail(cur.content, 300, 122).toDataURL() + '"><div class="wt"><b>' + esc(R.titleText(cur.content.title)) + '</b><div class="state">' + stateBadges(l) + '</div>' +
        '<div class="muted">' + esc(D.THEMES[cur.content.theme].name) + '・部品 ' + cur.content.parts.length + '・仕掛け ' + R.countActive(cur.content) + (d && d.clear ? '・作者クリア ' + sec(d.clear.frames) + '秒' : '') + '</div>' + rej + '<div class="row">' + btns + '</div></div></div>';
    });
    h += '</div></div></div>';
    el.innerHTML = h;
    show('workshop');
    bindBack(el);
    el.querySelector('.scroll').onclick = function (e) {
      var t = e.target.closest('[data-a]'); if (!t) return;
      SND.play('tap');
      var a = t.dataset.a, lid = t.dataset.l;
      if (a === 'new') templateDialog();
      else if (a === 'memo') memoImportDialog();
      else if (a === 'op') go('operator');
      else if (a === 'edit') openEditor(lid);
      else if (a === 'submit') submitFlow(lid);
      else if (a === 'withdraw') { var w = s.withdraw(lid); toast(w.ok ? '申請を取り消しました。' : w.error); renderWorkshop(); }
      else if (a === 'code') shareDialog(lid);
      else if (a === 'analysis') go('analysis', lid);
      else if (a === 'newver') { var nv = s.newVersion(lid); if (!nv.ok) { toast(nv.error); return; } toast('新しい版を作りました。公開中の版はそのまま遊ばれます。'); openEditor(lid); }
      else if (a === 'unpub') confirmBox('非公開にする', '公開中の版を非公開にします。公開枠が1つ空きます。あとで再申請できます。', '非公開にする', function () { s.unpublish(lid); renderWorkshop(); });
      else if (a === 'resub') { var rs = s.resubmit(lid); toast(rs.ok ? (rs.auto && rs.result && rs.result.approved ? '審査を通って公開されました。' : '再申請しました。') : rs.error, 3500); renderWorkshop(); }
      else if (a === 'del') confirmBox('下書きを消す', 'この下書きを消します。元に戻せません。', '消す', function () { var r = s.deleteDraft(lid); toast(r.ok ? '消しました。' : r.error); renderWorkshop(); }, true);
      else if (a === 'weekly') { var cw = s.claimWeekly(lid); toast(cw.ok ? '今週のお題の修行印を' + cw.seals + 'つ受け取りました！' : cw.error); renderWorkshop(); }
    };
  }
  UI.renderWorkshop = renderWorkshop;
  function templateDialog() {
    if (UI.store.draftCount() >= UI.store.draftLimit()) { toast('下書きがいっぱいです（' + UI.store.draftLimit() + '本まで）。', 3500); return; }
    modal('<h2>見本をえらぶ</h2><p class="muted">見本の1か所を変えるだけで、自分の試験になります。白紙はなれてきたら。</p><div class="tpl">' + STG.TEMPLATES.map(function (t) {
      var lv = R.fromAscii(t.rows, Object.assign({ theme: t.theme }, t.meta || {}));
      return '<button class="card" data-t="' + t.id + '"><img class="thumb" alt="" src="' + thumbURL('t' + t.id, lv) + '"><span class="cb"><span class="ct"><b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small></span></span></button>';
    }).join('') + '</div><div class="foot"><button class="btn ghost" data-a="no">やめる</button></div>', function (b) {
      b.onclick = function (e) {
        if (e.target.getAttribute('data-a') === 'no') { closeModal(); return; }
        var c = e.target.closest('[data-t]'); if (!c) return;
        var r = createFromTemplate(c.dataset.t);
        if (!r.ok) { toast(r.error, 3500); return; }
        closeModal(); openEditor(r.level_id);
      };
    });
  }
  UI.templateDialog = templateDialog;
  function createFromTemplate(tid) {
    var t = STG.TEMPLATES.filter(function (x) { return x.id === tid; })[0];
    var lv = R.fromAscii(t.rows, Object.assign({ theme: t.theme }, t.meta || {}));
    lv.title = { a: Math.floor(Math.random() * D.TITLE_WORDS.a.length), b: D.THEME_ORDER.indexOf(t.theme) >= 0 ? [0, 1, 2][D.THEME_ORDER.indexOf(t.theme)] : 0, c: Math.floor(Math.random() * D.TITLE_WORDS.c.length) };
    return UI.store.create(lv, tid);
  }
  UI.createFromTemplate = createFromTemplate;
  function submitFlow(lid) {
    var s = UI.store, c = s.canSubmit(lid);
    if (!c.ok) { toast(c.error, 3500); return; }
    confirmBox('公開申請', '検証と作者クリアに通った版を、公開の審査に出します。' + (s.profile.settings.autoReview ? '<br><span class="muted">試作版にはサーバーがないため、審査は端末の中で自動で行います（設定で手動の運営画面に切りかえられます）。</span>' : '<br><span class="muted">審査は「運営画面（試作）」で行います。</span>') + '<br>公開すると「試験コード」で友だちに渡せます。', '申請する', function () {
      var r = s.submit(lid);
      if (!r.ok) { toast(r.error, 3500); return; }
      if (r.auto && r.result) toast(r.result.approved ? '審査を通って公開されました！「試験コード」で友だちに渡せます。' : '差戻しになりました：' + (r.result.reason ? r.result.reason.name : ''), 4200);
      else toast('申請しました。審査待ちです。');
      UI.emit('submit', { level: lid, result: r });
      renderWorkshop();
    });
  }
  function shareDialog(lid) {
    var r = UI.store.shareCode(lid);
    if (!r.ok) { toast(r.error); return; }
    modal('<h2>試験コード</h2><p class="muted">このコードを友だちに送ると、友だちの「友だちの試験」で遊べます。コードには試験の部品と作者クリアの記録が入っています（名前や文章は入りません）。知っている人とだけ交換してください。</p><textarea class="code" readonly>' + esc(r.code) + '</textarea><div class="foot"><button class="btn ghost" data-a="no">とじる</button><button class="btn primary" data-a="copy">コピー</button></div>', function (b) {
      b.onclick = function (e) { var a = e.target.getAttribute('data-a'); if (a === 'no') closeModal(); if (a === 'copy') copyText(r.code); };
    });
  }
  function memoImportDialog() {
    modal('<h2>攻略メモを読みこむ</h2><p class="muted">友だちが遊んだあとに作った「KRR1-」ではじまるコードを貼りつけてください。分析で、失敗の多い場所が見られます。</p><textarea class="code" id="memo-in" placeholder="KRR1-..."></textarea><div class="foot"><button class="btn ghost" data-a="no">やめる</button><button class="btn primary" data-a="ok">読みこむ</button></div>', function (b) {
      b.onclick = function (e) {
        var a = e.target.getAttribute('data-a');
        if (a === 'no') closeModal();
        if (a === 'ok') { var r = UI.store.importResult($('memo-in').value); if (!r.ok) { SND.play('ng'); toast(r.error, 3500); return; } closeModal(); toast('攻略メモを読みこみました（挑戦 ' + r.result.attempts + '回）。'); go('analysis', r.result.level_id); }
      };
    });
  }

  /* ================= 作る ================= */
  function openEditor(lid) {
    show('editor');
    var ok = ED.open({
      store: UI.store, levelId: lid, player: playerObj(), toast: toast,
      onEvent: function (n, d) { UI.emit(n, d); },
      onTitle: titleDialog, onHistory: historyDialog
    });
    if (!ok) { toast('この版は書き換えられません。'); renderWorkshop(); return; }
    UI.emit('editor', { level: lid });
    var v = UI.store.draftOf(lid);
    if (v && v.reject && v.reject.cell) setTimeout(function () { ED.focusCell(v.reject.cell); toast('差戻しの直す場所：' + v.reject.text, 3500); }, 300);
  }
  UI.openEditor = openEditor;
  function bindEditorButtons() {
    $('ed-back').addEventListener('click', function () { SND.play('tap'); ED.flush(); renderWorkshop(); });
    $('ed-check').addEventListener('click', function () { SND.play('tap'); checkDialog(); });
    $('ed-test').addEventListener('click', function () { SND.play('tap'); testEditor(); });
    $('ed-suggest').addEventListener('click', function () { SND.play('tap'); suggestDialog(); });
    $('ed-menu').addEventListener('click', function () { SND.play('tap'); editorMenu(); });
  }
  function checkDialog() {
    var lid = ED.levelId(); ED.flush();
    var r = UI.store.check(lid); if (!r.ok) { toast(r.error); return; }
    var res = r.result;
    var items = res.errors.map(function (e) { return '<li>' + esc(e.msg) + (e.at ? '<button class="btn small ghost" data-at="' + e.at.x + ',' + e.at.y + '">場所</button>' : '') + '</li>'; }).join('') +
      res.warnings.map(function (e) { return '<li class="w">' + esc(e.msg) + (e.at ? '<button class="btn small ghost" data-at="' + e.at.x + ',' + e.at.y + '">場所</button>' : '') + '</li>'; }).join('');
    modal('<h2>検証の結果</h2>' + (res.ok ? '<p><span class="pill green">テストできます</span> 構造の検査に合格しました。' + (res.warnings.length ? '気になる所があります（テストで確かめてください）。' : '') + '</p>' : '<p><span class="pill shu">修正が必要です</span> 次の所を直すとテストできます。</p>') +
      (items ? '<ul class="vlist">' + items + '</ul>' : '') +
      '<p class="muted" style="margin-top:8px">検証は「形」の検査です。時間で動く罠や足場の攻略までは確かめられないので、公開には作者の実際のクリア（テスト）が必要です。</p>' +
      '<div class="foot"><button class="btn ghost" data-a="no">とじる</button>' + (res.ok ? '<button class="btn primary" data-a="test">▶ テストする</button>' : '') + '</div>', function (b) {
      b.onclick = function (e) {
        var at = e.target.getAttribute('data-at');
        if (at) { var p = at.split(','); closeModal(); ED.focusCell({ x: +p[0], y: +p[1] }); return; }
        var a = e.target.getAttribute('data-a');
        if (a === 'no') closeModal();
        if (a === 'test') { closeModal(); testEditor(); }
      };
    });
  }
  function testEditor() {
    var lid = ED.levelId();
    if (!ED.flush()) return;
    var r = UI.store.check(lid);
    if (!r.ok || !r.result.ok) { checkDialog(); return; }
    var content = JSON.parse(JSON.stringify(ED.content()));
    UI.store.log('test_start', { level: lid });
    UI.emit('test_start', { level: lid });
    show('play');
    PLAY.start({
      level: content, kind: 'test', title: 'テスト：' + R.titleText(content.title), player: playerObj(), examiner: null, lefty: UI.store.profile.settings.leftHanded, fxCols: fxCols(),
      onEnd: function (res) {
        if (res.status === 'clear') {
          var rc = UI.store.recordClear(lid, res.runs);
          var v = UI.store.draftOf(lid), can = UI.store.canSubmit(lid);
          PLAY.showOverlay('<div class="panel"><h2>作者クリア！</h2><div class="big-time">' + sec(res.frames) + '<small style="font-size:.4em">秒</small></div>' +
            (rc.ok ? '<p>作者クリアを記録しました（入力の記録を再生して確かめました）。' + (can.ok ? 'このまま公開申請できます。' : '') + '</p>' : '<p>' + esc(rc.error) + '</p>') +
            (res.frames > 90 * 60 ? '<p class="muted">クリアまで90秒をこえました。目安は30〜90秒です。</p>' : '') +
            '<p class="muted">下書きに保存されています。公開は必須ではありません。</p>' +
            '<div class="row center"><button class="btn" data-a="edit">作る画面へ</button>' + (can.ok ? '<button class="btn green" data-a="submit">公開申請へ</button>' : '') + '<button class="btn ghost" data-a="again">もう一度</button></div></div>', function (e) {
            var a = e.target.getAttribute('data-a'); if (!a) return;
            if (a === 'edit') openEditor(lid);
            if (a === 'again') testEditor();
            if (a === 'submit') { renderWorkshop(); submitFlow(lid); }
          });
          UI.emit('creator_clear', { level: lid, frames: res.frames });
        } else {
          PLAY.showOverlay('<div class="panel"><h2>' + (res.status === 'timeout' ? '時間切れ' : 'テストをやめました') + '</h2><p class="muted">作者クリアはまだです。公開するには、自分でクリアする必要があります。</p><div class="row center"><button class="btn primary" data-a="again">もう一度</button><button class="btn" data-a="edit">作る画面へ</button></div></div>', function (e) {
            var a = e.target.getAttribute('data-a'); if (a === 'again') testEditor(); if (a === 'edit') openEditor(lid);
          });
          if (res.status === 'quit') openEditor(lid);
        }
      }
    });
  }
  function editorMenu() {
    var lid = ED.levelId();
    modal('<h2>メニュー</h2><div class="list">' +
      '<button class="btn" data-a="title">題名と外観を変える</button><button class="btn" data-a="history">保存の履歴（前の版に戻す）</button>' +
      '<button class="btn" data-a="check">検証の結果を見る</button><button class="btn green" data-a="submit">公開申請（工房へ）</button>' +
      '<button class="btn ghost" data-a="help">作り方のコツ</button></div><div class="foot"><button class="btn ghost" data-a="no">とじる</button></div>', function (b) {
      b.onclick = function (e) {
        var a = e.target.getAttribute('data-a'); if (!a) return;
        if (a === 'no') closeModal();
        if (a === 'title') titleDialog();
        if (a === 'history') historyDialog();
        if (a === 'check') { closeModal(); checkDialog(); }
        if (a === 'submit') { ED.flush(); closeModal(); renderWorkshop(); submitFlow(lid); }
        if (a === 'help') modal('<h2>作り方のコツ</h2><ul><li>ジャンプは高さ3マス・横4マスまでが目安です。</li><li>扉は天井のある通路に置くと、跳びこえられません。</li><li>水路は6マス以上あると、跳べずに術が必要になります。忍術補給を手前に。</li><li>チェックポイントは危険な物から1マス以上はなしてください。</li><li>移動足場の通り道の上は2マスあけると、はさまれません。</li><li>目標は30〜90秒でクリアできる試験です。</li></ul><div class="foot"><button class="btn" data-a="x">とじる</button></div>', function (bb) { bb.onclick = function (ev) { if (ev.target.getAttribute('data-a') === 'x') closeModal(); }; });
      };
    });
  }
  function titleDialog() {
    var c = ED.content(), t = R.cleanTitle(c.title), W = D.TITLE_WORDS;
    function sel(k) { return '<select data-k="' + k + '">' + W[k].map(function (w, i) { return '<option value="' + i + '"' + (i === t[k] ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('') + '</select>'; }
    modal('<h2>題名と外観</h2><p class="muted">題名は決まった言葉の組み合わせで作ります（自由に文字は入れられません）。</p><div class="row">' + sel('a') + sel('b') + '<span>の</span>' + sel('c') + '</div><p><b id="tt-prev">' + esc(R.titleText(t)) + '</b></p>' +
      '<div class="field"><label>外観テーマ（見た目だけ変わります）</label><div class="choice" id="tt-theme">' + D.THEME_ORDER.map(function (th) { return '<button data-th="' + th + '" class="' + (c.theme === th ? 'on' : '') + '">' + D.THEMES[th].name + '</button>'; }).join('') + '</div></div>' +
      '<div class="foot"><button class="btn primary" data-a="ok">決める</button></div>', function (b) {
      b.onchange = function (e) { var k = e.target.getAttribute('data-k'); if (k) { t[k] = +e.target.value; $('tt-prev').textContent = R.titleText(t); } };
      b.onclick = function (e) {
        var th = e.target.getAttribute('data-th');
        if (th) { ED.setTheme(th); b.querySelectorAll('#tt-theme button').forEach(function (x) { x.classList.toggle('on', x === e.target); }); return; }
        if (e.target.getAttribute('data-a') === 'ok') { ED.setTitle(t); closeModal(); }
      };
    });
  }
  function historyDialog() {
    var lid = ED.levelId(), list = UI.store.autosaves(lid);
    modal('<h2>保存の履歴</h2><p class="muted">自動で保存した、最近の' + D.LIMIT.saves + '回ぶんです。戻すと、いまの状態は取り消しで元に戻せます。</p><div class="list">' + list.slice().reverse().map(function (it, i) {
      var idx = list.length - 1 - i, d = new Date(it.t);
      return '<div class="work" style="grid-template-columns:120px 1fr"><img class="thumb" style="width:120px" alt="" src="' + RD.thumbnail(it.c, 240, 98).toDataURL() + '"><div class="wt"><b>' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + '</b><div class="muted">部品 ' + it.c.parts.length + '</div><div class="row"><button class="btn small" data-i="' + idx + '">この版に戻す</button></div></div></div>';
    }).join('') + '</div><div class="foot"><button class="btn ghost" data-a="no">とじる</button></div>', function (b) {
      b.onclick = function (e) {
        if (e.target.getAttribute('data-a') === 'no') { closeModal(); return; }
        var i = e.target.getAttribute('data-i'); if (i == null) return;
        ED.setContent(list[+i].c, '保存の履歴から戻しました。'); closeModal();
      };
    });
  }

  /* ================= 提案（AI／定型） ================= */
  var SG = { level: 'easy', gimmick: 'water', seed: 1 };
  function suggestDialog(preset) {
    if (preset) { SG.level = preset.level || SG.level; SG.gimmick = preset.gimmick || SG.gimmick; }
    var s = UI.store, useAi = !!s.profile.settings.aiEndpoint, left = s.aiLeft(), c = ED.content();
    modal('<h2>提案をもらう</h2><p class="muted">いまの試験に、仕掛けを1つ足す案を出します。案は部品の置き場所（データ）だけで、必ず検査してから見せます。採用するまで試験は変わりません。</p>' +
      '<div class="field"><label>テーマ</label><b>' + esc(D.THEMES[c.theme].name) + '</b>（題名と外観で変えられます）</div>' +
      '<div class="field"><label>難易度</label><div class="choice" data-g="level">' + D.SUGGEST.levels.map(function (l) { return '<button data-v="' + l.id + '" class="' + (SG.level === l.id ? 'on' : '') + '">' + l.name + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label>主な仕掛け</label><div class="choice" data-g="gimmick">' + D.SUGGEST.gimmicks.map(function (g) { return '<button data-v="' + g.id + '" class="' + (SG.gimmick === g.id ? 'on' : '') + '">' + g.name + '</button>'; }).join('') + '</div></div>' +
      '<p class="muted">' + (useAi ? 'AI の提案（試験機能）：今日あと <b>' + left + '</b> 回。12秒で返事がなければ、定型の提案を出します。失敗は回数に数えません。' : '提案は「定型の提案」（ルールで作る案）です。AI の接続先は設定で入れられます（試験機能）。') + '</p>' +
      '<div class="foot"><button class="btn ghost" data-a="no">やめる</button><button class="btn primary" data-a="go">提案をもらう</button></div>', function (b) {
      b.onclick = function (e) {
        var v = e.target.getAttribute('data-v');
        if (v) { var g = e.target.parentNode.getAttribute('data-g'); SG[g] = v; e.target.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === e.target); }); return; }
        var a = e.target.getAttribute('data-a');
        if (a === 'no') closeModal();
        if (a === 'go') requestSuggestion();
      };
    });
  }
  UI.suggestDialog = suggestDialog;
  function requestSuggestion() {
    var s = UI.store, base = JSON.parse(JSON.stringify(ED.content())), want = { theme: base.theme, level: SG.level, gimmick: SG.gimmick, template_id: 'current' };
    var ep = s.profile.settings.aiEndpoint;
    if (ep && s.aiLeft() > 0) {
      modal('<h2>提案を考えています…</h2><p class="muted">AI の返事を待っています（最大12秒）。</p>');
      aiRequest(ep, base, want).then(function (prop) {
        var chk = R.checkProposal(prop, base);
        if (!chk.ok) throw new Error('AI の案が検査に通りませんでした（' + chk.errors[0] + '）');
        s.aiUse();
        showProposal(base, chk.level, prop, 'AI の提案');
      }).catch(function (err) {
        var r = R.suggest(base, want, ++SG.seed * 7919);
        if (r.ok) showProposal(base, r.level, r.proposal, '定型の提案', 'AI の提案が使えなかったので、定型の提案を出しました（' + esc(err && err.message || err) + '）。回数は減っていません。');
        else noProposal(want);
      });
      return;
    }
    var r2 = R.suggest(base, want, ++SG.seed * 7919);
    if (r2.ok) showProposal(base, r2.level, r2.proposal, '定型の提案'); else noProposal(want);
  }
  function aiRequest(ep, base, want) {
    return new Promise(function (resolve, reject) {
      if (!/^https:\/\//.test(ep)) { reject(new Error('接続先は https のみ')); return; }
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, done = false;
      var timer = setTimeout(function () { if (done) return; done = true; if (ctrl) ctrl.abort(); reject(new Error('12秒で返事がありませんでした')); }, D.LIMIT.aiTimeoutMs);
      // 送るのは部品の数値と選んだ条件だけ（名前や文章は送らない）
      var body = JSON.stringify({ app: 'ninja-karakuri-kobo', schema: D.VERSION.schema, rules: D.VERSION.rules, want: want, level: { theme: base.theme, parts: base.parts, connections: base.connections }, parts: Object.keys(D.PARTS) });
      fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, signal: ctrl ? ctrl.signal : undefined, credentials: 'omit' }).then(function (res) {
        if (!res.ok) throw new Error('接続先のエラー ' + res.status);
        return res.text();
      }).then(function (txt) {
        if (done) return; done = true; clearTimeout(timer);
        if (txt.length > 8000) throw new Error('返事が大きすぎます');
        var j = JSON.parse(txt);
        resolve(j && j.proposal ? j.proposal : j);
      }).catch(function (e) { if (done) return; done = true; clearTimeout(timer); reject(e); });
    });
  }
  function noProposal(want) {
    modal('<h2>いい案が見つかりませんでした</h2><p class="muted">平らな地面が少ないと、仕掛けを足す場所がありません。承認済みの見本から作り直すこともできます。</p><div class="foot"><button class="btn ghost" data-a="no">とじる</button><button class="btn" data-a="tpl">見本をえらぶ</button></div>', function (b) {
      b.onclick = function (e) { var a = e.target.getAttribute('data-a'); if (a === 'no') closeModal(); if (a === 'tpl') { ED.flush(); templateDialog(); } };
    });
  }
  function showProposal(base, lv, prop, label, note) {
    var diff = R.diffLevels(base, lv), cv = RD.makeCanvas(640, 260), ctx = cv.getContext('2d');
    var v = new RD.View(640, 260, 'edit'); v.camX = -(v.visCols - D.GRID.W) / 2;
    RD.drawEditor(ctx, { level: lv, view: v, layer: RD.tileLayer(lv, lv.theme, v), showGrid: true, t: 0 });
    diff.add.forEach(function (p) { R.cellsOf(p).forEach(function (c) { ctx.strokeStyle = '#2a9a5a'; ctx.lineWidth = 3; ctx.strokeRect(v.sx(c[0]) + 1, v.sy(c[1] + 1) + 1, v.T - 2, v.T - 2); }); });
    var names = {}; diff.add.forEach(function (p) { if (p.part_id !== 'floor') names[D.PARTS[p.part_id].name] = 1; });
    modal('<h2>' + esc(label) + '</h2>' + (note ? '<p class="note">' + note + '</p>' : '') + '<div class="canvas-box"><img style="width:100%;display:block" alt="提案のプレビュー" src="' + cv.toDataURL() + '"></div>' +
      '<p>緑の枠が足す所です：<b>' + esc(Object.keys(names).join('・') || '足場') + '</b>（検査に合格した案です）。</p>' +
      '<div class="foot"><button class="btn ghost" data-a="no">やめる</button><button class="btn" data-a="again">別の案</button><button class="btn primary" data-a="ok">採用する</button></div>', function (b) {
      b.onclick = function (e) {
        var a = e.target.getAttribute('data-a');
        if (a === 'no') closeModal();
        if (a === 'again') requestSuggestion();
        if (a === 'ok') { closeModal(); ED.setContent(lv, '提案を採用しました。テストで自分でクリアしてみましょう。'); UI.store.log('ai_draft_accepted', { kind: label }); UI.emit('ai_draft_accepted', {}); }
      };
    });
  }

  /* ================= 分析 ================= */
  function renderAnalysis(lid) {
    var s = UI.store, l = s.mine(lid);
    if (!l) { renderWorkshop(); return; }
    var v = s.getVersion(l.live) || s.getVersion(l.priv) || s.getVersion(l.draft);
    var others = s.othersAttempts(lid, v.content_hash), hints = R.improveHints(v.content, others);
    var heat = {}; others.forEach(function (a) { (a.deaths || []).forEach(function (d) { var k = d.x + ',' + d.y; heat[k] = (heat[k] || 0) + 1; }); });
    var players = {}, clears = 0, times = []; others.forEach(function (a) { players[a.player] = 1; if (a.result === 'clear') { clears++; if (a.frames) times.push(a.frames); } });
    times.sort(function (a, b) { return a - b; });
    var rc = s.reactionsFor(lid, v.content_hash), cnt = { fun: 0, aha: 0, hard: 0 };
    s.results.forEach(function (r) { if (r.level_id === lid && r.content_hash === v.content_hash) Object.keys(r.reactions).forEach(function (k) { if (r.reactions[k]) cnt[k]++; }); });
    var el = $('scr-analysis');
    var h = bar('分析：' + R.titleText(v.content.title), 'workshop') + '<div class="scroll"><div class="wrap">';
    h += '<p class="muted">v' + v.n + '（' + ST.STATES[v.state] + '）の、ほかの人の挑戦（読みこんだ攻略メモ＋この端末で友だちに遊んでもらった挑戦）です。自分のテストは入りません。</p>';
    h += '<div class="canvas-box"><canvas id="an-cv" width="960" height="380"></canvas></div><div class="heat-legend" style="margin:4px 0 8px"><i></i>赤いほど失敗が多い所</div>';
    h += '<div class="kpi"><div>挑戦<b>' + others.length + '回</b></div><div>挑戦した人<b>' + Object.keys(players).length + '人</b></div><div>クリア<b>' + (others.length ? Math.round(clears / others.length * 100) : 0) + '%</b></div><div>クリアの時間（真ん中）<b>' + (times.length ? sec(times[Math.floor(times.length / 2)]) + '秒' : '—') + '</b></div>' +
      D.REACTIONS.map(function (r) { return '<div>' + r.icon + ' ' + r.name + '<b>' + cnt[r.id] + '</b></div>'; }).join('') + '</div>';
    h += '<h2 class="sec">改善の提案</h2>';
    if (!hints.enough) h += '<p class="muted">挑戦がまだ少ないので、提案は出しません（' + R.HINT_MIN.attempts + '回・' + R.HINT_MIN.players + '人以上で出ます。いま ' + hints.attempts + '回・' + hints.players + '人）。</p>';
    else if (!hints.hints.length) h += '<p class="muted">目立った失敗の集中はありません。</p>';
    else h += hints.hints.map(function (x, i) { return '<div class="hint">' + esc(x.msg) + '<small>例：' + esc(x.tip) + '</small>' + (x.at ? '<div class="row" style="margin-top:4px"><button class="btn small" data-fix="' + i + '">新版を作ってこの場所を直す</button></div>' : '') + '</div>'; }).join('');
    h += '<p class="muted">提案は、作者が採用するまで試験には反映されません。</p>';
    h += '<div class="row" style="margin-top:10px"><button class="btn primary" data-a="guest">この端末で友だちに遊んでもらう</button><button class="btn" data-a="memo">攻略メモを読みこむ</button>' + (l.live ? '<button class="btn ai" data-a="code">試験コード</button>' : '') + '</div>';
    h += '</div></div>';
    el.innerHTML = h;
    show('analysis');
    bindBack(el);
    var cv = $('an-cv'), vv = new RD.View(cv.width, cv.height, 'edit'); vv.camX = -(vv.visCols - D.GRID.W) / 2;
    RD.drawEditor(cv.getContext('2d'), { level: v.content, view: vv, layer: RD.tileLayer(v.content, v.content.theme, vv), heat: heat, t: 0, player: playerObj() });
    el.querySelector('.scroll').onclick = function (e) {
      var t = e.target.closest('[data-a],[data-fix]'); if (!t) return;
      SND.play('tap');
      if (t.dataset.fix != null) {
        var hint = hints.hints[+t.dataset.fix], nv = s.newVersion(lid);
        if (!nv.ok && !nv.version_id) { toast(nv.error); return; }
        openEditor(lid); setTimeout(function () { ED.focusCell(hint.at); toast('例：' + hint.tip, 4000); }, 300);
        return;
      }
      var a = t.dataset.a;
      if (a === 'guest') { var f = { level_id: lid, lid: lid, content: v.content, content_hash: v.content_hash, sign: s.profile.sign }; toast('友だちに端末をわたしてください。', 2500); playFriend(f, 'guest'); }
      if (a === 'memo') memoImportDialog();
      if (a === 'code') shareDialog(lid);
    };
  }

  /* ================= 試験官名鑑 ================= */
  function renderRoster() {
    var el = $('scr-roster'), p = UI.store.profile;
    var n = Object.keys(p.cleared).length;
    el.innerHTML = bar('試験官名鑑', 'home') + '<div class="scroll"><div class="wrap"><p class="muted">CryptoNinja の忍者39体が、からくり工房の試験官です。合格すると印がつきます（合格 ' + n + '／39）。キャラクターシートには、原型の公式イラストと公式3Dフィギュア（CC0）と、ゲーム用に描き起こしたゲームの中の姿をのせています。</p><div class="roster">' +
      C.CHARS.map(function (ch) { var ok = p.cleared[ch.exam.stage]; return '<button class="rcard" data-c="' + ch.id + '"><img loading="lazy" alt="' + esc(ch.name) + '" src="sheets/thumb/' + ch.id + '.jpg"><span><b>#' + ch.num + ' ' + esc(ch.name) + '</b><small>第' + ch.exam.stage + '試験「' + esc(ch.exam.title) + '」</small></span>' + (ok ? '<span class="stamp" style="width:34px;height:34px;font-size:.66rem">' + (ok.under ? '秀' : '合格') + '</span>' : '') + '</button>'; }).join('') +
      '</div><p class="muted" style="margin-top:14px"><a href="sheets/">キャラクターシートの一覧ページ</a></p></div></div>';
    show('roster');
    bindBack(el);
    el.querySelector('.roster').onclick = function (e) { var c = e.target.closest('[data-c]'); if (c) { SND.play('tap'); rosterDetail(c.dataset.c); } };
  }
  function rosterDetail(id) {
    var ch = C.BY_ID[id], ok = UI.store.profile.cleared[ch.exam.stage];
    modal('<h2>#' + ch.num + ' ' + esc(ch.name) + '（' + esc(ch.en) + '）</h2><a href="sheets/' + ch.id + '.jpg" target="_blank" rel="noopener"><img class="sheet-img" alt="' + esc(ch.name) + 'のキャラクターシート" src="sheets/' + ch.id + '.jpg"></a>' +
      '<dl class="kv"><dt>クラン</dt><dd>' + esc(ch.clan) + '</dd><dt>忍術</dt><dd>' + esc(ch.jutsu) + '</dd><dt>武器</dt><dd>' + esc(ch.weapon) + '</dd><dt>誕生日</dt><dd>' + esc(ch.birthday) + '</dd>' + (ch.bio ? '<dt>紹介</dt><dd>' + esc(ch.bio) + '</dd>' : '') + '</dl>' +
      '<div class="note">からくり工房では：<b>' + esc(ch.exam.role) + '</b><br>担当：第' + ch.exam.stage + '試験「' + esc(ch.exam.title) + '」／得意な仕掛け：' + esc(ch.exam.skill) + '<br>「' + esc(ch.exam.intro) + '」<br><span class="muted">工房での役とひとことはゲームの創作です（公式の設定ではありません）。</span></div>' +
      '<div class="foot"><button class="btn ghost" data-a="no">とじる</button><button class="btn primary" data-a="play">' + (ok ? 'もう一度挑戦' : 'この試験に挑戦') + '</button></div>', function (b) {
      b.onclick = function (e) { var a = e.target.getAttribute('data-a'); if (a === 'no') closeModal(); if (a === 'play') { closeModal(); go('catalog'); openIntro(ch.exam.stage); } };
    });
  }

  /* ================= 身じたく（着がえ・看板・修行印の店） ================= */
  function renderDress() {
    var el = $('scr-dress'), s = UI.store, p = s.profile;
    function owned(setId) { var set = C.APPRENTICE_SETS.filter(function (x) { return x.id === setId; })[0]; return !set.price || p.owned['outfit_' + setId]; }
    var h = bar('身じたく', 'home') + '<div class="scroll"><div class="wrap"><div class="dress"><div class="me">' + A.render(C.apprenticeArt(p.outfit, p.hair), { pose: 'stand', yaw: -20, w: 160, h: 208, viewBox: '0 -20 200 260' }) + '</div><div>';
    h += '<h2 class="sec">装束</h2><div class="choice">' + C.APPRENTICE_SETS.map(function (st) { return '<button data-outfit="' + st.id + '" class="' + (p.outfit === st.id ? 'on' : '') + '"><span class="sw" style="background:' + st.top + '"></span>' + st.name + (owned(st.id) ? '' : '（印' + st.price + '）') + '</button>'; }).join('') + '</div>';
    h += '<h2 class="sec">髪型</h2><div class="choice">' + C.APPRENTICE_HAIR.map(function (hh) { return '<button data-hair="' + hh.id + '" class="' + (p.hair === hh.id ? 'on' : '') + '">' + hh.name + '</button>'; }).join('') + '</div>';
    h += '<h2 class="sec">合格の演出</h2><div class="choice"><button data-fx="" class="' + (!p.fx ? 'on' : '') + '">いつもの紙ふぶき</button>' + D.SHOP.filter(function (x) { return x.kind === 'fx'; }).map(function (x) { return '<button data-fx="' + x.id + '" class="' + (p.fx === x.id ? 'on' : '') + '">' + x.name + (p.owned[x.id] ? '' : '（印' + x.price + '）') + '</button>'; }).join('') + '</div>';
    var W = D.SIGN_WORDS;
    h += '<h2 class="sec">制作者の看板</h2><p class="muted">作品に出る制作者の名前です（決まった言葉の組み合わせ）。</p><div class="row">' + ['a', 'b', 'c'].map(function (k) { return '<select data-sign="' + k + '">' + W[k].map(function (w, i) { return '<option value="' + i + '"' + (p.sign[k] === i ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('') + '</select>'; }).join('') + '</div><p><b id="sign-prev">' + signHtml(p.sign) + '</b></p>' +
      '<div class="choice">' + [[0, '飾りなし', ''], [1, '金ぶち', 'sign_kin'], [2, '花', 'sign_hana']].map(function (f) { return '<button data-frame="' + f[0] + '" class="' + ((p.sign.f || 0) === f[0] ? 'on' : '') + '">' + f[1] + (f[2] && !p.owned[f[2]] ? '（印' + D.SHOP.filter(function (x) { return x.id === f[2]; })[0].price + '）' : '') + '</button>'; }).join('') + '</div>';
    h += '</div></div>';
    h += '<h2 class="sec">修行印の店</h2><p class="muted">修行印は運営の試験の合格・目標タイム以内の合格・週のお題・はじめの案内でもらえます。自分の作品を作ったり周回したりするだけでは増えません。見た目だけが変わり、現実のお金では買えません。</p><div class="shop">' +
      D.SHOP.map(function (x) { var has = !!p.owned[x.id]; return '<div class="item"><b>' + esc(x.name) + '</b><span class="muted">' + esc(x.desc || '見習いの装束の色が変わります。') + '</span><div class="row"><span class="pill shu">印 ' + x.price + '</span>' + (has ? '<span class="pill green">持っている</span>' : '<button class="btn small" data-buy="' + x.id + '"' + (p.seals < x.price ? ' disabled' : '') + '>交換する</button>') + '</div></div>'; }).join('') + '</div>';
    h += '</div></div>';
    el.innerHTML = h;
    show('dress');
    bindBack(el);
    var sc = el.querySelector('.scroll');
    sc.onclick = function (e) {
      var t = e.target.closest('button'); if (!t) return;
      SND.play('tap');
      if (t.dataset.outfit) { if (!owned(t.dataset.outfit)) { toast('修行印の店で交換すると着られます。'); return; } p.outfit = t.dataset.outfit; s.saveProfile(); renderDress(); }
      if (t.dataset.hair) { p.hair = t.dataset.hair; s.saveProfile(); renderDress(); }
      if (t.dataset.fx != null) { if (t.dataset.fx && !p.owned[t.dataset.fx]) { toast('修行印の店で交換すると使えます。'); return; } p.fx = t.dataset.fx; s.saveProfile(); renderDress(); }
      if (t.dataset.frame != null) { var fr = +t.dataset.frame, need = fr === 1 ? 'sign_kin' : fr === 2 ? 'sign_hana' : ''; if (need && !p.owned[need]) { toast('修行印の店で交換すると使えます。'); return; } p.sign.f = fr; s.saveProfile(); renderDress(); }
      if (t.dataset.buy) { var r = s.buy(t.dataset.buy); toast(r.ok ? '交換しました！' : r.error); renderDress(); }
    };
    sc.onchange = function (e) { var k = e.target.getAttribute('data-sign'); if (k) { p.sign[k] = +e.target.value; s.saveProfile(); $('sign-prev').innerHTML = signHtml(p.sign); } };
  }

  /* ================= 記録 ================= */
  function renderRecords() {
    var el = $('scr-records'), s = UI.store, p = s.profile, k = s.kpi();
    var cleared = Object.keys(p.cleared).length, under = Object.keys(p.cleared).filter(function (id) { return p.cleared[id].under; }).length;
    var h = bar('記録', 'home') + '<div class="scroll"><div class="wrap">';
    h += '<div class="kpi"><div>合格した試験<b>' + cleared + '／39</b></div><div>目標タイム以内<b>' + under + '</b></div><div>修行印<b>' + p.seals + '</b></div><div>作った試験<b>' + s.list().length + '</b></div><div>挑戦した試験<b>' + k.levelsStarted + '</b></div><div>受け取った友だちの試験<b>' + Object.keys(s.friends).length + '</b></div></div>';
    h += '<h2 class="sec">試作の計測（この端末の中だけ・外へは送りません）</h2><div class="kpi">' +
      '<div>はじめて作ってから作者クリアまで<b>' + (k.firstBuildMinutes == null ? '—' : k.firstBuildMinutes.toFixed(1) + '分') + '</b>' + (k.firstBuildMinutes != null ? (k.within15 ? '15分以内 ◯' : '15分こえ') : '') + '</div>' +
      '<div>3本以上挑戦<b>' + (k.threeOrMore ? 'はい' : 'まだ') + '</b></div>' +
      ['level_start', 'level_finish', 'level_retry', 'editor_start', 'part_place', 'test_start', 'creator_clear', 'publish_submit', 'publish_approve', 'publish_reject', 'level_report', 'ai_draft_accepted'].map(function (n) { return '<div>' + n + '<b>' + (k.counts[n] || 0) + '</b></div>'; }).join('') + '</div>';
    h += '<h2 class="sec">運営の試験の自己ベスト</h2><div class="list">' + STG.STAGES.map(function (st) { var r = p.cleared[st.id], ex = C.BY_STAGE[st.id]; return r ? '<div class="slot">第' + st.id + '試験「' + esc(ex.exam.title) + '」 <b>' + sec(r.best) + '秒</b>' + (r.under ? ' <span class="pill gold">目標以内</span>' : '') + '</div>' : ''; }).join('') + '</div>';
    h += '<div class="row" style="margin-top:14px"><button class="btn" data-a="export">記録を書き出す（JSON）</button></div>';
    h += '</div></div>';
    el.innerHTML = h;
    show('records');
    bindBack(el);
    el.querySelector('[data-a="export"]').onclick = function () {
      var blob = new Blob([JSON.stringify(s.exportAll(), null, 1)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'karakuri-kobo-records.json'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };
  }

  /* ================= 設定 ================= */
  function renderSettings() {
    var el = $('scr-settings'), s = UI.store, st = s.profile.settings;
    function tg(key, title, sub) { return '<div class="setting"><div><b>' + title + '</b><small>' + sub + '</small></div><button class="toggle' + (st[key] ? ' on' : '') + '" data-tg="' + key + '" aria-label="' + title + '"></button></div>'; }
    var blocked = Object.keys(s.profile.blockedOwners);
    var h = bar('設定', 'home') + '<div class="scroll"><div class="wrap">' +
      tg('sound', '効果音', 'ジャンプや合格の音') + tg('leftHanded', '左ききの配置', 'ジャンプと術のボタンを左側に') + tg('reduceMotion', '動きを少なく', '画面のゆれや点めつをおさえる') +
      '<h2 class="sec">試作の確認用</h2>' +
      tg('autoReview', '公開申請を自動で審査する', 'サーバーがない試作版では、端末の中で検査して公開します。切ると「運営画面」で手で審査します') +
      tg('operator', '運営画面を表示する', '審査（承認・差戻し）と通報の確認の画面を、工房に出します') +
      '<div class="setting"><div><b>AI の提案の接続先（試験機能）</b><small>https の URL。部品の数値と選んだ条件だけを送り、返ってきた案は必ず検査します。空なら定型の提案だけを使います。</small><input class="text" id="ai-ep" placeholder="https://..." value="' + esc(st.aiEndpoint) + '"></div></div>' +
      (blocked.length ? '<div class="setting"><div><b>非表示にしている作者</b><small>' + blocked.length + '人</small></div><button class="btn small" data-a="unblock">すべて表示に戻す</button></div>' : '') +
      '<h2 class="sec">データ</h2><div class="setting"><div><b>この端末のデータを消す</b><small>作品・記録・修行印がすべて消えます</small></div><button class="btn small primary" data-a="reset">消す</button></div>' +
      '<p class="muted">記録はこの端末の中だけに保存します（名前やメールアドレスの入力はありません）。' + (s.writable ? '' : '<b>この端末では保存ができないようです（プライベートモードなど）。</b>') + '</p>' +
      '<p class="muted"><a href="about.html">遊び方・保護者の方へ</a> ／ <a href="sheets/">キャラクターシート</a> ／ ルールの版 ' + D.VERSION.rules + '</p></div></div>';
    el.innerHTML = h;
    show('settings');
    bindBack(el);
    el.querySelector('.scroll').onclick = function (e) {
      var t = e.target.closest('[data-tg],[data-a]'); if (!t) return;
      if (t.dataset.tg) { st[t.dataset.tg] = !st[t.dataset.tg]; s.saveProfile(); SND.set(st.sound); SND.play('tap'); t.classList.toggle('on', !!st[t.dataset.tg]); applySettings(); }
      if (t.dataset.a === 'unblock') { s.profile.blockedOwners = {}; s.saveProfile(); renderSettings(); }
      if (t.dataset.a === 'reset') confirmBox('データを消す', 'この端末の、からくり工房のデータをすべて消します。元に戻せません。', 'すべて消す', function () {
        try { Object.keys(root.localStorage).forEach(function (k) { if (k.indexOf('kk1.') === 0) root.localStorage.removeItem(k); }); } catch (x) { /* なし */ }
        root.location.reload();
      }, true);
    };
    $('ai-ep').onchange = function () { var v = this.value.trim(); if (v && !/^https:\/\//.test(v)) { toast('https の URL を入れてください。'); return; } st.aiEndpoint = v; s.saveProfile(); toast(v ? '接続先を保存しました。' : '接続先を消しました。'); };
  }
  function applySettings() {
    var st = UI.store.profile.settings;
    SND.set(st.sound);
    document.documentElement.classList.toggle('reduce', !!st.reduceMotion);
  }

  /* ================= 運営画面（試作の確認用） ================= */
  function renderOperator() {
    var el = $('scr-operator'), s = UI.store, cases = s.openCases();
    var h = bar('運営画面（試作）', 'workshop') + '<div class="scroll"><div class="wrap"><div class="note">試作版の確認用の画面です（本番ではサーバーの運営画面になります）。審査のときは、作品のプレビュー・検証の結果・作者クリアの記録・過去の差戻しを見て判断します。部品だけでも不適切な形は作れるので、人の目で確かめます。</div>';
    if (!cases.length) h += '<p class="empty">いま確認待ちはありません。</p>';
    cases.forEach(function (mc) {
      var past = s.mod.filter(function (m) { return m.level_id === mc.level_id && m.status === 'rejected'; });
      if (mc.kind === 'review') {
        var v = s.getVersion(mc.version_id), val = R.validate(v.content);
        h += '<div class="work" style="grid-template-columns:1fr"><div class="wt"><b>審査：' + esc(R.titleText(v.content.title)) + ' v' + v.n + '</b><div class="muted">制作：' + signHtml(s.profile.sign) + '・申請 ' + new Date(mc.created_at).toLocaleString() + '</div>' +
          '<div class="canvas-box" style="margin:6px 0"><canvas data-prev="' + mc.case_id + '" width="960" height="380"></canvas></div>' +
          '<div class="muted">検証：' + (val.ok ? '合格' : '不合格 ' + val.errors.length + '件') + (val.warnings.length ? '（注意 ' + val.warnings.length + '件）' : '') + '／作者クリア：' + (v.clear ? sec(v.clear.frames) + '秒・失敗' + v.clear.deaths + '回' : 'なし') + '／過去の差戻し：' + past.length + '回</div>' +
          '<div class="field"><label>差戻しの理由</label><select data-reason="' + mc.case_id + '">' + D.REJECT_REASONS.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + '</option>'; }).join('') + '</select> <span class="muted">直す場所：プレビューをタップ <b data-cellout="' + mc.case_id + '">なし</b></span></div>' +
          '<div class="row"><button class="btn small ai" data-replay="' + mc.case_id + '">作者クリアを再生</button><button class="btn small green" data-approve="' + mc.case_id + '">承認</button><button class="btn small primary" data-reject="' + mc.case_id + '">差戻し</button></div></div></div>';
      } else {
        var f = s.friends[mc.level_id], cat = D.REPORTS.filter(function (r) { return r.id === mc.category; })[0];
        h += '<div class="work" style="grid-template-columns:1fr"><div class="wt"><b>通報：' + (f ? esc(R.titleText(f.content.title)) : mc.level_id) + '</b><div class="muted">種類：' + esc(cat ? cat.name : mc.category) + '・この端末では一時停止中</div>' +
          (f ? '<div class="canvas-box" style="margin:6px 0"><img style="width:100%;display:block" alt="" src="' + thumbURL('f' + f.content_hash, f.content) + '"></div>' : '') +
          '<div class="row"><button class="btn small green" data-restore="' + mc.case_id + '">問題なし（表示に戻す）</button><button class="btn small" data-keep="' + mc.case_id + '">停止のまま</button></div></div></div>';
      }
    });
    h += '</div></div>';
    el.innerHTML = h;
    show('operator');
    bindBack(el);
    var cells = {};
    el.querySelectorAll('canvas[data-prev]').forEach(function (cv) {
      var mc = s.findCase(cv.dataset.prev), v = s.getVersion(mc.version_id), vv = new RD.View(cv.width, cv.height, 'edit'); vv.camX = -(vv.visCols - D.GRID.W) / 2;
      function drawIt() { RD.drawEditor(cv.getContext('2d'), { level: v.content, view: vv, layer: RD.tileLayer(v.content, v.content.theme, vv), t: 0, errors: cells[mc.case_id] ? [{ at: cells[mc.case_id] }] : [] }); }
      drawIt();
      cv.onclick = function (e) { var r = cv.getBoundingClientRect(), k = cv.width / r.width, c = vv.cell((e.clientX - r.left) * k, (e.clientY - r.top) * k); if (c.x < 0 || c.x >= D.GRID.W || c.y < 0 || c.y >= D.GRID.H) return; cells[mc.case_id] = c; el.querySelector('[data-cellout="' + mc.case_id + '"]').textContent = c.x + ',' + c.y; drawIt(); };
    });
    el.querySelector('.scroll').onclick = function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.approve) { var r = s.approve(t.dataset.approve, 'operator'); toast(r.ok ? '承認しました（公開中）。' : r.error); renderOperator(); }
      if (t.dataset.reject) { var sel = el.querySelector('[data-reason="' + t.dataset.reject + '"]'); s.reject(t.dataset.reject, sel.value, cells[t.dataset.reject] || null, 'operator'); toast('差戻しました。作者に理由と直す場所が伝わります。'); renderOperator(); }
      if (t.dataset.restore) { s.resolveReport(t.dataset.restore, true); toast('表示に戻しました。'); renderOperator(); }
      if (t.dataset.keep) { s.resolveReport(t.dataset.keep, false); toast('停止のままにしました。'); renderOperator(); }
      if (t.dataset.replay) { var mc = s.findCase(t.dataset.replay), v = s.getVersion(mc.version_id); show('play'); PLAY.start({ level: v.content, kind: 'demo', demoRuns: v.clear.runs, title: '作者クリアの再生', player: playerObj(), examiner: null, onEnd: function () { renderOperator(); } }); }
    };
  }

  /* ================= はじめる ================= */
  function boot() {
    var storage = null;
    try { storage = root.localStorage; storage.setItem('kk1.__t', '1'); storage.removeItem('kk1.__t'); } catch (e) { storage = null; }
    UI.store = new ST.Store(storage || new ST.MemStorage());
    if (!storage) UI.store.writable = false;
    applySettings();
    PLAY.bindPad();
    ED.bind();
    bindEditorButtons();
    RD.onSprite(function () { /* 人物の絵が読みこめたら、次のコマで描かれる */ });
    // #t=コード で開かれたら、読みこみの確認
    var m = /[#&]t=(KRK1-[A-Za-z0-9_\-]+)/.exec(root.location.hash || '');
    go('home');
    if (m) setTimeout(function () { importDialog(m[1]); }, 300);
    if (!storage) setTimeout(function () { toast('この端末では記録を保存できません（プライベートモードなど）。遊ぶことはできます。', 5000); }, 800);
    if ('serviceWorker' in navigator && /^https?:/.test(root.location.protocol)) { navigator.serviceWorker.register('sw.js').catch(function () { /* なし */ }); }
    UI.emit('boot', {});
    UI.booted = true;
    document.addEventListener('pointerdown', function once() { SND.unlock(); document.removeEventListener('pointerdown', once); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
