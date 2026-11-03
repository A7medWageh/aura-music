import { Platform } from "react-native";

type ScrollListener = () => void;
const listeners = new Set<ScrollListener>();

export const scrollBus = {
  subscribe(fn: ScrollListener): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },

  scrollToTop(): void {
    // 1. Notify all active React Native ScrollViews (with safe Animated ref unpacking)
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn("[scrollBus] listener error:", err);
      }
    });

    // 2. On Web, scroll window, document, and every active scroll container
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (typeof document !== "undefined") {
          document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
          document.documentElement.scrollTop = 0;
          document.body.scrollTo({ top: 0, behavior: "smooth" });
          document.body.scrollTop = 0;

          // Find any container currently scrolled down and scroll it back to 0
          const scrollables = document.querySelectorAll("div, main, section, [data-scrollable='true']");
          scrollables.forEach((el: any) => {
            if (el.scrollTop && el.scrollTop > 0) {
              try {
                el.scrollTo({ top: 0, behavior: "smooth" });
              } catch {
                el.scrollTop = 0;
              }
            }
          });
        }
      } catch (err) {
        console.warn("[scrollBus Web] error scrolling to top:", err);
      }
    }
  },
};

