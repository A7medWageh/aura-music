export type RepeatMode = "off" | "one" | "all";

export type QueueSong = {
  songId: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  thumbnailUrl?: string;
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
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  error: string | null;
  isHighQuality: boolean;
  isAiMix: boolean;
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
  currentTime: 0,
  duration: 0,
  isBuffering: false,
  error: null,
  isHighQuality: false,
  isAiMix: false
};
