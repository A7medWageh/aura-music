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
import { searchYouTube, isJunkResult } from "@apis/youtubei.js";
import { resolveUniversalAudio } from "@/services/music/universalAudioResolver";
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
  const matched = words.reduce((s, w) => s + Math.max(0, ...hay.map((h: string) => tokenScore(w, h))), 0);
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
  "الكليب", "كليب", "رسمي", "رسماي", "اغني", "غناء", "اداء", "أداء", "بصوت",
  "كلمات", "الحان", "ألحان", "توزيع", "موسيقى", "فيديو", "كليب"
].map(w => normArabic(w)));

function cleanSearchQuery(raw: string): string {
  return raw
    .replace(/^(اغنية|أغنية|اغاني|أغاني|كليب|فيديو|تراك|نزل|تحميل|استماع)\s+/gi, "")
    .replace(/\s+(اغنية|أغنية|كليب|فيديو|تراك)$/gi, "")
    .replace(/(^|\s)ل([\u0621-\u064A]{3,})/g, (match, prefix, word) => {
      if (["ليل", "لحن", "لحظة", "لقاء", "ليلة", "لو", "لا", "لازم", "لعبة"].includes(word)) return match;
      return prefix + word;
    })
    .trim();
}

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
  const score = qTokens.reduce((sum, w) => {
    let max = 0;
    for (const h of hay) {
      if (w === h) { max = 1; break; }
      const [long, short] = w.length >= h.length ? [w, h] : [h, w];
      if (short.length >= 3 && long.includes(short)) max = Math.max(max, 0.85);
      else if (Math.min(w.length, h.length) >= 4 && Math.abs(w.length - h.length) <= 1 && levenshtein(w, h) <= 1) max = Math.max(max, 0.6);
    }
    return sum + max;
  }, 0);
  return score / qTokens.length;
}


