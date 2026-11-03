import React, { memo, useEffect, useId, useMemo, useRef } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Color } from "@/theme";
import { BAND_COUNT, bandLevel, type AuraPulse, type SceneId } from "./useAuraPulse";

const TAU = Math.PI * 2;

/** The halo scene shrinks the cover so the radial spectrum fits around it on phones. */
export const HALO_COVER_SCALE = 0.76;

// Everything is placed relative to the middle of a `box`-sized square, so it stays put in RTL.
const centered = (box: number, width: number, height: number): ViewStyle => ({
  position: "absolute",
  left: (box - width) / 2,
  top: (box - height) / 2,
  width,
  height,
});

// A soft round light. It is static, so it is rasterized once and only moved and faded after that.
const Glow = memo(function Glow({ size, color }: { size: number; color: string }) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.7} />
          <Stop offset="0.55" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
});

const BeatGlow = memo(function BeatGlow({
  box,
  size,
  color,
  pulse,
}: {
  box: number;
  size: number;
  color: string;
  pulse: AuraPulse;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.energy.value * (0.3 + pulse.kick.value * 0.45),
    transform: [{ scale: 1 + pulse.kick.value * 0.14 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[centered(box, size, size), style]}>
      <Glow size={size} color={color} />
    </Animated.View>
  );
});

// ─── Halo: a radial spectrum around the cover ─────────────────────────────────
const RadialBar = memo(function RadialBar({
  index,
  count,
  box,
  radius,
  length,
  width,
  pulse,
}: {
  index: number;
  count: number;
  box: number;
  radius: number;
  length: number;
  width: number;
  pulse: AuraPulse;
}) {
  const half = count / 2;
  // Mirrored left and right, with the bass meeting at the bottom of the ring.
  const mirror = index <= half ? index / half : (count - index) / half;
  const band = Math.min(BAND_COUNT - 1, Math.floor(mirror * BAND_COUNT * 0.8));
  const angle = Math.PI + (index / count) * TAU;

  const style = useAnimatedStyle(() => {
    const level = bandLevel(band, pulse.clock.value, pulse.energy.value, pulse.kick.value, pulse.phase.value);
    const scale = 0.05 + Math.pow(level, 1.5) * 0.95;
    return {
      opacity: 0.38 + level * 0.62,
      transform: [
        { rotate: `${angle}rad` },
        { translateY: -(radius + (length * scale) / 2 + pulse.kick.value * 3) },
        { scaleY: scale },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        centered(box, width, length),
        { backgroundColor: Color.gold300, borderRadius: width / 2 },
        style,
      ]}
    />
  );
});

const RippleRing = memo(function RippleRing({
  offset,
  box,
  radius,
  pulse,
}: {
  offset: number;
  box: number;
  radius: number;
  pulse: AuraPulse;
}) {
  const size = radius * 2;
  const style = useAnimatedStyle(() => {
    const t = ((pulse.beats.value + pulse.phase.value) / 2 + offset) % 1;
    const fade = 1 - t;
    return {
      opacity: fade * fade * 0.6 * pulse.energy.value,
      transform: [{ scale: 1 + t * 0.75 }],
    };
  });
  return (
    <Animated.View
      style={[
        centered(box, size, size),
        { borderRadius: size / 2, borderWidth: 1.5, borderColor: Color.gold300 },
        style,
      ]}
    />
  );
});

const DustMote = memo(function DustMote({
  seed,
  box,
  radius,
  pulse,
}: {
  seed: number;
  box: number;
  radius: number;
  pulse: AuraPulse;
}) {
  const start = seed * TAU;
  const distance = radius * (1.25 + ((seed * 7.13) % 1) * 1.05);
  const speed = 0.12 + ((seed * 3.7) % 1) * 0.24;
  const size = 2.5 + ((seed * 5.3) % 1) * 3;
  const style = useAnimatedStyle(() => {
    const angle = start + pulse.clock.value * speed;
    const twinkle = 0.5 + 0.5 * Math.sin(pulse.clock.value * 1.6 + start * 5);
    return {
      opacity: (0.15 + 0.6 * twinkle) * (0.3 + 0.7 * pulse.energy.value),
      transform: [
        { translateX: Math.cos(angle) * distance },
        { translateY: Math.sin(angle) * distance * 0.9 },
        { scale: 1 + pulse.kick.value * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        centered(box, size, size),
        { borderRadius: size / 2, backgroundColor: Color.gold300 },
        style,
      ]}
    />
  );
});

const Dust = memo(function Dust({
  count,
  box,
  radius,
  pulse,
}: {
  count: number;
  box: number;
  radius: number;
  pulse: AuraPulse;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <DustMote key={i} seed={(i * 0.618034 + 0.13) % 1} box={box} radius={radius} pulse={pulse} />
      ))}
    </>
  );
});

// ─── Arches: the logo's arch radiating from behind the cover ──────────────────
// Centerline of the logo's outer arch with longer legs, in the logo's 512-unit space.
const ARCH_PATH = "M -2.85 560 L 181.78 145.32 A 81.24 81.24 0 0 1 330.22 145.32 L 514.85 560";
const ARCH_VIEWBOX = "-20 80 552 552";
const ARCH_UNITS = 552;
// The view scales around unit y=356; the cover's middle should sit on the arch at unit y=270,
// so the arc rises just above the cover and stays clear of the player's header.
const ARCH_CENTER_SHIFT = 86;
const ARCH_UNITS_PER_COVER_RADIUS = 119;

const ArchShape = memo(function ArchShape({ size, color, stroke }: { size: number; color: string; stroke: number }) {
  return (
    <Svg width={size} height={size} viewBox={ARCH_VIEWBOX}>
      <Path d={ARCH_PATH} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
});

const ArchWave = memo(function ArchWave({
  offset,
  box,
  size,
  baseScale,
  pulse,
}: {
  offset: number;
  box: number;
  size: number;
  baseScale: number;
  pulse: AuraPulse;
}) {
  const shiftPerScale = (ARCH_CENTER_SHIFT * size) / ARCH_UNITS;
  const style = useAnimatedStyle(() => {
    const t = ((pulse.beats.value + pulse.phase.value) / 4 + offset) % 1;
    const scale = baseScale * (1 + t * 1.5);
    return {
      opacity: Math.pow(1 - t, 1.4) * 0.8 * pulse.energy.value,
      transform: [{ translateY: shiftPerScale * scale }, { scale }],
    };
  });
  return (
    <Animated.View style={[centered(box, size, size), style]}>
      <ArchShape size={size} color={Color.gold300} stroke={5} />
    </Animated.View>
  );
});

const ResidentArch = memo(function ResidentArch({
  factor,
  stroke,
  alpha,
  box,
  size,
  baseScale,
  pulse,
}: {
  factor: number;
  stroke: number;
  alpha: number;
  box: number;
  size: number;
  baseScale: number;
  pulse: AuraPulse;
}) {
  const shiftPerScale = (ARCH_CENTER_SHIFT * size) / ARCH_UNITS;
  const style = useAnimatedStyle(() => {
    const scale = baseScale * factor * (1 + pulse.kick.value * 0.035);
    return {
      opacity: alpha * (0.45 + 0.55 * pulse.energy.value),
      transform: [{ translateY: shiftPerScale * scale }, { scale }],
    };
  });
  return (
    <Animated.View style={[centered(box, size, size), style]}>
      <ArchShape size={size} color={Color.gold500} stroke={stroke} />
    </Animated.View>
  );
});

// ─── Warp: gold streaks flying out of the cover ───────────────────────────────
const STREAK_BASE = 60;

const Streak = memo(function Streak({
  seed,
  box,
  radius,
  reach,
  pulse,
}: {
  seed: number;
  box: number;
  radius: number;
  reach: number;
  pulse: AuraPulse;
}) {
  const angle = seed * TAU;
  const shift = (seed * 9.7) % 1;
  const rate = 0.6 + ((seed * 4.1) % 1) * 0.8;
  const style = useAnimatedStyle(() => {
    const t = (pulse.travel.value * rate + shift) % 1;
    const eased = t * t;
    return {
      opacity: Math.min(1, t * 2.4) * (1 - eased) * (0.2 + 0.8 * pulse.energy.value),
      transform: [
        { rotate: `${angle}rad` },
        { translateX: radius * 0.85 + eased * reach },
        { scaleX: (6 + eased * 74) / STREAK_BASE },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        centered(box, STREAK_BASE, 2),
        { borderRadius: 1, backgroundColor: Color.gold300 },
        style,
      ]}
    />
  );
});

// ─── Aurora: slow drifting lights in gold and the song's own color ────────────
const AuroraLight = memo(function AuroraLight({
  box,
  size,
  color,
  rangeX,
  rangeY,
  speed,
  start,
  pulse,
}: {
  box: number;
  size: number;
  color: string;
  rangeX: number;
  rangeY: number;
  speed: number;
  start: number;
  pulse: AuraPulse;
}) {
  const style = useAnimatedStyle(() => {
    const t = pulse.clock.value * speed + start;
    return {
      opacity: (0.3 + 0.7 * pulse.energy.value) * (0.42 + 0.22 * Math.sin(t * 1.7) + pulse.kick.value * 0.18),
      transform: [
        { translateX: Math.sin(t) * rangeX },
        { translateY: Math.cos(t * 0.8) * rangeY },
        { scale: 1 + pulse.kick.value * 0.12 },
      ],
    };
  });
  return (
    <Animated.View style={[centered(box, size, size), style]}>
      <Glow size={size} color={color} />
    </Animated.View>
  );
});

// ─── Sparks: one burst when a new song lands ──────────────────────────────────
const Spark = memo(function Spark({
  seed,
  box,
  radius,
  burst,
}: {
  seed: number;
  box: number;
  radius: number;
  burst: SharedValue<number>;
}) {
  const angle = seed * TAU;
  const reach = radius * (0.35 + ((seed * 6.3) % 1) * 0.95);
  const size = 3 + ((seed * 8.9) % 1) * 3.5;
  const style = useAnimatedStyle(() => {
    const p = burst.value;
    if (p <= 0 || p >= 1) return { opacity: 0 };
    const distance = radius * 0.92 + p * reach;
    return {
      opacity: 1 - p,
      transform: [
        { translateX: Math.cos(angle) * distance },
        { translateY: Math.sin(angle) * distance },
        { scale: 1 - p * 0.6 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        centered(box, size, size),
        { borderRadius: size / 2, backgroundColor: Color.gold300 },
        style,
      ]}
    />
  );
});

export const AuraStage = memo(function AuraStage({
  scene,
  size,
  tint,
  songKey,
  pulse,
}: {
  scene: SceneId;
  size: number; // the cover slot this stage is centered on
  tint: string;
  songKey: string;
  pulse: AuraPulse;
}) {
  const burst = useSharedValue(0);
  const lastSong = useRef(songKey);

  useEffect(() => {
    if (lastSong.current === songKey) return;
    lastSong.current = songKey;
    burst.value = 0;
    burst.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [songKey, burst]);

  const halfCover = size / 2;
  const haloRadius = halfCover * HALO_COVER_SCALE;

  const bars = useMemo(() => Array.from({ length: 44 }, (_, i) => i), []);
  const sparks = useMemo(() => Array.from({ length: 18 }, (_, i) => (i * 0.381966 + 0.07) % 1), []);
  const streaks = useMemo(() => Array.from({ length: 36 }, (_, i) => (i * 0.618034 + 0.31) % 1), []);

  if (scene === "calm") return null;

  // The arch art is drawn at this size, then scaled up; softness at larger scales reads as glow.
  const archSize = Math.round(halfCover * 2.8);
  const archBaseScale = (ARCH_UNITS * (halfCover / ARCH_UNITS_PER_COVER_RADIUS)) / archSize;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      <View style={{ width: size, height: size }}>
        {scene === "aurora" ? (
          <>
            <AuroraLight box={size} size={size * 2} color={Color.gold500} rangeX={size * 0.42} rangeY={size * 0.3} speed={0.23} start={0} pulse={pulse} />
            <AuroraLight box={size} size={size * 1.8} color={tint} rangeX={size * 0.5} rangeY={size * 0.36} speed={0.17} start={2.1} pulse={pulse} />
            <AuroraLight box={size} size={size * 1.5} color={Color.gold700} rangeX={size * 0.36} rangeY={size * 0.5} speed={0.29} start={4.2} pulse={pulse} />
          </>
        ) : (
          <BeatGlow box={size} size={size * 1.75} color={tint} pulse={pulse} />
        )}

        {scene === "halo" && (
          <>
            <RippleRing offset={0} box={size} radius={haloRadius + 6} pulse={pulse} />
            <RippleRing offset={0.5} box={size} radius={haloRadius + 6} pulse={pulse} />
            <Dust count={8} box={size} radius={haloRadius} pulse={pulse} />
            {bars.map((i) => (
              <RadialBar
                key={i}
                index={i}
                count={bars.length}
                box={size}
                radius={haloRadius + 9}
                length={halfCover * 0.42}
                width={Math.max(2, ((TAU * (haloRadius + 9)) / bars.length) * 0.4)}
                pulse={pulse}
              />
            ))}
          </>
        )}

        {scene === "arches" && (
          <>
            <ArchWave offset={0} box={size} size={archSize} baseScale={archBaseScale} pulse={pulse} />
            <ArchWave offset={1 / 3} box={size} size={archSize} baseScale={archBaseScale} pulse={pulse} />
            <ArchWave offset={2 / 3} box={size} size={archSize} baseScale={archBaseScale} pulse={pulse} />
            <ResidentArch factor={1.14} stroke={5} alpha={0.4} box={size} size={archSize} baseScale={archBaseScale} pulse={pulse} />
            <ResidentArch factor={1} stroke={9} alpha={0.85} box={size} size={archSize} baseScale={archBaseScale} pulse={pulse} />
          </>
        )}

        {scene === "vinyl" && (
          <>
            <RippleRing offset={0} box={size} radius={halfCover} pulse={pulse} />
            <RippleRing offset={0.5} box={size} radius={halfCover} pulse={pulse} />
            <Dust count={8} box={size} radius={halfCover} pulse={pulse} />
          </>
        )}

        {scene === "aurora" && <Dust count={8} box={size} radius={halfCover} pulse={pulse} />}

        {scene === "warp" &&
          streaks.map((seed, i) => (
            <Streak key={i} seed={seed} box={size} radius={halfCover} reach={size * 1.25} pulse={pulse} />
          ))}

        {sparks.map((seed, i) => (
          <Spark key={i} seed={seed} box={size} radius={scene === "halo" ? haloRadius : halfCover} burst={burst} />
        ))}
      </View>
    </View>
  );
});

/** A ring behind the play button that kicks with the beat. */
export const PlayKickRing = memo(function PlayKickRing({ pulse }: { pulse: AuraPulse }) {
  const style = useAnimatedStyle(() => ({
    opacity: pulse.energy.value * (0.12 + pulse.kick.value * 0.55),
    transform: [{ scale: 1.06 + pulse.kick.value * 0.3 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: 999, borderWidth: 2, borderColor: Color.gold300 },
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center" },
});
