const CACHE_VERSION = "smartev-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  // External Apps Script endpoints must be left alone. The SW should not cache or
  // intercept API calls because they are cross-origin and may fail during deploy or auth checks.
  if (url.origin === "https://script.google.com") {
    return;
  }

  // Pages: network first so a new deploy is picked up, cache as offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;
          return caches.match("./index.html");
        })
    );
    return;
  }

  // Assets are built with unique hashes, so prefer the fresh network response and
  // refresh the cache only after a successful fetch. This avoids serving stale JS
  // bundles from a desktop browser that still has an older PWA cache installed.
  const isSameOriginAsset =
    url.origin === self.location.origin &&
    /\.(?:css|js|mjs|json|svg|png|jpg|jpeg|webp|ico|webmanifest)$/i.test(url.pathname);

  if (isSameOriginAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          return Response.error();
        })
    );
    return;
  }

  // Everything else (Apps Script API, fonts): network first, cache as offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        return Response.error();
      })
  );
});
