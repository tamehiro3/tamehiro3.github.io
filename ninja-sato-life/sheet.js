/* ニンジャ里ライフ — キャラクターシート（1536×1800 の1枚SVG）
 * ニンジャ相棒道場のシートと同じ並び：
 *   上：原型＝公式資料（ninja-dao.com/characters・CC0）の公式イラストと公式3Dフィギュア（全身）を大きく。
 *       顔のアップ・色・見た目のポイント・公式の紹介を添える
 *   下：ゲームの中の姿（原型をもとに、ゲームで動かせるように簡略化して描いた約2.7頭身の絵）：まえ／ななめ／よこ／うしろ・あるく、
 *       表情（ふつう・うれしい・びっくり・しんけん）・擬態（かくれる）
 *   いちばん下：CryptoNinja ファンゲーム制作資料
 * 描画は art.js（NinjaArt）。ブラウザでも Node でも動く。
 */
(function (root) {
  'use strict';
  var A = root.NinjaArt || (typeof require !== 'undefined' ? require('./art.js') : null);
  var U = A.util;
  var W = 1536, H = 1800;
  var INK = '#3b2a20', SUMI = '#141418', SHU = '#c8302c', KIN = '#c9a46a', GRAY = '#4a4850', PAPER = '#eeebe5';
  var FONT_B = "'Yuji Boku','Yuji Syuku','Hiragino Mincho ProN','Yu Mincho',serif";
  var FONT_G = "'Zen Kaku Gothic New','Hiragino Sans','Yu Gothic','Meiryo',sans-serif";
  var GAME = 'ニンジャ里ライフ';
  // 公式イラストの上の顔の範囲（360×360 の座標）。合わないキャラは opt.faceBox で直す
  var FACE_BOX = { x: 100, y: 30, w: 180, h: 180 };
  var seq = 0;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function TG(x, y, s, size, o) { // 角ゴシック
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + (o.col || SUMI) + '" font-family="' + (o.font || FONT_G) + '" font-weight="' + (o.w || 700) + '"' +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.ls ? ' letter-spacing="' + o.ls + '"' : '') + '>' + esc(s) + '</text>';
  }
  // 見出し：朱の四角＋太字
  function secTitle(x, y, s, sub) {
    return '<rect x="' + x + '" y="' + (y - 26) + '" width="10" height="28" fill="' + SHU + '"/>' + TG(x + 22, y, s, 32, { w: 900, ls: 2 }) + (sub ? TG(x + 22 + s.length * 34 + 24, y - 2, sub, 18, { w: 500, col: '#6a6670' }) : '');
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
  // ゲームの中の姿の段は、上に余白をとった枠（高く結った髪がすぐ上の見出しにかからないように。足もとの位置はほぼ同じ）
  var VBH = '0 -28 200 268';
  // キャラ1体を (x,y,w,h) の枠に置く（viewBox 200×240、地面は y=232。枠の中央にそろう）
  function fig(def, x, y, w, h, opt) {
    var inner = A.render(def, Object.assign({ raw: true }, opt || {}));
    return '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" viewBox="' + (opt && opt.vb || '0 0 200 240') + '" overflow="visible">' + inner + '</svg>';
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
  // かくれる（擬態）：竹柄の布のかげから、のぞいている。(ax, ay) は布の中央・名札の行
  function hide(def, ax, ay, s, uid) {
    var o = '<g transform="translate(' + ax + ' ' + ay + ') scale(' + s + ') translate(' + (-ax) + ' ' + (-ay) + ')">';
    o += frame(ax - 105, ay - 258, 210, 222);
    o += fig(def, ax - 199, ay - 286, 200, 240, { yaw: -24, pose: 'surprised', expr: 'surprised', prop: false, companions: false, shadow: false });
    o += bambooCloth(ax - 105, ay - 258, 210, 222, uid);
    o += grass(ax - 187, ay - 30, 5, 1) + grass(ax + 51, ay - 30, 5, 1);
    o += '<g stroke="#f08c1c" stroke-width="4" stroke-linecap="round"><path d="M' + (ax - 175) + ' ' + (ay - 206) + 'l-12 -8M' + (ax - 179) + ' ' + (ay - 192) + 'l-14 2M' + (ax - 171) + ' ' + (ay - 218) + 'l-6 -12"/></g>';
    return o + '</g>';
  }

  // ch: { id, name, num, en, clan, clanEn, jutsu, weapon, birthday, bio, palette, art }
  // opt: { officialHref（公式イラスト（高画質化したもの）の URL か data URI）, officialBg（公式イラストの背景色）,
  //        figureHref（公式3Dフィギュア（全身）の URL か data URI）, faceBox（顔のアップの範囲）, look（見た目のポイント）, fontFace }
  function sheetSvg(ch, opt) {
    opt = opt || {};
    var uid = 'sh' + (++seq), def = ch.art, o = '';
    o += '<rect width="' + W + '" height="' + H + '" fill="' + PAPER + '"/>';
    o += '<filter id="' + uid + 'n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="' + (parseInt(ch.num, 10) || 7) + '"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .2  0 0 0 0 .22  0 0 0 .06 0"/></filter>';
    o += '<rect width="' + W + '" height="' + H + '" filter="url(#' + uid + 'n)"/>';
    // ---- 黒い帯の見出し
    o += '<rect width="' + W + '" height="128" fill="' + SUMI + '"/><rect y="128" width="' + W + '" height="5" fill="' + SHU + '"/>';
    o += '<rect x="36" y="26" width="9" height="76" fill="' + SHU + '"/>';
    var nm = ch.name, nsz = nm.length > 4 ? 66 : 80;
    o += '<text x="64" y="' + (nm.length > 4 ? 94 : 100) + '" font-size="' + nsz + '" fill="#f7f3ec" font-family="' + FONT_B + '">' + esc(nm) + '</text>';
    var nameW = nm.length * nsz + 8;
    o += '<path d="M' + (64 + nameW + 18) + ' 40v58" stroke="#8a8690" stroke-width="2.5"/>';
    o += TG(64 + nameW + 42, 88, 'キャラクターシート', 36, { w: 900, col: '#ece7de', ls: 5 });
    o += TG(64 + nameW + 44, 114, 'CHARACTER SHEET', 13, { w: 700, col: '#8a8690', ls: 6 });
    o += TG(W - 150, 62, GAME, 20, { anchor: 'end', w: 700, col: KIN, ls: 3 });
    o += TG(W - 150, 92, 'CryptoNinja 39', 14, { anchor: 'end', w: 700, col: '#8a8690', ls: 3 });
    o += seal(W - 128, 22, 86, ch.clan);
    // ---- 情報の行
    var tag = '原型：公式資料', tagW = tag.length * 20 + 28;
    o += '<rect x="40" y="152" width="' + tagW + '" height="34" rx="3" fill="' + SHU + '"/>' + TG(40 + tagW / 2, 176, tag, 20, { anchor: 'middle', w: 700, col: '#f8f4ec' });
    var info = '#' + ch.num + ' ' + ch.en + '　／　' + ch.clan + '（' + (ch.clanEn || '') + '）　／　忍術：' + ch.jutsu + '　／　武器：' + ch.weapon + '　／　誕生日：' + ch.birthday;
    o += TG(40 + tagW + 20, 176, info, 20, { w: 500, col: '#3a3840' });
    // ---- 原型（公式イラストと公式3Dフィギュア）
    var my = 212, s2 = 600, bg = opt.officialBg || '#d8d3ca';
    var href = opt.officialHref || ('img/art/' + (ch.id || '') + '.jpg');
    var artIn = '<image href="' + esc(href) + '" x="0" y="0" width="360" height="360" preserveAspectRatio="none"/>'; // 原型を (0,0)-(360,360) に置いた中身
    var panel = function (x, y, w, h, id, fill, inner) { // 角丸の枠に入れる
      return '<clipPath id="' + uid + id + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8"/></clipPath>' +
        '<g clip-path="url(#' + uid + id + ')"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>' + inner + '</g>' +
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="none" stroke="' + SUMI + '" stroke-width="3"/>';
    };
    // 公式イラスト（2D）
    o += panel(40, my, s2, s2, 'pa', bg, '<svg x="40" y="' + my + '" width="' + s2 + '" height="' + s2 + '" viewBox="0 0 360 360">' + artIn + '</svg>');
    o += TG(56, my + s2 + 32, '原型　公式イラスト', 21, { w: 900, ls: 1 });
    o += TG(40 + s2 - 8, my + s2 + 32, '元の画像を高画質化して拡大', 14, { anchor: 'end', w: 500, col: '#6a6670' });
    // 公式3Dフィギュア（全身）
    var fx = 40 + s2 + 20, fw = 330;
    if (opt.figureHref) {
      o += panel(fx, my, fw, s2, 'pb', '#ffffff', '<image href="' + esc(opt.figureHref) + '" x="' + (fx + 10) + '" y="' + (my + 12) + '" width="' + (fw - 20) + '" height="' + (s2 - 24) + '" preserveAspectRatio="xMidYMid meet"/>');
      o += TG(fx + fw / 2, my + s2 + 32, '原型　公式3Dフィギュア（全身）', 19, { anchor: 'middle', w: 900, ls: 1 });
    } else { // 公式3Dフィギュアがないとき：ゲームの中の姿（まえ）
      o += panel(fx, my, fw, s2, 'pb', '#ffffff', fig(def, fx + 10, my + 60, fw - 20, s2 - 120, { yaw: 0, pose: 'stand' }));
      o += TG(fx + fw / 2, my + s2 + 32, 'ゲームの中の姿（まえ）', 19, { anchor: 'middle', w: 900, ls: 1 });
    }
    // 公式の紹介（イラストの下・2行まで）
    if (ch.bio) {
      var bioY = my + s2 + 82;
      o += secTitle(40, bioY, '公式の紹介');
      wrapJa(ch.bio, 37).slice(0, 2).forEach(function (ln, j) { o += TG(252, bioY - 2 + j * 30, ln, 20, { w: 500, col: '#3a3840' }); });
    }
    // ---- 右の列：顔のアップ・色・見た目のポイント
    var rx = fx + fw + 28, fs = 220;
    var fb = opt.faceBox || ch.faceBox || FACE_BOX;
    o += panel(rx, my, fs, fs, 'pf', bg, '<svg x="' + rx + '" y="' + my + '" width="' + fs + '" height="' + fs + '" viewBox="' + fb.x + ' ' + fb.y + ' ' + fb.w + ' ' + fb.h + '">' + artIn + '</svg>');
    o += '<rect x="' + rx + '" y="' + my + '" width="120" height="32" rx="6" fill="' + SUMI + '"/>' + TG(rx + 60, my + 23, '顔のアップ', 17, { anchor: 'middle', w: 700, col: '#f8f4ec', ls: 2 });
    // 色
    var cx0 = rx + fs + 22;
    o += secTitle(cx0, my + 26, '色');
    (ch.palette || []).slice(0, 8).forEach(function (col, i) {
      var sx = cx0 + (i % 2) * 118, syy = my + 44 + Math.floor(i / 2) * 50;
      o += '<rect x="' + sx + '" y="' + syy + '" width="40" height="40" rx="5" fill="' + col + '" stroke="' + SUMI + '" stroke-width="2"/>' + TG(sx + 46, syy + 26, String(col).toUpperCase(), 13, { w: 500, col: '#3a3840' });
    });
    // 見た目のポイント
    var py = my + fs + 64, pts = opt.look || ch.look || [];
    if (pts.length) {
      o += secTitle(rx, py, '見た目のポイント');
      o += TG(rx + 22, py + 28, '原型から読みとった、そのキャラらしさ', 15, { w: 500, col: '#6a6670' });
      var ly = py + 70;
      pts.slice(0, 5).forEach(function (t) {
        var lines = wrapJa(t, 21);
        o += '<rect x="' + rx + '" y="' + (ly - 16) + '" width="11" height="11" fill="' + SHU + '" transform="rotate(45 ' + (rx + 5.5) + ' ' + (ly - 10.5) + ')"/>';
        lines.forEach(function (ln, j) { o += TG(rx + 24, ly + j * 28, ln, 20, { w: 700, col: '#26242a' }); });
        ly += lines.length * 28 + 10;
      });
    }
    var divY = my + s2 + 136;
    o += '<path d="M36 ' + divY + 'H1500" stroke="' + SUMI + '" stroke-width="2.5"/>';
    // ---- ゲームの中の姿（原型をもとに、ゲームで動かせるように簡略化して描いた絵）
    var y1 = divY + 48;
    o += secTitle(40, y1, 'ゲームの中の姿', '原型をもとに、ゲームで動かせるように簡略化して描いた絵（約2.7頭身）');
    var row1 = [['まえ', 'stand', 0], ['ななめ', 'stand', -38], ['よこ', 'stand', -90], ['うしろ', 'stand', 180], ['あるく', 'walk', 52]];
    var cw1 = 292, ch1 = 286, t1 = y1 + 12;
    row1.forEach(function (v, i) {
      var x = 40 + i * cw1;
      if (v[1] === 'walk') o += speedLines(x + 6, t1 + 150) + dust(x + 84, t1 + ch1 - 14);
      o += fig(def, x, t1, cw1, ch1, v[1] === 'walk' ? { yaw: v[2], pose: 'walk', frame: 1, prop: false, companions: false, vb: VBH } : { yaw: v[2], pose: 'stand', vb: VBH });
      o += TG(x + cw1 / 2, t1 + ch1 + 30, v[0], 22, { anchor: 'middle', w: 700, ls: 3 });
    });
    var y2 = t1 + ch1 + 70, aw = 245, ah = 262, ay = y2 + 12;
    o += TG(40, y2 + 6, '表情', 22, { w: 900, ls: 2 }) + TG(110, y2 + 4, '里の暮らしの中で見せる顔', 16, { w: 500, col: '#6a6670' });
    var ex = [['ふつう', 'stand', -8, null], ['うれしい', 'happy', -14, 'joy'], ['びっくり', 'surprised', 0, 'surprise'], ['しんけん', 'serious', 0, 'focus']];
    ex.forEach(function (e, i) {
      var x = 28 + i * aw;
      o += fig(def, x, ay, aw, ah, { yaw: e[2], pose: e[1], fx: e[3], prop: false, companions: e[1] === 'stand', vb: VBH });
      o += TG(x + aw / 2, ay + ah + 30, e[0], 22, { anchor: 'middle', w: 700, ls: 3 });
    });
    o += '<path d="M1030 ' + (y2 - 22) + 'V' + (ay + ah + 40) + '" stroke="#b8b2a8" stroke-width="2"/>';
    o += TG(1056, y2 + 6, '擬態', 22, { w: 900, ls: 2 }) + TG(1126, y2 + 4, '景色にとけこんで、かくれる', 16, { w: 500, col: '#6a6670' });
    o += hide(def, 1300, ay + ah + 30, 1, uid);
    o += TG(1300, ay + ah + 30, 'かくれる', 22, { anchor: 'middle', w: 700, ls: 3 });
    // ---- フッター
    var yf = H - 58;
    o += '<path d="M36 ' + yf + 'H1500" stroke="' + SUMI + '" stroke-width="2"/>';
    o += TG(768, yf + 38, 'CryptoNinja ファンゲーム制作資料', 21, { anchor: 'middle', w: 700, ls: 3 });
    o += TG(1500, yf + 38, '非公式・原型の出典：ninja-dao.com/characters（CC0・Ninja DAO）', 14, { anchor: 'end', w: 500, col: '#7a7680' });
    var font = opt.fontFace || '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + (opt.w || W) + '" height="' + (opt.h || H) + '">' + (font ? '<style>' + font + '</style>' : '') + o + '</svg>';
  }

  var api = { sheetSvg: sheetSvg, W: W, H: H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NinjaSheet = api;
})(typeof window !== 'undefined' ? window : globalThis);
