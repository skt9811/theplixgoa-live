// Minimal offline service worker for PWABuilder compatibility
// Caches the app shell and static assets for offline use

const CACHE_NAME = "plix-admin-v2";
const PRECACHE_URLS = [
  "/admin",
  "/",
  "/manifest.json",
  "/Plix_Transparent_(1).png",
  "/icon-192.png",
  "/icon-512.png",
];

// Install: precache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // If any precache fails, continue — don't block installation
      })
    )
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for navigation, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip cross-origin requests (Supabase, Razorpay, etc.)
  if (url.origin !== self.location.origin) return;

  // Never cache server function calls (property/rate/review data, etc.) —
  // these are GET requests to /_serverFn/* that must always hit the network,
  // otherwise a browser that ever cached one keeps serving that stale
  // response forever, regardless of any later database or code change.
  if (url.pathname.startsWith("/_serverFn/")) return;

  // Network-first for navigation requests (HTML pages)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/admin")))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
