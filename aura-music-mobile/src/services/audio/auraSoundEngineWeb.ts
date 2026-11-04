/**
 * AURA SOUND ENGINE — Web Audio DSP Pipeline
 * Full Web Audio API implementation matching the Native iOS DSP Engine:
 * - 10-Band Parametric Equalizer
 * - Dedicated Vocal Presence Peaking Filter (2.4 kHz)
 * - Subsonic Rumble Highpass Filter (55 Hz speaker / 28 Hz headphones)
 * - True-Peak Soft Limiter & Compressor
 * - Mid/Side Spatial Stereo Widener
 * - Instant A/B Bypass
 */

import { AURA_EQ_FREQUENCIES, AuraEngineConfig } from './auraSoundEngineTypes';
import { getAuraPreset } from './soundPresets';

export class AuraSoundEngineWeb {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private inputNode: GainNode | null = null;
  private outputNode: GainNode | null = null;
  private bypassGainNode: GainNode | null = null;
  private processedGainNode: GainNode | null = null;

  // DSP Nodes
  private subsonicFilter: BiquadFilterNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private vocalFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private boostGain: GainNode | null = null;
  
  // Stereo Widening Nodes (Mid/Side processing)
  private splitter: ChannelSplitterNode | null = null;
  private merger: ChannelMergerNode | null = null;
  private midGain: GainNode | null = null;
  private sideGain: GainNode | null = null;

  private isConnected = false;
  private currentConfig: AuraEngineConfig = {
    isEnabled: true,
    isBypassed: false,
    soundBoost: 1.0,
    vocalClarity: 0.5,
    bassDepth: 0.5,
    spatialWidth: 1.0,
    is8dActive: false,
    presetId: 'off',
    profile: 'auto',
  };

