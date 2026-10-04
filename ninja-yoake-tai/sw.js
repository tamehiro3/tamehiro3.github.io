// Service Worker：一度読みこめばオフラインでも遊べるようにする
// 更新時は CACHE の番号と index.html の ?v=N を両方上げる（ニンジャ里ライフの art.js / chars.js も使う）
const CACHE = 'ninja-yoake-tai-v4';
const V = '?v=4';
const FILES = ['data_base.js', 'data_skills.js', 'data_chars.js', 'data_items.js', 'data_enemies.js', 'data_maps.js', 'data_story.js',
  'state.js', 'field.js', 'script.js', 'battle.js', 'sprites.js', 'draw_world.js', 'draw_yokai.js', 'render_field.js', 'render_battle.js',
  'audio.js', 'input.js', 'ui.js', 'ui_menu.js', 'battle_ui.js', 'game.js'];
const CORE = [
  './', './index.html', './about.html', './manifest.webmanifest', './style.css' + V
].concat(FILES.map(f => './' + f + V)).concat([
  '../ninja-sato-life/art.js?v=3', '../ninja-sato-life/chars.js?v=2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
]);
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
      // 忍者の絵（公式イラスト）は、見たものだけためておく
      if (res.ok && url.pathname.includes('/img/art/')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
