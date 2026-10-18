import axios from "axios";

const JIOSAAVN_API = "https://www.jiosaavn.com/api.php";

export interface SaavnSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  thumbnailUrl: string;
  streamUrl: string;
  bitrate: string;
}

/**
 * Searches JioSaavn and resolves the best direct 320kbps/160kbps audio URL.
 * Mirrors the VenomMusic platform logic (JioSavan.py) directly in TypeScript.
 */
export async function resolveSaavnSong(query: string, artistFilter?: string): Promise<SaavnSong | null> {
  try {
    const cleanQ = query.replace(/\(.*?\)|\[.*?\]/g, "").trim();
    const searchQuery = artistFilter ? `${artistFilter} ${cleanQ}` : cleanQ;

    // 1. Search song via autocomplete
    const searchRes = await axios.get(JIOSAAVN_API, {
      params: {
        __call: "autocomplete.get",
        _format: "json",
        _marker: "0",
        ctx: "web6dot0",
        type: "song",
        limit: 5,
        query: searchQuery,
      },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      timeout: 3500,
    });

    let songs = searchRes.data?.songs?.data || [];
    if (!songs.length && artistFilter) {
      // Retry with title only
      const retryRes = await axios.get(JIOSAAVN_API, {
        params: {
          __call: "autocomplete.get",
          _format: "json",
          _marker: "0",
          ctx: "web6dot0",
          type: "song",
          limit: 5,
          query: cleanQ,
        },
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 3500,
      });
      songs = retryRes.data?.songs?.data || [];
    }

    // Verify title similarity: Must match closely, otherwise REJECT!
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "");
    const qNorm = norm(cleanQ);

    // Find the first candidate that actually matches the query
    const validCandidate = songs.find((s: any) => {
      const cNorm = norm(s.title || "");
      if (!cNorm || !qNorm) return false;

      // 1. If artistFilter is provided, verify artist match!
      if (artistFilter) {
        const aNorm = norm(artistFilter);
        const cArtist = norm(s.artist || s.more_info?.singers || s.more_info?.music || s.description || "");
        if (aNorm.length >= 3) {
          const aWords = artistFilter.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          const hasArtistWord = aWords.some(w => cArtist.includes(norm(w)));
          if (!hasArtistWord && !cArtist.includes(aNorm) && !aNorm.includes(cArtist)) {
            return false; // Reject candidate from wrong artist!
          }
        }
      }

      // 2. Title must match query
      if (cNorm === qNorm) return true;
      if (cNorm.startsWith(qNorm) || qNorm.startsWith(cNorm)) return true;

      // Word overlap
      const qWords = cleanQ.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const cWords = (s.title || "").toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      const overlap = qWords.filter(w => cWords.includes(w)).length;
      return overlap >= Math.max(1, qWords.length);
    });

    if (!validCandidate) {
      console.log(`[JioSaavn] No genuinely matching candidate found for "${cleanQ}". Rejecting to avoid wrong song.`);
      return null;
    }

    const candidate = validCandidate;
    const token = candidate.url ? candidate.url.split("/").filter(Boolean).pop() : candidate.id;
    if (!token) return null;

    // 2. Fetch full song details
    const detailsRes = await axios.get(JIOSAAVN_API, {
      params: {
        __call: "webapi.get",
        _format: "json",
        _marker: "0",
        ctx: "web6dot0",
        type: "song",
        token: token,
      },
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 3500,
    });

    const song = detailsRes.data?.songs?.[0];
    if (!song) return null;

    const encryptedUrl = song.encrypted_media_url || song.more_info?.encrypted_media_url;
    if (!encryptedUrl) return null;

    // 3. Generate auth token for direct 320kbps CDN URL (VenomMusic method)
    const authRes = await axios.post(
      `${JIOSAAVN_API}?__call=song.generateAuthToken&_format=json&bitrate=320`,
      `url=${encodeURIComponent(encryptedUrl)}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
        },
        timeout: 3500,
      }
    );

    const directStreamUrl = authRes.data?.auth_url;
    if (!directStreamUrl) return null;

    const image = song.image?.replace("150x150", "500x500") || candidate.image || "";

    return {
      id: song.id || token,
      title: song.song || candidate.title,
      artist: song.primary_artists || song.singers || candidate.description || "",
      album: song.album || "",
      durationSec: parseInt(song.duration || "0", 10),
      thumbnailUrl: image,
      streamUrl: directStreamUrl,
      bitrate: "320kbps",
    };
  } catch (err: any) {
    console.warn("[JioSaavn] Resolution failed:", err.message);
    return null;
  }
}
