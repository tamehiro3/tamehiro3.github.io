/* 忍び足（しのびあし）— 保存 SA.Store（と、Capacitor のプラグインを取る小さな道具 SA.Cap）
 *
 * ブラウザ: localStorage（キー 'shinobi-ashi:v1'。ひとつ前の保存を 'shinobi-ashi:v1:bak' に残す）。
 *           localStorage が使えない端末ではメモリだけ（SA.Store.persistent === false。画面は「この端末では記録が残りません」）。
 * アプリ:   進行データは @capacitor/filesystem の Directory.LibraryNoCloud に progress.json。
 *           一時ファイル progress.tmp.json に書いてから rename で置き換える（途中で落ちても片方は残る）。
 *           小さな設定は @capacitor/preferences（Android のバックアップに残すのはこちらだけ）。
 * どの関数も例外を外に投げない（save は失敗すると false）。
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
  var DIR = 'LIBRARY_NO_CLOUD';   // Directory.LibraryNoCloud（iOS: Library/NoCloud、Android: アプリの files/）
  var ENC = 'utf8';               // Encoding.UTF8
  var KEEP_ON_CLEAR = /^steps\./; // clear() でも消さない設定（歩数センサーの基準など。消すと二重に数えるおそれ）

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
  function enc(v) { return JSON.stringify(v === undefined ? null : v); }
  function dec(s) { if (s == null) return null; try { return JSON.parse(s); } catch (e) { return s; } }

  /* ================= 置き場所ごとの実装 ================= */
  var mem = { main: null, bak: null, prefs: {} };

  var memoryBackend = {
    name: 'memory', persistent: false,
    read: function () { return Promise.resolve(parse(mem.main) || parse(mem.bak)); },
    write: function (text) { if (mem.main) mem.bak = mem.main; mem.main = text; return Promise.resolve(true); },
    clear: function () { mem.main = null; mem.bak = null; return Promise.resolve(); },
    getPref: function (k) { return Promise.resolve(k in mem.prefs ? dec(mem.prefs[k]) : null); },
    setPref: function (k, v) { mem.prefs[k] = enc(v); return Promise.resolve(true); },
    removePref: function (k) { delete mem.prefs[k]; return Promise.resolve(true); },
    prefKeys: function () { return Promise.resolve(Object.keys(mem.prefs)); }
  };

  var localBackend = {
    name: 'local', persistent: true,
    read: function () {
      try {
        var ls = root.localStorage;
        return Promise.resolve(parse(ls.getItem(KEY)) || parse(ls.getItem(BAK)));
      } catch (e) { return Promise.resolve(null); }
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
    function readFile(path) {
      return FS.readFile({ path: path, directory: DIR, encoding: ENC })
        .then(function (r) { return parse(r && typeof r.data === 'string' ? r.data : null); }, function () { return null; });
    }
    function del(path) { return FS.deleteFile({ path: path, directory: DIR }).then(function () { return true; }, function () { return false; }); }
    function check(path, text) {
      return FS.readFile({ path: path, directory: DIR, encoding: ENC })
        .then(function (r) { return !!r && r.data === text; }, function () { return false; });
    }
    var b = {
      name: 'app', persistent: true,
      read: function () {
        return readFile(FILE).then(function (o) { return o || readFile(TMP); });
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
    load: function () {
      return serial(function () { return be().read(); })
        .then(function (o) { return accept(o); }, function () { return null; });
    },
    save: function (state) {
      var text;
      try { text = JSON.stringify(state); } catch (e) { return Promise.resolve(false); }
      if (typeof text !== 'string') return Promise.resolve(false);
      return serial(function () { return be().write(text); })
        .then(function (ok) { return !!ok; }, function () { return false; });
    },
    /** 進行データを消す。opts.prefs が false でなければ設定も消す（steps. で始まる歩数の基準は残す。opts.all で全部） */
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
    _reset: function () { if (Cap._clear) Cap._clear(); backend = null; be(); }
  };
  be();

  SA.Store = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
