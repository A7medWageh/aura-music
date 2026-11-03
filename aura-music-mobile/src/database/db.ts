import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";
import { Song, Playlist, LyricsData } from "@/types/music";
import { CURATED_50_ARABIC_HITS } from "@/data/curatedOfflineCatalog";

let dbInstance: SQLite.SQLiteDatabase | null = null;

// =============================================================
// Web LocalStorage In-Memory Storage Adapter
// =============================================================

const WEB_STORAGE_KEYS = {
  SONGS: "aura_mobile_songs",
  FAVORITES: "aura_mobile_favorites",
  PLAYLISTS: "aura_mobile_playlists",
  PLAYLIST_SONGS: "aura_mobile_playlist_songs",
  LYRICS: "aura_mobile_lyrics",
  PLAYBACK: "aura_mobile_playback_session",
  CUSTOM_FOLDERS: "aura_mobile_custom_folders",
};

function getWebStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined" || !window.localStorage) return defaultValue;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setWebStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[WebStorage] Failed to save key "${key}":`, err);
  }
}

// Auto-seed 50 Iconic Arabic Hits on Web if empty
function ensureWebInitialSeed(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const existing = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
  if (Object.keys(existing).length === 0) {
    const seededSongs: Record<string, Song> = {};
    const seededFolders: Set<string> = new Set();

    CURATED_50_ARABIC_HITS.forEach((item, index) => {
      if (item.folderName) seededFolders.add(item.folderName);
      seededSongs[item.songId] = {
        id: item.songId,
        title: item.title,
        artist: item.artist,
        youtubeVideoId: item.youtubeVideoId,
        thumbnailUrl: item.thumbnailUrl,
        duration: 240,
        albumName: item.albumName,
        folderName: item.folderName,
        streamUrl: `https://www.youtube.com/watch?v=${item.youtubeVideoId}`,
        isDownloaded: true,
        fileSize: 3600000,
        downloadedAt: Date.now() - index * 1000,
        playCount: 0,
        isHidden: false,
      };
    });

    setWebStorage(WEB_STORAGE_KEYS.SONGS, seededSongs);
    setWebStorage(WEB_STORAGE_KEYS.CUSTOM_FOLDERS, Array.from(seededFolders));
  }
}

if (Platform.OS === "web") {
  ensureWebInitialSeed();
}

// =============================================================
// Native SQLite Database Initialization
// =============================================================

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === "web") {
    return {
      execAsync: async () => {},
      runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
      getAllAsync: async () => [],
      getFirstAsync: async () => null,
    } as any;
  }
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync("aura_music.db");
    await initDatabaseSchema(dbInstance);
  }
  return dbInstance;
}

async function initDatabaseSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  if (Platform.OS !== "web") {
    try {
      await db.execAsync("PRAGMA journal_mode = WAL;");
    } catch {
      /* ignore on unsupported platforms */
    }
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      youtube_video_id TEXT,
      thumbnail_url TEXT,
      duration REAL DEFAULT 0,
      album_name TEXT,
      folder_name TEXT,
      is_hidden INTEGER DEFAULT 0,
      stream_url TEXT,
      is_downloaded INTEGER DEFAULT 0,
      local_file_path TEXT,
      local_artwork_path TEXT,
      file_size INTEGER DEFAULT 0,
      downloaded_at INTEGER,
      play_count INTEGER DEFAULT 0,
      last_played_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS favorites (
      song_id TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cover_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, song_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lyrics (
      song_id TEXT PRIMARY KEY,
      plain_lyrics TEXT,
      synced_lyrics TEXT,
      source TEXT,
      cached_at INTEGER NOT NULL,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playback_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_song_id TEXT,
      position REAL DEFAULT 0,
      duration REAL DEFAULT 0,
      repeat_mode TEXT DEFAULT 'off',
      shuffle INTEGER DEFAULT 0,
      queue_json TEXT,
      updated_at INTEGER
    );
  `);

  // Safe columns migration for older SQLite versions
  try {
    await db.execAsync(`ALTER TABLE songs ADD COLUMN folder_name TEXT;`);
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE songs ADD COLUMN is_hidden INTEGER DEFAULT 0;`);
  } catch {}
}

