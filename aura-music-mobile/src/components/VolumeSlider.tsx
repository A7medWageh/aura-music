import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type LayoutChangeEvent,
} from "react-native";
import { Color, Radius } from "@/theme";

interface VolumeSliderProps {
  value: number;
  onChange: (value: number) => void;
  accent?: string;
  disabled?: boolean;
}

export function VolumeSlider({
  value,
  onChange,
  accent = Color.gold500,
  disabled = false,
}: VolumeSliderProps) {
  const widthRef = useRef(0);
  const wrapRef = useRef<any>(null);
  const boxRef = useRef({ left: 0, width: 0 });
  const barLeftRef = useRef<number>(0);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const measure = () => {
    const node: any = wrapRef.current;
    try {
      if (node?.getBoundingClientRect) {
        const rect = node.getBoundingClientRect();
        boxRef.current = { left: rect.left, width: rect.width };
      } else if (node?.measureInWindow) {
        node.measureInWindow((x: number, _y: number, w: number) => {
          boxRef.current = { left: x, width: w };
        });
      }
    } catch {
      /* fall back to onLayout width */
    }
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      widthRef.current = width;
      boxRef.current.width = width;
      measure();
    }
  };

  const calculateFractionFromX = (currentX: number) => {
    const width = boxRef.current.width || widthRef.current;
    if (!width || width <= 0) return 0;
    const clampedX = Math.max(0, Math.min(width, isFinite(currentX) ? currentX : 0));
    return Math.max(0, Math.min(1, clampedX / width));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (disabledRef.current) return;
        measure();
        setDragging(true);

        const native = evt.nativeEvent as any;
        const locX = typeof native.locationX === "number" && isFinite(native.locationX) ? native.locationX : NaN;
        const pageX = typeof native.pageX === "number" && isFinite(native.pageX) ? native.pageX : NaN;

        if (isFinite(pageX) && isFinite(locX)) {
          barLeftRef.current = pageX - locX;
        } else if (isFinite(boxRef.current.left)) {
          barLeftRef.current = boxRef.current.left;
        }

        const startX = isFinite(locX) ? locX : (isFinite(pageX) ? pageX - barLeftRef.current : 0);
        const next = calculateFractionFromX(startX);
        setDragValue(next);
        onChangeRef.current(next);
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (disabledRef.current) return;
        const currentX = gestureState.moveX - barLeftRef.current;
        const next = calculateFractionFromX(currentX);
        setDragValue(next);
        onChangeRef.current(next);
      },
      onPanResponderRelease: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (disabledRef.current) return;
        setDragging(false);

        let finalX = gestureState.moveX - barLeftRef.current;
        if (Math.abs(gestureState.dx) < 2) {
          const locX = (evt.nativeEvent as any)?.locationX;
          if (typeof locX === "number" && isFinite(locX)) {
            finalX = locX;
          }
        }

        const next = calculateFractionFromX(finalX);
        setDragValue(next);
        onChangeRef.current(next);
      },
      onPanResponderTerminate: () => setDragging(false),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const displayValue = dragging ? dragValue : value;
  const pct = Math.round(Math.max(0, Math.min(1, displayValue)) * 100);

  return (
    <View
      ref={wrapRef}
      style={[styles.wrap, disabled && styles.disabled]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: accent }]} />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            left: `${pct}%`,
            marginLeft: -6,
            transform: [{ scale: dragging ? 1.3 : 1 }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    height: 36,
    justifyContent: "center",
    position: "relative",
    direction: "ltr",
  },
  disabled: { opacity: 0.4 },
  track: {
    width: "100%",
    height: 6,
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
  },
  thumb: {
    position: "absolute",
    top: 12,
    width: 12,
    height: 12,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});
