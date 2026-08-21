// Exercise categories & their identity colors.
//
// Alongside the built-in body-section groups (LEGS, CHEST, …) the app has two
// special user-driven categories that live entirely in `customExercises` under
// their own group keys:
//   • FREE STYLE — barbell / dumbbell / calisthenics work done off the machine.
//     Everything is user-added and always counted by voice. Rendered RED
//     (crimson) — the Coach's Routines are green, so Free Style uses red.
//   • TIMED       — holds like the Plank or Glute Bridge that run a countdown
//     timer instead of counting reps. Rendered bright PURPLE.
//
// Both reuse the existing custom-exercise machinery (add / rename / persist), so
// the only new concept here is: given an exercise name, which category is it,
// and what color represents that category everywhere in the UI.

import type { ExerciseGroup } from './types';

export const FREE_STYLE_GROUP = 'FREE STYLE';
export const BUILTIN_TIMED_EXERCISES = [
  'Iso Wall Sits',
  'Iso Plank from Knee',
  'Iso Plank from feet',
  'Iso Lunge Hold',
  'Iso Warrior Pose',
  'Iso Curl Hold',
];

// The custom-only category groups, in display order. These are NOT part of
// EXERCISE_GROUPS on purpose — they carry no built-in exercises and must not
// participate in the native-duplicate pruning that runs over body sections.
export const CUSTOM_CATEGORY_GROUPS: ExerciseGroup[] = [
  { name: FREE_STYLE_GROUP, exercises: [] },
  { name: TIMED_GROUP, exercises: BUILTIN_TIMED_EXERCISES },
];

export type ExerciseCategory = 'standard' | 'freestyle' | 'timed';

// Identity colors used for text, borders and trophy accents.
export const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  standard: '#f97316', // orange — the app's base accent
  freestyle: '#e11d48', // crimson red — kept cool/pink-leaning so it reads clearly
                         // as "red", not a shade of the orange used elsewhere
  timed: '#a855f7', // bright purple
};

export function categoryColor(category: ExerciseCategory): string {
  return CATEGORY_COLORS[category];
}

// Which category an exercise name belongs to, based on which group currently
// holds it. Names are matched case-insensitively so history saved before a
// rename still resolves correctly.
export function getExerciseCategory(
  exercise: string,
  customExercises: Record<string, string[]>
): ExerciseCategory {
  const name = exercise.trim().toLowerCase();

  // Check built-in timed list first
  if (BUILTIN_TIMED_EXERCISES.some(e => e.toLowerCase() === name)) return 'timed';

  const inGroup = (group: string) =>
    (customExercises[group] ?? []).some(e => e.trim().toLowerCase() === name);
  if (inGroup(TIMED_GROUP)) return 'timed';
  if (inGroup(FREE_STYLE_GROUP)) return 'freestyle';
  return 'standard';
}

// Convenience: the color for a given exercise name.
export function exerciseColor(
  exercise: string,
  customExercises: Record<string, string[]>
): string {
  return categoryColor(getExerciseCategory(exercise, customExercises));
}

// Default hold time (seconds) for a newly created Timed exercise.
export const DEFAULT_TIMED_SECONDS = 30;

// The countdown durations offered when setting up a Timed exercise.
export const TIMED_DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 300];
