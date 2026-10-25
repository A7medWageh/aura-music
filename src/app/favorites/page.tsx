"use client";

import { usePlayer } from "@/state/playerContext";
import { useEffect, useState } from "react";
import { Heart, Play, Music, MoreHorizontal, Wifi, WifiOff } from "lucide-react";
import { getProxyUrl } from "@/utils/media";
import { getFavoritesMeta, syncFavoriteMeta, removeFavorite, clearFavorites, FavoriteSong } from "@/services/user/favoritesStore";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteSong[]>([]);
  const [loading, setLoading] = useState(true);
  const { playNow } = usePlayer();

  useEffect(() => {
    // 1. Show local data instantly (no loading flicker)
    const local = getFavoritesMeta();
    if (local.length > 0) {
      setFavorites(local);
      setLoading(false);
    }

    // 2. Sync with server (cookie-based) to prune removed likes
    fetch("/api/likes")
      .then(res => res.json())
      .then((data) => {
        const likedIds: string[] = data.songs || [];
        // Sync removes any song no longer liked
        syncFavoriteMeta(likedIds);
        // Re-read after sync
        const synced = getFavoritesMeta();
        setFavorites(synced);
        setLoading(false);
      })
      .catch(() => {
        // Offline or error — still show local data
        setLoading(false);
      });

    // 3. Listen to real-time favorites updates without page reload
    const handleFavUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setFavorites(e.detail);
      } else {
        setFavorites(getFavoritesMeta());
      }
    };
    window.addEventListener("aura-favorites-updated", handleFavUpdated);
    return () => window.removeEventListener("aura-favorites-updated", handleFavUpdated);
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex items-end gap-8 pb-6 border-b border-white/5">
        <div className="w-52 h-52 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center shadow-2xl">
          <Heart className="w-24 h-24 text-white fill-current" />
        </div>
        <div className="flex flex-col gap-4">
          <span className="text-xs font-bold uppercase tracking-widest text-pink-400">قائمة تشغيل</span>
          <h1 className="text-6xl font-black">أغانيك المفضلة</h1>
          <div className="flex items-center gap-4">
            <p className="text-gray-400 font-medium">{favorites.length} أغنية • مخصصة لك</p>
            {favorites.length > 0 && (
              <button 
                onClick={() => { if(confirm("هل تريد إفراغ قائمة المفضلة؟")) { clearFavorites(); } }}
                className="text-[10px] text-white/20 hover:text-red-500 transition-colors uppercase tracking-widest font-bold border border-white/10 px-2 py-0.5 rounded"
              >
                إفراغ القائمة
              </button>
            )}
          </div>
        </div>
      </header>

      {favorites.length > 0 && (
        <div className="flex items-center gap-6">
          <button
            className="w-14 h-14 rounded-full bg-indigo-500 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
            onClick={() => playNow({
              songId: favorites[0].songId,
              title: favorites[0].title,
              artist: favorites[0].artist,
              youtubeVideoId: favorites[0].youtubeVideoId,
              thumbnailUrl: favorites[0].thumbnailUrl,
              metadata: { thumbnailUrl: favorites[0].thumbnailUrl }
            })}
          >
            <Play className="w-6 h-6 text-white fill-current ml-1" />
          </button>
        </div>
      )}

      <div className="space-y-1">
        {loading ? (
          [1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 w-full animate-pulse bg-white/5 rounded-xl" />
          ))
        ) : favorites.length === 0 ? (
          <div className="py-20 text-center text-gray-500">
            <Music className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-bold mb-2">مفيش أغاني في المفضلة لسه</p>
            <p className="text-sm">دوس على ❤️ على أي أغنية عشان تظهر هنا</p>
          </div>
        ) : (
          favorites.map((song, index) => (
            <div
              key={`${song.songId}-${index}`}
              className="group flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer"
              onClick={() => playNow({
                songId: song.songId,
                title: song.title,
                artist: song.artist,
                youtubeVideoId: song.youtubeVideoId,
                thumbnailUrl: song.thumbnailUrl,
                metadata: { thumbnailUrl: song.thumbnailUrl }
              })}
            >
              <span className="w-4 text-center text-sm text-gray-500 group-hover:hidden">{index + 1}</span>
              <Play className="w-4 h-4 text-white fill-current hidden group-hover:block" />
              <div className="w-10 h-10 rounded overflow-hidden shrink-0">
                <img
                  src={getProxyUrl(song.thumbnailUrl)}
                  alt={song.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }}
                />
              </div>
              <div className="flex-1 min-w-0 text-right">
                <h4 className="font-bold text-sm truncate">{song.title}</h4>
                <p className="text-xs text-gray-400 truncate">{song.artist}</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); removeFavorite(song.songId); setFavorites(prev => prev.filter(s => s.songId !== song.songId)); }}
                className="p-2 text-pink-500 hover:scale-110 transition-transform"
              >
                <Heart className="w-5 h-5 fill-current" />
              </button>
              <button className="p-2 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-white transition-opacity">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
