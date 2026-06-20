/**
 * AURA MUSIC — Stream Engine (Simplified)
 *
 * Uses the new external youtupe-api for all YouTube resolutions.
 * Flow: youtupe-api -> returns download_url -> /api/audio/[videoId] proxies it or redirects
 */

import { getRedisClient } from "../redis";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StreamResult {
  url: string;
  directPlay: boolean;
  source: "youtupe-api" | "piped" | "cobalt" | "invidious" | "youtubei";
  durationSec?: number;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
const memCache = new Map<string, { result: StreamResult; expiresAt: number }>();
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 min (URLs expire in ~30 min)
const REDIS_TTL_SEC = 1500;           // 25 min

const YOUTUBE_API_URL = process.env.YOUTUBE_API_URL || "http://127.0.0.1:3001";

// ─── Cache helpers ────────────────────────────────────────────────────────────
async function getFromCache(videoId: string): Promise<StreamResult | null> {
  const mem = memCache.get(videoId);
  if (mem && mem.expiresAt > Date.now()) return mem.result;

  try {
    const redis = getRedisClient();
    const raw = await Promise.race([
      redis.get(`aura:stream:v6:${videoId}`),
      new Promise<null>((r) => setTimeout(() => r(null), 1200)),
    ]);
    if (raw) {
      const result: StreamResult = JSON.parse(raw);
      memCache.set(videoId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    }
  } catch { /* Redis unavailable */ }

  return null;
}

async function saveToCache(videoId: string, result: StreamResult): Promise<void> {
  memCache.set(videoId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  try {
    const redis = getRedisClient();
    redis.set(`aura:stream:v6:${videoId}`, JSON.stringify(result), "EX", REDIS_TTL_SEC).catch(() => {});
  } catch { /* Redis unavailable */ }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function resolveStreamUrl(videoId: string): Promise<StreamResult> {
  const start = Date.now();

  // 0. Cache (instant)
  const cached = await getFromCache(videoId);
  if (cached) {
    console.log(`[Stream] ⚡ Cache hit ${videoId} (${Date.now() - start}ms)`);
    return cached;
  }

  console.log(`[Stream] Resolving ${videoId} via youtupe-api...`);

  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const apiUrl = `${YOUTUBE_API_URL}/api/download/mp3?url=${encodeURIComponent(targetUrl)}`;

  const res = await fetch(apiUrl);
  
  if (!res.ok) {
    throw new Error(`youtupe-api returned ${res.status}`);
  }

  const data = await res.json();
  if (!data.success || !data.download_url) {
    throw new Error(`youtupe-api failed to extract url: ${data.error || "Unknown error"}`);
  }

  const url = data.download_url;

  const result: StreamResult = {
    url,
    // googlevideo URLs from yt-dlp might be IP-locked depending on the server location.
    // Setting directPlay to false forces our Next.js API to proxy or redirect.
    // Wait, yt-dlp URLs are usually googlevideo URLs. We'll set directPlay false to ensure we can proxy if needed.
    directPlay: false,
    source: "youtupe-api",
  };

  console.log(`[Stream] ✅ Resolved ${videoId} in ${Date.now() - start}ms`);
  await saveToCache(videoId, result);
  return result;
}
