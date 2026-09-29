/* ニンジャ夜明け隊 — 全体の流れ（広場 → 編成 → 出撃 → 結果 → 再出撃）と、毎フレームの処理
 * 試合は sim.js が決まった刻み（1/60秒）で進める。画面が見えなくなったら止める（短い無操作を放置あつかいにしない）。
 */
(function (root) {
  'use strict';
  var D = root.NYT_DATA, SIM = root.NYT_SIM, RN = root.NYT_RENDER, IN = root.NYT_INPUT, AU = root.NYT_AUDIO, UI = root.NYT_UI;
  var PR = root.NYT_PROGRESS, DIR = root.NYT_DIRECTOR, TUT = root.NYT_TUTORIAL, CH = root.NSL_CHARS;
  var STEP = 1 / 60;
  var store = null;
  try { store = root.localStorage; store.setItem('nyt_probe', '1'); store.removeItem('nyt_probe'); } catch (e) { store = null; }

  var G = {
    P: PR.load(store, Date.now()), M: null, me: null, screen: 'title', paused: false, acc: 0, last: 0, t: 0,
    choice: 'normal', kind: null, normal: null, weekly: null, proposalState: null, mentorShow: null,
    loTimer: 0, nearSpot: null, ctxKeys: {}, tut: null, ending: 0, mentorFresh: false, panelOpen: null
  };
  root.NYT_GAME = G;

  function sid() { return 'nyt-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36); }
  G.save = function () { if (!PR.save(store, G.P) && !G.warnedSave) { G.warnedSave = true; UI.toast('この端末では記録を保存できません（遊ぶことはできます）', 3500); } };
  G.applySettings = function () { var s = G.P.settings; AU.set(s.sound); RN.R.opts.shake = s.shake; };
  G.touchLoadout = function () { G.save(); };
  G.difficultyChanged = function () { G.normal = DIR.normalMission(G.P); };

  // 次に出撃する任務
  G.pendingMission = function () {
    var P = G.P;
    if (G.choice === 'weekly') { G.weekly = G.weekly || D.weeklyMission(Date.now()); var w = G.weekly.mission; w.client_id = w.client_id || 'hayate'; return w; }
    if (G.choice === 'proposal' && P.director.pending && DIR.validate(P.director.pending.p, P.loadout.difficulty).ok) return P.director.pending.p;
    if (G.choice === 'proposal') G.choice = 'normal';
    G.normal = G.normal || DIR.normalMission(P);
    return G.normal;
  };

  /* ---------- 画面の切りかえ ---------- */
  G.toTitle = function () { G.screen = 'title'; G.M = null; UI.title(); };
  G.toPlaza = function () {
    G.screen = 'plaza'; G.M = null; G.me = null; IN.I.enabled = false;
    if (!G.normal) G.normal = DIR.normalMission(G.P);
    UI.plaza();
  };
  G.toLoadout = function () {
    G.screen = 'loadout'; G.M = null; G.loTimer = D.LOADOUT_SEC;
    UI.loadout();
  };

  /* ---------- 出撃 ---------- */
  function buildMembers(P) {
    var L = P.loadout, roles = [L.role];
    var mems = [{ id: 'p1', kind: 'human', name: 'あなた', role: L.role, jutsu: L.jutsu.slice(), look: P.look }];
    D.BUDDIES.forEach(function (b, i) {
      var r = L.buddies[i] && L.buddies[i] !== 'auto' ? L.buddies[i] : D.COMPLEMENT[L.role][i];
      var dup = roles.indexOf(r) >= 0; roles.push(r);
      mems.push({ id: b.id, kind: 'npc', name: b.name, role: r, jutsu: (dup ? D.NPC_JUTSU_ALT : D.NPC_JUTSU)[r].slice(), look: b.look });
    });
    return mems;
  }
  G.startMatch = function () {
    var P = G.P, now = Date.now();
    if (!PR.validLoadout(P, P.loadout)) P.loadout = PR.fresh(now).loadout;
    var kind = G.choice, m = G.pendingMission(), weekly = false, seed = (now ^ Math.floor(Math.random() * 1e9)) >>> 0, diff = P.loadout.difficulty;
    kind = G.choice;
    if (kind === 'weekly') { seed = G.weekly.seed; diff = 'normal'; weekly = true; }
    if (kind === 'proposal') {
      P.stats.proposalsPicked++;
      PR.logEvent(P, 'mission_proposal_selected', { mission: m.mission_template_id, set: m.enemy_set_id, mode: P.director.mode, gen: P.director.pending ? P.director.pending.gen : null }, now);
      G.propGen = P.director.pending ? P.director.pending.gen : 'rule';
      DIR.consume(P);
    } else if (kind === 'normal') { P.director.rot = (P.director.rot || 0) + 1; }
    G.normal = null;
    var members = buildMembers(P);
    PR.logEvent(P, 'role_selected', { role: P.loadout.role, jutsu: P.loadout.jutsu, team: members.map(function (x) { return x.role; }) }, now);
    var M = SIM.createMatch({ session_id: sid(), seed: seed, difficulty: diff, mission: m, mentor: P.mentor, client: m.client_id, members: members, weekly: weekly });
    begin(M, kind);
  };
  G.startTutorial = function () {
    var T = TUT.create({
      tut: function (h) { UI.tut(h); },
      done: function () { AU.play('combo'); },
      step: function (id, i) { PR.logEvent(G.P, 'tutorial_step', { step: id, i: i }, Date.now()); }
    });
    var cfg = TUT.config({ session_id: sid(), look: G.P.look, mentor: G.P.mentor });
    cfg.script = T.script;
    var M = SIM.createMatch(cfg);
    G.tut = T;
    begin(M, 'tutorial');
  };
  function begin(M, kind) {
    G.M = M; G.me = M.members[0]; G.kind = kind; G.ending = 0; G.mentorShow = null;
    RN.buildGround(M.tpl);
    var px = RN.pxFor();
    M.members.forEach(function (mm) { RN.warm(mm.id + JSON.stringify(mm.look || {}), function () { return RN.memberDef(mm); }, px); });
    RN.R.cam.x = G.me.x; RN.R.cam.y = G.me.y;
    RN.R.fx = [];
    UI.hudReset(); UI.tut(null);
    UI.show('hud'); G.screen = 'battle'; G.paused = false; G.acc = 0;
    IN.clear(); IN.I.enabled = true;
    SIM.start(M);
    consume(M);
    AU.unlock(); AU.play('drum');
  }
  G.skipTutorial = function () {
    var P = G.P;
    P.stats.tutorialSkipped = true; PR.logEvent(P, 'tutorial_skipped', {}, Date.now()); G.save();
    G.M = null; G.me = null; G.tut = null; IN.I.enabled = false; IN.clear(); UI.tut(null);
    G.choice = 'normal'; G.normal = DIR.normalMission(P);
    G.toLoadout();
  };
  G.rematch = function () {
    PR.countRematch(G.P);
    PR.logEvent(G.P, 'rematch_start', { kind: G.choice }, Date.now());
    G.save();
    G.startMatch();
  };
  G.quitMatch = function () {
    if (!G.M || G.M.state === 'Result') return;
    SIM.finalize(G.M, 'lose', 'quit');
    consume(G.M);
  };

  /* ---------- 試合のできごと → 音・演出・表示 ---------- */
  var PHASE_TXT = {
    prep1: ['準備', '素材を集めて、罠を置こう。赤い矢印が妖怪の来る道'],
    wave1: ['襲撃 1', '西と東から、ころ玉が来る！'],
    prep2: ['準備', '結界の修理と、この夜だけの強化をえらぼう'],
    wave2: ['襲撃 2', 'からかさは背中が弱点。ふだ狸は音と赤い予告に注意'],
    prep3: ['最終準備', '補給と罠の置き直し。夜明けは近い'],
    boss: ['夜明け前', '大だるまが来る！ 夜明けまで守りきれ']
  };
  function sayOf(id, key) { var b = D.BUDDIES.filter(function (x) { return x.id === id; })[0]; return b && b.lines[key] ? b.lines[key] : ''; }
  function consume(M) {
    var evs = M.events;
    if (!evs.length) return;
    evs.forEach(function (e) {
      if (e.type === 'say') e.text = sayOf(e.id, e.key);
      if (e.type === 'revive' && e.by && e.id !== 'p1') { var mm = M.members.filter(function (x) { return x.id === e.id; })[0]; if (mm) evs.push({ type: 'say', id: e.id, text: sayOf(e.id, 'thanks'), x: mm.x, y: mm.y }); }
    });
    RN.onEvents(M, evs, 'p1');
    evs.forEach(function (e) {
      switch (e.type) {
        case 'phase':
          var pt = PHASE_TXT[e.phase];
          if (pt && !M.tutorial) UI.banner(pt[0], pt[1], 3000);
          if (e.state === 'Wave' || e.state === 'Boss') AU.play('drum');
          break;
        case 'cast':
          var snd = { fire: 'fire', fireline: 'fire', water: 'water', mist: 'water', wind: 'wind', pull: 'wind', stone: 'stone', decoy: 'stone', thunder: 'thunder', thundertrap: 'thunder', leaf: 'heal', guardleaf: 'heal', issen: 'issen', dome: 'dome', ring: 'heal' }[e.skill];
          if (snd) AU.play(snd);
          break;
        case 'slash': if (e.id === 'p1') AU.play('slash'); break;
        case 'hit': AU.play('hit'); break;
        case 'purify': AU.play('purify'); break;
        case 'combo': AU.play('combo'); break;
        case 'down': AU.play('down'); if (e.id === 'p1' && !M.tutorial) UI.banner('ダウン！', '仲間が助けに来る。タップで「安全」ピン', 2200); break;
        case 'revive': if (e.by) AU.play('rescue'); break;
        case 'warn': AU.play('warn'); break;
        case 'bossWarn': AU.play('bossWarn'); break;
        case 'bossAppear': UI.banner(D.ENEMY[e.kind].name + 'が来た！', '赤い予告の「安全」な所へよけよう', 2600); AU.play('bossWarn'); break;
        case 'bossDown': UI.banner(D.ENEMY[e.kind].name + 'をしずめた！', '', 2200); break;
        case 'support':
          UI.cutin(M.mentor, e.sup); AU.play('support');
          G.mentorShow = { id: M.mentor, x: M.barrier.x + 76, y: M.barrier.y + 50, t: 0, life: 3.6, pose: 'serious' };
          break;
        case 'trap': AU.play(e.what === 'boom' ? 'trap' : 'click'); break;
        case 'gather': if (e.id === 'p1') AU.play('gather'); break;
        case 'repair': AU.play('repair'); break;
        case 'dodge': if (e.id === 'p1') AU.play('dodge'); break;
        case 'short': if (e.id === 'p1') { UI.toast('素材が足りません（あと ' + (e.need - M.materials) + '）'); var mb = document.querySelector('.mat-box'); if (mb) { mb.classList.remove('short'); void mb.offsetWidth; mb.classList.add('short'); } } break;
        case 'block': AU.play('blocked'); break;
        case 'barrierHit': var bb = document.querySelector('.bar-box'); if (bb && !bb._t) { bb.classList.add('hit'); bb._t = setTimeout(function () { bb.classList.remove('hit'); bb._t = 0; }, 300); } break;
        case 'ping':
          if (e.by === 'p1') { AU.play('ping'); var key = e.kind; M.members.forEach(function (mm, i) { if (mm.kind === 'npc' && !mm.down && i === 1 + (G.pingN = ((G.pingN || 0) + 1) % 2)) RN.onEvents(M, [{ type: 'say', id: mm.id, text: sayOf(mm.id, key), x: mm.x, y: mm.y }], 'p1'); }); }
          break;
        case 'grace': UI.banner('全員ダウン！', '救済時間：結界まで這えば、1回だけ起き上がれる', 2600); break;
        case 'graceRevive': UI.banner('結界の加護！', '起き上がった', 1800); AU.play('rescue'); break;
        case 'villager': if (e.what === 'appear') UI.toast('里人が結界へ避難してくる。守ろう！'); if (e.what === 'down') UI.toast('里人がダウン！ そばで助けよう'); break;
        case 'pillar': if (e.what === 'broken') UI.banner('結界柱がこわれた…', '結界が傷み、妖怪の攻撃が強くなる', 2400); break;
        case 'upgrade': if (e.id === 'p1') UI.toast('強化：' + D.UPGRADES[e.up].name + '（' + D.UPGRADES[e.up].desc + '）'); break;
        case 'interrupt': AU.play('blocked'); break;
        case 'ready': UI.toast('準備完了！'); break;
        case 'result':
          G.ending = 2.2;
          if (e.outcome === 'win') { UI.banner(M.tutorial ? '夜が明けた！' : '夜明け！', e.reason === 'boss' ? '大だるまをしずめた' : '里を守りきった', 2400); AU.play('win'); }
          else { UI.banner(e.reason === 'quit' ? '出撃をやめた' : '結界が破れた…', e.reason === 'allDown' ? '全員ダウン' : '', 2400); AU.play('lose'); }
          break;
      }
    });
    M.events.length = 0;
  }

  /* ---------- 試合の終わり ---------- */
  function endMatch() {
    var M = G.M, P = G.P, res = M.result, now = Date.now();
    IN.I.enabled = false; IN.clear(); UI.tut(null);
    M.log.forEach(function (l) { PR.logEvent(P, l.ev, l.data, now); });
    if (M.tutorial) {
      var first = !P.stats.tutorial;
      P.stats.tutorial = true;
      var bonus = first ? 100 : 0;
      P.tokens += bonus;
      PR.logEvent(P, 'tutorial_done', { first: first }, now);
      G.save();
      G.M = null; G.me = null; G.tut = null;
      UI.toast(first ? '最初の任務をクリア！ 修行札+100。次は忍術を2つえらんで出撃しよう' : '最初の任務をクリア！', 4200);
      G.choice = 'normal'; G.normal = DIR.normalMission(P);
      G.mentorFresh = first;
      G.toLoadout();
      return;
    }
    var claim = PR.claimReward(P, res, 'p1', now);
    var rec = PR.recordMatch(P, res, 'p1', { mentor: P.mentor, mode: G.kind === 'proposal' ? (G.propGen || P.director.mode) : G.kind, proposal: G.kind === 'proposal' }, now);
    if (P.stats.afterTutorial == null) P.stats.afterTutorial = P.stats.matches;
    (rec.gifts || []).forEach(function (g) { if (g.indexOf('outfit_cn_') === 0) UI.ensureCnOutfit(g, CH.BY_ID[g.slice(10)]); });
    G.save();
    G.screen = 'result';
    G.proposalState = 'wait';
    G.choice = 'normal'; G.normal = DIR.normalMission(P);
    UI.result(res, claim, rec);
    // 任務監督：結果の画面で、次の任務を考える（試合中には問い合わせない）
    DIR.generate(P, res, { now: now }).then(function (r) {
      G.proposalState = r;
      if (r.proposal) { G.choice = 'proposal'; P.stats.proposalsShown++; }
      G.save();
      if (G.screen === 'result') UI.nextBox();
    });
  }

  /* ---------- 毎フレーム ---------- */
  function frame(ts) {
    var dt = Math.min(0.1, Math.max(0, (ts - (G.last || ts)) / 1000)); G.last = ts; G.t += dt;
    IN.tick(G.t);
    var M = G.M;
    if (G.screen === 'battle' && M) {
      if (!G.paused) {
        G.acc += dt;
        var n = 0;
        while (G.acc >= STEP && n < 6) {
          var me = G.me;
          var it = IN.intent(me, M, { autoAtk: G.P.settings.autoAtk, ctx1: G.ctxKeys.ctx1, ctx2: G.ctxKeys.ctx2, rangeOf: rangeOf });
          SIM.step(M, STEP, { p1: it });
          consume(M);
          G.acc -= STEP; n++;
          if (M.state === 'Result') break;
        }
        if (n >= 6) G.acc = 0;
        if (G.mentorShow) { G.mentorShow.t += dt; if (G.mentorShow.t > G.mentorShow.life) G.mentorShow = null; }
        if (M.state === 'Result' && G.ending > 0) { G.ending -= dt; if (G.ending <= 0) { endMatch(); } }
        var mood = M.state === 'Boss' ? 'boss' : M.state === 'Wave' ? 'fight' : M.state === 'Result' ? 'dawn' : 'calm';
        AU.bgm(dt, mood);
      }
      if (G.M) {
        var tut = G.tut && M.tutorial ? G.tut : null;
        var view = { me: G.me, route: routeInfo(M), nearSpot: G.nearSpot, reticle: reticle(), mentorShow: G.mentorShow };
        RN.frame(M, dt, view);
        if (tut && tut.marker) markerHint(tut.marker);
        UI.hud(M, G.me);
        if ((G.mm = (G.mm || 0) + dt) > 0.12) { G.mm = 0; RN.minimap(document.getElementById('minimap'), M, 'p1'); }
      }
    } else {
      RN.frame(null, dt, { night: 0.55 });
      AU.bgm(dt, 'calm');
      if (G.screen === 'loadout' && !G.panelOpen) {
        G.loTimer -= dt;
        var el = document.getElementById('lo-timer'); if (el) el.textContent = Math.max(0, Math.ceil(G.loTimer));
        if (G.loTimer <= 0) { UI.toast('時間になったので出撃します'); G.startMatch(); }
      }
    }
    root.requestAnimationFrame(frame);
  }
  function rangeOf(slot) {
    var me = G.me; if (!me) return 200;
    if (slot === 'sp') { var S = D.ROLES[me.role].special; return S.len || S.range || 150; }
    if (slot === 'bomb') return D.SUPPLY.bomb.range;
    var J = D.JUTSU[me.jutsu[slot === 'j0' ? 0 : 1]]; return J ? (J.range || J.len || 150) : 200;
  }
  function reticle() {
    var me = G.me; if (!me || me.down) return null;
    var r = IN.I.drag && IN.I.drag.aiming ? rangeOf(IN.I.drag.slot) : 220;
    var rt = IN.reticle(me, r);
    if (rt) rt.r = 18;
    return rt;
  }
  // 準備中：次の襲撃で来る妖怪と道（ルート確認・次の襲撃の予告）
  function routeInfo(M) {
    if (M.tutorial || !(M.state === 'Preparation' || M.state === 'Intermission')) return null;
    var nx = M.phases[M.pi + 1]; if (!nx || !nx.wave) return null;
    var comp = M.set[nx.wave] || {}, west = [], east = [];
    Object.keys(comp).forEach(function (t) { var n = Math.max(1, Math.round(comp[t] * M.diff.countMul)); var h = Math.ceil(n / 2); west.push({ type: t, n: h }); east.push({ type: t, n: n - h }); });
    if (nx.wave === 'boss') west.unshift({ type: 'daruma', n: 1 });
    return { west: west.slice(0, 3), east: east.filter(function (x) { return x.n > 0; }).slice(0, 3) };
  }
  function markerHint(mk) {
    var c = RN.R.ctx, s = RN.w2s(mk.x, mk.y), r = mk.r * RN.R.zoom, t = G.t;
    c.save(); c.strokeStyle = 'rgba(255,230,120,' + (0.6 + Math.sin(t * 6) * 0.3) + ')'; c.lineWidth = 4; c.beginPath(); c.arc(s.x, s.y, r + Math.sin(t * 4) * 4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,230,120,.9)'; c.beginPath(); c.moveTo(s.x, s.y - r - 8); c.lineTo(s.x - 10, s.y - r - 26); c.lineTo(s.x + 10, s.y - r - 26); c.closePath(); c.fill(); c.restore();
  }

  /* ---------- 一時停止 ---------- */
  G.pause = function () {
    if (G.screen !== 'battle' || !G.M || G.M.state === 'Result') return;
    G.paused = true; IN.clear(); UI.panel('pause');
  };
  G.onPanelClose = function (kind) {
    if (kind === 'pause' || kind === 'help') { G.paused = false; G.last = 0; }
    if (G.screen === 'plaza') G.toPlaza();
  };
  G.resetAll = function () {
    try { if (store) store.removeItem(PR.KEY); } catch (e) { /* 保存できない端末 */ }
    G.P = PR.load(store, Date.now()); G.normal = null; G.applySettings(); UI.closePanel(); G.toTitle();
  };

  /* ---------- はじまり ---------- */
  function boot() {
    var cv = document.getElementById('game');
    RN.init(cv); RN.buildGround(null);
    IN.init(cv, { stickEl: document.getElementById('stick'), onKey: function (a) { if (a === 'pause' && G.screen === 'battle') { if (G.paused) UI.closePanel(); else G.pause(); } } });
    IN.bindSkill(document.getElementById('sk-j0'), 'j0'); IN.bindSkill(document.getElementById('sk-j1'), 'j1'); IN.bindSkill(document.getElementById('sk-sp'), 'sp');
    var dg = document.getElementById('sk-dodge');
    var dodge = function (e) { e.preventDefault(); IN.I.edge.dodge = true; };
    dg.addEventListener('touchstart', dodge, { passive: false }); dg.addEventListener('mousedown', dodge);
    document.getElementById('btn-ready').onclick = function () { IN.setAct('ready'); };
    document.getElementById('btn-pause').onclick = function () { G.pause(); };
    UI.init(G);
    // 絆で手に入れた装束を表に足す
    Object.keys(G.P.owned).forEach(function (id) { if (id.indexOf('outfit_cn_') === 0 && CH.BY_ID[id.slice(10)]) UI.ensureCnOutfit(id, CH.BY_ID[id.slice(10)]); });
    G.applySettings();
    document.getElementById('btn-start').onclick = function () { AU.unlock(); AU.play('click'); G.startTutorial(); };
    document.getElementById('btn-continue').onclick = function () { AU.unlock(); AU.play('click'); G.toPlaza(); };
    document.getElementById('btn-help').onclick = function () { AU.unlock(); UI.panel('help'); };
    document.getElementById('pl-go').onclick = function () { AU.play('click'); G.toLoadout(); };
    document.getElementById('lo-back').onclick = function () { G.toPlaza(); };
    document.getElementById('lo-go').onclick = function () { AU.unlock(); G.startMatch(); };
    document.getElementById('rs-plaza').onclick = function () { G.toPlaza(); };
    document.getElementById('rs-edit').onclick = function () { G.toLoadout(); };
    document.getElementById('rs-again').onclick = function () { AU.unlock(); G.rematch(); };
    root.addEventListener('resize', function () { RN.resize(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) G.pause(); });
    // 初回はタイトルから最初の任務へ。2回目からは「つづきから」
    G.toTitle();
    if (G.P.stats.tutorial || G.P.stats.tutorialSkipped) document.getElementById('btn-continue').hidden = false;
    root.requestAnimationFrame(frame);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
