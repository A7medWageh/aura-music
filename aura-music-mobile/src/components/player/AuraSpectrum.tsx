import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Color } from "@/theme";
import { BAND_COUNT, bandLevel, type AuraPulse } from "./useAuraPulse";

const BAR_COUNT = 34;
const BAR_WIDTH = 3;

const Bar = memo(function Bar({
  band,
  height,
  played,
  pulse,
  tint,
}: {
  band: number;
  height: number;
  played: boolean;
  pulse: AuraPulse;
  tint?: string;
}) {
  const style = useAnimatedStyle(() => {
    const level = bandLevel(band, pulse.clock.value, pulse.energy.value, pulse.kick.value, pulse.phase.value);
    return { transform: [{ scaleY: 0.1 + level * 0.9 }] };
  });

  const activeColor = tint || Color.gold500;

  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH,
          height,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: played ? activeColor : Color.veil_hairlineStrong,
        },
        style,
      ]}
    />
  );
});

/** A live waveform strip above the scrubber: the played part reflects the artwork tint dynamically, the rest stays dim. */
export const AuraSpectrum = memo(function AuraSpectrum({
  progress,
  height = 30,
  pulse,
  tint,
}: {
  progress: number; // 0..1
  height?: number;
  pulse: AuraPulse;
  tint?: string;
}) {
  // Whole-bar steps, so React touches a bar only when playback crosses it.
  const playedBars = Math.round(progress * BAR_COUNT);
  return (
    <View style={[styles.row, { height }]} pointerEvents="none">
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        // Folded so the low notes meet in the middle and the strip stays symmetric.
        const fold = Math.abs(i / (BAR_COUNT - 1) - 0.5) * 2;
        const band = Math.min(BAND_COUNT - 1, Math.floor(fold * BAND_COUNT * 0.8));
        return <Bar key={i} band={band} height={height} played={i < playedBars} pulse={pulse} tint={tint} />;
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 10,
    marginBottom: 2,
  },
});
