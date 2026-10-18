import { NextRequest, NextResponse } from "next/server";
import { streamAudioFromYouTube, isYtDlpAvailable } from "@apis/yt-dlp";
import { GET as ytdownloadHandler } from "../ytdownload/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");
  const isDownload = searchParams.get("download") === "true";
  const title = searchParams.get("title") || "song";
  const artist = searchParams.get("artist") || undefined;
  const videoId = searchParams.get("videoId") || undefined;

  if (!targetUrl && !videoId) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    const url = targetUrl ? decodeURIComponent(targetUrl) : "";
    const rangeHeader = req.headers.get("Range");

    // 1. If target is a YouTube watch URL or videoId is provided, delegate to ytdownloadHandler!
    const ytMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    const targetVid = (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) ? videoId : (ytMatch ? ytMatch[1] : undefined);

    if (targetVid && (url.includes("youtube.com") || url.includes("youtu.be") || !url || url.includes("googlevideo.com"))) {
      const ytdownloadUrl = new URL(req.url);
      ytdownloadUrl.pathname = "/api/ytdownload";
      ytdownloadUrl.searchParams.set("videoId", targetVid);
      ytdownloadUrl.searchParams.set("title", title);
      if (artist) ytdownloadUrl.searchParams.set("artist", artist);
      if (isDownload) {
        ytdownloadUrl.searchParams.set("download", "true");
        ytdownloadUrl.searchParams.set("attachment", "true");
      } else {
        ytdownloadUrl.searchParams.set("proxy", "true");
      }
      const modReq = new NextRequest(ytdownloadUrl.toString(), {
        headers: req.headers,
        signal: req.signal,
      });
      return ytdownloadHandler(modReq);
    }

    const requestHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    if (url.includes("albumaty.com")) {
      requestHeaders["Referer"] = "https://www.albumaty.com/";
    } else if (url.includes("youtube.com") || url.includes("googlevideo.com")) {
      requestHeaders["Referer"] = "https://www.youtube.com/";
      requestHeaders["Origin"] = "https://www.youtube.com";
    }

    // Forward Range header for chunked streaming, unless doing a full offline download
    if (rangeHeader && !isDownload) {
      requestHeaders["Range"] = rangeHeader;
    }

    let res = await fetch(url, {
      cache: "no-store",
      headers: requestHeaders,
      signal: req.signal,
    });

    if (!res.ok && videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) && isYtDlpAvailable()) {
      console.warn(`[StreamProxy] Upstream returned ${res.status}, falling back to yt-dlp for ${videoId}...`);
      const { stream, mimeType } = streamAudioFromYouTube(videoId);
      const safeFilename = encodeURIComponent(title.replace(/[\/\\?%*:|"<>]/g, "_")) + ".mp3";
      const headers = new Headers();
      headers.set("Content-Type", mimeType || "audio/mp4");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition");
      headers.set("Accept-Ranges", "bytes");
      if (isDownload) {
        headers.set("Content-Disposition", `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
      } else {
        headers.set("Content-Disposition", "inline");
      }
      return new NextResponse(stream as any, { status: 200, headers });
    }

    const responseHeaders = new Headers();

    // Copy essential streaming and caching headers
    res.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (["content-type", "content-length", "content-range", "accept-ranges"].includes(lower)) {
        responseHeaders.set(key, value);
      }
    });

    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition");
    responseHeaders.set("Accept-Ranges", "bytes");

    // Ensure audio mime type
    const currentType = responseHeaders.get("content-type") || "";
    if (!currentType.includes("audio") && !currentType.includes("video")) {
      const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
      if (ext === "mp3") responseHeaders.set("content-type", "audio/mpeg");
      else if (ext === "m4a" || ext === "mp4") responseHeaders.set("content-type", "audio/mp4");
      else responseHeaders.set("content-type", "audio/mpeg");
    }

    // Set download headers when requested
    if (isDownload) {
      const safeFilename = encodeURIComponent(title.replace(/[\/\\?%*:|"<>]/g, "_")) + ".mp3";
      responseHeaders.set("Content-Disposition", `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    }

    return new NextResponse(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    if (error.name === "AbortError" || req.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    console.error("[StreamProxy] Error:", error.message);
    return new NextResponse("Failed to proxy stream", { status: 500 });
  }
}
