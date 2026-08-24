import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Workout, WorkoutSet, ExerciseHistory } from './types';
import { EXERCISE_GROUPS } from './types';
import { getExerciseCategory } from './categories';
import { remoteLog } from '@/lib/remoteLog';
import { useSettingsStore } from '@/lib/settings/store';
import { calculateCurrentStreak } from './prs';

/**
 * Updates the app icon badge to reflect the current workout streak.
 * Standard "Reward" mechanism to encourage user consistency.
 */
async function updateAppIconBadge(history: Workout[]) {
  try {
    const streak = calculateCurrentStreak(history);
    // On Android, badges are often handled by the launcher. Some support
    // numbers, others just show a dot. expo-notifications handles the heavy lifting.
    await Notifications.setBadgeCountAsync(streak);
  } catch (error) {
    // Fail silently - badges are a nice-to-have "reward" and shouldn't block the app.
    console.warn('[BADGE] Failed to update icon badge:', error);
  }
}

// All built-in exercise names, lowercased, for de-duping custom exercises that
// have since been promoted to native (e.g. Hammer Curls, Tricep Dips,
// Crossover Pulls). Keeps the user's custom list from showing duplicates.
const NATIVE_EXERCISE_NAMES = new Set(
  EXERCISE_GROUPS.flatMap(g => g.exercises.map(e => e.toLowerCase()))
);

// Drop any custom exercise whose name now matches a built-in exercise so a
// previously user-created entry doesn't linger once it's native.
function pruneNativeDuplicates(
  custom: Record<string, string[]>
): Record<string, string[]> {
  const cleaned: Record<string, string[]> = {};
  for (const [group, names] of Object.entries(custom)) {
    const kept = names.filter(n => !NATIVE_EXERCISE_NAMES.has(n.trim().toLowerCase()));
    if (kept.length > 0) cleaned[group] = kept;
  }
  return cleaned;
}

