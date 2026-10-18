import { NextRequest, NextResponse } from "next/server";
import { resolveUniversalAudio } from "@/services/music/universalAudioResolver";
import { streamAudioFromYouTube } from "@apis/yt-dlp";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

async function getFallbackVideoId(videoId?: string, title?: string, artist?: string): Promise<string | null> {
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) return videoId;
  const q = `${artist || ""} ${title || ""}`.trim();
  if (!q) return null;
  try {
    const { searchYouTube } = await import("@apis/youtubei.js");
    const res = await searchYouTube(q);
    const first = res.songs?.[0];
    if (first?.youtubeVideoId && /^[a-zA-Z0-9_-]{11}$/.test(first.youtubeVideoId)) {
      return first.youtubeVideoId;
    }
  } catch {}
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId") || undefined;
  const title = searchParams.get("title") || undefined;
  const artist = searchParams.get("artist") || undefined;
  const useProxy = searchParams.get("proxy") === "true";
  const resolveOnly = searchParams.get("resolveOnly") === "true";
  const isDownload = searchParams.get("download") === "true";

  if (!videoId && !title) {
    return NextResponse.json({ error: "Missing videoId or title" }, { status: 400 });
  }

  try {
    const resolved = await resolveUniversalAudio({ videoId, title, artist, forDownload: isDownload });

    // Mode 1: Resolve only (for online player)
    if (resolveOnly) {
      return NextResponse.json(
        {
          url: resolved.streamUrl,
          directPlay: resolved.directPlay,
          source: resolved.source,
          durationSec: resolved.durationSec,
        },
        {
          headers: {
            ...NO_CACHE_HEADERS,
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const isAttachment = req.nextUrl.searchParams.get("attachment") === "true";
    const trackName = title || resolved.title || "song";
    const safeFilename = encodeURIComponent(trackName.replace(/[\/\\?%*:|"<>]/g, "_")) + ".mp3";

    // Mode 2: If resolved source is YouTube or raw googlevideo URL, stream directly via yt-dlp (bypasses 403 Forbidden)
    const isGoogleVideo = resolved.streamUrl.includes("googlevideo.com") || resolved.source === "youtube";
    if (isGoogleVideo) {
      const targetVideoId = await getFallbackVideoId(videoId || resolved.videoId, title, artist);
      if (targetVideoId) {
        console.log(`[ytdownload] Direct yt-dlp audio stream for videoId=${targetVideoId}`);
        const { stream, mimeType } = streamAudioFromYouTube(targetVideoId);

        const responseHeaders = new Headers(NO_CACHE_HEADERS);
        responseHeaders.set("Content-Type", mimeType || "audio/mp4");
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
        responseHeaders.set("Accept-Ranges", "bytes");
        responseHeaders.set("Content-Disposition", isAttachment ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}` : "inline");

        return new NextResponse(stream as any, {
          status: 200,
          headers: responseHeaders,
        });
      }
    }

    // Mode 3: Direct CDN fetch (Albumaty, JioSaavn, SoundCloud)
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    if (resolved.source === "albumaty") {
      upstreamHeaders["Referer"] = "https://www.albumaty.com/";
    }

    const clientRange = req.headers.get("Range");
    if (clientRange && !useProxy) {
      upstreamHeaders["Range"] = clientRange;
    }

    let upstreamRes = await fetch(resolved.streamUrl, {
      cache: "no-store",
      headers: upstreamHeaders,
      signal: req.signal,
    });

    // If upstream returns 403 or fails, fallback to yt-dlp directly
    if (!upstreamRes.ok || upstreamRes.status === 403) {
      console.warn(`[ytdownload] Upstream returned HTTP ${upstreamRes.status} for ${resolved.streamUrl}, falling back to yt-dlp...`);
      const targetVideoId = await getFallbackVideoId(videoId || resolved.videoId, title, artist);
      if (targetVideoId) {
        const { stream, mimeType } = streamAudioFromYouTube(targetVideoId);
        const fallbackHeaders = new Headers(NO_CACHE_HEADERS);
        fallbackHeaders.set("Content-Type", mimeType || "audio/mp4");
        fallbackHeaders.set("Access-Control-Allow-Origin", "*");
        fallbackHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
        fallbackHeaders.set("Accept-Ranges", "bytes");
        fallbackHeaders.set("Content-Disposition", isAttachment ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}` : "inline");
        return new NextResponse(stream as any, { status: 200, headers: fallbackHeaders });
      }
    }

    const responseHeaders = new Headers();
    upstreamRes.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (["content-type", "content-length", "content-range", "accept-ranges"].includes(lower)) {
        responseHeaders.set(key, val);
      }
    });

    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
    responseHeaders.set("Accept-Ranges", "bytes");

    if (isAttachment) {
      responseHeaders.set("Content-Disposition", `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    } else {
      responseHeaders.set("Content-Disposition", "inline");
    }

    if (!responseHeaders.get("content-type") || responseHeaders.get("content-type") === "application/octet-stream") {
      responseHeaders.set("content-type", "audio/mpeg");
    }

    const cLen = responseHeaders.get("content-length");
    if (cLen) {
      responseHeaders.set("X-Original-Content-Length", cLen);
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    if (error.name === "AbortError" || req.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    console.error("[ytdownload] Fatal Error:", error.message);
    return NextResponse.json(
      { error: "Audio extraction failed", details: error.message },
      { status: 500 }
    );
  }
}
