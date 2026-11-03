import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Color, Radius } from "@/theme";

interface HairlineProps {
  axis?: "horizontal" | "vertical";
  intensity?: "soft" | "base" | "strong" | "gold";
  thickness?: number;
  style?: StyleProp<ViewStyle>;
}

const COLORS: Record<string, [string, string, string]> = {
  soft: ["rgba(0,0,0,0)", Color.veil_hairlineSoft, "rgba(0,0,0,0)"],
  base: ["rgba(0,0,0,0)", Color.veil_hairline, "rgba(0,0,0,0)"],
  strong: ["rgba(0,0,0,0)", Color.veil_hairlineStrong, "rgba(0,0,0,0)"],
  gold: ["rgba(0,0,0,0)", Color.veil_goldHairline, "rgba(0,0,0,0)"],
};

export const AuraHairline: React.FC<HairlineProps> = ({
  axis = "horizontal",
  intensity = "base",
  thickness = 1,
  style,
}) => (
  <LinearGradient
    start={axis === "horizontal" ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
    end={axis === "horizontal" ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
    colors={COLORS[intensity]}
    style={
      axis === "horizontal"
        ? [{ height: thickness, width: "100%" }, style]
        : [{ width: thickness, alignSelf: "stretch" }, style]
    }
  />
);

interface DotRailProps {
  count?: number;
  activeIndex?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const AuraDotRail: React.FC<DotRailProps> = ({
  count = 3,
  activeIndex = 0,
  color = Color.gold500,
  style,
}) => (
  <View style={[{ flexDirection: "row", alignItems: "center", gap: 5 }, style]}>
    {Array.from({ length: count }).map((_, i) => (
      <View
        key={i}
        style={{
          width: i === activeIndex ? 14 : 4,
          height: 4,
          borderRadius: Radius.pill,
          backgroundColor: i === activeIndex ? color : Color.veil_hairlineStrong,
        }}
      />
    ))}
  </View>
);
