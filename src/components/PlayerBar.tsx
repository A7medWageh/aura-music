"use client";

import {
  Play, Pause, SkipForward, SkipBack, Shuffle,
  Repeat, Volume2, VolumeX, Heart, DownloadCloud,
  ChevronDown, ListMusic, Share2, Crown,
  Settings, Music2, FileText, Sparkles, Sliders, Waves, Zap, Shield, Headphones,
  RotateCcw, RotateCw, Maximize2, Minimize2
} from "lucide-react";
import { usePlayer } from "@/state/playerContext";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getProxyUrl } from "@/utils/media";
import { PremiumModal } from "./PremiumModal";
import { downloadSong } from "@/services/offline/downloader";
import { upsertFavorite, removeFavorite, isFavoriteLocal } from "@/services/user/favoritesStore";
import { useToastStore } from "@/state/toastStore";
import { getLyrics, storeLyrics } from "@/offline/indexedDbCache";

// ─── Helpers ─────────────────────────────────────────────────────────
function fmtTime(s: number) {
  if (!s || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

// Persian/Pashto/Urdu-only letters: their presence means an Arabic song got a
// translation page instead of its own lyrics (old cached copies must be refetched).
const FOREIGN_ONLY = /[گچپژۈۉێەۍ]/g;
function looksForeign(text: string): boolean {
  if (!text) return false;
  const letters = text.match(/[ء-ي٠-ٯA-Za-z]/g);
  if (!letters || letters.length < 20) return false;
  const hits = text.match(FOREIGN_ONLY);
  return (hits ? hits.length : 0) / letters.length > 0.05;
}

// ─── Dynamic Color Extractor from album art (Strict Obsidian Dark Theme) ─
function useDominantColor(imageUrl: string | undefined) {
  const [colors, setColors] = useState({ bg1: "#0b0d13", bg2: "#050608", accent: "#00e5ff" });

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 16) {
          const rv = data[i], gv = data[i + 1], bv = data[i + 2];
          const brightness = (rv + gv + bv) / 3;
          if (brightness > 30 && brightness < 220) {
            r += rv; g += gv; b += bv; count++;
          }
        }
        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          const bg1 = "#090b10";
          const bg2 = "#040507";
          const isPurpleOrViolet = b > 115 && r > 85 && g < 115;
          let accent = "#00e5ff";
          if (!isPurpleOrViolet) {
            const max = Math.max(r, g, b);
            const scale = max > 0 ? 235 / max : 1;
            const hx = (v: number) => Math.min(255, Math.round(v * scale)).toString(16).padStart(2, "0");
            accent = `#${hx(r)}${hx(g)}${hx(b)}`;
          }
          setColors({ bg1, bg2, accent });
        }
      } catch { /* ignore */ }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  return colors;
}

// ─── Background Ambience Modes ───────────────────────────────────────
type BgMode = "calm" | "medium" | "epic";
const BG_MODES: { id: BgMode; label: string }[] = [
  { id: "calm", label: "هادئة" },
  { id: "medium", label: "متوسطة" },
  { id: "epic", label: "خرافية" },
];

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 229, 255];
}

// ─── Real Audio Analyser → energy (bass) per frame, no re-renders ────
function useAnalyserEnergy(getAnalyser: () => AnalyserNode | null, isPlaying: boolean, enabled = true) {
  const energyRef = useRef(0);
  useEffect(() => {
    if (!isPlaying || !enabled) { energyRef.current = 0; return; }
    let raf = 0;
    const bins = new Uint8Array(128);
    const tick = () => {
      const an = getAnalyser();
      if (an) {
        an.getByteFrequencyData(bins as any);
        let bass = 0;
        for (let i = 0; i < 8; i++) bass += bins[i];
        bass /= 8 * 255;
        energyRef.current = energyRef.current * 0.65 + bass * 0.35;
      } else {
        const t = performance.now() * 0.003;
        energyRef.current = 0.2 + 0.25 * Math.abs(Math.sin(t));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, isPlaying, enabled]);
  return energyRef;
}

// ─── Live spectrum visualizer (canvas, real audio data, zero layout reflow) ──────────────
function LiveVisualizer({
  getAnalyser, isPlaying, accent, isOpen = true,
}: {
  getAnalyser: () => AnalyserNode | null; isPlaying: boolean; accent: string; isOpen?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accent);
  accentRef.current = accent;
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      sizeRef.current = { w, h };
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const BARS = 42;
    const levels = new Float32Array(BARS);
    const bins = new Uint8Array(128);
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.05;
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) { raf = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, w, h);

      const analyser = getAnalyser();
      const [r, g, b] = hexToRgb(accentRef.current);
      const bw = w / BARS;
      const barW = bw * 0.62;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      for (let i = 0; i < BARS; i++) {
        let target: number;
        if (analyser && playingRef.current) {
          analyser.getByteFrequencyData(bins as any);
          const idx = Math.min(127, Math.floor(Math.pow(i / BARS, 1.35) * 96));
          target = bins[idx] / 255;
        } else if (playingRef.current) {
          target = 0.25 + 0.5 * Math.abs(Math.sin(t + i * 0.55)) * (0.6 + 0.4 * Math.sin(t * 0.3 + i));
        } else {
          target = 0.04;
        }
        levels[i] += (target - levels[i]) * (target > levels[i] ? 0.45 : 0.12);
        const bh = Math.max(2 * dpr, levels[i] * h);
        const grad = ctx.createLinearGradient(0, h, 0, h - bh);
        grad.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0.95)`);
        ctx.fillStyle = grad;
        const x = i * bw + (bw - barW) / 2;
        const rad = Math.min(barW / 2, 3 * dpr);
        ctx.beginPath();
        ctx.roundRect(x, h - bh, barW, bh, [rad, rad, 0, 0]);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, isOpen]);

  return (
    <div className="h-7 w-full px-2" style={{ willChange: "transform", transform: "translateZ(0)" }}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}

// ─── Drifting bokeh particle layer tinted by accent (zero layout reflow) ──────────────────
function AuroraParticles({
  accent, mode, isPlaying, energyRef, isOpen = true,
}: {
  accent: string; mode: BgMode; isPlaying: boolean; energyRef: { current: number }; isOpen?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      sizeRef.current = { w, h };
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const COUNTS = { calm: 14, medium: 28, epic: 48 };
    const count = COUNTS[mode];
    const [r, g, b] = hexToRgb(accent);

    const rnd = (a: number, z: number) => a + Math.random() * (z - a);
    const parts = Array.from({ length: count }, () => ({
      x: Math.random(), y: Math.random(),
      rad: rnd(1.5, mode === "epic" ? 9 : 6),
      vx: rnd(-0.00018, 0.00018), vy: rnd(-0.00032, -0.00006),
      alpha: rnd(0.05, 0.3), tw: rnd(0, Math.PI * 2),
    }));

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 0.016;
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) { raf = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, w, h);

      const energy = isPlaying && mode !== "calm" ? energyRef.current : 0;
      const boost = mode === "epic" ? 1 + energy * 1.6 : 1 + energy * 0.7;

      for (const p of parts) {
        p.x += p.vx * boost; p.y += p.vy * boost; p.tw += 0.02;
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        if (p.x < -0.05) p.x = 1.05; else if (p.x > 1.05) p.x = -0.05;
        const a = p.alpha * (0.7 + 0.3 * Math.sin(p.tw)) * boost;
        const rad = p.rad * dpr * (mode === "epic" ? 1 + energy * 0.9 : 1);
        const px = p.x * w, py = p.y * h;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, rad * 3);
        grad.addColorStop(0, `rgba(${r},${g},${b},${Math.min(0.6, a)})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, rad * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [accent, mode, isPlaying, energyRef, isOpen]);

  if (!isOpen) return null;

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ willChange: "transform", transform: "translateZ(0)" }} />;
}

