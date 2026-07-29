import { useEffect, useRef, useState, useCallback } from 'react';
import { DeviceMotion } from 'expo-sensors';
import { Platform } from 'react-native';
import type {
  MotionState,
  MotionThresholds,
  Vector3,
  Rotation,
} from './types';
import { DEFAULT_THRESHOLDS, INITIAL_MOTION_STATE } from './types';
import {
  smoothVector3,
  smoothRotation,
  calculateMagnitude,
  calculateTiltAngle,
  determineTiltDirection,
  determineMotionDirection,
  isDeviceStationary,
} from './utils';

interface UseMotionOptions {
  /** Update interval in milliseconds (default: 16ms = ~60fps) */
  updateInterval?: number;
  /** Smoothing factor 0-1 (higher = more responsive, default: 0.2) */
  smoothingFactor?: number;
  /** Custom thresholds for motion detection */
  thresholds?: Partial<MotionThresholds>;
  /** Whether to start listening immediately (default: true) */
  autoStart?: boolean;
}

interface UseMotionResult {
  /** Current motion state */
  motion: MotionState;
  /** Whether sensor is available on this device */
  isAvailable: boolean;
  /** Whether currently listening to sensor */
  isListening: boolean;
  /** Start listening to sensor */
  start: () => Promise<void>;
  /** Stop listening to sensor */
  stop: () => void;
  /** Current thresholds (can be updated) */
  thresholds: MotionThresholds;
  /** Update thresholds */
  setThresholds: (thresholds: Partial<MotionThresholds>) => void;
}

export function useMotion(options: UseMotionOptions = {}): UseMotionResult {
  const {
    updateInterval = 16,
    smoothingFactor = 0.2,
    thresholds: initialThresholds = {},
    autoStart = true,
  } = options;

  const [motion, setMotion] = useState<MotionState>(INITIAL_MOTION_STATE);
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [thresholds, setThresholdsState] = useState<MotionThresholds>({
    ...DEFAULT_THRESHOLDS,
    ...initialThresholds,
  });

  // Refs for smoothing (persist across renders)
  const prevAcceleration = useRef<Vector3>({ x: 0, y: 0, z: 0 });
  const prevAccelGravity = useRef<Vector3>({ x: 0, y: 0, z: 0 });
  const prevRotation = useRef<Rotation>({ alpha: 0, beta: 0, gamma: 0 });
  const prevRotationRate = useRef<Rotation>({ alpha: 0, beta: 0, gamma: 0 });

  // Subscription ref
  const subscriptionRef = useRef<ReturnType<typeof DeviceMotion.addListener> | null>(null);

  // Track sustained motion
  const motionStartTime = useRef<number | null>(null);

  const setThresholds = useCallback((newThresholds: Partial<MotionThresholds>) => {
    setThresholdsState(prev => ({ ...prev, ...newThresholds }));
  }, []);

  const stop = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const start = useCallback(async () => {
    // Check availability
    const available = await DeviceMotion.isAvailableAsync();
    setIsAvailable(available);

    if (!available) {
      console.warn('DeviceMotion is not available on this device');
      return;
    }

    // Set update interval
    DeviceMotion.setUpdateInterval(updateInterval);

    // Remove existing subscription if any
    stop();

    // Start listening
    subscriptionRef.current = DeviceMotion.addListener((data) => {
      // Safely extract data with defaults
      const rawAcceleration: Vector3 = data.acceleration ?? { x: 0, y: 0, z: 0 };
      const rawAccelGravity: Vector3 = data.accelerationIncludingGravity ?? { x: 0, y: 0, z: 0 };
      const deviceOrientation = data.orientation ?? 0;

      // Rotation comes in radians - convert to degrees
      const rawRotation: Rotation = data.rotation
        ? {
            alpha: data.rotation.alpha * (180 / Math.PI),
            beta: data.rotation.beta * (180 / Math.PI),
            gamma: data.rotation.gamma * (180 / Math.PI)
          }
        : { alpha: 0, beta: 0, gamma: 0 };
      const rawRotationRate: Rotation = data.rotationRate ?? { alpha: 0, beta: 0, gamma: 0 };

      // Apply smoothing
      const smoothedAccel = smoothVector3(rawAcceleration, prevAcceleration.current, smoothingFactor);
      const smoothedAccelGravity = smoothVector3(rawAccelGravity, prevAccelGravity.current, smoothingFactor);
      const smoothedRotation = smoothRotation(rawRotation, prevRotation.current, smoothingFactor);
      const smoothedRotationRate = smoothRotation(rawRotationRate, prevRotationRate.current, smoothingFactor);

      // Update refs
      prevAcceleration.current = smoothedAccel;
      prevAccelGravity.current = smoothedAccelGravity;
      prevRotation.current = smoothedRotation;
      prevRotationRate.current = smoothedRotationRate;

      // Calculate derived values
      const accelerationMagnitude = calculateMagnitude(smoothedAccel);
      const tiltAngle = calculateTiltAngle(smoothedAccelGravity);
      const tiltDirection = determineTiltDirection(smoothedRotation, thresholds);
      const motionDirection = determineMotionDirection(smoothedAccel, thresholds);
      const stationary = isDeviceStationary(smoothedAccel, thresholds);

      // Track sustained motion
      const now = Date.now();
      if (!stationary) {
        if (motionStartTime.current === null) {
          motionStartTime.current = now;
        }
      } else {
        motionStartTime.current = null;
      }

      const sustainedMotion =
        motionStartTime.current !== null &&
        now - motionStartTime.current >= thresholds.sustainedMotionDuration;

      const isTilting = tiltDirection !== 'none';
      const isMoving = sustainedMotion && motionDirection !== 'none';

      setMotion({
        acceleration: smoothedAccel,
        accelerationIncludingGravity: smoothedAccelGravity,
        rotation: smoothedRotation,
        rotationRate: smoothedRotationRate,
        tiltDirection,
        motionDirection,
        tiltAngle,
        accelerationMagnitude,
        isStationary: stationary,
        isTilting,
        isMoving,
        orientation: deviceOrientation,
      });
    });

    setIsListening(true);
  }, [updateInterval, smoothingFactor, thresholds, stop]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart && Platform.OS !== 'web') {
      start();
    }

    return () => {
      stop();
    };
  }, []);

  // Handle threshold changes while listening
  useEffect(() => {
    if (isListening) {
      // Thresholds are captured in the closure, so we just need state update
    }
  }, [thresholds, isListening]);

  return {
    motion,
    isAvailable,
    isListening,
    start,
    stop,
    thresholds,
    setThresholds,
  };
}
