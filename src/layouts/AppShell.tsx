"use client";

import { ReactNode, useState, useEffect } from "react";
import { PlayerProvider } from "@/state/playerContext";
import { Sidebar } from "@/components/Sidebar";
import { PlayerBar } from "@/components/PlayerBar";
import { MobileTabBar } from "@/components/MobileTabBar";
import { SmartSearchBar } from "@/components/SmartSearchBar";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { AuthMenu } from "@/components/AuthMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useArtistNotifications } from "@/services/notifications/artistNotifications";
import { DownloadProgressPanel } from "@/components/DownloadProgressPanel";
import { GlobalToaster } from "@/components/GlobalToaster";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Search } from "lucide-react";

function NotificationsRunner() {
  useArtistNotifications();
  return null;
}

// ─── Floating Refresh Button ──────────────────────────────────────────
function FloatingRefreshFAB() {
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = () => {
    setSpinning(true);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  return (
    <motion.button
      id="floating-refresh-btn"
      onClick={handleRefresh}
      title="تحديث الصفحة"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 1, type: "spring", stiffness: 300 }}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.92 }}
      className="fixed z-50 right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+140px)] md:bottom-[calc(env(safe-area-inset-bottom,0px)+120px)] w-12 h-12 rounded-full flex items-center justify-center shadow-2xl"
      style={{
        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
        boxShadow: "0 4px 24px rgba(99,102,241,0.45), 0 1.5px 6px rgba(0,0,0,0.3)",
      }}
    >
      <RefreshCw
        className={`w-5 h-5 text-white transition-transform duration-500 ${spinning ? "animate-spin" : ""}`}
      />
    </motion.button>
  );
}

// ─── Mobile Search Bar (visible only on mobile) ───────────────────────
function MobileSearchBar() {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col pt-[env(safe-area-inset-top,0px)]"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <div className="flex-1">
            <SmartSearchBar />
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-white px-3 py-2 rounded-xl text-sm font-bold"
          >
            إلغاء
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <button
      id="mobile-search-btn"
      onClick={() => setOpen(true)}
      className="p-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 transition-all active:scale-95"
      aria-label="بحث"
    >
      <Search className="w-5 h-5 text-white" />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PlayerProvider>
      <div className="min-h-screen bg-[rgb(var(--surface))] text-white overflow-x-hidden">

        {/* ── Desktop Sidebar (hidden on mobile) ── */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* ── Main Content Area ── */}
        <div className={`
          md:pr-[280px]
          pb-[calc(160px+env(safe-area-inset-bottom,0px))]
          md:pb-[100px]
          min-h-screen flex flex-col
        `}>
          {/* Desktop header (hidden on mobile) */}
          <header className="hidden md:flex sticky top-0 z-20 items-center justify-between px-8 py-4 bg-[rgb(var(--surface))/80] backdrop-blur-md border-b border-white/5">
            <div className="w-1/2 max-w-xl">
              <SmartSearchBar />
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400">
                <kbd className="font-sans">Ctrl+K</kbd>
                <span>للبحث السريع</span>
              </div>
              <NotificationBell />
              <AuthMenu />
            </div>
          </header>

          {/* Mobile header — full row with logo + search + auth */}
          <header
            className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 gap-2"
            style={{
              background: "rgba(0,0,0,0.95)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
              paddingBottom: "10px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <img src="/logo-v2.png" alt="Aura" className="w-8 h-8 rounded-lg shadow-sm" />
              <span className="font-black tracking-wider text-lg bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
                AURA
              </span>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Mobile Search Button */}
              <MobileSearchBar />
              <NotificationBell />
              <AuthMenu />
            </div>
          </header>

          <main className="flex-1 p-4 md:p-8 pt-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              {children}
            </motion.div>
          </main>
        </div>

        <NotificationsRunner />

        {/* Player bar - above bottom nav on mobile */}
        <PlayerBar />

        {/* Mobile Tab Bar */}
        <MobileTabBar />

        {/* Floating Refresh Button */}
        <FloatingRefreshFAB />

        <GlobalCommandPalette />
        <DownloadProgressPanel />
        <GlobalToaster />
      </div>
    </PlayerProvider>
  );
}
