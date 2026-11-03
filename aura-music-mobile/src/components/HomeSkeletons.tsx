import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, useWindowDimensions } from "react-native";
import { Color, Radius, Space } from "@/theme";

export const HomeSkeletons: React.FC = () => {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 620);
  const heroWidth = contentWidth - Space.s4 * 2;
  const heroHeight = Math.max(220, Math.min(heroWidth / 1.35, 300));

  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      {/* Hero Banner Skeleton */}
      <View style={[styles.heroWrap, { width: heroWidth, height: heroHeight }]}>
        <Animated.View style={[styles.skeletonBlock, { width: "100%", height: "100%", opacity: pulseAnim }]} />
      </View>

      {/* Artist Row Header Skeleton */}
      <View style={styles.headerWrap}>
        <Animated.View style={[styles.skeletonBar, { width: 140, height: 16, opacity: pulseAnim }]} />
        <Animated.View style={[styles.skeletonBar, { width: 80, height: 12, marginTop: 6, opacity: pulseAnim }]} />
      </View>

      {/* Artist Coins Skeleton */}
      <View style={styles.artistRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.artistItem}>
            <Animated.View style={[styles.artistCircle, { opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonBar, { width: 56, height: 10, marginTop: 8, opacity: pulseAnim }]} />
          </View>
        ))}
      </View>

      {/* Trending Header Skeleton */}
      <View style={[styles.headerWrap, { marginTop: Space.s5 }]}>
        <Animated.View style={[styles.skeletonBar, { width: 180, height: 18, opacity: pulseAnim }]} />
      </View>

      {/* Trending Rows Skeleton */}
      <View style={styles.chartWrap}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.chartRow}>
            <Animated.View style={[styles.skeletonBlock, { width: 44, height: 44, borderRadius: Radius.md, opacity: pulseAnim }]} />
            <View style={styles.chartCol}>
              <Animated.View style={[styles.skeletonBar, { width: "70%", height: 14, opacity: pulseAnim }]} />
              <Animated.View style={[styles.skeletonBar, { width: "40%", height: 10, marginTop: 6, opacity: pulseAnim }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.s4,
    paddingTop: Space.s4,
  },
  heroWrap: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    alignSelf: "center",
    marginBottom: Space.s5,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  skeletonBlock: {
    backgroundColor: Color.ink2,
  },
  skeletonBar: {
    backgroundColor: Color.ink2,
    borderRadius: Radius.pill,
  },
  headerWrap: {
    marginBottom: Space.s3,
  },
  artistRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Space.s5,
  },
  artistItem: {
    alignItems: "center",
  },
  artistCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  chartWrap: {
    backgroundColor: Color.ink1,
    borderRadius: Radius.lg,
    padding: Space.s3,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingVertical: Space.s2,
  },
  chartCol: {
    flex: 1,
  },
});

