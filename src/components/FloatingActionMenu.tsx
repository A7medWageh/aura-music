"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  RefreshCw, 
  ChevronUp, 
  ArrowRight, 
  Square, 
  ArrowUp, 
  Library, 
  VolumeX, 
  Volume2,
  Sparkles,
  Image as ImageIcon
} from "lucide-react";
import { usePlayer } from "@/state/playerContext";
import { useToastStore } from "@/state/toastStore";
import { openBackgroundCustomizer } from "@/services/theme/customBackgroundStorage";

export function FloatingActionMenu() {
  const router = useRouter();
  const { currentSong, closePlayer, state, toggleMute } = usePlayer();
  const { addToast } = useToastStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Monitor if full-screen player is open to hide floating buttons
  useEffect(() => {
    if (typeof document === "undefined") return;
    const checkFullOpen = () => {
      setIsFullPlayerOpen(document.body.classList.contains("player-full-open"));
    };
    checkFullOpen();
    const observer = new MutationObserver(checkFullOpen);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

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

  // Handle Refresh with Service Worker and Cache Storage update
  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpinning(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          await r.update().catch(() => {});
        }
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const k of keys) {
          if (!k.includes("audio") && !k.includes("offline")) {
            await caches.delete(k).catch(() => {});
          }
        }
      }
    } catch {}
    setTimeout(() => {
      window.location.href = window.location.pathname;
    }, 350);
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
    const willMute = state.volume > 0;
    toggleMute();
    addToast(willMute ? "تم كتم الصوت 🔇" : "تم تشغيل الصوت 🔊");
  };

  if (isFullPlayerOpen) {
    return null; // Do not render floating buttons over full-screen player
  }

  const isMuted = state.volume === 0;

  return (
    <div 
      ref={menuRef}
      className={`fixed z-50 right-4 sm:right-6 flex flex-col items-end pointer-events-auto select-none transition-all duration-300 ${
        currentSong 
          ? "bottom-[calc(env(safe-area-inset-bottom,0px)+150px)] md:bottom-[92px]" 
          : "bottom-[calc(env(safe-area-inset-bottom,0px)+74px)] md:bottom-6"
      }`}
    >
      <div className="relative flex flex-col items-end">
        {/* ─── Expandable Floating Options Menu (Floats upwards without shifting buttons) ─── */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: "spring", stiffness: 450, damping: 28 }}
              className="absolute bottom-full right-0 mb-3 flex flex-col gap-1.5 p-2 rounded-2xl shadow-2xl border border-white/15 backdrop-blur-2xl bg-black/90 min-w-[175px]"
              style={{
                boxShadow: "0 16px 48px rgba(0,0,0,0.8), 0 0 28px rgba(99,102,241,0.28)",
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
                    {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                  </div>
                  <span>{isMuted ? "تشغيل الصوت" : "كتم الصوت"}</span>
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

              {/* Option 5: App-wide Background Photo */}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  openBackgroundCustomizer("global");
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-xs font-bold text-purple-300 hover:text-white hover:bg-purple-500/15 active:scale-95 transition-all text-right group"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <span>صورة خلفية للتطبيق</span>
              </button>

              {/* Option 6: Scroll to Top */}
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

        {/* ─── Fixed-Width Buttons Column (w-12, firmly anchored to right) ─── */}
        <div className="w-12 flex flex-col items-center gap-2">
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
                : "bg-black/80 hover:bg-black/95 text-indigo-300 border-white/20 backdrop-blur-xl shadow-black/70"
            }`}
          >
            <motion.div
              animate={{ rotate: menuOpen ? 180 : 0 }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
            >
              <ChevronUp className="w-4 h-4 stroke-[2.5]" />
            </motion.div>
          </motion.button>

          {/* Floating Refresh Button */}
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
              boxShadow: "0 8px 28px rgba(99,102,241,0.55), 0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            <div className="absolute inset-0 rounded-full border border-white/30 group-hover:border-white/60 transition-colors pointer-events-none" />
            <RefreshCw
              className={`w-5 h-5 text-white transition-transform duration-500 ${
                spinning ? "animate-spin" : "group-hover:rotate-45"
              }`}
            />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
