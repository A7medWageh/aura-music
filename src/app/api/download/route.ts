import { NextRequest, NextResponse } from "next/server";
import { resolveStream } from "@apis/youtubei.js";

// In-memory resolved URL cache
const streamUrlCache = new Map<string, { url: string; expiresAt: number }>();

export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { checkTunnelRedirect } from "@/utils/tunnelProxy";

export async function GET(req: NextRequest) {
  const redirect = await checkTunnelRedirect(req);
  if (redirect) return redirect;

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  const title = searchParams.get("title") || "song";
  const artist = searchParams.get("artist") || "";
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
        streamUrl = await resolveStream(videoId, title, artist);
        streamUrlCache.set(videoId, { url: streamUrl, expiresAt: Date.now() + 3 * 60 * 60 * 1000 });
      }
    }

    // Proxy the audio stream, forwarding Range headers for seek support
    const isGoogleVideo = streamUrl.includes("googlevideo.com");
    const rangeHeader = req.headers.get("range");
    const fetchHeaders: HeadersInit = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
    if (isGoogleVideo) {
      fetchHeaders["Origin"] = "https://www.youtube.com";
      fetchHeaders["Referer"] = "https://www.youtube.com/";
    }
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    // Instead of buffering the stream in Node.js, we redirect to the Edge Proxy
    // The Edge Proxy handles the byte streaming without memory limits or buffering
    const proxyUrl = `/api/proxy-stream?src=${encodeURIComponent(streamUrl)}`;
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    return NextResponse.redirect(new URL(proxyUrl, `${protocol}://${host}`));
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
