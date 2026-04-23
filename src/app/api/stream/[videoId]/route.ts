import { NextRequest, NextResponse } from "next/server";
import { getStreamingUrl } from "@/services/player/stream";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";

type Params = { params: Promise<{ videoId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const rate = await checkRateLimit(req, { key: "stream", max: 120, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);
  
  try {
    const { videoId } = await params;
    const streamUrl = await getStreamingUrl(videoId);
    return NextResponse.json({ streamUrl });
  } catch (error) {
    console.error("Streaming error:", error);
    return fail("STREAM_ERROR", error instanceof Error ? error.message : "Failed to resolve stream", 500);
  }
}
