/* Never cache account pages, payment status, API responses or live product data. */
const CACHE = "teebanj-static-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(["offline.html", "css/style.css", "css/teebanj.css"]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith("ajusti-") ||
                (k.startsWith("teebanj-") && k !== CACHE),
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  if (
    u.pathname.includes("/api/") ||
    /\/(account|checkout|order|admin)\.html$/.test(u.pathname)
  )
    return;
  if (e.request.mode === "navigate")
    e.respondWith(fetch(e.request).catch(() => caches.match("offline.html")));
});
