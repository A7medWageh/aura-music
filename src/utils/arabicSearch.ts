/**
 * Smart Arabic Search Engine & Normalizer for Offline Music Library
 * 
 * Features:
 * - Full Arabic character normalization (Alef, Ta Marbouta, Ya, Hamzas, Persian variants).
 * - Diacritics (Tashkeel) and Tatweel (Kashida) stripping.
 * - Arabic noise/prefix stripping (اغنية, اغنيه, كلمات, تراك, فنان, البوم).
 * - Multi-token fuzzy and exact matching across titles, artists, albums, and lyrics.
 * - Lyrics snippet extraction with surrounding context for matched phrases.
 * - 100% offline with zero network dependency.
 */

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
    // Normalize Persian/Urdu letters if any (گ -> ك, چ -> ج, پ -> ب, ژ -> ز)
    .replace(/گ/g, "ك")
    .replace(/چ/g, "ج")
    .replace(/پ/g, "ب")
    .replace(/ژ/g, "ز")
    // Remove punctuation, brackets, quotes, dashes
    .replace(/["'«»()[\]{}.,\/#!$%\^&\*;:{}=\-_`~?؟]/g, " ")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts searchable search tokens from a raw user query,
 * automatically stripping colloquial Arabic query prefixes.
 */
export function extractSearchTokens(rawQuery: string): {
  normalizedQuery: string;
  cleanQuery: string;
  tokens: string[];
} {
  const normalizedQuery = normalizeArabic(rawQuery);
  if (!normalizedQuery) {
    return { normalizedQuery: "", cleanQuery: "", tokens: [] };
  }

  // Strip prefixes like: "اغنية", "اغنيه", "كلمات اغنية", "تراك", "فنان", "البوم", etc.
  const cleanQuery = normalizedQuery
    .replace(/^(اغنيه|اغنية|كلمات اغنية|كلمات اغنيه|كلمات|تراك|انشوده|انشودة|فنان|البوم|موسيقي|موسيقى|صوت)\s+/i, "")
    .trim();

  // Tokenize by word
  const words = cleanQuery.split(" ").filter((w) => w.length > 1);
  const tokenSet = new Set<string>();

  if (normalizedQuery) tokenSet.add(normalizedQuery);
  if (cleanQuery && cleanQuery !== normalizedQuery) tokenSet.add(cleanQuery);
  for (const w of words) tokenSet.add(w);

  return {
    normalizedQuery,
    cleanQuery: cleanQuery || normalizedQuery,
    tokens: Array.from(tokenSet),
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
  tokens: string[],
  maxLength = 75
): string | undefined {
  if (!lyricsText) return undefined;

  const normLyrics = normalizeArabic(lyricsText);
  if (!normLyrics) return undefined;

  // Search for the longest matching token first
  const searchCandidates = [targetQuery, ...tokens.sort((a, b) => b.length - a.length)];
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
  }

  if (matchIndex === -1) return undefined;

  // Find line or sentence boundaries in raw text
  const start = Math.max(0, matchIndex - Math.floor(maxLength / 2));
  const end = Math.min(lyricsText.length, matchIndex + matchedWord.length + Math.floor(maxLength / 2));

  let snippet = lyricsText.slice(start, end).replace(/\n+/g, " ").trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < lyricsText.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Smart Arabic offline search for songs.
 */
export function searchOfflineSongs<T extends { songId: string; title: string; artist: string; albumName?: string }>(
  songs: T[],
  lyricsMap: Map<string, string>,
  query: string,
  filterMode: "all" | "meta" | "lyrics" = "all"
): OfflineSearchResult<T>[] {
  const { normalizedQuery, cleanQuery, tokens } = extractSearchTokens(query);
  if (!normalizedQuery) return [];

  const results: OfflineSearchResult<T>[] = [];

  for (const song of songs) {
    const normTitle = normalizeArabic(song.title);
    const normArtist = normalizeArabic(song.artist);
    const normAlbum = normalizeArabic(song.albumName || "");
    const rawLyrics = lyricsMap.get(song.songId) || "";
    const normLyrics = normalizeArabic(rawLyrics);

    let score = 0;
    let matchedField: "title" | "artist" | "album" | "lyrics" = "title";
    let lyricsSnippet: string | undefined;

    // 1. Title Checks (Highest Priority)
    if (filterMode === "all" || filterMode === "meta") {
      if (normTitle === cleanQuery || normTitle === normalizedQuery) {
        score += 150;
        matchedField = "title";
      } else if (normTitle.startsWith(cleanQuery)) {
        score += 110;
        matchedField = "title";
      } else if (normTitle.includes(cleanQuery)) {
        score += 90;
        matchedField = "title";
      } else {
        // Check word tokens in title
        let titleTokenHits = 0;
        for (const token of tokens) {
          if (token.length > 1 && normTitle.includes(token)) {
            titleTokenHits++;
          }
        }
        if (titleTokenHits > 0) {
          score += 45 * titleTokenHits;
          matchedField = "title";
        }
      }

      // 2. Artist Checks
      if (normArtist.includes(cleanQuery)) {
        score += 70;
        if (score === 70) matchedField = "artist";
      } else {
        for (const token of tokens) {
          if (token.length > 2 && normArtist.includes(token)) {
            score += 30;
            if (matchedField === "title" && score <= 30) matchedField = "artist";
          }
        }
      }

      // 3. Album Checks
      if (normAlbum && normAlbum.includes(cleanQuery)) {
        score += 40;
        if (score === 40) matchedField = "album";
      }
    }

    // 4. Lyrics Checks (Offline Smart Lyrics Search)
    if ((filterMode === "all" || filterMode === "lyrics") && normLyrics) {
      if (normLyrics.includes(cleanQuery)) {
        score += 85;
        matchedField = "lyrics";
        lyricsSnippet = extractLyricsSnippet(rawLyrics, cleanQuery, tokens);
      } else {
        // Check token hits in lyrics
        let lyricsTokenHits = 0;
        for (const token of tokens) {
          if (token.length > 2 && normLyrics.includes(token)) {
            lyricsTokenHits++;
          }
        }
        if (lyricsTokenHits > 0) {
          score += 35 * lyricsTokenHits;
          matchedField = "lyrics";
          lyricsSnippet = extractLyricsSnippet(rawLyrics, cleanQuery, tokens);
        }
      }
    }

    if (score > 0) {
      results.push({
        item: song,
        score,
        matchedField,
        lyricsSnippet,
      });
    }
  }

  // Sort by highest relevance score
  return results.sort((a, b) => b.score - a.score);
}
