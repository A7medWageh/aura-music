"use client";

import { useState, useEffect, useMemo } from "react";
import { Play, DownloadCloud, CheckCircle2, Music, Search, Shuffle, Sparkles, Disc, Clock, RefreshCw } from "lucide-react";
import { ANGHAM_OLD_CLASSICS, AnghamClassicTrack } from "@/data/anghamClassics";
import { usePlayer } from "@/state/playerContext";
import { downloadSong } from "@/services/offline/downloader";
import { getAllOfflineSongs } from "@/offline/indexedDbCache";
import { getProxyUrl } from "@/utils/media";
import { motion, AnimatePresence } from "framer-motion";

export function AnghamOldSection({ onToast }: { onToast: (msg: string) => void }) {
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
    const albums = Array.from(new Set(ANGHAM_OLD_CLASSICS.map((s) => s.album)));
    return ["all", ...albums];
  }, []);

  // Filtered tracks
  const filteredSongs = useMemo(() => {
    return ANGHAM_OLD_CLASSICS.filter((song) => {
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
  const handlePlaySong = (song: AnghamClassicTrack, index: number) => {
    const trackPayload = {
      songId: song.songId,
      youtubeVideoId: song.youtubeVideoId,
      title: song.title,
      artist: song.artist,
      thumbnailUrl: song.thumbnailUrl,
      albumName: song.album,
    };
    playNow(trackPayload);

    // Enqueue remaining filtered songs for seamless autoplay
    const remaining = filteredSongs.slice(index + 1).map((s) => ({
      songId: s.songId,
      youtubeVideoId: s.youtubeVideoId,
      title: s.title,
      artist: s.artist,
      thumbnailUrl: s.thumbnailUrl,
      albumName: s.album,
    }));
    if (remaining.length > 0) {
      enqueueSongs(remaining);
    }
    onToast(`جارٍ تشغيل "${song.title}" بجودة الاستوديو الأصلية 🎵`);
  };

  // Play all shuffled
  const handleShufflePlay = () => {
    if (filteredSongs.length === 0) return;
    const shuffled = [...filteredSongs].sort(() => Math.random() - 0.5);
    const first = shuffled[0];
    playNow({
      songId: first.songId,
      youtubeVideoId: first.youtubeVideoId,
      title: first.title,
      artist: first.artist,
      thumbnailUrl: first.thumbnailUrl,
      albumName: first.album,
    });
    const rest = shuffled.slice(1).map((s) => ({
      songId: s.songId,
      youtubeVideoId: s.youtubeVideoId,
      title: s.title,
      artist: s.artist,
      thumbnailUrl: s.thumbnailUrl,
      albumName: s.album,
    }));
    if (rest.length > 0) enqueueSongs(rest);
    onToast(`تشغيل عشوائي لكل روائع أنغام (${shuffled.length} أغنية) 🔀`);
  };

  // Download a single classic song
  const handleDownloadSong = async (song: AnghamClassicTrack) => {
    if (savedOfflineIds.has(song.songId) || savedOfflineIds.has(song.youtubeVideoId)) {
      onToast(`"${song.title}" محملة بالفعل على جهازك للاستماع بدون إنترنت ✅`);
      return;
    }
    if (downloadingIds.has(song.songId)) return;

    setDownloadingIds((prev) => new Set(prev).add(song.songId));
    onToast(`جارٍ تنزيل "${song.title}" للأوفلاين عبر خوادم تيليجرام الصاروخية ⚡`);

    try {
      const ok = await downloadSong(song.songId, song.youtubeVideoId, {
        title: song.title,
        artist: "أنغام",
        thumbnailUrl: song.thumbnailUrl,
        albumName: song.album,
        folderName: "أنغام",
      });

      if (ok) {
        setSavedOfflineIds((prev) => new Set(prev).add(song.songId).add(song.youtubeVideoId));
        onToast(`تم تحميل "${song.title}" بنجاح! متوفرة الآن بدون إنترنت 🎉`);
      } else {
        onToast(`تعذر تنزيل "${song.title}"، يرجى المحاولة مرة أخرى`);
      }
    } catch {
      onToast(`حدث خطأ أثناء تنزيل "${song.title}"`);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(song.songId);
        return next;
      });
    }
  };

  // Batch download all currently filtered songs
  const handleBatchDownload = async () => {
    if (batchDownloading) return;
    const toDownload = filteredSongs.filter(
      (s) => !savedOfflineIds.has(s.songId) && !savedOfflineIds.has(s.youtubeVideoId)
    );

    if (toDownload.length === 0) {
      onToast("جميع أغاني هذه القائمة محملة بالفعل على هاتفك! 🌟");
      return;
    }

    setBatchDownloading(true);
    setBatchProgress({ current: 0, total: toDownload.length });
    onToast(`بدأ تنزيل ${toDownload.length} أغنية لأنغام للأوفلاين دفعة واحدة 🚀`);

    let done = 0;
    for (const song of toDownload) {
      try {
        setDownloadingIds((prev) => new Set(prev).add(song.songId));
        const ok = await downloadSong(song.songId, song.youtubeVideoId, {
          title: song.title,
          artist: "أنغام",
          thumbnailUrl: song.thumbnailUrl,
          albumName: song.album,
          folderName: "أنغام",
        });
        if (ok) {
          setSavedOfflineIds((prev) => new Set(prev).add(song.songId).add(song.youtubeVideoId));
        }
      } catch {
        // continue batch
      } finally {
        done++;
        setBatchProgress({ current: done, total: toDownload.length });
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(song.songId);
          return next;
        });
      }
    }

    setBatchDownloading(false);
    onToast(`اكتمل تحميل كلاسيكيات أنغام! استمتع بها بدون إنترنت بأعلى نقاء 🎧`);
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-rose-500/20 bg-gradient-to-b from-rose-950/20 via-zinc-900/60 to-black/80 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
      {/* Decorative Aura Glow */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              أرشيف الاستوديو الذهبي
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              قاعدة بيانات تيليجرام فائقة السرعة
            </span>
          </div>
          <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight flex items-center gap-3">
            كلاسيكيات وروائع أنغام
            <span className="text-base md:text-lg font-normal text-zinc-400">
              ({ANGHAM_OLD_CLASSICS.length} أغنية استوديو أصلية)
            </span>
          </h2>
          <p className="text-zinc-400 text-sm mt-1 max-w-2xl leading-relaxed">
            جميع أغاني أنغام التاريخية وروائع ألبوماتها من 1988 حتى اليوم، مرفوعة على خوادم تيليجرام لتشغيل وتنزيل فوري في ثوانٍ معدودة بدون أي أخطاء أو انقطاع.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleShufflePlay}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all shadow-md active:scale-95 border border-white/10"
          >
            <Shuffle className="w-4 h-4 text-rose-400" />
            تشغيل عشوائي
          </button>

          <button
            onClick={handleBatchDownload}
            disabled={batchDownloading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-sm transition-all shadow-lg shadow-rose-900/30 active:scale-95 disabled:opacity-50"
          >
            {batchDownloading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                جارٍ التحميل ({batchProgress.current}/{batchProgress.total})
              </>
            ) : (
              <>
                <DownloadCloud className="w-4 h-4" />
                تحميل الكل للأوفلاين
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search & Filter Tabs */}
      <div className="relative z-10 pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث في أغاني أنغام (سيدي وصالك، شنطة سفر، أكتبلك تعهد...)"
              className="w-full bg-zinc-900/80 border border-white/10 rounded-full pr-10 pl-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition-colors"
            />
          </div>

          <div className="text-xs text-zinc-400 self-center">
            عرض {filteredSongs.length} من أصل {ANGHAM_OLD_CLASSICS.length} أغنية
          </div>
        </div>

        {/* Album Scrollable Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-2 px-2">
          {albumTabs.map((tab) => {
            const isSelected = selectedAlbum === tab;
            const label = tab === "all" ? `كل الأغاني (${ANGHAM_OLD_CLASSICS.length})` : tab;
            return (
              <button
                key={tab}
                onClick={() => setSelectedAlbum(tab)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-rose-500 text-white shadow-md shadow-rose-500/30 scale-105"
                    : "bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Songs Grid */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
        <AnimatePresence mode="popLayout">
          {filteredSongs.map((song, idx) => {
            const isSaved = savedOfflineIds.has(song.songId) || savedOfflineIds.has(song.youtubeVideoId);
            const isDownloading = downloadingIds.has(song.songId);

            return (
              <motion.div
                key={song.songId}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.3) }}
                className="group relative flex items-center justify-between p-3 rounded-2xl bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/5 hover:border-rose-500/30 transition-all shadow-md hover:shadow-rose-950/20"
              >
                {/* Left: Thumbnail & Info */}
                <div
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  onClick={() => handlePlaySong(song, idx)}
                >
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getProxyUrl(song.thumbnailUrl)}
                      alt={song.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-white truncate group-hover:text-rose-300 transition-colors">
                      {song.title}
                    </h3>
                    <p className="text-xs text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
                      <span className="truncate">{song.album}</span>
                      <span className="shrink-0">•</span>
                      <span className="shrink-0 text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 inline" />
                        {song.duration}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0 pr-2">
                  <button
                    onClick={() => handleDownloadSong(song)}
                    disabled={isDownloading}
                    title={isSaved ? "محملة للأوفلاين" : "تحميل للأوفلاين"}
                    className={`p-2 rounded-full transition-all ${
                      isSaved
                        ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                        : isDownloading
                        ? "text-amber-400 bg-amber-500/10 animate-spin"
                        : "text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {isSaved ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isDownloading ? (
                      <RefreshCw className="w-4 h-4" />
                    ) : (
                      <DownloadCloud className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredSongs.length === 0 && (
        <div className="relative z-10 text-center py-16 text-zinc-500">
          <Disc className="w-12 h-12 mx-auto mb-3 opacity-30 animate-spin" style={{ animationDuration: "12s" }} />
          <p className="text-base font-bold text-zinc-400">لم يتم العثور على أغنية تطابق بحثك</p>
          <p className="text-xs mt-1">جرب البحث بكلمة أخرى أو تصفح كل الألبومات</p>
        </div>
      )}
    </section>
  );
}
