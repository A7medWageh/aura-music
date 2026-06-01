import { NextResponse } from "next/server";
import { searchYouTube } from "@apis/youtubei.js";

// Curated list of top Arabic artists
const TOP_ARTISTS = [
  "عمرو دياب",
  "شيرين عبدالوهاب",
  "تامر حسني",
  "أحمد سعد",
  "ويجز",
  "نانسي عجرم",
  "حماقي",
  "أصالة",
  "وائل كفوري",
  "مروان موسى",
  "فرقة كايروكي",
  "حسين الجسمي",
];

type ArtistEntry = { name: string; artistId: string; thumbnailUrl: string };

let cache: { artists: ArtistEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let fetchPromise: Promise<ArtistEntry[]> | null = null;

async function buildArtistList(): Promise<ArtistEntry[]> {
  try {
    const results: ArtistEntry[] = [];
    
    // Fetch artists in parallel
    const promises = TOP_ARTISTS.map(async (name) => {
      try {
        const searchRes = await searchYouTube(name);
        if (searchRes.artists && searchRes.artists.length > 0) {
          const bestMatch = searchRes.artists[0];
          return {
            name: name, // Use our clean name instead of whatever YT says
            artistId: bestMatch.artistId,
            thumbnailUrl: bestMatch.thumbnailUrl ?? "",
          };
        }
      } catch (e) {
        console.warn(`[Artists] Failed to fetch artist: ${name}`);
      }
      return null;
    });

    const resolved = await Promise.all(promises);
    for (const artist of resolved) {
      if (artist) results.push(artist);
    }

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
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(
      { egyptian: cache.artists, intl: [] },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } }
    );
  }

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

  if (!fetchPromise) fetchPromise = buildArtistList();
  const artists = await fetchPromise;

  return NextResponse.json(
    { egyptian: artists, intl: [] },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } }
  );
}
