
import axios from "axios";
import * as cheerio from "cheerio";

function stripTashkeel(s: string): string {
  return s
    .replace(/[\u064B-\u065F\u0670]/g, "") // Remove Fatha, Damma, Kasra, Sukun, Tanween, Shadda, Dagger Alef
    .replace(/[إأآا]/g, "ا")
    .replace(/[يى]/g, "ي")
    .replace(/[ةه]/g, "ه")
    .trim();
}

/**
  * Albumaty Search & Resolve
 * Highly efficient direct MP3 scraper for Arabic music.
 */
export async function resolveAlbumatyStream(title: string, artist: string): Promise<string | null> {
  try {
    const norm = (s: string) => stripTashkeel(s).toLowerCase().replace(/[^\u0600-\u06FFa-z0-9]/g, "");

    // 1. Clean boilerplate terms that are not song names
    let clean = title
      .replace(/ريد\s*بُ?ل\s*مزيكا\s*صالونات/gi, "")
      .replace(/ريد\s*بُ?ل\s*سيكا/gi, "")
      .replace(/فيديو\s*كليب/gi, "")
      .replace(/كليب\s*رسمي/gi, "")
      .replace(/الأغنية\s*الرسمية/gi, "")
      .replace(/\(.*?\)|\[.*?\]/g, "")
      .trim();

    // Split on delimiters (| , - , etc.)
    const segments = clean.split(/[\|\-–—]/).map(s => s.trim()).filter(Boolean);
    const coreSong = segments[0] || clean;
    const normCore = norm(coreSong);

    if (!normCore || normCore.length < 2) return null;

    // Extract individual artist keyword tokens for scoring
    const artistWords = (artist || "")
      .split(/[\s,،&+|/\\]+/)
      .map(w => norm(w))
      .filter(w => w.length >= 3 && !["مع", "في", "من", "على"].includes(w));

    // Prepare search queries: try core song, and core song with artist
    const searchTerms: string[] = [coreSong];
    if (artist && artistWords.length > 0) {
      searchTerms.unshift(`${coreSong} ${artistWords[0]}`);
    }

    let songId: string | null = null;
    let $search: any = null;

    for (const term of searchTerms) {
      if (!term || term.length < 2) continue;
      console.log(`[Albumaty] Searching term: "${term}"...`);
      try {
        const searchRes = await axios.get(`https://www.albumaty.com/search.php?q=${encodeURIComponent(term)}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 3500,
        });
        $search = cheerio.load(searchRes.data);

        const candidates: { id: string; text: string; score: number }[] = [];

        $search('a[href*="/song/"]').each((i: number, el: any) => {
          const href = $search(el).attr("href");
          const text = $search(el).text().trim();
          if (!href) return;
          const match = href.match(/\/song\/(\d+)\.html/);
          if (!match) return;

          const normText = norm(text);

          // CANDIDATE MUST CONTAIN THE CORE SONG NAME!
          if (!normText.includes(normCore)) return;

          let score = 10;
          if (normText === normCore) {
            score += 100;
          } else if (normText.startsWith(normCore)) {
            score += 60; // Exact song name prefix (e.g. "خنقاني - مع سنور")
          }

          // Reward artist keywords
          let hasArtistMatch = false;
          for (const w of artistWords) {
            if (normText.includes(w)) {
              score += 50;
              hasArtistMatch = true;
            }
          }

          // If user specified artist, reject songs from different artists!
          if (artistWords.length > 0 && !hasArtistMatch && normText !== normCore) {
            return;
          }

          candidates.push({ id: match[1], text, score });
        });

        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          console.log(`[Albumaty] Best match for "${term}": "${candidates[0].text}" (score: ${candidates[0].score})`);
          songId = candidates[0].id;
          break;
        }
      } catch (e: any) {
        console.warn(`[Albumaty] Search for "${term}" error:`, e.message);
      }
    }

    if (!songId) {
      console.log(`[Albumaty] No song ID found for: ${title}`);
      return null;
    }

    const downloadPageUrl = `https://www.albumaty.com/download/${songId}`;
    console.log(`[Albumaty] Fetching download page: ${downloadPageUrl}...`);
    
    const downloadRes = await axios.get(downloadPageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      timeout: 5000,
    });

    const $dl = cheerio.load(downloadRes.data);
    
    // The download button is usually a .btn-success or similar
    let directLink = $dl('a.btn-success[href*=".mp3"]').attr("href") || $dl('a[href$=".mp3"]').attr("href");

    if (directLink) {
      if (directLink.startsWith("/")) directLink = `https://www.albumaty.com${directLink}`;
      console.log(`[Albumaty] Found direct link: ${directLink}`);
      return directLink;
    }

    return null;
  } catch (err: any) {
    console.error(`[Albumaty] Error resolving ${title}:`, err.message);
    return null;
  }
}
