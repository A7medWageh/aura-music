import type { AudioSourceType } from "@/utils/audioDiagnostics";

export type RepeatMode = "off" | "one" | "all";

export type QueueSong = {
  songId: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  thumbnailUrl?: string;
  albumName?: string;
  folderName?: string;
  streamUrl?: string;
  audioReady?: boolean;
  metadata?: any;
  moodTag?: string | null;
  energyScore?: number | null;
};

export type PlayerState = {
  currentSongId: string | null;
  queue: QueueSong[];
  volume: number;
  speed: number;
  shuffle: boolean;
  repeat: RepeatMode;
  isPlaying: boolean;
  streamUrl: string | null;
  sourceType: AudioSourceType;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  error: string | null;
  isHighQuality: boolean;
  isAiMix: boolean;
  soundBoost: number;
  is8dActive: boolean;
};

export const initialPlayerState: PlayerState = {
  currentSongId: null,
  queue: [],
  volume: 0.8,
  speed: 1,
  shuffle: false,
  repeat: "off",
  isPlaying: false,
  streamUrl: null,
  sourceType: null,
  currentTime: 0,
  duration: 0,
  isBuffering: false,
  error: null,
  isHighQuality: true,
  isAiMix: false,
  soundBoost: 1.0,
  is8dActive: false,
};

