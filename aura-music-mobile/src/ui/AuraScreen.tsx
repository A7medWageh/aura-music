import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Color, Size, Space } from "@/theme";
import { AuraArches } from "./AuraLogo";

const DOCK_CLEARANCE = Size.miniPlayer + Size.tabBar + Space.s5;

export const AuraCanvas: React.FC<{ intensity?: "deep" | "ember" }> = ({
  intensity = "ember",
}) => (
  <View pointerEvents="none" style={absolute}>
    <LinearGradient
      colors={
        intensity === "ember"
          ? [Color.veil_goldGlowSoft, "rgba(10,9,8,0)"]
          : [Color.ink2, "rgba(10,9,8,0)"]
      }
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ position: "absolute", top: -80, left: -60, right: -60, height: 420 }}
    />
    {/* The logo's arches, oversized and barely there */}
    <View style={{ position: "absolute", top: -28, left: 0, right: 0, alignItems: "center", opacity: intensity === "ember" ? 0.055 : 0.03 }}>
      <AuraArches width={440} />
    </View>
    <LinearGradient
      colors={["rgba(10,9,8,0)", Color.ink0]}
      locations={[0, 1]}
      style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 340 }}
    />
  </View>
);

interface ScreenProps {
  children: React.ReactNode;
  canvas?: "ember" | "deep" | "none";
  top?: boolean;
  bottomClearance?: number;
  style?: StyleProp<ViewStyle>;
  contentRef?: React.Ref<View>;
}

export const AuraScreen: React.FC<ScreenProps> = ({
  children,
  canvas = "ember",
  top = false,
  bottomClearance = DOCK_CLEARANCE,
  style,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[root, style]}>
      {canvas !== "none" && <AuraCanvas intensity={canvas} />}
      <View
        style={{
          flex: 1,
          paddingTop: top ? insets.top : 0,
          paddingBottom: bottomClearance,
        }}
      >
        {children}
      </View>
    </View>
  );
};

export const useDockClearance = () => {
  const insets = useSafeAreaInsets();
  return DOCK_CLEARANCE + insets.bottom;
};

const absolute: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  // The ember gradient intentionally bleeds past the edges; clip it so web doesn't get sideways page scroll.
  overflow: "hidden",
};

const root: ViewStyle = {
  flex: 1,
  backgroundColor: Color.ink0,
};
