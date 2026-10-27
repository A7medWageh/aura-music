"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialPlayerState, PlayerState, QueueSong, RepeatMode } from "@/state/playerState";
import { getAudioBlob, getOfflineSongMeta, deleteAudioBlobOnly, isKhaleejiOrCorruptedJannatBlob, autoPurgeCorruptedJannatBlobs } from "@/offline/indexedDbCache";
import { JANNAT_OLD_CLASSICS } from "@/data/jannatClassics";
import { downloadSong } from "@/services/offline/downloader";
import { setMainAudioPlaying } from "@/services/offline/backgroundKeepAlive";
import { useToastStore } from "@/state/toastStore";
import { toAbsoluteApiUrl } from "@/utils/apiBase";

// ── Accurate iOS Detection (iPhone, iPad, iPod, WKWebView) ──
const isIOSDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    (/WebKit/i.test(navigator.userAgent) && /Mobile/i.test(navigator.userAgent))
  );
};

type PlayerContextValue = {
  state: PlayerState;
  currentSong: QueueSong | null;
  setQueue: (songs: QueueSong[], startIndex?: number) => void;
  enqueueSongs: (songs: QueueSong[]) => void;
  playNow: (song: QueueSong) => void;
  playSongById: (songId: string) => void;
  next: () => void;
  prev: () => void;
  togglePlay: () => void;
  setShuffle: (value: boolean) => void;
  cycleRepeat: () => void;
  setVolume: (value: number) => void;
  setSpeed: (value: number) => void;
  seekTo: (time: number) => void;
  prewarm: (videoId: string) => void;
  setHighQuality: (value: boolean) => void;
  setIsAiMix: (value: boolean) => void;
  soundPreset: "crystal" | "bass" | "vocal" | "spatial" | "noise_cancel";
  setSoundPreset: (preset: "crystal" | "bass" | "vocal" | "spatial" | "noise_cancel") => void;
  soundBoost: number;
  setSoundBoost: (boost: number) => void;
  is8dActive: boolean;
  setIs8dActive: (active: boolean) => void;
  getAnalyser: () => AnalyserNode | null;
  closePlayer: () => void;
  toggleMute: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(initialPlayerState);

  // Restore saved player session on client mount only (guarantees SSR hydration consistency)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aura-player-session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.queue && parsed.queue.length > 0 && parsed.currentSongId) {
          setState((prev) => ({
            ...prev,
            queue: parsed.queue,
            currentSongId: parsed.currentSongId,
            currentTime: parsed.currentTime || 0,
            volume: parsed.volume ?? initialPlayerState.volume,
            isPlaying: false, // keep paused on initial mount so browser autoplay policies are respected
          }));
        }
      }
    } catch {}
  }, []);

  // Auto-clean any corrupted/duplicate Khaleeji audio blobs from user's device in background after idle
  useEffect(() => {
    const timer = setTimeout(() => {
      autoPurgeCorruptedJannatBlobs().catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(state.isPlaying);
  const isLoadingNewSongRef = useRef(false); // true while fetching stream URL, prevents onPause from clearing isPlaying
  const gestureResumeCleanupRef = useRef<(() => void) | null>(null); // pending "resume on next gesture" listeners
  const stateRef = useRef(state);
  stateRef.current = state;
  const nextPreloadedRef = useRef<{ songId: string; url: string; isBlob: boolean } | null>(null);
  const lastPreloadRef = useRef<string | null>(null);
  const isInitialMountRef = useRef(true);

  const nextRef = useRef<() => void>(() => {});
  const prevRef = useRef<() => void>(() => {});

  const currentSong = useMemo(
    () => state.queue.find((song) => song.songId === state.currentSongId) ?? null,
    [state.currentSongId, state.queue]
  );

  // ── Complete iPhone Lock Screen & MediaSession Engine ──
  const updateMediaSessionMetadata = (song: QueueSong | null) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !song) return;

    let artUrl = song.thumbnailUrl || song.metadata?.thumbnailUrl;
    if (!artUrl || artUrl.startsWith("blob:") || artUrl.startsWith("data:")) {
      artUrl = typeof window !== "undefined" ? `${window.location.origin}/placeholder-album.jpg` : "/placeholder-album.jpg";
    } else if (artUrl.startsWith("/")) {
      artUrl = typeof window !== "undefined" ? `${window.location.origin}${artUrl}` : artUrl;
    } else if (artUrl.startsWith("http://")) {
      artUrl = artUrl.replace("http://", "https://");
    }

    const albumName = song.albumName || song.folderName || (song.metadata?.album) || "Aura Music";

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || "أغنية",
        artist: song.artist || "فنان",
        album: albumName,
        artwork: [
          { src: artUrl, sizes: "96x96" },
          { src: artUrl, sizes: "128x128" },
          { src: artUrl, sizes: "192x192" },
          { src: artUrl, sizes: "256x256" },
          { src: artUrl, sizes: "384x384" },
          { src: artUrl, sizes: "512x512" },
        ],
      });
    } catch (err) {
      console.warn("[MediaSession] Metadata update error:", err);
    }
  };

  const syncPositionState = () => {
    const player = audioRef.current;
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      !("setPositionState" in navigator.mediaSession) ||
      !player
    ) return;

    let dur = player.duration;
    if (!dur || isNaN(dur) || !isFinite(dur) || dur <= 0) {
      dur = stateRef.current.duration;
    }

    if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
      try {
        const curTime = player.currentTime || 0;
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, dur),
          playbackRate: Math.max(0.5, Math.min(2, player.playbackRate || 1)),
          position: Math.max(0, Math.min(curTime, dur)),
        });
      } catch (e) {
        // iOS throws if position > duration or invalid number
      }
    }
  };

  // Persist session to localStorage so active song, queue and progress survive reloads
  useEffect(() => {
    if (state.queue.length > 0 && state.currentSongId) {
      try {
        localStorage.setItem(
          "aura-player-session",
          JSON.stringify({
            queue: state.queue,
            currentSongId: state.currentSongId,
            currentTime: Math.floor(state.currentTime || 0),
            volume: state.volume
          })
        );
        localStorage.setItem("aura-player-state", JSON.stringify({ queue: state.queue }));
      } catch { /* ignore */ }
    }
  }, [state.queue, state.currentSongId, state.volume]);

  // Synchronously prime the audio element inside user gestures for iOS WebKit
  const primeAudioElement = () => {
    const player = audioRef.current;
    if (!player) return;
    try {
      const p = player.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    } catch {}
  };

  // Synchronous fast-track starter: plays immediately inside user/handsfree gestures
  const syncPlayTrack = (song: QueueSong) => {
    const player = audioRef.current;
    if (!player) return;

    primeAudioElement();
    updateMediaSessionMetadata(song);

    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }

    if (typeof window !== "undefined") {
      import("@/services/user/listeningHistory").then(({ trackPlay }) => trackPlay(song)).catch(() => {});
    }

    // 1. Fast handoff if preloaded URL is ready
    if (nextPreloadedRef.current && nextPreloadedRef.current.songId === song.songId) {
      const pUrl = nextPreloadedRef.current.url;
      player.src = pUrl;
      player.load();
      player.play().catch((err) => console.warn("[LockScreen] Preload play error:", err));
      nextPreloadedRef.current = null;

      setState((prev) => {
        const exists = prev.queue.some((item) => item.songId === song.songId);
        const nextQueue = exists ? prev.queue : [song, ...prev.queue];
        return {
          ...prev,
          queue: nextQueue,
          currentSongId: song.songId,
          isPlaying: true,
          streamUrl: pUrl,
          currentTime: 0,
          duration: 0,
          isBuffering: false,
          error: null,
        };
      });
      return;
    }

    // 2. Direct streaming start immediately (starts in seconds, never rejected by iOS lock screen)
    const targetVid = song.youtubeVideoId || song.songId || "";
    const directStreamUrl = toAbsoluteApiUrl(
      `/api/ytdownload?videoId=${encodeURIComponent(targetVid)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist || "")}&proxy=true`
    );

    player.src = directStreamUrl;
    player.preload = "auto";
    player.load();
    const p = player.play();
    if (p !== undefined) {
      p.catch((err) => {
        console.warn("[Player] Direct play deferred:", err);
      });
    }

    setState((prev) => {
      const exists = prev.queue.some((item) => item.songId === song.songId);
      const nextQueue = exists ? prev.queue : [song, ...prev.queue];
      return {
        ...prev,
        queue: nextQueue,
        currentSongId: song.songId,
        isPlaying: true,
        streamUrl: directStreamUrl,
        currentTime: 0,
        duration: 0,
        isBuffering: true,
        error: null,
      };
    });

    // 3. In background, check if offline blob is available; if so, swap to local blob URL
    getAudioBlob(song.songId).then(async (blob) => {
      let b = blob;
      if (!b && song.youtubeVideoId && song.youtubeVideoId !== song.songId) {
        b = await getAudioBlob(song.youtubeVideoId);
      }
      if (b && isKhaleejiOrCorruptedJannatBlob(song.artist, b.size, song.songId || song.title)) {
        await deleteAudioBlobOnly(song.songId);
        if (song.youtubeVideoId) await deleteAudioBlobOnly(song.youtubeVideoId);
        b = null;
      }
      if (b && stateRef.current.currentSongId === song.songId) {
        const blobUrl = URL.createObjectURL(b);
        player.src = blobUrl;
        player.load();
        player.play().catch(() => {});
        setState((prev) => ({ ...prev, streamUrl: blobUrl, isBuffering: false }));
      }
    }).catch(() => {});
  };

  const setQueue = (songs: QueueSong[], startIndex = 0) => {
    const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
    const targetSong = songs[idx];
    if (targetSong) {
      setState((prev) => ({
        ...prev,
        queue: songs,
      }));
      syncPlayTrack(targetSong);
    } else {
      setState((prev) => ({
        ...prev,
        queue: songs,
        currentSongId: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        error: null,
      }));
    }
  };

  const enqueueSongs = async (songs: QueueSong[]) => {
    if (!songs.length) return;
    
    const validSongs = songs;

    setState((prev) => {
      const existingIds = new Set(prev.queue.map((item) => item.songId));
      const merged = [...prev.queue];
      for (const song of validSongs) {
        if (!existingIds.has(song.songId)) {
          merged.push(song);
          existingIds.add(song.songId);
        }
      }
      return {
        ...prev,
        queue: merged,
        currentSongId: prev.currentSongId ?? validSongs[0].songId
      };
    });
  };

  // Deferred play after an autoplay-policy failure
  const armGestureResume = (player: HTMLAudioElement) => {
    const resumeOnGesture = () => {
      cleanupGestureResume();
      player.play().catch(() => {});
    };
    const cleanupGestureResume = () => {
      window.removeEventListener("touchstart", resumeOnGesture);
      window.removeEventListener("click", resumeOnGesture);
      if (gestureResumeCleanupRef.current === cleanupGestureResume) gestureResumeCleanupRef.current = null;
    };
    window.addEventListener("touchstart", resumeOnGesture, { once: true, passive: true });
    window.addEventListener("click", resumeOnGesture, { once: true, passive: true });
    gestureResumeCleanupRef.current = cleanupGestureResume;
  };

  const playNow = async (song: QueueSong) => {
    syncPlayTrack(song);
  };

  const playSongById = async (songId: string) => {
    const s = stateRef.current.queue.find((item) => item.songId === songId);
    if (s) syncPlayTrack(s);
  };

  const next = () => {
    const currentState = stateRef.current;
    if (!currentState.queue.length || !currentState.currentSongId) return;
    const index = currentState.queue.findIndex((song) => song.songId === currentState.currentSongId);
    const nextIndex = currentState.shuffle
      ? Math.floor(Math.random() * currentState.queue.length)
      : index >= 0
        ? (index + 1) % currentState.queue.length
        : 0;
    const nextSong = currentState.queue[nextIndex];
    if (!nextSong) return;
    syncPlayTrack(nextSong);
  };

  const prev = () => {
    const currentState = stateRef.current;
    if (!currentState.queue.length || !currentState.currentSongId) return;
    const index = currentState.queue.findIndex((song) => song.songId === currentState.currentSongId);
    const prevIndex = index <= 0 ? currentState.queue.length - 1 : index - 1;
    const prevSong = currentState.queue[prevIndex];
    if (!prevSong) return;
    syncPlayTrack(prevSong);
  };

  nextRef.current = next;
  prevRef.current = prev;

  const togglePlay = () => {
    const player = audioRef.current;
    if (player) {
      if (state.isPlaying) {
        player.pause();
        setState((prev) => ({ ...prev, isPlaying: false }));
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
        syncPositionState();
      } else {
        if ((!player.src || player.src === "" || player.src === window.location.href) && currentSong) {
          syncPlayTrack(currentSong);
          return;
        }
        const p = player.play();
        if (p !== undefined) {
          p.then(() => {
            setState((prev) => ({ ...prev, isPlaying: true }));
            if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "playing";
            }
            syncPositionState();
          }).catch((err) => {
            console.warn("[Player] Direct play() rejected, falling back to syncPlayTrack:", err);
            if (currentSong) syncPlayTrack(currentSong);
          });
        } else {
          setState((prev) => ({ ...prev, isPlaying: true }));
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
          syncPositionState();
        }
      }
    } else {
      setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
    }
  };

  const cycleRepeat = () => {
    setState((prev) => {
      const cycle: RepeatMode[] = ["off", "one", "all"];
      const index = cycle.indexOf(prev.repeat);
      return { ...prev, repeat: cycle[(index + 1) % cycle.length] };
    });
  };

  const setShuffle = (value: boolean) => {
    setState((prev) => ({ ...prev, shuffle: value }));
  };

  const lastNonZeroVolumeRef = useRef(1);

  const setVolume = (value: number) => {
    const v = Math.max(0, Math.min(1, value));
    if (v > 0) lastNonZeroVolumeRef.current = v;
    const player = audioRef.current;
    if (player) {
      try {
        player.muted = v === 0;
        player.volume = v;
      } catch {}
    }
    if (postGainRef.current) {
      try {
        postGainRef.current.gain.value = v;
      } catch {}
    }
    setState((prev) => ({ ...prev, volume: v }));
  };

  const toggleMute = () => {
    if (state.volume > 0) {
      setVolume(0);
    } else {
      setVolume(lastNonZeroVolumeRef.current || 1);
    }
  };

  const setSpeed = (value: number) => {
    setState((prev) => ({ ...prev, speed: Math.max(0.5, Math.min(2, value)) }));
  };

  const seekTo = (time: number) => {
    const player = audioRef.current;
    if (!player) return;
    player.currentTime = Math.max(0, Math.min(time, player.duration || 0));
    setState((prev) => ({ ...prev, currentTime: player.currentTime }));
  };

  const [soundPreset, setSoundPresetState] = useState<"crystal" | "bass" | "vocal" | "spatial" | "noise_cancel">("crystal");

  const setSoundPreset = (preset: "crystal" | "bass" | "vocal" | "spatial" | "noise_cancel") => {
    try {
      localStorage.setItem("aura_sound_preset", preset);
    } catch {}
    setSoundPresetState(preset);
  };

  const setSoundBoost = (boost: number) => {
    const val = Math.max(1.0, Math.min(1.5, boost));
    try {
      localStorage.setItem("aura_sound_boost", val.toString());
    } catch {}
    setState((prev) => ({ ...prev, soundBoost: val }));
  };

  const setIs8dActive = (active: boolean) => {
    try {
      localStorage.setItem("aura_8d_audio", active ? "true" : "false");
    } catch {}
    setState((prev) => ({ ...prev, is8dActive: active }));
  };

  const setHighQuality = (value: boolean) => {
    try {
      localStorage.setItem("aura_hq_audio", value ? "true" : "false");
    } catch {}
    setState((prev) => ({ ...prev, isHighQuality: value }));
  };

  const setIsAiMix = (value: boolean) => {
    setState((prev) => ({ ...prev, isAiMix: value }));
  };

  // Load saved preferences
  useEffect(() => {
    try {
      const isPrem = localStorage.getItem("aura_user_tier") === "premium";
      const hqPref = localStorage.getItem("aura_hq_audio");
      if (isPrem || hqPref === "true" || hqPref === null) {
        setState((prev) => ({ ...prev, isHighQuality: true }));
      }
      const savedPreset = localStorage.getItem("aura_sound_preset") as any;
      if (savedPreset && ["crystal", "bass", "vocal", "spatial", "noise_cancel"].includes(savedPreset)) {
        setSoundPresetState(savedPreset);
      }
      const savedBoost = localStorage.getItem("aura_sound_boost");
      if (savedBoost) {
        const parsed = parseFloat(savedBoost);
        if (!isNaN(parsed) && parsed >= 1.0) {
          setState((prev) => ({ ...prev, soundBoost: Math.min(1.5, parsed) }));
        }
      }
      const saved8d = localStorage.getItem("aura_8d_audio");
      if (saved8d === "true") {
        setState((prev) => ({ ...prev, is8dActive: true }));
      }
    } catch {}
  }, []);

  // ─── Web Audio API (Master-Grade Studio Sound Clarity & 8D Dynamics) ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const boosterGainRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const preGainRef = useRef<GainNode | null>(null);
  const postGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const pannerAnimRef = useRef<number | null>(null);
  const soundPresetRef = useRef(soundPreset);
  soundPresetRef.current = soundPreset;
  const is8dActiveRef = useRef(state.is8dActive);
  is8dActiveRef.current = state.is8dActive;

  // Real-time 8D audio rotation: rotates sound smoothly between left and right earbuds
  const update8dRotation = () => {
    if (pannerAnimRef.current) {
      cancelAnimationFrame(pannerAnimRef.current);
      pannerAnimRef.current = null;
    }
    const panner = pannerRef.current;
    const ctx = audioCtxRef.current;
    if (!panner || !ctx) return;

    const shouldRotate = soundPresetRef.current === "spatial" || is8dActiveRef.current;
    if (!shouldRotate || !isPlayingRef.current) {
      try { panner.pan.setTargetAtTime(0, ctx.currentTime, 0.05); } catch {}
      return;
    }

    const cycleDuration = 9000; // 9 seconds for smooth full orbital rotation
    const tick = () => {
      const shouldStillRotate = (soundPresetRef.current === "spatial" || is8dActiveRef.current) && isPlayingRef.current;
      if (!shouldStillRotate) {
        try { panner.pan.setTargetAtTime(0, ctx.currentTime, 0.05); } catch {}
        return;
      }
      const now = performance.now();
      const progress = (now % cycleDuration) / cycleDuration;
      // Sinusoidal panning: smoothly travels between Left (-0.70) and Right (+0.70) comfortably without cutting out either ear
      const pan = Math.sin(progress * 2 * Math.PI) * 0.70;
      try { panner.pan.setTargetAtTime(pan, ctx.currentTime, 0.05); } catch {}
      pannerAnimRef.current = requestAnimationFrame(tick);
    };
    pannerAnimRef.current = requestAnimationFrame(tick);
  };

  const PRESET_CONFIGS = {
    crystal: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 55, gain: 2.5 },            // Delicate sub-bass warmth (no ear fatigue)
        { type: "peaking"  as BiquadFilterType, freq: 200, gain: 1.2, Q: 0.9 },   // Acoustic warmth & body
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -2.0, Q: 1.4 },  // Anti-mud scoop (transparent separation)
        { type: "peaking"  as BiquadFilterType, freq: 2400, gain: 2.8, Q: 0.85 }, // Pure velvet vocal clarity (below fatigue zone)
        { type: "highshelf" as BiquadFilterType, freq: 11500, gain: 3.0 },        // Silky audiophile air (shimmering, zero sizzle)
      ],
      comp: { threshold: -10, ratio: 1.5, attack: 0.020, release: 0.18 },         // Studio glue (warm & dynamic)
      postGain: 1.08,
    },
    bass: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 50, gain: 5.0 },            // Deep cinematic sub-bass (velvety, zero pressure)
        { type: "peaking"  as BiquadFilterType, freq: 120, gain: 2.2, Q: 1.0 },   // Warm punchy low-end
        { type: "peaking"  as BiquadFilterType, freq: 480, gain: -2.5, Q: 1.2 },  // Anti-boxiness scoop
        { type: "peaking"  as BiquadFilterType, freq: 3800, gain: -1.5, Q: 1.2 }, // Sibilance softening (protects ears at high vol)
        { type: "highshelf" as BiquadFilterType, freq: 10500, gain: 2.0 },        // Smooth warm top
      ],
      comp: { threshold: -12, ratio: 1.8, attack: 0.025, release: 0.20 },
      postGain: 1.06,
    },
    vocal: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 65, gain: 1.5 },
        { type: "peaking"  as BiquadFilterType, freq: 240, gain: 2.0, Q: 1.0 },   // Warm intimate vocal body
        { type: "peaking"  as BiquadFilterType, freq: 500, gain: -1.8, Q: 1.3 },  // Clean vocal separation
        { type: "peaking"  as BiquadFilterType, freq: 2600, gain: 3.5, Q: 0.9 },  // Direct, crystal clear lyrics & presence
        { type: "highshelf" as BiquadFilterType, freq: 12000, gain: 3.0 },        // Silky breath air (zero ear fatigue)
      ],
      comp: { threshold: -9, ratio: 1.6, attack: 0.015, release: 0.16 },
      postGain: 1.08,
    },
    spatial: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 55, gain: 2.5 },
        { type: "peaking"  as BiquadFilterType, freq: 220, gain: 1.5, Q: 0.9 },
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -2.5, Q: 1.3 },  // Clear binaural center stage
        { type: "peaking"  as BiquadFilterType, freq: 2500, gain: 2.5, Q: 0.8 },  // HRTF binaural sweetening
        { type: "highshelf" as BiquadFilterType, freq: 12000, gain: 3.5 },        // Wide open holographic acoustic stage
      ],
      comp: { threshold: -10, ratio: 1.6, attack: 0.020, release: 0.18 },
      postGain: 1.08,
    },
    noise_cancel: {
      bands: [
        { type: "highpass" as BiquadFilterType, freq: 40, gain: 0, Q: 0.7 },      // Cuts ambient sub-rumble below 40Hz
        { type: "peaking"  as BiquadFilterType, freq: 180, gain: 2.0, Q: 1.0 },   // Warm music core
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -3.0, Q: 1.4 },  // Notches ambient room chatter
        { type: "peaking"  as BiquadFilterType, freq: 2500, gain: 3.0, Q: 0.9 },  // Clean comfortable foreground clarity
        { type: "highshelf" as BiquadFilterType, freq: 11000, gain: 2.5 },        // Ambient masking without treble fatigue
      ],
      comp: { threshold: -11, ratio: 2.0, attack: 0.010, release: 0.14 },
      postGain: 1.12,
    },
  };

  const applyAudioParameters = (
    ctx: AudioContext,
    isHq: boolean,
    presetKey: "crystal" | "bass" | "vocal" | "spatial" | "noise_cancel",
    boostVal = 1.0
  ) => {
    const now = ctx.currentTime;
    const t = 0.05; // 50ms smooth transition, zero click/pop

    if (!isHq) {
      if (preGainRef.current) preGainRef.current.gain.setTargetAtTime(1.0, now, t);
      eqNodesRef.current.forEach((n) => {
        n.type = "peaking";
        n.gain.setTargetAtTime(0, now, t);
      });
      if (compressorRef.current) {
        compressorRef.current.threshold.setTargetAtTime(0, now, t);
        compressorRef.current.ratio.setTargetAtTime(1.0, now, t);
      }
      if (boosterGainRef.current) boosterGainRef.current.gain.setTargetAtTime(1.0, now, t);
      if (postGainRef.current) postGainRef.current.gain.setTargetAtTime(1.0, now, t);
      if (pannerRef.current) {
        try { pannerRef.current.pan.setTargetAtTime(0, now, t); } catch {}
      }
      return;
    }

    const cfg = PRESET_CONFIGS[presetKey] || PRESET_CONFIGS.crystal;
    if (preGainRef.current) preGainRef.current.gain.setTargetAtTime(0.88, now, t); // -1.1 dB studio headroom to prevent digital clipping

    eqNodesRef.current.forEach((node, i) => {
      const b = cfg.bands[i];
      if (b) {
        if (node.type !== b.type) node.type = b.type;
        node.frequency.setTargetAtTime(b.freq, now, t);
        node.gain.setTargetAtTime(b.gain, now, t);
        if (b.Q && node.Q) node.Q.setTargetAtTime(b.Q, now, t);
      }
    });

    if (compressorRef.current) {
      compressorRef.current.threshold.setTargetAtTime(cfg.comp.threshold, now, t);
      compressorRef.current.knee.setTargetAtTime(14, now, t);
      compressorRef.current.ratio.setTargetAtTime(cfg.comp.ratio, now, t);
      compressorRef.current.attack.setTargetAtTime(cfg.comp.attack, now, t);
      compressorRef.current.release.setTargetAtTime(cfg.comp.release, now, t);
    }

    if (boosterGainRef.current) {
      boosterGainRef.current.gain.setTargetAtTime(boostVal, now, t);
    }

    if (limiterRef.current) {
      limiterRef.current.threshold.setTargetAtTime(-0.3, now, t);
      limiterRef.current.knee.setTargetAtTime(12, now, t);
      limiterRef.current.ratio.setTargetAtTime(8, now, t);
      limiterRef.current.attack.setTargetAtTime(0.003, now, t);
      limiterRef.current.release.setTargetAtTime(0.08, now, t);
    }

    if (postGainRef.current) {
      postGainRef.current.gain.setTargetAtTime(cfg.postGain, now, t);
    }

    update8dRotation();
  };

  const initWebAudio = () => {
    const player = audioRef.current;
    if (!player || typeof window === "undefined" || audioCtxRef.current) return;

    // CRITICAL: On iOS WebKit (iPhone/iPad), connecting createMediaElementSource(player) to AudioContext
    // routes audio through WebKit's ambient synthesizer pipeline, which completely silences/suppresses
    // the native iOS Lock Screen Player widget (MPNowPlayingInfoCenter), Dynamic Island, and Control Center!
    // Keeping native <audio> connected directly to iOS AVPlayer gives 100% full lock screen controls,
    // artwork, scrubber, and remote bluetooth controls.
    if (isIOSDevice()) {
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(player);
      mediaSourceRef.current = source;

      // 1. Pre-Gain stage (headroom)
      const preGain = ctx.createGain();
      preGain.gain.value = 1.0;
      preGainRef.current = preGain;

      // 2. 5-Band Studio Equalizer
      const bands = PRESET_CONFIGS.crystal.bands;
      const nodes = bands.map((b) => {
        const f = ctx.createBiquadFilter();
        f.type = b.type;
        f.frequency.value = b.freq;
        f.gain.value = 0;
        if (b.Q) f.Q.value = b.Q;
        return f;
      });
      eqNodesRef.current = nodes;

      // 3. Stereo Panner Node (for 8D audio rotation)
      let panner: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === "function") {
        try {
          panner = ctx.createStereoPanner();
          pannerRef.current = panner;
        } catch {}
      }

      // 4. Studio Mastering Compressor (Velvety musical glue)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 14;
      comp.ratio.value = 1.5;
      comp.attack.value = 0.020;
      comp.release.value = 0.18;
      compressorRef.current = comp;

      // 5. Clean Audiophile Booster Stage (up to 150% clean gain)
      const boosterGain = ctx.createGain();
      boosterGain.gain.value = state.soundBoost || 1.0;
      boosterGainRef.current = boosterGain;

      // 6. Studio Soft-Knee Peak Limiter (Ear-safe ceiling, zero clipping distortion)
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -0.3;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.08;
      limiterRef.current = limiter;

      // 7. Post-Gain stage
      const postGain = ctx.createGain();
      postGain.gain.value = 1.0;
      postGainRef.current = postGain;

      // Connect graph: source -> preGain -> eqNodes -> (panner) -> comp -> boosterGain -> limiter -> postGain -> destination
      source.connect(preGain);
      let lastNode: AudioNode = preGain;
      for (const n of nodes) {
        lastNode.connect(n);
        lastNode = n;
      }
      if (panner) {
        lastNode.connect(panner);
        lastNode = panner;
      }
      lastNode.connect(comp);
      comp.connect(boosterGain);
      boosterGain.connect(limiter);
      limiter.connect(postGain);
      postGain.connect(ctx.destination);

      // 8. Analyser tap (visualizer only)
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      analyserRef.current = analyser;
      postGain.connect(analyser);

      // Apply initial audio parameters
      applyAudioParameters(ctx, state.isHighQuality, soundPreset, state.soundBoost);
    } catch (err) {
      console.warn("[WebAudio] Init error:", err);
    }
  };

  useEffect(() => {
    if (!isIOSDevice() && (state.isHighQuality || state.isPlaying) && !audioCtxRef.current) {
      initWebAudio();
    }
    const ctx = audioCtxRef.current;
    if (ctx) {
      if (ctx.state === "suspended" && state.isPlaying) {
        ctx.resume().catch(() => {});
      }
      applyAudioParameters(ctx, state.isHighQuality, soundPreset, state.soundBoost);
    }
  }, [state.isHighQuality, state.isPlaying, soundPreset, state.soundBoost, state.is8dActive]);

  useEffect(() => {
    isPlayingRef.current = state.isPlaying;
    setMainAudioPlaying(state.isPlaying);
  }, [state.isPlaying]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    try {
      player.muted = state.volume === 0;
      player.volume = state.volume;
    } catch {}
    if (postGainRef.current) {
      try {
        postGainRef.current.gain.value = state.volume;
      } catch {}
    }
  }, [state.volume]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    player.playbackRate = state.speed;
  }, [state.speed]);



  const preloadNext = async (currentId: string, queue: QueueSong[]) => {
    if (!queue || queue.length <= 1 || !currentId) return;
    const currentIndex = queue.findIndex(s => s.songId === currentId);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + 1) % queue.length;
    const nextSong = queue[nextIndex];
    if (!nextSong || nextPreloadedRef.current?.songId === nextSong.songId) return;

    try {
      // 1. Check offline storage first (instant blob URL)
      let cachedBlob = await getAudioBlob(nextSong.songId);
      if (!cachedBlob && nextSong.youtubeVideoId) {
        cachedBlob = await getAudioBlob(nextSong.youtubeVideoId);
      }
      if (cachedBlob && isKhaleejiOrCorruptedJannatBlob(nextSong.artist, cachedBlob.size, nextSong.songId || nextSong.title)) {
        cachedBlob = null;
      }
      if (cachedBlob) {
        const url = URL.createObjectURL(cachedBlob);
        nextPreloadedRef.current = { songId: nextSong.songId, url, isBlob: true };
        console.log(`[Player] Next track "${nextSong.title}" preloaded from offline cache`);
        return;
      }

      // 2. Pre-resolve stream URL if online
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const params = new URLSearchParams();
        const vid = nextSong.youtubeVideoId || nextSong.songId || "";
        if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) params.set("videoId", vid);
        if (nextSong.title) params.set("title", nextSong.title);
        if (nextSong.artist) params.set("artist", nextSong.artist);
        params.set("resolveOnly", "true");

        const res = await fetch(toAbsoluteApiUrl(`/api/ytdownload?${params.toString()}`));
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            nextPreloadedRef.current = { songId: nextSong.songId, url: data.url, isBlob: false };
            console.log(`[Player] Next track "${nextSong.title}" stream URL pre-resolved`);
          }
        }
      }
    } catch {}
  };

  // ─── Media Session API (Lock Screen & Bluetooth Headset Remote Control) ─────
  useEffect(() => {
    if (currentSong) {
      updateMediaSessionMetadata(currentSong);
    }
  }, [currentSong]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = state.isPlaying ? "playing" : "paused";
  }, [state.isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      const player = audioRef.current;
      if (!player) return;
      const currentSong = stateRef.current.queue.find((s) => s.songId === stateRef.current.currentSongId);
      if ((!player.src || player.src === "" || player.src === window.location.href) && currentSong) {
        syncPlayTrack(currentSong);
        return;
      }
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      player.play().then(() => {
        setState((prev) => ({ ...prev, isPlaying: true }));
        navigator.mediaSession.playbackState = "playing";
        syncPositionState();
      }).catch((err) => {
        console.warn("[MediaSession] play() rejected:", err);
        if (currentSong) syncPlayTrack(currentSong);
      });
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      const player = audioRef.current;
      if (player) {
        player.pause();
      }
      setState((prev) => ({ ...prev, isPlaying: false }));
      navigator.mediaSession.playbackState = "paused";
      syncPositionState();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      nextRef.current();
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      prevRef.current();
    });

    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null && !isNaN(d.seekTime)) {
        seekTo(d.seekTime);
        syncPositionState();
      }
    });

    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const skipTime = details.seekOffset || 10;
      if (audioRef.current) {
        seekTo(Math.max(0, audioRef.current.currentTime - skipTime));
        syncPositionState();
      }
    });

    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const skipTime = details.seekOffset || 10;
      if (audioRef.current) {
        seekTo(Math.min((audioRef.current.currentTime || 0) + skipTime, audioRef.current.duration || 0));
        syncPositionState();
      }
    });

    return () => {
      (["play", "pause", "nexttrack", "previoustrack", "seekto", "seekbackward", "seekforward"] as MediaSessionAction[]).forEach((a) => {
        try { navigator.mediaSession.setActionHandler(a, null); } catch {}
      });
    };
  }, []);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;

    if (!state.currentSongId) { player.pause(); return; }

    const song = state.queue.find((item) => item.songId === state.currentSongId);
    if (!song) return;

    let cancelled = false;

    // Check if this is the initial page load / refresh
    const isFirstLoad = isInitialMountRef.current;
    if (isFirstLoad) {
      isInitialMountRef.current = false;
      // If refreshed or newly loaded and not explicitly playing, stay paused!
      if (!stateRef.current.isPlaying) {
        isLoadingNewSongRef.current = false;
        player.pause();
        getAudioBlob(song.songId).then(async (cachedBlob) => {
          if (cachedBlob && isKhaleejiOrCorruptedJannatBlob(song.artist, cachedBlob.size, song.songId || song.title)) {
            console.warn(`[Player] Detected corrupted Khaleeji blob (${cachedBlob.size} bytes) on mount for Jannat track "${song.title}". Auto-purging...`);
            await deleteAudioBlobOnly(song.songId);
            if (song.youtubeVideoId && song.youtubeVideoId !== song.songId) {
              await deleteAudioBlobOnly(song.youtubeVideoId);
            }
            cachedBlob = null;
          }
          if (cachedBlob && !cancelled) {
            const blobUrl = URL.createObjectURL(cachedBlob);
            player.src = blobUrl;
            if (stateRef.current.currentTime > 0) {
              try { player.currentTime = stateRef.current.currentTime; } catch {}
            }
            setState((prev) => ({
              ...prev,
              streamUrl: blobUrl,
              isBuffering: false,
              isPlaying: false,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              isBuffering: false,
              isPlaying: false,
            }));
          }
        }).catch(() => {
          setState((prev) => ({ ...prev, isBuffering: false, isPlaying: false }));
        });
        return;
      }
    }

    // If the audio element was already started synchronously by syncPlayTrack/playNow/next/prev, do not pause or reload!
    const targetVid = song.youtubeVideoId || song.songId || "";
    const isCurrentSrcActive = player.src && (
      (targetVid && player.src.includes(encodeURIComponent(targetVid))) ||
      player.src.includes(encodeURIComponent(song.title)) ||
      (state.streamUrl && player.src === state.streamUrl)
    );

    if (isCurrentSrcActive) {
      updateMediaSessionMetadata(song);
      if (stateRef.current.isPlaying && player.paused) {
        player.play().catch(() => {});
      }
      return;
    }

    player.pause();
    gestureResumeCleanupRef.current?.(); // drop stale gesture-resume from a previous song
    isLoadingNewSongRef.current = true; // Block onPause from clearing isPlaying while we load
    // Do NOT call player.removeAttribute("src") on iOS as it revokes user gesture activation!
    setState((prev) => ({ ...prev, isBuffering: true, error: null, streamUrl: null }));

    (async () => {
      try {
        // 1. Check Offline cache first (instant local play)
        let cachedBlob = await getAudioBlob(song.songId);
        if (!cachedBlob && song.youtubeVideoId && song.youtubeVideoId !== song.songId) {
          cachedBlob = await getAudioBlob(song.youtubeVideoId);
        }

        // Automatic self-healing: purge corrupted Khaleeji audio blob (e.g. 5.6MB / 6.7MB / 8.4MB Hamada Majrashi)
        if (cachedBlob && isKhaleejiOrCorruptedJannatBlob(song.artist, cachedBlob.size, song.songId || song.title)) {
          console.warn(`[Player] Detected corrupted Khaleeji blob (${cachedBlob.size} bytes) for Jannat track "${song.title}". Auto-purging from storage...`);
          await deleteAudioBlobOnly(song.songId);
          if (song.youtubeVideoId && song.youtubeVideoId !== song.songId) {
            await deleteAudioBlobOnly(song.youtubeVideoId);
          }
          cachedBlob = null;
        }

        if (cachedBlob && !cancelled) {
          console.log("[Player] Playing from offline storage.");
          const blobUrl = URL.createObjectURL(cachedBlob);
          isPlayingRef.current = true;
          setState((prev) => ({ ...prev, isBuffering: false, streamUrl: blobUrl, isPlaying: true, error: null }));

          if (song.thumbnailUrl && !song.thumbnailUrl.startsWith("data:")) {
            getOfflineSongMeta(song.songId).then((meta) => {
              const metaArt = meta?.thumbnailUrl;
              if (metaArt && metaArt.startsWith("data:") && !cancelled) {
                setState((prev) => ({
                  ...prev,
                  queue: prev.queue.map(q => q.songId === song.songId ? { ...q, thumbnailUrl: metaArt } : q)
                }));
              }
            }).catch(() => {});
          }

          player.src = blobUrl;
          player.load();
          const p = player.play();
          if (p !== undefined) {
            p.catch((err) => {
              console.warn("[Player] Local blob autoplay prevented:", err);
              armGestureResume(player);
            });
          }
          return;
        }

        // Guard: If device has no internet, do not attempt remote network resolution
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          throw new Error("هذه الأغنية غير متوفرة في ذاكرة هاتفك الأوفلاين — يرجى الاتصال بالإنترنت أولاً لتنزيلها");
        }

        // 2. Instant Direct Streaming (Starts in seconds without multi-roundtrip delay)
        console.log(`[Player] ⚡ Instant direct streaming for "${song.title}" (${song.artist || ""})...`);

        const classic = JANNAT_OLD_CLASSICS.find(
          (c) =>
            c.songId === song.songId ||
            c.youtubeVideoId === song.youtubeVideoId ||
            c.title === song.title ||
            song.title.includes(c.title) ||
            c.title.includes(song.title)
        );
        const vid = classic ? classic.youtubeVideoId : (song.youtubeVideoId || song.songId || "");
        const songTitle = classic ? classic.title : song.title;
        const songArtist = classic ? "جنات" : (song.artist || "");

        const playUrl = toAbsoluteApiUrl(
          `/api/ytdownload?videoId=${encodeURIComponent(vid)}&title=${encodeURIComponent(songTitle)}&artist=${encodeURIComponent(songArtist)}&proxy=true`
        );

        if (player.src !== playUrl) {
          player.src = playUrl;
          player.preload = "auto";
          player.load();
        }

        isLoadingNewSongRef.current = false;
        isPlayingRef.current = true;

        setState((prev) => ({
          ...prev,
          isBuffering: false,
          isPlaying: true,
          streamUrl: playUrl,
        }));

        player.play().catch((err) => {
          console.warn("[Player] Direct play deferred:", err);
          if (err.name === "NotAllowedError") armGestureResume(player);
        });
      } catch (error) {
        if (!cancelled) {
          console.error("[Player] Playback error:", error);
          isLoadingNewSongRef.current = false;
          const message = error instanceof Error ? error.message : "Playback error";
          // Stop claiming "playing" — otherwise the UI spins at 0:00 (or the
          // previous track quietly keeps running) while the user watches nothing happen.
          setState((prev) => ({
            ...prev,
            isBuffering: false,
            isPlaying: false,
            error: message,
          }));
          // The mini bar shows no error text — surface the reason as a toast
          // so a failed song never looks like an infinite 0:00 load.
          useToastStore.getState().addToast(message, "error");
        }
      }
    })();

    return () => { cancelled = true; isLoadingNewSongRef.current = false; };
  }, [state.currentSongId, state.queue]);


  useEffect(() => {
    const player = audioRef.current;
    if (!player || !state.streamUrl) return;
    // Never auto-resume while a new song is being resolved — otherwise the
    // previous source (still on the element) starts playing again.
    if (isLoadingNewSongRef.current) return;

    const isActuallyPlaying = !player.paused;

    if (state.isPlaying && !isActuallyPlaying) {
      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name === "NotAllowedError") armGestureResume(player);
          else if (err.name !== "AbortError") {
            console.warn("[Player] Playback play() error:", err.message);
          }
        });
      }
    } else if (!state.isPlaying && isActuallyPlaying) {
      player.pause();
    }
  }, [state.isPlaying, state.streamUrl]);

  const lastTimeUpdateRef = useRef(0);
  const onTimeUpdate = () => {
    const player = audioRef.current;
    if (player) {
      const now = performance.now();
      if (now - lastTimeUpdateRef.current >= 300 || player.currentTime === 0) {
        lastTimeUpdateRef.current = now;
        setState((prev) => ({ ...prev, currentTime: player.currentTime || 0 }));

        // Trigger preloading for next track once current track is underway
        if (player.currentTime > 5 && lastPreloadRef.current !== stateRef.current.currentSongId && stateRef.current.currentSongId) {
          lastPreloadRef.current = stateRef.current.currentSongId;
          preloadNext(stateRef.current.currentSongId, stateRef.current.queue);
        }

        // Real-time lock screen & Bluetooth position sync
        if (
          typeof navigator !== "undefined" &&
          "mediaSession" in navigator &&
          "setPositionState" in navigator.mediaSession &&
          player.duration &&
          !isNaN(player.duration) &&
          isFinite(player.duration)
        ) {
          try {
            navigator.mediaSession.setPositionState({
              duration: Math.max(0, player.duration),
              playbackRate: player.playbackRate || 1,
              position: Math.max(0, Math.min(player.currentTime || 0, player.duration)),
            });
          } catch {}
        }
      }
    }
  };

  // Sync currentTime when returning from background lock screen
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      const player = audioRef.current;
      if (player && !document.hidden) {
        setState((prev) => ({ ...prev, currentTime: player.currentTime || 0 }));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Unlock iOS WebKit audio on first touch
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => {
      const player = audioRef.current;
      if (player && player.paused && !player.src) {
        player.load();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("click", unlock, { passive: true });
    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  const onLoadedMetadata = () => {
    const player = audioRef.current;
    if (player) {
      const dur = player.duration || 0;
      setState((prev) => ({ ...prev, duration: dur }));
      syncPositionState();

      // Duration safeguard for Jannat cached tracks
      if (player.src && player.src.startsWith("blob:") && currentSong) {
        const isJannat =
          currentSong.artist?.includes("جنات") ||
          currentSong.artist?.toLowerCase().includes("jannat");
        const classic = JANNAT_OLD_CLASSICS.find(
          (c) =>
            c.songId === currentSong.songId ||
            c.youtubeVideoId === currentSong.youtubeVideoId ||
            c.title === currentSong.title
        );

        if ((isJannat || classic) && classic?.duration) {
          const parts = classic.duration.split(":").map(Number);
          const expectedSec = parts[0] * 60 + parts[1];
          if (dur > 0 && Math.abs(dur - expectedSec) > 30) {
            console.warn(`[Player] Duration mismatch detected for "${currentSong.title}": expected ~${expectedSec}s, got ${dur.toFixed(1)}s. Purging corrupted blob...`);
            deleteAudioBlobOnly(currentSong.songId).catch(() => {});
            if (currentSong.youtubeVideoId) {
              deleteAudioBlobOnly(currentSong.youtubeVideoId).catch(() => {});
            }
            // Stream the authentic audio directly
            const targetVid = currentSong.youtubeVideoId || currentSong.songId || "";
            const streamUrl = toAbsoluteApiUrl(`/api/ytdownload?videoId=${encodeURIComponent(targetVid)}&title=${encodeURIComponent(currentSong.title)}&artist=${encodeURIComponent(currentSong.artist || "")}&proxy=true`);
            player.src = streamUrl;
            player.load();
            player.play().catch(() => {});
            setState((prev) => ({ ...prev, streamUrl, isBuffering: false, isPlaying: true }));
          }
        }
      }
    }
  };

  const onWaiting = () => {
    setState((prev) => ({ ...prev, isBuffering: true }));
  };

  const onPlaying = () => {
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    syncPositionState();
    setState((prev) => ({ ...prev, isBuffering: false, error: null }));
  };

  const onPlay = () => {
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "playing";
    }
    syncPositionState();
    setState((prev) => ({ ...prev, isPlaying: true }));
  };

  const onPause = () => {
    // Do NOT set isPlaying:false if we paused the element ourselves during loading.
    // This prevents the UI from flashing the pause icon between songs.
    if (isLoadingNewSongRef.current) return;
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "paused";
    }
    syncPositionState();
    setState((prev) => ({ ...prev, isPlaying: false }));
  };

  const onEnded = () => {
    const currentState = stateRef.current;
    if (!currentState.queue.length || !currentState.currentSongId) {
      setState((prev) => ({ ...prev, isPlaying: false }));
      return;
    }

    // Handle repeat "one"
    if (currentState.repeat === "one") {
      const player = audioRef.current;
      if (player) {
        player.currentTime = 0;
        player.play().catch(() => undefined);
      }
      return;
    }

    if (nextRef.current) {
      nextRef.current();
    }
  };

  const value: PlayerContextValue = {
    state,
    currentSong,
    setQueue,
    enqueueSongs,
    playNow,
    playSongById,
    next,
    prev,
    togglePlay,
    setShuffle,
    cycleRepeat,
    setVolume,
    toggleMute,
    setSpeed,
    seekTo,
    setHighQuality,
    setIsAiMix,
    soundPreset,
    setSoundPreset,
    soundBoost: state.soundBoost,
    setSoundBoost,
    is8dActive: state.is8dActive,
    setIs8dActive,
    getAnalyser: () => analyserRef.current,
    closePlayer: () => {
      const player = audioRef.current;
      if (player) {
        player.pause();
        player.removeAttribute("src");
        player.load();
      }
      setState(initialPlayerState);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState = "none";
          navigator.mediaSession.metadata = null;
        } catch {}
      }
    },
    prewarm: (videoId: string) => {
      // Prewarming removed for direct download chunking proxy
    }
  };

  // ─── AI Mix (Smart Radio) Logic ─────────────────────────────────────────
  const isFetchingAiMixRef = useRef(false);

  useEffect(() => {
    if (!state.isAiMix || !state.currentSongId || state.queue.length === 0) return;
    
    // Trigger when we are at the last or second-to-last song
    const currentIndex = state.queue.findIndex(s => s.songId === state.currentSongId);
    if (currentIndex >= state.queue.length - 2 && !isFetchingAiMixRef.current) {
      isFetchingAiMixRef.current = true;
      
      const currentSongData = state.queue[currentIndex];
      const query = currentSongData.artist || "أغاني تريند";
      
      console.log("[AI Mix] Fetching related songs for:", query);
      
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(resData => {
          if (resData && resData.data && resData.data.songs && resData.data.songs.length > 0) {
            // Filter out songs already in the queue
            const existingIds = new Set(state.queue.map(s => s.songId));
            const newSongs = resData.data.songs
              .filter((s: QueueSong) => !existingIds.has(s.songId))
              .slice(0, 10); // add up to 10 new songs
            
            if (newSongs.length > 0) {
              console.log("[AI Mix] Fetched new songs:", newSongs);
              setState(prev => ({
                ...prev,
                queue: [...prev.queue, ...newSongs]
              }));
              useToastStore.getState().addToast("AI Mix يضيف ألحاناً مشابهة ✨");
            }
          }
        })
        .catch(console.error)
        .finally(() => {
          // Prevent rapid re-fetching
          setTimeout(() => { isFetchingAiMixRef.current = false; }, 10000);
        });
    }
  }, [state.isAiMix, state.currentSongId, state.queue.length]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        data-main-player="true"
        playsInline
        preload="auto"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={onLoadedMetadata}
        onWaiting={onWaiting}
        onPlaying={onPlaying}
        onCanPlay={onPlaying}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onError={(e) => {
          const error = e.currentTarget.error;
          const currentSrc = e.currentTarget.src;
          
          console.error("Audio error detected:", {
            code: error?.code,
            message: error?.message,
            src: currentSrc ? (currentSrc.length > 50 ? currentSrc.substring(0, 50) + "..." : currentSrc) : "none"
          });

          // Explicitly log known HTML5 error codes
          if (error?.code) {
            const codes: any = {
              1: "MEDIA_ERR_ABORTED - تم إلغاء التحميل",
              2: "MEDIA_ERR_NETWORK - خطأ في الشبكة",
              3: "MEDIA_ERR_DECODE - خطأ في فك تشفير الملف",
              4: "MEDIA_ERR_SRC_NOT_SUPPORTED - الرابط غير صالح أو التنسيق غير مدعوم"
            };
            console.error(`Status: ${codes[error.code] || "خطأ غير معروف"}`);
          }

          // Simple retry logic removed as it causes infinite loops if the source URL is permanently dead.
          // The user will need to tap play again or we skip to next.
          setState(prev => ({ ...prev, isBuffering: false, error: "حدث خطأ أثناء تشغيل الأغنية. الرجاء المحاولة مرة أخرى." }));
        }}
      />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used inside PlayerProvider");
  }
  return context;
}
