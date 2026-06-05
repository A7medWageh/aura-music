"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { usePlayer } from "@/state/playerContext";
import { Play, Heart, Clock, Music, User, Disc, DownloadCloud, CheckCircle2, Crown } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getProxyUrl } from "@/utils/media";
import { downloadSong } from "@/services/offline/downloader";
import { sanitizeTitle } from "@apis/youtubei.js";
import { PremiumModal } from "@/components/PremiumModal";

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams?.get("q") || "";
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { playNow } = usePlayer();
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleDownload = async (e: React.MouseEvent, song: any) => {
    e.stopPropagation();
    if (!isPremium) {
      setPremiumFeatureName("تحميل الأغاني بدون إنترنت");
      setShowPremiumModal(true);
      return;
    }
    showToast(`جاري تحميل "${song.title}" للأوفلاين...`);
    const success = await downloadSong(song.songId, song.youtubeVideoId, {
      title: song.title,
      artist: song.artist,
      thumbnailUrl: song.thumbnailUrl
    });
    showToast(success ? "تم الحفظ للأوفلاين ✅" : "فشل التحميل ❌");
  };

  const toggleLike = async (e: React.MouseEvent, songId: string, title: string) => {
    e.stopPropagation();
    const res = await fetch("/api/likes", {
      method: "POST",
      body: JSON.stringify({ songId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.liked ? `تمت إضافة "${title}" للمفضلة ❤️` : "تمت الإزالة من المفضلة");
    }
  };

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then(res => res.json())
      .then(data => {
        setResults(data.data);
      })
      .finally(() => setLoading(false));

    setIsPremium(localStorage.getItem("aura_user_tier") === "premium");
  }, [q]);

  if (!q) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400">
        <Music className="w-16 h-16 mb-4 opacity-20" />
        <p>ابدأ البحث عن أغانيك المفضلة</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-6 py-3 glass rounded-full border border-indigo-500/30 flex items-center gap-3 shadow-2xl"
          >
            <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-bold">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <PremiumModal 
        isOpen={showPremiumModal} 
        onClose={() => setShowPremiumModal(false)} 
        featureName={premiumFeatureName} 
      />

      <header>
        <h1 className="text-3xl font-extrabold mb-2 text-indigo-100">نتائج البحث عن "{q}"</h1>
        <p className="text-gray-400">بيانات حقيقية 100% من قاعدة بيانات أورا</p>
      </header>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 w-full animate-pulse bg-white/5 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-12">
          {/* Artists Section */}
          {results?.artists?.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <User className="text-indigo-400 w-5 h-5" /> فنانين مشابهين
              </h2>
              <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide">
                {results.artists.map((artist: any) => (
                  <Link href={`/artist/${artist.artistId}`} key={artist.artistId} className="flex-shrink-0 w-32 group cursor-pointer text-center block">
                    <div className="aspect-square rounded-full overflow-hidden mb-3 glass border-2 border-transparent group-hover:border-indigo-500 transition-all">
                      <img src={getProxyUrl(artist.thumbnailUrl)} className="w-full h-full object-cover" alt={artist.artistName} />
                    </div>
                    <p className="text-sm font-bold truncate">{artist.artistName}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Songs Section - High Priority */}
          <section>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Music className="text-indigo-400 w-5 h-5" /> أهم الأغاني
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {results?.songs?.map((song: any, index: number) => (
                <div 
                  key={`${song.songId}-${index}`}
                  className="group flex items-center gap-4 p-2 glass rounded-xl hover:bg-white/10 transition-all cursor-pointer relative"
                  onClick={() => playNow(song)}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    <img src={getProxyUrl(song.thumbnailUrl)} alt={song.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm truncate">{song.title}</h4>
                    <p className="text-xs text-gray-400 truncate">{song.artist}</p>
                  </div>
                  <div className="flex items-center gap-3 px-2">
                    <button 
                      onClick={(e) => toggleLike(e, song.songId, song.title)}
                      className="text-gray-500 hover:text-red-500 transition-colors p-2"
                    >
                      <Heart className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={(e) => handleDownload(e, song)}
                      className="relative text-gray-500 hover:text-indigo-400 transition-colors p-2"
                    >
                      {!isPremium && <Crown className="absolute -top-1 -right-1 w-3 h-3 text-amber-500 drop-shadow-md" />}
                      <DownloadCloud className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="text-white fill-current w-4 h-4 ml-0.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Albums Section */}
          {results?.albums?.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Disc className="text-indigo-400 w-5 h-5" /> ألبومات ذات صلة
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {results.albums.map((album: any) => (
                  <Link href={`/album/${album.albumId}`} key={album.albumId} className="group cursor-pointer block">
                    <div className="aspect-square rounded-xl overflow-hidden glass mb-3 relative">
                      <img src={getProxyUrl(album.thumbnailUrl)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={album.albumTitle} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="text-white fill-current w-10 h-10" />
                      </div>
                    </div>
                    <p className="text-sm font-bold truncate">{album.albumTitle}</p>
                    <p className="text-xs text-gray-500 truncate">{album.artistName}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {(!loading && results?.songs?.length === 0) && (
            <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
               <Music className="w-12 h-12 text-gray-600 mx-auto mb-4" />
               <p className="text-gray-400">مفيش نتائج للبحث ده، جرب كلمات تانية</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">بيحمل...</div>}>
      <SearchContent />
    </Suspense>
  );
}
