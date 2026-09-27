/* ニンジャ里ライフ — キャラクターシート（1536×1024 の1枚SVG）
 * 添付の見本（柴｜キャラクターシート・ゲーム用アレンジ案）と同じ並び：
 *   上：まえ／ななめ／よこ／うしろ ＋ 右端に色見本
 *   下左：表情（ふつう・うれしい・びっくり・しんけん）
 *   下右：うごき・擬態（あるく・かくれる（擬態））
 *   いちばん下：CryptoNinja ファンゲーム制作資料
 * 描画は art.js（NinjaArt）。ブラウザでも Node でも動く。
 */
(function (root) {
  'use strict';
  var A = root.NinjaArt || (typeof require !== 'undefined' ? require('./art.js') : null);
  var U = A.util;
  var INK = '#3b2a20', PAPER = '#f7f1e5';
  var FONT = "'Zen Maru Gothic','Hiragino Maru Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif";
  var seq = 0;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function T(x, y, s, size, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + (o.col || INK) + '" font-family="' + FONT + '" font-weight="' + (o.w || 700) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.ls ? ' letter-spacing="' + o.ls + '"' : '') + '>' + esc(s) + '</text>';
  }
  // キャラ1体を (x,y,w,h) の枠に置く
  function fig(def, x, y, w, h, opt) {
    var inner = A.render(def, Object.assign({ raw: true }, opt || {}));
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

  function sheetSvg(ch, opt) {
    opt = opt || {};
    var uid = 'sh' + (++seq);
    var def = ch.art;
    var W = 1536, H = 1024, o = '';
    o += '<rect width="' + W + '" height="' + H + '" fill="' + PAPER + '"/>';
    // 紙のざらつき（うすく）
    o += '<filter id="' + uid + 'n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="' + (parseInt(ch.num, 10) || 1) + '"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .28  0 0 0 0 .2  0 0 0 .07 0"/></filter>';
    o += '<rect width="' + W + '" height="' + H + '" filter="url(#' + uid + 'n)"/>';
    // 見出し
    o += T(44, 94, ch.name, 64, { w: 900 });
    var nameW = Math.max(1, ch.name.length) * 64 + 10;
    o += '<path d="M' + (44 + nameW + 14) + ' 44v58" stroke="' + INK + '" stroke-width="3.5"/>';
    o += T(44 + nameW + 40, 92, 'キャラクターシート', 56, { w: 900, ls: 2 });
    o += '<path d="M40 116H' + (44 + nameW + 40 + 540) + '" stroke="' + INK + '" stroke-width="3"/>';
    o += T(48, 152, 'ゲーム用アレンジ案', 26, { w: 700 });
    var info = '#' + ch.num + ' ' + ch.en + '　' + ch.clan + '　忍術：' + ch.jutsu + '　武器：' + ch.weapon + '　誕生日：' + ch.birthday;
    o += T(300, 152, info, 21, { w: 500, col: '#6a5a48' });
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
    o += T(44, 650, '表情', 38, { w: 900 });
    o += T(890, 650, 'うごき・擬態', 38, { w: 900 });
    // 表情
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
    // フッター
    o += '<path d="M36 968H1500" stroke="' + INK + '" stroke-width="2"/>';
    o += T(768, 1003, 'CryptoNinja ファンゲーム制作資料', 22, { anchor: 'middle', w: 500, ls: 2 });
    o += T(1500, 1003, '非公式・キャラクターは CC0（Ninja DAO）', 15, { anchor: 'end', w: 500, col: '#8a7a66' });
    var font = opt.fontFace || '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + (opt.w || W) + '" height="' + (opt.h || H) + '">' + (font ? '<style>' + font + '</style>' : '') + o + '</svg>';
  }

  var api = { sheetSvg: sheetSvg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NinjaSheet = api;
})(typeof window !== 'undefined' ? window : globalThis);