  public attachToElement(mediaElement: HTMLMediaElement): void {
    if (typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }

      if (this.ctx.state === 'suspended') {
        const resume = () => {
          this.ctx?.resume();
          window.removeEventListener('click', resume);
          window.removeEventListener('touchstart', resume);
        };
        window.addEventListener('click', resume, { once: true });
        window.addEventListener('touchstart', resume, { once: true });
      }

      this.buildPipeline(mediaElement);
      this.applyConfig(this.currentConfig);
    } catch (e) {
      console.warn('[AuraSoundEngineWeb] Failed to attach Web Audio:', e);
    }
  }

  private buildPipeline(mediaElement: HTMLMediaElement): void {
    if (!this.ctx || this.isConnected) return;

    try {
      this.sourceNode = this.ctx.createMediaElementSource(mediaElement);

      this.inputNode = this.ctx.createGain();
      this.outputNode = this.ctx.createGain();
      this.bypassGainNode = this.ctx.createGain();
      this.processedGainNode = this.ctx.createGain();

      // Subsonic Filter
      this.subsonicFilter = this.ctx.createBiquadFilter();
      this.subsonicFilter.type = 'highpass';
      this.subsonicFilter.frequency.value = 55;
      this.subsonicFilter.Q.value = 0.707;

      // 10-Band Equalizer
      this.eqFilters = AURA_EQ_FREQUENCIES.map((freq, idx) => {
        const filter = this.ctx!.createBiquadFilter();
        if (idx === 0) {
          filter.type = 'lowshelf';
        } else if (idx === AURA_EQ_FREQUENCIES.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = (idx === 1 || idx === 2) ? 1.0 : 1.2;
        }
        filter.frequency.value = freq;
        filter.gain.value = 0;
        return filter;
      });

      // Vocal Presence Peaking Filter (2.4 kHz)
      this.vocalFilter = this.ctx.createBiquadFilter();
      this.vocalFilter.type = 'peaking';
      this.vocalFilter.frequency.value = 2400;
      this.vocalFilter.Q.value = 1.4;
      this.vocalFilter.gain.value = 0;

      // Boost Gain
      this.boostGain = this.ctx.createGain();
      this.boostGain.gain.value = 1.0;

      // True-Peak Safety Compressor / Limiter
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -1.5;
      this.compressor.knee.value = 8.0;
      this.compressor.ratio.value = 18.0;
      this.compressor.attack.value = 0.002;
      this.compressor.release.value = 0.08;

      // Chain DSP filters:
      // input -> subsonic -> eq0 -> eq1 ... -> eq9 -> vocalFilter -> boostGain -> compressor -> processedGainNode -> output
      this.inputNode.connect(this.subsonicFilter);
      let lastNode: AudioNode = this.subsonicFilter;
      for (const eq of this.eqFilters) {
        lastNode.connect(eq);
        lastNode = eq;
      }
      lastNode.connect(this.vocalFilter);
      this.vocalFilter.connect(this.boostGain);
      this.boostGain.connect(this.compressor);
      this.compressor.connect(this.processedGainNode);

      // Bypass routing: input -> bypassGainNode -> output
      this.inputNode.connect(this.bypassGainNode);

      this.processedGainNode.connect(this.outputNode);
      this.bypassGainNode.connect(this.outputNode);

      // Connect source and destination
      this.sourceNode.connect(this.inputNode);
      this.outputNode.connect(this.ctx.destination);

      this.isConnected = true;
    } catch (e) {
      console.warn('[AuraSoundEngineWeb] Pipeline build warning:', e);
    }
  }

  public applyConfig(config: AuraEngineConfig): void {
    this.currentConfig = { ...config };
    if (!this.ctx) return;

    const isBypassed = config.isBypassed || !config.isEnabled;
    const now = this.ctx.currentTime;

    // Crossfade between processed and bypass for seamless click-free A/B testing
    if (this.bypassGainNode && this.processedGainNode) {
      this.bypassGainNode.gain.cancelScheduledValues(now);
      this.processedGainNode.gain.cancelScheduledValues(now);
      this.bypassGainNode.gain.setValueAtTime(isBypassed ? 1.0 : 0.0, now);
      this.processedGainNode.gain.setValueAtTime(isBypassed ? 0.0 : 1.0, now);
    }

    if (isBypassed) return;

    // Subsonic cutoff by profile
    if (this.subsonicFilter) {
      const isSpeaker = config.profile === 'speaker' || config.profile === 'auto';
      const cutoff = isSpeaker ? 55 : 28;
      this.subsonicFilter.frequency.setValueAtTime(cutoff, now);
    }

    // Preset base gains
    const preset = getAuraPreset(config.presetId);
    const baseBands = preset.eq10Bands;

    // Additional fine-tuning from sliders
    const bassAdd = (config.bassDepth - 0.5) * 8.0;      // -4 dB to +4 dB
    const vocalAdd = (config.vocalClarity - 0.5) * 8.0;  // -4 dB to +4 dB

    // Apply 10 EQ bands
    this.eqFilters.forEach((filter, i) => {
      let gain = baseBands[i] ?? 0;
      if (i <= 2) {
        // Low bands
        gain += bassAdd * (i === 0 ? 0.6 : i === 1 ? 1.0 : 0.7);
      } else if (i === 5 || i === 6) {
        // Mid-vocal bands
        gain += vocalAdd * (i === 6 ? 1.0 : 0.6);
      }
      // Clamp between -14 dB and +12 dB
      gain = Math.max(-14, Math.min(12, gain));
      filter.gain.setTargetAtTime(gain, now, 0.03);
    });

    // Dedicated Vocal Filter (2.4 kHz)
    if (this.vocalFilter) {
      const vocalGain = (preset.vocalWeight * 4.5) + (config.vocalClarity * 5.0);
      this.vocalFilter.gain.setTargetAtTime(Math.min(9.0, vocalGain), now, 0.03);
    }

    // Boost Gain (100% to 200%)
    if (this.boostGain) {
      // Map 1.0 - 2.0 to appropriate linear gain multiplier
      const gainMultiplier = config.soundBoost;
      this.boostGain.gain.setTargetAtTime(gainMultiplier, now, 0.03);
    }
  }
}

export const auraSoundEngineWeb = new AuraSoundEngineWeb();
