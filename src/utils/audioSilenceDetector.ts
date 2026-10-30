/**
 * audioSilenceDetector.ts
 * 
 * High-speed silence detection and trimming engine for offline and downloaded audio files.
 * Identifies leading theatrical dialogue/silence and trailing empty silence (dead audio)
 * so songs finish cleanly without minutes of emptiness.
 */

export interface SilenceAnalysisResult {
  startSec: number;        // where music actually starts (0 if no leading silence)
  endSec: number;          // where music actually ends (totalDuration if no trailing silence)
  totalDuration: number;   // full file duration
  hasLeadingSilence: boolean;
  hasTrailingSilence: boolean;
}

// In-memory cache for fast repeated lookups
const silenceAnalysisCache = new Map<string, SilenceAnalysisResult>();

/**
 * Rapidly inspects an audio Blob's PCM waveform using an in-memory AudioContext.
 * Detects if the song starts late (dialogue/silence) or has minutes of trailing dead audio.
 */
export async function analyzeAudioSilence(songId: string, blob: Blob): Promise<SilenceAnalysisResult> {
  if (silenceAnalysisCache.has(songId)) {
    return silenceAnalysisCache.get(songId)!;
  }

  const defaultResult: SilenceAnalysisResult = {
    startSec: 0,
    endSec: 0,
    totalDuration: 0,
    hasLeadingSilence: false,
    hasTrailingSilence: false,
  };

  if (typeof window === "undefined" || !blob || blob.size < 5000) {
    return defaultResult;
  }

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return defaultResult;

    const audioCtx = new AudioContextClass();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Release context resources immediately
    if (audioCtx.close) {
      audioCtx.close().catch(() => {});
    }

    const totalDuration = audioBuffer.duration;
    if (!totalDuration || isNaN(totalDuration) || totalDuration < 10) {
      return { ...defaultResult, totalDuration: totalDuration || 0 };
    }

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Analyze volume in 0.5-second windows
    const windowSize = Math.floor(sampleRate * 0.5);
    const totalWindows = Math.floor(channelData.length / windowSize);

    // Silence threshold: RMS < 0.006 (approx -45 dBFS)
    const SILENCE_RMS_THRESHOLD = 0.006;

    let firstAudibleWindow = 0;
    let lastAudibleWindow = totalWindows - 1;

    // 1. Scan from start for first audible window
    for (let w = 0; w < totalWindows; w++) {
      const start = w * windowSize;
      let sumSquares = 0;
      // Step by 4 for fast computation
      for (let i = 0; i < windowSize; i += 4) {
        const sample = channelData[start + i];
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / (windowSize / 4));
      if (rms >= SILENCE_RMS_THRESHOLD) {
        firstAudibleWindow = w;
        break;
      }
    }

    // 2. Scan from end for last audible window
    for (let w = totalWindows - 1; w >= 0; w--) {
      const start = w * windowSize;
      let sumSquares = 0;
      for (let i = 0; i < windowSize; i += 4) {
        const sample = channelData[start + i];
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / (windowSize / 4));
      if (rms >= SILENCE_RMS_THRESHOLD) {
        lastAudibleWindow = w;
        break;
      }
    }

    const startSec = Math.max(0, firstAudibleWindow * 0.5);
    // Add 1.5s padding to the end for natural reverb decay
    const endSec = Math.min(totalDuration, Math.max(startSec + 10, (lastAudibleWindow + 1) * 0.5 + 1.5));

    // A track has leading silence if music doesn't start for >= 5.0 seconds
    const hasLeadingSilence = startSec >= 5.0;
    // A track has trailing silence if there is >= 7.0 seconds of dead silence before file ends
    const hasTrailingSilence = (totalDuration - endSec) >= 7.0;

    const result: SilenceAnalysisResult = {
      startSec: hasLeadingSilence ? startSec : 0,
      endSec: hasTrailingSilence ? endSec : totalDuration,
      totalDuration,
      hasLeadingSilence,
      hasTrailingSilence,
    };

    silenceAnalysisCache.set(songId, result);
    return result;
  } catch (err) {
    console.warn(`[SilenceDetector] Could not analyze silence for ${songId}:`, err);
    return defaultResult;
  }
}

export function getCachedSilenceAnalysis(songId: string): SilenceAnalysisResult | null {
  return silenceAnalysisCache.get(songId) || null;
}
