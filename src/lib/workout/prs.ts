// PR (personal record) history derivation.
//
// The complete source of truth is `workoutHistory` — every set carries a
// `timestamp`, so we can reconstruct exactly when each record was set without
// storing anything extra. Deriving instead of duplicating keeps these dates
// correct even after a workout is edited or deleted from History.
//
// These helpers power two things:
//   1. The dates shown on the Trophies screen today.
//   2. Progress charting for PRs (getPRProgression / getRepsProgression), which
//      is the next feature to build on top of this.

import type { Workout } from './types';

// A single point in an exercise's progress over time.
export interface PRPoint {
  date: Date;
  level: number; // incline level for this set
  reps: number;
}

// Consistent date label used across the Trophies screen (matches the Coach
// routine trophies: "Mar 12, 2026").
export function formatTrophyDate(d: Date | string | number): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function startOfDay(d: Date | string | number): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

// Every set for one exercise, flattened and sorted oldest → newest. Falls back
// to the workout date if a set somehow lacks its own timestamp.
function setsForExercise(
  workoutHistory: Workout[],
  exercise: string
): PRPoint[] {
  const entries: PRPoint[] = [];
  for (const w of workoutHistory) {
    for (const s of w.sets) {
      if (s.exercise === exercise) {
        entries.push({
          date: new Date(s.timestamp ?? w.date),
          level: s.inclineLevel,
          reps: s.reps,
        });
      }
    }
  }
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  return entries;
}

// The first date the user reached `level` on `exercise`. Used for the date on
// each Exercise PR card (the PR is the highest incline level reached).
export function getExercisePRDate(
  workoutHistory: Workout[],
  exercise: string,
  level: number
): Date | null {
  const entries = setsForExercise(workoutHistory, exercise);
  for (const e of entries) {
    if (e.level >= level) return e.date;
  }
  return null;
}

// The progression of personal bests for an exercise over time — one point each
// time the user set a new record. A set is a PR when it reaches a higher incline
// level than ever before, OR matches the current highest level with more reps
// than previously done at that level. This is the series a progress chart plots.
export function getPRProgression(
  workoutHistory: Workout[],
  exercise: string
): PRPoint[] {
  const entries = setsForExercise(workoutHistory, exercise);
  const points: PRPoint[] = [];
  let maxLevel = 0;
  let bestRepsAtMax = 0;

  for (const e of entries) {
    if (e.level > maxLevel) {
      maxLevel = e.level;
      bestRepsAtMax = e.reps;
      points.push(e);
    } else if (e.level === maxLevel && e.reps > bestRepsAtMax) {
      bestRepsAtMax = e.reps;
      points.push(e);
    }
  }
  return points;
}

// Every individual set for an exercise, oldest → newest — one point per set.
// This is what the PR chart plots as two lines (incline level and reps) against
// time, so a workout of 3 sets (e.g. 30, 26, 24 reps) shows three reps dots.
export function getExerciseChartSeries(
  workoutHistory: Workout[],
  exercise: string
): PRPoint[] {
  const points: PRPoint[] = [];
  for (const w of workoutHistory) {
    for (const s of w.sets) {
      if (s.exercise !== exercise) continue;
      points.push({
        date: new Date(s.timestamp ?? w.date),
        level: s.inclineLevel,
        reps: s.reps,
      });
    }
  }
  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Best reps per session at a specific exercise + incline level, oldest → newest.
// Handy for a "reps over time at level N" chart later.
export function getRepsProgression(
  workoutHistory: Workout[],
  exercise: string,
  inclineLevel: number
): PRPoint[] {
  const byDay = new Map<number, PRPoint>();
  for (const w of workoutHistory) {
    for (const s of w.sets) {
      if (s.exercise !== exercise || s.inclineLevel !== inclineLevel) continue;
      const day = startOfDay(s.timestamp ?? w.date);
      const existing = byDay.get(day);
      if (!existing || s.reps > existing.reps) {
        byDay.set(day, {
          date: new Date(s.timestamp ?? w.date),
          level: inclineLevel,
          reps: s.reps,
        });
      }
    }
  }
  return Array.from(byDay.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

// Date of the user's very first workout.
export function getFirstWorkoutDate(workoutHistory: Workout[]): Date | null {
  if (workoutHistory.length === 0) return null;
  return workoutHistory
    .map(w => new Date(w.date))
    .sort((a, b) => a.getTime() - b.getTime())[0];
}

// The date total cumulative reps first crossed `target` (for Rep Milestones).
export function getRepMilestoneDate(
  workoutHistory: Workout[],
  target: number
): Date | null {
  const sorted = [...workoutHistory].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let cumulative = 0;
  for (const w of sorted) {
    cumulative += w.sets.reduce((s, set) => s + set.reps, 0);
    if (cumulative >= target) return new Date(w.date);
  }
  return null;
}

// The date a rolling `windowDays`-day window first contained `count` workout
// sessions (drives the "3 Workouts in a Week" trophy). Returns the date of the
// session that completed the window.
export function getSessionsInWindowDate(
  workoutHistory: Workout[],
  count: number,
  windowDays: number
): Date | null {
  const dates = workoutHistory
    .map(w => new Date(w.date))
    .sort((a, b) => a.getTime() - b.getTime());

  for (let i = 0; i < dates.length; i++) {
    const end = dates[i];
    const start = startOfDay(end) - (windowDays - 1) * 86400000;
    const n = dates.filter(
      d => d.getTime() >= start && d.getTime() <= end.getTime()
    ).length;
    if (n >= count) return end;
  }
  return null;
}

// The date a run of `streakLen` consecutive workout days was first achieved
// (drives the "7 Day Streak" trophy). Returns the date of the final day.
export function getStreakEarnedDate(
  workoutHistory: Workout[],
  streakLen: number
): Date | null {
  const days = Array.from(
    new Set(workoutHistory.map(w => startOfDay(w.date)))
  ).sort((a, b) => a - b);

  let run = 0;
  let prev: number | null = null;
  for (const t of days) {
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    if (run >= streakLen) return new Date(t);
    prev = t;
  }
  return null;
}

// The date the user completed `weeksNeeded` consecutive calendar weeks with 3+
// workouts each (drives the weekly-streak trophies). Returns the last day
// (Saturday) of the final qualifying week. Mirrors the Sunday-start,
// 3-workout-minimum rule used on the Trophies screen.
export function getWeeklyStreakEarnedDate(
  workoutHistory: Workout[],
  weeksNeeded: number
): Date | null {
  const msPerWeek = 7 * 86400000;
  const weekStartOf = (date: Date | string | number): number => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  // Count workouts per week-start.
  const counts = new Map<number, number>();
  for (const w of workoutHistory) {
    const ws = weekStartOf(w.date);
    counts.set(ws, (counts.get(ws) ?? 0) + 1);
  }

  const weekStarts = Array.from(counts.keys()).sort((a, b) => a - b);
  let run = 0;
  let prev: number | null = null;
  for (const ws of weekStarts) {
    if ((counts.get(ws) ?? 0) < 3) {
      run = 0;
      prev = ws;
      continue;
    }
    // Consecutive only if this qualifying week directly follows the previous
    // qualifying week.
    run = prev !== null && ws - prev === msPerWeek ? run + 1 : 1;
    if (run >= weeksNeeded) {
      // End of this week = its Saturday.
      return new Date(ws + 6 * 86400000);
    }
    prev = ws;
  }
  return null;
}
