import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSettingsStore, type PaceSettings, useTheme } from '@/lib/settings';

type Phase = 'DELAY' | 'LIFT' | 'HOLD' | 'DOWN' | 'PAUSE';

const PHASE_COLORS: Record<Phase, string> = {
  DELAY: '#3b82f6',  // Blue for countdown
  LIFT: '#22c55e',   // Green
  HOLD: '#eab308',   // Yellow
  DOWN: '#ef4444',   // Red
  PAUSE: '#6b7280',  // Gray
};

const PHASE_LABELS: Record<Phase, string> = {
  DELAY: 'GET READY',
  LIFT: 'LIFT',
  HOLD: 'HOLD',
  DOWN: 'DOWN',
  PAUSE: 'PAUSE',
};

interface PaceSetterGaugeProps {
  isActive: boolean;
  currentReps: number;
  isLarge: boolean;
  isFirstSet?: boolean;
  onSetStarted?: () => void;
}

export function PaceSetterGauge({
  isActive,
  currentReps,
  isLarge,
  isFirstSet = true,
  onSetStarted,
}: PaceSetterGaugeProps) {
  const theme = useTheme();
  const [currentPhase, setCurrentPhase] = useState<Phase>('PAUSE');
  const [phaseTimeRemaining, setPhaseTimeRemaining] = useState(0);
  const [isInDelay, setIsInDelay] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleStartTime = useRef<number>(0);
  const delayEndTime = useRef<number>(0);
  const hasStartedRef = useRef<boolean>(false);

  const paceSettings = useSettingsStore(s => s.paceSettings);

  const progress = useSharedValue(0);

  // Get phase timings from settings (convert seconds to milliseconds)
  const getPhaseTimings = (settings: PaceSettings) => ({
    DELAY: settings.delayToStart * 1000,
    LIFT: settings.liftTime * 1000,
    HOLD: settings.holdTime * 1000,
    DOWN: settings.downTime * 1000,
    PAUSE: settings.pauseTime * 1000,
  });

  const getTotalCycle = (settings: PaceSettings) => {
    return (settings.liftTime + settings.holdTime + settings.downTime + settings.pauseTime) * 1000;
  };

  const getPhaseFromElapsed = (
    elapsed: number,
    timings: ReturnType<typeof getPhaseTimings>,
    totalCycle: number
  ): { phase: Phase; remaining: number; phaseProgress: number } => {
    // All movement phases zeroed out (pure "go as fast as you want" mode) —
    // nothing to animate, just sit in a neutral LIFT state.
    if (totalCycle <= 0) {
      return { phase: 'LIFT', remaining: 0, phaseProgress: 0 };
    }

    const cycleTime = elapsed % totalCycle;

    if (cycleTime < timings.LIFT) {
      return {
        phase: 'LIFT',
        remaining: Math.ceil((timings.LIFT - cycleTime) / 1000),
        phaseProgress: cycleTime / timings.LIFT,
      };
    } else if (cycleTime < timings.LIFT + timings.HOLD) {
      const phaseElapsed = cycleTime - timings.LIFT;
      return {
        phase: 'HOLD',
        remaining: Math.ceil((timings.HOLD - phaseElapsed) / 1000),
        phaseProgress: phaseElapsed / timings.HOLD,
      };
    } else if (cycleTime < timings.LIFT + timings.HOLD + timings.DOWN) {
      const phaseElapsed = cycleTime - timings.LIFT - timings.HOLD;
      return {
        phase: 'DOWN',
        remaining: Math.ceil((timings.DOWN - phaseElapsed) / 1000),
        phaseProgress: phaseElapsed / timings.DOWN,
      };
    } else {
      const phaseElapsed = cycleTime - timings.LIFT - timings.HOLD - timings.DOWN;
      return {
        phase: 'PAUSE',
        remaining: Math.ceil((timings.PAUSE - phaseElapsed) / 1000),
        phaseProgress: phaseElapsed / timings.PAUSE,
      };
    }
  };

  useEffect(() => {
    if (isActive) {
      const timings = getPhaseTimings(paceSettings);
      const totalCycle = getTotalCycle(paceSettings);

      // Start with delay countdown
      setIsInDelay(true);
      hasStartedRef.current = false;
      delayEndTime.current = Date.now() + timings.DELAY;
      cycleStartTime.current = delayEndTime.current;

      const tick = () => {
        const now = Date.now();

        // During delay phase
        if (now < delayEndTime.current) {
          const remaining = Math.ceil((delayEndTime.current - now) / 1000);
          const delayProgress = 1 - ((delayEndTime.current - now) / timings.DELAY);

          setCurrentPhase('DELAY');
          setPhaseTimeRemaining(remaining);
          progress.value = delayProgress;
          return;
        }

        // Delay just finished - trigger callback
        if (!hasStartedRef.current) {
          hasStartedRef.current = true;
          setIsInDelay(false);
          onSetStarted?.();
        }

        // Regular pace cycle
        const elapsed = now - cycleStartTime.current;
        const { phase, remaining, phaseProgress } = getPhaseFromElapsed(elapsed, timings, totalCycle);

        setCurrentPhase(phase);
        setPhaseTimeRemaining(remaining);
        progress.value = phaseProgress;
      };

      // Initial tick
      tick();

      // Update every 50ms for smooth animation
      intervalRef.current = setInterval(tick, 50);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      // Reset when not active
      setCurrentPhase('PAUSE');
      setPhaseTimeRemaining(0);
      setIsInDelay(false);
      hasStartedRef.current = false;
      progress.value = 0;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [isActive, paceSettings]);

  // Haptic feedback on phase change
  const lastPhaseRef = useRef<Phase>('PAUSE');
  useEffect(() => {
    if (isActive && currentPhase !== lastPhaseRef.current) {
      lastPhaseRef.current = currentPhase;
      if (currentPhase === 'LIFT') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (currentPhase === 'HOLD') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (currentPhase === 'DOWN') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (currentPhase === 'DELAY') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }
  }, [currentPhase, isActive]);

  const animatedFillStyle = useAnimatedStyle(() => {
    return {
      width: `${progress.value * 100}%`,
    };
  });

  const phaseColor = PHASE_COLORS[currentPhase];
  const phaseLabel = PHASE_LABELS[currentPhase];

  return (
    <View style={{ backgroundColor: theme.card }} className={`border-2 border-orange-500 rounded-2xl p-3 items-center justify-center ${isLarge ? 'min-h-[140px]' : 'min-h-[160px]'}`}>
      {/* Header */}
      <Text allowFontScaling={false} style={{ color: theme.subText }} className={`tracking-wide ${isLarge ? 'text-xs' : 'text-sm'}`}>PACE-SETTER</Text>

      {/* Phase Indicator - smaller text to prevent wrapping */}
      <View className="flex-row items-center justify-center mt-1">
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          className={`font-bold ${isLarge ? 'text-xl' : 'text-2xl'}`}
          style={{ color: phaseColor }}
        >
          {phaseLabel}
        </Text>
        {isActive && (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            className={`font-bold ml-2 ${isLarge ? 'text-lg' : 'text-xl'}`}
            style={{ color: phaseColor }}
          >
            {phaseTimeRemaining}s
          </Text>
        )}
      </View>

      {/* Progress Bar */}
      <View style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className={`w-full rounded-full overflow-hidden mt-2 ${isLarge ? 'h-3' : 'h-4'}`}>
        <Animated.View
          className="h-full rounded-full"
          style={[
            { backgroundColor: phaseColor },
            animatedFillStyle,
          ]}
        />
      </View>

      {/* Phase Legend - compact */}
      <View className="flex-row justify-between w-full mt-1 px-1">
        {(['LIFT', 'HOLD', 'DOWN', 'PAUSE'] as Phase[]).map((phase) => (
          <View
            key={phase}
            className={`flex-row items-center ${currentPhase === phase ? 'opacity-100' : 'opacity-40'}`}
          >
            <View
              className="w-1.5 h-1.5 rounded-full mr-0.5"
              style={{ backgroundColor: PHASE_COLORS[phase] }}
            />
            <Text allowFontScaling={false} style={{ color: theme.subText }} className={isLarge ? 'text-[8px]' : 'text-[10px]'}>
              {phase === 'LIFT' ? `${paceSettings.liftTime}s` :
               phase === 'HOLD' ? `${paceSettings.holdTime}s` :
               phase === 'DOWN' ? `${paceSettings.downTime}s` :
               `${paceSettings.pauseTime}s`}
            </Text>
          </View>
        ))}
      </View>

      {/* Rep Counter (smaller) */}
      <View className="flex-row items-center mt-1">
        <Text allowFontScaling={false} style={{ color: theme.subText }} className={isLarge ? 'text-xs' : 'text-sm'}>Reps: </Text>
        <Text allowFontScaling={false} numberOfLines={1} className={`text-orange-500 font-bold ${isLarge ? 'text-lg' : 'text-xl'}`}>{currentReps}</Text>
      </View>
    </View>
  );
}
