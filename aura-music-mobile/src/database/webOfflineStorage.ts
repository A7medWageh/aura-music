/**
 * webOfflineStorage.ts
 *
 * True IndexedDB audio blob & metadata persistence for Aura Music Web.
 * Guarantees zero-latency, zero-buffering offline playback from local browser storage.
 */

const DB_NAME = "aura-mobile-offline";
const DB_VERSION = 1;
const AUDIO_STORE = "audio_blobs";
const META_STORE = "songs_meta";
const LYRICS_STORE = "lyrics_store";

let dbInstance: IDBDatabase | null = null;

export async function openMobileOfflineDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (typeof window === "undefined" || !window.indexedDB) {
    throw new Error("IndexedDB is not supported in this environment");
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(LYRICS_STORE)) {
        db.createObjectStore(LYRICS_STORE, { keyPath: "songId" });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/** Store a downloaded audio Blob into IndexedDB */
export async function storeOfflineAudioBlob(songId: string, blob: Blob): Promise<void> {
  const db = await openMobileOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([AUDIO_STORE], "readwrite");
    const store = tx.objectStore(AUDIO_STORE);
    store.put({ id: songId, blob, size: blob.size, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Retrieve an audio Blob from IndexedDB */
export async function getOfflineAudioBlob(songId: string): Promise<Blob | null> {
  try {
    const db = await openMobileOfflineDb();
    return new Promise((resolve) => {
      const tx = db.transaction([AUDIO_STORE], "readonly");
      const store = tx.objectStore(AUDIO_STORE);
      const req = store.get(songId);
      req.onsuccess = () => {
        resolve(req.result?.blob || null);
      };
      req.onerror = () => {
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/** Delete an audio Blob from IndexedDB */
export async function deleteOfflineAudioBlob(songId: string): Promise<void> {
  try {
    const db = await openMobileOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([AUDIO_STORE], "readwrite");
      const store = tx.objectStore(AUDIO_STORE);
      store.delete(songId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

/** Store lyrics into IndexedDB */
export async function storeOfflineLyrics(songId: string, plainLyrics: string, syncedLyrics?: string): Promise<void> {
  try {
    const db = await openMobileOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([LYRICS_STORE], "readwrite");
      const store = tx.objectStore(LYRICS_STORE);
      store.put({ songId, plainLyrics, syncedLyrics, cachedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

/** Get all stored offline lyrics as a Map<songId, plainLyrics> */
export async function getAllOfflineLyricsMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const db = await openMobileOfflineDb();
    return new Promise((resolve) => {
      const tx = db.transaction([LYRICS_STORE], "readonly");
      const store = tx.objectStore(LYRICS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        for (const r of rows) {
          if (r.songId && r.plainLyrics) {
            map.set(r.songId, r.plainLyrics);
          }
        }
        resolve(map);
      };
      req.onerror = () => resolve(map);
    });
  } catch {
    return map;
  }
}

