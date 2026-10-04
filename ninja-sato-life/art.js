/* ニンジャ里ライフ — キャラクター描画エンジン（SVG）
 *
 * 39体のちびキャラを「向き（yaw）・しぐさ（pose）・表情（expr）」を指定して描く。
 * 頭は楕円体、胴は円錐台として3D空間に置き、少し見下ろすカメラで投影するので、
 * まえ・ななめ・よこ・うしろ・歩きの向きでパーツ（鉢金・髪・刀・尻尾）の位置が矛盾しない。
 * ブラウザ（ゲーム内スプライト・名鑑のシート）と Node（シート画像の生成）の両方で動く。外部ライブラリなし。
 *
 * 座標：体の空間は x=向かって右（正面向きのとき）・y=上・z=手前。地面が y=0。
 * 出力 viewBox は 200×240、地面は画面 y=232。
 */
(function (root) {
  'use strict';

  var D2R = Math.PI / 180;
  var OUT = '#2b1d16';      // 輪郭（こげ茶）
  var LW = 3;               // 輪郭の太さ
  var GROUND = 232;
  var SKIN = '#f7dcc2';
  var uidSeq = 0;

  /* ---------------- 数値・色 ---------------- */
  function r1(n) { return Math.round(n * 10) / 10; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function wrap(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
  function rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
  function dk(c, t) { return mix(c, '#1a1110', t == null ? 0.24 : t); }
  function lt(c, t) { return mix(c, '#ffffff', t == null ? 0.35 : t); }
  function lum(c) { var A = rgb(c); return (0.299 * A[0] + 0.587 * A[1] + 0.114 * A[2]) / 255; }

  /* ---------------- パス ---------------- */
  function P(p) { return r1(p.x) + ' ' + r1(p.y); }
  function polyD(pts) { if (!pts.length) return ''; var d = 'M' + P(pts[0]); for (var i = 1; i < pts.length; i++) d += 'L' + P(pts[i]); return d + 'Z'; }
  function openD(pts) { if (!pts.length) return ''; var d = 'M' + P(pts[0]); for (var i = 1; i < pts.length; i++) d += 'L' + P(pts[i]); return d; }
  // Catmull-Rom → 3次ベジェ（なめらかな閉曲線／開曲線）
  function smoothD(pts, closed, ten) {
    var n = pts.length; if (n < 3) return closed ? polyD(pts) : openD(pts);
    ten = ten == null ? 1 : ten;
    var d = 'M' + P(pts[0]); var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
      var p1 = pts[i], p2 = pts[(i + 1) % n];
      var p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)];
      var c1 = { x: p1.x + (p2.x - p0.x) * ten / 6, y: p1.y + (p2.y - p0.y) * ten / 6 };
      var c2 = { x: p2.x - (p3.x - p1.x) * ten / 6, y: p2.y - (p3.y - p1.y) * ten / 6 };
      d += 'C' + P(c1) + ' ' + P(c2) + ' ' + P(p2);
    }
    return d + (closed ? 'Z' : '');
  }
  function hull(pts) {
    var a = pts.slice().sort(function (p, q) { return p.x - q.x || p.y - q.y; });
    if (a.length < 3) return a;
    function cr(o, p, q) { return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x); }
    var lo = [], up = [], i;
    for (i = 0; i < a.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], a[i]) <= 0) lo.pop(); lo.push(a[i]); }
    for (i = a.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], a[i]) <= 0) up.pop(); up.push(a[i]); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  function ellD(cx, cy, rx, ry) {
    return 'M' + r1(cx - rx) + ' ' + r1(cy) + 'A' + r1(rx) + ' ' + r1(ry) + ' 0 1 0 ' + r1(cx + rx) + ' ' + r1(cy) + 'A' + r1(rx) + ' ' + r1(ry) + ' 0 1 0 ' + r1(cx - rx) + ' ' + r1(cy) + 'Z';
  }
  // 丸い端の管（2点・両端の半径）
  function capsD(a, b, wa, wb) {
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 0.01) return ellD(a.x, a.y, Math.max(wa, wb), Math.max(wa, wb));
    var nx = -dy / L, ny = dx / L;
    return 'M' + r1(a.x + nx * wa) + ' ' + r1(a.y + ny * wa) + 'L' + r1(b.x + nx * wb) + ' ' + r1(b.y + ny * wb) +
      'A' + r1(wb) + ' ' + r1(wb) + ' 0 0 0 ' + r1(b.x - nx * wb) + ' ' + r1(b.y - ny * wb) +
      'L' + r1(a.x - nx * wa) + ' ' + r1(a.y - ny * wa) +
      'A' + r1(wa) + ' ' + r1(wa) + ' 0 0 0 ' + r1(a.x + nx * wa) + ' ' + r1(a.y + ny * wa) + 'Z';
  }
  // 背骨（画面座標の点列）と幅から、筆で描いたような輪郭
  function brushPts(sp, ws) {
    var n = sp.length, L = [], R = [];
    for (var i = 0; i < n; i++) {
      var a = sp[Math.max(0, i - 1)], b = sp[Math.min(n - 1, i + 1)];
      var dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      var nx = -dy / l, ny = dx / l, w = ws[i] / 2;
      L.push({ x: sp[i].x + nx * w, y: sp[i].y + ny * w });
      R.push({ x: sp[i].x - nx * w, y: sp[i].y - ny * w });
    }
    return L.concat(R.reverse());
  }
  function interp(arr, n) { // 配列を n 点に補間
    var out = []; for (var i = 0; i < n; i++) { var t = i / (n - 1) * (arr.length - 1), k = Math.min(arr.length - 2, Math.floor(t)), u = t - k; out.push(lerp(arr[k], arr[k + 1], u)); } return out;
  }
  function bez3(p0, p1, p2, p3, n) { // 3D ベジェを n 点に
    var o = []; for (var i = 0; i < n; i++) {
      var t = i / (n - 1), a = (1 - t) * (1 - t) * (1 - t), b = 3 * (1 - t) * (1 - t) * t, c = 3 * (1 - t) * t * t, d = t * t * t;
      o.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]]);
    } return o;
  }

  /* ---------------- SVG 部品 ---------------- */
  function sp(d, fill, o) { // 塗り＋輪郭
    o = o || {};
    return '<path d="' + d + '" fill="' + fill + '"' + (o.op != null ? ' opacity="' + o.op + '"' : '') +
      (o.noStroke ? '' : ' stroke="' + (o.sc || OUT) + '" stroke-width="' + (o.w || LW) + '" stroke-linejoin="round" stroke-linecap="round"') +
      (o.clip ? ' clip-path="url(#' + o.clip + ')"' : '') + (o.extra || '') + '/>';
  }
  function sl(d, col, w, o) { // 線だけ
    o = o || {};
    return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"' +
      (o.op != null ? ' opacity="' + o.op + '"' : '') + (o.clip ? ' clip-path="url(#' + o.clip + ')"' : '') + (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
  }
  function sf(d, fill, o) { o = o || {}; return sp(d, fill, { noStroke: true, op: o.op, clip: o.clip }); }
  function g(inner, clip, extra) { return '<g' + (clip ? ' clip-path="url(#' + clip + ')"' : '') + (extra || '') + '>' + inner + '</g>'; }
  function txt(x, y, s, size, col, o) {
    o = o || {};
    return '<text x="' + r1(x) + '" y="' + r1(y) + '" font-size="' + size + '" fill="' + col + '" text-anchor="middle" font-weight="' + (o.fw || 700) + '" font-family="\'Zen Maru Gothic\',\'Hiragino Maru Gothic ProN\',\'Yu Gothic\',sans-serif">' + s + '</text>';
  }

  /* ---------------- 場（描画の積み重ね） ---------------- */
  function Scene(uid) { this.items = []; this.defs = []; this.uid = uid; this.n = 0; }
  Scene.prototype.add = function (z, s) { if (s) this.items.push({ z: z, i: this.items.length, s: s }); };
  Scene.prototype.id = function (p) { this.n++; return this.uid + p + this.n; };
  Scene.prototype.clip = function (d) { var id = this.id('c'); this.defs.push('<clipPath id="' + id + '"><path d="' + d + '"/></clipPath>'); return id; };
  Scene.prototype.def = function (s) { this.defs.push(s); };
  Scene.prototype.out = function () {
    this.items.sort(function (a, b) { return a.z - b.z || a.i - b.i; });
    return '<defs>' + this.defs.join('') + '</defs>' + this.items.map(function (x) { return x.s; }).join('');
  };

  /* ---------------- カメラ ---------------- */
  function Cam(yaw, pitch) {
    this.yaw = yaw;
    var a = yaw * D2R, p = (pitch == null ? 9 : pitch) * D2R;
    this.cyw = Math.cos(a); this.syw = Math.sin(a); this.cp = Math.cos(p); this.sp = Math.sin(p);
    this.ox = 100; this.oy = GROUND;
    this.wy = null; // 頭身を変えるときの高さの写し方（体の空間の y → y）
  }
  Cam.prototype.p = function (x, y, z) {
    if (this.wy) y = this.wy(y);
    var xr = x * this.cyw + z * this.syw, zr = -x * this.syw + z * this.cyw;
    return { x: this.ox + xr, y: this.oy - (y * this.cp - zr * this.sp), d: zr * this.cp + y * this.sp, z: zr };
  };
  Cam.prototype.pv = function (v) { return this.p(v[0], v[1], v[2]); };
  Cam.prototype.nd = function (nx, ny, nz) { var zr = -nx * this.syw + nz * this.cyw; return zr * this.cp + ny * this.sp; };
  Cam.prototype.ex = function (rx, rz) { return Math.sqrt(Math.pow(rx * this.cyw, 2) + Math.pow(rz * this.syw, 2)); }; // 楕円体の見かけの横半径

  /* ---------------- 頭（楕円体） ---------------- */
  function Head(h, cam) {
    this.h = h; this.cam = cam; this.k = h.rx / 50;
    var c = cam.p(h.x, h.y, h.z); this.cx = c.x; this.cy = c.y; this.cd = c.z;
    this.ry2 = Math.sqrt(Math.pow(h.ry * cam.cp, 2) + Math.pow(h.rz * cam.sp, 2));
  }
  Head.prototype.pt3 = function (th, ph, dr) {
    var t = th * D2R, f = ph * D2R, h = this.h; dr = dr || 0;
    return [h.x + (h.rx + dr) * Math.sin(t) * Math.cos(f), h.y + (h.ry + dr) * Math.sin(f), h.z + (h.rz + dr) * Math.cos(t) * Math.cos(f)];
  };
  Head.prototype.p = function (th, ph, dr) { var q = this.pt3(th, ph, dr); return this.cam.p(q[0], q[1], q[2]); };
  Head.prototype.va = function (th) { return wrap(th + this.cam.yaw); }; // 視線に対する角度
  Head.prototype.pc = function (th, ph, dr) { // 見えている半球に押し込む
    var a = this.va(th); if (a > 90) a = 90; if (a < -90) a = -90;
    return this.p(a - this.cam.yaw, ph, dr);
  };
  Head.prototype.local = function (x, y, z) { // 頭基準の局所座標（半径50基準）→ 体の空間
    var k = this.k, h = this.h; return [h.x + x * k, h.y + y * k, h.z + z * k];
  };
  Head.prototype.pl = function (x, y, z) { var q = this.local(x, y, z); return this.cam.p(q[0], q[1], q[2]); };
  Head.prototype.feat = function (th, ph, dr) {
    var a = this.va(th), p = this.p(th, ph, dr || 0), c = Math.cos(a * D2R);
    return { x: p.x, y: p.y, s: c, vis: c > 0.1, a: a };
  };
  // 線 lineFn(θ) より上（髪・頭巾）の領域
  Head.prototype.capPts = function (lineFn, vol, edge, rough) {
    var yaw = this.cam.yaw, tL = -90 - yaw, tR = 90 - yaw, pts = [], th, ph, i = 0;
    for (th = tL; th <= tR + 0.01; th += 2) pts.push(this.p(th, lineFn(wrap(th)), edge || 0));
    var phR = lineFn(wrap(tR)), phL = lineFn(wrap(tL));
    var rv = function (ph, base) { // 毛束の先（ゆっくり張り出して、すっと戻る）
      if (!rough) return 0;
      var u = (ph + 400) / 19, f = u - Math.floor(u), saw = f < 0.78 ? f / 0.78 : (1 - f) / 0.22;
      return rough * saw * saw * sstep(base, base + 10, ph) * (1 - sstep(62, 84, ph));
    };
    for (ph = phR; ph <= 90; ph += rough ? 2 : 3) pts.push(this.p(tR, ph, vol * sstep(phR, phR + 22, ph) + rv(ph, phR)));
    for (ph = 90; ph >= phL; ph -= rough ? 2 : 3) pts.push(this.p(tL, ph, vol * sstep(phL, phL + 22, ph) + rv(ph + 6.5, phL)));
    return pts;
  };
  // 線より下（口布・顔の毛色）の領域
  Head.prototype.lowPts = function (lineFn, dr) {
    var yaw = this.cam.yaw, tL = -90 - yaw, tR = 90 - yaw, pts = [], th, ph;
    dr = dr || 0;
    for (th = tL; th <= tR + 0.01; th += 2) pts.push(this.p(th, lineFn(wrap(th)), dr));
    var phR = lineFn(wrap(tR)), phL = lineFn(wrap(tL));
    for (ph = phR; ph >= -90; ph -= 3) pts.push(this.p(tR, ph, dr));
    for (ph = -90; ph <= phL; ph += 3) pts.push(this.p(tL, ph, dr));
    return pts;
  };
  // 2本の線にはさまれた帯（鉢巻）
  Head.prototype.bandPts = function (topFn, botFn, dr) {
    var yaw = this.cam.yaw, tL = -90 - yaw, tR = 90 - yaw, pts = [], th, ph;
    for (th = tL; th <= tR + 0.01; th += 3) pts.push(this.p(th, topFn(wrap(th)), dr));
    for (ph = topFn(wrap(tR)); ph >= botFn(wrap(tR)); ph -= 2) pts.push(this.p(tR, ph, dr));
    for (th = tR; th >= tL - 0.01; th -= 3) pts.push(this.p(th, botFn(wrap(th)), dr));
    for (ph = botFn(wrap(tL)); ph <= topFn(wrap(tL)); ph += 2) pts.push(this.p(tL, ph, dr));
    return pts;
  };
  // (θ,φ) の閉曲線を投影（見えない部分は輪郭に押し込む）
  Head.prototype.shapePts = function (poly, dr, n) {
    var pts = [], i, sm = [];
    // (θ,φ) の多角形を細かく補間
    n = n || 6;
    for (i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      for (var k = 0; k < n; k++) sm.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
    }
    for (i = 0; i < sm.length; i++) pts.push(this.pc(sm[i][0], sm[i][1], dr || 0));
    return pts;
  };
  Head.prototype.center = function (th, ph) { return Math.cos(this.va(th) * D2R) * Math.cos(ph * D2R); };
  Head.prototype.silD = function (grow) { grow = grow || 0; return ellD(this.cx, this.cy, this.h.rx + grow, this.ry2 + grow); };

  /* ---------------- 胴（円錐台） ---------------- */
  function Trunk(cam, o) { this.cam = cam; this.o = o; }
  Trunk.prototype.rad = function (y) { var o = this.o, v = clamp((y - o.y0) / (o.y1 - o.y0), -0.2, 1.2); return [lerp(o.rx0, o.rx1, v), lerp(o.rz0, o.rz1, v)]; };
  Trunk.prototype.pt3 = function (th, y, dr) {
    var r = this.rad(y), t = th * D2R, o = this.o; dr = dr || 0;
    return [o.x + (r[0] + dr) * Math.sin(t), y, o.z + (r[1] + dr) * Math.cos(t)];
  };
  Trunk.prototype.p = function (th, y, dr) { return this.cam.pv(this.pt3(th, y, dr)); };
  Trunk.prototype.vis = function (th, y) {
    var r = this.rad(y), t = th * D2R; return this.cam.nd(Math.sin(t) / r[0], 0, Math.cos(t) / r[1]);
  };
  Trunk.prototype.front = function () { // 最もカメラを向く θ
    var o = this.o, rx = (o.rx0 + o.rx1) / 2, rz = (o.rz0 + o.rz1) / 2;
    return Math.atan2(-this.cam.syw / rx, this.cam.cyw / rz) / D2R;
  };
  Trunk.prototype.silPts = function (extraYs) {
    var o = this.o, pts = [], ys = [o.y0, o.y1].concat(extraYs || []);
    for (var j = 0; j < ys.length; j++) for (var i = 0; i < 40; i++) pts.push(this.p(i * 9, ys[j], 0));
    return hull(pts);
  };
  // 見えている範囲で θ を sample（面上の模様用）
  Trunk.prototype.arc = function (y, dr, t0, t1, step) {
    var pts = []; step = step || 4;
    for (var th = t0; th <= t1 + 0.01; th += step) pts.push(this.p(th, y, dr));
    return pts;
  };

  /* ---------------- ポーズ（関節の位置） ---------------- */
  var BUILDS = {
    normal: { hr: 50, headY: 146, sy: 97, sx: 23, hem: 40, srx: 25, srz: 16, hrx: 33, hrz: 21, hip: 10, legW: 17, armW: 9.5, hand: 6.8, obi: [56, 67] },
    small: { hr: 50, headY: 140, sy: 91, sx: 21, hem: 38, srx: 23, srz: 15, hrx: 31, hrz: 20, hip: 9.5, legW: 16, armW: 9, hand: 6.6, obi: [53, 63] },
    big: { hr: 48, headY: 152, sy: 104, sx: 33, hem: 42, srx: 36, srz: 22, hrx: 34, hrz: 22, hip: 13, legW: 21, armW: 14, hand: 9.5, obi: [48, 60] },
    chick: { hr: 56, headY: 116, sy: 72, sx: 26, hem: 30, srx: 28, srz: 22, hrx: 32, hrz: 24, hip: 10, legW: 7, armW: 8, hand: 7, obi: [40, 50] }
  };

  /* ---------------- 頭身を変える（opt.heads：2.7 など） ----------------
   * 頭は「あご」を中心に s 倍に縮め、あごより下の体を縦に伸ばす（足首まではそのまま、脚は kL 倍、胴は kT 倍）。
   * あごより上はそのまま上へずらすので、顔と髪の形はくずれない。伸ばし方の境目はなめらかにつなぐ。
   * 服や小物は体の空間の高さ（y）で決めてあるので、そのままの数値で長い体に合う。
   * s：頭の縮め方。kT：胴の伸ばし方（脚の伸ばし方 kL は頭身から決まる）。dh：その体格の頭身の差（小さい子は低め）。
   * spread：足を開く幅。hip：脚の付け根を外へ。legW：脚の太さ。arm：手を下げる量。out：手を体から離す量。
   * opt.heads がないとき（ニンジャ里ライフ）は、これまでと同じ2頭身の絵になる。 */
  var TALL = {
    normal: { s: 0.86, kT: 1.38, dh: 0, spread: 7, hip: 1.5, legW: 1.18, arm: 4, out: 7 },
    small: { s: 0.86, kT: 1.3, dh: -0.2, spread: 6, hip: 1.5, legW: 1.15, arm: 3, out: 6 },
    big: { s: 0.9, kT: 1.3, dh: 0, spread: 8, hip: 1.5, legW: 1.15, arm: 4, out: 6 },
    chick: { s: 0.94, kT: 1.15, dh: -0.9, spread: 3, hip: 0, legW: 1, arm: 2, out: 3 }
  };
  function sstepInt(x, d) { // なめらかな段差（幅 2d）を積分したもの
    if (x <= -d) return 0;
    if (x >= d) return x;
    var u = (x + d) / (2 * d);
    return 2 * d * (u * u * u - u * u * u * u / 2);
  }
  function tallFit(b0, key, heads) {
    var t = TALL[key] || TALL.normal;
    var ry = b0.hr * 0.92, chin = b0.headY - ry, H0 = ry * 2, s = t.s;
    var N = heads + t.dh;
    var ya = 10, hem = b0.hem, d1 = 4, d2 = 8, d3 = 8, c3 = chin - d3;
    var chin2 = (N - 1) * H0 * s;
    var kT = t.kT, kL = (chin2 - ya - d3 - kT * (c3 - hem)) / (hem - ya);
    if (kL < kT) { kL = kT = (chin2 - ya - d3) / (c3 - ya); }
    var b = {};
    for (var k in b0) b[k] = b0[k];
    b.hr = b0.hr * s; b.headY = chin + (b0.headY - chin) * s;
    b.legW = b0.legW * t.legW; b.hip = b0.hip + t.hip; b.spread = t.spread; b.armDrop = t.arm; b.armOut = t.out; b.swing = Math.sqrt(kL);
    var wy = function (y) {
      return y + (kL - 1) * sstepInt(y - ya, d1) + (kT - kL) * sstepInt(y - hem, d2) + (1 - kT) * sstepInt(y - c3, d3);
    };
    return { b: b, wy: wy, hs: s, chin: chin, kL: kL, kT: kT };
  }
  function tallY(c, y) { // 頭の高さにある点は、頭と一緒に縮めて動かす
    return c.tall && y > c.tall.chin ? c.tall.chin + (y - c.tall.chin) * c.tall.hs : y;
  }
  function scrY(c, y) { // 画面に直に置いた絵（2頭身の画面座標）を、伸ばした体に合わせる
    if (!c.tall) return y;
    var cp = c.cam.cp, by = tallY(c, (GROUND - y) / cp);
    return GROUND - c.cam.wy(by) * cp;
  }

  function rig(def, pose, frame, bt) {
    var b = bt || BUILDS[def.build || 'normal'];
    var R = { b: b, bob: 0, arms: {}, legs: {}, lean: 0 };
    var s, sy = b.sy;
    for (var k = 0; k < 2; k++) {
      s = k ? 1 : -1;
      R.arms[s] = { S: [s * b.sx, sy - 5, 0], E: [s * (b.sx + 10 + (b.armOut || 0) * 0.45), sy - 25, 0], H: [s * (b.sx + 17 + (b.armOut || 0)), sy - 43 - (b.armDrop || 0), 5], hand: 'open' };
      R.legs[s] = { hip: [s * b.hip, b.hem + 8, 0], A: [s * (b.hip + 2.5 + (b.spread || 0)), 10, 1] };
    }
    pose = pose || 'stand';
    if (def.pose && pose === 'stand') pose = def.pose;
    var L = R.arms[-1], Rt = R.arms[1];
    if (pose === 'happy') {
      Rt.E = [b.sx + 12, sy + 10, 4]; Rt.H = [b.sx + 8, sy + 32, 8]; Rt.hand = 'fist';
      L.E = [-(b.sx + 6), sy - 22, 12]; L.H = [-11, sy - 12, 26]; L.hand = 'fist';
      R.legs[1].A = [b.hip + 5, 26, -16]; R.bob = 4;
    } else if (pose === 'surprised') {
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 8), sy - 20, 10]; R.arms[s].H = [s * 15, sy - 4, 26]; R.arms[s].hand = 'open'; }
      R.legs[-1].A = [-(b.hip + 6 + (b.spread || 0)), 10, 2]; R.legs[1].A = [b.hip + 6 + (b.spread || 0), 10, 2];
    } else if (pose === 'serious' || pose === 'seal') {
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 6), sy - 22, 12]; R.arms[s].H = [s * 3.5, sy - 14, 28]; R.arms[s].hand = 'fist'; }
      R.seal = true;
    } else if (pose === 'wave') {
      Rt.E = [b.sx + 14, sy + 4, 2]; Rt.H = [b.sx + 22, sy + 26, 4]; Rt.hand = 'open';
    } else if (pose === 'walk') {
      var ph = (frame || 0) * Math.PI / 2;
      for (k = 0; k < 2; k++) {
        s = k ? 1 : -1;
        var sw = Math.sin(ph + (s > 0 ? 0 : Math.PI));
        var lift = Math.max(0, Math.cos(ph + (s > 0 ? 0 : Math.PI)));
        R.legs[s].A = [s * (b.hip + 1.5 + (b.spread || 0) * 0.4), 10 + lift * 6, 1 + sw * 13 * (b.swing || 1)];
        R.arms[s].H = [s * (b.sx + 14), sy - 42 - (b.armDrop || 0), 5 - sw * 13];
        R.arms[s].E = [s * (b.sx + 9), sy - 24, 1 - sw * 6];
      }
      R.bob = 1.6 * Math.abs(Math.cos(ph));
    } else if (pose === 'hold') {
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 7), sy - 24, 12]; R.arms[s].H = [s * 10, sy - 22, 27]; R.arms[s].hand = 'open'; }
      R.hold = true;
    } else if (pose === 'fists') {
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 8), sy - 24, 10]; R.arms[s].H = [s * 12, sy - 26, 22]; R.arms[s].hand = 'fist'; }
    }
    // キャラ固有の立ちポーズ（ピース・印・柄に手 など）。y は肩の高さ sy からの差
    if (def.arm && (pose === 'stand' || pose === def.pose)) {
      for (var key in def.arm) {
        var ov = def.arm[key], side = +key, arm = R.arms[side];
        if (!arm) continue;
        if (ov.E) arm.E = [ov.E[0], sy + ov.E[1], ov.E[2]];
        if (ov.H) arm.H = [ov.H[0], sy + ov.H[1], ov.H[2]];
        if (ov.hand) arm.hand = ov.hand;
      }
    }
    R.pose = pose;
    return R;
  }

  /* ---------------- 顔のパーツ ---------------- */
  var EYE_DARK = '#20161a';
  function eyeSvg(x, y, k, e, side, expr, S) {
    var st = e.style || 'dot', c = e.color || EYE_DARK, rx = 5.4 * k, ry = 7.4 * S, out = '';
    if (side > 0 && e.color2) c = e.color2;
    if (expr === 'happy') {
      return sl('M' + r1(x - rx) + ' ' + r1(y + 2) + 'Q' + r1(x) + ' ' + r1(y - 7.5 * S) + ' ' + r1(x + rx) + ' ' + r1(y + 2), EYE_DARK, 2.8 * S);
    }
    if (expr === 'serious' || st === 'closed') {
      var o = sl('M' + r1(x - rx - 0.5) + ' ' + r1(y - 1) + 'Q' + r1(x) + ' ' + r1(y + 4.5 * S) + ' ' + r1(x + rx + 0.5) + ' ' + r1(y - 1), EYE_DARK, 2.8 * S);
      if (e.lash || st === 'closed') o += sl('M' + r1(x + side * rx * 0.9) + ' ' + r1(y) + 'l' + r1(side * 3 * k) + ' ' + r1(1.5 * S), EYE_DARK, 2 * S);
      return o;
    }
    if (expr === 'surprised') {
      out += sp(ellD(x, y, 6.2 * k, 8 * S), '#ffffff', { w: 2 * S });
      out += sf(ellD(x, y + 0.5, 2.6 * k, 3.4 * S), e.color && st !== 'dot' ? c : EYE_DARK);
      return out;
    }
    if (st === 'wide') {
      out += sp(ellD(x, y, 7 * k, 8 * S), '#ffffff', { w: 2 * S });
      out += sf(ellD(x + side * 0.5, y + 1, 2.2 * k, 2.6 * S), EYE_DARK);
      return out;
    }
    if (st === 'dot') {
      out += sf(ellD(x, y, rx * 0.95, ry), EYE_DARK);
      out += sf(ellD(x - 1.6 * k, y - 2.6 * S, 1.9 * Math.max(0.6, k), 1.9 * S), '#ffffff');
      return out;
    }
    // iris 系（sharp / half / iris）
    var id = 'e' + Math.random().toString(36).slice(2, 8);
    out += sp(ellD(x, y, rx, ry), c, { w: 1.6 * S, sc: EYE_DARK });
    out += sf(ellD(x, y + 0.8 * S, rx * 0.5, ry * 0.55), dk(c, 0.72));
    if (e.pupil === 'star') out += starSvg(x - 1.2 * k, y - 1.8 * S, 3.2 * S, e.pupilColor || '#ffd54a');
    else if (e.pupil === 'heart') out += heartSvg(x, y + 0.5 * S, 3.3 * S, e.pupilColor || '#ff5aa0');
    else if (e.pupil === 'diamond') out += sf('M' + r1(x) + ' ' + r1(y - 4 * S) + 'l' + r1(2.4 * k) + ' ' + r1(4 * S) + 'l' + r1(-2.4 * k) + ' ' + r1(4 * S) + 'l' + r1(-2.4 * k) + ' ' + r1(-4 * S) + 'Z', '#1a0a0a');
    out += sf(ellD(x - 1.6 * k, y - 2.8 * S, 1.8 * Math.max(0.6, k), 1.8 * S), '#ffffff');
    if (st === 'sharp') { // つり目：上まぶたを斜めに
      var ix = x - side * rx, ox = x + side * rx;
      out += sf('M' + r1(ix - side * 2) + ' ' + r1(y - ry - 3) + 'L' + r1(ox + side * 3) + ' ' + r1(y - ry - 3) + 'L' + r1(ox + side * 3) + ' ' + r1(y - ry * 0.55) + 'L' + r1(ix - side * 2) + ' ' + r1(y - ry * 0.05) + 'Z', e.skin || SKIN);
      out += sl('M' + r1(ix - side * 1.5) + ' ' + r1(y - ry * 0.05) + 'L' + r1(ox + side * 2.5) + ' ' + r1(y - ry * 0.6), EYE_DARK, 2.8 * S);
    } else if (st === 'half') {
      out += sf('M' + r1(x - rx - 2) + ' ' + r1(y - ry - 2) + 'L' + r1(x + rx + 2) + ' ' + r1(y - ry - 2) + 'L' + r1(x + rx + 2) + ' ' + r1(y - 1.2 * S) + 'L' + r1(x - rx - 2) + ' ' + r1(y - 1.2 * S) + 'Z', e.skin || SKIN);
      out += sl('M' + r1(x - rx - 1) + ' ' + r1(y - 1.2 * S) + 'L' + r1(x + rx + 1) + ' ' + r1(y - 1.2 * S), EYE_DARK, 2.6 * S);
    } else if (e.lash) {
      out += sl('M' + r1(x - rx - 0.8) + ' ' + r1(y - ry * 0.35) + 'Q' + r1(x) + ' ' + r1(y - ry * 1.25) + ' ' + r1(x + rx + 0.8) + ' ' + r1(y - ry * 0.35), EYE_DARK, 2.6 * S);
      out += sl('M' + r1(x + side * (rx + 0.5)) + ' ' + r1(y - ry * 0.4) + 'l' + r1(side * 2.6 * k) + ' ' + r1(-1.6 * S), EYE_DARK, 2 * S);
    }
    return out;
  }
  function starSvg(x, y, r, col) {
    var p = []; for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.38 : r; p.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr }); }
    return sf(polyD(p), col);
  }
  function heartSvg(x, y, r, col) {
    return sf('M' + r1(x) + ' ' + r1(y + r) + 'C' + r1(x - r * 1.6) + ' ' + r1(y - r * 0.2) + ' ' + r1(x - r * 0.6) + ' ' + r1(y - r * 1.4) + ' ' + r1(x) + ' ' + r1(y - r * 0.5) +
      'C' + r1(x + r * 0.6) + ' ' + r1(y - r * 1.4) + ' ' + r1(x + r * 1.6) + ' ' + r1(y - r * 0.2) + ' ' + r1(x) + ' ' + r1(y + r) + 'Z', col);
  }
  function sparkle(x, y, r, col) {
    return sp('M' + r1(x) + ' ' + r1(y - r) + 'Q' + r1(x + r * 0.18) + ' ' + r1(y - r * 0.18) + ' ' + r1(x + r) + ' ' + r1(y) + 'Q' + r1(x + r * 0.18) + ' ' + r1(y + r * 0.18) + ' ' + r1(x) + ' ' + r1(y + r) +
      'Q' + r1(x - r * 0.18) + ' ' + r1(y + r * 0.18) + ' ' + r1(x - r) + ' ' + r1(y) + 'Q' + r1(x - r * 0.18) + ' ' + r1(y - r * 0.18) + ' ' + r1(x) + ' ' + r1(y - r) + 'Z', col, { w: 1.4, sc: dk(col, 0.35) });
  }

  function mouthSvg(x, y, k, S, kind, expr, def) {
    var w = 5 * k;
    if (expr === 'happy') kind = kind === 'dog' || kind === 'cat' || kind === 'beak' ? kind + 'Open' : (kind === 'fang' || kind === 'grinFang' ? 'openFang' : 'open');
    else if (expr === 'surprised') kind = kind === 'beak' ? 'beakOpen' : (kind === 'dog' || kind === 'cat' ? kind + 'O' : 'o');
    else if (expr === 'serious') kind = kind === 'beak' ? 'beak' : (kind === 'dog' || kind === 'cat' ? kind : 'flat');
    var MOUTH = '#8e2f2d', TONGUE = '#ef8c8c';
    switch (kind) {
      case 'open': case 'openFang': case 'grin': case 'grinFang': case 'shout': {
        var ww = (kind === 'shout' ? 5.5 : 6.5) * k, dd = kind === 'shout' ? 9 * S : 8.5 * S;
        var d = 'M' + r1(x - ww) + ' ' + r1(y - 1.5 * S) + 'Q' + r1(x) + ' ' + r1(y + dd * 1.6) + ' ' + r1(x + ww) + ' ' + r1(y - 1.5 * S) + 'Z';
        if (kind === 'shout') d = 'M' + r1(x - ww) + ' ' + r1(y - 2 * S) + 'L' + r1(x + ww) + ' ' + r1(y - 3 * S) + 'L' + r1(x + ww * 0.7) + ' ' + r1(y + dd) + 'L' + r1(x - ww * 0.7) + ' ' + r1(y + dd) + 'Z';
        var o = sp(d, MOUTH, { w: 1.8 * S });
        o += sf(ellD(x + 0.5, y + dd * 0.62, ww * 0.55, 2.8 * S), TONGUE);
        if (kind === 'grin' || kind === 'grinFang') o += sf('M' + r1(x - ww + 1) + ' ' + r1(y - 1) + 'L' + r1(x + ww - 1) + ' ' + r1(y - 1) + 'L' + r1(x + ww - 2) + ' ' + r1(y + 2 * S) + 'L' + r1(x - ww + 2) + ' ' + r1(y + 2 * S) + 'Z', '#ffffff');
        if (kind === 'openFang' || kind === 'grinFang' || (def && def.fang)) o += sp('M' + r1(x + 2.2 * k) + ' ' + r1(y - 1.2 * S) + 'l' + r1(1.6 * k) + ' ' + r1(3.4 * S) + 'l' + r1(1.6 * k) + ' ' + r1(-3.2 * S) + 'Z', '#ffffff', { w: 1 * S });
        return o;
      }
      case 'fang':
        return sl('M' + r1(x - w) + ' ' + r1(y - 1) + 'Q' + r1(x) + ' ' + r1(y + 5 * S) + ' ' + r1(x + w) + ' ' + r1(y - 1), OUT, 2.2 * S) +
          sp('M' + r1(x + 1.5 * k) + ' ' + r1(y + 1.3 * S) + 'l' + r1(1.4 * k) + ' ' + r1(3 * S) + 'l' + r1(1.5 * k) + ' ' + r1(-3.4 * S) + 'Z', '#ffffff', { w: 1 * S });
      case 'o':
        return sp(ellD(x, y + 2 * S, 3.4 * k, 4.4 * S), MOUTH, { w: 1.8 * S });
      case 'flat':
        return sl('M' + r1(x - 3.5 * k) + ' ' + r1(y + 1) + 'L' + r1(x + 3.5 * k) + ' ' + r1(y + 1), OUT, 2.2 * S);
      case 'frown':
        return sl('M' + r1(x - 4 * k) + ' ' + r1(y + 2.5) + 'Q' + r1(x) + ' ' + r1(y - 1.5 * S) + ' ' + r1(x + 4 * k) + ' ' + r1(y + 2.5), OUT, 2.2 * S);
      case 'smirk':
        return sl('M' + r1(x - 4.5 * k) + ' ' + r1(y + 1.5) + 'Q' + r1(x + 1) + ' ' + r1(y + 3.5 * S) + ' ' + r1(x + 5 * k) + ' ' + r1(y - 2 * S), OUT, 2.2 * S);
      case 'tongue':
        return sl('M' + r1(x - w) + ' ' + r1(y - 1) + 'Q' + r1(x) + ' ' + r1(y + 4.5 * S) + ' ' + r1(x + w) + ' ' + r1(y - 1), OUT, 2.2 * S) +
          sp('M' + r1(x + 0.5 * k) + ' ' + r1(y + 2 * S) + 'q' + r1(1.5 * k) + ' ' + r1(6 * S) + ' ' + r1(4.5 * k) + ' ' + r1(0.2 * S) + 'Z', TONGUE, { w: 1.6 * S });
      case 'none': return '';
      default: // smile
        return sl('M' + r1(x - w) + ' ' + r1(y - 1) + 'Q' + r1(x) + ' ' + r1(y + 4.5 * S) + ' ' + r1(x + w) + ' ' + r1(y - 1), OUT, 2.2 * S);
    }
  }

  /* ---------------- 髪の生え際 ---------------- */
  function hairlineFn(hp, seed) {
    var fr = hp.front == null ? 4 : hp.front, sd = hp.side == null ? -30 : hp.side, bk = hp.back == null ? -45 : hp.back;
    var fw = hp.fw == null ? 52 : hp.fw, bangs = hp.bangs || 'straight';
    var amp = hp.amp == null ? 9 : hp.amp, per = hp.per || 16;
    return function (th) {
      var a = Math.abs(th), ph;
      if (a <= 90) ph = lerp(fr, sd, sstep(fw, 88, a));
      else ph = lerp(sd, bk, sstep(92, 160, a));
      if (a < fw + 8) {
        var wgt = 1 - sstep(fw - 6, fw + 8, a);
        if (bangs === 'jag' || bangs === 'messy') {
          var u = (th + 400 + (hp.phase || 0)) / per, fr2 = u - Math.floor(u);
          var tri = fr2 < 0.5 ? fr2 * 2 : (1 - fr2) * 2;
          var am = amp; if (bangs === 'messy') am = amp * (0.6 + 0.4 * Math.sin(Math.floor(u) * 12.9898 + (seed || 1)));
          ph += (tri - 0.5) * am * wgt + am * 0.5 * wgt * 0.2;
        } else if (bangs === 'side') {
          ph += (hp.slope == null ? -0.28 : hp.slope) * th * wgt;
        } else if (bangs === 'part') {
          ph += (hp.partH || 14) * Math.max(0, 1 - a / (hp.partW || 26)) * wgt;
        } else if (bangs === 'swept') {
          ph += (hp.slope == null ? 0.3 : hp.slope) * th * wgt + (tri2(th / 14)) * 4 * wgt;
        } else if (bangs === 'none') {
          ph = Math.max(ph, hp.front);
        }
      }
      if ((bangs === 'jag' || bangs === 'messy') && a >= fw - 6) { // 横と後ろの毛先もぎざぎざ
        var u2 = (th + 500) / 17, f2 = u2 - Math.floor(u2), t2 = f2 < 0.5 ? f2 * 2 : (1 - f2) * 2;
        ph += (t2 - 0.5) * amp * 0.75 * sstep(fw - 6, fw + 10, a);
      }
      if (hp.cover) { // 片目を隠す前髪
        var c0 = hp.cover[0], c1 = hp.cover[1], cl = hp.cover[2] == null ? -38 : hp.cover[2];
        var lo = Math.min(c0, c1), hi = Math.max(c0, c1);
        if (th > lo - 12 && th < hi + 12) ph = lerp(ph, cl, sstep(lo - 12, lo + 4, th) * (1 - sstep(hi - 4, hi + 12, th)));
      }
      return ph;
    };
  }
  function tri2(u) { var f = u - Math.floor(u); return f < 0.5 ? f * 2 : (1 - f) * 2; }

  /* ---------------- 部品レジストリ ---------------- */
  var Z = { BACK: -40, FARARM: -12, LEG: -8, FOOT: -7, TORSO: 0, OVER: 3, ARM: 10, PROP: 12, HEAD: 100, FRONT: 300 };

  /* ---------------- 本体 ---------------- */
  function render(def, opt) {
    opt = opt || {};
    var yaw = opt.yaw == null ? 0 : opt.yaw;
    var pose = opt.pose || 'stand';
    var expr = opt.expr || (pose === 'happy' ? 'happy' : pose === 'surprised' ? 'surprised' : (pose === 'serious' ? 'serious' : 'normal'));
    var uid = 'n' + (++uidSeq).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    var S = new Scene(uid);
    var cam = new Cam(yaw, opt.pitch);
    var tall = opt.heads ? tallFit(BUILDS[def.build || 'normal'] || BUILDS.normal, def.build || 'normal', opt.heads) : null;
    if (tall) cam.wy = tall.wy;
    var R = rig(def, pose, opt.frame, tall && tall.b);
    var b = R.b;
    var ctx = { def: def, opt: opt, S: S, cam: cam, R: R, b: b, yaw: yaw, expr: expr, pose: R.pose, back: Math.abs(wrap(yaw)) > 95, uid: uid, tall: tall, hs: tall ? tall.hs : 1 };
    ctx.skin = def.skin || SKIN;
    cam.oy = GROUND - R.bob;

    if (opt.shadow !== false) S.add(-100, sf(ellD(100, GROUND + 1, 44, 8), '#3a2a1e', { op: 0.16 }));
    drawBody(ctx);
    drawHead(ctx);
    if (def.companions && opt.companions !== false) drawCompanions(ctx);
    if (opt.fx) drawFx(ctx, opt.fx);

    var vb = opt.viewBox || '0 0 200 240';
    var w = opt.w || 200, h = opt.h || 240;
    var inner = S.out();
    if (opt.raw) return inner;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="' + w + '" height="' + h + '">' + inner + '</svg>';
  }

  /* ================= 頭 ================= */
  function drawHead(c) {
    var def = c.def, b = c.b, cam = c.cam, S = c.S;
    var hd = def.head || {};
    var hr = (hd.r ? hd.r * c.hs : b.hr), H = new Head({ x: 0, y: b.headY + (hd.dy || 0) * c.hs, z: (hd.dz || 0) * c.hs, rx: hr * (hd.sx || 1), ry: hr * (hd.sy || 0.92), rz: hr }, cam);
    c.H = H;
    var kind = hd.kind || 'human';
    var hp = def.hair || null, vol = hp ? (hp.vol == null ? 5 : hp.vol) : 0;
    c.vol = vol;
    var base = kind === 'human' ? c.skin : (hd.fur || c.skin);
    var ZH = Z.HEAD;

    // 首（うしろ向きで見える）
    // 後ろ髪・耳など頭より後ろ
    if (hp) drawHairMasses(c, H, hp, ZH);
    if (def.ears) drawEars(c, H, def.ears, ZH);
    if (def.horns) drawHorns(c, H, def.horns, ZH);

    // 頭の地
    S.add(ZH + 1, sp(H.silD(0), base));
    var headClip = S.clip(H.silD(0));
    c.headClip = headClip;
    if (kind === 'dog' || kind === 'cat') drawAnimalFace(c, H, hd, ZH);
    if (kind === 'gorilla') drawGorillaFace(c, H, hd, ZH);
    if (kind === 'chick') drawChickFace(c, H, hd, ZH);

    // 顔
    if (!def.mask || (def.mask.kind === 'cloth' || def.mask.kind === 'scarf')) drawFace(c, H, ZH);
    if (def.mask) drawMask(c, H, def.mask, ZH);
    if (def.hood) {
      var hood = def.hood;
      var hf = hairlineFn({ front: hood.front == null ? -3 : hood.front, side: -92, back: -92, fw: 48, bangs: 'straight' });
      var pts = H.capPts(hf, 3, 0.5);
      S.add(ZH + 20, sp(smoothD(pts, true, 0.6), hood.color));
      // 頭巾のしわ
      var t0 = H.p(-10, 70, 3), t1 = H.p(20, 40, 3);
      if (!c.back) S.add(ZH + 20.5, sl('M' + P(H.p(-50, -40, 2)) + 'Q' + P(H.p(-70, 0, 3)) + ' ' + P(H.p(-60, 30, 3)), dk(hood.color, 0.35), 2, { clip: headClip }));
    }
    if (def.veil) drawVeil(c, H, def.veil, ZH);
    if (hp) drawHairCap(c, H, hp, ZH);
    if (hp && hp.tipColor) drawHairTips(c, H, hp, ZH);
    if (def.streaks && hp) drawStreaks(c, H, def.streaks, hp, ZH);
    if (def.crest) drawCrest(c, H, def.crest, ZH);
    if (def.band) drawBand(c, H, def.band, ZH);
    if (hp && hp.locks) drawLocks(c, H, hp, ZH);
    if (def.eyepatch) drawEyepatch(c, H, def.eyepatch, ZH);
    if (def.glasses) drawGlasses(c, H, def.glasses, ZH);
    if (def.hat) drawHat(c, H, def.hat, ZH);
    if (def.crown) drawCrown(c, H, def.crown, ZH);
    if (def.candles) drawCandles(c, H, def.candles, ZH);
    if (def.arrow) drawArrow(c, H, ZH);
    if (def.pins) drawPins(c, H, def.pins, ZH);
    if (def.ribbon) drawRibbon(c, H, def.ribbon, ZH);
    if (def.flower) drawFlowerPin(c, H, def.flower, ZH);
    if (def.earring) drawEarring(c, H, def.earring, ZH);
  }

  function drawFace(c, H, ZH) {
    var def = c.def, S = c.S, e = def.eyes || {}, k = H.k, expr = c.expr;
    var ex = e.x || 24, ey = e.y == null ? -13 : e.y;
    var eyeExpr = expr;
    if (e.lock) eyeExpr = 'normal';
    // チーク
    if (def.cheek !== false && !c.back) {
      var cc = def.cheek || '#f29a9a';
      for (var s = -1; s <= 1; s += 2) {
        var f = H.feat(s * 40, -27);
        if (f.vis) S.add(ZH + 3, sf(ellD(f.x, f.y, 6.2 * k * Math.max(0.35, f.s), 3.6 * k), cc, { op: expr === 'happy' ? 0.7 : 0.5 }));
      }
    }
    // 目
    for (var si = -1; si <= 1; si += 2) {
      var fe = H.feat(si * ex, ey);
      if (!fe.vis) continue;
      var kk = k * Math.max(0.3, fe.s);
      var eside = si;
      var ecfg = e;
      if (def.eyepatch && def.eyepatch.side === si) continue;
      if (e.scar === si) { S.add(ZH + 6, sl('M' + r1(fe.x - 5 * kk) + ' ' + r1(fe.y - 5) + 'L' + r1(fe.x + 5 * kk) + ' ' + r1(fe.y + 5) + 'M' + r1(fe.x + 5 * kk) + ' ' + r1(fe.y - 5) + 'L' + r1(fe.x - 5 * kk) + ' ' + r1(fe.y + 5), EYE_DARK, 2.6)); continue; }
      if (e.wink === si && expr === 'normal') { S.add(ZH + 6, sl('M' + r1(fe.x - 5 * kk) + ' ' + r1(fe.y + 1) + 'Q' + r1(fe.x) + ' ' + r1(fe.y - 6) + ' ' + r1(fe.x + 5 * kk) + ' ' + r1(fe.y + 1), EYE_DARK, 2.8)); continue; }
      var sty = ecfg.style;
      if (e.styleL && si < 0) sty = e.styleL;
      if (e.styleR && si > 0) sty = e.styleR;
      var ee = { style: sty, color: e.color, color2: e.color2, lash: e.lash, pupil: e.pupil, pupilColor: e.pupilColor, skin: c.skin };
      S.add(ZH + 6, eyeSvg(fe.x, fe.y, kk, ee, eside, eyeExpr, k));
      // アイシャドウ・目じりの紅
      if (def.shadowLid && eyeExpr === 'normal') S.add(ZH + 5, sf(ellD(fe.x, fe.y - 6 * k, 6.5 * kk, 3.2 * k), def.shadowLid, { op: 0.55 }));
      if (def.liner && eyeExpr !== 'happy') S.add(ZH + 6.5, sl('M' + r1(fe.x + si * 5.4 * kk) + ' ' + r1(fe.y - 1) + 'l' + r1(si * 4.2 * kk) + ' ' + r1(-2.5), def.liner, 2.4));
    }
    // 眉
    if (def.brows !== 'none' && !c.back) {
      var bw = def.brows === 'thick' ? 3.4 : 2.2, bc = def.browColor || (def.hair ? dk(def.hair.color, 0.35) : '#3b2a22');
      for (var sb = -1; sb <= 1; sb += 2) {
        var fb = H.feat(sb * ex, ey + 15);
        if (!fb.vis) continue;
        if (def.band && def.band.lo != null && ey + 15 > def.band.lo - 2 && !def.browsOver) continue;
        var kb = k * Math.max(0.3, fb.s), inY = 0, outY = 0;
        var angry = def.brows === 'angry' || expr === 'serious';
        if (angry) { inY = 3; outY = -2; }
        if (expr === 'surprised') { inY = -3; outY = -3; }
        if (def.brows === 'worried') { inY = -2; outY = 2; }
        var ix = fb.x - sb * 4.5 * kb, ox = fb.x + sb * 5 * kb;
        S.add(ZH + 7, sl('M' + r1(ix) + ' ' + r1(fb.y + inY) + 'Q' + r1(fb.x) + ' ' + r1(fb.y - 2 + (inY + outY) / 2) + ' ' + r1(ox) + ' ' + r1(fb.y + outY), bc, bw));
      }
    }
    // 口
    var hd = def.head || {};
    var mk = def.mouth || 'smile';
    if (hd.kind === 'dog' || hd.kind === 'cat' || hd.kind === 'chick' || hd.kind === 'gorilla') return; // 動物は鼻づらで描く
    var fm = H.feat(0, def.mouthY == null ? -31 : def.mouthY);
    if (fm.s > -0.05 && !c.back) {
      var km = k * clamp(fm.s, 0.45, 1);
      S.add(ZH + 6, mouthSvg(fm.x, fm.y, km, k, mk, expr, def));
      if (mk === 'leaf' || def.leaf) S.add(ZH + 6.5, leafSvg(fm.x + 7 * km, fm.y + 1, k));
      if (def.pipe) { var px0 = fm.x + 5 * km, py0 = fm.y + 1; S.add(ZH + 6.6, sl('M' + r1(px0) + ' ' + r1(py0) + 'L' + r1(px0 + 20 * km) + ' ' + r1(py0 + 5), OUT, 4.4) + sl('M' + r1(px0) + ' ' + r1(py0) + 'L' + r1(px0 + 20 * km) + ' ' + r1(py0 + 5), def.pipe, 2.4) + sp('M' + r1(px0 + 18 * km) + ' ' + r1(py0 + 2) + 'l5 0l0 -6l-5 0Z', def.pipe, { w: 1.4 })); }
    }
    // 顔の印
    if (def.marks && !c.back) drawMarks(c, H, def.marks, ZH);
  }
  function leafSvg(x, y, k) {
    return sl('M' + r1(x) + ' ' + r1(y) + 'l' + r1(6 * k) + ' ' + r1(2 * k), '#4f7a3a', 1.6) +
      sp('M' + r1(x + 5 * k) + ' ' + r1(y + 2 * k) + 'q' + r1(6 * k) + ' ' + r1(-7 * k) + ' ' + r1(13 * k) + ' ' + r1(-2 * k) + 'q' + r1(-6 * k) + ' ' + r1(7 * k) + ' ' + r1(-13 * k) + ' ' + r1(2 * k) + 'Z', '#6fae4c', { w: 1.6 });
  }

  function drawMarks(c, H, marks, ZH) {
    var S = c.S, k = H.k;
    marks.forEach(function (m) {
      var s, f;
      if (m.kind === 'freckles') {
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 38, -25); if (!f.vis) continue; for (var i = 0; i < 3; i++) S.add(ZH + 4, sf(ellD(f.x + (i - 1) * 2.8 * k * f.s, f.y + (i === 1 ? -1.5 : 0.8), 0.9, 0.9), m.color || '#b06b4f')); }
      } else if (m.kind === 'whiskers') {
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 42, -24); if (!f.vis) continue; for (var j = -1; j <= 1; j++) S.add(ZH + 4, sl('M' + r1(f.x - s * 4 * k * f.s) + ' ' + r1(f.y + j * 3) + 'l' + r1(s * 8 * k * f.s) + ' ' + r1(j * 0.8), m.color || '#3b2a22', 1.5)); }
      } else if (m.kind === 'dot' || m.kind === 'urna') {
        f = H.feat(m.th || 0, m.ph || 14); if (f.vis) S.add(ZH + 4, sf(ellD(f.x, f.y, (m.r || 2.2) * k * Math.max(0.4, f.s), (m.r || 2.2) * k), m.color || '#d33a3a'));
      } else if (m.kind === 'diamond') {
        f = H.feat(0, m.ph || 12); if (f.vis) { var r = 3.4 * k, kx = Math.max(0.4, f.s); S.add(ZH + 4, sf('M' + r1(f.x) + ' ' + r1(f.y - r) + 'l' + r1(r * 0.7 * kx) + ' ' + r1(r) + 'l' + r1(-r * 0.7 * kx) + ' ' + r1(r) + 'l' + r1(-r * 0.7 * kx) + ' ' + r1(-r) + 'Z', m.color || '#d8263f')); }
      } else if (m.kind === 'lines') { // 頬の斜め線
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 40, -26); if (!f.vis) continue; for (var q = 0; q < 2; q++) S.add(ZH + 4, sl('M' + r1(f.x + (q * 3 - 3) * k * f.s) + ' ' + r1(f.y + 2) + 'l' + r1(2.5 * k * f.s) + ' ' + r1(-4), m.color || '#e0823a', 1.6)); }
      } else if (m.kind === 'drool') {
        f = H.feat(8, -36); if (f.vis) S.add(ZH + 8, sp('M' + r1(f.x) + ' ' + r1(f.y) + 'q' + r1(2) + ' ' + r1(6) + ' ' + r1(0.5) + ' ' + r1(11) + 'q' + r1(-3) + ' ' + r1(2) + ' ' + r1(-3) + ' ' + r1(-2) + 'q' + r1(0) + ' ' + r1(-5) + ' ' + r1(2.5) + ' ' + r1(-9) + 'Z', m.color || '#9ad06a', { w: 1.5 }));
      } else if (m.kind === 'brows_red') { // 眉間の紅
        f = H.feat(0, 6); if (f.vis) S.add(ZH + 4, sf(ellD(f.x, f.y, 1.8 * k, 3.4 * k), m.color || '#d33a3a'));
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 22, 10); if (f.vis) S.add(ZH + 4, sf(ellD(f.x, f.y, 3 * k * f.s, 1.3 * k), m.color || '#d33a3a')); }
      } else if (m.kind === 'mole') {
        f = H.feat(m.side * 30, -24); if (f.vis) S.add(ZH + 4, sf(ellD(f.x, f.y, 1.1, 1.1), '#3a2a22'));
      } else if (m.kind === 'blood') {
        f = H.feat(m.th || 22, m.ph || 58); if (f.vis) S.add(ZH + 22, sf('M' + r1(f.x) + ' ' + r1(f.y) + 'q' + r1(3) + ' ' + r1(5) + ' ' + r1(0) + ' ' + r1(9) + 'q' + r1(-3) + ' ' + r1(-4) + ' ' + r1(0) + ' ' + r1(-9) + 'Z', '#a02424'));
      } else if (m.kind === 'stitch') {
        f = H.feat(m.th || -30, m.ph || 30); if (f.vis) S.add(ZH + 22, sl('M' + r1(f.x - 5) + ' ' + r1(f.y) + 'l' + r1(10) + ' ' + r1(2) + 'M' + r1(f.x - 3) + ' ' + r1(f.y - 3) + 'l0 6M' + r1(f.x + 1) + ' ' + r1(f.y - 2) + 'l0 6', OUT, 1.5));
      }
    });
  }

  /* ---- 髪 ---- */
  function drawHairCap(c, H, hp, ZH) {
    var S = c.S, hf = hairlineFn(hp, c.def.seed || 7);
    c.hairFn = hf;
    var vol = hp.vol == null ? 5 : hp.vol;
    var rough = hp.rough != null ? hp.rough : (hp.bangs === 'jag' || hp.bangs === 'messy' ? 7 : 0);
    var pts = H.capPts(hf, vol, hp.edge || 1.2, rough);
    var d = hp.bangs === 'jag' || hp.bangs === 'messy' ? polyD(pts) : smoothD(pts, true, 0.5);
    S.add(ZH + 30, sp(d, hp.color));
    var cid = S.clip(d);
    c.hairClip = cid;
    // ハイライト（上側に1本）と毛の流れ
    var fullMask = c.def.mask && (c.def.mask.kind === 'fox' || c.def.mask.kind === 'oni' || c.def.mask.kind === 'robot');
    if (!hp.noShine && !fullMask) {
      var hl = []; for (var th = -48; th <= 8; th += 6) { var f = H.feat(th, 50); if (f.s > 0.05) hl.push(H.p(th, 50, vol * 0.8)); }
      if (hl.length > 2) S.add(ZH + 31, sl(smoothD(hl, false), hp.shine || lt(hp.color, 0.3), 3.5, { clip: cid, op: 0.9 }));
    }
    // 生え際の影
    var sh = []; var yaw = c.cam.yaw;
    for (var t = -90 - yaw; t <= 90 - yaw; t += 3) sh.push(H.p(t, hf(wrap(t)) + 5, 0.8));
    if (sh.length > 2 && !hp.noLines) S.add(ZH + 31, sl(smoothD(sh, false), dk(hp.color, 0.25), 2.2, { clip: cid, op: 0.55 }));
    // 前髪の筋
    if (!hp.noLines && (hp.bangs === 'straight' || hp.bangs === 'part' || hp.bangs === 'side')) {
      var strands = hp.strands || [-30, -12, 8, 26];
      strands.forEach(function (tt) {
        var a = H.feat(tt, hf(tt) + 3), b2 = H.feat(tt * 0.85 + 2, hf(tt) + 22);
        if (a.s > 0.2) S.add(ZH + 31, sl('M' + r1(a.x) + ' ' + r1(a.y) + 'L' + r1(b2.x) + ' ' + r1(b2.y), dk(hp.color, 0.3), 1.6, { clip: cid, op: 0.8 }));
      });
    }
  }

  function drawStreaks(c, H, streaks, hp, ZH) {
    var S = c.S, hf = c.hairFn;
    streaks.forEach(function (st) {
      var t0 = st.th, w = st.w || 7;
      var poly = [];
      if (st.kind === 'bolt') {
        var base = hf(t0);
        poly = [[t0 - w, base + 2], [t0 - w * 0.2, base + 12], [t0 - w * 0.9, base + 16], [t0 + w * 0.3, base + 38], [t0 + w * 0.6, base + 22], [t0 + w * 1.2, base + 20], [t0 + w * 0.2, base + 2]];
      } else {
        var b0 = hf(t0 - w / 2), b1 = hf(t0 + w / 2), len = st.len || 30;
        poly = [[t0 - w / 2, b0 - 1], [t0 + w / 2, b1 - 1], [t0 + w * 0.3 + (st.lean || 0), b1 + len], [t0 - w * 0.3 + (st.lean || 0), b0 + len]];
      }
      var f = H.feat(t0, hf(t0) + 10);
      if (f.s < 0.05) return;
      S.add(ZH + 31.5, sp(smoothD(H.shapePts(poly, (hp.vol || 5) * 0.3 + 1.2, 4), true, 0.4), st.color, { clip: c.hairClip, w: 1.6 }));
    });
  }

  function massD(c, spine3, widths, opt) { // 3D 背骨＋幅 → 輪郭パス
    opt = opt || {};
    var cam = c.cam, n = opt.n || 14;
    var pts = spine3.length === 4 && !opt.poly ? bez3(spine3[0], spine3[1], spine3[2], spine3[3], n) : spine3;
    var ws = interp(widths, pts.length);
    var scr = pts.map(function (p) { return cam.pv(p); });
    var yawc = Math.abs(Math.cos(c.yaw * D2R));
    if (opt.wz != null) { // 横幅と奥行き幅が違う（髪のカーテン）
      var wzs = interp(opt.wz, pts.length);
      ws = ws.map(function (w, i) { return Math.sqrt(Math.pow(w * yawc, 2) + Math.pow(wzs[i] * Math.sin(c.yaw * D2R), 2)); });
    }
    var bp = brushPts(scr, ws);
    var dsum = 0; scr.forEach(function (p) { dsum += p.z; });
    return { d: smoothD(bp, true, 0.9), depth: dsum / scr.length, scr: scr, ws: ws };
  }

  function addMass(c, zBehind, zFront, m, fill, o) {
    o = o || {};
    // 頭の中心より奥なら後ろ、手前なら前
    var z = (m.depth - c.H.cd) < (o.th == null ? 0 : o.th) ? zBehind : zFront;
    c.S.add(z, sp(m.d, fill, { w: o.w }));
    if (o.line) c.S.add(z + 0.01, sl(smoothD(m.scr, false), o.line, 1.6, { op: 0.6 }));
    return z;
  }

  function drawHairMasses(c, H, hp, ZH) {
    var S = c.S, col = hp.color, k = H.k;
    var parts = hp.parts || [];
    parts.forEach(function (pt) {
      var t = pt.kind, m, s;
      if (t === 'pony') {
        s = pt.sway == null ? -1 : pt.sway;
        var up = pt.up == null ? 1 : pt.up, len = pt.len == null ? 1 : pt.len;
        var a = H.local(s * 6, 36, -38), b0 = H.local(s * 34 * len, 58 * up, -58), b1 = H.local(s * 64 * len, 34 * up, -52), b2 = H.local(s * 62 * len, -4 * len, -46);
        m = massD(c, [a, b0, b1, b2], pt.w || [14, 26, 28, 22, 4]);
        var zz = addMass(c, Z.BACK + 2, ZH + 26, m, col);
        S.add(zz + 0.02, sl(smoothD(m.scr, false), dk(col, 0.3), 1.8, { op: 0.6 }));
        if (pt.tie) { // 結び目のリボン
          var tp = c.cam.pv(H.local(s * 6, 40, -40));
          var zt = (tp.z - H.cd) < 0 ? ZH + 0.5 : ZH + 32;
          if (c.back || Math.abs(wrap(c.yaw)) > 60) zt = ZH + 32;
          S.add(zt, bowSvg(tp.x, tp.y - 2, 1.05 * k, pt.tie, pt.tieKind));
        }
      } else if (t === 'long') {
        var L = pt.len || 1;
        var p0 = H.local(0, 18, -26), p1 = H.local(0, -20, -40), p2 = H.local(0, -60 * L, -40), p3 = H.local(0, -95 * L, -34);
        m = massD(c, [p0, p1, p2, p3], pt.w || [96, 104, 104, 92, 70], { wz: pt.wz || [40, 40, 36, 30, 20] });
        S.add(Z.BACK + 1, sp(m.d, col));
        var ends = [];
        // 毛先のギザギザ（下端）
        S.add(Z.BACK + 1.01, sl(smoothD(m.scr, false), dk(col, 0.25), 1.5, { op: 0.5 }));
        if (c.back) S.add(Z.OVER + 6, sp(m.d, col)); // うしろ向きでは背中の上に
      } else if (t === 'bun') {
        var bp = H.pt3(pt.th, pt.ph, pt.r * 0.45);
        var sc = c.cam.pv(bp), rr = pt.r * k;
        var zb = (sc.z - H.cd) < -4 ? ZH - 2 : ZH + 29;
        S.add(zb, sp(ellD(sc.x, sc.y, rr, rr * 0.95), col));
        S.add(zb + 0.01, sl('M' + r1(sc.x - rr * 0.55) + ' ' + r1(sc.y - rr * 0.35) + 'Q' + r1(sc.x) + ' ' + r1(sc.y - rr * 0.8) + ' ' + r1(sc.x + rr * 0.5) + ' ' + r1(sc.y - rr * 0.4), lt(col, 0.3), 2.4));
        if (pt.ring) S.add(zb + 0.02, sl('M' + r1(sc.x - rr * 0.7) + ' ' + r1(sc.y + rr * 0.55) + 'Q' + r1(sc.x) + ' ' + r1(sc.y + rr * 0.95) + ' ' + r1(sc.x + rr * 0.7) + ' ' + r1(sc.y + rr * 0.55), pt.ring, 3));
      } else if (t === 'top') { // 髷・ちょんまげ
        var hgt = pt.h || 1, tip = pt.tip || 'round';
        var q0 = H.local(0, 44, pt.z0 == null ? -4 : pt.z0), q1 = H.local(pt.x1 || 0, 60 * hgt, (pt.z0 || -4) - 4), q2 = H.local(pt.x2 || 0, 72 * hgt, (pt.z0 || -4) - 10), q3 = H.local(pt.x3 || 0, 78 * hgt, (pt.z0 || -4) - 16);
        m = massD(c, [q0, q1, q2, q3], pt.w || [22, 18, 16, 6]);
        S.add(ZH + 28.5, sp(m.d, col));
        if (pt.ring) { var rp = c.cam.pv(H.local(0, 50 + 3 * hgt, -5)); S.add(ZH + 28.6, sp(ellD(rp.x, rp.y, 7 * k, 3 * k), pt.ring, { w: 2 })); }
      } else if (t === 'spikes') {
        (pt.list || []).forEach(function (sk) {
          var th = sk[0], ph = sk[1], L = sk[2] || 22, wd = sk[3] || 11, lean = sk[4] || 0;
          var base = H.pt3(th, ph, -2), tipP = H.pt3(th + lean, ph + L * 0.9, L);
          var sb = c.cam.pv(base), st = c.cam.pv(tipP);
          var dx = st.x - sb.x, dy = st.y - sb.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = wd * k / 2;
          var d = 'M' + r1(sb.x + nx * w) + ' ' + r1(sb.y + ny * w) + 'Q' + r1(sb.x + dx * 0.55 + nx * w * 0.5) + ' ' + r1(sb.y + dy * 0.55 + ny * w * 0.5) + ' ' + r1(st.x) + ' ' + r1(st.y) +
            'Q' + r1(sb.x + dx * 0.45 - nx * w * 0.7) + ' ' + r1(sb.y + dy * 0.45 - ny * w * 0.7) + ' ' + r1(sb.x - nx * w) + ' ' + r1(sb.y - ny * w) + 'Z';
          var zs = (sb.z - H.cd) < -8 ? ZH - 1 : ZH + 29.5;
          S.add(zs, sp(d, pt.color || col));
        });
      } else if (t === 'curtain') { // 顔の横に落ちる長い髪（前）
        for (var si = -1; si <= 1; si += 2) {
          if (pt.side && pt.side !== si) continue;
          var ln = pt.len || 1;
          var c0 = H.local(si * 46, -6, 10), c1 = H.local(si * 52, -40, 8), c2 = H.local(si * 54, -80 * ln, 2), c3 = H.local(si * 50, -110 * ln, -4);
          m = massD(c, [c0, c1, c2, c3], pt.w || [22, 24, 22, 14]);
          var zc = (m.depth - H.cd) < -6 ? Z.BACK + 3 : Z.ARM + 1;
          S.add(zc, sp(m.d, pt.color || col));
          S.add(zc + 0.01, sl(smoothD(m.scr, false), dk(col, 0.3), 1.5, { op: 0.5 }));
        }
      } else if (t === 'tuft' || t === 'ahoge') {
        var a0 = H.pt3(pt.th || 0, pt.ph || 80, -1);
        var tipA = t === 'ahoge' ? H.local((pt.lean || -1) * 14, 90, 0) : H.local((pt.lean || 1) * 10, 84, -6);
        var mid = [(a0[0] + tipA[0]) / 2 + (t === 'ahoge' ? 10 : 4), (a0[1] + tipA[1]) / 2 + 6, (a0[2] + tipA[2]) / 2];
        m = massD(c, [a0, mid, mid, tipA], t === 'ahoge' ? [5, 5, 3, 1] : [14, 10, 6, 1]);
        S.add(ZH + 33, sp(m.d, col, { w: 2.2 }));
      } else if (t === 'beard') {
        var bb = H.local(0, -30, 44);
        var bpts = [H.local(-40, -8, 30), H.local(-36, -40, 34), H.local(-18, -62, 36), H.local(0, -72, 36), H.local(18, -62, 36), H.local(36, -40, 34), H.local(40, -8, 30), H.local(20, -26, 46), H.local(0, -22, 50), H.local(-20, -26, 46)];
        var bs = bpts.map(function (p) { return c.cam.pv(p); });
        if (!c.back) {
          S.add(ZH + 9, sp(smoothD(bs, true, 0.8), pt.color || col));
          for (var bi = -2; bi <= 2; bi++) { var b1p = c.cam.pv(H.local(bi * 10, -34, 48)), b2p = c.cam.pv(H.local(bi * 11, -58, 40)); S.add(ZH + 9.1, sl('M' + P(b1p) + 'L' + P(b2p), dk(pt.color || col, 0.25), 1.4)); }
          // 口ひげ
          var mu = [H.local(-24, -18, 50), H.local(-8, -24, 52), H.local(0, -20, 53), H.local(8, -24, 52), H.local(24, -18, 50), H.local(10, -28, 50), H.local(0, -26, 51), H.local(-10, -28, 50)].map(function (p) { return c.cam.pv(p); });
          S.add(ZH + 9.2, sp(smoothD(mu, true, 0.8), lt(pt.color || col, 0.15)));
        }
      } else if (t === 'goatee') {
        if (!c.back) { var gp = H.feat(0, -52); if (gp.vis) S.add(ZH + 9, sp('M' + r1(gp.x - 4) + ' ' + r1(gp.y - 2) + 'L' + r1(gp.x + 4) + ' ' + r1(gp.y - 2) + 'L' + r1(gp.x) + ' ' + r1(gp.y + 7) + 'Z', pt.color || col, { w: 1.6 })); }
      } else if (t === 'loops') { // 弁天の輪髷
        for (var sl2 = -1; sl2 <= 1; sl2 += 2) {
          var lc = c.cam.pv(H.local(sl2 * 56, 26, -10)), lr = 22 * k;
          var zl = (lc.z - H.cd) < -10 ? ZH - 1 : ZH + 29;
          S.add(zl, sp(ellD(lc.x, lc.y, lr * 0.95, lr), col));
          S.add(zl + 0.01, sp(ellD(lc.x + sl2 * 2, lc.y + 2, lr * 0.45, lr * 0.5), dk(col, 0.5), { w: 2 }));
        }
        var tp2 = c.cam.pv(H.local(0, 56, -10));
        S.add(ZH + 28.8, sp(ellD(tp2.x, tp2.y, 26 * k, 12 * k), col));
      } else if (t === 'oiran') {
        var top = c.cam.pv(H.local(0, 58, -8));
        S.add(ZH + 28.8, sp(ellD(top.x, top.y, 36 * k, 20 * k), col));
        S.add(ZH + 28.81, sp(ellD(top.x, top.y - 12 * k, 22 * k, 11 * k), col));
        for (var so = -1; so <= 1; so += 2) {
          var w0 = H.local(so * 36, 34, -4), w1 = H.local(so * 64, 44, -10), w2 = H.local(so * 82, 40, -12), w3 = H.local(so * 90, 34, -12);
          m = massD(c, [w0, w1, w2, w3], [22, 24, 20, 8]);
          var zo = (m.depth - H.cd) < -12 ? ZH - 1 : ZH + 28.7;
          S.add(zo, sp(m.d, col));
          // 紫の縞
          for (var sq = 0; sq < 3; sq++) { var sa = c.cam.pv(H.local(so * (52 + sq * 12), 50, -10)), sb2 = c.cam.pv(H.local(so * (50 + sq * 12), 32, -8)); S.add(zo + 0.01, sl('M' + P(sa) + 'L' + P(sb2), pt.stripe || '#7a3ea6', 3.4)); }
        }
      }
    });
  }

  function drawLocks(c, H, hp, ZH) { // 顔の横の房（前）
    var S = c.S, k = H.k, L = hp.locks;
    for (var s = -1; s <= 1; s += 2) {
      if (L.side && L.side !== s) continue;
      var th = s * (L.th || 74), f = H.feat(th, -10);
      var p0 = H.pt3(th, L.ph0 == null ? 10 : L.ph0, 1.5), p1 = H.pt3(th + s * 2, -20, 5), p2 = H.pt3(th + s * 4, -50, 6), p3 = H.pt3(th + s * 2, L.ph1 == null ? -72 : L.ph1, 4);
      var m = massD(c, [p0, p1, p2, p3], L.w || [16, 16, 13, 4]);
      var z = (m.depth - H.cd) < -2 ? ZH - 3 : ZH + 34;
      S.add(z, sp(m.d, L.color || hp.color));
      if (L.inner) S.add(z + 0.01, sp(massD(c, [p1, p1, p2, p3], [8, 8, 7, 2]).d, L.inner, { w: 0 }));
    }
  }

  /* ---- 耳・角 ---- */
  function drawEars(c, H, E, ZH) {
    var S = c.S, k = H.k, kind = E.kind;
    for (var s = -1; s <= 1; s += 2) {
      if (kind === 'round') {
        var rc = c.cam.pv(H.pt3(s * 90, -4, 2));
        var zz = (rc.z - H.cd) < 0 ? ZH - 4 : ZH + 2;
        S.add(zz, sp(ellD(rc.x, rc.y, 9 * k * 0.7, 11 * k), E.color) + sf(ellD(rc.x, rc.y, 4 * k * 0.7, 6 * k), E.inner || dk(E.color, 0.2)));
        continue;
      }
      var th = s * (E.th || 46), b1, b2, tip;
      if (kind === 'rabbit') {
        th = s * (E.th || 22);
        b1 = H.pt3(th - 9, 60, -2); b2 = H.pt3(th + 9, 60, -2);
        tip = H.pt3(th + s * 8, 74, E.len || 58);
      } else {
        var big = kind === 'fox' ? 1.25 : (kind === 'dog' ? 0.95 : 1);
        var inner = th * 0.42, outer = th * 1.32;
        b1 = H.pt3(inner, 64, (c.vol || 0) * 0.6); b2 = H.pt3(outer, 26, (c.vol || 0) * 0.9);
        tip = H.pt3(th * 0.98 + s * (E.lean == null ? 4 : E.lean), 58, (E.len || 30) * big + (c.vol || 0));
      }
      var B1 = c.cam.pv(b1), B2 = c.cam.pv(b2), T = c.cam.pv(tip);
      var depth = (B1.z + B2.z + T.z) / 3 - H.cd;
      var z = depth < -14 ? ZH - 4 : ZH + 35;
      var mx = (B1.x + B2.x) / 2, my = (B1.y + B2.y) / 2, d;
      if (kind === 'rabbit') {
        d = 'M' + P(B1) + 'C' + r1(B1.x + (T.x - mx) * 0.4 - s * 3) + ' ' + r1(B1.y + (T.y - my) * 0.7) + ' ' + r1(T.x - s * 7 * k) + ' ' + r1(T.y - 2) + ' ' + P(T) +
          'C' + r1(T.x + s * 8 * k) + ' ' + r1(T.y + 4) + ' ' + r1(B2.x + (T.x - mx) * 0.4 + s * 3) + ' ' + r1(B2.y + (T.y - my) * 0.6) + ' ' + P(B2) + 'Z';
      } else {
        // ふくらんだ三角（外側の辺を少し丸く）
        var c1x = lerp(B1.x, T.x, 0.55) - (T.y - B1.y) * 0.06 * s, c1y = lerp(B1.y, T.y, 0.5);
        var c2x = lerp(B2.x, T.x, 0.5) + (T.y - B2.y) * 0.12 * s, c2y = lerp(B2.y, T.y, 0.55);
        d = 'M' + P(B1) + 'Q' + r1(c1x) + ' ' + r1(c1y) + ' ' + P(T) + 'Q' + r1(c2x) + ' ' + r1(c2y) + ' ' + P(B2) + 'Q' + r1(mx) + ' ' + r1(my + 4) + ' ' + P(B1) + 'Z';
      }
      S.add(z, sp(d, E.color));
      var backSide = c.cam.nd(Math.sin(th * D2R), 0.3, Math.cos(th * D2R)) < -0.2;
      if (!backSide) {
        var cx = (B1.x + B2.x + T.x) / 3, cy = (B1.y + B2.y + T.y) / 3 + 2;
        var sh = function (p, t) { return { x: lerp(p.x, cx, t), y: lerp(p.y, cy, t) }; };
        var I1 = sh(B1, 0.34), I2 = sh(B2, 0.34), IT = sh(T, 0.3);
        if (kind === 'rabbit') { I1 = sh(B1, 0.3); I2 = sh(B2, 0.3); IT = sh(T, 0.18); }
        S.add(z + 0.01, sf('M' + P(I1) + 'Q' + r1(lerp(I1.x, IT.x, 0.5)) + ' ' + r1(lerp(I1.y, IT.y, 0.5)) + ' ' + P(IT) + 'Q' + r1(lerp(I2.x, IT.x, 0.5)) + ' ' + r1(lerp(I2.y, IT.y, 0.5)) + ' ' + P(I2) + 'Z', E.inner || '#f3c9c9'));
        if (E.tuft) { var tb = sh(B2, 0.2), tt = { x: lerp(tb.x, IT.x, 0.55), y: lerp(tb.y, IT.y, 0.55) }; S.add(z + 0.02, sp('M' + P(sh(B1, 0.2)) + 'Q' + r1(tt.x - s * 3) + ' ' + r1(tt.y + 6) + ' ' + P(tt) + 'Q' + r1(tt.x + s * 2) + ' ' + r1(tt.y + 8) + ' ' + P(tb) + 'Z', E.tuft, { w: 1.2 })); }
      }
    }
  }
  function drawHorns(c, H, hn, ZH) {
    var S = c.S, k = H.k;
    (hn.list || [[-30, 42], [30, 42]]).forEach(function (h) {
      var th = h[0], ph = h[1], L = h[2] || 24, wd = (h[3] || 8);
      var b = H.pt3(th, ph, (c.vol || 0) * 0.5), tp = H.pt3(th + (th >= 0 ? 10 : -10), ph + 26, L + (c.vol || 0));
      var B = c.cam.pv(b), T = c.cam.pv(tp);
      var dx = T.x - B.x, dy = T.y - B.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = wd * k;
      var d = 'M' + r1(B.x + nx * w) + ' ' + r1(B.y + ny * w) + 'Q' + r1(B.x + dx * 0.6 + nx * w * 0.6) + ' ' + r1(B.y + dy * 0.6 + ny * w * 0.6) + ' ' + P(T) + 'Q' + r1(B.x + dx * 0.5 - nx * w * 0.6) + ' ' + r1(B.y + dy * 0.5 - ny * w * 0.6) + ' ' + r1(B.x - nx * w) + ' ' + r1(B.y - ny * w) + 'Z';
      var z = (B.z - H.cd) < -10 ? ZH - 3 : ZH + 36;
      S.add(z, sp(d, hn.color || '#e8dcc0'));
      S.add(z + 0.01, sl('M' + r1(B.x + dx * 0.25) + ' ' + r1(B.y + dy * 0.25) + 'L' + r1(B.x + dx * 0.7) + ' ' + r1(B.y + dy * 0.7), lt(hn.color || '#e8dcc0', 0.5), 2, { op: 0.8 }));
    });
  }

  /* ---- 鉢巻・鉢金 ---- */
  function drawBand(c, H, bd, ZH) {
    var S = c.S, k = H.k, vol = c.def.hood ? 3 : (c.vol || 0);
    var hi = bd.hi == null ? 34 : bd.hi, lo = bd.lo == null ? 17 : bd.lo;
    var tilt = bd.tilt || 0;
    var topFn = function (th) { return hi + tilt * Math.sin(th * D2R); }, botFn = function (th) { return lo + tilt * Math.sin(th * D2R); };
    var dr = vol * 0.8 + 1.2;
    var pts = H.bandPts(topFn, botFn, dr);
    S.add(ZH + 40, sp(smoothD(pts, true, 0.4), bd.color));
    // 布のしわ
    var mid = []; var yaw = c.cam.yaw;
    for (var t = -90 - yaw; t <= 90 - yaw; t += 4) mid.push(H.p(t, (hi + lo) / 2 + tilt * Math.sin(t * D2R), dr + 0.3));
    S.add(ZH + 40.01, sl(smoothD(mid, false), dk(bd.color, 0.28), 1.4, { op: 0.5 }));
    // 鉢金
    if (bd.plate) {
      var pw = bd.pw || 27, pc = bd.plateColor || '#8f9299';
      var pp = H.shapePts([[-pw, lo - 1], [pw, lo - 1], [pw, hi + 1], [-pw, hi + 1]], dr + 1.2, 8);
      if (H.center(0, 25) > -0.05) {
        S.add(ZH + 41, sp(smoothD(pp, true, 0.2), pc));
        var tl = []; for (var tt = -pw + 3; tt <= pw - 3; tt += 3) tl.push(H.pc(tt, hi - 1.5, dr + 1.4));
        S.add(ZH + 41.01, sl(openD(tl), lt(pc, 0.45), 2, { op: 0.9 }));
        var nr = bd.plate === true ? 3 : bd.plate;
        for (var i = 0; i < nr; i++) {
          var th = nr === 1 ? 0 : (i - (nr - 1) / 2) * (nr === 2 ? 14 : 13);
          var f = H.feat(th, (hi + lo) / 2, dr + 1.5);
          if (f.s < 0.1) continue;
          var rr = 3.6 * k, kx = Math.max(0.3, f.s);
          S.add(ZH + 41.02, sp('M' + r1(f.x) + ' ' + r1(f.y - rr) + 'l' + r1(rr * 0.85 * kx) + ' ' + r1(rr) + 'l' + r1(-rr * 0.85 * kx) + ' ' + r1(rr) + 'l' + r1(-rr * 0.85 * kx) + ' ' + r1(-rr) + 'Z', '#3a3a40', { w: 1.2 }) +
            sf('M' + r1(f.x) + ' ' + r1(f.y - rr * 0.6) + 'l' + r1(rr * 0.4 * kx) + ' ' + r1(rr * 0.55) + 'l' + r1(-rr * 0.4 * kx) + ' ' + r1(0) + 'Z', '#c9ccd2'));
        }
      }
    }
    // 結び目と垂れ（向かって左の後ろ）
    if (bd.tails !== false) {
      var kt = bd.knot == null ? -150 : bd.knot;
      var kp = H.pt3(kt, (hi + lo) / 2, dr + 1);
      var KP = c.cam.pv(kp);
      var zk = (KP.z - H.cd) < -6 ? ZH - 5 : ZH + 42;
      var dir = kt < 0 ? -1 : 1;
      var t1 = massD(c, [kp, [kp[0] + dir * 10 * k, kp[1] + 6 * k, kp[2] - 6 * k], [kp[0] + dir * 22 * k, kp[1] + 6 * k, kp[2] - 6 * k], [kp[0] + dir * 30 * k, kp[1] - 2 * k, kp[2] - 8 * k]], [8, 12, 12, 4]);
      var t2 = massD(c, [kp, [kp[0] + dir * 8 * k, kp[1] - 6 * k, kp[2] - 8 * k], [kp[0] + dir * 16 * k, kp[1] - 14 * k, kp[2] - 10 * k], [kp[0] + dir * 20 * k, kp[1] - 26 * k, kp[2] - 10 * k]], [8, 11, 11, 4]);
      S.add(zk, sp(t2.d, dk(bd.color, 0.08)));
      S.add(zk + 0.01, sp(t1.d, bd.color));
      S.add(zk + 0.02, sp(ellD(KP.x, KP.y, 6 * k, 5.5 * k), bd.color));
    }
    c.def.band.lo = lo;
  }

  function drawEyepatch(c, H, ep, ZH) {
    var S = c.S, k = H.k, s = ep.side, def = c.def, e = def.eyes || {};
    var ex = e.x || 24, ey = e.y == null ? -13 : e.y;
    var f = H.feat(s * ex, ey);
    // ひも
    var st = []; var yaw = c.cam.yaw;
    for (var t = -90 - yaw; t <= 90 - yaw; t += 4) { var tt = wrap(t); st.push(H.p(t, ey + 6 + (-s * tt) * 0.22, 1.5)); }
    S.add(ZH + 38, sl(smoothD(st, false), '#1d1a1c', 2.4));
    if (!f.vis) return;
    var kx = Math.max(0.3, f.s);
    S.add(ZH + 38.1, sp(ellD(f.x, f.y, 8 * k * kx, 8.6 * k), ep.color || '#1d1a1c', { w: 2 }));
    if (ep.crest) S.add(ZH + 38.2, flowerSvg(f.x, f.y, 4 * k, ep.crest, kx));
  }
  function flowerSvg(x, y, r, col, kx) {
    kx = kx || 1; var o = '';
    for (var i = 0; i < 5; i++) { var a = i * Math.PI * 2 / 5 - Math.PI / 2; o += sp(ellD(x + Math.cos(a) * r * 0.7 * kx, y + Math.sin(a) * r * 0.7, r * 0.45 * kx, r * 0.45), col, { w: 0.9 }); }
    return o + sf(ellD(x, y, r * 0.3 * kx, r * 0.3), '#f6d36b');
  }
  function drawGlasses(c, H, gl, ZH) {
    var S = c.S, k = H.k, e = c.def.eyes || {}, ex = e.x || 24, ey = e.y == null ? -13 : e.y, ps = [];
    for (var s = -1; s <= 1; s += 2) { var f = H.feat(s * ex, ey, 2); if (f.vis) { ps.push(f); S.add(ZH + 38, sp(ellD(f.x, f.y, 9.5 * k * Math.max(0.35, f.s), 9.5 * k), '#ffffff', { w: 2.4, sc: gl.color || '#1d1a1c', op: 1, extra: ' fill-opacity="0.18"' })); } }
    if (ps.length === 2) S.add(ZH + 38, sl('M' + r1(ps[0].x + 9 * k * ps[0].s) + ' ' + r1(ps[0].y - 1) + 'Q' + r1((ps[0].x + ps[1].x) / 2) + ' ' + r1(ps[0].y - 4) + ' ' + r1(ps[1].x - 9 * k * ps[1].s) + ' ' + r1(ps[1].y - 1), gl.color || '#1d1a1c', 2.2));
  }

  /* ---- 面（お面・口布） ---- */
  function drawMask(c, H, mk, ZH) {
    var S = c.S, k = H.k, kind = mk.kind, f, s;
    if (kind === 'cloth' || kind === 'scarf') {
      var top = mk.top == null ? -21 : mk.top;
      var lf = function (th) { return top + (mk.dip || 0) * Math.cos(th * D2R) - Math.max(0, Math.abs(th) - 70) * 0.1; };
      var pts = H.lowPts(lf, 1.8);
      S.add(ZH + 12, sp(smoothD(pts, true, 0.5), mk.color));
      var cid = S.clip(smoothD(pts, true, 0.5));
      if (mk.pattern === 'check') {
        var pat = '';
        for (var th = -90; th <= 90; th += 12) for (var ph = top - 4; ph >= -80; ph -= 10) {
          if (((th + 90) / 12 + (ph - top) / 10) % 2 === 0) continue;
          var q = H.shapePts([[th, ph], [th + 12, ph], [th + 12, ph - 10], [th, ph - 10]], 2, 2);
          pat += sf(polyD(q), mk.color2 || '#a8591f');
        }
        S.add(ZH + 12.1, g(pat, cid));
      }
      if (mk.eyes) { // マフラーに描かれた糸目
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 20, top - 16, 2); if (f.vis) S.add(ZH + 12.2, sl('M' + r1(f.x - 5 * f.s) + ' ' + r1(f.y) + 'Q' + r1(f.x) + ' ' + r1(f.y - 5) + ' ' + r1(f.x + 5 * f.s) + ' ' + r1(f.y), '#1d1a1c', 2)); }
      }
      // 上端のひだ
      var ln = []; var yaw = c.cam.yaw;
      for (var t = -90 - yaw; t <= 90 - yaw; t += 4) ln.push(H.p(t, lf(wrap(t)) - 7, 2));
      S.add(ZH + 12.3, sl(smoothD(ln, false), dk(mk.color, 0.3), 1.4, { clip: cid, op: 0.6 }));
      return;
    }
    if (kind === 'fox' || kind === 'oni' || kind === 'robot') {
      var poly = kind === 'fox' ? [[-66, -12], [-62, 18], [-54, 38], [-46, 70], [-26, 44], [0, 40], [26, 44], [46, 70], [54, 38], [62, 18], [66, -12], [50, -40], [20, -58], [0, -62], [-20, -58], [-50, -40]]
        : kind === 'oni' ? [[-64, -8], [-60, 22], [-40, 34], [0, 36], [40, 34], [60, 22], [64, -8], [56, -38], [30, -58], [0, -64], [-30, -58], [-56, -38]]
          : [[-66, 14], [66, 14], [64, -30], [40, -56], [0, -62], [-40, -56], [-64, -30]];
      var mp = H.shapePts(poly, 3, 6);
      var col = mk.color || (kind === 'fox' ? '#f6f3ee' : kind === 'oni' ? '#c93a2a' : '#8b8e95');
      if (H.center(0, -10) < -0.25) return; // うしろ向き：面は見えない（ひもだけ）
      var d = smoothD(mp, true, 0.5);
      ZH = ZH + 30; // 面は髪と鉢巻の上
      S.add(ZH + 14, sp(d, col));
      var mid = S.clip(d);
      if (kind === 'fox') {
        S.add(ZH + 14.05, sf(smoothD(H.shapePts([[-66, -40], [66, -40], [50, -46], [20, -60], [0, -63], [-20, -60], [-50, -46]], 3.2, 5), true, 0.5), '#e2dbcf', { clip: mid, op: 0.5 }));
        for (s = -1; s <= 1; s += 2) {
          // 面の耳（頭の上に張り出す）
          var eb1 = c.cam.pv(H.pt3(s * 22, 44, 4)), eb2 = c.cam.pv(H.pt3(s * 58, 30, 4)), et = c.cam.pv(H.pt3(s * 44, 66, 20));
          if ((eb1.z + eb2.z) / 2 - H.cd > -10) {
            S.add(ZH + 13.9, sp('M' + P(eb1) + 'Q' + r1(lerp(eb1.x, et.x, 0.5) - s * 2) + ' ' + r1(lerp(eb1.y, et.y, 0.5)) + ' ' + P(et) + 'Q' + r1(lerp(eb2.x, et.x, 0.5) + s * 4) + ' ' + r1(lerp(eb2.y, et.y, 0.5)) + ' ' + P(eb2) + 'Z', col));
            var ic = { x: (eb1.x + eb2.x + et.x) / 3, y: (eb1.y + eb2.y + et.y) / 3 + 3 };
            var sh2 = function (q, t) { return { x: lerp(q.x, ic.x, t), y: lerp(q.y, ic.y, t) }; };
            S.add(ZH + 14.1, sf(polyD([sh2(eb1, 0.35), sh2(et, 0.28), sh2(eb2, 0.35)]), '#d8303a'));
          }
        }
        // 面の顔（公式イラストの狐面：閉じた目・額の青い筋と雫・鼻・赤いふちの開いた口）
        var ink = '#1d1a1c', blue = mk.accent || '#27a4c9', red = '#d8303a';
        var face = function (poly, z, fill, ten) { S.add(ZH + z, sf(smoothD(H.shapePts(poly, 3.2, 2), true, ten == null ? 0.7 : ten), fill, { clip: mid })); };
        for (s = -1; s <= 1; s += 2) {
          if (H.feat(s * 23, -5, 3).vis) {
            // 閉じた目（外側が上がった太いレンズ形）
            face([[10, -10.5], [16, -5.8], [23, -3.2], [30, -1.4], [36.5, -1.6], [31, -5], [23, -7.4], [16, -9.6], [10, -11]].map(function (q) { return [s * q[0], q[1]]; }), 14.2, ink, 0.6);
          }
          // 目の上の青い雫（3つ）
          [[13, 18, 5], [26, 16.5, 4.3], [38, 12, 3.5]].forEach(function (q) {
            var th = s * q[0], ph = q[1], r = q[2];
            if (!H.feat(th, ph, 3).vis) return;
            face([[th, ph + r * 0.9], [th + r * 0.8, ph + r * 0.35], [th + r * 0.75, ph - r * 0.3], [th + r * 0.25, ph - r * 1.1], [th, ph - r * 2], [th - r * 0.25, ph - r * 1.1], [th - r * 0.75, ph - r * 0.3], [th - r * 0.8, ph + r * 0.35]], 14.2, blue, 0.8);
          });
          // 口のはしの赤
          if (H.feat(s * 25, -31, 3).vis) face([[s * 18, -24], [s * 27, -23.5], [s * 32.5, -29], [s * 30.5, -37.5], [s * 23, -40], [s * 17, -32]], 14.22, red, 0.9);
        }
        // 額の青い筋（上で太く、鼻すじで細くなる）
        if (H.feat(0, 20, 3).vis) face([[3, 60], [6, 50], [7, 40], [5.2, 30], [3.4, 20], [4.6, 10], [2.8, 0], [1.6, -9], [0, -17], [-1.8, -9], [-3.3, 0], [-2.4, 10], [-4, 20], [-5.8, 30], [-7, 40], [-5.6, 50], [-2.6, 60]], 14.2, blue, 0.55);
        // 鼻（ふたつの点）
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 4.5, -21.5, 3.2); if (f.vis) S.add(ZH + 14.25, sf(ellD(f.x, f.y, 1.6 * k * Math.max(0.4, f.s), 1.3 * k), ink)); }
        // 開いた口（上は波形、下は大きな弧）
        if (H.feat(0, -35, 3).vis) {
          face([[-27, -29], [-20, -25.2], [-12, -26.2], [-5, -29.4], [0, -30.4], [5, -29.4], [12, -26.2], [20, -25.2], [27, -29], [24, -36], [14, -43.5], [0, -46], [-14, -43.5], [-24, -36]], 14.25, ink, 0.55);
        }
      } else if (kind === 'oni') {
        for (s = -1; s <= 1; s += 2) {
          f = H.feat(s * 24, -8, 3);
          if (f.vis) {
            S.add(ZH + 14.1, sp(ellD(f.x, f.y, 6.5 * Math.max(0.35, f.s), 6), '#ffb03a', { w: 2 }) + sf(ellD(f.x, f.y, 2.2 * Math.max(0.35, f.s), 2.6), '#7a1c10'));
            var bf = H.feat(s * 26, 8, 3);
            S.add(ZH + 14.1, sp('M' + r1(bf.x - s * 12 * bf.s) + ' ' + r1(bf.y + 6) + 'L' + r1(bf.x + s * 9 * bf.s) + ' ' + r1(bf.y - 4) + 'L' + r1(bf.x + s * 10 * bf.s) + ' ' + r1(bf.y + 1) + 'Z', '#5a1a14', { w: 1.6 }));
          }
        }
        f = H.feat(0, -34, 3);
        if (f.vis) {
          S.add(ZH + 14.2, sp('M' + r1(f.x - 13 * f.s) + ' ' + r1(f.y - 4) + 'Q' + r1(f.x) + ' ' + r1(f.y - 9) + ' ' + r1(f.x + 13 * f.s) + ' ' + r1(f.y - 4) + 'Q' + r1(f.x) + ' ' + r1(f.y + 12) + ' ' + r1(f.x - 13 * f.s) + ' ' + r1(f.y - 4) + 'Z', '#5a1410', { w: 2 }));
          for (s = -1; s <= 1; s += 2) {
            S.add(ZH + 14.3, sp('M' + r1(f.x + s * 9 * f.s) + ' ' + r1(f.y - 6) + 'l' + r1(s * 3 * f.s) + ' ' + r1(8) + 'l' + r1(s * 3 * f.s) + ' ' + r1(-8.5) + 'Z', '#e9ecef', { w: 1.2 }));
            S.add(ZH + 14.3, sp('M' + r1(f.x + s * 6 * f.s) + ' ' + r1(f.y + 5) + 'l' + r1(s * 2.5 * f.s) + ' ' + r1(-7) + 'l' + r1(s * 2.5 * f.s) + ' ' + r1(7) + 'Z', '#e9ecef', { w: 1.2 }));
          }
          var nf = H.feat(0, -18, 4);
          S.add(ZH + 14.2, sp(ellD(nf.x, nf.y, 7 * Math.max(0.4, nf.s), 4.5), dk(col, 0.15), { w: 1.6 }));
        }
        S.add(ZH + 14.05, sl(smoothD(H.shapePts([[-50, 10], [-20, 24], [0, 22], [20, 24], [50, 10]], 3.5, 3), false), dk(col, 0.3), 2, { clip: mid }));
      } else if (kind === 'robot') {
        var vis = H.shapePts([[-58, -2], [58, -2], [58, -22], [-58, -22]], 3.5, 6);
        S.add(ZH + 14.1, sp(smoothD(vis, true, 0.3), '#23252b', { w: 2 }));
        f = H.feat(0, -12, 4);
        if (f.vis) {
          S.def('<radialGradient id="' + c.uid + 'glow"><stop offset="0" stop-color="#ffd0c0"/><stop offset=".25" stop-color="#ff3a1a"/><stop offset=".6" stop-color="#ff2a00" stop-opacity=".45"/><stop offset="1" stop-color="#ff2a00" stop-opacity="0"/></radialGradient>');
          S.add(ZH + 60, sf(ellD(f.x, f.y, 40, 9), 'url(#' + c.uid + 'glow)'));
          S.add(ZH + 14.2, sp(ellD(f.x, f.y, 6 * Math.max(0.4, f.s), 6), '#ff3a1a', { w: 1.6 }) + sf(ellD(f.x, f.y, 2.2, 2.2), '#fff2e6'));
        }
        f = H.feat(0, -40, 4);
        if (f.vis) {
          S.add(ZH + 14.2, sp('M' + r1(f.x - 14 * f.s) + ' ' + r1(f.y - 6) + 'L' + r1(f.x + 14 * f.s) + ' ' + r1(f.y - 6) + 'L' + r1(f.x + 11 * f.s) + ' ' + r1(f.y + 7) + 'L' + r1(f.x - 11 * f.s) + ' ' + r1(f.y + 7) + 'Z', '#b8bcc4', { w: 1.8 }));
          for (var gx = -2; gx <= 2; gx++) S.add(ZH + 14.3, sl('M' + r1(f.x + gx * 4.5 * f.s) + ' ' + r1(f.y - 4) + 'l0 9', '#50535a', 1.4));
        }
      }
      return;
    }
  }

  /* ---- 動物の顔 ---- */
  function drawAnimalFace(c, H, hd, ZH) {
    var S = c.S, k = H.k, kind = hd.kind, s, f;
    var light = hd.fur2 || '#f4f0e8';
    if (kind === 'dog') {
      // 白い顔下半分
      var lf = function (th) { var a = Math.abs(th); return -10 - a * 0.28 + (a < 30 ? 6 * (1 - a / 30) : 0); };
      var pts = H.lowPts(lf, 0.5);
      if (!c.back) S.add(ZH + 2, sf(smoothD(pts, true, 0.5), light, { clip: c.headClip }));
      // 眉の白い点
      for (s = -1; s <= 1; s += 2) { f = H.feat(s * 20, 6, 0.5); if (f.vis) S.add(ZH + 2.1, sf(ellD(f.x, f.y, 4.5 * Math.max(0.4, f.s), 3), light)); }
      // 鼻づら
      if (H.center(0, -22) > -0.6) {
        var mc = H.pl(0, -24, 42), mrx = c.cam.ex(15, 12) * k;
        var zm = ZH + 8;
        S.add(zm, sp(ellD(mc.x, mc.y, mrx, 11 * k), light, { w: 2.6 }));
        var nose = H.pl(0, -16, 55);
        S.add(zm + 0.1, sp('M' + r1(nose.x - 5.5 * k) + ' ' + r1(nose.y - 2) + 'Q' + r1(nose.x) + ' ' + r1(nose.y - 5) + ' ' + r1(nose.x + 5.5 * k) + ' ' + r1(nose.y - 2) + 'Q' + r1(nose.x) + ' ' + r1(nose.y + 6) + ' ' + r1(nose.x - 5.5 * k) + ' ' + r1(nose.y - 2) + 'Z', '#1d1614', { w: 1.2 }));
        var mo = H.pl(0, -26, 53);
        drawSnoutMouth(c, mo, k, 'dog');
      }
    } else if (kind === 'cat') {
      // 三毛のぶち
      (hd.patches || []).forEach(function (pc) { S.add(ZH + 1.5, sf(smoothD(H.shapePts(pc.poly, 0.4, 5), true, 0.7), pc.color, { clip: c.headClip })); });
      var lf2 = function (th) { var a = Math.abs(th); return -6 - a * 0.25 + (a < 26 ? 5 * (1 - a / 26) : 0); };
      var pts2 = H.lowPts(lf2, 0.5);
      if (hd.lowerLight !== false && !c.back) S.add(ZH + 2, sf(smoothD(pts2, true, 0.5), light, { clip: c.headClip }));
      if (H.center(0, -22) > -0.5) {
        var mc2 = H.pl(0, -20, 46), mrx2 = c.cam.ex(12, 8) * k;
        S.add(ZH + 8, sp(ellD(mc2.x, mc2.y, mrx2, 7.5 * k), light, { w: 2.2 }));
        var ns = H.pl(0, -14, 52);
        S.add(ZH + 8.1, sp('M' + r1(ns.x - 3.5 * k) + ' ' + r1(ns.y - 1.5) + 'L' + r1(ns.x + 3.5 * k) + ' ' + r1(ns.y - 1.5) + 'L' + r1(ns.x) + ' ' + r1(ns.y + 2.5) + 'Z', '#e38a8f', { w: 1.2 }));
        drawSnoutMouth(c, H.pl(0, -22, 51), k, 'cat');
        // ひげ
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 30, -20, 4); if (f.vis) for (var j = -1; j <= 1; j += 2) S.add(ZH + 8.2, sl('M' + r1(f.x) + ' ' + r1(f.y + j * 2) + 'l' + r1(s * 12 * Math.max(0.4, f.s)) + ' ' + r1(j * 2.5), '#3a2a22', 1.3)); }
      }
    }
  }
  function drawSnoutMouth(c, mo, k, kind) {
    var S = c.S, expr = c.expr, z = Z.HEAD + 8.2;
    if (c.back) return;
    if (expr === 'happy' || expr === 'surprised') {
      var open = expr === 'happy' ? 7 : 6;
      S.add(z, sp('M' + r1(mo.x - 5 * k) + ' ' + r1(mo.y) + 'Q' + r1(mo.x) + ' ' + r1(mo.y + open * 1.8 * k) + ' ' + r1(mo.x + 5 * k) + ' ' + r1(mo.y) + 'Z', '#8e2f2d', { w: 1.6 }) + sf(ellD(mo.x, mo.y + open * 0.7 * k, 3 * k, 2.4 * k), '#ef8c8c'));
      return;
    }
    S.add(z, sl('M' + r1(mo.x - 6 * k) + ' ' + r1(mo.y - 1) + 'Q' + r1(mo.x - 3 * k) + ' ' + r1(mo.y + 3 * k) + ' ' + r1(mo.x) + ' ' + r1(mo.y - 1.5) + 'Q' + r1(mo.x + 3 * k) + ' ' + r1(mo.y + 3 * k) + ' ' + r1(mo.x + 6 * k) + ' ' + r1(mo.y - 1), '#2a1a18', 1.8));
    if (kind === 'dog' && expr !== 'serious') S.add(z + 0.1, sp('M' + r1(mo.x - 2.6 * k) + ' ' + r1(mo.y + 1) + 'Q' + r1(mo.x) + ' ' + r1(mo.y + 7 * k) + ' ' + r1(mo.x + 2.6 * k) + ' ' + r1(mo.y + 1) + 'Z', '#ef8c8c', { w: 1.2 }));
  }
  function drawGorillaFace(c, H, hd, ZH) {
    var S = c.S, k = H.k, s, f;
    var fc = hd.face || '#9a9a9e';
    var face = H.shapePts([[-44, 4], [-20, 14], [0, 10], [20, 14], [44, 4], [52, -24], [36, -52], [0, -60], [-36, -52], [-52, -24]], 1, 6);
    if (H.center(0, -14) < -0.2) return;
    S.add(ZH + 2, sp(smoothD(face, true, 0.6), fc, { w: 2.2 }));
    // 眉の張り出し
    var br = H.shapePts([[-46, 18], [0, 12], [46, 18], [44, 8], [0, 4], [-44, 8]], 2.5, 4);
    S.add(ZH + 3, sp(smoothD(br, true, 0.5), hd.fur || '#3a3a3f', { w: 2 }));
    for (s = -1; s <= 1; s += 2) {
      f = H.feat(s * 20, -6, 1); if (!f.vis) continue;
      var kx = Math.max(0.35, f.s);
      if (c.expr === 'happy') { S.add(ZH + 6, sl('M' + r1(f.x - 5 * kx) + ' ' + r1(f.y + 1) + 'Q' + r1(f.x) + ' ' + r1(f.y - 6) + ' ' + r1(f.x + 5 * kx) + ' ' + r1(f.y + 1), EYE_DARK, 2.6)); continue; }
      if (c.expr === 'serious') { S.add(ZH + 6, sl('M' + r1(f.x - 5 * kx) + ' ' + r1(f.y) + 'L' + r1(f.x + 5 * kx) + ' ' + r1(f.y + 1), EYE_DARK, 2.6)); continue; }
      S.add(ZH + 6, sp(ellD(f.x, f.y, 5.5 * kx, 4.8), '#fbf6ee', { w: 1.6 }) + sf(ellD(f.x + s * 0.5, f.y + 0.5, 2.4 * kx, 2.8), EYE_DARK));
    }
    f = H.feat(0, -22, 3);
    if (f.vis) { S.add(ZH + 6, sf(ellD(f.x - 4 * f.s, f.y, 2.2, 1.6), '#2a2a2e') + sf(ellD(f.x + 4 * f.s, f.y, 2.2, 1.6), '#2a2a2e')); }
    f = H.feat(4, -40, 2);
    if (f.vis) {
      var ex = c.expr;
      if (ex === 'surprised') S.add(ZH + 6, sp(ellD(f.x, f.y, 6 * f.s + 1, 6), '#5a2a28', { w: 1.8 }));
      else if (ex === 'serious') S.add(ZH + 6, sl('M' + r1(f.x - 9 * f.s) + ' ' + r1(f.y) + 'L' + r1(f.x + 9 * f.s) + ' ' + r1(f.y), OUT, 2.2));
      else S.add(ZH + 6, sp('M' + r1(f.x - 12 * f.s) + ' ' + r1(f.y - 3) + 'Q' + r1(f.x) + ' ' + r1(f.y + 1) + ' ' + r1(f.x + 12 * f.s) + ' ' + r1(f.y - 5) + 'Q' + r1(f.x + 2) + ' ' + r1(f.y + 8) + ' ' + r1(f.x - 12 * f.s) + ' ' + r1(f.y - 3) + 'Z', '#ffffff', { w: 2 }) +
        sl('M' + r1(f.x - 8 * f.s) + ' ' + r1(f.y - 1) + 'l0 4M' + r1(f.x - 2 * f.s) + ' ' + r1(f.y) + 'l0 4M' + r1(f.x + 4 * f.s) + ' ' + r1(f.y - 1) + 'l0 4', '#8a8a8e', 1.1));
    }
  }
  function drawChickFace(c, H, hd, ZH) {
    var S = c.S, k = H.k, s, f;
    if (H.center(0, -10) < -0.3) return;
    for (s = -1; s <= 1; s += 2) {
      f = H.feat(s * 26, -18, 1); if (!f.vis) continue;
      S.add(ZH + 3, sf(ellD(f.x + s * 3 * f.s, f.y + 3, 6.5 * Math.max(0.35, f.s), 4), hd.cheek || '#f5a04a', { op: 0.75 }));
    }
    var bk = H.pl(0, -16, 52), expr = c.expr;
    var bw = c.cam.ex(9, 12) * k;
    var dir = Math.sin(c.yaw * D2R); // 横向きでくちばしが前に伸びる
    var tipx = bk.x + dir * 14 * k;
    if (expr === 'happy' || expr === 'surprised') {
      S.add(ZH + 9, sp('M' + r1(bk.x - bw) + ' ' + r1(bk.y - 1) + 'L' + r1(tipx) + ' ' + r1(bk.y - 5) + 'L' + r1(bk.x + bw) + ' ' + r1(bk.y - 1) + 'Z', '#f39a2a', { w: 2 }) +
        sp('M' + r1(bk.x - bw * 0.8) + ' ' + r1(bk.y + 1) + 'L' + r1(tipx) + ' ' + r1(bk.y + 9) + 'L' + r1(bk.x + bw * 0.8) + ' ' + r1(bk.y + 1) + 'Z', '#e57f1a', { w: 2 }));
    } else {
      S.add(ZH + 9, sp('M' + r1(bk.x - bw) + ' ' + r1(bk.y - 3) + 'Q' + r1(tipx) + ' ' + r1(bk.y - 6) + ' ' + r1(tipx + dir * 4) + ' ' + r1(bk.y + 1) + 'Q' + r1(tipx) + ' ' + r1(bk.y + 7) + ' ' + r1(bk.x + bw) + ' ' + r1(bk.y - 3) + 'Q' + r1(bk.x) + ' ' + r1(bk.y - 2) + ' ' + r1(bk.x - bw) + ' ' + r1(bk.y - 3) + 'Z', '#f39a2a', { w: 2 }));
      S.add(ZH + 9.1, sl('M' + r1(bk.x - bw * 0.8) + ' ' + r1(bk.y + 0.5) + 'L' + r1(tipx + dir * 3) + ' ' + r1(bk.y + 1), '#b8621a', 1.2));
    }
  }

  /* ---- 帽子・冠・ろうそく・矢・簪・リボン ---- */
  function drawHat(c, H, hat, ZH) {
    var S = c.S, k = H.k;
    var y0 = 30, R = hat.r || 70, apex = 64, pts = [], i;
    for (i = 0; i < 48; i++) { var a = i / 48 * Math.PI * 2; pts.push(c.cam.pv(H.local(Math.sin(a) * R, y0 + (hat.tilt || 0) * Math.sin(a), Math.cos(a) * R * 0.98))); }
    var ap = c.cam.pv(H.local(0, apex, -4));
    var all = hull(pts.concat([ap]));
    S.add(ZH + 50, sp(polyD(all), hat.color || '#9a6a3a'));
    var hid = S.clip(polyD(all));
    // 編み目
    var lines = '';
    for (i = 0; i < 24; i++) { var p = pts[i * 2]; lines += 'M' + P(ap) + 'L' + P(p); }
    S.add(ZH + 50.1, sl(lines, dk(hat.color || '#9a6a3a', 0.3), 1.3, { clip: hid, op: 0.7 }));
    for (var ring = 0.3; ring < 1; ring += 0.22) {
      var rp = []; for (i = 0; i <= 48; i++) { var a2 = i / 48 * Math.PI * 2; rp.push(c.cam.pv(H.local(Math.sin(a2) * R * ring, lerp(apex, y0, ring), Math.cos(a2) * R * ring))); }
      S.add(ZH + 50.1, sl(openD(rp), dk(hat.color || '#9a6a3a', 0.25), 1.2, { clip: hid, op: 0.6 }));
    }
    // 手前のふち
    var fr = []; for (i = 0; i <= 48; i++) { var a3 = i / 48 * Math.PI * 2; var q = c.cam.pv(H.local(Math.sin(a3) * R, y0, Math.cos(a3) * R)); if (Math.cos(a3 + c.yaw * D2R) > -0.1) fr.push(q); }
    if (hat.crest && !c.back) {
      var cp = c.cam.pv(H.local(0, 52, 28));
      S.add(ZH + 50.2, sp('M' + r1(cp.x - 7) + ' ' + r1(cp.y) + 'q' + r1(7) + ' ' + r1(-9) + ' ' + r1(14) + ' ' + r1(0) + 'q' + r1(-7) + ' ' + r1(9) + ' ' + r1(-14) + ' ' + r1(0) + 'Z', hat.crest, { w: 1.4 }));
    }
    return fr;
  }
  function drawCrown(c, H, cr, ZH) {
    var S = c.S, k = H.k, gold = cr.color || '#e2b93b';
    if (H.center(0, 38) < -0.3) return;
    var poly = [[-40, 18], [40, 18], [42, 34], [30, 44], [20, 40], [10, 54], [0, 46], [-10, 54], [-20, 40], [-30, 44], [-42, 34]];
    var pts = H.shapePts(poly, (c.vol || 4) + 3, 4);
    S.add(ZH + 45, sp(smoothD(pts, true, 0.4), gold));
    var gm = H.feat(0, 30, (c.vol || 4) + 4);
    if (gm.vis) S.add(ZH + 45.1, sp(ellD(gm.x, gm.y, 4 * Math.max(0.4, gm.s), 4.5), '#d8303a', { w: 1.5 }) + sl(smoothD(H.shapePts([[-36, 24], [36, 24]], (c.vol || 4) + 3.5, 8), false), dk(gold, 0.3), 1.4));
  }
  function drawCandles(c, H, cd, ZH) {
    var S = c.S, k = H.k;
    var ring = H.bandPts(function () { return 50; }, function () { return 42; }, (c.vol || 5) + 1);
    S.add(ZH + 44, sp(smoothD(ring, true, 0.4), '#2a2a2e'));
    [-58, 0, 58].forEach(function (th) {
      var b = H.pt3(th, 46, (c.vol || 5) + 2);
      var B = c.cam.pv(b), T = c.cam.pv([b[0], b[1] + 22 * k, b[2]]);
      var z = (B.z - H.cd) < -6 ? ZH - 6 : ZH + 46;
      S.add(z, sp(capsD(B, T, 3.6 * k, 3.6 * k), '#f4efe6', { w: 2 }) +
        sp('M' + r1(T.x) + ' ' + r1(T.y - 14 * k) + 'Q' + r1(T.x + 6 * k) + ' ' + r1(T.y - 5 * k) + ' ' + r1(T.x) + ' ' + r1(T.y - 1) + 'Q' + r1(T.x - 6 * k) + ' ' + r1(T.y - 5 * k) + ' ' + r1(T.x) + ' ' + r1(T.y - 14 * k) + 'Z', '#ffb43a', { w: 1.6 }) +
        sf(ellD(T.x, T.y - 5 * k, 1.6 * k, 3 * k), '#fff3b0'));
    });
  }
  function drawArrow(c, H, ZH) {
    var S = c.S, k = H.k;
    var b = H.pt3(24, 64, 2), t = H.pt3(10, 88, 42);
    var B = c.cam.pv(b), T = c.cam.pv(t);
    var z = (B.z - H.cd) < -10 ? ZH - 2 : ZH + 47;
    var dx = T.x - B.x, dy = T.y - B.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    var o = sl('M' + P(B) + 'L' + P(T), '#1d1a1c', 3.2);
    for (var i = 0; i < 2; i++) {
      var fx = T.x - ux * (2 + i * 6), fy = T.y - uy * (2 + i * 6);
      o += sp('M' + r1(fx) + ' ' + r1(fy) + 'l' + r1(-uy * 7 - ux * 5) + ' ' + r1(ux * 7 - uy * 5) + 'l' + r1(ux * 6) + ' ' + r1(uy * 6) + 'Z', '#e9e6e0', { w: 1.2 }) +
        sp('M' + r1(fx) + ' ' + r1(fy) + 'l' + r1(uy * 7 - ux * 5) + ' ' + r1(-ux * 7 - uy * 5) + 'l' + r1(ux * 6) + ' ' + r1(uy * 6) + 'Z', '#e9e6e0', { w: 1.2 });
    }
    S.add(z, o);
  }
  function drawPins(c, H, pins, ZH) {
    var S = c.S, k = H.k;
    (pins.list || []).forEach(function (pn) {
      var base = H.pt3(pn[0], pn[1], (c.vol || 5) + 2), tip = H.pt3(pn[0] + (pn[3] || 0), pn[1] + (pn[4] || 18), (c.vol || 5) + (pn[2] || 30));
      var B = c.cam.pv(base), T = c.cam.pv(tip);
      var z = (B.z - H.cd) < -12 ? ZH - 6 : ZH + 48;
      S.add(z, sl('M' + P(B) + 'L' + P(T), dk(pins.color || '#e0b23c', 0.4), 4.2) + sl('M' + P(B) + 'L' + P(T), pins.color || '#e0b23c', 2.4) + sp(ellD(T.x, T.y, 3.2 * k, 3.2 * k), pins.tip || '#d8303a', { w: 1.3 }));
    });
    if (pins.comb) {
      var cp = H.shapePts([[-30, 50], [30, 50], [26, 64], [-26, 64]], (c.vol || 5) + 4, 5);
      if (H.center(0, 56) > -0.4) S.add(ZH + 47.5, sp(smoothD(cp, true, 0.5), pins.comb));
    }
    if (pins.tassel) {
      for (var s = -1; s <= 1; s += 2) {
        var tp = c.cam.pv(H.local(s * 50, 10, -2)), tp2 = c.cam.pv(H.local(s * 52, -26, -2));
        var zt = (tp.z - H.cd) < -10 ? ZH - 6 : ZH + 47;
        S.add(zt, sl('M' + P(tp) + 'L' + P(tp2), pins.tassel, 5) + sl('M' + P(tp) + 'L' + P(tp2), lt(pins.tassel, 0.2), 2));
      }
    }
  }
  function bowSvg(x, y, k, col, kind) {
    var w = 10 * k, h = 7 * k;
    return sp('M' + r1(x) + ' ' + r1(y) + 'L' + r1(x - w) + ' ' + r1(y - h) + 'Q' + r1(x - w - 3 * k) + ' ' + r1(y) + ' ' + r1(x - w) + ' ' + r1(y + h) + 'Z', col, { w: 2 }) +
      sp('M' + r1(x) + ' ' + r1(y) + 'L' + r1(x + w) + ' ' + r1(y - h) + 'Q' + r1(x + w + 3 * k) + ' ' + r1(y) + ' ' + r1(x + w) + ' ' + r1(y + h) + 'Z', col, { w: 2 }) +
      (kind === 'long' ? sp('M' + r1(x - 2) + ' ' + r1(y + 2) + 'L' + r1(x - 6 * k) + ' ' + r1(y + 14 * k) + 'L' + r1(x) + ' ' + r1(y + 12 * k) + 'L' + r1(x + 6 * k) + ' ' + r1(y + 14 * k) + 'L' + r1(x + 2) + ' ' + r1(y + 2) + 'Z', col, { w: 1.8 }) : '') +
      sp(ellD(x, y, 3.6 * k, 3.6 * k), dk(col, 0.1), { w: 1.8 });
  }
  function drawRibbon(c, H, rb, ZH) {
    var S = c.S, k = H.k;
    var p = H.pt3(rb.th, rb.ph, (c.vol || 5) + 2), P2 = c.cam.pv(p);
    var z = (P2.z - H.cd) < -12 ? ZH - 6 : ZH + 49;
    S.add(z, bowSvg(P2.x, P2.y, (rb.size || 1.5) * k, rb.color, rb.kind));
  }
  function drawFlowerPin(c, H, fl, ZH) {
    var S = c.S, k = H.k;
    var p = c.cam.pv(H.pt3(fl.th, fl.ph, (c.vol || 5) + 2));
    var z = (p.z - H.cd) < -12 ? ZH - 6 : ZH + 49.5;
    S.add(z, sakuraSvg(p.x, p.y, (fl.size || 7) * k, fl.color || '#f7b8cc'));
  }
  function sakuraSvg(x, y, r, col) {
    var o = '';
    for (var i = 0; i < 5; i++) {
      var a = i * Math.PI * 2 / 5 - Math.PI / 2, cx = x + Math.cos(a) * r * 0.62, cy = y + Math.sin(a) * r * 0.62;
      o += sp(ellD(cx, cy, r * 0.46, r * 0.46), col, { w: 1.2 });
    }
    return o + sf(ellD(x, y, r * 0.28, r * 0.28), '#e46a8a');
  }
  function drawEarring(c, H, er, ZH) {
    var f = H.feat(er.side * 86, -18, 0);
    if (!f.vis) return;
    c.S.add(ZH + 36, sp(ellD(f.x, f.y + 4, 2.4, 2.4), er.color || '#1d1a1c', { w: 1.2 }));
  }

  function drawVeil(c, H, vl, ZH) { // 天衣（頭から肩へ垂れる白布）
    var S = c.S, col = vl.color || '#f4f1ea';
    var hf = hairlineFn({ front: vl.front == null ? 24 : vl.front, side: -62, back: -80, fw: 40, bangs: 'straight' });
    var pts = H.capPts(hf, 7, 1.2);
    S.add(ZH + 29, sp(smoothD(pts, true, 0.5), col));
    var cid = S.clip(smoothD(pts, true, 0.5));
    var ln = ''; for (var th = -70; th <= 70; th += 35) { var a = H.feat(th, 40, 6), b = H.feat(th * 1.1, -40, 6); if (a.s > 0.05) ln += 'M' + P(a) + 'L' + P(b); }
    S.add(ZH + 29.01, sl(ln, dk(col, 0.12), 1.4, { clip: cid, op: 0.7 }));
    for (var s = -1; s <= 1; s += 2) { // 肩へ落ちる布
      var p0 = H.local(s * 50, -10, -6), p1 = H.local(s * 58, -50, -10), p2 = H.local(s * 60, -90, -14), p3 = H.local(s * 54, -118, -18);
      var m = massD(c, [p0, p1, p2, p3], [20, 26, 28, 24]);
      var z = (m.depth - H.cd) < -4 ? Z.BACK + 2 : Z.OVER + 4;
      S.add(z, sp(m.d, col));
    }
  }
  function drawHairTips(c, H, hp, ZH) { // 毛先だけ別の色（宇迦の白い毛先）
    var hf = c.hairFn, S = c.S, yaw = c.cam.yaw, pts = [];
    var tL = -90 - yaw, tR = 90 - yaw, th;
    var up = function (t) { var a = Math.abs(wrap(t)); return hf(wrap(t)) + (a > 58 ? 16 : 5); };
    for (th = tL; th <= tR + 0.01; th += 3) pts.push(H.p(th, hf(wrap(th)) - 2, (hp.vol || 5) + 1));
    for (th = tR; th >= tL - 0.01; th -= 3) pts.push(H.p(th, up(th), (hp.vol || 5) * 0.8));
    S.add(ZH + 30.5, sf(smoothD(pts, true, 0.4), hp.tipColor, { clip: c.hairClip }));
  }
  function drawCrest(c, H, cr, ZH) { // ひよこのとさか
    var S = c.S, k = H.k;
    [[-12, -8], [0, 2], [12, 8]].forEach(function (f, i) {
      var b = H.pt3(f[0] * 0.6, 84, -1), t = H.local(f[0] * 0.9 + f[1] * 0.5, 74 + (i === 1 ? 18 : 12), -2 + f[1] * 0.2);
      var B = c.cam.pv(b), T = c.cam.pv(t);
      var dx = T.x - B.x, dy = T.y - B.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = 5 * k;
      S.add(ZH + 34 + i * 0.01, sp('M' + r1(B.x + nx * w) + ' ' + r1(B.y + ny * w) + 'Q' + r1(B.x + dx * 0.6 + nx * w) + ' ' + r1(B.y + dy * 0.6 + ny * w) + ' ' + P(T) + 'Q' + r1(B.x + dx * 0.5 - nx * w) + ' ' + r1(B.y + dy * 0.5 - ny * w) + ' ' + r1(B.x - nx * w) + ' ' + r1(B.y - ny * w) + 'Z', cr.color || '#f5ce1c', { w: 2.4 }));
    });
  }

  /* ================= 体 ================= */
  function drawBody(c) {
    var def = c.def, S = c.S, b = c.b, cam = c.cam, R = c.R;
    var top = def.top || { color: '#46703e' };
    var bot = def.bottom || { kind: 'pants', color: top.color };
    var tl = top.len || 'short';
    var hem = tl === 'long' ? 8 : (tl === 'mid' ? 26 : (top.hem || b.hem));
    var flare = top.flare == null ? (bot.kind === 'skirt' ? 5 : 0) : top.flare;
    var T = new Trunk(cam, { x: 0, z: 0, y0: b.sy + 1, y1: hem, rx0: b.srx, rz0: b.srz, rx1: b.hrx + flare + (tl === 'long' ? 6 : 0), rz1: b.hrz + flare * 0.6 + (tl === 'long' ? 4 : 0) });
    c.T = T;

    // 脚と足
    drawLegs(c, bot);
    // 背中の物（刀など）: 奥
    drawBackItems(c);
    // 胴
    var sil = T.silPts();
    var silD = smoothD(sil, true, 0.35);
    S.add(Z.TORSO, sp(silD, top.color));
    var tclip = S.clip(silD);
    c.torsoClip = tclip;
    var deco = torsoDeco(c, T, top, hem);
    S.add(Z.TORSO + 0.5, g(deco, tclip));
    if (bot.kind === 'hakama' || bot.kind === 'longskirt') drawHakama(c, bot);
    if (def.over) drawOver(c, def.over, T, deco);
    if (def.fur) drawFurCollar(c, def.fur);
    if (def.scarf) drawScarf(c, def.scarf);
    // 腕
    drawArms(c);
    drawProp(c);
  }

  function torsoDeco(c, T, top, hem) {
    var def = c.def, b = c.b, cam = c.cam, o = '', th0 = T.front(), a0 = th0 - 100, a1 = th0 + 100;
    var obi = def.obi || { color: '#232327', knot: 'buckle' };
    var oy0 = b.obi[0], oy1 = b.obi[1];
    // 陰（体の奥側）
    var shade = []; var sdir = Math.sin(c.yaw * D2R) >= 0 ? 1 : -1;
    for (var y = b.sy + 2; y >= hem - 2; y -= 4) shade.push(T.p(th0 + 70, y, 0.5));
    for (y = hem - 2; y <= b.sy + 2; y += 4) shade.push(T.p(th0 + 110, y, 1));
    // 胸の色・裾の色（巫女の緋袴風スカートなど）
    if (top.chest) { var cb1 = T.arc(b.sy + 3, 1, th0 - 100, th0 + 100, 5), cb2 = T.arc(oy1, 1, th0 - 100, th0 + 100, 5).reverse(); o += sf(polyD(cb1.concat(cb2)), top.chest); }
    if (top.lower) { var lb1 = T.arc(oy0 + 1, 1, th0 - 100, th0 + 100, 5), lb2 = T.arc(hem - 3, 1, th0 - 100, th0 + 100, 5).reverse(); o += sf(polyD(lb1.concat(lb2)), top.lower); }
    o += sf(polyD(shade), '#000000', { op: 0.12 });
    // 模様
    if (top.pattern) o += torsoPattern(c, T, top, hem);
    if (top.lines) { for (var ls = -1; ls <= 1; ls += 2) { if (T.vis(ls * 44, 70) > -0.05) o += sl('M' + P(T.p(ls * 30, b.sy + 1, 0.6)) + 'L' + P(T.p(ls * 46, oy1, 0.6)) + 'M' + P(T.p(ls * 46, oy0, 0.6)) + 'L' + P(T.p(ls * 52, hem + 1, 0.6)), top.lines, 2.2); } }
    if (top.suspenders) {
      for (var ss = -1; ss <= 1; ss += 2) {
        var sv0 = T.vis(ss * 16, 80); if (sv0 < 0.05) continue;
        var s0 = T.p(ss * 18, b.sy + 1, 0.9), s1 = T.p(ss * 15, oy1, 0.9);
        o += sl('M' + P(s0) + 'L' + P(s1), OUT, 9) + sl('M' + P(s0) + 'L' + P(s1), top.suspenders, 6.6) + sl('M' + P(s0) + 'L' + P(s1), top.suspenderEdge || '#d8b04a', 1.2);
        for (var pi = 0; pi < 2; pi++) { var pq = T.p(ss * lerp(18, 15, 0.3 + pi * 0.4), lerp(b.sy, oy1, 0.3 + pi * 0.4), 2); o += sp(ellD(pq.x, pq.y, 4.6 * Math.max(0.45, sv0 * 1.3), 4.6), '#f4f1ea', { w: 1.6 }); }
      }
    }
    // 網目（胸元）
    var collar = top.collar || 'cross';
    var fvis = T.vis(0, b.sy) > -0.05;
    if (collar === 'cross' && fvis) {
      var ytop = b.sy + 1, ycross = oy1 + 1;
      var V = [T.p(-24, ytop, 0.3), T.p(24, ytop, 0.3), T.p(-3, ycross, 0.3)];
      o += sf(polyD(V), top.inner || dk(top.color, 0.3));
      if (top.mesh) {
        var mz = ''; for (var i = -4; i <= 4; i++) { mz += 'M' + P(T.p(-24 + i * 6, ytop, 0.5)) + 'L' + P(T.p(-8 + i * 6, ycross, 0.5)) + 'M' + P(T.p(24 + i * 6, ytop, 0.5)) + 'L' + P(T.p(8 + i * 6, ycross, 0.5)); }
        o += '<g clip-path="url(#' + c.S.clip(polyD(V)) + ')">' + sl(mz, lt(top.inner || '#333', 0.35), 1) + '</g>';
      }
      var tw = top.trimW || 5;
      o += sl('M' + P(T.p(-24, ytop, 0.6)) + 'L' + P(T.p(4, ycross - 6, 0.6)), OUT, tw + 2.4) + sl('M' + P(T.p(-24, ytop, 0.6)) + 'L' + P(T.p(4, ycross - 6, 0.6)), top.trim || dk(top.color, 0.45), tw);
      o += sl('M' + P(T.p(26, ytop, 0.8)) + 'L' + P(T.p(-12, ycross, 0.8)), OUT, tw + 2.4) + sl('M' + P(T.p(26, ytop, 0.8)) + 'L' + P(T.p(-12, ycross, 0.8)), top.trim || dk(top.color, 0.45), tw);
      if (top.emblem) o += emblemSvg(c, T, top.emblem);
    } else if (collar === 'high' && fvis) {
      o += sp(polyD([T.p(-26, b.sy + 1, 0.5), T.p(26, b.sy + 1, 0.5), T.p(20, b.sy - 8, 0.5), T.p(0, b.sy - 16, 0.5), T.p(-20, b.sy - 8, 0.5)]), top.trim || '#eeeeee', { w: 2 });
    } else if (collar === 'round' && fvis) {
      o += sl(smoothD(T.arc(b.sy - 3, 0.6, -26, 26, 6), false), top.trim || dk(top.color, 0.4), 3);
    }
    if (collar !== 'cross' && top.emblem && fvis) o += emblemSvg(c, T, top.emblem);
    if (top.flameChest) o += flameChest(c, T, top, oy1);
    // たすき（斜め掛け）
    if (top.tasuki) {
      var tp = [], bp = [];
      for (var u = 0; u <= 1.001; u += 0.1) {
        tp.push(T.p(lerp(60, -52, u), lerp(b.sy + 1, oy1, u), 0.9));
        bp.push(T.p(lerp(-128, -242, u), lerp(oy1, b.sy + 1, u), 0.9));
      }
      var dF = smoothD(tp, false), dB = smoothD(bp, false);
      var tw2 = top.tasukiW || 6;
      if (T.vis(0, 70) > -0.3) o += sl(dF, OUT, tw2 + 2.6) + sl(dF, top.tasuki, tw2);
      if (T.vis(180, 70) > -0.3) o += sl(dB, OUT, tw2 + 2.6) + sl(dB, top.tasuki, tw2);
    }
    // 帯
    if (obi.color !== 'none') {
      var ot = T.arc(oy1, 1.2, th0 - 95, th0 + 95, 5), ob = T.arc(oy0, 1.2, th0 - 95, th0 + 95, 5).reverse();
      o += sp(smoothD(ot.concat(ob), true, 0.3), obi.color, { w: 2.4 });
      if (obi.stripe) { var st = T.arc((oy0 + oy1) / 2, 1.4, th0 - 95, th0 + 95, 5); o += sl(smoothD(st, false), obi.stripe, 3); }
      if (obi.cord) { var cd = T.arc((oy0 + oy1) / 2, 1.6, th0 - 95, th0 + 95, 5); o += sl(smoothD(cd, false), OUT, 4.8) + sl(smoothD(cd, false), obi.cord, 2.6); }
      if (obi.studs) { for (var th = -80; th <= 80; th += 20) { var sv = T.vis(th, oy0); if (sv < 0.1) continue; var sp0 = T.p(th, (oy0 + oy1) / 2, 1.6); o += sp(ellD(sp0.x, sp0.y, 2.4 * Math.max(0.4, sv * 1.5), 2.4), obi.studs, { w: 1.2 }); } }
      if (obi.plates) { for (var tp2 = -60; tp2 <= 60; tp2 += 30) { var pv = T.vis(tp2, oy0); if (pv < 0.1) continue; var pp = T.p(tp2, (oy0 + oy1) / 2, 1.6); var pk = Math.max(0.4, pv * 1.5); o += sp('M' + r1(pp.x - 4 * pk) + ' ' + r1(pp.y - 4) + 'L' + r1(pp.x + 4 * pk) + ' ' + r1(pp.y - 4) + 'L' + r1(pp.x + 4 * pk) + ' ' + r1(pp.y + 2) + 'L' + r1(pp.x) + ' ' + r1(pp.y + 5) + 'L' + r1(pp.x - 4 * pk) + ' ' + r1(pp.y + 2) + 'Z', obi.plates, { w: 1.3 }); } }
      // 結び目
      var kv = T.vis(0, oy0);
      var kp = T.p(0, (oy0 + oy1) / 2, 1.6), kk = Math.max(0.35, kv * 1.35);
      if (kv > 0.05) {
        if (obi.knot === 'bow') o += bowSvg(kp.x, kp.y, 1.05 * kk, obi.knotColor || obi.color, 'long');
        else if (obi.knot === 'buckle') o += sp('M' + r1(kp.x) + ' ' + r1(kp.y) + 'L' + r1(kp.x - 9 * kk) + ' ' + r1(kp.y - 6) + 'L' + r1(kp.x - 9 * kk) + ' ' + r1(kp.y + 6) + 'Z', obi.knotColor || '#8f9299', { w: 1.8 }) + sp('M' + r1(kp.x) + ' ' + r1(kp.y) + 'L' + r1(kp.x + 9 * kk) + ' ' + r1(kp.y - 6) + 'L' + r1(kp.x + 9 * kk) + ' ' + r1(kp.y + 6) + 'Z', obi.knotColor || '#8f9299', { w: 1.8 }) + sp(ellD(kp.x, kp.y, 3.4 * kk, 3.4), lt(obi.knotColor || '#8f9299', 0.2), { w: 1.6 });
        else if (obi.knot === 'knot') o += sp(ellD(kp.x, kp.y, 5 * kk, 5), obi.knotColor || dk(obi.color, 0.1), { w: 1.8 }) + sp('M' + r1(kp.x - 2) + ' ' + r1(kp.y + 3) + 'L' + r1(kp.x - 5 * kk) + ' ' + r1(kp.y + 13) + 'L' + r1(kp.x + 1) + ' ' + r1(kp.y + 11) + 'Z', obi.knotColor || dk(obi.color, 0.1), { w: 1.6 });
      }
      if (c.back && obi.knot === 'bow' && !def.over) {
        var bk = T.p(180, (oy0 + oy1) / 2, 2);
        o += bowSvg(bk.x, bk.y, 1.1, obi.knotColor || obi.color, 'long');
      }
    }
    if (obi.chain) { for (var ch = -90; ch <= 90; ch += 11) { var cv = T.vis(ch, oy0); if (cv < 0.05) continue; var cp0 = T.p(ch, (oy0 + oy1) / 2 + ((ch / 11) % 2 ? 1.5 : -1.5), 2.2); var ck = Math.max(0.4, cv * 1.3); o += sp(ellD(cp0.x, cp0.y, 4.2 * ck, 2.6), obi.chain, { w: 1.4 }) + sf(ellD(cp0.x, cp0.y, 2 * ck, 0.9), OUT); } }
    if (obi.knot === 'spider' && T.vis(0, oy0) > 0.1) { var spc = T.p(0, (oy0 + oy1) / 2 + 2, 2), spk = Math.max(0.4, T.vis(0, oy0) * 1.3), leg = ''; for (var li = -1; li <= 1; li += 2) for (var lj = 0; lj < 4; lj++) { var ay = -6 + lj * 4; leg += 'M' + r1(spc.x + li * 3 * spk) + ' ' + r1(spc.y + ay * 0.5) + 'q' + r1(li * 8 * spk) + ' ' + r1(-6 + lj * 2) + ' ' + r1(li * 13 * spk) + ' ' + r1(ay + 2 + lj * 1.5); } o += sl(leg, '#1a1618', 2) + sf(ellD(spc.x, spc.y + 3, 5 * spk, 6), '#1a1618') + sf(ellD(spc.x, spc.y - 4, 3.6 * spk, 3.4), '#1a1618'); }
    if (top.necklace) {
      var nk = []; for (var nt = -46; nt <= 46; nt += 4) { var nv = T.vis(nt, b.sy); nk.push(T.p(nt, b.sy - 4 - 7 * Math.cos(nt * D2R * 1.6), 1.6)); }
      if (T.vis(0, b.sy) > 0.05) { o += sl(smoothD(nk, false), dk(top.necklace, 0.4), 3.4) + sl(smoothD(nk, false), top.necklace, 2); var pd = T.p(0, b.sy - 13, 2); o += sp(ellD(pd.x, pd.y, 3.2, 4.4), top.necklace, { w: 1.4 }); if (top.beads) for (var bb = -1; bb <= 1; bb++) { var bq = T.p(bb * 14, b.sy - 9 + Math.abs(bb) * 2, 2); o += sp(ellD(bq.x, bq.y, 3.4, 3.4), top.necklace, { w: 1.3 }); } }
    }
    if (top.cord && T.vis(0, oy1) > 0.1) { var cq = T.p(-4, oy1 + 6, 1.4); o += sl('M' + r1(cq.x - 6) + ' ' + r1(cq.y - 4) + 'L' + r1(cq.x + 6) + ' ' + r1(cq.y + 1), top.cord, 2.4) + bowSvg(cq.x, cq.y, 0.55, top.cord, 'long'); }
    // 裾の縁
    if (top.hemTrim) { var hp1 = T.arc(hem + 5, 0.8, th0 - 95, th0 + 95, 5), hp2 = T.arc(hem, 0.8, th0 - 95, th0 + 95, 5).reverse(); o += sf(polyD(hp1.concat(hp2)), top.hemTrim); }
    if (top.hemLine !== false && c.def.bottom && c.def.bottom.kind === 'skirt') {
      // スカートのひだ
      for (var pl = -60; pl <= 60; pl += 30) { var pv2 = T.vis(pl, hem); if (pv2 < 0.1) continue; o += sl('M' + P(T.p(pl, oy0 - 2, 0.5)) + 'L' + P(T.p(pl * 1.08, hem + 1, 0.5)), dk(top.color, 0.3), 1.4, { op: 0.6 }); }
    }
    return o;
  }

  function emblemSvg(c, T, em) {
    var th = em.th == null ? -14 : em.th, y = em.y || (c.b.sy - 14), v = T.vis(th, y);
    if (v < 0.1) return '';
    var p = T.p(th, y, 1), k = Math.max(0.35, v * 1.4), r = em.r || 5, col = em.color || '#e0b23c';
    if (em.kind === 'cross') return sp('M' + r1(p.x - r * k) + ' ' + r1(p.y - 1.4) + 'h' + r1(2 * r * k) + 'v2.8h' + r1(-2 * r * k) + 'Z', col, { w: 1 }) + sp('M' + r1(p.x - 1.4 * k) + ' ' + r1(p.y - r) + 'h' + r1(2.8 * k) + 'v' + r1(2 * r) + 'h' + r1(-2.8 * k) + 'Z', col, { w: 1 });
    if (em.kind === 'star') { var s = []; for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 - Math.PI / 4, rr = i % 2 ? r * 0.35 : r; s.push({ x: p.x + Math.cos(a) * rr * k, y: p.y + Math.sin(a) * rr }); } return sp(polyD(s), col, { w: 1.2 }); }
    if (em.kind === 'diamond') return sp('M' + r1(p.x) + ' ' + r1(p.y - r) + 'l' + r1(r * 0.7 * k) + ' ' + r1(r) + 'l' + r1(-r * 0.7 * k) + ' ' + r1(r) + 'l' + r1(-r * 0.7 * k) + ' ' + r1(-r) + 'Z', col, { w: 1.2 });
    if (em.kind === 'circle') return sp(ellD(p.x, p.y, r * k, r), col, { w: 1.4 }) + sp(ellD(p.x, p.y, r * 0.5 * k, r * 0.5), em.inner || OUT, { w: 1 });
    if (em.kind === 'rabbit') return sp('M' + r1(p.x - 3 * k) + ' ' + r1(p.y + 4) + 'q' + r1(-1 * k) + ' ' + r1(-9) + ' ' + r1(1 * k) + ' ' + r1(-11) + 'q' + r1(1.5 * k) + ' ' + r1(3) + ' ' + r1(1 * k) + ' ' + r1(8) + 'q' + r1(2 * k) + ' ' + r1(-9) + ' ' + r1(4 * k) + ' ' + r1(-8) + 'q' + r1(0.5 * k) + ' ' + r1(5) + ' ' + r1(-1 * k) + ' ' + r1(9) + 'q' + r1(2 * k) + ' ' + r1(3) + ' ' + r1(-2 * k) + ' ' + r1(4) + 'Z', col, { w: 1 });
    return '';
  }

  function flameChest(c, T, top, oy1) {
    var o = '', col = top.flameChest, b = c.b;
    for (var i = 0; i < 5; i++) {
      var th = -60 + i * 30, v = T.vis(th, oy1 + 8); if (v < 0.05) continue;
      var p = T.p(th, oy1 + 3, 0.6), k = Math.max(0.4, v * 1.3);
      o += sf('M' + r1(p.x - 6 * k) + ' ' + r1(p.y) + 'Q' + r1(p.x - 5 * k) + ' ' + r1(p.y - 10) + ' ' + r1(p.x - 1 * k) + ' ' + r1(p.y - 18 - (i % 2) * 5) + 'Q' + r1(p.x + 1 * k) + ' ' + r1(p.y - 8) + ' ' + r1(p.x + 3 * k) + ' ' + r1(p.y - 12) + 'Q' + r1(p.x + 7 * k) + ' ' + r1(p.y - 5) + ' ' + r1(p.x + 6 * k) + ' ' + r1(p.y) + 'Z', col, { op: 0.95 });
    }
    return o;
  }

  function torsoPattern(c, T, top, hem) {
    var pt = top.pattern, o = '', b = c.b, i, th, y, v, p, k;
    var kind = pt.kind, col = pt.color || '#ffffff';
    if (kind === 'stripes') {
      for (th = -180; th < 180; th += pt.step || 18) {
        v = T.vis(th, (b.sy + hem) / 2); if (v < -0.05) continue;
        o += sl('M' + P(T.p(th, b.sy + 2, 0.4)) + 'L' + P(T.p(th, hem - 2, 0.4)), col, pt.w || 4);
      }
      return o;
    }
    var spots = pt.spots || [[-40, 0.3], [30, 0.2], [-10, 0.55], [50, 0.62], [-60, 0.75], [15, 0.85], [-30, 0.95]];
    spots.forEach(function (s) {
      th = s[0]; y = lerp(b.sy, hem, s[1]); v = T.vis(th, y); if (v < 0.12) return;
      p = T.p(th, y, 0.8); k = Math.max(0.35, v * 1.4);
      if (kind === 'sakura') o += sakuraSvg(p.x, p.y, (pt.r || 5.5), col);
      else if (kind === 'dots') o += sf(ellD(p.x, p.y, (pt.r || 1.8) * k, pt.r || 1.8), col);
      else if (kind === 'maple') o += mapleSvg(p.x, p.y, pt.r || 6, col, k);
      else if (kind === 'blood') o += sf(ellD(p.x, p.y, (pt.r || 3) * k * (0.6 + (s[0] % 3) * 0.2), (pt.r || 3) * 0.8), col, { op: 0.85 });
      else if (kind === 'swirl') o += sl('M' + r1(p.x - 6 * k) + ' ' + r1(p.y) + 'a' + r1(6 * k) + ' 6 0 1 1 ' + r1(6 * k) + ' 6a' + r1(3 * k) + ' 3 0 1 1 ' + r1(-3 * k) + ' -3', col, 2.2);
      else if (kind === 'diamonds') o += sp('M' + r1(p.x) + ' ' + r1(p.y - 4) + 'l' + r1(4 * k) + ' 4l' + r1(-4 * k) + ' 4l' + r1(-4 * k) + ' -4Z', col, { w: 1 });
      else if (kind === 'squares') o += sp('M' + r1(p.x - 4 * k) + ' ' + r1(p.y - 4) + 'h' + r1(8 * k) + 'v8h' + r1(-8 * k) + 'Z', col, { w: 1.2 });
      else if (kind === 'flower4') o += flower4Svg(p.x, p.y, pt.r || 4, col, k);
      else if (kind === 'butterfly') o += butterflySvg(p.x, p.y, pt.r || 6, col, k);
      else if (kind === 'fans') o += sp('M' + r1(p.x) + ' ' + r1(p.y + 4) + 'L' + r1(p.x - 7 * k) + ' ' + r1(p.y - 4) + 'Q' + r1(p.x) + ' ' + r1(p.y - 9) + ' ' + r1(p.x + 7 * k) + ' ' + r1(p.y - 4) + 'Z', col, { w: 1.1 }) + sl('M' + r1(p.x) + ' ' + r1(p.y + 4) + 'L' + r1(p.x) + ' ' + r1(p.y - 6), dk(col, 0.3), 0.9);
      else if (kind === 'tattoo') o += sl('M' + r1(p.x - 8 * k) + ' ' + r1(p.y) + 'q' + r1(4 * k) + ' -6 ' + r1(8 * k) + ' 0t' + r1(8 * k) + ' 0', col, 2.2);
    });
    return o;
  }
  function mapleSvg(x, y, r, col, k) {
    var p = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push({ x: x + Math.cos(a) * rr * (k || 1), y: y + Math.sin(a) * rr }); }
    return sp(polyD(p), col, { w: 1 });
  }
  function flower4Svg(x, y, r, col, k) {
    var o = ''; for (var i = 0; i < 4; i++) { var a = i * Math.PI / 2; o += sf(ellD(x + Math.cos(a) * r * 0.6 * k, y + Math.sin(a) * r * 0.6, r * 0.45 * k, r * 0.45), col); } return o;
  }
  function butterflySvg(x, y, r, col, k) {
    return sp('M' + r1(x) + ' ' + r1(y) + 'q' + r1(-r * k) + ' ' + r1(-r) + ' ' + r1(-r * k) + ' ' + r1(0) + 'q' + r1(0) + ' ' + r1(r * 0.8) + ' ' + r1(r * k) + ' ' + r1(0) + 'Zq' + r1(r * k) + ' ' + r1(-r) + ' ' + r1(r * k) + ' 0q0 ' + r1(r * 0.8) + ' ' + r1(-r * k) + ' 0Z', col, { w: 1 });
  }

  /* ---- 袴・長いスカート ---- */
  function drawHakama(c, bot) {
    var S = c.S, b = c.b, cam = c.cam;
    var H2 = new Trunk(cam, { x: 0, z: 0, y0: b.obi[0] + 2, y1: 8, rx0: b.hrx - 3, rz0: b.hrz - 3, rx1: bot.kind === 'longskirt' ? 34 : 32, rz1: 24 });
    var sil = H2.silPts();
    S.add(Z.TORSO + 0.3, sp(smoothD(sil, true, 0.35), bot.color));
    var cl = S.clip(smoothD(sil, true, 0.35));
    var o = '';
    var th0 = H2.front();
    for (var th = -60; th <= 60; th += 20) { var v = H2.vis(th, 30); if (v < 0.1) continue; o += sl('M' + P(H2.p(th, b.obi[0], 0.4)) + 'L' + P(H2.p(th * 1.15, 9, 0.4)), dk(bot.color, 0.35), 1.6, { op: 0.7 }); }
    if (bot.kind === 'hakama' && H2.vis(0, 20) > 0.1) o += sl('M' + P(H2.p(0, 32, 0.5)) + 'L' + P(H2.p(0, 8, 0.5)), OUT, 2.4);
    if (bot.bow) { var kp = H2.p(0, b.obi[0] - 2, 2), kv = H2.vis(0, b.obi[0]); if (kv > 0.1) o += bowSvg(kp.x, kp.y + 4, 1.25, bot.bow, 'long'); }
    // 陰
    var sh = []; for (var y = b.obi[0]; y >= 8; y -= 6) sh.push(H2.p(th0 + 70, y, 0.5)); for (y = 8; y <= b.obi[0]; y += 6) sh.push(H2.p(th0 + 115, y, 0.5));
    o += sf(polyD(sh), '#000', { op: 0.12 });
    S.add(Z.TORSO + 0.31, g(o, cl));
    // 帯を上に重ねる（上衣の裾が袴の中）
    if (bot.bow) { var kp2 = H2.p(0, b.obi[0] - 2, 2), kv2 = H2.vis(0, b.obi[0]); if (kv2 > 0.1) S.add(Z.TORSO + 0.6, bowSvg(kp2.x, kp2.y + 4, 1.25, bot.bow, 'long')); }
  }

  /* ---- 脚 ---- */
  function drawLegs(c, bot) {
    var S = c.S, b = c.b, cam = c.cam, def = c.def, R = c.R;
    var legs = def.legs || {}, feet = def.feet || { kind: 'sandal' };
    var hideLegs = (def.top && def.top.len === 'long') || bot.kind === 'hakama' || bot.kind === 'longskirt';
    for (var k = 0; k < 2; k++) {
      var s = k ? 1 : -1, L = R.legs[s];
      var hip = cam.pv(L.hip), A = cam.pv(L.A);
      var dep = cam.p(L.A[0], 0, L.A[2]).z;
      var zL = Z.LEG + dep * 0.01;
      if (!hideLegs) {
        var lw = (legs.w || (bot.kind === 'pants' ? b.legW : b.legW - 4)) / 2;
        if (bot.kind === 'pants' || bot.kind === 'shorts') {
          var knee = { x: lerp(hip.x, A.x, bot.kind === 'shorts' ? 0.42 : 1), y: lerp(hip.y, A.y, bot.kind === 'shorts' ? 0.42 : 1) };
          if (bot.kind === 'shorts') {
            S.add(zL, sp(capsD(knee, A, lw * 0.78, lw * 0.72), legs.color || c.skin));
            S.add(zL + 0.001, sp(capsD(hip, knee, lw + 1, lw + 1), bot.color));
          } else {
            S.add(zL, sp(capsD(hip, A, lw + 1, lw), bot.color));
            if (bot.wrap) { var mid = { x: lerp(hip.x, A.x, 0.55), y: lerp(hip.y, A.y, 0.55) }; S.add(zL + 0.001, sp(capsD(mid, A, lw * 0.82, lw * 0.8), bot.wrap)); S.add(zL + 0.002, sl('M' + r1(mid.x - lw * 0.7) + ' ' + r1(mid.y + 4) + 'L' + r1(mid.x + lw * 0.7) + ' ' + r1(mid.y + 6), lt(bot.wrap, 0.25), 1.3)); }
          }
        } else { // skirt / none：素足かソックス
          var sockTop = legs.top == null ? 0.45 : legs.top;
          var kn = { x: lerp(hip.x, A.x, sockTop), y: lerp(hip.y, A.y, sockTop) };
          S.add(zL, sp(capsD(hip, A, lw, lw * 0.9), def.head && def.head.kind === 'chick' ? '#f39a2a' : c.skin));
          if (legs.color) { S.add(zL + 0.001, sp(capsD(kn, A, lw + 0.6, lw * 0.95), legs.color)); if (legs.dash) S.add(zL + 0.002, sl('M' + r1(kn.x) + ' ' + r1(kn.y + 3) + 'L' + r1(A.x) + ' ' + r1(A.y - 3), legs.dash, 2, { dash: '3 3' })); if (legs.band) S.add(zL + 0.002, sl('M' + r1(kn.x - lw) + ' ' + r1(kn.y + 1.5) + 'L' + r1(kn.x + lw) + ' ' + r1(kn.y + 1.5), legs.band, 2.4)); }
        }
      }
      drawFoot(c, L, s, feet, zL + 0.5);
    }
  }
  function drawFoot(c, L, s, ft, z) {
    var S = c.S, cam = c.cam, A = L.A;
    var ctr = cam.p(A[0], Math.max(4, A[1] - 5), A[2] + 3);
    var rx = cam.ex(9.5, 12.5), ry = 6;
    var kind = ft.kind || 'sandal';
    if (kind === 'bird') {
      var o = '';
      var dir = Math.sin(c.yaw * D2R);
      for (var i = -1; i <= 1; i++) o += sl('M' + r1(ctr.x) + ' ' + r1(ctr.y - 2) + 'l' + r1(i * 7 * Math.cos(c.yaw * D2R) + dir * 8) + ' ' + r1(5), OUT, 6) + sl('M' + r1(ctr.x) + ' ' + r1(ctr.y - 2) + 'l' + r1(i * 7 * Math.cos(c.yaw * D2R) + dir * 8) + ' ' + r1(5), ft.color || '#f39a2a', 3.4);
      S.add(z, o); return;
    }
    if (kind === 'geta') {
      S.add(z, sp('M' + r1(ctr.x - rx) + ' ' + r1(ctr.y + 1) + 'L' + r1(ctr.x + rx) + ' ' + r1(ctr.y + 1) + 'L' + r1(ctr.x + rx) + ' ' + r1(ctr.y + 5) + 'L' + r1(ctr.x - rx) + ' ' + r1(ctr.y + 5) + 'Z', ft.sole || '#2a2226', { w: 2 }) +
        sp(ellD(ctr.x, ctr.y - 1.5, rx * 0.86, 5), ft.color || '#f4f0e8', { w: 2.2 }) + sl('M' + r1(ctr.x - 3) + ' ' + r1(ctr.y - 4) + 'L' + r1(ctr.x) + ' ' + r1(ctr.y - 1) + 'L' + r1(ctr.x + 3) + ' ' + r1(ctr.y - 4), ft.strap || '#c8302c', 2));
      if (ft.tall) S.add(z - 0.01, sp('M' + r1(ctr.x - rx * 0.8) + ' ' + r1(ctr.y + 4) + 'L' + r1(ctr.x + rx * 0.8) + ' ' + r1(ctr.y + 4) + 'L' + r1(ctr.x + rx * 0.7) + ' ' + r1(ctr.y + 10) + 'L' + r1(ctr.x - rx * 0.7) + ' ' + r1(ctr.y + 10) + 'Z', ft.sole || '#2a2226', { w: 2 }) + sl('M' + r1(ctr.x - rx * 0.75) + ' ' + r1(ctr.y + 5.5) + 'L' + r1(ctr.x + rx * 0.75) + ' ' + r1(ctr.y + 5.5), ft.trim || '#d8a63a', 1.5));
      return;
    }
    var col = ft.color || (kind === 'bare' ? c.skin : '#26232a');
    var sole = ft.sole || '#8a5a36';
    var d = ellD(ctr.x, ctr.y, rx, ry);
    S.add(z, sp(d, col));
    var cl = S.clip(d);
    if (kind !== 'bare' && kind !== 'paw') S.add(z + 0.01, g(sf('M' + r1(ctr.x - rx - 2) + ' ' + r1(ctr.y + 2) + 'L' + r1(ctr.x + rx + 2) + ' ' + r1(ctr.y + 2) + 'L' + r1(ctr.x + rx + 2) + ' ' + r1(ctr.y + ry + 2) + 'L' + r1(ctr.x - rx - 2) + ' ' + r1(ctr.y + ry + 2) + 'Z', sole), cl));
    if (ft.toe) S.add(z + 0.02, g(sf(ellD(ctr.x + Math.sin(c.yaw * D2R) * rx * 0.6, ctr.y - 0.5, rx * 0.45, 3.5), ft.toe), cl));
    if (kind === 'sandal' && ft.strap) S.add(z + 0.02, sl('M' + r1(ctr.x - 3) + ' ' + r1(ctr.y - 3.5) + 'L' + r1(ctr.x) + ' ' + r1(ctr.y) + 'L' + r1(ctr.x + 3) + ' ' + r1(ctr.y - 3.5), ft.strap, 1.8));
    if (kind === 'paw') S.add(z + 0.02, sl('M' + r1(ctr.x - 3) + ' ' + r1(ctr.y + 1) + 'l0 4M' + r1(ctr.x + 3) + ' ' + r1(ctr.y + 1) + 'l0 4', OUT, 1.3));
  }

  /* ---- 腕・手 ---- */
  function drawArms(c) {
    var def = c.def, S = c.S, cam = c.cam, R = c.R, b = c.b;
    var top = def.top || {}, sl2 = def.sleeves || { kind: 'short' }, arm = def.arms || {};
    for (var k = 0; k < 2; k++) {
      var s = k ? 1 : -1, A = R.arms[s];
      var Sp = cam.pv(A.S), E = cam.pv(A.E), Hh = cam.pv(A.H);
      var dep = Sp.z;
      var zA = dep < -4 ? Z.FARARM : Z.ARM + dep * 0.01;
      if (c.back) zA = dep < -4 ? Z.FARARM : Z.ARM + 1;
      var kind = sl2.kind || 'short';
      if (sl2.one && sl2.one !== s) kind = 'none';
      var sleeveCol = sl2.color || (def.over && def.over.sleeves !== false ? def.over.color : top.color);
      var armCol = arm.color || c.skin;
      // 前腕
      var fStart = kind === 'none' ? Sp : E;
      if (kind === 'none') S.add(zA, sp(capsD(Sp, E, b.armW / 2 + 0.5, b.armW / 2), armCol));
      S.add(zA + 0.001, sp(capsD(E, Hh, b.armW / 2, b.armW / 2 - 0.5), armCol));
      if (arm.guard && (!arm.guardSide || arm.guardSide === s)) {
        var g0 = { x: lerp(E.x, Hh.x, 0.15), y: lerp(E.y, Hh.y, 0.15) }, g1 = { x: lerp(E.x, Hh.x, 0.8), y: lerp(E.y, Hh.y, 0.8) };
        S.add(zA + 0.002, sp(capsD(g0, g1, b.armW / 2 + 1.2, b.armW / 2 + 0.8), arm.guard));
        S.add(zA + 0.003, sl('M' + P(g0) + 'L' + P(g1), lt(arm.guard, 0.35), 1.6, { op: 0.8 }));
        if (arm.spikes) { var mx = (g0.x + g1.x) / 2, my = (g0.y + g1.y) / 2; S.add(zA + 0.004, sp('M' + r1(mx - s * 4) + ' ' + r1(my - 3) + 'l' + r1(s * 12) + ' ' + r1(-2) + 'l' + r1(-s * 10) + ' ' + r1(7) + 'Z', '#b7bbc2', { w: 1.4 })); }
      }
      if (arm.glove && arm.glove.side === s) { // 鷹匠の革手袋
        var gs = { x: lerp(E.x, Hh.x, 0.3), y: lerp(E.y, Hh.y, 0.3) };
        S.add(zA + 0.0025, sp(capsD(gs, Hh, b.armW / 2 + 2, b.armW / 2 + 1.5), arm.glove.color));
        if (arm.glove.tassel) S.add(zA + 0.0026, sl('M' + P(gs) + 'l' + r1(-s * 3) + ' 10', '#26386b', 1.4) + sp(ellD(gs.x - s * 3, gs.y + 11, 2.6, 2.6), arm.glove.tassel, { w: 1.1 }) + sl('M' + r1(gs.x - s * 3) + ' ' + r1(gs.y + 13) + 'l' + r1(-s * 1) + ' 8', '#6a3a8a', 2.2));
      }
      if (arm.bandage) { for (var bi = 0; bi < 3; bi++) { var bp = { x: lerp(E.x, Hh.x, 0.3 + bi * 0.18), y: lerp(E.y, Hh.y, 0.3 + bi * 0.18) }; S.add(zA + 0.003, sl('M' + r1(bp.x - 5) + ' ' + r1(bp.y - 1) + 'L' + r1(bp.x + 5) + ' ' + r1(bp.y + 1.5), '#f4f1ea', 3.2)); } }
      if (arm.beads) { var bpp = { x: lerp(E.x, Hh.x, 0.82), y: lerp(E.y, Hh.y, 0.82) }; for (var bj = -2; bj <= 2; bj++) S.add(zA + 0.004, sp(ellD(bpp.x + bj * 2.6, bpp.y + Math.abs(bj) * 0.8, 2.3, 2.3), arm.beads, { w: 1 })); }
      // 袖
      if (kind === 'short' || kind === 'long' || kind === 'wide') {
        var send = { x: lerp(Sp.x, E.x, kind === 'short' ? 1.05 : 1.15), y: lerp(Sp.y, E.y, kind === 'short' ? 1.05 : 1.15) };
        var w0 = 9, w1 = kind === 'short' ? 11.5 : 14;
        var sd = capsD(Sp, send, w0, w1);
        S.add(zA + 0.01, sp(sd, sleeveCol));
        if (kind === 'long' || kind === 'wide') { // 振袖のたもと
          var hang = { x: send.x + s * 2, y: send.y + (kind === 'long' ? 22 : 12) };
          S.add(zA + 0.009, sp('M' + r1(send.x - 13) + ' ' + r1(send.y - 4) + 'L' + r1(send.x + 13) + ' ' + r1(send.y - 4) + 'Q' + r1(hang.x + 14) + ' ' + r1(hang.y) + ' ' + r1(hang.x) + ' ' + r1(hang.y + 3) + 'Q' + r1(hang.x - 14) + ' ' + r1(hang.y) + ' ' + r1(send.x - 13) + ' ' + r1(send.y - 4) + 'Z', sleeveCol));
          if (sl2.pattern === 'sakura') S.add(zA + 0.011, sakuraSvg(hang.x, hang.y - 8, 5, sl2.patternColor || '#f7b8cc'));
          if (sl2.pattern === 'flame') S.add(zA + 0.011, sf('M' + r1(hang.x - 11) + ' ' + r1(hang.y + 1) + 'Q' + r1(hang.x - 8) + ' ' + r1(hang.y - 12) + ' ' + r1(hang.x - 4) + ' ' + r1(hang.y - 7) + 'Q' + r1(hang.x - 1) + ' ' + r1(hang.y - 18) + ' ' + r1(hang.x + 3) + ' ' + r1(hang.y - 8) + 'Q' + r1(hang.x + 8) + ' ' + r1(hang.y - 14) + ' ' + r1(hang.x + 11) + ' ' + r1(hang.y + 1) + 'Z', sl2.patternColor || '#d8302c'));
          if (sl2.pattern === 'maple') S.add(zA + 0.011, mapleSvg(hang.x, hang.y - 6, 5, sl2.patternColor || '#d8452c'));
        }
        if (sl2.trim) { var ts = { x: lerp(Sp.x, send.x, 0.86), y: lerp(Sp.y, send.y, 0.86) }; S.add(zA + 0.012, sl('M' + P(ts) + 'L' + P(send), sl2.trim, 5, { op: 0.9 })); }
        if (sl2.cross) { var mp = { x: lerp(Sp.x, send.x, 0.5), y: lerp(Sp.y, send.y, 0.5) }; S.add(zA + 0.012, sp('M' + r1(mp.x - 4) + ' ' + r1(mp.y - 1.2) + 'h8v2.4h-8Z', sl2.cross, { w: 0.8 }) + sp('M' + r1(mp.x - 1.2) + ' ' + r1(mp.y - 4) + 'h2.4v8h-2.4Z', sl2.cross, { w: 0.8 })); }
        if (sl2.shoulder) S.add(zA + 0.013, sp(ellD(Sp.x + s * 3, Sp.y + 1, 11, 8), sl2.shoulder) + sp('M' + r1(Sp.x + s * 4) + ' ' + r1(Sp.y - 6) + 'l' + r1(s * 4) + ' -9l' + r1(s * 3) + ' 9Z', '#b7bbc2', { w: 1.2 }));
      } else if (kind === 'tight') {
        S.add(zA + 0.01, sp(capsD(Sp, E, b.armW / 2 + 1.2, b.armW / 2 + 0.8), sleeveCol));
      }
      // 手
      drawHand(c, Hh, A, s, R.hold ? Z.ARM + 0.03 : zA + 0.02, arm);
      A.scr = { S: Sp, E: E, H: Hh, z: zA };
    }
  }
  function drawHand(c, Hh, A, s, z, arm) {
    var S = c.S, b = c.b, r = b.hand, col = arm.hand || arm.color || c.skin, def = c.def;
    var hk = A.hand;
    if (def.hands && def.hands[s]) hk = def.hands[s];
    if (c.R.pose !== 'stand' && c.R.pose !== 'walk') hk = A.hand;
    if (c.R.seal && s > 0) { // 印を結ぶ両手
      S.add(z, sp(ellD(Hh.x, Hh.y, r * 1.05, r * 1.15), col) + sl('M' + r1(Hh.x) + ' ' + r1(Hh.y - r) + 'L' + r1(Hh.x) + ' ' + r1(Hh.y + r * 0.6), OUT, 1.6) + sp(capsD({ x: Hh.x, y: Hh.y - r * 0.6 }, { x: Hh.x, y: Hh.y - r * 2 }, 2.8, 2.4), col, { w: 2 }));
      return;
    }
    if (c.R.seal && s < 0) return;
    if (def.claws && c.R.pose === 'stand') {
      S.add(z, sp(ellD(Hh.x, Hh.y, r + 1.5, r + 1), def.claws.color || '#5a5c63'));
      for (var i = -1; i <= 1; i++) S.add(z + 0.001, sp('M' + r1(Hh.x + i * 3.6) + ' ' + r1(Hh.y + 3) + 'l' + r1(i * 2 + s * 1.5) + ' 14l' + r1(2) + ' -14Z', '#c8ccd3', { w: 1.3 }));
      return;
    }
    if (arm.paw || def.paws) col = def.paws || arm.paw;
    if (arm.glove && arm.glove.side === s) col = arm.glove.color;
    if (def.head && def.head.kind === 'chick') {
      var ang = Math.atan2(Hh.y - c.cam.pv(A.E).y, Hh.x - c.cam.pv(A.E).x);
      var ex2 = Hh.x + Math.cos(ang) * 8, ey2 = Hh.y + Math.sin(ang) * 8;
      S.add(z, sp('M' + r1(Hh.x - 6) + ' ' + r1(Hh.y - 5) + 'Q' + r1(ex2 + 4) + ' ' + r1(ey2 - 4) + ' ' + r1(ex2) + ' ' + r1(ey2) + 'Q' + r1(ex2 - 2) + ' ' + r1(ey2 + 5) + ' ' + r1(Hh.x - 5) + ' ' + r1(Hh.y + 6) + 'Z', col));
      return;
    }
    if (hk === 'peace') {
      S.add(z, sp(capsD({ x: Hh.x - 2, y: Hh.y - 3 }, { x: Hh.x - 4, y: Hh.y - 15 }, 2.4, 2.2), col, { w: 2 }) + sp(capsD({ x: Hh.x + 2, y: Hh.y - 3 }, { x: Hh.x + 3.5, y: Hh.y - 15 }, 2.4, 2.2), col, { w: 2 }) + sp(ellD(Hh.x, Hh.y, r, r * 0.95), col));
      return;
    }
    if (hk === 'point') {
      S.add(z, sp(capsD({ x: Hh.x, y: Hh.y - 3 }, { x: Hh.x + s * 1, y: Hh.y - 16 }, 2.5, 2.2), col, { w: 2 }) + sp(ellD(Hh.x, Hh.y, r, r * 0.95), col));
      return;
    }
    if (hk === 'twofinger') {
      S.add(z, sp(capsD({ x: Hh.x, y: Hh.y - 3 }, { x: Hh.x, y: Hh.y - 16 }, 3.6, 3.2), col, { w: 2 }) + sl('M' + r1(Hh.x) + ' ' + r1(Hh.y - 5) + 'L' + r1(Hh.x) + ' ' + r1(Hh.y - 17), OUT, 1.2) + sp(ellD(Hh.x, Hh.y, r, r * 0.95), col));
      return;
    }
    if (hk === 'thumb') {
      S.add(z, sp(ellD(Hh.x, Hh.y, r + 0.5, r), col) + sp(capsD({ x: Hh.x, y: Hh.y - 3 }, { x: Hh.x + s * 1, y: Hh.y - 14 }, 3, 2.6), col, { w: 2 }));
      return;
    }
    S.add(z, sp(ellD(Hh.x, Hh.y, r, r * 0.95), col));
    if (hk === 'fist') S.add(z + 0.001, sl('M' + r1(Hh.x - r * 0.5) + ' ' + r1(Hh.y - r * 0.1) + 'Q' + r1(Hh.x) + ' ' + r1(Hh.y + r * 0.4) + ' ' + r1(Hh.x + r * 0.5) + ' ' + r1(Hh.y - r * 0.1), OUT, 1.3));
  }

  /* ---- 羽織・外套・合羽・打掛 ---- */
  function drawOver(c, ov, T, deco) {
    var S = c.S, b = c.b, cam = c.cam;
    var hem = ov.hem == null ? (ov.kind === 'coat' ? 16 : ov.kind === 'uchikake' ? 5 : ov.kind === 'cape' ? 62 : 44) : ov.hem;
    var grow = ov.kind === 'uchikake' ? 9 : ov.kind === 'coat' ? 5 : 3;
    var O = new Trunk(cam, { x: 0, z: 0, y0: b.sy + 2, y1: hem, rx0: b.srx + 3, rz0: b.srz + 3, rx1: (ov.kind === 'cape' ? b.srx + 10 : b.hrx) + grow, rz1: (ov.kind === 'cape' ? b.srz + 8 : b.hrz) + grow * 0.7 });
    var sil = O.silPts();
    var d = smoothD(sil, true, 0.35);
    var zO = Z.OVER;
    var open = ov.open == null ? 22 : ov.open;
    // 開いた前から中が見える
    var fv = O.vis(0, (b.sy + hem) / 2);
    S.add(zO, sp(d, ov.color));
    var oc = S.clip(d);
    var o = '';
    if (ov.pattern) o += torsoPattern(c, O, { pattern: ov.pattern }, hem);
    // 陰
    var th0 = O.front(), sh = [];
    for (var y = b.sy; y >= hem; y -= 5) sh.push(O.p(th0 + 72, y, 0.5));
    for (y = hem; y <= b.sy; y += 5) sh.push(O.p(th0 + 115, y, 1));
    o += sf(polyD(sh), '#000', { op: 0.13 });
    S.add(zO + 0.01, g(o, oc));
    if (fv > -0.2 && !c.back) {
      var yTop = b.sy + 2, yBot = hem;
      var opening = [];
      for (y = yTop; y >= yBot; y -= 4) opening.push(O.p(-open - (ov.flareOpen || 0) * (yTop - y) / (yTop - yBot), y, 0.5));
      for (y = yBot; y <= yTop; y += 4) opening.push(O.p(open + (ov.flareOpen || 0) * (yTop - y) / (yTop - yBot), y, 0.5));
      var od = polyD(opening);
      var cl2 = S.clip(od);
      // 中身：胴の色と飾り（胴がないところは脚などが見える＝そのまま透かす）
      var inner = sf(od, (c.def.top || {}).color || '#333');
      S.add(zO + 0.02, g(inner + deco, cl2));
      // 裏地
      var lc = ov.lining || dk(ov.color, 0.3);
      for (var s = -1; s <= 1; s += 2) {
        var ed = [];
        for (y = yTop; y >= yBot; y -= 4) ed.push(O.p(s * (open + (ov.flareOpen || 0) * (yTop - y) / (yTop - yBot)), y, 0.8));
        if (O.vis(s * open, (yTop + yBot) / 2) > -0.1) S.add(zO + 0.03, sl(openD(ed), OUT, 7.5) + sl(openD(ed), lc, 5));
      }
      if (ov.trim) { var tr = O.arc(hem + 3, 0.8, th0 - 95, th0 + 95, 5); S.add(zO + 0.03, g(sl(smoothD(tr, false), ov.trim, 4), oc)); }
    }
    if (ov.stitch && !c.back) { // 肩の白い×
      for (var s2 = -1; s2 <= 1; s2 += 2) { var sp2 = O.p(s2 * 62, b.sy - 6, 1); if (O.vis(s2 * 62, b.sy) > 0.05) S.add(zO + 0.04, sl('M' + r1(sp2.x - 4) + ' ' + r1(sp2.y - 4) + 'l8 8M' + r1(sp2.x + 4) + ' ' + r1(sp2.y - 4) + 'l-8 8', ov.stitch, 2.2)); }
    }
  }
  function drawFurCollar(c, fur) {
    var S = c.S, b = c.b, cam = c.cam;
    var pts = [], y = b.sy - 1;
    for (var i = 0; i < 36; i++) { var a = i * 10, rr = i % 2 ? 1 : 1.25; pts.push(cam.p(Math.sin(a * D2R) * (b.srx + 6) * rr, y - (i % 2 ? 0 : 5) - 3, Math.cos(a * D2R) * (b.srz + 5) * rr)); }
    var inner = []; for (i = 0; i < 36; i++) { var a2 = i * 10; inner.push(cam.p(Math.sin(a2 * D2R) * (b.srx - 4), y + 4, Math.cos(a2 * D2R) * (b.srz - 3))); }
    S.add(Z.OVER + 1, sp(polyD(hull(pts.concat(inner))), fur.color));
    var d = ''; for (i = 0; i < 36; i += 2) { var p = pts[i]; if (p.z > 0) d += 'M' + r1(p.x) + ' ' + r1(p.y) + 'l' + r1((100 - p.x) * 0.1) + ' ' + r1(-6); }
    S.add(Z.OVER + 1.01, sl(d, dk(fur.color, 0.3), 1.4, { op: 0.8 }));
  }
  function drawScarf(c, sc) {
    var S = c.S, b = c.b, cam = c.cam;
    var y = b.sy + 1, ring = [];
    for (var i = 0; i < 36; i++) { var a = i * 10 * D2R; ring.push(cam.p(Math.sin(a) * (b.srx - 1), y + 6, Math.cos(a) * (b.srz + 2))); ring.push(cam.p(Math.sin(a) * (b.srx - 3), y - 7, Math.cos(a) * (b.srz))); }
    var rd = polyD(hull(ring));
    S.add(Z.OVER + 2, sp(rd, sc.color));
    if (sc.pattern === 'check') {
      var rc = S.clip(rd), pat = '';
      var py0 = c.tall ? Math.floor(scrY(c, 110)) : 110;
      for (var x = 50; x < 150; x += 8) for (var yy = py0; yy < py0 + 40; yy += 8) if (((x - 50) / 8 + (yy - py0) / 8) % 2 === 0) pat += 'M' + x + ' ' + yy + 'h8v8h-8Z';
      S.add(Z.OVER + 2.01, sf(pat, sc.color2 || '#8a4a1e', { clip: rc }));
    }
    // たなびく端（向かって左後ろへ）
    if (sc.tail !== false) {
      var dir = sc.dir || -1;
      var t0 = [dir * 12, y + 2, -12], t1 = [dir * 40, y + 10, -26], t2 = [dir * 70, y - 2, -30], t3 = [dir * (sc.len || 92), y - 14, -26];
      var m = massD(c, [t0, t1, t2, t3], [12, 15, 14, 11]);
      var zt = m.depth < -6 ? Z.BACK + 5 : Z.OVER + 1.9;
      S.add(zt, sp(m.d, sc.color2 && sc.pattern !== 'check' ? sc.color2 : sc.color));
      var endp = m.scr[m.scr.length - 1];
      S.add(zt + 0.01, sl('M' + r1(endp.x - 3) + ' ' + r1(endp.y - 5) + 'l-5 1M' + r1(endp.x - 2) + ' ' + r1(endp.y) + 'l-6 1M' + r1(endp.x - 2) + ' ' + r1(endp.y + 5) + 'l-5 2', dk(sc.color, 0.3), 1.4));
    }
  }

  /* ---- 背中の物（刀・箱・翼・尻尾・パンダ） ---- */
  function drawBackItems(c) {
    var def = c.def, S = c.S, cam = c.cam, b = c.b, back = def.back || {};
    var zBack = function (d) { return d < -2 ? Z.BACK : Z.OVER + 5; };
    if (back.katana) {
      var kt = back.katana;
      var s = kt.side || 1;
      var top = [s * (b.srx + 26), b.sy + 26, -10], grd = [s * (b.srx + 17), b.sy + 12, -14], end = [-s * (b.srx + 2), b.obi[0] - 10, -20];
      if (kt.hip) { top = [s * 44, b.obi[0] + 16, 16]; grd = [s * 36, b.obi[0] + 6, 14]; end = [s * 8, b.obi[0] - 18, -26]; }
      var T0 = cam.pv(top), G = cam.pv(grd), E = cam.pv(end);
      var zk = kt.hip ? (G.z < -4 ? Z.BACK + 1 : Z.ARM + 2) : zBack(G.z);
      var saya = kt.saya || '#1f1c20';
      S.add(zk, sp(capsD(G, E, 3.8, 3.4), saya));
      S.add(zk + 0.001, sp(ellD(E.x, E.y, 3.8, 3.8), kt.tip || '#c9a24a', { w: 1.6 }));
      S.add(zk + 0.002, sp(capsD(T0, G, 3.3, 3.3), kt.hilt || '#232126'));
      // 柄巻きの菱
      var dx = G.x - T0.x, dy = G.y - T0.y;
      for (var i = 1; i < 4; i++) { var px = T0.x + dx * i / 4, py = T0.y + dy * i / 4; S.add(zk + 0.003, sf('M' + r1(px) + ' ' + r1(py - 2) + 'l1.8 2l-1.8 2l-1.8 -2Z', kt.wrap || '#f1efe8')); }
      var gx = G.x, gy = G.y, l = Math.hypot(dx, dy) || 1;
      S.add(zk + 0.004, sp(ellD(gx, gy, 5.4, 3), kt.guard || '#d8b04a', { w: 1.6, extra: ' transform="rotate(' + r1(Math.atan2(dy, dx) / D2R + 90) + ' ' + r1(gx) + ' ' + r1(gy) + ')"' }));
      S.add(zk + 0.005, sp(ellD(T0.x, T0.y, 3.4, 3.4), kt.guard || '#d8b04a', { w: 1.5 }));
      if (kt.second) { // 脇差
        var t2 = cam.pv([s * 40, b.obi[0] + 8, 18]), g2 = cam.pv([s * 34, b.obi[0], 16]), e2 = cam.pv([s * 12, b.obi[0] - 14, -20]);
        S.add(zk - 0.01, sp(capsD(g2, e2, 3.2, 3), saya) + sp(capsD(t2, g2, 2.8, 2.8), kt.hilt || '#232126') + sp(ellD(g2.x, g2.y, 4, 2.4), kt.guard || '#d8b04a', { w: 1.3 }));
      }
    }
    if (back.tube) {
      var tb = cam.pv([-(b.srx + 20), b.sy + 22, -12]), tb2 = cam.pv([b.srx - 6, b.obi[0] - 8, -20]);
      S.add(zBack(tb.z), sp(capsD(tb, tb2, 5.5, 5), back.tube) + sl('M' + r1(lerp(tb.x, tb2.x, 0.2) - 5) + ' ' + r1(lerp(tb.y, tb2.y, 0.2)) + 'l10 2M' + r1(lerp(tb.x, tb2.x, 0.5) - 5) + ' ' + r1(lerp(tb.y, tb2.y, 0.5)) + 'l10 2', dk(back.tube, 0.35), 1.6));
    }
    if (back.box) drawBox(c, back.box);
    if (def.wings) drawWings(c, def.wings);
    if (def.tail) drawTail(c, def.tail);
    if (back.panda) drawPanda(c, back.panda);
    if (def.halo) {
      var hc = cam.pv([0, b.headY + 8 * c.hs, -30]), hrr = r1(58 * c.hs);
      S.add(Z.BACK - 5, '<circle cx="' + r1(hc.x) + '" cy="' + r1(hc.y) + '" r="' + hrr + '" fill="none" stroke="#fff6c8" stroke-width="10" opacity=".75"/><circle cx="' + r1(hc.x) + '" cy="' + r1(hc.y) + '" r="' + hrr + '" fill="none" stroke="#f3d56a" stroke-width="3" opacity=".9"/>');
    }
  }
  function drawBox(c, bx) {
    var S = c.S, cam = c.cam, b = c.b;
    var x0 = -19, x1 = 19, y0 = b.obi[0] - 6, y1 = b.sy + 20, z0 = -b.srz - 2, z1 = -b.srz - 20;
    var V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(function (v) { return cam.pv(v); });
    var faces = [[0, 1, 2, 3, 0, 0, 1], [5, 4, 7, 6, 0, 0, -1], [4, 0, 3, 7, -1, 0, 0], [1, 5, 6, 2, 1, 0, 0], [3, 2, 6, 7, 0, 1, 0]];
    var o = '', col = bx.color || '#7a4a26';
    faces.forEach(function (f) {
      var nd = cam.nd(f[4], f[5], f[6]);
      if (nd <= 0.02) return;
      var pts = [V[f[0]], V[f[1]], V[f[2]], V[f[3]]];
      o += sp(polyD(pts), f[5] ? lt(col, 0.12) : (f[6] ? col : dk(col, 0.15)), { w: 2.4 });
      if (f[6] === -1) { // 背面の金具
        o += sl('M' + P({ x: lerp(pts[0].x, pts[3].x, 0.3), y: lerp(pts[0].y, pts[3].y, 0.3) }) + 'L' + P({ x: lerp(pts[1].x, pts[2].x, 0.3), y: lerp(pts[1].y, pts[2].y, 0.3) }), '#2a2226', 3) + sl('M' + P({ x: lerp(pts[0].x, pts[3].x, 0.7), y: lerp(pts[0].y, pts[3].y, 0.7) }) + 'L' + P({ x: lerp(pts[1].x, pts[2].x, 0.7), y: lerp(pts[1].y, pts[2].y, 0.7) }), '#2a2226', 3);
      }
    });
    var cd = cam.p(0, y1, z1).z;
    S.add(cd < 0 && !c.back ? Z.BACK + 2 : Z.OVER + 5, o);
    // 肩ひも（前）
    if (!c.back) for (var s = -1; s <= 1; s += 2) { var a = cam.p(s * 13, b.sy + 1, 6), e = cam.p(s * 17, b.obi[0] + 2, b.srz + 2); S.add(Z.OVER + 1.5, sl('M' + P(a) + 'L' + P(e), OUT, 6.4) + sl('M' + P(a) + 'L' + P(e), bx.strap || '#f1efe8', 4)); }
  }
  function drawWings(c, wg) {
    var S = c.S, cam = c.cam, b = c.b;
    for (var s = -1; s <= 1; s += 2) {
      var root = [s * 8, b.sy - 8, -b.srz + 2];
      var feathers = [[62, 36, 0], [72, 18, 0.4], [76, -2, 0.8], [68, -20, 1.2], [52, -34, 1.6]];
      feathers.forEach(function (fe, i) {
        var tip = [root[0] + s * fe[0], root[1] + fe[1], root[2] - 26 - i * 2];
        var m1 = [root[0] + s * fe[0] * 0.35, root[1] + fe[1] * 0.2 + 16, root[2] - 12];
        var m2 = [root[0] + s * fe[0] * 0.7, root[1] + fe[1] * 0.7 + 8, root[2] - 20];
        var m = massD(c, [root, m1, m2, tip], [12, 18, 16, 3]);
        var z = m.depth < -8 ? Z.BACK - 1 + i * 0.01 : Z.OVER + 6 + i * 0.01;
        S.add(z, sp(m.d, i % 2 ? wg.color : lt(wg.color, 0.08)));
        S.add(z + 0.001, sl(smoothD(m.scr.slice(2), false), wg.sheen || lt(wg.color, 0.3), 1.4, { op: 0.8 }));
      });
    }
  }
  function drawTail(c, tl) {
    var S = c.S, cam = c.cam, b = c.b, kind = tl.kind, m, pts, ws;
    var base = [0, b.obi[0] - 6, -b.hrz + 2];
    if (kind === 'dog') {
      pts = [base, [-14, base[1] + 4, base[2] - 12], [-26, base[1] + 18, base[2] - 12], [-24, base[1] + 32, base[2] - 6]];
      m = massD(c, pts, [11, 15, 15, 12]);
      var z = m.depth < 0 ? Z.BACK + 3 : Z.OVER + 7;
      S.add(z, sp(m.d, tl.color));
      var cp = cam.pv([-16, base[1] + 28, base[2] - 4]);
      S.add(z + 0.01, sp(ellD(cp.x, cp.y, 9, 8), tl.tip || '#f4f0e8', { w: 2.2 }) + sp(ellD(cp.x + 1, cp.y + 1, 3.5, 3), tl.color, { w: 1.4 }));
      return;
    }
    if (kind === 'fox') {
      var sd = tl.side || -1;
      pts = [base, [sd * 26, base[1] - 6, base[2] - 18], [sd * 52, base[1] + 6, base[2] - 20], [sd * 60, base[1] + 34, base[2] - 12]];
      ws = [8, 22, 28, 6];
    } else { // cat
      var sd2 = tl.side || 1;
      pts = [base, [sd2 * 24, base[1] - 10, base[2] - 12], [sd2 * 40, base[1] + 14, base[2] - 16], [sd2 * 34, base[1] + 40, base[2] - 12]];
      ws = [7, 8, 8, 6];
    }
    m = massD(c, pts, ws, { n: 18 });
    var zt = m.depth < -2 ? Z.BACK + 3 : Z.OVER + 7;
    S.add(zt, sp(m.d, tl.color));
    if (tl.tip) {
      var cl = S.clip(m.d);
      var tp = m.scr[m.scr.length - 1], tq = m.scr[Math.floor(m.scr.length * 0.7)];
      S.add(zt + 0.01, g(sf(ellD(tp.x, tp.y, Math.hypot(tp.x - tq.x, tp.y - tq.y) * 1.05, Math.hypot(tp.x - tq.x, tp.y - tq.y) * 1.05), tl.tip), cl));
      S.add(zt + 0.02, sp(m.d, 'none'));
    }
    if (tl.patches) { var cl2 = S.clip(m.d); tl.patches.forEach(function (pp) { var q = m.scr[Math.floor(m.scr.length * pp[0])]; S.add(zt + 0.015, g(sf(ellD(q.x, q.y, pp[1], pp[1] * 0.8), pp[2]), cl2)); }); S.add(zt + 0.02, sp(m.d, 'none')); }
  }
  function drawPanda(c, pd) {
    var S = c.S, cam = c.cam, b = c.b;
    var hc = cam.pv([-40, b.sy + 22, -22]);
    var z = hc.z < -4 ? Z.BACK + 4 : Z.OVER + 8;
    if (c.back) z = Z.OVER + 8;
    var o = '';
    o += sp(ellD(hc.x - 13, hc.y - 13, 6, 6), '#26232a') + sp(ellD(hc.x + 13, hc.y - 13, 6, 6), '#26232a');
    o += sp(ellD(hc.x, hc.y, 17, 15), '#f7f5f0');
    if (!c.back) {
      o += sf(ellD(hc.x - 7, hc.y - 1, 5, 6), '#26232a') + sf(ellD(hc.x + 7, hc.y - 1, 5, 6), '#26232a');
      o += sl('M' + r1(hc.x - 9) + ' ' + r1(hc.y - 1) + 'q2 -3 4 0M' + r1(hc.x + 5) + ' ' + r1(hc.y - 1) + 'q2 -3 4 0', '#ffffff', 1.4);
      o += sf(ellD(hc.x, hc.y + 5, 2.6, 1.8), '#26232a') + sp('M' + r1(hc.x - 4) + ' ' + r1(hc.y + 8) + 'Q' + r1(hc.x) + ' ' + r1(hc.y + 14) + ' ' + r1(hc.x + 4) + ' ' + r1(hc.y + 8) + 'Z', '#b83a3a', { w: 1.2 });
    }
    o += sp('M' + r1(hc.x - 15) + ' ' + r1(hc.y + 10) + 'Q' + r1(hc.x) + ' ' + r1(hc.y + 20) + ' ' + r1(hc.x + 15) + ' ' + r1(hc.y + 10) + 'L' + r1(hc.x + 12) + ' ' + r1(hc.y + 17) + 'Q' + r1(hc.x) + ' ' + r1(hc.y + 25) + ' ' + r1(hc.x - 12) + ' ' + r1(hc.y + 17) + 'Z', pd.cloth || '#c8302c', { w: 2 });
    S.add(z, o);
  }

  /* ---- 手に持つ物 ---- */
  function drawProp(c) {
    var def = c.def, pr = def.prop, S = c.S;
    if (!pr || c.opt.prop === false) return;
    if (c.R.pose !== 'stand' && c.R.pose !== 'hold' && !pr.always) return;
    if (c.R.hold && pr.kind === 'scroll') {
      var hl = c.cam.pv(c.R.arms[-1].H), hr = c.cam.pv(c.R.arms[1].H);
      var mxh = (hl.x + hr.x) / 2, myh = (hl.y + hr.y) / 2 - 2;
      var ho = sp(capsD({ x: mxh - 4, y: myh + 14 }, { x: mxh + 3, y: myh - 12 }, 8, 8), pr.color || '#6b3fa8') + sp(capsD({ x: mxh - 2.4, y: myh + 7 }, { x: mxh + 1.4, y: myh - 5 }, 8.3, 8.3), '#f7f3ea', { w: 1.8 }) + txt(mxh - 0.5, myh + 4, '忍', 8, '#3a2a22') + sp(ellD(mxh + 3, myh - 12, 7, 4.5), pr.cap || '#8a5a36', { w: 1.8 });
      c.S.add(Z.ARM + 0.015, ho);
      return;
    }
    var A = c.R.arms[pr.hand || -1];
    var Hh = c.cam.pv(A.H), E = c.cam.pv(A.E);
    var zA = (c.cam.pv(A.S).z < -4 ? Z.FARARM : Z.ARM) + 0.015;
    var dx = Hh.x - E.x, dy = Hh.y - E.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    var x = Hh.x, y = Hh.y, o = '', kind = pr.kind, i;
    switch (kind) {
      case 'shuriken': {
        var cx = x + ux * 10, cy = y + uy * 10 + 4, R = pr.r || 15, pts = [];
        for (i = 0; i < 8; i++) { var a = i * Math.PI / 4 + 0.3, rr = i % 2 ? R * 0.3 : R; pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.9 }); }
        o = sp(polyD(pts), pr.color || '#9a9ca3') + sl('M' + r1(cx - R * 0.5) + ' ' + r1(cy - R * 0.1) + 'L' + r1(cx + R * 0.1) + ' ' + r1(cy - R * 0.5), '#d6d8dd', 1.6) + sp(ellD(cx, cy, 3, 3), '#e9e3d6', { w: 1.6 });
        S.add(zA - 0.005, o); return;
      }
      case 'scroll': {
        var a1 = { x: x - 6, y: y + 12 }, a2 = { x: x + 7, y: y - 10 };
        o = sp(capsD(a1, a2, 7, 7), pr.color || '#4d8a4a') + sp(capsD({ x: lerp(a1.x, a2.x, 0.35), y: lerp(a1.y, a2.y, 0.35) }, { x: lerp(a1.x, a2.x, 0.68), y: lerp(a1.y, a2.y, 0.68) }, 7.3, 7.3), '#f7f3ea', { w: 1.8 }) +
          txt(lerp(a1.x, a2.x, 0.52), lerp(a1.y, a2.y, 0.52) + 3, '忍', 7.5, '#3a2a22') + sp(ellD(a2.x, a2.y, 6, 4), pr.cap || dk(pr.color || '#4d8a4a', 0.25), { w: 1.8 });
        S.add(zA - 0.005, o); return;
      }
      case 'dango': {
        var st = { x: x + 2, y: y - 4 }, en = { x: x + 22, y: y - 34 };
        o = sl('M' + P({ x: x - 4, y: y + 6 }) + 'L' + P(en), '#b58a52', 2.6);
        var cols = pr.colors || ['#86c46a', '#f5f2ea', '#f4a6c0'];
        for (i = 0; i < 3; i++) o += sp(ellD(lerp(st.x, en.x, 0.35 + i * 0.25), lerp(st.y, en.y, 0.35 + i * 0.25), 6.5, 6.5), cols[i], { w: 2 });
        S.add(zA - 0.005, o); return;
      }
      case 'bomb': {
        var bx = x + ux * 6, by = y - 8;
        o = sp(ellD(bx, by, 11, 10.5), '#8a5a36') + sl('M' + r1(bx - 8) + ' ' + r1(by - 3) + 'q8 6 16 0M' + r1(bx - 9) + ' ' + r1(by + 3) + 'q9 6 18 0M' + r1(bx - 4) + ' ' + r1(by - 9) + 'q-2 9 0 18M' + r1(bx + 4) + ' ' + r1(by - 9) + 'q2 9 0 18', '#6a4228', 1.3) +
          sl('M' + r1(bx + 2) + ' ' + r1(by - 10) + 'q3 -6 8 -8', '#3a2a22', 2) + starSvg(bx + 11, by - 19, 6, '#ff7a1a') + starSvg(bx + 11, by - 19, 3, '#ffe27a');
        S.add(zA + 0.005, o); return;
      }
      case 'kanabo': {
        var kb0 = { x: x - ux * 4, y: y - uy * 4 }, kb1 = { x: x + (pr.long ? 8 : 18), y: y + (pr.long ? 60 : 40) };
        o = sp(capsD(kb0, kb1, 4, pr.long ? 10 : 9), pr.color || '#7a7c83') + sp(ellD(kb0.x, kb0.y, 4.5, 3), '#26232a', { w: 1.5 });
        for (i = 0; i < 6; i++) { var t = 0.35 + i * 0.12, qx = lerp(kb0.x, kb1.x, t), qy = lerp(kb0.y, kb1.y, t); o += sp('M' + r1(qx - 8) + ' ' + r1(qy) + 'l-4 -2l4 -2Z', '#c8ccd3', { w: 1 }) + sp('M' + r1(qx + 8) + ' ' + r1(qy + 3) + 'l4 -2l-4 -2Z', '#c8ccd3', { w: 1 }); }
        S.add(zA - 0.01, o); return;
      }
      case 'fuda': {
        for (i = -1; i <= 1; i++) { var ang = i * 22 - 10; o += sp('M' + r1(x - 4) + ' ' + r1(y - 2) + 'h8v-20h-8Z', '#f7f3ea', { w: 1.6, extra: ' transform="rotate(' + ang + ' ' + r1(x) + ' ' + r1(y) + ')"' }) + sl('M' + r1(x - 1.5) + ' ' + r1(y - 18) + 'v10M' + r1(x + 1.5) + ' ' + r1(y - 16) + 'v8', '#d8302c', 1.3).replace('/>', ' transform="rotate(' + ang + ' ' + r1(x) + ' ' + r1(y) + ')"/>'); }
        S.add(zA + 0.005, o); return;
      }
      case 'dagger': {
        var d0 = { x: x, y: y }, d1 = { x: x - ux * 2 + 12, y: y + 14 };
        o = sp('M' + r1(x + 2) + ' ' + r1(y + 2) + 'L' + r1(x + 20) + ' ' + r1(y + 20) + 'L' + r1(x + 6) + ' ' + r1(y + 4) + 'Z', '#dfe3e8', { w: 1.8 }) + sp(capsD({ x: x - 6, y: y - 6 }, { x: x + 1, y: y + 1 }, 2.6, 2.6), '#26232a', { w: 1.6 });
        S.add(zA - 0.005, o); return;
      }
      case 'katana': {
        o = sp('M' + r1(x + 3) + ' ' + r1(y + 3) + 'L' + r1(x + 30) + ' ' + r1(y + 34) + 'L' + r1(x + 26) + ' ' + r1(y + 34) + 'L' + r1(x - 1) + ' ' + r1(y + 6) + 'Z', pr.blade || '#e3e7ec', { w: 1.8 }) +
          sp(ellD(x + 1, y + 3, 5.5, 3), '#d8b04a', { w: 1.5, extra: ' transform="rotate(-45 ' + r1(x + 1) + ' ' + r1(y + 3) + ')"' }) + sp(capsD({ x: x - 8, y: y - 8 }, { x: x, y: y + 1 }, 2.8, 2.8), '#232126', { w: 1.6 });
        if (pr.glow) { S.def('<filter id="' + c.uid + 'bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>'); o = '<path d="M' + r1(x + 3) + ' ' + r1(y + 3) + 'L' + r1(x + 30) + ' ' + r1(y + 34) + '" stroke="#ff3a1a" stroke-width="9" opacity=".6" filter="url(#' + c.uid + 'bl)"/>' + o.replace(pr.blade || '#e3e7ec', '#ff5a3a'); }
        S.add(zA - 0.005, o); return;
      }
      case 'gyuto': {
        o = sp('M' + r1(x + 2) + ' ' + r1(y + 4) + 'L' + r1(x + 8) + ' ' + r1(y + 34) + 'Q' + r1(x + 20) + ' ' + r1(y + 36) + ' ' + r1(x + 20) + ' ' + r1(y + 26) + 'L' + r1(x + 14) + ' ' + r1(y + 2) + 'Z', '#d9dde3', { w: 2 }) + sp(capsD({ x: x + 6, y: y - 8 }, { x: x + 8, y: y + 3 }, 3, 3), '#3a2a22', { w: 1.6 });
        S.add(zA - 0.005, o); return;
      }
      case 'shamisen': {
        var sx = x + 8, sy = y + 6;
        o = sl('M' + r1(sx - 14) + ' ' + r1(sy - 44) + 'L' + r1(sx + 6) + ' ' + r1(sy + 4), OUT, 7) + sl('M' + r1(sx - 14) + ' ' + r1(sy - 44) + 'L' + r1(sx + 6) + ' ' + r1(sy + 4), '#3a2a22', 4.4) +
          sp('M' + r1(sx - 3) + ' ' + r1(sy - 4) + 'h20v20h-20Z', '#f1ece2', { w: 2.2, extra: ' transform="rotate(-22 ' + r1(sx + 7) + ' ' + r1(sy + 6) + ')"' }) + sp('M' + r1(sx - 18) + ' ' + r1(sy - 50) + 'l6 -2l2 8l-6 2Z', '#3a2a22', { w: 1.4 });
        S.add(zA - 0.005, o); return;
      }
      case 'kama': {
        var h0 = { x: x - 2, y: y + 12 }, h1 = { x: x + 2, y: y - 22 };
        o = sp(capsD(h0, h1, 2.6, 2.6), '#2a2226', { w: 1.8 }) + sp('M' + r1(h1.x - 1) + ' ' + r1(h1.y) + 'Q' + r1(h1.x + 18) + ' ' + r1(h1.y - 6) + ' ' + r1(h1.x + 22) + ' ' + r1(h1.y + 12) + 'Q' + r1(h1.x + 14) + ' ' + r1(h1.y + 2) + ' ' + r1(h1.x + 1) + ' ' + r1(h1.y + 5) + 'Z', '#d9dde3', { w: 1.8 });
        S.add(zA - 0.005, o); return;
      }
      case 'brush': {
        var b0 = { x: x - 6, y: y + 10 }, b1 = { x: x + 10, y: y - 14 };
        o = sp(capsD(b0, b1, 2.6, 2.6), '#8a5a36', { w: 1.8 }) + sp('M' + r1(b0.x - 4) + ' ' + r1(b0.y) + 'Q' + r1(b0.x - 8) + ' ' + r1(b0.y + 12) + ' ' + r1(b0.x - 12) + ' ' + r1(b0.y + 16) + 'Q' + r1(b0.x + 2) + ' ' + r1(b0.y + 12) + ' ' + r1(b0.x + 4) + ' ' + r1(b0.y + 2) + 'Z', '#f7f3ea', { w: 1.8 });
        S.add(zA - 0.005, o); return;
      }
      case 'pistol': {
        for (var s = -1; s <= 1; s += 2) {
          var Hs = c.cam.pv(c.R.arms[s].H), gx = Hs.x + s * 4, gy = Hs.y;
          var gun = sp('M' + r1(gx) + ' ' + r1(gy - 4) + 'L' + r1(gx + s * 22) + ' ' + r1(gy - 2) + 'L' + r1(gx + s * 22) + ' ' + r1(gy + 2) + 'L' + r1(gx + s * 6) + ' ' + r1(gy + 3) + 'Z', '#5a5c63', { w: 1.8 }) + sp('M' + r1(gx - s * 2) + ' ' + r1(gy - 2) + 'L' + r1(gx + s * 4) + ' ' + r1(gy - 3) + 'L' + r1(gx + s * 2) + ' ' + r1(gy + 10) + 'L' + r1(gx - s * 4) + ' ' + r1(gy + 9) + 'Z', '#7a4a2a', { w: 1.8 });
          S.add((c.cam.pv(c.R.arms[s].S).z < -4 ? Z.FARARM : Z.ARM) + 0.03, gun);
        }
        return;
      }
      case 'mallet': {
        var m0 = { x: x, y: y + 4 }, m1 = { x: x + 2, y: y - 16 };
        o = sp(capsD({ x: x, y: y + 10 }, m1, 2.4, 2.4), '#8a5a36', { w: 1.6 }) + sp('M' + r1(m1.x - 12) + ' ' + r1(m1.y - 6) + 'h24v11h-24Z', '#b07a4a', { w: 2 }) + sl('M' + r1(m1.x - 8) + ' ' + r1(m1.y - 6) + 'v11M' + r1(m1.x + 8) + ' ' + r1(m1.y - 6) + 'v11', dk('#b07a4a', 0.3), 1.2);
        S.add(zA - 0.005, o); return;
      }
      case 'pipe': {
        o = sl('M' + r1(x - 2) + ' ' + r1(y) + 'L' + r1(x + 18) + ' ' + r1(y - 20), OUT, 4.6) + sl('M' + r1(x - 2) + ' ' + r1(y) + 'L' + r1(x + 18) + ' ' + r1(y - 20), '#26232a', 2.4) + sp(ellD(x + 19, y - 21, 3, 2.4), '#d8a63a', { w: 1.4 }) + sp(ellD(x - 3, y + 1, 2.2, 2.2), '#d8a63a', { w: 1.2 });
        S.add(zA + 0.005, o); return;
      }
      case 'fuda1': { // 紙の式神（紫の炎）
        var fx = x + 4, fy = y - 22;
        o = sf('M' + r1(fx) + ' ' + r1(fy - 22) + 'Q' + r1(fx + 16) + ' ' + r1(fy - 6) + ' ' + r1(fx + 10) + ' ' + r1(fy + 12) + 'Q' + r1(fx) + ' ' + r1(fy + 18) + ' ' + r1(fx - 10) + ' ' + r1(fy + 12) + 'Q' + r1(fx - 16) + ' ' + r1(fy - 6) + ' ' + r1(fx) + ' ' + r1(fy - 22) + 'Z', '#9b4de0', { op: 0.75 }) +
          sp('M' + r1(fx - 5) + ' ' + r1(fy - 8) + 'a4 4 0 1 1 10 0l4 6l-4 2l1 12h-12l1 -12l-4 -2Z', '#f4a6d8', { w: 1.6 });
        S.add(zA + 0.005, o); return;
      }
      default: return;
    }
  }

  /* ---- 相棒 ---- */
  function drawCompanions(c) {
    var S = c.S, cam = c.cam, b = c.b;
    (c.def.companions || []).forEach(function (cp) {
      var kind = cp.kind, o = '', side = cp.side || -1;
      var z = Z.FRONT;
      var anchor = cam.pv(cp.at ? [cp.at[0], tallY(c, cp.at[1]), cp.at[2]] : [side * 64, b.headY - 8 * c.hs, 6]);
      var x = anchor.x, y = anchor.y;
      if (anchor.z < -10) z = Z.BACK - 2;
      if (kind === 'hawk') {
        var Hh = cam.pv(c.R.arms[cp.hand || -1].H);
        x = Hh.x - 2; y = Hh.y - 16;
        if (c.R.pose !== 'stand') { x = anchor.x; y = anchor.y; }
        o += sp('M' + r1(x - 10) + ' ' + r1(y + 12) + 'Q' + r1(x - 18) + ' ' + r1(y - 8) + ' ' + r1(x - 4) + ' ' + r1(y - 18) + 'Q' + r1(x + 10) + ' ' + r1(y - 12) + ' ' + r1(x + 8) + ' ' + r1(y + 6) + 'L' + r1(x + 2) + ' ' + r1(y + 20) + 'Z', '#8a5a32');
        o += sp('M' + r1(x - 6) + ' ' + r1(y - 4) + 'Q' + r1(x - 16) + ' ' + r1(y + 10) + ' ' + r1(x - 10) + ' ' + r1(y + 26) + 'L' + r1(x) + ' ' + r1(y + 12) + 'Z', '#6a4226', { w: 2 });
        o += sp(ellD(x - 3, y - 16, 8, 7.5), '#9a6a3e');
        o += sf(ellD(x - 6, y - 17, 2.6, 2.6), '#f5c518') + sf(ellD(x - 6, y - 17, 1.2, 1.2), '#1d1614');
        o += sp('M' + r1(x - 10) + ' ' + r1(y - 16) + 'l-7 3l6 2Z', '#e3b23c', { w: 1.4 });
        o += sl('M' + r1(x - 2) + ' ' + r1(y + 12) + 'l-2 5M' + r1(x + 2) + ' ' + r1(y + 12) + 'l1 5', '#e3b23c', 2);
        z = Z.ARM + 0.5;
      } else if (kind === 'snake') {
        var nk = [];
        for (var i = 0; i <= 12; i++) { var a = (i / 12) * Math.PI * 1.15 + Math.PI * 0.95; nk.push(cam.p(Math.sin(a) * (b.srx + 4), b.sy + 2 + Math.sin(i / 12 * Math.PI) * 4, Math.cos(a) * (b.srz + 6))); }
        var neckD = smoothD(brushPts(nk, interp([13, 14, 14, 13], nk.length)), true, 0.9);
        S.add(Z.OVER + 3, sp(neckD, cp.color || '#f1efe9'));
        var sc = S.clip(neckD); var scl = ''; nk.forEach(function (p, j) { if (j % 2) scl += 'M' + r1(p.x - 4) + ' ' + r1(p.y - 3) + 'l4 3l4 -3'; });
        S.add(Z.OVER + 3.01, sl(scl, '#c9c6bf', 1.2, { clip: sc }));
        var hp = cam.pv([-(b.srx + 18), b.sy + 22, 10]);
        o += sp('M' + r1(hp.x + 8) + ' ' + r1(hp.y + 12) + 'Q' + r1(hp.x - 2) + ' ' + r1(hp.y + 6) + ' ' + r1(hp.x - 10) + ' ' + r1(hp.y - 2) + 'Q' + r1(hp.x - 12) + ' ' + r1(hp.y - 12) + ' ' + r1(hp.x) + ' ' + r1(hp.y - 12) + 'Q' + r1(hp.x + 12) + ' ' + r1(hp.y - 8) + ' ' + r1(hp.x + 12) + ' ' + r1(hp.y + 4) + 'Z', cp.color || '#f1efe9');
        o += sf(ellD(hp.x - 4, hp.y - 6, 2.4, 2.8), '#c8202c') + sl('M' + r1(hp.x - 11) + ' ' + r1(hp.y) + 'l-5 1l-2 -2M' + r1(hp.x - 16) + ' ' + r1(hp.y + 1) + 'l-2 2', '#c8202c', 1.4);
        var tp = cam.pv([(b.srx + 8), b.obi[0] - 4, 8]), tp2 = cam.pv([(b.srx + 12), 18, 6]);
        S.add(Z.ARM + 0.4, sp(capsD(tp, tp2, 6, 2.5), cp.color || '#f1efe9'));
        z = Z.OVER + 3.1;
      } else if (kind === 'ghost') {
        o += sp('M' + r1(x - 13) + ' ' + r1(y + 2) + 'Q' + r1(x - 14) + ' ' + r1(y - 18) + ' ' + r1(x) + ' ' + r1(y - 18) + 'Q' + r1(x + 14) + ' ' + r1(y - 18) + ' ' + r1(x + 13) + ' ' + r1(y + 2) + 'Q' + r1(x + 10) + ' ' + r1(y + 14) + ' ' + r1(x + 2) + ' ' + r1(y + 18) + 'Q' + r1(x + 10) + ' ' + r1(y + 26) + ' ' + r1(x + 2) + ' ' + r1(y + 30) + 'Q' + r1(x - 6) + ' ' + r1(y + 22) + ' ' + r1(x - 4) + ' ' + r1(y + 14) + 'Q' + r1(x - 12) + ' ' + r1(y + 10) + ' ' + r1(x - 13) + ' ' + r1(y + 2) + 'Z', cp.color || '#bfe6f2');
        o += sp('M' + r1(x - 9) + ' ' + r1(y - 13) + 'L' + r1(x) + ' ' + r1(y - 24) + 'L' + r1(x + 9) + ' ' + r1(y - 13) + 'Z', '#ffffff', { w: 1.8 });
        o += sl('M' + r1(x - 7) + ' ' + r1(y - 4) + 'l4 0M' + r1(x + 3) + ' ' + r1(y - 4) + 'l4 0', '#3a7a4a', 2.4) + sl('M' + r1(x - 3) + ' ' + r1(y + 3) + 'q3 2 6 0', OUT, 1.6);
      } else if (kind === 'wisps') {
        for (var s = -1; s <= 1; s += 2) {
          var wx = 100 + s * 70, wy = scrY(c, cp.y || 110 + s * 14);
          o += sf('M' + r1(wx) + ' ' + r1(wy - 26) + 'Q' + r1(wx + 12) + ' ' + r1(wy - 6) + ' ' + r1(wx + 9) + ' ' + r1(wy + 6) + 'Q' + r1(wx) + ' ' + r1(wy + 14) + ' ' + r1(wx - 9) + ' ' + r1(wy + 6) + 'Q' + r1(wx - 11) + ' ' + r1(wy - 8) + ' ' + r1(wx) + ' ' + r1(wy - 26) + 'Z', cp.color || '#8fe0ff', { op: 0.8 }) + sf(ellD(wx, wy + 2, 5, 7), '#ffffff', { op: 0.9 });
        }
      } else if (kind === 'imp') {
        var sp2 = cam.pv([b.srx + 6, b.sy + 16, 4]); x = sp2.x + 4; y = sp2.y - 10;
        o += sp(ellD(x, y + 10, 10, 9), cp.color || '#6fbf4a');
        o += sp('M' + r1(x - 12) + ' ' + r1(y - 4) + 'l-6 -12l10 6Z', '#e98a2a', { w: 1.4 }) + sp('M' + r1(x + 12) + ' ' + r1(y - 4) + 'l6 -12l-10 6Z', '#e98a2a', { w: 1.4 });
        o += sp(ellD(x, y - 2, 14, 12), cp.color || '#6fbf4a');
        o += sp(ellD(x - 5, y - 3, 3.4, 3.4), '#ffffff', { w: 1.2 }) + sp(ellD(x + 5, y - 3, 3.4, 3.4), '#ffffff', { w: 1.2 }) + sf(ellD(x - 5, y - 3, 1.6, 1.8), '#7a3ea6') + sf(ellD(x + 5, y - 3, 1.6, 1.8), '#7a3ea6');
        o += sp('M' + r1(x - 6) + ' ' + r1(y + 4) + 'L' + r1(x + 6) + ' ' + r1(y + 4) + 'L' + r1(x + 3) + ' ' + r1(y + 7) + 'L' + r1(x) + ' ' + r1(y + 4.5) + 'L' + r1(x - 3) + ' ' + r1(y + 7) + 'Z', '#ffffff', { w: 1.2 });
        z = Z.HEAD - 1;
      } else if (kind === 'chick') {
        o += sp(ellD(x, y, 12, 11), '#f5ce1c') + sp('M' + r1(x - 10) + ' ' + r1(y - 6) + 'h20v5h-20Z', '#26232a', { w: 1.2 }) + sf(ellD(x - 4, y + 1, 1.6, 2), EYE_DARK) + sf(ellD(x + 4, y + 1, 1.6, 2), EYE_DARK) + sp('M' + r1(x - 3) + ' ' + r1(y + 4) + 'l3 3l3 -3Z', '#f39a2a', { w: 1 });
      } else if (kind === 'bunny') {
        o += sp(ellD(x - 5, y - 16, 3.5, 9), '#f7a8c4') + sp(ellD(x + 5, y - 16, 3.5, 9), '#f7a8c4') + sp('M' + r1(x - 11) + ' ' + r1(y + 10) + 'Q' + r1(x - 13) + ' ' + r1(y - 10) + ' ' + r1(x) + ' ' + r1(y - 10) + 'Q' + r1(x + 13) + ' ' + r1(y - 10) + ' ' + r1(x + 11) + ' ' + r1(y + 10) + 'L' + r1(x + 5) + ' ' + r1(y + 6) + 'L' + r1(x) + ' ' + r1(y + 11) + 'L' + r1(x - 5) + ' ' + r1(y + 6) + 'Z', '#f7a8c4') +
          sp('M' + r1(x - 11) + ' ' + r1(y - 6) + 'h22v5h-22Z', '#4f9a4a', { w: 1.2 }) + sf(ellD(x - 4, y + 2, 1.5, 1.8), EYE_DARK) + sf(ellD(x + 4, y + 2, 1.5, 1.8), EYE_DARK);
      } else if (kind === 'rainbow') {
        var cols = ['#e8423a', '#f59a2a', '#f5d02a', '#4fb34a', '#3a9ad8', '#7a4fc4'];
        var sd = cp.side || 1;
        var ry0 = scrY(c, 150);
        var arcPts = function (r) { var pp = []; for (var q = 0; q <= 16; q++) { var an = Math.PI * (0.15 + q / 16 * 1.25); pp.push({ x: 100 + sd * (40 + Math.cos(an) * r * 0.9), y: ry0 + Math.sin(an) * r * 0.55 }); } return pp; };
        cols.forEach(function (cc, ci) { o += sl(smoothD(arcPts(48 - ci * 4), false), cc, 5); });
        z = cp.front ? Z.FRONT : Z.BACK - 3;
      } else if (kind === 'splash') {
        var colsS = ['#e8423a', '#f59a2a', '#f5d02a', '#4fb34a', '#3a9ad8', '#9b4de0'];
        for (var sI = 0; sI < 6; sI++) {
          var ax = 100 + (sI - 2.5) * 22, ay = scrY(c, 176) - Math.abs(sI - 2.5) * 6;
          o += sf('M' + r1(ax - 10) + ' ' + r1(ay) + 'Q' + r1(ax) + ' ' + r1(ay - 16) + ' ' + r1(ax + 14) + ' ' + r1(ay - 6) + 'Q' + r1(ax + 4) + ' ' + r1(ay + 6) + ' ' + r1(ax - 10) + ' ' + r1(ay) + 'Z', colsS[sI], { op: 0.95 });
        }
        z = Z.ARM + 0.3;
      }
      S.add(z, o);
    });
  }

  function drawFx(c, fx) {
    var o = '';
    if (fx === 'joy') o = sl('M40 60l-8 -6M36 74l-10 0M44 48l-4 -9', '#f5a623', 3.4) + sl('M162 58l9 -7M166 72l10 -1M156 46l5 -9', '#f5a623', 3.4);
    if (fx === 'surprise') o = sp('M156 20l6 0l-2 30l-3 0Z', '#e8423a', { w: 1.6 }) + sp(ellD(159.5, 57, 3, 3), '#e8423a', { w: 1.6 }) + sp('M170 26l6 1l-5 28l-3 -1Z', '#e8423a', { w: 1.6 }) + sp(ellD(170, 61, 3, 3), '#e8423a', { w: 1.6 });
    if (fx === 'focus') o = sl('M34 40l6 8M166 40l-6 8', '#6a8ab8', 2.4, { op: 0.8 });
    if (fx === 'note') o = sp('M160 36v-20l14 -4v20', 'none', { w: 2.6 }) + sp(ellD(157, 37, 4.5, 3.5), OUT) + sp(ellD(171, 33, 4.5, 3.5), OUT);
    if (!o) return;
    if (c.tall) o = '<g transform="translate(' + r1(100 * (1 - c.hs)) + ' ' + r1(scrY(c, 87) - 87 * c.hs) + ') scale(' + c.hs + ')">' + o + '</g>'; // 頭と一緒に動かす
    c.S.add(Z.FRONT + 5, o);
  }

  /* ---------------- 公開 ---------------- */
  var NinjaArt = {
    render: render,
    VIEWS: { front: 0, quarter: -38, side: -90, back: 180, walkR: 52, walkL: -52, backR: 128, backL: -128 },
    util: { mix: mix, dk: dk, lt: lt, lum: lum, ellD: ellD, smoothD: smoothD, polyD: polyD, sp: sp, sl: sl, sf: sf, sakuraSvg: sakuraSvg, starSvg: starSvg, sparkle: sparkle, heartSvg: heartSvg, txt: txt, OUT: OUT }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NinjaArt;
  root.NinjaArt = NinjaArt;
})(typeof window !== 'undefined' ? window : globalThis);
