/* ニンジャからくり工房 — キャラクターシート（1536×1024 の1枚SVG）
 * 添付の見本（狐白｜キャラクターシート・ゲーム用アレンジ案）と同じ並び：
 *   上：まえ／ななめ／よこ／うしろ ＋ 右端に色見本
 *   下左：しぐさ（ふつう・うれしい・びっくり・しんけん）
 *   下右：うごき・擬態（あるく・かくれる（擬態））
 *   いちばん下：CryptoNinja ファンゲーム制作資料
 * 右上に、本作での役（担当の試験）を小さく添える。
 * 描画は art.js（NinjaArt）。ブラウザでも Node でも動く。
 */
(function (root) {
  'use strict';
  var A = root.NinjaArt || (typeof require !== 'undefined' ? require('./art.js') : null);
  var U = A.util;
  var INK = '#3b2a20', PAPER = '#f6f0e4';
  var MINCHO = "'Zen Old Mincho','Shippori Mincho B1','Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
  var GOTHIC = "'Zen Maru Gothic','Hiragino Maru Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif";
  var KANSUJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  var seq = 0;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function T(x, y, s, size, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + (o.col || INK) + '" font-family="' + (o.font || MINCHO) + '" font-weight="' + (o.w || 700) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.ls ? ' letter-spacing="' + o.ls + '"' : '') + '>' + esc(s) + '</text>';
  }
  // 漢数字（1〜39）
  function kan(n) {
    if (n < 10) return KANSUJI[n];
    var t = Math.floor(n / 10), u = n % 10;
    return (t > 1 ? KANSUJI[t] : '') + '十' + KANSUJI[u];
  }
  // キャラ1体を (x,y,w,h) の枠に置く（viewBox 200×240、地面は y=232）
  function fig(def, x, y, w, h, opt) {
    var inner = A.render(def, Object.assign({ raw: true }, opt || {}));
    return '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" viewBox="0 0 200 240" overflow="visible">' + inner + '</svg>';
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
    return '<g stroke="' + INK + '" stroke-width="4" stroke-linecap="round" opacity=".7"><path d="M' + x + ' ' + y + 'h46"/><path d="M' + (x + 14) + ' ' + (y + 16) + 'h30"/><path d="M' + (x - 6) + ' ' + (y + 32) + 'h40"/></g>';
  }
  function dust(x, y) {
    var o = '';
    [[0, 0, 12], [-22, 6, 9], [-40, 12, 7], [-12, 16, 6]].forEach(function (d) { o += U.sp(U.ellD(x + d[0], y + d[1], d[2], d[2] * 0.85), '#d3cbbb', { w: 2, sc: '#aa9e8a' }); });
    return o;
  }
  function grass(x, y, n) {
    var o = '';
    for (var i = 0; i < n; i++) {
      var gx = x + i * 16 + (i % 3) * 3, h = 18 + (i * 7) % 12;
      o += '<path d="M' + gx + ' ' + y + 'q-3 ' + (-h * 0.6) + ' -8 ' + (-h) + 'M' + (gx + 4) + ' ' + y + 'q1 ' + (-h * 0.7) + ' 3 ' + (-h - 4) + 'M' + (gx + 8) + ' ' + y + 'q4 ' + (-h * 0.5) + ' 10 ' + (-h + 2) + '" stroke="#5b8a3a" stroke-width="3.4" fill="none" stroke-linecap="round"/>';
    }
    return o;
  }
  // うれしい：黄色い放射線／びっくり：朱色のとげ
  function joyMarks(cx, cy, r) {
    var o = '<g stroke="#f2a31b" stroke-width="4.5" stroke-linecap="round">';
    [[-150, 1], [-125, 0.8], [-100, 0.9], [-40, 1], [-15, 0.85], [15, 0.8]].forEach(function (a) {
      var t = a[0] * Math.PI / 180, r0 = r, r1 = r + 18 * a[1];
      o += '<path d="M' + (cx + Math.cos(t) * r0).toFixed(1) + ' ' + (cy + Math.sin(t) * r0).toFixed(1) + 'L' + (cx + Math.cos(t) * r1).toFixed(1) + ' ' + (cy + Math.sin(t) * r1).toFixed(1) + '"/>';
    });
    return o + '</g>';
  }
  function shockMarks(x, y) {
    var o = '';
    [[0, 0, -18], [22, 10, 12], [-6, 30, -40]].forEach(function (m) {
      var mx = x + m[0], my = y + m[1], a = m[2];
      o += '<path d="M' + mx + ' ' + my + 'l7 -22l7 22Z" fill="#e8552a" stroke="#b83a1a" stroke-width="1.6" stroke-linejoin="round" transform="rotate(' + a + ' ' + mx + ' ' + my + ')"/>';
    });
    return o;
  }
  // 竹柄の布（擬態）と竹の枠
  function bambooCloth(x, y, w, h, uid) {
    var d = 'M' + x + ' ' + y + 'h' + w + 'l-4 ' + h + 'q-' + (w / 2) + ' 10 -' + (w - 8) + ' 0Z';
    var o = '<defs><clipPath id="' + uid + 'cl"><path d="' + d + '"/></clipPath></defs>';
    o += '<g clip-path="url(#' + uid + 'cl)"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h + 12) + '" fill="#b9c79a"/>';
    for (var i = 0; i < 6; i++) {
      var bx = x + 12 + i * (w - 24) / 5;
      o += '<rect x="' + (bx - 7) + '" y="' + y + '" width="14" height="' + (h + 12) + '" fill="#8fa86a"/>';
      for (var j = 1; j < 6; j++) { var ny = y + j * h / 6 + (i % 2) * 14; o += '<path d="M' + (bx - 8) + ' ' + ny + 'h16" stroke="#6f8a4c" stroke-width="3"/>'; }
      o += '<path d="M' + (bx + 7) + ' ' + (y + 40 + i * 9) + 'q12 -6 18 4q-10 2 -18 -4Z" fill="#7a9a54"/>';
    }
    o += '</g><path d="' + d + '" fill="none" stroke="' + U.OUT + '" stroke-width="3" stroke-linejoin="round"/>';
    return o;
  }
  function bambooFrame(x, y, w, h) {
    var col = '#c9a46a', dk = '#8a6a3a', o = '';
    function pole(x0, y0, x1, y1) {
      o += '<path d="M' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y1 + '" stroke="' + U.OUT + '" stroke-width="13" stroke-linecap="round"/>' +
        '<path d="M' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y1 + '" stroke="' + col + '" stroke-width="8" stroke-linecap="round"/>';
      for (var k = 1; k < 4; k++) { var px = x0 + (x1 - x0) * k / 4, py = y0 + (y1 - y0) * k / 4; o += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3.2" fill="' + dk + '"/>'; }
    }
    pole(x - 8, y + h + 8, x - 8, y - 16);
    pole(x + w + 8, y + h + 8, x + w + 8, y - 16);
    pole(x - 30, y - 16, x + w + 30, y - 16);
    o += '<path d="M' + (x - 8) + ' ' + (y + h * 0.55) + 'l-26 ' + (h * 0.45) + 'M' + (x + w + 8) + ' ' + (y + h * 0.55) + 'l26 ' + (h * 0.45) + '" stroke="' + dk + '" stroke-width="7" stroke-linecap="round"/>';
    return o;
  }
  // 右上の役札（担当の試験）
  function roleTag(ch) {
    var ex = ch.exam || {};
    if (!ex.stage) return '';
    var x = 1500, o = '';
    o += T(x, 64, 'ニンジャからくり工房', 20, { anchor: 'end', w: 700, col: '#7a6450', ls: 2 });
    o += T(x, 102, '第' + kan(ex.stage) + 'の試験「' + ex.title + '」試験官', 28, { anchor: 'end', w: 900 });
    o += T(x, 134, '得意な仕掛け：' + ex.skill, 19, { anchor: 'end', w: 500, col: '#6a5a48', font: GOTHIC });
    return o;
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
    var nameSize = ch.name.length > 4 ? 54 : 60;
    o += T(44, 88, ch.name, nameSize, { w: 900 });
    var nameW = Math.max(1, ch.name.length) * nameSize + 6;
    o += '<path d="M' + (44 + nameW + 16) + ' 42v54" stroke="' + INK + '" stroke-width="3"/>';
    o += T(44 + nameW + 38, 86, 'キャラクターシート', 52, { w: 900, ls: 1 });
    var lineEnd = 44 + nameW + 38 + 490;
    o += '<path d="M40 110H' + lineEnd + '" stroke="' + INK + '" stroke-width="2.6"/>';
    o += T(48, 146, 'ゲーム用アレンジ案', 25, { w: 700 });
    var info = '#' + ch.num + ' ' + ch.en + '　' + ch.clan + '　忍術：' + ch.jutsu + '　武器：' + ch.weapon + '　誕生日：' + ch.birthday;
    o += T(290, 145, info, 19, { w: 500, col: '#6a5a48', font: GOTHIC });
    o += roleTag(ch);
    // 上段：4方向
    var views = [['まえ', 0, 220], ['ななめ', -38, 580], ['よこ', -90, 900], ['うしろ', 180, 1250]];
    var fw = 340, fh = 408, top = 128;
    views.forEach(function (v) {
      var x = v[2] - fw / 2;
      o += fig(def, x, top, fw, fh, { yaw: v[1], pose: 'stand' });
      o += T(v[2], 572, v[0], 30, { anchor: 'middle', w: 700 });
    });
    // 色見本
    (ch.palette || []).slice(0, 7).forEach(function (col, i) { o += blob(1466, 198 + i * 54, 22, col, i + 1); });
    // 区切り
    o += '<path d="M36 596H1500" stroke="' + INK + '" stroke-width="2.4"/>';
    o += '<path d="M858 612V954" stroke="' + INK + '" stroke-width="2.4"/>';
    o += T(44, 646, 'しぐさ', 36, { w: 900 });
    o += T(886, 646, 'うごき・擬態', 36, { w: 900 });
    // しぐさ
    var gw = 250, gh = 300, gtop = 626;
    var gs = [['ふつう', 'stand', -8, 140], ['うれしい', 'cheer', -12, 345], ['びっくり', 'guard', -4, 548], ['しんけん', 'serious', 0, 752]];
    gs.forEach(function (e) {
      var x = e[3] - gw / 2;
      o += fig(def, x, gtop, gw, gh, { yaw: e[2], pose: e[1], prop: false, companions: e[1] === 'stand' });
      if (e[1] === 'cheer') o += joyMarks(e[3] + 8, gtop + 118, 92);
      if (e[1] === 'guard') o += shockMarks(e[3] + 78, gtop + 44);
      if (e[1] === 'serious') o += '<g stroke="#6a8ab8" stroke-width="3" stroke-linecap="round" opacity=".8"><path d="M' + (e[3] - 88) + ' ' + (gtop + 64) + 'l9 11M' + (e[3] + 88) + ' ' + (gtop + 64) + 'l-9 11"/></g>';
      o += T(e[3], 950, e[0], 28, { anchor: 'middle', w: 700 });
    });
    // あるく
    o += speedLines(900, 790);
    o += dust(1000, 904);
    o += fig(def, 1030 - gw / 2, gtop, gw, gh, { yaw: 52, pose: 'walk', frame: 1, prop: false, companions: false });
    o += T(1030, 950, 'あるく', 28, { anchor: 'middle', w: 700 });
    // かくれる（擬態）
    var cx = 1268, cy = 684, cw = 212, chh = 228;
    o += bambooFrame(cx, cy, cw, chh);
    o += fig(def, 1146, 636, 236, 284, { yaw: -26, pose: 'surprised', expr: 'surprised', prop: false, companions: false, shadow: false });
    o += bambooCloth(cx, cy, cw, chh, uid);
    o += grass(1176, 924, 5) + grass(1420, 924, 5);
    o += '<g stroke="#f2a31b" stroke-width="4" stroke-linecap="round"><path d="M1206 712l-12 -8M1202 726l-14 2M1210 700l-6 -12"/></g>';
    o += T(1372, 950, 'かくれる（擬態）', 28, { anchor: 'middle', w: 700 });
    // フッター
    o += '<path d="M36 970H1500" stroke="' + INK + '" stroke-width="2"/>';
    o += T(768, 1004, 'CryptoNinja ファンゲーム制作資料', 22, { anchor: 'middle', w: 700, ls: 2 });
    o += T(1500, 1004, '非公式・キャラクターは CC0（Ninja DAO）', 14, { anchor: 'end', w: 500, col: '#8a7a66', font: GOTHIC });
    var font = opt.fontFace || '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + (opt.w || W) + '" height="' + (opt.h || H) + '">' + (font ? '<style>' + font + '</style>' : '') + o + '</svg>';
  }

  var api = { sheetSvg: sheetSvg, kan: kan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KK_SHEET = api;
})(typeof window !== 'undefined' ? window : globalThis);
