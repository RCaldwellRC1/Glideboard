import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureDeviceId } from '@/lib/remoteLog';
import type { CoachRoutine } from './types';
import type { WeeklyReport, PerformanceGrade } from './reportTypes';
import { useWorkoutStore, type Workout } from '@/lib/workout';
import { getMuscleGroup } from './muscleMapping';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const COACH_STORAGE_KEY = 'coach-store';
const REPORTS_STORAGE_KEY = 'coach-reports-v1';
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

  // --- Reports & Goals ---
  reports: WeeklyReport[];
  currentReport: WeeklyReport | null;
  generateReportIfNeeded: () => void;
  setGoals: (reportId: string, tactical: string, identity: string) => void;
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

    reports: [],
    currentReport: null,

    loadFromStorage: async () => {
      try {
        const [coachData, reportData] = await Promise.all([
          AsyncStorage.getItem(COACH_STORAGE_KEY),
          AsyncStorage.getItem(REPORTS_STORAGE_KEY),
        ]);

        if (coachData) {
          const parsed = JSON.parse(coachData);
          set({
            acknowledged: parsed.acknowledged ?? false,
            acknowledgedAt: parsed.acknowledgedAt ?? null,
            dontShowInstructions: parsed.dontShowInstructions ?? {},
            completions: Array.isArray(parsed.completions) ? parsed.completions : [],
            customRoutines: Array.isArray(parsed.customRoutines) ? parsed.customRoutines : [],
            customizedRoutines: parsed.customizedRoutines ?? {},
          });
        }

        if (reportData) {
          const parsedReports = JSON.parse(reportData);
          set({ reports: parsedReports });
        }

        set({ isLoaded: true });
      } catch (error) {
        console.error('Failed to load coach/report data:', error);
        set({ isLoaded: true });
      }
    },

    generateReportIfNeeded: () => {
      const { reports } = get();
      const now = new Date();

      // Calculate most recent Sunday at 4:00 AM
      const lastSunday = new Date(now);
      lastSunday.setDate(now.getDate() - now.getDay());
      lastSunday.setHours(4, 0, 0, 0);

      // If it's currently Sunday before 4 AM, we actually want the PREVIOUS Sunday
      if (now.getDay() === 0 && now.getHours() < 4) {
        lastSunday.setDate(lastSunday.getDate() - 7);
      }

      const reportId = lastSunday.toISOString().split('T')[0];

      // Check if we already have a full report for this Sunday
      const existing = reports.find(r => r.id === reportId);
      if (existing && existing.categoryBreakdown.length > 0) {
        set({ currentReport: existing });
        return;
      }

      // Generate the snapshot
      const workoutHistory = useWorkoutStore.getState().workoutHistory;
      const newReport = buildReport(reportId, lastSunday, workoutHistory);

      const newReports = [newReport, ...reports].slice(0, 12); // Keep last 12 reports
      set({ reports: newReports, currentReport: newReport });
      AsyncStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(newReports));
    },

    setGoals: (reportId: string, tactical: string, identity: string) => {
      try {
        const { reports } = get();
        const updated = reports.map(r => {
          if (r.id === reportId) {
            return {
              ...r,
              goals: { tactical, identity, timestamp: new Date().toISOString() },
            };
          }
          return r;
        });

        // Find the newly updated report to set as current
        const nextCurrent = updated.find(r => r.id === reportId) || null;

        set({ reports: updated, currentReport: nextCurrent });
        AsyncStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(updated)).catch(e => {
          console.error('[COACH] Failed to persist goals:', e);
        });
        remoteLog('coach_goals_set', { tactical, identity });
      } catch (err) {
        console.error('[COACH] Error in setGoals:', err);
      }
    },
  };
});

/**
 * The Data Aggregator Math
 */
