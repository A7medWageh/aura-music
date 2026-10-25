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

/**
 * Convert any image URL (remote HTTPS or proxy) into a self-contained base64 data URL.
 * Also stores the image response into CacheStorage for Service Worker offline access.
 */
export async function fetchImageAsDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  try {
    let res: Response | null = null;
    // 1. Try direct fetch with timeout
    try {
      res = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(6000) });
    } catch {
      res = null;
    }

    // 2. If direct fetch fails (e.g. CORS), fallback to our image proxy
    if (!res || !res.ok) {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      try {
        res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      } catch {
        res = null;
      }
    }

    if (!res || !res.ok) return url;

    // Clone for CacheStorage if available
    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const cache = await caches.open("aura-offline-images");
        await cache.put(url, res.clone());
      } catch {}
    }

    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result && result.startsWith("data:")) resolve(result);
        else resolve(url);
      };
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("[IndexedDB] Could not convert image to dataUrl:", err);
    return url;
  }
}

/** Save metadata instantly — shows up in library immediately with offline image caching */
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
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    const req = tx.objectStore(META_STORE).get(song.songId);
    req.onsuccess = () => {
      const existing = req.result || {};
      tx.objectStore(META_STORE).put({
        ...existing,
        ...song,
        thumbnailUrl: (song.thumbnailUrl?.startsWith("data:") ? song.thumbnailUrl : existing.thumbnailUrl?.startsWith("data:") ? existing.thumbnailUrl : song.thumbnailUrl),
        folderName: song.folderName || existing.folderName || song.artist || "أخرى",
        savedAt: existing.savedAt || Date.now(),
        audioReady: existing.audioReady ?? false,
        isHidden: existing.isHidden ?? (song.isHidden || false),
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Background task: If thumbnailUrl is a remote HTTP URL, fetch it and convert to dataUrl so it renders offline
  if (song.thumbnailUrl && song.thumbnailUrl.startsWith("http") && typeof window !== "undefined") {
    fetchImageAsDataUrl(song.thumbnailUrl).then(async (dataUrl) => {
      if (dataUrl && dataUrl.startsWith("data:")) {
        const db2 = await openOfflineDb();
        const tx2 = db2.transaction(META_STORE, "readwrite");
        const getReq = tx2.objectStore(META_STORE).get(song.songId);
        getReq.onsuccess = () => {
          const rec = getReq.result;
          if (rec) {
            rec.thumbnailUrl = dataUrl;
            tx2.objectStore(META_STORE).put(rec);
          }
        };
      }
    }).catch(() => {});
  }
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
  
  const db2 = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db2.transaction(META_STORE, "readwrite");
    const record = meta ? { ...meta, audioReady: true } : { songId, title: "أغنية محفوظة", artist: "فنان", savedAt: Date.now(), audioReady: true };
    tx.objectStore(META_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Store audio blob after background download */
export async function storeAudioBlob(songId: string, blob: Blob): Promise<void> {
  const db = await openOfflineDb();
  let buffer: ArrayBuffer | null = null;
  try {
    buffer = await blob.arrayBuffer();
  } catch {}

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    if (buffer) {
      // Storing ArrayBuffer prevents WebKit DataCloneError on iOS Safari & WKWebView
      tx.objectStore(AUDIO_STORE).put({
        songId,
        buffer,
        mimeType: blob.type || "audio/mpeg",
        size: blob.size,
        savedAt: Date.now()
      });
    } else {
      tx.objectStore(AUDIO_STORE).put({ songId, blob, savedAt: Date.now() });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await markAudioReady(songId);
}

/** Get audio blob for offline playback */
export async function getAudioBlob(songId: string): Promise<Blob | null> {
  if (!songId) return null;
  const db = await openOfflineDb();
  const record: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const req = tx.objectStore(AUDIO_STORE).get(songId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (record) {
    if (record.blob instanceof Blob) return record.blob;
    if (record.buffer instanceof ArrayBuffer) {
      return new Blob([record.buffer], { type: record.mimeType || "audio/mpeg" });
    }
  }
  return null;
}

export async function storeLyrics(songId: string, lyrics: any): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LYRICS_STORE, "readwrite");
    tx.objectStore(LYRICS_STORE).put({ songId, lyrics, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLyrics(songId: string): Promise<any | null> {
  const db = await openOfflineDb();
  const record: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(LYRICS_STORE, "readonly");
    const req = tx.objectStore(LYRICS_STORE).get(songId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return record?.lyrics || null;
}

/** Get all saved songs from library (metadata synchronized with actual audio storage) */
export async function getAllOfflineSongs(): Promise<any[]> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META_STORE, AUDIO_STORE], "readonly");
    const metaReq = tx.objectStore(META_STORE).getAll();
    const audioKeysReq = tx.objectStore(AUDIO_STORE).getAllKeys();
    
    let songs: any[] = [];
    let audioKeys = new Set<string>();

    metaReq.onsuccess = () => { songs = metaReq.result || []; };
    audioKeysReq.onsuccess = () => {
      audioKeys = new Set((audioKeysReq.result || []).map(k => String(k)));
    };

    tx.oncomplete = () => {
      const enriched = songs.map((s) => ({
        ...s,
        audioReady: audioKeys.has(s.songId) || (s.youtubeVideoId && audioKeys.has(s.youtubeVideoId)) || Boolean(s.audioReady && audioKeys.has(s.songId)),
      }));

      // Background migration: auto-cache images for any songs that still have remote HTTP URLs
      if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.onLine) {
        migrateRemoteThumbnails(enriched).catch(() => {});
      }

      resolve(enriched);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Get single song metadata from IndexedDB */
export async function getOfflineSongMeta(songId: string): Promise<any | null> {
  if (!songId) return null;
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(songId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

let isMigratingThumbnails = false;
async function migrateRemoteThumbnails(songs: any[]) {
  if (isMigratingThumbnails) return;
  const needCache = songs.filter(s => s.thumbnailUrl && s.thumbnailUrl.startsWith("http"));
  if (needCache.length === 0) return;

  isMigratingThumbnails = true;
  let migratedCount = 0;
  try {
    // Process in batches of 4 concurrent fetches to quickly cache all images
    const chunkSize = 4;
    for (let i = 0; i < needCache.length; i += chunkSize) {
      const chunk = needCache.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (song) => {
          try {
            const dataUrl = await fetchImageAsDataUrl(song.thumbnailUrl);
            if (dataUrl && dataUrl.startsWith("data:")) {
              const db = await openOfflineDb();
              await new Promise<void>((resolve) => {
                const tx = db.transaction(META_STORE, "readwrite");
                const req = tx.objectStore(META_STORE).get(song.songId);
                req.onsuccess = () => {
                  const rec = req.result;
                  if (rec) {
                    rec.thumbnailUrl = dataUrl;
                    tx.objectStore(META_STORE).put(rec);
                    migratedCount++;
                  }
                };
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
              });
            }
          } catch {}
        })
      );
    }
  } finally {
    isMigratingThumbnails = false;
    if (migratedCount > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("aura-thumbnails-migrated"));
    }
  }
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
