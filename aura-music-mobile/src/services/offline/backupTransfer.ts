/**
 * backupTransfer.ts
 *
 * High-performance, memory-efficient offline music library transfer utility for Aura Music.
 * Allows moving 100% of offline music (audio blobs, metadata, covers, lyrics)
 * between Safari PWA, desktop browsers, and installed apps without internet.
 */

import { Platform } from "react-native";
import { File, Paths, FileMode } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Song } from "@/types/music";
import {
  getDownloadedSongs,
  upsertSong,
  markSongDownloaded,
  saveLyrics,
  getAllCachedLyricsMap,
} from "@/database/db";
import {
  getOfflineAudioBlob,
  storeOfflineAudioBlob,
  getAllOfflineLyricsMap,
  storeOfflineLyrics,
} from "@/database/webOfflineStorage";
import { FileManager } from "@/services/storage/fileManager";

export type BackupProgress = {
  phase: "exporting" | "importing";
  current: number;
  total: number;
  currentSongTitle: string;
  percentage: number;
};

const MAGIC = "AURAPACK"; // 8 bytes
const FORMAT_VERSION = 1;
const COPY_CHUNK = 1024 * 1024;

/* UTF-8 codecs without TextEncoder/TextDecoder — Hermes does not guarantee them. */
function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const c2 = text.charCodeAt(++i);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function decodeUtf8(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      const v = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    }
  }
  return out;
}

async function readExact(handle: any, length: number): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  let read = 0;
  while (read < length) {
    const chunk = await handle.readBytes(Math.min(COPY_CHUNK, length - read));
    if (!chunk || chunk.length === 0) {
      throw new Error("بيانات الملف غير مكتملة أو تالفة.");
    }
    out.set(chunk, read);
    read += chunk.length;
  }
  return out;
}

async function copyChunked(source: any, target: any, total: number): Promise<void> {
  let remaining = total;
  while (remaining > 0) {
    const chunk = await source.readBytes(Math.min(COPY_CHUNK, remaining));
    if (!chunk || chunk.length === 0) {
      throw new Error("بيانات الملف غير مكتملة أو تالفة.");
    }
    await target.writeBytes(chunk);
    remaining -= chunk.length;
  }
}

/**
 * Exports all offline songs, metadata, lyrics, and audio blobs into a single .aurapack binary file.
 */
