import React, { useEffect } from "react";
import { View, StyleSheet, Platform, I18nManager } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Font from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Color, FontFiles } from "@/theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useLibraryStore } from "@/store/useLibraryStore";
import { useAuthStore } from "@/store/useAuthStore";
import { MiniPlayer } from "@/components/MiniPlayer";
import { FullPlayerModal } from "@/components/FullPlayerModal";
import { DownloadProgressPanel } from "@/components/DownloadProgressPanel";
import { MobileTabBar } from "@/components/MobileTabBar";
import { AuthModal } from "@/components/AuthModal";
import { PremiumModal } from "@/components/PremiumModal";
import { FloatingActionMenu } from "@/components/FloatingActionMenu";

// Arabic-first: mirror every layout. Native applies after relaunch, web via document.dir.
if (Platform.OS !== "web" && !I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  const [fontsLoaded] = Font.useFonts(FontFiles);
  const initPlayer = usePlayerStore((s) => s.initPlayer);
  const loadLibrary = useLibraryStore((s) => s.loadLibrary);

  useEffect(() => {
    // 0. Ensure no-referrer policy on web for Google CDN and YouTube thumbnails
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.dir = "rtl";
      document.documentElement.lang = "ar";

      let meta = document.querySelector('meta[name="referrer"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "referrer");
        meta.setAttribute("content", "no-referrer");
        document.head.appendChild(meta);
      }
    }

    // 1. Initialize persistent audio & player session
    initPlayer();
    // 2. Load SQLite offline library & storage stats
    loadLibrary();
    // 3. Initialize auth session & VIP state
    useAuthStore.getState().initAuth();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.container}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Color.ink0 },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="artist/[id]"
              options={{
                headerShown: false,
                presentation: "card",
              }}
            />
            <Stack.Screen
              name="album/[id]"
              options={{
                headerShown: false,
                presentation: "card",
              }}
            />
            <Stack.Screen
              name="playlist/[id]"
              options={{
                headerShown: false,
                presentation: "card",
              }}
            />
          </Stack>

          {/* Floating Download Manager Bubble & Panel */}
          <DownloadProgressPanel />

          {/* Persistent Mini Player at bottom of screen */}
          <MiniPlayer />

          {/* Persistent Mobile Bottom Navigation Bar (1:1 with Web AppShell) */}
          <MobileTabBar />

          {/* Persistent Floating Quick Actions & Refresh Menu */}
          <FloatingActionMenu />

          {/* Full Screen Player Modal */}
          <FullPlayerModal />

          {/* Authentication & Subscription Modals */}
          <AuthModal />
          <PremiumModal />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Color.ink0,
  },
  container: {
    flex: 1,
    backgroundColor: Color.ink0,
  },
});
