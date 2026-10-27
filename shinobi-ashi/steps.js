/* 忍び足（しのびあし）— 歩数の取り出し口 SA.Steps
 *
 * 経路（route）:
 *   'ios'      … iPhone。@capgo/capacitor-pedometer（CMPedometer）。getMeasurement を1時間ずつ呼んで区間を作る。過去7日まで。
 *   'androidB' … Android。自作プラグイン ShinobiSteps の Recording API（購読した時点から10日、1時間ごと）。
 *   'androidC' … Android。歩数センサー（TYPE_STEP_COUNTER）の前景差分。区間なし。開いたときに前回値との差を「今日」に入れる。
 *   'sim'      … ブラウザの「ためし歩き」（CONFIG.WEB_TRIAL が true のとき）。自分の「今日」を持つ。
 *   'none'     … 何も読めない（ながめるモード）。
 * read() が返す形は SA.Rules.ingest の days:
 *   [{ date:'YYYY-MM-DD', steps: その日の合計, buckets: 24個（1時間ごと）|null, src: route }]
 * 日付はすべて端末の地方時。どの関数も例外を外に投げない。インターネットには何も送らない。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var isNode = typeof module !== 'undefined' && module.exports;
  if (!SA.DATA && isNode) require('./data.js');
  if (!SA.Store && isNode) require('./store.js');
  var CFG = SA.DATA.CONFIG;
  var Cap = SA.Cap;

  var DAY_MS = 86400000;
  var SIM_KEY = 'shinobi-ashi:sim';
  var SIM_HISTORY = 7;                // ためし歩きも iPhone と同じく7日さかのぼれることにする
  var SIM_HOUR_MAX = 11000;           // ためし歩きの1時間の上限（12,000 の不採用にかからないように）
  var SIM_KEEP_DAYS = 30;
  var HOURS = { asa: 7, hiru: 12, yu: 17, yoru: 20, shinya: 2, morning: 7, noon: 12, evening: 17, night: 20, late: 2 };

  /* ================= 日付 ================= */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parts(s) { var a = String(s).split('-'); return [+a[0], +a[1], +a[2]]; }
  function noon(s) { var p = parts(s); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0); }
  function addDays(s, n) { var p = parts(s); return ymd(new Date(p[0], p[1] - 1, p[2] + n, 12, 0, 0, 0)); }
  function diffDays(a, b) { return Math.round((noon(b) - noon(a)) / DAY_MS); }
  function hourStart(s, h) { var p = parts(s); return new Date(p[0], p[1] - 1, p[2], h, 0, 0, 0).getTime(); }
  function dayStart(s) { return hourStart(s, 0); }
  function now() { return Date.now(); }
  function realToday() { return ymd(new Date(now())); }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function zeros() { var a = []; for (var i = 0; i < 24; i++) a.push(0); return a; }
  function sum(a) { var t = 0; for (var i = 0; i < a.length; i++) t += a[i] || 0; return t; }
  function int(n) { n = Math.floor(Number(n) || 0); return n > 0 ? n : 0; }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withTimeout(p, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(fallback); } }, ms);
      Promise.resolve(p).then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
        function () { if (!done) { done = true; clearTimeout(t); resolve(fallback); } });
    });
  }
  // 決まった種からの乱数（ためし歩きの「こまめに」を毎回同じに散らすため）
  function rng(seedStr) {
    var h = 2166136261;
    for (var i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    var a = h >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lockFactory() {
    var q = Promise.resolve();
    return function (fn) { var p = q.then(fn, fn); q = p.then(function () { }, function () { }); return p; };
  }

  /* ================= ためし歩き（ブラウザだけ） ================= */
  function makeSim() {
    var st = { v: 1, offset: 0, days: {}, walking: false };
    var listeners = [];
    function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
    function loadSim() {
      try {
        var s = ls(); var t = s && s.getItem(SIM_KEY);
        if (t) {
          var o = JSON.parse(t);
          if (o && typeof o === 'object') {
            st.offset = int(o.offset);
            st.walking = !!o.walking;
            st.days = {};
            for (var k in (o.days || {})) {
              var b = o.days[k];
              if (validDate(k) && Array.isArray(b) && b.length === 24) st.days[k] = b.map(int);
            }
          }
        }
      } catch (e) { }
    }
    function saveSim() {
      var t = today();
      for (var k in st.days) if (diffDays(k, t) > SIM_KEEP_DAYS) delete st.days[k];
      try { var s = ls(); if (s) s.setItem(SIM_KEY, JSON.stringify(st)); } catch (e) { }
      for (var i = 0; i < listeners.length; i++) { try { listeners[i](api.status()); } catch (e) { } }
    }
    function today() { return addDays(realToday(), st.offset); }
    function day(d) { if (!st.days[d]) st.days[d] = zeros(); return st.days[d]; }
    // ある時間に amount を置く。1時間 11,000 を超える分は次の時間へ、23時を超えたら前の時間へ
    function place(b, h, amount) {
      var left = amount, i;
      for (i = h; i < 24 && left > 0; i++) { var room = SIM_HOUR_MAX - b[i]; if (room > 0) { var x = Math.min(room, left); b[i] += x; left -= x; } }
      for (i = h - 1; i >= 0 && left > 0; i--) { var room2 = SIM_HOUR_MAX - b[i]; if (room2 > 0) { var y = Math.min(room2, left); b[i] += y; left -= y; } }
      return amount - left;
    }
    function hourOf(opt) {
      var h = opt && opt.hour;
      if (typeof h === 'string' && h in HOURS) h = HOURS[h];
      h = Math.floor(Number(h));
      if (!(h >= 0 && h <= 23)) h = new Date(now()).getHours();
      return h;
    }
    var api = {
      HOURS: HOURS,
      HISTORY: SIM_HISTORY,
      today: today,
      /** n 歩を今日に足す。opt: { hour: 0..23 | 'asa'|'hiru'|'yu'|'yoru'|'shinya', spread: 'cont'|'bits'|'flat' } */
      addSteps: function (n, opt) {
        n = int(n);
        opt = opt || {};
        var d = today(), b = day(d), added = 0, spread = opt.spread || 'cont';
        if (n > 0) {
          if (spread === 'bits') {
            // 8〜20時に 100〜600 歩ずつ散らす（6つ以上の時間に分かれるよう、ひとつの大きさを n/6 までにする）
            var hrs = [], i, r = rng(d + ':' + sum(b) + ':' + n);
            for (i = 8; i < 20; i++) hrs.push(i);
            for (i = hrs.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var tmp = hrs[i]; hrs[i] = hrs[j]; hrs[j] = tmp; }
            var maxChunk = Math.max(100, Math.min(600, Math.floor(n / 6)));
            var left = n, k = 0, last = hrs[0];
            while (left > 0) {
              var c = 100 + Math.floor(r() * (maxChunk - 100 + 1));
              if (left - c < 100) c = left;
              last = hrs[k % hrs.length];
              added += place(b, last, c);
              left -= c; k++;
            }
          } else if (spread === 'flat') {
            // 8〜18時に均等
            var hs = 10, each = Math.floor(n / hs), rest = n - each * hs;
            for (var q = 0; q < hs; q++) added += place(b, 8 + q, each + (q < rest ? 1 : 0));
          } else {
            added += place(b, hourOf(opt), n);
          }
        }
        saveSim();
        return { date: d, added: added, steps: sum(b), buckets: b.slice() };
      },
      nextDay: function () { st.offset += 1; saveSim(); return today(); },
      skipDays: function (n) { st.offset += int(n); saveSim(); return today(); },
      setWalking: function (on) { st.walking = !!on; saveSim(); return st.walking; },
      isWalking: function () { return !!st.walking; },
      offset: function () { return st.offset; },
      status: function () { var d = today(), b = st.days[d] || zeros(); return { today: d, offset: st.offset, steps: sum(b), buckets: b.slice(), walking: !!st.walking }; },
      onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      reset: function () {
        st = { v: 1, offset: 0, days: {}, walking: false };
        try { var s = ls(); if (s) s.removeItem(SIM_KEY); } catch (e) { }
        for (var i = 0; i < listeners.length; i++) { try { listeners[i](api.status()); } catch (e) { } }
        return today();
      },
      /** 記録から days を返す（from〜to、今日まで、さかのぼりは7日まで。記録のない日は 0 歩） */
      read: function (from, to) {
        var out = [], t = today();
        if (!validDate(to) || diffDays(t, to) > 0) to = t;
        var oldest = addDays(t, -(SIM_HISTORY - 1));
        if (!validDate(from) || diffDays(from, oldest) > 0) from = oldest;
        for (var d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) {
          var b = st.days[d] ? st.days[d].slice() : zeros();
          out.push({ date: d, steps: sum(b), buckets: b, src: 'sim' });
        }
        return out;
      }
    };
    loadSim();
    return api;
  }

  /* ================= iPhone（@capgo/capacitor-pedometer） ================= */
  function iosPlugin() { return Cap.plugin('CapacitorPedometer'); }
  function mapPerm(v) { return v === 'granted' ? 'granted' : (v === 'denied' ? 'denied' : 'prompt'); }
  function iosSteps(P, start, end) {
    return P.getMeasurement({ start: start, end: end }).then(function (m) { return int(m && m.numberOfSteps); });
  }
  function iosRead(from, to) {
    var P = iosPlugin(); if (!P) return Promise.resolve([]);
    var t = Steps.today(), nowMs = now(), dates = [];
    for (var d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) dates.push(d);
    // 1日ずつ（日の中の24時間は並べて問い合わせる）
    var out = [];
    return dates.reduce(function (p, d) {
      return p.then(function () {
        var ds = dayStart(d), de = d === t ? nowMs : dayStart(addDays(d, 1));
        if (de <= ds) return;
        return iosSteps(P, ds, de).then(function (total) {
          var b = zeros();
          if (total <= 0) { out.push({ date: d, steps: 0, buckets: b, src: 'ios' }); return; }
          var qs = [];
          for (var h = 0; h < 24; h++) {
            var hs = hourStart(d, h), he = h === 23 ? dayStart(addDays(d, 1)) : hourStart(d, h + 1);
            if (hs >= de) break;
            if (he > de) he = de;
            if (he <= hs) continue;
            qs.push((function (hh, a, z) { return iosSteps(P, a, z).then(function (n) { b[hh] += n; return true; }, function () { return false; }); })(h, hs, he));
          }
          return Promise.all(qs).then(function (oks) {
            var allOk = oks.every(function (x) { return x; });
            if (allOk) out.push({ date: d, steps: Math.max(sum(b), 0), buckets: b, src: 'ios' });
            else out.push({ date: d, steps: total, buckets: null, src: 'ios' });   // 区間がそろわない日は区間なし
          });
        }, function () { /* 7日より前など、読めない日は返さない */ });
      });
    }, Promise.resolve()).then(function () { return out; });
  }
  function iosWalking(ms) {
    var P = iosPlugin(); if (!P) return Promise.resolve(false);
    var best = 0, handle = null;
    return Promise.resolve()
      .then(function () {
        return P.addListener('measurement', function (m) {
          if (!m) return;
          var c = Number(m.currentCadence) || 0;
          if (!c && m.numberOfSteps && m.startDate && m.endDate && m.endDate > m.startDate) c = m.numberOfSteps / ((m.endDate - m.startDate) / 1000);
          if (c > best) best = c;
        });
      })
      .then(function (h) { handle = h; return P.startMeasurementUpdates(); })
      .then(function () { return delay(ms); })
      .then(function () { return best >= CFG.WALKING_CADENCE; }, function () { return false; })
      .then(function (walking) {
        var stop = function () { };
        try { stop = P.stopMeasurementUpdates(); } catch (e) { }
        return Promise.resolve(stop).catch(function () { })
          .then(function () { if (handle && handle.remove) return handle.remove(); })
          .catch(function () { })
          .then(function () { return walking; });
      });
  }

  /* ================= Android（自作プラグイン ShinobiSteps） ================= */
  function andPlugin() { return Cap.plugin('ShinobiSteps'); }
  var subscribed = false;
  function andSubscribe() {
    var P = andPlugin(); if (!P) return Promise.resolve(false);
    if (subscribed) return Promise.resolve(true);
    return P.subscribe().then(function () { subscribed = true; return true; }, function () { return false; });
  }
  function andReadB(from, to) {
    var P = andPlugin(); if (!P) return Promise.reject(new Error('no plugin'));
    var t = Steps.today(), start = dayStart(from), end = Math.min(now(), dayStart(addDays(to, 1)));
    return andSubscribe().then(function (ok) {
      if (!ok) throw new Error('subscribe');
      return P.readHourly({ start: start, end: end });
    }).then(function (r) {
      var days = {}, d;
      for (d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) days[d] = zeros();
      var list = (r && r.buckets) || [];
      for (var i = 0; i < list.length; i++) {
        var x = list[i], at = new Date(Number(x.start));
        var key = ymd(at);
        if (!days[key]) continue;
        days[key][at.getHours()] += int(x.steps);
      }
      var out = [];
      for (d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) {
        if (diffDays(d, t) < 0) break;
        out.push({ date: d, steps: sum(days[d]), buckets: days[d], src: 'androidB' });
      }
      return Store().setPref('steps.lastRoute', 'androidB').then(function () { return out; });
    });
  }
  var cLock = lockFactory();
  /** (c) 歩数センサーの前景差分。基準は Preferences の 'steps.c'。
   *  再起動（BOOT_COUNT が変わった）・値が小さくなった・基準がない・入れ直しやバックアップからの復元（installId が変わった）・
   *  前回が (c) でなかった ときは、その差分を捨てて基準を取り直す。 */
  function andReadC() {
    return cLock(function () {
      var P = andPlugin(); if (!P) return [];
      var S = Store(), t = Steps.today();
      return Promise.all([P.readCounter(), S.getPref('steps.c'), S.getPref('steps.lastRoute')]).then(function (a) {
        var cur = a[0] || {}, base = a[1], last = a[2];
        var counter = int(cur.steps), boot = cur.bootCount == null ? -1 : Number(cur.bootCount), inst = String(cur.installId || '');
        var reset = !base || typeof base !== 'object' ||
          String(base.installId || '') !== inst || inst === '' ||
          Number(base.boot) !== boot ||
          counter < int(base.counter) ||
          last !== 'androidC';
        var sameInstall = base && String(base.installId || '') === inst && inst !== '';
        var todayTotal = (base && sameInstall && base.date === t) ? int(base.today) : 0;
        var delta = reset ? 0 : counter - int(base.counter);
        todayTotal += delta;
        var nb = { installId: inst, boot: boot, counter: counter, date: t, today: todayTotal, at: now(), reset: reset };
        return Promise.all([S.setPref('steps.c', nb), S.setPref('steps.lastRoute', 'androidC')]).then(function () {
          return [{ date: t, steps: todayTotal, buckets: null, src: 'androidC' }];
        });
      });
    }).catch(function () { return []; });
  }

  /* ================= SA.Steps ================= */
  function Store() { return SA.Store; }
  var sim = null;
  var info = null;

  function webRoute() { return CFG.WEB_TRIAL ? 'sim' : 'none'; }
  function histDays(route) {
    if (route === 'sim') return SIM_HISTORY;
    var h = CFG.HISTORY_DAYS[route];
    return typeof h === 'number' ? h : 0;
  }
  function makeInfo(route) {
    return { route: route, canBuckets: route === 'ios' || route === 'androidB' || route === 'sim', historyDays: histDays(route) };
  }

  var Steps = {
    sim: null,
    info: null,
    route: function () { return info ? info.route : null; },

    /** 画面とルールが使う「今日」（ためし歩きのときはずらした日付） */
    today: function () { return sim ? sim.today() : realToday(); },
    realToday: realToday,
    addDays: addDays,
    diffDays: diffDays,

    detect: function () {
      if (info) return Promise.resolve(info);
      var p;
      if (!Cap.isNative()) p = Promise.resolve(makeInfo(webRoute()));
      else if (Cap.platform() === 'ios') {
        var P = iosPlugin();
        p = !P ? Promise.resolve(makeInfo('none')) : P.isAvailable().then(function (a) {
          return makeInfo(a && a.stepCounting ? 'ios' : 'none');
        }, function () { return makeInfo('none'); });
      } else if (Cap.platform() === 'android') {
        var A = andPlugin();
        p = !A ? Promise.resolve(makeInfo('none')) : A.isAvailable().then(function (a) {
          a = a || {};
          if (!a.recording) return makeInfo(a.counter ? 'androidC' : 'none');
          // Recording API が使える。許可があれば購読を試し、だめなら (c)
          return A.checkPermission().then(function (r) {
            if (!r || r.activity !== 'granted') return makeInfo('androidB');
            return andSubscribe().then(function (ok) { return makeInfo(ok ? 'androidB' : (a.counter ? 'androidC' : 'none')); });
          }, function () { return makeInfo('androidB'); });
        }, function () { return makeInfo('none'); });
      } else p = Promise.resolve(makeInfo('none'));
      return p.then(function (i) { info = i; Steps.info = i; return i; }, function () { info = makeInfo('none'); Steps.info = info; return info; });
    },

    permission: function () {
      return Steps.detect().then(function (i) {
        if (i.route === 'sim') return 'granted';
        if (i.route === 'none') return 'denied';
        if (i.route === 'ios') {
          var P = iosPlugin();
          return P.checkPermissions().then(function (r) { return mapPerm(r && r.activityRecognition); });
        }
        var A = andPlugin();
        return A.checkPermission().then(function (r) { return mapPerm(r && r.activity); });
      }).catch(function () { return 'denied'; });
    },

    request: function () {
      return Steps.detect().then(function (i) {
        if (i.route === 'sim') return 'granted';
        if (i.route === 'none') return 'denied';
        var p;
        if (i.route === 'ios') p = iosPlugin().requestPermissions().then(function (r) { return r && r.activityRecognition; });
        else p = andPlugin().requestPermission().then(function (r) { return r && r.activity; });
        return p.then(function (v) {
          var res = v === 'granted' ? 'granted' : 'denied';
          if (res === 'granted' && i.route !== 'ios') { info = null; Steps.info = null; return Steps.detect().then(function () { return res; }); }
          return res;
        });
      }).catch(function () { return 'denied'; });
    },

    /** from〜to（'YYYY-MM-DD'）の days。今日は「今まで」の分。経路でさかのぼれる日数を超えた日は返さない。 */
    read: function (fromDate, toDate) {
      return Steps.detect().then(function (i) {
        var t = Steps.today();
        var to = validDate(toDate) && diffDays(toDate, t) >= 0 ? toDate : t;
        var from = validDate(fromDate) ? fromDate : t;
        if (i.route === 'none') return [];
        if (i.route === 'sim') return sim ? sim.read(from, to) : [];
        if (i.route === 'androidC') return to === t && diffDays(from, t) >= 0 ? andReadC() : [];   // 区間なし・今日だけ
        var oldest = addDays(t, -(Math.max(1, i.historyDays) - 1));
        if (diffDays(from, oldest) > 0) from = oldest;
        if (diffDays(from, to) < 0) return [];
        if (i.route === 'ios') return iosRead(from, to);
        // androidB。読めなければ今日だけ (c) で読む
        return andReadB(from, to).catch(function () {
          return Promise.resolve(andPlugin().isAvailable()).then(function (a) { return a && a.counter ? andReadC() : []; }, function () { return []; });
        });
      }).catch(function () { return []; });
    },

    /** 歩行中か（起動時に3秒）。ためし歩きは「歩いている（テスト）」スイッチの値（待ち時間は短くする） */
    walkingNow: function (ms) {
      ms = Math.max(0, Math.floor(Number(ms) || CFG.WALKING_CHECK_MS));
      return Steps.detect().then(function (i) {
        if (i.route === 'sim') return delay(Math.min(ms, 300)).then(function () { return sim ? sim.isWalking() : false; });
        if (i.route === 'none') return false;
        if (i.route === 'ios') return withTimeout(iosWalking(ms), ms + 3000, false);
        var A = andPlugin();
        return withTimeout(A.walkingNow({ ms: ms }).then(function (r) { return int(r && r.events) >= CFG.WALKING_EVENTS; }), ms + 3000, false);
      }).catch(function () { return false; });
    },

    /** テスト用: 経路を選び直す（window.Capacitor を差し替えたあとなど） */
    _reset: function () {
      if (Cap._clear) Cap._clear();
      info = null; Steps.info = null; subscribed = false;
      sim = (!Cap.isNative() && CFG.WEB_TRIAL) ? makeSim() : null;
      Steps.sim = sim;
    }
  };
  Steps._reset();

  SA.Steps = Steps;
  if (isNode) module.exports = Steps;
})(typeof window !== 'undefined' ? window : globalThis);
