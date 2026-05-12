/**
 * /api/artists
 * ─────────────
 * Returns Egyptian + International artists from MusicApi.
 * Each artist gets a YouTube artistId via YouTube Music search for the artist page link.
 * Falls back to a search-derived artistId if YouTube search finds nothing.
 */
import { NextResponse } from "next/server";
import { getAllArtists } from "@/services/music/musicApiClient";
import { searchYouTube } from "@apis/youtubei.js";

type ArtistEntry = { name: string; artistId: string; thumbnailUrl: string };

// Process-level cache: 6 hours
let cache: { artists: ArtistEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000;

let fetchPromise: Promise<ArtistEntry[]> | null = null;

/**
 * Resolve a YouTube Music artistId for a given MusicApi artist.
 * Used so clicking an artist card navigates to the YouTube artist page.
 */
async function resolveYtArtistId(
  name: string,
  imageUrl: string | null
): Promise<ArtistEntry | null> {
  try {
    const data = await searchYouTube(name);
    const ytArtist = data?.artists?.[0];
    if (ytArtist?.artistId) {
      return {
        name,
        artistId: ytArtist.artistId,
        thumbnailUrl: imageUrl ?? ytArtist.thumbnailUrl ?? "",
      };
    }
    // Fallback: use thumbnail from MusicApi, derive artistId from song
    const song = data?.songs?.[0];
    return {
      name,
      artistId: song?.artistId ?? `mapi-${encodeURIComponent(name)}`,
      thumbnailUrl: imageUrl ?? song?.thumbnailUrl ?? "",
    };
  } catch {
    return {
      name,
      artistId: `mapi-${encodeURIComponent(name)}`,
      thumbnailUrl: imageUrl ?? "",
    };
  }
}

async function buildArtistList(): Promise<ArtistEntry[]> {
  const res = await getAllArtists(1, 200);
  const artists = res.data;

  // Resolve YouTube artist IDs in parallel (batches of 8 to avoid spam)
  const results: ArtistEntry[] = [];
  const BATCH = 8;
  for (let i = 0; i < artists.length; i += BATCH) {
    const batch = artists.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map((a) => resolveYtArtistId(a.name, a.imageUrl))
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
  }

  cache = { artists: results, fetchedAt: Date.now() };
  fetchPromise = null;
  return results;
}

export async function GET() {
  // Cache hit → instant response
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(
      // Maintain backward-compat: split into egyptian/intl is no longer needed
      // UI expects { egyptian: [...], intl: [...] }
      // We return all as egyptian and keep intl empty (or split if needed)
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
