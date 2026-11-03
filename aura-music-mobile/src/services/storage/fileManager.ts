import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const isNative = Platform.OS !== "web";
const AUDIO_DIR = isNative && FileSystem.documentDirectory ? `${FileSystem.documentDirectory}aura_audio/` : "";
const ARTWORK_DIR = isNative && FileSystem.documentDirectory ? `${FileSystem.documentDirectory}aura_artwork/` : "";

export const FileManager = {
  /**
   * Ensure audio and artwork folders exist in the document directory (Native only)
   */
  async ensureDirectories(): Promise<void> {
    if (!isNative || !AUDIO_DIR) return;
    try {
      const audioInfo = await FileSystem.getInfoAsync(AUDIO_DIR);
      if (!audioInfo.exists) {
        await FileSystem.makeDirectoryAsync(AUDIO_DIR, { intermediates: true });
      }

      const artworkInfo = await FileSystem.getInfoAsync(ARTWORK_DIR);
      if (!artworkInfo.exists) {
        await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });
      }
    } catch (err) {
      console.warn("[FileManager.ensureDirectories] Error:", err);
    }
  },

  /**
   * Get target audio path for a given song ID
   */
  getAudioPath(songId: string): string {
    if (!isNative || !AUDIO_DIR) return "";
    const safeId = songId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${AUDIO_DIR}${safeId}.mp3`;
  },

  /**
   * Get target artwork path for a given song ID
   */
  getArtworkPath(songId: string): string {
    if (!isNative || !ARTWORK_DIR) return "";
    const safeId = songId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${ARTWORK_DIR}${safeId}.jpg`;
  },

  /**
   * Verify whether a file exists and has valid audio data (size > 30KB)
   */
  async verifyAudioFile(filePath: string | undefined | null): Promise<boolean> {
    if (!isNative || !filePath) return false;
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      return info.exists && !info.isDirectory && (info.size ?? 0) > 30000;
    } catch {
      return false;
    }
  },

  /**
   * Cache artwork image locally
   */
  async cacheArtwork(songId: string, remoteUrl: string | undefined): Promise<string | null> {
    if (!isNative || !remoteUrl || !remoteUrl.startsWith("http")) return remoteUrl || null;
    await this.ensureDirectories();
    const localPath = this.getArtworkPath(songId);
    if (!localPath) return remoteUrl;

    try {
      const existing = await FileSystem.getInfoAsync(localPath);
      if (existing.exists && (existing.size ?? 0) > 1000) {
        return localPath;
      }
      const download = await FileSystem.downloadAsync(remoteUrl, localPath);
      return download.uri;
    } catch {
      return remoteUrl;
    }
  },

  /**
   * Delete an audio file and its artwork from disk
   */
  async deleteDownloadedAudio(localFilePath?: string, localArtworkPath?: string): Promise<void> {
    if (!isNative) return;

    if (localFilePath) {
      try {
        const info = await FileSystem.getInfoAsync(localFilePath);
        if (info.exists) {
          await FileSystem.deleteAsync(localFilePath, { idempotent: true });
        }
      } catch (err) {
        console.warn("[FileManager.deleteDownloadedAudio] Failed to delete audio:", err);
      }
    }

    if (localArtworkPath) {
      try {
        const info = await FileSystem.getInfoAsync(localArtworkPath);
        if (info.exists) {
          await FileSystem.deleteAsync(localArtworkPath, { idempotent: true });
        }
      } catch {
        /* ignore */
      }
    }
  },

  /**
   * Calculate storage used by downloaded audio
   */
  async getStorageUsage(): Promise<{ totalBytes: number; fileCount: number; formattedSize: string }> {
    if (!isNative || !AUDIO_DIR) {
      return { totalBytes: 0, fileCount: 0, formattedSize: "0 MB" };
    }

    await this.ensureDirectories();
    try {
      const files = await FileSystem.readDirectoryAsync(AUDIO_DIR);
      let totalBytes = 0;

      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(`${AUDIO_DIR}${file}`);
        if (fileInfo.exists && !fileInfo.isDirectory) {
          totalBytes += fileInfo.size || 0;
        }
      }

      let formattedSize = "0 MB";
      if (totalBytes > 1024 * 1024 * 1024) {
        formattedSize = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      } else if (totalBytes > 1024 * 1024) {
        formattedSize = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
      } else {
        formattedSize = `${(totalBytes / 1024).toFixed(0)} KB`;
      }

      return {
        totalBytes,
        fileCount: files.length,
        formattedSize,
      };
    } catch {
      return { totalBytes: 0, fileCount: 0, formattedSize: "0 MB" };
    }
  },
};
