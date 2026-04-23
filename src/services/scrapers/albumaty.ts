
import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Albumaty Search & Resolve
 * Highly efficient direct MP3 scraper for Arabic music.
 */
export async function resolveAlbumatyStream(title: string, artist: string): Promise<string | null> {
  try {
    // Clean title from (Official Video), (Live), etc.
    const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, "").trim();
    const query = `${artist} ${cleanTitle}`.trim();
    const searchUrl = `https://www.albumaty.com/search.php?q=${encodeURIComponent(query)}`;

    console.log(`[Albumaty] Searching for: ${query}...`);
    let searchRes = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 3000,
    });

    let $search = cheerio.load(searchRes.data);
    let songId: string | null = null;

    const findId = ($: any) => {
      let id: string | null = null;
      $('a[href*="/song/"]').each((i: number, el: any) => {
        const href = $(el).attr("href");
        if (href) {
          const match = href.match(/\/song\/(\d+)\.html/);
          if (match) { id = match[1]; return false; }
        }
      });
      return id;
    };

    songId = findId($search);

    // If no match, try title only (broad search)
    if (!songId && cleanTitle.length > 3) {
        console.log(`[Albumaty] No hit for artist+title, trying title only: ${cleanTitle}`);
        searchRes = await axios.get(`https://www.albumaty.com/search.php?q=${encodeURIComponent(cleanTitle)}`, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 3000,
        });
        $search = cheerio.load(searchRes.data);
        songId = findId($search);
    }

    if (!songId) {
      console.log(`[Albumaty] No song ID found for: ${query}`);
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
    const directLink = $dl('a.btn-success[href*=".mp3"]').attr("href");

    if (directLink) {
      console.log(`[Albumaty] Found direct link: ${directLink}`);
      return directLink;
    }

    return null;
  } catch (err: any) {
    console.error(`[Albumaty] Error resolving ${title}:`, err.message);
    return null;
  }
}
