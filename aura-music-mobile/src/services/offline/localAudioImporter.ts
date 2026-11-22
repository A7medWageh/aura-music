/**
 * localAudioImporter.ts
 *
 * Imports downloaded audio files (e.g. from Telegram iOS cache or Files app)
 * directly into the Aura Music offline library with 0 MB internet consumption.
 * Automatically detects the singer / artist and merges the track into that
 * artist's existing folder in the library without creating duplicate or generic folders.
 */

import { File } from "expo-file-system";
import { Song } from "@/types/music";
import { getDownloadedSongs, upsertSong, markSongDownloaded } from "@/database/db";
import { FileManager } from "@/services/storage/fileManager";
import { MusicApi } from "@/services/api/musicApi";
import { normalizeArabicName } from "@/utils/latinize";

function sanitizeName(value: string): string {
  return value
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/@\w+/g, " ")
    .replace(/[\[\(][^\]\)]*[\]\)]/g, " ")
    .replace(/\b(202[0-9]|201[0-9])\b/g, " ")
    .replace(/^[-–—:|.\s]+|[-–—:|.\s]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAudioFileName(fileName: string): { title: string; artist: string } {
  // Strip audio file extensions
  let clean = sanitizeName(fileName.replace(/\.(mp3|m4a|aac|flac|wav|ogg|opus|webm|alac|aiff)$/i, ""))
    .replace(/[_]/g, " ")
    .replace(
      /\b(Official\s*(?:Music\s*)?Video|Official\s*Audio|Lyric\s*Video|Music\s*Video|Visualizer|HD|HQ|4K)\b/gi,
      " "
    )
    .replace(/(فيديو\s*كليب|كليب\s*رسمي|أغنية\s*رسمية|حصريا|نسخة\s*أصلية|بجودة|تحميل)/gi, " ");

  let artist = "";
  let title = clean;

  // Pattern: "Artist - Title" or "Title - Artist"
  const dashSplit = clean.split(/\s*[-–—|:]\s*/).filter(Boolean);
  if (dashSplit.length >= 2) {
    const part0 = dashSplit[0].trim();
    const part1 = dashSplit.slice(1).join(" - ").trim();

    // Check 'غناء / أداء / بصوت'
    const singerMatch = clean.match(/(?:غناء|أداء|اداء|بصوت)\s*["“'«]?\s*([\u0621-\u064A]{2,}(?:\s+["“'«]?[\u0621-\u064A]{2,}){1,3})/i);
    if (singerMatch) {
      artist = singerMatch[1].replace(/["“'«»”]/g, "").trim();
      title = clean.replace(singerMatch[0], "").replace(/\s*[-–—|:]\s*/g, " ").trim();
    } else {
      // By default in Arabic downloads: "Artist - Title" or "Title - Artist"
      // If part0 looks like a singer (1-4 words), use part0 as artist
      if (part0.split(" ").length <= 4) {
        artist = part0;
        title = part1;
      } else {
        title = part0;
        artist = part1;
      }
    }
  }

  title = sanitizeName(title);
  artist = sanitizeName(artist);

  // Prefer the shortest meaningful segment of a long YouTube-style file name
  if (title.split(" ").length > 9 || title.length > 64) {
    const segments = title.split(/\s*[-–—|]\s*/).map((s) => s.trim()).filter((s) => s.length >= 3);
    const best = segments.find((s) => !/مسلسل|تتر|غناء|أداء|بصوت|انتاج|إنتاج|قناة|كليب/i.test(s));
    if (best) title = best;
  }

  return {
    title: title || clean || "أغنية تيليجرام",
    artist: artist || "فنان غير معروف",
  };
}

async function resolveImportedArtwork(
  songId: string,
  title: string,
  artist: string
): Promise<{ thumbnailUrl?: string; localArtworkPath?: string } | null> {
  try {
    const searchResult = await Promise.race([
      MusicApi.search(`${artist} ${title}`.trim()),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
    ]);
    if (!searchResult) return null;

    const match = (searchResult.songs || []).find(
      (s) =>
        s.thumbnailUrl &&
        (normalizeArabicName(s.title).includes(normalizeArabicName(title)) ||
          normalizeArabicName(title).includes(normalizeArabicName(s.title)))
    );
    if (!match?.thumbnailUrl) return null;

    const localArtworkPath = await FileManager.cacheArtwork(songId, match.thumbnailUrl);
    return { thumbnailUrl: match.thumbnailUrl, localArtworkPath: localArtworkPath || undefined };
  } catch {
    return null;
  }
}

export async function pickAndImportLocalTelegramAudio(): Promise<{
  success: boolean;
  song?: Song;
  matchedFolder?: string;
  error?: string;
}> {
  try {
    // 1. Pick audio file from device storage (Files app / Telegram download)
    const pickResult = await File.pickFileAsync({
      mimeTypes: [
        "audio/*",
        "audio/mpeg",
        "audio/mp4",
        "audio/x-m4a",
        "audio/aac",
        "audio/wav",
        "audio/flac",
        "audio/ogg",
      ],
    });

    if (!pickResult || pickResult.canceled || !pickResult.result) {
      return { success: false, error: "تم إلغاء اختيار الملف." };
    }

    const pickedFile = pickResult.result as File;
    const rawFileName = pickedFile.name || "telegram_audio.mp3";
    const { title, artist } = parseAudioFileName(rawFileName);

    // 2. Query existing library artists to find an existing folder to merge into
    const existingSongs = await getDownloadedSongs();
    const existingArtists = Array.from(
      new Set(
        existingSongs
          .map((s) => s.folderName || s.artist)
          .filter(Boolean)
          .filter((name) => name !== "تيليجرام" && name !== "فنان غير معروف")
      )
    );

    let targetFolder = artist;
    const normParsedArtist = normalizeArabicName(artist);

    if (normParsedArtist) {
      for (const existing of existingArtists) {
        const normExisting = normalizeArabicName(existing);
        if (
          normExisting === normParsedArtist ||
          normExisting.includes(normParsedArtist) ||
          normParsedArtist.includes(normExisting)
        ) {
          targetFolder = existing; // Merge directly into the existing artist folder!
          break;
        }
      }
    }

    if (!targetFolder || targetFolder === "فنان غير معروف") {
      targetFolder = artist !== "فنان غير معروف" ? artist : "موسيقى تيليجرام";
    }

    // 3. Ensure offline audio directory exists and prepare destination
    await FileManager.ensureDirectories();
    const songId = `tg_offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const destinationPath = FileManager.getAudioPath(songId);
    const destFile = new File(destinationPath);

    // Copy the local file directly — 0 MB internet, takes <0.1s
    await pickedFile.copy(destFile);

    const fileSize = destFile.size || pickedFile.size || 0;

    // 4. Best-effort artwork so downloaded files never stay blank
    const artwork = await resolveImportedArtwork(songId, title, targetFolder);

    // 5. Construct song object with targetFolder set directly to the artist's folder
    const importedSong: Song = {
      id: songId,
      title,
      artist: targetFolder,
      youtubeVideoId: songId,
      folderName: targetFolder, // Merges directly into artist's existing folder!
      duration: 240,
      isDownloaded: true,
      localFilePath: destinationPath,
      fileSize,
      thumbnailUrl: artwork?.thumbnailUrl,
      localArtworkPath: artwork?.localArtworkPath,
      downloadedAt: Date.now(),
    };

    // 6. Persist into SQLite database
    await upsertSong(importedSong);
    await markSongDownloaded(
      songId,
      destinationPath,
      fileSize,
      artwork?.localArtworkPath || artwork?.thumbnailUrl
    );

    return {
      success: true,
      song: importedSong,
      matchedFolder: targetFolder,
    };
  } catch (err: any) {
    console.error("[LocalAudioImporter] Import failed:", err);
    return {
      success: false,
      error: err?.message || "فشل استيراد الملف الصوتي.",
    };
  }
}
