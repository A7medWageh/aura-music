"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, ChevronRight } from "lucide-react";

export function AndroidEdgeBackGesture() {
  const router = useRouter();

  // Gesture state
  const [isDragging, setIsDragging] = useState(false);
  const [activeEdge, setActiveEdge] = useState<"right" | "left" | null>(null);
  const [dragDist, setDragDist] = useState(0);
  const [touchY, setTouchY] = useState(300);
  const [isReadyToTrigger, setIsReadyToTrigger] = useState(false);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isGestureActiveRef = useRef(false);
  const activeEdgeRef = useRef<"right" | "left" | null>(null);
  const hasVibratedRef = useRef(false);

  const TRIGGER_THRESHOLD = 52; // Sleek, responsive threshold

  const triggerBack = useCallback(() => {
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        router.push("/");
      }
    }
  }, [router]);

  // Hide when full player is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const checkFullOpen = () => {
      setIsFullPlayerOpen(document.body.classList.contains("player-full-open"));
    };
    checkFullOpen();
    const observer = new MutationObserver(checkFullOpen);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const screenWidth = window.innerWidth;
      const EDGE_ZONE = 28; // Active edge touch strip

      let edge: "right" | "left" | null = null;
      if (touch.clientX >= screenWidth - EDGE_ZONE) {
        edge = "right";
      } else if (touch.clientX <= EDGE_ZONE) {
        edge = "left";
      }

      if (!edge) return;

      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      activeEdgeRef.current = edge;
      isGestureActiveRef.current = true;
      hasVibratedRef.current = false;

      setActiveEdge(edge);
      setTouchY(touch.clientY);
      setDragDist(0);
      setIsReadyToTrigger(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isGestureActiveRef.current || !activeEdgeRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = Math.abs(touch.clientY - startYRef.current);

      // Cancel if vertical scroll is dominant
      if (dy > 40 && Math.abs(dx) < 18) {
        isGestureActiveRef.current = false;
        setIsDragging(false);
        setActiveEdge(null);
        return;
      }

      const inwardDist = activeEdgeRef.current === "right" ? -dx : dx;

      if (inwardDist > 8) {
        setIsDragging(true);
        const clampedDist = Math.min(85, Math.max(0, inwardDist));
        setDragDist(clampedDist);
        setTouchY(touch.clientY);

        const ready = clampedDist >= TRIGGER_THRESHOLD;
        setIsReadyToTrigger(ready);

        // Haptic tick when threshold reached
        if (ready && !hasVibratedRef.current) {
          hasVibratedRef.current = true;
          try {
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              navigator.vibrate(12);
            }
          } catch {}
        } else if (!ready) {
          hasVibratedRef.current = false;
        }

        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isGestureActiveRef.current) return;
      isGestureActiveRef.current = false;

      if (isReadyToTrigger) {
        try {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate([10, 15]);
          }
        } catch {}
        triggerBack();
      }

      setIsDragging(false);
      setIsReadyToTrigger(false);
      setDragDist(0);
      setTimeout(() => setActiveEdge(null), 200);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [triggerBack, isReadyToTrigger]);

  if (isFullPlayerOpen) return null;

  const progress = Math.min(1, dragDist / TRIGGER_THRESHOLD);

  return (
    <>
      {/* ─── 1. Minimalist Chic Android 14 Predictive Back Glass Bubble ─── */}
      <AnimatePresence>
        {isDragging && activeEdge && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.15 } }}
            className={`fixed z-[9999] pointer-events-none flex items-center justify-center ${
              activeEdge === "right" ? "right-0" : "left-0"
            }`}
            style={{
              top: touchY - 24,
              transform: `translateX(${activeEdge === "right" ? -dragDist * 0.45 : dragDist * 0.45}px)`,
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200"
              style={{
                background: isReadyToTrigger
                  ? "linear-gradient(135deg, rgba(99,102,241,0.95) 0%, rgba(139,92,246,0.95) 100%)"
                  : "rgba(18,20,28,0.85)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: isReadyToTrigger
                  ? "1.5px solid rgba(255,255,255,0.7)"
                  : "1px solid rgba(255,255,255,0.18)",
                boxShadow: isReadyToTrigger
                  ? "0 0 26px rgba(99,102,241,0.7), 0 6px 20px rgba(0,0,0,0.5)"
                  : "0 6px 20px rgba(0,0,0,0.4)",
              }}
            >
              <motion.div
                animate={{
                  scale: isReadyToTrigger ? 1.2 : 0.85 + progress * 0.3,
                  x: activeEdge === "right" ? -progress * 3 : progress * 3,
                }}
                transition={{ duration: 0.18 }}
                className="text-white"
              >
                {activeEdge === "right" ? (
                  <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                ) : (
                  <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 2. Ultra-Sleek Minimalist Edge Glass Tab (Flush with right screen edge) ─── */}
      <motion.button
        onClick={triggerBack}
        title="الرجوع خطوة للخلف"
        aria-label="الرجوع للخلف"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 0.7, x: 0 }}
        whileHover={{ opacity: 1, scale: 1.05, x: -3 }}
        whileTap={{ scale: 0.92, x: -5 }}
        className="fixed z-40 right-0 top-1/2 -translate-y-1/2 h-12 w-3.5 hover:w-6 rounded-l-full flex items-center justify-center border-l border-t border-b border-white/[0.18] bg-white/[0.08] hover:bg-white/[0.18] backdrop-blur-xl shadow-lg transition-all duration-300 group cursor-pointer"
        style={{
          boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
        }}
      >
        <ChevronRight className="w-3.5 h-3.5 text-white/60 group-hover:text-white stroke-[2.5] transition-colors -mr-0.5" />
      </motion.button>
    </>
  );
}