// ─── Beat-synced glow: rAF writes style directly, zero re-renders ────
function BeatGlow({ accent, energyRef, enabled }: { accent: string; energyRef: { current: number }; enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const e = energyRef.current;
        el.style.opacity = String(0.28 + e * 0.65);
        el.style.transform = `scale(${1 + e * 0.22})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, energyRef]);

  if (!enabled) return null;

  return (
    <div
      ref={ref}
      className="absolute -inset-7 rounded-full pointer-events-none"
      style={{ background: `radial-gradient(circle, ${accent}66 0%, transparent 68%)`, willChange: "opacity, transform", transform: "translateZ(0)" }}
    />
  );
}

// ─── Seek Bar (Pro Zero-Latency Touch & Scrub Engine) ─────────────────
function SeekBar({
  progress, duration, onSeek, height = "h-1.5", rtl = false,
  accent = "#00e5ff", isPremium = true, onPremiumClick
}: {
  progress: number; duration: number; onSeek: (t: number) => void;
  height?: string; rtl?: boolean; accent?: string;
  isPremium?: boolean; onPremiumClick?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const calculateTime = useCallback((clientX: number) => {
    if (!barRef.current || !duration || duration <= 0) return 0;
    const rect = barRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = rtl
      ? (rect.right - clientX) / rect.width
      : (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, ratio));
    return clamped * duration;
  }, [duration, rtl]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPremium && onPremiumClick) {
      onPremiumClick();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    isDraggingRef.current = true;
    setIsDragging(true);

    const targetTime = calculateTime(e.clientX);
    setDragProgress(targetTime);
    onSeek(targetTime); // Instant seek on touch/click!
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const targetTime = calculateTime(e.clientX);
    setDragProgress(targetTime);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    isDraggingRef.current = false;
    setIsDragging(false);

    const targetTime = calculateTime(e.clientX);
    onSeek(targetTime); // Commit final scrubbed position
  };

  const displayProgress = isDragging ? dragProgress : progress;
  const pct = duration > 0 ? Math.max(0, Math.min(100, (displayProgress / duration) * 100)) : 0;

  return (
    <div
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative w-full py-3.5 -my-3.5 flex items-center cursor-pointer select-none touch-none group"
      dir={rtl ? "rtl" : "ltr"}
    >
      {/* Background track */}
      <div className={`relative w-full ${height} bg-white/15 rounded-full overflow-hidden transition-all duration-150 group-hover:h-2`}>
        <div className="absolute inset-0 bg-white/5 rounded-full" />
        {/* Filled progress bar */}
        <div
          className={`absolute inset-y-0 ${rtl ? "right-0" : "left-0"} rounded-full ${
            isDragging ? "transition-none" : "transition-all duration-100 ease-linear"
          }`}
          style={{ width: `${pct}%`, background: accent }}
        />
      </div>

      {/* Scrubber thumb handle */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white/80 transition-transform pointer-events-none ${
          isDragging ? "scale-125 opacity-100" : "scale-100 opacity-0 group-hover:opacity-100"
        }`}
        style={{
          background: accent,
          ...(rtl ? { right: `calc(${pct}% - 8px)` } : { left: `calc(${pct}% - 8px)` }),
          boxShadow: `0 0 12px ${accent}aa, 0 2px 6px rgba(0,0,0,0.8)`,
        }}
      />
    </div>
  );
}

