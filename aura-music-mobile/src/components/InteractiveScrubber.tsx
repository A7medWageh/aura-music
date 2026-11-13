import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
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
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const pendingSeekTimeoutRef = useRef<any>(null);
  const [barWidth, setBarWidth] = useState(0);
  const barLayoutRef = useRef<{ x: number; width: number }>({ x: 0, width: 0 });
  const barLeftRef = useRef<number>(0);
  const touchRef = useRef<any>(null);

  useEffect(() => {
    if (pendingSeek !== null) {
      if (Math.abs(position - pendingSeek) <= 1.0) {
        setPendingSeek(null);
        if (pendingSeekTimeoutRef.current) clearTimeout(pendingSeekTimeoutRef.current);
      }
    }
  }, [position, pendingSeek]);

  useEffect(() => {
    return () => {
      if (pendingSeekTimeoutRef.current) clearTimeout(pendingSeekTimeoutRef.current);
    };
  }, []);

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

  const calculateSecondsFromX = useCallback(
    (currentX: number) => {
      const width = barLayoutRef.current.width || barWidth;
      if (!width || width <= 0 || !duration || duration <= 0) return 0;
      const clampedX = Math.max(0, Math.min(width, isFinite(currentX) ? currentX : 0));
      // Standard LTR audio timeline: 0 at left edge, full duration at right edge
      const fraction = clampedX / width;
      const target = fraction * duration;
      return isFinite(target) && !isNaN(target) ? target : 0;
    },
    [barWidth, duration]
  );

  // PanResponder is created once; route through refs so drags always use the
  // latest duration/position instead of the values captured on mount.
  const calcXRef = useRef(calculateSecondsFromX);
  calcXRef.current = calculateSecondsFromX;
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

        const native = evt.nativeEvent as any;
        const locX = typeof native.locationX === "number" && isFinite(native.locationX) ? native.locationX : NaN;
        const pageX = typeof native.pageX === "number" && isFinite(native.pageX) ? native.pageX : NaN;

        if (isFinite(pageX) && isFinite(locX)) {
          barLeftRef.current = pageX - locX;
        } else if (isFinite(barLayoutRef.current.x)) {
          barLeftRef.current = barLayoutRef.current.x;
        }

        const startX = isFinite(locX) ? locX : (isFinite(pageX) ? pageX - barLeftRef.current : 0);
        const target = calcXRef.current(startX);
        setDragSeconds(target);
      },
      onPanResponderMove: (
        evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        if (!durationRef.current || durationRef.current <= 0) return;
        const currentX = gestureState.moveX - barLeftRef.current;
        const target = calcXRef.current(currentX);
        setDragSeconds(target);
      },
      onPanResponderRelease: (
        evt: GestureResponderEvent,
        gestureState: PanResponderGestureState
      ) => {
        setIsDragging(false);
        if (!durationRef.current || durationRef.current <= 0) return;

        // If dragged use moveX, if single tap without movement use locationX
        let finalX = gestureState.moveX - barLeftRef.current;
        if (Math.abs(gestureState.dx) < 2) {
          const locX = (evt.nativeEvent as any)?.locationX;
          if (typeof locX === "number" && isFinite(locX)) {
            finalX = locX;
          }
        }

        const target = calcXRef.current(finalX);
        if (isFinite(target) && !isNaN(target)) {
          setPendingSeek(target);
          if (pendingSeekTimeoutRef.current) clearTimeout(pendingSeekTimeoutRef.current);
          pendingSeekTimeoutRef.current = setTimeout(() => {
            setPendingSeek(null);
          }, 3000);
          onSeekRef.current(target);
        }
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const currentDisplay = isDragging ? dragSeconds : (pendingSeek !== null ? pendingSeek : position);
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
        <View style={styles.track} pointerEvents="none">
          {/* Progress Fill */}
          <View style={[styles.fill, { width: `${progressPercent}%` }]}>
            <LinearGradient
              colors={[Color.gold700, accent, Color.gold300]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>

        {/* Thumb Handle: strictly Left-to-Right timeline matching universal media players */}
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              left: `${progressPercent}%`,
              marginLeft: -7,
              backgroundColor: accent,
              transform: [{ translateY: -7 }, { scale: isDragging ? 1.3 : 1 }],
            },
          ]}
        >
          <View style={styles.thumbHalo} />
        </View>
      </View>

      {/* Time Row: 0:00 on the left, remaining on the right */}
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
    direction: "ltr",
  },
  touchArea: {
    width: "100%",
    height: 36,
    justifyContent: "center",
    position: "relative",
    direction: "ltr",
  },
  track: {
    width: "100%",
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink4,
    overflow: "hidden",
    position: "relative",
    direction: "ltr",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  thumb: {
    position: "absolute",
    top: 18,
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
    direction: "ltr",
  },
  timeText: {
    fontFamily: "Plex_500",
    fontSize: 12,
    color: Color.text_secondary,
    fontVariant: ["tabular-nums"],
  },
});
