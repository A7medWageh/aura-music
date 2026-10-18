"use client";

import { Home, Search, Library, User, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const navItems = [
  { name: "الرئيسية", icon: Home, href: "/" },
  { name: "بحث", icon: Search, href: "/search" },
  { name: "ميكس AI", icon: Sparkles, href: "/ai-dj" },
  { name: "مكتبتي", icon: Library, href: "/library" },
  { name: "حسابي", icon: User, href: "/profile" },
];

/**
 * Mobile-only bottom tab bar (هيظهر بس على الشاشات الصغيرة).
 * Replaces the sidebar on mobile for a native app feel.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40" style={{ zIndex: 40 }}>
      {/* Frosted glass bar */}
      <div
        style={{
          background: "rgba(0,0,0,0.97)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "env(safe-area-inset-bottom, 8px)",
          paddingTop: "10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className="relative flex flex-col items-center gap-1 px-2 py-1 min-w-0 flex-1 active:scale-90 transition-transform duration-75"
              style={{ minWidth: 0 }}
            >
              {isActive && (
                <div
                  className="absolute -top-[10px] left-0 right-0 mx-auto w-8 h-1 bg-indigo-500 rounded-b-full shadow-[0_0_10px_rgba(99,102,241,0.8)]"
                />
              )}
              <item.icon
                className={`w-6 h-6 transition-colors duration-150 ${
                  isActive
                    ? "text-indigo-400 scale-105"
                    : "text-gray-500 hover:text-gray-300"
                }`}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span
                className={`text-[10px] font-bold transition-colors duration-150 leading-tight ${
                  isActive ? "text-indigo-400" : "text-gray-500"
                }`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
