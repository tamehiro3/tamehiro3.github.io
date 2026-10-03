/* ニンジャ相棒道場 — 描画（キャンバス）
 * 人物は art.js の SVG を画像にして使う（向き・しぐさ・動きごとに作って覚えておく）。
 * からくり・地面・小物・効果はキャンバスに直接描く。
 */
(function (root) {
  'use strict';
  var A = root.NinjaArt, D = root.NAD_DATA, CH = root.NAD_CHARS;
  var R = root.NAD_R = {};
  var cv, ctx, DPR = 1, VW = 0, VH = 0;

  R.init = function (canvas) {
    cv = canvas; ctx = cv.getContext('2d');
    R.resize();
    root.addEventListener('resize', R.resize);
  };
  R.resize = function () {
    DPR = Math.min(2, root.devicePixelRatio || 1);
    VW = root.innerWidth; VH = root.innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
  };
  R.size = function () { return { w: VW, h: VH, dpr: DPR }; };

  /* ================= 人物の絵（SVG → 画像） ================= */
  var cache = {}, last = {}, pending = 0, onReady = null;
  var TOPPAD = 32; // 髪・まげ・耳が上で切れないよう、絵の上に足す余白（art.js の座標。足もとは y=232）
  var VB = '0 ' + (-TOPPAD) + ' 200 ' + (240 + TOPPAD);
  R.onSprite = function (fn) { onReady = fn; };
  R.pending = function () { return pending; };
  R.clear = function (prefix) { var k; for (k in cache) if (k.indexOf(prefix) === 0) delete cache[k]; for (k in last) if (k.indexOf(prefix) === 0) delete last[k]; };
  // key: 人物ごとの名前。o: { yaw, pose, frame, expr }。hpx: 画面上の高さ（CSS px。余白をのぞいた 240 の枠の高さ）
  // 返す e：cv（画像）・w・h（余白をふくむ大きさ）・ay（上はしから足もとまで）。足もと (x, y) には drawImage(e.cv, x - e.w / 2, y - e.ay, e.w, e.h)
  R.sprite = function (key, defFn, o, hpx) {
    var ph = Math.max(24, Math.round(hpx * DPR / 8) * 8);
    var k = key + '|' + o.yaw + '|' + o.pose + '|' + (o.frame || 0) + '|' + (o.expr || '') + '|' + ph;
    var e = cache[k];
    if (e) return e.ready ? e : (last[key] || null);
    e = cache[k] = { ready: false };
    pending++;
    var pw = Math.round(ph * 200 / 240), pht = Math.round(ph * (240 + TOPPAD) / 240);
    var svg;
    // 小さく描くときは線を太めに（背の高い絵柄は線が細く見えやすい）
    var lwk = Math.max(1, Math.min(1.9, 98 / Math.max(1, hpx)));
    try { svg = A.render(defFn(), { yaw: o.yaw, pose: o.pose, frame: o.frame, expr: o.expr, viewBox: VB, w: pw, h: pht, shadow: false, prop: false, companions: false, lw: lwk }); }
    catch (err) { pending--; return last[key] || null; }
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = pw; c.height = pht; c.getContext('2d').drawImage(img, 0, 0);
      e.cv = c; e.w = pw / DPR; e.h = pht / DPR; e.ay = ph * (232 + TOPPAD) / 240 / DPR; e.ready = true; last[key] = e; pending--;
      if (onReady) onReady();
    };
    img.onerror = function () { pending--; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return last[key] || null;
  };
  // 顔（DOM 用の SVG）
  R.faceSvg = function (def, expr, yaw) {
    try { return A.render(def, { yaw: yaw == null ? -20 : yaw, pose: 'stand', expr: expr || 'normal', viewBox: A.faceBox(def, { size: 58, up: 0.52 }), w: 144, h: 144, shadow: false, prop: false, companions: false, lw: 1.2 }); } catch (e) { return ''; }
  };
  R.bodySvg = function (def, o) { // 全身（上に余白つき。幅：高さ = 200：272）
    o = o || {};
    try { return A.render(def, { yaw: o.yaw || 0, pose: o.pose || 'stand', expr: o.expr, fx: o.fx, frame: o.frame, viewBox: VB, w: o.w || 200, h: o.h || Math.round((o.w || 200) * (240 + TOPPAD) / 200), shadow: o.shadow !== false, prop: o.prop, companions: o.companions }); } catch (e) { return ''; }
  };
  // 向き（見下ろしの画面）→ art.js の yaw
  var YAW = { 0: 0, 45: 50, 90: 90, 135: 130, 180: 180, '-45': -50, '-90': -90, '-135': -130 };
  R.yawFor = function (f) {
    var a = Math.atan2(f.x, f.y) * 180 / Math.PI, q = Math.round(a / 45) * 45;
    if (q === -180) q = 180;
    return YAW[q] != null ? YAW[q] : 0;
  };

  /* ================= 修行の場 ================= */
  var cam = { x: 6, y: 50, T: 48, ox: 0, oy: 0 };
  R.cam = cam;
  R.setupCam = function (st) {
    var T = Math.floor(Math.min(VW / 9.4, VH / 12.5));
    cam.T = Math.max(34, Math.min(64, T));
    cam.x = st.player.x; cam.y = st.player.y - 1.5;
  };
  function W2S(x, y) { return { x: (x - cam.x) * cam.T + VW / 2, y: (y - cam.y) * cam.T + VH * 0.55 }; }
  R.W2S = W2S;
  function S2W(sx, sy) { return { x: (sx - VW / 2) / cam.T + cam.x, y: (sy - VH * 0.55) / cam.T + cam.y }; }
  R.S2W = S2W;

  function hash(n) { var x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

  R.drawField = function (st, time, sprites) {
    var T = cam.T, G = st.grid;
    // カメラ（見習いを追う。横は場の幅に合わせる）
    var fieldW = st.W * T;
    var tx = fieldW <= VW ? st.W / 2 : Math.max(VW / 2 / T, Math.min(st.W - VW / 2 / T, st.player.x));
    var ty = Math.max(-1, Math.min(st.H + 1 - VH * 0.45 / T, st.player.y - 1.2));
    cam.x += (tx - cam.x) * 0.15; cam.y += (ty - cam.y) * 0.15;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 外側の竹林
    ctx.fillStyle = '#2f4a2a'; ctx.fillRect(0, 0, VW, VH);
    var o0 = W2S(0, 0);
    for (var bx = -3; bx < VW / 18 + 3; bx++) {
      var xx = bx * 18 + ((cam.x * T * 0.3) % 18);
      ctx.fillStyle = bx % 3 ? '#3a5a32' : '#46683a'; ctx.fillRect(xx, 0, 7, VH);
    }
    var y0 = Math.max(0, Math.floor(cam.y - VH * 0.55 / T) - 1), y1 = Math.min(G.h - 1, Math.ceil(cam.y + VH * 0.45 / T) + 1);
    var zoneOf = function (y) { for (var i = 0; i < st.zones.length; i++) if (y >= st.zones[i].y0 && y < st.zones[i].y1) return st.zones[i]; return null; };
    // 地面
    for (var y = y0; y <= y1; y++) {
      var z = zoneOf(y);
      for (var x = 0; x < G.w; x++) {
        var p = W2S(x, y), h = hash(x * 131 + y * 17);
        var base = z && z.arena ? ((x + y) % 2 ? '#c9b48a' : '#c3ae84') : ((x + y) % 2 ? '#a3cc6e' : '#9bc467');
        if (!z) base = (x + y) % 2 ? '#d8c49a' : '#d2be94';
        if (x >= 4 && x <= 7 && z && !z.arena) base = (x + y) % 2 ? '#c8c08a' : '#c2ba84';
        ctx.fillStyle = base; ctx.fillRect(p.x, p.y, T + 0.5, T + 0.5);
        if (h > 0.82 && !(z && z.arena)) { ctx.fillStyle = 'rgba(60,110,40,.45)'; ctx.fillRect(p.x + h * T * 0.8, p.y + (1 - h) * T * 2, 2, 5); }
        var hz = G.hz[G.i(x, y)];
        if (hz === 1) { // まきびし
          ctx.fillStyle = 'rgba(120,90,140,.35)'; ctx.fillRect(p.x, p.y, T, T);
          ctx.fillStyle = '#5a5a66';
          for (var s = 0; s < 3; s++) { var sx = p.x + (0.2 + 0.3 * s + hash(x + y * 7 + s) * 0.1) * T, sy = p.y + (0.3 + 0.35 * hash(s * 3 + x * 5 + y)) * T; ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 4, sy + 3); ctx.lineTo(sx - 4, sy + 3); ctx.closePath(); ctx.fill(); }
        }
      }
    }
    // 竹垣・門・岩・竹
    for (y = y0; y <= y1; y++) for (x = 0; x < G.w; x++) {
      var b = G.block[G.i(x, y)];
      if (!b) continue;
      p = W2S(x, y);
      if (b === 1) drawFence(p.x, p.y, T, x, y);
      else if (b === 2) drawGate(p.x, p.y, T, x, true);
      else if (b === 3) drawRock(p.x, p.y, T, x * 7 + y);
      else if (b === 4) drawBamboo(p.x, p.y, T, x * 3 + y, time);
    }
    // 開いた門の柱
    st.zones.forEach(function (z) { if (z.gate && z.open && z.gate.y >= y0 - 1 && z.gate.y <= y1 + 1) { var gp = W2S(z.gate.x0, z.gate.y); drawOpenGate(gp.x, gp.y, T, z.gate.x1 - z.gate.x0 + 1); } });
    // ゴール
    var gl = W2S(5, 0); if (gl.y > -T * 2) drawGoal(gl.x, gl.y, T);
    // 立て札（場所の名前）
    st.zones.forEach(function (z) { var sp = W2S(0.7, z.y1 - 1.3); if (sp.y > -T && sp.y < VH + T) drawSign(sp.x, sp.y, z.name, T); });
    // 大技の予告
    st.enemies.forEach(function (e) {
      if (e.tele > 0) { var E = D.ENEMIES[e.kind], c = W2S(e.x, e.y), k = 1 - e.tele / E.slam.tele; ctx.fillStyle = 'rgba(220,60,40,' + (0.18 + 0.25 * k) + ')'; ctx.beginPath(); ctx.ellipse(c.x, c.y, E.slam.r * T, E.slam.r * T * 0.8, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#d8302c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(c.x, c.y, E.slam.r * T * k, E.slam.r * T * 0.8 * k, 0, 0, 7); ctx.stroke(); }
    });
    // 宝箱・草むら
    st.spots.forEach(function (s) { var sp2 = W2S(s.x, s.y); if (sp2.y < -T || sp2.y > VH + T) return; if (s.kind === 'chest') drawChest(sp2.x, sp2.y, T, s.opened, time); else drawGrass(sp2.x, sp2.y, T, s.opened, time); });
    // 人とからくり（奥から）
    var list = [];
    list.push({ y: st.player.y, fn: function () { drawPerson(st, 'player', st.player, sprites.player, time); } });
    list.push({ y: st.partner.y, fn: function () { drawPerson(st, 'partner', st.partner, sprites.partner, time); } });
    st.allies.forEach(function (a) { if (a.state !== 'gone') list.push({ y: a.y, fn: function () { drawAlly(st, a, time); } }); });
    if (st.escort && st.escort.state !== 'hidden' && st.escort.state !== 'arrived') list.push({ y: st.escort.y, fn: function () { drawEscort(st, st.escort, time); } });
    st.enemies.forEach(function (e) { if (e.hp > 0) list.push({ y: e.y, fn: function () { drawEnemy(e, time); } }); });
    list.sort(function (a, b2) { return a.y - b2.y; });
    list.forEach(function (it) { it.fn(); });
    // 煙（人の上にうすく）
    st.hazards.forEach(function (hz2) {
      if (hz2.kind !== 'smoke' || hz2.cx == null) return;
      var c = W2S(hz2.cx, hz2.cy);
      if (c.y < -T * 3 || c.y > VH + T * 3) return;
      for (var i = 0; i < 7; i++) {
        var a = time * 0.4 + i * 0.9, r = (0.5 + 0.35 * Math.sin(a * 1.3 + i)) * T;
        ctx.fillStyle = 'rgba(150,130,170,.22)';
        ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * hz2.r * T * 0.55, c.y + Math.sin(a * 0.8) * hz2.r * T * 0.45, r, 0, 7); ctx.fill();
      }
    });
    // 弓の玉
    st.shots.forEach(function (s) { var sp3 = W2S(s.x, s.y); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sp3.x, sp3.y - T * 0.35, T * 0.12, 0, 7); ctx.fill(); ctx.stroke(); });
    // 進みぐあいの輪（救助・調査）
    [st.player, st.partner].forEach(function (o) {
      if (!o.prog) return;
      var tg = o.prog.target === 'partner' ? st.partner : (o.prog.target === 'player' ? st.player : (byId(st.allies, o.prog.target) || byId(st.spots, o.prog.target)));
      if (!tg) return;
      var c = W2S(tg.x, tg.y), k = Math.min(1, o.prog.t / o.prog.need);
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(c.x, c.y - T * 0.9, T * 0.3, 0, 7); ctx.stroke();
      ctx.strokeStyle = o === st.player ? '#6ab04a' : '#3a8ac8'; ctx.beginPath(); ctx.arc(c.x, c.y - T * 0.9, T * 0.3, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    });
    // 効果
    st.fx.forEach(function (f) { drawFx(f, st.t - f.t, T); });
    // 吹き出し
    st.bubbles.forEach(function (bb) {
      var who = bb.who === 'player' ? st.player : bb.who === 'partner' ? st.partner : bb.who === 'esc' ? st.escort : (bb.who === 'boss' ? st.enemies.filter(function (e) { return e.boss && e.hp > 0; })[0] : byId(st.allies, bb.who));
      if (!who) return;
      var c = W2S(who.x, who.y);
      bubble(c.x, c.y - T * 1.75, bb.text, bb.who === 'partner' ? '#eaf2fb' : '#fffaf0', T);
    });
  };
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  /* ---- 地形の小物 ---- */
  function drawFence(x, y, T, gx, gy) {
    ctx.fillStyle = '#5a7a3a'; ctx.fillRect(x, y, T, T);
    for (var i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#7aa04a' : '#6a9040'; ctx.fillRect(x + i * T / 3 + 1, y - T * 0.35, T / 3 - 2, T * 1.35); ctx.fillStyle = 'rgba(40,60,20,.6)'; ctx.fillRect(x + i * T / 3 + 1, y + T * 0.3 + (gy % 2) * 4, T / 3 - 2, 2); }
    ctx.fillStyle = '#8a6a3a'; ctx.fillRect(x, y + T * 0.15, T, 4);
  }
  function drawGate(x, y, T, gx, closed) {
    ctx.fillStyle = '#9bc467'; ctx.fillRect(x, y, T, T);
    ctx.fillStyle = '#8a5a30'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2;
    ctx.fillRect(x + 2, y + T * 0.1, T - 4, T * 0.22); ctx.strokeRect(x + 2, y + T * 0.1, T - 4, T * 0.22);
    ctx.fillRect(x + 2, y + T * 0.55, T - 4, T * 0.22); ctx.strokeRect(x + 2, y + T * 0.55, T - 4, T * 0.22);
    for (var i = 0; i < 3; i++) { ctx.fillStyle = '#a8743e'; ctx.fillRect(x + 4 + i * (T - 8) / 3, y - T * 0.2, 6, T * 1.1); ctx.strokeRect(x + 4 + i * (T - 8) / 3, y - T * 0.2, 6, T * 1.1); }
  }
  function drawOpenGate(x, y, T, n) {
    ctx.fillStyle = '#c8452c'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2;
    ctx.fillRect(x - 4, y - T * 0.9, 8, T * 1.6); ctx.strokeRect(x - 4, y - T * 0.9, 8, T * 1.6);
    ctx.fillRect(x + n * T - 4, y - T * 0.9, 8, T * 1.6); ctx.strokeRect(x + n * T - 4, y - T * 0.9, 8, T * 1.6);
    ctx.fillRect(x - 10, y - T * 0.95, n * T + 20, 8); ctx.strokeRect(x - 10, y - T * 0.95, n * T + 20, 8);
  }
  function drawGoal(x, y, T) {
    ctx.fillStyle = '#c8452c'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2.5;
    ctx.fillRect(x - 6, y - T * 1.3, 10, T * 2.2); ctx.strokeRect(x - 6, y - T * 1.3, 10, T * 2.2);
    ctx.fillRect(x + 2 * T - 4, y - T * 1.3, 10, T * 2.2); ctx.strokeRect(x + 2 * T - 4, y - T * 1.3, 10, T * 2.2);
    ctx.fillRect(x - 18, y - T * 1.45, 2 * T + 36, 10); ctx.strokeRect(x - 18, y - T * 1.45, 2 * T + 36, 10);
    ctx.fillRect(x - 10, y - T * 1.1, 2 * T + 20, 7); ctx.strokeRect(x - 10, y - T * 1.1, 2 * T + 20, 7);
  }
  function drawRock(x, y, T, seed) {
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x + T / 2, y + T * 0.8, T * 0.45, T * 0.16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9a9aa0'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x + T * 0.1, y + T * 0.8); ctx.quadraticCurveTo(x + T * 0.05, y + T * 0.2, x + T * 0.45, y + T * 0.12); ctx.quadraticCurveTo(x + T * 0.95, y + T * 0.15, x + T * 0.9, y + T * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b9b9be'; ctx.beginPath(); ctx.ellipse(x + T * 0.42, y + T * 0.35, T * 0.16, T * 0.08, -0.3, 0, 7); ctx.fill();
  }
  function drawBamboo(x, y, T, seed, time) {
    for (var i = 0; i < 3; i++) {
      var bx = x + T * (0.2 + i * 0.28), sw = Math.sin(time * 1.5 + seed + i) * 2;
      ctx.fillStyle = i % 2 ? '#6a9a40' : '#7aaa4a'; ctx.strokeStyle = '#3b4a20'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx - 4, y + T * 0.85); ctx.lineTo(bx - 3 + sw, y - T * 0.9); ctx.lineTo(bx + 3 + sw, y - T * 0.9); ctx.lineTo(bx + 4, y + T * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
      for (var j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(bx - 4, y + T * (0.5 - j * 0.45)); ctx.lineTo(bx + 4, y + T * (0.5 - j * 0.45)); ctx.stroke(); }
      ctx.fillStyle = '#5a8a30'; ctx.beginPath(); ctx.ellipse(bx + 8 + sw, y - T * 0.7, 9, 3, -0.5, 0, 7); ctx.fill();
    }
  }
  function drawSign(x, y, text, T) {
    ctx.fillStyle = '#8a6440'; ctx.fillRect(x - 2, y, 4, T * 0.7);
    ctx.fillStyle = '#e8d8b0'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2;
    var w = Math.min(T * 3.4, 12 + text.length * 11);
    ctx.fillRect(x - 6, y - 18, w, 20); ctx.strokeRect(x - 6, y - 18, w, 20);
    ctx.fillStyle = '#3b2a20'; ctx.font = '700 11px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text.length > 11 ? text.slice(0, 10) + '…' : text, x - 1, y - 8);
  }
  function drawChest(x, y, T, opened, time) {
    var w = T * 0.62, h = T * 0.4;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, y + 2, w * 0.6, h * 0.25, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2.2;
    ctx.fillStyle = '#b8763a'; ctx.fillRect(x - w / 2, y - h, w, h); ctx.strokeRect(x - w / 2, y - h, w, h);
    if (opened) {
      ctx.fillStyle = '#8a5428'; ctx.beginPath(); ctx.moveTo(x - w / 2, y - h); ctx.lineTo(x - w / 2 + 4, y - h - h * 0.8); ctx.lineTo(x + w / 2 + 4, y - h - h * 0.8); ctx.lineTo(x + w / 2, y - h); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#c98a4a'; ctx.beginPath(); ctx.moveTo(x - w / 2, y - h); ctx.quadraticCurveTo(x, y - h * 1.9, x + w / 2, y - h); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8c56b'; ctx.fillRect(x - 4, y - h * 0.95, 8, 9); ctx.strokeRect(x - 4, y - h * 0.95, 8, 9);
      var k = (Math.sin(time * 3) + 1) / 2; ctx.fillStyle = 'rgba(255,240,160,' + (0.5 * k) + ')'; star(x + w * 0.45, y - h * 1.5, 4 + 2 * k);
    }
  }
  function drawGrass(x, y, T, opened, time) {
    var n = opened ? 3 : 6;
    for (var i = 0; i < n; i++) {
      var gx = x - T * 0.3 + i * T * 0.12, sw = Math.sin(time * 2 + i) * 2, h = opened ? T * 0.2 : T * (0.45 + (i % 3) * 0.1);
      ctx.strokeStyle = i % 2 ? '#3f7a2a' : '#4f8a34'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.quadraticCurveTo(gx + sw, y - h * 0.6, gx + sw * 2 + (i - 2.5) * 2, y - h); ctx.stroke();
    }
    if (!opened) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '900 ' + Math.round(T * 0.32) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('?', x + T * 0.3, y - T * 0.55 + Math.sin(time * 3) * 2); }
  }
  function star(x, y, r) { ctx.beginPath(); for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rr = i % 2 ? r * 0.4 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
  var FONT = "'Hiragino Maru Gothic ProN','Zen Maru Gothic','BIZ UDPGothic','Yu Gothic',sans-serif";

  /* ---- 人 ---- */
  function shadowAt(x, y, T, w) { ctx.fillStyle = 'rgba(40,30,20,.22)'; ctx.beginPath(); ctx.ellipse(x, y, T * (w || 0.36), T * 0.12, 0, 0, 7); ctx.fill(); }
  function poseOf(o, time) {
    var act = o.act || 'idle';
    if (o.down) return { pose: 'down', expr: 'tired', frame: 0 };
    if (o.dodge > 0) return { pose: 'retreat', expr: 'surprised' };
    if (act === 'attack') return { pose: 'attack', expr: 'serious', frame: 1 };
    if (act === 'rescue') return { pose: 'rescue' };
    if (act === 'search') return { pose: 'search' };
    if (act === 'walk' || act === 'retreat' || o.moving) return { pose: 'walk', frame: Math.floor(time * 7) % 4 };
    return { pose: 'stand' };
  }
  function drawPerson(st, who, o, defFn, time) {
    var T = cam.T, c = W2S(o.x, o.y), hp = T * 1.6;
    shadowAt(c.x, c.y, T);
    var ps = poseOf(o, time);
    var yaw = o.down ? -20 : R.yawFor(o.face || { x: 0, y: 1 });
    if (o.hurtT > 0 && !o.down) ps.expr = 'surprised';
    var spr = R.sprite(who, defFn, { yaw: yaw, pose: ps.pose, frame: ps.frame, expr: ps.expr }, hp);
    if (spr) {
      var a = 1;
      if (who === 'player' && o.inv > 0 && o.dodge <= 0) a = (Math.floor(time * 20) % 2) ? 0.55 : 1;
      ctx.globalAlpha = a;
      ctx.drawImage(spr.cv, c.x - spr.w / 2, c.y - spr.ay, spr.w, spr.h);
      ctx.globalAlpha = 1;
    }
    // 相棒の頭の上：いまの行動
    if (who === 'partner' && !o.down && o.dec && o.dec.act !== 'follow') {
      var ic = { attack: '👊', rescue: '🤝', search: '🔍', retreat: '🛡️' }[o.dec.act];
      if (ic) { ctx.font = Math.round(T * 0.34) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(c.x + T * 0.45, c.y - T * 1.55, T * 0.24, 0, 7); ctx.fill(); ctx.fillText(ic, c.x + T * 0.45, c.y - T * 1.53); }
    }
    if (o.down) { ctx.fillStyle = '#f5c542'; for (var i = 0; i < 3; i++) { var a2 = time * 3 + i * 2.1; star(c.x + Math.cos(a2) * T * 0.35, c.y - T * 1.05 + Math.sin(a2) * T * 0.1, 4); } }
    // 名前の札（相棒）
    if (who === 'partner') { ctx.font = '700 11px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; var nm = st.partner.name; var w = ctx.measureText(nm).width + 10; ctx.fillStyle = 'rgba(47,74,106,.85)'; ctx.fillRect(c.x - w / 2, c.y + 4, w, 15); ctx.fillStyle = '#fff'; ctx.fillText(nm, c.x, c.y + 12); }
  }
  function charDefFn(id) { return function () { var c = CH.BY_ID[id]; return c ? c.art : CH.playerArt(); }; }
  function drawAlly(st, a, time) {
    var T = cam.T, c = W2S(a.x, a.y);
    shadowAt(c.x, c.y, T);
    var o = a.state === 'down' ? { yaw: a.x < 6 ? 30 : -30, pose: 'down', expr: 'tired' } : (a.state === 'up' ? { yaw: 0, pose: 'cheer', expr: 'happy' } : { yaw: 0, pose: 'walk', frame: Math.floor(time * 7) % 4 });
    var spr = R.sprite('c:' + a.charId, charDefFn(a.charId), o, T * 1.6);
    if (spr) { ctx.globalAlpha = a.state === 'leaving' ? Math.max(0, 1 - (a.leaveA || 0)) : 1; ctx.drawImage(spr.cv, c.x - spr.w / 2, c.y - spr.ay, spr.w, spr.h); ctx.globalAlpha = 1; }
    if (a.state === 'down') { // 待てる時間
      var w = T * 0.8, k = a.patience;
      ctx.fillStyle = 'rgba(59,42,32,.7)'; ctx.fillRect(c.x - w / 2 - 1, c.y + 5, w + 2, 7);
      ctx.fillStyle = k > 0.5 ? '#6ab04a' : (k > 0.25 ? '#d8a63a' : '#c8452c'); ctx.fillRect(c.x - w / 2, c.y + 6, w * k, 5);
      if (a.threat) { ctx.fillStyle = '#c8452c'; ctx.font = '900 ' + Math.round(T * 0.4) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('！', c.x - T * 0.45, c.y - T * 1.2); }
    }
  }
  function drawEscort(st, e, time) {
    var T = cam.T, c = W2S(e.x, e.y);
    shadowAt(c.x, c.y, T);
    var o = e.moving ? { yaw: R.yawFor(e.face || { x: 0, y: -1 }), pose: 'walk', frame: Math.floor(time * 6) % 4 } : { yaw: 0, pose: e.state === 'scared' ? 'surprised' : 'stand', expr: e.state === 'scared' ? 'surprised' : undefined };
    var spr = R.sprite('c:' + e.charId, charDefFn(e.charId), o, T * 1.6);
    if (spr) ctx.drawImage(spr.cv, c.x - spr.w / 2, c.y - spr.ay, spr.w, spr.h);
    // 荷物と安心
    ctx.fillStyle = '#e8d8b0'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2; ctx.fillRect(c.x + T * 0.2, c.y - T * 0.7, T * 0.3, T * 0.22); ctx.strokeRect(c.x + T * 0.2, c.y - T * 0.7, T * 0.3, T * 0.22);
    var w = T * 0.9, k = e.relief / 100;
    ctx.fillStyle = 'rgba(59,42,32,.7)'; ctx.fillRect(c.x - w / 2 - 1, c.y + 5, w + 2, 7);
    ctx.fillStyle = k > 0.5 ? '#e07a9a' : '#c8452c'; ctx.fillRect(c.x - w / 2, c.y + 6, w * k, 5);
    if (e.state === 'wait') { ctx.font = '700 10px ' + FONT; ctx.fillStyle = '#3b2a20'; ctx.textAlign = 'center'; ctx.fillText('待ってる', c.x, c.y + 22); }
  }

  /* ---- からくり ---- */
  function drawEnemy(e, time) {
    var T = cam.T, c = W2S(e.x, e.y), E = D.ENEMIES[e.kind];
    var sc = e.boss ? (e.kind === 'daikarakuri' ? 1.9 : 1.55) : 1;
    var bob = e.active ? Math.abs(Math.sin(time * 6 + e.x)) * 3 : 0;
    shadowAt(c.x, c.y, T, 0.36 * sc);
    ctx.save(); ctx.translate(c.x, c.y - bob); ctx.scale(sc, sc);
    var u = T / 48;
    var wood = e.kind === 'archer' ? '#9a6a3a' : (e.boss ? '#8a5a30' : '#c99a5e'), wood2 = e.boss ? '#6a4020' : '#a87a44';
    if (e.hurtT > 0) wood = '#f0d0b0';
    ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2.4 / sc;
    if (e.dummy) { // 稽古用の木人（動かない）
      ctx.fillStyle = '#8a5a30'; ctx.fillRect(-4 * u, -40 * u, 8 * u, 40 * u); ctx.strokeRect(-4 * u, -40 * u, 8 * u, 40 * u);
      ctx.fillStyle = wood; rr(-14 * u, -64 * u, 28 * u, 30 * u, 8 * u); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -72 * u, 11 * u, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c8452c'; ctx.beginPath(); ctx.moveTo(-6 * u, -50 * u); ctx.lineTo(6 * u, -50 * u); ctx.moveTo(0, -56 * u); ctx.lineTo(0, -44 * u); ctx.stroke();
      ctx.restore(); hpBar(e, c, T * sc); return;
    }
    // ばね足
    ctx.strokeStyle = '#5a5a60'; ctx.lineWidth = 3 * u;
    ctx.beginPath(); for (var i = 0; i < 5; i++) { ctx.lineTo((i % 2 ? 5 : -5) * u, -i * 3 * u); } ctx.stroke();
    ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2.4 / sc;
    // 胴
    ctx.fillStyle = wood; rr(-15 * u, -46 * u, 30 * u, 34 * u, 9 * u); ctx.fill(); ctx.stroke();
    ctx.fillStyle = wood2; ctx.fillRect(-15 * u, -30 * u, 30 * u, 4 * u);
    // 腕（ため中は上へ）
    var up = e.wind > 0 ? -18 : 0;
    ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 6 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14 * u, -38 * u); ctx.lineTo(-24 * u, (-26 + up) * u); ctx.moveTo(14 * u, -38 * u); ctx.lineTo(24 * u, (-26 + up) * u); ctx.stroke();
    ctx.strokeStyle = wood; ctx.lineWidth = 3.6 * u;
    ctx.beginPath(); ctx.moveTo(-14 * u, -38 * u); ctx.lineTo(-24 * u, (-26 + up) * u); ctx.moveTo(14 * u, -38 * u); ctx.lineTo(24 * u, (-26 + up) * u); ctx.stroke();
    ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2.4 / sc;
    // 頭
    ctx.fillStyle = e.boss ? '#b8863a' : '#d9ad72'; ctx.beginPath(); ctx.arc(0, -58 * u, 13 * u, 0, 7); ctx.fill(); ctx.stroke();
    if (e.boss) { ctx.fillStyle = '#d8a63a'; ctx.beginPath(); ctx.moveTo(-16 * u, -62 * u); ctx.lineTo(-22 * u, -80 * u); ctx.lineTo(-8 * u, -68 * u); ctx.lineTo(0, -76 * u); ctx.lineTo(8 * u, -68 * u); ctx.lineTo(22 * u, -80 * u); ctx.lineTo(16 * u, -62 * u); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    if (e.kind === 'archer') { ctx.strokeStyle = '#6a4020'; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(22 * u, -32 * u, 12 * u, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = '#3b2a20'; }
    // 顔
    var fx = (e.face ? e.face.x : 0) * 3 * u;
    ctx.fillStyle = '#3b2a20'; ctx.beginPath(); ctx.arc(-5 * u + fx, -60 * u, 2.2 * u, 0, 7); ctx.arc(5 * u + fx, -60 * u, 2.2 * u, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4 * u + fx, -53 * u); ctx.lineTo(4 * u + fx, -53 * u); ctx.stroke();
    ctx.restore();
    if (e.wind > 0) { ctx.fillStyle = '#c8452c'; ctx.font = '900 ' + Math.round(T * 0.42) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('！', c.x, c.y - T * 1.45 * sc); }
    if (!e.active && !e.dummy) { ctx.fillStyle = 'rgba(59,42,32,.7)'; ctx.font = '700 ' + Math.round(T * 0.26) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.fillText('zz', c.x + T * 0.3, c.y - T * 1.3 * sc); }
    if (!e.boss) hpBar(e, c, T * sc);
  }
  function hpBar(e, c, T) {
    if (e.hp >= e.max) return;
    var w = T * 0.7; ctx.fillStyle = 'rgba(59,42,32,.7)'; ctx.fillRect(c.x - w / 2 - 1, c.y + 4, w + 2, 6);
    ctx.fillStyle = '#c8452c'; ctx.fillRect(c.x - w / 2, c.y + 5, w * e.hp / e.max, 4);
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }

  /* ---- 効果 ---- */
  function drawFx(f, age, T) {
    var c = W2S(f.x, f.y);
    switch (f.kind) {
      case 'slash':
        if (age > 0.25) return;
        ctx.strokeStyle = f.from === 'partner' ? 'rgba(80,150,230,' + (1 - age * 4) + ')' : 'rgba(255,240,180,' + (1 - age * 4) + ')'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(c.x, c.y - T * 0.6, T * (0.4 + age), -2.4, -0.6); ctx.stroke(); return;
      case 'dmg':
        if (age > 0.8) return;
        ctx.font = '900 ' + Math.round(T * 0.34) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#fff';
        ctx.fillStyle = f.hz ? '#8a5aa8' : '#c8452c';
        ctx.strokeText('-' + f.n, c.x, c.y - T * (1.5 + age)); ctx.fillText('-' + f.n, c.x, c.y - T * (1.5 + age)); return;
      case 'miss':
        if (age > 0.6) return; ctx.font = '700 12px ' + FONT; ctx.fillStyle = '#3a8ac8'; ctx.textAlign = 'center'; ctx.fillText('よけた！', c.x, c.y - T * (1.6 + age)); return;
      case 'pop':
        if (age > 0.7) return;
        ctx.fillStyle = '#b8864a'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 1.5;
        for (var i = 0; i < (f.big ? 10 : 6); i++) { var a = i * 1.1 + f.id, d = age * T * 2.2; ctx.save(); ctx.translate(c.x + Math.cos(a) * d, c.y - T * 0.6 + Math.sin(a) * d * 0.7 + age * age * T * 2); ctx.rotate(a + age * 8); ctx.fillRect(-5, -2, 10, 4); ctx.strokeRect(-5, -2, 10, 4); ctx.restore(); }
        if (age < 0.4) { ctx.font = '900 ' + Math.round(T * 0.3) + 'px ' + FONT; ctx.fillStyle = '#3b2a20'; ctx.textAlign = 'center'; ctx.fillText(f.big ? 'ガッシャーン！' : 'カラン', c.x, c.y - T * 1.4); }
        return;
      case 'revive':
        if (age > 1) return; ctx.fillStyle = 'rgba(255,230,120,' + (1 - age) + ')';
        for (var j = 0; j < 5; j++) star(c.x + Math.cos(j * 1.3) * T * 0.5, c.y - T * (0.8 + age) + Math.sin(j * 2) * 6, 5);
        return;
      case 'coin':
        if (age > 1) return; ctx.font = '700 ' + Math.round(T * 0.3) + 'px ' + FONT; ctx.fillStyle = '#b8862a'; ctx.textAlign = 'center'; ctx.fillText('🎴 +5', c.x, c.y - T * (1 + age * 0.8)); return;
      case 'scroll':
        if (age > 1.4) return; ctx.font = '700 ' + Math.round(T * 0.32) + 'px ' + FONT; ctx.fillStyle = '#2f4a6a'; ctx.textAlign = 'center'; ctx.fillText('📜 巻物！', c.x, c.y - T * (1 + age * 0.6)); return;
      case 'leaf':
        if (age > 0.8) return; ctx.font = '700 12px ' + FONT; ctx.fillStyle = '#4f7a3d'; ctx.textAlign = 'center'; ctx.fillText('はずれ', c.x, c.y - T * (1 + age)); return;
      case 'wake':
        if (age > 0.5) return; ctx.font = '900 ' + Math.round(T * 0.4) + 'px ' + FONT; ctx.fillStyle = '#c8452c'; ctx.textAlign = 'center'; ctx.fillText('！', c.x, c.y - T * (1.5 + age)); return;
      case 'slam':
        if (age > 0.4) return; ctx.strokeStyle = 'rgba(200,70,40,' + (1 - age * 2.5) + ')'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(c.x, c.y, f.r * T * (0.6 + age), f.r * T * 0.8 * (0.6 + age), 0, 0, 7); ctx.stroke(); return;
      case 'dash':
        if (age > 0.3) return; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - age * 3) + ')'; ctx.lineWidth = 3; for (var k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(c.x - 16, c.y - 10 - k * 8); ctx.lineTo(c.x + 16, c.y - 10 - k * 8); ctx.stroke(); } return;
      case 'cmd':
        if (age > 1) return; ctx.font = Math.round(T * 0.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.globalAlpha = 1 - age; ctx.fillText({ gather: '👣', help: '🙏', back: '🛡️' }[f.cmd] || '！', c.x, c.y - T * (1.9 + age * 0.4)); ctx.globalAlpha = 1; return;
      case 'bonk': case 'scare':
        if (age > 0.4) return; ctx.fillStyle = 'rgba(255,255,255,.9)'; star(c.x, c.y - T * 0.9, 8 * (1 - age)); return;
      case 'gate':
        if (age > 1.2) return; ctx.font = '900 ' + Math.round(T * 0.36) + 'px ' + FONT; ctx.fillStyle = '#c8452c'; ctx.textAlign = 'center'; ctx.globalAlpha = 1 - age / 1.2; ctx.fillText('門がひらいた！', c.x, c.y - T * (0.8 + age)); ctx.globalAlpha = 1; return;
      case 'puff':
        if (age > 0.3) return; ctx.fillStyle = 'rgba(255,255,255,' + (1 - age * 3) + ')'; ctx.beginPath(); ctx.arc(c.x, c.y - T * 0.35, 8 + age * 20, 0, 7); ctx.fill(); return;
    }
  }
  function bubble(x, y, text, bg, T) {
    ctx.font = '700 12px ' + FONT;
    var lines = wrap(text, 12), w = 0;
    lines.forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
    w += 14; var h = lines.length * 15 + 8;
    x = Math.max(w / 2 + 4, Math.min(VW - w / 2 - 4, x));
    ctx.fillStyle = bg; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2;
    rr(x - w / 2, y - h, w, h, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x, y + 6); ctx.lineTo(x + 5, y - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3b2a20'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach(function (l, i) { ctx.fillText(l, x, y - h + 11 + i * 15); });
  }
  function wrap(t, n) { var out = []; t = String(t); while (t.length > n) { out.push(t.slice(0, n)); t = t.slice(n); } if (t) out.push(t); return out.slice(0, 4); }

  /* ================= 道場（ホーム） ================= */
  // s: { partnerDef, masterId, visitors:[id], wall, floor, deco, pose, time, talk }
  R.drawDojo = function (s) {
    var time = s.time, i;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var floorY = VH * 0.58;
    // 壁
    var g = ctx.createLinearGradient(0, 0, 0, floorY);
    g.addColorStop(0, '#8a6440'); g.addColorStop(1, '#a87a4e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, floorY);
    ctx.fillStyle = 'rgba(60,40,20,.25)';
    for (var x = 0; x < VW; x += 46) ctx.fillRect(x, 0, 3, floorY);
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(0, floorY - 14, VW, 14); ctx.fillRect(0, VH * 0.1, VW, 10);
    // 障子（外の里）
    var sw = Math.min(170, VW * 0.26), sh = floorY * 0.42, sy = floorY * 0.28;
    [VW * 0.04, VW * 0.96 - sw].forEach(function (sx) {
      ctx.fillStyle = '#bfe0f0'; ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#7ab050'; ctx.beginPath(); ctx.ellipse(sx + sw * 0.3, sy + sh, sw * 0.4, sh * 0.35, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#5a9040'; ctx.beginPath(); ctx.ellipse(sx + sw * 0.8, sy + sh, sw * 0.35, sh * 0.25, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 3; ctx.strokeRect(sx, sy, sw, sh);
      ctx.lineWidth = 1.5; for (var i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx + sw * i / 4, sy); ctx.lineTo(sx + sw * i / 4, sy + sh); ctx.stroke(); }
      for (i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(sx, sy + sh * i / 3); ctx.lineTo(sx + sw, sy + sh * i / 3); ctx.stroke(); }
    });
    // 掛け軸
    var kw = Math.min(90, VW * 0.16), kh = floorY * 0.55, kx = VW / 2 - kw / 2, ky = floorY * 0.2;
    ctx.fillStyle = '#6a4a8a'; ctx.fillRect(kx - 6, ky - 8, kw + 12, kh + 16);
    ctx.fillStyle = '#f7f0dc'; ctx.fillRect(kx, ky, kw, kh);
    ctx.fillStyle = '#3b2a20'; ctx.font = '900 ' + Math.round(kw * 0.42) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var txt = s.wallText || '修行';
    for (i = 0; i < txt.length; i++) ctx.fillText(txt[i], VW / 2, ky + kh * (0.3 + i * 0.36));
    // 床
    var fc = s.floorColor || '#d8c890';
    ctx.fillStyle = fc; ctx.fillRect(0, floorY, VW, VH - floorY);
    ctx.strokeStyle = 'rgba(60,40,20,.25)'; ctx.lineWidth = 2;
    for (var y = floorY + 30; y < VH; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }
    for (x = (time * 0) % 90; x < VW; x += 90) { ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x - 40, VH); ctx.stroke(); }
    // 置物
    if (s.deco) drawDeco(s.deco, VW * 0.14, floorY + 30, time);
    // 人
    var ph = Math.min(VH * 0.36, VW * 0.5), px = VW * 0.5, py = floorY + ph * 0.62;
    var mh = ph * 0.82, mx = Math.min(VW * 0.82, px + ph * 0.75), my = floorY + mh * 0.45;
    // 訪れた忍者（うしろ）
    (s.visitors || []).forEach(function (id, i) {
      var vx = VW * (0.2 + i * 0.13), vy = floorY + mh * 0.2;
      shadowAt2(vx, vy, mh * 0.25);
      var spr = R.sprite('c:' + id, charDefFn(id), { yaw: i ? -30 : 30, pose: 'stand' }, mh * 0.7);
      if (spr) ctx.drawImage(spr.cv, vx - spr.w / 2, vy - spr.ay, spr.w, spr.h);
    });
    if (s.masterId) {
      shadowAt2(mx, my, mh * 0.3);
      var mspr = R.sprite('c:' + s.masterId, charDefFn(s.masterId), { yaw: -40, pose: 'stand' }, mh);
      if (mspr) ctx.drawImage(mspr.cv, mx - mspr.w / 2, my - mspr.ay, mspr.w, mspr.h);
    }
    shadowAt2(px, py, ph * 0.3);
    var bob = Math.sin(time * 2) * 2;
    var pose = s.pose || 'stand', frame = 0, expr;
    if (s.happyT > time) { pose = 'cheer'; expr = 'happy'; }
    var pspr = R.sprite('partner', s.partnerDef, { yaw: 0, pose: pose, frame: frame, expr: expr }, ph);
    if (pspr) ctx.drawImage(pspr.cv, px - pspr.w / 2, py - pspr.ay + bob, pspr.w, pspr.h);
    R.partnerRect = { x: px - ph * 0.35, y: py - ph, w: ph * 0.7, h: ph };
    if (s.talk && s.talk.until > time) bubble(px, py - ph * 0.95, s.talk.text, '#eaf2fb', 48);
  };
  function shadowAt2(x, y, w) { ctx.fillStyle = 'rgba(40,30,20,.22)'; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.25, 0, 0, 7); ctx.fill(); }
  function drawDeco(id, x, y, time) {
    ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 2.5;
    if (id === 'deco_bonsai') { ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 26, y - 16, 52, 16); ctx.strokeRect(x - 26, y - 16, 52, 16); ctx.fillStyle = '#5a8a3a'; ctx.beginPath(); ctx.ellipse(x - 8, y - 40, 26, 14, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x + 16, y - 52, 18, 10, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#6a4020'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.quadraticCurveTo(x + 10, y - 30, x - 4, y - 40); ctx.stroke(); }
    else if (id === 'deco_taiko') { ctx.fillStyle = '#c8452c'; ctx.beginPath(); ctx.ellipse(x, y - 34, 30, 30, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#f0e0c0'; ctx.beginPath(); ctx.ellipse(x, y - 34, 22, 22, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#6a4020'; ctx.fillRect(x - 32, y - 4, 64, 6); }
    else if (id === 'deco_mokujin') { ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 4, y - 70, 8, 70); ctx.strokeRect(x - 4, y - 70, 8, 70); ctx.fillStyle = '#c99a5e'; ctx.fillRect(x - 12, y - 64, 24, 30); ctx.strokeRect(x - 12, y - 64, 24, 30); ctx.fillRect(x - 26, y - 56, 52, 6); ctx.strokeRect(x - 26, y - 56, 52, 6); ctx.beginPath(); ctx.arc(x, y - 76, 10, 0, 7); ctx.fill(); ctx.stroke(); }
    else if (id === 'deco_chochin') { var sw = Math.sin(time * 1.5) * 3; ctx.fillStyle = '#e8c56b'; ctx.fillRect(x - 2, y - 96, 4, 20); ctx.fillStyle = '#e8503a'; ctx.beginPath(); ctx.ellipse(x + sw, y - 58, 20, 26, 0, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,220,120,.35)'; ctx.beginPath(); ctx.arc(x + sw, y - 58, 40, 0, 7); ctx.fill(); }
  }

  /* ================= 振り返りの小さな図 ================= */
  R.mini = function (canvas, lesson) {
    var s = lesson.snap; if (!s) return;
    var c = canvas.getContext('2d'), dpr = Math.min(2, root.devicePixelRatio || 1), W = 132, H = 132;
    canvas.width = W * dpr; canvas.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var t = Math.min(W / 12, H / s.h);
    var ox = (W - 12 * t) / 2, oy = (H - s.h * t) / 2;
    c.fillStyle = '#cfe3a8'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#9bc467'; c.fillRect(ox + t, oy, 10 * t, s.h * t);
    c.fillStyle = '#6a9040'; c.fillRect(ox, oy, t, s.h * t); c.fillRect(ox + 11 * t, oy, t, s.h * t);
    (s.haz || []).forEach(function (h) { c.fillStyle = 'rgba(130,90,160,.55)'; c.fillRect(ox + h[0] * t, oy + h[1] * t, t, t); });
    (s.blocks || []).forEach(function (b) { c.fillStyle = '#8a8a90'; c.fillRect(ox + b[0] * t + 1, oy + b[1] * t + 1, t - 2, t - 2); });
    var tgt = null;
    s.items.forEach(function (it) {
      var x = ox + it.x * t, y = oy + it.y * t;
      if (it.id === lesson.chosen.target) tgt = { x: x, y: y };
      if (it.k === 'ally') { c.fillStyle = '#f0a040'; c.beginPath(); c.arc(x, y, t * 0.45, 0, 7); c.fill(); c.fillStyle = '#fff'; c.font = '900 ' + Math.round(t * 0.7) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', x, y + 1); }
      else if (it.k === 'chest') { c.fillStyle = '#b8763a'; c.fillRect(x - t * 0.4, y - t * 0.3, t * 0.8, t * 0.6); }
      else if (it.k === 'grass') { c.fillStyle = '#3f7a2a'; c.beginPath(); c.moveTo(x - t * 0.4, y + t * 0.3); c.lineTo(x, y - t * 0.4); c.lineTo(x + t * 0.4, y + t * 0.3); c.fill(); }
      else { c.fillStyle = it.k === 'boss' ? '#8a5a30' : '#c99a5e'; c.strokeStyle = '#3b2a20'; c.lineWidth = 1; c.beginPath(); c.arc(x, y, t * (it.k === 'boss' ? 0.6 : 0.4), 0, 7); c.fill(); c.stroke(); }
    });
    var me = { x: ox + s.me.x * t, y: oy + s.me.y * t }, pl = { x: ox + s.pl.x * t, y: oy + s.pl.y * t };
    if (lesson.chosen.target === 'player') tgt = pl;
    if (tgt) { c.strokeStyle = '#2f4a6a'; c.lineWidth = 2.5; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(me.x, me.y); c.lineTo(tgt.x, tgt.y); c.stroke(); c.setLineDash([]); c.fillStyle = '#2f4a6a'; var a = Math.atan2(tgt.y - me.y, tgt.x - me.x); c.beginPath(); c.moveTo(tgt.x, tgt.y); c.lineTo(tgt.x - Math.cos(a - 0.5) * 8, tgt.y - Math.sin(a - 0.5) * 8); c.lineTo(tgt.x - Math.cos(a + 0.5) * 8, tgt.y - Math.sin(a + 0.5) * 8); c.fill(); }
    c.fillStyle = '#5a6478'; c.beginPath(); c.arc(pl.x, pl.y, t * 0.42, 0, 7); c.fill();
    c.fillStyle = '#3a8ac8'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(me.x, me.y, t * 0.5, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.font = '700 ' + Math.round(t * 0.6) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('相', me.x, me.y + 1);
  };

  /* ================= 記念写真 ================= */
  // o: { partnerDef, partnerName, playerDef, masterId, guestId, title, sub, date, level, tags:[], frame }
  // 写真に個人情報や、生の指示文はのせない（呼び名は選んだ名前だけ）
  R.photo = function (o, cb) {
    var W = 1200, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#fff3dc'); g.addColorStop(1, '#e8cf9e');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#a87a4e'; x.fillRect(0, 0, W, 520); x.fillStyle = 'rgba(60,40,20,.2)'; for (var i = 0; i < W; i += 60) x.fillRect(i, 0, 4, 520);
    x.fillStyle = '#d8c890'; x.fillRect(0, 520, W, H - 520);
    x.fillStyle = '#6a4a8a'; x.fillRect(W / 2 - 70, 60, 140, 300); x.fillStyle = '#f7f0dc'; x.fillRect(W / 2 - 58, 72, 116, 276);
    x.fillStyle = '#3b2a20'; x.font = '900 64px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('相', W / 2, 150); x.fillText('棒', W / 2, 250);
    var ppl = [];
    if (o.masterId) ppl.push({ def: CH.BY_ID[o.masterId].art, x: 930, h: 470, yaw: -30 });
    if (o.guestId && CH.BY_ID[o.guestId]) ppl.push({ def: CH.BY_ID[o.guestId].art, x: 250, h: 420, yaw: 30 });
    ppl.push({ def: o.playerDef, x: 430, h: 470, yaw: 20, pose: 'wave' });
    ppl.push({ def: o.partnerDef, x: 640, h: 560, yaw: -10, pose: o.pose || 'cheer', expr: 'happy', fx: 'cheer' });
    var n = ppl.length, done = 0;
    var imgs = [];
    ppl.forEach(function (p, k) {
      var svg = A.render(p.def, { yaw: p.yaw, pose: p.pose || 'stand', expr: p.expr, fx: p.fx, viewBox: VB, w: Math.round(p.h * 200 / 240), h: Math.round(p.h * (240 + TOPPAD) / 240), shadow: true, prop: p.pose ? false : undefined });
      var im = new Image(); imgs[k] = im;
      im.onload = im.onerror = function () { if (++done === n) finish(); };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    function finish() {
      ppl.forEach(function (p, k) { var w = p.h * 200 / 240; try { x.drawImage(imgs[k], p.x - w / 2, 800 - p.h * (232 + TOPPAD) / 240, w, p.h * (240 + TOPPAD) / 240); } catch (e) { } });
      // 額
      var fcol = o.frame === 'gold' ? '#d8a63a' : (o.frame === 'kaiden' ? '#8e2432' : '#5a3a22');
      x.lineWidth = 26; x.strokeStyle = fcol; x.strokeRect(13, 13, W - 26, H - 26);
      x.lineWidth = 3; x.strokeStyle = '#3b2a20'; x.strokeRect(28, 28, W - 56, H - 56);
      x.fillStyle = 'rgba(255,250,240,.93)'; x.fillRect(40, 40, 520, 112); x.strokeRect(40, 40, 520, 112);
      x.fillStyle = '#3b2a20'; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      x.font = '900 40px ' + FONT; x.fillText(o.title || '修行の記念', 60, 92);
      x.font = '700 24px ' + FONT; x.fillText(o.sub || '', 60, 132);
      x.fillStyle = 'rgba(255,250,240,.93)'; x.fillRect(40, 800, W - 80, 64); x.strokeRect(40, 800, W - 80, 64);
      x.fillStyle = '#3b2a20'; x.font = '700 26px ' + FONT; x.fillText(o.partnerName + '（Lv' + o.level + '）' + (o.tags && o.tags.length ? '　' + o.tags.join('・') : ''), 60, 842);
      x.textAlign = 'right'; x.font = '500 20px ' + FONT; x.fillText((o.date || '') + '　ニンジャ相棒道場', W - 60, 842);
      if (o.frame === 'kaiden') { x.fillStyle = '#8e2432'; x.textAlign = 'center'; x.font = '900 34px ' + FONT; x.fillText('免許皆伝', W - 180, 110); }
      cb(c);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
