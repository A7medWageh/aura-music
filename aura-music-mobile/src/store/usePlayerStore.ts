import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Song, RepeatMode } from "@/types/music";
import { audioService } from "@/services/audio/audioService";
import {
  isSoundPreset,
  type SoundPreset,
} from "@/services/audio/soundPresets";
import { savePlaybackSession, loadPlaybackSession } from "@/database/db";
import { auraSoundEngine } from "@/services/audio/auraSoundEngine";
import { type AuraAudioProfile } from "@/services/audio/auraSoundEngineTypes";

const SOUND_PRESET_KEY = "aura-sound-preset";
const SOUND_BOOST_KEY = "aura-sound-boost";

interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  queueIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number; // in seconds
  duration: number; // in seconds
  repeatMode: RepeatMode;
  shuffle: boolean;
  volume: number;
  playbackRate: number;
  soundPreset: SoundPreset;
  soundBoost: number;
  is8dActive: boolean;
  isAuraBypassed: boolean;
  auraProfile: AuraAudioProfile;
  vocalClarity: number;
  bassDepth: number;
  spatialWidth: number;
  isAiMix: boolean;
  isHighQuality: boolean;
  sleepTimerMinutes: number | null;
  sleepTimerEndsAt: number | null;
  bgMode: "calm" | "balanced" | "epic";
  isFullPlayerVisible: boolean;
  isLyricsVisible: boolean;
  error: string | null;

  // Actions
  initPlayer: () => Promise<void>;
  playSong: (song: Song, queue?: Song[], index?: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  skipBy: (deltaSeconds: number) => Promise<void>;
  closePlayer: () => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setFullPlayerVisible: (visible: boolean) => void;
  setLyricsVisible: (visible: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => Promise<void>;
  setSoundPreset: (preset: SoundPreset) => Promise<void>;
  setSoundBoost: (boost: number) => Promise<void>;
  setIs8dActive: (active: boolean) => Promise<void>;
  toggleAuraBypass: () => void;
  setAuraProfile: (profile: AuraAudioProfile) => void;
  setVocalClarity: (val: number) => void;
  setBassDepth: (val: number) => void;
  setSpatialWidth: (val: number) => void;
  test8dSound: (onStep?: (msg: string) => void) => void;
  setIsAiMix: (active: boolean) => void;
  setHighQuality: (active: boolean) => void;
  setSleepTimer: (minutes: number | null) => void;
  setBgMode: (mode: "calm" | "balanced" | "epic") => void;
}

let isServiceSubscribed = false;
let sleepTimerHandle: ReturnType<typeof setInterval> | null = null;

// Streaming seeks take a moment to land; until the audio clock catches up it keeps reporting the
// pre-seek position, which would yank the scrubber back. Hold the requested target in the UI.
let seekHoldTargetSec = -1;
let seekHoldUntil = 0;
const SEEK_HOLD_MS = 4000;
const SEEK_TOLERANCE_SEC = 1.25;

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isBuffering: false,
  position: 0,
  duration: 0,
  repeatMode: "off",
  shuffle: false,
  volume: 1.0,
  playbackRate: 1.0,
  soundPreset: "off",
  soundBoost: 1.0,
  is8dActive: false,
  isAuraBypassed: false,
  auraProfile: "speaker",
  vocalClarity: 0.5,
  bassDepth: 0.5,
  spatialWidth: 1.0,
  isAiMix: false,
  isHighQuality: true,
  sleepTimerMinutes: null,
  sleepTimerEndsAt: null,
  bgMode: "balanced",
  isFullPlayerVisible: false,
  isLyricsVisible: false,
  error: null,

  initPlayer: async () => {
    // 1. Initialize native audio session
    await audioService.initAudioSession();

    // 2. Subscribe to audio service status updates
    if (!isServiceSubscribed) {
      isServiceSubscribed = true;
      audioService.subscribe((status) => {
        const { currentSong, repeatMode, nextTrack } = get();

        const posSec = (status.positionMillis && isFinite(status.positionMillis)) ? status.positionMillis / 1000 : 0;
        const durSec = (status.durationMillis && isFinite(status.durationMillis) && status.durationMillis > 0)
          ? status.durationMillis / 1000
          : (currentSong?.duration || 0);

        let displayPos = posSec;
        if (seekHoldTargetSec >= 0) {
          if (Math.abs(posSec - seekHoldTargetSec) <= SEEK_TOLERANCE_SEC || Date.now() > seekHoldUntil) {
            seekHoldTargetSec = -1;
          } else {
            displayPos = seekHoldTargetSec;
          }
        }

        set({
          isPlaying: Boolean(status.isPlaying),
          position: Math.max(0, displayPos),
          duration: Math.max(0, durSec),
          isBuffering: Boolean(status.isBuffering),
          error: status.error || null,
        });

        // Handle auto-advance when track finishes
        if (status.didJustFinish) {
          if (repeatMode === "one" && currentSong) {
            audioService.seekTo(0).then(() => audioService.resume());
          } else {
            nextTrack();
          }
        }
      });
    }

    // 3. Restore previous session from persistent SQLite DB
    try {
      const session = await loadPlaybackSession();
      if (session && session.queue && session.queue.length > 0) {
        const idx = session.currentSongId
          ? session.queue.findIndex((s) => s.id === session.currentSongId)
          : 0;
        const current = idx >= 0 ? session.queue[idx] : session.queue[0];

        set({
          queue: session.queue,
          queueIndex: idx >= 0 ? idx : 0,
          currentSong: current,
          position: session.position || 0,
          duration: session.duration || 0,
          repeatMode: session.repeatMode || "off",
          shuffle: session.shuffle || false,
        });
      }
    } catch (e) {
      console.warn("[initPlayer] Error restoring session:", e);
    }

    // 4. Restore the saved sound profile and arm the Web Audio engine
    try {
      await auraSoundEngine.loadPersistedSettings();
      const cfg = auraSoundEngine.getConfig();
      set({
        soundPreset: (cfg.presetId as SoundPreset) || "off",
        soundBoost: cfg.soundBoost || 1.0,
        isAuraBypassed: cfg.isBypassed,
        auraProfile: cfg.profile,
        vocalClarity: cfg.vocalClarity,
        bassDepth: cfg.bassDepth,
        spatialWidth: cfg.spatialWidth,
        is8dActive: cfg.is8dActive,
      });
      const saved = cfg.presetId;
      if (isSoundPreset(saved)) {
        set({ soundPreset: saved });
        await audioService.setSoundPreset(saved);
      }
      const savedBoost = await AsyncStorage.getItem(SOUND_BOOST_KEY);
      const boostValue = savedBoost ? Number(savedBoost) : 1;
      if (isFinite(boostValue) && boostValue > 1) {
        const boost = Math.min(2, boostValue);
        set({ soundBoost: boost });
        await audioService.setBoost(boost);
      }
    } catch (e) {
      console.warn("[initPlayer] Error restoring sound preset:", e);
    }
  },

  playSong: async (song: Song, newQueue?: Song[], index?: number) => {
    seekHoldTargetSec = -1;
    seekHoldUntil = 0;
    let queue = newQueue ? [...newQueue] : get().queue;
    let queueIndex = typeof index === "number" ? index : queue.findIndex((s) => s.id === song.id);

    if (queueIndex === -1) {
      queue = [song, ...queue];
      queueIndex = 0;
    }

    set({
      currentSong: song,
      queue,
      queueIndex,
      isBuffering: true,
      error: null,
      position: 0,
      duration: song.duration || 0,
    });

    const success = await audioService.playSong(song);
    if (success) {
      savePlaybackSession(
        song.id,
        0,
        song.duration || 0,
        get().repeatMode,
        get().shuffle,
        queue
      );
    }
  },

  togglePlay: async () => {
    const { isPlaying, currentSong, playSong } = get();
    if (!currentSong) return;

    if (audioService.getCurrentSong()) {
      await audioService.togglePlay();
    } else {
      await playSong(currentSong);
    }
  },

  pause: async () => {
    await audioService.pause();
    const { currentSong, position, duration, repeatMode, shuffle, queue } = get();
    if (currentSong) {
      savePlaybackSession(currentSong.id, position, duration, repeatMode, shuffle, queue);
    }
  },

  resume: async () => {
    await audioService.resume();
  },

  seekTo: async (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return;
    seekHoldTargetSec = seconds;
    seekHoldUntil = Date.now() + SEEK_HOLD_MS;
    set({ position: seconds });
    await audioService.seekTo(seconds * 1000);
  },

  skipBy: async (deltaSeconds: number) => {
    const { position, duration, seekTo } = get();
    const upper = duration > 1 ? duration - 0.5 : Number.MAX_SAFE_INTEGER;
    const target = Math.max(0, Math.min(upper, position + deltaSeconds));
    if (!isFinite(target) || isNaN(target)) return;
    await seekTo(target);
  },

  closePlayer: async () => {
    seekHoldTargetSec = -1;
    seekHoldUntil = 0;
    const { repeatMode, shuffle } = get();
    await audioService.stop();
    set({
      currentSong: null,
      queue: [],
      queueIndex: -1,
      isPlaying: false,
      isBuffering: false,
      position: 0,
      duration: 0,
      isFullPlayerVisible: false,
      error: null,
    });
    savePlaybackSession(null, 0, 0, repeatMode, shuffle, []).catch(() => {});
  },

  nextTrack: async () => {
    const { queue, queueIndex, shuffle, repeatMode, playSong } = get();
    if (queue.length === 0) return;

    let nextIndex: number;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = queueIndex + 1;
    }

    if (nextIndex >= queue.length) {
      if (repeatMode === "all") {
        nextIndex = 0;
      } else {
        // Queue finished
        return;
      }
    }

    const nextSong = queue[nextIndex];
    if (nextSong) {
      await playSong(nextSong, queue, nextIndex);
    }
  },

  prevTrack: async () => {
    const { queue, queueIndex, position, playSong, seekTo } = get();
    if (queue.length === 0) return;

    // If more than 3 seconds in, restart current track
    if (position > 3) {
      await seekTo(0);
      return;
    }

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      prevIndex = queue.length - 1;
    }

    const prevSong = queue[prevIndex];
    if (prevSong) {
      await playSong(prevSong, queue, prevIndex);
    }
  },

  setRepeatMode: (mode: RepeatMode) => {
    set({ repeatMode: mode });
  },

  toggleShuffle: () => {
    set((state) => ({ shuffle: !state.shuffle }));
  },

  addToQueue: (song: Song) => {
    set((state) => ({ queue: [...state.queue, song] }));
  },

  removeFromQueue: (index: number) => {
    set((state) => {
      const newQueue = [...state.queue];
      newQueue.splice(index, 1);
      let newIndex = state.queueIndex;
      if (index < state.queueIndex) {
        newIndex--;
      }
      return { queue: newQueue, queueIndex: newIndex };
    });
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: -1 });
  },

  setFullPlayerVisible: (visible: boolean) => {
    set({ isFullPlayerVisible: visible });
  },

  setLyricsVisible: (visible: boolean) => {
    set({ isLyricsVisible: visible });
  },

  setVolume: (volume: number) => {
    set({ volume });
    audioService.setVolume(volume);
  },

  setPlaybackRate: async (rate: number) => {
    set({ playbackRate: rate });
    await audioService.setRate(rate);
  },

  setSoundPreset: async (preset: SoundPreset) => {
    set({ soundPreset: preset, is8dActive: preset === "spatial", isAuraBypassed: false });
    auraSoundEngine.setPreset(preset);
    AsyncStorage.setItem(SOUND_PRESET_KEY, preset).catch(() => {});
    await audioService.setSoundPreset(preset);
  },

  setSoundBoost: async (boost: number) => {
    const clamped = Math.max(1, Math.min(2, boost));
    set({ soundBoost: clamped });
    auraSoundEngine.setBoost(clamped);
    AsyncStorage.setItem(SOUND_BOOST_KEY, String(clamped)).catch(() => {});
    await audioService.setBoost(clamped);
  },

  setIs8dActive: async (active: boolean) => {
    set({ is8dActive: active });
    const targetPreset: SoundPreset = active ? "spatial" : "off";
    set({ soundPreset: targetPreset });
    auraSoundEngine.set8DActive(active);
    await audioService.setSoundPreset(targetPreset);
  },

  test8dSound: (onStep?: (msg: string) => void) => {
    audioService.test8dSound(onStep);
  },

  toggleAuraBypass: () => {
    const current = get().isAuraBypassed;
    const next = !current;
    set({ isAuraBypassed: next });
    auraSoundEngine.setBypassed(next);
  },

  setAuraProfile: (profile: AuraAudioProfile) => {
    set({ auraProfile: profile });
    auraSoundEngine.setProfile(profile);
  },

  setVocalClarity: (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    set({ vocalClarity: clamped });
    auraSoundEngine.setVocalClarity(clamped);
  },

  setBassDepth: (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    set({ bassDepth: clamped });
    auraSoundEngine.setBassDepth(clamped);
  },

  setSpatialWidth: (val: number) => {
    const clamped = Math.max(0, Math.min(2, val));
    set({ spatialWidth: clamped });
    auraSoundEngine.setSpatialWidth(clamped);
  },

  setIsAiMix: (active: boolean) => {
    set({ isAiMix: active });
  },

  setHighQuality: (active: boolean) => {
    set({ isHighQuality: active });
  },

  setBgMode: (mode: "calm" | "balanced" | "epic") => {
    set({ bgMode: mode });
  },

  setSleepTimer: (minutes: number | null) => {
    if (sleepTimerHandle) {
      clearInterval(sleepTimerHandle);
      sleepTimerHandle = null;
    }

    if (!minutes || minutes <= 0) {
      set({ sleepTimerMinutes: null, sleepTimerEndsAt: null });
      return;
    }

    const endsAt = Date.now() + minutes * 60 * 1000;
    set({ sleepTimerMinutes: minutes, sleepTimerEndsAt: endsAt });

    sleepTimerHandle = setInterval(() => {
      const state = get();
      if (!state.sleepTimerEndsAt) {
        if (sleepTimerHandle) clearInterval(sleepTimerHandle);
        return;
      }

      if (Date.now() >= state.sleepTimerEndsAt) {
        if (sleepTimerHandle) {
          clearInterval(sleepTimerHandle);
          sleepTimerHandle = null;
        }
        set({ sleepTimerMinutes: null, sleepTimerEndsAt: null });
        state.pause();
      }
    }, 1000);
  },
}));

