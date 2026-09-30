/* ニンジャ相棒道場 — オフライン用（一度読みこめば、オフラインでも標準の修行・指導・物語が動く） */
var CACHE = 'nad-v2';
var CORE = ['./', 'index.html', 'style.css?v=2', 'data.js?v=2', 'art.js?v=2', 'chars.js?v=2', 'lines.js?v=2', 'policy.js?v=2', 'sim.js?v=2', 'story.js?v=2', 'sheet.js?v=2', 'render.js?v=2', 'game.js?v=2', 'ui.js?v=2', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'about.html'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('nad-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // キャラクターシートなどの画像は、見たときにだけ保存する
  e.respondWith(caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && res.ok && /\/ninja-aibou-dojo\/(sheets\/|icons\/)/.test(req.url)) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
