/**
 * smartSearch.ts
 * ──────────────
 * Hybrid search:
 *   1. YouTube Music search (songs, artists, albums)
 *   2. MusicApi local catalog search (songs by name prefix)
 *
 * Results are merged, de-duplicated, and sorted by relevance.
 * MusicApi songs appear first (they are the "official" catalog).
 */
import { searchYouTube, resolveStream, isJunkResult } from "@apis/youtubei.js";
import { getAllSongs, getAllArtists } from "@/services/music/musicApiClient";
import { enrichSongs } from "@/services/music/songEnricher";

// ── In-memory cache shared across all requests ────────────────────────────────
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 min

// Catalog cache — loaded once and kept in process
let catalogSongs: any[] | null = null;
let catalogLoadedAt = 0;
const CATALOG_TTL = 15 * 60 * 1000; // 15 min

async function getLocalCatalog() {
  if (catalogSongs && Date.now() - catalogLoadedAt < CATALOG_TTL) {
    return catalogSongs;
  }
  try {
    const timeout = new Promise<any>((_, reject) => setTimeout(() => reject(new Error("db_timeout")), 1500));
    const fetchCatalog = Promise.all([
      getAllSongs(1, 100),
      getAllArtists(1, 50),
    ]);
    const [songsRes, artistsRes] = await Promise.race([fetchCatalog, timeout]);
    const artistsById = new Map<string, any>(artistsRes.data.map((a: any) => [a.id, a]));
    catalogSongs = await enrichSongs(songsRes.data, artistsById);
    catalogLoadedAt = Date.now();
    return catalogSongs;
  } catch {
    return [];
  }
}

function scoreMatch(query: string, title: string, artist: string): number {
  const q = normArabic(query.toLowerCase());
  const t = normArabic(title.toLowerCase());
  const a = normArabic(artist.toLowerCase());
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  if (a.includes(q)) return 50;
  const words = tokenize(q);
  const matched = words.filter((w) => t.includes(w) || a.includes(w)).length;
  return Math.round((matched / words.length) * 40);
}

// Normalize Arabic letters so "أ/إ/آ" match "ا", "ة" matches "ه", "ى" matches "ي".
function normArabic(s: string): string {
  return s
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ً-ْ]/g, "") // harakat
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Tokenize into meaningful search words, dropping stop-words that appear in
// nearly every title (feat/official/audio/video...) so relevance isn't faked.
const STOP_WORDS = new Set([
  "feat", "ft", "official", "offical", "audio", "video", "lyric", "lyrics",
  "mv", "hd", "4k", "song", "clip", "with", "and", "the", "اغانى", "اغنية",
  "الكليب", "كليب", "رسمي", "رسماي", "اغني",
].map(w => normArabic(w)));

function tokenize(s: string): string[] {
  return normArabic(s)
    .split(" ")
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// How many of the query tokens appear in title or artist (0..1).
function tokenCoverage(query: string, title: string, artist: string): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 1;
  const t = normArabic(title.toLowerCase());
  const a = normArabic(artist.toLowerCase());
  const hit = qTokens.filter((w) => t.includes(w) || a.includes(w)).length;
  return hit / qTokens.length;
}


export async function smartSearch(searchTerm: string) {
  const q = searchTerm.trim();
  if (!q) return { songs: [], artists: [], albums: [] };

  // Cache hit
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  // Run YouTube search + local catalog search in parallel
  const [ytResults, localCatalog] = await Promise.all([
    searchYouTube(q).catch(() => ({ songs: [], artists: [], albums: [] })),
    getLocalCatalog(),
  ]);

  // Filter local catalog for matches
  const localMatches = localCatalog
    .map((song: any) => ({
      song,
      score: scoreMatch(q, song.title, song.artist),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((r) => r.song);

  // Normalize YouTube results — strict relevance: must look like the searched
  // song (≥50% of query tokens in title/artist) and pass the junk filter.
  const ytSongs = ytResults.songs
    .filter((item: any) =>
      !isJunkResult(item.title, item.artist) &&
      tokenCoverage(q, item.title ?? "", item.artist ?? "") >= 0.5
    )
    .map((item: any) => ({
      songId: item.songId ?? item.videoId,
      title: item.title,
      artist: item.artist ?? "فنان غير معروف",
      artistId: `yt-${item.artist ?? "unknown"}`,
      albumId: null,
      albumTitle: null,
      youtubeVideoId: item.youtubeVideoId ?? item.songId,
      thumbnailUrl: item.thumbnailUrl ?? null,
      source: "youtube",
    }));

  // Merge: local first (official catalog), then YouTube (deduped by title)
  const seenIds = new Set(localMatches.map((s: any) => s.youtubeVideoId));
  const mergedSongs = [
    ...localMatches,
    ...ytSongs.filter((s: any) => !seenIds.has(s.youtubeVideoId)),
  ].slice(0, 20).map(s => ({ ...s, searchQuery: q }));

  const result = {
    songs: mergedSongs,
    artists: ytResults.artists.map((a: any) => ({
      artistId: a.artistId,
      artistName: a.artistName,
      thumbnailUrl: a.thumbnailUrl ?? null,
    })),
    albums: ytResults.albums.map((al: any) => ({
      albumId: al.albumId,
      title: al.title,
      artist: al.artist ?? al.artistName ?? "فنان غير معروف",
      thumbnailUrl: al.thumbnailUrl ?? null,
    })),
  };

  cache.set(q.toLowerCase(), { data: result, ts: Date.now() });

  // Background pre-fetch top 3 stream URLs for instant playback
  setTimeout(() => {
    result.songs.slice(0, 3).forEach((s: any) => {
      if (s.youtubeVideoId) resolveStream(s.youtubeVideoId).catch(() => {});
    });
  }, 500);

  return result;
}
