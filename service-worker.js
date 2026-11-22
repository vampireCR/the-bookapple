const CACHE_NAME = "theapplebook-v3";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./achievements.css",
  "./achievements.js",
  "./profile.css",
  "./profile.js",
  "./extras.css",
  "./extras.js",
  "./pwa.js",
  "./moderation.js",
  "./manifest.json"
];

// Установка новой версии
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.all(
        FILES_TO_CACHE.map(async file => {
          try {
            await cache.add(file);
          } catch (error) {
            console.warn(
              "TheAppleBook: Не удалось добавить в кеш:",
              file,
              error
            );
          }
        })
      );
    })
  );

  self.skipWaiting();
});

// Удаление старых кешей
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// Получение файлов
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, copy);
          });
        }

        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);

        if (cached) return cached;

        if (event.request.mode === "navigate") {
          const fallback = await caches.match("./index.html");

          if (fallback) return fallback;
        }

        return new Response(
          "Нет подключения к интернету",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      })
  );
});
