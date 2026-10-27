import { getCanonicalArtistName } from "@/utils/artistNormalizer";
import { JANNAT_OLD_CLASSICS } from "@/data/jannatClassics";

const JANNAT_CLASSIC_IDS = new Set<string>(
  JANNAT_OLD_CLASSICS.flatMap((c) => [c.songId, c.youtubeVideoId].filter(Boolean))
);
const JANNAT_CLASSIC_TITLES = new Set<string>(
  JANNAT_OLD_CLASSICS.map((c) => c.title.trim())
);

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
  originalThumbnailUrl?: string;
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
      const originalHttpUrl =
        song.originalThumbnailUrl ||
        existing.originalThumbnailUrl ||
        (song.thumbnailUrl && song.thumbnailUrl.startsWith("http") ? song.thumbnailUrl : undefined);

      tx.objectStore(META_STORE).put({
        ...existing,
        ...song,
        originalThumbnailUrl: originalHttpUrl,
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
/** Get all saved songs from library (metadata synchronized with actual audio storage) */
export async function getAllOfflineSongs(): Promise<any[]> {
  try {
    const db = await openOfflineDb();
    return await new Promise((resolve) => {
      // 3.5s timeout safeguard so UI NEVER hangs if IndexedDB is blocked
      const timeout = setTimeout(() => {
        resolve([]);
      }, 3500);

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
        clearTimeout(timeout);
        const enriched = songs.map((s) => ({
          ...s,
          audioReady: audioKeys.has(s.songId) || (s.youtubeVideoId && audioKeys.has(s.youtubeVideoId)) || s.audioReady === true,
        }));
        resolve(enriched);
      };
      tx.onerror = () => {
        clearTimeout(timeout);
        console.warn("[IndexedDB] getAllOfflineSongs error:", tx.error);
        resolve(songs);
      };
    });
  } catch (err) {
    console.error("[IndexedDB] getAllOfflineSongs catch error:", err);
    return [];
  }
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

/**
 * Delete only the audio blob from AUDIO_STORE, leaving metadata intact in META_STORE with audioReady: false.
 */
export async function deleteAudioBlobOnly(songId: string): Promise<void> {
  if (!songId) return;
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, AUDIO_STORE], "readwrite");
    tx.objectStore(AUDIO_STORE).delete(songId);
    const metaReq = tx.objectStore(META_STORE).get(songId);
    metaReq.onsuccess = () => {
      const meta = metaReq.result;
      if (meta) {
        meta.audioReady = false;
        tx.objectStore(META_STORE).put(meta);
      }
    };
    tx.oncomplete = () => {
      notifyLibraryUpdated({ type: "audio-blob-deleted", songId });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Checks if a song blob matches known corrupted Khaleeji audio or duplicate collision.
 */
export function isKhaleejiOrCorruptedJannatBlob(
  artist: string | undefined,
  blobSize: number,
  songIdOrTitle?: string
): boolean {
  if (!blobSize) return false;
  const isJannat = Boolean(
    (artist && (artist.includes("جنات") || artist.toLowerCase().includes("jannat"))) ||
    (songIdOrTitle && JANNAT_CLASSIC_IDS.has(songIdOrTitle)) ||
    (songIdOrTitle && JANNAT_CLASSIC_TITLES.has(songIdOrTitle))
  );
  if (!isJannat) return false;

  // Exact known Khaleeji singer audio blob sizes:
  // 5634752 bytes = Hamada Majrashi ("بنسى نفسي")
  // 6736640 bytes = Hamada Majrashi ("هتسيب")
  // 6677312 bytes = Hamada Majrashi ("خبر غيابي")
  // 8419726 bytes = Khaleeji row 466
  if (
    blobSize < 4000000 ||
    blobSize === 5634752 ||
    blobSize === 6736640 ||
    blobSize === 6677312 ||
    blobSize === 8419726
  ) {
    return true;
  }
  return false;
}

/**
 * Automatically purges corrupted/Khaleeji audio blobs from Jannat's songs
 * in the user's mobile IndexedDB storage.
 * Inspects only Jannat's specific tracks individually without loading all audio into RAM.
 */
export async function autoPurgeCorruptedJannatBlobs(): Promise<number> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return 0;
  try {
    const db = await openOfflineDb();
    const metaRecords: any[] = await new Promise((resolve) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (metaRecords.length === 0) return 0;

    // Filter only Jannat records
    const jannatMeta = metaRecords.filter(
      (m) =>
        JANNAT_CLASSIC_IDS.has(m.songId) ||
        (m.artist && (m.artist.includes("جنات") || m.artist.toLowerCase().includes("jannat"))) ||
        m.folderName === "جنات" ||
        (m.title && JANNAT_CLASSIC_TITLES.has(m.title.trim()))
    );

    if (jannatMeta.length === 0) return 0;

    const jannatBlobs: { songId: string; size: number }[] = [];
    for (const m of jannatMeta) {
      try {
        const blob = await getAudioBlob(m.songId);
        if (blob) {
          jannatBlobs.push({ songId: m.songId, size: blob.size });
        }
      } catch {}
    }

    if (jannatBlobs.length === 0) return 0;

    const toDeleteIds = new Set<string>();
    for (const item of jannatBlobs) {
      const isCorruptedOrKhaleeji =
        item.size < 4000000 || // All 54 official Jannat MP3s are >= 4.38MB
        item.size === 5634752 ||
        item.size === 6736640 ||
        item.size === 6677312 ||
        item.size === 8419726;

      if (isCorruptedOrKhaleeji) {
        toDeleteIds.add(item.songId);
      }
    }

    if (toDeleteIds.size === 0) return 0;

    console.warn(`[IndexedDB] Lightweight auto-purging ${toDeleteIds.size} corrupted audio blobs for Jannat...`);

    for (const sid of toDeleteIds) {
      await deleteAudioBlobOnly(sid);
    }

    if (typeof caches !== "undefined") {
      try { await caches.delete("aura-bg-downloads"); } catch {}
    }

    return toDeleteIds.size;
  } catch (err) {
    console.warn("[IndexedDB] autoPurgeCorruptedJannatBlobs error:", err);
    return 0;
  }
}

/**
 * Quick check to see if the user's offline library has any corrupted Jannat audio files.
 * Uses lightweight point lookups without loading entire AUDIO_STORE into memory.
 */
export async function hasCorruptedJannatTracks(): Promise<boolean> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return false;
  try {
    const db = await openOfflineDb();
    const metaRecords: any[] = await new Promise((resolve) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const jannatMeta = metaRecords.filter(
      (m) =>
        JANNAT_CLASSIC_IDS.has(m.songId) ||
        (m.artist && (m.artist.includes("جنات") || m.artist.toLowerCase().includes("jannat"))) ||
        m.folderName === "جنات" ||
        (m.title && JANNAT_CLASSIC_TITLES.has(m.title.trim()))
    );

    if (jannatMeta.length === 0) return false;

    const sizes: number[] = [];
    for (const m of jannatMeta) {
      try {
        const blob = await getAudioBlob(m.songId);
        if (blob) {
          if (isKhaleejiOrCorruptedJannatBlob(m.artist, blob.size, m.songId || m.title)) {
            return true;
          }
          sizes.push(blob.size);
        }
      } catch {}
    }

    const sizeCounts = new Map<number, number>();
    for (const sz of sizes) {
      sizeCounts.set(sz, (sizeCounts.get(sz) || 0) + 1);
      if (sizeCounts.get(sz)! >= 2) return true;
    }
    return false;
  } catch {
    return false;
  }
}


/**
 * Automatically purges corrupted/Khaleeji audio blobs from Jannat's songs
 * and re-downloads genuine tracks from Telegram CDN with high fidelity.
 */
export async function repairCorruptedJannatTracks(
  onProgress?: (msg: string, percent: number) => void
): Promise<{ purged: number; redownloaded: number }> {
  if (typeof window === "undefined") return { purged: 0, redownloaded: 0 };
  try {
    onProgress?.("جاري فحص أغاني جنات في ذاكرة الهاتف...", 10);
    const allSongs = await getAllOfflineSongs();
    const jannatSongs = allSongs.filter(
      (s) =>
        s.artist?.includes("جنات") ||
        s.artist?.toLowerCase().includes("jannat") ||
        s.folderName === "جنات"
    );

    if (jannatSongs.length === 0) {
      onProgress?.("لا توجد أغاني محفوظة لجنات", 100);
      return { purged: 0, redownloaded: 0 };
    }

    // Inspect each song's audio blob
    const songBlobs: { song: any; size: number }[] = [];
    for (const song of jannatSongs) {
      const blob = await getAudioBlob(song.songId);
      if (blob) {
        songBlobs.push({ song, size: blob.size });
      }
    }

    // Count sizes to detect duplicate collisions
    const sizeCounts = new Map<number, number>();
    for (const { size } of songBlobs) {
      sizeCounts.set(size, (sizeCounts.get(size) || 0) + 1);
    }

    // Identify corrupted songs
    const toPurge: any[] = [];
    for (const { song, size } of songBlobs) {
      const isKnownKhaleeji = size === 5634752 || size === 8419726;
      const isDuplicate = (sizeCounts.get(size) || 0) > 1;
      if (isKnownKhaleeji || isDuplicate) {
        toPurge.push(song);
      }
    }

    if (toPurge.length === 0) {
      onProgress?.("جميع أغاني جنات سليمة ولا تحتاج إلى إصلاح ✅", 100);
      return { purged: 0, redownloaded: 0 };
    }

    onProgress?.(`تم اكتشاف ${toPurge.length} أغنية تالفة، جاري الحذف والتنظيف...`, 30);

    for (const s of toPurge) {
      await deleteAudioBlobOnly(s.songId);
      if (s.youtubeVideoId && s.youtubeVideoId !== s.songId) {
        await deleteAudioBlobOnly(s.youtubeVideoId);
      }
    }

    // Purge obsolete Service Worker background fetch cache if still lingering
    if (typeof caches !== "undefined") {
      try { await caches.delete("aura-bg-downloads"); } catch {}
    }

    let redownloaded = 0;
    if (typeof navigator !== "undefined" && navigator.onLine) {
      onProgress?.("جاري إعادة تنزيل الأغاني الأصلية من خوادم جنات السريعة...", 40);
      const { downloadSong } = await import("@/services/offline/downloader");

      for (let i = 0; i < toPurge.length; i++) {
        const s = toPurge[i];
        const pct = 40 + Math.floor(((i + 1) / toPurge.length) * 55);
        onProgress?.(`جاري تنزيل: ${s.title} (${i + 1}/${toPurge.length})`, pct);
        try {
          const success = await downloadSong(s.songId, s.youtubeVideoId, {
            title: s.title,
            artist: "جنات",
            albumId: s.albumId,
            albumName: s.albumName,
            folderName: "جنات",
            thumbnailUrl: s.thumbnailUrl,
          });
          if (success) redownloaded++;
        } catch (e) {
          console.error(`Failed to redownload "${s.title}":`, e);
        }
      }
    }

    notifyLibraryUpdated({ type: "jannat-repaired", purged: toPurge.length, redownloaded });
    onProgress?.(`اكتمل الإصلاح بنجاح! تم إصلاح ${toPurge.length} أغنية وتنزيل ${redownloaded} أصلية ✅`, 100);
    return { purged: toPurge.length, redownloaded };
  } catch (err: any) {
    console.error("Error repairing Jannat tracks:", err);
    onProgress?.("حدث خطأ أثناء الإصلاح: " + err.message, 100);
    return { purged: 0, redownloaded: 0 };
  }
}


