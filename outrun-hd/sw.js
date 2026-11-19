const CACHE = "outrun-hd-beetle-v3";
const SHELL = [
  "./beetle.js", "./sprites.js", "./sprites-0.webp", "./sprites-1.webp", "./sprites-2.webp", "./sprites-3.webp", "./sprites-4.webp", "./sprites-5.webp", "./sprites-detail.webp", "./", "./index.html", "./style.css?v=20261118-13", "./app.js?v=20261119-hd1", "./relay.js?v=20261118-12", "./zip.js",
  "./manifest.webmanifest", "./icon.svg", "./outrun.js?v=20261119-hd1", "./outrun.wasm?v=20261119-hd1", "./outrun.data?v=20261119-hd1"
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
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(hit => hit || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});

