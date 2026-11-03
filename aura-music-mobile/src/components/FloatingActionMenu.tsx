import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronUp,
  RefreshCw,
  ArrowRight,
  ArrowUp,
  Square,
  Volume2,
  VolumeX,
  Library,
  Home,
  Sparkles,
  DownloadCloud,
} from "lucide-react-native";
import { Color, Gradient, Radius, Space } from "@/theme";
import { AuraText, AuraTouch } from "@/ui";
import { usePlayerStore } from "@/store/usePlayerStore";
import { scrollBus } from "@/utils/scrollBus";
import { useHomeStore } from "@/store/useHomeStore";
import { useLibraryStore } from "@/store/useLibraryStore";
import { useDownloadStore } from "@/store/useDownloadStore";
import { NAV_ROW_HEIGHT } from "./MobileTabBar";

export const FloatingActionMenu: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const currentSong = usePlayerStore((s) => s.currentSong);
  const isFullPlayerVisible = usePlayerStore((s) => s.isFullPlayerVisible);
  const closePlayer = usePlayerStore((s) => s.closePlayer);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const [menuOpen, setMenuOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const lastVolumeRef = useRef(1.0);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const menuAnim = useRef(new Animated.Value(0)).current;

  // Don't show floating menu over full screen modal
  if (isFullPlayerVisible) {
    return null;
  }

  const toggleMenu = () => {
    const nextState = !menuOpen;
    Animated.spring(menuAnim, {
      toValue: nextState ? 1 : 0,
      friction: 8,
      tension: 65,
      useNativeDriver: true,
    }).start();
    setMenuOpen(nextState);
  };

  const closeMenuSmooth = () => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setMenuOpen(false));
  };

  const handleRefresh = async () => {
    setSpinning(true);
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 1,
      duration: 750,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => setSpinning(false));

    try {
      await Promise.all([
        useHomeStore.getState().refresh(),
        useLibraryStore.getState().loadLibrary(),
      ]);
    } catch {}

    if (Platform.OS === "web" && typeof window !== "undefined") {
      setTimeout(() => {
        window.location.reload();
      }, 450);
    }
  };

  const handleBack = () => {
    closeMenuSmooth();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.push("/(tabs)");
    }
  };

  const handleScrollTop = () => {
    closeMenuSmooth();
    scrollBus.scrollToTop();
  };

  const handleToggleMute = () => {
    if (volume > 0) {
      lastVolumeRef.current = volume;
      setVolume(0);
    } else {
      setVolume(lastVolumeRef.current > 0 ? lastVolumeRef.current : 1.0);
    }
  };

  const handleClosePlayer = () => {
    closeMenuSmooth();
    closePlayer();
  };

  const handleGoLibrary = () => {
    closeMenuSmooth();
    router.push("/(tabs)/library");
  };

  const handleGoHome = () => {
    closeMenuSmooth();
    router.push("/(tabs)");
  };

  const handleOpenDownloads = () => {
    closeMenuSmooth();
    useDownloadStore.getState().setIsPanelOpen(true);
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const menuScale = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  const menuOpacity = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const menuTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });

  // Calculate dynamic bottom position: sits neatly above MiniPlayer if playing, or above MobileTabBar if not
  const bottomOffset =
    NAV_ROW_HEIGHT +
    Math.max(insets.bottom, 8) +
    (currentSong ? 64 + 20 : 16);

  const isMuted = volume === 0;

  return (
    <>
      {/* Click outside backdrop to dismiss popup */}
      {menuOpen && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeMenuSmooth}
        />
      )}

      <View
        pointerEvents="box-none"
        style={[styles.floatingAnchor, { bottom: bottomOffset }]}
      >
        <View style={styles.columnContainer}>
          {/* Quick Actions Popup Menu */}
          {menuOpen && (
            <Animated.View
              style={[
                styles.popupCard,
                {
                  opacity: menuOpacity,
                  transform: [{ scale: menuScale }, { translateY: menuTranslateY }],
                },
              ]}
            >
              {/* Header */}
              <View style={styles.popupHeader}>
                <AuraText role="tiny" color={Color.gold500} style={{ fontWeight: "700" }}>
                  إجراءات سريعة
                </AuraText>
                <Sparkles size={12} color={Color.gold500} />
              </View>

              {/* Action 1: Back step */}
              <AuraTouch
                feedback="selection"
                onPress={handleBack}
                style={styles.popupItem}
              >
                <View style={[styles.itemIcon, { backgroundColor: Color.veil_goldTint }]}>
                  <ArrowRight size={15} color={Color.gold300} />
                </View>
                <AuraText role="label" color={Color.text_primary}>
                  رجوع خطوة لورا
                </AuraText>
              </AuraTouch>

              {/* Action 2: Scroll to Top */}
              <AuraTouch
                feedback="selection"
                onPress={handleScrollTop}
                style={styles.popupItem}
              >
                <View style={[styles.itemIcon, { backgroundColor: Color.veil_goldTint }]}>
                  <ArrowUp size={15} color={Color.gold300} />
                </View>
                <AuraText role="label" color={Color.text_primary}>
                  الصعود لأعلى الصفحة
                </AuraText>
              </AuraTouch>

              {/* Action 3: Toggle Mute (if song active) */}
              {currentSong && (
                <AuraTouch
                  feedback="selection"
                  onPress={handleToggleMute}
                  style={styles.popupItem}
                >
                  <View style={[styles.itemIcon, { backgroundColor: isMuted ? "rgba(224,96,60,0.18)" : Color.veil_goldTint }]}>
                    {isMuted ? (
                      <VolumeX size={15} color={Color.state_danger} />
                    ) : (
                      <Volume2 size={15} color={Color.gold300} />
                    )}
                  </View>
                  <AuraText role="label" color={isMuted ? Color.state_danger : Color.text_primary}>
                    {isMuted ? "تشغيل الصوت" : "كتم الصوت"}
                  </AuraText>
                </AuraTouch>
              )}

              {/* Action 4: Close Player (if song active) */}
              {currentSong && (
                <AuraTouch
                  feedback="selection"
                  onPress={handleClosePlayer}
                  style={styles.popupItem}
                >
                  <View style={[styles.itemIcon, { backgroundColor: "rgba(224,96,60,0.18)" }]}>
                    <Square size={13} color={Color.state_danger} fill={Color.state_danger} />
                  </View>
                  <AuraText role="label" color={Color.state_danger}>
                    قفل المشغل تماماً
                  </AuraText>
                </AuraTouch>
              )}

              {/* Action 5: Go to Library */}
              <AuraTouch
                feedback="selection"
                onPress={handleGoLibrary}
                style={styles.popupItem}
              >
                <View style={[styles.itemIcon, { backgroundColor: "rgba(95,207,142,0.15)" }]}>
                  <Library size={15} color={Color.state_success} />
                </View>
                <AuraText role="label" color={Color.text_primary}>
                  مكتبتي (الأوفلاين)
                </AuraText>
              </AuraTouch>

              {/* Action 5.5: Open Download Manager */}
              <AuraTouch
                feedback="selection"
                onPress={handleOpenDownloads}
                style={styles.popupItem}
              >
                <View style={[styles.itemIcon, { backgroundColor: "rgba(226,177,60,0.15)" }]}>
                  <DownloadCloud size={15} color={Color.gold300} />
                </View>
                <AuraText role="label" color={Color.text_primary}>
                  مدير التحميلات
                </AuraText>
              </AuraTouch>

              {/* Action 6: Home */}
              <AuraTouch
                feedback="selection"
                onPress={handleGoHome}
                style={styles.popupItem}
              >
                <View style={[styles.itemIcon, { backgroundColor: Color.veil_goldTint }]}>
                  <Home size={15} color={Color.gold300} />
                </View>
                <AuraText role="label" color={Color.text_primary}>
                  الرئيسية
                </AuraText>
              </AuraTouch>
            </Animated.View>
          )}

          {/* Buttons Stack */}
          <View style={styles.buttonsStack}>
            {/* Arrow / Chevron Button */}
            <AuraTouch
              feedback="selection"
              pressedScale={0.88}
              onPress={toggleMenu}
              style={[styles.arrowBtn, menuOpen && styles.arrowBtnActive]}
            >
              <ChevronUp
                size={17}
                color={menuOpen ? Color.ink0 : Color.gold300}
                strokeWidth={2.5}
                style={menuOpen ? { transform: [{ rotate: "180deg" }] } : undefined}
              />
            </AuraTouch>

            {/* Refresh Button */}
            <AuraTouch
              feedback="impact"
              pressedScale={0.9}
              onPress={handleRefresh}
              style={styles.refreshBtn}
            >
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <RefreshCw size={16} color={Color.gold300} strokeWidth={2.4} />
              </Animated.View>
            </AuraTouch>
          </View>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  floatingAnchor: {
    position: "absolute",
    right: Space.s4,
    zIndex: 90,
  },
  columnContainer: {
    alignItems: "flex-end",
  },
  popupCard: {
    position: "absolute",
    bottom: 96,
    right: 0,
    minWidth: 185,
    backgroundColor: "rgba(16,13,11,0.96)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    padding: Space.s2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 20,
    gap: 4,
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.s2,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Color.veil_hairline,
    marginBottom: 4,
  },
  popupItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    paddingVertical: 6,
    paddingHorizontal: Space.s2,
    borderRadius: Radius.sm,
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonsStack: {
    alignItems: "center",
    gap: Space.s2,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(16,13,11,0.85)",
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  arrowBtnActive: {
    backgroundColor: Color.gold500,
    borderColor: Color.gold500,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(18,15,13,0.92)",
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  refreshFace: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
