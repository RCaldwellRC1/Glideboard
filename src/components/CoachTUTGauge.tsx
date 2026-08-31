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
 * Precision analogue feel with high-vibrancy zones.
 */

interface CoachTUTGaugeProps {
  averagePace: number; // seconds per rep
  isLarge: boolean;
}

export function CoachTUTGauge({ averagePace, isLarge }: CoachTUTGaugeProps) {
  const theme = useTheme();
  // Dimensions
  const size = isLarge ? 86 : 76;
  const radius = size / 2;

  // Rotation: 1s = -90, 4.5s = 0, 8s = 90
  const rotation = useSharedValue(-90);

  useEffect(() => {
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

  // Ultra-vibrant colors
  const blue = '#007AFF';
  const green = '#34C759';
  const purple = '#AF52DE';

  const zoneColor = averagePace <= 0 ? theme.subText : averagePace < 2.8
    ? blue
    : averagePace < 5.8
    ? green
    : purple;

  return (
    <View className="items-center justify-center">
      <View
        style={{ width: size, height: radius + 8 }}
        className="items-center overflow-hidden"
      >
        {/* Track Arc - Solid background */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: 10,
            borderColor: theme.divider,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />

        {/* Vibrant Zone Segments - Top border arcs */}
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: blue, top: 0, left: 0, transform: [{ rotate: '-90deg' }], opacity: 1 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: green, top: 0, left: 0, transform: [{ rotate: '-35deg' }], opacity: 1 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: purple, top: 0, left: 0, transform: [{ rotate: '35deg' }], opacity: 1 }} />

        {/* The Needle Layer - Pivot is at arc center (top: radius) */}
        <View style={{ position: 'absolute', top: radius, width: size, height: 2, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[
              {
                width: size,
                height: size, // Rotating a square container centered on the pivot
                alignItems: 'center',
                justifyContent: 'flex-start',
              },
              needleStyle
            ]}
          >
             {/* The actual physical needle line (top half of container) */}
             <View
               style={{
                 width: 3.5,
                 height: radius - 3,
                 backgroundColor: zoneColor,
                 borderRadius: 2,
                 shadowColor: '#000',
                 shadowOpacity: 0.5,
                 shadowRadius: 5,
                 elevation: 8,
                 borderWidth: 0.8,
                 borderColor: '#fff',
                 marginTop: 3, // Tiny gap from the arc
               }}
             />
          </Animated.View>
        </View>

        {/* The Center Pin - Pushed slightly up to be centered at bottom edge of overflow */}
        <View
          style={{
            position: 'absolute',
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: theme.text,
            top: radius - 7,
            left: radius - 7,
            borderWidth: 2,
            borderColor: theme.card,
            zIndex: 60,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 3,
            elevation: 4
          }}
        />
      </View>

      <Text style={{ color: zoneColor, fontSize: isLarge ? 11 : 10, marginTop: 10 }} className="font-black uppercase tracking-tighter">
        {label}
      </Text>

      {averagePace > 0 && (
        <Text style={{ color: theme.text, fontSize: isLarge ? 14 : 12 }} className="font-bold">
          {averagePace.toFixed(1)} <Text className="font-normal opacity-50">s/rep</Text>
        </Text>
      )}
    </View>
  );
}
