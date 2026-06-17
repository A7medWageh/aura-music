import { NextRequest, NextResponse } from "next/server";
import { resolveStreamUrl } from "@apis/scraping";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  try {
    const resolved = await resolveStreamUrl(videoId);

    // Fetch the resolved URL to get the actual audio stream
    const res = await fetch(resolved.url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Range": "bytes=0-",
      },
      signal: req.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch from upstream: ${res.status}`);
    }

    const headers = new Headers(noCacheHeaders);

    // Copy content headers safely
    res.headers.forEach((value, key) => {
      if (["content-type", "content-length", "content-range", "accept-ranges"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    headers.set("content-type", "audio/mpeg");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, X-Original-Content-Length");

    // Pass content-length through for download progress UI
    if (!headers.has("content-length")) {
      headers.set("X-Original-Content-Length", (3.5 * 1024 * 1024).toString());
      headers.set("Transfer-Encoding", "chunked");
    } else {
      headers.set("X-Original-Content-Length", headers.get("content-length")!);
    }

    return new NextResponse(res.body, { headers });
  } catch (error: any) {
    console.error("[ytdownload] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to process YouTube download", details: error.message },
      { status: 500, headers: noCacheHeaders }
    );
  }
}
