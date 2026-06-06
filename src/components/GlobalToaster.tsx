"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { useToastStore } from "@/state/toastStore";

export function GlobalToaster() {
  const { toasts } = useToastStore();

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4">
      <AnimatePresence>
        {toasts.map((toast) => {
          const isHq = toast.type === "hq";
          const isError = toast.type === "error";
          const isSuccess = toast.type === "success";

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ y: -50, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -50, opacity: 0, scale: 0.9 }}
              className={`relative px-6 py-4 rounded-2xl flex items-center gap-3 backdrop-blur-2xl border shadow-2xl pointer-events-auto w-full ${
                isHq
                  ? "bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-500/50 text-yellow-300 shadow-[0_0_40px_rgba(234,179,8,0.3)]"
                  : isError
                  ? "bg-red-500/20 border-red-500/50 text-red-200 shadow-[0_0_40px_rgba(239,68,68,0.3)]"
                  : isSuccess
                  ? "bg-green-500/20 border-green-500/50 text-green-200 shadow-[0_0_40px_rgba(34,197,94,0.3)]"
                  : "bg-black/80 border-white/10 text-white"
              }`}
            >
              {/* Icon */}
              {isHq ? (
                <CheckCircle2 className="w-6 h-6 text-yellow-400 shrink-0" />
              ) : isError ? (
                <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
              ) : (
                <Info className="w-6 h-6 text-[#1db954] shrink-0" />
              )}

              {/* Message */}
              <span
                className={`font-bold text-sm md:text-base leading-snug ${
                  isHq
                    ? "text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400"
                    : ""
                }`}
              >
                {toast.msg}
              </span>

              {/* Animated Glowing Background for HQ */}
              {isHq && (
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-yellow-400/20 to-orange-500/20 blur-xl -z-10 animate-pulse" />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