// -------------------------------------------------------------
// Songs & Offline Storage Operations
// -------------------------------------------------------------

export async function upsertSong(song: Song): Promise<void> {
  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    const existing = songs[song.id] || {};
    songs[song.id] = {
      ...existing,
      ...song,
      id: song.id,
      title: song.title || existing.title || "بدون عنوان",
      artist: song.artist || existing.artist || "فنان",
      youtubeVideoId: song.youtubeVideoId ?? existing.youtubeVideoId,
      thumbnailUrl: song.thumbnailUrl ?? existing.thumbnailUrl,
      duration: song.duration && song.duration > 0 ? song.duration : existing.duration || 0,
      albumName: song.albumName ?? existing.albumName,
      folderName: song.folderName ?? existing.folderName,
      isHidden: song.isHidden !== undefined ? song.isHidden : existing.isHidden || false,
      streamUrl: song.streamUrl ?? existing.streamUrl,
      isDownloaded: song.isDownloaded !== undefined ? song.isDownloaded : existing.isDownloaded || false,
      localFilePath: song.localFilePath ?? existing.localFilePath,
      localArtworkPath: song.localArtworkPath ?? existing.localArtworkPath,
      fileSize: song.fileSize && song.fileSize > 0 ? song.fileSize : existing.fileSize || 0,
      downloadedAt: song.downloadedAt ?? existing.downloadedAt,
      playCount: song.playCount !== undefined ? song.playCount : existing.playCount || 0,
      lastPlayedAt: song.lastPlayedAt ?? existing.lastPlayedAt,
    };
    setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO songs (
      id, title, artist, youtube_video_id, thumbnail_url,
      duration, album_name, folder_name, is_hidden, stream_url, is_downloaded,
      local_file_path, local_artwork_path, file_size, downloaded_at,
      play_count, last_played_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      youtube_video_id = COALESCE(excluded.youtube_video_id, songs.youtube_video_id),
      thumbnail_url = COALESCE(excluded.thumbnail_url, songs.thumbnail_url),
      duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE songs.duration END,
      album_name = COALESCE(excluded.album_name, songs.album_name),
      folder_name = COALESCE(excluded.folder_name, songs.folder_name),
      is_hidden = COALESCE(excluded.is_hidden, songs.is_hidden),
      is_downloaded = CASE WHEN excluded.is_downloaded IS NOT NULL THEN excluded.is_downloaded ELSE songs.is_downloaded END,
      local_file_path = COALESCE(excluded.local_file_path, songs.local_file_path),
      local_artwork_path = COALESCE(excluded.local_artwork_path, songs.local_artwork_path),
      file_size = CASE WHEN excluded.file_size > 0 THEN excluded.file_size ELSE songs.file_size END,
      downloaded_at = COALESCE(excluded.downloaded_at, songs.downloaded_at);`,
    song.id,
    song.title,
    song.artist,
    song.youtubeVideoId || "",
    song.thumbnailUrl || "",
    song.duration || 0,
    song.albumName || null,
    song.folderName || null,
    song.isHidden ? 1 : 0,
    song.streamUrl || null,
    song.isDownloaded ? 1 : 0,
    song.localFilePath || null,
    song.localArtworkPath || null,
    song.fileSize || 0,
    song.downloadedAt || null,
    song.playCount || 0,
    song.lastPlayedAt || null
  );
}

export async function markSongDownloaded(
  songId: string,
  localFilePath: string,
  fileSize: number,
  localArtworkPath?: string
): Promise<void> {
  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    if (songs[songId]) {
      songs[songId].isDownloaded = true;
      songs[songId].localFilePath = localFilePath;
      songs[songId].fileSize = fileSize;
      if (localArtworkPath) songs[songId].localArtworkPath = localArtworkPath;
      songs[songId].downloadedAt = Date.now();
      setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);
    }
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE songs SET
      is_downloaded = 1,
      local_file_path = ?,
      local_artwork_path = COALESCE(?, local_artwork_path),
      file_size = ?,
      downloaded_at = ?
    WHERE id = ?`,
    localFilePath,
    localArtworkPath || null,
    fileSize,
    Date.now(),
    songId
  );
}

