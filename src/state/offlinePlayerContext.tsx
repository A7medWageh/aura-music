"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { initialPlayerState, PlayerState, QueueSong, RepeatMode } from "@/state/playerState";
import { getAudioBlob } from "@/offline/indexedDbCache";
import {
  holdAudioSessionOnPause,
  releaseAudioSession,
  primeSilentCarrier,
} from "@/services/offline/audioSessionKeepAlive";
import { getProxyUrl } from "@/utils/media";

// ── Accurate iOS Detection ──────────────────────────────────────────────
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

export type OfflinePlayerContextValue = {
  state: PlayerState;
  currentSong: QueueSong | null;
  hasActiveSong: boolean;
  setQueue: (songs: QueueSong[], startIndex?: number) => void;
  playSongList: (songs: QueueSong[], startIndex?: number) => void;
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
  soundPreset: "crystal" | "bass" | "vocal" | "spatial" | "concert" | "noise_cancel";
  setSoundPreset: (preset: "crystal" | "bass" | "vocal" | "spatial" | "concert" | "noise_cancel") => void;
  soundBoost: number;
  setSoundBoost: (boost: number) => void;
  is8dActive: boolean;
  setIs8dActive: (active: boolean) => void;
  test8dSound: () => void;
  getAnalyser: () => AnalyserNode | null;
  closePlayer: () => void;
  toggleMute: () => void;
  hasUserTriggeredPlay: boolean;
};

const OfflinePlayerContext = createContext<OfflinePlayerContextValue | null>(null);

