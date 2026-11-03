import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated, Easing, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Radio } from "lucide-react-native";
import { Color, Radius, Space } from "@/theme";
import { AuraMark, AuraText } from "@/ui";

const LOADING_QUOTES = [
  "جارٍ ضبط أوتار الموسيقى والمسارات الصوتية… 🎵",
  "استدعاء تسجيلات الاستوديو فائقة النقاء 320kbps… ✨",
  "تجهيز الخزانة الصوتية وتصفية الإيقاعات… 🎧",
  "مزامنة المقاطع مع خوادم أورا الموسيقية… ⚡",
  "تلميع الترددات وضبط النقاء البلوري… 💎",
];

interface AuraCreativeLoaderProps {
  message?: string;
  fullscreen?: boolean;
  style?: ViewStyle;
}

export const AuraCreativeLoader: React.FC<AuraCreativeLoaderProps> = ({
  message,
  fullscreen = false,
  style,
}) => {
  const [quoteIndex, setQuoteIndex] = useState(0);

  // Animation values
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.92)).current;
  const ring1 = useRef(new Animated.Value(0.8)).current;
  const ring2 = useRef(new Animated.Value(0.6)).current;

  // 5 Equalizer frequency bars
  const bar1 = useRef(new Animated.Value(0.3)).current;
  const bar2 = useRef(new Animated.Value(0.7)).current;
  const bar3 = useRef(new Animated.Value(1.0)).current;
  const bar4 = useRef(new Animated.Value(0.5)).current;
  const bar5 = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // 1. Continuous vinyl spin
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 3800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 2. Breathing ambient pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.92,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // 3. Concentric soundwave ripples
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ring1, { toValue: 1.45, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(ring1, { toValue: 0.8, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(500),
          Animated.timing(ring2, { toValue: 1.55, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(ring2, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();

    // 4. Equalizer dancing bars
    const makeBarLoop = (anim: Animated.Value, duration: number, values: number[]) => {
      Animated.loop(
        Animated.sequence(
          values.map((v) =>
            Animated.timing(anim, {
              toValue: v,
              duration,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false,
            })
          )
        )
      ).start();
    };

    makeBarLoop(bar1, 280, [0.3, 0.9, 0.4, 0.7]);
    makeBarLoop(bar2, 230, [0.8, 0.2, 1.0, 0.5]);
    makeBarLoop(bar3, 260, [1.0, 0.4, 0.8, 0.3]);
    makeBarLoop(bar4, 210, [0.5, 1.0, 0.2, 0.9]);
    makeBarLoop(bar5, 250, [0.7, 0.3, 0.9, 0.4]);

    // 5. Rotate Arabic inspirational status messages every 2.8s
    const quoteTimer = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % LOADING_QUOTES.length);
    }, 2800);

    return () => clearInterval(quoteTimer);
  }, []);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const content = (
    <View style={styles.container}>
      {/* ── VINYL ORBIT WITH CONCENTRIC WAVES ── */}
      <View style={styles.orbitContainer}>
        {/* Outer Soundwave Ripple 2 */}
        <Animated.View
          style={[
            styles.soundwaveRing,
            styles.soundwaveRing2,
            { transform: [{ scale: ring2 }] },
          ]}
        />

        {/* Outer Soundwave Ripple 1 */}
        <Animated.View
          style={[
            styles.soundwaveRing,
            styles.soundwaveRing1,
            { transform: [{ scale: ring1 }] },
          ]}
        />

        {/* Ambient Aura Pulsing Glow */}
        <Animated.View
          style={[
            styles.ambientGlow,
            { transform: [{ scale: pulseAnim }] },
          ]}
        />

        {/* Spinning Vinyl Record Disc */}
        <Animated.View
          style={[
            styles.vinylDisc,
            { transform: [{ rotate: spin }] },
          ]}
        >
          {/* Micro-grooves */}
          <View style={styles.grooveOuter} />
          <View style={styles.grooveMid} />
          <View style={styles.grooveInner} />

          {/* The logo as the record's center label */}
          <AuraMark size={38} />
        </Animated.View>
      </View>

      {/* ── EQUALIZER FREQUENCY BARS ── */}
      <View style={styles.eqRow}>
        <Animated.View style={[styles.eqBar, { height: bar1.interpolate({ inputRange: [0, 1], outputRange: [6, 26] }) }]} />
        <Animated.View style={[styles.eqBar, { height: bar2.interpolate({ inputRange: [0, 1], outputRange: [6, 26] }) }]} />
        <Animated.View style={[styles.eqBar, styles.eqBarCenter, { height: bar3.interpolate({ inputRange: [0, 1], outputRange: [6, 26] }) }]} />
        <Animated.View style={[styles.eqBar, { height: bar4.interpolate({ inputRange: [0, 1], outputRange: [6, 26] }) }]} />
        <Animated.View style={[styles.eqBar, { height: bar5.interpolate({ inputRange: [0, 1], outputRange: [6, 26] }) }]} />
      </View>

      {/* ── LIVE ROTATING CREATIVE MESSAGE ── */}
      <View style={styles.textContainer}>
        <View style={styles.liveBadgeRow}>
          <Radio size={12} color={Color.gold500} />
          <AuraText role="tiny" color={Color.gold300} style={styles.liveBadgeText}>
            أورا ميوزك · محرك البث فائق السرعة
          </AuraText>
        </View>

        <AuraText role="bodyStrong" color={Color.text_primary} align="center" style={styles.quoteText}>
          {message || LOADING_QUOTES[quoteIndex]}
        </AuraText>
      </View>
    </View>
  );

  if (fullscreen) {
    return (
      <View style={[styles.fullscreenOverlay, style]}>
        <LinearGradient
          colors={["rgba(10, 9, 8, 0.96)", "rgba(16, 13, 11, 0.98)", "#0A0908"]}
          style={StyleSheet.absoluteFill}
        />
        {content}
      </View>
    );
  }

  return <View style={[styles.inlineWrapper, style]}>{content}</View>;
};

const styles = StyleSheet.create({
  fullscreenOverlay: {
    ...(StyleSheet.absoluteFill as any),
    zIndex: 99999,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineWrapper: {
    paddingVertical: Space.s8,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.s6,
  },
  orbitContainer: {
    width: 130,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  soundwaveRing: {
    position: "absolute",
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  soundwaveRing1: {
    width: 120,
    height: 120,
    borderColor: "rgba(226,177,60, 0.35)",
  },
  soundwaveRing2: {
    width: 140,
    height: 140,
    borderColor: "rgba(226,177,60, 0.18)",
  },
  ambientGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(226,177,60, 0.22)",
    shadowColor: Color.gold500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 15,
  },
  vinylDisc: {
    width: 90,
    height: 90,
    borderRadius: Radius.pill,
    backgroundColor: "#11100D",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 12,
  },
  grooveOuter: {
    position: "absolute",
    width: 74,
    height: 74,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  grooveMid: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  grooveInner: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  eqRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 5,
    height: 30,
    marginTop: Space.s5,
  },
  eqBar: {
    width: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
  },
  eqBarCenter: {
    backgroundColor: Color.gold300,
  },

  textContainer: {
    alignItems: "center",
    marginTop: Space.s4,
    maxWidth: 320,
  },
  liveBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(226,177,60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(226,177,60, 0.25)",
    paddingHorizontal: Space.s3,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    marginBottom: Space.s2,
  },
  liveBadgeText: {
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  quoteText: {
    lineHeight: 22,
    fontWeight: "600",
  },
});
