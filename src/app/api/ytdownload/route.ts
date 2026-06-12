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

  // Return a 307 Temporary Redirect so the browser fetches directly from the .NET API
  return NextResponse.redirect(targetUrl, 307);
}
