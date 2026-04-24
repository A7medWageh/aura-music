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
    const streamUrl = await getStreamingUrl(videoId);
    
    // If the URL is bound to Vercel's IP (googlevideo), we must proxy it 
    // through our own server to avoid 403 Forbidden on the client.
    if (streamUrl.includes("googlevideo.com")) {
      return NextResponse.json({ streamUrl: `/api/download?videoId=${videoId}&title=audio` });
    }

    return NextResponse.json({ streamUrl });
  } catch (error) {
    console.error("Streaming error:", error);
    return fail("STREAM_ERROR", error instanceof Error ? error.message : "Failed to resolve stream", 500);
  }
}