export async function smartSearch(searchTerm: string) {
  const q = searchTerm.trim();
  if (!q) return { songs: [], artists: [], albums: [] };

  // Cache hit
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const cleanQ = cleanSearchQuery(q);
  const normQuery = tokenize(cleanQ || q).join(" ");
  const emptyYt = { songs: [], artists: [], albums: [] };

  const searchPromises: Promise<any>[] = [searchYouTube(q).catch(() => emptyYt)];
  if (cleanQ && cleanQ.toLowerCase() !== q.toLowerCase()) {
    searchPromises.push(searchYouTube(cleanQ).catch(() => emptyYt));
  }
  if (normQuery && normQuery.toLowerCase() !== q.toLowerCase() && normQuery.toLowerCase() !== cleanQ.toLowerCase()) {
    searchPromises.push(searchYouTube(normQuery).catch(() => emptyYt));
  }

  const [localCatalog, ...ytResultsList] = await Promise.all([
    getLocalCatalog(),
    ...searchPromises,
  ]);

  const ytSongsRaw: any[] = [];
  const ytSeenIds = new Set<string>();
  for (const res of ytResultsList) {
    for (const item of (res.songs || [])) {
      const id = String(item.songId ?? item.videoId ?? item.youtubeVideoId ?? "");
      if (!id || ytSeenIds.has(id)) continue;
      ytSeenIds.add(id);
      ytSongsRaw.push(item);
    }
  }

  const mergeByKey = (lists: any[][], key: string) => {
    const map = new Map<string, any>();
    lists.flat().forEach((x: any) => {
      const id = String(x?.[key] ?? "");
      if (id && !map.has(id)) map.set(id, x);
    });
    return Array.from(map.values());
  };
  const allYtAlbums = ytResultsList.map(r => r.albums || []);
  const allYtArtists = ytResultsList.map(r => r.artists || []);
  const ytAlbumsAll = mergeByKey(allYtAlbums, "albumId");
  const ytArtistsAll = mergeByKey(allYtArtists, "artistId");

  // Filter local catalog for matches
  const localMatches = localCatalog
    .map((song: any) => ({
      song,
      score: scoreMatch(q, song.title, song.artist),
    }))
    .filter((r) => r.score >= 28)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((r) => r.song);

  function computeRelevance(item: any): number {
    const normTitle = normArabic(item.title || "").toLowerCase();
    const normArt = normArabic(item.artist || "").toLowerCase();
    const nq = normArabic(q).toLowerCase();
    const nCleanQ = normArabic(cleanQ).toLowerCase();
    
    const strippedTitle = tokenize(normTitle).join(" ");
    const strippedCleanQ = tokenize(nCleanQ).join(" ");

    let score = 0;

    // Exact or substring match in original or stripped title
    if (normTitle === nq || normTitle === nCleanQ || strippedTitle === strippedCleanQ) {
      score += 130;
    } else if (
      normTitle.includes(nq) ||
      (nCleanQ.length >= 3 && normTitle.includes(nCleanQ)) ||
      (strippedCleanQ.length >= 3 && strippedTitle.includes(strippedCleanQ))
    ) {
      score += 90;
    }

    // Token coverage across both original and cleaned query
    const covQ = tokenCoverage(q, item.title ?? "", item.artist ?? "");
    const covClean = tokenCoverage(cleanQ, item.title ?? "", item.artist ?? "");
    const bestCov = Math.max(covQ, covClean);

    score += Math.round(bestCov * 70);

    if (bestCov >= 0.95) {
      score += 45;
    }

    // Artist matches channel or title
    const qTokens = tokenize(cleanQ);
    const artistMatches = qTokens.some(w => normArt.includes(w) || (w.length >= 3 && normArt.includes(w)));
    if (artistMatches) score += 35;

    // Official channel boost
    if (/official|records|music|rotana|mazzika|sobky|elsobky|نجوم|مزيكا|روتانا|السبكي|نغم/i.test(item.artist || "")) {
      score += 25;
    }

    // Penalty for status / whatsapp cuts (< 60s)
    const lowerTitle = (item.title || "").toLowerCase();
    if (/حالة\s*واتس|ستوري|حالات|shorts/i.test(lowerTitle)) {
      score -= 60;
    }

    // Penalty for karaoke, instrumental, cover
    if (!q.includes("كاريوكي") && !q.includes("لحن") && /كاريوكي|لحن|موسيقى فقط|بدون موسيقى|instrumental|karaoke/i.test(lowerTitle)) {
      score -= 40;
    }

    // Penalty for 3rd-party cover / remix / fan uploads
    if (!q.includes("ريمكس") && !q.includes("remix") && /remix|ريمكس|ميكس|slowed|sped up|مبطأ|مسرع/i.test(lowerTitle)) {
      score -= 25;
    }

    return Math.round(score);
  }

  // Normalize YouTube results — junk is always dropped; duration filtered
  const scoredNonJunk = ytSongsRaw
    .filter((item: any) => !isJunkResult(item.title, item.artist))
    .filter((item: any) => !item.duration || (item.duration >= 40 && item.duration <= 55 * 60))
    .map((item: any) => ({
      item,
      score: computeRelevance(item),
      cov: Math.max(tokenCoverage(q, item.title ?? "", item.artist ?? ""), tokenCoverage(cleanQ, item.title ?? "", item.artist ?? "")),
    }));

  scoredNonJunk.sort((a, b) => b.score - a.score);

  const relevantSongs = scoredNonJunk.filter(r => r.score >= 35 || r.cov >= 0.4);
  const ytSongsSel = (relevantSongs.length > 0 ? relevantSongs : scoredNonJunk).slice(0, 25);

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
  ].slice(0, 25).map(s => ({ ...s, searchQuery: q }));

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

  // Background pre-warm stream cache for instant first click — must use the
  // same resolver the player hits (/api/ytdownload → resolveUniversalAudio),
  // skipBot keeps @L_10_BOT out of warmups, and 8 covers deep-tier results.
  setTimeout(() => {
    result.songs.slice(0, 8).forEach((s: any) => {
      if (s.youtubeVideoId) {
        resolveUniversalAudio({
          videoId: s.youtubeVideoId,
          title: s.title || "",
          artist: s.artist || "",
          skipBot: true,
        }).catch(() => {});
      }
    });
  }, 500);

  return result;
}