export async function removeDownloadedSongRecord(songId: string): Promise<void> {
  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    if (songs[songId]) {
      songs[songId].isDownloaded = false;
      songs[songId].localFilePath = undefined;
      songs[songId].fileSize = 0;
      songs[songId].downloadedAt = undefined;
      setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);
    }
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE songs SET
      is_downloaded = 0,
      local_file_path = NULL,
      file_size = 0,
      downloaded_at = NULL
    WHERE id = ?`,
    songId
  );
}

export async function getDownloadedSongs(): Promise<Song[]> {
  if (Platform.OS === "web") {
    ensureWebInitialSeed();
    const songsMap = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    return Object.values(songsMap)
      .filter((s) => s.isDownloaded)
      .sort((a, b) => (b.downloadedAt || 0) - (a.downloadedAt || 0));
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM songs WHERE is_downloaded = 1 ORDER BY downloaded_at DESC`
  );
  return rows.map(mapRowToSong);
}

export async function getSongById(id: string): Promise<Song | null> {
  if (Platform.OS === "web") {
    const songsMap = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    return songsMap[id] || null;
  }

  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(`SELECT * FROM songs WHERE id = ?`, id);
  return row ? mapRowToSong(row) : null;
}

export async function updateSongLastPlayed(songId: string): Promise<void> {
  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    if (songs[songId]) {
      songs[songId].playCount = (songs[songId].playCount || 0) + 1;
      songs[songId].lastPlayedAt = Date.now();
      setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);
    }
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE songs SET
      play_count = play_count + 1,
      last_played_at = ?
    WHERE id = ?`,
    Date.now(),
    songId
  );
}

export async function getRecentlyPlayedSongs(limit: number = 20): Promise<Song[]> {
  if (Platform.OS === "web") {
    const songsMap = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    return Object.values(songsMap)
      .filter((s) => s.lastPlayedAt !== undefined)
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
      .slice(0, limit);
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM songs WHERE last_played_at IS NOT NULL ORDER BY last_played_at DESC LIMIT ?`,
    limit
  );
  return rows.map(mapRowToSong);
}

// -------------------------------------------------------------
// Favorites
// -------------------------------------------------------------

export async function toggleFavorite(song: Song): Promise<boolean> {
  if (Platform.OS === "web") {
    await upsertSong(song);
    const favs = getWebStorage<Record<string, number>>(WEB_STORAGE_KEYS.FAVORITES, {});
    const exists = !!favs[song.id];
    if (exists) {
      delete favs[song.id];
      setWebStorage(WEB_STORAGE_KEYS.FAVORITES, favs);
      return false;
    } else {
      favs[song.id] = Date.now();
      setWebStorage(WEB_STORAGE_KEYS.FAVORITES, favs);
      return true;
    }
  }

  const db = await getDatabase();
  await upsertSong(song);

  const existing = await db.getFirstAsync<any>(
    `SELECT song_id FROM favorites WHERE song_id = ?`,
    song.id
  );

  if (existing) {
    await db.runAsync(`DELETE FROM favorites WHERE song_id = ?`, song.id);
    return false;
  } else {
    await db.runAsync(
      `INSERT INTO favorites (song_id, added_at) VALUES (?, ?)`,
      song.id,
      Date.now()
    );
    return true;
  }
}

export async function isFavorite(songId: string): Promise<boolean> {
  if (Platform.OS === "web") {
    const favs = getWebStorage<Record<string, number>>(WEB_STORAGE_KEYS.FAVORITES, {});
    return !!favs[songId];
  }

  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT song_id FROM favorites WHERE song_id = ?`,
    songId
  );
  return !!row;
}

export async function getFavoriteSongs(): Promise<Song[]> {
  if (Platform.OS === "web") {
    const favs = getWebStorage<Record<string, number>>(WEB_STORAGE_KEYS.FAVORITES, {});
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    return Object.keys(favs)
      .map((id) => songs[id])
      .filter(Boolean)
      .sort((a, b) => (favs[b.id] || 0) - (favs[a.id] || 0));
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT s.* FROM songs s
     INNER JOIN favorites f ON s.id = f.song_id
     ORDER BY f.added_at DESC`
  );
  return rows.map(mapRowToSong);
}

