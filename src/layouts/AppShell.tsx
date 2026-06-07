"use client";

import { ReactNode } from "react";
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

function NotificationsRunner() {
  useArtistNotifications();
  return null;
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
          pb-[calc(180px+env(safe-area-inset-bottom,0px))]
          md:pb-[100px]
          pt-6
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

          {/* Mobile header - minimal */}
          <header className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3"
            style={{
              background: "rgba(0,0,0,0.92)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
              borderBottom: "1px solid rgba(255,255,255,0.05)"
            }}
          >
            <div className="flex items-center gap-2">
              <img src="/logo-v2.png" alt="Aura" className="w-8 h-8 rounded-lg shadow-sm" />
              <span className="font-black tracking-wider text-xl bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">AURA</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell />
              <AuthMenu />
            </div>
          </header>

          <main className="flex-1 p-4 md:p-8">
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

        <GlobalCommandPalette />
        <DownloadProgressPanel />
        <GlobalToaster />
      </div>
    </PlayerProvider>
  );
}
