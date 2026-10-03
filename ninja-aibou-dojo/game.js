/* ニンジャ相棒道場 — 進行（保存・画面の切りかえ・修行の実行・操作） */
(function () {
  'use strict';
  var D = window.NAD_DATA, P = window.NAD_POLICY, S = window.NAD_SIM, CH = window.NAD_CHARS, R = window.NAD_R, ST = window.NAD_STORY, L = window.NAD_LINES || {};
  var G = window.NAD = {};
  function $(q) { return document.querySelector(q); }
  G.$ = $;
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  G.esc = esc;

  /* ================= 保存 ================= */
  var BAK = P.SAVE_KEY + '_bak';
  G.S = null; G.E = null;
  function readJSON(key) { try { var t = localStorage.getItem(key); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  G.load = function () {
    G.S = P.migrate(readJSON(P.SAVE_KEY)) || P.migrate(readJSON(BAK));
    G.E = readJSON(P.ENT_KEY) || P.newEntitlements();
    if (!Array.isArray(G.E.owned)) G.E = P.newEntitlements();
    return G.S;
  };
  var saveTimer = 0;
  G.save = function (now) {
    if (!G.S) return;
    clearTimeout(saveTimer);
    var run = function () {
      G.S.updatedAt = Date.now(); G.S.rev = (G.S.rev || 0) + 1;
      trimSave(G.S);
      try {
        var prev = localStorage.getItem(P.SAVE_KEY);
        if (prev) localStorage.setItem(BAK, prev);
        localStorage.setItem(P.SAVE_KEY, JSON.stringify(G.S));
        localStorage.setItem(P.ENT_KEY, JSON.stringify(G.E));
      } catch (e) { if (!G._warnedSave) { G._warnedSave = true; G.toast('この端末では記録を保存できません（プライベートブラウズや空き容量を確認してください）', 3600); } }
    };
    if (now) run(); else saveTimer = setTimeout(run, 200);
  };
  // 古い判断の記録は、点数の内訳を省いて軽くする
  function trimSave(s) {
    var keep = D.BAL.lessonsKeep;
    if (s.lessons.length > keep) s.lessons = s.lessons.slice(-keep);
    var n = s.lessons.length;
    s.lessons.forEach(function (l, i) { if (i < n - 30 && l.cands) l.cands.forEach(function (c) { delete c.parts; }); if (i < n - 30) delete l.snap; });
    if (s.metrics.length > 500) s.metrics = s.metrics.slice(-500);
    if (s.memory.diary.length > 120) s.memory.diary = s.memory.diary.slice(-120);
    if (s.memory.approved.length > 1500) s.memory.approved = s.memory.approved.slice(-1500);
    if (s.photos.length > 40) s.photos = s.photos.slice(-40);
  }
  window.addEventListener('pagehide', function () { G.save(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { G.save(true); if (G.mode === 'training' && G.T && !G.T.st.done) G.pause(true); } });

  // 計測（端末の中だけ。外に送らない）
  G.metric = function (name, data) {
    if (!G.S) return;
    var m = { e: name, t: Date.now() }; if (data) for (var k in data) m[k] = data[k];
    G.S.metrics.push(m);
  };

  /* ================= 小さな画面部品 ================= */
  var toastT = 0;
  G.toast = function (msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 2200);
  };
  // btns: [{label, cls, fn, keep}]
  G.modal = function (html, btns) {
    $('#modal-body').innerHTML = html;
    var box = $('#modal-btns'); box.innerHTML = '';
    (btns || [{ label: 'とじる', cls: 'primary' }]).forEach(function (b) {
      var el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.label;
      el.onclick = function () { if (!b.keep) G.closeModal(); if (b.fn) b.fn(); };
      box.appendChild(el);
    });
    $('#modal').hidden = false;
  };
  G.closeModal = function () { $('#modal').hidden = true; };
  G.confirm = function (msg, fn, okLabel) { G.modal('<p>' + msg + '</p>', [{ label: 'やめる', cls: 'ghost' }, { label: okLabel || 'OK', cls: 'primary', fn: fn }]); };
  G.loading = function (on) { $('#loading').hidden = !on; };

  /* ---- 会話（物語） ---- */
  function voice() { var c = G.S && G.S.companion; return CH.pick(CH.PARTNER_VOICES, c ? c.voice : 'boku'); }
  G.fill = function (t) {
    var c = G.S && G.S.companion, v = voice();
    return String(t).replace(/\{p\}/g, c ? c.name : '相棒').replace(/\{I\}/g, v.I).replace(/\{E\}/g, v.end).replace(/\{V\}/g, v.vend || 'よ');
  };
  G.whoName = function (who) {
    if (who === 'partner') return G.S && G.S.companion ? G.S.companion.name : '相棒';
    if (who === 'nar') return '';
    if (who === 'player') return '見習い';
    var c = CH.BY_ID[who]; return c ? c.name : who;
  };
  G.whoDef = function (who) {
    if (who === 'partner') return G.partnerDef();
    if (who === 'player') return CH.playerArt();
    var c = CH.BY_ID[who]; return c ? c.art : null;
  };
  // lines: [[who, text], ...]  done: 終わったら
  G.talk = function (lines, done) {
    var i = 0, box = $('#talk');
    function show() {
      if (i >= lines.length) { box.hidden = true; box.onclick = null; if (done) done(); return; }
      var ln = lines[i], who = ln[0];
      var def = G.whoDef(who);
      $('#talk-face').innerHTML = def ? R.faceSvg(def, ln[2] || 'normal') : '<div style="font-size:40px;text-align:center;line-height:72px">📜</div>';
      $('#talk-name').textContent = G.whoName(who);
      $('#talk-text').textContent = G.fill(ln[1]);
      $('#talk-btns').innerHTML = '<span class="muted">' + (i + 1) + '/' + lines.length + '　タップで次へ ▶</span>';
      box.hidden = false;
    }
    box.onclick = function () { i++; show(); };
    show();
  };

  /* ================= 相棒・方針 ================= */
  G.shopItem = function (id) { for (var i = 0; i < D.SHOP.length; i++) if (D.SHOP[i].id === id) return D.SHOP[i]; return null; };
  G.partnerDef = function (look, costumeId, weaponId) {
    var c = G.S && G.S.companion || {};
    look = look || c.look || {};
    var cs = G.shopItem(costumeId !== undefined ? costumeId : c.costume);
    var def = CH.partnerArt(look, cs ? cs.patch : null);
    var wp = G.shopItem(weaponId !== undefined ? weaponId : c.weapon);
    if (wp && def.back && def.back.katana) Object.keys(wp.patch).forEach(function (k) { def.back.katana[k] = wp.patch[k]; });
    return def;
  };
  G.slot = function () { return P.activeSlot(G.S); };
  G.policy = function () { return G.slot().policy; };
  G.setPolicy = function (pol) { G.slot().policy = pol; G.save(); };
  G.level = function () { return P.levelOf(G.S.companion.exp || 0); };
  G.owns = function (id) { return G.E.owned.indexOf(id) >= 0; };
  G.today = function () { var d = new Date(); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); };
  G.dayNo = function () { return Math.floor((Date.now() - new Date(2026, 0, 1).getTime()) / 86400000); };
  // 今日の師匠（修行の種類ごとに、39体から日替わり）
  G.todayMaster = function (kind) {
    var ids = CH.CHARS.map(function (c) { return c.id; }).filter(function (id) { return L[id] && L[id].kind === kind; });
    if (!ids.length) return 'hayate';
    var off = { rescue: 0, explore: 5, escort: 9 }[kind] || 0;
    return ids[(G.dayNo() + off + (G.S ? G.S.trainings : 0)) % ids.length];
  };

  /* ================= 画面の切りかえ ================= */
  G.mode = 'title';
  var HOME_EL = ['#home-hud', '#home-cards', '#nav'], TR_EL = ['#tr-hud', '#tr-ctrl'];
  function show(list, on) { list.forEach(function (q) { $(q).hidden = !on; }); }
  G.showHome = function () {
    G.mode = 'home';
    ['#title', '#create', '#review'].forEach(function (q) { $(q).hidden = true; });
    show(TR_EL, false); $('#tr-boss').hidden = true; $('#tr-banner').hidden = true; $('#tr-dec').hidden = true;
    show(HOME_EL, true);
    G.home.visitors = null;
    if (G.ui && G.ui.refreshHome) G.ui.refreshHome();
  };
  G.home = { happyT: 0, talk: null, visitors: null };

  /* ================= ループ ================= */
  var lastT = 0, acc = 0, STEP = 1 / 60;
  function frame(ts) {
    requestAnimationFrame(frame);
    var t = ts / 1000, dt = Math.min(0.1, t - (lastT || t)); lastT = t;
    if (G.mode === 'home' || G.mode === 'story') {
      if (!G.S || !G.S.companion) return;
      if (!G.home.visitors) G.home.visitors = pickVisitors();
      var it = G.S.dojo || {};
      var wall = G.shopItem(it.wall), floor = G.shopItem(it.floor), pose = G.shopItem(G.S.companion.pose);
      R.drawDojo({ time: t, partnerDef: G.partnerDef, masterId: G.homeMaster(), visitors: G.home.visitors, wallText: wall ? wall.text : null, floorColor: floor ? floor.color : null, deco: it.deco, pose: pose ? pose.pose : 'stand', happyT: G.home.happyT, talk: G.home.talk });
      return;
    }
    if (G.mode === 'training' && G.T) {
      var T = G.T;
      if (!T.paused && !T.st.done) {
        acc += dt;
        var n = 0;
        while (acc >= STEP && n < 8) { S.step(T.st, STEP, takeInput()); acc -= STEP; n++; handleSignals(); if (T.st.done || T.paused) break; }
        if (acc > STEP * 8) acc = 0;
      }
      R.drawField(T.st, t, T.sprites);
      updateHud();
    }
  }
  function pickVisitors() {
    var ids = CH.CHARS.map(function (c) { return c.id; }).filter(function (id) { return id !== G.homeMaster(); });
    var d = G.dayNo(), out = [];
    out.push(ids[d % ids.length]); if (G.S.trainings >= 3) out.push(ids[(d * 7 + 11) % ids.length]);
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  G.homeMaster = function () {
    var ch = G.nextChapter();
    if (ch) return ch.master;
    return 'hayate';
  };
  // 次に遊べる章（Lvが足りれば）
  G.nextChapter = function () {
    var S2 = G.S; if (!S2) return null;
    for (var i = 0; i < D.CHAPTERS.length; i++) { var c = D.CHAPTERS[i]; if (S2.chapters.done.indexOf(c.id) < 0) return c; }
    return null;
  };

  /* ================= 修行 ================= */
  G.T = null;
  // cfg: sim の設定。meta: { chapter, masterId, kind, onEnd }
  G.startTraining = function (cfg, meta) {
    var S2 = G.S;
    S2.trainings = S2.trainings || 0;
    cfg.trainingNo = S2.trainings + 1;
    cfg.policy = G.policy(); cfg.slot = G.slot().id;
    cfg.partnerName = S2.companion.name;
    cfg.practice = !!S2.settings.practice;
    cfg.advanced = !!S2.settings.advanced && G.level() >= 6;
    if (!cfg.seed) cfg.seed = P.hashStr(G.today() + '|' + (cfg.kind || '') + '|' + cfg.trainingNo) || 1;
    var st = S.build(cfg);
    G.T = { st: st, meta: meta || {}, cfg: cfg, paused: false, sprites: { player: function () { return CH.playerArt(); }, partner: G.partnerDef }, guide: {}, taught: null, startAt: Date.now(), cmdCool: {} };
    R.clear('partner'); R.setupCam(st);
    G.mode = 'training';
    ['#title', '#create', '#review'].forEach(function (q) { $(q).hidden = true; });
    show(HOME_EL, false); show(TR_EL, true);
    $('#tr-pname').textContent = S2.companion.name;
    if (G.ui && G.ui.closePanel) G.ui.closePanel();
    // よく使う絵を先に作る
    G.loading(true);
    [0, 180, 90, -90, 50, -50].forEach(function (yaw) { for (var f = 0; f < 4; f++) { R.sprite('player', G.T.sprites.player, { yaw: yaw, pose: 'walk', frame: f }, R.cam.T * 1.6); R.sprite('partner', G.partnerDef, { yaw: yaw, pose: 'walk', frame: f }, R.cam.T * 1.6); } });
    var t0 = Date.now();
    (function wait() { if (R.pending() > 4 && Date.now() - t0 < 2500) return setTimeout(wait, 60); G.loading(false); })();
    banner(st.zones.length ? '修行開始！' : '', G.T.meta.title || '');
    if (G.T.meta.chapter === 'ch1') guide('start');
    else if (G.T.meta.masterLine) G.T.bannerSub = G.T.meta.masterLine;
  };
  G.pause = function (on) {
    if (!G.T) return;
    G.T.paused = on;
    if (on && !G.T.st.done && G.mode === 'training' && !G.T.inModal) {
      G.modal('<h3>ひと休み</h3><p>修行を止めています。</p><div class="set-row"><span>練習設定（からくりがゆっくり・弱くなる）</span><input type="checkbox" id="pz-practice"' + (G.S.settings.practice ? ' checked' : '') + '></div><p class="muted">練習設定は、次の修行から効きます。</p>', [
        { label: '道場へもどる（途中でやめる）', cls: 'ghost', fn: function () { G.quitTraining(); } },
        { label: '再開', cls: 'primary', fn: function () { G.T.paused = false; } }]);
      var ck = $('#pz-practice'); if (ck) ck.onchange = function () { G.S.settings.practice = ck.checked; G.save(); };
    }
  };
  G.quitTraining = function () { if (!G.T) return; S.quit(G.T.st); G.T.paused = false; handleSignals(); };

  /* ---- 操作 ---- */
  var keys = {}, stick = { on: false, id: null, x0: 0, y0: 0, dx: 0, dy: 0 }, dodgeReq = false, cmdReq = null;
  window.addEventListener('keydown', function (e) {
    if (G.mode !== 'training') return;
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'Shift') { dodgeReq = true; e.preventDefault(); }
    if (e.key === '1') cmdReq = 'gather'; if (e.key === '2') cmdReq = 'help'; if (e.key === '3') cmdReq = 'back';
    if (e.key === 'Escape') G.pause(true);
    if (/^arrow/i.test(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  function takeInput() {
    var mx = 0, my = 0;
    if (keys.arrowleft || keys.a) mx -= 1; if (keys.arrowright || keys.d) mx += 1;
    if (keys.arrowup || keys.w) my -= 1; if (keys.arrowdown || keys.s) my += 1;
    if (stick.on) { mx = stick.dx; my = stick.dy; }
    var inp = { mx: mx, my: my, dodge: dodgeReq, cmd: cmdReq };
    dodgeReq = false; cmdReq = null;
    // 自動テスト用（tools/ の試験だけが使う。ふだんは何もしない）
    if (window.NAD_TEST_INPUT && G.T) { var ti = window.NAD_TEST_INPUT(G.T.st); if (ti) inp = ti; }
    return inp;
  }
  var cv = $('#cv');
  cv.addEventListener('pointerdown', function (e) {
    if (G.mode === 'home') { G.ui && G.ui.tapHome && G.ui.tapHome(e.clientX, e.clientY); return; }
    if (G.mode !== 'training' || stick.on) return;
    stick.on = true; stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; stick.dx = 0; stick.dy = 0;
    var el = $('#stick'); el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; el.hidden = false; $('#knob').style.transform = '';
    try { cv.setPointerCapture(e.pointerId); } catch (err) { }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!stick.on || e.pointerId !== stick.id) return;
    var dx = e.clientX - stick.x0, dy = e.clientY - stick.y0, d = Math.hypot(dx, dy), m = 50;
    if (d > m) { dx = dx / d * m; dy = dy / d * m; }
    stick.dx = dx / m; stick.dy = dy / m;
    if (d < 8) { stick.dx = 0; stick.dy = 0; }
    $('#knob').style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  });
  function endStick(e) { if (e.pointerId !== stick.id) return; stick.on = false; stick.dx = stick.dy = 0; $('#stick').hidden = true; }
  cv.addEventListener('pointerup', endStick); cv.addEventListener('pointercancel', endStick);
  $('#btn-dodge').addEventListener('pointerdown', function (e) { e.preventDefault(); dodgeReq = true; });
  document.querySelectorAll('.cmd').forEach(function (b) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); cmdReq = b.getAttribute('data-cmd'); }); });
  $('#tr-pause').onclick = function () { G.pause(true); };
  $('#tr-dec').onclick = function () { if (G.T && G.T.watch) return; $('#tr-dec').hidden = true; layoutTop(); };

  /* ---- 表示 ---- */
  var bannerT = 0;
  function banner(text, sub, cls, ms) {
    var b = $('#tr-banner');
    if (!text) { b.hidden = true; return; }
    b.className = 'tr-banner ' + (cls || '');
    b.innerHTML = esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    b.hidden = false; layoutTop();
    clearTimeout(bannerT);
    if (ms !== 0) bannerT = setTimeout(function () { b.hidden = true; }, ms || 2600);
  }
  G.banner = banner;
  // 判断カードが出ているときは、案内をその下に出す（重ならないように）
  function layoutTop() {
    var d = $('#tr-dec'), b = $('#tr-banner');
    if (!d.hidden) { var r = d.getBoundingClientRect(); b.style.top = Math.round(r.bottom + 8) + 'px'; }
    else b.style.top = '';
  }
  G.layoutTop = layoutTop;
  function guide(id, extra) {
    if (!G.T || G.T.guide[id]) return;
    G.T.guide[id] = true;
    var g = ST.GUIDE[id]; if (!g) return;
    var text = G.fill(g[1]).replace('{first}', extra || '');
    var b = $('#tr-banner');
    b.className = 'tr-banner watch';
    b.innerHTML = '<b>' + esc(G.whoName(g[0])) + '</b>：' + esc(text);
    b.hidden = false; layoutTop();
    clearTimeout(bannerT);
    bannerT = setTimeout(function () { b.hidden = true; }, Math.max(4200, text.length * 110));
  }
  G.guide = guide;
  function decCard(lesson, keep) {
    var d = $('#tr-dec'), c = lesson.chosen;
    d.innerHTML = '<div class="face">' + R.faceSvg(G.partnerDef(), 'normal') + '</div><div><b>' + esc(G.S.companion.name) + 'の判断：' + (S.ACT_ICON[c.act] || '') + ' ' + esc(P.actPhrase(c.act, c.targetName)) + '</b><div class="why">' + esc(lesson.reason.text) + '</div><div class="ver">場面「' + esc(lesson.sceneName) + '」・方針 v' + lesson.policyVersion + '（タップでとじる）</div></div>';
    d.hidden = false; layoutTop();
    clearTimeout(d._t);
    if (!keep) d._t = setTimeout(function () { d.hidden = true; layoutTop(); }, 5200);
  }
  function hpSet(el, v, max) { el.style.width = Math.max(0, v / max * 100) + '%'; el.parentNode.classList.toggle('low', v / max < 0.3); }
  function updateHud() {
    var st = G.T.st;
    hpSet($('#hp-pl'), st.player.hp, st.player.max);
    hpSet($('#hp-pa'), st.partner.hp, st.partner.max);
    var d = st.partner.dec;
    $('#tr-pact').textContent = st.partner.down ? '💫' : (d ? S.ACT_ICON[d.act] || '' : '');
    var ob = S.objective(st);
    $('#tr-obj').textContent = ob.text;
    var boss = st.enemies.filter(function (e) { return e.boss && e.hp > 0 && e.active; })[0];
    $('#tr-boss').hidden = !boss;
    if (boss) { $('#tr-bossname').textContent = boss.name; hpSet($('#hp-boss'), boss.hp, boss.max); }
    // へとへとのあいだは、のこり時間を出す
    if (st.player.down && !st.done) { var left = Math.max(0, Math.ceil(20 - st.player.downT)); if (G.T._downLeft !== left) { G.T._downLeft = left; banner('へとへと……', st.partner.down ? 'ふたりともへとへとになると、修行はおわり' : G.S.companion.name + 'が助けに来るのを待とう（「助けて」で呼べる・のこり' + left + '秒）', 'watch', 1200); } }
    var pc = st.partner.cmd;
    document.querySelectorAll('.cmd').forEach(function (b) {
      var k = b.getAttribute('data-cmd'); b.classList.toggle('cool', !!(pc && pc.kind === k && pc.until > st.t));
    });
  }

  /* ---- sim からの合図 ---- */
  function handleSignals() {
    var T = G.T; if (!T) return;
    var st = T.st, sg = st.signals.splice(0);
    sg.forEach(function (s) {
      switch (s.type) {
        case 'zone':
          if (!st.zones[s.zone].watch) banner(s.name, D.SCENES[s.scene] ? D.SCENES[s.scene].note : '');
          if (T.meta.chapter === 'ch1' && st.zones[s.zone].arena) guide('boss');
          break;
        case 'watch':
          T.watch = true;
          if (st.zones[s.zone].variant === 1) guide('watch1'); else guide('watch2');
          break;
        case 'decision':
          decCard(s.lesson, T.watch);
          if (T.meta.chapter === 'ch1' && st.zones[s.lesson.zone].variant === 2) T.verifyAct = s.lesson.chosen.act;
          break;
        case 'watchEnd':
          T.watch = false;
          setTimeout(function () { if (!T.watch) { $('#tr-dec').hidden = true; layoutTop(); } }, 2500);
          if (T.meta.chapter === 'ch1') {
            var les = st.lessons.filter(function (l) { return l.zone === s.zone; })[0];
            if (les && st.zones[s.zone].variant === 1) guide('after1', les.chosen.act === 'search' ? '宝箱' : (les.chosen.act === 'rescue' ? '仲間の救助' : 'ほかの行動'));
            if (les && st.zones[s.zone].variant === 2) { var tb = $('#tr-banner'); tb.className = 'tr-banner watch'; tb.innerHTML = '<b>ハヤテ</b>：' + esc(ST.verifyLine(T.taught, les.chosen.act, G.S.companion.name)); tb.hidden = false; layoutTop(); clearTimeout(bannerT); bannerT = setTimeout(function () { tb.hidden = true; }, 6500); }
          }
          break;
        case 'clear':
          if (s.tutorialReview) { T.paused = true; setTimeout(function () { G.ui.midReview(); }, 700); }
          else if (T.meta.chapter === 'ch1' && st.zones[s.zone].tutorialIntro) guide('commandDone');
          break;
        case 'stage':
          if (s.stage > 0) { T.paused = true; setTimeout(function () { G.ui.stageSwitch(s); }, 400); }
          else banner(ST.CH.ch5.stage[0][1]);
          break;
        case 'tip':
          if (s.id === 'autoAttack' && T.meta.chapter === 'ch1') { guide('autoAttack'); setTimeout(function () { guide('commands'); document.querySelector('.cmd[data-cmd=gather]').classList.add('hint'); }, 1800); }
          if (s.id === 'partnerDown') guide('partnerDown');
          if (s.id === 'playerDown') guide('playerDown');
          break;
        case 'goalShort':
          T.paused = true; T.inModal = true;
          G.modal('<h3>課題がまだ終わっていない</h3><p>' + esc(s.objective.text) + '。もどって探す？</p>', [
            { label: 'ここで終える', cls: 'ghost', fn: function () { T.inModal = false; T.paused = false; S.finishNow(st); handleSignals(); } },
            { label: 'もどって探す', cls: 'primary', fn: function () { T.inModal = false; T.paused = false; } }]);
          break;
        case 'end':
          T.result = s.result;
          $('#tr-dec').hidden = true;
          setTimeout(function () { G.ui.review(T); }, s.result.fail === 'quit' ? 50 : 900);
          break;
      }
    });
    // 最初の修行：「集合」をためしたら木人の場所の門を開ける合図に
    if (T.meta.chapter === 'ch1' && T.guide.commands && !T.guide.cmdUsed && st.partner.cmd && st.partner.cmd.kind === 'gather') {
      T.guide.cmdUsed = true; document.querySelector('.cmd[data-cmd=gather]').classList.remove('hint');
    }
  }
  G.handleSignals = handleSignals;

  /* ================= はじまり ================= */
  window.addEventListener('load', function () {
    R.init(cv);
    G.load();
    requestAnimationFrame(frame);
    if (G.ui && G.ui.boot) G.ui.boot();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { });
  });
})();
