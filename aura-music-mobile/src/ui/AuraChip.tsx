import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Color, Radius, Space, Type } from "@/theme";
import { AuraText } from "./AuraText";
import { AuraTouch } from "./AuraTouch";

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
}

export const AuraChip: React.FC<ChipProps> = ({
  label,
  active = false,
  onPress,
  icon,
  size = "md",
  style,
}) => (
  <AuraTouch
    onPress={onPress}
    feedback="selection"
    style={[
      {
        flexDirection: "row",
        alignItems: "center",
        gap: Space.s2,
        paddingHorizontal: size === "sm" ? Space.s3 : Space.s4,
        paddingVertical: size === "sm" ? 6 : 9,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: active ? Color.gold500 : Color.veil_hairlineStrong,
        backgroundColor: active ? Color.veil_goldTintStrong : Color.ink2,
      },
      style,
    ]}
  >
    {icon}
    <AuraText
      role="label"
      color={active ? Color.gold100 : Color.text_secondary}
      style={{ letterSpacing: 0.2 }}
    >
      {label}
    </AuraText>
  </AuraTouch>
);

interface BadgeProps {
  label: string;
  tone?: "gold" | "live" | "quiet" | "danger";
  style?: StyleProp<ViewStyle>;
}

const BADGE_TONES: Record<string, { fg: string; bg: string; border: string }> = {
  gold: {
    fg: Color.gold100,
    bg: Color.veil_goldTint,
    border: Color.veil_goldHairline,
  },
  live: {
    fg: Color.state_success,
    bg: Color.veil_successGlow,
    border: "rgba(95, 207, 142, 0.32)",
  },
  quiet: {
    fg: Color.text_secondary,
    bg: Color.veil_hairlineSoft,
    border: Color.veil_hairline,
  },
  danger: {
    fg: Color.state_danger,
    bg: Color.veil_dangerGlow,
    border: "rgba(224, 96, 60, 0.32)",
  },
};

export const AuraBadge: React.FC<BadgeProps> = ({
  label,
  tone = "gold",
  style,
}) => {
  const t = BADGE_TONES[tone];
  return (
    <View
      style={[
        {
          paddingHorizontal: Space.s2,
          paddingVertical: 3,
          borderRadius: Radius.pill,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.bg,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <AuraText
        role="tiny"
        color={t.fg}
        style={{ ...Type.tiny, fontSize: 9.5, letterSpacing: 0.9 }}
      >
        {label}
      </AuraText>
    </View>
  );
};
