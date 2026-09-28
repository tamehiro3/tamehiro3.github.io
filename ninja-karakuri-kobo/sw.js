// Service Worker：一度読みこめばオフラインでも遊べるようにする
// 更新時は CACHE の番号と index.html の ?v=N を両方上げる
const CACHE = 'ninja-karakuri-kobo-v1';
const V = '?v=1';
const CORE = [
  './', './index.html', './about.html', './manifest.webmanifest',
  './style.css' + V, './data.js' + V, './engine.js' + V, './rules.js' + V, './store.js' + V, './art.js' + V, './chars.js' + V,
  './stages.js' + V, './solutions.js' + V, './render.js' + V, './sound.js' + V, './play.js' + V, './editor.js' + V, './ui.js' + V, './tutorial.js' + V,
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // 名鑑のシート（縮小版）は、見たものだけ置いておく
      if (res.ok && url.pathname.includes('/sheets/')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
