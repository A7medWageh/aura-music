/**
 * /api/discovery/trending
 * ────────────────────────
 * Returns featured/trending songs from Neon DB.
 * Songs with high energy_score are featured. Falls back to newest songs.
 */
import { NextResponse } from "next/server";
import { getFeaturedSongs, getAllArtists } from "@/services/music/musicApiClient";

let chartCache: { data: any[]; ts: number } | null = null;
const CHART_TTL = 10 * 60 * 1000; // 10 min

export async function GET() {
  if (chartCache && Date.now() - chartCache.ts < CHART_TTL) {
    return NextResponse.json(
      { success: true, data: chartCache.data },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  }

  try {
    const [songsRes, artistsRes] = await Promise.all([
      getFeaturedSongs(1, 50),
      getAllArtists(1, 300),
    ]);

    const artistsById = new Map(artistsRes.data.map((a) => [a.id, a]));

    const enriched = songsRes.data.map(song => ({
      songId: song.id,
      title: song.name,
      artist: (song.artistId != null ? artistsById.get(song.artistId)?.name : undefined) || "فنان غير معروف",
      artistId: song.artistId ?? null,
      thumbnailUrl: song.imageUrl,
      youtubeVideoId: song.youtubeVideoId ?? null,
      albumId: song.albumId ?? null,
      duration: song.duration,
    }));

    chartCache = { data: enriched, ts: Date.now() };

    return NextResponse.json(
      { success: true, data: enriched },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch (error: any) {
    console.error("[Trending] DB error:", error.message);

    if (chartCache) {
      return NextResponse.json(
        { success: true, data: chartCache.data, stale: true },
        { headers: { "Cache-Control": "public, s-maxage=60" } }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch featured songs", details: error.message },
      { status: 500 }
    );
  }
}
