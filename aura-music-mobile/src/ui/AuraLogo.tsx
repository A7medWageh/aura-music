import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";
import { Color } from "@/theme";

// Vector geometry copied from "Aura logo/svg" (512-unit icon box, wordmark placed as in the lockup).
const ARCH_OUTER =
  "M162.482 136.731A102.368 102.368 0 0 1 349.518 136.731L436.575 332.265A21.124 21.124 0 0 1 397.98 349.449L310.923 153.915A60.121 60.121 0 0 0 201.077 153.915L114.02 349.449A21.124 21.124 0 0 1 75.425 332.265Z";
const ARCH_INNER =
  "M221.859 163.167A37.372 37.372 0 0 1 290.141 163.167L366.311 334.248A16.249 16.249 0 0 1 336.623 347.466L260.453 176.385A4.875 4.875 0 0 0 251.547 176.385L175.377 347.466A16.249 16.249 0 0 1 145.689 334.248Z";
const ARCH_DOT = "M231.627 296.985A24.373 24.373 0 1 1 280.373 296.985A24.373 24.373 0 1 1 231.627 296.985Z";
const WORDMARK = [
  "M93.603 63.088A76 76 0 0 1 232.462 63.088L324.163 269.052A22 22 0 0 1 283.967 286.948L192.266 80.984A32 32 0 0 0 133.799 80.984L42.098 286.948A22 22 0 0 1 1.902 269.052Z",
  "M133.112 208A29.92 29.92 0 1 1 192.952 208A29.92 29.92 0 1 1 133.112 208Z",
  "M349.865 122L349.865 206A22 22 0 0 0 393.865 206L393.865 122A22 22 0 0 0 349.865 122Z",
  "M537.865 206A94 94 0 0 1 349.865 206A22 22 0 0 1 393.865 206A50 50 0 0 0 493.865 206A22 22 0 0 1 537.865 206Z",
  "M493.865 122L493.865 278A22 22 0 0 0 537.865 278L537.865 122A22 22 0 0 0 493.865 122Z",
  "M571.865 122L571.865 278A22 22 0 0 0 615.865 278L615.865 122A22 22 0 0 0 571.865 122Z",
  "M571.865 196A96 96 0 0 1 671.215 100.058A22 22 0 0 1 669.68 144.032A52 52 0 0 0 615.865 196A22 22 0 0 1 571.865 196Z",
  "M866.265 122L866.265 278A22 22 0 0 0 910.265 278L910.265 122A22 22 0 0 0 866.265 122Z",
];
const WORDMARK_BOWL =
  "M710.265 200A100 100 0 1 1 910.265 200A100 100 0 1 1 710.265 200ZM754.265 200A56 56 0 1 1 866.265 200A56 56 0 1 1 754.265 200Z";

const LOCKUP_WIDTH = 1599.608;
const LOCKUP_HEIGHT = 516;
const GLYPH_INK = "#14110B";

const GoldStops: React.FC<{ id: string }> = ({ id }) => (
  <SvgLinearGradient id={id} x1="75" y1="75" x2="437" y2="437" gradientUnits="userSpaceOnUse">
    <Stop offset="0" stopColor={Color.gold300} />
    <Stop offset="0.52" stopColor={Color.gold500} />
    <Stop offset="1" stopColor={Color.gold700} />
  </SvgLinearGradient>
);

const Emblem: React.FC<{ gradientId: string }> = ({ gradientId }) => (
  <>
    <Circle cx={256} cy={256} r={256} fill={`url(#${gradientId})`} />
    <Path fill={GLYPH_INK} d={ARCH_OUTER} />
    <Path fill={GLYPH_INK} d={ARCH_INNER} />
    <Path fill={GLYPH_INK} d={ARCH_DOT} />
  </>
);

interface AuraMarkProps {
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** The round gold icon. */
export const AuraMark: React.FC<AuraMarkProps> = ({ size = 32, style }) => (
  <View style={[{ width: size, height: size }, style]}>
    <Svg width={size} height={size} viewBox="-2 -2 516 516">
      <Defs>
        <GoldStops id="auraMarkGold" />
      </Defs>
      <Emblem gradientId="auraMarkGold" />
    </Svg>
  </View>
);

const LOGO_HEIGHT = { sm: 26, md: 34, lg: 48, xl: 64 } as const;

interface AuraLogoProps {
  size?: keyof typeof LOGO_HEIGHT;
  style?: StyleProp<ViewStyle>;
}

/** Icon + wordmark, the primary logo on dark backgrounds. */
export const AuraLogo: React.FC<AuraLogoProps> = ({ size = "md", style }) => {
  const height = LOGO_HEIGHT[size];
  const width = (height * LOCKUP_WIDTH) / LOCKUP_HEIGHT;
  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height} viewBox={`-2 -2 ${LOCKUP_WIDTH} ${LOCKUP_HEIGHT}`}>
        <Defs>
          <GoldStops id="auraLogoGold" />
        </Defs>
        <Emblem gradientId="auraLogoGold" />
        <G transform="translate(604 74.791) scale(1.089)" fill="#FFFFFF">
          {WORDMARK.map((d) => (
            <Path key={d} d={d} />
          ))}
          <Path fillRule="evenodd" d={WORDMARK_BOWL} />
        </G>
      </Svg>
    </View>
  );
};

interface AuraArchesProps {
  width: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** The arches on their own: a decorative motif for backgrounds. */
export const AuraArches: React.FC<AuraArchesProps> = ({ width, color = Color.gold500, style }) => {
  const height = (width * 310) / 392;
  return (
    <View pointerEvents="none" style={[{ width, height }, style]}>
      <Svg width={width} height={height} viewBox="60 60 392 310">
        <Path fill={color} d={ARCH_OUTER} />
        <Path fill={color} d={ARCH_INNER} />
        <Path fill={color} d={ARCH_DOT} />
      </Svg>
    </View>
  );
};