export async function exportOfflineLibrary(
  onProgress?: (progress: BackupProgress) => void
): Promise<Blob> {
  const allSongs = await getDownloadedSongs();
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

    let blob: Blob | null = null;
    if (Platform.OS === "web") {
      blob = await getOfflineAudioBlob(song.id);
      if (!blob && song.youtubeVideoId && song.youtubeVideoId !== song.id) {
        blob = await getOfflineAudioBlob(song.youtubeVideoId);
      }
    }

    const lyrics = lyricsMap.get(song.id) || "";

    manifestSongs.push({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      albumName: song.albumName,
      folderName: song.folderName,
      thumbnailUrl: song.thumbnailUrl,
      youtubeVideoId: song.youtubeVideoId,
      duration: song.duration,
      savedAt: song.downloadedAt || Date.now(),
      audioByteLength: blob ? blob.size : 0,
      mimeType: blob ? blob.type : "audio/mpeg",
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

  // 16-byte fixed binary header
  const headerBuffer = new ArrayBuffer(16);
  const headerView = new DataView(headerBuffer);
  for (let i = 0; i < 8; i++) {
    headerView.setUint8(i, MAGIC.charCodeAt(i));
  }
  headerView.setUint32(8, FORMAT_VERSION, true);
  headerView.setUint32(12, manifestBytes.length, true);

  const finalBlob = new Blob([headerBuffer, manifestBytes, ...audioBlobParts], {
    type: "application/octet-stream",
  });

  return finalBlob;
}

/**
 * Native export: streams the pack straight to a file so a 1 GB library never
 * has to sit in the JS heap the way the web Blob path requires.
 */
async function exportOfflineLibraryToFile(
  onProgress?: (progress: BackupProgress) => void
): Promise<{ uri: string; fileName: string }> {
  const allSongs = await getDownloadedSongs();
  if (allSongs.length === 0) {
    throw new Error("لا توجد أغانٍ محملة في مكتبة الأوفلاين لتصديرها.");
  }

  const lyricsMap = await getAllCachedLyricsMap();
  const manifestSongs: any[] = [];
  const audioFiles: { path: string; size: number }[] = [];

  for (let i = 0; i < allSongs.length; i++) {
    const song = allSongs[i];
    if (onProgress) {
      onProgress({
        phase: "exporting",
        current: i + 1,
        total: allSongs.length,
        currentSongTitle: song.title || "أغنية",
        percentage: Math.round(((i + 1) / allSongs.length) * 100),
      });
    }

    const candidatePath =
      song.localFilePath && !song.localFilePath.startsWith("indexeddb://")
        ? song.localFilePath
        : FileManager.getAudioPath(song.id);

    let size = 0;
    try {
      const audio = new File(candidatePath);
      if (audio.exists) size = audio.size;
    } catch {}

    manifestSongs.push({
      songId: song.id,
      title: song.title,
      artist: song.artist,
      albumName: song.albumName,
      folderName: song.folderName,
      thumbnailUrl: song.thumbnailUrl,
      youtubeVideoId: song.youtubeVideoId,
      duration: song.duration,
      savedAt: song.downloadedAt || Date.now(),
      audioByteLength: size,
      mimeType: "audio/mpeg",
      lyrics: lyricsMap.get(song.id) || "",
    });

    if (size > 0) audioFiles.push({ path: candidatePath, size });
  }

  const manifestBytes = encodeUtf8(
    JSON.stringify({
      magic: MAGIC,
      version: FORMAT_VERSION,
      createdAt: Date.now(),
      songsCount: manifestSongs.length,
      songs: manifestSongs,
    })
  );

  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);
  for (let i = 0; i < 8; i++) header[i] = MAGIC.charCodeAt(i);
  view.setUint32(8, FORMAT_VERSION, true);
  view.setUint32(12, manifestBytes.length, true);

  const fileName = `aura-music-backup-${new Date().toISOString().slice(0, 10)}.aurapack`;
  const output = new File(Paths.cache, fileName);
  try {
    if (output.exists) output.delete();
  } catch {}
  output.create({ intermediates: true, overwrite: true });

  const outHandle: any = output.open(FileMode.WriteOnly);
  try {
    await outHandle.writeBytes(header);
    await outHandle.writeBytes(manifestBytes);
    for (const item of audioFiles) {
      const source = new File(item.path);
      const inHandle: any = source.open(FileMode.ReadOnly);
      try {
        await copyChunked(inHandle, outHandle, item.size);
      } finally {
        inHandle.close();
      }
    }
  } finally {
    outHandle.close();
  }

  return { uri: output.uri, fileName };
}

/**
 * Creates and downloads the exported backup file.
 */
export async function downloadLibraryBackup(
  onProgress?: (progress: BackupProgress) => void
): Promise<string> {
  if (Platform.OS !== "web") {
    const { uri, fileName } = await exportOfflineLibraryToFile(onProgress);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/octet-stream",
        dialogTitle: "حفظ أو إرسال نسخة الأغاني",
        UTI: "public.data",
      });
    }
    return fileName;
  }

  const blob = await exportOfflineLibrary(onProgress);
  const fileName = `aura-music-backup-${new Date().toISOString().slice(0, 10)}.aurapack`;

  if (Platform.OS === "web" && typeof document !== "undefined") {
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
    }, 60000);
  }

  return fileName;
}

/**
 * Native import: opens the system file picker, then streams each track from the
 * pack into the app's audio directory. Returns null when the user cancels.
 */
export async function pickAndImportLibrary(
  onProgress?: (progress: BackupProgress) => void
): Promise<{ importedCount: number; errors: number } | null> {
  const picked: any = await File.pickFileAsync();
  if (!picked || picked.canceled || !picked.result) return null;
  return importOfflineLibraryNative(picked.result as File, onProgress);
}

