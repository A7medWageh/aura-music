import { NextResponse } from "next/server";
import { searchYouTube } from "@apis/youtubei.js";

const TOP_ARTISTS = [
  "عمرو دياب", "شيرين عبدالوهاب", "تامر حسني", "أحمد سعد", "ويجز", "نانسي عجرم", "حماقي", "أصالة", "وائل كفوري", "مروان موسى",
  "فرقة كايروكي", "حسين الجسمي", "بهاء سلطان", "رامي صبري", "تامر عاشور", "محمود العسيلي", "روبي", "أنغام", "إليسا", "محمد منير",
  "عبدالباسط حمودة", "عصام صاصا", "مروان بابلو", "عفروتو", "أحمد مكي", "حمزة نمرة", "رامي جمال", "سميرة سعيد", "عبدالمجيد عبدالله", "ماجد المهندس",
  "كاظم الساهر", "راشد الماجد", "نجوى كرم", "نوال الزغبي", "هيفاء وهبي", "مصطفى حجاج", "حكيم", "مسار إجباري", "شارموفرز", "أوكا وأورتيجا",
  "حمو بيكا", "عمر كمال", "حسن شاكوش", "رضا البحراوي", "مسلم", "عنبة", "فارس قطرية", "عبدالرحمن رشدي", "أمير عيد", "أحمد كامل"
];

const INTL_ARTISTS = [
  "The Weeknd", "Taylor Swift", "Eminem", "Billie Eilish", "Drake", "Dua Lipa", "Ed Sheeran", "Adele", "Justin Bieber", "Rihanna",
  "Bruno Mars", "Post Malone", "Ariana Grande", "Coldplay", "Imagine Dragons", "Harry Styles", "Beyonce", "Kanye West", "Kendrick Lamar", "Travis Scott",
  "Bad Bunny", "J Balvin", "Shakira", "Snoop Dogg", "50 Cent", "Tupac", "Notorious BIG", "Jay-Z", "Lady Gaga", "Katy Perry",
  "Shawn Mendes", "Charlie Puth", "Selena Gomez", "Miley Cyrus", "Zayn", "Olivia Rodrigo", "Doja Cat", "Megan Thee Stallion", "Cardi B", "Nicki Minaj",
  "Lil Nas X", "Lil Uzi Vert", "Juice WRLD", "XXXTentacion", "Avicii", "Calvin Harris", "David Guetta", "Martin Garrix", "Skrillex", "Marshmello"
];

import staticArtists from "@/services/music/artistsData.json";

type ArtistEntry = { name: string; artistId: string; thumbnailUrl: string };

let cache: { egyptian: ArtistEntry[]; intl: ArtistEntry[]; fetchedAt: number } = {
  egyptian: (staticArtists.egyptian || []) as ArtistEntry[],
  intl: (staticArtists.intl || []) as ArtistEntry[],
  fetchedAt: Date.now(),
};
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

let fetchPromise: Promise<{egyptian: ArtistEntry[], intl: ArtistEntry[]}> | null = null;

async function buildArtistList(): Promise<{egyptian: ArtistEntry[], intl: ArtistEntry[]}> {
  try {
    const fetchArtists = async (names: string[]) => {
      const results: ArtistEntry[] = [];
      const seenIds = new Set<string>();

      // Process in small batches of 4 to prevent network congestion or rate limits
      for (let i = 0; i < names.length; i += 4) {
        const batch = names.slice(i, i + 4);
        const batchResults = await Promise.all(
          batch.map(async (name) => {
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
          })
        );

        for (const a of batchResults) {
          if (a && a.artistId && !seenIds.has(a.artistId)) {
            seenIds.add(a.artistId);
            results.push(a);
          }
        }
      }
      return results;
    };

    const [egyptian, intl] = await Promise.all([
      fetchArtists(TOP_ARTISTS),
      fetchArtists(INTL_ARTISTS)
    ]);

    const results = {
      egyptian: egyptian.length > 0 ? egyptian : cache.egyptian,
      intl: intl.length > 0 ? intl : cache.intl,
    };
    cache = { ...results, fetchedAt: Date.now() };
    fetchPromise = null;
    return results;
  } catch (err) {
    console.error("[Artists API] Failed to build artist list:", err);
    fetchPromise = null;
    return cache;
  }
}


export async function GET(req: Request) {

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
