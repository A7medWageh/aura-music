"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { QueueSong, RepeatMode } from "@/state/playerState";
import {
  getAudioBlob,
  getLyrics,
  getOfflineSongMeta,
} from "@/offline/indexedDbCache";
import {
  holdAudioSessionOnPause,
  releaseAudioSession,
  primeSilentCarrier,
} from "@/services/offline/audioSessionKeepAlive";
import { getProxyUrl } from "@/utils/media";

// ── Accurate Device Detection ──────────────────────────────────────────────
const isIOSDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    (/WebKit/i.test(navigator.userAgent) && /Mobile/i.test(navigator.userAgent))
  );
};

const configureAudioSession = () => {
  if (typeof navigator !== "undefined" && "audioSession" in navigator) {
    try {
      (navigator as any).audioSession.type = "playback";
    } catch {}
  }
};

export type EqualizerPreset =
  | "flat"
  | "bass_boost"
  | "vocal"
  | "electronic"
  | "acoustic"
  | "rock"
  | "custom";

export const EQ_PRESETS: Record<
  EqualizerPreset,
  { label: string; bands: [number, number, number, number, number] }
> = {
  flat: { label: "متوازن (Flat)", bands: [0, 0, 0, 0, 0] },
  bass_boost: { label: "تضخيم الباس (Bass Boost)", bands: [6, 4, 1, -1, -2] },
  vocal: { label: "نقاء الصوت (Vocal)", bands: [-2, 0, 4, 5, 2] },
  electronic: { label: "إلكتروني / راقص (Club)", bands: [5, 3, -1, 3, 5] },
  acoustic: { label: "صوتي / هادئ (Acoustic)", bands: [3, 1, 2, 2, 3] },
  rock: { label: "روك / ميتال (Rock)", bands: [4, 2, -1, 3, 5] },
  custom: { label: "مخصص (Custom)", bands: [0, 0, 0, 0, 0] },
};

