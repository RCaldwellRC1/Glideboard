import React, { createContext, useContext, ReactNode } from 'react';
import { useMotion } from './useMotion';
import type { MotionState, MotionThresholds, TiltDirection, MotionDirection } from './types';
import { INITIAL_MOTION_STATE, DEFAULT_THRESHOLDS } from './types';

interface MotionContextValue {
  motion: MotionState;
  isAvailable: boolean;
  isListening: boolean;
  start: () => Promise<void>;
  stop: () => void;
  thresholds: MotionThresholds;
  setThresholds: (thresholds: Partial<MotionThresholds>) => void;
}

// Default context value for when provider isn't ready
const defaultContextValue: MotionContextValue = {
  motion: INITIAL_MOTION_STATE,
  isAvailable: false,
  isListening: false,
  start: async () => {},
  stop: () => {},
  thresholds: DEFAULT_THRESHOLDS,
  setThresholds: () => {},
};

const MotionContext = createContext<MotionContextValue>(defaultContextValue);

interface MotionProviderProps {
  children: ReactNode;
  /** Update interval in milliseconds */
  updateInterval?: number;
  /** Smoothing factor 0-1 */
  smoothingFactor?: number;
  /** Custom thresholds */
  thresholds?: Partial<MotionThresholds>;
  /** Auto-start on mount */
  autoStart?: boolean;
}

export function MotionProvider({
  children,
  updateInterval = 16,
  smoothingFactor = 0.2,
  thresholds: initialThresholds = {},
  autoStart = true,
}: MotionProviderProps) {
  const motionResult = useMotion({
    updateInterval,
    smoothingFactor,
    thresholds: initialThresholds,
    autoStart,
  });

  return (
    <MotionContext.Provider value={motionResult}>
      {children}
    </MotionContext.Provider>
  );
}

/**
 * Access full motion context
 */
export function useMotionContext(): MotionContextValue {
  return useContext(MotionContext);
}

/**
 * Subscribe to specific motion state slice (prevents unnecessary re-renders)
 */
export function useMotionState<T>(selector: (state: MotionState) => T): T {
  const context = useContext(MotionContext);
  return selector(context.motion);
}

// Convenience hooks for common use cases

/**
 * Get current tilt direction
 */
export function useTiltDirection(): TiltDirection {
  return useMotionState(s => s.tiltDirection);
}

/**
 * Get current motion direction
 */
export function useMotionDirection(): MotionDirection {
  return useMotionState(s => s.motionDirection);
}

/**
 * Check if device is stationary
 */
export function useIsStationary(): boolean {
  return useMotionState(s => s.isStationary);
}

/**
 * Check if device is tilting
 */
export function useIsTilting(): boolean {
  return useMotionState(s => s.isTilting);
}

/**
 * Check if device is moving
 */
export function useIsMoving(): boolean {
  return useMotionState(s => s.isMoving);
}

/**
 * Get tilt angle in degrees
 */
export function useTiltAngle(): number {
  return useMotionState(s => s.tiltAngle);
}

/**
 * Get acceleration magnitude
 */
export function useAccelerationMagnitude(): number {
  return useMotionState(s => s.accelerationMagnitude);
}

/**
 * Get raw acceleration vector
 */
export function useAcceleration() {
  return useMotionState(s => s.acceleration);
}

/**
 * Get rotation (beta/gamma/alpha)
 */
export function useRotation() {
  return useMotionState(s => s.rotation);
}
