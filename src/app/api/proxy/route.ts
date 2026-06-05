import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge"; // Edge runtime bypasses Vercel 10s & 4.5MB payload limits!

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get("src");
  
  if (!src) {
    return new NextResponse("Missing src", { status: 400 });
  }

  const streamUrl = decodeURIComponent(src);

  try {
    const fetchHeaders: HeadersInit = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    if (streamUrl.includes("googlevideo.com")) {
      fetchHeaders["Origin"] = "https://www.youtube.com";
      fetchHeaders["Referer"] = "https://www.youtube.com/";
    }

    const res = await fetch(streamUrl, { headers: fetchHeaders });

    if (!res.ok || !res.body) {
       console.error(`[EdgeProxy] Upstream failed: ${res.status}`);
       return new NextResponse("Upstream fetch failed", { status: res.status });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", res.headers.get("content-type") || "audio/mpeg");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "public, max-age=3600");

    const contentRange = res.headers.get("content-range");
    const contentLength = res.headers.get("content-length");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    const status = (rangeHeader && contentRange) || res.status === 206 ? 206 : 200;

    return new NextResponse(res.body, {
      status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[EdgeProxy] Error:", error.message);
    return new NextResponse("Proxy Error", { status: 500 });
  }
}
