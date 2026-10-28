// Service Worker：一度読みこめばオフラインでも遊べるようにする（同じフォルダのファイルだけ）
// 更新時は CACHE の番号と index.html の ?v=N を両方上げる
// インターネットの外のホストへは何もしない（同じ場所のファイル以外は扱わない）
const CACHE = 'shinobi-ashi-v3';
const V = '?v=3';
const CORE = [
  './', './index.html', './about.html', './manifest.webmanifest',
  './style.css' + V,
  './vendor/qrcode.js' + V, './vendor/jsQR.js' + V,
  './art.js' + V, './chars.js' + V, './data.js' + V, './content.js' + V, './rules.js' + V, './figure.js' + V, './fx.js' + V,
  './store.js' + V, './steps.js' + V, './notify.js' + V, './share.js' + V, './screens.js' + V, './ui.js' + V,
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('shinobi-ashi-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const base = new URL('./', self.location.href).pathname;
  if (!url.pathname.startsWith(base)) return;           // このフォルダの外は扱わない
  if (url.pathname.endsWith('/version.txt')) return;   // 版の確かめはいつもネットワークへ
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && url.pathname.includes('/img/')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
