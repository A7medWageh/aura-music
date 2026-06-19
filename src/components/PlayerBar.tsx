"use client";

import {
  Play, Pause, SkipForward, SkipBack, Shuffle,
  Repeat, Volume2, VolumeX, Heart, DownloadCloud,
  ChevronDown, Maximize2, ListMusic, Share2, Crown,
  Settings, Music2
} from "lucide-react";
import { usePlayer } from "@/state/playerContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getProxyUrl } from "@/utils/media";
import { PremiumModal } from "./PremiumModal";
import { downloadSong } from "@/services/offline/downloader";
import { upsertFavorite, removeFavorite } from "@/services/user/favoritesStore";
import { useToastStore } from "@/state/toastStore";

// ─── Helpers ─────────────────────────────────────────────────────────
function fmtTime(s: number) {
  if (!s || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

// ─── Dynamic Color Extractor from album art ───────────────────────────
function useDominantColor(imageUrl: string | undefined) {
  const [colors, setColors] = useState({ bg1: "#1a1035", bg2: "#0f0a20", accent: "#6366f1" });

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
          // Skip near-white and near-black pixels
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
          // Darken for background
          const factor = 0.3;
          const bg1 = `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
          const bg2 = `rgb(${Math.round(r * factor * 0.5)}, ${Math.round(g * factor * 0.5)}, ${Math.round(b * factor * 0.5)})`;
          // Accent: brighter version
          const max = Math.max(r, g, b);
          const scale = max > 0 ? 220 / max : 1;
          const accent = `rgb(${Math.min(255, Math.round(r * scale))}, ${Math.min(255, Math.round(g * scale))}, ${Math.min(255, Math.round(b * scale))})`;
          setColors({ bg1, bg2, accent });
        }
      } catch { /* canvas tainted — ignore */ }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  return colors;
}

// ─── Pulsing Waveform Visualizer ─────────────────────────────────────
function WaveformVisualizer({ isPlaying, accent }: { isPlaying: boolean; accent: string }) {
  const bars = Array.from({ length: 28 });
  return (
    <div className="flex items-end justify-center gap-[3px] h-16 w-full px-4">
      {bars.map((_, i) => {
        const baseH = 6 + Math.sin(i * 0.7) * 14 + Math.random() * 6;
        return (
          <motion.div
            key={i}
            className="rounded-full w-[5px] shrink-0"
            style={{ background: accent, opacity: 0.6, height: "4px" }}
            animate={
              isPlaying
                ? {
                    height: [
                      `${baseH}px`,
                      `${Math.max(4, baseH + (Math.random() - 0.5) * 28)}px`,
                      `${Math.max(4, baseH + (Math.random() - 0.5) * 20)}px`,
                      `${baseH}px`,
                    ],
                    opacity: [0.5, 0.9, 0.7, 0.5],
                  }
                : { height: "4px", opacity: 0.3 }
            }
            transition={{
              duration: 0.7 + Math.random() * 0.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.04,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Seek Bar ────────────────────────────────────────────────────────
function SeekBar({
  progress, duration, onSeek, height = "h-1", rtl = true,
  accent = "white", isPremium = true, onPremiumClick
}: {
  progress: number; duration: number; onSeek: (t: number) => void;
  height?: string; rtl?: boolean; accent?: string;
  isPremium?: boolean; onPremiumClick?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const calculatePos = (clientX: number) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const pos = rtl
      ? 1 - (clientX - rect.left) / rect.width
      : (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, pos));
  };

  const handleUpdate = (clientX: number) => {
    const pos = calculatePos(clientX);
    setDragProgress(pos * duration);
  };

  useEffect(() => {
    if (!isDragging || !isPremium) return;
    const onMove = (e: MouseEvent) => handleUpdate(e.clientX);
    const onUp = (e: MouseEvent) => { onSeek(calculatePos(e.clientX) * duration); setIsDragging(false); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isDragging, duration]);

  useEffect(() => {
    if (!isDragging || !isPremium) return;
    const onTouchMove = (e: TouchEvent) => handleUpdate(e.touches[0].clientX);
    const onTouchEnd = (e: TouchEvent) => { onSeek(calculatePos(e.changedTouches[0].clientX) * duration); setIsDragging(false); };
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => { window.removeEventListener("touchmove", onTouchMove); window.removeEventListener("touchend", onTouchEnd); };
  }, [isDragging, duration]);

  const displayProgress = isDragging ? dragProgress : progress;
  const pct = duration > 0 ? (displayProgress / duration) * 100 : 0;

  return (
    <div
      ref={barRef}
      onMouseDown={(e) => { if (!isPremium && onPremiumClick) { onPremiumClick(); return; } setIsDragging(true); handleUpdate(e.clientX); }}
      onTouchStart={(e) => { if (!isPremium && onPremiumClick) { onPremiumClick(); return; } setIsDragging(true); handleUpdate(e.touches[0].clientX); }}
      className={`relative w-full ${height} bg-white/15 rounded-full cursor-pointer group`}
    >
      <div className="absolute inset-0 bg-white/5 rounded-full" />
      <div
        className={`absolute inset-y-0 ${rtl ? "right-0" : "left-0"} rounded-full transition-all ${isDragging ? "" : "duration-200"}`}
        style={{ width: `${pct}%`, background: accent }}
      />
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-xl border-2 border-white/20 transition-transform ${isDragging ? "scale-125" : "scale-100 opacity-0 group-hover:opacity-100"}`}
        style={{ background: accent, ...(rtl ? { right: `calc(${pct}% - 8px)` } : { left: `calc(${pct}% - 8px)` }) }}
      />
    </div>
  );
}

