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
 * - We NEVER touch `navigator.mediaSession.metadata` so lock-screen artwork and song title stay intact.
 * - When user resumes playback, the silent carrier is paused and real audio takes over instantly.
 * - IndexedDB storage and user data (downloaded songs) are NEVER touched.
 */

import { createSilentWavBlob } from "./backgroundKeepAlive";

let silentCarrierAudio: HTMLAudioElement | null = null;
let idleTimeout: NodeJS.Timeout | null = null;
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
 * Activates silent carrier when real music is paused.
 * Keeps iOS WebKit from freezing the background process so lock-screen Play works.
 */
export function holdAudioSessionOnPause() {
  if (typeof window === "undefined") return;

  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }

  const carrier = getSilentCarrier();
  if (!carrier) return;

  try {
    const p = carrier.play();
    if (p !== undefined) {
      p.catch((err) => {
        // Can be ignored if browser blocks silent carrier
        console.warn("[AudioSessionKeepAlive] Silent carrier play caught:", err);
      });
    }
  } catch {}

  // Safety timer: if user leaves it paused for 30 minutes, release carrier to conserve battery
  idleTimeout = setTimeout(() => {
    releaseAudioSession();
  }, MAX_IDLE_MINUTES * 60 * 1000);
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
