import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MotionCalibration } from './types';

const CALIBRATION_STORAGE_KEY = 'motion-calibration';

// Generate a unique key for exercise + incline combination
function getCalibrationKey(exercise: string, inclineLevel: number): string {
  return `${exercise}::${inclineLevel}`;
}

interface MotionCalibrationState {
  calibrations: Record<string, MotionCalibration>;
  isLoaded: boolean;

  // Get calibration for specific exercise/incline
  getCalibration: (exercise: string, inclineLevel: number) => MotionCalibration | null;

  // Update calibration with new rep data
  updateCalibration: (
    exercise: string,
    inclineLevel: number,
    peakDeviation: number,
    repDuration: number
  ) => void;

  // Load from storage
  loadFromStorage: () => Promise<void>;

  // Clear all calibrations (for testing/reset)
  clearAll: () => Promise<void>;
}

export const useMotionCalibrationStore = create<MotionCalibrationState>((set, get) => ({
  calibrations: {},
  isLoaded: false,

  getCalibration: (exercise: string, inclineLevel: number) => {
    const key = getCalibrationKey(exercise, inclineLevel);
    return get().calibrations[key] ?? null;
  },

  updateCalibration: async (
    exercise: string,
    inclineLevel: number,
    peakDeviation: number,
    repDuration: number
  ) => {
    const key = getCalibrationKey(exercise, inclineLevel);
    const existing = get().calibrations[key];

    let newCalibration: MotionCalibration;

    if (existing) {
      // Blend with existing data (weighted average favoring newer data)
      const weight = Math.min(existing.sampleCount, 10); // Cap influence of old data
      const newWeight = 2; // New rep has more influence
      const totalWeight = weight + newWeight;

      newCalibration = {
        exercise,
        inclineLevel,
        peakDeviation: (existing.peakDeviation * weight + peakDeviation * newWeight) / totalWeight,
        repDuration: (existing.repDuration * weight + repDuration * newWeight) / totalWeight,
        sampleCount: existing.sampleCount + 1,
        lastUpdated: new Date(),
      };
    } else {
      // First calibration for this exercise/incline
      newCalibration = {
        exercise,
        inclineLevel,
        peakDeviation,
        repDuration,
        sampleCount: 1,
        lastUpdated: new Date(),
      };
    }

    const newCalibrations = {
      ...get().calibrations,
      [key]: newCalibration,
    };

    set({ calibrations: newCalibrations });

    // Persist to storage
    try {
      await AsyncStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(newCalibrations));
    } catch (error) {
      console.error('Failed to save motion calibration:', error);
    }
  },

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem(CALIBRATION_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Convert date strings back to Date objects
        Object.values(parsed).forEach((cal: any) => {
          cal.lastUpdated = new Date(cal.lastUpdated);
        });
        set({ calibrations: parsed, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      console.error('Failed to load motion calibration:', error);
      set({ isLoaded: true });
    }
  },

  clearAll: async () => {
    set({ calibrations: {} });
    try {
      await AsyncStorage.removeItem(CALIBRATION_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear motion calibration:', error);
    }
  },
}));
