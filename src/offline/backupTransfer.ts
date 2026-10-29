/**
 * backupTransfer.ts
 * 
 * High-performance, memory-efficient offline music library transfer utility.
 * Allows moving 100% of offline music (audio blobs, metadata, covers, lyrics)
 * between Safari PWA and the installed Native iPhone App without using internet
 * and without RAM spikes.
 */

import {
  getAllOfflineSongs,
  getAllOfflineLyricsMap,
  getAudioBlob,
  saveSongMeta,
  storeAudioBlob,
  storeLyrics,
  notifyLibraryUpdated,
} from "./indexedDbCache";

export type BackupProgress = {
  phase: "exporting" | "importing";
  current: number;
  total: number;
  currentSongTitle: string;
  bytesProcessed?: number;
  percentage: number;
};

const MAGIC = "AURAPACK"; // 8 bytes
const FORMAT_VERSION = 1;

/**
 * Exports all offline songs, metadata, lyrics, and audio blobs into a single .aurapack binary file.
 * Memory-safe: Uses Blob compositing which references disk blobs instead of copying into JS heap.
 */
export async function exportOfflineLibrary(
  onProgress?: (progress: BackupProgress) => void
): Promise<Blob> {
  const allSongs = await getAllOfflineSongs();
  const lyricsMap = await getAllOfflineLyricsMap();
  const total = allSongs.length;

  if (total === 0) {
    throw new Error("لا توجد أغانٍ محملة في مكتبة الأوفلاين لتصديرها.");
  }

  const manifestSongs: any[] = [];
  const audioBlobParts: Blob[] = [];

  for (let i = 0; i < total; i++) {
    const song = allSongs[i];
    if (onProgress) {
      onProgress({
        phase: "exporting",
        current: i + 1,
        total,
        currentSongTitle: song.title || "أغنية",
        percentage: Math.round(((i + 1) / total) * 100),
      });
    }

    // Retrieve audio blob
    let blob = await getAudioBlob(song.songId);
    if (!blob && song.youtubeVideoId && song.youtubeVideoId !== song.songId) {
      blob = await getAudioBlob(song.youtubeVideoId);
    }

    const lyrics = lyricsMap.get(song.songId) || "";

    manifestSongs.push({
      songId: song.songId,
      title: song.title,
      artist: song.artist,
      albumName: song.albumName,
      folderName: song.folderName,
      thumbnailUrl: song.thumbnailUrl,
      originalThumbnailUrl: song.originalThumbnailUrl,
      youtubeVideoId: song.youtubeVideoId,
      albumId: song.albumId,
      isHidden: song.isHidden || false,
      savedAt: song.savedAt || Date.now(),
      audioByteLength: blob ? blob.size : 0,
      mimeType: blob ? blob.type : "audio/mp4",
      lyrics,
    });

    if (blob) {
      audioBlobParts.push(blob);
    }
  }

  const manifestObj = {
    magic: MAGIC,
    version: FORMAT_VERSION,
    createdAt: Date.now(),
    songsCount: manifestSongs.length,
    songs: manifestSongs,
  };

  const manifestJson = JSON.stringify(manifestObj);
  const manifestEncoder = new TextEncoder();
  const manifestBytes = manifestEncoder.encode(manifestJson);

  // 16-byte fixed binary header:
  // [0..7]: MAGIC "AURAPACK" (ASCII)
  // [8..11]: FORMAT_VERSION (uint32 LE)
  // [12..15]: Manifest length in bytes (uint32 LE)
  const headerBuffer = new ArrayBuffer(16);
  const headerView = new DataView(headerBuffer);
  for (let i = 0; i < 8; i++) {
    headerView.setUint8(i, MAGIC.charCodeAt(i));
  }
  headerView.setUint32(8, FORMAT_VERSION, true);
  headerView.setUint32(12, manifestBytes.length, true);

  // Composite Blob: zero-copy in WebKit/Blink
  const finalBlob = new Blob([headerBuffer, manifestBytes, ...audioBlobParts], {
    type: "application/octet-stream",
  });

  return finalBlob;
}

