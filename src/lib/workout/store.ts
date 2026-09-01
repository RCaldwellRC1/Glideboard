import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EXERCISE_GROUPS,
  type Workout,
  type WorkoutSet,
  type ExerciseHistory,
} from './types';
import { getExerciseCategory, categoryColor } from './categories';
import { remoteLog } from '@/lib/remoteLog';

interface WorkoutState {
  workoutHistory: Workout[];
  exerciseHistory: ExerciseHistory[];
  seenPRs: string[];
  customExercises: Record<string, string[]>;
  isLoaded: boolean;

  // Active workout state
  isWorkoutActive: boolean;
  currentWorkoutSets: WorkoutSet[];
  currentExercise: string;
  currentInclineLevel: number;
  currentWeight: number;
  currentReps: number;
  currentSet: number;
  currentTUT: number;
  workoutStartTime: Date | null;
  setStartTime: Date | null;
  justCompletedDate: string | null;

  // Timed exercise state
  timedDurations: Record<string, number>;

  // Actions
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;

  startWorkout: () => void;
  endWorkout: () => string | null;
  cancelWorkout: () => void;

  setExercise: (exercise: string) => void;
  setInclineLevel: (level: number) => void;
  setCurrentWeight: (weight: number) => void;
  setCurrentTUT: (seconds: number) => void;

  incrementReps: () => void;
  setReps: (reps: number) => void;
  resetReps: () => void;

  startSet: () => void;
  endSet: () => void;
  cancelSet: () => void;
  endTimedSet: (held: number) => void;

  updateSetReps: (workoutId: string, setIndex: number, reps: number) => void;
  deleteSet: (workoutId: string, setIndex: number) => void;

  addCustomExercise: (group: string, name: string) => void;
  renameCustomExercise: (group: string, oldName: string, newName: string) => void;

  getLastPerformance: (exercise: string, inclineLevel: number) => ExerciseHistory | null;
  markPRsSeen: (keys: string[]) => void;
  clearJustCompleted: () => void;
}

