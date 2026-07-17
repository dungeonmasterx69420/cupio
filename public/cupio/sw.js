/* CUPIO service worker — app shell + runtime caching.
   Mirrors the YARDIO PWA behavior (vite-plugin-pwa/Workbox) by hand, since
   this app has no build step:
     - navigations: network-first, offline fallback to the cached shell
     - /api/*: network-first with timeout — fresh online, last-loaded offline
     - Google Fonts: stylesheet stale-while-revalidate, font files cache-first
     - cross-origin images (team logos etc.): cache-first
   Bump VERSION to invalidate all caches on the next visit. */
'use strict';

const VERSION = 'v1';
const PREFIX = 'cupio';
/* Resolve the shell relative to the SW so host-based ("/") and path-based
   ("/cupio/") serving both work. */
const BASE = new URL('./', self.location).pathname;

const SHELL_CACHE = `${PREFIX}-shell-${VERSION}`;
const API_CACHE = `${PREFIX}-api-${VERSION}`;
const STATIC_CACHE = `${PREFIX}-static-${VERSION}`;
const FONT_CACHE = `${PREFIX}-fonts-${VERSION}`;
const IMG_CACHE = `${PREFIX}-img-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(BASE, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(`${PREFIX}-`) && !k.endsWith(`-${VERSION}`))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function cacheable(res) {
  return res && (res.ok || res.type === 'opaque');
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

async function networkFirst(request, cacheName, { timeoutSeconds = 6, fallbackUrl } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('network timeout')), timeoutSeconds * 1000)
      ),
    ]);
    if (cacheable(response)) {
      cache.put(request, response.clone());
      trim(cacheName, 64);
    }
    return response;
  } catch (err) {
    const hit =
      (await cache.match(request)) || (fallbackUrl && (await caches.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (cacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return hit || refresh.then((r) => r || Promise.reject(new Error('offline, no cache')));
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (cacheable(response)) {
    cache.put(request, response.clone());
    trim(cacheName, max);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, { fallbackUrl: BASE }));
    return;
  }

  if (url.origin === self.location.origin) {
    /* health checks are for monitors, not worth caching */
    if (url.pathname === '/healthz' || url.pathname.endsWith('/health')) return;
    if (url.pathname.includes('/api/')) {
      event.respondWith(networkFirst(request, API_CACHE));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }
  if (url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONT_CACHE, 24));
    return;
  }
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMG_CACHE, 200));
  }
});
