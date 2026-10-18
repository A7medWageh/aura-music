import { NextRequest, NextResponse } from "next/server";
import { resolveUniversalAudio } from "@/services/music/universalAudioResolver";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId") || undefined;
  const title = searchParams.get("title") || undefined;
  const artist = searchParams.get("artist") || undefined;

  if (!videoId && !title) {
    return NextResponse.json({ error: "Missing videoId or title" }, { status: 400 });
  }

  try {
    const resolved = await resolveUniversalAudio({ videoId, title, artist, forDownload: true });
    
    // If resolved source is YouTube, stream directly via yt-dlp
    if (resolved.source === "youtube" || resolved.streamUrl.includes("googlevideo.com")) {
      const targetVideoId = videoId || resolved.videoId;
      if (targetVideoId) {
        const { streamAudioFromYouTube } = await import("@apis/yt-dlp");
        const { stream, mimeType } = streamAudioFromYouTube(targetVideoId);
        const headers = new Headers();
        headers.set("Content-Type", mimeType || "audio/mp4");
        headers.set("Access-Control-Allow-Origin", "*");
        const trackName = title || resolved.title || "song";
        const safeFilename = encodeURIComponent(trackName.replace(/[\/\\?%*:|"<>]/g, "_")) + ".mp3";
        headers.set("Content-Disposition", `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
        return new NextResponse(stream as any, { status: 200, headers });
      }
    }

    // Fetch the resolved URL to get the complete audio stream
    const res = await fetch(resolved.streamUrl, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      signal: req.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch from upstream: ${res.status}`);
    }

    const headers = new Headers();
    // Copy content headers safely
    res.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(lower)) {
        headers.set(key, value);
      }
    });

    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
    headers.set("Accept-Ranges", "bytes");

    // Ensure audio mime type
    const currentType = headers.get("content-type") || "";
    if (!currentType.includes("audio") && !currentType.includes("video")) {
      headers.set("content-type", "audio/mpeg");
    }

    const trackName = title || resolved.title || "song";
    const safeFilename = encodeURIComponent(trackName.replace(/[\/\\?%*:|"<>]/g, "_")) + ".mp3";
    headers.set("Content-Disposition", `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    
    const cl = headers.get("content-length");
    if (!cl) {
       headers.set("X-Original-Content-Length", (3.5 * 1024 * 1024).toString());
       headers.set("Transfer-Encoding", "chunked");
    } else {
       headers.set("X-Original-Content-Length", cl);
    }

    return new NextResponse(res.body, { headers, status: res.status });

  } catch (error: any) {
    if (error.name === "AbortError" || req.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    console.error("[DownloadAPI] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to process audio", details: error.message },
      { status: 500 }
    );
  }
}
