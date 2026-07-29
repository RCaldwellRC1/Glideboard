/**
 * Hook to bridge device motion sensor with adaptive rep counter
 * Converts raw accelerometer data into position/velocity for rep detection
 */

import { useEffect, useCallback } from 'react';
import { useMotionContext } from './MotionContext';
import { useAdaptiveRepStore } from './adaptiveRepStore';

interface UseAdaptiveRepCounterOptions {
  exerciseId: string;
  inclineLevel: number;
  isSetActive: boolean;
}

export function useAdaptiveRepCounter({
  exerciseId,
  inclineLevel,
  isSetActive,
}: UseAdaptiveRepCounterOptions) {
  const { motion, isListening } = useMotionContext();

  // Adaptive rep store
  const setState = useAdaptiveRepStore(s => s.setState);
  const repCount = useAdaptiveRepStore(s => s.repCount);
  const ignoreMotion = useAdaptiveRepStore(s => s.ignoreMotion);
  const repState = useAdaptiveRepStore(s => s.repState);
  const isLearningROM = useAdaptiveRepStore(s => s.isLearningROM);
  const startSet = useAdaptiveRepStore(s => s.startSet);
  const endSet = useAdaptiveRepStore(s => s.endSet);
  const processMotion = useAdaptiveRepStore(s => s.processMotion);
  const loadFromStorage = useAdaptiveRepStore(s => s.loadFromStorage);

  // Load profiles on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Start/end set based on isSetActive
  useEffect(() => {
    if (isSetActive && setState === 'SET_IDLE') {
      startSet(exerciseId, inclineLevel);
    } else if (!isSetActive && setState === 'SET_ACTIVE') {
      endSet();
    }
  }, [isSetActive, setState, exerciseId, inclineLevel, startSet, endSet]);

  // Process motion data
  useEffect(() => {
    if (!isSetActive || !isListening || setState !== 'SET_ACTIVE') return;

    const { x, y, z } = motion.accelerationIncludingGravity;

    // Calculate acceleration magnitude
    const accelMagnitude = Math.sqrt(x * x + y * y + z * z);

    // Process the motion (simplified - just pass magnitude)
    processMotion(accelMagnitude);
  }, [motion, isSetActive, isListening, setState, processMotion]);

  // Handle auto-end (when setState changes to SET_ENDED from timeout)
  const handleAutoEnd = useCallback(() => {
    if (setState === 'SET_ENDED' && isSetActive) {
      // The store auto-ended, need to sync with workout store
      return true;
    }
    return false;
  }, [setState, isSetActive]);

  return {
    repCount,
    setState,
    repState,
    ignoreMotion,
    isLearningROM,
    isStabilizing: ignoreMotion && setState === 'SET_ACTIVE',
    didAutoEnd: handleAutoEnd(),
    endSet,
  };
}
