/**
 * /api/discovery/trending
 * ────────────────────────
 * Returns featured songs from MusicApi, enriched with YouTube videoIds.
 * Cache: 10 min in-process + HTTP cache headers.
 */
import { NextResponse } from "next/server";
import { getFeaturedSongs, getAllArtists } from "@/services/music/musicApiClient";
import { enrichSongs } from "@/services/music/songEnricher";

// In-process cache
let chartCache: { data: any[]; ts: number } | null = null;
const CHART_TTL = 10 * 60 * 1000; // 10 min

export async function GET() {
  // Return cached data instantly
  if (chartCache && Date.now() - chartCache.ts < CHART_TTL) {
    return NextResponse.json(
      { success: true, data: chartCache.data },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  }

  try {
    // Fetch featured songs + artists in parallel (rocket speed 🚀)
    const [songsRes, artistsRes] = await Promise.all([
      getFeaturedSongs(1, 50),
      getAllArtists(1, 200),
    ]);

    // Build artist lookup map
    const artistsById = new Map(artistsRes.data.map((a) => [a.id, a]));

    // Format to match UI expectations
    const enriched = songsRes.data.map(song => ({
      songId: `mapi-${song.id}`,
      title: song.name,
      artist: artistsById.get(song.artistId)?.name || "فنان غير معروف",
      artistId: song.artistId ? String(song.artistId) : null,
      thumbnailUrl: song.imageUrl,
      youtubeVideoId: null, // Will be resolved lazily on play
      albumId: song.albumId ? String(song.albumId) : null,
    }));

    chartCache = { data: enriched, ts: Date.now() };

    return NextResponse.json(
      { success: true, data: enriched },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch (error: any) {
    console.error("[Trending] MusicApi error:", error.message);

    // Return stale cache if available
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