export async function clearFavoriteSongs(): Promise<void> {
  if (Platform.OS === "web") {
    setWebStorage(WEB_STORAGE_KEYS.FAVORITES, {});
    return;
  }

  const db = await getDatabase();
  await db.runAsync(`DELETE FROM favorites`);
}

// -------------------------------------------------------------
// Playlists
// -------------------------------------------------------------

export async function createPlaylist(name: string, description: string = ""): Promise<Playlist> {
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

  if (Platform.OS === "web") {
    const list = getWebStorage<Playlist[]>(WEB_STORAGE_KEYS.PLAYLISTS, []);
    list.unshift(playlist);
    setWebStorage(WEB_STORAGE_KEYS.PLAYLISTS, list);
    return playlist;
  }

  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO playlists (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    id,
    name,
    description,
    now,
    now
  );

  return playlist;
}

export async function getPlaylists(): Promise<Playlist[]> {
  if (Platform.OS === "web") {
    return getWebStorage<Playlist[]>(WEB_STORAGE_KEYS.PLAYLISTS, []);
  }

  const db = await getDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT p.*, COUNT(ps.song_id) as song_count
     FROM playlists p
     LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
     GROUP BY p.id
     ORDER BY p.updated_at DESC`
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    coverUrl: r.cover_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    songCount: Number(r.song_count || 0),
  }));
}

export async function getPlaylistWithSongs(
  playlistId: string
): Promise<{ playlist: Playlist; songs: Song[] } | null> {
  if (Platform.OS === "web") {
    const playlists = getWebStorage<Playlist[]>(WEB_STORAGE_KEYS.PLAYLISTS, []);
    const playlist = playlists.find((p) => p.id === playlistId);
    if (!playlist) return null;

    const relMap = getWebStorage<Record<string, string[]>>(WEB_STORAGE_KEYS.PLAYLIST_SONGS, {});
    const songIds = relMap[playlistId] || [];
    const songsMap = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    const songs = songIds.map((id) => songsMap[id]).filter(Boolean);

    return {
      playlist: { ...playlist, songCount: songs.length },
      songs,
    };
  }

  const db = await getDatabase();
  const plRow = await db.getFirstAsync<any>(`SELECT * FROM playlists WHERE id = ?`, playlistId);
  if (!plRow) return null;

  const songRows = await db.getAllAsync<any>(
    `SELECT s.* FROM songs s
     INNER JOIN playlist_songs ps ON s.id = ps.song_id
     WHERE ps.playlist_id = ?
     ORDER BY ps.position ASC`,
    playlistId
  );

  const playlist: Playlist = {
    id: plRow.id,
    name: plRow.name,
    description: plRow.description,
    coverUrl: plRow.cover_url,
    createdAt: plRow.created_at,
    updatedAt: plRow.updated_at,
    songCount: songRows.length,
  };

  return {
    playlist,
    songs: songRows.map(mapRowToSong),
  };
}

export async function addSongToPlaylist(playlistId: string, song: Song): Promise<void> {
  await upsertSong(song);

  if (Platform.OS === "web") {
    const relMap = getWebStorage<Record<string, string[]>>(WEB_STORAGE_KEYS.PLAYLIST_SONGS, {});
    const list = relMap[playlistId] || [];
    if (!list.includes(song.id)) {
      list.push(song.id);
      relMap[playlistId] = list;
      setWebStorage(WEB_STORAGE_KEYS.PLAYLIST_SONGS, relMap);
    }
    return;
  }

  const db = await getDatabase();
  const maxPosRow = await db.getFirstAsync<any>(
    `SELECT MAX(position) as max_pos FROM playlist_songs WHERE playlist_id = ?`,
    playlistId
  );
  const nextPos = (maxPosRow?.max_pos ?? -1) + 1;

  await db.runAsync(
    `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position, added_at)
     VALUES (?, ?, ?, ?)`,
    playlistId,
    song.id,
    nextPos,
    Date.now()
  );

  await db.runAsync(
    `UPDATE playlists SET updated_at = ? WHERE id = ?`,
    Date.now(),
    playlistId
  );
}

export async function removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
  if (Platform.OS === "web") {
    const relMap = getWebStorage<Record<string, string[]>>(WEB_STORAGE_KEYS.PLAYLIST_SONGS, {});
    if (relMap[playlistId]) {
      relMap[playlistId] = relMap[playlistId].filter((id) => id !== songId);
      setWebStorage(WEB_STORAGE_KEYS.PLAYLIST_SONGS, relMap);
    }
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?`,
    playlistId,
    songId
  );
  await db.runAsync(
    `UPDATE playlists SET updated_at = ? WHERE id = ?`,
    Date.now(),
    playlistId
  );
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  if (Platform.OS === "web") {
    const list = getWebStorage<Playlist[]>(WEB_STORAGE_KEYS.PLAYLISTS, []);
    setWebStorage(
      WEB_STORAGE_KEYS.PLAYLISTS,
      list.filter((p) => p.id !== playlistId)
    );
    const relMap = getWebStorage<Record<string, string[]>>(WEB_STORAGE_KEYS.PLAYLIST_SONGS, {});
    delete relMap[playlistId];
    setWebStorage(WEB_STORAGE_KEYS.PLAYLIST_SONGS, relMap);
    return;
  }

  const db = await getDatabase();
  await db.runAsync(`DELETE FROM playlists WHERE id = ?`, playlistId);
}

