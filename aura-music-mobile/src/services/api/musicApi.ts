import { Song, LyricsData } from "@/types/music";
import { getArtworkUrl } from "@/utils/media";
import { Platform } from "react-native";
import {
  curateHomeChart,
  dedupeSongs,
  isJunkSong,
  rankSearchSongs,
} from "@/services/api/curation";

export const BASE_API_URL = "https://aura-musiic.vercel.app";

// The `_t` query param already busts the cache. Sending Cache-Control/Pragma from a browser
// triggers a preflight that the server's Allow-Headers rejects, so it stays native-only.
function apiHeaders(): Record<string, string> {
  if (Platform.OS === "web") return { Accept: "application/json" };
  return {
    Accept: "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
}

interface SearchResponse {
  data?: {
    songs?: any[];
    artists?: any[];
    albums?: any[];
  };
}

function parseViewCount(value: any): number | undefined {
  if (typeof value === "number") return isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const match = value.replace(/[,\s]/g, "").match(/([\d.]+)([KMB])?/i);
  if (!match) return undefined;
  const amount = parseFloat(match[1]);
  if (!isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2]?.toUpperCase();
  const multiplier = unit === "B" ? 1e9 : unit === "M" ? 1e6 : unit === "K" ? 1e3 : 1;
  return Math.round(amount * multiplier);
}

function mapRawSongToSong(raw: any): Song {
  const songId = raw.songId || raw.id || raw.youtubeVideoId || `song_${Date.now()}`;
  const videoId = raw.youtubeVideoId || raw.videoId || raw.songId || raw.id || "";
  
  let durationSec = 0;
  if (typeof raw.duration === "number") {
    durationSec = raw.duration;
  } else if (typeof raw.duration === "string") {
    const parts = raw.duration.split(":").map(Number);
    if (parts.length === 2) {
      durationSec = (parts[0] || 0) * 60 + (parts[1] || 0);
    } else if (parts.length === 3) {
      durationSec = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
  }

  const rawThumb = raw.thumbnailUrl || raw.coverUrl || raw.thumbnail || "";
  const cleanThumb = getArtworkUrl(rawThumb, videoId, "song");

  return {
    id: songId,
    title: raw.title || "مقطع غير مسمى",
    artist: raw.artist || raw.artistName || "فنان غير معروف",
    youtubeVideoId: videoId,
    thumbnailUrl: cleanThumb ?? undefined,
    duration: durationSec,
    albumName: raw.albumName || raw.album || undefined,
    viewCount: parseViewCount(raw.views ?? raw.viewCount ?? raw.viewsCount),
  };
}

export const MusicApi = {
  /**
   * Search songs, artists, and albums
   */
  async search(query: string): Promise<{ songs: Song[]; artists: any[]; albums: any[] }> {
    try {
      const trimmed = query.trim();
      if (!trimmed) return { songs: [], artists: [], albums: [] };

      const res = await fetch(`${BASE_API_URL}/api/search?q=${encodeURIComponent(trimmed)}`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`Search failed: HTTP ${res.status}`);
      }

      const json: SearchResponse = await res.json();
      const rawSongs = json.data?.songs || [];
      const rawArtists = json.data?.artists || [];
      const rawAlbums = json.data?.albums || [];

      const cleanSongs = dedupeSongs(rawSongs.map(mapRawSongToSong)).filter((s) => !isJunkSong(s));
      const rankedSongs = rankSearchSongs(cleanSongs, trimmed);

      return {
        songs: rankedSongs,
        artists: rawArtists.map((a: any) => ({
          artistId: a.artistId || a.id || `art_${Math.random()}`,
          artistName: a.artistName || a.name || "فنان",
          thumbnailUrl: getArtworkUrl(a.thumbnailUrl || a.imageUrl || a.avatar, undefined, "artist"),
        })),
        albums: rawAlbums.map((al: any) => ({
          albumId: al.albumId || al.id || `alb_${Math.random()}`,
          title: al.title || al.albumTitle || "ألبوم",
          artist: al.artist || al.artistName || "فنان",
          thumbnailUrl: getArtworkUrl(al.thumbnailUrl || al.coverUrl, undefined, "album"),
        })),
      };
    } catch (err) {
      console.warn("[MusicApi.search] Error:", err);
      return { songs: [], artists: [], albums: [] };
    }
  },

  /**
   * Fetch Trending songs (always live, zero stale cache)
   */
  async getTrending(): Promise<Song[]> {
    const fromPopular = async () => {
      const popular = await this.getPopularSongs();
      return curateHomeChart(popular).slice(0, 30);
    };

    try {
      const timestamp = Date.now();
      const res = await fetch(`${BASE_API_URL}/api/discovery/trending?_t=${timestamp}`, {
        headers: apiHeaders(),
      });

      if (!res.ok) {
        // Fallback to /api/songs
        return fromPopular();
      }

      const json = await res.json();
      const list = json.data || (Array.isArray(json) ? json : []);
      if (!Array.isArray(list) || list.length === 0) return fromPopular();

      // Only official tracks by recognised artists reach the home page.
      const curated = curateHomeChart(list.map(mapRawSongToSong));
      if (curated.length >= 8) return curated.slice(0, 30);

      const topUp = await fromPopular();
      return dedupeSongs([...curated, ...topUp]).slice(0, 30);
    } catch {
      return fromPopular();
    }
  },

  /**
   * Fetch Live New Releases (real-time Arabic singles and albums)
   */
  async getNewReleases(): Promise<Song[]> {
    try {
      const timestamp = Date.now();
      const res = await fetch(`${BASE_API_URL}/api/discovery/new-releases?_t=${timestamp}`, {
        headers: apiHeaders(),
      });

      if (!res.ok) {
        return [];
      }

      const json = await res.json();
      const list = json.data || (Array.isArray(json) ? json : []);
      if (!Array.isArray(list) || list.length === 0) return [];

      return dedupeSongs(list.map(mapRawSongToSong)).filter((s) => !isJunkSong(s)).slice(0, 30);
    } catch (e) {
      console.warn("[MusicApi.getNewReleases] Error:", e);
      return [];
    }
  },

  /**
   * Fetch Popular / Fallback songs
   */
  async getPopularSongs(): Promise<Song[]> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/songs?_t=${Date.now()}`, {
        headers: apiHeaders(),
      });
      if (!res.ok) {
        const { CURATED_50_ARABIC_HITS } = require("@/data/curatedOfflineCatalog");
        return (CURATED_50_ARABIC_HITS || []).slice(0, 16).map(mapRawSongToSong);
      }
      const json = await res.json();
      const list = json.data || (Array.isArray(json) ? json : []);
      const clean = Array.isArray(list)
        ? dedupeSongs(list.map(mapRawSongToSong)).filter((s) => !isJunkSong(s))
        : [];
      if (clean.length > 0) return clean.slice(0, 16);
      const { CURATED_50_ARABIC_HITS } = require("@/data/curatedOfflineCatalog");
      return (CURATED_50_ARABIC_HITS || []).slice(0, 16).map(mapRawSongToSong);
    } catch {
      const { CURATED_50_ARABIC_HITS } = require("@/data/curatedOfflineCatalog");
      return (CURATED_50_ARABIC_HITS || []).slice(0, 16).map(mapRawSongToSong);
    }
  },

  /**
   * Fetch Curated Artists List (Egyptian & International)
   */
  async getArtists(): Promise<{ egyptian: any[]; intl: any[] }> {
    const fallback = require("@/data/artistsData.json");
    try {
      const res = await fetch(`${BASE_API_URL}/api/artists`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return fallback;
      const json = await res.json();
      if (json && (json.egyptian?.length > 0 || json.intl?.length > 0)) {
        return json;
      }
      return fallback;
    } catch {
      return fallback;
    }
  },

  /**
   * Fetch Artist detail by ID
   */
  async getArtist(id: string): Promise<any> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/artist/${encodeURIComponent(id)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data) {
        const heroImage = data.thumbnailUrl || data.artistImage;
        if (heroImage) {
          data.thumbnailUrl = getArtworkUrl(heroImage, undefined, "artist");
          data.artistImage = data.thumbnailUrl;
        }
        if (data.songs) {
          data.songs = data.songs.map(mapRawSongToSong);
        }
        if (data.newReleases && Array.isArray(data.newReleases)) {
          data.newReleases = data.newReleases.map((al: any) => ({
            ...al,
            thumbnailUrl: getArtworkUrl(al.thumbnailUrl || al.coverUrl, undefined, "album"),
          }));
        }
        if (data.oldAlbums && Array.isArray(data.oldAlbums)) {
          data.oldAlbums = data.oldAlbums.map((al: any) => ({
            ...al,
            thumbnailUrl: getArtworkUrl(al.thumbnailUrl || al.coverUrl, undefined, "album"),
          }));
        }
      }
      return data;
    } catch {
      return null;
    }
  },

  /**
   * Fetch Album detail by ID
   */
  async getAlbum(id: string): Promise<any> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/album/${encodeURIComponent(id)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const data = json.data || json;
      if (data) {
        if (data.thumbnailUrl || data.coverUrl) {
          data.thumbnailUrl = getArtworkUrl(data.thumbnailUrl || data.coverUrl, undefined, "album");
        }
        if (data.songs) {
          data.songs = data.songs.map(mapRawSongToSong);
        }
      }
      return data;
    } catch {
      return null;
    }
  },

  /**
   * Fetch Lyrics (plain and synced LRC)
   */
  async getLyrics(song: Song): Promise<LyricsData> {
    try {
      const params = new URLSearchParams({
        title: song.title,
        artist: song.artist,
        videoId: song.youtubeVideoId || song.id,
      });

      const res = await fetch(`${BASE_API_URL}/api/lyrics?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        return {
          songId: song.id,
          plainLyrics: null,
          syncedLyrics: null,
          source: "none",
        };
      }

      const json = await res.json();
      return {
        songId: song.id,
        plainLyrics: json.lyrics || null,
        syncedLyrics: json.syncedLyrics || null,
        source: json.source || "server",
      };
    } catch (e: any) {
      return {
        songId: song.id,
        plainLyrics: null,
        syncedLyrics: null,
        source: "error",
      };
    }
  },

  /**
   * Generate online streaming URL for audio player
   */
  getStreamUrl(song: Song): string {
    const videoId = song.youtubeVideoId || song.id;
    const params = new URLSearchParams({
      videoId,
      title: song.title,
      artist: song.artist,
      proxy: "true",
      _t: Date.now().toString(),
    });
    return `${BASE_API_URL}/api/ytdownload?${params.toString()}`;
  },

  /**
   * Resolve true, direct playable audio stream URL (with instant 320kbps Albumaty / Telegram CDN fallback)
   */
  async resolveAudioStreamUrl(song: Song): Promise<string> {
    if (song.audioUrl && (song.audioUrl.startsWith("http://") || song.audioUrl.startsWith("https://"))) {
      return song.audioUrl;
    }

    try {
      const params = new URLSearchParams({
        title: song.title,
        artist: song.artist || "",
      });
      const res = await fetch(`${BASE_API_URL}/api/resolve-youtube?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.streamUrl) {
          const finalUrl = data.streamUrl.startsWith("/")
            ? `${BASE_API_URL}${data.streamUrl}`
            : data.streamUrl;
          console.log(`[MusicApi] Resolved direct stream: ${finalUrl} (source: ${data.source})`);
          return finalUrl;
        }
      }
    } catch (err) {
      console.warn("[MusicApi] resolve-youtube error, falling back to stream endpoint:", err);
    }

    return this.getStreamUrl(song);
  },

  /**
   * Generate audio direct download URL for saving to local storage
   */
  getDownloadUrl(song: Song): string {
    const videoId = song.youtubeVideoId || song.id;
    const params = new URLSearchParams({
      videoId,
      title: song.title,
      artist: song.artist,
      proxy: "true",
      download: "true",
    });
    return `${BASE_API_URL}/api/ytdownload?${params.toString()}`;
  },

  /**
   * Fetch AI DJ queue for given mood
   */
  async getAiDj(moodId: string): Promise<Song[]> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/dj?mood=${encodeURIComponent(moodId)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        // Fallback to searching the mood
        const searchRes = await this.search(`${moodId} أغاني`);
        return searchRes.songs || [];
      }
      const json = await res.json();
      const list = json.data || (Array.isArray(json) ? json : []);
      if (Array.isArray(list) && list.length > 0) {
        return list.map(mapRawSongToSong);
      }
      const searchRes = await this.search(`${moodId} أغاني`);
      return searchRes.songs || [];
    } catch (e) {
      console.warn("[MusicApi.getAiDj] Error:", e);
      const searchRes = await this.search(`${moodId} أغاني`);
      return searchRes.songs || [];
    }
  },

  /**
   * Toggle like on backend
   */
  async toggleLike(songId: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/likes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data.liked);
    } catch {
      return false;
    }
  },

  /**
   * Get liked song IDs
   */
  async getLikes(): Promise<string[]> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/likes`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.songs) ? data.songs : [];
    } catch {
      return [];
    }
  },

  /**
   * Get current authenticated user profile
   */
  async getCurrentUser(): Promise<any> {
    try {
      const res = await fetch(`${BASE_API_URL}/api/auth/me`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.data?.user || data?.user || null;
    } catch {
      return null;
    }
  },
};

