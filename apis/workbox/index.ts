// Centralized local Workbox adapter.
export { precacheAndRoute } from "workbox-precaching";
export { registerRoute } from "workbox-routing";
export { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
export { ExpirationPlugin } from "workbox-expiration";
export { Queue } from "workbox-background-sync";
