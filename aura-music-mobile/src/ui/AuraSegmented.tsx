import React, { useLayoutEffect, useState } from "react";
import { I18nManager, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Color, Motion, Radius } from "@/theme";
import { AuraText } from "./AuraText";
import { AuraTouch } from "./AuraTouch";

export interface SegmentItem {
  id: string;
  label: string;
}

interface SegmentedProps {
  items: SegmentItem[];
  value: string;
  onChange: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}

export const AuraSegmented: React.FC<SegmentedProps> = ({
  items,
  value,
  onChange,
  style,
}) => {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    items.findIndex((i) => i.id === value),
  );
  const cell = width > 0 ? (width - 8) / Math.max(1, items.length) : 0;
  const target = useSharedValue(0);

  useLayoutEffect(() => {
    target.value = cell * index;
  }, [cell, index, target]);

  // Translation is physical while the anchor below is logical; web mirrors through document.dir.
  const direction = Platform.OS === "web" || I18nManager.isRTL ? -1 : 1;
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: direction * target.value }],
    width: cell || 1,
  }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        {
          alignSelf: "stretch",
          height: 42,
          borderRadius: Radius.pill,
          backgroundColor: Color.ink1,
          borderWidth: 1,
          borderColor: Color.veil_hairline,
          padding: 4,
        },
        style,
      ]}
    >
      {!!cell && (
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 4,
              bottom: 4,
              // On web `start` always resolves to left; the row itself mirrors through document.dir.
              ...(Platform.OS === "web" ? { right: 4 } : { start: 4 }),
              borderRadius: Radius.pill,
              backgroundColor: Color.veil_goldTintStrong,
              borderWidth: 1,
              borderColor: Color.veil_goldHairline,
            },
            indicatorStyle,
          ]}
        />
      )}
      <View style={{ flex: 1, flexDirection: "row" }}>
        {items.map((item) => {
          const active = item.id === value;
          return (
            <AuraTouch
              key={item.id}
              onPress={() => onChange(item.id)}
              feedback="selection"
              pressedScale={1}
              style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
            >
              <AuraText
                role="label"
                color={active ? Color.gold100 : Color.text_muted}
                lines={1}
              >
                {item.label}
              </AuraText>
            </AuraTouch>
          );
        })}
      </View>
    </View>
  );
};

interface PlayPulseProps {
  playing: boolean;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const BARS = [
  { key: "a", duration: 420, delay: 0 },
  { key: "b", duration: 310, delay: 120 },
  { key: "c", duration: 380, delay: 60 },
] as const;

export const AuraPlayPulse: React.FC<PlayPulseProps> = ({
  playing,
  size = 12,
  color = Color.gold500,
  style,
}) => {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 2,
          height: size,
        },
        style,
      ]}
    >
      {BARS.map((bar) => (
        <PulseBar
          key={bar.key}
          width={Math.max(2, size / 5)}
          height={size}
          color={color}
          duration={bar.duration}
          delay={bar.delay}
          playing={playing}
        />
      ))}
    </View>
  );
};

const PulseBar: React.FC<{
  width: number;
  height: number;
  color: string;
  duration: number;
  delay: number;
  playing: boolean;
}> = ({ width, height, color, duration, delay, playing }) => {
  const level = useSharedValue(0.3);

  useLayoutEffect(() => {
    if (!playing) {
      cancelAnimation(level);
      level.value = withTiming(0.3, { duration: 180 });
      return;
    }
    level.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
    return () => cancelAnimation(level);
  }, [playing, duration, delay, level]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: level.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: Radius.sm,
          backgroundColor: color,
          transformOrigin: "bottom",
        },
        barStyle,
      ]}
    />
  );
};
