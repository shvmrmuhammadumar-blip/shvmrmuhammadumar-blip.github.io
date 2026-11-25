import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  size?: number;
  active?: boolean;
  color?: string;
};

export default function LumoLikeIcon({
  size = 24,
  active = false,
  color,
}: Props) {
  const tint = color ?? (active ? "#B9C7D6" : "#F2F5F7");
  const pulse = useRef(new Animated.Value(0)).current;
  const previousActive = useRef(active);

  useEffect(() => {
    if (previousActive.current === active) return;
    previousActive.current = active;
    pulse.stopAnimation();

    if (!active) {
      Animated.timing(pulse, {
        toValue: 0,
        duration: 90,
        useNativeDriver: true,
      }).start();
      return () => pulse.stopAnimation();
    }

    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 115,
        useNativeDriver: true,
      }),
      Animated.spring(pulse, {
        toValue: 0,
        stiffness: 240,
        damping: 10,
        mass: 0.65,
        useNativeDriver: true,
      }),
    ]).start();

    return () => pulse.stopAnimation();
  }, [active, pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });
  const rotation = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ["-10deg", "5deg"],
  });

  return (
    <Animated.View
      accessible={false}
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale }, { rotate: rotation }],
      }}
    >
      <Ionicons
        name={active ? "heart" : "heart-outline"}
        size={size}
        color={tint}
      />
    </Animated.View>
  );
}
