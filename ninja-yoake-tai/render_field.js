/* ニンジャ夜明け隊（RPG） — フィールドの描画（萌え絵風のなめらかな絵。DESIGN.md §11.3）
 * 世界の単位（1マス = 32）のまま、画面のキャンバスに「拡大率×dpr」をかけて直接描く（ぼかしたドットにしない）。
 * 地面（1枚の絵）→ 木・建物・人・妖怪を「下にあるものほど手前」に並べて描く → 吹き出し → 夜の暗さと明かり。
 * 空の明るさは、取り戻した暁のかけらの数で変わる。
 */
(function (root) {
  'use strict';
  var DW = root.NYT_DRAW, YK = root.NYT_YOKAI, SPR = root.NYT_SPRITES, FD = root.NYT_FIELD, PT = root.NYT_PAINT;
  var T = 32;
  var R = { cv: null, c: null, dpr: 1, vw: 0, vh: 0, zoom: 2, s: 2, Sd: 2, cam: { x: 0, y: 0 }, ox: 0, oy: 0, F: null, ground: null, gG: 2, tall: [], bw: 0, bh: 0, light: null, t: 0, fx: [] };

  function init(cv) { R.cv = cv; R.c = cv.getContext('2d'); resize(); }
  function resize() {
    R.dpr = Math.min(3, root.devicePixelRatio || 1);
    R.vw = root.innerWidth; R.vh = root.innerHeight;
    R.cv.width = Math.round(R.vw * R.dpr); R.cv.height = Math.round(R.vh * R.dpr);
    R.cv.style.width = R.vw + 'px'; R.cv.style.height = R.vh + 'px';
    fitZoom();
  }
  // 1単位を画面の何画素で描くか（整数でなくてよい）。縦長の画面で横に約11マス、横長で縦に約9.5マス。地図が小さいときは寄る
  function fitZoom() {
    var short = Math.min(R.vw, R.vh);
    var z = Math.max(1, Math.min(2.6, short / (T * (R.vw < R.vh ? 11 : 9.5))));
    var sd = z * R.dpr;
    if (R.F) sd = Math.max(sd, R.cv.width / (R.F.w * T), R.cv.height / (R.F.h * T));
    R.Sd = sd; R.zoom = sd / R.dpr; R.s = R.zoom;
    R.bw = R.cv.width / sd; R.bh = R.cv.height / sd;   // 画面に見える広さ（単位）
  }
  function setMap(F) {
    R.F = F; fitZoom();
    R.gG = DW.groundScale(F, R.Sd);
    R.ground = DW.buildGround(F, R.gG);
    R.water = [];
    // 背の高いマス（木・松・竹・桜）と、動く水のマス
    R.tall = [];
    for (var y = 0; y < F.h; y++) for (var x = 0; x < F.w; x++) {
      var ch = F.tiles[y * F.w + x];
      if (ch === 'T' || ch === 'Y' || ch === 'B' || ch === 'K') R.tall.push({ kind: ch, x: x, y: y, v: (x * 7 + y * 13) % 3 });
      if (ch === '~') R.water.push(y * F.w + x);
    }
  }

  // ---- 1コマ ----
  // V: { S, F, P（主人公の位置）, party（ついてくる仲間）, t, dt, hint, emotes }
  function frame(V) {
    var F = R.F; if (!F) return;
    var c = R.c, Sd = R.Sd;
    R.t = V.t;
    // カメラ（画面の1画素にそろえる）
    var tx = (V.P.fx + 0.5) * T, ty = (V.P.fy + 0.5) * T - 8;
    var hw = R.bw / 2, hh = R.bh / 2, mw = F.w * T, mh = F.h * T;
    tx = mw <= R.bw ? mw / 2 : Math.max(hw, Math.min(mw - hw, tx));
    ty = mh <= R.bh ? mh / 2 : Math.max(hh, Math.min(mh - hh, ty));
    R.cam.x = tx; R.cam.y = ty;
    R.ox = Math.round((hw - tx) * Sd) / Sd; R.oy = Math.round((hh - ty) * Sd) / Sd;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.fillStyle = DW.voidColor(F); c.fillRect(0, 0, R.cv.width, R.cv.height);
    c.setTransform(Sd, 0, 0, Sd, R.ox * Sd, R.oy * Sd);
    // 地面（見えているところだけ）
    var gx0 = Math.max(0, Math.floor(-R.ox)), gy0 = Math.max(0, Math.floor(-R.oy)), gx1 = Math.min(mw, Math.ceil(-R.ox + R.bw)), gy1 = Math.min(mh, Math.ceil(-R.oy + R.bh)), gG = R.gG;
    if (gx1 > gx0 && gy1 > gy0) c.drawImage(R.ground, gx0 * gG, gy0 * gG, (gx1 - gx0) * gG, (gy1 - gy0) * gG, gx0, gy0, gx1 - gx0, gy1 - gy0);
    var vx0 = -R.ox - T * 2, vx1 = -R.ox + R.bw + T * 2, vy0 = -R.oy - T * 2, vy1 = -R.oy + R.bh + T * 3;
    waterSparkle(c, F, vx0, vy0, vx1, vy1);
    // 並べる（下にあるものほど手前）
    var list = [];
    R.tall.forEach(function (o) { var px = o.x * T, py = o.y * T; if (px < vx0 || px > vx1 || py < vy0 || py > vy1 + T * 2) return; list.push({ y: py + T - 1, k: 'tall', o: o }); });
    F.deco.forEach(function (d) { if (d.show && !FD.cond(V.S, d.show)) return; var px = d.x * T, py = d.y * T; if (px > vx1 || px + (d.w || 1) * T < vx0 || py > vy1 + T * 2 || py + (d.h || 1) * T < vy0 - 60) return; list.push({ y: (d.y + (d.h || 1)) * T - 2, k: 'deco', o: d }); });
    F.objs.forEach(function (o) {
      if (!o.on) return;
      if (o.k === 'exit' || o.k === 'step') return;
      var px = (o.fx != null ? o.fx : o.x) * T, py = (o.fy != null ? o.fy : o.y) * T;
      if (px < vx0 || px > vx1 || py < vy0 || py > vy1) return;
      list.push({ y: py + T - (o.k === 'pit' ? 30 : o.k === 'npc' || o.k === 'enemy' ? 4 : 3), k: o.k, o: o });
    });
    (V.party || []).forEach(function (m, i) { list.push({ y: (m.fy + 1) * T - 4 - (i + 1) * 0.01, k: 'member', o: m }); });
    if (V.P.def) list.push({ y: (V.P.fy + 1) * T - 4 + 0.02, k: 'player', o: V.P });
    list.sort(function (a, c2) { return a.y - c2.y; });
    list.forEach(function (it) { drawItem(c, it, V); });
    drawMarks(c, V);
    drawFx(c, V.dt || 0);
    // 夜と明かり・霧
    lighting(c, V);
    if (F.def.mist) mistLayer(c, V);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawItem(c, it, V) {
    var o = it.o;
    if (it.k === 'tall') { var sp = DW.tallSprite(o.kind, R.F.def.theme, o.v); c.drawImage(sp.cv, o.x * T - sp.ox, o.y * T - sp.oy, sp.w, sp.h); return; }
    if (it.k === 'deco') {
      var ds = DW.decoSprite(o);
      c.drawImage(ds.cv, o.x * T - ds.ox, o.y * T - ds.oy, ds.w, ds.h);
      if (o.kind === 'brazier') flame(c, o.x * T + 16, o.y * T + 6);
      if (o.kind === 'forge') smoke(c, o.x * T + (o.w || 1) * T - 18, o.y * T - 44);
      return;
    }
    if (it.k === 'player' || it.k === 'member') { drawChar(c, o, o.def, V); return; }
    var fx = o.fx != null ? o.fx : o.x, fy = o.fy != null ? o.fy : o.y;
    if (it.k === 'npc') {
      if (o.yokai) { var e = root.NYT_ENEMIES.ENEMIES[o.yokai]; yokai(c, e ? e.shape : o.yokai, e ? e.col : 'purple', fx, fy, o.big ? 1.25 : 0.8, 1, o.big, o.x); return; }
      drawChar(c, { fx: fx, fy: fy, dir: o.dir || 'down', walk: o.walk || 0, moving: o.moving, sleep: o.sleep }, SPR.defFor(o, V.S), V);
      return;
    }
    var px = o.x * T, py = o.y * T;
    if (it.k === 'enemy') {
      var ee = root.NYT_ENEMIES.ENEMIES[o.enemies[0]] || {};
      yokai(c, ee.shape || 'blob', ee.col, fx, fy, 0.66, o.dir === 'left' ? -1 : 1, false, o.x * 0.7);
      if (o.enemies.length > 1) { var bx = fx * T + 19, by = fy * T - 7; DW.rrect(c, bx, by, 14, 9.5, 4, 'rgba(36,28,56,.88)', 'rgba(255,214,236,.8)', 0.8); DW.text(c, '×' + o.enemies.length, bx + 7, by + 5, 7, '#ffffff'); }
      return;
    }
    if (it.k === 'chest') { DW.put(c, DW.chestSprite(o.open), px + 2, py + 6); return; }
    if (it.k === 'pickup') { sparkle(c, px + 16, py + 20, 1); return; }
    if (it.k === 'sign') { DW.put(c, DW.signSprite(), px + 3, py + 1); return; }
    if (it.k === 'pit') { PT.oval(c, px + 16, py + 17, 14, 10, '#3a3030'); PT.oval(c, px + 16, py + 17.5, 12.6, 8.8, '#0c0a0a'); return; }
    if (it.k === 'gate') { gate(c, o); return; }
    if (it.k === 'obst') { obst(c, o, V); return; }
  }

  // 忍者（地図の上）：萌え絵風の絵（高さ48単位の枠）。足もとをマスの下のほうに
  function drawChar(c, m, d, V) {
    if (!d || !d.def) return;
    var px = m.fx * T + 16, py = m.fy * T + 30;
    var yaw = SPR.YAW[m.dir] != null ? SPR.YAW[m.dir] : 0, hpx = SPR.FIELD_H * R.Sd;
    var img = m.moving ? SPR.get(d, { yaw: yaw, pose: 'walk', frame: m.walk % 4, h: hpx }) : SPR.get(d, { yaw: yaw, pose: 'stand', h: hpx });
    shadow(c, px, py, 9);
    if (img) { var h = SPR.FIELD_H, w = h * img.width / img.height; c.drawImage(img, px - w / 2, py - h * SPR.FOOT_Y, w, h); }
    if (m.sleep) { var z = Math.sin(R.t * 3) * 1.5; DW.put(c, DW.bubbleSprite('z', '#4a5a9a'), px + 6, py - 52 - z); }
  }
  function shadow(c, x, y, rx) { PT.shade(c, x, y + 0.5, rx + 1.5, 3.4, 0.36); }
  // 妖怪（ベクターのまま。ゆらゆら動く）
  function yokai(c, shape, col, fx, fy, s, dir, boss, seed) {
    var px = fx * T + 16, py = fy * T + 30;
    shadow(c, px, py, (YK.SIZE[shape] || 44) * s * 0.32);
    c.save(); c.translate(px, py);
    YK.draw(c, shape, col, { t: R.t + (seed || 0), s: s, dir: dir, boss: boss, shadow: false });
    c.restore();
  }
  // きらり（4つの光の先）
  function sparkle(c, x, y, a) {
    var k = (Math.sin(R.t * 6) + 1) / 2, s = 2.2 + k * 2.4;
    c.save(); c.globalAlpha = 0.92 * a; c.fillStyle = '#fff3b8';
    c.beginPath(); c.moveTo(x, y - s * 1.7); c.quadraticCurveTo(x, y, x + s * 1.7, y); c.quadraticCurveTo(x, y, x, y + s * 1.7); c.quadraticCurveTo(x, y, x - s * 1.7, y); c.quadraticCurveTo(x, y, x, y - s * 1.7); c.fill();
    PT.oval(c, x, y, 1.1, 1.1, '#ffffff');
    if (k > 0.7) PT.oval(c, x + 5, y - 4.5, 0.9, 0.9, '#ffffff');
    c.restore();
  }
  function gate(c, o) {
    var px = o.x * T, py = o.y * T, w = (o.w || 1) * T;
    if (R.F.def.theme === 'under') {
      var a = 0.45 + Math.sin(R.t * 3) * 0.15;
      c.fillStyle = 'rgba(170,110,255,' + a + ')'; DW.rrect(c, px, py - 10, w, T + 6, 6, 'rgba(170,110,255,' + a + ')');
      c.save(); c.beginPath(); c.rect(px, py - 10, w, T + 6); c.clip();
      c.strokeStyle = 'rgba(240,210,255,.75)'; c.lineWidth = 1;
      for (var i = -T; i < w + T; i += 7) { var off = (R.t * 8) % 7; c.beginPath(); c.moveTo(px + i + off, py - 10); c.lineTo(px + i + off + 12, py + T - 4); c.stroke(); }
      c.restore();
      return;
    }
    DW.put(c, DW.barrierSprite(o.w || 1, false), px, py);
  }
  function obst(c, o, V) {
    var px = o.x * T, py = o.y * T;
    if (o.kind === 'boulder') { DW.put(c, DW.boulderSprite(), px, py - 2); if (FD.hasAbility(V.S, 'push')) sparkle(c, px + 26, py + 2, 0.7); return; }
    if (o.kind === 'fog') {
      for (var i = 0; i < 4; i++) { var a = R.t * 0.8 + i * 1.7 + o.y; PT.oval(c, px + 16 + Math.sin(a) * 6, py + 8 + i * 6 + Math.cos(a) * 2, 13 - i * 2, 7, i % 2 ? 'rgba(236,240,250,.85)' : 'rgba(250,252,255,.8)'); }
      return;
    }
    if (o.kind === 'crack') { DW.put(c, DW.crackSprite(), px, py); return; }
    if (o.kind === 'hidden') { if (FD.hasAbility(V.S, 'hawk')) sparkle(c, px + 16, py + 16, 0.5 + Math.sin(R.t * 3 + o.x) * 0.3); return; }
  }
  function flame(c, x, y) {
    var k = Math.sin(R.t * 12) * 1.5;
    PT.poly(c, [[x - 6, y], [x - 4.5, y - 7], [x - 1, y - 13 - k], [x + 2, y - 8], [x + 5, y - 11 + k], [x + 6, y]], '#e8501a');
    PT.poly(c, [[x - 4, y], [x - 2, y - 5], [x, y - 9 - k], [x + 2, y - 5], [x + 4, y]], '#ffa030');
    PT.poly(c, [[x - 2, y], [x, y - 5], [x + 2, y]], '#fff0a0');
  }
  function smoke(c, x, y) {
    for (var i = 0; i < 3; i++) { var k = (R.t * 0.6 + i / 3) % 1; PT.oval(c, x + Math.sin(k * 6 + i) * 3, y - k * 26, 3 + k * 4, 2 + k * 3, 'rgba(200,196,190,' + (0.6 * (1 - k)).toFixed(2) + ')'); }
  }

  // 調べられる物の上の「！」、人の吹き出し
  function drawMarks(c, V) {
    var h = V.hint;
    if (h && h.x != null) { var bob = Math.sin(R.t * 5) * 1.5; DW.put(c, DW.bubbleSprite(h.icon || '！'), h.x * T + 7, h.y * T - 25 - bob); }
    (V.emotes || []).forEach(function (e) { var up = Math.min(1, e.t * 6) * 4; DW.put(c, DW.bubbleSprite(e.e), e.x * T + 7, e.y * T - 33 - up); });
  }
  function addFx(f) { f.age = 0; R.fx.push(f); }
  function drawFx(c, dt) {
    R.fx = R.fx.filter(function (f) { f.age += dt; return f.age < (f.dur || 0.8); });
    R.fx.forEach(function (f) {
      var k = f.age / (f.dur || 0.8);
      if (f.kind === 'smoke') { for (var i = 0; i < 6; i++) { var a = i * 1.05; PT.oval(c, f.x + Math.cos(a) * 14 * k, f.y + Math.sin(a) * 10 * k - 10 * k, 8 * (1 - k * 0.6), 6 * (1 - k * 0.6), 'rgba(240,240,240,' + (0.85 * (1 - k)).toFixed(2) + ')'); } }
      if (f.kind === 'wind') { for (var j = 0; j < 4; j++) { var wx = f.x + (k - 0.5) * 60, wy = f.y - 10 + j * 7; PT.line(c, [[wx - 10, wy], [wx + 4, wy]], 'rgba(200,255,230,' + (1 - k).toFixed(2) + ')', 1.2); PT.line(c, [[wx + 6, wy - 1], [wx + 9, wy - 1]], 'rgba(200,255,230,' + (1 - k).toFixed(2) + ')', 1.2); } }
      if (f.kind === 'boom') { PT.oval(c, f.x, f.y, 30 * k, 26 * k, 'rgba(255,190,90,' + (1 - k).toFixed(2) + ')'); PT.oval(c, f.x, f.y, 18 * k, 15 * k, 'rgba(255,250,200,' + (1 - k).toFixed(2) + ')'); }
      if (f.kind === 'reveal') { var r = 6 + 30 * k; for (var q = 0; q < 24; q++) { var an = q / 24 * Math.PI * 2; PT.oval(c, f.x + Math.cos(an) * r, f.y + Math.sin(an) * r, 1.2, 1.2, 'rgba(255,240,160,' + (1 - k).toFixed(2) + ')'); } }
      if (f.kind === 'heal') { for (var q2 = 0; q2 < 8; q2++) { var xx = f.x + Math.sin(q2 * 2.3) * 16, yy = f.y - 30 * k - q2 * 3; PT.oval(c, xx, yy, 1.3, 1.3, 'rgba(160,255,190,' + (1 - k).toFixed(2) + ')'); } }
    });
  }
  // 水のきらめき（ゆっくり流れる明るい線）
  function waterSparkle(c, F, x0, y0, x1, y1) {
    var Wt = (DW.THEME[F.def.theme] || DW.THEME.village).w;
    for (var i = 0; i < R.water.length; i++) {
      var idx = R.water[i], cx = (idx % F.w) * T, cy = Math.floor(idx / F.w) * T;
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      var ph = R.t * 0.9 + PT.hash(cx, cy, 5) * 6, k = (ph % 3) / 3;
      var sx = cx + 6 + ((PT.hash(cx, cy, 6) * 20) + k * 10) % 22, sy = cy + 8 + PT.hash(cx, cy, 7) * 16;
      if (k < 0.8) PT.rrect(c, sx, sy, 5, 1.1, 0.55, PT.rgba(Wt[3], (0.75 * Math.sin(k / 0.8 * Math.PI)).toFixed(2)));
    }
  }

  // ---- 夜と明かり（小さなキャンバスで計算して、なめらかに広げる） ----
  var NIGHT = [[14, 18, 48, 0.58], [18, 22, 58, 0.5], [24, 28, 70, 0.42], [40, 32, 78, 0.32], [70, 42, 70, 0.2], [90, 60, 60, 0.1], [0, 0, 0, 0]];
  var LQ = 2;   // 明かりのキャンバスの1画素 = 2単位
  function dawnLevel(S) { return S.flags.dawn ? 6 : Math.min(5, S.frag || 0); }
  function lighting(c, V) {
    var F = R.F, lv = dawnLevel(V.S), n = NIGHT[lv], dark = F.def.dark ? 0.5 : 0;
    if (F.def.theme === 'sky') { n = [60, 40, 90, Math.max(0, n[3] - 0.2)]; }
    var alpha = Math.min(0.9, n[3] + dark * (1 - lv / 8));
    if (alpha <= 0.01) return;
    var lw = Math.ceil(R.bw / LQ) + 1, lh = Math.ceil(R.bh / LQ) + 1;
    if (!R.light || R.light.width !== lw || R.light.height !== lh) R.light = PT.mk(lw, lh);
    var L = R.light, lc = L.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, L.width, L.height);
    lc.fillStyle = 'rgba(' + n[0] + ',' + n[1] + ',' + n[2] + ',' + alpha + ')'; lc.fillRect(0, 0, L.width, L.height);
    lc.globalCompositeOperation = 'destination-out';
    lc.setTransform(1 / LQ, 0, 0, 1 / LQ, 0, 0);
    var toB = function (x, y) { return [x + R.ox, y + R.oy]; };
    var hole = function (x, y, r, a) { var p = toB(x, y); if (p[0] < -r || p[1] < -r || p[0] > R.bw + r || p[1] > R.bh + r) return; var g = lc.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.6) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = g; lc.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); };
    if (V.P.def) hole((V.P.fx + 0.5) * T, (V.P.fy + 0.5) * T - 8, F.def.dark ? 150 : 95, F.def.dark ? 0.95 : 0.55);
    var glows = [];
    F.deco.forEach(function (d) {
      var L2 = DW.LIGHTS[d.kind]; if (!L2) return;
      var x = (d.x + (d.w || 1) / 2) * T, y = d.y * T + L2.y;
      hole(x, y, L2.r, 0.9); glows.push([x, y, L2.r * 0.6, L2.col]);
    });
    F.objs.forEach(function (o) {
      if (!o.on) return;
      if (o.k === 'pickup' || (o.k === 'obst' && o.kind === 'hidden' && FD.hasAbility(V.S, 'hawk'))) hole(o.x * T + 16, o.y * T + 16, 40, 0.6);
      if (o.k === 'npc' && o.yokai === 'seal_stone') { hole(o.x * T + 16, o.y * T + 10, 60, 0.8); glows.push([o.x * T + 16, o.y * T + 10, 40, '190,140,255']); }
      if (o.k === 'enemy') { var e = root.NYT_ENEMIES.ENEMIES[o.enemies[0]]; if (e && (e.shape === 'wisp' || e.shape === 'chochin' || e.shape === 'firefly' || e.shape === 'jelly')) { hole(((o.fx != null ? o.fx : o.x)) * T + 16, ((o.fy != null ? o.fy : o.y)) * T + 12, 50, 0.7); } }
    });
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(L, 0, 0, L.width * LQ * R.Sd, L.height * LQ * R.Sd);
    // あたたかい光
    c.setTransform(R.Sd, 0, 0, R.Sd, 0, 0);
    c.globalCompositeOperation = 'lighter';
    glows.forEach(function (gw) { var p = toB(gw[0], gw[1]), rr = gw[2]; if (p[0] < -rr || p[1] < -rr || p[0] > R.bw + rr || p[1] > R.bh + rr) return; var g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr); g.addColorStop(0, 'rgba(' + gw[3] + ',' + (0.24 * alpha + 0.05) + ')'); g.addColorStop(1, 'rgba(' + gw[3] + ',0)'); c.fillStyle = g; c.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2); });
    c.globalCompositeOperation = 'source-over';
  }
  // 霧の山の、ただよう霧（画面の単位で）
  function mistLayer(c, V) {
    c.setTransform(R.Sd, 0, 0, R.Sd, 0, 0);
    var a = Math.max(0.05, 0.22 - (V.S.flags.ch2_clear ? 0.16 : 0));
    for (var i = 0; i < 7; i++) {
      var x = ((R.t * (6 + i * 1.5) + i * 160) % (R.bw + 300)) - 150, y = (i * 0.14 + 0.08) * R.bh;
      var g = c.createRadialGradient(x, y, 0, x, y, 130); g.addColorStop(0, 'rgba(235,240,250,' + a + ')'); g.addColorStop(1, 'rgba(235,240,250,0)');
      c.fillStyle = g; c.fillRect(x - 130, y - 130, 260, 260);
    }
  }

  // 画面の点（CSS の画素）→ マス
  function screenToTile(sx, sy) {
    var wx = sx / R.zoom - R.ox, wy = sy / R.zoom - R.oy;
    return { x: Math.floor(wx / T), y: Math.floor(wy / T) };
  }
  function tileToScreen(x, y) { return { x: ((x + 0.5) * T + R.ox) * R.zoom, y: ((y + 0.5) * T + R.oy) * R.zoom }; }

  var api = { init: init, resize: resize, setMap: setMap, frame: frame, screenToTile: screenToTile, tileToScreen: tileToScreen, addFx: addFx, dawnLevel: dawnLevel, NIGHT: NIGHT, R: R, T: T };
  root.NYT_RFIELD = api;
})(typeof window !== 'undefined' ? window : globalThis);
