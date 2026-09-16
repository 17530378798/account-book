const CACHE_NAME = "offline-ledger-v31";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=31",
  "./app.js?v=31",
  "./manifest.webmanifest?v=31",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (path) => {
      const request = new Request(new URL(path, self.registration.scope), { cache: "reload" });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`Unable to cache ${path}`);
      await cache.put(request, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    if (url.pathname.endsWith("/version.json")) {
      try { return await fetch(new Request(event.request, { cache: "no-store" })); }
      catch { return Response.error(); }
    }
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = event.request.mode === "navigate" ? new URL("./index.html", self.registration.scope).href : event.request;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    try {
      const response = await fetch(new Request(event.request, { cache: "no-store" }));
      if (response.ok) await cache.put(cacheKey, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
