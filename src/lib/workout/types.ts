// Workout types and data

export interface ExerciseGroup {
  name: string;
  exercises: string[];
}

export const EXERCISE_GROUPS: ExerciseGroup[] = [
  {
    name: 'LEGS',
    exercises: [
      'Squats',
      'Hamstring Curl',
      'Calf Raise',
      'Hip Abduction',
      'Hip Adduction',
      'Glute Bridge',
      'Alternating Lunges',
    ],
  },
  {
    name: 'CHEST',
    exercises: [
      'Chest Press',
      'Chest Press Incline',
      'Chest Press Decline',
      'Chest Flys',
      'Pullovers',
    ],
  },
  {
    name: 'BACK',
    exercises: [
      'Pull-Ups',
      'Rows (Mid)',
      'Rows (1 Arm)',
      'Rows (Low)',
      'Lat Pulldown',
      'Face Pulls',
      'Pullovers',
      'Crossover Pulls',
      'Chin-Ups',
    ],
  },
  {
    name: 'SHOULDERS',
    exercises: [
      'Shoulder Press',
      'Front Raises',
      'Lateral Raises',
      'Upright Rows (Wide Grip)',
      'Rear Delt Flys',
      'Surfer Rows',
    ],
  },
  {
    name: 'ARMS',
    exercises: [
      'Seated Bicep Curls',
      'Long Arm Curls',
      'Hammer Curls',
      'Overhead Tricep Extension',
      'Skull Crusher',
      'Close Grip Tricep Press',
      'Tricep Press-Downs',
      'Tricep Dips',
      'Tricep Cable Extensions',
    ],
  },
  {
    name: 'CORE',
    exercises: [
      'Crunch',
      'Oblique Crunch',
      'Back Extension',
      'Front Plank (On Glide Board)',
      'Bicycle Crunch',
      'Knee Tucks',
      'Oblique Twists',
      'Ab Roller',
    ],
  },
];

export const INCLINE_LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

export interface WorkoutSet {
  exercise: string;
  // For machine exercises this is the incline level (1–15). For FREE STYLE
  // exercises it carries the weight in lbs instead (the UI shows a Weight pad
  // rather than an incline dropdown), so "last time at this weight" lookups
  // reuse the same keying. `weight` below mirrors it for clarity/reporting.
  inclineLevel: number;
  reps: number;
  timestamp: Date;
  // Weight in lbs for FREE STYLE sets (undefined for machine/timed sets).
  weight?: number;
  // Distinguishes rep-based sets (default) from Timed-exercise holds. Absent on
  // legacy/normal sets, which are treated as 'reps'.
  kind?: 'reps' | 'timed';
  // For timed holds: how many seconds the user held the position. `reps` is left
  // at 0 for timed sets so they never inflate rep totals/milestones.
  durationSeconds?: number;
}

export interface Workout {
  id: string;
  date: Date;
  sets: WorkoutSet[];
  duration: number; // in seconds
  // Set when the workout was a guided Coach Routine, so we can link it back to
  // the completion trophy and group "this week's" coach sessions on the
  // Trophies summary. Absent for freestyle Tracker workouts.
  routineId?: string;
  routineTitle?: string;
}

export interface ExerciseHistory {
  exercise: string;
  inclineLevel: number;
  bestReps: number;
  lastReps: number;
  lastDate: Date;
}

// Motion calibration data - learned per exercise/incline combination
export interface MotionCalibration {
  exercise: string;
  inclineLevel: number;
  // The peak acceleration deviation detected during a rep
  peakDeviation: number;
  // How long a typical rep takes (ms)
  repDuration: number;
  // Number of reps used to calibrate (more = more reliable)
  sampleCount: number;
  // Last updated
  lastUpdated: Date;
}
