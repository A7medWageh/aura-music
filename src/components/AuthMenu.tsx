"use client";

import { FormEvent, useEffect, useState } from "react";
import { getCsrfToken } from "@/services/security/clientCsrf";
import Link from "next/link";
import { UserCircle2, LogIn, UserPlus, LogOut, ShieldAlert, BadgeCheck, Sparkles, Crown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type AuthUser = { id: string; email: string; displayName: string; tier?: string };

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
      if (payload.data?.user && typeof window !== "undefined") {
        localStorage.setItem("aura_logged_in", "true");
        localStorage.setItem("aura_user_tier", payload.data.user.tier || "free");
      }
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
    if (typeof window !== "undefined") {
      localStorage.removeItem("aura_logged_in");
      localStorage.removeItem("aura_user_tier");
    }
    setIsOpen(false);
  };

  if (user) {
    const isPremium = user.tier === "premium";
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 pl-2 pr-1 py-1 rounded-full bg-white/5 border transition-colors ${isPremium ? 'border-yellow-500/50 hover:bg-yellow-500/10' : 'border-white/10 hover:bg-white/10'}`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-black font-black text-xs uppercase shadow-lg ${isPremium ? 'bg-gradient-to-tr from-yellow-400 to-orange-500 shadow-yellow-500/40' : 'bg-gradient-to-tr from-cyan-400 to-blue-500 shadow-[0_0_10px_rgba(0,229,255,0.3)]'}`}>
            {user.displayName.substring(0, 2)}
          </div>
          <div className="flex items-center gap-1 pl-2">
             <span className={`text-sm font-bold ${isPremium ? 'text-yellow-400' : 'text-white'}`}>{user.displayName.split(" ")[0]}</span>
             {isPremium && <span title="Premium Member" className="text-yellow-400 text-xs">👑</span>}
          </div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute left-0 top-full mt-2 w-48 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 text-right"
            >
              <div className={`px-4 py-3 border-b ${isPremium ? 'border-yellow-500/20 bg-yellow-500/10' : 'border-white/5 bg-white/5'}`}>
                <p className="text-sm font-bold text-white truncate flex items-center justify-end gap-1">
                  {isPremium && <BadgeCheck className="text-blue-400 w-4 h-4 mr-1 drop-shadow-md" />}
                  {isPremium && <Sparkles className="text-yellow-400 w-4 h-4" />}
                  {user.displayName}
                </p>
                <p className="text-xs text-gray-400 truncate mt-1">{user.email}</p>
                {isPremium ? (
                  <div className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-400 text-[11px] font-black rounded-lg border border-yellow-500/40 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
                     <Crown className="w-3 h-3" /> AURA PREMIUM
                  </div>
                ) : (
                  <div className="mt-2 inline-block px-2 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] font-black rounded-md border border-gray-500/30">FREE TIER</div>
                )}
              </div>
              <div className="p-2">
                {user.email === "emil578jvcvn@gmail.com" && (
                  <Link
                    href="/admin/users"
                    onClick={() => setIsOpen(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors flex-row-reverse"
                  >
                    <ShieldAlert className="w-4 h-4 text-yellow-500" />
                    لوحة الإدارة
                  </Link>
                )}
                <Link
                  href="/profile"
                  onClick={() => setIsOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors flex-row-reverse"
                >
                  <UserCircle2 className="w-4 h-4" />
                  حسابي
                </Link>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex-row-reverse mt-1"
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
    <div className="flex items-center gap-2 sm:gap-3">
      <Link href="/login" className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm font-bold text-white transition-colors border border-white/10">
        <LogIn className="w-4 h-4 text-gray-400" />
        تسجيل الدخول
      </Link>
      <Link href="/signup" className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-1.5 sm:py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-xs sm:text-sm font-black text-black transition-all shadow-[0_0_15px_rgba(0,229,255,0.3)] hover:shadow-[0_0_25px_rgba(0,229,255,0.5)]">
        <UserPlus className="w-4 h-4 sm:w-4 sm:h-4" />
        <span className="hidden sm:inline">حساب جديد</span>
        <span className="sm:hidden">تسجيل</span>
      </Link>
    </div>
  );
}
