"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialPlayerState, PlayerState, QueueSong, RepeatMode } from "@/state/playerState";
import { getAudioBlob } from "@/offline/indexedDbCache";
import { downloadSong } from "@/services/offline/downloader";

type PlayerContextValue = {
  state: PlayerState;
  currentSong: QueueSong | null;
  setQueue: (songs: QueueSong[]) => void;
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

  const setQueue = (songs: QueueSong[]) => {
    setState((prev) => ({
      ...prev,
      queue: songs,
      currentSongId: songs[0]?.songId ?? null,
      isPlaying: songs.length > 0,
      error: null
    }));
  };

  const enqueueSongs = (songs: QueueSong[]) => {
    if (!songs.length) return;
    setState((prev) => {
      const existingIds = new Set(prev.queue.map((item) => item.songId));
      const merged = [...prev.queue];
      for (const song of songs) {
        if (!existingIds.has(song.songId)) {
          merged.push(song);
          existingIds.add(song.songId);
        }
      }
      return {
        ...prev,
        queue: merged,
        currentSongId: prev.currentSongId ?? songs[0].songId
      };
    });
  };

  const playNow = (song: QueueSong) => {
    // Track in listening history (client-side, fire-and-forget)
    if (typeof window !== "undefined") {
      import("@/services/user/listeningHistory").then(({ trackPlay }) => trackPlay(song)).catch(() => {});
    }
    
    // Feature removed: do not automatically download in background. Let browser buffer naturally via chunks.

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


  const playSongById = (songId: string) => {
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

  // ─── Web Audio API (High Quality Equalizer) ──────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bassNodeRef = useRef<BiquadFilterNode | null>(null);
  const trebleNodeRef = useRef<BiquadFilterNode | null>(null);

  useEffect(() => {
    const player = audioRef.current;
    if (!player || typeof window === "undefined") return;

    // Initialize AudioContext only once when needed
    if (state.isHighQuality && !audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      try {
        const source = ctx.createMediaElementSource(player);
        mediaSourceRef.current = source;

        // Create EQ nodes
        const bass = ctx.createBiquadFilter();
        bass.type = "lowshelf";
        bass.frequency.value = 150; // Enhance frequencies below 150Hz
        bass.gain.value = 6; // +6dB
        bassNodeRef.current = bass;

        const treble = ctx.createBiquadFilter();
        treble.type = "highshelf";
        treble.frequency.value = 4000; // Enhance frequencies above 4kHz
        treble.gain.value = 4; // +4dB
        trebleNodeRef.current = treble;

        // Connect graph
        source.connect(bass);
        bass.connect(treble);
        treble.connect(ctx.destination);
      } catch (err) {
        console.warn("[WebAudio] Failed to create source:", err);
      }
    }

    if (!audioCtxRef.current || !mediaSourceRef.current || !bassNodeRef.current || !trebleNodeRef.current) return;

    if (state.isHighQuality) {
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
      // Re-enable EQ
      mediaSourceRef.current.disconnect();
      bassNodeRef.current.disconnect();
      trebleNodeRef.current.disconnect();

      mediaSourceRef.current.connect(bassNodeRef.current);
      bassNodeRef.current.connect(trebleNodeRef.current);
      trebleNodeRef.current.connect(audioCtxRef.current.destination);
    } else {
      // Disable EQ (bypass)
      mediaSourceRef.current.disconnect();
      bassNodeRef.current.disconnect();
      trebleNodeRef.current.disconnect();

      mediaSourceRef.current.connect(audioCtxRef.current.destination);
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

  // ─── Stream Resolution ──────────────────────────────────────────────────
  const resolveStream = async (videoId: string): Promise<string> => {
    // 1. Check Offline Storage First (instant)
    if (typeof window !== "undefined") {
       try {
         const { getAudioBlob } = await import("@/offline/indexedDbCache");
         const blob = await getAudioBlob(videoId);
         if (blob) {
            console.log("[Player] Playing from offline storage.");
            return URL.createObjectURL(blob);
         }
       } catch(e) {
         console.warn("[Player] Failed to load offline storage:", e);
       }
    }

    // 2. Use /api/audio/[videoId] — a direct pipe endpoint.
    // Railway resolves + fetches the googlevideo URL server-side with the correct
    // youtubei.js session (matching IP + PO-Token). No IP mismatch, no URL expiry.
    return `/api/audio/${encodeURIComponent(videoId)}`;
  };

  const preloadNext = (currentId: string, queue: QueueSong[]) => {
    // Preloading disabled to save bandwidth
  };

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
        
        // 1. Check Offline cache
        let cachedBlob = await getAudioBlob(song.songId);
        
        if (cachedBlob) {
           console.log("[Player] Playing from offline storage.");
           setState((prev) => ({ ...prev, isBuffering: false, streamUrl: URL.createObjectURL(cachedBlob) }));
           player.src = URL.createObjectURL(cachedBlob);
           player.load();
           if (isPlayingRef.current) player.play().catch(console.error);
           return;
        }

        // 2. Online Streaming (Albumaty / YouTube Fallback)
        // We fetch the API to get the direct URL to avoid Service Worker crashes on 307 Redirects
        const qParams = new URLSearchParams({
          videoId: videoIdToPlay,
          title: song.title,
          artist: song.artist || "",
          q: (song as any).searchQuery || "",
          t: Date.now().toString()
        });
        const ytdownloadApiUrl = `/api/ytdownload?${qParams.toString()}`;
        
        try {
          const proxyRes = await fetch(ytdownloadApiUrl);
          const proxyData = await proxyRes.json();
          if (proxyData.url && !cancelled) {
            setState((prev) => ({ ...prev, isBuffering: false, streamUrl: proxyData.url }));
            player.src = proxyData.url;
            player.load();
            if (isPlayingRef.current) player.play().catch(console.error);
          } else {
            throw new Error(proxyData.error || "Failed to fetch stream");
          }
        } catch (err) {
          if (!cancelled) setState((prev) => ({ ...prev, isBuffering: false, error: "حدث خطأ أثناء تحميل الأغنية" }));
        }

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

    if (state.isPlaying) {
      player.play().catch(() => {
        setState((prev) => ({ ...prev, isPlaying: false }));
      });
    } else {
      player.pause();
    }
  }, [state.isPlaying, state.streamUrl]);

  const onTimeUpdate = () => {
    const player = audioRef.current;
    if (player) {
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
