// Prograd service worker.
// Los archivos de vendor/ e icons/ se guardan una vez (cache-first).
// index.html se pide siempre a la red primero: si hay internet recibes la última versión sola;
// si no, se abre la copia guardada. Cambia VERSION solo si cambias archivos de vendor/ o icons/.
const VERSION = 'prograd-v14';
const PUSH_SERVER = 'https://prograd-avisos.manujsg11.workers.dev';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icono-prograd-v3.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
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

// Avisos: el servidor manda un aviso vacío y aquí se pide el texto del día
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let titulo = 'Prograd', texto = 'Abre la app para ver tu entreno de hoy.';
    try {
      if (e.data && e.data.text()) { const d = e.data.json(); titulo = d.titulo || titulo; texto = d.texto || texto; }
      else {
        const sub = await self.registration.pushManager.getSubscription();
        const r = await fetch(PUSH_SERVER + '/mensaje', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub && sub.endpoint }) });
        const d = await r.json(); titulo = d.titulo || titulo; texto = d.texto || texto;
      }
    } catch (err) { }
    await self.registration.showNotification(titulo, { body: texto, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'prograd-hoy' });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const ws = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of ws) { if ('focus' in w) return w.focus(); }
    return self.clients.openWindow('./');
  })());
});
