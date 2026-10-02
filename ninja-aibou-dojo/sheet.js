/* ニンジャ相棒道場 — キャラクターシート（1枚のSVG）
 * 原型版（既定・1536×1860）：
 *   上：原型＝公式イラスト（CC0）を大きく。顔のアップ・色・見た目のポイント・公式の紹介を添える
 *   下：ゲームの中の姿（原型をもとに簡略化して描いた絵）：三面図（まえ／ななめ／よこ／うしろ）・あるく・修行のうごき6種
 * かっこいい版（style: 'cool'・1536×1680）：
 *   上：黒い帯に名前（筆文字）とクランの印。三面図（まえ／ななめ／よこ／うしろ）＋ 右端に色見本
 *   中左：表情（ふつう・うれしい・びっくり・しんけん）の顔のアップ
 *   中右：うごき・擬態（あるく・かくれる（擬態））
 *   下：修行のうごき（こうげき・きゅうじょ・しらべる・さがる・へとへと・わーい）
 *   いちばん下：CryptoNinja ファンゲーム制作資料
 * かわいい版（style: 'cute'。1536×1410）は、見本（狐白｜キャラクターシート・ゲーム用アレンジ案）と同じ並び。
 * 描画は art.js（NinjaArt）。ブラウザでも Node でも動く。ninja-sato-life/sheet.js をもとにした。
 */
