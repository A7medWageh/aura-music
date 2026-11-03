import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export interface AuraFadeInProps {
  delay?: number;
  duration?: number;
  slideDistance?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  scale?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * High-performance, silky smooth entrance animation component.
 * Staggers element appearances when screens or sections finish loading.
 */
export const AuraFadeIn: React.FC<AuraFadeInProps> = ({
  delay = 0,
  duration = 380,
  slideDistance = 16,
  direction = "up",
  scale = false,
  style,
  children,
}) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [delay, duration, anim]);

  const opacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const transforms: any[] = [];

  if (direction === "up") {
    transforms.push({
      translateY: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [slideDistance, 0],
      }),
    });
  } else if (direction === "down") {
    transforms.push({
      translateY: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [-slideDistance, 0],
      }),
    });
  } else if (direction === "left") {
    transforms.push({
      translateX: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [slideDistance, 0],
      }),
    });
  } else if (direction === "right") {
    transforms.push({
      translateX: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [-slideDistance, 0],
      }),
    });
  }

  if (scale) {
    transforms.push({
      scale: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.96, 1],
      }),
    });
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: transforms.length > 0 ? transforms : undefined,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

