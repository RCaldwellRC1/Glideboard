/**
 * Adaptive Real-Time Rep Counter Types
 * Based on the Vibecode Spec for motion-based rep counting
 */

// Set state machine states
export type SetState = 'SET_IDLE' | 'SET_ACTIVE' | 'SET_ENDED';

// Rep state machine states
export type RepState = 'WAITING' | 'MOVING_UP' | 'MOVING_DOWN';

// Exercise profile stored per user per exercise
export interface ExerciseProfile {
  exerciseId: string;
  inclineLevel: number;
  avgROM: number;           // Average range of motion (peak acceleration deviation)
  minPeak: number;          // Learned minimum peak for valid rep (starts at avgROM * 0.5)
  romConfidence: number;    // 0-1 confidence in ROM measurement
  sampleCount: number;      // Number of reps used to learn ROM
  lastUpdated: Date;
}

// Thresholds calculated from ROM
export interface RepThresholds {
  upThreshold: number;      // 70% of effective ROM
  downThreshold: number;    // 30% of effective ROM
  effectiveROM: number;     // avg_ROM * 0.85
}

// Rep timing data for validation
export interface RepTiming {
  startTime: number;
  upReachedTime: number | null;
  endTime: number | null;
  duration: number | null;
}

// Confidence calculation factors
export interface ConfidenceFactors {
  timingConsistency: number;    // How consistent rep durations are
  motionConsistency: number;    // How clean the motion pattern is
  overrideFrequency: number;    // How often user overrides (lower = better)
}

// Set summary after completion
export interface SetSummary {
  repCount: number;
  confidenceScore: number;
  avgRepDuration: number;
  repTimings: RepTiming[];
  needsConfirmation: boolean;
}

// Constants
export const ADAPTIVE_REP_CONSTANTS = {
  // Position stabilization
  STABILIZATION_TIME_MS: 750,           // 0.75s is enough to detect stillness
  STABILIZATION_VARIANCE_THRESHOLD: 0.5, // forgiving threshold for real-world conditions
  MAX_STABILIZATION_WAIT_MS: 5000,      // force-stabilize after 5s if still noisy

  // ROM learning
  INITIAL_ROM_CONFIDENCE: 0.5,
  ROM_LEARNING_REPS: 3,                 // Learn from first 3 reps
  ROM_UPDATE_WEIGHT: 0.1,               // Blend factor for new ROM
  ROM_MARGIN: 0.85,                     // effective_ROM = avg_ROM * 0.85

  // Rep thresholds (as fraction of effective ROM)
  UP_THRESHOLD_FACTOR: 0.70,
  DOWN_THRESHOLD_FACTOR: 0.30,

  // False rep protection
  MIN_REP_DURATION_MS: 100,             // 100ms minimum — filters jitter without cutting off fast reps
  MAX_AXIS_NOISE: 2.0,                  // Maximum noise threshold

  // Single-arm adaptation
  SINGLE_ARM_ROM_RATIO: 0.75,
  SINGLE_ARM_UP_ADJUST: 0.95,
  SINGLE_ARM_DOWN_ADJUST: 1.05,

  // Auto end-set
  INACTIVITY_TIMEOUT_MS: 8000,          // 8 seconds

  // Confidence
  CONFIDENCE_THRESHOLD: 0.85,           // Show confirmation if below

  // Learning from override
  MIN_REPS_FOR_LEARNING: 3,
  MAX_OVERRIDE_RATIO: 0.30,             // 30% max difference
  THRESHOLD_ADJUST_FACTOR: 0.03,        // 3% adjustment
} as const;

// Initial profile for new exercises
export const INITIAL_EXERCISE_PROFILE: Omit<ExerciseProfile, 'exerciseId' | 'inclineLevel'> = {
  avgROM: 0,
  minPeak: 0.15,  // Start with a low minimum, will be learned
  romConfidence: 0,
  sampleCount: 0,
  lastUpdated: new Date(),
};
