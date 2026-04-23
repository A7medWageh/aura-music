import { NextRequest, NextResponse } from "next/server";
import { resolveStream } from "@/../apis/youtubei.js";

// Cache resolved stream URLs briefly to avoid double-resolving
const streamUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  const title = searchParams.get("title") || "song";

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  try {
    // Check cache first (ignore if it's a retry/attempt)
    const attempt = parseInt(searchParams.get("attempt") || "0");
    const cached = streamUrlCache.get(videoId);
    let streamUrl: string;

    if (cached && cached.expiresAt > Date.now() && attempt === 0) {
      streamUrl = cached.url;
    } else {
      console.log(`[DownloadAPI] ${attempt > 0 ? 'Refreshing' : 'Resolving'} stream for ${videoId}...`);
      streamUrl = await resolveStream(videoId);
      // Cache for 5 minutes
      streamUrlCache.set(videoId, { url: streamUrl, expiresAt: Date.now() + 5 * 60 * 1000 });
    }

    // Proxy the request, forwarding Range headers for seek support
    const rangeHeader = req.headers.get("range");
    const fetchHeaders: HeadersInit = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    console.log(`[DownloadAPI] Fetching from YouTube: ${videoId}...`);
    
    // 5-minute timeout for the audio download stream
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    const res = await fetch(streamUrl, { 
      headers: fetchHeaders,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok || !res.body) {
      throw new Error(`YouTube stream fetch failed with status ${res.status}`);
    }

    const responseHeaders: HeadersInit = {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `inline; filename="${encodeURIComponent(title)}.mp3"`,
      "Cache-Control": "public, max-age=31536000",
      "Accept-Ranges": "bytes",
    };

    // Forward standard streaming headers
    const contentRange = res.headers.get("content-range");
    const contentLength = res.headers.get("content-length");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    if (contentLength) responseHeaders["Content-Length"] = contentLength;

    return new NextResponse(res.body, {
      status: rangeHeader ? 206 : 200,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[DownloadAPI] Error:", error.message);
    const status = error.name === "AbortError" ? 504 : 500;
    return NextResponse.json({
      error: error.name === "AbortError" ? "Gateway Timeout" : "Failed to process audio",
      details: error.message
    }, { status });
  }
}
