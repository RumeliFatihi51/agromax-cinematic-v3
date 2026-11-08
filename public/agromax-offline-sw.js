const cacheName = "agromax-offline-shell-v1";
const offlinePage = "/agromax-offline.html";
const offlineScript = "/agromax-offline.js";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName)
    .then((cache) => cache.addAll([offlinePage, offlineScript]))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (url.pathname === offlinePage || url.pathname === offlineScript) {
    event.respondWith(caches.open(cacheName).then(async (cache) =>
      await cache.match(url.pathname) || fetch(event.request)));
  } else if (event.request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(fetch(event.request).catch(async () =>
      await (await caches.open(cacheName)).match(offlinePage) || Response.error()));
  }
});
