/**
 * AURA MUSIC — Stream Engine (Simplified)
 *
 * Only uses youtubei.js (InnerTube) — all other scrapers are dead:
 * - Piped: returns HTML (no companion), or non-googlevideo CDN is gone
 * - Cobalt: v7 API shut down Nov 2024
 * - Invidious: all instances need "Invidious companion" (broken)
 *
 * Flow: youtubei.js → googlevideo URL → /api/audio/[videoId] proxies it
 * Both resolution AND proxy fetch run on Railway's same IP, so no 403.
 */

import { getRedisClient } from "../redis";
import { resolveStream as ytjsResolveStream } from "../youtubei.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StreamResult {
  url: string;
  directPlay: boolean;
  source: "piped" | "cobalt" | "invidious" | "youtubei";
  durationSec?: number;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
const memCache = new Map<string, { result: StreamResult; expiresAt: number }>();
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 min (googlevideo URLs expire in ~30 min)
const REDIS_TTL_SEC = 1500;           // 25 min

// ─── Cache helpers ────────────────────────────────────────────────────────────
async function getFromCache(videoId: string): Promise<StreamResult | null> {
  const mem = memCache.get(videoId);
  if (mem && mem.expiresAt > Date.now()) return mem.result;

  try {
    const redis = getRedisClient();
    const raw = await Promise.race([
      redis.get(`aura:stream:v5:${videoId}`),
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
    redis.set(`aura:stream:v5:${videoId}`, JSON.stringify(result), "EX", REDIS_TTL_SEC).catch(() => {});
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

  console.log(`[Stream] Resolving ${videoId} via youtubei.js...`);

  // Only youtubei.js — proven to work, others are all dead
  const url = await ytjsResolveStream(videoId);
  if (!url || url.length < 10) throw new Error("youtubei: empty url");

  const result: StreamResult = {
    url,
    // googlevideo URLs are IP-locked — NEVER let the browser fetch directly.
    // /api/audio/[videoId] proxies it from the same Railway IP that resolved it.
    directPlay: false,
    source: "youtubei",
  };

  console.log(`[Stream] ✅ Resolved ${videoId} in ${Date.now() - start}ms`);
  await saveToCache(videoId, result);
  return result;
}
