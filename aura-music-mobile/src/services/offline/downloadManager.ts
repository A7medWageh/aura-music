import { Platform, Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { Song, DownloadProgress } from "@/types/music";
import { FileManager } from "@/services/storage/fileManager";
import { MusicApi } from "@/services/api/musicApi";
import { upsertSong, markSongDownloaded, removeDownloadedSongRecord } from "@/database/db";
import {
  storeOfflineAudioBlob,
  deleteOfflineAudioBlob,
  storeOfflineLyrics,
} from "@/database/webOfflineStorage";

type ProgressListener = (progress: DownloadProgress) => void;

class DownloadManagerService {
  private activeDownloads: Map<string, FileSystem.DownloadResumable> = new Map();
  private progressMap: Map<string, DownloadProgress> = new Map();
  private listeners: Set<ProgressListener> = new Set();

  public subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(progress: DownloadProgress): void {
    this.progressMap.set(progress.songId, progress);
    this.listeners.forEach((l) => l(progress));
  }

  public getProgress(songId: string): DownloadProgress | undefined {
    return this.progressMap.get(songId);
  }

  public isDownloading(songId: string): boolean {
    return this.activeDownloads.has(songId);
  }

  /**
   * Start downloading a song for permanent offline playback
   */
  public async downloadSong(song: Song): Promise<boolean> {
    if (Platform.OS === "web") {
      const songId = song.id;
      this.notify({
        songId,
        title: song.title,
        artist: song.artist,
        thumbnailUrl: song.thumbnailUrl,
        bytesWritten: 0,
        totalBytes: 100,
        progress: 0.1,
        status: "downloading",
      });

      try {
        // 1. Prioritize same-origin download proxy which bypasses CORS and sends unthrottled audio stream
        const downloadUrl = MusicApi.getDownloadUrl(song);
        let response: Response | null = null;

        try {
          response = await fetch(downloadUrl);
          if (!response.ok) {
            console.warn(`[downloadManager Web] Download endpoint status ${response.status}, trying stream URL...`);
            response = null;
          }
        } catch (fetchErr) {
          console.warn("[downloadManager Web] Fetch downloadUrl failed, trying streamUrl:", fetchErr);
        }

        if (!response) {
          const streamUrl = await MusicApi.resolveAudioStreamUrl(song);
          if (!streamUrl) throw new Error("Could not resolve stream URL for offline download");
          response = await fetch(streamUrl);
        }

        if (!response.ok) throw new Error(`HTTP error ${response.status} while fetching audio`);

        const contentLength = Number(response.headers.get("content-length")) || 3800000;
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        let lastNotifyTime = 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.length;

              const now = Date.now();
              // Throttle React state notification to ~100ms to preserve UI performance at line speed
              if (now - lastNotifyTime > 100) {
                lastNotifyTime = now;
                const p = Math.min(0.95, received / contentLength);
                this.notify({
                  songId,
                  title: song.title,
                  artist: song.artist,
                  thumbnailUrl: song.thumbnailUrl,
                  bytesWritten: received,
                  totalBytes: contentLength,
                  progress: p,
                  status: "downloading",
                });
              }
            }
          }
        } else {
          const blobData = await response.blob();
          chunks.push(new Uint8Array(await blobData.arrayBuffer()));
          received = blobData.size;
        }

        const audioBlob = new Blob(chunks as any, { type: "audio/mpeg" });
        const finalSize = audioBlob.size;

        // 3. Persist audio Blob directly into browser IndexedDB
        await storeOfflineAudioBlob(songId, audioBlob);

        // 4. Also fetch and persist lyrics for offline search & display
        try {
          const lyricsRes = await MusicApi.getLyrics(song);
          if (lyricsRes?.plainLyrics) {
            await storeOfflineLyrics(songId, lyricsRes.plainLyrics, lyricsRes.syncedLyrics || undefined);
          }
        } catch {}

        // 5. Update SQLite/localStorage metadata record
        const localPath = `indexeddb://${songId}`;
        await upsertSong({
          ...song,
          isDownloaded: true,
          localFilePath: localPath,
          fileSize: finalSize,
          downloadedAt: Date.now(),
        });
        await markSongDownloaded(songId, localPath, finalSize, song.thumbnailUrl);

        this.notify({
          songId,
          title: song.title,
          artist: song.artist,
          thumbnailUrl: song.thumbnailUrl,
          bytesWritten: finalSize,
          totalBytes: finalSize,
          progress: 1,
          status: "completed",
        });
        return true;
      } catch (err: any) {
        console.error(`[DownloadManager Web] Error downloading ${song.title}:`, err);
        this.notify({
          songId,
          title: song.title,
          artist: song.artist,
          thumbnailUrl: song.thumbnailUrl,
          bytesWritten: 0,
          totalBytes: 0,
          progress: 0,
          status: "failed",
          error: err?.message || "فشل التنزيل",
        });
        return false;
      }
    }

    const songId = song.id;

    if (this.activeDownloads.has(songId)) {
      console.log(`[DownloadManager] Already downloading song ${songId}`);
      return false;
    }

    await FileManager.ensureDirectories();
    const targetAudioPath = FileManager.getAudioPath(songId);

    // Initial progress notification
    this.notify({
      songId,
      title: song.title,
      artist: song.artist,
      thumbnailUrl: song.thumbnailUrl,
      bytesWritten: 0,
      totalBytes: 1,
      progress: 0,
      status: "downloading",
    });

    try {
      // 1. Prepare download URL
      const downloadUrl = MusicApi.getDownloadUrl(song);

      // 2. Setup resumable downloader
      const downloadResumable = FileSystem.createDownloadResumable(
        downloadUrl,
        targetAudioPath,
        {},
        (downloadProgress) => {
          const total = downloadProgress.totalBytesExpectedToWrite;
          const written = downloadProgress.totalBytesWritten;
          const progress = total > 0 ? written / total : 0;

          this.notify({
            songId,
            title: song.title,
            artist: song.artist,
            thumbnailUrl: song.thumbnailUrl,
            bytesWritten: written,
            totalBytes: total,
            progress: Math.min(1, Math.max(0, progress)),
            status: "downloading",
          });
        }
      );

      this.activeDownloads.set(songId, downloadResumable);

      // 3. Execute download
      const result = await downloadResumable.downloadAsync();
      this.activeDownloads.delete(songId);

      if (!result || !result.uri) {
        throw new Error("Download returned empty result");
      }

      // 4. Verify file integrity (must be > 30KB)
      const isValid = await FileManager.verifyAudioFile(result.uri);
      if (!isValid) {
        await FileManager.deleteDownloadedAudio(result.uri);
        throw new Error("Downloaded file failed integrity check (corrupted or too small)");
      }

      // 5. Cache artwork locally if available
      let localArtworkPath: string | undefined = undefined;
      if (song.thumbnailUrl) {
        const cached = await FileManager.cacheArtwork(songId, song.thumbnailUrl);
        if (cached) localArtworkPath = cached;
      }

      // 6. Inspect file size
      const fileInfo = await FileSystem.getInfoAsync(result.uri);
      const fileSize = (fileInfo.exists && fileInfo.size) || 0;

      // 7. Update SQLite persistent database
      await upsertSong({
        ...song,
        isDownloaded: true,
        localFilePath: result.uri,
        localArtworkPath,
        fileSize,
        downloadedAt: Date.now(),
      });

      await markSongDownloaded(songId, result.uri, fileSize, localArtworkPath);

      // 8. Notify completion
      this.notify({
        songId,
        bytesWritten: fileSize,
        totalBytes: fileSize,
        progress: 1,
        status: "completed",
      });

      return true;
    } catch (err: any) {
      console.error(`[DownloadManager] Download failed for song ${songId}:`, err);
      this.activeDownloads.delete(songId);

      // Clean up partial file
      await FileManager.deleteDownloadedAudio(targetAudioPath);

      this.notify({
        songId,
        bytesWritten: 0,
        totalBytes: 0,
        progress: 0,
        status: "failed",
        error: err?.message || "Download failed",
      });

      return false;
    }
  }

  /**
   * Pause an ongoing download
   */
  public async pauseDownload(songId: string): Promise<void> {
    const download = this.activeDownloads.get(songId);
    if (download && Platform.OS !== "web") {
      try {
        await download.pauseAsync();
      } catch (e) {
        console.warn("[DownloadManager] pauseAsync error:", e);
      }
    }
    const current = this.progressMap.get(songId);
    if (current) {
      this.notify({
        ...current,
        status: "paused",
      });
    }
  }

  /**
   * Resume a paused download
   */
  public async resumeDownload(songId: string, song?: Song): Promise<void> {
    const download = this.activeDownloads.get(songId);
    if (download && Platform.OS !== "web") {
      try {
        await download.resumeAsync();
        const current = this.progressMap.get(songId);
        if (current) {
          this.notify({
            ...current,
            status: "downloading",
          });
        }
        return;
      } catch (e) {
        console.warn("[DownloadManager] resumeAsync error, restarting download:", e);
      }
    }
    if (song) {
      await this.downloadSong(song);
    }
  }

  /**
   * Cancel an ongoing download
   */
  public async cancelDownload(songId: string): Promise<void> {
    const download = this.activeDownloads.get(songId);
    if (download) {
      try {
        await download.cancelAsync();
      } catch {
        /* ignore */
      }
      this.activeDownloads.delete(songId);
      const targetAudioPath = FileManager.getAudioPath(songId);
      await FileManager.deleteDownloadedAudio(targetAudioPath);

      this.notify({
        songId,
        bytesWritten: 0,
        totalBytes: 0,
        progress: 0,
        status: "failed",
        error: "Download cancelled by user",
      });
    }
  }

  /**
   * Delete a downloaded song from storage and database
   */
  public async deleteDownloadedSong(song: Song): Promise<void> {
    if (Platform.OS === "web") {
      await deleteOfflineAudioBlob(song.id);
      await removeDownloadedSongRecord(song.id);
      this.progressMap.delete(song.id);
      return;
    }

    const targetAudioPath = song.localFilePath || FileManager.getAudioPath(song.id);
    const targetArtworkPath = song.localArtworkPath || FileManager.getArtworkPath(song.id);

    await FileManager.deleteDownloadedAudio(targetAudioPath, targetArtworkPath);
    await removeDownloadedSongRecord(song.id);

    this.progressMap.delete(song.id);
  }
}

export const downloadManager = new DownloadManagerService();

