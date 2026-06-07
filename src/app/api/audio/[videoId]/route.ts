/**
 * /api/audio/[videoId] — Smart stream endpoint
 *
 * First tries a direct redirect to the googlevideo URL.
 * If the IP isn't locked (which is often the case), the browser plays directly.
 * This is the fastest possible approach — no proxying overhead.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveStreamUrl } from "@apis/scraping";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ videoId: string }> };

// In-process URL cache — shared across requests
const urlCache = new Map<string, { url: string; expiresAt: number }>();

async function getCachedUrl(videoId: string): Promise<string> {
  const hit = urlCache.get(videoId);
  if (hit && hit.expiresAt > Date.now()) return hit.url;

  const resolved = await resolveStreamUrl(videoId);
  // Cache 20 min
  urlCache.set(videoId, { url: resolved.url, expiresAt: Date.now() + 20 * 60 * 1000 });
  return resolved.url;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { videoId } = await params;

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return new NextResponse("Invalid video ID", { status: 400 });
    }

    const streamUrl = await getCachedUrl(videoId);

    // Redirect the browser directly to the googlevideo URL.
    // googlevideo URLs are not strictly IP-locked — they use signature-based auth.
    // The browser can fetch them directly, which is faster and avoids proxy timeout issues.
    console.log(`[Audio] Redirecting ${videoId} to googlevideo URL`);
    return NextResponse.redirect(streamUrl, { status: 302 });

  } catch (err: any) {
    console.error("[Audio] Error resolving stream:", err.message);
    return new NextResponse("Failed to resolve stream: " + err.message, { status: 500 });
  }
}
