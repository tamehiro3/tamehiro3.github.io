/* ニンジャ夜明け隊（RPG） — 全体の流れ
 * タイトル → はじめる → 地図を歩く（話す・調べる・妖怪に当たると戦い）→ 旅の地図 → … → 夜明け。
 * イベント（data_story.js）は script.js が動かし、このファイルの host（H）が画面の仕事をする。
 */
(function (root) {
  'use strict';
  var ST = root.NYT_STATE, FD = root.NYT_FIELD, SC = root.NYT_SCRIPT, MP = root.NYT_MAPS, STORY = root.NYT_STORY;
  var RF = root.NYT_RFIELD, RB = root.NYT_RBATTLE, BUI = root.NYT_BUI, UI = root.NYT_UI, MENU = root.NYT_MENU, IN = root.NYT_INPUT, AU = root.NYT_AUDIO;
  var SPR = root.NYT_SPRITES, IT = root.NYT_ITEMS, BS = root.NYT_BASE, CHD = root.NYT_CHARS, EN = root.NYT_ENEMIES;
  function $(id) { return document.getElementById(id); }

  var WALK = 4.6;   // 1秒に進むマス
  var G = {
    scene: 'boot', S: null, F: null, P: null, fol: [], trail: [], runner: null, busy: 0, t: 0, last: 0,
    rng: BS.rng((Date.now() >>> 0) % 100000 + 1), snap: null, emotes: [], timers: [], queue: [], talkNpc: null,
    shakeT: 0, banner: null, title: null
  };
  root.NYT_GAME = G;
  function setS(S) { G.S = S; UI.S = S; if (MENU.ctx) MENU.ctx.S = S; }
  function sfx(n) { AU.play(n); }
  function later(sec, fn) { G.timers.push({ t: sec, fn: fn }); }

  // ====================== はじまり ======================
  function boot() {
    var cv = $('cv');
    RF.init(cv); RB.init(cv);
    IN.init(cv, { onKey: onKey, onTap: onTap, onPress: onPress, stickOK: function () { return G.scene === 'field' && !blocked(); } });
    root.addEventListener('resize', function () { RF.resize(); RB.resize(); });
    $('dlg').addEventListener('click', function () { UI.dlgNext(); });
    $('btn-menu').onclick = function () { onPress(); openMenu(); };
    $('btn-act').onclick = function () { onPress(); if (!blocked()) interactFront(); };
    document.addEventListener('visibilitychange', function () { if (document.hidden && G.S && G.scene === 'field') autosave(); });
    toTitle();
    requestAnimationFrame(loop);
    // オフラインでも遊べるように（公開ページのときだけ）
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !root.NYT_NO_SW) { try { navigator.serviceWorker.register('sw.js').catch(function () { }); } catch (e) { } }
  }
  function onPress() { AU.unlock(); }

  function toTitle() {
    G.scene = 'title';
    $('hud').hidden = true; $('bt').hidden = true; $('credits').hidden = true;
    UI.hideDlg(); MENU.close();
    var dummy = ST.fresh('ヒナタ'); setS(dummy);
    G.F = FD.load(dummy, 'koka'); FD.spawnEnemies(dummy, G.F, G.rng); RF.setMap(G.F);
    G.title = { t: 0 };
    G.P = mkP(15, 9, 'down'); G.fol = [];
    var has = ST.hasSave() && !!ST.load();
    var hs = {
      onNew: function () { UI.hideTitle(); UI.showNewGame(has, { onBack: function () { UI.showTitle(has, hs); }, onStart: newGame }); },
      onContinue: function () { var S = ST.load(); if (!S) { UI.toast('記録を読めなかった'); return; } UI.hideTitle(); startGame(S); },
      onHelp: function () { showHelp(); }
    };
    UI.showTitle(has, hs);
    AU.bgm('title');
  }
  function showHelp() {
    var p = $('panel'); p.innerHTML = ''; p.hidden = false;
    var box = UI.el('div', 'pbox win');
    box.innerHTML = '<header><h2>遊び方</h2><button class="x" type="button" aria-label="閉じる">×</button></header><div class="pbody">' + UI.helpHTML() + '</div>';
    p.appendChild(box);
    box.querySelector('.x').onclick = function () { p.hidden = true; p.innerHTML = ''; UI.sfx('back'); };
  }
  function newGame(o) {
    var S = ST.fresh(o.name, o.look);
    S.diff = o.diff;
    S.map = { id: 'koka', x: 15, y: 7, dir: 'up' };
    startGame(S);
  }
  function startGame(S) {
    setS(S);
    AU.setSound(S.settings.sound); AU.setMusic(S.settings.bgm); RB.R.noShake = S.settings.shake === false;
    G.scene = 'field';
    $('hud').hidden = false;
    G.busy = 0; G.runner = null; G.queue = [];
    UI.fade('out', function () { enterMap(S.map.id, S.map.x, S.map.y, S.map.dir || 'down'); UI.fade('in'); });
  }

  // ====================== 地図 ======================
  function mkP(x, y, dir) { return { x: x, y: y, fx: x, fy: y, dir: dir || 'down', moving: false, mv: null, walk: 0, walkT: 0, path: null, onArrive: null, def: null }; }
  function enterMap(id, x, y, dir) {
    var S = G.S;
    S.map = { id: id, x: x, y: y, dir: dir };
    var F = G.F = FD.load(S, id);
    FD.spawnEnemies(S, F, G.rng);
    F.objs.forEach(function (o) { if (o.k === 'npc') { o.home = [o.x, o.y]; o.wt = 1 + G.rng() * 3; } if (o.k === 'enemy') o.wt = 0.5 + G.rng(); });
    RF.setMap(F);
    G.P = mkP(x, y, dir); G.P.def = SPR.heroDef(S);
    G.trail = []; G.fol = []; makeFollowers();
    G.emotes = [];
    var def = F.def;
    AU.bgm(S.flags.dawn && def.town ? 'ending' : def.bgm);
    showLoc();
    if (def.town) { S.lastTown = { id: id, x: x, y: y, dir: dir }; autosave(); }
    // ついたときのイベント
    (def.auto || []).forEach(function (a) { if (FD.cond(S, a.show)) G.queue.push(a.ev); });
    warmSprites();
    runQueue();
  }
  function warmSprites() {
    var h = 46 * RF.R.s;
    SPR.warm(G.P.def, h);
    G.fol.forEach(function (f) { SPR.warm(f.def, h); });
  }
  function makeFollowers() {
    var S = G.S, act = ST.active(S).filter(function (id) { return id !== 'hero'; }).slice(0, 3);
    var old = G.fol;
    G.fol = act.map(function (id, i) {
      var prev = old.filter(function (f) { return f.id === id; })[0];
      var f = prev || { id: id, x: G.P.x, y: G.P.y, fx: G.P.x, fy: G.P.y, fromX: G.P.x, fromY: G.P.y, dir: G.P.dir, walk: 0, moving: false };
      f.def = SPR.memberDef(id, S);
      return f;
    });
  }
  function showLoc() {
    var S = G.S, def = G.F.def, loc = $('loc');
    var sky = ''; for (var i = 0; i < 5; i++) sky += '<i class="' + (i < S.frag ? 'on' : '') + '"></i>';
    loc.innerHTML = '<b>' + UI.esc(def.name) + '</b><span class="sky" title="暁のかけら">' + sky + '</span>';
    var ob = $('obj'); if (ob) { ob.textContent = '目的：' + objective(); }
  }

  // ---- 1コマ ----
  function loop(ts) {
    var dt = Math.min(0.05, ((ts - G.last) / 1000) || 0.016); G.last = ts; G.t += dt;
    var due = []; G.timers = G.timers.filter(function (tm) { tm.t -= dt; if (tm.t <= 0) { due.push(tm); return false; } return true; });
    due.forEach(function (tm) { tm.fn(); });
    try {
      if (G.scene === 'battle') { if (G.S) G.S.time += dt; BUI.update(dt); BUI.draw(G.t, dt, RF.dawnLevel(G.S), G.F ? G.F.def.bbg : 'village'); }
      else if (G.scene === 'field') { G.S.time += dt; updateField(dt); drawField(dt); }
      else if (G.scene === 'title') drawTitle(dt);
    } catch (e) { if (!G.errShown) { G.errShown = true; console.error(e); } }
    requestAnimationFrame(loop);
  }
  function blocked() { return G.busy > 0 || !!G.runner || MENU.open || MENU.travelOpen() || UI.dlgOpen() || UI.cardOpen() || UI.faded() || G.scene !== 'field'; }

  function updateField(dt) {
    var S = G.S, F = G.F, P = G.P;
    // 主人公
    if (P.moving) stepMove(P, dt);
    if (!P.moving) {
      if (P.path && !P.path.length) { P.path = null; var fn = P.onArrive; P.onArrive = null; if (fn) fn(); }
      var d = null, held = blocked() ? null : IN.dir();
      if (held && P.path && !P.scripted) { P.path = null; P.onArrive = null; }
      if (P.path && P.path.length) {
        var nx = P.path[0][0], ny = P.path[0][1];
        d = FD.dirOf(nx - P.x, ny - P.y);
        if (Math.abs(nx - P.x) + Math.abs(ny - P.y) !== 1) { P.path = null; P.onArrive = null; d = null; }
      } else d = held;
      if (d && (P.scripted || !blocked())) tryStep(d);
    }
    // ついてくる仲間
    var k = P.mv ? Math.min(1, P.mv.t) : 1;
    G.fol.forEach(function (f) {
      f.fx = f.fromX + (f.x - f.fromX) * k; f.fy = f.fromY + (f.y - f.fromY) * k;
      f.moving = P.moving && (f.x !== f.fromX || f.y !== f.fromY);
      f.walk = P.walk;
    });
    // 村の人・妖怪
    var paused = blocked() && !P.scripted;
    F.objs.forEach(function (o) {
      if (o.mv) { o.mv.t += dt * (o.k === 'enemy' ? 3.2 : 2.6); var q = Math.min(1, o.mv.t); o.fx = o.mv.x0 + (o.x - o.mv.x0) * q; o.fy = o.mv.y0 + (o.y - o.mv.y0) * q; o.moving = q < 1; o.walk = Math.floor(o.mv.t * 4) % 4; if (q >= 1) { o.mv = null; o.fx = null; o.fy = null; o.moving = false; } }
      if (o.cool > 0) o.cool -= dt;
      if (paused || !o.on) return;
      if (o.k === 'npc' && o.wander && !o.mv && !o.script) {
        o.wt -= dt;
        if (o.wt <= 0) { o.wt = 2 + G.rng() * 3; npcWander(o); }
      }
      if (o.k === 'enemy' && !o.beaten && !o.mv && !(o.cool > 0)) {
        o.wt -= dt;
        if (o.wt <= 0) {
          o.wt = 0.45 + G.rng() * 0.6;
          var x0 = o.x, y0 = o.y, r = FD.enemyStep(S, F, o, P.x, P.y, G.rng);
          if (r) {
            // 仲間のいるマスには入らない（主人公とはぶつかって戦い）
            o.mv = { x0: x0, y0: y0, t: 0 };
            var tgx = P.moving ? P.mv.tx : P.x, tgy = P.moving ? P.mv.ty : P.y;
            if (o.x === tgx && o.y === tgy) { symbolBattle(o, o.dir === P.dir ? 'enemy' : null); }
          }
        }
      }
    });
    // 吹き出し
    G.emotes = G.emotes.filter(function (e) { e.t += dt; return e.t < e.dur; });
    if (G.shakeT > 0) G.shakeT -= dt;
    updAction();
  }
  function stepMove(P, dt) {
    P.mv.t += dt * WALK;
    var k = Math.min(1, P.mv.t);
    P.fx = P.mv.x0 + (P.mv.tx - P.mv.x0) * k; P.fy = P.mv.y0 + (P.mv.ty - P.mv.y0) * k;
    P.walkT += dt * WALK * 2; P.walk = Math.floor(P.walkT) % 4;
    if (k >= 1) { P.moving = false; P.x = P.mv.tx; P.y = P.mv.ty; P.fx = P.x; P.fy = P.y; P.mv = null; arrive(); }
  }
  function tryStep(d) {
    var S = G.S, F = G.F, P = G.P, v = FD.DIRS[d], nx = P.x + v[0], ny = P.y + v[1];
    P.dir = d;
    var en = FD.enemyAt(F, nx, ny);
    if (en && !(en.cool > 0)) { if (P.path) P.path = null; symbolBattle(en, en.dir === d ? 'party' : null); return; }
    if (!FD.walkable(F, nx, ny)) {
      if (P.path) {
        var fn = P.onArrive; P.path = null; P.onArrive = null;
        if (fn && Math.abs(P.x - (P.goal ? P.goal[0] : -9)) + Math.abs(P.y - (P.goal ? P.goal[1] : -9)) === 1) fn();
      }
      return;
    }
    if (P.path) P.path.shift();
    // 仲間：ひとつ前の位置へ
    G.trail.unshift([P.x, P.y]); G.trail.length = Math.min(G.trail.length, 6);
    G.fol.forEach(function (f, i) { f.fromX = f.x; f.fromY = f.y; var t = G.trail[i]; if (t) { if (t[0] !== f.x || t[1] !== f.y) f.dir = FD.dirOf(t[0] - f.x, t[1] - f.y); f.x = t[0]; f.y = t[1]; } });
    P.moving = true; P.mv = { x0: P.x, y0: P.y, tx: nx, ty: ny, t: 0 };
  }
  function arrive() {
    var S = G.S, F = G.F, P = G.P;
    S.steps = (S.steps || 0) + 1;
    S.map.x = P.x; S.map.y = P.y; S.map.dir = P.dir;
    if (P.scripted) return;
    // 拾う
    F.objs.forEach(function (o) {
      if (o.k === 'pickup' && o.on && o.x === P.x && o.y === P.y) {
        S.opened[o.key] = 1; ST.addItem(S, o.get, o.n || 1); FD.refresh(S, F); sfx('item');
        say(null, ST.itemName(o.get) + (o.n > 1 ? '×' + o.n : '') + 'を見つけた！');
      }
    });
    var hits = FD.stepAt(S, F, P.x, P.y);
    for (var i = 0; i < hits.length; i++) {
      var t = hits[i];
      if (t.k === 'exit') { P.path = null; doExit(t); return; }
      if (t.k === 'step') { P.path = null; if (t.once) S.flags['step_' + t.key] = 1; runEvent(t.ev); return; }
    }
  }
  function npcWander(o) {
    var F = G.F, P = G.P, dirs = FD.DIR_LIST, d = dirs[Math.floor(G.rng() * 4)], v = FD.DIRS[d];
    var nx = o.x + v[0], ny = o.y + v[1];
    if (Math.abs(nx - o.home[0]) + Math.abs(ny - o.home[1]) > o.wander) return;
    if (nx === P.x && ny === P.y) return;
    if (P.moving && nx === P.mv.tx && ny === P.mv.ty) return;
    if (G.fol.some(function (f) { return f.x === nx && f.y === ny; })) return;
    o.on = false; var ok = FD.walkable(F, nx, ny) && !FD.stepAt(G.S, F, nx, ny).length; o.on = true;
    if (!ok) { o.dir = d; return; }
    o.mv = { x0: o.x, y0: o.y, t: 0 }; o.dir = d; o.x = nx; o.y = ny;
  }

  // ---- 調べる ----
  function frontObj() {
    var P = G.P, f = FD.front(P.x, P.y, P.dir);
    var o = FD.interactAt(G.F, f[0], f[1]);
    if (o && o.k === 'obst' && o.kind === 'hidden' && !FD.hasAbility(G.S, 'hawk')) return null;
    if (o && o.k === 'pickup') return null;
    return o;
  }
  var ACT = { npc: '話す', chest: '開ける', sign: '読む', obst: '調べる', gate: '調べる', pit: '調べる', enemy: '戦う' };
  function updAction() {
    var b = $('btn-act'), o = blocked() ? null : frontObj();
    var lab = o ? (o.k === 'npc' && o.yokai ? '調べる' : o.k === 'chest' && o.open ? '調べる' : ACT[o.k] || '調べる') : '調べる';
    if (b.dataset.lab !== lab) { b.dataset.lab = lab; b.innerHTML = UI.esc(lab) + '<small>Enter</small>'; }
    b.classList.toggle('dim', !o);
    G.hint = o && o.k !== 'enemy' ? { x: o.x, y: o.y, icon: o.k === 'npc' && !o.yokai ? '…' : '！' } : null;
  }
  function interactFront() {
    var o = frontObj();
    if (!o) { var en = (function () { var f = FD.front(G.P.x, G.P.y, G.P.dir); return FD.enemyAt(G.F, f[0], f[1]); })(); if (en) symbolBattle(en, 'party'); return; }
    interact(o);
  }
  function interact(o) {
    var S = G.S, F = G.F, P = G.P;
    if (o.k === 'enemy') { symbolBattle(o, 'party'); return; }
    sfx('click');
    if (o.k === 'npc') {
      if (!o.yokai && !o.sleep && !o.big) o.dir = FD.opposite(P.dir);
      G.talkNpc = o;
      if (o.ev) { runEvent(o.ev, o); return; }
      if (o.say) { o.sayI = (o.sayI || 0) % o.say.length; var line = o.say[o.sayI++]; say('npc:' + (o.name || '里の人'), line, null, o.look); return; }
      return;
    }
    if (o.k === 'chest') {
      if (o.open || S.opened[o.key]) { say(null, '宝箱は、からっぽだ。'); return; }
      S.opened[o.key] = 1; FD.refresh(S, F); sfx('chest');
      if (o.get === 'gold') { ST.addGold(S, o.n || 0); say(null, '宝箱を開けた！ ' + o.n + '両を手に入れた！'); }
      else { ST.addItem(S, o.get, o.n || 1); say(null, '宝箱を開けた！ ' + ST.itemName(o.get) + (o.n > 1 ? '×' + o.n : '') + 'を手に入れた！'); }
      return;
    }
    if (o.k === 'sign') { say(null, o.text); return; }
    if (o.k === 'gate') { say(null, F.def.theme === 'under' ? 'ふしぎな光の壁にふさがれている。どこかで封印を解かないと…' : 'かたく閉ざされている。今は通れない。'); return; }
    if (o.k === 'pit') { say(null, '深い穴だ。何かで埋められれば、渡れそう。'); return; }
    if (o.k === 'obst') { obstacle(o); return; }
  }
  var NEED = {
    boulder: '大きな岩だ。力持ちの仲間がいれば、押して動かせそう。', fog: '濃い霧で、先が見えない。風を起こせる仲間がいれば…',
    crack: 'ひびの入った岩だ。何かで、こわせないかな。', hidden: ''
  };
  var DONE = {
    boulder: ['xiaolan', 'リーリー、おねがい！ 大岩を押した！'], fog: ['fuuta', '風遁で、霧を吹きはらった！'],
    crack: ['hinanojoh', '焙烙玉で、岩をこわした！'], hidden: ['hayate', '鷹の目で、見えない道を見つけた！']
  };
  function obstacle(o) {
    var S = G.S, F = G.F, P = G.P, T = RF.T;
    var r = FD.useObstacle(S, F, o, P.x, P.y);
    if (!r) return;
    if (!r.ok) {
      if (r.stuck) { say(null, 'これ以上は、押せないようだ。'); return; }
      if (NEED[o.kind]) say(null, NEED[o.kind]);
      return;
    }
    var dn = DONE[o.kind], x = o.x * T + 16, y = o.y * T + 16;
    if (o.kind === 'boulder') { sfx('push'); RF.addFx({ kind: 'smoke', x: x, y: y, dur: 0.6 }); if (r.filled) { later(0.3, function () { sfx('stone'); }); say(null, '大岩が穴に落ちて、道になった！'); return; } }
    if (o.kind === 'fog') { sfx('windfx'); RF.addFx({ kind: 'wind', x: x, y: y, dur: 0.9 }); }
    if (o.kind === 'crack') { sfx('bomb'); RF.addFx({ kind: 'boom', x: x, y: y, dur: 0.6 }); G.shakeT = 0.3; }
    if (o.kind === 'hidden') { sfx('hawk'); RF.addFx({ kind: 'reveal', x: x, y: y, dur: 0.8 }); }
    if (o.kind !== 'boulder') say(dn[0], dn[1].replace('リーリー、おねがい！ ', ''));
    else say(dn[0], dn[1]);
  }
  // 1行だけ話す（イベントでないとき）
  function say(who, text, done, look) {
    G.busy++;
    UI.say(who, text, function () { G.busy--; if (done) done(); }, { look: look });
  }

  // ---- 出口・旅の地図 ----
  function doExit(t) {
    var S = G.S;
    if (t.to === 'travel') {
      G.scene = 'travel';
      sfx('door');
      var back = G.trail[0] || [G.P.x, G.P.y - 1];
      MENU.travel(S, S.map.id, function (n) {
        G.scene = 'field';
        if (!n) { G.P = mkP(back[0], back[1], FD.opposite(G.P.dir)); G.P.def = SPR.heroDef(S); G.trail = []; makeFollowers(); G.fol.forEach(function (f) { f.x = f.fromX = back[0]; f.y = f.fromY = back[1]; f.fx = f.x; f.fy = f.y; }); return; }
        UI.fade('out', function () { enterMap(n.map, n.at[0], n.at[1], n.at[2]); UI.fade('in'); });
      });
      return;
    }
    G.busy++;
    sfx('door');
    UI.fade('out', function () { G.busy--; enterMap(t.to, t.tx, t.ty, t.dir || 'down'); UI.fade('in'); });
  }

  // ====================== イベント ======================
  function runQueue() { if (G.runner || !G.queue.length) return; runEvent(G.queue.shift()); }
  function runEvent(id, npc) {
    var cmds = STORY.EVENTS[id];
    if (!cmds) { console.warn('イベントがない', id); return; }
    if (G.runner) { G.queue.push(id); return; }
    G.talkNpc = npc || null;
    IN.clear();
    G.P.path = null;
    var R = SC.create(H, cmds, {
      name: id, onDone: function () {
        if (G.runner === R) G.runner = null;
        UI.hideDlg();
        FD.refresh(G.S, G.F);
        makeFollowers();
        G.talkNpc = null;
        showLoc();
        later(0.05, runQueue);
      }
    });
    G.runner = R;
    try { SC.run(R); } catch (e) { console.error(e); G.runner = null; UI.hideDlg(); }
  }
  var H = {
    get S() { return G.S; },
    say: function (who, t, done, c) { UI.say(who, t, done, { look: G.talkNpc && G.talkNpc.look }); },
    ask: function (who, q, opts, done) { UI.ask(who, q, opts, done, { look: G.talkNpc && G.talkNpc.look }); },
    battle: function (o, done) { UI.hideDlg(); startBattle(o, done, null); },
    join: function (id, lv, done) { UI.hideDlg(); makeFollowers(); showJoin(id, lv, done); },
    got: function (id, n, done) { sfx('item'); UI.say(null, (id === 'gold' ? n + '両' : ST.itemName(id) + (n > 1 ? '×' + n : '')) + 'を手に入れた！', done); },
    healFx: function (done) { sfx('heal'); RF.addFx({ kind: 'heal', x: G.P.x * 32 + 16, y: G.P.y * 32 + 24, dur: 1 }); UI.say(null, 'みんなの体力が回復した！', done); },
    inn: function (t, done) { innFlow(t, done); },
    shop: function (t, done) { UI.hideDlg(); MENU.shop(ctx(), t, done); },
    forge: function (done) { UI.hideDlg(); MENU.forge(ctx(), done); },
    warp: function (map, x, y, dir, done) {
      UI.hideDlg();
      if (UI.faded()) { enterMapQuiet(map, x, y, dir); done(); return; }
      UI.fade('out', function () { enterMapQuiet(map, x, y, dir); UI.fade('in', done); });
    },
    travel: function (done) { UI.hideDlg(); G.scene = 'travel'; MENU.travel(G.S, G.S.map.id, function (n) { G.scene = 'field'; if (!n) { done(); return; } UI.fade('out', function () { enterMapQuiet(n.map, n.at[0], n.at[1], n.at[2]); UI.fade('in', done); }); }); },
    npc: function (c, done) { npcCmd(c, done); },
    face: function (d) { G.P.dir = d; },
    walk: function (pts, done) { scriptWalk(pts, done); },
    wait: function (s, done) { later(s, done); },
    fade: function (d, done) { UI.hideDlg(); UI.fade(d, done); },
    sfx: function (n) { sfx(n); },
    bgm: function (n) { AU.bgm(n); },
    shake: function (a) { G.shakeT = a || 0.3; },
    flash: function (col) { UI.flash(col); },
    emote: function (who, e, done) { emote(who, e, 0.9); later(0.9, done); },
    fragment: function (n, sk, done) { UI.hideDlg(); showFragment(n, sk, done); },
    title: function (t, sub, done) { UI.hideDlg(); sfx('bell'); UI.card(t, sub, done); },
    ending: function (done) { UI.hideDlg(); showEnding(done); },
    cut: function (ids, t, done) { UI.hideDlg(); showCut(ids, t, done); },
    formation: function (done) { UI.hideDlg(); MENU.formation(ctx(), function () { makeFollowers(); done(); }); },
    refresh: function () { if (G.F) FD.refresh(G.S, G.F); },
    save: function () { if (autosave()) UI.toast('記録しました'); }
  };
  // イベントの中の移動（自動イベントは走らせない）
  function enterMapQuiet(map, x, y, dir) {
    var q = G.queue; G.queue = [];
    var keepAuto = MP.MAPS[map].auto; MP.MAPS[map].auto = null;
    try { enterMap(map, x, y, dir); } finally { MP.MAPS[map].auto = keepAuto; }
    G.queue = q;
  }
  function npcCmd(c, done) {
    var o = G.F.objs.filter(function (q) { return q.k === 'npc' && q.id === c.npc; })[0];
    if (!o) { done(); return; }
    if (c.hide) { o.on = false; RF.addFx({ kind: 'smoke', x: o.x * 32 + 16, y: o.y * 32 + 16, dur: 0.5 }); }
    if (c.show) o.on = true;
    if (c.dir) o.dir = c.dir;
    if (!c.move) { done(); return; }
    var pts = c.move.slice();
    o.script = true;
    (function next() {
      if (!pts.length) { o.script = false; done(); return; }
      var p = pts.shift();
      o.dir = FD.dirOf(p[0] - o.x, p[1] - o.y);
      o.mv = { x0: o.x, y0: o.y, t: 0 }; o.x = p[0]; o.y = p[1];
      later(0.4, next);
    })();
  }
  function scriptWalk(pts, done) {
    var P = G.P, list = pts.slice();
    P.scripted = true;
    (function next() {
      if (!list.length) { P.scripted = false; done(); return; }
      var p = list.shift();
      var path = FD.path(G.F, P.x, P.y, p[0], p[1], { ignoreNpc: true }) || [];
      P.path = path; P.goal = p;
      P.onArrive = next;
      if (!path.length) { P.path = null; P.onArrive = null; next(); }
    })();
  }
  function emote(who, e, dur) {
    var x, y;
    if (who === 'hero') { x = G.P.x; y = G.P.y; }
    else { var o = G.F.objs.filter(function (q) { return q.id === who && q.on; })[0]; if (!o) return; x = o.x; y = o.y; }
    G.emotes.push({ x: x, y: y, e: e, t: 0, dur: dur || 0.9 });
  }

  // ---- 宿 ----
  function innFlow(t, done) {
    var S = G.S, price = IT.INN[t] || 0, who = 'npc:' + (G.talkNpc && G.talkNpc.name || '宿の人');
    UI.ask(who, price ? 'ようこそ。一晩 ' + price + '両です。泊まっていきますか？（いま ' + S.gold + '両）' : 'ゆっくり休んでいってくださいね。泊まりますか？', ['泊まる', 'やめる'], function (i) {
      if (i !== 0) { UI.say(who, 'またどうぞ。', done, { look: G.talkNpc && G.talkNpc.look }); return; }
      if (!ST.spend(S, price)) { UI.say(who, 'あら、お金が足りないみたい……。妖怪をたおすと、両がもらえますよ。', done, { look: G.talkNpc && G.talkNpc.look }); return; }
      UI.hideDlg();
      AU.bgm(null);
      UI.fade('out', function () {
        ST.healAll(S); sfx('heal');
        later(1.0, function () {
          S.lastTown = { id: S.map.id, x: G.P.x, y: G.P.y, dir: G.P.dir };
          autosave();
          AU.bgm(G.F.def.bgm);
          UI.fade('in', function () { UI.say(null, 'ぐっすり休んで、みんな元気いっぱいになった！（記録しました）', done); });
        });
      });
    }, { look: G.talkNpc && G.talkNpc.look });
  }

  // ---- 仲間になった・かけら・おわり ----
  function showJoin(id, lv, done) {
    var c = $('card'), S = G.S, nsl = root.NSL_CHARS && root.NSL_CHARS.BY_ID[id], cd = CHD.CHARS[id];
    var roles = cd.roles.map(function (r) { return BS.ROLES[r].name; }).join('・');
    var first = S.order.length === 5 && !S.flags.tip_form;
    if (first) S.flags.tip_form = 1;
    c.innerHTML = '<div class="join-box"><div class="join-ph"><img alt="" src="' + UI.portrait(id) + '"></div><h2>' + UI.esc(nsl ? nsl.name : id) + 'が仲間になった！</h2><p>' + (nsl ? UI.esc(nsl.clan) + '・' : '') + roles + '・Lv' + lv + (cd.field ? '<br>探索の術：' + UI.esc(FD.ABILITY_NAME[cd.field]) : '') + '</p>' + (first ? '<p class="note">5人目からは「控え」。メニューの「隊列」で、戦う4人をえらべます。</p>' : '') + '<p class="note">タップでつづける</p></div>';
    c.hidden = false;
    AU.jingle('join');
    var fin = function () { if (c.hidden) return; c.hidden = true; c.onclick = null; UI.cardSkip = null; done(); };
    var opened = performance.now();
    c.onclick = function () { if (performance.now() - opened > 500) fin(); };
    UI.cardSkip = function () { if (performance.now() - opened > 500) fin(); };
  }
  function showFragment(n, sk, done) {
    var c = $('card'), s = sk ? root.NYT_SKILLS.SKILLS[sk] : null;
    c.innerHTML = '<div class="join-box frag"><div class="frag-gem"></div><h2>暁のかけらを取り戻した！（' + n + '/5）</h2><p>' + (n >= 5 ? '5つのかけらが、そろった！' : '空が、少しだけ明るくなった。') + '</p>' + (s ? '<p><b>' + UI.esc(G.S.name) + '</b>は「' + UI.esc(s.n) + '」を覚えた！<br><span class="note">' + UI.esc(s.d) + '</span></p>' : '') + '<p class="note">タップでつづける</p></div>';
    c.hidden = false;
    AU.jingle('frag');
    showLoc();
    var opened = performance.now();
    var fin = function () { if (c.hidden || performance.now() - opened < 600) return; c.hidden = true; c.onclick = null; UI.cardSkip = null; done(); };
    c.onclick = fin; UI.cardSkip = fin;
  }
  function showCut(ids, t, done) {
    var c = $('card');
    c.innerHTML = '<div class="join-box"><div class="cut-row">' + (ids || []).map(function (id) { return '<img alt="" src="' + UI.portrait(id) + '">'; }).join('') + '</div><h2>' + UI.esc(t || '') + '</h2></div>';
    c.hidden = false;
    later(1.6, function () { c.hidden = true; done(); });
  }
  function showEnding(done) {
    var S = G.S, cr = $('credits');
    AU.bgm('ending');
    var n = CHD.ORDER.filter(function (id) { return S.members[id]; }).length;
    var grid = CHD.ORDER.map(function (id) { return '<div class="' + (S.members[id] ? '' : 'no') + '"><img alt="" src="' + UI.portrait(id) + '"></div>'; }).join('');
    cr.innerHTML = '<h2>夜明け</h2><p>暁の鐘が鳴り、長い夜が明けた。<br>' + UI.esc(S.name) + 'と仲間たちの旅は、ここでひと区切り。</p>' +
      '<div class="cr-grid">' + grid + '</div><p>仲間 ' + n + '/39　プレイ時間 ' + Math.floor(S.time / 3600) + '時間' + Math.floor(S.time / 60) % 60 + '分　戦い ' + S.battles + '回</p>' +
      '<p style="font-size:13px">キャラクター：CryptoNinja（CC0・Ninja DAO）<br>非公式ファンゲーム。技・セリフ・物語はゲームの創作で、公式の設定ではありません。</p>' +
      '<button class="btn gold" type="button" id="cr-ok">つづける</button>';
    cr.hidden = false;
    $('cr-ok').onclick = function () { cr.hidden = true; sfx('ok'); done(); };
    if (UI.kbd) $('cr-ok').focus();
  }

  // ====================== 戦い ======================
  function symbolBattle(o, amb) {
    if (G.scene !== 'field' || G.runner || o.cool > 0) return;
    var P = G.P;
    P.path = null;
    startBattle({ enemies: o.enemies.slice(), ambush: amb, symbol: true }, null, o);
  }
  function startBattle(o, done, sym) {
    var S = G.S;
    G.snap = JSON.stringify(S);
    G.scene = 'battle';
    IN.clear();
    $('hud').hidden = true;
    UI.flash('#ffffff');
    BUI.start(S, { enemies: o.enemies, ambush: o.ambush, noFlee: !!o.noFlee, guests: o.guests, guestLv: o.guestLv, boss: o.boss, bbg: o.bbg || G.F.def.bbg, bgm: o.bgm, tut: o.tut, story: !!o.story, lose: o.symbol ? 'town' : (o.lose || 'retry') }, function (res, out, choice) {
      afterBattle(res, out, choice, o, done, sym);
    });
  }
  function afterBattle(res, out, choice, o, done, sym) {
    var S = G.S;
    if (res === 'lose' && choice && choice !== 'ok') {
      var restored = ST.validate(JSON.parse(G.snap));
      setS(restored); S = restored;
      FD.refresh(S, G.F);
      if (choice === 'town') {
        ST.healAll(S);
        G.scene = 'field'; $('hud').hidden = false;
        if (sym) { sym.cool = 3; }
        var lt = S.lastTown || { id: 'koka', x: 14, y: 18, dir: 'up' };
        UI.fade('out', function () { enterMap(lt.id, lt.x, lt.y, lt.dir); UI.fade('in', function () { say(null, '宿で目をさました。みんな元気になった。'); }); });
        return;
      }
      ST.healAll(S);
      if (choice === 'easy') { S.diff = 'easy'; UI.toast('難しさを「やさしい」にした'); }
      if (choice === 'prep') { G.scene = 'field'; MENU.menu(ctx(), 'form', function () { startBattle(o, done, sym); }); return; }
      startBattle(o, done, sym);
      return;
    }
    if (res === 'lose') ST.healAll(S);   // 腕だめしに負けたとき
    G.scene = 'field';
    $('hud').hidden = false;
    AU.bgm(G.F.def.bgm);
    makeFollowers();
    if (sym) {
      if (res === 'win') { sym.beaten = true; sym.on = false; }
      else sym.cool = 3;
    }
    if (done) done(res);
  }

  // ====================== メニュー ======================
  function ctx() { return { S: G.S, objective: objective, save: function () { return autosave(); }, toTitle: toTitle }; }
  function openMenu() {
    if (G.scene !== 'field' || blocked()) return;
    sfx('ok');
    MENU.menu(ctx(), null, function () { makeFollowers(); FD.refresh(G.S, G.F); });
  }
  function autosave() {
    var S = G.S; if (!S || G.scene === 'title') return false;
    if (G.P) { S.map.x = G.P.moving ? G.P.mv.tx : G.P.x; S.map.y = G.P.moving ? G.P.mv.ty : G.P.y; S.map.dir = G.P.dir; }
    return ST.save(S);
  }
  // いまの目的
  function objective() {
    var S = G.S, f = function (c) { return FD.cond(S, c); };
    var L = [
      ['ending', 'クリア！ まだ会っていない仲間をさがしたり、図鑑をうめたりしよう'],
      ['ch4_clear&ne_seal_l&ne_seal_r', '根の国の奥で、夜鴉と決着をつけよう'],
      ['ch4_clear&has:jin', '根の国の奥へ。左右の封印の石を解いて、扉を開けよう'],
      ['ch4_clear&ten_entered', '天の社で、気配を消した忍をさがそう'],
      ['ch4_clear', '旅の地図から「天の社」へ'],
      ['ch3_clear&has:kohaku', '風魔の砦の奥へ進もう'],
      ['ch3_clear&ch4_duel1', '黒嶺の山道をこえて、風魔の砦へ'],
      ['ch3_clear&kuromine_entered', '黒嶺の山道で、道をふさぐ二人と話そう'],
      ['ch3_clear', '旅の地図から「黒嶺の山道」へ（孫市の船）'],
      ['ch2_clear&has:fuuta&has:hinanojoh', '潮風の浜の奥、海鳴りの洞で海坊主を退治しよう'],
      ['ch2_clear&has:fuuta', '潮風の浜で、岩をこわせる仲間をさがそう'],
      ['ch2_clear&saika_entered', '潮風の浜で、霧を晴らせる仲間をさがそう'],
      ['ch2_clear', '旅の地図から「雑賀の港」へ'],
      ['ch1_clear&has:hayate', '霧の山道をこえて、大蜘蛛の岩屋の霧蜘蛛を退治しよう'],
      ['ch1_clear&iga_entered', '霧の山道の入口で、鷹匠に会おう'],
      ['ch1_clear', '旅の地図から「伊賀の里」へ'],
      ['op_done&has:xiaolan', '稲荷の洞の奥へ。光が落ちた場所をめざそう'],
      ['op_done', '旅の地図から「狐火の森」へ。大岩の前で困っている子がいるらしい'],
      ['op_started', '岩爺の話を聞こう']
    ];
    for (var i = 0; i < L.length; i++) if (f(L[i][0])) return L[i][1];
    return '岩爺の話を聞こう';
  }

  // ====================== 描く ======================
  function drawField(dt) {
    var V = {
      S: G.S, F: G.F, P: { fx: G.P.fx, fy: G.P.fy + (G.shakeT > 0 ? Math.sin(G.t * 60) * 0.05 : 0), dir: G.P.dir, def: G.P.def, moving: G.P.moving, walk: G.P.walk },
      party: G.fol.slice().reverse(), t: G.t, dt: dt, hint: G.hint, emotes: G.emotes
    };
    RF.frame(V);
  }
  function drawTitle(dt) {
    var T = G.title; T.t += dt;
    var F = G.F, x = 4 + (Math.sin(T.t * 0.05) * 0.5 + 0.5) * (F.w - 8), y = 6 + (Math.cos(T.t * 0.035) * 0.5 + 0.5) * (F.h - 12);
    RF.frame({ S: G.S, F: F, P: { fx: x, fy: y, dir: 'down', def: null }, party: [], t: G.t, dt: dt, hint: null, emotes: [] });
  }

  // ====================== 入力 ======================
  function onKey(k) {
    AU.unlock();
    if (!$('panel').hidden && !MENU.open) { if (k === 'back' || k === 'menu' || k === 'ok') { $('panel').hidden = true; $('panel').innerHTML = ''; } else if (/up|down|left|right/.test(k)) UI.nav($('panel'), k); return; }
    if (!$('title').hidden) { if (/up|down|left|right/.test(k)) UI.nav($('title'), k); else if (k === 'ok') { var a = document.activeElement; if (a && $('title').contains(a)) a.click(); else UI.focusFirst($('title')); } return; }
    if (!$('newgame').hidden) { if (/up|down|left|right/.test(k) && document.activeElement.tagName !== 'INPUT') UI.nav($('newgame'), k); else if (k === 'ok' && document.activeElement.tagName === 'INPUT') $('ng-start').focus(); return; }
    if (!$('credits').hidden) { if (k === 'ok') $('cr-ok').click(); return; }
    if (UI.cardOpen()) { if (k === 'ok' || k === 'back') { if (UI.cardSkip) UI.cardSkip(); } return; }
    if (MENU.travelOpen()) { MENU.travelKey(k); return; }
    if (UI.choiceOpen()) { if (/up|down|left|right/.test(k)) UI.nav($('choice'), k); else if (k === 'ok') { var b = document.activeElement; if (b && $('choice').contains(b)) b.click(); else UI.focusFirst($('choice')); } return; }
    if (UI.dlgOpen()) { if (k === 'ok' || k === 'back') UI.dlgNext(); return; }
    if (!$('panel').hidden) {
      if (k === 'back' || k === 'menu') { if (MENU.open) MENU.close(); else { $('panel').hidden = true; $('panel').innerHTML = ''; } return; }
      if (/up|down|left|right/.test(k)) UI.nav($('panel'), k);
      return;
    }
    if (G.scene === 'battle') { BUI.key(k); return; }
    if (G.scene !== 'field' || blocked()) return;
    if (k === 'ok') { interactFront(); return; }
    if (k === 'menu' || k === 'back') { openMenu(); return; }
  }
  function onTap(x, y) {
    AU.unlock();
    if (G.scene === 'battle') { BUI.tap(x, y); return; }
    if (UI.dlgOpen()) { UI.dlgNext(); return; }
    if (G.scene !== 'field' || blocked()) return;
    var t = RF.screenToTile(x, y);
    tapTile(t.x, t.y);
  }
  // マスをタップ（そこまで歩く。人や物なら、となりまで行って話す・調べる）
  function tapTile(tx, ty) {
    var t = { x: tx, y: ty }, P = G.P, F = G.F;
    if (t.x === P.x && t.y === P.y) { interactFront(); return; }
    var objs = FD.objsAt(F, t.x, t.y).filter(function (o) { return o.k !== 'exit' && o.k !== 'step' && o.k !== 'pickup' && !(o.k === 'obst' && o.kind === 'hidden' && !FD.hasAbility(G.S, 'hawk')); });
    var target = objs[0] || null;
    var adj = Math.abs(t.x - P.x) + Math.abs(t.y - P.y) === 1;
    if (target && adj) { P.dir = FD.dirOf(t.x - P.x, t.y - P.y); if (target.k === 'enemy') symbolBattle(target, 'party'); else interact(target); return; }
    var path = FD.path(F, P.x, P.y, t.x, t.y, target ? { adjacent: true } : {});
    if (!path) { sfx('ng'); return; }
    P.path = path; P.goal = [t.x, t.y];
    P.onArrive = target ? function () { P.dir = FD.dirOf(t.x - P.x, t.y - P.y); var o2 = FD.objsAt(F, t.x, t.y).filter(function (o) { return o === target && o.on; })[0]; if (o2) { if (o2.k === 'enemy') symbolBattle(o2, null); else interact(o2); } } : null;
    RF.addFx({ kind: 'reveal', x: t.x * 32 + 16, y: t.y * 32 + 16, dur: 0.4 });
  }

  // テスト用の窓口
  G.debug = { tapTile: tapTile, interact: interact, stepOn: function (x, y) { G.P.x = x; G.P.y = y; G.P.fx = x; G.P.fy = y; arrive(); }, enterMap: enterMap, runEvent: runEvent, startBattle: startBattle, objective: objective, get H() { return H; }, setS: setS, toTitle: toTitle, startGame: startGame };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
