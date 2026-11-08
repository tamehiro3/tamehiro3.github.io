/* ニンジャ夜明け隊（RPG） — なめらかに描く小さな道具（萌え絵風の地図・建物・小物で使う。DESIGN.md §11.0・§11.3）
 * 座標は世界の単位（1マス = 32）。絵は「細かさ G（1単位 = G画素）」のキャンバスに g.scale(G, G) して描く（sheet）。
 * 画面に出すときは put で、世界の単位の大きさに合わせて置く（なめらかに縮む・広がる）。
 */
(function (root) {
  'use strict';
  var PT = {}, OUT = '#2b1d16';

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  // 単位で w×h の絵を細かさ G で。cv.u に G を覚えておく
  function sheet(w, h, G) {
    var cv = mk(w * G, h * G), g = cv.getContext('2d');
    g.scale(G, G); g.lineJoin = 'round'; g.lineCap = 'round';
    cv.u = G;
    return { cv: cv, g: g };
  }
  function put(c, cv, x, y) { c.drawImage(cv, x, y, cv.width / (cv.u || 1), cv.height / (cv.u || 1)); }

  // ---------- 色 ----------
  function rgb(h) { if (Array.isArray(h)) return h; h = String(h).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) { if (Array.isArray(r)) { g = r[1]; b = r[2]; r = r[0]; } return '#' + [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function dark(c, t) { return mix(c, '#140c10', t == null ? 0.3 : t); }
  function light(c, t) { return mix(c, '#ffffff', t == null ? 0.25 : t); }
  function rgba(c, a) { var A = rgb(c); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }

  // ---------- 乱数・ノイズ ----------
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(x, y, s) { var h = (x * 374761393 + y * 668265263 + (s || 0) * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  // なめらかなノイズ（p ごとにくり返す：くり返し模様のタイルの継ぎ目を消す）
  function vnoise(x, y, s, p) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var m = function (v) { return p ? ((v % p) + p) % p : v; };
    var a = hash(m(xi), m(yi), s), b = hash(m(xi + 1), m(yi), s), c = hash(m(xi), m(yi + 1), s), d = hash(m(xi + 1), m(yi + 1), s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // ---------- 描く（g は 2D コンテキスト。座標は単位） ----------
  function fill(g, x, y, w, h, col) { if (w <= 0 || h <= 0) return; g.fillStyle = col; g.fillRect(x, y, w, h); }
  function dot(g, x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  function oval(g, cx, cy, rx, ry, col) { if (rx <= 0 || ry <= 0) return; g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  function path(g, pts) { g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); }
  function poly(g, pts, col) { path(g, pts); g.fillStyle = col; g.fill(); }
  function line(g, pts, col, lw) { g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.strokeStyle = col; g.lineWidth = lw || 1; g.stroke(); }
  function rrect(g, x, y, w, h, r, col) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    if (col) { g.fillStyle = col; g.fill(); }
  }
  // ちらし：丸い点をまく（r は乱数）
  function speck(g, x, y, w, h, cols, n, r, rad) { for (var i = 0; i < n; i++) oval(g, x + r() * w, y + r() * h, rad || 0.7, (rad || 0.7) * 0.8, cols[Math.floor(r() * cols.length)]); }
  // 2色をまぜて塗る（a の上に b を t の濃さで）
  function blend(g, x, y, w, h, a, b, t) { fill(g, x, y, w, h, a); g.save(); g.globalAlpha *= t; fill(g, x, y, w, h, b); g.restore(); }
  // 縦のグラデーション
  function vgrad(g, x, y, w, h, cols) {
    var gr = g.createLinearGradient(0, y, 0, y + h);
    cols.forEach(function (c, i) { gr.addColorStop(cols.length > 1 ? i / (cols.length - 1) : 0, c); });
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
  // やわらかい影（楕円。まん中が濃い）
  function shade(g, cx, cy, rx, ry, a, col) {
    if (rx <= 0 || ry <= 0) return;
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, rx), c = col || '16,12,20';
    gr.addColorStop(0, 'rgba(' + c + ',' + a + ')'); gr.addColorStop(0.6, 'rgba(' + c + ',' + (a * 0.7) + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // 描いた絵の外形に、なめらかな輪郭（外側に w 単位）。cv は細かさ cv.u の絵。ふちに余白があること
  function outline(cv, col, w) {
    var G = cv.u || 1, r = (w == null ? 1 : w) * G, W = cv.width, H = cv.height;
    var sil = mk(W, H), s = sil.getContext('2d');
    s.drawImage(cv, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = col || OUT; s.fillRect(0, 0, W, H);
    var out = mk(W, H), o = out.getContext('2d'), n = 16;
    for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; o.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); }
    o.drawImage(sil, 0, 0);
    o.drawImage(cv, 0, 0);
    out.u = G;
    return out;
  }
  // 白く光らせた絵（当たったとき）
  function white(cv) {
    if (cv._white) return cv._white;
    var c = mk(cv.width, cv.height), g = c.getContext('2d');
    g.drawImage(cv, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    c.u = cv.u; cv._white = c; return c;
  }

  PT.mk = mk; PT.sheet = sheet; PT.put = put; PT.rgb = rgb; PT.hex = hex; PT.mix = mix; PT.dark = dark; PT.light = light; PT.rgba = rgba;
  PT.rnd = rnd; PT.hash = hash; PT.vnoise = vnoise;
  PT.fill = fill; PT.dot = dot; PT.oval = oval; PT.path = path; PT.poly = poly; PT.line = line; PT.rrect = rrect; PT.speck = speck; PT.blend = blend; PT.vgrad = vgrad; PT.shade = shade;
  PT.outline = outline; PT.white = white; PT.OUT = OUT;
  root.NYT_PAINT = PT;
})(typeof window !== 'undefined' ? window : globalThis);
