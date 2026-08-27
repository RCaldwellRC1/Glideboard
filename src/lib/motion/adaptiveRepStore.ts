/**
 * Adaptive Rep Counter Store
 * Implements the Vibecode Spec for real-time rep counting with learning
 *
 * Key insight: For accelerometer-based rep counting, we detect the UP→DOWN→UP
 * pattern by looking at acceleration changes, not absolute position.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import type {
  SetState,
  RepState,
  ExerciseProfile,
  RepTiming,
  SetSummary,
} from './adaptiveRepTypes';
import {
  ADAPTIVE_REP_CONSTANTS as C,
} from './adaptiveRepTypes';

const PROFILES_STORAGE_KEY = 'adaptive-exercise-profiles';
const ADJUSTMENTS_STORAGE_KEY = 'adaptive-correction-adjustments-v1';

// Persist the learned threshold + cooldown adjustments so user corrections
// survive app restarts (profiles are saved separately, these were previously
// in-memory only and reset every launch).
function persistAdjustments(
  thresholds: Record<string, { factor: number }>,
  cooldowns: Record<string, { factor: number }>,
) {
  const data = JSON.stringify({ thresholds, cooldowns });
  AsyncStorage.setItem(ADJUSTMENTS_STORAGE_KEY, data)
    .then(() => {
      console.log('[ADAPTIVE] Successfully saved learned adjustments (thresholds/cooldowns)');
    })
    .catch(err => {
      console.error('[ADAPTIVE] Failed to save adjustments:', err);
    });
}

function getProfileKey(exerciseId: string, inclineLevel: number): string {
  return `${exerciseId}::${inclineLevel}`;
}

// Result of applying a user's confirmed count back into the learning model.
// The UI uses this to give the user visible feedback ("I'll count tighter next
// time") so the silent per-exercise learning actually feels like it's working.
export interface OverrideResult {
  // Whether the correction was actually learned from (false = ignored, e.g. no
  // reps counted, or the miss was too large to trust as a calibration signal).
  adjusted: boolean;
  // Which way we nudged the tracker for this exercise:
  //   'tighter' = it was over-counting, we'll count more conservatively.
  //   'looser'  = it was under-counting, we'll pick up more reps.
  //   'none'    = nothing changed.
  direction: 'tighter' | 'looser' | 'none';
  // True when the miss was large (off by 2+ reps) and we applied a stronger,
  // faster correction so the tracker converges in one or two sets, not many.
  strong: boolean;
}

interface AdaptiveRepState {
  // Set state
  setState: SetState;
  repCount: number;
  lastRepTime: number;
  setStartTime: number;

  // Position stabilization
  ignoreMotion: boolean;
  baselineAccel: number;
  stabilizationStartTime: number | null;
  accelHistory: number[];

  // Rep state machine
  repState: RepState;
  repStartTime: number | null;
  peakDeviation: number;
  movingDirection: 'none' | 'away' | 'returning';

  // Cooldown after rep
  repCooldownUntil: number;

  // ROM learning (during set)
  measuredPeaks: number[];
  isLearningROM: boolean;

  // Rep timings for confidence
  repTimings: RepTiming[];

  // Exercise profiles (persisted)
  profiles: Record<string, ExerciseProfile>;
  isLoaded: boolean;

  // Threshold adjustments from user overrides (scales how STRONG a motion must be).
  thresholdAdjustments: Record<string, { factor: number }>;

  // Cooldown adjustments from user overrides (scales the minimum TIME between two
  // counted reps). This is the lever that fixes double-counting: when the user
  // confirms fewer reps than auto-counted, we lengthen the cooldown so a rep's
  // return-stroke is absorbed instead of counted again. Persisted per exercise+level.
  cooldownAdjustments: Record<string, { factor: number }>;

  // Sensitivity multiplier from settings (1.0 = medium, 0.6 = high/fast, 1.5 = low/slow)
  _sensitivityMultiplier: number;

  // Pace-derived gating (computed from the user's Pace Settings + Motion Sensitivity)
  _expectedRepMs: number;
  _minRepDurationMs: number;  // a counted rep's motion must last at least this long (jitter floor)
  _repCooldownMs: number;     // minimum time between two counted reps (primary anti-double-count gate)
  _setupDelayMs: number;      // minimum "get into position" delay before counting begins each set

  // Actions
  startSet: (
    exerciseId: string,
    inclineLevel: number,
    sensitivityMultiplier?: number,
    minRepDurationMs?: number,
    repCooldownMs?: number,
    setupDelayMs?: number,
  ) => void;
  endSet: () => SetSummary;
  resetToIdle: () => void;
  processMotion: (accelMagnitude: number) => void;
  applyUserOverride: (exerciseId: string, inclineLevel: number, userCount: number) => OverrideResult;

  // Profile management
  getProfile: (exerciseId: string, inclineLevel: number) => ExerciseProfile | null;

  // Learned cooldown multiplier for an exercise+level (1 = no adjustment yet).
  getCooldownFactor: (exerciseId: string, inclineLevel: number) => number;

  // Persistence
  loadFromStorage: () => Promise<void>;

  // Internal
  _currentExerciseId: string | null;
  _currentInclineLevel: number | null;
}

// Constants for rep detection
const MIN_PEAK_FOR_REP = 0.07; // Lower even more for ultra-slow/controlled reps
const SMOOTHING_WINDOW = 10; // Filter out more noise on tablet accelerometers

// Returns `value` only if it is a usable finite number, otherwise `fallback`.
// IMPORTANT: `??` does NOT catch NaN, so a corrupted profile value (NaN) would
// otherwise silently poison every comparison (peak >= NaN is always false → no
// reps ever count). Always run learned profile numbers through this guard.
function safeNum(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const useAdaptiveRepStore = create<AdaptiveRepState>((set, get) => ({
  // Initial state
  setState: 'SET_IDLE',
  repCount: 0,
  lastRepTime: 0,
  setStartTime: 0,

  ignoreMotion: true,
  baselineAccel: 9.8,
  stabilizationStartTime: null,
  accelHistory: [],

  repState: 'WAITING',
  repStartTime: null,
  peakDeviation: 0,
  movingDirection: 'none',

  repCooldownUntil: 0,

  measuredPeaks: [],
  isLearningROM: false,

  repTimings: [],

  profiles: {},
  isLoaded: false,

  thresholdAdjustments: {},
  cooldownAdjustments: {},

  _sensitivityMultiplier: 1.0,
  _expectedRepMs: 2000,
  _minRepDurationMs: 120,
  _repCooldownMs: 800,
  _setupDelayMs: 6000,

  _currentExerciseId: null,
  _currentInclineLevel: null,

  resetToIdle: () => {
    clearInactivityTimer();
    set({
      setState: 'SET_IDLE',
    });
    console.log('[ADAPTIVE] Reset to IDLE');
  },

  startSet: (
    exerciseId: string,
    inclineLevel: number,
    sensitivityMultiplier = 1.0,
    minRepDurationMs = 120,
    repCooldownMs = 800,
    setupDelayMs = 6000,
  ) => {
    clearInactivityTimer();

    const state = get();
    const profile = state.profiles[getProfileKey(exerciseId, inclineLevel)];
    const needsLearning = !profile || profile.sampleCount < C.ROM_LEARNING_REPS;

    set({
      setState: 'SET_ACTIVE',
      repCount: 0,
      lastRepTime: Date.now(),
      setStartTime: Date.now(),

      ignoreMotion: true,
      baselineAccel: 9.8,
      stabilizationStartTime: null,
      accelHistory: [],

      repState: 'WAITING',
      repStartTime: null,
      peakDeviation: 0,
      movingDirection: 'none',

      repCooldownUntil: 0,

      measuredPeaks: [],
      isLearningROM: needsLearning,

      repTimings: [],

      _sensitivityMultiplier: sensitivityMultiplier,
      _expectedRepMs: (repCooldownMs / 0.85), // reconstruct original pace
      _minRepDurationMs: minRepDurationMs,
      _repCooldownMs: repCooldownMs,
      _setupDelayMs: setupDelayMs,
      _currentExerciseId: exerciseId,
      _currentInclineLevel: inclineLevel,
    });

    console.log('[ADAPTIVE] Set started for', exerciseId, 'level', inclineLevel,
                'Learning ROM:', needsLearning,
                'minRepMs:', minRepDurationMs, 'cooldownMs:', repCooldownMs,
                'setupDelayMs:', setupDelayMs);
  },

  endSet: () => {
    clearInactivityTimer();

    const state = get();

    const confidence = calculateConfidence(state.repTimings);

    const validDurations = state.repTimings
      .map(t => t.duration)
      .filter((d): d is number => d !== null);

    const totalActiveDuration = validDurations.reduce((a, b) => a + b, 0);
    const avgRepDuration = validDurations.length > 0
      ? totalActiveDuration / validDurations.length
      : 0;

    const summary: SetSummary = {
      repCount: state.repCount,
      confidenceScore: confidence,
      avgRepDuration,
      totalActiveDuration,
      repTimings: state.repTimings,
      needsConfirmation: confidence < C.CONFIDENCE_THRESHOLD && state.repCount > 0,
    };

    if (state._currentExerciseId && state._currentInclineLevel !== null && state.measuredPeaks.length > 0) {
      updateProfileROM(state, set);
    }

    set({
      setState: 'SET_IDLE',
    });

    console.log('[ADAPTIVE] Set ended. Reps:', summary.repCount,
                'Confidence:', summary.confidenceScore.toFixed(2));

    return summary;
  },

  processMotion: (accelMagnitude: number) => {
    const state = get();

    if (state.setState !== 'SET_ACTIVE') return;

    const now = Date.now();

    // Update acceleration history with more samples for better smoothing
    const newHistory = [...state.accelHistory.slice(-(SMOOTHING_WINDOW * 3 - 1)), accelMagnitude];
    set({ accelHistory: newHistory });

    // ===== POSITION STABILIZATION =====
    if (state.ignoreMotion) {
      if (newHistory.length < SMOOTHING_WINDOW) return;

      const variance = calculateVariance(newHistory);
      const setupElapsed = state.setStartTime > 0 ? now - state.setStartTime : 0;
      // Always give the user at least their setup delay to get into position —
      // each set, not just the first. Force-stabilize only after the longer of
      // the setup delay and the max stabilization wait.
      const setupDone = setupElapsed >= state._setupDelayMs;
      const forceStabilize = state.setStartTime > 0 &&
        setupElapsed >= Math.max(C.MAX_STABILIZATION_WAIT_MS, state._setupDelayMs);

      if (variance < C.STABILIZATION_VARIANCE_THRESHOLD || forceStabilize) {
        if (state.stabilizationStartTime === null) {
          set({ stabilizationStartTime: now });
        } else if ((setupDone && now - state.stabilizationStartTime >= C.STABILIZATION_TIME_MS) || forceStabilize) {
          const baseline = newHistory.reduce((a, b) => a + b, 0) / newHistory.length;
          set({
            ignoreMotion: false,
            baselineAccel: baseline,
            repState: 'WAITING',
            movingDirection: 'none',
          });
          console.log('[ADAPTIVE] Position stabilized' + (forceStabilize ? ' (forced)' : '') + '. Baseline:', baseline.toFixed(2));

          startInactivityTimer(get, set);
        }
      } else {
        set({ stabilizationStartTime: null });
      }
      return;
    }

    // ===== CHECK COOLDOWN =====
    if (now < state.repCooldownUntil) {
      return; // Still in cooldown after last rep
    }

    // ===== REP DETECTION =====
    const exerciseId = state._currentExerciseId;
    const inclineLevel = state._currentInclineLevel;
    if (!exerciseId || inclineLevel === null) return;

    const profile = state.profiles[getProfileKey(exerciseId, inclineLevel)];
    const adjustment = state.thresholdAdjustments[getProfileKey(exerciseId, inclineLevel)]?.factor ?? 1;

    // Calculate smoothed acceleration using larger window
    const recentAccel = newHistory.slice(-SMOOTHING_WINDOW);
    const smoothedAccel = recentAccel.reduce((a, b) => a + b, 0) / recentAccel.length;
    const deviation = Math.abs(smoothedAccel - state.baselineAccel);

    // For learning mode, use a low threshold to detect any movement
    // For learned mode, use 50% of learned peak
    // Apply sensitivity multiplier (0.6=high/fast, 1.0=medium, 1.5=low/slow)
    const sens = state._sensitivityMultiplier;

    // Pace-adaptive threshold: slower pace = smoother/weaker peaks.
    // Base trigger is 0.20; if pace > 2s (lift+hold+down), we lower it proportionally.
    const paceFactor = Math.max(0.5, Math.min(1.0, 2.0 / (state._expectedRepMs / 1000 || 2.0)));

    const triggerThreshold = state.isLearningROM
      ? 0.05 * sens * paceFactor
      : Math.max(safeNum(profile?.avgROM, 0.4) * 0.5 * adjustment * sens * paceFactor, 0.07);

    // Apply sensitivity to the return threshold too, so Low Sensitivity is
    // harder to "finish" as well (prevents phantom reps from small jitters).
    const returnThreshold = 0.07 * sens;

    // Track peak deviation
    if (deviation > state.peakDeviation) {
      set({ peakDeviation: deviation });
    }

    // State machine for rep detection
    const currentDirection = state.movingDirection;

    if (currentDirection === 'none' && deviation > triggerThreshold) {
      // Started moving away from rest
      set({
        movingDirection: 'away',
        repStartTime: now,
        peakDeviation: deviation,
      });
      // Reset inactivity timer when movement detected (not just on valid rep)
      resetInactivityTimer(get, set);
      console.log('[ADAPTIVE] Movement started. Deviation:', deviation.toFixed(2), 'Threshold:', triggerThreshold.toFixed(2));
    }
    else if (currentDirection === 'away') {
      // Check if we've peaked (deviation dropped from peak — 50% is more sensitive than 60%)
      if (deviation < state.peakDeviation * 0.5 && state.peakDeviation > triggerThreshold * 1.1) {
        set({ movingDirection: 'returning' });
        console.log('[ADAPTIVE] Returning. Peak was:', state.peakDeviation.toFixed(2));
      }
    }
    else if (currentDirection === 'returning' && deviation < returnThreshold) {
      // Returned to rest - check if this is a valid rep
      const repDuration = now - (state.repStartTime ?? now);
      const peak = state.peakDeviation;

      // Minimum requirements for a valid rep:
      // 1. Duration >= MIN_REP_DURATION_MS
      // 2. Peak must be significant - use learned minPeak for this exercise, or low default in learning mode.
      // We apply the same sensitivity/adjustment scaling here as we do for the trigger threshold.
      // This ensures that if a movement was deliberate enough to START the rep, it's judged
      // against a consistent standard to FINISH it.
      const rawMinPeak = state.isLearningROM
        ? MIN_PEAK_FOR_REP  // Low threshold during learning
        : safeNum(profile?.minPeak, MIN_PEAK_FOR_REP);

      const activeMinPeak = Math.max(rawMinPeak * adjustment * sens * paceFactor, 0.07);

      if (repDuration >= state._minRepDurationMs && peak >= activeMinPeak) {
        // Valid rep!
        const newRepCount = state.repCount + 1;

        const timing: RepTiming = {
          startTime: state.repStartTime ?? now,
          upReachedTime: null,
          endTime: now,
          duration: repDuration,
        };

        const newPeaks = [...state.measuredPeaks, peak];

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Calculate active cooldown using the learned factor
        const cooldownFactor = state.cooldownAdjustments[getProfileKey(exerciseId, inclineLevel)]?.factor ?? 1;
        const activeCooldown = state._repCooldownMs * cooldownFactor;

        set({
          repCount: newRepCount,
          lastRepTime: now,
          repState: 'WAITING',
          repStartTime: null,
          peakDeviation: 0,
          movingDirection: 'none',
          repCooldownUntil: now + activeCooldown,
          repTimings: [...state.repTimings, timing],
          measuredPeaks: newPeaks,
        });

        console.log('[ADAPTIVE] REP COUNTED:', newRepCount,
                    'Duration:', repDuration, 'ms, Peak:', peak.toFixed(2));

        resetInactivityTimer(get, set);

        if (state.isLearningROM && newPeaks.length >= C.ROM_LEARNING_REPS) {
          set({ isLearningROM: false });
          console.log('[ADAPTIVE] ROM learning complete');
        }
      } else {
        // Invalid rep - still reset inactivity since user is moving
        const reason = repDuration < state._minRepDurationMs
          ? `too fast: ${repDuration}ms (min ${state._minRepDurationMs}ms)`
          : `peak too low: ${peak.toFixed(2)} < ${activeMinPeak.toFixed(2)}`;
        console.log('[ADAPTIVE] Rep rejected -', reason);
        resetInactivityTimer(get, set);
        set({
          repStartTime: null,
          peakDeviation: 0,
          movingDirection: 'none',
        });
      }
    }

    // Timeout: if stuck in movement for too long, reset
    // Increased to 10 seconds to allow for slow, controlled reps
    if (currentDirection !== 'none' && state.repStartTime) {
      const elapsed = now - state.repStartTime;
      if (elapsed > 10000) {
        console.log('[ADAPTIVE] Movement timeout, resetting');
        resetInactivityTimer(get, set);
        set({
          repStartTime: null,
          peakDeviation: 0,
          movingDirection: 'none',
        });
      }
    }
  },

  applyUserOverride: (exerciseId: string, inclineLevel: number, userCount: number) => {
    const state = get();
    const autoCount = state.repCount;

    if (autoCount < 1) {
      console.log('[ADAPTIVE] Override ignored - no reps counted');
      return { adjusted: false, direction: 'none', strong: false };
    }

    const delta = userCount - autoCount;

    // More lenient learning - accept corrections up to 80% difference
    const ratio = Math.abs(delta) / Math.max(autoCount, userCount);
    if (ratio > 0.8) {
      console.log('[ADAPTIVE] Override ignored - delta too large:', ratio.toFixed(2));
      return { adjusted: false, direction: 'none', strong: false };
    }

    const key = getProfileKey(exerciseId, inclineLevel);
    const prevThreshold = safeNum(state.thresholdAdjustments[key]?.factor, 1);
    const prevCooldown = safeNum(state.cooldownAdjustments[key]?.factor, 1);

    // Relative error: >0 means we over-counted, <0 means we under-counted.
    const relError = (autoCount - userCount) / Math.max(userCount, 1);

    // Big-miss escalation: when the tracker was clearly off (2+ reps), learn
    // faster so it converges in one or two corrections instead of many small
    // nudges. Off-by-one stays gentle so a single noisy set doesn't over-swing
    // the calibration. The clamps below still cap how far one correction can go.
    const bigMiss = Math.abs(delta) >= 2;
    const gain = bigMiss ? 2 : 1;

    let newThreshold = prevThreshold;
    let newCooldown = prevCooldown;

    if (delta < 0) {
      // OVER-counting. On this machine the cause is almost always the rep's
      // return-stroke being counted as a second rep. The fix is TIME, not
      // strength: lengthen the cooldown so the return-stroke falls inside it.
      // We scale by how badly we over-counted, so a clean 2x (auto 16 / user 8)
      // roughly doubles the cooldown in a single correction.
      // We deliberately DON'T raise the strength threshold here — the return-
      // stroke is just as strong as the real push, so raising it wouldn't drop
      // the phantom rep, it would start dropping genuine reps instead.
      newCooldown = prevCooldown * (1 + 0.8 * gain * Math.min(relError, 1.5));
    } else if (delta > 0) {
      // UNDER-counting. Two possible causes, so nudge both gently:
      //  - real reps were too weak to trigger  → lower the strength threshold
      //  - the cooldown swallowed a genuine rep → shorten the cooldown
      newThreshold = prevThreshold * (1 - 0.05 * gain * Math.min(delta, 3));
      newCooldown = prevCooldown * (1 + 0.4 * gain * Math.max(relError, -0.5)); // relError<0 → shrinks
    }

    // Clamp to sane ranges. Cooldown can grow more (double-count fixes need it).
    newThreshold = Math.max(0.5, Math.min(2.0, newThreshold));
    newCooldown = Math.max(0.5, Math.min(3.0, newCooldown));

    const newThresholdAdjustments = {
      ...state.thresholdAdjustments,
      [key]: { factor: newThreshold },
    };
    const newCooldownAdjustments = {
      ...state.cooldownAdjustments,
      [key]: { factor: newCooldown },
    };

    set({
      thresholdAdjustments: newThresholdAdjustments,
      cooldownAdjustments: newCooldownAdjustments,
    });

    persistAdjustments(newThresholdAdjustments, newCooldownAdjustments);

    console.log('[ADAPTIVE] Override learned. Delta:', delta,
                '| big miss:', bigMiss,
                '| strength factor:', newThreshold.toFixed(3),
                '| cooldown factor:', newCooldown.toFixed(3));

    // delta < 0 → we were over-counting, so we tightened up.
    // delta > 0 → we were under-counting, so we loosened up to catch more.
    return {
      adjusted: true,
      direction: delta < 0 ? 'tighter' : 'looser',
      strong: bigMiss,
    };
  },

  getProfile: (exerciseId: string, inclineLevel: number) => {
    const key = getProfileKey(exerciseId, inclineLevel);
    return get().profiles[key] ?? null;
  },

  getCooldownFactor: (exerciseId: string, inclineLevel: number) => {
    const key = getProfileKey(exerciseId, inclineLevel);
    return safeNum(get().cooldownAdjustments[key]?.factor, 1);
  },

  loadFromStorage: async () => {
    try {
      const [profileData, adjustmentData] = await Promise.all([
        AsyncStorage.getItem(PROFILES_STORAGE_KEY),
        AsyncStorage.getItem(ADJUSTMENTS_STORAGE_KEY),
      ]);

      const update: Partial<AdaptiveRepState> = { isLoaded: true };

      if (profileData) {
        const parsed = JSON.parse(profileData);
        Object.values(parsed).forEach((profile: any) => {
          profile.lastUpdated = new Date(profile.lastUpdated);
        });
        update.profiles = parsed;
        console.log('[ADAPTIVE] Loaded', Object.keys(parsed).length, 'exercise profiles');
      }

      if (adjustmentData) {
        const parsed = JSON.parse(adjustmentData);
        update.thresholdAdjustments = parsed.thresholds ?? {};
        update.cooldownAdjustments = parsed.cooldowns ?? {};
        console.log('[ADAPTIVE] Loaded correction adjustments for',
                    Object.keys(parsed.cooldowns ?? {}).length, 'exercise+level combos');
      }

      set(update);
    } catch (error) {
      console.error('[ADAPTIVE] Failed to load profiles/adjustments:', error);
      set({ isLoaded: true });
    }
  },
}));

// ===== HELPER FUNCTIONS =====

function calculateVariance(values: number[]): number {
  if (values.length < 2) return Infinity;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

function calculateConfidence(timings: RepTiming[]): number {
  if (timings.length < 2) return 0.5;

  const durations = timings
    .map(t => t.duration)
    .filter((d): d is number => d !== null);

  if (durations.length < 2) return 0.5;

  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  const timingConfidence = Math.max(0, 1 - cv);
  return Math.min(1, Math.max(0, timingConfidence));
}

function updateProfileROM(state: AdaptiveRepState, set: (partial: Partial<AdaptiveRepState>) => void) {
  const exerciseId = state._currentExerciseId;
  const inclineLevel = state._currentInclineLevel;
  if (!exerciseId || inclineLevel === null) return;
  if (state.measuredPeaks.length === 0) return;

  const key = getProfileKey(exerciseId, inclineLevel);
  const existing = state.profiles[key];

  // Only learn from finite peaks — a stray NaN/Infinity would poison the whole profile.
  const validPeaks = state.measuredPeaks.filter(p => Number.isFinite(p));
  if (validPeaks.length === 0) return;

  const avgMeasuredROM = validPeaks.reduce((a, b) => a + b, 0) / validPeaks.length;
  // Calculate minimum peak as 80% of the smallest peak we saw, but cap it at
  // 70% of the average ROM. This prevents "threshold runaway" where one very
  // strong rep sets an impossible standard for the rest of the set.
  const minMeasuredPeak = Math.min(
    Math.min(...validPeaks) * 0.8,
    avgMeasuredROM * 0.7
  );

  let newProfile: ExerciseProfile;

  if (!existing || existing.sampleCount === 0) {
    newProfile = {
      exerciseId,
      inclineLevel,
      avgROM: avgMeasuredROM,
      minPeak: Math.max(minMeasuredPeak, 0.10), // At least 0.10, but learned from actual reps
      romConfidence: C.INITIAL_ROM_CONFIDENCE,
      sampleCount: validPeaks.length,
      lastUpdated: new Date(),
    };
  } else {
    // Guard the existing values: a legacy/partial profile may have undefined or
    // NaN fields, and `undefined * number` / `NaN * number` would poison the blend.
    const existingAvgROM = safeNum(existing.avgROM, avgMeasuredROM);
    const existingMinPeak = safeNum(existing.minPeak, Math.max(minMeasuredPeak, 0.10));

    const newAvgROM = (1 - C.ROM_UPDATE_WEIGHT) * existingAvgROM +
                      C.ROM_UPDATE_WEIGHT * avgMeasuredROM;
    // Blend the minPeak as well
    const newMinPeak = (1 - C.ROM_UPDATE_WEIGHT) * existingMinPeak +
                       C.ROM_UPDATE_WEIGHT * Math.max(minMeasuredPeak, 0.10);

    newProfile = {
      ...existing,
      avgROM: newAvgROM,
      minPeak: newMinPeak,
      romConfidence: Math.min(1, safeNum(existing.romConfidence, 0) + 0.1),
      sampleCount: safeNum(existing.sampleCount, 0) + validPeaks.length,
      lastUpdated: new Date(),
    };
  }

  const newProfiles = { ...state.profiles, [key]: newProfile };
  set({ profiles: newProfiles });

  AsyncStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(newProfiles))
    .then(() => {
      console.log('[ADAPTIVE] Successfully saved learned profile for', exerciseId);
    })
    .catch(err => {
      console.error('[ADAPTIVE] Failed to save profiles:', err);
    });

  console.log('[ADAPTIVE] Profile updated. avgROM:', newProfile.avgROM.toFixed(2),
              'minPeak:', newProfile.minPeak.toFixed(2),
              'samples:', newProfile.sampleCount);
}

// Track the timer ID outside of state to avoid Zustand batching issues
let globalInactivityTimer: ReturnType<typeof setTimeout> | null = null;
let timerStartTime: number = 0;

function startInactivityTimer(
  get: () => AdaptiveRepState,
  set: (partial: Partial<AdaptiveRepState>) => void
) {
  // Clear any existing timer first
  if (globalInactivityTimer) {
    clearTimeout(globalInactivityTimer);
    globalInactivityTimer = null;
  }

  timerStartTime = Date.now();
  console.log('[ADAPTIVE] Starting inactivity timer for', C.INACTIVITY_TIMEOUT_MS, 'ms');

  globalInactivityTimer = setTimeout(() => {
    const currentState = get();
    const elapsed = Date.now() - timerStartTime;
    console.log('[ADAPTIVE] Inactivity timer fired after', elapsed, 'ms, state:', currentState.setState);

    if (currentState.setState === 'SET_ACTIVE') {
      console.log('[ADAPTIVE] Auto-ending set due to inactivity');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      globalInactivityTimer = null;
      set({ setState: 'SET_ENDED' });
    }
  }, C.INACTIVITY_TIMEOUT_MS);
}

function resetInactivityTimer(
  get: () => AdaptiveRepState,
  set: (partial: Partial<AdaptiveRepState>) => void
) {
  console.log('[ADAPTIVE] Resetting inactivity timer');
  startInactivityTimer(get, set);
}

function clearInactivityTimer() {
  if (globalInactivityTimer) {
    console.log('[ADAPTIVE] Clearing inactivity timer');
    clearTimeout(globalInactivityTimer);
    globalInactivityTimer = null;
  }
}
