import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export interface AuraPageTransitionProps {
  duration?: number;
  slideOffset?: number;
  scaleFrom?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Screen-level page transition wrapper.
 * Delivers buttery smooth fade & glide entrance transitions across all routes and tabs,
 * guaranteeing a native app feel on both mobile and web.
 */
export const AuraPageTransition: React.FC<AuraPageTransitionProps> = ({
  duration = 280,
  slideOffset = 10,
  scaleFrom = 0.992,
  style,
  children,
}) => {
  const transitionAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    transitionAnim.setValue(0);
    Animated.timing(transitionAnim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [duration, transitionAnim]);

  const opacity = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const translateY = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [slideOffset, 0],
  });

  const scale = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [scaleFrom, 1],
  });

  return (
    <Animated.View
      style={[
        styles.full,
        style,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  full: {
    flex: 1,
  },
});

