/**
 * Maps all exercises (Standard, Timed, Free Style) to Body Part Categories.
 */

import { EXERCISE_GROUPS } from '@/lib/workout/types';

// Manual mapping for Timed and common Free Style exercises to their Body Part Groups.
// Built-in groups are: LEGS, CHEST, BACK, SHOULDERS, ARMS, CORE.
const MANUAL_MAPPING: Record<string, string> = {
  // CORE (Timed & Standard)
  'Plank': 'CORE',
  'Front Plank (On Glide Board)': 'CORE',
  'Bicycle Crunch': 'CORE',
  'Knee Tucks': 'CORE',
  'Oblique Twists': 'CORE',
  'Ab Roller': 'CORE',
  'Dead Bug': 'CORE',
  'Hollow Hold': 'CORE',
  'Russian Twist': 'CORE',
  'Leg Raises': 'CORE',
  'Iso Plank from Knee': 'CORE',
  'Iso Plank from feet': 'CORE',

  // LEGS
  'Wall Sit': 'LEGS',
  'Iso Wall Sits': 'LEGS',
  'Squats': 'LEGS',
  'Bulgarian Split Squat': 'LEGS',
  'Lunges': 'LEGS',
  'Iso Lunge Hold': 'LEGS',
  'Iso Warrior Pose': 'LEGS',

  // CHEST
  'Pushups': 'CHEST',
  'Chest Press': 'CHEST',

  // BACK
  'Pullups': 'BACK',
  'Superman': 'BACK',
  'Rows': 'BACK',

  // SHOULDERS
  'Shoulder Press': 'SHOULDERS',
  'Front Raises': 'SHOULDERS',
  'Lateral Raises': 'SHOULDERS',

  // ARMS
  'Bicep Curls': 'ARMS',
  'Tricep Dips': 'ARMS',
  'Diamond Pushups': 'ARMS',
  'Iso Curl Hold': 'ARMS',
};

/**
 * Resolves the primary body part group for ANY exercise name.
 */
export function getMuscleGroup(exerciseName: string): string {
  const name = exerciseName.trim();
  const lowerName = name.toLowerCase();

  // 1. Check Manual Mapping First (Overrides everything)
  for (const [key, group] of Object.entries(MANUAL_MAPPING)) {
    if (key.toLowerCase() === lowerName) return group;
  }

  // 2. Check Standard Exercise Groups
  for (const group of EXERCISE_GROUPS) {
    if (group.exercises.some(e => e.toLowerCase() === lowerName)) {
      return group.name;
    }
  }

  // 3. Heuristic Fallbacks
  if (lowerName.includes('plank') || lowerName.includes('crunch') || lowerName.includes('core') || lowerName.includes('ab')) return 'CORE';
  if (lowerName.includes('press') || lowerName.includes('fly') || lowerName.includes('chest') || lowerName.includes('pushup')) return 'CHEST';
  if (lowerName.includes('squat') || lowerName.includes('leg') || lowerName.includes('calf') || lowerName.includes('lunge') || lowerName.includes('hip')) return 'LEGS';
  if (lowerName.includes('row') || lowerName.includes('pull') || lowerName.includes('back')) return 'BACK';
  if (lowerName.includes('curl') || lowerName.includes('tricep') || lowerName.includes('bicep') || lowerName.includes('arm') || lowerName.includes('extension')) return 'ARMS';
  if (lowerName.includes('shoulder') || lowerName.includes('raise') || lowerName.includes('delt')) return 'SHOULDERS';

  return 'OTHER';
}