// -------------------------------------------------------------
// Lyrics Cache
// -------------------------------------------------------------

export async function saveLyrics(lyrics: LyricsData): Promise<void> {
  if (Platform.OS === "web") {
    const lyricsMap = getWebStorage<Record<string, LyricsData>>(WEB_STORAGE_KEYS.LYRICS, {});
    lyricsMap[lyrics.songId] = lyrics;
    setWebStorage(WEB_STORAGE_KEYS.LYRICS, lyricsMap);
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO lyrics (song_id, plain_lyrics, synced_lyrics, source, cached_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(song_id) DO UPDATE SET
       plain_lyrics = excluded.plain_lyrics,
       synced_lyrics = excluded.synced_lyrics,
       source = excluded.source,
       cached_at = excluded.cached_at`,
    lyrics.songId,
    lyrics.plainLyrics,
    lyrics.syncedLyrics,
    lyrics.source,
    Date.now()
  );
}

export async function getCachedLyrics(songId: string): Promise<LyricsData | null> {
  if (Platform.OS === "web") {
    const lyricsMap = getWebStorage<Record<string, LyricsData>>(WEB_STORAGE_KEYS.LYRICS, {});
    return lyricsMap[songId] || null;
  }

  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM lyrics WHERE song_id = ?`,
    songId
  );
  if (!row) return null;
  return {
    songId: row.song_id,
    plainLyrics: row.plain_lyrics,
    syncedLyrics: row.synced_lyrics,
    source: row.source,
  };
}

export async function getAllCachedLyricsMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (Platform.OS === "web") {
    try {
      const lyricsMap = getWebStorage<Record<string, LyricsData>>(WEB_STORAGE_KEYS.LYRICS, {});
      for (const [id, data] of Object.entries(lyricsMap)) {
        if (data?.plainLyrics) {
          map.set(id, data.plainLyrics);
        }
      }
    } catch {}
    return map;
  }

  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      `SELECT song_id, plain_lyrics FROM lyrics WHERE plain_lyrics IS NOT NULL AND length(plain_lyrics) > 5`
    );
    for (const r of rows) {
      if (r.song_id && r.plain_lyrics) {
        map.set(r.song_id, r.plain_lyrics);
      }
    }
  } catch {}
  return map;
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
    if (Platform.OS === "web") {
      setWebStorage(WEB_STORAGE_KEYS.PLAYBACK, {
        currentSongId,
        position,
        duration,
        repeatMode,
        shuffle,
        queue,
        updatedAt: Date.now(),
      });
      return;
    }

    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO playback_state (id, current_song_id, position, duration, repeat_mode, shuffle, queue_json, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         current_song_id = excluded.current_song_id,
         position = excluded.position,
         duration = excluded.duration,
         repeat_mode = excluded.repeat_mode,
         shuffle = excluded.shuffle,
         queue_json = excluded.queue_json,
         updated_at = excluded.updated_at`,
      currentSongId,
      position,
      duration,
      repeatMode,
      shuffle ? 1 : 0,
      JSON.stringify(queue),
      Date.now()
    );
  } catch (e) {
    console.warn("[savePlaybackSession] Failed to persist session", e);
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
    if (Platform.OS === "web") {
      const data = getWebStorage<any>(WEB_STORAGE_KEYS.PLAYBACK, null);
      if (!data) return null;
      return {
        currentSongId: data.currentSongId || null,
        position: Number(data.position || 0),
        duration: Number(data.duration || 0),
        repeatMode: data.repeatMode || "off",
        shuffle: Boolean(data.shuffle),
        queue: Array.isArray(data.queue) ? data.queue : [],
      };
    }

    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(`SELECT * FROM playback_state WHERE id = 1`);
    if (!row) return null;

    let queue: Song[] = [];
    if (row.queue_json) {
      try {
        queue = JSON.parse(row.queue_json);
      } catch {
        queue = [];
      }
    }

    return {
      currentSongId: row.current_song_id,
      position: Number(row.position || 0),
      duration: Number(row.duration || 0),
      repeatMode: (row.repeat_mode as any) || "off",
      shuffle: Boolean(row.shuffle),
      queue,
    };
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

function mapRowToSong(row: any): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    youtubeVideoId: row.youtube_video_id,
    thumbnailUrl: row.thumbnail_url,
    duration: row.duration,
    albumName: row.album_name || undefined,
    folderName: row.folder_name || undefined,
    isHidden: Boolean(row.is_hidden),
    streamUrl: row.stream_url || undefined,
    isDownloaded: Boolean(row.is_downloaded),
    localFilePath: row.local_file_path || undefined,
    localArtworkPath: row.local_artwork_path || undefined,
    fileSize: row.file_size || undefined,
    downloadedAt: row.downloaded_at || undefined,
    playCount: row.play_count || 0,
    lastPlayedAt: row.last_played_at || undefined,
  };
}

// -------------------------------------------------------------
// Folder & Offline Organization Methods
// -------------------------------------------------------------

export async function toggleSongHidden(songId: string, isHidden: boolean): Promise<void> {
  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    if (songs[songId]) {
      songs[songId].isHidden = isHidden;
      setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);
    }
    return;
  }

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE songs SET is_hidden = ? WHERE id = ?`,
    isHidden ? 1 : 0,
    songId
  );
}

