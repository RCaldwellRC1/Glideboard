import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import { useMotion, INITIAL_DIAGNOSTICS } from './useMotion';
import type { MotionDiagnostics } from './useMotion';
import type { MotionState, MotionThresholds, TiltDirection, MotionDirection } from './types';
import { INITIAL_MOTION_STATE, DEFAULT_THRESHOLDS } from './types';
import { remoteLog } from '@/lib/remoteLog';

interface MotionContextValue {
  motion: MotionState;
  isAvailable: boolean;
  isListening: boolean;
  /** Live sensor health — drives the on-screen sensor status UI */
  diagnostics: MotionDiagnostics;
  start: () => Promise<void>;
  stop: () => void;
  /** Tear down and re-probe the sensor from scratch */
  restart: () => Promise<void>;
  thresholds: MotionThresholds;
  setThresholds: (thresholds: Partial<MotionThresholds>) => void;
}

// Default context value for when provider isn't ready
const defaultContextValue: MotionContextValue = {
  motion: INITIAL_MOTION_STATE,
  isAvailable: false,
  isListening: false,
  diagnostics: INITIAL_DIAGNOSTICS,
  start: async () => {},
  stop: () => {},
  restart: async () => {},
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
  // One app-wide record of which sensor actually won, so a device that silently
  // has no working motion sensor shows up in the LOGS tab instead of just
  // counting zero reps forever. Fires only on transitions, not per sample.
  const handleStatusChange = useCallback((diagnostics: MotionDiagnostics) => {
    console.log(
      `[MOTION] source=${diagnostics.source} healthy=${diagnostics.isHealthy}` +
      `${diagnostics.error ? ` error="${diagnostics.error}"` : ''}`,
    );
    remoteLog('motion_sensor_status', {
      platform: Platform.OS,
      source: diagnostics.source,
      healthy: diagnostics.isHealthy,
      deviceMotionAvailable: diagnostics.deviceMotionAvailable,
      accelerometerAvailable: diagnostics.accelerometerAvailable,
      sampleRateHz: diagnostics.sampleRateHz,
      restartCount: diagnostics.restartCount,
      error: diagnostics.error,
    });
  }, []);

  const motionResult = useMotion({
    updateInterval,
    smoothingFactor,
    thresholds: initialThresholds,
    autoStart,
    onStatusChange: handleStatusChange,
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

/**
 * Live sensor health. Use this to tell the user when motion counting can't
 * work rather than letting a set sit at zero reps.
 */
export function useMotionDiagnostics(): MotionDiagnostics {
  return useContext(MotionContext).diagnostics;
}

/**
 * True when a sensor is subscribed AND delivering usable samples right now.
 */
export function useIsMotionHealthy(): boolean {
  return useContext(MotionContext).diagnostics.isHealthy;
}
