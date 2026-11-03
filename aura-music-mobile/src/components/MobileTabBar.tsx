import React, { useRef, useState, useEffect, useMemo } from "react";
import { View, StyleSheet, Animated, Platform } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, Search, Sparkles, Library, User } from "lucide-react-native";
import { Color, Radius, Space } from "@/theme";
import { AuraText, AuraTouch } from "@/ui";

interface NavItem {
  id: string;
  name: string;
  icon: typeof Home;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", name: "الرئيسية", icon: Home, route: "/(tabs)" },
  { id: "search", name: "البحث", icon: Search, route: "/(tabs)/search" },
  { id: "ai", name: "AI Mix", icon: Sparkles, route: "/(tabs)/ai-dj" },
  { id: "library", name: "مكتبتي", icon: Library, route: "/(tabs)/library" },
  { id: "profile", name: "حسابي", icon: User, route: "/(tabs)/profile" },
];

const ROW_HEIGHT = 62;
const INDICATOR_WIDTH = 26;

export const NAV_DOCK_HEIGHT = ROW_HEIGHT;

export const MobileTabBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const isSearch = /search/i.test(pathname || "");
  const isAi = /ai-dj/i.test(pathname || "");
  const isLibrary = /library/i.test(pathname || "");
  const isProfile = /profile/i.test(pathname || "");
  const isHome = !isSearch && !isAi && !isLibrary && !isProfile;

  const activeIndex = useMemo(() => {
    if (isSearch) return 1;
    if (isAi) return 2;
    if (isLibrary) return 3;
    if (isProfile) return 4;
    return 0; // home
  }, [isSearch, isAi, isLibrary, isProfile]);

  const indicatorX = useRef(new Animated.Value(0)).current;
  const tabLayouts = useRef<Record<number, { x: number; width: number }>>({});
  const [hasMeasured, setHasMeasured] = useState(false);

  const handleTabLayout = (index: number, x: number, width: number) => {
    tabLayouts.current[index] = { x, width };
    if (index === activeIndex) {
      const targetX = x + (width - INDICATOR_WIDTH) / 2;
      if (!hasMeasured) {
        indicatorX.setValue(targetX);
        setHasMeasured(true);
      } else {
        Animated.spring(indicatorX, {
          toValue: targetX,
          friction: 8,
          tension: 70,
          useNativeDriver: false,
        }).start();
      }
    }
  };

  useEffect(() => {
    const layout = tabLayouts.current[activeIndex];
    if (layout) {
      const targetX = layout.x + (layout.width - INDICATOR_WIDTH) / 2;
      Animated.spring(indicatorX, {
        toValue: targetX,
        friction: 8,
        tension: 70,
        useNativeDriver: false,
      }).start();
    }
  }, [activeIndex]);

  const navigate = (route: string) => {
    router.navigate(route as never);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 6) }]}
    >
      <View style={[styles.slab, { borderRadius: Radius.xl }]}>
        <View style={styles.row}>
          {/* Smooth Gliding Active Filament Indicator */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.slidingIndicatorTrack,
              {
                opacity: hasMeasured ? 1 : 0,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          >
            <View style={styles.activeFilamentGlow} />
            <View style={styles.activeFilamentPill} />
          </Animated.View>

          {NAV_ITEMS.map((item, index) => {
            const isActive = activeIndex === index;
            const Icon = item.icon;
            return (
              <AuraTouch
                key={item.id}
                feedback="selection"
                pressedScale={0.96}
                onPress={() => navigate(item.route)}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  handleTabLayout(index, x, width);
                }}
                style={styles.item}
              >
                <Icon
                  size={isActive ? 22 : 20}
                  color={isActive ? Color.gold500 : Color.text_muted}
                  strokeWidth={isActive ? 2.3 : 1.6}
                />
                <AuraText
                  role="tiny"
                  color={isActive ? Color.gold100 : Color.text_muted}
                  style={{ marginTop: 2, letterSpacing: 0.3, fontWeight: isActive ? "700" : "500" }}
                >
                  {item.name}
                </AuraText>
              </AuraTouch>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 40,
    paddingHorizontal: Space.s2,
  },
  slab: {
    width: "100%",
    maxWidth: 620,
    backgroundColor: Color.ink1,
    borderTopWidth: 1,
    borderBottomWidth: 0,
    borderStartWidth: 1,
    borderEndWidth: 1,
    borderColor: Color.veil_hairline,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
    elevation: 24,
    paddingTop: 4,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  slidingIndicatorTrack: {
    position: "absolute",
    top: -4,
    left: 0,
    width: INDICATOR_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    height: "100%",
  },
  activeFilamentPill: {
    width: INDICATOR_WIDTH,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
    shadowColor: Color.gold500,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  activeFilamentGlow: {
    position: "absolute",
    top: -2,
    width: INDICATOR_WIDTH + 10,
    height: 7,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(226, 177, 60, 0.45)",
  },
});

export const NAV_ROW_HEIGHT = ROW_HEIGHT;
