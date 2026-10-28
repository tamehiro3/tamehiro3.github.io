/* 忍び足（しのびあし）— ルールの正本（DOM なし・Node でも動く）
 *
 * 仕様は docs/SPEC.md の 2.2。数値は data.js（SA.DATA）、39体の並びとクランは chars.js（NSL_CHARS）。
 *  - 時計を直接読まない（今日の日付は引数でもらう）。乱数を使わない（同じ入力なら同じ結果）。
 *  - 日付は 'YYYY-MM-DD' の文字列。曜日・祝日はこの文字列から計算する。
 *    満月・二十四節気は日本の暦に合わせて日本時間（UTC+9）で計算する（端末の時間帯に左右されない）。
 *  - 状態を書きかえる関数は、もらった state を変えずに、写しを作って返す。
 *  - 連続日数（ストリーク）は数えない・返さない。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var D = SA.DATA || (typeof require === 'function' ? require('./data.js') : null);
  var CH = root.NSL_CHARS || (typeof require === 'function' ? require('./chars.js') : null);
  var CFG = D.CONFIG;
  var DAY_MS = 86400000;

  var CHAR_IDS = CH.CHARS.map(function (c) { return c.id; });   // charIndex の並び（0〜38）
  var REP_IDS = D.REPS.map(function (r) { return r.id; });
  var DYE_IDS = D.DYES.map(function (d) { return d.id; });
  var MAX_STATIONS = (D.STATIONS.length - 1) * 2;              // 100（一巡目50＋二巡目50）
  var MULT100 = Math.round(CFG.AFFINITY_MULT * 100);            // 120
  var DIAG_COLUMNS = ['date', 'shugyo', 'rejected', 'capped', 'goal', 'home', 'family', 'opens', 'walkBlocks'];
  var ROUTES = ['ios', 'androidB', 'androidC', 'sim', 'none'];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }   // 配列でないオブジェクト
  function has(arr, x) { return arr.indexOf(x) >= 0; }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function nonNeg(n) { return isInt(n) && n >= 0; }
  function num(n) { n = Number(n); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }

  /* ================= 日付 ================= */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(s) {
    var m = typeof s === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1) return null;
    var dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (d > dim) return null;
    return [y, mo, d];
  }
  function isDate(s) { return !!parse(s); }
  function fmt(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function dayNo(s) { var p = parse(s); return Date.UTC(p[0], p[1] - 1, p[2]) / DAY_MS; } // 1970-01-01 からの日数
  function fromDayNo(n) { var t = new Date(n * DAY_MS); return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
  function addDays(s, n) { return fromDayNo(dayNo(s) + (n | 0)); }
  function diffDays(a, b) { return dayNo(b) - dayNo(a); }          // a から b まで何日（b − a）
  function weekday(s) { var p = parse(s); return new Date(p[0], p[1] - 1, p[2], 12).getDay(); } // 0=日 … 6=土
  function mondayOf(s) { var w = weekday(s); return addDays(s, -((w + 7 - D.WEEK_START) % 7)); }

  /* ----- 祝日（国民の祝日に関する法律の現行の決め方。2020年以降を対象） ----- */
  var HOLI_CACHE = {};
  function nthMonday(y, m, n) { var w = new Date(y, m - 1, 1, 12).getDay(); return 1 + ((8 - w) % 7) + (n - 1) * 7; }
  function shunbun(y) { return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }
  function shubun(y) { return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }
  function holidaysOf(y) {
    if (HOLI_CACHE[y]) return HOLI_CACHE[y];
    var base = {}, all = {};
    function add(m, d, name, kana) { base[fmt(y, m, d)] = { name: name, kana: kana }; }
    add(1, 1, '元日', 'がんじつ');
    add(1, nthMonday(y, 1, 2), '成人の日', 'せいじんのひ');
    add(2, 11, '建国記念の日', 'けんこくきねんのひ');
    add(2, 23, '天皇誕生日', 'てんのうたんじょうび');
    add(3, shunbun(y), '春分の日', 'しゅんぶんのひ');
    add(4, 29, '昭和の日', 'しょうわのひ');
    add(5, 3, '憲法記念日', 'けんぽうきねんび');
    add(5, 4, 'みどりの日', 'みどりのひ');
    add(5, 5, 'こどもの日', 'こどものひ');
    add(7, nthMonday(y, 7, 3), '海の日', 'うみのひ');
    add(8, 11, '山の日', 'やまのひ');
    add(9, nthMonday(y, 9, 3), '敬老の日', 'けいろうのひ');
    add(9, shubun(y), '秋分の日', 'しゅうぶんのひ');
    add(10, nthMonday(y, 10, 2), 'スポーツの日', 'スポーツのひ');
    add(11, 3, '文化の日', 'ぶんかのひ');
    add(11, 23, '勤労感謝の日', 'きんろうかんしゃのひ');
    var k;
    for (k in base) all[k] = base[k];
    // 振替休日: 祝日が日曜なら、その後のいちばん近い「祝日でない日」
    for (k in base) {
      if (weekday(k) !== 0) continue;
      var n = addDays(k, 1);
      while (all[n]) n = addDays(n, 1);
      all[n] = { name: '振替休日', kana: 'ふりかえきゅうじつ' };
    }
    // 国民の休日: 前の日と次の日がどちらも国民の祝日で、その日は祝日でない
    var d0 = fmt(y, 1, 2), last = fmt(y, 12, 30);
    for (var dd = d0; dd <= last; dd = addDays(dd, 1)) {
      if (base[dd] || all[dd]) continue;
      if (base[addDays(dd, -1)] && base[addDays(dd, 1)]) all[dd] = { name: '国民の休日', kana: 'こくみんのきゅうじつ' };
    }
    HOLI_CACHE[y] = all;
    return all;
  }
  function holidayName(s) { var p = parse(s); if (!p) return null; var h = holidaysOf(p[0])[s]; return h ? { name: h.name, kana: h.kana } : null; }
  function isHoliday(s) { return !!holidayName(s); }
  function isOffDay(s) { var w = weekday(s); return w === 0 || w === 6 || isHoliday(s); } // 土日・祝日

  /* ----- 天文（簡易式。日本時間の暦日で判定） ----- */
  var JST = 9 / 24;
  function jdMidnightJST(s) { return dayNo(s) + 2440587.5 - JST; }   // その日の 0:00（日本時間）のユリウス日
  function rad(x) { return x * Math.PI / 180; }
  function mod(a, b) { return ((a % b) + b) % b; }
  // 太陽の視黄経（度）。Meeus『天文計算』の低精度式（誤差 0.01 度ほど＝十数分）
  function sunLongitude(jd) {
    var T = (jd - 2451545.0) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = rad(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    var om = rad(125.04 - 1934.136 * T);
    return mod(L0 + C - 0.00569 - 0.00478 * Math.sin(om), 360);
  }
  // 太陽黄経 0°（春分）から 15°ごと
  var SEKKI = [
    ['春分', 'しゅんぶん'], ['清明', 'せいめい'], ['穀雨', 'こくう'], ['立夏', 'りっか'], ['小満', 'しょうまん'], ['芒種', 'ぼうしゅ'],
    ['夏至', 'げし'], ['小暑', 'しょうしょ'], ['大暑', 'たいしょ'], ['立秋', 'りっしゅう'], ['処暑', 'しょしょ'], ['白露', 'はくろ'],
    ['秋分', 'しゅうぶん'], ['寒露', 'かんろ'], ['霜降', 'そうこう'], ['立冬', 'りっとう'], ['小雪', 'しょうせつ'], ['大雪', 'たいせつ'],
    ['冬至', 'とうじ'], ['小寒', 'しょうかん'], ['大寒', 'だいかん'], ['立春', 'りっしゅん'], ['雨水', 'うすい'], ['啓蟄', 'けいちつ']
  ];
  function solarTerm(s) {
    if (!isDate(s)) return null;
    var jd = jdMidnightJST(s);
    var k0 = Math.floor(sunLongitude(jd) / 15), k1 = Math.floor(sunLongitude(jd + 1) / 15);
    if (k0 === k1) return null;
    var t = SEKKI[k1 % 24];
    return { name: t[0], kana: t[1], deg: (k1 % 24) * 15 };
  }
  // 月齢（平均の朔望月）。基準の新月 2000-01-06 18:14 UTC。その日の正午（日本時間）で見る
  var NEW_MOON_JD = 2451549.5 + (18 + 14 / 60) / 24;
  var SYNODIC = 29.530588853;
  function moonAge(s) { return mod(jdMidnightJST(s) + 0.5 - NEW_MOON_JD, SYNODIC); }
  function isFullMoon(s) { if (!isDate(s)) return false; var a = moonAge(s); return a >= 13.8 && a <= 15.8; }

  /* ================= 位・奥義 ================= */
  function rankOf(total) {
    var r = 0;
    for (var i = 1; i < D.RANKS.length; i++) if (total >= D.RANKS[i].total) r = i;
    return r;
  }
  function okugiOf(total) {
    var n = 0;
    for (var i = 0; i < CFG.OKUGI.length; i++) if (total >= CFG.OKUGI[i]) n = i + 1;
    return n;
  }
  function rankInfo(total) {
    var r = rankOf(total), cur = D.RANKS[r].total, nx = D.RANKS[r + 1];
    var o = okugiOf(total);
    var info = { rank: r, total: total, okugi: o, nextAt: null, toNext: 0, progress: 1 };
    if (nx) { info.nextAt = nx.total; info.toNext = nx.total - total; info.progress = (total - cur) / (nx.total - cur); }
    else if (o < CFG.OKUGI.length) { var from = o ? CFG.OKUGI[o - 1] : cur; info.nextAt = CFG.OKUGI[o]; info.toNext = CFG.OKUGI[o] - total; info.progress = (total - from) / (CFG.OKUGI[o] - from); info.nextIsOkugi = true; }
    return info;
  }

  /* ================= 状態 ================= */
  function charRec(today) { return { joined: today, shugyo: 0, rank: 0, okugi: 0, bond: 0, dye: 'none', lastBondDate: null }; }
  // 主相棒になれるのは REPS の4体（設計図 5.1）
  function isMainId(id) { return typeof id === 'string' && has(REP_IDS, id); }
  function newState(opt) {
    opt = opt || {};
    var mainId = opt.mainId;
    if (!isMainId(mainId)) throw new Error('mainId が正しくありません: ' + mainId);
    var mode = opt.mode === 'otona' ? 'otona' : 'kodomo';
    var today = isDate(opt.today) ? opt.today : '2026-01-01';
    var chars = {}; chars[mainId] = charRec(today);
    return {
      app: CFG.APP_ID, v: CFG.DATA_VERSION,
      createdAt: today, mode: mode, goal: CFG.GOAL[mode].def, mainId: mainId, route: has(ROUTES, opt.route) ? opt.route : 'none',
      furigana: true,
      slots: [mainId, null, null], alloc: [100, 0, 0],
      chars: chars,
      visits: 0, foundIds: [],
      jin: { shadow: false, revealed: false },
      visitTotal: 0, roadTotal: 0, hideTotal: 0, searches: 0,
      hideBase: 0,   // かくれる探しが始まった（14万）時点の hideTotal。探す回数はここからの累計で数える
      scrolls: 0, scrollsOpened: 0,
      stationsReached: 0, round: 1, diary: [],
      dyes: ['none', 'ai'], lastDyeDate: null,
      daily: {}, recent: {},
      board: [], guests: [],
      lastSync: null, lastSyncDate: null,
      settings: { homeButton: true, familyButton: true, notify: { evening: CFG.NOTIFY.eveningDefault, on: true }, showSecretNames: false, sound: true }
    };
  }
  function dayRec(s, date) {
    var r = s.daily[date];
    if (!r) r = s.daily[date] = {};
    var def = { shugyo: 0, rejected: 0, capped: false, goal: false, home: false, family: false, src: null, opens: 0, walkBlocks: 0,
      aff: {}, alloc: {}, gain: {}, bond: {}, scrolls: 0, visits: [], stations: [] };
    for (var k in def) if (!(k in r)) r[k] = def[k];
    return r;
  }
  function visited(s, id) { return !!(s.chars && s.chars[id]); }

  /* 来訪を待っている列: 見つけた体 → 固定順（主相棒・来訪済みを除く）→ 刃 */
  function queue(s) {
    var q = [];
    (s.foundIds || []).forEach(function (id) { if (id !== 'jin' && !visited(s, id) && !has(q, id)) q.push(id); });
    D.VISIT_ORDER.forEach(function (id) { if (id !== 'jin' && !visited(s, id) && !has(q, id)) q.push(id); });
    if (!visited(s, 'jin')) q.push('jin');
    return q;
  }
  function hideCandidates(s) {
    var q = queue(s), out = [];
    for (var i = 0; i < q.length && out.length < CFG.HIDE_CANDIDATES; i++) {
      if (q[i] === 'jin' || has(s.foundIds || [], q[i])) continue;
      out.push(q[i]);
    }
    return out;
  }
  // 14万（hideOpen）からの隠れ里の累計
  function hideSince(s) { return Math.max(0, s.hideTotal - (s.hideBase || 0)); }
  function searchesLeft(s) {
    if (s.visitTotal < CFG.HIDE_SEARCH_FROM) return 0;
    return Math.max(0, Math.floor(hideSince(s) / CFG.HIDE_SEARCH_STEPS) - s.searches);
  }
  function stationOf(n) {   // n 番目に着いた宿場（1〜100）→ { idx, round }
    if (n <= 0) return { idx: 0, round: 1 };
    var last = D.STATIONS.length - 1;   // 50
    if (n <= last) return { idx: n, round: 1 };
    return { idx: Math.max(0, 2 * last - n), round: 2 };
  }

  /* ================= 1日の計算 ================= */
  function bucketInfo(b, mode) {
    // b: 24（60分）か 96（15分）。それ以外の長さは「区間なし」として扱う
    if (!Array.isArray(b) || (b.length !== 24 && b.length !== 96)) return null;
    var len = b.length, minutes = 1440 / len, per = len / 24;
    var acc = new Array(len), rejected = 0, hourly = [], i;
    for (i = 0; i < 24; i++) hourly.push(0);
    for (i = 0; i < len; i++) {
      var v = num(b[i]);
      var hour = Math.floor(i / per);
      var bad = (v * 60 / minutes > CFG.REJECT.perHour) || (v / minutes > CFG.REJECT.perMinute);
      if (mode === 'kodomo' && hour >= CFG.REJECT.kidsNightFrom && hour < CFG.REJECT.kidsNightTo) bad = true;
      if (bad) { rejected += v; acc[i] = 0; } else acc[i] = v;
      hourly[hour] += acc[i];
    }
    return { len: len, per: per, raw: b.map(num), acc: acc, hourly: hourly, rejected: rejected };
  }
  function sumRange(hourly, from, to) { var t = 0; for (var h = from; h < to; h++) t += hourly[h] || 0; return t; }

  /* 相性の判定。true/false、区間が要るのに無いときは null（判定なし） */
  function judgeAffinity(spec, id, x) {
    if (!spec) return false;
    var kids = x.mode === 'kodomo', bi = x.bi;
    switch (spec.type) {
      case 'clan': {
        var w = D.CLAN_WINDOWS[(CH.BY_ID[id] || {}).clan];
        if (!w) return false;
        if (!bi) return null;
        var r = kids && w.kids ? w.kids : w;
        return sumRange(bi.hourly, r.from, r.to) >= CFG.AFFINITY_MIN_STEPS;
      }
      case 'win': {
        if (!bi) return null;
        var rr = kids && spec.kids ? spec.kids : spec;
        return sumRange(bi.hourly, rr.from, rr.to) >= CFG.AFFINITY_MIN_STEPS;
      }
      case 'cont': {
        if (!bi) return null;
        var need = CFG.CONT_STEPS_PER_HOUR;
        for (var i = 0; i + bi.per <= bi.len; i++) {
          var t = 0;
          for (var j = 0; j < bi.per; j++) t += bi.acc[i + j];
          if (t >= need) return true;
        }
        return false;
      }
      case 'bits': {
        if (!bi) return null;
        var c = 0;
        for (var h = 0; h < 24; h++) if (bi.hourly[h] >= CFG.BITS_MIN) c++;
        return c >= CFG.BITS_BUCKETS;
      }
      case 'holiday': return isOffDay(x.date);
      case 'weekday': return !isOffDay(x.date);
      case 'restAfter': return x.prevShugyo < CFG.REST_BELOW;
      // 我が家と道は、同じ日にはどちらか片方だけ（取り込みのあとで付け替えても、先に合った側だけ）
      case 'home': return !!x.home && !affTaken(x.aff, 'road');
      case 'road': return !x.home && !affTaken(x.aff, 'home');
      case 'family': return !!x.family;
      case 'goal': return x.shugyo >= x.goal;
      case 'with': return (spec.ids || []).some(function (o) { return o !== id && has(x.present, o) && x.visited(o); });
      case 'withRank': return x.present.some(function (o) { return o !== id && x.rankOf(o) >= spec.rank; });
      case 'fullmoon': return isFullMoon(x.date);
      case 'sekki': return !!solarTerm(x.date);
      case 'steady': {
        if (x.shugyo < CFG.STEADY_MIN || !(x.prevShugyo > 0)) return false;
        return Math.abs(x.shugyo - x.prevShugyo) <= x.prevShugyo * CFG.STEADY_RATIO;
      }
    }
    return false;
  }
  function affTaken(aff, type) {
    return Object.keys(aff || {}).some(function (k) { return aff[k] && D.AFFINITY[k] && D.AFFINITY[k].type === type; });
  }
  function credited(a, aff) { return aff ? Math.floor(a * MULT100 / 100) : a; }

  function presentIds(s, rec) {
    var p = [];
    s.slots.forEach(function (id) { if (id && !has(p, id)) p.push(id); });
    Object.keys(rec.alloc).forEach(function (id) { if (!has(p, id)) p.push(id); });
    return p;
  }

  function processDay(s, d, events) {
    var date = d.date, rec = dayRec(s, date);
    var bi = bucketInfo(d.buckets, s.mode);
    var total = num(d.steps);
    if (bi) { var bs = bi.raw.reduce(function (a, b) { return a + b; }, 0); if (bs > total) total = bs; }
    var rejected = bi ? bi.rejected : 0;
    var accepted = Math.max(0, total - rejected);
    var sh = Math.min(accepted, CFG.DAY_CAP);

    s.recent[date] = Math.max(s.recent[date] || 0, total);
    if (d.src) rec.src = d.src;
    if (rejected > rec.rejected) rec.rejected = rejected;
    var delta = 0;
    if (sh > rec.shugyo) { delta = sh - rec.shugyo; rec.shugyo = sh; }
    if (accepted >= CFG.DAY_CAP && !rec.capped) { rec.capped = true; events.push({ type: 'cap', date: date }); }
    if (rec.shugyo >= s.goal && !rec.goal) { rec.goal = true; events.push({ type: 'goal', date: date }); }

    // 累計
    var oldVisit = s.visitTotal;
    s.visitTotal += delta;
    if (rec.home) s.hideTotal += delta; else s.roadTotal += delta;

    // 巻物
    var sc = Math.floor(s.visitTotal / CFG.SCROLL_STEPS) - Math.floor(oldVisit / CFG.SCROLL_STEPS);

    // 相性（その日の区間全体で判定。一度合ったら外れない）
    var prev = s.daily[addDays(date, -1)];
    var x = {
      date: date, mode: s.mode, bi: bi, home: rec.home, family: rec.family, goal: s.goal,
      shugyo: rec.shugyo, prevShugyo: prev ? prev.shugyo : 0, present: presentIds(s, rec), aff: rec.aff,
      visited: function (o) { return visited(s, o); }, rankOf: function (o) { return s.chars[o] ? s.chars[o].rank : 0; }
    };
    // 歩いていない日（修行値0）と、割り当て0%でその日まだ何も配られていない体は判定しない
    // （あとで歩いたり割り当てが増えたりしたら、その取り込みで判定する。0.2倍はさかのぼって足す）
    if (rec.shugyo > 0) s.slots.forEach(function (id, i) {
      if (!id || rec.aff[id]) return;
      if (!((s.alloc[i] || 0) > 0) && !((rec.alloc[id] || 0) > 0)) return;
      if (judgeAffinity(D.AFFINITY[id], id, x) === true) { rec.aff[id] = true; events.push({ type: 'affinity', id: id, date: date }); }
    });

    if (sc > 0) { s.scrolls += sc; rec.scrolls += sc; events.push({ type: 'scroll', n: sc }); }

    // 修行枠へ配る（端数は切り捨て、余りは主相棒へ）
    // その日・同じ割り当ての間に増えた分の累計（allocRun.sum）で割って、配り済みとの差を配る。
    // 何回に分けて読んでも、一度に読んだときと同じ配分になる。割り当てが変わったら新しい run を始める（配り済みは動かさない）
    if (delta > 0) distribute(s, rec, delta);
    // 修行値を体に積む（相性が合った体は、その日の配分の合計の 1.2 倍になるよう差分を足す）
    Object.keys(rec.alloc).forEach(function (id) {
      var c = s.chars[id];
      if (!c) return;
      var target = credited(rec.alloc[id], rec.aff[id]);
      var inc = target - (rec.gain[id] || 0);
      if (inc > 0) { c.shugyo += inc; rec.gain[id] = target; }
      // 絆（その日1回）
      if (rec.gain[id] >= 1000 && !rec.bond[id]) {
        rec.bond[id] = true; c.bond += 1;
        if (!c.lastBondDate || c.lastBondDate < date) c.lastBondDate = date;
        events.push({ type: 'bond', id: id, bond: c.bond, line: has(D.FIRST8, id) && has(D.BOND_LINES_AT, c.bond) });
      }
      // 位・奥義
      var r = rankOf(c.shugyo);
      while (c.rank < r) { c.rank++; events.push({ type: 'rank', id: id, rank: c.rank }); }
      var o = okugiOf(c.shugyo);
      while (c.okugi < o) { c.okugi++; events.push({ type: 'okugi', id: id, level: c.okugi }); }
    });

    settle(s, date, events, rec);
    if (oldVisit < CFG.HIDE_SEARCH_FROM && s.visitTotal >= CFG.HIDE_SEARCH_FROM) {
      // 探す回数は14万からの隠れ里の累計で数える（14万をまたいだ取り込みのうち、14万より後の我が家の分は数える）
      s.hideBase = Math.max(0, s.hideTotal - (rec.home ? s.visitTotal - CFG.HIDE_SEARCH_FROM : 0));
      events.push({ type: 'hideOpen' });
    }
    settleStations(s, date, events, rec);
  }

  function distribute(s, rec, delta) {
    var run = rec.allocRun;
    if (!isObj(run) || JSON.stringify(run.slots) !== JSON.stringify(s.slots) || JSON.stringify(run.alloc) !== JSON.stringify(s.alloc) || !isObj(run.given) || !nonNeg(run.sum)) {
      run = rec.allocRun = { slots: s.slots.slice(), alloc: s.alloc.slice(), sum: 0, given: {} };
    }
    run.sum += delta;
    var room = delta;
    function give(id, n) {
      if (n <= 0) return;
      run.given[id] = (run.given[id] || 0) + n;
      rec.alloc[id] = (rec.alloc[id] || 0) + n;
      room -= n;
    }
    // 主相棒でない体: floor(累計 × 割合) まで（今回の増えた分を超えては配らない）
    s.slots.forEach(function (id, i) {
      if (!id || id === s.mainId) return;
      var target = Math.floor(run.sum * (s.alloc[i] || 0) / 100);
      give(id, Math.min(room, Math.max(0, target - (run.given[id] || 0))));
    });
    // 残り（主相棒の割合の分と端数）は主相棒へ
    give(s.mainId, room);
  }

  /* 来訪・刃・金の染め（累計と回数の差を見て、足りない分の出来事を起こす） */
  function settle(s, date, events, rec) {
    // 金の染め（免許皆伝の相棒が出たら）
    D.DYES.forEach(function (dy) {
      if (dy.unlock.rank && !has(s.dyes, dy.id)) {
        var any = Object.keys(s.chars).some(function (id) { return s.chars[id].rank >= dy.unlock.rank; });
        if (any) { s.dyes.push(dy.id); events.push({ type: 'dyeUnlock', dyeId: dy.id }); }
      }
    });
    while (s.visits < D.VISIT_AT.length && s.visitTotal >= D.VISIT_AT[s.visits]) {
      var id = queue(s)[0];
      if (!id) break;
      s.visits++;
      s.chars[id] = charRec(date);
      if (rec) rec.visits.push(id);
      if (id === 'jin') { s.chars.jin.shadow = true; s.jin.shadow = true; events.push({ type: 'jinShadow' }); }
      else events.push({ type: 'visit', id: id, n: s.visits });
    }
    if (s.jin.shadow && !s.jin.revealed && s.visitTotal >= CFG.JIN_REVEAL_AT) {
      s.jin.revealed = true;
      if (s.chars.jin) s.chars.jin.shadow = false;
      events.push({ type: 'jinReveal' });
    }
  }
  function settleStations(s, date, events, rec) {
    while (s.stationsReached < MAX_STATIONS && s.roadTotal >= (s.stationsReached + 1) * CFG.ROAD_STEP) {
      s.stationsReached++;
      var at = stationOf(s.stationsReached);
      s.round = at.round;
      if (rec) rec.stations.push(at.idx);
      s.diary.push({ date: date, idx: at.idx, round: at.round, stamp: null });
      events.push({ type: 'station', idx: at.idx, round: at.round });
      var stn = D.STATIONS[at.idx];
      if (at.round === 1 && stn.event) events.push({ type: 'stationEvent', idx: at.idx, kind: stn.event });
      D.DYES.forEach(function (dy) {
        if (dy.unlock.station === at.idx && !has(s.dyes, dy.id)) { s.dyes.push(dy.id); events.push({ type: 'dyeUnlock', dyeId: dy.id }); }
      });
    }
  }

  function historyDays(route) {
    var h = CFG.HISTORY_DAYS[route];
    return typeof h === 'number' ? h : 7;   // ためし歩き（sim）・なしは iOS と同じ 7日として扱う
  }

  function ingest(state, days, ctx) {
    var s = clone(state), events = [];
    var today = ctx && ctx.today;
    if (!isDate(today)) return { state: state, events: [], error: 'today' };
    var list = (Array.isArray(days) ? days : []).filter(function (d) { return d && isDate(d.date) && d.date <= today; });
    list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    // 修行お休み: 前回の同期日から今日までに、読める日数を超えて読めなかった日
    if (s.lastSyncDate && s.lastSyncDate < today) {
      var keep = Math.max(historyDays(s.route), 1);  // 今日を含めて keep 日はさかのぼって読める
      var got = {};
      list.forEach(function (d) { got[d.date] = true; });
      var lost = 0;
      for (var dd = addDays(s.lastSyncDate, 1); dd <= addDays(today, -keep); dd = addDays(dd, 1)) if (!got[dd]) lost++;
      if (lost > 0) events.push({ type: 'rest', days: lost });
    }

    list.forEach(function (d) { processDay(s, d, events); });
    // 我が家の付け替えなどで、取り込みのない日にも累計が動くことがある
    settle(s, today, events, s.daily[today] || null);
    settleStations(s, today, events, s.daily[today] || null);

    // 実歩数は7日分だけ（8日目に消す）。端末の時計が戻ったとき（today < lastSyncDate）に先の日を消さないよう、
    // 基準は today と lastSyncDate の遅いほう
    var keepBase = s.lastSyncDate && isDate(s.lastSyncDate) && s.lastSyncDate > today ? s.lastSyncDate : today;
    Object.keys(s.recent).forEach(function (k) { if (!isDate(k) || diffDays(k, keepBase) >= CFG.RECENT_DAYS) delete s.recent[k]; });
    if (!s.lastSyncDate || today >= s.lastSyncDate) s.lastSyncDate = today;
    s.lastSync = ctx && typeof ctx.now === 'number' ? ctx.now : s.lastSync;
    return { state: s, events: events };
  }

  /* ================= 選択・設定 ================= */
  // 「今日は」の選択。date が today のときだけ受け付ける（ほかの日は state をそのまま返す）。
  // today を渡さない古い呼び方では、最後に取り込んだ日より前の日だけ断る（UI は today を渡すこと）
  function setChoice(state, date, opt, today) {
    if (!isDate(date)) return state;
    if (isDate(today)) { if (date !== today) return state; }
    else if (state.lastSyncDate && isDate(state.lastSyncDate) && date < state.lastSyncDate) return state;
    var s = clone(state), rec = dayRec(s, date);
    var home = !!(opt && opt.home);
    if (rec.home !== home) {
      if (home) { s.roadTotal = Math.max(0, s.roadTotal - rec.shugyo); s.hideTotal += rec.shugyo; }
      else { s.hideTotal = Math.max(0, s.hideTotal - rec.shugyo); s.roadTotal += rec.shugyo; }
      rec.home = home;
      // stationsReached は減らさない。次の宿場は「いちばん先に着いた宿場の次」（settleStations が見る）
    }
    return s;
  }
  function setFamilyDay(state, date, on) {
    if (!isDate(date)) return state;
    var s = clone(state);
    dayRec(s, date).family = !!on;
    return s;
  }
  // 修行枠の検査。よければ null、だめなら理由のことば
  function checkSlots(s, ids, alloc) {
    if (!Array.isArray(ids) || ids.length !== 3) return 'slotsLength';
    if (!Array.isArray(alloc) || alloc.length !== 3) return 'allocLength';
    if (!has(ids, s.mainId)) return 'mainMissing';
    var seen = [];
    for (var i = 0; i < 3; i++) {
      var id = ids[i], a = alloc[i];
      if (!isInt(a) || a < 0 || a > 100) return 'allocValue';
      if (id === null || id === undefined) { if (a !== 0) return 'nullAlloc'; continue; }
      if (!CH.BY_ID[id]) return 'unknownChar';
      if (!visited(s, id)) return 'notVisited';
      if (has(seen, id)) return 'duplicate';
      seen.push(id);
    }
    var sum = alloc[0] + alloc[1] + alloc[2];
    if (sum !== 100) return 'allocSum';
    var stepOk = alloc.every(function (a) { return a % CFG.ALLOC_STEP === 0; });
    var sorted = alloc.slice().sort(function (a, b) { return a - b; }).join(',');
    var presetOk = CFG.ALLOC_PRESETS.some(function (p) { return p.alloc.slice().sort(function (a, b) { return a - b; }).join(',') === sorted; });
    if (!stepOk && !presetOk) return 'allocStep';
    return null;
  }
  // 違反のときは例外を投げず、state を変えずに { error } を返す
  function setSlots(state, ids, alloc) {
    var err = checkSlots(state, ids, alloc);
    if (err) return { error: err };
    var s = clone(state);
    s.slots = ids.map(function (id) { return id || null; });
    s.alloc = alloc.slice();
    return s;
  }
  function setGoal(state, n) {
    var g = CFG.GOAL[state.mode] || CFG.GOAL.kodomo;
    if (!isInt(n) || n < g.min || n > g.max || (n - g.min) % CFG.GOAL.step !== 0) return { error: 'goal' };
    var s = clone(state); s.goal = n; return s;
  }
  function setMode(state, mode) {
    if (mode !== 'kodomo' && mode !== 'otona') return { error: 'mode' };
    var s = clone(state); s.mode = mode; return s;
  }
  function setStamp(state, diaryIndex, stamp) {
    if (!state.diary[diaryIndex] || !isInt(stamp) || stamp < 0) return state;
    var s = clone(state); s.diary[diaryIndex].stamp = stamp; return s;
  }
  function noteOpen(state, date) { if (!isDate(date)) return state; var s = clone(state); dayRec(s, date).opens++; return s; }
  function noteWalkingBlock(state, date) { if (!isDate(date)) return state; var s = clone(state); dayRec(s, date).walkBlocks++; return s; }

  /* ================= 巻物・隠れ里・掲示板・染め ================= */
  function openScroll(state, charId) {
    if (state.scrolls - state.scrollsOpened <= 0) return null;
    var id = charId || state.mainId;
    if (!visited(state, id)) return null;
    var s = clone(state), c = s.chars[id];
    s.scrollsOpened++;
    return { state: s, jutsu: { charId: id, fx: D.JUTSU_FX[id], rank: c.rank, okugi: c.okugi, secret: has(D.SECRET_JUTSU, id) } };
  }
  function search(state) {
    if (searchesLeft(state) <= 0) return { state: state, found: null, reason: state.visitTotal < CFG.HIDE_SEARCH_FROM ? 'notOpen' : 'noSearch' };
    var cands = hideCandidates(state);
    if (!cands.length) return { state: state, found: null, reason: 'noCandidate' };
    var s = clone(state);
    var pick = cands[(Math.floor(s.hideTotal / CFG.HIDE_SEARCH_STEPS) + s.searches) % cands.length];
    s.searches++;
    s.foundIds.push(pick);
    return { state: s, found: pick };
  }
  function dyeIdOf(v) {
    if (typeof v === 'number') return DYE_IDS[v] || null;
    return has(DYE_IDS, v) ? v : null;
  }
  function readGuest(state, payload, today) {
    var p = payload || {};
    var ci = p.charIndex;
    if (!isInt(ci) || ci < 0 || ci >= CHAR_IDS.length || !isDate(today)) return { state: state, entry: null, error: 'payload' };
    var date = typeof p.date === 'number' ? addDays('2026-01-01', p.date) : (isDate(p.date) ? p.date : today);
    var entry = {
      charIndex: ci,
      rank: Math.min(5, num(p.rank)), okugi: Math.min(2, num(p.okugi)), shugyo: num(p.shugyo),
      dye: dyeIdOf(p.dye) || 'none', bond: Math.min(255, num(p.bond)),
      station: Math.min(D.STATIONS.length - 1, num(p.station)), round: p.round === 2 ? 2 : 1,
      date: date, readAt: today
    };
    var s = clone(state), replaced = false;
    for (var i = 0; i < s.board.length; i++) {
      if (s.board[i].charIndex === ci && s.board[i].shugyo <= entry.shugyo) { s.board.splice(i, 1); replaced = true; break; }
    }
    s.board.unshift(entry);
    s.board.sort(function (a, b) { return a.readAt < b.readAt ? 1 : a.readAt > b.readAt ? -1 : 0; });
    var dropped = s.board.length > CFG.BOARD_MAX ? s.board.splice(CFG.BOARD_MAX) : [];
    // 里の客（7日）
    s.guests = s.guests.filter(function (g) { return g.until >= today && g.charIndex !== ci; });
    s.guests.push({ charIndex: ci, dye: entry.dye, until: addDays(today, CFG.GUEST_DAYS - 1) });
    var out = clone(entry); out.replaced = replaced; out.dropped = dropped.length; out.id = CHAR_IDS[ci]; out.stale = false;
    return { state: s, entry: out };
  }
  // 掲示板の表示用（14日読み直していない札は stale＝「かくれる」）
  function okCharIndex(ci) { return isInt(ci) && ci >= 0 && ci < CHAR_IDS.length; }
  function boardOf(state, today) {
    return (state.board || []).filter(function (b) { return b && okCharIndex(b.charIndex); }).map(function (b) {
      var o = clone(b); o.id = CHAR_IDS[b.charIndex];
      o.daysSince = isDate(today) ? diffDays(b.readAt, today) : 0;
      o.stale = o.daysSince >= CFG.BOARD_STALE_DAYS;
      return o;
    });
  }
  function guestsOf(state, today) {
    return (state.guests || []).filter(function (g) { return g && okCharIndex(g.charIndex) && isDate(today) && g.until >= today; })
      .map(function (g) { return { charIndex: g.charIndex, id: CHAR_IDS[g.charIndex], dye: g.dye, until: g.until }; });
  }
  function canDye(state, today) {
    if (!isDate(today) || weekday(today) !== 0) return 'notSunday';
    if (state.lastDyeDate === today) return 'already';
    return null;
  }
  function dye(state, charId, dyeId, today) {
    var why = canDye(state, today);
    if (!why && !visited(state, charId)) why = 'noChar';
    if (!why && !has(DYE_IDS, dyeId)) why = 'unknownDye';
    if (!why && !has(state.dyes, dyeId)) why = 'locked';
    if (why) return { state: state, ok: false, reason: why };
    var s = clone(state);
    s.chars[charId].dye = dyeId;
    s.lastDyeDate = today;
    return { state: s, ok: true, reason: null };
  }

  /* ================= まとめ・ふりかえり・診断 ================= */
  function affList(s, rec) { return Object.keys(rec.aff || {}).filter(function (k) { return rec.aff[k]; }); }
  function summary(state, today) {
    if (!isDate(today) || !state || typeof state !== 'object') return null;
    var s = state, rec = s.daily[today] || {};
    var shugyo = rec.shugyo || 0;
    var bi = null;
    var x = {
      date: today, mode: s.mode, bi: bi, home: !!rec.home, family: !!rec.family, goal: s.goal, shugyo: shugyo,
      prevShugyo: (s.daily[addDays(today, -1)] || {}).shugyo || 0, aff: rec.aff || {},
      present: s.slots.filter(Boolean), visited: function (o) { return visited(s, o); }, rankOf: function (o) { return s.chars[o] ? s.chars[o].rank : 0; }
    };
    var slots = s.slots.map(function (id, i) {
      if (!id) return { id: null, alloc: s.alloc[i] };
      var c = s.chars[id] || charRec(today), spec = D.AFFINITY[id] || {};
      var needsBuckets = has(['clan', 'win', 'cont', 'bits'], spec.type);
      return {
        id: id, alloc: s.alloc[i], main: id === s.mainId,
        affType: spec.type || null, affMatched: !!(rec.aff && rec.aff[id]),
        affNeedsBuckets: needsBuckets,
        affNow: needsBuckets ? null : judgeAffinity(spec, id, x),
        today: (rec.gain && rec.gain[id]) || 0,
        rank: rankInfo(c.shugyo), bond: c.bond, dye: c.dye
      };
    });
    var nextVisit = null;
    if (s.visits < D.VISIT_AT.length) {
      var at = D.VISIT_AT[s.visits];
      nextVisit = { n: s.visits + 1, at: at, remain: Math.max(0, at - s.visitTotal), jin: s.visits + 1 === D.VISIT_AT.length };
    }
    var nextStation = null;
    if (s.stationsReached < MAX_STATIONS) {
      var nn = s.stationsReached + 1, ns = stationOf(nn);
      nextStation = { n: nn, idx: ns.idx, round: ns.round, remain: Math.max(0, nn * CFG.ROAD_STEP - s.roadTotal) };
    }
    var cur = stationOf(s.stationsReached);
    return {
      date: today, mode: s.mode,
      steps: s.recent[today] || 0, goal: s.goal, shugyo: shugyo,
      cap: CFG.DAY_CAP, toCap: Math.max(0, CFG.DAY_CAP - shugyo), capped: !!rec.capped,
      goalReached: !!rec.goal, toGoal: Math.max(0, s.goal - shugyo),
      rejected: rec.rejected || 0, home: !!rec.home, family: !!rec.family,
      scrolls: s.scrolls - s.scrollsOpened, scrollsTotal: s.scrolls,
      visits: s.visits, visitTotal: s.visitTotal, nextVisit: nextVisit,
      jin: { shadow: s.jin.shadow, revealed: s.jin.revealed, toReveal: s.jin.shadow && !s.jin.revealed ? Math.max(0, CFG.JIN_REVEAL_AT - s.visitTotal) : 0 },
      roadTotal: s.roadTotal, station: { reached: s.stationsReached, idx: cur.idx, round: cur.round }, nextStation: nextStation,
      hide: { open: s.visitTotal >= CFG.HIDE_SEARCH_FROM, toOpen: Math.max(0, CFG.HIDE_SEARCH_FROM - s.visitTotal), hideTotal: s.hideTotal,
        searchesLeft: searchesLeft(s), toNextSearch: CFG.HIDE_SEARCH_STEPS - (hideSince(s) % CFG.HIDE_SEARCH_STEPS), candidates: s.visitTotal >= CFG.HIDE_SEARCH_FROM ? hideCandidates(s) : [] },
      slots: slots,
      main: rankInfo((s.chars[s.mainId] || { shugyo: 0 }).shugyo),
      holiday: holidayName(today), offDay: isDate(today) ? isOffDay(today) : false, weekday: isDate(today) ? weekday(today) : null,
      solarTerm: solarTerm(today), fullMoon: isFullMoon(today),
      canDye: !canDye(s, today), dyes: s.dyes.slice(),
      board: boardOf(s, today), guests: guestsOf(s, today)
    };
  }
  function dayReview(state, date) {
    var rec = (isDate(date) && state.daily[date]) || {};
    return {
      date: date,
      steps: state.recent[date] !== undefined ? state.recent[date] : null,   // 7日を過ぎた日は持っていない
      shugyo: rec.shugyo || 0, rejected: rec.rejected || 0, capped: !!rec.capped, goalReached: !!rec.goal,
      home: !!rec.home, family: !!rec.family,
      affinity: affList(state, rec),
      perChar: Object.keys(rec.gain || {}).map(function (id) { return { id: id, shugyo: rec.gain[id] }; }),
      scrollsToday: rec.scrolls || 0, visitsToday: (rec.visits || []).slice(), stationsToday: (rec.stations || []).slice()
    };
  }
  function weekReview(state, mondayDate) {
    if (!isDate(mondayDate)) return { monday: null, days: [], goalDays: 0, total: 0, perChar: [] };
    var mon = mondayOf(mondayDate), days = [], goalDays = 0, total = 0, per = {};
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i), rec = state.daily[d] || {};
      var row = { date: d, weekday: weekday(d), shugyo: rec.shugyo || 0, goal: !!rec.goal, home: !!rec.home, family: !!rec.family,
        steps: state.recent[d] !== undefined ? state.recent[d] : null };
      days.push(row);
      if (row.goal) goalDays++;
      total += row.shugyo;
      Object.keys(rec.gain || {}).forEach(function (id) { per[id] = (per[id] || 0) + rec.gain[id]; });
    }
    var perChar = Object.keys(per).map(function (id) { return { id: id, shugyo: per[id] }; }).sort(function (a, b) { return b.shugyo - a.shugyo; });
    return { monday: mon, days: days, goalDays: goalDays, total: total, perChar: perChar };
  }
  function diagnostics(state) {
    var rows = Object.keys(state.daily).filter(isDate).sort().map(function (d) {
      var r = state.daily[d];
      return [d, r.shugyo || 0, r.rejected || 0, r.capped ? 1 : 0, r.goal ? 1 : 0, r.home ? 1 : 0, r.family ? 1 : 0, r.opens || 0, r.walkBlocks || 0];
    });
    return { columns: DIAG_COLUMNS.slice(), rows: rows };
  }

  /* ================= 検査・版の移行 ================= */
  var DAY_OBJ = ['aff', 'alloc', 'gain', 'bond'], DAY_ARR = ['visits', 'stations'];
  var DAY_NUM = ['shugyo', 'rejected', 'opens', 'walkBlocks', 'scrolls'], DAY_BOOL = ['capped', 'goal', 'home', 'family'];
  var STATE_NUM = ['visitTotal', 'roadTotal', 'hideTotal', 'searches', 'scrolls', 'scrollsOpened', 'visits', 'stationsReached'];
  function inRange(n, lo, hi) { return isInt(n) && n >= lo && n <= hi; }
  function numMap(o) { return isObj(o) && Object.keys(o).every(function (k) { return nonNeg(o[k]); }); }
  // daily[d] の1件。ingest が落ちない形か（欠けている項目は dayRec が補うので、あるものだけ型を見る）
  function dayOk(r) {
    if (!isObj(r)) return false;
    if (DAY_NUM.some(function (k) { return k in r && !nonNeg(r[k]); })) return false;
    if (DAY_OBJ.some(function (k) { return k in r && !isObj(r[k]); })) return false;
    if (DAY_ARR.some(function (k) { return k in r && !Array.isArray(r[k]); })) return false;
    if (('alloc' in r && !numMap(r.alloc)) || ('gain' in r && !numMap(r.gain))) return false;
    if ('allocRun' in r && !runOk(r.allocRun)) return false;
    return true;
  }
  function runOk(u) {
    return isObj(u) && Array.isArray(u.slots) && u.slots.length === 3 && Array.isArray(u.alloc) && u.alloc.length === 3 &&
      u.alloc.every(function (a) { return inRange(a, 0, 100); }) && nonNeg(u.sum) && numMap(u.given);
  }
  function boardOk(b) {
    return isObj(b) && okCharIndex(b.charIndex) && isDate(b.readAt) && isDate(b.date) &&
      inRange(b.rank, 0, 5) && inRange(b.okugi, 0, 2) && nonNeg(b.shugyo) && inRange(b.bond, 0, 255) &&
      inRange(b.station, 0, D.STATIONS.length - 1) && (b.round === 1 || b.round === 2) && has(DYE_IDS, b.dye);
  }
  function guestOk(g) { return isObj(g) && okCharIndex(g.charIndex) && isDate(g.until) && has(DYE_IDS, g.dye); }
  function diaryOk(e) {
    return isObj(e) && isDate(e.date) && inRange(e.idx, 0, D.STATIONS.length - 1) &&
      (e.round === undefined || e.round === 1 || e.round === 2) && (e.stamp === null || e.stamp === undefined || nonNeg(e.stamp));
  }
  function goalOk(mode, n) { var g = CFG.GOAL[mode] || CFG.GOAL.kodomo; return isInt(n) && n >= g.min && n <= g.max && (n - g.min) % CFG.GOAL.step === 0; }

  function validate(s) {
    var e = [];
    function bad(m) { e.push(m); }
    if (!isObj(s)) return { ok: false, errors: ['notObject'] };
    if (s.app !== CFG.APP_ID) bad('app');
    if (s.v !== CFG.DATA_VERSION) bad('v');
    if (s.mode !== 'kodomo' && s.mode !== 'otona') bad('mode');
    if (!goalOk(s.mode, s.goal)) bad('goal');
    if (!isDate(s.createdAt)) bad('createdAt');
    if (!isMainId(s.mainId)) bad('mainId');
    if (!has(ROUTES, s.route)) bad('route');
    if (!isObj(s.chars)) { bad('chars'); return { ok: false, errors: e }; }
    if (!s.chars[s.mainId]) bad('mainNotInChars');
    Object.keys(s.chars).forEach(function (id) {
      var c = s.chars[id];
      if (!CH.BY_ID[id]) { bad('charId:' + id); return; }
      if (!isObj(c) || !nonNeg(c.shugyo) || !inRange(c.rank, 0, 5) || !inRange(c.okugi, 0, 2) || !nonNeg(c.bond) || !has(DYE_IDS, c.dye) ||
        (c.lastBondDate !== null && c.lastBondDate !== undefined && !isDate(c.lastBondDate))) bad('char:' + id);
    });
    if (!Array.isArray(s.slots) || !Array.isArray(s.alloc)) bad('slots');
    else if (checkSlots(s, s.slots, s.alloc)) bad('slots:' + checkSlots(s, s.slots, s.alloc));
    STATE_NUM.forEach(function (k) { if (!nonNeg(s[k])) bad(k); });
    if (s.hideBase !== undefined && !nonNeg(s.hideBase)) bad('hideBase');
    if (s.visits > D.VISIT_AT.length) bad('visits');
    if (s.scrollsOpened > s.scrolls) bad('scrollsOpened');
    if (s.stationsReached > MAX_STATIONS) bad('stationsReached');
    if (s.round !== 1 && s.round !== 2) bad('round');
    if (!Array.isArray(s.foundIds) || s.foundIds.some(function (id) { return !CH.BY_ID[id]; })) bad('foundIds');
    if (!isObj(s.jin) || typeof s.jin.shadow !== 'boolean' || typeof s.jin.revealed !== 'boolean') bad('jin');
    if (!Array.isArray(s.dyes) || s.dyes.some(function (d) { return !has(DYE_IDS, d); })) bad('dyes');
    if (s.lastDyeDate !== null && !isDate(s.lastDyeDate)) bad('lastDyeDate');
    if (!Array.isArray(s.diary) || !s.diary.every(diaryOk)) bad('diary');
    if (!isObj(s.daily) || Object.keys(s.daily).some(function (k) { return !isDate(k) || !dayOk(s.daily[k]); })) bad('daily');
    if (!isObj(s.recent) || Object.keys(s.recent).some(function (k) { return !isDate(k) || !nonNeg(s.recent[k]); })) bad('recent');
    if (!Array.isArray(s.board) || s.board.length > CFG.BOARD_MAX || !s.board.every(boardOk)) bad('board');
    if (!Array.isArray(s.guests) || !s.guests.every(guestOk)) bad('guests');
    if (s.lastSyncDate !== null && !isDate(s.lastSyncDate)) bad('lastSyncDate');
    if (s.lastSync !== null && !(typeof s.lastSync === 'number' && isFinite(s.lastSync))) bad('lastSync');
    if (!isObj(s.settings) || !isObj(s.settings.notify)) bad('settings');
    return { ok: e.length === 0, errors: e };
  }

  // 型を newState の形にそろえる（オブジェクト・配列・真偽・文字列）。数は後で個別に直す
  function shapeLike(dst, base, deep) {
    Object.keys(base).forEach(function (k) {
      var b = base[k];
      if (isObj(b)) { if (!isObj(dst[k])) dst[k] = clone(b); else if (deep) shapeLike(dst[k], b, true); }
      else if (Array.isArray(b)) { if (!Array.isArray(dst[k])) dst[k] = clone(b); }
      else if (typeof b === 'boolean') { if (typeof dst[k] !== 'boolean') dst[k] = b; }
      else if (typeof b === 'string') { if (typeof dst[k] !== 'string') dst[k] = b; }
      else if (b === null) { if (dst[k] === undefined) dst[k] = null; }
      else if (!(k in dst)) dst[k] = b;
    });
  }
  function fixGoal(mode, n) {
    var g = CFG.GOAL[mode];
    n = typeof n === 'string' && n.trim() !== '' ? Number(n) : n;
    if (typeof n !== 'number' || !isFinite(n)) return g.def;
    n = g.min + Math.round((n - g.min) / CFG.GOAL.step) * CFG.GOAL.step;
    return Math.min(g.max, Math.max(g.min, n));
  }
  function fixDay(r) {
    DAY_NUM.forEach(function (k) { if (k in r && !nonNeg(r[k])) r[k] = 0; });
    DAY_BOOL.forEach(function (k) { if (k in r) r[k] = !!r[k]; });
    DAY_OBJ.forEach(function (k) { if (k in r && !isObj(r[k])) r[k] = {}; });
    DAY_ARR.forEach(function (k) { if (k in r && !Array.isArray(r[k])) r[k] = []; });
    ['alloc', 'gain'].forEach(function (k) {
      if (!isObj(r[k])) return;
      Object.keys(r[k]).forEach(function (id) { if (!CH.BY_ID[id] || !nonNeg(r[k][id])) delete r[k][id]; });
    });
    if (isObj(r.aff)) Object.keys(r.aff).forEach(function (id) { if (!CH.BY_ID[id] || !r.aff[id]) delete r.aff[id]; else r.aff[id] = true; });
    if (Array.isArray(r.visits)) r.visits = r.visits.filter(function (id) { return typeof id === 'string' && !!CH.BY_ID[id]; });
    if (Array.isArray(r.stations)) r.stations = r.stations.filter(function (i) { return inRange(i, 0, D.STATIONS.length - 1); });
    if ('src' in r && r.src !== null && typeof r.src !== 'string') r.src = null;
    if ('allocRun' in r && !runOk(r.allocRun)) delete r.allocRun;
  }
  function migrate(obj) {
    try { return migrateInner(obj); } catch (err) { return null; }
  }
  function migrateInner(obj) {
    var o = obj;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (err) { return null; } }
    if (!isObj(o)) return null;
    if (o.app !== undefined && o.app !== CFG.APP_ID) return null;
    if (typeof o.v === 'number' && o.v > CFG.DATA_VERSION) return null;   // この版より新しいデータは読まない
    o = clone(o);
    // オブジェクトであるべきもの
    if (!isObj(o.chars)) o.chars = {};
    if (!isObj(o.daily)) o.daily = {};
    if (!isObj(o.recent)) o.recent = {};
    // 日付のおかしい日・形のおかしい日は消す
    Object.keys(o.daily).forEach(function (d) { if (!isDate(d) || !isObj(o.daily[d])) delete o.daily[d]; });
    Object.keys(o.recent).forEach(function (d) {
      var v = o.recent[d];
      if (!isDate(d) || typeof v !== 'number' || !isFinite(v) || v < 0) delete o.recent[d]; else o.recent[d] = Math.floor(v);
    });
    Object.keys(o.chars).forEach(function (id) { if (!CH.BY_ID[id] || !isObj(o.chars[id])) delete o.chars[id]; });
    // 作った日: おかしければ、いちばん古い記録の日か 2026-01-01
    if (!isDate(o.createdAt)) {
      var ds = Object.keys(o.daily).sort();
      o.createdAt = ds.length ? ds[0] : '2026-01-01';
    }
    var mode = o.mode === 'otona' ? 'otona' : 'kodomo';
    var mainId = isMainId(o.mainId) ? o.mainId : (Array.isArray(o.slots) && isMainId(o.slots[0]) ? o.slots[0] : REP_IDS[0]);
    var base = newState({ mainId: mainId, mode: mode, today: o.createdAt, route: o.route });
    shapeLike(o, base, false);
    shapeLike(o.settings, base.settings, true);
    o.app = CFG.APP_ID; o.v = CFG.DATA_VERSION; o.mainId = mainId; o.mode = mode;
    if (!has(ROUTES, o.route)) o.route = 'none';
    o.goal = fixGoal(mode, o.goal);
    if (!/^\d{2}:\d{2}$/.test(o.settings.notify.evening)) o.settings.notify.evening = base.settings.notify.evening;
    // 数
    STATE_NUM.forEach(function (k) { if (!nonNeg(o[k])) o[k] = 0; });
    if (!nonNeg(o.hideBase)) o.hideBase = 0;
    if (o.scrollsOpened > o.scrolls) o.scrollsOpened = o.scrolls;
    if (o.stationsReached > MAX_STATIONS) o.stationsReached = MAX_STATIONS;
    if (o.visits > D.VISIT_AT.length) o.visits = D.VISIT_AT.length;
    if (o.round !== 1 && o.round !== 2) o.round = stationOf(o.stationsReached).round;
    if (typeof o.lastSync !== 'number' || !isFinite(o.lastSync)) o.lastSync = null;
    if (!isDate(o.lastSyncDate)) o.lastSyncDate = null;
    if (!isDate(o.lastDyeDate)) o.lastDyeDate = null;
    o.jin.shadow = !!o.jin.shadow; o.jin.revealed = !!o.jin.revealed;
    // 体
    if (!o.chars[mainId]) o.chars[mainId] = charRec(o.createdAt);
    Object.keys(o.chars).forEach(function (id) {
      var c = o.chars[id];
      if (!nonNeg(c.shugyo)) c.shugyo = 0;
      // 位・奥義がおかしければ 0（次の取り込みで、累計に合わせて1段ずつ上がる）
      if (!inRange(c.rank, 0, 5)) c.rank = 0;
      if (!inRange(c.okugi, 0, 2)) c.okugi = 0;
      if (!nonNeg(c.bond)) c.bond = 0;
      if (!has(DYE_IDS, c.dye)) c.dye = 'none';
      if (!isDate(c.joined)) c.joined = o.createdAt;
      if (!isDate(c.lastBondDate)) c.lastBondDate = null;
      if ('shadow' in c) c.shadow = !!c.shadow;
    });
    // 日
    Object.keys(o.daily).forEach(function (d) { fixDay(o.daily[d]); dayRec(o, d); });
    // 配列
    o.foundIds = o.foundIds.filter(function (id, i) { return typeof id === 'string' && CH.BY_ID[id] && id !== 'jin' && o.foundIds.indexOf(id) === i; });
    o.dyes = o.dyes.filter(function (d, i) { return has(DYE_IDS, d) && o.dyes.indexOf(d) === i; });
    D.DYES.slice().reverse().forEach(function (dy) { if (dy.unlock.start && !has(o.dyes, dy.id)) o.dyes.unshift(dy.id); });
    o.diary = o.diary.filter(diaryOk);
    o.board = o.board.filter(boardOk).slice(0, CFG.BOARD_MAX);
    o.guests = o.guests.filter(guestOk);
    if (checkSlots(o, o.slots, o.alloc)) { o.slots = [mainId, null, null]; o.alloc = [100, 0, 0]; }
    return o;
  }

  var api = {
    newState: newState, ingest: ingest, setChoice: setChoice, setFamilyDay: setFamilyDay, setSlots: setSlots, checkSlots: checkSlots,
    setGoal: setGoal, setMode: setMode, setStamp: setStamp,
    openScroll: openScroll, search: search, hideCandidates: hideCandidates, searchesLeft: searchesLeft,
    readGuest: readGuest, boardOf: boardOf, guestsOf: guestsOf, dye: dye, canDye: canDye,
    summary: summary, dayReview: dayReview, weekReview: weekReview, diagnostics: diagnostics, DIAG_COLUMNS: DIAG_COLUMNS,
    noteOpen: noteOpen, noteWalkingBlock: noteWalkingBlock,
    rankOf: rankOf, okugiOf: okugiOf, rankInfo: rankInfo, queue: queue, stationOf: stationOf,
    isHoliday: isHoliday, holidayName: holidayName, isOffDay: isOffDay, isFullMoon: isFullMoon, moonAge: moonAge, solarTerm: solarTerm,
    weekday: weekday, addDays: addDays, diffDays: diffDays, mondayOf: mondayOf, isDate: isDate,
    judgeAffinity: judgeAffinity, bucketInfo: bucketInfo,
    validate: validate, migrate: migrate, clone: clone,
    CHAR_IDS: CHAR_IDS, MAX_STATIONS: MAX_STATIONS, ROUTES: ROUTES
  };
  SA.Rules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
