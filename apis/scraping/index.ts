/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  AURA MUSIC — Ultra-Fast Scraping Engine v2                        ║
 * ║  Verified Instances | Invidious Proxy | Works on Vercel            ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Strategy (in priority order — all run concurrently where possible):
 *
 * Layer 1: Piped CDN       — Non-googlevideo URLs, direct browser play
 * Layer 2: Cobalt API      — Real scraping, their own tunnel URLs
 * Layer 3: Invidious Proxy — Invidious server proxies googlevideo itself!
 *                            Browser → Invidious → googlevideo (Invidious IPs not blocked!)
 * Layer 4: youtubei.js     — In-process InnerTube, last resort
 *
 * Why Invidious Proxy works on Vercel:
 *   - Browser fetches from the Invidious server directly (not from Vercel)
 *   - Invidious server is NOT on Vercel so googlevideo doesn't block it
 *   - URL format: {invidious}/latest_version?id={videoId}&itag={itag}&local=true
 *
 * Full song guarantee:
 *   - Piped/Invidious return lengthSeconds — reject < 60s (Shorts)
 *   - Cobalt always returns the full audio
 */

import { getRedisClient } from "../redis";
import { resolveStream as ytjsResolveStream } from "../youtubei.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StreamResult {
  url: string;
  /** true = browser can fetch directly without Vercel proxy */
  directPlay: boolean;
  source: "piped" | "cobalt" | "invidious" | "youtubei";
  durationSec?: number;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
const memCache = new Map<string, { result: StreamResult; expiresAt: number }>();
// Short TTL — stream URLs expire quickly
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const REDIS_TTL_SEC = 10800; // 3 hours

// ─── Helpers ──────────────────────────────────────────────────────────────────
function raceAll<T>(promises: Promise<T>[], timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!promises.length) { reject(new Error("empty")); return; }
    let settled = false;
    let failures = 0;

    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error("timeout")); }
    }, timeoutMs);

    for (const p of promises) {
      p.then((v) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(v); }
      }).catch(() => {
        failures++;
        if (failures === promises.length && !settled) {
          settled = true; clearTimeout(timer);
          reject(new Error("all_failed"));
        }
      });
    }
  });
}

