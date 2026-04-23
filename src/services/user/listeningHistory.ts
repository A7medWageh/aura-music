/**
 * Listening History Service
 * Tracks every song the user plays and persists to localStorage + DB (when logged in).
 * Used for personalized recommendations.
 */

export type PlayRecord = {
  songId: string;
  youtubeVideoId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  playCount: number;
  lastPlayedAt: number;
};

const HISTORY_KEY = "aura-listening-history";
const MAX_RECORDS = 500;

export function getListeningHistory(): PlayRecord[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function trackPlay(song: {
  songId: string;
  youtubeVideoId?: string;
  title?: string;
  artist?: string;
  artistName?: string;
  thumbnailUrl?: string;
  metadata?: { thumbnailUrl?: string };
}) {
  if (!song.songId) return;
  try {
    const history = getListeningHistory();
    const existing = history.find(r => r.songId === song.songId);
    const thumb = song.thumbnailUrl || song.metadata?.thumbnailUrl || "";

    if (existing) {
      existing.playCount++;
      existing.lastPlayedAt = Date.now();
      existing.thumbnailUrl = thumb || existing.thumbnailUrl;
    } else {
      history.unshift({
        songId: song.songId,
        youtubeVideoId: song.youtubeVideoId || song.songId,
        title: song.title || "أغنية",
        artist: song.artist || song.artistName || "فنان",
        thumbnailUrl: thumb,
        playCount: 1,
        lastPlayedAt: Date.now(),
      });
    }

    // Keep sorted by recency, cap size
    const sorted = history.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, MAX_RECORDS);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sorted));
  } catch { /* silent */ }
}

export function getTopArtists(limit = 10): { artist: string; playCount: number }[] {
  const history = getListeningHistory();
  const map = new Map<string, number>();
  for (const r of history) {
    map.set(r.artist, (map.get(r.artist) || 0) + r.playCount);
  }
  return [...map.entries()]
    .map(([artist, playCount]) => ({ artist, playCount }))
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit);
}

export function getTopSongs(limit = 20): PlayRecord[] {
  return getListeningHistory()
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit);
}

export function getRecentSongs(limit = 20): PlayRecord[] {
  return getListeningHistory()
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
    .slice(0, limit);
}

export function getTotalStats() {
  const history = getListeningHistory();
  const totalPlays = history.reduce((sum, r) => sum + r.playCount, 0);
  const uniqueArtists = new Set(history.map(r => r.artist)).size;
  return { totalSongs: history.length, totalPlays, uniqueArtists };
}
