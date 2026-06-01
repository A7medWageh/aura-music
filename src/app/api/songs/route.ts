/**
 * /api/songs
 * ──────────
 * Returns all songs from Neon DB, with youtube_video_id pre-populated.
 * No YouTube search needed — the DB already has all video IDs!
 */
import { NextRequest, NextResponse } from "next/server";
import { getAllSongs, getAllArtists } from "@/services/music/musicApiClient";

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
      getAllSongs(1, 500),
      getAllArtists(1, 300),
    ]);

    const artistsById = new Map(artistsRes.data.map((a) => [a.id, a]));
    const enriched = songsRes.data.map(song => ({
      songId: song.id,
      title: song.name,
      artist: (song.artistId != null ? artistsById.get(song.artistId)?.name : undefined) || "فنان غير معروف",
      artistId: song.artistId ?? null,
      thumbnailUrl: song.imageUrl,
      youtubeVideoId: song.youtubeVideoId ?? null,  // Pre-populated from DB!
      albumId: song.albumId ?? null,
      duration: song.duration,
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
