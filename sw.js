const CACHE = 'teiji-hk-v46';
const ASSETS = [
  './',
  './index.html',
  './manifest.json?v=46',
  './css/main.css?v=46',
  './css/components.css?v=46',
  './css/route3d.css?v=46',
  './js/app.js?v=46',
  './js/config.js',
  './js/ui/Route3DPreview.js',
  './assets/models/avatar-stick.glb',
  './js/services/RouteGeometryService.js',
  './icons/icon-192.png?v=46',
  './icons/icon-512.png?v=46',
  './icons/icon-192-maskable.png?v=46',
  './icons/icon-512-maskable.png?v=46',
  './icons/modes/mtr.svg',
  './icons/modes/kmb.svg',
  './icons/modes/walk.svg',
  './icons/modes/taxi.svg',
  './icons/modes/minibus.svg',
  './icons/modes/lrt.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  // 僅快取同源靜態資源；外部 API 交由瀏覽器原生 fetch 處理，避免攔截失敗時回傳 undefined
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});
