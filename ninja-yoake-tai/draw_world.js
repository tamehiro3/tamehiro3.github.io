/* ニンジャ夜明け隊（RPG） — 地図のドット絵（マップチップ・木・建物）
 * 1マス = 32ドット（世界の単位と同じ）。画像ファイルは使わず、決まった手順で1ドットずつ描く。
 * ・地面：地図ごとに1枚の絵。草の上に道・石畳・砂・水などを重ね、境目は丸くつなぐ（オートタイル）。
 * ・崖と壁は、上の面と前の面（見下ろしの立体）。茂み・岩・柵・橋も地面の絵に入れる。
 * ・木・松・竹は1本ずつの絵、建物と置物も1つずつの絵（人と前後するため）。
 * 光は左上から（左上が明るく、右下が暗い）。外形の輪郭はこげ茶。
 * 戦闘の絵が使う、なめらかな図形の道具（circle・ell など）も、ここに置く。
 */
(function (root) {
  'use strict';
  var PIX = root.NYT_PIX;
  var T = 32, OUT = '#2b1d16';
  var DW = {};
  var mk = PIX.mk, fill = PIX.fill, dot = PIX.dot, oval = PIX.oval, ppoly = PIX.poly, pmix = PIX.mix, dk = PIX.dark, lt = PIX.light, hash = PIX.hash, bayer = PIX.bayer, rgbA = PIX.rgb;

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
  function theme(F) { return THEME[F.def.theme] || THEME.village; }
  var CACHE_RGB = {};
  function C(h) { return CACHE_RGB[h] || (CACHE_RGB[h] = rgbA(h)); }

  // 値のノイズ（なめらかな濃淡のむら）
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // ================= 地面 =================
  // 材質：0 なし 1 空 2 草 3 洞の床 4 雲 5 根の国の土 6 砂 7 砂利 8 道 9 石畳 10 床 11 板 12 水 13 崖など（上面）
  var M_NAME = ['void', 'sky', 'grass', 'cave', 'cloud', 'dark', 'sand', 'gravel', 'path', 'stone', 'floor', 'deck', 'water', 'block'];
  var Z = [0, 1, 2, 2, 2, 2, 3, 4, 5, 6, 6, 7, 8, 9];          // 大きいほど上（上のものは縮んで、下のものが境目に見える）
  var INSET = [0, 3, 0, 0, 0, 0, 2, 2, 3, 2, 1, 0, 4, 0];      // 縮む量（ドット）
  var JAG = [0, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0];        // 境目のぎざぎざ
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

  // 1ドットの色（材質と、地図の上の位置から）
  function texel(m, X, Y, P) {
    var h = hash(X, Y, 7), n, b;
    switch (m) {
      case 0: return C('#07060c');
      case 1: { var sk = P.sk, t = Math.min(1, Y / 700); return C(t < 0.5 ? (bayer(X, Y) < t * 2 ? sk[1] : sk[0]) : (bayer(X, Y) < (t - 0.5) * 2 ? sk[2] : sk[1])); }
      case 2: case 4: case 5: {
        var G = m === 2 ? P.g : m === 4 ? P.cl : P.dkg;
        n = vnoise(X / 30, Y / 30, m); b = bayer(X, Y);
        var c = G[1];
        if (n > 0.66) c = b < (n - 0.66) * 3.5 ? G[2] : G[1];
        if (h < 0.028) c = G[0]; else if (h > 0.975) c = G[2];
        return C(c);
      }
      case 3: { var V = P.cv; n = vnoise(X / 24, Y / 24, 3); var cc = n > 0.68 ? (bayer(X, Y) < 0.5 ? V[3] : V[2]) : V[2]; if (h < 0.05) cc = V[1]; else if (h > 0.975) cc = V[3]; return C(cc); }
      case 6: { var S = P.sa; n = vnoise(X / 30, Y / 30, 6); var cs = n > 0.62 ? (bayer(X, Y) < (n - 0.62) * 4 ? S[3] : S[2]) : S[2]; if (h < 0.04) cs = S[1]; else if (h > 0.97) cs = S[3]; return C(cs); }
      case 7: { var Gv = P.gv; return C(h < 0.25 ? Gv[0] : h < 0.6 ? Gv[1] : h < 0.88 ? Gv[2] : Gv[3]); }
      case 8: { var Pp = P.p; n = vnoise(X / 20, Y / 20, 8); var cp = n < 0.28 ? (bayer(X, Y) < (0.28 - n) * 3 ? Pp[1] : Pp[2]) : Pp[2]; if (h < 0.045) cp = Pp[1]; else if (h > 0.965) cp = Pp[3]; return C(cp); }
      case 9: { // 石畳（ずらして並べた石）
        var St = P.st, row = Math.floor(Y / 8), off = (row % 2) * 6 + Math.floor(hash(row, 0, 9) * 4), col = Math.floor((X + off) / 12);
        var lx = (X + off) % 12, ly = Y % 8;
        if (lx === 0 || ly === 0) return C(St[0]);
        var sv = hash(col, row, 19);
        if (ly === 1 || lx === 1) return C(sv < 0.5 ? St[3] : St[2]);
        if (ly === 7 || lx === 11) return C(St[1]);
        return C(sv < 0.3 ? St[1] : sv > 0.8 ? St[3] : St[2]);
      }
      case 10: { // 床（大きな石の板）
        var Fo = P.fo, lx2 = X % 16, ly2 = Y % 16;
        if (lx2 === 0 || ly2 === 0) return C(Fo[0]);
        if (lx2 === 1 || ly2 === 1) return C(Fo[3]);
        if (lx2 === 15 || ly2 === 15) return C(Fo[1]);
        return C(h < 0.06 ? Fo[1] : Fo[2]);
      }
      case 11: { // 板の床（横の板）
        var ly3 = Y % 6, seam = (X + Math.floor(Y / 6) * 13) % 40;
        if (ly3 === 0) return C('#4a301c');
        if (seam === 0) return C('#5a3a22');
        if (ly3 === 1) return C('#b88a56');
        return C(h < 0.08 ? '#7a5434' : '#9a6e44');
      }
      case 12: { var Wt = P.w; n = vnoise(X / 48, Y / 32, 12); var cw = n < 0.3 ? (bayer(X, Y) < (0.3 - n) * 3 ? Wt[0] : Wt[1]) : Wt[1]; if (((Y + Math.floor(X / 14) * 5) % 9 === 0) && hash(X >> 3, Y, 12) < 0.4) cw = Wt[2]; return C(cw); }
      case 13: return C(P.r[1]);
    }
    return C('#ff00ff');
  }

  DW.buildGround = function (F) {
    var P = theme(F), FW = F.w, FH = F.h, W = FW * T, H = FH * T;
    var cv = mk(W, H), g = cv.getContext('2d'), img = g.createImageData(W, H), D = img.data;
    var at = function (x, y) { if (x < 0 || y < 0 || x >= FW || y >= FH) return null; return F.tiles[y * FW + x]; };
    // マスごとの材質
    var M = new Uint8Array(FW * FH);
    for (var i = 0; i < FW * FH; i++) M[i] = matOf(F.tiles[i], P);
    var M0 = M.slice();
    for (var i2 = 0; i2 < FW * FH; i2++) if (M0[i2] === 255) M[i2] = inherit(M0, F.tiles, FW, FH, i2 % FW, Math.floor(i2 / FW), P);
    var mAt = function (x, y, own) { if (x < 0 || y < 0 || x >= FW || y >= FH) return own; return M[y * FW + x]; };
    // ドットごとの材質（上のものは縮んで、角は丸く）
    var MP = new Uint8Array(W * H);
    var nb = new Int16Array(8);   // L R U D UL UR DL DR（下の材質。なければ -1）
    var NBD = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var cy = 0; cy < FH; cy++) for (var cx = 0; cx < FW; cx++) {
      var m = M[cy * FW + cx], z = Z[m], ins = INSET[m], any = false;
      for (var q8 = 0; q8 < 8; q8++) {
        var nx = cx + NBD[q8][0], ny = cy + NBD[q8][1], n = (nx < 0 || ny < 0 || nx >= FW || ny >= FH) ? m : M[ny * FW + nx];
        nb[q8] = (Z[n] < z && n !== 0) ? n : -1; if (nb[q8] >= 0) any = true;
      }
      if (!ins) any = false;
      var R2 = ins * 2 + 3, L = nb[0], Rr = nb[1], U = nb[2], Dn = nb[3];
      for (var ly = 0; ly < T; ly++) {
        var rowBase = (cy * T + ly) * W + cx * T;
        for (var lx = 0; lx < T; lx++) {
          var out = m;
          if (any) {
            var ax = lx + 0.5, bx = T - ax, ay = ly + 0.5, by = T - ay, dmin = 99, who = m, dc;
            if (L >= 0 && ax < dmin) { dmin = ax; who = L; }
            if (Rr >= 0 && bx < dmin) { dmin = bx; who = Rr; }
            if (U >= 0 && ay < dmin) { dmin = ay; who = U; }
            if (Dn >= 0 && by < dmin) { dmin = by; who = Dn; }
            // 外の角（2つの辺がどちらも下のもの）は丸く
            if (L >= 0 && U >= 0 && ax < R2 && ay < R2) { dc = R2 - Math.sqrt((R2 - ax) * (R2 - ax) + (R2 - ay) * (R2 - ay)); if (dc < dmin) { dmin = dc; who = L; } }
            if (Rr >= 0 && U >= 0 && bx < R2 && ay < R2) { dc = R2 - Math.sqrt((R2 - bx) * (R2 - bx) + (R2 - ay) * (R2 - ay)); if (dc < dmin) { dmin = dc; who = Rr; } }
            if (L >= 0 && Dn >= 0 && ax < R2 && by < R2) { dc = R2 - Math.sqrt((R2 - ax) * (R2 - ax) + (R2 - by) * (R2 - by)); if (dc < dmin) { dmin = dc; who = L; } }
            if (Rr >= 0 && Dn >= 0 && bx < R2 && by < R2) { dc = R2 - Math.sqrt((R2 - bx) * (R2 - bx) + (R2 - by) * (R2 - by)); if (dc < dmin) { dmin = dc; who = Rr; } }
            // 内の角（ななめだけ下のもの）は小さく欠ける
            if (nb[4] >= 0 && L < 0 && U < 0) { dc = Math.sqrt(ax * ax + ay * ay); if (dc < dmin) { dmin = dc; who = nb[4]; } }
            if (nb[5] >= 0 && Rr < 0 && U < 0) { dc = Math.sqrt(bx * bx + ay * ay); if (dc < dmin) { dmin = dc; who = nb[5]; } }
            if (nb[6] >= 0 && L < 0 && Dn < 0) { dc = Math.sqrt(ax * ax + by * by); if (dc < dmin) { dmin = dc; who = nb[6]; } }
            if (nb[7] >= 0 && Rr < 0 && Dn < 0) { dc = Math.sqrt(bx * bx + by * by); if (dc < dmin) { dmin = dc; who = nb[7]; } }
            var X = cx * T + lx, Y = cy * T + ly;
            var jag = JAG[m] ? (hash(X >> 1, Y >> 1, 3) < 0.5 ? 0.6 : -0.6) : 0;
            if (dmin + jag < ins) out = who;
          }
          MP[rowBase + lx] = out;
        }
      }
    }
    // 色を置く（境目のふちどり：水は泡と浅いところ、道などは暗いふち、水ぎわの陸はぬれて暗く）
    var isLow = function (n, mm) { return n !== 255 && n !== mm && n !== 0 && Z[n] < Z[mm]; };
    var RIM1 = {}, RIM2 = {};
    RIM1[6] = C(P.sa[1]); RIM1[8] = C(P.p[0]); RIM1[9] = C(P.st[0]); RIM1[10] = C(P.fo[0]);
    RIM2[6] = C(P.sa[1]); RIM2[8] = C(P.p[1]); RIM2[9] = C(P.st[1]); RIM2[10] = C(P.fo[1]);
    var FOAM = C(P.w[3]), SHAL = C(P.w[2]);
    for (var Y2 = 0; Y2 < H; Y2++) for (var X2 = 0; X2 < W; X2++) {
      var o2 = Y2 * W + X2, mm = MP[o2], col = texel(mm, X2, Y2, P);
      var nL = X2 > 0 ? MP[o2 - 1] : 255, nR = X2 < W - 1 ? MP[o2 + 1] : 255, nU = Y2 > 0 ? MP[o2 - W] : 255, nD = Y2 < H - 1 ? MP[o2 + W] : 255;
      if (mm === 12) {
        if (isLow(nL, 12) || isLow(nR, 12) || isLow(nU, 12) || isLow(nD, 12)) col = FOAM;
        else {
          for (var r = 2; r <= 3; r++) {
            var a1 = X2 - r >= 0 ? MP[o2 - r] : 255, a2 = X2 + r < W ? MP[o2 + r] : 255, a3 = Y2 - r >= 0 ? MP[o2 - r * W] : 255, a4 = Y2 + r < H ? MP[o2 + r * W] : 255;
            if (isLow(a1, 12) || isLow(a2, 12) || isLow(a3, 12) || isLow(a4, 12)) { col = SHAL; break; }
          }
        }
      } else if (RIM1[mm]) {
        if (isLow(nL, mm) || isLow(nU, mm)) col = RIM1[mm];
        else if (isLow(nR, mm) || isLow(nD, mm)) col = RIM2[mm];
      } else if (mm !== 13 && mm !== 0 && (nL === 12 || nR === 12 || nU === 12 || nD === 12)) {
        col = [col[0] * 0.7 | 0, col[1] * 0.7 | 0, col[2] * 0.72 | 0];
      }
      var q = o2 * 4; D[q] = col[0]; D[q + 1] = col[1]; D[q + 2] = col[2]; D[q + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // 細かいもの（草の葉・花・小石・彼岸花）
    for (var y = 0; y < FH; y++) for (var x = 0; x < FW; x++) {
      var ch = at(x, y), base = M[y * FW + x], rr = PIX.rnd(x * 7919 + y * 104729 + 17), ox = x * T, oy = y * T;
      if (base === 2 || base === 4 || base === 5) blades(g, ox, oy, base === 2 ? P.g : base === 4 ? P.cl : P.dkg, rr, ch === '"' ? 0 : 4);
      if (ch === '"') tallGrass(g, ox, oy, P.g, rr);
      if (ch === 'f') flowers(g, ox, oy, P, rr);
      if (ch === ',') pebbles(g, ox, oy, P.p, rr);
      if (ch === 'l') lilies(g, ox, oy, rr);
      if (ch === 'd' && rr() < 0.4) pebbles(g, ox, oy, P.cv, rr);
    }
    // 崖・壁（上の面と前の面）
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) {
      var c2 = at(x, y);
      if (c2 === '#' || c2 === 'D' || c2 === 'W' || c2 === 'S') block(g, c2, x, y, at, P);
    }
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) { var c4 = at(x, y); if (c4 !== '#' && c4 !== 'D' && c4 !== 'W' && c4 !== 'S' && c4 !== 'x') wallShadow(g, x, y, at); }
    // 背の低い物（茂み・岩・柵・橋）
    for (y = 0; y < FH; y++) for (x = 0; x < FW; x++) {
      var c3 = at(x, y), r3 = PIX.rnd(x * 92821 + y * 68917 + 5);
      if (c3 === 't') bush(g, x * T, y * T, P, r3);
      else if (c3 === 'r') rock(g, x * T, y * T, P, r3);
      else if (c3 === 'F') fence(g, x, y, at);
      else if (c3 === '=') bridge(g, x, y, at, F);
    }
    return cv;
  };
  // 地図の外（画面のすき間）の色
  DW.voidColor = function (F) { var t = F.def.theme; return t === 'sky' ? '#94b2ee' : t === 'cave' || t === 'seacave' || t === 'under' ? '#07060c' : '#0b0d16'; };

  // ---- 細かいもの ----
  function blades(g, ox, oy, G, r, n) {
    for (var i = 0; i < n; i++) {
      var x = ox + 2 + Math.floor(r() * 28), y = oy + 3 + Math.floor(r() * 27);
      dot(g, x, y, G[3]); dot(g, x, y + 1, G[2]); dot(g, x + 2, y + 1, G[3]); dot(g, x + 2, y + 2, G[2]);
    }
  }
  function tallGrass(g, ox, oy, G, r) {
    for (var i = 0; i < 6; i++) {
      var x = ox + 2 + Math.floor(r() * 24), y = oy + 6 + Math.floor(r() * 22);
      fill(g, x, y + 3, 7, 2, G[0]);
      dot(g, x, y + 1, G[1]); dot(g, x, y + 2, G[1]); dot(g, x - 1, y, G[2]);
      dot(g, x + 3, y, G[1]); dot(g, x + 3, y + 1, G[1]); dot(g, x + 3, y + 2, G[1]); dot(g, x + 3, y - 1, G[3]);
      dot(g, x + 6, y + 1, G[1]); dot(g, x + 6, y + 2, G[1]); dot(g, x + 7, y, G[2]);
    }
  }
  function flowers(g, ox, oy, P, r) {
    for (var i = 0; i < 5; i++) {
      var x = ox + 3 + Math.floor(r() * 25), y = oy + 3 + Math.floor(r() * 25), c = P.fl[Math.floor(r() * P.fl.length)];
      dot(g, x - 1, y + 2, P.g[0]); dot(g, x, y + 2, P.g[2]);
      dot(g, x, y - 1, c); dot(g, x - 1, y, c); dot(g, x + 1, y, c); dot(g, x, y + 1, c); dot(g, x, y, '#f0a830');
    }
  }
  function pebbles(g, ox, oy, Pp, r) {
    for (var i = 0; i < 3; i++) { var x = ox + 4 + Math.floor(r() * 24), y = oy + 4 + Math.floor(r() * 24); fill(g, x, y, 2, 1, Pp[0]); dot(g, x, y - 1, Pp[3]); }
  }
  function lilies(g, ox, oy, r) {
    for (var i = 0; i < 3; i++) {
      var x = ox + 5 + Math.floor(r() * 22), y = oy + 8 + Math.floor(r() * 20);
      fill(g, x, y, 1, 5, '#2e5a32');
      [[-3, -2], [-2, -3], [0, -4], [2, -3], [3, -2], [-2, 0], [2, 0]].forEach(function (p) { dot(g, x + p[0], y + p[1], '#d8283e'); });
      dot(g, x - 1, y - 1, '#f05468'); dot(g, x + 1, y - 1, '#f05468'); dot(g, x, y - 1, '#ffd0d8');
    }
  }
  // 崖（#）・洞の壁（D）・砦の壁（W：城の塀）・石垣（S）。上の面は暗く、前の面は明るく、下の地面に影
  var KAWARA = ['#18181e', '#26262e', '#363642', '#4c4c5a'];
  function block(g, ch, x, y, at, P) {
    var ox = x * T, oy = y * T, same = function (q) { return q === ch || q === null || q === 'x'; };
    var open = !same(at(x, y + 1));
    var fh = !open ? 0 : ch === '#' ? 20 : ch === 'D' ? 22 : ch === 'W' ? 22 : 16;
    var topH = T - fh, R = P.r, G = P.g, CF = P.cf;
    var mossy = ch === '#' && P.top === 'g';
    // 上の面
    for (var j = 0; j < topH; j++) for (var i = 0; i < T; i++) {
      var X = ox + i, Y = oy + j, h = hash(X, Y, 31), c, n;
      if (ch === 'W') { var row = Math.floor(Y / 5), lx = (X + (row % 2) * 2) % 4; c = (Y % 5 === 0) ? KAWARA[0] : (Y % 5 === 1 ? KAWARA[3] : (lx === 0 ? KAWARA[1] : KAWARA[2])); }
      else if (ch === 'S') { c = ((X + (Math.floor(Y / 6) % 2) * 5) % 10 === 0 || Y % 6 === 0) ? R[0] : (h < 0.2 ? R[3] : R[2]); }
      else if (mossy) { n = vnoise(X / 16, Y / 16, 5); c = n > 0.58 ? (bayer(X, Y) < 0.75 ? G[0] : G[1]) : R[1]; var n2 = vnoise(X / 7, Y / 7, 6); if (n <= 0.58 && n2 > 0.7) c = R[2]; if (n <= 0.58 && n2 < 0.18) c = R[0]; if (h < 0.03) c = R[0]; }
      else { n = vnoise(X / 9, Y / 9, 4); c = n > 0.72 ? R[1] : R[0]; if (n > 0.8) c = bayer(X, Y) < 0.5 ? R[2] : R[1]; if (h < 0.025) c = R[1]; }
      dot(g, X, Y, c);
    }
    // 前の面
    if (open) {
      var fy = oy + topH;
      for (var jj = 0; jj < fh; jj++) for (var ii = 0; ii < T; ii++) {
        var X2 = ox + ii, Y2 = fy + jj, h2 = hash(X2, Y2, 41), cc;
        if (ch === 'W') { cc = jj < 13 ? (h2 < 0.05 ? '#d8d0c0' : '#ece6d8') : (jj === 13 ? '#1a1a20' : ((X2 + Y2) % 6 === 0 || (X2 - Y2 + 60) % 6 === 0 ? '#e8e2d4' : '#2e2e36')); if (jj === 0) cc = '#00000080'; }
        else if (ch === 'S') { var rw = Math.floor(jj / 5), lx2 = (X2 + rw * 5) % 10; cc = (jj % 5 === 0 || lx2 === 0) ? CF[0] : (jj % 5 === 1 ? CF[2] : CF[1]); }
        else { var strata = (X2 + Math.floor(hash(Math.floor(X2 / 6), 0, 51) * 4)) % 6; cc = strata === 0 ? CF[0] : (strata === 1 ? CF[2] : (h2 < 0.1 ? CF[0] : CF[1])); if (jj > fh - 5 && bayer(X2, Y2) < (jj - fh + 5) / 6) cc = CF[0]; }
        dot(g, X2, Y2, cc);
      }
      if (ch !== 'W') { fill(g, ox, fy, T, 1, mossy ? G[3] : lt(R[2], 0.2)); fill(g, ox, fy + 1, T, 1, lt(CF[2], 0.15)); }
      if (mossy) for (var k = 0; k < T; k++) if (hash(ox + k, fy, 61) < 0.4) { dot(g, ox + k, fy + 1, G[1]); if (hash(ox + k, fy, 62) < 0.4) dot(g, ox + k, fy + 2, G[0]); }
    }
    // ふち：低い地面に面したところは、明るい線と暗い線の2本
    var low = function (q) { return !same(q); }, rimD = ch === 'W' ? KAWARA[0] : '#0c0a0c', rimL = ch === 'W' ? KAWARA[3] : (mossy ? G[2] : lt(R[2], 0.25));
    if (low(at(x - 1, y))) { fill(g, ox, oy, 1, T, rimD); fill(g, ox + 1, oy, 1, topH, rimL); }
    if (low(at(x + 1, y))) { fill(g, ox + T - 1, oy, 1, T, rimD); fill(g, ox + T - 2, oy, 1, topH, rimL); }
    if (low(at(x, y - 1))) { fill(g, ox, oy, T, 1, rimD); fill(g, ox, oy + 1, T, 1, rimL); }
  }
  // 壁や崖のすぐ下の地面に、うすい影
  function wallShadow(g, x, y, at) {
    var up = at(x, y - 1); if (up !== '#' && up !== 'D' && up !== 'W' && up !== 'S') return;
    for (var j = 0; j < 5; j++) for (var i = 0; i < T; i++) if (bayer(x * T + i, y * T + j) < (5 - j) / 7) dot(g, x * T + i, y * T + j, '#0a080c66');
  }
  function bush(g, ox, oy, P, r) {
    var G = P.tr;
    PIX.dither(g, ox + 5, oy + 26, 22, 3, 'rgba(0,0,0,0)', '#18241466', 0.5);
    var c = mk(32, 32), q = c.getContext('2d');
    oval(q, 10, 19, 8, 7, G[1]); oval(q, 22, 19, 8, 7, G[1]); oval(q, 16, 13, 10, 8, G[1]);
    oval(q, 13, 11, 5, 4, G[2]); oval(q, 21, 15, 3, 3, G[2]); oval(q, 8, 17, 3, 3, G[2]);
    dot(q, 12, 9, G[3]); dot(q, 13, 9, G[3]); dot(q, 20, 13, G[3]);
    oval(q, 16, 25, 11, 2, G[0]);
    PIX.outline(c, OUT);
    g.drawImage(c, ox, oy);
    if (r() < 0.35) { var bx = ox + 9 + Math.floor(r() * 12), by = oy + 12 + Math.floor(r() * 8); dot(g, bx, by, '#e84a5a'); dot(g, bx + 1, by, '#ff8a8a'); }
  }
  function rock(g, ox, oy, P, r) {
    var R = P.r, c = mk(32, 32), q = c.getContext('2d');
    ppoly(q, [[4, 27], [5, 15], [11, 8], [21, 7], [28, 13], [29, 27]], R[1]);
    ppoly(q, [[7, 15], [12, 10], [20, 9], [16, 15]], R[3]);
    ppoly(q, [[18, 24], [27, 18], [28, 27]], R[0]);
    dot(q, 12, 20, R[0]); dot(q, 13, 21, R[0]); dot(q, 22, 14, R[2]);
    PIX.outline(c, OUT);
    PIX.dither(g, ox + 4, oy + 27, 26, 3, 'rgba(0,0,0,0)', '#0e0a0844', 0.5);
    g.drawImage(c, ox, oy);
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

  // ================= 背の高いもの（木・松・竹） =================
  // 返す絵は、マスの左上を (ox, oy) に合わせて描く。幹の根もとはマスの下のほう
  var tallCache = {};
  DW.tallSprite = function (kind, themeName, variant) {
    var k = kind + '|' + themeName + '|' + variant;
    if (tallCache[k]) return tallCache[k];
    var P = THEME[themeName] || THEME.village, cv, ox, oy;
    if (kind === 'T') { cv = tree(P, variant, themeName); ox = 8; oy = 30; }
    else if (kind === 'K') { cv = tree(THEME.sky, variant, 'sky'); ox = 8; oy = 30; }
    else if (kind === 'Y') { cv = pine(P, variant); ox = 6; oy = 36; }
    else { cv = bamboo(P, variant); ox = 4; oy = 44; }
    tallCache[k] = { cv: cv, ox: ox, oy: oy, w: cv.width, h: cv.height };
    return tallCache[k];
  };
  function tree(P, v, themeName) {
    var W = 48, H = 62, c = mk(W, H), g = c.getContext('2d'), G = P.tr, K = P.tk, r = PIX.rnd(v * 977 + 31);
    var dead = themeName === 'under';
    // 幹
    fill(g, 20, 40, 8, 20, K[1]); fill(g, 20, 40, 2, 20, K[2]); fill(g, 26, 40, 2, 20, K[0]);
    fill(g, 17, 57, 3, 3, K[1]); fill(g, 28, 57, 3, 3, K[1]); fill(g, 22, 50, 2, 2, K[0]);
    if (dead) {
      fill(g, 23, 14, 3, 28, K[1]); ppoly(g, [[24, 24], [10, 12], [12, 10], [25, 20]], K[1]); ppoly(g, [[25, 30], [38, 16], [40, 18], [26, 33]], K[1]);
      oval(g, 12, 10, 6, 4, G[1]); oval(g, 38, 15, 6, 4, G[1]); oval(g, 25, 11, 7, 5, G[2]);
      PIX.outline(c, OUT); return c;
    }
    // 葉のかたまり
    var blobs = [[24, 24, 19, 15], [12, 30, 10, 9], [36, 30, 10, 9], [17, 15, 10, 9], [31, 15, 10, 9], [24, 33, 13, 8]];
    blobs.forEach(function (b, i) { oval(g, b[0] + (i ? Math.round((r() - 0.5) * 3) : 0), b[1] + (i ? Math.round((r() - 0.5) * 2) : 0), b[2], b[3], G[1]); });
    // 下の影
    for (var y = 28; y < 44; y++) for (var x = 0; x < W; x++) { var d = g.getImageData(x, y, 1, 1).data; if (d[3] > 0 && d[1] > 0 && (y > 36 || bayer(x, y) < (y - 28) / 16) && !(x >= 20 && x < 28 && y >= 40)) dot(g, x, y, G[0]); }
    // 明るいところ（左上）
    oval(g, 18, 14, 7, 5, G[2]); oval(g, 13, 26, 5, 4, G[2]); oval(g, 28, 20, 6, 4, G[2]);
    for (var i = 0; i < 18; i++) { var hx = 8 + Math.floor(r() * 26), hy = 8 + Math.floor(r() * 20); if (g.getImageData(hx, hy, 1, 1).data[3]) { dot(g, hx, hy, G[3]); dot(g, hx + 1, hy, G[2]); } }
    if (themeName === 'sky' || (v === 2 && themeName === 'village')) for (var f = 0; f < 10; f++) { var fx = 8 + Math.floor(r() * 32), fy = 8 + Math.floor(r() * 28); if (g.getImageData(fx, fy, 1, 1).data[3]) { dot(g, fx, fy, '#ffd6e4'); dot(g, fx + 1, fy, '#f6a8c4'); } }
    PIX.outline(c, OUT);
    // 根もとの影
    for (var sx = 12; sx < 36; sx++) for (var sy = 58; sy < 62; sy++) { var dd = (sx - 24) * (sx - 24) / 144 + (sy - 59.5) * (sy - 59.5) / 3; if (dd < 1 && !g.getImageData(sx, sy, 1, 1).data[3] && bayer(sx, sy) < 0.5) dot(g, sx, sy, '#14200f'); }
    return c;
  }
  function pine(P, v) {
    var W = 44, H = 68, c = mk(W, H), g = c.getContext('2d'), G = P.tr, K = P.tk, r = PIX.rnd(v * 31 + 7);
    fill(g, 19, 50, 6, 16, K[1]); fill(g, 19, 50, 2, 16, K[2]); fill(g, 23, 50, 2, 16, K[0]);
    var tiers = [[22, 4, 8, 16], [22, 14, 13, 18], [22, 26, 18, 18], [22, 38, 21, 16]];
    tiers.forEach(function (t, i) {
      var cx = t[0], top = t[1], hw = t[2], hh = t[3];
      ppoly(g, [[cx, top], [cx + hw, top + hh], [cx + hw - 3, top + hh + 2], [cx, top + hh - 1], [cx - hw + 3, top + hh + 2], [cx - hw, top + hh]], G[1]);
      ppoly(g, [[cx, top + 2], [cx - hw + 4, top + hh - 1], [cx - 2, top + hh - 3]], G[2]);
      for (var k = 0; k < hw; k += 3) dot(g, cx + k - Math.floor(hw / 2), top + hh - 1 - (k % 2), G[0]);
      dot(g, cx - 2, top + 5 + i, G[3]); dot(g, cx - 4, top + 8 + i, G[3]);
    });
    PIX.outline(c, OUT);
    for (var sx = 10; sx < 34; sx++) for (var sy = 63; sy < 67; sy++) { var dd = (sx - 22) * (sx - 22) / 121 + (sy - 64.5) * (sy - 64.5) / 3; if (dd < 1 && !g.getImageData(sx, sy, 1, 1).data[3] && bayer(sx, sy) < 0.5) dot(g, sx, sy, '#14200f'); }
    return c;
  }
  function bamboo(P, v) {
    var W = 40, H = 76, c = mk(W, H), g = c.getContext('2d'), r = PIX.rnd(v * 53 + 11);
    for (var j = 0; j < 4; j++) {
      var x = 5 + j * 8 + Math.floor(r() * 3), top = 6 + Math.floor(r() * 14), col = j % 2 ? '#5e9a3a' : '#74b04a';
      fill(g, x, top, 4, 72 - top, col); fill(g, x, top, 1, 72 - top, '#a4d470'); fill(g, x + 3, top, 1, 72 - top, '#3e6e26');
      for (var s = top + 8; s < 70; s += 10) { fill(g, x - 1, s, 6, 1, '#2e5a1c'); fill(g, x, s + 1, 4, 1, '#94c862'); }
      ppoly(g, [[x + 3, top + 4], [x + 13, top + 1], [x + 4, top + 7]], '#6aa848'); ppoly(g, [[x, top + 12], [x - 9, top + 8], [x, top + 15]], '#5a9a3e');
    }
    PIX.outline(c, '#1e3a12');
    return c;
  }

  // ================= 建物・置物 =================
  // 返す絵は、物の足もと（マスの左上）を (ox, oy) に合わせて描く。UP は上にはみ出す高さ
  var decoCache = {};
  var UP = { field: 2, barrel: 6, pots: 4, firewood: 4, bench: 2, board: 18, cart: 8, laundry: 22, house: 26, inn: 30, bighouse: 34, shrine: 34, shrine_small: 22, torii: 46, stall: 30, lantern: 18, well: 14, dummy: 16, easel: 14, cave: 22, fox: 14, stump: 2, dojo: 32, forge: 40, kura: 30, post: 22, crates: 4, ship: 50, hut: 22, boat: 2, gate: 46, banner: 34, brazier: 6, bell: 50, stair_down: 2, stone_marker: 14, mon: 52, lighthouse: 62, net: 20 };
  var fontOk = function () { try { return !document.fonts || document.fonts.check('12px "DotGothic16"'); } catch (e) { return true; } };
  DW.decoSprite = function (d) {
    var label = d.label || '', k = d.kind + '|' + (d.w || 1) + 'x' + (d.h || 1) + '|' + (d.v || '') + '|' + label;
    var e = decoCache[k];
    if (e && (e.font || !e.text)) return e;
    var w = (d.w || 1) * T, h = (d.h || 1) * T, up = UP[d.kind] || 16, side = 8;
    var c = mk(w + side * 2, h + up + 2), g = c.getContext('2d');
    g.translate(side, up);
    var fn = DECO[d.kind];
    var used = { text: false };
    if (fn) fn(g, w, h, d, used); else fill(g, 2, 2, w - 4, h - 4, '#a07a50');
    g.setTransform(1, 0, 0, 1, 0, 0);
    PIX.harden(c);
    PIX.outline(c, OUT);
    e = decoCache[k] = { cv: c, ox: side, oy: up, w: c.width, h: c.height, text: used.text, font: fontOk() };
    return e;
  };
  // 看板などの字（ドットの字体があればそれで）
  function label(g, s, x, y, size, col, used) {
    if (!s) return;
    used.text = true;
    g.save(); g.font = size + 'px "DotGothic16","BIZ UDPGothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(s, Math.round(x), Math.round(y)); g.restore();
  }
  var ROOF = {
    gray: ['#262c3a', '#3a4254', '#525c72', '#707c94'], brown: ['#38261c', '#523828', '#6e4e36', '#8e6a4a'], navy: ['#1e2436', '#2e3650', '#424c6c', '#5c6888'],
    green: ['#173c38', '#245650', '#357266', '#4e9080'], thatch: ['#5a4426', '#7a5e34', '#9c7c48', '#bc9c62'], black: ['#1a1a20', '#2a2a32', '#3c3c46', '#54545e']
  };
  var WALL = ['#a8987a', '#d6c8a8', '#ece2c8'], WOOD = ['#3a2416', '#5a3a24', '#7a5436', '#9a7048'];
  // 屋根（瓦の段）。x0..x1 の幅、y0（棟）..y1（軒）
  function roof(g, x0, x1, y0, y1, R, o) {
    o = o || {};
    ppoly(g, [[x0 + 3, y0], [x1 - 3, y0], [x1, y1], [x0, y1]], R[1]);
    if (o.thatch) {
      for (var x = x0; x < x1; x++) for (var y = y0 + 2; y < y1 - 2; y++) { var h = hash(x, y, 77); if ((x + Math.floor(y / 3)) % 3 === 0) dot(g, x, y, h < 0.5 ? R[0] : R[1]); else if (h > 0.8) dot(g, x, y, R[2]); }
      fill(g, x0 + 2, y0, x1 - x0 - 4, 3, R[2]);
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
    if (o.lightLeft !== false) for (var j = y0 + 2; j < y1 - 3; j++) dot(g, x0 + 3 - Math.round((j - y0) * 3 / (y1 - y0)), j, R[3]);
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
  function shadowBase(g, w, h) { for (var x = 2; x < w - 2; x++) for (var y = h - 2; y < h + 2; y++) if (bayer(x, y) < 0.5) dot(g, x, y, '#10180c'); }
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
      for (var y = h - 14; y < h; y++) for (var x = 3; x < w - 3; x++) dot(g, x, y, ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0) ? '#f4f0e6' : '#3a3a42');
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
      for (var sx = -3; sx < w + 3; sx++) for (var sy = -24; sy < -10; sy++) dot(g, sx, sy, (Math.floor((sx + 3) / 6) % 2) ? col[2] : col[1]);
      fill(g, -3, -24, w + 6, 1, col[0]); for (var k = -3; k < w + 3; k += 6) { fill(g, k, -10, 6, 2, col[1]); dot(g, k + 2, -8, col[0]); }
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
      for (var y = -42; y < 14; y++) { var half = 26 - Math.abs(y + 14) * 0.15; fill(g, w / 2 + 3, y, Math.round(half), 1, (y % 6 === 0) ? '#d8ccb4' : '#f4ecd8'); fill(g, w / 2 - Math.round(half) - 2, y, Math.round(half), 1, (y % 6 === 0) ? '#d8ccb4' : '#f4ecd8'); }
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
      for (var x = 4; x < w - 4; x++) { var sag = Math.round(Math.sin((x / (w - 8)) * Math.PI * 2) * 2); for (var y = -14; y < 14 + sag; y++) dot(g, x, y, ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) ? '#3e4e4c' : '#6e7e74'); }
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

  // ================= ドットの小物（地図の上） =================
  var smallCache = {};
  function small(key, w, h, fn) {
    if (smallCache[key]) return smallCache[key];
    var c = mk(w, h), g = c.getContext('2d'); fn(g); PIX.harden(c); PIX.outline(c, OUT);
    smallCache[key] = c; return c;
  }
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
  var GLYPH = {
    '！': ['..#..', '..#..', '..#..', '..#..', '.....', '..#..'], '?': ['.###.', '#...#', '...#.', '..#..', '.....', '..#..'],
    '…': ['.....', '.....', '.....', '.....', '.....', '#.#.#'], '♪': ['..##.', '..#.#', '..#..', '###..', '###..', '.....'], 'z': ['####.', '...#.', '..#..', '.#...', '####.', '.....'], '★': ['..#..', '.###.', '#####', '.###.', '##.##', '.....']
  };
  GLYPH['？'] = GLYPH['?']; GLYPH['!'] = GLYPH['！'];
  DW.bubbleSprite = function (ch, col) {
    var gl = GLYPH[ch] || GLYPH['！'];
    return small('bub' + ch + (col || ''), 17, 17, function (g) {
      fill(g, 1, 1, 15, 12, '#fffaf0'); fill(g, 2, 0, 13, 1, '#fffaf0'); fill(g, 2, 13, 13, 1, '#fffaf0'); fill(g, 6, 14, 3, 1, '#fffaf0'); dot(g, 7, 15, '#fffaf0');
      gl.forEach(function (row, y) { for (var x = 0; x < row.length; x++) if (row[x] === '#') dot(g, 6 + x, 4 + y, col || (ch === '！' || ch === '!' ? '#c83a2a' : '#3a2a22')); });
    });
  };

  // ================= なめらかな図形（戦闘の光・数字などで使う） =================
  function circle(c, x, y, r, fillc, stroke, lw) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); if (fillc) { c.fillStyle = fillc; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function ell(c, x, y, rx, ry, fillc, stroke, lw) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); if (fillc) { c.fillStyle = fillc; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function poly(c, pts, fillc, stroke, lw) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); if (fillc) { c.fillStyle = fillc; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.lineJoin = 'round'; c.stroke(); } }
  function rrect(c, x, y, w, h, r, fillc, stroke, lw) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (fillc) { c.fillStyle = fillc; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); } }
  function text(c, s, x, y, size, fillc) { c.font = size + 'px "DotGothic16","Hiragino Maru Gothic ProN","Yu Gothic",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = fillc; c.fillText(s, x, y); }
  function mix(a, b, t) { var A = rgbA(a), B = rgbA(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }

  DW.T = T; DW.OUT = OUT; DW.mk = mk; DW.circle = circle; DW.ell = ell; DW.poly = poly; DW.rrect = rrect; DW.text = text; DW.mix = mix; DW.rnd = PIX.rnd;
  root.NYT_DRAW = DW;
})(typeof window !== 'undefined' ? window : globalThis);
