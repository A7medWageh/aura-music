import axios from "axios";

/**
 * JioSaavn Scraper using open-source saavn.dev API.
 * Extremely fast and provides direct 320kbps streams.
 */
export async function resolveSaavnStream(title: string, artist: string): Promise<string | null> {
  try {
    // Clean title from extra text like (Official Video), (Live), etc.
    const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, "").trim();
    const query = `${artist} ${cleanTitle}`.trim();
    
    console.log(`[Saavn] Searching for: ${query}`);
    
    const searchUrl = `https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}`;
    const res = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 6000,
    });

    if (res.data?.success && res.data?.data?.results?.length > 0) {
      // Get the first result
      const track = res.data.data.results[0];
      console.log(`[Saavn] Found track: ${track.name} by ${track.primaryArtists}`);

      // We want the highest quality download url available
      if (track.downloadUrl && Array.isArray(track.downloadUrl)) {
        // usually format is [{quality: '12kbps', url: '...'}, ..., {quality: '320kbps', url: '...'}]
        // We'll sort by quality descending or just find '320kbps'
        const bestQuality = track.downloadUrl.find((d: any) => d.quality === '320kbps') 
                         || track.downloadUrl.find((d: any) => d.quality === '160kbps')
                         || track.downloadUrl[track.downloadUrl.length - 1]; // Fallback to last item

        if (bestQuality?.url) {
          console.log(`[Saavn] Stream resolved at quality: ${bestQuality.quality}`);
          return bestQuality.url;
        }
      }
    } else {
      console.log(`[Saavn] No search results for ${query}`);
    }
  } catch (err: any) {
    console.error(`[Saavn] Scrape error:`, err.message);
  }

  return null;
}
