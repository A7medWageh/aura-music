import { searchYouTube, resolveStream } from "@apis/youtubei.js";

// ── In-memory cache shared across all requests in same process ----------------
const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 min

export async function smartSearch(searchTerm: string) {
  const q = searchTerm.trim();
  if (!q) return { songs: [], artists: [], albums: [] };

  // Cache hit – return instantly
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  // YouTube Music search (parallel in youtubei.js layer already)
  const ytResults = await searchYouTube(q);

  const result = {
    songs: ytResults.songs.map((item: any) => ({
      songId: item.songId ?? item.videoId,
      title: item.title,
      artist: item.artist ?? "فنان غير معروف",
      artistId: `yt-${item.artist ?? "unknown"}`,
      albumId: null,
      albumTitle: null,
      youtubeVideoId: item.youtubeVideoId ?? item.songId,
      thumbnailUrl: item.thumbnailUrl ?? null,
    })),
    artists: ytResults.artists.map((a: any) => ({
      artistId: a.artistId,
      artistName: a.artistName,
      thumbnailUrl: a.thumbnailUrl ?? null,
    })),
    albums: ytResults.albums.map((al: any) => ({
      albumId: al.albumId,
      title: al.title,
      artist: al.artist ?? al.artistName ?? "فنان غير معروف",
      thumbnailUrl: al.thumbnailUrl ?? null,
    })),
  };

  cache.set(q.toLowerCase(), { data: result, ts: Date.now() });

  // Background pre-fetch for top 3 results to make them "bullet fast"
  setTimeout(() => {
    result.songs.slice(0, 3).forEach((s: any) => {
       resolveStream(s.youtubeVideoId).catch(() => {});
    });
  }, 500);

  return result;
}
