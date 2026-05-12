/**
 * /api/discovery/new-releases
 * ────────────────────────────
 * Returns latest songs from MusicApi, enriched with YouTube videoIds.
 */
import { NextResponse } from "next/server";
import { getLatestSongs, getAllArtists } from "@/services/music/musicApiClient";
import { enrichSongs } from "@/services/music/songEnricher";

let releasesCache: { data: any[]; ts: number } | null = null;
const RELEASES_TTL = 10 * 60 * 1000; // 10 min

export async function GET() {
  if (releasesCache && Date.now() - releasesCache.ts < RELEASES_TTL) {
    return NextResponse.json(
      { success: true, data: releasesCache.data },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  }

  try {
    const [songsRes, artistsRes] = await Promise.all([
      getLatestSongs(1, 50),
      getAllArtists(1, 200),
    ]);

    const artistsById = new Map(artistsRes.data.map((a) => [a.id, a]));
    const enriched = songsRes.data.map(song => ({
      songId: `mapi-${song.id}`,
      title: song.name,
      artist: (song.artistId != null ? artistsById.get(song.artistId)?.name : undefined) || "فنان غير معروف",
      artistId: song.artistId ? String(song.artistId) : null,
      thumbnailUrl: song.imageUrl,
      youtubeVideoId: null, // Will be resolved lazily on play
      albumId: song.albumId ? String(song.albumId) : null,
    }));

    releasesCache = { data: enriched, ts: Date.now() };

    return NextResponse.json(
      { success: true, data: enriched },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch (error: any) {
    console.error("[New Releases] MusicApi error:", error.message);

    if (releasesCache) {
      return NextResponse.json(
        { success: true, data: releasesCache.data, stale: true }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch latest songs", details: error.message },
      { status: 500 }
    );
  }
}
