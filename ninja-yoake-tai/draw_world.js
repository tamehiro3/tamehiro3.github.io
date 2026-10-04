/* ニンジャ夜明け隊（RPG） — 地面・木・建物の絵（キャンバスで手続き的に描く。画像ファイルは使わない）
 * 1マス = 32（世界の単位）。地面は地図ごとに1枚の画像にまとめて描き、木と建物は前後関係のために別に描く。
 */
(function (root) {
  'use strict';
  var T = 32, OUT = '#2b1d16';
  var DW = {};

  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function hex(h) { h = h.replace('#', ''); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var A = hex(a), B = hex(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
  function circle(c, x, y, r, fill, stroke, lw) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function ell(c, x, y, rx, ry, fill, stroke, lw) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function poly(c, pts, fill, stroke, lw) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.lineJoin = 'round'; c.stroke(); } }
  function rrect(c, x, y, w, h, r, fill, stroke, lw) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function text(c, s, x, y, size, fill) { c.font = '900 ' + size + 'px "Hiragino Maru Gothic ProN","Zen Maru Gothic","Yu Gothic",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = fill; c.fillText(s, x, y); }

  // ---- 色（地図の雰囲気ごと）----
  var THEME = {
    village: { grass: '#78a650', grass2: '#689a46', blade: '#4e7a34', path: '#cfae7c', path2: '#b8955f', tree: ['#3f7a34', '#4f8c3c', '#62a048'], trunk: '#6a4630', cliff: '#8a8478', cliff2: '#625c54', water: '#4a8ad0' },
    forest: { grass: '#5e8e44', grass2: '#517e3a', blade: '#3e6a2c', path: '#c09a68', path2: '#a8824f', tree: ['#2c5a2c', '#386c34', '#4a8040'], trunk: '#5a3a26', cliff: '#7a786c', cliff2: '#56544a', water: '#3a7ac0' },
    mountain: { grass: '#6e9458', grass2: '#5e844c', blade: '#4a6c3c', path: '#b8a080', path2: '#9a8466', tree: ['#2f5a44', '#3a6a50', '#4a7c5e'], trunk: '#5a4632', cliff: '#8e8a86', cliff2: '#66625e', water: '#4a84c0' },
    port: { grass: '#82aa58', grass2: '#709a4c', blade: '#557c38', path: '#d8bc8a', path2: '#c0a070', tree: ['#3a7034', '#4a823c', '#5c964a'], trunk: '#6a4630', cliff: '#8a8478', cliff2: '#625c54', water: '#3a78c0' },
    beach: { grass: '#86ac5a', grass2: '#74984c', blade: '#587c3a', path: '#d8c08c', path2: '#c0a474', tree: ['#2f6440', '#3a7650', '#4a885e'], trunk: '#6a4a32', cliff: '#9a9284', cliff2: '#6e685c', water: '#2f70b8' },
    darkmount: { grass: '#556a58', grass2: '#4a5c4c', blade: '#3a4a3c', path: '#8c8478', path2: '#706a60', tree: ['#26443c', '#2e5046', '#3a6052'], trunk: '#4a3a2e', cliff: '#5e5a62', cliff2: '#423e46', water: '#3a5a90' },
    fortress: { grass: '#5a6a50', grass2: '#4e5c46', blade: '#3e4a38', path: '#8a8070', path2: '#6e665a', tree: ['#2a4a3c'], trunk: '#4a3a2e', cliff: '#5a5458', cliff2: '#3e3a3e', water: '#3a5a90' },
    cave: { grass: '#5a4e48', grass2: '#4e4440', blade: '#3e3430', path: '#6a5c52', path2: '#58483e', tree: ['#2a4a3c'], trunk: '#4a3a2e', cliff: '#4a3e3a', cliff2: '#2e2624', water: '#2e5a90' },
    seacave: { grass: '#4e5458', grass2: '#44494e', blade: '#34383c', path: '#5e6468', path2: '#4a5054', tree: ['#2a4a3c'], trunk: '#4a3a2e', cliff: '#3e4a52', cliff2: '#28323a', water: '#2a5a96' },
    sky: { grass: '#f4eef8', grass2: '#e8e0f2', blade: '#d8cce8', path: '#f0e6c8', path2: '#e0d0a8', tree: ['#e8b8d0'], trunk: '#a87a5a', cliff: '#c8c0d8', cliff2: '#a8a0bc', water: '#7ab0e8' },
    under: { grass: '#3a2e48', grass2: '#33283f', blade: '#2a2034', path: '#4a3c58', path2: '#3e3248', tree: ['#2a2238'], trunk: '#2a2030', cliff: '#2e2638', cliff2: '#1c1624', water: '#2a2850' }
  };
  DW.THEME = THEME;
  function th(F) { return THEME[F.def.theme] || THEME.village; }

  // ---- 地面（1枚の画像）----
  // 木・竹などの「背の高いもの」は別に描くので、ここではその足もとの地面だけ
  DW.buildGround = function (F, scale) {
    var w = F.w * T, h = F.h * T, cv = mk(w * scale, h * scale), c = cv.getContext('2d');
    c.scale(scale, scale);
    var P = th(F), R = rnd(F.w * 7919 + F.h * 104729 + F.id.length * 31);
    c.fillStyle = P.grass; c.fillRect(0, 0, w, h);
    var at = function (x, y) { if (x < 0 || y < 0 || x >= F.w || y >= F.h) return 'x'; return F.tiles[y * F.w + x]; };
    // 下地（歩ける地面の種類）
    for (var y = 0; y < F.h; y++) for (var x = 0; x < F.w; x++) {
      var ch = at(x, y), px = x * T, py = y * T, r = rnd(x * 73856093 ^ y * 19349663);
      var base = baseOf(ch, F);
      drawBase(c, base, px, py, P, r, at, x, y, F);
    }
    // 道の形（となりとつながる丸い道）
    for (y = 0; y < F.h; y++) for (x = 0; x < F.w; x++) {
      ch = at(x, y);
      if (ch === ',' || ch === '_') drawPath(c, ch, x, y, P, at);
    }
    // 水
    for (y = 0; y < F.h; y++) for (x = 0; x < F.w; x++) if (at(x, y) === '~' || at(x, y) === '=') drawWater(c, x, y, P, at, F);
    // 崖・壁・柵・岩・茂み（背の低いもの）
    for (y = 0; y < F.h; y++) for (x = 0; x < F.w; x++) {
      ch = at(x, y); px = x * T; py = y * T; r = rnd(x * 83492791 ^ y * 2654435761);
      if (ch === '#' || ch === 'D' || ch === 'W' || ch === 'S') drawCliff(c, ch, x, y, P, at, r, F);
      else if (ch === 't') drawBush(c, px, py, P, r);
      else if (ch === 'r') drawRock(c, px, py, P, r);
      else if (ch === 'F') drawFence(c, x, y, at);
      else if (ch === '=') drawBridge(c, x, y, at);
      else if (ch === 'x') { c.fillStyle = '#07060c'; c.fillRect(px, py, T, T); }
      else if (ch === 'v') drawSkyEdge(c, x, y, at, r);
    }
    return cv;
  };
  function baseOf(ch, F) {
    if ('T Y B t r F'.indexOf(ch) >= 0) return F.def.theme === 'beach' ? 's' : (F.def.theme === 'darkmount' || F.def.theme === 'fortress') ? 'g' : '.';
    return ch;
  }
  function drawBase(c, ch, px, py, P, r, at, x, y, F) {
    var i;
    if (ch === '.' || ch === '"' || ch === 'f') {
      if (r() < 0.5) { c.fillStyle = P.grass2; c.globalAlpha = 0.5; c.beginPath(); c.ellipse(px + r() * T, py + r() * T, 8 + r() * 10, 5 + r() * 6, 0, 0, 7); c.fill(); c.globalAlpha = 1; }
      c.strokeStyle = P.blade; c.lineWidth = 1.3; c.globalAlpha = 0.55;
      var n = ch === '"' ? 7 : 2 + Math.floor(r() * 3), hgt = ch === '"' ? 9 : 5;
      for (i = 0; i < n; i++) { var gx = px + 3 + r() * (T - 6), gy = py + 6 + r() * (T - 8); c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - 2, gy - hgt * (0.6 + r() * 0.5)); c.moveTo(gx + 2, gy); c.lineTo(gx + 3, gy - hgt * (0.7 + r() * 0.5)); c.stroke(); }
      c.globalAlpha = 1;
      if (ch === 'f') for (i = 0; i < 4; i++) { var fx = px + 5 + r() * (T - 10), fy = py + 6 + r() * (T - 10), col = ['#fff6f0', '#ffd0e0', '#ffe27a', '#d8c8ff'][Math.floor(r() * 4)]; for (var k = 0; k < 5; k++) { var a = k * 1.2566; circle(c, fx + Math.cos(a) * 2.2, fy + Math.sin(a) * 2.2, 1.6, col); } circle(c, fx, fy, 1.2, '#f0b030'); }
      return;
    }
    if (ch === 's') { c.fillStyle = '#e6d6a6'; c.fillRect(px, py, T, T); for (i = 0; i < 6; i++) circle(c, px + r() * T, py + r() * T, 0.9, r() < 0.5 ? '#cbb880' : '#f6ecc8'); return; }
    if (ch === ':') { c.fillStyle = '#9a7048'; c.fillRect(px, py, T, T); c.strokeStyle = '#6e4c2e'; c.lineWidth = 1.2; for (i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(px, py + i * 8); c.lineTo(px + T, py + i * 8); c.stroke(); } c.fillStyle = '#5a3a22'; circle(c, px + 4, py + 4, 1); circle(c, px + T - 4, py + 4, 1); return; }
    if (ch === 'd') { c.fillStyle = P.grass; c.fillRect(px, py, T, T); for (i = 0; i < 4; i++) ell(c, px + r() * T, py + r() * T, 1.5 + r() * 2, 1 + r() * 1.5, r() < 0.5 ? P.grass2 : P.path); return; }
    if (ch === 'p') { c.fillStyle = '#6e6a66'; c.fillRect(px, py, T, T); c.strokeStyle = '#55514e'; c.lineWidth = 1.2; c.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1); c.beginPath(); c.moveTo(px + T / 2, py); c.lineTo(px + T / 2, py + T / 2); c.moveTo(px, py + T / 2); c.lineTo(px + T, py + T / 2); c.stroke(); return; }
    if (ch === 'c') { c.fillStyle = '#f6f0fa'; c.fillRect(px, py, T, T); if (r() < 0.6) ell(c, px + r() * T, py + r() * T, 6 + r() * 8, 3 + r() * 4, 'rgba(200,180,230,.35)'); return; }
    if (ch === 'k' || ch === 'l') {
      c.fillStyle = '#3a2e48'; c.fillRect(px, py, T, T); if (r() < 0.5) ell(c, px + r() * T, py + r() * T, 6 + r() * 7, 3 + r() * 4, 'rgba(90,60,120,.35)');
      if (ch === 'l') for (i = 0; i < 3; i++) { var lx = px + 5 + r() * (T - 10), ly = py + 8 + r() * (T - 12); c.strokeStyle = '#3a6a3a'; c.lineWidth = 1; c.beginPath(); c.moveTo(lx, ly + 6); c.lineTo(lx, ly); c.stroke(); c.strokeStyle = '#e8304a'; c.lineWidth = 1.2; for (var q = 0; q < 6; q++) { var aa = q * 1.047 - 1.57; c.beginPath(); c.moveTo(lx, ly); c.quadraticCurveTo(lx + Math.cos(aa) * 4, ly + Math.sin(aa) * 4 - 2, lx + Math.cos(aa) * 6, ly + Math.sin(aa) * 6 - 3); c.stroke(); } }
      return;
    }
    if (ch === 'g') { c.fillStyle = mix(P.path, P.grass, 0.4); c.fillRect(px, py, T, T); for (i = 0; i < 5; i++) ell(c, px + r() * T, py + r() * T, 1.2 + r() * 1.6, 1 + r(), r() < 0.5 ? P.path2 : P.grass2); return; }
    if (ch === '~' || ch === '=') return;
    if (ch === ',' || ch === '_') return;
    if (ch === '#' || ch === 'D' || ch === 'W' || ch === 'S') return;
  }
  function drawPath(c, ch, x, y, P, at) {
    var px = x * T, py = y * T, isP = function (q) { return q === ch || (ch === ',' && (q === '=' || q === ':')) || (ch === '_' && false); };
    var col = ch === ',' ? P.path : '#b8b2a8', col2 = ch === ',' ? P.path2 : '#8e887e', ins = 3;
    c.fillStyle = col2;
    rrect(c, px + ins - 1, py + ins - 1, T - ins * 2 + 2, T - ins * 2 + 2, 8, col2);
    if (isP(at(x - 1, y))) c.fillRect(px - 1, py + ins - 1, ins + 2, T - ins * 2 + 2);
    if (isP(at(x + 1, y))) c.fillRect(px + T - ins - 1, py + ins - 1, ins + 2, T - ins * 2 + 2);
    if (isP(at(x, y - 1))) c.fillRect(px + ins - 1, py - 1, T - ins * 2 + 2, ins + 2);
    if (isP(at(x, y + 1))) c.fillRect(px + ins - 1, py + T - ins - 1, T - ins * 2 + 2, ins + 2);
    c.fillStyle = col;
    rrect(c, px + ins + 1, py + ins + 1, T - ins * 2 - 2, T - ins * 2 - 2, 7, col);
    if (isP(at(x - 1, y))) c.fillRect(px, py + ins + 1, ins + 2, T - ins * 2 - 2);
    if (isP(at(x + 1, y))) c.fillRect(px + T - ins - 2, py + ins + 1, ins + 2, T - ins * 2 - 2);
    if (isP(at(x, y - 1))) c.fillRect(px + ins + 1, py, T - ins * 2 - 2, ins + 2);
    if (isP(at(x, y + 1))) c.fillRect(px + ins + 1, py + T - ins - 2, T - ins * 2 - 2, ins + 2);
    // 角：となりの2つが道なら、角もうめる（すき間をなくす）
    var L = isP(at(x - 1, y)), Rr = isP(at(x + 1, y)), U = isP(at(x, y - 1)), Dn = isP(at(x, y + 1));
    c.fillStyle = col;
    if (L && U) c.fillRect(px, py, ins + 2, ins + 2);
    if (Rr && U) c.fillRect(px + T - ins - 2, py, ins + 2, ins + 2);
    if (L && Dn) c.fillRect(px, py + T - ins - 2, ins + 2, ins + 2);
    if (Rr && Dn) c.fillRect(px + T - ins - 2, py + T - ins - 2, ins + 2, ins + 2);
    var r = rnd(x * 31 + y * 977);
    if (ch === '_') { c.strokeStyle = 'rgba(90,84,76,.55)'; c.lineWidth = 1; c.strokeRect(px + 6, py + 6, 10, 9); c.strokeRect(px + 16, py + 16, 10, 9); c.strokeRect(px + 17, py + 5, 9, 8); c.strokeRect(px + 5, py + 17, 9, 9); }
    else for (var i = 0; i < 3; i++) circle(c, px + 6 + r() * (T - 12), py + 6 + r() * (T - 12), 1.1, col2);
  }
  function drawWater(c, x, y, P, at, F) {
    var px = x * T, py = y * T, land = function (q) { return q !== '~' && q !== '='; };
    c.fillStyle = P.water; c.fillRect(px, py, T, T);
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(px + 4, py + 10, 12, 2); c.fillRect(px + 18, py + 22, 10, 2);
    var deep = mix(P.water, '#0a1830', 0.25);
    c.fillStyle = deep;
    c.globalAlpha = 0.5;
    if (land(at(x, y - 1))) c.fillRect(px, py, T, 5);
    c.globalAlpha = 1;
    // 岸の白い泡
    c.strokeStyle = 'rgba(240,250,255,.7)'; c.lineWidth = 2;
    var sandy = function (q) { return q === 's'; };
    if (land(at(x, y - 1))) { c.beginPath(); c.moveTo(px, py + 1.5); c.lineTo(px + T, py + 1.5); c.stroke(); }
    if (land(at(x - 1, y)) && at(x - 1, y) !== 'x') { c.beginPath(); c.moveTo(px + 1.5, py); c.lineTo(px + 1.5, py + T); c.stroke(); }
    if (land(at(x + 1, y)) && at(x + 1, y) !== 'x') { c.beginPath(); c.moveTo(px + T - 1.5, py); c.lineTo(px + T - 1.5, py + T); c.stroke(); }
    if (land(at(x, y + 1)) && at(x, y + 1) !== 'x') { c.beginPath(); c.moveTo(px, py + T - 1.5); c.lineTo(px + T, py + T - 1.5); c.stroke(); }
  }
  function drawBridge(c, x, y, at) {
    var px = x * T, py = y * T, vert = at(x, y - 1) === '=' || at(x, y + 1) === '=' || (at(x, y - 1) !== '~' && at(x, y + 1) !== '~');
    c.fillStyle = '#a07a4a'; c.fillRect(px + (vert ? 2 : 0), py + (vert ? 0 : 2), vert ? T - 4 : T, vert ? T : T - 4);
    c.strokeStyle = '#6a4a2a'; c.lineWidth = 1.4;
    for (var i = 0; i <= 4; i++) { c.beginPath(); if (vert) { c.moveTo(px + 2, py + i * 8); c.lineTo(px + T - 2, py + i * 8); } else { c.moveTo(px + i * 8, py + 2); c.lineTo(px + i * 8, py + T - 2); } c.stroke(); }
    c.fillStyle = '#5a3a20'; if (vert) { c.fillRect(px, py, 3, T); c.fillRect(px + T - 3, py, 3, T); } else { c.fillRect(px, py, T, 3); c.fillRect(px, py + T - 3, T, 3); }
  }
  function drawCliff(c, ch, x, y, P, at, r, F) {
    var px = x * T, py = y * T;
    var same = function (q) { return q === ch || (ch === '#' && (q === 'x')) || (ch === 'D' && q === 'x'); };
    var top = ch === 'D' ? P.cliff : ch === 'W' ? '#4a3e38' : ch === 'S' ? '#9a948a' : P.cliff;
    var face = ch === 'D' ? P.cliff2 : ch === 'W' ? '#6a4e36' : ch === 'S' ? '#7a746a' : P.cliff2;
    var open = !same(at(x, y + 1));
    c.fillStyle = top; c.fillRect(px, py, T, T);
    // 上面の模様
    if (ch === '#' || ch === 'D') { for (var i = 0; i < 3; i++) ell(c, px + r() * T, py + r() * T * 0.7, 3 + r() * 5, 2 + r() * 3, mix(top, '#ffffff', 0.08)); if (F.def.theme === 'mountain' && ch === '#' && r() < 0.5) ell(c, px + r() * T, py + r() * 10, 6, 3, 'rgba(110,150,90,.45)'); }
    if (ch === 'W') { c.fillStyle = '#3a302c'; c.fillRect(px, py, T, T); c.fillStyle = '#5a4a40'; for (var k = 0; k < 4; k++) c.fillRect(px + k * 8 + 1, py + 2, 6, T * 0.5); }
    if (open) {
      var fh = ch === 'S' ? 12 : ch === 'W' ? 18 : 14;
      c.fillStyle = face; c.fillRect(px, py + T - fh, T, fh);
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1;
      if (ch === 'W') { for (var q = 0; q < 4; q++) { c.beginPath(); c.moveTo(px + q * 8 + 4, py + T - fh); c.lineTo(px + q * 8 + 4, py + T); c.stroke(); } c.fillStyle = '#2a2220'; c.fillRect(px, py + T - fh - 2, T, 3); }
      else if (ch === 'S') { c.strokeRect(px + 1, py + T - fh + 1, 14, 5); c.strokeRect(px + 16, py + T - fh + 1, 14, 5); c.strokeRect(px + 8, py + T - 6, 14, 5); }
      else { for (var j = 0; j < 4; j++) { var sx = px + 3 + r() * (T - 6); c.beginPath(); c.moveTo(sx, py + T - fh + 2); c.lineTo(sx + (r() - 0.5) * 3, py + T - 1); c.stroke(); } }
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px, py + T - 2, T, 2);
    }
    // となりが歩ける場所なら、ふちに影
    c.fillStyle = 'rgba(0,0,0,.12)';
    if (!same(at(x - 1, y))) c.fillRect(px, py, 2, T);
    if (!same(at(x + 1, y))) c.fillRect(px + T - 2, py, 2, T);
  }
  function drawBush(c, px, py, P, r) {
    ell(c, px + 16, py + 26, 13, 4, 'rgba(0,0,0,.18)');
    var col = P.tree[0], col2 = P.tree[P.tree.length - 1];
    circle(c, px + 10, py + 18, 9, col, OUT, 1.6); circle(c, px + 22, py + 18, 9, col, OUT, 1.6); circle(c, px + 16, py + 12, 10, col2, OUT, 1.6);
    circle(c, px + 13, py + 9, 3, 'rgba(255,255,255,.18)');
  }
  function drawRock(c, px, py, P, r) {
    ell(c, px + 16, py + 26, 12, 4, 'rgba(0,0,0,.2)');
    poly(c, [[px + 5, py + 25], [px + 7, py + 13], [px + 15, py + 7], [px + 25, py + 10], [px + 28, py + 24]], '#8e8a86', OUT, 1.6);
    poly(c, [[px + 9, py + 14], [px + 15, py + 9], [px + 21, py + 11], [px + 14, py + 15]], '#aaa6a0');
  }
  function drawFence(c, x, y, at) {
    var px = x * T, py = y * T, hor = at(x - 1, y) === 'F' || at(x + 1, y) === 'F';
    c.strokeStyle = OUT; c.fillStyle = '#9a7048'; c.lineWidth = 1.4;
    if (hor || !(at(x, y - 1) === 'F' || at(x, y + 1) === 'F')) {
      c.fillRect(px, py + 14, T, 4); c.strokeRect(px, py + 14, T, 4); c.fillRect(px, py + 22, T, 4); c.strokeRect(px, py + 22, T, 4);
      rrect(c, px + 3, py + 8, 6, 22, 2, '#a87a4e', OUT, 1.4); rrect(c, px + 23, py + 8, 6, 22, 2, '#a87a4e', OUT, 1.4);
    } else {
      c.fillRect(px + 13, py, 4, T); c.strokeRect(px + 13, py, 4, T);
      rrect(c, px + 11, py + 4, 8, 22, 2, '#a87a4e', OUT, 1.4);
    }
  }
  function drawSkyEdge(c, x, y, at, r) {
    var px = x * T, py = y * T;
    var g = c.createLinearGradient(0, py, 0, py + T); g.addColorStop(0, '#9ab8f0'); g.addColorStop(1, '#c8d8f8');
    c.fillStyle = g; c.fillRect(px, py, T, T);
    if (at(x, y - 1) === 'c' || at(x - 1, y) === 'c' || at(x + 1, y) === 'c' || at(x, y + 1) === 'c') {
      for (var i = 0; i < 3; i++) circle(c, px + r() * T, py + r() * T, 6 + r() * 6, 'rgba(255,255,255,.85)');
    }
  }

  // ---- 背の高いもの（木・松・竹）：前後関係のため、1本ずつ画像にして使う ----
  var tallCache = {};
  DW.tallSprite = function (kind, theme, variant, scale) {
    var k = kind + '|' + theme + '|' + variant + '|' + scale;
    if (tallCache[k]) return tallCache[k];
    var P = THEME[theme] || THEME.village, W = T * 1.6, H = T * 2.6;
    var cv = mk(W * scale, H * scale), c = cv.getContext('2d'); c.scale(scale, scale);
    var ox = (W - T) / 2, base = H - 4, cx = W / 2, R = rnd(variant * 977 + kind.length * 31);
    if (kind === 'T') {
      ell(c, cx + 3, base - 2, 15, 5, 'rgba(0,0,0,.22)');
      rrect(c, cx - 4, base - 20, 8, 20, 3, P.trunk, OUT, 1.6);
      var cols = P.tree, rr = 13 + R() * 3;
      circle(c, cx - 8, base - 26, rr * 0.85, cols[0], OUT, 1.8); circle(c, cx + 8, base - 26, rr * 0.85, cols[0], OUT, 1.8);
      circle(c, cx, base - 38, rr, cols[1] || cols[0], OUT, 1.8);
      circle(c, cx - 3, base - 30, rr * 0.75, cols[2] || cols[0]);
      circle(c, cx - 5, base - 44, 4, 'rgba(255,255,255,.18)');
    } else if (kind === 'Y') {
      ell(c, cx + 3, base - 2, 13, 4, 'rgba(0,0,0,.22)');
      rrect(c, cx - 3, base - 14, 6, 14, 2, P.trunk, OUT, 1.5);
      var pc = P.tree;
      for (var i = 0; i < 3; i++) { var yy = base - 12 - i * 13, ww = 17 - i * 4; poly(c, [[cx - ww, yy], [cx + ww, yy], [cx + 2, yy - 20], [cx - 2, yy - 20]], pc[Math.min(i, pc.length - 1)], OUT, 1.6); }
      c.fillStyle = 'rgba(255,255,255,.12)'; poly(c, [[cx - 4, base - 46], [cx, base - 52], [cx + 1, base - 40]], 'rgba(255,255,255,.15)');
    } else if (kind === 'B') {
      for (var j = 0; j < 4; j++) {
        var bx = 6 + j * 7 + R() * 3, top = base - 46 - R() * 18;
        c.fillStyle = j % 2 ? '#6fa03c' : '#82b44a'; c.strokeStyle = '#2e4a1c'; c.lineWidth = 1.2;
        c.fillRect(bx, top, 4, base - top); c.strokeRect(bx, top, 4, base - top);
        for (var s = top + 10; s < base; s += 11) { c.fillStyle = '#4e7a2a'; c.fillRect(bx - 0.5, s, 5, 1.6); }
        ell(c, bx + 7, top + 4, 8, 2.6, '#9cc85a'); ell(c, bx - 3, top + 12, 7, 2.4, '#8cbc50');
      }
    }
    tallCache[k] = { cv: cv, ox: ox, oy: H - T, w: W, h: H };
    return tallCache[k];
  };

  // ---- 建物・置物 ----
  var decoCache = {};
  DW.decoSprite = function (d, scale) {
    var k = d.kind + '|' + (d.w || 1) + 'x' + (d.h || 1) + '|' + (d.v || '') + '|' + (d.label || '') + '|' + scale;
    if (decoCache[k]) return decoCache[k];
    var w = (d.w || 1) * T, h = (d.h || 1) * T, extra = DECO_H[d.kind] || 16;
    var W = w + 16, H = h + extra + 8;
    var cv = mk(W * scale, H * scale), c = cv.getContext('2d'); c.scale(scale, scale);
    c.translate(8, extra);
    var fn = DECO[d.kind];
    if (fn) fn(c, w, h, d);
    else rrect(c, 2, 2, w - 4, h - 4, 4, '#a07a50', OUT, 1.6);
    decoCache[k] = { cv: cv, ox: 8, oy: extra, w: W, h: H };
    return decoCache[k];
  };
  var DECO_H = { house: 40, inn: 44, bighouse: 48, shrine: 40, shrine_small: 30, torii: 46, stall: 40, lantern: 22, well: 14, dummy: 22, easel: 18, cave: 20, fox: 18, stump: 6, dojo: 44, forge: 46, kura: 40, post: 30, crates: 8, ship: 40, hut: 34, boat: 6, gate: 44, banner: 34, brazier: 18, bell: 50, stair_down: 8, stone_marker: 16 };
  function roofHouse(c, w, h, roof, wall, opt) {
    opt = opt || {};
    ell(c, w / 2 + 4, h - 2, w / 2 + 2, 7, 'rgba(0,0,0,.22)');
    rrect(c, 4, h * 0.25, w - 8, h * 0.75 - 2, 2, wall, OUT, 1.8);
    c.strokeStyle = 'rgba(80,50,30,.5)'; c.lineWidth = 1.2;
    for (var x = 12; x < w - 8; x += 12) { c.beginPath(); c.moveTo(x, h * 0.3); c.lineTo(x, h - 4); c.stroke(); }
    // 戸
    rrect(c, w / 2 - 8, h - 22, 16, 20, 2, '#6a4a2c', OUT, 1.5);
    if (opt.noren) { c.fillStyle = opt.noren; c.fillRect(w / 2 - 10, h - 24, 20, 9); c.strokeStyle = OUT; c.lineWidth = 1.2; c.strokeRect(w / 2 - 10, h - 24, 20, 9); text(c, opt.norenText || '', w / 2, h - 19.5, 7, '#fff'); }
    // 屋根
    poly(c, [[-4, h * 0.32], [w + 4, h * 0.32], [w - 10, -opt.rh], [10, -opt.rh]], roof, OUT, 2);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.3;
    for (var k = 16; k < w - 10; k += 10) { c.beginPath(); c.moveTo(k, -opt.rh + 2); c.lineTo(k + (k - w / 2) * 0.25, h * 0.3); c.stroke(); }
    c.fillStyle = mix(roof, '#000', 0.25); c.fillRect(-4, h * 0.32 - 3, w + 8, 4);
  }
  var ROOFS = ['#6a4a3a', '#5a5a6a', '#7a5a3a', '#4a4a5a'];
  var DECO = {
    house: function (c, w, h, d) { roofHouse(c, w, h, ROOFS[(d.v || 0) % 4], '#e8dcc4', { rh: 36 }); },
    bighouse: function (c, w, h, d) { roofHouse(c, w, h, '#3a3a52', '#f0e6d0', { rh: 44, noren: '#8a2a3a', norenText: d.label ? d.label.slice(0, 2) : '' }); },
    inn: function (c, w, h, d) { roofHouse(c, w, h, '#6a3a2a', '#efe0c8', { rh: 40, noren: '#2a4a8a', norenText: '宿' }); },
    kura: function (c, w, h, d) { ell(c, w / 2 + 4, h - 2, w / 2, 6, 'rgba(0,0,0,.22)'); rrect(c, 4, 6, w - 8, h - 8, 2, '#f4f0e6', OUT, 1.8); c.fillStyle = '#3a3a3a'; c.fillRect(4, h - 16, w - 8, 14); c.strokeStyle = '#f4f0e6'; c.lineWidth = 1.5; for (var i = 10; i < w - 8; i += 8) { c.beginPath(); c.moveTo(i, h - 14); c.lineTo(i + 4, h - 8); c.lineTo(i, h - 2); c.stroke(); } poly(c, [[-2, 10], [w + 2, 10], [w - 8, -30], [8, -30]], '#3a3a42', OUT, 2); text(c, '蔵', w / 2, h / 2 - 2, 14, '#3a2a22'); },
    shrine: function (c, w, h, d) { ell(c, w / 2 + 4, h - 2, w / 2, 6, 'rgba(0,0,0,.22)'); rrect(c, 2, h - 10, w - 4, 10, 2, '#b8b0a0', OUT, 1.6); rrect(c, 8, h * 0.2, w - 16, h * 0.7, 2, '#c8402c', OUT, 1.8); c.fillStyle = '#f4ead0'; c.fillRect(w / 2 - 10, h * 0.35, 20, h * 0.45); c.strokeStyle = OUT; c.strokeRect(w / 2 - 10, h * 0.35, 20, h * 0.45); poly(c, [[-6, h * 0.26], [w + 6, h * 0.26], [w - 4, -30], [4, -30]], '#2e3a44', OUT, 2); circle(c, w / 2, -14, 5, '#e8c050', OUT, 1.4); c.strokeStyle = '#e8c050'; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2, h * 0.36); c.lineTo(w / 2, h * 0.5); c.stroke(); circle(c, w / 2, h * 0.53, 3, '#e8c050', OUT, 1); },
    shrine_small: function (c, w, h, d) { ell(c, w / 2 + 4, h - 2, w / 2, 5, 'rgba(0,0,0,.22)'); rrect(c, 6, h * 0.25, w - 12, h * 0.7, 2, '#c8402c', OUT, 1.6); c.fillStyle = '#f4ead0'; c.fillRect(w / 2 - 7, h * 0.4, 14, h * 0.4); poly(c, [[-2, h * 0.3], [w + 2, h * 0.3], [w - 6, -22], [6, -22]], '#3a3a46', OUT, 2); if (d.label) text(c, d.label, w / 2, h * 0.62, 8, '#8a2a2a'); },
    torii: function (c, w, h, d) { var col = d.v === 'gold' ? '#e0b040' : '#d8402c'; rrect(c, 6, -30, 7, h + 30, 2, col, OUT, 1.6); rrect(c, w - 13, -30, 7, h + 30, 2, col, OUT, 1.6); rrect(c, -2, -40, w + 4, 8, 3, col, OUT, 1.8); c.fillStyle = '#2a2226'; c.fillRect(-4, -44, w + 8, 4); rrect(c, 2, -26, w - 4, 5, 2, col, OUT, 1.4); },
    stall: function (c, w, h, d) { var col = { red: '#c8402c', blue: '#2e5a9a', green: '#3a8a4a' }[d.v] || '#c8402c'; ell(c, w / 2 + 4, h - 2, w / 2, 5, 'rgba(0,0,0,.2)'); rrect(c, 2, h * 0.35, w - 4, h * 0.6, 2, '#9a6a3e', OUT, 1.6); for (var i = 0; i < 4; i++) circle(c, 10 + i * (w - 20) / 3, h * 0.42, 4, ['#f0a040', '#f4e0a0', '#e86060', '#8ac050'][i % 4], OUT, 1); rrect(c, 4, -18, 4, h * 0.4 + 18, 1, '#6a4a2a', OUT, 1.2); rrect(c, w - 8, -18, 4, h * 0.4 + 18, 1, '#6a4a2a', OUT, 1.2); poly(c, [[-4, -6], [w + 4, -6], [w, -22], [0, -22]], col, OUT, 1.8); c.fillStyle = 'rgba(255,255,255,.85)'; for (var j = 0; j < w; j += 12) c.fillRect(j + 2, -20, 5, 13); if (d.label) { rrect(c, w / 2 - 14, -34, 28, 12, 2, '#f8f0dc', OUT, 1.2); text(c, d.label, w / 2, -28, 8, '#3a2a22'); } },
    lantern: function (c, w, h) { ell(c, 16, 28, 8, 3, 'rgba(0,0,0,.22)'); rrect(c, 11, 22, 10, 6, 1, '#a8a29a', OUT, 1.3); rrect(c, 14, 6, 4, 17, 1, '#a8a29a', OUT, 1.2); rrect(c, 8, -8, 16, 15, 2, '#c8c2b8', OUT, 1.4); c.fillStyle = '#ffd27a'; c.fillRect(12, -4, 8, 7); poly(c, [[5, -8], [27, -8], [20, -16], [12, -16]], '#9a948a', OUT, 1.4); },
    well: function (c) { ell(c, 16, 26, 13, 4, 'rgba(0,0,0,.22)'); ell(c, 16, 18, 13, 8, '#9a948a', OUT, 1.6); ell(c, 16, 16, 9, 5, '#2a3a5a'); rrect(c, 3, -6, 4, 22, 1, '#6a4a2a', OUT, 1.2); rrect(c, 25, -6, 4, 22, 1, '#6a4a2a', OUT, 1.2); poly(c, [[0, -4], [32, -4], [26, -12], [6, -12]], '#5a4a3a', OUT, 1.4); },
    dummy: function (c) { ell(c, 16, 28, 9, 3, 'rgba(0,0,0,.22)'); rrect(c, 14, 4, 4, 24, 1, '#6a4a2a', OUT, 1.3); rrect(c, 4, 6, 24, 4, 1, '#6a4a2a', OUT, 1.2); ell(c, 16, 10, 7, 9, '#d8b870', OUT, 1.4); circle(c, 16, -6, 6, '#e0c47a', OUT, 1.4); },
    easel: function (c) { c.strokeStyle = '#6a4a2a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(8, 28); c.lineTo(16, -4); c.lineTo(24, 28); c.stroke(); rrect(c, 6, -4, 20, 16, 1, '#fffaf0', OUT, 1.4); circle(c, 12, 2, 3, '#e86a6a'); circle(c, 19, 5, 3, '#6ab0e8'); circle(c, 15, 8, 2.5, '#f0d040'); },
    cave: function (c, w, h, d) { poly(c, [[0, h], [0, 6], [w * 0.2, -12], [w * 0.8, -12], [w, 6], [w, h]], '#5e5850', OUT, 2); ell(c, w / 2, h - 2, w * 0.3, h * 0.85, '#0e0a0a'); c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(w * 0.15, -6, w * 0.15, 8); },
    fox: function (c) { ell(c, 16, 28, 9, 3, 'rgba(0,0,0,.22)'); rrect(c, 8, 18, 16, 10, 2, '#b8b0a0', OUT, 1.3); ell(c, 16, 10, 7, 9, '#f4f0e6', OUT, 1.4); poly(c, [[10, 2], [12, -8], [15, 0]], '#f4f0e6', OUT, 1.2); poly(c, [[22, 2], [20, -8], [17, 0]], '#f4f0e6', OUT, 1.2); c.fillStyle = '#c8402c'; c.fillRect(11, 12, 10, 3); },
    stump: function (c) { ell(c, 16, 24, 10, 6, '#8a6040', OUT, 1.4); ell(c, 16, 20, 10, 5, '#c8a070', OUT, 1.4); },
    dojo: function (c, w, h, d) { roofHouse(c, w, h, '#2e3a46', '#efe4cc', { rh: 40, noren: '#2a2a2a', norenText: '道場' }); },
    forge: function (c, w, h, d) { roofHouse(c, w, h, '#4a3a32', '#d8ccb4', { rh: 38, noren: '#a83a2a', norenText: '鍛冶' }); rrect(c, w - 22, -46, 12, 24, 2, '#6a5a52', OUT, 1.6); },
    post: function (c, w, h) { rrect(c, 4, h * 0.3, w - 8, h * 0.68, 2, '#9a6a3e', OUT, 1.6); poly(c, [[-2, h * 0.34], [w + 2, h * 0.34], [w - 6, -14], [6, -14]], '#4a6a8a', OUT, 1.8); text(c, '伝令', w / 2, h * 0.62, 9, '#fff6e0'); },
    crates: function (c, w) { for (var i = 0; i < w / 16; i++) { rrect(c, i * 16 + 1, 8, 14, 20, 2, '#a8804e', OUT, 1.4); c.strokeStyle = OUT; c.lineWidth = 1; c.beginPath(); c.moveTo(i * 16 + 1, 8); c.lineTo(i * 16 + 15, 28); c.stroke(); } },
    ship: function (c, w, h) { poly(c, [[0, h * 0.5], [w, h * 0.5], [w - 18, h], [14, h]], '#6a3a22', OUT, 2); c.fillStyle = '#8a5a32'; c.fillRect(6, h * 0.45, w - 12, 6); rrect(c, w / 2 - 3, -34, 6, h * 0.5 + 34, 1, '#5a3a22', OUT, 1.4); poly(c, [[w / 2 + 3, -30], [w / 2 + 52, -10], [w / 2 + 3, 20]], '#f4ecd8', OUT, 1.6); text(c, '雑', w / 2 + 20, -5, 14, '#a82a2a'); },
    hut: function (c, w, h) { roofHouse(c, w, h, '#8a7a5a', '#d8c8a0', { rh: 28 }); },
    boat: function (c, w) { poly(c, [[0, 12], [w, 12], [w - 8, 24], [8, 24]], '#7a4a2a', OUT, 1.6); },
    gate: function (c, w, h, d) { rrect(c, 0, -40, w * 0.33, h + 40, 2, '#3a2c26', OUT, 1.8); rrect(c, w * 0.67, -40, w * 0.33, h + 40, 2, '#3a2c26', OUT, 1.8); poly(c, [[-6, -36], [w + 6, -36], [w - 4, -50], [4, -50]], '#2a2226', OUT, 2); rrect(c, w * 0.3, -32, w * 0.4, 10, 2, '#f0e6d0', OUT, 1.4); if (d.label) text(c, '風魔', w / 2, -27, 8, '#3a2a22'); },
    banner: function (c) { rrect(c, 14, -30, 4, 58, 1, '#4a3a2e', OUT, 1.2); rrect(c, 17, -28, 13, 30, 1, '#5a2a6a', OUT, 1.4); text(c, '風', 23.5, -13, 9, '#f0e6d0'); },
    brazier: function (c) { ell(c, 16, 28, 8, 3, 'rgba(0,0,0,.25)'); c.strokeStyle = '#3a3030'; c.lineWidth = 2; c.beginPath(); c.moveTo(9, 28); c.lineTo(16, 8); c.lineTo(23, 28); c.stroke(); ell(c, 16, 6, 10, 4, '#4a3e3a', OUT, 1.4); },
    bell: function (c, w, h) { ell(c, w / 2 + 4, h - 2, w / 2, 7, 'rgba(0,0,0,.22)'); rrect(c, 6, -40, 8, h + 40, 2, '#c8402c', OUT, 1.6); rrect(c, w - 14, -40, 8, h + 40, 2, '#c8402c', OUT, 1.6); rrect(c, 0, -48, w, 9, 3, '#3a3040', OUT, 1.8); poly(c, [[w / 2 - 22, h - 6], [w / 2 + 22, h - 6], [w / 2 + 16, -26], [w / 2 - 16, -26]], '#c8a050', OUT, 2); c.strokeStyle = 'rgba(80,50,20,.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2 - 6, -20); c.lineTo(w / 2 + 2, 0); c.lineTo(w / 2 - 4, 14); c.lineTo(w / 2 + 4, h - 8); c.stroke(); },
    stair_down: function (c, w, h) { rrect(c, 0, 0, w, h, 3, '#2a2236', OUT, 1.6); for (var i = 0; i < 4; i++) { c.fillStyle = mix('#5a4a70', '#0a0810', i / 4); c.fillRect(6 + i * 3, 6 + i * 9, w - 12 - i * 6, 7); } },
    stone_marker: function (c) { ell(c, 16, 28, 8, 3, 'rgba(0,0,0,.22)'); rrect(c, 9, -2, 14, 30, 4, '#8e8a84', OUT, 1.4); text(c, '霧', 16, 10, 9, '#4a4440'); }
  };
  // 光る物（夜の明かり）
  DW.LIGHTS = { lantern: { r: 70, col: '255,200,110', y: -2 }, brazier: { r: 85, col: '255,150,70', y: 0 }, shrine: { r: 60, col: '255,220,150', y: 10 }, stall: { r: 46, col: '255,210,140', y: 8 }, inn: { r: 50, col: '255,210,140', y: 30 }, bell: { r: 90, col: '255,240,190', y: 20 }, torii: { r: 30, col: '255,180,120', y: 0 }, forge: { r: 60, col: '255,140,60', y: 30 }, ship: { r: 40, col: '255,210,140', y: 10 }, gate: { r: 50, col: '255,170,90', y: 10 }, post: { r: 34, col: '255,210,140', y: 20 }, kura: { r: 30, col: '255,210,140', y: 30 }, hut: { r: 40, col: '255,200,130', y: 26 }, dojo: { r: 46, col: '255,210,140', y: 30 }, house: { r: 40, col: '255,206,140', y: 30 }, bighouse: { r: 56, col: '255,206,140', y: 36 } };

  DW.T = T; DW.OUT = OUT; DW.mk = mk; DW.circle = circle; DW.ell = ell; DW.poly = poly; DW.rrect = rrect; DW.text = text; DW.mix = mix; DW.rnd = rnd;
  root.NYT_DRAW = DW;
})(typeof window !== 'undefined' ? window : globalThis);
