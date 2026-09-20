// Minimal offline service worker for PWABuilder compatibility
// Caches the app shell and static assets for offline use

// Bumped so every existing visitor's activate handler (below) purges
// whatever it had cached under the old name — including any stale /admin
// HTML or JS chunk from before the Buffer-crash fix, which would otherwise
// keep being served from cache indefinitely regardless of this file's own
// logic changing. Bump this again any time /admin (or anything else this
// worker precaches/caches) needs a hard reset for existing visitors.
const CACHE_NAME = "plix-admin-v4";
// /admin deliberately NOT precached — see the fetch handler below, which
// now excludes /admin entirely from this worker's caching (no offline use
// case for an admin login screen justifies the risk of ever serving a
// stale version of it).
const PRECACHE_URLS = [
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

  // Never cache server function calls or API routes (property/rate/review
  // data, auth session checks, portal bookings, etc.) — these are GET
  // requests to /_serverFn/* or /api/* that must always hit the network.
  // A browser that ever cached one keeps serving that stale response
  // forever, regardless of any later database, session, or code change —
  // this is exactly what let /api/auth/session keep answering "signed in"
  // after a real sign-out cleared the cookie server-side: the cache-first
  // branch below was serving the pre-sign-out response from a hard reload
  // even though a hard reload otherwise bypasses the HTTP cache, because it
  // does not bypass an active service worker's fetch interception.
  if (url.pathname.startsWith("/_serverFn/") || url.pathname.startsWith("/api/")) return;

  // /admin is never handled by this worker at all — not precached, not
  // cached on the way through, no offline fallback. There's no legitimate
  // offline use case for an admin login screen, and the risk of ever
  // serving a stale cached version of it (which is exactly what made a
  // fixed bug look unfixed — a hard reload doesn't bypass an active
  // service worker's fetch interception) outweighs that non-benefit.
  // Letting the request fall through un-intercepted here means the browser
  // handles it with its own normal HTTP caching semantics instead.
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return;

  // Network-first for navigation requests (HTML pages)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
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
