import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const backendUrl = process.env.MUSIC_API_BASE_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "Backend API URL not configured" }, { status: 500 });
  }

  // Generate the target URL in the .NET backend
  const targetUrl = `${backendUrl}/api/ytdownload?videoId=${encodeURIComponent(videoId)}`;

  try {
    const res = await fetch(targetUrl, {
      // Don't buffer the whole response
      cache: "no-store"
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend API returned ${res.status}: ${res.statusText}` },
        { status: res.status }
      );
    }

    // Proxy the stream back to the client
    const headers = new Headers();
    res.headers.forEach((value, key) => {
      headers.set(key, value);
    });

    return new NextResponse(res.body, {
      status: res.status,
      headers
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to connect to backend API", details: error.message },
      { status: 502 }
    );
  }
}
