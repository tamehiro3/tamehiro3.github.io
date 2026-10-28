/* 忍び足（しのびあし）— 保存 SA.Store（と、Capacitor のプラグインを取る小さな道具 SA.Cap）
 *
 * ブラウザ: localStorage（キー 'shinobi-ashi:v1'。ひとつ前の保存を 'shinobi-ashi:v1:bak' に残す）。
 *           localStorage が使えない端末ではメモリだけ（SA.Store.persistent === false。画面は「この端末では記録が残りません」）。
 * アプリ:   進行データは @capacitor/filesystem の Directory.LibraryNoCloud に progress.json。
 *           一時ファイル progress.tmp.json に書いてから rename で置き換える（途中で落ちても片方は残る）。
 *           小さな設定は @capacitor/preferences（Android のバックアップに残すのはこちらだけ）。
 * どの関数も例外を外に投げない（save は失敗すると false）。
 * 読めなかったとき: 保存があるのに JSON が壊れていて（途中で切れているなど）、控え（:bak・一時ファイル）も読めなければ、
 *   load() は null（＝はじめての画面）ではなく、壊れていることが分かる印を返す（画面は「記録が読めませんでした」へ）:
 *     { corrupt: true, broken: true, app: 'shinobi-ashi:corrupt', reason: 'main-json'|'bak-json' }
 *     （SA.Store.isCorrupt(x) で見分ける。app が違うので SA.Rules.validate を通らず、migrate も null）
 *   同じことを SA.Store.lastError にも残す: { reason, recovered: false, kept: 写せたか }（壊れていなければ null）。
 *   本体だけ壊れていて控えから読めたときは、控えの state を返し、lastError は { reason: 'main-json', recovered: true, kept }。
 *   壊れた中身は消さずに 'shinobi-ashi:v1:broken'（アプリは progress.broken.json）に1つだけ写しておく（clear() でも消さない）。
 *   SA.Store.brokenText() で読める。
 * ビルドなしの素の JS。window.SA に足す。Node では require('./store.js') で同じものが返る。
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};

  var KEY = 'shinobi-ashi:v1';
  var BAK = KEY + ':bak';
  var PREF = 'shinobi-ashi:pref:';
  var FILE = 'progress.json';
  var TMP = 'progress.tmp.json';
  var BROKEN_FILE = 'progress.broken.json';
  var BROKEN = KEY + ':broken';
  var DIR = 'LIBRARY_NO_CLOUD';   // Directory.LibraryNoCloud（iOS: Library/NoCloud、Android: アプリの files/）
  var ENC = 'utf8';               // Encoding.UTF8
  var KEEP_ON_CLEAR = /^(steps\.|gate)/; // clear() でも消さない設定（steps.: 歩数センサーの基準。消すと二重に数えるおそれ。gate: 関門の gateLock・gateMiss・gateLevel。消すと1分待ちを抜けられる）

  /* ================= SA.Cap: Capacitor の有無とプラグイン ================= */
  // import は使えない（ビルドなし）。アプリでは www/capacitor.js（@capacitor/core の素の JS 版）が
  // window.Capacitor.registerPlugin を用意する。それがなければネイティブの橋（nativePromise）を直接使う。
  var Cap = SA.Cap || (function () {
    var cache = {};
    function C() { return root.Capacitor || null; }
    function platform() {
      var c = C();
      try { return c && typeof c.getPlatform === 'function' ? c.getPlatform() : 'web'; } catch (e) { return 'web'; }
    }
    function isNative() {
      var c = C();
      if (!c) return false;
      try { if (typeof c.isNativePlatform === 'function') return !!c.isNativePlatform(); } catch (e) { }
      return platform() !== 'web';
    }
    function bridgeProxy(c, name) {
      // @capacitor/core がないときの最小の代わり（promise のメソッドと addListener だけ）
      return new Proxy({}, {
        get: function (_, method) {
          if (method === 'then' || typeof method !== 'string') return undefined;
          if (method === 'addListener') {
            return function (eventName, fn) {
              var id = c.nativeCallback(name, 'addListener', { eventName: eventName }, function (data) { fn(data); });
              var h = { remove: function () { return c.nativePromise(name, 'removeListener', { eventName: eventName, callbackId: id }); } };
              return Promise.resolve(h);
            };
          }
          return function (opts) { return c.nativePromise(name, method, opts || {}); };
        }
      });
    }
    function plugin(name) {
      if (cache[name]) return cache[name];
      var c = C();
      if (!c || !isNative()) return null;
      var p = null;
      try {
        if (c.Plugins && c.Plugins[name]) p = c.Plugins[name];               // ほかの部品がすでに登録した
        else if (typeof c.registerPlugin === 'function') p = c.registerPlugin(name);
        else if (typeof c.nativePromise === 'function' && typeof Proxy !== 'undefined') p = bridgeProxy(c, name);
      } catch (e) { p = null; }
      if (p) cache[name] = p;
      return p;
    }
    function available(name) {
      var c = C();
      if (!c || !isNative()) return false;
      try {
        if (typeof c.isPluginAvailable === 'function' && c.isPluginAvailable(name)) return true;
        var h = c.PluginHeaders;
        if (h && h.length) { for (var i = 0; i < h.length; i++) if (h[i] && h[i].name === name) return true; return false; }
      } catch (e) { }
      return !!plugin(name);
    }
    return { platform: platform, isNative: isNative, plugin: plugin, available: available, _clear: function () { cache = {}; } };
  })();
  SA.Cap = Cap;

  /* ================= 戻るボタン（Android） =================
   * Android の戻るボタンは @capacitor/app の 'backButton' で受け取り、`SA.Cap.back()` を呼ぶ（下の wireBack）。
   * true を返したら「この中で片づけた」。false ならアプリを閉じる（App.exitApp。ふつうの戻ると同じ）。
   * 片づけ方の順:
   *   1. document に cancelable な 'backbutton' イベントを流す。画面側が preventDefault したら片づけた扱い。
   *   2. SA.Cap.onBack(fn) で登録した関数を、あとから登録したものから呼ぶ。true を返したら片づけた扱い。
   *   3. どちらもなければ、画面の形から片づける: 重ねた画面（#layer の .modal-back）があれば、いちばん上の
   *      「とじる」（[data-act=close]）を押す。出来事のカード（閉じるボタンがない）は「つぎへ」（[data-act=ev-next]）を
   *      押す（最後のカードでは「とじる」になる）。どちらもない重ねた画面は閉じずに、戻るを食べるだけ
   *      （うっかりアプリが閉じないように）。重ねた画面がなく、ホーム（ながめるモードはいちばん左のタブ）以外にいれば、そこへ戻す。
   * ブラウザでは呼ばれないが、画面側が popstate から SA.Cap.back() を呼んでもよい（同じ片づけ方になる）。 */
  if (!Cap.onBack) {
    var backFns = [];
    Cap.onBack = function (fn) {
      if (typeof fn !== 'function') return function () { };
      backFns.push(fn);
      return function () { backFns = backFns.filter(function (f) { return f !== fn; }); };
    };
    var lastBack = null;   // Android のアプリで、1回の戻るボタンに受け手が2つあっても1回だけ片づける（下の wireBack）
    Cap.back = function () {
      if (backWire && lastBack && Date.now() - lastBack.t < BACK_SAME_MS) return lastBack.done;
      var done = backOnce();
      if (backWire) lastBack = { t: Date.now(), done: done };
      return done;
    };
    Cap._forgetBack = function () { lastBack = null; };
  }
  var BACK_SAME_MS = 250;
  function backOnce() {
    var doc = root.document;
    try {
      if (doc && typeof root.CustomEvent === 'function') {
        var ev = new root.CustomEvent('backbutton', { cancelable: true });
        doc.dispatchEvent(ev);
        if (ev.defaultPrevented) return true;
      }
    } catch (e) { }
    for (var i = backFns.length - 1; i >= 0; i--) {
      try { if (backFns[i]() === true) return true; } catch (e) { }
    }
    return defaultBack(doc);
  }
  /* @capacitor/app の 'backButton' をつなぐ（Android のアプリだけ。ブラウザ・iPhone では何もしない）。
   * @capacitor/app は 'backButton' を聞いている関数があると、そのあとに document へ取り消せない素の 'backbutton' も流す。
   * SA.Cap.back() が流す cancelable な 'backbutton' と二重にならないよう、素のほうは先回り（capture）して止める
   * （store.js は ui.js より先に読まれるので、画面側の 'backbutton' の受け手より先に呼ばれる）。
   * 画面側も Capacitor.Plugins.App に 'backButton' の受け手をつないで SA.Cap.back() を呼ぶことがある。1回の戻るボタンで
   * 2回片づけない（重ねた画面が2枚閉じない）よう、Android のアプリでは 250ms 以内の2回目の SA.Cap.back() は1回目の答えを返すだけにする。 */
  var backWire = null;
  function unwireBack() {
    if (!backWire) return;
    try { if (backWire.doc) backWire.doc.removeEventListener('backbutton', backWire.swallow, true); } catch (e) { }
    Promise.resolve(backWire.handle).then(function (h) { if (h && typeof h.remove === 'function') return h.remove(); }).catch(function () { });
    backWire = null;
    if (Cap._forgetBack) Cap._forgetBack();
  }
  function leaveApp(App) {
    return Promise.resolve().then(function () {
      if (typeof App.exitApp === 'function') return App.exitApp();
      throw new Error('no exitApp');
    }).catch(function () {
      if (typeof App.minimizeApp === 'function') return App.minimizeApp();
    }).catch(function () { });
  }
  function wireBack() {
    if (backWire) return backWire;
    if (!Cap.isNative() || Cap.platform() !== 'android' || !Cap.available('App')) return null;
    var App = Cap.plugin('App');
    if (!App || typeof App.addListener !== 'function') return null;
    var doc = root.document || null;
    var w = { app: App, doc: doc, handle: null, swallow: function (e) {
      if (e && e.cancelable === false && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    } };
    try { if (doc && typeof doc.addEventListener === 'function') doc.addEventListener('backbutton', w.swallow, true); else w.doc = null; } catch (e) { w.doc = null; }
    w.handle = Promise.resolve().then(function () {
      return App.addListener('backButton', function () {
        var done = false;
        try { done = Cap.back() === true; } catch (e) { done = false; }
        if (!done) leaveApp(App);
      });
    }).catch(function () { return null; });
    backWire = w;
    return w;
  }
  Cap.wireBack = wireBack;
  Cap._unwireBack = unwireBack;

  function defaultBack(doc) {
    try {
      var UI = SA.UI, App = UI && UI.App;
      if (!doc) return false;
      var layer = doc.getElementById('layer');
      var backs = layer && !layer.hidden ? layer.querySelectorAll('.modal-back') : [];
      if (backs.length) {
        if (App && App.walking) return true;                    // 歩いているあいだは何もしない（閉じもしない）
        var top = backs[backs.length - 1];
        var close = top.querySelector('.modal > .modal-foot [data-act="close"]') || top.querySelector('[data-act="close"]');
        // 出来事のカード（閉じるボタンがない）は「つぎへ」を押す。最後のカードの「つぎへ」は「とじる」なので、押し続ければ閉じる
        if (!close) close = top.querySelector('[data-act="ev-next"]');
        if (close && !close.disabled) close.click();
        return true;
      }
      if (UI && typeof UI.go === 'function' && App && (App.state || App.view)) {
        var homeId = App.view ? null : 'home';
        if (!homeId) { var b = doc.querySelector('#nav [data-nav]'); homeId = b ? b.getAttribute('data-nav') : null; }
        if (homeId && App.screen && App.screen !== homeId && !App.walking) { UI.go(homeId); return true; }
      }
    } catch (e) { }
    return false;
  }

  /* ================= 下ごしらえ ================= */
  function lsUsable() {
    try {
      var ls = root.localStorage;
      if (!ls) return false;
      var k = '__sa_probe__';
      ls.setItem(k, '1'); ls.removeItem(k);
      return true;
    } catch (e) { return false; }
  }
  function parse(text) {
    if (typeof text !== 'string' || !text) return null;
    try { var o = JSON.parse(text); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  }
  function accept(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    if (obj.app && obj.app !== 'shinobi-ashi') return null;
    var R = SA.Rules;
    if (R && typeof R.migrate === 'function') {
      try { var m = R.migrate(obj); if (m && typeof m === 'object') return m; } catch (e) { }
    }
    return obj;
  }
  function hasText(t) { return typeof t === 'string' && /\S/.test(t); }
  var CORRUPT_APP = 'shinobi-ashi:corrupt';
  // app が違うので SA.Rules.migrate は null を返し、validate も通らない（うっかり新しい記録に直されない）
  function corruptMark(reason) { return { corrupt: true, broken: true, app: CORRUPT_APP, reason: reason }; }
  // 中身があるのに、記録の形（JSON のオブジェクト）として読めない
  function isBad(text, obj) { return hasText(text) && (!obj || Array.isArray(obj)); }
  function enc(v) { return JSON.stringify(v === undefined ? null : v); }
  function dec(s) { if (s == null) return null; try { return JSON.parse(s); } catch (e) { return s; } }

  /* ================= 置き場所ごとの実装 ================= */
  var mem = { main: null, bak: null, prefs: {} };

  var memoryBackend = {
    name: 'memory', persistent: false,
    readRaw: function () { return Promise.resolve({ main: mem.main, bak: mem.bak }); },
    keepBroken: function () { return Promise.resolve(false); },
    write: function (text) { if (mem.main) mem.bak = mem.main; mem.main = text; return Promise.resolve(true); },
    clear: function () { mem.main = null; mem.bak = null; return Promise.resolve(); },
    getPref: function (k) { return Promise.resolve(k in mem.prefs ? dec(mem.prefs[k]) : null); },
    setPref: function (k, v) { mem.prefs[k] = enc(v); return Promise.resolve(true); },
    removePref: function (k) { delete mem.prefs[k]; return Promise.resolve(true); },
    prefKeys: function () { return Promise.resolve(Object.keys(mem.prefs)); }
  };

  var localBackend = {
    name: 'local', persistent: true,
    readRaw: function () {
      try {
        var ls = root.localStorage;
        return Promise.resolve({ main: ls.getItem(KEY), bak: ls.getItem(BAK) });
      } catch (e) { return Promise.resolve({ main: null, bak: null }); }
    },
    keepBroken: function (text) {
      try { root.localStorage.setItem(BROKEN, text); return Promise.resolve(true); } catch (e) { return Promise.resolve(false); }
    },
    write: function (text) {
      try {
        var ls = root.localStorage;
        var prev = ls.getItem(KEY);
        if (prev && parse(prev)) { try { ls.setItem(BAK, prev); } catch (e) { ls.removeItem(BAK); } }
        ls.setItem(KEY, text);
        return Promise.resolve(ls.getItem(KEY) === text);
      } catch (e) {
        return Promise.resolve(false); // 容量いっぱいなど
      }
    },
    clear: function () {
      try { root.localStorage.removeItem(KEY); root.localStorage.removeItem(BAK); } catch (e) { }
      return Promise.resolve();
    },
    getPref: function (k) { try { return Promise.resolve(dec(root.localStorage.getItem(PREF + k))); } catch (e) { return Promise.resolve(null); } },
    setPref: function (k, v) { try { root.localStorage.setItem(PREF + k, enc(v)); return Promise.resolve(true); } catch (e) { return Promise.resolve(false); } },
    removePref: function (k) { try { root.localStorage.removeItem(PREF + k); } catch (e) { } return Promise.resolve(true); },
    prefKeys: function () {
      var out = [];
      try {
        var ls = root.localStorage;
        for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf(PREF) === 0) out.push(k.slice(PREF.length)); }
      } catch (e) { }
      return Promise.resolve(out);
    }
  };

  function appBackend(FS, PR) {
    function readText(path) {
      return FS.readFile({ path: path, directory: DIR, encoding: ENC })
        .then(function (r) { return r && typeof r.data === 'string' ? r.data : null; }, function () { return null; });
    }
    function del(path) { return FS.deleteFile({ path: path, directory: DIR }).then(function () { return true; }, function () { return false; }); }
    function check(path, text) {
      return FS.readFile({ path: path, directory: DIR, encoding: ENC })
        .then(function (r) { return !!r && r.data === text; }, function () { return false; });
    }
    var b = {
      name: 'app', persistent: true,
      readRaw: function () {
        return Promise.all([readText(FILE), readText(TMP)]).then(function (a) { return { main: a[0], bak: a[1] }; });
      },
      keepBroken: function (text) {
        return FS.writeFile({ path: BROKEN_FILE, data: text, directory: DIR, encoding: ENC, recursive: true })
          .then(function () { return true; }, function () { return false; });
      },
      write: function (text) {
        return FS.writeFile({ path: TMP, data: text, directory: DIR, encoding: ENC, recursive: true })
          .then(function () {
            return FS.rename({ from: TMP, to: FILE, directory: DIR, toDirectory: DIR })
              .catch(function () {
                // 置き換え先があると rename できない作りの端末向け: 消してからもう一度
                return del(FILE).then(function () { return FS.rename({ from: TMP, to: FILE, directory: DIR, toDirectory: DIR }); });
              })
              .catch(function () {
                // それでもだめなら直接書く（一時ファイルは読み込みの控えとして残る）
                return FS.writeFile({ path: FILE, data: text, directory: DIR, encoding: ENC, recursive: true });
              });
          })
          .then(function () { return check(FILE, text); })
          .catch(function () { return false; });
      },
      clear: function () { return Promise.all([del(FILE), del(TMP)]).then(function () { }); },
      getPref: function (k) {
        if (!PR) return memoryBackend.getPref(k);
        return PR.get({ key: k }).then(function (r) { return dec(r ? r.value : null); }, function () { return null; });
      },
      setPref: function (k, v) {
        if (!PR) return memoryBackend.setPref(k, v);
        return PR.set({ key: k, value: enc(v) }).then(function () { return true; }, function () { return false; });
      },
      removePref: function (k) {
        if (!PR) return memoryBackend.removePref(k);
        return PR.remove({ key: k }).then(function () { return true; }, function () { return false; });
      },
      prefKeys: function () {
        if (!PR) return memoryBackend.prefKeys();
        return PR.keys().then(function (r) { return (r && r.keys) || []; }, function () { return []; });
      }
    };
    return b;
  }

  function pickBackend() {
    if (Cap.isNative()) {
      var FS = Cap.plugin('Filesystem'), PR = Cap.plugin('Preferences');
      if (FS) return appBackend(FS, PR);
    }
    return lsUsable() ? localBackend : memoryBackend;
  }

  var backend = null;
  function be() { if (!backend) { backend = pickBackend(); Store.persistent = backend.persistent; Store.backend = backend.name; } return backend; }

  /* ================= SA.Store ================= */
  var queue = Promise.resolve();   // 保存は順番に（アプリの一時ファイルと rename が重ならないように）
  function serial(fn) {
    var p = queue.then(fn, fn);
    queue = p.then(function () { }, function () { });
    return p;
  }

  var Store = {
    KEY: KEY,
    persistent: true,      // be() を呼んだ時点で決まる（下で一度呼ぶ）
    backend: 'local',
    /** 最後の load() で壊れた保存を見つけたら { reason, recovered, kept }。なければ null（上の説明） */
    lastError: null,
    /** 進行データ。なければ null。壊れていて控えも読めなければ { corrupt: true, broken: true, reason, … }（上の説明） */
    load: function () {
      return serial(function () {
        var b = be();
        Store.lastError = null;
        function keep(text, reason, recovered, value) {
          return Promise.resolve().then(function () { return b.keepBroken(text); }).catch(function () { return false; })
            .then(function (kept) {
              Store.lastError = { reason: reason, recovered: recovered, kept: !!kept };
              return value;
            });
        }
        return b.readRaw().then(function (raw) {
          raw = raw || {};
          var main = parse(raw.main), bak = parse(raw.bak);
          var mainBad = isBad(raw.main, main), bakBad = isBad(raw.bak, bak);
          var got = accept(main);
          if (got) return got;
          got = accept(bak);
          // 本体だけ壊れていて控えから読めた: 次の保存で本体が上書きされる前に、壊れた中身を写しておく
          if (got) return mainBad ? keep(raw.main, 'main-json', true, got) : got;
          // 中身があるのに JSON として読めない（ほかのアプリのデータ・空・空白だけはここに来ない）
          if (mainBad) return keep(raw.main, 'main-json', false, corruptMark('main-json'));
          if (!hasText(raw.main) && bakBad) return keep(raw.bak, 'bak-json', false, corruptMark('bak-json'));
          return null;
        });
      }).then(function (o) { return o; }, function () {
        // 読み込みそのものが例外になった（ふつうは起きない）。はじめての画面で上書きしないよう、壊れた扱いにする
        Store.lastError = { reason: 'read', recovered: false, kept: false };
        return corruptMark('read');
      });
    },
    /** ひとつ前の保存（ブラウザは :bak、アプリは一時ファイル）。読めなければ null */
    loadBackup: function () {
      return serial(function () { return be().readRaw(); })
        .then(function (raw) { return accept(parse(raw && raw.bak)); }, function () { return null; });
    },
    /** 壊れていた保存の写し（読み込んだときに写したもの）。なければ null。書き出して調べる用 */
    brokenText: function () {
      return serial(function () {
        var b = be();
        if (b.name === 'local') { try { return root.localStorage.getItem(BROKEN); } catch (e) { return null; } }
        if (b.name === 'app') {
          return Cap.plugin('Filesystem').readFile({ path: BROKEN_FILE, directory: DIR, encoding: ENC })
            .then(function (r) { return r && typeof r.data === 'string' ? r.data : null; }, function () { return null; });
        }
        return null;
      }).then(function (t) { return t || null; }, function () { return null; });
    },
    isCorrupt: function (o) { return !!(o && typeof o === 'object' && o.corrupt === true && o.app === CORRUPT_APP); },
    save: function (state) {
      var text;
      try { text = JSON.stringify(state); } catch (e) { return Promise.resolve(false); }
      if (typeof text !== 'string') return Promise.resolve(false);
      return serial(function () { return be().write(text); })
        .then(function (ok) { return !!ok; }, function () { return false; });
    },
    /** 進行データを消す。opts.prefs が false でなければ設定も消す（steps. で始まる歩数の基準と gate で始まる関門の待ち・まちがい回数は残す。opts.all で全部） */
    clear: function (opts) {
      opts = opts || {};
      return serial(function () {
        var b = be();
        return b.clear().then(function () {
          if (opts.prefs === false) return;
          return b.prefKeys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return opts.all || !KEEP_ON_CLEAR.test(k); }).map(function (k) { return b.removePref(k); }));
          });
        });
      }).then(function () { return true; }, function () { return false; });
    },
    getPref: function (key) {
      return Promise.resolve().then(function () { return be().getPref(String(key)); }).then(function (v) { return v === undefined ? null : v; }, function () { return null; });
    },
    setPref: function (key, value) {
      return Promise.resolve().then(function () { return be().setPref(String(key), value); }).then(function (ok) { return ok !== false; }, function () { return false; });
    },
    removePref: function (key) {
      return Promise.resolve().then(function () { return be().removePref(String(key)); }).then(function () { return true; }, function () { return false; });
    },
    /** テスト用: 置き場所を選び直す（window.Capacitor を差し替えたあとなど） */
    _reset: function () { if (Cap._clear) Cap._clear(); if (Cap._unwireBack) Cap._unwireBack(); backend = null; be(); if (Cap.wireBack) Cap.wireBack(); }
  };
  be();
  try { if (Cap.wireBack) Cap.wireBack(); } catch (e) { }

  SA.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
