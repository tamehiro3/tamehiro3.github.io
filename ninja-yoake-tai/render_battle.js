/* ニンジャ夜明け隊（RPG） — 戦闘の描画
 * 背景（場所と夜明けの明るさ）・妖怪と仲間・術の光・ダメージの数字。
 * 判定は battle.js、流れ（どのできごとを、いつ見せるか）は battle_ui.js。
 * 仲間は右に並んで左を向き、妖怪は左。どこまでを戦いの場面に使うか（area）は battle_ui.js が決める。
 */
(function (root) {
  'use strict';
  var DW = root.NYT_DRAW, YK = root.NYT_YOKAI, SPR = root.NYT_SPRITES;
  function EN() { return root.NYT_ENEMIES.ENEMIES; }
  function TYPES() { return root.NYT_BASE.TYPES; }
  function STATUS() { return root.NYT_BASE.STATUS; }
  var FONT = '"Hiragino Maru Gothic ProN","Zen Maru Gothic","BIZ UDPGothic","Yu Gothic",sans-serif';
  var R = { cv: null, c: null, dpr: 1, vw: 0, vh: 0, bg: null, bgKey: '', t: 0, fx: [], pops: [], shakeT: 0, shakeA: 0, flashT: 0, flashDur: 0.3, flashCol: '255,255,255', vis: {}, pos: {}, rects: {}, area: null, motes: null };

  function init(cv) { R.cv = cv; R.c = cv.getContext('2d'); resize(); }
  function resize() {
    R.dpr = Math.min(2.5, root.devicePixelRatio || 1);
    R.vw = root.innerWidth; R.vh = root.innerHeight;
    var w = Math.round(R.vw * R.dpr), h = Math.round(R.vh * R.dpr);
    if (R.cv.width !== w || R.cv.height !== h) { R.cv.width = w; R.cv.height = h; }
    R.cv.style.width = R.vw + 'px'; R.cv.style.height = R.vh + 'px';
    R.bgKey = '';
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function ease(k) { return k < 0 ? 0 : k > 1 ? 1 : 1 - Math.pow(1 - k, 3); }

  // ====================== 背景 ======================
  // 空の色（夜明けのかけらの数 0〜6）
  var SKY = [['#0b0f2a', '#2a2450'], ['#0f1534', '#33295a'], ['#141c40', '#46336a'], ['#1e2a58', '#7a4a78'], ['#2e4a80', '#c8708a'], ['#4a74b0', '#f0a07a'], ['#6aa8e8', '#fde0b0']];
  var DARK = [0.34, 0.3, 0.25, 0.18, 0.1, 0.05, 0];
  var GROUND = {
    village: ['#4f7a3a', '#6e9a4c', '#c8a878'], forest: ['#2f5a2c', '#4a7a3a', '#8aa860'], mountain: ['#4e6a50', '#6e8a64', '#a8a890'],
    beach: ['#c8a870', '#e8d0a0', '#f4e4c0'], darkmount: ['#3a4440', '#56605a', '#7a7a70'], fortress: ['#5a5048', '#7a6e60', '#a09080'],
    cave: ['#3a302c', '#54463e', '#6e5c50'], seacave: ['#2e3a44', '#46545e', '#5e6e78'], under: ['#2a2038', '#3e3050', '#5a4a72'], sky: ['#e8e0f2', '#fbf6ff', '#ffffff']
  };
  function buildBg(bbg, lv, W, H, A) {
    var cv = DW.mk(W, H), c = cv.getContext('2d'), s = R.dpr;
    c.scale(s, s);
    var w = W / s, h = H / s, rnd = DW.rnd(bbg.length * 977 + 13);
    var indoor = bbg === 'cave' || bbg === 'seacave';
    var hz = A ? A.y + A.h * (bbg === 'beach' ? 0.4 : 0.36) : h * 0.46;   // 地平線（戦う場所の上のほう）
    // 空
    var sk = SKY[lv], g = c.createLinearGradient(0, 0, 0, hz + 20);
    if (bbg === 'under') { g.addColorStop(0, '#120a20'); g.addColorStop(1, '#3a2456'); }
    else if (bbg === 'sky') { g.addColorStop(0, lv >= 6 ? '#8ac0f8' : '#4a5aa8'); g.addColorStop(1, lv >= 6 ? '#fff0d8' : '#c8a8d8'); }
    else if (bbg === 'darkmount' && lv < 6) { g.addColorStop(0, sk[0]); g.addColorStop(1, DW.mix(sk[1], '#8a3040', 0.35)); }
    else { g.addColorStop(0, sk[0]); g.addColorStop(1, sk[1]); }
    c.fillStyle = g; c.fillRect(0, 0, w, hz + 22);
    if (!indoor && bbg !== 'under') {
      // 星と月・朝日
      if (lv <= 3) { for (var i = 0; i < 70; i++) { var a = (1 - lv / 4) * (0.4 + rnd() * 0.6); DW.circle(c, rnd() * w, rnd() * hz * 0.9, rnd() < 0.1 ? 1.4 : 0.8, 'rgba(255,255,240,' + a + ')'); } }
      var my = Math.max(70, hz * 0.4);
      if (lv <= 2) { DW.circle(c, w * 0.18, my, 22, 'rgba(255,250,220,.12)'); DW.circle(c, w * 0.18, my, 14, '#fff6d8'); DW.circle(c, w * 0.18 + 6, my - 3, 12, sk[0]); }
      if (lv >= 3) { var sg = c.createRadialGradient(w * 0.62, hz, 0, w * 0.62, hz, w * (0.2 + lv * 0.08)); sg.addColorStop(0, 'rgba(255,220,160,' + (0.2 + lv * 0.1) + ')'); sg.addColorStop(1, 'rgba(255,200,150,0)'); c.fillStyle = sg; c.fillRect(0, 0, w, hz + 20); }
      if (lv >= 5) DW.circle(c, w * 0.62, hz + 4, 16 + lv * 2, 'rgba(255,236,190,.9)');
    }
    PAINT[bbg] ? PAINT[bbg](c, w, h, hz, lv, rnd) : PAINT.village(c, w, h, hz, lv, rnd);
    // 地面
    var gc = GROUND[bbg] || GROUND.village, gy = bbg === 'beach' ? hz + (h - hz) * 0.18 : hz + (indoor ? 10 : 0);
    if (bbg !== 'beach') {
      var gg = c.createLinearGradient(0, gy, 0, h);
      gg.addColorStop(0, DW.mix(gc[0], '#000000', 0.15)); gg.addColorStop(0.35, gc[0]); gg.addColorStop(1, gc[1]);
      c.fillStyle = gg; c.fillRect(0, gy, w, h - gy);
    }
    // 戦う場所（明るい楕円）
    var st = c.createRadialGradient(w * 0.5, h * 0.74, 10, w * 0.5, h * 0.74, w * 0.6);
    st.addColorStop(0, 'rgba(255,255,255,' + (bbg === 'sky' ? 0.25 : 0.1) + ')'); st.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = st; c.fillRect(0, gy, w, h - gy);
    // 草・石
    for (var k = 0; k < 90; k++) {
      var x = rnd() * w, y = gy + 8 + Math.pow(rnd(), 0.8) * (h - gy - 8), sc = 0.6 + (y - gy) / (h - gy);
      if (bbg === 'village' || bbg === 'forest' || bbg === 'mountain') { c.strokeStyle = DW.mix(gc[1], '#203018', 0.4); c.lineWidth = 1.2 * sc; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2 * sc, y - 6 * sc); c.moveTo(x + 3 * sc, y); c.lineTo(x + 4 * sc, y - 7 * sc); c.stroke(); }
      else if (bbg === 'sky') { DW.ell(c, x, y, 10 * sc, 3 * sc, 'rgba(255,255,255,.5)'); }
      else if (rnd() < 0.5) { DW.ell(c, x, y, 3 * sc, 1.8 * sc, DW.mix(gc[2], '#000000', 0.3)); }
    }
    // 夜の暗さ
    if (DARK[lv] > 0 && bbg !== 'sky') { c.fillStyle = 'rgba(10,12,40,' + DARK[lv] + ')'; c.fillRect(0, 0, w, h); }
    // ふち（まわりを少し暗く）
    var vg = c.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
    return cv;
  }
  function ridge(c, w, base, amp, step, col, rnd, sharp) {
    c.beginPath(); c.moveTo(0, base + 200);
    for (var x = 0; x <= w + step; x += step) { var y = base - (sharp ? (rnd() * amp) : (Math.sin(x * 0.012 + amp) * amp * 0.5 + rnd() * amp * 0.5)); c.lineTo(x, y); }
    c.lineTo(w + step, base + 200); c.closePath(); c.fillStyle = col; c.fill();
  }
  function treeSil(c, x, y, s, col) {
    DW.rrect(c, x - 2 * s, y - 14 * s, 4 * s, 14 * s, 1, DW.mix(col, '#000000', 0.3));
    DW.poly(c, [[x - 14 * s, y - 10 * s], [x, y - 40 * s], [x + 14 * s, y - 10 * s]], col);
    DW.poly(c, [[x - 11 * s, y - 24 * s], [x, y - 52 * s], [x + 11 * s, y - 24 * s]], col);
  }
  function roof(c, x, y, w2, col, wall) {
    c.fillStyle = wall; c.fillRect(x - w2 * 0.8, y - w2 * 0.7, w2 * 1.6, w2 * 0.7);
    DW.poly(c, [[x - w2 * 1.1, y - w2 * 0.66], [x - w2 * 0.6, y - w2 * 1.15], [x + w2 * 0.6, y - w2 * 1.15], [x + w2 * 1.1, y - w2 * 0.66]], col);
  }
  var PAINT = {
    village: function (c, w, h, hz, lv, rnd) {
      ridge(c, w, hz - 10, 40, 30, '#24324a', rnd);
      ridge(c, w, hz + 4, 22, 24, '#2c4034', rnd);
      for (var i = 0; i < 4; i++) {
        var x = w * (0.08 + i * 0.27 + rnd() * 0.05), y = hz + 12, s = 22 + rnd() * 8;
        roof(c, x, y, s, '#3a2e3a', '#4a4048');
        c.fillStyle = 'rgba(255,200,120,' + (0.85 - lv * 0.12) + ')'; c.fillRect(x - s * 0.4, y - s * 0.45, s * 0.25, s * 0.2); c.fillRect(x + s * 0.15, y - s * 0.45, s * 0.25, s * 0.2);
      }
      for (var k = 0; k < 3; k++) { var lx = w * (0.2 + k * 0.32); DW.rrect(c, lx - 1, hz - 6, 2, 22, 1, '#3a2a22'); DW.ell(c, lx, hz - 10, 6, 8, '#e8603a'); DW.circle(c, lx, hz - 10, 14, 'rgba(255,170,90,.18)'); }
    },
    forest: function (c, w, h, hz, lv, rnd) {
      ridge(c, w, hz - 20, 30, 40, '#1c2a30', rnd);
      for (var i = 0; i < 16; i++) treeSil(c, rnd() * w, hz + 6 + rnd() * 10, 1.1 + rnd() * 0.7, i % 2 ? '#1e3a2a' : '#24442e');
      for (var k = 0; k < 9; k++) treeSil(c, rnd() * w, hz + 22 + rnd() * 8, 1.6 + rnd() * 0.6, '#16301f');
    },
    mountain: function (c, w, h, hz, lv, rnd) {
      ridge(c, w, hz - 40, 90, 60, '#3a4a6a', rnd, true);
      c.fillStyle = 'rgba(220,226,240,.18)'; c.fillRect(0, hz - 40, w, 26);
      ridge(c, w, hz - 6, 50, 46, '#2e4050', rnd, true);
      c.fillStyle = 'rgba(220,226,240,.16)'; c.fillRect(0, hz - 6, w, 18);
      for (var i = 0; i < 10; i++) treeSil(c, rnd() * w, hz + 16, 0.9 + rnd() * 0.5, '#22382e');
    },
    beach: function (c, w, h, hz, lv, rnd) {
      var sy = hz + (h - hz) * 0.18;
      var sea = c.createLinearGradient(0, hz, 0, sy);
      sea.addColorStop(0, DW.mix('#1a3a6a', '#7ab0e0', lv / 6)); sea.addColorStop(1, DW.mix('#2a5a8a', '#9ad0f0', lv / 6));
      c.fillStyle = sea; c.fillRect(0, hz, w, sy - hz + 4);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.4;
      for (var i = 0; i < 26; i++) { var x = rnd() * w, y = hz + 6 + rnd() * Math.max(4, sy - hz - 10); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 8, y - 3, x + 16, y); c.stroke(); }
      var sand = c.createLinearGradient(0, sy, 0, h); sand.addColorStop(0, '#b89a66'); sand.addColorStop(1, '#e0c890');
      c.fillStyle = sand; c.beginPath(); c.moveTo(0, sy + 2); for (var x2 = 0; x2 <= w; x2 += 20) c.lineTo(x2, sy + Math.sin(x2 * 0.05) * 4); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
      // 松
      [[w * 0.06, sy + 6, 1.4], [w * 0.94, sy + 10, 1.6]].forEach(function (p) { DW.rrect(c, p[0] - 3, p[1] - 60 * p[2], 6, 60 * p[2], 2, '#3a2a22'); DW.ell(c, p[0] + 10, p[1] - 60 * p[2], 30 * p[2], 9 * p[2], '#1e3a2a'); DW.ell(c, p[0] - 6, p[1] - 44 * p[2], 24 * p[2], 8 * p[2], '#24442e'); });
    },
    darkmount: function (c, w, h, hz, lv, rnd) {
      ridge(c, w, hz - 30, 110, 34, '#2a2232', rnd, true);
      ridge(c, w, hz - 4, 60, 30, '#1e1a24', rnd, true);
      for (var i = 0; i < 8; i++) { var x = rnd() * w; DW.poly(c, [[x - 5, hz + 10], [x, hz - 30 - rnd() * 20], [x + 5, hz + 10]], '#141018'); }
    },
    fortress: function (c, w, h, hz, lv, rnd) {
      ridge(c, w, hz - 30, 60, 50, '#2a2a3a', rnd, true);
      c.fillStyle = '#3a2e26'; c.fillRect(0, hz - 34, w, 50);
      for (var x = 0; x < w; x += 14) { DW.poly(c, [[x, hz - 34], [x + 7, hz - 44], [x + 14, hz - 34]], '#3a2e26'); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + 13, hz - 34, 1.5, 50); }
      [w * 0.15, w * 0.85].forEach(function (tx) {
        c.fillStyle = '#2e241e'; c.fillRect(tx - 20, hz - 100, 40, 116);
        DW.poly(c, [[tx - 30, hz - 96], [tx, hz - 122], [tx + 30, hz - 96]], '#221a16');
        c.fillStyle = 'rgba(255,170,90,.8)'; c.fillRect(tx - 6, hz - 80, 12, 10);
        DW.rrect(c, tx + 18, hz - 118, 2, 36, 1, '#2a2020'); DW.poly(c, [[tx + 20, hz - 118], [tx + 40, hz - 112], [tx + 20, hz - 104]], '#a83a2a');
      });
      [w * 0.33, w * 0.67].forEach(function (bx) { DW.rrect(c, bx - 4, hz - 6, 8, 20, 2, '#2a2020'); DW.ell(c, bx, hz - 10, 8, 6, '#ff8a3a'); DW.circle(c, bx, hz - 12, 20, 'rgba(255,150,70,.2)'); });
    },
    cave: function (c, w, h, hz, lv, rnd) {
      var g = c.createLinearGradient(0, 0, 0, hz + 20); g.addColorStop(0, '#0a0808'); g.addColorStop(1, '#2a221e');
      c.fillStyle = g; c.fillRect(0, 0, w, hz + 20);
      for (var i = 0; i < 18; i++) { var x = rnd() * w, l = 20 + rnd() * 60; DW.poly(c, [[x - 10, 0], [x, l], [x + 10, 0]], '#1a1412'); }
      for (var k = 0; k < 7; k++) { var cx = rnd() * w, cy = hz - rnd() * hz * 0.5; DW.poly(c, [[cx - 5, cy + 8], [cx, cy - 10], [cx + 5, cy + 8]], 'rgba(255,190,110,.75)'); DW.circle(c, cx, cy, 16, 'rgba(255,190,110,.12)'); }
      ridge(c, w, hz + 10, 30, 30, '#221a16', rnd, true);
    },
    seacave: function (c, w, h, hz, lv, rnd) {
      var g = c.createLinearGradient(0, 0, 0, hz + 20); g.addColorStop(0, '#060a10'); g.addColorStop(1, '#1a2a36');
      c.fillStyle = g; c.fillRect(0, 0, w, hz + 20);
      for (var i = 0; i < 16; i++) { var x = rnd() * w, l = 20 + rnd() * 50; DW.poly(c, [[x - 9, 0], [x, l], [x + 9, 0]], '#0e161e'); }
      for (var k = 0; k < 8; k++) { var cx = rnd() * w, cy = hz - rnd() * hz * 0.5; DW.circle(c, cx, cy, 3, 'rgba(120,240,230,.8)'); DW.circle(c, cx, cy, 14, 'rgba(120,240,230,.12)'); }
      c.fillStyle = 'rgba(60,120,170,.5)'; c.fillRect(0, hz - 2, w, 16);
    },
    under: function (c, w, h, hz, lv, rnd) {
      for (var i = 0; i < 6; i++) { var x = rnd() * w, y = rnd() * hz * 0.8, s = 20 + rnd() * 30; DW.poly(c, [[x - s, y], [x + s, y], [x + s * 0.4, y + s * 0.9], [x - s * 0.3, y + s * 0.7]], '#241a34'); DW.ell(c, x, y, s, 5, '#3a2c50'); }
      for (var k = 0; k < 30; k++) DW.circle(c, rnd() * w, rnd() * hz, 1 + rnd() * 1.5, 'rgba(200,160,255,' + (0.3 + rnd() * 0.5) + ')');
      ridge(c, w, hz + 6, 26, 28, '#1c1428', rnd, true);
    },
    sky: function (c, w, h, hz, lv, rnd) {
      for (var i = 0; i < 9; i++) { var x = rnd() * w, y = hz - 30 + rnd() * 40, s = 30 + rnd() * 40; DW.ell(c, x, y, s, s * 0.35, 'rgba(255,255,255,.85)'); DW.ell(c, x + s * 0.4, y - s * 0.2, s * 0.6, s * 0.3, 'rgba(255,255,255,.9)'); }
      var tx = w * 0.5; c.fillStyle = '#c8402c'; c.fillRect(tx - 40, hz - 70, 7, 70); c.fillRect(tx + 33, hz - 70, 7, 70); c.fillRect(tx - 52, hz - 76, 104, 8); c.fillRect(tx - 44, hz - 60, 88, 5);
    }
  };

  // ====================== 並び ======================
  var PSLOT = [[0.70, 0.52], [0.86, 0.63], [0.68, 0.79], [0.85, 0.92]];
  var EFORM = {
    1: [[0.30, 0.78]],
    2: [[0.20, 0.62], [0.38, 0.82]],
    3: [[0.16, 0.58], [0.38, 0.72], [0.18, 0.92]],
    4: [[0.12, 0.56], [0.33, 0.62], [0.16, 0.84], [0.40, 0.90]],
    5: [[0.10, 0.52], [0.28, 0.58], [0.45, 0.70], [0.14, 0.80], [0.32, 0.92]]
  };
  function partyH(A) { return clamp(Math.min(A.h * 0.36, A.w * 0.25), 54, 168); }
  function layout(V) {
    var A = V.area, D = V.D, ph = partyH(A), P = {};
    var ens = [], nmax = 0;
    for (var id in D) { var d = D[id]; if (d.side === 'e' && !d.gone) { ens.push(d); nmax = Math.max(nmax, d.slot + 1); } }
    nmax = clamp(nmax, 1, 5);
    for (var k in D) {
      var u = D[k], p;
      if (u.side === 'p') {
        if (u.bench) continue;
        var sl = PSLOT[clamp(u.slot, 0, 3)];
        p = { x: A.x + A.w * sl[0], y: A.y + A.h * sl[1], h: ph, side: 'p' };
      } else {
        if (u.gone) continue;
        var e = EN()[u.eid] || {}, size = e.size || 1, f;
        if (u.boss && ens.length === 1) f = [0.28, 0.86];
        else f = (EFORM[nmax] || EFORM[5])[clamp(u.slot, 0, 4)];
        var hh = e.cn ? ph * (size > 1 ? 1.1 : 1) : ph * 0.82 * size * (nmax >= 4 ? 0.88 : 1);
        if (u.boss) hh = Math.min(hh, A.h * 0.8);
        p = { x: A.x + A.w * f[0], y: A.y + A.h * f[1], h: hh, side: 'e', cn: e.cn || null, shape: e.shape, col: e.col };
      }
      p.cx = p.x; p.cy = p.y - p.h * 0.5;
      P[k] = p;
    }
    R.pos = P;
    return P;
  }
  function vis(uid) { return R.vis[uid] || (R.vis[uid] = { ox: 0, oy: 0, mv: null, hitT: 0, shk: 0, koT: 0, appear: 1, pose: null, poseT: 0, glow: 0, glowCol: '255,255,255', pulse: 0, hpShown: null }); }

  // ====================== 1コマ ======================
  // V: { B, D, area, dawn, bbg, t, dt, cur（番の人）, tgts（ねらい中）, hover, win（勝ったときの喜び）}
  function frame(V) {
    var c = R.c, s = R.dpr, dt = V.dt || 0.016;
    R.t = V.t; R.area = V.area;
    var A0 = V.area, key = V.bbg + ':' + V.dawn + ':' + R.cv.width + 'x' + R.cv.height + ':' + Math.round(A0.y) + ':' + Math.round(A0.h);
    if (key !== R.bgKey) { R.bg = buildBg(V.bbg || 'village', clamp(V.dawn | 0, 0, 6), R.cv.width, R.cv.height, A0); R.bgKey = key; R.motes = null; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(R.bg, 0, 0);
    // ゆれ
    var sx = 0, sy = 0;
    if (R.shakeT > 0) { R.shakeT -= dt; var a = R.shakeA * clamp(R.shakeT / 0.3, 0, 1); sx = (Math.random() - 0.5) * a * 2; sy = (Math.random() - 0.5) * a * 2; }
    c.setTransform(s, 0, 0, s, sx * s, sy * s);
    motes(c, V, dt);
    var P = layout(V);
    // 動き（前に出る・もどる）
    for (var uid in R.vis) stepVis(R.vis[uid], dt);
    // 下にあるものほど手前
    var list = [];
    for (var k in P) list.push({ uid: k, p: P[k] });
    list.sort(function (a, b) { return a.p.y - b.p.y; });
    R.rects = {};
    list.forEach(function (it) { drawUnit(c, V, it.uid, it.p); });
    list.forEach(function (it) { if (it.p.side === 'e') enemyInfo(c, V, it.uid, it.p); });
    drawFx(c, dt);
    drawPops(c, dt);
    // 光る
    if (R.flashT > 0) { R.flashT -= dt; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgba(' + R.flashCol + ',' + clamp(R.flashT / R.flashDur, 0, 1) * 0.5 + ')'; c.fillRect(0, 0, R.cv.width, R.cv.height); }
  }
  function stepVis(v, dt) {
    if (v.mv) {
      v.mv.t += dt;
      var k = v.mv.t / v.mv.dur;
      if (k >= 1) { v.ox = 0; v.oy = 0; v.mv = null; }
      else { var e = k < 0.45 ? ease(k / 0.45) : 1 - ease((k - 0.45) / 0.55); v.ox = v.mv.dx * e; v.oy = v.mv.dy * e - Math.sin(Math.min(1, k * 2) * Math.PI) * (v.mv.hop || 0); }
    }
    if (v.hitT > 0) v.hitT -= dt;
    if (v.shk > 0) v.shk -= dt;
    if (v.poseT > 0) { v.poseT -= dt; if (v.poseT <= 0) v.pose = null; }
    if (v.glow > 0) v.glow -= dt;
    if (v.pulse > 0) v.pulse -= dt;
  }

  // ふわふわ飛ぶ光（森の蛍・根の国の魂・海の泡）
  function motes(c, V, dt) {
    var kind = { forest: '200,255,140', under: '200,160,255', seacave: '140,240,230', cave: '255,200,120', village: '255,210,150', sky: '255,255,255' }[V.bbg];
    if (!kind) return;
    var A = V.area;
    if (!R.motes) { R.motes = []; for (var i = 0; i < 18; i++) R.motes.push({ x: Math.random(), y: Math.random(), p: Math.random() * 6, v: 0.02 + Math.random() * 0.04 }); }
    R.motes.forEach(function (m) {
      m.y -= m.v * dt; if (m.y < 0) { m.y = 1; m.x = Math.random(); }
      var x = A.x + m.x * A.w + Math.sin(R.t * 0.8 + m.p) * 14, y = A.y + m.y * A.h, a = 0.35 + Math.sin(R.t * 2 + m.p) * 0.3;
      DW.circle(c, x, y, 5, 'rgba(' + kind + ',' + a * 0.25 + ')'); DW.circle(c, x, y, 1.6, 'rgba(' + kind + ',' + a + ')');
    });
  }

  // ---- 1人（1体）を描く ----
  function drawUnit(c, V, uid, p) {
    var d = V.D[uid], v = vis(uid);
    var x = p.x + v.ox + (v.shk > 0 ? Math.sin(v.shk * 60) * 4 : 0), y = p.y + v.oy;
    var isCur = V.cur === +uid, isTg = V.tgts && V.tgts.indexOf(+uid) >= 0;
    // 足もとの輪
    if (isCur && !d.ko) { DW.ell(c, x, y, p.h * 0.36, p.h * 0.09, 'rgba(255,224,130,.28)', 'rgba(255,230,150,.95)', 2.2); }
    if (isTg) { var a = 0.6 + Math.sin(R.t * 8) * 0.3; DW.ell(c, x, y, p.h * 0.38, p.h * 0.1, null, d.side === 'e' ? 'rgba(255,110,90,' + a + ')' : 'rgba(130,255,170,' + a + ')', 3); }
    if (v.glow > 0) { var gg = c.createRadialGradient(x, y - p.h * 0.4, 4, x, y - p.h * 0.4, p.h * 0.7); gg.addColorStop(0, 'rgba(' + v.glowCol + ',' + Math.min(0.5, v.glow) + ')'); gg.addColorStop(1, 'rgba(' + v.glowCol + ',0)'); c.fillStyle = gg; c.fillRect(x - p.h, y - p.h * 1.2, p.h * 2, p.h * 1.4); }
    var alpha = 1;
    if (d.side === 'e' && d.ko) { v.koT = Math.min(1, v.koT + (V.dt || 0.016) * 2.2); alpha = 1 - v.koT; if (alpha <= 0.01) { R.rects[uid] = null; return; } }
    else if (!d.ko) v.koT = Math.max(0, v.koT - (V.dt || 0.016) * 4);
    if (v.appear < 1) { v.appear = Math.min(1, v.appear + (V.dt || 0.016) * 3); alpha *= v.appear; }
    if (d.fled) { alpha *= 0; }
    c.save(); c.globalAlpha = alpha;
    if (p.side === 'p' || p.cn) drawNinja(c, V, d, v, p, x, y);
    else {
      c.translate(x, y + (d.side === 'e' && d.ko ? v.koT * 10 : 0));
      var sz = (YK.SIZE[p.shape] || 44), sc = p.h / sz;
      var broken = d.broken;
      YK.draw(c, p.shape, p.col, { t: R.t + (+uid) * 0.37, s: sc, dir: 1, hit: v.hitT > 0, daze: broken, ko: d.ko, charge: d.charging, boss: d.boss });
    }
    c.restore();
    if (v.hitT > 0 && p.side === 'e' && !p.cn) { c.save(); c.globalCompositeOperation = 'lighter'; DW.circle(c, x, y - p.h * 0.45, p.h * 0.4, 'rgba(255,255,255,' + v.hitT * 1.2 + ')'); c.restore(); }
    // ねらいの矢印
    if (isTg || (isCur && d.side === 'p')) {
      var by = y - p.h - 12 + Math.sin(R.t * 6) * 4;
      DW.poly(c, [[x - 8, by - 10], [x + 8, by - 10], [x, by]], isTg ? (d.side === 'e' ? '#ff7a5a' : '#8af0b0') : '#ffe08a', '#2a1a10', 1.5);
    }
    R.rects[uid] = { x0: x - p.h * 0.45, x1: x + p.h * 0.45, y0: y - p.h * 1.05, y1: y + 8 };
    // 状態の印
    var sts = [];
    if (d.st) for (var k in d.st) if (d.st[k] && STATUS()[k]) sts.push(k);
    if (sts.length) { var sxx = x - (sts.length - 1) * 9; sts.forEach(function (k, i) { DW.circle(c, sxx + i * 18, y - p.h - 2, 8, STATUS()[k].color, '#1a1220', 1.4); DW.text(c, STATUS()[k].name[0], sxx + i * 18, y - p.h - 2, 9, '#fff'); }); }
  }
  // 忍者（仲間・腕試しの相手）
  function drawNinja(c, V, d, v, p, x, y) {
    var def = d.side === 'p' ? SPR.memberDef(d.id, V.B.S) : SPR.cnDef(p.cn);
    if (!def || !def.def) return;
    var pose = v.pose || (d.ko ? 'surprised' : V.win && d.side === 'p' ? 'happy' : 'stand');
    var expr = v.pose ? null : (d.ko ? 'surprised' : d.side === 'e' || V.cur === d.uid ? 'serious' : null);
    var yaw = d.side === 'p' ? 62 : -62;
    var img = SPR.get(def, { yaw: yaw, pose: pose, h: p.h * R.dpr, expr: expr || undefined });
    var w = p.h * 200 / 240;
    DW.ell(c, x, y, p.h * 0.26, p.h * 0.06, 'rgba(0,0,0,.3)');
    if (!img) return;
    c.save();
    c.translate(x, y);
    if (d.ko) { c.rotate((d.side === 'p' ? 1 : -1) * Math.PI * 0.42); c.globalAlpha *= 0.7; c.translate(0, -p.h * 0.05); }
    if (V.win && d.side === 'p' && !d.ko) c.translate(0, -Math.abs(Math.sin(R.t * 5 + d.slot)) * p.h * 0.08);
    c.drawImage(img, -w / 2, -p.h * SPR.FOOT_Y, w, p.h);
    if (v.hitT > 0) { var wi = white(img); c.globalAlpha *= Math.min(1, v.hitT * 4) * 0.8; c.drawImage(wi, -w / 2, -p.h * SPR.FOOT_Y, w, p.h); }
    c.restore();
    if (d.side === 'e' && d.charging) { var a = 0.3 + Math.sin(R.t * 12) * 0.15; DW.ell(c, x, y - p.h * 0.45, p.h * 0.42, p.h * 0.55, 'rgba(255,70,50,' + a * 0.6 + ')'); }
    if (d.side === 'e' && d.broken) { for (var i = 0; i < 3; i++) { var an = R.t * 3 + i * 2.1; DW.text(c, '★', x + Math.cos(an) * p.h * 0.22, y - p.h * 1.0 + Math.sin(an) * 5, 12, '#ffe27a'); } }
  }
  function white(img) {
    if (img._white) return img._white;
    var cv = DW.mk(img.width, img.height), cc = cv.getContext('2d');
    cc.drawImage(img, 0, 0); cc.globalCompositeOperation = 'source-atop'; cc.fillStyle = '#fff'; cc.fillRect(0, 0, cv.width, cv.height);
    img._white = cv; return cv;
  }
  // 妖怪の下：HP・構え・弱点
  function enemyInfo(c, V, uid, p) {
    var d = V.D[uid], v = vis(uid);
    if (d.ko || d.fled) return;
    var x = p.x, y = p.y + 10, bw = clamp(p.h * 0.9, 56, 150);
    if (v.hpShown == null) v.hpShown = d.hp;
    v.hpShown += (d.hp - v.hpShown) * Math.min(1, (V.dt || 0.016) * 8);
    var r = clamp(v.hpShown / d.mhp, 0, 1);
    DW.rrect(c, x - bw / 2, y, bw, 6, 3, 'rgba(0,0,0,.6)');
    if (r > 0) DW.rrect(c, x - bw / 2 + 1, y + 1, (bw - 2) * r, 4, 2, r > 0.5 ? '#6ad88a' : r > 0.25 ? '#f0c040' : '#f0604a');
    // 構え（盾）
    var sx = x - bw / 2 - 16, sy = y + 3, pul = v.pulse > 0 ? 1 + v.pulse * 0.8 : 1;
    c.save(); c.translate(sx, sy); c.scale(pul, pul);
    if (d.broken) { DW.poly(c, [[-11, -10], [11, -10], [11, 2], [0, 12], [-11, 2]], '#d83a3a', '#fff', 1.6); DW.text(c, '崩', 0, -1, 11, '#fff'); }
    else { DW.poly(c, [[-11, -10], [11, -10], [11, 2], [0, 12], [-11, 2]], '#5a6a8a', '#e8eef8', 1.6); DW.text(c, String(d.shield), 0, -1, 12, '#fff'); }
    c.restore();
    // 弱点（分かっているものは色つき）
    var n = d.weak.length, ix = x - (n - 1) * 10;
    for (var i = 0; i < n; i++) {
      var ty = d.weak[i], known = d.known[ty], X = ix + i * 20, Y = y + 17;
      if (known) { DW.circle(c, X, Y, 9, TYPES()[ty].color, '#1a1220', 1.5); DW.text(c, TYPES()[ty].name, X, Y + 0.5, 10, '#1a1420'); }
      else { DW.circle(c, X, Y, 9, 'rgba(40,40,60,.85)', 'rgba(255,255,255,.5)', 1.3); DW.text(c, '?', X, Y + 0.5, 11, '#fff'); }
    }
    if (d.charging) { var cy = p.y - p.h - 14; DW.rrect(c, x - 26, cy - 9, 52, 18, 8, 'rgba(200,40,30,.92)', '#fff', 1.4); DW.text(c, 'ため', x, cy, 11, '#fff'); }
    if (V.showNames || (V.tgts && V.tgts.indexOf(+uid) >= 0) || V.hover === +uid) {
      c.font = '800 12px ' + FONT; var tw = c.measureText(d.name).width + 14;
      DW.rrect(c, x - tw / 2, p.y - p.h - 34, tw, 18, 8, 'rgba(10,12,30,.85)'); DW.text(c, d.name, x, p.y - p.h - 25, 12, '#fff');
    }
  }

  // ====================== 術の光 ======================
  function typeCol(ty) { var T = TYPES()[ty]; return T ? T.color : '#ffffff'; }
  function rgb(hex) { var n = parseInt(hex.replace('#', ''), 16); return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); }
  function addFx(f) { f.age = -(f.delay || 0); R.fx.push(f); return f; }
  function drawFx(c, dt) {
    R.fx = R.fx.filter(function (f) { f.age += dt; return f.age < f.dur; });
    R.fx.forEach(function (f) {
      if (f.age < 0) return;
      var k = clamp(f.age / f.dur, 0, 1), col = f.col || '255,255,255';
      c.save();
      switch (f.k) {
        case 'proj': {
          var x = lerp(f.x0, f.x1, ease(k)), y = lerp(f.y0, f.y1, ease(k)) - Math.sin(k * Math.PI) * (f.arc || 0);
          for (var i = 1; i <= 4; i++) { var kk = Math.max(0, k - i * 0.06), tx = lerp(f.x0, f.x1, ease(kk)), ty = lerp(f.y0, f.y1, ease(kk)) - Math.sin(kk * Math.PI) * (f.arc || 0); DW.circle(c, tx, ty, (f.r || 6) * (1 - i * 0.18), 'rgba(' + col + ',' + (0.35 - i * 0.07) + ')'); }
          glyph(c, f.g, x, y, f.r || 6, col, R.t * 14);
          break;
        }
        case 'burst': {
          var rr = (f.r || 30) * ease(k);
          c.globalCompositeOperation = 'lighter';
          DW.circle(c, f.x, f.y, rr, 'rgba(' + col + ',' + (1 - k) * 0.45 + ')');
          c.strokeStyle = 'rgba(' + col + ',' + (1 - k) + ')'; c.lineWidth = 3;
          for (var j = 0; j < 8; j++) { var an = j * 0.785 + (f.rot || 0); c.beginPath(); c.moveTo(f.x + Math.cos(an) * rr * 0.4, f.y + Math.sin(an) * rr * 0.4); c.lineTo(f.x + Math.cos(an) * rr * 1.1, f.y + Math.sin(an) * rr * 1.1); c.stroke(); }
          break;
        }
        case 'slash': {
          c.globalCompositeOperation = 'lighter';
          c.translate(f.x, f.y); c.rotate(f.rot || -0.6);
          c.strokeStyle = 'rgba(' + col + ',' + (1 - k) + ')'; c.lineWidth = (f.w || 5) * (1 - k * 0.5); c.lineCap = 'round';
          var L = (f.r || 40);
          c.beginPath(); c.arc(0, 0, L, -1.2 + k * 0.4, -1.2 + k * 0.4 + 2.2 * ease(Math.min(1, k * 2))); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; c.lineWidth = 1.6; c.stroke();
          break;
        }
        case 'bolt': {
          c.globalCompositeOperation = 'lighter';
          c.strokeStyle = 'rgba(' + col + ',' + (1 - k) + ')'; c.lineWidth = 4; c.lineJoin = 'round';
          c.beginPath(); var bx = f.x, by = f.y - 260; c.moveTo(bx, by);
          var seg = 7; for (var q = 1; q <= seg; q++) { by = lerp(f.y - 260, f.y, q / seg); c.lineTo(f.x + (q === seg ? 0 : (Math.random() - 0.5) * 34), by); }
          c.stroke(); c.strokeStyle = 'rgba(255,255,255,' + (1 - k) + ')'; c.lineWidth = 1.5; c.stroke();
          DW.circle(c, f.x, f.y, 26 * (1 - k), 'rgba(' + col + ',' + (1 - k) * 0.5 + ')');
          break;
        }
        case 'pillar': {
          c.globalCompositeOperation = 'lighter';
          var gw = (f.w || 50) * (k < 0.3 ? k / 0.3 : 1), gp = c.createLinearGradient(f.x - gw / 2, 0, f.x + gw / 2, 0);
          gp.addColorStop(0, 'rgba(' + col + ',0)'); gp.addColorStop(0.5, 'rgba(' + col + ',' + (1 - k) * 0.7 + ')'); gp.addColorStop(1, 'rgba(' + col + ',0)');
          c.fillStyle = gp; c.fillRect(f.x - gw / 2, f.y - 400, gw, 410);
          break;
        }
        case 'sparkle': {
          c.globalCompositeOperation = 'lighter';
          for (var s2 = 0; s2 < (f.n || 8); s2++) { var a2 = s2 * 2.39 + f.seed, rr2 = (f.r || 30) * (0.3 + 0.7 * ((s2 * 37) % 10) / 10), yy = f.y - k * (f.rise || 40); var px = f.x + Math.cos(a2) * rr2, py = yy + Math.sin(a2) * rr2 * 0.5; star(c, px, py, 3 + (1 - k) * 3, 'rgba(' + col + ',' + (1 - k) + ')'); }
          break;
        }
        case 'ring': {
          c.strokeStyle = 'rgba(' + col + ',' + (1 - k) + ')'; c.lineWidth = 3;
          DW.ell(c, f.x, f.y, (f.r || 40) * ease(k), (f.r || 40) * ease(k) * 0.32, null, 'rgba(' + col + ',' + (1 - k) + ')', 3);
          break;
        }
        case 'wave': {   // 画面を横切る（全体の術）
          c.globalCompositeOperation = 'lighter';
          var wx = lerp(f.x0, f.x1, ease(k)), gh = f.h || 200;
          var wg = c.createLinearGradient(wx - 80, 0, wx + 80, 0);
          wg.addColorStop(0, 'rgba(' + col + ',0)'); wg.addColorStop(0.5, 'rgba(' + col + ',' + (1 - k) * 0.6 + ')'); wg.addColorStop(1, 'rgba(' + col + ',0)');
          c.fillStyle = wg; c.fillRect(wx - 80, f.y - gh / 2, 160, gh);
          for (var m = 0; m < 10; m++) glyph(c, f.g, wx + Math.sin(m * 1.7 + f.age * 6) * 40, f.y - gh / 2 + (m + 0.5) * gh / 10, 5, col, R.t * 8 + m);
          break;
        }
        case 'smoke': {
          for (var sm = 0; sm < 7; sm++) { var as = sm * 0.9; DW.circle(c, f.x + Math.cos(as) * 24 * k, f.y + Math.sin(as) * 12 * k - 16 * k, 16 * (1 - k * 0.5), 'rgba(235,235,240,' + 0.8 * (1 - k) + ')'); }
          break;
        }
        case 'shards': {
          for (var sh = 0; sh < 9; sh++) { var a3 = sh * 0.7 + 0.3, d3 = 70 * ease(k); var px3 = f.x + Math.cos(a3) * d3, py3 = f.y + Math.sin(a3) * d3 * 0.7 + k * k * 40; c.save(); c.translate(px3, py3); c.rotate(k * 6 + sh); DW.poly(c, [[-6, -4], [6, -3], [1, 6]], 'rgba(200,215,240,' + (1 - k) + ')', 'rgba(255,255,255,' + (1 - k) + ')', 1); c.restore(); }
          break;
        }
        case 'notes': {
          for (var nt = 0; nt < 5; nt++) { var nx = f.x + Math.sin(nt * 2 + f.age * 4) * 26, ny = f.y - k * 60 - nt * 10; DW.text(c, nt % 2 ? '♪' : '♫', nx, ny, 16, 'rgba(' + col + ',' + (1 - k) + ')'); }
          break;
        }
        case 'petals': {
          for (var pt = 0; pt < 14; pt++) { var px4 = f.x + Math.sin(pt * 3.1 + f.age * 2) * (f.r || 120), py4 = f.y - 120 + ((pt * 31 + f.age * 140) % 200); c.save(); c.translate(px4, py4); c.rotate(f.age * 3 + pt); DW.ell(c, 0, 0, 5, 3, 'rgba(' + col + ',' + (1 - k) + ')'); c.restore(); }
          break;
        }
        case 'stamp': {
          var sc = k < 0.15 ? 2.2 - k / 0.15 * 1.2 : 1, al = k > 0.75 ? (1 - k) / 0.25 : 1;
          c.translate(f.x, f.y); c.scale(sc, sc); c.rotate(-0.12);
          c.globalAlpha = al;
          c.font = '900 ' + (f.size || 34) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = 7; c.strokeStyle = '#2a0a08'; c.strokeText(f.text, 0, 0);
          c.fillStyle = f.fill || '#ff5a3a'; c.fillText(f.text, 0, 0);
          break;
        }
      }
      c.restore();
    });
  }
  function star(c, x, y, r, fill) {
    c.beginPath(); c.moveTo(x, y - r * 2); c.lineTo(x + r * 0.4, y - r * 0.4); c.lineTo(x + r * 2, y); c.lineTo(x + r * 0.4, y + r * 0.4); c.lineTo(x, y + r * 2); c.lineTo(x - r * 0.4, y + r * 0.4); c.lineTo(x - r * 2, y); c.lineTo(x - r * 0.4, y - r * 0.4); c.closePath(); c.fillStyle = fill; c.fill();
  }
  // 飛ぶ物の形
  function glyph(c, g, x, y, r, col, rot) {
    c.save(); c.translate(x, y);
    switch (g) {
      case 'shuriken': c.rotate(rot); for (var i = 0; i < 4; i++) { c.rotate(Math.PI / 2); DW.poly(c, [[0, -r * 1.8], [r * 0.5, -r * 0.4], [-r * 0.5, -r * 0.4]], '#d8dde8', '#2a2a34', 1); } DW.circle(c, 0, 0, r * 0.35, '#2a2a34'); break;
      case 'arrow': c.rotate(Math.atan2(0, 1) + Math.PI); c.strokeStyle = '#e8d8b0'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 2, 0); c.lineTo(r * 2, 0); c.stroke(); DW.poly(c, [[-r * 2.6, 0], [-r * 1.6, -r * 0.7], [-r * 1.6, r * 0.7]], '#c8ccd8'); break;
      case 'paper': c.rotate(rot * 0.3); DW.rrect(c, -r * 0.7, -r, r * 1.4, r * 2, 1, '#fff6dc', '#a83a2a', 1); c.fillStyle = '#c83a2a'; c.fillRect(-1, -r * 0.7, 2, r * 1.4); break;
      case 'leaf': c.rotate(rot * 0.5); DW.ell(c, 0, 0, r * 1.2, r * 0.55, 'rgb(' + col + ')', 'rgba(0,0,0,.4)', 1); break;
      case 'note': DW.text(c, '♪', 0, 0, r * 3, 'rgb(' + col + ')'); break;
      case 'paw': DW.circle(c, 0, 0, r, 'rgb(' + col + ')'); DW.circle(c, -r * 0.8, -r * 0.9, r * 0.45, 'rgb(' + col + ')'); DW.circle(c, r * 0.8, -r * 0.9, r * 0.45, 'rgb(' + col + ')'); break;
      case 'bird': c.strokeStyle = 'rgb(' + col + ')'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-r * 1.6, -r * 0.4 + Math.sin(rot) * r * 0.6); c.quadraticCurveTo(-r * 0.6, -r * 1.2, 0, 0); c.quadraticCurveTo(r * 0.6, -r * 1.2, r * 1.6, -r * 0.4 + Math.sin(rot) * r * 0.6); c.stroke(); break;
      case 'bubble': DW.circle(c, 0, 0, r, 'rgba(' + col + ',.35)', 'rgba(255,255,255,.8)', 1.4); DW.circle(c, -r * 0.35, -r * 0.35, r * 0.25, '#fff'); break;
      default: { var g2 = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.2); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(0.35, 'rgba(' + col + ',.95)'); g2.addColorStop(1, 'rgba(' + col + ',0)'); c.fillStyle = g2; c.beginPath(); c.arc(0, 0, r * 2.2, 0, 7); c.fill(); }
    }
    c.restore();
  }

  // 動き（アニメの名前 → 見せ方）
  var MELEE = { attack: 1, punches: 1, punch_big: 1, club: 1, hammer: 1, bump: 1, roll: 1, giant: 1, panda: 1, panda_big: 1, bite: 1, claw: 1, slash: 1, slash_big: 1, light_slash: 1, blades: 1, sakura_atk: 1, all_out: 1, wrap: 1, counter: 1 };
  var SLASHY = { slash: 1, slash_big: 1, light_slash: 1, blades: 1, claw: 1, bite: 1, sakura_atk: 1 };
  var PROJ = { shuriken: 'shuriken', arrow: 'arrow', gun: 'orb', cannon: 'orb', needle: 'arrow', talisman: 'paper', feathers: 'leaf', leaves: 'leaf', bubbles: 'bubble', onibi: 'orb', fire: 'orb', water: 'orb', paint: 'orb', dango: 'orb', rock: 'orb', snake: 'orb', thread: 'orb', web: 'orb', chain: 'orb', imp: 'orb', ghost: 'orb', summon_bird: 'bird', summon_eagle: 'bird', hawk: 'bird', summon_dog: 'paw', summon_rabbit: 'paw', music: 'note', drum: 'note', throw: 'shuriken', item: 'orb', curse: 'orb', dark: 'orb', bomb: 'orb', kizuna: 'orb', eye: 'orb', scare: 'orb', fortune: 'orb' };
  var AREA = { fire_all: 1, water_all: 1, thunder_all: 1, wind_all: 1, light_all: 1, poison_rain: 1, wave: 1, fireworks: 1, lanterns: 1, dark_wing: 1, quake: 1, poison_mist: 1, dark_mist: 1, mist: 1, smoke: 1, domain: 1, nirvana: 1, dawn: 1, rainbow: 1, sweep: 1, leaves_all: 1 };
  var BOLT = { thunder: 1, light: 1, flash: 1 };
  function family(an) { if (MELEE[an]) return 'melee'; if (BOLT[an]) return 'bolt'; if (AREA[an]) return 'area'; return 'proj'; }

  function pos(uid) { return R.pos[uid] || null; }
  function lunge(uid, tuid, hop) {
    var a = pos(uid), b = pos(tuid), v = vis(uid);
    if (!a) return;
    var dx = b ? (b.x - a.x) * 0.55 : (a.side === 'p' ? -60 : 60), dy = b ? (b.y - a.y) * 0.55 : 0;
    v.mv = { t: 0, dur: 0.42, dx: dx, dy: dy, hop: hop || 6 };
  }
  function step(uid, col) {
    var a = pos(uid), v = vis(uid); if (!a) return;
    v.mv = { t: 0, dur: 0.4, dx: a.side === 'p' ? -18 : 18, dy: 0, hop: 4 };
    v.glow = 0.7; v.glowCol = col || '255,255,255';
  }
  function hurt(uid, big) { var v = vis(uid); v.hitT = big ? 0.32 : 0.22; v.shk = big ? 0.3 : 0.18; }
  function setPose(uid, pose, t) { var v = vis(uid); v.pose = pose; v.poseT = t || 0.6; }
  function shake(a, t) { if (R.noShake) return; R.shakeA = Math.max(R.shakeA * (R.shakeT > 0 ? 1 : 0), a); R.shakeT = Math.max(R.shakeT, t || 0.3); }
  function flash(col, t) { R.flashCol = col ? rgb(col) : '255,255,255'; R.flashT = t || 0.3; R.flashDur = t || 0.3; }

  // 数字・ことば
  var POPSTYLE = {
    dmg: { size: 24, fill: '#ffffff', stroke: '#2a1410' }, weak: { size: 28, fill: '#ffe24a', stroke: '#5a2a00' }, crit: { size: 30, fill: '#ff9a3a', stroke: '#3a0a00' },
    res: { size: 18, fill: '#b8c0d0', stroke: '#1a1a24' }, heal: { size: 24, fill: '#7affa8', stroke: '#0a3018' }, sp: { size: 20, fill: '#8ac8ff', stroke: '#0a1a3a' },
    info: { size: 16, fill: '#ffffff', stroke: '#1a1a30' }, bad: { size: 16, fill: '#e8b0ff', stroke: '#2a0a3a' }, good: { size: 16, fill: '#a8ffd0', stroke: '#0a2a1a' },
    miss: { size: 18, fill: '#d8e0f0', stroke: '#1a1a24' }, tag: { size: 14, fill: '#ffe24a', stroke: '#5a2a00' }, big: { size: 22, fill: '#ffe8a0', stroke: '#3a1a00' }
  };
  function pop(uid, text, style, o) {
    var p = pos(uid); if (!p) return;
    o = o || {};
    var n = R.pops.filter(function (q) { return q.uid === uid && q.age < 0.25; }).length;
    R.pops.push({ uid: uid, x: p.x + (o.dx || 0) + (n % 2 ? 14 : -6) * (n ? 1 : 0), y: p.y - p.h * (o.at || 0.62) - n * 18, text: String(text), st: POPSTYLE[style] || POPSTYLE.info, age: -(o.delay || 0), dur: o.dur || 0.95 });
  }
  function drawPops(c, dt) {
    R.pops = R.pops.filter(function (q) { q.age += dt; return q.age < q.dur; });
    R.pops.forEach(function (q) {
      if (q.age < 0) return;
      var k = q.age / q.dur, y = q.y - ease(Math.min(1, k * 2.5)) * 22, sc = k < 0.12 ? 1.4 - k / 0.12 * 0.4 : 1, al = k > 0.75 ? (1 - k) / 0.25 : 1;
      c.save(); c.translate(q.x, y); c.scale(sc, sc); c.globalAlpha = al;
      c.font = '900 ' + q.st.size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round'; c.lineWidth = Math.max(4, q.st.size * 0.22); c.strokeStyle = q.st.stroke; c.strokeText(q.text, 0, 0);
      c.fillStyle = q.st.fill; c.fillText(q.text, 0, 0);
      c.restore();
    });
  }

  // ====================== できごと → 見せ方 ======================
  // Q: { B, D, act（いま見せている技）, peek（次の当たりの相手をさがす）}  返り値：待つ秒数
  var SKIPTXT = { broken: '崩れて動けない', sleep: '眠っている…', stun: '怯んで動けない', ko: '' };
  var STXT = { poison: '毒', sleep: '眠り', seal: '術を封じた', stun: '怯み', curse: '呪い', cover: 'かばう', counter: '反撃の構え', evade: '見切り', regen: '再生', taunt: '引きつけ', clone: '分身', mist: '霧の衣' };
  function onEvent(e, Q) {
    var D = Q.D, A = Q.act;
    switch (e.t) {
      case 'round': return 0.05;
      case 'turn': return D[e.u] && D[e.u].side === 'e' ? 0.14 : 0.02;
      case 'skip': if (SKIPTXT[e.why]) pop(e.u, SKIPTXT[e.why], 'info'); return SKIPTXT[e.why] ? 0.55 : 0.1;
      case 'act': {
        var fam = family(e.an), col = rgb(typeCol(e.ty || 'hikari'));
        Q.act = { u: e.u, an: e.an, ty: e.ty, fam: fam, col: col, n: 0, ult: e.ult || e.kind === 'kizuna', kind: e.kind, item: e.item };
        if (e.kind === 'guard') { setPose(e.u, 'serious', 0.6); addFx({ k: 'ring', x: pos(e.u) ? pos(e.u).x : 0, y: pos(e.u) ? pos(e.u).y : 0, r: 50, col: '150,200,255', dur: 0.5 }); return 0.4; }
        if (e.kind === 'flee') { setPose(e.u, 'surprised', 0.8); return 0.45; }
        if (e.an === 'all_out') { flash('#ffe0f0', 0.35); shake(6, 0.4); return 0.3; }
        if (fam === 'melee') { var tg = Q.peek(e.u); lunge(e.u, tg, e.an === 'roll' ? 12 : 6); if (D[e.u] && D[e.u].side === 'p') setPose(e.u, 'fists', 0.7); return e.big ? 0.42 : 0.26; }
        step(e.u, col);
        if (D[e.u] && D[e.u].side === 'p') setPose(e.u, e.kind === 'heal' ? 'happy' : 'seal', 0.8);
        if (A && A.ult || Q.act.ult || e.big) { flash(e.ty ? typeCol(e.ty) : '#ffffff', 0.35); shake(5, 0.35); }
        return e.big ? 0.5 : 0.32;
      }
      case 'hit': {
        var a = Q.act || { fam: 'melee', col: '255,255,255', n: 0 };
        var tp = pos(e.tg), up = pos(e.u);
        if (!tp) return 0.1;
        if (e.sac) return 0.2;
        var c2 = e.ty ? rgb(typeCol(e.ty)) : a.col, first = a.n === 0;
        a.n++;
        if (e.dot) { hurt(e.tg); pop(e.tg, e.dmg, 'bad'); return 0.35; }
        if (e.miss) { pop(e.tg, e.why === 'evade' ? '見切った！' : 'ミス', 'miss'); return 0.32; }
        var delay = 0;
        if (a.fam === 'proj' && up) {
          delay = 0.16;
          addFx({ k: 'proj', x0: up.x + (up.side === 'p' ? -up.h * 0.25 : up.h * 0.25), y0: up.y - up.h * 0.55, x1: tp.x, y1: tp.y - tp.h * 0.5, g: PROJ[a.an] || 'orb', col: c2, r: a.an === 'cannon' ? 9 : 6, arc: a.an === 'arrow' || a.an === 'needle' ? 18 : 6, dur: delay + 0.02 });
          addFx({ k: 'burst', x: tp.x, y: tp.y - tp.h * 0.5, r: 30, col: c2, dur: 0.3, delay: delay });
        } else if (a.fam === 'bolt') {
          addFx({ k: a.an === 'thunder' ? 'bolt' : 'pillar', x: tp.x, y: tp.y - tp.h * 0.3, col: c2, w: 46, dur: 0.38 });
          if (first) shake(4, 0.25);
        } else if (a.fam === 'area') {
          if (first) { addFx({ k: 'wave', x0: tp.side === 'e' ? R.area.x + R.area.w * 0.62 : R.area.x + R.area.w * 0.1, x1: tp.side === 'e' ? R.area.x + R.area.w * 0.02 : R.area.x + R.area.w * 0.98, y: tp.y - tp.h * 0.4, h: R.area.h * 0.9, col: c2, g: PROJ[a.an] || 'orb', dur: 0.5 }); shake(4, 0.3); delay = 0.12; }
          addFx({ k: 'burst', x: tp.x, y: tp.y - tp.h * 0.5, r: 26, col: c2, dur: 0.28, delay: delay });
        } else {
          if (SLASHY[a.an]) addFx({ k: 'slash', x: tp.x, y: tp.y - tp.h * 0.5, r: tp.h * 0.45, col: c2, rot: -0.7 + a.n * 0.9, dur: 0.26 });
          else addFx({ k: 'burst', x: tp.x, y: tp.y - tp.h * 0.5, r: 28, col: c2, rot: a.n, dur: 0.26 });
        }
        setTimeout0(function () { hurt(e.tg, e.crit || e.weak); }, delay);
        if (D[e.tg] && D[e.tg].side === 'p') setPose(e.tg, 'surprised', 0.5);
        var style = e.crit ? 'crit' : e.weak ? 'weak' : e.res ? 'res' : 'dmg';
        pop(e.tg, e.dmg, style, { delay: delay });
        if (e.weak) pop(e.tg, '弱点！', 'tag', { delay: delay, at: 0.9 });
        if (e.crit) pop(e.tg, '会心！', 'tag', { delay: delay, at: 0.9, dx: 16 });
        if (e.res) pop(e.tg, 'いまひとつ', 'res', { delay: delay, at: 0.9 });
        if (e.shield != null) vis(e.tg).pulse = 0.4;
        if (e.crit || e.weak) shake(e.crit ? 5 : 3, 0.2);
        var multi = a.n > 1;
        return delay + (a.fam === 'area' ? (first ? 0.36 : 0.12) : multi ? 0.2 : 0.3);
      }
      case 'reveal': pop(e.tg, '弱点「' + TYPES()[e.ty].name + '」', 'tag', { at: 1.05 }); vis(e.tg).pulse = 0.3; return 0.3;
      case 'break': {
        var bp = pos(e.tg); if (!bp) return 0.3;
        addFx({ k: 'shards', x: bp.x - bp.h * 0.5, y: bp.y + 6, dur: 0.7 });
        addFx({ k: 'stamp', x: bp.x, y: bp.y - bp.h * 0.6, text: '崩し！', size: 34, dur: 0.9 });
        flash('#fff0d0', 0.2); shake(7, 0.35);
        return 0.75;
      }
      case 'recover': pop(e.tg, '構えなおした', 'info'); return 0.45;
      case 'cancel': pop(e.tg, 'ためが止まった！', 'big'); return 0.55;
      case 'charge': { var cp = pos(e.u); if (cp) addFx({ k: 'ring', x: cp.x, y: cp.y, r: cp.h * 0.6, col: '255,80,60', dur: 0.6 }); pop(e.u, '力をためている…', 'big', { at: 1.05 }); return 0.7; }
      case 'heal': pop(e.tg, '+' + e.n, 'heal'); { var hp2 = pos(e.tg); if (hp2 && !e.regen) addFx({ k: 'sparkle', x: hp2.x, y: hp2.y - hp2.h * 0.4, r: hp2.h * 0.35, col: '150,255,190', n: 8, seed: e.tg, rise: 30, dur: 0.6 }); } return e.regen ? 0.25 : 0.3;
      case 'sp': pop(e.tg, '術力+' + e.n, 'sp'); return 0.28;
      case 'st': {
        var nm = STXT[e.st] || (STATUS()[e.st] ? STATUS()[e.st].name : e.st), bad = STATUS()[e.st] && STATUS()[e.st].bad;
        if (e.on) { pop(e.tg, nm, bad ? 'bad' : 'good', { at: 0.95 }); return 0.26; }
        if (bad) { pop(e.tg, nm + 'が治った', 'good', { at: 0.95 }); return 0.2; }
        if (e.msg) { pop(e.tg, e.msg, 'info'); return 0.4; }
        return 0;
      }
      case 'buff': if (e.d == null) return 0; pop(e.tg, root.NYT_BASE.BUFF_NAME[e.k] + (e.d > 0 ? '↑' : '↓'), e.d > 0 ? 'good' : 'bad', { at: 0.95 }); return 0.22;
      case 'bp': if (e.gain) { pop(e.tg, '印+' + e.gain, 'big', { at: 0.95 }); return 0.2; } return 0;
      case 'kz': return 0;
      case 'ko': { var kp = pos(e.tg); if (kp && D[e.tg] && D[e.tg].side === 'e') addFx({ k: 'smoke', x: kp.x, y: kp.y - kp.h * 0.3, dur: 0.6 }); return 0.4; }
      case 'revive': { var rp = pos(e.tg); vis(e.tg).koT = 0; if (rp) { addFx({ k: 'pillar', x: rp.x, y: rp.y, col: '255,240,170', w: 50, dur: 0.6 }); addFx({ k: 'sparkle', x: rp.x, y: rp.y - rp.h * 0.4, r: 30, col: '255,240,170', n: 10, seed: 3, dur: 0.6 }); } pop(e.tg, '起きあがった！', 'good'); return 0.5; }
      case 'summon': (e.units || []).forEach(function (u) { vis(u).appear = 0; var sp = pos(u); if (sp) addFx({ k: 'smoke', x: sp.x, y: sp.y - 20, dur: 0.6 }); }); return 0.55;
      case 'swap': case 'standby': return 0.45;
      case 'flee': return 0.4;
      case 'transform': flash('#ffffff', 0.6); shake(9, 0.6); vis(e.tg).appear = 0.2; return 1.1;
      case 'cover': pop(e.by, 'かばう！', 'good', { at: 0.95 }); lunge(e.by, e.for, 2); return 0.3;
      case 'resist': pop(e.tg, '効かない', 'miss'); return 0.3;
      case 'learn': return 0;
      case 'msg': return 0;
      case 'end': return 0;
    }
    return 0;
  }
  // 少し遅れて（描画の時間で）
  var pending = [];
  function setTimeout0(fn, d) { if (!d) { fn(); return; } pending.push({ fn: fn, t: d }); }
  function tick(dt) { pending = pending.filter(function (p) { p.t -= dt; if (p.t <= 0) { p.fn(); return false; } return true; }); }

  // 見せ方だけ（術の名前なしで）：回復の光をまとめて・勝ったときの紙ふぶき
  function healBurst(uids) { uids.forEach(function (u) { var p = pos(u); if (p) addFx({ k: 'sparkle', x: p.x, y: p.y - p.h * 0.4, r: p.h * 0.35, col: '150,255,190', n: 10, seed: +u, rise: 40, dur: 0.8 }); }); }
  function petals(x, y, col) { addFx({ k: 'petals', x: x, y: y, col: col || '255,190,220', r: 160, dur: 2.2 }); }

  // 画面の点 → だれ
  function hitTest(x, y, side) {
    var best = null, bd = 1e9;
    for (var uid in R.rects) {
      var r = R.rects[uid]; if (!r) continue;
      var p = R.pos[uid]; if (!p || (side && p.side !== side)) continue;
      if (x >= r.x0 - 10 && x <= r.x1 + 10 && y >= r.y0 - 10 && y <= r.y1 + 20) { var d = Math.abs(x - p.x) + Math.abs(y - p.cy) * 0.5; if (d < bd) { bd = d; best = +uid; } }
    }
    return best;
  }
  function reset() { R.vis = {}; R.fx = []; R.pops = []; R.pos = {}; R.rects = {}; pending = []; R.shakeT = 0; R.flashT = 0; }

  var api = { init: init, resize: resize, frame: frame, onEvent: onEvent, tick: tick, hitTest: hitTest, reset: reset, pos: pos, vis: vis, pop: pop, addFx: addFx, shake: shake, flash: flash, lunge: lunge, setPose: setPose, healBurst: healBurst, petals: petals, family: family, R: R };
  root.NYT_RBATTLE = api;
})(typeof window !== 'undefined' ? window : globalThis);