// ─── Full Screen Player ───────────────────────────────────────────────
function FullPlayer({
  isOpen, onClose, isLiked, onLike, onDownload, accent,
  isPremium, setIsPremiumModalOpen, setPremiumFeatureName, showToast
}: {
  isOpen: boolean; onClose: () => void; isLiked: boolean;
  onLike: () => void; onDownload: () => void; accent: string;
  isPremium: boolean; setIsPremiumModalOpen: (v: boolean) => void; setPremiumFeatureName: (v: string) => void;
  showToast: (msg: string, type?: "normal" | "hq") => void;
}) {
  const { state, currentSong, togglePlay, next, prev, seekTo, setVolume, cycleRepeat, setShuffle, setHighQuality, setIsAiMix, soundPreset, setSoundPreset, soundBoost, setSoundBoost, is8dActive, setIs8dActive, test8dSound, getAnalyser } = usePlayer();
  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;
  const proxyArt = getProxyUrl(art);

  const [activeTab, setActiveTab] = useState("now"); // now | queue | audio | premium
  const [isBgPlayEnabled, setIsBgPlayEnabled] = useState(isPremium);

  // ── Background ambience mode (persisted) ──
  const [bgMode, setBgMode] = useState<BgMode>("medium");
  useEffect(() => {
    const saved = localStorage.getItem("aura_player_bg_mode") as BgMode | null;
    if (saved && ["calm", "medium", "epic"].includes(saved)) setBgMode(saved);
  }, []);
  const cycleBgMode = () => {
    const order: BgMode[] = ["calm", "medium", "epic"];
    const nextMode = order[(order.indexOf(bgMode) + 1) % order.length];
    setBgMode(nextMode);
    try { localStorage.setItem("aura_player_bg_mode", nextMode); } catch {}
    showToast(`الخلفية ${BG_MODES.find((m) => m.id === nextMode)?.label} ✨`);
  };
  const energyRef = useAnalyserEnergy(getAnalyser, state.isPlaying, isOpen);
  const orbBoost = bgMode === "calm" ? 0.45 : bgMode === "epic" ? 1.7 : 1;

  const skip15Back = useCallback(() => {
    seekTo(Math.max(0, state.currentTime - 15));
    showToast("رجوع 15 ثانية ⏪");
  }, [seekTo, state.currentTime, showToast]);

  const skip15Forward = useCallback(() => {
    seekTo(Math.min(state.duration, state.currentTime + 15));
    showToast("تقديم 15 ثانية ⏩");
  }, [seekTo, state.currentTime, state.duration, showToast]);

  // ── Lyrics State ──
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [syncedLyrics, setSyncedLyrics] = useState<{ timeMs: number; text: string }[] | null>(null);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [lyricsSource, setLyricsSource] = useState<string | null>(null);
  // Manual timing nudge (ms) for songs whose lyrics start early/late, kept per song.
  const [lyricOffset, setLyricOffset] = useState(0);
  const manualScrollUntilRef = useRef(0);

  const pauseAutoScroll = useCallback(() => {
    manualScrollUntilRef.current = Date.now() + 9000;
  }, []);

  const bumpLyricOffset = useCallback((delta: number) => {
    setLyricOffset((prev) => {
      const next = Math.max(-20000, Math.min(20000, prev + delta));
      if (currentSong?.songId) {
        try { localStorage.setItem(`aura:lyricOffset:${currentSong.songId}`, String(next)); } catch { /* private mode */ }
      }
      return next;
    });
  }, [currentSong?.songId]);

  useEffect(() => {
    setLyricOffset(0);
    if (!currentSong?.songId) return;
    try {
      const saved = localStorage.getItem(`aura:lyricOffset:${currentSong.songId}`);
      if (saved) setLyricOffset(parseInt(saved, 10) || 0);
    } catch { /* private mode */ }
  }, [currentSong?.songId]);

  // Standard LRC: [mm:ss.xx], repeated tags per line, and the [offset:] metadata
  // many files carry (ignoring it shifts every line and looks like bad sync).
  const parseLrc = (lrcString: string) => {
    const parsed: { timeMs: number; text: string }[] = [];
    let offsetMs = 0;
    const stamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    for (const line of (lrcString || "").split("\n")) {
      const meta = line.match(/^\[offset:\s*([+-]?\d+)\]/i);
      if (meta) {
        offsetMs = parseInt(meta[1], 10) || 0;
        continue;
      }
      const stamps = [...line.matchAll(stamp)];
      if (!stamps.length) continue;
      const text = line.replace(stamp, "").trim();
      if (!text) continue;
      for (const s of stamps) {
        const ms = s[3] ? parseInt(s[3].padEnd(3, "0").slice(0, 3), 10) : 0;
        parsed.push({ timeMs: Math.max(0, (parseInt(s[1], 10) * 60 + parseInt(s[2], 10)) * 1000 + ms - offsetMs), text });
      }
    }
    return parsed.sort((a, b) => a.timeMs - b.timeMs);
  };

  // 1. Immediately check offline IndexedDB cache when currentSong changes
  useEffect(() => {
    let cancelled = false;
    if (!currentSong?.songId) {
      setLyrics(null);
      setSyncedLyrics(null);
      return;
    }

    setLyrics(null);
    setSyncedLyrics(null);
    setLyricsSource(null);

    getLyrics(currentSong.songId).then((cached: any) => {
      if (cancelled || !cached) return;
      if (cached.syncedLyrics && Array.isArray(cached.syncedLyrics) && cached.syncedLyrics.length > 0) {
        if (looksForeign(cached.syncedLyrics.map((l: any) => l.text).join("\n"))) return;
        setSyncedLyrics(cached.syncedLyrics);
        setLyrics(cached.lyrics || null);
        setLyricsSource(cached.source || null);
      } else if (cached.rawSynced) {
        const parsed = parseLrc(cached.rawSynced);
        if (looksForeign(cached.rawSynced) || parsed.length === 0) return;
        setSyncedLyrics(parsed);
        setLyrics(cached.lyrics || null);
        setLyricsSource(cached.source || null);
      } else if (cached.lyrics && typeof cached.lyrics === "string") {
        if (looksForeign(cached.lyrics)) return;
        setLyrics(cached.lyrics);
        setSyncedLyrics(null);
        setLyricsSource(cached.source || null);
      } else if (Array.isArray(cached) && cached.length > 0) {
        setSyncedLyrics(cached);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [currentSong?.songId]);

  // 2. Fetch lyrics once from API only if not in cache, and save permanently offline
  useEffect(() => {
    if (activeTab === "lyrics" && currentSong && !lyrics && !syncedLyrics && !isLyricsLoading) {
      setIsLyricsLoading(true);

      getLyrics(currentSong.songId).then((cached: any) => {
        if (cached && (cached.syncedLyrics || cached.lyrics) && !looksForeign(typeof cached.lyrics === "string" ? cached.lyrics : "")) {
          if (cached.syncedLyrics && Array.isArray(cached.syncedLyrics) && cached.syncedLyrics.length > 0) {
            setSyncedLyrics(cached.syncedLyrics);
            setLyrics(cached.lyrics || null);
          } else if (cached.lyrics) {
            setLyrics(cached.lyrics);
            setSyncedLyrics(null);
          }
          setIsLyricsLoading(false);
          return;
        }

        const vid = currentSong.youtubeVideoId || currentSong.songId || "";
        const lyricParams = new URLSearchParams({
          trackName: currentSong.title,
          artistName: currentSong.artist || "",
          videoId: /^[a-zA-Z0-9_-]{11}$/.test(vid) ? vid : "",
        });
        if (state.duration > 0) lyricParams.set("duration", String(Math.round(state.duration)));
        const url = `/api/lyrics?${lyricParams.toString()}`;
        fetch(url)
          .then(r => r.json())
          .then(async (d) => {
            if (d.syncedLyrics) {
              const parsed = parseLrc(d.syncedLyrics);
              const cleanPlain = d.lyrics || parsed.map(p => p.text).join("\n");
              setSyncedLyrics(parsed.length > 0 ? parsed : null);
              setLyrics(cleanPlain);
              setLyricsSource(d.source || null);
              await storeLyrics(currentSong.songId, {
                lyrics: cleanPlain,
                syncedLyrics: parsed,
                rawSynced: d.syncedLyrics,
                source: d.source
              }).catch(() => {});
            } else if (d.lyrics) {
              const cleanText = d.lyrics
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .trim();
              setSyncedLyrics(null);
              setLyrics(cleanText);
              setLyricsSource(d.source || null);
              await storeLyrics(currentSong.songId, {
                lyrics: cleanText,
                syncedLyrics: null,
                source: d.source
              }).catch(() => {});
            } else {
              setSyncedLyrics(null);
              setLyrics("عذراً، لم نتمكن من العثور على كلمات هذه الأغنية.");
            }
          })
          .catch(() => setLyrics("حدث خطأ أثناء جلب الكلمات."))
          .finally(() => setIsLyricsLoading(false));
      }).catch(() => {
        setIsLyricsLoading(false);
      });
    }
  }, [activeTab, currentSong, lyrics, syncedLyrics, isLyricsLoading]);

  // ── Synced Lyrics Auto-scroll ──
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const currentTimeMs = state.currentTime * 1000;

  // Only highlight and auto-scroll when verified timecoded synced lyrics exist.
  // When only plain lyrics exist, display them in full readable format instead of erratic linear math drift.
  const effectiveSynced = useMemo(() => {
    if (syncedLyrics && Array.isArray(syncedLyrics) && syncedLyrics.length > 0) {
      return syncedLyrics;
    }
    return null;
  }, [syncedLyrics]);

  const activeLineIndex = useMemo(() => {
    if (!effectiveSynced) return -1;
    const pos = currentTimeMs - lyricOffset;
    return effectiveSynced.findIndex((line, i) => {
      const nextLine = effectiveSynced[i + 1];
      return pos >= line.timeMs && (!nextLine || pos < nextLine.timeMs);
    });
  }, [effectiveSynced, currentTimeMs, lyricOffset]);

  const activeLyricSnippet = useMemo(() => {
    if (!effectiveSynced || activeLineIndex === -1) return null;
    return effectiveSynced[activeLineIndex]?.text || null;
  }, [effectiveSynced, activeLineIndex]);

  useEffect(() => {
    if (activeTab !== "lyrics" || activeLineIndex === -1) return;
    // After the user scrolls by hand, hold the auto-scroll back so their reading
    // position isn't yanked away mid-swipe.
    if (Date.now() < manualScrollUntilRef.current) return;
    const activeElement = document.getElementById(`lyrics-line-${activeLineIndex}`);
    if (activeElement) {
      activeElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }
  }, [activeLineIndex, activeTab]);

  // Swipe down to close with zero-rerender direct GPU transform
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const inScrollerRef = useRef(false);
  const isDraggingRef = useRef(false);

  // Transition orchestration: keeps slide down silky smooth at 120fps
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      setIsTransitioning(true);
      if (containerRef.current) {
        containerRef.current.style.transition = "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)";
        containerRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      const timer = setTimeout(() => setIsTransitioning(false), 360);
      return () => clearTimeout(timer);
    } else {
      setIsTransitioning(true);
      if (containerRef.current) {
        containerRef.current.style.transition = "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)";
        containerRef.current.style.transform = "translate3d(0, 100%, 0)";
      }
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        setIsRendered(false);
      }, 360);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    inScrollerRef.current = !!(e.target as HTMLElement)?.closest?.("[data-scroll]");
    isDraggingRef.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (inScrollerRef.current || !containerRef.current) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      isDraggingRef.current = true;
      containerRef.current.style.transition = "none";
      containerRef.current.style.transform = `translate3d(0, ${dy}px, 0)`;
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (inScrollerRef.current || !containerRef.current) return;
    const dy = e.changedTouches[0].clientY - startY.current;
    isDraggingRef.current = false;
    containerRef.current.style.transition = "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)";
    if (dy > 110) {
      containerRef.current.style.transform = "translate3d(0, 100%, 0)";
      onClose();
    } else {
      containerRef.current.style.transform = "translate3d(0, 0, 0)";
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{
        pointerEvents: isOpen ? "auto" : "none",
        visibility: isOpen || isRendered ? "visible" : "hidden",
        background: "#08090d",
        transform: isOpen ? "translate3d(0, 0, 0)" : "translate3d(0, 100%, 0)",
        transition: isDraggingRef.current ? "none" : "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "transform",
        height: "100dvh",
        maxHeight: "100dvh",
        contain: "paint layout",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Aurora ambient background: breathing artwork + drifting accent orbs ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ contain: "strict", transform: "translateZ(0)" }}>
        <img
          src={proxyArt}
          alt=""
          className="w-full h-full object-cover scale-125"
          style={{
            filter: "blur(60px) brightness(0.32) saturate(1.35)",
            transform: "translateZ(0)",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
          onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }}
        />
        <motion.div
          className="absolute -top-28 -right-24 w-80 h-80 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${accent}33 0%, ${accent}12 40%, transparent 70%)`,
            opacity: 0.9 * orbBoost,
            willChange: "transform",
            transform: "translateZ(0)",
          }}
          animate={isOpen && !isTransitioning ? { x: [0, 60, 0], y: [0, 40, 0] } : undefined}
          transition={{ duration: bgMode === "epic" ? 7 : 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${accent}28 0%, ${accent}0e 45%, transparent 70%)`,
            opacity: 0.9 * orbBoost,
            willChange: "transform",
            transform: "translateZ(0)",
          }}
          animate={isOpen && !isTransitioning ? { x: [0, -50, 0], y: [0, -30, 0] } : undefined}
          transition={{ duration: bgMode === "epic" ? 9 : 13, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#090b10]/90 via-[#06070a]/95 to-[#040507]" />
        <AuroraParticles accent={accent} mode={bgMode} isPlaying={state.isPlaying} energyRef={energyRef} isOpen={isOpen && !isTransitioning} />
      </div>

        {/* ── Content ── */}
        <div
          className="relative z-10 flex flex-col h-full w-full max-w-sm mx-auto overflow-hidden"
          style={{
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
          }}
        >

        {/* Notch band: iOS draws the clock and battery inside the safe area, so the
            controls sit on a row *below* it instead of competing with the status bar. */}
        <div
          className="flex items-end justify-between shrink-0"
          style={{
            height: "calc(env(safe-area-inset-top, 0px) + 44px)",
            paddingBottom: "4px",
            paddingLeft: "max(14px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(14px, env(safe-area-inset-right, 0px))",
          }}
        >
          <button onClick={onClose} className="p-2 rounded-full bg-white/[0.06] border border-white/10 hover:bg-white/10 transition active:scale-90">
            <ChevronDown className="w-6 h-6 text-white" />
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={cycleBgMode}
              title="شكل الخلفية"
              className={`p-2.5 rounded-full border transition-all active:scale-90 ${bgMode === "epic"
                ? "bg-white/10 border-white/25 text-white shadow-[0_0_14px_rgba(255,255,255,0.15)]"
                : "bg-white/5 border-white/10 text-white/60 hover:text-white"}`}
            >
              <Sparkles className="w-5 h-5" style={bgMode !== "calm" ? { color: bgMode === "epic" ? accent : undefined } : undefined} />
            </button>
            <button
              onClick={() => {
                if (!isPremium) { setPremiumFeatureName("ميكس AI (الدي جي الذكي)"); setIsPremiumModalOpen(true); }
                else { setIsAiMix(!state.isAiMix); showToast(!state.isAiMix ? "تم تفعيل ميكس AI 🤖✨" : "تم إيقاف ميكس AI"); }
              }}
              title="ميكس AI"
              className={`relative p-2.5 rounded-full border transition-all active:scale-90 ${state.isAiMix ? "bg-white text-black border-white" : "bg-white/5 text-white/70 border-white/10"}`}
            >
              {!isPremium && <Crown className="w-3 h-3 text-amber-400 absolute -top-1 -right-1" />}
              <Sliders className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Title row (below the notch) */}
        <div className="flex items-center justify-center gap-2 shrink-0 pb-1">
          <p className="text-white/50 text-[11px] font-bold uppercase tracking-widest">يعزف الآن</p>
          {state.isHighQuality && (
            <span className="text-[10px] font-black text-cyan-300 flex items-center gap-1 bg-cyan-400/10 px-2.5 py-0.5 rounded-full border border-cyan-400/30 shadow-[0_0_12px_rgba(0,229,255,0.2)]">
              استوديو Master HQ 🎧
            </span>
          )}
        </div>

        {/* ═══════════ NOW PLAYING TAB ═══════════ */}
        {activeTab === "now" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5 pb-2 overflow-hidden min-h-0 w-full">

            {/* Album Art — immersive, with orbiting aurora ring */}
            <div className="w-full shrink min-h-0 flex items-center justify-center">
              <motion.div
                key={currentSong?.songId}
                initial={{ scale: 0.88, opacity: 0, rotate: -4 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 22 }}
                className="relative w-[min(76vw,34vh,290px)] aspect-square flex items-center justify-center mx-auto"
              >
                {bgMode !== "calm" && (
                  <BeatGlow accent={accent} energyRef={energyRef} enabled={state.isPlaying && isOpen && !isTransitioning} />
                )}
                {state.isPlaying && (
                  <motion.div
                    className="absolute -inset-4 rounded-full"
                    style={{
                      background: `conic-gradient(from 0deg, transparent 0%, ${accent}66 18%, transparent 42%, ${accent}33 68%, transparent 88%)`,
                      filter: "blur(14px)",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <motion.div
                  className="relative w-full h-full rounded-[2rem] overflow-hidden border border-white/15"
                  style={{ boxShadow: `0 24px 70px rgba(0,0,0,0.9), 0 0 45px ${accent}30` }}
                  animate={state.isPlaying ? { scale: [1, 1.015, 1] } : { scale: 1 }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <img
                    src={proxyArt}
                    alt={currentSong?.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }}
                  />
                  {state.isBuffering && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="w-9 h-9 rounded-full border-[3px] border-white/20 animate-spin" style={{ borderTopColor: accent }} />
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </div>

            {/* Song Meta (Title + Artist + Heart + Download) */}
            <div className="w-full flex items-center justify-between shrink-0">
              <button onClick={onLike} className="p-2 rounded-full bg-white/[0.05] border border-white/10 hover:bg-white/10 active:scale-90 transition-transform shrink-0">
                <Heart
                  className={`w-6 h-6 transition-all ${isLiked ? "fill-current text-pink-400 scale-110 drop-shadow-[0_0_8px_rgba(244,114,182,0.6)]" : "text-neutral-400 hover:text-white"}`}
                />
              </button>
              <div className="flex-1 text-center px-3 min-w-0">
                <h2 className="text-white font-black text-[21px] leading-tight truncate">{currentSong?.title || "—"}</h2>
                <p className="text-neutral-400 text-[13px] font-medium mt-1 truncate">{currentSong?.artist || "فنان"}</p>
              </div>
              <button onClick={onDownload} className="p-2 rounded-full bg-white/[0.05] border border-white/10 hover:bg-white/10 active:scale-90 transition-transform shrink-0">
                <DownloadCloud className="w-6 h-6 text-neutral-400 hover:text-white transition-colors" />
              </button>
            </div>

            {/* Live spectrum visualizer — real WebAudio data (accent tinted) */}
            <div className="w-full shrink-0">
              <LiveVisualizer getAnalyser={getAnalyser} isPlaying={state.isPlaying} accent={accent} isOpen={isOpen && !isTransitioning} />
            </div>

            {/* Seek Bar + Times */}
            <div className="w-full shrink-0">
              <SeekBar
                progress={state.currentTime}
                duration={state.duration}
                onSeek={seekTo}
                height="h-1.5"
                rtl={false}
                accent={accent}
                isPremium={isPremium}
                onPremiumClick={() => { setPremiumFeatureName("تقديم وتأخير الأغنية"); setIsPremiumModalOpen(true); }}
              />
              <div className="flex justify-between mt-1.5 text-[12px] font-bold text-neutral-400 tabular-nums" dir="ltr">
                <span>{fmtTime(state.currentTime)}</span>
                <span>-{fmtTime(Math.max(0, state.duration - state.currentTime))}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-between w-full max-w-[330px] mx-auto shrink-0 mt-1">
              <button
                onClick={() => setShuffle(!state.shuffle)}
                className={`p-2.5 rounded-full bg-white/[0.05] border border-white/10 transition-colors active:scale-90 ${state.shuffle ? "text-cyan-400 border-cyan-400/40 drop-shadow-[0_0_8px_rgba(0,242,254,0.6)]" : "text-neutral-400 hover:text-white"}`}
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button onClick={prev} className="active:scale-90 transition-transform p-2 text-white hover:text-neutral-200">
                <SkipBack className="w-8 h-8 fill-current" />
              </button>

              <button
                onClick={togglePlay}
                className="relative w-[70px] h-[70px] rounded-full flex items-center justify-center bg-white text-black active:scale-95 transition-transform shrink-0"
                style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.1), 0 10px 34px rgba(0,0,0,0.85), 0 0 38px ${accent}55` }}
              >
                {state.isPlaying && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                  style={{ border: `2px solid ${accent}` }}
                    animate={{ scale: [1, 1.35], opacity: [0.6, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                {state.isBuffering ? (
                  <div className="w-7 h-7 border-3 border-neutral-300 border-t-black rounded-full animate-spin" />
                ) : state.isPlaying ? (
                  <Pause className="w-8 h-8 fill-current text-black" />
                ) : (
                  <Play className="w-8 h-8 fill-current text-black ml-0.5" />
                )}
              </button>

              <button onClick={next} className="active:scale-90 transition-transform p-2 text-white hover:text-neutral-200">
                <SkipForward className="w-8 h-8 fill-current" />
              </button>

              <button
                onClick={cycleRepeat}
                className={`relative p-2.5 rounded-full bg-white/[0.05] border transition-colors active:scale-90 ${state.repeat !== "off" ? "text-cyan-400 border-cyan-400/40 drop-shadow-[0_0_8px_rgba(0,242,254,0.6)]" : "text-neutral-400 border-white/10 hover:text-white"}`}
              >
                <Repeat className="w-5 h-5" />
                {state.repeat === "one" && (
                  <span className="absolute top-1 right-1 text-[8px] font-black leading-none bg-cyan-400 text-black px-1 rounded-full">1</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════ QUEUE TAB ═══════════ */}
        {activeTab === "queue" && (
          <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4" dir="rtl" data-scroll style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
            <h3 className="text-white font-black text-xl mb-4 text-right">قائمة الاستماع</h3>
            <div className="space-y-2">
              {state.queue.map((song, i) => {
                const isCurrent = song.songId === currentSong?.songId;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-2.5 rounded-2xl transition-all cursor-pointer ${
                      isCurrent
                        ? "border border-white/15 shadow-lg"
                        : "hover:bg-white/5"
                    }`}
                    style={isCurrent ? { background: `${accent}22` } : {}}
                  >
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md">
                      <img src={getProxyUrl(song.thumbnailUrl)} className="w-full h-full object-cover" />
                      {isCurrent && state.isPlaying && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                          <div className="flex gap-[3px] items-end h-4">
                            {[0,1,2].map(j => (
                              <motion.div
                                key={j}
                                className="w-[3px] rounded-full"
                                style={{ background: accent }}
                                animate={{ height: ["6px","14px","6px"] }}
                                transition={{ repeat: Infinity, duration: 0.7, delay: j*0.15 }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-1 min-w-0">
                      <p className={`truncate font-bold text-[14px] ${isCurrent ? "text-white" : "text-white/75"}`}>{song.title}</p>
                      <p className="truncate text-[11px] text-white/40 mt-0.5">{song.artist}</p>
                    </div>
                    {isCurrent && (
                      <div className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: accent }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="h-20 shrink-0" />
          </div>
        )}

        {/* ═══════════ LYRICS TAB ═══════════ */}
        {activeTab === "lyrics" && (
          <div
            className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4 text-center"
            dir="rtl"
            ref={lyricsContainerRef}
            data-scroll
            onTouchStart={pauseAutoScroll}
            onWheel={pauseAutoScroll}
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain" }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 pt-1 pb-3 bg-gradient-to-b from-black/40 to-transparent backdrop-blur-sm">
              <h3 className="text-white font-black text-lg">كلمات الأغنية</h3>
              <div className="flex items-center gap-1.5 shrink-0">
                {lyricsSource === "ai" && (
                  <span className="text-[10px] font-black text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full">تقريبية بالذكاء الاصطناعي</span>
                )}
                {lyricsSource !== "ai" && syncedLyrics && syncedLyrics.length > 0 && (
                  <span className="text-[10px] font-black text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 px-2 py-0.5 rounded-full">متزامنة ✓</span>
                )}
                <button onClick={() => bumpLyricOffset(-2000)} className="w-7 h-7 rounded-full bg-white/10 border border-white/15 text-white text-sm font-black active:scale-90">−</button>
                <span className="text-[10px] font-bold text-white/45 tabular-nums w-10 text-center" dir="ltr">
                  {lyricOffset === 0 ? "توقيت" : `${lyricOffset > 0 ? "+" : ""}${(lyricOffset / 1000).toFixed(0)}s`}
                </span>
                <button onClick={() => bumpLyricOffset(2000)} className="w-7 h-7 rounded-full bg-white/10 border border-white/15 text-white text-sm font-black active:scale-90">+</button>
              </div>
            </div>
            {isLyricsLoading ? (
              <div className="flex flex-col items-center justify-center mt-20 opacity-50">
                <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
                <p className="text-sm font-bold text-white">جاري البحث عن الكلمات...</p>
              </div>
            ) : effectiveSynced ? (
              <div className="flex flex-col gap-5 pb-[42vh] pt-[16vh]">
                {effectiveSynced.map((line, i) => {
                  const isActive = i === activeLineIndex;
                  const isPassed = i < activeLineIndex;
                  return (
                    <div
                      key={i}
                      id={`lyrics-line-${i}`}
                      onClick={() => seekTo(line.timeMs / 1000)}
                      className={`font-black text-[19px] md:text-2xl leading-snug transition-all duration-500 cursor-pointer ${
                        isActive 
                          ? "text-white scale-105 drop-shadow-lg" 
                          : isPassed 
                            ? "text-white/40 scale-100" 
                            : "text-white/20 scale-95"
                      }`}
                      style={{ filter: isActive ? "blur(0px)" : "blur(0.5px)" }}
                    >
                      {line.text}
                    </div>
                  );
                })}
              </div>
            ) : lyrics ? (
              <div className="whitespace-pre-wrap font-bold text-lg md:text-2xl leading-loose text-white/90 pb-20 pt-4">
                {lyrics}
              </div>
            ) : (
              <div className="mt-20 text-white/50 font-bold">لا توجد كلمات متاحة.</div>
            )}
          </div>
        )}

        {/* ═══════════ AUDIO TAB ═══════════ */}
        {activeTab === "audio" && (
          <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4 pb-24" dir="rtl" data-scroll style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}>
            
            {/* Standard Volume Slider */}
            <div className="w-full space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
              <div className="flex items-center justify-between text-white font-bold text-sm">
                <VolumeX className="w-4 h-4 text-white/50" />
                <span>مستوى صوت الجهاز: {Math.round(state.volume * 100)}%</span>
                <Volume2 className="w-4 h-4 text-white/50" />
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                value={state.volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full cursor-pointer"
                style={{ accentColor: accent }}
              />
            </div>

            {/* 🎧 Audiophile Super Loudness & Clarity Booster (مضخم الصوت لغاية 200%) */}
            <div className="space-y-3 bg-gradient-to-br from-cyan-500/10 via-sky-500/5 to-transparent p-4 rounded-2xl border border-cyan-500/20 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                      مضخم ومقوي الصوت الفائق (Super Boost)
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 font-black">
                        {Math.round((soundBoost || 1.0) * 100)}%
                      </span>
                    </h4>
                    <p className="text-[11px] text-white/50 font-medium">رفع الصوت لغاية 200% مع مانع التشويش الذكي (Peak Limiter)</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {[
                  { val: 1.0, label: "100%", desc: "قياسي" },
                  { val: 1.25, label: "125%", desc: "عالي ونقي" },
                  { val: 1.5, label: "150%", desc: "مضخم استوديو" },
                  { val: 1.8, label: "180%", desc: "قوة خارقة" },
                  { val: 2.0, label: "200%", desc: "أقصى علو 🚀" },
                ].map((b) => {
                  const isCurrent = Math.abs((soundBoost || 1.0) - b.val) < 0.05;
                  return (
                    <button
                      key={b.val}
                      onClick={() => {
                        setSoundBoost?.(b.val);
                        showToast(`تم ضبط قوة الصوت على ${b.label} (${b.desc}) 🔊✨`);
                      }}
                      className={`py-2 px-1 rounded-xl text-center transition-all border ${
                        isCurrent
                          ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-black font-black border-cyan-300 shadow-lg shadow-cyan-400/20 scale-105"
                          : "bg-white/[0.04] text-white/70 hover:bg-white/[0.08] border-white/5 font-bold"
                      }`}
                    >
                      <p className="text-xs">{b.label}</p>
                      <p className={`text-[8.5px] mt-0.5 leading-tight ${isCurrent ? "text-black/80 font-black" : "text-white/40"}`}>{b.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 🎧 8D Spatial Audio Rotation (تقليب ودوران الصوت بين الأذنين) */}
            <div className={`p-4 rounded-2xl border transition-all backdrop-blur-md ${
              (soundPreset === "spatial" || is8dActive)
                ? "bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-transparent border-indigo-400/30 shadow-lg shadow-indigo-500/10"
                : "bg-white/5 border-white/10"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    (soundPreset === "spatial" || is8dActive) ? "bg-indigo-500/30 text-indigo-300" : "bg-white/10 text-white/50"
                  }`}>
                    <Headphones className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white flex items-center gap-2">
                      تقليب الصوت 8D بين فردتي السماعة
                      {(soundPreset === "spatial" || is8dActive) && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 animate-pulse">
                          دوران 360° نشط ⟷
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-white/50 font-medium">الصوت يتقلب ويدور بين الأذن اليسرى واليمنى كل 5.5 ثوانٍ بحركة دائرية</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const nextVal = !(soundPreset === "spatial" || is8dActive);
                    setIs8dActive?.(nextVal);
                    if (nextVal) {
                      setSoundPreset?.("spatial");
                    }
                    showToast(nextVal ? "تم تشغيل تقليب ودوران الصوت 8D بين الأذنين 🎧🔄" : "تم إيقاف دوران الصوت");
                  }}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all border ${
                    (soundPreset === "spatial" || is8dActive)
                      ? "bg-indigo-500 text-white border-indigo-400 shadow-md shadow-indigo-500/30"
                      : "bg-white/10 text-white/60 border-white/10 hover:bg-white/20"
                  }`}
                >
                  {(soundPreset === "spatial" || is8dActive) ? "نشط ✓" : "تفعيل"}
                </button>
              </div>

              {/* Instant Earbud Test Button */}
              <button
                onClick={() => {
                  test8dSound?.();
                }}
                className="mt-3 w-full py-2 px-3 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
              >
                <Headphones className="w-4 h-4 text-indigo-400 animate-bounce" />
                <span>🎧 اضغط هنا لاختبار تقليب السماعتين فوراً (يسار ⟷ يمين)</span>
              </button>

              {(soundPreset === "spatial" || is8dActive) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-indigo-200"
                >
                  <span className="flex items-center gap-1 font-bold">🎧 الأذن اليسرى (L)</span>
                  <div className="flex-1 mx-3 h-2 bg-white/10 rounded-full overflow-hidden relative shadow-inner">
                    <motion.div
                      className="absolute inset-y-0 w-8 bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 rounded-full shadow-lg shadow-indigo-500/50"
                      animate={{ x: ["0%", "280%", "0%"] }}
                      transition={{ duration: 2.75, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>
                  <span className="flex items-center gap-1 font-bold">(R) الأذن اليمنى 🎧</span>
                </motion.div>
              )}
            </div>

            {/* Master Studio Clarity Toggle */}
            <div className="space-y-3">
              <button
                onClick={() => {
                  const newVal = !state.isHighQuality;
                  setHighQuality(newVal);
                  showToast(newVal ? "تم تفعيل نقاء الصوت الفائق (Master Studio) 🎧✨" : "تم إيقاف معالجة نقاء الصوت", "hq");
                }}
                className={`w-full py-4 px-5 rounded-2xl flex items-center justify-between font-black text-lg transition-all ${
                  state.isHighQuality
                    ? "text-black shadow-2xl"
                    : "bg-white/[0.05] text-white/80 hover:bg-white/[0.08] border border-white/10"
                }`}
                style={state.isHighQuality ? {
                  background: `linear-gradient(135deg, #00f2fe, #4facfe)`,
                  boxShadow: `0 0 35px rgba(0,242,254,0.35)`
                } : {}}
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span>نقاء الصوت الفائق (Studio Master 32-bit)</span>
                    </div>
                    <p className={`text-xs font-medium ${state.isHighQuality ? "text-black/85" : "text-white/50"}`}>
                      معالجة احترافية مثل سبوتيفاي Hi-Fi وأنغامي Dolby مع عزل وضخامة ثلاثية الأبعاد
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${state.isHighQuality ? "border-black/30 bg-black/10 text-black" : "border-cyan-400/40 text-cyan-400 bg-cyan-400/10"}`}>
                  {state.isHighQuality ? "مُفعّل" : "320k HQ"}
                </span>
              </button>
            </div>

            {/* Studio Sound Presets (When HQ is active) */}
            {state.isHighQuality && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 bg-white/[0.04] p-4 rounded-2xl border border-white/10"
              >
                <div className="flex items-center justify-between text-white/90 font-bold text-sm">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <span>طابع ونمط نقاء الصوت المخصص (فرق واضح وفوري):</span>
                  </div>
                  <span className="text-[10px] text-cyan-400 font-bold">6 بروفايلات احترافية</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {[
                    { id: "crystal", label: "نقاء بلوري فائق (Pure Studio Hi-Fi)", icon: "💎", desc: "تفاصيل واضحة وشيمر نقي جداً مثل سبوتيفاي Hi-Fi بدون أي إجهاد" },
                    { id: "bass", label: "بيس عميق وانفجاري (Deep Sub-Bass Punch)", icon: "🔊", desc: "نبضات بيز قوية وضخمة جداً في السماعة مثل سوني وبيست، تهز الأذن بنعومة" },
                    { id: "vocal", label: "عزل وصوت غنائي نقي (Pure Vocal Clarity)", icon: "🎙️", desc: "صوت المطرب نقي ومباشر في وجهك مع عزل الآلات، مثالي للطرب والكلمات" },
                    { id: "concert", label: "مسرح حي وDolby Atmos (Live Stage)", icon: "🏟️", desc: "صوت سينمائي محيطي وضخم كأنك حاضر حفلة لايف في المسرح مع صدى فخم" },
                    { id: "spatial", label: "صوت محيطي 8D فضائي (360° Holographic)", icon: "🌌", desc: "دوران كامل وتقليب مستمر 8D حول الرأس بين الأذن اليسرى واليمنى كل 5.5 ثوانٍ" },
                    { id: "noise_cancel", label: "عزل الضوضاء والشارع (Urban Shield)", icon: "🛡️", desc: "فلترة أصوات الشارع والمواصلات ورفع وضوح الكلمات في الأماكن المزدحمة" },
                  ].map((p) => {
                    const isSelected = (soundPreset || "crystal") === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSoundPreset?.(p.id as any);
                          if (p.id === "spatial") {
                            setIs8dActive?.(true);
                          }
                          showToast(`تم تفعيل طابع: ${p.label} ✨`);
                        }}
                        className={`p-3.5 rounded-xl text-right transition-all flex flex-col justify-between border ${
                          isSelected
                            ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-black shadow-lg shadow-cyan-400/25 font-bold border-cyan-300"
                            : "bg-white/[0.04] text-white/70 hover:bg-white/[0.08] border-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xl">{p.icon}</span>
                          {isSelected && <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full font-black text-black">نشط ⚡</span>}
                        </div>
                        <p className="text-xs font-black">{p.label}</p>
                        <p className={`text-[11px] mt-1 leading-snug ${isSelected ? "text-black/85 font-medium" : "text-white/40"}`}>{p.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* ═══════════ BACKGROUND & BLUETOOTH TAB ═══════════ */}
        {activeTab === "premium" && (
          <div className="flex-1 flex flex-col justify-center items-center p-6 space-y-6" dir="rtl">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl bg-gradient-to-br from-cyan-400/20 via-sky-500/20 to-blue-600/30 border border-cyan-400/30">
              <Sparkles className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
            <div className="space-y-2 text-center max-w-xs">
              <h3 className="text-xl font-black text-white">التشغيل في الخلفية وسماعات البلوتوث</h3>
              <p className="text-neutral-400 text-xs leading-relaxed">
                ميزة التشغيل المستمر تعمل تلقائياً حتى عند قفل شاشة الآيفون، أو استخدام سماعات الهاند فري والبلوتوث في السيارة.
              </p>
            </div>
            <div className="w-full max-w-xs p-4 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
              <div className="flex items-center justify-between text-xs text-neutral-300 font-bold">
                <span>قفل شاشة الآيفون</span>
                <span className="text-emerald-400 flex items-center gap-1 font-black">نشط ومباشر ✓</span>
              </div>
              <div className="flex items-center justify-between text-xs text-neutral-300 font-bold">
                <span>سماعات البلوتوث والهاند فري</span>
                <span className="text-emerald-400 flex items-center gap-1 font-black">مدعوم بالكامل ✓</span>
              </div>
              <div className="flex items-center justify-between text-xs text-neutral-300 font-bold">
                <span>أزرار التحكم بالسماعة</span>
                <span className="text-emerald-400 flex items-center gap-1 font-black">شغال فعلياً ✓</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── Bottom Tab Navigation ─── */}
        <div
          className="flex items-center justify-around px-2 py-2 border-t mt-auto shrink-0 bg-[#07080b]/90 backdrop-blur-xl"
          style={{ borderColor: "rgba(255,255,255,0.06)", paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        >
          {[
            { id: "now", icon: Music2, label: "يعزف" },
            { id: "lyrics", icon: FileText, label: "كلمات" },
            { id: "queue", icon: ListMusic, label: "قائمة" },
            { id: "audio", icon: Settings, label: "نقاء الصوت" },
            { id: "premium", icon: Sparkles, label: "الخلفية" },
          ].map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex flex-col items-center gap-1 px-3.5 py-1.5 rounded-2xl transition-colors font-bold text-xs ${
                  active ? "text-white" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="player-tab-pill"
                    className="absolute inset-0 rounded-2xl"
                    style={{ background: `${accent}26`, boxShadow: `0 0 18px ${accent}33`, border: `1px solid ${accent}44` }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <tab.icon className="relative z-10 w-5 h-5" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

      </div>

    </div>
  );
}

// ─── Mini Player Bar ──────────────────────────────────────────────────
export function PlayerBar() {
  const { state, currentSong, next, prev, togglePlay, setVolume, seekTo, hasUserTriggeredPlay } = usePlayer();
  const [isLiked, setIsLiked] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState("");
  const { addToast } = useToastStore();

  // The global refresh FAB floats over the player's seek bar once it is expanded.
  useEffect(() => {
    document.body.classList.toggle("player-full-open", fullOpen);
    return () => document.body.classList.remove("player-full-open");
  }, [fullOpen]);

  const isPremium = typeof window !== "undefined" && localStorage.getItem("aura_user_tier") === "premium";
  // Like state: check local store instantly without network call
  useEffect(() => {
    if (!currentSong?.songId) return;
    setIsLiked(isFavoriteLocal(currentSong.songId));
  }, [currentSong?.songId]);

  const toggleLike = async () => {
    if (!currentSong) return;
    const res = await fetch("/api/likes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ songId: currentSong.songId })
    });
    const d = await res.json();
    if (d.success) {
      setIsLiked(d.liked);
      if (d.liked) {
        upsertFavorite({ songId: currentSong.songId, title: currentSong.title, artist: currentSong.artist || "فنان", thumbnailUrl: currentSong.thumbnailUrl, youtubeVideoId: currentSong.youtubeVideoId });
      } else {
        removeFavorite(currentSong.songId);
      }
      addToast(d.liked ? "تمت الإضافة للمفضلة ❤️" : "تمت الإزالة من المفضلة");
    }
  };

  const handleDownload = async () => {
    if (!currentSong) return;
    const rawArtist = currentSong.artist || (currentSong as any).metadata?.artist || "";
    const cleanArtist = (!rawArtist || rawArtist === "فنان" || rawArtist === "فنان غير معروف") ? "" : rawArtist;
    addToast(`جاري حفظ "${currentSong.title}" في مكتبة الموقع... 🚀`);
    const ok = await downloadSong(currentSong.songId, currentSong.youtubeVideoId, {
      title: currentSong.title, artist: cleanArtist, thumbnailUrl: currentSong.thumbnailUrl, folderName: cleanArtist || "أخرى"
    });
    addToast(ok ? "تم حفظ الأغنية في مكتبتك (الأوفلاين) ✅" : "فشل التحميل ❌", ok ? "success" : "error");
  };

  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;
  const proxyArt = getProxyUrl(art);
  const { accent } = useDominantColor(proxyArt);
  const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  if (!currentSong) return null;

  return (
    <>
      {/* Full Player */}
        <FullPlayer
          isOpen={fullOpen}
          onClose={() => setFullOpen(false)}
          isLiked={isLiked}
          onLike={toggleLike}
          onDownload={handleDownload}
          accent={accent}
          isPremium={isPremium}
          setIsPremiumModalOpen={setIsPremiumModalOpen}
          setPremiumFeatureName={setPremiumFeatureName}
          showToast={addToast}
        />

      {/* Mini Bar — mobile: above tab bar, desktop: bottom-0 */}
      <footer
        className="fixed left-0 right-0 z-30 transition-all duration-300 ease-out"
        style={{
          opacity: fullOpen ? 0 : 1,
          pointerEvents: fullOpen ? "none" : "auto",
          transform: fullOpen ? "translate3d(0, 20px, 0)" : "translate3d(0, 0, 0)",
          willChange: "transform, opacity",
          bottom:
            typeof window !== "undefined" && window.innerWidth >= 768
              ? "0px"
              : "calc(env(safe-area-inset-bottom, 0px) + 58px)",
        }}
        ref={(el) => {
          // Keep bottom correct on resize (e.g. orientation change)
          if (!el) return;
          const update = () => {
            el.style.bottom =
              window.innerWidth >= 768
                ? "0px"
                : "calc(env(safe-area-inset-bottom, 0px) + 58px)";
          };
          window.addEventListener("resize", update, { passive: true });
        }}
      >
        {/* Floating glass card */}
        <div
          className="relative mx-3 mb-2 flex items-center gap-3 rounded-[22px] border px-3 py-2.5 backdrop-blur-2xl overflow-hidden"
          style={{
            background: "rgba(9,11,16,0.82)",
            borderColor: "rgba(255,255,255,0.08)",
            boxShadow: `0 14px 44px rgba(0,0,0,0.78), 0 0 24px ${accent}22`,
            willChange: "transform",
            transform: "translateZ(0)",
          }}
        >
          {/* accent hairline glow across the top */}
          <div className="absolute inset-x-8 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}99, transparent)` }} />

          {/* Art with circular progress ring */}
          <div className="relative w-[54px] h-[54px] shrink-0 cursor-pointer" onClick={() => setFullOpen(true)}>
            <svg viewBox="0 0 60 60" className="absolute -inset-[3px] w-[60px] h-[60px] -rotate-90">
              <circle cx="30" cy="30" r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
              <circle
                cx="30" cy="30" r="28" fill="none"
                stroke={accent} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={175.93}
                strokeDashoffset={175.93 * (1 - pct / 100)}
                style={{ filter: `drop-shadow(0 0 4px ${accent})`, transition: "stroke-dashoffset 0.4s linear" }}
              />
            </svg>
            <div className="w-full h-full rounded-full overflow-hidden border border-white/10 shadow-lg">
              <img
                src={proxyArt}
                alt={currentSong.title}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }}
              />
            </div>
            {state.isPlaying && !state.isBuffering && (
              <motion.div
                className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                style={{ background: accent, borderColor: "#090b10" }}
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 cursor-pointer group" onClick={() => setFullOpen(true)}>
            <p className="text-[13px] font-bold truncate text-white group-hover:text-cyan-300 transition-colors">
              {state.isBuffering && state.currentTime === 0 ? "جاري التجهيز..." : currentSong.title}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {state.isBuffering && state.currentTime === 0 ? (
                <p className="text-[11px] text-neutral-400 truncate">يتم جلب أفضل جودة</p>
              ) : (
                <>
                  <p className="text-[11px] text-neutral-400 truncate">{currentSong.artist || "فنان"}</p>
                  {state.isHighQuality && (
                    <span className="shrink-0 text-[8px] font-black text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded-full px-1.5 py-px">HQ</span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={prev} className="text-neutral-300 hover:text-white transition-colors active:scale-90 p-1.5">
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="w-11 h-11 rounded-full flex items-center justify-center text-black active:scale-95 transition-transform"
              style={{ background: `linear-gradient(135deg, #ffffff 30%, ${accent})`, boxShadow: `0 4px 18px ${accent}55, 0 2px 8px rgba(0,0,0,0.6)` }}
            >
              {state.isBuffering ? (
                <div className="w-5 h-5 border-2 border-neutral-400 border-t-black rounded-full animate-spin" />
              ) : state.isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <button onClick={next} className="text-neutral-300 hover:text-white transition-colors active:scale-90 p-1.5">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={toggleLike} className="p-1.5 active:scale-90 transition-transform">
              <Heart className={`w-5 h-5 transition-colors ${isLiked ? "text-pink-500 fill-current drop-shadow-[0_0_8px_rgba(244,114,182,0.6)]" : "text-neutral-500 hover:text-white"}`} />
            </button>
            <button onClick={handleDownload} className="text-neutral-500 hover:text-cyan-400 transition-colors hidden md:block">
              <DownloadCloud className="w-4 h-4" />
            </button>
            <div className="hidden md:flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-neutral-500" />
              <input type="range" min="0" max="1" step="0.01" value={state.volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-20 accent-cyan-400 h-1 cursor-pointer" />
            </div>
          </div>

          {/* Scrub line at the bottom edge (premium-gated like before) */}
          <div className="absolute bottom-0 inset-x-4 h-[3px]" dir="ltr">
            <SeekBar
              progress={state.currentTime}
              duration={state.duration}
              onSeek={seekTo}
              height="h-full"
              rtl={false}
              accent={accent}
              isPremium={isPremium}
              onPremiumClick={() => { setPremiumFeatureName("تقديم وتأخير الأغنية"); setIsPremiumModalOpen(true); }}
            />
          </div>
        </div>
      </footer>

      {/* Premium Modal */}
      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        featureName={premiumFeatureName}
      />
    </>
  );
}
