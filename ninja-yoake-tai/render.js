/* ニンジャ夜明け隊 — 画面の描画（キャンバス）
 * 地面はあらかじめ1枚の絵にしておき、毎フレームは人物・妖怪・術・予告・光だけを描く。
 * 忍者の絵は ninja-sato-life/art.js（SVG）を画像にしてためておく（向き8方向 × 歩き4コマ）。
 * 妖怪はこわくない見た目（まるい・目が大きい）。しずめると光になって消える。
 */
(function (root) {
  'use strict';
  var D = root.NYT_DATA, A = root.NinjaArt, CH = root.NSL_CHARS;
  var MAP = D.MAP;
  var OUT = '#2b1d16';
  var FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","Noto Sans JP",sans-serif';

  var R = {
    cv: null, ctx: null, dpr: 1, vw: 0, vh: 0, zoom: 1, cam: { x: MAP.start.x, y: MAP.start.y }, ground: null, groundKey: '', gs: 1,
    fx: [], t: 0, shake: 0, opts: { shake: true }, spr: {}, sprLast: {}, pending: 0, flash: 0, bFlash: 0
  };

  /* ---------- 初期化・大きさ ---------- */
  function init(cv) {
    R.cv = cv; R.ctx = cv.getContext('2d');
    resize();
  }
  function resize() {
    if (!R.cv) return;
    R.dpr = Math.min(2, root.devicePixelRatio || 1);
    R.vw = R.cv.clientWidth || root.innerWidth; R.vh = R.cv.clientHeight || root.innerHeight;
    R.cv.width = Math.round(R.vw * R.dpr); R.cv.height = Math.round(R.vh * R.dpr);
    // 見える範囲がだいたい 860×600 になる倍率（スマホ縦でも小さくなりすぎない）
    var port = R.vw < R.vh;
    R.zoom = Math.max(0.5, Math.min(1.45, Math.min(R.vw / (port ? 620 : 860), R.vh / (port ? 900 : 600))));
  }
  function w2s(x, y) { return { x: (x - R.cam.x) * R.zoom + R.vw / 2, y: (y - R.cam.y) * R.zoom + R.vh / 2 }; }
  function s2w(x, y) { return { x: (x - R.vw / 2) / R.zoom + R.cam.x, y: (y - R.vh / 2) / R.zoom + R.cam.y }; }

  /* ---------- 小道具 ---------- */
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function circle(c, x, y, r, fill, stroke, lw) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); } }
  function ell(c, x, y, rx, ry, fill, stroke, lw) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); } }
  function poly(c, pts, fill, stroke, lw, close) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); if (close !== false) c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); } }
  function text(c, s, x, y, size, fill, o) {
    o = o || {};
    c.font = (o.w || 800) + ' ' + size + 'px ' + FONT; c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
    if (o.stroke) { c.lineJoin = 'round'; c.strokeStyle = o.stroke; c.lineWidth = o.sw || Math.max(2, size / 5); c.strokeText(s, x, y); }
    c.fillStyle = fill; c.fillText(s, x, y);
  }
  function mix(a, b, t) {
    var A1 = hex(a), B1 = hex(b);
    return 'rgb(' + Math.round(A1[0] + (B1[0] - A1[0]) * t) + ',' + Math.round(A1[1] + (B1[1] - A1[1]) * t) + ',' + Math.round(A1[2] + (B1[2] - A1[2]) * t) + ')';
  }
  function hex(h) { h = h.replace('#', ''); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(h, a) { var c = hex(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* ---------- 地面（1枚の絵にしておく）---------- */
  function buildGround(tpl) {
    var key = (tpl && tpl.branch ? 'b' : '') + (tpl && tpl.pillars ? 'p' : '') + (tpl && tpl.villagers ? 'v' : '');
    if (R.ground && R.groundKey === key) return;
    R.groundKey = key;
    var gs = R.gs = 1.25;
    var cv = mk(MAP.w * gs, MAP.h * gs), c = cv.getContext('2d');
    c.scale(gs, gs);
    var r = rnd(20260928);
    // 草地
    var g = c.createLinearGradient(0, 0, 0, MAP.h);
    g.addColorStop(0, '#5d8540'); g.addColorStop(0.5, '#6b9448'); g.addColorStop(1, '#739a4c');
    c.fillStyle = g; c.fillRect(0, 0, MAP.w, MAP.h);
    for (var i = 0; i < 900; i++) {
      var x = r() * MAP.w, y = r() * MAP.h, s = 6 + r() * 16;
      c.fillStyle = r() < 0.5 ? 'rgba(40,70,30,.12)' : 'rgba(170,200,110,.10)';
      c.beginPath(); c.ellipse(x, y, s, s * 0.6, 0, 0, Math.PI * 2); c.fill();
    }
    // 草の房
    c.strokeStyle = 'rgba(40,80,30,.35)'; c.lineWidth = 1.6;
    for (i = 0; i < 420; i++) { var gx = r() * MAP.w, gy = r() * MAP.h; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - 3, gy - 7); c.moveTo(gx + 2, gy); c.lineTo(gx + 3, gy - 8); c.moveTo(gx + 4, gy); c.lineTo(gx + 8, gy - 6); c.stroke(); }
    // 里の広場（結界のまわり）と村への道
    c.fillStyle = '#b89c6c'; c.beginPath(); c.ellipse(800, 640, 190, 150, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c7ab7a'; c.beginPath(); c.ellipse(800, 640, 160, 124, 0, 0, Math.PI * 2); c.fill();
    road(c, [[800, 700], [800, 820], [790, 960], [800, 1100]], 54);
    road(c, [[800, 850], [600, 930], [430, 950]], 34); road(c, [[800, 850], [1000, 930], [1170, 950]], 34);
    // 妖怪の来る道
    var lanes = tpl && tpl.branch ? [MAP.lanes.west, MAP.lanes.east, MAP.branches.west, MAP.branches.east] : [MAP.lanes.west, MAP.lanes.east];
    lanes.forEach(function (L) { road(c, L, 64, true); });
    if (tpl && tpl.villagers) { road(c, MAP.homes.west, 30); road(c, MAP.homes.east, 30); }
    // 北の森（道はあける）
    for (i = 0; i < 110; i++) {
      var tx = r() * MAP.w, ty = r() * 190 - 40 + (Math.abs(tx - 800) < 200 ? r() * 90 : 0);
      if (tx < 30 || tx > MAP.w - 30) ty = r() * MAP.h * 0.75;
      if (nearLane(tx, ty, 70, lanes) || Math.hypot(tx - 800, ty - 600) < 260) continue;
      tree(c, tx, ty, 22 + r() * 18, r);
    }
    for (i = 0; i < 70; i++) {
      var sx = r() < 0.5 ? r() * 150 : MAP.w - r() * 150, sy = 300 + r() * 900;
      if (nearLane(sx, sy, 70, lanes) || Math.hypot(sx - 250, sy - 800) < 140 || Math.hypot(sx - 1350, sy - 800) < 150 || (tpl && tpl.villagers && sy > 590 && sy < 720)) continue;
      tree(c, sx, sy, 20 + r() * 16, r);
    }
    // 竹林（西の採集場所）
    for (i = 0; i < 70; i++) {
      var a = r() * Math.PI * 2, d = 70 + r() * 70, bx = 250 + Math.cos(a) * d, by = 800 + Math.sin(a) * d * 0.8;
      c.fillStyle = r() < 0.5 ? '#6f9a3a' : '#86b04a'; c.fillRect(bx - 3, by - 26, 6, 30);
      c.fillStyle = 'rgba(40,70,20,.5)'; c.fillRect(bx - 3, by - 14, 6, 2);
      c.fillStyle = '#9cc85a'; c.beginPath(); c.ellipse(bx + 5, by - 26, 8, 3, -0.5, 0, Math.PI * 2); c.fill();
    }
    // 薬草畑（東）
    for (var row = 0; row < 5; row++) {
      c.fillStyle = '#8a6a44'; c.fillRect(1250, 730 + row * 32, 200, 18);
      for (var k = 0; k < 10; k++) { c.fillStyle = k % 2 ? '#5fa34a' : '#78b95a'; c.beginPath(); c.ellipse(1262 + k * 20, 736 + row * 32, 7, 6, 0, 0, Math.PI * 2); c.fill(); }
    }
    // 霊石の泉（南）
    c.fillStyle = '#7a8a9a'; c.beginPath(); c.ellipse(800, 1110, 120, 58, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6fb6d8'; c.beginPath(); c.ellipse(800, 1110, 104, 46, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(770, 1098, 40, 10, 0, 0, Math.PI * 2); c.fill();
    [[700, 1070], [900, 1068], [860, 1150], [735, 1150]].forEach(function (p, j) { poly(c, [[p[0], p[1] - 16], [p[0] + 9, p[1]], [p[0], p[1] + 8], [p[0] - 9, p[1]]], j % 2 ? '#bde6ff' : '#d8c8ff', OUT, 1.5); });
    // 家（屋根を上から）
    MAP.houses.forEach(function (h, j) { house(c, h[0], h[1], j); });
    // 補給所（屋台）
    c.fillStyle = '#8a5a36'; c.fillRect(760, 770, 80, 34);
    poly(c, [[748, 772], [852, 772], [840, 752], [760, 752]], '#c8302c', OUT, 2);
    c.fillStyle = '#f7f0e3'; c.fillRect(772, 780, 56, 16); text(c, '補給所', 800, 788, 12, '#5a2a1a', { w: 900 });
    // 村の灯籠（光は毎フレーム）
    LANTERNS.forEach(function (p) { lantern(c, p[0], p[1]); });
    R.ground = cv;
  }
  var LANTERNS = [[650, 690], [950, 690], [700, 860], [900, 860], [560, 980], [1040, 980], [800, 960]];
  function road(c, pts, w, lane) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    [[w + 10, lane ? '#8a6a44' : '#9a7c52'], [w, lane ? '#a8845a' : '#b89c6c'], [w - 18, lane ? '#b89468' : '#c7ab7a']].forEach(function (s) {
      c.strokeStyle = s[1]; c.lineWidth = s[0]; c.beginPath();
      pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke();
    });
  }
  function nearLane(x, y, d, lanes) {
    for (var i = 0; i < lanes.length; i++) { var L = lanes[i]; for (var j = 1; j < L.length; j++) if (segD(L[j - 1][0], L[j - 1][1], L[j][0], L[j][1], x, y) < d) return true; }
    return false;
  }
  function segD(ax, ay, bx, by, px, py) { var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0; return Math.hypot(ax + dx * t - px, ay + dy * t - py); }
  function tree(c, x, y, s, r) {
    c.fillStyle = 'rgba(20,40,20,.25)'; c.beginPath(); c.ellipse(x + 6, y + s * 0.5, s * 0.9, s * 0.4, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5a3a24'; c.fillRect(x - 3, y, 6, s * 0.5);
    var cols = ['#2f5a2a', '#3b6a30', '#4a7a36'];
    for (var i = 0; i < 3; i++) { c.fillStyle = cols[i]; c.beginPath(); c.arc(x + (r() - 0.5) * s * 0.5, y - s * 0.3 - i * s * 0.18, s * (0.7 - i * 0.14), 0, Math.PI * 2); c.fill(); }
  }
  function house(c, x, y, j) {
    var roof = ['#6a4a3a', '#5a5a64', '#7a5a3a', '#4a4a56'][j % 4];
    c.fillStyle = 'rgba(20,30,20,.25)'; c.fillRect(x - 46, y - 16, 100, 60);
    c.fillStyle = '#e8dcc4'; c.fillRect(x - 44, y - 6, 88, 40); c.strokeStyle = OUT; c.lineWidth = 2; c.strokeRect(x - 44, y - 6, 88, 40);
    c.fillStyle = '#6a4a2a'; c.fillRect(x - 10, y + 12, 20, 22);
    poly(c, [[x - 56, y - 2], [x + 56, y - 2], [x + 40, y - 38], [x - 40, y - 38]], roof, OUT, 2);
    c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1.5; for (var k = -30; k <= 30; k += 12) { c.beginPath(); c.moveTo(x + k, y - 36); c.lineTo(x + k * 1.3, y - 4); c.stroke(); }
  }
  function lantern(c, x, y) {
    c.fillStyle = '#4a3a2a'; c.fillRect(x - 2, y - 4, 4, 18);
    ell(c, x, y - 12, 8, 10, '#f3c86a', OUT, 1.6);
    c.fillStyle = '#c8302c'; c.fillRect(x - 8, y - 22, 16, 3); c.fillRect(x - 8, y - 3, 16, 3);
  }

  /* ---------- 忍者の画像（SVG → 画像 → キャンバス）---------- */
  var SPR_W = 60, SPR_H = 72; // 世界での大きさ
  function yawOf(fx, fy) { var a = Math.atan2(fx, fy) * 180 / Math.PI; return Math.round(a / 45) * 45; }
  function sprite(key, defFn, yaw, pose, frame, px) {
    if (!A || typeof document === 'undefined') return null;
    var k = key + '|' + yaw + '|' + pose + '|' + (frame || 0) + '|' + px;
    var e = R.spr[k];
    if (e) return e.cv ? e : (R.sprLast[key] || null);
    e = R.spr[k] = { cv: null };
    var def = defFn();
    var svg = A.render(def, { yaw: yaw, pose: pose, frame: frame, w: Math.round(px * SPR_W / SPR_H), h: px, shadow: false, companions: false, prop: pose === 'stand' || pose === 'walk' ? undefined : false });
    var img = new Image();
    R.pending++;
    img.onload = function () { var cv = mk(img.width, img.height); cv.getContext('2d').drawImage(img, 0, 0); e.cv = cv; R.sprLast[key] = e; R.pending--; };
    img.onerror = function () { R.pending--; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return R.sprLast[key] || null;
  }
  // 先に作っておく（読みこみ中に）
  function warm(key, defFn, px) {
    [0, 45, 90, 135, 180, -45, -90, -135].forEach(function (y) {
      sprite(key, defFn, y, 'stand', 0, px);
      for (var f = 0; f < 4; f++) sprite(key, defFn, y, 'walk', f, px);
    });
    sprite(key, defFn, 0, 'seal', 0, px); sprite(key, defFn, 0, 'surprised', 0, px);
  }
  var defCache = {};
  function memberDef(m) {
    var k = m.id + JSON.stringify(m.look || {});
    if (!defCache[k]) defCache[k] = m.cn && CH && CH.BY_ID[m.cn] ? CH.BY_ID[m.cn].art : D.apprenticeDef(m.look, CH);
    return defCache[k];
  }
  function pxFor() { return Math.max(40, Math.round(SPR_H * R.zoom * R.dpr / 8) * 8); }

  /* ---------- 1フレーム ---------- */
  // view: { me, aim, reticle, route:{...}, night, nearSpot, mentorShow }
  function frame(M, dt, view) {
    var c = R.ctx; if (!c) return;
    R.t += dt;
    view = view || {};
    var me = view.me;
    // カメラ（自分を追う。試合がないときは里をゆっくり見わたす）
    if (!M && !me) { R.cam.x = 800 + Math.sin(R.t * 0.08) * 140; R.cam.y = 640 + Math.sin(R.t * 0.05) * 50; }
    if (me) {
      var tx = me.x, ty = me.y - 20;
      R.cam.x += (tx - R.cam.x) * Math.min(1, dt * 6); R.cam.y += (ty - R.cam.y) * Math.min(1, dt * 6);
    }
    var hw = R.vw / 2 / R.zoom, hh = R.vh / 2 / R.zoom;
    R.cam.x = Math.max(Math.min(hw, MAP.w / 2), Math.min(MAP.w - Math.min(hw, MAP.w / 2), R.cam.x));
    R.cam.y = Math.max(Math.min(hh, MAP.h / 2) - 40, Math.min(MAP.h - Math.min(hh, MAP.h / 2) + 20, R.cam.y));
    var sh = R.shake > 0 && R.opts.shake ? (Math.random() - 0.5) * R.shake * 10 : 0;
    if (R.shake > 0) R.shake -= dt;
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    c.fillStyle = '#20301c'; c.fillRect(0, 0, R.vw, R.vh);
    c.save();
    c.translate(R.vw / 2 + sh, R.vh / 2 + sh * 0.6); c.scale(R.zoom, R.zoom); c.translate(-R.cam.x, -R.cam.y);
    if (R.ground) c.drawImage(R.ground, 0, 0, MAP.w, MAP.h);
    R.M = M;
    if (M) drawWorld(c, M, dt, view);
    else { ['west', 'east'].forEach(function (l) { var p = MAP.lanes[l][0]; portal(c, p[0], p[1]); }); drawBarrier(c, { x: MAP.barrier.x, y: MAP.barrier.y, hp: 1, max: 1 }); }
    drawFx(c, dt);
    c.restore();
    // 夜 → 夜明け
    night(c, M, view);
    if (M) drawLights(c, M);
    else sceneryLights(c);
    if (M && me) edgeMarkers(c, M, me);
    if (R.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + Math.min(0.5, R.flash) + ')'; c.fillRect(0, 0, R.vw, R.vh); R.flash -= dt * 2; }
  }

  function nightLevel(M) {
    if (!M || !M.phase) return 0.45;
    var ord = { prep1: 0.5, wave1: 0.58, prep2: 0.6, wave2: 0.66, prep3: 0.62, boss: 0.62 };
    var n = ord[M.phase.id] != null ? ord[M.phase.id] : 0.5;
    if (M.phase.id === 'boss') n = 0.62 * (1 - 0.75 * (1 - Math.max(0, M.phaseT) / M.phaseLen));
    if (M.state === 'Result') n = M.result && M.result.outcome === 'win' ? 0.02 : 0.55;
    if (M.tutorial) n = 0.4;
    return n;
  }
  function night(c, M, view) {
    var n = view.night != null ? view.night : nightLevel(M);
    if (n <= 0.01) return;
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = mix('#ffffff', '#303a78', n); c.fillRect(0, 0, R.vw, R.vh);
    c.restore();
    // 夜明けの光（東の空）
    if (M && M.phase && M.phase.id === 'boss' || (M && M.state === 'Result' && M.result && M.result.outcome === 'win')) {
      var p = M.state === 'Result' ? 1 : 1 - Math.max(0, M.phaseT) / M.phaseLen;
      var g = c.createLinearGradient(R.vw, 0, R.vw * 0.2, R.vh * 0.8);
      g.addColorStop(0, 'rgba(255,190,120,' + (0.35 * p) + ')'); g.addColorStop(1, 'rgba(255,190,120,0)');
      c.fillStyle = g; c.fillRect(0, 0, R.vw, R.vh);
    }
  }
  function glow(c, x, y, r, col, a) {
    var s = w2s(x, y), rr = r * R.zoom;
    if (s.x < -rr || s.y < -rr || s.x > R.vw + rr || s.y > R.vh + rr) return;
    var g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(s.x - rr, s.y - rr, rr * 2, rr * 2);
  }
  function sceneryLights(c) {
    c.save(); c.globalCompositeOperation = 'lighter';
    LANTERNS.forEach(function (p) { glow(c, p[0], p[1] - 12, 70, '#ffb45a', 0.25); });
    glow(c, MAP.barrier.x, MAP.barrier.y - 20, 170, '#8fd0ff', 0.4);
    c.restore();
  }
  function drawLights(c, M) {
    c.save(); c.globalCompositeOperation = 'lighter';
    var fl = 0.8 + Math.sin(R.t * 7) * 0.05;
    LANTERNS.forEach(function (p) { glow(c, p[0], p[1] - 12, 70, '#ffb45a', 0.25 * fl); });
    var hp = M.barrier.hp / M.barrier.max;
    glow(c, M.barrier.x, M.barrier.y - 20, 160, '#8fd0ff', 0.18 + 0.2 * hp + R.bFlash * 0.4);
    M.members.forEach(function (m) { glow(c, m.x, m.y - 30, 70, m.kind === 'human' ? '#ffe7a0' : '#cfe0ff', 0.12); });
    M.zones.forEach(function (z) {
      if (z.kind === 'boom') glow(c, z.x, z.y, z.r * 1.6, '#ff9a3a', 0.5 * Math.max(0, z.t / 0.4));
      if (z.kind === 'fireline') glow(c, (z.x + z.x2) / 2, (z.y + z.y2) / 2, 140, '#ff8a3a', 0.25);
      if (z.kind === 'dome') glow(c, z.x, z.y, z.r * 1.3, '#7ab8ff', 0.18);
      if (z.kind === 'tele' && z.src !== 'boss') glow(c, z.x, z.y, z.r * 1.4, '#ff4a3a', 0.12);
      if (z.kind === 'ttrap') glow(c, z.x, z.y, z.r, '#ffe066', 0.15);
    });
    [[MAP.lanes.west[0], '#b07aff'], [MAP.lanes.east[0], '#b07aff']].forEach(function (g) { glow(c, g[0][0], g[0][1], 110, g[1], 0.25 + Math.sin(R.t * 3) * 0.05); });
    M.enemies.forEach(function (e) { if (e.type === 'koro') glow(c, e.x, e.y - 14, 34, '#b8a8ff', 0.18); if (e.boss && e.tele) glow(c, e.x, e.y - 40, 120, '#ff5a3a', 0.25); });
    c.restore();
    if (R.bFlash > 0) R.bFlash -= 0.05;
  }

  /* ---------- 世界 ---------- */
  function drawWorld(c, M, dt, view) {
    var t = R.t;
    // 妖怪の穴（道の入口）
    ['west', 'east'].forEach(function (l) { var p = MAP.lanes[l][0]; portal(c, p[0], p[1]); });
    // 道の予告（準備中：次に来る妖怪の道を矢印で）
    if (view.route) routeArrows(c, M, view.route);
    // 採集場所
    M.gather.forEach(function (g) {
      var near = view.me && Math.hypot(view.me.x - g.x, view.me.y - g.y) < D.BAL.gatherRadius;
      c.setLineDash([10, 8]); circle(c, g.x, g.y, D.BAL.gatherRadius, g.stock > 0 ? 'rgba(255,245,200,.16)' : 'rgba(0,0,0,.08)', g.stock > 0 ? 'rgba(255,240,180,.8)' : 'rgba(80,60,40,.5)', near ? 3.5 : 2); c.setLineDash([]);
      for (var i = 0; i < D.BAL.gatherStock; i++) { var a = -Math.PI / 2 + (i - (D.BAL.gatherStock - 1) / 2) * 0.22; circle(c, g.x + Math.cos(a) * (D.BAL.gatherRadius + 10), g.y + Math.sin(a) * (D.BAL.gatherRadius + 10), 4, i < g.stock ? '#ffe28a' : 'rgba(60,40,20,.35)', OUT, 1); }
      text(c, g.name, g.x, g.y + D.BAL.gatherRadius + 16, 13, '#fff8e8', { stroke: 'rgba(40,30,20,.85)', sw: 4 });
    });
    // 罠の置き場と罠
    M.spots.forEach(function (s) {
      var tr = M.traps[s.id];
      var near = view.nearSpot && view.nearSpot.id === s.id;
      if (!tr) {
        c.setLineDash([6, 6]); circle(c, s.x, s.y, 26, near ? 'rgba(255,230,120,.35)' : 'rgba(255,255,255,.12)', near ? '#ffe070' : 'rgba(255,255,255,.7)', near ? 3 : 2); c.setLineDash([]);
        if (M.state === 'Preparation' || M.state === 'Intermission') text(c, '罠', s.x, s.y, 14, 'rgba(255,255,255,.85)', { stroke: 'rgba(40,30,20,.7)', sw: 3 });
      } else drawTrap(c, tr, near);
    });
    // 補給所の輪
    var nearSup = view.me && Math.hypot(view.me.x - MAP.supply.x, view.me.y - MAP.supply.y) < D.BAL.supplyRange;
    c.setLineDash([8, 8]); circle(c, MAP.supply.x, MAP.supply.y + 10, D.BAL.supplyRange, nearSup ? 'rgba(255,220,150,.18)' : null, nearSup ? '#ffd27a' : 'rgba(255,220,150,.45)', 2); c.setLineDash([]);
    // 地面の術・予告
    M.zones.forEach(function (z) { groundZone(c, M, z); });
    // 並べて描く（奥から）
    var list = [];
    M.members.forEach(function (m) { list.push({ y: m.y, f: drawMember, o: m }); });
    M.enemies.forEach(function (e) { list.push({ y: e.y, f: drawEnemy, o: e }); });
    M.villagers.forEach(function (v) { if (v.state === 'walk' || v.state === 'down') list.push({ y: v.y, f: drawVillager, o: v }); });
    M.pillars.forEach(function (p) { list.push({ y: p.y, f: drawPillar, o: p }); });
    M.zones.forEach(function (z) { if (z.kind === 'wall' || z.kind === 'decoy') list.push({ y: z.cy || z.y, f: drawObstacle, o: z }); });
    list.push({ y: M.barrier.y, f: drawBarrier, o: M.barrier });
    if (view.mentorShow) list.push({ y: view.mentorShow.y, f: drawMentor, o: view.mentorShow });
    list.sort(function (a, b) { return a.y - b.y; });
    list.forEach(function (it) { it.f(c, it.o, M, view); });
    // 上にかぶせる術（結界のドーム・檻・霧）
    M.zones.forEach(function (z) { overZone(c, M, z); });
    // 連携アイコン・ピン・合図
    M.enemies.forEach(function (e) { if (comboable(e)) comboIcon(c, e.x, e.y - e.r * 2.2 - 8); });
    M.members.forEach(function (m) {
      if (m.down && m.pin) { var a = 0.6 + Math.sin(t * 6) * 0.3; c.strokeStyle = 'rgba(120,230,160,' + a + ')'; c.lineWidth = 3; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(m.pin.x, m.pin.y); c.stroke(); c.setLineDash([]); pinMark(c, m.pin.x, m.pin.y, '#6be08e', '安全'); }
    });
    M.pings.forEach(function (p) { if (p.silent) return; var col = p.kind === 'gather' ? '#7ac8ff' : p.kind === 'defend' ? '#ffd27a' : '#ff7a7a'; pinMark(c, p.x, p.y - 40, col, p.kind === 'gather' ? '集合' : p.kind === 'defend' ? '守る' : '助けて'); });
    // ねらい
    if (view.reticle) { var rt = view.reticle; c.strokeStyle = rt.ok ? 'rgba(255,255,255,.9)' : 'rgba(255,120,120,.9)'; c.lineWidth = 2; c.setLineDash([5, 5]); circle(c, rt.x, rt.y, rt.r || 20, 'rgba(255,255,255,.08)', null); c.beginPath(); c.arc(rt.x, rt.y, rt.r || 20, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); }
  }
  function comboable(e) { return e.bound > 0 || e.stun > 0 || (e.slow > 0 && e.slowMul <= 0.5) || e.lure > 0 || e.bossBind > 0; }
  function comboIcon(c, x, y) {
    var s = 1 + Math.sin(R.t * 8) * 0.08;
    circle(c, x, y, 11 * s, '#ffd24a', OUT, 2);
    text(c, '連', x, y + 0.5, 13 * s, '#7a2a10', { w: 900 });
  }
  function pinMark(c, x, y, col, label) {
    var b = Math.sin(R.t * 5) * 3;
    poly(c, [[x, y + 14 + b], [x - 10, y - 2 + b], [x + 10, y - 2 + b]], col, OUT, 2);
    circle(c, x, y - 6 + b, 11, col, OUT, 2);
    text(c, label, x, y - 28 + b, 13, '#ffffff', { stroke: 'rgba(30,20,20,.85)', sw: 4 });
  }
  function portal(c, x, y) {
    var t = R.t;
    ell(c, x, y + 6, 58, 30, 'rgba(40,10,60,.55)');
    for (var i = 0; i < 3; i++) { c.strokeStyle = 'rgba(190,140,255,' + (0.5 - i * 0.12) + ')'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y + 6, 46 - i * 12, 24 - i * 6, t * (0.8 + i * 0.3), 0, Math.PI * 1.5); c.stroke(); }
    // こわれた鳥居
    c.fillStyle = '#7a3a2a'; c.fillRect(x - 40, y - 60, 8, 64); c.fillRect(x + 32, y - 60, 8, 64);
    c.fillStyle = '#8a4030'; c.fillRect(x - 50, y - 66, 100, 9); c.fillRect(x - 40, y - 48, 80, 6);
  }
  function routeArrows(c, M, route) {
    var t = R.t;
    ['west', 'east'].forEach(function (l) {
      if (!route[l]) return;
      var L = (M.tpl.branch ? MAP.branches : MAP.lanes)[l];
      var segs = [], total = 0;
      for (var i = 1; i < L.length; i++) { var d = Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); segs.push({ a: L[i - 1], b: L[i], d: d, s: total }); total += d; }
      for (var k = 0; k < total; k += 70) {
        var pos = (k + t * 60) % total, sg = segs[0];
        for (var j = 0; j < segs.length; j++) if (pos >= segs[j].s && pos <= segs[j].s + segs[j].d) { sg = segs[j]; break; }
        var u = (pos - sg.s) / sg.d, x = sg.a[0] + (sg.b[0] - sg.a[0]) * u, y = sg.a[1] + (sg.b[1] - sg.a[1]) * u, ang = Math.atan2(sg.b[1] - sg.a[1], sg.b[0] - sg.a[0]);
        c.save(); c.translate(x, y); c.rotate(ang);
        poly(c, [[10, 0], [-6, -9], [-2, 0], [-6, 9]], 'rgba(255,90,70,.75)', 'rgba(80,20,10,.6)', 1.5);
        c.restore();
      }
      // 入口に、来る妖怪
      var g = L[0], icons = route[l];
      var bx = g[0] + (l === 'west' ? 70 : -70), by = g[1] + 64;
      c.fillStyle = 'rgba(30,20,40,.72)'; roundRect(c, bx - 64, by - 18, 128, 36, 10); c.fill();
      var x0 = bx - 52;
      icons.forEach(function (ic) { miniEnemy(c, ic.type, x0 + 10, by); text(c, '×' + ic.n, x0 + 32, by + 1, 14, '#ffffff'); x0 += 44; });
    });
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }

  /* ---------- 罠 ---------- */
  function drawTrap(c, tr, near) {
    var t = R.t, T = D.TRAPS[tr.kind];
    if (near) circle(c, tr.x, tr.y, 28, 'rgba(255,230,120,.25)', '#ffe070', 2);
    if (tr.kind === 'makibishi') {
      for (var i = 0; i < 7; i++) {
        var a = i * 2.4, rr = 6 + (i % 3) * 7, x = tr.x + Math.cos(a) * rr, y = tr.y + Math.sin(a) * rr * 0.7;
        poly(c, [[x, y - 6], [x + 5, y + 3], [x - 5, y + 3]], '#9aa0aa', OUT, 1.2);
      }
      text(c, String(tr.uses), tr.x + 22, tr.y + 16, 11, '#fff', { stroke: 'rgba(0,0,0,.6)', sw: 3 });
    } else {
      var arm = tr.rearm > 0;
      for (var k = -1; k <= 1; k++) { c.save(); c.translate(tr.x + k * 8, tr.y); c.rotate(k * 0.25); c.fillStyle = '#c8302c'; c.fillRect(-4, -14, 8, 20); c.strokeStyle = OUT; c.lineWidth = 1.5; c.strokeRect(-4, -14, 8, 20); c.fillStyle = '#f3d06a'; c.fillRect(-4, -8, 8, 3); c.restore(); }
      c.strokeStyle = '#4a3a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(tr.x, tr.y - 14); c.quadraticCurveTo(tr.x + 6, tr.y - 24, tr.x + 12, tr.y - 22); c.stroke();
      if (!arm) circle(c, tr.x + 12, tr.y - 22, 3 + Math.sin(t * 12), '#ffd24a');
      for (var ci = 0; ci < T.charges; ci++) circle(c, tr.x - 12 + ci * 8, tr.y + 16, 3, ci < tr.charges ? '#ffcf4a' : 'rgba(0,0,0,.3)', OUT, 1);
    }
  }

  /* ---------- 術の場（地面）---------- */
  function groundZone(c, M, z) {
    var t = R.t;
    if (z.kind === 'tele') {
      var p = 1 - Math.max(0, z.t) / z.life;
      var red = 'rgba(255,60,50,';
      if (z.shape === 'circle') {
        circle(c, z.x, z.y, z.r, red + '0.16)', red + '0.9)', 2.5);
        circle(c, z.x, z.y, z.r * p, red + '0.28)');
        if (z.src !== 'boss') { // 札が落ちてくる
          var fy = z.y - 120 * (1 - p);
          c.fillStyle = '#fff6e0'; c.fillRect(z.x - 7, fy - 22, 14, 26); c.strokeStyle = '#c8302c'; c.lineWidth = 2; c.strokeRect(z.x - 7, fy - 22, 14, 26); c.beginPath(); c.moveTo(z.x, fy - 18); c.lineTo(z.x, fy); c.stroke();
        }
      } else if (z.shape === 'ring') {
        c.save();
        c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.arc(z.x, z.y, z.r0, 0, Math.PI * 2, true); c.fillStyle = red + (0.1 + 0.18 * p) + ')'; c.fill('evenodd');
        c.strokeStyle = red + '0.9)'; c.lineWidth = 2.5; c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(z.x, z.y, z.r0, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(z.x, z.y, z.r0 + (z.r - z.r0) * p, 0, Math.PI * 2); c.strokeStyle = red + '0.6)'; c.lineWidth = 4; c.stroke();
        // 安全地帯（すき間）
        z.gaps.forEach(function (g) {
          c.beginPath(); c.moveTo(z.x + Math.cos(g - z.gapW / 2) * z.r0, z.y + Math.sin(g - z.gapW / 2) * z.r0);
          c.arc(z.x, z.y, z.r, g - z.gapW / 2, g + z.gapW / 2); c.arc(z.x, z.y, z.r0, g + z.gapW / 2, g - z.gapW / 2, true); c.closePath();
          c.fillStyle = 'rgba(120,255,170,.32)'; c.fill(); c.strokeStyle = 'rgba(120,255,170,.9)'; c.lineWidth = 2; c.stroke();
          var mx = z.x + Math.cos(g) * (z.r0 + z.r) / 2, my = z.y + Math.sin(g) * (z.r0 + z.r) / 2;
          text(c, '安全', mx, my, 14, '#eafff0', { stroke: 'rgba(20,80,40,.9)', sw: 4 });
        });
        c.restore();
      } else if (z.shape === 'line') {
        c.save(); c.translate(z.x, z.y); c.rotate(Math.atan2(z.y2 - z.y, z.x2 - z.x));
        var L = Math.hypot(z.x2 - z.x, z.y2 - z.y);
        c.fillStyle = red + '0.18)'; c.fillRect(0, -z.w / 2, L, z.w); c.strokeStyle = red + '0.9)'; c.lineWidth = 2.5; c.strokeRect(0, -z.w / 2, L, z.w);
        c.fillStyle = red + '0.3)'; c.fillRect(0, -z.w / 2, L * p, z.w);
        for (var k = 30; k < L; k += 50) poly(c, [[k + 12, 0], [k - 4, -12], [k - 4, 12]], red + '0.7)');
        c.restore();
      } else if (z.shape === 'summon') {
        circle(c, z.x, z.y, z.r * (0.6 + p * 0.4), 'rgba(150,90,255,.18)', 'rgba(190,140,255,.8)', 2);
      }
      return;
    }
    if (z.kind === 'blast') { circle(c, z.x, z.y, z.r, 'rgba(255,140,40,.12)', 'rgba(255,160,60,.85)', 2); circle(c, z.x, z.y, z.r * (1 - z.t / 0.45), null, 'rgba(255,200,90,.9)', 3); if (z.lob) { var pr = 1 - z.t / 0.45, lx = z.lob.x + (z.x - z.lob.x) * pr, ly = z.lob.y + (z.y - z.lob.y) * pr - Math.sin(pr * Math.PI) * 90; circle(c, lx, ly, 8, '#6a4a2a', OUT, 2); } }
    if (z.kind === 'boom') { var q = Math.max(0, z.t / 0.4); circle(c, z.x, z.y, z.r * (1.1 - q * 0.3), 'rgba(255,150,50,' + (0.45 * q) + ')'); for (var i = 0; i < 8; i++) { var a = i * 0.785 + z.x, rr = z.r * (1 - q) * 0.9; circle(c, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.7, 10 * q + 2, 'rgba(255,220,120,' + q + ')'); } }
    if (z.kind === 'fireline') {
      var armd = z.done;
      c.save(); c.translate(z.x, z.y); c.rotate(Math.atan2(z.y2 - z.y, z.x2 - z.x));
      var LL = Math.hypot(z.x2 - z.x, z.y2 - z.y);
      if (!armd) { c.strokeStyle = 'rgba(255,160,60,.8)'; c.lineWidth = 2; c.strokeRect(0, -z.w / 2, LL, z.w); }
      else for (var f = 10; f < LL; f += 22) flame(c, f, Math.sin(f + t * 10) * 6, 12 + Math.sin(f * 3 + t * 20) * 3);
      c.restore();
    }
    if (z.kind === 'ring') { var rp = 1 - z.t / z.life; circle(c, z.x, z.y, z.r * rp, 'rgba(120,255,160,' + (0.25 * (1 - rp)) + ')', 'rgba(140,255,170,' + (1 - rp) + ')', 4); }
    if (z.kind === 'leaves') { var lp = 1 - z.t / z.life; for (var li = 0; li < 10; li++) { var la = li * 0.628 + lp * 3, lr = z.r * lp; leaf(c, z.x + Math.cos(la) * lr, z.y + Math.sin(la) * lr * 0.7, la, z.gold ? '#e0e070' : '#7ed36a'); } }
    if (z.kind === 'ttrap') { var arm = z.arm > 0; c.save(); c.translate(z.x, z.y); c.rotate(R.t); c.strokeStyle = arm ? 'rgba(255,230,100,.4)' : 'rgba(255,230,100,.9)'; c.lineWidth = 2; for (var ti = 0; ti < 6; ti++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(ti * 1.047) * z.r * 0.8, Math.sin(ti * 1.047) * z.r * 0.8); c.stroke(); } c.restore(); circle(c, z.x, z.y, z.r, 'rgba(255,230,100,.08)', 'rgba(255,230,100,.7)', 2); }
    if (z.kind === 'gust') { var gp = 1 - z.t / z.life, ga = Math.atan2(z.dy, z.dx); c.strokeStyle = 'rgba(200,255,230,' + (1 - gp) + ')'; c.lineWidth = 3; for (var gi = -2; gi <= 2; gi++) { var an = ga + gi * 0.28; c.beginPath(); c.arc(z.x + Math.cos(an) * z.len * gp * 0.8, z.y + Math.sin(an) * z.len * gp * 0.8, 14, an - 1.5, an + 1.5); c.stroke(); } }
    if (z.kind === 'vortex') { var vp = z.t / z.life; c.strokeStyle = 'rgba(200,255,230,' + vp + ')'; c.lineWidth = 3; for (var vi = 0; vi < 3; vi++) { c.beginPath(); c.arc(z.x, z.y, z.r * vp * (0.4 + vi * 0.25), R.t * 6 + vi, R.t * 6 + vi + 3.5); c.stroke(); } }
    if (z.kind === 'bolt') { var bp = z.t / z.life; c.strokeStyle = 'rgba(255,240,140,' + bp + ')'; c.lineWidth = 4; c.beginPath(); z.pts.forEach(function (pt, i) { if (!i) { c.moveTo(pt.x, pt.y); return; } var pv = z.pts[i - 1]; for (var s = 1; s <= 4; s++) { var u = s / 4; c.lineTo(pv.x + (pt.x - pv.x) * u + (s < 4 ? (Math.random() - 0.5) * 18 : 0), pv.y + (pt.y - pv.y) * u + (s < 4 ? (Math.random() - 0.5) * 18 : 0)); } }); c.stroke(); c.strokeStyle = 'rgba(255,255,255,' + bp + ')'; c.lineWidth = 1.5; c.stroke(); }
    if (z.kind === 'mist') { for (var mi = 0; mi < 7; mi++) { var ma = mi * 0.9 + R.t * 0.4; circle(c, z.x + Math.cos(ma) * z.r * 0.5, z.y + Math.sin(ma) * z.r * 0.35, z.r * 0.55, 'rgba(210,235,255,.13)'); } circle(c, z.x, z.y, z.r, null, 'rgba(210,235,255,.5)', 2); }
  }
  function overZone(c, M, z) {
    if (z.kind === 'dome') {
      var a = Math.min(1, z.t / 0.6), hp = z.hp / z.max;
      ell(c, z.x, z.y, z.r, z.r * 0.72, 'rgba(120,180,255,' + (0.1 + 0.08 * a) + ')', 'rgba(170,215,255,' + (0.55 + 0.3 * hp) + ')', 3);
      c.strokeStyle = 'rgba(200,230,255,.35)'; c.lineWidth = 1.5;
      for (var i = -2; i <= 2; i++) { c.beginPath(); c.ellipse(z.x, z.y, z.r * (1 - Math.abs(i) * 0.25), z.r * 0.72, 0, Math.PI, Math.PI * 2); c.stroke(); }
      text(c, Math.ceil(z.hp), z.x, z.y - z.r * 0.72 - 10, 12, '#dff0ff', { stroke: 'rgba(20,40,80,.8)', sw: 3 });
    }
    if (z.kind === 'cage') { var cp = z.t / z.life; for (var k = 0; k < 9; k++) { var ang = k * 0.7 + R.t * 2; circle(c, z.x + Math.cos(ang) * z.r * 0.7, z.y + Math.sin(ang) * z.r * 0.45, 10 + (k % 3) * 4, 'rgba(120,200,255,' + (0.35 * cp) + ')', 'rgba(220,245,255,' + (0.8 * cp) + ')', 1.5); } }
  }
  function flame(c, x, y, s) {
    c.fillStyle = 'rgba(255,120,40,.85)'; c.beginPath(); c.moveTo(x - s * 0.6, y); c.quadraticCurveTo(x - s * 0.4, y - s * 1.4, x, y - s * 1.8); c.quadraticCurveTo(x + s * 0.4, y - s * 1.4, x + s * 0.6, y); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,220,120,.9)'; c.beginPath(); c.moveTo(x - s * 0.3, y); c.quadraticCurveTo(x, y - s * 1.1, x + s * 0.3, y); c.closePath(); c.fill();
  }
  function leaf(c, x, y, a, col) { c.save(); c.translate(x, y); c.rotate(a); ell(c, 0, 0, 7, 3.5, col, 'rgba(30,60,20,.8)', 1); c.restore(); }

  /* ---------- 味方 ---------- */
  function drawMember(c, m, M, view) {
    var t = R.t, isMe = view.me && view.me.id === m.id;
    var roleCol = D.ROLES[m.role].color;
    // 足もとの輪（役割の色・自分は金）
    ell(c, m.x, m.y + 2, 20, 8, 'rgba(0,0,0,.22)');
    c.strokeStyle = isMe ? '#ffd24a' : roleCol; c.lineWidth = isMe ? 3 : 2; c.beginPath(); c.ellipse(m.x, m.y + 2, 22, 9, 0, 0, Math.PI * 2); c.stroke();
    if (m.inv > 0 && !m.dash && m.dodgeT <= 0 && Math.floor(t * 16) % 2) return; // 起き上がった直後は点滅
    var px = pxFor();
    var key = m.id + JSON.stringify(m.look || {});
    var defFn = function () { return memberDef(m); };
    var yaw = yawOf(m.face.x, m.face.y);
    var pose = 'stand', fr = 0;
    if (m.cast) pose = 'seal';
    else if (m.moving && !m.down) { pose = 'walk'; fr = Math.floor(m.walkT * 9) % 4; }
    if (m.down) { pose = 'surprised'; yaw = 0; }
    var sp = sprite(key, defFn, yaw, pose, fr, px);
    var w = SPR_W, h = SPR_H;
    // 残像（回避・一閃）
    if ((m.dodgeT > 0 || m.dash) && sp && sp.cv) {
      var tc = (D.lookItem('trail', (m.look || {}).trail) || {}).color || '#ffffff';
      for (var k = 1; k <= 3; k++) { c.globalAlpha = 0.18 * (4 - k); c.drawImage(sp.cv, m.x - w / 2 - m.face.x * k * 14, m.y - h + 4 - m.face.y * k * 14, w, h); }
      c.globalAlpha = 1;
      c.strokeStyle = rgba(tc.length === 7 ? tc : '#ffffff', 0.7); c.lineWidth = 6; c.beginPath(); c.moveTo(m.x - m.face.x * 50, m.y - 30 - m.face.y * 50); c.lineTo(m.x, m.y - 30); c.stroke();
    }
    if (m.down) {
      c.save(); c.translate(m.x, m.y - 10); c.rotate(-Math.PI / 2 * 0.9);
      if (sp && sp.cv) { c.globalAlpha = 0.9; c.drawImage(sp.cv, -w / 2, -h / 2, w, h); c.globalAlpha = 1; }
      c.restore();
      for (var s = 0; s < 3; s++) { var a = t * 4 + s * 2.1; star(c, m.x + Math.cos(a) * 18, m.y - 34 + Math.sin(a) * 6, 5, '#ffe060'); }
      // 救助の進み
      if (m.rescueP > 0) { c.strokeStyle = '#6be08e'; c.lineWidth = 5; c.beginPath(); c.arc(m.x, m.y - 12, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * m.rescueP); c.stroke(); }
      text(c, 'ダウン', m.x, m.y - 56, 13, '#fff', { stroke: 'rgba(160,30,30,.9)', sw: 4 });
      var M2 = M; if (M2 && root.NYT_SIM) { var dome = null; M2.zones.forEach(function (z) { if (z.kind === 'dome' && Math.hypot(z.x - m.x, z.y - m.y) <= z.r) dome = z; }); if (dome) comboIcon(c, m.x + 26, m.y - 50); }
    } else if (sp && sp.cv) {
      var bob = pose === 'stand' ? Math.sin(t * 3 + m.x) * 1.2 : 0;
      if (m.hurtFx > 0) c.globalAlpha = 0.6 + Math.sin(t * 60) * 0.3;
      c.drawImage(sp.cv, m.x - w / 2, m.y - h + 4 + bob, w, h);
      c.globalAlpha = 1;
    } else circle(c, m.x, m.y - 30, 16, roleCol, OUT, 2);
    // 攻撃の弧
    if (m.atkFx > 0 && !m.down) {
      var wcol = (D.lookItem('weapon', (m.look || {}).weapon) || {}).slash || '#e8f0ff';
      var p = 1 - m.atkFx / 0.2;
      c.strokeStyle = rgba(wcol, 0.9 * (1 - p)); c.lineWidth = 7 * (1 - p) + 2;
      c.beginPath(); c.arc(m.x, m.y - 24, 46, m.atkAng - 0.95 + p * 0.3, m.atkAng + 0.95 * (p * 2 - 1)); c.stroke();
    }
    // 癒しの輪の集中
    if (m.cast) { circle(c, m.x, m.y - 10, 30 + Math.sin(t * 20) * 3, 'rgba(120,255,160,.15)', 'rgba(140,255,170,.8)', 2); }
    // 守り（護り札・守りの葉）
    if (m.guard > 0) { c.strokeStyle = 'rgba(255,240,150,.8)'; c.lineWidth = 2; c.beginPath(); c.ellipse(m.x, m.y - 30, 26, 38, 0, 0, Math.PI * 2); c.stroke(); }
    // 名前と HP
    if (!m.down) {
      var bw = 40, hp = Math.max(0, m.hp / m.maxHp);
      c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(m.x - bw / 2, m.y - h - 4, bw, 6);
      c.fillStyle = hp > 0.5 ? '#6be08e' : hp > 0.25 ? '#ffd24a' : '#ff6a5a'; c.fillRect(m.x - bw / 2, m.y - h - 4, bw * hp, 6);
      if (!isMe) text(c, m.name, m.x, m.y - h - 14, 12, '#fff', { stroke: 'rgba(20,20,30,.8)', sw: 3 });
    }
    if (m.rescuing && !m.down) { text(c, '救助中', m.x, m.y - h - 16, 12, '#b8ffcf', { stroke: 'rgba(20,60,30,.9)', sw: 3 }); }
  }
  function drawMentor(c, o, M) {
    var px = pxFor();
    var sp = sprite('cn_' + o.id, function () { return CH.BY_ID[o.id].art; }, 0, o.pose || 'serious', 0, px);
    var a = Math.min(1, o.t * 3) * Math.min(1, (o.life - o.t) * 3 + 0.2);
    c.globalAlpha = Math.max(0, Math.min(1, a));
    circle(c, o.x, o.y - 30, 44 + Math.sin(R.t * 6) * 4, 'rgba(255,240,180,.18)', 'rgba(255,240,180,.8)', 2);
    if (sp && sp.cv) c.drawImage(sp.cv, o.x - SPR_W / 2, o.y - SPR_H + 4, SPR_W, SPR_H);
    c.globalAlpha = 1;
  }
  function star(c, x, y, r, col) { var pts = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } poly(c, pts, col, OUT, 1.2); }

  /* ---------- 妖怪（かわいい見た目）---------- */
  function drawEnemy(c, e, M) {
    var t = R.t + e.id * 0.37;
    ell(c, e.x, e.y + 2, e.r * 1.1, e.r * 0.45, 'rgba(0,0,0,.25)');
    var hit = e.hitFx > 0;
    c.save(); c.translate(e.x, e.y);
    if (e.type === 'koro') koro(c, e, t, hit);
    else if (e.type === 'kasa') kasa(c, e, t, hit);
    else if (e.type === 'fuda') fuda(c, e, t, hit);
    else if (e.type === 'daruma' || e.type === 'chudaruma') daruma(c, e, t, hit);
    else if (e.type === 'dummy') dummy(c, e, t, hit);
    c.restore();
    // 状態
    if (e.bound > 0 || e.bossBind > 0) { circle(c, e.x, e.y - e.r, e.r * 1.35, 'rgba(120,200,255,.28)', 'rgba(210,240,255,.9)', 2); circle(c, e.x - e.r * 0.4, e.y - e.r * 1.6, 3, 'rgba(255,255,255,.8)'); }
    if (e.stun > 0) for (var s = 0; s < 3; s++) { var a = R.t * 6 + s * 2.1; star(c, e.x + Math.cos(a) * e.r, e.y - e.r * 2.2 + Math.sin(a) * 4, 4, '#ffe066'); }
    if (e.slow > 0 && e.slowMul < 1 && !(e.bound > 0)) { c.fillStyle = 'rgba(160,210,255,.8)'; for (var d = 0; d < 3; d++) c.fillRect(e.x - e.r + d * e.r, e.y - 4 + ((R.t * 30 + d * 7) % 10), 2, 5); }
    if (e.lure > 0) { c.strokeStyle = 'rgba(200,255,230,.9)'; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y - e.r, e.r * 1.3, R.t * 8, R.t * 8 + 4); c.stroke(); }
    if (e.burn > 0) flame(c, e.x + Math.sin(R.t * 9) * 4, e.y - e.r * 1.6, 7);
    // HP
    if (e.hp < e.maxHp && !e.boss) { var bw = e.r * 2.4; c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(e.x - bw / 2, e.y - e.r * 2.6 - 4, bw, 4); c.fillStyle = '#ff8a6a'; c.fillRect(e.x - bw / 2, e.y - e.r * 2.6 - 4, bw * Math.max(0, e.hp / e.maxHp), 4); }
  }
  function koro(c, e, t, hit) {
    var r = e.r * 1.15, sq = 1 + Math.sin(t * 10) * 0.1;
    c.translate(0, -r * sq - Math.abs(Math.sin(t * 10)) * 4);
    c.scale(1 / sq, sq);
    // 頭のゆらめき
    c.fillStyle = '#b8a8ff'; c.beginPath(); c.moveTo(-6, -r + 4); c.quadraticCurveTo(-2, -r - 14 - Math.sin(t * 8) * 3, 4, -r - 8); c.quadraticCurveTo(3, -r, 6, -r + 3); c.closePath(); c.fill();
    circle(c, 0, 0, r, hit ? '#ffffff' : '#6a5aa6', OUT, 2.2);
    ell(c, 0, r * 0.35, r * 0.62, r * 0.42, '#9d8fd6');
    var fx = e.face.x * 3, fy = Math.max(-1, e.face.y) * 2;
    ell(c, -5 + fx, -3 + fy, 4.5, 5.5, '#ffffff', OUT, 1.2); ell(c, 5 + fx, -3 + fy, 4.5, 5.5, '#ffffff', OUT, 1.2);
    circle(c, -5 + fx * 1.4, -2 + fy * 1.2, 2.2, '#2b1d3a'); circle(c, 5 + fx * 1.4, -2 + fy * 1.2, 2.2, '#2b1d3a');
    circle(c, -9, 4, 2, 'rgba(255,150,170,.8)'); circle(c, 9, 4, 2, 'rgba(255,150,170,.8)');
  }
  function kasa(c, e, t, hit) {
    var hop = Math.abs(Math.sin(t * 6)) * 5;
    c.translate(0, -hop);
    // 一本足
    c.strokeStyle = '#8a6a3a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 4 + hop); c.stroke();
    // 傘の体
    poly(c, [[-20, -8], [20, -8], [4, -46], [-4, -46]], hit ? '#ffffff' : '#d8553a', OUT, 2.2);
    c.strokeStyle = 'rgba(120,30,20,.6)'; c.lineWidth = 1.5; [-10, 0, 10].forEach(function (k) { c.beginPath(); c.moveTo(k, -8); c.lineTo(k * 0.2, -44); c.stroke(); });
    ell(c, 0, -28, 7, 8, '#ffffff', OUT, 1.5); circle(c, e.face.x * 2, -28 + e.face.y * 2, 3.2, '#2b1d16');
    c.fillStyle = '#e86a8a'; c.beginPath(); c.ellipse(0, -14, 4, 6, 0, 0, Math.PI); c.fill();
    // 背中の弱点（光る）
    var bx = -e.face.x * 18, by = -22 - e.face.y * 6, pul = 1 + Math.sin(R.t * 8) * 0.2;
    if (e.face.y > -0.6) { circle(c, bx, by, 7 * pul, 'rgba(255,230,90,.45)'); circle(c, bx, by, 4, '#ffe066', OUT, 1.2); }
    // 盾（向いている方）
    var sx = e.face.x * 20, sy = -20 + e.face.y * 8;
    if (e.face.y < -0.2) { c.globalAlpha = 0.9; }
    circle(c, sx, sy, 14, '#b88a52', OUT, 2.2); circle(c, sx, sy, 9, '#c89a62', 'rgba(90,60,30,.8)', 1.5);
    text(c, '盾', sx, sy + 1, 10, '#6a3a1a', { w: 900 });
    c.globalAlpha = 1;
    if (e.face.y < -0.6) { circle(c, bx, by, 7 * pul, 'rgba(255,230,90,.45)'); circle(c, bx, by, 4, '#ffe066', OUT, 1.2); }
  }
  function fuda(c, e, t, hit) {
    var b = Math.sin(t * 5) * 1.5;
    ell(c, 0, -16 + b, 15, 16, hit ? '#ffffff' : '#9a7450', OUT, 2.2);
    ell(c, 0, -10 + b, 9, 9, '#e8d2b0');
    circle(c, 0, -34 + b, 12, hit ? '#ffffff' : '#9a7450', OUT, 2);
    ell(c, -5, -35 + b, 5, 4, '#4a3020'); ell(c, 5, -35 + b, 5, 4, '#4a3020');
    circle(c, -5 + e.face.x, -35 + b, 1.8, '#ffffff'); circle(c, 5 + e.face.x, -35 + b, 1.8, '#ffffff');
    circle(c, 0, -30 + b, 2, '#2b1d16');
    // 葉っぱ
    c.save(); c.translate(0, -48 + b); c.rotate(-0.4); ell(c, 0, 0, 8, 4, '#5aa84a', OUT, 1.2); c.restore();
    // しっぽ
    ell(c, -e.face.x * 16, -8 + b, 8, 5, '#7a5a3a', OUT, 1.5);
    // 札
    var casting = !!e.tele;
    var fx2 = e.face.x * 16, fy2 = casting ? -54 : -18;
    if (casting) circle(c, fx2, fy2, 14 + Math.sin(R.t * 20) * 2, 'rgba(255,90,70,.3)');
    c.fillStyle = '#fff6e0'; c.fillRect(fx2 - 5, fy2 - 10, 10, 18); c.strokeStyle = '#c8302c'; c.lineWidth = 1.5; c.strokeRect(fx2 - 5, fy2 - 10, 10, 18);
    c.beginPath(); c.moveTo(fx2, fy2 - 7); c.lineTo(fx2, fy2 + 5); c.stroke();
    if (casting) text(c, '!', 16, -62, 18, '#ff5a4a', { stroke: '#2b1d16', sw: 3 });
  }
  function daruma(c, e, t, hit) {
    var r = e.r, small = e.type === 'chudaruma';
    var rock = e.roll ? t * 12 : Math.sin(t * 2.5) * 0.08;
    c.translate(0, -r);
    c.rotate(rock);
    circle(c, 0, 0, r, hit ? '#ffffff' : small ? '#e0823a' : '#c8302c', OUT, 3);
    // 金の模様
    c.strokeStyle = '#f3c24a'; c.lineWidth = 3; c.beginPath(); c.arc(0, r * 0.25, r * 0.75, 0.3, Math.PI - 0.3); c.stroke();
    // 顔
    ell(c, 0, -r * 0.18, r * 0.62, r * 0.5, '#fbeede', OUT, 2);
    var glowE = e.tele ? '#ff5a3a' : '#2b1d16';
    circle(c, -r * 0.24, -r * 0.24, r * 0.14, '#ffffff', OUT, 1.6); circle(c, r * 0.24, -r * 0.24, r * 0.14, '#ffffff', OUT, 1.6);
    circle(c, -r * 0.24, -r * 0.22, r * 0.07, glowE); circle(c, r * 0.24, -r * 0.22, r * 0.07, glowE);
    // 眉とひげ
    c.strokeStyle = '#2b1d16'; c.lineWidth = r * 0.07; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-r * 0.42, -r * 0.46); c.quadraticCurveTo(-r * 0.25, -r * 0.56, -r * 0.1, -r * 0.44); c.stroke();
    c.beginPath(); c.moveTo(r * 0.42, -r * 0.46); c.quadraticCurveTo(r * 0.25, -r * 0.56, r * 0.1, -r * 0.44); c.stroke();
    c.beginPath(); c.moveTo(-r * 0.3, 0); c.quadraticCurveTo(-r * 0.1, -r * 0.1, 0, 0); c.quadraticCurveTo(r * 0.1, -r * 0.1, r * 0.3, 0); c.stroke();
    ell(c, 0, r * 0.08, r * 0.12, r * 0.06, '#e8606a');
    text(c, small ? '中' : '夜', 0, r * 0.52, r * 0.34, '#f3c24a', { w: 900 });
  }
  function dummy(c, e, t, hit) {
    c.strokeStyle = '#6a4a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -40); c.moveTo(-16, -30); c.lineTo(16, -30); c.stroke();
    ell(c, 0, -30, 12, 16, hit ? '#ffffff' : '#d8b870', OUT, 2);
    circle(c, 0, -52, 10, hit ? '#ffffff' : '#e0c47a', OUT, 2);
    c.strokeStyle = '#a88a4a'; c.lineWidth = 1.5; for (var k = -8; k <= 8; k += 5) { c.beginPath(); c.moveTo(k, -42); c.lineTo(k, -18); c.stroke(); }
  }
  function miniEnemy(c, type, x, y) {
    c.save(); c.translate(x, y + 10); c.scale(0.55, 0.55);
    var fake = { r: D.ENEMY[type].r, face: { x: 0, y: 1 }, id: 0 };
    if (type === 'koro') koro(c, fake, 0, false); else if (type === 'kasa') kasa(c, fake, 0, false); else if (type === 'fuda') fuda(c, fake, 0, false); else daruma(c, { r: 30, face: { x: 0, y: 1 }, type: type }, 0, false);
    c.restore();
  }
  function drawVillager(c, v) {
    var t = R.t + v.id;
    ell(c, v.x, v.y + 2, 14, 6, 'rgba(0,0,0,.2)');
    if (v.state === 'down') {
      ell(c, v.x, v.y - 8, 20, 10, '#c8a46a', OUT, 2); circle(c, v.x - 18, v.y - 10, 8, '#f6d9bc', OUT, 2);
      text(c, '助けて', v.x, v.y - 34, 12, '#fff', { stroke: 'rgba(160,30,30,.9)', sw: 4 });
      if (v.rescueP > 0) { c.strokeStyle = '#6be08e'; c.lineWidth = 4; c.beginPath(); c.arc(v.x, v.y - 10, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.rescueP); c.stroke(); }
      return;
    }
    var b = Math.abs(Math.sin(t * 8)) * 3;
    ell(c, v.x, v.y - 14 - b, 11, 14, v.hurtFx > 0 ? '#ffffff' : '#c8a46a', OUT, 2);
    circle(c, v.x, v.y - 34 - b, 9, '#f6d9bc', OUT, 2);
    poly(c, [[v.x - 16, v.y - 38 - b], [v.x + 16, v.y - 38 - b], [v.x, v.y - 52 - b]], '#d8b870', OUT, 2);
    // 提灯
    ell(c, v.x + 14, v.y - 18 - b, 5, 7, '#f3c86a', OUT, 1.2);
    var hp = v.hp / v.maxHp;
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(v.x - 14, v.y - 62 - b, 28, 4); c.fillStyle = '#7ac8ff'; c.fillRect(v.x - 14, v.y - 62 - b, 28 * hp, 4);
  }
  function drawPillar(c, p) {
    ell(c, p.x, p.y + 2, 22, 8, 'rgba(0,0,0,.25)');
    if (p.broken) { poly(c, [[p.x - 16, p.y], [p.x + 16, p.y], [p.x + 10, p.y - 18], [p.x - 12, p.y - 14]], '#8a8a8a', OUT, 2); return; }
    c.fillStyle = '#a8a8a8'; c.fillRect(p.x - 12, p.y - 56, 24, 56); c.strokeStyle = OUT; c.lineWidth = 2; c.strokeRect(p.x - 12, p.y - 56, 24, 56);
    poly(c, [[p.x - 20, p.y - 56], [p.x + 20, p.y - 56], [p.x, p.y - 74]], '#8a8a96', OUT, 2);
    c.fillStyle = '#fff6e0'; c.fillRect(p.x - 5, p.y - 48, 10, 24); c.strokeStyle = '#c8302c'; c.strokeRect(p.x - 5, p.y - 48, 10, 24);
    circle(c, p.x, p.y - 64, 5 + Math.sin(R.t * 4), 'rgba(160,220,255,.9)');
    var hp = p.hp / p.max; c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(p.x - 22, p.y - 86, 44, 5); c.fillStyle = '#7ab8ff'; c.fillRect(p.x - 22, p.y - 86, 44 * hp, 5);
    if (p.hitFx > 0) { p.hitFx -= 0.016; circle(c, p.x, p.y - 30, 30, 'rgba(255,120,120,.25)'); }
  }
  function drawObstacle(c, z) {
    if (z.kind === 'wall') {
      var n = Math.max(3, Math.round(Math.hypot(z.x2 - z.x, z.y2 - z.y) / 22)), hp = z.hp / z.max;
      for (var i = 0; i <= n; i++) {
        var u = i / n, x = z.x + (z.x2 - z.x) * u, y = z.y + (z.y2 - z.y) * u;
        ell(c, x, y + 2, 14, 6, 'rgba(0,0,0,.25)');
        poly(c, [[x - 13, y], [x + 13, y], [x + 11, y - 26], [x - 10, y - 28]], i % 2 ? '#b8a58a' : '#a8957a', OUT, 2);
        if (hp < 0.5 && i % 2) { c.strokeStyle = OUT; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - 4, y - 24); c.lineTo(x + 2, y - 14); c.lineTo(x - 2, y - 6); c.stroke(); }
      }
    } else {
      circle(c, z.x, z.y, z.r, 'rgba(255,220,150,.07)', 'rgba(255,220,150,.35)', 1.5);
      ell(c, z.x, z.y + 2, 16, 6, 'rgba(0,0,0,.25)');
      ell(c, z.x, z.y - 18, 13, 18, '#b8b0a4', OUT, 2); circle(c, z.x, z.y - 42, 11, '#c8c0b4', OUT, 2);
      poly(c, [[z.x - 12, z.y - 32], [z.x + 12, z.y - 32], [z.x, z.y - 18]], '#d8302c', OUT, 1.5);
      c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.arc(z.x - 4, z.y - 43, 2.5, 0.2, Math.PI - 0.2); c.moveTo(z.x + 6.5, z.y - 43); c.arc(z.x + 4, z.y - 43, 2.5, 0.2, Math.PI - 0.2); c.stroke();
    }
  }
  function drawBarrier(c, b, M) {
    var hp = b.hp / b.max, t = R.t;
    // 結界の輪（HP で明るさ）
    var fl = R.bFlash > 0 ? 0.5 : 0;
    c.strokeStyle = 'rgba(160,220,255,' + (0.35 + 0.5 * hp + fl) + ')'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(b.x, b.y, MAP.barrier.aura, MAP.barrier.aura * 0.62, 0, 0, Math.PI * 2); c.stroke();
    c.setLineDash([4, 10]); c.lineDashOffset = -t * 20; c.beginPath(); c.ellipse(b.x, b.y, MAP.barrier.aura + 8, MAP.barrier.aura * 0.62 + 5, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    // 要石
    ell(c, b.x, b.y + 4, 56, 20, 'rgba(0,0,0,.3)');
    poly(c, [[b.x - 44, b.y], [b.x + 44, b.y], [b.x + 36, b.y - 70], [b.x + 6, b.y - 92], [b.x - 30, b.y - 80]], '#8a8f9a', OUT, 3);
    poly(c, [[b.x - 20, b.y - 76], [b.x + 4, b.y - 88], [b.x + 30, b.y - 70], [b.x + 20, b.y - 60], [b.x - 10, b.y - 64]], 'rgba(255,255,255,.18)');
    // しめ縄と紙垂
    c.strokeStyle = '#e8d8a8'; c.lineWidth = 7; c.beginPath(); c.moveTo(b.x - 42, b.y - 44); c.quadraticCurveTo(b.x, b.y - 30, b.x + 40, b.y - 46); c.stroke();
    c.strokeStyle = OUT; c.lineWidth = 1.5; c.stroke();
    [-24, 0, 24].forEach(function (k) { poly(c, [[b.x + k - 5, b.y - 38], [b.x + k + 5, b.y - 38], [b.x + k + 1, b.y - 28], [b.x + k + 6, b.y - 26], [b.x + k - 2, b.y - 16], [b.x + k - 6, b.y - 18]], '#ffffff', OUT, 1); });
    // ひび
    if (hp < 0.6) { c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.moveTo(b.x + 10, b.y - 86); c.lineTo(b.x + 2, b.y - 66); c.lineTo(b.x + 12, b.y - 56); if (hp < 0.3) { c.moveTo(b.x - 30, b.y - 70); c.lineTo(b.x - 16, b.y - 58); c.lineTo(b.x - 24, b.y - 48); } c.stroke(); }
    // 光の玉
    circle(c, b.x + 4, b.y - 108 + Math.sin(t * 2) * 4, 8 + 4 * hp, 'rgba(200,240,255,' + (0.5 + 0.4 * hp) + ')');
  }

  /* ---------- 効果（サーバーのできごとから作る）---------- */
  function addFx(o) { if (R.fx.length > 220) R.fx.shift(); o.t = 0; R.fx.push(o); }
  function onEvents(M, evs, meId) {
    evs.forEach(function (e) {
      switch (e.type) {
        case 'hit': if (e.amt >= 1) addFx({ k: 'num', x: e.x + (Math.random() - 0.5) * 16, y: e.y, s: String(e.amt), col: e.big ? '#ffd24a' : e.weak ? '#aab4c8' : '#ffffff', life: 0.7, big: e.big }); addFx({ k: 'spark', x: e.x, y: e.y + 8, life: 0.25 }); break;
        case 'hurt': addFx({ k: 'num', x: e.x, y: e.y, s: '-' + e.amt, col: '#ff7a6a', life: 0.8 }); if (e.id === meId) R.shake = Math.max(R.shake, 0.12); break;
        case 'heal': addFx({ k: 'num', x: e.x, y: e.y, s: '+' + e.amt, col: '#8affb0', life: 0.9 }); break;
        case 'purify': addFx({ k: 'purify', x: e.x, y: e.y - 16, life: e.boss ? 1.6 : 0.8, boss: e.boss }); break;
        case 'combo': addFx({ k: 'combo', x: e.x, y: e.y - 60, s: '連携！', sub: D.COMBOS[e.kind] ? D.COMBOS[e.kind].short : '', life: 1.2 }); break;
        case 'block': addFx({ k: 'num', x: e.x, y: e.y, s: '防いだ', col: '#bfe0ff', life: 0.7 }); break;
        case 'guarded': if (Math.random() < 0.5) addFx({ k: 'num', x: e.x, y: e.y - 40, s: 'カン！', col: '#c8ccd6', life: 0.5 }); break;
        case 'interrupt': addFx({ k: 'num', x: e.x, y: e.y - 50, s: '詠唱中断！', col: '#ffe066', life: 0.9 }); break;
        case 'gather': addFx({ k: 'num', x: e.x, y: e.y, s: '素材+1', col: '#ffe28a', life: 0.8 }); break;
        case 'repair': addFx({ k: 'num', x: e.x + (Math.random() - 0.5) * 30, y: e.y - 100, s: '+' + e.amt, col: '#9fd8ff', life: 0.8 }); break;
        case 'barrierHit': R.bFlash = 1; break;
        case 'trap': if (e.what === 'boom') { addFx({ k: 'boom', x: e.x, y: e.y, r: e.r || 70, life: 0.45 }); R.shake = Math.max(R.shake, 0.08); } else if (e.what === 'place') addFx({ k: 'ring', x: e.x, y: e.y, r: 34, life: 0.5, col: '#ffe070' }); break;
        case 'down': addFx({ k: 'num', x: e.x, y: e.y - 70, s: 'ダウン！', col: '#ff9a8a', life: 1.2, big: true }); break;
        case 'revive': addFx({ k: 'ring', x: e.x, y: e.y, r: 50, life: 0.7, col: '#8affb0' }); addFx({ k: 'num', x: e.x, y: e.y - 70, s: e.by ? '救助！' : '起き上がった', col: '#8affb0', life: 1.1, big: !!e.by }); break;
        case 'bossAtk': if (e.atk === 'slam' || e.atk === 'ring') { R.shake = Math.max(R.shake, 0.3); addFx({ k: 'ring', x: e.x, y: e.y, r: e.r || 150, life: 0.5, col: '#ffb08a' }); } break;
        case 'blast': addFx({ k: 'boom', x: e.x, y: e.y, r: 44, life: 0.35, col: '#ff6a5a' }); break;
        case 'ping': addFx({ k: 'ring', x: e.x, y: e.y, r: 60, life: 0.8, col: e.kind === 'gather' ? '#7ac8ff' : e.kind === 'defend' ? '#ffd27a' : '#ff7a7a' }); break;
        case 'villager': if (e.what === 'saved') addFx({ k: 'num', x: e.x, y: e.y - 50, s: '避難できた！', col: '#9fe8ff', life: 1.2 }); if (e.what === 'lost') addFx({ k: 'num', x: e.x, y: e.y - 50, s: '家へ逃げ帰った…', col: '#d8c8b0', life: 1.4 }); break;
        case 'pillar': if (e.what === 'broken') { addFx({ k: 'boom', x: e.x, y: e.y - 30, r: 60, life: 0.5 }); R.shake = 0.3; } break;
        case 'support': R.flash = 0.6; break;
        case 'retreat': addFx({ k: 'purify', x: e.x, y: e.y - 16, life: 0.6, fade: true }); break;
        case 'say': if (e.text) addFx({ k: 'say', id: e.id, x: e.x, y: e.y, s: e.text, life: 2.6 }); break;
      }
    });
  }
  function drawFx(c, dt) {
    R.fx = R.fx.filter(function (f) {
      f.t += dt; var p = f.t / f.life; if (p >= 1) return false;
      if (f.k === 'num') { var s = f.big ? 22 : 16; text(c, f.s, f.x, f.y - p * 34, s * (1 + (1 - p) * 0.2), f.col, { stroke: 'rgba(20,15,30,.85)', sw: 4 }); }
      else if (f.k === 'spark') { c.strokeStyle = 'rgba(255,255,220,' + (1 - p) + ')'; c.lineWidth = 2.5; for (var i = 0; i < 5; i++) { var a = i * 1.26 + f.x, r0 = 6 + p * 14; c.beginPath(); c.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0); c.lineTo(f.x + Math.cos(a) * (r0 + 7), f.y + Math.sin(a) * (r0 + 7)); c.stroke(); } }
      else if (f.k === 'purify') { var n = f.boss ? 18 : 8; for (var j = 0; j < n; j++) { var an = j * 6.283 / n + f.x, rr = p * (f.boss ? 110 : 34); circle(c, f.x + Math.cos(an) * rr, f.y + Math.sin(an) * rr * 0.6 - p * 20, (f.boss ? 6 : 3.5) * (1 - p), f.fade ? 'rgba(200,180,255,' + (1 - p) + ')' : 'rgba(255,245,190,' + (1 - p) + ')'); } circle(c, f.x, f.y - p * 60, (f.boss ? 14 : 6) * (1 - p * 0.5), 'rgba(220,240,255,' + (1 - p) + ')'); }
      else if (f.k === 'combo') { var sc = p < 0.2 ? 0.6 + p * 2 : 1; text(c, f.s, f.x, f.y - p * 20, 30 * sc, '#ffd24a', { stroke: '#7a2a10', sw: 6 }); if (f.sub) text(c, f.sub, f.x, f.y + 24 - p * 20, 14, '#fff3c0', { stroke: 'rgba(80,30,10,.9)', sw: 4 }); }
      else if (f.k === 'boom') { circle(c, f.x, f.y, (f.r || 60) * (0.5 + p * 0.6), rgba(f.col || '#ff9a3a', 0.4 * (1 - p))); circle(c, f.x, f.y, (f.r || 60) * (0.3 + p), null, rgba('#ffe0a0', 1 - p), 3); }
      else if (f.k === 'ring') { circle(c, f.x, f.y, f.r * (0.4 + p * 0.8), null, rgba(f.col || '#ffffff', 1 - p), 3); }
      else if (f.k === 'say') {
        var who = R.M ? R.M.members.filter(function (m) { return m.id === f.id; })[0] : null;
        var sx = who ? who.x : f.x, sy = (who ? who.y : f.y) - 96;
        c.font = '700 13px ' + FONT; var tw = c.measureText(f.s).width + 16;
        c.globalAlpha = Math.min(1, (1 - p) * 4);
        c.fillStyle = 'rgba(255,253,247,.95)'; roundRect(c, sx - tw / 2, sy - 13, tw, 26, 10); c.fill(); c.strokeStyle = 'rgba(60,50,40,.6)'; c.lineWidth = 1.5; c.stroke();
        poly(c, [[sx - 6, sy + 12], [sx + 6, sy + 12], [sx, sy + 20]], 'rgba(255,253,247,.95)');
        text(c, f.s, sx, sy + 1, 13, '#2b2b33', { w: 700 });
        c.globalAlpha = 1;
      }
      return true;
    });
  }

  /* ---------- 画面の端に、見えない味方の位置 ---------- */
  function edgeMarkers(c, M, me) {
    M.members.forEach(function (m) {
      if (m === me) return;
      var s = w2s(m.x, m.y - 30);
      var pad = 34;
      if (s.x > pad && s.x < R.vw - pad && s.y > pad + 60 && s.y < R.vh - pad) return;
      var cx = R.vw / 2, cy = R.vh / 2, dx = s.x - cx, dy = s.y - cy;
      var k = Math.min((R.vw / 2 - pad) / Math.abs(dx || 1e-3), (R.vh / 2 - pad - 30) / Math.abs(dy || 1e-3));
      var x = cx + dx * k, y = cy + dy * k + 15, a = Math.atan2(dy, dx);
      var col = m.down ? (Math.floor(R.t * 4) % 2 ? '#ff5a4a' : '#ffffff') : D.ROLES[m.role].color;
      c.save(); c.translate(x, y); c.rotate(a); poly(c, [[16, 0], [-6, -11], [-6, 11]], col, OUT, 2); c.restore();
      circle(c, x - Math.cos(a) * 18, y - Math.sin(a) * 18, 13, 'rgba(20,20,30,.75)', col, 2);
      text(c, m.down ? '!' : m.name.charAt(0), x - Math.cos(a) * 18, y - Math.sin(a) * 18 + 1, 13, '#ffffff');
    });
  }

  /* ---------- 小さな地図 ---------- */
  function minimap(cv, M, meId) {
    var c = cv.getContext('2d'), w = cv.width, h = cv.height, k = Math.min(w / MAP.w, h / MAP.h);
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(30,45,30,.85)'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(200,170,120,.8)'; c.lineWidth = 3;
    [MAP.lanes.west, MAP.lanes.east].concat(M.tpl.branch ? [MAP.branches.west, MAP.branches.east] : []).forEach(function (L) { c.beginPath(); L.forEach(function (p, i) { if (i) c.lineTo(p[0] * k, p[1] * k); else c.moveTo(p[0] * k, p[1] * k); }); c.stroke(); });
    circle(c, M.barrier.x * k, M.barrier.y * k, 5, '#9fd8ff', '#ffffff', 1);
    M.pillars.forEach(function (p) { circle(c, p.x * k, p.y * k, 3, p.broken ? '#666' : '#7ab8ff'); });
    M.enemies.forEach(function (e) { circle(c, e.x * k, e.y * k, e.boss ? 5 : 2, e.boss ? '#ff5a3a' : '#ff9a8a'); });
    M.villagers.forEach(function (v) { if (v.state === 'walk' || v.state === 'down') circle(c, v.x * k, v.y * k, 2.5, v.state === 'down' ? '#ffffff' : '#9fe8ff'); });
    M.members.forEach(function (m) { circle(c, m.x * k, m.y * k, m.id === meId ? 4 : 3, m.down ? '#ffffff' : m.id === meId ? '#ffd24a' : D.ROLES[m.role].color, '#000', 1); });
  }

  var api = { R: R, init: init, resize: resize, frame: frame, onEvents: onEvents, buildGround: buildGround, w2s: w2s, s2w: s2w, warm: warm, memberDef: memberDef, pxFor: pxFor, minimap: minimap, sprite: sprite, drawEnemyIcon: miniEnemy, SPR_W: SPR_W, SPR_H: SPR_H };
  root.NYT_RENDER = api;
})(typeof window !== 'undefined' ? window : globalThis);
