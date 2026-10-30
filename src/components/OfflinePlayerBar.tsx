"use client";

import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  Heart,
  ChevronDown,
  ListMusic,
  Sliders,
  Moon,
  Car,
  FileText,
  Sparkles,
  Zap,
  RotateCcw,
  RotateCw,
  X,
  Music2,
  Check,
  Disc3,
  Flame,
} from "lucide-react";
import { useOfflinePlayer, EQ_PRESETS, EqualizerPreset } from "@/state/offlinePlayerContext";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getProxyUrl } from "@/utils/media";
import { upsertFavorite, removeFavorite, isFavoriteLocal } from "@/services/user/favoritesStore";
import { useToastStore } from "@/state/toastStore";

function fmtTime(s: number) {
  if (!s || isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function OfflinePlayerBar() {
  const {
    currentSong,
    hasActiveSong,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    next,
    prev,
    seekTo,
    repeat,
    cycleRepeat,
    shuffle,
    toggleShuffle,
    speed,
    setSpeed,
    isExpanded,
    setIsExpanded,
    isCarMode,
    setIsCarMode,
    abLoop,
    setAbPointA,
    setAbPointB,
    clearAbLoop,
    sleepTimer,
    startSleepTimer,
    cancelSleepTimer,
    equalizer,
    setEqualizerPreset,
    setEqualizerBand,
    setBassBoost,
    setSurround3d,
    audioDetails,
    lyrics,
    queue,
    currentIndex,
    playSongList,
    closeOfflinePlayer,
  } = useOfflinePlayer();

  const [isLiked, setIsLiked] = useState(false);
  const [showEqModal, setShowEqModal] = useState(false);
  const [showSleepModal, setShowSleepModal] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [showLyricsModal, setShowLyricsModal] = useState(false);
  const { addToast } = useToastStore();

  // Favorite toggle
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
      addToast("تمت الإضافة إلى المفضلة ❤️");
    } else {
      removeFavorite(currentSong.songId);
      addToast("تمت الإزالة من المفضلة");
    }
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const artUrl = currentSong?.thumbnailUrl ? getProxyUrl(currentSong.thumbnailUrl) : "/placeholder-song.jpg";

  if (!hasActiveSong || !currentSong) return null;

  return (
    <>
      {/* ─── CAR MODE (وضع القيادة الاحترافي) ────────────────────────────────── */}
      <AnimatePresence>
        {isCarMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[120] bg-black text-white flex flex-col justify-between p-6 sm:p-10 select-none"
            dir="rtl"
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <Car className="w-8 h-8 text-[#00e5ff]" />
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">وضع القيادة 🚗</h2>
                  <p className="text-xs sm:text-sm text-gray-400 font-bold">مشغل الأوفلاين السريع</p>
                </div>
              </div>

              <button
                onClick={() => setIsCarMode(false)}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-black text-sm flex items-center gap-2 active:scale-95 transition-all"
              >
                <X className="w-5 h-5" />
                <span>خروج</span>
              </button>
            </div>

            {/* Song Meta (Giant for driving glance) */}
            <div className="flex flex-col items-center text-center my-auto space-y-4 px-4">
              <div className="w-44 h-44 sm:w-64 sm:h-64 rounded-3xl overflow-hidden shadow-2xl border-2 border-[#00e5ff]/30 relative">
                <img src={artUrl} alt="" className="w-full h-full object-cover" />
                {isPlaying && (
                  <div className="absolute inset-0 bg-[#00e5ff]/10 animate-pulse pointer-events-none" />
                )}
              </div>

              <div className="space-y-2 max-w-xl">
                <h1 className="text-3xl sm:text-5xl font-black text-white truncate drop-shadow-md">
                  {currentSong.title}
                </h1>
                <p className="text-xl sm:text-2xl font-bold text-[#00e5ff] truncate">
                  {currentSong.artist}
                </p>
              </div>

              <div className="text-sm font-black text-gray-400 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </div>
            </div>

            {/* Massive Driving Controls */}
            <div className="grid grid-cols-3 items-center gap-4 max-w-2xl mx-auto w-full pb-6">
              <button
                onClick={prev}
                className="h-24 sm:h-28 rounded-3xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/15"
                title="السابق"
              >
                <SkipBack className="w-12 h-12 text-white" />
              </button>

              <button
                onClick={togglePlay}
                className="h-28 sm:h-32 rounded-3xl bg-gradient-to-r from-[#00e5ff] to-[#00b4d8] text-black active:scale-95 transition-all flex items-center justify-center shadow-2xl shadow-[#00e5ff]/40"
                title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
              >
                {isPlaying ? (
                  <Pause className="w-16 h-16 fill-black text-black" />
                ) : (
                  <Play className="w-16 h-16 fill-black text-black ml-1" />
                )}
              </button>

              <button
                onClick={next}
                className="h-24 sm:h-28 rounded-3xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/15"
                title="التالي"
              >
                <SkipForward className="w-12 h-12 text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── FULLSCREEN EXPANDED PLAYER (المشغل الموسيقي المكتمل) ──────────── */}
      <AnimatePresence>
        {isExpanded && !isCarMode && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: "0%" }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed inset-0 z-[100] bg-[#08090d]/98 backdrop-blur-3xl text-white flex flex-col justify-between overflow-y-auto"
            style={{
              paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
              paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
            }}
            dir="rtl"
          >
            {/* Ambient dynamic background lighting */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
              <div
                className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-[140px] opacity-25"
                style={{ backgroundColor: "#00e5ff" }}
              />
            </div>

            {/* Top Bar Header */}
            <div className="flex items-center justify-between px-6 py-2 shrink-0">
              <button
                onClick={() => setIsExpanded(false)}
                className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all active:scale-90 border border-white/10"
                title="تصغير المشغل"
              >
                <ChevronDown className="w-6 h-6" />
              </button>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-ping" />
                  <span className="text-xs font-black tracking-wider text-[#00e5ff] uppercase">
                    مشغل الأوفلاين الاحترافي
                  </span>
                </div>
                <h3 className="text-sm font-bold text-gray-400 truncate max-w-[220px]">
                  {currentSong.albumName || "مكتبة الأغاني المحملة"}
                </h3>
              </div>

              {/* Quick Actions Header */}
              <div className="flex items-center gap-1.5">
                {/* Car Mode */}
                <button
                  onClick={() => setIsCarMode(true)}
                  className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-[#00e5ff] border border-white/10 transition-all active:scale-95"
                  title="وضع القيادة"
                >
                  <Car className="w-5 h-5" />
                </button>

                {/* EQ Modal */}
                <button
                  onClick={() => setShowEqModal(true)}
                  className={`p-2.5 rounded-2xl border transition-all active:scale-95 ${
                    equalizer.enabled
                      ? "bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/50"
                      : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10"
                  }`}
                  title="معدل الصوت (Equalizer)"
                >
                  <Sliders className="w-5 h-5" />
                </button>

                {/* Sleep Timer */}
                <button
                  onClick={() => setShowSleepModal(true)}
                  className={`p-2.5 rounded-2xl border transition-all active:scale-95 relative ${
                    sleepTimer.active
                      ? "bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/50"
                      : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10"
                  }`}
                  title="مؤقت النوم"
                >
                  <Moon className="w-5 h-5" />
                  {sleepTimer.active && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#00e5ff] rounded-full ring-2 ring-black" />
                  )}
                </button>

                {/* Queue List */}
                <button
                  onClick={() => setShowQueueModal(true)}
                  className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition-all active:scale-95"
                  title="قائمة الانتظار"
                >
                  <ListMusic className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Center: Big Vinyl Album Art with Smooth Glow */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-4 min-h-0">
              <div className="relative group max-w-[320px] sm:max-w-[380px] w-full aspect-square">
                {/* Glow behind */}
                <div
                  className="absolute inset-0 rounded-3xl blur-2xl opacity-30 transition-all duration-700"
                  style={{
                    backgroundColor: isPlaying ? "#00e5ff" : "transparent",
                    transform: isPlaying ? "scale(1.05)" : "scale(0.95)",
                  }}
                />

                <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl border border-white/15 bg-black/40">
                  <img
                    src={artUrl}
                    alt={currentSong.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  {isPlaying && (
                    <div className="absolute top-4 left-4 p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[#00e5ff]">
                      <Disc3 className="w-5 h-5 animate-spin" style={{ animationDuration: "4s" }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Title & Artist & Pro Badge */}
              <div className="w-full max-w-md text-center mt-6 space-y-1.5">
                <div className="flex items-center justify-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-white truncate drop-shadow-md">
                    {currentSong.title}
                  </h1>
                  <button onClick={toggleLike} className="active:scale-90 transition-transform">
                    <Heart
                      className={`w-5 h-5 ${
                        isLiked ? "fill-rose-500 text-rose-500" : "text-gray-400 hover:text-white"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-sm sm:text-base font-bold text-gray-400 truncate">
                  {currentSong.artist || "فنان"}
                </p>

                <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                  <span className="text-[10px] font-black text-[#00e5ff] bg-[#00e5ff]/10 border border-[#00e5ff]/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    <span>أوفلاين محلي (بدون نت)</span>
                  </span>
                  {audioDetails && (
                    <span className="text-[10px] font-bold text-gray-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                      {audioDetails.mimeType} · {audioDetails.sizeMB}
                    </span>
                  )}
                  {lyrics && (
                    <button
                      onClick={() => setShowLyricsModal(true)}
                      className="text-[10px] font-black text-purple-300 bg-purple-500/20 border border-purple-500/40 px-2.5 py-0.5 rounded-full flex items-center gap-1 hover:bg-purple-500/30 transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      <span>عرض الكلمات</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Controls Area */}
            <div className="px-6 sm:px-12 pb-4 space-y-5 max-w-xl mx-auto w-full shrink-0">
              {/* Progress Slider */}
              <div className="space-y-1.5">
                <div className="relative group cursor-pointer py-2">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => seekTo(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/15 rounded-full appearance-none outline-none accent-[#00e5ff] cursor-pointer group-hover:h-2 transition-all"
                    style={{
                      background: `linear-gradient(to left, #00e5ff ${progressPct}%, rgba(255,255,255,0.15) ${progressPct}%)`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-bold text-gray-400 font-mono">
                  <span>{fmtTime(currentTime)}</span>
                  <span>{fmtTime(duration)}</span>
                </div>
              </div>

              {/* Main Player Action Buttons */}
              <div className="flex items-center justify-between gap-2">
                {/* Shuffle */}
                <button
                  onClick={toggleShuffle}
                  className={`p-3 rounded-2xl transition-all active:scale-90 ${
                    shuffle ? "text-[#00e5ff] bg-[#00e5ff]/15" : "text-gray-400 hover:text-white"
                  }`}
                  title="تشغيل عشوائي"
                >
                  <Shuffle className="w-5 h-5" />
                </button>

                {/* Prev */}
                <button
                  onClick={prev}
                  className="p-3 text-white hover:text-[#00e5ff] transition-all active:scale-90"
                  title="السابق"
                >
                  <SkipBack className="w-7 h-7" />
                </button>

                {/* Rewind 10s */}
                <button
                  onClick={() => seekTo(currentTime - 10)}
                  className="p-2 text-gray-400 hover:text-white transition-all active:scale-90"
                  title="رجوع 10 ثواني"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                {/* Play / Pause Giant Button */}
                <button
                  onClick={togglePlay}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-[#00e5ff] to-[#00b4d8] text-black flex items-center justify-center shadow-xl shadow-[#00e5ff]/30 active:scale-95 hover:scale-105 transition-all"
                  title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-black text-black" />
                  ) : (
                    <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-black text-black ml-1" />
                  )}
                </button>

                {/* Forward 10s */}
                <button
                  onClick={() => seekTo(currentTime + 10)}
                  className="p-2 text-gray-400 hover:text-white transition-all active:scale-90"
                  title="تقديم 10 ثواني"
                >
                  <RotateCw className="w-5 h-5" />
                </button>

                {/* Next */}
                <button
                  onClick={next}
                  className="p-3 text-white hover:text-[#00e5ff] transition-all active:scale-90"
                  title="التالي"
                >
                  <SkipForward className="w-7 h-7" />
                </button>

                {/* Repeat */}
                <button
                  onClick={cycleRepeat}
                  className={`p-3 rounded-2xl transition-all active:scale-90 relative ${
                    repeat !== "off" ? "text-[#00e5ff] bg-[#00e5ff]/15" : "text-gray-400 hover:text-white"
                  }`}
                  title="تكرار"
                >
                  <Repeat className="w-5 h-5" />
                  {repeat === "one" && (
                    <span className="absolute top-2 right-2 text-[9px] font-black leading-none bg-[#00e5ff] text-black rounded-full px-1">
                      1
                    </span>
                  )}
                </button>
              </div>

              {/* Extra Pro Controls Bar: Speed & A-B Loop */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs font-bold text-gray-400">
                {/* Speed Toggle */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500">السرعة:</span>
                  {[0.75, 1, 1.25, 1.5].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setSpeed(spd)}
                      className={`px-2 py-1 rounded-lg transition-all ${
                        speed === spd
                          ? "bg-[#00e5ff] text-black font-black"
                          : "bg-white/5 text-gray-400 hover:text-white"
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                {/* A-B Loop Controls */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-gray-500">مقطع A-B:</span>
                  <button
                    onClick={setAbPointA}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-black ${
                      abLoop.start !== null
                        ? "bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]"
                        : "bg-white/5 text-gray-400 border-white/10"
                    }`}
                    title="تحديد بداية المقطع"
                  >
                    A {abLoop.start !== null && `(${fmtTime(abLoop.start)})`}
                  </button>
                  <button
                    onClick={setAbPointB}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-black ${
                      abLoop.end !== null
                        ? "bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]"
                        : "bg-white/5 text-gray-400 border-white/10"
                    }`}
                    title="تحديد نهاية المقطع"
                  >
                    B {abLoop.end !== null && `(${fmtTime(abLoop.end)})`}
                  </button>
                  {abLoop.active && (
                    <button
                      onClick={clearAbLoop}
                      className="p-1 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                      title="إلغاء تكرار المقطع"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── MINI PLAYER BAR (الشريط السفلي للمشغل) ────────────────────────── */}
      <footer
        className="fixed left-0 right-0 z-30 transition-all duration-300 ease-out"
        style={{
          opacity: isExpanded || isCarMode ? 0 : 1,
          pointerEvents: isExpanded || isCarMode ? "none" : "auto",
          bottom:
            typeof window !== "undefined" && window.innerWidth >= 768
              ? "0px"
              : "calc(env(safe-area-inset-bottom, 0px) + 58px)",
        }}
        dir="rtl"
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <div className="relative rounded-2xl bg-[#090b10]/95 backdrop-blur-2xl border border-[#00e5ff]/20 shadow-2xl shadow-black/80 p-2 sm:p-2.5 flex items-center justify-between gap-3 overflow-hidden">
            {/* Top Micro Progress Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-[#00b4d8] to-[#00e5ff] transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Left: Thumbnail & Song Title (Click to expand) */}
            <div
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group"
            >
              <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 border border-white/10 shadow-md">
                <img src={artUrl} alt="" className="w-full h-full object-cover" />
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Disc3 className="w-5 h-5 text-[#00e5ff] animate-spin" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-black text-xs sm:text-sm text-white truncate group-hover:text-[#00e5ff] transition-colors">
                    {currentSong.title}
                  </h4>
                  <span className="text-[9px] font-black px-1.5 py-0.2 bg-[#00e5ff]/20 text-[#00e5ff] rounded-md border border-[#00e5ff]/30 shrink-0">
                    أوفلاين ⚡
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs font-bold text-gray-400 truncate mt-0.5">
                  {currentSong.artist || "فنان"}
                </p>
              </div>
            </div>

            {/* Center/Right: Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                onClick={toggleLike}
                className="p-2 text-gray-400 hover:text-rose-400 active:scale-90 transition-all hidden sm:flex"
                title="إضافة للمفضلة"
              >
                <Heart
                  className={`w-5 h-5 ${isLiked ? "fill-rose-500 text-rose-500" : ""}`}
                />
              </button>

              <button
                onClick={prev}
                className="p-2 text-gray-300 hover:text-white active:scale-90 transition-all"
                title="السابق"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={togglePlay}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#00e5ff] hover:bg-[#38bdf8] text-black flex items-center justify-center shadow-lg shadow-[#00e5ff]/30 active:scale-95 transition-all"
                title={isPlaying ? "إيقاف مؤقت" : "تشغيل"}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-black text-black" />
                ) : (
                  <Play className="w-5 h-5 fill-black text-black ml-0.5" />
                )}
              </button>

              <button
                onClick={next}
                className="p-2 text-gray-300 hover:text-white active:scale-90 transition-all"
                title="التالي"
              >
                <SkipForward className="w-5 h-5" />
              </button>

              <button
                onClick={() => setIsExpanded(true)}
                className="p-2 text-gray-400 hover:text-white active:scale-90 transition-all"
                title="توسيع المشغل"
              >
                <ChevronDown className="w-5 h-5 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── EQUALIZER MODAL (معدل الصوت المتقدم) ─────────────────────────── */}
      <AnimatePresence>
        {showEqModal && (
          <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0b0d13] border border-white/15 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-[#00e5ff]">
                  <Sliders className="w-5 h-5" />
                  <h3 className="text-lg font-black text-white">إيكولايزر احترافي (EQ)</h3>
                </div>
                <button
                  onClick={() => setShowEqModal(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-white bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Presets Chips */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400">الأنماط الجاهزة:</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(EQ_PRESETS) as EqualizerPreset[]).map((pKey) => {
                    const preset = EQ_PRESETS[pKey];
                    const active = equalizer.preset === pKey;
                    return (
                      <button
                        key={pKey}
                        onClick={() => setEqualizerPreset(pKey)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all truncate border ${
                          active
                            ? "bg-[#00e5ff] text-black font-black border-[#00e5ff] shadow-md shadow-[#00e5ff]/20"
                            : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {preset.label.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5-Band Vertical Sliders */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400">الترددات الـ 5 (dB):</label>
                <div className="flex items-center justify-between gap-3 bg-black/40 p-4 rounded-2xl border border-white/5">
                  {["60Hz", "230Hz", "910Hz", "3.6k", "14k"].map((freq, idx) => (
                    <div key={freq} className="flex flex-col items-center gap-2 flex-1">
                      <span className="text-[10px] font-mono text-[#00e5ff]">
                        {equalizer.bands[idx] > 0 ? `+${equalizer.bands[idx]}` : equalizer.bands[idx]}
                      </span>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={1}
                        value={equalizer.bands[idx]}
                        onChange={(e) => setEqualizerBand(idx, parseFloat(e.target.value))}
                        className="h-28 w-2 appearance-none bg-white/20 rounded-full outline-none accent-[#00e5ff] cursor-pointer"
                        style={{
                          writingMode: "vertical-lr",
                          direction: "rtl",
                        }}
                      />
                      <span className="text-[10px] font-bold text-gray-400">{freq}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bass Boost Slider */}
              <div className="space-y-2 bg-white/5 p-3 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-white">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span>تضخيم الباس الفائق (Bass Boost)</span>
                  </span>
                  <span className="text-[#00e5ff] font-mono">{equalizer.bassBoost}/10</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={equalizer.bassBoost}
                  onChange={(e) => setBassBoost(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/20 rounded-full accent-[#00e5ff] cursor-pointer"
                />
              </div>

              <button
                onClick={() => setShowEqModal(false)}
                className="w-full py-3 rounded-2xl bg-[#00e5ff] text-black font-black hover:bg-[#38bdf8] transition-all"
              >
                تطبيق وحفظ
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── SLEEP TIMER MODAL (مؤقت النوم الذكي) ─────────────────────────── */}
      <AnimatePresence>
        {showSleepModal && (
          <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0b0d13] border border-white/15 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-5 text-center"
              dir="rtl"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#00e5ff]/15 text-[#00e5ff] flex items-center justify-center mx-auto">
                <Moon className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-xl font-black text-white">مؤقت النوم الذكي 🌙</h3>
                <p className="text-xs text-gray-400 mt-1">
                  يقوم بتخفيض الصوت تدريجياً في آخر 25 ثانية قبل الإيقاف لنوم هادئ.
                </p>
              </div>

              {sleepTimer.active ? (
                <div className="bg-[#00e5ff]/10 border border-[#00e5ff]/30 p-4 rounded-2xl space-y-2">
                  <p className="text-sm font-bold text-gray-300">
                    {sleepTimer.mode === "endOfSong" ? (
                      "المؤقت نشط: الإيقاف عند نهاية الأغنية الحالية"
                    ) : (
                      <>
                        متبقي:{" "}
                        <span className="text-[#00e5ff] font-black text-lg">
                          {sleepTimer.minutesRemaining} دقيقة
                        </span>
                      </>
                    )}
                  </p>
                  <button
                    onClick={() => {
                      cancelSleepTimer();
                      addToast("تم إلغاء مؤقت النوم");
                    }}
                    className="w-full py-2.5 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 font-black text-xs transition-colors"
                  >
                    إلغاء المؤقت
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 text-xs font-bold">
                  {[15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        startSleepTimer(m);
                        setShowSleepModal(false);
                        addToast(`تم ضبط مؤقت النوم على ${m} دقيقة`);
                      }}
                      className="py-3 rounded-2xl bg-white/5 hover:bg-[#00e5ff] hover:text-black border border-white/10 transition-all font-black"
                    >
                      {m} دقيقة
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      startSleepTimer("endOfSong");
                      setShowSleepModal(false);
                      addToast("سيتم الإيقاف عند نهاية الأغنية");
                    }}
                    className="col-span-2 py-3 rounded-2xl bg-white/5 hover:bg-[#00e5ff] hover:text-black border border-white/10 transition-all font-black"
                  >
                    نهاية الأغنية الحالية 🎵
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowSleepModal(false)}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold"
              >
                إغلاق
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── QUEUE DRAWER MODAL (قائمة الانتظار الأوفلاين) ────────────────── */}
      <AnimatePresence>
        {showQueueModal && (
          <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              className="bg-[#0b0d13] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
              dir="rtl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <ListMusic className="w-5 h-5 text-[#00e5ff]" />
                  <h3 className="text-lg font-black text-white">
                    قائمة التشغيل الحالية ({queue.length})
                  </h3>
                </div>
                <button
                  onClick={() => setShowQueueModal(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-white bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 py-3 space-y-1.5">
                {queue.map((s, idx) => {
                  const isCurrent = idx === currentIndex;
                  return (
                    <div
                      key={s.songId + idx}
                      onClick={() => {
                        playSongList(queue, idx);
                        setShowQueueModal(false);
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl cursor-pointer transition-all ${
                        isCurrent
                          ? "bg-[#00e5ff]/15 border border-[#00e5ff]/40 text-white"
                          : "hover:bg-white/5 border border-transparent text-gray-300"
                      }`}
                    >
                      <div className="w-6 text-center text-xs font-bold text-gray-500">
                        {isCurrent ? (
                          <Disc3 className="w-4 h-4 text-[#00e5ff] animate-spin mx-auto" />
                        ) : (
                          idx + 1
                        )}
                      </div>

                      <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10">
                        <img
                          src={s.thumbnailUrl ? getProxyUrl(s.thumbnailUrl) : "/placeholder-song.jpg"}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h4
                          className={`text-sm font-bold truncate ${
                            isCurrent ? "text-[#00e5ff]" : "text-white"
                          }`}
                        >
                          {s.title}
                        </h4>
                        <p className="text-xs text-gray-400 truncate">{s.artist || "فنان"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── OFFLINE LYRICS MODAL (كلمات الأغنية بدون إنترنت) ─────────────── */}
      <AnimatePresence>
        {showLyricsModal && lyrics && (
          <div className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0b0d13] border border-white/15 rounded-3xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
              dir="rtl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-400" />
                  <h3 className="text-lg font-black text-white">كلمات الأغنية (محفوظة أوفلاين)</h3>
                </div>
                <button
                  onClick={() => setShowLyricsModal(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-white bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 py-4 text-center space-y-4 px-2">
                {lyrics.split("\n").map((line, i) => (
                  <p key={i} className="text-base sm:text-lg font-bold text-gray-200 leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