export async function renameOfflineFolder(
  oldFolderName: string,
  newFolderName: string
): Promise<number> {
  const cleanOld = oldFolderName.trim();
  const cleanNew = newFolderName.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return 0;

  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    let count = 0;
    for (const id in songs) {
      if (songs[id].folderName === cleanOld || songs[id].artist === cleanOld) {
        songs[id].folderName = cleanNew;
        count++;
      }
    }
    setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);

    const custom = getWebStorage<string[]>(WEB_STORAGE_KEYS.CUSTOM_FOLDERS, []);
    const updatedCustom = custom.map((f) => (f === cleanOld ? cleanNew : f));
    setWebStorage(WEB_STORAGE_KEYS.CUSTOM_FOLDERS, updatedCustom);
    return count;
  }

  const db = await getDatabase();
  const res = await db.runAsync(
    `UPDATE songs SET folder_name = ? WHERE folder_name = ? OR artist = ?`,
    cleanNew,
    cleanOld,
    cleanOld
  );
  return res?.changes || 0;
}

export async function moveSongToOfflineFolder(
  songId: string,
  targetFolderName: string
): Promise<boolean> {
  const clean = targetFolderName.trim();
  if (!songId || !clean) return false;

  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    if (songs[songId]) {
      songs[songId].folderName = clean;
      setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);
      return true;
    }
    return false;
  }

  const db = await getDatabase();
  await db.runAsync(`UPDATE songs SET folder_name = ? WHERE id = ?`, clean, songId);
  return true;
}