async function importOfflineLibraryNative(
  pack: File,
  onProgress?: (progress: BackupProgress) => void
): Promise<{ importedCount: number; errors: number }> {
  if (!pack.size || pack.size < 16) {
    throw new Error("الملف المحدد تالف أو غير صالح.");
  }
  await FileManager.ensureDirectories();

  const handle: any = pack.open(FileMode.ReadOnly);
  try {
    const header = await readExact(handle, 16);
    const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);

    let magic = "";
    for (let i = 0; i < 8; i++) magic += String.fromCharCode(header[i]);
    if (magic !== MAGIC) {
      throw new Error("تنسيق الملف غير مدعوم. يجب اختيار ملف بصيغة .aurapack");
    }

    const manifestLen = headerView.getUint32(12, true);
    if (manifestLen <= 0 || 16 + manifestLen > pack.size) {
      throw new Error("بيانات الملف غير مكتملة أو تالفة.");
    }

    let manifest: any;
    try {
      manifest = JSON.parse(decodeUtf8(await readExact(handle, manifestLen)));
    } catch {
      throw new Error("تعذر قراءة فهرس ملف النسخة الاحتياطية.");
    }

    const songs: any[] = manifest.songs || [];
    let importedCount = 0;
    let errors = 0;

    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const trackSize = song.audioByteLength || 0;
      const trackStart: number = handle.offset ?? 0;

      if (onProgress) {
        onProgress({
          phase: "importing",
          current: i + 1,
          total: songs.length,
          currentSongTitle: song.title || `أغنية ${i + 1}`,
          percentage: Math.round(((i + 1) / songs.length) * 100),
        });
      }

      try {
        let localUri: string | undefined;

        if (trackSize > 0) {
          if (trackStart + trackSize > pack.size) {
            throw new Error("الملف أقصر من المتوقع.");
          }
          const target = new File(FileManager.getAudioPath(song.songId));
          target.create({ intermediates: true, overwrite: true });
          const writeHandle: any = target.open(FileMode.WriteOnly);
          try {
            await copyChunked(handle, writeHandle, trackSize);
          } finally {
            writeHandle.close();
          }
          localUri = target.uri;
        }

        if (song.lyrics) {
          saveLyrics({
            songId: song.songId,
            plainLyrics: song.lyrics,
            syncedLyrics: null,
            source: "imported",
          }).catch(() => {});
        }

        const songObj: Song = {
          id: song.songId,
          title: song.title,
          artist: song.artist,
          albumName: song.albumName,
          folderName: song.folderName,
          thumbnailUrl: song.thumbnailUrl,
          youtubeVideoId: song.youtubeVideoId,
          duration: song.duration || 210,
          isDownloaded: Boolean(localUri),
          localFilePath: localUri,
          fileSize: trackSize,
          downloadedAt: song.savedAt || Date.now(),
        };

        await upsertSong(songObj);
        if (localUri) {
          await markSongDownloaded(song.songId, localUri, trackSize, song.thumbnailUrl);
        }
        importedCount++;
      } catch (err) {
        console.warn(`[BackupTransfer] Error importing song ${song.songId}:`, err);
        errors++;
        handle.offset = trackStart + trackSize;
      }
    }

    return { importedCount, errors };
  } finally {
    handle.close();
  }
}

/**
 * Imports a .aurapack backup file into the local offline storage.
 */
export async function importOfflineLibrary(
  file: File | Blob,
  onProgress?: (progress: BackupProgress) => void
): Promise<{ importedCount: number; errors: number }> {
  if (file.size < 16) {
    throw new Error("الملف المحدد تالف أو غير صالح.");
  }

  const headerBuffer = await file.slice(0, 16).arrayBuffer();
  const headerView = new DataView(headerBuffer);

  let magic = "";
  for (let i = 0; i < 8; i++) {
    magic += String.fromCharCode(headerView.getUint8(i));
  }

  if (magic !== MAGIC) {
    throw new Error("تنسيق الملف غير مدعوم. يجب اختيار ملف بصيغة .aurapack");
  }

  const manifestLen = headerView.getUint32(12, true);
  if (manifestLen <= 0 || 16 + manifestLen > file.size) {
    throw new Error("بيانات الملف غير مكتملة أو تالفة.");
  }

  const manifestText = await file.slice(16, 16 + manifestLen).text();
  let manifest: any;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error("تعذر قراءة فهرس ملف النسخة الاحتياطية.");
  }

  const songs: any[] = manifest.songs || [];
  let byteOffset = 16 + manifestLen;
  let importedCount = 0;
  let errors = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const trackSize = song.audioByteLength || 0;

    if (onProgress) {
      onProgress({
        phase: "importing",
        current: i + 1,
        total: songs.length,
        currentSongTitle: song.title || `أغنية ${i + 1}`,
        percentage: Math.round(((i + 1) / songs.length) * 100),
      });
    }

    try {
      if (trackSize > 0 && byteOffset + trackSize <= file.size) {
        const audioSlice = file.slice(byteOffset, byteOffset + trackSize, song.mimeType || "audio/mpeg");

        if (Platform.OS === "web") {
          await storeOfflineAudioBlob(song.songId, audioSlice);
        }

        byteOffset += trackSize;
      }

      if (song.lyrics) {
        await storeOfflineLyrics(song.songId, song.lyrics);
        saveLyrics({
          songId: song.songId,
          plainLyrics: song.lyrics,
          syncedLyrics: null,
          source: "imported",
        }).catch(() => {});
      }

      const songObj: Song = {
        id: song.songId,
        title: song.title,
        artist: song.artist,
        albumName: song.albumName,
        folderName: song.folderName,
        thumbnailUrl: song.thumbnailUrl,
        youtubeVideoId: song.youtubeVideoId,
        duration: song.duration || 210,
        isDownloaded: true,
        localFilePath: `indexeddb://${song.songId}`,
        fileSize: trackSize,
        downloadedAt: song.savedAt || Date.now(),
      };

      await upsertSong(songObj);
      await markSongDownloaded(song.songId, `indexeddb://${song.songId}`, trackSize, song.thumbnailUrl);
      importedCount++;
    } catch (err) {
      console.warn(`[BackupTransfer] Error importing song ${song.songId}:`, err);
      errors++;
      byteOffset += trackSize;
    }
  }

  return { importedCount, errors };
}

