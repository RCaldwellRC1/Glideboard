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
 * Dial and Pivot aligned for an authentic analogue feel.
 */

interface CoachTUTGaugeProps {
  averagePace: number; // seconds per rep
  isLarge: boolean;
}

export function CoachTUTGauge({ averagePace, isLarge }: CoachTUTGaugeProps) {
  const theme = useTheme();
  // Compact sizes to keep report on one page
  const size = isLarge ? 80 : 70;
  const radius = size / 2;

  // Rotation from -90 (1s) to +90 (8s+)
  const rotation = useSharedValue(-90);

  useEffect(() => {
    // Range: 1s to 8s. Center (0 deg) is 4.5s
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

  const zoneColor = averagePace <= 0 ? theme.subText : averagePace < 2.8
    ? '#3b82f6' // blue
    : averagePace < 5.8
    ? '#22c55e' // green
    : '#a855f7'; // purple

  return (
    <View className="items-center justify-center">
      <View
        style={{ width: size, height: size / 2 + 10 }}
        className="items-center justify-end overflow-hidden"
      >
        {/* Track Arc */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: 8,
            borderColor: theme.divider,
            position: 'absolute',
            bottom: -radius / 2, // Centered vertically in the overflow-hidden view
            left: 0,
          }}
        />

        {/* Colored Zones (using border arc segments) */}
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#3b82f6', bottom: -radius/2, left: 0, transform: [{ rotate: '-90deg' }], opacity: 0.25 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#22c55e', bottom: -radius/2, left: 0, transform: [{ rotate: '-35deg' }], opacity: 0.25 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#a855f7', bottom: -radius/2, left: 0, transform: [{ rotate: '35deg' }], opacity: 0.25 }} />

        {/* The Needle - Container rotated around center */}
        <View style={{ position: 'absolute', bottom: radius/2, height: radius, width: size, alignItems: 'center' }}>
          <Animated.View
            style={[
              {
                height: radius * 2, // Full diameter for center pivot
                width: 3,
                alignItems: 'center',
                justifyContent: 'flex-start',
              },
              needleStyle
            ]}
          >
             {/* The physical needle line (only top half) */}
             <View
               style={{
                 width: 3,
                 height: radius - 4,
                 backgroundColor: zoneColor,
                 borderRadius: 2,
                 shadowColor: '#000',
                 shadowOpacity: 0.3,
                 shadowRadius: 2,
                 elevation: 4
               }}
             />
          </Animated.View>
        </View>

        {/* Pivot Point - Exactly at the center of the arc */}
        <View
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.text,
            bottom: radius / 2 - 5,
            left: (size / 2) - 5,
            borderWidth: 2,
            borderColor: theme.card,
            zIndex: 30
          }}
        />
      </View>

      <Text style={{ color: zoneColor, fontSize: isLarge ? 10 : 9, marginTop: 4 }} className="font-black uppercase tracking-tighter">
        {label}
      </Text>

      {averagePace > 0 && (
        <Text style={{ color: theme.text, fontSize: isLarge ? 12 : 11 }} className="font-bold">
          {averagePace.toFixed(1)}s <Text className="font-normal opacity-50">/ rep</Text>
        </Text>
      )}
    </View>
  );
}
