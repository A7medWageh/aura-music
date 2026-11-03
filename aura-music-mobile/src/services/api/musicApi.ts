import { Song, LyricsData } from "@/types/music";
import { latinizeTitle, latinizeArtist } from "@/utils/latinize";
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
    let serverPlain: string | null = null;
    try {
      const params = new URLSearchParams({
        trackName: song.title,
        artistName: song.artist || "",
        title: song.title,
        artist: song.artist || "",
        videoId: song.youtubeVideoId || song.id,
        duration: String(Math.round(song.duration || 0)),
      });

      const res = await fetch(`${BASE_API_URL}/api/lyrics?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        const json = await res.json();
        if (json.syncedLyrics) {
          return {
            songId: song.id,
            plainLyrics: json.lyrics || null,
            syncedLyrics: json.syncedLyrics,
            source: json.source || "server",
          };
        }
        if (json.lyrics) {
          serverPlain = json.lyrics;
        }
      }
    } catch {}

    // Fallback directly to LRCLIB with bilingual translation
    try {
      const direct = await this.fetchDirectLrclib(song);
      if (direct?.syncedLyrics) {
        return direct;
      }
      if (direct?.plainLyrics && !serverPlain) {
        serverPlain = direct.plainLyrics;
      }
    } catch {}

    return {
      songId: song.id,
      plainLyrics: serverPlain,
      syncedLyrics: null,
      source: serverPlain ? "server" : "none",
    };
  },

  async fetchDirectLrclib(song: Song): Promise<LyricsData | null> {
    try {
      const latinTrack = latinizeTitle(song.title);
      const latinArtist = latinizeArtist(song.artist);
      const cleanTrack = (song.title || "")
        .replace(/\|.*$/g, "")
        .replace(/\(.*?\)/g, "")
        .replace(/\[.*?\]/g, "")
        .replace(/(official|music|video|audio|lyric|lyrics|visualizer|remastered|hd|4k)/gi, "")
        .trim();

      const queries = [
        `https://lrclib.net/api/get?track_name=${encodeURIComponent(latinTrack)}&artist_name=${encodeURIComponent(latinArtist)}`,
        `https://lrclib.net/api/search?q=${encodeURIComponent(`${latinTrack} ${latinArtist}`.trim())}`,
        `https://lrclib.net/api/search?q=${encodeURIComponent(latinTrack)}`,
        `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(song.artist || "")}`,
      ];

      for (const url of queries) {
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" },
          });
          if (res.ok) {
            const data = await res.json();
            const hit = Array.isArray(data) ? data.find((x: any) => x.syncedLyrics) || data[0] : data;
            if (hit?.syncedLyrics || hit?.plainLyrics) {
              return {
                songId: song.id,
                plainLyrics: hit.plainLyrics || null,
                syncedLyrics: hit.syncedLyrics || null,
                source: "lrclib-direct",
              };
            }
          }
        } catch {}
      }
    } catch {}
    return null;
  },

  /**
   * Generate online streaming URL for audio player
   * Always routed through /api/ytdownload?proxy=true with full HTTP 206 Range support,
   * proper inline disposition, iOS probe handling, and CDN edge caching.
   */
  getStreamUrl(song: Song): string {
    const videoId =
      song.youtubeVideoId && /^[a-zA-Z0-9_-]{11}$/.test(song.youtubeVideoId)
        ? song.youtubeVideoId
        : song.id && /^[a-zA-Z0-9_-]{11}$/.test(song.id)
        ? song.id
        : "";
    const params = new URLSearchParams({
      proxy: "true",
    });
    if (videoId) params.set("videoId", videoId);
    if (song.title) params.set("title", song.title);
    if (song.artist) params.set("artist", song.artist);
    return `${BASE_API_URL}/api/ytdownload?${params.toString()}`;
  },

  /**
   * Resolve true, direct playable audio stream URL.
   * Matches original website architecture: streams directly through /api/ytdownload?proxy=true
   * which delivers sub-50ms Telegram cache hits, valid Range headers, and no cross-origin/Referer breaks.
   */
  async resolveAudioStreamUrl(song: Song): Promise<string> {
    if (
      song.audioUrl &&
      (song.audioUrl.startsWith("http://") || song.audioUrl.startsWith("https://")) &&
      !song.audioUrl.includes("albumaty.com")
    ) {
      return song.audioUrl;
    }

    return this.getStreamUrl(song);
  },

  /**
   * Generate audio direct download URL for saving to local storage
   */
  getDownloadUrl(song: Song): string {
    const videoId =
      song.youtubeVideoId && /^[a-zA-Z0-9_-]{11}$/.test(song.youtubeVideoId)
        ? song.youtubeVideoId
        : song.id && /^[a-zA-Z0-9_-]{11}$/.test(song.id)
        ? song.id
        : "";
    const params = new URLSearchParams({
      proxy: "true",
      download: "true",
    });
    if (videoId) params.set("videoId", videoId);
    if (song.title) params.set("title", song.title);
    if (song.artist) params.set("artist", song.artist);
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

