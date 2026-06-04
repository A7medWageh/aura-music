import { NextResponse } from "next/server";
import { searchYouTube } from "@apis/youtubei.js";

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
  "بهاء سلطان",
  "رامي صبري",
  "تامر عاشور",
  "محمود العسيلي",
  "روبي",
  "أنغام",
  "إليسا",
  "محمد منير",
  "عبدالباسط حمودة",
  "عصام صاصا",
  "مروان بابلو",
  "عفروتو"
];

const INTL_ARTISTS = [
  "The Weeknd",
  "Taylor Swift",
  "Eminem",
  "Billie Eilish",
  "Drake",
  "Dua Lipa",
  "Ed Sheeran",
  "Adele",
  "Justin Bieber",
  "Rihanna",
  "Bruno Mars",
  "Post Malone",
  "Ariana Grande",
  "Coldplay",
  "Imagine Dragons"
];

type ArtistEntry = { name: string; artistId: string; thumbnailUrl: string };

let cache: { egyptian: ArtistEntry[]; intl: ArtistEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let fetchPromise: Promise<{egyptian: ArtistEntry[], intl: ArtistEntry[]}> | null = null;

async function buildArtistList(): Promise<{egyptian: ArtistEntry[], intl: ArtistEntry[]}> {
  try {
    const fetchArtists = async (names: string[]) => {
      const promises = names.map(async (name) => {
        try {
          const searchRes = await searchYouTube(name);
          if (searchRes.artists && searchRes.artists.length > 0) {
            const bestMatch = searchRes.artists[0];
            return {
              name,
              artistId: bestMatch.artistId,
              thumbnailUrl: bestMatch.thumbnailUrl ?? "",
            };
          }
        } catch (e) {}
        return null;
      });
      const resolved = await Promise.all(promises);
      return resolved.filter(a => a !== null) as ArtistEntry[];
    };

    const [egyptian, intl] = await Promise.all([
      fetchArtists(TOP_ARTISTS),
      fetchArtists(INTL_ARTISTS)
    ]);

    const results = { egyptian, intl };
    cache = { ...results, fetchedAt: Date.now() };
    fetchPromise = null;
    return results;
  } catch (err) {
    console.error("[Artists API] Failed to build artist list:", err);
    fetchPromise = null;
    return { egyptian: [], intl: [] };
  }
}

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(
      { egyptian: cache.egyptian, intl: cache.intl },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } }
    );
  }

  if (cache) {
    if (!fetchPromise) {
      fetchPromise = buildArtistList().catch(() => {
        fetchPromise = null;
        return { egyptian: cache!.egyptian, intl: cache!.intl };
      });
    }
    return NextResponse.json(
      { egyptian: cache.egyptian, intl: cache.intl },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400" } }
    );
  }

  if (!fetchPromise) fetchPromise = buildArtistList();
  const artists = await fetchPromise;

  return NextResponse.json(
    { egyptian: artists.egyptian, intl: artists.intl },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } }
  );
}
