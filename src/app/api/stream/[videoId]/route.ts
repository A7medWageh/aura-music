import { NextRequest, NextResponse } from "next/server";
import { getStreamingUrl } from "@/services/player/stream";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ videoId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const rate = await checkRateLimit(req, { key: "stream", max: 120, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);
  
  try {
    const { videoId } = await params;
    const title = req.nextUrl.searchParams.get("title") || "audio";
    
    // ALWAYS resolve + proxy through our server.
    // googlevideo.com URLs are IP-bound and will 403 if played directly in the browser.
    // Our /api/download acts as the proxy that fetches and re-streams the audio.
    const streamUrl = await getStreamingUrl(videoId);
    
    // If the URL is already one of our own endpoints, return it as-is
    if (streamUrl.startsWith("/api/")) {
      return NextResponse.json({ streamUrl });
    }

    // For all external URLs (googlevideo, cdn, etc.) — proxy through our server
    return NextResponse.json({ 
      streamUrl: `/api/download?videoId=${videoId}&title=${encodeURIComponent(title)}` 
    });
  } catch (error) {
    console.error("Streaming error:", error);
    return fail("STREAM_ERROR", error instanceof Error ? error.message : "Failed to resolve stream", 500);
  }
}