export function OfflinePlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(initialPlayerState);
  const [hasUserTriggeredPlay, setHasUserTriggeredPlay] = useState(false);

  const [soundPreset, setSoundPreset] = useState<
    "crystal" | "bass" | "vocal" | "spatial" | "concert" | "noise_cancel"
  >("crystal");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const setIsPlaying = useCallback((p: boolean) => setState((prev) => ({ ...prev, isPlaying: p })), []);

  const currentBlobUrlRef = useRef<string | null>(null);
  const nextPreloadedRef = useRef<{ songId: string; url: string } | null>(null);

  // Web Audio Analyser (for non-iOS devices)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isWebAudioConnectedRef = useRef(false);

  const currentSong =
    state.queue.find((s) => s.songId === state.currentSongId) || null;

  const hasActiveSong = !!(currentSong && state.currentSongId);

  // ── Sync Position State with iOS MediaSession ─────────────────────────
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

  // ── Update Lock Screen MediaMetadata ──────────────────────────────────
  const updateMediaSession = useCallback((song: QueueSong | null) => {
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
        artist: song.artist || "Aura Offline",
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

  // ── Execute Track Playback from Blob ───────────────────────────────────
  const playTrackIndex = useCallback(
    async (idx: number, songsList?: QueueSong[]) => {
      const q = songsList || stateRef.current.queue;
      if (!q.length || idx < 0 || idx >= q.length) return;

      const song = q[idx];
      setHasUserTriggeredPlay(true);
      primeSilentCarrier();
      configureAudioSession();

      // Notify the entire app that offline player took over
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("aura-offline-player-started"));
      }

      const player = audioRef.current;
      if (!player) return;

      try {
        let streamUrl: string | null = null;

        // Check if already preloaded
        if (nextPreloadedRef.current && nextPreloadedRef.current.songId === song.songId) {
          streamUrl = nextPreloadedRef.current.url;
        } else {
          const blob = await getAudioBlob(song.songId);
          if (blob) {
            if (currentBlobUrlRef.current) {
              try { URL.revokeObjectURL(currentBlobUrlRef.current); } catch {}
            }
            streamUrl = URL.createObjectURL(blob);
            currentBlobUrlRef.current = streamUrl;
          }
        }

        if (!streamUrl) {
          console.warn("[OfflinePlayer] Audio blob not found for song:", song.songId);
          return;
        }

        player.muted = false;
        player.src = streamUrl;
        player.playbackRate = stateRef.current.speed;
        player.volume = stateRef.current.volume;

        releaseAudioSession();
        const p = player.play();
        if (p !== undefined) {
          p.then(() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
            if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "playing";
            }
            syncPositionState();
          }).catch((err) => {
            console.warn("[OfflinePlayer] Play rejected:", err);
          });
        }

        setState((prev) => ({
          ...prev,
          queue: q,
          currentSongId: song.songId,
          isPlaying: true,
          streamUrl,
          sourceType: "offline-blob",
          currentTime: 0,
          duration: 0,
          isBuffering: false,
          error: null,
        }));

        updateMediaSession(song);

        // Preload next track
        const nextIdx = (idx + 1) % q.length;
        const nextSong = q[nextIdx];
        if (nextSong && nextSong.songId !== song.songId) {
          getAudioBlob(nextSong.songId).then((nextBlob) => {
            if (nextBlob) {
              const nextUrl = URL.createObjectURL(nextBlob);
              nextPreloadedRef.current = { songId: nextSong.songId, url: nextUrl };
            }
          }).catch(() => {});
        }
      } catch (err) {
        console.error("[OfflinePlayer] playTrackIndex error:", err);
      }
    },
    [syncPositionState, updateMediaSession]
  );

  const next = useCallback(() => {
    const q = stateRef.current.queue;
    if (!q.length) return;
    const curIdx = q.findIndex((s) => s.songId === stateRef.current.currentSongId);

    if (stateRef.current.shuffle) {
      const rand = Math.floor(Math.random() * q.length);
      playTrackIndex(rand);
      return;
    }

    if (curIdx + 1 < q.length) {
      playTrackIndex(curIdx + 1);
    } else if (stateRef.current.repeat === "all") {
      playTrackIndex(0);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, [playTrackIndex]);

  const prev = useCallback(() => {
    const a = audioRef.current;
    if (a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    const q = stateRef.current.queue;
    if (!q.length) return;
    const curIdx = q.findIndex((s) => s.songId === stateRef.current.currentSongId);

    if (curIdx - 1 >= 0) {
      playTrackIndex(curIdx - 1);
    } else {
      playTrackIndex(q.length - 1);
    }
  }, [playTrackIndex]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;

    if (isPlayingRef.current) {
      a.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      holdAudioSessionOnPause();
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      syncPositionState();
    } else {
      releaseAudioSession();
      configureAudioSession();
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
        }).catch(console.warn);
      }
    }
  }, [syncPositionState]);

  const seekTo = useCallback(
    (time: number) => {
      const a = audioRef.current;
      if (a && !isNaN(time)) {
        a.currentTime = Math.max(0, Math.min(time, a.duration || 9999));
        setState((prev) => ({ ...prev, currentTime: a.currentTime }));
        syncPositionState();
      }
    },
    [syncPositionState]
  );

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setState((prev) => ({ ...prev, volume: clamped }));
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const toggleMute = useCallback(() => {
    if (stateRef.current.volume > 0) {
      setVolume(0);
    } else {
      setVolume(0.8);
    }
  }, [setVolume]);

  const setSpeed = useCallback((val: number) => {
    setState((prev) => ({ ...prev, speed: val }));
    if (audioRef.current) audioRef.current.playbackRate = val;
  }, []);

  const cycleRepeat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      repeat: prev.repeat === "off" ? "all" : prev.repeat === "all" ? "one" : "off",
    }));
  }, []);

  const setShuffle = useCallback((val: boolean) => {
    setState((prev) => ({ ...prev, shuffle: val }));
  }, []);

  const playSongList = useCallback(
    (songs: QueueSong[], startIndex = 0) => {
      if (!songs || !songs.length) return;
      playTrackIndex(startIndex, songs);
    },
    [playTrackIndex]
  );

  const playNow = useCallback(
    (song: QueueSong) => {
      const q = stateRef.current.queue;
      const existing = q.findIndex((s) => s.songId === song.songId);
      if (existing !== -1) {
        playTrackIndex(existing);
      } else {
        const nextQ = [song, ...q];
        playTrackIndex(0, nextQ);
      }
    },
    [playTrackIndex]
  );

  const playSongById = useCallback(
    (songId: string) => {
      const q = stateRef.current.queue;
      const idx = q.findIndex((s) => s.songId === songId);
      if (idx !== -1) playTrackIndex(idx);
    },
    [playTrackIndex]
  );

  const setQueue = useCallback(
    (songs: QueueSong[], startIndex = 0) => {
      playSongList(songs, startIndex);
    },
    [playSongList]
  );

  const enqueueSongs = useCallback((songs: QueueSong[]) => {
    setState((prev) => ({ ...prev, queue: [...prev.queue, ...songs] }));
  }, []);

  const closePlayer = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    setHasUserTriggeredPlay(false);
    setState(initialPlayerState);
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
      navigator.mediaSession.metadata = null;
    }
  }, []);

  // ── Synchronous MediaSession Action Handlers for iPhone Lock Screen ───
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      releaseAudioSession();
      configureAudioSession();
      const a = audioRef.current;
      if (a) {
        a.muted = false;
        a.play()
          .then(() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
            if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "playing";
            }
            syncPositionState();
          })
          .catch(console.warn);
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

    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) seekTo(d.seekTime);
    });

    navigator.mediaSession.setActionHandler("seekbackward", (d) => {
      const a = audioRef.current;
      if (a) seekTo(a.currentTime - (d.seekOffset || 10));
    });

    navigator.mediaSession.setActionHandler("seekforward", (d) => {
      const a = audioRef.current;
      if (a) seekTo(a.currentTime + (d.seekOffset || 10));
    });
  }, [next, prev, seekTo, syncPositionState]);

  // ── iPhone Lock Screen / Unlock Resume Guard ──────────────────────────
  useEffect(() => {
    if (typeof document === "undefined") return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const a = audioRef.current;
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

  // ── Mutual Exclusion: When Online Player Starts, Close Offline Player ─
  useEffect(() => {
    const handleOnlineStarted = () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
      setIsPlaying(false);
      isPlayingRef.current = false;
      setHasUserTriggeredPlay(false);
      setState(initialPlayerState);
    };

    window.addEventListener("aura-online-player-started", handleOnlineStarted);
    return () => window.removeEventListener("aura-online-player-started", handleOnlineStarted);
  }, []);

  // ── HTML5 Audio Events ───────────────────────────────────────────────
  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (a) {
      setState((prev) => ({ ...prev, currentTime: a.currentTime }));
    }
  };

  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (a) {
      setState((prev) => ({ ...prev, duration: a.duration || 0 }));
      syncPositionState();
    }
  };

  const onEnded = () => {
    if (stateRef.current.repeat === "one") {
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
    state,
    currentSong,
    hasActiveSong,
    setQueue,
    playSongList,
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
    prewarm: () => {},
    setHighQuality: () => {},
    setIsAiMix: () => {},
    soundPreset,
    setSoundPreset,
    soundBoost: state.soundBoost,
    setSoundBoost: (b: number) => setState((prev) => ({ ...prev, soundBoost: b })),
    is8dActive: state.is8dActive,
    setIs8dActive: (a: boolean) => setState((prev) => ({ ...prev, is8dActive: a })),
    test8dSound: () => {},
    getAnalyser: () => analyserRef.current,
    closePlayer,
    toggleMute,
    hasUserTriggeredPlay,
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
        onWaiting={() => setState((prev) => ({ ...prev, isBuffering: true }))}
        onPlaying={() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
          setState((prev) => ({ ...prev, isBuffering: false, isPlaying: true }));
        }}
        onCanPlay={() => setState((prev) => ({ ...prev, isBuffering: false }))}
        onPause={() => {
          setIsPlaying(false);
          isPlayingRef.current = false;
          setState((prev) => ({ ...prev, isPlaying: false }));
        }}
      />
    </OfflinePlayerContext.Provider>
  );
}

export function useOfflinePlayer() {
  const context = useContext(OfflinePlayerContext);
  if (!context) {
    throw new Error("useOfflinePlayer must be used inside OfflinePlayerProvider");
  }
  return context;
}
