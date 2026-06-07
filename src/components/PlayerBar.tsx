"use client";

import {
  Play, Pause, SkipForward, SkipBack, Shuffle,
  Repeat, Volume2, VolumeX, Heart, DownloadCloud,
  ChevronDown, Maximize2, ListMusic, Share2, CheckCircle2, Crown,
  MoreHorizontal, Settings, AlignRight, Mic2
} from "lucide-react";
import { usePlayer } from "@/state/playerContext";
import { useEffect, useRef, useState } from "react";
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
  const [isAiMix, setIsAiMix] = useState(false);
  const [activeTab, setActiveTab] = useState("lyrics"); // lyrics, queue, audio
  const [syncedLyrics, setSyncedLyrics] = useState<{time: number, text: string}[]>([]);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentSong) return;
    setIsLyricsLoading(true);
    setSyncedLyrics([]);
    setPlainLyrics("");
    fetch(`/api/lyrics?trackName=${encodeURIComponent(currentSong.title)}&artistName=${encodeURIComponent(currentSong.artist)}`)
      .then(res => res.json())
      .then(data => {
        if (data.syncedLyrics) {
          const lines = data.syncedLyrics.split("\n");
          const parsed = [];
          const regex = /\[(\d{2}):(\d{2}\.\d{2})\](.*)/;
          for (const line of lines) {
            const match = line.match(regex);
            if (match) {
              const min = parseInt(match[1]);
              const sec = parseFloat(match[2]);
              const text = match[3].trim();
              if (text) parsed.push({ time: min * 60 + sec, text });
            }
          }
          setSyncedLyrics(parsed);
        } else if (data.plainLyrics) {
          setPlainLyrics(data.plainLyrics);
        }
      })
      .catch(err => console.error("Lyrics error:", err))
      .finally(() => setIsLyricsLoading(false));
  }, [currentSong?.songId]);

  // Auto-scroll lyrics
  useEffect(() => {
    if (activeTab === "lyrics" && syncedLyrics.length > 0 && lyricsScrollRef.current) {
      const activeLineIndex = syncedLyrics.findIndex((l, i) => {
        const nextTime = syncedLyrics[i + 1]?.time || Infinity;
        return state.currentTime >= l.time && state.currentTime < nextTime;
      });
      if (activeLineIndex !== -1) {
        const container = lyricsScrollRef.current;
        const activeEl = container.children[activeLineIndex] as HTMLElement;
        if (activeEl) {
          container.scrollTo({
            top: activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2,
            behavior: "smooth"
          });
        }
      }
    }
  }, [state.currentTime, activeTab, syncedLyrics]);

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 220 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#4A2C1D]"
    >
      {/* Blurred BG */}
      <div className="absolute inset-0">
        <img src={getProxyUrl(art)} alt="" className="w-full h-full object-cover scale-125 blur-[80px] opacity-40 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/80" />
      </div>

      <div className="relative z-10 flex flex-col h-full w-full max-w-md mx-auto">
        
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 pt-[env(safe-area-inset-top,40px)] pb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsAiMix(!isAiMix)} 
              className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out flex items-center shadow-inner ${isAiMix ? 'bg-white' : 'bg-white/20'}`}
              dir="ltr"
            >
              <div className={`w-5 h-5 rounded-full bg-[#4A2C1D] shadow-md transition-transform duration-300 ${isAiMix ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
            <span className="text-white font-bold text-[15px]">ميكس AI</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition">
            <ChevronDown className="w-8 h-8 text-white" />
          </button>
        </div>

        {/* Header Info (Art + Texts + Actions) */}
        <div className="flex items-start justify-between px-6 py-2">
          {/* Actions (Left) */}
          <div className="flex gap-4 items-center mt-2">
            <button className="p-2 hover:bg-white/10 rounded-full transition"><MoreHorizontal className="text-white w-6 h-6"/></button>
            <button className="p-2 hover:bg-white/10 rounded-full transition"><Share2 className="text-white w-5 h-5"/></button>
          </div>
          
          {/* Art & Info (Right) */}
          <div className="flex items-center gap-4 text-right" dir="rtl">
            <div className="flex flex-col justify-center">
              <h2 className="text-white font-black text-xl leading-tight truncate w-[160px]">{currentSong?.title || "—"}</h2>
              <p className="text-white/70 text-sm font-medium mt-1 truncate w-[160px]">{currentSong?.artist || "فنان"}</p>
            </div>
            <div className="w-[72px] h-[72px] rounded-xl overflow-hidden shadow-2xl shrink-0 border border-white/10">
              <img src={getProxyUrl(art)} className="w-full h-full object-cover" />
            </div>
          </div>
        </div>

        {/* Center Area (Dynamic Tabs) */}
        <div className="flex-1 flex flex-col justify-center px-8 text-center overflow-hidden relative">
           {activeTab === "lyrics" && (
             <div className="absolute inset-0 flex flex-col overflow-y-auto no-scrollbar pt-20 pb-32 px-4 scroll-smooth" ref={lyricsScrollRef} dir="rtl">
               {isLyricsLoading ? (
                 <div className="m-auto w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
               ) : syncedLyrics.length > 0 ? (
                 syncedLyrics.map((line, i) => {
                   const nextTime = syncedLyrics[i + 1]?.time || Infinity;
                   const isActive = state.currentTime >= line.time && state.currentTime < nextTime;
                   const isPassed = state.currentTime >= nextTime;
                   return (
                     <p key={i} className={`transition-all duration-300 py-3 ${isActive ? 'text-white font-black text-[26px] drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] scale-105' : isPassed ? 'text-white/40 font-bold text-[20px]' : 'text-white/50 font-bold text-[20px] blur-[1px]'}`}>
                       {line.text}
                     </p>
                   );
                 })
               ) : plainLyrics ? (
                 <p className="text-white/70 whitespace-pre-line text-lg font-bold leading-relaxed m-auto">{plainLyrics}</p>
               ) : (
                 <p className="text-white/40 text-lg font-bold m-auto">الكلمات غير متوفرة حالياً</p>
               )}
               <div className="h-40 shrink-0" />
             </div>
           )}

           {activeTab === "queue" && (
             <div className="absolute inset-0 flex flex-col overflow-y-auto no-scrollbar p-6" dir="rtl">
               <h3 className="text-white font-black text-xl mb-4 text-right">قائمة الاستماع</h3>
               <div className="space-y-3">
                 {state.queue.map((song, i) => {
                   const isCurrent = song.songId === currentSong?.songId;
                   return (
                     <div key={i} className={`flex items-center gap-3 p-2 rounded-xl transition ${isCurrent ? 'bg-white/20 border border-white/10' : 'hover:bg-white/5'}`}>
                       <img src={getProxyUrl(song.thumbnailUrl)} className="w-12 h-12 rounded-lg object-cover" />
                       <div className="text-right flex-1 min-w-0">
                         <p className={`truncate font-bold text-sm ${isCurrent ? 'text-white' : 'text-white/80'}`}>{song.title}</p>
                         <p className="truncate text-xs text-white/50">{song.artist}</p>
                       </div>
                       {isCurrent && <div className="w-4 h-4 rounded-full bg-white animate-pulse" />}
                     </div>
                   );
                 })}
               </div>
               <div className="h-20 shrink-0" />
             </div>
           )}

           {activeTab === "audio" && (
             <div className="absolute inset-0 flex flex-col justify-center items-center p-8 space-y-12">
               <div className="w-full space-y-4">
                 <div className="flex items-center justify-between text-white font-bold text-sm">
                   <VolumeX className="w-5 h-5 text-white/50" />
                   <span>مستوى الصوت</span>
                   <Volume2 className="w-5 h-5 text-white/50" />
                 </div>
                 <input type="range" min="0" max="1" step="0.01" value={state.volume} onChange={e => setVolume(parseFloat(e.target.value))} className="w-full accent-white h-2 rounded-full cursor-pointer" />
               </div>
               
               <button onClick={() => {
                  if (!isPremium) {
                    setPremiumFeatureName("جودة الصوت الخارقة (HQ)");
                    setIsPremiumModalOpen(true);
                  } else {
                    const newVal = !state.isHighQuality;
                    setHighQuality(newVal);
                    showToast(newVal ? "تم تفعيل جودة الصوت الخارقة 🎧✨" : "تم إيقاف الجودة الخارقة", "hq");
                  }
               }} className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-black text-lg transition-all ${state.isHighQuality ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-[0_0_30px_rgba(234,179,8,0.4)]' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                 <span className="border-2 border-current px-2 rounded-lg">HQ</span>
                 جودة صوت خارقة
                 {!isPremium && <Crown className="w-5 h-5 text-amber-400 drop-shadow-md" />}
               </button>
             </div>
           )}

           {activeTab === "lyrics" && (
             <div className="absolute bottom-12 left-6 z-20 pointer-events-none">
               <button className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-lg pointer-events-auto">
                 <Mic2 className="w-6 h-6" />
               </button>
             </div>
           )}
        </div>

        {/* Bottom Controls Area */}
        <div className="px-6 pb-[env(safe-area-inset-bottom,20px)] pt-2">
          {/* Seek Bar */}
          <div className="mb-6 px-2">
            <SeekBar progress={state.currentTime} duration={state.duration} onSeek={seekTo} height="h-1" rtl={false} />
            <div className="flex justify-between mt-3 text-[11px] font-bold text-white/50 tabular-nums" dir="ltr">
               <span>{fmtTime(state.currentTime)}</span>
               <span>-{fmtTime(state.duration - state.currentTime)}</span>
            </div>
          </div>

          {/* Main Playback Controls */}
          <div className="flex items-center justify-between px-2 mb-8">
            <button onClick={onLike} className="p-2">
              <Heart className={`w-7 h-7 transition-colors ${isLiked ? "text-white fill-current" : "text-white/60 hover:text-white"}`} />
            </button>
            
            <div className="flex items-center gap-7">
               <button onClick={prev} className="active:scale-90 transition-transform">
                 <SkipBack className="text-white w-9 h-9 fill-current" />
               </button>
               
               <button 
                 onClick={togglePlay} 
                 className="w20 h-20 w-[72px] h-[72px] bg-white rounded-full flex items-center justify-center shadow-[0_10px_40px_rgba(255,255,255,0.2)] active:scale-95 transition-transform"
               >
                 {state.isBuffering ? (
                    <div className="w-8 h-8 border-4 border-black/10 border-t-black rounded-full animate-spin" />
                 ) : state.isPlaying ? (
                    <Pause className="text-[#4A2C1D] w-9 h-9 fill-current" />
                 ) : (
                    <Play className="text-[#4A2C1D] w-9 h-9 fill-current ml-1" />
                 )}
               </button>
               
               <button onClick={next} className="active:scale-90 transition-transform">
                 <SkipForward className="text-white w-9 h-9 fill-current" />
               </button>
            </div>
            
            <button onClick={onDownload} className="p-2 relative">
              <DownloadCloud className="text-white/60 hover:text-white w-7 h-7" />
              {!isPremium && <Crown className="w-3 h-3 text-amber-400 absolute top-1 right-1 drop-shadow-md" />}
            </button>
          </div>

          {/* Bottom Tabs */}
          <div className="flex items-center justify-between px-2 border-t border-white/10 pt-5">
            <button 
              onClick={() => setActiveTab("audio")}
              className={`flex items-center gap-2 font-bold text-sm transition-colors ${activeTab === 'audio' ? 'text-white' : 'text-white/50'}`}
            >
               <Settings className="w-5 h-5" /> الصوت
            </button>
            
            <button 
              onClick={() => setActiveTab("queue")}
              className={`flex items-center gap-2 font-bold text-sm transition-colors ${activeTab === 'queue' ? 'text-white' : 'text-white/50'}`}
            >
               <ListMusic className="w-5 h-5" /> قائمة الاستماع
            </button>
            
            <button 
              onClick={() => setActiveTab("lyrics")}
              className={`flex items-center gap-2 font-bold text-sm px-4 py-2 rounded-full transition-all ${activeTab === 'lyrics' ? 'bg-white text-black' : 'text-white/50 hover:bg-white/10'}`}
            >
               <AlignRight className="w-5 h-5" /> كلمات
            </button>
          </div>
        </div>

      </div>
    </motion.div>
  );
}

