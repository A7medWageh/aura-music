const DB_NAME = "music-web-offline";
const DB_VERSION = 6;
const META_STORE = "saved-songs";  // metadata only — instant save
const AUDIO_STORE = "audio";       // audio blobs — background download
const LYRICS_STORE = "lyrics";     // lyrics text

export async function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "songId" });
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "songId" });
      }
      if (!db.objectStoreNames.contains(LYRICS_STORE)) {
        db.createObjectStore(LYRICS_STORE, { keyPath: "songId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Save metadata instantly — shows up in library immediately */
export async function saveSongMeta(song: {
  songId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  youtubeVideoId: string;
  albumId?: string;
  albumName?: string;
  folderName?: string;
  isHidden?: boolean;
}): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    const req = tx.objectStore(META_STORE).get(song.songId);
    req.onsuccess = () => {
      const existing = req.result || {};
      tx.objectStore(META_STORE).put({
        ...existing,
        ...song,
        folderName: song.folderName || existing.folderName || song.artist || "أخرى",
        savedAt: existing.savedAt || Date.now(),
        audioReady: existing.audioReady ?? false,
        isHidden: existing.isHidden ?? (song.isHidden || false),
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function toggleSongHidden(songId: string, isHidden: boolean): Promise<void> {
  const db = await openOfflineDb();
  const meta: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(songId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (meta) {
    const db2 = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db2.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put({ ...meta, isHidden });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/** Mark a song's audio as downloaded */
async function markAudioReady(songId: string): Promise<void> {
  const db = await openOfflineDb();
  const meta: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(songId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (meta) {
    const db2 = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db2.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put({ ...meta, audioReady: true });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

/** Store audio blob after background download */
export async function storeAudioBlob(songId: string, blob: Blob): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    tx.objectStore(AUDIO_STORE).put({ songId, blob, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await markAudioReady(songId);
}

/** Get audio blob for offline playback */
export async function getAudioBlob(songId: string): Promise<Blob | null> {
  const db = await openOfflineDb();
  const record: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const req = tx.objectStore(AUDIO_STORE).get(songId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return record?.blob || null;
}

export async function storeLyrics(songId: string, lyrics: any[]): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LYRICS_STORE, "readwrite");
    tx.objectStore(LYRICS_STORE).put({ songId, lyrics, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLyrics(songId: string): Promise<any[] | null> {
  const db = await openOfflineDb();
  const record: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(LYRICS_STORE, "readonly");
    const req = tx.objectStore(LYRICS_STORE).get(songId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return record?.lyrics || null;
}

/** Get all saved songs from library (metadata only, fast) */
export async function getAllOfflineSongs(): Promise<any[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfflineSong(songId: string): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, AUDIO_STORE, LYRICS_STORE], "readwrite");
    tx.objectStore(META_STORE).delete(songId);
    tx.objectStore(AUDIO_STORE).delete(songId);
    try { tx.objectStore(LYRICS_STORE).delete(songId); } catch {}
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteArtist(artistName: string): Promise<void> {
  const songs = await getAllOfflineSongs();
  const toDelete = songs.filter(s => s.artist === artistName || s.folderName === artistName);
  for (const song of toDelete) {
    await deleteOfflineSong(song.songId);
  }
}

export async function deleteAlbum(albumName: string, artistName: string): Promise<void> {
  const songs = await getAllOfflineSongs();
  const toDelete = songs.filter(s => s.albumName === albumName && (s.artist === artistName || s.folderName === artistName));
  for (const song of toDelete) {
    await deleteOfflineSong(song.songId);
  }
}

export async function clearAllOfflineSongs(): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, AUDIO_STORE, LYRICS_STORE], "readwrite");
    tx.objectStore(META_STORE).clear();
    tx.objectStore(AUDIO_STORE).clear();
    try { tx.objectStore(LYRICS_STORE).clear(); } catch {}
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
