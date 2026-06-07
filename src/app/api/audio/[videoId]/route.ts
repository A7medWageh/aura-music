/**
 * /api/audio/[videoId] — Direct audio pipe endpoint
 *
 * The audio element src is set to this endpoint directly.
 * This endpoint:
 * 1. Resolves the googlevideo stream URL via youtubei.js (Railway IP)
 * 2. Fetches it with a plain fetch (also from Railway IP = same IP = no 403)
 * 3. Pipes the bytes directly to the browser
 * 4. Handles Range requests for seeking support
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveStreamUrl } from "@apis/scraping";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ videoId: string }> };

// In-process URL cache — avoids re-resolving on every range request
const urlCache = new Map<string, { url: string; expiresAt: number }>();

async function getCachedUrl(videoId: string): Promise<string> {
  const hit = urlCache.get(videoId);
  if (hit && hit.expiresAt > Date.now()) return hit.url;

  const resolved = await resolveStreamUrl(videoId);
  // Cache for 20 min (googlevideo URLs expire in ~30 min)
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
    let streamUrl = await getCachedUrl(videoId);

    const makeUpstreamReq = (url: string) =>
      fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.youtube.com/",
          "Origin":  "https://www.youtube.com",
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        },
      });

    let upstream = await makeUpstreamReq(streamUrl);

    // If we get 403/404, the URL likely expired — resolve fresh and retry once
    if (upstream.status === 403 || upstream.status === 404 || upstream.status === 410) {
      console.warn(`[Audio] ${videoId} got ${upstream.status}, resolving fresh URL...`);
      urlCache.delete(videoId);
      streamUrl = await getCachedUrl(videoId);
      upstream = await makeUpstreamReq(streamUrl);
    }

    // Build response headers
    const resHeaders = new Headers();
    const allow = ["content-type", "content-length", "content-range", "accept-ranges"];
    upstream.headers.forEach((v, k) => {
      if (allow.includes(k.toLowerCase())) resHeaders.set(k, v);
    });
    if (!resHeaders.has("accept-ranges")) resHeaders.set("accept-ranges", "bytes");
    resHeaders.set("cache-control", "no-store");
    resHeaders.set("Access-Control-Allow-Origin", "*");

    console.log(
      `[Audio] ${videoId} → ${upstream.status}${rangeHeader ? " (range)" : ""}`
    );

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (err: any) {
    console.error("[Audio] Error:", err.message);
    return new NextResponse("Failed to stream audio: " + err.message, { status: 500 });
  }
}
