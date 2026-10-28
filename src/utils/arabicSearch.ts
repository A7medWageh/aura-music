/**
 * Smart Arabic Search Engine & Normalizer for Offline Music Library
 * 
 * Features:
 * - Full Arabic character normalization (Alef variants, Ta Marbouta, Ya, Hamzas, Persian variants).
 * - Automatic stripping of colloquial prefixes (اغنية, اغنيه, كلمات, تراك, فنان, البوم).
 * - Noise word removal from titles (فيديو كليب, كليب رسمي, نسخة اصلية, كاملة, حصريا, official, etc.).
 * - Cross-field Title + Artist intelligence (e.g., "خلينى ذكرى وائل جسار" matches title + artist seamlessly).
 * - Definite article ("ال") invariance ("الجسار" <-> "جسار", "الذكرى" <-> "ذكرى").
 * - Transliteration & Canonical Artist awareness via getCanonicalArtistName.
 * - Strict multi-word precision filtering: suppresses loose 1-word lyric hits when a high-confidence target is found.
 * - Lyrics snippet extraction with context for true lyrics matches.
 * - 100% offline, zero network requests.
 */

import { getCanonicalArtistName } from "@/utils/artistNormalizer";

export function normalizeArabic(text?: string | null): string {
  if (!text) return "";
  return text
    .toLowerCase()
    // Remove diacritics / tashkeel
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, "")
    // Remove tatweel (kashida)
    .replace(/\u0640/g, "")
    // Normalize Alef variations (أ, إ, آ, ٱ -> ا)
    .replace(/[أإآٱ]/g, "ا")
    // Normalize Ta Marbouta (ة -> ه)
    .replace(/ة/g, "ه")
    // Normalize Ya and Alef Maksoura (ى, ي -> ي)
    .replace(/[ىي]/g, "ي")
    // Normalize Hamza on Waw / Ya (ؤ -> و, ئ -> ي)
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    // Remove standalone hamza (ء)
    .replace(/ء/g, "")
    // Normalize Persian/Urdu letters (گ -> ك, چ -> ج, پ -> ب, ژ -> ز)
    .replace(/گ/g, "ك")
    .replace(/چ/g, "ج")
    .replace(/پ/g, "ب")
    .replace(/ژ/g, "ز")
    // Remove punctuation, brackets, quotes, dashes, symbols
    .replace(/["'«»()[\]{}.,\/#!$%\^&\*;:{}=\-_`~?؟\\|<>+]/g, " ")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove common YouTube/distributor noise boilerplate from titles
 */
export function stripSongNoise(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b(official|music|video|audio|lyric|lyrics|remix|hd|hq|mp3|4k|feat|ft)\b/gi, " ")
    .replace(/(فيديو كليب|كليب رسمي|نسخه اصليه|نسخة اصلية|نسخة أصلية|كامله|كاملة|حصريا|حصرياً|كلمات|بدون نت|ريمكس|تراك|اوديو)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips the Arabic definite article "ال" if the word is long enough (e.g. "الجسار" -> "جسار", "الذكرى" -> "ذكري")
 */
export function stripAlPrefix(word: string): string {
  if (word.startsWith("ال") && word.length > 3) {
    return word.slice(2);
  }
  return word;
}

/**
 * Check if two Arabic words match, taking into account definite article "ال" and minor length variations
 */
export function wordsMatch(w1: string, w2: string): boolean {
  if (!w1 || !w2) return false;
  if (w1 === w2) return true;

  const b1 = stripAlPrefix(w1);
  const b2 = stripAlPrefix(w2);
  if (b1 === b2) return true;

  // Substring match for longer words (e.g., 4+ chars)
  if (b1.length >= 4 && b2.length >= 4) {
    if (b1.includes(b2) || b2.includes(b1)) return true;
  }

  return false;
}

export type SearchTokens = {
  normalizedQuery: string;
  cleanQuery: string;
  words: string[];
  baseWords: string[];
};

/**
 * Extracts searchable search tokens from a raw user query,
 * automatically stripping colloquial Arabic query prefixes.
 */
export function extractSearchTokens(rawQuery: string): SearchTokens {
  const normalizedQuery = normalizeArabic(rawQuery);
  if (!normalizedQuery) {
    return { normalizedQuery: "", cleanQuery: "", words: [], baseWords: [] };
  }

  // Strip prefixes like: "اغنية", "اغنيه", "كلمات اغنية", "تراك", "فنان", "البوم", etc.
  const cleanQuery = normalizedQuery
    .replace(/^(اغنيه|اغنية|كلمات اغنية|كلمات اغنيه|كلمات|تراك|انشوده|انشودة|فنان|البوم|موسيقي|موسيقى|صوت)\s+/i, "")
    .trim();

  const words = (cleanQuery || normalizedQuery)
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => w.length > 1);

  const baseWords = words.map(stripAlPrefix);

  return {
    normalizedQuery,
    cleanQuery: cleanQuery || normalizedQuery,
    words,
    baseWords,
  };
}

export type OfflineSearchResult<T> = {
  item: T;
  score: number;
  matchedField: "title" | "artist" | "album" | "lyrics";
  lyricsSnippet?: string;
};

/**
 * Finds a snippet of lyrics around the matched query word for displaying context.
 */
export function extractLyricsSnippet(
  lyricsText: string,
  targetQuery: string,
  words: string[],
  maxLength = 70
): string | undefined {
  if (!lyricsText) return undefined;

  const normLyrics = normalizeArabic(lyricsText);
  if (!normLyrics) return undefined;

  const searchCandidates = [
    targetQuery,
    ...words.filter((w) => w.length > 2).sort((a, b) => b.length - a.length),
  ];

  let matchIndex = -1;
  let matchedWord = "";

  for (const candidate of searchCandidates) {
    if (candidate.length < 2) continue;
    const idx = normLyrics.indexOf(candidate);
    if (idx !== -1) {
      matchIndex = idx;
      matchedWord = candidate;
      break;
    }
    // Also try without "ال"
    const noAl = stripAlPrefix(candidate);
    if (noAl !== candidate) {
      const idx2 = normLyrics.indexOf(noAl);
      if (idx2 !== -1) {
        matchIndex = idx2;
        matchedWord = noAl;
        break;
      }
    }
  }

  if (matchIndex === -1) return undefined;

  const start = Math.max(0, matchIndex - Math.floor(maxLength / 2));
  const end = Math.min(lyricsText.length, matchIndex + matchedWord.length + Math.floor(maxLength / 2));

  let snippet = lyricsText.slice(start, end).replace(/\n+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < lyricsText.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Ultra-Smart Arabic offline search for songs.
 * 
 * Supports:
 * - Multi-word title + artist searches ("خلينى ذكرى وائل جسار")
 * - Titles with or without noise ("خليني ذكرى (فيديو كليب)")
 * - Artists with canonical mapping ("وائل جسار" <-> "Wael Jassar")
 * - Smart multi-token precision filtering to return ONLY the exact targeted song.
 */
export function searchOfflineSongs<T extends { songId: string; title: string; artist: string; folderName?: string; albumName?: string }>(
  songs: T[],
  lyricsMap: Map<string, string>,
  query: string,
  filterMode: "all" | "meta" | "lyrics" = "all"
): OfflineSearchResult<T>[] {
  const { normalizedQuery, cleanQuery, words, baseWords } = extractSearchTokens(query);
  if (!normalizedQuery || words.length === 0) return [];

  const rawResults: OfflineSearchResult<T>[] = [];
  const queryWordCount = words.length;

  for (const song of songs) {
    const normTitle = normalizeArabic(song.title);
    const cleanTitle = stripSongNoise(normTitle);
    const normArtist = normalizeArabic(song.artist);
    const canonicalName = getCanonicalArtistName(song.folderName || song.artist || "");
    const normCanonical = normalizeArabic(canonicalName);
    const normFolder = normalizeArabic(song.folderName || "");
    const normAlbum = normalizeArabic(song.albumName || "");

    const rawLyrics = lyricsMap.get(song.songId) || "";
    const normLyrics = normalizeArabic(rawLyrics);

    // Composite metadata text for holistic multi-token phrase matching
    const metaCombined = `${normTitle} ${cleanTitle} ${normArtist} ${normCanonical} ${normFolder} ${normAlbum}`;
    const reverseCombined = `${normArtist} ${normCanonical} ${normTitle} ${cleanTitle}`;

    let score = 0;
    let matchedField: "title" | "artist" | "album" | "lyrics" = "title";
    let lyricsSnippet: string | undefined;

    // Track which query words were matched across title, artist, album, and lyrics
    const titleMatchedWordIndices = new Set<number>();
    const artistMatchedWordIndices = new Set<number>();
    const albumMatchedWordIndices = new Set<number>();
    const lyricsMatchedWordIndices = new Set<number>();

    // ─────────────────────────────────────────────────────────────
    // 1. HOLISTIC PHRASE & EXACT MATCHES (Top Priority)
    // ─────────────────────────────────────────────────────────────
    if (filterMode === "all" || filterMode === "meta") {
      // Perfect Exact Match on Title
      if (normTitle === cleanQuery || cleanTitle === cleanQuery || normTitle === normalizedQuery) {
        score += 1500;
        matchedField = "title";
      }
      // Exact Title Prefix
      else if (normTitle.startsWith(cleanQuery) || cleanTitle.startsWith(cleanQuery)) {
        score += 1200;
        matchedField = "title";
      }
      // Title Substring
      else if (normTitle.includes(cleanQuery) || cleanTitle.includes(cleanQuery)) {
        score += 950;
        matchedField = "title";
      }

      // Exact phrase match in combined metadata (e.g., "خليني ذكرى وائل جسار" or "وائل جسار خليني ذكرى")
      if (metaCombined.includes(cleanQuery) || reverseCombined.includes(cleanQuery)) {
        score += 1300;
        matchedField = "title";
      }

      // Exact Artist Match
      if (normArtist === cleanQuery || normCanonical === cleanQuery) {
        score += 1100;
        if (score === 1100) matchedField = "artist";
      } else if (normArtist.includes(cleanQuery) || normCanonical.includes(cleanQuery)) {
        score += 850;
        if (score === 850) matchedField = "artist";
      }

      // ─────────────────────────────────────────────────────────────
      // 2. TOKEN-LEVEL MATCHING ACROSS FIELDS
      // ─────────────────────────────────────────────────────────────
      const titleWords = cleanTitle.split(" ").concat(normTitle.split(" ")).filter((w) => w.length > 1);
      const artistWords = normArtist.split(" ").concat(normCanonical.split(" ")).filter((w) => w.length > 1);
      const albumWords = normAlbum.split(" ").filter((w) => w.length > 1);

      words.forEach((qWord, idx) => {
        const bWord = baseWords[idx];

        // Match against Title
        const matchesTitle =
          normTitle.includes(qWord) ||
          cleanTitle.includes(qWord) ||
          titleWords.some((tw) => wordsMatch(tw, qWord) || wordsMatch(tw, bWord));

        if (matchesTitle) {
          titleMatchedWordIndices.add(idx);
        }

        // Match against Artist / Canonical Name
        const matchesArtist =
          normArtist.includes(qWord) ||
          normCanonical.includes(qWord) ||
          artistWords.some((aw) => wordsMatch(aw, qWord) || wordsMatch(aw, bWord));

        if (matchesArtist) {
          artistMatchedWordIndices.add(idx);
        }

        // Match against Album
        if (normAlbum) {
          const matchesAlbum =
            normAlbum.includes(qWord) ||
            albumWords.some((albW) => wordsMatch(albW, qWord) || wordsMatch(albW, bWord));

          if (matchesAlbum) {
            albumMatchedWordIndices.add(idx);
          }
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. LYRICS MATCHING (Controlled & Context-Aware)
    // ─────────────────────────────────────────────────────────────
    if ((filterMode === "all" || filterMode === "lyrics") && normLyrics) {
      if (normLyrics.includes(cleanQuery)) {
        score += 700;
        matchedField = "lyrics";
        lyricsSnippet = extractLyricsSnippet(rawLyrics, cleanQuery, words);
      } else {
        words.forEach((qWord, idx) => {
          if (qWord.length >= 3) {
            const bWord = baseWords[idx];
            if (normLyrics.includes(qWord) || (bWord.length >= 3 && normLyrics.includes(bWord))) {
              lyricsMatchedWordIndices.add(idx);
            }
          }
        });

        // In multi-word query, lyrics must match at least 2 words or 50% of the query to avoid noise
        if (queryWordCount >= 2) {
          if (lyricsMatchedWordIndices.size >= Math.min(2, queryWordCount)) {
            score += 250 * (lyricsMatchedWordIndices.size / queryWordCount);
            if (score <= 500) matchedField = "lyrics";
            lyricsSnippet = extractLyricsSnippet(rawLyrics, cleanQuery, words);
          }
        } else if (lyricsMatchedWordIndices.size > 0) {
          score += 150;
          if (score <= 150) matchedField = "lyrics";
          lyricsSnippet = extractLyricsSnippet(rawLyrics, cleanQuery, words);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. MULTI-TOKEN SYNERGY & COVERAGE SCORING
    // ─────────────────────────────────────────────────────────────
    const allMetaMatchedIndices = new Set([
      ...Array.from(titleMatchedWordIndices),
      ...Array.from(artistMatchedWordIndices),
      ...Array.from(albumMatchedWordIndices),
    ]);

    const metaCoverageRatio = allMetaMatchedIndices.size / queryWordCount;

    // Cross-field Title + Artist bonus (e.g. "خليني ذكرى" in title + "وائل جسار" in artist)
    if (titleMatchedWordIndices.size > 0 && artistMatchedWordIndices.size > 0) {
      score += 900;
      score += (titleMatchedWordIndices.size + artistMatchedWordIndices.size) * 120;
      matchedField = "title";
    }

    // Full 100% Query Word Coverage in Metadata
    if (metaCoverageRatio === 1.0) {
      score += 800;
    } else if (metaCoverageRatio >= 0.75) {
      score += 450;
    } else if (metaCoverageRatio >= 0.5) {
      score += 200;
    }

    // Individual token hit contributions
    score += titleMatchedWordIndices.size * 140;
    score += artistMatchedWordIndices.size * 100;
    score += albumMatchedWordIndices.size * 40;

    // Suppress multi-word noise: if query has 3+ words, must match at least 2 distinct words
    if (queryWordCount >= 3 && allMetaMatchedIndices.size < 2 && lyricsMatchedWordIndices.size < 2) {
      score = 0;
    }

    // If query has 2 words and none matched in meta and only 1 weak word in lyrics, suppress
    if (queryWordCount === 2 && allMetaMatchedIndices.size === 0 && lyricsMatchedWordIndices.size < 2) {
      score = 0;
    }

    if (score > 0) {
      rawResults.push({
        item: song,
        score,
        matchedField,
        lyricsSnippet,
      });
    }
  }

  if (rawResults.length === 0) return [];

  // Sort by highest relevance score
  const sorted = rawResults.sort((a, b) => b.score - a.score);
  const topScore = sorted[0].score;

  // ─────────────────────────────────────────────────────────────
  // 5. ULTRA-SMART PRUNING ("وتطلع هي بس")
  // If the top match is high-confidence (score >= 900 or exact 100% match),
  // prune low-relevance background noise so only the true target(s) are shown.
  // ─────────────────────────────────────────────────────────────
  if (topScore >= 900 && sorted.length > 1) {
    const threshold = Math.max(topScore * 0.45, 600);
    const filtered = sorted.filter((r) => r.score >= threshold);
    return filtered.length > 0 ? filtered : [sorted[0]];
  }

  return sorted;
}
