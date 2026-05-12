/**
 * /api/artist/[id]
 * ─────────────────
 * Smart artist resolver:
 *   - If id is numeric (e.g. "42") → fetch from MusicApi then enrich with YouTube songs
 *   - If id starts with "mapi-" → strip prefix, fetch from MusicApi
 *   - Otherwise → treat as YouTube Music artistId (legacy/YouTube path)
 */
import { NextRequest, NextResponse } from "next/server";
import { getArtistById, getAllArtists } from "@/services/music/musicApiClient";
import { enrichSongs } from "@/services/music/songEnricher";
import { getArtistDetails } from "@apis/youtubei.js";
import type { MApiArtist } from "@/services/music/musicApiClient";

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
    // Determine if this is a MusicApi artist ID (numeric) or YouTube artistId
    const numericId = id.startsWith("mapi-")
      ? parseInt(id.replace("mapi-", ""), 10)
      : /^\d+$/.test(id)
      ? parseInt(id, 10)
      : null;

    if (numericId !== null && !isNaN(numericId)) {
      // ── MusicApi path ──────────────────────────────────────────────────────
      const [artist, allArtistsRes] = await Promise.all([
        getArtistById(numericId),
        getAllArtists(1, 200),
      ]);

      const artistsById = new Map(allArtistsRes.data.map((a) => [a.id, a]));

      // Get all songs by this artist from the full song list
      // (MusicApi artist endpoint returns the artist, songs must be fetched from songs endpoint)
      // We use getAllArtists to get the artist object, then enrich songs with YouTube
      const { getAllSongs } = await import("@/services/music/musicApiClient");
      const allSongsRes = await getAllSongs(1, 500);
      const artistSongs = allSongsRes.data.filter((s) => s.artistId === numericId);
      const enriched = await enrichSongs(artistSongs, artistsById);

      const data = {
        artistId: id,
        artistName: artist.name,
        artistImage: artist.imageUrl ?? null,
        subscribers: "",
        isVerified: false,
        songs: enriched,
        newReleases: [],
        oldAlbums: [],
        source: "musicapi",
      };

      cache.set(id, { data, at: Date.now() });
      return NextResponse.json(data);
    }

    // ── YouTube path (legacy) ──────────────────────────────────────────────
    console.log(`[ArtistAPI] Fetching YouTube artist details for ${id}...`);
    const data = await getArtistDetails(id);
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
