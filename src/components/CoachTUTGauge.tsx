import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring
} from 'react-native-reanimated';
import { useTheme } from '@/lib/settings';

/**
 * A refined "Chronograph" Gauge for Time Under Tension.
 * Smaller size with centered dial and better zone visibility.
 */

interface CoachTUTGaugeProps {
  averagePace: number; // seconds per rep
  isLarge: boolean;
}

export function CoachTUTGauge({ averagePace, isLarge }: CoachTUTGaugeProps) {
  const theme = useTheme();
  // Compact size to fit everything on one page
  const size = isLarge ? 85 : 75;
  const radius = size / 2;

  // Rotation from -90 (1s) to +90 (8s+)
  const rotation = useSharedValue(-90);

  useEffect(() => {
    // 1s = -90, 4.5s = 0, 8s = 90
    const clampedPace = Math.max(1, Math.min(8, averagePace));
    const targetRotation = ((clampedPace - 1) / (8 - 1)) * 180 - 90;
    rotation.value = withSpring(targetRotation, { damping: 15 });
  }, [averagePace]);

  const needleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: size / 2.5 }, // Offset to pivot around the logical center
      { rotate: `${rotation.value}deg` },
      { translateY: -size / 2.5 },
    ],
  }));

  const label = averagePace <= 0 ? 'NO DATA' : averagePace < 2.8
    ? 'POWER'
    : averagePace < 5.8
    ? 'GROWTH'
    : 'CONTROL';

  const zoneColor = averagePace <= 0 ? theme.subText : averagePace < 2.8
    ? '#3b82f6' // blue
    : averagePace < 5.8
    ? '#22c55e' // green
    : '#a855f7'; // purple

  return (
    <View className="items-center justify-center">
      <View
        style={{ width: size, height: size / 2 + 5, overflow: 'hidden' }}
        className="items-center justify-end"
      >
        {/* The Arc Track */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: 8,
            borderColor: theme.divider,
            borderBottomColor: 'transparent',
            transform: [{ rotate: '-90deg' }]
          }}
        />

        {/* Zones (Blue, Green, Purple) */}
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#3b82f6', transform: [{ rotate: '-90deg' }], opacity: 0.25 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#22c55e', transform: [{ rotate: '-35deg' }], opacity: 0.25 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#a855f7', transform: [{ rotate: '35deg' }], opacity: 0.25 }} />

        {/* The Needle - Pivot perfectly in the center bottom */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 2.5,
              height: radius - 4,
              backgroundColor: zoneColor,
              bottom: 4,
              borderRadius: 2,
              shadowColor: '#000',
              shadowOpacity: 0.3,
              shadowRadius: 2,
              elevation: 4
            },
            needleStyle
          ]}
        />

        {/* Pivot Point */}
        <View
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.text,
            bottom: -2,
            borderWidth: 2,
            borderColor: theme.card
          }}
        />
      </View>

      {/* Tiny Zone Labels inside the card */}
      <View className="flex-row items-center mt-1">
        <Text style={{ color: zoneColor, fontSize: isLarge ? 10 : 9 }} className="font-black uppercase tracking-tighter">
          {label}
        </Text>
      </View>

      {averagePace > 0 && (
        <Text style={{ color: theme.text, fontSize: isLarge ? 12 : 11 }} className="font-bold">
          {averagePace.toFixed(1)}s <Text className="font-normal opacity-50">/ rep</Text>
        </Text>
      )}
    </View>
  );
}
