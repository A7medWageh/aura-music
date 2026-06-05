"use client";

import { usePlayer } from "@/state/playerContext";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Play, Loader2, Music4, Lock } from "lucide-react";

const moods = [
  { id: "روقان", label: "روقان وقهوة", color: "from-amber-400 to-orange-500", shadow: "shadow-orange-500/30" },
  { id: "شعبي", label: "شعبي ومهرجانات", color: "from-rose-500 to-red-600", shadow: "shadow-red-500/30" },
  { id: "حزين", label: "دراما وحزين", color: "from-slate-600 to-black", shadow: "shadow-slate-500/30" },
  { id: "چيم", label: "طاقة للچيم", color: "from-cyan-400 to-blue-600", shadow: "shadow-blue-500/30" },
  { id: "سفر", label: "أغاني سفر وطريق", color: "from-teal-400 to-emerald-600", shadow: "shadow-emerald-500/30" },
];

export default function SmartDJPage() {
  const { setQueue, playNow } = usePlayer();
  const [loadingMood, setLoadingMood] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState<boolean>(true);

  if (typeof window !== "undefined" && !isPremium) {
     // initial render check bypass
  }

  useState(() => {
    if (typeof window !== "undefined") {
      setIsPremium(localStorage.getItem("aura_user_tier") === "premium");
    }
  });

  const startMix = async (moodId: string) => {
    if (!isPremium) {
      alert("الدي جي الذكي متوفر فقط لمشتركي بريميوم 👑");
      return;
    }
    setLoadingMood(moodId);
    try {
      const res = await fetch(`/api/dj?mood=${encodeURIComponent(moodId)}`);
      const { success, data } = await res.json();
      
      if (success && data && data.length > 0) {
        // Start playing the first track, set the rest as queue
        playNow(data[0]);
        // Set queue drops the first one automatically or we just pass the full data as queue in our playerContext logic 
        // wait, setQueue expects the exact queue array
        setQueue(data.slice(1));
      } else {
        alert("لم يتم العثور على تشكيلة مناسبة دي الوقتي، جرب بعدين.");
      }
    } catch (e) {
      console.error(e);
      alert("حدث خطأ في جلب المسارات!");
    } finally {
      setLoadingMood(null);
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      <header className="flex flex-col items-center justify-center pt-10 pb-6">
        <div className="w-20 h-20 bg-indigo-500/20 backdrop-blur-md rounded-full flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(99,102,241,0.3)] animate-pulse">
          <Sparkles className="w-10 h-10 text-indigo-400" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black mb-3">الدي جي الذكي 🎛️</h1>
        <p className="text-gray-400 max-w-lg text-center leading-relaxed">
          اختار المزاج اللي انت حاسه دلوقتي، وهنعملك Playlist ملهاش نهاية بتشتغل من مكتبة أورا مباشر على حسب حالتك.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4 md:px-10">
        {moods.map((mood) => (
          <motion.div
            key={mood.id}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              if (!loadingMood) startMix(mood.id);
            }}
            className={`cursor-pointer overflow-hidden rounded-3xl h-48 relative p-6 flex flex-col justify-end bg-gradient-to-br ${mood.color} shadow-lg ${mood.shadow} group ${!isPremium && 'opacity-60 grayscale'}`}
          >
            {!isPremium && (
              <div className="absolute inset-0 bg-black/50 z-30 flex flex-col items-center justify-center">
                 <Lock className="w-10 h-10 text-yellow-400 mb-2" />
                 <p className="text-yellow-400 font-bold text-sm">حصري للبريميوم</p>
              </div>
            )}
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors z-10" />
            <Music4 className="absolute top-4 right-4 w-16 h-16 text-white/10 group-hover:-rotate-12 transition-transform duration-500" />
            
            <div className="relative z-20 flex justify-between items-end">
              <h3 className="text-2xl font-bold text-white drop-shadow-md">{mood.label}</h3>
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex flex-col items-center justify-center shadow-lg group-hover:bg-white/40 transition-colors">
                {loadingMood === mood.id ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Play className="w-6 h-6 text-white fill-current ml-1" />
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
