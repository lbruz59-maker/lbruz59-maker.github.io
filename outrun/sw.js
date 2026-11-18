const CACHE = "outrun-web-v18";
const SHELL = [
  "./", "./index.html", "./style.css?v=20261118-13", "./app.js?v=20261118-13", "./relay.js?v=20261118-12", "./zip.js",
  "./manifest.webmanifest", "./icon.svg", "./outrun.js", "./outrun.wasm", "./outrun.data"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
