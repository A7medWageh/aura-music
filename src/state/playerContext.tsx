"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialPlayerState, PlayerState, QueueSong, RepeatMode } from "@/state/playerState";
import { getAudioBlob, getOfflineSongMeta, deleteAudioBlobOnly, isKhaleejiOrCorruptedJannatBlob, autoPurgeCorruptedJannatBlobs } from "@/offline/indexedDbCache";
import { JANNAT_OLD_CLASSICS } from "@/data/jannatClassics";
import { ANGHAM_OLD_CLASSICS } from "@/data/anghamClassics";
import { downloadSong } from "@/services/offline/downloader";
import { setMainAudioPlaying } from "@/services/offline/backgroundKeepAlive";
import { holdAudioSessionOnPause, releaseAudioSession, primeSilentCarrier } from "@/services/offline/audioSessionKeepAlive";
import { useToastStore } from "@/state/toastStore";
import { toAbsoluteApiUrl } from "@/utils/apiBase";
import {
  recordAudioDiagnosticEvent,
  registerAudioDiagnosticsSource,
  AudioSourceType
} from "@/utils/audioDiagnostics";

// ── Accurate iOS Detection (iPhone, iPad, iPod, WKWebView) ──
const isIOSDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    (/WebKit/i.test(navigator.userAgent) && /Mobile/i.test(navigator.userAgent))
  );
};

// ── Accurate Mobile Detection (iOS, Android, Mobile WebViews) ──
const isMobileDevice = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    isIOSDevice() ||
    /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches && (navigator.maxTouchPoints || 0) > 0)
  );
};

