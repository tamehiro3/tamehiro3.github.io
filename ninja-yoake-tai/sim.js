/* ニンジャ夜明け隊 — 試合のシミュレーション（サーバー役・§10）
 *
 * 画面と入力から切り離した「正」の判定。ダメージ・再使用・素材・救助・勝敗はここだけで決まる。
 * 画面（クライアント）から受け取るのは「入力の意図」だけ：移動の向き・ねらう場所・技を使う・回避・設置・合図。
 *  - 移動は向きだけを受け取り、速さはここで決める（速度改変ができない）
 *  - 技は再使用が終わっていないと何もしない（連打しても効かない）
 *  - 報酬はここでは渡さない。結果（result）だけを1回だけ確定し、報酬は session_id ごとに1回だけ受け取る（progress.js）
 * 同じ seed と同じ入力なら同じ結果になる（テスト・再現用）。
 * MatchState：Lobby → Preparation → Wave → Intermission → Wave → Intermission → Boss → Result
 */
(function (root) {
  'use strict';
  var D = root.NYT_DATA || require('./data.js');
  var AI = root.NYT_AI || (typeof require !== 'undefined' ? require('./ai.js') : null);
  var B = D.BAL, MAP = D.MAP;

  /* ---------- 小道具 ---------- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function norm(x, y) { var l = Math.hypot(x, y); return l > 1e-6 ? { x: x / l, y: y / l, l: l } : { x: 0, y: 0, l: 0 }; }
  // 線分 ab と点 p の距離
  function segDist(ax, ay, bx, by, px, py) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(ax + dx * t - px, ay + dy * t - py);
  }
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

  /* ---------- 試合をつくる ---------- */
  // cfg: { session_id, seed, difficulty, mission:{mission_template_id, enemy_set_id, support_event_id, objective_variant_id, briefing}, mentor, client,
  //        members:[{id, kind:'human'|'npc', name, role, jutsu:[a,b], look}], weekly, tutorial }
  function createMatch(cfg) {
    var tpl = D.MISSIONS[cfg.mission.mission_template_id] || D.MISSIONS.standard;
    var diff = D.DIFF[cfg.difficulty] || D.DIFF.normal;
    var seed = (cfg.seed >>> 0) || 1;
    var M = {
      rules_version: D.RULES_VERSION, session_id: cfg.session_id || ('s' + seed), seed: seed, rnd: rng(seed),
      difficulty: diff.id, diff: diff, mission: cfg.mission, tpl: tpl, set: D.ENEMY_SETS[cfg.mission.enemy_set_id] || D.ENEMY_SETS.basic,
      objective: cfg.mission.objective_variant_id || 'none', supportId: cfg.mission.support_event_id || 'mend',
      mentor: cfg.mentor || D.FIRST_MENTOR, client: cfg.client || null, weekly: !!cfg.weekly, tutorial: !!cfg.tutorial,
      t: 0, state: 'Lobby', pi: -1, phase: null, phaseT: 0, phaseLen: 0, phases: cfg.phases || D.PHASES,
      n: 1, barrier: { x: MAP.barrier.x, y: MAP.barrier.y, r: MAP.barrier.r, hp: B.barrierHp, max: B.barrierHp },
      materials: B.materialsStart,
      members: [], enemies: [], zones: [], traps: {}, villagers: [], pings: [],
      spots: MAP.trapSpots.concat(tpl.branch ? MAP.extraSpots : []).map(function (s) { return { id: s.id, lane: s.lane, x: s.x, y: s.y }; }),
      gather: MAP.gather.map(function (g) { return { id: g.id, name: g.name, x: g.x, y: g.y, stock: B.gatherStock }; }),
      pillars: tpl.pillars ? MAP.pillars.map(function (p) { return { id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp, max: p.hp, broken: false }; }) : [],
      pillarsBroken: 0, spawnQ: [], waveKey: null, wavesCleared: 0,
      events: [], log: [], nextId: 1, offers: {}, support: { used: false, at: null },
      grace: 0, lamp: 0, bossSpawned: false, result: null,
      team: { trapKills: 0, rescues: 0, villagersSaved: 0, villagersLost: 0, villagersTotal: 0, combos: 0, kills: 0 },
      script: cfg.script || null
    };
    (cfg.members || []).forEach(function (mc, i) { M.members.push(makeMember(M, mc, i)); });
    M.n = humansNow(M);
    return M;
  }
  function makeMember(M, mc, i) {
    var st = MAP.start;
    var m = {
      id: mc.id, kind: mc.kind || 'npc', name: mc.name || mc.id, role: mc.role || 'vanguard', jutsu: (mc.jutsu || ['fire', 'water']).slice(0, 2), look: mc.look || {},
      x: st.x + (i - 1) * 46, y: st.y + (i % 2) * 12, r: B.radius, face: { x: 0, y: 1 }, aimDir: { x: 0, y: 1 },
      hp: B.hp, maxHp: B.hp, down: false, downAt: 0, pin: null,
      cd: { atk: 0, dodge: 0, sp: 0, j0: 0, j1: 0, supply: 0 }, dodgeT: 0, dodgeV: null, inv: 0, dash: null, cast: null,
      guard: 0, guardT: 0, regen: [], lastHit: -99, rescueP: 0, rescuePause: 0, rescuing: null, gatherT: 0, repairT: 0,
      mods: { cd: 1, area: 1, atk: 1, speed: 1, dodgeCd: 0, rescue: 1, trapCost: 0, trapDmg: 1, bind: 1, combo: 0, special: 0 },
      ups: [], graceUsed: false, connected: true, dcAt: null, takeover: false, bombs: 0,
      moving: false, walkT: 0, atkFx: 0, atkAng: 0, lastAct: '', slashCount: 0,
      stats: { dmg: 0, kills: 0, bossDmg: 0, issenKills: 0, blocked: 0, trapKills: 0, trapsPlaced: 0, rescues: 0, safeRescues: 0, quickRescues: 0, healed: 0, repaired: 0, gathered: 0, combos: 0, downs: 0, moved: 0, actions: 0, villagers: 0 },
      ai: { plan: null, t: 0, lane: i % 2 ? 'east' : 'west' }
    };
    if (mc.role === 'vanguard') m.mods.speed = D.ROLES.vanguard.speedMul;
    return m;
  }
  function humansNow(M) { var n = 0; M.members.forEach(function (m) { if (m.kind === 'human' && m.connected && !m.takeover) n++; }); return Math.max(1, n); }
  function ev(M, o) { o.t = M.t; M.events.push(o); }
  function log(M, name, data) { M.log.push({ ev: name, t: Math.round(M.t * 10) / 10, data: data || {} }); }
  function member(M, id) { for (var i = 0; i < M.members.length; i++) if (M.members[i].id === id) return M.members[i]; return null; }

  /* ---------- 流れ ---------- */
  function start(M) {
    if (M.state !== 'Lobby') return;
    log(M, 'match_start', { session_id: M.session_id, mission: M.mission.mission_template_id, difficulty: M.difficulty, roles: M.members.map(function (m) { return m.role; }), weekly: M.weekly });
    nextPhase(M);
  }
  function nextPhase(M) {
    if (M.state === 'Result') return;
    M.pi++;
    var ph = M.phases[M.pi];
    if (!ph) { finalize(M, 'win', 'dawn'); return; }
    M.phase = ph; M.state = ph.state; M.phaseT = ph.dur; M.phaseLen = ph.dur; M.waveKey = ph.wave || null;
    if (ph.state === 'Preparation' || ph.state === 'Intermission') {
      // 準備のはじめ：人数補正を確定し直す（切断で即変動させない）・ダウン中は起き上がる・採集場所がもとにもどる
      M.n = humansNow(M);
      M.members.forEach(function (m) { if (m.down) revive(M, m, 0.5, null); m.hp = Math.max(m.hp, m.maxHp); m.ready = false; });
      M.gather.forEach(function (g) { g.stock = B.gatherStock; });
      M.villagers = M.villagers.filter(function (v) { return v.state === 'walk' || v.state === 'down'; });
      if (ph.pick) makeOffers(M);
      if (ph.id === 'prep3' && M.supportId === 'supply') triggerSupport(M, 'prep3');
    }
    if (ph.wave) buildWave(M, ph.wave, ph.dur);
    if (ph.state === 'Boss' && M.supportId !== 'supply') triggerSupport(M, 'boss');
    ev(M, { type: 'phase', state: M.state, phase: ph.id, name: ph.name });
    if (M.script && M.script.onPhase) M.script.onPhase(M, ph);
  }
  function endWave(M) {
    // 時間切れ：残った妖怪は退く（夜明けへ近づく）。突破した襲撃として数える
    var left = 0;
    M.enemies.forEach(function (e) { if (!e.boss) { left++; ev(M, { type: 'retreat', x: e.x, y: e.y, kind: e.type }); } });
    M.enemies = M.enemies.filter(function (e) { return e.boss; });
    M.zones = M.zones.filter(function (z) { return z.kind !== 'tele' || z.src === 'boss'; });
    M.spawnQ = [];
    M.wavesCleared++;
    M.villagers.forEach(function (v) { if (v.state === 'walk') { v.state = 'saved'; M.team.villagersSaved++; ev(M, { type: 'villager', what: 'saved', x: v.x, y: v.y }); } });
  }

  // 1試合1回だけ結果を確定する（二重確定しない）
  function finalize(M, outcome, reason) {
    if (M.result) return M.result;
    M.state = 'Result';
    var obj = objectiveDone(M, outcome);
    M.result = {
      session_id: M.session_id, rules_version: M.rules_version, outcome: outcome, reason: reason,
      wavesCleared: outcome === 'win' ? 3 : M.wavesCleared, duration: Math.round(M.t), mission: M.mission, difficulty: M.difficulty, weekly: M.weekly,
      objective: { id: M.objective, done: obj }, barrier: { hp: Math.max(0, Math.round(M.barrier.hp)), max: M.barrier.max },
      team: JSON.parse(JSON.stringify(M.team)),
      members: M.members.map(function (m) { return { id: m.id, kind: m.kind, name: m.name, role: m.role, jutsu: m.jutsu.slice(), ups: m.ups.slice(), stats: JSON.parse(JSON.stringify(m.stats)), takeover: m.takeover }; })
    };
    ev(M, { type: 'result', outcome: outcome, reason: reason });
    log(M, 'match_end', { session_id: M.session_id, outcome: outcome, reason: reason, waves: M.result.wavesCleared, t: Math.round(M.t) });
    return M.result;
  }
  function objectiveDone(M, outcome) {
    var o = M.objective;
    if (o === 'none') return false;
    if (o === 'barrier70') return outcome === 'win' && M.barrier.hp >= M.barrier.max * 0.7;
    if (o === 'trap15') return M.team.trapKills >= 15;
    if (o === 'trap25') return M.team.trapKills >= 25;
    if (o === 'rescue3') return M.team.rescues >= 3;
    if (o === 'escortAll') return M.team.villagersTotal > 0 && M.team.villagersLost === 0 && M.team.villagersSaved >= M.team.villagersTotal;
    if (o === 'pillarsBoth') return outcome === 'win' && M.pillars.length > 0 && M.pillarsBroken === 0;
    return false;
  }

  /* ---------- 襲撃の出現予定 ---------- */
  function buildWave(M, key, dur) {
    var comp = M.set[key] || {}, mulC = M.diff.countMul * D.scaleCount(M.n), list = [], rnd = M.rnd;
    Object.keys(comp).forEach(function (type) { var c = Math.max(1, Math.round(comp[type] * mulC)); for (var i = 0; i < c; i++) list.push(type); });
    var koro = list.filter(function (t) { return t === 'koro'; }), spc = list.filter(function (t) { return t !== 'koro'; });
    var boss = key === 'boss', t0 = boss ? 12 : 3, t1 = dur - (boss ? 18 : 20);
    // 押し寄せ（プッシュ）：2本の道から同時に来る。人数を分けて守らないと、空いた道から結界へ届く
    var P = boss ? 3 : 4, q = [], slots = [];
    for (var pi = 0; pi < P; pi++) slots.push({ west: [], east: [] });
    var first = rnd() < 0.5 ? 'west' : 'east', other = first === 'west' ? 'east' : 'west';
    koro.forEach(function (t, i) { var sl = slots[Math.floor(i / 2) % P]; sl[i % 2 ? other : first].push(t); });
    spc.sort(function () { return rnd() - 0.5; });
    spc.forEach(function (t, i) { var sl = slots[P > 1 ? 1 + (i % (P - 1)) : 0]; sl[(i + Math.floor(i / 2)) % 2 ? other : first].unshift(t); });
    slots.forEach(function (sl, pi2) {
      var at = t0 + (t1 - t0) * (P > 1 ? pi2 / (P - 1) : 0);
      ['west', 'east'].forEach(function (ln) { sl[ln].forEach(function (t, k) { q.push({ at: at + k * 0.45 + (ln === other ? 0.8 : 0), type: t, lane: ln }); }); });
    });
    if (boss) q.push({ at: 3, type: 'daruma', lane: rnd() < 0.5 ? 'west' : 'east' });
    q.sort(function (a, b) { return a.at - b.at; });
    M.spawnQ = q; M.waveT = 0;
    // 護衛任務：襲撃のたびに、東西の家から里人が1人ずつ
    if (M.tpl.villagers && !boss) {
      ['west', 'east'].forEach(function (side, i) { M.spawnQ.push({ at: 6 + i * 4, type: 'villager', lane: side }); });
      M.spawnQ.sort(function (a, b) { return a.at - b.at; });
    }
  }
  function lanePath(M, lane) {
    var src = M.tpl.branch && M.rnd() < 0.5 ? MAP.branches[lane] : MAP.lanes[lane];
    var off = (M.rnd() - 0.5) * 24;
    return src.map(function (p, i) { return { x: p[0] + (i && i < src.length - 1 ? off : 0), y: p[1] + (i && i < src.length - 1 ? off * 0.6 : 0) }; });
  }
  function spawnEnemy(M, type, opt) {
    opt = opt || {};
    var E = D.ENEMY[type];
    var hpMul = M.diff.hpMul * D.scaleHp(M.n) * (opt.hpMul || 1);
    var path = opt.path || (opt.lane ? lanePath(M, opt.lane) : null);
    var p0 = opt.x != null ? { x: opt.x, y: opt.y } : path ? path[0] : { x: 800, y: 60 };
    var e = {
      id: M.nextId++, type: type, boss: !!E.boss, x: p0.x + (M.rnd() - 0.5) * 16, y: p0.y + (M.rnd() - 0.5) * 16, r: E.r,
      hp: Math.round(E.hp * hpMul), maxHp: Math.round(E.hp * hpMul), speed: E.speed, path: path, wp: 1, lane: opt.lane || null,
      face: { x: 0, y: 1 }, target: null, aggroT: 0, atkT: 0.5 + M.rnd() * 0.5, castT: 1 + M.rnd(), tele: null,
      bound: 0, slow: 0, slowMul: 1, stun: 0, lure: 0, kv: null, burn: 0, burnDps: 0, burnBy: null, mkT: 0, hitFx: 0, walkT: M.rnd() * 10,
      pillarPick: {}, bossT: 3, bossI: 0, roll: null, dummy: type === 'dummy'
    };
    if (e.path && e.path.length > 1) { var d0 = norm(e.path[1].x - e.x, e.path[1].y - e.y); e.face = { x: d0.x, y: d0.y }; }
    M.enemies.push(e);
    if (e.boss) { M.bossSpawned = true; ev(M, { type: 'bossAppear', kind: type, x: e.x, y: e.y }); }
    return e;
  }
  function spawnVillager(M, side) {
    var hp = MAP.homes[side];
    var v = { id: M.nextId++, side: side, x: hp[0][0], y: hp[0][1], r: 13, hp: 60, maxHp: 60, path: hp.map(function (p) { return { x: p[0], y: p[1] }; }), wp: 1, state: 'walk', downAt: 0, rescueP: 0, face: { x: 1, y: 0 }, walkT: 0 };
    M.villagers.push(v); M.team.villagersTotal++;
    ev(M, { type: 'villager', what: 'appear', x: v.x, y: v.y });
    return v;
  }

  /* ---------- 1ステップ ---------- */
  // intents: { memberId: { mx, my, aim:{x,y}|null, atk, autoAtk, j0, j1, sp, dodge, act, ping, pin:{x,y} } }
  function step(M, dt, intents) {
    if (M.state === 'Result' || M.state === 'Lobby') return;
    intents = intents || {};
    M.t += dt;
    if (M.lamp > 0) M.lamp -= dt;
    if (M.script && M.script.onTick) M.script.onTick(M, dt);
    if (M.state === 'Result') return;

    // 出現
    if (M.spawnQ.length) {
      M.waveT += dt;
      while (M.spawnQ.length && M.spawnQ[0].at <= M.waveT) {
        var s = M.spawnQ.shift();
        if (s.type === 'villager') spawnVillager(M, s.lane); else spawnEnemy(M, s.type, { lane: s.lane });
      }
    }

    // 入力（人）と AI（NPC・切断中の人）
    var H = helpers();
    M.members.forEach(function (m) {
      var it;
      if (m.kind === 'human' && m.connected && !m.takeover) it = intents[m.id] || {};
      else it = AI ? AI.think(M, m, dt, H) : {};
      if (m.kind === 'human' && !m.connected && !m.takeover && M.t - m.dcAt >= B.slotHold) {
        m.takeover = true; ev(M, { type: 'takeover', id: m.id }); log(M, 'npc_takeover', { id: m.id });
      }
      applyIntent(M, m, it, dt);
    });

    updateMembers(M, dt);
    updateEnemies(M, dt);
    updateVillagers(M, dt);
    updateZones(M, dt);
    updateTraps(M, dt);
    separate(M);
    updateRescue(M, dt);
    M.pings = M.pings.filter(function (p) { return p.until > M.t; });

    // 支援（結界が弱ったら早めに）
    if (!M.support.used && M.supportId !== 'supply' && M.barrier.hp < M.barrier.max * B.lowBarrierSupport && M.barrier.hp > 0 && (M.state === 'Wave' || M.state === 'Boss')) triggerSupport(M, 'low');

    // 時間
    M.phaseT -= dt;
    checkEnd(M, dt);
    if (M.state === 'Result') return;
    if (M.phaseT <= 0) {
      if (M.state === 'Wave') endWave(M);
      if (M.state === 'Preparation' || M.state === 'Intermission') autoPick(M);
      if (M.state === 'Boss') { finalize(M, 'win', 'dawn'); return; }
      nextPhase(M);
    }
  }

  // 勝敗の判定。優先順位は固定：①勝利（夜明け・大だるま）②結界の破壊 ③全員ダウン
  function checkEnd(M, dt) {
    if (M.state === 'Result') return;
    if (M.state === 'Boss' && M.bossSpawned && !M.enemies.some(function (e) { return e.boss; }) && !M.spawnQ.some(function (q) { return q.type === 'daruma'; })) { finalize(M, 'win', 'boss'); return; }
    if (M.state === 'Boss' && M.phaseT <= 0) { finalize(M, 'win', 'dawn'); return; }
    if (M.barrier.hp <= 0) { finalize(M, 'lose', 'barrier'); return; }
    var alive = M.members.some(function (m) { return !m.down; });
    if (!alive && M.members.length) {
      if (M.grace <= 0) { M.grace = B.allDownGrace; ev(M, { type: 'grace', t0: B.allDownGrace }); }
      else { M.grace -= dt; if (M.grace <= 0) { finalize(M, 'lose', 'allDown'); } }
    } else if (M.grace > 0) { M.grace = 0; ev(M, { type: 'graceEnd' }); }
  }

  /* ---------- 入力の意図を反映（ここで検証する）---------- */
  function applyIntent(M, m, it, dt) {
    var inPrep = M.state === 'Preparation' || M.state === 'Intermission';
    m.intent = it;
    if (it.say && (!m.sayT || M.t > m.sayT)) { m.sayT = M.t + 6; ev(M, { type: 'say', id: m.id, key: it.say, x: m.x, y: m.y }); }
    // 移動：向きだけを受け取る（長さは1まで）
    var mv = norm(+it.mx || 0, +it.my || 0), ml = Math.min(1, mv.l);
    if (!isFinite(ml)) ml = 0;
    if (it.ping && (it.ping === 'gather' || it.ping === 'defend' || it.ping === 'help') && !m.down) {
      if (!m.pingCd || m.pingCd <= M.t) {
        M.pings.push({ kind: it.ping, by: m.id, x: m.x, y: m.y, until: M.t + (it.ping === 'defend' ? 15 : 9) });
        m.pingCd = M.t + 1.5;
        ev(M, { type: 'ping', kind: it.ping, by: m.id, x: m.x, y: m.y });
      }
    }
    if (m.down) {
      // ダウン中：ゆっくり這う・安全な方向をピンで示す
      if (it.pin && isFinite(it.pin.x)) { m.pin = { x: clamp(it.pin.x, 20, MAP.w - 20), y: clamp(it.pin.y, 20, MAP.h - 20), until: M.t + 8 }; ev(M, { type: 'pin', id: m.id, x: m.pin.x, y: m.pin.y }); }
      if (ml > 0.05) moveBy(M, m, mv.x * B.crawl * ml * dt, mv.y * B.crawl * ml * dt);
      m.moving = ml > 0.05;
      return;
    }
    // 回避・一閃・集中のあいだに押した技は、0.35秒だけ覚えておいて、終わったらすぐ使う（入力が消えない）
    var busy = function () { return m.cast || m.dodgeT > 0 || m.dash; };
    if ((it.sp || it.j0 || it.j1) && busy()) m.buf = { sp: !!(it.sp || (m.buf && m.buf.sp)), j0: !!(it.j0 || (m.buf && m.buf.j0)), j1: !!(it.j1 || (m.buf && m.buf.j1)), aim: it.aim || (m.buf && m.buf.aim) || null, until: M.t + 0.35 };
    if (m.cast) { m.moving = false; if (it.dodge && m.cd.dodge <= 0) m.cast = null; else return; } // 癒しの輪の集中中は動けない（回避で取り消し）
    if (it.aim && isFinite(it.aim.x)) { var ad = norm(it.aim.x - m.x, it.aim.y - m.y); if (ad.l > 1) m.aimDir = { x: ad.x, y: ad.y }; }

    // 回避
    if (it.dodge && m.cd.dodge <= 0 && !m.dash) {
      var dv = ml > 0.1 ? { x: mv.x, y: mv.y } : { x: m.face.x, y: m.face.y };
      m.dodgeT = B.dodgeTime; m.dodgeV = dv; m.inv = Math.max(m.inv, B.dodgeInv); m.cd.dodge = Math.max(1, B.dodgeCd + m.mods.dodgeCd);
      m.cast = null; m.stats.actions++;
      ev(M, { type: 'dodge', id: m.id, x: m.x, y: m.y, dx: dv.x, dy: dv.y });
    }
    if (m.dodgeT > 0 || m.dash) { m.moving = true; return; }
    if (m.buf) {
      if (M.t <= m.buf.until) { if (m.buf.sp) it.sp = true; if (m.buf.j0) it.j0 = true; if (m.buf.j1) it.j1 = true; if (!it.aim) it.aim = m.buf.aim; }
      m.buf = null;
    }

    // 歩く
    if (ml > 0.05) {
      var sp = B.speed * m.mods.speed * ml;
      moveBy(M, m, mv.x * sp * dt, mv.y * sp * dt);
      m.face = { x: mv.x, y: mv.y };
      m.moving = true;
    } else m.moving = false;

    // 行動（設置・修理・補給・強化・準備完了）
    if (it.act) doAct(M, m, it.act, inPrep);

    // 技（再使用中は何もしない）
    if (it.sp && m.cd.sp <= 0) castSpecial(M, m, it.aim);
    if (it.j0 && m.cd.j0 <= 0) castJutsu(M, m, 0, it.aim);
    if (it.j1 && m.cd.j1 <= 0) castJutsu(M, m, 1, it.aim);

    // 通常攻撃（自動：近くに敵がいると攻撃する／手動：押しているあいだ）
    var auto = it.autoAtk !== false;
    if (m.cd.atk <= 0 && !m.rescuing && (auto || it.atk)) {
      var tgt = nearestEnemy(M, m, B.atkRange + 30);
      if (tgt && (dist(m, tgt) <= B.atkRange + tgt.r || it.atk)) normalAttack(M, m, tgt);
      else if (it.atk) normalAttack(M, m, null);
    }
  }
  function moveBy(M, m, dx, dy) {
    var ox = m.x, oy = m.y;
    m.x = clamp(m.x + dx, 20, MAP.w - 20); m.y = clamp(m.y + dy, 30, MAP.h - 20);
    // 結界石は通れない
    var b = M.barrier, d = norm(m.x - b.x, m.y - b.y), lim = b.r + m.r;
    if (d.l < lim) { m.x = b.x + d.x * lim; m.y = b.y + d.y * lim; }
    m.stats.moved += Math.hypot(m.x - ox, m.y - oy);
  }

  function doAct(M, m, act, inPrep) {
    var a = String(act);
    if (a.indexOf('trap:') === 0) {
      var kind = a.slice(5), T = D.TRAPS[kind];
      if (!T || !inPrep) return;
      var spot = nearestSpot(M, m, B.trapRange);
      if (!spot) return;
      var cur = M.traps[spot.id];
      if (cur && cur.kind === kind) return;
      var cost = Math.max(1, T.cost - (m.role === 'guard' ? D.ROLES.guard.trapDiscount : 0) + m.mods.trapCost);
      if (M.materials < cost) { ev(M, { type: 'short', id: m.id, need: cost }); return; }
      M.materials -= cost;
      M.traps[spot.id] = { spot: spot.id, kind: kind, x: spot.x, y: spot.y, uses: T.uses || 0, charges: T.charges || 0, rearm: 0, owner: m.id, dmgMul: m.mods.trapDmg };
      m.stats.trapsPlaced++; m.stats.actions++;
      ev(M, { type: 'trap', what: 'place', kind: kind, spot: spot.id, x: spot.x, y: spot.y, by: m.id });
      return;
    }
    if (a === 'repair') {
      if (!inPrep || dist(m, M.barrier) > B.repairRange || M.barrier.hp >= M.barrier.max || M.materials < 1) return;
      if (m.repairT > 0) return;
      m.repairT = B.repairInterval;
      M.materials--; var add = Math.min(B.repairPer, M.barrier.max - M.barrier.hp);
      M.barrier.hp += add; m.stats.repaired += add; m.stats.actions++;
      ev(M, { type: 'repair', by: m.id, amt: add, x: M.barrier.x, y: M.barrier.y });
      return;
    }
    if (a === 'potion' || a === 'charm' || a === 'bomb') {
      var S = D.SUPPLY[a];
      if (a !== 'bomb' && dist(m, MAP.supply) > B.supplyRange) return;
      if (m.cd.supply > 0) return;
      if (a === 'bomb' && !(m.bombs > 0)) {
        // 焙烙玉は補給所で受け取り、あとで投げる（1人2個まで）
        return;
      }
      if (a !== 'bomb' && M.materials < S.cost) { ev(M, { type: 'short', id: m.id, need: S.cost }); return; }
      if (a === 'potion' && m.hp >= m.maxHp) return;
      if (a !== 'bomb') M.materials -= S.cost;
      m.cd.supply = a === 'bomb' ? 0.8 : B.supplyCd; m.stats.actions++;
      if (a === 'potion') healMember(M, m, S.heal, null);
      else if (a === 'charm') { m.guard = Math.max(m.guard, S.shield); m.guardT = S.dur; }
      else {
        m.bombs--;
        var bp = aimPoint(M, m, m.intent && m.intent.aim, S.range, 'cluster', S.r);
        M.zones.push({ kind: 'blast', x: bp.x, y: bp.y, r: S.r, t: 0.45, dmg: S.dmg, by: m.id, cid: M.nextId++, color: '#ffb03a', src: 'bomb', lob: { x: m.x, y: m.y } });
      }
      ev(M, { type: 'supply', item: a, by: m.id, x: m.x, y: m.y });
      return;
    }
    if (a === 'getbomb') {
      var SB = D.SUPPLY.bomb;
      if (dist(m, MAP.supply) > B.supplyRange || (m.bombs || 0) >= 2) return;
      if (M.materials < SB.cost) { ev(M, { type: 'short', id: m.id, need: SB.cost }); return; }
      M.materials -= SB.cost; m.bombs = (m.bombs || 0) + 1; m.stats.actions++;
      ev(M, { type: 'supply', item: 'getbomb', by: m.id, x: m.x, y: m.y });
      return;
    }
    if (a.indexOf('pick:') === 0) { pickUpgrade(M, m, +a.slice(5)); return; }
    if (a === 'ready') {
      if (!inPrep) return;
      m.ready = true;
      var all = M.members.every(function (x) { return x.kind !== 'human' || !x.connected || x.takeover || x.ready; });
      if (all && M.phaseT > 0.5) { M.phaseT = 0.5; ev(M, { type: 'ready' }); }
    }
  }

  /* ---------- 攻撃と技 ---------- */
  function normalAttack(M, m, tgt) {
    var dir = tgt ? norm(tgt.x - m.x, tgt.y - m.y) : { x: m.face.x, y: m.face.y };
    if (tgt) m.face = { x: dir.x, y: dir.y };
    m.cd.atk = B.atkInterval; m.atkFx = 0.2; m.atkAng = Math.atan2(dir.y, dir.x); m.slashCount++;
    var ang = m.atkAng, half = B.atkArc / 2 * Math.PI / 180, hit = 0;
    M.enemies.slice().forEach(function (e) {
      var d = dist(m, e); if (d > B.atkRange + e.r) return;
      if (d > e.r && Math.abs(angDiff(Math.atan2(e.y - m.y, e.x - m.x), ang)) > half) return;
      hurtEnemy(M, e, B.atk * m.mods.atk, { by: m.id, kind: 'atk', x: m.x, y: m.y, dir: true });
      hit++;
    });
    if (hit) m.stats.actions++;
    ev(M, { type: 'slash', id: m.id, x: m.x, y: m.y, ang: ang, hit: hit });
  }
  function cdMul(m) { return m.mods.cd; }

  function castSpecial(M, m, aim) {
    var R = D.ROLES[m.role], S = R.special;
    if (m.role === 'vanguard') {
      var dir = aimDir(M, m, aim, S.len);
      m.dash = { t: S.time, vx: dir.x * S.len / S.time, vy: dir.y * S.len / S.time, x0: m.x, y0: m.y, hit: {}, dmg: S.dmg + 12 * m.mods.special, cid: M.nextId++ };
      m.inv = Math.max(m.inv, S.time + 0.08); m.face = { x: dir.x, y: dir.y };
      ev(M, { type: 'cast', id: m.id, skill: 'issen', x: m.x, y: m.y, dx: dir.x, dy: dir.y });
    } else if (m.role === 'guard') {
      var p = aimPoint(M, m, aim, S.range, 'dome');
      M.zones.push({ kind: 'dome', id: M.nextId++, x: p.x, y: p.y, r: S.r, hp: S.hp + 50 * m.mods.special, max: S.hp + 50 * m.mods.special, t: S.dur, life: S.dur, owner: m.id });
      ev(M, { type: 'cast', id: m.id, skill: 'dome', x: p.x, y: p.y });
    } else {
      m.cast = { t: S.cast, heal: S.heal + 12 * m.mods.special, r: S.r };
      ev(M, { type: 'cast', id: m.id, skill: 'ringStart', x: m.x, y: m.y });
    }
    m.cd.sp = S.cd * cdMul(m); m.stats.actions++;
  }

  function castJutsu(M, m, slot, aim) {
    var J = D.JUTSU[m.jutsu[slot]];
    if (!J) return;
    var area = m.mods.area, cid = M.nextId++;
    var p, dir;
    switch (J.id) {
      case 'fire':
        p = aimPoint(M, m, aim, J.range, 'cluster', J.r * area);
        M.zones.push({ kind: 'blast', x: p.x, y: p.y, r: J.r * area, t: J.delay, dmg: J.dmg, by: m.id, cid: cid, color: J.color, src: 'fire' });
        break;
      case 'fireline':
        dir = aimDir(M, m, aim, J.len);
        M.zones.push({ kind: 'fireline', x: m.x, y: m.y, x2: m.x + dir.x * J.len * area, y2: m.y + dir.y * J.len * area, w: J.width * area, t: J.delay, life: J.delay + 0.5, dmg: J.dmg, burn: J.burn, burnDps: J.burnDps, by: m.id, cid: cid, color: J.color });
        break;
      case 'water':
        p = aimPoint(M, m, aim, J.range, 'cluster', J.r * area);
        M.zones.push({ kind: 'cage', x: p.x, y: p.y, r: J.r * area, t: 0.9, life: 0.9 });
        M.enemies.forEach(function (e) { if (dist(e, p) <= J.r * area + e.r) bindEnemy(M, e, J.bind * m.mods.bind, m); });
        break;
      case 'mist':
        p = aimPoint(M, m, aim, J.range, 'cluster', J.r * area);
        M.zones.push({ kind: 'mist', x: p.x, y: p.y, r: J.r * area, t: J.dur * m.mods.bind, life: J.dur * m.mods.bind, slow: J.slow, by: m.id });
        break;
      case 'wind':
        dir = aimDir(M, m, aim, J.len);
        var half = J.arc / 2 * Math.PI / 180, a0 = Math.atan2(dir.y, dir.x), n = 0;
        M.enemies.slice().forEach(function (e) {
          var d = dist(m, e); if (d > J.len * area + e.r) return;
          if (Math.abs(angDiff(Math.atan2(e.y - m.y, e.x - m.x), a0)) > half && d > e.r + 10) return;
          if (!e.boss) { e.kv = { x: dir.x * J.push / 0.5, y: dir.y * J.push / 0.5, t: 0.5 }; e.lure = J.lure * m.mods.bind; e.lureBy = m.id; }
          hurtEnemy(M, e, J.dmg, { by: m.id, kind: 'wind', x: m.x, y: m.y, cid: cid }); n++;
        });
        M.zones.push({ kind: 'gust', x: m.x, y: m.y, dx: dir.x, dy: dir.y, len: J.len * area, arc: J.arc, t: 0.4, life: 0.4 });
        break;
      case 'pull':
        p = aimPoint(M, m, aim, J.range, 'cluster', J.r * area);
        M.enemies.slice().forEach(function (e) {
          var d = dist(e, p); if (d > J.r * area + e.r) return;
          if (!e.boss && d > 10) { var k = norm(p.x - e.x, p.y - e.y); e.kv = { x: k.x * d / 0.5, y: k.y * d / 0.5, t: 0.5 }; e.lure = J.lure * m.mods.bind; e.lureBy = m.id; }
          hurtEnemy(M, e, J.dmg, { by: m.id, kind: 'wind', x: p.x, y: p.y, cid: cid });
        });
        M.zones.push({ kind: 'vortex', x: p.x, y: p.y, r: J.r * area, t: 0.5, life: 0.5 });
        break;
      case 'stone':
        p = aimPoint(M, m, aim, J.range, 'wall');
        dir = aimDir(M, m, aim, J.range);
        var px = -dir.y, py = dir.x, L = J.len * area / 2;
        M.zones.push({ kind: 'wall', id: M.nextId++, x: p.x - px * L, y: p.y - py * L, x2: p.x + px * L, y2: p.y + py * L, cx: p.x, cy: p.y, hp: J.hp, max: J.hp, t: J.dur, life: J.dur, owner: m.id });
        break;
      case 'decoy':
        p = aimPoint(M, m, aim, J.range, 'cluster', J.r);
        M.zones.push({ kind: 'decoy', id: M.nextId++, x: p.x, y: p.y, r: J.r * area, hp: J.hp, max: J.hp, t: J.dur, life: J.dur, owner: m.id });
        break;
      case 'thunder':
        var first = null, best = 1e9, from = aim && isFinite(aim.x) ? aim : m;
        M.enemies.forEach(function (e) { var d = dist(e, from), dm = dist(e, m); if (dm <= J.range + e.r && d < best) { best = d; first = e; } });
        if (!first) first = nearestEnemy(M, m, J.range);
        var chain = [], cur = first;
        while (cur && chain.length < J.chain) {
          chain.push(cur);
          var nx = null, nb = 1e9;
          M.enemies.forEach(function (e) { if (chain.indexOf(e) >= 0) return; var d = dist(e, cur); if (d <= J.jump * area && d < nb) { nb = d; nx = e; } });
          cur = nx;
        }
        var pts = [{ x: m.x, y: m.y - 20 }];
        chain.forEach(function (e) { pts.push({ x: e.x, y: e.y }); if (!e.boss) e.stun = Math.max(e.stun, J.stun * m.mods.bind); hurtEnemy(M, e, J.dmg, { by: m.id, kind: 'thunder', x: m.x, y: m.y, cid: cid }); });
        M.zones.push({ kind: 'bolt', pts: pts, t: 0.3, life: 0.3 });
        if (!chain.length) M.zones.push({ kind: 'bolt', pts: [{ x: m.x, y: m.y - 20 }, { x: m.x + m.aimDir.x * 90, y: m.y + m.aimDir.y * 90 }], t: 0.25, life: 0.25 });
        break;
      case 'thundertrap':
        p = aimPoint(M, m, aim, J.range, 'cluster', J.r);
        M.zones.push({ kind: 'ttrap', x: p.x, y: p.y, r: J.r * area, t: J.dur, life: J.dur, arm: 0.5, dmg: J.dmg, stun: J.stun * m.mods.bind, by: m.id, cid: cid });
        break;
      case 'leaf':
        allies(M, m, J.r * area).forEach(function (a) { healMember(M, a, J.heal, m); a.regen.push({ left: J.regen, rate: J.regen / J.regenTime, by: m.id }); });
        M.zones.push({ kind: 'leaves', x: m.x, y: m.y, r: J.r * area, t: 0.8, life: 0.8 });
        break;
      case 'guardleaf':
        allies(M, m, J.r * area).forEach(function (a) { a.guard = Math.max(a.guard, J.shield); a.guardT = Math.max(a.guardT, J.dur); a.guardBy = m.id; });
        M.zones.push({ kind: 'leaves', x: m.x, y: m.y, r: J.r * area, t: 0.8, life: 0.8, gold: true });
        break;
    }
    m.cd['j' + slot] = J.cd * cdMul(m); m.stats.actions++;
    ev(M, { type: 'cast', id: m.id, skill: J.id, x: (p || m).x, y: (p || m).y });
  }
  function allies(M, m, r) { return M.members.filter(function (a) { return !a.down && dist(a, m) <= r; }); }

  // ねらう場所：指定がなければ「標的補助」で自動（敵が多い所・ダウンした味方・壁を置く所）
  function aimPoint(M, m, aim, range, mode, rad) {
    if (aim && isFinite(aim.x)) {
      var d = norm(aim.x - m.x, aim.y - m.y);
      var L = Math.min(range, d.l);
      return { x: clamp(m.x + d.x * L, 20, MAP.w - 20), y: clamp(m.y + d.y * L, 20, MAP.h - 20) };
    }
    if (mode === 'dome') {
      var dn = M.members.filter(function (a) { return a.down && dist(a, m) <= range; })[0];
      if (dn) return { x: dn.x, y: dn.y };
      var vd = M.villagers.filter(function (v) { return v.state === 'down' && dist(v, m) <= range; })[0];
      if (vd) return { x: vd.x, y: vd.y };
      return { x: m.x, y: m.y };
    }
    if (mode === 'wall') {
      var t = nearestEnemy(M, m, range + 120);
      if (t) { var k = norm(t.x - m.x, t.y - m.y); var L2 = Math.min(range, Math.max(50, k.l * 0.6)); return { x: m.x + k.x * L2, y: m.y + k.y * L2 }; }
      return { x: m.x + m.face.x * 80, y: m.y + m.face.y * 80 };
    }
    var c = bestCluster(M, m, range, rad || 80);
    if (c) return c;
    return { x: m.x + m.face.x * Math.min(range, 120), y: m.y + m.face.y * Math.min(range, 120) };
  }
  function aimDir(M, m, aim, range) {
    if (aim && isFinite(aim.x)) { var d = norm(aim.x - m.x, aim.y - m.y); if (d.l > 2) return d; }
    var c = bestLine(M, m, range);
    if (c) return c;
    var t = nearestEnemy(M, m, range + 60);
    if (t) return norm(t.x - m.x, t.y - m.y);
    return { x: m.face.x, y: m.face.y };
  }
  function nearestEnemy(M, p, range) {
    var best = null, bd = range == null ? 1e9 : range;
    M.enemies.forEach(function (e) { var d = dist(p, e) - e.r; if (d < bd) { bd = d; best = e; } });
    return best;
  }
  function nearestSpot(M, p, range) {
    var best = null, bd = range;
    M.spots.forEach(function (s) { var d = dist(p, s); if (d <= bd) { bd = d; best = s; } });
    return best;
  }
  // 半径 rad の中に入る敵がいちばん多い点（届く範囲 range の中）
  function bestCluster(M, p, range, rad) {
    var best = null, bn = 0, bd = 1e9;
    M.enemies.forEach(function (e) {
      var d = dist(p, e); if (d > range + rad * 0.5) return;
      var n = 0;
      M.enemies.forEach(function (o) { if (dist(o, e) <= rad) n += (o.bound > 0 || o.stun > 0) ? 1.5 : 1; });
      if (n > bn || (n === bn && d < bd)) { bn = n; bd = d; best = e; }
    });
    if (!best) return null;
    var k = norm(best.x - p.x, best.y - p.y), L = Math.min(range, k.l);
    return { x: p.x + k.x * L, y: p.y + k.y * L, n: bn };
  }
  // 一閃・炎の道：線の上に敵がいちばん多い向き
  function bestLine(M, p, len) {
    var best = null, bn = 0;
    M.enemies.forEach(function (e) {
      var d = dist(p, e); if (d > len + e.r || d < 1) return;
      var k = norm(e.x - p.x, e.y - p.y), n = 0;
      M.enemies.forEach(function (o) { if (segDist(p.x, p.y, p.x + k.x * len, p.y + k.y * len, o.x, o.y) <= 26 + o.r) n++; });
      if (n > bn) { bn = n; best = k; }
    });
    return best ? { x: best.x, y: best.y } : null;
  }

  /* ---------- ダメージと回復 ---------- */
  function comboMul(M, byId) { var m = member(M, byId); return m && m.mods.combo ? m.mods.combo : B.comboMul; }
  // src: { by, kind, x, y, aoe, dir, trap, cid }
  function hurtEnemy(M, e, dmg, src) {
    if (e.hp <= 0) return 0;
    var mul = 1;
    // 盾持ち：正面の攻撃は軽減、背中は弱点（向きのある攻撃だけ）
    if (e.type === 'kasa' && src.dir) {
      var to = norm(src.x - e.x, src.y - e.y), dot = to.x * e.face.x + to.y * e.face.y;
      if (dot > 0.35) { mul *= D.ENEMY.kasa.front; ev(M, { type: 'guarded', x: e.x, y: e.y }); }
      else if (dot < -0.35) mul *= D.ENEMY.kasa.back;
    }
    // 連携：足止め → 範囲攻撃
    if (src.aoe && (e.bound > 0 || e.stun > 0 || (e.slow > 0 && e.slowMul <= 0.5))) {
      mul *= comboMul(M, src.by);
      if (!src.comboDone) { src.comboDone = true; combo(M, 'bind_aoe', e.x, e.y, src.by); }
    }
    if (M.lamp > 0) mul *= 1.25;
    var amt = src.quiet ? dmg * mul : Math.max(1, Math.round(dmg * mul)); // 燃えるダメージは少しずつ（端数のまま）
    e.hp -= amt; if (!src.quiet) e.hitFx = 0.15;
    var m = src.by ? member(M, src.by) : null;
    if (m) { m.stats.dmg += amt; if (e.boss) m.stats.bossDmg += amt; }
    if (!src.quiet) ev(M, { type: 'hit', x: e.x, y: e.y - e.r, amt: amt, kind: src.kind, big: mul > 1.4, weak: e.type === 'kasa' && mul < 0.5 });
    if (e.hp <= 0) purify(M, e, src);
    return amt;
  }
  function purify(M, e, src) {
    M.enemies = M.enemies.filter(function (x) { return x !== e; });
    M.zones = M.zones.filter(function (z) { return !(z.kind === 'tele' && z.src === e.id); });
    M.team.kills++;
    var m = src && src.by ? member(M, src.by) : null;
    if (m) {
      m.stats.kills++;
      if (src.kind === 'issen') m.stats.issenKills++;
      if (src.trap) m.stats.trapKills++;
    }
    if (src && src.trap) M.team.trapKills++;
    ev(M, { type: 'purify', x: e.x, y: e.y, kind: e.type, boss: e.boss });
    if (e.boss) ev(M, { type: 'bossDown', kind: e.type, x: e.x, y: e.y });
  }
  function combo(M, kind, x, y, byId) {
    M.team.combos++;
    var m = byId ? member(M, byId) : null;
    if (m) m.stats.combos++;
    ev(M, { type: 'combo', kind: kind, x: x, y: y, by: byId });
    log(M, 'combo_triggered', { kind: kind, by: byId });
  }
  function bindEnemy(M, e, t, m) {
    if (e.boss) { e.slow = Math.max(e.slow, t); e.slowMul = Math.min(e.slowMul, 0.5); e.bossBind = t; }
    else { e.bound = Math.max(e.bound, t); if (e.tele) cancelTele(M, e); }
  }
  function cancelTele(M, e) { M.zones = M.zones.filter(function (z) { return !(z.kind === 'tele' && z.src === e.id); }); e.tele = null; ev(M, { type: 'interrupt', x: e.x, y: e.y }); }

  // 味方へのダメージ：回避中は当たらない／結界の中は外からの攻撃を受けない（結界が肩代わり）／守りが先に減る
  function hurtMember(M, m, dmg, src) {
    if (m.down || m.inv > 0 || dmg <= 0) return 0;
    dmg = dmg * M.diff.dmgMul;
    var dome = domeAt(M, m.x, m.y);
    if (dome && (!src || src.x == null || dist(src, dome) > dome.r)) {
      dome.hp -= dmg; var ow = member(M, dome.owner); if (ow) ow.stats.blocked += dmg;
      ev(M, { type: 'block', x: m.x, y: m.y - 20 });
      if (dome.hp <= 0) breakZone(M, dome);
      return 0;
    }
    if (m.guard > 0) {
      var ab = Math.min(m.guard, dmg); m.guard -= ab; dmg -= ab;
      var gb = m.guardBy ? member(M, m.guardBy) : null; if (gb && gb !== m) gb.stats.blocked += ab;
      if (dmg <= 0) { ev(M, { type: 'block', x: m.x, y: m.y - 20 }); return 0; }
    }
    m.hp -= dmg; m.lastHit = M.t; m.hurtFx = 0.25;
    if (m.rescuing) m.rescuePause = B.rescuePause;
    ev(M, { type: 'hurt', id: m.id, x: m.x, y: m.y - 30, amt: Math.round(dmg) });
    if (m.hp <= 0) downMember(M, m);
    return dmg;
  }
  function downMember(M, m) {
    m.hp = 0; m.down = true; m.downAt = M.t; m.dash = null; m.cast = null; m.dodgeT = 0; m.rescuing = null; m.rescueP = 0; m.guard = 0; m.regen = [];
    m.stats.downs++;
    ev(M, { type: 'down', id: m.id, x: m.x, y: m.y });
  }
  function revive(M, m, rate, by) {
    m.down = false; m.hp = Math.max(1, Math.round(m.maxHp * rate)); m.inv = Math.max(m.inv, 1); m.rescueP = 0; m.pin = null;
    ev(M, { type: 'revive', id: m.id, by: by ? by.id : null, x: m.x, y: m.y });
  }
  function healMember(M, a, amt, by) {
    if (a.down) return 0;
    var h = Math.min(amt, a.maxHp - a.hp);
    if (h <= 0) return 0;
    a.hp += h;
    if (by) by.stats.healed += h;
    ev(M, { type: 'heal', id: a.id, x: a.x, y: a.y - 30, amt: Math.round(h) });
    return h;
  }
  function hurtBarrier(M, dmg, src) {
    var mul = M.diff.dmgMul * (1 + 0.15 * M.pillarsBroken);
    var d = dmg * mul;
    var dome = domeAt(M, M.barrier.x, M.barrier.y);
    if (dome && src && dist(src, dome) > dome.r) { dome.hp -= d; var ow = member(M, dome.owner); if (ow) ow.stats.blocked += d; if (dome.hp <= 0) breakZone(M, dome); ev(M, { type: 'block', x: M.barrier.x, y: M.barrier.y - 40 }); return; }
    M.barrier.hp = Math.max(0, M.barrier.hp - d);
    ev(M, { type: 'barrierHit', amt: Math.round(d) });
  }
  function domeAt(M, x, y) {
    for (var i = 0; i < M.zones.length; i++) { var z = M.zones[i]; if (z.kind === 'dome' && Math.hypot(z.x - x, z.y - y) <= z.r) return z; }
    return null;
  }
  function breakZone(M, z) { z.t = 0; ev(M, { type: 'break', kind: z.kind, x: z.cx || z.x, y: z.cy || z.y }); }

  /* ---------- 味方の更新 ---------- */
  function updateMembers(M, dt) {
    M.members.forEach(function (m) {
      for (var k in m.cd) if (m.cd[k] > 0) m.cd[k] -= dt;
      if (m.inv > 0) m.inv -= dt;
      if (m.atkFx > 0) m.atkFx -= dt;
      if (m.hurtFx > 0) m.hurtFx -= dt;
      if (m.guardT > 0) { m.guardT -= dt; if (m.guardT <= 0) m.guard = 0; }
      if (m.rescuePause > 0) m.rescuePause -= dt;
      if (m.repairT > 0) m.repairT -= dt;
      if (m.moving) m.walkT += dt;
      if (m.down) {
        // 全員ダウンの救済時間：結界にたどり着けば起き上がる（1人1回）
        // 起き上がるのは最初にたどり着いた1人（ほかの仲間は、その人が助ける）
        if (M.grace > 0 && !m.graceUsed && dist(m, M.barrier) <= MAP.barrier.aura + 10) { m.graceUsed = true; revive(M, m, B.graceReviveRate, null); M.grace = 0; ev(M, { type: 'graceRevive', id: m.id }); ev(M, { type: 'graceEnd' }); }
        return;
      }
      // 回避
      if (m.dodgeT > 0) {
        var sp = B.dodgeDist / B.dodgeTime;
        moveBy(M, m, m.dodgeV.x * sp * dt, m.dodgeV.y * sp * dt); m.dodgeT -= dt;
      }
      // 一閃
      if (m.dash) {
        var ds = m.dash, ox = m.x, oy = m.y;
        moveBy(M, m, ds.vx * dt, ds.vy * dt); ds.t -= dt;
        M.enemies.slice().forEach(function (e) {
          if (ds.hit[e.id]) return;
          if (segDist(ox, oy, m.x, m.y, e.x, e.y) <= D.ROLES.vanguard.special.width + e.r) {
            ds.hit[e.id] = 1;
            hurtEnemy(M, e, ds.dmg * (m.mods.atk > 1 ? 1.1 : 1), { by: m.id, kind: 'issen', x: ds.x0, y: ds.y0, aoe: true, dir: true, cid: ds.cid });
          }
        });
        if (ds.t <= 0) { m.dash = null; m.cd.atk = Math.min(m.cd.atk, 0.2); }
      }
      // 癒しの輪の集中
      if (m.cast) {
        m.cast.t -= dt;
        if (m.cast.t <= 0) {
          var c = m.cast; m.cast = null;
          allies(M, m, c.r).forEach(function (a) { healMember(M, a, c.heal, m); });
          // 結界の近くなら、結界も少し直る（救援だけのチームでも守りきれるように）
          var RS = D.ROLES.medic.special;
          if (dist(m, M.barrier) <= RS.mendRange && M.barrier.hp > 0 && M.barrier.hp < M.barrier.max) { var mend = Math.min(RS.mend, M.barrier.max - M.barrier.hp); M.barrier.hp += mend; m.stats.repaired += mend; ev(M, { type: 'repair', by: m.id, amt: mend, x: M.barrier.x, y: M.barrier.y }); }
          M.zones.push({ kind: 'ring', x: m.x, y: m.y, r: c.r, t: 0.6, life: 0.6 });
          ev(M, { type: 'cast', id: m.id, skill: 'ring', x: m.x, y: m.y });
        }
      }
      // 継続回復・自然回復
      if (m.regen.length) {
        m.regen = m.regen.filter(function (r) { var h = Math.min(r.left, r.rate * dt); r.left -= h; var by = member(M, r.by); var got = Math.min(h, m.maxHp - m.hp); m.hp += got; if (by) by.stats.healed += got; return r.left > 0.01; });
      }
      if (M.t - m.lastHit > B.regenDelay && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + B.regenRate * dt);
      // 採集（採集場所の輪の中に立つ）
      var g = null;
      for (var i = 0; i < M.gather.length; i++) if (M.gather[i].stock > 0 && dist(m, M.gather[i]) <= B.gatherRadius) { g = M.gather[i]; break; }
      if (g && !m.rescuing) {
        m.gatherT += dt;
        if (m.gatherT >= B.gatherInterval) { m.gatherT = 0; g.stock--; M.materials++; m.stats.gathered++; m.stats.actions++; ev(M, { type: 'gather', id: m.id, spot: g.id, x: m.x, y: m.y - 30 }); }
      } else m.gatherT = 0;
    });
  }

  /* ---------- 救助 ---------- */
  function updateRescue(M, dt) {
    M.members.forEach(function (m) { m.rescuing = null; });
    var downed = M.members.filter(function (m) { return m.down; }).concat(M.villagers.filter(function (v) { return v.state === 'down'; }));
    downed.forEach(function (d) {
      var best = null, bestRate = 0;
      M.members.forEach(function (r) {
        if (r.down || r === d || r.dash || r.dodgeT > 0 || r.rescuing) return;
        if (dist(r, d) > B.rescueRange + (d.r || 13)) return;
        var base = r.role === 'medic' ? D.ROLES.medic.rescueTime : B.rescueTime;
        var rate = 1 / (base * r.mods.rescue);
        if (rate > bestRate) { bestRate = rate; best = r; }
      });
      if (!best) { d.rescueP = Math.max(0, d.rescueP - dt * 0.25); return; }
      best.rescuing = d;
      var safe = !!(domeAt(M, d.x, d.y) || domeAt(M, best.x, best.y));
      if (best.rescuePause > 0 && !safe) return; // 被弾すると進行が止まる
      d.rescueP += dt * bestRate * (safe ? 1.5 : 1);
      if (d.rescueP >= 1) {
        best.stats.rescues++; best.stats.actions++; M.team.rescues++;
        if (d.side) { // 里人
          d.state = 'walk'; d.hp = d.maxHp * 0.6; d.rescueP = 0; best.stats.villagers++;
          ev(M, { type: 'villager', what: 'rescued', x: d.x, y: d.y, by: best.id });
        } else {
          if (M.t - d.downAt <= 10) best.stats.quickRescues++;
          revive(M, d, B.reviveRate, best);
        }
        if (safe) { best.stats.safeRescues++; combo(M, 'safe_rescue', d.x, d.y, best.id); }
        log(M, 'rescue_success', { by: best.id, who: d.id, safe: safe, villager: !!d.side });
      }
    });
  }

  /* ---------- 敵の更新（固定ロジック）---------- */
  function updateEnemies(M, dt) {
    M.enemies.slice().forEach(function (e) {
      if (e.hp <= 0) return;
      e.walkT += dt;
      if (e.hitFx > 0) e.hitFx -= dt;
      if (e.bound > 0) e.bound -= dt;
      if (e.stun > 0) e.stun -= dt;
      if (e.slow > 0) { e.slow -= dt; if (e.slow <= 0) e.slowMul = 1; }
      if (e.lure > 0) e.lure -= dt;
      if (e.mkT > 0) e.mkT -= dt;
      if (e.atkT > 0) e.atkT -= dt;
      if (e.castT > 0) e.castT -= dt;
      if (e.bossBind > 0) e.bossBind -= dt;
      if (e.burn > 0) { e.burn -= dt; hurtEnemy(M, e, e.burnDps * dt, { by: e.burnBy, kind: 'burn', quiet: true }); if (e.hp <= 0) return; }
      // ふき飛ばし中
      if (e.kv) {
        e.x = clamp(e.x + e.kv.x * dt, 20, MAP.w - 20); e.y = clamp(e.y + e.kv.y * dt, 20, MAP.h - 20);
        e.kv.t -= dt; if (e.kv.t <= 0) { e.kv = null; e.wp = nearestWp(e); }
        return;
      }
      if (e.dummy) return;
      if (e.bound > 0 || e.stun > 0) return;
      if (e.boss) { updateBoss(M, e, dt); return; }
      if (e.type === 'fuda') { updateCaster(M, e, dt); return; }
      updateMelee(M, e, dt);
    });
  }
  function nearestWp(e) {
    if (!e.path) return 0;
    var bi = e.wp, bd = 1e9;
    for (var i = 1; i < e.path.length; i++) { var d = Math.hypot(e.path[i].x - e.x, e.path[i].y - e.y); if (d < bd && i >= e.wp - 1) { bd = d; bi = i; } }
    return bi;
  }
  function speedOf(e) { return e.speed * (e.slow > 0 ? e.slowMul : 1); }
  // 道にそって進む（最後は結界へ）。戻り値：結界に着いたら true
  function followPath(M, e, dt) {
    var tgt;
    if (e.path && e.wp < e.path.length) {
      tgt = e.path[e.wp];
      if (Math.hypot(tgt.x - e.x, tgt.y - e.y) < 12) { e.wp++; if (e.wp < e.path.length) tgt = e.path[e.wp]; else tgt = M.barrier; }
    } else tgt = M.barrier;
    var reach = M.barrier.r + e.r + 12;
    if (tgt === M.barrier && dist(e, M.barrier) <= reach) return true;
    stepToward(M, e, tgt, dt);
    return false;
  }
  function stepToward(M, e, tgt, dt) {
    var d = norm(tgt.x - e.x, tgt.y - e.y); if (d.l < 1) return;
    var sp = speedOf(e) * dt;
    var nx = e.x + d.x * Math.min(sp, d.l), ny = e.y + d.y * Math.min(sp, d.l);
    // 壁・結界（ドーム）にぶつかる
    var blk = blocker(M, e, nx, ny);
    if (blk) { e.blocked = blk; return; }
    e.blocked = null;
    turnTo(e, d, dt);
    e.x = nx; e.y = ny;
  }
  function turnTo(e, d, dt) {
    if (e.type !== 'kasa') { e.face = { x: d.x, y: d.y }; return; }
    var a = Math.atan2(e.face.y, e.face.x), b = Math.atan2(d.y, d.x), df = angDiff(b, a), mx = D.ENEMY.kasa.turn * Math.PI / 180 * dt;
    a += clamp(df, -mx, mx);
    e.face = { x: Math.cos(a), y: Math.sin(a) };
  }
  function blocker(M, e, nx, ny) {
    for (var i = 0; i < M.zones.length; i++) {
      var z = M.zones[i];
      if (z.kind === 'wall' && z.t > 0 && segDist(z.x, z.y, z.x2, z.y2, nx, ny) < e.r + 9 && segDist(z.x, z.y, z.x2, z.y2, nx, ny) < segDist(z.x, z.y, z.x2, z.y2, e.x, e.y) + 0.01) return z;
      if (z.kind === 'dome' && z.t > 0) { var dn = Math.hypot(nx - z.x, ny - z.y), dc = Math.hypot(e.x - z.x, e.y - z.y); if (dn < z.r + e.r && dn < dc) return z; }
    }
    return null;
  }
  function hitZone(M, z, dmg) {
    z.hp -= dmg * M.diff.dmgMul;
    var ow = member(M, z.owner); if (ow) ow.stats.blocked += dmg * M.diff.dmgMul;
    if (z.hp <= 0) breakZone(M, z);
  }
  // 近くの標的（味方・里人・おとり地蔵）
  function pickTarget(M, e, aggro) {
    for (var i = 0; i < M.zones.length; i++) { var z = M.zones[i]; if (z.kind === 'decoy' && z.t > 0 && dist(z, e) <= z.r) return { kind: 'decoy', ref: z }; }
    var best = null, bd = aggro;
    M.members.forEach(function (m) { if (m.down) return; var d = dist(m, e); if (d < bd) { bd = d; best = { kind: 'member', ref: m }; } });
    M.villagers.forEach(function (v) { if (v.state !== 'walk') return; var d = dist(v, e); if (d < bd) { bd = d; best = { kind: 'villager', ref: v }; } });
    return best;
  }
  function validTarget(t) {
    if (!t) return false;
    if (t.kind === 'member') return !t.ref.down;
    if (t.kind === 'villager') return t.ref.state === 'walk';
    if (t.kind === 'decoy' || t.kind === 'zone') return t.ref.t > 0 && t.ref.hp > 0;
    if (t.kind === 'pillar') return !t.ref.broken;
    return false;
  }
  function updateMelee(M, e, dt) {
    var E = D.ENEMY[e.type];
    if (e.aggroT > 0) e.aggroT -= dt;
    if (!validTarget(e.target) || (e.target.kind !== 'decoy' && e.aggroT <= 0)) e.target = null;
    if (!e.target) { var t = pickTarget(M, e, E.aggro); if (t) { e.target = t; e.aggroT = 2.5; } }
    // 結界柱（柱の任務）
    if (!e.target && M.pillars.length) {
      M.pillars.forEach(function (p) {
        if (p.broken || e.target) return;
        if (dist(p, e) < 70) {
          if (e.pillarPick[p.id] == null) e.pillarPick[p.id] = e.type === 'kasa' || M.rnd() < 0.4;
          if (e.pillarPick[p.id]) e.target = { kind: 'pillar', ref: p };
        }
      });
    }
    if (e.blocked && e.blocked.t > 0 && e.blocked.hp > 0) {
      // 壁や結界にふさがれている：こわそうとする
      if (e.atkT <= 0) { e.atkT = E.rate; hitZone(M, e.blocked, E.dmg * 1.4); e.atkFx = 0.2; ev(M, { type: 'enemyHit', x: e.x, y: e.y, kind: e.type }); }
      if (M.rnd() < dt * 0.8) e.blocked = null; // 回りこみを試す
      else return;
    }
    if (e.target) {
      var tr = e.target.ref, reach = e.r + (tr.r || 14) + 10;
      if (dist(e, tr) <= reach) {
        turnTo(e, norm(tr.x - e.x, tr.y - e.y), dt);
        if (e.atkT <= 0) {
          e.atkT = E.rate; e.atkFx = 0.2;
          if (e.target.kind === 'member') hurtMember(M, tr, E.dmg, e);
          else if (e.target.kind === 'villager') hurtVillager(M, tr, E.dmg);
          else if (e.target.kind === 'decoy') hitZone(M, tr, E.dmg);
          else if (e.target.kind === 'pillar') hurtPillar(M, tr, E.dmg * 1.5);
          ev(M, { type: 'enemyHit', x: e.x, y: e.y, kind: e.type });
        }
      } else stepToward(M, e, tr, dt);
      return;
    }
    if (followPath(M, e, dt)) {
      turnTo(e, norm(M.barrier.x - e.x, M.barrier.y - e.y), dt);
      if (e.atkT <= 0) { e.atkT = E.rate; e.atkFx = 0.2; hurtBarrier(M, E.bdmg, e); ev(M, { type: 'enemyHit', x: e.x, y: e.y, kind: e.type, barrier: true }); }
    }
  }
  function updateCaster(M, e, dt) {
    var E = D.ENEMY.fuda;
    if (e.tele) { // 詠唱中（動かない）
      if (e.tele.t <= 0) e.tele = null;
      return;
    }
    // 標的：届く範囲の味方・里人 → 結界柱 → 結界
    var tgt = null, bd = E.range, kind = null;
    M.members.forEach(function (m) { if (m.down) return; var d = dist(m, e); if (d < bd) { bd = d; tgt = m; kind = 'member'; } });
    M.villagers.forEach(function (v) { if (v.state !== 'walk') return; var d = dist(v, e); if (d < bd) { bd = d; tgt = v; kind = 'villager'; } });
    if (!tgt) M.pillars.forEach(function (p) { if (!p.broken && !tgt && dist(p, e) < E.range) { tgt = p; kind = 'pillar'; } });
    if (!tgt && dist(e, M.barrier) < E.range + M.barrier.r) { tgt = M.barrier; kind = 'barrier'; }
    if (tgt) {
      turnTo(e, norm(tgt.x - e.x, tgt.y - e.y), dt);
      if (e.castT <= 0) {
        e.castT = E.rate;
        var z = { kind: 'tele', shape: 'circle', src: e.id, x: tgt.x, y: tgt.y, r: E.blast, t: E.windup, life: E.windup, dmg: E.dmg, bdmg: kind === 'barrier' ? E.bdmg : 0, pillar: kind === 'pillar' ? tgt : null, from: { x: e.x, y: e.y } };
        e.tele = z; M.zones.push(z);
        ev(M, { type: 'warn', x: tgt.x, y: tgt.y, from: e.id });
      }
      return;
    }
    followPath(M, e, dt);
  }
  function hurtVillager(M, v, dmg) {
    if (v.state !== 'walk') return;
    v.hp -= dmg * M.diff.dmgMul; v.hurtFx = 0.25;
    if (v.hp <= 0) { v.hp = 0; v.state = 'down'; v.downAt = M.t; v.rescueP = 0; ev(M, { type: 'villager', what: 'down', x: v.x, y: v.y }); }
  }
  function hurtPillar(M, p, dmg) {
    if (p.broken) return;
    p.hp -= dmg * M.diff.dmgMul; p.hitFx = 0.2;
    if (p.hp <= 0) {
      p.hp = 0; p.broken = true; M.pillarsBroken++;
      hurtBarrier(M, 120 / M.diff.dmgMul, null);
      ev(M, { type: 'pillar', what: 'broken', id: p.id, x: p.x, y: p.y });
    }
  }

  // 大だるま：予告つきの範囲攻撃（安全地帯がある）
  function updateBoss(M, e, dt) {
    var BA = D.BOSS_ATTACKS;
    if (e.roll) {
      var r = e.roll; r.t -= dt;
      var ox = e.x, oy = e.y;
      e.x = clamp(e.x + r.vx * dt, 40, MAP.w - 40); e.y = clamp(e.y + r.vy * dt, 40, MAP.h - 40);
      M.members.forEach(function (m) { if (!r.hit[m.id] && segDist(ox, oy, e.x, e.y, m.x, m.y) <= e.r + m.r + 6) { r.hit[m.id] = 1; hurtMember(M, m, BA.roll.dmg, e); } });
      if (dist(e, M.barrier) < M.barrier.r + e.r) { var k = norm(e.x - M.barrier.x, e.y - M.barrier.y); e.x = M.barrier.x + k.x * (M.barrier.r + e.r); e.y = M.barrier.y + k.y * (M.barrier.r + e.r); r.t = 0; }
      if (r.t <= 0) { e.roll = null; e.wp = nearestWp(e); }
      return;
    }
    if (e.tele) { if (e.tele.t <= 0) e.tele = null; return; } // 予告中は動かない
    e.bossT -= dt;
    if (e.bossT <= 0) {
      var order = ['slam', 'ring', 'roll', 'summon', 'slam', 'roll', 'ring', 'summon'];
      var kind = order[e.bossI % order.length]; e.bossI++;
      var near = nearestMember(M, e, 170), far = nearestMember(M, e, 430);
      if (kind === 'slam' && !near) kind = far ? 'roll' : 'ring';
      if (kind === 'roll' && !far) kind = 'ring';
      if (kind === 'summon' && M.enemies.filter(function (x) { return x.type === 'koro'; }).length >= 10) kind = 'ring';
      var small = e.type === 'chudaruma';
      var z = null;
      if (kind === 'slam') z = { kind: 'tele', shape: 'circle', src: 'boss', owner: e.id, x: e.x, y: e.y, r: BA.slam.r * (small ? 0.75 : 1), t: BA.slam.tele, life: BA.slam.tele, dmg: BA.slam.dmg * (small ? 0.6 : 1), atk: 'slam' };
      if (kind === 'ring') {
        var gaps = [], base = M.rnd() * Math.PI * 2;
        for (var gi = 0; gi < BA.ring.gaps; gi++) gaps.push(base + gi * Math.PI * 2 / BA.ring.gaps);
        z = { kind: 'tele', shape: 'ring', src: 'boss', owner: e.id, x: e.x, y: e.y, r0: BA.ring.r0, r: BA.ring.r1 * (small ? 0.7 : 1), gaps: gaps, gapW: BA.ring.gapDeg * Math.PI / 180, t: BA.ring.tele, life: BA.ring.tele, dmg: BA.ring.dmg * (small ? 0.6 : 1), atk: 'ring' };
      }
      if (kind === 'roll') {
        var d = norm(far.x - e.x, far.y - e.y), L = BA.roll.len;
        z = { kind: 'tele', shape: 'line', src: 'boss', owner: e.id, x: e.x, y: e.y, x2: e.x + d.x * L, y2: e.y + d.y * L, w: BA.roll.width, t: BA.roll.tele, life: BA.roll.tele, dmg: 0, atk: 'roll', dx: d.x, dy: d.y };
      }
      if (kind === 'summon') z = { kind: 'tele', shape: 'summon', src: 'boss', owner: e.id, x: e.x, y: e.y, r: 90, t: BA.summon.tele, life: BA.summon.tele, dmg: 0, atk: 'summon' };
      e.tele = z; M.zones.push(z);
      e.bossT = (M.difficulty === 'hard' ? 3.9 : M.difficulty === 'easy' ? 5.6 : 4.6) + z.t;
      ev(M, { type: 'bossWarn', atk: kind, x: e.x, y: e.y });
      return;
    }
    // 結界へ向かう・着いたら攻撃
    var reach = M.barrier.r + e.r + 20;
    if (dist(e, M.barrier) <= reach) {
      if (e.atkT <= 0) { e.atkT = D.ENEMY[e.type].rate; e.atkFx = 0.3; hurtBarrier(M, D.ENEMY[e.type].bdmg, e); ev(M, { type: 'enemyHit', x: e.x, y: e.y, kind: e.type, barrier: true }); }
      return;
    }
    followPath(M, e, dt);
  }
  function nearestMember(M, p, range) {
    var best = null, bd = range;
    M.members.forEach(function (m) { if (m.down) return; var d = dist(m, p); if (d < bd) { bd = d; best = m; } });
    return best;
  }

  /* ---------- 里人（護衛任務）---------- */
  function updateVillagers(M, dt) {
    M.villagers.forEach(function (v) {
      if (v.hurtFx > 0) v.hurtFx -= dt;
      if (v.state === 'down') {
        if (M.t - v.downAt > 20) { v.state = 'lost'; M.team.villagersLost++; ev(M, { type: 'villager', what: 'lost', x: v.x, y: v.y }); }
        return;
      }
      if (v.state !== 'walk') return;
      var tgt = v.wp < v.path.length ? v.path[v.wp] : M.barrier;
      var d = norm(tgt.x - v.x, tgt.y - v.y);
      if (tgt === M.barrier && d.l < M.barrier.r + 34) { v.state = 'saved'; M.team.villagersSaved++; ev(M, { type: 'villager', what: 'saved', x: v.x, y: v.y }); return; }
      if (d.l < 10 && tgt !== M.barrier) { v.wp++; return; }
      v.x += d.x * 46 * dt; v.y += d.y * 46 * dt; v.face = { x: d.x, y: d.y }; v.walkT += dt;
    });
  }

  /* ---------- 術の場（予告・結界・壁など）---------- */
  function updateZones(M, dt) {
    M.zones.forEach(function (z) {
      z.t -= dt;
      if (z.kind === 'blast' && z.t <= 0 && !z.done) {
        z.done = true; z.life = 0.4; z.t = 0.4; z.kind = 'boom';
        var src = { by: z.by, kind: z.src || 'fire', x: z.x, y: z.y, aoe: true, cid: z.cid };
        M.enemies.slice().forEach(function (e) { if (dist(e, z) <= z.r + e.r) hurtEnemy(M, e, z.dmg, src); });
      }
      if (z.kind === 'fireline' && z.t <= 0 && !z.done) {
        z.done = true; z.t = 0.45;
        var s2 = { by: z.by, kind: 'fire', x: z.x, y: z.y, aoe: true, cid: z.cid };
        M.enemies.slice().forEach(function (e) {
          if (segDist(z.x, z.y, z.x2, z.y2, e.x, e.y) <= z.w / 2 + e.r) { hurtEnemy(M, e, z.dmg, s2); if (e.hp > 0) { e.burn = z.burn; e.burnDps = z.burnDps; e.burnBy = z.by; } }
        });
      }
      if (z.kind === 'mist' && z.t > 0) {
        M.enemies.forEach(function (e) { if (dist(e, z) <= z.r + e.r) { e.slow = Math.max(e.slow, 0.3); e.slowMul = Math.min(e.boss ? 0.6 : z.slow, e.slowMul < 1 ? e.slowMul : 1); if (e.boss) e.slowMul = Math.max(e.slowMul, 0.6); } });
      }
      if (z.kind === 'ttrap' && z.t > 0) {
        if (z.arm > 0) z.arm -= dt;
        else if (M.enemies.some(function (e) { return dist(e, z) <= z.r + e.r; })) {
          var s3 = { by: z.by, kind: 'thunder', x: z.x, y: z.y, aoe: true, cid: z.cid };
          M.enemies.slice().forEach(function (e) { if (dist(e, z) <= z.r + e.r) { if (!e.boss) e.stun = Math.max(e.stun, z.stun); hurtEnemy(M, e, z.dmg, s3); } });
          M.zones.push({ kind: 'bolt', pts: [{ x: z.x, y: z.y - 120 }, { x: z.x, y: z.y }], t: 0.3, life: 0.3 });
          z.t = 0;
        }
      }
      if (z.kind === 'tele' && z.t <= 0 && !z.done) { z.done = true; resolveTele(M, z); }
    });
    M.zones = M.zones.filter(function (z) { return z.t > 0 || (z.kind === 'boom' && z.t > -0.01); });
  }
  function inTele(z, p) {
    var d = dist(p, z);
    if (z.shape === 'circle') return d <= z.r + (p.r || 0) * 0.5;
    if (z.shape === 'ring') {
      if (d < z.r0 || d > z.r) return false;
      var a = Math.atan2(p.y - z.y, p.x - z.x);
      for (var i = 0; i < z.gaps.length; i++) if (Math.abs(angDiff(a, z.gaps[i])) < z.gapW / 2) return false; // 安全地帯
      return true;
    }
    if (z.shape === 'line') return segDist(z.x, z.y, z.x2, z.y2, p.x, p.y) <= z.w / 2 + (p.r || 0) * 0.5;
    return false;
  }
  function resolveTele(M, z) {
    var boss = null;
    if (z.src === 'boss') boss = M.enemies.filter(function (e) { return e.id === z.owner; })[0];
    else { var caster = M.enemies.filter(function (e) { return e.id === z.src; })[0]; if (!caster) return; }
    if (z.atk === 'roll') { if (boss) { var BA = D.BOSS_ATTACKS.roll; boss.roll = { t: BA.time, vx: z.dx * BA.len / BA.time, vy: z.dy * BA.len / BA.time, hit: {} }; } ev(M, { type: 'bossAtk', atk: 'roll', x: z.x, y: z.y }); return; }
    if (z.atk === 'summon') {
      if (boss) for (var i = 0; i < D.BOSS_ATTACKS.summon.n; i++) { var a = i / D.BOSS_ATTACKS.summon.n * Math.PI * 2; var ne = spawnEnemy(M, 'koro', { x: boss.x + Math.cos(a) * 70, y: boss.y + Math.sin(a) * 70, path: boss.path ? boss.path.slice(Math.max(1, boss.wp)).map(function (p) { return p; }) : null }); ne.wp = 0; }
      ev(M, { type: 'bossAtk', atk: 'summon', x: z.x, y: z.y });
      return;
    }
    M.members.forEach(function (m) { if (inTele(z, m)) hurtMember(M, m, z.dmg, z.src === 'boss' ? { x: z.x, y: z.y } : z.from); });
    M.villagers.forEach(function (v) { if (v.state === 'walk' && inTele(z, v)) hurtVillager(M, v, z.dmg); });
    M.zones.forEach(function (w) { if ((w.kind === 'decoy' || w.kind === 'wall') && w.t > 0 && inTele(z, { x: w.cx || w.x, y: w.cy || w.y, r: 10 })) hitZone(M, w, z.dmg); });
    if (z.bdmg) hurtBarrier(M, z.bdmg, z.from);
    if (z.pillar) hurtPillar(M, z.pillar, z.dmg * 1.5);
    ev(M, { type: z.src === 'boss' ? 'bossAtk' : 'blast', atk: z.atk || 'fuda', x: z.x, y: z.y, r: z.r });
  }

  /* ---------- 罠 ---------- */
  function updateTraps(M, dt) {
    Object.keys(M.traps).forEach(function (id) {
      var tr = M.traps[id], T = D.TRAPS[tr.kind];
      if (tr.rearm > 0) tr.rearm -= dt;
      if (tr.kind === 'makibishi') {
        M.enemies.slice().forEach(function (e) {
          if (tr.uses <= 0 || e.mkT > 0 || dist(e, tr) > T.r + e.r) return;
          e.mkT = T.per;
          if (!e.boss) { e.slow = Math.max(e.slow, T.slowTime); e.slowMul = Math.min(e.slowMul, T.slow); }
          var lured = e.lure > 0, mul = lured ? comboMul(M, tr.owner) : 1;
          if (lured) combo(M, 'lure_trap', e.x, e.y, e.lureBy || tr.owner);
          hurtEnemy(M, e, T.dmg * tr.dmgMul * mul, { by: tr.owner, kind: 'trap', trap: true, x: tr.x, y: tr.y });
          tr.uses--; tr.fx = 0.3;
        });
        if (tr.uses <= 0) { delete M.traps[id]; ev(M, { type: 'trap', what: 'gone', spot: id, x: tr.x, y: tr.y }); }
      } else if (tr.kind === 'bakuchiku') {
        if (tr.rearm > 0 || tr.charges <= 0) return;
        var trig = M.enemies.some(function (e) { return dist(e, tr) <= T.r + e.r; });
        if (!trig) return;
        tr.charges--; tr.rearm = T.rearm; tr.fx = 0.4;
        var anyLure = false;
        M.enemies.slice().forEach(function (e) {
          if (dist(e, tr) > T.blast + e.r) return;
          var lured = e.lure > 0; if (lured) anyLure = e;
          hurtEnemy(M, e, T.dmg * tr.dmgMul * (lured ? comboMul(M, tr.owner) : 1), { by: tr.owner, kind: 'trap', trap: true, x: tr.x, y: tr.y });
        });
        if (anyLure) combo(M, 'lure_trap', tr.x, tr.y, anyLure.lureBy || tr.owner);
        ev(M, { type: 'trap', what: 'boom', spot: id, x: tr.x, y: tr.y, r: T.blast });
        if (tr.charges <= 0) { delete M.traps[id]; ev(M, { type: 'trap', what: 'gone', spot: id, x: tr.x, y: tr.y }); }
      }
    });
  }

  /* ---------- ぶつかり（押し合い）---------- */
  function separate(M) {
    var all = M.enemies, i, j;
    for (i = 0; i < all.length; i++) {
      var a = all[i];
      for (j = i + 1; j < all.length; j++) {
        var b = all[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.r + b.r) * 0.85;
        if (d < min && d > 0.01) { var push = (min - d) / 2, ux = dx / d, uy = dy / d; if (!a.boss) { a.x -= ux * push; a.y -= uy * push; } if (!b.boss) { b.x += ux * push; b.y += uy * push; } }
      }
      M.members.forEach(function (m) {
        if (m.down) return;
        var dx2 = m.x - a.x, dy2 = m.y - a.y, d2 = Math.hypot(dx2, dy2), mn = a.r + m.r;
        if (d2 < mn && d2 > 0.01) { var p2 = mn - d2, ux2 = dx2 / d2, uy2 = dy2 / d2; if (a.boss) { m.x += ux2 * p2; m.y += uy2 * p2; } else { m.x += ux2 * p2 * 0.6; m.y += uy2 * p2 * 0.6; a.x -= ux2 * p2 * 0.4; a.y -= uy2 * p2 * 0.4; } }
      });
      // 結界石
      var bd = dist(a, M.barrier), bl = M.barrier.r + a.r;
      if (bd < bl && bd > 0.01) { a.x = M.barrier.x + (a.x - M.barrier.x) / bd * bl; a.y = M.barrier.y + (a.y - M.barrier.y) / bd * bl; }
      // ドームの中へは入れない
      M.zones.forEach(function (z) {
        if (z.kind !== 'dome' || z.t <= 0) return;
        var dz = dist(a, z), lim = z.r + a.r * 0.6;
        if (dz < lim && dz > 0.01 && !a.boss) { a.x = z.x + (a.x - z.x) / dz * lim; a.y = z.y + (a.y - z.y) / dz * lim; }
      });
      a.x = clamp(a.x, 20, MAP.w - 20); a.y = clamp(a.y, 20, MAP.h - 20);
    }
    for (i = 0; i < M.members.length; i++) for (j = i + 1; j < M.members.length; j++) {
      var p = M.members[i], q = M.members[j], ddx = q.x - p.x, ddy = q.y - p.y, dd = Math.hypot(ddx, ddy), mm = p.r + q.r - 6;
      if (dd < mm && dd > 0.01 && !p.down && !q.down) { var pp = (mm - dd) / 2; p.x -= ddx / dd * pp; p.y -= ddy / dd * pp; q.x += ddx / dd * pp; q.y += ddy / dd * pp; }
    }
  }

  /* ---------- 強化（襲撃の合間に3つから1つ）---------- */
  var UP_IDS = Object.keys(D.UPGRADES);
  function makeOffers(M) {
    M.members.forEach(function (m) {
      var pool = UP_IDS.filter(function (u) { return m.ups.indexOf(u) < 0; });
      var out = [];
      while (out.length < 3 && pool.length) { var i = Math.floor(M.rnd() * pool.length); out.push(pool.splice(i, 1)[0]); }
      M.offers[m.id] = { list: out, picked: null };
    });
    ev(M, { type: 'offers' });
  }
  function pickUpgrade(M, m, i) {
    var of = M.offers[m.id];
    if (!of || of.picked != null || !(i >= 0 && i < of.list.length)) return false;
    if (!(M.state === 'Preparation' || M.state === 'Intermission')) return false;
    var u = of.list[i]; of.picked = u; m.ups.push(u);
    var md = m.mods;
    if (u === 'cd') md.cd *= 0.85;
    if (u === 'area') md.area *= 1.2;
    if (u === 'atk') md.atk *= 1.3;
    if (u === 'swift') { md.speed *= 1.1; md.dodgeCd -= 1; }
    if (u === 'tough') { m.maxHp += 25; m.hp += 25; }
    if (u === 'rescue') md.rescue *= 0.7;
    if (u === 'trap') { md.trapCost -= 1; md.trapDmg *= 1.25; }
    if (u === 'bind') md.bind *= 1.4;
    if (u === 'combo') md.combo = 2.5;
    if (u === 'special') md.special += 1;
    ev(M, { type: 'upgrade', id: m.id, up: u });
    return true;
  }
  function autoPick(M) {
    Object.keys(M.offers).forEach(function (id) { var of = M.offers[id], m = member(M, id); if (m && of && of.picked == null && of.list.length) pickUpgrade(M, m, 0); });
  }

  /* ---------- 節目の支援（師匠・依頼人が一度だけ）---------- */
  function triggerSupport(M, when) {
    if (M.support.used || M.tutorial && !M.script) return;
    var id = M.supportId, S = D.SUPPORTS[id];
    if (!S) return;
    M.support.used = true; M.support.at = when;
    if (id === 'mend') M.barrier.hp = Math.min(M.barrier.max, M.barrier.hp + 250);
    if (id === 'rain') M.members.forEach(function (m) { if (m.down) revive(M, m, 0.6, null); else healMember(M, m, 60, null); });
    if (id === 'bell') M.enemies.forEach(function (e) { bindEnemy(M, e, 3, null); });
    if (id === 'supply') M.materials += 12;
    if (id === 'lamp') M.lamp = 12;
    ev(M, { type: 'support', sup: id, mentor: M.mentor, client: M.client, when: when });
    log(M, 'support_event', { sup: id, when: when });
  }

  /* ---------- 切断と再接続（枠は60秒保持。戻らなければ NPC が引き継ぐ）---------- */
  function disconnect(M, id) {
    var m = member(M, id); if (!m || m.kind !== 'human' || !m.connected) return;
    m.connected = false; m.dcAt = M.t;
    ev(M, { type: 'disconnect', id: id }); log(M, 'disconnect', { id: id, t: Math.round(M.t) });
  }
  function rejoin(M, id) {
    var m = member(M, id); if (!m || m.connected || m.takeover) return false;
    m.connected = true; m.dcAt = null;
    ev(M, { type: 'rejoin', id: id }); log(M, 'rejoin', { id: id, t: Math.round(M.t) });
    return true;
  }

  function helpers() {
    return { dist: dist, norm: norm, segDist: segDist, clamp: clamp, angDiff: angDiff, nearestEnemy: nearestEnemy, bestCluster: bestCluster, bestLine: bestLine, nearestSpot: nearestSpot, domeAt: domeAt, inTele: inTele, member: member };
  }

  var api = {
    createMatch: createMatch, start: start, step: step, finalize: finalize, nextPhase: nextPhase,
    spawnEnemy: spawnEnemy, spawnVillager: spawnVillager, downMember: downMember, revive: revive, hurtMember: hurtMember, hurtEnemy: hurtEnemy,
    pickUpgrade: pickUpgrade, triggerSupport: triggerSupport, disconnect: disconnect, rejoin: rejoin, humansNow: humansNow,
    helpers: helpers, rng: rng, dist: dist, norm: norm, inTele: inTele, bestCluster: bestCluster
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_SIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
