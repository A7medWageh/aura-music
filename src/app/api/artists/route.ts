import { NextResponse } from "next/server";
import { searchYouTube } from "@apis/youtubei.js";

// ── Artist definitions ────────────────────────────────────────────────────────
const EGYPTIAN_ARTISTS = [
  { name: "عمرو دياب",        searchQ: "Amr Diab" },
  { name: "تامر عاشور",       searchQ: "Tamer Ashour" },
  { name: "تامر حسني",        searchQ: "Tamer Hosny" },
  { name: "محمد منير",        searchQ: "Mohamed Mounir" },
  { name: "أنغام",            searchQ: "Angham singer" },
  { name: "حمزة نمرة",        searchQ: "Hamza Namira" },
  { name: "شيرين عبد الوهاب", searchQ: "Sherine Wahab" },
  { name: "محمد حماقي",       searchQ: "Mohamed Hamaki" },
  { name: "ويجز",             searchQ: "Wegz rapper" },
  { name: "مروان موسى",       searchQ: "Marwan Moussa" },
  { name: "محمود العسيلي",    searchQ: "Mahmoud Esseily" },
  { name: "مصطفى حجاج",       searchQ: "Mostafa Hagag" },
  { name: "رامي جمال",        searchQ: "Ramy Gamal" },
  { name: "شاكوش",            searchQ: "Shakoush Egypt" },
  { name: "سعد الصغير",       searchQ: "Saad El Soghayar" },
  { name: "حكيم",             searchQ: "Hakim Egypt" },
  { name: "عمر كمال",         searchQ: "Omar Kamal singer" },
  { name: "Double Zuksh",     searchQ: "Double Zuksh" },
  { name: "أوكا وأورتيجا",    searchQ: "Oka Ortega" },
  { name: "بابلو",            searchQ: "Pablo Egypt rap" },
  { name: "ابيو",             searchQ: "Abyusif rapper" },
  { name: "إليسا",            searchQ: "Elissa Lebanon" },
  { name: "فيلو",             searchQ: "Felo Egypt" },
  { name: "أصالة",            searchQ: "Assala singer" },
  { name: "بهاء سلطان",       searchQ: "Bahaa Sultan" },
  { name: "محمد فؤاد",        searchQ: "Mohamed Fouad Egypt" },
  { name: "هشام عباس",        searchQ: "Hisham Abbas" },
  { name: "طارق الشيخ",       searchQ: "Tarek El Sheikh" },
  { name: "كريم محسن",        searchQ: "Karim Mohsen" },
];

const INTL_ARTISTS = [
  { name: "The Weeknd",        searchQ: "The Weeknd" },
  { name: "Drake",             searchQ: "Drake rapper" },
  { name: "Eminem",            searchQ: "Eminem rapper" },
  { name: "Ed Sheeran",        searchQ: "Ed Sheeran" },
  { name: "Adele",             searchQ: "Adele singer" },
  { name: "Bad Bunny",         searchQ: "Bad Bunny" },
  { name: "Taylor Swift",      searchQ: "Taylor Swift" },
  { name: "Post Malone",       searchQ: "Post Malone" },
  { name: "Kendrick Lamar",    searchQ: "Kendrick Lamar" },
  { name: "Billie Eilish",     searchQ: "Billie Eilish" },
  { name: "Bruno Mars",        searchQ: "Bruno Mars" },
  { name: "Dua Lipa",          searchQ: "Dua Lipa" },
  { name: "Travis Scott",      searchQ: "Travis Scott" },
  { name: "SZA",               searchQ: "SZA singer" },
  { name: "Coldplay",          searchQ: "Coldplay" },
  { name: "Ariana Grande",     searchQ: "Ariana Grande" },
  { name: "Harry Styles",      searchQ: "Harry Styles" },
  { name: "Olivia Rodrigo",    searchQ: "Olivia Rodrigo" },
  { name: "Morgan Wallen",     searchQ: "Morgan Wallen" },
  { name: "Sabrina Carpenter", searchQ: "Sabrina Carpenter" },
];

type ArtistEntry = { name: string; artistId: string; thumbnailUrl: string };

// ── Process-level cache (survives between requests in the same Node process) ──
let cache: { egyptian: ArtistEntry[]; intl: ArtistEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Ongoing promise to avoid stampede on first load
let fetchPromise: Promise<{ egyptian: ArtistEntry[]; intl: ArtistEntry[] }> | null = null;

async function fetchOne(a: { name: string; searchQ: string }): Promise<ArtistEntry | null> {
  try {
    const data = await searchYouTube(a.searchQ);
    const artist = data?.artists?.[0];
    if (artist?.artistId) {
      return { name: a.name, artistId: artist.artistId, thumbnailUrl: artist.thumbnailUrl ?? "" };
    }
    // Fallback: use first song thumbnail as artist thumbnail
    const song = data?.songs?.[0];
    if (song?.artistId || song?.youtubeVideoId) {
      return {
        name: a.name,
        artistId: song.artistId ?? `yt-${a.searchQ}`,
        thumbnailUrl: song.thumbnailUrl ?? "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function buildArtistList(
  list: { name: string; searchQ: string }[]
): Promise<ArtistEntry[]> {
  // Process in batches of 5 to avoid hammering YouTube
  const results: ArtistEntry[] = [];
  const BATCH = 5;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const settled = await Promise.allSettled(batch.map(fetchOne));
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
  }
  return results;
}

async function buildCache() {
  const [egyptian, intl] = await Promise.all([
    buildArtistList(EGYPTIAN_ARTISTS),
    buildArtistList(INTL_ARTISTS),
  ]);
  cache = { egyptian, intl, fetchedAt: Date.now() };
  fetchPromise = null;
  return { egyptian, intl };
}

export async function GET() {
  // Cache hit → respond instantly
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(
      { egyptian: cache.egyptian, intl: cache.intl },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
    );
  }

  // Stale cache → serve it immediately and revalidate in background
  if (cache) {
    // Trigger background refresh without blocking response
    if (!fetchPromise) fetchPromise = buildCache().catch(() => { fetchPromise = null; return { egyptian: [], intl: [] }; });
    return NextResponse.json(
      { egyptian: cache.egyptian, intl: cache.intl },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400" } }
    );
  }

  // No cache at all — must wait (first boot)
  if (!fetchPromise) fetchPromise = buildCache();
  const { egyptian, intl } = await fetchPromise;

  return NextResponse.json(
    { egyptian, intl },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
  );
}
