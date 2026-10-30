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
  const isAutoFit = activeConfig.fitMode !== "cover";

  return (
    <div 
      ref={layerRef}
      className="fixed inset-0 pointer-events-none -z-10 overflow-hidden select-none"
      aria-hidden="true"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeConfig.dataUrl.slice(0, 80) + (activeScope || "") + (activeConfig.fitMode || "auto")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-0 w-full h-full"
        >
          {isAutoFit ? (
            /* ── Auto-Fit Safe Viewport Mode (Measured to Mobile Screen minus Navbar & Bottom Player) ── */
            <>
              {/* 1. Ambient Blurred Backdrop to smoothly fill edge-to-edge with matching natural colors */}
              <div
                className="absolute inset-0 w-full h-full opacity-45 overflow-hidden"
                style={{
                  transform: `translate3d(0, ${-parallaxY * 0.5}px, 0) scale(1.1)`,
                  filter: "blur(20px) saturate(1.3) brightness(0.7)",
                  WebkitFilter: "blur(20px) saturate(1.3) brightness(0.7)",
                }}
              >
                <img
                  src={activeConfig.dataUrl}
                  alt=""
                  className="w-full h-full object-cover object-center"
                />
              </div>

              {/* 2. Full High-Definition Focal Image (Fitted to Safe Viewport without any stretching or cropping) */}
              <div
                className={`absolute inset-x-0 transition-transform duration-75 ease-out ${
                  activeConfig.hasDepth ? "aura-depth-motion" : ""
                }`}
                style={{
                  /* Clear top navbar and bottom player/tabs cleanly */
                  top: "calc(56px + env(safe-area-inset-top, 0px))",
                  bottom: "calc(146px + env(safe-area-inset-bottom, 0px))",
                  right: "var(--desktop-sidebar-space, 0px)",
                  transform: `translate3d(0, ${-parallaxY}px, 0)`,
                  transformOrigin: "center center",
                  willChange: "transform",
                }}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    src={activeConfig.dataUrl}
                    alt=""
                    className="max-w-full max-h-full object-contain object-center drop-shadow-2xl transition-all"
                    style={{
                      filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
                      imageRendering: "-webkit-optimize-contrast",
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            /* ── Edge-to-Edge Cover Mode ── */
            <div
              className={`absolute inset-0 w-full h-full transition-transform duration-75 ease-out ${
                activeConfig.hasDepth ? "aura-depth-motion" : ""
              }`}
              style={{
                transform: `translate3d(0, ${-parallaxY}px, 0) scale(1.06)`,
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
                  imageRendering: "-webkit-optimize-contrast",
                }}
              />
            </div>
          )}

          {/* Cinematic Vignette & Color Harmony Scrim Overlay for Crystal-Clear Text Legibility */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse at center, rgba(0,0,0,${overlayOpacity * 0.4}) 0%, rgba(0,0,0,${Math.min(0.92, overlayOpacity * 1.25)}) 100%),
                linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,${overlayOpacity * 0.25}) 30%, rgba(0,0,0,${overlayOpacity * 0.55}) 70%, rgba(0,0,0,0.92) 100%)
              `,
              backdropFilter: blurPx > 0 ? `blur(${Math.min(blurPx, 8)}px)` : undefined,
              WebkitBackdropFilter: blurPx > 0 ? `blur(${Math.min(blurPx, 8)}px)` : undefined,
            }}
          />

          {/* Subtle Ambient Glow Accent */}
          <div 
            className="absolute inset-0 opacity-15 mix-blend-screen pointer-events-none"
            style={{
              background: "radial-gradient(circle at 50% 20%, rgba(99,102,241,0.25) 0%, transparent 60%)"
            }}
          />
        </motion.div>
      </AnimatePresence>

      <style jsx global>{`
        @media (min-width: 768px) {
          :root {
            --desktop-sidebar-space: 280px;
          }
        }
        @keyframes auraDepthAmbient {
          0%, 100% {
            transform: scale(1.02) translate3d(0, 0, 0);
          }
          50% {
            transform: scale(1.04) translate3d(0, -6px, 0);
          }
        }
        .aura-depth-motion {
          animation: auraDepthAmbient 18s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
