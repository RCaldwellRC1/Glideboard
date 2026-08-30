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
 * Fixed pivot logic for stable needle alignment and vibrant colors.
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

  const zoneColor = averagePace <= 0 ? theme.subText : averagePace < 2.8
    ? '#007AFF' // Vibrant Blue
    : averagePace < 5.8
    ? '#32D74B' // Vibrant Green
    : '#AF52DE'; // Vibrant Purple

  return (
    <View className="items-center justify-center pt-2">
      <View
        style={{ width: size, height: radius + 5, overflow: 'hidden' }}
        className="items-center justify-end"
      >
        {/* Background Track Arc */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: 8,
            borderColor: theme.divider,
            position: 'absolute',
            bottom: 0,
            left: 0,
          }}
        />

        {/* Colored Zones - High Vibrancy */}
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#007AFF', bottom: 0, left: 0, transform: [{ rotate: '-90deg' }], opacity: 0.5 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#32D74B', bottom: 0, left: 0, transform: [{ rotate: '-35deg' }], opacity: 0.5 }} />
        <View style={{ position: 'absolute', width: size, height: size, borderRadius: radius, borderWidth: 8, borderColor: 'transparent', borderTopColor: '#AF52DE', bottom: 0, left: 0, transform: [{ rotate: '35deg' }], opacity: 0.5 }} />

        {/* The Needle - Pivot exactly at bottom-center */}
        <View style={{ position: 'absolute', bottom: 0, width: size, height: radius, alignItems: 'center' }}>
          <Animated.View
            style={[
              {
                height: radius * 2, // Rotate around the middle of this view
                width: 3,
                alignItems: 'center',
                justifyContent: 'flex-start',
                top: 0,
              },
              needleStyle
            ]}
          >
             <View
               style={{
                 width: 3,
                 height: radius - 4,
                 backgroundColor: zoneColor,
                 borderRadius: 2,
                 shadowColor: '#000',
                 shadowOpacity: 0.4,
                 shadowRadius: 3,
                 elevation: 5
               }}
             />
          </Animated.View>
        </View>

        {/* The Center Pin */}
        <View
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.text,
            bottom: -5,
            left: radius - 5,
            borderWidth: 2,
            borderColor: theme.card,
            zIndex: 40
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
