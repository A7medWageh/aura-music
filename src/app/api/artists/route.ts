/**
 * /api/artists
 * ─────────────
 * Returns Egyptian + International artists from MusicApi.
 * Uses local database IDs with mapi- prefix to avoid heavy YouTube search rate-limits and timeouts on first boot.
 * Fast, reliable, and works on Vercel.
 */
import { NextResponse } from "next/server";
import { getAllArtists } from "@/services/music/musicApiClient";

type ArtistEntry = { name: string; artistId: string; thumbnailUrl: string };

// Process-level cache: 6 hours
let cache: { artists: ArtistEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000;

let fetchPromise: Promise<ArtistEntry[]> | null = null;

async function buildArtistList(): Promise<ArtistEntry[]> {
  try {
    const res = await getAllArtists(1, 200);
    const artists = res.data ?? [];

    const results: ArtistEntry[] = artists.map((a) => ({
      name: a.name,
      artistId: `mapi-${a.id}`,
      thumbnailUrl: a.imageUrl ?? "",
    }));

    cache = { artists: results, fetchedAt: Date.now() };
    fetchPromise = null;
    return results;
  } catch (err) {
    console.error("[Artists API] Failed to build artist list:", err);
    fetchPromise = null;
    return [];
  }
}

export async function GET() {
  // Cache hit → instant response
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(
      { egyptian: cache.artists, intl: [] },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
    );
  }

  // Stale: serve stale immediately, revalidate in background
  if (cache) {
    if (!fetchPromise) {
      fetchPromise = buildArtistList().catch(() => {
        fetchPromise = null;
        return [];
      });
    }
    return NextResponse.json(
      { egyptian: cache.artists, intl: [] },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400" } }
    );
  }

  // No cache — must wait (first boot)
  if (!fetchPromise) fetchPromise = buildArtistList();
  const artists = await fetchPromise;

  return NextResponse.json(
    { egyptian: artists, intl: [] },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
  );
}
