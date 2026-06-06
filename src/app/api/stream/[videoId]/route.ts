/**
 * /api/stream/[videoId] — Ultra-fast stream resolver
 *
 * Returns { streamUrl } in <500ms (cache hit: <10ms)
 * Uses 4-layer scraping engine: Piped → Cobalt → Invidious → youtubei.js
 * Full songs only — Shorts (< 60s) are rejected automatically
 */
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";
import { resolveStreamUrl } from "@apis/scraping";
import { getUserFromRequest } from "@/services/auth/session";

export const maxDuration = 30; // Reduced from 60 — our engine is faster now
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ videoId: string }> };

import { checkTunnelRedirect } from "@/utils/tunnelProxy";

export async function GET(req: NextRequest, { params }: Params) {
  const redirect = await checkTunnelRedirect(req);
  if (redirect) return redirect;

  const rate = await checkRateLimit(req, { key: "stream", max: 120, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  try {
    const { videoId } = await params;

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return fail("INVALID_ID", "Invalid YouTube video ID", 400);
    }

    const resolved = await resolveStreamUrl(videoId);
    // Client is deployed on Railway, so direct URLs to googlevideo/piped are allowed
    // We return the raw URL directly so it plays instantly in the frontend without proxying.
    const streamUrl = resolved.url;

    return NextResponse.json({
      streamUrl,
      source: resolved.source,
      directPlay: true,
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
