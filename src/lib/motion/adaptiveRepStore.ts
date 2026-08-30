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

function persistAdjustments(
  thresholds: Record<string, { factor: number }>,
  cooldowns: Record<string, { factor: number }>,
) {
  const data = JSON.stringify({ thresholds, cooldowns });
  AsyncStorage.setItem(ADJUSTMENTS_STORAGE_KEY, data)
    .then(() => {
      console.log('[ADAPTIVE] Successfully saved learned adjustments');
    })
    .catch(err => {
      console.error('[ADAPTIVE] Failed to save adjustments:', err);
    });
}

function getProfileKey(exerciseId: string, inclineLevel: number): string {
  return `${exerciseId}::${inclineLevel}`;
}

export interface OverrideResult {
  adjusted: boolean;
  direction: 'tighter' | 'looser' | 'none';
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

  thresholdAdjustments: Record<string, { factor: number }>;
  cooldownAdjustments: Record<string, { factor: number }>;

  _sensitivityMultiplier: number;
  _expectedRepMs: number;
  _minRepDurationMs: number;
  _repCooldownMs: number;
  _setupDelayMs: number;

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

  getProfile: (exerciseId: string, inclineLevel: number) => ExerciseProfile | null;
  getCooldownFactor: (exerciseId: string, inclineLevel: number) => number;
  loadFromStorage: () => Promise<void>;

  _currentExerciseId: string | null;
  _currentInclineLevel: number | null;
}

const MIN_PEAK_FOR_REP = 0.07;
const SMOOTHING_WINDOW = 10;