(function (root) {
  'use strict';
  var A = root.NinjaArt || (typeof require !== 'undefined' ? require('./art.js') : null);
  var U = A.util;
  var INK = '#3b2a20', PAPER = '#f7f1e5';
  var FONT = "'Zen Maru Gothic','Hiragino Maru Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif";
  var W = 1536, H = 1410;
  var seq = 0;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function T(x, y, s, size, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + (o.col || INK) + '" font-family="' + FONT + '" font-weight="' + (o.w || 700) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.ls ? ' letter-spacing="' + o.ls + '"' : '') + '>' + esc(s) + '</text>';
  }
  // キャラ1体を (x,y,w,h) の枠に置く
  function fig(def, x, y, w, h, opt) {
    var inner = A.render(def, Object.assign({ raw: true, style: 'cute' }, opt || {}));
    return '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" viewBox="' + (opt && opt.vb || '0 0 200 240') + '" overflow="visible">' + inner + '</svg>';
  }
  // 絵の具のにじんだような色見本
  function blob(cx, cy, r, col, seed) {
    var pts = [], n = 18;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2, rr = r * (0.9 + 0.12 * Math.sin(seed * 3.1 + i * 2.3) + 0.06 * Math.cos(seed + i * 5.7));
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.92 });
    }
    return U.sp(U.smoothD(pts, true, 0.9), col, { w: 1.2, sc: U.mix(col, '#3b2a20', 0.35) }) +
      U.sf(U.ellD(cx - r * 0.3, cy - r * 0.3, r * 0.35, r * 0.22), '#ffffff', { op: 0.25 });
  }
  function speedLines(x, y) {
    return '<g stroke="' + INK + '" stroke-width="4" stroke-linecap="round" opacity=".75"><path d="M' + x + ' ' + y + 'h46"/><path d="M' + (x + 14) + ' ' + (y + 16) + 'h30"/><path d="M' + (x - 6) + ' ' + (y + 32) + 'h40"/></g>';
  }
  function dust(x, y) {
    var o = '';
    [[0, 0, 11], [-20, 6, 8], [-36, 12, 6], [-10, 16, 5]].forEach(function (d) { o += U.sp(U.ellD(x + d[0], y + d[1], d[2], d[2] * 0.85), '#cfc6b6', { w: 2, sc: '#a89c88' }); });
    return o;
  }
  function grass(x, y, n, sc) {
    var o = '';
    for (var i = 0; i < n; i++) {
      var gx = x + i * 16 + (i % 3) * 3, h = 16 + (i * 7) % 12;
      o += '<path d="M' + gx + ' ' + y + 'q' + (-3 * sc) + ' ' + (-h * 0.6) + ' ' + (-8 * sc) + ' ' + (-h) + 'M' + (gx + 4) + ' ' + y + 'q1 ' + (-h * 0.7) + ' 3 ' + (-h - 4) + 'M' + (gx + 8) + ' ' + y + 'q4 ' + (-h * 0.5) + ' 10 ' + (-h + 2) + '" stroke="#5b8a3a" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
    }
    return o;
  }
  // 竹柄の布（擬態）
  function bambooCloth(x, y, w, h, uid) {
    var o = '<defs><clipPath id="' + uid + 'cl"><path d="M' + x + ' ' + y + 'h' + w + 'l-4 ' + h + 'q-' + (w / 2) + ' 10 -' + (w - 8) + ' 0Z"/></clipPath></defs>';
    o += '<g clip-path="url(#' + uid + 'cl)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h + 12) + '" fill="#b9c79a"/>';
    for (var i = 0; i < 6; i++) {
      var bx = x + 10 + i * (w - 20) / 5;
      o += '<rect x="' + (bx - 7) + '" y="' + y + '" width="14" height="' + (h + 12) + '" fill="#8fa86a"/>';
      for (var j = 1; j < 6; j++) { var ny = y + j * h / 6 + (i % 2) * 14; o += '<path d="M' + (bx - 8) + ' ' + ny + 'h16" stroke="#6f8a4c" stroke-width="3"/>'; }
      o += '<path d="M' + (bx + 7) + ' ' + (y + 40 + i * 9) + 'q12 -6 18 4q-10 2 -18 -4Z" fill="#7a9a54"/>';
    }
    o += '</g>';
    o += '<path d="M' + x + ' ' + y + 'h' + w + 'l-4 ' + h + 'q-' + (w / 2) + ' 10 -' + (w - 8) + ' 0Z" fill="none" stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round"/>';
    return o;
  }
  function frame(x, y, w, h) {
    var col = '#c9a46a', dk = '#8a6a3a';
    return '<g stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round">' +
      '<rect x="' + (x - 8) + '" y="' + (y - 14) + '" width="12" height="' + (h + 16) + '" rx="3" fill="' + col + '"/>' +
      '<rect x="' + (x + w - 4) + '" y="' + (y - 14) + '" width="12" height="' + (h + 16) + '" rx="3" fill="' + col + '"/>' +
      '<rect x="' + (x - 22) + '" y="' + (y - 20) + '" width="' + (w + 44) + '" height="12" rx="4" fill="' + col + '"/>' +
      '</g><path d="M' + (x - 8) + ' ' + (y + h * 0.55) + 'l-26 ' + (h * 0.45) + 'M' + (x + w + 8) + ' ' + (y + h * 0.55) + 'l26 ' + (h * 0.45) + '" stroke="' + dk + '" stroke-width="7" stroke-linecap="round"/>';
  }
  // 修行のうごきの小道具
  function dummy(x, y) { // からくり木人（的）
    var o = '<g stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round">';
    o += '<rect x="' + (x - 6) + '" y="' + (y - 20) + '" width="12" height="30" fill="#9a6a3a"/>';
    o += '<rect x="' + (x - 20) + '" y="' + (y - 78) + '" width="40" height="62" rx="10" fill="#c99a5e"/>';
    o += '<circle cx="' + x + '" cy="' + (y - 96) + '" r="20" fill="#d9ad72"/>';
    o += '<path d="M' + (x - 34) + ' ' + (y - 62) + 'h68" stroke-width="8" stroke="#8a5a30"/></g>';
    o += '<circle cx="' + (x - 7) + '" cy="' + (y - 98) + '" r="3" fill="' + U.OUT + '"/><circle cx="' + (x + 7) + '" cy="' + (y - 98) + '" r="3" fill="' + U.OUT + '"/>';
    o += '<path d="M' + (x - 8) + ' ' + (y - 50) + 'l16 0M' + x + ' ' + (y - 58) + 'l0 16" stroke="#c8452c" stroke-width="3"/>';
    return o;
  }
  function chest(x, y) { // 宝箱
    return '<g stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round"><rect x="' + (x - 30) + '" y="' + (y - 36) + '" width="60" height="36" rx="4" fill="#b8763a"/>' +
      '<path d="M' + (x - 30) + ' ' + (y - 36) + 'q30 -26 60 0Z" fill="#c98a4a"/><rect x="' + (x - 6) + '" y="' + (y - 30) + '" width="12" height="14" fill="#e8c56b"/></g>' +
      '<path d="M' + (x - 30) + ' ' + (y - 22) + 'h60" stroke="#8a5428" stroke-width="3"/>';
  }
  function makibishi(x, y) { // まきびし（危ない床）
    var o = '<ellipse cx="' + x + '" cy="' + y + '" rx="46" ry="12" fill="#d8c8e8" opacity=".7"/>';
    [[-26, -2], [-6, 4], [16, -3], [32, 3], [4, -8]].forEach(function (d) { o += '<path d="M' + (x + d[0]) + ' ' + (y + d[1] - 8) + 'l5 8l-10 0Z" fill="#6a6a74" stroke="' + U.OUT + '" stroke-width="1.6" stroke-linejoin="round"/>'; });
    return o;
  }

  // ch: { name, num, en, clan, jutsu, weapon, birthday, palette, art }（公式39体）
  //     相棒のときは { name, info, palette, art, partner: true }
  function sheetSvgCute(ch, opt) {
    opt = opt || {};
    var uid = 'sh' + (++seq);
    var def = ch.art;
    var o = '';
    o += '<rect width="' + W + '" height="' + H + '" fill="' + PAPER + '"/>';
    o += '<filter id="' + uid + 'n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="' + (parseInt(ch.num, 10) || 7) + '"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .28  0 0 0 0 .2  0 0 0 .07 0"/></filter>';
    o += '<rect width="' + W + '" height="' + H + '" filter="url(#' + uid + 'n)"/>';
    // 見出し
    o += T(44, 94, ch.name, 64, { w: 900 });
    var nameW = Math.max(1, ch.name.length) * 64 + 10;
    o += '<path d="M' + (44 + nameW + 14) + ' 44v58" stroke="' + INK + '" stroke-width="3.5"/>';
    o += T(44 + nameW + 40, 92, 'キャラクターシート', 56, { w: 900, ls: 2 });
    o += '<path d="M40 116H' + (44 + nameW + 40 + 540) + '" stroke="' + INK + '" stroke-width="3"/>';
    o += T(48, 152, ch.partner ? '相棒（ゲーム独自）' : 'ゲーム用アレンジ案', 26, { w: 700 });
    var info = ch.partner ? (ch.info || '') : ('#' + ch.num + ' ' + ch.en + '　' + ch.clan + '　忍術：' + ch.jutsu + '　武器：' + ch.weapon + '　誕生日：' + ch.birthday);
    o += T(ch.partner ? 290 : 300, 152, info, 21, { w: 500, col: '#6a5a48' });
    o += T(1500, 70, 'ニンジャ相棒道場', 22, { anchor: 'end', w: 700, col: '#8a6a3a', ls: 2 });
    // 上段：4方向
    var views = [['まえ', 0], ['ななめ', -38], ['よこ', -90], ['うしろ', 180]];
    var fw = 300, fh = 360, top = 158;
    views.forEach(function (v, i) {
      var x = 30 + i * 352;
      o += fig(def, x, top, fw, fh, { yaw: v[1], pose: 'stand' });
      o += T(x + fw / 2, 568, v[0], 30, { anchor: 'middle', w: 700 });
    });
    // 色見本
    (ch.palette || []).slice(0, 7).forEach(function (col, i) { o += blob(1468, 192 + i * 56, 23, col, i + 1); });
    // 区切り
    o += '<path d="M36 596H1500" stroke="' + INK + '" stroke-width="2.5"/>';
    o += '<path d="M868 612V958" stroke="' + INK + '" stroke-width="2.5"/>';
    o += T(44, 650, 'しぐさ', 38, { w: 900 });
    o += T(890, 650, 'うごき・擬態', 38, { w: 900 });
    // しぐさ
    var ex = [['ふつう', 'stand', -8, null], ['うれしい', 'happy', -14, 'joy'], ['びっくり', 'surprised', 0, 'surprise'], ['しんけん', 'serious', 0, 'focus']];
    ex.forEach(function (e, i) {
      var x = 26 + i * 208;
      o += fig(def, x, 656, 214, 257, { yaw: e[2], pose: e[1], fx: e[3], prop: false, companions: e[1] === 'stand' });
      o += T(x + 107, 948, e[0], 28, { anchor: 'middle', w: 700 });
    });
    // あるく
    o += speedLines(904, 790);
    o += dust(1006, 900);
    o += fig(def, 960, 656, 214, 257, { yaw: 52, pose: 'walk', frame: 1, prop: false, companions: false });
    o += T(1070, 948, 'あるく', 28, { anchor: 'middle', w: 700 });
    // かくれる（擬態）
    var cx = 1262, cy = 690, cw = 210, chh = 222;
    o += frame(cx, cy, cw, chh);
    o += fig(def, 1168, 662, 200, 240, { yaw: -24, pose: 'surprised', expr: 'surprised', prop: false, companions: false, shadow: false });
    o += bambooCloth(cx, cy, cw, chh, uid);
    o += grass(1180, 918, 5, 1) + grass(1418, 918, 5, 1);
    o += '<g stroke="#f08c1c" stroke-width="4" stroke-linecap="round"><path d="M1192 742l-12 -8M1188 756l-14 2M1196 730l-6 -12"/></g>';
    o += T(1366, 948, 'かくれる（擬態）', 28, { anchor: 'middle', w: 700 });
    // 修行のうごき（このゲーム用）
    o += '<path d="M36 972H1500" stroke="' + INK + '" stroke-width="2.5"/>';
    o += T(44, 1026, '修行のうごき', 38, { w: 900 });
    o += T(300, 1024, '相棒道場で使う6つの動き（相棒・見習い・里の忍者に共通）', 20, { w: 500, col: '#6a5a48' });
    var acts = [
      ['こうげき', 'attack', -70, 'swing', 'serious', 1],
      ['きゅうじょ', 'rescue', -60, 'care', 'normal', null],
      ['しらべる', 'search', -60, 'search', 'normal', null],
      ['さがる', 'retreat', 60, 'dash', 'surprised', null],
      ['へとへと', 'down', -30, 'dizzy', 'tired', null],
      ['わーい', 'cheer', 0, 'cheer', 'happy', null]
    ];
    acts.forEach(function (a, i) {
      var x = 28 + i * 246;
      if (a[1] === 'attack') o += dummy(x + 30, 1300);
      if (a[1] === 'search') o += chest(x + 196, 1300);
      if (a[1] === 'retreat') o += makibishi(x + 186, 1300);
      o += fig(def, x + (a[1] === 'attack' ? 20 : 0), 1034, 214, 257, { yaw: a[2], pose: a[1], fx: a[3], expr: a[4], frame: a[5], prop: false, companions: false });
      o += T(x + 107 + (a[1] === 'attack' ? 20 : 0), 1330, a[0], 28, { anchor: 'middle', w: 700 });
    });
    // フッター
    o += '<path d="M36 1350H1500" stroke="' + INK + '" stroke-width="2"/>';
    o += T(768, 1386, 'CryptoNinja ファンゲーム制作資料', 22, { anchor: 'middle', w: 500, ls: 2 });
    o += T(1500, 1386, ch.partner ? '相棒はこのゲーム独自のキャラクター（公式ではありません）' : '非公式・キャラクターは CC0（Ninja DAO）', 15, { anchor: 'end', w: 500, col: '#8a7a66' });
    var font = opt.fontFace || '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + (opt.w || W) + '" height="' + (opt.h || H) + '">' + (font ? '<style>' + font + '</style>' : '') + o + '</svg>';
  }

  /* ================= かっこいい版 ================= */
  var CW = 1536, CH = 1680;
  var SUMI = '#141418', SHU = '#c8302c', KIN = '#c9a46a', GRAY = '#4a4850', PAPER2 = '#eeebe5';
  var FONT_B = "'Yuji Boku','Yuji Syuku','Hiragino Mincho ProN','Yu Mincho',serif";
  var FONT_G = "'Zen Kaku Gothic New','Hiragino Sans','Yu Gothic','Meiryo',sans-serif";
  function TG(x, y, s, size, o) { // 角ゴシック
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + (o.col || SUMI) + '" font-family="' + (o.font || FONT_G) + '" font-weight="' + (o.w || 700) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.ls ? ' letter-spacing="' + o.ls + '"' : '') + '>' + esc(s) + '</text>';
  }
  function figC(def, x, y, w, h, vb, opt) {
    var inner = A.render(def, Object.assign({ raw: true, style: 'cool' }, opt || {}));
    return '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" viewBox="' + vb + '">' + inner + '</svg>';
  }
  // 見出し：朱の四角＋太字
  function secTitle(x, y, s, sub) {
    return '<rect x="' + x + '" y="' + (y - 26) + '" width="10" height="28" fill="' + SHU + '"/>' + TG(x + 22, y, s, 32, { w: 900, ls: 2 }) + (sub ? TG(x + 22 + s.length * 34 + 24, y - 2, sub, 18, { w: 500, col: '#6a6670' }) : '');
  }
  // 筆で描いた円（円相）
  function enso(cx, cy, r, col, seed) {
    var o = '', n = 64;
    var pts = [], ws = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, a = -Math.PI * 0.62 + t * Math.PI * 1.86;
      var rr = r * (1 + 0.02 * Math.sin(seed + t * 9));
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
      ws.push(34 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) + 2);
    }
    // 筆の太さ：点列から幅つきの形を作る
    var L = [], R = [];
    for (i = 0; i <= n; i++) {
      var a0 = pts[Math.max(0, i - 1)], b0 = pts[Math.min(n, i + 1)], dx = b0.x - a0.x, dy = b0.y - a0.y, l = Math.hypot(dx, dy) || 1;
      L.push({ x: pts[i].x - dy / l * ws[i] / 2, y: pts[i].y + dx / l * ws[i] / 2 }); R.push({ x: pts[i].x + dy / l * ws[i] / 2, y: pts[i].y - dx / l * ws[i] / 2 });
    }
    o += '<path d="' + U.smoothD(L.concat(R.reverse()), true, 0.8) + '" fill="' + col + '"/>';
    return o;
  }
  // クランの印（朱の角印・縦書き）
  function seal(x, y, sz, text) {
    var chars = String(text || '').replace(/\s/g, '').split('').slice(0, 3), n = chars.length || 1;
    var o = '<rect x="' + x + '" y="' + y + '" width="' + sz + '" height="' + sz + '" rx="8" fill="' + SHU + '"/>';
    o += '<rect x="' + (x + 5) + '" y="' + (y + 5) + '" width="' + (sz - 10) + '" height="' + (sz - 10) + '" rx="5" fill="none" stroke="#f6e9e2" stroke-width="2" opacity=".85"/>';
    var fs = n === 1 ? sz * 0.56 : n === 2 ? sz * 0.36 : sz * 0.26;
    chars.forEach(function (c, i) { o += '<text x="' + (x + sz / 2) + '" y="' + (y + sz / 2 + (i - (n - 1) / 2) * fs * 1.02 + fs * 0.36) + '" font-size="' + fs + '" fill="#fbf3ee" text-anchor="middle" font-family="' + FONT_B + '">' + esc(c) + '</text>'; });
    return o;
  }
  function swatch(x, y, col) {
    return '<rect x="' + x + '" y="' + y + '" width="46" height="46" rx="6" fill="' + col + '" stroke="' + SUMI + '" stroke-width="2"/>' +
      '<path d="M' + (x + 4) + ' ' + (y + 40) + 'L' + (x + 40) + ' ' + (y + 4) + '" stroke="#ffffff" stroke-width="3" opacity=".12"/>';
  }
  function speedLinesC(x, y) {
    return '<g stroke="' + GRAY + '" stroke-width="4" stroke-linecap="round" opacity=".7"><path d="M' + x + ' ' + y + 'h54"/><path d="M' + (x + 16) + ' ' + (y + 20) + 'h38"/><path d="M' + (x - 8) + ' ' + (y + 40) + 'h46"/></g>';
  }
  function dustC(x, y) {
    var o = '';
    [[0, 0, 10], [-18, 5, 7], [-32, 10, 5]].forEach(function (d) { o += U.sp(U.ellD(x + d[0], y + d[1], d[2], d[2] * 0.8), '#d6d0c6', { w: 2, sc: '#a8a094' }); });
    return o;
  }
  // 竹柄の布と木の枠（擬態）
  function bambooC(x, y, w, h, uid) {
    var o = '<defs><clipPath id="' + uid + 'bc"><path d="M' + x + ' ' + y + 'h' + w + 'l-5 ' + h + 'q-' + (w / 2) + ' 12 -' + (w - 10) + ' 0Z"/></clipPath></defs>';
    o += '<g clip-path="url(#' + uid + 'bc)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h + 14) + '" fill="#aebf8e"/>';
    for (var i = 0; i < 6; i++) {
      var bx = x + 12 + i * (w - 24) / 5;
      o += '<rect x="' + (bx - 8) + '" y="' + y + '" width="16" height="' + (h + 14) + '" fill="#86a062"/>';
      for (var j = 1; j < 7; j++) { var ny = y + j * h / 7 + (i % 2) * 16; o += '<path d="M' + (bx - 9) + ' ' + ny + 'h18" stroke="#667f44" stroke-width="3"/>'; }
      o += '<path d="M' + (bx + 8) + ' ' + (y + 50 + i * 13) + 'q14 -7 21 5q-12 2 -21 -5Z" fill="#6f8f4a"/>';
    }
    o += '</g>';
    o += '<path d="M' + x + ' ' + y + 'h' + w + 'l-5 ' + h + 'q-' + (w / 2) + ' 12 -' + (w - 10) + ' 0Z" fill="none" stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round"/>';
    return o;
  }
  function frameC(x, y, w, h) {
    var col = '#b9925a';
    return '<g stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round">' +
      '<rect x="' + (x - 9) + '" y="' + (y - 16) + '" width="12" height="' + (h + 18) + '" rx="3" fill="' + col + '"/>' +
      '<rect x="' + (x + w - 3) + '" y="' + (y - 16) + '" width="12" height="' + (h + 18) + '" rx="3" fill="' + col + '"/>' +
      '<rect x="' + (x - 24) + '" y="' + (y - 22) + '" width="' + (w + 48) + '" height="12" rx="4" fill="' + col + '"/></g>';
  }
  function grassC(x, y, n) {
    var o = '';
    for (var i = 0; i < n; i++) {
      var gx = x + i * 15 + (i % 3) * 3, h = 16 + (i * 7) % 12;
      o += '<path d="M' + gx + ' ' + y + 'q-3 ' + (-h * 0.6) + ' -8 ' + (-h) + 'M' + (gx + 4) + ' ' + y + 'q1 ' + (-h * 0.7) + ' 3 ' + (-h - 4) + 'M' + (gx + 8) + ' ' + y + 'q4 ' + (-h * 0.5) + ' 10 ' + (-h + 2) + '" stroke="#5b8a3a" stroke-width="3.2" fill="none" stroke-linecap="round"/>';
    }
    return o;
  }
  // 修行のうごきの小道具（背の高い体に合わせた大きさ）
  function dummyC(x, y) { // 木人（打ちこみ台）
    var o = '<g stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round">';
    o += '<rect x="' + (x - 26) + '" y="' + (y - 12) + '" width="52" height="12" rx="3" fill="#7a5230"/>';
    o += '<rect x="' + (x - 13) + '" y="' + (y - 196) + '" width="26" height="186" rx="11" fill="#b98a55"/>';
    o += '<circle cx="' + x + '" cy="' + (y - 212) + '" r="19" fill="#c99a62"/>';
    o += '<path d="M' + (x - 13) + ' ' + (y - 150) + 'l-26 -8M' + (x + 13) + ' ' + (y - 150) + 'l26 -8M' + (x - 13) + ' ' + (y - 104) + 'l-22 6" stroke-width="9" stroke="#8a5a30" stroke-linecap="round"/></g>';
    o += '<path d="M' + (x - 8) + ' ' + (y - 130) + 'l16 0M' + x + ' ' + (y - 138) + 'l0 16" stroke="' + SHU + '" stroke-width="3.4"/>';
    o += '<path d="M' + (x - 9) + ' ' + (y - 60) + 'h18M' + (x - 9) + ' ' + (y - 40) + 'h18" stroke="#8a5a30" stroke-width="2.4"/>';
    return o;
  }
  function chestC(x, y) {
    return '<g stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round"><rect x="' + (x - 30) + '" y="' + (y - 34) + '" width="60" height="34" rx="4" fill="#9a5f2e"/>' +
      '<path d="M' + (x - 30) + ' ' + (y - 34) + 'q30 -24 60 0Z" fill="#b57236"/><rect x="' + (x - 6) + '" y="' + (y - 28) + '" width="12" height="13" fill="#e2bd62"/></g>' +
      '<path d="M' + (x - 30) + ' ' + (y - 20) + 'h60" stroke="#6e4220" stroke-width="3"/>';
  }
  function makibishiC(x, y) {
    var o = '<ellipse cx="' + x + '" cy="' + y + '" rx="48" ry="11" fill="#cfc5d8" opacity=".8"/>';
    [[-28, -1], [-8, 4], [14, -3], [32, 3], [2, -7]].forEach(function (d) { o += '<path d="M' + (x + d[0]) + ' ' + (y + d[1] - 8) + 'l5 8l-10 0Z" fill="#5a5a64" stroke="' + U.OUT + '" stroke-width="1.6" stroke-linejoin="round"/>'; });
    return o;
  }

  function sheetSvgCool(ch, opt) {
    opt = opt || {};
    var uid = 'sc' + (++seq), def = ch.art, o = '';
    var vbFull = function (w, h) { var vw = 224 * w / h; return (100 - vw / 2).toFixed(1) + ' 16 ' + vw.toFixed(1) + ' 224'; };
    o += '<rect width="' + CW + '" height="' + CH + '" fill="' + PAPER2 + '"/>';
    o += '<filter id="' + uid + 'n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="' + (parseInt(ch.num, 10) || 7) + '"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .2  0 0 0 0 .22  0 0 0 .06 0"/></filter>';
    o += '<rect width="' + CW + '" height="' + CH + '" filter="url(#' + uid + 'n)"/>';
    // ---- 黒い帯の見出し
    o += '<rect width="' + CW + '" height="128" fill="' + SUMI + '"/><rect y="128" width="' + CW + '" height="5" fill="' + SHU + '"/>';
    o += '<rect x="36" y="26" width="9" height="76" fill="' + SHU + '"/>';
    var nm = ch.name, nsz = nm.length > 4 ? 66 : 80;
    o += '<text x="64" y="' + (nm.length > 4 ? 94 : 100) + '" font-size="' + nsz + '" fill="#f7f3ec" font-family="' + FONT_B + '">' + esc(nm) + '</text>';
    var nameW = nm.length * nsz * 1.0 + 8;
    o += '<path d="M' + (64 + nameW + 18) + ' 40v58" stroke="#8a8690" stroke-width="2.5"/>';
    o += TG(64 + nameW + 42, 88, 'キャラクターシート', 36, { w: 900, col: '#ece7de', ls: 5 });
    o += TG(64 + nameW + 44, 114, 'CHARACTER SHEET', 13, { w: 700, col: '#8a8690', ls: 6 });
    o += TG(CW - 150, 62, 'ニンジャ相棒道場', 20, { anchor: 'end', w: 700, col: KIN, ls: 3 });
    o += TG(CW - 150, 92, ch.partner ? 'ゲーム独自の相棒' : 'CryptoNinja 39', 14, { anchor: 'end', w: 700, col: '#8a8690', ls: 3 });
    o += seal(CW - 128, 22, 86, ch.partner ? '相棒' : ch.clan);
    // ---- 情報の行
    var tag = ch.partner ? '相棒（ゲーム独自）' : 'ゲーム用アレンジ案', tagW = tag.length * 20 + 28;
    o += '<rect x="40" y="152" width="' + tagW + '" height="34" rx="3" fill="' + SUMI + '"/>' + TG(40 + tagW / 2, 176, tag, 20, { anchor: 'middle', w: 700, col: '#f4f0e8' });
    var info = ch.partner ? (ch.info || '') : ('#' + ch.num + ' ' + ch.en + '　／　' + ch.clan + '　／　忍術：' + ch.jutsu + '　／　武器：' + ch.weapon + '　／　誕生日：' + ch.birthday);
    o += TG(40 + tagW + 20, 176, info, 20, { w: 500, col: '#3a3840' });
    // ---- 三面図
    var views = [['まえ', 0], ['ななめ', -38], ['よこ', -90], ['うしろ', 180]];
    var fw = 350, fh = 455, top = 206;
    o += enso(24 + fw / 2, top + 190, 176, '#dcd6cc', parseInt(ch.num, 10) || 3);
    views.forEach(function (v, i) {
      var x = 24 + i * fw;
      o += figC(def, x, top, fw, fh, vbFull(fw, fh), { yaw: v[1], pose: 'stand' });
      o += TG(x + fw / 2, top + fh + 34, v[0], 26, { anchor: 'middle', w: 700, ls: 4 });
      o += '<rect x="' + (x + fw / 2 - 18) + '" y="' + (top + fh + 44) + '" width="36" height="3" fill="' + SHU + '"/>';
    });
    // 色見本
    o += TG(1492, 222, '色', 20, { anchor: 'middle', w: 900, col: GRAY });
    (ch.palette || []).slice(0, 8).forEach(function (col, i) { o += swatch(1469, 236 + i * 56, col); });
    o += '<path d="M36 ' + (top + fh + 70) + 'H1500" stroke="' + SUMI + '" stroke-width="2.5"/>';
    // ---- 表情（顔のアップ）
    var y2 = top + fh + 118;
    o += secTitle(40, y2, '表情');
    var faces = [['ふつう', 'normal', -12], ['うれしい', 'happy', -22], ['びっくり', 'surprised', 0], ['しんけん', 'serious', 16]];
    var fbox = A.faceBox(def, { size: 56, up: 0.55, style: 'cool' });
    faces.forEach(function (f, i) {
      var x = 40 + i * 206, y = y2 + 22;
      o += '<rect x="' + x + '" y="' + y + '" width="188" height="188" rx="4" fill="#f8f6f2" stroke="' + SUMI + '" stroke-width="2.5"/>';
      o += '<svg x="' + (x + 2) + '" y="' + (y + 2) + '" width="184" height="184" viewBox="' + fbox + '">' + A.render(def, { raw: true, style: 'cool', yaw: f[2], pose: 'stand', expr: f[1], shadow: false, prop: false, companions: false }) + '</svg>';
      o += TG(x + 94, y + 222, f[0], 24, { anchor: 'middle', w: 700, ls: 2 });
    });
    // ---- うごき・擬態
    o += '<path d="M872 ' + (y2 - 30) + 'V' + (y2 + 312) + '" stroke="' + SUMI + '" stroke-width="2.5"/>';
    o += secTitle(900, y2, 'うごき・擬態');
    var mw = 220, mh = 286, my = y2 + 6;
    o += speedLinesC(906, my + 120) + dustC(1000, my + mh - 16);
    o += figC(def, 928, my, mw, mh, vbFull(mw, mh), { yaw: 52, pose: 'walk', frame: 1, prop: false, companions: false });
    o += TG(928 + mw / 2, y2 + 312, 'あるく', 24, { anchor: 'middle', w: 700, ls: 2 });
    var cx0 = 1262, cy0 = my + 28, cw = 214, chh = mh - 40;
    o += frameC(cx0, cy0, cw, chh);
    o += figC(def, 1142, my, mw, mh, vbFull(mw, mh), { yaw: -24, pose: 'surprised', expr: 'surprised', prop: false, companions: false, shadow: false });
    o += bambooC(cx0, cy0, cw, chh, uid);
    o += grassC(1176, my + mh - 8, 5) + grassC(1430, my + mh - 8, 4);
    o += '<g stroke="#e0801c" stroke-width="4" stroke-linecap="round"><path d="M1190 ' + (my + 60) + 'l-12 -8M1186 ' + (my + 74) + 'l-14 2M1194 ' + (my + 48) + 'l-6 -12"/></g>';
    o += TG(1370, y2 + 312, 'かくれる（擬態）', 24, { anchor: 'middle', w: 700, ls: 2 });
    // ---- 修行のうごき
    var y3 = y2 + 384;
    o += '<path d="M36 ' + (y3 - 46) + 'H1500" stroke="' + SUMI + '" stroke-width="2.5"/>';
    o += secTitle(40, y3, '修行のうごき', '相棒道場で使う6つの動き（相棒・見習い・里の忍者に共通）');
    var acts = [
      ['こうげき', 'attack', -70, 'swing', 'serious', 1],
      ['きゅうじょ', 'rescue', -60, 'care', 'normal', null],
      ['しらべる', 'search', -60, 'search', 'normal', null],
      ['さがる', 'retreat', 60, 'dash', 'surprised', null],
      ['へとへと', 'down', -30, 'dizzy', 'tired', null],
      ['わーい', 'cheer', 0, 'cheer', 'happy', null]
    ];
    var aw = 247, ah = 340, ay = y3 + 12, ground = ay + (232 - 16) * ah / 224;
    acts.forEach(function (a, i) {
      var x = 26 + i * aw, dx = a[1] === 'attack' ? 34 : 0;
      if (a[1] === 'attack') o += dummyC(x + 42, ground);
      if (a[1] === 'search') o += chestC(x + 206, ground);
      if (a[1] === 'retreat') o += makibishiC(x + 190, ground);
      o += figC(def, x + dx, ay, aw, ah, vbFull(aw, ah), { yaw: a[2], pose: a[1], fx: a[3], expr: a[4], frame: a[5], prop: false, companions: false });
      o += TG(x + dx + aw / 2, ground + 44, a[0], 24, { anchor: 'middle', w: 700, ls: 2 });
    });
    // ---- フッター
    var yf = CH - 58;
    o += '<path d="M36 ' + yf + 'H1500" stroke="' + SUMI + '" stroke-width="2"/>';
    o += TG(768, yf + 38, 'CryptoNinja ファンゲーム制作資料', 21, { anchor: 'middle', w: 700, ls: 3 });
    o += TG(1500, yf + 38, ch.partner ? '相棒はこのゲーム独自のキャラクター（公式ではありません）' : '非公式・キャラクターは CC0（Ninja DAO）', 14, { anchor: 'end', w: 500, col: '#7a7680' });
    var font = opt.fontFace || '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + CW + ' ' + CH + '" width="' + (opt.w || CW) + '" height="' + (opt.h || CH) + '">' + (font ? '<style>' + font + '</style>' : '') + o + '</svg>';
  }

  /* ================= 原型版（既定・1536×1860） ================= */
  // 主役は原型＝公式イラスト（CC0）。大きく見せ、顔のアップ・色・見た目のポイント・公式の紹介を添える。
  // 下の段は、ゲームの中で動かすために原型をもとに描いた簡略な絵（三面図・あるく・修行のうごき）
  var OW = 1536, OH = 1860;
  // 文字数で折り返す（行頭に句読点・閉じかっこ、行末に開きかっこを置かない）
  function wrapJa(s, n) {
    var out = [], line = '', NO_HEAD = '、。）」』・ー', NO_TAIL = '（「『';
    String(s).split('').forEach(function (c) {
      if (line.length >= n && NO_HEAD.indexOf(c) < 0) {
        var carry = '';
        while (line.length > 1 && NO_TAIL.indexOf(line.charAt(line.length - 1)) >= 0) { carry = line.charAt(line.length - 1) + carry; line = line.slice(0, -1); }
        out.push(line); line = carry;
      }
      line += c;
    });
    if (line) out.push(line);
    return out;
  }
  function figO(def, x, y, w, h, vb, opt) {
    var inner = A.render(def, Object.assign({ raw: true, style: 'official' }, opt || {}));
    return '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" viewBox="' + vb + '" overflow="visible">' + inner + '</svg>';
  }
  // 相棒の見本：えらべる装束の色を小さく並べる
  function partnerPicks(x, y, w, h) {
    var C2 = root.NAD_CHARS || (typeof require !== 'undefined' ? require('./chars.js') : null), o = '';
    if (!C2) return '';
    var hairs = ['short', 'pony', 'bob', 'buns', 'spiky', 'pony'], cols = ['kuro', 'cha', 'kuri', 'gin', 'kuro', 'cha'], accs = ['none', 'scarf', 'plate', 'none', 'mask', 'plate'];
    var cw = w / 6;
    C2.PARTNER_OUTFITS.forEach(function (st, i) {
      var cx = x + i * cw;
      o += figO(C2.partnerArt({ outfit: st.id, hair: hairs[i], hairColor: cols[i], acc: accs[i] }), cx, y, cw, h - 26, '-8 -10 216 252', { yaw: 10, pose: 'stand', shadow: false, prop: false });
      o += TG(cx + cw / 2, y + h - 4, st.name, 16, { anchor: 'middle', w: 700, col: '#4a4850' });
    });
    return o;
  }
  // 公式イラストの上の顔の範囲（360×360 の座標）。ほとんど同じ構図なので既定の枠で足り、合わないキャラだけ直す
  var FACE_BOX = { x: 100, y: 30, w: 180, h: 180 };
  function sheetSvgOff(ch, opt) {
    opt = opt || {};
    var uid = 'so' + (++seq), def = ch.art, o = '';
    var vbH = 252, vbFull = function (w, h) { var vw = vbH * w / h; return (100 - vw / 2).toFixed(1) + ' -12 ' + vw.toFixed(1) + ' ' + vbH; };
    o += '<rect width="' + OW + '" height="' + OH + '" fill="' + PAPER2 + '"/>';
    o += '<filter id="' + uid + 'n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="' + (parseInt(ch.num, 10) || 7) + '"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .2  0 0 0 0 .22  0 0 0 .06 0"/></filter>';
    o += '<rect width="' + OW + '" height="' + OH + '" filter="url(#' + uid + 'n)"/>';
    // ---- 黒い帯の見出し
    o += '<rect width="' + OW + '" height="128" fill="' + SUMI + '"/><rect y="128" width="' + OW + '" height="5" fill="' + SHU + '"/>';
    o += '<rect x="36" y="26" width="9" height="76" fill="' + SHU + '"/>';
    var nm = ch.name, nsz = nm.length > 4 ? 66 : 80;
    o += '<text x="64" y="' + (nm.length > 4 ? 94 : 100) + '" font-size="' + nsz + '" fill="#f7f3ec" font-family="' + FONT_B + '">' + esc(nm) + '</text>';
    var nameW = nm.length * nsz + 8;
    o += '<path d="M' + (64 + nameW + 18) + ' 40v58" stroke="#8a8690" stroke-width="2.5"/>';
    o += TG(64 + nameW + 42, 88, 'キャラクターシート', 36, { w: 900, col: '#ece7de', ls: 5 });
    o += TG(64 + nameW + 44, 114, 'CHARACTER SHEET', 13, { w: 700, col: '#8a8690', ls: 6 });
    o += TG(OW - 150, 62, 'ニンジャ相棒道場', 20, { anchor: 'end', w: 700, col: KIN, ls: 3 });
    o += TG(OW - 150, 92, ch.partner ? 'ゲーム独自の相棒' : 'CryptoNinja 39', 14, { anchor: 'end', w: 700, col: '#8a8690', ls: 3 });
    o += seal(OW - 128, 22, 86, ch.partner ? '相棒' : ch.clan);
    // ---- 情報の行
    var tag = ch.partner ? '相棒（ゲーム独自）' : '原型：公式イラスト', tagW = tag.length * 20 + 28;
    o += '<rect x="40" y="152" width="' + tagW + '" height="34" rx="3" fill="' + (ch.partner ? SUMI : SHU) + '"/>' + TG(40 + tagW / 2, 176, tag, 20, { anchor: 'middle', w: 700, col: '#f8f4ec' });
    var info = ch.partner ? (ch.info || '') : ('#' + ch.num + ' ' + ch.en + '　／　' + ch.clan + '（' + (ch.clanEn || '') + '）　／　忍術：' + ch.jutsu + '　／　武器：' + ch.weapon + '　／　誕生日：' + ch.birthday);
    o += TG(40 + tagW + 20, 176, info, 20, { w: 500, col: '#3a3840' });
    // ---- 原型（大きく）
    var mx = 40, my = 212, ms = 740, bg = opt.officialBg || '#d8d3ca';
    var href = opt.officialHref || ('../ninja-sato-life/img/art/' + (ch.id || '') + '.jpg');
    var kc = 0.56, vbC = [100 - 190 * kc, 232 - 133.8 - 200 * kc, 360 * kc, 360 * kc].map(function (v) { return v.toFixed(2); }).join(' '); // 公式イラストと同じ切りとり
    var artIn = function (vb) { // 原型を (0,0)-(360,360) に置いた中身
      return ch.partner ? '<svg x="0" y="0" width="360" height="360" viewBox="' + vbC + '">' + A.render(def, { raw: true, style: 'official', yaw: 14, pose: 'stand', shadow: false }) + '</svg>'
        : '<image href="' + esc(href) + '" x="0" y="0" width="360" height="360" preserveAspectRatio="none"/>';
    };
    o += '<clipPath id="' + uid + 'pm"><rect x="' + mx + '" y="' + my + '" width="' + ms + '" height="' + ms + '" rx="8"/></clipPath>';
    o += '<g clip-path="url(#' + uid + 'pm)"><rect x="' + mx + '" y="' + my + '" width="' + ms + '" height="' + ms + '" fill="' + (ch.partner ? '#c9d3dc' : bg) + '"/>' +
      '<svg x="' + mx + '" y="' + my + '" width="' + ms + '" height="' + ms + '" viewBox="0 0 360 360">' + artIn() + '</svg></g>';
    o += '<rect x="' + mx + '" y="' + my + '" width="' + ms + '" height="' + ms + '" rx="8" fill="none" stroke="' + SUMI + '" stroke-width="3"/>';
    o += TG(mx + 16, my + ms + 34, ch.partner ? '相棒（見本）　このゲーム独自のキャラクター' : '原型　公式イラスト（CryptoNinja・CC0）', 22, { w: 900, ls: 1 });
    if (!ch.partner) o += TG(mx + ms - 8, my + ms + 34, '元の画像を高画質化して拡大', 15, { anchor: 'end', w: 500, col: '#6a6670' });
    // ---- 右の列：顔のアップ・色・見た目のポイント・公式の紹介
    var rx = 812, rw = OW - 40 - rx, fs = 300;
    var fb = ch.faceBox || FACE_BOX;
    var fvb = ch.partner ? A.faceBox(def, { size: 56, style: 'official' }) : (fb.x + ' ' + fb.y + ' ' + fb.w + ' ' + fb.h);
    o += '<clipPath id="' + uid + 'pf"><rect x="' + rx + '" y="' + my + '" width="' + fs + '" height="' + fs + '" rx="6"/></clipPath>';
    o += '<g clip-path="url(#' + uid + 'pf)"><rect x="' + rx + '" y="' + my + '" width="' + fs + '" height="' + fs + '" fill="' + (ch.partner ? '#c9d3dc' : bg) + '"/>' +
      '<svg x="' + rx + '" y="' + my + '" width="' + fs + '" height="' + fs + '" viewBox="' + fvb + '">' +
      (ch.partner ? A.render(def, { raw: true, style: 'official', yaw: -12, pose: 'stand', shadow: false, prop: false, companions: false }) : artIn()) + '</svg></g>';
    o += '<rect x="' + rx + '" y="' + my + '" width="' + fs + '" height="' + fs + '" rx="6" fill="none" stroke="' + SUMI + '" stroke-width="3"/>';
    o += '<rect x="' + rx + '" y="' + my + '" width="132" height="34" rx="6" fill="' + SUMI + '"/>' + TG(rx + 66, my + 24, '顔のアップ', 18, { anchor: 'middle', w: 700, col: '#f8f4ec', ls: 2 });
    // 色
    var cx0 = rx + fs + 32;
    o += secTitle(cx0, my + 26, '色');
    (ch.palette || []).slice(0, 8).forEach(function (col, i) {
      var sx = cx0 + (i % 2) * 176, syy = my + 50 + Math.floor(i / 2) * 60;
      o += swatch(sx, syy, col) + TG(sx + 56, syy + 30, String(col).toUpperCase(), 16, { w: 500, col: '#3a3840' });
    });
    // 見た目のポイント
    var py = my + fs + 62;
    o += secTitle(rx, py, '見た目のポイント');
    o += TG(rx + 22, py + 30, ch.partner ? 'このゲーム独自の相棒' : '原型（公式イラスト）から読みとった、そのキャラらしさ', 16, { w: 500, col: '#6a6670' });
    var ly = py + 74, pts = ch.look && ch.look.length ? ch.look : (ch.partner ? ['見習いの装束（たすき・鉢巻き・背中の木刀）', '公式の39体と同じ描き方（約2.7頭身）', '外見は装束6色×髪型5×髪の色4×小物4から選ぶ', '呼び名と話し方も、ゲームの最初に選ぶ'] : []);
    pts.slice(0, 5).forEach(function (t) {
      var lines = wrapJa(t, 28);
      o += '<rect x="' + rx + '" y="' + (ly - 17) + '" width="12" height="12" fill="' + SHU + '" transform="rotate(45 ' + (rx + 6) + ' ' + (ly - 11) + ')"/>';
      lines.forEach(function (ln, j) { o += TG(rx + 26, ly + j * 30, ln, 22, { w: 700, col: '#26242a' }); });
      ly += lines.length * 30 + 12;
    });
    // 公式の紹介（相棒はえらべる装束）
    var by = Math.max(ly + 26, my + ms - 150);
    if (ch.partner) {
      o += secTitle(rx, by, 'えらべる装束（6色）');
      o += partnerPicks(rx, by + 12, rw, my + ms - by - 6);
    } else if (ch.bio) {
      o += secTitle(rx, by, '公式の紹介');
      wrapJa(ch.bio, 30).slice(0, 4).forEach(function (ln, j) { o += TG(rx + 4, by + 40 + j * 30, ln, 20, { w: 500, col: '#3a3840' }); });
    }
    o += '<path d="M36 ' + (my + ms + 62) + 'H1500" stroke="' + SUMI + '" stroke-width="2.5"/>';
    // ---- ゲームの中の姿（原型をもとに描いた、動かすための簡略な絵）
    var y1 = my + ms + 112;
    o += secTitle(40, y1, 'ゲームの中の姿', '原型をもとに、ゲームで動かせるように簡略化して描いた絵（約2.7頭身）');
    var row1 = [['まえ', 'stand', 0], ['ななめ', 'stand', -38], ['よこ', 'stand', -90], ['うしろ', 'stand', 180], ['あるく', 'walk', 52]];
    var cw1 = 292, ch1 = 300, t1 = y1 + 14;
    row1.forEach(function (v, i) {
      var x = 40 + i * cw1;
      if (v[1] === 'walk') o += speedLinesC(x + 4, t1 + 150) + dustC(x + 94, t1 + ch1 - 16);
      o += figO(def, x, t1, cw1, ch1, vbFull(cw1, ch1), { yaw: v[2], pose: v[1], frame: 1, prop: v[1] === 'stand', companions: v[1] === 'stand' });
      o += TG(x + cw1 / 2, t1 + ch1 + 30, v[0], 22, { anchor: 'middle', w: 700, ls: 3 });
    });
    var y2 = t1 + ch1 + 74;
    o += TG(40, y2 + 6, '修行のうごき', 22, { w: 900, ls: 2 }) + TG(196, y2 + 4, '相棒道場で使う6つの動き', 16, { w: 500, col: '#6a6670' });
    var acts = [
      ['こうげき', 'attack', -70, 'swing', 'serious', 1],
      ['きゅうじょ', 'rescue', -60, 'care', 'normal', null],
      ['しらべる', 'search', -60, 'search', 'normal', null],
      ['さがる', 'retreat', 60, 'dash', 'surprised', null],
      ['へとへと', 'down', -30, 'dizzy', 'tired', null],
      ['わーい', 'cheer', 0, 'cheer', 'happy', null]
    ];
    var aw = 245, ah = 270, ay = y2 + 14, ground = ay + (232 + 12) * ah / vbH;
    acts.forEach(function (a, i) {
      var x = 28 + i * aw, dx = a[1] === 'attack' ? 30 : 0;
      if (a[1] === 'attack') o += '<g transform="translate(' + (x + 40) + ' ' + ground + ') scale(.82) translate(' + (-(x + 40)) + ' ' + (-ground) + ')">' + dummyC(x + 40, ground) + '</g>';
      if (a[1] === 'search') o += chestC(x + 204, ground);
      if (a[1] === 'retreat') o += makibishiC(x + 188, ground);
      o += figO(def, x + dx, ay, aw, ah, vbFull(aw, ah), { yaw: a[2], pose: a[1], fx: a[3], expr: a[4], frame: a[5], prop: false, companions: false });
      o += TG(x + dx + aw / 2, ground + 36, a[0], 20, { anchor: 'middle', w: 700, ls: 2 });
    });
    // ---- フッター
    var yf = OH - 58;
    o += '<path d="M36 ' + yf + 'H1500" stroke="' + SUMI + '" stroke-width="2"/>';
    o += TG(768, yf + 38, 'CryptoNinja ファンゲーム制作資料', 21, { anchor: 'middle', w: 700, ls: 3 });
    o += TG(1500, yf + 38, ch.partner ? '相棒はこのゲーム独自のキャラクター（公式ではありません）' : '非公式・キャラクターと公式イラストは CC0（Ninja DAO）', 14, { anchor: 'end', w: 500, col: '#7a7680' });
    var font = opt.fontFace || '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + OW + ' ' + OH + '" width="' + (opt.w || OW) + '" height="' + (opt.h || OH) + '">' + (font ? '<style>' + font + '</style>' : '') + o + '</svg>';
  }

  // ch: { name, num, en, clan, jutsu, weapon, birthday, palette, art, look }（公式39体）
  //     相棒のときは { name, info, palette, art, partner: true }
  // opt: { style, officialHref（公式イラスト（高画質化したもの）の URL か data URI）, officialBg（公式イラストの背景色）}
  function sheetSvg(ch, opt) {
    opt = opt || {};
    var st = opt.style || A.style;
    return st === 'cute' ? sheetSvgCute(ch, opt) : st === 'cool' ? sheetSvgCool(ch, opt) : sheetSvgOff(ch, opt);
  }
  function size(style) { var st = style || A.style; return st === 'cute' ? { W: W, H: H } : st === 'cool' ? { W: CW, H: CH } : { W: OW, H: OH }; }

  var api = { sheetSvg: sheetSvg, size: size, W: OW, H: OH, COOL: { W: CW, H: CH }, CUTE: { W: W, H: H } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NinjaSheet = api;
})(typeof window !== 'undefined' ? window : globalThis);