// ─── Mini Player Bar ──────────────────────────────────────────────────
export function PlayerBar() {
  const { state, currentSong, next, prev, togglePlay, setVolume, seekTo, cycleRepeat, setShuffle, setHighQuality } = usePlayer();
  const [progress, setProgress] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState("");
  const { addToast } = useToastStore();

  const isPremium = typeof window !== "undefined" && localStorage.getItem("aura_user_tier") === "premium";

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
      addToast(d.liked ? "تمت الإضافة للمفضلة ❤️" : "تمت الإزالة من المفضلة");
    }
  };

  const handleDownload = async () => {
    if (!currentSong) return;
    if (!isPremium) {
      setPremiumFeatureName("التحميل والاستماع بدون إنترنت");
      setIsPremiumModalOpen(true);
      return;
    }
    addToast(`جاري تحميل "${currentSong.title}"... بسرعة الصاروخ 🚀`);
    const ok = await downloadSong(currentSong.songId, currentSong.youtubeVideoId, {
      title: currentSong.title,
      artist: currentSong.artist || "فنان",
      thumbnailUrl: currentSong.thumbnailUrl,
      folderName: currentSong.artist || "أخرى"
    });
    addToast(ok ? "تم الحفظ للأوفلاين ✅" : "فشل التحميل ❌", ok ? "success" : "error");
  };

  const art = currentSong?.thumbnailUrl || currentSong?.metadata?.thumbnailUrl;
  const pct = state.duration > 0 ? (progress / state.duration) * 100 : 0;

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

      {/* Mini Bar — on mobile, sits above the bottom tab bar */}
      <footer className="fixed left-0 right-0 z-30 bottom-[calc(env(safe-area-inset-bottom,0px)+55px)] md:bottom-0">
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
              <p className="text-sm font-bold truncate text-white group-hover:text-[#1db954] transition-colors">
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
              className={`hidden md:block transition-colors ${state.shuffle ? "text-[#1db954]" : "text-gray-500 hover:text-white"}`}>
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
              className={`hidden md:block relative transition-colors ${state.repeat !== "off" ? "text-[#1db954]" : "text-gray-500 hover:text-white"}`}>
              <Repeat className="w-4 h-4" />
              {state.repeat === "one" && <span className="absolute -top-1 -right-1 text-[7px] font-black">1</span>}
            </button>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={toggleLike}>
              <Heart className={`w-5 h-5 transition-colors ${isLiked ? "text-pink-500 fill-current" : "text-gray-500 hover:text-white"}`} />
            </button>
            <button onClick={handleDownload} className="text-gray-500 hover:text-[#1db954] transition-colors hidden md:block relative">
              <DownloadCloud className="w-4 h-4" />
              {!isPremium && <Crown className="w-3 h-3 text-amber-500 absolute -top-2 -right-2 drop-shadow-md" />}
            </button>
            <div className="hidden md:flex items-center gap-1.5 group">
              <Volume2 className="w-3.5 h-3.5 text-gray-500" />
              <input type="range" min="0" max="1" step="0.01" value={state.volume}
                onChange={e => setVolume(parseFloat(e.target.value))}
                className="w-20 accent-[#1db954] h-1 cursor-pointer" />
            </div>
          </div>
        </div>
      </footer>

      {/* Premium Modal for Mini Player */}
      <PremiumModal 
        isOpen={isPremiumModalOpen} 
        onClose={() => setIsPremiumModalOpen(false)} 
        featureName={premiumFeatureName}
      />
    </>
  );
}
