import { NextResponse } from "next/server";
import { resolveUniversalAudio } from "@/services/music/universalAudioResolver";

// In-memory cache to avoid re-searching the same song
const resolveCache = new Map<string, { streamUrl: string; directPlay: boolean; source: string; title: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  let title = searchParams.get("title")?.trim() || "";
  let artist = searchParams.get("artist")?.trim() || "";

  const genericArtists = ["فنان", "فنان غير معروف", "artist", "unknown", "various artists", "unknown artist"];
  if (genericArtists.includes(artist.toLowerCase())) {
    artist = "";
  }

  // If title has "Artist - Song", extract
  if ((!artist || genericArtists.includes(artist.toLowerCase())) && title.includes(" - ")) {
    const parts = title.split(" - ");
    if (parts.length === 2 && parts[0].trim().length > 1 && parts[1].trim().length > 1) {
      artist = parts[0].trim();
      title = parts[1].trim();
    }
  }

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
