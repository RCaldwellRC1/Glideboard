import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureDeviceId } from '@/lib/remoteLog';
import type { CoachRoutine } from './types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const COACH_STORAGE_KEY = 'coach-store';
const PROFILE_STORAGE_KEY = 'user-profile';

export interface CoachCompletion {
  routineId: string;
  index: number;        // 1-based completion count for that routine
  completedAt: string;  // ISO string
  // The workout this completion produced, so the Trophies screen can open its
  // full summary. Absent on completions recorded before this was added.
  workoutId?: string;
}

interface CoachState {
  acknowledged: boolean;
  acknowledgedAt: string | null;
  // Per-routine "Don't show me the instructions again" preference.
  dontShowInstructions: Record<string, boolean>;
  completions: CoachCompletion[];
  // User-built routines, saved on this device only.
  customRoutines: CoachRoutine[];
  // Customized versions of built-in or custom routines.
  // Keyed by routineId.
  customizedRoutines: Record<string, CoachRoutine>;
  isLoaded: boolean;

  loadFromStorage: () => Promise<void>;
  acknowledge: (routineId: string) => Promise<void>;
  setDontShowInstructions: (routineId: string, value: boolean) => void;
  // Records a completion locally + on the backend and returns the new entry
  // (so the runner can show the right tier / finale). workoutId links it to the
  // saved workout for the summary view.
  recordCompletion: (routineId: string, workoutId?: string) => CoachCompletion;
  // Save a new "build your own" routine to the device.
  addCustomRoutine: (routine: CoachRoutine) => void;
  // Replace an existing custom routine (matched by id) with an edited version.
  updateCustomRoutine: (routine: CoachRoutine) => void;
  // Remove a custom routine (and its saved preferences) from the device.
  deleteCustomRoutine: (routineId: string) => void;
  // Customize any routine (built-in or custom).
  customizeRoutine: (routine: CoachRoutine) => void;
  // Revert a routine to its original default state.
  resetRoutine: (routineId: string) => void;
}

// Pull the user's display name from the saved profile, matching what the
// Profile screen and remoteLog use as the "user" tag.
async function getUserTag(): Promise<string> {
  try {
    const data = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
    if (data) {
      const p = JSON.parse(data);
      return p.screenName || p.name || '';
    }
  } catch {
    // ignore
  }
  return '';
}

export const useCoachStore = create<CoachState>((set, get) => {
  const persist = async () => {
    try {
      const s = get();
      await AsyncStorage.setItem(COACH_STORAGE_KEY, JSON.stringify({
        acknowledged: s.acknowledged,
        acknowledgedAt: s.acknowledgedAt,
        dontShowInstructions: s.dontShowInstructions,
        completions: s.completions,
        customRoutines: s.customRoutines,
        customizedRoutines: s.customizedRoutines,
      }));
    } catch (error) {
      console.error('Failed to save coach data:', error);
    }
  };

  return {
    acknowledged: false,
    acknowledgedAt: null,
    dontShowInstructions: {},
    completions: [],
    customRoutines: [],
    customizedRoutines: {},
    isLoaded: false,

    loadFromStorage: async () => {
      try {
        const data = await AsyncStorage.getItem(COACH_STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data);
          set({
            acknowledged: parsed.acknowledged ?? false,
            acknowledgedAt: parsed.acknowledgedAt ?? null,
            dontShowInstructions: parsed.dontShowInstructions ?? {},
            completions: Array.isArray(parsed.completions) ? parsed.completions : [],
            customRoutines: Array.isArray(parsed.customRoutines) ? parsed.customRoutines : [],
            customizedRoutines: parsed.customizedRoutines ?? {},
            isLoaded: true,
          });
        } else {
          set({ isLoaded: true });
        }
      } catch (error) {
        console.error('Failed to load coach data:', error);
        set({ isLoaded: true });
      }
    },

    acknowledge: async (routineId: string) => {
      const at = new Date().toISOString();
      set({ acknowledged: true, acknowledgedAt: at });
      persist();

      // Best-effort backend record (device + name + date).
      try {
        const deviceId = await ensureDeviceId();
        const userTag = await getUserTag();
        if (BACKEND_URL) {
          fetch(`${BACKEND_URL}/api/coach/acknowledge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, userTag, routineId }),
          }).catch(() => {});
        }
      } catch {
        // never block the UI
      }
    },

    setDontShowInstructions: (routineId: string, value: boolean) => {
      set(prev => ({
        dontShowInstructions: { ...prev.dontShowInstructions, [routineId]: value },
      }));
      persist();
    },

    recordCompletion: (routineId: string, workoutId?: string) => {
      const state = get();
      const priorForRoutine = state.completions.filter(c => c.routineId === routineId).length;
      const entry: CoachCompletion = {
        routineId,
        index: priorForRoutine + 1,
        completedAt: new Date().toISOString(),
        ...(workoutId ? { workoutId } : {}),
      };
      set({ completions: [...state.completions, entry] });
      persist();

      // Best-effort backend record.
      (async () => {
        try {
          const deviceId = await ensureDeviceId();
          const userTag = await getUserTag();
          if (BACKEND_URL) {
            fetch(`${BACKEND_URL}/api/coach/complete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deviceId,
                userTag,
                routineId,
                completionIndex: entry.index,
                completedAt: entry.completedAt,
              }),
            }).catch(() => {});
          }
        } catch {
          // ignore
        }
      })();

      return entry;
    },

    addCustomRoutine: (routine: CoachRoutine) => {
      set(prev => ({ customRoutines: [...prev.customRoutines, routine] }));
      persist();
    },

    updateCustomRoutine: (routine: CoachRoutine) => {
      set(prev => ({
        customRoutines: prev.customRoutines.map(r => (r.id === routine.id ? routine : r)),
      }));
      persist();
    },

    deleteCustomRoutine: (routineId: string) => {
      set(prev => {
        // Drop the routine, its "don't show instructions" flag, and any
        // recorded completions so nothing dangles after deletion.
        const { [routineId]: _removed, ...restDontShow } = prev.dontShowInstructions;
        const { [routineId]: _customizedRemoved, ...restCustomized } = prev.customizedRoutines;
        return {
          customRoutines: prev.customRoutines.filter(r => r.id !== routineId),
          dontShowInstructions: restDontShow,
          customizedRoutines: restCustomized,
          completions: prev.completions.filter(c => c.routineId !== routineId),
        };
      });
      persist();
    },

    customizeRoutine: (routine: CoachRoutine) => {
      set(prev => ({
        customizedRoutines: { ...prev.customizedRoutines, [routine.id]: routine },
      }));
      persist();
    },

    resetRoutine: (routineId: string) => {
      set(prev => {
        const { [routineId]: _removed, ...rest } = prev.customizedRoutines;
        return { customizedRoutines: rest };
      });
      persist();
    },
  };
});