// ─── Full Screen Player ───────────────────────────────────────────────
function FullPlayer({
  onClose, isLiked, onLike, onDownload,
  isPremium, setIsPremiumModalOpen, setPremiumFeatureName, showToast
}: {
  onClose: () => void; isLiked: boolean;
  onLike: () => void; onDownload: () => void;
  isPremium: boolean; setIsPremiumModalOpen: (v: boolean) => void; setPremiumFeatureName: (v: string) => void;
  showToast: (msg: string, type?: "normal" | "hq") => void;
}) {
  const { state, currentSong, togglePlay, next, prev, seekTo, setVolume, cycleRepeat, setShuffle, setHighQuality } = usePlayer();
  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;
  const proxyArt = getProxyUrl(art);

  // ── Dynamic color from album art ──
  const { bg1, bg2, accent } = useDominantColor(proxyArt);

  const [activeTab, setActiveTab] = useState("now"); // now | queue | audio | premium
  const [isBgPlayEnabled, setIsBgPlayEnabled] = useState(isPremium);
  const [isAiMix, setIsAiMix] = useState(false);

  // Swipe down to close
  const dragY = useRef(0);
  const startY = useRef(0);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => { startY.current = e.touches[0].clientY; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setSwipeOffset(dy);
  };
  const handleTouchEnd = () => {
    if (swipeOffset > 120) { onClose(); }
    setSwipeOffset(0);
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: swipeOffset > 0 ? swipeOffset : 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 220 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: `linear-gradient(180deg, ${bg1} 0%, ${bg2} 100%)` }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Blurred album art background ── */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={proxyArt}
          alt=""
          className="w-full h-full object-cover scale-125"
          style={{ filter: "blur(60px) brightness(0.35) saturate(1.4)" }}
        />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${bg1}cc 0%, ${bg2}ee 60%, ${bg2} 100%)` }} />
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col h-full w-full max-w-sm mx-auto">

        {/* Top drag indicator */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition active:scale-90">
            <ChevronDown className="w-7 h-7 text-white" />
          </button>
          <div className="text-center">
            <p className="text-white/50 text-xs font-bold uppercase tracking-widest">يعزف الآن</p>
          </div>
          <button
            onClick={() => {
              if (!isPremium) { setPremiumFeatureName("ميكس AI (الدي جي الذكي)"); setIsPremiumModalOpen(true); }
              else { setIsAiMix(v => !v); showToast(!isAiMix ? "تم تفعيل ميكس AI 🤖✨" : "تم إيقاف ميكس AI"); }
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${isAiMix ? "bg-white text-black" : "bg-white/10 text-white/70"}`}
          >
            {!isPremium && <Crown className="w-3 h-3 text-amber-400 inline ml-1" />}
            ميكس AI
          </button>
        </div>

        {/* ═══════════ NOW PLAYING TAB ═══════════ */}
        {activeTab === "now" && (
          <div className="flex-1 flex flex-col items-center justify-between px-5 pb-2 overflow-hidden">

            {/* Large Album Art */}
            <motion.div
              key={currentSong?.songId}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 22 }}
              className="relative mt-2 mb-4"
            >
              <div
                className="w-64 h-64 rounded-3xl overflow-hidden shadow-2xl"
                style={{ boxShadow: `0 24px 80px ${accent}55, 0 8px 30px rgba(0,0,0,0.6)` }}
              >
                <img src={proxyArt} alt={currentSong?.title} className="w-full h-full object-cover" />
              </div>
              {/* Spinning vinyl ring when playing */}
              {state.isPlaying && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-[-12px] rounded-[40px] border-2 border-dashed pointer-events-none"
                  style={{ borderColor: `${accent}40` }}
                />
              )}
            </motion.div>

            {/* Song Info + Like */}
            <div className="w-full flex items-center justify-between px-1 mb-3">
              <button onClick={onLike} className="p-2 active:scale-90 transition-transform">
                <Heart
                  className={`w-7 h-7 transition-all ${isLiked ? "fill-current text-pink-400 scale-110" : "text-white/40"}`}
                  style={isLiked ? { filter: `drop-shadow(0 0 8px ${accent})` } : {}}
                />
              </button>
              <div className="flex-1 text-center px-2">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSong?.songId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h2 className="text-white font-black text-xl leading-tight truncate">{currentSong?.title || "—"}</h2>
                    <p className="text-white/55 text-sm font-medium mt-1 truncate">{currentSong?.artist || "فنان"}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
              <button onClick={onDownload} className="p-2 active:scale-90 transition-transform">
                <DownloadCloud className="w-6 h-6 text-white/40 hover:text-white transition-colors" />
              </button>
            </div>

            {/* Waveform Visualizer */}
            <div className="w-full mb-3">
              <WaveformVisualizer isPlaying={state.isPlaying} accent={accent} />
            </div>

            {/* Seek Bar */}
            <div className="w-full px-1 mb-2">
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
              <div className="flex justify-between mt-2 text-[11px] font-bold text-white/40 tabular-nums" dir="ltr">
                <span>{fmtTime(state.currentTime)}</span>
                <span>-{fmtTime(state.duration - state.currentTime)}</span>
              </div>
            </div>

            {/* Main Controls */}
            <div className="flex items-center justify-between w-full px-2 mb-4">
              <button
                onClick={() => setShuffle(!state.shuffle)}
                className={`p-2 transition-colors active:scale-90 ${state.shuffle ? "text-white" : "text-white/30"}`}
                style={state.shuffle ? { filter: `drop-shadow(0 0 6px ${accent})` } : {}}
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button onClick={prev} className="active:scale-90 transition-transform p-2">
                <SkipBack className="text-white w-10 h-10 fill-current" />
              </button>

              <button
                onClick={togglePlay}
                className="w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
                style={{
                  background: "white",
                  boxShadow: `0 8px 32px ${accent}66, 0 4px 16px rgba(0,0,0,0.4)`
                }}
              >
                {state.isBuffering ? (
                  <div className="w-8 h-8 border-4 border-black/10 border-t-black rounded-full animate-spin" />
                ) : state.isPlaying ? (
                  <Pause className="w-9 h-9 fill-current" style={{ color: bg2 }} />
                ) : (
                  <Play className="w-9 h-9 fill-current ml-1" style={{ color: bg2 }} />
                )}
              </button>

              <button onClick={next} className="active:scale-90 transition-transform p-2">
                <SkipForward className="text-white w-10 h-10 fill-current" />
              </button>

              <button
                onClick={cycleRepeat}
                className={`relative p-2 transition-colors active:scale-90 ${state.repeat !== "off" ? "text-white" : "text-white/30"}`}
                style={state.repeat !== "off" ? { filter: `drop-shadow(0 0 6px ${accent})` } : {}}
              >
                <Repeat className="w-5 h-5" />
                {state.repeat === "one" && (
                  <span className="absolute top-0.5 right-0.5 text-[8px] font-black leading-none">1</span>
                )}
              </button>
            </div>

            {/* Volume */}
            <div className="w-full flex items-center gap-3 px-2 mb-2">
              <VolumeX className="w-4 h-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={state.volume}
                  onChange={e => setVolume(parseFloat(e.target.value))}
                  className="w-full h-1 rounded-full cursor-pointer"
                  style={{ accentColor: accent }}
                />
              </div>
              <Volume2 className="w-4 h-4 text-white/30 shrink-0" />
            </div>
          </div>
        )}

        {/* ═══════════ QUEUE TAB ═══════════ */}
        {activeTab === "queue" && (
          <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4" dir="rtl">
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

        {/* ═══════════ AUDIO TAB ═══════════ */}
        {activeTab === "audio" && (
          <div className="flex-1 flex flex-col justify-center items-center p-8 space-y-10">
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between text-white font-bold text-sm">
                <VolumeX className="w-5 h-5 text-white/50" />
                <span>مستوى الصوت</span>
                <Volume2 className="w-5 h-5 text-white/50" />
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                value={state.volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full cursor-pointer"
                style={{ accentColor: accent }}
              />
            </div>

            <button
              onClick={() => {
                if (!isPremium) { setPremiumFeatureName("جودة الصوت الخارقة (HQ)"); setIsPremiumModalOpen(true); }
                else {
                  const newVal = !state.isHighQuality;
                  setHighQuality(newVal);
                  showToast(newVal ? "تم تفعيل جودة الصوت الخارقة 🎧✨" : "تم إيقاف الجودة الخارقة", "hq");
                }
              }}
              className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-black text-lg transition-all ${
                state.isHighQuality
                  ? "text-black shadow-2xl"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
              style={state.isHighQuality ? {
                background: `linear-gradient(135deg, #f59e0b, #ef4444)`,
                boxShadow: `0 0 30px rgba(245,158,11,0.4)`
              } : {}}
            >
              <span className="border-2 border-current px-2 rounded-lg">HQ</span>
              جودة صوت خارقة
              {!isPremium && <Crown className="w-5 h-5 text-amber-400 drop-shadow-md" />}
            </button>
          </div>
        )}

        {/* ═══════════ PREMIUM TAB ═══════════ */}
        {activeTab === "premium" && (
          <div className="flex-1 flex flex-col justify-center items-center p-8 space-y-8" dir="rtl">
            <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl" style={{ background: `linear-gradient(135deg, ${accent}, ${bg1})`, boxShadow: `0 0 40px ${accent}55` }}>
              <Crown className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-2 text-center">
              <h3 className="text-2xl font-black text-white">التشغيل في الخلفية</h3>
              <p className="text-white/60 text-sm px-4 leading-relaxed">
                استمتع بالموسيقى بدون توقف حتى لو أغلقت الشاشة أو خرجت من التطبيق.
              </p>
            </div>
            <button
              onClick={() => {
                if (!isPremium) { setPremiumFeatureName("التشغيل المفتوح في الخلفية"); setIsPremiumModalOpen(true); }
                else { setIsBgPlayEnabled(v => !v); showToast(!isBgPlayEnabled ? "تم تفعيل التشغيل في الخلفية 🚀" : "تم إيقاف التشغيل في الخلفية"); }
              }}
              className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-black text-lg transition-all border ${
                isBgPlayEnabled && isPremium
                  ? "bg-white text-indigo-900 border-white"
                  : "bg-white/5 text-white border-white/20 hover:bg-white/10"
              }`}
            >
              <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center">
                {isBgPlayEnabled && isPremium && <div className="w-2 h-2 bg-current rounded-full" />}
              </div>
              {isBgPlayEnabled && isPremium ? "مفعل — يعمل في الخلفية" : "تفعيل الميزة"}
              {!isPremium && <Crown className="w-5 h-5 text-amber-400 drop-shadow-md ml-auto mr-[-10px]" />}
            </button>
          </div>
        )}

        {/* ─── Bottom Tab Navigation ─── */}
        <div
          className="flex items-center justify-around px-4 py-3 border-t mt-auto shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)", paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        >
          {[
            { id: "now", icon: Music2, label: "يعزف" },
            { id: "queue", icon: ListMusic, label: "قائمة" },
            { id: "audio", icon: Settings, label: "الصوت" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all font-bold text-xs ${
                activeTab === tab.id ? "text-white" : "text-white/30"
              }`}
              style={activeTab === tab.id ? { background: `${accent}22` } : {}}
            >
              <tab.icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          ))}
          <button
            onClick={() => {
              if (!isPremium) { setPremiumFeatureName("التشغيل في الخلفية والميزات الحصرية"); setIsPremiumModalOpen(true); return; }
              setActiveTab("premium");
            }}
            className={`relative flex flex-col items-center gap-1 px-4 py-1.5 rounded-2xl transition-all font-bold text-xs ${
              activeTab === "premium" ? "text-white" : "text-amber-400/60"
            }`}
            style={activeTab === "premium" ? { background: `${accent}22` } : {}}
          >
            <Crown className="w-5 h-5" />
            <span>حصرية</span>
            {!isPremium && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />}
          </button>
        </div>

      </div>
    </motion.div>
  );
}

