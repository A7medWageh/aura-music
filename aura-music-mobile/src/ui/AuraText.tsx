import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { Color, Space, Type } from "@/theme";

export type TypeRole = keyof typeof Type;

export type AuraTextRole =
  | TypeRole
  | "displaySm"
  | "titleSm"
  | "label"
  | "kicker";

const EXTENDED: Record<string, TextStyle> = {
  displaySm: { ...Type.display, fontSize: 24, lineHeight: 32 },
  titleSm: { ...Type.title, fontSize: 18, lineHeight: 26 },
  label: { ...Type.bodyStrong, fontSize: 13, lineHeight: 20 },
  kicker: { ...Type.tiny, fontSize: 11, lineHeight: 16, letterSpacing: 1.4 },
};

const ROLE_COLORS: Record<string, string> = {
  display: Color.text_primary,
  title: Color.text_primary,
  sectionTitle: Color.text_primary,
  body: Color.text_primary,
  bodyStrong: Color.text_primary,
  caption: Color.text_secondary,
  tiny: Color.text_muted,
  numeric: Color.text_secondary,
  displaySm: Color.text_primary,
  titleSm: Color.text_primary,
  label: Color.text_primary,
  kicker: Color.gold500,
};

interface AuraTextProps {
  role?: AuraTextRole;
  color?: string;
  align?: "auto" | "left" | "center" | "right";
  lines?: number;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

const AuraTextBase: React.FC<AuraTextProps> = ({
  role = "body",
  color,
  align,
  lines,
  style,
  children,
}) => (
  <Text
    numberOfLines={lines}
    style={[
      { ...EXTENDED[role], ...Type[role as TypeRole] },
      { color: color ?? ROLE_COLORS[role] ?? Color.text_primary },
      align ? { textAlign: align } : null,
      style,
    ]}
  >
    {children}
  </Text>
);

export const AuraText = React.memo(AuraTextBase);

export const AuraKicker: React.FC<{
  children?: React.ReactNode;
  color?: string;
  style?: TextStyle | TextStyle[];
}> = ({ children, color = Color.gold500, style }) => (
  <Text style={[EXTENDED.kicker, { color, marginBottom: Space.s1 }, style]}>
    {children}
  </Text>
);
