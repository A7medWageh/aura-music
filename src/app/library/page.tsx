"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getAllOfflineSongs,
  getAllOfflineLyricsMap,
  deleteOfflineSong,
  deleteArtist,
  deleteAlbum,
  toggleSongHidden,
  consolidateArtistFolders,
  renameOfflineFolder,
  moveSongToOfflineFolder,
  deleteOfflineFolder,
  seedCurated50Songs,
  getCustomOfflineFolders,
  createCustomOfflineFolder,
} from "@/offline/indexedDbCache";
import { subscribeDownloads } from "@/state/downloadStore";
import { usePlayer } from "@/state/playerContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Trash2,
  WifiOff,
  ArrowRight,
  DownloadCloud,
  Lock,
  Unlock,
  EyeOff,
  Eye,
  HardDrive,
  Music,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Search,
  X,
  FileText,
  Sparkles,
  RefreshCw,
  Smartphone,
  Edit2,
  FolderPlus,
  FolderInput,
  Folder,
  Plus,
} from "lucide-react";
import { getProxyUrl } from "@/utils/media";
import { openBackgroundCustomizer } from "@/services/theme/customBackgroundStorage";
import { getCanonicalArtistName } from "@/utils/artistNormalizer";
import { searchOfflineSongs, type OfflineSearchResult } from "@/utils/arabicSearch";
import { LibraryBackupModal } from "@/components/LibraryBackupModal";

type Song = {
  songId: string; title: string; artist: string; thumbnailUrl?: string;
  youtubeVideoId: string; folderName?: string; albumName?: string; audioReady?: boolean; savedAt?: number;
  isHidden?: boolean;
};

type AlbumFolder = {
  name: string;
  songs: Song[];
  cover: string;
};

type ArtistFolder = {
  name: string;
  albums: AlbumFolder[];
  singles: Song[];
  cover: string;
};

function ArtistAvatar({ artistName, fallbackCover }: { artistName: string, fallbackCover: string }) {
  if (fallbackCover) {
    return (
      <img
        src={getProxyUrl(fallbackCover)}
        alt={artistName}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/placeholder-artist.jpg";
        }}
      />
    );
  }
  return <div className="w-full h-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center text-4xl">🎤</div>;
}

let cachedLibraryArtists: ArtistFolder[] = [];
let cachedLibraryStats = { sizeMB: 0, count: 0 };
let jannatAutoHealChecked = false;