function safeNum(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const useAdaptiveRepStore = create<AdaptiveRepState>((set, get) => ({
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
    set({ setState: 'SET_IDLE' });
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
      _expectedRepMs: (repCooldownMs / 0.85),
      _minRepDurationMs: minRepDurationMs,
      _repCooldownMs: repCooldownMs,
      _setupDelayMs: setupDelayMs,
      _currentExerciseId: exerciseId,
      _currentInclineLevel: inclineLevel,
    });
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

    set({ setState: 'SET_IDLE' });
    return summary;
  },

  processMotion: (accelMagnitude: number) => {
    const state = get();
    if (state.setState !== 'SET_ACTIVE') return;

    const now = Date.now();
    const newHistory = [...state.accelHistory.slice(-(SMOOTHING_WINDOW * 3 - 1)), accelMagnitude];
    set({ accelHistory: newHistory });

    if (state.ignoreMotion) {
      if (newHistory.length < SMOOTHING_WINDOW) return;

      const variance = calculateVariance(newHistory);
      const setupElapsed = state.setStartTime > 0 ? now - state.setStartTime : 0;
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
          startInactivityTimer(get, set);
        }
      } else {
        set({ stabilizationStartTime: null });
      }
      return;
    }

    if (now < state.repCooldownUntil) return;

    const exerciseId = state._currentExerciseId;
    const inclineLevel = state._currentInclineLevel;
    if (!exerciseId || inclineLevel === null) return;

    const profile = state.profiles[getProfileKey(exerciseId, inclineLevel)];
    const adjustment = state.thresholdAdjustments[getProfileKey(exerciseId, inclineLevel)]?.factor ?? 1;

    const recentAccel = newHistory.slice(-SMOOTHING_WINDOW);
    const smoothedAccel = recentAccel.reduce((a, b) => a + b, 0) / recentAccel.length;
    const deviation = Math.abs(smoothedAccel - state.baselineAccel);
    const sens = state._sensitivityMultiplier;
    const paceFactor = Math.max(0.5, Math.min(1.0, 2.0 / (state._expectedRepMs / 1000 || 2.0)));

    const triggerThreshold = state.isLearningROM
      ? 0.05 * sens * paceFactor
      : Math.max(safeNum(profile?.avgROM, 0.4) * 0.5 * adjustment * sens * paceFactor, 0.07);

    const returnThreshold = 0.07 * sens;

    if (deviation > state.peakDeviation) {
      set({ peakDeviation: deviation });
    }

    const currentDirection = state.movingDirection;

    if (currentDirection === 'none' && deviation > triggerThreshold) {
      set({
        movingDirection: 'away',
        repStartTime: now,
        peakDeviation: deviation,
      });
      resetInactivityTimer(get, set);
    }
    else if (currentDirection === 'away') {
      if (deviation < state.peakDeviation * 0.5 && state.peakDeviation > triggerThreshold * 1.1) {
        set({ movingDirection: 'returning' });
      }
    }
    else if (currentDirection === 'returning' && deviation < returnThreshold) {
      const repDuration = now - (state.repStartTime ?? now);
      const peak = state.peakDeviation;

      const rawMinPeak = state.isLearningROM
        ? MIN_PEAK_FOR_REP
        : safeNum(profile?.minPeak, MIN_PEAK_FOR_REP);

      const activeMinPeak = Math.max(rawMinPeak * adjustment * sens * paceFactor, 0.07);

      if (repDuration >= state._minRepDurationMs && peak >= activeMinPeak) {
        const newRepCount = state.repCount + 1;
        const timing: RepTiming = {
          startTime: state.repStartTime ?? now,
          upReachedTime: null,
          endTime: now,
          duration: repDuration,
        };

        const newPeaks = [...state.measuredPeaks, peak];
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

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

        resetInactivityTimer(get, set);

        if (state.isLearningROM && newPeaks.length >= C.ROM_LEARNING_REPS) {
          set({ isLearningROM: false });
        }
      } else {
        resetInactivityTimer(get, set);
        set({ repStartTime: null, peakDeviation: 0, movingDirection: 'none' });
      }
    }

    if (currentDirection !== 'none' && state.repStartTime) {
      const elapsed = now - state.repStartTime;
      if (elapsed > 10000) {
        resetInactivityTimer(get, set);
        set({ repStartTime: null, peakDeviation: 0, movingDirection: 'none' });
      }
    }
  },

  applyUserOverride: (exerciseId: string, inclineLevel: number, userCount: number) => {
    const state = get();
    const autoCount = state.repCount;
    if (autoCount < 1) return { adjusted: false, direction: 'none', strong: false };

    const delta = userCount - autoCount;
    const ratio = Math.abs(delta) / Math.max(autoCount, userCount);
    if (ratio > 0.8) return { adjusted: false, direction: 'none', strong: false };

    const key = getProfileKey(exerciseId, inclineLevel);
    const prevThreshold = safeNum(state.thresholdAdjustments[key]?.factor, 1);
    const prevCooldown = safeNum(state.cooldownAdjustments[key]?.factor, 1);
    const relError = (autoCount - userCount) / Math.max(userCount, 1);
    const bigMiss = Math.abs(delta) >= 2;
    const gain = bigMiss ? 2 : 1;

    let newThreshold = prevThreshold;
    let newCooldown = prevCooldown;

    if (delta < 0) {
      newCooldown = prevCooldown * (1 + 0.8 * gain * Math.min(relError, 1.5));
    } else if (delta > 0) {
      newThreshold = prevThreshold * (1 - 0.05 * gain * Math.min(delta, 3));
      newCooldown = prevCooldown * (1 + 0.4 * gain * Math.max(relError, -0.5));
    }

    newThreshold = Math.max(0.5, Math.min(2.0, newThreshold));
    newCooldown = Math.max(0.5, Math.min(3.0, newCooldown));

    const newThresholdAdjustments = { ...state.thresholdAdjustments, [key]: { factor: newThreshold } };
    const newCooldownAdjustments = { ...state.cooldownAdjustments, [key]: { factor: newCooldown } };

    set({ thresholdAdjustments: newThresholdAdjustments, cooldownAdjustments: newCooldownAdjustments });
    persistAdjustments(newThresholdAdjustments, newCooldownAdjustments);

    return { adjusted: true, direction: delta < 0 ? 'tighter' : 'looser', strong: bigMiss };
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
        Object.values(parsed).forEach((profile: any) => { profile.lastUpdated = new Date(profile.lastUpdated); });
        update.profiles = parsed;
      }
      if (adjustmentData) {
        const parsed = JSON.parse(adjustmentData);
        update.thresholdAdjustments = parsed.thresholds ?? {};
        update.cooldownAdjustments = parsed.cooldowns ?? {};
      }
      set(update);
    } catch (error) {
      set({ isLoaded: true });
    }
  },
}));

