import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Activity, Mic } from 'lucide-react-native';

/**
 * A vertical two-position switch that sits at the top of the Tracker screen
 * (where the Settings gear used to live) and picks how reps are counted:
 *
 *   top    = MOTION  (accelerometer counts your reps)
 *   bottom = VOICE   (you count out loud)
 *
 * It reads and writes the SAME setting as the Voice Counting switch in App
 * Settings, so changing either one changes both. Tapping it also counts as an
 * explicit pick, which beats the app's automatic motion/voice selection (e.g.
 * forcing Motion on a Free Style exercise, which defaults to Voice).
 *
 * It's deliberately narrow so there's a wide dead zone
 * between the START/END WORKOUT and START/END SET buttons either side of it —
 * users were mis-tapping "START NEXT SET" when reaching for the old gear icon.
 */
export function RepModeToggle({
  value,
  onToggle,
  disabled = false,
  disabledLabel,
  isLarge,
}: {
  value: 'motion' | 'voice';
  onToggle: () => void;
  disabled?: boolean;
  disabledLabel?: string;
  isLarge: boolean;
}) {
  const PAD = 3;
  const trackWidth = isLarge ? 40 : 44;
  const trackHeight = isLarge ? 62 : 70;
  const cellHeight = (trackHeight - PAD * 2) / 2;
  const iconSize = isLarge ? 17 : 19;

  const offset = useSharedValue(value === 'voice' ? 1 : 0);

  useEffect(() => {
    offset.value = withTiming(value === 'voice' ? 1 : 0, { duration: 180 });
  }, [value, offset]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value * cellHeight }],
  }));

  const activeColor = disabled ? '#4b5563' : '#f97316';
  const label = disabled ? (disabledLabel ?? '') : value === 'voice' ? 'VOICE' : 'MOTION';

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
      accessibilityRole="switch"
      accessibilityLabel="Rep counting mode"
      accessibilityState={{ checked: value === 'voice', disabled }}
      className="items-center justify-center flex-shrink-0 active:opacity-70"
    >
      <View
        style={{
          width: trackWidth,
          height: trackHeight,
          padding: PAD,
          borderRadius: trackWidth / 2,
          borderWidth: 2,
          borderColor: disabled ? '#374151' : '#f97316',
          backgroundColor: '#111827',
        }}
      >
        {/* Sliding knob behind the active half. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: PAD,
              top: PAD,
              width: trackWidth - PAD * 2,
              height: cellHeight,
              borderRadius: (trackWidth - PAD * 2) / 2,
              backgroundColor: activeColor,
            },
            knobStyle,
          ]}
        />

        <View style={{ height: cellHeight }} className="items-center justify-center">
          <Activity size={iconSize} color={value === 'motion' && !disabled ? '#000000' : '#6b7280'} />
        </View>
        <View style={{ height: cellHeight }} className="items-center justify-center">
          <Mic size={iconSize} color={value === 'voice' && !disabled ? '#000000' : '#6b7280'} />
        </View>
      </View>

      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={{ fontSize: isLarge ? 9 : 10, color: disabled ? '#4b5563' : '#f97316' }}
        className="font-bold mt-1 tracking-wide"
      >
        {label}
      </Text>
    </Pressable>
  );
}
