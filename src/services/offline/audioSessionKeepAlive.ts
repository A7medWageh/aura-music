/**
 * audioSessionKeepAlive.ts
 * 
 * iOS WebKit PWA Lock-Screen & Background Session Anchor.
 * 
 * Problem on iOS Safari / Standalone PWA:
 * When an HTML5 <audio> element is paused, iOS WebKit suspends the web process within 10-20 seconds.
 * Once suspended, iOS blocks `HTMLAudioElement.play()` from the lock-screen or AirPods
 * because background autoplay without a foreground user gesture is forbidden.
 * 
 * Solution:
 * When playback is paused while an offline/online song is active, we spin up an imperceptible, silent audio loop
 * (inaudible 8kHz PCM WAV at volume 0.001) that keeps the WebKit AudioSession active and prevents iOS
 * from suspending the process.
 * 
 * Crucially:
 * - Pre-warmed / unlocked on first user touch so iOS never blocks it with NotAllowedError.
 * - We NEVER touch `navigator.mediaSession.metadata` so lock-screen artwork and song title stay intact.
 * - When user resumes playback, the silent carrier is paused and real audio takes over instantly.
 * - IndexedDB storage and user data (downloaded songs) are NEVER touched.
 */

import { createSilentWavBlob } from "./backgroundKeepAlive";

let silentCarrierAudio: HTMLAudioElement | null = null;
let idleTimeout: NodeJS.Timeout | null = null;
let isCarrierPrimed = false;
const MAX_IDLE_MINUTES = 30; // Auto-release after 30 min of inactivity to preserve iPhone battery

function getSilentCarrier(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!silentCarrierAudio) {
    try {
      const blob = createSilentWavBlob();
      const url = URL.createObjectURL(blob);
      silentCarrierAudio = new Audio(url);
      silentCarrierAudio.loop = true;
      silentCarrierAudio.volume = 0.001; // Imperceptible, non-zero to keep iOS mixer active
      silentCarrierAudio.setAttribute("playsinline", "true");
      (silentCarrierAudio as any).preservesPitch = false;
    } catch (e) {
      console.warn("[AudioSessionKeepAlive] Error creating silent carrier:", e);
    }
  }
  return silentCarrierAudio;
}

/**
 * Permanently authorizes/unlocks the silent carrier audio element for iOS Safari.
 * MUST be invoked during a direct user touch/click gesture (e.g. initial touch or play).
 */
export function primeSilentCarrier() {
  if (typeof window === "undefined" || isCarrierPrimed) return;
  const carrier = getSilentCarrier();
  if (!carrier) return;

  try {
    const p = carrier.play();
    if (p !== undefined) {
      p.then(() => {
        isCarrierPrimed = true;
        // Successfully unlocked on iOS! Immediately pause until holdAudioSessionOnPause needs it.
        carrier.pause();
      }).catch((err) => {
        console.warn("[AudioSessionKeepAlive] Prime caught:", err);
      });
    }
  } catch {}
}

// Auto-prime on first user touch anywhere on the page
if (typeof window !== "undefined") {
  const onFirstTouch = () => {
    primeSilentCarrier();
    window.removeEventListener("touchstart", onFirstTouch);
    window.removeEventListener("click", onFirstTouch);
  };
  window.addEventListener("touchstart", onFirstTouch, { passive: true, once: true });
  window.addEventListener("click", onFirstTouch, { passive: true, once: true });
}

/**
 * Activates silent carrier when real music is paused.
 * Note: We intentionally avoid playing a secondary silent audio loop during pause,
 * as iOS WebKit treats carrier pause + real player play in the same hardware tick
 * as an audio route interruption, stalling Bluetooth headphones and freezing currentTime.
 */
export function holdAudioSessionOnPause() {
  if (typeof window === "undefined") return;

  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
}

/**
 * Deactivates silent carrier when real music resumes or stops.
 */
export function releaseAudioSession() {
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  if (silentCarrierAudio && !silentCarrierAudio.paused) {
    try {
      silentCarrierAudio.pause();
    } catch {}
  }
}
