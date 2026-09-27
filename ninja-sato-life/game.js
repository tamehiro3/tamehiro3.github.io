/* ニンジャ里ライフ — 本体（保存・時刻・カメラ・操作・描画・歩く住民・建築）
 * 判定は rules.js、依頼係は clerk.js、画面のパネルは ui.js。
 */
(function () {
  'use strict';
  var D = NSL_DATA, R = NSL_RULES, C = NSL_CLERK, CH = NSL_CHARS, I = NSL_ISO, A = NinjaArt;
  var $ = function (s) { return document.querySelector(s); };
  var SAVE = 'nsl_save_v1', BAK = 'nsl_save_v1_bak';
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var G = window.NSL = {};
  G.$ = $;

  /* ================= 保存 ================= */
  G.S = null;
  G.view = null;       // 描いている里（自分の里 or 見学中の里）
  G.mode = 'title';
  function readSave(key) {
    try { var t = localStorage.getItem(key); if (!t) return null; return R.migrate(JSON.parse(t)); } catch (e) { return null; }
  }
  G.load = function () { return readSave(SAVE) || readSave(BAK); };
  var saveTimer = 0;
  G.save = function (now) {
    if (!G.S || G.S.readOnly) return;
    clearTimeout(saveTimer);
    var run = function () {
      try {
        var prev = localStorage.getItem(SAVE);
        if (prev) { try { JSON.parse(prev); localStorage.setItem(BAK, prev); } catch (e) { } }
        localStorage.setItem(SAVE, JSON.stringify(G.S));
      } catch (e) { G.toast && G.toast('保存できませんでした（端末の空き容量を確認してください）'); }
    };
    if (now) run(); else saveTimer = setTimeout(run, 250);
  };
  window.addEventListener('pagehide', function () { G.save(true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) G.save(true); else { G.tick(); G.syncTime(); } });

  /* ================= 時刻 ================= */
  G.tick = function () {
    if (!G.S) return;
    var r = R.tick(G.S, Date.now());
    if (r.back && !G._warnedBack) { G._warnedBack = true; G.toast && G.toast('端末の時計が戻っているようです。生産はしばらく止まります'); }
    return r;
  };
  G.synced = false;
  G.syncTime = function () {
    if (!G.S || location.protocol === 'file:') return;
    var t0 = Date.now();
    fetch('version.txt?ts=' + t0, { cache: 'no-store' }).then(function (r) {
      var t1 = Date.now(), dh = r.headers.get('Date');
      if (!dh) return;
      var server = Date.parse(dh) + 500 + (t1 - t0) / 2; // Date は秒単位なので半秒たす
      var ev = R.syncClock(G.S, t1, server);
      G.synced = true;
      if (ev && ev.kind === 'clockFixed' && Math.abs(ev.diffMin) > 5) G.toast && G.toast('時計のずれ（' + ev.diffMin + '分）を直しました');
      G.hud();
    }).catch(function () { G.synced = false; G.hud && G.hud(); });
  };
  setInterval(function () { if (!document.hidden) G.syncTime(); }, 10 * 60000);

  /* ================= キャンバスとカメラ ================= */
  var cv = $('#world'), ctx = cv.getContext('2d');
  var W = 0, H = 0;
  G.cam = { x: 0, y: 0, z: 0.9 };
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    G.dirtyGround = true;
  }
  window.addEventListener('resize', resize);
  resize();
  G.w2s = function (tx, ty, z) { var p = I.iso(tx, ty); return { x: (p.x - G.cam.x) * G.cam.z + W / 2, y: (p.y - (z || 0) - G.cam.y) * G.cam.z + H / 2 }; };
  G.s2w = function (px, py) { var ix = (px - W / 2) / G.cam.z + G.cam.x, iy = (py - H / 2) / G.cam.z + G.cam.y; return I.unIso(ix, iy); };
  G.centerOn = function (tx, ty, z) { var p = I.iso(tx, ty); G.cam.x = p.x; G.cam.y = p.y; if (z) G.cam.z = z; clampCam(); };
  function clampCam() {
    var N = D.BAL.map, lo = I.iso(0, N), hi = I.iso(N, 0);
    G.cam.z = Math.max(0.45, Math.min(2.2, G.cam.z));
    G.cam.x = Math.max(lo.x + 60, Math.min(hi.x - 60, G.cam.x));
    G.cam.y = Math.max(40, Math.min(N * 2 * I.HH - 40, G.cam.y));
  }
  G.fitPlot = function () {
    var v = G.view; if (!v) return;
    var P = R.plot(v), cx = (P.x0 + P.x1 + 1) / 2, cy = (P.y0 + P.y1 + 1) / 2;
    var span = (v.village.size) * 2 * I.HW;
    var z = W < 700 ? 0.86 : Math.max(0.6, Math.min(1.25, (W - 20) / span * 1.25));
    G.centerOn(cx, cy - 0.5, z);
  };

  /* ================= 地面（一度描いて使い回す） ================= */
  var ground = null, groundKey = '';
  function groundScale() { return Math.max(0.5, Math.min(2.5, Math.round(G.cam.z * DPR * 4) / 4)); }
  function buildGround(v) {
    var q = groundScale(), N = D.BAL.map;
    var key = v.village.size + '|' + q + '|' + v.village.name;
    if (ground && key === groundKey && !G.dirtyGround) return;
    G.dirtyGround = false; groundKey = key;
    var w = N * 2 * I.HW + 40, h = N * 2 * I.HH + 40;
    ground = ground || document.createElement('canvas');
    ground.width = Math.ceil(w * q); ground.height = Math.ceil(h * q);
    var g = ground.getContext('2d');
    g.setTransform(q, 0, 0, q, 0, 0);
    g.translate(N * I.HW + 20, 20);
    I.drawGround(g, v, {});
    ground.q = q; ground.ox = N * I.HW + 20; ground.oy = 20;
  }

  /* ================= 歩く人たち ================= */
  G.walkers = [];
  function blockedMap(v) {
    var m = {}, N = D.BAL.map;
    v.objs.forEach(function (o) {
      var it = D.ITEM[o.id]; if (it.walkable) return;
      var d = R.dims(it, o.rot);
      for (var x = o.x; x < o.x + d.w; x++) for (var y = o.y; y < o.y + d.h; y++) m[x + ',' + y] = 1;
    });
    D.BAL.debris.forEach(function (d) { if (!v.debris[d.id]) m[d.x + ',' + d.y] = 1; });
    R.gatherSpots(v).forEach(function (g) { m[g.x + ',' + g.y] = 1; });
    (G.outer || []).forEach(function (t) { m[t.x + ',' + t.y] = 1; });
    for (var i = 0; i < N; i++) { m[(N - 1) + ',' + i] = 1; m[(N - 2) + ',' + i] = 1; }
    return m;
  }
  G.blocked = function () { return blockedMap(G.view); };
  // A*（4方向）
  function findPath(v, sx, sy, tx, ty, blk) {
    var N = D.BAL.map;
    blk = blk || blockedMap(v);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return null;
    var key = function (x, y) { return x + ',' + y; };
    if (blk[key(tx, ty)]) return null;
    var open = [{ x: sx, y: sy, g: 0, f: Math.abs(tx - sx) + Math.abs(ty - sy) }], came = {}, gs = {}, closed = {};
    gs[key(sx, sy)] = 0;
    var it = 0;
    while (open.length && it++ < 5000) {
      var bi = 0; for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0], ck = key(cur.x, cur.y);
      if (cur.x === tx && cur.y === ty) {
        var path = [{ x: tx, y: ty }], k = ck;
        while (came[k]) { k = came[k]; var p = k.split(','); path.unshift({ x: +p[0], y: +p[1] }); }
        path.shift();
        return path;
      }
      closed[ck] = 1;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = cur.x + d[0], ny = cur.y + d[1], nk = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || closed[nk] || (blk[nk] && !(nx === tx && ny === ty))) return;
        var ng = cur.g + 1;
        if (gs[nk] != null && ng >= gs[nk]) return;
        gs[nk] = ng; came[nk] = ck;
        open.push({ x: nx, y: ny, g: ng, f: ng + Math.abs(tx - nx) + Math.abs(ty - ny) });
      });
    }
    return null;
  }
  G.findPath = findPath;
  G.spawn = function (id, kind, tx, ty) {
    var w = { id: id, kind: kind, x: tx + 0.5, y: ty + 0.5, path: [], speed: kind === 'me' ? 2.6 : 1.7, yaw: -20, frame: 0, dist: 0, state: 'idle', until: 0, emote: null, t: Math.random() * 10 };
    G.walkers.push(w);
    return w;
  };
  G.walker = function (id) { for (var i = 0; i < G.walkers.length; i++) if (G.walkers[i].id === id) return G.walkers[i]; return null; };
  G.walkTo = function (w, tx, ty, cb) {
    var p = findPath(G.view, Math.floor(w.x), Math.floor(w.y), tx, ty);
    if (!p) { if (cb) cb(false); return false; }
    w.path = p; w.cb = cb || null; w.state = 'walk';
    return true;
  };
  // 物のとなりの空いたマス
  G.nearTile = function (o, from) {
    var it = D.ITEM[o.id], d = R.dims(it, o.rot), blk = blockedMap(G.view), best = null, bd = 1e9;
    for (var x = o.x - 1; x <= o.x + d.w; x++) for (var y = o.y - 1; y <= o.y + d.h; y++) {
      if (x >= o.x && x < o.x + d.w && y >= o.y && y < o.y + d.h) continue;
      if (blk[x + ',' + y]) continue;
      var P = R.plot(G.view); if (x < P.x0 - 1 || y < P.y0 - 1 || x > P.x1 + 1 || y > P.y1 + 1) continue;
      var dd = from ? Math.abs(from.x - x) + Math.abs(from.y - y) : (x + y) * -1;
      if (y >= o.y + d.h || x >= o.x + d.w) dd -= 3; // 手前側を好む
      if (dd < bd) { bd = dd; best = { x: x, y: y }; }
    }
    return best;
  };
  function yawFor(dx, dy) {
    if (dx > 0) return 52; if (dy > 0) return -52; if (dx < 0) return -128; if (dy < 0) return 128; return -20;
  }
  function updateWalkers(dt) {
    G.walkers.forEach(function (w) {
      w.t += dt;
      if (w.path.length) {
        var nx = w.path[0].x + 0.5, ny = w.path[0].y + 0.5, dx = nx - w.x, dy = ny - w.y, dist = Math.hypot(dx, dy);
        var step = w.speed * dt;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) w.yaw = yawFor(Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, Math.abs(dx) > Math.abs(dy) ? 0 : Math.sign(dy));
        if (dist <= step) { w.x = nx; w.y = ny; w.path.shift(); w.dist += dist; }
        else { w.x += dx / dist * step; w.y += dy / dist * step; w.dist += step; }
        w.frame = Math.floor(w.dist * 3.2) % 4;
        if (!w.path.length) { w.state = 'idle'; var cb = w.cb; w.cb = null; if (Math.abs(w.yaw) > 90) { } if (cb) cb(true); }
      } else w.frame = 0;
      if (w.emote && w.emote.until < G.time) w.emote = null;
    });
    G.walkers = G.walkers.filter(function (w) { return !w.gone; });
  }

  /* ================= 描画 ================= */
  G.time = 0;
  G.floaters = [];
  G.hits = [];     // 画面上の当たり判定（吹き出し・人・物）
  G.fx = [];
  function spriteScale() { return Math.max(0.5, Math.min(3, Math.round(G.cam.z * DPR * 4) / 4)); }
  function artFor(w) {
    if (w.id === 'me') return function () { return CH.apprenticeArt(G.S.player.set, G.S.player.hair, G.S.player.outfit); };
    var ch = CH.BY_ID[w.id];
    return function () { return ch.art; };
  }
  function drawObj(o, v, alpha, tint) {
    var it = D.ITEM[o.id], q = spriteScale(), extra = null;
    if (it.prod) { var fi = R.fieldInfo(v, o); extra = JSON.stringify({ ready: fi.stored > 0, grow: fi.stored > 0 ? 1 : (1 - fi.nextMs / (D.BAL.field.cycleMin * 60000)) > 0.5 ? 0.6 : 0.3 }); }
    if (o.id === 'takibi' || o.id === 'furin' || o.id === 'chikurin' || o.id === 'kajidai') extra = JSON.stringify({ t: Math.floor(G.time * 4) % 12 / 4 });
    var spr = I.spriteFor(o.id, o.rot, o.lv || 1, v.village.theme || 'standard', extra, q);
    var s = G.w2s(o.x, o.y);
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.drawImage(spr.cv, s.x - spr.ax * G.cam.z, s.y - spr.ay * G.cam.z, spr.w * G.cam.z, spr.h * G.cam.z);
    ctx.restore();
    if (tint) { // 置けない場所は赤く
      var d = R.dims(it, o.rot), a = G.w2s(o.x, o.y), b = G.w2s(o.x + d.w, o.y), c2 = G.w2s(o.x + d.w, o.y + d.h), e = G.w2s(o.x, o.y + d.h);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(e.x, e.y); ctx.closePath();
      ctx.fillStyle = tint; ctx.fill(); ctx.strokeStyle = tint.replace(/[\d.]+\)$/, '1)'); ctx.lineWidth = 2; ctx.stroke();
    }
    return spr;
  }
  function footRect(o) {
    var it = D.ITEM[o.id], d = R.dims(it, o.rot), l = G.w2s(o.x, o.y + d.h), r = G.w2s(o.x + d.w, o.y), t = G.w2s(o.x, o.y), b = G.w2s(o.x + d.w, o.y + d.h);
    var hgt = ({ koya: 90, chaya: 80, souko: 86, sakura: 76, matsu: 70, torii: 70, chochin: 56, chikurin: 76, ishidoro: 50, ido: 50 }[o.id] || 36) * G.cam.z;
    return { x0: l.x, x1: r.x, y0: t.y - hgt, y1: b.y };
  }
  function drawWalker(w) {
    var s = G.w2s(w.x, w.y), q = spriteScale();
    var pose = w.path.length ? 'walk' : (w.pose || 'stand');
    var yaw = w.path.length ? w.yaw : (w.faceYaw != null ? w.faceYaw : (Math.abs(w.yaw) > 90 ? w.yaw : (w.yaw > 0 ? 24 : -24)));
    var key = w.id === 'me' ? 'me:' + (G.S.player.set + G.S.player.hair + (G.S.player.outfit ? G.S.player.outfit.id || 'o' : '')) : w.id;
    var spr = I.charSprite(key, artFor(w), { yaw: yaw, pose: pose, frame: w.path.length ? w.frame : 0, expr: w.expr || null, companions: false }, q);
    var cw = I.CW * G.cam.z, chh = I.CHh * G.cam.z;
    var bob = w.path.length ? 0 : Math.sin(w.t * 2.2) * 0.6 * G.cam.z;
    // 影
    ctx.beginPath(); ctx.ellipse(s.x, s.y, cw * 0.26, cw * 0.1, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(40,30,20,.2)'; ctx.fill();
    if (spr) ctx.drawImage(spr.cv, s.x - cw / 2, s.y - chh * 0.965 + bob, cw, chh);
    else { ctx.beginPath(); ctx.arc(s.x, s.y - chh * 0.5, cw * 0.2, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fill(); }
    G.hits.push({ kind: 'walker', w: w, x0: s.x - cw * 0.3, x1: s.x + cw * 0.3, y0: s.y - chh * 0.9, y1: s.y, z: 2 });
    w.sx = s.x; w.sy = s.y - chh;
  }
  function bubble(x, y, text, opt) {
    opt = opt || {};
    var r = (opt.r || 15) * Math.max(0.8, Math.min(1.3, G.cam.z));
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = opt.bg || '#fffaf0'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = opt.border || '#3b2a20'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5, y + r - 2); ctx.lineTo(x, y + r + 7); ctx.lineTo(x + 5, y + r - 2); ctx.fillStyle = opt.bg || '#fffaf0'; ctx.fill();
    ctx.font = 'bold ' + Math.round(r * 1.05) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = opt.fg || '#3b2a20';
    ctx.fillText(text, x, y + 1);
    if (opt.badge) { ctx.beginPath(); ctx.arc(x + r * 0.8, y - r * 0.8, r * 0.5, 0, 7); ctx.fillStyle = '#c8452c'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(r * 0.6) + 'px sans-serif'; ctx.fillText(opt.badge, x + r * 0.8, y - r * 0.8 + 1); }
    ctx.restore();
    return { x0: x - r - 4, x1: x + r + 4, y0: y - r - 4, y1: y + r + 8 };
  }
  G.float = function (tx, ty, text, color) { G.floaters.push({ x: tx, y: ty, text: text, color: color || '#3b2a20', t0: G.time }); };
  G.puff = function (tx, ty) { G.fx.push({ kind: 'puff', x: tx, y: ty, t0: G.time }); };

  function draw() {
    var v = G.view;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#6f9f4c'; ctx.fillRect(0, 0, W, H);
    if (!v) return;
    buildGround(v);
    // 地面
    var o0 = G.w2s(0, 0);
    ctx.drawImage(ground, o0.x - ground.ox * G.cam.z, o0.y - ground.oy * G.cam.z, ground.width / ground.q * G.cam.z, ground.height / ground.q * G.cam.z);
    G.hits = [];
    // 建築中：敷地のマス目
    if (G.build.on) drawGrid(v);
    // 奥から順に
    var list = [];
    var moving = G.build.ghost && G.build.ghost.uid;
    v.objs.forEach(function (o) { var d = R.dims(D.ITEM[o.id], o.rot); list.push({ k: 'o', o: o, z: o.x + d.w + o.y + d.h - 1 }); });
    D.BAL.debris.forEach(function (d) { if (!v.debris[d.id]) list.push({ k: 'd', d: d, z: d.x + d.y + 1 }); });
    R.gatherSpots(v).forEach(function (g) { list.push({ k: 'g', g: g, z: g.x + g.y + 1 }); });
    (G.outer || []).forEach(function (t) { list.push({ k: 't', t: t, z: t.x + t.y + 1 }); });
    G.walkers.forEach(function (w) { list.push({ k: 'w', w: w, z: w.x + w.y + 0.02 }); });
    list.sort(function (a, b) { return a.z - b.z; });
    var q = spriteScale();
    list.forEach(function (it) {
      if (it.k === 'o') {
        var fade = moving === it.o.uid ? 0.35 : (G.build.sel === it.o.uid ? 1 : null);
        drawObj(it.o, v, fade);
        var fr = footRect(it.o); fr.kind = 'obj'; fr.o = it.o; fr.z = 1; G.hits.push(fr);
        if (G.build.sel === it.o.uid) outline(it.o, 'rgba(255,215,90,.9)');
      } else if (it.k === 'd') {
        var s = G.w2s(it.d.x, it.d.y), spr = debrisSprite(it.d.kind, q);
        ctx.drawImage(spr.cv, s.x - spr.ax * G.cam.z, s.y - spr.ay * G.cam.z, spr.w * G.cam.z, spr.h * G.cam.z);
      } else if (it.k === 'g') {
        var s2 = G.w2s(it.g.x, it.g.y), sp2 = I.spriteFor('chikurin', 0, 1, 'standard', JSON.stringify({ t: Math.floor(G.time * 2) % 8 / 2 }), q);
        ctx.drawImage(sp2.cv, s2.x - sp2.ax * G.cam.z, s2.y - sp2.ay * G.cam.z, sp2.w * G.cam.z, sp2.h * G.cam.z);
      } else if (it.k === 't') {
        var s3 = G.w2s(it.t.x, it.t.y), sp3 = treeSprite(it.t.seed % 5, q);
        ctx.drawImage(sp3.cv, s3.x - sp3.ax * G.cam.z, s3.y - sp3.ay * G.cam.z, sp3.w * G.cam.z, sp3.h * G.cam.z);
      } else if (it.k === 'w') drawWalker(it.w);
    });
    // 置く物のプレビュー
    var gh = G.build.ghost;
    if (gh) {
      var ok = gh.check && gh.check.ok;
      drawObj({ id: gh.id, x: gh.x, y: gh.y, rot: gh.rot, lv: gh.lv || 1, uid: '__ghost' }, v, 0.78, ok ? 'rgba(90,190,90,.35)' : 'rgba(220,70,50,.4)');
      if (D.ITEM[gh.id].door) { var dt = R.doorTile({ id: gh.id, x: gh.x, y: gh.y, rot: gh.rot }); var ds = G.w2s(dt.x + 0.5, dt.y + 0.5); ctx.font = 'bold ' + Math.round(14 * G.cam.z + 4) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 3; ctx.strokeText('入口', ds.x, ds.y); ctx.fillText('入口', ds.x, ds.y); }
    }
    if (G.target) { // 移動先の印
      var ts = G.w2s(G.target.x + 0.5, G.target.y + 0.5), a = 1 - (G.time - G.target.t0) / 0.8;
      if (a > 0) { ctx.beginPath(); ctx.ellipse(ts.x, ts.y, 16 * G.cam.z, 8 * G.cam.z, 0, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,' + a + ')'; ctx.lineWidth = 3; ctx.stroke(); } else G.target = null;
    }
    // 吹き出し（収穫・採集・片付け・会話）
    if (G.photoMode) return; // 写真には吹き出しや効果を入れない
    if (G.mode === 'home' && !G.build.on) drawBubbles(v);
    if (G.mode === 'visit') G.walkers.forEach(function (w) { if (w.emote) bubble(w.sx, w.sy - 6, w.emote.text, { r: 13 }); });
    // 効果
    G.fx = G.fx.filter(function (f) {
      var t = G.time - f.t0; if (t > 0.6) return false;
      var p = G.w2s(f.x, f.y, 10);
      for (var i = 0; i < 6; i++) { var an = i / 6 * Math.PI * 2, rr = (8 + t * 60) * G.cam.z; ctx.beginPath(); ctx.arc(p.x + Math.cos(an) * rr, p.y + Math.sin(an) * rr * 0.5, (6 - t * 8) * G.cam.z, 0, 7); ctx.fillStyle = 'rgba(240,235,220,' + (1 - t / 0.6) + ')'; ctx.fill(); }
      return true;
    });
    G.floaters = G.floaters.filter(function (f) {
      var t = G.time - f.t0; if (t > 1.6) return false;
      var p = G.w2s(f.x, f.y, 40 + t * 40);
      ctx.save(); ctx.globalAlpha = Math.min(1, 2 - t * 1.2); ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#fffaf0'; ctx.strokeText(f.text, p.x, p.y); ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, p.y); ctx.restore();
      return true;
    });
    // 案内の矢印（ワールド座標）
    if (G.pointAt && G.pointAt.world) {
      var pp = G.w2s(G.pointAt.world.x, G.pointAt.world.y, G.pointAt.world.z || 40), pel = $('#pointer');
      pel.hidden = false; pel.style.left = pp.x + 'px'; pel.style.top = pp.y + 'px';
    }
  }
  function outline(o, col) {
    var it = D.ITEM[o.id], d = R.dims(it, o.rot), a = G.w2s(o.x, o.y), b = G.w2s(o.x + d.w, o.y), c2 = G.w2s(o.x + d.w, o.y + d.h), e = G.w2s(o.x, o.y + d.h);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(e.x, e.y); ctx.closePath(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
  }
  function drawGrid(v) {
    var P = R.plot(v); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    for (var x = P.x0; x <= P.x1 + 1; x++) { var a = G.w2s(x, P.y0), b = G.w2s(x, P.y1 + 1); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (var y = P.y0; y <= P.y1 + 1; y++) { var c = G.w2s(P.x0, y), d = G.w2s(P.x1 + 1, y); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke(); }
  }
  var extraSprites = {};
  function debrisSprite(kind, q) {
    var k = 'deb|' + kind + '|' + q; if (extraSprites[k]) return extraSprites[k];
    var cvs = I.makeCanvas(Math.ceil(96 * q), Math.ceil(80 * q)), c = cvs.getContext('2d'); c.scale(q, q); c.translate(48, 50);
    I.drawDebris(new I.G(c), kind);
    return (extraSprites[k] = { cv: cvs, ax: 48, ay: 50, w: 96, h: 80 });
  }
  function treeSprite(seed, q) {
    var k = 'tree|' + seed + '|' + q; if (extraSprites[k]) return extraSprites[k];
    var cvs = I.makeCanvas(Math.ceil(96 * q), Math.ceil(120 * q)), c = cvs.getContext('2d'); c.scale(q, q); c.translate(48, 96);
    I.drawOuterTree(new I.G(c), seed);
    return (extraSprites[k] = { cv: cvs, ax: 48, ay: 96, w: 96, h: 120 });
  }
  function drawBubbles(v) {
    // 畑の収穫
    v.objs.forEach(function (o) {
      var it = D.ITEM[o.id];
      if (it.prod) {
        var fi = R.fieldInfo(v, o);
        if (fi.stored > 0) {
          var d = R.dims(it, o.rot), p = G.w2s(o.x + d.w / 2, o.y + d.h / 2, 46 + Math.sin(G.time * 3) * 3);
          var rc = bubble(p.x, p.y, '🌿', { badge: fi.stored > 1 ? String(fi.stored) : null, bg: '#f2ffe6', border: '#3f7a35' });
          rc.kind = 'harvest'; rc.o = o; rc.z = 5; G.hits.push(rc);
        }
      }
    });
    // 採集
    R.gatherSpots(v).forEach(function (g) {
      if (!R.gatherReady(v, g.id)) return;
      var p = G.w2s(g.x + 0.5, g.y + 0.5, 84 + Math.sin(G.time * 3 + g.x) * 3);
      var rc = bubble(p.x, p.y, '🪵', { bg: '#fff3dc', border: '#8a5a36' });
      rc.kind = 'gather'; rc.g = g; rc.z = 5; G.hits.push(rc);
    });
    // 片付け
    D.BAL.debris.forEach(function (d) {
      if (v.debris[d.id]) return;
      var p = G.w2s(d.x + 0.5, d.y + 0.5, 40 + Math.sin(G.time * 4 + d.x) * 3);
      var rc = bubble(p.x, p.y, '✋', { bg: '#fffaf0' });
      rc.kind = 'debris'; rc.d = d; rc.z = 5; G.hits.push(rc);
    });
    // 住民・来訪者の吹き出し
    G.walkers.forEach(function (w) {
      if (w.id === 'me' || !w.sx) return;
      var txt = w.emote ? w.emote.text : null;
      if (!txt && w.kind === 'visitor' && !w.greeted) txt = '！';
      if (!txt && w.questMark) txt = '📜';
      if (!txt) return;
      var rc = bubble(w.sx, w.sy - 4 * G.cam.z, txt, { r: 13, bg: w.kind === 'visitor' ? '#fff3c4' : '#fffaf0' });
      rc.kind = 'walker'; rc.w = w; rc.z = 6; G.hits.push(rc);
    });
  }

  /* ================= 操作（タップ・ドラッグ・ピンチ） ================= */
  var ptrs = {}, down = null, pinch = null, dragGhost = false;
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: G.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: G.cam.x, cy: G.cam.y };
      down = null; dragGhost = false; return;
    }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), cx: G.cam.x, cy: G.cam.y, moved: false };
    dragGhost = false;
    if (G.build.ghost) {
      var w = G.s2w(e.clientX, e.clientY), gh = G.build.ghost, d = R.dims(D.ITEM[gh.id], gh.rot);
      if (w.x >= gh.x - 0.6 && w.x <= gh.x + d.w + 0.6 && w.y >= gh.y - 0.6 && w.y <= gh.y + d.h + 0.6) { dragGhost = true; down.gx = gh.x - Math.floor(w.x); down.gy = gh.y - Math.floor(w.y); }
    }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (pinch && ids.length >= 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      var z = Math.max(0.45, Math.min(2.2, pinch.z * d / pinch.d));
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      G.cam.z = z; G.cam.x = pinch.cx - (mx - pinch.mx) / z; G.cam.y = pinch.cy - (my - pinch.my) / z; clampCam();
      return;
    }
    if (!down) return;
    var dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 7) down.moved = true;
    if (!down.moved) return;
    if (dragGhost) {
      var w = G.s2w(e.clientX, e.clientY);
      G.moveGhost(Math.floor(w.x) + down.gx, Math.floor(w.y) + down.gy);
    } else { G.cam.x = down.cx - dx / G.cam.z; G.cam.y = down.cy - dy / G.cam.z; clampCam(); }
  });
  function endPtr(e) {
    var had = ptrs[e.pointerId]; delete ptrs[e.pointerId];
    if (pinch) { if (Object.keys(ptrs).length < 2) pinch = null; down = null; return; }
    if (!had || !down) return;
    if (!down.moved && performance.now() - down.t < 600) onTap(e.clientX, e.clientY);
    down = null; dragGhost = false;
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', function (e) { delete ptrs[e.pointerId]; down = null; pinch = null; dragGhost = false; });
  cv.addEventListener('wheel', function (e) {
    e.preventDefault();
    var before = G.s2w(e.clientX, e.clientY);
    G.cam.z = Math.max(0.45, Math.min(2.2, G.cam.z * (e.deltaY < 0 ? 1.1 : 0.9)));
    var after = G.s2w(e.clientX, e.clientY), pb = I.iso(before.x, before.y), pa = I.iso(after.x, after.y);
    G.cam.x += pb.x - pa.x; G.cam.y += pb.y - pa.y; clampCam();
  }, { passive: false });
  window.addEventListener('keydown', function (e) {
    if (!G.build.ghost) return;
    if (e.key === 'r' || e.key === 'R') G.rotateGhost();
    if (e.key === 'Enter') G.confirmGhost();
    if (e.key === 'Escape') G.cancelBuild();
    var mv = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (mv) { e.preventDefault(); G.moveGhost(G.build.ghost.x + mv[0], G.build.ghost.y + mv[1]); }
  });

  function onTap(px, py) {
    if (!G.view) return;
    G.sfx && G.sfx('tap');
    // 当たり判定（上に描いたものから）
    var hits = G.hits.filter(function (h) { return px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1; });
    hits.sort(function (a, b) { return b.z - a.z; });
    var w = G.s2w(px, py), tx = Math.floor(w.x), ty = Math.floor(w.y);
    if (G.build.on) {
      if (G.build.ghost) { G.moveGhost(tx - (G.build.ghost.cx || 0), ty - (G.build.ghost.cy || 0)); return; }
      var ho = hits.filter(function (h) { return h.kind === 'obj'; });
      var o = objAtTile(tx, ty) || (ho[ho.length - 1] && ho[ho.length - 1].o);
      if (o) G.selectObj(o.uid); else G.selectObj(null);
      return;
    }
    if (G.mode === 'visit') { var hv = hits.filter(function (h) { return h.kind === 'walker'; })[0]; if (hv && G.visitTalk) G.visitTalk(hv.w); return; }
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      if (h.kind === 'harvest') { G.doHarvest(h.o); return; }
      if (h.kind === 'gather') { G.doGather(h.g); return; }
      if (h.kind === 'debris') { G.doDebris(h.d); return; }
      if (h.kind === 'walker' && h.w.id !== 'me') { G.openTalk && G.openTalk(h.w); return; }
    }
    var o2 = objAtTile(tx, ty);
    if (!o2) { var ho2 = hits.filter(function (h) { return h.kind === 'obj'; }); if (ho2.length) o2 = ho2[ho2.length - 1].o; }
    if (o2 && G.onObjTap) { G.onObjTap(o2); return; }
    // 見習いをそこへ歩かせる
    var me = G.walker('me');
    if (me && G.walkTo(me, tx, ty)) G.target = { x: tx, y: ty, t0: G.time };
  }
  function objAtTile(tx, ty) {
    var v = G.view;
    for (var i = v.objs.length - 1; i >= 0; i--) { var o = v.objs[i], d = R.dims(D.ITEM[o.id], o.rot); if (tx >= o.x && tx < o.x + d.w && ty >= o.y && ty < o.y + d.h) return o; }
    return null;
  }
  G.objAtTile = objAtTile;

  /* ================= 建築（置く・動かす・回す・戻す） ================= */
  G.build = { on: false, ghost: null, sel: null };
  G.setBuild = function (on) {
    G.build.on = on; G.build.ghost = null; G.build.sel = null;
    cv.classList.toggle('placing', on);
    G.buildBar();
    if (G.hud) G.hud(); // 依頼カードの出し入れ
  };
  G.startPlace = function (id, at) {
    var it = D.ITEM[id];
    if (!G.build.on) G.setBuild(true);
    var w = G.s2w(W / 2, H / 2), P = R.plot(G.S);
    var x = at ? at.x : Math.max(P.x0, Math.min(P.x1 - it.w + 1, Math.floor(w.x))), y = at ? at.y : Math.max(P.y0, Math.min(P.y1 - it.h + 1, Math.floor(w.y)));
    if (!at) { var f = G.freeSpot(id, x, y, 0); if (f) { x = f.x; y = f.y; } }
    G.build.ghost = { id: id, x: x, y: y, rot: at && at.rot || 0, lv: 1, rotated: false };
    G.build.sel = null;
    G.recheck();
    G.buildBar();
  };
  // 画面の中心に近い、置ける場所をさがす（重なり・範囲外を避ける）
  G.freeSpot = function (id, x0, y0, rot) {
    var it = D.ITEM[id], P = R.plot(G.S), best = null;
    for (var r = 0; r <= G.S.village.size; r++) {
      for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        var x = x0 + dx, y = y0 + dy;
        if (x < P.x0 || y < P.y0) continue;
        var c = R.canPlace(G.S, id, x, y, rot);
        if (c.ok || (c.missing && c.reason === '素材が足りません')) return { x: x, y: y };
      }
    }
    return best;
  };
  G.startMove = function (uid) {
    var o = R.getObj(G.S, uid); if (!o) return;
    G.build.ghost = { id: o.id, x: o.x, y: o.y, rot: o.rot, lv: o.lv, uid: uid, orig: { x: o.x, y: o.y, rot: o.rot } };
    G.recheck(); G.buildBar();
  };
  G.moveGhost = function (x, y) {
    var gh = G.build.ghost; if (!gh) return;
    var d = R.dims(D.ITEM[gh.id], gh.rot), P = R.plot(G.S);
    x = Math.max(P.x0 - 1, Math.min(P.x1 - d.w + 2, x)); y = Math.max(P.y0 - 1, Math.min(P.y1 - d.h + 2, y));
    if (x === gh.x && y === gh.y) return;
    gh.x = x; gh.y = y; G.recheck(); G.buildBar();
  };
  G.rotateGhost = function () {
    var gh = G.build.ghost; if (!gh) return;
    gh.rot = (gh.rot + 1) % 4; gh.rotated = true;
    G.recheck(); G.buildBar(); G.sfx && G.sfx('tap');
  };
  G.recheck = function () {
    var gh = G.build.ghost; if (!gh) return;
    gh.check = gh.uid ? R.canPlace(G.S, gh.id, gh.x, gh.y, gh.rot, { move: gh.uid }) : R.canPlace(G.S, gh.id, gh.x, gh.y, gh.rot);
  };
  var undoSnap = null, undoTimer = 0;
  function offerUndo(label) {
    if (G.tutorialActive && G.tutorialActive()) return;
    var b = $('#undo-btn'); b.hidden = false; b.textContent = '↶ 取り消し（' + label + '）'; placeUndo();
    clearTimeout(undoTimer); undoTimer = setTimeout(function () { b.hidden = true; undoSnap = null; }, 9000);
  }
  $('#undo-btn').addEventListener('click', function () {
    if (!undoSnap) return;
    G.S = R.migrate(JSON.parse(undoSnap)); G.view = G.S; undoSnap = null;
    $('#undo-btn').hidden = true; G.save(); G.hud(); G.syncResidents(); G.toast('取り消しました');
  });
  G.snapshot = function () { return JSON.stringify(G.S); };
  G.confirmGhost = function () {
    var gh = G.build.ghost; if (!gh) return;
    G.recheck();
    if (!gh.check.ok) { G.sfx && G.sfx('ng'); G.toast(gh.check.reason); return; }
    var snap = G.snapshot(), res;
    if (gh.uid) {
      res = R.move(G.S, gh.uid, gh.x, gh.y, gh.rot, !G.tutorialActive());
      if (!res.ok) { G.toast(res.reason); return; }
      G.build.ghost = null; G.build.sel = gh.uid;
      if (res.changed) { undoSnap = snap; offerUndo('移動'); }
      G.sfx && G.sfx('place');
      G.save(); G.buildBar(); G.hud();
      G.afterLayoutChange && G.afterLayoutChange({ moved: true });
      return;
    }
    res = R.place(G.S, gh.id, gh.x, gh.y, gh.rot, Date.now());
    if (!res.ok) { G.toast(res.reason); return; }
    undoSnap = snap; offerUndo('置く');
    G.puff(gh.x + 0.5, gh.y + 0.5); G.sfx && G.sfx('place');
    var it = D.ITEM[gh.id], d = R.dims(it, gh.rot);
    G.float(gh.x + d.w / 2, gh.y + d.h / 2, it.name + 'を置いた！', '#4f7a3d');
    var rotated = gh.rotated;
    G.build.ghost = null;
    G.save(); G.hud();
    G.afterPlace && G.afterPlace(res, rotated);
    G.buildBar();
  };
  G.cancelBuild = function () {
    if (G.build.ghost) { G.build.ghost = null; G.buildBar(); return; }
    G.setBuild(false);
    G.onBuildClosed && G.onBuildClosed();
  };
  G.selectObj = function (uid) { G.build.sel = uid; G.buildBar(); };
  G.storeSel = function () {
    var uid = G.build.sel; if (!uid) return;
    var o = R.getObj(G.S, uid); if (!o) return;
    var go = function () {
      var snap = G.snapshot(), r = R.store(G.S, uid);
      if (!r.ok) { G.toast(r.reason); return; }
      undoSnap = snap; offerUndo('倉庫へ');
      G.build.sel = null; G.save(); G.hud(); G.buildBar();
      G.toast(D.ITEM[o.id].name + 'を倉庫に戻しました' + (r.harvested && r.harvested.gained ? '（薬草' + r.harvested.gained + 'を受け取り）' : ''));
      G.afterLayoutChange && G.afterLayoutChange({ stored: o.id, replaced: r.replaced });
      G.syncResidents();
    };
    if (o.prod && o.prod.stored || o.home) G.confirm((o.home ? CH.BY_ID[o.home].name + 'の居場所です。倉庫に戻すと居場所がなくなります。' : '') + (o.prod && o.prod.stored ? 'たまっている薬草は受け取ります。育ちかけの分はなくなります。' : '') + '<br>レベルは倉庫でも保たれます。', go, '倉庫に戻す');
    else go();
  };
  G.upgradeSel = function () {
    var uid = G.build.sel, u = R.upgradeCost(G.S, uid); if (!u) return;
    var o = R.getObj(G.S, uid);
    G.confirm(D.ITEM[o.id].name + 'を Lv' + u.lv + ' に強化します。<br>' + (u.note || '') + '<br>必要：' + G.costText(u.cost), function () {
      var r = R.upgrade(G.S, uid);
      if (!r.ok) { G.toast(r.reason + (r.missing ? '（' + G.costText(r.missing) + '）' : '')); return; }
      G.sfx && G.sfx('level'); G.float(o.x + 1, o.y + 1, 'Lv' + r.lv + '！', '#c8452c'); G.save(); G.hud(); G.buildBar();
    }, '強化する');
  };
  // 取り消しボタンは建築の道具の上に出す（重ならないように）
  function placeUndo() {
    var bar = $('#build-bar'), b = $('#undo-btn');
    if (bar.hidden) { b.style.bottom = ''; return; }
    b.style.bottom = Math.round(window.innerHeight - bar.getBoundingClientRect().top + 10) + 'px';
  }
  G.buildBar = function () {
    var bar = $('#build-bar');
    if (!G.build.on || G.mode !== 'home') { bar.hidden = true; placeUndo(); return; }
    bar.hidden = false;
    setTimeout(placeUndo, 0);
    var gh = G.build.ghost, sel = G.build.sel ? R.getObj(G.S, G.build.sel) : null;
    var name = $('#bb-name'), msg = $('#bb-msg');
    $('#bb-rot').hidden = !gh; $('#bb-ok').hidden = !gh;
    $('#bb-store').hidden = !(sel && !gh); $('#bb-move').hidden = !(sel && !gh);
    $('#bb-up').hidden = !(sel && !gh && R.upgradeCost(G.S, sel.uid));
    $('#bb-cancel').textContent = gh ? '✕ やめる' : '✕ おわる';
    if (gh) {
      var it = D.ITEM[gh.id];
      name.textContent = (gh.uid ? '移動：' : '') + it.name;
      if (gh.check && gh.check.ok) {
        msg.className = 'ok';
        msg.textContent = gh.uid ? 'ここに動かせます（生産中の時間はそのまま）' : (gh.check.fromInv ? '倉庫から置けます（費用なし）' : '置けます（' + G.costText(it.cost) + '）');
      } else {
        msg.className = 'ng';
        msg.textContent = (gh.check ? gh.check.reason : '') + (gh.check && gh.check.missing ? '（あと ' + G.costText(gh.check.missing) + '）' : '');
      }
    } else if (sel) {
      var it2 = D.ITEM[sel.id];
      name.textContent = it2.name + (it2.levels ? ' Lv' + (sel.lv || 1) : '');
      msg.className = ''; msg.textContent = sel.home ? CH.BY_ID[sel.home].name + 'の居場所' : (sel.origin ? '由来：' + sel.origin : 'ドラッグで画面を動かせます');
    } else {
      name.textContent = '建築モード'; msg.className = ''; msg.textContent = '物をタップして選ぶ／下の「建築」から新しく置く';
    }
  };
  $('#bb-rot').addEventListener('click', function () { G.rotateGhost(); });
  $('#bb-ok').addEventListener('click', function () { G.confirmGhost(); });
  $('#bb-cancel').addEventListener('click', function () { G.cancelBuild(); });
  $('#bb-store').addEventListener('click', function () { G.storeSel(); });
  $('#bb-up').addEventListener('click', function () { G.upgradeSel(); });
  $('#bb-move').addEventListener('click', function () { if (G.build.sel) G.startMove(G.build.sel); });

  /* ================= 収穫・採集・片付け ================= */
  var tapSeq = 0;
  G.doHarvest = function (o) {
    var pv = R.harvestPreview(G.S, o.uid);
    if (pv && pv.full) { G.toast('薬草がいっぱいです（上限' + R.caps(G.S).herb + '）。依頼で使うか、倉庫を強化しよう'); G.sfx && G.sfx('ng'); return; }
    var claim = 'h:' + o.uid + ':' + (++tapSeq) + ':' + Date.now();
    var r = R.harvest(G.S, o.uid, claim);
    if (!r.ok) { if (!r.dup) G.toast(r.reason); return; }
    G.sfx && G.sfx('harvest');
    var d = R.dims(D.ITEM[o.id], o.rot);
    G.float(o.x + d.w / 2, o.y + d.h / 2, '🌿+' + r.gained, '#3f7a35');
    if (pv && (pv.toMailbox || pv.staysInField)) G.toast('上限のため、' + (pv.staysInField ? '畑に' + pv.staysInField + '個のこしました' : '') + (pv.toMailbox ? ' 受け取り箱に' + pv.toMailbox + '個入れました' : ''));
    G.save(); G.hud();
    G.afterAction && G.afterAction('harvest', o);
  };
  G.doGather = function (g) {
    var r = R.gather(G.S, g.id, 'g:' + g.id + ':' + (++tapSeq));
    if (!r.ok) { if (r.reason) G.toast(r.reason); return; }
    G.sfx && G.sfx('harvest'); G.float(g.x + 0.5, g.y + 0.5, '🪵+' + r.gained, '#8a5a36');
    G.save(); G.hud(); G.afterAction && G.afterAction('gather', g);
  };
  G.doDebris = function (d) {
    var r = R.clearDebris(G.S, d.id);
    if (!r.ok) return;
    G.puff(d.x + 0.5, d.y + 0.5); G.sfx && G.sfx('place');
    var t = []; if (r.gained.wood) t.push('🪵+' + r.gained.wood); if (r.gained.coin) t.push('🪙+' + r.gained.coin);
    G.float(d.x + 0.5, d.y + 0.5, t.join(' '), '#8a5a36');
    G.dirtyGround = true; G.save(); G.hud();
    G.afterAction && G.afterAction('debris', d, r);
  };

  /* ================= 住民の歩き方 ================= */
  G.syncResidents = function () {
    if (G.mode !== 'home') return;
    var S = G.S;
    // 住民がいなければ出す・いなくなった人は消す
    Object.keys(S.residents).forEach(function (id) { if (!G.walker(id)) { var p = spawnPoint(id); G.spawn(id, 'resident', p.x, p.y); } });
    G.walkers.forEach(function (w) { if (w.kind === 'resident' && !S.residents[w.id]) w.gone = true; });
    if (!G.walker('me')) { var k = S.objs.filter(function (o) { return o.id === 'koya'; })[0], sp = k ? G.nearTile(k) : null; var P = R.plot(S); G.spawn('me', 'me', sp ? sp.x : P.x0 + 5, sp ? sp.y : P.y0 + 7); }
  };
  function spawnPoint(id) {
    var r = G.S.residents[id], o = r && r.home ? R.getObj(G.S, r.home) : null;
    var t = o ? G.nearTile(o) : null;
    if (t) return t;
    var P = R.plot(G.S), blk = blockedMap(G.view);
    for (var i = 0; i < 40; i++) { var x = P.x0 + 1 + Math.floor(Math.random() * (G.S.village.size - 2)), y = P.y0 + 1 + Math.floor(Math.random() * (G.S.village.size - 2)); if (!blk[x + ',' + y]) return { x: x, y: y }; }
    return { x: P.x0 + 2, y: P.y0 + 2 };
  }
  G.residentAI = function (dt) {
    if (G.mode !== 'home' && G.mode !== 'visit') return;
    G.walkers.forEach(function (w) {
      if (w.kind !== 'resident' || w.path.length || w.busy) return;
      if (w.until > G.time) return;
      w.until = G.time + 5 + Math.random() * 9;
      var S = G.view, ch = CH.BY_ID[w.id], r = S.residents[w.id];
      var liked = S.objs.filter(function (o) { var it = D.ITEM[o.id]; return ch.likes.some(function (t) { return it.tags.indexOf(t) >= 0; }) || o.uid === (r && r.home) || o.id === 'chaya'; });
      var o = liked.length && Math.random() < 0.75 ? liked[Math.floor(Math.random() * liked.length)] : null;
      var t = o ? G.nearTile(o, { x: Math.floor(w.x), y: Math.floor(w.y) }) : null;
      if (!t) { var P = R.plot(S); t = { x: P.x0 + Math.floor(Math.random() * S.village.size), y: P.y0 + Math.floor(Math.random() * S.village.size) }; }
      G.walkTo(w, t.x, t.y, function (ok) {
        if (ok && o && Math.random() < 0.5) { var it = D.ITEM[o.id]; var fav = ch.likes.some(function (tg) { return it.tags.indexOf(tg) >= 0; }); if (fav) w.emote = { text: ['♪', '❤', '✨'][Math.floor(Math.random() * 3)], until: G.time + 3 }; }
      });
    });
  };

  /* ================= ループ ================= */
  var last = performance.now(), tickAcc = 0;
  function loop(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    G.time += dt;
    tickAcc += dt;
    if (tickAcc > 1 && G.S && G.mode === 'home') { tickAcc = 0; G.tick(); G.hudLite && G.hudLite(); G.visitorTick && G.visitorTick(); }
    updateWalkers(dt);
    G.residentAI(dt);
    draw();
    if (G.pointAt && G.pointAt.el) { var r = G.pointAt.el.getBoundingClientRect(), pel = $('#pointer'); pel.hidden = false; pel.style.left = (r.left + r.width / 2) + 'px'; pel.style.top = (r.top + 4) + 'px'; }
    requestAnimationFrame(loop);
  }
  G.startLoop = function () { requestAnimationFrame(loop); };
  // 写真：別のキャンバスに今の里を描く
  G.renderTo = function (canvas, camFit) {
    var saved = { ctx: ctx, W: W, H: H, DPR: DPR, cam: { x: G.cam.x, y: G.cam.y, z: G.cam.z }, hits: G.hits, build: G.build, pa: G.pointAt };
    ctx = canvas.getContext('2d'); W = canvas.width; H = canvas.height; DPR = 1;
    G.cam.x = camFit.x; G.cam.y = camFit.y; G.cam.z = camFit.z;
    G.build = { on: false, ghost: null, sel: null }; G.pointAt = null;
    var gk = groundKey; groundKey = '';
    G.photoMode = true; draw(); G.photoMode = false;
    ctx = saved.ctx; W = saved.W; H = saved.H; DPR = saved.DPR; G.cam.x = saved.cam.x; G.cam.y = saved.cam.y; G.cam.z = saved.cam.z; G.hits = saved.hits; G.build = saved.build; G.pointAt = saved.pa;
    groundKey = ''; G.dirtyGround = true;
  };
  window.NSL_ISO_onSprite = function () { };

  /* ================= 小物 ================= */
  G.costText = function (cost) {
    if (!cost) return '';
    var n = { coin: 'コイン', wood: '木材', herb: '薬草', seal: '交流印' }, out = [];
    for (var k in cost) if (cost[k]) out.push(n[k] + cost[k]);
    return out.join('・');
  };
  G.W = function () { return W; }; G.H = function () { return H; };
})();
