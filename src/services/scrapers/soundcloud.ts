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
      timeout: 3500,
    });
    
    const html = htmlRes.data;
    const regex = /<script[^>]+src="([^">]+)"/g;
    let match;
    const urls: string[] = [];
    
    while ((match = regex.exec(html)) !== null) {
      if (match[1].includes(".js")) urls.push(match[1]);
    }

    // Iterate backwards through script URLs as vendor bundles are usually at the end
    for (const url of urls.reverse()) {
      try {
        const jsRes = await axios.get(url, { timeout: 3000 });
        const clientMatch = jsRes.data.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/);
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
    console.warn("[SoundCloud] Error extracting dynamic client_id:", err.message);
  }

  // Fallback to active verified client ID
  scClientIdCache = "tHVbSbDP4TaoMbPppngv6Tdry83vNbMQ";
  return scClientIdCache;
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
      timeout: 3500,
    });

    if (res.data?.collection && res.data.collection.length > 0) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "");
      const cleanSegments = cleanTitle.split(/[\|\-–—]/).map(s => s.trim()).filter(Boolean);
      const coreTarget = norm(cleanSegments[0] || cleanTitle);
      const artistWords = (artist || "")
        .split(/[\s,،&+|/\\]+/)
        .map(w => norm(w))
        .filter(w => w.length >= 3 && !["مع", "في", "من", "على"].includes(w));

      // Rank candidate tracks by matching title and artist
      const ranked = res.data.collection
        .map((t: any) => {
          const normTitle = norm(t.title || "");
          const normUser = norm(t.user?.username || "");
          let score = 0;

          if (coreTarget && normTitle.includes(coreTarget)) {
            score += 50;
            if (normTitle.startsWith(coreTarget) || normTitle === coreTarget) score += 40;
          }

          for (const w of artistWords) {
            if (normTitle.includes(w) || normUser.includes(w)) {
              score += 30;
            }
          }

          // Check if track has progressive (real MP3/AAC) audio
          const hasProg = t.media?.transcodings?.some((m: any) => m.format?.protocol === "progressive");
          if (hasProg) score += 30;

          return { track: t, score, hasProg };
        })
        .filter((item: any) => item.score >= 50)
        .sort((a: any, b: any) => b.score - a.score);

      for (const item of ranked) {
        const track = item.track;
        // ONLY accept progressive (direct MP3/AAC) streams
        // NEVER accept HLS .m3u8 playlists which cause silence in HTML5 <audio>
        const progressiveTrans = track.media?.transcodings?.find(
          (t: any) => t.format?.protocol === "progressive"
        );

        if (progressiveTrans) {
          try {
            const streamRes = await axios.get(progressiveTrans.url + `?client_id=${clientId}`, { timeout: 2500 });
            if (streamRes.data?.url && !streamRes.data.url.includes(".m3u8")) {
              console.log(`[SoundCloud] Resolved progressive stream for "${track.title}"`);
              return streamRes.data.url;
            }
          } catch {}
        }
      }
      console.log(`[SoundCloud] No candidate with progressive audio found for: ${query}`);
    } else {
      console.log(`[SoundCloud] No search results for: ${query}`);
    }
  } catch (err: any) {
    console.error(`[SoundCloud] Scrape error:`, err.message);
  }

  return null;
}
