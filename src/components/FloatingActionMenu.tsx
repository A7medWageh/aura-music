"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  RefreshCw, 
  ChevronUp, 
  ChevronDown, 
  ArrowRight, 
  Square, 
  ArrowUp, 
  Library, 
  VolumeX, 
  Volume2,
  Sparkles
} from "lucide-react";
import { usePlayer } from "@/state/playerContext";
import { useToastStore } from "@/state/toastStore";

export function FloatingActionMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentSong, closePlayer, state, setVolume } = usePlayer();
  const { addToast } = useToastStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [menuOpen]);

  // Handle Refresh
  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpinning(true);
    setTimeout(() => {
      window.location.reload();
    }, 450);
  };

  // Handle Back
  const handleBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        router.push("/");
      }
    }
  };

  // Handle Close Player
  const handleClosePlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    closePlayer();
    addToast("تم قفل المشغل وإيقاف الصوت 🛑");
  };

  // Handle Scroll to Top
  const handleScrollTop = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle Mute / Unmute
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.volume > 0) {
      setVolume(0);
      addToast("تم كتم الصوت 🔇");
    } else {
      setVolume(1);
      addToast("تم تشغيل الصوت 🔊");
    }
  };

  return (
    <div 
      ref={menuRef}
      className="fixed z-50 right-4 sm:right-6 bottom-[140px] md:bottom-[105px] flex flex-col items-center gap-2.5 pointer-events-auto select-none"
    >
      {/* ─── Expandable Floating Options Menu (Upwards) ─── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 15 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="flex flex-col gap-2 p-2 rounded-2xl shadow-2xl border border-white/15 backdrop-blur-2xl bg-black/85 min-w-[170px]"
            style={{
              boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 25px rgba(99,102,241,0.25)",
            }}
          >
            {/* Header / Title */}
            <div className="px-2.5 py-1 text-[11px] font-black tracking-wider text-indigo-400 border-b border-white/10 flex items-center justify-between">
              <span>إجراءات سريعة</span>
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            </div>

            {/* Option 1: Back one step */}
            <button
              onClick={handleBack}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-bold text-gray-200 hover:text-white hover:bg-white/10 active:scale-95 transition-all text-right group"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                <ArrowRight className="w-4 h-4" />
              </div>
              <span>رجوع خطوة لورا</span>
            </button>

            {/* Option 2: Close Player (Available if player has current song) */}
            {currentSong && (
              <button
                onClick={handleClosePlayer}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-bold text-rose-300 hover:text-rose-100 hover:bg-rose-500/15 active:scale-95 transition-all text-right group"
              >
                <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center group-hover:bg-rose-500 group-hover:text-white transition-colors">
                  <Square className="w-3.5 h-3.5 fill-current" />
                </div>
                <span>قفل المشغل تماماً</span>
              </button>
            )}

            {/* Option 3: Mute / Unmute (If playing) */}
            {currentSong && (
              <button
                onClick={handleToggleMute}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-bold text-gray-200 hover:text-white hover:bg-white/10 active:scale-95 transition-all text-right group"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  {state.volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </div>
                <span>{state.volume === 0 ? "إلغاء كتم الصوت" : "كتم الصوت"}</span>
              </button>
            )}

            {/* Option 4: Library */}
            <button
              onClick={() => { setMenuOpen(false); router.push("/library"); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-bold text-gray-200 hover:text-white hover:bg-white/10 active:scale-95 transition-all text-right group"
            >
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                <Library className="w-4 h-4" />
              </div>
              <span>مكتبتي (الأوفلاين)</span>
            </button>

            {/* Option 5: Scroll to Top */}
            <button
              onClick={handleScrollTop}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-bold text-gray-200 hover:text-white hover:bg-white/10 active:scale-95 transition-all text-right group"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <ArrowUp className="w-4 h-4" />
              </div>
              <span>أعلى الصفحة</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Stack of: [Options Arrow Button] + [Floating Refresh Button] ─── */}
      <div className="flex flex-col items-center gap-2">
        {/* Arrow Button that opens the options menu */}
        <motion.button
          onClick={() => setMenuOpen((prev) => !prev)}
          title="خيارات سريعة"
          aria-label="خيارات سريعة"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg border transition-all duration-300 ${
            menuOpen 
              ? "bg-indigo-600 text-white border-indigo-400 shadow-indigo-500/40" 
              : "bg-black/75 hover:bg-black/90 text-indigo-300 border-white/20 backdrop-blur-xl shadow-black/60"
          }`}
        >
          <motion.div
            animate={{ rotate: menuOpen ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronUp className="w-4 h-4 stroke-[2.5]" />
          </motion.div>
        </motion.button>

        {/* Floating Refresh Button (On the Right, Above Player) */}
        <motion.button
          id="floating-refresh-btn"
          onClick={handleRefresh}
          title="تحديث الصفحة"
          aria-label="تحديث الصفحة"
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.92 }}
          className="relative w-12 h-12 rounded-full flex items-center justify-center shadow-2xl group overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #ec4899 100%)",
            boxShadow: "0 6px 26px rgba(99,102,241,0.5), 0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          {/* Subtle pulsating glow border */}
          <div className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/60 transition-colors pointer-events-none" />
          <RefreshCw
            className={`w-5 h-5 text-white transition-transform duration-500 ${
              spinning ? "animate-spin" : "group-hover:rotate-45"
            }`}
          />
        </motion.button>
      </div>
    </div>
  );
}
