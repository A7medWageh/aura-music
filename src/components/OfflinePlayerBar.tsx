"use client";

import {
  Play, Pause, SkipForward, SkipBack, Shuffle,
  Repeat, Volume2, VolumeX, Heart, DownloadCloud,
  ChevronDown, ListMusic, Share2, Crown,
  Settings, Music2, FileText, Sparkles, Sliders, Waves, Zap, Shield, Headphones,
  RotateCcw, RotateCw, Maximize2, Minimize2, X
} from "lucide-react";
import { useOfflinePlayer } from "@/state/offlinePlayerContext";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getProxyUrl } from "@/utils/media";
import { PremiumModal } from "./PremiumModal";
import { upsertFavorite, removeFavorite, isFavoriteLocal } from "@/services/user/favoritesStore";
import { useToastStore } from "@/state/toastStore";
import { getLyrics } from "@/offline/indexedDbCache";

// ─── Helpers ─────────────────────────────────────────────────────────
function fmtTime(s: number) {
  if (!s || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

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
    window.addEventListener("resize", updateSize, { passive: true });
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    const binCount = 48;
    const freqData = new Uint8Array(binCount);
    const smooth = new Float32Array(binCount);

    const render = () => {
      const { w, h } = sizeRef.current;
      if (w <= 0 || h <= 0) {
        raf = requestAnimationFrame(render);
        return;
      }
      ctx.clearRect(0, 0, w, h);

      const an = getAnalyser();
      const isPlay = playingRef.current;

      if (an && isPlay) {
        an.getByteFrequencyData(freqData as any);
        for (let i = 0; i < binCount; i++) {
          const target = freqData[i] / 255;
          smooth[i] = smooth[i] * 0.7 + target * 0.3;
        }
      } else if (isPlay) {
        const t = performance.now() * 0.003;
        for (let i = 0; i < binCount; i++) {
          const v = Math.sin(t + i * 0.25) * 0.35 + Math.cos(t * 0.7 - i * 0.15) * 0.25 + 0.3;
          smooth[i] = smooth[i] * 0.8 + Math.max(0.05, Math.min(0.9, v)) * 0.2;
        }
      } else {
        for (let i = 0; i < binCount; i++) {
          smooth[i] = smooth[i] * 0.85;
        }
      }

      const [r, g, b] = hexToRgb(accentRef.current);
      const barWidth = w / binCount;
      const gap = Math.max(1, barWidth * 0.22);
      const innerW = Math.max(1, barWidth - gap);

      for (let i = 0; i < binCount; i++) {
        const val = smooth[i];
        const barH = Math.max(2, val * (h * 0.88));
        const x = i * barWidth + gap / 2;
        const y = (h - barH) / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.95)`);
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.5)`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.15)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        const rad = Math.min(innerW / 2, 3);
        ctx.roundRect(x, y, innerW, barH, rad);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, isOpen]);

  return <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />;
}

function AuroraParticles({ accent, enabled = true }: { accent: string; enabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accent);
  accentRef.current = accent;

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0, h = 0;
    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    onResize();
    window.addEventListener("resize", onResize, { passive: true });

    type Particle = { x: number; y: number; r: number; vx: number; vy: number; alpha: number; dAlpha: number };
    const count = 28;
    const parts: Particle[] = [];
    for (let i = 0; i < count; i++) {
      parts.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 2.5,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.2 - Math.random() * 0.45,
        alpha: 0.1 + Math.random() * 0.5,
        dAlpha: (Math.random() - 0.5) * 0.008,
      });
    }

    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      const [r, g, b] = hexToRgb(accentRef.current);

      for (let i = 0; i < count; i++) {
        const p = parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha += p.dAlpha;
        if (p.alpha <= 0.08 || p.alpha >= 0.7) p.dAlpha = -p.dAlpha;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [enabled]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ mixBlendMode: "screen", opacity: 0.8 }} />;
}