export default function LibraryPage() {
  const { playNow, enqueueSongs, setQueue } = usePlayer();
  const [artists, setArtists] = useState<ArtistFolder[]>(() => cachedLibraryArtists);
  const [allVisibleSongs, setAllVisibleSongs] = useState<Song[]>([]);
  const [lyricsMap, setLyricsMap] = useState<Map<string, string>>(new Map());

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "meta" | "lyrics">("all");

  // Navigation State
  const [openArtist, setOpenArtist] = useState<string | null>(null);
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);
  
  // Vault State
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultPassword, setVaultPassword] = useState("");
  const [showVaultPrompt, setShowVaultPrompt] = useState(false);
  const [setupVault, setSetupVault] = useState(false);

  const [loading, setLoading] = useState(() => cachedLibraryArtists.length === 0);
  const [toast, setToast] = useState<string | null>(null);
  const [stats, setStats] = useState(() => cachedLibraryStats);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // ── Folder Management & Move Song State ──
  const [movingSong, setMovingSong] = useState<Song | null>(null);
  const [targetFolder, setTargetFolder] = useState("");
  const [isCreatingFolderInMove, setIsCreatingFolderInMove] = useState(false);
  const [newFolderNameInMove, setNewFolderNameInMove] = useState("");

  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createdFolderName, setCreatedFolderName] = useState("");
  const [isSeeding50, setIsSeeding50] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchOfflineSongs(allVisibleSongs, lyricsMap, searchQuery, filterMode);
  }, [allVisibleSongs, lyricsMap, searchQuery, filterMode]);

  // Lazy-load lyrics only when user actually types a search query
  useEffect(() => {
    if (searchQuery.trim().length > 0 && filterMode !== "meta" && lyricsMap.size === 0) {
      getAllOfflineLyricsMap().then(setLyricsMap).catch(() => {});
    }
  }, [searchQuery, filterMode, lyricsMap.size]);

  const loadLibrary = async () => {
    try {
      if (cachedLibraryArtists.length === 0) setLoading(true);
      const songs = await getAllOfflineSongs();
      
      // Filter hidden songs unless vault is unlocked
      const visibleSongs: Song[] = songs.filter(s => vaultUnlocked ? true : !s.isHidden);
      setAllVisibleSongs(visibleSongs);
      
      const estimatedSizeMB = visibleSongs.filter(s => s.audioReady).length * 3.5;
      const newStats = { sizeMB: estimatedSizeMB, count: visibleSongs.length };
      setStats(newStats);
      cachedLibraryStats = newStats;

      // Grouping: Artist -> Album -> Songs
      const artistMap = new Map<string, { albums: Map<string, Song[]>, singles: Song[] }>();

      for (const song of visibleSongs.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))) {
        const rawArtist = song.folderName || song.artist || "أخرى";
        const artistName = getCanonicalArtistName(rawArtist);
        if (!artistMap.has(artistName)) {
          artistMap.set(artistName, { albums: new Map(), singles: [] });
        }
        const artistNode = artistMap.get(artistName)!;

        if (song.albumName) {
          if (!artistNode.albums.has(song.albumName)) {
            artistNode.albums.set(song.albumName, []);
          }
          artistNode.albums.get(song.albumName)!.push(song);
        } else {
          artistNode.singles.push(song);
        }
      }

      // Also include user-created custom folders (even if empty)
      const customFolders = getCustomOfflineFolders();
      for (const cf of customFolders) {
        if (!artistMap.has(cf)) {
          artistMap.set(cf, { albums: new Map(), singles: [] });
        }
      }

      const result: ArtistFolder[] = [...artistMap.entries()].map(([name, data]) => {
        const albums: AlbumFolder[] = [...data.albums.entries()].map(([albumName, albumSongs]) => ({
          name: albumName,
          songs: albumSongs,
          cover: albumSongs[0]?.thumbnailUrl || ""
        }));
        
        const cover = albums[0]?.cover || data.singles[0]?.thumbnailUrl || "";
        return { name, albums, singles: data.singles, cover };
      });

      setArtists(result);
      cachedLibraryArtists = result;
    } catch (err) {
      console.error("[Library] loadLibrary error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    // Fallback safety timeout: ensure loading skeleton never stays stuck
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    let timer: any = null;
    const scheduleReload = (e?: any) => {
      // Ignore background consolidation events to avoid feedback loops
      const eventType = e?.detail?.type;
      if (eventType === "artists-consolidated" || eventType === "jannat-auto-purged") {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadLibrary();
      }, 400);
    };

    loadLibrary(); 

    window.addEventListener("aura-library-updated", scheduleReload);
    window.addEventListener("aura-thumbnails-migrated", scheduleReload);

    let prevJobState = "";
    const unsubscribe = subscribeDownloads((jobs) => {
      const summary = jobs.map(j => `${j.id}:${j.status}:${j.done}`).join(",");
      if (summary !== prevJobState) {
        prevJobState = summary;
        scheduleReload();
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      if (timer) clearTimeout(timer);
      window.removeEventListener("aura-library-updated", scheduleReload);
      window.removeEventListener("aura-thumbnails-migrated", scheduleReload);
      unsubscribe();
    };
  }, [vaultUnlocked]);

  // Silent background auto-heal for Jannat corrupted tracks (runs once per session to prevent lag)
  useEffect(() => {
    if (jannatAutoHealChecked) return;
    jannatAutoHealChecked = true;
    let cancel = false;
    const silentCheck = setTimeout(async () => {
      if (cancel) return;
      try {
        const { hasCorruptedJannatTracks, repairCorruptedJannatTracks } = await import("@/offline/indexedDbCache");
        const hasCorrupt = await hasCorruptedJannatTracks();
        if (hasCorrupt && !cancel && typeof navigator !== "undefined" && navigator.onLine) {
          console.log("[Library] Auto-healing corrupted Jannat tracks silently in background...");
          const res = await repairCorruptedJannatTracks();
          if (!cancel && res.redownloaded > 0) {
            loadLibrary();
          }
        }
      } catch {}
    }, 4000);

    return () => {
      cancel = true;
      clearTimeout(silentCheck);
    };
  }, []);

  const handleDeleteArtist = async (e: React.MouseEvent, artistName: string) => {
    e.stopPropagation();
    if (!confirm(`هل أنت متأكد من حذف جميع أغاني وألبومات ${artistName}؟`)) return;
    await deleteArtist(artistName);
    showToast("تم حذف الفنان بنجاح");
    setOpenArtist(null);
    loadLibrary();
  };

  const handleDeleteAlbum = async (e: React.MouseEvent, albumName: string, artistName: string) => {
    e.stopPropagation();
    if (!confirm(`هل أنت متأكد من حذف ألبوم ${albumName}؟`)) return;
    await deleteAlbum(albumName, artistName);
    showToast("تم حذف الألبوم");
    setOpenAlbum(null);
    loadLibrary();
  };

  const handleDeleteSong = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    await deleteOfflineSong(songId);
    showToast("تم حذف الأغنية");
    loadLibrary();
  };

  const handleToggleHide = async (e: React.MouseEvent, song: Song) => {
    e.stopPropagation();
    const isHidden = !song.isHidden;
    await toggleSongHidden(song.songId, isHidden);
    showToast(isHidden ? "تم الإخفاء في المجلد السري" : "تمت إزالة الإخفاء");
    loadLibrary();
  };

  const unlockVault = () => {
    const saved = localStorage.getItem("aura-vault-pass");
    if (!saved) {
      // First time setup
      setSetupVault(true);
      setShowVaultPrompt(true);
      return;
    }
    setShowVaultPrompt(true);
    setSetupVault(false);
  };

  const submitVaultPassword = () => {
    if (setupVault) {
      if (vaultPassword.length < 4) { showToast("كلمة المرور قصيرة جداً"); return; }
      localStorage.setItem("aura-vault-pass", vaultPassword);
      setVaultUnlocked(true);
      setShowVaultPrompt(false);
      showToast("تم إنشاء المجلد السري بنجاح!");
    } else {
      const saved = localStorage.getItem("aura-vault-pass");
      if (vaultPassword === saved) {
        setVaultUnlocked(true);
        setShowVaultPrompt(false);
        showToast("تم فتح المجلد السري");
      } else {
        showToast("كلمة المرور خاطئة");
      }
    }
    setVaultPassword("");
  };

  const playList = (songs: Song[], startIndex = 0) => {
    const ready = songs.filter(s => s.audioReady);
    if (!ready.length) {
      showToast("لا توجد أغانٍ مكتملة التحميل في هذه القائمة للاستماع أوفلاين");
      return;
    }
    const idx = Math.max(0, Math.min(startIndex, ready.length - 1));
    setQueue(ready as any, idx);
  };

  const currentArtistData = artists.find(a => a.name === openArtist);
  const currentAlbumData = currentArtistData?.albums.find(a => a.name === openAlbum);

  return (
    <div className="relative z-[2] space-y-8 pb-24">
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-28 right-8 z-50 px-5 py-2.5 glass rounded-full border border-indigo-500/30 flex items-center gap-2 shadow-xl text-sm font-bold">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vault Prompt Modal */}
      {showVaultPrompt && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl w-full max-w-sm text-center space-y-4 shadow-2xl">
            <Lock className="w-12 h-12 text-indigo-400 mx-auto" />
            <h3 className="text-xl font-black">{setupVault ? "إعداد المجلد السري" : "المجلد السري"}</h3>
            <p className="text-sm text-gray-400">
              {setupVault ? "أدخل كلمة مرور جديدة لحماية أغانيك المخفية. لا تنساها!" : "أدخل كلمة المرور لفتح الأغاني المخفية"}
            </p>
            <input type="password" value={vaultPassword} onChange={(e)=>setVaultPassword(e.target.value)}
              placeholder="كلمة المرور" className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-center focus:border-indigo-500 outline-none" />
            <div className="flex gap-2">
              <button onClick={() => setShowVaultPrompt(false)} className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 font-bold">إلغاء</button>
              <button onClick={submitVaultPassword} className="flex-1 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold">
                {setupVault ? "حفظ" : "دخول"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer / Backup Modal */}
      <LibraryBackupModal
        isOpen={showBackupModal}
        onClose={() => setShowBackupModal(false)}
        songsCount={stats.count}
        totalSizeMB={stats.sizeMB}
        onSuccess={() => loadLibrary()}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        {openAlbum ? (
          <button onClick={() => setOpenAlbum(null)} className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors font-bold">
            <ArrowRight className="w-5 h-5" /> رجوع للفنان ({openArtist})
          </button>
        ) : openArtist ? (
          <button onClick={() => setOpenArtist(null)} className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors font-bold">
            <ArrowRight className="w-5 h-5" /> رجوع للمكتبة
          </button>
        ) : (
          <div>
            <h1 className="text-4xl font-black mb-1">مكتبتي 🎧</h1>
            <div className="flex items-center gap-3 text-sm font-bold text-gray-400 mt-2">
              <span className="flex items-center gap-1.5"><Music className="w-4 h-4"/> {stats.count} أغنية</span>
              <span className="flex items-center gap-1.5"><HardDrive className="w-4 h-4"/> {stats.sizeMB.toFixed(1)} MB تخزين</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          {/* Seed 50 Curated Arabic Songs Button */}
          <button
            onClick={async () => {
              setIsSeeding50(true);
              try {
                const count = await seedCurated50Songs();
                showToast(`تمت إضافة ${count > 0 ? count : 50} أغنية عربية منوعة لمكتبتك! 🎉`);
                loadLibrary();
              } finally {
                setIsSeeding50(false);
              }
            }}
            disabled={isSeeding50}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all bg-gradient-to-r from-amber-500/20 to-pink-500/20 hover:from-amber-500/30 hover:to-pink-500/30 text-amber-200 border border-amber-500/30 active:scale-95 shadow-sm"
            title="إضافة 50 أغنية عربية حزينة ورومانسية مشهورة لأشهر النجوم"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{isSeeding50 ? "جاري الإضافة..." : "✨ تشكيلة 50 أغنية"}</span>
          </button>

          {/* Create New Folder Button */}
          <button
            onClick={() => {
              setShowCreateFolderModal(true);
              setCreatedFolderName("");
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 active:scale-95 shadow-sm"
            title="إنشاء مجلد جديد لتنظيم الأغاني"
          >
            <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
            <span>+ مجلد جديد 📁</span>
          </button>

          {/* Transfer to Native App Button */}
          <button
            onClick={() => setShowBackupModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all bg-gradient-to-r from-blue-600/25 to-indigo-600/25 hover:from-blue-600/35 hover:to-indigo-600/35 text-blue-200 border border-blue-500/30 hover:border-blue-400 active:scale-95 shadow-sm"
            title="نقل وتصدير الأغاني إلى تطبيق الآيفون المثبت (تصدير / استيراد)"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-400" />
            <span>نقل الأغاني للتطبيق 📲</span>
          </button>

          {/* Refresh/Update PWA Player Button */}
          <button
            onClick={async () => {
              if (confirm("هل تريد تحديث ملفات المشغل لأحدث إصدار؟\n\nأغانيك المحملة (الـ 1 جيجا) محفوظة في الذاكرة ولن تفقد أي أغنية نهائياً.")) {
                const { forceUpdatePwa } = await import("@/components/PwaRegistration");
                forceUpdatePwa();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 active:scale-95 shadow-sm"
            title="تحديث ملفات المشغل وتفعيل ميزة استئناف شاشة القفل (أغانيك المحملة آمنة 100%)"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>تحديث المشغل (v2.5)</span>
          </button>

          {/* Custom Background Button */}
          <button
            onClick={() => openBackgroundCustomizer("library")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all bg-gradient-to-r from-purple-500/20 to-indigo-500/20 hover:from-purple-500/35 hover:to-indigo-500/35 text-indigo-300 border border-indigo-500/30 hover:border-indigo-400 active:scale-95 shadow-sm"
            title="تخصيص صورة خلفية للمكتبة مع تأثير العمق وتناسق الألوان"
          >
            <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span>صورة خلفية</span>
          </button>

          <button onClick={() => vaultUnlocked ? setVaultUnlocked(false) : unlockVault()}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${vaultUnlocked ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
            {vaultUnlocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {vaultUnlocked ? "قفل السري" : "المجلد السري"}
          </button>
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-400 font-bold hidden sm:inline">أوفلاين جاهز</span>
          </div>
        </div>
      </div>

      {/* Smart Offline Search Bar */}
      <div className="relative w-full max-w-2xl mx-auto space-y-2.5">
        <div className="relative flex items-center rounded-2xl bg-white/[0.06] hover:bg-white/[0.09] focus-within:bg-black/60 border border-white/10 focus-within:border-indigo-400/60 focus-within:ring-2 focus-within:ring-indigo-500/20 shadow-lg backdrop-blur-xl transition-all">
          <div className="pr-4 pl-2 text-gray-400 flex items-center justify-center">
            <Search className="w-5 h-5 text-gray-400 focus-within:text-indigo-400 transition-colors" />
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن أغنية، فنان، أو كلمات من الأغنية (بدون نت)... 🔍"
            className="w-full py-3.5 pl-10 pr-1 bg-transparent text-white placeholder-gray-400 text-sm sm:text-base font-bold outline-none"
            dir="rtl"
          />

          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute left-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all active:scale-90"
              title="مسح البحث"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search Filter Chips & Status */}
        {searchQuery.trim() && (
          <div className="flex items-center justify-between px-1 flex-wrap gap-2 text-xs font-bold w-full max-w-full overflow-hidden">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-gray-400 text-[11px] shrink-0">بحث في:</span>
              {(
                [
                  { id: "all", label: "الكل ⚡" },
                  { id: "meta", label: "العنوان والفنان 🎵" },
                  { id: "lyrics", label: "الكلمات 📝" },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => setFilterMode(chip.id)}
                  className={`px-2.5 py-1 rounded-full transition-all border text-[11px] sm:text-xs shrink-0 ${
                    filterMode === chip.id
                      ? "bg-indigo-500 text-white border-indigo-400 shadow-md shadow-indigo-500/25"
                      : "bg-white/5 text-gray-400 hover:text-white border-white/10"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded-full text-[10px] sm:text-xs">
                {searchResults.length} {searchResults.length === 1 ? "أغنية" : "أغانٍ"}
              </span>
              {searchResults.length > 0 && (
                <button
                  onClick={() => playList(searchResults.map((r) => r.item))}
                  className="px-2.5 sm:px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-full flex items-center gap-1 text-[11px] sm:text-xs shadow-md transition-all active:scale-95 shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>تشغيل النتائج</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {searchQuery.trim().length > 0 ? (
        /* Search Results View */
        <div className="w-full max-w-full overflow-hidden space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10 gap-2 flex-wrap min-w-0">
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5 min-w-0 overflow-hidden truncate">
              <span className="shrink-0">نتائج البحث:</span>
              <span className="text-indigo-400 truncate max-w-[180px] sm:max-w-md">"{searchQuery}"</span>
            </h3>
            <button
              onClick={() => setSearchQuery("")}
              className="text-xs text-gray-400 hover:text-white underline font-bold shrink-0"
            >
              مسح والرجوع
            </button>
          </div>

          {searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-center gap-3 bg-white/[0.02] rounded-3xl border border-white/5 p-4 sm:p-6 w-full max-w-full overflow-hidden">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/5 flex items-center justify-center text-2xl sm:text-3xl">
                🔍
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white">لم نجد أغانٍ مطابقة</h3>
              <p className="text-xs sm:text-sm text-gray-400 max-w-sm px-2">
                لم نجد أي أغنية مطابقة لبحثك في مكتبتك الأوفلاين. جرب كتابة اسم الأغنية أو اسم الفنان أو جزء من الكلمات.
              </p>
              {filterMode !== "all" && (
                <button
                  onClick={() => setFilterMode("all")}
                  className="mt-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 underline"
                >
                  البحث في الكل (العنوان + الفنان + الكلمات)
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-2 w-full max-w-full overflow-hidden">
              {searchResults.map((result, i) => (
                <div key={result.item.songId} className="space-y-1 w-full max-w-full min-w-0 overflow-hidden">
                  <SongRow
                    song={result.item}
                    index={i}
                    play={() => {
                      if (!result.item.audioReady && typeof navigator !== "undefined" && !navigator.onLine) {
                        showToast("لم يكتمل تنزيل هذه الأغنية بعد. اتصل بالإنترنت لتحميلها للاستماع أوفلاين.");
                        return;
                      }
                      setQueue(searchResults.map((r) => r.item) as any, i);
                    }}
                    onDelete={(e: any) => handleDeleteSong(e, result.item.songId)}
                    onToggleHide={(e: any) => handleToggleHide(e, result.item)}
                    onMove={() => {
                      setMovingSong(result.item);
                      setTargetFolder(result.item.folderName || result.item.artist || "أخرى");
                      setIsCreatingFolderInMove(false);
                      setNewFolderNameInMove("");
                    }}
                    vaultUnlocked={vaultUnlocked}
                    badge={
                      result.matchedField === "lyrics" ? (
                        <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] text-purple-300 bg-purple-500/20 border border-purple-500/30 px-1.5 sm:px-2 py-0.5 rounded-full font-black shrink-0">
                          <FileText className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-400" />
                          في الكلمات
                        </span>
                      ) : undefined
                    }
                  />
                  {result.lyricsSnippet && (
                    <div className="mr-6 sm:mr-14 ml-1 sm:ml-3 px-2.5 py-1 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[10px] sm:text-xs text-purple-200/90 font-medium flex items-center gap-1.5 overflow-hidden min-w-0">
                      <span className="text-purple-400 font-bold shrink-0 text-[10px] sm:text-xs">📝 من الكلمات:</span>
                      <span className="italic truncate min-w-0" dir="rtl">"{result.lyricsSnippet}"</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-white/5 rounded-2xl mb-3" />
              <div className="h-3 bg-white/5 rounded w-3/4 mb-2" />
            </div>
          ))}
        </div>
      ) : artists.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4 p-6 rounded-3xl bg-white/[0.02] border border-white/5">
          <div className="w-20 h-20 rounded-full glass flex items-center justify-center">
            <DownloadCloud className="w-10 h-10 text-indigo-400 opacity-60" />
          </div>
          <h2 className="text-2xl font-bold">مكتبتك فارغة</h2>
          <p className="text-gray-400 max-w-sm text-sm">
            يمكنك تحميل أغانيك المفضلة، أو إضافة تشكيلة الـ 50 أغنية العربية الأكثر شهرة (حزين ورومانسي) بنقرة واحدة!
          </p>
          <button
            onClick={async () => {
              setIsSeeding50(true);
              try {
                await seedCurated50Songs();
                showToast("تمت إضافة 50 أغنية إلى مكتبتك الأوفلاين! 🎉");
                loadLibrary();
              } finally {
                setIsSeeding50(false);
              }
            }}
            disabled={isSeeding50}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 hover:from-indigo-600 hover:to-pink-700 text-white rounded-2xl font-black flex items-center gap-2.5 shadow-xl hover:shadow-indigo-500/25 active:scale-95 transition-all text-sm mt-2"
          >
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span>{isSeeding50 ? "جاري تجهيز الأغاني..." : "✨ إضافة 50 أغنية مشهورة ورومانسية فوراً 🎵"}</span>
          </button>
        </div>
      ) : openAlbum && currentAlbumData ? (
        /* Album View (Level 3) */
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-6 p-4 rounded-2xl bg-black/30 backdrop-blur-xl border border-white/10 shadow-lg">
            <div className="flex items-center gap-4">
               {currentAlbumData.cover ? (
                  <img
                    src={getProxyUrl(currentAlbumData.cover)}
                    alt={currentAlbumData.name}
                    className="w-16 h-16 rounded-xl object-cover shadow-lg"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-album.jpg"; }}
                  />
               ) : (
                  <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center"><Music className="w-6 h-6 text-gray-400" /></div>
               )}
               <div>
                  <h2 className="text-2xl font-black">{currentAlbumData.name}</h2>
                  <p className="text-gray-400 text-sm">{currentAlbumData.songs.length} أغنية</p>
               </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">

              <button onClick={() => playList(currentAlbumData.songs)} className="px-4 py-2 bg-indigo-500 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-600 transition-colors">
                <Play className="w-4 h-4 fill-current" /> تشغيل الألبوم
              </button>
              <button onClick={(e: any) => handleDeleteAlbum(e, currentAlbumData.name, openArtist!)} className="p-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            {currentAlbumData.songs.map((song, i) => (
              <SongRow
                key={song.songId}
                song={song}
                index={i}
                play={() => {
                  if (!song.audioReady && typeof navigator !== "undefined" && !navigator.onLine) {
                    showToast("لم يكتمل تنزيل هذه الأغنية بعد. اتصل بالإنترنت لتحميلها للاستماع أوفلاين.");
                    return;
                  }
                  // Set full album queue starting from this track so it advances automatically
                  setQueue(currentAlbumData.songs as any, i);
                }}
                onDelete={(e: any) => handleDeleteSong(e, song.songId)}
                onToggleHide={(e: any) => handleToggleHide(e, song)}
                onMove={() => {
                  setMovingSong(song);
                  setTargetFolder(song.folderName || song.artist || "أخرى");
                  setIsCreatingFolderInMove(false);
                  setNewFolderNameInMove("");
                }}
                vaultUnlocked={vaultUnlocked}
              />
            ))}
          </div>
        </div>
      ) : openArtist && currentArtistData ? (
        /* Artist / Folder View (Level 2) */
        <div className="space-y-8">
           <div className="flex items-center justify-between p-4 rounded-2xl bg-black/30 backdrop-blur-xl border border-white/10 shadow-lg">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl sm:text-3xl font-black">{currentArtistData.name}</h2>
                <button
                  onClick={() => {
                    setRenamingFolder(currentArtistData.name);
                    setNewFolderName(currentArtistData.name);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-all text-xs flex items-center gap-1.5 font-bold border border-white/10"
                  title="إعادة تسمية هذا المجلد"
                >
                  <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>تسمية المجلد</span>
                </button>
              </div>

              <div className="flex gap-2 items-center flex-wrap">
                {currentArtistData.albums.flatMap(a => a.songs).length + currentArtistData.singles.length > 0 ? (
                  <button onClick={() => playList([...currentArtistData.albums.flatMap(a=>a.songs), ...currentArtistData.singles])} className="px-4 py-2 bg-indigo-500 rounded-xl font-bold flex items-center gap-2">
                    <Play className="w-4 h-4 fill-current" /> تشغيل الكل
                  </button>
                ) : (
                  <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl font-bold">
                    مجلد فارغ
                  </span>
                )}
                <button
                  onClick={async (e: any) => {
                    e.stopPropagation();
                    const total = currentArtistData.albums.flatMap(a => a.songs).length + currentArtistData.singles.length;
                    if (total === 0) {
                      if (confirm(`هل أنت متأكد من حذف المجلد الفارغ "${currentArtistData.name}"؟`)) {
                        await deleteOfflineFolder(currentArtistData.name, false);
                        showToast("تم حذف المجلد الفارغ بنجاح");
                        setOpenArtist(null);
                        loadLibrary();
                      }
                    } else {
                      handleDeleteArtist(e, currentArtistData.name);
                    }
                  }}
                  className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all"
                  title={currentArtistData.albums.flatMap(a => a.songs).length + currentArtistData.singles.length === 0 ? "حذف المجلد الفارغ" : "حذف المجلد"}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
           </div>

           {currentArtistData.albums.length > 0 && (
             <div>
               <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-white/5 pb-2">الألبومات</h3>
               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                 {currentArtistData.albums.map((album) => (
                    <motion.div key={album.name} whileHover={{ y: -5, scale: 1.02 }} onClick={() => setOpenAlbum(album.name)} className="group cursor-pointer">
                      <div className="relative aspect-square mb-3 rounded-2xl overflow-hidden shadow-lg">
                        {album.cover ? (
                          <img
                            src={getProxyUrl(album.cover)}
                            alt={album.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-album.jpg"; }}
                          />
                        ) : (
                          <div className="w-full h-full bg-white/5 flex justify-center items-center"><Music className="w-8 h-8 opacity-50"/></div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center shadow-2xl scale-0 group-hover:scale-100 transition-transform">
                            <Play className="w-5 h-5 text-white fill-current translate-x-0.5" />
                          </button>
                        </div>
                      </div>
                      <h3 className="font-bold text-[15px] truncate text-white">{album.name}</h3>
                      <p className="text-xs text-gray-400 font-bold truncate">{album.songs.length} أغاني</p>
                    </motion.div>
                 ))}
               </div>
             </div>
           )}

           {currentArtistData.singles.length > 0 && (
             <div>
               <h3 className="text-xl font-bold text-gray-300 mb-4 border-b border-white/5 pb-2">أغاني منفردة (Singles)</h3>
               <div className="grid gap-2">
                 {currentArtistData.singles.map((song, i) => (
                   <SongRow
                     key={song.songId}
                     song={song}
                     index={i}
                     play={() => {
                       if (!song.audioReady && typeof navigator !== "undefined" && !navigator.onLine) {
                         showToast("لم يكتمل تنزيل هذه الأغنية بعد. اتصل بالإنترنت لتحميلها للاستماع أوفلاين.");
                         return;
                       }
                       setQueue(currentArtistData.singles as any, i);
                     }}
                     onDelete={(e: any) => handleDeleteSong(e, song.songId)}
                     onToggleHide={(e: any) => handleToggleHide(e, song)}
                     onMove={() => {
                       setMovingSong(song);
                       setTargetFolder(song.folderName || song.artist || "أخرى");
                       setIsCreatingFolderInMove(false);
                       setNewFolderNameInMove("");
                     }}
                     vaultUnlocked={vaultUnlocked}
                   />
                 ))}
               </div>
             </div>
           )}
        </div>
      ) : (
        /* Artists / Folders View (Level 1) */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {artists.map((artist) => {
            const totalSongs = artist.albums.flatMap(a => a.songs).length + artist.singles.length;
            const isEmpty = totalSongs === 0;

            return (
              <div
                key={artist.name}
                onClick={() => setOpenArtist(artist.name)}
                className="group cursor-pointer hover:-translate-y-1 transition-transform duration-300 relative"
              >
                {/* Empty folder badge & delete button */}
                {isEmpty && (
                  <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`حذف المجلد الفارغ "${artist.name}"؟`)) {
                          await deleteOfflineFolder(artist.name, false);
                          showToast("تم حذف المجلد الفارغ بنجاح");
                          loadLibrary();
                        }
                      }}
                      className="p-1.5 bg-rose-500/90 hover:bg-rose-600 text-white rounded-full shadow-lg transition-all"
                      title="حذف المجلد الفارغ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="relative aspect-square mb-3">
                  <div className="absolute inset-0 rounded-full overflow-hidden bg-white/5 translate-x-1 translate-y-1 opacity-40 scale-95 transition-all duration-300" />
                  <div className="absolute inset-0 rounded-full overflow-hidden shadow-lg border-2 border-white/10 group-hover:border-indigo-400/50 transition-all duration-300">
                    <ArtistAvatar artistName={artist.name} fallbackCover={artist.cover} />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {!isEmpty && (
                        <button
                          onClick={(e: any) => {
                            e.stopPropagation();
                            playList([...artist.albums.flatMap((a) => a.songs), ...artist.singles]);
                          }}
                          className="w-14 h-14 bg-indigo-500 rounded-full flex items-center justify-center shadow-2xl scale-0 group-hover:scale-100 transition-transform duration-300 delay-75"
                        >
                          <Play className="w-6 h-6 text-white fill-current translate-x-0.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <h3 className="font-black text-lg text-center truncate text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
                    {artist.name}
                  </h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingFolder(artist.name);
                      setNewFolderName(artist.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-indigo-400 transition-opacity"
                    title="تسمية المجلد"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-gray-300 font-bold text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                  {isEmpty ? (
                    <span className="text-amber-400 font-bold">مجلد فارغ</span>
                  ) : (
                    `${artist.albums.length} ألبومات · ${artist.singles.length} منفردة`
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Move Song to Folder Modal ── */}
      {movingSong && (
        <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl w-full max-w-md space-y-4 shadow-2xl text-right" dir="rtl">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-lg font-black flex items-center gap-2">
                <FolderInput className="w-5 h-5 text-indigo-400" />
                <span>نقل الأغنية إلى مجلد</span>
              </h3>
              <button
                onClick={() => setMovingSong(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-sm font-bold text-gray-300 truncate">
                الأغنية: <span className="text-white font-black">{movingSong.title}</span> ({movingSong.artist})
              </p>
              <p className="text-xs text-gray-400 mt-1">
                المجلد الحالي: <span className="text-indigo-300 font-bold">{movingSong.folderName || movingSong.artist || "أخرى"}</span>
              </p>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              <p className="text-xs font-bold text-gray-400">اختر المجلد الهدف:</p>
              {artists.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => {
                    setTargetFolder(a.name);
                    setIsCreatingFolderInMove(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-sm font-bold transition-all ${
                    !isCreatingFolderInMove && targetFolder === a.name
                      ? "bg-indigo-500/25 border-indigo-400 text-white shadow-sm"
                      : "bg-white/[0.03] border-white/5 text-gray-300 hover:bg-white/[0.08]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-indigo-400" />
                    <span>{a.name}</span>
                  </span>
                  <span className="text-xs text-gray-500 font-normal">
                    {a.albums.flatMap((al) => al.songs).length + a.singles.length} أغنية
                  </span>
                </button>
              ))}
            </div>

            {/* Option to create a new folder */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <button
                type="button"
                onClick={() => setIsCreatingFolderInMove(!isCreatingFolderInMove)}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إنشاء مجلد جديد ونقل الأغنية إليه</span>
              </button>

              {isCreatingFolderInMove && (
                <input
                  type="text"
                  value={newFolderNameInMove}
                  onChange={(e) => setNewFolderNameInMove(e.target.value)}
                  placeholder="اسم المجلد الجديد..."
                  className="w-full bg-black/60 border border-indigo-500/40 rounded-xl p-2.5 text-sm font-bold text-white outline-none focus:border-indigo-400"
                />
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMovingSong(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  const finalFolder = isCreatingFolderInMove
                    ? newFolderNameInMove.trim()
                    : targetFolder.trim();
                  if (!finalFolder) {
                    showToast("يرجى اختيار أو كتابة اسم المجلد");
                    return;
                  }
                  await moveSongToOfflineFolder(movingSong.songId, finalFolder);
                  showToast(`تم نقل "${movingSong.title}" إلى مجلد "${finalFolder}" بنجاح ✅`);
                  setMovingSong(null);
                  loadLibrary();
                }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold text-sm text-white shadow-lg"
              >
                تأكيد النقل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename Folder Modal ── */}
      {renamingFolder && (
        <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl text-right" dir="rtl">
            <h3 className="text-lg font-black flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-400" />
              <span>إعادة تسمية المجلد</span>
            </h3>
            <p className="text-xs text-gray-400">
              الاسم الحالي: <span className="text-white font-bold">{renamingFolder}</span>
            </p>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="الاسم الجديد للمجلد..."
              className="w-full bg-black/60 border border-indigo-500/40 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRenamingFolder(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  const cleanNew = newFolderName.trim();
                  if (!cleanNew) {
                    showToast("يرجى كتابة اسم للمجلد");
                    return;
                  }
                  await renameOfflineFolder(renamingFolder, cleanNew);
                  showToast(`تمت إعادة تسمية المجلد إلى "${cleanNew}" بنجاح ✅`);
                  if (openArtist === renamingFolder) {
                    setOpenArtist(cleanNew);
                  }
                  setRenamingFolder(null);
                  loadLibrary();
                }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold text-sm text-white shadow-lg"
              >
                حفظ التسمية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create New Folder Modal ── */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl w-full max-w-sm space-y-4 shadow-2xl text-right" dir="rtl">
            <h3 className="text-lg font-black flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-indigo-400" />
              <span>إنشاء مجلد جديد</span>
            </h3>
            <p className="text-xs text-gray-400">
              أدخل اسم المجلد الجديد الذي ترغب في تنظيم أغانيك بداخله:
            </p>
            <input
              type="text"
              value={createdFolderName}
              onChange={(e) => setCreatedFolderName(e.target.value)}
              placeholder="مثال: حزين، كلاسيكيات، رومانسيات..."
              className="w-full bg-black/60 border border-indigo-500/40 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-indigo-400"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCreateFolderModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  const clean = createdFolderName.trim();
                  if (!clean) {
                    showToast("يرجى كتابة اسم المجلد");
                    return;
                  }
                  const ok = createCustomOfflineFolder(clean);
                  if (ok) {
                    showToast(`تم إنشاء المجلد "${clean}" بنجاح ✅`);
                    setShowCreateFolderModal(false);
                    loadLibrary();
                  } else {
                    showToast("هذا المجلد موجود بالفعل");
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 font-bold text-sm text-white shadow-lg"
              >
                إنشاء المجلد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SongRow({ song, index, play, onDelete, onToggleHide, onMove, vaultUnlocked, badge }: any) {
  const isReady = song.audioReady ?? false;
  return (
    <div 
      onClick={play} 
      className="group flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors cursor-pointer border border-white/5 hover:border-indigo-500/30 shadow-sm w-full max-w-full overflow-hidden min-w-0"
    >
      {/* Number */}
      <div className="w-4 sm:w-6 text-center text-gray-500 font-black text-xs shrink-0">
        {index + 1}
      </div>

      {/* Thumbnail */}
      <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 shadow-md bg-white/5">
        {song.thumbnailUrl ? (
          <img
            src={getProxyUrl(song.thumbnailUrl)}
            alt={song.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }}
          />
        ) : (
          <div className="w-full h-full bg-white/10 flex justify-center items-center">
            <Music className="w-4 h-4 text-gray-400" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Play className="w-4 h-4 text-white fill-current" />
        </div>
      </div>

      {/* Title & Info */}
      <div className="flex-1 min-w-0 overflow-hidden px-1">
        <div className="flex items-center gap-1 min-w-0">
          <h4 className="font-black text-xs sm:text-sm text-white truncate min-w-0 drop-shadow-sm">
            {song.title}
          </h4>
          {song.isHidden && <Lock className="w-3 h-3 text-indigo-400 shrink-0" />}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 min-w-0 overflow-hidden">
          <p className="text-[11px] sm:text-xs font-bold text-gray-400 truncate shrink min-w-0 max-w-[100px] sm:max-w-[180px]">
            {song.artist}
          </p>
          {badge}
          {isReady ? (
            <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full font-bold shrink-0">
              <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> أوفلاين
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full font-bold shrink-0" title="لم يكتمل تحميل الملف الصوتي في الجهاز">
              <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> جاري التنزيل
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons: Always visible on mobile, hover on desktop */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
        {onMove && (
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove(e); }} 
            className="p-1.5 rounded-lg sm:rounded-xl bg-blue-500/15 md:bg-transparent hover:bg-blue-500/25 text-blue-400 active:scale-90 transition-all" 
            title="نقل الأغنية إلى مجلد آخر"
          >
            <FolderInput className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        )}
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleHide(e); }} 
          className="p-1.5 rounded-lg sm:rounded-xl bg-white/5 md:bg-transparent hover:bg-indigo-500/20 text-indigo-400 active:scale-90 transition-all" 
          title={song.isHidden ? "إظهار الأغنية" : "إخفاء الأغنية في المجلد السري"}
        >
          {song.isHidden ? <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        </button>
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(e); }} 
          className="p-1.5 rounded-lg sm:rounded-xl bg-rose-500/15 md:bg-transparent hover:bg-rose-500/25 text-rose-400 active:scale-90 transition-all" 
          title="حذف الأغنية"
        >
          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );
}
