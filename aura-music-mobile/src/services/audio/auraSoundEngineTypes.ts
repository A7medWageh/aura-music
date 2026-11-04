/**
 * AURA SOUND ENGINE — Advanced Audio Processing System
 * Type definitions for Native DSP Pipeline (iPhone 12 Pro Max priority) and Web Audio API
 */

export type AuraAudioProfile = 'auto' | 'speaker' | 'headphones' | 'airpods';

export interface AuraEngineConfig {
  isEnabled: boolean;
  isBypassed: boolean;
  soundBoost: number;        // 1.0 to 2.0 (100% to 200%)
  vocalClarity: number;      // 0.0 to 1.0 (0% to 100%)
  bassDepth: number;         // 0.0 to 1.0 (0% to 100%)
  spatialWidth: number;      // 0.0 to 2.0 (1.0 = normal stereo)
  is8dActive: boolean;       // 8D rotating spatial surround
  presetId: string;
  profile: AuraAudioProfile;
  eqGains?: number[];        // 10 bands in dB (-12 to +12 dB)
}

export interface SoundPreset {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  icon: string;
  /**
   * 10 Standard ISO Frequencies:
   * [32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1000Hz, 2200Hz, 4500Hz, 9000Hz, 16000Hz]
   */
  bands: [number, number, number, number, number, number, number, number, number, number];
  vocalBoost: number;       // Additional vocal presence weight (0.0 to 1.0)
  bassDepth: number;        // Additional bass weight (0.0 to 1.0)
  spatialWidth: number;     // Recommended stereo width multiplier (0.8 to 1.6)
}

export const AURA_EQ_FREQUENCIES = [
  32,    // Sub-bass
  64,    // Deep bass
  125,   // Punch bass
  250,   // Warmth / Body
  500,   // Low-mids
  1000,  // Vocal core
  2200,  // Vocal clarity & presence
  4500,  // Consonant articulation
  9000,  // Brilliance & air
  16000, // Shimmer & micro-detail
] as const;
