// Service Worker：一度読みこめばオフラインでも遊べるようにする
// 更新時は CACHE の番号と index.html の ?v=N を両方上げる（ニンジャ里ライフの art.js / chars.js も使う）
const CACHE = 'ninja-yoake-tai-v1';
const V = '?v=1';
const CORE = [
  './', './index.html', './about.html', './manifest.webmanifest', './style.css' + V,
  './data.js' + V, './lines.js' + V, './ai.js' + V, './sim.js' + V, './director.js' + V, './progress.js' + V,
  './render.js' + V, './input.js' + V, './audio.js' + V, './tutorial.js' + V, './ui.js' + V, './game.js' + V,
  '../ninja-sato-life/art.js?v=2', '../ninja-sato-life/chars.js?v=2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ninja-yoake-tai-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // 忍者の絵（公式イラスト・シートの縮小版）は、見たものだけためておく
      if (res.ok && (url.pathname.includes('/img/art/') || url.pathname.includes('/sheets/thumb/'))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
