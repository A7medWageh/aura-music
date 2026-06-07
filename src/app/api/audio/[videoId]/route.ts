/**
 * /api/audio/[videoId] — Direct audio pipe endpoint
 *
 * Unlike /api/stream which returns a JSON url, this endpoint:
 * 1. Resolves the youtube stream URL server-side
 * 2. Fetches the audio bytes using the same youtubei.js session (matching IP + PO-Token)
 * 3. Pipes the bytes directly to the browser — no IP mismatch, no URL expiry issues
 *
 * The HTML audio element src is set to this endpoint directly.
 * Range requests (for seeking) are also handled here.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveStreamUrl } from "@apis/scraping";
import { getYTWeb } from "../../../../../apis/youtubei.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ videoId: string }> };

// In-memory cache for resolved URLs (per server process, ~30 min TTL)
const urlCache = new Map<string, { url: string; expiresAt: number }>();

async function getCachedStreamUrl(videoId: string): Promise<string> {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const resolved = await resolveStreamUrl(videoId);
  urlCache.set(videoId, { url: resolved.url, expiresAt: Date.now() + 20 * 60 * 1000 });
  return resolved.url;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { videoId } = await params;

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return new NextResponse("Invalid video ID", { status: 400 });
    }

    const rangeHeader = req.headers.get("range");

    // Resolve the googlevideo URL (cached)
    const streamUrl = await getCachedStreamUrl(videoId);

    // Build upstream request headers
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://www.youtube.com/",
      "Origin": "https://www.youtube.com",
    };
    if (rangeHeader) upstreamHeaders["Range"] = rangeHeader;

    let upstreamRes: Response;
    if (streamUrl.includes("googlevideo.com")) {
      // Use the youtubei.js session to carry the correct PO-Token and cookies
      const innertube = await getYTWeb();
      upstreamRes = await innertube.session.http.fetch(streamUrl, {
        headers: upstreamHeaders,
      });
    } else {
      upstreamRes = await fetch(streamUrl, {
        cache: "no-store",
        headers: upstreamHeaders,
      });
    }

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      // If expired, clear cache and retry once
      urlCache.delete(videoId);
      const freshUrl = await getCachedStreamUrl(videoId);
      if (freshUrl.includes("googlevideo.com")) {
        const innertube = await getYTWeb();
        upstreamRes = await innertube.session.http.fetch(freshUrl, { headers: upstreamHeaders });
      } else {
        upstreamRes = await fetch(freshUrl, { cache: "no-store", headers: upstreamHeaders });
      }
    }

    // Forward safe headers
    const responseHeaders = new Headers();
    const allowed = ["content-type", "content-length", "content-range", "accept-ranges"];
    upstreamRes.headers.forEach((value, key) => {
      if (allowed.includes(key.toLowerCase())) responseHeaders.set(key, value);
    });

    // Ensure the browser knows we support seeking
    if (!responseHeaders.has("accept-ranges")) {
      responseHeaders.set("accept-ranges", "bytes");
    }
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    console.log(`[Audio] ${videoId} → ${upstreamRes.status} (range: ${rangeHeader ?? "none"})`);

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error("[Audio] Error:", err.message);
    return new NextResponse("Failed to stream audio", { status: 500 });
  }
}
