"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, Heart, DownloadCloud, ChevronRight, MoreHorizontal, Shuffle, CheckCircle2, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "@/state/playerContext";
import { getProxyUrl } from "@/utils/media";
import { downloadAlbum } from "@/services/offline/downloader";
import { getAllOfflineSongs } from "@/offline/indexedDbCache";
import { subscribeDownloads } from "@/state/downloadStore";
import { PremiumModal } from "@/components/PremiumModal";

interface Song {
  songId: string;
  title: string;
  artist?: string;
  artistName?: string;
  thumbnailUrl?: string;
  youtubeVideoId: string;
  metadata?: any;
}

interface Props {
  albumId: string;
  albumTitle: string;
  artistName: string;
  coverUrl?: string;
  year?: string | number;
  songs: Song[];
}

export default function AlbumHeroClient({ albumId, albumTitle, artistName, coverUrl, year, songs }: Props) {
  const { state, playNow, setQueue, currentSong, togglePlay } = usePlayer();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkOfflineStatus = async () => {
      try {
        const offlineSongs = await getAllOfflineSongs();
        if (!mounted) return;
        const offlineSet = new Set(
          offlineSongs.filter((s) => s.audioReady).map((s) => s.songId)
        );
        const isFullyDownloaded =
          songs.length > 0 && songs.every((s) => offlineSet.has(s.songId));
        if (mounted) {
          setDownloaded(isFullyDownloaded);
        }
      } catch {}
    };

    checkOfflineStatus();

    const unsubscribe = subscribeDownloads((jobs) => {
      if (!mounted) return;
      const albumJob = jobs.find((j) => j.id === albumId);
      if (albumJob) {
        if (albumJob.status === "downloading") {
          setDownloading(true);
        } else if (albumJob.status === "done") {
          setDownloading(false);
          setDownloaded(true);
        } else {
          setDownloading(false);
        }
      }
    });

    let checkTimeout: any = null;
    const handleUpdate = () => {
      if (checkTimeout) clearTimeout(checkTimeout);
      checkTimeout = setTimeout(() => {
        checkOfflineStatus();
      }, 350);
    };
    window.addEventListener("aura-library-updated", handleUpdate);

    return () => {
      mounted = false;
      if (checkTimeout) clearTimeout(checkTimeout);
      unsubscribe();
      window.removeEventListener("aura-library-updated", handleUpdate);
    };
  }, [albumId, songs]);

  if (typeof window !== "undefined" && !isPremium && localStorage.getItem("aura_user_tier") === "premium") {
    setIsPremium(true);
  }

  const isAlbumPlaying =
    state.isPlaying &&
    songs.some((s) => s.songId === state.currentSongId);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handlePlay = () => {
    if (isAlbumPlaying) {
      togglePlay();
      return;
    }
    // Start playing all songs starting from first
    if (songs.length === 0) return;
    const queue = songs.map((s) => ({
      songId: s.songId,
      title: s.title,
      artist: s.artist || s.artistName || artistName,
      youtubeVideoId: s.youtubeVideoId,
      thumbnailUrl: s.thumbnailUrl ?? coverUrl,
      metadata: { thumbnailUrl: s.thumbnailUrl ?? coverUrl },
    }));
    setQueue(queue);
  };

  const handleShuffle = () => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    const queue = shuffled.map((s) => ({
      songId: s.songId,
      title: s.title,
      artist: s.artist || s.artistName || artistName,
      youtubeVideoId: s.youtubeVideoId,
      thumbnailUrl: s.thumbnailUrl ?? coverUrl,
      metadata: { thumbnailUrl: s.thumbnailUrl ?? coverUrl },
    }));
    setQueue(queue);
  };

  const handleDownload = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (downloading || downloaded) return;
    if (!isPremium) {
      setShowPremiumModal(true);
      return;
    }
    setDownloading(true);
    showToast("جاري تحميل الألبوم...");
    try {
      const ok = await downloadAlbum(albumId, songs, {
        albumName: albumTitle,
        artistName,
        coverUrl,
      });
      if (ok) {
        setDownloaded(true);
        showToast("تم حفظ الألبوم للأوفلاين ✅");
      } else {
        showToast("فشل التحميل ❌");
      }
    } catch {
      showToast("فشل التحميل ❌");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-xl md:hidden"
            style={{ background: "rgba(18,20,26,0.97)", border: "1px solid rgba(99,102,241,0.4)" }}
          >
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <PremiumModal 
        isOpen={showPremiumModal} 
        onClose={() => setShowPremiumModal(false)} 
        featureName="تحميل الألبومات بالكامل" 
      />

      {/* ── Desktop Hero (hidden on mobile) ── */}
      <section className="hidden md:block relative mb-10 -mx-8 pt-0 overflow-hidden min-h-[400px]">
        {/* Blurred backdrop with animated gradient */}
        <div className="absolute inset-0 z-0">
          <img
            src={getProxyUrl(coverUrl)}
            alt=""
            className="w-full h-full object-cover blur-[80px] opacity-40 scale-125 transition-transform duration-[10s] animate-slow-zoom"
          />
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, rgba(9,10,15,0.2) 0%, rgba(9,10,15,0.8) 50%, rgba(9,10,15,1) 100%)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-transparent pointer-events-none" />
        </div>

        {/* Content row */}
        <div className="relative z-10 flex items-end gap-10 px-10 pt-16 pb-12">
          {/* High-res cover with 3D effect */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="group relative w-64 h-64 xl:w-72 xl:h-72 rounded-2xl overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.8)] shrink-0 bg-white/5"
          >
            <img
              src={getProxyUrl(coverUrl)}
              alt={albumTitle}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-album.jpg"; }}
            />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl" />
          </motion.div>

          {/* Info block */}
          <div className="flex flex-col gap-4 pb-4 select-none">
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="flex items-center gap-2"
            >
              <div className="px-2 py-0.5 rounded-sm bg-indigo-500 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                ألبوم
              </div>
              {year && <span className="text-sm font-bold text-gray-400/80">{year}</span>}
            </motion.div>

            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-6xl xl:text-8xl font-black tracking-tight leading-none text-white drop-shadow-2xl"
            >
              {albumTitle}
            </motion.h1>

            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex items-center gap-3 text-base font-medium mt-2"
            >
              <span className="text-white hover:text-indigo-400 transition-colors cursor-pointer font-bold underline decoration-indigo-500/30 underline-offset-4">
                {artistName}
              </span>
              <span className="text-gray-600 font-black">•</span>
              <span className="text-gray-300 font-bold">{songs.length} أغنية</span>
              <span className="text-gray-600 font-black">•</span>
              <span className="text-gray-400 text-sm">مزيكا ويب أوريجينال</span>
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="flex items-center gap-6 mt-6"
            >
              <button
                onClick={handlePlay}
                className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_0_30px_rgba(99,102,241,0.4)] group"
              >
                {isAlbumPlaying ? (
                  <Pause className="w-7 h-7 text-white fill-current" />
                ) : (
                  <Play className="w-7 h-7 text-white fill-current ml-1" />
                )}
              </button>
              
              <button
                onClick={handleShuffle}
                className="p-4 rounded-full border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all group"
              >
                <Shuffle className="w-6 h-6 text-gray-400 group-hover:text-white" />
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="relative p-4 rounded-full border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all group"
              >
                {downloaded ? (
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                ) : downloading ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                    <DownloadCloud className="w-6 h-6 text-indigo-400" />
                  </motion.div>
                ) : (
                  <>
                    {!isPremium && <Crown className="absolute -top-1 -right-1 w-4 h-4 text-amber-500 drop-shadow-md" />}
                    <DownloadCloud className="w-6 h-6 text-gray-400 group-hover:text-indigo-400" />
                  </>
                )}
              </button>

              <button className="p-4 rounded-full border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all group">
                <Heart className="w-6 h-6 text-gray-400 group-hover:text-pink-500" />
              </button>

              <button className="p-4 rounded-full border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all group">
                <MoreHorizontal className="w-6 h-6 text-gray-400 group-hover:text-white" />
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Mobile-only hero block ── */}
      <div className="md:hidden">
        {/* Full-bleed blurred cover background */}
        <div className="relative overflow-hidden min-h-[480px]">
          {/* Background blur — fills entire section */}
          <div className="absolute inset-0">
            <img
              src={getProxyUrl(coverUrl)}
              alt=""
              className="w-full h-full object-cover scale-150 blur-3xl opacity-40"
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, rgba(9,10,15,0.1) 0%, rgba(9,10,15,0.7) 40%, rgba(9,10,15,1) 100%)" }}
            />
          </div>

          {/* Cover art + info */}
          <div className="relative z-10 flex flex-col items-center pt-8 pb-6 px-4">
            {/* Square cover */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0, 0, 0, 1] }}
              className="w-52 h-52 rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)] mb-6 ring-1 ring-white/10"
            >
              <img
                src={getProxyUrl(coverUrl)}
                alt={albumTitle}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-album.jpg"; }}
              />
            </motion.div>

            {/* Title + meta */}
            <div className="text-center px-4 mb-6">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400 mb-2 block">ألبوم موسيقي</span>
              <h1 className="text-3xl font-black text-white leading-tight mb-2 tracking-tight">{albumTitle}</h1>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-400 font-bold">
                <span className="text-gray-200">{artistName}</span>
                {year && <><span className="text-gray-700">•</span> <span>{year}</span></>}
              </div>
            </div>

            {/* Action Row */}
            <div className="flex items-center justify-center gap-4 w-full mt-2">
              <button
                onClick={handlePlay}
                className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center shadow-2xl shadow-indigo-500/40 hover:scale-105 active:scale-95 transition-transform"
              >
                {isAlbumPlaying ? (
                  <Pause className="w-7 h-7 text-white fill-current" />
                ) : (
                  <Play className="w-7 h-7 text-white fill-current ml-1" />
                )}
              </button>
              
              <div className="flex items-center gap-1.5 glass rounded-full px-2 py-1 border border-white/5">
                <button
                  onClick={handleShuffle}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors active:scale-90"
                >
                  <Shuffle className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="relative w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-indigo-400 transition-colors"
                >
                  {downloaded ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : downloading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                      <DownloadCloud className="w-5 h-5 text-indigo-400" />
                    </motion.div>
                  ) : (
                    <>
                      {!isPremium && <Crown className="absolute -top-1 -right-1 w-3 h-3 text-amber-500 drop-shadow-md" />}
                      <DownloadCloud className="w-5 h-5" />
                    </>
                  )}
                </button>
                <button className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-pink-400">
                  <Heart className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Track count bar */}
        <div className="px-6 py-4 flex items-center justify-between">
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest">{songs.length} أغنية مرشحة</p>
          <MoreHorizontal className="w-5 h-5 text-gray-600" />
        </div>
      </div>
    </>
  );
}
