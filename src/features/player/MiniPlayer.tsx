"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FullPlayer } from "@/features/player/FullPlayer";
import { usePlayer } from "@/state/playerContext";

export function MiniPlayer() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { currentSong, state, prev, next, togglePlay, seekTo } = usePlayer();

  return (
    <>
      <motion.div
        className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-panel/95 px-4 py-3 backdrop-blur"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4">
          <button className="text-left text-sm" onClick={() => setIsExpanded(true)} type="button">
            <p className="font-semibold">{currentSong?.title ?? "مفيش أغنية مختارة"}</p>
            <p className="text-white/60">{currentSong?.artist ?? "اختار من الترشيحات"}</p>
          </button>
          <div className="flex items-center gap-3">
            <button onClick={prev} type="button">
              السابق
            </button>
            <button
              className="rounded-full bg-accent px-4 py-2 font-semibold text-black"
              onClick={togglePlay}
              type="button"
            >
              {state.isPlaying ? "إيقاف" : "تشغيل"}
            </button>
            <button onClick={next} type="button">
              التالي
            </button>
          </div>
          <div className="text-right text-sm text-white/70">
            {state.shuffle ? "الخلط شغال" : "الخلط واقف"} • إعادة {state.repeat} • الصوت{" "}
            {Math.round(state.volume * 100)}%
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-7xl">
          <input
            className="w-full accent-green-400"
            max={state.duration || 0}
            min={0}
            onChange={(event) => seekTo(Number(event.target.value))}
            type="range"
            value={state.currentTime}
          />
        </div>
      </motion.div>
      <FullPlayer onClose={() => setIsExpanded(false)} open={isExpanded} />
    </>
  );
}
