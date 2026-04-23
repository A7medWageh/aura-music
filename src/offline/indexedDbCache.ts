const DB_NAME = "music-web-offline";
const DB_VERSION = 4;
const META_STORE = "saved-songs";  // metadata only — instant save
const AUDIO_STORE = "audio";       // audio blobs — background download

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
}): Promise<void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({
      ...song,
      folderName: song.folderName || song.artist || "أخرى",
      savedAt: Date.now(),
      audioReady: false,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
    const tx = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
    tx.objectStore(META_STORE).delete(songId);
    tx.objectStore(AUDIO_STORE).delete(songId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllOfflineSongs(): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
    tx.objectStore(META_STORE).clear();
    tx.objectStore(AUDIO_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Legacy compat */
export async function storeOfflineAudio(
  songId: string, blob: Blob,
  metadata?: { title?: string; artist?: string; thumbnailUrl?: string; thumbnailBlob?: Blob; albumId?: string; albumName?: string; folderName?: string; }
) {
  if (metadata) {
    await saveSongMeta({
      songId,
      title: metadata.title || "أغنية محفوظة",
      artist: metadata.artist || "فنان غير معروف",
      thumbnailUrl: metadata.thumbnailUrl,
      youtubeVideoId: songId,
      albumId: metadata.albumId,
      albumName: metadata.albumName,
      folderName: metadata.folderName || metadata.artist,
    });
  }
  await storeAudioBlob(songId, blob);
}
