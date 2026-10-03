/* ニンジャからくり工房 — 試験データのルール（画面に依存しない。サーバーへ移しても同じ判定ができる）
 *
 *  ・形をそろえる（normalize）：知らない項目・部品は捨てる／値の範囲を確かめる
 *  ・内容のハッシュ（contentHash）：部品の並び順やIDの付け方に左右されない
 *  ・検証（validate）：構造（上限・範囲・重なり・支え・つながり）＋経路の近似検査
 *  ・提案（AI／定型）の検査（checkProposal）：知らない部品・範囲外・コードらしき文字は受け付けない
 *  ・定型の提案（suggest）と、攻略の記録からの改善のヒント（improveHints）
 *  ・試験コード／攻略メモのコード（友だちと交換する文字列。検査して、合わないものは読み込まない）
 */
(function (root) {
  'use strict';
  var D = root.KK_DATA || (typeof require !== 'undefined' ? require('./data.js') : null);
  var E = root.KK_ENGINE || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var GW = D.GRID.W, GH = D.GRID.H, L = D.LIMIT, PARTS = D.PARTS;

  /* ================= 小道具 ================= */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  var ID_RE = /^[a-z0-9]{1,8}$/;
  function rid(prefix, n) {
    var s = '', abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < (n || 10); i++) s += abc[Math.floor(Math.random() * abc.length)];
    return (prefix || '') + s;
  }
  function nextPartId(level) {
    var used = {}, i = 1;
    (level.parts || []).forEach(function (p) { used[p.id] = 1; });
    while (used['p' + i]) i++;
    return 'p' + i;
  }

  // SHA-256（同期。内容のハッシュ用）
  function sha256(str) {
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var bytes = utf8(str), l = bytes.length, bl = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(bl), i, j;
    m.set(bytes); m[l] = 0x80;
    var bits = l * 8; m[bl - 4] = (bits >>> 24) & 255; m[bl - 3] = (bits >>> 16) & 255; m[bl - 2] = (bits >>> 8) & 255; m[bl - 1] = bits & 255;
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array(64);
    for (i = 0; i < bl; i += 64) {
      for (j = 0; j < 16; j++) w[j] = (m[i + j * 4] << 24) | (m[i + j * 4 + 1] << 16) | (m[i + j * 4 + 2] << 8) | m[i + j * 4 + 3];
      for (j = 16; j < 64; j++) {
        var a0 = w[j - 15], a1 = w[j - 2];
        var s0 = ((a0 >>> 7) | (a0 << 25)) ^ ((a0 >>> 18) | (a0 << 14)) ^ (a0 >>> 3);
        var s1 = ((a1 >>> 17) | (a1 << 15)) ^ ((a1 >>> 19) | (a1 << 13)) ^ (a1 >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (j = 0; j < 64; j++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[j] + w[j]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }
  function utf8(str) {
    var out = [], i, c;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00); }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function crc32(bytes) {
    var c, crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) { c = (crc ^ bytes[i]) & 255; for (var k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /* ================= 形をそろえる ================= */
  var FIELDS = {
    start: [], goal: [], check: [], 'switch': [],
    floor: ['len', 'dir', 'skin'], mover: ['x2', 'y2', 'speed'], pit: ['len'], trap: ['rate', 'dir'], door: ['color'],
    water: ['len'], refill: ['count', 'jutsu'], deco: ['kind', 'dir']
  };
  // 部品1つを、決まった項目だけのきれいな形にする（知らない部品は null）
  function cleanPart(p) {
    if (!p || typeof p !== 'object' || !FIELDS.hasOwnProperty(p.part_id)) return null;
    var o = { id: typeof p.id === 'string' ? p.id : '', part_id: p.part_id, x: p.x, y: p.y };
    FIELDS[p.part_id].forEach(function (k) { if (p[k] !== undefined) o[k] = p[k]; });
    var spec = PARTS[p.part_id].params;
    for (var k in spec) {
      if (o[k] === undefined) { var sp = spec[k]; o[k] = typeof sp[0] === 'string' ? sp[0] : sp[2]; }
    }
    if (p.part_id === 'refill') o.jutsu = 'mizu';
    if (p.part_id === 'mover') { if (o.x2 === undefined) o.x2 = o.x; if (o.y2 === undefined) o.y2 = o.y; }
    return o;
  }
  // 試験データ（LevelVersion の中身）をきれいにする。知らない項目・任意の文字列は入れない
  function normalize(lv) {
    lv = lv || {};
    var out = {
      schema_version: D.VERSION.schema,
      rules_version: D.VERSION.rules,
      theme: D.THEMES[lv.theme] ? lv.theme : 'chikurin',
      title: cleanTitle(lv.title),
      parts: [],
      connections: []
    };
    var dropped = 0;
    (Array.isArray(lv.parts) ? lv.parts : []).forEach(function (p) { var c = cleanPart(p); if (c) out.parts.push(c); else dropped++; });
    (Array.isArray(lv.connections) ? lv.connections : []).forEach(function (c) {
      if (c && typeof c.from === 'string' && typeof c.to === 'string') out.connections.push({ from: c.from, to: c.to });
    });
    out._dropped = dropped;
    return out;
  }
  function cleanTitle(t) {
    var W = D.TITLE_WORDS; t = t || {};
    function pick(v, arr) { return isInt(v) && v >= 0 && v < arr.length ? v : 0; }
    return { a: pick(t.a, W.a), b: pick(t.b, W.b), c: pick(t.c, W.c) };
  }
  function titleText(t) { var W = D.TITLE_WORDS; t = cleanTitle(t); return W.a[t.a] + W.b[t.b] + 'の' + W.c[t.c]; }
  function signText(sg) {
    var W = D.SIGN_WORDS; sg = sg || {};
    var a = isInt(sg.a) && sg.a >= 0 && sg.a < W.a.length ? sg.a : 0, b = isInt(sg.b) && sg.b >= 0 && sg.b < W.b.length ? sg.b : 0, c = isInt(sg.c) && sg.c >= 0 && sg.c < W.c.length ? sg.c : 0;
    return W.a[a] + W.b[b] + W.c[c];
  }

  /* ================= 内容のハッシュ ================= */
  var ORDER = { start: 0, goal: 1, floor: 2, mover: 3, pit: 4, trap: 5, door: 6, 'switch': 7, water: 8, refill: 9, check: 10, deco: 11 };
  function partKey(p) { return [ORDER[p.part_id], p.y, p.x].concat(FIELDS[p.part_id].map(function (k) { return p[k]; })); }
  function cmpKey(a, b) { for (var i = 0; i < Math.max(a.length, b.length); i++) { if (a[i] === b[i]) continue; return a[i] < b[i] ? -1 : 1; } return 0; }
  // 部品の並び順と ID の付け方に左右されない文字列
  function canonical(lv) {
    var parts = (lv.parts || []).map(function (p, i) { return { p: p, k: partKey(p), i: i }; });
    parts.sort(function (a, b) { return cmpKey(a.k, b.k); });
    var idx = {};
    parts.forEach(function (e, n) { idx[e.p.id] = n; });
    var conns = (lv.connections || []).map(function (c) { return [idx[c.from] == null ? -1 : idx[c.from], idx[c.to] == null ? -1 : idx[c.to]]; });
    conns.sort(cmpKey);
    return JSON.stringify({ s: lv.schema_version || D.VERSION.schema, r: lv.rules_version || D.VERSION.rules, t: lv.theme, n: [lv.title && lv.title.a, lv.title && lv.title.b, lv.title && lv.title.c], p: parts.map(function (e) { return e.k; }), c: conns });
  }
  function contentHash(lv) { return sha256(canonical(lv)).slice(0, 24); }

  /* ================= 部品が使うマス ================= */
  function moverSwept(p) { // 移動足場が通るマス（3×1 の箱の軌跡）
    var cells = {}, dx = p.x2 - p.x, dy = p.y2 - p.y, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4));
    for (var i = 0; i <= n; i++) {
      var x = p.x + dx * i / n, y = p.y + dy * i / n;
      for (var cx = Math.floor(x + 1e-6); cx <= Math.floor(x + D.PHYS.moverW - 1e-6); cx++) for (var cy = Math.floor(y + 1e-6); cy <= Math.floor(y + 1 - 1e-6); cy++) cells[cx + ',' + cy] = [cx, cy];
    }
    return Object.keys(cells).map(function (k) { return cells[k]; });
  }
  function cellsOf(p) {
    var out = [], i;
    switch (p.part_id) {
      case 'floor': for (i = 0; i < p.len; i++) out.push(p.dir === 'v' ? [p.x, p.y + i] : [p.x + i, p.y]); break;
      case 'pit': case 'water': for (i = 0; i < p.len; i++) out.push([p.x + i, p.y]); break;
      case 'door': case 'start': case 'goal': case 'check': out.push([p.x, p.y], [p.x, p.y + 1]); break;
      case 'mover': return moverSwept(p);
      default: out.push([p.x, p.y]);
    }
    return out;
  }
  // 部品がそのマスに「見えて」いるか（エディターで触った部品を探す）
  function partAt(lv, x, y, prefer) {
    var hit = null, best = -1;
    var pri = { deco: 0, floor: 1, water: 2, pit: 2, mover: 3, trap: 4, door: 4, 'switch': 5, refill: 5, check: 6, start: 7, goal: 7 };
    (lv.parts || []).forEach(function (p) {
      var cs = p.part_id === 'mover' ? moverHome(p) : (p.part_id === 'start' || p.part_id === 'goal' || p.part_id === 'check') ? [[p.x, p.y]] : cellsOf(p);
      for (var i = 0; i < cs.length; i++) if (cs[i][0] === x && cs[i][1] === y) {
        var pr = pri[p.part_id] + (prefer && p.part_id === prefer ? 10 : 0);
        if (pr > best) { best = pr; hit = p; }
      }
    });
    return hit;
  }
  function moverHome(p) { var o = []; for (var i = 0; i < D.PHYS.moverW; i++) o.push([p.x + i, p.y]); return o; }
  function partsOf(lv) { return lv && Array.isArray(lv.parts) ? lv.parts : []; }
  function countActive(lv) { var n = 0; partsOf(lv).forEach(function (p) { if (p && PARTS[p.part_id] && PARTS[p.part_id].active) n++; }); return n; }
  function countBy(lv) { var c = {}; partsOf(lv).forEach(function (p) { if (p) c[p.part_id] = (c[p.part_id] || 0) + 1; }); return c; }

  /* ================= 検証 ================= */
  // 結果：{ ok, errors:[{code,msg,at,id}], warnings:[...], stats }
  //  errors があるとテストも公開申請もできない（修正必要）。warnings は知らせるだけ
  function validate(lv, opt) {
    opt = opt || {};
    var errors = [], warnings = [];
    function err(code, msg, at, id) { errors.push({ code: code, msg: msg, at: at || null, id: id || null }); }
    function warn(code, msg, at, id) { warnings.push({ code: code, msg: msg, at: at || null, id: id || null }); }
    if (!lv || typeof lv !== 'object' || !Array.isArray(lv.parts)) { err('format', '試験データの形が正しくありません。'); return done(); }
    if (lv.schema_version !== D.VERSION.schema) err('schema', 'この版では読めない試験データです（schema ' + lv.schema_version + '）。');
    if (lv.rules_version !== D.VERSION.rules) err('rules', 'ルールの版がちがいます（' + lv.rules_version + '）。');
    if (!D.THEMES[lv.theme]) err('theme', '知らない外見テーマです。');
    var size = JSON.stringify(lv).length;
    if (size > L.jsonBytes) err('size', '試験データが大きすぎます（' + size + ' 文字）。');
    var parts = lv.parts, ids = {}, cnt = countBy(lv);
    if (parts.length > L.parts) err('parts', '部品が多すぎます（' + parts.length + '／' + L.parts + '）。');
    var act = countActive(lv);
    if (act > L.active) err('active', '動作する仕掛けが多すぎます（' + act + '／' + L.active + '）。移動足場・罠・扉・スイッチの合計です。');
    if ((cnt.start || 0) !== 1) err('start', cnt.start ? 'スタートは1つだけにしてください。' : 'スタートがありません。');
    if ((cnt.goal || 0) !== 1) err('goal', cnt.goal ? 'ゴールは1つだけにしてください。' : 'ゴールがありません。');
    if ((cnt.check || 0) > L.checkpoints) err('check', 'チェックポイントは' + L.checkpoints + 'つまでです。');

    // 1つずつの形と範囲
    var okParts = [];
    parts.forEach(function (p, n) {
      var at = p && isInt(p.x) && isInt(p.y) ? { x: p.x, y: p.y } : null;
      if (!p || typeof p !== 'object' || !PARTS.hasOwnProperty(p.part_id)) { err('unknown', '知らない部品があります（' + (p && String(p.part_id).slice(0, 12)) + '）。', at); return; }
      var name = PARTS[p.part_id].name;
      if (typeof p.id !== 'string' || !ID_RE.test(p.id)) { err('id', name + 'の ID が正しくありません。', at); return; }
      if (ids[p.id]) { err('dupid', 'ID が重なっています（' + p.id + '）。', at, p.id); return; }
      ids[p.id] = p;
      if (!isInt(p.x) || !isInt(p.y) || p.x < 0 || p.x >= GW || p.y < 0 || p.y >= GH) { err('range', name + 'がステージの外にあります。', null, p.id); return; }
      var spec = PARTS[p.part_id].params, bad = false;
      Object.keys(spec).forEach(function (k) {
        var sp = spec[k], v = p[k];
        if (typeof sp[0] === 'string') { if (sp.indexOf(v) < 0) bad = true; }
        else if (!isInt(v) || v < sp[0] || v > sp[1]) bad = true;
      });
      if (p.part_id === 'refill' && p.jutsu !== 'mizu') bad = true;
      if (bad) { err('param', name + 'の設定が範囲の外です。', at, p.id); return; }
      var cs = cellsOf(p), outside = cs.some(function (c) { return c[0] < 0 || c[0] >= GW || c[1] < 0 || c[1] >= GH; });
      if (p.part_id === 'mover') { if (p.x + D.PHYS.moverW > GW || p.x2 + D.PHYS.moverW > GW) outside = true; if (p.x === p.x2 && p.y === p.y2) err('mover0', '移動足場の2つの地点が同じです。', at, p.id); }
      if (outside) { err('range', name + 'がステージからはみ出しています。', at, p.id); return; }
      okParts.push(p);
    });

    // マスの使い方（重なり）
    var occ = {}, solid = {}, deco = {};
    function key(x, y) { return x + ',' + y; }
    okParts.forEach(function (p) {
      if (p.part_id === 'deco') return;
      var cs = cellsOf(p);
      if (p.part_id === 'start' || p.part_id === 'goal' || p.part_id === 'check') cs = [[p.x, p.y]];
      cs.forEach(function (c) {
        var k = key(c[0], c[1]);
        if (occ[k] && occ[k] !== p) err('overlap', PARTS[p.part_id].name + 'が' + PARTS[occ[k].part_id].name + 'と重なっています。', { x: c[0], y: c[1] }, p.id);
        else occ[k] = p;
        if (p.part_id === 'floor' || p.part_id === 'door') solid[k] = p;
      });
    });
    function isFloor(x, y) { var o = occ[key(x, y)]; return !!o && o.part_id === 'floor'; }
    function solidCell(x, y) { return !!solid[key(x, y)]; }
    okParts.forEach(function (p) {
      var at = { x: p.x, y: p.y }, nm = PARTS[p.part_id].name;
      switch (p.part_id) {
        case 'start': case 'goal': case 'check':
          if (p.y + 1 >= GH) { err('room', nm + 'の上に1マスの空きが必要です。', at, p.id); break; }
          if (solidCell(p.x, p.y + 1) || (occ[key(p.x, p.y + 1)] && occ[key(p.x, p.y + 1)].part_id !== 'deco')) {
            if (p.part_id === 'goal') err('buried', 'ゴールが埋まっています（上に部品があります）。', at, p.id);
            else err('room', nm + 'の上に部品があります。', at, p.id);
          }
          if (p.part_id !== 'goal' && !isFloor(p.x, p.y - 1)) err('support', nm + 'の下に足場が必要です。', at, p.id);
          break;
        case 'switch':
          if (!isFloor(p.x, p.y - 1)) err('support', 'スイッチの下に足場が必要です。', at, p.id); break;
        case 'door':
          if (p.y + 1 >= GH) err('room', '扉は高さ2マスです。上に空きが必要です。', at, p.id);
          else if (!isFloor(p.x, p.y - 1)) err('support', '扉の下に足場が必要です。', at, p.id);
          break;
        case 'trap':
          if (p.dir === 'down' ? !isFloor(p.x, p.y + 1) : !isFloor(p.x, p.y - 1)) err('support', p.dir === 'down' ? '下向きの罠は、上に足場が必要です。' : '罠の下に足場が必要です。', at, p.id);
          break;
        case 'water':
          if (p.y > 0) for (var i = 0; i < p.len; i++) if (!isFloor(p.x + i, p.y - 1)) { err('support', '水路の下に足場が必要です（いちばん下の段なら不要）。', { x: p.x + i, y: p.y }, p.id); break; }
          break;
        case 'mover': {
          // 通り道の上2マスに固い物があると、はさまれる
          var sw = moverSwept(p), squeeze = false;
          sw.forEach(function (c) { if (solidCell(c[0], c[1] + 1) && !sw.some(function (d) { return d[0] === c[0] && d[1] === c[1] + 1; })) squeeze = true; if (solidCell(c[0], c[1] + 2) && !sw.some(function (d) { return d[0] === c[0] && d[1] === c[1] + 2; })) squeeze = true; });
          if (squeeze) warn('squeeze', '移動足場の通り道の上が低く、はさまれる所があります（上に2マスあけるのがおすすめ）。', at, p.id);
          break;
        }
      }
    });
    // 復帰する場所（スタート・チェックポイント）のまわりに危険な物を置かない
    okParts.forEach(function (p) {
      if (p.part_id !== 'check' && p.part_id !== 'start') return;
      var danger = false;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 2; dy++) {
        var o = occ[key(p.x + dx, p.y + dy)];
        if (o && (o.part_id === 'trap' || o.part_id === 'water' || o.part_id === 'pit' || o.part_id === 'mover')) danger = true;
      }
      if (danger) err('danger', (p.part_id === 'check' ? 'チェックポイント' : 'スタート') + 'のすぐそばに危険な物（罠・水路・落とし穴・移動足場の通り道）があります。', { x: p.x, y: p.y }, p.id);
    });
    // 装飾：ほかの部品と重ねない（危険をかくさない）
    okParts.forEach(function (p) {
      if (p.part_id !== 'deco') return;
      var k = key(p.x, p.y);
      if (occ[k]) err('overlap', '装飾が' + PARTS[occ[k].part_id].name + 'と重なっています。', { x: p.x, y: p.y }, p.id);
      if (deco[k]) err('overlap', '装飾が重なっています。', { x: p.x, y: p.y }, p.id);
      deco[k] = p;
    });

    // つながり（スイッチ → 扉）
    var conns = lv.connections || [], out = {}, inc = {}, seen = {};
    if (!Array.isArray(conns)) { err('conn', 'つながりの形が正しくありません。'); conns = []; }
    conns.forEach(function (c) {
      var a = ids[c.from], b = ids[c.to];
      if (!a || !b) { err('conn', 'ないものにつながっています。', null, c.from); return; }
      if (c.from === c.to) { err('conn', '自分自身につながっています。', { x: a.x, y: a.y }, a.id); return; }
      if (a.part_id !== 'switch' || b.part_id !== 'door') { err('conn', 'スイッチから扉へだけつなげます。', { x: a.x, y: a.y }, a.id); return; }
      var k = c.from + '>' + c.to;
      if (seen[k]) { err('conn', '同じつながりが2つあります。', { x: a.x, y: a.y }, a.id); return; }
      seen[k] = 1;
      out[c.from] = (out[c.from] || 0) + 1; inc[c.to] = (inc[c.to] || 0) + 1;
    });
    if (hasCycle(conns)) err('cycle', 'つながりが輪になっています。');
    okParts.forEach(function (p) {
      if (p.part_id === 'switch' && !out[p.id]) err('nolink', 'つながっていないスイッチがあります。扉を1つ選んでください。', { x: p.x, y: p.y }, p.id);
      if (p.part_id === 'switch' && out[p.id] > 1) err('nolink', 'スイッチがつなげる扉は1つだけです。', { x: p.x, y: p.y }, p.id);
      if (p.part_id === 'door' && !inc[p.id]) err('nolink', 'スイッチとつながっていない扉があります（開けられません）。', { x: p.x, y: p.y }, p.id);
    });

    // 経路の近似検査（エラーがなければ）
    var reach = null;
    if (!errors.length) {
      reach = reachability(lv);
      if (!reach.goal) warn('reach', 'ゴールに届かないかもしれません（テストで確かめてください）。', reach.goalAt);
      reach.unreachSwitch.forEach(function (p) { warn('reachsw', 'このスイッチに届かないかもしれません。', { x: p.x, y: p.y }, p.id); });
      if (reach.waterNeeded && !reach.refillReached) warn('jutsu', '水路をこえるのに必要な忍術補給が、手前にないかもしれません。', reach.waterAt);
    }
    return done();
    function done() {
      return { ok: errors.length === 0, errors: errors, warnings: warnings, stats: { parts: partsOf(lv).length, active: countActive(lv) }, reach: reach };
    }
  }
  function hasCycle(conns) {
    var g = {}, st = {}, cyc = false;
    conns.forEach(function (c) { (g[c.from] = g[c.from] || []).push(c.to); });
    function dfs(u) { st[u] = 1; (g[u] || []).forEach(function (v) { if (st[v] === 1) cyc = true; else if (!st[v]) dfs(v); }); st[u] = 2; }
    Object.keys(g).forEach(function (u) { if (!st[u]) dfs(u); });
    return cyc;
  }

  // 立っている所の頭上の空きから、跳んで届く高さ（段）と横の距離（マス）の目安
  //  天井が低いと小さくしか跳べない（2マスの通路なら高さ0・横2マスまで）
  function jumpReach(blocked, x, y) {
    var hc = 0;
    while (hc < 6 && !blocked(x, y + hc)) hc++;
    var c = Math.min(hc - D.PHYS.h, 3.3);
    if (c <= 0.05) return { up: 0, side: 1 };
    var air = 2 * Math.sqrt(2 * c / D.PHYS.grav);
    return { up: Math.min(D.PHYS.jumpDy, Math.floor(c + 0.01)), side: Math.min(D.PHYS.jumpDx, Math.floor(D.PHYS.run * air + 0.6)) };
  }

  /* ================= 経路の近似検査 =================
   * 立てるマス（足もとの高さ）を点にして、歩く・落ちる・跳ぶでつないだ図をたどる。
   * 扉はスイッチに届いたら開く／水路は忍術補給に届いたら立てる／移動足場の通り道は乗れる、とみなす。
   * 時間差のある罠や動く足場の攻略可能性までは確かめられない（作者の実プレイが必要）。
   */
  function reachability(lv) {
    var w = E.createWorld(lv);
    var parts = lv.parts, pitC = {}, waterC = {}, moverC = {}, trapC = {};
    parts.forEach(function (p) {
      if (p.part_id === 'pit') cellsOf(p).forEach(function (c) { pitC[c[0] + ',' + c[1]] = 1; });
      if (p.part_id === 'water') cellsOf(p).forEach(function (c) { waterC[c[0] + ',' + c[1]] = 1; });
      if (p.part_id === 'mover') cellsOf(p).forEach(function (c) { moverC[c[0] + ',' + c[1]] = 1; });
      if (p.part_id === 'trap') trapC[p.x + ',' + p.y] = 1;
    });
    var switches = parts.filter(function (p) { return p.part_id === 'switch'; });
    var refills = parts.filter(function (p) { return p.part_id === 'refill'; });
    var start = parts.filter(function (p) { return p.part_id === 'start'; })[0];
    var goal = parts.filter(function (p) { return p.part_id === 'goal'; })[0];
    var openDoors = {}, pressed = {}, waterOk = false, reached = {}, iter = 0;
    function doorSolid(x, y) {
      for (var i = 0; i < w.doors.length; i++) { var d = w.doors[i]; if (!openDoors[d.id] && d.x === x && (d.y === y || d.y + 1 === y)) return true; }
      return false;
    }
    function blocked(x, y) { if (x < 0 || x >= GW || y >= GH) return true; if (y < 0) return false; return w.solid[y * GW + x] === 1 || doorSolid(x, y); }
    function support(x, y) { // (x,y) に足が乗る物があるか
      if (y <= 0) return false;
      if (w.solid[(y - 1) * GW + x] === 1 || doorSolid(x, y - 1)) return true;
      if (moverC[x + ',' + (y - 1)]) return true;
      if (waterOk && waterC[x + ',' + (y - 1)]) return true;
      return false;
    }
    function standable(x, y) { return x >= 0 && x < GW && y >= 0 && y + 1 < GH && !blocked(x, y) && !blocked(x, y + 1) && !pitC[x + ',' + y] && !waterC[x + ',' + y] && support(x, y); }
    function clearLine(x0, y0, x1, y1) { // 体の中心の通り道に固い物がないか（ざっくり）
      var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 3 + 1;
      for (var i = 1; i < n; i++) {
        var x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n + 0.5);
        if (blocked(x, y)) return false;
      }
      return true;
    }
    function bfs() {
      var seen = {}, q = [], k;
      if (!start) return seen;
      var s0 = [start.x, start.y];
      seen[s0[0] + ',' + s0[1]] = 1; q.push(s0);
      while (q.length) {
        var c = q.shift(), x = c[0], y = c[1];
        var nexts = [];
        // 歩く
        [-1, 1].forEach(function (dx) {
          var nx = x + dx;
          if (standable(nx, y)) nexts.push([nx, y]);
          else if (!blocked(nx, y) && !blocked(nx, y + 1)) { // 端から落ちる
            for (var ny = y - 1; ny >= -1; ny--) {
              if (ny < 0) break;
              if (pitC[nx + ',' + ny] || (!waterOk && waterC[nx + ',' + ny])) break;
              if (blocked(nx, ny)) break;
              if (standable(nx, ny)) { nexts.push([nx, ny]); break; }
            }
          }
        });
        // 跳ぶ：頭の上の空き（天井の高さ）で、届く高さと距離が決まる
        var reach = jumpReach(blocked, x, y);
        for (var dx = -5; dx <= 5; dx++) for (var dy = -8; dy <= reach.up; dy++) {
          if (!dx && !dy) continue;
          if (Math.abs(dx) > reach.side + (dy <= -2 ? 1 : 0)) continue;
          var tx = x + dx, ty = y + dy;
          if (!standable(tx, ty)) continue;
          if (!clearLine(x, y + Math.max(0, dy) + 0.4, tx, ty + 0.4)) continue;
          nexts.push([tx, ty]);
        }
        nexts.forEach(function (n) { k = n[0] + ',' + n[1]; if (!seen[k]) { seen[k] = 1; q.push(n); } });
      }
      return seen;
    }
    function near(p, cells, dxMax, dyUp) { // 立てるマスから触れられるか
      for (var k in cells) {
        var a = k.split(','), x = +a[0], y = +a[1];
        if (Math.abs(p.x - x) <= dxMax && p.y - y <= dyUp && p.y - y >= -2) return true;
      }
      return false;
    }
    var changed = true;
    while (changed && iter++ < 20) {
      changed = false;
      reached = bfs();
      switches.forEach(function (s) {
        if (pressed[s.id]) return;
        if (reached[s.x + ',' + s.y] || near(s, reached, 1, 1)) {
          pressed[s.id] = 1; changed = true;
          (lv.connections || []).forEach(function (c) { if (c.from === s.id) openDoors[c.to] = 1; });
        }
      });
      if (!waterOk && refills.some(function (r) { return near(r, reached, 1, 3); })) { waterOk = true; changed = true; }
    }
    var goalOk = !!goal && (near(goal, reached, 1, 3) || near({ x: goal.x, y: goal.y }, reached, D.PHYS.jumpDx, D.PHYS.jumpDy));
    // 水路が道をふさいでいるか（水なしでゴールに届かないのに、水ありなら届く）
    var waterNeeded = false, waterAt = null;
    if (Object.keys(waterC).length && !waterOk) { waterNeeded = !goalOk; var wk = Object.keys(waterC)[0].split(','); waterAt = { x: +wk[0], y: +wk[1] }; }
    return {
      goal: goalOk, goalAt: goal ? { x: goal.x, y: goal.y } : null, reached: reached,
      unreachSwitch: switches.filter(function (s) { return !pressed[s.id]; }),
      waterNeeded: waterNeeded, refillReached: waterOk, waterAt: waterAt
    };
  }

  /* ================= 提案（AI／定型）の検査と反映 =================
   * 提案の形：{ template_id, objects:[{part_id,x,y,...}], connections:[{from,to}], difficulty_hint, remove:[id] }
   * 画像・実行コード・任意の物理ルールは受け付けない。知らない部品・範囲外は捨てずに「不合格」として扱う。
   */
  var CODEY = /(<|>|function|=>|script|eval|\{\{|\$\{|javascript:|import\s|require\()/i;
  function checkProposal(prop, base) {
    var errors = [];
    if (!prop || typeof prop !== 'object' || Array.isArray(prop)) return { ok: false, errors: ['提案の形が正しくありません。'] };
    var raw = '';
    try { raw = JSON.stringify(prop); } catch (e) { return { ok: false, errors: ['提案を読めません。'] }; }
    if (raw.length > 8000) errors.push('提案が大きすぎます。');
    if (CODEY.test(raw)) errors.push('提案にコードのような文字が入っています。');
    var allowTop = { template_id: 1, objects: 1, connections: 1, difficulty_hint: 1, remove: 1, note: 1 };
    Object.keys(prop).forEach(function (k) { if (!allowTop[k]) errors.push('知らない項目があります（' + String(k).slice(0, 16) + '）。'); });
    if (prop.note !== undefined && (typeof prop.note !== 'string' || prop.note.length > 60)) errors.push('説明が長すぎます。');
    var objs = Array.isArray(prop.objects) ? prop.objects : null;
    if (!objs) errors.push('部品の一覧がありません。');
    if (objs && objs.length > 20) errors.push('一度に足す部品が多すぎます。');
    (objs || []).forEach(function (o) {
      if (!o || typeof o !== 'object') { errors.push('部品の形が正しくありません。'); return; }
      if (!PARTS.hasOwnProperty(o.part_id) || o.part_id === 'start' || o.part_id === 'goal') { errors.push('知らない部品です（' + String(o && o.part_id).slice(0, 12) + '）。'); return; }
      var allowed = { id: 1, part_id: 1, x: 1, y: 1 };
      FIELDS[o.part_id].forEach(function (k) { allowed[k] = 1; });
      Object.keys(o).forEach(function (k) { if (!allowed[k]) errors.push('部品に知らない項目があります（' + String(k).slice(0, 12) + '）。'); });
      if (!isInt(o.x) || !isInt(o.y) || o.x < 0 || o.x >= GW || o.y < 0 || o.y >= GH) errors.push('座標がステージの外です。');
      Object.keys(o).forEach(function (k) { var v = o[k]; if (typeof v === 'string' && v.length > 8) errors.push('値が長すぎます。'); if (typeof v === 'object' && v !== null) errors.push('入れ子の値は使えません。'); });
    });
    if (prop.remove !== undefined && (!Array.isArray(prop.remove) || prop.remove.some(function (r) { return typeof r !== 'string'; }))) errors.push('消す部品の指定が正しくありません。');
    if (errors.length) return { ok: false, errors: errors };
    var lv = applyProposal(base, prop);
    var v = validate(lv);
    if (!v.ok) return { ok: false, errors: v.errors.map(function (e) { return e.msg; }), level: lv, validation: v };
    return { ok: true, errors: [], level: lv, validation: v };
  }
  function applyProposal(base, prop) {
    var lv = clone(base), map = {};
    var rm = {}; (prop.remove || []).forEach(function (id) { rm[id] = 1; });
    var starts = lv.parts.filter(function (p) { return p.part_id === 'start' || p.part_id === 'goal'; }).map(function (p) { return p.id; });
    lv.parts = lv.parts.filter(function (p) { return !rm[p.id] || starts.indexOf(p.id) >= 0; });
    lv.connections = (lv.connections || []).filter(function (c) { return !rm[c.from] && !rm[c.to]; });
    (prop.objects || []).forEach(function (o) {
      var c = cleanPart(o);
      if (!c) return;
      var pid = nextPartId(lv);
      if (o.id) map[o.id] = pid;
      c.id = pid;
      lv.parts.push(c);
    });
    (prop.connections || []).forEach(function (c) {
      var f = map[c.from] || c.from, t = map[c.to] || c.to;
      lv.connections.push({ from: f, to: t });
    });
    return lv;
  }
  // 提案で増えた・減った部品（プレビュー用）
  function diffLevels(a, b) {
    var ka = {}, kb = {}, add = [], del = [];
    a.parts.forEach(function (p) { ka[JSON.stringify(partKey(p))] = p; });
    b.parts.forEach(function (p) { kb[JSON.stringify(partKey(p))] = p; });
    Object.keys(kb).forEach(function (k) { if (!ka[k]) add.push(kb[k]); });
    Object.keys(ka).forEach(function (k) { if (!kb[k]) del.push(ka[k]); });
    return { add: add, del: del };
  }

  /* ================= 定型の提案（ルールで作る。AI が使えないとき・使わないとき） =================
   * 選んだ「主な仕掛け」を、いまの試験の平らな所に1つ足す案を作る。案は必ず検査に通るものだけ返す。
   */
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; }; }
  function flatRuns(lv, minLen) { // 立てる平らな道（地面の上）の区間
    var w = E.createWorld(lv), occ = {}, runs = [];
    lv.parts.forEach(function (p) { cellsOf(p).forEach(function (c) { occ[c[0] + ',' + c[1]] = p; }); });
    for (var y = 1; y < GH - 2; y++) {
      var x0 = -1;
      for (var x = 0; x <= GW; x++) {
        var ok = x < GW && w.solid[(y - 1) * GW + x] === 1 && !w.solid[y * GW + x] && !w.solid[(y + 1) * GW + x] && !occ[x + ',' + y] && !occ[x + ',' + (y + 1)];
        if (ok && x0 < 0) x0 = x;
        if (!ok && x0 >= 0) { if (x - x0 >= minLen) runs.push({ x: x0, y: y, len: x - x0 }); x0 = -1; }
      }
    }
    return runs;
  }
  function suggest(base, want, seed) {
    var r = rng(seed || 12345), gim = (want && want.gimmick) || 'water', lvl = (want && want.level) || 'easy';
    var hard = lvl === 'hard' ? 2 : lvl === 'normal' ? 1 : 0;
    var start = base.parts.filter(function (p) { return p.part_id === 'start'; })[0] || { x: 0, y: 1 };
    var goal = base.parts.filter(function (p) { return p.part_id === 'goal'; })[0] || { x: GW - 1, y: 1 };
    var tries = [];
    var runs = flatRuns(base, 5), dirp = goal.x >= start.x ? 1 : -1;
    // 足場を「くりぬいて」仕掛けを入れる案（地面の中ほど）
    runs.forEach(function (u) {
      for (var k = 0; k < 6; k++) {
        var len, x, y = u.y, props = null;
        if (gim === 'water') {
          len = 3 + hard + Math.floor(r() * 2);
          if (u.len < len + 4) continue;
          x = u.x + 2 + Math.floor(r() * (u.len - len - 3));
          props = carve(base, x, y - 1, len, function (objs) {
            objs.push({ id: 'n1', part_id: 'water', x: x, y: y - 1, len: len });
            objs.push({ id: 'n2', part_id: 'refill', x: dirp > 0 ? Math.max(u.x, x - 2) : Math.min(u.x + u.len - 1, x + len + 1), y: y, count: 1 });
          });
        } else if (gim === 'pit') {
          len = 2 + hard;
          if (u.len < len + 4) continue;
          x = u.x + 2 + Math.floor(r() * (u.len - len - 3));
          props = carve(base, x, y - 1, len, function (objs) { objs.push({ id: 'n1', part_id: 'pit', x: x, y: y - 1, len: len }); });
        } else if (gim === 'trap') {
          var n = 1 + hard;
          if (u.len < n * 2 + 3) continue;
          x = u.x + 2 + Math.floor(r() * (u.len - n * 2 - 2));
          props = { objects: [] };
          for (var t = 0; t < n; t++) props.objects.push({ id: 'n' + (t + 1), part_id: 'trap', x: x + t * 2, y: y, rate: 1 + hard, dir: 'up' });
        } else if (gim === 'mover') {
          len = 5 + hard;
          if (u.len < len + 4) continue;
          x = u.x + 2 + Math.floor(r() * (u.len - len - 3));
          props = carve(base, x, y - 1, len, function (objs) {
            objs.push({ id: 'n1', part_id: 'mover', x: x, y: y - 1, x2: x + len - 3, y2: y - 1, speed: 1 + Math.min(2, hard) });
          });
          if (props && y - 2 >= 0) props.objects.push({ id: 'n9', part_id: 'pit', x: x, y: y - 2, len: len });
        } else if (gim === 'door') {
          if (u.len < 7) continue;
          x = u.x + 3 + Math.floor(r() * (u.len - 5));
          // スイッチは扉の手前（スタートの側）。むずかしいときは手前の高い足場の上
          props = { objects: [{ id: 'n1', part_id: 'door', x: x, y: y, color: Math.floor(r() * 4) }] };
          var px0 = dirp > 0 ? x - 4 : x + 2;
          var plat = { id: 'n3', part_id: 'floor', x: Math.max(0, Math.min(GW - 3, px0)), y: Math.min(GH - 3, y + 2 + hard), len: 3, dir: 'h', skin: 0 };
          if (hard) { props.objects.push(plat); props.objects.push({ id: 'n2', part_id: 'switch', x: plat.x + 1, y: plat.y + 1 }); }
          else props.objects.push({ id: 'n2', part_id: 'switch', x: dirp > 0 ? x - 2 : x + 2, y: y });
          props.connections = [{ from: 'n2', to: 'n1' }];
        } else { // jump：足場わたり
          len = 2 + hard;
          if (u.len < len + 4) continue;
          x = u.x + 2 + Math.floor(r() * (u.len - len - 3));
          props = carve(base, x, y - 1, len, function (objs) {
            objs.push({ id: 'n1', part_id: 'floor', x: x + Math.floor(len / 2), y: Math.min(GH - 3, y + 1 + hard), len: 1, dir: 'h', skin: 2 });
          });
        }
        if (props) { props.template_id = (want && want.template_id) || 'current'; props.difficulty_hint = lvl; tries.push(props); }
      }
    });
    // 検査に通るものの中から、ばらけるように選ぶ
    for (var i = 0; i < tries.length; i++) {
      var j = i + Math.floor(r() * (tries.length - i)), tmp = tries[i]; tries[i] = tries[j]; tries[j] = tmp;
      var chk = checkProposal(tries[i], base);
      if (chk.ok && chk.validation.reach && chk.validation.reach.goal) return { ok: true, proposal: tries[i], level: chk.level, validation: chk.validation };
    }
    return { ok: false, proposal: null };
  }
  // 足場の一部を消して（remove して長さを分けた足場を足す）、その穴に仕掛けを入れる
  function carve(base, x, y, len, fill) {
    var hit = base.parts.filter(function (p) { return p.part_id === 'floor' && p.dir === 'h' && p.y === y && p.x <= x && p.x + p.len >= x + len; })[0];
    if (!hit) return null;
    var objs = [];
    if (x > hit.x) objs.push({ id: 'l1', part_id: 'floor', x: hit.x, y: y, len: x - hit.x, dir: 'h', skin: hit.skin });
    var rx = x + len, rlen = hit.x + hit.len - rx;
    if (rlen > 0) objs.push({ id: 'r1', part_id: 'floor', x: rx, y: y, len: rlen, dir: 'h', skin: hit.skin });
    fill(objs);
    return { objects: objs, remove: [hit.id] };
  }

  /* ================= 攻略の記録からの改善のヒント =================
   * 失敗の場所が集中している所を、「〇番目の罠で失敗が集中」のように伝える。試行が少ないときは出さない。
   */
  var HINT_MIN = { attempts: 12, players: 2 };
  function improveHints(lv, attempts) {
    attempts = attempts || [];
    var players = {}, n = 0, deaths = [], clears = 0, times = [];
    attempts.forEach(function (a) { n++; players[a.player || 'x'] = 1; (a.deaths || []).forEach(function (d) { deaths.push(d); }); if (a.result === 'clear') { clears++; times.push(a.frames); } });
    var np = Object.keys(players).length;
    if (n < HINT_MIN.attempts || np < HINT_MIN.players) return { enough: false, need: HINT_MIN, attempts: n, players: np, hints: [] };
    var hints = [];
    // 部品ごとに失敗を数える（いちばん近い危険な部品へ）
    var hazards = lv.parts.filter(function (p) { return p.part_id === 'trap' || p.part_id === 'pit' || p.part_id === 'water' || p.part_id === 'mover'; });
    var order = {}; ['trap', 'pit', 'water', 'mover'].forEach(function (k) { order[k] = lv.parts.filter(function (p) { return p.part_id === k; }).sort(function (a, b) { return a.x - b.x || a.y - b.y; }); });
    var byPart = {};
    deaths.forEach(function (d) {
      var best = null, bd = 99;
      hazards.forEach(function (p) {
        var cs = cellsOf(p);
        cs.forEach(function (c) { var dd = Math.abs(c[0] - d.x) + Math.abs(c[1] - d.y); if (dd < bd) { bd = dd; best = p; } });
      });
      if (best && bd <= 3) byPart[best.id] = (byPart[best.id] || 0) + 1;
    });
    var total = deaths.length || 1;
    Object.keys(byPart).sort(function (a, b) { return byPart[b] - byPart[a]; }).slice(0, 2).forEach(function (id) {
      var p = lv.parts.filter(function (q) { return q.id === id; })[0], share = byPart[id] / total;
      if (share < 0.3 || byPart[id] < 4) return;
      var nth = order[p.part_id].indexOf(p) + 1, nm = PARTS[p.part_id].name;
      var tip = p.part_id === 'trap' ? '間隔を「ゆっくり」にする・手前に立ち止まれる足場を置く' : p.part_id === 'water' ? '水路を短くする・手前に忍術補給を置く' : p.part_id === 'pit' ? '穴の幅を1マス減らす' : '速さを1段階おそくする・乗り場を広くする';
      hints.push({ id: id, kind: 'hot', at: { x: p.x, y: p.y }, share: Math.round(share * 100), msg: 'ひだりから' + nth + '番目の' + nm + 'で失敗が集中しています（失敗の' + Math.round(share * 100) + '%）。', tip: tip });
    });
    var rate = clears / n;
    if (rate < 0.2) hints.push({ kind: 'hard', msg: 'クリアできた挑戦が少なめです（' + Math.round(rate * 100) + '%）。チェックポイントを足すと続けやすくなります。', tip: 'チェックポイントを足す' });
    if (times.length >= 3) {
      times.sort(function (a, b) { return a - b; });
      var med = times[Math.floor(times.length / 2)] / 60;
      if (med > 90) hints.push({ kind: 'long', msg: 'クリアまでの時間の真ん中が' + Math.round(med) + '秒です（目安は30〜90秒）。', tip: '道を短くする' });
    }
    return { enough: true, attempts: n, players: np, clears: clears, hints: hints };
  }

  /* ================= 試験コード（友だちと交換する文字列） =================
   * KRK1- のあとに、部品の数値だけを詰めたバイト列（base64url）＋CRC32。
   * 作者クリアの入力記録も入れるので、読みこんだ側で再生して「クリアできる試験か」を確かめられる。
   */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64enc(bytes) {
    var s = '', i;
    for (i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
    }
    return s;
  }
  function b64dec(s) {
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64.indexOf(s[i]);
      if (v < 0) throw new Error('bad char');
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }
  function Wr() { this.b = []; }
  Wr.prototype.u8 = function (v) { this.b.push(v & 255); };
  Wr.prototype.vu = function (v) { v = Math.max(0, Math.floor(v)); do { var x = v & 127; v = Math.floor(v / 128); this.b.push(x | (v ? 128 : 0)); } while (v); };
  Wr.prototype.str = function (s) { s = String(s); this.vu(s.length); for (var i = 0; i < s.length; i++) this.b.push(s.charCodeAt(i) & 127); }; // 英数字だけ（ID と版）
  function Rd(b) { this.b = b; this.i = 0; }
  Rd.prototype.u8 = function () { if (this.i >= this.b.length) throw new Error('short'); return this.b[this.i++]; };
  Rd.prototype.vu = function () { var v = 0, m = 1, x, n = 0; do { x = this.u8(); v += (x & 127) * m; m *= 128; if (++n > 6) throw new Error('long'); } while (x & 128); return v; };
  Rd.prototype.str = function (max) { var n = this.vu(); if (n > max) throw new Error('long str'); var s = ''; for (var i = 0; i < n; i++) { var c = this.u8(); if (c < 32 || c > 126) throw new Error('bad str'); s += String.fromCharCode(c); } return s; };
  var PCODE = ['start', 'goal', 'floor', 'mover', 'pit', 'trap', 'door', 'switch', 'water', 'refill', 'check', 'deco'];
  function wrap(prefix, bytes) { var c = crc32(bytes); bytes = bytes.concat([(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]); return prefix + b64enc(bytes); }
  function unwrap(prefix, code) {
    code = String(code || '').replace(/\s+/g, '');
    var at = code.indexOf(prefix);
    if (at < 0) throw new Error('prefix');
    var bytes = b64dec(code.slice(at + prefix.length));
    if (bytes.length < 5) throw new Error('short');
    var body = bytes.slice(0, -4), c = crc32(body), t = bytes.slice(-4);
    if (((t[0] << 24) | (t[1] << 16) | (t[2] << 8) | t[3]) >>> 0 !== c) throw new Error('crc');
    return body;
  }
  function packRuns(w, runs) {
    w.vu(runs.length);
    runs.forEach(function (r) { w.u8(r[0] & 15); w.vu(r[1]); });
  }
  function unpackRuns(rd) {
    var n = rd.vu(), out = [];
    if (n > 20000) throw new Error('runs');
    for (var i = 0; i < n; i++) { var m = rd.u8(); if (m > 15) throw new Error('mask'); out.push([m, rd.vu()]); }
    return out;
  }
  // meta: { level_id, version_id, owner_id, sign:{a,b,c}, runs:[[mask,n]...] }
  function encodeLevel(lv, meta) {
    var w = new Wr(), idx = {};
    w.u8(1); // 形の版
    w.u8(lv.schema_version); w.str(lv.rules_version); w.u8(D.THEME_ORDER.indexOf(lv.theme));
    w.u8(lv.title.a); w.u8(lv.title.b); w.u8(lv.title.c);
    w.str(meta.level_id || ''); w.str(meta.version_id || ''); w.str(meta.owner_id || '');
    var sg = meta.sign || {}; w.u8(sg.a || 0); w.u8(sg.b || 0); w.u8(((sg.c || 0) & 15) | (((sg.f || 0) & 3) << 4)); // 上の4ビットは看板の飾り
    w.vu(lv.parts.length);
    lv.parts.forEach(function (p, i) {
      idx[p.id] = i;
      w.u8(PCODE.indexOf(p.part_id)); w.u8(p.x); w.u8(p.y);
      switch (p.part_id) {
        case 'floor': w.u8(p.len); w.u8(p.dir === 'v' ? 1 : 0); w.u8(p.skin); break;
        case 'mover': w.u8(p.x2); w.u8(p.y2); w.u8(p.speed); break;
        case 'pit': case 'water': w.u8(p.len); break;
        case 'trap': w.u8(p.rate); w.u8(p.dir === 'down' ? 1 : 0); break;
        case 'door': w.u8(p.color); break;
        case 'refill': w.u8(p.count); break;
        case 'deco': w.u8(p.kind); w.u8(p.dir === 'l' ? 1 : 0); break;
      }
    });
    w.vu(lv.connections.length);
    lv.connections.forEach(function (c) { w.vu(idx[c.from]); w.vu(idx[c.to]); });
    packRuns(w, meta.runs || []);
    return wrap('KRK1-', w.b);
  }
  function decodeLevel(code) {
    try {
      var rd = new Rd(unwrap('KRK1-', code));
      if (rd.u8() !== 1) throw new Error('ver');
      var lv = { schema_version: rd.u8(), rules_version: rd.str(8), theme: D.THEME_ORDER[rd.u8()], title: { a: rd.u8(), b: rd.u8(), c: rd.u8() }, parts: [], connections: [] };
      var meta = { level_id: rd.str(24), version_id: rd.str(24), owner_id: rd.str(24), sign: { a: rd.u8(), b: rd.u8(), c: rd.u8() } };
      meta.sign.f = (meta.sign.c >> 4) & 3; meta.sign.c &= 15;
      var n = rd.vu();
      if (n > L.parts) throw new Error('parts');
      for (var i = 0; i < n; i++) {
        var k = PCODE[rd.u8()]; if (!k) throw new Error('part');
        var p = { id: 'p' + (i + 1), part_id: k, x: rd.u8(), y: rd.u8() };
        switch (k) {
          case 'floor': p.len = rd.u8(); p.dir = rd.u8() ? 'v' : 'h'; p.skin = rd.u8(); break;
          case 'mover': p.x2 = rd.u8(); p.y2 = rd.u8(); p.speed = rd.u8(); break;
          case 'pit': case 'water': p.len = rd.u8(); break;
          case 'trap': p.rate = rd.u8(); p.dir = rd.u8() ? 'down' : 'up'; break;
          case 'door': p.color = rd.u8(); break;
          case 'refill': p.count = rd.u8(); p.jutsu = 'mizu'; break;
          case 'deco': p.kind = rd.u8(); p.dir = rd.u8() ? 'l' : 'r'; break;
        }
        lv.parts.push(p);
      }
      var nc = rd.vu();
      if (nc > L.parts) throw new Error('conns');
      for (i = 0; i < nc; i++) { var a = rd.vu(), b = rd.vu(); if (!lv.parts[a] || !lv.parts[b]) throw new Error('conn'); lv.connections.push({ from: lv.parts[a].id, to: lv.parts[b].id }); }
      meta.runs = unpackRuns(rd);
      if (rd.i !== rd.b.length) throw new Error('trailing');
      if (!ID_OK(meta.level_id) || !ID_OK(meta.version_id) || !ID_OK(meta.owner_id)) throw new Error('ids');
      return { ok: true, level: lv, meta: meta };
    } catch (e) {
      return { ok: false, error: codeError(e) };
    }
  }
  function ID_OK(s) { return /^[a-z0-9_]{4,24}$/.test(s); }
  function codeError(e) {
    var m = String(e && e.message || e);
    if (m === 'prefix') return 'からくり工房の試験コードではないようです。';
    if (m === 'crc') return 'コードの一部がこわれています（写しまちがい？）。';
    return 'コードを読めませんでした。';
  }
  // 攻略メモ（友だちが遊んだ結果を作者へ返すコード）
  // r: { level_id, content_hash, player, attempts, clears, best, deaths:[{x,y,cause}], reactions:{fun,aha,hard} }
  var CAUSES = ['fall', 'trap', 'pit', 'water', 'crush', 'timeout'];
  function encodeResult(r) {
    var w = new Wr();
    w.u8(1); w.str(r.level_id); w.str(r.content_hash); w.str(r.player);
    w.vu(r.attempts); w.vu(r.clears); w.vu(r.best || 0);
    var ds = (r.deaths || []).slice(-60);
    w.vu(ds.length); ds.forEach(function (d) { w.u8(d.x); w.u8(d.y); w.u8(Math.max(0, CAUSES.indexOf(d.cause))); });
    var rc = r.reactions || {}; w.u8((rc.fun ? 1 : 0) | (rc.aha ? 2 : 0) | (rc.hard ? 4 : 0));
    return wrap('KRR1-', w.b);
  }
  function decodeResult(code) {
    try {
      var rd = new Rd(unwrap('KRR1-', code));
      if (rd.u8() !== 1) throw new Error('ver');
      var r = { level_id: rd.str(24), content_hash: rd.str(32), player: rd.str(24), attempts: rd.vu(), clears: rd.vu(), best: rd.vu(), deaths: [] };
      var n = rd.vu(); if (n > 60) throw new Error('deaths');
      for (var i = 0; i < n; i++) { var x = rd.u8(), y = rd.u8(), c = rd.u8(); if (x >= GW || y >= GH || c >= CAUSES.length) throw new Error('death'); r.deaths.push({ x: x, y: y, cause: CAUSES[c] }); }
      var b = rd.u8(); r.reactions = { fun: !!(b & 1), aha: !!(b & 2), hard: !!(b & 4) };
      if (rd.i !== rd.b.length) throw new Error('trailing');
      if (r.clears > r.attempts || r.attempts > 9999 || !ID_OK(r.level_id) || !/^[0-9a-f]{24}$/.test(r.content_hash) || !ID_OK(r.player)) throw new Error('values');
      return { ok: true, result: r };
    } catch (e) {
      var m = String(e && e.message || e);
      return { ok: false, error: m === 'prefix' ? '攻略メモのコードではないようです。' : m === 'crc' ? 'コードの一部がこわれています。' : 'コードを読めませんでした。' };
    }
  }

  /* ================= 見本・運営ステージの文字の地図 → 試験データ =================
   * 12行×32文字（上の行が y=11）。
   *  # 足場  S スタート  G ゴール  C チェックポイント  ^ 罠（上向き） v 罠（下向き）
   *  ~ 水路  _ 落とし穴  R 忍術補給  1〜4 扉（色）  | 扉の上半分  a〜d スイッチ（1〜4の扉につながる）
   *  l t p o f n w k 装飾（灯籠・竹・松・岩・花・のぼり・風鈴・狛狐）
   *  移動足場は meta.movers、罠の間隔は meta.rate（または meta.rates で場所ごと）、補給の回数は meta.count
   */
  var DECO_CH = D.DECOS.map(function (d) { return d.ch; }).join('');
  function fromAscii(rows, meta) {
    meta = meta || {};
    if (rows.length !== GH) throw new Error('rows ' + rows.length);
    var grid = [];
    for (var r = 0; r < GH; r++) { if (rows[r].length !== GW) throw new Error('row ' + r + ' len ' + rows[r].length + ': ' + rows[r]); grid[GH - 1 - r] = rows[r].split(''); }
    var parts = [], conns = [], n = 0, x, y, used = {};
    function id() { return 'p' + (++n); }
    function at(x, y) { return y >= 0 && y < GH && x >= 0 && x < GW ? grid[y][x] : ' '; }
    var skin = meta.skin || 0;
    // 足場：縦の柱（2マス以上・横に続かない）→ 残りを横に
    for (x = 0; x < GW; x++) {
      y = 0;
      while (y < GH) {
        if (at(x, y) === '#' && at(x - 1, y) !== '#' && at(x + 1, y) !== '#') {
          var y0 = y;
          while (at(x, y) === '#' && at(x - 1, y) !== '#' && at(x + 1, y) !== '#') y++;
          if (y - y0 >= 2) { for (var k = y0; k < y; k++) used[x + ',' + k] = 1; parts.push({ id: id(), part_id: 'floor', x: x, y: y0, len: y - y0, dir: 'v', skin: skin }); }
        } else y++;
      }
    }
    for (y = 0; y < GH; y++) {
      x = 0;
      while (x < GW) {
        if (at(x, y) === '#' && !used[x + ',' + y]) {
          var x0 = x;
          while (x < GW && at(x, y) === '#' && !used[x + ',' + y] && x - x0 < 16) x++;
          parts.push({ id: id(), part_id: 'floor', x: x0, y: y, len: x - x0, dir: 'h', skin: skin });
        } else x++;
      }
    }
    var doors = {};
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      var c = at(x, y);
      if (c === 'S') parts.push({ id: id(), part_id: 'start', x: x, y: y });
      else if (c === 'G') parts.push({ id: id(), part_id: 'goal', x: x, y: y });
      else if (c === 'C') parts.push({ id: id(), part_id: 'check', x: x, y: y });
      else if (c === '^' || c === 'v') { var rate = (meta.rates && meta.rates[x + ',' + y]) || meta.rate || 2; parts.push({ id: id(), part_id: 'trap', x: x, y: y, rate: rate, dir: c === 'v' ? 'down' : 'up' }); }
      else if (c === 'R') parts.push({ id: id(), part_id: 'refill', x: x, y: y, count: (meta.counts && meta.counts[x + ',' + y]) || meta.count || 1, jutsu: 'mizu' });
      else if (c >= '1' && c <= '4') { var dp = { id: id(), part_id: 'door', x: x, y: y, color: +c - 1 }; parts.push(dp); doors[c] = dp; }
      else if (DECO_CH.indexOf(c) >= 0) parts.push({ id: id(), part_id: 'deco', x: x, y: y, kind: DECO_CH.indexOf(c), dir: (x * 7 + y) % 3 ? 'r' : 'l' });
    }
    for (y = 0; y < GH; y++) for (x = 0; x < GW; x++) {
      var ch = at(x, y);
      if (ch >= 'a' && ch <= 'd') { var sp = { id: id(), part_id: 'switch', x: x, y: y }; parts.push(sp); var dd = doors[String(ch.charCodeAt(0) - 96)]; if (dd) conns.push({ from: sp.id, to: dd.id }); }
    }
    ['~', '_'].forEach(function (sym) {
      for (y = 0; y < GH; y++) { x = 0; while (x < GW) { if (at(x, y) === sym) { var s0 = x; while (x < GW && at(x, y) === sym && x - s0 < (sym === '~' ? 10 : 8)) x++; parts.push({ id: id(), part_id: sym === '~' ? 'water' : 'pit', x: s0, y: y, len: x - s0 }); } else x++; } }
    });
    (meta.movers || []).forEach(function (m) { parts.push({ id: id(), part_id: 'mover', x: m[0], y: m[1], x2: m[2], y2: m[3], speed: m[4] || 2 }); });
    return { schema_version: D.VERSION.schema, rules_version: D.VERSION.rules, theme: meta.theme || 'chikurin', title: cleanTitle(meta.title), parts: parts, connections: conns };
  }

  var api = {
    clone: clone, rid: rid, nextPartId: nextPartId, sha256: sha256, crc32: crc32, normalize: normalize, cleanPart: cleanPart, titleText: titleText, signText: signText, cleanTitle: cleanTitle,
    canonical: canonical, contentHash: contentHash, cellsOf: cellsOf, moverSwept: moverSwept, partAt: partAt, countActive: countActive, countBy: countBy,
    validate: validate, reachability: reachability, checkProposal: checkProposal, applyProposal: applyProposal, diffLevels: diffLevels, suggest: suggest,
    improveHints: improveHints, HINT_MIN: HINT_MIN, encodeLevel: encodeLevel, decodeLevel: decodeLevel, encodeResult: encodeResult, decodeResult: decodeResult,
    fromAscii: fromAscii, b64enc: b64enc, b64dec: b64dec, utf8: utf8, jumpReach: jumpReach
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KK_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis);
