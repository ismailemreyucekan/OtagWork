/**
 * OtagWork — Service Worker
 *
 * Strateji (bayat UI sorununu kalıcı çözmek için):
 *  - Gezinme / HTML  → NETWORK-FIRST: her zaman taze index.html alınır,
 *    böylece her zaman güncel (hash'li) bundle'lara referans verir.
 *    Ağ yoksa cache'lenmiş index.html'e düşülür (offline fallback).
 *  - /assets/* (hash'li, içerik-adresli) → CACHE-FIRST + immutable kabul edilir.
 *  - /api/...        → SW karışmaz; doğrudan ağa gider (bayat veri riski yok).
 *  - Diğer statikler (icon, manifest) → cache-first.
 *
 * Sürüm yükseltmek için CACHE_NAME'i artır; activate eski cache'leri siler.
 */

const CACHE_NAME = 'otagwork-v2';
const APP_SHELL = ['/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API: SW karışmasın — daima ağdan taze veri
  if (url.pathname.startsWith('/api/')) return;

  // Gezinme / HTML → network-first (taze index.html garantisi)
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // Hash'li build çıktıları → cache-first (içerik değişmez)
  // Diğer statikler de cache-first; ağdan gelirse cache'i tazele.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
