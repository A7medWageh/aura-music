import { getCanonicalArtistName } from "@/utils/artistNormalizer";

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
 * Global reactive notification helper.
 * Uses a 300ms debounce to prevent event storms during bulk album downloads.
 * Dispatches an event on window so UI components update smoothly without memory spikes.
 */
let notifyLibraryTimeout: any = null;
export function notifyLibraryUpdated(detail?: any) {
  if (typeof window === "undefined") return;
  if (notifyLibraryTimeout) clearTimeout(notifyLibraryTimeout);
  notifyLibraryTimeout = setTimeout(() => {
    notifyLibraryTimeout = null;
    try {
      window.dispatchEvent(new CustomEvent("aura-library-updated", { detail }));
    } catch {}
  }, 300);
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
        folderName: getCanonicalArtistName(song.folderName || existing.folderName || song.artist || "أخرى"),
        savedAt: existing.savedAt || Date.now(),
        audioReady: existing.audioReady ?? false,
        isHidden: existing.isHidden ?? (song.isHidden || false),
      });
    };
    tx.oncomplete = () => {
      notifyLibraryUpdated({ type: "song-meta", songId: song.songId });
      resolve();
    };
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
        tx2.oncomplete = () => {
          notifyLibraryUpdated({ type: "thumbnail-cached", songId: song.songId });
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
      tx.oncomplete = () => {
        notifyLibraryUpdated({ type: "song-visibility", songId, isHidden });
        resolve();
      };
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
    tx.oncomplete = () => {
      notifyLibraryUpdated({ type: "audio-ready", songId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Accurately detects audio container type from header magic bytes.
 * Prevents WebKit & Blink from miscalculating M4A/AAC duration when served with audio/mpeg headers.
 */
export function detectAudioMimeType(buffer: ArrayBuffer | Uint8Array, fallback = "audio/mp4"): string {
  if (!buffer || buffer.byteLength < 8) return fallback;
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength));
  
  // MP4 / M4A: check for "ftyp" in first 16 bytes (usually at index 4)
  for (let i = 0; i <= Math.min(12, bytes.length - 4); i++) {
    if (bytes[i] === 0x66 && bytes[i + 1] === 0x74 && bytes[i + 2] === 0x79 && bytes[i + 3] === 0x70) {
      return "audio/mp4";
    }
  }

  // ID3 header (MP3)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return "audio/mpeg";
  }

  // MPEG sync frame (MP3)
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) {
    return "audio/mpeg";
  }

  // OggS (Ogg / Opus)
  if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return "audio/ogg";
  }

  // fLaC
  if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return "audio/flac";
  }

  // RIFF WAVE
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "audio/wav";
  }

  return fallback;
}

/** Store audio blob after background download */
export async function storeAudioBlob(songId: string, blob: Blob): Promise<void> {
  const db = await openOfflineDb();
  let buffer: ArrayBuffer | null = null;
  try {
    buffer = await blob.arrayBuffer();
  } catch {}

  const finalMime = buffer 
    ? detectAudioMimeType(buffer, blob.type || "audio/mp4")
    : (blob.type || "audio/mp4");

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    if (buffer) {
      // Storing ArrayBuffer prevents WebKit DataCloneError on iOS Safari & WKWebView
      tx.objectStore(AUDIO_STORE).put({
        songId,
        buffer,
        mimeType: finalMime,
        size: blob.size,
        savedAt: Date.now()
      });
    } else {
      tx.objectStore(AUDIO_STORE).put({ songId, blob, mimeType: finalMime, savedAt: Date.now() });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await markAudioReady(songId);
  notifyLibraryUpdated({ type: "audio-stored", songId });
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
    if (record.buffer instanceof ArrayBuffer) {
      const accurateType = detectAudioMimeType(record.buffer, record.mimeType || "audio/mp4");
      return new Blob([record.buffer], { type: accurateType });
    }
    if (record.blob instanceof Blob) {
      return record.blob;
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
export async function migrateRemoteThumbnails(songs: any[]) {
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
    tx.oncomplete = () => {
      notifyLibraryUpdated({ type: "deleteOfflineSong", songId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteArtist(artistName: string): Promise<void> {
  const songs = await getAllOfflineSongs();
  const toDelete = songs.filter(s => s.artist === artistName || s.folderName === artistName);
  for (const song of toDelete) {
    await deleteOfflineSong(song.songId);
  }
  notifyLibraryUpdated({ type: "deleteArtist", artistName });
}

export async function deleteAlbum(albumName: string, artistName: string): Promise<void> {
  const songs = await getAllOfflineSongs();
  const toDelete = songs.filter(s => s.albumName === albumName && (s.artist === artistName || s.folderName === artistName));
  for (const song of toDelete) {
    await deleteOfflineSong(song.songId);
  }
  notifyLibraryUpdated({ type: "deleteAlbum", albumName, artistName });
}

export async function clearAllOfflineSongs(): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, AUDIO_STORE, LYRICS_STORE], "readwrite");
    tx.objectStore(META_STORE).clear();
    tx.objectStore(AUDIO_STORE).clear();
    try { tx.objectStore(LYRICS_STORE).clear(); } catch {}
    tx.oncomplete = () => {
      notifyLibraryUpdated({ type: "clearAllOfflineSongs" });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Automatically consolidates duplicate artist folders (e.g. Wael Jassar, Wael Gassar, WAEL JASSAP)
 * into a single unified folder directly inside IndexedDB on the user's phone/browser.
 */
export async function consolidateArtistFolders(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const db = await openOfflineDb();
    const songs: any[] = await new Promise((resolve) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (!songs || songs.length === 0) return 0;

    const toUpdate: any[] = [];
    for (const song of songs) {
      const currentFolder = song.folderName || song.artist || "أخرى";
      const canonical = getCanonicalArtistName(currentFolder);
      if (song.folderName !== canonical) {
        toUpdate.push({
          ...song,
          folderName: canonical,
        });
      }
    }

    if (toUpdate.length > 0) {
      const db2 = await openOfflineDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db2.transaction(META_STORE, "readwrite");
        const store = tx.objectStore(META_STORE);
        for (const item of toUpdate) {
          store.put(item);
        }
        tx.oncomplete = () => {
          notifyLibraryUpdated({ type: "artists-consolidated", count: toUpdate.length });
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
      return toUpdate.length;
    }

    return 0;
  } catch (err) {
    console.error("Failed to consolidate artist folders:", err);
    return 0;
  }
}

