import { Platform } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import { Song } from "@/types/music";
import { MusicApi } from "@/services/api/musicApi";
import { FileManager } from "@/services/storage/fileManager";
import { auraSoundEngine } from "@/services/audio/auraSoundEngine";
import { updateSongLastPlayed } from "@/database/db";
import {
  SOUND_PRESET_CONFIG,
  type SoundPreset,
} from "@/services/audio/soundPresets";
import { getOfflineAudioBlob } from "@/database/webOfflineStorage";

export type PlaybackStatusListener = (status: {
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  isBuffering: boolean;
  didJustFinish: boolean;
  error?: string;
}) => void;

class AudioService {
  private sound: AudioPlayer | null = null;
  private soundSubscription: { remove: () => void } | null = null;
  private webAudio: HTMLAudioElement | null = null;
  private currentSong: Song | null = null;
  private isInitialized = false;
  private listeners: Set<PlaybackStatusListener> = new Set();
  private lastKnownPosition = 0;
  private lastKnownDuration = 0;
  private isAudioPlaying = false;

  // Web-only Web Audio graph for the sound-preset (EQ) engine.
  private webCtx: any = null;
  private webGraph: {
    preGain: any;
    bands: any[];
    compressor: any;
    limiter: any;
    postGain: any;
    panner: any;
  } | null = null;
  private rotationOsc: any = null;
  private rotationGain: any = null;
  private soundPreset: SoundPreset = "off";
  private boost = 1;

  // Progressive worker streams are chunked without a Content-Length, which
  // makes the browser report seekable=[0,0] and restarts playback on any
  // currentTime write. The first seek swaps in a local blob of the same audio.
  private blobSeek = { url: null as string | null, pending: null as number | null, busy: false };

  // One automatic retry per song when the native player fails to load a stream
  // (expired provider URL, tunnel hiccup) instead of leaving playback dead.
  private nativeRetriedSongId: string | null = null;

