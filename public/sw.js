// Lets the app open without internet. It keeps the page, its script and style
// files, and images that have been seen. It never answers for the API: shop
// data offline comes from the copy the app keeps itself (src/offlineStore.ts).

const CACHE = "hishabpos-v1";
const PAGE = "/";
// Where the list of the current version's files is remembered.
const VERSION = "/__app-version";

// Stores the page and the files it names, and drops script and style files from
// older versions of the app.
async function keepPage(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const files = [...new Set(html.match(/\/assets\/[^"'\s>]+/g) || [])];
  await cache.put(PAGE, response);
  await Promise.all(files.map(async (file) => {
    if (!(await cache.match(file))) await cache.add(file);
  }));
  // Old files are cleared out only when a new version of the app has arrived.
  // Parts of the app that are fetched later (the camera's barcode reader) are not
  // named in the page, and would otherwise be thrown away on every visit.
  const version = files.join(" ");
  const kept = await cache.match(VERSION);
  if (kept && (await kept.text()) === version) return;
  if (kept) {
    for (const request of await cache.keys()) {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/assets/") && !files.includes(path)) await cache.delete(request);
    }
  }
  await cache.put(VERSION, new Response(version));
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(fetch(PAGE).then(keepPage).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))),
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // The page: always the newest when online, the kept copy when not.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) event.waitUntil(keepPage(response.clone()).catch(() => undefined));
          return response;
        })
        .catch(async () => (await caches.match(PAGE)) || Response.error()),
    );
    return;
  }

  // Files whose content never changes under the same name.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/uploads/") || url.pathname === "/favicon.svg") {
    event.respondWith(
      caches.match(request).then((kept) => kept || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })),
    );
  }
});
