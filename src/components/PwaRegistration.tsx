"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, RefreshCw, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Current PWA client release version
export const PWA_APP_VERSION = "v2.5.0";

// Detect if running on iOS
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Detect if already installed as PWA
function isStandalone() {
  if (typeof window === "undefined") return false;
  return (window.navigator as any).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Manually force a PWA cache update & reload.
 * CRITICAL: NEVER touches IndexedDB or user songs!
 */
export async function forceUpdatePwa(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      }
    }

    // Clear stale script/cache assets without touching IndexedDB
    if ("caches" in window) {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.includes("pages") || key.includes("chunks") || key.includes("static")) {
          await caches.delete(key);
        }
      }
    }
  } catch (err) {
    console.warn("[PWA] Force update error:", err);
  }

  // Force clean reload
  window.location.reload();
}

function isNativeApp() {
  if (typeof window === "undefined") return false;
  return !!(
    (window as any).Capacitor ||
    (window as any).webkit?.messageHandlers?.bridge ||
    (window as any).webkit?.messageHandlers?.cordova_iab ||
    /Capacitor/i.test(navigator.userAgent)
  );
}

export function PwaRegistration() {
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // In native Capacitor app on iOS, avoid running service workers or PWA banners
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  useEffect(() => {
    if (isNativeApp()) return;
    // ── Register service worker without disruptive auto-reload ──
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then((reg) => {
          // If a new worker is waiting, show update banner (do NOT auto-reload without user action)
          if (reg.waiting) {
            setShowUpdateBanner(true);
          }

          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // Prompt user politely with banner; do NOT force-reload unexpectedly
                  setShowUpdateBanner(true);
                }
              });
            }
          });
        })
        .catch((err) => console.warn("[SW] Registration failed:", err));

      // Check for updates when user returns to the app
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          navigator.serviceWorker.getRegistration().then((reg) => {
            reg?.update().catch(() => {});
          });
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);

      return () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }

    // Don't show install banner if already installed
    if (isStandalone()) return;

    // iOS: show custom install guide after 3s (if not dismissed before)
    if (isIOS()) {
      const dismissed = sessionStorage.getItem("ios_prompt_dismissed");
      if (!dismissed) {
        const timer = setTimeout(() => setShowIOSPrompt(true), 3000);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Android / Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = sessionStorage.getItem("install_banner_dismissed");
      if (!dismissed) setShowInstallBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // ── Keep SW alive while audio is playing ──
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const ping = () => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "AUDIO_PLAYING" });
      }
    };

    const onPlay = () => {
      if (!interval) {
        interval = setInterval(ping, 20000); // ping every 20 seconds
      }
    };
    const onPause = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    document.addEventListener("play", onPlay, true);
    document.addEventListener("pause", onPause, true);

    return () => {
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("pause", onPause, true);
      if (interval) clearInterval(interval);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    await forceUpdatePwa();
  };

  const dismissIOS = () => {
    sessionStorage.setItem("ios_prompt_dismissed", "1");
    setShowIOSPrompt(false);
  };

  const dismissBanner = () => {
    sessionStorage.setItem("install_banner_dismissed", "1");
    setShowInstallBanner(false);
  };

  if (isNative) {
    return null;
  }

  return (
    <>
      {/* Update Available Banner (Guarantees fresh code without touching IndexedDB) */}
      <AnimatePresence>
        {showUpdateBanner && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[120] flex items-center justify-between gap-3 px-4 py-3 shadow-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(79, 70, 229, 0.95), rgba(124, 58, 237, 0.95))",
              backdropFilter: "blur(12px)",
              paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
              borderBottom: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl animate-pulse">⚡</span>
              <div className="min-w-0">
                <p className="text-xs font-black text-white">تحديث جديد متوفر للمشغل ({PWA_APP_VERSION})</p>
                <p className="text-[11px] text-indigo-100 truncate">تحسين شاشة القفل والأوفلاين (أغانيك محفوظة 100%)</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleApplyUpdate}
                disabled={isUpdating}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-indigo-600 rounded-full text-xs font-black shadow-md active:scale-95 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? "animate-spin" : ""}`} />
                <span>{isUpdating ? "جارٍ التحديث..." : "تطبيق الآن"}</span>
              </button>
              <button
                onClick={() => setShowUpdateBanner(false)}
                className="p-1 text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Install Prompt */}
      <AnimatePresence>
        {showIOSPrompt && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25 }}
            className="fixed bottom-[135px] left-4 right-4 z-50 rounded-2xl p-4 shadow-2xl"
            style={{
              background: "rgba(18,20,26,0.97)",
              border: "1px solid rgba(99,102,241,0.3)",
              backdropFilter: "blur(20px)",
            }}
          >
            <button
              onClick={dismissIOS}
              className="absolute top-3 left-3 p-1 rounded-full text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30">
                <span className="text-2xl">🎵</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white mb-1">نزّل التطبيق على الآيفون!</p>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  اضغط على{" "}
                  <Share className="inline w-3.5 h-3.5 text-indigo-400" />
                  {" "}ثم اختر{" "}
                  <strong className="text-white">"Add to Home Screen"</strong>
                  {" "}عشان تفتح مزيكا زي أبليكيشن عادي
                </p>
                <div className="flex gap-2 items-center text-xs text-gray-500">
                  <span>📱 تشغيل في الخلفية</span>
                  <span>•</span>
                  <span>⚡ أسرع</span>
                  <span>•</span>
                  <span>🎧 أوفلاين</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Android/Chrome Install Banner */}
      <AnimatePresence>
        {showInstallBanner && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 shadow-xl"
            style={{
              background: "rgba(99,102,241,0.95)",
              backdropFilter: "blur(10px)",
              paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
            }}
          >
            <span className="text-xl">🎵</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white">ثبّت Aura على جهازك</p>
              <p className="text-xs text-indigo-200">تشغيل في الخلفية + أوفلاين</p>
            </div>
            <button
              onClick={handleInstall}
              className="px-4 py-1.5 bg-white text-indigo-600 rounded-full text-sm font-black shrink-0"
            >
              تثبيت
            </button>
            <button onClick={dismissBanner} className="text-white/70 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
