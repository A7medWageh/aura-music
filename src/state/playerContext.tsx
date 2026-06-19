"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialPlayerState, PlayerState, QueueSong, RepeatMode } from "@/state/playerState";
import { getAudioBlob } from "@/offline/indexedDbCache";
import { downloadSong } from "@/services/offline/downloader";
import { useToastStore } from "@/state/toastStore";

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
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(initialPlayerState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(state.isPlaying);

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

  const playNow = async (song: QueueSong) => {
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
    setState((prev) => ({ ...prev, currentSongId: songId, isPlaying: true }));
  };

  const next = () => {
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
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
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

  const setHighQuality = (value: boolean) => {
    setState((prev) => ({ ...prev, isHighQuality: value }));
  };

  // ─── Web Audio API (High Quality 5-Band Equalizer) ──────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);

  const buildEQChain = (ctx: AudioContext, source: MediaElementAudioSourceNode) => {
    // 5-Band Professional EQ Profile for Music
    const bands = [
      { type: "lowshelf" as BiquadFilterType, frequency: 80,   gain: 7  }, // Sub-bass boost
      { type: "peaking"  as BiquadFilterType, frequency: 250,  gain: 4  }, // Bass body
      { type: "peaking"  as BiquadFilterType, frequency: 2500, gain: 2  }, // Mid presence
      { type: "peaking"  as BiquadFilterType, frequency: 6000, gain: 3  }, // Upper presence / air
      { type: "highshelf" as BiquadFilterType, frequency: 10000,gain: 4 }, // Air / Treble
    ];

    const nodes = bands.map(b => {
      const f = ctx.createBiquadFilter();
      f.type = b.type;
      f.frequency.value = b.frequency;
      f.gain.value = b.gain;
      if (b.type === "peaking") f.Q.value = 0.8;
      return f;
    });

    // Dynamic compressor for loudness and punchy sound
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    compressorRef.current = comp;

    // Chain: source → EQ bands → compressor → output
    source.connect(nodes[0]);
    nodes.forEach((n, i) => { if (i < nodes.length - 1) n.connect(nodes[i + 1]); });
    nodes[nodes.length - 1].connect(comp);
    comp.connect(ctx.destination);
    eqNodesRef.current = nodes;
  };

  useEffect(() => {
    const player = audioRef.current;
    if (!player || typeof window === "undefined") return;

    // Initialize AudioContext only once when needed
    if (state.isHighQuality && !audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      try {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaElementSource(player);
        mediaSourceRef.current = source;
        buildEQChain(ctx, source);
      } catch (err) {
        console.warn("[WebAudio] Failed to create EQ chain:", err);
        audioCtxRef.current = null;
      }
    }

    const ctx = audioCtxRef.current;
    const source = mediaSourceRef.current;
    if (!ctx || !source) return;

    if (state.isHighQuality) {
      if (ctx.state === "suspended") ctx.resume();
      // Already connected via buildEQChain on first enable
      // Re-connect if previously bypassed
      try {
        source.disconnect();
        buildEQChain(ctx, source);
      } catch { /* already connected */ }
    } else {
      // Bypass EQ: disconnect all, connect source directly to output
      try {
        source.disconnect();
        eqNodesRef.current.forEach(n => { try { n.disconnect(); } catch {} });
        compressorRef.current?.disconnect();
        source.connect(ctx.destination);
      } catch { /* ignore */ }
    }
  }, [state.isHighQuality]);

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

    return () => {
      (["play","pause","nexttrack","previoustrack","stop","seekto"] as MediaSessionAction[]).forEach(a => {
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
    player.removeAttribute("src");
    setState((prev) => ({ ...prev, isBuffering: true, error: null, streamUrl: null }));

    (async () => {
      try {
        let videoIdToPlay = song.youtubeVideoId;
        
        // ⚡ Lazy YouTube Resolution if missing
        if (!videoIdToPlay) {
          try {
            const res = await fetch(`/api/resolve-youtube?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist || "")}`);
            const data = await res.json();
            if (data.success && !cancelled) {
              if (data.videoId) {
                videoIdToPlay = data.videoId;
                // Mutate queue to save the resolved ID
                setState(prev => ({
                  ...prev,
                  queue: prev.queue.map(s => s.songId === song.songId ? { ...s, youtubeVideoId: videoIdToPlay } : s)
                }));
              } else if (data.isDirectMp3 && data.streamUrl) {
                // Ignore direct mp3 for offline playing, we need a videoId to download via our worker usually,
                // but if we have directMp3 maybe we can't easily download it with our downloadSong.
                // However, downloadSong uses /api/download?videoId.
                // If we don't have videoId, we can't download.
                throw new Error("لم نتمكن من العثور على الأغنية");
              } else {
                throw new Error("لم نتمكن من العثور على الأغنية");
              }
            } else if (!cancelled) {
              throw new Error("لم نتمكن من العثور على الأغنية");
            }
          } catch (e) {
            if (!cancelled) setState(prev => ({ ...prev, isBuffering: false, error: "فشل البحث عن الأغنية" }));
            return;
          }
        }
        
        // Check Offline cache
        let cachedBlob = await getAudioBlob(song.songId);
        
        if (cachedBlob) {
           console.log("[Player] Playing from offline storage.");
           setState((prev) => ({ ...prev, isBuffering: false, streamUrl: URL.createObjectURL(cachedBlob) }));
           player.src = URL.createObjectURL(cachedBlob);
           player.load();
           if (isPlayingRef.current) player.play().catch(console.error);
           return;
        }

        // Not downloaded - stream online
        console.log("[Player] Streaming online (instant fetch)...");
        
        // Fetch the fast stream URL
        const res = await fetch(`/api/stream/${videoIdToPlay}`);
        const data = await res.json();
        if (!res.ok || !data.streamUrl) throw new Error("فشل في الحصول على رابط التشغيل الأونلاين");
        
        setState((prev) => ({ ...prev, isBuffering: false, streamUrl: data.streamUrl }));
        player.src = data.streamUrl;
        player.load();
        if (isPlayingRef.current) player.play().catch(console.error);

      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            isBuffering: false,
            error: error instanceof Error ? error.message : "Playback error"
          }));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [state.currentSongId, state.queue]);


  useEffect(() => {
    const player = audioRef.current;
    if (!player || !state.streamUrl) return;

    const isActuallyPlaying = !player.paused;

    if (state.isPlaying && !isActuallyPlaying) {
      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== "AbortError") {
            setState((prev) => ({ ...prev, isPlaying: false }));
          }
        });
      }
    } else if (!state.isPlaying && isActuallyPlaying) {
      player.pause();
    }
  }, [state.isPlaying, state.streamUrl]);

  const onTimeUpdate = () => {
    const player = audioRef.current;
    if (player) {
      // MASSIVE mobile optimization: Don't thrash React state (re-rendering) when the screen is locked
      // or the app is in the background. The native audio will continue perfectly without JS overhead.
      if (typeof document !== "undefined" && document.hidden) return;
      setState((prev) => ({ ...prev, currentTime: player.currentTime || 0 }));
    }
  };

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
    setState((prev) => ({ ...prev, isBuffering: false, error: null }));
  };

  const onPlay = () => {
    setState((prev) => ({ ...prev, isPlaying: true }));
  };

  const onPause = () => {
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
    prewarm: (videoId: string) => {
      // Prewarming removed for direct download chunking proxy
    }
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
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
