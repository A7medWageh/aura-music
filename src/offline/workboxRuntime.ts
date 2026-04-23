import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Queue,
  StaleWhileRevalidate,
  registerRoute
} from "@apis/workbox";

// Runtime policy blueprint using the mandatory local /apis/workbox adapter.
// This module documents production caching policies and can be shared by
// service-worker build tooling if you later move to an injected Workbox build.
export const offlinePolicies = {
  pageStrategy: new NetworkFirst({ cacheName: "music-pages" }),
  staticStrategy: new StaleWhileRevalidate({
    cacheName: "music-static",
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 })]
  }),
  audioStrategy: new CacheFirst({
    cacheName: "music-audio",
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })]
  }),
  syncQueue: new Queue("music-offline-sync")
};

export function registerOfflineRoutes() {
  registerRoute(({ request }) => request.destination === "document", offlinePolicies.pageStrategy);
  registerRoute(
    ({ request }) => ["style", "script", "font", "image"].includes(request.destination),
    offlinePolicies.staticStrategy
  );
  registerRoute(({ url }) => url.pathname.startsWith("/api/stream/"), offlinePolicies.audioStrategy);
}