function BeatGlow({ accent, energyRef, enabled }: { accent: string; energyRef: { current: number }; enabled: boolean }) {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const el = divRef.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      const e = energyRef.current;
      const s = 1 + e * 0.18;
      const o = 0.25 + e * 0.45;
      el.style.transform = `scale(${s})`;
      el.style.opacity = `${o}`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, energyRef]);

  const [r, g, b] = hexToRgb(accent);
  return (
    <div
      ref={divRef}
      className="absolute inset-0 pointer-events-none rounded-full blur-[90px] transition-transform duration-75"
      style={{
        background: `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.55) 0%, transparent 70%)`,
        willChange: "transform, opacity",
      }}
    />
  );
}

function SeekBar({
  progress, duration, onSeek, height = "h-2", rtl = true, accent = "#00e5ff",
  isPremium = true, onPremiumClick,
}: {
  progress: number; duration: number; onSeek: (time: number) => void;
  height?: string; rtl?: boolean; accent?: string; isPremium?: boolean; onPremiumClick?: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const pct = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;

  const computeTime = (clientX: number) => {
    if (!barRef.current || !duration) return 0;
    const r = barRef.current.getBoundingClientRect();
    const ratio = rtl ? (r.right - clientX) / r.width : (clientX - r.left) / r.width;
    return Math.max(0, Math.min(duration, ratio * duration));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isPremium) { onPremiumClick?.(); return; }
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    onSeek(computeTime(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!barRef.current || !duration) return;
    const t = computeTime(e.clientX);
    const r = barRef.current.getBoundingClientRect();
    setHoverTime(t);
    setHoverX(Math.max(0, Math.min(r.width, e.clientX - r.left)));
    if (isDragging && isPremium) onSeek(t);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch {}
    }
  };

  return (
    <div
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { if (!isDragging) setHoverTime(null); }}
      className={`relative w-full ${height} cursor-pointer group flex items-center select-none touch-none`}
      style={{ willChange: "contents" }}
    >
      <div className="absolute inset-0 rounded-full bg-white/10 group-hover:bg-white/15 transition-colors overflow-hidden">
        <div
          className="h-full relative transition-[width] duration-75 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(${rtl ? "270deg" : "90deg"}, #00e5ff 0%, ${accent} 100%)`,
            boxShadow: `0 0 12px ${accent}66`,
          }}
        />
      </div>

      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg pointer-events-none transition-transform group-hover:scale-125"
        style={{
          left: rtl ? `${100 - pct}%` : `${pct}%`,
          boxShadow: `0 0 12px ${accent}, 0 2px 6px rgba(0,0,0,0.6)`,
        }}
      />
    </div>
  );
}

