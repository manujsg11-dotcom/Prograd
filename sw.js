// Prograd service worker.
// Los archivos de vendor/ e icons/ se guardan una vez (cache-first).
// index.html se pide siempre a la red primero: si hay internet recibes la última versión sola;
// si no, se abre la copia guardada. Cambia VERSION solo si cambias archivos de vendor/ o icons/.
const VERSION = 'prograd-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'vendor/react.production.min.js', 'vendor/react-dom.production.min.js', 'vendor/htm.js', 'vendor/tailwind.css', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || req.url.endsWith('/index.html');
  if (isPage) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')));
  } else {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })));
  }
});
