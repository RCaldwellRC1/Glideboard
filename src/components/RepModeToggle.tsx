import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Activity, Mic } from 'lucide-react-native';
import { useTheme } from '@/lib/settings';

/**
 * A horizontal two-position switch that picks how reps are counted:
 *
 *   left   = MOTION  (accelerometer counts your reps)
 *   right  = VOICE   (you count out loud)
 *
 * Updated to horizontal layout for better space utilization.
 */
export function RepModeToggle({
  value,
  onToggle,
  disabled = false,
  disabledLabel,
  isLarge,
  labelOverride,
}: {
  value: 'motion' | 'voice';
  onToggle: () => void;
  disabled?: boolean;
  disabledLabel?: string;
  isLarge: boolean;
  labelOverride?: string;
}) {
  const theme = useTheme();
  const PAD = 2;
  const trackWidth = isLarge ? 80 : 88;
  const trackHeight = isLarge ? 32 : 36;
  const cellWidth = (trackWidth - PAD * 2) / 2;
  const iconSize = isLarge ? 15 : 17;

  const offset = useSharedValue(value === 'voice' ? 1 : 0);

  useEffect(() => {
    offset.value = withTiming(value === 'voice' ? 1 : 0, { duration: 180 });
  }, [value, offset]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value * cellWidth }],
  }));

  const activeColor = disabled ? '#4b5563' : '#f97316';
  const label = disabled ? (disabledLabel ?? '') : (labelOverride ?? (value === 'voice' ? 'VOICE' : 'MOTION'));

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      className="items-center justify-center flex-shrink-0 active:opacity-70"
    >
      <View
        style={{
          width: trackWidth,
          height: trackHeight,
          padding: PAD,
          borderRadius: trackHeight / 2,
          borderWidth: 1.5,
          borderColor: disabled ? theme.divider : '#f97316',
          backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#111827',
          flexDirection: 'row',
        }}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: PAD,
              top: PAD,
              width: cellWidth,
              height: trackHeight - PAD * 2,
              borderRadius: (trackHeight - PAD * 2) / 2,
              backgroundColor: activeColor,
            },
            knobStyle,
          ]}
        />

        <View style={{ width: cellWidth }} className="items-center justify-center">
          <Activity size={iconSize} color={value === 'motion' && !disabled ? '#000000' : theme.subText} />
        </View>
        <View style={{ width: cellWidth }} className="items-center justify-center">
          <Mic size={iconSize} color={value === 'voice' && !disabled ? '#000000' : theme.subText} />
        </View>
      </View>

      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={{ fontSize: isLarge ? 8 : 9, color: disabled ? '#4b5563' : '#f97316' }}
        className="font-bold mt-0.5 tracking-tighter"
      >
        {label}
      </Text>
    </Pressable>
  );
}
