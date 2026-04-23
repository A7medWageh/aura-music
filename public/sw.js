const STATIC_CACHE = "music-web-static-v4";
const API_CACHE = "music-web-api-v4";
const AUDIO_CACHE = "music-web-audio-v4";
const OFFLINE_PAGE = "/offline.html";
const SYNC_TAG = "musicweb-offline-sync";
const DB_NAME = "musicweb-sw";
const DB_STORE = "sync-queue";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(["/", OFFLINE_PAGE, "/manifest.json"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, API_CACHE, AUDIO_CACHE].includes(key))
          .map((oldKey) => caches.delete(oldKey))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname === "/api/offline/sync") {
    event.respondWith(handleOfflineSyncPost(request));
    return;
  }

  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/api/proxy")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (url.pathname.startsWith("/api/stream/") || url.pathname.includes("googlevideo")) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(flushSyncQueue());
});

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return (await caches.match(OFFLINE_PAGE)) || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || network || Response.error();
}

async function handleOfflineSyncPost(request) {
  try {
    return await fetch(request.clone());
  } catch {
    const body = await request.clone().text();
    await addSyncItem({ url: request.url, method: request.method, body });
    await registerBackgroundSync();
    return new Response(JSON.stringify({ ok: true, queued: true }), {
      status: 202,
      headers: { "content-type": "application/json" }
    });
  }
}

async function registerBackgroundSync() {
  try {
    await self.registration.sync.register(SYNC_TAG);
  } catch {
    await flushSyncQueue();
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    // FORCE CACHE INVALIDATION SW (v4)
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addSyncItem(item) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).add({ ...item, createdAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getSyncItems() {
  const db = await openDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

async function clearSyncItems() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function flushSyncQueue() {
  const items = await getSyncItems();
  if (!items.length) return;

  const failed = [];
  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: { "content-type": "application/json" },
        body: item.body
      });
      if (!response.ok) failed.push(item);
    } catch {
      failed.push(item);
    }
  }

  await clearSyncItems();
  for (const item of failed) {
    await addSyncItem(item);
  }
}
