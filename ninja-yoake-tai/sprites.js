/* ニンジャ夜明け隊（RPG） — 忍者の絵（art.js の SVG → 画像 → キャンバス）
 * 向き・しぐさ・歩きのコマ・大きさごとに、一度だけ作って使い回す。作っているあいだは、前に作った絵を出す。
 * 主人公・村の人の見た目もここで決める（村の人は apprenticeArt を色がえして使う）。
 */
(function (root) {
  'use strict';
  var A = root.NinjaArt, CH = root.NSL_CHARS;
  var SP = { cache: {}, last: {}, pending: 0, defs: {} };

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

  // ---- 絵を取りだす ----
  // o: { yaw, pose, frame, h（画素の高さ）, companions, prop, expr }
  function get(d, o) {
    if (!A || !d || !d.def || typeof document === 'undefined') return null;
    var h = Math.max(24, Math.round(o.h / 4) * 4);
    var k = d.key + '|' + (o.yaw || 0) + '|' + (o.pose || 'stand') + '|' + (o.frame || 0) + '|' + h + '|' + (o.companions ? 1 : 0) + '|' + (o.expr || '') + '|' + (o.prop === false ? 0 : 1);
    var e = SP.cache[k];
    var lastKey = d.key + '|' + h;
    if (e) return e.cv ? e.cv : (SP.last[lastKey] || null);
    e = SP.cache[k] = { cv: null };
    var w = Math.round(h * 200 / 240);
    var svg;
    try {
      svg = A.render(d.def, { yaw: o.yaw || 0, pose: o.pose || 'stand', frame: o.frame || 0, w: w, h: h, shadow: false, companions: !!o.companions, prop: o.prop, expr: o.expr });
    } catch (err) { return null; }
    var img = new Image();
    SP.pending++;
    img.onload = function () { var cv = mk(img.width, img.height); cv.getContext('2d').drawImage(img, 0, 0); e.cv = cv; SP.last[lastKey] = cv; SP.pending--; };
    img.onerror = function () { SP.pending--; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return SP.last[lastKey] || null;
  }
  // 先に作っておく（地図に入ったとき）
  function warm(d, h, dirs) {
    (dirs || [0, 180, -90, 90]).forEach(function (y) {
      get(d, { yaw: y, pose: 'stand', h: h });
      for (var f = 0; f < 4; f++) get(d, { yaw: y, pose: 'walk', frame: f, h: h });
    });
  }
  // 足もとの位置（SVG の地面は y=232/240、まん中は x=100/200）
  var FOOT_Y = 232 / 240;

  // 向き → art.js の yaw
  var YAW = { down: 0, up: 180, left: 70, right: -70 };   // 正の yaw は画面の左を向く

  var api = { get: get, warm: warm, heroDef: heroDef, cnDef: cnDef, villagerDef: villagerDef, defFor: defFor, memberDef: memberDef, YAW: YAW, FOOT_Y: FOOT_Y, VILLAGER: VILLAGER, mk: mk, state: SP };
  root.NYT_SPRITES = api;
})(typeof window !== 'undefined' ? window : globalThis);
