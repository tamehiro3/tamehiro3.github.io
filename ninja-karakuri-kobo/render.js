/* ニンジャからくり工房 — 描画（キャンバス）
 *
 * 遊ぶ画面は奥行きを少しつけた 2.5D：足場の前の面・上の面・右の面を描き、人や仕掛けは奥行きの真ん中に立つ。
 * 作る画面は奥行きなしの平らな図（マス目がわかりやすい）。
 * 外見テーマ（竹林・屋敷・天空道場）で変わるのは背景と足場の外観だけ。危険な物（罠・落とし穴・水路）の見た目はどのテーマでも同じ。
 * 人物は art.js（NinjaArt）の SVG を画像にして使う（読みこみ中は丸で代わりに描く）。
 */
(function (root) {
  'use strict';
  var D = root.KK_DATA, E = root.KK_ENGINE, A = root.NinjaArt;
  var GW = D.GRID.W, GH = D.GRID.H, OUT = '#2b1d16';
  var HAZ = { steel: '#cfd4dc', steelDk: '#8a919c', tip: '#d8402c', warn: '#ffb020', rimA: '#d8402c', rimB: '#fff4e0', water: '#3a8fd8', waterDk: '#1f5a9a', hole: '#1a1210' };

  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
  function mix(a, b, t) {
    var A1 = parseInt(a.slice(1), 16), B1 = parseInt(b.slice(1), 16);
    var r = Math.round(((A1 >> 16) & 255) * (1 - t) + ((B1 >> 16) & 255) * t), g = Math.round(((A1 >> 8) & 255) * (1 - t) + ((B1 >> 8) & 255) * t), bl = Math.round((A1 & 255) * (1 - t) + (B1 & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function makeCanvas(w, h) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

  /* ---------- 見え方（マスの大きさと奥行き） ---------- */
  // mode: 'play'（2.5D）／'edit'（平ら）
  function View(w, h, mode, opt) {
    opt = opt || {};
    this.w = w; this.h = h; this.mode = mode;
    var rowsNeeded = GH + (mode === 'play' ? 1.1 : 0.3);
    var minCols = opt.minCols || (mode === 'play' ? (w / h < 0.8 ? 9 : 11) : 12); // 縦長の画面ではマスを大きめに
    this.T = opt.T || Math.max(8, Math.floor(Math.min(h / rowsNeeded, w / minCols)));
    this.dx = mode === 'play' ? this.T * 0.2 : 0;
    this.dy = mode === 'play' ? this.T * 0.3 : 0;
    this.camX = 0; this.camY = 0;
    this.visCols = w / this.T; this.visRows = h / this.T;
    this.fitsY = GH * this.T + this.dy <= h;
    this.bottom0 = this.fitsY ? (h - GH * this.T - this.dy) / 2 + this.dy + GH * this.T : h;
  }
  // ワールド（マス、y は上へ）→ 画面。z：奥行き（0＝前 1＝奥）
  View.prototype.sx = function (x, z) { return (x - this.camX) * this.T + (z || 0) * this.dx; };
  View.prototype.sy = function (y, z) { return this.bottom0 - (y - this.camY) * this.T - (z || 0) * this.dy; };
  View.prototype.clampCam = function (tx, ty) {
    var maxX = GW + this.dx / this.T + 0.2 - this.visCols;
    tx = this.visCols >= GW + 0.6 ? (GW - this.visCols) / 2 + this.dx / this.T / 2 : Math.max(-0.2, Math.min(maxX, tx));
    ty = this.fitsY ? 0 : Math.max(-0.3, Math.min(GH + this.dy / this.T + 0.2 - this.visRows, ty));
    return { x: tx, y: ty };
  };
  View.prototype.follow = function (px, py, k) {
    var c = this.clampCam(px - this.visCols * 0.42, py - this.visRows * 0.38);
    k = Math.min(1, k == null ? 0.18 : k);
    this.camX += (c.x - this.camX) * k; this.camY += (c.y - this.camY) * k;
  };
  View.prototype.snap = function (px, py) { this.follow(px, py, 1); };
  // 画面 → マス（作る画面用。奥行きなし）
  View.prototype.cell = function (sx, sy) { return { x: Math.floor(sx / this.T + this.camX), y: Math.floor((this.bottom0 - sy) / this.T + this.camY) }; };

  /* ---------- 背景 ---------- */
  function drawBackground(ctx, theme, v, t) {
    var th = D.THEMES[theme] || D.THEMES.chikurin, w = v.w, h = v.h, i;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    var par = v.camX * v.T;
    if (theme === 'chikurin') {
      for (var layer = 0; layer < 2; layer++) {
        var sp = layer ? 0.5 : 0.25, col = layer ? th.near : th.far, alpha = layer ? 0.55 : 0.45, gap = layer ? v.T * 2.6 : v.T * 1.7;
        ctx.globalAlpha = alpha; ctx.fillStyle = col;
        var off = -((par * sp) % gap);
        for (i = -1; i < w / gap + 2; i++) {
          var bx = off + i * gap + hash(i * 17 + layer) * gap * 0.5, bw = v.T * (layer ? 0.32 : 0.22);
          ctx.fillRect(bx, 0, bw, h);
          for (var k = 1; k < 8; k++) ctx.fillRect(bx - 1, k * h / 8 + hash(i + k) * 20, bw + 2, 2);
          ctx.beginPath(); ctx.ellipse(bx + bw * 3, h * (0.2 + hash(i * 3) * 0.3), v.T * 0.9, v.T * 0.25, -0.3, 0, 7); ctx.fill();
        }
      }
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
      for (i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(w * (0.2 + i * 0.35) - ((par * 0.1) % w), h * 0.62, w * 0.3, v.T * 0.6, 0, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (theme === 'yashiki') {
      var pw = v.T * 2.2, off2 = -((par * 0.4) % pw);
      for (i = -1; i < w / pw + 2; i++) {
        var px0 = off2 + i * pw;
        ctx.fillStyle = '#f8ecd6'; ctx.fillRect(px0 + 3, h * 0.08, pw - 6, h * 0.7);
        ctx.strokeStyle = '#c9a57a'; ctx.lineWidth = 2;
        for (var gx = 1; gx < 3; gx++) { ctx.beginPath(); ctx.moveTo(px0 + gx * pw / 3, h * 0.08); ctx.lineTo(px0 + gx * pw / 3, h * 0.78); ctx.stroke(); }
        for (var gy = 1; gy < 5; gy++) { ctx.beginPath(); ctx.moveTo(px0 + 3, h * 0.08 + gy * h * 0.14); ctx.lineTo(px0 + pw - 3, h * 0.08 + gy * h * 0.14); ctx.stroke(); }
        ctx.fillStyle = '#8a5a3a'; ctx.fillRect(px0 - 3, 0, 6, h);
      }
      ctx.fillStyle = '#8a5a3a'; ctx.fillRect(0, h * 0.05, w, v.T * 0.25); ctx.fillRect(0, h * 0.78, w, v.T * 0.3);
      // 提灯
      var lg = v.T * 5.5, off3 = -((par * 0.4) % lg);
      for (i = -1; i < w / lg + 2; i++) {
        var lx = off3 + i * lg + lg / 2, ly = h * 0.16;
        ctx.strokeStyle = '#5a3a26'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lx, h * 0.06); ctx.lineTo(lx, ly); ctx.stroke();
        ctx.fillStyle = '#e8563a'; ctx.beginPath(); ctx.ellipse(lx, ly + v.T * 0.35, v.T * 0.28, v.T * 0.36, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,150,.5)'; ctx.beginPath(); ctx.ellipse(lx, ly + v.T * 0.35, v.T * 0.14, v.T * 0.26, 0, 0, 7); ctx.fill();
      }
    } else {
      // 天空：遠くの山と雲
      ctx.fillStyle = 'rgba(120,150,190,.35)';
      var mw = v.T * 9, off4 = -((par * 0.12) % mw);
      for (i = -1; i < w / mw + 2; i++) {
        var mx = off4 + i * mw;
        ctx.beginPath(); ctx.moveTo(mx, h * 0.75); ctx.lineTo(mx + mw * 0.35, h * (0.35 + hash(i) * 0.15)); ctx.lineTo(mx + mw * 0.7, h * 0.75); ctx.closePath(); ctx.fill();
      }
      for (var cl = 0; cl < 2; cl++) {
        var cw = v.T * (cl ? 7 : 5), off5 = -((par * (cl ? 0.35 : 0.2) + t * (cl ? 6 : 3)) % cw);
        ctx.fillStyle = cl ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.55)';
        for (i = -1; i < w / cw + 2; i++) {
          var cx = off5 + i * cw, cy = h * (cl ? 0.3 + hash(i * 7) * 0.25 : 0.15 + hash(i * 5) * 0.2);
          cloud(ctx, cx + cw * 0.3, cy, v.T * (cl ? 1.3 : 0.9));
        }
      }
    }
    // 下の谷（落ちると戻る）
    var bottom = v.sy(0, 0);
    if (bottom < h) {
      var g2 = ctx.createLinearGradient(0, bottom, 0, h);
      if (theme === 'tenku') { g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, 'rgba(255,255,255,.95)'); }
      else { g2.addColorStop(0, 'rgba(30,20,15,.15)'); g2.addColorStop(1, 'rgba(20,12,8,.8)'); }
      ctx.fillStyle = g2; ctx.fillRect(0, bottom, w, h - bottom);
      if (theme === 'tenku') { ctx.fillStyle = 'rgba(255,255,255,.9)'; for (i = 0; i < 8; i++) cloud(ctx, ((i * v.T * 5 - par * 0.6 - t * 8) % (w + v.T * 8)) - v.T * 2, h - v.T * 0.2, v.T * 1.2); }
    }
  }
  function cloud(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, 7); ctx.arc(x + r * 0.7, y - r * 0.25, r * 0.7, 0, 7); ctx.arc(x + r * 1.5, y, r * 0.55, 0, 7); ctx.arc(x + r * 0.8, y + r * 0.2, r * 0.6, 0, 7); ctx.fill();
  }

  /* ---------- 足場（動かない物）を1枚の絵にしておく ---------- */
  function solidGrid(level) {
    var g = new Uint8Array(GW * GH), skin = new Int8Array(GW * GH).fill(-1);
    (level.parts || []).forEach(function (p) {
      if (p.part_id !== 'floor') return;
      for (var k = 0; k < p.len; k++) {
        var x = p.dir === 'v' ? p.x : p.x + k, y = p.dir === 'v' ? p.y + k : p.y;
        if (x >= 0 && x < GW && y >= 0 && y < GH) { g[y * GW + x] = 1; skin[y * GW + x] = p.skin || 0; }
      }
    });
    return { g: g, skin: skin };
  }
  function tileLayer(level, theme, v) {
    var T = v.T, cw = GW * T + v.dx + 4, ch = GH * T + v.dy + 4;
    var cv = makeCanvas(cw, ch); if (!cv) return null;
    var ctx = cv.getContext('2d');
    var lv = { sx: function (x, z) { return x * T + (z || 0) * v.dx + 2; }, sy: function (y, z) { return (GH - y) * T - (z || 0) * v.dy + v.dy + 2; }, T: T, dx: v.dx, dy: v.dy };
    var sg = solidGrid(level), th = D.THEMES[theme] || D.THEMES.chikurin;
    function solid(x, y) { return x >= 0 && x < GW && y >= 0 && y < GH && sg.g[y * GW + x]; }
    var x, y;
    // 奥の面（上・右）
    if (v.dx) {
      for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
        if (!solid(x, y)) continue;
        var sk = sg.skin[y * GW + x], sx0 = lv.sx(x, 0), sy0 = lv.sy(y + 1, 0);
        if (!solid(x, y + 1)) {
          ctx.fillStyle = th.top[sk];
          ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 + T, sy0); ctx.lineTo(sx0 + T + v.dx, sy0 - v.dy); ctx.lineTo(sx0 + v.dx, sy0 - v.dy); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(43,29,22,.35)'; ctx.lineWidth = 1; ctx.stroke();
          topDetail(ctx, theme, sk, sx0, sy0, T, v, x, y);
        }
        if (!solid(x + 1, y)) {
          ctx.fillStyle = mix(th.floor[sk], '#1a1110', 0.32);
          ctx.beginPath(); ctx.moveTo(sx0 + T, sy0); ctx.lineTo(sx0 + T + v.dx, sy0 - v.dy); ctx.lineTo(sx0 + T + v.dx, sy0 + T - v.dy); ctx.lineTo(sx0 + T, sy0 + T); ctx.closePath(); ctx.fill();
        }
      }
    }
    // 前の面
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      if (!solid(x, y)) continue;
      var s2 = sg.skin[y * GW + x], fx = lv.sx(x, 0), fy = lv.sy(y + 1, 0);
      ctx.fillStyle = th.floor[s2]; ctx.fillRect(fx, fy, T + 0.5, T + 0.5);
      frontDetail(ctx, theme, s2, fx, fy, T, x, y, solid(x, y + 1), solid(x - 1, y), solid(x + 1, y));
    }
    // 輪郭（外側だけ）
    ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, T * 0.06); ctx.lineCap = 'round';
    ctx.beginPath();
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      if (!solid(x, y)) continue;
      var ox = lv.sx(x, 0), oy = lv.sy(y + 1, 0);
      if (!solid(x, y + 1)) { ctx.moveTo(ox, oy); ctx.lineTo(ox + T, oy); }
      if (!solid(x, y - 1)) { ctx.moveTo(ox, oy + T); ctx.lineTo(ox + T, oy + T); }
      if (!solid(x - 1, y)) { ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + T); }
      if (!solid(x + 1, y)) { ctx.moveTo(ox + T, oy); ctx.lineTo(ox + T, oy + T); }
    }
    ctx.stroke();
    // 落とし穴と装飾とスタート
    (level.parts || []).forEach(function (p) {
      if (p.part_id === 'pit') drawPit(ctx, lv, p);
    });
    (level.parts || []).forEach(function (p) {
      if (p.part_id === 'deco') drawDeco(ctx, lv, p);
      if (p.part_id === 'start') drawStartSign(ctx, lv, p);
    });
    return { cv: cv, ox: 2, oy: v.dy + 2 };
  }
  function topDetail(ctx, theme, sk, x, y, T, v, gx, gy) {
    if (theme === 'chikurin' && sk === 0) { // 草
      ctx.strokeStyle = 'rgba(60,110,40,.7)'; ctx.lineWidth = 1.2;
      for (var i = 0; i < 3; i++) { var hx = x + T * (0.2 + i * 0.3) + v.dx * 0.5; ctx.beginPath(); ctx.moveTo(hx, y - v.dy * 0.4); ctx.lineTo(hx + 1.5, y - v.dy * 0.4 - T * 0.12); ctx.stroke(); }
    }
    if (theme === 'tenku' && sk === 0) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(x + T / 2 + v.dx / 2, y - v.dy / 2, T * 0.45, v.dy * 0.4, 0, 0, 7); ctx.fill(); }
  }
  function frontDetail(ctx, theme, sk, x, y, T, gx, gy, covered, left, right) {
    var r = hash(gx * 97 + gy * 13);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, T + 0.5, T + 0.5); ctx.clip();
    if (theme === 'chikurin') {
      if (sk === 0) { // 土：上に草の帯、小石
        if (!covered) { ctx.fillStyle = '#6f9a4a'; ctx.fillRect(x, y, T + 1, T * 0.18); ctx.fillStyle = '#5b8a3a'; for (var i = 0; i < 4; i++) ctx.fillRect(x + i * T / 4 + r * 3, y + T * 0.16, T / 8, T * 0.08); }
        ctx.fillStyle = 'rgba(60,40,20,.25)'; ctx.beginPath(); ctx.arc(x + T * (0.3 + r * 0.4), y + T * 0.65, T * 0.07, 0, 7); ctx.fill();
      } else if (sk === 1) { stoneBricks(ctx, x, y, T, gx, gy, 'rgba(40,40,40,.25)'); }
      else { ctx.fillStyle = 'rgba(90,120,40,.45)'; ctx.fillRect(x + T * 0.1, y, T * 0.18, T); ctx.fillRect(x + T * 0.55, y, T * 0.18, T); ctx.fillStyle = 'rgba(60,90,30,.6)'; ctx.fillRect(x, y + T * 0.48, T, T * 0.06); }
    } else if (theme === 'yashiki') {
      if (sk === 0) { ctx.strokeStyle = 'rgba(80,45,20,.4)'; ctx.lineWidth = 1; for (var j = 1; j < 3; j++) { ctx.beginPath(); ctx.moveTo(x, y + j * T / 3); ctx.lineTo(x + T, y + j * T / 3); ctx.stroke(); } ctx.fillStyle = 'rgba(60,30,10,.3)'; ctx.fillRect(x + T * (0.2 + r * 0.5), y + T * 0.1, 1.5, T * 0.2); }
      else if (sk === 1) stoneBricks(ctx, x, y, T, gx, gy, 'rgba(50,45,40,.3)');
      else { ctx.fillStyle = 'rgba(255,255,255,.12)'; for (var q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(x + T * (q * 0.4 + 0.1), y + T * 0.35, T * 0.25, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.arc(x + T * (q * 0.4 - 0.1), y + T * 0.85, T * 0.25, Math.PI, 0); ctx.fill(); } }
    } else {
      if (sk === 0) { ctx.fillStyle = 'rgba(200,220,240,.7)'; ctx.beginPath(); ctx.arc(x + T * 0.3, y + T * 0.8, T * 0.3, 0, 7); ctx.arc(x + T * 0.75, y + T * 0.85, T * 0.28, 0, 7); ctx.fill(); }
      else if (sk === 1) stoneBricks(ctx, x, y, T, gx, gy, 'rgba(60,70,90,.3)');
      else { ctx.fillStyle = '#d8a63a'; if (!covered) ctx.fillRect(x, y, T + 1, T * 0.12); ctx.fillRect(x, y + T * 0.88, T + 1, T * 0.12); }
    }
    ctx.restore();
  }
  function stoneBricks(ctx, x, y, T, gx, gy, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + T / 2); ctx.lineTo(x + T, y + T / 2);
    var o = (gy % 2) * T / 2; ctx.moveTo(x + o + T * 0.25, y); ctx.lineTo(x + o + T * 0.25, y + T / 2); ctx.moveTo(x + (T / 2 - o) + T * 0.25, y + T / 2); ctx.lineTo(x + (T / 2 - o) + T * 0.25, y + T);
    ctx.stroke();
  }

  /* ---------- 落とし穴（どのテーマでも同じ見た目） ---------- */
  function drawPit(ctx, v, p) {
    var T = v.T;
    for (var i = 0; i < p.len; i++) {
      var x = v.sx(p.x + i, 0), y = v.sy(p.y + 1, 0);
      var g = ctx.createLinearGradient(0, y, 0, y + T);
      g.addColorStop(0, '#3a2a22'); g.addColorStop(1, HAZ.hole);
      ctx.fillStyle = g; ctx.fillRect(x, y + T * 0.12, T + 0.5, T * 0.88);
      if (v.dx) { ctx.fillStyle = HAZ.hole; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + T, y); ctx.lineTo(x + T + v.dx, y - v.dy); ctx.lineTo(x + v.dx, y - v.dy); ctx.closePath(); ctx.fill(); }
      // ふちの赤白のしま（危険）
      for (var k = 0; k < 4; k++) { ctx.fillStyle = k % 2 ? HAZ.rimB : HAZ.rimA; ctx.fillRect(x + k * T / 4, y, T / 4 + 0.5, T * 0.12); }
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, T, T * 0.12);
      // ぎざぎざ（穴の中）
      ctx.fillStyle = '#5a4a40';
      ctx.beginPath(); ctx.moveTo(x, y + T * 0.12); for (var j = 0; j <= 4; j++) ctx.lineTo(x + j * T / 4, y + T * (j % 2 ? 0.3 : 0.14)); ctx.lineTo(x + T, y + T * 0.12); ctx.closePath(); ctx.fill();
    }
  }

  /* ---------- 装飾（見た目だけ） ---------- */
  function drawDeco(ctx, v, p) {
    var T = v.T, cx = v.sx(p.x + 0.5, 0.5), by = v.sy(p.y, 0.5), f = p.dir === 'l' ? -1 : 1;
    ctx.save(); ctx.translate(cx, by); ctx.scale(f, 1); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.2, T * 0.05); ctx.strokeStyle = OUT;
    switch (p.kind) {
      case 0: // 灯籠
        ctx.fillStyle = '#a8a39a'; ctx.fillRect(-T * 0.1, -T * 0.5, T * 0.2, T * 0.5); ctx.strokeRect(-T * 0.1, -T * 0.5, T * 0.2, T * 0.5);
        ctx.fillRect(-T * 0.25, -T * 0.08, T * 0.5, T * 0.08);
        ctx.fillStyle = '#fff1b8'; ctx.fillRect(-T * 0.18, -T * 0.78, T * 0.36, T * 0.28); ctx.strokeRect(-T * 0.18, -T * 0.78, T * 0.36, T * 0.28);
        ctx.fillStyle = '#8a857c'; ctx.beginPath(); ctx.moveTo(-T * 0.32, -T * 0.78); ctx.lineTo(0, -T * 0.98); ctx.lineTo(T * 0.32, -T * 0.78); ctx.closePath(); ctx.fill(); ctx.stroke();
        break;
      case 1: // 竹
        for (var i = 0; i < 3; i++) { var bx = (i - 1) * T * 0.22, bh = T * (1.3 + i * 0.25); ctx.fillStyle = i === 1 ? '#6f9a3a' : '#8ab24a'; ctx.fillRect(bx - T * 0.07, -bh, T * 0.14, bh); ctx.strokeRect(bx - T * 0.07, -bh, T * 0.14, bh); for (var k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(bx - T * 0.08, -bh * k / 4); ctx.lineTo(bx + T * 0.08, -bh * k / 4); ctx.stroke(); } }
        ctx.fillStyle = '#5b8a3a'; ctx.beginPath(); ctx.ellipse(T * 0.2, -T * 1.4, T * 0.2, T * 0.07, -0.5, 0, 7); ctx.fill();
        break;
      case 2: // 松
        ctx.fillStyle = '#7a5230'; ctx.fillRect(-T * 0.06, -T * 0.6, T * 0.12, T * 0.6); ctx.strokeRect(-T * 0.06, -T * 0.6, T * 0.12, T * 0.6);
        ctx.fillStyle = '#3f7a3f'; [[0, -0.95, 0.42], [-0.22, -0.7, 0.3], [0.24, -0.72, 0.3]].forEach(function (c) { ctx.beginPath(); ctx.ellipse(c[0] * T, c[1] * T, c[2] * T, c[2] * T * 0.55, 0, 0, 7); ctx.fill(); ctx.stroke(); });
        break;
      case 3: // 岩
        ctx.fillStyle = '#9a968e'; ctx.beginPath(); ctx.moveTo(-T * 0.4, 0); ctx.quadraticCurveTo(-T * 0.35, -T * 0.45, 0, -T * 0.48); ctx.quadraticCurveTo(T * 0.4, -T * 0.4, T * 0.42, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(-T * 0.12, -T * 0.3, T * 0.1, T * 0.05, -0.4, 0, 7); ctx.fill();
        break;
      case 4: // 花
        ctx.strokeStyle = '#4a7a2a'; ctx.lineWidth = 1.5; [[-0.2, 0.35], [0.05, 0.5], [0.25, 0.3]].forEach(function (c) { ctx.beginPath(); ctx.moveTo(c[0] * T, 0); ctx.lineTo(c[0] * T, -c[1] * T); ctx.stroke(); });
        [['#f07aa0', -0.2, 0.35], ['#f5d040', 0.05, 0.5], ['#ffffff', 0.25, 0.3]].forEach(function (c) { ctx.fillStyle = c[0]; for (var a = 0; a < 5; a++) { ctx.beginPath(); ctx.arc(c[1] * T + Math.cos(a * 1.26) * T * 0.07, -c[2] * T + Math.sin(a * 1.26) * T * 0.07, T * 0.06, 0, 7); ctx.fill(); } ctx.fillStyle = '#f0a020'; ctx.beginPath(); ctx.arc(c[1] * T, -c[2] * T, T * 0.04, 0, 7); ctx.fill(); });
        break;
      case 5: // のぼり
        ctx.fillStyle = '#5a3a26'; ctx.fillRect(-T * 0.3, -T * 1.6, T * 0.06, T * 1.6);
        ctx.fillStyle = '#e8563a'; ctx.fillRect(-T * 0.24, -T * 1.5, T * 0.36, T * 1.0); ctx.strokeRect(-T * 0.24, -T * 1.5, T * 0.36, T * 1.0);
        ctx.fillStyle = '#fff4e0'; ctx.beginPath(); ctx.arc(-T * 0.06, -T * 1.15, T * 0.1, 0, 7); ctx.fill();
        break;
      case 6: // 風鈴
        ctx.strokeStyle = '#5a3a26'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -T * 1.2); ctx.lineTo(0, -T * 0.9); ctx.stroke();
        ctx.fillStyle = 'rgba(160,210,240,.85)'; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.arc(0, -T * 0.78, T * 0.14, Math.PI, 0); ctx.lineTo(T * 0.14, -T * 0.72); ctx.lineTo(-T * 0.14, -T * 0.72); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f5e6c8'; ctx.fillRect(-T * 0.05, -T * 0.66, T * 0.1, T * 0.28);
        break;
      case 7: // 狛狐
        ctx.fillStyle = '#b8b2a6'; ctx.fillRect(-T * 0.3, -T * 0.15, T * 0.6, T * 0.15); ctx.strokeRect(-T * 0.3, -T * 0.15, T * 0.6, T * 0.15);
        ctx.fillStyle = '#e8e2d6'; ctx.beginPath(); ctx.ellipse(0, -T * 0.4, T * 0.18, T * 0.26, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(T * 0.05, -T * 0.72, T * 0.13, T * 0.11, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-T * 0.02, -T * 0.8); ctx.lineTo(0, -T * 0.95); ctx.lineTo(T * 0.06, -T * 0.82); ctx.moveTo(T * 0.08, -T * 0.8); ctx.lineTo(T * 0.14, -T * 0.94); ctx.lineTo(T * 0.16, -T * 0.78); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d8402c'; ctx.fillRect(-T * 0.12, -T * 0.6, T * 0.24, T * 0.05);
        break;
    }
    ctx.restore();
  }
  function drawStartSign(ctx, v, p) {
    var T = v.T, cx = v.sx(p.x + 0.12, 0.5), by = v.sy(p.y, 0.5);
    ctx.fillStyle = '#8a5a36'; ctx.fillRect(cx - T * 0.03, by - T * 0.7, T * 0.06, T * 0.7);
    ctx.fillStyle = '#e8d2a8'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; rr(ctx, cx - T * 0.2, by - T * 0.95, T * 0.4, T * 0.3, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = OUT; ctx.font = 'bold ' + Math.round(T * 0.22) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('出', cx, by - T * 0.8);
  }

  /* ---------- 動く物・触れる物（毎コマ） ---------- */
  function drawWater(ctx, v, p, t, active) {
    var T = v.T;
    for (var i = 0; i < p.len; i++) {
      var x = v.sx(p.x + i, 0), y = v.sy(p.y + 1, 0), surf = y + T * 0.16;
      ctx.fillStyle = 'rgba(58,143,216,.78)'; ctx.fillRect(x, surf, T + 0.5, T - T * 0.16);
      if (v.dx) { ctx.fillStyle = active ? 'rgba(140,210,255,.9)' : 'rgba(90,170,230,.85)'; ctx.beginPath(); ctx.moveTo(x, surf); ctx.lineTo(x + T, surf); ctx.lineTo(x + T + v.dx, surf - v.dy); ctx.lineTo(x + v.dx, surf - v.dy); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = active ? '#e8f8ff' : 'rgba(255,255,255,.7)'; ctx.lineWidth = active ? 2.2 : 1.4;
      ctx.beginPath();
      for (var k = 0; k <= 8; k++) { var wx = x + k * T / 8, wy = surf - v.dy * 0.5 + Math.sin((p.x + i) * 2 + k * 0.8 + t * 4) * T * 0.035; if (k) ctx.lineTo(wx, wy); else ctx.moveTo(wx, wy); }
      ctx.stroke();
      if (active) { ctx.strokeStyle = 'rgba(200,240,255,' + (0.5 + 0.4 * Math.sin(t * 8 + i)) + ')'; ctx.beginPath(); ctx.ellipse(x + T / 2 + v.dx / 2, surf - v.dy / 2, T * 0.3, v.dy * 0.25 + 2, 0, 0, 7); ctx.stroke(); }
    }
  }
  function drawTrap(ctx, v, tr, phase, frac, t) {
    var T = v.T, down = tr.dir === 'down', cx = v.sx(tr.x + 0.5, 0.5), base = down ? v.sy(tr.y + 1, 0.5) : v.sy(tr.y, 0.5), s = down ? 1 : -1;
    // 台座
    ctx.fillStyle = phase === 1 ? (Math.floor(t * 10) % 2 ? HAZ.warn : '#ff7a1a') : HAZ.steelDk;
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    ctx.fillRect(cx - T * 0.42, base + (down ? 0 : -T * 0.12), T * 0.84, T * 0.12); ctx.strokeRect(cx - T * 0.42, base + (down ? 0 : -T * 0.12), T * 0.84, T * 0.12);
    var h = phase === 2 ? T * 0.72 : phase === 1 ? T * 0.22 : T * 0.1;
    if (phase === 2 && frac < 0.15) h = T * 0.72 * (frac / 0.15);
    var b0 = base + s * T * 0.12;
    for (var i = 0; i < 3; i++) {
      var sx0 = cx - T * 0.36 + i * T * 0.24;
      ctx.fillStyle = HAZ.steel; ctx.beginPath(); ctx.moveTo(sx0, b0); ctx.lineTo(sx0 + T * 0.12, b0 + s * h); ctx.lineTo(sx0 + T * 0.24, b0); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (phase === 2) { ctx.fillStyle = HAZ.tip; ctx.beginPath(); ctx.moveTo(sx0 + T * 0.08, b0 + s * h * 0.7); ctx.lineTo(sx0 + T * 0.12, b0 + s * h); ctx.lineTo(sx0 + T * 0.16, b0 + s * h * 0.7); ctx.closePath(); ctx.fill(); }
    }
    if (phase === 1) { ctx.fillStyle = HAZ.warn; ctx.font = 'bold ' + Math.round(T * 0.4) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', cx, base + s * T * 0.62); }
  }
  function doorShape(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, r, 0, 7);
    else if (shape === 'tri') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); }
    else if (shape === 'square') ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    else { for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; if (i) ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); else ctx.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } ctx.closePath(); }
  }
  function drawDoor(ctx, v, d, open, t) {
    var T = v.T, col = D.COLORS[d.color] || D.COLORS[0], x = v.sx(d.x, 0.5), yTop = v.sy(d.y + 2, 0.5), h = T * 2;
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    if (open >= 1) { // 開いた扉：枠だけ
      ctx.setLineDash([4, 3]); ctx.strokeStyle = col.col; ctx.strokeRect(x + T * 0.08, yTop, T * 0.84, h); ctx.setLineDash([]);
      ctx.fillStyle = col.col; doorShape(ctx, col.shape, x + T / 2, yTop + T * 0.2, T * 0.1); ctx.fill();
      return;
    }
    var lift = open * h;
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, yTop - 2, T + 4, h + 4); ctx.clip();
    ctx.fillStyle = '#6a4a30'; ctx.fillRect(x + T * 0.04, yTop - lift, T * 0.92, h); ctx.strokeRect(x + T * 0.04, yTop - lift, T * 0.92, h);
    ctx.fillStyle = col.col; ctx.fillRect(x + T * 0.16, yTop - lift + T * 0.14, T * 0.68, h - T * 0.28); ctx.strokeRect(x + T * 0.16, yTop - lift + T * 0.14, T * 0.68, h - T * 0.28);
    ctx.strokeStyle = col.dk; ctx.lineWidth = 1; for (var i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + T * 0.16, yTop - lift + i * h / 4); ctx.lineTo(x + T * 0.84, yTop - lift + i * h / 4); ctx.stroke(); }
    ctx.fillStyle = '#fff8e8'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; doorShape(ctx, col.shape, x + T / 2, yTop - lift + h / 2, T * 0.2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawSwitch(ctx, v, s, col, pressed) {
    var T = v.T, cx = v.sx(s.x + 0.5, 0.5), by = v.sy(s.y, 0.5), c = col || { col: '#999', dk: '#666', shape: 'circle' };
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    ctx.fillStyle = '#7a7c83'; ctx.fillRect(cx - T * 0.38, by - T * 0.1, T * 0.76, T * 0.1); ctx.strokeRect(cx - T * 0.38, by - T * 0.1, T * 0.76, T * 0.1);
    var bh = pressed ? T * 0.05 : T * 0.18;
    ctx.fillStyle = pressed ? c.dk : c.col; rr(ctx, cx - T * 0.26, by - T * 0.1 - bh, T * 0.52, bh + 1, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff8e8'; doorShape(ctx, c.shape, cx, by - T * 0.1 - bh - T * 0.2, T * 0.11); ctx.fill(); ctx.stroke();
    if (pressed) { ctx.fillStyle = 'rgba(255,240,160,.8)'; ctx.beginPath(); ctx.arc(cx, by - T * 0.45, T * 0.06, 0, 7); ctx.fill(); }
  }
  function drawMover(ctx, v, m, pos, showRail) {
    var T = v.T, W = D.PHYS.moverW;
    if (showRail) {
      ctx.strokeStyle = 'rgba(90,60,40,.35)'; ctx.lineWidth = Math.max(1, T * 0.06); ctx.setLineDash([T * 0.15, T * 0.15]);
      ctx.beginPath(); ctx.moveTo(v.sx(m.x + W / 2, 0.5), v.sy(m.y + 0.5, 0.5)); ctx.lineTo(v.sx(m.x2 + W / 2, 0.5), v.sy(m.y2 + 0.5, 0.5)); ctx.stroke(); ctx.setLineDash([]);
    }
    var x = v.sx(pos.x, 0), y = v.sy(pos.y + 1, 0);
    if (v.dx) { ctx.fillStyle = '#c8a06a'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + W * T, y); ctx.lineTo(x + W * T + v.dx, y - v.dy); ctx.lineTo(x + v.dx, y - v.dy); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke(); ctx.fillStyle = '#7a5230'; ctx.beginPath(); ctx.moveTo(x + W * T, y); ctx.lineTo(x + W * T + v.dx, y - v.dy); ctx.lineTo(x + W * T + v.dx, y + T * 0.55 - v.dy); ctx.lineTo(x + W * T, y + T * 0.55); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#a8784a'; ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.5, T * 0.06);
    rr(ctx, x, y, W * T, T * 0.55, T * 0.1); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,35,20,.45)'; ctx.lineWidth = 1; for (var i = 1; i < W; i++) { ctx.beginPath(); ctx.moveTo(x + i * T, y + 2); ctx.lineTo(x + i * T, y + T * 0.53); ctx.stroke(); }
    // からくりの歯車
    [0.5, W - 0.5].forEach(function (gx) { gear(ctx, x + gx * T, y + T * 0.72, T * 0.2, pos.x * 3 + pos.y * 3); });
  }
  function gear(ctx, x, y, r, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#8a8f98'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    ctx.beginPath(); for (var i = 0; i < 16; i++) { var an = i * Math.PI / 8, rr2 = i % 2 ? r * 0.75 : r; if (i) ctx.lineTo(Math.cos(an) * rr2, Math.sin(an) * rr2); else ctx.moveTo(Math.cos(an) * rr2, Math.sin(an) * rr2); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a4e56'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawRefill(ctx, v, r, t, taken) {
    var T = v.T, cx = v.sx(r.x + 0.5, 0.5), cy = v.sy(r.y + 0.5, 0.5) + Math.sin(t * 3 + r.x) * T * 0.06;
    ctx.fillStyle = 'rgba(120,200,255,' + (taken ? 0.15 : 0.35) + ')'; ctx.beginPath(); ctx.arc(cx, cy, T * 0.42, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.5);
    ctx.fillStyle = '#2f6fd0'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; rr(ctx, -T * 0.28, -T * 0.13, T * 0.56, T * 0.26, T * 0.12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7f3ea'; ctx.fillRect(-T * 0.12, -T * 0.13, T * 0.24, T * 0.26); ctx.strokeRect(-T * 0.12, -T * 0.13, T * 0.24, T * 0.26);
    ctx.fillStyle = '#1f4a9a'; ctx.font = 'bold ' + Math.round(T * 0.2) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('水', 0, 1);
    ctx.restore();
    for (var i = 0; i < r.count; i++) { ctx.fillStyle = '#8fd0ff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx + (i - (r.count - 1) / 2) * T * 0.18, cy + T * 0.34, T * 0.06, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  function drawCheck(ctx, v, c, active, t) {
    var T = v.T, x = v.sx(c.x + 0.35, 0.5), by = v.sy(c.y, 0.5);
    ctx.fillStyle = '#5a3a26'; ctx.fillRect(x - T * 0.03, by - T * 1.2, T * 0.07, T * 1.2);
    ctx.fillStyle = '#7a7c83'; ctx.fillRect(x - T * 0.15, by - T * 0.08, T * 0.3, T * 0.08);
    var fy = active ? by - T * 1.18 : by - T * 0.55, wave = active ? Math.sin(t * 6) * T * 0.05 : 0;
    ctx.fillStyle = active ? '#f0c040' : '#b8b2a6'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + T * 0.04, fy); ctx.lineTo(x + T * 0.5, fy + T * 0.12 + wave); ctx.lineTo(x + T * 0.04, fy + T * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (active) { ctx.fillStyle = '#d8402c'; ctx.beginPath(); ctx.arc(x + T * 0.2, fy + T * 0.14, T * 0.05, 0, 7); ctx.fill(); }
  }
  function drawGoal(ctx, v, g, t) {
    var T = v.T, x = v.sx(g.x, 0.5), by = v.sy(g.y, 0.5), top = by - T * 2.05;
    ctx.fillStyle = 'rgba(255,230,140,' + (0.25 + 0.15 * Math.sin(t * 3)) + ')'; ctx.beginPath(); ctx.ellipse(x + T / 2, by - T, T * 0.7, T * 1.1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8402c'; ctx.strokeStyle = OUT; ctx.lineWidth = Math.max(1.4, T * 0.05);
    ctx.fillRect(x + T * 0.1, top + T * 0.3, T * 0.12, T * 1.75); ctx.strokeRect(x + T * 0.1, top + T * 0.3, T * 0.12, T * 1.75);
    ctx.fillRect(x + T * 0.78, top + T * 0.3, T * 0.12, T * 1.75); ctx.strokeRect(x + T * 0.78, top + T * 0.3, T * 0.12, T * 1.75);
    ctx.fillRect(x - T * 0.08, top + T * 0.42, T * 1.16, T * 0.1); ctx.strokeRect(x - T * 0.08, top + T * 0.42, T * 1.16, T * 0.1);
    ctx.fillStyle = '#2b2b33'; ctx.beginPath(); ctx.moveTo(x - T * 0.2, top + T * 0.12); ctx.quadraticCurveTo(x + T / 2, top + T * 0.28, x + T * 1.2, top + T * 0.12); ctx.lineTo(x + T * 1.12, top + T * 0.26); ctx.quadraticCurveTo(x + T / 2, top + T * 0.4, x - T * 0.12, top + T * 0.26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(x + T / 2, top + T * 0.7 + Math.sin(t * 4) * 1.5, T * 0.08, 0, 7); ctx.fill(); ctx.stroke();
  }

  /* ---------- 人物の絵（SVG → 画像。読みこみ中は null） ---------- */
  var sprites = {}, pending = 0, onReady = null;
  var SPRITE_UNITS = 196; // 足もとから頭のてっぺんまで（art.js の座標で約196）
  function sprite(key, def, pose, frame, yaw, hPx, expr) {
    var hp = Math.max(8, Math.round(hPx));
    var k = key + '|' + pose + '|' + (frame || 0) + '|' + yaw + '|' + hp + '|' + (expr || '');
    var e = sprites[k];
    if (e) return e.ready ? e : null;
    e = sprites[k] = { ready: false };
    if (!A || typeof Image === 'undefined') return null;
    var scale = hp / SPRITE_UNITS, w = Math.ceil(200 * scale), h = Math.ceil(240 * scale);
    var svg = A.render(def, { yaw: yaw, pose: pose, frame: frame || 0, expr: expr, w: w, h: h, shadow: false, prop: pose === 'stand' || pose === 'serious', companions: pose === 'stand' });
    var img = new Image();
    pending++;
    img.onload = function () {
      var cv = makeCanvas(w, h); cv.getContext('2d').drawImage(img, 0, 0, w, h);
      e.cv = cv; e.w = w; e.h = h; e.ax = 100 * scale; e.ay = 232 * scale; e.ready = true; pending--;
      if (onReady) onReady();
    };
    img.onerror = function () { pending--; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return null;
  }
  // 足もと (sx, sy) に人物を描く。まだ読みこめていなければ丸で
  function drawChar(ctx, key, def, pose, frame, yaw, hPx, sx, sy, opt) {
    opt = opt || {};
    var sp = sprite(key, def, pose, frame, yaw, hPx, opt.expr);
    if (opt.shadow !== false) { ctx.fillStyle = 'rgba(40,25,15,.22)'; ctx.beginPath(); ctx.ellipse(sx, opt.groundY != null ? opt.groundY : sy, hPx * 0.2, hPx * 0.05, 0, 0, 7); ctx.fill(); }
    if (sp) { ctx.drawImage(sp.cv, sx - sp.ax, sy - sp.ay); return true; }
    ctx.fillStyle = opt.fallback || '#2f4a7a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy - hPx * 0.7, hPx * 0.26, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillRect(sx - hPx * 0.15, sy - hPx * 0.45, hPx * 0.3, hPx * 0.45);
    return false;
  }

  /* ---------- 1コマぶんの試験の絵 ---------- */
  // o: { level, world, state, view, t, layer, theme, player:{key,def}, examiner:{key,def}|null, fx:[], editGhost }
  function drawStage(ctx, o) {
    var v = o.view, w = o.world, s = o.state, t = o.t || 0, f = s ? s.f : 0;
    drawBackground(ctx, o.theme, v, t);
    if (o.layer && o.layer.cv) ctx.drawImage(o.layer.cv, v.sx(0, 0) - o.layer.ox, v.sy(GH, 0) - o.layer.oy);
    var i;
    for (i = 0; i < w.waters.length; i++) drawWater(ctx, v, w.waters[i], t, s && s.jt > 0);
    for (i = 0; i < w.movers.length; i++) drawMover(ctx, v, w.movers[i], E.moverPos(w.movers[i], f), true);
    for (i = 0; i < w.switches.length; i++) { var sw = w.switches[i], dd = w.doors[sw.door]; drawSwitch(ctx, v, sw, dd ? D.COLORS[dd.color] : null, s && ((s.sw >> i) & 1)); }
    for (i = 0; i < w.doors.length; i++) {
      var d = w.doors[i], isOpen = s && (d.sw & s.sw), openT = 0;
      if (isOpen) { var key = 'door' + i; o.anim = o.anim || {}; o.anim[key] = Math.min(1, (o.anim[key] || 0) + 0.06); openT = o.anim[key]; }
      drawDoor(ctx, v, d, openT, t);
    }
    for (i = 0; i < w.traps.length; i++) { var tr = w.traps[i], ph = E.trapPhase(tr, f), fr = ((f % tr.cycle) - (tr.cycle - D.PHYS.trapActive)) / D.PHYS.trapActive; drawTrap(ctx, v, tr, ph, fr, t); }
    for (i = 0; i < w.refills.length; i++) drawRefill(ctx, v, w.refills[i], t, s && s.charges >= w.refills[i].count);
    for (i = 0; i < w.checks.length; i++) drawCheck(ctx, v, w.checks[i], s && s.cpi === i, t);
    if (w.goal) drawGoal(ctx, v, w.goal, t);
    // 試験官（ゴールの横に立つ）
    if (o.examiner && w.goal) {
      var ex = w.goal.x + 1.45 <= GW ? w.goal.x + 1.45 : w.goal.x - 0.45, cleared = s && s.status === 2;
      drawChar(ctx, o.examiner.key, o.examiner.def, cleared ? 'cheer' : 'stand', 0, ex > w.goal.x ? -40 : 40, v.T * 1.75, v.sx(ex, 0.8), v.sy(w.goal.y, 0.8), { groundY: v.sy(w.goal.y, 0.8) });
    }
    // 見習い
    if (s && o.player) drawPlayer(ctx, o, v, s, t);
    (o.fx || []).forEach(function (e) { drawFx(ctx, v, e, t); });
  }
  function playerPose(s, t) {
    if (s.status === 1) return { pose: 'oops', frame: 0 };
    if (s.status === 2) return { pose: 'cheer', frame: 0 };
    if (!s.ground) return { pose: s.vy > 0 ? 'jump' : 'fall', frame: 0 };
    if (Math.abs(s.vx) > 0.6) return { pose: 'run', frame: Math.floor(t * 12) % 6 };
    return { pose: 'stand', frame: 0 };
  }
  function drawPlayer(ctx, o, v, s, t) {
    var pp = playerPose(s, t), yaw = s.face > 0 ? 62 : -62;
    if (pp.pose === 'cheer') yaw = s.face > 0 ? 20 : -20;
    var sx = v.sx(s.px, 0.5), sy = v.sy(s.py, 0.5);
    if (s.status === 1) { // 失敗：ぽん！と消える
      var k = 1 - s.dt / D.PHYS.deadFrames;
      ctx.globalAlpha = Math.max(0, 1 - k * 1.3);
      drawChar(ctx, o.player.key, o.player.def, 'oops', 0, yaw, v.T * 1.8, sx, sy - k * v.T * 0.6, { shadow: false });
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.8 - k * 0.8) + ')';
      for (var i = 0; i < 6; i++) { var a = i * 1.05; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * k * v.T, sy - v.T * 0.7 + Math.sin(a) * k * v.T, v.T * 0.18 * (1 - k * 0.5), 0, 7); ctx.fill(); }
      return;
    }
    if (s.jt > 0) { // 水渡りの術
      ctx.strokeStyle = 'rgba(120,210,255,' + (s.jt < 60 && Math.floor(t * 8) % 2 ? 0.2 : 0.8) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy - v.T * 0.75, v.T * 0.55, v.T * 0.95, 0, 0, 7); ctx.stroke();
    }
    drawChar(ctx, o.player.key, o.player.def, pp.pose, pp.frame, yaw, v.T * 1.8, sx, sy, { groundY: s.ground ? sy : null, shadow: !!s.ground });
  }
  function drawFx(ctx, v, e, t) {
    var k = (t - e.t0) / e.dur;
    if (k < 0 || k > 1) return;
    var x = v.sx(e.x, 0.5), y = v.sy(e.y, 0.5), T = v.T;
    ctx.globalAlpha = 1 - k;
    if (e.kind === 'splash') { ctx.fillStyle = '#8fd0ff'; for (var i = 0; i < 7; i++) { var a = -Math.PI * (0.1 + i * 0.13); ctx.beginPath(); ctx.arc(x + Math.cos(a) * k * T * 1.2, y + Math.sin(a) * k * T * 1.4 + k * k * T, T * 0.1, 0, 7); ctx.fill(); } }
    else if (e.kind === 'spark') { ctx.strokeStyle = e.col || '#ffd24a'; ctx.lineWidth = 2; for (var j = 0; j < 8; j++) { var b = j * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(b) * k * T * 0.5, y - T * 0.6 + Math.sin(b) * k * T * 0.5); ctx.lineTo(x + Math.cos(b) * k * T * 0.9, y - T * 0.6 + Math.sin(b) * k * T * 0.9); ctx.stroke(); } }
    else if (e.kind === 'dust') { ctx.fillStyle = '#d8cfbf'; for (var m = 0; m < 3; m++) { ctx.beginPath(); ctx.arc(x + (m - 1) * T * 0.3 * (1 + k), y - k * T * 0.2, T * 0.1 * (1 - k * 0.5), 0, 7); ctx.fill(); } }
    else if (e.kind === 'text') { ctx.fillStyle = e.col || '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.font = 'bold ' + Math.round(T * 0.45) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.strokeText(e.text, x, y - T * 1.8 - k * T); ctx.fillText(e.text, x, y - T * 1.8 - k * T); }
    else if (e.kind === 'confetti') {
      var cols = e.cols || ['#f07aa0', '#f5d040', '#8fd0ff', '#9ad07a'];
      for (var c = 0; c < 26; c++) { ctx.fillStyle = cols[c % cols.length]; var cx = x + (hash(c * 31) - 0.5) * T * 6, cy = y - T * 3 + k * T * 5 * (0.6 + hash(c * 7)) ; ctx.save(); ctx.translate(cx + Math.sin(k * 10 + c) * T * 0.3, cy); ctx.rotate(k * 8 + c); ctx.fillRect(-T * 0.06, -T * 0.1, T * 0.12, T * 0.2); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 作る画面（平らな図） ---------- */
  // o: { level, view, theme, selected:id, errors:[{at,id}], ghost:{part, ok}, hotCells:{}, t, showGrid }
  function drawEditor(ctx, o) {
    var v = o.view, lv = o.level, t = o.t || 0;
    drawBackground(ctx, lv.theme, v, 0);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(v.sx(0), v.sy(GH), GW * v.T, GH * v.T);
    if (o.layer && o.layer.cv) ctx.drawImage(o.layer.cv, v.sx(0, 0) - o.layer.ox, v.sy(GH, 0) - o.layer.oy);
    var w = E.createWorld(lv), i;
    // 失敗の集中（分析）
    if (o.heat) {
      Object.keys(o.heat).forEach(function (k) { var a = k.split(','), n = o.heat[k]; ctx.fillStyle = 'rgba(232,66,58,' + Math.min(0.75, 0.15 + n * 0.08) + ')'; ctx.fillRect(v.sx(+a[0]), v.sy(+a[1] + 1), v.T, v.T); });
    }
    for (i = 0; i < w.waters.length; i++) drawWater(ctx, v, w.waters[i], t, false);
    lv.parts.forEach(function (p) {
      if (p.part_id === 'mover') {
        var m = { x: p.x, y: p.y, x2: p.x2, y2: p.y2 };
        ctx.globalAlpha = 0.35; drawMover(ctx, v, m, { x: p.x2, y: p.y2 }, false); ctx.globalAlpha = 1;
        drawMover(ctx, v, m, { x: p.x, y: p.y }, true);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(v.sx(p.x2 + 1.5), v.sy(p.y2 + 0.5), v.T * 0.16, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = OUT; ctx.font = 'bold ' + Math.round(v.T * 0.2) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('B', v.sx(p.x2 + 1.5), v.sy(p.y2 + 0.5));
      }
    });
    for (i = 0; i < w.switches.length; i++) { var sw = w.switches[i], dd = w.doors[sw.door]; drawSwitch(ctx, v, sw, dd ? D.COLORS[dd.color] : null, false); }
    for (i = 0; i < w.doors.length; i++) drawDoor(ctx, v, w.doors[i], 0, t);
    // スイッチ → 扉のつながり
    (lv.connections || []).forEach(function (c) {
      var a = null, b = null; lv.parts.forEach(function (p) { if (p.id === c.from) a = p; if (p.id === c.to) b = p; });
      if (!a || !b) return;
      var col = D.COLORS[b.color] || D.COLORS[0];
      ctx.strokeStyle = col.col; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(v.sx(a.x + 0.5), v.sy(a.y + 0.3)); ctx.lineTo(v.sx(b.x + 0.5), v.sy(b.y + 1)); ctx.stroke(); ctx.setLineDash([]);
    });
    for (i = 0; i < w.traps.length; i++) drawTrap(ctx, v, w.traps[i], 2, 1, t);
    for (i = 0; i < w.refills.length; i++) drawRefill(ctx, v, w.refills[i], 0, false);
    for (i = 0; i < w.checks.length; i++) drawCheck(ctx, v, w.checks[i], true, 0);
    if (w.goal) drawGoal(ctx, v, w.goal, 0);
    // スタート（見習いの影）
    var st = lv.parts.filter(function (p) { return p.part_id === 'start'; })[0];
    if (st && o.player) drawChar(ctx, o.player.key, o.player.def, 'stand', 0, 30, v.T * 1.8, v.sx(st.x + 0.5), v.sy(st.y), { shadow: true });
    // マス目
    if (o.showGrid !== false) {
      ctx.strokeStyle = 'rgba(60,40,30,.16)'; ctx.lineWidth = 1; ctx.beginPath();
      for (var gx = 0; gx <= GW; gx++) { ctx.moveTo(v.sx(gx) + 0.5, v.sy(GH)); ctx.lineTo(v.sx(gx) + 0.5, v.sy(0)); }
      for (var gy = 0; gy <= GH; gy++) { ctx.moveTo(v.sx(0), v.sy(gy) + 0.5); ctx.lineTo(v.sx(GW), v.sy(gy) + 0.5); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,30,.5)'; ctx.lineWidth = 2; ctx.strokeRect(v.sx(0), v.sy(GH), GW * v.T, GH * v.T);
    }
    // 選んでいる部品
    if (o.selected) {
      var sp = lv.parts.filter(function (p) { return p.id === o.selected; })[0];
      if (sp) outlineCells(ctx, v, cellsForOutline(sp), 'rgba(120,180,255,.22)', '#2f6fd0');
    }
    // エラーの場所
    (o.errors || []).forEach(function (e) {
      if (!e.at) return;
      var x = v.sx(e.at.x), y = v.sy(e.at.y + 1);
      ctx.strokeStyle = '#e8423a'; ctx.lineWidth = 3; ctx.strokeRect(x + 2, y + 2, v.T - 4, v.T - 4);
      ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + v.T - 6, y + v.T - 6); ctx.moveTo(x + v.T - 6, y + 6); ctx.lineTo(x + 6, y + v.T - 6); ctx.stroke();
    });
    if (o.focus) { var fx0 = v.sx(o.focus.x), fy0 = v.sy(o.focus.y + 1); ctx.strokeStyle = 'rgba(255,200,40,' + (0.5 + 0.5 * Math.sin(t * 8)) + ')'; ctx.lineWidth = 4; ctx.strokeRect(fx0 - 3, fy0 - 3, v.T + 6, v.T + 6); }
    // 置く前の影
    if (o.ghost && o.ghost.part) {
      ctx.globalAlpha = 0.55;
      var gp = o.ghost.part;
      outlineCells(ctx, v, cellsForOutline(gp), o.ghost.ok ? 'rgba(80,200,120,.35)' : 'rgba(232,66,58,.35)', o.ghost.ok ? '#2a9a5a' : '#e8423a');
      ctx.globalAlpha = 1;
    }
  }
  function cellsForOutline(p) {
    var R = root.KK_RULES;
    if (p.part_id === 'mover') { var o = []; for (var i = 0; i < D.PHYS.moverW; i++) o.push([p.x + i, p.y]); return o; }
    return R.cellsOf(p);
  }
  function outlineCells(ctx, v, cells, fill, stroke) {
    cells.forEach(function (c) {
      var x = v.sx(c[0]), y = v.sy(c[1] + 1);
      ctx.fillStyle = fill; ctx.fillRect(x, y, v.T, v.T);
      ctx.strokeStyle = stroke; ctx.lineWidth = 2.5; ctx.strokeRect(x + 1, y + 1, v.T - 2, v.T - 2);
    });
  }

  /* ---------- 小さな絵（一覧のカード・パレットのアイコン） ---------- */
  function thumbnail(level, w, h) {
    var cv = makeCanvas(w, h); if (!cv) return null;
    var ctx = cv.getContext('2d'), v = new View(w, h, 'edit', { T: Math.max(3, Math.floor(Math.min(w / GW, h / GH))) });
    v.camX = -(w / v.T - GW) / 2;
    var layer = tileLayer(level, level.theme, v);
    drawEditor(ctx, { level: level, view: v, layer: layer, showGrid: false, t: 0 });
    return cv;
  }
  function partIcon(partId, size, theme) {
    var cv = makeCanvas(size, size); if (!cv) return null;
    var ctx = cv.getContext('2d'), T = size * 0.62;
    var v = { T: T, dx: 0, dy: 0, sx: function (x, z) { return (x - 0) * T + size * 0.19; }, sy: function (y, z) { return size * 0.86 - y * T; } };
    var th = D.THEMES[theme || 'chikurin'];
    switch (partId) {
      case 'floor': ctx.fillStyle = th.floor[0]; ctx.fillRect(size * 0.08, size * 0.5, size * 0.84, size * 0.3); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(size * 0.08, size * 0.5, size * 0.84, size * 0.3); ctx.fillStyle = th.top[0]; ctx.fillRect(size * 0.08, size * 0.5, size * 0.84, size * 0.07); break;
      case 'mover': v.T = size * 0.28; drawMover(ctx, v, { x: 0, y: 0, x2: 0, y2: 0 }, { x: 0.1, y: 0.9 }, false); ctx.fillStyle = OUT; ctx.font = 'bold ' + Math.round(size * 0.3) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⇆', size / 2, size * 0.36); break;
      case 'pit': drawPit(ctx, v, { x: 0, y: 0, len: 1 }); break;
      case 'trap': drawTrap(ctx, v, { x: 0, y: 0, dir: 'up' }, 2, 1, 0); break;
      case 'door': v.T = size * 0.4; v.sx = function (x) { return x * v.T + size * 0.3; }; v.sy = function (y) { return size * 0.95 - y * v.T; }; drawDoor(ctx, v, { x: 0, y: 0, color: 0 }, 0, 0); break;
      case 'switch': drawSwitch(ctx, v, { x: 0, y: 0 }, D.COLORS[0], false); break;
      case 'water': drawWater(ctx, v, { x: 0, y: 0, len: 1 }, 0, false); break;
      case 'refill': drawRefill(ctx, v, { x: 0, y: 0.1, count: 1 }, 0, false); break;
      case 'check': drawCheck(ctx, v, { x: 0, y: 0 }, true, 0); break;
      case 'deco': drawDeco(ctx, v, { x: 0, y: 0, kind: 0, dir: 'r' }); break;
      case 'start': drawStartSign(ctx, v, { x: 0.4, y: 0 }); break;
      case 'goal': v.T = size * 0.42; v.sx = function (x) { return x * v.T + size * 0.29; }; v.sy = function (y) { return size * 0.95 - y * v.T; }; drawGoal(ctx, v, { x: 0, y: 0 }, 0); break;
    }
    return cv;
  }

  var api = {
    View: View, drawBackground: drawBackground, tileLayer: tileLayer, drawStage: drawStage, drawEditor: drawEditor, drawChar: drawChar, sprite: sprite,
    thumbnail: thumbnail, partIcon: partIcon, makeCanvas: makeCanvas, pending: function () { return pending; }, onSprite: function (fn) { onReady = fn; }, HAZ: HAZ, rr: rr
  };
  root.KK_RENDER = api;
})(typeof window !== 'undefined' ? window : globalThis);
