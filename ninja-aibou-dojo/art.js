/* CryptoNinja ファンゲーム共通 — キャラクター描画エンジン（SVG）
 * ニンジャ相棒道場・ニンジャ里ライフ・ニンジャからくり工房の3作で同じファイルを使う（どれかを直したら、3つとも同じにする）。
 * ninja-sato-life/art.js（ちびキャラ）をもとに、相棒道場の修行の動き（attack / rescue / search / retreat / down / cheer）・
 * へとへとの表情（tired）・効果と、からくり工房の横スクロールのうごき（run / jump / fall / oops / land・guard。走る・跳ぶときは体ごと前へ傾ける）を足したもの。
 *
 * 39体を「向き（yaw）・しぐさ（pose）・表情（expr）」を指定して描く。絵柄は3つ：
 *   official（既定）… 公式イラスト（CryptoNinja・CC0）に忠実な絵柄。約2.7頭身・丸い大きな頭・低い位置の大きな目・
 *                      箱形の着物と短く広い袖・手甲・結び目のある帯。キャラ定義の off で公式だけの見た目を上書きできる
 *   cool        … かっこいい系。約5頭身・ひざのある脚・くびれた胴・首・あごの細い顔・切れ長の目
 *   cute        … かわいい系のちびキャラ（2頭身。ninja-sato-life と同じ描き方）
 *   render(def, { style: 'cute' }) か NinjaArt.style = 'cute' で切りかえる。
 * 頭は楕円体、胴は円錐台（cool は胸・腰・裾の輪切りをつないだ形）として3D空間に置き、少し見下ろすカメラで投影するので、
 * まえ・ななめ・よこ・うしろ・歩きの向きでパーツ（鉢金・髪・刀・尻尾）の位置が矛盾しない。
 * cool・official の頭は、ちびキャラと同じ大きさ（半径50）で描いてから縮めて首の上に置く（髪・面・耳の定義をそのまま使える）。
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
  var LWK = 1;
  var VISN = false;         // official：胴の向き（Trunk.vis）を正規化して使う（模様・紋・鋲が正面で見える）              // 線の太さの倍率（cool は細め。頭・小道具は縮める分だけ太くしておく）

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
  function bz2(a, b, c2, d, t) { var u = 1 - t; return { x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c2.x + t * t * t * d.x, y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c2.y + t * t * t * d.y }; }
  function bez3(p0, p1, p2, p3, n) { // 3D ベジェを n 点に
    var o = []; for (var i = 0; i < n; i++) {
      var t = i / (n - 1), a = (1 - t) * (1 - t) * (1 - t), b = 3 * (1 - t) * (1 - t) * t, c = 3 * (1 - t) * t * t, d = t * t * t;
      o.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]]);
    } return o;
  }

  /* ---------------- SVG 部品 ---------------- */
  function lw(w) { return LWK === 1 ? w : Math.round(w * LWK * 100) / 100; }
  function sp(d, fill, o) { // 塗り＋輪郭
    o = o || {};
    return '<path d="' + d + '" fill="' + fill + '"' + (o.op != null ? ' opacity="' + o.op + '"' : '') +
      (o.noStroke ? '' : ' stroke="' + (o.sc || OUT) + '" stroke-width="' + lw(o.w || LW) + '" stroke-linejoin="round" stroke-linecap="round"') +
      (o.clip ? ' clip-path="url(#' + o.clip + ')"' : '') + (o.extra || '') + '/>';
  }
  function sl(d, col, w, o) { // 線だけ
    o = o || {};
    return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + lw(w || 2) + '" stroke-linecap="round" stroke-linejoin="round"' +
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
  }
  Cam.prototype.p = function (x, y, z) {
    var xr = x * this.cyw + z * this.syw, zr = -x * this.syw + z * this.cyw;
    return { x: this.ox + xr, y: this.oy - (y * this.cp - zr * this.sp), d: zr * this.cp + y * this.sp, z: zr };
  };
  Cam.prototype.pv = function (v) { return this.p(v[0], v[1], v[2]); };
  Cam.prototype.nd = function (nx, ny, nz) { var zr = -nx * this.syw + nz * this.cyw; return zr * this.cp + ny * this.sp; };
  Cam.prototype.ex = function (rx, rz) { return Math.sqrt(Math.pow(rx * this.cyw, 2) + Math.pow(rz * this.syw, 2)); }; // 楕円体の見かけの横半径

  /* ---------------- 頭（楕円体） ---------------- */
  function Head(h, cam, jaw) {
    this.h = h; this.cam = cam; this.k = h.rx / 50; this.jaw = jaw || null;
    var c = cam.p(h.x, h.y, h.z); this.cx = c.x; this.cy = c.y; this.cd = c.z;
    this.ry2 = Math.sqrt(Math.pow(h.ry * cam.cp, 2) + Math.pow(h.rz * cam.sp, 2));
  }
  Head.prototype.pt3 = function (th, ph, dr) {
    var t = th * D2R, f = ph * D2R, h = this.h; dr = dr || 0;
    var x = (h.rx + dr) * Math.sin(t) * Math.cos(f), y = (h.ry + dr) * Math.sin(f), z = (h.rz + dr) * Math.cos(t) * Math.cos(f);
    var j = this.jaw, u = -Math.sin(f);
    if (j && u > 0) { // cool：顔の下半分を細く・長く・前へ（とがったあご）
      x *= 1 - j.x * Math.pow(u, j.p);
      y *= 1 + j.y * u * u;
      z += j.z * h.rz * u * u * (0.5 + 0.5 * Math.cos(t));
    }
    return [h.x + x, h.y + y, h.z + z];
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
  Head.prototype.capPts = function (lineFn, vol, edge, rough, flare, roughTop) {
    var yaw = this.cam.yaw, tL = -90 - yaw, tR = 90 - yaw, pts = [], th, ph, i = 0, rTop = roughTop || 84;
    for (th = tL; th <= tR + 0.01; th += 2) pts.push(this.p(th, lineFn(wrap(th)), edge || 0));
    var phR = lineFn(wrap(tR)), phL = lineFn(wrap(tL));
    var rv = function (ph, base) { // 毛束の先（ゆっくり張り出して、すっと戻る）
      if (!rough) return 0;
      var u = (ph + 400) / 19, f = u - Math.floor(u), saw = f < 0.78 ? f / 0.78 : (1 - f) / 0.22;
      return rough * saw * saw * sstep(base, base + 10, ph) * (1 - sstep(rTop - 22, rTop, ph));
    };
    var vf = function (ph, base) { return flare == null ? vol * sstep(base, base + 22, ph) : vol + flare * (1 - sstep(base, base + 30, ph)); }; // flare：おかっぱの裾（細らずに外へはねる）
    for (ph = phR; ph <= 90; ph += rough ? 2 : 3) pts.push(this.p(tR, ph, vf(ph, phR) + rv(ph, phR)));
    for (ph = 90; ph >= phL; ph -= rough ? 2 : 3) pts.push(this.p(tL, ph, vf(ph, phL) + rv(ph + 6.5, phL)));
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
  Head.prototype.silD = function (grow) {
    grow = grow || 0;
    if (!this.jaw) return ellD(this.cx, this.cy, this.h.rx + grow, this.ry2 + grow);
    if (this._sil == null || this._silG !== grow) { // あごのある頭：表面の点を投影した凸包
      var pts = [];
      for (var ph = -90; ph <= 90; ph += 7.5) for (var th = 0; th < 360; th += 7.5) pts.push(this.p(th, ph, grow));
      this._sil = smoothD(hull(pts), true, 0.5); this._silG = grow;
    }
    return this._sil;
  };

  /* ---------------- 胴（円錐台） ---------------- */
  // o.prof があれば [y, rx, rz] の輪切り（上から順）を線でつないだ形（cool の胸・腰・裾）
  function Trunk(cam, o) { this.cam = cam; this.o = o; }
  Trunk.prototype.rad = function (y) {
    var o = this.o, pf = o.prof;
    if (pf) {
      if (y >= pf[0][0]) return [pf[0][1], pf[0][2]];
      for (var i = 1; i < pf.length; i++) if (y >= pf[i][0]) { var t = (y - pf[i - 1][0]) / (pf[i][0] - pf[i - 1][0]); return [lerp(pf[i - 1][1], pf[i][1], t), lerp(pf[i - 1][2], pf[i][2], t)]; }
      var L = pf[pf.length - 1]; return [L[1], L[2]];
    }
    var v = clamp((y - o.y0) / (o.y1 - o.y0), -0.2, 1.2); return [lerp(o.rx0, o.rx1, v), lerp(o.rz0, o.rz1, v)];
  };
  Trunk.prototype.pt3 = function (th, y, dr) {
    var r = this.rad(y), t = th * D2R, o = this.o; dr = dr || 0;
    return [o.x + (r[0] + dr) * Math.sin(t), y, o.z + (r[1] + dr) * Math.cos(t)];
  };
  Trunk.prototype.p = function (th, y, dr) { return this.cam.pv(this.pt3(th, y, dr)); };
  Trunk.prototype.vis = function (th, y) {
    var r = this.rad(y), t = th * D2R, nx = Math.sin(t) / r[0], nz = Math.cos(t) / r[1];
    if (VISN) { var l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; }
    return this.cam.nd(nx, 0, nz);
  };
  Trunk.prototype.front = function () { // 最もカメラを向く θ
    var o = this.o, rx = (o.rx0 + o.rx1) / 2, rz = (o.rz0 + o.rz1) / 2;
    return Math.atan2(-this.cam.syw / rx, this.cam.cyw / rz) / D2R;
  };
  Trunk.prototype.silPts = function (extraYs) {
    var o = this.o, pts = [], ys = [o.y0, o.y1].concat(extraYs || []);
    if (o.prof) return this.silProf();
    for (var j = 0; j < ys.length; j++) for (var i = 0; i < 40; i++) pts.push(this.p(i * 9, ys[j], 0));
    return hull(pts);
  };
  // くびれのある形の輪郭：上の輪切りの奥半分 → 左の縁 → 下の輪切りの手前半分 → 右の縁
  Trunk.prototype.silProf = function () {
    var o = this.o, self = this, ys = [], i, j;
    var pf = o.prof.slice(); pf[0] = [o.y0, pf[0][1], pf[0][2]];
    for (i = 0; i < pf.length - 1; i++) { var a = pf[i][0], b2 = Math.max(o.y1, pf[i + 1][0]); if (a <= o.y1) break; for (j = 0; j < 4; j++) ys.push(lerp(a, b2, j / 4)); }
    ys.push(o.y1);
    function ring(y) { var r = []; for (var k = 0; k < 72; k++) r.push(self.p(k * 5, y, 0)); return r; }
    function ext(r) { var mn = r[0], mx = r[0]; r.forEach(function (p) { if (p.x < mn.x) mn = p; if (p.x > mx.x) mx = p; }); return [mn, mx]; }
    var top = ring(ys[0]), bot = ring(ys[ys.length - 1]);
    var back = top.filter(function (p) { return p.z <= 0; }).sort(function (p, q) { return q.x - p.x; });
    var frontB = bot.filter(function (p) { return p.z >= 0; }).sort(function (p, q) { return p.x - q.x; });
    var left = [], right = [];
    ys.forEach(function (y) { var e = ext(ring(y)); left.push(e[0]); right.push(e[1]); });
    return back.concat(left, frontB, right.reverse());
  };
  // 見えている範囲で θ を sample（面上の模様用）
  Trunk.prototype.arc = function (y, dr, t0, t1, step) {
    var pts = []; step = step || 4;
    for (var th = t0; th <= t1 + 0.01; th += step) pts.push(this.p(th, y, dr));
    return pts;
  };

  // 輪切りの表 [y, rx, rz] から高さ y の半径（いちばん下より下は少しずつ広げる）
  function profAt(pf, y) {
    if (y >= pf[0][0]) return [pf[0][1], pf[0][2]];
    for (var i = 1; i < pf.length; i++) if (y >= pf[i][0]) { var t = (y - pf[i - 1][0]) / (pf[i][0] - pf[i - 1][0]); return [lerp(pf[i - 1][1], pf[i][1], t), lerp(pf[i - 1][2], pf[i][2], t)]; }
    var L = pf[pf.length - 1], d = L[0] - y; return [L[1] + d * 0.1, L[2] + d * 0.05];
  }

  /* ---------------- ポーズ（関節の位置） ---------------- */
  var BUILDS = {
    normal: { hr: 50, headY: 146, sy: 97, sx: 23, hem: 40, srx: 25, srz: 16, hrx: 33, hrz: 21, hip: 10, legW: 17, armW: 9.5, hand: 6.8, obi: [56, 67] },
    small: { hr: 50, headY: 140, sy: 91, sx: 21, hem: 38, srx: 23, srz: 15, hrx: 31, hrz: 20, hip: 9.5, legW: 16, armW: 9, hand: 6.6, obi: [53, 63] },
    big: { hr: 48, headY: 152, sy: 104, sx: 33, hem: 42, srx: 36, srz: 22, hrx: 34, hrz: 22, hip: 13, legW: 21, armW: 14, hand: 9.5, obi: [48, 60] },
    chick: { hr: 56, headY: 116, sy: 72, sx: 26, hem: 30, srx: 28, srz: 22, hrx: 32, hrz: 24, hip: 10, legW: 7, armW: 8, hand: 7, obi: [40, 50] }
  };

  function rig(def, pose, frame) {
    var b = BUILDS[def.build || 'normal'];
    var R = { b: b, bob: 0, arms: {}, legs: {}, lean: 0 };
    var s, sy = b.sy;
    for (var k = 0; k < 2; k++) {
      s = k ? 1 : -1;
      R.arms[s] = { S: [s * b.sx, sy - 5, 0], E: [s * (b.sx + 10), sy - 25, 0], H: [s * (b.sx + 17), sy - 43, 5], hand: 'open' };
      R.legs[s] = { hip: [s * b.hip, b.hem + 8, 0], A: [s * (b.hip + 2.5), 10, 1] };
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
      R.legs[-1].A = [-(b.hip + 6), 10, 2]; R.legs[1].A = [b.hip + 6, 10, 2];
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
        R.legs[s].A = [s * (b.hip + 1.5), 10 + lift * 6, 1 + sw * 13];
        R.arms[s].H = [s * (b.sx + 14), sy - 42, 5 - sw * 13];
        R.arms[s].E = [s * (b.sx + 9), sy - 24, 1 - sw * 6];
      }
      R.bob = 1.6 * Math.abs(Math.cos(ph));
    } else if (pose === 'hold') {
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 7), sy - 24, 12]; R.arms[s].H = [s * 10, sy - 22, 27]; R.arms[s].hand = 'open'; }
      R.hold = true;
    } else if (pose === 'fists') {
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 8), sy - 24, 10]; R.arms[s].H = [s * 12, sy - 26, 22]; R.arms[s].hand = 'fist'; }
    } else if (pose === 'attack') { // 相棒道場：攻撃（frame 0 = ためる／1 = 打ちこむ）。頭に隠れないよう胸より下で振る
      if (frame === 0) {
        Rt.E = [b.sx + 12, sy - 18, -8]; Rt.H = [b.sx + 14, sy - 34, -20]; Rt.hand = 'fist';
        L.E = [-(b.sx + 4), sy - 16, 14]; L.H = [-10, sy - 26, 30]; L.hand = 'open';
        R.legs[1].A = [b.hip + 3, 10, -8]; R.legs[-1].A = [-(b.hip + 3), 10, 9];
      } else {
        Rt.E = [b.sx + 6, sy - 12, 18]; Rt.H = [b.sx - 4, sy - 18, 40]; Rt.hand = 'fist';
        L.E = [-(b.sx + 8), sy - 20, -8]; L.H = [-(b.sx + 12), sy - 36, -18]; L.hand = 'fist';
        R.legs[1].A = [b.hip + 3, 10, 15]; R.legs[-1].A = [-(b.hip + 3), 11, -13]; R.bob = 2;
      }
    } else if (pose === 'rescue') { // 相棒道場：救助（少しかがんで両手を前へさしのべる）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 5), sy - 14, 16]; R.arms[s].H = [s * 13, sy - 24, 34]; R.arms[s].hand = 'open'; }
      R.legs[-1].A = [-(b.hip + 8), 14, -4]; R.legs[1].A = [b.hip + 8, 14, 6]; R.bob = -6;
    } else if (pose === 'search') { // 相棒道場：調べる（かがんで手元をのぞきこむ）
      Rt.E = [b.sx + 8, sy - 22, 12]; Rt.H = [b.sx - 4, sy - 36, 30]; Rt.hand = 'point';
      L.E = [-(b.sx + 6), sy - 22, 6]; L.H = [-(b.sx + 4), sy - 40, 14]; L.hand = 'open';
      R.legs[-1].A = [-(b.hip + 7), 13, -2]; R.legs[1].A = [b.hip + 7, 13, 4]; R.bob = -4;
    } else if (pose === 'retreat') { // 相棒道場：下がる（両手を上げて後ろへ跳ぶ）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 11), sy - 8, -6]; R.arms[s].H = [s * (b.sx + 19), sy + 6, -10]; R.arms[s].hand = 'open'; }
      R.legs[1].A = [b.hip + 3, 18, -14]; R.legs[-1].A = [-(b.hip + 3), 22, 8]; R.bob = 9;
    } else if (pose === 'down') { // 相棒道場：へとへと（地面にぺたんと座る）
      var dn = b.hem + 8 - 12;
      R.bob = -dn;
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.legs[s].A = [s * (b.hip + 5), dn + 7, 24]; R.arms[s].E = [s * (b.sx + 11), sy - 22, 2]; R.arms[s].H = [s * (b.sx + 16), sy - 40, 10]; R.arms[s].hand = 'open'; }
    } else if (pose === 'cheer') { // 相棒道場：わーい（両手を上げてとびはねる）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 14), sy + 6, 4]; R.arms[s].H = [s * (b.sx + 27), sy + 24, 4]; R.arms[s].hand = 'open'; }
      R.legs[-1].A = [-(b.hip + 4), 14, 2]; R.legs[1].A = [b.hip + 4, 14, 2]; R.bob = 7;
    } else if (pose === 'guard') { // からくり工房：びっくり（両こぶしを胸の前に、足を開いて身がまえる）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 10), sy - 22, 8]; R.arms[s].H = [s * 13, sy - 8, 26]; R.arms[s].hand = 'fist'; }
      R.legs[-1].A = [-(b.hip + 9), 9, 3]; R.legs[1].A = [b.hip + 9, 9, 3];
      R.bob = 2; R.tilt = -3;
    } else if (pose === 'run') { // からくり工房：走る（6コマ）
      var rp = (frame || 0) * Math.PI / 3;
      for (k = 0; k < 2; k++) {
        s = k ? 1 : -1;
        var rsw = Math.sin(rp + (s > 0 ? 0 : Math.PI)), rlift = Math.max(0, Math.cos(rp + (s > 0 ? 0 : Math.PI)));
        R.legs[s].A = [s * (b.hip + 1), 10 + rlift * 14, 2 + rsw * 20];
        R.arms[s].E = [s * (b.sx + 8), sy - 20, 2 - rsw * 12];
        R.arms[s].H = [s * (b.sx + 9), sy - 34, 8 - rsw * 22];
        R.arms[s].hand = 'fist';
      }
      R.bob = 3 + 3 * Math.abs(Math.sin(rp)); R.tilt = 7;
    } else if (pose === 'jump') { // からくり工房：跳ぶ（両腕を上げ、片ひざを上げる）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 16), sy + 2, 4]; R.arms[s].H = [s * (b.sx + 30), sy + 22, 6]; R.arms[s].hand = 'open'; }
      R.legs[1].A = [b.hip + 2, 30, 16]; R.legs[-1].A = [-(b.hip + 2), 14, -8];
      R.bob = 10; R.tilt = 5;
    } else if (pose === 'fall') { // からくり工房：落ちる（腕を横に広げ、脚をそろえてぶらり）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 16), sy - 4, 2]; R.arms[s].H = [s * (b.sx + 30), sy + 6, 4]; R.arms[s].hand = 'open'; }
      R.legs[1].A = [b.hip + 5, 14, 6]; R.legs[-1].A = [-(b.hip + 5), 12, -4];
      R.bob = 8;
    } else if (pose === 'oops') { // からくり工房：落ちた・当たった（ばんざいでびっくり）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 18), sy + 8, 2]; R.arms[s].H = [s * (b.sx + 32), sy + 30, 4]; R.arms[s].hand = 'open'; }
      R.legs[1].A = [b.hip + 8, 16, 4]; R.legs[-1].A = [-(b.hip + 8), 20, -2];
      R.bob = 6; R.tilt = -6;
    } else if (pose === 'land') { // からくり工房：着地（ひざを少し曲げる）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; R.arms[s].E = [s * (b.sx + 12), sy - 18, 6]; R.arms[s].H = [s * (b.sx + 20), sy - 30, 10]; R.arms[s].hand = 'open'; }
      R.legs[-1].A = [-(b.hip + 6), 9, 2]; R.legs[1].A = [b.hip + 6, 9, 2];
      R.bob = -3;
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

  /* ---------------- cool（かっこいい系）の体格とポーズ ---------------- */
  // hs：頭の縮め方（頭は半径50で描いて hs 倍）。prof：胴の輪切り [y, 横半径, 奥行き半径]（肩・胸・腰・裾）
  // lt / ls：ももとすねの長さ。upper：袖（上腕）の太さ。u：飾りの大きさの目安（ちびキャラ比）
  var COOL_LW = 0.74;
  var COOL_BUILDS = {
    normal: { hs: 0.37, hr: 50, headY: 186, neck: 4.3, sy: 158, sx: 16.5, hem: 84, srx: 19, srz: 11.5, hrx: 17.6, hrz: 12.6,
      prof: [[159, 12.5, 9], [153.5, 19.2, 11.6], [145, 18.4, 12.4], [116, 13.8, 10.2], [84, 17.6, 12.6]],
      hip: 7.6, legTop: 98, thigh: [14.2, 10.2], shin: [10.2, 6.6], lt: 45.5, ls: 46,
      upper: 7.6, armW: 6.8, hand: 4.4, obi: [108, 119], foot: [5.4, 11, 3.6], u: 0.74 },
    small: { hs: 0.37, hr: 50, headY: 172, neck: 4, sy: 145, sx: 15.5, hem: 78, srx: 17.5, srz: 10.6, hrx: 16.2, hrz: 11.6,
      prof: [[146, 11.6, 8.4], [141, 17.6, 10.7], [133, 16.9, 11.3], [107, 13, 9.6], [78, 16.2, 11.6]],
      hip: 7.2, legTop: 91, thigh: [13.2, 9.6], shin: [9.4, 6.2], lt: 42, ls: 42.6,
      upper: 7, armW: 6.4, hand: 4.1, obi: [100, 110], foot: [5, 10.2, 3.4], u: 0.7 },
    big: { hs: 0.35, hr: 50, headY: 191, neck: 7, sy: 162, sx: 23, hem: 86, srx: 26.5, srz: 15.5, hrx: 21, hrz: 14.6,
      prof: [[163, 17, 12], [157, 27, 15.8], [148, 26.4, 16.8], [118, 19.5, 13.6], [86, 21, 14.6]],
      hip: 10.4, legTop: 99, thigh: [19, 14.4], shin: [14.4, 10], lt: 46, ls: 46.5,
      upper: 12, armW: 11, hand: 6.6, obi: [109, 121], foot: [6.8, 12.4, 4.4], u: 0.9 }
  };
  // ちびキャラの高さ（キャラ定義に書いてある y）を cool の体の高さへ
  var YMAP = [[0, 0], [10, 7], [40, 84], [48, 98], [56, 108], [67, 119], [97, 158], [146, 186], [200, 214]];
  function ymapB(b, y) {
    var M = b.ymap || YMAP;
    for (var i = 1; i < M.length; i++) if (y <= M[i][0]) { var a = M[i - 1], q = M[i]; return lerp(a[1], q[1], (y - a[0]) / (q[0] - a[0])); }
    return M[M.length - 1][1] + (y - M[M.length - 1][0]);
  }
  // ひざ：もも（lt）とすね（ls）の長さを保って前に曲げる
  function kneeIK(P, A, lt, ls) {
    var dx = A[0] - P[0], dy = A[1] - P[1], dz = A[2] - P[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var ux = dx / d, uy = dy / d, uz = dz / d;
    if (d >= lt + ls - 0.05) { var t = lt / (lt + ls); return [P[0] + dx * t, P[1] + dy * t, P[2] + dz * t]; }
    var a = (lt * lt - ls * ls + d * d) / (2 * d), h = Math.sqrt(Math.max(0, lt * lt - a * a));
    var fx = -ux * uz, fy = -uy * uz, fz = 1 - uz * uz, fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (fl < 1e-3) { fx = 0; fy = 1; fz = 0; fl = 1; }
    return [P[0] + ux * a + fx / fl * h, P[1] + uy * a + fy / fl * h, P[2] + uz * a + fz / fl * h];
  }
  function rigCool(def, pose, frame, BLD, raw) {
    var bn = BLD[def.build] ? def.build : 'normal';
    if (BLD === COOL_BUILDS && def.build === 'chick') bn = 'normal';
    var b = BLD[bn];
    var R = { b: b, bob: 0, arms: {}, legs: {}, lean: 0, cool: true };
    var sy = b.sy, sx = b.sx, hp = b.hip, k, s;
    function arm(side, E, H, hand) { R.arms[side] = { S: [side * sx, sy - 4, 0], E: E, H: H, hand: hand || 'open' }; }
    function leg(side, A, K) { R.legs[side] = { hip: [side * hp, b.legTop, 0], A: A, K: K || null }; } // A・K は地面からの高さ
    // 立ち：小道具を持つ手は下ろし、もう片方の手は腰に。少し重心を右足に
    var ph0 = def.prop ? (def.prop.hand || -1) : -1, hipSide = def.prop && def.prop.kind === 'pistol' ? 0 : -ph0;
    for (k = 0; k < 2; k++) {
      s = k ? 1 : -1;
      if (s === hipSide) arm(s, [s * (sx + 11), sy - 26, -6], [s * (sx + 2.5), sy - 43, 5], 'fist');
      else arm(s, [s * (sx + 4.5), sy - 31, 0], [s * (sx + 6), sy - 58, 6]);
    }
    leg(1, [hp + 5, 7, 4]); leg(-1, [-(hp + 4.5), 7, -3]);
    pose = pose || 'stand';
    if (def.pose && pose === 'stand') pose = def.pose;
    if (pose === 'happy') { // こぶしを顔の横に・片手は腰
      arm(1, [sx + 13, sy - 12, 6], [sx + 10, sy + 12, 12], 'fist');
      arm(-1, [-(sx + 12), sy - 26, -4], [-(sx + 4), sy - 46, 7], 'fist');
      leg(1, [hp + 6, 7, 6]); leg(-1, [-(hp + 5), 7, -5]);
    } else if (pose === 'surprised') { // 両手を胸の前に・足を開いて身がまえる
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 9), sy - 24, 12], [s * (sx + 1), sy - 8, 24], 'open'); }
      leg(1, [hp + 8, 7, -4]); leg(-1, [-(hp + 8), 7, -2]); R.bob = -2;
    } else if (pose === 'serious' || pose === 'seal') { // 印を結ぶ
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 7), sy - 28, 12], [s * 3, sy - 16, 24], 'fist'); }
      R.seal = true; leg(1, [hp + 6, 7, 2]); leg(-1, [-(hp + 6), 7, -2]);
    } else if (pose === 'wave') {
      arm(1, [sx + 14, sy - 4, 4], [sx + 17, sy + 22, 6], 'open');
    } else if (pose === 'walk') {
      var ph = (frame || 0) * Math.PI / 2;
      for (k = 0; k < 2; k++) {
        s = k ? 1 : -1;
        var sw = Math.sin(ph + (s > 0 ? 0 : Math.PI)), lift = Math.max(0, Math.cos(ph + (s > 0 ? 0 : Math.PI)));
        leg(s, [s * (hp + 1.5), 7 + lift * 12, 2 + sw * 22]);
        arm(s, [s * (sx + 4), sy - 31, -1 - sw * 9], [s * (sx + 6), sy - 58, 3 - sw * 20]);
      }
      R.bob = 2 * Math.abs(Math.cos(ph));
    } else if (pose === 'hold') {
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 6), sy - 28, 12], [s * 9, sy - 30, 22], 'open'); }
      R.hold = true;
    } else if (pose === 'fists') { // 構え
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 9), sy - 26, 10], [s * 11, sy - 21, 24], 'fist'); }
      leg(1, [hp + 9, 7, 8]); leg(-1, [-(hp + 9), 7, -8]); R.bob = -4;
    } else if (pose === 'attack') { // frame 0 = ためる／1 = 突く
      if (frame === 0) {
        arm(1, [sx + 10, sy - 22, -12], [sx + 12, sy - 40, -26], 'fist');
        arm(-1, [-(sx + 4), sy - 20, 16], [-7, sy - 28, 32], 'open');
        leg(1, [hp + 5, 7, -18]); leg(-1, [-(hp + 5), 7, 18]); R.bob = -5;
      } else {
        arm(1, [sx + 3, sy - 6, 29], [sx - 3, sy - 8, 57], 'fist');
        arm(-1, [-(sx + 8), sy - 24, -12], [-(sx + 9), sy - 42, -22], 'fist');
        leg(1, [hp + 5, 7, 26]); leg(-1, [-(hp + 4), 7, -24]); R.bob = -9;
      }
    } else if (pose === 'rescue') { // 腰を落として両手をさしのべる
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 4), sy - 16, 20], [s * 12, sy - 26, 44], 'open'); }
      leg(1, [hp + 10, 7, 10]); leg(-1, [-(hp + 9), 7, -10]); R.bob = -12;
    } else if (pose === 'search') { // しゃがんで指さす
      arm(1, [sx + 8, sy - 22, 16], [sx - 2, sy - 40, 38], 'point');
      arm(-1, [-(sx + 6), sy - 26, 10], [-(sx + 4), sy - 50, 20], 'open');
      leg(1, [hp + 9, 7, 12]); leg(-1, [-(hp + 9), 7, -8]); R.bob = -16;
    } else if (pose === 'retreat') { // 後ろへ跳ぶ
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 13), sy - 10, -8], [s * (sx + 24), sy + 4, -14], 'open'); }
      leg(1, [hp + 4, 40, -18]); leg(-1, [-(hp + 4), 30, 10]); R.bob = 18;
    } else if (pose === 'down') { // へとへと：片ひざをつく
      R.bob = -46;
      leg(1, [hp + 4, 6, -30], [hp + 3, 5, 12]);
      leg(-1, [-(hp + 6), 7, 30], [-(hp + 6), 46, 40]);
      arm(1, [sx + 6, sy - 28, 10], [sx + 3, sy - 52, 24], 'open');
      arm(-1, [-(sx + 7), sy - 24, 14], [-(sx + 3), sy - 44, 34], 'open');
    } else if (pose === 'cheer') { // こぶしを高く
      arm(1, [sx + 9, sy + 16, 2], [sx + 8, sy + 44, 4], 'fist');
      arm(-1, [-(sx + 13), sy - 22, -4], [-(sx + 5), sy - 42, 7], 'fist');
      leg(1, [hp + 5, 12, 2]); leg(-1, [-(hp + 5), 10, -2]); R.bob = 6;
    } else if (pose === 'guard') { // からくり工房：びっくり（両こぶしを胸の前に、足を開いて身がまえる）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 9), sy - 25, 11], [s * 7, sy - 12, 26], 'fist'); }
      leg(1, [hp + 10, 8, 3]); leg(-1, [-(hp + 10), 8, 3]); R.bob = 1; R.tilt = -3;
    } else if (pose === 'run') { // からくり工房：走る（6コマ）。ひじを曲げて脚と逆に腕をふり、ももを上げる。足はいつも少し浮く
      var rp = (frame || 0) * Math.PI / 3;
      R.bob = 3 + 4 * Math.abs(Math.sin(rp)); R.tilt = 7;
      for (k = 0; k < 2; k++) {
        s = k ? 1 : -1;
        var rsw = Math.sin(rp + (s > 0 ? 0 : Math.PI)), rlift = Math.max(0, Math.cos(rp + (s > 0 ? 0 : Math.PI)));
        var th = -rsw * 0.75, fo = th + 1.45; // 上腕のふり（前が＋）と前腕の向き（下から前へ）
        var E = [s * (sx + 5), sy - 4 - 27 * Math.cos(th), 27 * Math.sin(th)];
        arm(s, E, [E[0] + s, E[1] - 25 * Math.cos(fo), E[2] + 25 * Math.sin(fo)], 'fist');
        leg(s, [s * (hp + 1.5), 7 + R.bob + rlift * 26, 4 + rsw * 32]);
      }
    } else if (pose === 'jump') { // からくり工房：跳ぶ（両腕を前の上へのばし、片ひざを上げる。横から見て頭にかくれない向き）
      arm(1, [sx + 6, sy + 8, 17], [sx + 8, sy + 30, 32], 'open');
      arm(-1, [-(sx + 7), sy - 2, 20], [-(sx + 8), sy + 16, 40], 'open');
      R.bob = 14; R.tilt = 5;
      leg(1, [hp + 2, R.bob + 30, 20]); leg(-1, [-(hp + 2), R.bob + 8, -14]);
    } else if (pose === 'fall') { // からくり工房：落ちる（腕を横に広げ、脚をそろえてぶらり）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 24), sy - 10, 2], [s * (sx + 46), sy - 6, 4], 'open'); }
      R.bob = 12;
      leg(1, [hp + 5, R.bob + 10, 8]); leg(-1, [-(hp + 5), R.bob + 8, -6]);
    } else if (pose === 'oops') { // からくり工房：落ちた・当たった（両腕を前と後ろの上へ。びっくり）
      arm(1, [sx + 6, sy + 12, 16], [sx + 8, sy + 36, 26], 'open');
      arm(-1, [-(sx + 6), sy + 12, -16], [-(sx + 8), sy + 36, -26], 'open');
      R.bob = 8; R.tilt = -6;
      leg(1, [hp + 9, R.bob + 14, 6]); leg(-1, [-(hp + 9), R.bob + 20, -4]);
    } else if (pose === 'land') { // からくり工房：着地（ひざを曲げて腰を落とす）
      for (k = 0; k < 2; k++) { s = k ? 1 : -1; arm(s, [s * (sx + 10), sy - 26, 8], [s * (sx + 18), sy - 46, 14], 'open'); }
      leg(1, [hp + 8, 7, 3]); leg(-1, [-(hp + 8), 7, 1]); R.bob = -8;
    }
    // キャラ固有の立ちポーズ（ちびキャラ用の値を cool の腕の長さへ直す。armCool があればそちら）
    var ovs = def.armCool || def.arm;
    if (ovs && (pose === 'stand' || pose === def.pose)) {
      var kx = sx / (bn === 'big' ? 33 : bn === 'small' ? 21 : 23);
      var mp = function (v) { return def.armCool ? [v[0], sy + v[1], v[2]] : [v[0] * kx, sy + (v[1] < 0 ? v[1] * 1.42 : v[1] * 0.85), v[2] * 0.82]; };
      for (var key in ovs) {
        var ov = ovs[key], am = R.arms[+key];
        if (!am) continue;
        if (ov.E) am.E = mp(ov.E);
        if (ov.H) am.H = mp(ov.H);
        if (ov.hand) am.hand = ov.hand;
      }
    }
    R.pose = pose;
    if (raw) return R;
    finishLegs(R, b);
    return R;
  }
  // 足の高さ（地面から）を体の空間へ。ひざを決める
  function finishLegs(R, b) {
    for (var k = 0; k < 2; k++) {
      var s = k ? 1 : -1, lg = R.legs[s];
      lg.A = [lg.A[0], lg.A[1] - R.bob, lg.A[2]];
      if (lg.K) lg.K = [lg.K[0], lg.K[1] - R.bob, lg.K[2]];
      else lg.K = kneeIK(lg.hip, lg.A, b.lt, b.ls);
    }
  }

  /* ---------------- official（公式イラストに忠実な絵柄）の体格とポーズ ---------------- */
  // 公式イラスト（39体）から測った比率：約2.7頭身。頭は横に広く（幅≒高さ×1.1）、目は頭の上から7割の低い位置に大きく離れてつく。
  // 胴は箱形（肩から帯へほぼ同じ幅、裾で少し広がる）、袖は短く広い。腕は肩から斜め下へ33°ほど開く。
  // 値は体の空間（地面 y=0、全身の高さ≒210）。ymap はちびキャラの定義の高さ → この体の高さ
  var OFF_LW = 0.78;
  var OFF_BUILDS = {
    normal: { hs: 0.77, hr: 50, headY: 171, neck: 6.5, sy: 131, sj: 117, sx: 23, hem: 60, srx: 21, srz: 13, hrx: 28, hrz: 16,
      prof: [[132, 12, 9], [127, 22.5, 13.5], [118, 26, 15], [85, 26, 15.5], [60, 30.5, 18]],
      hip: 12, legTop: 66, thigh: [24, 19], shin: [17.5, 13.5], lt: 32, ls: 30,
      upper: 10.5, upper1: 7.5, armW: 7.6, hand: 6.4, obi: [77, 84], foot: [8.5, 12.5, 5], u: 0.9,
      ka: 0.72, kl: 0.65, ymap: [[0, 0], [10, 6], [40, 60], [48, 66], [56, 77], [67, 84], [97, 131], [146, 171], [200, 214]],
      hx: 0.86, jaw: { x: 0.22, p: 1.4, y: 0.05, z: 0.05 }, eye: { x: 26, y: -16, w: 8.8, h: 12 }, mouthY: -39, blushY: -28 },
    small: { hs: 0.74, hr: 50, headY: 162, neck: 6, sy: 124, sj: 111, sx: 21.5, hem: 57, srx: 19.5, srz: 12, hrx: 26, hrz: 15,
      prof: [[125, 11.5, 8.5], [120, 21, 12.5], [111, 24.5, 14], [80, 24.5, 14.5], [57, 29, 17]],
      hip: 11.5, legTop: 63, thigh: [22.5, 18], shin: [16.5, 12.5], lt: 30.5, ls: 28.5,
      upper: 10, upper1: 7.2, armW: 7.2, hand: 6, obi: [73, 79.5], foot: [8, 12, 4.8], u: 0.86,
      ka: 0.68, kl: 0.6, ymap: [[0, 0], [10, 6], [40, 57], [48, 63], [56, 73], [67, 79.5], [97, 124], [146, 162], [200, 204]],
      hx: 0.86, jaw: { x: 0.22, p: 1.4, y: 0.05, z: 0.05 }, eye: { x: 26, y: -16, w: 8.8, h: 12 }, mouthY: -39, blushY: -28 },
    big: { hs: 0.74, hr: 50, headY: 176, neck: 9, sy: 136, sj: 121, sx: 31, hem: 60, srx: 31, srz: 18, hrx: 32, hrz: 19,
      prof: [[137, 15, 11], [131, 31, 18], [120, 35, 20], [86, 31, 18.5], [60, 34, 20]],
      hip: 14, legTop: 67, thigh: [28, 22], shin: [21, 16], lt: 32.5, ls: 30.5,
      upper: 14, upper1: 11, armW: 13, hand: 9.5, obi: [77, 85], foot: [9.5, 14, 5.6], u: 1,
      ka: 0.82, kl: 0.66, ymap: [[0, 0], [10, 6], [40, 60], [48, 67], [56, 77], [67, 85], [97, 136], [146, 176], [200, 218]],
      hx: 0.92, jaw: { x: 0.08, p: 1.4, y: 0.03, z: 0.04 }, eye: { x: 30, y: -18, w: 9, h: 8.5 }, mouthY: -48, blushY: -37 },
    chick: { hs: 0.88, hr: 50, headY: 167, neck: 0, sy: 131, sj: 117, sx: 23, hem: 60, srx: 21, srz: 13, hrx: 28, hrz: 16,
      prof: [[132, 12, 9], [127, 22.5, 13.5], [118, 26, 15], [85, 26, 15.5], [60, 30.5, 18]],
      hip: 12, legTop: 66, thigh: [24, 19], shin: [15, 11], lt: 32, ls: 30,
      upper: 10.5, upper1: 7.5, armW: 9, hand: 7, obi: [77, 84], foot: [8.5, 12.5, 5], u: 0.9,
      ka: 0.72, kl: 0.65, ymap: [[0, 0], [10, 6], [40, 60], [48, 66], [56, 77], [67, 84], [97, 131], [146, 167], [200, 214]],
      hx: 1, jaw: null, eye: { x: 22, y: -12, w: 5.6, h: 7 }, mouthY: -28, blushY: -22 }
  };
  // official のポーズ：cool のポーズを計算してから、腕は肩を中心に・脚は股を中心に、この体の長さへ縮める
  function rigOff(def, pose, frame) {
    var bn = OFF_BUILDS[def.build] ? def.build : 'normal', b = OFF_BUILDS[bn];
    var cbn = bn === 'big' || bn === 'small' ? bn : 'normal', cb = COOL_BUILDS[cbn];
    var d2 = {}, key;
    for (key in def) d2[key] = def[key];
    d2.arm = null; d2.armCool = null; d2.build = cbn;
    var R = rigCool(d2, pose, frame, COOL_BUILDS, true), s, i;
    var ka = b.ka, kl = b.kl;
    for (i = 0; i < 2; i++) {
      s = i ? 1 : -1;
      var am = R.arms[s], S0 = [s * cb.sx, cb.sy - 4, 0], S1 = [s * b.sx, b.sj, 0];
      var mv = function (Q) { return [S1[0] + (Q[0] - S0[0]) * ka, S1[1] + (Q[1] - S0[1]) * ka, (Q[2] - S0[2]) * ka]; };
      am.S = S1; am.E = mv(am.E); am.H = mv(am.H);
      var lg = R.legs[s], h0x = s * cb.hip, h1 = [s * b.hip, b.legTop, 0];
      var lv = function (Q) { return [h1[0] + (Q[0] - h0x) * 0.9, b.legTop + (Q[1] - cb.legTop) * kl, Q[2] * 0.72]; };
      lg.hip = h1; lg.A = lv(lg.A); if (lg.K) lg.K = lv(lg.K);
    }
    R.bob *= kl;
    R.b = b; R.off = true;
    var P0 = R.pose;
    if (P0 === 'stand') { // 公式の構え：両腕を斜め下に開く
      for (i = 0; i < 2; i++) {
        s = i ? 1 : -1;
        R.arms[s].E = [s * (b.sx + 15.5 * ka / 0.72), b.sj - 10 * ka / 0.72, 3];
        R.arms[s].H = [s * (b.sx + 29 * ka / 0.72), b.sj - 27 * ka / 0.72, 6];
        R.arms[s].hand = 'open';
      }
      R.legs[1].A = [b.hip + 7, 4, 2]; R.legs[-1].A = [-(b.hip + 7), 4, -1];
    }
    // キャラ固有の立ちポーズ（ちびキャラ用の値。肩からの向きと長さをこの腕へ）
    var ovs = def.armOff || def.arm;
    if (ovs && (P0 === 'stand' || P0 === def.pose)) {
      var cs = bn === 'big' ? 33 : bn === 'small' ? 21 : 23, f = def.armOff ? 1 : 0.95;
      for (key in ovs) {
        var ov = ovs[key], sd = +key, A2 = R.arms[sd];
        if (!A2) continue;
        var mp = function (v) { return def.armOff ? [v[0], b.sj + v[1], v[2]] : [sd * b.sx + (v[0] - sd * cs) * f, b.sj + (v[1] + 5) * f, v[2] * f]; };
        if (ov.E) A2.E = mp(ov.E);
        if (ov.H) A2.H = mp(ov.H);
        if (ov.hand) A2.hand = ov.hand;
      }
    }
    finishLegs(R, b);
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
    if (expr === 'tired') { // 相棒道場：へとへと（＞＜の目）
      var tw = rx * 0.95, th2 = 4.4 * S;
      return sl('M' + r1(x + side * tw) + ' ' + r1(y - th2) + 'L' + r1(x - side * tw * 0.7) + ' ' + r1(y) + 'L' + r1(x + side * tw) + ' ' + r1(y + th2), EYE_DARK, 2.7 * S);
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
    else if (expr === 'tired') kind = kind === 'beak' ? 'beak' : (kind === 'dog' || kind === 'cat' ? kind : 'wavy');
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
      case 'wavy': // 相棒道場：へとへとの口
        return sl('M' + r1(x - 5.5 * k) + ' ' + r1(y + 2) + 'q' + r1(1.4 * k) + ' ' + r1(-2.6 * S) + ' ' + r1(2.75 * k) + ' 0q' + r1(1.4 * k) + ' ' + r1(2.6 * S) + ' ' + r1(2.75 * k) + ' 0q' + r1(1.4 * k) + ' ' + r1(-2.6 * S) + ' ' + r1(2.75 * k) + ' 0q' + r1(1.4 * k) + ' ' + r1(2.6 * S) + ' ' + r1(2.75 * k) + ' 0', OUT, 2 * S);
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
  // official 用の上書き（キャラ定義の off）を重ねる。キーごとに1段だけ合成し、null は消す。$new: true ならまるごと置きかえ
  function offDef(def) {
    var d = {}, k, q, offSkin = def.off && def.off.skin;
    for (k in def) if (k !== 'off') d[k] = def[k];
    for (k in def.off) {
      var v = def.off[k], cur = d[k];
      if (v === null) { delete d[k]; continue; }
      if (v && typeof v === 'object' && !Array.isArray(v) && !v.$new && cur && typeof cur === 'object' && !Array.isArray(cur)) {
        var m = {};
        for (q in cur) m[q] = cur[q];
        for (q in v) { if (v[q] === null) delete m[q]; else m[q] = v[q]; }
        d[k] = m;
      } else if (v && v.$new) { var n = {}; for (q in v) if (q !== '$new') n[q] = v[q]; d[k] = n; }
      else d[k] = v;
    }
    // 公式の肌は少し落ち着いた色。明るい肌だけ寄せ、同じ色を使う胴（素肌）・腕・脚もそろえる
    var sk0 = d.skin || SKIN;
    if (!offSkin && lum(sk0) > 0.78) {
      var sk1 = mix(sk0, '#c89a86', 0.2), same = function (o, key) { if (o && String(o[key]).toLowerCase() === String(sk0).toLowerCase()) { var n = {}; for (var q2 in o) n[q2] = o[q2]; n[key] = sk1; return n; } return o; };
      d.skin = sk1; d.top = same(d.top, 'color'); d.arms = same(same(d.arms, 'color'), 'hand'); d.legs = same(same(d.legs, 'color'), 'skin');
    }
    return d;
  }
  function render(def, opt) {
    opt = opt || {};
    var yaw = opt.yaw == null ? 0 : opt.yaw;
    var pose = opt.pose || 'stand';
    var expr = opt.expr || (pose === 'happy' ? 'happy' : (pose === 'surprised' || pose === 'guard' || pose === 'oops') ? 'surprised' : (pose === 'serious' ? 'serious' : 'normal'));
    var uid = 'n' + (++uidSeq).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    var S = new Scene(uid);
    var cam = new Cam(yaw, opt.pitch);
    var st = opt.style || NinjaArt.style, tp = st !== 'cute', off = st === 'official';
    if (off) def = offDef(def);
    var R = off ? rigOff(def, pose, opt.frame) : tp ? rigCool(def, pose, opt.frame, COOL_BUILDS) : rig(def, pose, opt.frame);
    var b = R.b;
    var ctx = { def: def, opt: opt, S: S, cam: cam, R: R, b: b, yaw: yaw, expr: expr, pose: R.pose, back: Math.abs(wrap(yaw)) > 95, uid: uid };
    ctx.skin = def.skin || SKIN;
    ctx.st = st; ctx.tp = tp; ctx.off = off;       // tp：頭を縮めて首にのせる描き方（cute 以外）／off：公式に忠実な絵柄
    ctx.u = tp ? b.u : 1;                          // 飾りの大きさの倍率
    ctx.Y = tp ? function (y) { return ymapB(b, y); } : function (y) { return y; }; // キャラ定義の高さ（ちびキャラの値）→ この絵柄の高さ
    cam.oy = GROUND - R.bob;

    var lw0 = LWK, visn0 = VISN;
    LWK = (opt.lw || 1) * (off ? OFF_LW : tp ? COOL_LW : 1);
    VISN = off;
    ctx.lw = LWK;
    try {
      if (opt.shadow !== false) S.add(-100, sf(ellD(100, GROUND + 1, tp ? 34 : 44, tp ? 6 : 8), '#3a2a1e', { op: 0.16 }));
      drawBody(ctx);
      drawHead(ctx);
      if (def.companions && opt.companions !== false) drawCompanions(ctx);
      if (opt.fx) drawFx(ctx, opt.fx);
    } finally { LWK = lw0; VISN = visn0; }

    var vb = opt.viewBox || '0 0 200 240';
    var w = opt.w || 200, h = opt.h || 240;
    var inner = S.out();
    var tilt = (R.tilt || 0) * Math.sin(yaw * D2R); // 向いている方へ傾ける（正面では傾けない）
    if (Math.abs(tilt) > 0.2) inner = '<g transform="rotate(' + r1(tilt) + ' 100 ' + GROUND + ')">' + inner + '</g>';
    if (opt.raw) return inner;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="' + w + '" height="' + h + '">' + inner + '</svg>';
  }

  /* ================= 頭 ================= */
  function drawHead(c) {
    var def = c.def, b = c.b, cam = c.cam, S = c.S;
    var hd = def.head || {};
    var hr = (hd.r || b.hr), hx = hd.sx || 1, hy = hd.sy || 0.92, jaw = null;
    if (c.off) { // 公式：丸い頭（髪をのせて縦長に見えるくらいの幅）、あごは少しだけ細い
      if (!hd.kind || hd.kind === 'human') { jaw = b.jaw; hx = hd.sx || b.hx; }
      else if (hd.kind === 'dog' || hd.kind === 'cat') { jaw = { x: 0.08, p: 1.5, y: 0.03, z: 0.06 }; hx = hd.sx || 0.94; }
    } else if (c.tp) { // あごの細い、少し面長の頭
      if (!hd.kind || hd.kind === 'human') { jaw = { x: 0.34, p: 1.4, y: 0.2, z: 0.2 }; hx = hd.sx || 0.9; hy = hd.sy || 0.96; }
      else if (hd.kind === 'dog' || hd.kind === 'cat') jaw = { x: 0.22, p: 1.5, y: 0.1, z: 0.14 };
    }
    var H = new Head({ x: 0, y: b.headY + (hd.dy || 0), z: (hd.dz || 0), rx: hr * hx, ry: hr * hy, rz: hr }, cam, jaw);
    c.H = H;
    if (c.tp) {
      // 頭まわりは半径50で描いて、頭の中心を軸に hs 倍へ縮める（線は縮む分だけ太く描く）
      var hs = b.hs, add0 = S.add;
      var tf = '<g transform="matrix(' + hs + ' 0 0 ' + hs + ' ' + r1(H.cx * (1 - hs)) + ' ' + r1(H.cy * (1 - hs)) + ')">';
      c.headScr = { x: H.cx, y: H.cy, r: hr * hx * hs, s: hs };
      S.add = function (z, str) { if (str) add0.call(S, z, tf + str + '</g>'); };
      var lw1 = LWK; LWK = c.off ? c.lw * 0.94 / hs : c.lw * 0.6 / (hs * COOL_LW);
      try { drawHeadParts(c, H, hd, hr); } finally { S.add = add0; LWK = lw1; }
      return;
    }
    c.headScr = { x: H.cx, y: H.cy, r: hr * hx, s: 1 };
    drawHeadParts(c, H, hd, hr);
  }
  function drawHeadParts(c, H, hd, hr) {
    var def = c.def, b = c.b, cam = c.cam, S = c.S;
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
    if (!def.mask || (def.mask.kind === 'cloth' || def.mask.kind === 'scarf')) (c.off ? drawFaceOff : c.tp ? drawFaceCool : drawFace)(c, H, ZH);
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
    if (c.off && def.band && def.band.under && hp && !c.back) drawFringe(c, H, hp, def.band, ZH);
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
        if (def.band && ey + 15 > bandLo(c) - 2 && !def.browsOver) continue;
        var kb = k * Math.max(0.3, fb.s), inY = 0, outY = 0;
        var angry = def.brows === 'angry' || expr === 'serious';
        if (angry) { inY = 3; outY = -2; }
        if (expr === 'surprised') { inY = -3; outY = -3; }
        if (def.brows === 'worried' || expr === 'tired') { inY = -2; outY = 2; }
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
  /* ---- cool の顔：切れ長の目・細い眉・鼻すじ・小さな口（ほおの赤みはなし） ---- */
  function eyeXY(c) {
    var e = c.def.eyes || {};
    if (c.off) { var E = c.b.eye; return { x: e.x != null ? e.x : E.x, y: e.y != null ? e.y : E.y }; }
    return c.tp ? { x: e.x || 21, y: e.y == null ? -12 : e.y } : { x: e.x || 24, y: e.y == null ? -13 : e.y };
  }
  function drawFaceCool(c, H, ZH) {
    var def = c.def, S = c.S, e = def.eyes || {}, k = H.k, expr = c.expr, hd = def.head || {};
    var ep = eyeXY(c), ex = ep.x, ey = ep.y;
    var eyeExpr = e.lock ? 'normal' : expr;
    var animal = hd.kind === 'dog' || hd.kind === 'cat' || hd.kind === 'chick' || hd.kind === 'gorilla';
    if (animal) { ex = e.x || 24; ey = e.y == null ? -8 : e.y; }
    // 目
    for (var si = -1; si <= 1; si += 2) {
      var fe = H.feat(si * ex, ey);
      if (!fe.vis) continue;
      if (def.eyepatch && def.eyepatch.side === si) continue;
      var kk = k * Math.max(0.28, fe.s);
      var sty = e.style; if (e.styleL && si < 0) sty = e.styleL; if (e.styleR && si > 0) sty = e.styleR;
      var col = (si > 0 && e.color2) ? e.color2 : (e.color || (sty === 'dot' ? '#3a2418' : '#3a2a28'));
      if (e.scar === si) { // 傷でふさがった目
        S.add(ZH + 6, sl('M' + r1(fe.x - 8 * kk) + ' ' + r1(fe.y + 0.5) + 'Q' + r1(fe.x) + ' ' + r1(fe.y + 3.5) + ' ' + r1(fe.x + 8 * kk) + ' ' + r1(fe.y - 0.5), EYE_DARK, 2.6) +
          sl('M' + r1(fe.x + 2 * kk) + ' ' + r1(fe.y - 11) + 'L' + r1(fe.x - 2 * kk) + ' ' + r1(fe.y + 11), dk(c.skin, 0.4), 2.2));
        continue;
      }
      if (e.wink === si && expr === 'normal') { S.add(ZH + 6, sl('M' + r1(fe.x - 8 * kk) + ' ' + r1(fe.y + 1) + 'Q' + r1(fe.x) + ' ' + r1(fe.y - 5) + ' ' + r1(fe.x + 8 * kk) + ' ' + r1(fe.y + 1.5), EYE_DARK, 3)); continue; }
      S.add(ZH + 6, eyeCool(S, fe.x, fe.y, kk, e, si * (fe.a >= 0 ? 1 : 1), eyeExpr, sty, col, c.skin, !!(e.lash || def.shadowLid || def.liner)));
      if (def.shadowLid && eyeExpr === 'normal') S.add(ZH + 5.5, sf(ellD(fe.x, fe.y - 6, 9 * kk, 3.4), def.shadowLid, { op: 0.45 }));
      if (def.liner && eyeExpr !== 'happy') S.add(ZH + 6.5, sl('M' + r1(fe.x + si * 8.6 * kk) + ' ' + r1(fe.y - 1.6) + 'l' + r1(si * 4.4 * kk) + ' ' + r1(-2.2), def.liner, 2.4));
    }
    // 眉（前髪の上にも描く）
    if (def.brows !== 'none' && !c.back) {
      var bw = def.brows === 'thick' ? 3.4 : 2.4, bc = def.browColor || (def.hair ? dk(def.hair.color, 0.45) : '#2a1e1a');
      var byy = ey + (animal ? 13 : 12);
      var underBand = def.band && byy > bandLo(c) - 3 && !def.browsOver;
      var underHood = def.hood && byy > (def.hood.front == null ? -3 : def.hood.front) - 2;
      if (!underBand && !underHood) {
        var angry = def.brows === 'angry' || expr === 'serious';
        for (var sb = -1; sb <= 1; sb += 2) {
          var fb = H.feat(sb * (ex + 1), byy);
          if (!fb.vis) continue;
          var kb = k * Math.max(0.28, fb.s), inY = 1, outY = -2.6;
          if (angry) { inY = 4.2; outY = -3.4; }
          if (expr === 'surprised') { inY = -3.4; outY = -4.6; }
          if (def.brows === 'worried' || expr === 'tired') { inY = -3; outY = 1.6; }
          if (expr === 'happy') { inY = -0.6; outY = -3; }
          var ix = fb.x - sb * 8.5 * kb, ox = fb.x + sb * 11 * kb, my = fb.y - 2.6 + (inY + outY) / 2;
          // 先の細い筆の眉
          var bd = 'M' + r1(ix) + ' ' + r1(fb.y + inY - bw / 2) + 'Q' + r1(fb.x) + ' ' + r1(my - bw / 2) + ' ' + r1(ox) + ' ' + r1(fb.y + outY) +
            'Q' + r1(fb.x) + ' ' + r1(my + bw / 2) + ' ' + r1(ix) + ' ' + r1(fb.y + inY + bw / 2) + 'Z';
          S.add(ZH + 32, sp(bd, bc, { w: 0.8, sc: bc }));
        }
      }
    }
    if (animal) return; // 動物は鼻づら・くちばしで描く
    if (c.back) return;
    // 鼻すじ（影の側に短い線）
    var fn = H.feat(3, -27, 0.5);
    if (fn.s > 0.25) {
      var nd = Math.sin(c.yaw * D2R) < -0.1 ? -1 : 1;
      S.add(ZH + 5.5, sl('M' + r1(fn.x + nd * 1.1) + ' ' + r1(fn.y - 1.6) + 'L' + r1(fn.x - nd * 0.9) + ' ' + r1(fn.y + 1.1), dk(c.skin, 0.34), 1.8));
    }
    // 口
    var mk = def.mouth || 'smile';
    var fm = H.feat(0, def.mouthY == null ? -41 : def.mouthY);
    if (fm.s > -0.05) {
      var km = k * clamp(fm.s, 0.45, 1);
      S.add(ZH + 6, mouthCool(fm.x, fm.y, km, mk, expr, def));
      if (mk === 'leaf' || def.leaf) S.add(ZH + 6.5, leafSvg(fm.x + 6 * km, fm.y + 1, k * 0.8));
      if (def.pipe) { var px0 = fm.x + 4 * km, py0 = fm.y + 1; S.add(ZH + 6.6, sl('M' + r1(px0) + ' ' + r1(py0) + 'L' + r1(px0 + 22 * km) + ' ' + r1(py0 + 5), OUT, 4.4) + sl('M' + r1(px0) + ' ' + r1(py0) + 'L' + r1(px0 + 22 * km) + ' ' + r1(py0 + 5), def.pipe, 2.4) + sp('M' + r1(px0 + 20 * km) + ' ' + r1(py0 + 2) + 'l5 0l0 -6l-5 0Z', def.pipe, { w: 1.4 })); }
    }
    if (expr === 'tired') { var fs2 = H.feat(-40, 10, 2); if (fs2.vis) S.add(ZH + 60, sp('M' + r1(fs2.x) + ' ' + r1(fs2.y - 8) + 'q-6 9 0 12q6 -3 0 -12Z', '#9fd6f2', { w: 1.8, sc: '#3a7ab0' })); }
    // 顔の印
    if (def.marks) drawMarks(c, H, def.marks, ZH);
  }
  // 切れ長の目。side は顔の右（+1）か左（-1）か（目じりの向き）
  function eyeCool(S, x, y, kk, e, side, expr, sty, col, skin, lash) {
    var w = 9.8 * kk, h = 5.6, o = '';
    if (sty === 'closed') {
      return sl('M' + r1(x - w) + ' ' + r1(y - 0.5) + 'Q' + r1(x) + ' ' + r1(y + 4.4) + ' ' + r1(x + w) + ' ' + r1(y - 0.5), EYE_DARK, 3.2) +
        sl('M' + r1(x + side * w * 0.95) + ' ' + r1(y - 0.2) + 'l' + r1(side * 3.4 * kk) + ' ' + r1(1.8), EYE_DARK, 2.4);
    }
    if (expr === 'tired') { // 半分とじた目
      return sl('M' + r1(x - side * w) + ' ' + r1(y + 1.4) + 'Q' + r1(x) + ' ' + r1(y - 1) + ' ' + r1(x + side * w * 1.05) + ' ' + r1(y - 0.8), EYE_DARK, 3.4) +
        sl('M' + r1(x - side * w * 0.6) + ' ' + r1(y + 3.4) + 'Q' + r1(x) + ' ' + r1(y + 4.6) + ' ' + r1(x + side * w * 0.8) + ' ' + r1(y + 2.8), dk(skin, 0.45), 1.5);
    }
    if (sty === 'wide') { // 見開いた丸い目（小さな黒目）
      o += sp(ellD(x, y, 7.4 * kk, 7.4), '#fbf8f2', { w: 2.4 });
      o += sf(ellD(x + side * 0.4, y + 0.6, 2 * kk, 2.2), EYE_DARK);
      return o;
    }
    var up = h * 1.22, lo = h * 1.0, lift = 2.2; // 目じりが上がる
    if (sty === 'sharp') { lift = 3.2; up = h * 1.08; }
    if (sty === 'half') up = h * 0.7;
    if (expr === 'happy') { lo = h * 0.5; up = h * 1.18; }
    if (expr === 'serious') { up = h * 0.74; lift = 3.6; }
    if (expr === 'surprised') { up = h * 1.6; lo = h * 1.3; lift = 1; }
    var I = { x: x - side * w, y: y + 1.4 }, O = { x: x + side * w * 1.04, y: y - lift };
    var U1 = { x: I.x + side * w * 0.46, y: y - up }, U2 = { x: O.x - side * w * 0.42, y: y - up * 1.04 - lift * 0.45 };
    var L1 = { x: O.x - side * w * 0.3, y: y + lo }, L2 = { x: I.x + side * w * 0.38, y: y + lo * 1.02 };
    if (expr === 'happy') { L1 = { x: O.x - side * w * 0.28, y: y - 0.6 }; L2 = { x: I.x + side * w * 0.36, y: y - 0.2 }; I = { x: I.x, y: y + 2.6 }; }
    var upper = 'M' + P(I) + 'C' + P(U1) + ' ' + P(U2) + ' ' + P(O);
    var shape = upper + 'C' + P(L1) + ' ' + P(L2) + ' ' + P(I) + 'Z';
    var cid = S.clip(shape);
    o += sf(shape, '#fdfaf4');
    // 黒目（暗い色は少し明るくして色が見えるように）
    var ic = lum(col) < 0.22 ? mix(col, '#8a7a70', 0.14) : col;
    var ir = expr === 'surprised' ? 4.4 : 5.6, ix = x + side * 0.9 * kk, iy = y + (expr === 'happy' ? -0.6 : 0.6);
    var iris = sf(ellD(ix, iy, ir * 0.94 * kk, ir * 1.06), ic);
    iris += sf(ellD(ix, iy + ir * 0.55, ir * 0.72 * kk, ir * 0.5), lt(ic, 0.32), { op: 0.85 }); // 下の明るみ
    iris += sf(ellD(ix, iy - ir * 0.72, ir * 1.1 * kk, ir * 0.6), dk(ic, 0.55), { op: 0.8 }); // 上まぶたの影
    if (e.pupil === 'star') iris += starSvg(ix, iy + 0.3, 3.4 * Math.max(0.6, kk), e.pupilColor || '#ffd54a');
    else if (e.pupil === 'heart') iris += heartSvg(ix, iy + 0.6, 3, e.pupilColor || '#ff5aa0');
    else if (e.pupil === 'diamond') iris += sf('M' + r1(ix) + ' ' + r1(iy - 3.8) + 'l' + r1(2.2 * kk) + ' 3.8l' + r1(-2.2 * kk) + ' 3.8l' + r1(-2.2 * kk) + ' -3.8Z', '#1a0a0a');
    else iris += sf(ellD(ix, iy + 0.4, (expr === 'surprised' ? 1.3 : 2.3) * kk, expr === 'surprised' ? 1.5 : 3), dk(col, 0.8));
    iris += sf(ellD(ix - 2 * kk, iy - 2, 1.6 * Math.max(0.5, kk), 1.6), '#ffffff'); // 光
    iris += sf(ellD(ix + 1.8 * kk, iy + 2.2, 0.8 * Math.max(0.5, kk), 0.8), '#ffffff', { op: 0.8 });
    o += g(iris, cid);
    // 上まぶた：目頭は細く目じりへ太くなる筆の線と、はねた目じり
    var lp = [], lwd = [], n = 12;
    for (var i = 0; i < n; i++) { var t = i / (n - 1); lp.push(bz2(I, U1, U2, O, t)); lwd.push(lerp(1.4, 4.6, Math.pow(t, 1.3))); }
    lp.push({ x: O.x + side * 3.6 * kk, y: O.y - 1.6 - lift * 0.3 }); lwd.push(0.6);
    o += sf(smoothD(brushPts(lp, lwd), true, 0.6), EYE_DARK);
    if (lash) o += sl('M' + r1(O.x - side * 1.6 * kk) + ' ' + r1(O.y - 2.2) + 'l' + r1(side * 3.8 * kk) + ' -2.6', EYE_DARK, 1.6);
    // 下まぶた（目じり側だけ、細く）
    if (expr === 'happy') o += sl('M' + r1(x + side * w * 0.55) + ' ' + r1(y + 4.2) + 'Q' + r1(x) + ' ' + r1(y + 2.4) + ' ' + r1(x - side * w * 0.45) + ' ' + r1(y + 4.4), dk(skin, 0.3), 1.2); // 笑うと目の下にしわ
    else o += sl('M' + r1(lerp(O.x, L1.x, 0.25)) + ' ' + r1(lerp(O.y, L1.y, 0.25) + 0.6) + 'Q' + P(L1) + ' ' + r1(lerp(O.x, I.x, 0.5)) + ' ' + r1(y + lo * 1.0), dk(skin, 0.36), 1);
    return o;
  }
  function mouthCool(x, y, k, kind, expr, def) {
    var MOUTH = '#6e2422', TEETH = '#fbf8f2', TONGUE = '#d9706e', LINE = '#4a2a24';
    if (expr === 'happy') kind = (kind === 'grin' || kind === 'grinFang' || kind === 'openFang' || kind === 'shout' || kind === 'open') ? 'grinC' : (kind === 'tongue' ? 'tongue' : (kind === 'fang' ? 'smirkFang' : 'smileC'));
    else if (expr === 'surprised') kind = 'oC';
    else if (expr === 'serious') kind = kind === 'grinFang' || kind === 'openFang' ? 'teeth' : 'flatC';
    else if (expr === 'tired') kind = 'pant';
    var w = 4.6 * k;
    switch (kind) {
      case 'open': // 少し開いた口
        return sp('M' + r1(x - w) + ' ' + r1(y - 0.6) + 'Q' + r1(x) + ' ' + r1(y + 7) + ' ' + r1(x + w) + ' ' + r1(y - 0.6) + 'Q' + r1(x) + ' ' + r1(y + 1) + ' ' + r1(x - w) + ' ' + r1(y - 0.6) + 'Z', MOUTH, { w: 1.6 });
      case 'openFang': case 'grinFang': case 'grinC': case 'grin': case 'shout': { // 歯を見せる
        var ww = (kind === 'shout' ? 5.6 : 6.4) * k, dd = kind === 'shout' ? 8.5 : 6;
        var d = 'M' + r1(x - ww) + ' ' + r1(y - 1.2) + 'Q' + r1(x) + ' ' + r1(y + 0.4) + ' ' + r1(x + ww) + ' ' + r1(y - 2) + 'Q' + r1(x + ww * 0.5) + ' ' + r1(y + dd) + ' ' + r1(x - ww * 0.2) + ' ' + r1(y + dd * 0.9) + 'Q' + r1(x - ww * 0.8) + ' ' + r1(y + dd * 0.6) + ' ' + r1(x - ww) + ' ' + r1(y - 1.2) + 'Z';
        var o = sp(d, MOUTH, { w: 1.6 });
        o += sf('M' + r1(x - ww + 1) + ' ' + r1(y - 0.9) + 'Q' + r1(x) + ' ' + r1(y + 0.8) + ' ' + r1(x + ww - 1) + ' ' + r1(y - 1.7) + 'L' + r1(x + ww - 1.8) + ' ' + r1(y + 1.4) + 'Q' + r1(x) + ' ' + r1(y + 3) + ' ' + r1(x - ww + 1.8) + ' ' + r1(y + 1.6) + 'Z', TEETH);
        if (kind !== 'grin' && kind !== 'grinC' || (def && def.fang)) o += sp('M' + r1(x + ww * 0.45) + ' ' + r1(y + 0.4) + 'l' + r1(1.2 * k) + ' 3.4l' + r1(1.2 * k) + ' -3.2Z', TEETH, { w: 0.8 }) + sp('M' + r1(x - ww * 0.6) + ' ' + r1(y + 0.6) + 'l' + r1(1.1 * k) + ' 3l' + r1(1.1 * k) + ' -2.8Z', TEETH, { w: 0.8 });
        return o;
      }
      case 'teeth': // くいしばる
        return sp('M' + r1(x - 5.6 * k) + ' ' + r1(y - 1) + 'L' + r1(x + 5.6 * k) + ' ' + r1(y - 1.6) + 'L' + r1(x + 5 * k) + ' ' + r1(y + 2.6) + 'L' + r1(x - 5 * k) + ' ' + r1(y + 3) + 'Z', TEETH, { w: 1.6 }) + sl('M' + r1(x - 5 * k) + ' ' + r1(y + 0.9) + 'L' + r1(x + 5 * k) + ' ' + r1(y + 0.5), LINE, 1);
      case 'oC':
        return sp(ellD(x, y + 2, 2.6 * k, 3.6), MOUTH, { w: 1.6 });
      case 'pant': // 息があがった口
        return sp('M' + r1(x - 3.8 * k) + ' ' + r1(y) + 'Q' + r1(x) + ' ' + r1(y - 1.5) + ' ' + r1(x + 3.8 * k) + ' ' + r1(y + 0.4) + 'L' + r1(x + 2.6 * k) + ' ' + r1(y + 4.4) + 'L' + r1(x - 2.6 * k) + ' ' + r1(y + 4.2) + 'Z', MOUTH, { w: 1.6 });
      case 'flat': case 'flatC':
        return sl('M' + r1(x - w) + ' ' + r1(y + 0.4) + 'L' + r1(x + w) + ' ' + r1(y - 0.2), LINE, 2.2);
      case 'frown':
        return sl('M' + r1(x - w) + ' ' + r1(y + 1.6) + 'Q' + r1(x) + ' ' + r1(y - 1.2) + ' ' + r1(x + w) + ' ' + r1(y + 1.4), LINE, 2.2);
      case 'smirk': case 'fang': case 'smirkFang': {
        var o2 = sl('M' + r1(x - w) + ' ' + r1(y + 0.6) + 'Q' + r1(x + 0.8) + ' ' + r1(y + 1.8) + ' ' + r1(x + w * 1.05) + ' ' + r1(y - 2), LINE, 2.2);
        if (kind !== 'smirk') o2 += sp('M' + r1(x + w * 0.3) + ' ' + r1(y + 1.2) + 'l' + r1(1.1 * k) + ' 3.2l' + r1(1.2 * k) + ' -3.4Z', TEETH, { w: 0.8 });
        return o2;
      }
      case 'tongue':
        return sl('M' + r1(x - w) + ' ' + r1(y + 0.4) + 'Q' + r1(x + 0.6) + ' ' + r1(y + 1.8) + ' ' + r1(x + w) + ' ' + r1(y - 1.4), LINE, 2.2) +
          sp('M' + r1(x + 0.4 * k) + ' ' + r1(y + 1.2) + 'q' + r1(1.2 * k) + ' 5 ' + r1(3.6 * k) + ' 0.4Z', TONGUE, { w: 1.2 });
      case 'none': case 'beak': return '';
      default: // 'smile'：ほぼまっすぐで片方の口角が少し上がる／'smileC'：自信のある笑み
        if (kind === 'smileC') return sl('M' + r1(x - w * 1.1) + ' ' + r1(y - 1) + 'Q' + r1(x) + ' ' + r1(y + 3.2) + ' ' + r1(x + w * 1.1) + ' ' + r1(y - 1.8), LINE, 2.3);
        return sl('M' + r1(x - w * 0.9) + ' ' + r1(y + 0.4) + 'Q' + r1(x + 0.4) + ' ' + r1(y + 1.2) + ' ' + r1(x + w) + ' ' + r1(y - 0.9), LINE, 2.1);
    }
  }

  /* ---- official の顔：低い位置の大きな目（太い上まぶた）・小さな口・ほおの赤み ---- */
  function drawFaceOff(c, H, ZH) {
    var def = c.def, S = c.S, e = def.eyes || {}, k = H.k, expr = c.expr, hd = def.head || {}, B = c.b;
    var ep = eyeXY(c), ex = ep.x, ey = ep.y;
    var eyeExpr = e.lock ? 'normal' : expr;
    var kind = hd.kind || 'human';
    // ほおの赤み
    if (def.blush && !c.back) {
      var bc = def.blush === true ? '#f29a9a' : def.blush;
      for (var sb0 = -1; sb0 <= 1; sb0 += 2) {
        var fb0 = H.feat(sb0 * (ex + (def.blushX || 7)), def.blushY != null ? def.blushY : B.blushY);
        if (fb0.vis) S.add(ZH + 3, sf(ellD(fb0.x, fb0.y, 7.5 * k * Math.max(0.35, fb0.s), 4.6 * k), bc, { op: expr === 'happy' ? 0.7 : 0.55 }));
      }
    }
    // 目
    for (var si = -1; si <= 1; si += 2) {
      var fe = H.feat(si * ex, ey);
      if (!fe.vis || kind === 'gorilla') continue; // ゴリラは顔の型で描く
      if (def.eyepatch && def.eyepatch.side === si) continue;
      if (e.hide === si) continue; // 前髪でかくれる目
      var kk = k * Math.max(0.25, fe.s);
      var sty = e.style || 'anime'; if (e.styleL && si < 0) sty = e.styleL; if (e.styleR && si > 0) sty = e.styleR;
      var col = (si > 0 && e.color2) ? e.color2 : (e.color || '#4a3a34');
      if (e.scar === si) { // 傷でふさがった目
        S.add(ZH + 6, sl('M' + r1(fe.x - 9 * kk) + ' ' + r1(fe.y + 1) + 'Q' + r1(fe.x) + ' ' + r1(fe.y + 5) + ' ' + r1(fe.x + 9 * kk) + ' ' + r1(fe.y) , EYE_DARK, 3) +
          sl('M' + r1(fe.x - 7 * kk) + ' ' + r1(fe.y - 12) + 'L' + r1(fe.x + 7 * kk) + ' ' + r1(fe.y + 10) + 'M' + r1(fe.x - 8 * kk) + ' ' + r1(fe.y + 6) + 'L' + r1(fe.x + 6 * kk) + ' ' + r1(fe.y - 7), dk(c.skin, 0.55), 2.4));
        continue;
      }
      if (e.wink === si && eyeExpr === 'normal') { // ウインク
        S.add(ZH + 6, sl('M' + r1(fe.x - 9 * kk) + ' ' + r1(fe.y + 2) + 'Q' + r1(fe.x) + ' ' + r1(fe.y - 5) + ' ' + r1(fe.x + 9 * kk) + ' ' + r1(fe.y + 2), EYE_DARK, 3.4) +
          sl('M' + r1(fe.x + si * 9 * kk) + ' ' + r1(fe.y + 2) + 'l' + r1(si * 3 * kk) + ' 2.4', EYE_DARK, 2.4));
        continue;
      }
      S.add(ZH + 6, eyeOff(S, fe.x, fe.y, kk, e, si, eyeExpr, sty, col, c.skin, B.eye));
      if (def.shadowLid && eyeExpr === 'normal') S.add(ZH + 5.5, sf(ellD(fe.x + si * 2 * kk, fe.y - 9, 11 * kk, 4.5), def.shadowLid, { op: 0.5 }));
      if (def.liner && eyeExpr !== 'happy') S.add(ZH + 6.5, sf('M' + r1(fe.x + si * 7 * kk) + ' ' + r1(fe.y - 9) + 'L' + r1(fe.x + si * 15 * kk) + ' ' + r1(fe.y - 13) + 'L' + r1(fe.x + si * 11 * kk) + ' ' + r1(fe.y - 7) + 'Z', def.liner));
    }
    // 眉（前髪の下。browsOver なら前髪の上）
    if (def.brows !== 'none' && !c.back && kind === 'human') {
      var bw = def.brows === 'thick' ? 4.2 : 3, bcol = def.browColor || (def.hair ? dk(def.hair.color, 0.45) : '#2a1e1a');
      var byy = ey + (e.browY || 15);
      var angry = def.brows === 'angry' || expr === 'serious', zb = def.browsOver ? ZH + 32 : ZH + 7;
      for (var sb = -1; sb <= 1; sb += 2) {
        var fb = H.feat(sb * (ex - 1), byy);
        if (!fb.vis) continue;
        var kb = k * Math.max(0.28, fb.s), inY = 0, outY = -1.5;
        if (angry) { inY = 4.5; outY = -2.5; }
        if (expr === 'surprised') { inY = -4; outY = -4; }
        if (def.brows === 'worried' || expr === 'tired') { inY = -3; outY = 2; }
        if (def.brows === 'dot') { S.add(zb, sf(ellD(fb.x - sb * 2 * kb, fb.y + 1, 3 * kb, 4.4), bcol)); continue; }
        if (def.brows === 'bushy') { // 太くもじゃもじゃの眉（岩爺）：目じり側へ下がる房
          var bx0 = fb.x - sb * 10 * kb, bx1 = fb.x + sb * 15 * kb;
          S.add(zb, sp('M' + r1(bx0) + ' ' + r1(fb.y + 3) + 'Q' + r1(fb.x) + ' ' + r1(fb.y - 9) + ' ' + r1(bx1) + ' ' + r1(fb.y - 1) + 'L' + r1(bx1 + sb * 3 * kb) + ' ' + r1(fb.y + 7) + 'L' + r1(fb.x + sb * 9 * kb) + ' ' + r1(fb.y + 4) + 'L' + r1(fb.x + sb * 6 * kb) + ' ' + r1(fb.y + 9) + 'L' + r1(fb.x + sb * 1 * kb) + ' ' + r1(fb.y + 4) + 'L' + r1(fb.x - sb * 4 * kb) + ' ' + r1(fb.y + 7) + 'Z', bcol, { w: 1.6 }));
          continue;
        }
        var ix = fb.x - sb * 7 * kb, ox = fb.x + sb * 8 * kb, my = fb.y - 2 + (inY + outY) / 2;
        S.add(zb, sp('M' + r1(ix) + ' ' + r1(fb.y + inY - bw / 2) + 'Q' + r1(fb.x) + ' ' + r1(my - bw / 2) + ' ' + r1(ox) + ' ' + r1(fb.y + outY) +
          'Q' + r1(fb.x) + ' ' + r1(my + bw / 2) + ' ' + r1(ix) + ' ' + r1(fb.y + inY + bw / 2) + 'Z', bcol, { w: 0.8, sc: bcol }));
      }
    }
    if (kind !== 'human' || c.back) { if (def.marks && !c.back) drawMarks(c, H, def.marks, ZH); return; }
    // 鼻（小さな線。nose: false で描かない）
    if (def.nose) { var fn = H.feat(2, (ey + (def.mouthY != null ? def.mouthY : B.mouthY)) / 2 - 2, 0.5); if (fn.s > 0.3) S.add(ZH + 5.5, sl('M' + r1(fn.x - 1) + ' ' + r1(fn.y - 1.6) + 'L' + r1(fn.x + 1.2) + ' ' + r1(fn.y + 1.6), dk(c.skin, 0.35), 2)); }
    // 口
    var mk = def.mouth || 'smile';
    var fm = H.feat(def.mouthX || 0, def.mouthY != null ? def.mouthY : B.mouthY);
    if (fm.s > -0.05) {
      var km = k * clamp(fm.s, 0.45, 1);
      S.add(ZH + 6, mouthOff(fm.x, fm.y, km, mk, expr, def));
      if (mk === 'leaf' || def.leaf) S.add(ZH + 6.5, leafSvg(fm.x + 6 * km, fm.y + 1, k * 1.1));
      if (def.pipe) { var px0 = fm.x + 4 * km, py0 = fm.y + 1; S.add(ZH + 6.6, sl('M' + r1(px0) + ' ' + r1(py0) + 'L' + r1(px0 + 24 * km) + ' ' + r1(py0 + 4), OUT, 5) + sl('M' + r1(px0) + ' ' + r1(py0) + 'L' + r1(px0 + 24 * km) + ' ' + r1(py0 + 4), def.pipe, 2.8) + sp('M' + r1(px0 + 22 * km) + ' ' + r1(py0 + 2) + 'q1 -9 9 -8l0 8Z', def.pipe, { w: 1.6 })); }
    }
    if (expr === 'tired') { var fs2 = H.feat(-44, 8, 2); if (fs2.vis) S.add(ZH + 60, sp('M' + r1(fs2.x) + ' ' + r1(fs2.y - 9) + 'q-7 10 0 13q7 -3 0 -13Z', '#9fd6f2', { w: 2, sc: '#3a7ab0' })); }
    if (def.marks) drawMarks(c, H, def.marks, ZH);
  }
  // 公式の目。side は目じりの向き（+1：向かって右）。D は体格ごとの目の大きさ
  function eyeOff(S, x, y, kk, e, side, expr, sty, col, skin, D) {
    var w = (e.w || D.w) * kk, h = (e.h || D.h), o = '';
    if (sty === 'closed' || (expr === 'happy' && !e.happyOpen)) { // とじた目（うれしい・おだやか）
      var up = sty === 'closed' && expr !== 'happy' ? -1 : 1;
      o += sl('M' + r1(x - w) + ' ' + r1(y + 2 * up) + 'Q' + r1(x) + ' ' + r1(y - 7 * up) + ' ' + r1(x + w) + ' ' + r1(y + 2 * up), EYE_DARK, 3.6);
      o += sl('M' + r1(x + side * w * 0.95) + ' ' + r1(y + 2 * up) + 'l' + r1(side * 3.4 * kk) + ' ' + r1(2.6 * up), EYE_DARK, 2.6);
      return o;
    }
    if (expr === 'tired') { // ＞＜
      var tw = w * 0.85, th2 = 6;
      return sl('M' + r1(x + side * tw) + ' ' + r1(y - th2) + 'L' + r1(x - side * tw * 0.75) + ' ' + r1(y) + 'L' + r1(x + side * tw) + ' ' + r1(y + th2), EYE_DARK, 3.4);
    }
    if (sty === 'dot') { // 黒い点の目（動物）。色があれば茶色の丸い目
      o += sp(ellD(x, y, w * 0.62, h * 0.72), e.color || EYE_DARK, { w: 1.2, sc: EYE_DARK });
      if (e.color) o += sf(ellD(x, y + h * 0.15, w * 0.34, h * 0.4), dk(e.color, 0.5));
      o += sf(ellD(x - w * 0.18, y - h * 0.26, w * 0.24, w * 0.24), '#ffffff');
      return o;
    }
    if (sty === 'hollow') { // くぼんだ暗い目（呂屯の片目）
      o += sf(ellD(x, y + 1, w * 0.95, h * 0.62), '#000000', { op: 0.32 });
      o += sl('M' + r1(x - w * 0.8) + ' ' + r1(y) + 'Q' + r1(x) + ' ' + r1(y + h * 0.5) + ' ' + r1(x + w * 0.8) + ' ' + r1(y - 1), EYE_DARK, 3);
      return o;
    }
    if (sty === 'slit') { // 黒一色の鋭い目（刃）：上はまっすぐ目頭へ下がり、下は丸い
      var sw = w * 1.18, sh2 = h * 0.62;
      var dS = 'M' + r1(x - side * sw * 0.95) + ' ' + r1(y - sh2 * 0.05) + 'L' + r1(x + side * sw) + ' ' + r1(y - sh2 * 0.95) + 'Q' + r1(x + side * sw * 0.85) + ' ' + r1(y + sh2 * 0.95) + ' ' + r1(x - side * sw * 0.2) + ' ' + r1(y + sh2 * 0.75) + 'Q' + r1(x - side * sw * 0.8) + ' ' + r1(y + sh2 * 0.55) + ' ' + r1(x - side * sw * 0.95) + ' ' + r1(y - sh2 * 0.05) + 'Z';
      o += sf(dS, EYE_DARK) + sf(ellD(x + side * sw * 0.32, y - sh2 * 0.18, w * 0.2, w * 0.17), '#ffffff');
      return o;
    }
    if (sty === 'wide') { // 見開いた丸い目（呂屯）
      var rw = Math.min(w, h) * 0.95;
      o += sp(ellD(x, y, rw, rw * 1.02), '#f2e4e4', { w: 2.6 });
      o += sl(ellD(x, y, rw * 0.55, rw * 0.56), '#c79a9e', 2);
      o += sf(ellD(x + side * 0.4, y + 0.4, rw * 0.3, rw * 0.3), EYE_DARK);
      o += sl('M' + r1(x - rw * 0.9) + ' ' + r1(y + rw * 1.25) + 'Q' + r1(x) + ' ' + r1(y + rw * 1.55) + ' ' + r1(x + rw * 0.9) + ' ' + r1(y + rw * 1.2), dk('#5b826f', 0.5), 2.2);
      return o;
    }
    var sharp = sty === 'sharp' || expr === 'serious' || (e.sharp && expr !== 'surprised'), half = sty === 'half' || sty === 'narrow';
    var top = h * 1.02, bot = h * 0.95, inY = h * 0.05, outY = -h * 0.12;
    if (sharp) { top = h * 0.78; inY = h * 0.22; outY = -h * 0.42; }
    if (half) { top = h * (sty === 'narrow' ? 0.18 : 0.42); inY = h * 0.25; outY = h * 0.05; }
    if (expr === 'surprised') { top = h * 1.2; bot = h * 1.1; inY = 0; outY = -h * 0.05; }
    var I = { x: x - side * w * 0.96, y: y + inY }, O = { x: x + side * w, y: y + outY };
    var U1 = { x: x - side * w * 0.58, y: y - top * (sharp ? 0.75 : 1) }, U2 = { x: x + side * w * 0.5, y: y - top * (sharp ? 1.05 : 1.04) };
    var L1 = { x: x + side * w * 0.95, y: y + bot * 0.9 }, L2 = { x: x - side * w * 0.95, y: y + bot * 0.9 };
    var upper = 'M' + P(I) + 'C' + P(U1) + ' ' + P(U2) + ' ' + P(O);
    var shape = upper + 'C' + P(L1) + ' ' + P(L2) + ' ' + P(I) + 'Z';
    var cid = S.clip(shape);
    var ic = col, hi = '#ffffff';
    var irx = w * 0.64, iry = h * 0.84, icx = x + side * w * 0.06, icy = y + h * 0.1;
    if (expr === 'surprised') { irx *= 0.72; iry *= 0.72; }
    var inner = '';
    if (sty === 'simple' || sty === 'narrow') { // 白目のない目（咲耶・結・令）
      inner += sf(ellD(x, y + h * 0.1, w * 1.1, h * 1.2), ic);
      inner += sf(ellD(x, y - h * 0.55, w * 1.2, h * 0.62), dk(ic, 0.42), { op: 0.9 });
      inner += sf(ellD(x - w * 0.34, y - h * 0.3, w * 0.24, w * 0.24), hi);
    } else {
      inner += sf(shape, '#fdfaf5');
      inner += sf(ellD(icx, icy, irx, iry), ic);
      inner += sf(ellD(icx, icy + iry * 0.55, irx * 0.78, iry * 0.48), lt(ic, 0.3), { op: 0.85 });
      inner += sf(ellD(icx, icy - iry * 0.62, irx * 1.15, iry * 0.55), dk(ic, 0.5), { op: 0.85 });
      var pc = dk(ic, 0.78);
      if (e.pupil === 'star') inner += starSvg(icx, icy + 0.5, irx * 0.95, e.pupilColor || '#ffd54a');
      else if (e.pupil === 'sparkle') inner += starSvg(icx, icy + 0.5, irx * 0.7, e.pupilColor || '#ffffff');
      else if (e.pupil === 'heart') inner += heartSvg(icx, icy + 1, irx * 0.62, e.pupilColor || '#ff5aa0');
      else if (e.pupil === 'slit') inner += sf(ellD(icx, icy, irx * 0.18, iry * 0.86), pc);
      else if (e.pupil === 'diamond') inner += sf('M' + r1(icx) + ' ' + r1(icy - iry * 0.6) + 'l' + r1(irx * 0.42) + ' ' + r1(iry * 0.6) + 'l' + r1(-irx * 0.42) + ' ' + r1(iry * 0.6) + 'l' + r1(-irx * 0.42) + ' ' + r1(-iry * 0.6) + 'Z', pc);
      else if (e.pupil !== 'none') inner += sf(ellD(icx, icy + 0.4, irx * (expr === 'surprised' ? 0.32 : 0.46), iry * (expr === 'surprised' ? 0.36 : 0.5)), pc);
      if (e.pupil !== 'star' && e.pupil !== 'sparkle') {
        inner += sf(ellD(icx - irx * 0.42, icy - iry * 0.38, irx * 0.34, irx * 0.34), hi);
        inner += sf(ellD(icx + irx * 0.34, icy + iry * 0.45, irx * 0.16, irx * 0.16), hi, { op: 0.85 });
      }
    }
    o += g(inner, cid);
    // 上まぶた：目頭は細く、目じりへ太く。目じりは少しはねる
    var lp = [], lwd = [], n = 12;
    for (var i = 0; i < n; i++) { var t = i / (n - 1); lp.push(bz2(I, U1, U2, O, t)); lwd.push(lerp(1.6, half ? 4.6 : 5.2, Math.pow(t, 1.1))); }
    var fx = e.lash || sharp ? 4.4 : 2.8;
    lp.push({ x: O.x + side * fx * kk, y: O.y - (e.lash ? 3.4 : 1.6) }); lwd.push(0.8);
    o += sf(smoothD(brushPts(lp, lwd), true, 0.6), EYE_DARK);
    if (e.lash) o += sl('M' + r1(O.x - side * 2 * kk) + ' ' + r1(O.y - 2.4) + 'l' + r1(side * 4 * kk) + ' -3.4', EYE_DARK, 2);
    // 下まぶた（目じり側に短く）
    if (!half && sty !== 'simple') o += sl('M' + r1(x + side * w * 0.9) + ' ' + r1(y + bot * 0.35) + 'Q' + r1(x + side * w * 0.7) + ' ' + r1(y + bot * 0.92) + ' ' + r1(x + side * w * 0.22) + ' ' + r1(y + bot * 0.98), EYE_DARK, 1.8);
    if (e.lower) o += sl('M' + r1(x + side * w * 0.4) + ' ' + r1(y + bot * 1.25) + 'l' + r1(side * 2 * kk) + ' 2.2M' + r1(x + side * w * 0.05) + ' ' + r1(y + bot * 1.3) + 'l0 2.4', EYE_DARK, 1.4);
    return o;
  }
  function mouthOff(x, y, k, kind, expr, def) {
    var MOUTH = '#7a2626', TEETH = '#fbf8f2', TONGUE = '#e8807e', LINE = '#3a221e';
    if (expr === 'happy') kind = { open: 'open', openFang: 'openFang', grin: 'grin', grinFang: 'grinFang', shark: 'shark', shout: 'open', tongue: 'tongue', fang: 'openFang', cat: 'catOpen', lips: 'smileBig', flat: 'smileBig', frown: 'smileBig', smirk: 'smileBig' }[kind] || 'openSmile';
    else if (expr === 'surprised') kind = kind === 'shark' ? 'shark' : 'o';
    else if (expr === 'serious') kind = kind === 'shark' || kind === 'grinFang' ? kind : (kind === 'lips' ? 'lips' : 'flat');
    else if (expr === 'tired') kind = 'wavy';
    var w = 5 * k;
    switch (kind) {
      case 'open': case 'openFang': case 'openSmile': case 'shout': case 'catOpen': {
        var ww = (kind === 'shout' ? 6.5 : 6) * k, dd = kind === 'shout' ? 10 : 8.5;
        var d = 'M' + r1(x - ww) + ' ' + r1(y - 1.5) + 'Q' + r1(x) + ' ' + r1(y - 0.4) + ' ' + r1(x + ww) + ' ' + r1(y - 1.5) + 'Q' + r1(x + ww * 0.9) + ' ' + r1(y + dd) + ' ' + r1(x) + ' ' + r1(y + dd) + 'Q' + r1(x - ww * 0.9) + ' ' + r1(y + dd) + ' ' + r1(x - ww) + ' ' + r1(y - 1.5) + 'Z';
        if (kind === 'shout') d = 'M' + r1(x - ww) + ' ' + r1(y - 2) + 'L' + r1(x + ww) + ' ' + r1(y - 3) + 'L' + r1(x + ww * 0.7) + ' ' + r1(y + dd) + 'L' + r1(x - ww * 0.7) + ' ' + r1(y + dd) + 'Z';
        var o = sp(d, MOUTH, { w: 2.2 });
        o += sf(ellD(x + 0.6, y + dd * 0.68, ww * 0.56, 3), TONGUE);
        if (kind === 'openFang' || (def && def.fang)) o += sp('M' + r1(x + ww * 0.35) + ' ' + r1(y - 0.8) + 'l' + r1(1.5 * k) + ' 3.8l' + r1(1.6 * k) + ' -3.6Z', TEETH, { w: 1.1 });
        if (kind === 'shout') o += sf('M' + r1(x - ww * 0.8) + ' ' + r1(y - 1.6) + 'L' + r1(x + ww * 0.8) + ' ' + r1(y - 2.4) + 'L' + r1(x + ww * 0.75) + ' ' + r1(y + 0.6) + 'L' + r1(x - ww * 0.75) + ' ' + r1(y + 1.2) + 'Z', TEETH);
        return o;
      }
      case 'grin': case 'grinFang': case 'shark': { // 歯を見せて笑う／ぎざぎざの歯
        var gw = 7.5 * k, gd = 7.5;
        var o2 = sp('M' + r1(x - gw) + ' ' + r1(y - 2.5) + 'Q' + r1(x) + ' ' + r1(y - 0.5) + ' ' + r1(x + gw) + ' ' + r1(y - 3.5) + 'Q' + r1(x + gw * 0.6) + ' ' + r1(y + gd) + ' ' + r1(x) + ' ' + r1(y + gd) + 'Q' + r1(x - gw * 0.7) + ' ' + r1(y + gd) + ' ' + r1(x - gw) + ' ' + r1(y - 2.5) + 'Z', MOUTH, { w: 2.2 });
        if (kind === 'shark') {
          var tz = 'M' + r1(x - gw * 0.9) + ' ' + r1(y - 2.2), nz = 7;
          for (var q = 0; q <= nz; q++) tz += 'L' + r1(x - gw * 0.9 + q * gw * 1.8 / nz) + ' ' + r1(y - 2.6 - q * 0.12 + (q % 2 ? 3.6 : 0));
          o2 += sp(tz + 'Z', TEETH, { w: 1 });
          var bz = 'M' + r1(x - gw * 0.6) + ' ' + r1(y + gd - 1);
          for (q = 0; q <= 5; q++) bz += 'L' + r1(x - gw * 0.6 + q * gw * 1.2 / 5) + ' ' + r1(y + gd - 1 - (q % 2 ? 3.4 : 0));
          o2 += sp(bz + 'Z', TEETH, { w: 1 });
        } else {
          o2 += sf('M' + r1(x - gw + 1.2) + ' ' + r1(y - 2.2) + 'Q' + r1(x) + ' ' + r1(y - 0.2) + ' ' + r1(x + gw - 1.2) + ' ' + r1(y - 3.2) + 'L' + r1(x + gw - 2) + ' ' + r1(y + 0.8) + 'Q' + r1(x) + ' ' + r1(y + 2.6) + ' ' + r1(x - gw + 2) + ' ' + r1(y + 0.6) + 'Z', TEETH);
          if (kind === 'grinFang') o2 += sp('M' + r1(x + gw * 0.42) + ' ' + r1(y) + 'l' + r1(1.5 * k) + ' 4l' + r1(1.6 * k) + ' -3.8Z', TEETH, { w: 1 }) + sp('M' + r1(x - gw * 0.62) + ' ' + r1(y) + 'l' + r1(1.5 * k) + ' 4l' + r1(1.6 * k) + ' -3.8Z', TEETH, { w: 1 });
        }
        return o2;
      }
      case 'o': return sp(ellD(x, y + 2.5, 3.2 * k, 4.4), MOUTH, { w: 2 });
      case 'flat': return sl('M' + r1(x - 4 * k) + ' ' + r1(y + 1) + 'L' + r1(x + 4 * k) + ' ' + r1(y + 0.6), LINE, 2.6);
      case 'frown': return sl('M' + r1(x - 4.5 * k) + ' ' + r1(y + 2.4) + 'Q' + r1(x) + ' ' + r1(y - 1.6) + ' ' + r1(x + 4.5 * k) + ' ' + r1(y + 2.2), LINE, 2.6);
      case 'smirk': return sl('M' + r1(x - 4.5 * k) + ' ' + r1(y + 1.2) + 'Q' + r1(x + 1) + ' ' + r1(y + 3) + ' ' + r1(x + 5.5 * k) + ' ' + r1(y - 2.4), LINE, 2.6);
      case 'fang': return sl('M' + r1(x - w) + ' ' + r1(y) + 'Q' + r1(x) + ' ' + r1(y + 4) + ' ' + r1(x + w) + ' ' + r1(y - 0.4), LINE, 2.6) + sp('M' + r1(x + w * 0.3) + ' ' + r1(y + 1.4) + 'l' + r1(1.3 * k) + ' 3.6l' + r1(1.4 * k) + ' -3.8Z', TEETH, { w: 1.1 });
      case 'tongue': return sl('M' + r1(x - w) + ' ' + r1(y) + 'Q' + r1(x) + ' ' + r1(y + 4) + ' ' + r1(x + w) + ' ' + r1(y - 0.6), LINE, 2.6) + sp('M' + r1(x + 1 * k) + ' ' + r1(y + 1.8) + 'q' + r1(1.6 * k) + ' 6 ' + r1(5 * k) + ' 0.6Z', TONGUE, { w: 1.6 });
      case 'cat': return sl('M' + r1(x - 6 * k) + ' ' + r1(y - 1) + 'Q' + r1(x - 3 * k) + ' ' + r1(y + 4) + ' ' + r1(x) + ' ' + r1(y - 0.5) + 'Q' + r1(x + 3 * k) + ' ' + r1(y + 4) + ' ' + r1(x + 6 * k) + ' ' + r1(y - 1), LINE, 2.4);
      case 'lips': return sp('M' + r1(x - 3.2 * k) + ' ' + r1(y + 0.5) + 'Q' + r1(x) + ' ' + r1(y - 1.6) + ' ' + r1(x + 3.2 * k) + ' ' + r1(y + 0.5) + 'Q' + r1(x) + ' ' + r1(y + 3) + ' ' + r1(x - 3.2 * k) + ' ' + r1(y + 0.5) + 'Z', '#c8403e', { w: 1.2, sc: '#8a2a28' });
      case 'smileBig': return sl('M' + r1(x - 5.5 * k) + ' ' + r1(y - 0.6) + 'Q' + r1(x) + ' ' + r1(y + 5.5) + ' ' + r1(x + 5.5 * k) + ' ' + r1(y - 0.6), LINE, 2.6);
      case 'wavy': return sl('M' + r1(x - 5.5 * k) + ' ' + r1(y + 2) + 'q' + r1(1.4 * k) + ' -2.6 ' + r1(2.75 * k) + ' 0q' + r1(1.4 * k) + ' 2.6 ' + r1(2.75 * k) + ' 0q' + r1(1.4 * k) + ' -2.6 ' + r1(2.75 * k) + ' 0q' + r1(1.4 * k) + ' 2.6 ' + r1(2.75 * k) + ' 0', LINE, 2.2);
      case 'none': case 'beak': return '';
      default: return sl('M' + r1(x - w) + ' ' + r1(y - 0.3) + 'Q' + r1(x) + ' ' + r1(y + 3.8) + ' ' + r1(x + w) + ' ' + r1(y - 0.6), LINE, 2.6);
    }
  }

  function leafSvg(x, y, k) {
    return sl('M' + r1(x) + ' ' + r1(y) + 'l' + r1(6 * k) + ' ' + r1(2 * k), '#4f7a3a', 1.6) +
      sp('M' + r1(x + 5 * k) + ' ' + r1(y + 2 * k) + 'q' + r1(6 * k) + ' ' + r1(-7 * k) + ' ' + r1(13 * k) + ' ' + r1(-2 * k) + 'q' + r1(-6 * k) + ' ' + r1(7 * k) + ' ' + r1(-13 * k) + ' ' + r1(2 * k) + 'Z', '#6fae4c', { w: 1.6 });
  }

  function drawMarks(c, H, marks, ZH) {
    var S = c.S, k = H.k, DY = c.off ? -13 : 0, DF = c.off ? -12 : 0; // official は顔のパーツが低い
    marks.forEach(function (m) {
      var s, f;
      if (m.kind === 'freckles') {
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 38, -25 + DY); if (!f.vis) continue; for (var i = 0; i < 3; i++) S.add(ZH + 4, sf(ellD(f.x + (i - 1) * 2.8 * k * f.s, f.y + (i === 1 ? -1.5 : 0.8), 0.9, 0.9), m.color || '#b06b4f')); }
      } else if (m.kind === 'eyebags') { // 目の下のくま（瀬織）
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * (eyeXY(c).x + 1), eyeXY(c).y - 13); if (f.vis) S.add(ZH + 5.8, sl('M' + r1(f.x - 7 * k * f.s) + ' ' + r1(f.y - 1) + 'Q' + r1(f.x) + ' ' + r1(f.y + 2.4) + ' ' + r1(f.x + 7 * k * f.s) + ' ' + r1(f.y - 1), m.color || '#7a5a7a', 2.2, { op: 0.75 })); }
      } else if (m.kind === 'whiskers') {
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 42, -24 + DY); if (!f.vis) continue; for (var j = -1; j <= 1; j++) S.add(ZH + 4, sl('M' + r1(f.x - s * 4 * k * f.s) + ' ' + r1(f.y + j * 3) + 'l' + r1(s * 8 * k * f.s) + ' ' + r1(j * 0.8), m.color || '#3b2a22', 1.5)); }
      } else if (m.kind === 'dot' || m.kind === 'urna') {
        f = H.feat(m.th || 0, m.ph != null ? m.ph : 14 + DF); if (f.vis) S.add(ZH + 4, sf(ellD(f.x, f.y, (m.r || 2.2) * k * Math.max(0.4, f.s), (m.r || 2.2) * k), m.color || '#d33a3a'));
      } else if (m.kind === 'diamond') {
        f = H.feat(0, m.ph != null ? m.ph : 12 + DF); if (f.vis) { var r = 3.4 * k, kx = Math.max(0.4, f.s); S.add(ZH + 4, sf('M' + r1(f.x) + ' ' + r1(f.y - r) + 'l' + r1(r * 0.7 * kx) + ' ' + r1(r) + 'l' + r1(-r * 0.7 * kx) + ' ' + r1(r) + 'l' + r1(-r * 0.7 * kx) + ' ' + r1(-r) + 'Z', m.color || '#d8263f')); }
      } else if (m.kind === 'lines') { // 頬の斜め線
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 40, -26 + DY); if (!f.vis) continue; for (var q = 0; q < 2; q++) S.add(ZH + 4, sl('M' + r1(f.x + (q * 3 - 3) * k * f.s) + ' ' + r1(f.y + 2) + 'l' + r1(2.5 * k * f.s) + ' ' + r1(-4), m.color || '#e0823a', 1.6)); }
      } else if (m.kind === 'drool') {
        f = H.feat(8, -36 + DY * 1.3); if (f.vis) S.add(ZH + 8, sp('M' + r1(f.x) + ' ' + r1(f.y) + 'q' + r1(2) + ' ' + r1(6) + ' ' + r1(0.5) + ' ' + r1(11) + 'q' + r1(-3) + ' ' + r1(2) + ' ' + r1(-3) + ' ' + r1(-2) + 'q' + r1(0) + ' ' + r1(-5) + ' ' + r1(2.5) + ' ' + r1(-9) + 'Z', m.color || '#9ad06a', { w: 1.5 }));
      } else if (m.kind === 'brows_red') { // 眉間の紅
        f = H.feat(0, 6 + DF); if (f.vis) S.add(ZH + 4, sf(ellD(f.x, f.y, 1.8 * k, 3.4 * k), m.color || '#d33a3a'));
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 22, 10 + DF); if (f.vis) S.add(ZH + 4, sf(ellD(f.x, f.y, 3 * k * f.s, 1.3 * k), m.color || '#d33a3a')); }
      } else if (m.kind === 'mole') {
        f = H.feat(m.side * (m.th || 30), m.ph != null ? m.ph : -24 + DY); if (f.vis) S.add(ZH + 4, sf(ellD(f.x, f.y, c.off ? 1.7 : 1.1, c.off ? 1.7 : 1.1), '#3a2a22'));
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
    var pts = H.capPts(hf, vol, hp.edge || 1.2, rough, hp.flare, hp.roughTop);
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
        if (c.tp) { a = H.local(s * 4, 38, -40); b0 = H.local(s * 26 * len, 66 * up, -66); b1 = H.local(s * 34 * len, -6, -62); b2 = H.local(s * 20 * len, -112 * len, -48); }
        if (c.off) { a = H.local(s * 2, 50, -14); b0 = H.local(s * 16 * len, 100 * up, -24); b1 = H.local(s * 58 * len, 78 * up, -28); b2 = H.local(s * 88 * len, 34 * up, -22); } // 高く結って横へ払う
        m = massD(c, [a, b0, b1, b2], pt.w || (c.off ? [22, 34, 30, 18, 2] : [14, 26, 28, 22, 4]), c.tp ? { n: 18 } : null);
        var zz = addMass(c, Z.BACK + 2, ZH + 26, m, col);
        S.add(zz + 0.02, sl(smoothD(m.scr, false), dk(col, 0.3), 1.8, { op: 0.6 }));
        if (pt.tie) { // 結び目のリボン
          var tp = c.cam.pv(c.off ? H.local(s * 1, 50, -12) : H.local(s * 6, 40, -40));
          var zt = (tp.z - H.cd) < 0 ? ZH + 0.5 : ZH + 32;
          if (c.back || Math.abs(wrap(c.yaw)) > 60) zt = ZH + 32;
          S.add(zt, bowSvg(tp.x, tp.y - 2, 1.05 * k, pt.tie, pt.tieKind));
        }
      } else if (t === 'long') {
        var L = pt.len || 1;
        var p0 = H.local(0, 18, -26), p1 = H.local(0, -20, -40), p2 = H.local(0, -60 * L, -40), p3 = H.local(0, -95 * L, -34);
        var lw2 = pt.w || [96, 104, 104, 92, 70];
        if (c.tp) { // 背中の腰のあたりまで（頭の外の長さは体の寸法で決める）
          var dn = (c.b.headY - (c.b.obi[1] + 4)) / c.b.hs * L;
          p1 = H.local(0, -24, -44); p2 = H.local(0, -dn * 0.55, -46); p3 = H.local(0, -dn, -40);
          lw2 = pt.w || [92, 96, 88, 74, 48];
        }
        m = massD(c, [p0, p1, p2, p3], lw2, { wz: pt.wz || [40, 40, 36, 30, 20] });
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
          if (pt.tip) { var mt = massD(c, [c2, c2, c3, c3], [(pt.w || [22, 24, 22, 14])[2], 20, 14, 10]); S.add(zc + 0.005, sf(mt.d, pt.tip, { clip: S.clip(m.d) })); } // 毛先の色（宇迦の白）
          S.add(zc + 0.01, sl(smoothD(m.scr, false), dk(col, 0.3), 1.5, { op: 0.5 }));
        }
      } else if (t === 'tuft' || t === 'ahoge') {
        var a0 = H.pt3(pt.th || 0, pt.ph || 80, -1);
        var tipA = t === 'ahoge' ? H.local((pt.lean || -1) * 14, 90, 0) : H.local((pt.lean || 1) * 10, 84, -6);
        var mid = [(a0[0] + tipA[0]) / 2 + (t === 'ahoge' ? 10 : 4), (a0[1] + tipA[1]) / 2 + 6, (a0[2] + tipA[2]) / 2];
        m = massD(c, [a0, mid, mid, tipA], t === 'ahoge' ? [5, 5, 3, 1] : [14, 10, 6, 1]);
        S.add(ZH + 33, sp(m.d, col, { w: 2.2 }));
      } else if (t === 'beard') {
        if (c.off && pt.big) { if (!c.back) drawBeardOff(c, H, pt.color || col, ZH); return; }
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
          var lc = c.cam.pv(c.off ? H.local(sl2 * 58, 30, -8) : H.local(sl2 * 56, 26, -10)), lr = (c.off ? 27 : 22) * k;
          var zl = (lc.z - H.cd) < -10 ? ZH - 1 : ZH + 29;
          S.add(zl, sp(ellD(lc.x, lc.y, lr * 0.95, lr), col));
          S.add(zl + 0.01, sp(ellD(lc.x + sl2 * 2, lc.y + 2, lr * 0.45, lr * 0.5), dk(col, 0.5), { w: 2 }));
        }
        var tp2 = c.cam.pv(H.local(0, c.off ? 60 : 56, -10));
        S.add(ZH + 28.8, sp(ellD(tp2.x, tp2.y, (c.off ? 44 : 26) * k, (c.off ? 26 : 12) * k), col));
        if (c.off) { var tp3 = c.cam.pv(H.local(0, 84, -14)); S.add(ZH + 28.79, sp(ellD(tp3.x, tp3.y, 30 * k, 14 * k), col)); } // 公式：高く結い上げたまげ
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

  // 公式の豊かなあごひげ（岩爺）：ほおからあごの下まで、下のふちは房に分かれ、口ひげが口をかくす
  function drawBeardOff(c, H, col, ZH) {
    var S = c.S, L = [[-47, -10], [-50, -32], [-44, -52], [-34, -68], [-24, -62], [-14, -76], [-4, -66], [6, -78], [16, -66], [26, -72], [36, -58], [46, -44], [50, -26], [47, -10], [36, -18], [20, -26], [0, -27], [-20, -26], [-36, -18]];
    var bd = smoothD(maskPath(c, H, L, 1, 3), true, 0.35);
    S.add(ZH + 9, sp(bd, col));
    var cl = S.clip(bd), ln = '';
    [[-30, -34, -26, -56], [-14, -38, -12, -64], [2, -40, 2, -68], [18, -38, 16, -62], [32, -32, 30, -52]].forEach(function (q) { var a = maskPt(c, H, q[0], q[1], 1.5, 3), b2 = maskPt(c, H, q[2], q[3], 1.5, 3); ln += 'M' + P(a) + 'Q' + r1((a.x + b2.x) / 2 + 2) + ' ' + r1((a.y + b2.y) / 2) + ' ' + P(b2); });
    S.add(ZH + 9.05, sl(ln, dk(col, 0.3), 1.8, { clip: cl, op: 0.85 }) + sf(smoothD(maskPath(c, H, [[-50, -32], [-40, -62], [-24, -66], [-30, -44]], 1, 3), true, 0.5), '#000000', { clip: cl, op: 0.15 }));
    var mu = maskPath(c, H, [[-30, -40], [-18, -29], [-6, -27], [0, -30], [6, -27], [18, -29], [30, -40], [16, -38], [0, -35], [-16, -38]], 2.5, 3);
    S.add(ZH + 9.1, sp(smoothD(mu, true, 0.45), lt(col, 0.12)));
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
        var ew = E.w || (c.off ? 15 : 9);
        var eph = E.ph || 60;
        b1 = H.pt3(th - ew, eph, -2); b2 = H.pt3(th + ew, eph, -2);
        tip = H.pt3(th + s * (E.lean == null ? 8 : E.lean), eph + 14, E.len || 58);
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
        var bu = (E.bulge || 0) * k, ux2 = T.x - mx, uy2 = T.y - my, ul = Math.hypot(ux2, uy2) || 1, nx2 = -uy2 / ul, ny2 = ux2 / ul; // bulge：葉の形にふくらませる（公式の大きな耳）
        if (nx2 * (B1.x - B2.x) + ny2 * (B1.y - B2.y) < 0) { nx2 = -nx2; ny2 = -ny2; }
        var sb = c.off ? (B2.x >= B1.x ? 1 : -1) : s; // official：左右どちらの耳も B1 側へふくらませる（ねじれない）
        d = 'M' + P(B1) + 'C' + r1(B1.x + (T.x - mx) * 0.4 - sb * 3 + nx2 * bu) + ' ' + r1(B1.y + (T.y - my) * 0.7 + ny2 * bu) + ' ' + r1(T.x - sb * 7 * k + nx2 * bu * 0.4) + ' ' + r1(T.y - 2 + ny2 * bu * 0.4) + ' ' + P(T) +
          'C' + r1(T.x + sb * 8 * k - nx2 * bu * 0.4) + ' ' + r1(T.y + 4 - ny2 * bu * 0.4) + ' ' + r1(B2.x + (T.x - mx) * 0.4 + sb * 3 - nx2 * bu) + ' ' + r1(B2.y + (T.y - my) * 0.6 - ny2 * bu) + ' ' + P(B2) + 'Z';
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
        if (c.off && kind !== 'rabbit') { var fx2 = kind === 'fox' ? 0.12 : kind === 'cat' ? 0.08 : 0; I1 = sh(B1, 0.42 + fx2); I2 = sh(B2, 0.5 + fx2); IT = sh(T, 0.32 + fx2); } // 公式：内側は小さめ（外の毛色が見える）
        S.add(z + 0.01, sf('M' + P(I1) + 'Q' + r1(lerp(I1.x, IT.x, 0.5)) + ' ' + r1(lerp(I1.y, IT.y, 0.5)) + ' ' + P(IT) + 'Q' + r1(lerp(I2.x, IT.x, 0.5)) + ' ' + r1(lerp(I2.y, IT.y, 0.5)) + ' ' + P(I2) + 'Z', E.inner || '#f3c9c9'));
        if (E.scribble) { var q1 = { x: lerp(I1.x, I2.x, 0.4), y: lerp(I1.y, I2.y, 0.4) }, q2 = { x: lerp(q1.x, IT.x, 0.55), y: lerp(q1.y, IT.y, 0.55) }; S.add(z + 0.02, sl('M' + r1(q1.x - 2.5) + ' ' + r1(q1.y - 1) + 'l3 -3l-3 -1l4 -4' + 'M' + P(q2) + 'l2.5 2', OUT, 1.8)); }
        if (E.tuft) { var tb = sh(B2, 0.2), tt = { x: lerp(tb.x, IT.x, 0.55), y: lerp(tb.y, IT.y, 0.55) }; S.add(z + 0.02, sp('M' + P(sh(B1, 0.2)) + 'Q' + r1(tt.x - s * 3) + ' ' + r1(tt.y + 6) + ' ' + P(tt) + 'Q' + r1(tt.x + s * 2) + ' ' + r1(tt.y + 8) + ' ' + P(tb) + 'Z', E.tuft, { w: 1.2 })); }
      }
    }
  }
  function drawHorns(c, H, hn, ZH) {
    var S = c.S, k = H.k;
    (hn.list || [[-30, 42], [30, 42]]).forEach(function (h) {
      var th = h[0], ph = h[1], L = h[2] || 24, wd = (h[3] || 8);
      var ln = h[4] == null ? 10 : h[4], rise = h[5] == null ? 26 : h[5]; // 外への傾きと立ち上がり（公式のアトザは外へ）
      var b = H.pt3(th, ph, (c.vol || 0) * 0.5), tp = H.pt3(th + (th >= 0 ? ln : -ln), ph + rise, L + (c.vol || 0));
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
    var hi = bd.hi == null ? (c.off ? 20 : 34) : bd.hi, lo = bd.lo == null ? (c.off ? -6 : 17) : bd.lo;
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
      var pw = bd.pw || (c.off ? 44 : 27), pc = bd.plateColor || '#8f9299';
      var pp = bd.plateShape === 'tri' ? H.shapePts([[-pw, hi + 2], [pw, hi + 2], [0, lo - 15]], dr + 1.2, 10) : H.shapePts([[-pw, lo - 1], [pw, lo - 1], [pw, hi + 1], [-pw, hi + 1]], dr + 1.2, 8); // tri：逆三角の鉢金
      if (H.center(0, 25) > -0.05) {
        S.add(ZH + 41, sp(smoothD(pp, true, 0.2), pc));
        var tl = []; for (var tt = -pw + 3; tt <= pw - 3; tt += 3) tl.push(H.pc(tt, hi - 1.5, dr + 1.4));
        S.add(ZH + 41.01, sl(openD(tl), lt(pc, 0.45), 2, { op: 0.9 }));
        var nr = bd.plate === true ? 3 : bd.plate;
        for (var i = 0; i < nr; i++) {
          var th = nr === 1 ? 0 : (i - (nr - 1) / 2) * (c.off ? (nr === 2 ? 19 : 18) : (nr === 2 ? 14 : 13));
          var f = H.feat(th, bd.plateShape === 'tri' ? (hi + lo) / 2 - 3 : (hi + lo) / 2, dr + 1.5);
          if (f.s < 0.1) continue;
          var rr = (c.off ? 5 : 3.6) * k, kx = Math.max(0.3, f.s);
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
  }
  // 公式：前髪を鉢巻の上に重ねる（鉢巻は横と結び目だけ見える）
  function drawFringe(c, H, hp, bd, ZH) {
    var S = c.S, hf = c.hairFn || hairlineFn(hp, c.def.seed || 7), vol = hp.vol == null ? 5 : hp.vol;
    var fw = bd.fringe || (hp.fw == null ? 52 : hp.fw) + 4, top = (bd.hi == null ? 20 : bd.hi) + 1.5, lo = bd.lo == null ? -6 : bd.lo;
    var low = [], up = [], th;
    for (th = -fw; th <= fw + 0.01; th += 3) low.push(H.pc(th, hf(th), vol * 0.85 + 1.2));
    for (th = fw; th >= -fw - 0.01; th -= 3) up.push(H.pc(th, top, vol * 0.8 + 2.4));
    var d = smoothD(low.concat(up), true, 0.4);
    S.add(ZH + 43, sf(d, hp.color));
    var cid = S.clip(d);
    S.add(ZH + 43.01, sl(smoothD(low, false, 0.4), OUT, LW) + sl('M' + P(H.pc(-fw, hf(-fw), vol * 0.85 + 1.2)) + 'L' + P(H.pc(-fw, top, vol * 0.8 + 2.4)) + 'M' + P(H.pc(fw, hf(fw), vol * 0.85 + 1.2)) + 'L' + P(H.pc(fw, top, vol * 0.8 + 2.4)), OUT, LW));
    if (!hp.noLines) (hp.strands || [-30, -12, 8, 26]).forEach(function (tt) {
      var a = H.pc(tt, Math.max(lo, hf(tt) + 4), vol), b2 = H.pc(tt * 0.92, top - 2, vol);
      S.add(ZH + 43.02, sl('M' + P(a) + 'L' + P(b2), dk(hp.color, 0.3), 1.6, { clip: cid, op: 0.8 }));
    });
  }
  // 鉢巻の下の縁（φ）。眉を鉢巻の下に描くかどうかに使う
  function bandLo(c) { var bd = c.def.band; return !bd ? -90 : bd.lo == null ? (c.off ? -6 : 17) : bd.lo; }

  function drawEyepatch(c, H, ep, ZH) {
    var S = c.S, k = H.k, s = ep.side, def = c.def, e = def.eyes || {};
    var exy = eyeXY(c), ex = exy.x, ey = exy.y;
    var f = H.feat(s * ex, ey);
    // ひも
    var st = []; var yaw = c.cam.yaw;
    for (var t = -90 - yaw; t <= 90 - yaw; t += 4) { var tt = wrap(t); st.push(H.p(t, ey + 6 + (-s * tt) * 0.22, 1.5)); }
    S.add(ZH + 38, sl(smoothD(st, false), '#1d1a1c', 2.4));
    if (!f.vis) return;
    var kx = Math.max(0.3, f.s);
    var er = c.off ? 1.45 : 1;
    S.add(ZH + 38.1, sp(ellD(f.x, f.y, 8 * er * k * kx, 8.6 * er * k), ep.color || '#1d1a1c', { w: 2 }));
    if (ep.crest) S.add(ZH + 38.2, flowerSvg(f.x, f.y, 4 * er * k, ep.crest, kx));
  }
  function flowerSvg(x, y, r, col, kx) {
    kx = kx || 1; var o = '';
    for (var i = 0; i < 5; i++) { var a = i * Math.PI * 2 / 5 - Math.PI / 2; o += sp(ellD(x + Math.cos(a) * r * 0.7 * kx, y + Math.sin(a) * r * 0.7, r * 0.45 * kx, r * 0.45), col, { w: 0.9 }); }
    return o + sf(ellD(x, y, r * 0.3 * kx, r * 0.3), '#f6d36b');
  }
  function drawGlasses(c, H, gl, ZH) {
    var S = c.S, k = H.k, exy = eyeXY(c), ex = exy.x, ey = exy.y, ps = [];
    var gr = (c.off ? 14 : 9.5) * k;
    for (var s = -1; s <= 1; s += 2) { var f = H.feat(s * ex, ey, 2); if (f.vis) { ps.push(f); S.add(ZH + 38, sp(ellD(f.x, f.y, gr * Math.max(0.35, f.s), gr), '#ffffff', { w: 2.4, sc: gl.color || '#1d1a1c', op: 1, extra: ' fill-opacity="0.18"' })); } }
    var gb = c.off ? gr * 0.95 : 9 * k;
    if (ps.length === 2) S.add(ZH + 38, sl('M' + r1(ps[0].x + gb * ps[0].s) + ' ' + r1(ps[0].y - 1) + 'Q' + r1((ps[0].x + ps[1].x) / 2) + ' ' + r1(ps[0].y - 4) + ' ' + r1(ps[1].x - gb * ps[1].s) + ' ' + r1(ps[1].y - 1), gl.color || '#1d1a1c', 2.2));
  }

  /* ---- 面（お面・口布） ---- */
  function drawMask(c, H, mk, ZH) {
    var S = c.S, k = H.k, kind = mk.kind, f, s;
    if (kind === 'cloth' || kind === 'scarf') {
      var top = mk.top == null ? (c.off ? -36 : -21) : mk.top;
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
    if (c.off && (kind === 'fox' || kind === 'oni')) {
      var fc0 = H.center(0, -10);
      if (fc0 > 0.42) (kind === 'fox' ? drawFoxOff : drawOniOff)(c, H, mk, ZH + 30);
      else if (fc0 > -0.25) { // 横向き：面のふちだけ（模様は描かない）
        var sideP = H.shapePts(kind === 'fox' ? [[-60, -10], [-56, 24], [-40, 40], [0, 34], [40, 40], [56, 24], [60, -10], [44, -42], [0, -58], [-44, -42]] : [[-62, -8], [-58, 22], [0, 30], [58, 22], [62, -8], [50, -40], [0, -60], [-50, -40]], 4, 6);
        S.add(ZH + 44, sp(smoothD(sideP, true, 0.5), mk.color || (kind === 'fox' ? '#f7f4f1' : '#a8323a')));
      }
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
          f = H.feat(s * 22, -6, 3);
          if (f.vis) S.add(ZH + 14.2, sl('M' + r1(f.x - 6 * f.s) + ' ' + r1(f.y + 1) + 'Q' + r1(f.x) + ' ' + r1(f.y - 6) + ' ' + r1(f.x + 6 * f.s) + ' ' + r1(f.y + 1), '#1d1a1c', 2.6));
          // 目の下の雫
          var dr0 = H.feat(s * 30, -18, 3);
          if (dr0.vis) S.add(ZH + 14.2, sf(ellD(dr0.x, dr0.y, 2 * dr0.s + 0.5, 4), mk.accent || '#27a4c9'));
        }
        // 額の雫
        f = H.feat(0, 14, 3);
        if (f.vis) S.add(ZH + 14.2, sf('M' + r1(f.x) + ' ' + r1(f.y - 12) + 'q' + r1(4 * f.s) + ' ' + r1(12) + ' ' + r1(0) + ' ' + r1(20) + 'q' + r1(-4 * f.s) + ' ' + r1(-8) + ' ' + r1(0) + ' ' + r1(-20) + 'Z', mk.accent || '#27a4c9'));
        f = H.feat(0, -36, 3);
        if (f.vis) S.add(ZH + 14.2, sl('M' + r1(f.x - 9 * f.s) + ' ' + r1(f.y - 2) + 'Q' + r1(f.x) + ' ' + r1(f.y + 6) + ' ' + r1(f.x + 9 * f.s) + ' ' + r1(f.y - 2), '#1d1a1c', 2.4) +
          sf(ellD(f.x - 9 * f.s, f.y - 2, 1.8, 1.8), '#d8303a') + sf(ellD(f.x + 9 * f.s, f.y - 2, 1.8, 1.8), '#d8303a'));
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

  // 公式の面：顔の前にかぶさる曲面（頭の楕円体より少し大きく、鼻と口がせり出す）の上の点。x・y は半径50の頭の座標
  function maskPt(c, H, x, y, dz, snout) {
    var h = H.h, sx = h.rx / 50, sy = h.ry / 50;
    var zs = h.rz * Math.sqrt(Math.max(0.02, 1 - (x / 53) * (x / 53) - (y / 58) * (y / 58)));
    zs += (snout == null ? 7 : snout) * Math.exp(-(x * x + (y + 32) * (y + 32)) / 420);
    return c.cam.p(h.x + x * sx, h.y + y * sy, h.z + zs + (dz || 0));
  }
  function maskPath(c, H, pts, dz, snout) { return pts.map(function (q) { return maskPt(c, H, q[0], q[1], (q[2] || 0) + (dz || 0), snout); }); }
  function mirrorL(L, bottom) { // 上のまん中 → 左の縁 → 下（bottom）→ 右の縁 → 上へ戻る、の左右対称の輪郭
    var R = L.slice(1).reverse().map(function (q) { return [-q[0], q[1], q[2]]; });
    return L.concat(bottom ? [bottom] : [], R);
  }
  function strokeOn(c, H, pts, ws, col, dz) { // 面の上の筆の線（太さ ws）
    var sc = maskPath(c, H, pts, dz), xs = interp(sc.map(function (q) { return q.x; }), 9), ys = interp(sc.map(function (q) { return q.y; }), 9);
    return sf(smoothD(brushPts(xs.map(function (x, i) { return { x: x, y: ys[i] }; }), interp(ws, 9)), true, 0.6), col);
  }
  // 公式の狐面（狐白）：赤い耳の内側、閉じた切れ長の目、額の青い筋と小さな模様、黒い口と赤い口角
  function drawFoxOff(c, H, mk, ZH) {
    var S = c.S, col = mk.color || '#f7f4f1', acc = mk.accent || '#2aa7c7';
    var out = mirrorL([[0, 30], [-14, 33], [-33, 57, -6], [-35, 56, -6], [-50, 27], [-54, 4], [-49, -20], [-36, -40], [-16, -52]], [0, -55]);
    var od = smoothD(maskPath(c, H, out), true, 0.35);
    S.add(ZH + 14, sp(od, col));
    var mc = S.clip(od);
    S.add(ZH + 14.01, sf(smoothD(maskPath(c, H, [[-52, -6], [-42, -36], [-18, -52], [-4, -50], [-26, -34], [-40, -12]]), true, 0.5), '#cfc9cf', { clip: mc, op: 0.55 }));
    for (var s = -1; s <= 1; s += 2) {
      var ear = maskPath(c, H, [[s * 18, 36], [s * 32, 52, -6], [s * 45, 30]]);
      S.add(ZH + 14.02, sp(smoothD(ear, true, 0.15), mk.ear || '#d0182c', { w: 0 }));
      S.add(ZH + 14.03, strokeOn(c, H, [[s * 36, -6], [s * 28, -9], [s * 20, -12], [s * 12, -15]], [1.2, 4.2, 4.6, 1.6], '#1d1a1c', 1));
      // 小さな模様（眉の位置）
      S.add(ZH + 14.03, strokeOn(c, H, [[s * 14, 10], [s * 16, 5], [s * 18, 1], [s * 21, -2]], [0.6, 2.6, 3, 1], acc, 1) +
        strokeOn(c, H, [[s * 26, 15], [s * 27, 12], [s * 28, 9], [s * 29, 7]], [0.6, 2.2, 2.4, 0.8], acc, 1) + strokeOn(c, H, [[s * 37, 18], [s * 38, 15], [s * 39, 12], [s * 40, 10]], [0.5, 2, 2.2, 0.8], acc, 1));
      var nos = maskPt(c, H, s * 5, -31, 1.2);
      S.add(ZH + 14.04, sf(ellD(nos.x, nos.y, 1.6, 1.2), '#1d1a1c'));
    }
    S.add(ZH + 14.03, strokeOn(c, H, [[0, 25], [1, 10], [-1, -6], [2, -26]], [4.2, 3.4, 2.4, 0.8], acc, 1));
    // 口：黒い三日月と赤い口角
    var m1 = maskPath(c, H, [[-38, -31], [-16, -35], [0, -36], [16, -35], [38, -31]], 1), m2 = maskPath(c, H, [[38, -31], [22, -46], [0, -50], [-22, -46], [-38, -31]], 1);
    S.add(ZH + 14.05, sp(smoothD(m1.concat(m2), true, 0.4), '#1d1a1c', { w: 1.2 }));
    for (s = -1; s <= 1; s += 2) { var mcn = maskPt(c, H, s * 35, -33, 1.4); S.add(ZH + 14.06, sf(ellD(mcn.x, mcn.y, 3.2, 2.6), '#d0182c')); }
  }
  // 公式の鬼の面（金鬼）：しわの寄った太い眉、黄色い目に赤い瞳、大きな鼻、牙の出た黒い口
  function drawOniOff(c, H, mk, ZH) {
    var S = c.S, col = mk.color || '#a8323a', dkc = dk(col, 0.28);
    var out = mirrorL([[0, 24], [-26, 22], [-46, 12], [-54, -8], [-50, -30], [-36, -48], [-16, -56]], [0, -57]);
    var od = smoothD(maskPath(c, H, out, 0, 4), true, 0.45);
    S.add(ZH + 14, sp(od, col));
    var mc = S.clip(od);
    S.add(ZH + 14.01, sf(smoothD(maskPath(c, H, [[-54, -8], [-48, -34], [-26, -52], [-10, -54], [-30, -38], [-44, -16]], 0, 4), true, 0.5), '#000000', { clip: mc, op: 0.16 }));
    for (var s = -1; s <= 1; s += 2) {
      // 眉（逆八の字に盛り上がる）
      var br = maskPath(c, H, [[s * 40, 2], [s * 24, -2], [s * 8, -12], [s * 10, -6], [s * 26, 6], [s * 42, 8]], 2, 4);
      S.add(ZH + 14.02, sp(smoothD(br, true, 0.3), dkc, { w: 1.6 }));
      // 目
      var ec = maskPt(c, H, s * 21, -16, 2, 4), ek = Math.max(0.45, Math.cos((s * 21 / 50 + Math.sin(c.yaw * D2R)) * 1.2));
      S.add(ZH + 14.03, sp(ellD(ec.x, ec.y, 8 * ek, 8), '#e8c98e', { w: 2 }) + sf(ellD(ec.x, ec.y, 2.6 * ek, 2.6), '#e8141c') + sf(ellD(ec.x - 1, ec.y - 1, 1, 1), '#ffd0d0'));
      // 牙
      var tk = maskPt(c, H, s * 25, -40, 3, 4);
      S.add(ZH + 14.06, sp('M' + r1(tk.x - 2.6) + ' ' + r1(tk.y + 1) + 'L' + r1(tk.x + s * 1.5) + ' ' + r1(tk.y - 10) + 'L' + r1(tk.x + 3) + ' ' + r1(tk.y + 1) + 'Z', '#e9e6dc', { w: 1.3 }));
    }
    // 眉間のしわ
    var w0 = maskPt(c, H, -3, 0, 2, 4), w1 = maskPt(c, H, 3, 0, 2, 4);
    S.add(ZH + 14.025, sl('M' + r1(w0.x) + ' ' + r1(w0.y - 6) + 'l0.8 9M' + r1(w1.x) + ' ' + r1(w1.y - 6) + 'l-0.8 9M' + r1((w0.x + w1.x) / 2) + ' ' + r1(w0.y - 8) + 'l0 7', dk(col, 0.5), 1.6));
    // 鼻
    var ns = maskPath(c, H, [[-11, -24], [-6, -20], [0, -19], [6, -20], [11, -24], [7, -30], [0, -31], [-7, -30]], 3, 4);
    S.add(ZH + 14.04, sp(smoothD(ns, true, 0.6), dk(col, 0.12), { w: 1.6 }));
    // 口
    var m1 = maskPath(c, H, [[-30, -38], [-12, -41], [0, -41], [12, -41], [30, -38]], 2, 4), m2 = maskPath(c, H, [[30, -38], [16, -48], [0, -50], [-16, -48], [-30, -38]], 2, 4);
    S.add(ZH + 14.05, sp(smoothD(m1.concat(m2), true, 0.4), '#1d1416', { w: 1.6 }));
    var t0 = maskPath(c, H, [[-14, -48], [-8, -49], [-2, -50], [4, -50], [10, -49], [16, -47]], 2.4, 4), td = '';
    for (var i = 0; i < t0.length - 1; i++) td += 'M' + P(t0[i]) + 'L' + r1((t0[i].x + t0[i + 1].x) / 2) + ' ' + r1(t0[i].y - 3.4) + 'L' + P(t0[i + 1]) + 'Z';
    S.add(ZH + 14.055, sf(td, '#e9e6dc'));
  }

  /* ---- 動物の顔 ---- */
  function drawAnimalFace(c, H, hd, ZH) {
    var S = c.S, k = H.k, kind = hd.kind, s, f;
    var light = hd.fur2 || '#f4f0e8';
    if (kind === 'dog' && c.off) { // 公式の柴：目のすぐ下から白いほお（ふちが波打つ）、黒い鼻、ω の口と舌、白い眉の点
      var lfo = function (th) { var a = Math.abs(th); return -21 + 3.2 * Math.sin(th * 0.2) - Math.max(0, a - 40) * 0.12; };
      if (!c.back) S.add(ZH + 2, sf(smoothD(H.lowPts(lfo, 0.5), true, 0.5), light, { clip: c.headClip }));
      if (!c.back) S.add(ZH + 2.05, sf(smoothD(H.lowPts(function (th) { return -30 - Math.abs(th) * 0.3; }, 0.6), true, 0.5), '#e7dfd0', { clip: c.headClip, op: 0.6 }));
      for (s = -1; s <= 1; s += 2) { f = H.feat(s * 20, -4, 0.5); if (f.vis) S.add(ZH + 2.1, sf(ellD(f.x, f.y, 4.6 * Math.max(0.4, f.s), 3), light)); }
      if (H.center(0, -26) > -0.5 && !c.back) {
        var nz = H.feat(0, -27, 3);
        S.add(ZH + 8.1, sp('M' + r1(nz.x - 6 * k) + ' ' + r1(nz.y - 2.5) + 'Q' + r1(nz.x) + ' ' + r1(nz.y - 5.5) + ' ' + r1(nz.x + 6 * k) + ' ' + r1(nz.y - 2.5) + 'Q' + r1(nz.x + 4 * k) + ' ' + r1(nz.y + 4.5) + ' ' + r1(nz.x) + ' ' + r1(nz.y + 4.5) + 'Q' + r1(nz.x - 4 * k) + ' ' + r1(nz.y + 4.5) + ' ' + r1(nz.x - 6 * k) + ' ' + r1(nz.y - 2.5) + 'Z', '#1d1614', { w: 1 }) + sf(ellD(nz.x - 2 * k, nz.y - 2, 1.6, 1), '#6a5a56'));
        drawSnoutMouth(c, H.feat(0, -37, 3), k, 'dog');
      }
    } else if (kind === 'dog') {
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
    } else if (kind === 'cat' && c.off) { // 公式の猫：上のぶち、ふさふさのほお、小さな鼻と ω の口、黒いひげ
      (hd.patches || []).forEach(function (pc) { S.add(ZH + 1.5, sf(smoothD(H.shapePts(pc.poly, 0.4, 5), true, 0.7), pc.color, { clip: c.headClip })); });
      for (s = -1; s <= 1; s += 2) { // ほおの毛（輪郭の外へとがる房）
        var tuf = '';
        for (var ph2 = -14; ph2 >= -50; ph2 -= 12) { var t0 = c.cam.pv(H.pt3(s * 88 - c.yaw, ph2 + 5, -1)), t1 = c.cam.pv(H.pt3(s * 96 - c.yaw, ph2 - 3, 9)), t2 = c.cam.pv(H.pt3(s * 86 - c.yaw, ph2 - 8, -1)); tuf += 'M' + P(t0) + 'L' + P(t1) + 'L' + P(t2) + 'Z'; }
        if (!c.back) S.add(ZH + 0.9, sp(tuf, hd.fur || c.skin, { w: 2.2 }));
      }
      if (H.center(0, -22) > -0.5 && !c.back) {
        var nf2 = H.feat(0, -36, 2);
        S.add(ZH + 8.1, sp('M' + r1(nf2.x - 4 * k) + ' ' + r1(nf2.y - 2) + 'L' + r1(nf2.x + 4 * k) + ' ' + r1(nf2.y - 2) + 'L' + r1(nf2.x) + ' ' + r1(nf2.y + 2.6) + 'Z', '#b06a64', { w: 1.2 }));
        drawSnoutMouth(c, H.feat(0, -42, 2), k, 'cat');
        for (s = -1; s <= 1; s += 2) { f = H.feat(s * 34, -38, 2); if (f.vis) for (var j2 = -1; j2 <= 1; j2++) S.add(ZH + 8.2, sl('M' + r1(f.x) + ' ' + r1(f.y + j2 * 3.4) + 'l' + r1(s * 16 * Math.max(0.4, f.s)) + ' ' + r1(j2 * 2.6), '#2a1e1a', 1.4)); }
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
    if (c.off) return drawGorillaOff(c, H, hd, ZH);
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
  // 公式のゴリラ（コンガ）：明るい灰色の顔、太い眉の張り出し、白目の半目、大きな鼻、歯を見せたにやり顔
  function drawGorillaOff(c, H, hd, ZH) {
    var S = c.S, k = H.k, s, f, fc = hd.face || '#8e8e92', fur = hd.fur || '#3a3a3f';
    if (H.center(0, -14) < -0.2) return;
    var face = maskPath(c, H, mirrorL([[0, 4], [-18, 8], [-34, 2], [-42, -16], [-40, -38], [-26, -56]], [0, -62]), 0.5, 5);
    S.add(ZH + 2, sp(smoothD(face, true, 0.5), fc, { w: 2.2 }));
    var fcl = S.clip(smoothD(face, true, 0.5));
    S.add(ZH + 2.05, sf(smoothD(maskPath(c, H, [[-50, -16], [-44, -42], [-26, -58], [-8, -60], [-30, -40], [-42, -18]], 0.6, 5), true, 0.5), '#000000', { clip: fcl, op: 0.16 }));
    // 眉の張り出し
    S.add(ZH + 3, sp(smoothD(maskPath(c, H, mirrorL([[0, -1], [-14, 2], [-30, 1], [-44, -4], [-44, -10], [-30, -6], [-14, -6]], [0, -6]), 1.5, 5), true, 0.45), fur, { w: 2 }));
    for (s = -1; s <= 1; s += 2) {
      var e0 = maskPt(c, H, s * 21, -13, 1.2, 5), kx = Math.max(0.4, Math.cos((s * 21 / 50 + Math.sin(c.yaw * D2R)) * 1.1));
      if (c.expr === 'happy') { S.add(ZH + 6, sl('M' + r1(e0.x - 6 * kx) + ' ' + r1(e0.y + 1) + 'Q' + r1(e0.x) + ' ' + r1(e0.y - 6) + ' ' + r1(e0.x + 6 * kx) + ' ' + r1(e0.y + 1), EYE_DARK, 3)); continue; }
      S.add(ZH + 6, sp(ellD(e0.x, e0.y + 1, 7 * kx, 5.4), '#f2efe8', { w: 1.6 }) + sf(ellD(e0.x + s * 0.6, e0.y + 3, 2.4 * kx, 2.4), EYE_DARK) +
        sl('M' + r1(e0.x - 7.5 * kx) + ' ' + r1(e0.y - 0.5 + s * 1) + 'L' + r1(e0.x + 7.5 * kx) + ' ' + r1(e0.y - 0.5 - s * 1), EYE_DARK, 3.2));
    }
    var nz = maskPath(c, H, [[-12, -22], [-6, -18], [0, -19], [6, -18], [12, -22], [9, -29], [0, -30], [-9, -29]], 2.5, 5);
    S.add(ZH + 6, sp(smoothD(nz, true, 0.6), dk(fc, 0.1), { w: 1.6 }));
    for (s = -1; s <= 1; s += 2) { var nn = maskPt(c, H, s * 5, -26, 3.2, 5); S.add(ZH + 6.1, sf(ellD(nn.x, nn.y, 2.2, 1.5), '#2a2a2e')); }
    if (c.expr === 'surprised') { var mp2 = maskPt(c, H, 2, -42, 2.5, 5); S.add(ZH + 6, sp(ellD(mp2.x, mp2.y, 6, 6), '#4a2a28', { w: 1.8 })); return; }
    var m1 = maskPath(c, H, [[-20, -39], [-6, -40], [8, -39], [24, -33]], 2.4, 5), m2 = maskPath(c, H, [[24, -33], [18, -44], [4, -47], [-12, -45], [-20, -39]], 2.4, 5);
    S.add(ZH + 6.2, sp(smoothD(m1.concat(m2), true, 0.4), '#f3f1ea', { w: 2 }));
    var tl = maskPath(c, H, [[-16, -42], [-4, -43], [8, -42], [20, -37]], 2.6, 5);
    S.add(ZH + 6.25, sl(smoothD(tl, false), '#8a8a8e', 1.2) + sl('M' + P(maskPt(c, H, -6, -40, 2.6, 5)) + 'L' + P(maskPt(c, H, -6, -45, 2.6, 5)) + 'M' + P(maskPt(c, H, 6, -39, 2.6, 5)) + 'L' + P(maskPt(c, H, 6, -44, 2.6, 5)), '#8a8a8e', 1.1));
  }
  function drawChickFace(c, H, hd, ZH) {
    var S = c.S, k = H.k, s, f;
    if (H.center(0, -10) < -0.3) return;
    for (s = -1; s <= 1; s += 2) {
      f = H.feat(s * (c.off ? 34 : 26), c.off ? -22 : -18, 1); if (!f.vis || (c.tp && !c.off)) continue; // cool はほおの赤みなし
      S.add(ZH + 3, sf(ellD(f.x + s * 3 * f.s, f.y + 3, 6.5 * Math.max(0.35, f.s), 4), hd.cheek || '#f5a04a', { op: 0.75 }));
    }
    var bk = c.off ? H.feat(0, -26, 3) : H.pl(0, -16, 52), expr = c.expr;
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
    if (c.off) return drawHatOff(c, H, hat, ZH);
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
  // 公式の笠（風太）：まるい編み笠。ひさしは眉の高さまで、正面に赤い紋、わらの短い筋
  function drawHatOff(c, H, hat, ZH) {
    var S = c.S, k = H.k, col = hat.color || '#8c6748', R = hat.r || 80, y0 = hat.y0 == null ? -4 : hat.y0, Ht = hat.h || 58, pts = [], i, t;
    for (i = 0; i < 48; i++) for (t = 0; t <= 90; t += 10) { var a = i / 48 * Math.PI * 2, ct = Math.cos(t * D2R); pts.push(c.cam.pv(H.local(Math.sin(a) * R * ct, y0 + Ht * Math.sin(t * D2R) - (1 - ct) * 0 , Math.cos(a) * R * ct))); }
    var dd = smoothD(hull(pts), true, 0.3);
    S.add(ZH + 50, sp(dd, col));
    var hid = S.clip(dd);
    // ふちの影と、上の明るいところ
    var rim = []; for (i = 0; i <= 48; i++) { var a2 = i / 48 * Math.PI * 2; rim.push(c.cam.pv(H.local(Math.sin(a2) * R * 0.97, y0 + 9, Math.cos(a2) * R * 0.97))); }
    S.add(ZH + 50.05, sf(polyD(rim.concat([c.cam.pv(H.local(R * 1.2, y0 - 30, 0)), c.cam.pv(H.local(-R * 1.2, y0 - 30, 0))])), '#000000', { clip: hid, op: 0.22 }));
    var tp = c.cam.pv(H.local(-R * 0.25, y0 + Ht * 0.86, R * 0.25));
    S.add(ZH + 50.06, sf(ellD(tp.x, tp.y, R * 0.42 * k, Ht * 0.22 * k), lt(col, 0.18), { clip: hid, op: 0.7 }));
    // わらの筋
    var st = '', sd = 7;
    for (i = 0; i < 26; i++) {
      sd = (sd * 37 + 11) % 101; var aa = (sd / 101) * 160 - 80, hh = ((sd * 7) % 89) / 89;
      var q0 = H.local(Math.sin(aa * D2R) * R * Math.cos(hh * 1.2), y0 + 6 + Ht * 0.85 * hh, Math.cos(aa * D2R) * R * Math.cos(hh * 1.2)), Q0 = c.cam.pv(q0);
      if (Q0.z - H.cd < -4) continue;
      st += 'M' + P(Q0) + 'l' + r1(3 + (sd % 3)) + ' ' + r1(1.2 - (sd % 2) * 2.4);
    }
    S.add(ZH + 50.1, sl(st, dk(col, 0.55), 1.6, { clip: hid, op: 0.8 }));
    if (hat.crest && !c.back) { // 赤い紋（渦）
      var cp = c.cam.pv(H.local(4, y0 + Ht * 0.62, R * 0.72)), cr = 9 * k;
      S.add(ZH + 50.2, sl('M' + r1(cp.x - cr) + ' ' + r1(cp.y) + 'q' + r1(cr * 0.2) + ' ' + r1(-cr) + ' ' + r1(cr) + ' ' + r1(-cr * 0.6) + 'q' + r1(cr * 0.9) + ' ' + r1(cr * 0.4) + ' ' + r1(cr * 0.3) + ' ' + r1(cr * 1.1) + 'q' + r1(-cr * 0.7) + ' ' + r1(cr * 0.4) + ' ' + r1(-cr * 1.2) + ' ' + r1(-cr * 0.3) + 'M' + r1(cp.x - cr * 1.6) + ' ' + r1(cp.y + cr * 0.9) + 'l' + r1(cr * 3.2) + ' ' + r1(-cr * 0.1), hat.crest, 3.4));
    }
    var fr = []; for (i = 0; i <= 48; i++) { var a3 = i / 48 * Math.PI * 2; var q = c.cam.pv(H.local(Math.sin(a3) * R, y0, Math.cos(a3) * R)); if (Math.cos(a3 + c.yaw * D2R) > -0.1) fr.push(q); }
    return fr;
  }
  function drawCrown(c, H, cr, ZH) {
    var S = c.S, k = H.k, gold = cr.color || '#e2b93b';
    if (H.center(0, 38) < -0.3) return;
    var poly = [[-40, 18], [40, 18], [42, 34], [30, 44], [20, 40], [10, 54], [0, 46], [-10, 54], [-20, 40], [-30, 44], [-42, 34]];
    if (c.off) poly = [[-64, 12], [-30, 8], [0, 6], [30, 8], [64, 12], [66, 26], [50, 34], [40, 42], [26, 40], [16, 54], [0, 62], [-16, 54], [-26, 40], [-40, 42], [-50, 34], [-66, 26]]; // 公式：横に広く飾りの多い冠
    var pts = H.shapePts(poly, (c.vol || 4) + 3, 4);
    S.add(ZH + 45, sp(smoothD(pts, true, 0.4), gold));
    if (c.off) {
      var ccl = S.clip(smoothD(pts, true, 0.4)), sw2 = '';
      [[-46, 22], [-24, 26], [24, 26], [46, 22], [0, 40]].forEach(function (q) { var f0 = H.pc(q[0] - 7, q[1] - 4, (c.vol || 4) + 3.5), f1 = H.pc(q[0], q[1] + 4, (c.vol || 4) + 3.5), f2 = H.pc(q[0] + 7, q[1] - 2, (c.vol || 4) + 3.5); sw2 += 'M' + P(f0) + 'Q' + P(f1) + ' ' + P(f2); });
      S.add(ZH + 45.05, sl(sw2, dk(gold, 0.4), 1.6, { clip: ccl }) + sf(smoothD(H.shapePts([[-64, 12], [64, 12], [64, 18], [-64, 18]], (c.vol || 4) + 3.4, 6), true, 0.3), lt(gold, 0.35), { clip: ccl, op: 0.7 }));
    }
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
    var b = c.off ? H.pt3(40, 58, 2) : H.pt3(24, 64, 2), t = c.off ? H.pt3(56, 62, 46) : H.pt3(10, 88, 42);
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
    var z = (P2.z - H.cd) < -12 || (rb.behind && !c.back) ? ZH - 6 : ZH + 49;
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
      if (c.off) { b = H.pt3(10 + f[0] * 0.5, 80, -1); t = H.local(12 + f[0] * 0.7 + f[1] * 0.8, 62 + (i === 1 ? 10 : 6), 4 + f[1] * 0.2); } // 公式：小さな3枚の羽
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
    var T;
    if (c.off) { // 公式：箱形の胴（肩から帯までほぼ同じ幅）、裾で広がる
      hem = tl === 'long' ? 4 : (tl === 'mid' ? 32 : (top.hem ? c.Y(top.hem) : b.hem));
      hem = Math.max(hem, 3 - R.bob);
      var pfo = b.prof, flo = flare * 0.8, profo = [];
      for (var qo = 0; qo < pfo.length - 1; qo++) if (pfo[qo][0] > hem + 2) profo.push(pfo[qo].slice());
      var rho = profAt(pfo, hem);
      profo.push([hem, rho[0] + flo, rho[1] + flo * 0.6]);
      T = new Trunk(cam, { x: 0, z: 0, y0: b.sy + 1, y1: hem, rx0: b.srx, rz0: b.srz, rx1: rho[0] + flo, rz1: rho[1] + flo * 0.6, prof: profo });
    } else if (c.tp) { // 肩・胸・腰（くびれ）・裾の輪切り
      hem = tl === 'long' ? 5 : (tl === 'mid' ? 48 : (top.hem ? c.Y(top.hem) : b.hem));
      hem = Math.max(hem, 3 - R.bob); // しゃがんだときは裾が地面の上に
      var pf = b.prof, fl = flare * 0.8, prof = pf.slice(0, 3).map(function (q) { return q.slice(); });
      if (hem < pf[3][0] - 1) { prof.push([pf[3][0], pf[3][1] + fl * 0.5, pf[3][2] + fl * 0.3]); prof.push([hem, pf[3][1] + 6 + fl, pf[3][2] + 4 + fl * 0.6]); }
      else prof.push([hem, pf[3][1] + fl, pf[3][2] + fl * 0.6]);
      var last = prof[prof.length - 1];
      T = new Trunk(cam, { x: 0, z: 0, y0: b.sy + 1, y1: hem, rx0: b.srx, rz0: b.srz, rx1: last[1], rz1: last[2], prof: prof });
    } else T = new Trunk(cam, { x: 0, z: 0, y0: b.sy + 1, y1: hem, rx0: b.srx, rz0: b.srz, rx1: b.hrx + flare + (tl === 'long' ? 6 : 0), rz1: b.hrz + flare * 0.6 + (tl === 'long' ? 4 : 0) });
    c.T = T;

    // 脚と足
    if (c.tp) drawLegsCool(c, bot); else drawLegs(c, bot);
    // 背中の物（刀など）: 奥
    drawBackItems(c);
    // 胴
    var sil = T.silPts();
    var silD = smoothD(sil, true, 0.35);
    S.add(Z.TORSO, sp(silD, top.color));
    var tclip = S.clip(silD);
    c.torsoClip = tclip;
    if (c.tp) drawNeck(c, top);
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

  // 首（cool）。頭巾・口布・立ち襟の色でおおう。あごの下に影
  function drawNeck(c, top) {
    var def = c.def, b = c.b, cam = c.cam, S = c.S;
    var col = c.skin;
    if (def.head && def.head.kind && def.head.kind !== 'human') col = def.head.fur || c.skin;
    if (def.hood) col = def.hood.color;
    if (def.mask && (def.mask.kind === 'cloth' || def.mask.kind === 'scarf')) col = def.mask.color;
    if (top.collar === 'high') col = top.trim || '#eeeeee';
    var nb = cam.p(0, b.sy - 3, -1), nt = cam.p(0, b.headY - 9, -1.5);
    S.add(Z.TORSO + 0.45, sp(capsD(nb, nt, b.neck, b.neck * 0.92), col));
    if (col === c.skin) S.add(Z.TORSO + 0.46, sf(ellD(nt.x, nt.y + 2.5, b.neck * 1.05, 3), dk(col, 0.28), { op: 0.55 }));
  }

  function torsoDeco(c, T, top, hem) {
    var def = c.def, b = c.b, cam = c.cam, o = '', th0 = T.front(), a0 = th0 - 100, a1 = th0 + 100, u = c.u;
    var obi = def.obi || { color: '#232327', knot: 'buckle' };
    var oy0 = b.obi[0], oy1 = b.obi[1];
    // 陰（体の奥側）
    var shade = []; var sdir = Math.sin(c.yaw * D2R) >= 0 ? 1 : -1;
    for (var y = b.sy + 2; y >= hem - 2; y -= 4) shade.push(T.p(th0 + 70, y, 0.5));
    for (y = hem - 2; y <= b.sy + 2; y += 4) shade.push(T.p(th0 + 110, y, 1));
    // 胸の色・裾の色（巫女の緋袴風スカートなど）
    if (top.chest) { var cb1 = T.arc(b.sy + 3, 1, th0 - 100, th0 + 100, 5), cb2 = T.arc(oy1, 1, th0 - 100, th0 + 100, 5).reverse(); o += sf(polyD(cb1.concat(cb2)), top.chest); }
    if (top.lower) { var lb1 = T.arc(oy0 + 1, 1, th0 - 100, th0 + 100, 5), lb2 = T.arc(hem - 3, 1, th0 - 100, th0 + 100, 5).reverse(); o += sf(polyD(lb1.concat(lb2)), top.lower); }
    o += sf(polyD(shade), '#000000', { op: c.off ? 0.15 : c.tp ? 0.17 : 0.12 });
    if (c.off) { // 公式：胸の上に明るいつや、帯の上（おなか）に影
      var hl = T.p(th0 - 28, b.sy - 9, 0.5);
      o += sf(ellD(hl.x, hl.y, 13 * u, 5.5 * u), lt(top.color, 0.22), { op: 0.55 });
      var bl1 = T.arc(oy1 + 9 * u, 0.4, th0 - 90, th0 + 90, 6), bl2 = T.arc(oy1, 0.4, th0 - 90, th0 + 90, 6).reverse();
      for (var bq = 0; bq < bl1.length; bq++) bl1[bq].y += 3.5 * Math.sin(Math.PI * bq / (bl1.length - 1));
      o += sf(smoothD(bl1.concat(bl2), true, 0.4), '#000000', { op: 0.14 });
    }
    // 素肌の胴（孫市）：胸と腹の筋
    if (c.tp && def.skin && String(top.color).toLowerCase() === String(def.skin).toLowerCase() && T.vis(0, b.sy - 20) > 0.1) {
      var mcol = dk(def.skin, 0.32), yc = b.sy - 17;
      for (var ms = -1; ms <= 1; ms += 2) o += sl('M' + P(T.p(ms * 6, yc + 1, 0.4)) + 'Q' + P(T.p(ms * 30, yc - 3, 0.4)) + ' ' + P(T.p(ms * 52, yc + 6, 0.4)), mcol, 1.6);
      o += sl('M' + P(T.p(0, yc + 2, 0.4)) + 'L' + P(T.p(0, oy1 + 2, 0.4)), mcol, 1.3, { op: 0.8 });
      for (var ab = 0; ab < 2; ab++) { var ya = lerp(yc - 3, oy1 + 3, 0.35 + ab * 0.3); o += sl('M' + P(T.p(-14, ya, 0.4)) + 'Q' + P(T.p(0, ya - 1.2, 0.4)) + ' ' + P(T.p(14, ya, 0.4)), mcol, 1.2, { op: 0.7 }); }
    }
    // 模様
    if (top.pattern) o += torsoPattern(c, T, top, hem);
    if (top.lines) { for (var ls = -1; ls <= 1; ls += 2) { if (T.vis(ls * 44, 70) > -0.05) o += sl('M' + P(T.p(ls * 30, b.sy + 1, 0.6)) + 'L' + P(T.p(ls * 46, oy1, 0.6)) + 'M' + P(T.p(ls * 46, oy0, 0.6)) + 'L' + P(T.p(ls * 52, hem + 1, 0.6)), top.lines, 2.2); } }
    if (top.suspenders) {
      for (var ss = -1; ss <= 1; ss += 2) {
        var sv0 = T.vis(ss * 16, 80); if (sv0 < 0.05) continue;
        var s0 = T.p(ss * 18, b.sy + 1, 0.9), s1 = T.p(ss * 15, oy1, 0.9);
        o += sl('M' + P(s0) + 'L' + P(s1), OUT, 9 * u) + sl('M' + P(s0) + 'L' + P(s1), top.suspenders, 6.6 * u) + sl('M' + P(s0) + 'L' + P(s1), top.suspenderEdge || '#d8b04a', 1.2);
        for (var pi = 0; pi < 2; pi++) { var pq = T.p(ss * lerp(18, 15, 0.3 + pi * 0.4), lerp(b.sy, oy1, 0.3 + pi * 0.4), 2); o += sp(ellD(pq.x, pq.y, 4.6 * u * Math.min(1, Math.max(0.45, sv0 * 1.3)), 4.6 * u), '#f4f1ea', { w: 1.6 }); }
      }
    }
    // 網目（胸元）
    var collar = top.collar || 'cross';
    var fvis = T.vis(0, b.sy) > -0.05;
    if (collar === 'cross' && fvis && c.off) {
      o += collarOff(c, T, top, oy1);
      if (top.emblem) o += emblemSvg(c, T, top.emblem);
    } else if (collar === 'cross' && fvis) {
      var ytop = b.sy + 1, ycross = c.tp ? b.sy - 27 : oy1 + 1;
      var V = [T.p(-24, ytop, 0.3), T.p(24, ytop, 0.3), T.p(-3, ycross, 0.3)];
      o += sf(polyD(V), top.inner || dk(top.color, 0.3));
      if (top.mesh) {
        var mz = ''; for (var i = -4; i <= 4; i++) { mz += 'M' + P(T.p(-24 + i * 6, ytop, 0.5)) + 'L' + P(T.p(-8 + i * 6, ycross, 0.5)) + 'M' + P(T.p(24 + i * 6, ytop, 0.5)) + 'L' + P(T.p(8 + i * 6, ycross, 0.5)); }
        o += '<g clip-path="url(#' + c.S.clip(polyD(V)) + ')">' + sl(mz, lt(top.inner || '#333', 0.35), 1) + '</g>';
      }
      var tw = (top.trimW || 5) * u;
      o += sl('M' + P(T.p(-24, ytop, 0.6)) + 'L' + P(T.p(4, ycross - 6 * u, 0.6)), OUT, tw + 2.4 * u) + sl('M' + P(T.p(-24, ytop, 0.6)) + 'L' + P(T.p(4, ycross - 6 * u, 0.6)), top.trim || dk(top.color, 0.45), tw);
      o += sl('M' + P(T.p(26, ytop, 0.8)) + 'L' + P(T.p(-12, ycross, 0.8)), OUT, tw + 2.4 * u) + sl('M' + P(T.p(26, ytop, 0.8)) + 'L' + P(T.p(-12, ycross, 0.8)), top.trim || dk(top.color, 0.45), tw);
      if (top.emblem) o += emblemSvg(c, T, top.emblem);
    } else if (collar === 'high' && fvis && c.off) {
      highCollarOff(c, top);
    } else if (collar === 'high' && fvis) {
      o += sp(polyD([T.p(-26, b.sy + 1, 0.5), T.p(26, b.sy + 1, 0.5), T.p(20, b.sy - 8 * u, 0.5), T.p(0, b.sy - 16 * u, 0.5), T.p(-20, b.sy - 8 * u, 0.5)]), top.trim || '#eeeeee', { w: 2 });
    } else if (collar === 'round' && fvis) {
      o += sl(smoothD(T.arc(b.sy - 3 * u, 0.6, -26, 26, 6), false), top.trim || dk(top.color, 0.4), 3 * u);
    }
    if (collar !== 'cross' && top.emblem && fvis) o += emblemSvg(c, T, top.emblem);
    if (top.flameChest) o += flameChest(c, T, top, oy1);
    // たすき（斜め掛け）
    if (top.tasuki && !(c.off && lum(top.tasuki) < 0.3)) {
      var tp = [], bp = [];
      for (var ut = 0; ut <= 1.001; ut += 0.1) {
        tp.push(T.p(lerp(60, -52, ut), lerp(b.sy + 1, oy1, ut), 0.9));
        bp.push(T.p(lerp(-128, -242, ut), lerp(oy1, b.sy + 1, ut), 0.9));
      }
      var dF = smoothD(tp, false), dB = smoothD(bp, false);
      var tw2 = (top.tasukiW || 6) * u;
      if (T.vis(0, 70) > -0.3) o += sl(dF, OUT, tw2 + 2.6 * u) + sl(dF, top.tasuki, tw2);
      if (T.vis(180, 70) > -0.3) o += sl(dB, OUT, tw2 + 2.6 * u) + sl(dB, top.tasuki, tw2);
    }
    // 帯
    if (obi.color !== 'none') {
      var ot = T.arc(oy1, 1.2, th0 - 95, th0 + 95, 5), ob = T.arc(oy0, 1.2, th0 - 95, th0 + 95, 5).reverse();
      o += sp(smoothD(ot.concat(ob), true, 0.3), obi.color, { w: 2.4 });
      if (obi.stripe) { var st = T.arc((oy0 + oy1) / 2, 1.4, th0 - 95, th0 + 95, 5); o += sl(smoothD(st, false), obi.stripe, 3 * u); }
      if (obi.cord) { var cd = T.arc((oy0 + oy1) / 2, 1.6, th0 - 95, th0 + 95, 5); o += sl(smoothD(cd, false), OUT, 4.8 * u) + sl(smoothD(cd, false), obi.cord, 2.6 * u); }
      if (obi.studs) { for (var th = -80; th <= 80; th += 20) { var sv = T.vis(th, oy0); if (sv < 0.1) continue; var sp0 = T.p(th, (oy0 + oy1) / 2, 1.6); o += sp(ellD(sp0.x, sp0.y, 2.4 * u * Math.min(1, Math.max(0.4, sv * 1.5)), 2.4 * u), obi.studs, { w: 1.2 }); } }
      if (obi.plates) { for (var tp2 = -60; tp2 <= 60; tp2 += 30) { var pv = T.vis(tp2, oy0); if (pv < 0.1) continue; var pp = T.p(tp2, (oy0 + oy1) / 2, 1.6); var pk = Math.min(1, Math.max(0.4, pv * 1.5)) * u; o += sp('M' + r1(pp.x - 4 * pk) + ' ' + r1(pp.y - 4 * u) + 'L' + r1(pp.x + 4 * pk) + ' ' + r1(pp.y - 4 * u) + 'L' + r1(pp.x + 4 * pk) + ' ' + r1(pp.y + 2 * u) + 'L' + r1(pp.x) + ' ' + r1(pp.y + 5 * u) + 'L' + r1(pp.x - 4 * pk) + ' ' + r1(pp.y + 2 * u) + 'Z', obi.plates, { w: 1.3 }); } }
      if (c.off && obi.knot !== 'none' && obi.knot !== 'spider' && obi.knot !== 'ribbon' && T.vis(0, oy0) > 0.004) o += obiKnotOff(c, T, obi, oy0, oy1);
      // 結び目
      var kv = c.off && obi.knot !== 'ribbon' ? -1 : T.vis(0, oy0);
      var kp = T.p(0, (oy0 + oy1) / 2, 1.6), kk = Math.min(1, Math.max(0.35, kv * 1.35)) * u;
      if (kv > 0.05) {
        if (obi.knot === 'bow' || obi.knot === 'ribbon') o += bowSvg(kp.x, kp.y, 1.05 * kk, obi.knotColor || obi.color, 'long');
        else if (obi.knot === 'buckle') o += sp('M' + r1(kp.x) + ' ' + r1(kp.y) + 'L' + r1(kp.x - 9 * kk) + ' ' + r1(kp.y - 6 * u) + 'L' + r1(kp.x - 9 * kk) + ' ' + r1(kp.y + 6 * u) + 'Z', obi.knotColor || '#8f9299', { w: 1.8 }) + sp('M' + r1(kp.x) + ' ' + r1(kp.y) + 'L' + r1(kp.x + 9 * kk) + ' ' + r1(kp.y - 6 * u) + 'L' + r1(kp.x + 9 * kk) + ' ' + r1(kp.y + 6 * u) + 'Z', obi.knotColor || '#8f9299', { w: 1.8 }) + sp(ellD(kp.x, kp.y, 3.4 * kk, 3.4 * u), lt(obi.knotColor || '#8f9299', 0.2), { w: 1.6 });
        else if (obi.knot === 'knot') o += sp(ellD(kp.x, kp.y, 5 * kk, 5 * u), obi.knotColor || dk(obi.color, 0.1), { w: 1.8 }) + sp('M' + r1(kp.x - 2 * u) + ' ' + r1(kp.y + 3 * u) + 'L' + r1(kp.x - 5 * kk) + ' ' + r1(kp.y + 13 * u) + 'L' + r1(kp.x + 1 * u) + ' ' + r1(kp.y + 11 * u) + 'Z', obi.knotColor || dk(obi.color, 0.1), { w: 1.6 });
      }
      if (c.back && (obi.knot === 'bow' || obi.knot === 'ribbon') && !def.over) {
        var bk = T.p(180, (oy0 + oy1) / 2, 2);
        o += bowSvg(bk.x, bk.y, 1.1 * u, obi.knotColor || obi.color, 'long');
      }
    }
    if (obi.chain) { for (var ch = -90; ch <= 90; ch += 11) { var cv = T.vis(ch, oy0); if (cv < 0.05) continue; var cp0 = T.p(ch, (oy0 + oy1) / 2 + ((ch / 11) % 2 ? 1.5 : -1.5) * u, 2.2); var ck = Math.min(1, Math.max(0.4, cv * 1.3)) * u; o += sp(ellD(cp0.x, cp0.y, 4.2 * ck, 2.6 * u), obi.chain, { w: 1.4 }) + sf(ellD(cp0.x, cp0.y, 2 * ck, 0.9 * u), OUT); } }
    if (obi.knot === 'spider' && T.vis(0, oy0) > 0.1) { var spc = T.p(0, (oy0 + oy1) / 2 + 2, 2), spk = Math.min(1, Math.max(0.4, T.vis(0, oy0) * 1.3)), leg = ''; for (var li = -1; li <= 1; li += 2) for (var lj = 0; lj < 4; lj++) { var ay = -6 + lj * 4; leg += 'M' + r1(spc.x + li * 3 * spk) + ' ' + r1(spc.y + ay * 0.5) + 'q' + r1(li * 8 * spk) + ' ' + r1(-6 + lj * 2) + ' ' + r1(li * 13 * spk) + ' ' + r1(ay + 2 + lj * 1.5); } o += sl(leg, '#1a1618', 2) + sf(ellD(spc.x, spc.y + 3, 5 * spk, 6), '#1a1618') + sf(ellD(spc.x, spc.y - 4, 3.6 * spk, 3.4), '#1a1618'); }
    if (top.necklace) {
      var nk = []; for (var nt = -46; nt <= 46; nt += 4) { var nv = T.vis(nt, b.sy); nk.push(T.p(nt, b.sy - 4 - 7 * Math.cos(nt * D2R * 1.6), 1.6)); }
      if (T.vis(0, b.sy) > 0.05) { o += sl(smoothD(nk, false), dk(top.necklace, 0.4), 3.4 * u) + sl(smoothD(nk, false), top.necklace, 2 * u); var pd = T.p(0, b.sy - 13 * (c.tp ? 1.2 : 1), 2); o += sp(ellD(pd.x, pd.y, 3.2 * u, 4.4 * u), top.necklace, { w: 1.4 }); if (top.beads) for (var bb = -1; bb <= 1; bb++) { var bq = T.p(bb * 14, b.sy - (9 - Math.abs(bb) * 2) * (c.tp ? 1.2 : 1), 2); o += sp(ellD(bq.x, bq.y, 3.4 * u, 3.4 * u), top.necklace, { w: 1.3 }); } }
    }
    if (top.cord && T.vis(0, oy1) > 0.1) { var cq = T.p(-4, oy1 + 6 * u, 1.4); o += sl('M' + r1(cq.x - 6 * u) + ' ' + r1(cq.y - 4 * u) + 'L' + r1(cq.x + 6 * u) + ' ' + r1(cq.y + 1 * u), top.cord, 2.4 * u) + bowSvg(cq.x, cq.y, 0.55 * u, top.cord, 'long'); }
    // 裾の縁
    if (top.hemTrim) { var hp1 = T.arc(hem + 5 * u, 0.8, th0 - 95, th0 + 95, 5), hp2 = T.arc(hem, 0.8, th0 - 95, th0 + 95, 5).reverse(); o += sf(polyD(hp1.concat(hp2)), top.hemTrim); }
    if (top.hemLine !== false && c.def.bottom && c.def.bottom.kind === 'skirt') {
      // スカートのひだ
      for (var pl = -60; pl <= 60; pl += 30) { var pv2 = T.vis(pl, hem); if (pv2 < 0.1) continue; o += sl('M' + P(T.p(pl, oy0 - 2, 0.5)) + 'L' + P(T.p(pl * 1.08, hem + 1, 0.5)), dk(top.color, 0.3), 1.4, { op: 0.6 }); }
    }
    return o;
  }

  // 公式の着物の襟：V の内側（肌や鎖かたびら）、上前の襟（向かって右の首元 → V の底 → 向かって左の帯）と下前の襟
  function collarOff(c, T, top, oy1) {
    var b = c.b, u = c.u, def = c.def, o = '';
    var yN = b.sy - 1, yV = b.sy - 13.5 * u / 0.9;
    var hk = def.head && def.head.kind;
    var vee = top.vee || (top.mesh ? '#1c1c20' : (hk && hk !== 'human' ? (def.head.fur || c.skin) : c.skin));
    var path = function (a, z) {
      var pts = [];
      for (var i = 0; i < a.length - 1; i++) for (var j = 0; j < 6; j++) { var t = j / 6; pts.push(T.p(lerp(a[i][0], a[i + 1][0], t), lerp(a[i][1], a[i + 1][1], t), z)); }
      var L = a[a.length - 1]; pts.push(T.p(L[0], L[1], z)); return pts;
    };
    var NL = [-46, yN], NR = [46, yN], VB = [-3, yV], OB = [-68, oy1 + 0.5];
    var V = path([NL, VB, NR], 0.3).concat(T.arc(yN + 3, 0.3, -46, 46, 8).reverse());
    o += sf(polyD(V), vee);
    if (top.mesh) { // 鎖かたびらの網目
      var mz = '', c0 = T.p(0, yV, 0.4), mw = 30 * u;
      for (var i = -7; i <= 7; i++) mz += 'M' + r1(c0.x + i * 5 * u - mw) + ' ' + r1(c0.y - mw) + 'l' + r1(2 * mw) + ' ' + r1(2 * mw) + 'M' + r1(c0.x + i * 5 * u + mw) + ' ' + r1(c0.y - mw) + 'l' + r1(-2 * mw) + ' ' + r1(2 * mw);
      o += '<g clip-path="url(#' + c.S.clip(polyD(V)) + ')">' + sl(mz, top.meshColor || '#8e8c88', 1.2) + '</g>';
    } else if (vee === c.skin) o += sf(polyD(T.arc(yN + 3, 0.3, -46, 46, 8).concat(T.arc(yN - 5, 0.3, 46, -46, 8))), dk(vee, 0.3), { op: 0.35 });
    var under = smoothD(path([NL, VB], 0.6), false), over = smoothD(path([NR, VB, OB], 0.6), false);
    var trim = top.trimOff || top.trim, tw = (top.trimW || 4.2) * u;
    if (trim && lum(trim) > 0.3 && !top.plainLapel) { // 色のついた襟（金など）
      o += sl(under, OUT, tw + 2.8 * u) + sl(under, trim, tw);
      o += sl(over, OUT, tw + 2.8 * u) + sl(over, trim, tw);
    } else {
      o += sl(under, OUT, 3.6 * u) + sl(over, OUT, 3.6 * u);
    }
    return o;
  }
  // 公式の立ち襟（石舟斎）：首のうしろから両ほおの横へ立ち上がる白い襟（外へ折り返す）
  function highCollarOff(c, top) {
    var S = c.S, cam = c.cam, b = c.b, col = top.trim || '#eeeeee', o = '';
    for (var s = -1; s <= 1; s += 2) {
      var p = [cam.p(s * 4, b.sy - 6, 11), cam.p(s * 13, b.sy + 1, 9), cam.p(s * 25, b.sy + 15, 4), cam.p(s * 32, b.sy + 19, -2), cam.p(s * 22, b.sy + 7, -8), cam.p(s * 9, b.sy - 2, 4)];
      o += sp(smoothD(p, true, 0.3), col, { w: 2.2 });
      o += sl('M' + P(p[1]) + 'L' + P(p[3]), dk(col, 0.25), 1.4, { op: 0.8 });
    }
    S.add(Z.OVER + 6.5, o);
  }
  // 公式の帯の結び目：まん中の四角と、下へ垂れる2本の先（folded なら折り返しの線）
  function obiKnotOff(c, T, obi, oy0, oy1) {
    var u = c.u, o = '', kc = obi.knotColor || lt(obi.color, 0.12), cv = clamp(Math.cos(c.yaw * D2R) * 1.05, 0.35, 1);
    var m = T.p(2, (oy0 + oy1) / 2, 1.6), hh = (oy1 - oy0) / 2 + 0.6 * u, kw = 3.2 * u * cv;
    var tail = function (sd) {
      var x0 = m.x + sd * kw * 0.3, x1 = m.x + sd * (kw + 6 * u * cv), yt = m.y + hh * 0.35;
      var b0 = { x: m.x + sd * (kw + 0.8 * u) * cv, y: m.y + hh + 7.5 * u }, b1 = { x: m.x + sd * (kw + 7.4 * u * cv), y: m.y + hh + 4.5 * u };
      var d = 'M' + r1(x0) + ' ' + r1(yt) + 'L' + r1(x1) + ' ' + r1(yt - 0.4 * u) + 'L' + P(b1) + 'L' + P(b0) + 'Z';
      var t = sp(d, kc, { w: 2.2 });
      if (obi.folded) t += sl('M' + r1(lerp(x0, x1, 0.65)) + ' ' + r1(yt + 2.2 * u) + 'l' + r1(-sd * 2.6 * u) + ' 0l' + r1(sd * 1.2 * u) + ' ' + r1(3.4 * u) + 'l' + r1(sd * 2.4 * u) + ' 0', OUT, 1.6);
      return t;
    };
    o += tail(-1) + tail(1);
    o += sp('M' + r1(m.x - kw) + ' ' + r1(m.y - hh) + 'L' + r1(m.x + kw) + ' ' + r1(m.y - hh) + 'L' + r1(m.x + kw) + ' ' + r1(m.y + hh) + 'L' + r1(m.x - kw) + ' ' + r1(m.y + hh) + 'Z', kc, { w: 2.2 });
    return o;
  }
  function emblemSvg(c, T, em) {
    var th = em.th == null ? -14 : em.th, y = em.y ? c.Y(em.y) : (c.b.sy - (c.tp ? 20 : 14)), v = T.vis(th, y);
    if (v < 0.1) return '';
    var p = T.p(th, y, 1), k = Math.min(1, Math.max(0.35, v * 1.4)), r = (em.r || 5) * c.u, col = em.color || '#e0b23c';
    if (em.kind === 'cross') return sp('M' + r1(p.x - r * k) + ' ' + r1(p.y - 1.4) + 'h' + r1(2 * r * k) + 'v2.8h' + r1(-2 * r * k) + 'Z', col, { w: 1 }) + sp('M' + r1(p.x - 1.4 * k) + ' ' + r1(p.y - r) + 'h' + r1(2.8 * k) + 'v' + r1(2 * r) + 'h' + r1(-2.8 * k) + 'Z', col, { w: 1 });
    if (em.kind === 'star') { var s = []; for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 - Math.PI / 4, rr = i % 2 ? r * 0.35 : r; s.push({ x: p.x + Math.cos(a) * rr * k, y: p.y + Math.sin(a) * rr }); } return sp(polyD(s), col, { w: 1.2 }); }
    if (em.kind === 'diamond') return sp('M' + r1(p.x) + ' ' + r1(p.y - r) + 'l' + r1(r * 0.7 * k) + ' ' + r1(r) + 'l' + r1(-r * 0.7 * k) + ' ' + r1(r) + 'l' + r1(-r * 0.7 * k) + ' ' + r1(-r) + 'Z', col, { w: 1.2 });
    if (em.kind === 'circle') return sp(ellD(p.x, p.y, r * k, r), col, { w: 1.4 }) + sp(ellD(p.x, p.y, r * 0.5 * k, r * 0.5), em.inner || OUT, { w: 1 });
    if (em.kind === 'rabbit') return sp('M' + r1(p.x - 3 * k) + ' ' + r1(p.y + 4) + 'q' + r1(-1 * k) + ' ' + r1(-9) + ' ' + r1(1 * k) + ' ' + r1(-11) + 'q' + r1(1.5 * k) + ' ' + r1(3) + ' ' + r1(1 * k) + ' ' + r1(8) + 'q' + r1(2 * k) + ' ' + r1(-9) + ' ' + r1(4 * k) + ' ' + r1(-8) + 'q' + r1(0.5 * k) + ' ' + r1(5) + ' ' + r1(-1 * k) + ' ' + r1(9) + 'q' + r1(2 * k) + ' ' + r1(3) + ' ' + r1(-2 * k) + ' ' + r1(4) + 'Z', col, { w: 1 });
    return '';
  }

  function flameChest(c, T, top, oy1) {
    var o = '', col = top.flameChest, b = c.b, u = c.u;
    for (var i = 0; i < 5; i++) {
      var th = -60 + i * 30, v = T.vis(th, oy1 + 8); if (v < 0.05) continue;
      var p = T.p(th, oy1 + 3, 0.6), k = Math.min(1, Math.max(0.4, v * 1.3)) * u, q = c.tp ? 1.25 : 1;
      o += sf('M' + r1(p.x - 6 * k) + ' ' + r1(p.y) + 'Q' + r1(p.x - 5 * k) + ' ' + r1(p.y - 10 * q) + ' ' + r1(p.x - 1 * k) + ' ' + r1(p.y - (18 + (i % 2) * 5) * q) + 'Q' + r1(p.x + 1 * k) + ' ' + r1(p.y - 8 * q) + ' ' + r1(p.x + 3 * k) + ' ' + r1(p.y - 12 * q) + 'Q' + r1(p.x + 7 * k) + ' ' + r1(p.y - 5 * q) + ' ' + r1(p.x + 6 * k) + ' ' + r1(p.y) + 'Z', col, { op: 0.95 });
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
    if (kind === 'flames') { // すそから立ちのぼる炎（羽織）
      for (th = -100; th <= 100; th += 25) {
        v = T.vis(th, hem + 10); if (v < 0.02) continue;
        p = T.p(th, hem + 1, 0.7); k = Math.min(1, Math.max(0.35, v * 1.3)) * c.u;
        var fh2 = (pt.h || 26) * c.u * (0.8 + 0.4 * ((th / 25) % 2 ? 1 : 0));
        o += sf('M' + r1(p.x - 9 * k) + ' ' + r1(p.y) + 'Q' + r1(p.x - 8 * k) + ' ' + r1(p.y - fh2 * 0.5) + ' ' + r1(p.x - 2 * k) + ' ' + r1(p.y - fh2) + 'Q' + r1(p.x) + ' ' + r1(p.y - fh2 * 0.45) + ' ' + r1(p.x + 4 * k) + ' ' + r1(p.y - fh2 * 0.7) + 'Q' + r1(p.x + 9 * k) + ' ' + r1(p.y - fh2 * 0.3) + ' ' + r1(p.x + 9 * k) + ' ' + r1(p.y) + 'Z', col);
      }
      return o;
    }
    var spots = pt.spots || [[-40, 0.3], [30, 0.2], [-10, 0.55], [50, 0.62], [-60, 0.75], [15, 0.85], [-30, 0.95]];
    spots.forEach(function (s) {
      th = s[0]; y = lerp(b.sy, hem, s[1]); v = T.vis(th, y); if (v < 0.12) return;
      p = T.p(th, y, 0.8); k = Math.min(1, Math.max(0.35, v * 1.4)) * c.u;
      var U = c.u;
      if (kind === 'sakura') o += sakuraSvg(p.x, p.y, (pt.r || 5.5) * U, col);
      else if (kind === 'dots') o += sf(ellD(p.x, p.y, (pt.r || 1.8) * k, (pt.r || 1.8) * U), col);
      else if (kind === 'maple') o += mapleSvg(p.x, p.y, (pt.r || 6) * U, col, k / U);
      else if (kind === 'blood') o += sf(ellD(p.x, p.y, (pt.r || 3) * k * (0.6 + (s[0] % 3) * 0.2), (pt.r || 3) * 0.8 * U), col, { op: 0.85 });
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
    var S = c.S, b = c.b, cam = c.cam, u = c.u;
    var H2 = c.tp ? new Trunk(cam, { x: 0, z: 0, y0: b.obi[0] + 2, y1: Math.max(5, 3 - c.R.bob), rx0: b.prof[3][1] + 1.6, rz0: b.prof[3][2] + 1.4, rx1: bot.kind === 'longskirt' ? 28 : 26, rz1: 19 })
      : new Trunk(cam, { x: 0, z: 0, y0: b.obi[0] + 2, y1: 8, rx0: b.hrx - 3, rz0: b.hrz - 3, rx1: bot.kind === 'longskirt' ? 34 : 32, rz1: 24 });
    var sil = H2.silPts();
    S.add(Z.TORSO + 0.3, sp(smoothD(sil, true, 0.35), bot.color));
    var cl = S.clip(smoothD(sil, true, 0.35));
    var o = '';
    var th0 = H2.front();
    var yb = c.tp ? Math.max(6, 4 - c.R.bob) : 9, ysplit = c.tp ? b.legTop - 12 : 32;
    for (var th = -60; th <= 60; th += 20) { var v = H2.vis(th, 30); if (v < 0.1) continue; o += sl('M' + P(H2.p(th, b.obi[0], 0.4)) + 'L' + P(H2.p(th * 1.15, yb, 0.4)), dk(bot.color, 0.35), 1.6, { op: 0.7 }); }
    if (bot.kind === 'hakama' && H2.vis(0, 20) > 0.1) o += sl('M' + P(H2.p(0, ysplit, 0.5)) + 'L' + P(H2.p(0, yb - 1, 0.5)), OUT, 2.4);
    if (bot.bow) { var kp = H2.p(0, b.obi[0] - 2, 2), kv = H2.vis(0, b.obi[0]); if (kv > 0.1) o += bowSvg(kp.x, kp.y + 4 * u, 1.25 * u, bot.bow, 'long'); }
    // 陰
    var sh = []; for (var y = b.obi[0]; y >= yb - 1; y -= 6) sh.push(H2.p(th0 + 70, y, 0.5)); for (y = yb - 1; y <= b.obi[0]; y += 6) sh.push(H2.p(th0 + 115, y, 0.5));
    o += sf(polyD(sh), '#000', { op: 0.12 });
    S.add(Z.TORSO + 0.31, g(o, cl));
    // 帯を上に重ねる（上衣の裾が袴の中）
    if (bot.bow) { var kp2 = H2.p(0, b.obi[0] - 2, 2), kv2 = H2.vis(0, b.obi[0]); if (kv2 > 0.1) S.add(Z.TORSO + 0.6, bowSvg(kp2.x, kp2.y + 4 * u, 1.25 * u, bot.bow, 'long')); }
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
  // cool の脚：もも（腰→ひざ）とすね（ひざ→足首）を1本の筆の形で。t は 0=腰、0.5=ひざ、1=足首
  function drawLegsCool(c, bot) {
    var S = c.S, b = c.b, cam = c.cam, def = c.def, R = c.R;
    var legs = def.legs || {}, feet = def.feet || { kind: 'sandal' };
    var hideLegs = (def.top && def.top.len === 'long') || bot.kind === 'hakama' || bot.kind === 'longskirt';
    var skin = legs.skin || (def.head && def.head.kind === 'chick' ? '#f39a2a' : c.skin);
    for (var k = 0; k < 2; k++) {
      var s = k ? 1 : -1, L = R.legs[s];
      var P0 = cam.pv(L.hip), K = cam.pv(L.K), A = cam.pv(L.A);
      var dep = cam.p(L.A[0], 0, L.A[2]).z;
      var zL = Z.LEG + dep * 0.01;
      var f = legs.w ? legs.w / 17 : 1;
      var W4 = [b.thigh[0] * f, b.thigh[1] * f, b.shin[0] * f, b.shin[1] * f];
      var at = function (t) { return t <= 0.5 ? { x: lerp(P0.x, K.x, t * 2), y: lerp(P0.y, K.y, t * 2) } : { x: lerp(K.x, A.x, (t - 0.5) * 2), y: lerp(K.y, A.y, (t - 0.5) * 2) }; };
      var wd = function (t, add) { return (t <= 0.5 ? lerp(W4[0], W4[1], t * 2) : lerp(W4[2], W4[3], (t - 0.5) * 2)) + (add || 0); };
      var seg = function (t0, t1, add, add1) { // t0〜t1 の区間の形
        var sp2 = [], ws = [], n = 9, i, t;
        for (i = 0; i < n; i++) { t = lerp(t0, t1, i / (n - 1)); if (t0 < 0.5 && t1 > 0.5 && Math.abs(t - 0.5) < 0.5 / n) t = 0.5; sp2.push(at(t)); ws.push(wd(t, lerp(add || 0, add1 == null ? (add || 0) : add1, i / (n - 1)))); }
        return smoothD(brushPts(sp2, ws), true, 0.55);
      };
      var shade = function (d, t0, t1, add) { // 影側（向かって右）に帯状の影
        var cid = S.clip(d), sp2 = [], ws = [], n = 9;
        for (var i = 0; i < n; i++) { var t = lerp(t0, t1, i / (n - 1)), p = at(t), w = wd(t, add || 0); sp2.push({ x: p.x + w * 0.36, y: p.y }); ws.push(w * 0.5); }
        return sf(smoothD(brushPts(sp2, ws), true, 0.55), '#000000', { op: 0.16, clip: cid });
      };
      if (!hideLegs) {
        if (bot.kind === 'pants') {
          var pd = seg(0, 1, 2.6, 1);
          S.add(zL, sp(pd, bot.color));
          S.add(zL + 0.0005, shade(pd, 0, 1, 2.6));
          if (bot.wrap) { // 脚絆
            S.add(zL + 0.002, sp(seg(0.64, 1, 1.4, 1.2), bot.wrap));
            var w1 = at(0.74), w2 = at(0.86), ww = wd(0.8) / 2 + 0.6;
            S.add(zL + 0.003, sl('M' + r1(w1.x - ww) + ' ' + r1(w1.y + 1) + 'L' + r1(w1.x + ww) + ' ' + r1(w1.y + 3) + 'M' + r1(w2.x - ww) + ' ' + r1(w2.y + 1) + 'L' + r1(w2.x + ww) + ' ' + r1(w2.y + 3), lt(bot.wrap, 0.25), 1.3));
          }
        } else if (bot.kind === 'shorts') {
          var ld = seg(0, 1);
          S.add(zL, sp(ld, legs.color || skin));
          S.add(zL + 0.0005, shade(ld, 0, 1));
          S.add(zL + 0.001, sp(seg(0, 0.3, 2.4, 2.8), bot.color));
        } else { // skirt / none：素足か靴下
          var ld2 = seg(0, 1);
          S.add(zL, sp(ld2, skin));
          if (!legs.color) S.add(zL + 0.0005, shade(ld2, 0, 1));
          if (legs.color) {
            var st = legs.top == null ? 0.45 : legs.top, sd2 = seg(st, 1, 0.6);
            S.add(zL + 0.001, sp(sd2, legs.color));
            S.add(zL + 0.0012, shade(sd2, st, 1, 0.6));
            if (legs.dash) { var d0 = at(st + 0.04), d1 = at(0.97); S.add(zL + 0.002, sl('M' + P(d0) + 'L' + P(at(0.5)) + 'L' + P(d1), legs.dash, 1.6, { dash: '3 3' })); }
            if (legs.band) { var bp = at(st + 0.01), bw2 = wd(st) / 2 + 1; S.add(zL + 0.002, sl('M' + r1(bp.x - bw2) + ' ' + r1(bp.y + 1) + 'L' + r1(bp.x + bw2) + ' ' + r1(bp.y + 1.6), legs.band, 2.4)); }
          }
        }
        if (feet.kind === 'boot') S.add(zL + 0.004, sp(seg(0.78, 1, 1.2, 1), feet.color || '#26232a')); // 長い足袋ぐつ
      }
      drawFoot(c, L, s, feet, zL + 0.5);
    }
  }
  function drawFoot(c, L, s, ft, z) {
    var S = c.S, cam = c.cam, A = L.A, u = c.u;
    var fs = c.tp ? c.b.foot : [9.5, 12.5, 6];
    var ctr = c.tp ? cam.p(A[0], Math.max(3, A[1] - 3.4), A[2] + 4) : cam.p(A[0], Math.max(4, A[1] - 5), A[2] + 3);
    var rx = cam.ex(fs[0], fs[1]), ry = fs[2];
    var kind = ft.kind || 'sandal';
    if (kind === 'bird') {
      var o = '';
      var dir = Math.sin(c.yaw * D2R);
      for (var i = -1; i <= 1; i++) o += sl('M' + r1(ctr.x) + ' ' + r1(ctr.y - 2 * u) + 'l' + r1((i * 7 * Math.cos(c.yaw * D2R) + dir * 8) * u) + ' ' + r1(5 * u), OUT, 6 * u) + sl('M' + r1(ctr.x) + ' ' + r1(ctr.y - 2 * u) + 'l' + r1((i * 7 * Math.cos(c.yaw * D2R) + dir * 8) * u) + ' ' + r1(5 * u), ft.color || '#f39a2a', 3.4 * u);
      S.add(z, o); return;
    }
    if (kind === 'geta') {
      S.add(z, sp('M' + r1(ctr.x - rx) + ' ' + r1(ctr.y + 1 * u) + 'L' + r1(ctr.x + rx) + ' ' + r1(ctr.y + 1 * u) + 'L' + r1(ctr.x + rx) + ' ' + r1(ctr.y + 5 * u) + 'L' + r1(ctr.x - rx) + ' ' + r1(ctr.y + 5 * u) + 'Z', ft.sole || '#2a2226', { w: 2 }) +
        sp(ellD(ctr.x, ctr.y - 1.5 * u, rx * 0.86, 5 * u), ft.color || '#f4f0e8', { w: 2.2 }) + sl('M' + r1(ctr.x - 3 * u) + ' ' + r1(ctr.y - 4 * u) + 'L' + r1(ctr.x) + ' ' + r1(ctr.y - 1 * u) + 'L' + r1(ctr.x + 3 * u) + ' ' + r1(ctr.y - 4 * u), ft.strap || '#c8302c', 2));
      if (ft.tall) S.add(z - 0.01, sp('M' + r1(ctr.x - rx * 0.8) + ' ' + r1(ctr.y + 4 * u) + 'L' + r1(ctr.x + rx * 0.8) + ' ' + r1(ctr.y + 4 * u) + 'L' + r1(ctr.x + rx * 0.7) + ' ' + r1(ctr.y + 10 * u) + 'L' + r1(ctr.x - rx * 0.7) + ' ' + r1(ctr.y + 10 * u) + 'Z', ft.sole || '#2a2226', { w: 2 }) + sl('M' + r1(ctr.x - rx * 0.75) + ' ' + r1(ctr.y + 5.5 * u) + 'L' + r1(ctr.x + rx * 0.75) + ' ' + r1(ctr.y + 5.5 * u), ft.trim || '#d8a63a', 1.5));
      return;
    }
    var col = ft.color || (kind === 'bare' ? c.skin : '#26232a');
    var sole = ft.sole || '#8a5a36';
    var d = ellD(ctr.x, ctr.y, rx, ry);
    S.add(z, sp(d, col));
    var cl = S.clip(d);
    if (kind !== 'bare' && kind !== 'paw') S.add(z + 0.01, g(sf('M' + r1(ctr.x - rx - 2) + ' ' + r1(ctr.y + 2) + 'L' + r1(ctr.x + rx + 2) + ' ' + r1(ctr.y + 2) + 'L' + r1(ctr.x + rx + 2) + ' ' + r1(ctr.y + ry + 2) + 'L' + r1(ctr.x - rx - 2) + ' ' + r1(ctr.y + ry + 2) + 'Z', sole), cl));
    if (ft.toe) S.add(z + 0.02, g(sf(ellD(ctr.x + Math.sin(c.yaw * D2R) * rx * 0.6, ctr.y - 0.5 * u, rx * 0.45, 3.5 * u), ft.toe), cl));
    if (kind === 'sandal' && ft.strap) S.add(z + 0.02, sl('M' + r1(ctr.x - 3 * u) + ' ' + r1(ctr.y - 3.5 * u) + 'L' + r1(ctr.x) + ' ' + r1(ctr.y) + 'L' + r1(ctr.x + 3 * u) + ' ' + r1(ctr.y - 3.5 * u), ft.strap, 1.8));
    if (kind === 'paw') S.add(z + 0.02, sl('M' + r1(ctr.x - 3 * u) + ' ' + r1(ctr.y + 1) + 'l0 4M' + r1(ctr.x + 3 * u) + ' ' + r1(ctr.y + 1) + 'l0 4', OUT, 1.3));
  }

  /* ---- 腕・手 ---- */
  function drawArms(c) {
    if (c.off) return drawArmsOff(c);
    var def = c.def, S = c.S, cam = c.cam, R = c.R, b = c.b;
    var top = def.top || {}, sl2 = def.sleeves || { kind: 'short' }, arm = def.arms || {};
    var u = c.u;
    for (var k = 0; k < 2; k++) {
      var s = k ? 1 : -1, A = R.arms[s];
      var Sp = cam.pv(A.S), E = cam.pv(A.E), Hh = cam.pv(A.H);
      var dep = Sp.z;
      var zA = dep < -4 ? Z.FARARM : Z.ARM + dep * 0.01;
      if (c.back) zA = dep < -4 ? Z.FARARM : Z.ARM + 1;
      // cool：顔の前・横に上げた手は頭より手前に描く
      var zF = zA;
      if (c.tp && !c.back && A.H[1] > b.sy - 2 && Hh.z > cam.p(0, b.headY, 0).z - 2) zF = Z.HEAD + 70 + dep * 0.01;
      var kind = sl2.kind || 'short';
      if (sl2.one && sl2.one !== s) kind = 'none';
      var sleeveCol = sl2.color || (def.over && def.over.sleeves !== false ? def.over.color : top.color);
      var armCol = arm.color || c.skin;
      // 前腕
      var fStart = kind === 'none' ? Sp : E;
      if (kind === 'none') S.add(zA, sp(capsD(Sp, E, (c.tp ? b.upper : b.armW) / 2 + 0.5, b.armW / 2), armCol));
      var fad = capsD(E, Hh, b.armW / 2, b.armW / 2 - 0.5 * u);
      S.add(zF + 0.001, sp(fad, armCol));
      if (c.tp) S.add(zF + 0.0012, sf(capsD({ x: E.x + b.armW * 0.25, y: E.y }, { x: Hh.x + b.armW * 0.22, y: Hh.y }, b.armW * 0.28, b.armW * 0.25), '#000000', { op: 0.15, clip: S.clip(fad) }));
      if (arm.guard && (!arm.guardSide || arm.guardSide === s)) {
        var g0 = { x: lerp(E.x, Hh.x, 0.15), y: lerp(E.y, Hh.y, 0.15) }, g1 = { x: lerp(E.x, Hh.x, 0.8), y: lerp(E.y, Hh.y, 0.8) };
        S.add(zF + 0.002, sp(capsD(g0, g1, b.armW / 2 + 1.2 * u, b.armW / 2 + 0.8 * u), arm.guard));
        S.add(zF + 0.003, sl('M' + P(g0) + 'L' + P(g1), lt(arm.guard, 0.35), 1.6, { op: 0.8 }));
        if (arm.spikes) { var mx = (g0.x + g1.x) / 2, my = (g0.y + g1.y) / 2; S.add(zF + 0.004, sp('M' + r1(mx - s * 4 * u) + ' ' + r1(my - 3 * u) + 'l' + r1(s * 12 * u) + ' ' + r1(-2 * u) + 'l' + r1(-s * 10 * u) + ' ' + r1(7 * u) + 'Z', '#b7bbc2', { w: 1.4 })); }
      }
      if (arm.glove && arm.glove.side === s) { // 鷹匠の革手袋
        var gs = { x: lerp(E.x, Hh.x, 0.3), y: lerp(E.y, Hh.y, 0.3) };
        S.add(zF + 0.0025, sp(capsD(gs, Hh, b.armW / 2 + 2 * u, b.armW / 2 + 1.5 * u), arm.glove.color));
        if (arm.glove.tassel) S.add(zF + 0.0026, sl('M' + P(gs) + 'l' + r1(-s * 3 * u) + ' ' + r1(10 * u), '#26386b', 1.4) + sp(ellD(gs.x - s * 3 * u, gs.y + 11 * u, 2.6 * u, 2.6 * u), arm.glove.tassel, { w: 1.1 }) + sl('M' + r1(gs.x - s * 3 * u) + ' ' + r1(gs.y + 13 * u) + 'l' + r1(-s * 1) + ' ' + r1(8 * u), '#6a3a8a', 2.2));
      }
      if (arm.bandage) { for (var bi = 0; bi < 3; bi++) { var bp = { x: lerp(E.x, Hh.x, 0.3 + bi * 0.18), y: lerp(E.y, Hh.y, 0.3 + bi * 0.18) }; S.add(zF + 0.003, sl('M' + r1(bp.x - 5 * u) + ' ' + r1(bp.y - 1 * u) + 'L' + r1(bp.x + 5 * u) + ' ' + r1(bp.y + 1.5 * u), '#f4f1ea', 3.2 * u)); } }
      if (arm.beads) { var bpp = { x: lerp(E.x, Hh.x, 0.82), y: lerp(E.y, Hh.y, 0.82) }; for (var bj = -2; bj <= 2; bj++) S.add(zF + 0.004, sp(ellD(bpp.x + bj * 2.6 * u, bpp.y + Math.abs(bj) * 0.8 * u, 2.3 * u, 2.3 * u), arm.beads, { w: 1 })); }
      // 袖
      if (kind === 'short' || kind === 'long' || kind === 'wide') {
        var send = { x: lerp(Sp.x, E.x, kind === 'short' ? 1.05 : 1.15), y: lerp(Sp.y, E.y, kind === 'short' ? 1.05 : 1.15) };
        var w0 = c.tp ? b.upper * 0.56 : 9, w1 = c.tp ? b.upper * (kind === 'short' ? 0.66 : 1.02) : (kind === 'short' ? 11.5 : 14);
        var sd = capsD(Sp, send, w0, w1);
        S.add(zA + 0.01, sp(sd, sleeveCol));
        if (c.tp) S.add(zA + 0.0105, sf(capsD({ x: Sp.x + w0 * 0.5, y: Sp.y + 1 }, { x: send.x + w1 * 0.5, y: send.y }, w0 * 0.55, w1 * 0.55), '#000000', { op: 0.15, clip: S.clip(sd) }));
        if (kind === 'long' || kind === 'wide') { // 振袖のたもと
          var hw = 13 * u, hh = c.tp ? (kind === 'long' ? 36 : 17) : (kind === 'long' ? 22 : 12);
          var hang = { x: send.x + s * 2 * u, y: send.y + hh };
          S.add(zA + 0.009, sp('M' + r1(send.x - hw) + ' ' + r1(send.y - 4 * u) + 'L' + r1(send.x + hw) + ' ' + r1(send.y - 4 * u) + 'Q' + r1(hang.x + hw + u) + ' ' + r1(hang.y) + ' ' + r1(hang.x) + ' ' + r1(hang.y + 3 * u) + 'Q' + r1(hang.x - hw - u) + ' ' + r1(hang.y) + ' ' + r1(send.x - hw) + ' ' + r1(send.y - 4 * u) + 'Z', sleeveCol));
          if (sl2.pattern === 'sakura') S.add(zA + 0.011, sakuraSvg(hang.x, hang.y - 8 * u, 5 * u, sl2.patternColor || '#f7b8cc'));
          if (sl2.pattern === 'flame') { var fl = sf('M' + r1(hang.x - 11) + ' ' + r1(hang.y + 1) + 'Q' + r1(hang.x - 8) + ' ' + r1(hang.y - 12) + ' ' + r1(hang.x - 4) + ' ' + r1(hang.y - 7) + 'Q' + r1(hang.x - 1) + ' ' + r1(hang.y - 18) + ' ' + r1(hang.x + 3) + ' ' + r1(hang.y - 8) + 'Q' + r1(hang.x + 8) + ' ' + r1(hang.y - 14) + ' ' + r1(hang.x + 11) + ' ' + r1(hang.y + 1) + 'Z', sl2.patternColor || '#d8302c');
            S.add(zA + 0.011, u === 1 ? fl : g(fl, null, ' transform="matrix(' + u + ' 0 0 ' + u + ' ' + r1(hang.x * (1 - u)) + ' ' + r1(hang.y * (1 - u)) + ')"')); }
          if (sl2.pattern === 'maple') S.add(zA + 0.011, mapleSvg(hang.x, hang.y - 6 * u, 5 * u, sl2.patternColor || '#d8452c'));
        }
        if (sl2.trim) { var ts = { x: lerp(Sp.x, send.x, 0.86), y: lerp(Sp.y, send.y, 0.86) }; S.add(zA + 0.012, sl('M' + P(ts) + 'L' + P(send), sl2.trim, 5 * u, { op: 0.9 })); }
        if (sl2.cross) { var mp = { x: lerp(Sp.x, send.x, 0.5), y: lerp(Sp.y, send.y, 0.5) }, cu = 4 * u, cw = 1.2 * u; S.add(zA + 0.012, sp('M' + r1(mp.x - cu) + ' ' + r1(mp.y - cw) + 'h' + r1(2 * cu) + 'v' + r1(2 * cw) + 'h' + r1(-2 * cu) + 'Z', sl2.cross, { w: 0.8 }) + sp('M' + r1(mp.x - cw) + ' ' + r1(mp.y - cu) + 'h' + r1(2 * cw) + 'v' + r1(2 * cu) + 'h' + r1(-2 * cw) + 'Z', sl2.cross, { w: 0.8 })); }
        if (sl2.shoulder) S.add(zA + 0.013, sp(ellD(Sp.x + s * 3 * u, Sp.y + 1 * u, 11 * u, 8 * u), sl2.shoulder) + sp('M' + r1(Sp.x + s * 4 * u) + ' ' + r1(Sp.y - 6 * u) + 'l' + r1(s * 4 * u) + ' ' + r1(-9 * u) + 'l' + r1(s * 3 * u) + ' ' + r1(9 * u) + 'Z', '#b7bbc2', { w: 1.2 }));
      } else if (kind === 'tight') {
        S.add(zA + 0.01, sp(capsD(Sp, E, b.armW / 2 + 1.2 * u, b.armW / 2 + 0.8 * u), sleeveCol));
      }
      // 手
      drawHand(c, Hh, A, s, R.hold ? (c.tp ? Math.max(zF, Z.ARM) : Z.ARM) + 0.03 : zF + 0.02, arm);
      A.scr = { S: Sp, E: E, H: Hh, z: zA };
    }
  }
  // 公式の腕：肩から斜めに張った短く広い袖、前腕の手甲（ひも2本）、指のある手
  function drawArmsOff(c) {
    var def = c.def, S = c.S, cam = c.cam, R = c.R, b = c.b, u = c.u;
    var top = def.top || {}, sl2 = def.sleeves || { kind: 'short' }, arm = def.arms || {};
    var pr = def.prop, propSide = pr && c.opt.prop !== false && (R.pose === 'stand' || R.pose === 'hold' || pr.always) ? (pr.hand || -1) : 0;
    for (var k = 0; k < 2; k++) {
      var s = k ? 1 : -1, A = R.arms[s];
      var Sp = cam.pv(A.S), E = cam.pv(A.E), Hh = cam.pv(A.H);
      var dep = Sp.z;
      var zA = dep < -4 ? Z.FARARM : Z.ARM + dep * 0.01;
      if (c.back) zA = dep < -4 ? Z.FARARM : Z.ARM + 1;
      var zF = zA;
      if (!c.back && A.H[1] > b.sy - 2 && Hh.z > cam.p(0, b.headY, 0).z - 2) zF = Z.HEAD + 70 + dep * 0.01;
      var kind = sl2.kind || 'short';
      if (sl2.one && sl2.one !== s) kind = 'none';
      var sleeveCol = sl2.color || (def.over && def.over.sleeves !== false ? def.over.color : top.color);
      var armCol = arm.color || c.skin;
      var aw = b.armW / 2;
      // 前腕（素肌）
      if (kind === 'none' || kind === 'tight') S.add(zA, sp(capsD(Sp, E, aw + 1.4 * u, aw + 0.4 * u), kind === 'tight' ? sleeveCol : armCol));
      var fd = { x: Hh.x - E.x, y: Hh.y - E.y }, fl = Math.hypot(fd.x, fd.y) || 1;
      fd.x /= fl; fd.y /= fl;
      var fn = { x: -fd.y, y: fd.x }; if (fn.y > 0) { fn.x = -fn.x; fn.y = -fn.y; } // 上向きの法線
      var fad = capsD(E, Hh, aw, aw - 0.4 * u);
      S.add(zF + 0.001, sp(fad, armCol));
      S.add(zF + 0.0012, sf(capsD({ x: E.x - fn.x * aw * 0.45, y: E.y - fn.y * aw * 0.45 }, { x: Hh.x - fn.x * aw * 0.45, y: Hh.y - fn.y * aw * 0.45 }, aw * 0.5, aw * 0.45), '#000000', { op: 0.14, clip: S.clip(fad) }));
      // 手甲：ひじ側は細く、手首側は広がって手の甲までおおう
      if (arm.guard && (!arm.guardSide || arm.guardSide === s)) {
        var g0 = { x: lerp(E.x, Hh.x, 0.08), y: lerp(E.y, Hh.y, 0.08) }, g1 = { x: Hh.x + fd.x * 3.2 * u, y: Hh.y + fd.y * 3.2 * u };
        var gw0 = aw + 1.4 * u, gw1 = aw + 2.8 * u;
        var gd = 'M' + r1(g0.x + fn.x * gw0) + ' ' + r1(g0.y + fn.y * gw0) + 'L' + r1(g1.x + fn.x * gw1) + ' ' + r1(g1.y + fn.y * gw1) +
          'Q' + r1(g1.x + fd.x * 4 * u + fn.x * gw1 * 0.3) + ' ' + r1(g1.y + fd.y * 4 * u + fn.y * gw1 * 0.3) + ' ' + r1(g1.x - fn.x * gw1 * 0.85) + ' ' + r1(g1.y - fn.y * gw1 * 0.85) +
          'L' + r1(g0.x - fn.x * gw0) + ' ' + r1(g0.y - fn.y * gw0) + 'Q' + r1(g0.x - fd.x * 2.5 * u) + ' ' + r1(g0.y - fd.y * 2.5 * u) + ' ' + r1(g0.x + fn.x * gw0) + ' ' + r1(g0.y + fn.y * gw0) + 'Z';
        S.add(zF + 0.0035, sp(gd, arm.guard));
        var gc = S.clip(gd);
        S.add(zF + 0.0036, sf(capsD({ x: g0.x - fn.x * gw0 * 0.5, y: g0.y - fn.y * gw0 * 0.5 }, { x: g1.x - fn.x * gw1 * 0.5, y: g1.y - fn.y * gw1 * 0.5 }, gw0 * 0.55, gw1 * 0.55), '#000000', { op: 0.22, clip: gc }));
        S.add(zF + 0.0037, sl('M' + r1(lerp(g0.x, g1.x, 0.18) + fn.x * gw0 * 0.45) + ' ' + r1(lerp(g0.y, g1.y, 0.18) + fn.y * gw0 * 0.45) + 'L' + r1(lerp(g0.x, g1.x, 0.62) + fn.x * gw1 * 0.5) + ' ' + r1(lerp(g0.y, g1.y, 0.62) + fn.y * gw1 * 0.5), lt(arm.guard, 0.45), 1.8 * u, { op: 0.9 }));
        var strap = arm.strap || '#7d666d';
        for (var st = 0; st < 2; st++) {
          var tt = st ? 0.74 : 0.26, sw = lerp(gw0, gw1, tt) + 0.6 * u, sc = { x: lerp(g0.x, g1.x, tt), y: lerp(g0.y, g1.y, tt) };
          var sd2 = 'M' + r1(sc.x + fn.x * sw - fd.x * 1.6 * u) + ' ' + r1(sc.y + fn.y * sw - fd.y * 1.6 * u) + 'L' + r1(sc.x + fn.x * sw + fd.x * 1.6 * u) + ' ' + r1(sc.y + fn.y * sw + fd.y * 1.6 * u) +
            'L' + r1(sc.x - fn.x * sw + fd.x * 1.6 * u) + ' ' + r1(sc.y - fn.y * sw + fd.y * 1.6 * u) + 'L' + r1(sc.x - fn.x * sw - fd.x * 1.6 * u) + ' ' + r1(sc.y - fn.y * sw - fd.y * 1.6 * u) + 'Z';
          S.add(zF + 0.0038, sp(sd2, strap, { w: 1.6 }));
        }
        if (arm.spikes) { var mx = (g0.x + g1.x) / 2, my = (g0.y + g1.y) / 2; S.add(zF + 0.004, sp('M' + r1(mx + fn.x * gw0) + ' ' + r1(my + fn.y * gw0) + 'l' + r1(fn.x * 7 * u + fd.x * 3 * u) + ' ' + r1(fn.y * 7 * u + fd.y * 3 * u) + 'l' + r1(fd.x * 5 * u - fn.x * 6 * u) + ' ' + r1(fd.y * 5 * u - fn.y * 6 * u) + 'Z', '#b7bbc2', { w: 1.4 })); }
      }
      if (arm.glove && arm.glove.side === s) { // 鷹匠の革手袋
        var gs = { x: lerp(E.x, Hh.x, 0.3), y: lerp(E.y, Hh.y, 0.3) };
        S.add(zF + 0.0025, sp(capsD(gs, Hh, aw + 2 * u, aw + 1.5 * u), arm.glove.color));
        if (arm.glove.tassel) S.add(zF + 0.0026, sl('M' + P(gs) + 'l' + r1(-s * 3 * u) + ' ' + r1(10 * u), '#26386b', 1.4) + sp(ellD(gs.x - s * 3 * u, gs.y + 11 * u, 2.6 * u, 2.6 * u), arm.glove.tassel, { w: 1.1 }) + sl('M' + r1(gs.x - s * 3 * u) + ' ' + r1(gs.y + 13 * u) + 'l' + r1(-s * 1) + ' ' + r1(8 * u), '#6a3a8a', 2.2));
      }
      if (arm.bandage) { for (var bi = 0; bi < 3; bi++) { var bp = { x: lerp(E.x, Hh.x, 0.3 + bi * 0.18), y: lerp(E.y, Hh.y, 0.3 + bi * 0.18) }; S.add(zF + 0.003, sl('M' + r1(bp.x + fn.x * aw) + ' ' + r1(bp.y + fn.y * aw) + 'L' + r1(bp.x - fn.x * aw + fd.x * 1.5 * u) + ' ' + r1(bp.y - fn.y * aw + fd.y * 1.5 * u), '#f4f1ea', 2.8 * u)); } }
      if (arm.beads) { var bpp = { x: lerp(E.x, Hh.x, 0.82), y: lerp(E.y, Hh.y, 0.82) }; for (var bj = -2; bj <= 2; bj++) S.add(zF + 0.004, sp(ellD(bpp.x + fn.x * bj * 2.4 * u, bpp.y + fn.y * bj * 2.4 * u, 2.3 * u, 2.3 * u), arm.beads, { w: 1 })); }
      // 袖：肩口から腕にそって広がる台形。付け根の線は描かない（胴とつながる）
      if (kind === 'short' || kind === 'long' || kind === 'wide') {
        var ad = { x: E.x - Sp.x, y: E.y - Sp.y }, al = Math.hypot(ad.x, ad.y) || 1;
        ad.x /= al; ad.y /= al;
        var an = { x: -ad.y, y: ad.x }; if (an.y > 0 || (Math.abs(an.y) < 0.2 && an.x * s < 0)) { an.x = -an.x; an.y = -an.y; }
        var w0 = b.upper, w1 = b.upper1 * (kind === 'short' ? 1 : 1.12), reach = kind === 'short' ? 0.94 : 1.02;
        var O = { x: Sp.x + ad.x * al * reach, y: Sp.y + ad.y * al * reach };
        var tv = clamp(ad.y / 0.45, 0, 1), hv = { x: lerp(an.x, -s * 0.12, tv), y: lerp(an.y, -1, tv) }, hl = Math.hypot(hv.x, hv.y) || 1; // 腕を下ろしていれば袖付けは縦
        hv.x /= hl; hv.y /= hl;
        var near = zA !== Z.FARARM && !c.back, inw = near ? 4 * u : 0; // 手前の袖は胴に少し重ねて、付け根の線を見せない
        var Pa = { x: Sp.x + hv.x * w0 - s * inw, y: Sp.y + hv.y * w0 + inw * 0.3 }, Pb = { x: O.x + an.x * w1, y: O.y + an.y * w1 }, Pc = { x: O.x - an.x * w1, y: O.y - an.y * w1 }, Pd = { x: Sp.x - hv.x * w0 - s * inw, y: Sp.y - hv.y * w0 };
        var hang = 0;
        if (kind === 'long' || kind === 'wide') hang = (kind === 'long' ? 34 : 15) * u;
        var Pc2 = { x: Pc.x, y: Pc.y + hang }, Pb2 = { x: Pb.x, y: Pb.y + hang * 0.25 };
        var outerD = 'M' + P(Pa) + 'L' + P(Pb) + (hang ? 'L' + P(Pb2) + 'Q' + r1(lerp(Pb2.x, Pc2.x, 0.5) + s * 2 * u) + ' ' + r1(Math.max(Pb2.y, Pc2.y) + 5 * u) + ' ' + P(Pc2) : 'Q' + r1(O.x + ad.x * 2 * u) + ' ' + r1(O.y + ad.y * 2 * u) + ' ' + P(Pc)) + 'L' + P(Pd);
        var fillD = outerD + 'Z';
        S.add(zA + 0.01, sf(fillD, sleeveCol) + sl(outerD, OUT, LW));
        var scl = S.clip(fillD);
        S.add(zA + 0.0105, sf(polyD([{ x: lerp(Pa.x, Pd.x, 0.55), y: lerp(Pa.y, Pd.y, 0.55) }, { x: lerp(Pb.x, Pc.x, 0.5), y: lerp(Pb.y, Pc.y, 0.5) }, Pc2, Pd]), '#000000', { op: 0.16, clip: scl }));
        if (zA === Z.FARARM || c.back) S.add(zA + 0.0106, sl('M' + P(Pa) + 'L' + P(Pd), OUT, LW));
        else if (kind === 'short') { // わきのしわ（公式の向かって左の袖の下の短い線）
          var Pk = { x: lerp(Pd.x, Pc.x, 0.15), y: lerp(Pd.y, Pc.y, 0.15) };
          S.add(zA + 0.0107, sl('M' + r1(Pk.x) + ' ' + r1(Pk.y - 1 * u) + 'q' + r1(s * 1.2 * u) + ' ' + r1(4 * u) + ' ' + r1(-s * 1.5 * u) + ' ' + r1(8 * u) + 'M' + r1(Pk.x - s * 0.2 * u) + ' ' + r1(Pk.y + 3.2 * u) + 'l' + r1(s * 3.6 * u) + ' ' + r1(1.4 * u), OUT, 2 * u));
        }
        if (hang) {
          var hp = { x: lerp(Pb.x, Pc2.x, 0.55), y: lerp(Pb.y, Pc2.y, 0.62) };
          if (sl2.pattern === 'sakura') S.add(zA + 0.011, sakuraSvg(hp.x, hp.y, 5 * u, sl2.patternColor || '#f7b8cc'));
          if (sl2.pattern === 'flower4') S.add(zA + 0.011, flower4Svg(hp.x, hp.y, 6 * u, sl2.patternColor || '#f4f1ea', 1));
          if (sl2.pattern === 'maple') S.add(zA + 0.011, mapleSvg(hp.x, hp.y, 5 * u, sl2.patternColor || '#d8452c'));
          if (sl2.pattern === 'flame') S.add(zA + 0.011, g(sf('M' + r1(Pc2.x - 9 * u) + ' ' + r1(Pc2.y + 2) + 'Q' + r1(Pc2.x - 6 * u) + ' ' + r1(Pc2.y - 10 * u) + ' ' + r1(Pc2.x - 2 * u) + ' ' + r1(Pc2.y - 5 * u) + 'Q' + r1(Pc2.x + 1 * u) + ' ' + r1(Pc2.y - 15 * u) + ' ' + r1(Pc2.x + 4 * u) + ' ' + r1(Pc2.y - 6 * u) + 'Q' + r1(Pc2.x + 8 * u) + ' ' + r1(Pc2.y - 11 * u) + ' ' + r1(Pc2.x + 10 * u) + ' ' + r1(Pc2.y + 2) + 'Z', sl2.patternColor || '#d8302c'), scl));
        }
        if (sl2.trim) S.add(zA + 0.012, sl('M' + r1(lerp(Pb.x, Pa.x, 0.12)) + ' ' + r1(lerp(Pb.y, Pa.y, 0.12)) + 'L' + r1(lerp(Pc.x, Pd.x, 0.12)) + ' ' + r1(lerp(Pc.y, Pd.y, 0.12)), sl2.trim, 3.2 * u, { op: 0.95 }));
        if (sl2.cross) { var mp = { x: lerp(Sp.x, O.x, 0.55), y: lerp(Sp.y, O.y, 0.55) }, cu = 4 * u, cw = 1.2 * u; S.add(zA + 0.012, sp('M' + r1(mp.x - cu) + ' ' + r1(mp.y - cw) + 'h' + r1(2 * cu) + 'v' + r1(2 * cw) + 'h' + r1(-2 * cu) + 'Z', sl2.cross, { w: 0.8 }) + sp('M' + r1(mp.x - cw) + ' ' + r1(mp.y - cu) + 'h' + r1(2 * cw) + 'v' + r1(2 * cu) + 'h' + r1(-2 * cw) + 'Z', sl2.cross, { w: 0.8 })); }
        if (sl2.shoulder) S.add(zA + 0.013, sp(ellD(Sp.x + s * 3 * u, Sp.y + 1 * u, 11 * u, 8 * u), sl2.shoulder) + sp('M' + r1(Sp.x + s * 4 * u) + ' ' + r1(Sp.y - 6 * u) + 'l' + r1(s * 4 * u) + ' ' + r1(-9 * u) + 'l' + r1(s * 3 * u) + ' ' + r1(9 * u) + 'Z', '#b7bbc2', { w: 1.2 }));
      }
      // 手
      var hz = R.hold ? Math.max(zF, Z.ARM) + 0.03 : zF + 0.02;
      var hk = A.hand;
      if (def.hands && def.hands[s] && (R.pose === 'stand' || R.pose === 'walk')) hk = def.hands[s];
      if (propSide === s && (hk === 'open' || hk === 'fist')) hk = 'grip';
      var plain = !def.claws && !(def.head && def.head.kind === 'chick') && !R.seal;
      if (plain && (hk === 'open' || hk === 'fist' || hk === 'grip')) handOff(c, Hh, fd, s, hk, z2col(c, arm, s), hz);
      else drawHand(c, Hh, A, s, hz, arm);
      A.scr = { S: Sp, E: E, H: Hh, z: zA };
    }
  }
  function z2col(c, arm, s) {
    var def = c.def, col = arm.hand || arm.color || c.skin;
    if (arm.paw || def.paws) col = def.paws || arm.paw;
    if (arm.glove && arm.glove.side === s) col = arm.glove.color;
    return col;
  }
  // 公式の手：手のひら＋そろえた指＋親指（下側）。grip/fist は握った手
  function handOff(c, Hh, fd, s, kind, col, z) {
    var S = c.S, r = c.b.hand * 0.95, u = c.u;
    var fn = { x: -fd.y, y: fd.x }; if (fn.y > 0) { fn.x = -fn.x; fn.y = -fn.y; }
    var L = function (a, b2) { return { x: Hh.x + fd.x * a * r + fn.x * b2 * r, y: Hh.y + fd.y * a * r + fn.y * b2 * r }; };
    var pts;
    if (kind === 'open') {
      pts = [L(-0.2, 0.72), L(0.9, 0.82), L(1.9, 0.62), L(2.55, 0.32), L(2.7, -0.05), L(2.4, -0.42), L(1.55, -0.52), L(1.25, -0.72), L(1.0, -1.55), L(0.62, -1.72), L(0.35, -1.25), L(0.3, -0.78), L(-0.2, -0.72)];
      S.add(z, sp(smoothD(pts, true, 0.45), col));
      S.add(z + 0.001, sl('M' + P(L(2.0, -0.45)) + 'L' + P(L(2.25, -0.05)), OUT, 1.2 * u, { op: 0.7 }) + sl('M' + P(L(1.55, -0.5)) + 'L' + P(L(1.8, -0.15)), OUT, 1.1 * u, { op: 0.55 }));
    } else {
      pts = [L(-0.2, 0.8), L(0.8, 0.95), L(1.45, 0.65), L(1.55, -0.1), L(1.3, -0.85), L(0.5, -1.0), L(-0.2, -0.8)];
      S.add(z, sp(smoothD(pts, true, 0.5), col));
      if (kind !== 'grip') S.add(z + 0.001, sl('M' + P(L(1.05, 0.55)) + 'Q' + P(L(1.3, 0.1)) + ' ' + P(L(1.05, -0.5)), OUT, 1.2 * u, { op: 0.75 }));
    }
  }
  function drawHand(c, Hh, A, s, z, arm) {
    var S = c.S, b = c.b, r = b.hand, col = arm.hand || arm.color || c.skin, def = c.def;
    if (c.tp) return drawHandScaled(c, Hh, A, s, z, arm, r / 6.8);
    drawHandBase(c, Hh, A, s, z, arm, col, r);
  }
  // cool：ちびキャラの手を小さく（指の長さもまとめて縮める）
  function drawHandScaled(c, Hh, A, s, z, arm, f) {
    var S = c.S, add0 = S.add, lw1 = LWK;
    var tf = '<g transform="matrix(' + r1(f * 100) / 100 + ' 0 0 ' + r1(f * 100) / 100 + ' ' + r1(Hh.x * (1 - f)) + ' ' + r1(Hh.y * (1 - f)) + ')">';
    S.add = function (zz, str) { if (str) add0.call(S, zz, tf + str + '</g>'); };
    LWK = c.lw / f * 0.8;
    try { drawHandBase(c, Hh, A, s, z, arm, arm.hand || arm.color || c.skin, 6.8); } finally { S.add = add0; LWK = lw1; }
  }
  function drawHandBase(c, Hh, A, s, z, arm, col, r) {
    var S = c.S, b = c.b, def = c.def;
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
    var S = c.S, b = c.b, cam = c.cam, u = c.u;
    var hem = ov.hem == null ? (ov.kind === 'coat' ? 16 : ov.kind === 'uchikake' ? 5 : ov.kind === 'cape' ? 62 : 44) : ov.hem;
    var grow = ov.kind === 'uchikake' ? 9 : ov.kind === 'coat' ? 5 : 3;
    var O;
    if (c.tp) { // 肩の線にそって羽織る
      hem = ov.kind === 'coat' || ov.kind === 'uchikake' || ov.kind === 'cape' ? c.Y(hem) : clamp(c.Y(hem) - 24, 20, 90);
      hem = Math.max(hem, 3 - c.R.bob);
      var op = [[b.sy + 2, b.prof[0][1] + 1.2, b.prof[0][2] + 1.2], [b.sy - 4, b.srx + 2.4, b.srz + 2.2]];
      if (ov.kind === 'cape') op.push([hem, b.srx + 7, b.srz + 6]);
      else if (ov.kind === 'coat') { op.push([b.obi[0] + 6, b.prof[3][1] + 2, b.prof[3][2] + 2]); op.push([hem, b.hrx + grow + 4, b.hrz + grow]); }
      else if (ov.kind === 'uchikake') op.push([hem, b.hrx + 13, b.hrz + 9]);
      else op.push([hem, b.hrx + grow + 1, b.hrz + grow * 0.7 + 1]);
      O = new Trunk(cam, { x: 0, z: 0, y0: b.sy + 2, y1: hem, rx0: b.srx + 2.4, rz0: b.srz + 2.2, rx1: op[op.length - 1][1], rz1: op[op.length - 1][2], prof: op });
    } else O = new Trunk(cam, { x: 0, z: 0, y0: b.sy + 2, y1: hem, rx0: b.srx + 3, rz0: b.srz + 3, rx1: (ov.kind === 'cape' ? b.srx + 10 : b.hrx) + grow, rz1: (ov.kind === 'cape' ? b.srz + 8 : b.hrz) + grow * 0.7 });
    var sil = O.silPts();
    var d = smoothD(sil, true, 0.35);
    var zO = Z.OVER;
    var open = ov.open == null ? 22 : ov.open;
    var dtop = c.def.top || {};
    if (c.tp && c.def.skin && String(dtop.color).toLowerCase() === String(c.def.skin).toLowerCase()) open = Math.min(62, open * 1.55); // 素肌の胴は前を大きく開ける
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
        if (O.vis(s * open, (yTop + yBot) / 2) > -0.1) S.add(zO + 0.03, sl(openD(ed), OUT, 7.5 * u) + sl(openD(ed), lc, 5 * u));
      }
      if (ov.trim) { var tr = O.arc(hem + 3 * u, 0.8, th0 - 95, th0 + 95, 5); S.add(zO + 0.03, g(sl(smoothD(tr, false), ov.trim, 4 * u), oc)); }
    }
    if (ov.stitch && !c.back) { // 肩の白い×
      for (var s2 = -1; s2 <= 1; s2 += 2) { var sp2 = O.p(s2 * 62, b.sy - 6 * u, 1), q4 = 4 * u; if (O.vis(s2 * 62, b.sy) > 0.05) S.add(zO + 0.04, sl('M' + r1(sp2.x - q4) + ' ' + r1(sp2.y - q4) + 'l' + r1(2 * q4) + ' ' + r1(2 * q4) + 'M' + r1(sp2.x + q4) + ' ' + r1(sp2.y - q4) + 'l' + r1(-2 * q4) + ' ' + r1(2 * q4), ov.stitch, 2.2)); }
    }
  }
  function drawFurCollar(c, fur) {
    var S = c.S, b = c.b, cam = c.cam;
    if (c.off) { // 公式：両肩をおおう毛皮の肩掛け（前は開いて襟が見える）。左右と背中の3枚
      var seg = function (a0, a1) {
        var o = [], inn = [], n = 10, i;
        for (i = 0; i <= n; i++) { var a = lerp(a0, a1, i / n) * D2R, j = i % 2, rr = (b.srx + 15) * (j ? 0.9 : 1.08), yy = b.sy - 13 - (j ? 0 : 9); o.push(cam.p(Math.sin(a) * rr, yy, Math.cos(a) * (b.srz + 12) * (j ? 0.9 : 1.08))); }
        for (i = n; i >= 0; i--) { var a2 = lerp(a0, a1, i / n) * D2R; inn.push(cam.p(Math.sin(a2) * (b.srx - 7), b.sy + 4, Math.cos(a2) * (b.srz - 4))); }
        return o.concat(inn);
      };
      var dep = function (a) { return cam.p(Math.sin(a * D2R) * b.srx, b.sy, Math.cos(a * D2R) * b.srz).z; };
      [[95, 265], [-96, -32], [32, 96]].forEach(function (r, ri) { // 背中（凸包）→ 左右の前側（向きで重ならない範囲）
        var pts = seg(r[0], r[1]), mid = (r[0] + r[1]) / 2, zf = ri === 0 || dep(mid) < -9 ? Z.BACK + 6 : Z.ARM + 2.5;
        var d = ri === 0 ? smoothD(hull(pts), true, 0.25) : smoothD(pts, true, 0.25);
        S.add(zf, sp(d, fur.color));
        var cl = S.clip(d), ln = '';
        for (var t = r[0] + 8; t < r[1]; t += 16) { var q0 = cam.p(Math.sin(t * D2R) * (b.srx + 4), b.sy - 1, Math.cos(t * D2R) * (b.srz + 4)), q1 = cam.p(Math.sin(t * D2R) * (b.srx + 12), b.sy - 16, Math.cos(t * D2R) * (b.srz + 9)); ln += 'M' + P(q0) + 'L' + P(q1); }
        S.add(zf + 0.01, sl(ln, dk(fur.color, 0.32), 1.6, { clip: cl, op: 0.85 }) + sf(polyD(pts.slice(0, 11).concat([cam.p(0, b.sy - 30, 0)])), '#000000', { clip: cl, op: 0.12 }));
      });
      return;
    }
    var pts = [], y = b.sy - 1;
    for (var i = 0; i < 36; i++) { var a = i * 10, rr = i % 2 ? 1 : 1.25; pts.push(cam.p(Math.sin(a * D2R) * (b.srx + 6) * rr, y - (i % 2 ? 0 : 5) - 3, Math.cos(a * D2R) * (b.srz + 5) * rr)); }
    var inner = []; for (i = 0; i < 36; i++) { var a2 = i * 10; inner.push(cam.p(Math.sin(a2 * D2R) * (b.srx - 4), y + 4, Math.cos(a2 * D2R) * (b.srz - 3))); }
    S.add(Z.OVER + 1, sp(polyD(hull(pts.concat(inner))), fur.color));
    var d = ''; for (i = 0; i < 36; i += 2) { var p = pts[i]; if (p.z > 0) d += 'M' + r1(p.x) + ' ' + r1(p.y) + 'l' + r1((100 - p.x) * 0.1) + ' ' + r1(-6); }
    S.add(Z.OVER + 1.01, sl(d, dk(fur.color, 0.3), 1.4, { op: 0.8 }));
  }
  function drawScarf(c, sc) {
    var S = c.S, b = c.b, cam = c.cam, u = c.u;
    if (c.off && sc.big) return drawScarfBig(c, sc);
    var y = b.sy + 1, ring = [];
    for (var i = 0; i < 36; i++) {
      var a = i * 10 * D2R;
      if (c.tp) { ring.push(cam.p(Math.sin(a) * 11.5, y + 1, Math.cos(a) * 9.5)); ring.push(cam.p(Math.sin(a) * 9, y + 9, Math.cos(a) * 7.5)); ring.push(cam.p(Math.sin(a) * 13, y - 5, Math.cos(a) * 10)); }
      else { ring.push(cam.p(Math.sin(a) * (b.srx - 1), y + 6, Math.cos(a) * (b.srz + 2))); ring.push(cam.p(Math.sin(a) * (b.srx - 3), y - 7, Math.cos(a) * (b.srz))); }
    }
    var hr = hull(ring), rd = polyD(hr);
    S.add(Z.OVER + 2, sp(rd, sc.color));
    if (sc.pattern === 'check') {
      var rc = S.clip(rd), pat = '', x0 = 50, y0 = 110, x1 = 150, y1 = 150, st = 8;
      if (c.tp) { x0 = 1e9; y0 = 1e9; x1 = -1e9; y1 = -1e9; hr.forEach(function (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }); st = 4.5; x0 = Math.floor(x0); y0 = Math.floor(y0); }
      for (var x = x0; x < x1; x += st) for (var yy = y0; yy < y1; yy += st) if ((Math.round((x - x0) / st) + Math.round((yy - y0) / st)) % 2 === 0) pat += 'M' + r1(x) + ' ' + r1(yy) + 'h' + st + 'v' + st + 'h-' + st + 'Z';
      S.add(Z.OVER + 2.01, sf(pat, sc.color2 || '#8a4a1e', { clip: rc }));
    }
    // たなびく端（向かって左後ろへ）
    if (sc.tail !== false) {
      var dir = sc.dir || -1, col = sc.color2 && sc.pattern !== 'check' ? sc.color2 : sc.color;
      var t0 = [dir * 12, y + 2, -12], t1 = [dir * 40, y + 10, -26], t2 = [dir * 70, y - 2, -30], t3 = [dir * (sc.len || 92), y - 14, -26], ws = [12, 15, 14, 11];
      if (c.tp) { // 風にたなびく長い端と、背中に垂れる短い端
        var L = (sc.len || 92) * 0.72;
        t0 = [dir * 6, y + 4, -8]; t1 = [dir * 26, y + 14, -22]; t2 = [dir * 48, y - 6, -26]; t3 = [dir * L, y + 8, -22]; ws = [8, 10, 9.4, 7.4];
        var h0 = [dir * 3, y + 2, -9], h1 = [dir * 8, y - 10, -15], h2 = [dir * 12, y - 22, -17], h3 = [dir * 15, y - 34, -15];
        var mh = massD(c, [h0, h1, h2, h3], [7.5, 8.5, 8, 7]);
        S.add(mh.depth < -4 ? Z.BACK + 5 : Z.OVER + 1.8, sp(mh.d, col));
      }
      var m = massD(c, [t0, t1, t2, t3], ws);
      var zt = m.depth < -6 ? Z.BACK + 5 : Z.OVER + 1.9;
      S.add(zt, sp(m.d, col));
      var endp = m.scr[m.scr.length - 1], q = c.tp ? 0.7 : 1;
      S.add(zt + 0.01, sl('M' + r1(endp.x - 3 * q) + ' ' + r1(endp.y - 5 * q) + 'l' + r1(-5 * q) + ' ' + r1(1 * q) + 'M' + r1(endp.x - 2 * q) + ' ' + r1(endp.y) + 'l' + r1(-6 * q) + ' ' + r1(1 * q) + 'M' + r1(endp.x - 2 * q) + ' ' + r1(endp.y + 5 * q) + 'l' + r1(-5 * q) + ' ' + r1(2 * q), dk(sc.color, 0.3), 1.4));
    }
  }

  // 公式の大きな襟巻き（餡音・アトザ・イチヤ）：あごまでおおうふくらんだ輪と、風にたなびく幅の広い端
  function drawScarfBig(c, sc) {
    var S = c.S, b = c.b, cam = c.cam, yb = b.sy - 6, yt = b.sy + (sc.top || 13), ym = (yb + yt) / 2, ring = [];
    for (var i = 0; i < 36; i++) {
      var a = i * 10 * D2R;
      ring.push(cam.p(Math.sin(a) * 26, yb, Math.cos(a) * 20)); ring.push(cam.p(Math.sin(a) * 30.5, ym, Math.cos(a) * 24)); ring.push(cam.p(Math.sin(a) * 23, yt, Math.cos(a) * 18.5));
    }
    var rd = smoothD(hull(ring), true, 0.4), zs = Z.HEAD + 13;
    S.add(zs, sp(rd, sc.color));
    var rc = S.clip(rd);
    if (sc.pattern === 'check') {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, st = 6, pat = '';
      hull(ring).forEach(function (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
      for (var x = Math.floor(x0); x < x1; x += st) for (var yy = Math.floor(y0); yy < y1; yy += st) if ((Math.round((x - x0) / st) + Math.round((yy - y0) / st)) % 2 === 0) pat += 'M' + r1(x) + ' ' + r1(yy) + 'h' + st + 'v' + st + 'h-' + st + 'Z';
      S.add(zs + 0.005, sf(pat, sc.color2 || '#8a4a1e', { clip: rc, op: 0.55 }));
    }
    // ひだ（前の2本）と下の影
    var f1 = [], f2 = [];
    for (var t = -70; t <= 70; t += 10) { f1.push(cam.p(Math.sin(t * D2R) * 30, ym + 2 + Math.cos(t * D2R * 2) * 1.5, Math.cos(t * D2R) * 24.3)); f2.push(cam.p(Math.sin(t * D2R) * 28, yb + 5, Math.cos(t * D2R) * 22.5)); }
    S.add(zs + 0.01, sl(smoothD(f1, false), dk(sc.color, 0.35), 1.8, { clip: rc }) + sl(smoothD(f2, false), dk(sc.color, 0.35), 1.6, { clip: rc, op: 0.8 }) + sf(polyD(f2.concat([cam.p(28, yb - 8, 0), cam.p(-28, yb - 8, 0)])), '#000000', { clip: rc, op: 0.14 }));
    if (sc.tail === false) return;
    var dir = sc.dir || -1, L = sc.len || 92;
    var m = massD(c, [[dir * 18, ym + 2, -4], [dir * 44, ym + 6, -12], [dir * (L * 0.72), ym - 6, -16], [dir * (L * 0.98), ym - 2, -14]], [15, 18, 21, 24]);
    var zt = m.depth < -12 ? Z.BACK + 5 : Z.HEAD + 12.9;
    S.add(zt, sp(m.d, sc.color2 && sc.pattern !== 'check' ? sc.color2 : sc.color));
    S.add(zt + 0.01, sl(smoothD(m.scr.slice(1), false), dk(sc.color, 0.3), 1.6, { op: 0.7 }));
  }

  /* ---- 背中の物（刀・箱・翼・尻尾・パンダ） ---- */
  function drawBackItems(c) {
    var def = c.def, S = c.S, cam = c.cam, b = c.b, back = def.back || {};
    var zBack = function (d) { return d < -2 ? Z.BACK : Z.OVER + 5; };
    var u = c.u;
    if (back.katana) {
      var kt = back.katana;
      var s = kt.side || 1;
      var top = [s * (b.srx + 26), b.sy + 26, -10], grd = [s * (b.srx + 17), b.sy + 12, -14], end = [-s * (b.srx + 2), b.obi[0] - 10, -20];
      if (kt.hip) { top = [s * 44, b.obi[0] + 16, 16]; grd = [s * 36, b.obi[0] + 6, 14]; end = [s * 8, b.obi[0] - 18, -26]; }
      if (c.tp) { // 柄が肩ごしに見え、鞘は反対の腰へ
        top = [s * (b.srx - 2), b.sy + 23, -13]; grd = [s * (b.srx - 6), b.sy + 8, -14]; end = [-s * (b.srx - 1), b.obi[0] - 32, -16];
        if (kt.hip) { top = [s * (b.hrx + 13), b.obi[0] + 10, 18]; grd = [s * (b.hrx + 8), b.obi[0] + 3, 15]; end = [s * (b.hrx - 10), b.obi[0] - 36, -26]; }
      }
      if (c.off) { // 公式：柄が向かって右の肩の上に斜めに出る
        top = [s * 37, b.sy + 21, -12]; grd = [s * 23, b.sy + 1, -14]; end = [-s * 26, b.obi[0] - 6, -16];
        if (kt.hip) { top = [s * (b.hrx + 13), b.obi[1] + 9, 18]; grd = [s * (b.hrx + 7), b.obi[1] + 1, 15]; end = [s * (b.hrx - 12), b.obi[0] - 30, -26]; }
      }
      var T0 = cam.pv(top), G = cam.pv(grd), E = cam.pv(end);
      var zk = kt.hip ? (G.z < -4 ? Z.BACK + 1 : Z.ARM + 2) : zBack(c.tp ? (G.z + E.z) / 2 : G.z);
      var saya = kt.saya || '#1f1c20';
      S.add(zk, sp(capsD(G, E, 3.8 * u, 3.4 * u), saya));
      S.add(zk + 0.001, sp(ellD(E.x, E.y, 3.8 * u, 3.8 * u), kt.tip || '#c9a24a', { w: 1.6 }));
      S.add(zk + 0.002, sp(capsD(T0, G, 3.3 * u, 3.3 * u), kt.hilt || '#232126'));
      // 柄巻きの菱
      var dx = G.x - T0.x, dy = G.y - T0.y;
      for (var i = 1; i < 4; i++) { var px = T0.x + dx * i / 4, py = T0.y + dy * i / 4; S.add(zk + 0.003, sf('M' + r1(px) + ' ' + r1(py - 2 * u) + 'l' + r1(1.8 * u) + ' ' + r1(2 * u) + 'l' + r1(-1.8 * u) + ' ' + r1(2 * u) + 'l' + r1(-1.8 * u) + ' ' + r1(-2 * u) + 'Z', kt.wrap || '#f1efe8')); }
      var gx = G.x, gy = G.y, l = Math.hypot(dx, dy) || 1;
      S.add(zk + 0.004, sp(ellD(gx, gy, 5.4 * u, 3 * u), kt.guard || '#d8b04a', { w: 1.6, extra: ' transform="rotate(' + r1(Math.atan2(dy, dx) / D2R + 90) + ' ' + r1(gx) + ' ' + r1(gy) + ')"' }));
      S.add(zk + 0.005, sp(ellD(T0.x, T0.y, 3.4 * u, 3.4 * u), kt.guard || '#d8b04a', { w: 1.5 }));
      if (kt.second) { // 脇差
        var t2 = cam.pv([s * 40, b.obi[0] + 8, 18]), g2 = cam.pv([s * 34, b.obi[0], 16]), e2 = cam.pv([s * 12, b.obi[0] - 14, -20]);
        if (c.tp) { t2 = cam.pv([s * (b.hrx + 10), b.obi[0] + 5, 17]); g2 = cam.pv([s * (b.hrx + 6), b.obi[0] - 1, 15]); e2 = cam.pv([s * (b.hrx - 6), b.obi[0] - 24, -18]); }
        S.add(zk - 0.01, sp(capsD(g2, e2, 3.2 * u, 3 * u), saya) + sp(capsD(t2, g2, 2.8 * u, 2.8 * u), kt.hilt || '#232126') + sp(ellD(g2.x, g2.y, 4 * u, 2.4 * u), kt.guard || '#d8b04a', { w: 1.3 }));
      }
    }
    if (back.tube) {
      var tb = cam.pv([-(b.srx + 20), b.sy + 22, -12]), tb2 = cam.pv([b.srx - 6, b.obi[0] - 8, -20]);
      if (c.tp) { tb = cam.pv([-(b.srx + 4), b.sy + 16, -14]); tb2 = cam.pv([b.srx - 8, b.obi[0] - 12, -18]); }
      S.add(zBack(c.tp ? (tb.z + tb2.z) / 2 : tb.z), sp(capsD(tb, tb2, 5.5 * u, 5 * u), back.tube) + sl('M' + r1(lerp(tb.x, tb2.x, 0.2) - 5 * u) + ' ' + r1(lerp(tb.y, tb2.y, 0.2)) + 'l' + r1(10 * u) + ' ' + r1(2 * u) + 'M' + r1(lerp(tb.x, tb2.x, 0.5) - 5 * u) + ' ' + r1(lerp(tb.y, tb2.y, 0.5)) + 'l' + r1(10 * u) + ' ' + r1(2 * u), dk(back.tube, 0.35), 1.6));
    }
    if (back.box) drawBox(c, back.box);
    if (def.wings) drawWings(c, def.wings);
    if (def.tail) drawTail(c, def.tail);
    if (back.panda) drawPanda(c, back.panda);
    if (def.halo && c.off) { // 公式：頭より大きい光の輪と4つのきらめき
      var hco = cam.pv([0, b.headY + 2, -16]), hro = 47;
      S.def('<filter id="' + c.uid + 'hb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>');
      S.add(Z.BACK - 5, '<circle cx="' + r1(hco.x) + '" cy="' + r1(hco.y) + '" r="' + hro + '" fill="none" stroke="#fff3b8" stroke-width="14" opacity=".55" filter="url(#' + c.uid + 'hb)"/><circle cx="' + r1(hco.x) + '" cy="' + r1(hco.y) + '" r="' + hro + '" fill="none" stroke="#fffbe6" stroke-width="7" opacity=".95"/>');
      [[-1, -1], [1, -0.7], [-1.05, 0.95], [1.08, 1]].forEach(function (q, i) { var sx2 = hco.x + q[0] * hro * 0.98, sy2 = hco.y + q[1] * hro * 0.98, rr = i % 2 ? 6 : 8; S.add(Z.BACK - 4, sf('M' + r1(sx2 - rr) + ' ' + r1(sy2 - 1.6) + 'h' + r1(rr * 2) + 'v3.2h' + r1(-rr * 2) + 'Z', '#fff6c8') + sf('M' + r1(sx2 - 1.6) + ' ' + r1(sy2 - rr) + 'h3.2v' + r1(rr * 2) + 'h-3.2Z', '#fff6c8')); });
    } else if (def.halo) {
      var hc = c.tp ? cam.pv([0, b.headY + 3, -14]) : cam.pv([0, b.headY + 8, -30]), hrr = c.tp ? 30 : 58;
      S.add(Z.BACK - 5, '<circle cx="' + r1(hc.x) + '" cy="' + r1(hc.y) + '" r="' + hrr + '" fill="none" stroke="#fff6c8" stroke-width="' + (c.tp ? 6 : 10) + '" opacity=".75"/><circle cx="' + r1(hc.x) + '" cy="' + r1(hc.y) + '" r="' + hrr + '" fill="none" stroke="#f3d56a" stroke-width="' + (c.tp ? 2 : 3) + '" opacity=".9"/>');
    }
  }
  function drawBox(c, bx) {
    var S = c.S, cam = c.cam, b = c.b;
    var x0 = -19, x1 = 19, y0 = b.obi[0] - 6, y1 = b.sy + 20, z0 = -b.srz - 2, z1 = -b.srz - 20;
    if (c.tp) { x0 = -15; x1 = 15; y0 = b.obi[0] - 4; y1 = b.sy + 8; z1 = -b.srz - 17; }
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
    if (!c.back) for (var s = -1; s <= 1; s += 2) { var a = c.tp ? cam.p(s * 10, b.sy + 1, 6) : cam.p(s * 13, b.sy + 1, 6), e = c.tp ? cam.p(s * 13, b.obi[0] + 2, b.srz + 1) : cam.p(s * 17, b.obi[0] + 2, b.srz + 2); S.add(Z.OVER + 1.5, sl('M' + P(a) + 'L' + P(e), OUT, 6.4 * c.u) + sl('M' + P(a) + 'L' + P(e), bx.strap || '#f1efe8', 4 * c.u)); }
  }
  function drawWings(c, wg) {
    var S = c.S, cam = c.cam, b = c.b, q = c.tp ? 0.84 : 1;
    for (var s = -1; s <= 1; s += 2) {
      var root = [s * 8, b.sy - 8, -b.srz + 2];
      var feathers = [[62, 36, 0], [72, 18, 0.4], [76, -2, 0.8], [68, -20, 1.2], [52, -34, 1.6]].map(function (f) { return [f[0] * q, f[1] * q, f[2]]; });
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
    var hc = c.off ? cam.pv([-(b.srx + 12), b.sy + 8, -14]) : c.tp ? cam.pv([-(b.srx + 6), b.sy + 10, -18]) : cam.pv([-40, b.sy + 22, -22]);
    var z = hc.z < -4 ? Z.BACK + 4 : Z.OVER + 8;
    if (c.off) z = Z.HEAD + 80; // 公式：肩に乗った大きなパンダ（顔の横に出る）
    if (c.tp) { // 小さめのパンダ（肩ごしにのぞく）
      var add0 = S.add, lw1 = LWK, f = c.off ? 1.15 : 0.72, tf = '<g transform="matrix(' + f + ' 0 0 ' + f + ' ' + r1(hc.x * (1 - f)) + ' ' + r1(hc.y * (1 - f)) + ')">';
      S.add = function (zz, str) { if (str) add0.call(S, zz, tf + str + '</g>'); };
      LWK = c.lw / f;
      try { drawPandaBody(c, pd, hc, z); } finally { S.add = add0; LWK = lw1; }
      return;
    }
    drawPandaBody(c, pd, hc, z);
  }
  function drawPandaBody(c, pd, hc, z) {
    var S = c.S;
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
  // cool：小道具は体に合わせて大きく（手の位置を軸に拡大。線は太くならないように）
  var PROP_SCALE = { shuriken: 1.05, scroll: 1.15, dango: 1.1, bomb: 1.05, kanabo: 1.75, fuda: 1.1, dagger: 1.3, katana: 1.9, gyuto: 1.45, shamisen: 1.6, kama: 1.5, brush: 1.25, pistol: 1.15, mallet: 1.4, pipe: 1.15, fuda1: 1.1 };
  // 公式の三味線（弁天）：胴は体の前の向かって左下、さおは向かって右の肩の上まで斜めに
  function drawShamisenOff(c, pr) {
    var S = c.S, cam = c.cam, b = c.b, u = c.u;
    var dc = cam.pv([-(b.sx - 4), b.obi[0] - 4, 22]), nt = cam.pv([b.sx + 26, b.sy + 34, 14]);
    var dx = nt.x - dc.x, dy = nt.y - dc.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    var o = sl('M' + P(dc) + 'L' + P(nt), OUT, 7.4 * u) + sl('M' + P(dc) + 'L' + P(nt), '#3a2a22', 4.6 * u);
    o += sp('M' + r1(nt.x - nx * 3) + ' ' + r1(nt.y - ny * 3) + 'l' + r1(ux * 10 + nx * 2) + ' ' + r1(uy * 10 + ny * 2) + 'l' + r1(nx * 5) + ' ' + r1(ny * 5) + 'l' + r1(-ux * 10 + nx * 2) + ' ' + r1(-uy * 10 + ny * 2) + 'Z', '#2a1e1a', { w: 1.4 });
    for (var i = 0; i < 3; i++) { var pq = { x: nt.x + ux * (2 + i * 3), y: nt.y + uy * (2 + i * 3) }; o += sl('M' + r1(pq.x - nx * 6) + ' ' + r1(pq.y - ny * 6) + 'L' + r1(pq.x + nx * 6) + ' ' + r1(pq.y + ny * 6), '#e9e2d2', 2.2); }
    var hw = 13 * u, ang = Math.atan2(dy, dx) / D2R + 90;
    o += '<g transform="rotate(' + r1(ang - 90 + 20) + ' ' + r1(dc.x) + ' ' + r1(dc.y) + ')">' + sp('M' + r1(dc.x - hw) + ' ' + r1(dc.y - hw) + 'h' + r1(hw * 2) + 'v' + r1(hw * 2) + 'h' + r1(-hw * 2) + 'Z', '#6a4a30', { w: 2.2 }) + sp('M' + r1(dc.x - hw + 3) + ' ' + r1(dc.y - hw + 3) + 'h' + r1(hw * 2 - 6) + 'v' + r1(hw * 2 - 6) + 'h' + r1(-hw * 2 + 6) + 'Z', '#f1ead9', { w: 1.4 }) + '</g>';
    o += sl('M' + r1(dc.x + ux * 4) + ' ' + r1(dc.y + uy * 4) + 'L' + P(nt), '#e9e2d2', 0.9, { op: 0.9 });
    o += sp('M' + r1(dc.x + 2) + ' ' + r1(dc.y + 1) + 'l9 -5l3 6l-9 5Z', '#e3b64a', { w: 1.3 }); // ばち
    S.add(Z.ARM + 0.012, o);
  }
  function drawProp(c) {
    var def = c.def, pr = def.prop, S = c.S;
    if (!pr || c.opt.prop === false) return;
    if (c.R.pose !== 'stand' && c.R.pose !== 'hold' && !pr.always) return;
    if (c.off && pr.kind === 'shamisen') return drawShamisenOff(c, pr);
    if (!c.tp) return drawPropBase(c, pr);
    var f = (c.R.hold && pr.kind === 'scroll') ? 1.2 : (PROP_SCALE[pr.kind] || 1.2), piv;
    if (pr.kind === 'kanabo' && pr.long) f = 1.3;
    if (c.R.hold && pr.kind === 'scroll') { var a = c.cam.pv(c.R.arms[-1].H), b2 = c.cam.pv(c.R.arms[1].H); piv = { x: (a.x + b2.x) / 2, y: (a.y + b2.y) / 2 }; }
    else piv = c.cam.pv(c.R.arms[pr.hand || -1].H);
    if (pr.kind === 'pistol') f = 1; // 両手に1丁ずつ
    var add0 = S.add, lw1 = LWK;
    var tf = '<g transform="matrix(' + f + ' 0 0 ' + f + ' ' + r1(piv.x * (1 - f)) + ' ' + r1(piv.y * (1 - f)) + ')">';
    S.add = function (z, str) { if (str) add0.call(S, z, tf + str + '</g>'); };
    LWK = c.lw / f;
    try { drawPropBase(c, pr); } finally { S.add = add0; LWK = lw1; }
  }
  function drawPropBase(c, pr) {
    var def = c.def, S = c.S;
    if (c.R.hold && pr.kind === 'scroll' && c.tp) { // cool：両手で横に持つ巻物
      var ha = c.cam.pv(c.R.arms[-1].H), hb = c.cam.pv(c.R.arms[1].H);
      var cx0 = (ha.x + hb.x) / 2, cy0 = (ha.y + hb.y) / 2 - 1, half = Math.max(12, Math.abs(hb.x - ha.x) / 2 + 6);
      var so = sp(capsD({ x: cx0 - half, y: cy0 }, { x: cx0 + half, y: cy0 }, 4.6, 4.6), pr.color || '#6b3fa8') +
        sp('M' + r1(cx0 - 6) + ' ' + r1(cy0 - 5.2) + 'h12v10.4h-12Z', '#f7f3ea', { w: 1.4 }) + sl('M' + r1(cx0 - 3) + ' ' + r1(cy0 - 2.4) + 'v5M' + r1(cx0 + 2.6) + ' ' + r1(cy0 - 2.4) + 'v5', '#c8302c', 1.2) +
        sp(ellD(cx0 - half - 1, cy0, 2.4, 5.4), pr.cap || '#8a5a36', { w: 1.4 }) + sp(ellD(cx0 + half + 1, cy0, 2.4, 5.4), pr.cap || '#8a5a36', { w: 1.4 });
      c.S.add(Z.ARM + 0.015, so);
      return;
    }
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
        if (c.off) { // 公式：濃い灰色の大きな四方手裏剣。刃の片側が明るい
          var ocx = x + ux * 4, ocy = y + uy * 4, oR = (pr.r || 15) * 1.36, opt2 = [];
          for (i = 0; i < 8; i++) { var oa = i * Math.PI / 4 + 0.08, orr = i % 2 ? oR * 0.34 : oR; opt2.push({ x: ocx + Math.cos(oa) * orr, y: ocy + Math.sin(oa) * orr * 0.92 }); }
          o = sf(polyD(opt2), pr.color || '#55575e');
          for (i = 0; i < 8; i += 2) o += sf(polyD([{ x: ocx, y: ocy }, opt2[i], opt2[(i + 1) % 8]]), '#8e9198');
          for (i = 0; i < 8; i += 2) o += sl('M' + r1(lerp(ocx, opt2[i].x, 0.3)) + ' ' + r1(lerp(ocy, opt2[i].y, 0.3)) + 'L' + r1(lerp(ocx, opt2[i].x, 0.85)) + ' ' + r1(lerp(ocy, opt2[i].y, 0.85)), '#c9ccd1', 1.4, { op: 0.9 });
          o += sl(polyD(opt2), OUT, LW);
          S.add(zA - 0.005, o); return;
        }
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
        if (c.off) { st = { x: x + ux * 4, y: y + uy * 4 }; en = { x: x + ux * 30 + 8, y: y + uy * 30 + 14 }; } // 公式：串を下向きに持つ
        o = sl('M' + P(c.off ? { x: x - ux * 4, y: y - uy * 4 } : { x: x - 4, y: y + 6 }) + 'L' + P(en), '#b58a52', 2.6);
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
        if (c.off) { // 公式：灰色の鉈（刃は下向き、背が黒）
          o = sp('M' + r1(x + 1) + ' ' + r1(y + 4) + 'L' + r1(x + 4) + ' ' + r1(y + 26) + 'Q' + r1(x + 13) + ' ' + r1(y + 29) + ' ' + r1(x + 14) + ' ' + r1(y + 21) + 'L' + r1(x + 10) + ' ' + r1(y + 2) + 'Z', '#a9adb3', { w: 2 }) +
            sl('M' + r1(x + 3) + ' ' + r1(y + 6) + 'L' + r1(x + 5.5) + ' ' + r1(y + 24), '#e6e9ec', 1.6) + sl('M' + r1(x + 10) + ' ' + r1(y + 3) + 'L' + r1(x + 13.5) + ' ' + r1(y + 21), '#55585e', 2.2) +
            sp(capsD({ x: x + 4, y: y - 9 }, { x: x + 6, y: y + 3 }, 2.8, 2.8), '#3a2a22', { w: 1.6 });
          S.add(zA - 0.005, o); return;
        }
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
        if (c.off) { // 公式：両手のリボルバー。銃口は斜め下外向き
          for (var so = -1; so <= 1; so += 2) {
            var Ao = c.R.arms[so], Hs2 = c.cam.pv(Ao.H), Es2 = c.cam.pv(Ao.E), ux2 = Hs2.x - Es2.x, uy2 = Hs2.y - Es2.y, ul2 = Math.hypot(ux2, uy2) || 1;
            ux2 /= ul2; uy2 /= ul2;
            ux2 = ux2 * 0.8 + so * 0.6; uy2 = uy2 * 0.8 + 0.3; ul2 = Math.hypot(ux2, uy2); ux2 /= ul2; uy2 /= ul2; // 銃口は外へ
            var bx0 = Hs2.x + ux2 * 4, by0 = Hs2.y + uy2 * 4, bx1 = Hs2.x + ux2 * 30, by1 = Hs2.y + uy2 * 30, nx3 = -uy2, ny3 = ux2;
            var gun2 = sp(capsD({ x: bx0, y: by0 }, { x: bx1, y: by1 }, 3.4, 2.8), '#4a4c52', { w: 1.6 }) + sp(ellD(Hs2.x + ux2 * 8, Hs2.y + uy2 * 8, 6, 5.2), '#5d6067', { w: 1.6 }) +
              sl('M' + r1(bx0 + nx3 * 1) + ' ' + r1(by0 + ny3 * 1) + 'L' + r1(bx1 + nx3 * 1) + ' ' + r1(by1 + ny3 * 1), '#9a9da3', 1.2) +
              sp('M' + r1(Hs2.x - nx3 * 2) + ' ' + r1(Hs2.y - ny3 * 2) + 'l' + r1(-ux2 * 3 - nx3 * 7) + ' ' + r1(-uy2 * 3 - ny3 * 7) + 'l' + r1(ux2 * 5 - nx3 * 1) + ' ' + r1(uy2 * 5 - ny3 * 1) + 'l' + r1(nx3 * 6 + ux2 * 1) + ' ' + r1(ny3 * 6 + uy2 * 1) + 'Z', '#6a4426', { w: 1.6 });
            S.add((c.cam.pv(Ao.S).z < -4 ? Z.FARARM : Z.ARM) + 0.018, gun2);
          }
          return;
        }
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
      if (!c.tp) return drawCompanion(c, cp);
      // cool：体に合わせた位置へ置き、少し小さく描く
      var f = cp.kind === 'hawk' ? 0.85 : cp.kind === 'snake' ? 1 : cp.kind === 'rainbow' || cp.kind === 'splash' || cp.kind === 'wisps' ? 0.9 : 0.8;
      var at = cp.at ? [cp.at[0] * 0.72, c.Y(cp.at[1]), cp.at[2]] : [(cp.side || -1) * 44, b.headY + 2, 6];
      if (c.off && (cp.kind === 'chick' || cp.kind === 'bunny' || cp.kind === 'ghost')) { f = cp.kind === 'ghost' ? 1.35 : 1.55; at = [cp.at ? cp.at[0] * 0.74 : (cp.side || -1) * 48, c.Y(cp.at ? cp.at[1] : 148) - (cp.kind === 'ghost' ? 26 : 2), cp.at ? cp.at[2] : 8]; } // 公式：頭の横に大きく
      var piv, q = {};
      for (var key in cp) q[key] = cp[key];
      q.at = at;
      if (cp.kind === 'hawk') piv = cam.pv(c.R.arms[cp.hand || -1].H);
      else if (cp.kind === 'wisps') { piv = { x: 100, y: GROUND - (b.sy - 8) }; q.cy = piv.y; }
      else if (cp.kind === 'rainbow') { piv = cam.pv([0, b.obi[0] + 4, 0]); q.cy = piv.y; }
      else if (cp.kind === 'splash') { piv = { x: 100, y: GROUND - 14 }; q.cy = piv.y; }
      else if (cp.kind === 'imp') { var ip = c.off ? cam.pv([-(b.srx + 4), b.sy + 8, 6]) : cam.pv([b.srx - 2, b.sy + 6, 4]); piv = { x: ip.x + (c.off ? -4 : 4), y: ip.y - 10 }; if (c.off) f = 1.3; } // 公式：向かって左の肩に大きく
      else if (cp.kind === 'snake') piv = null;
      else piv = cam.pv(at);
      if (!piv || f === 1) return drawCompanion(c, q);
      var add0 = S.add, lw1 = LWK;
      var tf = '<g transform="matrix(' + f + ' 0 0 ' + f + ' ' + r1(piv.x * (1 - f)) + ' ' + r1(piv.y * (1 - f)) + ')">';
      S.add = function (z, str) { if (str) add0.call(S, z, tf + str + '</g>'); };
      LWK = c.lw / f;
      try { drawCompanion(c, q); } finally { S.add = add0; LWK = lw1; }
    });
  }
  function drawCompanion(c, cp) {
    var S = c.S, cam = c.cam, b = c.b;
    (function () {
      var kind = cp.kind, o = '', side = cp.side || -1;
      var z = Z.FRONT;
      var anchor = cam.pv(cp.at || [side * 64, b.headY - 8, 6]);
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
      } else if (kind === 'snake' && c.off) { // 公式：首に太く巻きつき、頭は向かって左の肩の上
        var nk2 = [];
        for (var i2 = 0; i2 <= 14; i2++) { var a2 = (i2 / 14) * Math.PI * 1.3 + Math.PI * 0.85; nk2.push(cam.p(Math.sin(a2) * 29, b.sy - 3 + Math.sin(i2 / 14 * Math.PI) * 3, Math.cos(a2) * 21)); }
        var nd2 = smoothD(brushPts(nk2, interp([10, 12, 12, 11], nk2.length)), true, 0.9);
        S.add(Z.OVER + 3, sp(nd2, cp.color || '#f1efe9'));
        var sc2 = S.clip(nd2), scl2 = ''; nk2.forEach(function (p, j) { scl2 += 'M' + r1(p.x - 3) + ' ' + r1(p.y - 4) + 'l3 3l3 -3M' + r1(p.x - 3) + ' ' + r1(p.y + 2) + 'l3 3l3 -3'; });
        S.add(Z.OVER + 3.01, sl(scl2, '#b9b6af', 1.2, { clip: sc2 }));
        var hp2 = cam.pv([-(b.srx + 22), b.sy - 10, 10]), hk2 = 1.45;
        o += sp('M' + r1(hp2.x + 9 * hk2) + ' ' + r1(hp2.y + 10 * hk2) + 'Q' + r1(hp2.x - 2 * hk2) + ' ' + r1(hp2.y + 6 * hk2) + ' ' + r1(hp2.x - 11 * hk2) + ' ' + r1(hp2.y) + 'Q' + r1(hp2.x - 14 * hk2) + ' ' + r1(hp2.y - 9 * hk2) + ' ' + r1(hp2.x - 2 * hk2) + ' ' + r1(hp2.y - 11 * hk2) + 'Q' + r1(hp2.x + 11 * hk2) + ' ' + r1(hp2.y - 9 * hk2) + ' ' + r1(hp2.x + 12 * hk2) + ' ' + r1(hp2.y + 3 * hk2) + 'Z', cp.color || '#f1efe9');
        o += sf(ellD(hp2.x - 5 * hk2, hp2.y - 5 * hk2, 2.8, 3.2), '#c8202c') + sl('M' + r1(hp2.x - 12 * hk2) + ' ' + r1(hp2.y + 1) + 'l-6 1.4l-2.4 -2.4M' + r1(hp2.x - 12 * hk2 - 6) + ' ' + r1(hp2.y + 2.4) + 'l-2.2 2.6', '#c8202c', 1.6) + sl('M' + r1(hp2.x - 12 * hk2) + ' ' + r1(hp2.y + 1) + 'Q' + r1(hp2.x - 4 * hk2) + ' ' + r1(hp2.y + 3 * hk2) + ' ' + r1(hp2.x + 4 * hk2) + ' ' + r1(hp2.y + 2 * hk2), '#7a5a54', 1.2);
        var tq = cam.pv([b.srx + 4, b.obi[1] + 2, 9]), tq2 = cam.pv([b.srx + 9, b.obi[0] - 26, 6]);
        S.add(Z.ARM + 0.4, sp(capsD(tq, tq2, 6.5 * c.u, 2.5 * c.u), cp.color || '#f1efe9'));
        z = Z.OVER + 3.1;
      } else if (kind === 'snake') {
        var nk = [];
        for (var i = 0; i <= 12; i++) { var a = (i / 12) * Math.PI * 1.15 + Math.PI * 0.95; nk.push(c.tp ? cam.p(Math.sin(a) * (b.srx - 2), b.sy - 1 + Math.sin(i / 12 * Math.PI) * 3, Math.cos(a) * (b.srz + 3)) : cam.p(Math.sin(a) * (b.srx + 4), b.sy + 2 + Math.sin(i / 12 * Math.PI) * 4, Math.cos(a) * (b.srz + 6))); }
        var neckD = smoothD(brushPts(nk, interp(c.tp ? [9, 10, 10, 9] : [13, 14, 14, 13], nk.length)), true, 0.9);
        S.add(Z.OVER + 3, sp(neckD, cp.color || '#f1efe9'));
        var sc = S.clip(neckD); var scl = ''; nk.forEach(function (p, j) { if (j % 2) scl += 'M' + r1(p.x - 4) + ' ' + r1(p.y - 3) + 'l4 3l4 -3'; });
        S.add(Z.OVER + 3.01, sl(scl, '#c9c6bf', 1.2, { clip: sc }));
        var hp = c.tp ? cam.pv([-(b.srx + 8), b.sy + 12, 12]) : cam.pv([-(b.srx + 18), b.sy + 22, 10]);
        o += sp('M' + r1(hp.x + 8) + ' ' + r1(hp.y + 12) + 'Q' + r1(hp.x - 2) + ' ' + r1(hp.y + 6) + ' ' + r1(hp.x - 10) + ' ' + r1(hp.y - 2) + 'Q' + r1(hp.x - 12) + ' ' + r1(hp.y - 12) + ' ' + r1(hp.x) + ' ' + r1(hp.y - 12) + 'Q' + r1(hp.x + 12) + ' ' + r1(hp.y - 8) + ' ' + r1(hp.x + 12) + ' ' + r1(hp.y + 4) + 'Z', cp.color || '#f1efe9');
        o += sf(ellD(hp.x - 4, hp.y - 6, 2.4, 2.8), '#c8202c') + sl('M' + r1(hp.x - 11) + ' ' + r1(hp.y) + 'l-5 1l-2 -2M' + r1(hp.x - 16) + ' ' + r1(hp.y + 1) + 'l-2 2', '#c8202c', 1.4);
        var tp = cam.pv([(b.srx + 8), b.obi[0] - 4, 8]), tp2 = cam.pv([(b.srx + 12), 18, 6]);
        if (c.tp) { tp = cam.pv([b.srx + 3, b.obi[0] - 2, 8]); tp2 = cam.pv([b.srx + 7, 52, 6]); }
        S.add(Z.ARM + 0.4, sp(capsD(tp, tp2, 6 * c.u, 2.5 * c.u), cp.color || '#f1efe9'));
        z = Z.OVER + 3.1;
      } else if (kind === 'ghost') {
        o += sp('M' + r1(x - 13) + ' ' + r1(y + 2) + 'Q' + r1(x - 14) + ' ' + r1(y - 18) + ' ' + r1(x) + ' ' + r1(y - 18) + 'Q' + r1(x + 14) + ' ' + r1(y - 18) + ' ' + r1(x + 13) + ' ' + r1(y + 2) + 'Q' + r1(x + 10) + ' ' + r1(y + 14) + ' ' + r1(x + 2) + ' ' + r1(y + 18) + 'Q' + r1(x + 10) + ' ' + r1(y + 26) + ' ' + r1(x + 2) + ' ' + r1(y + 30) + 'Q' + r1(x - 6) + ' ' + r1(y + 22) + ' ' + r1(x - 4) + ' ' + r1(y + 14) + 'Q' + r1(x - 12) + ' ' + r1(y + 10) + ' ' + r1(x - 13) + ' ' + r1(y + 2) + 'Z', cp.color || '#bfe6f2');
        o += sp('M' + r1(x - 9) + ' ' + r1(y - 13) + 'L' + r1(x) + ' ' + r1(y - 24) + 'L' + r1(x + 9) + ' ' + r1(y - 13) + 'Z', '#ffffff', { w: 1.8 });
        o += sl('M' + r1(x - 7) + ' ' + r1(y - 4) + 'l4 0M' + r1(x + 3) + ' ' + r1(y - 4) + 'l4 0', '#3a7a4a', 2.4) + sl('M' + r1(x - 3) + ' ' + r1(y + 3) + 'q3 2 6 0', OUT, 1.6);
      } else if (kind === 'wisps') {
        for (var s = -1; s <= 1; s += 2) {
          var wx = 100 + s * (c.tp ? 58 : 70), wy = cp.cy != null ? cp.cy + s * 14 : (cp.y || 110 + s * 14);
          o += sf('M' + r1(wx) + ' ' + r1(wy - 26) + 'Q' + r1(wx + 12) + ' ' + r1(wy - 6) + ' ' + r1(wx + 9) + ' ' + r1(wy + 6) + 'Q' + r1(wx) + ' ' + r1(wy + 14) + ' ' + r1(wx - 9) + ' ' + r1(wy + 6) + 'Q' + r1(wx - 11) + ' ' + r1(wy - 8) + ' ' + r1(wx) + ' ' + r1(wy - 26) + 'Z', cp.color || '#8fe0ff', { op: 0.8 }) + sf(ellD(wx, wy + 2, 5, 7), '#ffffff', { op: 0.9 });
        }
      } else if (kind === 'imp') {
        var sp2 = c.off ? cam.pv([-(b.srx + 4), b.sy + 8, 6]) : c.tp ? cam.pv([b.srx - 2, b.sy + 6, 4]) : cam.pv([b.srx + 6, b.sy + 16, 4]); x = sp2.x + (c.off ? -4 : 4); y = sp2.y - 10;
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
        var rcy = cp.cy != null ? cp.cy : 150, rox = c.tp ? 30 : 40;
        var arcPts = function (r) { var pp = []; for (var q = 0; q <= 16; q++) { var an = Math.PI * (0.15 + q / 16 * 1.25); pp.push({ x: 100 + sd * (rox + Math.cos(an) * r * 0.9), y: rcy + Math.sin(an) * r * 0.55 }); } return pp; };
        cols.forEach(function (cc, ci) { o += sl(smoothD(arcPts(48 - ci * 4), false), cc, 5); });
        z = cp.front ? Z.FRONT : Z.BACK - 3;
      } else if (kind === 'splash') {
        var colsS = ['#e8423a', '#f59a2a', '#f5d02a', '#4fb34a', '#3a9ad8', '#9b4de0'];
        for (var sI = 0; sI < 6; sI++) {
          var ax = 100 + (sI - 2.5) * 22, ay = (cp.cy != null ? cp.cy : 176) - Math.abs(sI - 2.5) * 6;
          o += sf('M' + r1(ax - 10) + ' ' + r1(ay) + 'Q' + r1(ax) + ' ' + r1(ay - 16) + ' ' + r1(ax + 14) + ' ' + r1(ay - 6) + 'Q' + r1(ax + 4) + ' ' + r1(ay + 6) + ' ' + r1(ax - 10) + ' ' + r1(ay) + 'Z', colsS[sI], { op: 0.95 });
        }
        z = Z.ARM + 0.3;
      }
      S.add(z, o);
    })();
  }

  function drawFx(c, fx) {
    if (c.tp) return drawFxCool(c, fx);
    var S = c.S;
    if (fx === 'joy') { S.add(Z.FRONT + 5, sl('M40 60l-8 -6M36 74l-10 0M44 48l-4 -9', '#f5a623', 3.4) + sl('M162 58l9 -7M166 72l10 -1M156 46l5 -9', '#f5a623', 3.4)); }
    if (fx === 'surprise') { S.add(Z.FRONT + 5, sp('M156 20l6 0l-2 30l-3 0Z', '#e8423a', { w: 1.6 }) + sp(ellD(159.5, 57, 3, 3), '#e8423a', { w: 1.6 }) + sp('M170 26l6 1l-5 28l-3 -1Z', '#e8423a', { w: 1.6 }) + sp(ellD(170, 61, 3, 3), '#e8423a', { w: 1.6 })); }
    if (fx === 'focus') { S.add(Z.FRONT + 5, sl('M34 40l6 8M166 40l-6 8', '#6a8ab8', 2.4, { op: 0.8 })); }
    // 相棒道場の効果
    if (fx === 'swing') { // 向いている側に弧（左向きなら左）
      var mx = Math.sin(c.yaw * D2R) < -0.2 ? function (v) { return 200 - v; } : function (v) { return v; };
      var arc1 = 'M' + mx(150) + ' 96Q' + mx(198) + ' 136 ' + mx(146) + ' 186', arc2 = 'M' + mx(136) + ' 110Q' + mx(172) + ' 140 ' + mx(134) + ' 172';
      S.add(Z.FRONT + 5, '<path d="' + arc1 + '" fill="none" stroke="#fff6d8" stroke-width="12" stroke-linecap="round" opacity=".9"/>' + sl(arc1, '#f5a623', 3.2) + sl(arc2, '#f5a623', 2.2, { op: 0.7 }));
    }
    if (fx === 'search') { S.add(Z.FRONT + 5, txt(166, 58, '?', 34, '#2f6ab0', { fw: 900 }) + sparkle(150, 130, 8, '#ffe27a') + sparkle(172, 150, 5, '#ffe27a')); }
    if (fx === 'help') { S.add(Z.FRONT + 5, sp('M152 40a16 16 0 1 1 0.1 0Z', '#fff6d8', { w: 2 }) + txt(152, 50, '！', 24, '#d8452c', { fw: 900 })); }
    if (fx === 'sweat') { S.add(Z.FRONT + 5, sp('M160 70q-7 10 0 13q7 -3 0 -13Z', '#8fd0f0', { w: 1.8, sc: '#3a7ab0' }) + sp('M40 86q-5 8 0 10q5 -2 0 -10Z', '#8fd0f0', { w: 1.6, sc: '#3a7ab0' })); }
    if (fx === 'care') { S.add(Z.FRONT + 5, heartSvg(40, 118, 6, '#f07a9a') + heartSvg(28, 96, 4.5, '#f7a8c0') + heartSvg(168, 104, 5, '#f07a9a')); }
    if (fx === 'dizzy') { S.add(Z.FRONT + 5, starSvg(70, 66, 7, '#f5c542') + starSvg(100, 58, 6, '#f5c542') + starSvg(130, 66, 7, '#f5c542') + sl('M58 72Q100 50 142 72', '#b8862a', 1.6, { op: 0.6, dash: '3 4' })); }
    if (fx === 'dash') { S.add(Z.FRONT + 5, sl('M22 120h26M16 140h34M26 160h22', '#6a5a48', 3.2, { op: 0.7 })); }
    if (fx === 'cheer') { S.add(Z.FRONT + 5, sparkle(36, 60, 9, '#ffe27a') + sparkle(166, 52, 10, '#ffe27a') + sparkle(170, 110, 6, '#ffb8d0') + sparkle(30, 118, 6, '#ffb8d0')); }
    if (fx === 'note') { S.add(Z.FRONT + 5, sp('M160 36v-20l14 -4v20', 'none', { w: 2.6 }) + sp(ellD(157, 37, 4.5, 3.5), OUT) + sp(ellD(171, 33, 4.5, 3.5), OUT)); }
  }

  // 顔のアップ用の viewBox（立ちポーズの頭が真ん中に来る正方形）。size は cool の頭まわりの広さ
  function faceBox(def, opt) {
    opt = opt || {};
    var st = opt.style || NinjaArt.style;
    if (st === 'cute') return '28 12 144 144';
    var bn = def.build === 'big' || def.build === 'small' || (st === 'official' && def.build === 'chick') ? def.build : 'normal', b = (st === 'official' ? OFF_BUILDS : COOL_BUILDS)[bn];
    var cy = GROUND - b.headY * Math.cos(9 * D2R), sz = (opt.size || 64) * b.hs / 0.37;
    if (st === 'official') { sz = (opt.size || 64) * 2.3 * b.hs / 0.77; return r1(100 - sz / 2) + ' ' + r1(cy - sz * 0.5 + 4) + ' ' + r1(sz) + ' ' + r1(sz); } // 大きな頭：あごまで入れて、まん中に
    return r1(100 - sz / 2) + ' ' + r1(cy - sz * (opt.up == null ? 0.46 : opt.up)) + ' ' + r1(sz) + ' ' + r1(sz);
  }

  // cool の効果：頭と手の位置に合わせる
  function drawFxCool(c, fx) {
    var S = c.S, h = c.headScr || { x: 100, y: 48, r: 17 }, x = h.x, y = h.y, r = h.r + 3, Z5 = Z.FRONT + 5;
    var hand = function (s) { return c.cam.pv(c.R.arms[s].H); };
    if (fx === 'joy') S.add(Z5, sl('M' + r1(x - r - 4) + ' ' + r1(y - 6) + 'l-8 -5M' + r1(x - r - 6) + ' ' + r1(y + 4) + 'l-9 0M' + r1(x - r + 2) + ' ' + r1(y - 16) + 'l-4 -8', '#f5a623', 2.8) + sl('M' + r1(x + r + 4) + ' ' + r1(y - 6) + 'l8 -5M' + r1(x + r + 6) + ' ' + r1(y + 4) + 'l9 0M' + r1(x + r - 2) + ' ' + r1(y - 16) + 'l4 -8', '#f5a623', 2.8));
    if (fx === 'surprise') { var ex = x + r + 10, ey = y - r - 6; S.add(Z5, sp('M' + r1(ex - 3) + ' ' + r1(ey - 14) + 'l5 0l-1.6 20l-2.4 0Z', '#e8423a', { w: 1.4 }) + sp(ellD(ex - 0.4, ey + 10, 2.4, 2.4), '#e8423a', { w: 1.4 }) + sp('M' + r1(ex + 6) + ' ' + r1(ey - 11) + 'l5 1l-4 19l-2.4 -0.6Z', '#e8423a', { w: 1.4 }) + sp(ellD(ex + 5, ey + 12, 2.4, 2.4), '#e8423a', { w: 1.4 })); }
    if (fx === 'focus') S.add(Z5, sl('M' + r1(x - r - 10) + ' ' + r1(y - r - 2) + 'l6 7M' + r1(x + r + 10) + ' ' + r1(y - r - 2) + 'l-6 7', '#6a8ab8', 2.4, { op: 0.85 }));
    if (fx === 'swing') { // 突き出した手の先に弧
      var hp = hand(1), dir = hp.x >= 100 ? 1 : -1, ax = hp.x + dir * 8, ay = hp.y;
      var a1 = 'M' + r1(ax - dir * 6) + ' ' + r1(ay - 40) + 'Q' + r1(ax + dir * 34) + ' ' + r1(ay) + ' ' + r1(ax - dir * 6) + ' ' + r1(ay + 40), a2 = 'M' + r1(ax - dir * 10) + ' ' + r1(ay - 26) + 'Q' + r1(ax + dir * 18) + ' ' + r1(ay) + ' ' + r1(ax - dir * 10) + ' ' + r1(ay + 26);
      S.add(Z5, '<path d="' + a1 + '" fill="none" stroke="#fff6d8" stroke-width="10" stroke-linecap="round" opacity=".9"/>' + sl(a1, '#f5a623', 3) + sl(a2, '#f5a623', 2, { op: 0.7 }));
    }
    if (fx === 'search') { var sh = hand(1), sd = sh.x >= 100 ? 1 : -1; S.add(Z5, txt(x + r + 12, y - 2, '?', 26, '#2f6ab0', { fw: 900 }) + sparkle(sh.x + sd * 22, sh.y + 16, 7, '#ffe27a') + sparkle(sh.x + sd * 34, sh.y + 2, 4.5, '#ffe27a')); }
    if (fx === 'help') S.add(Z5, sp('M' + r1(x + r + 16) + ' ' + r1(y - r - 18) + 'a13 13 0 1 1 0.1 0Z', '#fff6d8', { w: 2 }) + txt(x + r + 16, y - r - 9, '！', 19, '#d8452c', { fw: 900 }));
    if (fx === 'sweat') S.add(Z5, sp('M' + r1(x + r + 4) + ' ' + r1(y - 4) + 'q-6 9 0 11q6 -2 0 -11Z', '#8fd0f0', { w: 1.6, sc: '#3a7ab0' }) + sp('M' + r1(x - r - 6) + ' ' + r1(y + 6) + 'q-4 7 0 9q4 -2 0 -9Z', '#8fd0f0', { w: 1.4, sc: '#3a7ab0' }));
    if (fx === 'care') { var cl = hand(-1), cr = hand(1); S.add(Z5, heartSvg((cl.x + cr.x) / 2, Math.min(cl.y, cr.y) - 12, 5, '#f07a9a') + heartSvg(x - r - 8, y + 4, 4, '#f7a8c0') + heartSvg(x + r + 10, y - 8, 4.5, '#f07a9a')); }
    if (fx === 'dizzy') S.add(Z5, starSvg(x - 18, y - r - 2, 5.5, '#f5c542') + starSvg(x, y - r - 8, 5, '#f5c542') + starSvg(x + 18, y - r - 2, 5.5, '#f5c542') + sl('M' + r1(x - 28) + ' ' + r1(y - r + 2) + 'Q' + r1(x) + ' ' + r1(y - r - 16) + ' ' + r1(x + 28) + ' ' + r1(y - r + 2), '#b8862a', 1.4, { op: 0.6, dash: '3 4' }));
    if (fx === 'dash') { var dy = c.cam.pv([0, c.b.obi[0], 0]).y; S.add(Z5, sl('M' + 24 + ' ' + r1(dy - 30) + 'h24M18 ' + r1(dy - 10) + 'h32M28 ' + r1(dy + 10) + 'h20', '#6a5a48', 3, { op: 0.7 })); }
    if (fx === 'cheer') S.add(Z5, sparkle(x - r - 20, y + 6, 8, '#ffe27a') + sparkle(x + r + 26, y - 10, 9, '#ffe27a') + sparkle(x + r + 30, y + 44, 5.5, '#ffb8d0') + sparkle(x - r - 24, y + 50, 5.5, '#ffb8d0'));
    if (fx === 'note') S.add(Z5, sp('M' + r1(x + r + 10) + ' ' + r1(y - 8) + 'v-16l12 -3v16', 'none', { w: 2.4 }) + sp(ellD(x + r + 7, y - 7, 4, 3), OUT) + sp(ellD(x + r + 19, y - 10, 4, 3), OUT));
  }

  /* ---------------- 公開 ---------------- */
  var NinjaArt = {
    style: 'official',
    render: render,
    faceBox: faceBox,
    builds: function (style) { return style === 'cute' ? BUILDS : style === 'cool' ? COOL_BUILDS : OFF_BUILDS; },
    VIEWS: { front: 0, quarter: -38, side: -90, back: 180, walkR: 52, walkL: -52, backR: 128, backL: -128 },
    util: { mix: mix, dk: dk, lt: lt, lum: lum, ellD: ellD, smoothD: smoothD, polyD: polyD, sp: sp, sl: sl, sf: sf, sakuraSvg: sakuraSvg, starSvg: starSvg, sparkle: sparkle, heartSvg: heartSvg, txt: txt, OUT: OUT }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = NinjaArt;
  root.NinjaArt = NinjaArt;
})(typeof window !== 'undefined' ? window : globalThis);
