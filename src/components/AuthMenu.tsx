"use client";

import { FormEvent, useEffect, useState } from "react";
import { getCsrfToken } from "@/services/security/clientCsrf";
import Link from "next/link";
import { UserCircle2, LogIn, UserPlus, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type AuthUser = { id: string; email: string; displayName: string };

export function AuthMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const refreshMe = async (force = false) => {
    if (!force && typeof window !== "undefined" && !localStorage.getItem("aura_logged_in")) return;
    try {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        setUser(null);
        if (typeof window !== "undefined") localStorage.removeItem("aura_logged_in");
        return;
      }
      const payload = (await response.json()) as { data?: { user?: AuthUser } };
      setUser(payload.data?.user ?? null);
      if (payload.data?.user && typeof window !== "undefined") localStorage.setItem("aura_logged_in", "true");
    } catch (err) {
      setUser(null);
    }
  };

  useEffect(() => {
    void refreshMe();
  }, []);

  const logout = async () => {
    const csrfToken = await getCsrfToken();
    await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } });
    setUser(null);
    if (typeof window !== "undefined") localStorage.removeItem("aura_logged_in");
    setIsOpen(false);
  };

  if (user) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 flex items-center justify-center text-black font-black text-xs uppercase shadow-[0_0_10px_rgba(0,229,255,0.3)]">
            {user.displayName.substring(0, 2)}
          </div>
          <span className="text-sm font-bold text-white pl-2">{user.displayName.split(" ")[0]}</span>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute left-0 top-full mt-2 w-48 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 text-right"
            >
              <div className="px-4 py-3 border-b border-white/5 bg-white/5">
                <p className="text-sm font-bold text-white truncate">{user.displayName}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
              <div className="p-2">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex-row-reverse"
                >
                  <LogOut className="w-4 h-4" />
                  تسجيل الخروج
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/login" className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm font-bold text-white transition-colors border border-white/10">
        <LogIn className="w-4 h-4 text-gray-400" />
        تسجيل الدخول
      </Link>
      <Link href="/signup" className="flex items-center gap-2 px-5 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-sm font-black text-black transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] hover:shadow-[0_0_25px_rgba(0,229,255,0.5)]">
        <UserPlus className="w-4 h-4" />
        حساب جديد
      </Link>
    </div>
  );
}
