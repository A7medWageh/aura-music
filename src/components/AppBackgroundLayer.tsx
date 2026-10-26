"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { 
  getCustomBackground, 
  CustomBackgroundConfig, 
  BackgroundScope 
} from "@/services/theme/customBackgroundStorage";
import { motion, AnimatePresence } from "framer-motion";

export function AppBackgroundLayer() {
  const pathname = usePathname();
  const [activeConfig, setActiveConfig] = useState<CustomBackgroundConfig | null>(null);
  const [activeScope, setActiveScope] = useState<BackgroundScope | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const layerRef = useRef<HTMLDivElement>(null);

  const isLibrary = pathname?.startsWith("/library");

  // Load appropriate background configuration based on current route
  const syncBackground = async () => {
    try {
      if (isLibrary) {
        // Priority to library background, fallback to global background
        const libBg = await getCustomBackground("library");
        if (libBg?.dataUrl) {
          setActiveConfig(libBg);
          setActiveScope("library");
          return;
        }
      }

      // Check global background
      const globalBg = await getCustomBackground("global");
      if (globalBg?.dataUrl) {
        setActiveConfig(globalBg);
        setActiveScope("global");
        return;
      }

      // No custom background active
      setActiveConfig(null);
      setActiveScope(null);
    } catch {
      setActiveConfig(null);
    }
  };

  useEffect(() => {
    syncBackground();

    const handleUpdate = () => {
      syncBackground();
    };

    window.addEventListener("aura-background-updated", handleUpdate);
    return () => {
      window.removeEventListener("aura-background-updated", handleUpdate);
    };
  }, [pathname, isLibrary]);

  // Subtle 3D Parallax Depth Scroll tracking
  useEffect(() => {
    if (!activeConfig?.hasDepth) {
      setScrollOffset(0);
      return;
    }

    let rafId: number;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const top = window.scrollY || document.documentElement.scrollTop || 0;
        setScrollOffset(top);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [activeConfig?.hasDepth]);

  if (!activeConfig?.dataUrl) {
    return null;
  }

  // Calculate parallax translation
  const parallaxY = activeConfig.hasDepth ? Math.min(120, scrollOffset * 0.12) : 0;
  const overlayOpacity = typeof activeConfig.opacity === "number" ? activeConfig.opacity : 0.55;
  const blurPx = typeof activeConfig.blur === "number" ? activeConfig.blur : 0;

  return (
    <div 
      ref={layerRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
      aria-hidden="true"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeConfig.dataUrl.slice(0, 80) + (activeScope || "")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-0 w-full h-full"
        >
          {/* Background Image Container with Parallax & Subtle Depth Scale */}
          <div
            className={`absolute inset-0 w-full h-full transition-transform duration-75 ease-out ${
              activeConfig.hasDepth ? "aura-depth-motion" : ""
            }`}
            style={{
              transform: `translate3d(0, ${-parallaxY}px, 0) scale(1.08)`,
              transformOrigin: "center center",
              willChange: "transform",
            }}
          >
            <img
              src={activeConfig.dataUrl}
              alt=""
              className="w-full h-full object-cover object-center"
              style={{
                filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
                transform: blurPx > 0 ? "scale(1.05)" : undefined, // prevent blurred edges
              }}
            />
          </div>

          {/* Cinematic Vignette & Color Harmony Scrim Overlay */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse at center, rgba(0,0,0,${overlayOpacity * 0.55}) 0%, rgba(0,0,0,${Math.min(0.96, overlayOpacity * 1.3)}) 100%),
                linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,${overlayOpacity * 0.4}) 35%, rgba(0,0,0,${overlayOpacity * 0.7}) 75%, rgba(0,0,0,0.95) 100%)
              `,
              backdropFilter: blurPx > 0 ? `blur(${Math.min(blurPx, 8)}px)` : undefined,
              WebkitBackdropFilter: blurPx > 0 ? `blur(${Math.min(blurPx, 8)}px)` : undefined,
            }}
          />

          {/* Subtle Ambient Glow Accent */}
          <div 
            className="absolute inset-0 opacity-20 mix-blend-screen pointer-events-none"
            style={{
              background: "radial-gradient(circle at 50% 20%, rgba(99,102,241,0.3) 0%, transparent 60%)"
            }}
          />
        </motion.div>
      </AnimatePresence>

      <style jsx global>{`
        @keyframes auraDepthAmbient {
          0%, 100% {
            transform: scale(1.08) translate3d(0, 0, 0);
          }
          50% {
            transform: scale(1.11) translate3d(0, -6px, 0);
          }
        }
        .aura-depth-motion {
          animation: auraDepthAmbient 18s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
