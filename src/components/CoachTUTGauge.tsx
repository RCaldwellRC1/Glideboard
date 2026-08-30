import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring
} from 'react-native-reanimated';
import { useTheme } from '@/lib/settings';

/**
 * A perfectly centered "Chronograph" Gauge for Time Under Tension.
 * Fixed pivot logic for stable needle alignment and high-vibrancy zones.
 */

interface CoachTUTGaugeProps {
  averagePace: number; // seconds per rep
  isLarge: boolean;
}

export function CoachTUTGauge({ averagePace, isLarge }: CoachTUTGaugeProps) {
  const theme = useTheme();
  // Compact sizes to keep report on one page
  const size = isLarge ? 84 : 74;
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
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const label = averagePace <= 0 ? 'NO DATA' : averagePace < 2.8
    ? 'POWER'
    : averagePace < 5.8
    ? 'GROWTH'
    : 'CONTROL';

  // Vibrant iOS-style palette
  const blue = '#007AFF';
  const green = '#34C759';
  const purple = '#AF52DE';

  const zoneColor = averagePace <= 0 ? theme.subText : averagePace < 2.8
    ? blue
    : averagePace < 5.8
    ? green
    : purple;

  return (
    <View className="items-center justify-center pt-2">
      <View
        style={{ width: size, height: radius + 2, overflow: 'hidden' }}
        className="items-center"
      >
        {/* Track - Top Half Arc */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: 9,
            borderColor: theme.divider,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />

        {/* High-Vibrancy Zones */}
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 9, borderColor: 'transparent', borderTopColor: blue, top: 0, left: 0, transform: [{ rotate: '-90deg' }], opacity: 0.8 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 9, borderColor: 'transparent', borderTopColor: green, top: 0, left: 0, transform: [{ rotate: '-35deg' }], opacity: 0.8 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 9, borderColor: 'transparent', borderTopColor: purple, top: 0, left: 0, transform: [{ rotate: '35deg' }], opacity: 0.8 }} />

        {/* The Needle - Pivot perfectly at the bottom-center of the visible arc */}
        <View style={{ position: 'absolute', top: radius, width: size, height: radius, alignItems: 'center' }}>
          <Animated.View
            style={[
              {
                height: radius * 2,
                width: 3,
                alignItems: 'center',
                justifyContent: 'flex-start',
                top: -radius, // Pivot is now exactly at the center of the arc
              },
              needleStyle
            ]}
          >
             <View
               style={{
                 width: 3,
                 height: radius - 3,
                 backgroundColor: zoneColor,
                 borderRadius: 2,
                 shadowColor: '#000',
                 shadowOpacity: 0.5,
                 shadowRadius: 4,
                 elevation: 6
               }}
             />
          </Animated.View>
        </View>

        {/* The Center Pin - Absolute alignment with arc center */}
        <View
          style={{
            position: 'absolute',
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: theme.text,
            top: radius - 6,
            left: radius - 6,
            borderWidth: 2,
            borderColor: theme.card,
            zIndex: 40,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 2,
            elevation: 2
          }}
        />
      </View>

      <Text style={{ color: zoneColor, fontSize: isLarge ? 11 : 10, marginTop: 6 }} className="font-black uppercase tracking-tighter">
        {label}
      </Text>

      {averagePace > 0 && (
        <Text style={{ color: theme.text, fontSize: isLarge ? 14 : 12 }} className="font-bold">
          {averagePace.toFixed(1)}s <Text className="font-normal opacity-50">/ rep</Text>
        </Text>
      )}
    </View>
  );
}
