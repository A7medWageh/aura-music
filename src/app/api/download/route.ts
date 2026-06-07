import { NextRequest, NextResponse } from "next/server";
import { resolveStreamUrl } from "@apis/scraping";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { checkTunnelRedirect } from "@/utils/tunnelProxy";

export async function GET(req: NextRequest) {
  const redirect = await checkTunnelRedirect(req);
  if (redirect) return redirect;

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  try {
    const resolved = await resolveStreamUrl(videoId);
    
    // Fetch the resolved URL to get the actual stream and headers (Content-Length)
    const res = await fetch(resolved.url, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Range": "bytes=0-", // Request the full file
      },
      signal: req.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch from upstream: ${res.status}`);
    }

    const headers = new Headers();
    // Copy content headers safely
    res.headers.forEach((value, key) => {
      if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // Make sure we expose Content-Length so the frontend can calculate exact progress
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, X-Original-Content-Length");
    
    // In case content-length is missing, provide a fallback, but usually the APIs provide it.
    if (!headers.has("content-length")) {
       headers.set("X-Original-Content-Length", (3.5 * 1024 * 1024).toString());
       headers.set("Transfer-Encoding", "chunked");
    } else {
       headers.set("X-Original-Content-Length", headers.get("content-length")!);
    }

    return new NextResponse(res.body, { headers });

  } catch (error: any) {
    console.error("[DownloadAPI] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to process audio", details: error.message },
      { status: 500 }
    );
  }
}