const DEFAULT_TIMED_DURATIONS: Record<string, number> = {
  'Iso Wall Sits': 30,
  'Iso Plank from Knee': 30,
  'Iso Plank from feet': 30,
  'Iso Lunge Hold': 30,
  'Iso Warrior Pose': 30,
  'Iso Curl Hold': 30,
};

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  workoutHistory: [],
  exerciseHistory: [],
  seenPRs: [],
  customExercises: {},
  isLoaded: false,

  isWorkoutActive: false,
  currentWorkoutSets: [],
  currentExercise: EXERCISE_GROUPS[0].exercises[0],
  currentInclineLevel: 1,
  currentWeight: 45,
  currentReps: 0,
  currentSet: 0,
  currentTUT: 0,
  workoutStartTime: null,
  setStartTime: null,
  justCompletedDate: null,

  timedDurations: DEFAULT_TIMED_DURATIONS,

  loadFromStorage: async () => {
    try {
      const data = await AsyncStorage.getItem('workout-store');
      if (data) {
        const parsed = JSON.parse(data);

        const history: Workout[] = (parsed.workoutHistory || []).map((w: any) => {
          if (!w) return null;
          return {
            ...w,
            date: new Date(w.date),
            sets: Array.isArray(w.sets)
              ? w.sets.map((s: any) => ({ ...s, timestamp: new Date(s.timestamp) }))
              : [],
          };
        }).filter(Boolean);

        // --- Data Migration / Normalization ---
        const historyMap = new Map<string, ExerciseHistory>();
        history.forEach(workout => {
          workout.sets.forEach(s => {
            const name = (s.exercise || '').trim();
            const level = Number(s.inclineLevel);
            if (!name || isNaN(level)) return;

            const key = `${name.toLowerCase()}::${level}`;
            const existing = historyMap.get(key);
            const date = new Date(workout.date);

            if (!existing || date > existing.lastDate) {
              historyMap.set(key, {
                exercise: name,
                inclineLevel: level,
                lastReps: s.reps,
                bestReps: existing ? Math.max(existing.bestReps, s.reps) : s.reps,
                lastDate: date,
              });
            } else {
              existing.bestReps = Math.max(existing.bestReps, s.reps);
            }
          });
        });
        const migratedExerciseHistory = Array.from(historyMap.values());
        // --- End Migration ---

        set({
          workoutHistory: history,
          exerciseHistory: migratedExerciseHistory,
          seenPRs: parsed.seenPRs ?? [],
          customExercises: parsed.customExercises ?? {},
          timedDurations: { ...DEFAULT_TIMED_DURATIONS, ...(parsed.timedDurations ?? {}) },
          isLoaded: true,
        });
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      console.error('Failed to load workout history:', error);
      set({ isLoaded: true });
    }
  },

  saveToStorage: async () => {
    try {
      const state = get();
      const data = JSON.stringify({
        workoutHistory: state.workoutHistory,
        exerciseHistory: state.exerciseHistory,
        seenPRs: state.seenPRs,
        customExercises: state.customExercises,
        timedDurations: state.timedDurations,
      });
      await AsyncStorage.setItem('workout-store', data);
    } catch (error) {
      console.error('Failed to save workout history:', error);
    }
  },

  startWorkout: () => {
    set({
      isWorkoutActive: true,
      currentWorkoutSets: [],
      workoutStartTime: new Date(),
      currentSet: 0,
      currentReps: 0,
      currentTUT: 0,
    });
  },

  endWorkout: () => {
    const state = get();
    if (state.currentWorkoutSets.length === 0) {
      set({ isWorkoutActive: false, workoutStartTime: null });
      return null;
    }

    const now = new Date();
    const duration = state.workoutStartTime
      ? Math.floor((now.getTime() - state.workoutStartTime.getTime()) / 1000)
      : 0;

    const newWorkout: Workout = {
      id: Date.now().toString(),
      date: now,
      sets: state.currentWorkoutSets,
      duration,
    };

    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    set(prev => ({
      isWorkoutActive: false,
      workoutStartTime: null,
      workoutHistory: [newWorkout, ...prev.workoutHistory],
      justCompletedDate: dateStr,
    }));

    get().saveToStorage();
    return dateStr;
  },

  cancelWorkout: () => {
    set({ isWorkoutActive: false, currentWorkoutSets: [], workoutStartTime: null });
  },

  setExercise: (exercise: string) => {
    set({ currentExercise: exercise, currentReps: 0, currentSet: 0, currentTUT: 0 });
  },

  setInclineLevel: (level: number) => {
    set({ currentInclineLevel: level });
  },

  setCurrentWeight: (weight: number) => {
    set({ currentWeight: weight });
  },

  setCurrentTUT: (seconds: number) => {
    set({ currentTUT: Math.max(0, seconds) });
  },

  incrementReps: () => {
    set(prev => {
      const reps = prev.currentReps + 1;
      let tut = prev.currentTUT;

      // Calculate TUT for voice/manual reps based on time since set start
      if (prev.setStartTime) {
         const totalMs = Date.now() - prev.setStartTime.getTime();
         // Use totalMs for TUT if it's currently 0 or smaller than this
         if (tut === 0) {
           tut = totalMs / 1000;
         }
      }

      return { currentReps: reps, currentTUT: tut };
    });
  },

  setReps: (reps: number) => {
    set({ currentReps: reps });
  },

  resetReps: () => {
    set({ currentReps: 0, currentTUT: 0 });
  },

  startSet: () => {
    set(prev => ({
      currentReps: 0,
      currentTUT: 0,
      currentSet: prev.currentSet + 1,
      setStartTime: new Date(),
    }));
  },

  endSet: () => {
    const state = get();
    const isFreestyle = getExerciseCategory(state.currentExercise, state.customExercises) === 'freestyle';
    const levelKey = Number(isFreestyle ? state.currentWeight : state.currentInclineLevel);

    const newSet: WorkoutSet = {
      exercise: state.currentExercise.trim(),
      inclineLevel: levelKey,
      reps: state.currentReps,
      timestamp: new Date(),
      ...(isFreestyle ? { weight: state.currentWeight } : {}),
      ...(state.currentTUT > 0 ? { tutSeconds: state.currentTUT } : {}),
    };

    // Update exercise history
    const existingHistory = state.exerciseHistory.find(
      h => h.exercise.trim().toLowerCase() === state.currentExercise.trim().toLowerCase() &&
           Number(h.inclineLevel) === levelKey
    );

    let updatedExerciseHistory = [...state.exerciseHistory];

    if (existingHistory) {
      updatedExerciseHistory = updatedExerciseHistory.map(h => {
        if (h.exercise.trim().toLowerCase() === state.currentExercise.trim().toLowerCase() &&
            Number(h.inclineLevel) === levelKey) {
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
        exercise: state.currentExercise.trim(),
        inclineLevel: levelKey,
        bestReps: state.currentReps,
        lastReps: state.currentReps,
        lastDate: new Date(),
      });
    }

    set(prev => ({
      setStartTime: null,
      currentReps: 0,
      currentTUT: 0,
      currentWorkoutSets: [...prev.currentWorkoutSets, newSet],
      exerciseHistory: updatedExerciseHistory,
    }));

    get().saveToStorage();
  },

  cancelSet: () => {
    set(prev => ({
      setStartTime: null,
      currentReps: 0,
      currentTUT: 0,
      currentSet: Math.max(0, prev.currentSet - 1),
    }));
  },

  endTimedSet: (held: number) => {
    const state = get();
    const newSet: WorkoutSet = {
      exercise: state.currentExercise.trim(),
      inclineLevel: 0,
      reps: 0,
      timestamp: new Date(),
      kind: 'timed',
      durationSeconds: held,
      tutSeconds: held,
    };

    set(prev => ({
      setStartTime: null,
      currentSet: prev.currentSet + 1,
      currentWorkoutSets: [...prev.currentWorkoutSets, newSet],
    }));

    get().saveToStorage();
  },

  updateSetReps: (workoutId: string, setIndex: number, reps: number) => {
    set(prev => ({
      workoutHistory: prev.workoutHistory.map(w => {
        if (w.id !== workoutId) return w;
        const newSets = [...w.sets];
        newSets[setIndex] = { ...newSets[setIndex], reps };
        return { ...w, sets: newSets };
      }),
    }));
    get().saveToStorage();
  },

  deleteSet: (workoutId: string, setIndex: number) => {
    set(prev => ({
      workoutHistory: prev.workoutHistory
        .map(w => {
          if (w.id !== workoutId) return w;
          return { ...w, sets: w.sets.filter((_, i) => i !== setIndex) };
        })
        .filter(w => w.sets.length > 0),
    }));
    get().saveToStorage();
  },

  addCustomExercise: (group: string, name: string) => {
    set(prev => {
      const updated = { ...prev.customExercises };
      const list = updated[group] ?? [];
      if (!list.includes(name)) {
        updated[group] = [...list, name];
      }
      return { customExercises: updated };
    });
    get().saveToStorage();
  },

  renameCustomExercise: (group: string, oldName: string, newName: string) => {
    set(prev => {
      const updated = { ...prev.customExercises };
      const list = updated[group] ?? [];
      updated[group] = list.map(n => n === oldName ? newName : n);

      const newHistory = prev.workoutHistory.map(w => ({
        ...w,
        sets: w.sets.map(s => s.exercise === oldName ? { ...s, exercise: newName } : s),
      }));

      return { customExercises: updated, workoutHistory: newHistory };
    });
    get().saveToStorage();
  },

  getLastPerformance: (exercise: string, inclineLevel: number) => {
    const state = get();
    const cleanEx = exercise.trim().toLowerCase();
    const cleanLevel = Number(inclineLevel);

    return state.exerciseHistory.find(
      h => h.exercise.trim().toLowerCase() === cleanEx && Number(h.inclineLevel) === cleanLevel
    ) ?? null;
  },

  markPRsSeen: (keys: string[]) => {
    set(prev => ({ seenPRs: [...new Set([...prev.seenPRs, ...keys])] }));
    get().saveToStorage();
  },

  clearJustCompleted: () => {
    set({ justCompletedDate: null });
  },
}));
