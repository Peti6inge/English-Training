/* English Training — caches the app shell and STT WASM/model requests for offline use. */

const VERSION = "v1.0.8";
const SHELL = `et-shell-${VERSION}`;
const RUNTIME = `et-runtime-${VERSION}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./phrases.json",
  "./css/styles.css",
  "./js/config.js",
  "./js/storage.js",
  "./js/fuzzy.js",
  "./js/tts.js",
  "./js/stt.js",
  "./js/commands.js",
  "./js/queue.js",
  "./js/loop.js",
  "./js/app.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const RUNTIME_HOSTS = [
  "cdn.jsdelivr.net",
  "unpkg.com",
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "ccoreilly.github.io",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL && key !== RUNTIME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((cache) => cache.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetched = fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((cache) => cache.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      }),
    );
    return;
  }

  if (RUNTIME_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      }),
    );
  }
});
