"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialPlayerState, PlayerState, QueueSong, RepeatMode } from "@/state/playerState";
import { getAudioBlob, getOfflineSongMeta, deleteAudioBlobOnly, isKhaleejiOrCorruptedJannatBlob, autoPurgeCorruptedJannatBlobs } from "@/offline/indexedDbCache";
import { JANNAT_OLD_CLASSICS } from "@/data/jannatClassics";
import { downloadSong } from "@/services/offline/downloader";
import { setMainAudioPlaying } from "@/services/offline/backgroundKeepAlive";
import { useToastStore } from "@/state/toastStore";
import { toAbsoluteApiUrl } from "@/utils/apiBase";

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
  getAnalyser: () => AnalyserNode | null;
  closePlayer: () => void;
  toggleMute: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("aura-player-session");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.queue && parsed.queue.length > 0 && parsed.currentSongId) {
            return {
              ...initialPlayerState,
              queue: parsed.queue,
              currentSongId: parsed.currentSongId,
              currentTime: parsed.currentTime || 0,
              volume: parsed.volume ?? initialPlayerState.volume,
              isPlaying: false // keep paused on initial mount so browser autoplay policies are respected
            };
          }
        }
      } catch {}
    }
    return initialPlayerState;
  });

  // Auto-clean any corrupted/duplicate Khaleeji audio blobs from user's device on startup
  useEffect(() => {
    autoPurgeCorruptedJannatBlobs().catch(() => {});
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

  const currentSong = useMemo(
    () => state.queue.find((song) => song.songId === state.currentSongId) ?? null,
    [state.currentSongId, state.queue]
  );

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

  const setQueue = (songs: QueueSong[], startIndex = 0) => {
    const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
    setState((prev) => ({
      ...prev,
      queue: songs,
      currentSongId: songs[idx]?.songId ?? null,
      isPlaying: songs.length > 0,
      currentTime: 0,
      duration: 0,
      error: null
    }));
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

  // Deferred play after an autoplay-policy failure; must be cancelled
  // when switching songs, otherwise the stale listener resumes the OLD src.
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
    primeAudioElement();
    if (typeof window !== "undefined") {
      import("@/services/user/listeningHistory").then(({ trackPlay }) => trackPlay(song)).catch(() => {});
    }
    
    setState((prev) => {
      const exists = prev.queue.some((item) => item.songId === song.songId);
      const nextQueue = exists ? prev.queue : [song, ...prev.queue];
      return {
        ...prev,
        queue: nextQueue,
        currentSongId: song.songId,
        isPlaying: true,
        currentTime: 0,
        duration: 0,
        error: null
      };
    });
  };

  const playSongById = async (songId: string) => {
    primeAudioElement();
    setState((prev) => ({ ...prev, currentSongId: songId, isPlaying: true }));
  };

  const next = () => {
    primeAudioElement();
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

    const player = audioRef.current;
    if (player && nextPreloadedRef.current && nextPreloadedRef.current.songId === nextSong.songId) {
      player.src = nextPreloadedRef.current.url;
      player.load();
      player.play().catch(() => {});
      nextPreloadedRef.current = null;
    }

    setState((prev) => ({ 
      ...prev, 
      currentSongId: nextSong.songId, 
      isPlaying: true,
      currentTime: 0,
      duration: 0
    }));
  };

  const prev = () => {
    primeAudioElement();
    const currentState = stateRef.current;
    if (!currentState.queue.length || !currentState.currentSongId) return;
    const index = currentState.queue.findIndex((song) => song.songId === currentState.currentSongId);
    const prevIndex = index <= 0 ? currentState.queue.length - 1 : index - 1;
    const prevSong = currentState.queue[prevIndex];
    if (!prevSong) return;

    setState((prevState) => ({ 
      ...prevState, 
      currentSongId: prevSong.songId, 
      isPlaying: true,
      currentTime: 0,
      duration: 0
    }));
  };

  const togglePlay = () => {
    const player = audioRef.current;
    if (player) {
      if (state.isPlaying) {
        player.pause();
        setState((prev) => ({ ...prev, isPlaying: false }));
      } else {
        // If the audio element has no src loaded yet (e.g. after a page refresh), load and play currentSong
        if ((!player.src || player.src === "" || player.src === window.location.href) && currentSong) {
          playNow(currentSong);
          return;
        }
        const p = player.play();
        if (p !== undefined) {
          p.then(() => {
            setState((prev) => ({ ...prev, isPlaying: true }));
          }).catch((err) => {
            console.warn("[Player] Direct play() rejected, falling back to playNow:", err);
            if (currentSong) playNow(currentSong);
          });
        } else {
          setState((prev) => ({ ...prev, isPlaying: true }));
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
      if (isPrem || hqPref === "true") {
        setState((prev) => ({ ...prev, isHighQuality: true }));
      }
      const savedPreset = localStorage.getItem("aura_sound_preset") as any;
      if (savedPreset && ["crystal", "bass", "vocal", "spatial", "noise_cancel"].includes(savedPreset)) {
        setSoundPresetState(savedPreset);
      }
    } catch {}
  }, []);

  // ─── Web Audio API (Master-Grade Studio Sound Clarity & Dynamics) ──
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const preGainRef = useRef<GainNode | null>(null);
  const postGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const PRESET_CONFIGS = {
    crystal: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 50, gain: 4.5 },
        { type: "peaking"  as BiquadFilterType, freq: 180, gain: 2.5, Q: 0.9 },
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -3.0, Q: 1.4 }, // Anti-mud notch
        { type: "peaking"  as BiquadFilterType, freq: 3400, gain: 5.0, Q: 1.0 }, // Crystal vocal presence
        { type: "highshelf" as BiquadFilterType, freq: 12000, gain: 6.5 },        // High-end shimmer
      ],
      comp: { threshold: -15, ratio: 2.4, attack: 0.004, release: 0.12 },
      postGain: 1.25,
    },
    bass: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 50, gain: 8.0 },
        { type: "peaking"  as BiquadFilterType, freq: 160, gain: 4.0, Q: 0.9 },
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -2.0, Q: 1.2 },
        { type: "peaking"  as BiquadFilterType, freq: 3200, gain: 3.2, Q: 1.0 },
        { type: "highshelf" as BiquadFilterType, freq: 11000, gain: 4.5 },
      ],
      comp: { threshold: -17, ratio: 2.8, attack: 0.005, release: 0.14 },
      postGain: 1.20,
    },
    vocal: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 65, gain: 1.5 },
        { type: "peaking"  as BiquadFilterType, freq: 200, gain: 1.0, Q: 1.0 },
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -4.0, Q: 1.5 },
        { type: "peaking"  as BiquadFilterType, freq: 3500, gain: 6.8, Q: 1.1 }, // Ultra crisp vocal forward
        { type: "highshelf" as BiquadFilterType, freq: 12500, gain: 5.5 },
      ],
      comp: { threshold: -14, ratio: 2.0, attack: 0.003, release: 0.10 },
      postGain: 1.20,
    },
    spatial: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 55, gain: 3.8 },
        { type: "peaking"  as BiquadFilterType, freq: 220, gain: 2.2, Q: 0.8 },
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -3.5, Q: 1.4 }, // Center clarity for wide 3D stage
        { type: "peaking"  as BiquadFilterType, freq: 3800, gain: 6.5, Q: 0.85 }, // Binaural ear pinna HRTF boost
        { type: "highshelf" as BiquadFilterType, freq: 13500, gain: 8.5 }, // Ultra-wide 3D atmospheric air
      ],
      comp: { threshold: -14, ratio: 2.2, attack: 0.004, release: 0.12 },
      postGain: 1.30,
    },
    noise_cancel: {
      bands: [
        { type: "highpass" as BiquadFilterType, freq: 85, gain: 0, Q: 0.8 },      // 85Hz High-pass: Kills mic rumble & wind noise
        { type: "peaking"  as BiquadFilterType, freq: 55, gain: -16.0, Q: 6.0 },   // Notch: Eliminates 50/60Hz AC electrical hum
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -4.5, Q: 1.5 },   // Suppresses background room ambience
        { type: "peaking"  as BiquadFilterType, freq: 3200, gain: 6.5, Q: 1.1 },  // Vocal purity & studio isolation
        { type: "highshelf" as BiquadFilterType, freq: 15500, gain: -6.0 },       // Lowers tape hiss & high-frequency static
      ],
      comp: { threshold: -24, ratio: 4.8, attack: 0.002, release: 0.08 },         // Downward expander / noise gate
      postGain: 1.18,
    },
  };

  const applyAudioParameters = (ctx: AudioContext, isHq: boolean, presetKey: "crystal" | "bass" | "vocal" | "spatial" | "noise_cancel") => {
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
      if (postGainRef.current) postGainRef.current.gain.setTargetAtTime(1.0, now, t);
      return;
    }

    const cfg = PRESET_CONFIGS[presetKey] || PRESET_CONFIGS.crystal;
    if (preGainRef.current) preGainRef.current.gain.setTargetAtTime(0.85, now, t); // -1.4 dB headroom

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
      compressorRef.current.knee.setTargetAtTime(10, now, t);
      compressorRef.current.ratio.setTargetAtTime(cfg.comp.ratio, now, t);
      compressorRef.current.attack.setTargetAtTime(cfg.comp.attack, now, t);
      compressorRef.current.release.setTargetAtTime(cfg.comp.release, now, t);
    }

    if (postGainRef.current) postGainRef.current.gain.setTargetAtTime(cfg.postGain, now, t);
  };

  const initWebAudio = () => {
    const player = audioRef.current;
    if (!player || typeof window === "undefined" || audioCtxRef.current) return;

    // Detect iOS / iPhone / iPad / WKWebView
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (typeof navigator.platform === "string" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      // In iOS WebKit, createMediaElementSource causes silent audio, freezes playback at 0:00,
      // and fails due to WebKit bug 205847 / CORS issues. iOS has native high-quality AVPlayer.
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(player);
      mediaSourceRef.current = source;

      // 1. Pre-Gain stage
      const preGain = ctx.createGain();
      preGain.gain.value = 1.0;
      preGainRef.current = preGain;

      // 2. 5-Band Studio Equalizer (starts neutral)
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

      // 3. Studio Mastering Compressor
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = 0;
      comp.knee.value = 12;
      comp.ratio.value = 1.0;
      comp.attack.value = 0.004;
      comp.release.value = 0.12;
      compressorRef.current = comp;

      // 4. Post-Gain stage
      const postGain = ctx.createGain();
      postGain.gain.value = 1.0;
      postGainRef.current = postGain;

      // Connect graph: source -> preGain -> nodes -> comp -> postGain -> destination
      source.connect(preGain);
      let lastNode: AudioNode = preGain;
      for (const n of nodes) {
        lastNode.connect(n);
        lastNode = n;
      }
      lastNode.connect(comp);
      comp.connect(postGain);
      postGain.connect(ctx.destination);

      // 5. Analyser tap (visualizer only — never in the output chain)
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      analyserRef.current = analyser;
      postGain.connect(analyser);

      // Apply initial audio parameters
      applyAudioParameters(ctx, state.isHighQuality, soundPreset);
    } catch (err) {
      console.warn("[WebAudio] Init error:", err);
    }
  };

  useEffect(() => {
    // Init on play too (non-iOS) so the visualizer works even without HQ mode.
    if ((state.isHighQuality || state.isPlaying) && !audioCtxRef.current) {
      initWebAudio();
    }
    const ctx = audioCtxRef.current;
    if (ctx) {
      if (ctx.state === "suspended" && state.isPlaying) {
        ctx.resume().catch(() => {});
      }
      applyAudioParameters(ctx, state.isHighQuality, soundPreset);
    }
  }, [state.isHighQuality, state.isPlaying, soundPreset]);

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
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const song = currentSong;
    if (!song) return;

    const art = song.thumbnailUrl || song.metadata?.thumbnailUrl;
    const artwork: MediaImage[] = art
      ? [
          { src: art, sizes: "96x96",   type: "image/jpeg" },
          { src: art, sizes: "128x128", type: "image/jpeg" },
          { src: art, sizes: "192x192", type: "image/jpeg" },
          { src: art, sizes: "256x256", type: "image/jpeg" },
          { src: art, sizes: "512x512", type: "image/jpeg" },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title:  song.title  || "أغنية",
      artist: song.artist || "فنان",
      album:  (song.metadata?.album) || "Aura Music",
      artwork,
    });
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
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      const p = player.play();
      if (p !== undefined) {
        p.then(() => {
          setState(prev => ({ ...prev, isPlaying: true }));
        }).catch(err => {
          console.warn("[MediaSession] play() rejected:", err);
        });
      } else {
        setState(prev => ({ ...prev, isPlaying: true }));
      }
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      const player = audioRef.current;
      if (player) {
        player.pause();
      }
      setState(prev => ({ ...prev, isPlaying: false }));
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("stop", () => {
      audioRef.current?.pause();
      setState(p => ({ ...p, isPlaying: false }));
    });
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) seekTo(d.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const skipTime = details.seekOffset || 10;
      if (audioRef.current) seekTo(Math.max(0, audioRef.current.currentTime - skipTime));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const skipTime = details.seekOffset || 10;
      if (audioRef.current) seekTo(audioRef.current.currentTime + skipTime);
    });

    return () => {
      (["play","pause","nexttrack","previoustrack","stop","seekto","seekbackward","seekforward"] as MediaSessionAction[]).forEach(a => {
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

        // 2. Resolve stream URL via Universal Audio Resolver (JioSaavn / Albumaty / SoundCloud / YouTube)
        console.log(`[Player] Resolving audio stream for "${song.title}" (${song.artist || ""})...`);
        setState((prev) => ({ ...prev, isBuffering: true }));

        const params = new URLSearchParams();
        const vid = song.youtubeVideoId || song.songId || "";
        if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
          params.set("videoId", vid);
        }
        if (song.title) params.set("title", song.title);
        if (song.artist) params.set("artist", song.artist);
        params.set("resolveOnly", "true");

        const resolveRes = await fetch(toAbsoluteApiUrl(`/api/ytdownload?${params.toString()}`));
        if (!resolveRes.ok) {
          const errData = await resolveRes.json().catch(() => ({}));
          console.error(`[Player] ytdownload error for "${song.title}":`, errData);
          throw new Error(errData.error || "فشل في استخراج الرابط الصوتي للأغنية");
        }
        const data = await resolveRes.json();
        
        if (!data.url) throw new Error("لم يتم العثور على رابط صوتي للأغنية");
        if (cancelled) return;

        // Fresh-song progressive start: the browser streams straight from the
        // extraction worker (no time cap) while we ingest the full file into the
        // Telegram cache in the background. If the temporary stream ever drops
        // (tunnel hiccup), we re-warm and hand over to the cached file from the
        // exact position — the song must never stop.
        if (data.warmUrl) {
          const warmUrl = toAbsoluteApiUrl(data.warmUrl);
          let swapped = false;
          let warmRetried = false;
          const stillOnTempStream = () => {
            const p = audioRef.current;
            return !!p && /forceYtDlp=true|streamNow=true/.test(p.currentSrc || p.src);
          };
          const trySwapToCached = async (): Promise<boolean> => {
            if (swapped || cancelled || !stillOnTempStream()) return false;
            try {
              const rr = await fetch(toAbsoluteApiUrl(`/api/ingest-status?videoId=${encodeURIComponent(vid)}`));
              if (!rr.ok) return false;
              const d2 = await rr.json();
              if (!d2.cached || !d2.url) return false;
              if (swapped || cancelled || !stillOnTempStream()) return false;
              swapped = true;
              const p = audioRef.current!;
              const pos = p.currentTime;
              const wasPlaying = isPlayingRef.current;
              const abs = toAbsoluteApiUrl(d2.url);
              console.log(`[Player] Progressive→cached swap at ${pos.toFixed(1)}s for "${song.title}"`);
              p.src = abs;
              p.load();
              const onCan = () => {
                p.removeEventListener("canplay", onCan);
                try { p.currentTime = pos; } catch {}
                if (wasPlaying) p.play().catch(() => {});
              };
              p.addEventListener("canplay", onCan);
              setState((prev) => ({ ...prev, streamUrl: abs }));
              return true;
            } catch {
              return false;
            }
          };
          let handoverStarted = false;
          const handover = () => {
            if (swapped || cancelled || handoverStarted) return;
            handoverStarted = true;
            let n = 0;
            const iv = setInterval(async () => {
              const ok = await trySwapToCached();
              if (!ok && n === 2 && !warmRetried) {
                warmRetried = true;
                fetch(warmUrl).catch(() => {});
              }
              if (ok || ++n >= 45) clearInterval(iv);
            }, 4000);
          };
          // The live pipe is not seekable, so as soon as the full file lands in the
          // cache we move playback onto it — no need to wait for the stream to drop.
          fetch(warmUrl).catch(() => {});
          handover();
          player.addEventListener("ended", handover);
          let tunnelRetried = false;
          player.addEventListener("error", () => {
            handover();
            if (swapped || cancelled || tunnelRetried || !data.fallbackUrl) return;
            const p = audioRef.current;
            if (!p || !stillOnTempStream()) return;
            tunnelRetried = true;
            // The direct tunnel can fail on some networks while the same worker is
            // reachable through Vercel — keep the song playing instead of going silent.
            const abs = toAbsoluteApiUrl(data.fallbackUrl);
            console.warn(`[Player] Direct tunnel stream failed for "${song.title}" — using the proxied stream`);
            const pos = p.currentTime;
            const wasPlaying = isPlayingRef.current;
            p.src = abs;
            p.load();
            const onCan = () => {
              p.removeEventListener("canplay", onCan);
              try { p.currentTime = pos; } catch {}
              if (wasPlaying) p.play().catch(() => {});
            };
            p.addEventListener("canplay", onCan);
            setState((prev) => ({ ...prev, streamUrl: abs }));
          });
        }

        // If directPlay is true and host allows CORS (like JioSaavn CDN), stream directly.
        // If host blocks CORS (like Albumaty) or requires custom headers, proxy via /api/stream-proxy
        const hasDirectCors = data.url.includes("saavncdn.com") || data.url.includes("sndcdn.com");
        const isDirect = Boolean(data.directPlay && hasDirectCors && !data.url.includes("googlevideo.com") && !data.url.includes("albumaty.com"));
        
        let playUrl: string;
        if (data.source === "stream") {
          playUrl = /^https?:/.test(data.url) ? data.url : toAbsoluteApiUrl(data.url);
        } else if (data.source === "youtube" || data.url.includes("youtube.com") || data.url.includes("youtu.be")) {
          const targetVid = vid || song.youtubeVideoId || song.songId || "";
          playUrl = toAbsoluteApiUrl(`/api/ytdownload?videoId=${encodeURIComponent(targetVid)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist || "")}&proxy=true`);
        } else if (isDirect) {
          playUrl = data.url;
        } else if (data.url.startsWith("/api/ytdownload") || data.url.startsWith("/api/telegram")) {
          playUrl = toAbsoluteApiUrl(data.url);
        } else {
          playUrl = toAbsoluteApiUrl(`/api/stream-proxy?url=${encodeURIComponent(data.url)}&title=${encodeURIComponent(song.title)}&videoId=${encodeURIComponent(vid)}`);
        }

        console.log(`[Player] Streaming "${song.title}" via ${data.source || "direct"} (url=${playUrl})...`);
        if (player.src !== playUrl) {
          player.src = playUrl;
          player.preload = "auto";
          player.load();
        }

        isLoadingNewSongRef.current = false; // Allow onPause to work normally again

        setState((prev) => ({
          ...prev,
          isBuffering: true, // still buffering until canplay fires
          isPlaying: true,   // FORCE playing=true so UI shows play icon immediately
          streamUrl: playUrl,
          duration: data.durationSec || prev.duration,
        }));
        isPlayingRef.current = true;

        // Attempt play immediately — on iOS/Android start playback as soon as the first chunk arrives
        const tryPlay = () => {
          const playPromise = player.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn("[Player] Autoplay play() was deferred:", err);
              if (err.name === "NotAllowedError") armGestureResume(player);
            });
          }
        };

        // Trigger on loadeddata (instant first frame/chunk) or canplay without waiting for full buffer
        if (player.readyState >= 2) {
          tryPlay();
        } else {
          const onDataReady = () => {
            player.removeEventListener("loadeddata", onDataReady);
            player.removeEventListener("canplay", onDataReady);
            if (!cancelled && isPlayingRef.current) tryPlay();
          };
          player.addEventListener("loadeddata", onDataReady, { once: true });
          player.addEventListener("canplay", onDataReady, { once: true });
        }
        tryPlay();
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
    setState((prev) => ({ ...prev, isBuffering: false, error: null }));
  };

  const onPlay = () => {
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    setState((prev) => ({ ...prev, isPlaying: true }));
  };

  const onPause = () => {
    // Do NOT set isPlaying:false if we paused the element ourselves during loading.
    // This prevents the UI from flashing the pause icon between songs.
    if (isLoadingNewSongRef.current) return;
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

    const currentIndex = currentState.queue.findIndex((song) => song.songId === currentState.currentSongId);
    let nextIndex = 0;
    if (currentState.shuffle) {
      nextIndex = Math.floor(Math.random() * currentState.queue.length);
    } else if (currentIndex >= 0) {
      // Loop album / singles queue seamlessly so music never unexpectedly stops
      nextIndex = (currentIndex + 1) % currentState.queue.length;
    }

    const nextSong = currentState.queue[nextIndex];
    if (!nextSong) return;

    // Fast synchronous media handoff to satisfy iOS & Android background lock screen policies
    const player = audioRef.current;
    if (player && nextPreloadedRef.current && nextPreloadedRef.current.songId === nextSong.songId) {
      player.src = nextPreloadedRef.current.url;
      player.load();
      player.play().catch((e) => console.warn("[AutoAdvance] Fast handoff play error:", e));
      nextPreloadedRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      currentSongId: nextSong.songId,
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      error: null
    }));
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
