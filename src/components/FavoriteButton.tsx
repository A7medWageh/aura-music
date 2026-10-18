"use client";

import { Heart, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { upsertFavorite, removeFavorite, isFavoriteLocal } from "@/services/user/favoritesStore";

interface FavoriteButtonProps {
  songId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  youtubeVideoId: string;
  size?: number;
  className?: string;
}

export function FavoriteButton({
  songId,
  title,
  artist,
  thumbnailUrl,
  youtubeVideoId,
  size = 20,
  className = ""
}: FavoriteButtonProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setIsLiked(isFavoriteLocal(songId));
  }, [songId]);

  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isLiked;
    setIsLiked(nextState);

    if (nextState) {
      upsertFavorite({
        songId,
        title,
        artist,
        thumbnailUrl,
        youtubeVideoId: youtubeVideoId || songId
      });
      setToast(`تمت إضافة "${title}" إلى المفضلة ❤️`);
    } else {
      removeFavorite(songId);
      setToast(`تمت إزالة "${title}" من المفضلة`);
    }

    setTimeout(() => setToast(null), 2500);

    // Sync to cookie in background without blocking UI
    fetch("/api/likes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ songId })
    }).catch(() => {});
  };

  return (
    <>
      <button
        onClick={toggleLike}
        className={`relative hover:scale-110 active:scale-90 transition-all ${className}`}
        title={isLiked ? "إزالة من المفضلة" : "إضافة للمفضلة"}
      >
        <Heart
          size={size}
          className={`transition-colors duration-300 ${isLiked ? "text-pink-500 fill-current" : "text-gray-500 hover:text-white"}`}
        />
        
        {/* Particle effect on like */}
        <AnimatePresence>
          {isLiked && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-pink-500/20 rounded-full pointer-events-none"
            />
          )}
        </AnimatePresence>
      </button>

      {/* Global Toast Portal alternative (simple inline absolute for this context) */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-28 right-8 z-[100] px-5 py-2.5 glass-dark border border-indigo-500/30 rounded-full flex items-center gap-2 shadow-2xl text-xs font-bold pointer-events-none"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