export async function deleteOfflineFolder(
  folderName: string,
  deleteSongsToo: boolean = false
): Promise<void> {
  const clean = folderName.trim();
  if (!clean) return;

  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    for (const id in songs) {
      if (songs[id].folderName === clean || songs[id].artist === clean) {
        if (deleteSongsToo) {
          delete songs[id];
        } else {
          songs[id].folderName = "أخرى";
        }
      }
    }
    setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);

    const custom = getWebStorage<string[]>(WEB_STORAGE_KEYS.CUSTOM_FOLDERS, []);
    setWebStorage(
      WEB_STORAGE_KEYS.CUSTOM_FOLDERS,
      custom.filter((f) => f !== clean)
    );
    return;
  }

  const db = await getDatabase();
  if (deleteSongsToo) {
    await db.runAsync(`DELETE FROM songs WHERE folder_name = ? OR artist = ?`, clean, clean);
  } else {
    await db.runAsync(`UPDATE songs SET folder_name = 'أخرى' WHERE folder_name = ?`, clean);
  }
}

export async function deleteArtist(artistName: string): Promise<void> {
  const clean = artistName.trim();
  if (Platform.OS === "web") {
    await deleteOfflineFolder(clean, true);
    return;
  }

  const db = await getDatabase();
  await db.runAsync(`DELETE FROM songs WHERE artist = ? OR folder_name = ?`, clean, clean);
}

export async function deleteAlbum(albumName: string, artistName?: string): Promise<void> {
  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    for (const id in songs) {
      const matchAlbum = songs[id].albumName === albumName;
      const matchArtist = !artistName || songs[id].artist === artistName || songs[id].folderName === artistName;
      if (matchAlbum && matchArtist) {
        delete songs[id];
      }
    }
    setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);
    return;
  }

  const db = await getDatabase();
  if (artistName) {
    await db.runAsync(
      `DELETE FROM songs WHERE album_name = ? AND (artist = ? OR folder_name = ?)`,
      albumName,
      artistName,
      artistName
    );
  } else {
    await db.runAsync(`DELETE FROM songs WHERE album_name = ?`, albumName);
  }
}

export async function deleteOfflineSong(songId: string): Promise<void> {
  if (Platform.OS === "web") {
    const songs = getWebStorage<Record<string, Song>>(WEB_STORAGE_KEYS.SONGS, {});
    delete songs[songId];
    setWebStorage(WEB_STORAGE_KEYS.SONGS, songs);
    return;
  }

  const db = await getDatabase();
  await db.runAsync(`DELETE FROM songs WHERE id = ?`, songId);
}

const nativeCustomFolders: Set<string> = new Set();

export function getCustomOfflineFolders(): string[] {
  if (Platform.OS === "web") {
    return getWebStorage<string[]>(WEB_STORAGE_KEYS.CUSTOM_FOLDERS, []);
  }
  return Array.from(nativeCustomFolders);
}

export function createCustomOfflineFolder(folderName: string): boolean {
  const clean = folderName.trim();
  if (!clean) return false;

  if (Platform.OS === "web") {
    const custom = getWebStorage<string[]>(WEB_STORAGE_KEYS.CUSTOM_FOLDERS, []);
    if (!custom.includes(clean)) {
      custom.push(clean);
      setWebStorage(WEB_STORAGE_KEYS.CUSTOM_FOLDERS, custom);
      return true;
    }
    return false;
  }

  if (!nativeCustomFolders.has(clean)) {
    nativeCustomFolders.add(clean);
    return true;
  }
  return false;
}