// Local YYYY-MM-DD key for a date (matches the History calendar's keys).
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface WorkoutState {
  // Current workout state
  isWorkoutActive: boolean;
  isSetActive: boolean;
  currentExercise: string;
  currentInclineLevel: number;
  // Selected weight (lbs) for FREE STYLE exercises. Kept separate from the
  // incline level so switching between a machine exercise and a free-weight one
  // never contaminates the other's value.
  currentWeight: number;
  currentReps: number;
  currentSet: number;
  workoutStartTime: Date | null;
  setStartTime: Date | null;

  // Current workout sets
  currentWorkoutSets: WorkoutSet[];

  // History
  workoutHistory: Workout[];
  exerciseHistory: ExerciseHistory[];

  // The date (YYYY-MM-DD) of a just-completed workout. The History screen reads
  // this when it gains focus so it can jump straight to that day's summary
  // without the user having to tap the calendar, then clears it.
  justCompletedDate: string | null;
  clearJustCompleted: () => void;

  // Exercise PRs the user has already seen on the Trophies screen (keyed by
  // `exercise::level`). Used to splash a reward only the first time a PR shows.
  seenPRs: string[];
  markPRsSeen: (keys: string[]) => void;

  // User-created exercises, keyed by body-section group name (e.g. 'LEGS').
  // These behave exactly like the built-in exercises everywhere (tracking,
  // trophies, motion learning) since everything keys off the exercise name.
  customExercises: Record<string, string[]>;
  addCustomExercise: (group: string, name: string) => void;
  renameCustomExercise: (group: string, oldName: string, newName: string) => void;

  // Per-exercise countdown length (seconds) for Timed exercises, keyed by
  // exercise name. The user sets this before starting a timed hold.
  timedDurations: Record<string, number>;
  setTimedDuration: (exercise: string, seconds: number) => void;
  // Records a completed Timed hold as a set (reps stay 0; the held seconds are
  // stored in durationSeconds) and ends the active set.
  endTimedSet: (seconds: number) => void;

  // Actions
  startWorkout: () => void;
  // Returns the finalized workout (or null if there was nothing to save) so
  // callers like the Coach Routine can immediately show its summary. An
  // optional meta tags the workout as a guided routine.
  endWorkout: (meta?: { routineId?: string; routineTitle?: string }) => Workout | null;
  startSet: () => void;
  endSet: () => void;
  // Abandons the active set WITHOUT recording it (e.g. the user tapped "End Set"
  // by mistake and wants to redo it). Does not commit reps or touch history.
  cancelSet: () => void;
  incrementReps: () => void;
  setReps: (reps: number) => void;
  setExercise: (exercise: string) => void;
  setInclineLevel: (level: number) => void;
  setCurrentWeight: (weight: number) => void;
  resetReps: () => void;

  // History editing
  updateSetReps: (workoutId: string, setIndex: number, reps: number) => void;
  deleteSet: (workoutId: string, setIndex: number) => void;

  // History helpers
  getLastPerformance: (exercise: string, inclineLevel: number) => ExerciseHistory | null;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  // Initial state
  isWorkoutActive: false,
  isSetActive: false,
  currentExercise: 'Squats',
  currentInclineLevel: 10,
  currentWeight: 45,
  currentReps: 0,
  currentSet: 0,
  workoutStartTime: null,
  setStartTime: null,
  currentWorkoutSets: [],
  workoutHistory: [],
  exerciseHistory: [],
  seenPRs: [],
  customExercises: {},
  timedDurations: {},
  justCompletedDate: null,

  clearJustCompleted: () => set({ justCompletedDate: null }),

  setTimedDuration: (exercise: string, seconds: number) => {
    const safe = Math.max(5, Math.round(seconds));
    set(prev => ({
      timedDurations: { ...prev.timedDurations, [exercise]: safe },
    }));
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  endTimedSet: (seconds: number) => {
    const state = get();
    const held = Math.max(0, Math.round(seconds));

    const newSet: WorkoutSet = {
      exercise: state.currentExercise,
      inclineLevel: 0,
      reps: 0,
      timestamp: new Date(),
      kind: 'timed',
      durationSeconds: held,
    };

    set(prev => ({
      isSetActive: false,
      setStartTime: null,
      currentReps: 0,
      currentWorkoutSets: [...prev.currentWorkoutSets, newSet],
    }));

    remoteLog('timed_set_ended', { exercise: state.currentExercise, seconds: held });
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  addCustomExercise: (group: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const state = get();
    const existing = state.customExercises[group] ?? [];

    // Avoid duplicates within the group (case-insensitive) so the same
    // exercise can't be added twice.
    const alreadyExists = existing.some(e => e.toLowerCase() === trimmed.toLowerCase());
    if (alreadyExists) return;

    set({
      customExercises: {
        ...state.customExercises,
        [group]: [...existing, trimmed],
      },
    });
    remoteLog('custom_exercise_added', { group, name: trimmed });
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  renameCustomExercise: (group: string, oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const state = get();
    const existing = state.customExercises[group] ?? [];

    // The old name must actually be a custom exercise in this group.
    if (!existing.includes(oldName)) return;
    if (trimmed === oldName) return;

    // Don't collide with another exercise already in the group (case-insensitive),
    // ignoring the one we're renaming.
    const collides = existing.some(
      e => e !== oldName && e.toLowerCase() === trimmed.toLowerCase()
    );
    if (collides) return;

    // Carry the rename through everywhere the name is used as a key so the
    // typo doesn't linger in history or trophies.
    set({
      customExercises: {
        ...state.customExercises,
        [group]: existing.map(e => (e === oldName ? trimmed : e)),
      },
      currentExercise: state.currentExercise === oldName ? trimmed : state.currentExercise,
      currentWorkoutSets: state.currentWorkoutSets.map(s =>
        s.exercise === oldName ? { ...s, exercise: trimmed } : s
      ),
      exerciseHistory: state.exerciseHistory.map(h =>
        h.exercise === oldName ? { ...h, exercise: trimmed } : h
      ),
      workoutHistory: state.workoutHistory.map(w => ({
        ...w,
        sets: w.sets.map(s => (s.exercise === oldName ? { ...s, exercise: trimmed } : s)),
      })),
    });
    remoteLog('custom_exercise_renamed', { group, oldName, newName: trimmed });
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  markPRsSeen: (keys: string[]) => {
    const state = get();
    const merged = Array.from(new Set([...state.seenPRs, ...keys]));
    if (merged.length === state.seenPRs.length) return;
    set({ seenPRs: merged });
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  startWorkout: () => {
    set({
      isWorkoutActive: true,
      workoutStartTime: new Date(),
      currentSet: 0,
      currentReps: 0,
      currentWorkoutSets: [],
    });
    remoteLog('workout_started', {});
    // Persist immediately so an accidental app-close mid-workout can be
    // recovered and auto-saved on the next launch.
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  endWorkout: (meta) => {
    const state = get();
    if (!state.workoutStartTime) return null;

    const workout: Workout = {
      id: Date.now().toString(),
      date: state.workoutStartTime,
      sets: state.currentWorkoutSets,
      duration: Math.floor((Date.now() - state.workoutStartTime.getTime()) / 1000),
      ...(meta?.routineId ? { routineId: meta.routineId } : {}),
      ...(meta?.routineTitle ? { routineTitle: meta.routineTitle } : {}),
    };

    set(prev => ({
      isWorkoutActive: false,
      isSetActive: false,
      workoutStartTime: null,
      setStartTime: null,
      currentReps: 0,
      currentSet: 0,
      workoutHistory: [...prev.workoutHistory, workout],
      currentWorkoutSets: [],
      // Surface this day in the History screen automatically.
      justCompletedDate: toDateStr(workout.date),
    }));

    remoteLog('workout_ended', {
      durationSeconds: workout.duration,
      totalSets: workout.sets.length,
      totalReps: workout.sets.reduce((s, set) => s + set.reps, 0),
      sets: workout.sets.map(s => ({ exercise: s.exercise, incline: s.inclineLevel, reps: s.reps })),
      ...(workout.routineId ? { routineId: workout.routineId } : {}),
    });

    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);

    // Voice counting persists for the whole workout, but each workout should
    // START on Motion (the primary auto-counter) — so reset the mode here, when
    // the workout ends, rather than between sets. Voice is re-selected via the
    // Settings toggle whenever the user wants it again.
    // reset (not set) so the "user picked this by hand" flag clears too — the
    // next workout starts back on the app's automatic motion/voice selection.
    useSettingsStore.getState().resetRepCountingMode();

    return workout;
  },

  startSet: () => {
    set(prev => ({
      isSetActive: true,
      setStartTime: new Date(),
      currentReps: 0,
      currentSet: prev.currentSet + 1,
    }));
  },

  endSet: () => {
    const state = get();

    // FREE STYLE exercises track weight (lbs) instead of an incline level. We
    // store the weight in the same `inclineLevel` slot so "last time at this
    // weight" lookups reuse the existing keying, and mirror it in `weight`.
    const isFreestyle =
      getExerciseCategory(state.currentExercise, state.customExercises) === 'freestyle';
    const levelKey = isFreestyle ? state.currentWeight : state.currentInclineLevel;

    const newSet: WorkoutSet = {
      exercise: state.currentExercise,
      inclineLevel: levelKey,
      reps: state.currentReps,
      timestamp: new Date(),
      ...(isFreestyle ? { weight: state.currentWeight } : {}),
    };

    // Update exercise history
    const existingHistory = state.exerciseHistory.find(
      h => h.exercise === state.currentExercise && h.inclineLevel === levelKey
    );

    let updatedExerciseHistory = [...state.exerciseHistory];

    if (existingHistory) {
      updatedExerciseHistory = updatedExerciseHistory.map(h => {
        if (h.exercise === state.currentExercise && h.inclineLevel === levelKey) {
          return {
            ...h,
            lastReps: state.currentReps,
            bestReps: Math.max(h.bestReps, state.currentReps),
            lastDate: new Date(),
          };
        }
        return h;
      });
    } else {
      updatedExerciseHistory.push({
        exercise: state.currentExercise,
        inclineLevel: levelKey,
        bestReps: state.currentReps,
        lastReps: state.currentReps,
        lastDate: new Date(),
      });
    }

    set(prev => ({
      isSetActive: false,
      setStartTime: null,
      currentWorkoutSets: [...prev.currentWorkoutSets, newSet],
      exerciseHistory: updatedExerciseHistory,
    }));

    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  cancelSet: () => {
    // Discard the in-progress set without saving it. Roll back the set counter
    // that startSet() incremented so numbering stays correct on the redo.
    set(prev => ({
      isSetActive: false,
      setStartTime: null,
      currentReps: 0,
      currentSet: Math.max(0, prev.currentSet - 1),
    }));
  },

  incrementReps: () => {
    set(prev => ({ currentReps: prev.currentReps + 1 }));
  },

  setReps: (reps: number) => {
    set({ currentReps: reps });
  },

  setExercise: (exercise: string) => {
    // Switching exercises starts a fresh count — the rep number should reset to
    // zero rather than carry over from the previous exercise.
    set({ currentExercise: exercise, currentSet: 0, currentReps: 0 });
  },

  setInclineLevel: (level: number) => {
    set({ currentInclineLevel: level });
  },

  setCurrentWeight: (weight: number) => {
    // Clamp to a sane range: 1 lb dumbbell up to a heavily loaded 500 lb barbell.
    const safe = Math.min(500, Math.max(1, Math.round(weight)));
    set({ currentWeight: safe });
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  resetReps: () => {
    set({ currentReps: 0 });
  },

  updateSetReps: (workoutId: string, setIndex: number, reps: number) => {
    const safeReps = Math.max(0, Math.round(reps));
    set(prev => ({
      workoutHistory: prev.workoutHistory.map(w => {
        if (w.id !== workoutId) return w;
        return {
          ...w,
          sets: w.sets.map((s, i) => (i === setIndex ? { ...s, reps: safeReps } : s)),
        };
      }),
    }));
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  deleteSet: (workoutId: string, setIndex: number) => {
    set(prev => ({
      // Remove the set; drop the whole workout if it has no sets left.
      workoutHistory: prev.workoutHistory
        .map(w => {
          if (w.id !== workoutId) return w;
          return { ...w, sets: w.sets.filter((_, i) => i !== setIndex) };
        })
        .filter(w => w.sets.length > 0),
    }));
    get().saveToStorage();
    updateAppIconBadge(get().workoutHistory);
  },

  getLastPerformance: (exercise: string, inclineLevel: number) => {
    const state = get();

    // Directly use the maintained exerciseHistory array, which is updated on every set end.
    // This is much faster and more reliable than scanning the full workoutHistory.
    const history = state.exerciseHistory.find(
      h => h.exercise.trim().toLowerCase() === exercise.trim().toLowerCase() && h.inclineLevel === inclineLevel
    );

    if (history) {
      return history;
    }

    // Fallback: search workoutHistory if exerciseHistory is somehow empty (unlikely with persistence)
    for (let i = state.workoutHistory.length - 1; i >= 0; i--) {
      const workout = state.workoutHistory[i];
      const matchingSets = workout.sets.filter(
        s => s.exercise.trim().toLowerCase() === exercise.trim().toLowerCase() && s.inclineLevel === inclineLevel
      );

      if (matchingSets.length > 0) {
        const bestReps = Math.max(...matchingSets.map(s => s.reps));
        return {
          exercise,
          inclineLevel,
          bestReps,
          lastReps: bestReps,
          lastDate: workout.date,
        };
      }
    }

    return null;
  },

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem('workout-store');
      if (data) {
        const parsed = JSON.parse(data);

        const history: Workout[] = parsed.workoutHistory?.map((w: Workout) => {
          if (!w) return null;
          return {
            ...w,
            date: new Date(w.date),
            sets: Array.isArray(w.sets)
              ? w.sets.map(s => ({ ...s, timestamp: new Date(s.timestamp) }))
              : [],
          };
        }).filter(Boolean) ?? [];

        // Recover an interrupted workout: if the app was closed mid-workout, the
        // sets the user already completed were saved but never committed to
        // history. Finalize them now so the workout shows up in the Calendar and
        // Workout Summary automatically, instead of being lost.
        let recoveredDate: string | null = null;
        const active = parsed.activeWorkout;
        if (active?.startTime && Array.isArray(active.sets) && active.sets.length > 0) {
          const startTime = new Date(active.startTime);
          const recoveredSets = active.sets.map((s: WorkoutSet) => ({ ...s, timestamp: new Date(s.timestamp) }));
          // The workout never got a proper endWorkout() (the app was closed), so
          // its duration was previously saved as 0 — showing "0:00" in History.
          // Estimate it from start → the last recorded set instead.
          const lastSetTime = recoveredSets[recoveredSets.length - 1]?.timestamp;
          const estimatedDuration = lastSetTime
            ? Math.max(0, Math.floor((lastSetTime.getTime() - startTime.getTime()) / 1000))
            : 0;
          const recovered: Workout = {
            id: startTime.getTime().toString(),
            date: startTime,
            sets: recoveredSets,
            duration: estimatedDuration,
          };
          // Guard against double-recovery if this workout was somehow already saved.
          if (!history.some(w => w.id === recovered.id)) {
            history.push(recovered);
            recoveredDate = toDateStr(startTime);
            remoteLog('workout_recovered', { totalSets: recovered.sets.length });
          }
        }

        set({
          workoutHistory: history,
          exerciseHistory: parsed.exerciseHistory?.map((h: ExerciseHistory) => ({
            ...h,
            lastDate: new Date(h.lastDate),
          })) ?? [],
          seenPRs: parsed.seenPRs ?? [],
          customExercises: pruneNativeDuplicates(parsed.customExercises ?? {}),
          timedDurations: parsed.timedDurations ?? {},
          ...(typeof parsed.currentWeight === 'number' ? { currentWeight: parsed.currentWeight } : {}),
          justCompletedDate: recoveredDate,
        });

        // Persist if we recovered a workout, or if pruning removed any
        // now-native custom exercises, so the cleanup sticks on next launch.
        const prunedChanged =
          JSON.stringify(parsed.customExercises ?? {}) !==
          JSON.stringify(pruneNativeDuplicates(parsed.customExercises ?? {}));
        if (recoveredDate || prunedChanged) get().saveToStorage();

        // Update badge on load to ensure home screen matches current data
        updateAppIconBadge(history);
      }
    } catch (error) {
      console.error('Failed to load workout data:', error);
    }
  },

  saveToStorage: async () => {
    try {
      const state = get();
      // Snapshot any in-progress workout so it survives an accidental app close.
      // We only need the committed sets (added on each endSet) plus enough to
      // reconstruct the Workout record on next launch.
      const activeWorkout = state.isWorkoutActive && state.workoutStartTime
        ? {
            startTime: state.workoutStartTime,
            sets: state.currentWorkoutSets,
          }
        : null;
      await AsyncStorage.setItem('workout-store', JSON.stringify({
        workoutHistory: state.workoutHistory,
        exerciseHistory: state.exerciseHistory,
        seenPRs: state.seenPRs,
        customExercises: state.customExercises,
        timedDurations: state.timedDurations,
        currentWeight: state.currentWeight,
        activeWorkout,
      }));
    } catch (error) {
      console.error('Failed to save workout data:', error);
    }
  },
}));
