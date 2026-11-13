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
import { BILINGUAL_ARTIST_MAP, ARABIC_TO_LATIN_MAP, extractSmartArtistAndTitle } from "@/services/music/artistMatcher";

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

// Normalize colloquial Egyptian & Arabic common joins and typos
export function normalizeColloquialArabic(text: string): string {
  if (!text) return "";
  return text
    .replace(/(?:^|\s)يولد(?=\s|$)/g, " يا ولد")
    .replace(/(?:^|\s)ياولد(?=\s|$)/g, " يا ولد")
    .replace(/(?:^|\s)يازين(?=\s|$)/g, " يا زين")
    .replace(/(?:^|\s)ياواد(?=\s|$)/g, " يا واد")
    .replace(/(?:^|\s)يلى(?=\s|$)/g, " يا اللي")
    .replace(/(?:^|\s)ياللى(?=\s|$)/g, " يا اللي")
    .replace(/(?:^|\s)يابن(?=\s|$)/g, " يا ابن")
    .replace(/(?:^|\s)ياسيد[يي](?=\s|$)/g, " يا سيدي")
    .replace(/(?:^|\s)ياحبيب[يي](?=\s|$)/g, " يا حبيبي")
    .replace(/(?:^|\s)ياجميل(?=\s|$)/g, " يا جميل")
    .replace(/(?:^|\s)ماتيج[يي](?=\s|$)/g, " ما تيجي")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize Arabic letters so "أ/إ/آ" match "ا", "ة" matches "ه", "ى" matches "ي",
// and hamza forms (ؤ/ئ/ء) collapse into their base letters — "خنزؤور" ≈ "خنزور".
function normArabic(s: string): string {
  return normalizeColloquialArabic(s)
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

function parseQueryIntent(raw: string): { cleanQ: string; titlePart: string; artistPart: string; invertedQ: string } {
  const normRaw = normalizeColloquialArabic(raw);
  const cleaned = normRaw
    .replace(/^(اغنية|أغنية|اغاني|أغاني|كليب|فيديو|تراك|نزل|تحميل|استماع)\s+/gi, "")
    .replace(/\s+(اغنية|أغنية|كليب|فيديو|تراك)$/gi, "")
    .trim();

  let titlePart = "";
  let artistPart = "";

  // 1. Check preposition pattern: "شايف نفسي فيك لحسام حبيب" -> "شايف نفسي فيك", "حسام حبيب"
  const prepositionMatch = cleaned.match(/^(.*?)\s+ل([\u0621-\u064A]{3,}(?:\s+[\u0621-\u064A]{2,})*)$/);
  if (prepositionMatch) {
    const rawArtist = prepositionMatch[2].trim();
    if (!["ليل", "لحن", "لحظة", "لقاء", "ليلة", "لو", "لا", "لازم", "لعبة"].includes(rawArtist)) {
      titlePart = prepositionMatch[1].trim();
      artistPart = rawArtist;
    }
  }

  // 2. If no preposition, check known artists from dictionary
  if (!artistPart) {
    const norm = normArabic(cleaned).toLowerCase();
    for (const arArtist of Object.keys(ARABIC_TO_LATIN_MAP)) {
      const normAr = normArabic(arArtist).toLowerCase();
      if (norm.startsWith(normAr + " ")) {
        artistPart = arArtist;
        titlePart = cleaned.slice(arArtist.length).trim();
        break;
      } else if (norm.endsWith(" " + normAr)) {
        artistPart = arArtist;
        titlePart = cleaned.slice(0, cleaned.length - arArtist.length).trim();
        break;
      }
    }
  }

  const cleanQ = (artistPart && titlePart) ? `${titlePart} ${artistPart}` : cleanSearchQuery(normRaw);
  const invertedQ = (artistPart && titlePart) ? `${artistPart} ${titlePart}` : "";

  return { cleanQ, titlePart, artistPart, invertedQ };
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
  const q = normalizeColloquialArabic(searchTerm.trim());
  if (!q) return { songs: [], artists: [], albums: [] };

  // Cache hit
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  const { cleanQ, titlePart, artistPart, invertedQ } = parseQueryIntent(q);
  const emptyYt = { songs: [], artists: [], albums: [] };

  const primaryQuery = cleanQ || q;
  // Fast, single-pass YouTube search with a 3.5s timeout.
  // Probing multiple variants in parallel flooded YouTube and caused 5s+ stalls.
  let ytRes = await Promise.race([
    searchYouTube(primaryQuery),
    new Promise<any>((_, reject) => setTimeout(() => reject(new Error("yt_timeout")), 3500))
  ]).catch(() => emptyYt);

  // If primary returned few or no songs, try inverted or raw query as fallback
  if ((!ytRes?.songs || ytRes.songs.length < 3) && invertedQ && invertedQ.toLowerCase() !== primaryQuery.toLowerCase()) {
    const fallbackRes = await searchYouTube(invertedQ).catch(() => emptyYt);
    if (fallbackRes?.songs?.length) {
      ytRes = {
        songs: [...(ytRes?.songs || []), ...(fallbackRes.songs || [])],
        artists: [...(ytRes?.artists || []), ...(fallbackRes.artists || [])],
        albums: [...(ytRes?.albums || []), ...(fallbackRes.albums || [])],
      };
    }
  }

  const localCatalog = await getLocalCatalog();
  const ytResultsList = [ytRes];

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

  function computeRelevance(item: any): number {
    const rawFullTitle = (item.rawTitle || item.title || "").toLowerCase();
    const combinedHaystack = `${rawFullTitle} ${item.artist || ""}`.toLowerCase();
    // Strict Junk Channel / Wedding Laser recording rejection
    if (/(تصوير\s*و?الليزر|تنظيم\s*الحفلات|مليونية|مواهب\s*الحظ|عفاريت\s*الحظ|استوديو\s*تصوير|فيديو\s*سيرفيس|عازف\s*أ?ورج|أ?ورج\s*مصر|تسجيلات\s*(أفراح|الحظ)|معزوفات|كريم\s*ناعوس|الشافعي|سامى\s*للتصوير|العدوى|ناعوس)/i.test(combinedHaystack) ||
        /(?:^|\s)(?:أفراح|حفلات|مليونية|الحظ|أورج)(?:\s|$)/i.test(combinedHaystack)) {
      return -1000;
    }

    const normTitle = normArabic(item.title || "").toLowerCase();
    const normRawFull = normArabic(rawFullTitle).toLowerCase();
    const rawTitleLower = rawFullTitle;
    const normArt = normArabic(item.artist || "").toLowerCase();
    const rawArtLower = (item.artist || "").toLowerCase();
    const nq = normArabic(q).toLowerCase();
    const nCleanQ = normArabic(cleanQ).toLowerCase();
    const nInvertedQ = invertedQ ? normArabic(invertedQ).toLowerCase() : "";
    const nTitlePart = titlePart ? normArabic(titlePart).toLowerCase() : "";
    const nArtistPart = artistPart ? normArabic(artistPart).toLowerCase() : "";
    const latinArtist = artistPart ? (ARABIC_TO_LATIN_MAP[artistPart] || "") : "";

    const strippedTitle = tokenize(normTitle).join(" ");
    const strippedCleanQ = tokenize(nCleanQ).join(" ");
    const strippedInvertedQ = invertedQ ? tokenize(nInvertedQ).join(" ") : "";

    let score = 0;

    // 1. Exact or Full Substring Match in title (both [Song - Artist] AND [Artist - Song] orders)
    const isDirectMatch = normTitle === nq || normTitle === nCleanQ || strippedTitle === strippedCleanQ || normRawFull === nq;
    const isInvertedMatch = (nInvertedQ && normTitle === nInvertedQ) || (strippedInvertedQ && strippedTitle === strippedInvertedQ);
    const isDualOrderSubstring = normTitle.includes(nq) || normRawFull.includes(nq) ||
      (nCleanQ.length >= 3 && (normTitle.includes(nCleanQ) || normRawFull.includes(nCleanQ))) ||
      (strippedCleanQ.length >= 3 && strippedTitle.includes(strippedCleanQ)) ||
      (nInvertedQ.length >= 3 && normTitle.includes(nInvertedQ)) ||
      (strippedInvertedQ.length >= 3 && strippedTitle.includes(strippedInvertedQ));

    if (isDirectMatch || isInvertedMatch) {
      score += 200;
    } else if (isDualOrderSubstring) {
      score += 150;
    } else if (nTitlePart && (normTitle.includes(nTitlePart) || normRawFull.includes(nTitlePart))) {
      score += 120;
    }

    // 1b. Dual Title + Artist Perfect Alignment (Direct match when user asked for song + singer)
    if (nTitlePart && nArtistPart) {
      const hasTitlePart = normTitle.includes(nTitlePart) || normRawFull.includes(nTitlePart) || normTitle.includes(normArabic(nTitlePart));
      const hasArtistPart = normArt.includes(nArtistPart) || normTitle.includes(nArtistPart) || normRawFull.includes(nArtistPart) ||
        (latinArtist && rawArtLower.includes(latinArtist)) ||
        normTitle.includes(normArabic(nArtistPart));

      if (hasTitlePart && hasArtistPart) {
        score += 1500; // Overwhelming priority for correct song by requested artist
      } else if (hasTitlePart && !hasArtistPart) {
        // Track has matching title but performed by a different, amateur or wedding cover artist
        if (/كفر|cover|أفراح|عازف|مهرجان|حفلة/i.test(combinedHaystack)) {
          score -= 500;
        }
      } else if (!hasTitlePart && !hasArtistPart) {
        // Completely unrelated result
        score -= 800;
      }
    }

    // 2. Token coverage
    const covQ = tokenCoverage(q, rawFullTitle, item.artist ?? "");
    const covClean = tokenCoverage(cleanQ, rawFullTitle, item.artist ?? "");
    const bestCov = Math.max(covQ, covClean);
    score += Math.round(bestCov * 80);

    if (bestCov >= 0.95) {
      score += 60;
    }

    // 3. Official Artist Verification (Artist channel or bilingual channel matches, or artist in title)
    if (artistPart) {
      if (normArt.includes(nArtistPart) || (latinArtist && rawArtLower.includes(latinArtist)) || normTitle.includes(nArtistPart) || normRawFull.includes(nArtistPart)) {
        score += 200;
      }
    } else {
      const qTokens = tokenize(cleanQ);
      if (qTokens.some(w => normArt.includes(w) || normTitle.includes(w))) {
        score += 45;
      }
    }

    // 4. Official Record Label / Production Channel boost
    const isOfficialLabel = /official|records|music|rotana|mazzika|sobky|elsobky|shaabeyat|شعبيات|نجوم|مزيكا|روتانا|السبكي|نغم|عالم الفن|free music|craft media|watary|sony music|universal|el adl group|العدل جروب|synergy|سينرجي/i.test(item.artist || "");
    if (isOfficialLabel) {
      score += 150;
    }

    // 5. Official badges in video title — boost official video clips, theme songs & master tracks to the top
    const isVideoClip = /كليب|فيديو\s*كليب|كليب\s*رسمي|official\s*(music\s*video|video|clip)|music\s*video/i.test(rawFullTitle);
    if (isVideoClip) {
      score += 600; // Strongest boost for official video clip
    }

    if (/official\s*(audio|lyric|video|clip|music\s*video)|كليب\s*رسمي|فيديو\s*كليب|النسخة\s*الأصلية|الأغنية\s*الرسمية|تتر\s*مسلسل|شارة\s*مسلسل|أغنية\s*مسلسل/i.test(rawFullTitle)) {
      score += 400;
    }

    // 6. View count bonus (millions of views distinguish real releases from 200-view fan uploads)
    const views = typeof item.views === "number" ? item.views : (typeof item.viewCount === "number" ? item.viewCount : 0);
    if (views > 1000000) {
      score += Math.min(150, Math.floor(Math.log10(views) * 20));
    }

    // 5b. Prioritize the official Music Video / Clip to always rank #1
    if (/فيديو\s*كليب|كليب\s*رسمي|official\s*(music\s*video|video|clip)|كليب\s*أصلي|كليب/i.test(item.title || "")) {
      score += 450;
    }

    // 6. Original master track prioritization (boost authentic songs over covers & trends)
    if (normTitle.includes(nq) && !/ترند|حظ|موال|دي جي|كفر|cover|افجر|شعبي/i.test(normTitle)) {
      score += 80;
    }

    // ─── STRICT NOISE & JUNK PENALTIES (Drop non-original / fan edits / street recordings) ───
    if (/افجر\s*احساس|شعبي\s*جديد|فرح\s*|بونبوناية|روقان/i.test(rawTitleLower)) {
      score -= 250;
    }
    // Derivative trends / TikTok cuts (demote derivative versions below the original)
    if (!q.includes("ترند") && !q.includes("trend") && /ترند|trend\b/i.test(rawTitleLower)) {
      score -= 130;
    }
    if (!q.includes("حظ") && /حظ\s*شعب/i.test(rawTitleLower)) {
      score -= 100;
    }
    if (!q.includes("موال") && /موال/i.test(rawTitleLower)) {
      score -= 80;
    }
    if (!q.includes("دي جي") && !q.includes("dj") && /\bdj\b|دي\s*جي/i.test(rawTitleLower)) {
      score -= 80;
    }
    if (!q.includes("عزف") && /عزف|جلسة\s*عود/i.test(rawTitleLower)) {
      score -= 100;
    }

    // Foreign translation / subtitles (e.g. [Indonesian Translation])
    if (!q.includes("ترجمة") && !q.includes("translation") &&
        /translation|ترجمة|مترجم|مترجمة|indonesian|spanish|turkish|english sub|subtitles/i.test(rawTitleLower)) {
      score -= 150;
    }

    // WhatsApp status / TikTok / Shorts cuts
    if (/حالة\s*واتس|ستوري|حالات|ستوريات|shorts|تيك\s*توك|tiktok/i.test(rawTitleLower)) {
      score -= 180;
    }

    // TV / Series fan scenes and dialogues (reject scene cuts, keep authentic soundtracks & theme songs!)
    if (/مشاهد\s*من|كليب\s*من\s*مسلسل|طبيب\s*البلدة|omer\s*ve\s*leyla|مشهد\s*من|كواليس|الحلقة\s*\d+|لحظة\s*(قبض|وفاة|مقتل|ضرب)|خناقة|مواجهة/i.test(rawTitleLower)) {
      if (!/تتر|شارة|غناء|أغنية|اغنية/i.test(rawTitleLower)) {
        score -= 220;
      }
    }

    // Fan audio mods: 8D, 3D, slowed, reverb, sped up
    if (!q.includes("8d") && !q.includes("ريمكس") && !q.includes("remix") &&
        /8d|3d|بطيء|مسرع|slowed|sped\s*up|reverb|ريمكس|remix|معدل|تعديل|bass\s*boosted/i.test(rawTitleLower)) {
      score -= 100;
    }

    // Karaoke, instrumental, fan covers
    if (!q.includes("كاريوكي") && !q.includes("لحن") &&
        /كاريوكي|لحن|موسيقى\s*فقط|بدون\s*(موسيقى|صوت)|instrumental|karaoke|backing\s*track|cover|كفر|بصوت|تقليد/i.test(rawTitleLower)) {
      score -= 150;
    }

    return Math.round(score);
  }

  // Filter YouTube junk
  const scoredYt = ytSongsRaw
    .filter((item: any) => !isJunkResult(item.title, item.artist))
    .filter((item: any) => !item.duration || (item.duration >= 40 && item.duration <= 55 * 60))
    .map((item: any) => {
      const extracted = extractSmartArtistAndTitle(item.title, item.artist);
      const songTitle = extracted.title || item.title;
      const songArtist = extracted.artist || item.artist || "فنان غير معروف";

      return {
        song: {
          songId: item.songId ?? item.videoId,
          title: songTitle,
          artist: songArtist,
          artistId: `yt-${songArtist}`,
          albumId: null,
          albumTitle: null,
          youtubeVideoId: item.youtubeVideoId ?? item.songId,
          thumbnailUrl: item.thumbnailUrl ?? null,
          source: "youtube",
        },
        score: computeRelevance(item),
        cov: Math.max(
          tokenCoverage(q, item.title ?? "", item.artist ?? ""),
          tokenCoverage(cleanQ, item.title ?? "", item.artist ?? "")
        ),
      };
    });

  // Score local catalog songs too
  const scoredLocal = localCatalog.map((song: any) => ({
    song,
    score: computeRelevance(song),
    cov: Math.max(tokenCoverage(q, song.title ?? "", song.artist ?? ""), tokenCoverage(cleanQ, song.title ?? "", song.artist ?? "")),
  })).filter((r: any) => r.score >= 50);

  // Merge both by true relevance score
  const allScored = [...scoredLocal, ...scoredYt];
  allScored.sort((a, b) => b.score - a.score);

  const seenVids = new Set<string>();
  const mergedSongs: any[] = [];
  for (const { song, score, cov } of allScored) {
    // Drop anything that was tagged as junk (negative score) or low relevance
    if (score <= 0 || (score < 35 && cov < 0.45)) continue;
    const vid = song.youtubeVideoId || song.songId;
    if (!vid || seenVids.has(vid)) continue;
    seenVids.add(vid);
    mergedSongs.push({ ...song, searchQuery: q });
    if (mergedSongs.length >= 25) break;
  }

  const nqLower = normArabic(q).toLowerCase();
  const cleanQLower = normArabic(cleanQ).toLowerCase();
  const nArtistPartLower = artistPart ? normArabic(artistPart).toLowerCase() : "";
  const nTitlePartLower = titlePart ? normArabic(titlePart).toLowerCase() : "";

  // Strictly filter artists so unrelated names never pollute the search
  const relevantArtists = ytArtistsAll.filter((a: any) => {
    const aName = normArabic(a.artistName || a.name || "").toLowerCase();
    if (!aName || aName === "فنان غير معروف" || aName === "فنان") return false;
    if (aName === nqLower || aName === cleanQLower || (nArtistPartLower && aName === nArtistPartLower)) return true;
    if (nqLower.includes(aName) || aName.includes(nqLower)) return true;
    if (nArtistPartLower && (aName.includes(nArtistPartLower) || nArtistPartLower.includes(aName))) return true;
    return tokenCoverage(cleanQ, a.artistName || "", "") >= 0.5;
  });

  // Strictly filter albums so random, completely unrelated albums (like Amr Diab Wayah when searching Ibrahim El Hakamy) are dropped
  const relevantAlbums = ytAlbumsAll.filter((al: any) => {
    const alTitle = normArabic(al.title || "").toLowerCase();
    const alArtist = normArabic(al.artist || al.artistName || "").toLowerCase();
    if (!alTitle) return false;
    const hay = `${alTitle} ${alArtist}`;
    if (hay.includes(nqLower) || hay.includes(cleanQLower)) return true;
    if (nArtistPartLower && alArtist.includes(nArtistPartLower)) {
      if (nTitlePartLower && (alTitle.includes(nTitlePartLower) || nTitlePartLower.includes(alTitle))) return true;
    }
    return tokenCoverage(cleanQ, al.title || "", al.artist || "") >= 0.55;
  });

  const result = {
    songs: mergedSongs,
    artists: relevantArtists.slice(0, 6).map((a: any) => ({
      artistId: a.artistId,
      artistName: a.artistName,
      thumbnailUrl: a.thumbnailUrl ?? null,
    })),
    albums: relevantAlbums.slice(0, 50).map((al: any) => ({
      albumId: al.albumId,
      title: al.title,
      artist: al.artist ?? al.artistName ?? "فنان غير معروف",
      thumbnailUrl: al.thumbnailUrl ?? null,
    })),
  };

  cache.set(q.toLowerCase(), { data: result, ts: Date.now() });

  // 🚀 Proactively trigger Telegram Bot download for the top matched song
  // Immediately sends: "نزل {title} {artist}" to Telegram channel so it's cached/ready on first click!
  if (result.songs.length > 0) {
    const top = result.songs[0];
    const topTitle = top.title || "";
    const topArtist = top.artist || "";
    const topVid = top.youtubeVideoId || top.songId;
    if (topTitle) {
      import("@/services/telegram/moonBotResolver")
        .then(({ resolveViaMoonBot }) => {
          resolveViaMoonBot({
            title: topTitle,
            artist: topArtist,
            videoId: topVid,
            forDownload: false,
          }).catch(() => {});
        })
        .catch(() => {});
    }
  }

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