// ── Ensure iOS Safari Audio Session Category is "playback" ──
// By default, iOS Safari treats web audio as "ambient", silencing audio upon screen lock
// or when the hardware silent switch is engaged. Setting type="playback" requests
// AVAudioSessionCategoryPlayback, ensuring non-stop audio in earphones & lock screen.
const configureAudioSession = () => {
  if (typeof navigator !== "undefined" && "audioSession" in navigator) {
    try {
      (navigator as any).audioSession.type = "playback";
    } catch {}
  }
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

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState>(initialPlayerState);
  const [hasUserTriggeredPlay, setHasUserTriggeredPlay] = useState(false);

  // Restore saved player session on client mount only (guarantees SSR hydration consistency)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aura-player-session");
      if (saved) {
        const parsed = JSON.parse(saved);
        const hasMowgou3 = parsed.queue?.some((s: any) => s.title && s.title.includes("موجوع"));
        if (hasMowgou3) {
          localStorage.removeItem("aura-player-session");
          localStorage.removeItem("aura-player-state");
        } else if (parsed.queue && parsed.queue.length > 0 && parsed.currentSongId) {
          setHasUserTriggeredPlay(true);
          setState((prev) => ({
            ...prev,
            queue: parsed.queue,
            currentSongId: parsed.currentSongId,
            currentTime: parsed.currentTime || 0,
            volume: parsed.volume ?? initialPlayerState.volume,
            isPlaying: !!parsed.wasPlaying,
          }));
        }
      }
    } catch {}
  }, []);

  // Ensure audio session category on mount
  useEffect(() => {
    configureAudioSession();
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
  // ── Source-Aware Offline State & Blob URL Lifecycle (Solutions A, B, F) ──
  const activeBlobUrlRef = useRef<string | null>(null);
  const activeBlobRef = useRef<Blob | null>(null);
  const activeOfflineSongIdRef = useRef<string | null>(null);
  const currentSourceTypeRef = useRef<AudioSourceType>(null);
  const isRecoveringRef = useRef(false);
  const recoveryAttemptCountRef = useRef(0);

  // Backward compatibility alias for currentBlobUrlRef
  const currentBlobUrlRef = activeBlobUrlRef;

  const nextRef = useRef<() => void>(() => {});
  const prevRef = useRef<() => void>(() => {});

  const setActiveBlobSource = (songId: string, blob: Blob): string => {
    // If we already have a valid active URL for this exact same blob, reuse it
    if (
      activeOfflineSongIdRef.current === songId &&
      activeBlobRef.current === blob &&
      activeBlobUrlRef.current
    ) {
      currentSourceTypeRef.current = "offline-blob";
      return activeBlobUrlRef.current;
    }

    const oldUrl = activeBlobUrlRef.current;
    const newUrl = URL.createObjectURL(blob);

    activeBlobRef.current = blob;
    activeOfflineSongIdRef.current = songId;
    activeBlobUrlRef.current = newUrl;
    currentSourceTypeRef.current = "offline-blob";

    recordAudioDiagnosticEvent("setActiveBlobSource", {
      songId,
      blobSize: blob.size,
      mimeType: blob.type,
      newUrl,
    });

    if (oldUrl && oldUrl !== newUrl) {
      setTimeout(() => {
        try {
          if (audioRef.current?.src !== oldUrl) {
            URL.revokeObjectURL(oldUrl);
          }
        } catch {}
      }, 3000);
    }

    return newUrl;
  };

  const clearActiveBlobSource = () => {
    const oldUrl = activeBlobUrlRef.current;
    activeBlobRef.current = null;
    activeOfflineSongIdRef.current = null;
    activeBlobUrlRef.current = null;
    currentSourceTypeRef.current = "remote-url";

    recordAudioDiagnosticEvent("clearActiveBlobSource");

    if (oldUrl) {
      setTimeout(() => {
        try {
          if (audioRef.current?.src !== oldUrl) {
            URL.revokeObjectURL(oldUrl);
          }
        } catch {}
      }, 3000);
    }
  };


  const currentSong = useMemo(
    () => state.queue.find((song) => song.songId === state.currentSongId) ?? null,
    [state.currentSongId, state.queue]
  );

  // ── Complete iPhone Lock Screen & MediaSession Engine ──
  const updateMediaSessionMetadata = (song: QueueSong | null) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !song) return;

    let artUrl = (song as any).originalThumbnailUrl || (song.metadata as any)?.originalThumbnailUrl || song.thumbnailUrl || song.metadata?.thumbnailUrl;

    // Check classic catalogs (Angham & Jannat) for verified high-res HTTPS artwork
    let jannatClassic: any = null;
    const anghamClassic = ANGHAM_OLD_CLASSICS.find(
      (c) => c.songId === song.songId || c.youtubeVideoId === song.youtubeVideoId || c.title === song.title
    );
    if (anghamClassic?.thumbnailUrl) {
      artUrl = anghamClassic.thumbnailUrl;
    } else {
      jannatClassic = JANNAT_OLD_CLASSICS.find(
        (c) => c.songId === song.songId || c.youtubeVideoId === song.youtubeVideoId || c.title === song.title
      );
      if (jannatClassic?.thumbnailUrl) {
        artUrl = jannatClassic.thumbnailUrl;
      }
    }

    const albumName = anghamClassic?.album || jannatClassic?.album || song.albumName || song.folderName || (song.metadata?.album) || "Aura Music";
    const songArtist = anghamClassic ? "أنغام" : jannatClassic ? "جنات" : (song.artist || "فنان");

    // Route artwork through our dedicated high-res proxy (/api/artwork)
    // iOS NowPlaying requires absolute HTTPS URLs serving image/jpeg or image/png with CORS headers
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://aura-music.vercel.app";
    const p = new URLSearchParams();
    if (artUrl && !artUrl.startsWith("blob:") && !artUrl.startsWith("data:")) {
      p.set("url", artUrl);
    }
    p.set("songId", song.songId || song.youtubeVideoId || "");
    p.set("title", song.title || "");
    if (songArtist) p.set("artist", songArtist);

    const fullArtworkUrl = `${baseUrl}/api/artwork?${p.toString()}`;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || "أغنية",
        artist: songArtist,
        album: albumName,
        artwork: [
          { src: fullArtworkUrl, sizes: "96x96", type: "image/jpeg" },
          { src: fullArtworkUrl, sizes: "128x128", type: "image/jpeg" },
          { src: fullArtworkUrl, sizes: "192x192", type: "image/jpeg" },
          { src: fullArtworkUrl, sizes: "256x256", type: "image/jpeg" },
          { src: fullArtworkUrl, sizes: "384x384", type: "image/jpeg" },
          { src: fullArtworkUrl, sizes: "512x512", type: "image/jpeg" },
          { src: fullArtworkUrl, sizes: "1024x1024", type: "image/jpeg" },
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

  // Register developer diagnostics provider for runtime console debugging
  useEffect(() => {
    registerAudioDiagnosticsSource(
      () => audioRef.current,
      () => {
        const curSong = stateRef.current.queue.find((s) => s.songId === stateRef.current.currentSongId);
        return {
          songId: stateRef.current.currentSongId,
          songTitle: curSong?.title || null,
          sourceType: currentSourceTypeRef.current,
          recoveryAttempts: recoveryAttemptCountRef.current,
        };
      }
    );
  }, []);

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
            volume: state.volume,
            wasPlaying: state.isPlaying,
          })
        );
        localStorage.setItem("aura-player-state", JSON.stringify({ queue: state.queue }));
      } catch { /* ignore */ }
    }
  }, [state.queue, state.currentSongId, state.volume, state.isPlaying]);

  // Synchronously prime the audio element inside user gestures for iOS WebKit
  const primeAudioElement = () => {
    configureAudioSession();
    const player = audioRef.current;
    if (!player) return;
    try {
      player.muted = false;
      const p = player.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    } catch {}
  };

  // ── Centralized Playback & Recovery Engine (Solutions A, C, D, F, G) ──
  const executePlayOrRecover = async (trigger: string): Promise<boolean> => {
    const player = audioRef.current;
    if (!player) return false;

    const currentSong = stateRef.current.queue.find((s) => s.songId === stateRef.current.currentSongId);
    if (!currentSong) return false;

    if (isRecoveringRef.current) {
      recordAudioDiagnosticEvent("executePlayOrRecover: skipped (concurrent recovery in progress)", { trigger });
      return false;
    }

    isRecoveringRef.current = true;
    recordAudioDiagnosticEvent("executePlayOrRecover: initiated", {
      trigger,
      songId: currentSong.songId,
      sourceType: currentSourceTypeRef.current,
      readyState: player.readyState,
      paused: player.paused,
      currentTime: player.currentTime,
    });

    try {
      releaseAudioSession();
      configureAudioSession();
      player.muted = false;
      setHasUserTriggeredPlay(true);

      const isOffline =
        currentSourceTypeRef.current === "offline-blob" ||
        currentSong.audioReady === true ||
        (activeOfflineSongIdRef.current === currentSong.songId && !!activeBlobRef.current) ||
        (player.src && player.src.startsWith("blob:")) ||
        (typeof navigator !== "undefined" && !navigator.onLine);

      // ─────────────────────────────────────────────────────────────
      // 1. OFFLINE PLAYBACK PATH (Airplane Mode safe, 0 network calls)
      // ─────────────────────────────────────────────────────────────
      if (isOffline) {
        currentSourceTypeRef.current = "offline-blob";
        let targetBlobUrl = activeBlobUrlRef.current;

        const needsSourceAssignment =
          !targetBlobUrl ||
          !player.src ||
          player.src === "" ||
          player.src === window.location.href ||
          !player.src.startsWith("blob:") ||
          player.src !== targetBlobUrl;

        if (!targetBlobUrl) {
          recordAudioDiagnosticEvent("Retrieving offline blob from IndexedDB", { songId: currentSong.songId });
          let blob = activeBlobRef.current;
          if (!blob || activeOfflineSongIdRef.current !== currentSong.songId) {
            blob = await getAudioBlob(currentSong.songId);
            if (!blob && currentSong.youtubeVideoId && currentSong.youtubeVideoId !== currentSong.songId) {
              blob = await getAudioBlob(currentSong.youtubeVideoId);
            }
          }

          if (blob) {
            targetBlobUrl = setActiveBlobSource(currentSong.songId, blob);
          } else {
            recordAudioDiagnosticEvent("ERROR: Offline audio blob not found in IndexedDB", { songId: currentSong.songId });
            setState((prev) => ({
              ...prev,
              isPlaying: false,
              isBuffering: false,
              error: "الملف الصوتي لهذه الأغنية غير متوفر محلياً في ذاكرة الأوفلاين.",
            }));
            return false;
          }
        }

        if (needsSourceAssignment && targetBlobUrl) {
          const savedTime = stateRef.current.currentTime || player.currentTime || 0;
          player.src = targetBlobUrl;
          player.preload = "auto";
          if (savedTime > 0) {
            try { player.currentTime = savedTime; } catch {}
          }
        }

        if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }

        try {
          await player.play();
          recordAudioDiagnosticEvent("Offline play() succeeded", {
            currentTime: player.currentTime,
            duration: player.duration,
          });
          recoveryAttemptCountRef.current = 0;
          setState((prev) => ({
            ...prev,
            isPlaying: true,
            isBuffering: false,
            error: null,
            sourceType: "offline-blob",
            streamUrl: targetBlobUrl,
          }));
          syncPositionState();
          return true;
        } catch (playErr: any) {
          recordAudioDiagnosticEvent("Offline play() rejected on initial attempt", {
            name: playErr?.name,
            message: playErr?.message,
            attempts: recoveryAttemptCountRef.current,
          });

          if (playErr?.name === "AbortError") {
            return false;
          }

          // Bounded local recovery: on iOS, WebKit's blob pipeline in background sometimes requires
          // a freshly generated blob URL to re-bind the AVAssetResourceLoader
          if (recoveryAttemptCountRef.current < 1) {
            recoveryAttemptCountRef.current++;
            recordAudioDiagnosticEvent("Rejuvenating offline blob URL for background resume", {
              attempt: recoveryAttemptCountRef.current,
            });

            let freshBlob = activeBlobRef.current;
            if (!freshBlob) {
              freshBlob = await getAudioBlob(currentSong.songId);
              if (!freshBlob && currentSong.youtubeVideoId) {
                freshBlob = await getAudioBlob(currentSong.youtubeVideoId);
              }
            }

            if (freshBlob) {
              const freshUrl = URL.createObjectURL(freshBlob);
              activeBlobRef.current = freshBlob;
              activeOfflineSongIdRef.current = currentSong.songId;
              activeBlobUrlRef.current = freshUrl;
              currentSourceTypeRef.current = "offline-blob";

              const savedTime = stateRef.current.currentTime || player.currentTime || 0;
              player.src = freshUrl;
              player.preload = "auto";
              if (savedTime > 0) {
                try { player.currentTime = savedTime; } catch {}
              }

              try {
                await player.play();
                recordAudioDiagnosticEvent("Rejuvenated offline blob play() succeeded");
                recoveryAttemptCountRef.current = 0;
                setState((prev) => ({
                  ...prev,
                  isPlaying: true,
                  isBuffering: false,
                  error: null,
                  sourceType: "offline-blob",
                  streamUrl: freshUrl,
                }));
                syncPositionState();
                return true;
              } catch (retryErr: any) {
                recordAudioDiagnosticEvent("Rejuvenated offline blob play() failed", {
                  error: retryErr?.message,
                });
              }
            }
          }

          // CRITICAL: NEVER switch to online streaming when offline!
          setState((prev) => ({
            ...prev,
            isPlaying: false,
            isBuffering: false,
            error: "تعذر استئناف الأغنية أوفلاين أثناء قفل الشاشة. يرجى الضغط مرة أخرى أو فتح الموقع.",
          }));
          if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
          return false;
        }
      }

      // ─────────────────────────────────────────────────────────────
      // 2. ONLINE PLAYBACK PATH
      // ─────────────────────────────────────────────────────────────
      recordAudioDiagnosticEvent("Online playback resume", { songId: currentSong.songId });
      currentSourceTypeRef.current = "remote-url";

      if ((!player.src || player.src === "" || player.src === window.location.href) && currentSong) {
        syncPlayTrack(currentSong);
        return true;
      }

      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }

      try {
        await player.play();
        recordAudioDiagnosticEvent("Online play() succeeded");
        setState((prev) => ({ ...prev, isPlaying: true, isBuffering: false, error: null, sourceType: "remote-url" }));
        syncPositionState();
        return true;
      } catch (err: any) {
        recordAudioDiagnosticEvent("Online play() rejected", { error: err?.message, name: err?.name });
        if (err?.name !== "AbortError") {
          syncPlayTrack(currentSong);
        }
        return false;
      }
    } finally {
      isRecoveringRef.current = false;
    }
  };

  // Synchronous fast-track starter: plays immediately inside user/handsfree gestures
  const syncPlayTrack = (song: QueueSong) => {
    const player = audioRef.current;
    if (!player) return;

    primeSilentCarrier();
    configureAudioSession();
    player.muted = false;

    setHasUserTriggeredPlay(true);
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
      const isBlob = nextPreloadedRef.current.isBlob;
      player.muted = false;
      player.src = pUrl;
      player.preload = "auto";
      if (isBlob) {
        activeBlobUrlRef.current = pUrl;
        activeOfflineSongIdRef.current = song.songId;
        currentSourceTypeRef.current = "offline-blob";
      } else {
        clearActiveBlobSource();
      }
      player.play().catch((err) => {
        if (err.name !== "AbortError") console.warn("[LockScreen] Preload play error:", err);
      });
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
          sourceType: isBlob ? "offline-blob" : "remote-url",
          currentTime: 0,
          duration: 0,
          isBuffering: false,
          error: null,
        };
      });
      return;
    }

    // 2. Check if we already have the active blob URL for this track in memory
    if (activeOfflineSongIdRef.current === song.songId && activeBlobUrlRef.current && activeBlobRef.current) {
      const blobUrl = activeBlobUrlRef.current;
      player.muted = false;
      player.src = blobUrl;
      player.preload = "auto";
      player.play().catch((err) => {
        if (err.name !== "AbortError") console.warn("[Player] Cached blob play error:", err);
      });
      setState((prev) => {
        const exists = prev.queue.some((item) => item.songId === song.songId);
        const nextQueue = exists ? prev.queue : [song, ...prev.queue];
        return {
          ...prev,
          queue: nextQueue,
          currentSongId: song.songId,
          isPlaying: true,
          streamUrl: blobUrl,
          sourceType: "offline-blob",
          currentTime: 0,
          duration: 0,
          isBuffering: false,
          error: null,
        };
      });
      return;
    }

    // 3. Check if this song is an offline track (either marked audioReady or offline mode)
    const isDefinitelyOffline =
      song.audioReady === true ||
      (typeof navigator !== "undefined" && !navigator.onLine);

    if (isDefinitelyOffline) {
      // OFFLINE-ONLY PATH: Never touch directStreamUrl or network!
      currentSourceTypeRef.current = "offline-blob";
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

        if (stateRef.current.currentSongId !== song.songId) return;

        if (b) {
          const blobUrl = setActiveBlobSource(song.songId, b);
          player.muted = false;
          player.src = blobUrl;
          player.preload = "auto";
          player.play().catch((err) => {
            if (err.name !== "AbortError") console.warn("[Player] Offline blob play error:", err);
          });
          setState((prev) => {
            const exists = prev.queue.some((item) => item.songId === song.songId);
            const nextQueue = exists ? prev.queue : [song, ...prev.queue];
            return {
              ...prev,
              queue: nextQueue,
              currentSongId: song.songId,
              isPlaying: true,
              streamUrl: blobUrl,
              sourceType: "offline-blob",
              currentTime: 0,
              duration: 0,
              isBuffering: false,
              error: null,
            };
          });
        } else {
          recordAudioDiagnosticEvent("ERROR: Offline audio track missing from IndexedDB", { songId: song.songId });
          setState((prev) => ({
            ...prev,
            isPlaying: false,
            isBuffering: false,
            error: "هذه الأغنية غير متوفرة في ذاكرة هاتفك الأوفلاين — يرجى الاتصال بالإنترنت أولاً لتنزيلها",
          }));
        }
      }).catch(() => {
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          isBuffering: false,
          error: "فشل استرجاع الأغنية من ذاكرة الهاتف الأوفلاين.",
        }));
      });

      setState((prev) => {
        const exists = prev.queue.some((item) => item.songId === song.songId);
        const nextQueue = exists ? prev.queue : [song, ...prev.queue];
        return {
          ...prev,
          queue: nextQueue,
          currentSongId: song.songId,
          isPlaying: true,
          streamUrl: null,
          sourceType: "offline-blob",
          currentTime: 0,
          duration: 0,
          isBuffering: true,
          error: null,
        };
      });
      return;
    }

    // 4. ONLINE PATH: Check offline cache first, but stream online if not found
    const targetVid = song.youtubeVideoId || song.songId || "";
    const directStreamUrl = toAbsoluteApiUrl(
      `/api/ytdownload?videoId=${encodeURIComponent(targetVid)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist || "")}&proxy=true`
    );

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

      if (stateRef.current.currentSongId !== song.songId) return;

      if (b) {
        const blobUrl = setActiveBlobSource(song.songId, b);
        player.muted = false;
        player.src = blobUrl;
        player.preload = "auto";
        player.play().catch((err) => {
          if (err.name !== "AbortError") console.warn("[Player] Offline blob play error:", err);
        });
        setState((prev) => {
          const exists = prev.queue.some((item) => item.songId === song.songId);
          const nextQueue = exists ? prev.queue : [song, ...prev.queue];
          return {
            ...prev,
            queue: nextQueue,
            currentSongId: song.songId,
            isPlaying: true,
            streamUrl: blobUrl,
            sourceType: "offline-blob",
            currentTime: 0,
            duration: 0,
            isBuffering: false,
            error: null,
          };
        });
      }
    }).catch(() => {});

    // Start stream URL immediately for online tracks
    clearActiveBlobSource();
    player.muted = false;
    player.src = directStreamUrl;
    player.preload = "auto";
    const p = player.play();
    if (p !== undefined) {
      p.catch((err) => {
        if (err.name !== "AbortError") console.warn("[Player] Direct play deferred:", err);
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
        sourceType: "remote-url",
        currentTime: 0,
        duration: 0,
        isBuffering: true,
        error: null,
      };
    });
  };


  const setQueue = (songs: QueueSong[], startIndex = 0) => {
    const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
    const targetSong = songs[idx];
    if (targetSong) {
      setHasUserTriggeredPlay(true);
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
    primeSilentCarrier();
    configureAudioSession();
    const player = audioRef.current;
    if (player) {
      if (state.isPlaying) {
        player.pause();
        isPlayingRef.current = false;
        holdAudioSessionOnPause();
        setState((prev) => ({ ...prev, isPlaying: false }));
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
        syncPositionState();
      } else {
        releaseAudioSession();
        const isMobile = isMobileDevice();
        if (!isMobile && !audioCtxRef.current) {
          initWebAudio();
        } else if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
          audioCtxRef.current.resume().catch(() => {});
        }

        // Fast synchronous resume inside user gesture tick
        if (player.src && player.src !== "" && player.src !== window.location.href) {
          player.muted = false;
          try {
            const playPromise = player.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
                    navigator.mediaSession.playbackState = "playing";
                  }
                  isPlayingRef.current = true;
                  setState((prev) => ({ ...prev, isPlaying: true, isBuffering: false, error: null }));
                  syncPositionState();
                })
                .catch(() => {
                  executePlayOrRecover("togglePlay-fallback");
                });
              return;
            }
          } catch {}
        }

        executePlayOrRecover("togglePlay");
      }
    } else {
      setHasUserTriggeredPlay(true);
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
    const maxDur = (player.duration && !isNaN(player.duration) && player.duration > 0)
      ? player.duration
      : (stateRef.current.duration > 0 ? stateRef.current.duration : Infinity);
    const clampedTime = Math.max(0, Math.min(time, maxDur));
    try {
      player.currentTime = clampedTime;
    } catch {}
    setState((prev) => ({ ...prev, currentTime: clampedTime }));
    if (stateRef.current.isPlaying && player.paused) {
      player.play().catch(() => {});
    }
    syncPositionState();
  };

  const [soundPreset, setSoundPresetState] = useState<"crystal" | "bass" | "vocal" | "spatial" | "concert" | "noise_cancel">("crystal");

  const setSoundPreset = (preset: "crystal" | "bass" | "vocal" | "spatial" | "concert" | "noise_cancel") => {
    try {
      localStorage.setItem("aura_sound_preset", preset);
    } catch {}
    setSoundPresetState(preset);
  };

  const setSoundBoost = (boost: number) => {
    const val = Math.max(1.0, Math.min(2.0, boost));
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
      if (savedPreset && ["crystal", "bass", "vocal", "spatial", "concert", "noise_cancel"].includes(savedPreset)) {
        setSoundPresetState(savedPreset);
      }
      const savedBoost = localStorage.getItem("aura_sound_boost");
      if (savedBoost) {
        const parsed = parseFloat(savedBoost);
        if (!isNaN(parsed) && parsed >= 1.0) {
          setState((prev) => ({ ...prev, soundBoost: Math.min(2.0, parsed) }));
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
  const depthFilterRef = useRef<BiquadFilterNode | null>(null); // HRTF 3D head-shadow filter
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

  // Real-time 8D audio rotation: rotates sound smoothly and noticeably between left and right earbuds
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
      try {
        panner.pan.setTargetAtTime(0, ctx.currentTime, 0.05);
        if (depthFilterRef.current) depthFilterRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      } catch {}
      return;
    }

    // 5.5 seconds for a dynamic, rhythmic, highly noticeable 8D orbit between earbuds
    const cycleDuration = 5500;
    const tick = () => {
      const shouldStillRotate = (soundPresetRef.current === "spatial" || is8dActiveRef.current) && isPlayingRef.current;
      if (!shouldStillRotate) {
        try {
          panner.pan.setTargetAtTime(0, ctx.currentTime, 0.05);
          if (depthFilterRef.current) depthFilterRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        } catch {}
        return;
      }
      const now = performance.now();
      const progress = (now % cycleDuration) / cycleDuration;
      const angle = progress * 2 * Math.PI;

      // High-impact panning: sweeps between Left (-0.98) and Right (+0.98)
      const pan = Math.sin(angle) * 0.98;

      // HRTF 3D head-shadow: when sound orbits behind the head (cos < 0), dip 3.8kHz to simulate sound passing behind
      const depth = Math.cos(angle);
      const rearDip = depth < 0 ? depth * 4.0 : 0; // dips up to -4dB behind the head

      try {
        panner.pan.setTargetAtTime(pan, ctx.currentTime, 0.04);
        if (depthFilterRef.current) {
          depthFilterRef.current.gain.setTargetAtTime(rearDip, ctx.currentTime, 0.04);
        }
      } catch {}
      pannerAnimRef.current = requestAnimationFrame(tick);
    };
    pannerAnimRef.current = requestAnimationFrame(tick);
  };

  // Instant 8D Earbud Test: sweeps hard Left, then hard Right, then returns to Center
  const test8dSound = () => {
    if (isMobileDevice()) {
      useToastStore.getState().addToast("لتجنب انقطاع الصوت عند قفل الهاتف، يعمل الصوت النقي المباشر على الموبايل 🎧");
      return;
    }
    let ctx = audioCtxRef.current;
    if (!ctx) {
      initWebAudio();
      ctx = audioCtxRef.current;
    }
    const panner = pannerRef.current;
    if (!panner || !ctx) {
      useToastStore.getState().addToast("يرجى تشغيل أي أغنية أولاً لبدء اختبار تقليب السماعات 🎧");
      return;
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (pannerAnimRef.current) {
      cancelAnimationFrame(pannerAnimRef.current);
      pannerAnimRef.current = null;
    }

    const t = ctx.currentTime;
    try {
      // Step 1: Pan hard Left immediately
      panner.pan.cancelScheduledValues(t);
      panner.pan.setValueAtTime(0, t);
      panner.pan.linearRampToValueAtTime(-0.98, t + 0.35);
      useToastStore.getState().addToast("🎧 جاري الاختبار: السماعة اليسرى فقط ◀️");

      // Step 2: Pan hard Right after 1.6s
      setTimeout(() => {
        if (!audioCtxRef.current || !pannerRef.current) return;
        const now = audioCtxRef.current.currentTime;
        pannerRef.current.pan.linearRampToValueAtTime(0.98, now + 0.85);
        useToastStore.getState().addToast("🎧 جاري الاختبار: السماعة اليمنى فقط ▶️");
      }, 1600);

      // Step 3: Return to Center and resume 8D rotation after 3.3s
      setTimeout(() => {
        if (!audioCtxRef.current || !pannerRef.current) return;
        const now = audioCtxRef.current.currentTime;
        pannerRef.current.pan.linearRampToValueAtTime(0, now + 0.6);
        useToastStore.getState().addToast("✅ تم اكتمال الاختبار بنجاح - كلا السماعتين تعملان بتناغم!");
        setTimeout(() => {
          update8dRotation();
        }, 700);
      }, 3300);
    } catch (err) {
      console.warn("[8D Test] error:", err);
    }
  };

  const PRESET_CONFIGS = {
    crystal: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 55, gain: 4.0 },            // Tight sub-bass punch
        { type: "peaking"  as BiquadFilterType, freq: 200, gain: 1.5, Q: 0.9 },   // Warm acoustic body
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -3.5, Q: 1.4 },  // Anti-mud transparency scoop
        { type: "peaking"  as BiquadFilterType, freq: 2800, gain: 4.5, Q: 0.9 },  // Sparkling crystal vocal clarity
        { type: "highshelf" as BiquadFilterType, freq: 11500, gain: 5.5 },        // Silky audiophile shimmer (Spotify Hi-Fi style)
      ],
      comp: { threshold: -14, ratio: 2.5, attack: 0.015, release: 0.15 },
      postGain: 1.25,
    },
    bass: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 50, gain: 9.5 },            // Massive, deep, chest-thumping sub-bass
        { type: "peaking"  as BiquadFilterType, freq: 110, gain: 4.5, Q: 1.1 },   // Explosive bass punch (Beats & Sony Extra Bass)
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -3.0, Q: 1.2 },  // Anti-mud scoop
        { type: "peaking"  as BiquadFilterType, freq: 3600, gain: -2.0, Q: 1.2 }, // Sibilance protection so high volume never hurts
        { type: "highshelf" as BiquadFilterType, freq: 10000, gain: 2.5 },        // Warm smooth treble
      ],
      comp: { threshold: -18, ratio: 3.0, attack: 0.020, release: 0.20 },
      postGain: 1.30,
    },
    vocal: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 65, gain: -2.5 },           // Controlled bass so vocals stand out
        { type: "peaking"  as BiquadFilterType, freq: 240, gain: 3.0, Q: 1.0 },   // Rich vocal chest resonance
        { type: "peaking"  as BiquadFilterType, freq: 480, gain: -4.0, Q: 1.3 },  // Clean instrumental separation
        { type: "peaking"  as BiquadFilterType, freq: 2700, gain: 6.5, Q: 0.85 }, // Extreme upfront vocal presence (Tarab & Intimate)
        { type: "highshelf" as BiquadFilterType, freq: 11000, gain: 4.0 },        // Airy vocal breath
      ],
      comp: { threshold: -15, ratio: 2.6, attack: 0.010, release: 0.12 },
      postGain: 1.28,
    },
    concert: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 55, gain: 5.5 },            // Deep concert hall subwoofer presence
        { type: "peaking"  as BiquadFilterType, freq: 180, gain: 2.5, Q: 0.9 },   // Large hall reverb resonance
        { type: "peaking"  as BiquadFilterType, freq: 600, gain: -2.5, Q: 1.2 },  // Wide stage clarity
        { type: "peaking"  as BiquadFilterType, freq: 3200, gain: 4.0, Q: 0.8 },  // Live stage microphone clarity
        { type: "highshelf" as BiquadFilterType, freq: 12500, gain: 6.0 },        // Huge open-air ceiling (Dolby Atmos style)
      ],
      comp: { threshold: -16, ratio: 2.4, attack: 0.018, release: 0.22 },
      postGain: 1.32,
    },
    spatial: {
      bands: [
        { type: "lowshelf" as BiquadFilterType, freq: 55, gain: 4.0 },            // Dynamic binaural bass
        { type: "peaking"  as BiquadFilterType, freq: 220, gain: 2.0, Q: 0.9 },   // Centered soundstage
        { type: "peaking"  as BiquadFilterType, freq: 450, gain: -3.0, Q: 1.3 },  // Transparent holographic depth
        { type: "peaking"  as BiquadFilterType, freq: 2600, gain: 4.0, Q: 0.8 },  // HRTF binaural sweetening
        { type: "highshelf" as BiquadFilterType, freq: 12000, gain: 5.0 },        // 360° open air immersion
      ],
      comp: { threshold: -15, ratio: 2.2, attack: 0.015, release: 0.16 },
      postGain: 1.30,
    },
    noise_cancel: {
      bands: [
        { type: "highpass" as BiquadFilterType, freq: 50, gain: 0, Q: 0.7 },      // Cuts vehicle and ambient rumble below 50Hz
        { type: "peaking"  as BiquadFilterType, freq: 200, gain: 3.0, Q: 1.0 },   // Warm core
        { type: "peaking"  as BiquadFilterType, freq: 500, gain: -4.5, Q: 1.4 },  // Notches ambient chatter & crowd noise
        { type: "peaking"  as BiquadFilterType, freq: 2600, gain: 5.5, Q: 0.9 },  // Punchy foreground clarity
        { type: "highshelf" as BiquadFilterType, freq: 10000, gain: 4.5 },        // High-frequency clarity masking
      ],
      comp: { threshold: -18, ratio: 3.5, attack: 0.006, release: 0.10 },         // Fast leveling compressor for noisy environments
      postGain: 1.35,
    },
  };

  const applyAudioParameters = (
    ctx: AudioContext,
    isHq: boolean,
    presetKey: "crystal" | "bass" | "vocal" | "spatial" | "concert" | "noise_cancel",
    boostVal = 1.0
  ) => {
    const now = ctx.currentTime;
    const t = 0.04; // 40ms smooth transition, zero click/pop

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
      if (depthFilterRef.current) {
        try { depthFilterRef.current.gain.setTargetAtTime(0, now, t); } catch {}
      }
      return;
    }

    const cfg = PRESET_CONFIGS[presetKey] || PRESET_CONFIGS.crystal;
    if (preGainRef.current) preGainRef.current.gain.setTargetAtTime(1.10, now, t);

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
      // Clean pre-amp booster (up to 2.0x volume)
      boosterGainRef.current.gain.setTargetAtTime(boostVal, now, t);
    }

    if (limiterRef.current) {
      // Spotify/Mastering-grade Brickwall Soft-Knee Peak Limiter
      // Clamps maximum output to -0.1 dBFS to eliminate any crackle, distortion, or blown out highs
      limiterRef.current.threshold.setTargetAtTime(-0.1, now, t);
      limiterRef.current.knee.setTargetAtTime(10, now, t);
      limiterRef.current.ratio.setTargetAtTime(20, now, t); // Hard brickwall limiting
      limiterRef.current.attack.setTargetAtTime(0.001, now, t); // Fast 1ms lookahead clamping
      limiterRef.current.release.setTargetAtTime(0.04, now, t);
    }

    if (postGainRef.current) {
      postGainRef.current.gain.setTargetAtTime(cfg.postGain, now, t);
    }

    update8dRotation();
  };

  const initWebAudio = () => {
    const player = audioRef.current;
    if (!player || typeof window === "undefined" || audioCtxRef.current) return;

    // Mobile background safeguard: do NOT attach WebAudio to the main player on mobile devices.
    // Attaching createMediaElementSource on mobile switches rendering from native OS to Web Audio,
    // which iOS / Android suspends upon screen lock, cutting off audio in earphones and causing buffer-underrun buzzing.
    // Standard audio on mobile plays directly through the OS media daemon so that:
    // 1. Audio never stops when phone is locked.
    // 2. Lock screen media session and earphones work uninterrupted.
    // 3. Audio buffer never desyncs, eliminating any buzzing/humming noise upon unlock.
    if (isMobileDevice()) return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      ctx.onstatechange = () => {
        if (ctx.state === "suspended" && isPlayingRef.current && typeof document !== "undefined" && !document.hidden) {
          ctx.resume().catch(() => {});
        }
      };

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

      // 3. 3D Depth HRTF filter (for 360° rear-orbit sensation)
      const depthFilter = ctx.createBiquadFilter();
      depthFilter.type = "peaking";
      depthFilter.frequency.value = 3800;
      depthFilter.Q.value = 1.2;
      depthFilter.gain.value = 0;
      depthFilterRef.current = depthFilter;

      // 4. Stereo Panner Node (for 8D audio rotation)
      let panner: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === "function") {
        try {
          panner = ctx.createStereoPanner();
          pannerRef.current = panner;
        } catch {}
      }

      // 5. Studio Mastering Compressor (Musical glue & dynamic control)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 14;
      comp.ratio.value = 2.0;
      comp.attack.value = 0.015;
      comp.release.value = 0.16;
      compressorRef.current = comp;

      // 6. Clean Audiophile Booster Stage (up to 200% volume boost)
      const boosterGain = ctx.createGain();
      boosterGain.gain.value = state.soundBoost || 1.0;
      boosterGainRef.current = boosterGain;

      // 7. Spotify-grade Brickwall Peak Limiter (Ear-safe ceiling, 0% clipping distortion)
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -0.1;
      limiter.knee.value = 10;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.04;
      limiterRef.current = limiter;

      // 8. Post-Gain stage
      const postGain = ctx.createGain();
      postGain.gain.value = 1.0;
      postGainRef.current = postGain;

      // Connect graph: source -> preGain -> eqNodes -> depthFilter -> (panner) -> comp -> boosterGain -> limiter -> postGain -> destination
      source.connect(preGain);
      let lastNode: AudioNode = preGain;
      for (const n of nodes) {
        lastNode.connect(n);
        lastNode = n;
      }
      lastNode.connect(depthFilter);
      lastNode = depthFilter;

      if (panner) {
        lastNode.connect(panner);
        lastNode = panner;
      }
      lastNode.connect(comp);
      comp.connect(boosterGain);
      boosterGain.connect(limiter);
      limiter.connect(postGain);
      postGain.connect(ctx.destination);

      // 9. Analyser tap (visualizer only)
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      analyserRef.current = analyser;
      postGain.connect(analyser);

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      // Apply initial audio parameters
      applyAudioParameters(ctx, state.isHighQuality, soundPreset, state.soundBoost);
    } catch (err) {
      console.warn("[WebAudio] Init error:", err);
    }
  };

  useEffect(() => {
    const isMobile = isMobileDevice();

    if (!isMobile && !audioCtxRef.current && (state.isPlaying || state.isHighQuality)) {
      initWebAudio();
    }
    const ctx = audioCtxRef.current;
    if (ctx) {
      if (ctx.state === "suspended" && state.isPlaying && typeof document !== "undefined" && !document.hidden) {
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
      recordAudioDiagnosticEvent("MediaSession action: play received");
      releaseAudioSession();
      configureAudioSession();
      const player = audioRef.current;
      if (!player) return;

      player.muted = false;

      // ── Zero-Latency Synchronous Play for iOS Lock Screen & AirPods ──
      // Calling player.play() synchronously in the exact hardware gesture frame
      // is REQUIRED by iOS WebKit to maintain the user-activation token in background.
      if (player.src && player.src !== "" && player.src !== window.location.href) {
        try {
          const playPromise = player.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                recordAudioDiagnosticEvent("MediaSession direct sync play succeeded");
                if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
                  navigator.mediaSession.playbackState = "playing";
                }
                isPlayingRef.current = true;
                setState((prev) => ({ ...prev, isPlaying: true, isBuffering: false, error: null }));
                syncPositionState();
              })
              .catch((err) => {
                recordAudioDiagnosticEvent("MediaSession direct play rejected, falling back to recovery engine", {
                  error: err?.message,
                  name: err?.name,
                });
                executePlayOrRecover("mediasession-play-sync-rejected");
              });
            return;
          }
        } catch (syncErr) {
          console.warn("[MediaSession] Synchronous play threw exception:", syncErr);
        }
      }

      // If no valid source was attached, proceed with recovery
      executePlayOrRecover("mediasession-play-no-src");
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      recordAudioDiagnosticEvent("MediaSession action: pause received");
      const player = audioRef.current;
      if (player) {
        player.pause();
      }
      isPlayingRef.current = false;
      holdAudioSessionOnPause();
      setState((prev) => ({ ...prev, isPlaying: false }));
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      syncPositionState();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      configureAudioSession();
      nextRef.current();
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      configureAudioSession();
      prevRef.current();
    });

    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null && !isNaN(d.seekTime)) {
        seekTo(d.seekTime);
        syncPositionState();
      }
    });

    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      const skipTime = details.seekOffset || 15;
      if (audioRef.current) {
        seekTo(Math.max(0, audioRef.current.currentTime - skipTime));
        syncPositionState();
      }
    });

    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      const skipTime = details.seekOffset || 15;
      if (audioRef.current) {
        seekTo(Math.min((audioRef.current.currentTime || 0) + skipTime, audioRef.current.duration || 0));
        syncPositionState();
      }
    });

    navigator.mediaSession.setActionHandler("stop", () => {
      releaseAudioSession();
      const player = audioRef.current;
      if (player) {
        player.pause();
        player.currentTime = 0;
      }
      isPlayingRef.current = false;
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
      navigator.mediaSession.playbackState = "none";
    });

    return () => {
      (["play", "pause", "stop", "nexttrack", "previoustrack", "seekto", "seekbackward", "seekforward"] as MediaSessionAction[]).forEach((a) => {
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
      const restoredTime = stateRef.current.currentTime || 0;
      const shouldResume = stateRef.current.isPlaying;

      getAudioBlob(song.songId).then(async (cachedBlob) => {
        let b = cachedBlob;
        if (!b && song.youtubeVideoId && song.youtubeVideoId !== song.songId) {
          b = await getAudioBlob(song.youtubeVideoId);
        }
        if (b && isKhaleejiOrCorruptedJannatBlob(song.artist, b.size, song.songId || song.title)) {
          console.warn(`[Player] Detected corrupted Khaleeji blob (${b.size} bytes) on mount for "${song.title}". Purging...`);
          await deleteAudioBlobOnly(song.songId);
          if (song.youtubeVideoId && song.youtubeVideoId !== song.songId) {
            await deleteAudioBlobOnly(song.youtubeVideoId);
          }
          b = null;
        }

        let audioSourceUrl: string;
        let isBlobSource = false;
        if (b) {
          const blobUrl = setActiveBlobSource(song.songId, b);
          audioSourceUrl = blobUrl;
          isBlobSource = true;
        } else {
          clearActiveBlobSource();
          const targetVid = song.youtubeVideoId || song.songId || "";
          audioSourceUrl = toAbsoluteApiUrl(
            `/api/ytdownload?videoId=${encodeURIComponent(targetVid)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist || "")}&proxy=true`
          );
        }

        if (cancelled) return;

        player.muted = false;
        player.src = audioSourceUrl;
        player.preload = "auto";
        if (restoredTime > 0) {
          try { player.currentTime = restoredTime; } catch {}
        }

        updateMediaSessionMetadata(song);

        setState((prev) => ({
          ...prev,
          streamUrl: audioSourceUrl,
          sourceType: isBlobSource ? "offline-blob" : "remote-url",
          currentTime: restoredTime,
          isBuffering: false,
          isPlaying: shouldResume,
        }));

        if (shouldResume) {
          const p = player.play();
          if (p !== undefined) {
            p.catch((err) => {
              if (err.name === "NotAllowedError") {
                armGestureResume(player);
              }
            });
          }
        }
      }).catch(() => {
        setState((prev) => ({ ...prev, isBuffering: false }));
      });
      return;
    }

    // If the audio element was already started synchronously by syncPlayTrack/playNow/next/prev, do not pause or reload!
    const targetVid = song.youtubeVideoId || song.songId || "";
    const isCurrentSrcActive = player.src && (
      (targetVid && player.src.includes(encodeURIComponent(targetVid))) ||
      player.src.includes(encodeURIComponent(song.title)) ||
      (state.streamUrl && player.src === state.streamUrl) ||
      (activeBlobUrlRef.current && player.src === activeBlobUrlRef.current)
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
          const blobUrl = setActiveBlobSource(song.songId, cachedBlob);
          isPlayingRef.current = true;
          setState((prev) => ({
            ...prev,
            isBuffering: false,
            streamUrl: blobUrl,
            isPlaying: true,
            error: null,
            sourceType: "offline-blob",
          }));

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

        const anghamClassic = ANGHAM_OLD_CLASSICS.find(
          (c) =>
            c.songId === song.songId ||
            c.youtubeVideoId === song.youtubeVideoId ||
            c.title === song.title ||
            song.title.includes(c.title) ||
            c.title.includes(song.title)
        );
        const jannatClassic = JANNAT_OLD_CLASSICS.find(
          (c) =>
            c.songId === song.songId ||
            c.youtubeVideoId === song.youtubeVideoId ||
            c.title === song.title ||
            song.title.includes(c.title) ||
            c.title.includes(song.title)
        );
        const classic = anghamClassic || jannatClassic;
        const vid = classic ? classic.youtubeVideoId : (song.youtubeVideoId || song.songId || "");
        const songTitle = classic ? classic.title : song.title;
        const songArtist = anghamClassic ? "أنغام" : jannatClassic ? "جنات" : (song.artist || "");

        const playUrl = toAbsoluteApiUrl(
          `/api/ytdownload?videoId=${encodeURIComponent(vid)}&title=${encodeURIComponent(songTitle)}&artist=${encodeURIComponent(songArtist)}&proxy=true`
        );

        clearActiveBlobSource();
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
          sourceType: "remote-url",
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
      player.muted = false;
      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name === "NotAllowedError") {
            if (typeof document !== "undefined" && !document.hidden) {
              armGestureResume(player);
            }
          } else if (err.name !== "AbortError") {
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

  // Sync currentTime and safely resume WebAudio when returning from background lock screen
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      const player = audioRef.current;
      const ctx = audioCtxRef.current;

      if (!document.hidden) {
        // Screen unlocked / tab visible:
        configureAudioSession();
        if (player) {
          player.muted = false;
          setState((prev) => ({ ...prev, currentTime: player.currentTime || 0 }));
          // If state marked playing but element was stalled/suspended by background throttling, revive it safely
          if (isPlayingRef.current && player.paused) {
            recordAudioDiagnosticEvent("Foreground visibility resume triggered", {
              paused: player.paused,
              readyState: player.readyState,
              src: player.src ? player.src.substring(0, 50) : "empty",
            });
            executePlayOrRecover("foreground-visibility-resume").catch(() => {});
          }
        }
        if (ctx && ctx.state === "suspended" && isPlayingRef.current) {
          ctx.resume().then(() => {
            if (pannerRef.current) {
              try {
                pannerRef.current.pan.cancelScheduledValues(ctx.currentTime);
                pannerRef.current.pan.setValueAtTime(0, ctx.currentTime);
              } catch {}
            }
            if (isPlayingRef.current) {
              update8dRotation();
            }
          }).catch(() => {});
        } else if (isPlayingRef.current) {
          update8dRotation();
        }
        syncPositionState();
      } else {
        // Screen locked / tab hidden:
        if (pannerAnimRef.current) {
          cancelAnimationFrame(pannerAnimRef.current);
          pannerAnimRef.current = null;
        }
        if (ctx && pannerRef.current) {
          try {
            pannerRef.current.pan.cancelScheduledValues(ctx.currentTime);
          } catch {}
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

  // Unlock iOS WebKit audio on first touch
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => {
      configureAudioSession();
      const player = audioRef.current;
      if (player) {
        player.muted = false;
        if (player.paused && !player.src) {
          player.load();
        }
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

      // Duration safeguard for Jannat & Angham cached tracks
      if (player.src && player.src.startsWith("blob:") && currentSong) {
        const isJannat =
          currentSong.artist?.includes("جنات") ||
          currentSong.artist?.toLowerCase().includes("jannat");
        const jannatClassic = JANNAT_OLD_CLASSICS.find(
          (c) =>
            c.songId === currentSong.songId ||
            c.youtubeVideoId === currentSong.youtubeVideoId ||
            c.title === currentSong.title
        );

        const isAngham =
          currentSong.artist?.includes("أنغام") ||
          currentSong.artist?.toLowerCase().includes("angham");
        const anghamClassic = ANGHAM_OLD_CLASSICS.find(
          (c) =>
            c.songId === currentSong.songId ||
            c.youtubeVideoId === currentSong.youtubeVideoId ||
            c.title === currentSong.title
        );

        const classic = jannatClassic || anghamClassic;

        if ((isJannat || isAngham || classic) && classic?.duration) {
          const parts = classic.duration.split(":").map(Number);
          const expectedSec = parts[0] * 60 + parts[1];
          // Only purge if it's an undeniable preview snippet (less than 55 seconds when expected is > 90s)
          if (dur > 0 && dur < 55 && expectedSec > 90) {
            console.warn(`[Player] Snippet preview detected for "${currentSong.title}": expected ~${expectedSec}s, got ${dur.toFixed(1)}s. Purging snippet blob...`);
            deleteAudioBlobOnly(currentSong.songId).catch(() => {});
            if (currentSong.youtubeVideoId) {
              deleteAudioBlobOnly(currentSong.youtubeVideoId).catch(() => {});
            }
            // Stream the authentic audio directly
            const targetVid = classic.youtubeVideoId || currentSong.youtubeVideoId || currentSong.songId || "";
            const streamArtist = anghamClassic ? "أنغام" : jannatClassic ? "جنات" : (currentSong.artist || "");
            const streamUrl = toAbsoluteApiUrl(`/api/ytdownload?videoId=${encodeURIComponent(targetVid)}&title=${encodeURIComponent(classic.title || currentSong.title)}&artist=${encodeURIComponent(streamArtist)}&proxy=true`);
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
    recordAudioDiagnosticEvent("Audio onWaiting event", {
      currentTime: audioRef.current?.currentTime,
      readyState: audioRef.current?.readyState,
      networkState: audioRef.current?.networkState,
    });
    setState((prev) => ({ ...prev, isBuffering: true }));
  };

  const onStalled = () => {
    recordAudioDiagnosticEvent("Audio onStalled event", {
      currentTime: audioRef.current?.currentTime,
      readyState: audioRef.current?.readyState,
      networkState: audioRef.current?.networkState,
    });
  };

  const onPlaying = () => {
    recordAudioDiagnosticEvent("Audio onPlaying event", {
      currentTime: audioRef.current?.currentTime,
      duration: audioRef.current?.duration,
    });
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
    recordAudioDiagnosticEvent("Audio onPlay event", {
      currentTime: audioRef.current?.currentTime,
    });
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
    recordAudioDiagnosticEvent("Audio onPause event", {
      currentTime: audioRef.current?.currentTime,
      isLoadingNewSong: isLoadingNewSongRef.current,
    });
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
    test8dSound,
    getAnalyser: () => analyserRef.current,
    closePlayer: () => {
      const player = audioRef.current;
      if (player) {
        player.pause();
        player.removeAttribute("src");
        player.load();
      }
      setHasUserTriggeredPlay(false);
      try {
        localStorage.removeItem("aura-player-session");
        localStorage.removeItem("aura-player-state");
      } catch {}
      setState(initialPlayerState);
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState = "none";
          navigator.mediaSession.metadata = null;
        } catch {}
      }
    },
    hasUserTriggeredPlay,
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
        crossOrigin={isMobileDevice() ? undefined : "anonymous"}
        playsInline
        preload="auto"
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={onLoadedMetadata}
        onWaiting={onWaiting}
        onStalled={onStalled}
        onPlaying={onPlaying}
        onCanPlay={onPlaying}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onError={(e) => {
          const error = e.currentTarget.error;
          const currentSrc = e.currentTarget.src;
          
          recordAudioDiagnosticEvent("Audio onError event", {
            code: error?.code,
            message: error?.message,
            src: currentSrc ? (currentSrc.length > 50 ? currentSrc.substring(0, 50) + "..." : currentSrc) : "none"
          });

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
