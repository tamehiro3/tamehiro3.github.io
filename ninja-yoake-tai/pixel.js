/* ニンジャ夜明け隊（RPG） — ドット絵の道具
 * ・高い解像度で描いた絵（art.js の SVG・妖怪のキャンバス）を、決まったドット数の絵にする（pixelize）
 *   1ドットの中でいちばん多い色をとる。輪郭線の色は弱く、目の色は強く数え、外形に1ドットの輪郭をつける。
 * ・手で描くときの道具（1ドット単位の四角・楕円・多角形・ちらし・ディザ・あとから輪郭）
 * ・整数倍の拡大（ぼかさない）
 * 画面に依存するのは canvas と Image だけ。
 */
(function (root) {
  'use strict';
  var PIX = {};
  var OUT = '#2b1d16';                 // art.js・妖怪の輪郭線の色
  var OUT_RGB = [0x2b, 0x1d, 0x16];
  var EYES = ['#20161a', '#2b1d3a'];   // 目の色（art.js・妖怪）

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function rgb(h) { if (Array.isArray(h)) return h; h = String(h).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) { if (Array.isArray(r)) { g = r[1]; b = r[2]; r = r[0]; } return '#' + [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function dark(c, t) { return mix(c, '#140c10', t == null ? 0.3 : t); }
  function light(c, t) { return mix(c, '#ffffff', t == null ? 0.25 : t); }
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(x, y, s) { var h = (x * 374761393 + y * 668265263 + (s || 0) * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bayer(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
  function d2(a, r, g, b) { var dr = a[0] - r, dg = a[1] - g, db = a[2] - b; return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; }

  // ---------- 高い解像度の絵 → ドット絵 ----------
  // src は W*N × H*N のキャンバス。o: { cover（透明にする割合）, eye（目の色を残す割合）, line（線の色にする割合）,
  //   outline: 'in'（外形の内側1ドット）| 'none', outc（輪郭の色）, eyes: [目の色...], maxPal }
  PIX.fromCanvas = function (src, W, H, o) {
    o = o || {};
    var N = Math.round(src.width / W), SW = src.width;
    var d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    // パレット：多い色から（ふちのにじみの色は入れない）
    var cnt = new Map(), tot = 0, i, k;
    for (i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 250) continue;
      k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      cnt.set(k, (cnt.get(k) || 0) + 1); tot++;
    }
    var keys = Array.from(cnt.keys()).sort(function (a, b) { return cnt.get(b) - cnt.get(a); });
    var pal = [];
    for (i = 0; i < keys.length && pal.length < (o.maxPal || 40); i++) { if (cnt.get(keys[i]) < tot * 0.0008 && pal.length > 4) break; pal.push([(keys[i] >> 16) & 255, (keys[i] >> 8) & 255, keys[i] & 255]); }
    if (!pal.length) pal.push(OUT_RGB);
    var iOut = -1, eyeSet = {}, eyes = (o.eyes || EYES).map(rgb);
    pal.forEach(function (p, j) {
      if (d2(p, OUT_RGB[0], OUT_RGB[1], OUT_RGB[2]) < 25) iOut = j;
      eyes.forEach(function (e) { if (d2(p, e[0], e[1], e[2]) < 16) eyeSet[j] = 1; });
    });
    var memo = new Map();
    function near(r, g, b) {
      var key = (r << 16) | (g << 8) | b, m = memo.get(key);
      if (m != null) return m;
      var bi = 0, bd = 1e12;
      for (var j = 0; j < pal.length; j++) { var dd = d2(pal[j], r, g, b); if (dd < bd) { bd = dd; bi = j; } }
      memo.set(key, bi); return bi;
    }
    var idx = new Int16Array(W * H).fill(-1), NN = N * N;
    var coverT = NN * (o.cover == null ? 0.42 : o.cover), eyeT = NN * (o.eye == null ? 0.1 : o.eye), lineT = NN * (o.line == null ? 0.6 : o.line);
    var lo = N * 0.2, hi = N * 0.8, hist = new Float32Array(pal.length), used = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var op = 0, nOut = 0, nEye = 0, eyeIdx = -1;
      used.length = 0;
      for (var yy = 0; yy < N; yy++) {
        var row = ((y * N + yy) * SW + x * N) * 4;
        for (var xx = 0; xx < N; xx++) {
          var q = row + xx * 4;
          if (d[q + 3] < 128) continue;
          op++;
          var pi = near(d[q], d[q + 1], d[q + 2]);
          if (pi === iOut) { nOut++; continue; }
          if (eyeSet[pi]) { nEye++; eyeIdx = pi; continue; }
          if (hist[pi] === 0) used.push(pi);
          hist[pi] += (yy > lo && yy < hi && xx > lo && xx < hi) ? 2 : 1;
        }
      }
      var best = -1, bv = -1;
      for (var u = 0; u < used.length; u++) { var ui = used[u]; if (hist[ui] > bv) { bv = hist[ui]; best = ui; } hist[ui] = 0; }
      if (op < coverT) continue;
      if (nEye >= eyeT) best = eyeIdx;
      else if (best < 0 || nOut >= lineT) best = iOut >= 0 ? iOut : best;
      idx[y * W + x] = best;
    }
    var outc = rgb(o.outc || OUT), res = new Int16Array(idx);
    if (o.outline !== 'none') {
      var get = function (x, y) { return x < 0 || y < 0 || x >= W || y >= H ? -1 : idx[y * W + x]; };
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        if (idx[y * W + x] < 0) continue;
        if (get(x - 1, y) < 0 || get(x + 1, y) < 0 || get(x, y - 1) < 0 || get(x, y + 1) < 0) res[y * W + x] = -2;
      }
    }
    var cv = mk(W, H), img = cv.getContext('2d').createImageData(W, H), od = img.data;
    for (var p = 0; p < W * H; p++) {
      var v = res[p]; if (v === -1) continue;
      var col = v === -2 ? outc : pal[v];
      od[p * 4] = col[0]; od[p * 4 + 1] = col[1]; od[p * 4 + 2] = col[2]; od[p * 4 + 3] = 255;
    }
    cv.getContext('2d').putImageData(img, 0, 0);
    return cv;
  };
  // SVG の文字列（幅・高さは関数で受けとる）→ ドット絵（Promise）
  PIX.fromSvg = function (svgFn, W, H, o) {
    o = o || {};
    var N = o.N || 6;
    var svg = svgFn(W * N, H * N).replace('<svg ', '<svg shape-rendering="crispEdges" ');
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        try { var c = mk(W * N, H * N); c.getContext('2d').drawImage(im, 0, 0); res(PIX.fromCanvas(c, W, H, o)); } catch (e) { rej(e); }
      };
      im.onerror = rej;
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };
  // キャンバスに描く関数（N倍の大きさで描く）→ ドット絵（すぐ返る）
  PIX.fromDraw = function (W, H, N, fn, o) {
    var c = mk(W * N, H * N), g = c.getContext('2d');
    g.scale(N, N); fn(g);
    return PIX.fromCanvas(c, W, H, o);
  };
  // 白い影（攻撃が当たったとき）
  PIX.white = function (cv, col) {
    if (cv._white) return cv._white;
    var w = mk(cv.width, cv.height), g = w.getContext('2d');
    g.drawImage(cv, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = col || '#ffffff'; g.fillRect(0, 0, w.width, w.height);
    cv._white = w; return w;
  };
  // ぼかさずに拡大した絵
  PIX.scaled = function (cv, s) {
    var c = mk(cv.width * s, cv.height * s), g = c.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(cv, 0, 0, c.width, c.height);
    return c;
  };

  // ---------- 手で描く道具（g は 2D コンテキスト。座標は整数のドット） ----------
  function fill(g, x, y, w, h, col) { if (w <= 0 || h <= 0) return; g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function dot(g, x, y, col) { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function hl(g, x, y, w, col) { fill(g, x, y, w, 1, col); }
  function vl(g, x, y, h, col) { fill(g, x, y, 1, h, col); }
  // 楕円（中心は x+0.5 の位置を含む）
  function oval(g, cx, cy, rx, ry, col) {
    g.fillStyle = col;
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      var dy = (y + 0.5 - cy) / ry; if (dy * dy > 1) continue;
      var hw = rx * Math.sqrt(1 - dy * dy), x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
      if (x1 > x0) g.fillRect(x0, y, x1 - x0, 1);
    }
  }
  // 多角形（ドットのまん中が中なら塗る）
  function poly(g, pts, col) {
    var y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    g.fillStyle = col;
    for (var y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      var yc = y + 0.5, xs = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var j = 0; j + 1 < xs.length; j += 2) { var xa = Math.round(xs[j]), xb = Math.round(xs[j + 1]); if (xb > xa) g.fillRect(xa, y, xb - xa, 1); }
    }
  }
  // ちらし：範囲に色の点をまく（r は乱数）
  function speck(g, x, y, w, h, cols, n, r) { for (var i = 0; i < n; i++) dot(g, x + Math.floor(r() * w), y + Math.floor(r() * h), cols[Math.floor(r() * cols.length)]); }
  // ディザ：a と b を t（0〜1）の割合でまぜる
  function dither(g, x, y, w, h, a, b, t) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) dot(g, x + i, y + j, bayer(x + i, y + j) < t ? b : a);
  }
  // 縦のグラデーション（ディザでつなぐ）
  function vgrad(g, x, y, w, h, cols) {
    var n = cols.length - 1;
    for (var j = 0; j < h; j++) {
      var t = h > 1 ? j / (h - 1) * n : 0, k = Math.min(n - 1, Math.floor(t)), f = t - k;
      for (var i = 0; i < w; i++) dot(g, x + i, y + j, n === 0 ? cols[0] : (bayer(x + i, y + j) < f ? cols[k + 1] : cols[k]));
    }
  }
  // 描いた絵の外形に、あとから1ドットの輪郭（外側）
  function outlineCanvas(cv, col, inside) {
    var W = cv.width, H = cv.height, g = cv.getContext('2d'), im = g.getImageData(0, 0, W, H), d = im.data, A = new Uint8Array(W * H), i;
    for (i = 0; i < W * H; i++) A[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    var c = rgb(col || OUT);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var p = y * W + x, on = A[p];
      var nb = (x > 0 && A[p - 1]) + (x < W - 1 && A[p + 1]) + (y > 0 && A[p - W]) + (y < H - 1 && A[p + W]);
      var edge = inside ? (on && (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !A[p - 1] || !A[p + 1] || !A[p - W] || !A[p + W])) : (!on && nb > 0);
      if (edge) { d[p * 4] = c[0]; d[p * 4 + 1] = c[1]; d[p * 4 + 2] = c[2]; d[p * 4 + 3] = 255; }
    }
    g.putImageData(im, 0, 0);
    return cv;
  }
  // 半透明やにじみを消す（a < 0.5 は透明、ほかは不透明）
  function harden(cv) {
    var g = cv.getContext('2d'), im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
    for (var i = 3; i < d.length; i += 4) d[i] = d[i] < 128 ? 0 : 255;
    g.putImageData(im, 0, 0); return cv;
  }

  PIX.mk = mk; PIX.rgb = rgb; PIX.hex = hex; PIX.mix = mix; PIX.dark = dark; PIX.light = light; PIX.rnd = rnd; PIX.hash = hash; PIX.bayer = bayer;
  PIX.fill = fill; PIX.dot = dot; PIX.hl = hl; PIX.vl = vl; PIX.oval = oval; PIX.poly = poly; PIX.speck = speck; PIX.dither = dither; PIX.vgrad = vgrad;
  PIX.outline = outlineCanvas; PIX.harden = harden; PIX.OUT = OUT;
  root.NYT_PIX = PIX;
})(typeof window !== 'undefined' ? window : globalThis);
