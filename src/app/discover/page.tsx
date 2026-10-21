"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/state/playerContext";
import { Sparkles, Music, Play, Disc3 } from "lucide-react";
import { motion } from "framer-motion";
import { getProxyUrl } from "@/utils/media";

import { getClientCached, setClientCached } from "@/utils/clientCache";
import { useCacheWarm } from "@/hooks/useCacheWarm";

export default function DiscoverPage() {
  const cachedReleases = getClientCached<any[]>("discover_new_releases");
  const [newReleases, setNewReleases] = useState<any[]>(() => cachedReleases || []);
  const [loading, setLoading] = useState(() => !cachedReleases || cachedReleases.length === 0);
  const { playNow } = usePlayer();
  useCacheWarm(newReleases, 8, 600);

  useEffect(() => {
    // Fetch YouTube New Releases data and cache in background
    fetch("/api/discovery/new-releases")
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          setNewReleases(data.data);
          setClientCached("discover_new_releases", data.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-10 pb-20">
      <header className="relative h-64 rounded-[2rem] overflow-hidden glass flex items-center px-10 shadow-[0_0_40px_rgba(0,229,255,0.15)] border border-cyan-500/20">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 via-blue-500/10 to-transparent z-0" />
        <div className="relative z-10 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.6)]">
            <Sparkles className="text-black w-7 h-7" />
          </div>
          <h1 className="text-5xl font-black text-shadow-[0_0_20px_rgba(0,229,255,0.5)]">جديد الأغاني</h1>
          <p className="text-gray-300">أحدث الإصدارات مرتبة من الأجدد لتستمع إليها فوراً</p>
        </div>
      </header>

      <section>
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Disc3 className="text-teal-400 w-6 h-6" /> أحدث الإصدارات
        </h2>
        
        <div className="flex flex-col gap-4">
          {loading ? (
            [1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="h-20 w-full animate-pulse bg-white/5 rounded-2xl" />
            ))
          ) : (
            newReleases.map((item, idx) => (
              <motion.div 
                key={item.songId || idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                whileHover={{ scale: 1.01 }}
                className="group flex flex-row items-center gap-4 p-4 glass rounded-[1.5rem] border border-transparent hover:border-cyan-400/40 hover:bg-white/10 transition-all cursor-pointer shadow-sm hover:shadow-[0_0_30px_rgba(0,229,255,0.2)] relative overflow-hidden"
                onClick={() => playNow({ 
                  songId: item.songId, 
                  title: item.title, 
                  artist: item.artist, 
                  youtubeVideoId: item.youtubeVideoId,
                  metadata: { thumbnailUrl: item.thumbnailUrl }
                })}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 shadow-[0_0_15px_rgba(0,229,255,1)] transition-opacity" />
                
                <div className="text-gray-500 font-bold w-6 text-center shrink-0">
                  {idx + 1}
                </div>
                
                <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow-md">
                  <img src={getProxyUrl(item.thumbnailUrl) || "/placeholder-song.jpg"} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="w-6 h-6 text-white fill-current ml-1" />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="font-bold text-lg truncate text-white/95 group-hover:text-white">{item.title}</h3>
                  <p className="text-sm text-gray-400 truncate">{item.artist}</p>
                </div>
                
                <div className="shrink-0 flex items-center gap-3">
                   <button className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)] group-hover:scale-110 transition-transform sm:hidden group-hover:flex">
                     <Play className="w-5 h-5 text-white fill-current ml-1" />
                   </button>
                   <span className="text-xs text-teal-400/60 font-medium px-3 py-1 bg-teal-400/10 rounded-full border border-teal-400/20 hidden sm:block">طرح جديد</span>
                </div>
                
              </motion.div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
