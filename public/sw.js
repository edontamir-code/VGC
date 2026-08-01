/* Champions Battle Assistant - offline shell.
   Deliberately simple: this app has no backend and no remote data, so caching
   the built assets is enough to make it work with no signal beside the game.

   The cache name comes from the ?v= build id the page registers with. That
   matters: a browser only reinstalls a service worker when its URL or bytes
   change, so without this a redeploy would leave everyone on the old cached
   shell with no way to force a refresh. A new build id means a new cache, and
   `activate` deletes every cache that is not the current one. */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `champions-assistant-${VERSION}`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["./", "./index.html", "./icon.svg"]))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Navigations: try the network so a redeploy is picked up, fall back to cache.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Assets are content-hashed, so cache-first is safe and instant.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
