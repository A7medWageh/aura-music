/**
 * AURA SOUND ENGINE — Master Controller
 * Advanced Audio Processing System for iOS (iPhone 12 Pro Max Priority) and Web.
 * Real-time DSP: 10-Band EQ, Vocal Presence, Subsonic Filter, True-Peak Limiter, Mid/Side Stereo.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AudioPlayer } from 'expo-audio';
import {
  type AuraAudioProfile,
  type AuraEngineConfig,
} from './auraSoundEngineTypes';
import { getAuraPreset, type SoundPreset } from './soundPresets';
import { auraSoundEngineWeb } from './auraSoundEngineWeb';

const STORAGE_KEYS = {
  PRESET: 'aura_sound_preset_v2',
  BOOST: 'aura_sound_boost_v2',
  VOCAL_CLARITY: 'aura_vocal_clarity_v2',
  BASS_DEPTH: 'aura_bass_depth_v2',
  SPATIAL_WIDTH: 'aura_spatial_width_v2',
  IS_8D: 'aura_is_8d_v2',
  BYPASS: 'aura_is_bypassed_v2',
  PROFILE: 'aura_audio_profile_v2',
};

class AuraSoundEngineService {
  private activePlayer: AudioPlayer | null = null;
  private isInitialized = false;

  private config: AuraEngineConfig = {
    isEnabled: true,
    isBypassed: false,
    soundBoost: 1.0,         // 100% to 200% (1.0 to 2.0)
    vocalClarity: 0.5,       // 0.0 to 1.0
    bassDepth: 0.5,          // 0.0 to 1.0
    spatialWidth: 1.0,       // 0.0 to 2.0
    is8dActive: false,
    presetId: 'off',
    profile: 'auto',
  };

  constructor() {
    this.loadPersistedSettings();
  }

  /**
   * Load persisted settings from AsyncStorage
   */
  public async loadPersistedSettings(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const [
        savedPreset,
        savedBoost,
        savedVocal,
        savedBass,
        savedSpatial,
        saved8D,
        savedBypass,
        savedProfile,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PRESET),
        AsyncStorage.getItem(STORAGE_KEYS.BOOST),
        AsyncStorage.getItem(STORAGE_KEYS.VOCAL_CLARITY),
        AsyncStorage.getItem(STORAGE_KEYS.BASS_DEPTH),
        AsyncStorage.getItem(STORAGE_KEYS.SPATIAL_WIDTH),
        AsyncStorage.getItem(STORAGE_KEYS.IS_8D),
        AsyncStorage.getItem(STORAGE_KEYS.BYPASS),
        AsyncStorage.getItem(STORAGE_KEYS.PROFILE),
      ]);

      if (savedPreset) this.config.presetId = savedPreset;
      if (savedBoost) this.config.soundBoost = parseFloat(savedBoost) || 1.0;
      if (savedVocal) this.config.vocalClarity = parseFloat(savedVocal) || 0.5;
      if (savedBass) this.config.bassDepth = parseFloat(savedBass) || 0.5;
      if (savedSpatial) this.config.spatialWidth = parseFloat(savedSpatial) || 1.0;
      if (saved8D) this.config.is8dActive = saved8D === 'true';
      if (savedBypass) this.config.isBypassed = savedBypass === 'true';
      if (savedProfile) this.config.profile = savedProfile as AuraAudioProfile;

      this.isInitialized = true;
      this.syncToActiveOutputs();
    } catch (e) {
      console.warn('[AuraSoundEngine] Error loading persisted settings:', e);
    }
  }

  /**
   * Attach active expo-audio player instance
   */
  public attachPlayer(player: AudioPlayer | null): void {
    this.activePlayer = player;
    this.syncToActiveOutputs();
  }

  /**
   * Attach web audio element
   */
  public attachWebElement(element: HTMLMediaElement): void {
    if (Platform.OS === 'web') {
      auraSoundEngineWeb.attachToElement(element);
      auraSoundEngineWeb.applyConfig(this.config);
    }
  }

  /**
   * Get current engine configuration
   */
  public getConfig(): AuraEngineConfig {
    return { ...this.config };
  }

  /**
   * Update full or partial engine configuration
   */
  public setConfig(partial: Partial<AuraEngineConfig>): void {
    this.config = { ...this.config, ...partial };
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  /**
   * Set Studio Sound Preset
   */
  public setPreset(presetId: SoundPreset): void {
    const preset = getAuraPreset(presetId);
    this.config.presetId = presetId;
    // Set preset defaults for vocal, bass, and width
    if (presetId !== 'off') {
      this.config.vocalClarity = preset.vocalWeight;
      this.config.bassDepth = preset.bassWeight;
      this.config.spatialWidth = preset.spatialWidth;
      this.config.isBypassed = false;
    }
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  /**
   * Set Super Boost (1.0 = 100%, 2.0 = 200%)
   */
  public setBoost(boost: number): void {
    this.config.soundBoost = Math.max(1.0, Math.min(2.0, boost));
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  /**
   * Set Vocal Clarity presence (0.0 to 1.0)
   */
  public setVocalClarity(vocal: number): void {
    this.config.vocalClarity = Math.max(0.0, Math.min(1.0, vocal));
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  /**
   * Set Dynamic Bass Depth (0.0 to 1.0)
   */
  public setBassDepth(bass: number): void {
    this.config.bassDepth = Math.max(0.0, Math.min(1.0, bass));
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  /**
   * Set Spatial Width (0.0 to 2.0)
   */
  public setSpatialWidth(width: number): void {
    this.config.spatialWidth = Math.max(0.0, Math.min(2.0, width));
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  /**
   * Toggle 8D Spatial rotation
   */
  public set8DActive(active: boolean): void {
    this.config.is8dActive = active;
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  /**
   * Set Adaptive Audio Profile
   */
  public setProfile(profile: AuraAudioProfile): void {
    this.config.profile = profile;
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  /**
   * Set or toggle Instant A/B Bypass
   */
  public setBypassed(bypassed: boolean): void {
    this.config.isBypassed = bypassed;
    this.syncToActiveOutputs();
    this.persistConfig();
  }

  public toggleBypass(): boolean {
    this.setBypassed(!this.config.isBypassed);
    return this.config.isBypassed;
  }

  /**
   * Dispatch parameters to Native iOS Audio Tap or Web Audio Graph
   */
  private syncToActiveOutputs(): void {
    const preset = getAuraPreset(this.config.presetId);
    
    // Map profile string to enum integer for Objective-C:
    // Auto = 0, Speaker = 1, Headphones = 2, AirPods = 3
    let profileInt = 0;
    if (this.config.profile === 'speaker') profileInt = 1;
    else if (this.config.profile === 'headphones') profileInt = 2;
    else if (this.config.profile === 'airpods') profileInt = 3;

    const payload = {
      isEnabled: this.config.isEnabled,
      isBypassed: this.config.isBypassed,
      soundBoost: this.config.soundBoost,
      vocalClarity: this.config.vocalClarity,
      bassDepth: this.config.bassDepth,
      spatialWidth: this.config.spatialWidth,
      is8dActive: this.config.is8dActive,
      presetId: this.config.presetId,
      profile: profileInt,
      eqGains: preset.eq10Bands,
    };

    // 1. Dispatch to Native iOS AudioPlayer
    if (Platform.OS === 'ios' && this.activePlayer) {
      try {
        const playerAny = this.activePlayer as any;
        if (typeof playerAny.setAuraEngineConfig === 'function') {
          playerAny.setAuraEngineConfig(payload);
        }
      } catch (err) {
        console.warn('[AuraSoundEngine] Error pushing to native AudioPlayer:', err);
      }
    }

    // 2. Dispatch to Web Audio Engine
    if (Platform.OS === 'web') {
      auraSoundEngineWeb.applyConfig(this.config);
    }
  }

  private persistConfig(): void {
    AsyncStorage.multiSet([
      [STORAGE_KEYS.PRESET, this.config.presetId],
      [STORAGE_KEYS.BOOST, this.config.soundBoost.toString()],
      [STORAGE_KEYS.VOCAL_CLARITY, this.config.vocalClarity.toString()],
      [STORAGE_KEYS.BASS_DEPTH, this.config.bassDepth.toString()],
      [STORAGE_KEYS.SPATIAL_WIDTH, this.config.spatialWidth.toString()],
      [STORAGE_KEYS.IS_8D, this.config.is8dActive ? 'true' : 'false'],
      [STORAGE_KEYS.BYPASS, this.config.isBypassed ? 'true' : 'false'],
      [STORAGE_KEYS.PROFILE, this.config.profile],
    ]).catch((err) => {
      console.warn('[AuraSoundEngine] Failed to persist config:', err);
    });
  }
}

export const auraSoundEngine = new AuraSoundEngineService();
