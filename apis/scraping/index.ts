/**
 * AURA MUSIC — Stream Engine
 *
 * Uses the Universal Audio Resolver (JioSaavn, Albumaty, SoundCloud, YouTube)
 * to resolve direct audio streams without needing external localhost servers.
 */

import { getRedisClient } from "../redis";
import { resolveUniversalAudio } from "@/services/music/universalAudioResolver";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StreamResult {
  url: string;
  directPlay: boolean;
  source: "youtupe-api" | "piped" | "cobalt" | "invidious" | "youtubei" | "jiosaavn" | "albumaty" | "soundcloud";
  durationSec?: number;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
const memCache = new Map<string, { result: StreamResult; expiresAt: number }>();
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 min
const REDIS_TTL_SEC = 1500;           // 25 min

function getCacheKey(videoId: string, title?: string, artist?: string): string {
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) return videoId;
  return `${title || ""}__${artist || ""}`.toLowerCase().trim();
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
async function getFromCache(key: string): Promise<StreamResult | null> {
  if (!key) return null;
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.result;

  try {
    const redis = getRedisClient();
    const raw = await Promise.race([
      redis.get(`aura:stream:v8:${key}`),
      new Promise<null>((r) => setTimeout(() => r(null), 800)),
    ]);
    if (raw) {
      const result: StreamResult = JSON.parse(raw);
      memCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    }
  } catch { /* Redis unavailable */ }

  return null;
}

async function saveToCache(key: string, result: StreamResult): Promise<void> {
  if (!key) return;
  memCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  try {
    const redis = getRedisClient();
    redis.set(`aura:stream:v8:${key}`, JSON.stringify(result), "EX", REDIS_TTL_SEC).catch(() => {});
  } catch { /* Redis unavailable */ }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function resolveStreamUrl(videoId: string, title?: string, artist?: string): Promise<StreamResult> {
  const start = Date.now();
  const cacheKey = getCacheKey(videoId, title, artist);

  // 0. Cache (instant)
  if (cacheKey) {
    const cached = await getFromCache(cacheKey);
    if (cached) {
      console.log(`[Stream] ⚡ Cache hit ${cacheKey} (${Date.now() - start}ms)`);
      return cached;
    }
  }

  console.log(`[Stream] Resolving ${videoId} (${title || ""} - ${artist || ""}) via Universal Audio Resolver...`);

  const resolved = await resolveUniversalAudio({ videoId, title, artist });

  const result: StreamResult = {
    url: resolved.streamUrl,
    directPlay: resolved.directPlay,
    source: resolved.source as any,
    durationSec: resolved.durationSec,
  };

  console.log(`[Stream] ✅ Resolved ${videoId} via ${resolved.source} in ${Date.now() - start}ms`);
  if (cacheKey) {
    await saveToCache(cacheKey, result);
  }
  return result;
}
