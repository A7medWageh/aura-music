export type RepeatMode = "off" | "one" | "all";

export interface Song {
  id: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  thumbnailUrl?: string;
  duration?: number; // duration in seconds
  albumName?: string;
  folderName?: string;
  isHidden?: boolean;
  streamUrl?: string;
  audioUrl?: string;
  // Offline metadata
  isDownloaded?: boolean;
  localFilePath?: string;
  localArtworkPath?: string;
  fileSize?: number; // bytes
  downloadedAt?: number;
  playCount?: number;
  lastPlayedAt?: number;
  viewCount?: number;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  year?: string;
  songs: Song[];
}

export interface Artist {
  id: string;
  name: string;
  imageUrl?: string;
  bio?: string;
  songs: Song[];
  albums?: Album[];
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
  songs?: Song[];
  songCount?: number;
}

export interface LyricsData {
  songId: string;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  source: string;
}

export interface SyncedLyricLine {
  timeMs: number;
  text: string;
}

export interface DownloadProgress {
  songId: string;
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
  bytesWritten: number;
  totalBytes: number;
  progress: number; // 0 to 1
  status: "pending" | "downloading" | "completed" | "failed" | "paused";
  error?: string;
}

