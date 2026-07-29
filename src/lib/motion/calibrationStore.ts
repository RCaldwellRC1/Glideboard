import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RepCalibration, Rotation, RepPhase } from './types';

const CALIBRATION_STORAGE_KEY = 'motion-calibrations';

interface CalibrationState {
  // Stored calibrations (keyed by "exercise-inclineLevel")
  calibrations: Map<string, RepCalibration>;

  // Calibration mode state
  isCalibrating: boolean;
  calibrationExercise: string | null;
  calibrationIncline: number | null;
  calibrationPhase: 'idle' | 'recording_rest' | 'recording_reps' | 'complete';
  calibrationReps: number;
  calibrationSamples: Rotation[];

  // Rep detection state
  currentPhase: RepPhase;
  lastRepTime: number;
  lastMotionTime: number;

  // Actions
  startCalibration: (exercise: string, inclineLevel: number) => void;
  recordRestPosition: (rotation: Rotation) => void;
  recordRepSample: (rotation: Rotation) => void;
  finishCalibration: () => void;
  cancelCalibration: () => void;

  getCalibration: (exercise: string, inclineLevel: number) => RepCalibration | null;
  hasCalibration: (exercise: string, inclineLevel: number) => boolean;

  // Rep detection
  detectRep: (rotation: Rotation, calibration: RepCalibration) => boolean;
  updateMotionTime: () => void;
  isIdle: () => boolean;

  loadFromStorage: () => Promise<void>;
}

function getCalibrationKey(exercise: string, inclineLevel: number): string {
  return `${exercise}-${inclineLevel}`;
}

export const useCalibrationStore = create<CalibrationState>((set, get) => ({
  calibrations: new Map(),

  isCalibrating: false,
  calibrationExercise: null,
  calibrationIncline: null,
  calibrationPhase: 'idle',
  calibrationReps: 0,
  calibrationSamples: [],

  currentPhase: 'rest',
  lastRepTime: 0,
  lastMotionTime: Date.now(),

  startCalibration: (exercise: string, inclineLevel: number) => {
    set({
      isCalibrating: true,
      calibrationExercise: exercise,
      calibrationIncline: inclineLevel,
      calibrationPhase: 'recording_rest',
      calibrationReps: 0,
      calibrationSamples: [],
    });
  },

  recordRestPosition: (rotation: Rotation) => {
    const state = get();
    if (state.calibrationPhase !== 'recording_rest') return;

    set({
      calibrationSamples: [rotation],
      calibrationPhase: 'recording_reps',
    });
  },

  recordRepSample: (rotation: Rotation) => {
    const state = get();
    if (state.calibrationPhase !== 'recording_reps') return;

    const newSamples = [...state.calibrationSamples, rotation];
    const newReps = state.calibrationReps + 1;

    set({
      calibrationSamples: newSamples,
      calibrationReps: newReps,
    });

    // Auto-complete after 5 reps
    if (newReps >= 5) {
      get().finishCalibration();
    }
  },

  finishCalibration: async () => {
    const state = get();
    if (!state.calibrationExercise || state.calibrationIncline === null) return;
    if (state.calibrationSamples.length < 2) return;

    // First sample is rest position, rest are top positions
    const restRotation = state.calibrationSamples[0];
    const topSamples = state.calibrationSamples.slice(1);

    // Average the top positions
    const topRotation: Rotation = {
      alpha: topSamples.reduce((sum, s) => sum + s.alpha, 0) / topSamples.length,
      beta: topSamples.reduce((sum, s) => sum + s.beta, 0) / topSamples.length,
      gamma: topSamples.reduce((sum, s) => sum + s.gamma, 0) / topSamples.length,
    };

    // Calculate threshold as 30% of the total rotation change
    const betaChange = Math.abs(topRotation.beta - restRotation.beta);
    const gammaChange = Math.abs(topRotation.gamma - restRotation.gamma);
    const maxChange = Math.max(betaChange, gammaChange);
    const rotationThreshold = maxChange * 0.3;

    const calibration: RepCalibration = {
      exercise: state.calibrationExercise,
      inclineLevel: state.calibrationIncline,
      restRotation,
      topRotation,
      rotationThreshold: Math.max(rotationThreshold, 5), // minimum 5 degrees
      repDuration: 3000, // default 3 seconds per rep
      calibratedAt: new Date().toISOString(),
    };

    const key = getCalibrationKey(state.calibrationExercise, state.calibrationIncline);
    const newCalibrations = new Map(state.calibrations);
    newCalibrations.set(key, calibration);

    set({
      calibrations: newCalibrations,
      isCalibrating: false,
      calibrationExercise: null,
      calibrationIncline: null,
      calibrationPhase: 'complete',
      calibrationReps: 0,
      calibrationSamples: [],
    });

    // Save to storage
    try {
      const calibrationsObj: Record<string, RepCalibration> = {};
      newCalibrations.forEach((v, k) => {
        calibrationsObj[k] = v;
      });
      await AsyncStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(calibrationsObj));
    } catch (error) {
      console.error('Failed to save calibrations:', error);
    }
  },

  cancelCalibration: () => {
    set({
      isCalibrating: false,
      calibrationExercise: null,
      calibrationIncline: null,
      calibrationPhase: 'idle',
      calibrationReps: 0,
      calibrationSamples: [],
    });
  },

  getCalibration: (exercise: string, inclineLevel: number) => {
    const key = getCalibrationKey(exercise, inclineLevel);
    return get().calibrations.get(key) ?? null;
  },

  hasCalibration: (exercise: string, inclineLevel: number) => {
    const key = getCalibrationKey(exercise, inclineLevel);
    return get().calibrations.has(key);
  },

  detectRep: (rotation: Rotation, calibration: RepCalibration) => {
    const state = get();
    const { restRotation, topRotation, rotationThreshold } = calibration;

    // Calculate how far we are from rest and top positions
    const distFromRest = Math.abs(rotation.beta - restRotation.beta) +
                         Math.abs(rotation.gamma - restRotation.gamma);
    const distFromTop = Math.abs(rotation.beta - topRotation.beta) +
                        Math.abs(rotation.gamma - topRotation.gamma);

    const atRest = distFromRest < rotationThreshold;
    const atTop = distFromTop < rotationThreshold;

    let repDetected = false;

    // State machine for rep detection
    if (state.currentPhase === 'rest' && !atRest && !atTop) {
      // Started moving up
      set({ currentPhase: 'up', lastMotionTime: Date.now() });
    } else if (state.currentPhase === 'up' && atTop) {
      // Reached top
      set({ currentPhase: 'top', lastMotionTime: Date.now() });
    } else if (state.currentPhase === 'top' && !atTop && !atRest) {
      // Started moving down
      set({ currentPhase: 'down', lastMotionTime: Date.now() });
    } else if (state.currentPhase === 'down' && atRest) {
      // Completed rep - back to rest
      repDetected = true;
      set({
        currentPhase: 'rest',
        lastRepTime: Date.now(),
        lastMotionTime: Date.now(),
      });
    }

    return repDetected;
  },

  updateMotionTime: () => {
    set({ lastMotionTime: Date.now() });
  },

  isIdle: () => {
    const state = get();
    const idleTime = Date.now() - state.lastMotionTime;
    return idleTime > 20000; // 20 seconds
  },

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as Record<string, RepCalibration>;
        const calibrations = new Map<string, RepCalibration>();
        Object.entries(parsed).forEach(([key, value]) => {
          calibrations.set(key, value);
        });
        set({ calibrations });
      }
    } catch (error) {
      console.error('Failed to load calibrations:', error);
    }
  },
}));
