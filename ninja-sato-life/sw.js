// Service Worker：一度読みこめばオフラインでも遊べるようにする
// 更新時は CACHE の番号と index.html の ?v=N を両方上げる
const CACHE = 'ninja-sato-life-v2';
const V = '?v=2';
const CORE = [
  './', './index.html', './about.html', './manifest.webmanifest',
  './style.css' + V, './data.js' + V, './art.js' + V, './chars.js' + V, './sheet.js' + V, './rules.js' + V, './clerk.js' + V, './iso.js' + V, './game.js' + V, './ui.js' + V, './tutorial.js' + V,
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // 同じサイトのほかのゲーム（ニンジャ夜明け隊など）のキャッシュは消さない。自分の古い版だけ消す
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ninja-sato-life-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // 時刻あわせ用（サーバーの Date を見る）は、いつもネットワークへ
  if (url.pathname.endsWith('/version.txt')) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && (url.pathname.includes('/img/') || url.pathname.includes('/sheets/thumb/'))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
