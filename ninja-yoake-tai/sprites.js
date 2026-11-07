/* ニンジャ夜明け隊（RPG） — 忍者のドット絵（art.js の SVG → 高い解像度の画像 → ドット絵）
 * 2.7頭身。キャラクターシートと同じ見た目の定義（chars.js）から、ドット絵を作る（pixel.js）。
 * 大きさ：地図 40×48ドット・戦闘 60×72ドット・メニュー 80×96ドット。左右を向くときは斜め（yaw ±70）。
 * 向き・しぐさ・歩きのコマ・大きさごとに、一度だけ作って使い回す。作るのは1枚ずつ順番に。
 * 作っているあいだは、同じ人の前に作った絵を出す。
 * 主人公・村の人の見た目もここで決める（村の人は apprenticeArt を色がえして使う）。
 */
(function (root) {
  'use strict';
  var A = root.NinjaArt, CH = root.NSL_CHARS, PIX = root.NYT_PIX;
  var SP = { cache: {}, last: {}, pending: 0, defs: {}, queue: [], busy: false };

  // 2.7頭身で描く（art.js の heads）。絵の枠は、頭の飾り・耳・長い襟巻きまで入るように広めにとる
  var HEADS = 2.7;
  var VB = [-14, -30, 228, 272];            // art.js の座標で x, y, 幅, 高さ
  var ASPECT = VB[2] / VB[3];               // 幅 ÷ 高さ
  var FOOT_Y = (232 - VB[1]) / VB[3];       // 足もと（地面 y=232）の高さの割合。まん中は x=100
  var FACE = { cy: 0.33, h: 0.36 };         // 顔の切り抜き：頭のまん中の高さ・切り抜く高さ（絵の高さに対する割合）
  var SIZE = { field: [40, 48], battle: [60, 72], big: [80, 96] };

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  // ---- 見た目 ----
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
    if (!SP.defs[k]) SP.defs[k] = CH.apprenticeArt(lk.set, lk.hair, {});
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

  // ---- ドット絵を取りだす ----
  // o: { yaw, pose, frame, size（'field'|'battle'|'big'）, companions, prop, expr }
  // できていれば絵（キャンバス）を返す。まだなら作る順番に入れて、同じ人の前の絵（なければ null）を返す
  function pix(d, o) {
    if (!A || !PIX || !d || !d.def || typeof document === 'undefined') return null;
    o = o || {};
    var size = SIZE[o.size] ? o.size : 'field', wh = SIZE[size];
    var k = d.key + '|' + size + '|' + (o.yaw || 0) + '|' + (o.pose || 'stand') + '|' + (o.frame || 0) + '|' + (o.companions ? 1 : 0) + '|' + (o.expr || '') + '|' + (o.prop === false ? 0 : 1);
    var e = SP.cache[k], lastKey = d.key + '|' + size;
    if (e) return e.cv || SP.last[lastKey] || null;
    SP.cache[k] = e = { cv: null };
    SP.pending++;
    SP.queue.push({ e: e, d: d, o: o, wh: wh, lastKey: lastKey, first: !SP.last[lastKey] });
    // その人の最初の1枚は先に（だれも描けないままにしない）
    if (!SP.last[lastKey]) SP.queue.sort(function (a, b) { return (b.first ? 1 : 0) - (a.first ? 1 : 0); });
    pump();
    return SP.last[lastKey] || null;
  }
  function pump() {
    if (SP.busy || !SP.queue.length) return;
    var job = SP.queue.shift();
    SP.busy = true;
    var o = job.o, W = job.wh[0], H = job.wh[1];
    var done = function (cv) {
      job.e.cv = cv; if (cv) SP.last[job.lastKey] = cv;
      SP.pending--; SP.busy = false;
      setTimeout(pump, 0);
    };
    try {
      PIX.fromSvg(function (w, h) {
        return A.render(job.d.def, { yaw: o.yaw || 0, pose: o.pose || 'stand', frame: o.frame || 0, w: w, h: h, shadow: false, companions: !!o.companions, prop: o.prop, expr: o.expr, heads: HEADS, viewBox: VB.join(' ') });
      }, W, H, { N: W >= 60 ? 5 : 6 }).then(done, function () { done(null); });
    } catch (err) { done(null); }
  }
  // 顔（ドット絵の頭のまわりを切り抜く）。できていなければ null
  function face(d, o) {
    var big = pix(d, Object.assign({ size: 'big' }, o || {}));
    if (!big) return null;
    if (big._face) return big._face;
    var H = big.height, s = Math.round(H * FACE.h), cy = Math.round(H * FACE.cy);
    var c = mk(s, s), g = c.getContext('2d');
    g.drawImage(big, Math.round((big.width - s) / 2), cy - Math.round(s / 2), s, s, 0, 0, s, s);
    big._face = c;
    return c;
  }
  // 先に作っておく（地図に入ったとき）：4方向の立ち姿と歩くコマ
  function warm(d) {
    ['down', 'up', 'left', 'right'].forEach(function (dir) {
      var y = YAW[dir];
      pix(d, { yaw: y, pose: 'stand' });
      for (var f = 0; f < 4; f++) pix(d, { yaw: y, pose: 'walk', frame: f });
    });
  }
  // 向き → art.js の yaw（正の yaw は画面の右を向く）
  var YAW = { down: 0, up: 180, left: -70, right: 70 };

  var api = { pix: pix, face: face, warm: warm, heroDef: heroDef, cnDef: cnDef, villagerDef: villagerDef, defFor: defFor, memberDef: memberDef, YAW: YAW, FOOT_Y: FOOT_Y, ASPECT: ASPECT, FACE: FACE, SIZE: SIZE, HEADS: HEADS, VILLAGER: VILLAGER, mk: mk, state: SP };
  root.NYT_SPRITES = api;
})(typeof window !== 'undefined' ? window : globalThis);
