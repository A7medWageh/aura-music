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

// ─── Cache helpers ────────────────────────────────────────────────────────────
async function getFromCache(videoId: string): Promise<StreamResult | null> {
  const mem = memCache.get(videoId);
  if (mem && mem.expiresAt > Date.now()) return mem.result;

  try {
    const redis = getRedisClient();
    const raw = await Promise.race([
      redis.get(`aura:stream:v8:${videoId}`),
      new Promise<null>((r) => setTimeout(() => r(null), 800)),
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
    redis.set(`aura:stream:v8:${videoId}`, JSON.stringify(result), "EX", REDIS_TTL_SEC).catch(() => {});
  } catch { /* Redis unavailable */ }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function resolveStreamUrl(videoId: string, title?: string, artist?: string): Promise<StreamResult> {
  const start = Date.now();

  // 0. Cache (instant)
  const cached = await getFromCache(videoId);
  if (cached) {
    console.log(`[Stream] ⚡ Cache hit ${videoId} (${Date.now() - start}ms)`);
    return cached;
  }

  console.log(`[Stream] Resolving ${videoId} via Universal Audio Resolver...`);

  const resolved = await resolveUniversalAudio({ videoId, title, artist });

  const result: StreamResult = {
    url: resolved.streamUrl,
    directPlay: resolved.directPlay,
    source: resolved.source as any,
    durationSec: resolved.durationSec,
  };

  console.log(`[Stream] ✅ Resolved ${videoId} via ${resolved.source} in ${Date.now() - start}ms`);
  await saveToCache(videoId, result);
  return result;
}
