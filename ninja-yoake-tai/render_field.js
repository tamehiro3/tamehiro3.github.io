/* ニンジャ夜明け隊（RPG） — フィールドの描画
 * 地面（1枚の画像）→ 木・建物・人・妖怪を「下にあるものほど手前」に並べて描く → 夜の暗さと明かり。
 * 空の明るさは、取り戻した暁のかけらの数で変わる。
 */
(function (root) {
  'use strict';
  var DW = root.NYT_DRAW, YK = root.NYT_YOKAI, SPR = root.NYT_SPRITES, FD = root.NYT_FIELD;
  var T = 32;
  var R = { cv: null, c: null, dpr: 1, vw: 0, vh: 0, zoom: 1.5, s: 1.5, cam: { x: 0, y: 0 }, F: null, ground: null, gs: 1, tall: [], light: null, t: 0, fx: [] };

  function init(cv) { R.cv = cv; R.c = cv.getContext('2d'); resize(); }
  function resize() {
    R.dpr = Math.min(2.5, root.devicePixelRatio || 1);
    R.vw = root.innerWidth; R.vh = root.innerHeight;
    R.cv.width = Math.round(R.vw * R.dpr); R.cv.height = Math.round(R.vh * R.dpr);
    R.cv.style.width = R.vw + 'px'; R.cv.style.height = R.vh + 'px';
    fitZoom();
    if (R.F) buildGround(R.F);
  }
  // 画面に見えるマスの数を決める。地図が画面より小さいときは、すき間ができないように少し寄る
  function fitZoom() {
    var short = Math.min(R.vw, R.vh);
    var z = Math.max(1, Math.min(2.6, short / (T * (R.vw < R.vh ? 10.5 : 9.5))));
    if (R.F) z = Math.min(2.6, Math.max(z, R.vw / (R.F.w * T), R.vh / (R.F.h * T)));
    R.zoom = z; R.s = R.zoom * R.dpr;
  }
  function buildGround(F) {
    var gs = Math.min(2.5, Math.round(R.s * 4) / 4);
    if (F.w * T * gs > 4096 || F.h * T * gs > 4096) gs = Math.min(4096 / (F.w * T), 4096 / (F.h * T));
    R.gs = gs; R.ground = DW.buildGround(F, gs);
  }
  function setMap(F) {
    R.F = F; fitZoom(); buildGround(F);
    // 背の高いマス（木・松・竹）
    R.tall = [];
    for (var y = 0; y < F.h; y++) for (var x = 0; x < F.w; x++) {
      var ch = F.tiles[y * F.w + x];
      if (ch === 'T' || ch === 'Y' || ch === 'B') R.tall.push({ kind: ch, x: x, y: y, v: (x * 7 + y * 13) % 5 });
    }
  }

  // ---- 1コマ ----
  // V: { S, F, P（主人公の位置）, party（ついてくる仲間）, npcs, t, dt, hint }
  function frame(V) {
    var c = R.c, F = R.F; if (!F) return;
    R.t = V.t;
    // カメラ
    var tx = (V.P.fx + 0.5) * T, ty = (V.P.fy + 0.5) * T;
    var hw = R.vw / 2 / R.zoom, hh = R.vh / 2 / R.zoom, mw = F.w * T, mh = F.h * T;
    tx = mw <= hw * 2 ? mw / 2 : Math.max(hw, Math.min(mw - hw, tx));
    ty = mh <= hh * 2 ? mh / 2 : Math.max(hh, Math.min(mh - hh, ty));
    R.cam.x = tx; R.cam.y = ty;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = F.def.theme === 'sky' ? '#9ab8f0' : '#05050a'; c.fillRect(0, 0, R.cv.width, R.cv.height);
    c.setTransform(R.s, 0, 0, R.s, R.cv.width / 2 - R.cam.x * R.s, R.cv.height / 2 - R.cam.y * R.s);
    c.imageSmoothingEnabled = true;
    c.drawImage(R.ground, 0, 0, R.ground.width / R.gs, R.ground.height / R.gs);
    var vx0 = R.cam.x - hw - T * 2, vx1 = R.cam.x + hw + T * 2, vy0 = R.cam.y - hh - T * 2, vy1 = R.cam.y + hh + T * 4;
    waterShimmer(c, F, vx0, vy0, vx1, vy1);
    // 並べる
    var list = [];
    R.tall.forEach(function (o) { var px = o.x * T, py = o.y * T; if (px < vx0 || px > vx1 || py < vy0 || py > vy1) return; list.push({ y: py + T - 1, k: 'tall', o: o }); });
    F.deco.forEach(function (d) { if (d.show && !FD.cond(V.S, d.show)) return; var px = d.x * T, py = d.y * T; if (px > vx1 || px + (d.w || 1) * T < vx0 || py > vy1 || py + (d.h || 1) * T < vy0 - 60) return; list.push({ y: (d.y + (d.h || 1)) * T - 2, k: 'deco', o: d }); });
    F.objs.forEach(function (o) {
      if (!o.on) return;
      if (o.k === 'exit' || o.k === 'step') return;
      var px = (o.fx != null ? o.fx : o.x) * T, py = (o.fy != null ? o.fy : o.y) * T;
      if (px < vx0 || px > vx1 || py < vy0 || py > vy1) return;
      list.push({ y: py + T - (o.k === 'pit' ? 30 : o.k === 'npc' || o.k === 'enemy' ? 4 : 3), k: o.k, o: o });
    });
    (V.party || []).forEach(function (m, i) { list.push({ y: (m.fy + 1) * T - 4 - (i + 1) * 0.01, k: 'member', o: m }); });
    list.push({ y: (V.P.fy + 1) * T - 4 + 0.02, k: 'player', o: V.P });
    list.sort(function (a, b) { return a.y - b.y; });
    list.forEach(function (it) { drawItem(c, it, V); });
    // しるし（調べられる・吹き出し）
    drawMarks(c, V);
    drawFx(c, V.dt || 0);
    // 夜と明かり
    lighting(c, V);
    if (F.def.mist) mistLayer(c, V);
  }

  function drawItem(c, it, V) {
    var o = it.o;
    if (it.k === 'tall') {
      var sp = DW.tallSprite(o.kind, R.F.def.theme, o.v, Math.min(2.5, R.s));
      c.drawImage(sp.cv, o.x * T - sp.ox, o.y * T - sp.oy, sp.w, sp.h);
      return;
    }
    if (it.k === 'deco') {
      var ds = DW.decoSprite(o, Math.min(2.5, R.s));
      c.drawImage(ds.cv, o.x * T - ds.ox, o.y * T - ds.oy, ds.w, ds.h);
      if (o.kind === 'brazier') flame(c, o.x * T + 16, o.y * T + 4, 1);
      return;
    }
    if (it.k === 'player' || it.k === 'member') { drawChar(c, o, o.def, V); return; }
    if (it.k === 'npc') {
      if (o.yokai) { var e = root.NYT_ENEMIES.ENEMIES[o.yokai]; var shape = e ? e.shape : o.yokai, col = e ? e.col : 'purple'; c.save(); c.translate((o.fx != null ? o.fx : o.x) * T + 16, (o.fy != null ? o.fy : o.y) * T + 30); YK.draw(c, shape, col, { t: R.t + o.x, s: o.big ? 1.25 : 0.8, boss: o.big, dir: 1 }); c.restore(); return; }
      drawChar(c, { fx: o.fx != null ? o.fx : o.x, fy: o.fy != null ? o.fy : o.y, dir: o.dir || 'down', walk: o.walk || 0, moving: o.moving, sleep: o.sleep }, SPR.defFor(o, V.S), V);
      return;
    }
    var px = o.x * T, py = o.y * T;
    if (it.k === 'enemy') {
      var ee = root.NYT_ENEMIES.ENEMIES[o.enemies[0]];
      c.save(); c.translate((o.fx != null ? o.fx : o.x) * T + 16, (o.fy != null ? o.fy : o.y) * T + 30);
      var sc = 0.62 * (ee.cn ? 1 : 1);
      YK.draw(c, ee.shape || 'blob', ee.col, { t: R.t + o.x * 0.7, s: sc, dir: o.dir === 'left' ? -1 : 1 });
      if (o.enemies.length > 1) { c.fillStyle = 'rgba(0,0,0,.55)'; DW.rrect(c, 8, -40, 16, 12, 4, 'rgba(0,0,0,.55)'); DW.text(c, '×' + o.enemies.length, 16, -34, 9, '#fff'); }
      c.restore();
      return;
    }
    if (it.k === 'chest') { chest(c, px, py, o.open); return; }
    if (it.k === 'pickup') { sparkle(c, px + 16, py + 20, 1); return; }
    if (it.k === 'sign') { sign(c, px, py); return; }
    if (it.k === 'pit') { DW.ell(c, px + 16, py + 17, 14, 10, '#0c0a0a', '#3a3030', 2); return; }
    if (it.k === 'gate') { gate(c, o); return; }
    if (it.k === 'obst') { obst(c, o, V); return; }
  }

  // 忍者（地図の上）
  var HCH = 46;   // 高さ（世界の単位）
  function drawChar(c, m, d, V) {
    if (!d || !d.def) return;
    var px = m.fx * T + 16, py = m.fy * T + 30;
    var yaw = SPR.YAW[m.dir] != null ? SPR.YAW[m.dir] : 0;
    var hpx = HCH * R.s;
    var img = m.moving ? SPR.get(d, { yaw: yaw, pose: 'walk', frame: m.walk % 4, h: hpx }) : SPR.get(d, { yaw: yaw, pose: 'stand', h: hpx });
    DW.ell(c, px, py, 11, 3.6, 'rgba(0,0,0,.25)');
    if (img) { var w = HCH * 200 / 240; c.drawImage(img, px - w / 2, py - HCH * SPR.FOOT_Y, w, HCH); }
    if (m.sleep) { DW.text(c, 'z', px + 12, py - 44 - Math.sin(R.t * 2) * 3, 9, '#e8f0ff'); DW.text(c, 'Z', px + 18, py - 52 - Math.sin(R.t * 2 + 1) * 3, 11, '#e8f0ff'); }
  }
  function chest(c, px, py, open) {
    DW.ell(c, px + 16, py + 27, 12, 3.5, 'rgba(0,0,0,.25)');
    DW.rrect(c, px + 5, py + 12, 22, 15, 2, open ? '#6a4024' : '#a0602e', DW.OUT, 1.6);
    if (open) { DW.rrect(c, px + 5, py + 6, 22, 7, 2, '#7a4a2a', DW.OUT, 1.4); c.fillStyle = '#2a1a10'; c.fillRect(px + 7, py + 13, 18, 4); }
    else { DW.rrect(c, px + 4, py + 8, 24, 9, 3, '#b8743a', DW.OUT, 1.6); c.fillStyle = '#e8c050'; c.fillRect(px + 14, py + 14, 4, 6); c.strokeStyle = '#e8c050'; c.lineWidth = 1.6; c.strokeRect(px + 5, py + 16, 22, 1); }
  }
  function sign(c, px, py) {
    DW.ell(c, px + 16, py + 28, 8, 3, 'rgba(0,0,0,.22)');
    DW.rrect(c, px + 14, py + 14, 4, 14, 1, '#6a4a2a', DW.OUT, 1.2);
    DW.rrect(c, px + 5, py + 4, 22, 13, 2, '#c8a070', DW.OUT, 1.5);
    c.strokeStyle = 'rgba(80,50,30,.6)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px + 9, py + 9); c.lineTo(px + 23, py + 9); c.moveTo(px + 9, py + 12); c.lineTo(px + 20, py + 12); c.stroke();
  }
  function sparkle(c, x, y, a) {
    var t = R.t * 4, s = 3 + Math.sin(t) * 1.5;
    c.save(); c.globalAlpha = 0.85 * a;
    c.fillStyle = '#fff6c0';
    c.beginPath(); c.moveTo(x, y - s * 2); c.lineTo(x + s * 0.4, y - s * 0.4); c.lineTo(x + s * 2, y); c.lineTo(x + s * 0.4, y + s * 0.4); c.lineTo(x, y + s * 2); c.lineTo(x - s * 0.4, y + s * 0.4); c.lineTo(x - s * 2, y); c.lineTo(x - s * 0.4, y - s * 0.4); c.closePath(); c.fill();
    DW.circle(c, x + 7, y - 6, 1.4 + Math.sin(t + 1) * 0.6, '#fff');
    c.restore();
  }
  function gate(c, o) {
    var px = o.x * T, py = o.y * T, w = (o.w || 1) * T;
    if (R.F.def.theme === 'under') {
      var a = 0.5 + Math.sin(R.t * 3) * 0.2;
      c.fillStyle = 'rgba(170,110,255,' + a + ')'; c.fillRect(px, py - 10, w, T + 6);
      c.strokeStyle = 'rgba(240,210,255,.9)'; c.lineWidth = 2; for (var i = 0; i < w; i += 10) { c.beginPath(); c.moveTo(px + i, py - 8); c.lineTo(px + i + 6, py + T - 6); c.stroke(); }
      return;
    }
    for (var k = 0; k < (o.w || 1); k++) {
      var gx = px + k * T;
      DW.rrect(c, gx + 3, py + 2, 5, 26, 1, '#6a4a2a', DW.OUT, 1.3); DW.rrect(c, gx + 24, py + 2, 5, 26, 1, '#6a4a2a', DW.OUT, 1.3);
      DW.rrect(c, gx, py + 8, T, 5, 1, '#8a6038', DW.OUT, 1.3); DW.rrect(c, gx, py + 18, T, 5, 1, '#8a6038', DW.OUT, 1.3);
    }
    DW.rrect(c, px + w / 2 - 9, py + 9, 18, 13, 2, '#f4ecd8', DW.OUT, 1.3); DW.text(c, '封', px + w / 2, py + 15.5, 9, '#a82a2a');
  }
  function obst(c, o, V) {
    var px = o.x * T, py = o.y * T;
    if (o.kind === 'boulder') {
      DW.ell(c, px + 16, py + 28, 15, 4, 'rgba(0,0,0,.28)');
      DW.poly(c, [[px + 1, py + 27], [px + 2, py + 12], [px + 10, py + 2], [px + 24, py + 1], [px + 31, py + 12], [px + 31, py + 27]], '#8a847c', DW.OUT, 2);
      DW.poly(c, [[px + 6, py + 12], [px + 12, py + 5], [px + 22, py + 5], [px + 14, py + 13]], '#aaa49c');
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(px + 9, py + 20); c.lineTo(px + 16, py + 17); c.moveTo(px + 22, py + 22); c.lineTo(px + 26, py + 15); c.stroke();
      if (FD.hasAbility(V.S, 'push')) sparkle(c, px + 26, py + 4, 0.6);
      return;
    }
    if (o.kind === 'fog') {
      for (var i = 0; i < 3; i++) { var a = R.t * 0.8 + i * 2.1 + o.y; DW.circle(c, px + 16 + Math.sin(a) * 6, py + 10 + i * 7 + Math.cos(a) * 3, 13 - i * 2, 'rgba(236,240,250,.82)'); }
      DW.circle(c, px + 8, py + 20, 9, 'rgba(250,252,255,.7)'); DW.circle(c, px + 24, py + 18, 10, 'rgba(250,252,255,.7)');
      return;
    }
    if (o.kind === 'crack') {
      DW.poly(c, [[px, py + 30], [px + 1, py + 6], [px + 8, py], [px + 25, py], [px + 31, py + 6], [px + 32, py + 30]], '#7a7268', DW.OUT, 2);
      c.strokeStyle = '#2a2220'; c.lineWidth = 2; c.beginPath(); c.moveTo(px + 16, py + 2); c.lineTo(px + 12, py + 10); c.lineTo(px + 18, py + 15); c.lineTo(px + 13, py + 24); c.moveTo(px + 18, py + 15); c.lineTo(px + 25, py + 20); c.stroke();
      return;
    }
    if (o.kind === 'hidden') { if (FD.hasAbility(V.S, 'hawk')) sparkle(c, px + 16, py + 16, 0.5 + Math.sin(R.t * 3 + o.x) * 0.3); return; }
  }
  function flame(c, x, y, s) {
    var f = Math.sin(R.t * 16) * 2;
    DW.poly(c, [[x - 6 * s, y], [x - 4 * s, y - 8 * s], [x, y - 15 * s - f], [x + 4 * s, y - 8 * s], [x + 6 * s, y]], '#ff8a2a');
    DW.poly(c, [[x - 3 * s, y], [x - 2 * s, y - 5 * s], [x, y - 9 * s - f * 0.6], [x + 2 * s, y - 5 * s], [x + 3 * s, y]], '#ffe27a');
  }

  // 調べられる物の上の「！」、近くの出口の矢印
  function drawMarks(c, V) {
    var h = V.hint;
    if (h && h.x != null) {
      var bx = h.x * T + 16, by = h.y * T - 18 + Math.sin(R.t * 5) * 2;
      DW.rrect(c, bx - 8, by - 9, 16, 15, 5, 'rgba(255,250,235,.95)', DW.OUT, 1.4);
      DW.text(c, h.icon || '！', bx, by - 1.5, 10, '#c83a2a');
    }
    (V.emotes || []).forEach(function (e) {
      var bx = e.x * T + 16, by = e.y * T - 26 - Math.min(1, e.t * 6) * 4;
      DW.rrect(c, bx - 9, by - 10, 18, 17, 6, '#fffaf0', DW.OUT, 1.5);
      DW.text(c, e.e, bx, by - 1.5, 11, e.e === '！' ? '#c83a2a' : '#3a2a22');
    });
  }
  function addFx(f) { f.age = 0; R.fx.push(f); }
  function drawFx(c, dt) {
    R.fx = R.fx.filter(function (f) { f.age += dt; return f.age < (f.dur || 0.8); });
    R.fx.forEach(function (f) {
      var k = f.age / (f.dur || 0.8);
      if (f.kind === 'smoke') { for (var i = 0; i < 6; i++) { var a = i * 1.05; DW.circle(c, f.x + Math.cos(a) * 14 * k, f.y + Math.sin(a) * 10 * k - 10 * k, 9 * (1 - k * 0.6), 'rgba(240,240,240,' + (0.8 * (1 - k)) + ')'); } }
      if (f.kind === 'wind') { c.strokeStyle = 'rgba(200,255,230,' + (1 - k) + ')'; c.lineWidth = 2.4; for (var j = 0; j < 4; j++) { c.beginPath(); c.arc(f.x + (k - 0.5) * 60, f.y - 10 + j * 7, 14, -0.6, 0.9); c.stroke(); } }
      if (f.kind === 'boom') { DW.circle(c, f.x, f.y, 30 * k, 'rgba(255,190,90,' + (1 - k) + ')'); DW.circle(c, f.x, f.y, 18 * k, 'rgba(255,250,200,' + (1 - k) + ')'); }
      if (f.kind === 'reveal') { c.strokeStyle = 'rgba(255,240,160,' + (1 - k) + ')'; c.lineWidth = 3; c.beginPath(); c.arc(f.x, f.y, 6 + 30 * k, 0, 7); c.stroke(); }
      if (f.kind === 'heal') { for (var q = 0; q < 8; q++) { var xx = f.x + Math.sin(q * 2.3) * 16, yy = f.y - 30 * k - q * 3; DW.circle(c, xx, yy, 2, 'rgba(160,255,190,' + (1 - k) + ')'); } }
    });
  }

  function waterShimmer(c, F, x0, y0, x1, y1) {
    c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1.5;
    var tx0 = Math.max(0, Math.floor(x0 / T)), tx1 = Math.min(F.w - 1, Math.ceil(x1 / T)), ty0 = Math.max(0, Math.floor(y0 / T)), ty1 = Math.min(F.h - 1, Math.ceil(y1 / T));
    c.beginPath();
    for (var y = ty0; y <= ty1; y++) for (var x = tx0; x <= tx1; x++) {
      if (F.tiles[y * F.w + x] !== '~') continue;
      var ph = R.t * 1.4 + x * 0.9 + y * 1.7, ox = (Math.sin(ph) * 0.5 + 0.5) * 18;
      c.moveTo(x * T + 4 + ox, y * T + 12 + (y % 2) * 8); c.lineTo(x * T + 10 + ox, y * T + 12 + (y % 2) * 8);
    }
    c.stroke();
  }

  // ---- 夜と明かり ----
  var NIGHT = [[14, 18, 48, 0.58], [18, 22, 58, 0.5], [24, 28, 70, 0.42], [40, 32, 78, 0.32], [70, 42, 70, 0.2], [90, 60, 60, 0.1], [0, 0, 0, 0]];
  function dawnLevel(S) { return S.flags.dawn ? 6 : Math.min(5, S.frag || 0); }
  function lighting(c, V) {
    var F = R.F, lv = dawnLevel(V.S), n = NIGHT[lv], dark = F.def.dark ? 0.5 : 0;
    if (F.def.theme === 'sky') { n = [60, 40, 90, Math.max(0, n[3] - 0.2)]; }
    var alpha = Math.min(0.9, n[3] + dark * (1 - lv / 8));
    if (alpha <= 0.01) return;
    if (!R.light || R.light.width !== R.cv.width || R.light.height !== R.cv.height) { R.light = DW.mk(R.cv.width, R.cv.height); }
    var L = R.light, lc = L.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, L.width, L.height);
    lc.fillStyle = 'rgba(' + n[0] + ',' + n[1] + ',' + n[2] + ',' + alpha + ')'; lc.fillRect(0, 0, L.width, L.height);
    lc.globalCompositeOperation = 'destination-out';
    var toS = function (x, y) { return [R.cv.width / 2 + (x - R.cam.x) * R.s, R.cv.height / 2 + (y - R.cam.y) * R.s]; };
    var hole = function (x, y, r, a) { var p = toS(x, y), rr = r * R.s, g = lc.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr); g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = g; lc.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2); };
    // 主人公のまわり（洞では大きめ）
    hole((V.P.fx + 0.5) * T, (V.P.fy + 0.5) * T - 8, F.def.dark ? 150 : 95, F.def.dark ? 0.95 : 0.55);
    var glows = [];
    F.deco.forEach(function (d) {
      var L2 = DW.LIGHTS[d.kind]; if (!L2) return;
      var x = (d.x + (d.w || 1) / 2) * T, y = d.y * T + L2.y;
      if (Math.abs(x - R.cam.x) > R.vw / R.zoom || Math.abs(y - R.cam.y) > R.vh / R.zoom) return;
      hole(x, y, L2.r, 0.9); glows.push([x, y, L2.r * 0.6, L2.col]);
    });
    F.objs.forEach(function (o) {
      if (!o.on) return;
      if (o.k === 'pickup' || (o.k === 'obst' && o.kind === 'hidden' && FD.hasAbility(V.S, 'hawk'))) hole(o.x * T + 16, o.y * T + 16, 40, 0.6);
      if (o.k === 'npc' && o.yokai === 'seal_stone') { hole(o.x * T + 16, o.y * T + 10, 60, 0.8); glows.push([o.x * T + 16, o.y * T + 10, 40, '190,140,255']); }
      if (o.k === 'enemy') { var e = root.NYT_ENEMIES.ENEMIES[o.enemies[0]]; if (e && (e.shape === 'wisp' || e.shape === 'chochin' || e.shape === 'firefly' || e.shape === 'jelly')) { hole(((o.fx != null ? o.fx : o.x)) * T + 16, ((o.fy != null ? o.fy : o.y)) * T + 12, 50, 0.7); } }
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(L, 0, 0);
    // あたたかい光
    c.globalCompositeOperation = 'lighter';
    glows.forEach(function (gw) { var p = toS(gw[0], gw[1]), rr = gw[2] * R.s, g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr); g.addColorStop(0, 'rgba(' + gw[3] + ',' + (0.22 * alpha + 0.05) + ')'); g.addColorStop(1, 'rgba(' + gw[3] + ',0)'); c.fillStyle = g; c.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2); });
    c.globalCompositeOperation = 'source-over';
  }
  // 霧の山の、ただよう霧
  function mistLayer(c, V) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    var a = Math.max(0.05, 0.22 - (V.S.flags.ch2_clear ? 0.16 : 0));
    for (var i = 0; i < 7; i++) {
      var x = ((R.t * (12 + i * 3) + i * 300) % (R.cv.width + 600)) - 300, y = (i * 0.14 + 0.08) * R.cv.height;
      var g = c.createRadialGradient(x, y, 0, x, y, 260 * R.dpr); g.addColorStop(0, 'rgba(235,240,250,' + a + ')'); g.addColorStop(1, 'rgba(235,240,250,0)');
      c.fillStyle = g; c.fillRect(x - 260 * R.dpr, y - 260 * R.dpr, 520 * R.dpr, 520 * R.dpr);
    }
  }

  // 画面の点 → マス
  function screenToTile(sx, sy) {
    var wx = (sx - R.vw / 2) / R.zoom + R.cam.x, wy = (sy - R.vh / 2) / R.zoom + R.cam.y;
    return { x: Math.floor(wx / T), y: Math.floor(wy / T) };
  }
  function tileToScreen(x, y) { return { x: R.vw / 2 + ((x + 0.5) * T - R.cam.x) * R.zoom, y: R.vh / 2 + ((y + 0.5) * T - R.cam.y) * R.zoom }; }

  var api = { init: init, resize: resize, setMap: setMap, frame: frame, screenToTile: screenToTile, tileToScreen: tileToScreen, addFx: addFx, dawnLevel: dawnLevel, NIGHT: NIGHT, R: R, T: T };
  root.NYT_RFIELD = api;
})(typeof window !== 'undefined' ? window : globalThis);
