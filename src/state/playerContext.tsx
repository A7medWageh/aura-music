"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialPlayerState, PlayerState, QueueSong, RepeatMode } from "@/state/playerState";
import { getAudioBlob } from "@/offline/indexedDbCache";
import { downloadSong } from "@/services/offline/downloader";
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
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(initialPlayerState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(state.isPlaying);
  const isLoadingNewSongRef = useRef(false); // true while fetching stream URL, prevents onPause from clearing isPlaying
  const gestureResumeCleanupRef = useRef<(() => void) | null>(null); // pending "resume on next gesture" listeners

  const currentSong = useMemo(
    () => state.queue.find((song) => song.songId === state.currentSongId) ?? null,
    [state.currentSongId, state.queue]
  );

  // Persist queue to localStorage so other pages (favorites) can access song info
  useEffect(() => {
    if (state.queue.length > 0) {
      try {
        localStorage.setItem("aura-player-state", JSON.stringify({ queue: state.queue }));
      } catch { /* ignore */ }
    }
  }, [state.queue]);

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
    setState((prev) => {
      if (!prev.queue.length || !prev.currentSongId) return prev;
      const index = prev.queue.findIndex((song) => song.songId === prev.currentSongId);
      const nextIndex = prev.shuffle
        ? Math.floor(Math.random() * prev.queue.length)
        : index >= 0
          ? (index + 1) % prev.queue.length
          : 0;
      return { 
        ...prev, 
        currentSongId: prev.queue[nextIndex].songId, 
        isPlaying: true,
        currentTime: 0,
        duration: 0
      };
    });
  };

  const prev = () => {
    primeAudioElement();
    setState((prevState) => {
      if (!prevState.queue.length || !prevState.currentSongId) return prevState;
      const index = prevState.queue.findIndex((song) => song.songId === prevState.currentSongId);
      const prevIndex = index <= 0 ? prevState.queue.length - 1 : index - 1;
      return { 
        ...prevState, 
        currentSongId: prevState.queue[prevIndex].songId, 
        isPlaying: true,
        currentTime: 0,
        duration: 0
      };
    });
  };

  const togglePlay = () => {
    const player = audioRef.current;
    if (player) {
      if (state.isPlaying) {
        player.pause();
        setState((prev) => ({ ...prev, isPlaying: false }));
      } else {
        const p = player.play();
        if (p !== undefined) {
          p.then(() => {
            setState((prev) => ({ ...prev, isPlaying: true }));
          }).catch((err) => {
            console.warn("[Player] Direct play() rejected:", err);
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

  const setVolume = (value: number) => {
    setState((prev) => ({ ...prev, volume: Math.max(0, Math.min(1, value)) }));
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
  }, [state.isPlaying]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    player.volume = state.volume;
  }, [state.volume]);

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;
    player.playbackRate = state.speed;
  }, [state.speed]);



  const preloadNext = (currentId: string, queue: QueueSong[]) => {
    // Preloading disabled to save bandwidth
  };

  // ─── Media Session API (Lock Screen Controls) ─────────────────────
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

    navigator.mediaSession.setActionHandler("play",          () => { if (audioRef.current) audioRef.current.play().catch(() => {}); setState(p => ({ ...p, isPlaying: true })); });
    navigator.mediaSession.setActionHandler("pause",         () => { audioRef.current?.pause(); setState(p => ({ ...p, isPlaying: false })); });
    navigator.mediaSession.setActionHandler("nexttrack",     () => next());
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    navigator.mediaSession.setActionHandler("stop",          () => { audioRef.current?.pause(); setState(p => ({ ...p, isPlaying: false })); });
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
  }, []);  // Handlers call state setters — stable refs ok

  useEffect(() => {
    const player = audioRef.current;
    if (!player) return;

    if (!state.currentSongId) { player.pause(); return; }

    const song = state.queue.find((item) => item.songId === state.currentSongId);
    if (!song) return;

    let cancelled = false;

    player.pause();
    gestureResumeCleanupRef.current?.(); // drop stale gesture-resume from a previous song
    isLoadingNewSongRef.current = true; // Block onPause from clearing isPlaying while we load
    // Do NOT call player.removeAttribute("src") on iOS as it revokes user gesture activation!
    setState((prev) => ({ ...prev, isBuffering: true, error: null, streamUrl: null }));

    (async () => {
      try {
        // 1. Check Offline cache first (instant local play)
        const cachedBlob = await getAudioBlob(song.songId);
        if (cachedBlob && !cancelled) {
          console.log("[Player] Playing from offline storage.");
          const blobUrl = URL.createObjectURL(cachedBlob);
          setState((prev) => ({ ...prev, isBuffering: false, streamUrl: blobUrl }));
          player.src = blobUrl;
          player.load();
          if (isPlayingRef.current) {
            const p = player.play();
            if (p !== undefined) p.catch(() => {});
          }
          return;
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

        // Fresh-song progressive start: kick off the full-file Telegram ingest
        // in the background so the next play of this song is instant + seekable.
        if (data.warmUrl) {
          fetch(toAbsoluteApiUrl(data.warmUrl)).catch(() => {});
        }

        // If directPlay is true and host allows CORS (like JioSaavn CDN), stream directly.
        // If host blocks CORS (like Albumaty) or requires custom headers, proxy via /api/stream-proxy
        const hasDirectCors = data.url.includes("saavncdn.com") || data.url.includes("sndcdn.com");
        const isDirect = Boolean(data.directPlay && hasDirectCors && !data.url.includes("googlevideo.com") && !data.url.includes("albumaty.com"));
        
        let playUrl: string;
        if (data.source === "youtube" || data.url.includes("youtube.com") || data.url.includes("youtu.be")) {
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

        // Attempt play immediately — on iOS this may be deferred until canplay
        const tryPlay = () => {
          const playPromise = player.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn("[Player] Autoplay play() was deferred:", err);
              if (err.name === "NotAllowedError") armGestureResume(player);
            });
          }
        };

        // On iOS, play() before canplay may fail silently; listen for canplay too
        if (player.readyState >= 3) {
          tryPlay();
        } else {
          const onCanPlay = () => {
            player.removeEventListener("canplay", onCanPlay);
            if (!cancelled && isPlayingRef.current) tryPlay();
          };
          player.addEventListener("canplay", onCanPlay);
        }
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
      setState((prev) => ({ ...prev, duration: player.duration || 0 }));
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
    setState((prev) => {
      if (!prev.queue.length || !prev.currentSongId) return { ...prev, isPlaying: false };
      
      // Handle repeat "one"
      if (prev.repeat === "one") {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => undefined);
        }
        return prev;
      }
      
      const currentIndex = prev.queue.findIndex((song) => song.songId === prev.currentSongId);
      
      // Handle queue end
      if (currentIndex === prev.queue.length - 1 && prev.repeat === "off") {
        return { ...prev, isPlaying: false };
      }
      
      // Determine next index
      const nextIndex = prev.shuffle
        ? Math.floor(Math.random() * prev.queue.length)
        : (currentIndex + 1) % prev.queue.length;
        
      return { 
        ...prev, 
        currentSongId: prev.queue[nextIndex]?.songId ?? null, 
        isPlaying: true,
        currentTime: 0,
        duration: 0
      };
    });
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
    setSpeed,
    seekTo,
    setHighQuality,
    setIsAiMix,
    soundPreset,
    setSoundPreset,
    getAnalyser: () => analyserRef.current,
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
