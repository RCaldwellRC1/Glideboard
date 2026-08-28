/**
 * Types for the Rolling 8-Week Coach's Report
 */

export type PerformanceGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface CategoryStats {
  category: string;
  totalSets: number;
  totalReps: number;
  totalTUT: number;
  averagePace: number; // seconds per rep
}

export interface WeeklyReport {
  id: string; // Sunday date string YYYY-MM-DD
  generatedAt: string; // ISO timestamp

  // Rolling 8-week stats
  avgWorkoutsPerWeek: number;
  workoutsGrade: PerformanceGrade;

  // Per-category breakdown
  categoryBreakdown: CategoryStats[];

  // Core specific focus
  coreSetsPerWeek: number;
  coreGrade: PerformanceGrade;
  coreComment: string;

  // Comparison vs previous 8-week window
  improvement: {
    workouts: number; // percentage change
    intensity: number; // percentage change in TUT/Rep
    consistency: number; // change in weekly streak
  };

  // The user's goals set AFTER viewing this report
  goals?: {
    tactical: string; // e.g. "Control", "Balance"
    identity: string; // e.g. "The Sculptor", "Modern Spartan"
    timestamp: string;
  };
}

export const WORKOUT_FREQUENCY_GUIDE = {
  EXCELLENT: 4,
  GOOD: 3,
  INADEQUATE: 2,
};

export const CORE_TARGET_SETS = 2;
