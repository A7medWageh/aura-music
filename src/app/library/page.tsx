"use client";

import { useEffect, useState } from "react";
import { getAllOfflineSongs, deleteOfflineSong, deleteArtist, deleteAlbum, toggleSongHidden, consolidateArtistFolders, hasCorruptedJannatTracks, repairCorruptedJannatTracks } from "@/offline/indexedDbCache";
import { subscribeDownloads } from "@/state/downloadStore";
import { usePlayer } from "@/state/playerContext";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Trash2, WifiOff, ArrowRight, DownloadCloud, Lock, Unlock, EyeOff, Eye, HardDrive, Music, CheckCircle2, AlertCircle, Image as ImageIcon, RefreshCw, Sparkles, Wrench } from "lucide-react";
import { getProxyUrl } from "@/utils/media";
import { openBackgroundCustomizer } from "@/services/theme/customBackgroundStorage";
import { getCanonicalArtistName } from "@/utils/artistNormalizer";

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
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const cacheKey = `artist_img_${artistName}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      if (cached !== "null") setImgUrl(cached);
    } else {
      fetch(`/api/artist-image?artist=${encodeURIComponent(artistName)}`)
        .then(res => res.json())
        .then(async data => {
           if (data.imageUrl) {
             try {
               const { fetchImageAsDataUrl } = await import("@/offline/indexedDbCache");
               const dataUrl = await fetchImageAsDataUrl(data.imageUrl);
               const toStore = dataUrl || data.imageUrl;
               localStorage.setItem(cacheKey, toStore);
               setImgUrl(toStore);
             } catch {
               localStorage.setItem(cacheKey, data.imageUrl);
               setImgUrl(data.imageUrl);
             }
           } else {
             localStorage.setItem(cacheKey, "null");
           }
        }).catch(() => {});
    }
  }, [artistName]);

  const finalImage = imgUrl || fallbackCover;

  if (finalImage) {
    return (
      <img
        src={getProxyUrl(finalImage)}
        alt={artistName}
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
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

export default function LibraryPage() {
  const { playNow, enqueueSongs, setQueue } = usePlayer();
  const [artists, setArtists] = useState<ArtistFolder[]>(() => cachedLibraryArtists);
  
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
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState<string | null>(null);
  const [hasJannatIssue, setHasJannatIssue] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const handleRepairJannat = async () => {
    setIsRepairing(true);
    setRepairStatus("جاري فحص وتصليح أغاني جنات...");
    try {
      const res = await repairCorruptedJannatTracks((msg) => {
        setRepairStatus(msg);
      });
      setHasJannatIssue(false);
      showToast(`تم بنجاح إصلاح ${res.purged} أغنية وتنزيل ${res.redownloaded} أصلية ✅`);
      await loadLibrary();
    } catch (e: any) {
      showToast("حدث خطأ أثناء الإصلاح: " + e.message);
    } finally {
      setIsRepairing(false);
      setRepairStatus(null);
    }
  };

  const loadLibrary = async () => {
    if (cachedLibraryArtists.length === 0) setLoading(true);
    const songs: Song[] = await getAllOfflineSongs();

    hasCorruptedJannatTracks().then((issue) => {
      setHasJannatIssue(issue);
    }).catch(() => {});
    
    // Filter hidden songs unless vault is unlocked
    const visibleSongs = songs.filter(s => vaultUnlocked ? true : !s.isHidden);
    
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
    setLoading(false);
  };

  useEffect(() => { 
    let timer: any = null;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        loadLibrary();
      }, 350);
    };

    loadLibrary(); 
    // Migrate and consolidate all artist folders in the background on the phone/device
    consolidateArtistFolders();

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
      if (timer) clearTimeout(timer);
      window.removeEventListener("aura-library-updated", scheduleReload);
      window.removeEventListener("aura-thumbnails-migrated", scheduleReload);
      unsubscribe();
    };
  }, [vaultUnlocked]);

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

      {/* Jannat Issue Detection & Self-Repair Banner */}
      {hasJannatIssue && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-indigo-500/15 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">تم رصد ملفات صوتية تحتاج إلى تصليح في أغاني جنات</h4>
              <p className="text-xs text-amber-200/80 mt-0.5">يمكنك بنقرة واحدة إزالة الملفات الخليجية وتنزيل الأغاني الأصلية عالية الدقة تلقائياً.</p>
            </div>
          </div>
          <button
            onClick={handleRepairJannat}
            disabled={isRepairing}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-black font-black text-xs shrink-0 flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRepairing ? "animate-spin" : ""}`} />
            <span>{isRepairing ? "جاري الإصلاح..." : "إصلاح فوري الآن ⚡"}</span>
          </button>
        </motion.div>
      )}

      {/* Repair Progress Modal */}
      {isRepairing && (
        <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/30 p-6 rounded-3xl w-full max-w-sm text-center space-y-4 shadow-2xl">
            <RefreshCw className="w-12 h-12 text-amber-400 animate-spin mx-auto" />
            <h3 className="text-xl font-black text-white">جاري إصلاح أغاني جنات</h3>
            <p className="text-sm text-gray-300 min-h-[44px] flex items-center justify-center leading-relaxed">
              {repairStatus || "جاري فحص الملفات واستبدالها بالأصلية..."}
            </p>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 h-full animate-pulse w-full" />
            </div>
            <p className="text-xs text-gray-400">يرجى الانتظار لحين اكتمال التحميل والتثبيت</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-white/5 rounded-2xl mb-3" />
              <div className="h-3 bg-white/5 rounded w-3/4 mb-2" />
            </div>
          ))}
        </div>
      ) : artists.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
          <div className="w-20 h-20 rounded-full glass flex items-center justify-center">
            <DownloadCloud className="w-10 h-10 text-indigo-400 opacity-60" />
          </div>
          <h2 className="text-2xl font-bold">مكتبتك فارغة</h2>
          <p className="text-gray-500 max-w-xs">اضغط على أيقونة التحميل على أي أغنية لحفظها هنا للاستماع بدون إنترنت</p>
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
              {(openArtist === "جنات" || openArtist?.toLowerCase().includes("jannat") || hasJannatIssue) && (
                <button
                  onClick={handleRepairJannat}
                  disabled={isRepairing}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-500/20 to-rose-500/20 border border-amber-500/40 text-amber-300 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:from-amber-500/30 hover:to-rose-500/30 active:scale-95 transition-all shadow-sm disabled:opacity-50"
                  title="إصلاح جميع أغاني هذا الألبوم وتنزيل النسخ الأصلية الصحيحة"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRepairing ? "animate-spin" : ""}`} />
                  <span>{isRepairing ? "جاري الإصلاح..." : "إصلاح الألبوم 🔄"}</span>
                </button>
              )}
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
                vaultUnlocked={vaultUnlocked}
              />
            ))}
          </div>
        </div>
      ) : openArtist && currentArtistData ? (
        /* Artist View (Level 2) */
        <div className="space-y-8">
           <div className="flex items-center justify-between p-4 rounded-2xl bg-black/30 backdrop-blur-xl border border-white/10 shadow-lg">
              <h2 className="text-3xl font-black">{currentArtistData.name}</h2>
              <div className="flex gap-2 items-center flex-wrap">
                {(currentArtistData.name === "جنات" || currentArtistData.name.toLowerCase().includes("jannat") || hasJannatIssue) && (
                  <button
                    onClick={handleRepairJannat}
                    disabled={isRepairing}
                    className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-black rounded-xl font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
                    title="إصلاح جميع أغاني وألبومات جنات واستبدال أي ملف خليجي بالأغنية الأصلية"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRepairing ? "animate-spin" : ""}`} />
                    <span>{isRepairing ? "جاري الإصلاح..." : "إصلاح أغاني جنات 🔄"}</span>
                  </button>
                )}
                <button onClick={() => playList([...currentArtistData.albums.flatMap(a=>a.songs), ...currentArtistData.singles])} className="px-4 py-2 bg-indigo-500 rounded-xl font-bold flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" /> تشغيل الكل
                </button>
                <button onClick={(e: any) => handleDeleteArtist(e, currentArtistData.name)} className="p-2 bg-red-500/10 text-red-400 rounded-xl">
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
                     vaultUnlocked={vaultUnlocked}
                   />
                 ))}
               </div>
             </div>
           )}
        </div>
      ) : (
        /* Artists View (Level 1) */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {artists.map((artist) => (
            <motion.div key={artist.name} whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => setOpenArtist(artist.name)}
              className="group cursor-pointer">
              <div className="relative aspect-square mb-3">
                <div className="absolute inset-0 rounded-full overflow-hidden bg-white/5 translate-x-2 translate-y-2 opacity-50 scale-95 group-hover:translate-x-4 group-hover:translate-y-4 transition-all duration-500" />
                <div className="absolute inset-0 rounded-full overflow-hidden shadow-xl border-4 border-transparent group-hover:border-indigo-400/50 transition-all duration-500">
                  <ArtistAvatar artistName={artist.name} fallbackCover={artist.cover} />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={(e: any) => { e.stopPropagation(); playList([...artist.albums.flatMap(a=>a.songs), ...artist.singles]) }} 
                      className="w-14 h-14 bg-indigo-500 rounded-full flex items-center justify-center shadow-2xl scale-0 group-hover:scale-100 transition-transform duration-300 delay-75">
                      <Play className="w-6 h-6 text-white fill-current translate-x-0.5" />
                    </button>
                  </div>
                </div>
              </div>
              <h3 className="font-black text-lg text-center truncate text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">{artist.name}</h3>
              <p className="text-xs text-gray-300 font-bold text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                {artist.albums.length} ألبومات · {artist.singles.length} منفردة
              </p>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function SongRow({ song, index, play, onDelete, onToggleHide, vaultUnlocked }: any) {
  const isReady = song.audioReady ?? false;
  return (
    <div 
      onClick={play} 
      className="group flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-2xl bg-black/30 hover:bg-black/50 backdrop-blur-md transition-all cursor-pointer border border-white/5 hover:border-indigo-500/30 shadow-sm w-full max-w-full overflow-hidden"
    >
      {/* Number */}
      <div className="w-5 sm:w-7 text-center text-gray-500 font-black text-xs sm:text-sm shrink-0">
        {index + 1}
      </div>

      {/* Thumbnail */}
      <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden shrink-0 shadow-md">
        {song.thumbnailUrl ? (
          <img
            src={getProxyUrl(song.thumbnailUrl)}
            alt={song.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }}
          />
        ) : (
          <div className="w-full h-full bg-white/10 flex justify-center items-center">
            <Music className="w-4 h-4 text-gray-400" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <Play className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-current" />
        </div>
      </div>

      {/* Title & Info */}
      <div className="flex-1 min-w-0 pr-1">
        <h4 className="font-black text-xs sm:text-sm text-white truncate flex items-center gap-1.5 drop-shadow-sm">
          {song.title}
          {song.isHidden && <Lock className="w-3 h-3 text-indigo-400 shrink-0" />}
        </h4>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <p className="text-[11px] sm:text-xs font-bold text-gray-400 truncate max-w-[130px] sm:max-w-none">
            {song.artist}
          </p>
          {isReady ? (
            <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full font-bold shrink-0">
              <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> جاهزة أوفلاين
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full font-bold shrink-0" title="لم يكتمل تحميل الملف الصوتي في الجهاز">
              <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> جاري التنزيل
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons: Always visible on mobile, hover on desktop */}
      <div className="flex items-center gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-10">
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleHide(e); }} 
          className="p-1.5 sm:p-2 rounded-xl bg-white/5 md:bg-transparent hover:bg-indigo-500/20 text-indigo-400 active:scale-90 transition-all" 
          title={song.isHidden ? "إظهار الأغنية" : "إخفاء الأغنية في المجلد السري"}
        >
          {song.isHidden ? <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        </button>
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(e); }} 
          className="p-1.5 sm:p-2 rounded-xl bg-rose-500/15 md:bg-transparent hover:bg-rose-500/25 text-rose-400 active:scale-90 transition-all" 
          title="حذف الأغنية"
        >
          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );
}