  public subscribe(listener: PlaybackStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(data: {
    isPlaying: boolean;
    positionMillis: number;
    durationMillis: number;
    isBuffering: boolean;
    didJustFinish: boolean;
    error?: string;
  }): void {
    this.isAudioPlaying = data.isPlaying;
    this.lastKnownPosition = data.positionMillis;
    this.lastKnownDuration = data.durationMillis;
    this.listeners.forEach((l) => l(data));
  }

  /**
   * Initialize audio session (Native iOS/Android background playback)
   */
  public async initAudioSession(): Promise<void> {
    if (this.isInitialized) return;
    try {
      if (Platform.OS !== "web") {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          // Lock-screen controls only attach to the player in a non-mixing mode.
          interruptionMode: "doNotMix",
        });
        console.log("[AudioService] Native iOS background audio session initialized");
      }
      this.isInitialized = true;
    } catch (err) {
      console.warn("[AudioService] Failed to set audio mode:", err);
    }
  }

  /**
   * Builds the Web Audio chain once: source → pre-gain → 5 EQ bands →
   * compressor → limiter → post-gain → stereo panner → speakers.
   * Returns false on native (expo-audio exposes no DSP) or when unavailable.
   */
  private ensureWebGraph(): boolean {
    if (this.webGraph) return true;
    if (Platform.OS !== "web" || typeof window === "undefined" || !this.webAudio) {
      return false;
    }
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(this.webAudio);
      const preGain = ctx.createGain();
      const bands = Array.from({ length: 5 }, () => ctx.createBiquadFilter());
      const compressor = ctx.createDynamicsCompressor();
      const limiter = ctx.createDynamicsCompressor();
      const postGain = ctx.createGain();
      const panner = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;

      let node: any = source;
      for (const next of [preGain, ...bands, compressor, limiter, postGain, ...(panner ? [panner] : [])]) {
        node.connect(next);
        node = next;
      }
      node.connect(ctx.destination);

      this.webCtx = ctx;
      this.webGraph = { preGain, bands, compressor, limiter, postGain, panner };
      this.applyPreset(this.soundPreset);
      return true;
    } catch (err) {
      console.warn("[AudioService] Web Audio graph unavailable:", err);
      return false;
    }
  }

  private applyPreset(preset: SoundPreset): void {
    const ctx = this.webCtx;
    const graph = this.webGraph;
    if (!ctx || !graph) return;

    const cfg = SOUND_PRESET_CONFIG[preset] ?? SOUND_PRESET_CONFIG.off;
    const now = ctx.currentTime;
    const ramp = 0.04; // 40 ms — click-free switching

    graph.preGain.gain.setTargetAtTime(1.25, now, ramp);

    graph.bands.forEach((band: any, i: number) => {
      const spec = cfg.bands[i];
      if (!spec) return;
      if (band.type !== spec.type) band.type = spec.type;
      band.frequency.setTargetAtTime(spec.freq, now, ramp);
      band.gain.setTargetAtTime(spec.gain, now, ramp);
      if (spec.Q) band.Q.setTargetAtTime(spec.Q, now, ramp);
    });

    graph.compressor.threshold.setTargetAtTime(cfg.comp.threshold, now, ramp);
    graph.compressor.knee.setTargetAtTime(14, now, ramp);
    graph.compressor.ratio.setTargetAtTime(cfg.comp.ratio, now, ramp);
    graph.compressor.attack.setTargetAtTime(cfg.comp.attack, now, ramp);
    graph.compressor.release.setTargetAtTime(cfg.comp.release, now, ramp);

    // Brick-wall limiter so boosted presets never clip.
    graph.limiter.threshold.setTargetAtTime(-0.05, now, ramp);
    graph.limiter.knee.setTargetAtTime(10, now, ramp);
    graph.limiter.ratio.setTargetAtTime(20, now, ramp);
    graph.limiter.attack.setTargetAtTime(0.001, now, ramp);
    graph.limiter.release.setTargetAtTime(0.04, now, ramp);

    graph.postGain.gain.setTargetAtTime(cfg.postGain * this.boost * 1.35, now, ramp);

    if (preset === "spatial" && graph.panner) {
      this.startRotation();
    } else {
      this.stopRotation();
    }
  }

  private startRotation(): void {
    const ctx = this.webCtx;
    const panner = this.webGraph?.panner;
    if (!ctx || !panner || this.rotationOsc) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 0.65; // Noticeable, rapid 360° sweep every ~1.5 s
      gain.gain.value = 0.95;
      osc.connect(gain);
      gain.connect(panner.pan);
      osc.start();
      this.rotationOsc = osc;
      this.rotationGain = gain;
    } catch (err) {
      console.warn("[AudioService] 8D rotation failed:", err);
    }
  }

  private stopRotation(): void {
    const panner = this.webGraph?.panner;
    try {
      this.rotationOsc?.stop();
      this.rotationOsc?.disconnect();
      this.rotationGain?.disconnect();
    } catch {
      /* already stopped */
    }
    this.rotationOsc = null;
    this.rotationGain = null;
    if (this.webCtx && panner) {
      try {
        panner.pan.setTargetAtTime(0, this.webCtx.currentTime, 0.05);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Instant 8D Earbud Test: sweeps hard Left, then hard Right, then returns to Center.
   */
  public test8dSound(onStep?: (msg: string) => void): void {
    if (Platform.OS !== "web") {
      if (!this.sound || !this.isAudioPlaying) {
        onStep?.("شغّل أغنية أولاً لبدء اختبار القنوات 🎧");
        setTimeout(() => onStep?.(""), 2500);
        return;
      }
      onStep?.("🎧 جارٍ الاختبار: القناة اليسرى (Left Ear)");
      auraSoundEngine.set8DActive(true);
      setTimeout(() => {
        onStep?.("🎧 جارٍ الاختبار: القناة اليمنى (Right Ear)");
      }, 900);
      setTimeout(() => {
        onStep?.("✨ دوران محيطي سريع 360° نشط بين الأذنين");
      }, 1800);
      setTimeout(() => {
        onStep?.("");
      }, 3500);
      return;
    }

    const ctx = this.webCtx;
    const panner = this.webGraph?.panner;

    if (!ctx || !panner) {
      onStep?.("شغّل أغنية أولاً لبدء اختبار القنوات 🎧");
      setTimeout(() => onStep?.(""), 2500);
      return;
    }

    try {
      this.stopRotation();
      const t = ctx.currentTime;
      panner.pan.cancelScheduledValues(t);
      panner.pan.setValueAtTime(0, t);
      panner.pan.linearRampToValueAtTime(-0.95, t + 0.2);
      onStep?.("🎧 جارٍ الاختبار: القناة اليسرى فقط (Left Ear)");

      setTimeout(() => {
        if (!this.webCtx || !this.webGraph?.panner) return;
        const now = this.webCtx.currentTime;
        this.webGraph.panner.pan.linearRampToValueAtTime(0.95, now + 0.3);
        onStep?.("🎧 جارٍ الاختبار: القناة اليمنى فقط (Right Ear)");
      }, 900);

      setTimeout(() => {
        if (!this.webCtx || !this.webGraph?.panner) return;
        const now = this.webCtx.currentTime;
        this.webGraph.panner.pan.linearRampToValueAtTime(0, now + 0.3);
        onStep?.("✨ دوران محيطي سريع 360° نشط بين الأذنين");
        if (this.soundPreset === "spatial") {
          setTimeout(() => this.startRotation(), 400);
        }
      }, 1800);

      setTimeout(() => {
        onStep?.("");
      }, 3500);
    } catch (err) {
      console.warn("[audioService] test8dSound error:", err);
    }
  }

  /**
   * Applies a studio sound profile. Real DSP on web; on native expo-audio has no
   * equaliser, so the preference is kept but no audio is altered.
   */
  public async setSoundPreset(preset: SoundPreset): Promise<void> {
    this.soundPreset = preset;
    auraSoundEngine.setPreset(preset);
    if (Platform.OS !== "web") return;
    if (preset === "off" && this.boost === 1) {
      if (this.webGraph) this.applyPreset("off");
      return;
    }
    if (!this.ensureWebGraph()) return;
    try {
      if (this.webCtx?.state === "suspended") await this.webCtx.resume();
    } catch {
      /* resume requires a user gesture; next tap retries */
    }
    this.applyPreset(preset);
  }

  public getSoundPreset(): SoundPreset {
    return this.soundPreset;
  }

  /**
   * Super Boost: multiplies the post-gain of the Web Audio chain (100–200%).
   * The hard limiter after it keeps boosted output from clipping.
   */
  public async setBoost(boost: number): Promise<void> {
    this.boost = Math.max(1, Math.min(3.0, boost));
    auraSoundEngine.setBoost(this.boost);
    if (Platform.OS !== "web") return;
    if (!this.webGraph && this.soundPreset === "off" && this.boost === 1) return;
    if (!this.ensureWebGraph()) return;
    try {
      if (this.webCtx?.state === "suspended") await this.webCtx.resume();
    } catch {
      /* resumed on the next user gesture */
    }
    this.applyPreset(this.soundPreset);
  }

  public getBoost(): number {
    return this.boost;
  }

  /**
   * Determine playback source: prioritizes local downloaded file, falls back to stream URL
   */
  private async resolveAudioUri(song: Song): Promise<{ uri: string; isOffline: boolean }> {
    // 0. On Web: Check IndexedDB offline blob store
    if (Platform.OS === "web") {
      try {
        let blob = await getOfflineAudioBlob(song.id);
        if (!blob && song.localFilePath && song.localFilePath.startsWith("indexeddb://")) {
          const storedKey = song.localFilePath.replace("indexeddb://", "");
          blob = await getOfflineAudioBlob(storedKey);
        }
        if (blob && blob.size > 10000) {
          const blobUrl = URL.createObjectURL(blob);
          console.log(`[AudioService Web] ⚡ Playing 100% offline from IndexedDB blob (${blob.size} bytes): ${song.title}`);
          return { uri: blobUrl, isOffline: true };
        }
      } catch (err) {
        console.warn("[AudioService Web] Failed to read IndexedDB blob:", err);
      }
    }

    // 1. Check if song has a local downloaded file that exists on disk (Native)
    if (song.localFilePath && Platform.OS !== "web") {
      const isValid = await FileManager.verifyAudioFile(song.localFilePath);
      if (isValid) {
        console.log(`[AudioService] Playing offline from local file: ${song.localFilePath}`);
        return { uri: song.localFilePath, isOffline: true };
      }
    }

    // 2. Check if default file exists in audio storage directory
    if (Platform.OS !== "web") {
      const fallbackPath = FileManager.getAudioPath(song.id);
      const isValid = await FileManager.verifyAudioFile(fallbackPath);
      if (isValid) {
        console.log(`[AudioService] Playing offline from default path: ${fallbackPath}`);
        return { uri: fallbackPath, isOffline: true };
      }
    }

    // 3. Fallback to online streaming URL with instant direct 320kbps resolution
    const streamUrl = await MusicApi.resolveAudioStreamUrl(song);
    console.log(`[AudioService] Streaming online: ${song.title} -> ${streamUrl}`);
    return { uri: streamUrl, isOffline: false };
  }

  /**
   * Load and play a song
   */
  public async playSong(song: Song, initialPositionMillis = 0): Promise<boolean> {
    try {
      await this.initAudioSession();
      await this.stop();

      this.currentSong = song;
      this.notify({
        isPlaying: false,
        positionMillis: initialPositionMillis,
        durationMillis: (song.duration || 0) * 1000,
        isBuffering: true,
        didJustFinish: false,
      });

      const { uri } = await this.resolveAudioUri(song);

      // Web platform: Use HTML5 Audio directly for 100% browser compatibility
      if (Platform.OS === "web" && typeof window !== "undefined") {
        if (!this.webAudio) {
          this.webAudio = new window.Audio();
          // The stream endpoint sends Access-Control-Allow-Origin: *; asking for
          // it anonymously is what lets the Web Audio EQ read the samples.
          this.webAudio.crossOrigin = "anonymous";

          this.webAudio.addEventListener("timeupdate", () => {
            if (!this.webAudio) return;
            const dur = (this.webAudio.duration && !isNaN(this.webAudio.duration) && isFinite(this.webAudio.duration))
              ? this.webAudio.duration * 1000
              : (this.currentSong?.duration || 0) * 1000;

            this.notify({
              isPlaying: !this.webAudio.paused,
              positionMillis: (this.webAudio.currentTime || 0) * 1000,
              durationMillis: dur,
              isBuffering: false,
              didJustFinish: false,
            });

            this.updateWebPositionState();
          });

          this.webAudio.addEventListener("ended", () => {
            this.notify({
              isPlaying: false,
              positionMillis: (this.webAudio?.currentTime || 0) * 1000,
              durationMillis: (this.webAudio?.duration || 0) * 1000,
              isBuffering: false,
              didJustFinish: true,
            });
          });

          this.webAudio.addEventListener("waiting", () => {
            this.notify({
              isPlaying: false,
              positionMillis: (this.webAudio?.currentTime || 0) * 1000,
              durationMillis: (this.webAudio?.duration || 0) * 1000,
              isBuffering: true,
              didJustFinish: false,
            });
          });

          this.webAudio.addEventListener("playing", () => {
            this.notify({
              isPlaying: true,
              positionMillis: (this.webAudio?.currentTime || 0) * 1000,
              durationMillis: (this.webAudio?.duration || 0) * 1000,
              isBuffering: false,
              didJustFinish: false,
            });

            this.updateWebPositionState();
            if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "playing";
            }
          });

          this.webAudio.addEventListener("error", (e) => {
            console.warn("[AudioService] Web Audio Error:", e);
            this.notify({
              isPlaying: false,
              positionMillis: 0,
              durationMillis: 0,
              isBuffering: false,
              didJustFinish: false,
              error: "Failed to play audio stream",
            });
          });
        }

        const staleBlob = this.blobSeek.url;
        this.blobSeek.url = null;
        this.blobSeek.pending = null;
        if (staleBlob) URL.revokeObjectURL(staleBlob);

        this.webAudio.preload = "auto";
        this.webAudio.src = uri;
        this.webAudio.load();

        this.ensureWebGraph();
        try {
          if (this.webCtx?.state === "suspended") await this.webCtx.resume();
        } catch {
          /* refreshed on the next user tap */
        }
        if (initialPositionMillis > 0 && isFinite(initialPositionMillis)) {
          try {
            this.webAudio.currentTime = initialPositionMillis / 1000;
          } catch {}
        }

        try {
          await this.webAudio.play();
        } catch (playErr: any) {
          // If NotSupportedError occurs (CORS/crossOrigin anonymous rejection on redirect or CDN),
          // remove crossOrigin attribute and retry playing direct audio stream
          if (
            playErr?.name === "NotSupportedError" ||
            playErr?.message?.includes("supported source") ||
            (this.webAudio.error && this.webAudio.error.code === 4)
          ) {
            console.warn("[AudioService] crossOrigin issue or codec failure, retrying without crossOrigin...");
            try {
              this.webAudio.removeAttribute("crossOrigin");
              (this.webAudio as any).crossOrigin = null;
            } catch {}

            try {
              this.webAudio.src = uri;
              this.webAudio.load();
              await this.webAudio.play();
            } catch (retryOriginalErr) {
              console.warn("[AudioService] Retry original failed, trying local proxy fallback...");
              const fallbackUrl = MusicApi.getStreamUrl(song);
              this.webAudio.src = fallbackUrl;
              this.webAudio.load();
              await this.webAudio.play();
            }
          } else {
            throw playErr;
          }
        }

        updateSongLastPlayed(song.id).catch(() => {});
        this.updateWebMediaSession(song);
        return true;
      }

      // Native iOS / Android: progressive streaming with aggressive forward-buffering & lock-screen scrubbing
      const player = createAudioPlayer(
        { uri },
        {
          updateInterval: 250,
          downloadFirst: false,
          keepAudioSessionActive: true,
          // AVPlayer stalls the start while it fills this window; 5s starts
          // playback immediately and still absorbs network jitter.
          preferredForwardBufferDuration: 5,
        }
      );
      this.soundSubscription = player.addListener("playbackStatusUpdate", this.onPlaybackStatusUpdate);
      this.sound = player;
      auraSoundEngine.attachPlayer(player);

      if (initialPositionMillis > 0) {
        await player.seekTo(initialPositionMillis / 1000);
      }
      player.play();

      const songDurationSec =
        song.duration && isFinite(song.duration) && song.duration > 0
          ? Math.round(song.duration)
          : undefined;

      try {
        player.setActiveForLockScreen(
          true,
          {
            title: song.title,
            artist: song.artist,
            albumTitle: song.albumName || "Aura Music",
            artworkUrl: song.thumbnailUrl ?? undefined,
            duration: songDurationSec,
          } as any,
          {
            isLiveStream: false,
            showSeekForward: true,
            showSeekBackward: true,
            showNextTrack: true,
            showPreviousTrack: true,
            seekForwardIntervalSeconds: 15,
            seekBackwardIntervalSeconds: 15,
          }
        );
      } catch (err) {
        console.warn("[AudioService] lock screen controls unavailable:", err);
      }

      // Update play count in persistent DB
      updateSongLastPlayed(song.id).catch(() => {});

      return true;
    } catch (err: any) {
      console.error("[AudioService] playSong error:", err);
      this.notify({
        isPlaying: false,
        positionMillis: 0,
        durationMillis: 0,
        isBuffering: false,
        didJustFinish: false,
        error: err?.message || "Failed to load audio",
      });
      return false;
    }
  }

  private isCrossfading = false;
  private crossfadeTimer: any = null;

  /**
   * Professional Seamless DJ Crossfade between songs (overlapping fade-out / fade-in)
   */
  public async crossfadeToSong(nextSong: Song, durationSec = 3.5): Promise<boolean> {
    if (this.isCrossfading || !this.currentSong) {
      return this.playSong(nextSong);
    }
    this.isCrossfading = true;

    try {
      const { uri: nextUri } = await this.resolveAudioUri(nextSong);

      if (Platform.OS === "web" && typeof window !== "undefined") {
        const oldAudio = this.webAudio;
        const newAudio = new window.Audio();
        newAudio.crossOrigin = "anonymous";
        newAudio.preload = "auto";
        newAudio.src = nextUri;
        newAudio.volume = 0;
        await newAudio.play();

        const steps = 30;
        const stepMs = (durationSec * 1000) / steps;
        let step = 0;

        await new Promise<void>((resolve) => {
          this.crossfadeTimer = setInterval(() => {
            step++;
            const t = step / steps;
            const outVol = Math.cos((t * Math.PI) / 2);
            const inVol = Math.sin((t * Math.PI) / 2);

            if (oldAudio) oldAudio.volume = Math.max(0, Math.min(1, outVol));
            newAudio.volume = Math.max(0, Math.min(1, inVol));

            if (step >= steps) {
              clearInterval(this.crossfadeTimer);
              this.crossfadeTimer = null;
              resolve();
            }
          }, stepMs);
        });

        if (oldAudio) {
          try {
            oldAudio.pause();
            oldAudio.src = "";
          } catch {}
        }

        this.webAudio = newAudio;
        this.currentSong = nextSong;
        this.ensureWebGraph();
        this.updateWebMediaSession(nextSong);
        updateSongLastPlayed(nextSong.id).catch(() => {});
        this.isCrossfading = false;
        return true;
      }

      // Native iOS / Android Crossfade
      const oldPlayer = this.sound;
      const oldSub = this.soundSubscription;

      const nextPlayer = createAudioPlayer(
        { uri: nextUri },
        {
          updateInterval: 250,
          downloadFirst: false,
          keepAudioSessionActive: true,
          preferredForwardBufferDuration: 5,
        }
      );

      nextPlayer.volume = 0;
      nextPlayer.play();

      const steps = 30;
      const stepMs = (durationSec * 1000) / steps;
      let step = 0;

      await new Promise<void>((resolve) => {
        this.crossfadeTimer = setInterval(() => {
          step++;
          const t = step / steps;
          const outVol = Math.cos((t * Math.PI) / 2);
          const inVol = Math.sin((t * Math.PI) / 2);

          try {
            if (oldPlayer) oldPlayer.volume = Math.max(0, Math.min(1, outVol));
            nextPlayer.volume = Math.max(0, Math.min(1, inVol));
          } catch {}

          if (step >= steps) {
            clearInterval(this.crossfadeTimer);
            this.crossfadeTimer = null;
            resolve();
          }
        }, stepMs);
      });

      try {
        oldSub?.remove();
        oldPlayer?.pause();
        oldPlayer?.remove();
      } catch {}

      this.sound = nextPlayer;
      this.soundSubscription = nextPlayer.addListener("playbackStatusUpdate", this.onPlaybackStatusUpdate);
      auraSoundEngine.attachPlayer(nextPlayer);
      this.currentSong = nextSong;

      const songDurationSec =
        nextSong.duration && isFinite(nextSong.duration) && nextSong.duration > 0
          ? Math.round(nextSong.duration)
          : undefined;

      try {
        nextPlayer.setActiveForLockScreen(
          true,
          {
            title: nextSong.title,
            artist: nextSong.artist,
            albumTitle: nextSong.albumName || "Aura Music",
            artworkUrl: nextSong.thumbnailUrl ?? undefined,
            duration: songDurationSec,
          } as any,
          {
            isLiveStream: false,
            showSeekForward: true,
            showSeekBackward: true,
            showNextTrack: true,
            showPreviousTrack: true,
            seekForwardIntervalSeconds: 15,
            seekBackwardIntervalSeconds: 15,
          }
        );
      } catch {}

      updateSongLastPlayed(nextSong.id).catch(() => {});
      this.isCrossfading = false;
      return true;
    } catch (err) {
      console.warn("[AudioService] crossfade fallback to normal playSong:", err);
      this.isCrossfading = false;
      return this.playSong(nextSong);
    }
  }

  private onPlaybackStatusUpdate = (status: AudioStatus) => {
    if (status.error) {
      const failedSong = this.currentSong;
      if (
        Platform.OS !== "web" &&
        failedSong &&
        this.nativeRetriedSongId !== failedSong.id
      ) {
        this.nativeRetriedSongId = failedSong.id;
        console.warn("[AudioService] load failed, retrying stream once:", status.error);
        this.stop()
          .catch(() => {})
          .finally(() => {
            this.playSong(failedSong, 0).catch(() => {});
          });
        return;
      }
      this.notify({
        isPlaying: false,
        positionMillis: 0,
        durationMillis: 0,
        isBuffering: false,
        didJustFinish: false,
        error: status.error,
      });
      return;
    }

    const resolvedDur = status.duration && isFinite(status.duration) && status.duration > 0
      ? status.duration * 1000
      : (this.currentSong?.duration || 0) * 1000;

    // Refresh lock-screen duration if initial load reported 0
    if (Platform.OS !== "web" && this.sound && this.currentSong && resolvedDur > 0 && !this.lastKnownDuration) {
      try {
        this.sound.updateLockScreenMetadata({
          title: this.currentSong.title,
          artist: this.currentSong.artist,
          albumTitle: this.currentSong.albumName || "Aura Music",
          artworkUrl: this.currentSong.thumbnailUrl ?? undefined,
          duration: Math.round(resolvedDur / 1000),
        } as any);
      } catch {}
    }

    this.notify({
      isPlaying: status.playing,
      positionMillis: status.currentTime * 1000,
      durationMillis: resolvedDur,
      isBuffering: status.isBuffering,
      didJustFinish: status.didJustFinish,
    });
  };

  public async pause(): Promise<void> {
    if (Platform.OS === "web" && this.webAudio) {
      this.webAudio.pause();
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      return;
    }
    if (this.sound) {
      try {
        this.sound.pause();
      } catch (err) {
        console.warn("[AudioService] pause error:", err);
      }
    }
  }

  public async resume(): Promise<void> {
    if (Platform.OS === "web" && this.webAudio) {
      try {
        if (this.webCtx?.state === "suspended") await this.webCtx.resume();
        await this.webAudio.play();
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
      } catch (e) {
        console.warn("[AudioService] web resume error:", e);
      }
      return;
    }
    if (this.sound) {
      try {
        this.sound.play();
      } catch (err) {
        console.warn("[AudioService] resume error:", err);
      }
    }
  }

  public async togglePlay(): Promise<void> {
    if (this.isAudioPlaying) {
      await this.pause();
    } else {
      await this.resume();
    }
  }

  public async seekTo(positionMillis: number): Promise<void> {
    if (isNaN(positionMillis) || !isFinite(positionMillis) || positionMillis < 0) {
      return;
    }
    if (Platform.OS === "web" && this.webAudio) {
      const targetSec = positionMillis / 1000;
      if (this.isSeekableTo(this.webAudio, targetSec)) {
        try {
          this.webAudio.currentTime = targetSec;
        } catch (err) {
          console.warn("[AudioService Web] seekTo error:", err);
        }
        return;
      }
      await this.seekViaLocalBlob(targetSec);
      return;
    }
    if (this.sound) {
      try {
        await this.sound.seekTo(positionMillis / 1000, 0, 0);
      } catch (err) {
        console.warn("[AudioService] seekTo error:", err);
      }
    }
  }

  private isSeekableTo(el: HTMLAudioElement, targetSec: number): boolean {
    const ranges = el.seekable;
    if (!ranges || ranges.length === 0) return false;
    for (let i = 0; i < ranges.length; i++) {
      if (targetSec >= ranges.start(i) - 0.25 && targetSec <= ranges.end(i) + 0.25) return true;
    }
    return false;
  }

  private async seekViaLocalBlob(targetSec: number): Promise<void> {
    const el = this.webAudio;
    if (!el) return;
    if (this.blobSeek.busy) {
      this.blobSeek.pending = targetSec;
      return;
    }
    const src = el.currentSrc || el.src;
    if (!src || src.startsWith("blob:")) {
      try {
        el.currentTime = targetSec;
      } catch {
        /* ignore */
      }
      return;
    }
    this.blobSeek.busy = true;
    const wasPlaying = !el.paused;
    try {
      const res = await fetch(src, { cache: "force-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.size || blob.size > 64 * 1024 * 1024) {
        throw new Error(`unusable blob (${blob.size} bytes)`);
      }
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          el.removeEventListener("loadedmetadata", ok);
          el.removeEventListener("error", fail);
          clearTimeout(timer);
        };
        const ok = () => {
          cleanup();
          resolve();
        };
        const fail = () => {
          cleanup();
          reject(new Error("blob audio failed to load"));
        };
        const timer = setTimeout(ok, 4000);
        el.addEventListener("loadedmetadata", ok);
        el.addEventListener("error", fail);
        el.src = url;
      });
      const previous = this.blobSeek.url;
      this.blobSeek.url = url;
      const duration = isFinite(el.duration) ? el.duration : 0;
      el.currentTime = duration > 0 ? Math.min(duration - 0.05, targetSec) : targetSec;
      if (wasPlaying) await el.play().catch(() => {});
      if (previous) URL.revokeObjectURL(previous);
    } catch (err: any) {
      console.warn("[AudioService Web] blob seek fallback failed:", err?.message || err);
      try {
        el.currentTime = targetSec;
      } catch {
        /* ignore */
      }
    } finally {
      const queued = this.blobSeek.pending;
      this.blobSeek.pending = null;
      this.blobSeek.busy = false;
      if (queued != null) void this.seekTo(queued * 1000);
    }
  }

  public async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, volume));
    if (Platform.OS === "web" && this.webAudio) {
      this.webAudio.volume = clamped;
      return;
    }
    if (this.sound) {
      try {
        this.sound.volume = clamped;
      } catch (err) {
        console.warn("[AudioService] setVolume error:", err);
      }
    }
  }

  public async setRate(rate: number): Promise<void> {
    if (Platform.OS === "web" && this.webAudio) {
      this.webAudio.playbackRate = rate;
      return;
    }
    if (this.sound) {
      try {
        this.sound.shouldCorrectPitch = true;
        this.sound.setPlaybackRate(rate);
      } catch (err) {
        console.warn("[AudioService] setRate error:", err);
      }
    }
  }

  public async stop(): Promise<void> {
    if (Platform.OS === "web" && this.webAudio) {
      try {
        this.webAudio.pause();
        this.webAudio.src = "";
        if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "none";
        }
      } catch {
        /* ignore */
      }
    }
    if (this.sound) {
      try {
        this.soundSubscription?.remove();
        this.sound.pause();
        this.sound.remove();
      } catch {
        /* ignore */
      }
      this.soundSubscription = null;
      this.sound = null;
      auraSoundEngine.attachPlayer(null);
    }
  }

  public getCurrentSong(): Song | null {
    return this.currentSong;
  }

  public getPosition(): number {
    return this.lastKnownPosition;
  }

  public getDuration(): number {
    return this.lastKnownDuration;
  }

  private updateWebMediaSession(song: Song): void {
    if (Platform.OS !== "web" || typeof window === "undefined" || !("mediaSession" in navigator)) return;

    try {
      const artworkUri = song.thumbnailUrl || (song.youtubeVideoId ? `https://i.ytimg.com/vi/${song.youtubeVideoId}/hqdefault.jpg` : "");
      navigator.mediaSession.metadata = new (window as any).MediaMetadata({
        title: song.title,
        artist: song.artist || "Aura Music",
        album: song.albumName || "Aura Music",
        artwork: artworkUri
          ? [
              { src: artworkUri, sizes: "96x96", type: "image/jpeg" },
              { src: artworkUri, sizes: "256x256", type: "image/jpeg" },
              { src: artworkUri, sizes: "512x512", type: "image/jpeg" },
            ]
          : [],
      });

      navigator.mediaSession.playbackState = "playing";

      const handlers: Record<string, (details: any) => void> = {
        play: () => this.resume(),
        pause: () => this.pause(),
        seekto: (details: any) => {
          if (details.seekTime !== undefined && isFinite(details.seekTime)) {
            this.seekTo(details.seekTime * 1000);
          }
        },
        seekbackward: (details: any) => {
          const skip = (details.seekOffset || 10) * 1000;
          const curr = (this.webAudio?.currentTime || 0) * 1000;
          this.seekTo(Math.max(0, curr - skip));
        },
        seekforward: (details: any) => {
          const skip = (details.seekOffset || 10) * 1000;
          const curr = (this.webAudio?.currentTime || 0) * 1000;
          const dur = (this.currentSong?.duration || 240) * 1000;
          this.seekTo(Math.min(dur, curr + skip));
        },
        previoustrack: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { usePlayerStore } = require("@/store/usePlayerStore");
            usePlayerStore.getState().playPrevious();
          } catch {}
        },
        nexttrack: () => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { usePlayerStore } = require("@/store/usePlayerStore");
            usePlayerStore.getState().playNext();
          } catch {}
        },
      };

      for (const [action, fn] of Object.entries(handlers)) {
        try {
          navigator.mediaSession.setActionHandler(action as any, fn);
        } catch {}
      }

      this.updateWebPositionState();
    } catch (err) {
      console.warn("[AudioService] Failed to set MediaSession:", err);
    }
  }

  private updateWebPositionState(): void {
    if (Platform.OS !== "web" || typeof window === "undefined" || !("mediaSession" in navigator)) return;
    if (!("setPositionState" in navigator.mediaSession)) return;

    try {
      if (!this.webAudio) return;
      const audioDur = this.webAudio.duration;
      // CRUCIAL: Duration MUST be a finite, positive number to disable the "LIVE" badge on iOS lock screen!
      const validDuration =
        audioDur && isFinite(audioDur) && audioDur > 0
          ? audioDur
          : this.currentSong?.duration && isFinite(this.currentSong.duration) && this.currentSong.duration > 0
          ? this.currentSong.duration
          : 210;

      const validPosition = Math.min(
        validDuration,
        Math.max(0, isFinite(this.webAudio.currentTime) ? this.webAudio.currentTime : 0)
      );

      navigator.mediaSession.setPositionState({
        duration: validDuration,
        playbackRate: this.webAudio.playbackRate || 1,
        position: validPosition,
      });
    } catch {}
  }

  public isPlaying(): boolean {
    return this.isAudioPlaying;
  }
}

export const audioService = new AudioService();
