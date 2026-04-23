"use client";

import { Home, Compass, Search, Library, Heart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const navItems = [
  { name: "الرئيسية", icon: Home, href: "/" },
  { name: "اكتشف", icon: Compass, href: "/discover" },
  { name: "بحث", icon: Search, href: "/search" },
  { name: "مكتبتي", icon: Library, href: "/library" },
  { name: "المفضلة", icon: Heart, href: "/favorites" },
];

/**
 * Mobile-only bottom tab bar (هيظهر بس على الشاشات الصغيرة).
 * Replaces the sidebar on mobile for a native app feel.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40">
      {/* Frosted glass bar */}
      <div
        className="flex items-center justify-around px-2 pt-2 pb-[env(safe-area-inset-bottom,8px)]"
        style={{
          background: "rgba(9,10,15,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center gap-1 px-3 py-1 min-w-0 flex-1"
            >
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-indigo-500 rounded-b-full"
                  transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
                />
              )}
              <item.icon
                className={`w-6 h-6 transition-all duration-200 ${
                  isActive
                    ? "text-indigo-400 scale-110"
                    : "text-gray-500"
                }`}
                strokeWidth={isActive ? 2.5 : 1.8}
              />
              <span
                className={`text-[10px] font-bold transition-colors duration-200 leading-tight ${
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
