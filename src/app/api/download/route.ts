import { NextRequest, NextResponse } from "next/server";
import { resolveStream } from "@apis/youtubei.js";

// In-memory resolved URL cache
const streamUrlCache = new Map<string, { url: string; expiresAt: number }>();

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  const title = searchParams.get("title") || "song";
  // Pre-resolved URL passed from /api/stream (Piped/Invidious)
  const preResolvedSrc = searchParams.get("src");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  try {
    let streamUrl: string;

    if (preResolvedSrc) {
      // Use the pre-resolved URL directly (from Piped or Invidious)
      streamUrl = decodeURIComponent(preResolvedSrc);
      console.log(`[DownloadAPI] Using pre-resolved URL for ${videoId}`);
    } else {
      // Fall back to internal resolution (youtubei.js, ytdl-core, etc.)
      const attempt = parseInt(searchParams.get("attempt") || "0");
      const cached = streamUrlCache.get(videoId);

      if (cached && cached.expiresAt > Date.now() && attempt === 0) {
        streamUrl = cached.url;
        console.log(`[DownloadAPI] Cache hit for ${videoId}`);
      } else {
        console.log(`[DownloadAPI] Resolving stream for ${videoId}...`);
        streamUrl = await resolveStream(videoId);
        streamUrlCache.set(videoId, { url: streamUrl, expiresAt: Date.now() + 3 * 60 * 60 * 1000 });
      }
    }

    // Proxy the audio stream, forwarding Range headers for seek support
    const rangeHeader = req.headers.get("range");
    const fetchHeaders: HeadersInit = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Origin": "https://www.youtube.com",
      "Referer": "https://www.youtube.com/",
    };
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    console.log(`[DownloadAPI] Proxying audio for ${videoId}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    let res: Response;
    try {
      res = await fetch(streamUrl, {
        headers: fetchHeaders,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // If URL expired (403/410), force re-resolve and retry (only for non-pre-resolved URLs)
    if ((res.status === 403 || res.status === 410) && !preResolvedSrc) {
      console.warn(`[DownloadAPI] URL expired (${res.status}) for ${videoId} — re-resolving...`);
      streamUrlCache.delete(videoId);
      const freshUrl = await resolveStream(videoId);
      streamUrlCache.set(videoId, { url: freshUrl, expiresAt: Date.now() + 3 * 60 * 60 * 1000 });

      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), 55000);
      try {
        res = await fetch(freshUrl, {
          headers: fetchHeaders,
          signal: retryController.signal,
        });
      } finally {
        clearTimeout(retryTimeout);
      }
    }

    if (!res.ok || !res.body) {
      throw new Error(`Upstream fetch failed with status ${res.status} for ${streamUrl.substring(0, 80)}...`);
    }

    // Build response headers
    const responseHeaders: HeadersInit = {
      "Content-Type": res.headers.get("content-type") || "audio/mpeg",
      "Content-Disposition": `inline; filename="${encodeURIComponent(title)}.mp3"`,
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    };

    const contentRange = res.headers.get("content-range");
    const contentLength = res.headers.get("content-length");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    const status = rangeHeader && contentRange ? 206 : res.status === 206 ? 206 : 200;

    return new NextResponse(res.body, {
      status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[DownloadAPI] Error:", error.message);

    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Gateway Timeout", details: "Audio stream timed out" },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: "Failed to process audio", details: error.message },
      { status: 500 }
    );
  }
}
