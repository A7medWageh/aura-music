import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
}

export function PremiumModal({ isOpen, onClose, featureName }: PremiumModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-900 to-black border border-white/10 shadow-2xl pointer-events-auto"
            >
              {/* Premium Glow Effect */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-r from-amber-500/0 via-amber-500/30 to-amber-500/0 blur-2xl" />

              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="p-6 pt-8 text-center relative z-10">
                {/* Icon */}
                <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.4)] mb-6">
                  <Crown className="w-8 h-8 text-white drop-shadow-md" />
                </div>

                {/* Content */}
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-2">
                  اكتشف قوة البريميوم
                </h2>
                <p className="text-zinc-400 mb-6 text-sm leading-relaxed">
                  ميزة <span className="text-amber-400 font-semibold">{featureName}</span> متاحة فقط لمشتركي باقة Aura Premium. قم بترقية حسابك الآن للاستمتاع بتجربة موسيقية لا مثيل لها.
                </p>

                {/* Features List */}
                <div className="space-y-3 mb-8 text-right">
                  <div className="flex items-center gap-3 text-zinc-300 bg-white/5 p-3 rounded-lg border border-white/5">
                    <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0" />
                    <span className="text-sm">جودة صوت استوديو خرافية (HQ Audio)</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-300 bg-white/5 p-3 rounded-lg border border-white/5">
                    <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0" />
                    <span className="text-sm">تحميل الأغاني والاستماع بدون إنترنت</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-300 bg-white/5 p-3 rounded-lg border border-white/5">
                    <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0" />
                    <span className="text-sm">الوصول الكامل للـ AI DJ الذكي</span>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  onClick={onClose}
                  className="w-full relative group overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 font-semibold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-150%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(150%)]">
                    <div className="relative h-full w-8 bg-white/20" />
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    <span>حسناً، فهمت</span>
                  </div>
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
