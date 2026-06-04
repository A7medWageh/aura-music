"use client";

import { Home, Compass, Search, Library, Heart, Sparkles, Music2, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const navItems = [
  { name: "الرئيسية", icon: Home, href: "/" },
  { name: "اكتشف", icon: Compass, href: "/discover" },
  { name: "بحث", icon: Search, href: "/search" },
  { name: "مكتبتي", icon: Library, href: "/library" },
  { name: "المفضلة", icon: Heart, href: "/favorites" },
  { name: "حسابي", icon: User, href: "/profile" },
  { name: "الدي جي الذكي", icon: Sparkles, href: "/ai-dj" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex fixed top-0 bottom-[100px] right-0 w-[280px] glass-dark border-l border-white/5 flex-col z-20 overflow-hidden">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-indigo-500/10">
            <img src="/logo.png" alt="Aura Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-gradient">Aura Music</h1>
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 group ${
                  isActive ? "text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-indigo-500/10 rounded-xl border border-indigo-500/20"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <item.icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${
                  isActive ? "text-indigo-400" : "group-hover:text-indigo-400"
                }`} />
                <span className="font-medium">{item.name}</span>
                {isActive && (
                   <div className="absolute right-0 w-1 h-6 bg-indigo-500 rounded-l-full shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

    </aside>
  );
}