// ─── Mini Player Bar ──────────────────────────────────────────────────
export function PlayerBar() {
  const { state, currentSong, next, prev, togglePlay, setVolume, seekTo, cycleRepeat, setShuffle, setHighQuality } = usePlayer();
  const [isLiked, setIsLiked] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState("");
  const { addToast } = useToastStore();

  const isPremium = typeof window !== "undefined" && localStorage.getItem("aura_user_tier") === "premium";

  // Like state
  useEffect(() => {
    if (!currentSong?.songId) return;
    fetch(`/api/likes?songId=${currentSong.songId}`)
      .then(r => r.json())
      .then(d => setIsLiked(d.liked))
      .catch(() => {});
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
    addToast(`جاري تحميل "${currentSong.title}"... 🚀`);
    const ok = await downloadSong(currentSong.songId, currentSong.youtubeVideoId, {
      title: currentSong.title, artist: currentSong.artist || "فنان", thumbnailUrl: currentSong.thumbnailUrl, folderName: currentSong.artist || "أخرى"
    });
    addToast(ok ? "تم الحفظ للأوفلاين ✅" : "فشل التحميل ❌", ok ? "success" : "error");
  };

  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;
  const pct = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  if (!currentSong) return null;

  return (
    <>
      {/* Full Player */}
      <AnimatePresence>
        {fullOpen && (
          <FullPlayer
            onClose={() => setFullOpen(false)}
            isLiked={isLiked}
            onLike={toggleLike}
            onDownload={handleDownload}
            isPremium={isPremium}
            setIsPremiumModalOpen={setIsPremiumModalOpen}
            setPremiumFeatureName={setPremiumFeatureName}
            showToast={addToast}
          />
        )}
      </AnimatePresence>

      {/* Mini Bar */}
      <footer
        className="fixed left-0 right-0 z-30 md:bottom-0"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 58px)" }}
      >
        {/* Progress bar at top edge */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/10" dir="ltr">
          <SeekBar
            progress={state.currentTime}
            duration={state.duration}
            onSeek={seekTo}
            height="h-full"
            rtl={false}
            isPremium={isPremium}
            onPremiumClick={() => { setPremiumFeatureName("تقديم وتأخير الأغنية"); setIsPremiumModalOpen(true); }}
          />
        </div>

        <div className="glass-dark border-t border-white/5 px-4 py-3 flex items-center gap-4">
          {/* Art + Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer group" onClick={() => setFullOpen(true)}>
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-lg">
              <img src={getProxyUrl(art)} alt={currentSong.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              {state.isPlaying && <div className="absolute inset-0 rounded-xl border-2 border-indigo-500/60 animate-pulse" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate text-white group-hover:text-indigo-300 transition-colors">
                {state.isBuffering && state.currentTime === 0 ? "جاري التجهيز..." : currentSong.title}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {state.isBuffering && state.currentTime === 0 ? "يتم جلب أفضل جودة" : (currentSong.artist || "فنان")}
              </p>
            </div>
            <Maximize2 className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors shrink-0 ml-1" />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => setShuffle(!state.shuffle)} className={`hidden md:block transition-colors ${state.shuffle ? "text-indigo-400" : "text-gray-500 hover:text-white"}`}>
              <Shuffle className="w-4 h-4" />
            </button>
            <button onClick={prev} className="text-gray-300 hover:text-white transition-colors active:scale-90">
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg">
              {state.isBuffering ? (
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              ) : state.isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
            <button onClick={next} className="text-gray-300 hover:text-white transition-colors active:scale-90">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
            <button onClick={cycleRepeat} className={`hidden md:block relative transition-colors ${state.repeat !== "off" ? "text-indigo-400" : "text-gray-500 hover:text-white"}`}>
              <Repeat className="w-4 h-4" />
              {state.repeat === "one" && <span className="absolute -top-1 -right-1 text-[7px] font-black">1</span>}
            </button>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleLike}>
              <Heart className={`w-5 h-5 transition-colors ${isLiked ? "text-pink-500 fill-current" : "text-gray-500 hover:text-white"}`} />
            </button>
            <button onClick={handleDownload} className="text-gray-500 hover:text-indigo-400 transition-colors hidden md:block">
              <DownloadCloud className="w-4 h-4" />
            </button>
            <div className="hidden md:flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-gray-500" />
              <input type="range" min="0" max="1" step="0.01" value={state.volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-20 accent-indigo-400 h-1 cursor-pointer" />
            </div>
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
