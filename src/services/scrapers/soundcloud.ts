import axios from "axios";

/**
 * Cache the dynamically extracted client_id to avoid hitting the homepage repeatedly
 */
let scClientIdCache: string | null = null;

async function getSoundCloudClientId(): Promise<string | null> {
  if (scClientIdCache) return scClientIdCache;

  try {
    const htmlRes = await axios.get("https://soundcloud.com", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      timeout: 5000,
    });
    
    const html = htmlRes.data;
    const regex = /<script crossorigin src="([^"]+)"><\/script>/g;
    let match;
    
    // Fetch JS scripts to find the client_id
    while ((match = regex.exec(html)) !== null) {
      const src = match[1];
      try {
        const jsRes = await axios.get(src, { timeout: 3000 });
        const clientMatch = jsRes.data.match(/client_id:"([^"]+)"/);
        if (clientMatch) {
          scClientIdCache = clientMatch[1];
          console.log("[SoundCloud] Dynamically extracted client_id:", scClientIdCache);
          return scClientIdCache;
        }
      } catch (e) {
        // ignore individual script fetch errors
      }
    }
  } catch (err: any) {
    console.error("[SoundCloud] Error fetching client_id:", err.message);
  }

  return null;
}

/**
 * Highly robust SoundCloud scraper.
 * Searches for title + artist and extracts the stream URL (usually HLS .m3u8).
 */
export async function resolveSoundCloudStream(title: string, artist: string): Promise<string | null> {
  try {
    const clientId = await getSoundCloudClientId();
    if (!clientId) {
      console.log("[SoundCloud] No client ID available.");
      return null;
    }

    // Clean title for better search results
    const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, "").trim();
    const query = `${artist} ${cleanTitle}`.trim();
    
    console.log(`[SoundCloud] Searching for: ${query}`);
    
    const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=3`;
    const res = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 6000,
    });

    if (res.data?.collection && res.data.collection.length > 0) {
      // Find the best match or just take the first one
      const track = res.data.collection[0];
      console.log(`[SoundCloud] Found track: ${track.title} by ${track.user?.username}`);

      // Look for progressive (MP3/AAC) or HLS (m3u8) streams
      const trans = track.media?.transcodings?.find(
        (t: any) => t.format.protocol === "progressive" || t.format.protocol === "hls"
      );

      if (trans) {
        const streamRes = await axios.get(trans.url + `?client_id=${clientId}`, { timeout: 4000 });
        if (streamRes.data?.url) {
          console.log(`[SoundCloud] Stream resolved (${trans.format.protocol})`);
          return streamRes.data.url;
        }
      } else {
        console.log(`[SoundCloud] No suitable transcodings for ${track.title}`);
      }
    } else {
      console.log(`[SoundCloud] No search results for ${query}`);
    }
  } catch (err: any) {
    console.error(`[SoundCloud] Scrape error:`, err.message);
  }

  return null;
}
