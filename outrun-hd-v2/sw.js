const CACHE = "outrun-hd-beetle-cleanrestore3";
const SHELL = [
  "./arcade-ui.js?v=20261119-cleanrestore3", "./marshal.webp", "./arch.webp", "./distance-0.webp","./distance-1.webp","./distance-2.webp","./distance-3.webp","./distance-4.webp","./distance-5.webp","./distance-6.webp","./distance-7.webp","./distance-8.webp","./distance-9.webp","./distance-10.webp","./distance-11.webp","./distance-12.webp","./distance-13.webp","./distance-14.webp", "./verges.webp", "./pavement.webp", "./landscape.js?v=20261119-cleanrestore3", "./beetle.js?v=20261119-cleanrestore3", "./sprites.js?v=20261119-cleanrestore3", "./sprites-0.webp", "./sprites-1.webp", "./sprites-2.webp", "./sprites-3.webp", "./sprites-4.webp", "./sprites-5.webp", "./sprites-detail.webp", "./", "./index.html", "./style.css?v=20261118-13", "./app.js?v=20261119-cleanrestore3", "./relay.js?v=20261118-12", "./zip.js",
  "./manifest.webmanifest", "./icon.svg", "./outrun.js?v=20261119-cleanrestore3", "./outrun.wasm?v=20261119-cleanrestore3", "./outrun.data?v=20261119-cleanrestore3"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("outrun-hd-beetle-") && key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope)) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match("./index.html") || Response.error();
    }));
    return;
  }
  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
    } catch (_) {}
    const response = await fetch(request);
    if (cache && response.ok) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    return response;
  })());
});
