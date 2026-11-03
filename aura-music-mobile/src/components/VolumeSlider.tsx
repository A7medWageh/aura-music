import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  type GestureResponderEvent,
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
  const [dragging, setDragging] = useState(false);

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

  const valueFromEvent = (evt: GestureResponderEvent) => {
    const width = boxRef.current.width || widthRef.current;
    if (!width) return 0;
    const native = evt.nativeEvent as any;
    const pageX = typeof native.pageX === "number" ? native.pageX : NaN;
    const pageLeft =
      typeof window !== "undefined" ? boxRef.current.left + (window.scrollX || 0) : boxRef.current.left;
    const rawX = isFinite(pageX) ? pageX - pageLeft : native.locationX;
    const x = Math.max(0, Math.min(width, isFinite(rawX) ? rawX : 0));
    // The slider runs right-to-left like the rest of the Arabic UI.
    return 1 - x / width;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant: (evt) => {
        if (disabledRef.current) return;
        measure();
        setDragging(true);
        onChangeRef.current(valueFromEvent(evt));
      },
      onPanResponderMove: (evt) => {
        if (disabledRef.current) return;
        onChangeRef.current(valueFromEvent(evt));
      },
      onPanResponderRelease: (evt) => {
        if (disabledRef.current) return;
        setDragging(false);
        onChangeRef.current(valueFromEvent(evt));
      },
      onPanResponderTerminate: () => setDragging(false),
    }),
  ).current;

  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <View
      ref={wrapRef}
      style={[styles.wrap, disabled && styles.disabled]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: accent }]} />
      </View>
      <View
        style={[
          styles.thumb,
          {
            right: `${pct}%`,
            marginRight: -5,
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
    height: 30,
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  track: {
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.pill,
  },
  thumb: {
    position: "absolute",
    top: 10,
    width: 10,
    height: 10,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold100,
  },
});
