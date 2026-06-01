/**
 * /api/artist/[id]
 * ─────────────────
 * Returns artist details + their songs from Neon DB.
 * ID is a UUID string from the artists table.
 * Songs already have youtube_video_id — no YouTube search needed.
 */
import { NextRequest, NextResponse } from "next/server";
import { getArtistById, getSongsByArtist } from "@/services/music/musicApiClient";

const cache = new Map<string, { data: any; at: number }>();
const TTL = 30 * 60 * 1000; // 30 min

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Cache hit
  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, s-maxage=1800" },
    });
  }

  try {
    // Fetch artist + their songs in parallel
    const [artist, songs] = await Promise.all([
      getArtistById(id),
      getSongsByArtist(id),
    ]);

    const enrichedSongs = songs.map(song => ({
      songId: song.id,
      title: song.name,
      artist: artist.name,
      artistId: song.artistId ?? null,
      thumbnailUrl: song.imageUrl ?? artist.imageUrl ?? null,
      youtubeVideoId: song.youtubeVideoId ?? null,
      albumId: song.albumId ?? null,
      duration: song.duration,
      source: "db" as const,
    }));

    const data = {
      artistId: id,
      artistName: artist.name,
      artistImage: artist.imageUrl ?? null,
      subscribers: "",
      isVerified: false,
      songs: enrichedSongs,
      newReleases: [],
      oldAlbums: [],
      source: "db",
    };

    cache.set(id, { data, at: Date.now() });
    return NextResponse.json(data);
  } catch (e: any) {
    console.error(`[ArtistAPI] Error for ${id}:`, e);
    return NextResponse.json(
      { error: "Failed to fetch artist details", details: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}
