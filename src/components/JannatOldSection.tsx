"use client";

import { useState, useEffect, useMemo } from "react";
import { Play, DownloadCloud, CheckCircle2, Music, Search, Shuffle, Sparkles, Disc, Clock, RefreshCw } from "lucide-react";
import { JANNAT_OLD_CLASSICS, JannatClassicTrack } from "@/data/jannatClassics";
import { usePlayer } from "@/state/playerContext";
import { downloadSong } from "@/services/offline/downloader";
import { getAllOfflineSongs } from "@/offline/indexedDbCache";
import { getProxyUrl } from "@/utils/media";
import { motion, AnimatePresence } from "framer-motion";

export function JannatOldSection({ onToast }: { onToast: (msg: string) => void }) {
  const { playNow, enqueueSongs } = usePlayer();
  const [selectedAlbum, setSelectedAlbum] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [savedOfflineIds, setSavedOfflineIds] = useState<Set<string>>(new Set());
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  // Load already saved songs from IndexedDB on mount & on real-time updates
  useEffect(() => {
    let mounted = true;
    let syncTimer: any = null;
    const syncOffline = () => {
      getAllOfflineSongs()
        .then((songs) => {
          if (!mounted) return;
          const ids = new Set<string>();
          for (const s of songs) {
            if (s.audioReady) {
              if (s.songId) ids.add(s.songId);
              if (s.id) ids.add(s.id);
              if (s.youtubeVideoId) ids.add(s.youtubeVideoId);
            }
          }
          setSavedOfflineIds(ids);
        })
        .catch(() => {});
    };

    syncOffline();

    const debouncedSync = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(syncOffline, 350);
    };

    window.addEventListener("aura-library-updated", debouncedSync);
    return () => {
      mounted = false;
      if (syncTimer) clearTimeout(syncTimer);
      window.removeEventListener("aura-library-updated", debouncedSync);
    };
  }, []);

  // Unique album list for filter tabs
  const albumTabs = useMemo(() => {
    const albums = Array.from(new Set(JANNAT_OLD_CLASSICS.map((s) => s.album)));
    return ["all", ...albums];
  }, []);

  // Filtered tracks
  const filteredSongs = useMemo(() => {
    return JANNAT_OLD_CLASSICS.filter((song) => {
      const matchAlbum = selectedAlbum === "all" || song.album === selectedAlbum;
      const matchQuery =
        !searchQuery.trim() ||
        song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.enTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.album.toLowerCase().includes(searchQuery.toLowerCase());
      return matchAlbum && matchQuery;
    });
  }, [selectedAlbum, searchQuery]);

  // Play a song
  const handlePlaySong = (song: JannatClassicTrack, index: number) => {
    const trackPayload = {
      songId: song.songId,
      youtubeVideoId: song.youtubeVideoId,
      title: song.title,
      artist: song.artist,
      thumbnailUrl: song.thumbnailUrl,
      source: "youtube" as const,
    };
    playNow(trackPayload);

    // Enqueue remaining filtered songs for seamless autoplay
    const remaining = filteredSongs.slice(index + 1).map((s) => ({
      songId: s.songId,
      youtubeVideoId: s.youtubeVideoId,
      title: s.title,
      artist: s.artist,
      thumbnailUrl: s.thumbnailUrl,
      source: "youtube" as const,
    }));
    if (remaining.length > 0) {
      enqueueSongs(remaining);
    }
  };

  // Play All
  const handlePlayAll = (shuffle = false) => {
    if (filteredSongs.length === 0) return;
    const list = shuffle ? [...filteredSongs].sort(() => Math.random() - 0.5) : filteredSongs;
    handlePlaySong(list[0], 0);
    onToast(shuffle ? "🔀 تم بدء التشغيل العشوائي لـ جنات قديم" : "▶️ تم بدء تشغيل قائمة جنات قديم");
  };

  // Download a single song to offline storage
  const handleDownload = async (e: React.MouseEvent, song: JannatClassicTrack) => {
    e.stopPropagation();
    const id = song.youtubeVideoId || song.songId;

    if (savedOfflineIds.has(id)) {
      onToast(`"${song.title}" جاهزة بالفعل في مكتبتك الأوفلاين ✅`);
      return;
    }

    if (downloadingIds.has(id)) return;

    setDownloadingIds((prev) => new Set(prev).add(id));
    onToast(`جاري تنزيل "${song.title}" للأوفلاين عبر تليجرام... ⏳`);

    try {
      const ok = await downloadSong(song.songId, song.youtubeVideoId, {
        title: song.title,
        artist: song.artist,
        thumbnailUrl: song.thumbnailUrl,
      });

      if (ok) {
        setSavedOfflineIds((prev) => new Set(prev).add(id).add(song.songId));
        onToast(`تم حفظ "${song.title}" في مكتبتك الأوفلاين بنجاح ✅`);
      } else {
        onToast(`تعذّر تنزيل "${song.title}"، حاول مرة أخرى ❌`);
      }
    } catch {
      onToast(`فشل تنزيل "${song.title}" ❌`);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Batch download all filtered songs
  const handleDownloadAll = async () => {
    if (batchDownloading) return;
    const unDownloaded = filteredSongs.filter(
      (s) => !savedOfflineIds.has(s.youtubeVideoId) && !savedOfflineIds.has(s.songId)
    );

    if (unDownloaded.length === 0) {
      onToast("جميع الأغاني المعروضة محملة بالفعل في مكتبتك الأوفلاين! ✅");
      return;
    }

    setBatchDownloading(true);
    setBatchProgress({ current: 0, total: unDownloaded.length });
    onToast(`بدأ تحميل ${unDownloaded.length} أغنية للأوفلاين تلقائياً... 🚀`);

    let done = 0;
    for (const song of unDownloaded) {
      const id = song.youtubeVideoId || song.songId;
      setDownloadingIds((prev) => new Set(prev).add(id));
      try {
        const ok = await downloadSong(song.songId, song.youtubeVideoId, {
          title: song.title,
          artist: song.artist,
          thumbnailUrl: song.thumbnailUrl,
        });
        if (ok) {
          setSavedOfflineIds((prev) => new Set(prev).add(id).add(song.songId));
        }
      } catch {}
      done++;
      setBatchProgress({ current: done, total: unDownloaded.length });
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }

    setBatchDownloading(false);
    onToast(`اكتمل تحميل جميع أغاني جنات للأوفلاين! استمتع بها بدون نت 🎧`);
  };

  return (
    <section className="relative overflow-hidden rounded-3xl p-6 md:p-8 bg-gradient-to-b from-indigo-950/40 via-purple-950/20 to-black/60 border border-indigo-500/20 shadow-2xl backdrop-blur-xl">
      {/* Decorative ambient background */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Section Header ── */}
      <div className="relative z-10 space-y-4 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-2xl">
                👑
              </span>
              <div>
                <h2 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300">
                  جنات قديم
                </h2>
                <p className="text-xs md:text-sm text-gray-400 mt-1">
                  أجمل 52 أغنية كلاسيكية من العصر الذهبي — سحب فوري ودعم كامل للأوفلاين
                </p>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> 52 أغنية كلاسيكية
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              ⚡ سحب سريع وتليجرام
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              📱 جاهزة للأوفلاين
            </span>
          </div>
        </div>

        {/* ── Actions Bar & Batch Download ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePlayAll(false)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 active:scale-95 transition-all"
            >
              <Play className="w-4 h-4 fill-current" /> تشغيل الكل
            </button>
            <button
              onClick={() => handlePlayAll(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 font-bold text-sm active:scale-95 transition-all"
              title="تشغيل عشوائي"
            >
              <Shuffle className="w-4 h-4" /> خلط
            </button>
          </div>

          {/* Download All Button */}
          <button
            onClick={handleDownloadAll}
            disabled={batchDownloading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 ${
              batchDownloading
                ? "bg-indigo-600/50 text-indigo-200 cursor-not-allowed border border-indigo-400/40"
                : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
            }`}
          >
            {batchDownloading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                <span>جاري تحميل الكل ({batchProgress.current}/{batchProgress.total})...</span>
              </>
            ) : (
              <>
                <DownloadCloud className="w-4 h-4 text-emerald-400" />
                <span>تحميل الكل للأوفلاين ⬇️</span>
              </>
            )}
          </button>
        </div>

        {/* ── Search Input ── */}
        <div className="relative pt-2">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في أغاني جنات القديمة (مثال: اللي بيني وبينك، أنا دنيته، حب امتلاك)..."
            className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
          />
        </div>

        {/* ── Album Filter Tabs ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none -mx-1 px-1">
          {albumTabs.map((tab) => {
            const isSelected = selectedAlbum === tab;
            const label = tab === "all" ? `كل الأغاني (${JANNAT_OLD_CLASSICS.length})` : tab;
            return (
              <button
                key={tab}
                onClick={() => setSelectedAlbum(tab)}
                className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/30"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tracklist ── */}
      <div className="relative z-10 space-y-1.5">
        {filteredSongs.length === 0 ? (
          <div className="text-center py-12 text-gray-500 space-y-2">
            <Music className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm">لا توجد أغانٍ مطابقة للبحث في قسم جنات قديم</p>
          </div>
        ) : (
          filteredSongs.map((song, idx) => {
            const id = song.youtubeVideoId || song.songId;
            const isDownloading = downloadingIds.has(id);
            const isSaved = savedOfflineIds.has(id) || savedOfflineIds.has(song.songId);

            return (
              <motion.div
                key={song.songId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.4) }}
                onClick={() => handlePlaySong(song, idx)}
                className="group flex items-center gap-3 md:gap-4 px-3.5 py-2.5 rounded-2xl hover:bg-white/10 border border-transparent hover:border-white/10 cursor-pointer transition-all"
              >
                {/* Index / Play */}
                <div className="w-7 text-center shrink-0">
                  <span className="text-xs font-bold text-gray-500 group-hover:hidden">
                    {idx + 1}
                  </span>
                  <Play className="w-4 h-4 text-indigo-400 fill-current hidden group-hover:block mx-auto" />
                </div>

                {/* Thumbnail */}
                <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-white/5 shrink-0 border border-white/10 shadow-sm">
                  <img
                    src={getProxyUrl(song.thumbnailUrl)}
                    alt={song.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder-song.jpg";
                    }}
                  />
                  {isSaved && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-tl-sm flex items-center justify-center">
                      <span className="text-[8px] text-white font-black">✓</span>
                    </div>
                  )}
                </div>

                {/* Titles */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors truncate">
                      {song.title}
                    </p>
                    {isSaved && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> أوفلاين
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5 truncate">
                    <span className="text-gray-500">{song.enTitle}</span>
                    <span>•</span>
                    <span className="text-indigo-400/80 truncate">{song.album}</span>
                  </div>
                </div>

                {/* Duration */}
                <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500 shrink-0">
                  <Clock className="w-3 h-3" />
                  <span>{song.duration}</span>
                </div>

                {/* Download Action */}
                <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => handleDownload(e, song)}
                    disabled={isDownloading}
                    className={`p-2 rounded-xl transition-all ${
                      isSaved
                        ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30"
                        : isDownloading
                        ? "text-indigo-400 bg-indigo-500/20 border border-indigo-500/40 animate-pulse"
                        : "text-gray-400 hover:text-white hover:bg-white/10 active:scale-95"
                    }`}
                    title={isSaved ? "جاهزة أوفلاين" : isDownloading ? "جاري التنزيل..." : "تنزيل للأوفلاين"}
                  >
                    {isSaved ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isDownloading ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                    ) : (
                      <DownloadCloud className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </section>
  );
}