/**
 * Creates and returns the exported backup blob and metadata.
 */
export async function createOfflineLibraryBackup(
  onProgress?: (progress: BackupProgress) => void
): Promise<{ blob: Blob; fileName: string; sizeMB: number }> {
  const blob = await exportOfflineLibrary(onProgress);
  const fileName = `aura-music-offline-backup-${new Date().toISOString().slice(0, 10)}.aurapack`;
  const sizeMB = blob.size / (1024 * 1024);
  return { blob, fileName, sizeMB };
}

/**
 * Triggers native browser/iOS file download for the exported library.
 */
export async function downloadLibraryBackup(
  onProgress?: (progress: BackupProgress) => void
): Promise<string> {
  const { blob, fileName } = await createOfflineLibraryBackup(onProgress);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }, 120000);

  return fileName;
}

/**
 * Imports a .aurapack backup file into the local IndexedDB.
 * Memory-safe: Slices the file on disk one track at a time without RAM spikes.
 */
export async function importOfflineLibrary(
  file: File | Blob,
  onProgress?: (progress: BackupProgress) => void
): Promise<{ importedCount: number; errors: number }> {
  if (file.size < 16) {
    throw new Error("الملف المحدد تالف أو غير صالح.");
  }

  // Read 16-byte header
  const headerBuffer = await file.slice(0, 16).arrayBuffer();
  const headerView = new DataView(headerBuffer);

  let magic = "";
  for (let i = 0; i < 8; i++) {
    magic += String.fromCharCode(headerView.getUint8(i));
  }

  if (magic !== MAGIC) {
    throw new Error("تنسيق الملف غير مدعوم. يجب اختيار ملف نسخة احتياطية بصيغة .aurapack");
  }

  const version = headerView.getUint32(8, true);
  const manifestLen = headerView.getUint32(12, true);

  if (manifestLen <= 0 || 16 + manifestLen > file.size) {
    throw new Error("بيانات الملف غير مكتملة أو تالفة.");
  }

  // Read manifest JSON
  const manifestText = await file.slice(16, 16 + manifestLen).text();
  let manifest: any;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error("تعذر قراءة بيانات الفهرس داخل ملف النسخة الاحتياطية.");
  }

  const songs = manifest.songs || [];
  const total = songs.length;
  let currentOffset = 16 + manifestLen;
  let importedCount = 0;
  let errors = 0;

  for (let i = 0; i < total; i++) {
    const song = songs[i];
    if (onProgress) {
      onProgress({
        phase: "importing",
        current: i + 1,
        total,
        currentSongTitle: song.title || "أغنية",
        percentage: Math.round(((i + 1) / total) * 100),
      });
    }

    try {
      // 1. Save Song Metadata
      await saveSongMeta({
        songId: song.songId,
        title: song.title,
        artist: song.artist,
        thumbnailUrl: song.thumbnailUrl,
        originalThumbnailUrl: song.originalThumbnailUrl,
        youtubeVideoId: song.youtubeVideoId,
        albumId: song.albumId,
        albumName: song.albumName,
        folderName: song.folderName,
        isHidden: song.isHidden,
      });

      // 2. Save Lyrics
      if (song.lyrics) {
        await storeLyrics(song.songId, song.lyrics);
      }

      // 3. Save Audio Blob (sliced directly from disk without RAM spikes)
      if (song.audioByteLength > 0) {
        const songBlob = file.slice(
          currentOffset,
          currentOffset + song.audioByteLength,
          song.mimeType || "audio/mp4"
        );
        await storeAudioBlob(song.songId, songBlob);
        currentOffset += song.audioByteLength;
      }

      importedCount++;
    } catch (err) {
      console.warn(`[BackupTransfer] Error importing song ${song.songId}:`, err);
      errors++;
      if (song.audioByteLength > 0) {
        currentOffset += song.audioByteLength;
      }
    }
  }

  notifyLibraryUpdated({ type: "backup-imported", importedCount });

  return { importedCount, errors };
}
