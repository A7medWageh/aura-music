import { latinizeArtist, normalizeArabicName } from "./latinize";

export function normalizeColloquialArabic(text?: string | null): string {
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

export function normalizeArabic(text?: string | null): string {
  if (!text) return "";
  return normalizeColloquialArabic(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/گ/g, "ك")
    .replace(/چ/g, "ج")
    .replace(/پ/g, "ب")
    .replace(/ژ/g, "ز")
    .replace(/["'«»()[\]{}.,\/#!$%\^&\*;:{}=\-_`~?؟\\|<>+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripSongNoise(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b(official|music|video|audio|lyric|lyrics|remix|hd|hq|mp3|4k|feat|ft)\b/gi, " ")
    .replace(/(فيديو كليب|كليب رسمي|نسخه اصليه|نسخة اصلية|نسخة أصلية|كامله|كاملة|حصريا|حصرياً|كلمات|بدون نت|ريمكس|تراك|اوديو)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripAlPrefix(word: string): string {
  if (word.startsWith("ال") && word.length > 3) {
    return word.slice(2);
  }
  return word;
}

export function wordsMatch(w1: string, w2: string): boolean {
  if (!w1 || !w2) return false;
  if (w1 === w2) return true;

  const b1 = stripAlPrefix(w1);
  const b2 = stripAlPrefix(w2);
  if (b1 === b2) return true;

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

export function extractSearchTokens(rawQuery: string): SearchTokens {
  const normalizedQuery = normalizeArabic(rawQuery);
  if (!normalizedQuery) {
    return { normalizedQuery: "", cleanQuery: "", words: [], baseWords: [] };
  }

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
  let snippet = lyricsText.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < lyricsText.length) snippet = snippet + "...";
  return snippet;
}

export function searchOfflineSongs<T extends { id: string; title: string; artist: string; albumName?: string; youtubeVideoId?: string }>(
  songs: T[],
  lyricsMap: Map<string, string>,
  query: string,
  filterMode: "all" | "meta" | "lyrics" = "all"
): OfflineSearchResult<T>[] {
  const rawClean = query.trim().toLowerCase();
  const { cleanQuery, words, baseWords } = extractSearchTokens(query);
  if (!cleanQuery && words.length === 0 && !rawClean) return [];

  const results: OfflineSearchResult<T>[] = [];
  const latinQuery = latinizeArtist(query).toLowerCase();

  for (const song of songs) {
    const rawTitle = song.title || "";
    const rawArtist = song.artist || "";
    const rawAlbum = song.albumName || "";

    const normTitle = normalizeArabic(stripSongNoise(rawTitle));
    const normArtist = normalizeArabic(rawArtist);
    const normAlbum = normalizeArabic(rawAlbum);

    const latinTitle = latinizeArtist(rawTitle).toLowerCase();
    const latinSongArtist = latinizeArtist(rawArtist).toLowerCase();

    // Support both song.id and song.youtubeVideoId for lyrics lookup
    const lyricsText =
      lyricsMap.get(song.id) ||
      (song.youtubeVideoId ? lyricsMap.get(song.youtubeVideoId) : "") ||
      "";
    const normLyrics = filterMode !== "meta" && lyricsText ? normalizeArabic(lyricsText) : "";

    let score = 0;
    let matchedField: "title" | "artist" | "album" | "lyrics" = "title";
    let lyricsSnippet: string | undefined = undefined;

    // 1. Meta matching (Title, Artist, Album)
    if (filterMode !== "lyrics") {
      // Exact title match in Arabic or Franco
      if (normTitle === cleanQuery || latinTitle === latinQuery || rawTitle.toLowerCase() === rawClean) {
        score += 200;
        matchedField = "title";
      } else if (
        (cleanQuery && normTitle.includes(cleanQuery)) ||
        (latinQuery.length >= 3 && latinTitle.includes(latinQuery)) ||
        rawTitle.toLowerCase().includes(rawClean)
      ) {
        score += 100;
        matchedField = "title";
      }

      // Artist match
      if (
        (cleanQuery && normArtist.includes(cleanQuery)) ||
        (latinQuery.length >= 3 && latinSongArtist.includes(latinQuery)) ||
        rawArtist.toLowerCase().includes(rawClean)
      ) {
        score += 70;
        if (score <= 70) matchedField = "artist";
      }

      // Album match
      if (cleanQuery && normAlbum.includes(cleanQuery)) {
        score += 40;
        if (score <= 40) matchedField = "album";
      }

      // Multi-word matching
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const bw = baseWords[i];
        if (normTitle.includes(w) || normTitle.includes(bw) || latinTitle.includes(w)) {
          score += 30;
        }
        if (normArtist.includes(w) || normArtist.includes(bw) || latinSongArtist.includes(w)) {
          score += 20;
        }
      }
    }

    // 2. Lyrics matching
    if (filterMode !== "meta" && (normLyrics || lyricsText)) {
      const cleanTarget = cleanQuery || rawClean;
      if (cleanTarget && (normLyrics.includes(cleanTarget) || lyricsText.toLowerCase().includes(cleanTarget))) {
        score += 90;
        matchedField = "lyrics";
        lyricsSnippet = extractLyricsSnippet(lyricsText, cleanTarget, words);
      } else {
        for (const w of words) {
          if (w.length >= 2 && (normLyrics.includes(w) || lyricsText.toLowerCase().includes(w))) {
            score += 25;
            if (!lyricsSnippet) {
              matchedField = "lyrics";
              lyricsSnippet = extractLyricsSnippet(lyricsText, w, words);
            }
          }
        }
      }
    }

    if (score > 0) {
      results.push({ item: song, score, matchedField, lyricsSnippet });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

