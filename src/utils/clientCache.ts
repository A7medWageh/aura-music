/**
 * clientCache.ts
 * ──────────────
 * High-performance client-side in-memory + sessionStorage cache.
 * Powers 0ms instantaneous page transitions (like Spotify / YouTube Music).
 * Prevents skeleton flickering and eliminates repeated network requests.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export function getClientCached<T>(key: string, maxAgeMs = 15 * 60 * 1000): T | null {
  if (typeof window === "undefined") return null;

  // 1. Check in-memory Map first (0ms instantaneous)
  const mem = memoryCache.get(key);
  if (mem) {
    if (Date.now() - mem.timestamp < maxAgeMs) {
      return mem.data as T;
    }
  }

  // 2. Check sessionStorage fallback
  try {
    const raw = sessionStorage.getItem(`aura_cache_${key}`);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < maxAgeMs) {
        memoryCache.set(key, parsed);
        return parsed.data;
      }
    }
  } catch {
    // sessionStorage unavailable or parse error
  }

  return null;
}

export function setClientCached<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;

  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);

  try {
    sessionStorage.setItem(`aura_cache_${key}`, JSON.stringify(entry));
  } catch {
    // quota exceeded or private mode
  }
}
