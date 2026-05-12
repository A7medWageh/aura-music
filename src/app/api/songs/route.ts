/**
 * /api/songs
 * ──────────
 * Proxies all songs from MusicApi, enriched with YouTube videoIds.
 * Supports ?page=&limit= for pagination.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAllSongs, getAllArtists } from "@/services/music/musicApiClient";
import { enrichSongs } from "@/services/music/songEnricher";

let songsCache: { data: any[]; ts: number } | null = null;
const SONGS_TTL = 15 * 60 * 1000; // 15 min

export async function GET(req: NextRequest) {
  if (songsCache && Date.now() - songsCache.ts < SONGS_TTL) {
    return NextResponse.json(
      { success: true, data: songsCache.data },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
    );
  }

  try {
    const [songsRes, artistsRes] = await Promise.all([
      getAllSongs(1, 200),
      getAllArtists(1, 200),
    ]);

    const artistsById = new Map(artistsRes.data.map((a) => [a.id, a]));
    const enriched = songsRes.data.map(song => ({
      songId: `mapi-${song.id}`,
      title: song.name,
      artist: artistsById.get(song.artistId)?.name || "فنان غير معروف",
      artistId: song.artistId ? String(song.artistId) : null,
      thumbnailUrl: song.imageUrl,
      youtubeVideoId: null, // Will be resolved lazily on play
      albumId: song.albumId ? String(song.albumId) : null,
    }));

    songsCache = { data: enriched, ts: Date.now() };

    return NextResponse.json(
      { success: true, data: enriched },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
    );
  } catch (error: any) {
    console.error("[Songs API] error:", error.message);

    if (songsCache) {
      return NextResponse.json({ success: true, data: songsCache.data, stale: true });
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch songs", details: error.message },
      { status: 500 }
    );
  }
}
