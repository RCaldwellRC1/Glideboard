import React, { useEffect, useMemo } from 'react';
import { View, Dimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const COLORS = ['#f97316', '#fbbf24', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#ec4899', '#ffffff'];

interface PieceConfig {
  startX: number;
  drift: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  rounded: boolean;
  spin: number;
}

function makePieces(count: number, width: number): PieceConfig[] {
  return Array.from({ length: count }, () => ({
    startX: Math.random() * width,
    drift: (Math.random() - 0.5) * 160,
    delay: Math.random() * 400,
    duration: 1800 + Math.random() * 1600,
    size: 7 + Math.random() * 9,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rounded: Math.random() > 0.5,
    spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 720),
  }));
}

function Piece({ cfg, height }: { cfg: PieceConfig; height: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      cfg.delay,
      withTiming(1, { duration: cfg.duration, easing: Easing.in(Easing.quad) })
    );
  }, []);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        { translateX: cfg.drift * p },
        { translateY: -30 + (height + 60) * p },
        { rotate: `${cfg.spin * p}deg` },
      ],
      // Fade out over the last ~25% of the fall.
      opacity: p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.25),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: cfg.startX,
          width: cfg.size,
          height: cfg.size * (cfg.rounded ? 1 : 1.6),
          backgroundColor: cfg.color,
          borderRadius: cfg.rounded ? cfg.size : 2,
        },
        style,
      ]}
    />
  );
}

interface ConfettiProps {
  active: boolean;
  // More pieces for a grand finale.
  intense?: boolean;
}

// A self-contained confetti burst built on reanimated (no extra native deps).
// Mount it when `active` is true; it plays once. Re-mount (e.g. via a React
// `key`) to replay.
export function Confetti({ active, intense = false }: ConfettiProps) {
  const { width, height } = Dimensions.get('window');
  const count = intense ? 160 : 90;
  const pieces = useMemo(() => makePieces(count, width), [count, width]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((cfg, i) => (
        <Piece key={i} cfg={cfg} height={height} />
      ))}
    </View>
  );
}
