import * as cheerio from "cheerio";
import { getRedisClient } from "../redis";

export interface ArabicScraperResult {
  url: string;
  directPlay: boolean;
  source: string;
  title: string;
}

const DNDNHA_BASE = "https://dndnha.cam";
const CACHE_TTL_SEC = 24 * 60 * 60; // 24 hours

export async function scrapeArabicSong(title: string, artist: string): Promise<ArabicScraperResult | null> {
  const query = `${title} ${artist}`.trim();
  const cacheKey = `aura:scraper:dndnha:${encodeURIComponent(query)}`;

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
    // 1. Search the song
    const searchUrl = `${DNDNHA_BASE}/search?q=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!searchRes.ok) return null;
    const html = await searchRes.text();
    const $ = cheerio.load(html);

    // Get first music link
    let firstSongHref = $('a[href*="/music/"]').first().attr('href');
    if (!firstSongHref) {
      return null;
    }

    // Ensure it's absolute
    if (firstSongHref.startsWith('/')) {
      firstSongHref = DNDNHA_BASE + firstSongHref;
    } else if (!firstSongHref.startsWith('http')) {
      return null;
    }

    // 2. Fetch the song page
    const songRes = await fetch(firstSongHref, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": searchUrl
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!songRes.ok) return null;
    const songHtml = await songRes.text();
    const $song = cheerio.load(songHtml);

    // Extract mp3 link
    // Dndnha usually has a direct download link ending in .mp3 or an <audio> tag
    let mp3Url = $song('a[href$=".mp3"]').first().attr('href');
    
    if (!mp3Url) {
       mp3Url = $song('audio source[src$=".mp3"]').first().attr('src');
    }
    
    if (!mp3Url) {
      // Sometimes it's just in a generic audio tag or specific download button class
      mp3Url = $song('audio').first().attr('src') || $song('.download-btn').attr('href');
    }

    // We only accept valid mp3 links or direct audio links
    if (!mp3Url || !mp3Url.includes('http')) {
      return null;
    }

    // Extract real title if possible
    const songTitle = $song('h1').text().trim() || title;

    const result: ArabicScraperResult = {
      url: mp3Url,
      directPlay: true,
      source: "dndnha",
      title: songTitle
    };

    try {
      const redis = getRedisClient();
      await redis.set(cacheKey, JSON.stringify(result), "EX", CACHE_TTL_SEC);
    } catch { /* ignore */ }

    return result;
  } catch (error) {
    console.error("[ArabicScraper] Failed to scrape:", error);
    return null;
  }
}
