import { NextResponse } from "next/server";
import { resolveUniversalAudio } from "@/services/music/universalAudioResolver";

// In-memory cache to avoid re-searching the same song
const resolveCache = new Map<string, { streamUrl: string; directPlay: boolean; source: string; title: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim();
  const artist = searchParams.get("artist")?.trim() ?? "";

  if (!title) {
    return NextResponse.json({ success: false, error: "Missing title" }, { status: 400 });
  }

  const cacheKey = `${title}__${artist}`.toLowerCase();

  // Return cached result instantly
  const cached = resolveCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({
      success: true,
      streamUrl: cached.streamUrl,
      directPlay: cached.directPlay,
      source: cached.source,
      title: cached.title,
      fromCache: true,
    });
  }

  try {
    const resolved = await resolveUniversalAudio({ title, artist });

    resolveCache.set(cacheKey, {
      streamUrl: resolved.streamUrl,
      directPlay: resolved.directPlay,
      source: resolved.source,
      title: resolved.title || title,
      ts: Date.now(),
    });

    return NextResponse.json({
      success: true,
      streamUrl: resolved.streamUrl,
      directPlay: resolved.directPlay,
      source: resolved.source,
      title: resolved.title || title,
      durationSec: resolved.durationSec,
    });
  } catch (error: any) {
    console.error("[Lazy Resolve] Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
