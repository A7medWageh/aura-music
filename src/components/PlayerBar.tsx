"use client";

import {
  Play, Pause, SkipForward, SkipBack, Shuffle,
  Repeat, Volume2, VolumeX, Heart, DownloadCloud,
  ChevronDown, Maximize2, ListMusic, Share2, CheckCircle2
} from "lucide-react";
import { usePlayer } from "@/state/playerContext";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getProxyUrl } from "@/utils/media";
import { downloadSong } from "@/services/offline/downloader";
import { upsertFavorite, removeFavorite } from "@/services/user/favoritesStore";

// ─── Helpers ─────────────────────────────────────────────────────────
function fmtTime(s: number) {
  if (!s || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

// ─── Seek Bar ────────────────────────────────────────────────────────
function SeekBar({
  progress, duration, onSeek, height = "h-1", rtl = true
}: {
  progress: number; duration: number; onSeek: (t: number) => void;
  height?: string; rtl?: boolean;
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
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => handleUpdate(e.clientX);
    const onUp = (e: MouseEvent) => {
      onSeek(calculatePos(e.clientX) * duration);
      setIsDragging(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, duration]);

  // Touch support for mobile
  useEffect(() => {
    if (!isDragging) return;
    const onTouchMove = (e: TouchEvent) => handleUpdate(e.touches[0].clientX);
    const onTouchEnd = (e: TouchEvent) => {
        onSeek(calculatePos(e.changedTouches[0].clientX) * duration);
        setIsDragging(false);
    };
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
    }
  }, [isDragging, duration]);

  const displayProgress = isDragging ? dragProgress : progress;
  const pct = duration > 0 ? (displayProgress / duration) * 100 : 0;

  return (
    <div
      ref={barRef}
      onMouseDown={(e) => {
        setIsDragging(true);
        handleUpdate(e.clientX);
      }}
      onTouchStart={(e) => {
        setIsDragging(true);
        handleUpdate(e.touches[0].clientX);
      }}
      className={`relative w-full ${height} bg-white/10 rounded-full cursor-pointer group`}
    >
      {/* Background track (behind progress) */}
      <div className="absolute inset-0 bg-white/5 rounded-full" />
      
      {/* Progress fill */}
      <div
        className={`absolute inset-y-0 right-0 bg-white rounded-full transition-all ${isDragging ? "" : "duration-200"}`}
        style={{ width: `${pct}%` }}
      />
      
      {/* Knob */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-xl transition-transform ${isDragging ? "scale-125" : "scale-100 opacity-0 group-hover:opacity-100"}`}
        style={{ right: `calc(${pct}% - 7px)` }}
      />
    </div>
  );
}

// ─── Full Screen Player ───────────────────────────────────────────────
function FullPlayer({
  onClose, isLiked, onLike, onDownload
}: {
  onClose: () => void; isLiked: boolean;
  onLike: () => void; onDownload: () => void;
}) {
  const { state, currentSong, togglePlay, next, prev, seekTo, setVolume, cycleRepeat, setShuffle } = usePlayer();
  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 220 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
    >
      {/* Blurred BG */}
      <div className="absolute inset-0">
        <img src={getProxyUrl(art)} alt="" className="w-full h-full object-cover scale-110 blur-3xl opacity-40" />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 flex flex-col h-full px-8 pt-6 pb-10 max-w-xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition">
            <ChevronDown className="w-7 h-7 text-white" />
          </button>
          <div className="text-center">
            <p className="text-xs text-white/50 uppercase tracking-widest">يتم التشغيل الآن</p>
          </div>
          <button className="p-2 rounded-full hover:bg-white/10 transition">
            <Share2 className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Album Art */}
        <motion.div
          key={currentSong?.songId}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: state.isPlaying ? 1 : 0.9, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mx-auto w-72 h-72 md:w-80 md:h-80 rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.6)] mb-10"
        >
          <img src={getProxyUrl(art)} alt={currentSong?.title} className="w-full h-full object-cover" />
        </motion.div>

        {/* Song Info + Like */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black truncate text-white">{currentSong?.title || "—"}</h2>
            <p className="text-sm text-white/60 truncate mt-1">{currentSong?.artist || "فنان"}</p>
          </div>
          <button onClick={onLike} className="ml-4 shrink-0">
            <Heart className={`w-7 h-7 transition-colors ${isLiked ? "text-pink-500 fill-current" : "text-white/40 hover:text-white"}`} />
          </button>
        </div>

        {/* Seek Bar */}
        <div className="mb-2">
          <SeekBar progress={state.currentTime} duration={state.duration} onSeek={seekTo} height="h-1.5" />
          <div className="flex justify-between mt-2 text-xs text-white/40 tabular-nums">
            <span>{fmtTime(state.currentTime)}</span>
            <span>{fmtTime(state.duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setShuffle(!state.shuffle)}
            className={`p-3 rounded-full transition-colors ${state.shuffle ? "text-indigo-400" : "text-white/40 hover:text-white"}`}>
            <Shuffle className="w-5 h-5" />
          </button>
          <button onClick={prev} className="p-3 rounded-full text-white hover:text-white/80 transition">
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="w-18 h-18 w-[72px] h-[72px] rounded-full bg-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-transform"
          >
            {state.isBuffering ? (
              <div className="flex flex-col items-center">
                 <div className="w-7 h-7 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : state.isPlaying ? (
              <Pause className="w-7 h-7 text-black fill-current" />
            ) : (
              <Play className="w-7 h-7 text-black fill-current ml-1" />
            )}
          </button>

          <button onClick={next} className="p-3 rounded-full text-white hover:text-white/80 transition">
            <SkipForward className="w-7 h-7 fill-current" />
          </button>
          <button onClick={cycleRepeat}
            className={`p-3 rounded-full relative transition-colors ${state.repeat !== "off" ? "text-indigo-400" : "text-white/40 hover:text-white"}`}>
            <Repeat className="w-5 h-5" />
            {state.repeat === "one" && <span className="absolute -top-0 -right-0 text-[8px] font-black bg-indigo-500 text-white w-4 h-4 rounded-full flex items-center justify-center">1</span>}
          </button>
        </div>

        {/* Volume + Download */}
        <div className="flex items-center gap-4 mt-8">
          <VolumeX className="w-4 h-4 text-white/40" />
          <input type="range" min="0" max="1" step="0.01" value={state.volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="flex-1 accent-white h-1 cursor-pointer" />
          <Volume2 className="w-4 h-4 text-white/40" />
          <button onClick={onDownload} className="ml-2 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition">
            <DownloadCloud className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Mini Player Bar ──────────────────────────────────────────────────
export function PlayerBar() {
  const { state, currentSong, togglePlay, next, prev, setVolume, seekTo, cycleRepeat, setShuffle } = usePlayer();
  const [progress, setProgress] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // Sync local progress
  useEffect(() => {
    if (!state.isBuffering) setProgress(state.currentTime);
  }, [state.currentTime, state.isBuffering]);

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
      // Persist song metadata client-side so Favorites page survives reload
      if (d.liked) {
        upsertFavorite({
          songId: currentSong.songId,
          title: currentSong.title,
          artist: currentSong.artist || "فنان",
          thumbnailUrl: currentSong.thumbnailUrl,
          youtubeVideoId: currentSong.youtubeVideoId,
        });
      } else {
        removeFavorite(currentSong.songId);
      }
      showToast(d.liked ? "تمت الإضافة للمفضلة ❤️" : "تمت الإزالة من المفضلة");
    }
  };

  const handleDownload = async () => {
    if (!currentSong) return;
    showToast(`جاري تحميل "${currentSong.title}"...`);
    const ok = await downloadSong(currentSong.songId, currentSong.youtubeVideoId, {
      title: currentSong.title,
      artist: currentSong.artist || "فنان",
      thumbnailUrl: currentSong.thumbnailUrl,
      folderName: currentSong.artist || "أخرى"
    });
    showToast(ok ? "تم الحفظ للأوفلاين ✅" : "فشل التحميل ❌");
  };

  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;
  const pct = state.duration > 0 ? (progress / state.duration) * 100 : 0;

  if (!currentSong) return null;

  return (
    <>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-28 right-8 z-50 px-5 py-2.5 glass rounded-full border border-indigo-500/30 flex items-center gap-2 shadow-xl text-sm font-bold">
            <CheckCircle2 className="w-4 h-4 text-indigo-400" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Player */}
      <AnimatePresence>
        {fullOpen && (
          <FullPlayer
            onClose={() => setFullOpen(false)}
            isLiked={isLiked} onLike={toggleLike} onDownload={handleDownload}
          />
        )}
      </AnimatePresence>

      {/* Mini Bar — on mobile, sits above the bottom tab bar */}
      <footer className="fixed left-0 right-0 z-30 bottom-[65px] md:bottom-0">
        {/* Interactive Seek Bar at very top of mini-bar */}
        <div className="h-1 relative group">
          <SeekBar progress={state.currentTime} duration={state.duration} onSeek={seekTo} height="h-full" />
        </div>

        <div className="glass-dark border-t border-white/5 px-4 py-3 flex items-center gap-4">
          {/* Art + Info — click to open full player */}
          <div
            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer group"
            onClick={() => setFullOpen(true)}
          >
            <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-lg">
              <img src={getProxyUrl(art)} alt={currentSong.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              {/* Spinning ring when playing */}
              {state.isPlaying && (
                <div className="absolute inset-0 rounded-xl border-2 border-indigo-500/60 animate-pulse" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate text-white group-hover:text-indigo-400 transition-colors">
                {state.isBuffering && state.currentTime === 0 ? "جاري التجهيز..." : currentSong.title}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {state.isBuffering && state.currentTime === 0 ? "يتم جلب أفضل جودة" : (currentSong.artist || "فنان")}
              </p>
            </div>
            <Maximize2 className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors shrink-0 ml-1" />
          </div>

          {/* Center Controls */}
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => setShuffle(!state.shuffle)}
              className={`hidden md:block transition-colors ${state.shuffle ? "text-indigo-400" : "text-gray-500 hover:text-white"}`}>
              <Shuffle className="w-4 h-4" />
            </button>
            <button onClick={prev} className="text-gray-300 hover:text-white transition-colors">
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg"
            >
              {state.isBuffering ? (
                <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              ) : state.isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
            <button onClick={next} className="text-gray-300 hover:text-white transition-colors">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
            <button onClick={cycleRepeat}
              className={`hidden md:block relative transition-colors ${state.repeat !== "off" ? "text-indigo-400" : "text-gray-500 hover:text-white"}`}>
              <Repeat className="w-4 h-4" />
              {state.repeat === "one" && <span className="absolute -top-1 -right-1 text-[7px] font-black">1</span>}
            </button>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleLike}>
              <Heart className={`w-5 h-5 transition-colors ${isLiked ? "text-pink-500 fill-current" : "text-gray-500 hover:text-white"}`} />
            </button>
            <button onClick={handleDownload} className="text-gray-500 hover:text-indigo-400 transition-colors hidden md:block">
              <DownloadCloud className="w-4 h-4" />
            </button>
            <div className="hidden md:flex items-center gap-1.5 group">
              <Volume2 className="w-3.5 h-3.5 text-gray-500" />
              <input type="range" min="0" max="1" step="0.01" value={state.volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-20 accent-indigo-500 h-1 cursor-pointer" />
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
