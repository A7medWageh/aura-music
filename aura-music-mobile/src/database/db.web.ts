import { Song, Playlist, LyricsData } from "@/types/music";

// In-memory fallback if localStorage is not accessible
const memStorage: Record<string, string> = {};

function getItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    /* ignore */
  }
  return memStorage[key] || null;
}

function setItem(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    /* ignore */
  }
  memStorage[key] = value;
}

// -------------------------------------------------------------
// Database mock for Web
// -------------------------------------------------------------
export async function getDatabase(): Promise<any> {
  return {
    execAsync: async () => {},
    runAsync: async () => {},
    getAllAsync: async () => [],
    getFirstAsync: async () => null,
  };
}

// Helpers to load/save collections
function getSongsMap(): Record<string, Song> {
  try {
    const raw = getItem("aura_songs");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSongsMap(map: Record<string, Song>): void {
  setItem("aura_songs", JSON.stringify(map));
}

function getFavoritesMap(): Record<string, number> {
  try {
    const raw = getItem("aura_favorites");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFavoritesMap(map: Record<string, number>): void {
  setItem("aura_favorites", JSON.stringify(map));
}

interface PlaylistRecord {
  playlist: Playlist;
  songIds: string[];
}

function getPlaylistsMap(): Record<string, PlaylistRecord> {
  try {
    const raw = getItem("aura_playlists");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePlaylistsMap(map: Record<string, PlaylistRecord>): void {
  setItem("aura_playlists", JSON.stringify(map));
}

function getLyricsMap(): Record<string, LyricsData> {
  try {
    const raw = getItem("aura_lyrics");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLyricsMap(map: Record<string, LyricsData>): void {
  setItem("aura_lyrics", JSON.stringify(map));
}

// -------------------------------------------------------------
// Songs & Offline Storage Operations
// -------------------------------------------------------------

export async function upsertSong(song: Song): Promise<void> {
  const songs = getSongsMap();
  const existing = songs[song.id] || {};
  songs[song.id] = {
    ...existing,
    ...song,
    duration: song.duration && song.duration > 0 ? song.duration : existing.duration || 0,
    playCount: existing.playCount || 0,
    lastPlayedAt: existing.lastPlayedAt,
  };
  saveSongsMap(songs);
}

export async function markSongDownloaded(
  songId: string,
  localFilePath: string,
  fileSize: number,
  localArtworkPath?: string
): Promise<void> {
  const songs = getSongsMap();
  if (songs[songId]) {
    songs[songId].isDownloaded = true;
    songs[songId].localFilePath = localFilePath;
    songs[songId].fileSize = fileSize;
    songs[songId].downloadedAt = Date.now();
    if (localArtworkPath) {
      songs[songId].localArtworkPath = localArtworkPath;
    }
    saveSongsMap(songs);
  }
}

export async function removeDownloadedSongRecord(songId: string): Promise<void> {
  const songs = getSongsMap();
  if (songs[songId]) {
    songs[songId].isDownloaded = false;
    delete songs[songId].localFilePath;
    delete songs[songId].fileSize;
    delete songs[songId].downloadedAt;
    saveSongsMap(songs);
  }
}

export async function getDownloadedSongs(): Promise<Song[]> {
  const songs = getSongsMap();
  return Object.values(songs)
    .filter((s) => s.isDownloaded)
    .sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
}

export async function getSongById(id: string): Promise<Song | null> {
  const songs = getSongsMap();
  return songs[id] || null;
}

export async function updateSongLastPlayed(songId: string): Promise<void> {
  const songs = getSongsMap();
  if (songs[songId]) {
    songs[songId].playCount = (songs[songId].playCount || 0) + 1;
    songs[songId].lastPlayedAt = Date.now();
    saveSongsMap(songs);
  }
}

export async function getRecentlyPlayedSongs(limit: number = 20): Promise<Song[]> {
  const songs = getSongsMap();
  return Object.values(songs)
    .filter((s) => s.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
    .slice(0, limit);
}

// -------------------------------------------------------------
// Favorites
// -------------------------------------------------------------

export async function toggleFavorite(song: Song): Promise<boolean> {
  await upsertSong(song);
  const favs = getFavoritesMap();
  if (favs[song.id]) {
    delete favs[song.id];
    saveFavoritesMap(favs);
    return false;
  } else {
    favs[song.id] = Date.now();
    saveFavoritesMap(favs);
    return true;
  }
}

export async function isFavorite(songId: string): Promise<boolean> {
  const favs = getFavoritesMap();
  return !!favs[songId];
}

export async function getFavoriteSongs(): Promise<Song[]> {
  const favs = getFavoritesMap();
  const songs = getSongsMap();
  const sortedIds = Object.keys(favs).sort((a, b) => (favs[b] || 0) - (favs[a] || 0));
  return sortedIds.map((id) => songs[id]).filter(Boolean);
}

export async function clearFavoriteSongs(): Promise<void> {
  saveFavoritesMap({});
}

// -------------------------------------------------------------
// Playlists
// -------------------------------------------------------------

export async function createPlaylist(name: string, description: string = ""): Promise<Playlist> {
  const playlists = getPlaylistsMap();
  const id = `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  const playlist: Playlist = {
    id,
    name,
    description,
    createdAt: now,
    updatedAt: now,
    songCount: 0,
  };
  playlists[id] = { playlist, songIds: [] };
  savePlaylistsMap(playlists);
  return playlist;
}

export async function getPlaylists(): Promise<Playlist[]> {
  const playlists = getPlaylistsMap();
  return Object.values(playlists)
    .map((p) => ({
      ...p.playlist,
      songCount: p.songIds.length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPlaylistWithSongs(
  playlistId: string
): Promise<{ playlist: Playlist; songs: Song[] } | null> {
  const playlists = getPlaylistsMap();
  const record = playlists[playlistId];
  if (!record) return null;

  const songs = getSongsMap();
  const songList = record.songIds.map((id) => songs[id]).filter(Boolean);

  return {
    playlist: {
      ...record.playlist,
      songCount: songList.length,
    },
    songs: songList,
  };
}

export async function addSongToPlaylist(playlistId: string, song: Song): Promise<void> {
  await upsertSong(song);
  const playlists = getPlaylistsMap();
  const record = playlists[playlistId];
  if (record) {
    if (!record.songIds.includes(song.id)) {
      record.songIds.push(song.id);
    }
    record.playlist.updatedAt = Date.now();
    record.playlist.songCount = record.songIds.length;
    savePlaylistsMap(playlists);
  }
}

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  const playlists = getPlaylistsMap();
  const record = playlists[playlistId];
  if (record) {
    record.songIds = record.songIds.filter((id) => id !== songId);
    record.playlist.updatedAt = Date.now();
    record.playlist.songCount = record.songIds.length;
    savePlaylistsMap(playlists);
  }
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const playlists = getPlaylistsMap();
  if (playlists[playlistId]) {
    delete playlists[playlistId];
    savePlaylistsMap(playlists);
  }
}

// -------------------------------------------------------------
// Lyrics Cache
// -------------------------------------------------------------

export async function saveLyrics(lyrics: LyricsData): Promise<void> {
  const map = getLyricsMap();
  map[lyrics.songId] = lyrics;
  saveLyricsMap(map);
}

export async function getCachedLyrics(songId: string): Promise<LyricsData | null> {
  const map = getLyricsMap();
  return map[songId] || null;
}

export async function getAllCachedLyricsMap(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    const map = getLyricsMap();
    for (const [id, data] of Object.entries(map)) {
      if (data?.plainLyrics) {
        result.set(id, data.plainLyrics);
      }
    }
  } catch {}
  return result;
}

// -------------------------------------------------------------
// Playback Session Persistence
// -------------------------------------------------------------

export async function savePlaybackSession(
  currentSongId: string | null,
  position: number,
  duration: number,
  repeatMode: string,
  shuffle: boolean,
  queue: Song[]
): Promise<void> {
  try {
    const session = {
      currentSongId,
      position,
      duration,
      repeatMode,
      shuffle,
      queue,
      updatedAt: Date.now(),
    };
    setItem("aura_playback_session", JSON.stringify(session));
  } catch (e) {
    console.warn("[savePlaybackSession Web] Failed to persist session", e);
  }
}

export async function loadPlaybackSession(): Promise<{
  currentSongId: string | null;
  position: number;
  duration: number;
  repeatMode: "off" | "one" | "all";
  shuffle: boolean;
  queue: Song[];
} | null> {
  try {
    const raw = getItem("aura_playback_session");
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      currentSongId: data.currentSongId || null,
      position: Number(data.position || 0),
      duration: Number(data.duration || 0),
      repeatMode: data.repeatMode || "off",
      shuffle: Boolean(data.shuffle),
      queue: Array.isArray(data.queue) ? data.queue : [],
    };
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Folder & Offline Organization Methods (Web)
// -------------------------------------------------------------

export async function toggleSongHidden(songId: string, isHidden: boolean): Promise<void> {
  const songs = getSongsMap();
  if (songs[songId]) {
    songs[songId].isHidden = isHidden;
    saveSongsMap(songs);
  }
}

export async function renameOfflineFolder(
  oldFolderName: string,
  newFolderName: string
): Promise<number> {
  const cleanOld = oldFolderName.trim();
  const cleanNew = newFolderName.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return 0;

  const songs = getSongsMap();
  let updated = 0;
  for (const id in songs) {
    const s = songs[id];
    const currentFolder = s.folderName || s.artist || "أخرى";
    if (currentFolder === cleanOld || s.artist === cleanOld) {
      s.folderName = cleanNew;
      updated++;
    }
  }
  saveSongsMap(songs);

  const custom = getCustomOfflineFolders();
  const nextCustom = custom.map((f) => (f === cleanOld ? cleanNew : f));
  setItem("aura_custom_folders", JSON.stringify([...new Set(nextCustom)]));
  return updated;
}

export async function moveSongToOfflineFolder(
  songId: string,
  targetFolderName: string
): Promise<boolean> {
  const clean = targetFolderName.trim();
  if (!songId || !clean) return false;
  const songs = getSongsMap();
  if (songs[songId]) {
    songs[songId].folderName = clean;
    saveSongsMap(songs);
    createCustomOfflineFolder(clean);
    return true;
  }
  return false;
}

export async function deleteOfflineFolder(
  folderName: string,
  deleteSongsToo: boolean = false
): Promise<void> {
  const clean = folderName.trim();
  if (!clean) return;
  const songs = getSongsMap();
  for (const id in songs) {
    const s = songs[id];
    const currentFolder = s.folderName || s.artist || "أخرى";
    if (currentFolder === clean) {
      if (deleteSongsToo) {
        delete songs[id];
      } else {
        s.folderName = "أخرى";
      }
    }
  }
  saveSongsMap(songs);

  const custom = getCustomOfflineFolders();
  const nextCustom = custom.filter((f) => f !== clean);
  setItem("aura_custom_folders", JSON.stringify(nextCustom));
}

export async function deleteArtist(artistName: string): Promise<void> {
  const clean = artistName.trim().toLowerCase();
  const songs = getSongsMap();
  for (const id in songs) {
    const s = songs[id];
    const curArtist = (s.artist || "").trim().toLowerCase();
    const curFolder = (s.folderName || "").trim().toLowerCase();
    if (curArtist === clean || curFolder === clean) {
      delete songs[id];
    }
  }
  saveSongsMap(songs);
}

export async function deleteAlbum(albumName: string, artistName?: string): Promise<void> {
  const songs = getSongsMap();
  for (const id in songs) {
    const s = songs[id];
    if (s.albumName === albumName) {
      if (!artistName || s.artist === artistName || s.folderName === artistName) {
        delete songs[id];
      }
    }
  }
  saveSongsMap(songs);
}

export async function deleteOfflineSong(songId: string): Promise<void> {
  const songs = getSongsMap();
  delete songs[songId];
  saveSongsMap(songs);
}

export function getCustomOfflineFolders(): string[] {
  try {
    const raw = getItem("aura_custom_folders");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function createCustomOfflineFolder(folderName: string): boolean {
  const clean = folderName.trim();
  if (!clean) return false;
  const current = getCustomOfflineFolders();
  if (!current.includes(clean)) {
    current.push(clean);
    setItem("aura_custom_folders", JSON.stringify(current));
    return true;
  }
  return false;
}


