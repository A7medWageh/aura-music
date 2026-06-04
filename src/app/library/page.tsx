"use client";

import { useEffect, useState } from "react";
import { getAllOfflineSongs, deleteOfflineSong } from "@/offline/indexedDbCache";
import { usePlayer } from "@/state/playerContext";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Trash2, Wifi, WifiOff, ChevronRight, Music, DownloadCloud, ArrowRight } from "lucide-react";
import { getProxyUrl } from "@/utils/media";

type Song = {
  songId: string; title: string; artist: string; thumbnailUrl?: string;
  youtubeVideoId: string; folderName?: string; audioReady?: boolean; savedAt?: number;
};

type ArtistFolder = {
  name: string;
  songs: Song[];
  cover: string;         // use first song's thumbnail as folder cover
  audioReady: number;    // how many songs have audio downloaded
};

export default function LibraryPage() {
  const { playNow, enqueueSongs } = usePlayer();
  const [folders, setFolders] = useState<ArtistFolder[]>([]);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadLibrary = async () => {
    setLoading(true);
    const songs: Song[] = await getAllOfflineSongs();

    // Group by folder name (artist), sorted by latest saved
    const map = new Map<string, Song[]>();
    for (const song of songs.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))) {
      const key = song.folderName || song.artist || "أخرى";
      map.set(key, [...(map.get(key) || []), song]);
    }

    const result: ArtistFolder[] = [...map.entries()].map(([name, songs]) => ({
      name,
      songs,
      cover: songs[0]?.thumbnailUrl || "",
      audioReady: songs.filter(s => s.audioReady).length,
    }));

    setFolders(result);
    setLoading(false);
  };

  useEffect(() => { loadLibrary(); }, []);

  const handleDelete = async (e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    await deleteOfflineSong(songId);
    showToast("تم الحذف");
    loadLibrary();
  };

  const openArtist = folders.find(f => f.name === openFolder);

  const playFolder = (folder: ArtistFolder) => {
    if (!folder.songs.length) return;
    playNow(folder.songs[0]);
    if (folder.songs.length > 1) enqueueSongs(folder.songs.slice(1));
  };

  const totalSongs = folders.reduce((s, f) => s + f.songs.length, 0);
  const totalReady = folders.reduce((s, f) => s + f.audioReady, 0);

  return (
    <div className="space-y-8 pb-24 animate-in fade-in duration-500">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-28 right-8 z-50 px-5 py-2.5 glass rounded-full border border-indigo-500/30 flex items-center gap-2 shadow-xl text-sm font-bold">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        {openFolder ? (
          <button onClick={() => setOpenFolder(null)}
            className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors font-bold">
            <ArrowRight className="w-5 h-5" /> رجوع للمكتبة
          </button>
        ) : (
          <div>
            <h1 className="text-4xl font-black mb-1">مكتبتي 🎧</h1>
            <p className="text-gray-400 text-sm">
              {totalSongs} أغنية · {totalReady} جاهزة للتشغيل بدون نت
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-bold">أوفلاين جاهز</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-white/5 rounded-2xl mb-3" />
              <div className="h-3 bg-white/5 rounded w-3/4 mb-2" />
              <div className="h-2 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : folders.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
          <div className="w-20 h-20 rounded-full glass flex items-center justify-center">
            <DownloadCloud className="w-10 h-10 text-indigo-400 opacity-60" />
          </div>
          <h2 className="text-2xl font-bold">مكتبتك فارغة</h2>
          <p className="text-gray-500 max-w-xs">اضغط على أيقونة التحميل على أي أغنية لحفظها هنا للاستماع بدون إنترنت</p>
        </div>
      ) : !openFolder ? (
        /* Folders Grid */
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {folders.map((folder) => (
              <motion.div key={folder.name} whileHover={{ y: -5, scale: 1.02 }}
                onClick={() => setOpenFolder(folder.name)}
                className="group cursor-pointer">
                {/* Folder Cover — stacked look with neon aura */}
                <div className="relative aspect-square mb-3">
                  {/* Back cards (depth effect) */}
                  <div className="absolute inset-0 rounded-3xl overflow-hidden bg-white/5 translate-x-2 translate-y-2 opacity-50 scale-95 group-hover:translate-x-4 group-hover:translate-y-4 group-hover:-rotate-3 transition-all duration-500" />
                  <div className="absolute inset-0 rounded-3xl overflow-hidden bg-white/5 translate-x-1 translate-y-1 opacity-70 scale-97 group-hover:translate-x-2 group-hover:translate-y-2 group-hover:-rotate-1 transition-all duration-500" />
                  {/* Main cover */}
                  <div className="absolute inset-0 rounded-3xl overflow-hidden shadow-xl border border-transparent group-hover:border-cyan-400/50 group-hover:shadow-[0_0_30px_rgba(0,229,255,0.3)] transition-all duration-500">
                    {folder.cover ? (
                      <img src={getProxyUrl(folder.cover)} alt={folder.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center text-4xl">
                        🎤
                      </div>
                    )}
                    {/* Hover overlay with Play */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={e => { e.stopPropagation(); playFolder(folder); }}
                        className="w-12 h-12 rounded-full bg-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.6)] hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 text-black fill-current ml-0.5" />
                      </button>
                    </div>
                  </div>
                  {/* Offline badge */}
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-[10px] font-bold">
                    <WifiOff className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="text-emerald-400">{folder.audioReady}/{folder.songs.length}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm truncate group-hover:text-cyan-400 group-hover:text-shadow-[0_0_8px_rgba(0,229,255,0.8)] transition-all">
                      {folder.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{folder.songs.length} أغنية</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-indigo-400 transition-colors shrink-0 rotate-180" />
                </div>
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        /* Songs inside folder */
        <AnimatePresence mode="wait">
          {openArtist && (
            <motion.div key="songs-view" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {/* Artist folder header */}
              <div className="flex items-center gap-5 mb-8 p-6 glass rounded-3xl">
                <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 shadow-xl">
                  {openArtist.cover ? (
                    <img src={getProxyUrl(openArtist.cover)} alt={openArtist.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-indigo-500/20 flex items-center justify-center text-3xl">🎤</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-black">{openArtist.name}</h2>
                  <p className="text-sm text-gray-400">{openArtist.songs.length} أغنية محفوظة</p>
                  <div className="flex items-center gap-1 mt-1">
                    <WifiOff className="w-3 h-3 text-emerald-400" />
                    <span className="text-xs text-emerald-400">{openArtist.audioReady} جاهزة للأوفلاين</span>
                  </div>
                </div>
                <button onClick={() => playFolder(openArtist)}
                  className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform shrink-0">
                  <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                </button>
              </div>

              {/* Songs list */}
              <div className="space-y-1">
                {openArtist.songs.map((song, i) => (
                  <div key={`${song.songId}-${i}`}
                    className="group flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 cursor-pointer transition-all"
                    onClick={() => { playNow(song); enqueueSongs(openArtist.songs.slice(i + 1)); }}>
                    <span className="w-6 text-center text-sm text-gray-500 group-hover:hidden">{i + 1}</span>
                    <Play className="w-4 h-4 fill-current hidden group-hover:block shrink-0" />
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 relative">
                      {song.thumbnailUrl ? (
                        <img src={getProxyUrl(song.thumbnailUrl)} alt={song.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full bg-indigo-500/20 flex items-center justify-center">
                          <Music className="w-5 h-5 text-indigo-400" />
                        </div>
                      )}
                      {/* Offline indicator */}
                      <div className={`absolute bottom-0 left-0 w-2 h-2 rounded-full border border-black ${song.audioReady ? "bg-emerald-400" : "bg-yellow-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate group-hover:text-indigo-400 transition-colors">{song.title}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {song.audioReady ? "✅ جاهز أوفلاين" : "⏳ جاري التحميل"}
                      </p>
                    </div>
                    <button onClick={e => handleDelete(e, song.songId)}
                      className="p-2 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
