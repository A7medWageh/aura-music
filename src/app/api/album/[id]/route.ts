/**
 * /api/album/[id]
 * ────────────────
 * Album details from Neon DB. ID is a UUID string.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAlbumById, getAllArtists, getAllSongs } from "@/services/music/musicApiClient";
import { enrichSongs } from "@/services/music/songEnricher";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rate = await checkRateLimit(req, { key: "album_api", max: 100, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  try {
    const { id: albumId } = await params;
    if (!albumId) return fail("BAD_REQUEST", "Missing album id", 400);

    const [album, allArtistsRes, allSongsRes] = await Promise.all([
      getAlbumById(albumId),
      getAllArtists(1, 300),
      getAllSongs(1, 500),
    ]);

    const artistsById = new Map(allArtistsRes.data.map((a) => [a.id, a]));
    const albumSongs = allSongsRes.data.filter((s) => s.albumId === albumId);
    const enriched = await enrichSongs(albumSongs, artistsById);

    const artistName =
      album.artistId ? artistsById.get(album.artistId)?.name ?? "فنان غير معروف" : "فنان غير معروف";

    return NextResponse.json({
      data: {
        albumId,
        title: album.name,
        artist: artistName,
        coverUrl: album.imageUrl ?? null,
        year: new Date(album.createdAt).getFullYear().toString(),
        songs: enriched,
        source: "db",
      },
    });
  } catch (error: any) {
    console.error("[Album API] error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}
