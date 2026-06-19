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
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="absolute top-14 left-[-10px] md:left-auto md:right-0 w-[85vw] max-w-[300px] bg-[#0a0a0b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 backdrop-blur-2xl"
          >
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">الإشعارات</h3>
              <div className="flex items-center gap-3">
                {notifs.length > 0 && (
                  <button
                    onClick={() => { localStorage.setItem("aura-notifications", "[]"); reload(); }}
                    className="text-[11px] text-red-400 hover:text-red-300 font-bold bg-red-400/10 px-2 py-1 rounded"
                  >
                    مسح الكل
                  </button>
                )}
                {notifs.some(n => !n.seenAt) && (
                  <button onClick={() => { markAllSeen(); reload(); }} className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold">
                    تم قراءة الكل
                  </button>
                )}
              </div>
            </div>

            {typeof window !== "undefined" && "Notification" in window && Notification.permission === "default" && (
              <div className="p-3 bg-indigo-500/10 border-b border-indigo-500/20 flex flex-col items-center text-center gap-2">
                <p className="text-xs text-indigo-200">قم بتفعيل الإشعارات ليصلك كل جديد فوراً</p>
                <button
                  onClick={() => Notification.requestPermission().then(() => setOpen(false))}
                  className="text-xs font-bold bg-indigo-500 text-white px-3 py-1.5 rounded-full hover:bg-indigo-600"
                >
                  تفعيل الإشعارات
                </button>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              {notifs.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm font-bold">لا توجد إشعارات</p>
                  <p className="text-xs mt-1 text-gray-600 px-4">تابع فنانك المفضل لتلقي إشعارات فور إصدار أغانيه الجديدة</p>
                </div>
              ) : (
                notifs.map(n => (
                  <Link
                    href={`/album/${n.releaseId}`}
                    key={n.id}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${!n.seenAt ? "bg-indigo-500/10" : ""}`}
                  >
                    {n.artistImage ? (
                      <img src={getProxyUrl(n.artistImage)} alt={n.artistName}
                        className="w-10 h-10 rounded-full object-cover shrink-0 shadow-md" />
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
