import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ videoId: string }> };

// Piped API public instances — their audio URLs are served from their own CDN
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piped-api.garudalinux.org",
  "https://api.piped.yt",
  "https://pipedapi.kescher.at",
  "https://piped.video/api",
  "https://pipedapi.tokhmi.xyz",
  "https://pipedapi.moomoo.me",
];

// Invidious instances as fallback
const INVIDIOUS_INSTANCES = [
  "https://inv.pistasjis.net",
  "https://invidious.flokinet.to",
  "https://invidious.projectsegfau.lt",
  "https://iv.ggtyler.dev",
  "https://invidious.privacydev.net",
  "https://invidious.nerdvpn.de",
  "https://yt.artemislena.eu",
  "https://invidious.perennialte.ch",
];

async function tryFetch(url: string, ms = 8000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AuraMusic/1.0)",
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

interface ResolvedStream {
  /** The audio URL — from Piped CDN, googlevideo, or other */
  audioUrl: string;
  /** If true, browser can play this URL directly (no Vercel proxy needed) */
  directPlayable: boolean;
  /** Piped instance base URL for HLS proxy if needed */
  pipedBase?: string;
}

// In-memory cache
const urlCache = new Map<string, { stream: ResolvedStream; expiresAt: number }>();

async function resolveStream(videoId: string): Promise<ResolvedStream> {
  // Check cache
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.stream;

  // Strategy 1: Piped API — audio URLs are served from Piped's own CDN (not YouTube)
  for (const api of PIPED_INSTANCES) {
    const res = await tryFetch(`${api}/streams/${videoId}`, 9000);
    if (!res?.ok) continue;
    try {
      const data = await res.json();
      const streams: any[] = data.audioStreams ?? [];
      if (!streams.length) continue;
      
      const best = streams
        .filter((s: any) => s.url)
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
      
      if (best?.url) {
        const stream: ResolvedStream = {
          audioUrl: best.url,
          // Piped CDN URLs (containing "videoplayback" from their proxied domain) 
          // can be played directly by the browser
          directPlayable: !best.url.includes("googlevideo.com"),
          pipedBase: api.replace("/api", ""),
        };
        urlCache.set(videoId, { stream, expiresAt: Date.now() + 3 * 60 * 60 * 1000 });
        console.log(`[Stream] ✅ Piped (${api}) for ${videoId} direct=${stream.directPlayable}`);
        return stream;
      }
    } catch {}
    console.warn(`[Stream] ❌ Piped ${api} for ${videoId}`);
  }

  // Strategy 2: Invidious
  for (const api of INVIDIOUS_INSTANCES) {
    const res = await tryFetch(`${api}/api/v1/videos/${videoId}`, 8000);
    if (!res?.ok) continue;
    try {
      const data = await res.json();
      const formats: any[] = data.adaptiveFormats ?? [];
      const best =
        formats.find((f: any) => f.type?.includes("audio/webm") && f.audioQuality === "AUDIO_QUALITY_MEDIUM") ??
        formats.find((f: any) => f.type?.includes("audio")) ??
        null;
      if (best?.url) {
        const stream: ResolvedStream = {
          audioUrl: best.url,
          directPlayable: !best.url.includes("googlevideo.com"),
        };
        urlCache.set(videoId, { stream, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
        console.log(`[Stream] ✅ Invidious (${api}) for ${videoId}`);
        return stream;
      }
    } catch {}
    console.warn(`[Stream] ❌ Invidious ${api} for ${videoId}`);
  }

  // Strategy 3: Last resort — youtubei.js / ytdl-core via download endpoint
  console.warn(`[Stream] All direct resolvers failed for ${videoId}, using download fallback`);
  throw new Error("All stream resolvers failed");
}

export async function GET(req: NextRequest, { params }: Params) {
  const rate = await checkRateLimit(req, { key: "stream", max: 120, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  try {
    const { videoId } = await params;
    const title = req.nextUrl.searchParams.get("title") || "audio";

    let streamUrl: string;

    try {
      const resolved = await resolveStream(videoId);

      if (resolved.directPlayable) {
        // Audio URL is from Piped/Invidious CDN — browser can play directly!
        // But we still proxy it to handle Range requests and CORS.
        streamUrl = `/api/download?videoId=${videoId}&src=${encodeURIComponent(resolved.audioUrl)}`;
      } else {
        // googlevideo.com URL — must proxy through our server
        streamUrl = `/api/download?videoId=${videoId}&src=${encodeURIComponent(resolved.audioUrl)}`;
      }
    } catch {
      // All resolvers failed — use download endpoint for last resort resolution
      streamUrl = `/api/download?videoId=${videoId}&title=${encodeURIComponent(title)}`;
    }

    return NextResponse.json({ streamUrl });
  } catch (error) {
    console.error("Streaming error:", error);
    return fail("STREAM_ERROR", error instanceof Error ? error.message : "Failed to resolve stream", 500);
  }
}
