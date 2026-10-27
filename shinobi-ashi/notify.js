/* 忍び足（しのびあし）— ローカル通知 SA.Notify（アプリだけ。ブラウザでは何もしない）
 *
 * @capacitor/local-notifications で、端末の中だけで鳴らす（サーバーからの通知は使わない）。3種類だけ:
 *   (1) 毎日の「{帰|かえ}ったら{取|と}り{込|こ}もう」……… settings.notify.evening（既定 18:30）
 *   (2) 最後の同期から6日目の 18:00「そろそろ{開|ひら}かないと、{歩数|ほすう}が{読|よ}めなくなるよ」（iPhone の7日に間に合わせる）
 *   (3) 月曜 7:30 の「{週|しゅう}のふりかえり」
 * 21〜7時には出さない（こどもモードもおとなモードも）。settings.notify.on が false なら全部止める。
 * OS の通知はルビを出せないので、ふりがな「あり」はかなだけ、「なし」は漢字で出す。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var isNode = typeof module !== 'undefined' && module.exports;
  if (!SA.DATA && isNode) require('./data.js');
  if (!SA.Store && isNode) require('./store.js');
  var CFG = SA.DATA.CONFIG;
  var N = CFG.NOTIFY;

  var ID = { evening: 7101, stale: 7102, week: 7103 };
  var CHANNEL = 'shinobi-ashi';
  var TEXT = {
    title: '{忍|しの}び{足|あし}',
    evening: '{帰|かえ}ったら{取|と}り{込|こ}もう',
    stale: 'そろそろ{開|ひら}かないと、{歩数|ほすう}が{読|よ}めなくなるよ',
    weekTitle: '{週|しゅう}のふりかえり',
    week: '{先週|せんしゅう}の{修行|しゅぎょう}をふりかえってみよう'
  };

  function plain(s, furigana) {
    return String(s).replace(/\{([^|{}]+)\|([^{}]+)\}/g, function (_, kanji, kana) { return furigana ? kana : kanji; });
  }
  function hm(s, def) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m) m = /^(\d{1,2}):(\d{2})$/.exec(def);
    return { hour: Math.min(23, +m[1]), minute: Math.min(59, +m[2]) };
  }
  function quiet(hour) {
    // quietFrom(21)〜quietTo(7) は出さない（7:00 ちょうどからは出してよい）
    return N.quietFrom > N.quietTo ? (hour >= N.quietFrom || hour < N.quietTo) : (hour >= N.quietFrom && hour < N.quietTo);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function lastSyncDay(state) {
    if (state && typeof state.lastSyncDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.lastSyncDate)) return state.lastSyncDate;
    if (state && typeof state.lastSync === 'number' && state.lastSync > 0) return ymd(new Date(state.lastSync));
    return null;
  }

  function LN() { return SA.Cap && SA.Cap.isNative() ? SA.Cap.plugin('LocalNotifications') : null; }
  function ourIds() { return [ID.evening, ID.stale, ID.week].map(function (id) { return { id: id }; }); }
  var channelReady = false;
  function ensureChannel(P) {
    if (channelReady || !SA.Cap || SA.Cap.platform() !== 'android') return Promise.resolve();
    return P.createChannel({
      id: CHANNEL, name: '忍び足', description: '歩数の取り込みとふりかえりのお知らせ',
      importance: 3, visibility: 1, vibration: false, lights: false
    }).then(function () { channelReady = true; }, function () { });
  }

  /** 次に出る通知の一覧を作る（画面とテストが中身を確かめられるよう、Capacitor に渡す形のまま返す） */
  function plan(state, nowMs) {
    state = state || {};
    var s = (state.settings && state.settings.notify) || {};
    var furi = state.furigana !== false;
    var title = plain(TEXT.title, furi);
    var out = [], skipped = [];
    if (s.on === false) return { list: out, skipped: ['off'] };
    // isExactNotification: false … 正確なアラームの権限（SCHEDULE_EXACT_ALARM）は外してある。true のままだと
    // Android 12+ で「アラームとリマインダー」の設定画面が開いてしまうため、おおよその時刻で出す。
    var extra = { channelId: CHANNEL, isExactNotification: false };

    var ev = hm(s.evening, N.eveningDefault);
    if (quiet(ev.hour)) skipped.push('evening:quiet');
    else out.push({
      id: ID.evening, title: title, body: plain(TEXT.evening, furi),
      schedule: { on: { hour: ev.hour, minute: ev.minute }, allowWhileIdle: true }, channelId: extra.channelId, isExactNotification: false, extra: { kind: 'evening' }
    });

    var last = lastSyncDay(state);
    if (last && state.route !== 'sim' && state.route !== 'none') {
      var p = last.split('-');
      var at = new Date(+p[0], +p[1] - 1, +p[2] + N.staleDays, 18, 0, 0, 0);
      if (quiet(18)) skipped.push('stale:quiet');
      else if (at.getTime() <= nowMs) skipped.push('stale:past');
      else out.push({
        id: ID.stale, title: title, body: plain(TEXT.stale, furi),
        schedule: { at: at, allowWhileIdle: true }, channelId: extra.channelId, isExactNotification: false, extra: { kind: 'stale' }
      });
    } else skipped.push('stale:nosync');

    if (quiet(7)) skipped.push('week:quiet');
    else out.push({
      id: ID.week, title: plain(TEXT.weekTitle, furi), body: plain(TEXT.week, furi),
      schedule: { on: { weekday: 2 /* 月曜（1=日曜） */, hour: 7, minute: 30 }, allowWhileIdle: true }, channelId: extra.channelId, isExactNotification: false, extra: { kind: 'week' }
    });
    return { list: out, skipped: skipped };
  }

  var Notify = {
    IDS: ID,
    plan: function (state, nowMs) { return plan(state, nowMs == null ? Date.now() : nowMs); },
    plain: plain,
    available: function () { return !!LN(); },

    /** 'granted' | 'denied' | 'prompt'（ブラウザは 'denied'） */
    permission: function () {
      var P = LN(); if (!P) return Promise.resolve('denied');
      return P.checkPermissions().then(function (r) {
        var v = r && r.display;
        return v === 'granted' ? 'granted' : (v === 'denied' ? 'denied' : 'prompt');
      }, function () { return 'denied'; });
    },
    request: function () {
      var P = LN(); if (!P) return Promise.resolve('denied');
      return P.requestPermissions().then(function (r) { return r && r.display === 'granted' ? 'granted' : 'denied'; }, function () { return 'denied'; });
    },

    /** 予定を作り直す。opts.ask === false なら OS の許可を聞かない（まだ聞いていなければ何もしない）。
     *  返り値: { ok, scheduled:[id], skipped:[理由], reason? } */
    schedule: function (state, opts) {
      opts = opts || {};
      var P = LN();
      if (!P) return Promise.resolve({ ok: false, scheduled: [], skipped: [], reason: 'web' });
      var pl = plan(state, Date.now());
      return P.cancel({ notifications: ourIds() }).catch(function () { })
        .then(function () {
          if (!pl.list.length) return { ok: true, scheduled: [], skipped: pl.skipped };
          return Notify.permission().then(function (perm) {
            if (perm === 'prompt' && opts.ask !== false) return Notify.request();
            return perm;
          }).then(function (perm) {
            if (perm !== 'granted') return { ok: false, scheduled: [], skipped: pl.skipped, reason: 'permission' };
            return ensureChannel(P).then(function () {
              return P.schedule({ notifications: pl.list });
            }).then(function () {
              return { ok: true, scheduled: pl.list.map(function (n) { return n.id; }), skipped: pl.skipped };
            });
          });
        })
        .catch(function () { return { ok: false, scheduled: [], skipped: pl.skipped, reason: 'error' }; });
    },

    cancelAll: function () {
      var P = LN(); if (!P) return Promise.resolve(true);
      return P.cancel({ notifications: ourIds() }).then(function () { return true; }, function () { return false; });
    }
  };

  SA.Notify = Notify;
  if (isNode) module.exports = Notify;
})(typeof window !== 'undefined' ? window : globalThis);
