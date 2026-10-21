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
  const hay = [...tokenize(t), ...tokenize(a)];
  const matched = words.filter((w) => hay.some((h) => tokenMatch(w, h))).length;
  return Math.round((matched / words.length) * 40);
}

// Normalize Arabic letters so "أ/إ/آ" match "ا", "ة" matches "ه", "ى" matches "ي",
// and hamza forms (ؤ/ئ/ء) collapse into their base letters — "خنزؤور" ≈ "خنزور".
function normArabic(s: string): string {
  return s
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ـ/g, "") // tatweel
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/[ً-ْ]/g, "") // harakat
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Fuzzy word equivalence: exact / containment (≥3 letters) / one-typo distance.
// Makes "ابيوسف" match "يوسف" and "خنزور" match "خنزول".
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.includes(short)) return true;
  if (Math.min(a.length, b.length) >= 4 && Math.abs(a.length - b.length) <= 1 && levenshtein(a, b) <= 1) return true;
  return false;
}

// Weighted match strength: containment (يوسف⊂ابيوسف) and typo-distance count
// for less than an exact match, so weak similarity can't fake a 0.5 pass.
function tokenScore(w: string, h: string): number {
  if (w === h) return 1;
  const [long, short] = w.length >= h.length ? [w, h] : [h, w];
  if (short.length >= 3 && long.includes(short)) return 0.8;
  if (Math.min(w.length, h.length) >= 4 && Math.abs(w.length - h.length) <= 1 && levenshtein(w, h) <= 1) return 0.6;
  return 0;
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

// How well the query tokens appear in title or artist (0..1), weighted:
// exact=1, containment=0.8, typo-distance=0.6 — averaged over query tokens.
function tokenCoverage(query: string, title: string, artist: string): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 1;
  const hay = [...tokenize(title), ...tokenize(artist)];
  const score = qTokens.reduce((sum, w) => sum + Math.max(0, ...hay.map((h) => tokenScore(w, h))), 0);
  return score / qTokens.length;
}


export async function smartSearch(searchTerm: string) {
  const q = searchTerm.trim();
  if (!q) return { songs: [], artists: [], albums: [] };

  // Cache hit
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  // Run YouTube search + local catalog search in parallel. A second,
  // linguistically-corrected variant (normalized/spaced) is also sent so
  // "ابيوسف خنزؤور" still reaches YouTube as searchable Arabic.
  const normQuery = tokenize(q).join(" ");
  const emptyYt = { songs: [], artists: [], albums: [] };
  const [ytResults, ytVariant, localCatalog] = await Promise.all([
    searchYouTube(q).catch(() => emptyYt),
    normQuery && normQuery.toLowerCase() !== q.toLowerCase()
      ? searchYouTube(normQuery).catch(() => emptyYt)
      : Promise.resolve(emptyYt),
    getLocalCatalog(),
  ]);

  const ytSongsRaw: any[] = [];
  const ytSeenIds = new Set<string>();
  for (const item of [...(ytResults.songs || []), ...(ytVariant.songs || [])]) {
    const id = String(item.songId ?? item.videoId ?? item.youtubeVideoId ?? "");
    if (!id || ytSeenIds.has(id)) continue;
    ytSeenIds.add(id);
    ytSongsRaw.push(item);
  }

  const mergeByKey = (lists: any[][], key: string) => {
    const map = new Map<string, any>();
    lists.flat().forEach((x: any) => {
      const id = String(x?.[key] ?? "");
      if (id && !map.has(id)) map.set(id, x);
    });
    return Array.from(map.values());
  };
  const ytAlbumsAll = mergeByKey([ytResults.albums || [], ytVariant.albums || []], "albumId");
  const ytArtistsAll = mergeByKey([ytResults.artists || [], ytVariant.artists || []], "artistId");

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

  // Normalize YouTube results — junk is always dropped; long-form videos
  // (podcasts/shows) drop via duration; strong weighted matches (≥0.5) pass,
  // then ≥0.45 partials, then YouTube's own order as the last resort.
  const scoredNonJunk = ytSongsRaw
    .filter((item: any) => !isJunkResult(item.title, item.artist))
    .filter((item: any) => !item.duration || (item.duration >= 40 && item.duration <= 55 * 60))
    .map((item: any) => ({ item, cov: tokenCoverage(q, item.title ?? "", item.artist ?? "") }));
  const passing = scoredNonJunk.filter((r) => r.cov >= 0.5);
  const partial = scoredNonJunk.filter((r) => r.cov >= 0.45).sort((a, b) => b.cov - a.cov).slice(0, 8);
  // Last tier keeps YouTube's own ranking order — YouTube matches transliterated
  // titles (e.g. "Khanza2or" for خنزؤور) that token coverage cannot see. Nonsense
  // queries stay empty because YouTube itself returns nothing for them.
  const deep = scoredNonJunk.slice(0, 5);
  const ytSongsSel = passing.length > 0 ? passing : partial.length > 0 ? partial : deep;

  const ytSongs = ytSongsSel.map(({ item }: any) => ({
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
    artists: ytArtistsAll.slice(0, 6).map((a: any) => ({
      artistId: a.artistId,
      artistName: a.artistName,
      thumbnailUrl: a.thumbnailUrl ?? null,
    })),
    albums: ytAlbumsAll.slice(0, 200).map((al: any) => ({
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
