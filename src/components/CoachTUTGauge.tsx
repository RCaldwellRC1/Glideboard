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
  // Fixed size for the gauge face
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

  // Ultra-vibrant iOS colors
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
        style={{ width: size, height: radius + 10 }}
        className="items-center overflow-hidden"
      >
        {/* The Arc Track - Full vibrancy */}
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

        {/* High-Vibrancy Zones - Solid colors with high opacity */}
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: blue, top: 0, left: 0, transform: [{ rotate: '-90deg' }], opacity: 0.9 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: green, top: 0, left: 0, transform: [{ rotate: '-35deg' }], opacity: 0.9 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 10, borderColor: 'transparent', borderTopColor: purple, top: 0, left: 0, transform: [{ rotate: '35deg' }], opacity: 0.9 }} />

        {/* The Needle - Pivot exactly at horizontal center */}
        <View style={{ position: 'absolute', top: radius, width: size, height: radius, alignItems: 'center' }}>
          <Animated.View
            style={[
              {
                height: radius * 2,
                width: 4,
                alignItems: 'center',
                justifyContent: 'flex-start',
                top: -radius,
              },
              needleStyle
            ]}
          >
             <View
               style={{
                 width: 3.5,
                 height: radius - 2,
                 backgroundColor: zoneColor,
                 borderRadius: 2,
                 shadowColor: '#000',
                 shadowOpacity: 0.5,
                 shadowRadius: 5,
                 elevation: 8,
                 borderWidth: 0.5,
                 borderColor: '#fff'
               }}
             />
          </Animated.View>
        </View>

        {/* The Center Pin - Pushed slightly down so it's fully visible at the bottom of the cut */}
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
            zIndex: 50,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 3,
            elevation: 4
          }}
        />
      </View>

      <Text style={{ color: zoneColor, fontSize: isLarge ? 11 : 10, marginTop: 8 }} className="font-black uppercase tracking-tighter">
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
