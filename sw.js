// Offline support: network first (so updates arrive), falling back to the
// cached copy when there's no signal. Bump VERSION when files are added.
const VERSION = 'tt-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './assets/icon.svg',
  './assets/icon-192.png',
  './js/main.js',
  './js/store.js',
  './js/ui.js',
  './js/domain/constants.js',
  './js/domain/contact.js',
  './js/domain/csv.js',
  './js/domain/importer.js',
  './js/domain/inventory.js',
  './js/domain/leads.js',
  './js/domain/metrics.js',
  './js/domain/phone.js',
  './js/domain/scoring.js',
  './js/domain/templates.js',
  './js/domain/util.js',
  './js/domain/visits.js',
  './js/views/backup.js',
  './js/views/components.js',
  './js/views/dashboard.js',
  './js/views/import.js',
  './js/views/lead-detail.js',
  './js/views/lead-form.js',
  './js/views/leads.js',
  './js/views/more.js',
  './js/views/order-detail.js',
  './js/views/order-form.js',
  './js/views/orders.js',
  './js/views/outreach.js',
  './js/views/personalise.js',
  './js/views/settings.js',
  './js/views/stock.js',
  './js/views/visits.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
  );
});
