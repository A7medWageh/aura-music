import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const src = searchParams.get("src");

  if (!src) return new NextResponse("Missing src", { status: 400 });

  const streamUrl = decodeURIComponent(src);

  // Forward range headers
  const rangeHeader = req.headers.get("range");
  const headers = new Headers();
  headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
  if (rangeHeader) headers.set("Range", rangeHeader);

  try {
    const res = await fetch(streamUrl, { headers });
    
    if (!res.ok) {
      return new NextResponse(`Upstream Error: ${res.status}`, { status: res.status });
    }

    const responseHeaders = new Headers(res.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    
    return new NextResponse(res.body, {
      status: res.status,
      headers: responseHeaders
    });
  } catch (error: any) {
    return new NextResponse(`Proxy Error: ${error.message}`, { status: 500 });
  }
}
