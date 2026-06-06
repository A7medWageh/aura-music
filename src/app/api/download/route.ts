import { NextRequest, NextResponse } from "next/server";
import { resolveStreamUrl } from "@apis/scraping";

// In-memory resolved URL cache
const streamUrlCache = new Map<string, { url: string; expiresAt: number; directPlay: boolean }>();

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
    let isDirectPlay = false;

    if (preResolvedSrc) {
      // Use the pre-resolved URL directly (from Piped or Invidious)
      streamUrl = decodeURIComponent(preResolvedSrc);
      console.log(`[DownloadAPI] Using pre-resolved URL for ${videoId}`);
    } else {
      // Use the new multi-layer ultra-fast scraping engine
      const attempt = parseInt(searchParams.get("attempt") || "0");
      const cached = streamUrlCache.get(videoId);

      if (cached && cached.expiresAt > Date.now() && attempt === 0) {
        streamUrl = cached.url;
        isDirectPlay = cached.directPlay;
        console.log(`[DownloadAPI] Cache hit for ${videoId}`);
      } else {
        console.log(`[DownloadAPI] Resolving fast stream for ${videoId}...`);
        const resolved = await resolveStreamUrl(videoId);
        streamUrl = resolved.url;
        isDirectPlay = resolved.directPlay;
        streamUrlCache.set(videoId, { url: streamUrl, directPlay: isDirectPlay, expiresAt: Date.now() + 3 * 60 * 60 * 1000 });
      }
    }

    // Lightning Fast Optimization: If the URL is direct play (e.g. Cobalt, Piped), redirect the browser!
    // The browser will stream/download directly from the CDN with ZERO overhead on our server.
    if (isDirectPlay) {
      console.log(`[DownloadAPI] Redirecting directly to CDN for lightning fast playback/download!`);
      return NextResponse.redirect(streamUrl, 302);
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

    // Direct byte-stream proxying
    // This allows instant playback by piping YouTube's chunked stream directly to the browser
    const response = await fetch(streamUrl, {
      headers: fetchHeaders,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status} ${response.statusText}`);
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    
    // Vercel strips Content-Length on chunked streams, so we add our own header
    const cl = response.headers.get("content-length");
    if (cl) responseHeaders.set("X-Original-Content-Length", cl);
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, X-Original-Content-Length");
    
    // We return the raw ReadableStream from fetch directly.
    // Next.js handles piping it to the client chunk-by-chunk.
    return new NextResponse(response.body, {
      status: response.status,
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
