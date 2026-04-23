"use client";

import { Bell } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getStoredNotifications,
  markAllSeen,
  AuraNotification,
} from "@/services/notifications/artistNotifications";
import { getProxyUrl } from "@/utils/media";
import Link from "next/link";

export function NotificationBell() {
  const [notifs, setNotifs] = useState<AuraNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const reload = () => setNotifs(getStoredNotifications());
  const unseenCount = notifs.filter(n => !n.seenAt).length;

  useEffect(() => {
    reload();
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) { markAllSeen(); setTimeout(reload, 200); }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
        title="الإشعارات"
      >
        <Bell className="w-5 h-5 text-gray-300" />
        {unseenCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="absolute top-12 left-0 w-80 bg-[#0a0a0b] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-50 backdrop-blur-2xl"
          >
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-sm">الإشعارات</h3>
              {notifs.length > 0 && (
                <button
                  onClick={() => { markAllSeen(); reload(); }}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  تم قراءة الكل
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="py-10 text-center text-gray-500">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">لا توجد إشعارات</p>
                  <p className="text-xs mt-1 text-gray-600">تابع فنانك المفضل لتلقي إشعارات بإصداراته</p>
                </div>
              ) : (
                notifs.map(n => (
                  <Link
                    href={`/album/${n.releaseId}`}
                    key={n.id}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${!n.seenAt ? "bg-indigo-500/5" : ""}`}
                  >
                    {n.artistImage ? (
                      <img src={getProxyUrl(n.artistImage)} alt={n.artistName}
                        className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-lg shrink-0">🎤</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">
                        {!n.seenAt && <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1.5 align-middle" />}
                        إصدار جديد من {n.artistName}
                      </p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">🎵 {n.releaseTitle}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
