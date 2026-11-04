import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Calculates a resilient top inset that prevents content from colliding with
 * the iPhone notch, Dynamic Island, or Android status bar.
 *
 * Modern iPhones with notches or Dynamic Islands have status bars between 47px and 59px.
 * If safe area insets have not finished reporting (or in web/PWA viewports),
 * this guarantees a safe minimum clearance so headers never overlap the clock or battery icons.
 */
export function getSafeTopInset(insetsTop: number = 0): number {
  const sbHeight = Constants.statusBarHeight || 0;
  const isIos =
    Platform.OS === "ios" ||
    (Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      /iPhone|iPad|iPod/i.test(navigator.userAgent));

  if (isIos) {
    // 54px guarantees breathing room below Dynamic Island and iOS notch
    return Math.max(insetsTop, sbHeight, 54);
  }

  if (Platform.OS === "android") {
    return Math.max(insetsTop, sbHeight, 32);
  }

  // Web desktop fallback
  return Math.max(insetsTop, 16);
}

