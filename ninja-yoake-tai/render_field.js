/* ニンジャ夜明け隊（RPG） — フィールドの描画（ドット絵）
 * 小さな画面（1ドット = 世界の1単位、1マス = 32ドット）に描いてから、整数倍でぼかさずに広げる。
 * 地面（1枚の絵）→ 木・建物・人・妖怪を「下にあるものほど手前」に並べて描く → 吹き出し → 夜の暗さと明かり。
 * 空の明るさは、取り戻した暁のかけらの数で変わる。
 */
(function (root) {
  'use strict';
  var DW = root.NYT_DRAW, YK = root.NYT_YOKAI, SPR = root.NYT_SPRITES, FD = root.NYT_FIELD, PIX = root.NYT_PIX;
  var T = 32;
  var R = { cv: null, c: null, dpr: 1, vw: 0, vh: 0, zoom: 2, s: 2, Sd: 2, cam: { x: 0, y: 0 }, ox: 0, oy: 0, F: null, ground: null, tall: [], buf: null, b: null, bw: 0, bh: 0, light: null, t: 0, fx: [] };

  function init(cv) { R.cv = cv; R.c = cv.getContext('2d'); resize(); }
  function resize() {
    R.dpr = Math.min(3, root.devicePixelRatio || 1);
    R.vw = root.innerWidth; R.vh = root.innerHeight;
    R.cv.width = Math.round(R.vw * R.dpr); R.cv.height = Math.round(R.vh * R.dpr);
    R.cv.style.width = R.vw + 'px'; R.cv.style.height = R.vh + 'px';
    fitZoom();
  }
  // 1ドットを画面の何画素で描くか（整数）。縦長の画面で横に約11マス、横長で縦に約9マス。地図が小さいときは寄る
  function fitZoom() {
    var short = Math.min(R.vw, R.vh);
    var z = Math.max(1, Math.min(2.6, short / (T * (R.vw < R.vh ? 11 : 9.5))));
    var sd = Math.max(1, Math.round(z * R.dpr));
    if (R.F) sd = Math.max(sd, Math.ceil(R.cv.width / (R.F.w * T)), Math.ceil(R.cv.height / (R.F.h * T)));
    R.Sd = sd; R.zoom = sd / R.dpr; R.s = R.zoom;
    R.bw = Math.ceil(R.cv.width / sd); R.bh = Math.ceil(R.cv.height / sd);
    if (!R.buf) { R.buf = PIX.mk(R.bw, R.bh); R.b = R.buf.getContext('2d'); }
    if (R.buf.width !== R.bw || R.buf.height !== R.bh) { R.buf.width = R.bw; R.buf.height = R.bh; }
  }
  function setMap(F) {
    R.F = F; fitZoom();
    R.ground = DW.buildGround(F);
    R.water = [];
    // 背の高いマス（木・松・竹）と、動く水のマス
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
    var b = R.b, c = R.c;
    R.t = V.t;
    // カメラ（ドット単位にそろえる）
    var tx = (V.P.fx + 0.5) * T, ty = (V.P.fy + 0.5) * T - 8;
    var hw = R.bw / 2, hh = R.bh / 2, mw = F.w * T, mh = F.h * T;
    tx = mw <= R.bw ? mw / 2 : Math.max(hw, Math.min(mw - hw, tx));
    ty = mh <= R.bh ? mh / 2 : Math.max(hh, Math.min(mh - hh, ty));
    R.cam.x = tx; R.cam.y = ty;
    R.ox = Math.round(hw - tx); R.oy = Math.round(hh - ty);
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.imageSmoothingEnabled = false;
    b.fillStyle = DW.voidColor(F); b.fillRect(0, 0, R.bw, R.bh);
    b.setTransform(1, 0, 0, 1, R.ox, R.oy);
    b.drawImage(R.ground, 0, 0);
    var vx0 = -R.ox - T * 2, vx1 = -R.ox + R.bw + T * 2, vy0 = -R.oy - T * 2, vy1 = -R.oy + R.bh + T * 3;
    waterSparkle(b, F, vx0, vy0, vx1, vy1);
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
    list.forEach(function (it) { drawItem(b, it, V); });
    drawMarks(b, V);
    drawFx(b, V.dt || 0);
    // 夜と明かり・霧
    lighting(b, V);
    if (F.def.mist) mistLayer(b, V);
    // 広げて画面へ
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(R.buf, 0, 0, R.bw * R.Sd, R.bh * R.Sd);
  }

  function drawItem(b, it, V) {
    var o = it.o;
    if (it.k === 'tall') { var sp = DW.tallSprite(o.kind, R.F.def.theme, o.v); b.drawImage(sp.cv, o.x * T - sp.ox, o.y * T - sp.oy); return; }
    if (it.k === 'deco') {
      var ds = DW.decoSprite(o);
      b.drawImage(ds.cv, o.x * T - ds.ox, o.y * T - ds.oy);
      if (o.kind === 'brazier') flame(b, o.x * T + 16, o.y * T + 6);
      if (o.kind === 'forge') smoke(b, o.x * T + (o.w || 1) * T - 18, o.y * T - 44);
      return;
    }
    if (it.k === 'player' || it.k === 'member') { drawChar(b, o, o.def, V); return; }
    var fx = o.fx != null ? o.fx : o.x, fy = o.fy != null ? o.fy : o.y;
    if (it.k === 'npc') {
      if (o.yokai) { var e = root.NYT_ENEMIES.ENEMIES[o.yokai]; yokai(b, e ? e.shape : o.yokai, e ? e.col : 'purple', fx, fy, o.big ? 1.25 : 0.8, 1, o.big, o.x); return; }
      drawChar(b, { fx: fx, fy: fy, dir: o.dir || 'down', walk: o.walk || 0, moving: o.moving, sleep: o.sleep }, SPR.defFor(o, V.S), V);
      return;
    }
    var px = o.x * T, py = o.y * T;
    if (it.k === 'enemy') {
      var ee = root.NYT_ENEMIES.ENEMIES[o.enemies[0]] || {};
      yokai(b, ee.shape || 'blob', ee.col, fx, fy, 0.66, o.dir === 'left' ? -1 : 1, false, o.x * 0.7);
      if (o.enemies.length > 1) { var bx = Math.round(fx * T) + 20, by = Math.round(fy * T) - 6; PIX.fill(b, bx, by, 11, 8, '#1a1424'); PIX.fill(b, bx + 1, by + 1, 9, 6, '#3a3048'); tinyNum(b, '×' + o.enemies.length, bx + 2, by + 2); }
      return;
    }
    if (it.k === 'chest') { b.drawImage(DW.chestSprite(o.open), px + 2, py + 6); return; }
    if (it.k === 'pickup') { sparkle(b, px + 16, py + 20, 1); return; }
    if (it.k === 'sign') { b.drawImage(DW.signSprite(), px + 3, py + 1); return; }
    if (it.k === 'pit') { PIX.oval(b, px + 16, py + 17, 14, 10, '#3a3030'); PIX.oval(b, px + 16, py + 17, 13, 9, '#0c0a0a'); return; }
    if (it.k === 'gate') { gate(b, o); return; }
    if (it.k === 'obst') { obst(b, o, V); return; }
  }

  // 忍者（地図の上）：40×48ドットの絵。足もとをマスの下のほうに
  function drawChar(b, m, d, V) {
    if (!d || !d.def) return;
    var px = Math.round(m.fx * T + 16), py = Math.round(m.fy * T + 30);
    var yaw = SPR.YAW[m.dir] != null ? SPR.YAW[m.dir] : 0;
    var img = m.moving ? SPR.pix(d, { yaw: yaw, pose: 'walk', frame: m.walk % 4 }) : SPR.pix(d, { yaw: yaw, pose: 'stand' });
    shadow(b, px, py, 9);
    if (img) b.drawImage(img, px - Math.round(img.width / 2), py - Math.round(img.height * SPR.FOOT_Y));
    if (m.sleep) { var z = Math.floor(R.t * 2) % 2; b.drawImage(DW.bubbleSprite('z', '#4a5a9a'), px + 6, py - 50 - z * 2); }
  }
  function shadow(b, x, y, rx) {
    b.fillStyle = 'rgba(10,8,12,0.32)';
    for (var j = -2; j <= 1; j++) { var w = Math.round(rx * Math.sqrt(1 - (j + 0.5) * (j + 0.5) / 6.25)); b.fillRect(x - w, y + j, w * 2, 1); }
  }
  // 妖怪（ドット絵のコマを順に）
  function yokai(b, shape, col, fx, fy, s, dir, boss, seed) {
    var px = Math.round(fx * T + 16), py = Math.round(fy * T + 30);
    var fr = YK.pixFrames(shape, col, { s: s, dir: dir, boss: boss });
    shadow(b, px, py, Math.round((YK.SIZE[shape] || 44) * s * 0.32));
    if (!fr) return;
    var k = Math.floor((R.t + (seed || 0)) * 5) % fr.frames.length, cv = fr.frames[k];
    b.drawImage(cv, px - fr.ax, py - fr.ay);
  }
  function tinyNum(b, s, x, y) {
    var G = { '×': ['1.1', '.1.', '1.1'], '2': ['11', '.1', '1.', '11'], '3': ['11', '.1', '11', '.1', '11'], '4': ['1.1', '111', '..1'], '5': ['11', '1.', '.1', '11'] };
    b.fillStyle = '#ffffff';
    for (var i = 0; i < s.length; i++) { var gl = G[s[i]] || G['2']; gl.forEach(function (row, yy) { for (var xx = 0; xx < row.length; xx++) if (row[xx] === '1') b.fillRect(x + xx, y + yy, 1, 1); }); x += (gl[0].length + 1); }
  }
  function sparkle(b, x, y, a) {
    var k = Math.floor(R.t * 6) % 4, s = [1, 2, 3, 2][k];
    b.globalAlpha = 0.9 * a;
    PIX.fill(b, x - s, y, s * 2 + 1, 1, '#fff6c0'); PIX.fill(b, x, y - s, 1, s * 2 + 1, '#fff6c0'); PIX.dot(b, x, y, '#ffffff');
    if (k === 2) { PIX.dot(b, x + 5, y - 4, '#ffffff'); }
    b.globalAlpha = 1;
  }
  function gate(b, o) {
    var px = o.x * T, py = o.y * T, w = (o.w || 1) * T;
    if (R.F.def.theme === 'under') {
      var a = 0.45 + Math.sin(R.t * 3) * 0.15;
      b.fillStyle = 'rgba(170,110,255,' + a + ')'; b.fillRect(px, py - 10, w, T + 6);
      b.fillStyle = 'rgba(240,210,255,.9)';
      for (var i = 0; i < w; i += 8) for (var j = 0; j < T + 4; j += 2) b.fillRect(px + i + Math.floor(j / 4), py - 8 + j, 1, 1);
      return;
    }
    b.drawImage(DW.barrierSprite(o.w || 1, false), px, py);
  }
  function obst(b, o, V) {
    var px = o.x * T, py = o.y * T;
    if (o.kind === 'boulder') { b.drawImage(DW.boulderSprite(), px, py - 2); if (FD.hasAbility(V.S, 'push')) sparkle(b, px + 26, py + 2, 0.7); return; }
    if (o.kind === 'fog') {
      for (var i = 0; i < 4; i++) { var a = R.t * 0.8 + i * 1.7 + o.y; PIX.oval(b, px + 16 + Math.round(Math.sin(a) * 6), py + 8 + i * 6 + Math.round(Math.cos(a) * 2), 13 - i * 2, 7, i % 2 ? 'rgba(236,240,250,.85)' : 'rgba(250,252,255,.8)'); }
      return;
    }
    if (o.kind === 'crack') { b.drawImage(DW.crackSprite(), px, py); return; }
    if (o.kind === 'hidden') { if (FD.hasAbility(V.S, 'hawk')) sparkle(b, px + 16, py + 16, 0.5 + Math.sin(R.t * 3 + o.x) * 0.3); return; }
  }
  function flame(b, x, y) {
    var k = Math.floor(R.t * 10) % 3;
    PIX.poly(b, [[x - 6, y], [x - 4, y - 7], [x - 1, y - 13 - k], [x + 2, y - 8], [x + 5, y - 11 + k], [x + 6, y]], '#e8501a');
    PIX.poly(b, [[x - 4, y], [x - 2, y - 5], [x, y - 9 - k], [x + 2, y - 5], [x + 4, y]], '#ffa030');
    PIX.poly(b, [[x - 2, y], [x, y - 5], [x + 2, y]], '#fff0a0');
  }
  function smoke(b, x, y) {
    for (var i = 0; i < 3; i++) { var k = (R.t * 0.6 + i / 3) % 1; PIX.oval(b, x + Math.round(Math.sin(k * 6 + i) * 3), y - Math.round(k * 26), 3 + k * 4, 2 + k * 3, 'rgba(200,196,190,' + (0.6 * (1 - k)).toFixed(2) + ')'); }
  }

  // 調べられる物の上の「！」、人の吹き出し
  function drawMarks(b, V) {
    var h = V.hint;
    if (h && h.x != null) { var bob = Math.floor(R.t * 4) % 2; b.drawImage(DW.bubbleSprite(h.icon || '！'), h.x * T + 8, h.y * T - 24 - bob); }
    (V.emotes || []).forEach(function (e) { var up = Math.min(1, e.t * 6) * 4; b.drawImage(DW.bubbleSprite(e.e), e.x * T + 8, Math.round(e.y * T - 32 - up)); });
  }
  function addFx(f) { f.age = 0; R.fx.push(f); }
  function drawFx(b, dt) {
    R.fx = R.fx.filter(function (f) { f.age += dt; return f.age < (f.dur || 0.8); });
    R.fx.forEach(function (f) {
      var k = f.age / (f.dur || 0.8);
      if (f.kind === 'smoke') { for (var i = 0; i < 6; i++) { var a = i * 1.05; PIX.oval(b, f.x + Math.cos(a) * 14 * k, f.y + Math.sin(a) * 10 * k - 10 * k, 8 * (1 - k * 0.6), 6 * (1 - k * 0.6), 'rgba(240,240,240,' + (0.85 * (1 - k)).toFixed(2) + ')'); } }
      if (f.kind === 'wind') { b.fillStyle = 'rgba(200,255,230,' + (1 - k).toFixed(2) + ')'; for (var j = 0; j < 4; j++) { var wx = Math.round(f.x + (k - 0.5) * 60), wy = Math.round(f.y - 10 + j * 7); b.fillRect(wx - 10, wy, 14, 1); b.fillRect(wx + 4, wy - 1, 4, 1); } }
      if (f.kind === 'boom') { PIX.oval(b, f.x, f.y, 30 * k, 26 * k, 'rgba(255,190,90,' + (1 - k).toFixed(2) + ')'); PIX.oval(b, f.x, f.y, 18 * k, 15 * k, 'rgba(255,250,200,' + (1 - k).toFixed(2) + ')'); }
      if (f.kind === 'reveal') { var r = 6 + 30 * k; b.fillStyle = 'rgba(255,240,160,' + (1 - k).toFixed(2) + ')'; for (var q = 0; q < 24; q++) { var an = q / 24 * Math.PI * 2; b.fillRect(Math.round(f.x + Math.cos(an) * r), Math.round(f.y + Math.sin(an) * r), 2, 2); } }
      if (f.kind === 'heal') { for (var q2 = 0; q2 < 8; q2++) { var xx = f.x + Math.sin(q2 * 2.3) * 16, yy = f.y - 30 * k - q2 * 3; PIX.fill(b, xx, yy, 2, 2, 'rgba(160,255,190,' + (1 - k).toFixed(2) + ')'); } }
    });
  }
  // 水のきらめき（ゆっくり流れる明るい点）
  function waterSparkle(b, F, x0, y0, x1, y1) {
    var Wt = (DW.THEME[F.def.theme] || DW.THEME.village).w;
    b.fillStyle = Wt[2];
    for (var i = 0; i < R.water.length; i++) {
      var idx = R.water[i], cx = (idx % F.w) * T, cy = Math.floor(idx / F.w) * T;
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      var ph = R.t * 0.9 + PIX.hash(cx, cy, 5) * 6, k = (ph % 3) / 3;
      var sx = cx + 6 + Math.round(((PIX.hash(cx, cy, 6) * 20) + k * 10) % 22), sy = cy + 8 + Math.round(PIX.hash(cx, cy, 7) * 16);
      if (k < 0.8) b.fillRect(sx, sy, 4, 1);
      if (PIX.hash(cx, cy, 8) < 0.4 && Math.floor(R.t * 2 + cx) % 3 === 0) { b.fillStyle = Wt[3]; b.fillRect(cx + 18, cy + 20, 2, 1); b.fillStyle = Wt[2]; }
    }
  }

  // ---- 夜と明かり（小さな画面の上で） ----
  var NIGHT = [[14, 18, 48, 0.58], [18, 22, 58, 0.5], [24, 28, 70, 0.42], [40, 32, 78, 0.32], [70, 42, 70, 0.2], [90, 60, 60, 0.1], [0, 0, 0, 0]];
  function dawnLevel(S) { return S.flags.dawn ? 6 : Math.min(5, S.frag || 0); }
  function lighting(b, V) {
    var F = R.F, lv = dawnLevel(V.S), n = NIGHT[lv], dark = F.def.dark ? 0.5 : 0;
    if (F.def.theme === 'sky') { n = [60, 40, 90, Math.max(0, n[3] - 0.2)]; }
    var alpha = Math.min(0.9, n[3] + dark * (1 - lv / 8));
    if (alpha <= 0.01) return;
    if (!R.light || R.light.width !== R.bw || R.light.height !== R.bh) R.light = PIX.mk(R.bw, R.bh);
    var L = R.light, lc = L.getContext('2d');
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, L.width, L.height);
    lc.fillStyle = 'rgba(' + n[0] + ',' + n[1] + ',' + n[2] + ',' + alpha + ')'; lc.fillRect(0, 0, L.width, L.height);
    lc.globalCompositeOperation = 'destination-out';
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
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.drawImage(L, 0, 0);
    // あたたかい光
    b.globalCompositeOperation = 'lighter';
    glows.forEach(function (gw) { var p = toB(gw[0], gw[1]), rr = gw[2]; if (p[0] < -rr || p[1] < -rr || p[0] > R.bw + rr || p[1] > R.bh + rr) return; var g = b.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr); g.addColorStop(0, 'rgba(' + gw[3] + ',' + (0.24 * alpha + 0.05) + ')'); g.addColorStop(1, 'rgba(' + gw[3] + ',0)'); b.fillStyle = g; b.fillRect(p[0] - rr, p[1] - rr, rr * 2, rr * 2); });
    b.globalCompositeOperation = 'source-over';
  }
  // 霧の山の、ただよう霧
  function mistLayer(b, V) {
    b.setTransform(1, 0, 0, 1, 0, 0);
    var a = Math.max(0.05, 0.22 - (V.S.flags.ch2_clear ? 0.16 : 0));
    for (var i = 0; i < 7; i++) {
      var x = ((R.t * (6 + i * 1.5) + i * 160) % (R.bw + 300)) - 150, y = (i * 0.14 + 0.08) * R.bh;
      var g = b.createRadialGradient(x, y, 0, x, y, 130); g.addColorStop(0, 'rgba(235,240,250,' + a + ')'); g.addColorStop(1, 'rgba(235,240,250,0)');
      b.fillStyle = g; b.fillRect(x - 130, y - 130, 260, 260);
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
