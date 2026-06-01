import * as cheerio from "cheerio";
import { getRedisClient } from "../redis";

export interface ArabicScraperResult {
  url: string;
  directPlay: boolean;
  source: string;
  title: string;
}

const ALBUMATY_BASE = "https://www.albumaty.com";
const CACHE_TTL_SEC = 24 * 60 * 60; // 24 hours

export async function scrapeArabicSong(title: string, artist: string): Promise<ArabicScraperResult | null> {
  const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, "").trim();
  const query = `${artist} ${cleanTitle}`.trim();
  const cacheKey = `aura:scraper:albumaty:${encodeURIComponent(query)}`;

  try {
    const redis = getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn("Redis not available for scraper cache:", err);
  }

  try {
    console.log(`[ArabicScraper] Searching Albumaty for: "${query}"...`);
    
    // 1. Search the song on Albumaty
    const searchUrl = `${ALBUMATY_BASE}/search.php?q=${encodeURIComponent(query)}`;
    let searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!searchRes.ok) return null;
    let html = await searchRes.text();
    let $ = cheerio.load(html);

    // Find song ID in search results page
    const findId = ($page: cheerio.CheerioAPI): string | null => {
      let id: string | null = null;
      $page('a[href*="/song/"]').each((i: number, el: any) => {
        const href = $page(el).attr("href");
        if (href) {
          const match = href.match(/\/song\/(\d+)\.html/);
          if (match) {
            id = match[1];
            return false; // Break loop
          }
        }
      });
      return id;
    };

    let songId = findId($);

    // If no match, try title only (broad search)
    if (!songId && cleanTitle.length > 3) {
      console.log(`[ArabicScraper] No hit for artist+title, trying title only: "${cleanTitle}"`);
      const fallbackSearchUrl = `${ALBUMATY_BASE}/search.php?q=${encodeURIComponent(cleanTitle)}`;
      const fallbackSearchRes = await fetch(fallbackSearchUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6000)
      });
      if (fallbackSearchRes.ok) {
        const fallbackHtml = await fallbackSearchRes.text();
        const $fallback = cheerio.load(fallbackHtml);
        songId = findId($fallback);
      }
    }

    if (!songId) {
      console.log(`[ArabicScraper] No song ID found on Albumaty for query: "${query}"`);
      return null;
    }

    // 2. Fetch the download page
    const downloadPageUrl = `${ALBUMATY_BASE}/download/${songId}`;
    console.log(`[ArabicScraper] Fetching Albumaty download page: ${downloadPageUrl}...`);
    
    const downloadRes = await fetch(downloadPageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": searchUrl
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!downloadRes.ok) return null;
    const downloadHtml = await downloadRes.text();
    const $dl = cheerio.load(downloadHtml);

    // Extract direct MP3 link (usually in a green success button)
    let directLink = $dl('a.btn-success[href*=".mp3"]').attr("href");

    if (!directLink) {
      // Fallback: search for any .mp3 link or audio source
      directLink = $dl('a[href$=".mp3"]').attr("href") || 
                   $dl('audio source[src$=".mp3"]').attr("src") || 
                   $dl('audio').attr("src");
    }

    if (!directLink) {
      console.log(`[ArabicScraper] Direct MP3 link not found on page: ${downloadPageUrl}`);
      return null;
    }

    // Ensure the link is fully absolute to prevent the Vercel 404 relative URL buffering bug!
    if (directLink.startsWith("/")) {
      directLink = ALBUMATY_BASE + directLink;
    } else if (!directLink.startsWith("http")) {
      // If it doesn't start with http or /, it's invalid
      return null;
    }

    // Extract the song title from h1
    const songTitle = $dl('h1').text().trim() || title;

    const result: ArabicScraperResult = {
      url: directLink,
      directPlay: true,
      source: "albumaty",
      title: songTitle
    };

    console.log(`[ArabicScraper] Successfully resolved "${query}" to Albumaty MP3: ${directLink}`);

    // Cache the result in Redis
    try {
      const redis = getRedisClient();
      await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL_SEC);
    } catch { /* ignore */ }

    return result;
  } catch (error) {
    console.error("[ArabicScraper] Failed to scrape Arabic song:", error);
    return null;
  }
}
