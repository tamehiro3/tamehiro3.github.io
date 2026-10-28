/* 忍び足（しのびあし）— 見せ合い QR・書き出しファイル・診断ファイル SA.Share
 *
 * 仕様は docs/SPEC.md の 2.5。
 *  - 見せ合い QR: 18バイト（版・charIndex・位と奥義・累計修行値・染め・絆・日付・宿場・周回・予備・CRC32）を
 *    Crockford Base32（大文字）で29文字にし、先頭に 'SA1-' を付ける。英大文字・数字・'-' だけなので QR の英数字モードに入る。
 *    名前・年齢・位置・端末情報・歩数・識別子は入れない。
 *  - QR を描くのは vendor/qrcode.js（qrcode-generator, MIT）、読むのは vendor/jsQR.js（jsQR, Apache-2.0）。
 *  - カメラの映像は端末の中（video → canvas → jsQR）だけで使い、どこにも送らない。保存もしない。
 *  - 書き出しファイル: { app, v, exportedAt, crc32, state }。crc32 は JSON.stringify(state) の UTF-8 に対する CRC32（IEEE）。
 *  - 診断ファイル: SA.Rules.diagnostics の9項目を CSV に。
 *  - 外部への通信はしない（ネットワークの API を一切呼ばない）。
 * ビルドなしの素の JS。window.SA に足す。Node では require('./share.js') で同じものが返る（カメラ・保存は使えない）。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var hasReq = typeof require === 'function' && typeof module !== 'undefined';
  function need(globalName, path) {
    if (root[globalName]) return root[globalName];
    if (hasReq) { try { return require(path); } catch (e) { return null; } }
    return null;
  }
  var D = SA.DATA || (hasReq ? require('./data.js') : null);
  var CH = root.NSL_CHARS || need('NSL_CHARS', './chars.js');
  var CFG = D.CONFIG;

  var CHAR_IDS = CH.CHARS.map(function (c) { return c.id; });   // charIndex の並び（chars.js の並び、0〜38）
  var DYE_IDS = D.DYES.map(function (d) { return d.id; });       // 染めの番号（DYES の並び）
  var LAST_STATION = D.STATIONS.length - 1;                      // 50
  var PREFIX = 'SA' + CFG.QR_VERSION + '-';                      // 'SA1-'
  var PAYLOAD_BYTES = 18;
  var B32_LEN = Math.ceil(PAYLOAD_BYTES * 8 / 5);                // 29
  var DAY0 = '2026-01-01';                                       // 日付の起点（ここからの日数を uint16 で）
  var MAX_IMPORT = 5 * 1024 * 1024;                              // 読み込むファイルの大きさの上限（5MB）

  function qrLib() { return root.qrcode || need('qrcode', './vendor/qrcode.js'); }
  function jsqrLib() { return root.jsQR || need('jsQR', './vendor/jsQR.js'); }

  /* ================= 小さな道具 ================= */
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function clampInt(n, lo, hi) { n = Number(n); if (!isFinite(n)) n = lo; n = Math.floor(n); return n < lo ? lo : n > hi ? hi : n; }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function ymdParse(s) {
    var m = typeof s === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
    return Date.UTC(y, mo - 1, d);
  }
  function ymdOf(ms) { var t = new Date(ms); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function dayIndex(date) {    // 'YYYY-MM-DD' → 2026-01-01 からの日数（0〜65535 に収める）
    var t = ymdParse(date);
    if (t === null) return 0;
    return clampInt(Math.round((t - ymdParse(DAY0)) / 86400000), 0, 0xffff);
  }
  function dateOfDay(n) { return ymdOf(ymdParse(DAY0) + n * 86400000); }
  function localDate(now) {    // 端末の地方時の今日
    var t = now instanceof Date ? now : new Date();
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
  }
  function todayOf(opt) {
    if (opt && ymdParse(opt.today) !== null) return opt.today;
    try { if (SA.Steps && typeof SA.Steps.today === 'function') { var t = SA.Steps.today(); if (ymdParse(t) !== null) return t; } } catch (e) { }
    return localDate(opt && opt.now);
  }

  /* ================= CRC32（IEEE 802.3、反転多項式 0xEDB88320） ================= */
  var CRC_TABLE = (function () {
    var t = new Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes, from, to) {   // bytes: 配列か Uint8Array。戻り値は符号なし32ビット整数
    var c = 0xFFFFFFFF, i = from || 0, end = to === undefined ? bytes.length : to;
    for (; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function hex8(n) { return pad((n >>> 0).toString(16), 8); }

  /* ================= UTF-8 ================= */
  function utf8(str) {
    str = String(str);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [], i, c, d;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length && (d = str.charCodeAt(i + 1)) >= 0xDC00 && d <= 0xDFFF) {
        c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++;
      } else if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;   // 対になっていないサロゲートは TextEncoder と同じく U+FFFD
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  function crc32Text(str) { return crc32(utf8(str)); }

  /* ================= Crockford Base32（大文字。0-9 A-Z から I L O U を除いた32文字） ================= */
  var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function b32encode(bytes) {
    var out = '', buf = 0, bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      buf = (buf << 8) | (bytes[i] & 0xFF); bits += 8;
      while (bits >= 5) { bits -= 5; out += B32.charAt((buf >>> bits) & 31); }
      buf &= (1 << bits) - 1;
    }
    if (bits > 0) out += B32.charAt((buf << (5 - bits)) & 31);   // 残りのビットは0で埋める
    return out;
  }
  // 読み違えやすい文字は Crockford の決まりで読み替える（I・L→1、O→0、小文字→大文字）。U や記号は誤り。
  function b32decode(text, nBytes) {
    var s = String(text).toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0');
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B32.indexOf(s.charAt(i));
      if (v < 0) return null;
      buf = (buf << 5) | v; bits += 5;
      if (bits >= 8) { bits -= 8; out.push((buf >>> bits) & 0xFF); }
      buf &= (1 << bits) - 1;
    }
    if (nBytes !== undefined && out.length !== nBytes) return null;
    if (buf !== 0) return null;   // 埋めたはずの0でないビットが残る＝文字化け
    return out;
  }

  /* ================= 見せ合い QR の中身（18バイト） ================= */
  function stationOfReached(n) {   // rules.js の stationOf と同じ（着いた宿場の数 → { idx, round }）
    if (SA.Rules && typeof SA.Rules.stationOf === 'function') return SA.Rules.stationOf(n);
    n = clampInt(n, 0, LAST_STATION * 2);
    if (n <= LAST_STATION) return { idx: n, round: 1 };
    return { idx: Math.max(0, 2 * LAST_STATION - n), round: 2 };
  }
  // fields: { charIndex, rank, okugi, shugyo, dyeIndex, bond, day, station, round } → 18バイト
  function packGuest(f) {
    var b = new Array(PAYLOAD_BYTES), i;
    for (i = 0; i < PAYLOAD_BYTES; i++) b[i] = 0;
    var shugyo = clampInt(f.shugyo, 0, 0xFFFFFFFF), day = clampInt(f.day, 0, 0xFFFF);
    b[0] = CFG.QR_VERSION & 0xFF;
    b[1] = clampInt(f.charIndex, 0, CHAR_IDS.length - 1);
    b[2] = (clampInt(f.rank, 0, 5) & 7) | ((clampInt(f.okugi, 0, 2) & 3) << 3);
    b[3] = Math.floor(shugyo / 16777216) & 0xFF;
    b[4] = (shugyo >>> 16) & 0xFF;
    b[5] = (shugyo >>> 8) & 0xFF;
    b[6] = shugyo & 0xFF;
    b[7] = clampInt(f.dyeIndex, 0, DYE_IDS.length - 1);
    b[8] = clampInt(f.bond, 0, 255);
    b[9] = (day >>> 8) & 0xFF;
    b[10] = day & 0xFF;
    b[11] = clampInt(f.station, 0, LAST_STATION);
    b[12] = f.round === 2 ? 2 : 1;
    b[13] = 0;
    var c = crc32(b, 0, 14);
    b[14] = (c >>> 24) & 0xFF; b[15] = (c >>> 16) & 0xFF; b[16] = (c >>> 8) & 0xFF; b[17] = c & 0xFF;
    return b;
  }
  function encodeFields(f) { return PREFIX + b32encode(packGuest(f)); }

  /** state の中の1体を、見せ合い QR の文字にする。来訪していない体・知らない体は null。
   *  opt.today（'YYYY-MM-DD'）を渡さなければ SA.Steps.today()、なければ端末の今日。 */
  function encodeGuest(state, charId, opt) {
    if (!state || !state.chars) return null;
    var ci = CHAR_IDS.indexOf(charId), c = state.chars[charId];
    if (ci < 0 || !c) return null;
    var st = stationOfReached(state.stationsReached || 0);
    var di = DYE_IDS.indexOf(c.dye);
    return encodeFields({
      charIndex: ci, rank: c.rank || 0, okugi: c.okugi || 0, shugyo: c.shugyo || 0,
      dyeIndex: di < 0 ? 0 : di, bond: c.bond || 0, day: dayIndex(todayOf(opt)),
      station: st.idx, round: st.round
    });
  }

  /** 見せ合い QR の文字を解く。{ ok:true, payload } か { ok:false, reason }。
   *  reason: 'empty' 文字がない / 'prefix' 忍び足の QR ではない / 'version' 版が違う / 'length' 文字が欠けている・多い /
   *          'chars' 使えない文字がある / 'crc' 中身がこわれている / 'range' 中身の値がおかしい */
  function decodeGuest(text) {
    if (typeof text !== 'string') return { ok: false, reason: 'empty' };
    var s = text.replace(/\s+/g, '').toUpperCase();
    if (!s) return { ok: false, reason: 'empty' };
    var m = /^SA(\d+)-/.exec(s);
    if (!m) return { ok: false, reason: 'prefix' };
    if (+m[1] !== CFG.QR_VERSION) return { ok: false, reason: 'version' };
    var body = s.slice(m[0].length);
    if (body.length !== B32_LEN) return { ok: false, reason: 'length' };
    var b = b32decode(body, PAYLOAD_BYTES);
    if (!b) return { ok: false, reason: 'chars' };
    var c = ((b[14] << 24) | (b[15] << 16) | (b[16] << 8) | b[17]) >>> 0;
    if (crc32(b, 0, 14) !== c) return { ok: false, reason: 'crc' };
    if (b[0] !== CFG.QR_VERSION) return { ok: false, reason: 'version' };
    var rank = b[2] & 7, okugi = (b[2] >> 3) & 3;
    if (b[1] >= CHAR_IDS.length || rank > 5 || okugi > 2 || (b[2] & 0xE0) || b[7] >= DYE_IDS.length ||
      b[11] > LAST_STATION || (b[12] !== 1 && b[12] !== 2) || b[13] !== 0) return { ok: false, reason: 'range' };
    var day = (b[9] << 8) | b[10];
    return {
      ok: true,
      payload: {
        v: b[0], charIndex: b[1], id: CHAR_IDS[b[1]], rank: rank, okugi: okugi,
        shugyo: b[3] * 16777216 + ((b[4] << 16) | (b[5] << 8) | b[6]),
        dye: DYE_IDS[b[7]], dyeIndex: b[7], bond: b[8],
        day: day, date: dateOfDay(day), station: b[11], round: b[12]
      }
    };
  }

  /* ================= QR を描く（誤り訂正 M、余白4、黒白だけ） ================= */
  var ALNUM = /^[0-9A-Z $%*+\-./:]*$/;
  function qrMatrix(text) {
    var q = qrLib();
    if (!q) throw new Error('vendor/qrcode.js が読み込まれていません');
    var qr = q(0, 'M');   // 型番は文字の量から自動
    qr.addData(String(text), ALNUM.test(text) ? 'Alphanumeric' : 'Byte');
    qr.make();
    var n = qr.getModuleCount();
    return { size: n, dark: function (r, c) { return qr.isDark(r, c); } };
  }
  /** QR の SVG 文字列。size は表示の大きさ（px）。中身は viewBox で拡大するので、どの大きさでもくっきり。 */
  function qrSvg(text, size) {
    var m = qrMatrix(text), n = m.size, q = 4, full = n + q * 2, d = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!m.dark(r, c)) continue;
        var run = 1;
        while (c + run < n && m.dark(r, c + run)) run++;   // 横に続く黒はまとめる
        d.push('M' + (c + q) + ' ' + (r + q) + 'h' + run + 'v1h-' + run + 'z');
        c += run - 1;
      }
    }
    var px = isInt(size) && size > 0 ? size : 256;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 ' + full + ' ' + full +
      '" shape-rendering="crispEdges" role="img" aria-label="QR">' +
      '<rect width="' + full + '" height="' + full + '" fill="#ffffff"/>' +
      '<path fill="#000000" d="' + d.join('') + '"/></svg>';
  }

  /* ================= QR を読む（jsQR） ================= */
  /** RGBA の画素（Uint8ClampedArray）から読む。読めなければ null。 */
  function readRGBA(data, w, h, inversion) {
    var j = jsqrLib();
    if (!j || !w || !h) return null;
    try {
      var r = j(data, w, h, { inversionAttempts: inversion || 'attemptBoth' });
      return r && typeof r.data === 'string' && r.data ? r.data : null;
    } catch (e) { return null; }
  }
  function cameraReason(err) {
    var n = err && err.name;
    if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') return 'denied';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError' || n === 'ConstraintNotSatisfiedError') return 'noCamera';
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'busy';
    if (n === 'NotSupportedError' || n === 'TypeError') return 'unsupported';   // 許可を出す画面を出せない開き方など
    return 'error';
  }

  /** カメラで読む。戻り値（Promise）は stop()。
   *  opts.onResult(text, decoded) … QR が読めたとき（decoded は decodeGuest の結果）。忍び足の QR が読めたら自動で止まる
   *                                  （opts.keepGoing が true なら止めない）。同じ文字を続けて読んだときは1回だけ知らせる。
   *  opts.onError(reason, err)   … 'noCamera' カメラがない / 'denied' 許可がない / 'busy' ほかのアプリが使っている /
   *                                  'insecure' 安全でない開き方 / 'unsupported' この画面ではカメラが使えない / 'noLib' 読み取りの部品がない / 'hidden' 画面を離れたので止めた / 'error'
   *  映像は video と canvas の中だけで使い、どこにも送らない・保存しない。止めるとカメラのトラックをすべて止める。 */
  function scanCamera(videoEl, opts) {
    opts = opts || {};
    var stopped = false, stream = null, raf = 0, last = '', lastScan = 0, canvas = null, ctx = null;
    var doc = root.document, nav = root.navigator;
    function fail(reason, err) { stop(); if (typeof opts.onError === 'function') { try { opts.onError(reason, err || null); } catch (e) { } } }
    function onVis() { if (doc && doc.hidden && !stopped) fail('hidden'); }
    function stop() {
      if (stopped) return;
      stopped = true;
      if (raf && typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(raf);
      raf = 0;
      if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { } }
      stream = null;
      if (videoEl) {
        try { videoEl.pause(); } catch (e) { }
        try { videoEl.srcObject = null; } catch (e) { }
      }
      if (canvas) { canvas.width = canvas.height = 0; canvas = ctx = null; }   // 写した画を残さない
      if (doc) doc.removeEventListener('visibilitychange', onVis);
    }
    function tick(ts) {
      if (stopped) return;
      raf = root.requestAnimationFrame(tick);
      if (ts - lastScan < 120) return;   // 1秒に8回ほど読めば足りる（電池を食わない）
      lastScan = ts;
      var vw = videoEl.videoWidth, vh = videoEl.videoHeight;
      if (!vw || !vh || videoEl.readyState < 2) return;
      var k = Math.min(1, 640 / Math.max(vw, vh)), w = Math.max(1, Math.round(vw * k)), h = Math.max(1, Math.round(vh * k));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      var text = null;
      try {
        ctx.drawImage(videoEl, 0, 0, w, h);
        text = readRGBA(ctx.getImageData(0, 0, w, h).data, w, h, 'dontInvert');
      } catch (e) { text = null; }
      if (!text || text === last) return;
      last = text;
      var dec = decodeGuest(text);
      if (typeof opts.onResult === 'function') { try { opts.onResult(text, dec); } catch (e) { } }
      if (dec.ok && !opts.keepGoing) stop();
    }
    if (!videoEl || !doc) { fail('error'); return Promise.resolve(stop); }
    if (!jsqrLib()) { fail('noLib'); return Promise.resolve(stop); }
    if (!nav || !nav.mediaDevices || typeof nav.mediaDevices.getUserMedia !== 'function') {
      fail(root.isSecureContext === false ? 'insecure' : 'noCamera');
      return Promise.resolve(stop);
    }
    return nav.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
      if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); return stop; }
      stream = s;
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('muted', '');
      videoEl.muted = true;
      videoEl.srcObject = s;
      canvas = doc.createElement('canvas');
      ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
      doc.addEventListener('visibilitychange', onVis);
      var p = null;
      try { p = videoEl.play(); } catch (e) { }
      if (p && typeof p.catch === 'function') p.catch(function () { });   // 自動再生の決まりで止められても、読み取りの輪は回す
      raf = root.requestAnimationFrame(tick);
      return stop;
    }, function (err) {
      fail(cameraReason(err), err);
      return stop;
    });
  }

  /** 画像ファイル（File / Blob）から読む。読めた文字か null。 */
  function scanImageFile(file) {
    var doc = root.document, URLs = root.URL;
    if (!file || !doc || !URLs || typeof URLs.createObjectURL !== 'function') return Promise.resolve(null);
    return new Promise(function (resolve) {
      var url = URLs.createObjectURL(file), img = new root.Image();
      function done(v) { try { URLs.revokeObjectURL(url); } catch (e) { } resolve(v); }
      img.onerror = function () { done(null); };
      img.onload = function () {
        var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
        if (!W || !H) return done(null);
        var cv = doc.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true }) || cv.getContext('2d');
        // 大きすぎる写真は縮めて読む。読めなければ別の大きさでもう一度
        var tries = [1600, 800, 2400, 400], seen = {};
        for (var i = 0; i < tries.length; i++) {
          var k = Math.min(1, tries[i] / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
          if (seen[w + 'x' + h]) continue;
          seen[w + 'x' + h] = true;
          cv.width = w; cv.height = h;
          cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);   // 透明な部分は白として読む
          cx.drawImage(img, 0, 0, w, h);
          var t = null;
          try { t = readRGBA(cx.getImageData(0, 0, w, h).data, w, h, 'attemptBoth'); } catch (e) { t = null; }
          if (t) { cv.width = cv.height = 0; return done(t); }
        }
        cv.width = cv.height = 0;
        done(null);
      };
      img.src = url;
    });
  }

  /* ================= 書き出し・読み込み ================= */
  function stamp(now) {
    var t = now instanceof Date ? now : new Date();
    return t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate());
  }
  /** 全データの書き出しファイル。opt.now（Date）はテスト用。 */
  function exportFile(state, opt) {
    opt = opt || {};
    var now = opt.now instanceof Date ? opt.now : new Date();
    var body = JSON.stringify(state);
    var wrap = { app: CFG.APP_ID, v: CFG.DATA_VERSION, exportedAt: now.toISOString(), crc32: hex8(crc32Text(body)), state: JSON.parse(body) };
    return { name: CFG.APP_ID + '-' + stamp(now) + '.json', text: JSON.stringify(wrap, null, 1) };
  }
  /** 書き出しファイルを読む。{ ok:true, state, exportedAt } か { ok:false, reason, errors? }。
   *  reason: 'empty' / 'tooLarge' / 'json' こわれている / 'app' 忍び足のファイルではない / 'version' 新しい版のファイル /
   *          'format' 形が違う / 'crc' 中身が書きかわっている / 'invalid' 中身の値がおかしい（errors に詳しく） */
  function importFile(text) {
    if (typeof text !== 'string' || !text) return { ok: false, reason: 'empty' };
    if (text.length > MAX_IMPORT) return { ok: false, reason: 'tooLarge' };
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var o;
    try { o = JSON.parse(text); } catch (e) { return { ok: false, reason: 'json' }; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, reason: 'format' };
    if (o.app !== CFG.APP_ID) return { ok: false, reason: 'app' };
    if (!isInt(o.v) || o.v < 1) return { ok: false, reason: 'format' };
    if (o.v > CFG.DATA_VERSION) return { ok: false, reason: 'version' };
    if (!o.state || typeof o.state !== 'object' || Array.isArray(o.state) || typeof o.crc32 !== 'string' || !/^[0-9a-fA-F]{8}$/.test(o.crc32)) return { ok: false, reason: 'format' };
    if (crc32Text(JSON.stringify(o.state)) !== (parseInt(o.crc32, 16) >>> 0)) return { ok: false, reason: 'crc' };
    var s = o.state;
    if (s.app !== undefined && s.app !== CFG.APP_ID) return { ok: false, reason: 'app' };
    if (typeof s.v === 'number' && s.v > CFG.DATA_VERSION) return { ok: false, reason: 'version' };
    var R = SA.Rules;
    if (R && typeof R.migrate === 'function') {
      var m = null;
      try { m = R.migrate(s); } catch (e) { m = null; }
      if (!m) return { ok: false, reason: 'invalid', errors: ['migrate'] };
      s = m;
      if (typeof R.validate === 'function') {
        var v = R.validate(s);
        if (!v.ok) return { ok: false, reason: 'invalid', errors: v.errors };
      }
    }
    return { ok: true, state: s, exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : null };
  }

  /* ================= 診断ファイル（テスター用 CSV） ================= */
  var DIAG_COLUMNS = ['date', 'shugyo', 'rejected', 'capped', 'goal', 'home', 'family', 'opens', 'walkBlocks'];
  function diagRows(state) {
    if (SA.Rules && typeof SA.Rules.diagnostics === 'function') return SA.Rules.diagnostics(state);
    // rules.js がないとき（単体の試し）は同じ9項目をここで作る
    var daily = (state && state.daily) || {};
    return {
      columns: DIAG_COLUMNS.slice(),
      rows: Object.keys(daily).filter(function (d) { return ymdParse(d) !== null; }).sort().map(function (d) {
        var r = daily[d] || {};
        return [d, r.shugyo || 0, r.rejected || 0, r.capped ? 1 : 0, r.goal ? 1 : 0, r.home ? 1 : 0, r.family ? 1 : 0, r.opens || 0, r.walkBlocks || 0];
      })
    };
  }
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;   // 表計算ソフトで式として動かないように
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  /** 9項目の CSV。名前・歩数そのもの・端末の情報は入れない。opt.now（Date）はテスト用。 */
  function diagnosticsFile(state, opt) {
    opt = opt || {};
    var d = diagRows(state), lines = [d.columns.map(csvCell).join(',')];
    d.rows.forEach(function (r) { lines.push(r.map(csvCell).join(',')); });
    return { name: CFG.APP_ID + '-diag-' + stamp(opt.now) + '.csv', text: lines.join('\r\n') + '\r\n' };
  }

  /* ================= ファイルを保存する ================= */
  function capPlugin(name) {
    var c = root.Capacitor;
    if (c && c.Plugins && c.Plugins[name]) return c.Plugins[name];
    if (SA.Cap && typeof SA.Cap.plugin === 'function') { try { return SA.Cap.plugin(name); } catch (e) { } }
    return null;
  }
  function isNative() {
    if (SA.Cap && typeof SA.Cap.isNative === 'function') { try { return !!SA.Cap.isNative(); } catch (e) { } }
    var c = root.Capacitor;
    try { return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform()); } catch (e) { return false; }
  }
  function mimeOf(name) {
    if (/\.json$/i.test(name)) return 'application/json';
    if (/\.csv$/i.test(name)) return 'text/csv;charset=utf-8';
    return 'text/plain;charset=utf-8';
  }
  function safeName(name) {
    var n = String(name || 'shinobi-ashi.txt').replace(/[^0-9A-Za-z._-]/g, '_').replace(/^\.+/, '');
    return n || 'shinobi-ashi.txt';
  }
  /** 文字のファイルを保存する。戻り値（Promise）は { ok, via:'download'|'share'|'file', uri?, reason? }。
   *  ブラウザ: Blob と a[download] でダウンロード。
   *  アプリ: @capacitor/filesystem でキャッシュのフォルダに書き、@capacitor/share の共有シートを出す（送り先は本人が選ぶ）。 */
  function saveText(name, text, opt) {
    opt = opt || {};
    name = safeName(name);
    text = String(text === undefined || text === null ? '' : text);
    if (isNative()) {
      var FS = capPlugin('Filesystem');
      if (!FS) return Promise.resolve({ ok: false, reason: 'noFilesystem' });
      return Promise.resolve(FS.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true })).then(function (w) {
        var uri = w && w.uri;
        var SH = capPlugin('Share');
        if (!SH || !uri) return { ok: true, via: 'file', uri: uri || null };
        return Promise.resolve(SH.share({ title: name, files: [uri], dialogTitle: name })).then(function () {
          return { ok: true, via: 'share', uri: uri };
        }, function (err) {
          var msg = String((err && (err.message || err.errorMessage)) || err || '');
          if (/cancel/i.test(msg)) return { ok: false, via: 'share', uri: uri, reason: 'canceled' };
          // 古い版の共有プラグインは files を知らないので url でもう一度
          return Promise.resolve(SH.share({ title: name, url: uri, dialogTitle: name })).then(function () {
            return { ok: true, via: 'share', uri: uri };
          }, function () { return { ok: true, via: 'file', uri: uri, reason: 'shareFailed' }; });
        });
      }, function () { return { ok: false, reason: 'writeFailed' }; });
    }
    var doc = root.document, URLs = root.URL;
    if (!doc || !doc.body || !URLs || typeof URLs.createObjectURL !== 'function' || typeof root.Blob !== 'function') {
      return Promise.resolve({ ok: false, reason: 'noDownload' });
    }
    try {
      var blob = new root.Blob([text], { type: mimeOf(name) });
      var url = URLs.createObjectURL(blob);
      var a = doc.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
      doc.body.appendChild(a);
      a.click();
      setTimeout(function () { try { doc.body.removeChild(a); } catch (e) { } try { URLs.revokeObjectURL(url); } catch (e) { } }, 1000);
      return Promise.resolve({ ok: true, via: 'download' });
    } catch (e) {
      return Promise.resolve({ ok: false, reason: 'downloadFailed' });
    }
  }

  /* ================= 画面に出す言葉（ふりがな書式） ================= */
  var MESSAGES = {
    empty: '{何|なに}も{読|よ}めませんでした。',
    prefix: '{忍|しの}び{足|あし}の QR ではないようです。',
    version: 'ちがう{版|ばん}の{忍|しの}び{足|あし}で{作|つく}られたものです。',
    length: '{文字|もじ}が{足|た}りないか、{多|おお}すぎます。もう{一度|いちど}{読|よ}んでね。',
    chars: '{読|よ}めない{文字|もじ}があります。もう{一度|いちど}{読|よ}んでね。',
    crc: '{中身|なかみ}がこわれているようです。もう{一度|いちど}{読|よ}んでね。',
    range: '{中身|なかみ}の{数|かず}がおかしいようです。',
    noCamera: 'カメラが{見|み}つかりません。{画像|がぞう}のファイルから{読|よ}めます。',
    denied: 'カメラを{使|つか}う{許可|きょか}がありません。{画像|がぞう}のファイルから{読|よ}めます。',
    busy: 'カメラをほかのアプリが{使|つか}っています。',
    insecure: 'この{開|ひら}き{方|かた}ではカメラが{使|つか}えません。{画像|がぞう}のファイルから{読|よ}めます。',
    unsupported: 'この{画面|がめん}ではカメラが{使|つか}えません。{画像|がぞう}のファイルから{読|よ}めます。',
    noLib: '{読|よ}み{取|と}りの{部品|ぶひん}がありません。',
    hidden: '{画面|がめん}をはなれたので、カメラを{止|と}めました。',
    error: 'うまくいきませんでした。もう{一度|いちど}ためしてね。',
    notFound: 'QR が{見|み}つかりませんでした。',
    tooLarge: 'ファイルが{大|おお}きすぎます。',
    json: 'ファイルがこわれているようです。',
    app: '{忍|しの}び{足|あし}のファイルではないようです。',
    format: 'ファイルの{形|かたち}がちがいます。',
    invalid: 'ファイルの{中身|なかみ}がおかしいようです。',
    canceled: '{保存|ほぞん}をやめました。',
    noFilesystem: 'この{端末|たんまつ}では{保存|ほぞん}できません。',
    writeFailed: '{保存|ほぞん}できませんでした。',
    noDownload: 'この{画面|がめん}では{保存|ほぞん}できません。',
    downloadFailed: '{保存|ほぞん}できませんでした。'
  };
  function message(reason) { return MESSAGES[reason] || MESSAGES.error; }

  var api = {
    PREFIX: PREFIX, PAYLOAD_BYTES: PAYLOAD_BYTES, TEXT_LENGTH: PREFIX.length + B32_LEN, DAY0: DAY0, DIAG_COLUMNS: DIAG_COLUMNS,
    encodeGuest: encodeGuest, decodeGuest: decodeGuest,
    qrSvg: qrSvg, qrMatrix: qrMatrix,
    scanCamera: scanCamera, scanImageFile: scanImageFile, readRGBA: readRGBA,
    exportFile: exportFile, importFile: importFile, diagnosticsFile: diagnosticsFile, saveText: saveText,
    MESSAGES: MESSAGES, message: message,
    // 下の部品はテストと画面の道具用
    crc32: crc32, crc32Text: crc32Text, utf8: utf8, b32encode: b32encode, b32decode: b32decode,
    packGuest: packGuest, encodeFields: encodeFields, dayIndex: dayIndex, dateOfDay: dateOfDay, cameraReason: cameraReason
  };
  SA.Share = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
