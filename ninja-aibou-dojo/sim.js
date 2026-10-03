/* ニンジャ相棒道場 — 修行のシミュレーション（画面に依存しない。Node でもブラウザでも動く）
 *
 * 1回の修行＝判断場面3つ＋短い実戦（設計書 ③ §5）。道場は1つを配置替えして使う（同じ seed なら同じ配置）。
 * 見習い（プレイヤー）は移動・回避・直接指示。攻撃はからくりが近いと自動。近くで止まると救助（3秒）・調査。
 * 相棒は policy.js の判断（5候補のスコア）で動く。判断場面に入ったときの判断を LessonEvent として記録する
 * （policy_version と scenario_seed つき。同じ場面で前と違う行動をした理由を再現できる）。
 * 全滅しても相棒・装備・指導の機会は失わない（結果だけ返す）。
 *
 * 座標はマス単位。x は左→右（0〜11、両端は竹垣）、y は上（ゴール）→下（スタート）。
 */
(function (root) {
  'use strict';
  var D = root.NAD_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  var P = root.NAD_POLICY || (typeof require !== 'undefined' ? require('./policy.js') : null);
  var CH = root.NAD_CHARS || (typeof require !== 'undefined' ? require('./chars.js') : null);
  var LN = root.NAD_LINES || (typeof require !== 'undefined' ? (function () { try { return require('./lines.js'); } catch (e) { return {}; } })() : {});

  var FW = 12, ZH = 13, AH = 15, START = 5, END = 4;
  var ACT_ICON = { follow: '👣', attack: '👊', rescue: '🤝', search: '🔍', retreat: '🛡️', down: '💫' };
  var ACT_BUBBLE = { follow: 'ついていく', attack: '止める！', rescue: '助けに行く！', search: '調べてみる！', retreat: '下がる！', down: 'へとへと……' };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ================= 地形 ================= */
  function Grid(w, h) { this.w = w; this.h = h; this.block = new Uint8Array(w * h); this.danger = new Float32Array(w * h); this.hz = new Uint8Array(w * h); }
  Grid.prototype.i = function (x, y) { return y * this.w + x; };
  Grid.prototype.inside = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };
  Grid.prototype.blocked = function (x, y) { return !this.inside(x, y) || this.block[this.i(x, y)] > 0; };
  Grid.prototype.dangerAt = function (x, y) { return this.inside(x, y) ? this.danger[this.i(x, y)] : 0; };

  // A*（8方向）。costFn(x,y) → 追加コスト（Infinity で通れない）
  function astar(st, sx, sy, tx, ty, costFn, maxN) {
    var G = st.grid, w = G.w, h = G.h, N = w * h;
    sx = clamp(sx | 0, 0, w - 1); sy = clamp(sy | 0, 0, h - 1); tx = clamp(tx | 0, 0, w - 1); ty = clamp(ty | 0, 0, h - 1);
    var start = sy * w + sx, goal = ty * w + tx;
    if (start === goal) return { cells: [goal], len: 0, danger: 0 };
    var gs = st._g || (st._g = new Float64Array(N)), from = st._from || (st._from = new Int32Array(N)), closed = st._closed || (st._closed = new Uint8Array(N));
    gs.fill(Infinity); from.fill(-1); closed.fill(0);
    var open = [start]; gs[start] = 0;
    function hfn(i) { var x = i % w, y = (i / w) | 0, dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy); }
    var fs = {}; fs[start] = hfn(start);
    var n = 0;
    while (open.length) {
      var bi = 0; for (var k = 1; k < open.length; k++) if (fs[open[k]] < fs[open[bi]] || (fs[open[k]] === fs[open[bi]] && open[k] < open[bi])) bi = k;
      var cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++n > (maxN || 3000)) break;
      var cx = cur % w, cy = (cur / w) | 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (closed[ni]) continue;
        if (G.block[ni] && ni !== goal) continue;
        if (dx && dy && (G.block[cy * w + nx] || G.block[ny * w + cx])) continue; // 角をすりぬけない
        var extra = costFn ? costFn(nx, ny) : 0;
        if (extra === Infinity && ni !== goal) continue;
        if (extra === Infinity) extra = 50;
        var ng = gs[cur] + (dx && dy ? 1.4142 : 1) + extra;
        if (ng < gs[ni]) { gs[ni] = ng; from[ni] = cur; fs[ni] = ng + hfn(ni); if (open.indexOf(ni) < 0) open.push(ni); }
      }
    }
    if (from[goal] < 0) return null;
    var cells = [], c = goal, len = 0, dcount = 0;
    while (c !== start && c >= 0) { cells.push(c); var pc = from[c]; var d2 = (Math.abs((c % w) - (pc % w)) + Math.abs(((c / w) | 0) - ((pc / w) | 0))) === 2 ? 1.4142 : 1; len += d2; if (G.danger[c] > 0) dcount++; c = pc; }
    cells.reverse();
    return { cells: cells, len: len, danger: cells.length ? dcount / cells.length : 0, dangerCells: dcount };
  }

  /* ================= 組み立て ================= */
  var seqId = 0;
  function build(cfg) {
    cfg = cfg || {};
    var seed = (cfg.seed >>> 0) || 1;
    var R = P.rng(seed);
    var kind = cfg.kind || 'rescue';
    var zones = zoneList(cfg, R);
    var H = START + END;
    zones.forEach(function (z) { H += z.h; });
    var st = {
      seed: seed, R: R, cfg: cfg, kind: kind, t: 0, W: FW, H: H, grid: new Grid(FW, H), no: cfg.trainingNo || 1,
      zones: [], player: null, partner: null, allies: [], escort: null, enemies: [], spots: [], hazards: [], shots: [], fx: [],
      log: [], lessons: [], decisions: [], bubbles: [], signals: [], done: false, result: null, paused: false,
      policy: cfg.policy || P.makePolicy(), slot: cfg.slot || 'main', practice: !!cfg.practice, advanced: !!cfg.advanced,
      stageIdx: 0, stages: cfg.stages || null, watch: null, evSeq: 0, uid: 0, roster: [], masterId: cfg.masterId || 'hayate'
    };
    st.mods = { espd: st.practice ? 0.75 : 1, edmg: (st.practice ? 0.5 : 1) * (st.advanced ? 1.2 : 1), ehp: st.advanced ? 1.3 : 1, drain: st.practice ? 0.75 : (st.advanced ? 1.2 : 1) };
    // 役をしてくれる忍者（師匠以外の38体から、決まった順で）
    var ids = CH.CHARS.map(function (c) { return c.id; }).filter(function (id) { return id !== st.masterId && (cfg.exclude || []).indexOf(id) < 0; });
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp; }
    st.roster = (cfg.cast || []).concat(ids);
    // 竹垣（両端）と、スタート・ゴール
    var G = st.grid;
    for (var y = 0; y < H; y++) { G.block[G.i(0, y)] = 1; G.block[G.i(FW - 1, y)] = 1; }
    for (var x = 0; x < FW; x++) { G.block[G.i(x, 0)] = (x >= 5 && x <= 6) ? 0 : 1; }
    // ゾーンを下から積む
    var y1 = H - START;
    zones.forEach(function (z, zi) {
      var zone = { i: zi, scene: z.scene, name: D.SCENES[z.scene] ? D.SCENES[z.scene].name : z.scene, h: z.h, y1: y1, y0: y1 - z.h, arena: !!z.arena, stage: z.stage || 0, kind: z.kind || kind, open: false, cleared: false, entered: false, pEntered: false, decided: false, variant: z.variant, mirror: z.mirror, waves: [], triggers: [] };
      st.zones.push(zone);
      y1 = zone.y0;
    });
    st.zones.forEach(function (zone) { gateRow(st, zone); SCENE_FN[zone.scene](st, zone, R); });
    placeScrolls(st, R);
    // 見習いと相棒
    var sx = 5.5, sy = H - 2.2;
    st.player = { id: 'player', name: '見習い', x: sx - 0.7, y: sy, r: 0.34, hp: D.BAL.hp.player, max: D.BAL.hp.player, down: false, downT: 0, face: { x: 0, y: -1 }, dodge: 0, dodgeCd: 0, inv: 0, atkCd: 0, act: 'idle', actT: 0, prog: null, moving: false, lock: false, hurtT: 0 };
    st.partner = { id: 'partner', name: cfg.partnerName || '相棒', x: sx + 0.7, y: sy, r: 0.34, hp: D.BAL.hp.partner, max: D.BAL.hp.partner, down: false, downT: 0, face: { x: 0, y: -1 }, atkCd: 0, act: 'follow', actT: 0, prog: null, dec: null, decT: 0, path: null, pathKey: '', pathT: 0, cmd: null, goal: null, hurtT: 0, moving: false };
    if (kind === 'escort' || zones.some(function (z) { return z.escortStart; })) spawnEscort(st, zones);
    say(st, 'partner', ACT_BUBBLE.follow, 1.2);
    return st;
  }

  function zoneList(cfg, R) {
    var list = [];
    if (cfg.kind === 'exam') {
      (cfg.stages || []).forEach(function (sg, si) {
        sg.zones.forEach(function (sc) { list.push(zdef(sc, si, sg.kind, R)); });
      });
      // 護衛の段で護衛役が合流
      for (var i = 0; i < list.length; i++) if (list[i].kind === 'escort') { list[i].escortStart = true; break; }
      return list;
    }
    var zs = cfg.zones;
    if (!zs) {
      var tr = D.TRAININGS[cfg.kind];
      var pool = tr.pool.slice();
      for (var k = pool.length - 1; k > 0; k--) { var j = Math.floor(R() * (k + 1)); var tmp = pool[k]; pool[k] = pool[j]; pool[j] = tmp; }
      zs = pool.slice(0, 3).concat([tr.arena]);
      if (cfg.kind === 'escort') { zs = ['escort_side'].concat(pool.filter(function (p) { return p !== 'escort_side'; }).slice(0, 2)).concat([tr.arena]); }
    }
    var ti = 0;
    zs.forEach(function (sc) {
      var d = zdef(sc, 0, cfg.kind === 'tutorial' ? 'tutorial' : cfg.kind, R);
      if (cfg.kind === 'tutorial' && sc === 'chest_ally') { d.variant = ++ti; d.mirror = false; }
      list.push(d);
    });
    return list;
  }
  function zdef(scene, stage, kind, R) {
    var arena = scene === 'boss' || scene === 'wave' || scene === 'gate' || scene === 'final';
    return { scene: scene, h: arena ? AH : (scene === 'intro' ? 9 : ZH), arena: arena, stage: stage, kind: kind, mirror: R() < 0.5 };
  }
  function gateRow(st, zone) {
    var G = st.grid, y = zone.y0;
    if (y <= 0) return;
    for (var x = 1; x < FW - 1; x++) G.block[G.i(x, y)] = (x >= 4 && x <= 7) ? 2 : 1; // 2 = 閉じた門
    zone.gate = { x0: 4, x1: 7, y: y };
  }
  function openGate(st, zone) {
    if (!zone.gate || zone.open) return;
    zone.open = true;
    for (var x = zone.gate.x0; x <= zone.gate.x1; x++) st.grid.block[st.grid.i(x, zone.gate.y)] = 0;
    fx(st, 'gate', (zone.gate.x0 + zone.gate.x1 + 1) / 2, zone.gate.y + 0.5);
  }

  /* ---- 置く道具 ---- */
  function L2W(zone, cx, cy) { var x = zone.mirror ? (FW - 1 - cx) : cx; return { x: x + 0.5, y: zone.y0 + 1 + cy + 0.5 }; }
  function addAlly(st, zone, cx, cy, opt) {
    var p = L2W(zone, cx, cy), id = st.roster.shift() || 'anne', c = CH.BY_ID[id];
    var a = { id: 'a' + (++st.uid), charId: id, name: c ? c.name : id, x: p.x, y: p.y, r: 0.34, zone: zone.i, down: true, patience: 1, threat: false, state: 'down', savedBy: null, helpSaid: false, patienceAtSave: null, t: 0 };
    if (opt && opt.slow) a.slow = opt.slow;
    st.allies.push(a); return a;
  }
  function addSpot(st, zone, kind, cx, cy, content) {
    var p = L2W(zone, cx, cy);
    var s = { id: 's' + (++st.uid), kind: kind, x: p.x, y: p.y, zone: zone.i, opened: false, content: content || (kind === 'chest' ? 'tokens' : 'none'), openedBy: null, value: kind === 'chest' ? 40 : 30 };
    st.spots.push(s); return s;
  }
  function addEnemy(st, zone, kind, cx, cy, opt) {
    var p = L2W(zone, cx, cy), E = D.ENEMIES[kind];
    if (st.grid.blocked(p.x | 0, p.y | 0)) p = freeNear(st, p.x, p.y, zone);
    var hp = Math.round(E.hp * st.mods.ehp * (opt && opt.hpMul || 1));
    var e = { id: 'e' + (++st.uid), kind: kind, name: E.name, x: p.x, y: p.y, r: E.r, zone: zone.i, hp: hp, max: hp, active: !!(opt && opt.active), wake: opt && opt.wake != null ? opt.wake : 5.5, target: null, tT: 0, wind: 0, cool: 0.6 + st.R() * 0.6, slamT: E.slam ? E.slam.every * 0.7 : 0, tele: 0, called: false, strong: !!E.boss, boss: !!E.boss, dummy: !!(opt && opt.dummy), fixedTarget: opt && opt.target || null, path: null, pathT: 0, hurtT: 0, face: { x: 0, y: 1 }, spd: opt && opt.spd || 1 };
    st.enemies.push(e); return e;
  }
  function addHazard(st, zone, kind, cells) {
    var G = st.grid, lvl = kind === 'makibishi' ? 1 : 0.7, code = kind === 'makibishi' ? 1 : 2;
    var hz = { kind: kind, zone: zone.i, cells: [] };
    cells.forEach(function (c) { var p = L2W(zone, c[0], c[1]); var x = p.x | 0, y = p.y | 0; if (!G.inside(x, y) || G.block[G.i(x, y)]) return; G.danger[G.i(x, y)] = lvl; G.hz[G.i(x, y)] = code; hz.cells.push([x, y]); });
    st.hazards.push(hz); return hz;
  }
  function addCircleHazard(st, zone, kind, cx, cy, r) {
    var cells = [];
    for (var y = -Math.ceil(r); y <= Math.ceil(r); y++) for (var x = -Math.ceil(r); x <= Math.ceil(r); x++) if (x * x + y * y <= r * r + 0.3) cells.push([cx + x, cy + y]);
    var h = addHazard(st, zone, kind, cells); var p = L2W(zone, cx, cy); h.cx = p.x; h.cy = p.y; h.r = r; return h;
  }
  function addRock(st, zone, cx, cy, kind) {
    var p = L2W(zone, cx, cy), x = p.x | 0, y = p.y | 0, G = st.grid;
    if (!G.inside(x, y)) return;
    G.block[G.i(x, y)] = kind === 'bamboo' ? 4 : 3;
  }

  /* ================= 判断場面（配置替え） ================= */
  var SCENE_FN = {
    intro: function (st, z) {
      addEnemy(st, z, 'karakuri', 5, 2, { dummy: true, hpMul: 0.6, wake: 99 });
      addRock(st, z, 2, 4, 'bamboo'); addRock(st, z, 9, 5, 'rock');
      z.tutorialIntro = true;
    },
    chest_ally: function (st, z, R) {
      if (z.variant === 1) { // 最初の因果確認①：宝箱が近い
        z.stand = L2W(z, 5, 10);
        addSpot(st, z, 'chest', 10, 10, 'tokens');
        addAlly(st, z, 1, 5);
        z.watch = true;
        return;
      }
      if (z.variant === 2) { // 最初の因果確認②：配置を変えた似た課題（仲間が近い）
        z.stand = L2W(z, 5, 10);
        addAlly(st, z, 10, 9);
        addSpot(st, z, 'chest', 1, 5, 'tokens');
        z.watch = true;
        return;
      }
      var cy = 2 + Math.floor(R() * 4), ay = 3 + Math.floor(R() * 4);
      addSpot(st, z, 'chest', 2 + Math.floor(R() * 2), cy, 'tokens');
      if (z.kind !== 'escort') addAlly(st, z, 8 + Math.floor(R() * 2), ay);
      else addSpot(st, z, 'grass', 9, ay, 'none');
      addEnemy(st, z, 'karakuri', 5 + Math.floor(R() * 2), 0, { wake: 4.5 });
      addRock(st, z, 5, 6, 'rock'); addRock(st, z, 6, 6, 'bamboo');
    },
    makibishi: function (st, z, R) {
      var cells = [];
      for (var x = 1; x <= 8; x++) for (var y = 5; y <= 6; y++) cells.push([x, y]);
      addHazard(st, z, 'makibishi', cells);
      if (z.kind !== 'escort') addAlly(st, z, 2, 1 + Math.floor(R() * 2));
      else addSpot(st, z, 'grass', 2, 1, 'none');
      addSpot(st, z, 'chest', 8, 9, 'tokens');
      addSpot(st, z, 'grass', 9, 2, 'none');
      addRock(st, z, 4, 9, 'bamboo');
      if (st.advanced) addEnemy(st, z, 'karakuri', 6, 1, { wake: 4 });
    },
    chased: function (st, z, R) {
      var a = z.kind !== 'escort' ? addAlly(st, z, 8, 3) : null;
      addEnemy(st, z, 'karakuri', 2, 0, { active: false, wake: 7, target: a ? a.id : null, spd: 0.7 });
      addSpot(st, z, 'chest', 2, 9, 'tokens');
      addRock(st, z, 5, 6, 'rock');
    },
    two_allies: function (st, z, R) {
      addCircleHazard(st, z, 'smoke', 2, 3, 1.6);
      addAlly(st, z, 2, 3);
      addAlly(st, z, 9, 7);
      addEnemy(st, z, 'karakuri', 4, 1, { wake: 4.5 });
      addRock(st, z, 6, 4, 'bamboo');
    },
    smoke: function (st, z, R) {
      addCircleHazard(st, z, 'smoke', 7, 4, 2);
      addSpot(st, z, 'chest', 7, 4, 'tokens');
      if (z.kind === 'rescue' || z.kind === 'tutorial') addAlly(st, z, 3, 5);
      else addSpot(st, z, 'grass', 3, 5, 'none');
      addSpot(st, z, 'grass', 2, 10, 'none');
      if (st.advanced) addEnemy(st, z, 'archer', 5, 0, { wake: 6 });
    },
    guarded_grass: function (st, z, R) {
      addEnemy(st, z, 'karakuri', 4, 5, { wake: 4.5 });
      addEnemy(st, z, 'karakuri', 7, 4, { wake: 4.5 });
      addSpot(st, z, 'grass', 1, 8, 'none');
      addSpot(st, z, 'grass', 10, 2, 'none');
      addSpot(st, z, 'chest', 9, 9, 'tokens');
      if (z.kind === 'rescue') addAlly(st, z, 2, 2);
      addRock(st, z, 5, 8, 'rock');
    },
    crowd: function (st, z, R) {
      addEnemy(st, z, 'karakuri', 3, 2, { wake: 5.5 });
      addEnemy(st, z, 'karakuri', 6, 1, { wake: 5.5 });
      addEnemy(st, z, 'karakuri', 8, 3, { wake: 5.5 });
      addEnemy(st, z, 'archer', 5, 0, { wake: 6.5 });
      addSpot(st, z, 'chest', 1, 10, 'tokens');
      if (z.kind === 'rescue') addAlly(st, z, 10, 6);
      addRock(st, z, 4, 6, 'bamboo'); addRock(st, z, 7, 7, 'rock');
    },
    escort_side: function (st, z, R) {
      z.triggers.push({ when: 'escort', row: 8, spawn: [['karakuri', 1, 4], ['karakuri', 10, 6]] });
      addSpot(st, z, 'chest', 9, 10, 'tokens');
      addSpot(st, z, 'grass', 2, 2, 'none');
      addRock(st, z, 3, 7, 'bamboo'); addRock(st, z, 8, 3, 'rock');
    },
    // ---- 最後の場所 ----
    boss: function (st, z, R) {
      var mini = st.kind === 'tutorial';
      addEnemy(st, z, mini ? 'mini' : 'shosho', 5, 4, { wake: 6.5 });
      if (z.kind === 'rescue') addAlly(st, z, 1, 2);
      if (z.kind === 'explore') addSpot(st, z, 'grass', 10, 2, 'none');
      addRock(st, z, 2, 8, 'rock'); addRock(st, z, 9, 8, 'rock');
    },
    wave: function (st, z, R) {
      addEnemy(st, z, 'karakuri', 3, 3, { wake: 6.5 });
      addEnemy(st, z, 'karakuri', 8, 3, { wake: 6.5 });
      addEnemy(st, z, 'karakuri', 5, 2, { wake: 6.5 });
      addEnemy(st, z, 'archer', 6, 0, { wake: 7.5 });
      z.waves.push([['karakuri', 2, 0], ['karakuri', 5, 0], ['karakuri', 9, 0]]);
      if (z.kind === 'explore') { addSpot(st, z, 'grass', 1, 11, 'none'); addSpot(st, z, 'chest', 10, 11, 'tokens'); }
      if (z.kind === 'rescue') addAlly(st, z, 10, 11);
      addRock(st, z, 3, 8, 'bamboo'); addRock(st, z, 8, 8, 'bamboo');
    },
    gate: function (st, z, R) {
      z.triggers.push({ when: 'escort', row: 12, spawn: [['karakuri', 1, 6], ['karakuri', 10, 7]] });
      z.triggers.push({ when: 'escort', row: 8, spawn: [['karakuri', 1, 2], ['archer', 10, 1], ['karakuri', 9, 3]] });
      z.triggers.push({ when: 'escort', row: 4, spawn: [['karakuri', 2, 0], ['karakuri', 9, 0]] });
      addRock(st, z, 3, 9, 'rock'); addRock(st, z, 8, 5, 'bamboo');
    },
    final: function (st, z, R) {
      addEnemy(st, z, 'daikarakuri', 5, 4, { wake: 7 });
      addRock(st, z, 2, 9, 'rock'); addRock(st, z, 9, 9, 'rock');
      z.escortWait = true;
    }
  };
  // 探索修行：巻物をかくす（草むらを優先。足りなければ宝箱）
  function placeScrolls(st, R) {
    var need = 0;
    if (st.kind === 'explore') need = D.TRAININGS.explore.scrolls;
    if (st.kind === 'exam') need = 2;
    if (!need) return;
    var pool = st.spots.filter(function (s) { return (st.kind !== 'exam' || st.zones[s.zone].kind === 'explore'); });
    var grass = pool.filter(function (s) { return s.kind === 'grass'; }), chests = pool.filter(function (s) { return s.kind === 'chest'; });
    function shuf(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    var pick = shuf(grass).concat(shuf(chests)).slice(0, need);
    pick.forEach(function (s) { s.content = 'scroll'; });
    st.scrollTotal = pick.length;
    st.scrollNeed = st.kind === 'exam' ? pick.length : Math.min(D.TRAININGS.explore.need, pick.length);
  }
  function spawnEscort(st, zones) {
    var idx = 0;
    for (var i = 0; i < st.zones.length; i++) if (st.zones[i].kind === 'escort') { idx = i; break; }
    var z = st.zones[idx];
    var id = st.cfg.escortId || st.roster.shift() || 'yui', c = CH.BY_ID[id];
    var y = idx === 0 ? st.H - 2.6 : z.y1 - 0.6;
    st.escort = { id: 'esc', charId: id, name: c ? c.name : id, x: 5.5, y: y, r: 0.34, relief: 100, state: idx === 0 ? 'walk' : 'hidden', zone: idx, path: null, pathT: 0, scaredT: 0, t: 0, speed: 1.15, face: { x: 0, y: -1 }, moving: false, said: false };
  }

  /* ================= 出来事・吹き出し・効果 ================= */
  function logEv(st, type, who, name, extra) {
    var e = { id: 'T' + st.no + '-E' + (++st.evSeq), t: Math.round(st.t * 10) / 10, type: type, who: who, name: name || '', zone: extra && extra.zone != null ? extra.zone : zoneIdx(st, st.player.y) };
    if (extra) for (var k in extra) if (k !== 'zone') e[k] = extra[k];
    st.log.push(e);
    return e;
  }
  function say(st, who, text, dur) {
    st.bubbles = st.bubbles.filter(function (b) { return b.who !== who; });
    st.bubbles.push({ who: who, text: text, t: st.t, until: st.t + (dur || 2.2) });
  }
  function fx(st, kind, x, y, extra) { var f = { kind: kind, x: x, y: y, t: st.t, id: ++st.uid }; if (extra) for (var k in extra) f[k] = extra[k]; st.fx.push(f); if (st.fx.length > 80) st.fx.shift(); }
  function signal(st, s) { st.signals.push(s); }
  function zoneIdx(st, y) { for (var i = 0; i < st.zones.length; i++) { var z = st.zones[i]; if (y >= z.y0 && y < z.y1) return i; } return y >= (st.zones.length ? st.zones[0].y1 : st.H) ? -1 : st.zones.length; }
  function line(charId, key, fallback) { var l = LN && LN[charId]; var t = l && l[key]; return t ? String(t) : fallback; }
  function fillName(st, t) { return String(t).replace(/\{p\}/g, st.partner ? st.partner.name : '相棒'); }

  /* ================= 移動（壁との当たり） ================= */
  function passable(st, x, y, r, who) {
    var G = st.grid;
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
      if (!G.inside(xx, yy)) return false;
      if (!G.block[G.i(xx, yy)]) continue;
      // 円と四角
      var nx = clamp(x, xx, xx + 1), ny = clamp(y, yy, yy + 1);
      if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return false;
    }
    return true;
  }
  function moveBy(st, o, dx, dy) {
    if (!dx && !dy) return;
    var nx = o.x + dx, ny = o.y + dy;
    if (passable(st, nx, o.y, o.r)) o.x = nx;
    if (passable(st, o.x, ny, o.r)) o.y = ny;
  }
  function speedMul(st, o) {
    var G = st.grid, x = o.x | 0, y = o.y | 0;
    if (!G.inside(x, y)) return 1;
    var hz = G.hz[G.i(x, y)];
    return hz === 1 ? D.HAZARDS.makibishi.slow : (hz === 2 ? D.HAZARDS.smoke.slow : 1);
  }
  // 経路にそって進む
  function follow(st, o, path, spd, dt) {
    if (!path || !path.cells.length) return false;
    var G = st.grid, c = path.cells[0], tx = (c % G.w) + 0.5, ty = ((c / G.w) | 0) + 0.5;
    var dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
    if (d < 0.12) { path.cells.shift(); return follow(st, o, path, spd, dt); }
    var step = Math.min(d, spd * dt);
    var bx = o.x, by = o.y;
    moveBy(st, o, dx / d * step, dy / d * step);
    if (Math.abs(o.x - bx) + Math.abs(o.y - by) < 1e-4) { path.cells.shift(); }
    o.face = { x: dx / d, y: dy / d };
    return true;
  }
  function separate(st, dt) {
    var list = [st.player, st.partner].concat(st.enemies.filter(function (e) { return e.hp > 0; })).concat(st.escort && st.escort.state !== 'hidden' && st.escort.state !== 'arrived' ? [st.escort] : []);
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j];
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r - 0.05;
      if (d > 0 && d < m) {
        var push = (m - d) * 0.5;
        var ux = dx / d, uy = dy / d;
        if (!a.down) moveBy(st, a, -ux * push, -uy * push);
        if (!b.down) moveBy(st, b, ux * push, uy * push);
      }
    }
  }

  /* ================= 相棒の判断のための状況 ================= */
  function costFor(st, pol) {
    var C = pol.axes.caution / 100, safety = pol.rules.indexOf('safety_first') >= 0, G = st.grid;
    return function (x, y) {
      var d = G.danger[G.i(x, y)];
      if (d <= 0) return 0;
      if (safety) return Infinity;
      return d * (0.5 + 4 * C);
    };
  }
  function buildCtx(st) {
    var pa = st.partner, pl = st.player, pol = st.policy, G = st.grid;
    var zi = zoneIdx(st, pa.y), zpl = zoneIdx(st, pl.y);
    function near(o) { var z = zoneIdx(st, o.y); return z === zi || z === zpl || Math.abs(o.y - pa.y) < 9; }
    var cost = costFor(st, pol);
    var cache = {};
    var ctx = {
      t: st.t, kind: st.kind === 'exam' ? (st.zones[Math.max(0, Math.min(st.zones.length - 1, zi))] || {}).kind || 'exam' : st.kind,
      me: { x: pa.x, y: pa.y, hp: pa.hp, down: pa.down },
      player: { id: 'player', x: pl.x, y: pl.y, hp: pl.hp, down: pl.down },
      allies: st.allies.filter(function (a) { return a.state === 'down' && near(a); }).map(function (a) { return { id: a.id, name: a.name, x: a.x, y: a.y, down: true, patience: a.patience, threat: a.threat }; }),
      escort: st.escort && (st.escort.state === 'walk' || st.escort.state === 'wait' || st.escort.state === 'scared') ? { id: st.escort.id, name: st.escort.name, x: st.escort.x, y: st.escort.y, threat: st.escort.threat } : null,
      enemies: st.enemies.filter(function (e) { return e.hp > 0 && (e.active || dist(e, pa) < 6) && !e.dummyDone && near(e); }).map(function (e) { return { id: e.id, kind: e.kind, name: e.name, x: e.x, y: e.y, hp: e.hp, target: e.target, strong: e.strong }; }),
      spots: st.spots.filter(function (s) { return !s.opened && near(s); }).map(function (s) { return { id: s.id, kind: s.kind, x: s.x, y: s.y, value: s.value, opened: false }; }),
      dangerHere: G.dangerAt(pa.x | 0, pa.y | 0),
      inTelegraph: st.enemies.some(function (e) { return e.tele > 0 && dist(e, pa) < D.ENEMIES[e.kind].slam.r + 0.3; }),
      command: pa.cmd && pa.cmd.until > st.t ? pa.cmd.kind : null,
      path: function (x, y) {
        var k = (x | 0) + ',' + (y | 0);
        if (cache[k]) return cache[k];
        var r = astar(st, pa.x | 0, pa.y | 0, x | 0, y | 0, cost);
        var targetDanger = G.dangerAt(x | 0, y | 0) > 0;
        var res = r ? { dist: r.len, danger: Math.min(1, r.danger + (targetDanger ? 0.5 : 0)), blocked: false, dangerCells: r.dangerCells } : { dist: 99, danger: 1, blocked: true };
        cache[k] = res; return res;
      }
    };
    return ctx;
  }

  /* ================= 相棒 ================= */
  function partnerThink(st, sceneZone) {
    var pa = st.partner;
    var ctx = buildCtx(st);
    var d = P.decide(ctx, st.policy, pa.dec);
    var changed = !pa.dec || pa.dec.act !== d.act || pa.dec.target !== d.target;
    pa.dec = d; pa.decT = 0.4; pa.goal = null;
    if (changed) {
      pa.path = null; pa.prog = null;
      if (d.act !== 'follow' || (pa.lastBubble !== 'follow')) say(st, 'partner', ACT_ICON[d.act] + ' ' + ACT_BUBBLE[d.act], 1.6);
      pa.lastBubble = d.act;
      st.decisions.push({ t: Math.round(st.t * 10) / 10, act: d.act, target: d.target, targetName: d.targetName, score: d.score, v: st.policy.version, forced: d.forced || null, zone: zoneIdx(st, pa.y) });
      if (st.decisions.length > 300) st.decisions.shift();
    }
    // 判断場面に入った最初の判断を記録（LessonEvent）
    if (sceneZone != null) {
      var z = st.zones[sceneZone];
      z.decided = true;
      var cands = d.cands.slice(0, 5).map(function (c) { return { act: c.act, target: c.target, targetName: c.targetName, score: c.score, parts: c.parts }; });
      var lesson = {
        id: 'L' + st.no + '-' + (st.lessons.length + 1), trainingNo: st.no, zone: sceneZone, scene: z.scene, sceneName: z.name, t: Math.round(st.t * 10) / 10,
        seed: st.seed, policyVersion: st.policy.version, slot: st.slot, axes: P.copy(st.policy.axes), rules: st.policy.rules.slice(),
        chosen: { act: d.act, target: d.target, targetName: d.targetName, score: d.score }, cands: cands, excluded: d.excluded, reason: d.reason, forced: d.forced || null,
        sceneDecision: true, kind: z.kind, outcome: {}, feedback: null, snap: snapshotZone(st, z)
      };
      st.lessons.push(lesson);
      signal(st, { type: 'decision', lesson: lesson });
    }
    return d;
  }
  // 振り返りの小さな図のための配置（判断した瞬間）
  function snapshotZone(st, z) {
    var r1 = function (n) { return Math.round(n * 10) / 10; };
    var items = [];
    st.allies.forEach(function (a) { if (a.zone === z.i && a.state === 'down') items.push({ k: 'ally', id: a.id, x: r1(a.x), y: r1(a.y - z.y0) }); });
    st.spots.forEach(function (s) { if (s.zone === z.i && !s.opened) items.push({ k: s.kind, id: s.id, x: r1(s.x), y: r1(s.y - z.y0) }); });
    st.enemies.forEach(function (e) { if (e.zone === z.i && e.hp > 0 && !e.dummy) items.push({ k: e.boss ? 'boss' : 'enemy', id: e.id, x: r1(e.x), y: r1(e.y - z.y0) }); });
    var haz = [];
    st.hazards.forEach(function (h) { if (h.zone === z.i) h.cells.forEach(function (c) { haz.push([c[0], c[1] - z.y0]); }); });
    var blocks = [];
    for (var y = z.y0; y < z.y1; y++) for (var x = 1; x < FW - 1; x++) { var b = st.grid.block[st.grid.i(x, y)]; if (b === 3 || b === 4) blocks.push([x, y - z.y0]); }
    return { h: z.h, me: { x: r1(st.partner.x), y: r1(st.partner.y - z.y0) }, pl: { x: r1(st.player.x), y: r1(st.player.y - z.y0) }, items: items, haz: haz, blocks: blocks };
  }
  function partnerUpdate(st, dt) {
    var pa = st.partner, pl = st.player;
    if (pa.down) { pa.downT += dt; pa.act = 'down'; return; }
    if (pa.hurtT > 0) pa.hurtT -= dt;
    pa.atkCd -= dt;
    // 判断場面に入った？
    var zi = zoneIdx(st, pa.y), sceneZone = null;
    if (zi >= 0 && zi < st.zones.length) {
      var z = st.zones[zi];
      if (!z.pEntered) z.pEntered = true;
      // 判断場面：ふつうの場所は入ったとき。最後の場所は、からくりが動き出したとき
      if (!z.decided && !z.watch && interesting(st, z) && (!z.arena || st.enemies.some(function (e) { return e.zone === z.i && e.hp > 0 && e.active; }))) sceneZone = zi;
    }
    // 見守り（最初の因果確認）：決まった位置に立ってから判断する
    if (st.watch && st.watch.phase === 'gather') {
      var sp = st.watch.stand;
      var dd = Math.hypot(sp.x - pa.x, sp.y - pa.y);
      if (dd > 0.15) {
        var pth = astar(st, pa.x | 0, pa.y | 0, sp.x | 0, sp.y | 0, null);
        if (pth) { follow(st, pa, pth, 3.2, dt); pa.act = 'walk'; }
        if (Math.hypot(sp.x - pa.x, sp.y - pa.y) > 0.15 && st.t - st.watch.t0 < 6) return;
      }
      pa.x = sp.x; pa.y = sp.y;
      st.watch.phase = 'act';
      partnerThink(st, st.watch.zone);
      st.watch.first = { act: pa.dec.act, target: pa.dec.target };
      return;
    }
    pa.decT -= dt;
    var need = sceneZone != null || !pa.dec || pa.decT <= 0 || (pa.cmd && pa.cmd.fresh);
    if (pa.cmd && pa.cmd.fresh) pa.cmd.fresh = false;
    if (need) partnerThink(st, sceneZone);
    execute(st, dt);
  }
  function interesting(st, z) {
    return st.allies.some(function (a) { return a.zone === z.i && a.state === 'down'; }) || st.spots.some(function (s) { return s.zone === z.i && !s.opened; }) || st.enemies.some(function (e) { return e.zone === z.i && e.hp > 0 && !e.dummy; });
  }
  function execute(st, dt) {
    var pa = st.partner, d = pa.dec, pl = st.player;
    if (!d) return;
    var spd = 3.2 * speedMul(st, pa);
    if (d.act === 'rescue' && d.target === 'player') spd *= 1.35; // へとへとの見習いのもとへは急ぐ
    pa.moving = false;
    function go(tx, ty, near) {
      var dd = Math.hypot(tx - pa.x, ty - pa.y);
      if (dd <= near) return true;
      var key = (tx | 0) + ',' + (ty | 0);
      pa.pathT -= dt;
      if (!pa.path || pa.pathKey !== key || pa.pathT <= 0 || !pa.path.cells.length) {
        pa.path = astar(st, pa.x | 0, pa.y | 0, tx | 0, ty | 0, costFor(st, st.policy)); pa.pathKey = key; pa.pathT = 0.5;
      }
      if (pa.path && pa.path.cells.length > 1) { follow(st, pa, pa.path, spd, dt); pa.moving = true; }
      else {
        // 最後の1マスはまっすぐ
        var ux = (tx - pa.x) / dd, uy = (ty - pa.y) / dd;
        moveBy(st, pa, ux * Math.min(dd, spd * dt), uy * Math.min(dd, spd * dt)); pa.face = { x: ux, y: uy }; pa.moving = true;
      }
      return Math.hypot(tx - pa.x, ty - pa.y) <= near;
    }
    switch (d.act) {
      case 'follow': {
        var ft = d.target === 'player' ? pl : (st.escort && d.target === st.escort.id ? st.escort : pl);
        var close = pa.cmd && pa.cmd.kind === 'gather' ? 1.1 : 1.7;
        if (Math.hypot(ft.x - pa.x, ft.y - pa.y) > close) go(ft.x, ft.y + 0.6, close);
        pa.act = pa.moving ? 'walk' : 'idle';
        break;
      }
      case 'attack': {
        var e = byId(st.enemies, d.target);
        if (!e || e.hp <= 0) { pa.decT = 0; break; }
        var reach = D.ENEMIES[e.kind].r + 0.75;
        if (go(e.x, e.y, reach)) {
          pa.face = norm(e.x - pa.x, e.y - pa.y);
          if (pa.atkCd <= 0) { hit(st, e, 9, 'partner'); pa.atkCd = 0.7; pa.act = 'attack'; pa.actT = 0.25; fx(st, 'slash', e.x, e.y, { from: 'partner' }); }
        } else pa.act = 'walk';
        if (pa.actT > 0) { pa.actT -= dt; pa.act = 'attack'; }
        break;
      }
      case 'rescue': {
        var tgt = d.target === 'player' ? pl : byId(st.allies, d.target);
        if (!tgt || !tgt.down) { pa.decT = 0; pa.prog = null; break; }
        if (go(tgt.x, tgt.y, 0.95)) {
          pa.act = 'rescue'; pa.face = norm(tgt.x - pa.x, tgt.y - pa.y);
          pa.prog = pa.prog && pa.prog.target === d.target ? pa.prog : { kind: 'rescue', target: d.target, t: 0, need: D.BAL.rescueSec };
          pa.prog.t += dt;
          if (pa.prog.t >= pa.prog.need) { if (tgt === pl) revive(st, pl, 'partner'); else rescueAlly(st, tgt, 'partner'); pa.prog = null; pa.decT = 0; }
        } else { pa.act = 'walk'; pa.prog = null; }
        break;
      }
      case 'search': {
        var s = byId(st.spots, d.target);
        if (!s || s.opened) { pa.decT = 0; pa.prog = null; break; }
        if (go(s.x, s.y, 0.85)) {
          pa.act = 'search'; pa.face = norm(s.x - pa.x, s.y - pa.y);
          pa.prog = pa.prog && pa.prog.target === d.target ? pa.prog : { kind: 'search', target: d.target, t: 0, need: D.BAL.searchSec };
          pa.prog.t += dt;
          if (pa.prog.t >= pa.prog.need) { openSpot(st, s, 'partner'); pa.prog = null; pa.decT = 0; }
        } else { pa.act = 'walk'; pa.prog = null; }
        break;
      }
      case 'retreat': {
        if (!pa.goal) pa.goal = safeSpot(st, pa);
        if (go(pa.goal.x, pa.goal.y, 0.3)) { pa.act = 'idle'; if (pa.cmd && pa.cmd.kind === 'back') pa.hp = Math.min(pa.max, pa.hp + 4 * dt); }
        else pa.act = 'retreat';
        break;
      }
    }
  }
  // その場所の中で、いちばん近い空いたマス
  function freeNear(st, x, y, zone) {
    var G = st.grid, best = null, bd = 1e9;
    var y0 = zone ? zone.y0 + 1 : 1, y1 = zone ? zone.y1 - 1 : st.H - 1;
    for (var yy = y0; yy <= y1; yy++) for (var xx = 1; xx < FW - 1; xx++) {
      if (G.block[G.i(xx, yy)]) continue;
      var d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
      if (d < bd) { bd = d; best = { x: xx + 0.5, y: yy + 0.5 }; }
    }
    return best || { x: x, y: y };
  }
  function norm(x, y) { var d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  // 下がる先：危なくなく、からくりから遠く、見習いに近いマス
  function safeSpot(st, o) {
    var G = st.grid, best = null, bs = -1e9, pl = st.player;
    for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
      var x = (o.x | 0) + dx, y = (o.y | 0) + dy;
      if (!G.inside(x, y) || G.block[G.i(x, y)]) continue;
      var c = { x: x + 0.5, y: y + 0.5 };
      var s = -G.danger[G.i(x, y)] * 20;
      st.enemies.forEach(function (e) { if (e.hp > 0 && e.active) { var d = dist(e, c); s += Math.min(d, 6) * 1.6; } if (e.tele > 0 && dist(e, c) < D.ENEMIES[e.kind].slam.r + 0.6) s -= 30; });
      if (!pl.down) s -= Math.abs(dist(pl, c) - 1.8) * 0.8;
      s -= Math.hypot(dx, dy) * 0.3;
      if (s > bs) { bs = s; best = c; }
    }
    return best || { x: o.x, y: o.y };
  }

  /* ================= 見習い ================= */
  function playerUpdate(st, dt, inp) {
    var pl = st.player;
    if (pl.hurtT > 0) pl.hurtT -= dt;
    if (pl.inv > 0) pl.inv -= dt;
    pl.dodgeCd -= dt; pl.atkCd -= dt;
    if (pl.down) { pl.downT += dt; pl.act = 'down'; return; }
    var locked = st.watch && st.watch.phase !== 'done';
    var mx = locked ? 0 : (inp.mx || 0), my = locked ? 0 : (inp.my || 0);
    var m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; m = 1; }
    pl.moving = m > 0.15;
    if (pl.dodge > 0) {
      pl.dodge -= dt;
      moveBy(st, pl, pl.face.x * 9 * dt, pl.face.y * 9 * dt);
    } else if (pl.moving) {
      var spd = 3.4 * speedMul(st, pl) * Math.min(1, m * 1.2);
      moveBy(st, pl, mx * spd * dt, my * spd * dt);
      pl.face = { x: mx / m, y: my / m };
    }
    if (inp.dodge && !locked && pl.dodgeCd <= 0) { pl.dodge = 0.24; pl.inv = 0.36; pl.dodgeCd = 0.9; if (!pl.moving && inp.fx != null) pl.face = norm(inp.fx, inp.fy); fx(st, 'dash', pl.x, pl.y); }
    // 自動の通常攻撃
    var tgt = null, bd = 1e9;
    st.enemies.forEach(function (e) { if (e.hp <= 0) return; var d = dist(e, pl) - D.ENEMIES[e.kind].r; if (d < 0.95 && d < bd) { bd = d; tgt = e; } });
    if (tgt && pl.atkCd <= 0 && pl.dodge <= 0) {
      hit(st, tgt, 10, 'player'); pl.atkCd = 0.55; pl.act = 'attack'; pl.actT = 0.22; pl.face = norm(tgt.x - pl.x, tgt.y - pl.y); fx(st, 'slash', tgt.x, tgt.y, { from: 'player' });
      if (tgt.dummy && !st.flags_dummyHit) { st.flags_dummyHit = true; signal(st, { type: 'tip', id: 'autoAttack' }); }
    }
    if (pl.actT > 0) { pl.actT -= dt; pl.act = 'attack'; }
    else pl.act = pl.moving ? 'walk' : 'idle';
    // 近くで止まると：救助（3秒）・調査
    var pr = null;
    if (st.partner.down && dist(st.partner, pl) < 1.15) pr = { kind: 'revive', target: 'partner', need: D.BAL.rescueSec };
    if (!pr) st.allies.forEach(function (a) { if (!pr && a.state === 'down' && dist(a, pl) < 1.1) pr = { kind: 'rescue', target: a.id, need: D.BAL.rescueSec }; });
    if (!pr) st.spots.forEach(function (s) { if (!pr && !s.opened && dist(s, pl) < 0.95) pr = { kind: 'search', target: s.id, need: D.BAL.searchSec }; });
    if (locked) pr = null;
    if (pr) {
      if (!pl.prog || pl.prog.target !== pr.target) pl.prog = { kind: pr.kind, target: pr.target, t: 0, need: pr.need };
      pl.prog.t += dt;
      if (!tgt) pl.act = pr.kind === 'search' ? 'search' : 'rescue';
      if (pl.prog.t >= pl.prog.need) {
        if (pr.kind === 'revive') revive(st, st.partner, 'player');
        else if (pr.kind === 'rescue') rescueAlly(st, byId(st.allies, pr.target), 'player');
        else openSpot(st, byId(st.spots, pr.target), 'player');
        pl.prog = null;
      }
    } else pl.prog = null;
  }

  /* ================= できごと ================= */
  function damage(st, o, amt, src) {
    if (o.down) return;
    if (o === st.player && (o.inv > 0)) { fx(st, 'miss', o.x, o.y); return; }
    amt = Math.round(amt * st.mods.edmg);
    o.hp = Math.max(0, o.hp - amt); o.hurtT = 0.3;
    if (o === st.player) o.inv = 0.45;
    fx(st, 'dmg', o.x, o.y, { n: amt, who: o.id });
    if (o.hp <= 0) {
      o.down = true; o.downT = 0; o.prog = null;
      logEv(st, 'down', o.id, o.name);
      if (o === st.partner) { st.stats.partnerDowns++; say(st, 'partner', '💫 へとへと……', 2.5); markOutcome(st, 'partnerDown'); signal(st, { type: 'tip', id: 'partnerDown' }); }
      else { st.stats.playerDowns++; signal(st, { type: 'tip', id: 'playerDown' }); }
    }
  }
  function markOutcome(st, key) {
    var zi = zoneIdx(st, st.partner.y);
    st.lessons.forEach(function (l) { if (l.zone === zi) l.outcome[key] = true; });
  }
  function revive(st, o, by) {
    o.down = false; o.hp = D.BAL.revealHp; o.downT = 0;
    logEv(st, 'revive', by, o === st.player ? '見習い' : o.name);
    fx(st, 'revive', o.x, o.y);
    if (o === st.partner) say(st, 'partner', '🙌 たすかった！', 2);
    else say(st, 'partner', '🙌 だいじょうぶ？', 2);
  }
  function rescueAlly(st, a, by) {
    if (!a || a.state !== 'down') return;
    a.state = 'up'; a.down = false; a.savedBy = by; a.patienceAtSave = a.patience; a.t = 0;
    logEv(st, 'rescue', by, a.name, { zone: a.zone, charId: a.charId });
    fx(st, 'revive', a.x, a.y);
    say(st, a.id, fillName(st, line(a.charId, 'saved', 'ありがとう！ 助かったよ！')), 2.6);
    st.lessons.forEach(function (l) { if (l.zone === a.zone) l.outcome.savedBy = l.outcome.savedBy || by; });
  }
  function openSpot(st, s, by) {
    if (!s || s.opened) return;
    s.opened = true; s.openedBy = by;
    if (s.content === 'scroll') { st.scrolls++; logEv(st, 'scroll', by, '巻物', { zone: s.zone }); fx(st, 'scroll', s.x, s.y); }
    else if (s.kind === 'chest') { st.chestTokens += 5; logEv(st, 'chest', by, '宝箱', { zone: s.zone }); fx(st, 'coin', s.x, s.y); }
    else { logEv(st, 'empty', by, '草むら', { zone: s.zone }); fx(st, 'leaf', s.x, s.y); }
    st.lessons.forEach(function (l) { if (l.zone === s.zone && s.kind === 'chest') l.outcome.chestBy = l.outcome.chestBy || by; });
  }
  function hit(st, e, amt, who) {
    if (e.hp <= 0) return;
    e.hp -= amt; e.hurtT = 0.2;
    if (!e.dummy) e.active = true;
    if (e.hp <= 0) {
      e.hp = 0;
      fx(st, 'pop', e.x, e.y, { big: e.boss });
      if (e.boss) logEv(st, 'boss', who, e.name, { zone: e.zone });
      else logEv(st, 'stop', who, e.name, { zone: e.zone });
      st.stats.stops++;
      if (e.dummy) e.dummyDone = true;
    }
  }

  /* ================= からくり ================= */
  function enemyUpdate(st, dt) {
    var pl = st.player, pa = st.partner;
    st.enemies.forEach(function (e) {
      if (e.hp <= 0) return;
      var E = D.ENEMIES[e.kind];
      if (e.hurtT > 0) e.hurtT -= dt;
      if (e.dummy) return;
      if (!e.active) {
        if ((dist(e, pl) < e.wake && !pl.down) || (dist(e, pa) < e.wake && !pa.down) || (e.fixedTarget && (dist(e, pl) < 9 || dist(e, pa) < 9)) || (st.escort && st.escort.state !== 'hidden' && dist(e, st.escort) < e.wake)) { e.active = true; fx(st, 'wake', e.x, e.y); }
        else return;
      }
      // ねらう相手（0.5秒ごと）
      e.tT -= dt;
      if (e.tT <= 0) {
        e.tT = 0.5;
        var best = null, bs = 1e9;
        function cand(o, id, bias) { if (!o || o.down && id !== 'ally') return; var d = dist(e, o) + bias; if (d < bs) { bs = d; best = id === 'ally' ? o.id : id; } }
        if (e.fixedTarget) { var ft = byId(st.allies, e.fixedTarget); if (ft && ft.state === 'down') { best = ft.id; bs = 0; } }
        if (!best) {
          cand(pl, 'player', 0); cand(pa, 'partner', 0.3);
          if (st.escort && (st.escort.state === 'walk' || st.escort.state === 'wait' || st.escort.state === 'scared')) cand(st.escort, 'esc', 0.3);
          st.allies.forEach(function (a) { if (a.state === 'down' && a.zone === e.zone) { var d = dist(e, a) + 2; if (d < bs) { bs = d; best = a.id; } } });
        }
        e.target = best;
      }
      var tg = targetEnt(st, e.target);
      if (!tg) return;
      if (e.tele > 0) { // 大技のため
        e.tele -= dt;
        if (e.tele <= 0) {
          var R2 = E.slam.r;
          [pl, pa].forEach(function (o) { if (!o.down && dist(o, e) < R2) damage(st, o, E.slam.dmg, e.id); });
          if (st.escort && dist(st.escort, e) < R2 && st.escort.state !== 'arrived') st.escort.relief = Math.max(0, st.escort.relief - 15);
          fx(st, 'slam', e.x, e.y, { r: R2 });
        }
        return;
      }
      if (E.slam) {
        e.slamT -= dt;
        if (e.slamT <= 0 && (dist(e, pl) < 4 || dist(e, pa) < 4)) { e.slamT = E.slam.every; e.tele = E.slam.tele; fx(st, 'tele', e.x, e.y, { r: E.slam.r, dur: E.slam.tele }); return; }
        if (!e.called && E.calls && e.hp < e.max * 0.5) {
          e.called = true;
          for (var c = 0; c < E.calls; c++) { var ne = addEnemy(st, st.zones[e.zone], 'karakuri', 0, 0, { active: true }); var fc = freeNear(st, e.x + (c % 2 ? 1.8 : -1.8), e.y + (c > 1 ? 1.5 : -0.5), st.zones[e.zone]); ne.x = fc.x; ne.y = fc.y; fx(st, 'wake', ne.x, ne.y); }
          say(st, 'boss', 'ガシャン！ からくりを呼んだ！', 2);
        }
      }
      var d = dist(e, tg);
      if (e.wind > 0) {
        e.wind -= dt;
        if (e.wind <= 0) {
          if (E.ranged) { var u = norm(tg.x - e.x, tg.y - e.y); st.shots.push({ x: e.x, y: e.y, vx: u.x * 4.6, vy: u.y * 4.6, life: 1.6, dmg: E.dmg, from: e.id }); }
          else if (d < E.reach + tg.r + 0.35) strike(st, e, tg, E.dmg);
          e.cool = E.cool;
        }
        return;
      }
      e.cool -= dt;
      var reach = E.ranged ? E.reach : E.reach + tg.r;
      if (d < reach && e.cool <= 0) { e.wind = E.windup; e.face = norm(tg.x - e.x, tg.y - e.y); fx(st, 'windup', e.x, e.y, { dur: E.windup, from: e.id }); return; }
      // 近づく（弓は間をとる）
      var spd = E.speed * st.mods.espd * (e.spd || 1);
      if (E.ranged && d < E.keep) { var u2 = norm(e.x - tg.x, e.y - tg.y); moveBy(st, e, u2.x * spd * dt, u2.y * spd * dt); return; }
      if (d > (E.ranged ? E.keep + 0.4 : reach - 0.15)) {
        e.pathT -= dt;
        if (!e.path || e.pathT <= 0) { e.path = astar(st, e.x | 0, e.y | 0, tg.x | 0, tg.y | 0, null, 1500); e.pathT = 0.6; }
        if (e.path && e.path.cells.length > 1) follow(st, e, e.path, spd, dt);
        else { var u3 = norm(tg.x - e.x, tg.y - e.y); moveBy(st, e, u3.x * spd * dt, u3.y * spd * dt); e.face = u3; }
      }
    });
    // 弓の玉
    st.shots = st.shots.filter(function (s) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0 || st.grid.blocked(s.x | 0, s.y | 0)) { fx(st, 'puff', s.x, s.y); return false; }
      var hitO = null;
      [st.player, st.partner].forEach(function (o) { if (!hitO && !o.down && dist(o, s) < o.r + 0.18) hitO = o; });
      if (!hitO && st.escort && st.escort.state !== 'hidden' && st.escort.state !== 'arrived' && dist(st.escort, s) < 0.5) { st.escort.relief = Math.max(0, st.escort.relief - 6); fx(st, 'puff', s.x, s.y); return false; }
      if (hitO) { damage(st, hitO, s.dmg, s.from); fx(st, 'puff', s.x, s.y); return false; }
      return true;
    });
  }
  function targetEnt(st, id) {
    if (!id) return null;
    if (id === 'player') return st.player.down ? null : st.player;
    if (id === 'partner') return st.partner.down ? null : st.partner;
    if (id === 'esc') return st.escort && st.escort.state !== 'arrived' && st.escort.state !== 'hidden' ? st.escort : null;
    var a = byId(st.allies, id); return a && a.state === 'down' ? a : null;
  }
  function strike(st, e, tg, dmg) {
    if (tg === st.player || tg === st.partner) damage(st, tg, dmg, e.id);
    else if (tg === st.escort) { st.escort.relief = Math.max(0, st.escort.relief - 8); fx(st, 'scare', tg.x, tg.y); say(st, 'esc', line(st.escort.charId, 'scared', 'わわっ！'), 1.4); }
    else if (tg.patience != null) { tg.patience = Math.max(0, tg.patience - 0.12); fx(st, 'scare', tg.x, tg.y); }
    fx(st, 'bonk', tg.x, tg.y);
  }

  /* ================= 仲間（要救助役）と護衛役 ================= */
  function alliesUpdate(st, dt) {
    var pl = st.player, pa = st.partner;
    st.allies.forEach(function (a) {
      if (a.state === 'down') {
        var zActive = zoneIdx(st, pl.y) === a.zone || zoneIdx(st, pa.y) === a.zone || (st.zones[a.zone] && st.zones[a.zone].entered);
        a.threat = st.enemies.some(function (e) { return e.hp > 0 && e.active && dist(e, a) < 3; });
        if (!zActive) return;
        if (!a.helpSaid && (dist(a, pl) < 6 || dist(a, pa) < 6)) { a.helpSaid = true; say(st, a.id, fillName(st, line(a.charId, 'help', '助けて〜！')), 2.6); }
        var drain = (1 / 55) * st.mods.drain * (a.threat ? 2 : 1);
        a.patience = Math.max(0, a.patience - drain * dt);
        if (a.patience <= 0) {
          a.state = 'gaveup'; a.t = 0;
          logEv(st, 'gaveup', 'ally', a.name, { zone: a.zone });
          say(st, a.id, 'もう、自分で帰るね〜', 2.2);
          st.lessons.forEach(function (l) { if (l.zone === a.zone) l.outcome.gaveUp = true; });
        }
      } else if (a.state === 'up' || a.state === 'gaveup') {
        a.t += dt;
        if (a.t > 1.2) { a.state = 'leaving'; }
      } else if (a.state === 'leaving') {
        a.t += dt; a.y += 2.2 * dt; a.leaveA = Math.min(1, (a.t - 1.2) / 1.2);
        if (a.t > 2.6) a.state = 'gone';
      }
    });
    var es = st.escort;
    if (!es) return;
    if (es.state === 'hidden') {
      var z = st.zones[es.zone];
      if (zoneIdx(st, pl.y) === es.zone || pl.y < z.y1 - 0.2) { es.state = 'walk'; es.x = 5.5; es.y = z.y1 - 0.6; say(st, 'esc', fillName(st, line(es.charId, 'escort', '門まで、守ってくれる？')), 3); fx(st, 'revive', es.x, es.y); }
      return;
    }
    if (es.state === 'arrived' || es.state === 'turned') return;
    if (!es.said) { es.said = true; say(st, 'esc', fillName(st, line(es.charId, 'escort', '門まで、守ってくれる？')), 3); }
    es.threat = st.enemies.some(function (e) { return e.hp > 0 && e.active && dist(e, es) < 2.6; });
    var guard = Math.min(dist(es, pl.down ? { x: 99, y: 99 } : pl), dist(es, pa.down ? { x: 99, y: 99 } : pa));
    es.moving = false;
    if (es.threat) {
      es.state = 'scared'; es.scaredT += dt; if (es.scaredT > 2.5) { es.scaredT = 0; say(st, 'esc', line(es.charId, 'scared', 'こわい〜！'), 1.4); }
      // からくりから離れて、近くの見習い・相棒のほうへ逃げる
      var ne = null, nd = 1e9;
      st.enemies.forEach(function (e) { if (e.hp > 0 && e.active) { var d = dist(e, es); if (d < nd) { nd = d; ne = e; } } });
      var gd = [pl, pa].filter(function (o) { return !o.down; }).sort(function (a, b) { return dist(a, es) - dist(b, es); })[0];
      if (ne) {
        var ux = es.x - ne.x, uy = es.y - ne.y;
        if (gd && dist(gd, es) > 1.2) { ux += (gd.x - es.x) * 0.8; uy += (gd.y - es.y) * 0.8; }
        var un = Math.hypot(ux, uy) || 1;
        moveBy(st, es, ux / un * 1.3 * dt, uy / un * 1.3 * dt); es.face = { x: -ux / un, y: -uy / un }; es.moving = true;
      }
    }
    else if (guard > 5) { es.state = 'wait'; }
    else es.state = 'walk';
    // ひとりのときは歩かずに待つ（待っているだけでは安心は減らない。減るのはからくりに当たったとき）
    // 見習いか相棒がそばにいて、からくりがいなければ、安心が少しずつ戻る
    if (!es.threat && guard < 3) es.relief = Math.min(100, es.relief + 1.5 * dt);
    // 前にある閉じた門の手前で待つ（大からくりがいる場所は、入口で待つ）
    var stopY = 1.2;
    for (var zk = 0; zk < st.zones.length; zk++) {
      var zz = st.zones[zk];
      // まだからくりが残っている場所には入らず、入口で待つ（待ちぶせのからくりは別）
      if (es.y > zz.y1 - 1 && st.enemies.some(function (e) { return e.zone === zz.i && e.hp > 0 && !e.ambush && !e.dummy; })) { stopY = zz.y1 + 0.6; break; }
      if (zz.escortWait && es.y > zz.y0 && st.enemies.some(function (e) { return e.zone === zz.i && e.hp > 0 && e.boss; })) { stopY = zz.y1 - 1.2; break; }
      if (zz.gate && !zz.open && es.y > zz.gate.y) { stopY = zz.gate.y + 1.6; break; }
    }
    es.stopY = stopY; es.blocked = es.y <= stopY + 0.4;
    if (es.state === 'walk' && es.y > stopY) {
      es.pathT -= dt;
      if (!es.path || es.pathT <= 0) { es.path = astar(st, es.x | 0, es.y | 0, 5, Math.max(1, Math.ceil(stopY - 1)), function (x, y) { return st.grid.danger[st.grid.i(x, y)] > 0 ? 8 : 0; }); es.pathT = 0.8; }
      if (es.path) { follow(st, es, es.path, es.speed * speedMul(st, es), dt); es.moving = true; }
    }
    // 護衛の段の出てくるからくり
    st.zones.forEach(function (z2) {
      z2.triggers.forEach(function (tr) {
        if (tr.done || tr.when !== 'escort') return;
        if (es.y < z2.y0 + 1 + tr.row + 0.5 && zoneIdx(st, es.y) === z2.i) {
          tr.done = true;
          tr.spawn.forEach(function (sp) { var ne = addEnemy(st, z2, sp[0], sp[1], sp[2], { active: true }); ne.ambush = true; fx(st, 'wake', ne.x, ne.y); });
        }
      });
    });
    if (es.relief <= 0) {
      es.state = 'turned'; logEv(st, 'turned', 'escort', es.name);
      say(st, 'esc', 'ごめん、いったん道場にもどるね……', 2.6);
    }
    if (es.y <= 2.0) {
      es.state = 'arrived'; logEv(st, 'arrive', 'escort', es.name);
      say(st, 'esc', fillName(st, line(es.charId, 'arrive', '着いた！ ありがとう！')), 3);
      fx(st, 'revive', es.x, es.y);
    }
  }

  /* ================= ゾーン（門・見守り・波） ================= */
  function zonesUpdate(st, dt) {
    var pl = st.player;
    var zi = zoneIdx(st, pl.y);
    st.zones.forEach(function (z) {
      if (!z.entered && (zi === z.i || zoneIdx(st, st.partner.y) === z.i)) {
        z.entered = true;
        logEv(st, 'zone', 'player', z.name, { zone: z.i });
        signal(st, { type: 'zone', zone: z.i, name: z.name, scene: z.scene, stage: z.stage });
        // 試験：段がかわるときに作戦を切りかえる
        if (st.kind === 'exam' && z.stage !== st.stageIdx) { st.stageIdx = z.stage; signal(st, { type: 'stage', stage: z.stage, kind: z.kind }); }
        // 最初の因果確認：見守りタイム
        if (z.watch) {
          st.watch = { zone: z.i, phase: 'gather', stand: z.stand, t0: st.t };
          st.partner.cmd = null; st.partner.dec = null; st.partner.prog = null;
          pl.x = z.stand.x - 0.9; pl.y = z.stand.y + 0.9; pl.prog = null;
          signal(st, { type: 'watch', zone: z.i });
        }
      }
      // 波
      if (z.waves.length && !st.enemies.some(function (e) { return e.zone === z.i && e.hp > 0; }) && z.entered) {
        var w = z.waves.shift();
        w.forEach(function (sp) { var ne = addEnemy(st, z, sp[0], sp[1], sp[2], { active: true }); fx(st, 'wake', ne.x, ne.y); });
        signal(st, { type: 'wave' });
      }
      // 門：この場所の仲間と、からくりが片づいたら開く
      if (!z.cleared && z.entered) {
        var alliesLeft = st.allies.some(function (a) { return a.zone === z.i && a.state === 'down'; });
        var enemiesLeft = st.enemies.some(function (e) { return e.zone === z.i && e.hp > 0; }) || z.waves.length > 0;
        var trig = z.triggers.some(function (tr) { return !tr.done; });
        var watchOk = !(st.watch && st.watch.zone === z.i && st.watch.phase !== 'done');
        var introOk = !z.tutorialIntro || st.usedCmd || st.cfg.skipIntroCmd;
        if (!alliesLeft && !enemiesLeft && !trig && watchOk && introOk) {
          z.cleared = true; openGate(st, z);
          logEv(st, 'clear', 'team', z.name, { zone: z.i });
          [st.player, st.partner].forEach(function (o) { if (!o.down) o.hp = Math.min(o.max, o.hp + 15); });
          signal(st, { type: 'clear', zone: z.i, name: z.name, tutorialReview: st.kind === 'tutorial' && z.variant === 1 });
        }
      }
    });
    // 見守りの終わり：相棒の最初の行動が終わったら
    if (st.watch && st.watch.phase === 'act') {
      var pa = st.partner, f = st.watch.first, doneFirst = false;
      if (f.act === 'search') { var s = byId(st.spots, f.target); doneFirst = !s || s.opened; }
      else if (f.act === 'rescue') { var a = byId(st.allies, f.target); doneFirst = !a || a.state !== 'down'; }
      else doneFirst = st.t - st.watch.t0 > 4;
      if (doneFirst || st.t - st.watch.t0 > 14) { st.watch.phase = 'done'; signal(st, { type: 'watchEnd', zone: st.watch.zone }); }
    }
  }

  /* ================= 1ステップ ================= */
  function step(st, dt, inp) {
    if (st.done || st.paused) return;
    inp = inp || {};
    st.t += dt;
    if (inp.cmd) command(st, inp.cmd);
    playerUpdate(st, dt, inp);
    partnerUpdate(st, dt);
    enemyUpdate(st, dt);
    alliesUpdate(st, dt);
    separate(st, dt);
    zonesUpdate(st, dt);
    // 危ない床
    [st.player, st.partner].forEach(function (o) {
      if (o.down) return;
      var G = st.grid, c = G.i(o.x | 0, o.y | 0), hz = G.hz[c];
      if (hz) {
        o.hzT = (o.hzT || 0) + dt;
        var dps = hz === 1 ? D.HAZARDS.makibishi.dps : D.HAZARDS.smoke.dps;
        o.hzAcc = (o.hzAcc || 0) + dps * dt;
        if (o.hzAcc >= 3) { var n = Math.floor(o.hzAcc); o.hzAcc -= n; o.hp = Math.max(0, o.hp - n); fx(st, 'dmg', o.x, o.y, { n: n, who: o.id, hz: true }); if (o.hp <= 0) { o.hp = 1; damage(st, o, 99, 'hazard'); } }
        if (o === st.partner && !st.flags_hz) { st.flags_hz = true; markOutcome(st, 'hazard'); }
      }
    });
    st.bubbles = st.bubbles.filter(function (b) { return b.until > st.t; });
    // 終わり
    checkEnd(st);
  }
  function command(st, kind) {
    var pa = st.partner;
    if (!{ gather: 1, help: 1, back: 1 }[kind]) return;
    if (st.watch && st.watch.phase !== 'done') return;
    pa.cmd = { kind: kind, until: st.t + (kind === 'help' ? 6 : 4), fresh: true };
    st.usedCmd = true;
    logEv(st, 'command', 'player', kind);
    fx(st, 'cmd', pa.x, pa.y, { cmd: kind });
  }

  function objective(st) {
    var k = st.kind;
    var o = { kind: k, text: '', done: false, n: 0, need: 0 };
    if (k === 'rescue' || k === 'tutorial') {
      var all = st.allies.length, saved = st.allies.filter(function (a) { return a.savedBy; }).length;
      o.n = saved; o.need = all; o.text = '助け起こした仲間 ' + saved + '/' + all;
      if (k === 'tutorial') { var boss = st.enemies.filter(function (e) { return e.boss; })[0]; o.done = saved === all && boss && boss.hp <= 0; }
      else o.done = saved === all;
    } else if (k === 'explore') {
      o.n = st.scrolls; o.need = st.scrollNeed || 3; o.text = '巻物 ' + st.scrolls + '/' + o.need; o.done = st.scrolls >= o.need;
    } else if (k === 'escort') {
      o.text = st.escort ? (st.escort.name + 'の安心 ' + Math.round(st.escort.relief)) : '護衛';
      o.done = !!(st.escort && st.escort.state === 'arrived'); o.n = st.escort ? Math.round(st.escort.relief) : 0; o.need = 100;
    } else if (k === 'exam') {
      var stg = st.stageIdx;
      var parts = [];
      var a2 = st.allies.filter(function (a) { return st.zones[a.zone].kind === 'rescue'; });
      parts.push({ name: '救助', ok: a2.length > 0 && a2.every(function (a) { return a.savedBy; }) });
      parts.push({ name: '探索', ok: st.scrolls >= (st.scrollNeed || 2) });
      var bossF = st.enemies.filter(function (e) { return e.kind === 'daikarakuri'; })[0];
      parts.push({ name: '護衛', ok: !!(st.escort && st.escort.state === 'arrived') && !!(bossF && bossF.hp <= 0) });
      o.parts = parts; o.text = parts.map(function (p) { return p.name + (p.ok ? '○' : '・'); }).join(' ');
      o.done = parts.every(function (p) { return p.ok; });
    }
    return o;
  }
  function checkEnd(st) {
    var pl = st.player, pa = st.partner, fail = null;
    if (pl.down && pa.down) fail = 'wipe';
    else if (pl.down && pl.downT > 20) fail = 'playerDown';
    else if (st.escort && st.escort.state === 'turned') fail = 'escort';
    var ob = objective(st);
    var escortDone = !st.escort || st.escort.state === 'arrived' || st.escort.state === 'hidden';
    var atGoal = pl.y < 1.6 && st.zones.every(function (z) { return z.cleared; }) && escortDone;
    // 護衛役が門に着いたら、見習いがゴールにいなくても終わり
    if (st.escort && st.escort.state === 'arrived' && st.zones.every(function (z) { return z.cleared; })) atGoal = true;
    if (!fail && !atGoal) return;
    // 探索・試験：課題が足りないままゴールに着いたら、一度だけ聞く（もどって探せる）
    if (!fail && atGoal && !ob.done && (st.kind === 'explore' || st.kind === 'exam') && !st.goalAsked) {
      st.goalAsked = true; pl.y = Math.min(st.H - 1, pl.y + 1.4);
      signal(st, { type: 'goalShort', objective: ob });
      return;
    }
    finish(st, fail, ob);
  }
  // 「ここで終える」を選んだとき
  function finishNow(st) { if (!st.done) finish(st, null); }
  function finish(st, fail, ob) {
    st.done = true;
    ob = ob || objective(st);
    var r = { kind: st.kind, fail: fail, success: !fail && ob.done, objective: ob, time: Math.round(st.t), events: st.log.slice(), lessons: st.lessons, decisions: st.decisions, stats: st.stats, scrolls: st.scrolls, chestTokens: st.chestTokens };
    r.star1 = r.success;
    if (st.kind === 'rescue') r.star2 = st.allies.every(function (a) { return a.savedBy && a.patienceAtSave >= 0.5; });
    else if (st.kind === 'explore') r.star2 = st.scrolls >= (st.scrollTotal || 0);
    else if (st.kind === 'escort') r.star2 = !!(st.escort && st.escort.relief >= 50);
    else if (st.kind === 'tutorial') r.star2 = st.spots.every(function (s) { return s.opened; });
    else r.star2 = st.allies.every(function (a) { return a.savedBy; }) && st.spots.filter(function (s) { return s.kind === 'chest'; }).every(function (s) { return s.opened; });
    r.star3 = st.stats.playerDowns === 0 && st.stats.partnerDowns === 0;
    r.stars = P.starsOf(r);
    st.result = r;
    signal(st, { type: 'end', result: r });
  }
  // 途中でやめる（記録はのこすが、失敗あつかい）
  function quit(st) { if (!st.done) finish(st, 'quit'); }

  function setPolicy(st, pol, slot) { st.policy = pol; if (slot) st.slot = slot; if (st.partner) { st.partner.dec = null; st.partner.decT = 0; } }

  // 状態の初期化（統計）
  var _build = build;
  build = function (cfg) {
    var st = _build(cfg);
    st.stats = { partnerDowns: 0, playerDowns: 0, stops: 0 };
    st.scrolls = 0; st.chestTokens = 0;
    return st;
  };

  var api = { build: function (cfg) { return build(cfg); }, step: step, command: command, setPolicy: setPolicy, quit: quit, finishNow: finishNow, objective: objective, zoneIdx: zoneIdx, astar: astar, FW: FW, ACT_ICON: ACT_ICON, ACT_BUBBLE: ACT_BUBBLE, buildCtx: buildCtx, SCENE_FN: SCENE_FN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NAD_SIM = api;
})(typeof window !== 'undefined' ? window : globalThis);
