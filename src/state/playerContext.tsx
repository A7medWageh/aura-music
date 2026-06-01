"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialPlayerState, PlayerState, QueueSong, RepeatMode } from "@/state/playerState";
import { getAudioBlob } from "@/offline/indexedDbCache";

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

  // ── In-process stream URL cache ───────────────────────────────────
  // Warm cache: fetch("/api/stream/VIDEO_ID") anywhere to speed up future plays
  const streamCacheRef = useRef<Map<string, string>>(new Map());

  // Piped: verified-working instances
  const PIPED_APIS = [
    "https://api.piped.private.coffee",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://piped-api.garudalinux.org",
    "https://api.piped.yt",
  ];

  // Invidious Proxy: KEY FIX for Vercel!
  const INVIDIOUS_PROXY_APIS = [
    "https://invidious.flokinet.to",
    "https://yt.artemislena.eu",
    "https://invidious.perennialte.ch",
    "https://invidious.projectsegfau.lt",
    "https://iv.ggtyler.dev",
    "https://invidious.privacydev.net",
  ];

  /**
   * Ultra-fast client-side stream resolver.
   * Races Piped + Cobalt + Invidious Proxy in parallel — fastest wins.
   * Falls back to /api/stream if all client-side fails.
   * Full songs only (duration >= 60s).
   */
  const resolveStream = async (videoId: string): Promise<string> => {
    // ── Piped (fastest — returns Piped CDN URLs, no googlevideo) ────────────
    const pipedPromise = new Promise<string>((resolve, reject) => {
      let settled = false;
      let failures = 0;
      const ctrl = new AbortController();
      const timer = setTimeout(() => { ctrl.abort(); reject(new Error("piped_timeout")); }, 5000);

      for (const api of PIPED_APIS) {
        fetch(`${api}/streams/${videoId}`, {
          signal: ctrl.signal,
          headers: { "Accept": "application/json" },
        })
          .then(async (res) => {
            if (!res.ok) throw new Error("bad_status");
            const data = await res.json();
            if (data.duration > 0 && data.duration < 60) throw new Error("short");
            const streams: any[] = data.audioStreams ?? [];
            // Only accept non-googlevideo URLs (Piped CDN)
            const best = streams
              .filter((s: any) => s.url && !s.url.includes("googlevideo.com"))
              .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
            if (!best?.url) throw new Error("no_direct_url");
            if (!settled) { settled = true; clearTimeout(timer); resolve(best.url); }
          })
          .catch(() => {
            failures++;
            if (failures === PIPED_APIS.length && !settled) {
              settled = true; clearTimeout(timer); reject(new Error("all_piped_failed"));
            }
          });
      }
    });


    // ── Invidious Proxy (THE KEY FIX — bypasses Vercel + googlevideo block) ──
    // Browser fetches from Invidious, Invidious proxies from googlevideo.
    // Invidious servers are NOT on Vercel so Google doesn't block them!
    const invidiousProxyPromise = new Promise<string>((resolve, reject) => {
      let settled = false;
      let failures = 0;
      const timer = setTimeout(() => reject(new Error("invidious_timeout")), 7000);

      for (const api of INVIDIOUS_PROXY_APIS) {
        fetch(`${api}/api/v1/videos/${videoId}?fields=adaptiveFormats,lengthSeconds`, {
          headers: { "Accept": "application/json" },
        })
          .then(async (res) => {
            if (!res.ok) throw new Error("bad_status");
            const data = await res.json();
            if (data.lengthSeconds > 0 && data.lengthSeconds < 60) throw new Error("short");
            const formats: any[] = data.adaptiveFormats ?? [];
            const best = formats
              .filter((f: any) => f.type?.includes("audio") && f.itag)
              .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
            if (!best?.itag) throw new Error("no_itag");
            // ✨ Magic: Invidious proxies googlevideo for us!
            const proxyUrl = `${api}/latest_version?id=${videoId}&itag=${best.itag}&local=true`;
            if (!settled) { settled = true; clearTimeout(timer); resolve(proxyUrl); }
          })
          .catch(() => {
            failures++;
            if (failures === INVIDIOUS_PROXY_APIS.length && !settled) {
              settled = true; clearTimeout(timer); reject(new Error("all_invidious_failed"));
            }
          });
      }
    });

    // ── Race them! ───────────────────────────────────────────────────────────
    try {
      console.log(`[Stream] Client-side racing for ${videoId}...`);
      const fastUrl = await Promise.any([pipedPromise, invidiousProxyPromise]);
      console.log(`[Stream] ✅ Client won: ${fastUrl.substring(0, 50)}...`);
      
      // Save to cache
      streamCacheRef.current.set(videoId, fastUrl);
      return fastUrl;
    } catch (e: any) {
      console.warn(`[Player] All client-side failed for ${videoId}, trying server...`);
      try {
        const res = await fetch(`/api/stream/${videoId}`, { signal: AbortSignal.timeout(20000) });
        if (res.ok) {
          const data = await res.json();
          if (data.streamUrl) return data.streamUrl;
        }
      } catch { /* server also failed */ }

      return `/api/download?videoId=${encodeURIComponent(videoId)}`;
    }
  };

  const preloadNext = (currentId: string, queue: QueueSong[]) => {
    const idx = queue.findIndex(s => s.songId === currentId);
    // Preload next 2 songs for zero-wait skip experience
    for (const offset of [1, 2]) {
      const nextSong = queue[idx + offset];
      if (nextSong?.youtubeVideoId && !streamCacheRef.current.has(nextSong.youtubeVideoId)) {
        // Fire and forget — warm the stream cache silently
        resolveStream(nextSong.youtubeVideoId).then(url => {
          if (!url.startsWith("/api/download")) {
            streamCacheRef.current.set(nextSong.youtubeVideoId, url);
          }
        }).catch(() => {});
      }
    }
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
        let directMp3UrlToPlay: string | null = null;
        
        // ⚡ Lazy YouTube Resolution if missing
        if (!videoIdToPlay) {
          try {
            const res = await fetch(`/api/resolve-youtube?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist || "")}`);
            const data = await res.json();
            if (data.success && !cancelled) {
              if (data.isDirectMp3 && data.streamUrl) {
                directMp3UrlToPlay = data.streamUrl;
              } else if (data.videoId) {
                videoIdToPlay = data.videoId;
                // Mutate queue to save the resolved ID
                setState(prev => ({
                  ...prev,
                  queue: prev.queue.map(s => s.songId === song.songId ? { ...s, youtubeVideoId: videoIdToPlay } : s)
                }));
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
        
        // 1. Offline cache first (instant)
        const cachedBlob = await getAudioBlob(song.songId);
        if (cachedBlob && !cancelled) {
          const blobUrl = URL.createObjectURL(cachedBlob);
          setState((prev) => ({ ...prev, streamUrl: blobUrl, isBuffering: false }));
          player.src = blobUrl;
          player.preload = "auto";
          player.load();
          if (isPlayingRef.current) player.play().catch(console.error);
          preloadNext(state.currentSongId!, state.queue);
          return;
        }

        // Play direct mp3 immediately if available
        if (directMp3UrlToPlay && !cancelled) {
          setState((prev) => ({ ...prev, streamUrl: directMp3UrlToPlay, error: null, isBuffering: false }));
          player.src = directMp3UrlToPlay;
          player.preload = "auto";
          player.load();
          if (isPlayingRef.current) player.play().catch(console.error);
          preloadNext(state.currentSongId!, state.queue);
          return;
        }

        if (!videoIdToPlay) return;

        // 2. Resolve stream URL — check in-memory cache first for instant play
        const cachedUrl = streamCacheRef.current.get(videoIdToPlay);

        if (cachedUrl && !cancelled) {
          // ⚡ Instant play from cache — no network round-trip
          setState((prev) => ({ ...prev, streamUrl: cachedUrl, error: null }));
          player.src = cachedUrl;
          player.preload = "auto";
          player.load();
          if (state.isPlaying) player.play().catch(console.error);
          preloadNext(state.currentSongId!, state.queue);
          return;
        }

        // No cache — resolve in background while setting a loading state
        const streamUrl = await resolveStream(videoIdToPlay);

        // Cache for instant future plays
        if (streamUrl && !streamUrl.startsWith("/api/download")) {
          streamCacheRef.current.set(videoIdToPlay, streamUrl);
        }

        if (!cancelled) {
          setState((prev) => ({ ...prev, streamUrl, error: null }));
          player.src = streamUrl;
          player.preload = "auto";
          player.load();
          if (state.isPlaying) player.play().catch(console.error);
          preloadNext(state.currentSongId!, state.queue);
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
    prewarm: (videoId: string) => {
      if (!videoId || streamCacheRef.current.has(videoId)) return;
      // Warm the cache silently — next time user plays it'll be instant
      resolveStream(videoId).then(url => {
        if (url && !url.startsWith("/api/download")) {
          streamCacheRef.current.set(videoId, url);
        }
      }).catch(() => {});
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

          // Simple retry logic: if it's a network error, try to reload once
          if (error?.code === 2 || error?.code === 4) {
             console.log("Attempting automatic player recover...");
             setTimeout(() => {
                if (audioRef.current && state.currentSongId) {
                   audioRef.current.load();
                   if (state.isPlaying) audioRef.current.play().catch(() => {});
                }
             }, 1000);
          }

          setState(prev => ({ ...prev, isBuffering: false, error: "فشل تشغيل الملف - جاري المحاولة..." }));
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