async function timedFetch(url: string, opts: RequestInit = {}, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { cache: "no-store", ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function isFullSong(durationSec: number): boolean {
  return durationSec <= 0 || durationSec >= 60;
}

// ─── Cache ────────────────────────────────────────────────────────────────────
async function getFromCache(videoId: string): Promise<StreamResult | null> {
  const mem = memCache.get(videoId);
  if (mem && mem.expiresAt > Date.now()) return mem.result;

  try {
    const redis = getRedisClient();
    const raw = await Promise.race([
      redis.get(`aura:stream:v4:${videoId}`),
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
    redis.set(`aura:stream:v4:${videoId}`, JSON.stringify(result), "EX", REDIS_TTL_SEC).catch(() => {});
  } catch { /* Redis unavailable */ }
}

// ─── Layer 1: Piped CDN ───────────────────────────────────────────────────────
// ONLY verified-working instances with good uptime (2025-04)
// Piped CDN URLs are served by Piped infrastructure — not googlevideo!
const PIPED_APIS = [
  "https://api.piped.private.coffee",   // 🇦🇹 90% uptime (best)
  "https://pipedapi.kavin.rocks",        // original — sometimes slow
  "https://pipedapi.adminforge.de",
  "https://piped-api.garudalinux.org",
  "https://api.piped.yt",
];

async function resolveViaPiped(videoId: string): Promise<StreamResult> {
  return raceAll(PIPED_APIS.map(async (api) => {
    const res = await timedFetch(
      `${api}/streams/${videoId}`,
      { headers: { "Accept": "application/json" } },
      5000
    );
    if (!res.ok) throw new Error(`${api} ${res.status}`);
    const data = await res.json();

    const durationSec: number = data.duration ?? 0;
    if (!isFullSong(durationSec)) throw new Error("short_video");

    const streams: any[] = data.audioStreams ?? [];
    const sorted = streams
      .filter((s: any) => s.url)
      .sort((a: any, b: any) => {
        // Strong preference for Piped CDN (non-googlevideo) — plays in browser!
        const aOk = !a.url.includes("googlevideo.com");
        const bOk = !b.url.includes("googlevideo.com");
        if (aOk !== bOk) return aOk ? -1 : 1;
        return (b.bitrate ?? 0) - (a.bitrate ?? 0);
      });

    const best = sorted[0];
    if (!best?.url) throw new Error("no_url");

    // Only accept non-googlevideo — googlevideo is blocked on Vercel proxies
    if (best.url.includes("googlevideo.com")) throw new Error("only_googlevideo");

    return {
      url: best.url,
      directPlay: true,
      source: "piped" as const,
      durationSec,
    };
  }), 6000);
}

// ─── Layer 2: Cobalt API ──────────────────────────────────────────────────────
// Cobalt returns its OWN tunnel URLs — not googlevideo, always direct playable
// Using fresh instances from instances.cobalt.best (2025-04)
const COBALT_APIS = [
  "https://cobalt-api.meowing.de",     // 88% score — best
  "https://capi.3kh0.net",             // 76% score
  "https://downloadapi.stuff.solutions", // 44% score — extra fallback
];

async function resolveViaCobalt(videoId: string): Promise<StreamResult> {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  return raceAll(COBALT_APIS.map(async (base) => {
    const res = await timedFetch(
      `${base}/`,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: youtubeUrl,
          downloadMode: "audio",
          audioFormat: "mp3",
          audioBitrate: "128",
          filenameStyle: "basic",
          disableMetadata: true,
        }),
      },
      9000
    );

    if (!res.ok) throw new Error(`cobalt ${base} ${res.status}`);
    const data = await res.json();
    if (data.status === "error") throw new Error(`cobalt error: ${data.error?.code}`);
    if (!data.url) throw new Error("cobalt no_url");

    return {
      url: data.url,
      directPlay: true, // Cobalt tunnel — always their own CDN
      source: "cobalt" as const,
    };
  }), 10000);
}

// ─── Layer 3: Invidious PROXY ─────────────────────────────────────────────────
// THE KEY INSIGHT: Invidious has its own proxy endpoint that serves googlevideo
// through the Invidious server — so the BROWSER fetches from Invidious (not blocked!)
// and Invidious fetches from googlevideo (Invidious IPs are not blocked by Google)
//
// URL format: {instance}/latest_version?id={videoId}&itag={itag}&local=true
// This makes Invidious proxy the audio — zero Vercel involvement!
const INVIDIOUS_PROXY_INSTANCES = [
  "https://invidious.flokinet.to",        // reliable EU instance
  "https://yt.artemislena.eu",             // reliable EU instance
  "https://invidious.perennialte.ch",      // reliable
  "https://invidious.projectsegfau.lt",
  "https://iv.ggtyler.dev",
  "https://invidious.privacydev.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.drgns.space",
];

async function resolveViaInvidiousProxy(videoId: string): Promise<StreamResult> {
  return raceAll(INVIDIOUS_PROXY_INSTANCES.map(async (api) => {
    // Step 1: Get video metadata (just the itag and duration)
    const res = await timedFetch(
      `${api}/api/v1/videos/${videoId}?fields=adaptiveFormats,lengthSeconds`,
      { headers: { "Accept": "application/json" } },
      5000
    );
    if (!res.ok) throw new Error(`${api} ${res.status}`);
    const data = await res.json();

    const durationSec: number = data.lengthSeconds ?? 0;
    if (!isFullSong(durationSec)) throw new Error("short_video");

    const formats: any[] = data.adaptiveFormats ?? [];
    // Pick best audio format (prefer webm/opus, then mp4/aac)
    const audioFormats = formats
      .filter((f: any) => f.type?.includes("audio") && f.itag)
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

    const best = audioFormats[0];
    if (!best?.itag) throw new Error("no_audio_itag");

    // Step 2: Return the Invidious PROXY URL — not googlevideo!
    // When browser fetches this, Invidious proxies it from googlevideo
    const proxyUrl = `${api}/latest_version?id=${videoId}&itag=${best.itag}&local=true`;

    return {
      url: proxyUrl,
      directPlay: true, // Browser fetches from Invidious — no CORS, no blocking
      source: "invidious" as const,
      durationSec,
    };
  }), 7000);
}

// ─── Layer 4: youtubei.js ─────────────────────────────────────────────────────
// Proven fallback — uses the warmed singleton, avoids JS evaluator issues
async function resolveViaYoutubei(videoId: string): Promise<StreamResult> {
  const url = await ytjsResolveStream(videoId);
  if (!url) throw new Error("youtubei: empty url");
  return {
    url,
    directPlay: !url.includes("googlevideo.com"),
    source: "youtubei",
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function resolveStreamUrl(videoId: string): Promise<StreamResult> {
  const start = Date.now();

  // 0. Cache (instant)
  const cached = await getFromCache(videoId);
  if (cached) {
    console.log(`[Scraping] ⚡ Cache hit ${videoId} (${Date.now() - start}ms)`);
    return cached;
  }

  const succeed = async (result: StreamResult, layer: string): Promise<StreamResult> => {
    if (!result.url || result.url.length < 10) throw new Error(`${layer}: invalid url`);
    console.log(`[Scraping] ✅ ${layer} → ${videoId} in ${Date.now() - start}ms (directPlay=${result.directPlay})`);
    await saveToCache(videoId, result);
    return result;
  };

  try {
    const result = await raceAll(
      [
        resolveViaYoutubei(videoId).then(async (r) => { 
          // Artificially delay youtubei so that Piped/Cobalt/Invidious can win the race if they are fast.
          // This ensures we get directPlay=true URLs and can 302 redirect the browser to the CDN directly!
          await new Promise(res => setTimeout(res, 1500)); 
          return r; 
        }).catch(() => { throw new Error('youtubei failed') }),
        resolveViaPiped(videoId).catch(() => { throw new Error('piped failed') }),
        resolveViaCobalt(videoId).catch(() => { throw new Error('cobalt failed') }),
        resolveViaInvidiousProxy(videoId).catch(() => { throw new Error('invidious proxy failed') })
      ],
      12000
    );
    return await succeed(result, result.source);
  } catch (e: any) {
    console.warn(`[Scraping] All layers failed for ${videoId} after ${Date.now() - start}ms: ${e.message}`);
    throw new Error(`[Scraping] All layers failed for ${videoId}`);
  }
}
