import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Color, Radius, Space } from "@/theme";

interface InteractiveScrubberProps {
  position: number; // in seconds
  duration: number; // in seconds
  onSeek: (targetSeconds: number) => void;
  accent?: string;
}

export function InteractiveScrubber({
  position,
  duration,
  onSeek,
  accent = Color.gold500,
}: InteractiveScrubberProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragSeconds, setDragSeconds] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const barLayoutRef = useRef<{ x: number; width: number }>({ x: 0, width: 0 });
  const touchRef = useRef<any>(null);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const measureBar = () => {
    const node: any = touchRef.current;
    try {
      if (node?.getBoundingClientRect) {
        const rect = node.getBoundingClientRect();
        barLayoutRef.current = { x: rect.left, width: rect.width };
      } else if (node?.measureInWindow) {
        node.measureInWindow((x: number, _y: number, w: number) => {
          barLayoutRef.current = { x, width: w };
        });
      }
    } catch {
      /* fall back to onLayout width */
    }
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      setBarWidth(width);
      barLayoutRef.current = { ...barLayoutRef.current, width };
      measureBar();
    }
  };

  const calculateSecondsFromEvent = useCallback(
    (evt: GestureResponderEvent) => {
      const width = barLayoutRef.current.width || barWidth;
      if (!width || width <= 0 || !duration || duration <= 0) return 0;
      const native = evt.nativeEvent as any;
      const pageX = typeof native.pageX === "number" ? native.pageX : NaN;
      const pageLeft =
        typeof window !== "undefined" ? barLayoutRef.current.x + (window.scrollX || 0) : barLayoutRef.current.x;
      const rawX = isFinite(pageX) ? pageX - pageLeft : native.locationX;
      const clampedX = Math.max(0, Math.min(width, isFinite(rawX) ? rawX : 0));
      // The track runs right-to-left (Arabic-first UI) while locationX is always measured from the
      // left edge, so the fraction is inverted.
      const fraction = 1 - clampedX / width;
      const target = fraction * duration;
      return isFinite(target) && !isNaN(target) ? target : 0;
    },
    [barWidth, duration]
  );

  // PanResponder is created once; route through refs so drags always use the
  // latest duration/position instead of the values captured on mount.
  const calcRef = useRef(calculateSecondsFromEvent);
  calcRef.current = calculateSecondsFromEvent;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (!durationRef.current || durationRef.current <= 0) return;
        measureBar();
        setIsDragging(true);
        const target = calcRef.current(evt);
        setDragSeconds(target);
      },
      onPanResponderMove: (
        evt: GestureResponderEvent,
        _gestureState: PanResponderGestureState
      ) => {
        if (!durationRef.current || durationRef.current <= 0) return;
        const target = calcRef.current(evt);
        setDragSeconds(target);
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        setIsDragging(false);
        if (!durationRef.current || durationRef.current <= 0) return;
        const target = calcRef.current(evt);
        if (isFinite(target) && !isNaN(target)) {
          onSeekRef.current(target);
        }
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
    })
  ).current;

  const currentDisplay = isDragging ? dragSeconds : position;
  const clampedDisplay = Math.max(0, Math.min(duration || 0, currentDisplay));
  const remainingTime = Math.max(0, (duration || 0) - clampedDisplay);
  const progressPercent =
    duration > 0 && isFinite(duration)
      ? Math.max(0, Math.min(100, (clampedDisplay / duration) * 100))
      : 0;

  return (
    <View style={styles.container}>
      {/* Touch Area */}
      <View
        ref={touchRef}
        style={styles.touchArea}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {/* Track Background */}
        <View style={styles.track}>
          {/* Progress Fill */}
          <View style={[styles.fill, { width: `${progressPercent}%` }]}>
            <LinearGradient
              colors={[Color.gold700, accent, Color.gold300]}
              start={{ x: 1, y: 0.5 }}
              end={{ x: 0, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>

        {/* Thumb Handle: anchored to the fill's starting edge. Native mirrors `start` under RTL
            while web always reads it as left, so web names the right edge directly. */}
        <View
          style={[
            styles.thumb,
            Platform.OS === "web"
              ? { right: `${progressPercent}%`, marginRight: -7 }
              : { start: `${progressPercent}%`, marginStart: -7 },
            {
              backgroundColor: accent,
              transform: [{ translateY: -7 }, { scale: isDragging ? 1.3 : 1 }],
            },
          ]}
        >
          <View style={styles.thumbHalo} />
        </View>
      </View>

      {/* Time Row */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(clampedDisplay)}</Text>
        <Text style={styles.timeText}>-{formatTime(remainingTime)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    paddingHorizontal: Space.s2,
    marginVertical: Space.s1,
  },
  touchArea: {
    width: "100%",
    height: 34,
    justifyContent: "center",
    position: "relative",
  },
  track: {
    width: "100%",
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    top: 17,
    width: 14,
    height: 14,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: Color.gold100,
    shadowColor: Color.gold500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 4,
  },
  thumbHalo: {
    position: "absolute",
    left: -8,
    right: -8,
    top: -8,
    bottom: -8,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldGlow,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Space.s1,
    paddingHorizontal: 2,
  },
  timeText: {
    fontFamily: "Plex_500",
    fontSize: 12,
    color: Color.text_secondary,
    fontVariant: ["tabular-nums"],
  },
});

