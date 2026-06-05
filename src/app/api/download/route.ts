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

    // Proxy the audio stream via Edge Proxy to bypass Vercel 10s limits!
    console.log(`[DownloadAPI] Delegating proxying for ${videoId} to Edge Proxy...`);
    const edgeProxyUrl = `/api/proxy?src=${encodeURIComponent(streamUrl)}`;
    
    return NextResponse.redirect(new URL(edgeProxyUrl, req.url));
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
