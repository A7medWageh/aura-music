/**
 * /api/stream/[videoId] — Ultra-fast stream resolver
 *
 * Resolves any track using Universal Audio Resolver (JioSaavn, Albumaty, SoundCloud, YouTube)
 * Supports direct play for Cloudflare CDN URLs and streaming proxy for chunked playback.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";
import { resolveStreamUrl } from "@apis/scraping";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ videoId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const rate = await checkRateLimit(req, { key: "stream", max: 120, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  try {
    const { videoId } = await params;
    const { searchParams } = new URL(req.url);
    const title = searchParams.get("title") || undefined;
    const artist = searchParams.get("artist") || undefined;

    if (!videoId) {
      return fail("INVALID_ID", "Missing video ID", 400);
    }

    const resolved = await resolveStreamUrl(videoId, title, artist);
    let streamUrl: string;
    const isDirect = resolved.directPlay && !resolved.url.includes("googlevideo.com");

    if (isDirect) {
      // JioSaavn, Albumaty, SoundCloud, Piped can be streamed directly by the browser
      streamUrl = resolved.url;
    } else {
      // Stream through proxy with HTTP 206 chunking
      streamUrl = `/api/stream-proxy?url=${encodeURIComponent(resolved.url)}`;
    }

    return NextResponse.json({
      streamUrl,
      source: resolved.source,
      directPlay: isDirect,
      durationSec: resolved.durationSec,
    });
  } catch (error) {
    console.error("[Stream] All resolvers failed:", error);
    return fail(
      "STREAM_ERROR",
      error instanceof Error ? error.message : "Failed to resolve stream",
      500
    );
  }
}
