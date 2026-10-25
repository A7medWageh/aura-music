"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft } from "lucide-react";

export function AndroidEdgeBackGesture() {
  const router = useRouter();

  // Gesture state
  const [isDragging, setIsDragging] = useState(false);
  const [activeEdge, setActiveEdge] = useState<"right" | "left" | null>(null);
  const [dragDist, setDragDist] = useState(0);
  const [touchY, setTouchY] = useState(300);
  const [isReadyToTrigger, setIsReadyToTrigger] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isGestureActiveRef = useRef(false);
  const activeEdgeRef = useRef<"right" | "left" | null>(null);
  const hasVibratedRef = useRef(false);

  const TRIGGER_THRESHOLD = 60; // px of inward drag required to activate back navigation

  const triggerBack = useCallback(() => {
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        router.push("/");
      }
    }
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const screenWidth = window.innerWidth;
      const EDGE_ZONE = 32; // px from screen border

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

      // Cancel if moving predominantly vertically (user is scrolling content)
      if (dy > 45 && Math.abs(dx) < 20) {
        isGestureActiveRef.current = false;
        setIsDragging(false);
        setActiveEdge(null);
        return;
      }

      // Calculate inward distance
      const inwardDist = activeEdgeRef.current === "right" ? -dx : dx;

      if (inwardDist > 10) {
        setIsDragging(true);
        const clampedDist = Math.min(100, Math.max(0, inwardDist));
        setDragDist(clampedDist);
        setTouchY(touch.clientY);

        const ready = clampedDist >= TRIGGER_THRESHOLD;
        setIsReadyToTrigger(ready);

        // Haptic feedback when threshold reached
        if (ready && !hasVibratedRef.current) {
          hasVibratedRef.current = true;
          try {
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              navigator.vibrate(18);
            }
          } catch {}
        } else if (!ready) {
          hasVibratedRef.current = false;
        }

        // Prevent unwanted horizontal scrolling / text selection while dragging
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
            navigator.vibrate([15, 20, 15]);
          }
        } catch {}
        triggerBack();
      }

      // Smooth reset
      setIsDragging(false);
      setIsReadyToTrigger(false);
      setDragDist(0);
      setTimeout(() => setActiveEdge(null), 250);
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

  const progress = Math.min(1, dragDist / TRIGGER_THRESHOLD);

  return (
    <>
      {/* ─── 1. Android-Style Dynamic Fluid TearDrop on Touch Drag ─── */}
      <AnimatePresence>
        {isDragging && activeEdge && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.15 }}
            className={`fixed z-[9999] pointer-events-none flex items-center justify-center ${
              activeEdge === "right" ? "right-0" : "left-0"
            }`}
            style={{
              top: touchY - 32,
              transform: `translateX(${activeEdge === "right" ? -dragDist * 0.4 : dragDist * 0.4}px)`,
            }}
          >
            {/* Fluid TearDrop / Pill */}
            <div
              className={`relative flex items-center justify-center transition-all duration-150 ${
                activeEdge === "right" ? "rounded-l-full pr-1 pl-3" : "rounded-r-full pl-1 pr-3"
              }`}
              style={{
                width: `${Math.max(46, 36 + dragDist * 0.45)}px`,
                height: "64px",
                background: isReadyToTrigger
                  ? "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)"
                  : "linear-gradient(135deg, rgba(99,102,241,0.92) 0%, rgba(139,92,246,0.92) 100%)",
                boxShadow: isReadyToTrigger
                  ? "0 0 30px rgba(16,185,129,0.7), 0 4px 16px rgba(0,0,0,0.5)"
                  : "0 0 25px rgba(99,102,241,0.6), 0 4px 16px rgba(0,0,0,0.5)",
                border: isReadyToTrigger
                  ? "1.5px solid rgba(255,255,255,0.8)"
                  : "1.5px solid rgba(255,255,255,0.4)",
              }}
            >
              {/* Arrow Icon with dynamic spring and scale */}
              <motion.div
                animate={{
                  scale: isReadyToTrigger ? [1, 1.25, 1.15] : 0.8 + progress * 0.35,
                  x: activeEdge === "right" ? -progress * 4 : progress * 4,
                }}
                transition={{ duration: 0.2 }}
                className="text-white drop-shadow-md"
              >
                {activeEdge === "right" ? (
                  <ArrowRight className="w-6 h-6 stroke-[3]" />
                ) : (
                  <ArrowLeft className="w-6 h-6 stroke-[3]" />
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 2. Persistent Floating Side Edge Pill (Tap or Drag anywhere on Right Edge) ─── */}
      <motion.button
        onClick={triggerBack}
        title="الرجوع خطوة للخلف (أو اسحب الشاشة)"
        aria-label="الرجوع للخلف"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 0.85, x: 0 }}
        whileHover={{ opacity: 1, scale: 1.1, x: -4 }}
        whileTap={{ scale: 0.9, x: -8 }}
        className="fixed z-40 right-0 top-[48%] -translate-y-1/2 flex items-center justify-center py-3.5 px-1.5 rounded-l-2xl border-l border-t border-b border-white/25 bg-black/65 hover:bg-indigo-600/90 text-white backdrop-blur-xl shadow-xl transition-colors group"
        style={{
          boxShadow: "0 4px 20px rgba(0,0,0,0.5), 0 0 15px rgba(99,102,241,0.3)",
        }}
      >
        <div className="flex flex-col items-center gap-1">
          <ArrowRight className="w-4 h-4 stroke-[2.5] text-indigo-300 group-hover:text-white group-hover:translate-x-[-2px] transition-transform" />
          <div className="w-1 h-3 rounded-full bg-white/30 group-hover:bg-white/60 transition-colors" />
        </div>
      </motion.button>
    </>
  );
}