export type OfflinePlayerContextValue = {
  // State
  queue: QueueSong[];
  currentSong: QueueSong | null;
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  speed: number;
  repeat: RepeatMode;
  shuffle: boolean;
  isMuted: boolean;
  isExpanded: boolean;
  isCarMode: boolean;
  hasActiveSong: boolean;
  isBuffering: boolean;
  lyrics: string | null;
  audioDetails: { mimeType: string; sizeMB: string } | null;

  // Pro Offline Features
  abLoop: { start: number | null; end: number | null; active: boolean };
  sleepTimer: {
    active: boolean;
    minutesRemaining: number;
    totalMinutes: number;
    mode: "time" | "endOfSong";
  };
  gapless: boolean;
  crossfade: number; // 0 to 12s
  equalizer: {
    enabled: boolean;
    preset: EqualizerPreset;
    bands: [number, number, number, number, number];
    bassBoost: number;
    surround3d: boolean;
  };

  // Actions
  playSongList: (songs: QueueSong[], startIndex?: number) => void;
  playSong: (song: QueueSong) => void;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (time: number) => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  setSpeed: (val: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  setIsExpanded: (open: boolean) => void;
  setIsCarMode: (open: boolean) => void;
  closeOfflinePlayer: () => void;

  // Feature Actions
  setAbPointA: () => void;
  setAbPointB: () => void;
  clearAbLoop: () => void;
  startSleepTimer: (minutes: number | "endOfSong") => void;
  cancelSleepTimer: () => void;
  setGapless: (enabled: boolean) => void;
  setCrossfade: (sec: number) => void;
  setEqualizerPreset: (preset: EqualizerPreset) => void;
  setEqualizerBand: (index: number, gainDb: number) => void;
  setBassBoost: (val: number) => void;
  setSurround3d: (val: boolean) => void;
  reorderQueue: (newQueue: QueueSong[]) => void;
  removeFromQueue: (songId: string) => void;
};

const OfflinePlayerContext = createContext<OfflinePlayerContextValue | null>(null);

const STORAGE_KEY_SESSION = "aura-offline-session";
const STORAGE_KEY_EQ = "aura-offline-eq";
const STORAGE_KEY_SETTINGS = "aura-offline-settings";

export function OfflinePlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueSong[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(1);
  const [speed, setSpeedState] = useState<number>(1);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isCarMode, setIsCarMode] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [audioDetails, setAudioDetails] = useState<{ mimeType: string; sizeMB: string } | null>(null);

  // Pro features state
  const [abLoop, setAbLoop] = useState<{ start: number | null; end: number | null; active: boolean }>({
    start: null,
    end: null,
    active: false,
  });
  const [sleepTimer, setSleepTimer] = useState<{
    active: boolean;
    minutesRemaining: number;
    totalMinutes: number;
    mode: "time" | "endOfSong";
  }>({
    active: false,
    minutesRemaining: 0,
    totalMinutes: 0,
    mode: "time",
  });
  const [gapless, setGaplessState] = useState<boolean>(true);
  const [crossfade, setCrossfadeState] = useState<number>(0);
  const [equalizer, setEqualizer] = useState<{
    enabled: boolean;
    preset: EqualizerPreset;
    bands: [number, number, number, number, number];
    bassBoost: number;
    surround3d: boolean;
  }>({
    enabled: false,
    preset: "flat",
    bands: [0, 0, 0, 0, 0],
    bassBoost: 0,
    surround3d: false,
  });

  // Audio elements & refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const currentSongRef = useRef<QueueSong | null>(null);
  const volumeBeforeFadeRef = useRef<number>(1);

  // Blob URLs cache map (songId -> ObjectURL)
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  // Preloaded next track
  const preloadedNextRef = useRef<{ songId: string; url: string } | null>(null);

  const currentSong = queue[currentIndex] || null;
  currentSongRef.current = currentSong;

  // ── Web Audio API Equalizer Graph (for non-iOS / supported browsers) ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const biquadFiltersRef = useRef<BiquadFilterNode[]>([]);
  const bassBoostFilterRef = useRef<BiquadFilterNode | null>(null);
  const stereoPannerRef = useRef<StereoPannerNode | null>(null);
  const isWebAudioConnectedRef = useRef(false);

  // Initialize Audio Context & filters safely
  const initWebAudio = useCallback(() => {
    // Avoid Web Audio API on iOS to prevent silence or lock-screen interruptions
    if (isIOSDevice()) return;
    if (typeof window === "undefined" || isWebAudioConnectedRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass || !audioRef.current) return;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(audioRef.current);

      // 5-band frequencies: 60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz
      const freqs = [60, 230, 910, 3600, 14000];
      const filters = freqs.map((f, i) => {
        const filter = ctx.createBiquadFilter();
        if (i === 0) filter.type = "lowshelf";
        else if (i === freqs.length - 1) filter.type = "highshelf";
        else filter.type = "peaking";
        filter.frequency.value = f;
        filter.gain.value = equalizer.bands[i] || 0;
        return filter;
      });
      biquadFiltersRef.current = filters;

      // Bass Boost filter (lowshelf at 80Hz)
      const bassNode = ctx.createBiquadFilter();
      bassNode.type = "lowshelf";
      bassNode.frequency.value = 80;
      bassNode.gain.value = equalizer.bassBoost * 1.5;
      bassBoostFilterRef.current = bassNode;

      // Stereo Panner (if supported)
      let panner: StereoPannerNode | null = null;
      if ("createStereoPanner" in ctx) {
        panner = ctx.createStereoPanner();
        stereoPannerRef.current = panner;
      }

      // Chain: source -> filters[0..4] -> bassNode -> [panner] -> destination
      let current: AudioNode = source;
      filters.forEach((fil) => {
        current.connect(fil);
        current = fil;
      });
      current.connect(bassNode);
      current = bassNode;

      if (panner) {
        current.connect(panner);
        current = panner;
      }
      current.connect(ctx.destination);
      isWebAudioConnectedRef.current = true;
    } catch (e) {
      console.warn("[OfflinePlayer] Web Audio initialization caught:", e);
    }
  }, [equalizer.bands, equalizer.bassBoost]);

  // Update EQ bands in real time
  useEffect(() => {
    if (!isWebAudioConnectedRef.current) return;
    biquadFiltersRef.current.forEach((filter, i) => {
      if (filter && equalizer.bands[i] !== undefined) {
        filter.gain.value = equalizer.enabled ? equalizer.bands[i] : 0;
      }
    });
    if (bassBoostFilterRef.current) {
      bassBoostFilterRef.current.gain.value = equalizer.enabled ? equalizer.bassBoost * 1.5 : 0;
    }
  }, [equalizer]);

  // ── Restore saved settings from localStorage ──────────────────────────
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.gapless !== undefined) setGaplessState(parsed.gapless);
        if (parsed.crossfade !== undefined) setCrossfadeState(parsed.crossfade);
        if (parsed.speed !== undefined) setSpeedState(parsed.speed);
        if (parsed.volume !== undefined) setVolumeState(parsed.volume);
        if (parsed.repeat !== undefined) setRepeat(parsed.repeat);
        if (parsed.shuffle !== undefined) setShuffle(parsed.shuffle);
      }
      const savedEq = localStorage.getItem(STORAGE_KEY_EQ);
      if (savedEq) {
        setEqualizer(JSON.parse(savedEq));
      }
    } catch {}
  }, []);

  // Save settings on changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_SETTINGS,
        JSON.stringify({ gapless, crossfade, speed, volume, repeat, shuffle })
      );
    } catch {}
  }, [gapless, crossfade, speed, volume, repeat, shuffle]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EQ, JSON.stringify(equalizer));
    } catch {}
  }, [equalizer]);

  // ── Acquire or generate Object URL from Blob ──────────────────────────
  const getBlobUrlForSong = useCallback(async (songId: string): Promise<string | null> => {
    const existing = blobUrlsRef.current.get(songId);
    if (existing) return existing;

    try {
      const blob = await getAudioBlob(songId);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      blobUrlsRef.current.set(songId, url);
      return url;
    } catch (e) {
      console.error("[OfflinePlayer] getBlobUrl error:", e);
      return null;
    }
  }, []);

  // ── Preload Next Song (Zero-gap & iPhone lock screen transitions) ─────
  const preloadNextSong = useCallback(
    async (nextIdx: number) => {
      const q = queueRef.current;
      if (!q.length || nextIdx < 0 || nextIdx >= q.length) return;
      const nextSongItem = q[nextIdx];
      if (!nextSongItem?.songId) return;

      try {
        const url = await getBlobUrlForSong(nextSongItem.songId);
        if (url) {
          preloadedNextRef.current = { songId: nextSongItem.songId, url };
        }
      } catch {}
    },
    [getBlobUrlForSong]
  );

  // ── MediaSession Sync ────────────────────────────────────────────────
  const syncMediaSession = useCallback((song: QueueSong | null) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    if (!song) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
      return;
    }

    try {
      const art = song.thumbnailUrl ? getProxyUrl(song.thumbnailUrl) : "/logo-v2.png";
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist || "Aura Music",
        album: song.albumName || "مكتبة الأوفلاين ⚡",
        artwork: [
          { src: art, sizes: "96x96", type: "image/png" },
          { src: art, sizes: "128x128", type: "image/png" },
          { src: art, sizes: "192x192", type: "image/png" },
          { src: art, sizes: "256x256", type: "image/png" },
          { src: art, sizes: "384x384", type: "image/png" },
          { src: art, sizes: "512x512", type: "image/png" },
        ],
      });
      navigator.mediaSession.playbackState = isPlayingRef.current ? "playing" : "paused";
    } catch (e) {
      console.warn("[OfflinePlayer] MediaSession update error:", e);
    }
  }, []);

  const syncPositionState = useCallback(() => {
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      !("setPositionState" in navigator.mediaSession)
    )
      return;
    const a = audioRef.current;
    if (!a || !a.duration || isNaN(a.duration) || a.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, a.duration),
        playbackRate: a.playbackRate || 1,
        position: Math.min(Math.max(0, a.currentTime), a.duration),
      });
    } catch {}
  }, []);

  // ── Direct Song Playback Execution ────────────────────────────────────
  const executePlayIndex = useCallback(
    async (idx: number, autoStart = true) => {
      const q = queueRef.current;
      if (!q.length || idx < 0 || idx >= q.length) return;

      const song = q[idx];
      setCurrentIndex(idx);
      currentIndexRef.current = idx;
      setIsBuffering(true);

      // Stop online player so only offline audio plays
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("aura-offline-player-started"));
      }

      // Pre-warm Web Audio Context on user gesture if not already active
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }

      primeSilentCarrier();
      configureAudioSession();

      const a = audioRef.current;
      if (!a) return;

      try {
        let streamUrl: string | null = null;

        // Check if already preloaded
        if (preloadedNextRef.current && preloadedNextRef.current.songId === song.songId) {
          streamUrl = preloadedNextRef.current.url;
        } else {
          streamUrl = await getBlobUrlForSong(song.songId);
        }

        if (!streamUrl) {
          console.warn("[OfflinePlayer] Song blob not found in IndexedDB:", song.songId);
          setIsBuffering(false);
          return;
        }

        // Apply audio stream directly
        if (a.src !== streamUrl) {
          a.src = streamUrl;
          a.load();
        }

        a.playbackRate = speed;
        a.volume = isMuted ? 0 : volume;

        // Fetch format and lyrics in background
        getOfflineSongMeta(song.songId).then((meta: any) => {
          if (meta) {
            const sizeMB = meta.size ? (meta.size / (1024 * 1024)).toFixed(1) + " MB" : "3.8 MB";
            const mimeType = meta.mimeType || "audio/mp4 (M4A)";
            setAudioDetails({ sizeMB, mimeType });
          }
        }).catch(() => {});

        getLyrics(song.songId).then((lyr: any) => {
          if (typeof lyr === "string") setLyrics(lyr);
          else if (lyr?.lines) setLyrics(lyr.lines.map((l: any) => l.text).join("\n"));
          else setLyrics(null);
        }).catch(() => setLyrics(null));

        syncMediaSession(song);

        if (autoStart) {
          releaseAudioSession();
          const p = a.play();
          if (p !== undefined) {
            p.then(() => {
              setIsPlaying(true);
              isPlayingRef.current = true;
              setIsBuffering(false);
              if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "playing";
              }
              syncPositionState();
            }).catch((err) => {
              console.warn("[OfflinePlayer] Play rejected:", err);
              setIsBuffering(false);
            });
          }
        }

        // Schedule next track preload (Gapless)
        const nextIdx = (idx + 1) % q.length;
        preloadNextSong(nextIdx);
      } catch (err) {
        console.error("[OfflinePlayer] Playback error:", err);
        setIsBuffering(false);
      }
    },
    [getBlobUrlForSong, isMuted, preloadNextSong, speed, syncMediaSession, syncPositionState, volume]
  );

  // ── Navigation Controls (Next, Prev, Toggle) ──────────────────────────
  const next = useCallback(() => {
    const q = queueRef.current;
    if (!q.length) return;

    if (shuffle) {
      const randomIdx = Math.floor(Math.random() * q.length);
      executePlayIndex(randomIdx, true);
      return;
    }

    const cur = currentIndexRef.current;
    if (cur + 1 < q.length) {
      executePlayIndex(cur + 1, true);
    } else if (repeat === "all") {
      executePlayIndex(0, true);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, [executePlayIndex, repeat, shuffle]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }

    const q = queueRef.current;
    if (!q.length) return;

    const cur = currentIndexRef.current;
    if (cur - 1 >= 0) {
      executePlayIndex(cur - 1, true);
    } else {
      executePlayIndex(q.length - 1, true);
    }
  }, [executePlayIndex]);

  const play = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    releaseAudioSession();
    configureAudioSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("aura-offline-player-started"));
    }
    a.muted = false;
    const p = a.play();
    if (p !== undefined) {
      p.then(() => {
        setIsPlaying(true);
        isPlayingRef.current = true;
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
        syncPositionState();
      }).catch((e) => console.warn("[OfflinePlayer] Play failed:", e));
    }
  }, [syncPositionState]);

  const pause = useCallback(() => {
    const a = audioRef.current;
    if (a) a.pause();
    setIsPlaying(false);
    isPlayingRef.current = false;
    holdAudioSessionOnPause();
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    syncPositionState();
  }, [syncPositionState]);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [pause, play]);

  const seekTo = useCallback(
    (time: number) => {
      const a = audioRef.current;
      if (a && !isNaN(time)) {
        a.currentTime = Math.max(0, Math.min(time, a.duration || 9999));
        setCurrentTime(a.currentTime);
        syncPositionState();
      }
    },
    [syncPositionState]
  );

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    setIsMuted(clamped === 0);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.volume = volume;
    } else {
      setIsMuted(true);
      if (audioRef.current) audioRef.current.volume = 0;
    }
  }, [isMuted, volume]);

  const setSpeed = useCallback((val: number) => {
    setSpeedState(val);
    if (audioRef.current) {
      audioRef.current.playbackRate = val;
    }
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"));
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  // ── Pro Feature: A-B Loop ─────────────────────────────────────────────
  const setAbPointA = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setAbLoop((prev) => ({
      ...prev,
      start: a.currentTime,
      active: prev.end !== null && a.currentTime < prev.end,
    }));
  }, []);

  const setAbPointB = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setAbLoop((prev) => ({
      ...prev,
      end: a.currentTime,
      active: prev.start !== null && a.currentTime > prev.start,
    }));
  }, []);

  const clearAbLoop = useCallback(() => {
    setAbLoop({ start: null, end: null, active: false });
  }, []);

  // ── Pro Feature: Sleep Timer with gentle volume fade-out ──────────────
  const startSleepTimer = useCallback(
    (minutes: number | "endOfSong") => {
      if (minutes === "endOfSong") {
        setSleepTimer({ active: true, minutesRemaining: 0, totalMinutes: 0, mode: "endOfSong" });
        return;
      }
      volumeBeforeFadeRef.current = volume;
      setSleepTimer({
        active: true,
        minutesRemaining: minutes,
        totalMinutes: minutes,
        mode: "time",
      });
    },
    [volume]
  );

  const cancelSleepTimer = useCallback(() => {
    setSleepTimer({ active: false, minutesRemaining: 0, totalMinutes: 0, mode: "time" });
    if (audioRef.current) audioRef.current.volume = volumeBeforeFadeRef.current;
  }, []);

  // Sleep Timer countdown tick
  useEffect(() => {
    if (!sleepTimer.active || sleepTimer.mode !== "time") return;
    let secondsLeft = sleepTimer.minutesRemaining * 60;

    const interval = setInterval(() => {
      secondsLeft -= 1;
      const minLeft = Math.ceil(secondsLeft / 60);

      if (minLeft !== sleepTimer.minutesRemaining) {
        setSleepTimer((prev) => ({ ...prev, minutesRemaining: minLeft }));
      }

      // Gentle fade-out in last 25 seconds
      if (secondsLeft <= 25 && secondsLeft > 0 && audioRef.current) {
        const factor = secondsLeft / 25;
        audioRef.current.volume = volumeBeforeFadeRef.current * factor;
      }

      if (secondsLeft <= 0) {
        clearInterval(interval);
        pause();
        if (audioRef.current) audioRef.current.volume = volumeBeforeFadeRef.current;
        setSleepTimer({ active: false, minutesRemaining: 0, totalMinutes: 0, mode: "time" });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [pause, sleepTimer.active, sleepTimer.minutesRemaining, sleepTimer.mode]);

  // ── Pro Feature: Equalizer & DSP Presets ──────────────────────────────
  const setEqualizerPreset = useCallback((preset: EqualizerPreset) => {
    initWebAudio();
    const config = EQ_PRESETS[preset];
    if (config) {
      setEqualizer((prev) => ({
        ...prev,
        enabled: true,
        preset,
        bands: [...config.bands],
      }));
    }
  }, [initWebAudio]);

  const setEqualizerBand = useCallback((bandIndex: number, gainDb: number) => {
    initWebAudio();
    setEqualizer((prev) => {
      const nextBands = [...prev.bands] as [number, number, number, number, number];
      nextBands[bandIndex] = gainDb;
      return {
        ...prev,
        enabled: true,
        preset: "custom",
        bands: nextBands,
      };
    });
  }, [initWebAudio]);

  const setBassBoost = useCallback((val: number) => {
    initWebAudio();
    setEqualizer((prev) => ({ ...prev, enabled: true, bassBoost: Math.max(0, Math.min(10, val)) }));
  }, [initWebAudio]);

  const setSurround3d = useCallback((val: boolean) => {
    initWebAudio();
    setEqualizer((prev) => ({ ...prev, surround3d: val }));
  }, [initWebAudio]);

  // ── Queue Management ──────────────────────────────────────────────────
  const playSongList = useCallback(
    (songs: QueueSong[], startIndex = 0) => {
      if (!songs || !songs.length) return;
      setQueue(songs);
      queueRef.current = songs;
      executePlayIndex(startIndex, true);
    },
    [executePlayIndex]
  );

  const playSong = useCallback(
    (song: QueueSong) => {
      const existingIdx = queueRef.current.findIndex((s) => s.songId === song.songId);
      if (existingIdx !== -1) {
        executePlayIndex(existingIdx, true);
      } else {
        const nextQ = [song, ...queueRef.current];
        setQueue(nextQ);
        queueRef.current = nextQ;
        executePlayIndex(0, true);
      }
    },
    [executePlayIndex]
  );

  const reorderQueue = useCallback((newQueue: QueueSong[]) => {
    setQueue(newQueue);
    queueRef.current = newQueue;
    const cur = currentSongRef.current;
    if (cur) {
      const newIdx = newQueue.findIndex((s) => s.songId === cur.songId);
      if (newIdx !== -1) {
        setCurrentIndex(newIdx);
        currentIndexRef.current = newIdx;
      }
    }
  }, []);

  const removeFromQueue = useCallback(
    (songId: string) => {
      const newQ = queueRef.current.filter((s) => s.songId !== songId);
      setQueue(newQ);
      queueRef.current = newQ;
      if (currentSongRef.current?.songId === songId) {
        if (newQ.length > 0) next();
        else pause();
      }
    },
    [next, pause]
  );

  const closeOfflinePlayer = useCallback(() => {
    pause();
    setQueue([]);
    queueRef.current = [];
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    setIsExpanded(false);
    setIsCarMode(false);
    syncMediaSession(null);
  }, [pause, syncMediaSession]);

  // ── MediaSession Action Handlers Registration (Synchronous for iOS) ───
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    // Direct synchronous handlers for iPhone Lock Screen, AirPods, and Bluetooth buttons
    navigator.mediaSession.setActionHandler("play", () => {
      releaseAudioSession();
      configureAudioSession();
      const a = audioRef.current;
      if (a) {
        a.muted = false;
        a.play().then(() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
          syncPositionState();
        }).catch((err) => {
          console.warn("[OfflinePlayer] MediaSession play catch:", err);
        });
      }
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      const a = audioRef.current;
      if (a) a.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      holdAudioSessionOnPause();
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      syncPositionState();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      next();
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      prev();
    });

    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) {
        seekTo(details.seekTime);
      }
    });

    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const offset = details.seekOffset || 10;
      if (audioRef.current) seekTo(audioRef.current.currentTime - offset);
    });

    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const offset = details.seekOffset || 10;
      if (audioRef.current) seekTo(audioRef.current.currentTime + offset);
    });
  }, [next, prev, seekTo, syncPositionState]);

  // ── iPhone Lock Screen / Unlock Resume Guard (Visibility Change) ──────
  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const a = audioRef.current;
        // If app says playing, but iOS paused the audio element during lock/unlock, resume it
        if (isPlayingRef.current && a && a.paused) {
          releaseAudioSession();
          a.play().catch(() => {});
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, []);

  // ── Decoupled Event Listener: Stop Offline Player when Online Player Plays ──
  useEffect(() => {
    const handleOnlineStarted = () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      isPlayingRef.current = false;
    };
    window.addEventListener("aura-online-player-started", handleOnlineStarted);
    return () => window.removeEventListener("aura-online-player-started", handleOnlineStarted);
  }, []);

  // ── HTML5 Audio Events ───────────────────────────────────────────────
  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime);

    // A-B Loop enforcement
    if (abLoop.active && abLoop.start !== null && abLoop.end !== null) {
      if (a.currentTime >= abLoop.end) {
        a.currentTime = abLoop.start;
      }
    }

    // Crossfade (fade-out at end of track)
    if (crossfade > 0 && a.duration > 0) {
      const remaining = a.duration - a.currentTime;
      if (remaining <= crossfade && remaining > 0) {
        a.volume = (volume / crossfade) * remaining;
      }
    }
  };

  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (a) {
      setDuration(a.duration || 0);
      syncPositionState();
    }
  };

  const onEnded = () => {
    // If sleep timer set to end of song, stop here
    if (sleepTimer.active && sleepTimer.mode === "endOfSong") {
      pause();
      setSleepTimer({ active: false, minutesRemaining: 0, totalMinutes: 0, mode: "time" });
      return;
    }

    if (repeat === "one") {
      const a = audioRef.current;
      if (a) {
        a.currentTime = 0;
        a.play().catch(() => {});
      }
      return;
    }

    next();
  };

  const value: OfflinePlayerContextValue = {
    queue,
    currentSong,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    volume,
    speed,
    repeat,
    shuffle,
    isMuted,
    isExpanded,
    isCarMode,
    hasActiveSong: currentSong !== null,
    isBuffering,
    lyrics,
    audioDetails,
    abLoop,
    sleepTimer,
    gapless,
    crossfade,
    equalizer,
    playSongList,
    playSong,
    togglePlay,
    play,
    pause,
    next,
    prev,
    seekTo,
    setVolume,
    toggleMute,
    setSpeed,
    cycleRepeat,
    toggleShuffle,
    setIsExpanded,
    setIsCarMode,
    closeOfflinePlayer,
    setAbPointA,
    setAbPointB,
    clearAbLoop,
    startSleepTimer,
    cancelSleepTimer,
    setGapless: setGaplessState,
    setCrossfade: setCrossfadeState,
    setEqualizerPreset,
    setEqualizerBand,
    setBassBoost,
    setSurround3d,
    reorderQueue,
    removeFromQueue,
  };

  return (
    <OfflinePlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        data-offline-player="true"
        playsInline
        preload="auto"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={onLoadedMetadata}
        onEnded={onEnded}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onPause={() => {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }}
        onPlay={() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        }}
      />
    </OfflinePlayerContext.Provider>
  );
}

export function useOfflinePlayer() {
  const context = useContext(OfflinePlayerContext);
  if (!context) {
    throw new Error("useOfflinePlayer must be used within an OfflinePlayerProvider");
  }
  return context;
}
