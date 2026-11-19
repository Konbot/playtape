
const CACHE = 'playtape-0.1.0-mwndhpks';
const ASSETS = ["./","index.html","assets/index-CEETzT2X.js","assets/lame.min-jnR_p7RU.js","assets/bricolage-grotesque-latin-ext-wght-normal-CcLUaPy7.woff2","assets/bricolage-grotesque-latin-wght-normal-DLoelf7F.woff2","assets/bricolage-grotesque-vietnamese-wght-normal-BUzh504Q.woff2","assets/geist-mono-cyrillic-ext-wght-normal-X_5orZeX.woff2","assets/geist-mono-cyrillic-wght-normal-DiZS0aHC.woff2","assets/geist-mono-latin-ext-wght-normal-Bwz-egvJ.woff2","assets/geist-mono-latin-wght-normal-XN7g48iV.woff2","assets/geist-mono-symbols2-wght-normal-CO5SzqOn.woff2","assets/geist-mono-vietnamese-wght-normal-DadHysG0.woff2","assets/index-UTBfhJkj.css","favicon-180.png","favicon-256.png","favicon-32.png","favicon-512.png","logo-badge.svg","manifest.webmanifest"];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('playtape-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') { const index = await cache.match('index.html'); if (index) return index; }
    return fetch(req);
  })());
});
