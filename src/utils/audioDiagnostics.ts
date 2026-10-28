/**
 * audioDiagnostics.ts
 *
 * Lightweight, structured development-only diagnostics for audio playback & recovery.
 * Exposes window.__auraAudioDiagnostics for real-time inspection in iOS Safari Web Inspector.
 */

export type AudioSourceType = "offline-blob" | "remote-url" | null;

export interface AudioDiagnosticSnapshot {
  timestamp: string;
  songId: string | null;
  songTitle: string | null;
  sourceType: AudioSourceType;
  isBlobUrl: boolean;
  audioSrc: string | null;
  audioCurrentSrc: string | null;
  audioPaused: boolean | null;
  audioEnded: boolean | null;
  audioReadyState: number | null;
  audioNetworkState: number | null;
  audioCurrentTime: number | null;
  audioDuration: number | null;
  audioErrorCode: number | null;
  audioErrorMessage: string | null;
  mediaSessionPlaybackState: string | null;
  recoveryAttempts: number;
  recentEvents: Array<{ event: string; timestamp: string; details?: any }>;
}

const MAX_EVENT_LOGS = 25;
const eventLog: Array<{ event: string; timestamp: string; details?: any }> = [];

let audioRefGetter: (() => HTMLAudioElement | null) | null = null;
let stateGetter: (() => {
  songId: string | null;
  songTitle: string | null;
  sourceType: AudioSourceType;
  recoveryAttempts: number;
}) | null = null;

export function registerAudioDiagnosticsSource(
  getAudio: () => HTMLAudioElement | null,
  getState: () => {
    songId: string | null;
    songTitle: string | null;
    sourceType: AudioSourceType;
    recoveryAttempts: number;
  }
) {
  audioRefGetter = getAudio;
  stateGetter = getState;

  if (typeof window !== "undefined") {
    (window as any).__auraAudioDiagnostics = getAudioDiagnosticsSnapshot;
  }
}

export function recordAudioDiagnosticEvent(event: string, details?: any) {
  const entry = {
    event,
    timestamp: new Date().toISOString(),
    details: details ? sanitizeDetails(details) : undefined,
  };

  eventLog.push(entry);
  if (eventLog.length > MAX_EVENT_LOGS) {
    eventLog.shift();
  }

  // Development console output
  if (
    typeof window !== "undefined" &&
    (process.env.NODE_ENV !== "production" || (window as any).__AURA_DEBUG_AUDIO__)
  ) {
    console.log(`[AuraAudioDiag] ${event}`, details || "");
  }
}

function sanitizeDetails(details: any): any {
  try {
    // Avoid circular structures or sensitive data
    return JSON.parse(
      JSON.stringify(details, (key, value) => {
        if (key === "buffer" || key === "blob") return "[Binary Data]";
        return value;
      })
    );
  } catch {
    return String(details);
  }
}

export function getAudioDiagnosticsSnapshot(): AudioDiagnosticSnapshot {
  const audio = audioRefGetter ? audioRefGetter() : null;
  const state = stateGetter
    ? stateGetter()
    : { songId: null, songTitle: null, sourceType: null, recoveryAttempts: 0 };

  const src = audio?.src || null;
  const isBlobUrl = typeof src === "string" && src.startsWith("blob:");

  let mediaSessionState: string | null = null;
  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
    try {
      mediaSessionState = navigator.mediaSession.playbackState || null;
    } catch {}
  }

  return {
    timestamp: new Date().toISOString(),
    songId: state.songId,
    songTitle: state.songTitle,
    sourceType: state.sourceType,
    isBlobUrl,
    audioSrc: src,
    audioCurrentSrc: audio?.currentSrc || null,
    audioPaused: audio ? audio.paused : null,
    audioEnded: audio ? audio.ended : null,
    audioReadyState: audio ? audio.readyState : null,
    audioNetworkState: audio ? audio.networkState : null,
    audioCurrentTime: audio ? audio.currentTime : null,
    audioDuration: audio && !isNaN(audio.duration) ? audio.duration : null,
    audioErrorCode: audio?.error?.code ?? null,
    audioErrorMessage: audio?.error?.message ?? null,
    mediaSessionPlaybackState: mediaSessionState,
    recoveryAttempts: state.recoveryAttempts,
    recentEvents: [...eventLog],
  };
}
