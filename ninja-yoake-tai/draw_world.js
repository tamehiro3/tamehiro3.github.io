/* ニンジャ夜明け隊（RPG） — 地図の絵（地面・木・建物・小物）。萌え絵風のなめらかな絵（DESIGN.md §11.0・§11.3）
 * 1マス = 32単位（世界の単位）。画像ファイルは使わず、決まった手順で描く（paint.js の道具）。
 * ・地面：地図ごとに1枚の絵（1単位 = G画素。G は 2〜3）。草の上に道・石畳・砂・水などを重ね、上の材質は下の材質に面した辺を
 *   少し縮めて角を丸くする（下の材質が境目に見える）。形はベクターで描くので、境目はなめらか。
 * ・崖と壁は、上の面と前の面（見下ろしの立体）。茂み・岩・柵・橋も地面の絵に入れる。
 * ・木・松・竹・桜は1本ずつの絵、建物と置物も1つずつの絵（人と前後するため）。3倍の細かさで描き、外側になめらかな輪郭。
 * 光は左上から（左上が明るく、右下が暗い）。外形の輪郭はこげ茶。
 * 戦闘の絵が使う、なめらかな図形の道具（circle・ell など）も、ここに置く。
 */
(function (root) {
  'use strict';
  var PT = root.NYT_PAINT;
  var T = 32, OUT = '#2b1d16', GS = 3;   // GS：建物・木・小物を描く細かさ（1単位 = 3画素）
  var DW = {};
  var mk = PT.mk, fill = PT.fill, dot = PT.dot, oval = PT.oval, ppoly = PT.poly, pmix = PT.mix, dk = PT.dark, lt = PT.light, hash = PT.hash, vnoise = PT.vnoise, rgbA = PT.rgb;
  var FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","BIZ UDPGothic","Yu Gothic",sans-serif';
  // ================= 色（地図の雰囲気ごと） =================
  // g 草・p 道・st 石・sa 砂・gv 砂利・w 水（深い→浅い→泡）・r 岩・cf 崖の前の面・tr 葉・tk 幹・fl 花
  var BASE = {
    g: ['#2f5e2c', '#447c37', '#5a9a44', '#79b856'], p: ['#7e5a36', '#a97f4f', '#c79c66', '#ddb987'], st: ['#4f4c4a', '#75716c', '#928d86', '#b0aaa1'],
    sa: ['#b39662', '#cfb27a', '#e3cb96', '#f2e2b8'], gv: ['#5e5a4c', '#7a7462', '#968f7a', '#b2aa92'], w: ['#1d4a80', '#2a64a2', '#4584c4', '#d4ebfa'],
    r: ['#4a4642', '#68635d', '#878077', '#a59d92'], cf: ['#3e352f', '#594c43', '#76665a'], tr: ['#1d4824', '#2c632f', '#41803f', '#5f9f50'], tk: ['#46301e', '#6a4a2c', '#8a6640'],
    fl: ['#fff4ec', '#ffb2c8', '#ffe27a', '#c8b8ff'], cv: ['#3a302a', '#4c4038', '#5e5046', '#726254'], fo: ['#4a4648', '#625e60', '#7c787a', '#969294'],
    cl: ['#b8b0d8', '#d4cdec', '#ebe7f8', '#ffffff'], dkg: ['#1e1828', '#2a2238', '#382e4a', '#4a3e60'], sk: ['#6f8fd8', '#94b2ee', '#bcd2f8'],
    base: 'grass', top: 'g'
  };
  function th(o) { var t = {}; for (var k in BASE) t[k] = BASE[k]; for (var k2 in o) t[k2] = o[k2]; return t; }
  var THEME = {
    village: th({}),
    forest: th({ g: ['#244a24', '#356630', '#487f3d', '#62994c'], tr: ['#143a1e', '#215026', '#316a32', '#4a8643'], p: ['#6e5034', '#946e48', '#b28a5c', '#c8a674'] }),
    mountain: th({ g: ['#2c5238', '#3f6c48', '#56885a', '#74a470'], r: ['#4c4e56', '#6a6c74', '#8a8c92', '#a8aaae'], cf: ['#45434c', '#5f5d66', '#7b7982'], tr: ['#1b3d36', '#285446', '#386c58', '#52886c'], p: ['#6e624e', '#8e8068', '#ab9c82', '#c4b69c'] }),
    port: th({ g: ['#376630', '#4b823b', '#64a04b', '#84bc5e'] }),
    beach: th({ g: ['#3c6a33', '#518640', '#6aa24f', '#88bc62'], base: 'sand', tr: ['#1e4a2e', '#2c6038', '#3e7a48', '#58965c'] }),
    darkmount: th({ g: ['#26332c', '#35463b', '#46594b', '#5b6f5e'], r: ['#38353f', '#504c5a', '#696476', '#827e92'], cf: ['#2b2933', '#423f4b', '#5a5664'], tr: ['#132a26', '#1e3b34', '#2b4f45', '#3f665a'], p: ['#4e4840', '#686056', '#827a6e', '#9c9486'], gv: ['#3e3a3c', '#565052', '#6e686a', '#868082'], top: 'r' }),
    fortress: th({ g: ['#3a4434', '#4a5642', '#5c6a52', '#728062'], fo: ['#423e40', '#5a5658', '#747072', '#8e8a8c'], r: ['#2e2a2c', '#433e40', '#5a5456', '#726c6e'], cf: ['#3a2c22', '#523e2e', '#6c523c'], base: 'floor', top: 'r' }),
    cave: th({ cv: ['#30271f', '#43372d', '#56483b', '#6b5a4a'], r: ['#231c18', '#362b25', '#4b3d33', '#614f42'], cf: ['#271f1a', '#3a2e27', '#4f4035'], base: 'cave', top: 'r' }),
    seacave: th({ cv: ['#28323a', '#38444c', '#48565e', '#5c6a72'], r: ['#1a2228', '#2a343c', '#3c4850', '#505e66'], cf: ['#1e262c', '#2e3840', '#424e56'], w: ['#14365e', '#1e4c7c', '#326aa0', '#b8d8f0'], base: 'cave', top: 'r' }),
    sky: th({ g: ['#b8b0d8', '#d4cdec', '#ebe7f8', '#ffffff'], p: ['#a6823e', '#c69e52', '#ddb86c', '#f0d496'], st: ['#a69a88', '#c2b6a2', '#dacfbc', '#f0e8d8'], base: 'cloud', tr: ['#a85070', '#cc7494', '#e89cb8', '#f8c8da'] }),
    under: th({ dkg: ['#1a1424', '#261e34', '#342946', '#45385c'], r: ['#17121f', '#251d31', '#352a45', '#47395c'], cf: ['#1a1422', '#2a2036', '#3c2f4c'], w: ['#141434', '#20204c', '#323272', '#9a8ad8'], tr: ['#221a30', '#30243f', '#402f52', '#544068'], base: 'dark', top: 'r' })
  };
  DW.THEME = THEME;
  // ================= 地面 =================
  // 材質：0 なし 1 空 2 草 3 洞の床 4 雲 5 根の国の土 6 砂 7 砂利 8 道 9 石畳 10 床 11 板 12 水 13 崖など（上面）
  var M_NAME = ['void', 'sky', 'grass', 'cave', 'cloud', 'dark', 'sand', 'gravel', 'path', 'stone', 'floor', 'deck', 'water', 'block'];
  var Z = [0, 1, 2, 2, 2, 2, 3, 4, 5, 6, 6, 7, 8, 9];          // 大きいほど上（上のものは縮んで、下のものが境目に見える）
  var INSET = [0, 3, 0, 0, 0, 0, 2, 2, 3, 2, 1, 0, 4, 0];      // 縮む量（単位）
  function matOf(ch, P) {
    switch (ch) {
      case 'x': return 0; case 'v': return 1; case 'd': return 3; case 'c': return 4; case 'k': case 'l': return 5;
      case 's': return 6; case 'g': return 7; case ',': return 8; case '_': return 9; case 'p': return 10; case ':': return 11;
      case '~': return 12; case '#': case 'D': case 'W': case 'S': return 13;
      case '.': case '"': case 'f': return 2;
    }
    return 255;   // 木・岩・茂み・柵・橋の下は、まわりの地面に合わせる（下の inherit）
  }
  function baseMat(P) { return P.base === 'sand' ? 6 : P.base === 'cave' ? 3 : P.base === 'cloud' ? 4 : P.base === 'dark' ? 5 : P.base === 'floor' ? 10 : 2; }
  // まわり4マスでいちばん多い地面（橋は水・空を優先）。なければ、その地図のふだんの地面
  function inherit(M, tiles, FW, FH, x, y, P) {
    var cnt = {}, best = -1, bn = 0, br = tiles[y * FW + x] === '=';
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var nx = x + d[0], ny = y + d[1]; if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) return;
      var m = M[ny * FW + nx]; if (m === 255 || m === 13) return;
      cnt[m] = (cnt[m] || 0) + 1;
    });
    if (br) { if (cnt[12]) return 12; if (cnt[1]) return 1; if (cnt[0]) return 0; return 12; }
    var bm = baseMat(P);
    Object.keys(cnt).forEach(function (k) { var n = cnt[k] + (+k === bm ? 0.5 : 0); if (n > bn) { bn = n; best = +k; } });
    return best < 0 ? bm : best;
  }
  function theme(F) { return THEME[F.def.theme] || THEME.village; }
  function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function mixA(A, B, t) { return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }

  // ---- 材質の模様（くり返しのタイル。地図の位置に合わせて塗る） ----
  var TS = 128, texCache = {};
  // 1画素の色（X, Y は単位。タイルの中で 0〜128）
  function texel(m, X, Y, P) {
    var n, n2, c, gr = (hash(Math.floor(X * 1.5), Math.floor(Y * 1.5), m) - 0.5) * 0.06;
    switch (m) {
      case 2: case 4: case 5: {
        var G = m === 2 ? P.g : m === 4 ? P.cl : P.dkg;
        n = vnoise(X / 32, Y / 32, m, 4); n2 = vnoise(X / 16, Y / 16, m + 20, 8);
        c = mixA(rgbA(G[1]), rgbA(G[2]), smooth(0.52, 0.8, n) * 0.85);
        c = mixA(c, rgbA(G[0]), smooth(0.36, 0.12, n2) * 0.45);
        break;
      }
      case 3: { var V = P.cv; n = vnoise(X / 32, Y / 32, 3, 4); n2 = vnoise(X / 16, Y / 16, 23, 8); c = mixA(rgbA(V[2]), rgbA(V[3]), smooth(0.6, 0.85, n) * 0.7); c = mixA(c, rgbA(V[1]), smooth(0.3, 0.1, n2) * 0.6); break; }
      case 6: { var S = P.sa; n = vnoise(X / 32, Y / 32, 6, 4); var rip = Math.sin((Y + n * 18) * Math.PI / 8); c = mixA(rgbA(S[2]), rgbA(S[3]), smooth(0.55, 0.8, n) * 0.6 + smooth(0.82, 0.98, rip) * 0.35); break; }
      case 7: { c = rgbA(P.gv[1]); break; }
      case 8: { var Pp = P.p; n = vnoise(X / 16, Y / 16, 8, 8); n2 = vnoise(X / 32, Y / 32, 28, 4); c = mixA(rgbA(Pp[2]), rgbA(Pp[1]), smooth(0.34, 0.12, n) * 0.6); c = mixA(c, rgbA(Pp[3]), smooth(0.65, 0.9, n2) * 0.45); break; }
      case 9: { c = rgbA(P.st[0]); break; }
      case 10: { c = rgbA(P.fo[0]); break; }
      case 11: { c = rgbA('#9a6e44'); break; }
      case 12: { var Wt = P.w; n = vnoise(X / 32, Y / 32, 12, 4); n2 = vnoise(X / 16, Y / 16, 32, 8); c = mixA(rgbA(Wt[1]), rgbA(Wt[0]), smooth(0.4, 0.15, n) * 0.7); c = mixA(c, rgbA(Wt[2]), smooth(0.7, 0.92, n2) * 0.3); gr *= 0.4; break; }
      case 14: { var R = P.r; n = vnoise(X / 16, Y / 16, 14, 8); c = mixA(rgbA(R[0]), rgbA(R[1]), smooth(0.45, 0.8, n) * 0.8); break; }   // 崖の上の岩
      case 15: { var R2 = P.r, G2 = P.g; n = vnoise(X / 32, Y / 32, 15, 4); n2 = vnoise(X / 16, Y / 16, 35, 8); c = mixA(rgbA(R2[1]), rgbA(R2[2]), smooth(0.6, 0.85, n2) * 0.5); c = mixA(c, rgbA(G2[1]), smooth(0.5, 0.65, n)); c = mixA(c, rgbA(G2[2]), smooth(0.72, 0.9, n) * 0.6); break; }   // 苔の生えた崖の上
      default: c = [255, 0, 255];
    }
    return [c[0] * (1 + gr), c[1] * (1 + gr), c[2] * (1 + gr)];
  }
  // タイルの上に描く物（砂利の石・石畳・床・板・水のさざなみ）。端は反対側にも描いて、継ぎ目を消す
  function wrapDraw(fn) { [-TS, 0, TS].forEach(function (dx) { [-TS, 0, TS].forEach(function (dy) { fn(dx, dy); }); }); }
  var TEXV = {
    7: function (g, P) {
      var r = PT.rnd(77), Gv = P.gv;
      for (var i = 0; i < 260; i++) {
        var x = r() * TS, y = r() * TS, rx = 1 + r() * 1.6, ry = rx * (0.6 + r() * 0.3), c = Gv[r() < 0.35 ? 0 : r() < 0.7 ? 2 : 3];
        wrapDraw(function (dx, dy) { oval(g, x + dx, y + dy + 0.5, rx, ry, 'rgba(0,0,0,.18)'); oval(g, x + dx, y + dy, rx, ry, c); oval(g, x + dx - rx * 0.3, y + dy - ry * 0.35, rx * 0.4, ry * 0.3, 'rgba(255,255,255,.35)'); });
      }
    },
    9: function (g, P) {   // 石畳：ずらして並べた石（16×8）
      var St = P.st;
      for (var row = 0; row < TS / 8; row++) for (var col = 0; col <= TS / 16; col++) {
        var off = (row % 2) * 8, x = col * 16 - off, y = row * 8, v = hash(col, row, 19);
        var c = v < 0.3 ? pmix(St[2], St[1], 0.5) : v > 0.75 ? pmix(St[2], St[3], 0.5) : St[2];
        wrapDraw(function (dx, dy) {
          PT.rrect(g, x + dx + 0.7, y + dy + 0.7, 14.6, 6.6, 2, c);
          g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + dx + 1.8, y + dy + 1.2, 12, 1);
          g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x + dx + 1.8, y + dy + 6, 12.5, 1);
        });
      }
    },
    10: function (g, P) {   // 床：大きな石の板（16×16）
      var Fo = P.fo;
      for (var row = 0; row < TS / 16; row++) for (var col = 0; col < TS / 16; col++) {
        var x = col * 16, y = row * 16, v = hash(col, row, 29), c = v < 0.3 ? pmix(Fo[2], Fo[1], 0.4) : Fo[2];
        PT.rrect(g, x + 0.7, y + 0.7, 14.6, 14.6, 1.6, c);
        g.fillStyle = PT.rgba(Fo[3], 0.7); g.fillRect(x + 1.5, y + 1.2, 13, 1); g.fillRect(x + 1.2, y + 1.5, 1, 13);
        g.fillStyle = PT.rgba(Fo[1], 0.8); g.fillRect(x + 2, y + 14, 13, 0.8); g.fillRect(x + 14, y + 2, 0.8, 12.5);
      }
    },
    11: function (g) {   // 板の床（横の板）
      for (var row = 0; row < TS / 8; row++) {
        var y = row * 8;
        g.fillStyle = hash(row, 0, 41) < 0.5 ? '#a27548' : '#946840'; g.fillRect(0, y, TS, 8);
        g.fillStyle = '#4a301c'; g.fillRect(0, y, TS, 0.9);
        g.fillStyle = 'rgba(255,230,180,.28)'; g.fillRect(0, y + 1, TS, 0.8);
        for (var k = 0; k < 3; k++) { var sx = Math.floor((hash(row, k, 43) * 40 + k * 43) % TS); g.fillStyle = '#5a3a22'; g.fillRect(sx, y, 0.9, 8); oval(g, sx + 2.5, y + 4, 0.6, 0.6, '#4a301c'); }
        for (var j = 0; j < 4; j++) { var gx = hash(row, j, 47) * TS; g.fillStyle = 'rgba(70,40,20,.25)'; g.fillRect(gx, y + 3 + j % 3, 6 + j * 2, 0.6); }
      }
    },
    12: function (g, P) {   // 水：さざなみ
      var r = PT.rnd(1212), Wt = P.w;
      g.lineCap = 'round';
      for (var i = 0; i < 46; i++) {
        var x = r() * TS, y = r() * TS, w = 4 + r() * 7;
        wrapDraw(function (dx, dy) { g.strokeStyle = PT.rgba(Wt[2], 0.75); g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + dx - w, y + dy); g.quadraticCurveTo(x + dx, y + dy - 1.8, x + dx + w, y + dy); g.stroke(); });
      }
    }
  };
  // むらの色は 1単位 = 1画素で計算して、なめらかに広げる（やわらかい模様なので細かく計算しなくてよい。軽くするため）
  var noiseCache = {};
  function lowTex(m, P, key) {
    var k = key + '|' + m;
    if (noiseCache[k]) return noiseCache[k];
    var cv = mk(TS, TS), g = cv.getContext('2d'), img = g.createImageData(TS, TS), D = img.data;
    for (var py = 0; py < TS; py++) for (var px = 0; px < TS; px++) {
      var c = texel(m, px + 0.5, py + 0.5, P), q = (py * TS + px) * 4;
      D[q] = c[0]; D[q + 1] = c[1]; D[q + 2] = c[2]; D[q + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return (noiseCache[k] = cv);
  }
  function texture(m, P, G, key) {
    var k = key + '|' + m + '|' + G;
    if (texCache[k]) return texCache[k];
    var N = TS * G, cv = mk(N, N), g = cv.getContext('2d');
    // くり返しの模様として広げる（端も反対側とつながって、継ぎ目が出ない）
    g.imageSmoothingEnabled = true;
    g.save(); g.scale(G, G); g.fillStyle = g.createPattern(lowTex(m, P, key), 'repeat'); g.fillRect(0, 0, TS, TS); g.restore();
    if (TEXV[m]) { g.save(); g.scale(G, G); TEXV[m](g, P); g.restore(); }
    return (texCache[k] = cv);
  }
  function patternOf(g, m, P, G, key, H) {
    if (m === 0) return '#07060c';
    if (m === 1) { var gr = g.createLinearGradient(0, 0, 0, Math.max(H, 700)); gr.addColorStop(0, P.sk[0]); gr.addColorStop(0.5, P.sk[1]); gr.addColorStop(1, P.sk[2]); return gr; }
    if (m === 13) return P.r[1];
    var p = g.createPattern(texture(m, P, G, key), 'repeat');
    if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([1 / G, 0, 0, 1 / G, 0, 0]));
    return p;
  }
  // 上の材質の形：下の材質に面した辺（L R U D）だけ ins 縮め、両方が縮む角は丸く。縮まない辺はマスの外まで（あとでマスで切る）
  function shapePath(g, x0, y0, L, R, U, D, ins, rc) {
    var a = L ? x0 + ins : x0 - 2, b = R ? x0 + T - ins : x0 + T + 2, c = U ? y0 + ins : y0 - 2, d = D ? y0 + T - ins : y0 + T + 2;
    var rUL = L && U ? rc : 0, rUR = R && U ? rc : 0, rDR = R && D ? rc : 0, rDL = L && D ? rc : 0;
    g.beginPath(); g.moveTo(a + rUL, c);
    g.lineTo(b - rUR, c); if (rUR) g.arcTo(b, c, b, c + rUR, rUR);
    g.lineTo(b, d - rDR); if (rDR) g.arcTo(b, d, b - rDR, d, rDR);
    g.lineTo(a + rDL, d); if (rDL) g.arcTo(a, d, a, d - rDL, rDL);
    g.lineTo(a, c + rUL); if (rUL) g.arcTo(a, c, a + rUL, c, rUL);
    g.closePath();
  }
  var RIM = { 6: function (P) { return P.sa[1]; }, 8: function (P) { return P.p[0]; }, 9: function (P) { return P.st[0]; }, 10: function (P) { return P.fo[0]; } };
  function upperCell(g, x0, y0, m, ins, nb, pat, P) {
    var L = nb[0] >= 0, R = nb[1] >= 0, U = nb[2] >= 0, D = nb[3] >= 0, low = -1, q;
    for (q = 0; q < 8; q++) if (nb[q] >= 0) { low = nb[q]; break; }
    g.save(); g.beginPath(); g.rect(x0, y0, T, T); g.clip();
    g.fillStyle = pat(low); g.fillRect(x0, y0, T, T);
    var strip = ins + 8;
    if (L && nb[0] !== low) { g.fillStyle = pat(nb[0]); g.fillRect(x0, y0, strip, T); }
    if (R && nb[1] !== low) { g.fillStyle = pat(nb[1]); g.fillRect(x0 + T - strip, y0, strip, T); }
    if (U && nb[2] !== low) { g.fillStyle = pat(nb[2]); g.fillRect(x0, y0, T, strip); }
    if (D && nb[3] !== low) { g.fillStyle = pat(nb[3]); g.fillRect(x0, y0 + T - strip, T, strip); }
    var water = m === 12, rim = RIM[m] ? RIM[m](P) : null;
    shapePath(g, x0, y0, L, R, U, D, ins, ins + 5);
    if (water) { g.strokeStyle = 'rgba(14,22,30,.3)'; g.lineWidth = 4.5; g.stroke(); }   // 水ぎわの陸はぬれて暗い
    g.fillStyle = pat(m); g.fill();
    if (water) {
      g.save(); g.clip(); g.strokeStyle = PT.rgba(P.w[2], 0.5); g.lineWidth = 8; g.stroke(); g.restore();   // 浅いところ
      g.strokeStyle = PT.rgba(P.w[3], 0.95); g.lineWidth = 1.5; g.stroke();                                // 泡
    } else if (rim) { g.strokeStyle = rim; g.lineWidth = 1.3; g.stroke(); }
    // 内の角（ななめだけ下のもの）は小さく欠ける
    [[4, 0, 2, x0, y0], [5, 1, 2, x0 + T, y0], [6, 0, 3, x0, y0 + T], [7, 1, 3, x0 + T, y0 + T]].forEach(function (k) {
      var d = nb[k[0]]; if (d < 0 || nb[k[1]] >= 0 || nb[k[2]] >= 0) return;
      g.beginPath(); g.arc(k[3], k[4], ins + 0.5, 0, Math.PI * 2);
      g.fillStyle = pat(d); g.fill();
      if (water) { g.strokeStyle = PT.rgba(P.w[3], 0.95); g.lineWidth = 1.5; g.stroke(); } else if (rim) { g.strokeStyle = rim; g.lineWidth = 1.3; g.stroke(); }
    });
    g.restore();
  }
  // 地図の大きさと画面の細かさから、地面の細かさ（1単位の画素）を決める。大きな地図は 2（メモリのため）
  DW.groundScale = function (F, Sd) {
    var px = F.w * T * F.h * T, G = Math.max(2, Math.min(3, Math.round(Sd || 2)));
    while (G > 2 && px * G * G > 9e6) G--;
    return G;
  };
  DW.buildGround = function (F, G) {
    G = G || 2;
    var P = theme(F), key = F.def.theme || 'village', FW = F.w, FH = F.h, W = FW * T, H = FH * T;
    var cv = mk(W * G, H * G), g = cv.getContext('2d');
    g.scale(G, G); g.lineJoin = 'round'; g.lineCap = 'round';
    cv.u = G;
    var at = function (x, y) { if (x < 0 || y < 0 || x >= FW || y >= FH) return null; return F.tiles[y * FW + x]; };
    // マスごとの材質
    var M = new Uint8Array(FW * FH), i;
    for (i = 0; i < FW * FH; i++) M[i] = matOf(F.tiles[i], P);
    var M0 = M.slice();
    for (i = 0; i < FW * FH; i++) if (M0[i] === 255) M[i] = inherit(M0, F.tiles, FW, FH, i % FW, Math.floor(i / FW), P);
    var pats = {}, pat = function (m) { return pats[m] || (pats[m] = patternOf(g, m, P, G, key, H)); };
    // 1) 地の材質（同じ材質のマスをまとめて塗る）
    var byM = {};
    for (i = 0; i < FW * FH; i++) (byM[M[i]] = byM[M[i]] || []).push(i);
    Object.keys(byM).forEach(function (k) { g.beginPath(); byM[k].forEach(function (j) { g.rect((j % FW) * T, Math.floor(j / FW) * T, T, T); }); g.fillStyle = pat(+k); g.fill(); });
    // 2) 上の材質の形（下の材質に面した辺を縮め、角を丸く）
    var NBD = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var cy = 0; cy < FH; cy++) for (var cx = 0; cx < FW; cx++) {
      var m = M[cy * FW + cx], ins = INSET[m]; if (!ins) continue;
      var nb = [], any = false;
      for (var q = 0; q < 8; q++) {
        var nx = cx + NBD[q][0], ny = cy + NBD[q][1], n = (nx < 0 || ny < 0 || nx >= FW || ny >= FH) ? m : M[ny * FW + nx];
        nb[q] = (Z[n] < Z[m] && n !== 0) ? n : -1; if (nb[q] >= 0) any = true;
      }
      if (any) upperCell(g, cx * T, cy * T, m, ins, nb, pat, P);
    }
    // 3) 空に面した雲は、もこもこに
    if (key === 'sky') cloudPuffs(g, M, FW, FH, P);
    // 4) 細かいもの（草の葉・花・小石・彼岸花）
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) {
      var ch = at(x, y), base = M[y * FW + x], rr = PT.rnd(x * 7919 + y * 104729 + 17), ox = x * T, oy = y * T;
      if (base === 2 || base === 4 || base === 5) blades(g, ox, oy, base === 2 ? P.g : base === 4 ? P.cl : P.dkg, rr, ch === '"' ? 0 : 3);
      if (ch === '"') tallGrass(g, ox, oy, P.g, rr);
      if (ch === 'f') flowers(g, ox, oy, P, rr);
      if (ch === ',') pebbles(g, ox, oy, P.p, rr);
      if (ch === 'l') lilies(g, ox, oy, rr);
      if (ch === 'd' && rr() < 0.4) pebbles(g, ox, oy, P.cv, rr);
    }
    // 5) 崖・壁（上の面と前の面）と、その下の影
    var bpats = { rock: patternOf(g, 14, P, G, key, H), moss: patternOf(g, 15, P, G, key, H) };
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) { var c2 = at(x, y); if (c2 === '#' || c2 === 'D' || c2 === 'W' || c2 === 'S') block(g, c2, x, y, at, P, bpats); }
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) { var c4 = at(x, y); if (c4 !== '#' && c4 !== 'D' && c4 !== 'W' && c4 !== 'S' && c4 !== 'x') wallShadow(g, x, y, at); }
    // 6) 背の低い物（茂み・岩・柵・橋）
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) {
      var c3 = at(x, y), vv = Math.floor(hash(x, y, 5) * 3);
      if (c3 === 't') PT.put(g, bushSprite(P, key, vv), x * T - 2, y * T - 2);
      else if (c3 === 'r') PT.put(g, rockSprite(P, key, vv), x * T - 2, y * T - 2);
      else if (c3 === 'F') fence(g, x, y, at);
      else if (c3 === '=') bridge(g, x, y, at, F);
    }
    texCache = {};   // 細かい模様は地面を作るときだけ使う（メモリを空ける。むらの小さな絵は残す）
    return cv;
  };
  // 地図の外（画面のすき間）の色
  DW.voidColor = function (F) { var t = F.def.theme; return t === 'sky' ? '#94b2ee' : t === 'cave' || t === 'seacave' || t === 'under' ? '#07060c' : '#0b0d16'; };

  // 空に面した雲のふち：丸いもこもこ（下に影）
  function cloudPuffs(g, M, FW, FH, P) {
    var list = [];
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) {
      if (M[y * FW + x] !== 4) continue;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
        var nx = x + d[0], ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= FW || ny >= FH || M[ny * FW + nx] !== 1) return;
        for (var k = 0; k < 2; k++) {
          var t = (k + 0.5) / 2, h = hash(x * 3 + k, y * 5 + d[0] + d[1] * 2, 61);
          var px = x * T + (d[0] ? (d[0] < 0 ? 1 : T - 1) : t * T), py = y * T + (d[1] ? (d[1] < 0 ? 1 : T - 1) : t * T);
          list.push([px + d[0] * 2, py + d[1] * 2, 8 + h * 4, d[1] > 0]);
        }
      });
    }
    list.forEach(function (p) { oval(g, p[0], p[1] + (p[3] ? 3 : 1.5), p[2], p[2] * 0.9, P.cl[0]); });
    list.forEach(function (p) { oval(g, p[0], p[1], p[2], p[2] * 0.9, P.cl[2]); oval(g, p[0] - p[2] * 0.3, p[1] - p[2] * 0.35, p[2] * 0.45, p[2] * 0.3, P.cl[3]); });
  }

  // ---- 細かいもの ----
  function blades(g, ox, oy, G, r, n) {
    g.lineWidth = 1.1; g.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var x = ox + 3 + r() * 26, y = oy + 6 + r() * 24, h = 3 + r() * 2.5, c = i % 2 ? G[3] : G[0];
      g.strokeStyle = PT.rgba(c, i % 2 ? 0.8 : 0.5);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 0.4, y - h * 0.6, x - 1.4, y - h); g.moveTo(x + 1.5, y); g.quadraticCurveTo(x + 1.8, y - h * 0.6, x + 2.8, y - h * 0.9); g.stroke();
    }
  }
  function tallGrass(g, ox, oy, G, r) {
    g.lineCap = 'round';
    for (var i = 0; i < 5; i++) {
      var x = ox + 4 + r() * 24, y = oy + 9 + r() * 20;
      PT.shade(g, x + 3, y + 1, 5, 1.6, 0.25);
      [[-4, -6, G[0]], [-1, -8, G[1]], [2, -9, G[2]], [5, -7, G[1]], [7, -5, G[0]]].forEach(function (b, k) {
        g.strokeStyle = b[2]; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x + 1.5 + k * 0.6, y); g.quadraticCurveTo(x + b[0] * 0.3 + 1.5, y + b[1] * 0.6, x + b[0] + 1.5, y + b[1]); g.stroke();
      });
      g.strokeStyle = G[3]; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x + 2.2, y - 2); g.quadraticCurveTo(x + 2.6, y - 6, x + 3.4, y - 8.5); g.stroke();
    }
  }
  function flowers(g, ox, oy, P, r) {
    for (var i = 0; i < 5; i++) {
      var x = ox + 4 + r() * 24, y = oy + 4 + r() * 24, c = P.fl[Math.floor(r() * P.fl.length)];
      g.strokeStyle = P.g[0]; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x - 0.4, y + 3.4); g.stroke();
      oval(g, x - 1.6, y + 3, 1.3, 0.6, P.g[2]);
      for (var k = 0; k < 5; k++) { var a = k * Math.PI * 2 / 5 - Math.PI / 2; oval(g, x + Math.cos(a) * 1.5, y + Math.sin(a) * 1.5, 1.25, 1.25, c); }
      oval(g, x, y, 0.75, 0.75, '#f6b030');
    }
  }
  function pebbles(g, ox, oy, Pp, r) {
    for (var i = 0; i < 3; i++) { var x = ox + 4 + r() * 24, y = oy + 4 + r() * 24, rx = 1.2 + r() * 0.8; oval(g, x, y + 0.5, rx, rx * 0.65, Pp[0]); oval(g, x - 0.3, y - 0.2, rx * 0.5, rx * 0.3, PT.rgba(Pp[3], 0.8)); }
  }
  function lilies(g, ox, oy, r) {
    g.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var x = ox + 6 + r() * 20, y = oy + 9 + r() * 18;
      g.strokeStyle = '#2e5a32'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x, y); g.stroke();
      g.strokeStyle = '#d8283e'; g.lineWidth = 1.1;
      for (var q = 0; q < 6; q++) { var a = q / 6 * Math.PI * 2 - Math.PI / 2; g.beginPath(); g.moveTo(x, y - 0.5); g.quadraticCurveTo(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6 - 1.5, x + Math.cos(a) * 3.8, y + Math.sin(a) * 3.2 - 2.6); g.stroke(); }
      oval(g, x, y - 0.5, 1.1, 1, '#f05468');
    }
  }
  // 崖（#）・洞の壁（D）・砦の壁（W：城の塀）・石垣（S）。上の面・前の面・低い地面に面したふち
  var KAWARA = ['#1c1c24', '#2c2c36', '#3e3e4c', '#5a5a6c'];
  function block(g, ch, x, y, at, P, bp) {
    var ox = x * T, oy = y * T, same = function (q) { return q === ch || q === null || q === 'x'; };
    var open = !same(at(x, y + 1));
    var fh = !open ? 0 : ch === '#' ? 20 : ch === 'D' ? 22 : ch === 'W' ? 22 : 16;
    var topH = T - fh, R = P.r, G = P.g, CF = P.cf, i, j;
    var mossy = ch === '#' && P.top === 'g';
    // 上の面
    if (ch === 'W') {   // 瓦
      fill(g, ox, oy, T, topH, KAWARA[1]);
      for (j = 0; j < topH; j += 5) {
        var off = (Math.floor((oy + j) / 5) % 2) * 2;
        for (i = -off; i < T; i += 4) { PT.rrect(g, ox + i + 0.3, oy + j + 0.6, 3.4, 4.2, 1.4, KAWARA[2]); fill(g, ox + i + 0.8, oy + j + 1, 2.4, 0.8, KAWARA[3]); }
        fill(g, ox, oy + j, T, 0.7, KAWARA[0]);
      }
    } else if (ch === 'S') {   // 石垣の上
      fill(g, ox, oy, T, topH, R[0]);
      for (j = 0; j < topH; j += 6) for (i = -((Math.floor((oy + j) / 6) % 2) * 5); i < T; i += 10) { PT.rrect(g, ox + i + 0.6, oy + j + 0.6, 8.8, 4.8, 1.6, hash(ox + i, oy + j, 3) < 0.3 ? R[3] : R[2]); fill(g, ox + i + 1.4, oy + j + 1, 7, 0.8, 'rgba(255,255,255,.22)'); }
    } else { g.fillStyle = mossy ? bp.moss : bp.rock; g.fillRect(ox, oy, T, topH); }
    // 前の面
    if (open) {
      var fy = oy + topH;
      if (ch === 'W') {
        PT.vgrad(g, ox, fy, T, 13, ['#f4efe2', '#e4dccb']);
        fill(g, ox, fy, T, 1.2, 'rgba(0,0,0,.35)');
        fill(g, ox, fy + 13, T, 1.4, '#1a1a20');
        fill(g, ox, fy + 14.4, T, fh - 14.4, '#2e2e36');
        g.save(); g.beginPath(); g.rect(ox, fy + 14.4, T, fh - 14.4); g.clip();
        g.strokeStyle = '#e8e2d4'; g.lineWidth = 1.1;
        for (i = -12; i < T + 12; i += 6) { g.beginPath(); g.moveTo(ox + i, fy + 14); g.lineTo(ox + i + 10, fy + fh + 1); g.moveTo(ox + i + 10, fy + 14); g.lineTo(ox + i, fy + fh + 1); g.stroke(); }
        g.restore();
      } else if (ch === 'S') {
        fill(g, ox, fy, T, fh, CF[0]);
        for (j = 0; j < fh; j += 5) for (i = -((Math.floor(j / 5) % 2) * 5); i < T; i += 10) { PT.rrect(g, ox + i + 0.6, fy + j + 0.6, 8.8, 3.8, 1.2, hash(ox + i, fy + j, 7) < 0.4 ? CF[2] : CF[1]); fill(g, ox + i + 1.4, fy + j + 0.9, 7, 0.7, 'rgba(255,255,255,.2)'); }
      } else {
        PT.vgrad(g, ox, fy, T, fh, [CF[2], CF[1], CF[0]]);
        g.lineCap = 'round';
        for (i = 0; i < 4; i++) {
          var sx = ox + 3 + hash(Math.floor(ox / T) * 4 + i, 0, 51) * 26, len = fh * (0.4 + hash(ox, i, 53) * 0.5);
          g.strokeStyle = PT.rgba(CF[0], 0.8); g.lineWidth = 1.1; g.beginPath(); g.moveTo(sx, fy + 2 + hash(i, ox, 55) * 4); g.lineTo(sx + 0.6, fy + 2 + len); g.stroke();
          g.strokeStyle = PT.rgba(lt(CF[2], 0.25), 0.6); g.lineWidth = 0.8; g.beginPath(); g.moveTo(sx - 1.2, fy + 3); g.lineTo(sx - 0.8, fy + len * 0.7); g.stroke();
        }
      }
      if (ch !== 'W') { fill(g, ox, fy - 0.6, T, 1.4, mossy ? G[3] : lt(R[2], 0.25)); }
      if (mossy) for (i = 0; i < 6; i++) { var mx = ox + 2 + hash(ox, i, 61) * 28, ml = 2 + hash(i, ox, 62) * 4; PT.rrect(g, mx - 1.2, fy, 2.4, ml, 1.2, G[1]); oval(g, mx, fy + ml - 0.6, 1.3, 1.2, G[0]); }
      PT.shade(g, ox + 16, oy + T + 1, 20, 3, 0.25);
    }
    // ふち：低い地面に面したところ（暗い線と明るい線）
    var low = function (q) { return !same(q); }, rimD = ch === 'W' ? KAWARA[0] : '#120e12', rimL = ch === 'W' ? KAWARA[3] : (mossy ? G[2] : lt(R[2], 0.3));
    g.lineCap = 'butt';
    if (low(at(x - 1, y))) { fill(g, ox, oy, 1.2, T, rimD); fill(g, ox + 1.2, oy, 1, topH, rimL); }
    if (low(at(x + 1, y))) { fill(g, ox + T - 1.2, oy, 1.2, T, rimD); fill(g, ox + T - 2.2, oy, 1, topH, rimL); }
    if (low(at(x, y - 1))) { fill(g, ox, oy, T, 1.2, rimD); fill(g, ox, oy + 1.2, T, 1, rimL); }
  }
  // 壁や崖のすぐ下の地面に、やわらかい影
  function wallShadow(g, x, y, at) {
    var up = at(x, y - 1); if (up !== '#' && up !== 'D' && up !== 'W' && up !== 'S') return;
    var gr = g.createLinearGradient(0, y * T, 0, y * T + 8); gr.addColorStop(0, 'rgba(10,8,14,.42)'); gr.addColorStop(1, 'rgba(10,8,14,0)');
    g.fillStyle = gr; g.fillRect(x * T, y * T, T, 8);
  }
  // 茂み・岩（3通り。地図の雰囲気ごとに作り置き）
  var lowCache = {};
  function bushSprite(P, key, v) {
    var k = 'bush|' + key + '|' + v; if (lowCache[k]) return lowCache[k];
    var S = PT.sheet(36, 36, GS), g = S.g, G = P.tr, r = PT.rnd(v * 131 + 7);
    g.translate(2, 2);
    var blobs = [[10, 19, 8, 7], [22, 19, 8, 7], [16, 12.5, 10, 8], [16, 22, 11, 5]];
    blobs.forEach(function (b) { oval(g, b[0] + (r() - 0.5) * 2, b[1], b[2], b[3], G[1]); });
    g.save(); g.beginPath(); blobs.forEach(function (b) { g.moveTo(b[0] + b[2], b[1]); g.ellipse(b[0], b[1], b[2], b[3], 0, 0, Math.PI * 2); }); g.clip();
    oval(g, 19, 26, 14, 6, G[0]);
    oval(g, 12, 10.5, 6, 4.4, G[2]); oval(g, 21, 15, 3.6, 3, G[2]); oval(g, 7.5, 17, 3.2, 2.8, G[2]);
    oval(g, 11, 9.4, 2.6, 1.6, G[3]); oval(g, 20, 13.6, 1.6, 1.1, G[3]);
    g.restore();
    if (v !== 1) for (var i = 0; i < 3; i++) { var bx = 9 + r() * 14, by = 12 + r() * 8; oval(g, bx, by, 1.4, 1.4, '#e84a5a'); oval(g, bx - 0.4, by - 0.5, 0.5, 0.5, '#ffd0d0'); }
    var cv = PT.outline(S.cv, OUT, 0.9), o = cv.getContext('2d');
    o.globalCompositeOperation = 'destination-over'; o.save(); o.scale(GS, GS); PT.shade(o, 18, 29, 14, 4, 0.35); o.restore();
    return (lowCache[k] = cv);
  }
  function rockSprite(P, key, v) {
    var k = 'rock|' + key + '|' + v; if (lowCache[k]) return lowCache[k];
    var S = PT.sheet(36, 36, GS), g = S.g, R = P.r;
    g.translate(2, 2);
    var sx = v === 1 ? 0.9 : 1, pts = [[4, 27], [5, 15], [11, 8], [21, 7], [28, 13], [29, 27]].map(function (p) { return [16 + (p[0] - 16) * sx, p[1] + (v === 2 ? 2 : 0)]; });
    g.lineJoin = 'round';
    PT.path(g, pts); g.fillStyle = R[1]; g.fill();
    g.save(); PT.path(g, pts); g.clip();
    ppoly(g, [[6, 15], [12, 9.5], [20, 8.5], [16, 15]].map(function (p) { return [16 + (p[0] - 16) * sx, p[1] + (v === 2 ? 2 : 0)]; }), R[3]);
    ppoly(g, [[18, 30], [30, 16], [30, 30]], R[0]);
    oval(g, 13, 21, 3, 1.6, PT.rgba(R[0], 0.6));
    g.restore();
    var cv = PT.outline(S.cv, OUT, 0.9), o = cv.getContext('2d');
    o.globalCompositeOperation = 'destination-over'; o.save(); o.scale(GS, GS); PT.shade(o, 18, 29.5, 15, 3.6, 0.4); o.restore();
    return (lowCache[k] = cv);
  }
  function fence(g, x, y, at) {
    var ox = x * T, oy = y * T, F2 = function (q) { return q === 'F'; };
    var hor = F2(at(x - 1, y)) || F2(at(x + 1, y)), ver = F2(at(x, y - 1)) || F2(at(x, y + 1));
    var W1 = '#5a3a22', W2 = '#8a6038', W3 = '#b08454';
    if (hor || !ver) {
      fill(g, ox, oy + 13, T, 3, W2); fill(g, ox, oy + 13, T, 1, W3); fill(g, ox, oy + 16, T, 1, W1);
      fill(g, ox, oy + 21, T, 3, W2); fill(g, ox, oy + 21, T, 1, W3); fill(g, ox, oy + 24, T, 1, W1);
      [3, 19].forEach(function (px) { fill(g, ox + px, oy + 8, 4, 22, W2); fill(g, ox + px, oy + 8, 1, 22, W3); fill(g, ox + px + 3, oy + 8, 1, 22, W1); fill(g, ox + px, oy + 7, 4, 1, W1); fill(g, ox + px, oy + 30, 4, 1, '#2a1a10'); });
    }
    if (ver) {
      fill(g, ox + 14, oy, 4, T, W2); fill(g, ox + 14, oy, 1, T, W3); fill(g, ox + 17, oy, 1, T, W1);
      fill(g, ox + 12, oy + 6, 8, 4, W2); fill(g, ox + 12, oy + 6, 8, 1, W3); fill(g, ox + 12, oy + 22, 8, 4, W2); fill(g, ox + 12, oy + 22, 8, 1, W3);
    }
  }
  function bridge(g, x, y, at, F) {
    var ox = x * T, oy = y * T, Wt = function (q) { return q === '~' || q === 'v' || q === 'x'; }, Br = function (q) { return q === '='; };
    var lr = Wt(at(x - 1, y)) || Wt(at(x + 1, y)), ud = Wt(at(x, y - 1)) || Wt(at(x, y + 1));
    var vert = lr && !ud ? true : ud && !lr ? false : !(Br(at(x - 1, y)) || Br(at(x + 1, y)));   // 南北にわたる橋なら true
    var sky = F && F.def && F.def.theme === 'sky';   // 天の社は朱ぬりの橋
    var B1 = sky ? '#6a1a14' : '#4a2e18', B2 = sky ? '#b03a26' : '#7a5230', B3 = sky ? '#d8583a' : '#9c7044', B4 = sky ? '#ec7c56' : '#bc915c';
    if (vert) {
      var l0 = Br(at(x - 1, y)) ? 0 : 3, r0 = Br(at(x + 1, y)) ? T : T - 3;
      fill(g, ox + l0, oy, r0 - l0, T, B2);
      for (var j = 0; j < T; j += 5) { fill(g, ox + l0, oy + j, r0 - l0, 1, B1); fill(g, ox + l0, oy + j + 1, r0 - l0, 1, B4); }
      if (l0) { fill(g, ox + 1, oy, 3, T, B1); fill(g, ox + 2, oy, 1, T, B3); if (y % 2 === 0) { fill(g, ox, oy + 2, 5, 4, B1); if (sky) fill(g, ox + 1, oy + 2, 3, 2, '#e8c050'); } }
      if (r0 < T) { fill(g, ox + T - 4, oy, 3, T, B1); fill(g, ox + T - 3, oy, 1, T, B3); if (y % 2 === 0) { fill(g, ox + T - 5, oy + 2, 5, 4, B1); if (sky) fill(g, ox + T - 4, oy + 2, 3, 2, '#e8c050'); } }
    } else {
      var t0 = Br(at(x, y - 1)) ? 0 : 4, b0 = Br(at(x, y + 1)) ? T : T - 4;
      fill(g, ox, oy + t0, T, b0 - t0, B2);
      for (var i = 0; i < T; i += 5) { fill(g, ox + i, oy + t0, 1, b0 - t0, B1); fill(g, ox + i + 1, oy + t0, 1, b0 - t0, B4); }
      if (t0) { fill(g, ox, oy + 1, T, 3, B1); fill(g, ox, oy + 2, T, 1, B3); if (sky && x % 2 === 0) fill(g, ox + 2, oy, 4, 3, '#e8c050'); }
      if (b0 < T) { fill(g, ox, oy + T - 4, T, 3, B1); fill(g, ox, oy + T - 3, T, 1, B3); fill(g, ox, oy + T - 1, T, 1, sky ? '#8a96d0' : '#1a3a60'); if (sky && x % 2 === 0) fill(g, ox + 2, oy + T - 5, 4, 3, '#e8c050'); }
    }
  }

  // ================= 背の高いもの（木・松・竹・桜） =================
  // 返す絵は、マスの左上を (ox, oy) に合わせて描く（w・h は単位）。幹の根もとはマスの下のほう
  var tallCache = {};
  DW.tallSprite = function (kind, themeName, variant) {
    var k = kind + '|' + themeName + '|' + variant;
    if (tallCache[k]) return tallCache[k];
    var P = THEME[themeName] || THEME.village, cv, ox, oy;
    if (kind === 'T') { cv = tree(P, variant, themeName); ox = 10; oy = 32; }
    else if (kind === 'K') { cv = tree(THEME.sky, variant, 'sky'); ox = 10; oy = 32; }
    else if (kind === 'Y') { cv = pine(P, variant); ox = 8; oy = 38; }
    else { cv = bamboo(P, variant); ox = 6; oy = 46; }
    tallCache[k] = { cv: cv, ox: ox, oy: oy, w: cv.width / GS, h: cv.height / GS };
    return tallCache[k];
  };
  // 根もとの影（輪郭のあと、絵のうしろに）
  function rootShade(cv, x, y, rx, ry) { var o = cv.getContext('2d'); o.save(); o.globalCompositeOperation = 'destination-over'; o.scale(GS, GS); PT.shade(o, x, y, rx, ry, 0.42); o.restore(); }
  function blobPath(g, blobs) { g.beginPath(); blobs.forEach(function (b) { g.moveTo(b[0] + b[2], b[1]); g.ellipse(b[0], b[1], b[2], b[3], 0, 0, Math.PI * 2); }); }
  function tree(P, v, themeName) {
    var S = PT.sheet(52, 66, GS), g = S.g, G = P.tr, K = P.tk, r = PT.rnd(v * 977 + 31);
    g.translate(2, 2);
    var dead = themeName === 'under';
    // 幹（根もとが広がる）
    ppoly(g, [[20, 38], [28, 38], [28.5, 55], [32, 60], [16, 60], [19.5, 55]], K[1]);
    ppoly(g, [[20, 38], [22.5, 38], [22, 58], [17.5, 60], [19.5, 55]], K[2]);
    ppoly(g, [[26.5, 38], [28, 38], [28.5, 55], [31, 59.5], [27, 58]], K[0]);
    if (dead) {
      g.lineCap = 'round'; g.strokeStyle = K[1]; g.lineWidth = 3;
      PT.line(g, [[24, 40], [24.5, 14]], K[1], 3.2); PT.line(g, [[24, 26], [12, 12]], K[1], 2.4); PT.line(g, [[25, 31], [38, 17]], K[1], 2.4);
      oval(g, 12, 11, 6, 4, G[1]); oval(g, 38, 16, 6, 4, G[1]); oval(g, 25, 12, 7, 5, G[2]);
      var cvd = PT.outline(S.cv, OUT, 0.9); rootShade(cvd, 26, 61, 12, 3); return cvd;
    }
    // 葉のかたまり
    var blobs = [[24, 24, 19, 15], [12, 30, 10, 9], [36, 30, 10, 9], [17, 15, 10, 9], [31, 15, 10, 9], [24, 33, 13, 8]].map(function (b, i) { return i ? [b[0] + (r() - 0.5) * 3, b[1] + (r() - 0.5) * 2, b[2], b[3]] : b; });
    blobPath(g, blobs); g.fillStyle = G[1]; g.fill();
    g.save(); blobPath(g, blobs); g.clip();
    // 下は暗く、左上は明るく
    var gr = g.createLinearGradient(0, 22, 0, 42); gr.addColorStop(0, PT.rgba(G[0], 0)); gr.addColorStop(1, PT.rgba(G[0], 0.95));
    g.fillStyle = gr; g.fillRect(0, 22, 52, 24);
    oval(g, 31, 36, 13, 6, PT.rgba(G[0], 0.6));
    oval(g, 18, 14, 7.5, 5.5, G[2]); oval(g, 12.5, 26, 5, 4, G[2]); oval(g, 28, 19.5, 6, 4.2, G[2]); oval(g, 22, 29, 4, 2.6, PT.rgba(G[2], 0.7));
    // 葉のふち（小さな丸）
    for (var i = 0; i < 16; i++) { var hx = 9 + r() * 28, hy = 8 + r() * 20; oval(g, hx, hy, 1.6, 1.2, PT.rgba(G[3], 0.85)); }
    g.restore();
    // 下のふちに葉の切れこみ
    g.strokeStyle = PT.rgba(G[0], 0.9); g.lineWidth = 1; g.lineCap = 'round';
    [[14, 36], [20, 39], [30, 39], [36, 36]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1] - 1, 2.4, 0.3, Math.PI - 0.3); g.stroke(); });
    if (themeName === 'sky' || (v === 2 && themeName === 'village')) {
      for (var f = 0; f < 12; f++) { var fx = 9 + r() * 30, fy = 9 + r() * 24; for (var k = 0; k < 5; k++) { var a = k * Math.PI * 2 / 5 - Math.PI / 2; oval(g, fx + Math.cos(a) * 1.1, fy + Math.sin(a) * 1.1, 0.95, 0.95, '#ffd6e4'); } oval(g, fx, fy, 0.55, 0.55, '#f07aa0'); }
    }
    var cv = PT.outline(S.cv, OUT, 0.9);
    rootShade(cv, 26, 61, 13, 3.2);
    return cv;
  }
  function pine(P, v) {
    var S = PT.sheet(48, 72, GS), g = S.g, G = P.tr, K = P.tk;
    g.translate(2, 2);
    ppoly(g, [[19, 48], [25, 48], [25.5, 62], [28, 66], [16, 66], [18.5, 62]], K[1]);
    fill(g, 19.5, 48, 1.8, 16, K[2]);
    var tiers = [[22, 4, 8, 16], [22, 14, 13, 18], [22, 26, 18, 18], [22, 38, 21, 16]];
    tiers.forEach(function (t, i) {
      var cx = t[0], top = t[1], hw = t[2], hh = t[3];
      var pts = [[cx, top], [cx + hw * 0.55, top + hh * 0.55], [cx + hw, top + hh], [cx + hw * 0.55, top + hh + 1.5], [cx, top + hh - 1], [cx - hw * 0.55, top + hh + 1.5], [cx - hw, top + hh], [cx - hw * 0.55, top + hh * 0.55]];
      PT.path(g, pts); g.fillStyle = G[1]; g.fill();
      g.save(); PT.path(g, pts); g.clip();
      ppoly(g, [[cx, top + 1], [cx - hw + 3, top + hh - 0.5], [cx - 1.5, top + hh - 3]], G[2]);
      oval(g, cx + hw * 0.45, top + hh, hw * 0.6, 3, PT.rgba(G[0], 0.8));
      oval(g, cx - 2.5, top + 6 + i, 1.4, 1, G[3]); oval(g, cx - 4.5, top + 9 + i, 1.2, 0.9, G[3]);
      g.restore();
    });
    var cv = PT.outline(S.cv, OUT, 0.9);
    rootShade(cv, 24, 67, 12, 3);
    return cv;
  }
  function bamboo(P, v) {
    var S = PT.sheet(44, 80, GS), g = S.g, r = PT.rnd(v * 53 + 11);
    g.translate(2, 2);
    for (var j = 0; j < 4; j++) {
      var x = 5 + j * 8 + r() * 3, top = 6 + Math.floor(r() * 14), col = j % 2 ? '#62a03e' : '#78b44e';
      PT.rrect(g, x, top, 4, 72 - top, 1.6, col);
      fill(g, x + 0.6, top + 1, 1, 70 - top, '#b0dc7c'); fill(g, x + 3, top + 1, 0.9, 70 - top, '#3e6e26');
      for (var s = top + 8; s < 70; s += 10) { PT.rrect(g, x - 0.8, s - 0.4, 5.6, 1.6, 0.8, '#3a6a22'); fill(g, x, s + 1.2, 4, 0.8, '#a4d470'); }
      ppoly(g, [[x + 3, top + 4], [x + 9, top + 0.5], [x + 13, top + 1], [x + 4, top + 7]], '#6aa848');
      ppoly(g, [[x + 1, top + 12], [x - 5, top + 8], [x - 9, top + 8.5], [x + 0.5, top + 15]], '#5a9a3e');
    }
    var cv = PT.outline(S.cv, '#1e3a12', 0.9);
    rootShade(cv, 22, 74, 14, 3);
    return cv;
  }

  // ================= 建物・置物 =================
  // 返す絵は、物の足もと（マスの左上）を (ox, oy) に合わせて描く（w・h は単位）。UP は上にはみ出す高さ
  var decoCache = {}, pendingShadow = null;
  var UP = { field: 2, barrel: 6, pots: 4, firewood: 4, bench: 2, board: 18, cart: 8, laundry: 22, house: 26, inn: 30, bighouse: 34, shrine: 34, shrine_small: 22, torii: 46, stall: 30, lantern: 18, well: 14, dummy: 16, easel: 14, cave: 22, fox: 14, stump: 2, dojo: 32, forge: 40, kura: 30, post: 22, crates: 4, ship: 50, hut: 22, boat: 2, gate: 46, banner: 34, brazier: 6, bell: 50, stair_down: 2, stone_marker: 14, mon: 52, lighthouse: 62, net: 20 };
  var fontOk = function () { try { return !document.fonts || document.fonts.check('700 12px "Zen Maru Gothic"'); } catch (e) { return true; } };
  DW.decoSprite = function (d) {
    var label = d.label || '', k = d.kind + '|' + (d.w || 1) + 'x' + (d.h || 1) + '|' + (d.v || '') + '|' + label;
    var e = decoCache[k];
    if (e && (e.font || !e.text)) return e;
    var w = (d.w || 1) * T, h = (d.h || 1) * T, up = UP[d.kind] || 16, side = 8;
    var S = PT.sheet(w + side * 2, h + up + 4, GS), g = S.g;
    g.translate(side, up);
    var fn = DECO[d.kind], used = { text: false };
    pendingShadow = null;
    if (fn) fn(g, w, h, d, used); else fill(g, 2, 2, w - 4, h - 4, '#a07a50');
    var cv = PT.outline(S.cv, OUT, 0.9);
    if (pendingShadow) { var o = cv.getContext('2d'); o.save(); o.globalCompositeOperation = 'destination-over'; o.scale(GS, GS); PT.shade(o, side + pendingShadow[0] / 2, up + pendingShadow[1] - 1, pendingShadow[0] / 2 + 3, 4.5, 0.38); o.restore(); }
    e = decoCache[k] = { cv: cv, ox: side, oy: up, w: w + side * 2, h: h + up + 4, text: used.text, font: fontOk() };
    return e;
  };
  // 看板などの字（丸ゴシック）
  function label(g, s, x, y, size, col, used) {
    if (!s) return;
    used.text = true;
    g.save(); g.font = '700 ' + size + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(s, x, y + 0.5); g.restore();
  }
  var ROOF = {
    gray: ['#262c3a', '#3a4254', '#525c72', '#707c94'], brown: ['#38261c', '#523828', '#6e4e36', '#8e6a4a'], navy: ['#1e2436', '#2e3650', '#424c6c', '#5c6888'],
    green: ['#173c38', '#245650', '#357266', '#4e9080'], thatch: ['#5a4426', '#7a5e34', '#9c7c48', '#bc9c62'], black: ['#1a1a20', '#2a2a32', '#3c3c46', '#54545e']
  };
  var WALL = ['#a8987a', '#d6c8a8', '#ece2c8'], WOOD = ['#3a2416', '#5a3a24', '#7a5436', '#9a7048'];
  // 屋根（瓦の段）。x0..x1 の幅、y0（棟）..y1（軒）
  function roof(g, x0, x1, y0, y1, R, o) {
    o = o || {};
    var rp = [[x0 + 3, y0], [x1 - 3, y0], [x1, y1], [x0, y1]];
    ppoly(g, rp, R[1]);
    if (o.thatch) {
      g.save(); PT.path(g, rp); g.clip(); g.lineCap = 'round';
      for (var y = y0 + 3; y < y1 + 1; y += 3) for (var x = x0 + ((y - y0) / 3 % 2) * 1.5; x < x1; x += 3) PT.line(g, [[x, y - 2.6], [x + 0.7, y + 0.3]], hash(Math.round(x), Math.round(y), 77) < 0.5 ? R[0] : R[2], 0.9);
      g.restore();
      PT.rrect(g, x0 + 2, y0 - 0.5, x1 - x0 - 4, 3.5, 1.5, R[2]);
    } else {
      for (var yy = y0 + 6; yy < y1 - 2; yy += 5) {
        fill(g, x0 + 1, yy, x1 - x0 - 2, 1, R[0]);
        fill(g, x0 + 1, yy + 1, x1 - x0 - 2, 1, R[2]);
        for (var xx = x0 + ((yy / 5) % 2 ? 2 : 0); xx < x1 - 1; xx += 4) dot(g, xx, yy + 2, R[2]);
      }
      // 棟と鬼瓦
      fill(g, x0 + 3, y0, x1 - x0 - 6, 5, R[0]); fill(g, x0 + 3, y0 + 1, x1 - x0 - 6, 1, R[3]);
      fill(g, x0 + 2, y0 - 2, 5, 7, R[0]); fill(g, x1 - 7, y0 - 2, 5, 7, R[0]); dot(g, x0 + 3, y0 - 1, R[3]); dot(g, x1 - 6, y0 - 1, R[3]);
    }
    // 軒（ふちは明るく、下に影）
    fill(g, x0, y1 - 3, x1 - x0, 2, R[0]); fill(g, x0, y1 - 4, x1 - x0, 1, R[3]);
    if (o.lightLeft !== false) PT.line(g, [[x0 + 3, y0 + 2], [x0 + 0.6, y1 - 3.5]], R[3], 1);
  }
  // 家の前の壁：柱・窓・戸。wy は壁の上、h は足もと
  function frontWall(g, w, wy, h, o) {
    o = o || {};
    var W2 = o.wall || WALL, x0 = 3, x1 = w - 3;
    fill(g, x0, wy, x1 - x0, h - wy, W2[1]);
    fill(g, x0, wy, x1 - x0, 2, '#00000066');   // 軒の影
    fill(g, x0, h - 9, x1 - x0, 9, WOOD[2]);       // 腰板
    for (var bx = x0; bx < x1; bx += 4) fill(g, bx, h - 9, 1, 9, WOOD[1]);
    fill(g, x0, h - 10, x1 - x0, 1, WOOD[0]);
    var posts = Math.max(2, Math.round((x1 - x0) / 22));
    for (var i = 0; i <= posts; i++) { var px = Math.round(x0 + (x1 - x0 - 3) * i / posts); fill(g, px, wy, 3, h - wy, WOOD[1]); fill(g, px, wy, 1, h - wy, WOOD[3]); }
    fill(g, x0, wy + 2, x1 - x0, 2, WOOD[1]);
    // 窓（格子）
    if (!o.noWindow) {
      var ww = 10, wh = 8, wyy = wy + 7;
      [x0 + 7, x1 - 7 - ww].forEach(function (wx) {
        if (Math.abs(wx + ww / 2 - w / 2) < 16) return;
        fill(g, wx, wyy, ww, wh, o.lit ? '#ffd88a' : '#2a2230'); fill(g, wx - 1, wyy - 1, ww + 2, 1, WOOD[0]); fill(g, wx - 1, wyy + wh, ww + 2, 1, WOOD[0]);
        for (var k = 0; k < ww; k += 3) fill(g, wx + k, wyy, 1, wh, WOOD[1]); fill(g, wx, wyy + 4, ww, 1, WOOD[1]);
      });
    }
    // 戸
    var dw = o.doorW || 14, dh = Math.min(22, h - wy - 4), dx = Math.round(w / 2 - dw / 2), dy = h - dh;
    fill(g, dx - 1, dy - 1, dw + 2, dh + 1, WOOD[0]);
    fill(g, dx, dy, dw, dh, o.doorCol || '#d8c8a0');
    for (var dxx = dx + 3; dxx < dx + dw; dxx += 4) fill(g, dxx, dy, 1, dh, WOOD[1]);
    for (var dyy = dy + 4; dyy < h; dyy += 5) fill(g, dx, dyy, dw, 1, WOOD[1]);
    fill(g, dx + Math.floor(dw / 2), dy, 1, dh, WOOD[0]);
    if (o.noren) {
      var nw = dw + 6, nx = Math.round(w / 2 - nw / 2), ny = dy - 2;
      fill(g, nx, ny, nw, 10, o.noren); fill(g, nx, ny, nw, 1, lt(o.noren, 0.3));
      for (var s = nx + Math.floor(nw / 3); s < nx + nw - 1; s += Math.floor(nw / 3)) fill(g, s, ny + 4, 1, 6, dk(o.noren, 0.4));
      fill(g, nx - 1, ny - 1, nw + 2, 1, WOOD[0]);
    }
  }
  function signboard(g, x, y, s, used, col, bg) {
    var wd = Math.max(14, s.length * 11 + 4);
    fill(g, x - wd / 2 - 1, y - 7, wd + 2, 14, WOOD[0]);
    fill(g, x - wd / 2, y - 6, wd, 12, bg || '#f4ead0');
    label(g, s, x, y + 0.5, 11, col || '#3a2018', used);
  }
  function shadowBase(g, w, h) { pendingShadow = [w, h]; }
  function house(g, w, h, R, o, used) {
    o = o || {};
    var up = o.up || 26, wallH = Math.min(o.wallH || 30, h - 12), wy = h - wallH;
    shadowBase(g, w, h);
    frontWall(g, w, wy, h, o);
    roof(g, -2, w + 2, -up + 4, wy + 4, R, o);
    if (o.sign) signboard(g, w / 2, wy - 6, o.sign, used, o.signCol, o.signBg);
  }
  var DECO = {
    house: function (g, w, h, d, u) { house(g, w, h, [ROOF.gray, ROOF.brown, ROOF.navy, ROOF.brown][(d.v || 0) % 4], { lit: true }, u); },
    bighouse: function (g, w, h, d, u) { house(g, w, h, ROOF.navy, { up: 34, wallH: 34, noren: '#8a2a3a', sign: d.label ? d.label.slice(0, 2) : '', lit: true }, u); },
    inn: function (g, w, h, d, u) { house(g, w, h, ROOF.brown, { up: 30, noren: '#2a4a8a', sign: '宿', lit: true }, u); },
    dojo: function (g, w, h, d, u) { house(g, w, h, ROOF.black, { up: 32, wallH: 32, noren: '#2a2a2a', sign: '道場', lit: true }, u); },
    forge: function (g, w, h, d, u) {
      house(g, w, h, ROOF.brown, { up: 30, noren: '#a83a2a', sign: '鍛冶', lit: true }, u);
      fill(g, w - 24, -40, 12, 22, '#4e423c'); fill(g, w - 24, -40, 12, 2, '#2a2220'); fill(g, w - 24, -40, 2, 22, '#6a5c54');
    },
    post: function (g, w, h, d, u) { house(g, w, h, ROOF.navy, { up: 22, wallH: 26, noren: '#2a5a8a', sign: '伝令', noWindow: w < 70 }, u); },
    hut: function (g, w, h, d, u) { house(g, w, h, ROOF.thatch, { up: 22, wallH: 26, thatch: true, wall: ['#8a7656', '#b09a74', '#ccb88e'], noWindow: w < 70 }, u); },
    kura: function (g, w, h, d, u) {
      var wy = h - 34; shadowBase(g, w, h);
      fill(g, 3, wy, w - 6, 34, '#ece6d8'); fill(g, 3, wy, w - 6, 2, '#00000066');
      // なまこ壁
      fill(g, 3, h - 14, w - 6, 14, '#3a3a42');
      g.save(); g.beginPath(); g.rect(3, h - 14, w - 6, 14); g.clip(); g.strokeStyle = '#f4f0e6'; g.lineWidth = 1.2;
      for (var x = -16; x < w + 16; x += 8) { g.beginPath(); g.moveTo(x, h - 14); g.lineTo(x + 14, h); g.moveTo(x + 14, h - 14); g.lineTo(x, h); g.stroke(); }
      g.restore();
      fill(g, Math.round(w / 2 - 8), h - 22, 16, 22, '#2a2a30'); fill(g, Math.round(w / 2 - 7), h - 21, 14, 20, '#4a4a54');
      roof(g, -2, w + 2, -26, wy + 4, ROOF.black);
      fill(g, Math.round(w / 2 - 6), wy + 8, 12, 9, '#3a3a42'); label(g, '蔵', w / 2, wy + 12.5, 9, '#f4f0e6', u);
    },
    shrine: function (g, w, h, d, u) {
      shadowBase(g, w, h);
      // 石段・基壇
      fill(g, 0, h - 8, w, 8, '#9a948a'); fill(g, 0, h - 8, w, 1, '#c8c2b6'); fill(g, 0, h - 1, w, 1, '#5a5650');
      fill(g, w / 2 - 10, h - 6, 20, 6, '#b4aea2'); fill(g, w / 2 - 10, h - 3, 20, 1, '#7a746a');
      var wy = h - 40, V = ['#7a1a12', '#a8281c', '#cc3a24', '#e86a4a'];
      fill(g, 6, wy, w - 12, 32, '#f0e8d4');
      [6, w / 2 - 14, w / 2 + 11, w - 10].forEach(function (px) { fill(g, px, wy, 4, 32, V[1]); fill(g, px, wy, 1, 32, V[3]); });
      fill(g, 6, wy + 2, w - 12, 3, V[1]); fill(g, 6, wy + 2, w - 12, 1, V[3]);
      // 賽銭箱と鈴
      fill(g, w / 2 - 9, h - 18, 18, 10, '#6a4428'); fill(g, w / 2 - 9, h - 18, 18, 2, '#9a6c42'); for (var k = w / 2 - 8; k < w / 2 + 9; k += 3) fill(g, k, h - 15, 1, 6, '#3a2414');
      fill(g, w / 2 - 1, wy + 4, 2, 14, '#d8303a'); fill(g, w / 2, wy + 4, 1, 14, '#f4f0f0'); oval(g, w / 2, wy + 4, 3, 3, '#e8c050');
      roof(g, -6, w + 6, -30, wy + 6, ROOF.green);
      // 千木と鰹木
      [[0, -38], [w - 1, -38]].forEach(function (p, i) { ppoly(g, [[p[0] + (i ? -6 : 0), p[1] + 10], [p[0] + (i ? -3 : 3), p[1] + 10], [p[0] + (i ? 2 : 7) + (i ? 0 : -4), p[1]], [p[0] + (i ? 5 : 4) + (i ? -3 : -4), p[1]]], '#c89a3a'); });
      for (var kx = 14; kx < w - 14; kx += 12) { fill(g, kx, -30, 6, 4, '#e8c050'); fill(g, kx, -29, 6, 1, '#fff0a0'); }
      oval(g, w / 2, -18, 4, 4, '#e8c050'); dot(g, w / 2 - 1, -19, '#fff6c0');
    },
    shrine_small: function (g, w, h, d, u) {
      shadowBase(g, w, h);
      var wy = h - 26, V = ['#7a1a12', '#a8281c', '#cc3a24', '#e86a4a'];
      fill(g, 6, h - 5, w - 12, 5, '#9a948a'); fill(g, 6, h - 5, w - 12, 1, '#c8c2b6');
      fill(g, 9, wy, w - 18, 21, V[2]); fill(g, 9, wy, 2, 21, V[3]); fill(g, w - 11, wy, 2, 21, V[0]);
      fill(g, w / 2 - 7, wy + 5, 14, 12, '#f0e8d4'); for (var k = w / 2 - 6; k < w / 2 + 7; k += 3) fill(g, k, wy + 5, 1, 12, '#a08a6a');
      roof(g, 0, w, -18, wy + 5, ROOF.green);
      if (d.label) signboard(g, w / 2, wy - 4, d.label.slice(0, 2), u, '#8a1a1a');
    },
    torii: function (g, w, h, d, u) {
      var V = d.v === 'gold' ? ['#8a6a14', '#b8901e', '#e0b434', '#f8d870'] : ['#7a1a12', '#a8281c', '#d0402a', '#ec6c4c'];
      var l = 4, r2 = w - 10;
      [l, r2].forEach(function (px) { fill(g, px, -32, 6, h + 30, V[1]); fill(g, px, -32, 2, h + 30, V[3]); fill(g, px + 5, -32, 1, h + 30, V[0]); fill(g, px - 1, h - 4, 8, 4, '#2a2226'); });
      fill(g, 0, -26, w, 5, V[1]); fill(g, 0, -26, w, 1, V[3]); fill(g, 0, -22, w, 1, V[0]);       // 貫
      ppoly(g, [[-6, -40], [w + 6, -40], [w + 2, -34], [-2, -34]], V[1]);                           // 笠木
      fill(g, -6, -44, w + 12, 4, '#1e1618'); fill(g, -6, -44, w + 12, 1, '#4a3e42'); dot(g, -7, -45, '#1e1618'); dot(g, w + 6, -45, '#1e1618');
      fill(g, w / 2 - 6, -34, 12, 8, '#1e1618'); fill(g, w / 2 - 5, -33, 10, 6, d.v === 'gold' ? '#f8e8a0' : '#e8c050');
    },
    stall: function (g, w, h, d, u) {
      var col = { red: ['#8a1e1e', '#c83030', '#f4e8d8'], blue: ['#1a3a6a', '#2e5a9a', '#f0f0e8'], green: ['#1e5a2a', '#3a8a4a', '#f0f0e0'] }[d.v] || ['#8a1e1e', '#c83030', '#f4e8d8'];
      shadowBase(g, w, h);
      fill(g, 2, h - 18, w - 4, 16, WOOD[2]); fill(g, 2, h - 18, w - 4, 2, WOOD[3]); for (var x = 4; x < w - 2; x += 5) fill(g, x, h - 15, 1, 13, WOOD[1]);
      var goods = ['#f0a040', '#f4e0a0', '#e86060', '#8ac050', '#a8d0f0'];
      for (var i = 0; i < Math.floor((w - 8) / 9); i++) { var gx = 6 + i * 9; oval(g, gx + 3, h - 20, 4, 3, goods[i % goods.length]); dot(g, gx + 2, h - 22, '#ffffff'); }
      fill(g, 4, -12, 3, h - 6, WOOD[1]); fill(g, w - 7, -12, 3, h - 6, WOOD[1]);
      for (var sx = -3; sx < w + 3; sx += 6) fill(g, sx, -24, Math.min(6, w + 3 - sx), 14, (Math.floor((sx + 3) / 6) % 2) ? col[2] : col[1]);
      fill(g, -3, -24, w + 6, 1, col[0]); for (var k = -3; k < w + 3; k += 6) { g.save(); g.beginPath(); g.rect(k, -10.5, Math.min(6, w + 3 - k), 4); g.clip(); oval(g, k + 3, -10.5, 3, 3, (Math.floor((k + 3) / 6) % 2) ? col[2] : col[1]); g.restore(); }
      if (d.label) signboard(g, w / 2, -18, d.label.slice(0, 2), u, '#3a2018');
    },
    lantern: function (g, w, h) {
      var S = ['#4e4a46', '#6e6964', '#8e8880', '#b0aaa0'];
      fill(g, 9, 26, 14, 5, S[1]); fill(g, 9, 26, 14, 1, S[3]);
      fill(g, 13, 10, 6, 16, S[1]); fill(g, 13, 10, 2, 16, S[2]);
      fill(g, 8, 4, 16, 4, S[2]); fill(g, 9, -6, 14, 10, S[1]); fill(g, 12, -4, 8, 7, '#ffd27a'); fill(g, 13, -3, 6, 2, '#fff2c0'); fill(g, 15, -4, 2, 7, S[1]);
      ppoly(g, [[5, -6], [27, -6], [21, -14], [11, -14]], S[2]); fill(g, 5, -7, 22, 1, S[3]); fill(g, 14, -18, 4, 4, S[1]);
    },
    well: function (g) {
      oval(g, 16, 22, 14, 8, '#7a746c'); oval(g, 16, 21, 13, 7, '#9a948a'); oval(g, 16, 21, 9, 4, '#1a2c4c'); dot(g, 13, 20, '#5a7aa8');
      fill(g, 3, -6, 3, 26, WOOD[1]); fill(g, 26, -6, 3, 26, WOOD[1]); fill(g, 3, -6, 1, 26, WOOD[3]);
      ppoly(g, [[-1, -4], [33, -4], [27, -12], [5, -12]], '#5a4434'); fill(g, -1, -5, 34, 1, '#8a6a52'); fill(g, 14, -4, 4, 10, WOOD[0]);
    },
    dummy: function (g) {
      fill(g, 14, 2, 4, 28, WOOD[1]); fill(g, 14, 2, 1, 28, WOOD[3]); fill(g, 4, 8, 24, 4, WOOD[1]); fill(g, 4, 8, 24, 1, WOOD[3]);
      oval(g, 16, 14, 7, 9, '#c8a860'); for (var y = 7; y < 22; y += 3) fill(g, 10, y, 12, 1, '#a08440'); oval(g, 16, -5, 6, 6, '#d8bc70'); fill(g, 12, -6, 8, 1, '#a08440');
    },
    easel: function (g) {
      ppoly(g, [[7, 30], [9, 30], [17, -2], [15, -2]], WOOD[2]); ppoly(g, [[25, 30], [23, 30], [15, -2], [17, -2]], WOOD[2]);
      fill(g, 5, -6, 22, 18, '#fffaf0'); fill(g, 5, -6, 22, 1, '#ffffff'); oval(g, 12, 0, 3, 3, '#e86a6a'); oval(g, 20, 3, 3, 3, '#6ab0e8'); oval(g, 15, 7, 3, 2, '#f0d040'); fill(g, 5, 12, 22, 2, WOOD[1]);
    },
    cave: function (g, w, h) {
      var R = ['#3a3430', '#5a524a', '#7a7064', '#9a8e80'];
      ppoly(g, [[0, h], [0, 2], [w * 0.18, -16], [w * 0.5, -22], [w * 0.82, -16], [w, 2], [w, h]], R[1]);
      for (var i = 0; i < 40; i++) { var x = Math.floor(hash(i, 1, 5) * w), y = Math.floor(hash(i, 2, 5) * (h + 16)) - 16; dot(g, x, y, hash(i, 3, 5) < 0.5 ? R[0] : R[2]); }
      ppoly(g, [[w * 0.2, h], [w * 0.2, h * 0.3], [w * 0.35, -2], [w * 0.65, -2], [w * 0.8, h * 0.3], [w * 0.8, h]], '#0c0808');
      fill(g, w * 0.2, h * 0.3, 2, h, '#2a2420'); ppoly(g, [[w * 0.2, -14], [w * 0.5, -20], [w * 0.4, -12]], R[3]);
    },
    fox: function (g) {
      fill(g, 7, 20, 18, 10, '#8e887e'); fill(g, 7, 20, 18, 1, '#b8b2a6');
      oval(g, 16, 12, 6, 8, '#f4f0e6'); oval(g, 16, 2, 5, 5, '#f4f0e6'); ppoly(g, [[11, 0], [12, -8], [15, -1]], '#f4f0e6'); ppoly(g, [[21, 0], [20, -8], [17, -1]], '#f4f0e6');
      fill(g, 11, 8, 10, 3, '#c8402c'); dot(g, 14, 2, '#c8402c'); dot(g, 18, 2, '#c8402c'); ppoly(g, [[21, 16], [28, 4], [26, 18]], '#f4f0e6');
    },
    stump: function (g) { oval(g, 16, 22, 10, 6, WOOD[1]); oval(g, 16, 19, 10, 5, '#c8a070'); oval(g, 16, 19, 6, 3, '#a8804e'); oval(g, 16, 19, 2, 1, '#c8a070'); },
    crates: function (g, w) { for (var i = 0; i < Math.floor(w / 16); i++) { var x = i * 16 + 1; fill(g, x, 8, 14, 20, '#a8804e'); fill(g, x, 8, 14, 2, '#c8a070'); fill(g, x, 17, 14, 1, '#7a5434'); fill(g, x + 6, 8, 2, 20, '#7a5434'); } },
    ship: function (g, w, h) {
      ppoly(g, [[0, h * 0.42], [w, h * 0.42], [w - 16, h - 2], [14, h - 2]], '#6a3a22'); fill(g, 4, h * 0.42, w - 8, 4, '#8a5a32'); fill(g, 4, h * 0.42 + 4, w - 8, 1, '#3a2010');
      for (var x = 16; x < w - 16; x += 6) fill(g, x, h * 0.42 + 6, 1, h * 0.4, '#552e18');
      fill(g, w / 2 - 2, -46, 5, h * 0.42 + 46, '#5a3a22');
      [1, -1].forEach(function (sd) {
        var bx = sd > 0 ? w / 2 + 3 : w / 2 - 2, sp = [[bx, -42], [bx + sd * 21.8, -42], [bx + sd * 26, -14], [bx + sd * 21.8, 14], [bx, 14]];
        PT.path(g, sp); g.fillStyle = '#f4ecd8'; g.fill();
        g.save(); PT.path(g, sp); g.clip(); for (var yy2 = -42; yy2 < 14; yy2 += 6) fill(g, bx - 30, yy2, 60, 0.9, '#d8ccb4'); fill(g, sd > 0 ? bx : bx - 6, -42, 6, 56, 'rgba(255,255,255,.35)'); g.restore();
      });
      oval(g, w / 2 + 14, -14, 7, 7, '#c8302c');
    },
    boat: function (g, w) { ppoly(g, [[0, 12], [w, 12], [w - 8, 24], [8, 24]], '#7a4a2a'); fill(g, 2, 12, w - 4, 2, '#9a6a3e'); fill(g, w / 2 - 1, 4, 2, 10, WOOD[1]); },
    gate: function (g, w, h, d, u) {
      var Wd = ['#1e1612', '#2e2420', '#463830', '#5e4c40'];
      fill(g, 0, -40, Math.round(w * 0.3), h + 40, Wd[1]); fill(g, Math.round(w * 0.7), -40, Math.round(w * 0.3), h + 40, Wd[1]);
      fill(g, 0, -40, 3, h + 40, Wd[3]); fill(g, Math.round(w * 0.7), -40, 3, h + 40, Wd[3]);
      for (var y = -30; y < h; y += 10) { fill(g, 2, y, Math.round(w * 0.3) - 4, 1, Wd[0]); fill(g, Math.round(w * 0.7) + 2, y, Math.round(w * 0.3) - 4, 1, Wd[0]); }
      roof(g, -8, w + 8, -48, -30, ROOF.black);
      signboard(g, w / 2, -24, d.label ? d.label.slice(0, 2) : '門', u, '#3a2018');
    },
    lighthouse: function (g, w, h) {   // 灯明台（港の灯り）：石垣の上に木の櫓と灯室
      var S = ['#4e4a46', '#6e6964', '#8e8880', '#b0aaa0'], cx = Math.round(w / 2), top = -18, bot = h - 34;
      ppoly(g, [[1, h], [5, bot], [w - 5, bot], [w - 1, h]], S[1]);
      for (var y = bot + 2, r = 0; y < h - 2; y += 6, r++) for (var x = 4 + (r % 2 ? 4 : 0); x < w - 6; x += 9) { fill(g, x, y, 8, 5, S[2]); fill(g, x, y, 8, 1, S[3]); }
      ppoly(g, [[cx - 22, bot], [cx - 18, bot], [cx - 9, top], [cx - 13, top]], WOOD[2]);
      ppoly(g, [[cx + 22, bot], [cx + 18, bot], [cx + 9, top], [cx + 13, top]], WOOD[1]);
      for (var yy = top + 10; yy < bot; yy += 14) { var hw = Math.round(10 + (yy - top) * 11 / (bot - top)); fill(g, cx - hw, yy, hw * 2, 2, WOOD[1]); fill(g, cx - hw, yy, hw * 2, 1, WOOD[3]); }
      fill(g, cx - 14, top - 24, 28, 24, WOOD[1]); fill(g, cx - 11, top - 21, 22, 16, '#ffd27a'); fill(g, cx - 9, top - 19, 18, 4, '#fff2c0');
      for (var k = cx - 11; k < cx + 11; k += 5) fill(g, k, top - 21, 1, 16, WOOD[0]);
      fill(g, cx - 16, top - 3, 32, 3, WOOD[2]); fill(g, cx - 16, top - 3, 32, 1, WOOD[3]);
      ppoly(g, [[cx - 20, top - 23], [cx + 20, top - 23], [cx + 5, top - 38], [cx - 5, top - 38]], '#2e3650'); fill(g, cx - 20, top - 24, 40, 1, '#5c6888');
      fill(g, cx - 2, top - 42, 4, 4, '#e8c050');
    },
    net: function (g, w) {   // 網干し：竿にかけた網と浮き
      [2, Math.round(w / 2) - 1, w - 5].forEach(function (x) { fill(g, x, -18, 3, 46, WOOD[1]); fill(g, x, -18, 1, 46, WOOD[3]); });
      fill(g, 1, -16, w - 2, 2, WOOD[0]);
      var np = [[4, -14], [w - 4, -14]];
      for (var x = w - 4; x >= 4; x -= 2) np.push([x, 14 + Math.sin(((x - 4) / (w - 8)) * Math.PI * 2) * 2]);
      PT.path(g, np); g.fillStyle = 'rgba(110,126,116,.9)'; g.fill();
      g.save(); PT.path(g, np); g.clip(); g.strokeStyle = '#3e4e4c'; g.lineWidth = 0.7;
      for (var nx = -30; nx < w + 30; nx += 4) { g.beginPath(); g.moveTo(nx, -14); g.lineTo(nx + 30, 16); g.moveTo(nx + 30, -14); g.lineTo(nx, 16); g.stroke(); }
      g.restore();
      for (var f = 8; f < w - 6; f += 10) { oval(g, f, 15, 3, 2, '#e8d8b0'); dot(g, f - 1, 14, '#fff8e0'); }
    },
    mon: function (g, w, h, d, u) {   // 里の門（冠木門）：2本の柱・冠木・板屋根・名札・提灯
      [2, w - 12].forEach(function (px) {
        fill(g, px, -36, 10, h + 36, WOOD[2]); fill(g, px, -36, 2, h + 36, WOOD[3]); fill(g, px + 9, -36, 1, h + 36, WOOD[0]);
        fill(g, px - 2, h - 5, 14, 5, '#5e5850'); fill(g, px - 2, h - 5, 14, 1, '#8e887e');
      });
      fill(g, -4, -32, w + 8, 7, WOOD[2]); fill(g, -4, -32, w + 8, 1, WOOD[3]); fill(g, -4, -26, w + 8, 1, WOOD[0]);
      roof(g, -10, w + 10, -50, -30, ROOF.brown);
      [17, w - 17].forEach(function (cx) { fill(g, cx, -25, 1, 3, WOOD[0]); oval(g, cx, -17, 4, 5, '#e8e0d0'); fill(g, cx - 3, -21, 7, 1, '#c8302c'); fill(g, cx - 3, -13, 7, 1, '#c8302c'); fill(g, cx - 4, -17, 9, 1, '#d8c8b0'); });
      if (d.label) signboard(g, w / 2, -18, d.label, u, '#3a2018');
    },
    banner: function (g) {
      fill(g, 14, -30, 3, 60, WOOD[1]); fill(g, 14, -30, 1, 60, WOOD[3]);
      fill(g, 17, -28, 13, 34, '#5a2a6a'); fill(g, 17, -28, 13, 2, '#7a4a8a'); fill(g, 17, 4, 13, 2, '#3a1a4a');
      for (var y = -24; y < 2; y += 6) { dot(g, 22, y, '#f0e6d0'); dot(g, 23, y + 1, '#f0e6d0'); dot(g, 24, y, '#f0e6d0'); }
    },
    brazier: function (g) {
      ppoly(g, [[8, 30], [10, 30], [17, 10], [15, 10]], '#3a3030'); ppoly(g, [[24, 30], [22, 30], [15, 10], [17, 10]], '#3a3030');
      oval(g, 16, 8, 10, 4, '#4a3e3a'); oval(g, 16, 7, 8, 2, '#8a3a1a');
    },
    bell: function (g, w, h) {
      var V = ['#7a1a12', '#a8281c', '#d0402a', '#ec6c4c'];
      fill(g, 6, -40, 7, h + 40, V[1]); fill(g, w - 13, -40, 7, h + 40, V[1]); fill(g, 6, -40, 2, h + 40, V[3]); fill(g, w - 13, -40, 2, h + 40, V[3]);
      roof(g, -4, w + 4, -52, -34, ROOF.black);
      var B = ['#6a4a14', '#9a7020', '#c89a38', '#f0cc68'];
      ppoly(g, [[w / 2 - 16, -30], [w / 2 + 16, -30], [w / 2 + 22, h - 6], [w / 2 - 22, h - 6]], B[1]);
      ppoly(g, [[w / 2 - 14, -28], [w / 2 - 6, -28], [w / 2 - 10, h - 8], [w / 2 - 18, h - 8]], B[2]);
      for (var y = -22; y < h - 8; y += 9) fill(g, w / 2 - 18 - Math.round((y + 30) / 9), y, 36 + Math.round((y + 30) / 4.5), 1, B[0]);
      fill(g, w / 2 - 22, h - 7, 44, 2, B[0]); dot(g, w / 2 - 12, -24, B[3]); dot(g, w / 2 - 13, -18, B[3]);
    },
    stair_down: function (g, w, h) {
      fill(g, 0, 0, w, h, '#2a2236');
      for (var i = 0; i < 5; i++) { fill(g, 4 + i * 2, 4 + i * 5, w - 8 - i * 4, 4, pmix('#6a5a80', '#0a0810', i / 5)); fill(g, 4 + i * 2, 4 + i * 5, w - 8 - i * 4, 1, pmix('#8a7aa0', '#1a1420', i / 5)); }
    },
    // ---- 里のくらしの小物 ----
    field: function (g, w, h, d) {   // 畑：うねと野菜（v:'flower' は花の畝）
      var fl = d && d.v === 'flower', FC = ['#e84a5a', '#f0c040', '#f088c0', '#ffffff', '#a070e0', '#f08040'];
      fill(g, 1, 1, w - 2, h - 2, '#6a4a2e');
      for (var y = 3; y < h - 3; y += 8) {
        fill(g, 2, y, w - 4, 4, '#8a6640'); fill(g, 2, y, w - 4, 1, '#a07a4e'); fill(g, 2, y + 4, w - 4, 2, '#4a3220');
        for (var x = 6; x < w - 5; x += 7) {
          var v = hash(x, y, 81);
          if (fl) { oval(g, x, y + 2, 3, 2, '#3e8a3a'); var c = FC[Math.floor(hash(x, y, 83) * FC.length)]; oval(g, x, y - 1, 2, 2, c); dot(g, x, y - 1, '#fff6c0'); dot(g, x - 1, y - 2, c); }
          else { oval(g, x, y + 1, 3, 2, v < 0.5 ? '#3e8a3a' : '#5aa848'); dot(g, x - 1, y, '#8ad070'); if (v > 0.8) { dot(g, x, y + 3, '#f0f0e8'); } }
        }
      }
      fill(g, 0, 0, w, 1, '#3a2818'); fill(g, 0, h - 1, w, 1, '#3a2818'); fill(g, 0, 0, 1, h, '#3a2818'); fill(g, w - 1, 0, 1, h, '#3a2818');
    },
    barrel: function (g) { fill(g, 7, 6, 18, 22, '#8a5a32'); fill(g, 7, 6, 3, 22, '#a8743e'); fill(g, 22, 6, 3, 22, '#6a4224'); fill(g, 7, 10, 18, 2, '#3a3a40'); fill(g, 7, 22, 18, 2, '#3a3a40'); oval(g, 16, 6, 9, 3, '#5a3a20'); oval(g, 16, 6, 7, 2, '#3a7aa8'); },
    pots: function (g) { oval(g, 10, 21, 7, 8, '#a8603a'); oval(g, 9, 18, 4, 4, '#c87a4a'); fill(g, 7, 12, 6, 2, '#8a4a2a'); oval(g, 22, 23, 6, 6, '#7a6a5a'); oval(g, 21, 21, 3, 3, '#9a8a78'); fill(g, 19, 16, 6, 2, '#5a4a3a'); },
    firewood: function (g, w) {
      for (var r = 0; r < 3; r++) for (var i = 0; i < Math.floor((w - 6) / 8) - (r === 2 ? 1 : 0); i++) { var x = 4 + i * 8 + (r % 2) * 4, y = 22 - r * 7; oval(g, x + 3, y, 4, 4, '#8a5a32'); oval(g, x + 3, y, 2, 2, '#d8b070'); dot(g, x + 3, y, '#a8804e'); }
    },
    bench: function (g, w) { fill(g, 2, 12, w - 4, 5, WOOD[2]); fill(g, 2, 12, w - 4, 1, WOOD[3]); fill(g, 2, 17, w - 4, 1, WOOD[0]); [4, w - 8].forEach(function (x) { fill(g, x, 17, 4, 9, WOOD[1]); }); },
    board: function (g, w, h, d, u) {
      fill(g, 3, -12, 3, 40, WOOD[1]); fill(g, w - 6, -12, 3, 40, WOOD[1]);
      fill(g, 1, -16, w - 2, 26, WOOD[2]); fill(g, 1, -16, w - 2, 2, WOOD[3]); fill(g, 4, -12, w - 8, 18, '#e8dcc0');
      [[7, -10, 10, 8], [20, -9, 9, 11], [33, -11, 11, 7], [9, -1, 12, 5]].forEach(function (q) { if (q[0] + q[2] < w - 5) { fill(g, q[0], q[1], q[2], q[3], '#fffaf0'); fill(g, q[0] + 2, q[1] + 2, q[2] - 4, 1, '#7a6a5a'); if (q[3] > 6) fill(g, q[0] + 2, q[1] + 4, q[2] - 5, 1, '#7a6a5a'); dot(g, q[0] + Math.floor(q[2] / 2), q[1], '#c83a2a'); } });
      roof(g, -2, w + 2, -22, -14, ROOF.brown, { lightLeft: false });
    },
    cart: function (g, w) {
      fill(g, 4, 8, w - 14, 12, WOOD[2]); fill(g, 4, 8, w - 14, 2, WOOD[3]); for (var x = 8; x < w - 12; x += 6) fill(g, x, 10, 1, 10, WOOD[1]);
      fill(g, w - 12, 15, 12, 2, WOOD[1]);
      oval(g, 12, 22, 7, 7, '#5a3a22'); oval(g, 12, 22, 5, 5, '#8a6640'); oval(g, 12, 22, 2, 2, '#3a2416');
      oval(g, 18, 6, 6, 4, '#c8a050'); oval(g, 26, 7, 5, 3, '#e8d08a'); dot(g, 17, 4, '#f8e8b0');
    },
    laundry: function (g, w) {
      fill(g, 2, -14, 3, 42, WOOD[1]); fill(g, w - 5, -14, 3, 42, WOOD[1]); fill(g, 2, -12, w - 4, 1, '#d8d0c0');
      var cols = ['#e8e0f0', '#5a7ab8', '#c84a4a', '#f0e0a0', '#6aa060'];
      for (var x = 8, i = 0; x < w - 14; x += 14, i++) { fill(g, x, -11, 10, 14, cols[i % cols.length]); fill(g, x, -11, 10, 1, '#ffffff'); fill(g, x + 3, 3, 4, 3, cols[i % cols.length]); }
    },
    stone_marker: function (g, w, h, d, u) {
      var S = ['#4e4a46', '#6e6964', '#8e8880', '#b0aaa0'];
      fill(g, 6, 24, 20, 6, S[1]); fill(g, 6, 24, 20, 1, S[3]);
      fill(g, 10, -10, 12, 34, S[2]); fill(g, 10, -10, 2, 34, S[3]); fill(g, 20, -10, 2, 34, S[1]); fill(g, 11, -12, 10, 2, S[2]);
      label(g, '霧', 16, 4, 10, '#3a3430', u);
    }
  };
  // 光る物（夜の明かり）
  DW.LIGHTS = { lantern: { r: 72, col: '255,200,110', y: -2 }, brazier: { r: 86, col: '255,150,70', y: 4 }, shrine: { r: 60, col: '255,220,150', y: 30 }, stall: { r: 48, col: '255,210,140', y: 8 }, inn: { r: 56, col: '255,210,140', y: 70 }, bell: { r: 92, col: '255,240,190', y: 20 }, torii: { r: 30, col: '255,180,120', y: 0 }, forge: { r: 64, col: '255,140,60', y: 70 }, ship: { r: 40, col: '255,210,140', y: 10 }, gate: { r: 52, col: '255,170,90', y: 10 }, post: { r: 36, col: '255,210,140', y: 40 }, kura: { r: 30, col: '255,210,140', y: 40 }, hut: { r: 40, col: '255,200,130', y: 50 }, dojo: { r: 50, col: '255,210,140', y: 70 }, house: { r: 44, col: '255,206,140', y: 70 }, mon: { r: 64, col: '255,200,120', y: -14 }, lighthouse: { r: 120, col: '255,220,140', y: -30 }, bighouse: { r: 58, col: '255,206,140', y: 80 } };

  // ================= 小物（地図の上：宝箱・立て札・岩・ひび・柵・吹き出し） =================
  // 返す絵は cv.ox・cv.oy だけ外に余白がある。置くときは DW.put
  var smallCache = {};
  function small(key, w, h, fn) {
    if (smallCache[key]) return smallCache[key];
    var S = PT.sheet(w + 4, h + 4, GS); S.g.translate(2, 2); fn(S.g);
    var cv = PT.outline(S.cv, OUT, 0.9); cv.ox = 2; cv.oy = 2;
    smallCache[key] = cv; return cv;
  }
  DW.put = function (c, cv, x, y) { c.drawImage(cv, x - (cv.ox || 0), y - (cv.oy || 0), cv.width / (cv.u || 1), cv.height / (cv.u || 1)); };
  DW.chestSprite = function (open) {
    return small('chest' + (open ? 1 : 0), 28, 24, function (g) {
      if (open) { fill(g, 3, 4, 22, 7, '#7a4a2a'); fill(g, 3, 4, 22, 1, '#a06838'); fill(g, 3, 11, 22, 12, '#8a5530'); fill(g, 5, 12, 18, 4, '#2a1a10'); fill(g, 3, 16, 22, 1, '#e8c050'); }
      else { fill(g, 3, 6, 22, 7, '#b8743a'); fill(g, 3, 6, 22, 1, '#dc9a58'); fill(g, 3, 13, 22, 10, '#a0602e'); fill(g, 3, 13, 22, 1, '#e8c050'); fill(g, 12, 11, 4, 6, '#e8c050'); fill(g, 13, 13, 2, 2, '#6a4010'); fill(g, 3, 6, 1, 17, '#e8c050'); fill(g, 24, 6, 1, 17, '#e8c050'); }
    });
  };
  DW.signSprite = function () {
    return small('sign', 26, 30, function (g) {
      fill(g, 11, 14, 4, 15, WOOD[1]); fill(g, 11, 14, 1, 15, WOOD[3]);
      fill(g, 2, 2, 22, 13, '#c8a070'); fill(g, 2, 2, 22, 1, '#e8c898'); fill(g, 2, 14, 22, 1, '#8a6a42');
      fill(g, 6, 6, 14, 1, '#6a4a2a'); fill(g, 6, 9, 10, 1, '#6a4a2a');
    });
  };
  DW.boulderSprite = function () {
    return small('boulder', 32, 32, function (g) {
      var R = ['#5e5850', '#827b72', '#a29a8e', '#c2bbb0'];
      ppoly(g, [[1, 29], [2, 13], [10, 3], [24, 2], [31, 12], [31, 29]], R[1]);
      ppoly(g, [[5, 12], [11, 5], [22, 5], [14, 13]], R[3]); ppoly(g, [[20, 27], [30, 16], [30, 29]], R[0]);
      fill(g, 8, 20, 6, 1, R[0]); fill(g, 22, 12, 1, 6, R[0]); dot(g, 17, 18, R[2]);
    });
  };
  DW.crackSprite = function () {
    return small('crack', 32, 32, function (g) {
      var R = ['#4e4840', '#6e665c', '#8e857a', '#aaa094'];
      ppoly(g, [[0, 31], [1, 6], [8, 0], [25, 0], [31, 6], [32, 31]], R[1]); fill(g, 2, 2, 28, 2, R[3]);
      [[16, 2], [13, 9], [18, 14], [13, 23], [15, 30]].forEach(function (p, i, a) { if (i) { var q = a[i - 1]; ppoly(g, [[q[0], q[1]], [p[0], p[1]], [p[0] + 2, p[1]], [q[0] + 2, q[1]]], '#1e1814'); } });
      ppoly(g, [[18, 14], [25, 20], [26, 21], [19, 15]], '#1e1814');
    });
  };
  DW.barrierSprite = function (w, under) {
    return small('barrier' + w + (under ? 'u' : ''), w * T, 32, function (g) {
      if (under) return;
      for (var k = 0; k < w; k++) { var gx = k * T; fill(g, gx + 3, 2, 5, 28, WOOD[1]); fill(g, gx + 24, 2, 5, 28, WOOD[1]); fill(g, gx, 8, T, 5, WOOD[2]); fill(g, gx, 8, T, 1, WOOD[3]); fill(g, gx, 18, T, 5, WOOD[2]); fill(g, gx, 18, T, 1, WOOD[3]); }
      fill(g, w * T / 2 - 9, 9, 18, 13, '#f4ecd8'); fill(g, w * T / 2 - 6, 11, 2, 9, '#a82a2a'); fill(g, w * T / 2 - 2, 11, 8, 2, '#a82a2a'); fill(g, w * T / 2 + 1, 13, 2, 7, '#a82a2a');
    });
  };
  // 吹き出し（！ ？ … ♪ 💤 など）は小さな絵の字で
  // 吹き出し（！ ？ … ♪ z ★）：白い丸い吹き出しに丸ゴシックの字
  DW.bubbleSprite = function (ch, col) {
    var key = 'bub' + ch + (col || ''), c = smallCache[key];
    if (c && c.font) return c;
    delete smallCache[key];
    c = small(key, 18, 19, function (g) {
      PT.rrect(g, 1, 1, 16, 13, 6, '#fffaf2');
      ppoly(g, [[6.5, 13], [11, 13], [8, 17.5]], '#fffaf2');
      g.font = '700 10px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = col || (ch === '！' || ch === '!' ? '#d8364a' : '#3a2a22');
      g.fillText(ch, 9, 8);
    });
    c.font = fontOk();
    return c;
  };

  // ================= なめらかな図形（戦闘の光・数字などで使う） =================
  function circle(c, x, y, r, fillc, stroke, lw) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); if (fillc) { c.fillStyle = fillc; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function ell(c, x, y, rx, ry, fillc, stroke, lw) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); if (fillc) { c.fillStyle = fillc; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function poly(c, pts, fillc, stroke, lw) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); if (fillc) { c.fillStyle = fillc; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.lineJoin = 'round'; c.stroke(); } }
  function rrect(c, x, y, w, h, r, fillc, stroke, lw) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (fillc) { c.fillStyle = fillc; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function text(c, s, x, y, size, fillc) { c.font = '700 ' + size + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = fillc; c.fillText(s, x, y); }
  function mix(a, b, t) { var A = rgbA(a), B = rgbA(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }

  DW.T = T; DW.OUT = OUT; DW.GS = GS; DW.FONT = FONT; DW.mk = mk; DW.circle = circle; DW.ell = ell; DW.poly = poly; DW.rrect = rrect; DW.text = text; DW.mix = mix; DW.rnd = PT.rnd;
  root.NYT_DRAW = DW;
})(typeof window !== 'undefined' ? window : globalThis);
