import { NextRequest, NextResponse } from "next/server";
import { getTelegramDirectUrl } from "@/services/telegram/telegramStorage";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId") || searchParams.get("id");
  const isDownload = searchParams.get("download") === "true";
  const title = searchParams.get("title") || "song";

  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId parameter" }, { status: 400 });
  }

  try {
    const directTelegramUrl = await getTelegramDirectUrl(fileId);
    if (!directTelegramUrl) {
      return NextResponse.json({ error: "Failed to resolve Telegram file path" }, { status: 404 });
    }

    const upstreamHeaders: Record<string, string> = {
      "User-Agent": "AuraMusic/1.0",
    };

    const clientRange = req.headers.get("Range");
    if (clientRange && !isDownload) {
      upstreamHeaders["Range"] = clientRange;
    }

    const upstreamRes = await fetch(directTelegramUrl, {
      headers: upstreamHeaders,
      signal: req.signal,
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return NextResponse.json(
        { error: `Telegram CDN returned ${upstreamRes.status}` },
        { status: upstreamRes.status }
      );
    }

    const safeFilename = encodeURIComponent(title.replace(/[\/\\?%*:|"<>]/g, "_")) + ".mp3";
    const responseHeaders = new Headers(NO_CACHE_HEADERS);

    upstreamRes.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (["content-type", "content-length", "content-range", "accept-ranges"].includes(lower)) {
        responseHeaders.set(key, val);
      }
    });

    responseHeaders.set("Content-Type", "audio/mpeg");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length"
    );

    if (isDownload) {
      responseHeaders.set(
        "Content-Disposition",
        `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
      );
    } else {
      responseHeaders.set("Content-Disposition", "inline");
    }

    const cLen = responseHeaders.get("content-length");
    if (cLen) {
      responseHeaders.set("X-Original-Content-Length", cLen);
    }

    // iOS / Safari Range: bytes=0-1 probe safeguard
    if (clientRange === "bytes=0-1" && upstreamRes.status === 200 && upstreamRes.body) {
      try {
        const reader = upstreamRes.body.getReader();
        const { value } = await reader.read();
        reader.cancel().catch(() => {});
        if (value && value.length >= 2) {
          const probeSlice = value.slice(0, 2);
          responseHeaders.set("Content-Range", `bytes 0-1/${cLen || value.length}`);
          responseHeaders.set("Content-Length", "2");
          return new NextResponse(probeSlice, {
            status: 206,
            headers: responseHeaders,
          });
        }
      } catch {}
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    if (error.name === "AbortError" || req.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    console.error("[TelegramStream] Error:", error.message);
    return NextResponse.json({ error: "Failed to stream Telegram audio" }, { status: 500 });
  }
}
