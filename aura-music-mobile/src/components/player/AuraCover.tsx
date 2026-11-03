import React, { memo, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Rect, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Color, Motion, Radius } from "@/theme";
import { AuraArtwork } from "@/ui";
import { PLACEHOLDER_SONG } from "@/constants/placeholders";
import { HALO_COVER_SCALE } from "./AuraStage";
import type { AuraPulse, SceneId } from "./useAuraPulse";

type CoverProps = {
  scene: SceneId;
  size: number;
  uri: string | null | undefined;
  title?: string | null;
  artist?: string | null;
  songKey: string;
  isPlaying: boolean;
  isBuffering: boolean;
  pulse: AuraPulse;
};

const BufferVeil = () => (
  <View style={styles.veil}>
    <ActivityIndicator color={Color.gold300} size="large" />
  </View>
);

// One light sweep across the art when a new song lands.
const Sheen = memo(function Sheen({ size, songKey }: { size: number; songKey: string }) {
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = 0;
    sweep.value = withDelay(120, withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }));
  }, [songKey, sweep]);

  const style = useAnimatedStyle(() => ({
    opacity: sweep.value > 0 && sweep.value < 1 ? 1 : 0,
    transform: [{ translateX: -size * 0.6 + sweep.value * size * 1.7 }, { skewX: "-16deg" }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.sheen, { width: size * 0.45 }, style]}>
      <LinearGradient
        colors={["rgba(255,244,214,0)", "rgba(255,244,214,0.42)", "rgba(255,244,214,0)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
});

// Pressed grooves on the disc; static, so it only ever gets rotated.
const Grooves = memo(function Grooves({ size }: { size: number }) {
  const center = size / 2;
  const rings = Array.from({ length: 13 }, (_, i) => center * (0.5 + i * 0.038));
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={center} cy={center} r={center - 0.5} fill={Color.ink2} stroke={Color.veil_goldHairline} />
      {rings.map((r) => (
        <Circle key={r} cx={center} cy={center} r={r} fill="none" stroke="rgba(245,240,230,0.055)" strokeWidth={1} />
      ))}
    </Svg>
  );
});

const Tonearm = memo(function Tonearm({ size, isPlaying }: { size: number; isPlaying: boolean }) {
  const engaged = useSharedValue(isPlaying ? 1 : 0);

  useEffect(() => {
    engaged.value = withSpring(isPlaying ? 1 : 0, Motion.gentle);
  }, [isPlaying, engaged]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-20 + 25 * engaged.value}deg` }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tonearm,
        { width: size * 0.42, height: size * 0.71, transformOrigin: "78% 12%" },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 170">
        <Defs>
          <SvgLinearGradient id="auraTonearm" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={Color.gold300} />
            <Stop offset="1" stopColor={Color.gold700} />
          </SvgLinearGradient>
        </Defs>
        <Path d="M78 20 L74 96 L42 144" fill="none" stroke="url(#auraTonearm)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        <Rect x={26} y={138} width={24} height={15} rx={3} transform="rotate(-34 38 146)" fill="url(#auraTonearm)" />
        <Circle cx={78} cy={20} r={13} fill={Color.ink3} stroke="url(#auraTonearm)" strokeWidth={3} />
        <Circle cx={78} cy={20} r={4} fill={Color.gold300} />
      </Svg>
    </Animated.View>
  );
});

const VinylRecord = memo(function VinylRecord({ size, uri, title, artist, isPlaying, isBuffering, pulse }: CoverProps) {
  const labelSize = Math.round(size * 0.46);
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pulse.spin.value}deg` }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, spinStyle]}>
        <Grooves size={size} />
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <AuraArtwork
            uri={uri}
            title={title}
            artist={artist}
            placeholder={PLACEHOLDER_SONG}
            size={labelSize}
            shape="coin"
            ring="gold"
          />
          <View style={styles.spindle} />
        </View>
      </Animated.View>

      {/* The light on a record stays put while the disc turns under it. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: size / 2, overflow: "hidden" }]}>
        <LinearGradient
          colors={["rgba(244,212,124,0)", "rgba(244,212,124,0.15)", "rgba(244,212,124,0)"]}
          locations={[0.3, 0.5, 0.7]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <Tonearm size={size} isPlaying={isPlaying} />
      {isBuffering && <View style={[styles.veil, { borderRadius: size / 2 }]}><ActivityIndicator color={Color.gold300} size="large" /></View>}
    </View>
  );
});

export const AuraCover = memo(function AuraCover(props: CoverProps) {
  const { scene, size, uri, title, artist, songKey, isBuffering, pulse } = props;
  const appear = useSharedValue(1);
  const lastSong = useRef(songKey);

  useEffect(() => {
    if (lastSong.current === songKey) return;
    lastSong.current = songKey;
    appear.value = 0.9;
    appear.value = withSpring(1, Motion.spring);
  }, [songKey, appear]);

  const liveStyle = useAnimatedStyle(() => ({
    transform: [{ scale: appear.value * (1 + pulse.kick.value * 0.016) }],
  }));

  if (scene === "vinyl") {
    return (
      <Animated.View style={liveStyle}>
        <VinylRecord {...props} />
      </Animated.View>
    );
  }

  const circular = scene === "halo";
  const coverSize = circular ? Math.round(size * HALO_COVER_SCALE) : size;

  return (
    <Animated.View style={[styles.lift, { borderRadius: circular ? coverSize / 2 : Radius.lg }, liveStyle]}>
      <AuraArtwork
        uri={uri}
        title={title}
        artist={artist}
        placeholder={PLACEHOLDER_SONG}
        size={coverSize}
        shape={circular ? "coin" : "slab"}
        ring="gold"
      >
        <Sheen size={coverSize} songKey={songKey} />
        {isBuffering && <BufferVeil />}
      </AuraArtwork>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  lift: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
    elevation: 18,
  },
  veil: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_scrim,
  },
  sheen: { position: "absolute", top: "-10%", bottom: "-10%" },
  spindle: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Color.ink0,
    borderWidth: 1,
    borderColor: Color.gold300,
  },
  tonearm: { position: "absolute", top: "-9%", right: "-7%" },
});
