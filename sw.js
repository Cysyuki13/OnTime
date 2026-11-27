const CACHE = 'teiji-hk-v50';
const ASSETS = [
  './',
  './index.html',
  './manifest.json?v=47',
  './css/main.css?v=47',
  './css/components.css?v=47',
  './css/route3d.css?v=47',
  './js/app.js?v=47',
  './js/config.js',
  './js/ui/Route3DPreview.js',
  './assets/models/avatar-stick.glb',
  './js/services/RouteGeometryService.js',
  './icons/icon-192.png?v=47',
  './icons/icon-512.png?v=47',
  './icons/icon-192-maskable.png?v=47',
  './icons/icon-512-maskable.png?v=47',
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
  // 僅處理同源靜態資源；外部 API 交由瀏覽器原生 fetch 處理
  if (url.origin !== self.location.origin) return;

  // 程式碼／頁面走 network-first：保證每次改版都拿到新檔（避免桌機版一直用舊 UI）
  const isCode =
    e.request.mode === 'navigate' || /\.(html|js|css|json)$/i.test(url.pathname);

  if (isCode) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(e.request);
          if (res && res.ok) {
            const cache = await caches.open(CACHE);
            cache.put(e.request, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(e.request);
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // 圖示、模型等資源走 cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});
