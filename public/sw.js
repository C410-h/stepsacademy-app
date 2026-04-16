const CACHE_NAME = 'steps-academy-v3';

// Install: cache nothing upfront — assets are fetched on demand
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate: wipe all old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip Supabase API — always network
  if (url.hostname.includes('supabase.co')) return;

  // Navigation requests (index.html) — network-first, cache as offline fallback only
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || offlinePage()))
    );
    return;
  }

  // Hashed assets (e.g. /assets/index-Ab1cD2eF.js) — cache-first, long-lived
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (brand images, icons, steppie, etc.) — network-first
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ─── Push Notifications ───────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: event.data?.text() || 'steps academy' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'steps academy', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});

// ─────────────────────────────────────────────────────────────────────────────

function offlinePage() {
  return new Response(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>steps academy</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
    min-height:100vh;margin:0;background:#15012A;color:#F5F0E6;text-align:center;padding:2rem}
    .container{max-width:300px}</style></head>
    <body><div class="container"><p style="font-size:3rem">📵</p>
    <h1 style="color:#C1FE00;margin:0 0 1rem">steps academy</h1>
    <p>Você está offline.</p>
    <p style="opacity:0.7;font-size:0.875rem">Verifique sua conexão e tente novamente.</p>
    </div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
