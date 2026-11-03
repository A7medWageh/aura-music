import React, { useCallback } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Motion } from "@/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Feedback = "selection" | "impact" | "medium" | "none";

interface AuraTouchProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  feedback?: Feedback;
  pressedScale?: number;
  children?: React.ReactNode;
}

export const AuraTouch: React.FC<AuraTouchProps> = ({
  style,
  feedback = "selection",
  pressedScale = 0.965,
  onPress,
  children,
  ...rest
}) => {
  const scale = useSharedValue(1);

  const onPressureChange = useCallback(
    (pressed: boolean) => {
      scale.value = withSpring(pressed ? pressedScale : 1, Motion.spring);
    },
    [scale, pressedScale],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(
    (event: Parameters<NonNullable<PressableProps["onPress"]>>[0]) => {
      if (feedback === "selection") {
        Haptics.selectionAsync().catch(() => {});
      } else if (feedback === "impact") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else if (feedback === "medium") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      onPress?.(event);
    },
    [feedback, onPress],
  );

  return (
    <AnimatedPressable
      {...rest}
      onPress={handlePress}
      onPressIn={() => onPressureChange(true)}
      onPressOut={() => onPressureChange(false)}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
};
