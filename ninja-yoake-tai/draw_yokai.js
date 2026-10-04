/* ニンジャ夜明け隊（RPG） — 妖怪の絵（キャンバスで描く。こわくない・かわいい妖怪）
 * draw(c, shape, col, o)：(0,0) が足もと。o.s = 大きさ（1 で高さ約40）、o.t = 時間、o.hit = 白く光る、o.dir = 1/-1（向き）
 * o.daze = 崩れている（目がぐるぐる）、o.charge = ためている（赤い気）、o.turn = 1 で顔を向き（dir）のほうへ寄せる（戦闘で仲間をにらむ）
 */
(function (root) {
  'use strict';
  var OUT = '#2b1d16';
  function circle(c, x, y, r, fill, stroke, lw) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); } }
  function ell(c, x, y, rx, ry, fill, stroke, lw, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); } }
  function poly(c, pts, fill, stroke, lw) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.lineJoin = 'round'; c.stroke(); } }

  // 色：本体・明るいところ・差し色・目
  var PAL = {
    purple: ['#7a6ac0', '#a898e2', '#c8b8ff'], navy: ['#3e4a8e', '#6a78c0', '#9aa8f0'], gold: ['#e8b830', '#ffe080', '#fff4c0'], dark: ['#3a2a4e', '#5a4a72', '#8a6ab0'],
    brown: ['#8a6040', '#d8b080', '#5a3a26'], boss_brown: ['#7a4e30', '#d8a870', '#4a2a18'], blue: ['#4aa8ff', '#cfe8ff', '#ffffff'], green: ['#5ac87a', '#c8ffd0', '#ffffff'],
    orange: ['#e08a3a', '#f8d8b0', '#fff4e0'], red: ['#d8553a', '#f0a080', '#7a2a1a'], bone: ['#e8e0cc', '#fff8ea', '#9a907c'], white: ['#e8eef8', '#ffffff', '#b8c8e0'],
    gray: ['#8a8a90', '#b0b0b6', '#5a5a60'], tan: ['#c8a070', '#ecd0a8', '#7a5a3a'], violet: ['#5a4a8a', '#8a7ab8', '#ff6a8a'], black: ['#2a2430', '#4a4252', '#ff5a5a'],
    teal: ['#3a9a9a', '#8ad8d0', '#d8fff8'], cyan: ['#5ad0e8', '#c8f4ff', '#ffffff'], boss_white: ['#dcdcea', '#ffffff', '#8a7ab0'], boss_navy: ['#26365e', '#4a5e90', '#ffd84a'],
    boss_shadow: ['#3a2a4a', '#5a4a6e', '#ff5a5a'], boss_black: ['#1e1824', '#3a3046', '#ff4a4a'], boss_final: ['#241a30', '#43345a', '#ffd23a'], snake: ['#f1efe9', '#ffffff', '#c8202c']
  };
  function pal(col) { return PAL[col] || PAL.purple; }

  function eyes(c, x, y, r, o, gap, col) {
    gap = gap == null ? r * 1.5 : gap;
    if (o.daze) {
      c.strokeStyle = '#2b1d3a'; c.lineWidth = Math.max(1.2, r * 0.35);
      for (var s = -1; s <= 1; s += 2) { c.beginPath(); for (var a = 0; a < 6.5; a += 0.5) { var rr = a / 6.5 * r; var px = x + s * gap / 2 + Math.cos(a + o.t * 8) * rr, py = y + Math.sin(a + o.t * 8) * rr; if (a) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke(); }
      return;
    }
    if (o.ko) { c.strokeStyle = '#2b1d3a'; c.lineWidth = Math.max(1.2, r * 0.4); for (var k = -1; k <= 1; k += 2) { c.beginPath(); c.moveTo(x + k * gap / 2 - r * 0.6, y - r * 0.6); c.lineTo(x + k * gap / 2 + r * 0.6, y + r * 0.6); c.moveTo(x + k * gap / 2 + r * 0.6, y - r * 0.6); c.lineTo(x + k * gap / 2 - r * 0.6, y + r * 0.6); c.stroke(); } return; }
    var lx = (o.dir || 0) * r * (o.turn ? 0.34 : 0.25);
    x += (o.turn || 0) * (o.dir || 1) * (gap * 0.22 + r * 0.25);   // 向いているほうへ顔を寄せる
    for (var i = -1; i <= 1; i += 2) {
      ell(c, x + i * gap / 2, y, r * 0.8, r, '#ffffff', OUT, Math.max(1, r * 0.25));
      circle(c, x + i * gap / 2 + lx, y + r * 0.15, r * 0.45, col || '#2b1d3a');
      circle(c, x + i * gap / 2 + lx - r * 0.15, y - r * 0.15, r * 0.16, '#ffffff');
    }
  }
  function blush(c, x, y, r, gap, o) { if (o && o.turn) x += o.turn * (o.dir || 1) * (gap * 0.22 + r * 0.6); circle(c, x - gap / 2, y, r, 'rgba(255,140,170,.75)'); circle(c, x + gap / 2, y, r, 'rgba(255,140,170,.75)'); }

  var SH = {};
  SH.blob = function (c, P, o) {
    var bob = Math.abs(Math.sin(o.t * 5)) * 3, sq = 1 + Math.sin(o.t * 10) * 0.05, r = 17;
    c.save(); c.translate(0, -r - bob); c.scale(1 / sq, sq);
    c.fillStyle = P[2]; c.beginPath(); c.moveTo(-5, -r + 3); c.quadraticCurveTo(-1, -r - 12 - Math.sin(o.t * 7) * 3, 5, -r - 6); c.quadraticCurveTo(4, -r, 6, -r + 2); c.closePath(); c.fill();
    circle(c, 0, 0, r, o.hit ? '#fff' : P[0], OUT, 2.4);
    ell(c, 0, r * 0.4, r * 0.62, r * 0.38, P[1]);
    eyes(c, 0, -3, 4.2, o, 10); blush(c, 0, 4, 2.2, 18, o);
    c.restore();
  };
  SH.tanuki = function (c, P, o) {
    var b = Math.sin(o.t * 4) * 1.5;
    ell(c, 0, -16 + b, 15, 15, o.hit ? '#fff' : P[0], OUT, 2.2); ell(c, 0, -11 + b, 9, 9, P[1]);
    // しっぽ
    ell(c, -(o.dir || 1) * 15, -8 + b, 8, 5, P[0], OUT, 1.6, 0.4); c.strokeStyle = P[2]; c.lineWidth = 2; c.beginPath(); c.moveTo(-(o.dir || 1) * 19, -10 + b); c.lineTo(-(o.dir || 1) * 15, -5 + b); c.stroke();
    circle(c, 0, -33 + b, 12, o.hit ? '#fff' : P[0], OUT, 2.2);
    circle(c, -8, -43 + b, 4, P[0], OUT, 1.6); circle(c, 8, -43 + b, 4, P[0], OUT, 1.6);
    ell(c, -5, -34 + b, 5, 4, P[2]); ell(c, 5, -34 + b, 5, 4, P[2]);
    eyes(c, 0, -34 + b, 2.6, o, 10);
    circle(c, 0, -29 + b, 1.8, OUT);
    c.save(); c.translate(0, -48 + b); c.rotate(-0.4); ell(c, 0, 0, 7, 3.4, '#5aa84a', OUT, 1.2); c.restore();
    // おなかの太鼓（大将）
    if (o.boss) { circle(c, 0, -14 + b, 8, '#e8c070', OUT, 1.6); circle(c, 0, -14 + b, 3, '#c8402c'); }
  };
  SH.wisp = function (c, P, o) {
    var f = Math.sin(o.t * 9) * 2;
    c.fillStyle = 'rgba(' + (P === PAL.green ? '120,240,150' : '120,190,255') + ',.25)'; circle(c, 0, -24, 22);
    poly(c, [[-12, -14], [-14, -28], [-6, -36 + f], [-3, -48 - f], [4, -38], [10, -44 + f], [13, -28], [12, -14], [0, -8]], o.hit ? '#fff' : P[0], OUT, 2);
    ell(c, 0, -20, 8, 9, P[1]);
    eyes(c, 0, -22, 2.8, o, 8);
  };
  SH.kodama = function (c, P, o) {
    var b = Math.sin(o.t * 3) * 1;
    ell(c, 0, -10 + b, 9, 11, o.hit ? '#fff' : '#f4f6ee', OUT, 2);
    circle(c, 0, -28 + b, 12, o.hit ? '#fff' : '#f4f6ee', OUT, 2.2);
    poly(c, [[-4, -39 + b], [0, -52 + b], [4, -39 + b]], P[0], OUT, 1.6); ell(c, -5, -50 + b, 6, 3, P[0], OUT, 1.2, -0.5); ell(c, 6, -48 + b, 6, 3, P[0], OUT, 1.2, 0.5);
    circle(c, -4, -28 + b, 2.2, OUT); circle(c, 4, -28 + b, 2.2, OUT);
    if (!o.daze && !o.ko) { ell(c, 0, -22 + b, 2.2, 1.4, OUT); } else eyes(c, 0, -28 + b, 2.4, o, 8);
  };
  SH.kasa = function (c, P, o) {
    var hop = Math.abs(Math.sin(o.t * 6)) * 5;
    c.translate(0, -hop);
    c.strokeStyle = '#8a6a3a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 4 + hop); c.stroke();
    poly(c, [[-20, -8], [20, -8], [4, -46], [-4, -46]], o.hit ? '#fff' : P[0], OUT, 2.2);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.4; [-10, 0, 10].forEach(function (k) { c.beginPath(); c.moveTo(k, -8); c.lineTo(k * 0.2, -44); c.stroke(); });
    if (o.daze || o.ko) eyes(c, 0, -28, 3, o, 0.1); else { ell(c, 0, -28, 7, 8, '#ffffff', OUT, 1.5); circle(c, (o.dir || 0) * 2, -27, 3.2, OUT); }
    c.fillStyle = '#e86a8a'; c.beginPath(); c.ellipse(0, -14, 4, 6, 0, 0, Math.PI); c.fill();
  };
  SH.fox = function (c, P, o) {
    var b = Math.sin(o.t * 4) * 1.2, d = o.dir || 1;
    ell(c, -d * 14, -14 + b, 11, 6, P[0], OUT, 1.8, d * 0.6); ell(c, -d * 20, -18 + b, 4, 3, P[1]);
    ell(c, 0, -14 + b, 13, 12, o.hit ? '#fff' : P[0], OUT, 2.2); ell(c, 0, -10 + b, 7, 7, P[1]);
    circle(c, 0, -31 + b, 11, o.hit ? '#fff' : P[0], OUT, 2.2);
    poly(c, [[-9, -37 + b], [-8, -50 + b], [-2, -40 + b]], P[0], OUT, 1.6); poly(c, [[9, -37 + b], [8, -50 + b], [2, -40 + b]], P[0], OUT, 1.6);
    ell(c, 0, -27 + b, 6, 4, P[1]);
    eyes(c, 0, -32 + b, 2.4, o, 9, '#7a2a1a'); circle(c, 0, -27 + b, 1.6, OUT);
  };
  SH.mist = function (c, P, o) {
    var b = Math.sin(o.t * 2.5) * 2;
    c.globalAlpha = 0.95;
    circle(c, -10, -18 + b, 10, o.hit ? '#fff' : P[0], OUT, 1.8); circle(c, 10, -18 + b, 10, o.hit ? '#fff' : P[0], OUT, 1.8); circle(c, 0, -28 + b, 13, o.hit ? '#fff' : P[1], OUT, 1.8);
    circle(c, -10, -18 + b, 8.5, P[0]); circle(c, 10, -18 + b, 8.5, P[0]); circle(c, 0, -28 + b, 11.5, P[1]);
    c.globalAlpha = 1;
    eyes(c, 0, -28 + b, 2.8, o, 9, '#4a5a8a'); blush(c, 0, -22 + b, 2, 16, o);
  };
  SH.rock = function (c, P, o) {
    poly(c, [[-18, 0], [-20, -16], [-12, -32], [4, -36], [16, -26], [20, -6], [14, 0]], o.hit ? '#fff' : P[0], OUT, 2.4);
    poly(c, [[-12, -28], [2, -32], [10, -26], [-4, -22]], P[1]);
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-14, -10); c.lineTo(-6, -14); c.moveTo(8, -6); c.lineTo(14, -14); c.stroke();
    eyes(c, 0, -18, 3.2, o, 11);
    c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -9); c.quadraticCurveTo(0, -6, 6, -9); c.stroke();
  };
  SH.tengu = function (c, P, o) {
    var fl = Math.sin(o.t * 10) * 0.35;
    for (var s = -1; s <= 1; s += 2) { c.save(); c.translate(s * 9, -26); c.rotate(s * (0.5 + fl)); ell(c, s * 10, 0, 13, 6, '#2a2a3a', OUT, 1.6); c.restore(); }
    ell(c, 0, -16, 10, 12, o.hit ? '#fff' : '#3a3a52', OUT, 2);
    circle(c, 0, -34, 11, o.hit ? '#fff' : P[0], OUT, 2.2);
    poly(c, [[-2, -34], [(o.dir || 1) * 16, -32], [2, -29]], '#e86a4a', OUT, 1.6);
    eyes(c, -1, -37, 2.4, o, 9);
    rrectFill(c, -6, -48, 12, 6, '#2a2a3a');
  };
  function rrectFill(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); c.strokeStyle = OUT; c.lineWidth = 1.4; c.strokeRect(x, y, w, h); }
  SH.spider = function (c, P, o) {
    var w = Math.sin(o.t * 8) * 2;
    c.strokeStyle = OUT; c.lineWidth = 2.6; c.lineCap = 'round';
    for (var s = -1; s <= 1; s += 2) for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(s * 8, -14 + i * 3); c.quadraticCurveTo(s * (20 + i * 3), -24 + i * 6 + (i % 2 ? w : -w), s * (24 + i * 2), -2); c.stroke(); }
    ell(c, 0, -16, 16, 13, o.hit ? '#fff' : P[0], OUT, 2.2);
    ell(c, 0, -10, 9, 6, P[1]);
    eyes(c, 0, -19, 3, o, 11, P[2]);
    circle(c, -10, -26, 1.6, OUT); circle(c, 10, -26, 1.6, OUT);
    if (o.boss) { c.fillStyle = 'rgba(255,255,255,.5)'; for (var k = 0; k < 4; k++) ell(c, -10 + k * 7, -30, 2, 4); }
  };
  SH.echo = function (c, P, o) {
    var b = Math.sin(o.t * 3) * 1.5;
    ell(c, -16, -30 + b, 6, 12, P[0], OUT, 1.8, -0.4); ell(c, 16, -30 + b, 6, 12, P[0], OUT, 1.8, 0.4);
    ell(c, 0, -18 + b, 17, 17, o.hit ? '#fff' : P[0], OUT, 2.2);
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.2; for (var i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-14 + i * 6, -32 + b); c.lineTo(-12 + i * 6, -28 + b); c.stroke(); }
    eyes(c, 0, -20 + b, 3.4, o, 11);
    ell(c, 0, -10 + b, 4, 3, '#7a3a3a', OUT, 1.2);
  };
  SH.kappa = function (c, P, o) {
    var b = Math.sin(o.t * 4) * 1.2;
    ell(c, 0, -14 + b, 13, 13, o.hit ? '#fff' : P[0], OUT, 2.2); ell(c, 0, -12 + b, 9, 10, '#d8c870', OUT, 1.4);
    circle(c, 0, -33 + b, 12, o.hit ? '#fff' : P[0], OUT, 2.2);
    ell(c, 0, -44 + b, 9, 3.4, '#cfe8ff', OUT, 1.4);
    eyes(c, 0, -35 + b, 2.6, o, 10);
    poly(c, [[-4, -29 + b], [4, -29 + b], [0, -25 + b]], '#f0c040', OUT, 1.2);
  };
  SH.crab = function (c, P, o) {
    var sn = Math.sin(o.t * 6);
    for (var s = -1; s <= 1; s += 2) { c.save(); c.translate(s * 18, -22); c.rotate(s * 0.3 * sn); ell(c, s * 4, -6, 8, 6, o.hit ? '#fff' : P[0], OUT, 2); c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.moveTo(s * 2, -6); c.lineTo(s * 10, -8); c.stroke(); c.restore(); }
    c.strokeStyle = OUT; c.lineWidth = 2.2; for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-10, -8 + i * 2); c.lineTo(-20, -2 + i * 2); c.moveTo(10, -8 + i * 2); c.lineTo(20, -2 + i * 2); c.stroke(); }
    ell(c, 0, -14, 17, 11, o.hit ? '#fff' : P[0], OUT, 2.2); ell(c, 0, -10, 10, 5, P[1]);
    c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.moveTo(-5, -24); c.lineTo(-6, -30); c.moveTo(5, -24); c.lineTo(6, -30); c.stroke();
    eyes(c, 0, -32, 2.4, o, 12);
  };
  SH.chochin = function (c, P, o) {
    var sw = Math.sin(o.t * 3) * 0.08;
    c.save(); c.rotate(sw);
    c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -48); c.lineTo(0, -54); c.stroke();
    ell(c, 0, -26, 15, 20, o.hit ? '#fff' : P[0], OUT, 2.4);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.3; for (var i = -2; i <= 2; i++) { c.beginPath(); c.ellipse(0, -26 + i * 7, 14.5, 2.5, 0, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#2a2226'; c.fillRect(-8, -48, 16, 4); c.fillRect(-8, -8, 16, 4);
    if (o.daze || o.ko) eyes(c, 0, -30, 3, o, 0.1); else { ell(c, 0, -31, 6, 6, '#ffffff', OUT, 1.5); circle(c, (o.dir || 0) * 2, -30, 2.8, OUT); }
    poly(c, [[-5, -18], [5, -18], [3, -8], [-1, -6], [-4, -10]], '#e8505a', OUT, 1.4);
    c.restore();
  };
  SH.jelly = function (c, P, o) {
    var b = Math.sin(o.t * 3) * 3;
    c.strokeStyle = P[0]; c.lineWidth = 2;
    for (var i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 5, -20 + b); c.quadraticCurveTo(i * 5 + Math.sin(o.t * 5 + i) * 4, -10 + b, i * 5, 0 + b); c.stroke(); }
    c.globalAlpha = 0.9; ell(c, 0, -26 + b, 16, 12, o.hit ? '#fff' : P[0], OUT, 2); c.globalAlpha = 1;
    ell(c, 0, -30 + b, 9, 5, P[1]);
    eyes(c, 0, -26 + b, 2.4, o, 9);
  };
  SH.firefly = function (c, P, o) {
    var fl = Math.sin(o.t * 14) * 0.5, b = Math.sin(o.t * 4) * 3;
    c.fillStyle = 'rgba(150,255,230,.3)'; circle(c, 0, -22 + b, 20);
    for (var s = -1; s <= 1; s += 2) { c.save(); c.translate(s * 5, -30 + b); c.rotate(s * (0.4 + fl)); ell(c, s * 8, -4, 9, 5, 'rgba(230,255,250,.85)', OUT, 1.2); c.restore(); }
    ell(c, 0, -22 + b, 9, 12, o.hit ? '#fff' : P[0], OUT, 2);
    ell(c, 0, -14 + b, 7, 6, P[1]);
    eyes(c, 0, -27 + b, 2.2, o, 7);
  };
  SH.shadow = function (c, P, o) {
    var b = Math.sin(o.t * 3) * 1.5;
    poly(c, [[-14, 0], [-16, -26 + b], [-10, -40 + b], [10, -40 + b], [16, -26 + b], [14, 0], [6, -4], [0, 0], [-6, -4]], o.hit ? '#fff' : P[0], OUT, 2.2);
    circle(c, 0, -44 + b, 11, o.hit ? '#fff' : P[0], OUT, 2.2);
    c.fillStyle = P[1]; c.fillRect(-10, -46 + b, 20, 5);
    if (o.daze || o.ko) eyes(c, 0, -44 + b, 2.6, o, 8); else { ell(c, -4, -44 + b, 2.6, 1.6, P[2]); ell(c, 4, -44 + b, 2.6, 1.6, P[2]); }
    if (o.boss) { c.strokeStyle = '#e8c040'; c.lineWidth = 2; c.beginPath(); c.moveTo(-12, -54 + b); c.lineTo(0, -62 + b); c.lineTo(12, -54 + b); c.stroke(); }
  };
  SH.weasel = function (c, P, o) {
    var d = o.dir || 1, sp = Math.sin(o.t * 12) * 2;
    c.fillStyle = 'rgba(200,240,220,.35)'; for (var i = 0; i < 3; i++) { c.beginPath(); c.arc(-d * (10 + i * 6), -18, 12 - i * 2, -1, 1); c.lineWidth = 1.6; c.strokeStyle = 'rgba(200,255,230,.6)'; c.stroke(); }
    ell(c, 0, -16, 16, 9, o.hit ? '#fff' : P[0], OUT, 2.2);
    ell(c, -d * 16, -20, 9, 4, P[0], OUT, 1.6, d * 0.4);
    circle(c, d * 14, -24, 9, o.hit ? '#fff' : P[0], OUT, 2);
    poly(c, [[d * 10, -32], [d * 12, -38], [d * 15, -32]], P[0], OUT, 1.4);
    eyes(c, d * 15, -25, 2, o, 6);
    c.strokeStyle = '#d8dce4'; c.lineWidth = 2.4; c.beginPath(); c.arc(d * 6, -8 + sp, 9, 0.2, 1.8); c.stroke();
  };
  SH.cloth = function (c, P, o) {
    c.beginPath(); c.moveTo(-6, -46);
    for (var i = 0; i <= 8; i++) { var y = -46 + i * 6, x = Math.sin(o.t * 4 + i * 0.7) * 8 + (i * 1.5); c.lineTo(x + 7, y); }
    for (i = 8; i >= 0; i--) { var y2 = -46 + i * 6, x2 = Math.sin(o.t * 4 + i * 0.7) * 8 + (i * 1.5); c.lineTo(x2 - 7, y2); }
    c.closePath(); c.fillStyle = o.hit ? '#fff' : P[0]; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
    eyes(c, Math.sin(o.t * 4) * 8, -38, 2.2, o, 7);
  };
  SH.daruma = function (c, P, o) {
    var r = 18, rock = Math.sin(o.t * 2.5) * 0.08;
    c.save(); c.translate(0, -r); c.rotate(rock);
    circle(c, 0, 0, r, o.hit ? '#fff' : P[0], OUT, 2.6);
    c.strokeStyle = '#f3c24a'; c.lineWidth = 2.4; c.beginPath(); c.arc(0, r * 0.25, r * 0.75, 0.3, Math.PI - 0.3); c.stroke();
    ell(c, 0, -r * 0.18, r * 0.62, r * 0.5, '#fbeede', OUT, 1.8);
    eyes(c, 0, -r * 0.22, 2.6, o, r * 0.5);
    c.restore();
  };
  SH.crow = function (c, P, o) {
    var fl = Math.sin(o.t * 6) * 0.3, b = Math.sin(o.t * 3) * 2;
    for (var s = -1; s <= 1; s += 2) { c.save(); c.translate(s * 10, -30 + b); c.rotate(s * (0.6 + fl)); poly(c, [[0, 0], [s * 26, -6], [s * 30, 4], [s * 20, 8], [s * 8, 10]], P[0], OUT, 2); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(s * 6, 2); c.lineTo(s * 24, 0); c.stroke(); c.restore(); }
    ell(c, 0, -22 + b, 14, 16, o.hit ? '#fff' : P[0], OUT, 2.2);
    circle(c, 0, -42 + b, 11, o.hit ? '#fff' : P[0], OUT, 2.2);
    poly(c, [[-3, -40 + b], [(o.dir || 1) * 15, -38 + b], [-2, -35 + b]], '#e8c040', OUT, 1.6);
    if (o.daze || o.ko) eyes(c, -2, -44 + b, 2.4, o, 8); else { circle(c, -5, -44 + b, 2.6, P[2]); circle(c, 3, -44 + b, 2.6, P[2]); }
    poly(c, [[-6, -52 + b], [-2, -60 + b], [0, -52 + b], [3, -59 + b], [5, -51 + b]], P[0], OUT, 1.4);
  };
  SH.umibozu = function (c, P, o) {
    var b = Math.sin(o.t * 2) * 2;
    c.fillStyle = 'rgba(90,150,220,.35)'; ell(c, 0, -4, 30, 7);
    poly(c, [[-26, 0], [-24, -30 + b], [-14, -48 + b], [0, -54 + b], [14, -48 + b], [24, -30 + b], [26, 0]], o.hit ? '#fff' : P[0], OUT, 2.6);
    ell(c, 0, -46 + b, 10, 4, 'rgba(255,255,255,.12)');
    if (o.daze || o.ko) eyes(c, 0, -32 + b, 4, o, 16); else { ell(c, -8, -32 + b, 5, 6, P[2], OUT, 1.6); ell(c, 8, -32 + b, 5, 6, P[2], OUT, 1.6); circle(c, -8, -31 + b, 2, OUT); circle(c, 8, -31 + b, 2, OUT); }
    c.strokeStyle = 'rgba(200,230,255,.7)'; c.lineWidth = 2; for (var i = -2; i <= 2; i++) { c.beginPath(); c.arc(i * 10, 0, 6, Math.PI, 0); c.stroke(); }
  };
  // 地図の上だけの物
  SH.orochi = function (c, P, o) {
    c.strokeStyle = OUT; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-14, -4); c.quadraticCurveTo(0, -14, 12, -6); c.quadraticCurveTo(18, -2, 8, -16); c.stroke();
    c.strokeStyle = '#f4f2ec'; c.lineWidth = 6.5; c.stroke();
    circle(c, 8, -20, 7, '#f4f2ec', OUT, 1.8); circle(c, 10, -21, 1.6, '#c8202c');
  };
  SH.yama = function (c, P, o) {
    var b = Math.sin(o.t * 5) * 2;
    ell(c, 0, -10 + b, 9, 8, '#6fbf4a', OUT, 1.8);
    poly(c, [[-11, -22 + b], [-17, -34 + b], [-6, -27 + b]], '#e98a2a', OUT, 1.2); poly(c, [[11, -22 + b], [17, -34 + b], [6, -27 + b]], '#e98a2a', OUT, 1.2);
    ell(c, 0, -22 + b, 12, 10, '#6fbf4a', OUT, 1.8);
    eyes(c, 0, -23 + b, 2.4, o, 8, '#7a3ea6');
  };
  SH.seal_stone = function (c, P, o) {
    var pulse = 0.5 + Math.sin(o.t * 3) * 0.25;
    c.fillStyle = 'rgba(180,120,255,' + (0.25 * pulse) + ')'; circle(c, 0, -22, 24);
    poly(c, [[-12, 0], [-14, -30], [-6, -42], [6, -42], [14, -30], [12, 0]], '#5a5268', OUT, 2.2);
    c.strokeStyle = 'rgba(220,180,255,' + (0.6 + pulse * 0.4) + ')'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -30); c.lineTo(6, -30); c.moveTo(0, -36); c.lineTo(0, -12); c.moveTo(-6, -20); c.lineTo(6, -16); c.stroke();
  };

  // 描く（向き・大きさ・崩れ・ため）
  function draw(c, shape, col, o) {
    o = o || {};
    var fn = SH[shape] || SH.blob, P = pal(col);
    c.save();
    c.scale((o.s || 1) * (o.flip ? -1 : 1), o.s || 1);
    if (o.charge) { var a = 0.35 + Math.sin(o.t * 12) * 0.15; c.fillStyle = 'rgba(255,70,50,' + a + ')'; ell(c, 0, -26, 30, 32); }
    if (o.shadow !== false) ell(c, 0, 0, 18, 5, 'rgba(0,0,0,.25)');
    fn(c, P, o);
    c.restore();
  }
  var SIZE = { blob: 40, tanuki: 52, wisp: 50, kodama: 52, kasa: 52, fox: 50, mist: 42, rock: 38, tengu: 52, spider: 36, echo: 40, kappa: 48, crab: 36, chochin: 54, jelly: 44, firefly: 46, shadow: 56, weasel: 42, cloth: 50, daruma: 40, crow: 62, umibozu: 56, orochi: 28, yama: 36, seal_stone: 44 };

  var api = { draw: draw, PAL: PAL, SIZE: SIZE, shapes: Object.keys(SH) };
  root.NYT_YOKAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
