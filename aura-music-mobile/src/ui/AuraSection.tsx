import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Color, Radius, Space } from "@/theme";
import { AuraText, AuraKicker } from "./AuraText";
import { AuraTouch } from "./AuraTouch";

interface SectionProps {
  kicker?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  align?: "start" | "between";
  style?: StyleProp<ViewStyle>;
}

export const AuraSection: React.FC<SectionProps> = ({
  kicker,
  title,
  actionLabel,
  onAction,
  align = "between",
  style,
}) => (
  <View
    style={[
      {
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent:
          align === "between" && actionLabel ? "space-between" : "flex-start",
        paddingStart: Space.s4,
        paddingEnd: Space.s4,
        marginBottom: Space.s3,
      },
      style,
    ]}
  >
    <View style={{ flexShrink: 1, flexDirection: "row", gap: Space.s2 }}>
      <View
        style={{
          width: 3,
          marginVertical: 3,
          borderRadius: Radius.pill,
          backgroundColor: Color.gold500,
        }}
      />
      <View style={{ flexShrink: 1 }}>
        {!!kicker && <AuraKicker>{kicker}</AuraKicker>}
        <AuraText role="titleSm" lines={1}>
          {title}
        </AuraText>
      </View>
    </View>
    {!!actionLabel && (
      <AuraTouch
        onPress={onAction}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ paddingVertical: Space.s1 }}
      >
        <AuraText role="tiny" color={Color.gold300}>
          {actionLabel}
        </AuraText>
      </AuraTouch>
    )}
  </View>
);

interface SurfaceProps {
  tone?: "base" | "raised" | "gold";
  padding?: number;
  radius?: number;
  hairline?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

const SURFACE_TONES: Record<string, { bg: string; border: string }> = {
  base: { bg: Color.ink1, border: Color.veil_hairlineSoft },
  raised: { bg: Color.ink2, border: Color.veil_hairline },
  gold: { bg: Color.veil_goldTint, border: Color.veil_goldHairline },
};

export const AuraSurface: React.FC<SurfaceProps> = ({
  tone = "base",
  padding = Space.s4,
  radius = Radius.lg,
  hairline = false,
  style,
  children,
}) => {
  const t = SURFACE_TONES[tone];
  return (
    <View
      style={[
        {
          backgroundColor: t.bg,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: t.border,
          padding,
        },
        style,
      ]}
    >
      {hairline && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: radius,
            right: radius,
            height: 1,
            backgroundColor: Color.veil_goldHairline,
          }}
        />
      )}
      {children}
    </View>
  );
};
