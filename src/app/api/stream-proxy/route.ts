import { NextRequest, NextResponse } from "next/server";
import { getYTWeb } from "../../../../apis/youtubei.js";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    const url = decodeURIComponent(targetUrl);
    
    let res: Response;
    if (url.includes("googlevideo.com")) {
      // Use youtubei.js's native session fetcher to ensure PO-Token cookies/headers match
      const innertube = await getYTWeb();
      res = await innertube.session.http.fetch(url, {
        headers: {
          "Range": req.headers.get("Range") || "bytes=0-",
        }
      });
    } else {
      res = await fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Range": req.headers.get("Range") || "bytes=0-",
          "Referer": "https://www.youtube.com/",
          "Origin": "https://www.youtube.com",
        },
      });
    }

    const headers = new Headers();
    // Copy all safe headers
    res.headers.forEach((value, key) => {
      if (['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });
    
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

    console.log(`[StreamProxy] Fetched URL. Status: ${res.status}. Range req: ${req.headers.get("Range")}`);

    return new NextResponse(res.body, {
      status: res.status,
      headers,
    });
  } catch (error: any) {
    console.error("[StreamProxy] Error:", error.message);
    return new NextResponse("Failed to proxy stream", { status: 500 });
  }
}