// ─── FULLSCREEN EXPANDED PLAYER (Exact 1:1 Duplicate of Online Player) ──
function FullPlayer({
  isOpen, onClose, isLiked, onLike, accent,
  isPremium, setIsPremiumModalOpen, setPremiumFeatureName, showToast
}: {
  isOpen: boolean; onClose: () => void; isLiked: boolean;
  onLike: () => void; accent: string;
  isPremium: boolean; setIsPremiumModalOpen: (v: boolean) => void; setPremiumFeatureName: (v: string) => void;
  showToast: (msg: string, type?: "normal" | "hq") => void;
}) {
  const {
    state, currentSong, togglePlay, next, prev, seekTo, setVolume,
    cycleRepeat, setShuffle, setHighQuality, setIsAiMix, soundPreset,
    setSoundPreset, soundBoost, setSoundBoost, is8dActive, setIs8dActive,
    test8dSound, getAnalyser, closePlayer
  } = useOfflinePlayer();

  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;
  const proxyArt = getProxyUrl(art);

  const [activeTab, setActiveTab] = useState("now");
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

  useEffect(() => {
    if (!currentSong?.songId) {
      setLyrics(null);
      setSyncedLyrics(null);
      return;
    }
    getLyrics(currentSong.songId).then((cached: any) => {
      if (!cached) return;
      if (typeof cached === "string") setLyrics(cached);
      else if (cached?.lines) setLyrics(cached.lines.map((l: any) => l.text).join("\n"));
      else if (cached?.lyrics) setLyrics(cached.lyrics);
    }).catch(() => {});
  }, [currentSong?.songId]);

  if (!isOpen || !currentSong) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden text-white"
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, #090b10 0%, #040507 70%, #000000 100%)`,
      }}
    >
      <AuroraParticles accent={accent} enabled={bgMode !== "calm"} />

      {/* Top bar with Minimize AND Close (X) buttons */}
      <div
        className="relative z-10 flex items-center justify-between px-5 pt-3 shrink-0"
        style={{
          height: "calc(env(safe-area-inset-top, 0px) + 48px)",
          paddingLeft: "max(14px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(14px, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="flex items-center gap-2">
          {/* Minimize Chevron */}
          <button onClick={onClose} className="p-2 rounded-full bg-white/[0.06] border border-white/10 hover:bg-white/10 transition active:scale-90" title="تصغير">
            <ChevronDown className="w-6 h-6 text-white" />
          </button>
          {/* Complete Close (X) Button */}
          <button
            onClick={() => {
              onClose();
              closePlayer();
            }}
            className="p-2 rounded-full bg-white/[0.06] border border-white/10 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition active:scale-90"
            title="إغلاق المشغل نهائياً"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            أوفلاين ⚡
          </span>
        </div>
      </div>

      {/* Title row */}
      <div className="flex items-center justify-center gap-2 shrink-0 pb-1">
        <p className="text-white/50 text-[11px] font-bold uppercase tracking-widest">مكتبة الأوفلاين المحلية</p>
        <span className="text-[10px] font-black text-cyan-300 flex items-center gap-1 bg-cyan-400/10 px-2.5 py-0.5 rounded-full border border-cyan-400/30">
          استوديو Master HQ 🎧
        </span>
      </div>

      {/* Tabs */}
      <div className="relative z-10 flex items-center justify-center gap-1 px-4 py-1 shrink-0">
        {[
          { id: "now", label: "يعزف الآن", icon: Music2 },
          { id: "lyrics", label: "الكلمات", icon: FileText },
          { id: "queue", label: "القائمة", icon: ListMusic },
          { id: "audio", label: "نقاء فائق", icon: Headphones },
        ].map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                active
                  ? "bg-white/15 text-white border border-white/20 shadow-lg"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Body content based on active tab */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 overflow-hidden min-h-0">
        {activeTab === "now" && (
          <div className="flex flex-col items-center justify-center w-full max-w-sm space-y-4">
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl overflow-hidden shadow-2xl border border-white/15">
              <BeatGlow accent={accent} energyRef={energyRef} enabled={bgMode !== "calm"} />
              <img src={proxyArt} alt="" className="w-full h-full object-cover" />
            </div>

            <div className="text-center w-full space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white truncate drop-shadow-md">
                {currentSong.title}
              </h2>
              <p className="text-sm font-bold text-neutral-400 truncate">
                {currentSong.artist || "فنان"}
              </p>
            </div>
          </div>
        )}

        {activeTab === "lyrics" && (
          <div className="w-full max-w-md h-full overflow-y-auto text-center py-6 px-4 space-y-4">
            {lyrics ? (
              lyrics.split("\n").map((line, i) => (
                <p key={i} className="text-base sm:text-lg font-bold text-gray-200 leading-relaxed">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-neutral-500 font-bold my-auto">لا توجد كلمات محفوظة لهذه الأغنية أوفلاين</p>
            )}
          </div>
        )}

        {activeTab === "queue" && (
          <div className="w-full max-w-md h-full overflow-y-auto py-2 space-y-2" dir="rtl">
            {state.queue.map((s, idx) => {
              const isCurrent = s.songId === currentSong.songId;
              return (
                <div
                  key={s.songId + idx}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl cursor-pointer ${
                    isCurrent ? "bg-cyan-500/15 border border-cyan-500/40" : "hover:bg-white/5"
                  }`}
                >
                  <img src={getProxyUrl(s.thumbnailUrl)} alt="" className="w-10 h-10 rounded-xl object-cover" />
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-bold truncate ${isCurrent ? "text-cyan-400" : "text-white"}`}>{s.title}</h4>
                    <p className="text-xs text-neutral-400 truncate">{s.artist}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "audio" && (
          <div className="w-full max-w-sm space-y-4 py-4" dir="rtl">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3">
              <h4 className="text-sm font-black text-cyan-300">أوضاع نقاء الصوت</h4>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "crystal", label: "كريستالي" },
                  { id: "bass", label: "تضخيم الباس" },
                  { id: "vocal", label: "فوكال نقي" },
                  { id: "spatial", label: "محيطي 3D" },
                  { id: "concert", label: "حفلة لايف" },
                  { id: "noise_cancel", label: "عزل الضوضاء" },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSoundPreset(preset.id as any);
                      showToast(`تم تفعيل وضع: ${preset.label} 🎧`);
                    }}
                    className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all ${
                      soundPreset === preset.id
                        ? "bg-cyan-400 text-black border-cyan-400 font-black shadow-md shadow-cyan-400/30"
                        : "bg-white/5 text-gray-300 border-white/10"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Area (Identical to Online Player) */}
      <div className="relative z-10 px-6 sm:px-12 pb-8 space-y-4 max-w-xl mx-auto w-full shrink-0">
        {/* Progress Bar */}
        <div className="space-y-1">
          <SeekBar
            progress={state.currentTime}
            duration={state.duration}
            onSeek={seekTo}
            height="h-2"
            rtl={false}
            accent={accent}
            isPremium={true}
          />
          <div className="flex justify-between text-xs font-mono text-neutral-400 font-bold px-0.5">
            <span>{fmtTime(state.currentTime)}</span>
            <span>{fmtTime(state.duration)}</span>
          </div>
        </div>

        {/* Buttons Row */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setShuffle(!state.shuffle)}
            className={`p-3 rounded-full transition ${state.shuffle ? "text-cyan-400 bg-cyan-400/10" : "text-neutral-400 hover:text-white"}`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button onClick={prev} className="p-3 text-white hover:text-cyan-300 active:scale-90 transition">
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button onClick={skip15Back} className="p-2 text-neutral-400 hover:text-white active:scale-90 transition">
            <RotateCcw className="w-5 h-5" />
          </button>

          {/* Main Big Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-black active:scale-95 hover:scale-105 transition shadow-2xl"
            style={{
              background: `linear-gradient(135deg, #ffffff 20%, ${accent} 100%)`,
              boxShadow: `0 8px 30px ${accent}66`,
            }}
          >
            {state.isPlaying ? (
              <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
            ) : (
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
            )}
          </button>

          <button onClick={skip15Forward} className="p-2 text-neutral-400 hover:text-white active:scale-90 transition">
            <RotateCw className="w-5 h-5" />
          </button>

          <button onClick={next} className="p-3 text-white hover:text-cyan-300 active:scale-90 transition">
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button
            onClick={cycleRepeat}
            className={`p-3 rounded-full transition relative ${state.repeat !== "off" ? "text-cyan-400 bg-cyan-400/10" : "text-neutral-400 hover:text-white"}`}
          >
            <Repeat className="w-5 h-5" />
            {state.repeat === "one" && (
              <span className="absolute top-2 right-2 text-[8px] font-black bg-cyan-400 text-black rounded-full px-1">1</span>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── MINI PLAYER BAR (Exact 1:1 Duplicate of Online Player with (X) button) ─
export function OfflinePlayerBar() {
  const { state, currentSong, next, prev, togglePlay, setVolume, seekTo, hasActiveSong, closePlayer } = useOfflinePlayer();
  const [isLiked, setIsLiked] = useState(false);
  const [fullOpen, setFullOpen] = useState(() => {
    if (typeof document !== "undefined") {
      return document.body.classList.contains("player-full-open");
    }
    return false;
  });
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState("");
  const { addToast } = useToastStore();

  useEffect(() => {
    document.body.classList.toggle("player-full-open", fullOpen);
    return () => document.body.classList.remove("player-full-open");
  }, [fullOpen]);

  // Keep fullOpen in sync if user swapped from online player while fullOpen was active
  useEffect(() => {
    if (typeof document !== "undefined" && document.body.classList.contains("player-full-open")) {
      setFullOpen(true);
    }
  }, [currentSong?.songId]);

  const isPremium = typeof window !== "undefined" && localStorage.getItem("aura_user_tier") === "premium";

  useEffect(() => {
    if (!currentSong?.songId) return;
    setIsLiked(isFavoriteLocal(currentSong.songId));
  }, [currentSong?.songId]);

  const toggleLike = () => {
    if (!currentSong) return;
    const nextState = !isLiked;
    setIsLiked(nextState);
    if (nextState) {
      upsertFavorite({
        songId: currentSong.songId,
        title: currentSong.title,
        artist: currentSong.artist || "فنان",
        thumbnailUrl: currentSong.thumbnailUrl,
        youtubeVideoId: currentSong.youtubeVideoId,
      });
      addToast("تمت الإضافة للمفضلة ❤️");
    } else {
      removeFavorite(currentSong.songId);
      addToast("تمت الإزالة من المفضلة");
    }
  };

  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;
  const proxyArt = getProxyUrl(art);
  const { accent } = useDominantColor(proxyArt);
  const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  if (!hasActiveSong || !currentSong) return null;

  return (
    <>
      <FullPlayer
        isOpen={fullOpen}
        onClose={() => setFullOpen(false)}
        isLiked={isLiked}
        onLike={toggleLike}
        accent={accent}
        isPremium={isPremium}
        setIsPremiumModalOpen={setIsPremiumModalOpen}
        setPremiumFeatureName={setPremiumFeatureName}
        showToast={addToast}
      />

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
      >
        <div
          className="relative mx-3 mb-2 flex items-center gap-3 rounded-[22px] border px-3 py-2.5 backdrop-blur-2xl overflow-hidden"
          style={{
            background: "rgba(9,11,16,0.88)",
            borderColor: "rgba(0,229,255,0.25)",
            boxShadow: `0 14px 44px rgba(0,0,0,0.85), 0 0 24px ${accent}22`,
            willChange: "transform",
            transform: "translateZ(0)",
          }}
        >
          <div className="absolute inset-x-8 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, #00e5ff, transparent)` }} />

          {/* Art with circular progress ring */}
          <div className="relative w-[54px] h-[54px] shrink-0 cursor-pointer" onClick={() => setFullOpen(true)}>
            <svg viewBox="0 0 60 60" className="absolute -inset-[3px] w-[60px] h-[60px] -rotate-90">
              <circle cx="30" cy="30" r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
              <circle
                cx="30" cy="30" r="28" fill="none"
                stroke="#00e5ff" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={175.93}
                strokeDashoffset={175.93 * (1 - pct / 100)}
                style={{ filter: `drop-shadow(0 0 4px #00e5ff)`, transition: "stroke-dashoffset 0.4s linear" }}
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
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 cursor-pointer group" onClick={() => setFullOpen(true)}>
            <p className="text-[13px] font-bold truncate text-white group-hover:text-cyan-300 transition-colors">
              {currentSong.title}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[11px] text-neutral-400 truncate">{currentSong.artist || "فنان"}</p>
              <span className="shrink-0 text-[8px] font-black text-cyan-300 bg-cyan-400/10 border border-cyan-400/30 rounded-full px-1.5 py-px">
                أوفلاين ⚡
              </span>
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
              style={{ background: `linear-gradient(135deg, #ffffff 30%, #00e5ff)`, boxShadow: `0 4px 18px #00e5ff55, 0 2px 8px rgba(0,0,0,0.6)` }}
            >
              {state.isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
            <button onClick={next} className="text-neutral-300 hover:text-white transition-colors active:scale-90 p-1.5">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>

          {/* Right side with Close (X) button */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={toggleLike} className="p-1.5 active:scale-90 transition-transform">
              <Heart className={`w-5 h-5 transition-colors ${isLiked ? "text-pink-500 fill-current drop-shadow-[0_0_8px_rgba(244,114,182,0.6)]" : "text-neutral-500 hover:text-white"}`} />
            </button>
            <div className="hidden md:flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-neutral-500" />
              <input type="range" min="0" max="1" step="0.01" value={state.volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-20 accent-cyan-400 h-1 cursor-pointer" />
            </div>

            {/* Complete Close (X) button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closePlayer();
              }}
              className="p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-90"
              title="إغلاق المشغل"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrub line at the bottom edge */}
          <div className="absolute bottom-0 inset-x-4 h-[3px]" dir="ltr">
            <SeekBar
              progress={state.currentTime}
              duration={state.duration}
              onSeek={seekTo}
              height="h-full"
              rtl={false}
              accent="#00e5ff"
              isPremium={true}
            />
          </div>
        </div>
      </footer>
    </>
  );
}
