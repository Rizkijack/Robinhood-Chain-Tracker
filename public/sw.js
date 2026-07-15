/**
 * Robinhood Pair Tracker — Service Worker
 *
 * Provides offline support by caching the app shell (HTML, CSS, JS, assets)
 * and serving them when the network is unavailable.
 *
 * Cache strategy:
 *   - Install: pre-cache app shell
 *   - Fetch: cache-first for static assets, network-first for API calls
 *   - Activate: clean old caches
 */

const CACHE_NAME = "rh-tracker-v1";

// Assets to pre-cache on install (app shell)
const PRECACHE_URLS = [
  "/",
  "/logo.svg",
];

// API routes — never cache these (always go to network)
const NETWORK_ONLY_URLS = [
  "/api/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Pre-caching is best-effort; individual failures are non-fatal
      });
    })
  );
  // Activate immediately without waiting for reload
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean old cache versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all pages immediately
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and browser extension requests
  if (event.request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // API calls: network-only (no caching)
  if (NETWORK_ONLY_URLS.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(fetch(event.request).catch(() => {
      return new Response(
        JSON.stringify({ error: "Offline", pairs: [], count: 0 }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }));
    return;
  }

  // Static assets (JS, CSS, images): cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|otf)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, clone);
              });
            }
            return response;
          })
          .catch(() => cached || new Response("Offline", { status: 503 }));
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else (HTML pages, etc.): network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => {
        return cached || new Response("Offline", { status: 503 });
      }))
  );
});
