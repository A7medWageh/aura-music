"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/state/playerContext";
import { Sparkles, Music, Play, Disc3 } from "lucide-react";
import { motion } from "framer-motion";
import { getProxyUrl } from "@/utils/media";

export default function DiscoverPage() {
  const [newReleases, setNewReleases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { playNow } = usePlayer();

  useEffect(() => {
    // Fetch true YouTube New Releases data
    fetch("/api/discovery/new-releases")
      .then(res => res.json())
      .then(data => {
        setNewReleases(data.data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <header className="relative h-64 rounded-3xl overflow-hidden glass flex items-center px-10">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-teal-400/20 z-0" />
        <div className="relative z-10 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg">
            <Sparkles className="text-white w-6 h-6" />
          </div>
          <h1 className="text-5xl font-black">جديد الأغاني</h1>
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
                className="group flex flex-row items-center gap-4 p-4 glass rounded-2xl border border-white/5 hover:bg-white/10 transition-all cursor-pointer shadow-sm relative overflow-hidden"
                onClick={() => playNow({ 
                  songId: item.songId, 
                  title: item.title, 
                  artist: item.artist, 
                  youtubeVideoId: item.youtubeVideoId,
                  metadata: { thumbnailUrl: item.thumbnailUrl }
                })}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                
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
