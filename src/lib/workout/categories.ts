// Exercise categories & their identity colors.

import type { ExerciseGroup } from './types';
import { FREE_STYLE_GROUP, TIMED_GROUP, BUILTIN_TIMED_EXERCISES } from './constants';

export { FREE_STYLE_GROUP, TIMED_GROUP, BUILTIN_TIMED_EXERCISES };

// The custom-only category groups, in display order.
export const CUSTOM_CATEGORY_GROUPS: ExerciseGroup[] = [
  { name: FREE_STYLE_GROUP, exercises: [] },
  { name: TIMED_GROUP, exercises: BUILTIN_TIMED_EXERCISES },
];

export type ExerciseCategory = 'standard' | 'freestyle' | 'timed';

// Identity colors used for text, borders and trophy accents.
export const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  standard: '#f97316', // orange
  freestyle: '#e11d48', // crimson red
  timed: '#a855f7', // bright purple
};

export function categoryColor(category: ExerciseCategory): string {
  return CATEGORY_COLORS[category];
}

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

export const DEFAULT_TIMED_SECONDS = 30;
export const TIMED_DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 300];
