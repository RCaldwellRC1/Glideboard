import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { useTheme } from '@/lib/settings';

/**
 * A "Gucci" round gauge for Time Under Tension (TUT).
 * Zones:
 * - EXPLOSIVE: 1.0s - 2.5s (Athletic Power)
 * - GROWTH: 3.0s - 5.5s (Hypertrophy)
 * - ENDURANCE: 6.0s+ (Density & Drive)
 */

interface CoachTUTGaugeProps {
  averagePace: number; // seconds per rep
  isLarge: boolean;
}

export function CoachTUTGauge({ averagePace, isLarge }: CoachTUTGaugeProps) {
  const theme = useTheme();
  const size = isLarge ? 120 : 100;
  const radius = size / 2;

  // Needle rotation calculation
  // 1s = -90deg, 4s = 0deg, 8s = 90deg
  const rotation = useSharedValue(-90);

  useEffect(() => {
    // Map averagePace to rotation range [-90, 90]
    // Clamped at 1s and 8s for visual stability
    const clampedPace = Math.max(1, Math.min(8, averagePace));
    const targetRotation = ((clampedPace - 1) / (8 - 1)) * 180 - 90;
    rotation.value = withSpring(targetRotation, { damping: 15 });
  }, [averagePace]);

  const needleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: size / 4 }, // move to center point
      { rotate: `${rotation.value}deg` },
      { translateY: -size / 4 }, // rotate around the base
    ],
  }));

  const label = averagePace < 2.8
    ? 'POWER'
    : averagePace < 5.8
    ? 'GROWTH'
    : 'CONTROL';

  const zoneColor = averagePace < 2.8
    ? '#3b82f6' // blue
    : averagePace < 5.8
    ? '#22c55e' // green
    : '#a855f7'; // purple

  return (
    <View className="items-center justify-center">
      <View
        style={{ width: size, height: size / 2 + 10, overflow: 'hidden' }}
        className="items-center justify-end"
      >
        {/* The Semi-Circle Track */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: 10,
            borderColor: theme.divider,
            borderBottomColor: 'transparent',
            transform: [{ rotate: '-90deg' }]
          }}
        />

        {/* Colored Zones (Simplified using borders) */}
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: '#3b82f6', transform: [{ rotate: '-90deg' }], opacity: 0.3 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: '#22c55e', transform: [{ rotate: '-30deg' }], opacity: 0.3 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: '#a855f7', transform: [{ rotate: '30deg' }], opacity: 0.3 }} />

        {/* The Needle */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 3,
              height: radius - 5,
              backgroundColor: zoneColor,
              bottom: 10,
              borderRadius: 2,
              shadowColor: '#000',
              shadowOpacity: 0.3,
              shadowRadius: 2,
              elevation: 3
            },
            needleStyle
          ]}
        />

        {/* Center Pin */}
        <View
          style={{
            position: 'absolute',
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: theme.text,
            bottom: 4,
            borderWidth: 2,
            borderColor: theme.card
          }}
        />
      </View>

      {/* Speed Readout */}
      <Text style={{ color: zoneColor, fontSize: isLarge ? 12 : 10 }} className="font-black uppercase tracking-tighter mt-1">
        {label}
      </Text>
      <Text style={{ color: theme.text, fontSize: isLarge ? 14 : 12 }} className="font-bold">
        {averagePace.toFixed(1)}s <Text className="font-normal opacity-50">/ rep</Text>
      </Text>
    </View>
  );
}
