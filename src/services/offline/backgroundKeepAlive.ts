/**
 * backgroundKeepAlive.ts
 * 
 * iOS / Safari / Mobile Background Keep-Alive Engine for Offline Downloads.
 * 
 * Problem on iOS:
 * When the user locks the screen or minimizes Safari/PWA, iOS WebKit suspends JS execution
 * within 5-10 seconds, halting active fetch streams and downloads.
 * 
 * Solution:
 * iOS WebKit grants background process execution exclusively to web pages with an active Audio Session.
 * This service creates an imperceptible silent audio loop, requests screen wake-lock, and registers
 * lock-screen MediaSession metadata ("جارٍ تنزيل الأغاني في الخلفية... ⚡").
 * 
 * While downloading:
 * - If user is already playing music in Aura, their music keeps the session alive.
 * - If music is stopped/paused, this silent keep-alive takes over automatically.
 * - Downloads continue streaming and saving into IndexedDB with screen off or app in background!
 */

let silentAudio: HTMLAudioElement | null = null;
let wakeLockSentinel: any = null;
let mainAudioIsPlaying = false;
let isKeepAliveActive = false;
let currentTaskTitle = "";

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Dynamically builds a valid, self-contained 1-second inaudible WAV audio file.
 * Compatible with iOS WebKit, Safari, Chrome, and Firefox.
 */
export function createSilentWavBlob(): Blob {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1 second of audio
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeString(view, 8, "WAVE");

  // "fmt " sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);      // 16 for PCM
  view.setUint16(20, 1, true);       // PCM format
  view.setUint16(22, 1, true);       // 1 channel (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // Byte rate (sampleRate * blockAlign)
  view.setUint16(32, 1, true);       // Block align
  view.setUint16(34, 8, true);       // Bits per sample (8-bit)

  // "data" sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, numSamples, true);

  // Fill with 128 (center point for 8-bit unsigned PCM = complete silence)
  const bytes = new Uint8Array(buffer, 44, numSamples);
  bytes.fill(128);

  return new Blob([buffer], { type: "audio/wav" });
}

function getOrCreateSilentAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!silentAudio) {
    try {
      const blob = createSilentWavBlob();
      const url = URL.createObjectURL(blob);
      silentAudio = new Audio(url);
      silentAudio.loop = true;
      // Use tiny non-zero volume so iOS audio engine does not mute or suspend the element
      silentAudio.volume = 0.01;
      silentAudio.setAttribute("playsinline", "true");
      (silentAudio as any).preservesPitch = false;
    } catch (e) {
      console.warn("[BackgroundKeepAlive] Error creating silent audio:", e);
    }
  }
  return silentAudio;
}

function isAppAudioActive(): boolean {
  if (mainAudioIsPlaying) return true;
  if (typeof document !== "undefined") {
    const mainEl = document.querySelector("audio[data-main-player='true']") as HTMLAudioElement | null;
    if (mainEl && (mainEl.src || !mainEl.paused || (mainEl.currentTime > 0 && !mainEl.ended))) {
      return true;
    }
  }
  return false;
}

function resumeSilentAudio() {
  if (typeof window === "undefined" || isAppAudioActive()) return;
  const audio = getOrCreateSilentAudio();
  if (!audio) return;

  try {
    audio.play().then(() => {
      // Set lock screen media session indicating active background download only if no real music is active
      if (typeof navigator !== "undefined" && "mediaSession" in navigator && !isAppAudioActive()) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: currentTaskTitle ? `جارٍ التنزيل: ${currentTaskTitle}` : "جارٍ تنزيل الأغاني في الخلفية... ⚡",
            artist: "Aura Music",
            album: "تحميل للأوفلاين (شغال في الخلفية)",
            artwork: [
              { src: typeof window !== "undefined" ? `${window.location.origin}/logo-v2.png` : "/logo-v2.png", sizes: "192x192" },
              { src: typeof window !== "undefined" ? `${window.location.origin}/logo-v2.png` : "/logo-v2.png", sizes: "512x512" },
            ],
          });
          navigator.mediaSession.playbackState = "playing";
        } catch {}
      }
    }).catch((err) => {
      console.warn("[BackgroundKeepAlive] Silent audio autoplay prevented:", err);
    });
  } catch {}
}

function pauseSilentAudio() {
  if (silentAudio && !silentAudio.paused) {
    try {
      silentAudio.pause();
    } catch {}
  }
}

/**
 * Notify the keep-alive service when the main app player starts or pauses music.
 */
export function setMainAudioPlaying(isPlaying: boolean) {
  mainAudioIsPlaying = isPlaying;
  if (isPlaying) {
    // Real music is playing; pause silent audio immediately so it never conflicts
    pauseSilentAudio();
  } else {
    // Real music paused; if downloads are active, resume silent keep-alive
    if (isKeepAliveActive && !isAppAudioActive()) {
      resumeSilentAudio();
    }
  }
}

/**
 * Acquire iOS background execution mode & screen wake lock for downloading.
 */
export function startBackgroundKeepAlive(title?: string) {
  if (typeof window === "undefined") return;
  isKeepAliveActive = true;
  if (title) currentTaskTitle = title;

  // 1. Screen WakeLock API
  if ("wakeLock" in navigator && !wakeLockSentinel) {
    try {
      (navigator as any).wakeLock.request("screen").then((sentinel: any) => {
        wakeLockSentinel = sentinel;
        sentinel.addEventListener("release", () => {
          wakeLockSentinel = null;
        });
      }).catch(() => {});
    } catch {}
  }

  // 2. iOS Audio Session Keep-Alive
  // ONLY if user is NOT currently playing real music!
  if (!isAppAudioActive()) {
    resumeSilentAudio();
  }
}

/**
 * Release iOS background execution mode & wake lock when all downloads finish.
 */
export function stopBackgroundKeepAlive() {
  if (typeof window === "undefined") return;
  isKeepAliveActive = false;
  currentTaskTitle = "";

  pauseSilentAudio();

  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }

  // Clear download media session ONLY if main music isn't active
  if (typeof navigator !== "undefined" && "mediaSession" in navigator && !isAppAudioActive()) {
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    } catch {}
  }
}

// Handle visibility change: re-request wake lock and ensure keep-alive when returning
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isKeepAliveActive) {
      if ("wakeLock" in navigator && !wakeLockSentinel) {
        try {
          (navigator as any).wakeLock.request("screen").then((sentinel: any) => {
            wakeLockSentinel = sentinel;
          }).catch(() => {});
        } catch {}
      }
      if (!mainAudioIsPlaying) {
        resumeSilentAudio();
      }
    }
  });
}
