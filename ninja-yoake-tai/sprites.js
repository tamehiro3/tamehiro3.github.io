/* ニンジャ夜明け隊（RPG） — 忍者の絵（art.js の SVG → 画面に出す大きさの画像。萌え絵風・なめらか。DESIGN.md §11.1）
 * 2.7頭身。キャラクターシートと同じ見た目の定義（chars.js）を、萌え絵風（moe）で描く。ドットには落とさない。
 * 大きさ：画面に出す高さ×dpr の画素（8画素きざみ）。地図の上の枠は高さ48単位。左右を向くときは斜め（yaw ±70）。
 * 向き・しぐさ・歩きのコマ・大きさごとに、一度だけ作って使い回す。作るのは1枚ずつ順番に（画面を止めない）。
 * 作っているあいだは、同じ人の前に作った絵を出す。
 * 主人公（見習い忍者）の見た目は夜明け隊だけのもの（HERO_SETS・HERO_HAIR。§11.5）。村の人は apprenticeArt を色がえして使う。
 */
(function (root) {
  'use strict';
  var A = root.NinjaArt, CH = root.NSL_CHARS;
  var SP = { cache: {}, last: {}, pending: 0, defs: {}, queue: [], busy: false, made: 0, px: 0, tick: 0 };
  var BUDGET = 9e6;   // 作り置きの絵の画素の合計の上限（こえたら、しばらく使っていない絵からすてる。スマホのメモリのため）

  // 2.7頭身で描く（art.js の heads）。絵の枠は、頭の飾り・耳・長い襟巻きまで入るように広めにとる
  var HEADS = 2.7;
  var VB = [-14, -30, 228, 272];            // art.js の座標で x, y, 幅, 高さ
  var ASPECT = VB[2] / VB[3];               // 幅 ÷ 高さ
  var FOOT_Y = (232 - VB[1]) / VB[3];       // 足もと（地面 y=232）の高さの割合。まん中は x=100
  var FIELD_H = 48;                         // 地図の上の枠の高さ（単位）
  var MOE = true;                           // 萌え絵風（大きくきらめく目・チーク・髪の光）で描く

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  // ---- 主人公（見習い忍者）：萌え絵風の見た目（§11.5）。id は記録と同じ ----
  var HERO_SETS = {
    ai: { name: '藍の装束', top: '#33508e', trim: '#f6f0e4', inner: '#1d2a4c', accent: '#e2474f', accent2: '#c23440', plate: '#d3d9e3', obi: '#f2c14e', legs: '#24304e', eye: '#3b86de', hair: '#2b2a3a', shine: '#5d6a92' },
    wakakusa: { name: '若草の装束', top: '#5f9e48', trim: '#fff6dc', inner: '#2d5528', accent: '#f28aa6', accent2: '#d86a8a', plate: '#e8e2c8', obi: '#fff3d6', legs: '#33452c', eye: '#2c9a6a', hair: '#7a4e32', shine: '#b88a62' },
    kurenai: { name: '紅の装束', top: '#c63f49', trim: '#fff1e6', inner: '#5a1d26', accent: '#f0b93e', accent2: '#d39a28', plate: '#d8dde6', obi: '#2b2a3a', legs: '#2a2230', eye: '#e08a24', hair: '#22202a', shine: '#5a5878' }
  };
  var HERO_HAIR = {
    short: { name: 'みじかい髪', hair: { bangs: 'jag', front: 6, side: -30, back: -44, amp: 8, per: 17, vol: 7 } },
    pony: { name: 'ポニーテール', hair: { bangs: 'part', front: 3, side: -40, back: -50, vol: 6, parts: [{ kind: 'pony', sway: -1, up: 1.15, len: 1.1, w: [16, 30, 32, 26, 4] }], locks: { th: 74, w: [8, 8, 6, 1], ph1: -50 } } },
    bob: { name: 'おかっぱ', hair: { bangs: 'straight', front: 1, side: -56, back: -58, fw: 58, vol: 6, locks: { th: 77, w: [9, 9, 7, 2], ph1: -58 } } }
  };
  function heroArt(setId, hairId) {
    var s = HERO_SETS[setId] || HERO_SETS.ai, hs = HERO_HAIR[hairId] || HERO_HAIR.short;
    var hair = JSON.parse(JSON.stringify(hs.hair));
    hair.color = s.hair; hair.shine = s.shine;
    var d = {
      skin: '#fbe2cf', hair: hair,
      eyes: { style: 'iris', color: s.eye, lash: true }, mouth: 'smile',
      band: { color: s.accent, plate: 1, plateColor: s.plate, pw: 18, hi: 42, lo: 30 },          // 鉢金つきの鉢巻を前髪の上に
      scarf: { color: s.accent, color2: s.accent2, dir: -1, len: 78 },                           // なびく襟巻き
      top: { color: s.top, trim: s.trim, inner: s.inner },
      obi: { color: s.obi, knot: 'bow' },
      sleeves: { kind: 'short', trim: s.trim }, arms: { guard: s.legs },
      bottom: { kind: 'shorts', color: s.top }, legs: { color: s.legs, band: s.trim },
      feet: { kind: 'sandal', color: s.legs, strap: s.accent },
      back: { katana: { hilt: s.inner, wrap: s.accent, guard: '#e8c050' } }
    };
    if (hairId === 'pony') d.ribbon = { th: 180, ph: 44, color: s.accent, size: 1.9, kind: 'long' };
    if (hairId === 'bob') d.flower = { th: 50, ph: 40, color: '#ffc3d6', size: 8 };
    return d;
  }

  // ---- 村の人の見た目 ----
  var VILLAGER = {
    v1: { set: 'wakakusa', hair: 'short', o: { top: '#7a6a4a', trim: '#4a3e2a', band: '#c8a050', hair: '#3a2a22', katana: false } },
    v2: { set: 'ai', hair: 'bob', o: { top: '#5a7aa8', trim: '#33486a', band: '#e8d8b0', hair: '#2a2226', katana: false } },
    v3: { set: 'kurenai', hair: 'pony', o: { top: '#a8604a', trim: '#6a3a2a', band: '#f0e0c0', hair: '#4a2a1e', katana: false } },
    v4: { set: 'wakakusa', hair: 'short', o: { top: '#4a8a8a', trim: '#2a5050', band: '#f0f0e0', hair: '#1e1e22', katana: false } },
    kid1: { set: 'kurenai', hair: 'bob', small: 1, o: { top: '#e08a6a', trim: '#a04a3a', band: '#f8e0a0', hair: '#3a2a22', katana: false } },
    kid2: { set: 'ai', hair: 'short', small: 1, o: { top: '#6aa0d8', trim: '#3a6a9a', band: '#f8f0d0', hair: '#2a2226', katana: false } },
    elder: { set: 'ai', hair: 'bob', o: { top: '#8a7a6a', trim: '#5a4a3a', band: '#d8d0c0', hair: '#c8c8c8', katana: false } },
    merchant: { set: 'wakakusa', hair: 'short', o: { top: '#3a6a4a', trim: '#2a4030', band: '#e8c050', hair: '#2a2226', katana: false } },
    merchant2: { set: 'kurenai', hair: 'short', o: { top: '#6a4a8a', trim: '#40305a', band: '#f0d080', hair: '#1e1e22', katana: false } },
    innkeeper: { set: 'kurenai', hair: 'pony', o: { top: '#c86a7a', trim: '#8a3a4a', band: '#fff0e0', hair: '#2a2226', katana: false } },
    fisher: { set: 'ai', hair: 'short', o: { top: '#3a5a8a', trim: '#22385a', band: '#f0f0f0', hair: '#2a2226', katana: false } },
    sailor: { set: 'ai', hair: 'short', o: { top: '#2a4a7a', trim: '#f0f0f0', band: '#c83030', hair: '#3a2a22', katana: false } },
    maiden: { set: 'kurenai', hair: 'pony', o: { top: '#f4f0f8', trim: '#d8c0e8', band: '#e8c050', hair: '#2a2226', katana: false } },
    maiden2: { set: 'ai', hair: 'bob', o: { top: '#f8f0e0', trim: '#e8c8a0', band: '#d8a0c0', hair: '#3a2a22', katana: false } }
  };
  function heroDef(S) {
    var lk = (S && S.look) || { set: 'ai', hair: 'short' };
    var k = 'hero:' + lk.set + ':' + lk.hair;
    if (!SP.defs[k]) SP.defs[k] = heroArt(lk.set, lk.hair);
    return { key: k, def: SP.defs[k] };
  }
  function cnDef(id) { var c = CH.BY_ID[id]; return { key: 'cn:' + id, def: c ? c.art : null }; }
  function villagerDef(id) {
    var v = VILLAGER[id] || VILLAGER.v1, k = 'vil:' + id;
    if (!SP.defs[k]) {
      var d = CH.apprenticeArt(v.set, v.hair, v.o);
      d.eyes = { style: v.small ? 'iris' : 'dot', color: '#3a2a22', lash: v.hair !== 'short' };
      if (v.small) d.build = 'small';
      SP.defs[k] = d;
    }
    return { key: k, def: SP.defs[k] };
  }
  // 物（npc）から見た目をえらぶ
  function defFor(o, S) {
    if (o.hero) return heroDef(S);
    if (o.cn) return cnDef(o.cn);
    return villagerDef(o.look);
  }
  // 仲間の id から
  function memberDef(id, S) { return id === 'hero' ? heroDef(S) : cnDef(id); }

  // ---- SVG（そのまま <img> にも使える） ----
  function svgOf(d, o, w, h, vb) {
    return A.render(d.def, { yaw: o.yaw || 0, pose: o.pose || 'stand', frame: o.frame || 0, w: w, h: h, shadow: false, companions: !!o.companions, prop: o.prop, expr: o.expr, heads: HEADS, viewBox: (vb || VB).join(' '), moe: MOE });
  }
  function svgUrl(d, o, w, h) { o = o || {}; return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgOf(d, o, w, h, o.vb)); }

  // ---- 絵を取りだす ----
  // o: { yaw, pose, frame, h（画面の画素の高さ）, companions, prop, expr }
  // できていれば絵（キャンバス）を返す。まだなら作る順番に入れて、同じ人の前の絵（なければ null）を返す
  function get(d, o) {
    if (!A || !d || !d.def || typeof document === 'undefined') return null;
    o = o || {};
    var hb = Math.max(32, Math.min(1024, Math.round((o.h || 96) / 8) * 8));
    var k = d.key + '|' + hb + '|' + (o.yaw || 0) + '|' + (o.pose || 'stand') + '|' + (o.frame || 0) + '|' + (o.companions ? 1 : 0) + '|' + (o.expr || '') + '|' + (o.prop === false ? 0 : 1);
    var e = SP.cache[k], lastKey = d.key + '|' + hb;
    if (e) { e.t = SP.tick++; return e.cv || SP.last[lastKey] || SP.last[d.key] || null; }
    SP.cache[k] = e = { cv: null, t: SP.tick++, k: k };
    SP.pending++;
    SP.queue.push({ e: e, d: d, o: o, h: hb, lastKey: lastKey, first: !SP.last[lastKey] });
    // その人の最初の1枚は先に（だれも描けないままにしない）
    if (!SP.last[lastKey]) SP.queue.sort(function (a, b) { return (b.first ? 1 : 0) - (a.first ? 1 : 0); });
    pump();
    return SP.last[lastKey] || SP.last[d.key] || null;
  }
  function pump() {
    if (SP.busy || !SP.queue.length) return;
    var job = SP.queue.shift();
    SP.busy = true;
    var H = job.h, W = Math.round(H * ASPECT);
    var done = function (cv) {
      job.e.cv = cv; if (cv) { SP.last[job.lastKey] = cv; SP.last[job.d.key] = cv; SP.made++; SP.px += cv.width * cv.height; if (SP.px > BUDGET) trim(); }
      SP.pending--; SP.busy = false;
      setTimeout(pump, 0);
    };
    try {
      var img = new Image();
      img.onload = function () {
        var cv = mk(W, H), g = cv.getContext('2d');
        g.imageSmoothingEnabled = true; g.drawImage(img, 0, 0, W, H);
        done(cv);
      };
      img.onerror = function () { done(null); };
      img.src = svgUrl(job.d, job.o, W, H);
    } catch (err) { done(null); }
  }
  // しばらく使っていない絵からすてる（上限の7割まで）
  function trim() {
    var list = [];
    for (var k in SP.cache) { var e = SP.cache[k]; if (e.cv) list.push(e); }
    list.sort(function (a, b) { return a.t - b.t; });
    for (var i = 0; i < list.length && SP.px > BUDGET * 0.7; i++) { SP.px -= list[i].cv.width * list[i].cv.height; delete SP.cache[list[i].k]; }
  }
  // 先に作っておく（地図に入ったとき）：4方向の立ち姿と歩くコマ
  function warm(d, h) {
    ['down', 'up', 'left', 'right'].forEach(function (dir) {
      var y = YAW[dir];
      get(d, { yaw: y, pose: 'stand', h: h });
      for (var f = 0; f < 4; f++) get(d, { yaw: y, pose: 'walk', frame: f, h: h });
    });
  }
  // 向き → art.js の yaw（正の yaw は画面の右を向く）
  var YAW = { down: 0, up: 180, left: -70, right: 70 };

  var api = { get: get, warm: warm, svg: svgOf, svgUrl: svgUrl, heroDef: heroDef, heroArt: heroArt, cnDef: cnDef, villagerDef: villagerDef, defFor: defFor, memberDef: memberDef, YAW: YAW, FOOT_Y: FOOT_Y, ASPECT: ASPECT, VB: VB, FIELD_H: FIELD_H, HEADS: HEADS, VILLAGER: VILLAGER, HERO_SETS: HERO_SETS, HERO_HAIR: HERO_HAIR, mk: mk, state: SP };
  root.NYT_SPRITES = api;
})(typeof window !== 'undefined' ? window : globalThis);
