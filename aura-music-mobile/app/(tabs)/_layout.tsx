import React from "react";
import { Tabs } from "expo-router";

// The visible dock is MobileTabBar; expo-router's native tab bar is hidden, so screens only need titles here.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "الرئيسية" }} />
      <Tabs.Screen name="search" options={{ title: "البحث" }} />
      <Tabs.Screen name="ai-dj" options={{ title: "AI Mix" }} />
      <Tabs.Screen name="library" options={{ title: "مكتبتي" }} />
      <Tabs.Screen name="profile" options={{ title: "حسابي" }} />
      {/* Favorites is a real route (reachable from the library rail); the dock is custom, so no tab entry here. */}
      <Tabs.Screen name="favorites" options={{ title: "المفضلة" }} />
    </Tabs>
  );
}
