/* ニンジャからくり工房 — 遊ぶ画面（試験の1回の挑戦）
 *
 * 60コマ/秒の固定ステップで engine.step を進め、入力は1コマずつ記録する（作者クリアの確かめに使う）。
 * 失敗したら直近のチェックポイントへ（0.5秒）。はじめからのやり直しは ↺ か R キーの1操作。
 * 操作：← →（A D）で移動、スペース・↑・Z でジャンプ（長押しで高く）、X・↓・Shift で術、R でやり直し、Esc で止める。
 */
(function (root) {
  'use strict';
  var D = root.KK_DATA, E = root.KK_ENGINE, RD = root.KK_RENDER, SND = root.KK_SOUND;
  var $ = function (id) { return document.getElementById(id); };
  var S = null; // いまの挑戦
  var keys = {}, touch = { L: 0, R: 0, J: 0 }, tPress = false, keyHintShown = false;

  function dpr() { return Math.min(2.5, root.devicePixelRatio || 1); }

  function start(opts) {
    stop();
    var lv = opts.level, w = E.createWorld(lv);
    S = {
      o: opts, level: lv, w: w, s: E.initState(w), rec: new E.Recorder(), ev: [], deaths: [], fx: [], anim: {},
      t: 0, acc: 0, last: 0, raf: 0, paused: false, ended: false, retries: 0, hintShown: false, demo: opts.demoRuns ? { runs: opts.demoRuns, i: 0, n: 0 } : null,
      hasJutsu: w.refills.length > 0 || w.waters.length > 0
    };
    $('hud-title').textContent = opts.title || '';
    $('play-over').hidden = true; $('play-say').hidden = true;
    $('hud-jutsu').style.display = S.hasJutsu ? '' : 'none';
    $('pad').querySelector('.pbtn-t').style.display = S.hasJutsu ? '' : 'none';
    $('pad').classList.toggle('lefty', !!opts.lefty);
    $('pad').classList.toggle('hide', !!S.demo);
    resize();
    S.layer = RD.tileLayer(lv, lv.theme, S.view);
    S.view.snap(S.s.px, S.s.py);
    // 見習いの絵を先に用意しておく
    var hp = S.view.T * 1.8;
    ['stand', 'jump', 'fall', 'oops', 'cheer'].forEach(function (p) { [62, -62].forEach(function (y) { RD.sprite(opts.player.key, opts.player.def, p, 0, y, hp); }); });
    for (var f = 0; f < 6; f++) { RD.sprite(opts.player.key, opts.player.def, 'run', f, 62, hp); RD.sprite(opts.player.key, opts.player.def, 'run', f, -62, hp); }
    if (opts.examiner) { RD.sprite(opts.examiner.key, opts.examiner.def, 'stand', 0, -40, S.view.T * 1.75); RD.sprite(opts.examiner.key, opts.examiner.def, 'cheer', 0, -40, S.view.T * 1.75); }
    keys = {}; touch = { L: 0, R: 0, J: 0 }; tPress = false;
    document.querySelectorAll('#pad .pbtn').forEach(function (b) { b.classList.remove('on'); });
    S.last = performance.now();
    S.raf = requestAnimationFrame(frame);
    if (opts.onStart) opts.onStart();
    // キーボードの端末では、最初の1回だけ操作を知らせる
    if (!S.demo && !keyHintShown && $('pad').offsetParent === null) { keyHintShown = true; say(null, 'キーボードの操作', '← → で走る／スペースでジャンプ（長押しで高く）／X で術／R でやり直し／Esc で止める', 5000); }
  }
  function stop() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    S = null;
  }
  function resize() {
    if (!S) return;
    var sec = $('scr-play'), cv = $('play-cv'), W = sec.clientWidth || root.innerWidth, H = sec.clientHeight || root.innerHeight;
    var pad = $('pad'), padOn = pad.offsetParent !== null, portrait = W / H < 4 / 3, padH = portrait && !S.demo && padOn ? pad.offsetHeight || 128 : 0;
    var cssH = Math.max(160, H - padH), k = dpr();
    cv.style.height = cssH + 'px';
    cv.width = Math.round(W * k); cv.height = Math.round(cssH * k);
    var old = S.view;
    // 1マスがだいたい60px以上にならないように（タブレットで拡大しすぎない）。スマホ縦は9マス、横は11マスを最低限にする
    S.view = new RD.View(cv.width, cv.height, 'play', { minCols: Math.max(portrait ? 9 : 11, Math.floor(W / 60)) });
    if (old && S.layer && old.T === S.view.T) { S.view.camX = old.camX; S.view.camY = old.camY; }
    else if (S.level) { S.layer = RD.tileLayer(S.level, S.level.theme, S.view); S.view.snap(S.s.px, S.s.py); }
  }

  /* ---------- 入力 ---------- */
  function mask() {
    var d = S.demo || S.feed; // お手本の再生（feed はテスト用の入力列）
    if (d) {
      var r = d.runs[d.i];
      if (r) {
        var m = r[0];
        if (++d.n >= r[1]) { d.i++; d.n = 0; }
        return m;
      }
      if (S.demo) return 0;
      S.feed = null;
    }
    var m2 = 0;
    if (keys.L || touch.L) m2 |= E.IN.L;
    if (keys.R || touch.R) m2 |= E.IN.R;
    if (keys.J || touch.J) m2 |= E.IN.J;
    if (tPress) { m2 |= E.IN.T; tPress = false; }
    return m2;
  }
  var KEYMAP = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', Space: 'J', ArrowUp: 'J', KeyW: 'J', KeyZ: 'J', KeyX: 'T', ArrowDown: 'T', KeyS: 'T', ShiftLeft: 'T', ShiftRight: 'T' };
  function onKey(e, down) {
    if (!S || document.getElementById('scr-play').className.indexOf(' on') < 0) return;
    var k = KEYMAP[e.code];
    if (down && (e.code === 'KeyR')) { e.preventDefault(); if (!S.ended && !S.demo) retry(); return; }
    if (down && (e.code === 'Escape' || e.code === 'KeyP')) { e.preventDefault(); if (!S.ended) togglePause(); return; }
    if (!k) return;
    e.preventDefault();
    if (k === 'T') { if (down && !e.repeat) tPress = true; return; }
    keys[k] = down ? 1 : 0;
  }
  document.addEventListener('keydown', function (e) { onKey(e, true); });
  document.addEventListener('keyup', function (e) { onKey(e, false); });
  root.addEventListener('blur', function () { keys = {}; touch = { L: 0, R: 0, J: 0 }; });
  // タッチ：指ごとに、いまどのボタンの上にあるかを見る（◀ ▶ のあいだを指をすべらせても切りかわる）
  var fingers = {};
  function btnAt(x, y) { var el = document.elementFromPoint(x, y); while (el && el !== document.body) { if (el.dataset && el.dataset.k) return el; el = el.parentNode; } return null; }
  function refreshTouch() {
    touch = { L: 0, R: 0, J: 0 };
    document.querySelectorAll('#pad .pbtn').forEach(function (b) { b.classList.remove('on'); });
    Object.keys(fingers).forEach(function (id) { var b = fingers[id]; if (b) { var k = b.dataset.k; if (k !== 'T') touch[k] = 1; b.classList.add('on'); } });
  }
  function padDown(e) {
    var b = btnAt(e.clientX, e.clientY); if (!b) return;
    e.preventDefault(); SND.unlock();
    fingers[e.pointerId] = b;
    if (b.dataset.k === 'T') tPress = true;
    try { $('pad').setPointerCapture(e.pointerId); } catch (x) { /* なし */ }
    refreshTouch();
  }
  function padMove(e) { if (!(e.pointerId in fingers)) return; var b = btnAt(e.clientX, e.clientY); if (b && b.dataset.k === 'T') b = fingers[e.pointerId]; fingers[e.pointerId] = b; refreshTouch(); }
  function padUp(e) { delete fingers[e.pointerId]; refreshTouch(); }
  function bindPad() {
    var pad = $('pad');
    pad.addEventListener('pointerdown', padDown);
    pad.addEventListener('pointermove', padMove);
    pad.addEventListener('pointerup', padUp);
    pad.addEventListener('pointercancel', padUp);
    pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    $('btn-retry').addEventListener('click', function () { if (S && !S.ended && !S.demo) retry(); });
    $('btn-pause').addEventListener('click', function () { if (S && !S.ended) togglePause(); });
    root.addEventListener('resize', function () { if (S) resize(); });
  }

  /* ---------- 進める ---------- */
  function frame(ts) {
    if (!S) return;
    S.raf = requestAnimationFrame(frame);
    var dt = Math.min(0.1, Math.max(0, (ts - S.last) / 1000)); S.last = ts;
    if (!S.paused && !S.ended) {
      S.acc += dt;
      var n = 0;
      while (S.acc >= 1 / 60 && n < 8) { tick(); S.acc -= 1 / 60; n++; if (!S || S.ended) break; }
      if (!S) return;
    }
    S.t += dt;
    var s = S.s;
    S.view.follow(s.px, s.py, dt * 7);
    draw();
    hud();
  }
  function tick() {
    var s = S.s, m = mask(), ev = S.ev;
    S.rec.push(m);
    ev.length = 0;
    E.step(S.w, s, m, ev);
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      switch (e.t) {
        case 'jump': SND.play('jump'); break;
        case 'land': SND.play('land'); addFx('dust', s.px, s.py, 0.4); break;
        case 'die':
          S.deaths.push({ x: e.x, y: e.y, cause: e.cause });
          SND.play(e.cause === 'water' ? 'splash' : 'die');
          if (e.cause === 'water') addFx('splash', s.px, s.py, 0.7);
          if (!S.demo && S.o.onDie) S.o.onDie(e, s.deaths);
          if (s.deaths >= 3 && !S.hintShown && S.o.hint) { S.hintShown = true; say(S.o.hint.face, S.o.hint.name, S.o.hint.text, 5200); }
          break;
        case 'respawn': SND.play('respawn'); break;
        case 'switch': SND.play('switch'); addFx('spark', S.w.switches[e.i].x + 0.5, S.w.switches[e.i].y, 0.5); break;
        case 'door': SND.play('door'); break;
        case 'refill': SND.play('refill'); addFx('spark', S.w.refills[e.i].x + 0.5, S.w.refills[e.i].y + 0.3, 0.5, '#8fd0ff'); break;
        case 'jutsu': SND.play('jutsu'); addFx('text', s.px, s.py, 0.9, null, '水渡り！', '#bfe8ff'); break;
        case 'jutsuEnd': SND.play('jutsuEnd'); break;
        case 'check': SND.play('check'); addFx('spark', S.w.checks[e.i].x + 0.4, S.w.checks[e.i].y + 0.8, 0.6, '#f0c040'); addFx('text', S.w.checks[e.i].x + 0.5, S.w.checks[e.i].y, 1, null, 'ここから再開', '#fff3b0'); break;
        case 'clear': SND.play('clear'); addFx('confetti', s.px, s.py, 2.2, S.o.fxCols); end('clear'); return;
        case 'timeout': SND.play('timeout'); end('timeout'); return;
      }
    }
    if (S.demo && S.demo.i >= S.demo.runs.length && s.status < 2) end('quit');
  }
  function addFx(kind, x, y, dur, col, text, tcol) { S.fx.push({ kind: kind, x: x, y: y, t0: S.t, dur: dur, col: col, cols: Array.isArray(col) ? col : null, text: text }); if (text) S.fx[S.fx.length - 1].col = tcol; if (S.fx.length > 30) S.fx.shift(); }
  function draw() {
    var cv = $('play-cv'), ctx = cv.getContext('2d');
    S.fx = S.fx.filter(function (e) { return S.t - e.t0 < e.dur; });
    RD.drawStage(ctx, { view: S.view, world: S.w, state: S.s, theme: S.level.theme, layer: S.layer, t: S.t, player: S.o.player, examiner: S.o.examiner, fx: S.fx, anim: S.anim });
    if (S.demo) { ctx.fillStyle = 'rgba(43,29,22,.75)'; ctx.fillRect(0, cv.height - S.view.T * 0.9, cv.width, S.view.T * 0.9); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(S.view.T * 0.42) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('お手本（試験官の走り方）', cv.width / 2, cv.height - S.view.T * 0.45); }
  }
  var lastHud = '';
  function hud() {
    var s = S.s, left = Math.max(0, Math.ceil((D.LIMIT.timeFrames - s.f) / 60));
    var key = left + '|' + s.charges + '|' + (s.jt > 0 ? Math.ceil(s.jt / 6) : 0);
    if (key === lastHud) return;
    lastHud = key;
    var te = $('hud-time'); te.textContent = left; te.parentNode.classList.toggle('low', left <= 20);
    if (S.hasJutsu) {
      var h = ''; for (var i = 0; i < D.PHYS.chargeMax; i++) h += '<i class="' + (i < s.charges ? 'on' : '') + '"></i>';
      $('hud-jutsu').innerHTML = h;
      $('pad-charges').textContent = '×' + s.charges;
      $('pad').querySelector('.pbtn-t').classList.toggle('off', s.charges <= 0 || s.jt > 0);
    }
    var bar = $('jutsu-bar'); bar.classList.toggle('on', s.jt > 0);
    if (s.jt > 0) bar.firstChild.style.width = (s.jt / D.PHYS.jutsuFrames * 100) + '%';
  }
  function say(faceSvg, name, text, ms) {
    var el = $('play-say');
    el.innerHTML = (faceSvg ? '<div class="sf">' + faceSvg + '</div>' : '') + '<div><span class="gn">' + name + '</span>' + text + '</div>';
    el.hidden = false;
    clearTimeout(say.t); say.t = setTimeout(function () { el.hidden = true; }, ms || 4000);
  }

  /* ---------- やり直し・止める・終わる ---------- */
  function attemptResult(status) {
    return { status: status, frames: S.s.f, deaths: S.deaths.slice(), runs: S.rec.runs.slice(), retries: S.retries, deathsCount: S.s.deaths };
  }
  function retry() {
    if (!S) return;
    if (S.o.onAttempt && S.s.f > 20) S.o.onAttempt(attemptResult('retry'));
    S.retries++;
    S.s = E.initState(S.w); S.rec = new E.Recorder(); S.deaths = []; S.fx = []; S.anim = {}; S.hintShown = S.hintShown && S.retries < 3;
    S.view.snap(S.s.px, S.s.py);
    S.paused = false; $('play-over').hidden = true;
    SND.play('respawn');
    if (S.o.onRetry) S.o.onRetry();
  }
  function togglePause() {
    if (!S) return;
    S.paused = !S.paused;
    var ov = $('play-over');
    if (!S.paused) { ov.hidden = true; return; }
    var o = S.o;
    ov.innerHTML = '<div class="panel"><h2>ひと休み</h2><p class="muted">' + esc(o.title || '') + '</p>' +
      '<div class="row center"><button class="btn primary big" data-a="resume">つづける</button></div>' +
      '<div class="row center" style="margin-top:8px"><button class="btn" data-a="retry">↺ はじめから</button>' +
      (o.canDemo ? '<button class="btn ai" data-a="demo">お手本を見る</button>' : '') +
      '<button class="btn ghost" data-a="quit">やめる</button></div>' +
      '<p class="muted" style="margin-top:10px">操作：◀ ▶ で移動、ジャンプ（長押しで高く）、術で水渡り。キーボードは ← → と スペース、X。</p></div>';
    ov.hidden = false;
    ov.onclick = function (e) {
      var a = e.target.getAttribute('data-a'); if (!a) return;
      if (a === 'resume') togglePause();
      else if (a === 'retry') retry();
      else if (a === 'quit') { end('quit'); }
      else if (a === 'demo') { var cb = o.onDemo; end('quit', true); if (cb) cb(); }
    };
  }
  function end(status, silent) {
    if (!S || S.ended) return;
    S.ended = true; S.paused = false;
    var res = attemptResult(status), o = S.o;
    if (o.onAttempt && !S.demo) o.onAttempt(res);
    if (silent) { stop(); return; }
    // 合格の演出を少し見せてから結果へ
    var delay = status === 'clear' ? 1300 : 350;
    setTimeout(function () { if (!S || S.o !== o) return; if (o.onEnd) o.onEnd(res); }, delay);
  }
  function showOverlay(html, onclick) {
    var ov = $('play-over'); ov.innerHTML = html; ov.hidden = false; ov.onclick = onclick;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  root.KK_PLAY = {
    start: start, stop: stop, retry: retry, bindPad: bindPad, showOverlay: showOverlay, say: say, resize: resize,
    state: function () { return S && S.s; }, active: function () { return !!S; }, runs: function () { return S && S.rec.runs; },
    // テスト用：はじめからやり直して、記録した入力列 [[mask, コマ数], ...] をふつうの進行で流す
    _feed: function (runs) { if (!S) return; retry(); S.feed = { runs: runs.map(function (r) { return r.slice(); }), i: 0, n: 0 }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
