/* 忍び足（しのびあし）— 忍術の間の演出 SA.FX
 * Canvas 2D で3秒。真ん中に相棒（SA.Fig.bitmap）、まわりに術の演出。
 *   rank（0〜5）で派手さが変わる: 0〜1＝小さく / 2＝相棒の周り / 3＝画面半分 / 4＝画面全体 / 5＝背景が変わる
 *   okugi（1〜2）で残像と金の縁取りを足す
 *   secret は共通のきらきらだけ（技を表す絵を出さない）
 * こども向けのやさしい表現にする（毒霧は紫のもや、領域は赤い輪、幻術は渦、巨人の一撃は影が大きくなるだけ）。
 * 光の明滅は1秒に3回を超えない（閃光・雷遁は1回のやわらかい光）。prefers-reduced-motion なら粒を減らし動きを小さく。
 * 外部への通信なし。乱数は体と術から決まる種で作る（毎回同じ絵になる）。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  /* ---------------- 小道具 ---------------- */
  var TAU = Math.PI * 2;
  function c01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function sm(x) { x = c01(x); return x * x * (3 - 2 * x); }
  function seg(t, a, b) { return c01((t - a) / (b - a)); }
  function env(t, a, b, c, d) { return sm(seg(t, a, b)) * (1 - sm(seg(t, c, d))); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function eob(x) { x = c01(x); return 1 - Math.pow(1 - x, 3); } // ease out
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rgba(hex, a) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (+a).toFixed(3) + ')';
  }
  var RAINBOW = ['#e8423a', '#f59a2a', '#f5d02a', '#4fb34a', '#3a9ad8', '#7a4fc4'];
  var FONT = "'Hiragino Maru Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo','Noto Sans JP',sans-serif";

  function glow(ctx, x, y, r, col, a) {
    if (r <= 0 || a <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(0.45, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  function disc(ctx, x, y, r, col, a) { if (r <= 0) return; ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  function ring(ctx, x, y, rx, ry, col, w, a) { if (rx <= 0) return; ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(x, y, rx, Math.max(0.5, ry), 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  function sparkle(ctx, x, y, r, col, a, rot) {
    if (r <= 0 || a <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.14, -r * 0.14, r, 0); ctx.quadraticCurveTo(r * 0.14, r * 0.14, 0, r);
    ctx.quadraticCurveTo(-r * 0.14, r * 0.14, -r, 0); ctx.quadraticCurveTo(-r * 0.14, -r * 0.14, 0, -r); ctx.fill(); ctx.restore();
  }
  // 煙のぽん（口寄せ・変わり身・分身の出入り）
  function puff(ctx, x, y, r, a) {
    if (a <= 0 || r <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    var pts = [[0, 0, 1], [-0.62, 0.18, 0.7], [0.62, 0.16, 0.72], [-0.32, -0.42, 0.66], [0.36, -0.4, 0.62], [0, 0.4, 0.7]];
    ctx.fillStyle = '#e9e3d8'; ctx.strokeStyle = '#b9b0a2'; ctx.lineWidth = Math.max(1, r * 0.05);
    pts.forEach(function (p) { ctx.beginPath(); ctx.arc(x + p[0] * r, y + p[1] * r, r * 0.5 * p[2], 0, TAU); ctx.stroke(); });
    pts.forEach(function (p) { ctx.beginPath(); ctx.arc(x + p[0] * r, y + p[1] * r, r * 0.5 * p[2], 0, TAU); ctx.fill(); });
    ctx.strokeStyle = '#cfc6b6'; ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath(); ctx.arc(x - r * 0.1, y - r * 0.02, r * 0.22, 0.3, 4.2); ctx.stroke();
    ctx.restore();
  }
  function petal(ctx, x, y, s, rot, col, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.9, -s * 0.4, 0, s); ctx.quadraticCurveTo(-s * 0.9, -s * 0.4, 0, -s); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-s * 0.15, -s * 0.2, s * 0.15, s * 0.4, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function sakuraPetal(ctx, x, y, s, rot, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a; ctx.fillStyle = '#f7b8cc';
    ctx.beginPath(); ctx.moveTo(0, s); ctx.bezierCurveTo(s * 0.9, s * 0.3, s * 0.7, -s * 0.8, s * 0.12, -s * 0.9); ctx.lineTo(0, -s * 0.6); ctx.lineTo(-s * 0.12, -s * 0.9);
    ctx.bezierCurveTo(-s * 0.7, -s * 0.8, -s * 0.9, s * 0.3, 0, s); ctx.fill(); ctx.restore();
  }
  function leaf(ctx, x, y, s, rot, col, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.7, s, 0); ctx.quadraticCurveTo(0, s * 0.7, -s, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(1, s * 0.08); ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s * 0.8, 0); ctx.stroke(); ctx.restore();
  }
  function maple(ctx, x, y, s, rot, col, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath();
    for (var i = 0; i < 10; i++) { var an = -Math.PI / 2 + i * TAU / 10, r = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function flame(ctx, x, y, s, col, a) {
    ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x, y - s * 1.7); ctx.bezierCurveTo(x + s * 0.5, y - s * 0.9, x + s, y - s * 0.2, x, y + s * 0.7);
    ctx.bezierCurveTo(x - s, y - s * 0.2, x - s * 0.5, y - s * 0.9, x, y - s * 1.7); ctx.fill(); ctx.globalAlpha = 1;
  }
  function bird(ctx, x, y, s, flap, col, a, dir) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir || 1, 1); ctx.globalAlpha = a;
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var w = s * (0.35 + 0.65 * Math.abs(flap));
    ctx.beginPath(); ctx.moveTo(-s, -w * Math.sign(flap || 1) * 0.8); ctx.quadraticCurveTo(-s * 0.4, -w * 0.2, 0, 0); ctx.quadraticCurveTo(s * 0.4, -w * 0.2, s, -w * Math.sign(flap || 1) * 0.8); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.3, s * 0.18, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function bunny(ctx, x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.lineWidth = Math.max(1.2, s * 0.08); ctx.strokeStyle = '#6a4a50';
    ctx.fillStyle = '#ffffff';
    [[-0.22, -1.25, 0.14, 0.42], [0.2, -1.25, 0.14, 0.42]].forEach(function (e) { ctx.beginPath(); ctx.ellipse(e[0] * s, e[1] * s, e[2] * s, e[3] * s, e[0] * 0.8, 0, TAU); ctx.fill(); ctx.stroke(); });
    ctx.beginPath(); ctx.ellipse(0, -0.05 * s, 0.6 * s, 0.45 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -0.6 * s, 0.42 * s, 0.36 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7a8c4'; [[-0.22, -1.25], [0.2, -1.25]].forEach(function (e) { ctx.beginPath(); ctx.ellipse(e[0] * s, e[1] * s, 0.06 * s, 0.28 * s, e[0] * 0.8, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#2a1e1a'; ctx.beginPath(); ctx.arc(-0.15 * s, -0.64 * s, 0.05 * s, 0, TAU); ctx.arc(0.15 * s, -0.64 * s, 0.05 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f7a8c4'; ctx.globalAlpha = a * 0.7; ctx.beginPath(); ctx.arc(-0.27 * s, -0.52 * s, 0.07 * s, 0, TAU); ctx.arc(0.27 * s, -0.52 * s, 0.07 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function noteMark(ctx, x, y, s, col, a, two) {
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.3, -0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.36, -s * 0.05); ctx.lineTo(s * 0.36, -s * 1.3);
    if (two) { ctx.lineTo(s * 1.3, -s * 1.5); ctx.lineTo(s * 1.3, -s * 0.25); ctx.stroke(); ctx.beginPath(); ctx.ellipse(s * 0.94, -s * 0.2, s * 0.42, s * 0.3, -0.4, 0, TAU); ctx.fill(); }
    else { ctx.quadraticCurveTo(s * 1.1, -s * 1.0, s * 0.9, -s * 0.5); ctx.stroke(); }
    ctx.restore();
  }

  /* ---------------- 演出の表 ----------------
   * 各演出: bg＝rank5 で変わる背景（内・外の2色）、init(S)、back(ctx,S,t)＝相棒の後ろ、front(ctx,S,t)＝相棒の前、
   *         who(S,t)＝相棒の見せ方 { a, dx, dy, s }（省略なら真ん中にそのまま）
   * S: w,h, cx,cy（相棒の真ん中）, fy（足もと）, P（相棒の高さ）, R（届く広さ）, k（粒の多さ）, m（動きの大きさ）, ms（経過ミリ秒）, e（出入りの包み 0〜1）, rnd() */
  function N(S, base) { return Math.max(3, Math.round(base * S.k)); }
  function orbit(S, a, r, lift) { return { x: S.cx + Math.cos(a) * r, y: S.fy - S.P * (lift || 0.35) + Math.sin(a) * r * 0.42, front: Math.sin(a) > 0 }; }

  var E = {};

  // 火遁: 足もとから立ちのぼる炎の粒と、あたたかい光
  E.fire = {
    bg: ['#6a2a14', '#1c0904'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 46); i++) S.p.push({ a: S.rnd() * TAU, r: 0.35 + S.rnd() * 0.65, ph: S.rnd(), sp: 0.6 + S.rnd() * 0.6, s: 0.6 + S.rnd() * 0.6 }); },
    draw: function (ctx, S, t, front) {
      if (!front) glow(ctx, S.cx, S.fy - S.P * 0.3, S.R * 0.9, '#ff8a2a', 0.42 * S.e);
      ctx.globalCompositeOperation = 'lighter';
      S.p.forEach(function (p) {
        var life = (S.ms / 1000 * p.sp * (0.5 + 0.5 * S.m) + p.ph) % 1;
        var r = S.R * p.r * (0.55 + 0.45 * sm(t * 3));
        var x = S.cx + Math.cos(p.a) * r, y0 = S.fy + Math.sin(p.a) * r * 0.25;
        if ((Math.sin(p.a) > 0) !== front) return;
        var y = y0 - life * S.R * 0.75, s = S.P * 0.07 * p.s * (1 - life * 0.7) * (0.7 + 0.3 * S.k / 1.5);
        var col = life < 0.3 ? '#ffe27a' : (life < 0.65 ? '#ff9a2a' : '#e8423a');
        flame(ctx, x + Math.sin(life * 6 + p.ph * 9) * s * 0.4 * S.m, y, s, col, 0.75 * S.e * (1 - life));
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // 口寄せ（鳥）: 煙のぽんから小鳥がらせんに飛び立つ
  E['summon-birds'] = {
    bg: ['#4a2a4a', '#160c18'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 12); i++) S.p.push({ a: S.rnd() * TAU, t0: 0.12 + S.rnd() * 0.3, sp: 0.8 + S.rnd() * 0.5, col: ['#ffffff', '#f7c9dc', '#d2669e', '#fbe3ec'][i % 4], ph: S.rnd() * 6 }); },
    draw: function (ctx, S, t, front) {
      if (front) puff(ctx, S.cx, S.fy - S.P * 0.1, S.P * 0.32 * eob(seg(t, 0.05, 0.25)), 0.9 * (1 - seg(t, 0.25, 0.45)));
      S.p.forEach(function (p) {
        var u = seg(t, p.t0, 1); if (u <= 0) return;
        var a = p.a + u * 3.2 * p.sp * S.m, d = S.R * 1.05 * eob(u);
        var x = S.cx + Math.cos(a) * d, y = S.fy - S.P * 0.4 - u * S.R * 0.55 + Math.sin(a) * d * 0.35;
        if ((Math.sin(a) > 0) !== front) return;
        bird(ctx, x, y, S.P * 0.06, Math.sin(S.ms / 90 * S.m + p.ph), p.col, S.e * (1 - seg(u, 0.85, 1)), Math.cos(a + 1.5) > 0 ? 1 : -1);
      });
    }
  };

  // 変わり身: ぽん → 真ん中に丸太、相棒は横に → ぽん → もどる
  function log(ctx, x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12); ctx.globalAlpha = a;
    ctx.fillStyle = '#a8733f'; ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-s * 0.32, -s * 0.9, s * 0.64, s * 1.8, s * 0.3) : ctx.rect(-s * 0.32, -s * 0.9, s * 0.64, s * 1.8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8c48a'; ctx.beginPath(); ctx.ellipse(0, -s * 0.9, s * 0.32, s * 0.12, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#b08850'; ctx.beginPath(); ctx.ellipse(0, -s * 0.9, s * 0.16, s * 0.06, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#7a5230'; ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.5); ctx.lineTo(-s * 0.12, s * 0.2); ctx.moveTo(s * 0.12, -s * 0.2); ctx.lineTo(s * 0.15, s * 0.6); ctx.stroke();
    ctx.fillStyle = '#5b8a3a'; ctx.beginPath(); ctx.ellipse(s * 0.34, -s * 0.2, s * 0.14, s * 0.06, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  E.swap = {
    bg: ['#2e4a30', '#0e180f'],
    init: function (S) { S.side = Math.min(S.R * 0.75, S.w / 2 - S.PW * 0.45); S.p = []; for (var i = 0; i < N(S, 10); i++) S.p.push({ x: (S.rnd() - 0.5) * 2, ph: S.rnd(), s: 0.6 + S.rnd() * 0.6 }); },
    who: function (S, t) {
      if (t < 0.2) return { a: 1 };
      if (t < 0.62) return { a: sm(seg(t, 0.24, 0.34)), dx: S.side, dy: -S.P * 0.06 * Math.sin(seg(t, 0.24, 0.62) * Math.PI), s: 0.8 };
      return { a: sm(seg(t, 0.66, 0.76)) };
    },
    draw: function (ctx, S, t, front) {
      if (!front) {
        var la = sm(seg(t, 0.22, 0.28)) * (1 - sm(seg(t, 0.6, 0.66)));
        if (la > 0) log(ctx, S.cx, S.fy - S.P * 0.4, S.P * 0.5, la);
        S.p.forEach(function (p) { var u = (t * 1.4 + p.ph) % 1; leaf(ctx, S.cx + p.x * S.R * 0.6 + Math.sin(u * 8) * 10 * S.m, S.fy - S.P - S.R * 0.2 + u * (S.P + S.R * 0.3), S.P * 0.035 * p.s, u * 6 * S.m, '#6fa64a', la * 0.9); });
        return;
      }
      puff(ctx, S.cx, S.fy - S.P * 0.45, S.P * 0.42 * eob(seg(t, 0.16, 0.26)), 0.95 * (1 - seg(t, 0.26, 0.42)));
      puff(ctx, S.cx + S.side, S.fy - S.P * 0.5, S.P * 0.3 * eob(seg(t, 0.2, 0.3)), 0.85 * (1 - seg(t, 0.3, 0.44)));
      puff(ctx, S.cx, S.fy - S.P * 0.45, S.P * 0.42 * eob(seg(t, 0.6, 0.7)), 0.95 * (1 - seg(t, 0.7, 0.86)));
    }
  };

  // 水遁: 足もとの波の輪と、相棒をめぐる水の帯、しぶき
  E.water = {
    bg: ['#1a4f78', '#06182c'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 40); i++) S.p.push({ a: i / N(S, 40) * TAU, h: S.rnd(), s: 0.6 + S.rnd() * 0.6 }); S.q = []; for (i = 0; i < N(S, 14); i++) S.q.push({ a: S.rnd() * TAU, t0: S.rnd() * 0.6, v: 0.6 + S.rnd() * 0.5 }); },
    draw: function (ctx, S, t, front) {
      if (!front) for (var k = 0; k < 3; k++) { var u = (t * 1.2 + k / 3) % 1; ring(ctx, S.cx, S.fy, S.R * u, S.R * u * 0.3, '#8fd3ff', Math.max(2, S.P * 0.012), S.e * (1 - u) * 0.8); }
      var rot = S.ms / 1000 * 1.6 * S.m;
      S.p.forEach(function (p) {
        var a = p.a + rot, r = S.R * 0.62 * (0.7 + 0.3 * sm(t * 3));
        var o = orbit(S, a, r, 0.15 + 0.5 * ((p.a / TAU + t * 0.6) % 1));
        if (o.front !== front) return;
        disc(ctx, o.x, o.y, S.P * 0.028 * p.s, '#3aa0e8', 0.85 * S.e); disc(ctx, o.x - 2, o.y - 2, S.P * 0.01 * p.s, '#e8f8ff', 0.9 * S.e);
      });
      if (front) S.q.forEach(function (q) {
        var u = seg(t, q.t0, q.t0 + 0.5); if (u <= 0 || u >= 1) return;
        var x = S.cx + Math.cos(q.a) * S.R * 0.9 * u, y = S.fy - S.P * 0.1 - Math.sin(u * Math.PI) * S.R * 0.5 * q.v;
        disc(ctx, x, y, S.P * 0.018, '#bfe8ff', S.e * (1 - u));
      });
    }
  };

  // 金遁: 金と銀のかけらがめぐり、きらりと光る
  E.metal = {
    bg: ['#4a4f58', '#16181c'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 14); i++) S.p.push({ a: i / N(S, 14) * TAU, gold: i % 2 === 0, lift: 0.25 + S.rnd() * 0.5, sp: S.rnd() * 6 }); },
    draw: function (ctx, S, t, front) {
      if (!front) { var u = seg(t, 0.1, 0.55); ring(ctx, S.cx, S.fy - S.P * 0.4, S.R * eob(u), S.R * eob(u), '#f3d56a', Math.max(2, S.P * 0.02), S.e * (1 - u) * 0.8); }
      var rot = S.ms / 1000 * 1.1 * S.m;
      S.p.forEach(function (p) {
        var o = orbit(S, p.a + rot, S.R * 0.7 * eob(seg(t, 0, 0.3)), p.lift);
        if (o.front !== front) return;
        var s = S.P * 0.05;
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(p.a + rot * 2); ctx.globalAlpha = S.e;
        var g = ctx.createLinearGradient(-s, -s, s, s); g.addColorStop(0, p.gold ? '#fff2b0' : '#ffffff'); g.addColorStop(0.5, p.gold ? '#d8b04a' : '#a8aeb8'); g.addColorStop(1, p.gold ? '#8a6a1e' : '#5a5f68');
        ctx.fillStyle = g; ctx.strokeStyle = '#2b1d16'; ctx.lineWidth = Math.max(1, s * 0.08);
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        var tw = Math.max(0, Math.sin(S.ms / 260 + p.sp)); if (front && tw > 0.85) sparkle(ctx, o.x + s * 0.5, o.y - s * 0.6, s * 0.7, '#ffffff', S.e * (tw - 0.85) * 6);
      });
    }
  };

  // 口寄せ（兎）: ぽんから兎がぴょんぴょん
  E['summon-bunny'] = {
    bg: ['#5a2a44', '#1a0c14'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 8); i++) S.p.push({ dir: i % 2 ? 1 : -1, d: 0.35 + S.rnd() * 0.75, t0: 0.15 + S.rnd() * 0.25, z: S.rnd() * 2 - 1, hop: 2 + Math.floor(S.rnd() * 3) }); },
    draw: function (ctx, S, t, front) {
      if (front) puff(ctx, S.cx, S.fy - S.P * 0.1, S.P * 0.34 * eob(seg(t, 0.05, 0.22)), 0.9 * (1 - seg(t, 0.22, 0.4)));
      S.p.forEach(function (p) {
        if ((p.z > 0) !== front) return;
        var u = seg(t, p.t0, Math.min(1, p.t0 + 0.6)); if (u <= 0) return;
        var x = S.cx + p.dir * S.R * p.d * eob(u), y = S.fy + p.z * S.P * 0.12 - Math.abs(Math.sin(u * Math.PI * p.hop)) * S.P * 0.16 * S.m;
        bunny(ctx, x, y, S.P * 0.09 * (1 + p.z * 0.15), S.e);
      });
    }
  };

  // 毒霧 → やさしい紫のもや
  E.mist = {
    bg: ['#3e2a4e', '#120a18'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 22); i++) S.p.push({ a: S.rnd() * TAU, r: S.rnd(), s: 0.5 + S.rnd() * 0.7, dr: (S.rnd() - 0.5) * 0.6, col: ['#b58ae0', '#d6b8f0', '#9a7ac8'][i % 3] }); },
    draw: function (ctx, S, t, front) {
      S.p.forEach(function (p, i) {
        if ((i % 3 === 0) !== front) return;
        var r = S.R * (0.2 + p.r * 0.85) * (0.5 + 0.5 * eob(t * 1.5));
        var a = p.a + p.dr * S.ms / 1000 * S.m;
        glow(ctx, S.cx + Math.cos(a) * r, S.fy - S.P * 0.35 + Math.sin(a) * r * 0.55, S.P * 0.32 * p.s * (0.6 + 0.4 * S.k / 1.5), p.col, (front ? 0.22 : 0.38) * S.e);
      });
    }
  };

  // 影分身: 相棒の分身がぽんと出て、横に並び、またもどる
  E.clone = {
    bg: ['#30344a', '#0d0f18'],
    init: function (S) { var n = Math.max(2, Math.min(6, 2 * Math.round(1 + S.rank / 2))); if (S.reduced) n = 2; S.n = n; },
    draw: function (ctx, S, t, front) {
      // 分身は奥に向かって左右に並ぶ（せまい画面では小さく、上に重ねる）
      var n = S.n, rows = Math.ceil(n / 2);
      var order = []; for (var i = n - 1; i >= 0; i--) order.push(i); // 奥から描く
      order.forEach(function (i) {
        var side = i % 2 ? 1 : -1, k = Math.floor(i / 2) + 1;
        var sc = 0.86 - 0.12 * (k - 1);
        var span = Math.min(S.R * k / rows, S.w / 2 - S.PW * sc * 0.42);
        var t0 = 0.1 + (k - 1) * 0.06;
        var u = eob(seg(t, t0, t0 + 0.2)) * (1 - sm(seg(t, 0.8, 0.92)));
        var x = S.cx + side * span * u, by = S.fy - S.P * 0.07 * k;
        if (!front && u > 0 && S.img) {
          ctx.globalAlpha = (0.9 - 0.12 * k) * Math.min(1, u * 2) * S.e;
          var w = S.PW * sc, h = S.P * sc; ctx.drawImage(S.img, x - w / 2, by - h, w, h); ctx.globalAlpha = 1;
        }
        if (front) {
          puff(ctx, S.cx + side * span, by - S.P * sc * 0.4, S.P * 0.2 * eob(seg(t, t0 + 0.12, t0 + 0.2)), 0.8 * (1 - seg(t, t0 + 0.2, t0 + 0.3)));
          puff(ctx, S.cx + side * span * 0.4, by - S.P * sc * 0.4, S.P * 0.18 * eob(seg(t, 0.84, 0.9)), 0.75 * (1 - seg(t, 0.9, 1)));
        }
      });
    }
  };

  // 影縫い: 足もとの影がのびて、団子の串で地面に縫いとめる（人には当てない）
  function dango(ctx, x, y, s, rot, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a;
    ctx.strokeStyle = '#b58a52'; ctx.lineWidth = Math.max(1.5, s * 0.12); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, s * 0.6); ctx.lineTo(0, -s * 2.4); ctx.stroke();
    ['#86c46a', '#f5f2ea', '#f4a6c0'].forEach(function (c, i) { ctx.fillStyle = c; ctx.strokeStyle = '#6a4a3a'; ctx.lineWidth = Math.max(1, s * 0.07); ctx.beginPath(); ctx.arc(0, -s * (0.5 + i * 0.62), s * 0.36, 0, TAU); ctx.fill(); ctx.stroke(); });
    ctx.restore();
  }
  E.shadowstitch = {
    bg: ['#2c4a2c', '#0b160b'],
    init: function (S) { S.p = []; var n = Math.min(8, N(S, 6)); for (var i = 0; i < n; i++) S.p.push({ a: (i + 0.5) / n * TAU + S.rnd() * 0.3, l: 0.6 + S.rnd() * 0.4 }); },
    draw: function (ctx, S, t, front) {
      var grow = eob(seg(t, 0.08, 0.4));
      if (!front) {
        S.p.forEach(function (p) {
          var L = S.R * p.l * grow, ex = S.cx + Math.cos(p.a) * L, ey = S.fy + Math.sin(p.a) * L * 0.32;
          ctx.globalAlpha = 0.55 * S.e; ctx.fillStyle = '#141018';
          ctx.beginPath(); ctx.moveTo(S.cx + Math.cos(p.a + 1.4) * S.P * 0.1, S.fy + Math.sin(p.a + 1.4) * S.P * 0.03);
          ctx.quadraticCurveTo((S.cx + ex) / 2 + Math.sin(S.ms / 300 + p.a) * 6 * S.m, (S.fy + ey) / 2, ex, ey);
          ctx.lineTo(S.cx + Math.cos(p.a - 1.4) * S.P * 0.1, S.fy + Math.sin(p.a - 1.4) * S.P * 0.03); ctx.fill(); ctx.globalAlpha = 1;
          var st = seg(t, 0.45, 0.7);
          if (st > 0) { ctx.setLineDash([6, 6]); ring(ctx, ex, ey, S.P * 0.05 * st, S.P * 0.02 * st, '#f5e6a8', 2, S.e * 0.9); ctx.setLineDash([]); }
        });
        ctx.globalAlpha = 0.55 * S.e; ctx.fillStyle = '#141018'; ctx.beginPath(); ctx.ellipse(S.cx, S.fy, S.P * 0.2, S.P * 0.05, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        return;
      }
      S.p.forEach(function (p, i) {
        var L = S.R * p.l * grow, ex = S.cx + Math.cos(p.a) * L, ey = S.fy + Math.sin(p.a) * L * 0.32;
        var u = eob(seg(t, 0.35 + i * 0.03, 0.5 + i * 0.03)); if (u <= 0) return;
        var sx = ex + Math.cos(p.a) * S.R * 0.6, sy = ey - S.R * 0.9;
        dango(ctx, lerp(sx, ex, u), lerp(sy, ey, u), S.P * 0.045, Math.cos(p.a) * 0.4, S.e);
      });
    }
  };

  // 閃光: 1回だけのやわらかい光（明滅させない）と、光の筋が1本ゆっくり横切る
  E.flash = {
    bg: ['#3a2228', '#100a0c'],
    draw: function (ctx, S, t, front) {
      if (!front) { glow(ctx, S.cx, S.fy - S.P * 0.5, S.R * (0.5 + 0.6 * eob(seg(t, 0.15, 0.5))), '#fff4e0', 0.5 * env(t, 0.15, 0.4, 0.55, 0.9)); return; }
      var u = sm(seg(t, 0.25, 0.6)), y = S.fy - S.P * 0.55, x0 = S.cx - S.R, x1 = S.cx + S.R;
      if (u > 0) {
        var g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(255,90,58,0)'); g.addColorStop(Math.max(0.01, u - 0.15), 'rgba(255,170,120,0.0)'); g.addColorStop(Math.max(0.02, u), 'rgba(255,230,200,0.9)'); g.addColorStop(Math.min(1, u + 0.01), 'rgba(255,90,58,0)');
        ctx.globalAlpha = (1 - sm(seg(t, 0.62, 0.85))) * S.e; ctx.strokeStyle = g; ctx.lineWidth = Math.max(3, S.P * 0.03); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y + S.P * 0.12); ctx.quadraticCurveTo(S.cx, y - S.P * 0.1, x1, y + S.P * 0.02); ctx.stroke(); ctx.globalAlpha = 1;
      }
      // 画面全体のやわらかい光（1回だけ。ふくらんで、しぼむ）
      var fa = 0.28 * env(t, 0.3, 0.45, 0.5, 0.8) * Math.min(1, S.k);
      if (fa > 0) { ctx.fillStyle = 'rgba(255,248,236,' + fa.toFixed(3) + ')'; ctx.fillRect(0, 0, S.w, S.h); }
    }
  };

  // 毒手裏剣 → 花の手裏剣: 花の形の手裏剣が回りながら外へ、最後に花がひらく
  function flowerStar(ctx, x, y, s, rot, a, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = a;
    for (var i = 0; i < 5; i++) { ctx.rotate(TAU / 5); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.3, s * 0.55, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#e0b32a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, TAU); ctx.fill(); ctx.restore();
  }
  E['shuriken-flower'] = {
    bg: ['#4a2236', '#160a10'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 10); i++) S.p.push({ a: i / N(S, 10) * TAU + S.rnd() * 0.3, t0: S.rnd() * 0.2, col: i % 2 ? '#e86a96' : '#c2185b' }); },
    draw: function (ctx, S, t, front) {
      S.p.forEach(function (p) {
        var u = eob(seg(t, 0.1 + p.t0, 0.6 + p.t0));
        var o = orbit(S, p.a + u * 1.2 * S.m, S.R * 0.85 * u, 0.45);
        if (o.front !== front || u <= 0) return;
        var bloom = sm(seg(t, 0.62 + p.t0, 0.8 + p.t0));
        flowerStar(ctx, o.x, o.y, S.P * (0.045 + 0.03 * bloom), S.ms / 1000 * 9 * S.m * (1 - bloom), S.e, p.col);
        for (var j = 1; j < 4; j++) petal(ctx, lerp(S.cx, o.x, 1 - j * 0.12), lerp(S.fy - S.P * 0.45, o.y, 1 - j * 0.12), S.P * 0.015, j + p.a, '#f7b8cc', S.e * 0.5 * (1 - bloom));
      });
    }
  };

  // 逢魔刻: 夕暮れの空、沈む夕日、ほたるのような光
  E.dusk = {
    bg: ['#d06a3a', '#2a1440'],
    scene: true,
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 16); i++) S.p.push({ x: S.rnd() * 2 - 1, y: S.rnd(), ph: S.rnd() * 6 }); },
    draw: function (ctx, S, t, front) {
      if (!front) {
        var u = sm(seg(t, 0, 0.35)) * S.e;
        var g = ctx.createLinearGradient(0, S.fy - S.R, 0, S.fy);
        g.addColorStop(0, rgba('#3a2260', 0.85 * u)); g.addColorStop(0.6, rgba('#c0506a', 0.75 * u)); g.addColorStop(1, rgba('#f5a04a', 0.85 * u));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(S.cx, S.fy - S.P * 0.3, S.R, 0, TAU); ctx.fill();
        var sy = S.fy - S.P * 0.55 + seg(t, 0.1, 1) * S.P * 0.4;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, S.w, S.fy); ctx.clip();
        glow(ctx, S.cx + S.P * 0.35, sy, S.P * 0.5, '#ffd27a', 0.6 * u); disc(ctx, S.cx + S.P * 0.35, sy, S.P * 0.16, '#ffb24a', u);
        ctx.restore();
        ctx.globalAlpha = 0.85 * u; ctx.fillStyle = '#2a1a2e'; ctx.beginPath(); ctx.moveTo(S.cx - S.R, S.fy);
        for (var i = 0; i <= 12; i++) { var xx = S.cx - S.R + i * S.R / 6; ctx.lineTo(xx, S.fy - S.P * (0.06 + 0.05 * Math.abs(Math.sin(i * 1.7)))); }
        ctx.lineTo(S.cx + S.R, S.fy + S.P * 0.05); ctx.lineTo(S.cx - S.R, S.fy + S.P * 0.05); ctx.fill(); ctx.globalAlpha = 1;
        return;
      }
      S.p.forEach(function (p) {
        var x = S.cx + p.x * S.R * 0.85 + Math.sin(S.ms / 700 + p.ph) * 10 * S.m, y = S.fy - p.y * S.R * 0.8 - Math.cos(S.ms / 900 + p.ph) * 8 * S.m;
        glow(ctx, x, y, S.P * 0.04, '#ffe27a', 0.8 * S.e * (0.5 + 0.5 * Math.sin(S.ms / 500 + p.ph)) * sm(seg(t, 0.2, 0.4)));
      });
    }
  };

  // 鷹の目: 鷹が大きく弧を描いて飛び、羽が舞い、目の輪がめぐる
  function hawk(ctx, x, y, s, flap, a, dir) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.globalAlpha = a;
    ctx.fillStyle = '#8a5a32'; ctx.strokeStyle = '#2b1d16'; ctx.lineWidth = Math.max(1.2, s * 0.05);
    var w = flap;
    ctx.beginPath(); ctx.moveTo(-s * 0.2, 0); ctx.quadraticCurveTo(-s * 0.9, -s * 0.6 * w, -s * 1.5, -s * 0.2 * w); ctx.quadraticCurveTo(-s * 0.9, s * 0.1, -s * 0.2, s * 0.2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.2, 0); ctx.quadraticCurveTo(s * 0.9, -s * 0.6 * w, s * 1.5, -s * 0.2 * w); ctx.quadraticCurveTo(s * 0.9, s * 0.1, s * 0.2, s * 0.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9a6a3e'; ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.32, s * 0.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 0.36, -s * 0.06, s * 0.16, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f5c518'; ctx.beginPath(); ctx.arc(s * 0.4, -s * 0.09, s * 0.05, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e3b23c'; ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.06); ctx.lineTo(s * 0.62, 0); ctx.lineTo(s * 0.5, s * 0.02); ctx.fill();
    ctx.restore();
  }
  E.hawk = {
    bg: ['#2e3c5a', '#0b101c'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 8); i++) S.p.push({ x: S.rnd() * 2 - 1, t0: 0.3 + S.rnd() * 0.4, ph: S.rnd() * 6 }); },
    draw: function (ctx, S, t, front) {
      if (!front) {
        var rot = S.ms / 1000 * 0.8 * S.m, rr = S.R * 0.55 * eob(seg(t, 0.05, 0.35));
        ctx.setLineDash([S.P * 0.06, S.P * 0.04]); ctx.lineDashOffset = -rot * 40;
        ring(ctx, S.cx, S.fy - S.P * 0.5, rr, rr, '#f5c518', Math.max(2, S.P * 0.012), 0.7 * S.e); ctx.setLineDash([]);
        ring(ctx, S.cx, S.fy - S.P * 0.5, rr * 0.82, rr * 0.82, '#a8adb5', Math.max(1, S.P * 0.006), 0.5 * S.e);
        return;
      }
      var u = seg(t, 0.12, 0.9), ang = Math.PI * (1.1 - u * 1.2);
      var x = S.cx + Math.cos(ang) * S.R * 0.95, y = S.fy - S.P * 0.6 - Math.sin(ang) * S.R * 0.45;
      if (u > 0 && u < 1) hawk(ctx, x, y, S.P * 0.14 * (0.8 + 0.4 * Math.sin(u * Math.PI)), 0.4 + 0.6 * Math.abs(Math.sin(S.ms / 120 * S.m)), S.e * Math.min(1, u * 8) * Math.min(1, (1 - u) * 8), 1);
      S.p.forEach(function (p) { var v = seg(t, p.t0, 1); if (v <= 0) return; leaf(ctx, S.cx + p.x * S.R * 0.7 + Math.sin(v * 7 + p.ph) * 12 * S.m, S.fy - S.R * 0.6 + v * S.R * 0.7, S.P * 0.025, Math.sin(v * 5 + p.ph), '#c8a070', S.e * (1 - v)); });
    }
  };

  // 狐火: 青白い火の玉がゆらゆらとめぐる
  E.foxfire = {
    bg: ['#22284e', '#080a1c'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 9); i++) S.p.push({ a: i / N(S, 9) * TAU, lift: 0.2 + S.rnd() * 0.6, ph: S.rnd() * 6 }); },
    draw: function (ctx, S, t, front) {
      var rot = S.ms / 1000 * 0.9 * S.m;
      ctx.globalCompositeOperation = 'lighter';
      S.p.forEach(function (p) {
        var o = orbit(S, p.a + rot, S.R * 0.62 * eob(seg(t, 0, 0.3)), p.lift + Math.sin(S.ms / 500 + p.ph) * 0.05 * S.m);
        if (o.front !== front) return;
        var s = S.P * 0.06 * (1 + 0.1 * Math.sin(S.ms / 160 + p.ph));
        glow(ctx, o.x, o.y, s * 2.6, '#8fe0ff', 0.4 * S.e);
        flame(ctx, o.x, o.y, s, '#bfefff', 0.8 * S.e); flame(ctx, o.x, o.y + s * 0.2, s * 0.55, '#ffffff', 0.9 * S.e);
      });
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // 幻術 → 渦: ゆっくり回る紫の渦
  E.illusion = {
    bg: ['#3a2450', '#0a0610'],
    draw: function (ctx, S, t, front) {
      if (front) return;
      var arms = S.reduced ? 3 : 5, rot = S.ms / 1000 * 1.4 * S.m, R = S.R * eob(seg(t, 0, 0.4));
      ctx.lineCap = 'round';
      for (var a = 0; a < arms; a++) {
        ctx.beginPath();
        for (var i = 0; i <= 60; i++) { var u = i / 60, r = R * u, an = a / arms * TAU + rot + u * 4.2; var x = S.cx + Math.cos(an) * r, y = S.fy - S.P * 0.45 + Math.sin(an) * r * 0.8; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.globalAlpha = 0.55 * S.e; ctx.strokeStyle = a % 2 ? '#9b6ad8' : '#5a3a8e'; ctx.lineWidth = Math.max(3, S.P * 0.04); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      glow(ctx, S.cx, S.fy - S.P * 0.45, S.P * 0.4, '#d6b8f0', 0.35 * S.e);
    }
  };

  // 桜吹雪
  E.sakura = {
    bg: ['#5a2a40', '#1a0a14'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 60); i++) S.p.push({ a: S.rnd() * TAU, r: 0.2 + S.rnd() * 0.85, lift: S.rnd(), sp: 0.5 + S.rnd(), rot: S.rnd() * 6, s: 0.6 + S.rnd() * 0.6 }); },
    draw: function (ctx, S, t, front) {
      S.p.forEach(function (p) {
        var a = p.a + S.ms / 1000 * 1.3 * p.sp * S.m;
        var o = orbit(S, a, S.R * p.r * eob(seg(t, 0, 0.35)), p.lift * 1.1 - 0.05 + Math.sin(a * 2) * 0.05);
        if (o.front !== front) return;
        sakuraPetal(ctx, o.x, o.y, S.P * 0.028 * p.s, p.rot + S.ms / 400 * S.m * p.sp, S.e * 0.95);
      });
    }
  };

  // 風遁: 弧を描く風の筋と、くるくる舞う葉
  E.wind = {
    bg: ['#23404a', '#0a1618'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 12); i++) S.p.push({ y: S.rnd(), ph: S.rnd(), l: 0.4 + S.rnd() * 0.5, dir: i % 3 ? 1 : -1 }); S.q = []; for (i = 0; i < N(S, 10); i++) S.q.push({ a: S.rnd() * TAU, lift: S.rnd(), s: 0.6 + S.rnd() * 0.6 }); },
    draw: function (ctx, S, t, front) {
      ctx.lineCap = 'round';
      S.p.forEach(function (p, i) {
        if ((i % 2 === 0) !== front) return;
        var u = (t * 1.3 * (0.6 + 0.4 * S.m) + p.ph) % 1;
        var y = S.fy - p.y * S.R * 0.9, x = S.cx + p.dir * (u * 2.4 - 1.2) * S.R, L = S.R * p.l;
        ctx.globalAlpha = 0.7 * S.e * Math.sin(u * Math.PI); ctx.strokeStyle = '#e8f4f0'; ctx.lineWidth = Math.max(2, S.P * 0.012);
        ctx.beginPath(); ctx.moveTo(x - p.dir * L, y); ctx.quadraticCurveTo(x, y - S.P * 0.06, x + p.dir * L * 0.2, y - S.P * 0.12); ctx.arc(x + p.dir * L * 0.2, y - S.P * 0.18, S.P * 0.06, Math.PI / 2, p.dir > 0 ? -Math.PI : 2 * Math.PI, p.dir < 0); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      S.q.forEach(function (q) {
        var o = orbit(S, q.a + S.ms / 1000 * 2 * S.m, S.R * 0.6 * eob(seg(t, 0, 0.3)), q.lift);
        if (o.front !== front) return;
        leaf(ctx, o.x, o.y, S.P * 0.035 * q.s, S.ms / 200 * S.m + q.a, '#7ac25a', S.e);
      });
    }
  };

  // ひみつの術: 共通のきらきらだけ
  E.secret = {
    bg: ['#3a3450', '#100e18'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 22); i++) S.p.push({ a: S.rnd() * TAU, r: 0.25 + S.rnd() * 0.75, lift: S.rnd(), ph: S.rnd() * 6, col: i % 3 ? '#fff6c8' : '#ffffff' }); },
    draw: function (ctx, S, t, front) {
      S.p.forEach(function (p) {
        var o = orbit(S, p.a + S.ms / 1000 * 0.5 * S.m, S.R * p.r * eob(seg(t, 0, 0.4)), p.lift);
        if (o.front !== front) return;
        var tw = 0.5 + 0.5 * Math.sin(S.ms / 380 + p.ph);
        sparkle(ctx, o.x, o.y, S.P * 0.035 * (0.6 + 0.6 * tw), p.col, S.e * (0.4 + 0.6 * tw), 0);
      });
    }
  };

  // 涅槃: 後ろに大きな光の輪、ゆっくり回る光の帯、のぼる光の粒
  E.halo = {
    bg: ['#5a4a26', '#16120a'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 18); i++) S.p.push({ x: S.rnd() * 2 - 1, ph: S.rnd() }); },
    draw: function (ctx, S, t, front) {
      var hy = S.fy - S.P * 0.72;
      if (!front) {
        var rays = 12, rot = S.ms / 1000 * 0.25 * S.m, rr = S.R * eob(seg(t, 0, 0.45));
        ctx.globalAlpha = 0.18 * S.e; ctx.fillStyle = '#fff2b0';
        for (var i = 0; i < rays; i++) { var a = rot + i / rays * TAU; ctx.beginPath(); ctx.moveTo(S.cx, hy); ctx.arc(S.cx, hy, rr * 1.2, a, a + TAU / rays / 2); ctx.closePath(); ctx.fill(); }
        ctx.globalAlpha = 1;
        var hr = S.P * 0.42 * (0.8 + 0.2 * eob(seg(t, 0, 0.4)));
        ring(ctx, S.cx, hy, hr, hr, '#fff6c8', S.P * 0.06, 0.6 * S.e); ring(ctx, S.cx, hy, hr, hr, '#f3d56a', S.P * 0.018, 0.95 * S.e);
        return;
      }
      S.p.forEach(function (p) { var u = (t * 0.8 + p.ph) % 1; glow(ctx, S.cx + p.x * S.R * 0.8, S.fy - u * S.R * 1.1, S.P * 0.03, '#ffe9a0', S.e * Math.sin(u * Math.PI)); });
    }
  };

  // 口寄せ（白蛇）: ぽんから白い蛇が相棒のまわりをするりと一周（目はやさしい黒）
  E['summon-snake'] = {
    bg: ['#2a4a32', '#0a160e'],
    draw: function (ctx, S, t, front) {
      if (front) puff(ctx, S.cx - S.R * 0.55, S.fy, S.P * 0.3 * eob(seg(t, 0.04, 0.2)), 0.9 * (1 - seg(t, 0.2, 0.36)));
      var head = seg(t, 0.12, 0.92) * TAU * 1.1 * (0.7 + 0.3 * S.m) + Math.PI;
      var len = 2.2, segs = 34, rx = S.R * 0.62, ry = S.P * 0.16, w = S.P * 0.055;
      var pts = [];
      for (var i = 0; i <= segs; i++) { var a = head - i / segs * len; pts.push({ x: S.cx + Math.cos(a) * rx, y: S.fy - S.P * 0.12 + Math.sin(a) * ry - Math.sin(i / segs * 9 + S.ms / 200 * S.m) * S.P * 0.012, f: Math.sin(a) > 0, w: w * (1 - i / segs * 0.75) }); }
      var a0 = sm(seg(t, 0.12, 0.22)) * S.e;
      for (i = segs; i > 0; i--) {
        var p = pts[i], q = pts[i - 1]; if (p.f !== front) continue;
        ctx.globalAlpha = a0; ctx.lineCap = 'round';
        ctx.strokeStyle = '#a9a6a0'; ctx.lineWidth = p.w * 2 + 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      for (i = segs; i > 0; i--) { p = pts[i]; q = pts[i - 1]; if (p.f !== front) continue; ctx.strokeStyle = '#f6f4ee'; ctx.lineWidth = p.w * 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      var hd = pts[0];
      if (hd.f === front) {
        ctx.fillStyle = '#f6f4ee'; ctx.strokeStyle = '#a9a6a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(hd.x, hd.y, w * 1.5, w * 1.15, 0, 0, TAU); ctx.fill(); ctx.stroke();
        disc(ctx, hd.x - w * 0.5, hd.y - w * 0.3, w * 0.22, '#2a1e1a', a0); disc(ctx, hd.x + w * 0.5, hd.y - w * 0.3, w * 0.22, '#2a1e1a', a0);
        disc(ctx, hd.x - w * 0.8, hd.y + w * 0.2, w * 0.2, '#f7a8c4', a0 * 0.8); disc(ctx, hd.x + w * 0.8, hd.y + w * 0.2, w * 0.2, '#f7a8c4', a0 * 0.8);
      }
      ctx.globalAlpha = 1;
    }
  };

  // 祝詞: 音符がふわふわのぼり、音の輪がひろがる
  E.notes = {
    bg: ['#4a2228', '#140a0c'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 16); i++) S.p.push({ x: S.rnd() * 2 - 1, ph: S.rnd(), two: S.rnd() < 0.4, col: ['#ffffff', '#f4a6a0', '#ede7dd', '#ffd27a'][i % 4] }); },
    draw: function (ctx, S, t, front) {
      if (!front) { for (var k = 0; k < 3; k++) { var u = (t * 1.1 + k / 3) % 1; ctx.beginPath(); ctx.globalAlpha = 0.5 * S.e * (1 - u); ctx.strokeStyle = '#f4d0c8'; ctx.lineWidth = Math.max(2, S.P * 0.012); ctx.arc(S.cx, S.fy - S.P * 0.5, S.R * u, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke(); } ctx.globalAlpha = 1; return; }
      S.p.forEach(function (p) {
        var u = (t * 0.9 + p.ph) % 1;
        var x = S.cx + p.x * S.R * 0.8 + Math.sin(u * 6 + p.ph * 6) * S.P * 0.06 * S.m, y = S.fy - S.P * 0.2 - u * S.R * 0.9;
        noteMark(ctx, x, y, S.P * 0.05, p.col, S.e * Math.sin(u * Math.PI) * sm(seg(t, 0.05, 0.2)), p.two);
      });
    }
  };

  // 領域 → 赤い輪: 足もとから赤い輪がひろがる（こわくしない）
  E.domain = {
    bg: ['#4a1a20', '#140608'],
    draw: function (ctx, S, t, front) {
      if (front) return;
      var rot = S.ms / 1000 * 0.6 * S.m;
      for (var k = 0; k < 4; k++) {
        var u = c01((t * 1.0 + k / 4) % 1), rr = S.R * u;
        ring(ctx, S.cx, S.fy, rr, rr * 0.36, '#e8423a', Math.max(2, S.P * 0.016), S.e * (1 - u) * 0.85);
      }
      var R0 = S.P * 0.55 * eob(seg(t, 0, 0.3));
      ctx.setLineDash([S.P * 0.05, S.P * 0.03]); ctx.lineDashOffset = -rot * 50;
      ring(ctx, S.cx, S.fy, R0, R0 * 0.36, '#ff7a6a', Math.max(2, S.P * 0.012), 0.9 * S.e); ctx.setLineDash([]);
      glow(ctx, S.cx, S.fy, R0, '#c8202b', 0.3 * S.e);
    }
  };

  // 忍びいろは: 虹色の文字が空へ舞う
  var IROHA = 'いろはにほへとちりぬるをわかよたれそつねならむ';
  E['rainbow-letters'] = {
    bg: ['#30285a', '#0c0a18'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 14); i++) S.p.push({ ch: IROHA[i % IROHA.length], col: RAINBOW[i % RAINBOW.length], a: -Math.PI / 2 + (S.rnd() - 0.5) * 2.4, t0: S.rnd() * 0.45, v: 0.7 + S.rnd() * 0.4 }); },
    draw: function (ctx, S, t, front) {
      if (!front) return;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      S.p.forEach(function (p) {
        var u = seg(t, p.t0, p.t0 + 0.55); if (u <= 0) return;
        var d = S.R * p.v * eob(u), x = S.cx + Math.cos(p.a) * d + Math.sin(u * 6) * S.P * 0.04 * S.m, y = S.fy - S.P * 0.6 + Math.sin(p.a) * d * 0.9;
        var sz = Math.round(S.P * 0.09 * (0.8 + 0.4 * Math.sin(u * Math.PI)));
        ctx.font = '900 ' + sz + 'px ' + FONT;
        ctx.globalAlpha = S.e * Math.min(1, (1 - u) * 4); ctx.lineWidth = Math.max(2, sz * 0.14); ctx.strokeStyle = '#ffffff'; ctx.strokeText(p.ch, x, y);
        ctx.fillStyle = p.col; ctx.fillText(p.ch, x, y);
      });
      ctx.globalAlpha = 1;
    }
  };

  // 動植綵絵: 絵の具がぽたぽた広がり、筆の線がのびる
  E.paint = {
    bg: ['#4a3058', '#140c18'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 12); i++) S.p.push({ a: S.rnd() * TAU, r: 0.35 + S.rnd() * 0.65, t0: S.rnd() * 0.5, col: RAINBOW[i % RAINBOW.length], seed: S.rnd() * 9 }); },
    draw: function (ctx, S, t, front) {
      if (!front) {
        S.p.forEach(function (p) {
          var u = eob(seg(t, p.t0, p.t0 + 0.25)); if (u <= 0) return;
          var x = S.cx + Math.cos(p.a) * S.R * p.r, y = S.fy - S.P * 0.45 + Math.sin(p.a) * S.R * p.r * 0.75, r = S.P * 0.07 * u;
          ctx.globalAlpha = 0.9 * S.e; ctx.fillStyle = p.col; ctx.beginPath();
          for (var i = 0; i < 14; i++) { var an = i / 14 * TAU, rr = r * (0.8 + 0.3 * Math.sin(p.seed + i * 2.3)); ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
          ctx.fill(); disc(ctx, x + r * 1.3, y + r * 0.6, r * 0.25, p.col, 0.9 * S.e); disc(ctx, x - r * 1.1, y - r * 0.9, r * 0.18, p.col, 0.9 * S.e);
        });
        ctx.globalAlpha = 1; return;
      }
      ctx.lineCap = 'round';
      for (var k = 0; k < 3; k++) {
        var u = seg(t, 0.1 + k * 0.12, 0.5 + k * 0.12); if (u <= 0) continue;
        ctx.globalAlpha = 0.85 * S.e; ctx.strokeStyle = RAINBOW[(k * 2) % 6]; ctx.lineWidth = Math.max(3, S.P * 0.025);
        ctx.beginPath(); var R = S.R * (0.55 + k * 0.15);
        ctx.arc(S.cx, S.fy - S.P * 0.45, R, Math.PI * (0.9 + k * 0.4), Math.PI * (0.9 + k * 0.4) + u * Math.PI * 0.8); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  };

  // 雷遁: 雲から1本だけ稲妻（相棒には当てない）と、1回だけのやわらかい光
  E.thunder = {
    bg: ['#2a3050', '#07080f'],
    init: function (S) { S.bolt = []; var x = S.cx + S.R * 0.45, y = S.fy - S.R * 1.0; for (var i = 0; i <= 6; i++) { S.bolt.push({ x: x + (i % 2 ? 1 : -1) * S.P * 0.06 * (S.rnd() + 0.5), y: lerp(y, S.fy, i / 6) }); } S.p = []; for (i = 0; i < N(S, 10); i++) S.p.push({ a: i / N(S, 10) * TAU, lift: 0.2 + S.rnd() * 0.6 }); },
    draw: function (ctx, S, t, front) {
      var cy = S.fy - S.R * 1.0;
      if (!front) {
        ctx.save(); ctx.globalAlpha = 0.9 * sm(seg(t, 0, 0.2)) * S.e;
        [[-0.3, 0, 0.3], [0, -0.06, 0.36], [0.3, 0, 0.3], [0.55, 0.03, 0.22], [-0.55, 0.03, 0.22]].forEach(function (c) { disc(ctx, S.cx + S.R * 0.45 + c[0] * S.R * 0.6, cy + c[1] * S.R, c[2] * S.R * 0.4, '#5a5f78', 1); });
        ctx.restore();
        var b = env(t, 0.32, 0.36, 0.5, 0.78);
        if (b > 0) {
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.globalAlpha = b * S.e; ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = Math.max(6, S.P * 0.04); ctx.beginPath(); S.bolt.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2, S.P * 0.015); ctx.stroke(); ctx.globalAlpha = 1;
          glow(ctx, S.bolt[6].x, S.fy, S.P * 0.35, '#fff3a0', 0.5 * b * S.e);
        }
        return;
      }
      S.p.forEach(function (p) {
        var o = orbit(S, p.a + S.ms / 1000 * 1.2 * S.m, S.R * 0.5, p.lift);
        if (o.front !== front) return;
        sparkle(ctx, o.x, o.y, S.P * 0.03, '#2fbfb2', 0.85 * S.e * sm(seg(t, 0.1, 0.3)), 0.4);
      });
      var fa = 0.22 * env(t, 0.34, 0.42, 0.46, 0.75) * Math.min(1, S.k);
      if (fa > 0) { ctx.fillStyle = 'rgba(255,252,230,' + fa.toFixed(3) + ')'; ctx.fillRect(0, 0, S.w, S.h); }
    }
  };

  // 口寄せ（パンダ）: ぽんから大きなパンダのリーリーが後ろにあらわれる
  function panda(ctx, x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.strokeStyle = '#2b1d16'; ctx.lineWidth = Math.max(2, s * 0.03);
    ctx.fillStyle = '#26262b'; [[-0.62, -0.62], [0.62, -0.62]].forEach(function (e) { ctx.beginPath(); ctx.arc(e[0] * s, e[1] * s, s * 0.26, 0, TAU); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.9, s * 0.78, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#26262b'; [[-0.34, -0.05, 0.4], [0.34, -0.05, -0.4]].forEach(function (e) { ctx.beginPath(); ctx.ellipse(e[0] * s, e[1] * s, s * 0.2, s * 0.27, e[2], 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#ffffff'; [[-0.3, -0.08], [0.3, -0.08]].forEach(function (e) { ctx.beginPath(); ctx.arc(e[0] * s, e[1] * s, s * 0.07, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#26262b'; ctx.beginPath(); ctx.ellipse(0, s * 0.2, s * 0.1, s * 0.07, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.34); ctx.quadraticCurveTo(0, s * 0.44, s * 0.12, s * 0.34); ctx.stroke();
    ctx.fillStyle = '#f7a8c4'; ctx.globalAlpha = a * 0.6; ctx.beginPath(); ctx.arc(-s * 0.55, s * 0.25, s * 0.1, 0, TAU); ctx.arc(s * 0.55, s * 0.25, s * 0.1, 0, TAU); ctx.fill();
    ctx.restore();
  }
  E['summon-panda'] = {
    bg: ['#2e4a2e', '#0b160b'],
    draw: function (ctx, S, t, front) {
      if (front) { puff(ctx, S.cx, S.fy - S.P * 0.7, S.P * 0.5 * eob(seg(t, 0.06, 0.24)), 0.9 * (1 - seg(t, 0.24, 0.42))); return; }
      var g = eob(seg(t, 0.18, 0.5)), size = Math.min(S.w * 0.42, S.cy, Math.max(S.P * 0.4, S.R * 0.5));
      if (g > 0) panda(ctx, S.cx, S.fy - S.P * 0.95 - size * 0.55 * g + Math.sin(S.ms / 400) * 3 * S.m, size * g, S.e);
    }
  };

  // 巨人の一撃 → 影が大きくなるだけ（後ろの影がふくらみ、地面がゆれずに波紋がひろがる）
  E.giant = {
    bg: ['#2a2a4a', '#0a0a16'],
    draw: function (ctx, S, t, front) {
      if (front) return;
      var g = eob(seg(t, 0.08, 0.7)), sc = 1 + g * Math.max(0.3, (S.R / S.P) * 1.1 - 0.4);
      if (S.shadowImg) {
        var w = S.PW * sc, h = S.P * sc;
        if (S.rimImg) { ctx.globalAlpha = 0.45 * S.e; ctx.drawImage(S.rimImg, S.cx - w * 0.52, S.fy - h * 1.02, w * 1.04, h * 1.02); }
        ctx.globalAlpha = 0.7 * S.e; ctx.drawImage(S.shadowImg, S.cx - w / 2, S.fy - h, w, h); ctx.globalAlpha = 1;
      }
      for (var k = 0; k < 2; k++) { var u = seg(t, 0.5 + k * 0.12, 1); ring(ctx, S.cx, S.fy, S.R * u, S.R * u * 0.25, '#a8b4e8', Math.max(2, S.P * 0.01), S.e * (1 - u) * 0.7); }
    }
  };

  // 野アザミ: 紫のアザミの花がつぎつぎに咲く
  function thistle(ctx, x, y, s, grow, a) {
    if (grow <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a; ctx.lineCap = 'round';
    var h = s * 2.2 * eob(grow);
    ctx.strokeStyle = '#4f8a3a'; ctx.lineWidth = Math.max(2, s * 0.14); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.15, -h * 0.5, 0, -h); ctx.stroke();
    leaf(ctx, -s * 0.3, -h * 0.35, s * 0.35, -0.5, '#5b9a3a', a); leaf(ctx, s * 0.3, -h * 0.55, s * 0.32, 0.5 + Math.PI, '#5b9a3a', a);
    var b = sm(seg(grow, 0.5, 1));
    if (b > 0) {
      ctx.fillStyle = '#6a9a4a'; ctx.beginPath(); ctx.ellipse(0, -h + s * 0.1, s * 0.3, s * 0.28, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c04ab0'; ctx.lineWidth = Math.max(1.5, s * 0.08);
      for (var i = 0; i < 11; i++) { var an = -Math.PI / 2 + (i - 5) * 0.2; ctx.beginPath(); ctx.moveTo(0, -h - s * 0.05); ctx.lineTo(Math.cos(an) * s * 0.7 * b, -h - s * 0.05 + Math.sin(an) * s * 0.7 * b); ctx.stroke(); }
      ctx.strokeStyle = '#e88ad8'; for (i = 0; i < 7; i++) { an = -Math.PI / 2 + (i - 3) * 0.22; ctx.beginPath(); ctx.moveTo(0, -h - s * 0.05); ctx.lineTo(Math.cos(an) * s * 0.5 * b, -h - s * 0.05 + Math.sin(an) * s * 0.5 * b); ctx.stroke(); }
    }
    ctx.restore();
  }
  E.thistle = {
    bg: ['#3a2a4a', '#100a16'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 9); i++) S.p.push({ x: (i / Math.max(1, N(S, 9) - 1)) * 2 - 1, z: S.rnd() * 2 - 1, t0: S.rnd() * 0.4, s: 0.7 + S.rnd() * 0.5 }); },
    draw: function (ctx, S, t, front) {
      S.p.forEach(function (p) {
        if ((p.z > 0) !== front) return;
        if (Math.abs(p.x) < 0.22 && front) return;
        thistle(ctx, S.cx + p.x * S.R, S.fy + p.z * S.P * 0.08, S.P * 0.1 * p.s, seg(t, p.t0, p.t0 + 0.4), S.e);
      });
      if (front) for (var i = 0; i < Math.round(8 * S.k); i++) { var u = (t * 0.8 + i / 8) % 1; sparkle(ctx, S.cx + Math.sin(i * 2.4) * S.R * 0.8, S.fy - u * S.R, S.P * 0.02, '#f0c8f0', S.e * Math.sin(u * Math.PI), 0); }
    }
  };

  // 猫の目の選択: 大きな猫の目がゆっくり開き、光の道が分かれて、ひとつが明るくなる
  E.cateye = {
    bg: ['#203060', '#070a16'],
    init: function (S) { S.p = []; var n = Math.min(5, Math.max(3, Math.round(3 * S.k))); for (var i = 0; i < n; i++) S.p.push({ a: -Math.PI / 2 + (i - (n - 1) / 2) * 0.55 }); S.pick = Math.floor(S.rnd() * n); },
    draw: function (ctx, S, t, front) {
      if (!front) {
        // 後ろの空に、やさしい猫の顔の形の光（耳と、ゆっくり開く2つの目）
        var open = sm(seg(t, 0.08, 0.35)), fw = Math.min(S.R * 0.8, S.w * 0.36, S.cy * 0.7), fx0 = S.cx, fy0 = Math.max(fw * 0.9, S.cy - S.P * 0.5 - fw * 0.35);
        ctx.save(); ctx.globalAlpha = 0.5 * S.e * sm(seg(t, 0, 0.2)); ctx.fillStyle = '#2c63d6';
        ctx.beginPath(); ctx.moveTo(fx0 - fw, fy0 + fw * 0.1); ctx.lineTo(fx0 - fw * 0.9, fy0 - fw * 0.85); ctx.lineTo(fx0 - fw * 0.4, fy0 - fw * 0.5);
        ctx.quadraticCurveTo(fx0, fy0 - fw * 0.62, fx0 + fw * 0.4, fy0 - fw * 0.5); ctx.lineTo(fx0 + fw * 0.9, fy0 - fw * 0.85); ctx.lineTo(fx0 + fw, fy0 + fw * 0.1);
        ctx.quadraticCurveTo(fx0 + fw, fy0 + fw * 0.7, fx0, fy0 + fw * 0.72); ctx.quadraticCurveTo(fx0 - fw, fy0 + fw * 0.7, fx0 - fw, fy0 + fw * 0.1); ctx.fill();
        ctx.restore();
        if (open > 0) [-1, 1].forEach(function (sd) {
          var ex = fx0 + sd * fw * 0.42, ey = fy0, ew = fw * 0.28, eh = ew * 0.75 * open;
          ctx.save(); ctx.globalAlpha = S.e; ctx.beginPath(); ctx.ellipse(ex, ey, ew, Math.max(0.5, eh), 0, 0, TAU); ctx.clip();
          var g = ctx.createRadialGradient(ex, ey, 0, ex, ey, ew); g.addColorStop(0, '#d8f59a'); g.addColorStop(1, '#5ab84a');
          ctx.fillStyle = g; ctx.fillRect(ex - ew, ey - ew, ew * 2, ew * 2);
          ctx.fillStyle = '#1a1830'; ctx.beginPath(); ctx.ellipse(ex, ey, ew * 0.18, ew * 0.66, 0, 0, TAU); ctx.fill();
          disc(ctx, ex - ew * 0.3, ey - ew * 0.3, ew * 0.18, '#ffffff', 0.95); disc(ctx, ex + ew * 0.25, ey + ew * 0.3, ew * 0.08, '#ffffff', 0.8);
          ctx.restore();
        });
        return;
      }
      var gr = eob(seg(t, 0.35, 0.75));
      S.p.forEach(function (p, i) {
        var L = S.R * 0.9 * gr, x0 = S.cx, y0 = S.fy - S.P * 0.2;
        var chosen = i === S.pick, lit = chosen ? sm(seg(t, 0.72, 0.85)) : 0;
        ctx.globalAlpha = S.e * (chosen ? 0.6 + 0.4 * lit : 0.55 - 0.3 * sm(seg(t, 0.72, 0.85)));
        ctx.strokeStyle = chosen && lit > 0 ? '#fff3a0' : '#8fb8ff'; ctx.lineWidth = Math.max(2, S.P * (chosen ? 0.012 + 0.012 * lit : 0.01)); ctx.lineCap = 'round';
        var tx = x0 + Math.cos(p.a + Math.PI / 2) * L, ty = y0 + Math.sin(p.a + Math.PI / 2) * L * 0.25 + S.P * 0.12;
        ctx.beginPath(); ctx.moveTo(x0, S.fy); ctx.quadraticCurveTo((x0 + tx) / 2, S.fy + S.P * 0.04, tx, ty); ctx.stroke(); ctx.globalAlpha = 1;
        if (gr > 0.6) sparkle(ctx, tx, ty, S.P * (0.03 + 0.04 * lit), chosen ? '#fff3a0' : '#cfe0ff', S.e, 0);
      });
    }
  };

  // 糸脈: 色の糸が相棒の手からのびて、光の点をつないでいく
  E.threads = {
    bg: ['#4a3a26', '#120e0a'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 10); i++) S.p.push({ a: S.rnd() * TAU, r: 0.4 + S.rnd() * 0.6, col: ['#e8901f', '#6f9a52', '#f7efe0', '#ce5a1d'][i % 4], t0: S.rnd() * 0.3 }); },
    draw: function (ctx, S, t, front) {
      var hx = S.cx, hy = S.fy - S.P * 0.45;
      var pts = S.p.map(function (p) { return { x: S.cx + Math.cos(p.a + Math.sin(S.ms / 900) * 0.1 * S.m) * S.R * p.r, y: hy + Math.sin(p.a) * S.R * p.r * 0.7, p: p }; });
      if (!front) {
        ctx.lineCap = 'round';
        pts.forEach(function (q, i) {
          var u = eob(seg(t, 0.1 + q.p.t0, 0.5 + q.p.t0)); if (u <= 0) return;
          ctx.globalAlpha = 0.9 * S.e; ctx.strokeStyle = q.p.col; ctx.lineWidth = Math.max(2.5, S.P * 0.016);
          var mx = (hx + q.x) / 2 + Math.sin(S.ms / 500 + i) * S.P * 0.05 * S.m, my = (hy + q.y) / 2 - S.P * 0.1;
          ctx.beginPath(); ctx.moveTo(hx, hy);
          var ex = lerp(hx, q.x, u), ey = lerp(hy, q.y, u); ctx.quadraticCurveTo(lerp(hx, mx, u), lerp(hy, my, u), ex, ey); ctx.stroke();
          var nx = pts[(i + 1) % pts.length], w = sm(seg(t, 0.55, 0.85));
          if (w > 0) { ctx.globalAlpha = 0.6 * S.e; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(lerp(q.x, nx.x, w), lerp(q.y, nx.y, w)); ctx.stroke(); }
        });
        ctx.globalAlpha = 1; return;
      }
      pts.forEach(function (q) { var u = sm(seg(t, 0.4 + q.p.t0, 0.55 + q.p.t0)); if (u > 0) { glow(ctx, q.x, q.y, S.P * 0.05, q.p.col, 0.7 * u * S.e); disc(ctx, q.x, q.y, S.P * 0.014, '#ffffff', u * S.e); } });
    }
  };

  // 無刀取り: まわりから飛んでくる木の葉を、相棒がしずかに受けとめる（宙で止まって輪になり、ふわりと落ちる）
  E.catch = {
    bg: ['#3a3226', '#0e0c09'],
    init: function (S) { S.p = []; for (var i = 0; i < N(S, 10); i++) S.p.push({ a: i / N(S, 10) * TAU, from: 1.6 + S.rnd() * 0.6, rot: S.rnd() * 6, col: ['#d8622a', '#e8a03a', '#c8402a'][i % 3] }); },
    draw: function (ctx, S, t, front) {
      var hy = S.fy - S.P * 0.5;
      if (!front) { var u0 = seg(t, 0.42, 0.9); ring(ctx, S.cx, S.fy, S.R * 0.9 * u0, S.R * 0.9 * u0 * 0.3, '#e8dcc0', Math.max(1.5, S.P * 0.008), S.e * (1 - u0) * 0.8); }
      S.p.forEach(function (p) {
        var come = eob(seg(t, 0.05, 0.42)), fall = sm(seg(t, 0.7, 1));
        var r = S.R * lerp(p.from, 0.5, come), a = p.a + (1 - come) * 0.6 + S.ms / 1000 * 0.3 * S.m * (1 - fall);
        var x = S.cx + Math.cos(a) * r, y = hy + Math.sin(a) * r * 0.5 + fall * S.P * 0.5;
        if ((Math.sin(a) > 0) !== front) return;
        maple(ctx, x, y, S.P * 0.04, p.rot + (1 - come) * 8 * S.m, p.col, S.e);
      });
    }
  };

  // 根の国: 地面から根がのびて、先に紫と金のつぼみが咲く
  E.roots = {
    bg: ['#2e2238', '#0a070c'],
    init: function (S) {
      S.p = [];
      var n = N(S, 7);
      for (var i = 0; i < n; i++) {
        var dir = (i / Math.max(1, n - 1)) * 2 - 1, pts = [{ x: S.cx + dir * S.P * 0.15, y: S.fy }], x = pts[0].x, y = S.fy;
        for (var j = 1; j <= 8; j++) { x += dir * S.R * 0.11 + (S.rnd() - 0.5) * S.P * 0.08; y += -S.R * 0.07 * (0.6 + S.rnd() * 0.6) + S.P * 0.02; pts.push({ x: x, y: y }); }
        S.p.push({ pts: pts, t0: S.rnd() * 0.2, col: i % 2 ? '#7a3ea6' : '#d8a63a' });
      }
    },
    draw: function (ctx, S, t, front) {
      S.p.forEach(function (r, i) {
        var u = eob(seg(t, 0.05 + r.t0, 0.6 + r.t0)); if (u <= 0) return;
        var n = (r.pts.length - 1) * u, k = Math.floor(n);
        if (!front) {
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 0.95 * S.e; ctx.strokeStyle = '#2b1d16'; ctx.lineWidth = Math.max(5, S.P * 0.04);
          var path = function () { ctx.beginPath(); ctx.moveTo(r.pts[0].x, r.pts[0].y); for (var j = 1; j <= k; j++) ctx.lineTo(r.pts[j].x, r.pts[j].y); if (k < r.pts.length - 1) ctx.lineTo(lerp(r.pts[k].x, r.pts[k + 1].x, n - k), lerp(r.pts[k].y, r.pts[k + 1].y, n - k)); };
          path(); ctx.stroke(); ctx.strokeStyle = '#9a7458'; ctx.lineWidth = Math.max(3, S.P * 0.025);
          ctx.beginPath(); ctx.moveTo(r.pts[0].x, r.pts[0].y);
          for (var j = 1; j <= k; j++) ctx.lineTo(r.pts[j].x, r.pts[j].y);
          if (k < r.pts.length - 1) ctx.lineTo(lerp(r.pts[k].x, r.pts[k + 1].x, n - k), lerp(r.pts[k].y, r.pts[k + 1].y, n - k));
          ctx.stroke(); ctx.globalAlpha = 1; return;
        }
        var tip = r.pts[r.pts.length - 1], b = sm(seg(t, 0.55 + r.t0, 0.8 + r.t0));
        if (b > 0) { glow(ctx, tip.x, tip.y, S.P * 0.09 * b, r.col, 0.6 * S.e); flowerStar(ctx, tip.x, tip.y, S.P * 0.04 * b, i, S.e, r.col); }
      });
    }
  };

  /* ---------------- 再生 ---------------- */
  var TYPES = Object.keys(E);
  var BASE_BG = ['#2b3350', '#11141f'];

  function reducedMotion() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function mixHex(a, b, t) {
    var A1 = parseInt(a.slice(1), 16), B1 = parseInt(b.slice(1), 16);
    var r = Math.round(lerp(A1 >> 16 & 255, B1 >> 16 & 255, t)), g = Math.round(lerp(A1 >> 8 & 255, B1 >> 8 & 255, t)), bl = Math.round(lerp(A1 & 255, B1 & 255, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  /* SA.FX.play(canvas, { charId, fx, rank, okugi, secret, kidsMode, onDone, duration }) -> { skip(), done: Promise }
   * canvas の表示の大きさ（CSS）に devicePixelRatio をかけて描く。onDone({ skipped }) は1回だけ呼ぶ。 */
  function play(canvas, opts) {
    opts = opts || {};
    var DATA = SA.DATA;
    var DUR = opts.duration || (DATA && DATA.CONFIG && DATA.CONFIG.JUTSU_MS) || 3000;
    var ctx = canvas.getContext('2d');
    var name = opts.secret ? 'secret' : (E[opts.fx] ? opts.fx : 'secret');
    var fx = E[name];
    var rank = Math.max(0, Math.min(5, opts.rank | 0)), okugi = Math.max(0, Math.min(2, opts.okugi | 0));
    var reduced = opts.reducedMotion != null ? !!opts.reducedMotion : reducedMotion();
    var S = { rank: rank, okugi: okugi, reduced: reduced, kids: !!opts.kidsMode, rnd: mulberry(hash((opts.charId || '') + ':' + name)), ms: 0, e: 0 };
    var cssW = 0, cssH = 0, dpr = 1;
    var finished = false, raf = 0, start = 0, resolveDone;
    var done = new Promise(function (res) { resolveDone = res; });

    function layout() {
      var r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
      var w = Math.round(r.width) || canvas.clientWidth || canvas.width || 360, h = Math.round(r.height) || canvas.clientHeight || canvas.height || 640;
      var d = Math.min(3, root.devicePixelRatio || 1);
      if (w === cssW && h === cssH && d === dpr && canvas.width === Math.round(w * d)) return false;
      cssW = w; cssH = h; dpr = d;
      canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
      S.w = w; S.h = h;
      S.P = Math.min(h * 0.4, w * 0.62 * 1.2); S.PW = S.P * 200 / 240;
      S.cx = w / 2; S.fy = h * 0.56 + S.P * 0.47; S.cy = S.fy - S.P / 2;
      var D = Math.hypot(w, h) / 2;
      var reach = [0.55 * S.P, 0.6 * S.P, 0.9 * S.P, Math.max(1.1 * S.P, 0.55 * D), Math.max(1.3 * S.P, D), Math.max(1.3 * S.P, D)];
      var count = [0.45, 0.5, 0.75, 1.0, 1.3, 1.5];
      S.R = reach[rank]; S.k = count[rank] * (reduced ? 0.4 : 1); S.m = reduced ? 0.4 : 1;
      S.rnd = mulberry(hash((opts.charId || '') + ':' + name));
      if (fx.init) fx.init(S);
      return true;
    }
    layout();

    // 相棒の絵（しんけん → 最後にうれしい）、奥義の金の縁取り、巨人の影
    var imgs = {};
    function want(key, o) {
      if (!opts.charId || !SA.Fig || !SA.Fig.bitmap) return;
      SA.Fig.bitmap(opts.charId, o, Math.round(S.P * Math.min(dpr, 2))).then(function (b) { imgs[key] = b; if (key === 'serious') S.img = b; if (key === 'shadow') S.shadowImg = b; if (key === 'rim') S.rimImg = b; }, function () { });
    }
    var figBase = { weapon: !!opts.weapon, dye: opts.dye || 'none' };
    want('serious', Object.assign({ state: 'serious', fx: false }, figBase));
    want('happy', Object.assign({ state: 'happy' }, figBase));
    var silBase = { silhouette: true, q: false, shadow: false, weapon: figBase.weapon };
    if (okugi) { want('gold', Object.assign({ state: 'serious', color: '#e8c04a' }, silBase)); want('goldHappy', Object.assign({ state: 'happy', color: '#e8c04a' }, silBase)); }
    if (name === 'giant') { want('shadow', Object.assign({ state: 'serious', color: '#0b0a18' }, silBase)); want('rim', Object.assign({ state: 'serious', color: '#8a88d8' }, silBase)); }

    function drawBg(t) {
      var bg = BASE_BG;
      if (rank >= 5 && fx.bg) { var u = sm(seg(t, 0.02, 0.3)); bg = [mixHex(BASE_BG[0], fx.bg[0], u), mixHex(BASE_BG[1], fx.bg[1], u)]; }
      var g = ctx.createRadialGradient(S.cx, S.cy, 0, S.cx, S.cy, Math.hypot(S.w, S.h) * 0.6);
      g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, S.w, S.h);
      // 術の床（うすい金の輪）
      ring(ctx, S.cx, S.fy, S.P * 0.42, S.P * 0.09, '#e8c04a', Math.max(1.5, S.P * 0.008), 0.35);
      if (rank >= 5) { // 免許皆伝: 背景に大きな光の輪
        var u2 = sm(seg(t, 0.05, 0.4));
        ring(ctx, S.cx, S.cy, Math.hypot(S.w, S.h) * 0.42 * u2, Math.hypot(S.w, S.h) * 0.42 * u2, '#fff2c0', Math.max(2, S.P * 0.01), 0.25 * u2);
      }
    }
    function drawPartner(t, who) {
      var a = (who.a == null ? 1 : who.a), s = who.s || 1;
      var intro = sm(seg(t, 0, 0.1)); a *= intro; s *= lerp(0.92, 1, intro);
      if (a <= 0) return;
      var bob = reduced ? 0 : Math.sin(S.ms / 420) * S.P * 0.008;
      var w = S.PW * s, h = S.P * s, x = S.cx + (who.dx || 0) - w / 2, y = S.fy + (who.dy || 0) - h + bob;
      var happy = sm(seg(t, 0.8, 0.88));
      // 奥義: 残像
      if (okugi && imgs.serious) {
        var n = okugi * 2;
        for (var i = 1; i <= n; i++) {
          var side = i % 2 ? 1 : -1, off = Math.ceil(i / 2) * S.PW * 0.16 * (0.6 + 0.4 * Math.sin(S.ms / 300 + i)) * (reduced ? 0.5 : 1);
          ctx.globalAlpha = a * 0.22 / Math.ceil(i / 2) * S.e; ctx.drawImage(imgs.serious, x + side * off, y, w, h);
        }
        ctx.globalAlpha = 1;
      }
      // 奥義: 金の縁取り
      if (okugi && imgs.gold) {
        var gs = 1 + 0.035 * okugi, gw = w * gs, gh = h * gs, ga = a * (0.75 + 0.15 * Math.sin(S.ms / 500));
        ctx.save(); ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = S.P * 0.04 * okugi * dpr;
        var hg = imgs.goldHappy ? happy : 0;
        if (hg < 1) { ctx.globalAlpha = ga * (1 - hg); ctx.drawImage(imgs.gold, x - (gw - w) / 2, y - (gh - h) * 0.6, gw, gh); }
        if (hg > 0) { ctx.globalAlpha = ga * hg; ctx.drawImage(imgs.goldHappy, x - (gw - w) / 2, y - (gh - h) * 0.6, gw, gh); }
        ctx.restore();
      }
      if (imgs.serious) { ctx.globalAlpha = a * (1 - (imgs.happy ? happy : 0)); ctx.drawImage(imgs.serious, x, y, w, h); }
      if (imgs.happy && happy > 0) { ctx.globalAlpha = a * happy; ctx.drawImage(imgs.happy, x, y, w, h); }
      if (!imgs.serious && !imgs.happy) { // 絵がまだのとき: 影だけ
        ctx.globalAlpha = 0.25 * a; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(S.cx, S.fy, S.P * 0.18, S.P * 0.04, 0, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function frame(now) {
      if (finished) return;
      if (!start) start = now;
      var el = now - start, t = c01(el / DUR);
      if (layout()) { /* 大きさが変わったら置き直した */ }
      S.ms = el; S.e = env(t, 0, 0.1, 0.86, 1) * (rank <= 1 ? 0.85 : 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]);
      drawBg(t);
      var clip = fx.scene && rank < 4;
      try {
        ctx.save(); if (clip) { ctx.beginPath(); ctx.arc(S.cx, S.fy - S.P * 0.4, S.R, 0, TAU); ctx.clip(); }
        fx.draw(ctx, S, t, false); ctx.restore();
        resetCtx();
        drawPartner(t, fx.who ? fx.who(S, t) : {});
        resetCtx();
        ctx.save(); fx.draw(ctx, S, t, true); ctx.restore();
        resetCtx();
      } catch (err) {
        resetCtx();
        if (root.console) console.warn('SA.FX', name, err);
      }
      if (t >= 1) { finish(false); return; }
      raf = requestFrame(frame);
    }
    function resetCtx() { ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setLineDash([]); ctx.shadowBlur = 0; }
    function requestFrame(f) { return root.requestAnimationFrame ? root.requestAnimationFrame(f) : setTimeout(function () { f(Date.now()); }, 16); }
    function cancelFrame(id) { if (root.cancelAnimationFrame) root.cancelAnimationFrame(id); else clearTimeout(id); }
    function finish(skipped) {
      if (finished) return;
      finished = true;
      if (raf) cancelFrame(raf);
      var res = { skipped: skipped, fx: name };
      try { if (typeof opts.onDone === 'function') opts.onDone(res); } finally { resolveDone(res); }
    }
    raf = requestFrame(frame);
    return { skip: function () { finish(true); }, done: done, fx: name };
  }

  SA.FX = { play: play, TYPES: TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = SA.FX;
})(typeof window !== 'undefined' ? window : globalThis);
