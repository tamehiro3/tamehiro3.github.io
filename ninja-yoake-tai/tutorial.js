/* ニンジャ夜明け隊 — 最初の任務（§3 の「最初の10分」を短くしたもの）
 * 友だちやマッチングを待たずに、ひとりで最後まで終わる。
 *  移動・攻撃・回避 → 素材と罠 → 小さな襲撃（連携）→ 仲間を助ける・助けてもらう → 小ボス → 夜明け → 忍術えらび
 */
(function (root) {
  'use strict';
  var D = root.NYT_DATA || require('./data.js');
  var SIM = root.NYT_SIM || require('./sim.js');

  var PHASES = [{ id: 'tut', state: 'Preparation', name: 'はじめての夜番', dur: Infinity }];

  function steps(ui) {
    return [
      { id: 'move', text: '左側をなぞって歩こう<small>PC は WASD か矢印キー。光る輪まで行ってみよう</small>',
        setup: function (M, T) { T.marker = { x: 800, y: 470, r: 36 }; },
        done: function (M, T, me) { return Math.hypot(me.x - T.marker.x, me.y - T.marker.y) < T.marker.r; } },
      { id: 'attack', text: 'わら人形に近づくと、自動で攻撃します<small>3体とも、しずめよう</small>',
        setup: function (M, T) { T.marker = null; [[700, 400], [790, 360], [880, 400]].forEach(function (p) { SIM.spawnEnemy(M, 'dummy', { x: p[0], y: p[1] }); }); },
        done: function (M) { return !M.enemies.some(function (e) { return e.type === 'dummy'; }); } },
      { id: 'dodge', text: 'ふだ狸は、札を落とす前に「ピピッ」と鳴って赤い予告を出す<small>予告の外へ出るか「回避」でよけよう（2回）。よけたら近づいてしずめよう</small>',
        setup: function (M, T) { var e = SIM.spawnEnemy(M, 'fuda', { x: 640, y: 330 }); e.hp = e.maxHp = 45; e.speed = 0; T.fuda = e.id; T.dodged = 0; T.watch = {}; },
        tick: function (M, T, me) {
          M.zones.forEach(function (z) { if (z.kind === 'tele' && !T.watch[z.x + ',' + z.life]) { T.watch[z.x + ',' + z.life] = z; z.dmg = 6; } });
          Object.keys(T.watch).forEach(function (k) { var z = T.watch[k]; if (z && z.done && !z.counted) { z.counted = true; if (!SIM.inTele(z, me) || me.inv > 0) T.dodged++; } });
        },
        done: function (M, T) {
          var alive = M.enemies.some(function (e) { return e.type === 'fuda'; });
          if (!alive && T.dodged < 1) { var e = SIM.spawnEnemy(M, 'fuda', { x: 640, y: 330 }); e.speed = 0; return false; } // よける前にしずめたら、もう1体
          return !alive;
        },
        text2: function (T) { return T.dodged >= 2 ? 'よけられた！ ふだ狸に近づいて、しずめよう' : null; } },
      { id: 'gather', text: '竹林（左下）の輪の中に立って、素材を4つ集めよう<small>素材はチームで共有。罠・修理・補給に使う</small>',
        setup: function (M, T) { M.materials = 0; M.gather.forEach(function (g) { g.stock = 6; }); T.marker = { x: 250, y: 800, r: 60 }; },
        done: function (M) { return M.materials >= 4; } },
      { id: 'trap', text: '罠の置き場（点線の輪）で「まきびしを置く」を押そう<small>PC は F キー。敵が通ると遅くなる</small>',
        setup: function (M, T) { T.marker = { x: 600, y: 538, r: 30 }; },
        done: function (M) { return !!M.traps.w3; } },
      { id: 'raid', text: '小さな襲撃！ 西の道から、ころ玉が来る<small>水の檻で足止め → 炎の輪を当てると「連携」。黄色い「連」マークが合図</small>',
        setup: function (M, T) {
          T.marker = null; M.state = 'Wave';
          T.q = [0, 0.5, 1, 7, 7.5, 8].map(function (at) { return { at: at, lane: 'west' }; }); T.t = 0;
        },
        tick: function (M, T, me, dt) { T.t += dt; while (T.q.length && T.q[0].at <= T.t) { T.q.shift(); SIM.spawnEnemy(M, 'koro', { lane: 'west', hpMul: 0.8 }); } },
        done: function (M, T) { return !T.q.length && !M.enemies.length; } },
      { id: 'rescue', text: 'アオがダウンした！ アオのそばに3秒いて、助けよう<small>攻撃を受けると救助が止まる。結界の中なら止まらない</small>',
        setup: function (M, T) { M.state = 'Preparation'; var ao = M.members[1]; ao.x = 640; ao.y = 560; SIM.downMember(M, ao); ao.ai.plan = null; T.marker = null; },
        done: function (M) { return !M.members[1].down; } },
      { id: 'rescued', text: 'つまずいて目を回した！（ダウンの練習）<small>画面をタップ（PC はクリック）して「安全」ピンを立てよう。モモが助けに来る</small>',
        setup: function (M, T) { var me = M.members[0]; me.inv = 0; SIM.downMember(M, me); M.members[2].x = me.x + 220; M.members[2].y = me.y + 80; },
        done: function (M) { return !M.members[0].down; } },
      { id: 'boss', text: '中だるまが来た！<small>赤い予告の中の「安全」な所へ。夜明けまでに、みんなでしずめよう</small>',
        setup: function (M, T) { M.state = 'Boss'; var b = SIM.spawnEnemy(M, 'chudaruma', { lane: 'west' }); b.bossT = 5; M.bossSpawned = true; },
        done: function (M) { return !M.enemies.some(function (e) { return e.boss; }); } }
    ];
  }

  // sim に渡す台本
  function create(ui) {
    var T = { i: -1, list: steps(ui), marker: null, ui: ui, doneAt: 0 };
    var script = {
      onPhase: function () {},
      onTick: function (M, dt) {
        var me = M.members[0];
        // 仲間はプレイヤーについて来る（ずっと「集合」の合図）
        if (!M.pings.some(function (p) { return p.kind === 'gather'; })) M.pings.push({ kind: 'gather', by: me.id, x: me.x, y: me.y, until: M.t + 999, silent: true });
        M.pings.forEach(function (p) { if (p.kind === 'gather') { p.x = me.x; p.y = me.y; } });
        if (M.state === 'Result') return;
        if (T.i < 0) next(M);
        var st = T.list[T.i];
        if (!st) return;
        if (st.tick) st.tick(M, T, me, dt);
        if (st.text2) { var t2 = st.text2(T); if (t2 && !T.t2) { T.t2 = true; ui.tut(t2); } }
        if (T.wait > 0) { T.wait -= dt; if (T.wait <= 0) next(M); return; }
        if (st.done(M, T, me)) { T.wait = 0.9; ui.done(st.id); }
      }
    };
    function next(M) {
      T.i++; T.t2 = false;
      var st = T.list[T.i];
      if (!st) { ui.tut(null); SIM.finalize(M, 'win', 'dawn'); return; }
      st.setup(M, T);
      ui.tut(st.text);
      ui.step(st.id, T.i, T.list.length);
    }
    T.script = script;
    return T;
  }

  function config(opts) {
    var members = [
      { id: 'p1', kind: 'human', name: 'あなた', role: 'vanguard', jutsu: ['water', 'fire'], look: opts.look },
      { id: 'ao', kind: 'npc', name: 'アオ', role: 'guard', jutsu: ['stone', 'leaf'], look: D.BUDDIES[0].look },
      { id: 'momo', kind: 'npc', name: 'モモ', role: 'medic', jutsu: ['leaf', 'wind'], look: D.BUDDIES[1].look }
    ];
    return {
      session_id: opts.session_id, seed: opts.seed || 20260928, difficulty: 'easy', tutorial: true, phases: PHASES,
      mission: { mission_template_id: 'standard', enemy_set_id: 'basic', support_event_id: 'mend', objective_variant_id: 'none', briefing: null },
      mentor: opts.mentor, client: 'hayate', members: members
    };
  }

  var api = { create: create, config: config, PHASES: PHASES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NYT_TUTORIAL = api;
})(typeof window !== 'undefined' ? window : globalThis);
