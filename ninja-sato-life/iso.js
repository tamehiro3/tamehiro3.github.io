/* ニンジャ里ライフ — 里の描画（斜め上の固定視点・Canvas 2D）
 * 地面・施設・家具・住民を奥から順に描く。物は種類×向き×レベル×外観ごとに一度だけ描いて使い回す。
 * キャラクターは art.js の SVG を画像にしてから使う（同じ描画エンジンでシートと一致）。
 */
(function (root) {
  'use strict';
  var D = root.NSL_DATA, R = root.NSL_RULES, CH = root.NSL_CHARS, A = root.NinjaArt;
  var HW = 32, HH = 16;           // タイルの半分の幅・高さ（ズーム1）
  var OUT = '#3a2a1e';
  var DPR = Math.min(2, (root.devicePixelRatio || 1));

  function iso(x, y) { return { x: (x - y) * HW, y: (x + y) * HH }; }
  function unIso(sx, sy) { var a = sx / HW, b = sy / HH; return { x: (a + b) / 2, y: (b - a) / 2 }; }
  function mix(a, b, t) { return A.util.mix(a, b, t); }
  function dk(c, t) { return A.util.dk(c, t == null ? 0.18 : t); }
  function lt(c, t) { return A.util.lt(c, t == null ? 0.2 : t); }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = n * 0x27d4eb2d; n = n ^ (n >>> 15); return (n >>> 0) / 4294967295; }

  /* ---------- 外観テーマ（生産性能は共通・見た目だけ） ---------- */
  var THEMES = {
    standard: { roof: '#56627a', roof2: '#434e63', ridge: '#343c4d', wall: '#f2ece0', wood: '#a8784a', trim: '#6e4a2c' },
    kusa: { roof: '#c8a45c', roof2: '#a98844', ridge: '#8c6e34', wall: '#efe6d2', wood: '#a8784a', trim: '#6e4a2c', thatch: true },
    yozakura: { roof: '#6c4d7e', roof2: '#553b66', ridge: '#3e2a4c', wall: '#f6e6ee', wood: '#8f5a52', trim: '#5e3438', petals: true },
    yuki: { roof: '#eef4fa', roof2: '#cfdcea', ridge: '#aebfd2', wall: '#f4f1ea', wood: '#9a7250', trim: '#63452e', snow: true }
  };

  /* ---------- 描画の道具（ローカル座標：タイル単位＋高さpx） ---------- */
  function G(ctx) { this.c = ctx; }
  G.prototype.P = function (x, y, z) { return { x: (x - y) * HW, y: (x + y) * HH - (z || 0) }; };
  G.prototype.poly = function (pts, fill, stroke, lw) {
    var c = this.c; c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke !== false) { c.strokeStyle = stroke || OUT; c.lineWidth = lw || 1.6; c.lineJoin = 'round'; c.stroke(); }
  };
  G.prototype.line = function (pts, col, lw) {
    var c = this.c; c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.strokeStyle = col; c.lineWidth = lw || 1.5; c.lineCap = 'round'; c.stroke();
  };
  // 直方体 [x0,x0+w]×[y0,y0+d]、高さ z0..z0+h
  G.prototype.box = function (x0, y0, w, d, z0, h, col, o) {
    o = o || {};
    var P = this.P.bind(this), z1 = z0 + h;
    var top = [P(x0, y0, z1), P(x0 + w, y0, z1), P(x0 + w, y0 + d, z1), P(x0, y0 + d, z1)];
    var left = [P(x0, y0 + d, z0), P(x0 + w, y0 + d, z0), P(x0 + w, y0 + d, z1), P(x0, y0 + d, z1)];
    var right = [P(x0 + w, y0, z0), P(x0 + w, y0 + d, z0), P(x0 + w, y0 + d, z1), P(x0 + w, y0, z1)];
    this.poly(left, o.left || col, o.stroke, o.lw);
    this.poly(right, o.right || dk(col, 0.16), o.stroke, o.lw);
    if (!o.noTop) this.poly(top, o.top || lt(col, 0.12), o.stroke, o.lw);
    return { top: top, left: left, right: right };
  };
  G.prototype.cyl = function (x, y, z0, r, h, col, o) {
    o = o || {};
    var c = this.c, b = this.P(x, y, z0), t = this.P(x, y, z0 + h), ry = r * 0.5;
    c.beginPath(); c.moveTo(b.x - r, t.y); c.lineTo(b.x - r, b.y); c.ellipse(b.x, b.y, r, ry, 0, Math.PI, 0, true); c.lineTo(b.x + r, t.y); c.closePath();
    var gr = c.createLinearGradient(b.x - r, 0, b.x + r, 0); gr.addColorStop(0, lt(col, 0.12)); gr.addColorStop(0.6, col); gr.addColorStop(1, dk(col, 0.2));
    c.fillStyle = gr; c.fill(); c.strokeStyle = o.stroke || OUT; c.lineWidth = o.lw || 1.5; c.stroke();
    if (!o.noTop) { c.beginPath(); c.ellipse(t.x, t.y, r, ry, 0, 0, Math.PI * 2); c.fillStyle = o.top || lt(col, 0.18); c.fill(); c.stroke(); }
  };
  G.prototype.ell = function (x, y, z, rx, ry, fill, stroke, lw) {
    var c = this.c, p = this.P(x, y, z); c.beginPath(); c.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke !== false) { c.strokeStyle = stroke || OUT; c.lineWidth = lw || 1.5; c.stroke(); }
  };
  G.prototype.ball = function (x, y, z, r, col, o) { // 木の葉のかたまり
    o = o || {};
    var c = this.c, p = this.P(x, y, z);
    c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2);
    var gr = c.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
    gr.addColorStop(0, lt(col, 0.28)); gr.addColorStop(0.7, col); gr.addColorStop(1, dk(col, 0.14));
    c.fillStyle = gr; c.fill(); c.strokeStyle = o.stroke || OUT; c.lineWidth = 1.5; c.stroke();
  };
  G.prototype.shadow = function (x, y, rx, ry, a) { var c = this.c, p = this.P(x, y, 0); c.beginPath(); c.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = 'rgba(40,30,20,' + (a || 0.18) + ')'; c.fill(); };
  // 切妻屋根：ridge が 'x' なら x方向に棟
  G.prototype.roof = function (x0, y0, w, d, z, h, ov, axis, th, o) {
    o = o || {};
    var P = this.P.bind(this), col = o.col || th.roof, col2 = o.col2 || th.roof2;
    if (axis === 'x') {
      var ym = y0 + d / 2;
      var back = [P(x0 - ov, y0 - ov, z), P(x0 + w + ov, y0 - ov, z), P(x0 + w + ov, ym, z + h), P(x0 - ov, ym, z + h)];
      var front = [P(x0 - ov, ym, z + h), P(x0 + w + ov, ym, z + h), P(x0 + w + ov, y0 + d + ov, z), P(x0 - ov, y0 + d + ov, z)];
      var gab = [P(x0 + w, y0, z), P(x0 + w, y0 + d, z), P(x0 + w, ym, z + h)];
      this.poly(back, col2); this.poly(gab, o.gable || th.wall); this.poly(front, col);
      this.tiles(front, th, 'x');
      this.line([P(x0 - ov - 0.05, ym, z + h + 2), P(x0 + w + ov + 0.05, ym, z + h + 2)], th.ridge, 5);
      if (th.snow) this.poly([P(x0 - ov, ym, z + h + 1), P(x0 + w + ov, ym, z + h + 1), P(x0 + w + ov, ym + 0.35, z + h * 0.7), P(x0 - ov, ym + 0.35, z + h * 0.7)], '#ffffff', '#b9c8d8');
    } else {
      var xm = x0 + w / 2;
      var back2 = [P(x0 - ov, y0 - ov, z), P(xm, y0 - ov, z + h), P(xm, y0 + d + ov, z + h), P(x0 - ov, y0 + d + ov, z)];
      var front2 = [P(xm, y0 - ov, z + h), P(x0 + w + ov, y0 - ov, z), P(x0 + w + ov, y0 + d + ov, z), P(xm, y0 + d + ov, z + h)];
      var gab2 = [P(x0, y0 + d, z), P(x0 + w, y0 + d, z), P(xm, y0 + d, z + h)];
      this.poly(back2, col2); this.poly(gab2, o.gable || th.wall); this.poly(front2, col);
      this.tiles(front2, th, 'y');
      this.line([P(xm, y0 - ov - 0.05, z + h + 2), P(xm, y0 + d + ov + 0.05, z + h + 2)], th.ridge, 5);
      if (th.snow) this.poly([P(xm, y0 - ov, z + h + 1), P(xm, y0 + d + ov, z + h + 1), P(xm + 0.35, y0 + d + ov, z + h * 0.7), P(xm + 0.35, y0 - ov, z + h * 0.7)], '#ffffff', '#b9c8d8');
    }
  };
  G.prototype.tiles = function (face, th, axis) { // 瓦・草ぶきの筋
    var c = this.c, a = face[0], b = face[1], cc = face[2], d = face[3];
    c.save(); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(cc.x, cc.y); c.lineTo(d.x, d.y); c.closePath(); c.clip();
    c.strokeStyle = th.thatch ? 'rgba(90,60,20,.35)' : (th.snow ? 'rgba(120,150,180,.35)' : 'rgba(20,24,34,.35)'); c.lineWidth = 1.2;
    var n = 7;
    for (var i = 1; i < n; i++) {
      var t = i / n, p1 = { x: a.x + (d.x - a.x) * t, y: a.y + (d.y - a.y) * t }, p2 = { x: b.x + (cc.x - b.x) * t, y: b.y + (cc.y - b.y) * t };
      c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
    }
    if (!th.thatch) for (var j = 1; j < 10; j++) { var u = j / 10, q1 = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, q2 = { x: d.x + (cc.x - d.x) * u, y: d.y + (cc.y - d.y) * u }; c.beginPath(); c.moveTo(q1.x, q1.y); c.lineTo(q2.x, q2.y); c.stroke(); }
    if (th.petals) { c.fillStyle = '#f7c6d8'; for (var k = 0; k < 14; k++) { var r1 = hash(k * 13 + 7), r2 = hash(k * 31 + 3); c.beginPath(); c.ellipse(a.x + (b.x - a.x) * r1 + (d.x - a.x) * r2, a.y + (b.y - a.y) * r1 + (d.y - a.y) * r2, 2.4, 1.6, 0.4, 0, Math.PI * 2); c.fill(); } }
    c.restore();
  };

  /* ---------- 物の絵 ---------- */
  // 各関数は footprint (w,h) のローカル座標で描く。rot は向き（0..3）
  var DRAW = {};
  function doorSide(rot) { return rot % 4; } // 0:手前左(+y) 1:手前右(+x) 2:奥(-y) 3:奥(-x)
  DRAW.koya = function (g, w, h, rot, lv, th) {
    g.shadow(w / 2 + 0.1, h / 2 + 0.1, 58, 30);
    g.box(0.15, 0.15, w - 0.3, h - 0.3, 0, 6, '#9c8a72'); // 土台
    g.box(0.25, 0.25, w - 0.5, h - 0.5, 6, 34, th.wall, { left: th.wall, right: dk(th.wall, 0.1) });
    // 柱
    [[0.25, h - 0.25], [w - 0.25, h - 0.25], [w - 0.25, 0.25]].forEach(function (p) { g.line([g.P(p[0], p[1], 6), g.P(p[0], p[1], 40)], th.trim, 3.4); });
    var ds = doorSide(rot);
    if (ds === 0) { // 手前左の面に戸
      var dx0 = w * 0.34, dx1 = w * 0.66;
      g.poly([g.P(dx0, h - 0.25, 6), g.P(dx1, h - 0.25, 6), g.P(dx1, h - 0.25, 30), g.P(dx0, h - 0.25, 30)], '#7a5230');
      g.line([g.P((dx0 + dx1) / 2, h - 0.25, 7), g.P((dx0 + dx1) / 2, h - 0.25, 29)], '#5a3a20', 1.4);
      g.poly([g.P(w - 0.5, h - 0.25, 16), g.P(w - 0.28, h - 0.25, 16), g.P(w - 0.28, h - 0.25, 28), g.P(w - 0.5, h - 0.25, 28)], '#e9dcc0');
    } else if (ds === 1) {
      var dy0 = h * 0.34, dy1 = h * 0.66;
      g.poly([g.P(w - 0.25, dy0, 6), g.P(w - 0.25, dy1, 6), g.P(w - 0.25, dy1, 30), g.P(w - 0.25, dy0, 30)], '#7a5230');
      g.poly([g.P(0.5, h - 0.25, 16), g.P(0.9, h - 0.25, 16), g.P(0.9, h - 0.25, 28), g.P(0.5, h - 0.25, 28)], '#e9dcc0');
    } else {
      g.poly([g.P(0.6, h - 0.25, 16), g.P(1.1, h - 0.25, 16), g.P(1.1, h - 0.25, 28), g.P(0.6, h - 0.25, 28)], '#e9dcc0');
      g.poly([g.P(w - 0.25, 0.6, 16), g.P(w - 0.25, 1.1, 16), g.P(w - 0.25, 1.1, 28), g.P(w - 0.25, 0.6, 28)], '#e9dcc0');
    }
    g.roof(0.25, 0.25, w - 0.5, h - 0.5, 40, 22, 0.28, rot % 2 ? 'y' : 'x', th);
    if (lv >= 2) { var fl = g.P(w * 0.5, h * 0.5, 66); g.c.fillStyle = '#e0b23c'; g.c.beginPath(); g.c.arc(fl.x, fl.y - 4, 3.2, 0, 7); g.c.fill(); }
    if (lv >= 3) g.box(w - 0.2, 0.3, 0.12, 0.5, 6, 20, '#8a5a36');
  };
  DRAW.hatake = function (g, w, h, rot, lv, th, st) {
    g.box(0.08, 0.08, w - 0.16, h - 0.16, 0, 5, '#8a6340', { top: '#9a7048' });
    var rows = 4, ready = st && st.ready, grow = st ? st.grow : 0.5;
    for (var r = 0; r < rows; r++) {
      var ry = 0.3 + r * (h - 0.6) / (rows - 1);
      g.line([g.P(0.25, ry, 6), g.P(w - 0.25, ry, 6)], '#6e4a2c', 3);
      for (var i = 0; i < 4; i++) {
        var px = 0.35 + i * (w - 0.7) / 3, p = g.P(px, ry, 6), s = 3 + 5 * Math.max(0.2, grow);
        var c = g.c;
        c.fillStyle = '#5fa546'; c.strokeStyle = '#2f5a24'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x - s, p.y - s * 0.6, p.x - s * 0.4, p.y - s * 1.5); c.quadraticCurveTo(p.x, p.y - s * 0.6, p.x, p.y); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x + s, p.y - s * 0.6, p.x + s * 0.5, p.y - s * 1.6); c.quadraticCurveTo(p.x + 0.5, p.y - s * 0.7, p.x, p.y); c.fillStyle = '#74b957'; c.fill(); c.stroke();
        if (ready) { c.fillStyle = ['#f4f1ea', '#f5d24a', '#e98ab0'][(r + i) % 3]; c.beginPath(); c.arc(p.x + 1, p.y - s * 1.6, 2.4, 0, 7); c.fill(); }
      }
    }
    // 立て札
    var sp = g.P(w - 0.12, 0.2, 5);
    g.c.fillStyle = '#b98a57'; g.c.strokeStyle = OUT; g.c.lineWidth = 1.3; g.c.fillRect(sp.x - 1.5, sp.y - 18, 3, 18); g.c.strokeRect(sp.x - 1.5, sp.y - 18, 3, 18);
    g.c.fillRect(sp.x - 9, sp.y - 26, 18, 10); g.c.strokeRect(sp.x - 9, sp.y - 26, 18, 10);
    g.c.fillStyle = '#4a7a3a'; g.c.font = 'bold 8px sans-serif'; g.c.textAlign = 'center'; g.c.fillText('薬', sp.x, sp.y - 18);
    if (lv >= 2) g.c.fillText(lv === 2 ? '弐' : '参', sp.x + 14, sp.y - 18);
  };
  DRAW.chaya = function (g, w, h, rot, lv, th) {
    g.shadow(w / 2, h / 2, 58, 30);
    g.box(0.2, 0.2, w - 0.4, 0.9, 0, 30, th.wall, { right: dk(th.wall, 0.1) });
    g.roof(0.2, 0.2, w - 0.4, 0.9, 30, 14, 0.18, 'x', th);
    // のれん
    var n0 = g.P(0.45, 1.12, 26), n1 = g.P(w - 0.45, 1.12, 26);
    g.poly([n0, n1, { x: n1.x, y: n1.y + 12 }, { x: n0.x, y: n0.y + 12 }], '#2f4a7a');
    g.c.fillStyle = '#f4f1ea'; g.c.font = 'bold 9px sans-serif'; g.c.textAlign = 'center'; g.c.fillText('茶', (n0.x + n1.x) / 2, (n0.y + n1.y) / 2 + 9);
    // 縁台と毛氈
    g.box(0.35, 1.45, w - 0.7, 0.4, 0, 9, '#a8784a');
    g.box(0.4, 1.47, w - 0.8, 0.36, 9, 2, '#d8452c');
    // 野点傘
    var pole = g.P(w - 0.45, 1.65, 0), top = g.P(w - 0.45, 1.65, 58);
    g.line([pole, top], '#7a5230', 2.6);
    var c = g.c; c.beginPath(); c.moveTo(top.x, top.y - 8); c.lineTo(top.x + 30, top.y + 10); c.quadraticCurveTo(top.x, top.y + 18, top.x - 30, top.y + 10); c.closePath(); c.fillStyle = '#d8452c'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.6; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.35)'; for (var i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(top.x, top.y - 7); c.lineTo(top.x + i * 13, top.y + 12); c.stroke(); }
    if (lv >= 2) { var t = g.P(0.6, 1.65, 11); c.fillStyle = '#f4f1ea'; c.beginPath(); c.ellipse(t.x, t.y, 4, 2, 0, 0, 7); c.fill(); c.stroke(); }
  };
  DRAW.souko = function (g, w, h, rot, lv, th) {
    g.shadow(w / 2, h / 2, 56, 29);
    g.box(0.2, 0.2, w - 0.4, h - 0.4, 0, 10, '#3a3a40');
    g.box(0.22, 0.22, w - 0.44, h - 0.44, 10, 34, '#f4f1ea', { right: '#dcd6c9' });
    var ds = doorSide(rot);
    if (ds === 0 || ds === 2) { var a = g.P(w * 0.3, h - 0.22, 10), b = g.P(w * 0.7, h - 0.22, 10); g.poly([a, b, { x: b.x, y: b.y - 26 }, { x: a.x, y: a.y - 26 }], '#6a5a4a'); g.line([{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 26 }], '#3a2a1e', 1.4); }
    else { var a2 = g.P(w - 0.22, h * 0.3, 10), b2 = g.P(w - 0.22, h * 0.7, 10); g.poly([a2, b2, { x: b2.x, y: b2.y - 26 }, { x: a2.x, y: a2.y - 26 }], '#6a5a4a'); }
    // なまこ壁風の格子
    var c = g.c; c.strokeStyle = 'rgba(80,80,90,.35)'; c.lineWidth = 1;
    for (var i = 1; i < 4; i++) { var p1 = g.P(0.22 + i * (w - 0.44) / 4, h - 0.22, 12), p2 = g.P(0.22 + i * (w - 0.44) / 4, h - 0.22, 20); c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke(); }
    g.roof(0.2, 0.2, w - 0.4, h - 0.4, 44, 18, 0.22, rot % 2 ? 'y' : 'x', th);
    var lp = g.P(w * 0.5, h - 0.22, 38); c.fillStyle = '#2a2a2e'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.fillText(['', '壱', '弐', '参'][lv] || '', lp.x, lp.y);
  };
  DRAW.shugyoba = function (g, w, h, rot, lv, th) {
    g.box(0.05, 0.05, w - 0.1, h - 0.1, 0, 3, '#d8c49a', { top: '#e3d2a8' });
    var c = g.c;
    // 砂の模様
    c.strokeStyle = 'rgba(160,130,80,.5)'; c.lineWidth = 1;
    for (var i = 1; i < 6; i++) { var a = g.P(0.3, i * h / 6, 3), b = g.P(w - 0.3, i * h / 6, 3); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    // 杭の柵
    for (var k = 0; k <= 6; k++) { var t = k / 6; [[t * w, 0.05], [w - 0.05, t * h]].forEach(function (p) { g.cyl(p[0], p[1], 0, 2.4, 14, '#a8784a', { lw: 1.1 }); }); }
    g.line([g.P(0.05, 0.05, 11), g.P(w - 0.05, 0.05, 11), g.P(w - 0.05, h - 0.05, 11)], '#c8a060', 2);
    // 巻藁
    g.cyl(w * 0.35, h * 0.4, 3, 6, 34, '#d9c089'); for (var j = 0; j < 3; j++) { var q = g.P(w * 0.35, h * 0.4, 12 + j * 8); c.strokeStyle = '#8a6a3a'; c.lineWidth = 2; c.beginPath(); c.ellipse(q.x, q.y, 6, 3, 0, 0, Math.PI); c.stroke(); }
    // 的
    var mp = g.P(w * 0.7, h * 0.3, 3); g.line([mp, { x: mp.x, y: mp.y - 30 }], '#7a5230', 3);
    c.beginPath(); c.arc(mp.x, mp.y - 36, 10, 0, 7); c.fillStyle = '#f4f1ea'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.arc(mp.x, mp.y - 36, 6, 0, 7); c.fillStyle = '#d8452c'; c.fill(); c.beginPath(); c.arc(mp.x, mp.y - 36, 2.4, 0, 7); c.fillStyle = '#f4f1ea'; c.fill();
    // のぼり
    var fp = g.P(w - 0.3, h - 0.3, 3); g.line([fp, { x: fp.x, y: fp.y - 52 }], '#6e4a2c', 2.4);
    g.poly([{ x: fp.x, y: fp.y - 50 }, { x: fp.x + 14, y: fp.y - 50 }, { x: fp.x + 14, y: fp.y - 18 }, { x: fp.x, y: fp.y - 22 }], lv >= 2 ? '#d8452c' : '#2f4a7a');
    c.fillStyle = '#f4f1ea'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.fillText('修', fp.x + 7, fp.y - 38); c.fillText('行', fp.x + 7, fp.y - 27);
  };

  DRAW.chochin = function (g, w, h, rot, lv, th, st) {
    g.shadow(0.5, 0.5, 12, 6);
    g.cyl(0.5, 0.5, 0, 2.2, 30, '#6e4a2c', { lw: 1.2 });
    var p = g.P(0.5, 0.5, 42), c = g.c;
    if (st && st.night !== false) { var gr = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, 30); gr.addColorStop(0, 'rgba(255,190,110,.55)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); c.fillStyle = gr; c.beginPath(); c.arc(p.x, p.y, 30, 0, 7); c.fill(); }
    c.beginPath(); c.ellipse(p.x, p.y, 9, 12, 0, 0, 7); c.fillStyle = '#e8553a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = 'rgba(120,30,20,.5)'; c.lineWidth = 1; for (var i = -1; i <= 1; i++) { c.beginPath(); c.ellipse(p.x, p.y + i * 5, 8.6, 2, 0, 0, Math.PI); c.stroke(); }
    c.fillStyle = '#2a2226'; c.fillRect(p.x - 5, p.y - 14, 10, 3); c.fillRect(p.x - 5, p.y + 11, 10, 3);
    c.fillStyle = 'rgba(255,230,180,.55)'; c.beginPath(); c.ellipse(p.x - 3, p.y - 3, 2.5, 5, 0, 0, 7); c.fill();
  };
  DRAW.bonbori = function (g) {
    g.shadow(0.5, 0.5, 12, 6);
    g.cyl(0.5, 0.5, 0, 2.2, 24, '#2a2226', { lw: 1.2 });
    var p = g.P(0.5, 0.5, 38), c = g.c;
    var gr = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, 28); gr.addColorStop(0, 'rgba(255,220,160,.55)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); c.fillStyle = gr; c.beginPath(); c.arc(p.x, p.y, 28, 0, 7); c.fill();
    c.beginPath(); c.moveTo(p.x - 8, p.y - 12); c.lineTo(p.x + 8, p.y - 12); c.lineTo(p.x + 10, p.y + 10); c.lineTo(p.x - 10, p.y + 10); c.closePath(); c.fillStyle = '#fbf3e0'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#f2a9c0'; c.beginPath(); c.arc(p.x, p.y, 3.4, 0, 7); c.fill();
    c.fillStyle = '#2a2226'; c.fillRect(p.x - 10, p.y - 16, 20, 4);
  };
  DRAW.ishidoro = function (g) {
    g.shadow(0.5, 0.5, 14, 7);
    g.box(0.3, 0.3, 0.4, 0.4, 0, 6, '#a9a59c');
    g.cyl(0.5, 0.5, 6, 3.4, 14, '#b8b4ab', { lw: 1.3 });
    g.box(0.28, 0.28, 0.44, 0.44, 20, 12, '#c2beb4');
    var c = g.c, p = g.P(0.5, 0.72, 26); c.fillStyle = '#ffd98a'; c.fillRect(p.x - 4, p.y - 4, 8, 6);
    var t = g.P(0.5, 0.5, 34);
    c.beginPath(); c.moveTo(t.x - 16, t.y + 4); c.lineTo(t.x, t.y - 9); c.lineTo(t.x + 16, t.y + 4); c.lineTo(t.x, t.y + 10); c.closePath(); c.fillStyle = '#9d998f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(t.x, t.y - 11, 3, 0, 7); c.fillStyle = '#a9a59c'; c.fill(); c.stroke();
  };
  DRAW.endai = function (g, w, h) {
    g.shadow(w / 2, h / 2, 30, 14);
    var legs = [[0.2, 0.3], [w - 0.2, 0.3], [0.2, h - 0.3], [w - 0.2, h - 0.3]];
    legs.forEach(function (l) { g.box(l[0] - 0.05, l[1] - 0.05, 0.1, 0.1, 0, 10, '#7a5230', { lw: 1 }); });
    g.box(0.1, 0.2, w - 0.2, h - 0.4, 10, 3, '#a8784a');
    g.box(0.18, 0.24, w - 0.36, h - 0.48, 13, 1.5, '#d8452c', { lw: 1.2 });
  };
  DRAW.mosen = function (g, w, h) {
    g.box(0.1, 0.15, w - 0.2, h - 0.3, 0, 2, '#d8452c', { lw: 1.2 });
    var c = g.c, p = g.P(w * 0.3, h * 0.5, 3); c.fillStyle = '#f4f1ea'; c.beginPath(); c.ellipse(p.x, p.y, 6, 3, 0, 0, 7); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
    var q = g.P(w * 0.62, h * 0.5, 3); g.cyl(w * 0.62, h * 0.5, 3, 4, 7, '#2f5a4a', { lw: 1.1 });
    var um = g.P(w - 0.3, h * 0.3, 0); g.line([um, { x: um.x, y: um.y - 50 }], '#7a5230', 2.4);
    c.beginPath(); c.moveTo(um.x, um.y - 58); c.lineTo(um.x + 26, um.y - 42); c.quadraticCurveTo(um.x, um.y - 36, um.x - 26, um.y - 42); c.closePath(); c.fillStyle = '#d8452c'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
  };
  DRAW.takegaki = function (g, w, h, rot) {
    var c = g.c, along = rot % 2 ? 'y' : 'x';
    for (var i = 0; i < 5; i++) {
      var t = 0.1 + i * 0.2, x = along === 'x' ? t : 0.5, y = along === 'x' ? 0.5 : t;
      g.cyl(x, y, 0, 3, 22 + (i % 2) * 4, '#9cbf6a', { lw: 1.1, top: '#c8e09a' });
    }
    var a = along === 'x' ? [g.P(0.05, 0.5, 9), g.P(0.95, 0.5, 9)] : [g.P(0.5, 0.05, 9), g.P(0.5, 0.95, 9)];
    var b = along === 'x' ? [g.P(0.05, 0.5, 17), g.P(0.95, 0.5, 17)] : [g.P(0.5, 0.05, 17), g.P(0.5, 0.95, 17)];
    g.line(a, '#6e8a44', 3); g.line(b, '#6e8a44', 3);
  };
  DRAW.matsu = function (g) {
    g.shadow(0.5, 0.5, 20, 10);
    var c = g.c, b = g.P(0.5, 0.5, 0);
    c.beginPath(); c.moveTo(b.x - 4, b.y); c.quadraticCurveTo(b.x - 8, b.y - 20, b.x + 2, b.y - 34); c.lineTo(b.x + 6, b.y - 33); c.quadraticCurveTo(b.x, b.y - 18, b.x + 4, b.y); c.closePath(); c.fillStyle = '#7a5a3a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    [[0.25, 0.55, 30, 11], [0.72, 0.5, 38, 12], [0.45, 0.35, 50, 13], [0.55, 0.6, 58, 10]].forEach(function (p) {
      var q = g.P(p[0], p[1], p[2]); c.beginPath(); c.ellipse(q.x, q.y, p[3] * 1.6, p[3] * 0.8, 0, 0, 7); c.fillStyle = '#3f7a45'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
      c.beginPath(); c.ellipse(q.x - 3, q.y - 3, p[3], p[3] * 0.4, 0, 0, 7); c.fillStyle = '#5a9a58'; c.fill();
    });
  };
  DRAW.sakura = function (g) {
    g.shadow(0.5, 0.5, 22, 11);
    g.cyl(0.5, 0.5, 0, 3.4, 28, '#7a5a4a', { lw: 1.3 });
    [[0.35, 0.55, 40, 16], [0.7, 0.45, 42, 15], [0.5, 0.4, 56, 17], [0.45, 0.62, 50, 13]].forEach(function (p) { g.ball(p[0], p[1], p[2], p[3], '#f5b7cc'); });
    var c = g.c; c.fillStyle = '#fbe3ec';
    for (var i = 0; i < 16; i++) { var q = g.P(0.2 + hash(i * 3) * 0.6, 0.2 + hash(i * 7) * 0.6, 38 + hash(i * 11) * 26); c.beginPath(); c.arc(q.x, q.y, 1.8, 0, 7); c.fill(); }
    c.fillStyle = '#f5b7cc'; for (var j = 0; j < 5; j++) { var r = g.P(0.1 + hash(j * 5) * 0.8, 0.1 + hash(j * 9) * 0.8, 0); c.beginPath(); c.ellipse(r.x, r.y, 2, 1.2, 0.5, 0, 7); c.fill(); }
  };
  DRAW.kadan = function (g) {
    g.box(0.12, 0.12, 0.76, 0.76, 0, 7, '#a8784a');
    var c = g.c, cols = ['#e8553a', '#f5d24a', '#f2a9c0', '#9b6ad0', '#f4f1ea'];
    for (var i = 0; i < 9; i++) {
      var q = g.P(0.22 + (i % 3) * 0.28, 0.22 + Math.floor(i / 3) * 0.28, 8);
      c.strokeStyle = '#3f7a35'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x, q.y - 7); c.stroke();
      c.fillStyle = cols[i % cols.length]; c.beginPath(); c.arc(q.x, q.y - 8, 3.2, 0, 7); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
    }
  };
  DRAW.niwaishi = function (g) {
    g.shadow(0.5, 0.5, 18, 8);
    var c = g.c, p = g.P(0.5, 0.5, 0);
    c.beginPath(); c.moveTo(p.x - 18, p.y); c.quadraticCurveTo(p.x - 20, p.y - 16, p.x - 6, p.y - 22); c.quadraticCurveTo(p.x + 8, p.y - 26, p.x + 16, p.y - 12); c.quadraticCurveTo(p.x + 20, p.y - 2, p.x + 12, p.y + 3); c.quadraticCurveTo(p.x, p.y + 6, p.x - 18, p.y); c.closePath();
    c.fillStyle = '#a9a59c'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#7fae5a'; c.beginPath(); c.ellipse(p.x - 4, p.y - 19, 9, 4, -0.2, 0, 7); c.fill();
    c.strokeStyle = 'rgba(80,76,70,.5)'; c.beginPath(); c.moveTo(p.x + 4, p.y - 14); c.lineTo(p.x + 10, p.y - 4); c.stroke();
  };
  DRAW.koike = function (g, w, h) {
    var c = g.c;
    var cx = w / 2, cy = h / 2, P = g.P(cx, cy, 0);
    c.beginPath(); c.ellipse(P.x, P.y, (w + h) * HW * 0.48, (w + h) * HH * 0.46, 0, 0, 7); c.fillStyle = '#9d998f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.ellipse(P.x, P.y + 1, (w + h) * HW * 0.4, (w + h) * HH * 0.37, 0, 0, 7);
    var gr = c.createLinearGradient(P.x, P.y - 20, P.x, P.y + 20); gr.addColorStop(0, '#8fd0ea'); gr.addColorStop(1, '#5aaed4'); c.fillStyle = gr; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(P.x - 14, P.y - 4, 14, 3, 0, 0, Math.PI); c.stroke();
    c.fillStyle = '#6fae5a'; [[-22, 6], [18, -6]].forEach(function (l) { c.beginPath(); c.ellipse(P.x + l[0], P.y + l[1], 7, 3.6, 0, 0.3, 6); c.lineTo(P.x + l[0], P.y + l[1]); c.fill(); });
    c.fillStyle = '#f08a3a'; c.beginPath(); c.ellipse(P.x + 6, P.y + 6, 5, 2.4, 0.3, 0, 7); c.fill(); c.beginPath(); c.moveTo(P.x + 1, P.y + 5); c.lineTo(P.x - 3, P.y + 2); c.lineTo(P.x - 3, P.y + 8); c.fill();
    [[-0.3, 0.1], [0.1, -0.35], [w - 0.05, h * 0.5], [w * 0.5, h + 0.05]].forEach(function (s, i) { var q = g.P(s[0] + (s[0] < 0 ? w * 0.4 : 0), s[1] + (s[1] < 0 ? h * 0.4 : 0), 0); c.beginPath(); c.ellipse(q.x, q.y, 6, 3.4, 0, 0, 7); c.fillStyle = '#b8b4ab'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.1; c.stroke(); });
  };
  DRAW.shishiodoshi = function (g) {
    g.shadow(0.5, 0.5, 14, 7);
    var c = g.c;
    g.ell(0.55, 0.62, 0, 12, 6, '#9d998f'); g.ell(0.55, 0.62, 1, 8, 4, '#6ab4d8', false);
    var a = g.P(0.3, 0.4, 0); g.line([a, { x: a.x, y: a.y - 22 }], '#8a6a3a', 3); var b = g.P(0.6, 0.3, 0); g.line([b, { x: b.x, y: b.y - 22 }], '#8a6a3a', 3);
    var p1 = { x: a.x - 6, y: a.y - 26 }, p2 = { x: b.x + 10, y: b.y - 12 };
    c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 8; c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
    c.strokeStyle = '#9cbf6a'; c.lineWidth = 5.5; c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
    c.strokeStyle = '#6ab4d8'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(p2.x, p2.y + 2); c.lineTo(p2.x + 2, p2.y + 12); c.stroke();
  };
  DRAW.ido = function (g) {
    g.shadow(0.5, 0.5, 16, 8);
    g.cyl(0.5, 0.5, 0, 13, 14, '#a9a59c', { lw: 1.4, top: '#5a8ab0' });
    var c = g.c, l = g.P(0.18, 0.5, 14), r = g.P(0.82, 0.5, 14);
    g.line([l, { x: l.x, y: l.y - 26 }], '#7a5230', 3); g.line([r, { x: r.x, y: r.y - 26 }], '#7a5230', 3);
    var t = g.P(0.5, 0.5, 40);
    c.beginPath(); c.moveTo(t.x - 22, t.y + 4); c.lineTo(t.x, t.y - 8); c.lineTo(t.x + 22, t.y + 4); c.lineTo(t.x, t.y + 10); c.closePath(); c.fillStyle = '#6e4a2c'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = '#6e4a2c'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(t.x, t.y + 6); c.lineTo(t.x, t.y + 16); c.stroke();
    c.fillStyle = '#a8784a'; c.fillRect(t.x - 4, t.y + 16, 8, 6); c.strokeRect(t.x - 4, t.y + 16, 8, 6);
  };
  DRAW.kobashi = function (g, w, h, rot) {
    var c = g.c, along = rot % 2 ? 'y' : 'x';
    var a = along === 'x' ? [0, 0.2, w, 0.6] : [0.2, 0, 0.6, h];
    var L = along === 'x' ? w : h, pts = [], pts2 = [];
    for (var i = 0; i <= 10; i++) {
      var t = i / 10, z = 4 + Math.sin(t * Math.PI) * 16;
      var x = along === 'x' ? t * w : 0.2, y = along === 'x' ? 0.2 : t * h;
      pts.push(g.P(x, y, z));
      pts2.push(g.P(along === 'x' ? t * w : 0.8, along === 'x' ? 0.8 : t * h, z));
    }
    // 橋の床
    var deck = pts.concat(pts2.slice().reverse());
    g.poly(deck, '#c8583a');
    var under = pts2.map(function (p) { return { x: p.x, y: p.y + 6 }; });
    g.poly(pts2.concat(under.slice().reverse()), '#a8452c');
    // 欄干
    [pts, pts2].forEach(function (row) {
      g.line(row.map(function (p) { return { x: p.x, y: p.y - 10 }; }), OUT, 5); g.line(row.map(function (p) { return { x: p.x, y: p.y - 10 }; }), '#d8452c', 3);
      [0, 5, 10].forEach(function (k) { var p = row[k]; g.line([p, { x: p.x, y: p.y - 11 }], '#b8391f', 2.6); c.fillStyle = '#e0b23c'; c.beginPath(); c.arc(p.x, p.y - 12, 2.2, 0, 7); c.fill(); });
    });
  };
  DRAW.kakashi = function (g) {
    g.shadow(0.5, 0.5, 10, 5);
    var c = g.c, b = g.P(0.5, 0.5, 0);
    g.line([b, { x: b.x, y: b.y - 34 }], '#7a5230', 3);
    g.line([{ x: b.x - 16, y: b.y - 26 }, { x: b.x + 16, y: b.y - 26 }], '#7a5230', 3);
    c.fillStyle = '#6a8ac0'; c.strokeStyle = OUT; c.lineWidth = 1.4; c.beginPath(); c.moveTo(b.x - 12, b.y - 28); c.lineTo(b.x + 12, b.y - 28); c.lineTo(b.x + 8, b.y - 12); c.lineTo(b.x - 8, b.y - 12); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(b.x, b.y - 38, 7, 0, 7); c.fillStyle = '#f4f1ea'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(b.x - 14, b.y - 40); c.lineTo(b.x, b.y - 52); c.lineTo(b.x + 14, b.y - 40); c.closePath(); c.fillStyle = '#d8b46a'; c.fill(); c.stroke();
    c.fillStyle = '#2a2226'; c.fillRect(b.x - 3, b.y - 39, 1.6, 1.6); c.fillRect(b.x + 2, b.y - 39, 1.6, 1.6);
  };
  DRAW.mato = function (g) {
    g.shadow(0.5, 0.5, 12, 6);
    var c = g.c, b = g.P(0.5, 0.5, 0);
    g.line([{ x: b.x - 6, y: b.y }, { x: b.x - 2, y: b.y - 26 }], '#7a5230', 3); g.line([{ x: b.x + 6, y: b.y }, { x: b.x + 2, y: b.y - 26 }], '#7a5230', 3);
    c.beginPath(); c.arc(b.x, b.y - 34, 13, 0, 7); c.fillStyle = '#f4f1ea'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.arc(b.x, b.y - 34, 8.5, 0, 7); c.fillStyle = '#2a2226'; c.fill(); c.beginPath(); c.arc(b.x, b.y - 34, 5, 0, 7); c.fillStyle = '#f4f1ea'; c.fill(); c.beginPath(); c.arc(b.x, b.y - 34, 2.4, 0, 7); c.fillStyle = '#d8452c'; c.fill();
    c.strokeStyle = '#6a6d75'; c.lineWidth = 2; c.beginPath(); c.moveTo(b.x + 4, b.y - 37); c.lineTo(b.x + 10, b.y - 42); c.stroke();
  };
  DRAW.takibi = function (g, w, h, rot, lv, th, st) {
    var c = g.c, b = g.P(0.5, 0.5, 0), t = (st && st.t) || 0;
    [[-10, 2], [10, 2], [0, -4], [-4, 6], [6, 6]].forEach(function (s) { c.beginPath(); c.ellipse(b.x + s[0], b.y + s[1], 5, 3.2, 0, 0, 7); c.fillStyle = '#9d998f'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke(); });
    c.lineCap = 'round'; [[-10, 0, 10, -6], [-8, -6, 10, 2]].forEach(function (l) { c.strokeStyle = OUT; c.lineWidth = 6; c.beginPath(); c.moveTo(b.x + l[0], b.y + l[1]); c.lineTo(b.x + l[2], b.y + l[3]); c.stroke(); c.strokeStyle = '#8a5a36'; c.lineWidth = 4; c.stroke(); });
    var gr = c.createRadialGradient(b.x, b.y - 10, 2, b.x, b.y - 10, 30); gr.addColorStop(0, 'rgba(255,170,80,.5)'); gr.addColorStop(1, 'rgba(255,170,80,0)'); c.fillStyle = gr; c.beginPath(); c.arc(b.x, b.y - 10, 30, 0, 7); c.fill();
    var fl = 1 + 0.12 * Math.sin(t * 9);
    c.beginPath(); c.moveTo(b.x - 9, b.y - 2); c.quadraticCurveTo(b.x - 10, b.y - 16 * fl, b.x, b.y - 26 * fl); c.quadraticCurveTo(b.x + 11, b.y - 14 * fl, b.x + 9, b.y - 2); c.closePath(); c.fillStyle = '#f59a2a'; c.fill(); c.strokeStyle = '#c85a1a'; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.moveTo(b.x - 4, b.y - 3); c.quadraticCurveTo(b.x - 4, b.y - 11 * fl, b.x, b.y - 16 * fl); c.quadraticCurveTo(b.x + 5, b.y - 10 * fl, b.x + 4, b.y - 3); c.closePath(); c.fillStyle = '#ffe27a'; c.fill();
  };
  DRAW.furin = function (g, w, h, rot, lv, th, st) {
    g.shadow(0.5, 0.5, 12, 6);
    var c = g.c, l = g.P(0.25, 0.5, 0), r = g.P(0.75, 0.5, 0), t = (st && st.t) || 0;
    g.line([l, { x: l.x, y: l.y - 38 }], '#7a5230', 3); g.line([r, { x: r.x, y: r.y - 38 }], '#7a5230', 3); g.line([{ x: l.x - 2, y: l.y - 38 }, { x: r.x + 2, y: r.y - 38 }], '#7a5230', 3.4);
    [0.35, 0.5, 0.65].forEach(function (u, i) {
      var p = { x: l.x + (r.x - l.x) * u, y: l.y + (r.y - l.y) * u - 38 }, sw = Math.sin(t * 2 + i) * 2;
      c.strokeStyle = '#6a5a4a'; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + sw, p.y + 8); c.stroke();
      c.beginPath(); c.arc(p.x + sw, p.y + 12, 4, Math.PI, 0); c.lineTo(p.x + sw + 4, p.y + 13); c.lineTo(p.x + sw - 4, p.y + 13); c.closePath(); c.fillStyle = ['rgba(150,210,240,.9)', 'rgba(250,200,120,.9)', 'rgba(240,160,190,.9)'][i]; c.fill(); c.strokeStyle = OUT; c.stroke();
      c.fillStyle = '#f4f1ea'; c.fillRect(p.x + sw - 1.5, p.y + 14, 3, 7);
    });
  };
  DRAW.makimono = function (g) {
    g.shadow(0.5, 0.5, 14, 7);
    g.box(0.2, 0.3, 0.6, 0.4, 0, 34, '#8a5a36');
    var c = g.c;
    for (var r = 0; r < 3; r++) for (var i = 0; i < 3; i++) {
      var p = g.P(0.28 + i * 0.2, 0.72, 6 + r * 10);
      c.beginPath(); c.ellipse(p.x, p.y - 2, 3.4, 3.4, 0, 0, 7); c.fillStyle = ['#f4f1ea', '#e8d8a0', '#c8e0f0'][(r + i) % 3]; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#d8452c'; c.fillRect(p.x - 0.8, p.y - 5.4, 1.6, 1.6);
    }
  };
  DRAW.himono = function (g) {
    g.shadow(0.5, 0.5, 14, 7);
    var c = g.c, l = g.P(0.2, 0.5, 0), r = g.P(0.8, 0.5, 0);
    g.line([l, { x: l.x, y: l.y - 30 }], '#7a5230', 2.6); g.line([r, { x: r.x, y: r.y - 30 }], '#7a5230', 2.6);
    g.line([{ x: l.x, y: l.y - 28 }, { x: r.x, y: r.y - 28 }], '#7a5230', 2.4);
    for (var i = 0; i < 4; i++) {
      var p = { x: l.x + (r.x - l.x) * (0.15 + i * 0.23), y: l.y + (r.y - l.y) * (0.15 + i * 0.23) - 27 };
      c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x + 5, p.y + 8, p.x, p.y + 16); c.quadraticCurveTo(p.x - 5, p.y + 8, p.x, p.y); c.fillStyle = '#c9b48a'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.moveTo(p.x, p.y + 15); c.lineTo(p.x - 3, p.y + 19); c.lineTo(p.x + 3, p.y + 19); c.closePath(); c.fill(); c.stroke();
    }
  };
  DRAW.chikurin = function (g, w, h, rot, lv, th, st) {
    var c = g.c, t = (st && st.t) || 0;
    [[0.25, 0.3, 58], [0.6, 0.25, 66], [0.4, 0.6, 50], [0.75, 0.65, 60], [0.5, 0.45, 72]].forEach(function (s, i) {
      var b = g.P(s[0], s[1], 0), sw = Math.sin(t * 1.3 + i) * 1.5;
      c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = 6.6; c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x + sw, b.y - s[2]); c.stroke();
      c.strokeStyle = '#8fb85a'; c.lineWidth = 4.4; c.stroke();
      for (var k = 1; k < 4; k++) { c.strokeStyle = '#5a7a34'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(b.x - 2.5 + sw * k / 4, b.y - s[2] * k / 4); c.lineTo(b.x + 2.5 + sw * k / 4, b.y - s[2] * k / 4); c.stroke(); }
      for (var j = 0; j < 3; j++) { var ly = b.y - s[2] + j * 8, lx = b.x + sw; c.fillStyle = '#6aa048'; c.beginPath(); c.moveTo(lx, ly); c.quadraticCurveTo(lx + 10, ly - 4, lx + 16, ly + 2); c.quadraticCurveTo(lx + 8, ly + 2, lx, ly); c.fill(); c.beginPath(); c.moveTo(lx, ly + 3); c.quadraticCurveTo(lx - 10, ly - 1, lx - 15, ly + 5); c.quadraticCurveTo(lx - 7, ly + 5, lx, ly + 3); c.fill(); }
    });
  };
  DRAW.tobiishi = function (g) {
    var c = g.c;
    [[0.3, 0.35, 9], [0.68, 0.6, 8], [0.35, 0.75, 6]].forEach(function (s) { var p = g.P(s[0], s[1], 0); c.beginPath(); c.ellipse(p.x, p.y, s[2] * 1.5, s[2] * 0.8, 0, 0, 7); c.fillStyle = '#b8b4ab'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke(); c.beginPath(); c.ellipse(p.x - 2, p.y - 1, s[2] * 0.8, s[2] * 0.35, 0, 0, 7); c.fillStyle = '#cfcbc2'; c.fill(); });
  };
  DRAW.emakake = function (g) {
    g.shadow(0.5, 0.5, 14, 7);
    var c = g.c, l = g.P(0.2, 0.5, 0), r = g.P(0.8, 0.5, 0);
    g.line([l, { x: l.x, y: l.y - 32 }], '#7a5230', 3); g.line([r, { x: r.x, y: r.y - 32 }], '#7a5230', 3);
    g.poly([{ x: l.x - 6, y: l.y - 36 }, { x: r.x + 6, y: r.y - 36 }, { x: r.x + 4, y: r.y - 31 }, { x: l.x - 4, y: l.y - 31 }], '#6e4a2c');
    var cols = ['#f4e2b8', '#f7e8c8', '#f0d9a8', '#f4e2b8'];
    for (var i = 0; i < 4; i++) {
      var p = { x: l.x + (r.x - l.x) * (0.12 + i * 0.25), y: l.y + (r.y - l.y) * (0.12 + i * 0.25) - 26 };
      c.beginPath(); c.moveTo(p.x - 5, p.y - 3); c.lineTo(p.x, p.y - 6); c.lineTo(p.x + 5, p.y - 3); c.lineTo(p.x + 5, p.y + 5); c.lineTo(p.x - 5, p.y + 5); c.closePath(); c.fillStyle = cols[i]; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      c.fillStyle = ['#e8553a', '#4a8ad8', '#5fa546', '#9b6ad0'][i]; c.beginPath(); c.arc(p.x, p.y + 1, 1.8, 0, 7); c.fill();
    }
  };
  DRAW.torii = function (g, w, h, rot) {
    var along = rot % 2 ? 'y' : 'x', c = g.c;
    var a = along === 'x' ? [0.25, 0.5] : [0.5, 0.25], b = along === 'x' ? [w - 0.25, 0.5] : [0.5, h - 0.25];
    g.cyl(a[0], a[1], 0, 4, 52, '#d8452c'); g.cyl(b[0], b[1], 0, 4, 52, '#d8452c');
    var pa = g.P(a[0], a[1], 52), pb = g.P(b[0], b[1], 52);
    var dx = (pb.x - pa.x), dy = (pb.y - pa.y), L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    function beam(off, th, ext, col) { var p1 = { x: pa.x - ux * ext, y: pa.y - uy * ext - off }, p2 = { x: pb.x + ux * ext, y: pb.y + uy * ext - off }; g.poly([p1, p2, { x: p2.x, y: p2.y - th }, { x: p1.x, y: p1.y - th }], col); }
    beam(-8, 5, 4, '#d8452c'); beam(0, 5, 10, '#d8452c'); beam(4, 5, 13, '#2a2226');
  };
  DRAW.dangoya = function (g, w, h, rot) {
    g.shadow(w / 2, h / 2, 30, 15);
    g.box(0.15, 0.2, w - 0.3, h - 0.4, 0, 18, '#a8784a');
    var c = g.c, l = g.P(0.2, 0.25, 18), r = g.P(w - 0.2, 0.25, 18);
    g.line([l, { x: l.x, y: l.y - 26 }], '#7a5230', 2.6); g.line([r, { x: r.x, y: r.y - 26 }], '#7a5230', 2.6);
    var a1 = g.P(0.05, 0.05, 46), a2 = g.P(w - 0.05, 0.05, 46), a3 = g.P(w - 0.05, h - 0.05, 40), a4 = g.P(0.05, h - 0.05, 40);
    g.poly([a1, a2, a3, a4], '#d8452c');
    c.save(); c.beginPath(); c.moveTo(a1.x, a1.y); c.lineTo(a2.x, a2.y); c.lineTo(a3.x, a3.y); c.lineTo(a4.x, a4.y); c.closePath(); c.clip(); c.strokeStyle = '#f4f1ea'; c.lineWidth = 4; for (var i = 0; i < 6; i++) { var t = i / 6 + 0.08; c.beginPath(); c.moveTo(a1.x + (a2.x - a1.x) * t, a1.y + (a2.y - a1.y) * t); c.lineTo(a4.x + (a3.x - a4.x) * t, a4.y + (a3.y - a4.y) * t); c.stroke(); } c.restore();
    // 団子の看板
    var s = g.P(w * 0.5, h - 0.2, 22); var cols = ['#86c46a', '#f5f2ea', '#f4a6c0'];
    c.strokeStyle = '#8a5a36'; c.lineWidth = 2; c.beginPath(); c.moveTo(s.x - 12, s.y + 2); c.lineTo(s.x + 12, s.y - 6); c.stroke();
    for (var k = 0; k < 3; k++) { c.beginPath(); c.arc(s.x - 8 + k * 8, s.y - k * 2.7, 4.5, 0, 7); c.fillStyle = cols[k]; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke(); }
  };
  DRAW.kitsune = function (g) {
    g.shadow(0.5, 0.5, 14, 7);
    g.box(0.25, 0.25, 0.5, 0.5, 0, 12, '#a9a59c');
    var c = g.c, p = g.P(0.5, 0.5, 12);
    c.beginPath(); c.moveTo(p.x - 9, p.y); c.quadraticCurveTo(p.x - 10, p.y - 18, p.x - 4, p.y - 26); c.lineTo(p.x + 4, p.y - 26); c.quadraticCurveTo(p.x + 10, p.y - 18, p.x + 9, p.y); c.closePath(); c.fillStyle = '#f7f5f0'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(p.x, p.y - 30, 7, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(p.x - 7, p.y - 32); c.lineTo(p.x - 5, p.y - 42); c.lineTo(p.x - 1, p.y - 35); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(p.x + 7, p.y - 32); c.lineTo(p.x + 5, p.y - 42); c.lineTo(p.x + 1, p.y - 35); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#d8452c'; c.beginPath(); c.moveTo(p.x - 7, p.y - 22); c.lineTo(p.x + 7, p.y - 22); c.lineTo(p.x, p.y - 13); c.closePath(); c.fill();
    c.strokeStyle = '#d8452c'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(p.x - 3, p.y - 31); c.lineTo(p.x - 1, p.y - 30); c.moveTo(p.x + 3, p.y - 31); c.lineTo(p.x + 1, p.y - 30); c.stroke();
    c.beginPath(); c.moveTo(p.x + 8, p.y - 4); c.quadraticCurveTo(p.x + 18, p.y - 8, p.x + 14, p.y - 22); c.strokeStyle = OUT; c.lineWidth = 5; c.stroke(); c.strokeStyle = '#f7f5f0'; c.lineWidth = 3; c.stroke();
  };
  DRAW.manekineko = function (g) {
    g.shadow(0.5, 0.5, 12, 6);
    g.box(0.28, 0.28, 0.44, 0.44, 0, 8, '#d8452c');
    var c = g.c, p = g.P(0.5, 0.5, 8);
    c.beginPath(); c.ellipse(p.x, p.y - 10, 10, 11, 0, 0, 7); c.fillStyle = '#f7f5f0'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(p.x, p.y - 26, 9, 0, 7); c.fill(); c.stroke();
    [[-1], [1]].forEach(function (s) { c.beginPath(); c.moveTo(p.x + s[0] * 8, p.y - 30); c.lineTo(p.x + s[0] * 7, p.y - 39); c.lineTo(p.x + s[0] * 2, p.y - 33); c.closePath(); c.fillStyle = '#f7f5f0'; c.fill(); c.stroke(); });
    c.beginPath(); c.ellipse(p.x + 10, p.y - 30, 4, 5, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#e0b23c'; c.beginPath(); c.arc(p.x, p.y - 14, 3.4, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#d8452c'; c.fillRect(p.x - 7, p.y - 20, 14, 2.4);
    c.fillStyle = '#2a2226'; c.beginPath(); c.arc(p.x - 3, p.y - 26, 1.2, 0, 7); c.arc(p.x + 3, p.y - 26, 1.2, 0, 7); c.fill();
    c.fillStyle = '#f5a04a'; c.beginPath(); c.arc(p.x - 5, p.y - 31, 2.6, 0, 7); c.fill();
  };
  DRAW.kajidai = function (g, w, h, rot, lv, th, st) {
    g.shadow(0.5, 0.5, 14, 7);
    g.cyl(0.55, 0.55, 0, 9, 12, '#8a5a36');
    var c = g.c, p = g.P(0.55, 0.55, 12);
    c.beginPath(); c.moveTo(p.x - 12, p.y - 2); c.lineTo(p.x + 14, p.y - 2); c.lineTo(p.x + 8, p.y - 8); c.lineTo(p.x - 8, p.y - 8); c.closePath(); c.fillStyle = '#5a5c63'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
    c.fillStyle = '#6a6d75'; c.fillRect(p.x - 4, p.y - 2, 8, 6); c.strokeRect(p.x - 4, p.y - 2, 8, 6);
    var f = g.P(0.2, 0.3, 0); g.box(0.05, 0.1, 0.3, 0.35, 0, 14, '#a9a59c');
    var t = (st && st.t) || 0, gl = 0.4 + 0.2 * Math.sin(t * 4);
    c.fillStyle = 'rgba(255,120,40,' + gl + ')'; c.beginPath(); c.arc(f.x + 4, f.y - 10, 5, 0, 7); c.fill();
  };
  DRAW.jizo = function (g) {
    g.shadow(0.5, 0.5, 12, 6);
    g.box(0.3, 0.3, 0.4, 0.4, 0, 6, '#9d998f');
    var c = g.c, p = g.P(0.5, 0.5, 6);
    c.beginPath(); c.moveTo(p.x - 8, p.y); c.quadraticCurveTo(p.x - 9, p.y - 16, p.x, p.y - 18); c.quadraticCurveTo(p.x + 9, p.y - 16, p.x + 8, p.y); c.closePath(); c.fillStyle = '#b8b4ab'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.arc(p.x, p.y - 22, 6.5, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#d8452c'; c.beginPath(); c.moveTo(p.x - 7, p.y - 16); c.lineTo(p.x + 7, p.y - 16); c.lineTo(p.x, p.y - 7); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(p.x - 9, p.y - 26); c.lineTo(p.x, p.y - 33); c.lineTo(p.x + 9, p.y - 26); c.closePath(); c.fillStyle = '#d8452c'; c.fill(); c.stroke();
    c.strokeStyle = OUT; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x - 3, p.y - 22); c.lineTo(p.x - 1, p.y - 22); c.moveTo(p.x + 1, p.y - 22); c.lineTo(p.x + 3, p.y - 22); c.stroke();
  };
  DRAW.kinen = function (g) {
    g.shadow(0.5, 0.5, 14, 7);
    g.box(0.2, 0.3, 0.6, 0.4, 0, 5, '#9d998f');
    g.box(0.3, 0.42, 0.4, 0.16, 5, 30, '#b8b4ab');
    var c = g.c, p = g.P(0.5, 0.58, 22); c.fillStyle = '#6a665e'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.fillText('縁', p.x, p.y);
    c.fillStyle = '#f2a9c0'; c.beginPath(); c.arc(p.x + 6, p.y - 16, 3, 0, 7); c.fill();
  };

  // 荒れた場所・採集場所・里の外の木
  function drawDebris(g, kind) {
    var c = g.c, p = g.P(0.5, 0.5, 0);
    if (kind === 'weeds') {
      for (var i = 0; i < 9; i++) { var q = g.P(0.15 + hash(i) * 0.7, 0.15 + hash(i + 9) * 0.7, 0), h2 = 10 + hash(i + 3) * 12; c.strokeStyle = '#5a7a34'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(q.x, q.y); c.quadraticCurveTo(q.x - 4, q.y - h2 / 2, q.x - 2 + hash(i + 5) * 6, q.y - h2); c.stroke(); c.strokeStyle = '#7a9a44'; c.beginPath(); c.moveTo(q.x + 2, q.y); c.quadraticCurveTo(q.x + 5, q.y - h2 / 2, q.x + 6, q.y - h2 * 0.8); c.stroke(); }
    } else if (kind === 'logs') {
      c.lineCap = 'round'; [[-14, 2, 14, -8], [-12, -4, 12, 6]].forEach(function (l) { c.strokeStyle = OUT; c.lineWidth = 9; c.beginPath(); c.moveTo(p.x + l[0], p.y + l[1] - 4); c.lineTo(p.x + l[2], p.y + l[3] - 4); c.stroke(); c.strokeStyle = '#8a5a36'; c.lineWidth = 7; c.stroke(); c.fillStyle = '#c9a46a'; c.beginPath(); c.arc(p.x + l[2], p.y + l[3] - 4, 3.2, 0, 7); c.fill(); });
    } else {
      [[-8, 0, 9], [7, -3, 7], [2, 5, 6]].forEach(function (r) { c.beginPath(); c.ellipse(p.x + r[0], p.y + r[1] - r[2] * 0.4, r[2] * 1.2, r[2] * 0.8, 0, 0, 7); c.fillStyle = '#a9a59c'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.3; c.stroke(); });
    }
  }
  function drawOuterTree(g, seed) {
    var kind = hash(seed * 7) < 0.55 ? 'pine' : 'round';
    g.shadow(0.5, 0.5, 18, 9, 0.12);
    if (kind === 'pine') { DRAW.matsu(g); return; }
    g.cyl(0.5, 0.5, 0, 3.2, 26, '#7a5a3a', { lw: 1.2 });
    g.ball(0.45, 0.5, 42, 17, '#5f9a45'); g.ball(0.62, 0.42, 50, 13, '#6aa84e');
  }
  function drawGatherSpot(g, ready, t) {
    DRAW.chikurin(g, 1, 1, 0, 1, THEMES.standard, { t: t });
  }

  /* ---------- 物の絵を一度だけ描いて使い回す ---------- */
  var spriteCache = {};
  var ITEM_H = { koya: 104, chaya: 96, souko: 100, shugyoba: 70, sakura: 90, matsu: 84, torii: 84, chochin: 70, bonbori: 62, ishidoro: 60, ido: 62, dangoya: 70, chikurin: 90, mosen: 74, furin: 60, kakashi: 64, mato: 60, kitsune: 60, manekineko: 56, jizo: 50, kinen: 52, emakake: 54, makimono: 52, himono: 50, kajidai: 40, shishiodoshi: 40, kobashi: 44, niwaishi: 40, takegaki: 40, takibi: 50, kadan: 30, endai: 30, hatake: 40, koike: 20, tobiishi: 14, debris: 40, tree: 90 };
  function spriteFor(id, rot, lv, theme, extra, scale) {
    var it = D.ITEM[id] || { w: 1, h: 1 };
    var d = R.dims(it, rot);
    var key = id + '|' + rot + '|' + lv + '|' + theme + '|' + (extra || '') + '|' + scale;
    if (spriteCache[key]) return spriteCache[key];
    var mh = (ITEM_H[id] || 70) + 20, m = 12;
    var W = (d.w + d.h) * HW + m * 2, Hh = (d.w + d.h) * HH + mh + m;
    var cv = makeCanvas(Math.ceil(W * scale), Math.ceil(Hh * scale));
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(d.h * HW + m, mh);
    var g = new G(ctx);
    var th = THEMES[theme] || THEMES.standard;
    var st = extra ? JSON.parse(extra) : null;
    if (DRAW[id]) DRAW[id](g, d.w, d.h, rot, lv || 1, th, st);
    else g.box(0.1, 0.1, d.w - 0.2, d.h - 0.2, 0, 20, '#c9a46a');
    var spr = { cv: cv, ax: d.h * HW + m, ay: mh, w: W, h: Hh };
    spriteCache[key] = spr;
    return spr;
  }
  function makeCanvas(w, h) {
    if (typeof document !== 'undefined') { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
    return null;
  }

  /* ---------- キャラクターの画像（SVG → 画像 → キャンバス） ---------- */
  var charCache = {};
  var CW = 64, CHh = 77; // ズーム1での表示サイズ
  // 読みこみ中は、同じ人物の読みこみ済みの絵（向き・大きさちがい）で代わりに描く
  var charLast = {}, charPending = 0;
  function charSprite(key, defFn, opt, scale) {
    var k = key + '|' + opt.yaw + '|' + opt.pose + '|' + (opt.frame || 0) + '|' + (opt.expr || '') + '|' + scale;
    var e = charCache[k];
    if (e) return e.ready ? e : (charLast[key] || null);
    e = charCache[k] = { ready: false };
    charPending++;
    var svg = A.render(defFn(), { yaw: opt.yaw, pose: opt.pose, frame: opt.frame, expr: opt.expr, w: Math.round(CW * scale), h: Math.round(CHh * scale), shadow: false, prop: false, companions: opt.companions !== false });
    var img = new Image();
    img.onload = function () {
      var cv = makeCanvas(img.width, img.height); cv.getContext('2d').drawImage(img, 0, 0);
      e.cv = cv; e.ready = true; charLast[key] = e; charPending--; if (root.NSL_ISO_onSprite) root.NSL_ISO_onSprite();
    };
    img.onerror = function () { charPending--; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return charLast[key] || null;
  }
  function clearChar(prefix) { var k; for (k in charCache) if (k.indexOf(prefix) === 0) delete charCache[k]; for (k in charLast) if (k.indexOf(prefix) === 0) delete charLast[k]; }

  /* ---------- 地面 ---------- */
  function drawGround(ctx, s, opts) {
    var N = D.BAL.map, P = R.plot(s);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var p = iso(x, y), inPlot = x >= P.x0 && x <= P.x1 && y >= P.y0 && y <= P.y1;
      var h = hash(x * 131 + y * 7 + 3);
      var col = inPlot ? ((x + y) % 2 ? '#a7d273' : '#9fcc6b') : (h < 0.5 ? '#86b95c' : '#80b357');
      if (!inPlot && (x < P.x0 - 1 || y < P.y0 - 1 || x > P.x1 + 1 || y > P.y1 + 1)) col = h < 0.5 ? '#77ab52' : '#72a54e';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + HW, p.y + HH); ctx.lineTo(p.x, p.y + HH * 2); ctx.lineTo(p.x - HW, p.y + HH); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      if (inPlot && h > 0.85) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(p.x + (h - 0.9) * 200, p.y + HH, 1.4, 0, 7); ctx.fill(); }
      if (!inPlot && h > 0.8) { ctx.strokeStyle = 'rgba(60,100,40,.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + HH + 2); ctx.lineTo(p.x - 2, p.y + HH - 4); ctx.moveTo(p.x, p.y + HH + 2); ctx.lineTo(p.x + 1, p.y + HH - 6); ctx.stroke(); }
    }
    // 敷地のふち（縄）
    var c0 = iso(P.x0, P.y0), c1 = iso(P.x1 + 1, P.y0), c2 = iso(P.x1 + 1, P.y1 + 1), c3 = iso(P.x0, P.y1 + 1);
    ctx.setLineDash([8, 5]); ctx.strokeStyle = 'rgba(120,80,40,.75)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    // 入口の道
    var gt = gateOf(s);
    for (var k = 0; k < 3; k++) { var gp = iso(gt.x, gt.y + k); ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(gp.x + HW, gp.y + HH); ctx.lineTo(gp.x, gp.y + HH * 2); ctx.lineTo(gp.x - HW, gp.y + HH); ctx.closePath(); ctx.fillStyle = '#d9c49a'; ctx.fill(); }
    // 小川（里の外・右奥）
    ctx.strokeStyle = '#7fc2e0'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    var r0 = iso(N - 0.6, 0), r1 = iso(N - 0.8, N * 0.5), r2 = iso(N - 0.5, N);
    ctx.beginPath(); ctx.moveTo(r0.x, r0.y); ctx.quadraticCurveTo(r1.x - 10, r1.y, r2.x, r2.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
  }
  function gateOf(s) { var P = R.plot(s); return { x: P.x0 + Math.floor(s.village.size / 2), y: P.y1 + 1 }; }
  // 里の外の木（決まった位置）
  function outerTrees(s) {
    var N = D.BAL.map, P = R.plot(s), out = [], spots = {};
    R.gatherSpots(s).forEach(function (g) { spots[g.x + ',' + g.y] = 1; });
    var gt = gateOf(s);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var inside = x >= P.x0 - 1 && x <= P.x1 + 1 && y >= P.y0 - 1 && y <= P.y1 + 1;
      if (inside || spots[x + ',' + y]) continue;
      if (Math.abs(x - gt.x) <= 1 && y >= gt.y) continue;
      if (x >= N - 2) continue;
      var h = hash(x * 977 + y * 131);
      if (h < 0.34) out.push({ x: x, y: y, seed: x * 31 + y });
    }
    return out;
  }

  var api = { HW: HW, HH: HH, iso: iso, unIso: unIso, THEMES: THEMES, DRAW: DRAW, G: G, spriteFor: spriteFor, charSprite: charSprite, charPending: function () { return charPending; }, clearChar: clearChar, drawGround: drawGround, drawDebris: drawDebris, drawOuterTree: drawOuterTree, drawGatherSpot: drawGatherSpot, outerTrees: outerTrees, gateOf: gateOf, makeCanvas: makeCanvas, CW: CW, CHh: CHh, hash: hash, spriteCache: spriteCache };
  root.NSL_ISO = api;
})(typeof window !== 'undefined' ? window : globalThis);
