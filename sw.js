const CACHE_NAME = "mi-tactical-centre-disabled-v1.4.8";
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});