function calculateVariance(values: number[]): number {
  if (values.length < 2) return Infinity;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

function calculateConfidence(timings: RepTiming[]): number {
  if (timings.length < 2) return 0.5;
  const durations = timings.map(t => t.duration).filter((d): d is number => d !== null);
  if (durations.length < 2) return 0.5;
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.min(1, Math.max(0, 1 - cv));
}

function updateProfileROM(state: AdaptiveRepState, set: (partial: Partial<AdaptiveRepState>) => void) {
  const exerciseId = state._currentExerciseId;
  const inclineLevel = state._currentInclineLevel;
  if (!exerciseId || inclineLevel === null) return;
  const key = getProfileKey(exerciseId, inclineLevel);
  const existing = state.profiles[key];
  const validPeaks = state.measuredPeaks.filter(p => Number.isFinite(p));
  if (validPeaks.length === 0) return;
  const avgMeasuredROM = validPeaks.reduce((a, b) => a + b, 0) / validPeaks.length;
  const minMeasuredPeak = Math.min(Math.min(...validPeaks) * 0.8, avgMeasuredROM * 0.7);
  let newProfile: ExerciseProfile;
  if (!existing || existing.sampleCount === 0) {
    newProfile = { exerciseId, inclineLevel, avgROM: avgMeasuredROM, minPeak: Math.max(minMeasuredPeak, 0.10), romConfidence: C.INITIAL_ROM_CONFIDENCE, sampleCount: validPeaks.length, lastUpdated: new Date() };
  } else {
    const existingAvgROM = safeNum(existing.avgROM, avgMeasuredROM);
    const existingMinPeak = safeNum(existing.minPeak, Math.max(minMeasuredPeak, 0.10));
    const newAvgROM = (1 - C.ROM_UPDATE_WEIGHT) * existingAvgROM + C.ROM_UPDATE_WEIGHT * avgMeasuredROM;
    const newMinPeak = (1 - C.ROM_UPDATE_WEIGHT) * existingMinPeak + C.ROM_UPDATE_WEIGHT * Math.max(minMeasuredPeak, 0.10);
    newProfile = { ...existing, avgROM: newAvgROM, minPeak: newMinPeak, romConfidence: Math.min(1, safeNum(existing.romConfidence, 0) + 0.1), sampleCount: safeNum(existing.sampleCount, 0) + validPeaks.length, lastUpdated: new Date() };
  }
  const newProfiles = { ...state.profiles, [key]: newProfile };
  set({ profiles: newProfiles });
  AsyncStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(newProfiles)).catch(() => {});
}

let globalInactivityTimer: ReturnType<typeof setTimeout> | null = null;
let timerStartTime: number = 0;

function startInactivityTimer(get: () => AdaptiveRepState, set: (partial: Partial<AdaptiveRepState>) => void) {
  if (globalInactivityTimer) clearTimeout(globalInactivityTimer);
  timerStartTime = Date.now();
  globalInactivityTimer = setTimeout(() => {
    const currentState = get();
    if (currentState.setState === 'SET_ACTIVE') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      globalInactivityTimer = null;
      set({ setState: 'SET_ENDED' });
    }
  }, C.INACTIVITY_TIMEOUT_MS);
}

function resetInactivityTimer(get: () => AdaptiveRepState, set: (partial: Partial<AdaptiveRepState>) => void) {
  startInactivityTimer(get, set);
}

function clearInactivityTimer() {
  if (globalInactivityTimer) {
    clearTimeout(globalInactivityTimer);
    globalInactivityTimer = null;
  }
}