function buildReport(id: string, sundayDate: Date, history: Workout[]): WeeklyReport {
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const WINDOW_MS = 8 * ONE_WEEK_MS;

  const endTs = Date.now(); // Always use "Now" for the 8-week lookback
  const startTs = endTs - WINDOW_MS;
  const prevStartTs = startTs - WINDOW_MS;

  const currentWindow = history.filter(w => {
    const t = new Date(w.date).getTime();
    return t >= startTs && t <= endTs;
  });

  const prevWindow = history.filter(w => {
    const t = new Date(w.date).getTime();
    return t >= prevStartTs && t < startTs;
  });

  // Calculate Averages
  const workoutsPerWeek = currentWindow.length / 8;
  const grade: PerformanceGrade = workoutsPerWeek >= 4 ? 'A' : workoutsPerWeek >= 3 ? 'B' : workoutsPerWeek >= 2 ? 'C' : workoutsPerWeek >= 1 ? 'D' : 'F';

  // Category Breakdown - Always show ALL groups
  const ALL_GROUPS = ['LEGS', 'CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'CORE'];
  const categoryMap = new Map<string, { sets: number; reps: number; tut: number }>();

  ALL_GROUPS.forEach(group => {
    categoryMap.set(group, { sets: 0, reps: 0, tut: 0 });
  });

  let coreSets = 0;

  currentWindow.forEach(w => {
    if (!w || !Array.isArray(w.sets)) return;
    w.sets.forEach(s => {
      const group = getMuscleGroup(s.exercise);
      const stats = categoryMap.get(group) || { sets: 0, reps: 0, tut: 0 };
      stats.sets += 1;

      const reps = s.reps ?? 0;
      stats.reps += reps;

      // Smart TUT Estimation for back-filling 8-week history:
      // 1. Use actual measured tutSeconds if available (Build 292+)
      // 2. Use durationSeconds for Timed exercises
      // 3. Fallback to 3.5s per rep for legacy Standard/Freestyle sets
      const measuredTUT = s.tutSeconds ?? 0;
      const timedTUT = s.kind === 'timed' ? (s.durationSeconds ?? 0) : 0;

      let finalTUT = measuredTUT > 0 ? measuredTUT : timedTUT;
      if (finalTUT === 0 && reps > 0) {
        finalTUT = reps * 3.5; // Backfill with 3.5s/rep average
      }

      stats.tut += finalTUT;
      categoryMap.set(group, stats);

      if (group === 'CORE') coreSets += 1;
    });
  });

  const breakdown = Array.from(categoryMap.entries()).map(([cat, stats]) => ({
    category: cat,
    totalSets: stats.sets,
    totalReps: stats.reps,
    totalTUT: stats.tut,
    averagePace: stats.reps > 0 ? stats.tut / stats.reps : 0,
  }));

  // Core Grade
  const corePerWeek = coreSets / 8;
  const coreGrade: PerformanceGrade = corePerWeek >= 2 ? 'A' : corePerWeek >= 1.5 ? 'B' : corePerWeek >= 1 ? 'C' : corePerWeek >= 0.5 ? 'D' : 'F';

  const coreComments: Record<PerformanceGrade, string> = {
    'A': 'Excellent focus on your foundation! Your core stability is protecting your spine and improving your force transfer.',
    'B': 'Solid work. You are hitting the target, which will pay off in balance and posture.',
    'C': 'Good start, but there is room for more stability. Aim for 2 sessions next week.',
    'D': 'Inadequate core focus. A weak core limits your strength in every other exercise.',
    'F': 'Critical Gap. Your core is your engine—without it, you are training with a flat tire.',
  };

  // Improvement Math
  const getIntensity = (win: Workout[]) => {
    let reps = 0, tut = 0;
    win.forEach(w => w.sets.forEach(s => { reps += s.reps; tut += (s.tutSeconds ?? 0); }));
    return reps > 0 ? tut / reps : 0;
  };

  const currentIntensity = getIntensity(currentWindow);
  const prevIntensity = getIntensity(prevWindow);
  const intensityImp = prevIntensity > 0 ? ((currentIntensity - prevIntensity) / prevIntensity) * 100 : 0;

  return {
    id,
    generatedAt: new Date().toISOString(),
    avgWorkoutsPerWeek: workoutsPerWeek,
    workoutsGrade: grade,
    categoryBreakdown: breakdown,
    coreSetsPerWeek: corePerWeek,
    coreGrade,
    coreComment: coreComments[coreGrade],
    improvement: {
      workouts: prevWindow.length > 0 ? ((currentWindow.length - prevWindow.length) / prevWindow.length) * 100 : 0,
      intensity: intensityImp,
      consistency: 0, // Placeholder
    }
  };
}
