/* Service Worker - BELT NF-e */
const CACHE_NAME = 'belt-nfe-v9';

/* Recursos essenciais para o app abrir offline */
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

/* Recurso externo (CDN) - cacheado separadamente para nao quebrar o install se a CDN falhar */
const CDN_ASSETS = [
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    // CDN: tenta cachear, mas ignora falhas individuais
    await Promise.allSettled(CDN_ASSETS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // So intercepta GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca intercepta o backend (Apps Script/Google) - sempre rede direta
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('script.googleusercontent.com')) {
    return;
  }

  // Navegacao (abrir/recarregar a pagina): rede primeiro, cai para o cache offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match('./index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Estaticos (icones, css, CDN): cache primeiro, atualiza em segundo plano
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && (url.origin === self.location.origin || req.url.startsWith('https://unpkg.com'))) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      return Response.error();
    }
  })());
});
