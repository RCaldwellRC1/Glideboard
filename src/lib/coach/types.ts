// Coach's Routines — guided, pre-built programs.
//
// The first routine is "20 Minute Upper Body". A routine is an ordered list of
// steps; each step is one exercise performed for a number of sets. The exercise
// names below match the built-in names in lib/workout/types.ts so that motion
// learning, history and stats all key off them cleanly.

export type MedalTier = 'ribbon' | 'bronze' | 'silver' | 'gold' | 'olympia';

export interface RoutineStep {
  group: string;        // body section (matches EXERCISE_GROUPS name)
  exercise: string;     // exercise name (matches a built-in exercise)
  sets: number;         // sets to complete before auto-advancing
  repRangeLabel: string; // e.g. "15–30 Reps"
  // The user's chosen rep target for "Build your own" routines. The built-in
  // routine uses a range label instead, so this is optional.
  targetReps?: number;
}

export interface CoachRoutine {
  id: string;
  title: string;
  subtitle: string;
  // The coaching instructions, shown before the routine begins.
  instructions: string;
  steps: RoutineStep[];
  // How many completions make up the full program (3×/week for 4 weeks = 12).
  programLength: number;
  // True for user-built routines (saved on this device). Built-ins omit it.
  isCustom?: boolean;
}

const UPPER_BODY_INSTRUCTIONS = `20 Minute Upper Body Workout — 4 Week Program

This is a 3 times per week, 20 minute routine, for 4 weeks, focusing on Upper Body. If you follow this routine for 1 month, you will get results. You will become stronger, and you will feel your muscles adapting and growing.

How to get the most out of this program

This routine focuses on Time Under Tension, not explosive power. You'll focus on 1–2 seconds up and 1–2 seconds down, with no pause at the top or bottom. Smooth and steady.

In this app's settings, under Pace Settings:
• Set "Delay to Start New" at an appropriate pace for you to set up for the next set. We recommend 4 seconds.
• Set the "Lift" and "Down" timers for 1 or 2 seconds (we recommend 2 seconds for the steadiest pace).
• Set "Hold at Top" to 0 (zero) and "Pause time before next rep" to 0 (zero).

The goal is to keep your muscles under tension — not starting and stopping, and not holding.

This routine is based on going close to failure — not absolute failure, but close. Form and pace are more important than load. Ideally you'll do 15–30 reps for each set of each exercise. If you're struggling at fewer than 15 reps, lower the Glideboard. If at 30 reps it's still too easy, you may want to raise your Glideboard.

As you get closer to failure, it's okay to "cheat" — not by jerking the weight or changing your form, but by giving a small boost. In some exercises you can use your feet on the floor to help push out a few more reps. In others you may use your feet on the foot board to push toward a few more reps.

The negatives are as important as the exertion. Even if you (for example) use your feet to push you back up for a couple more reps on Tricep Dips, controlling your decline (the negative) is still super-powerful for results.

Mind & Muscle Connection: Focus on the working muscle. Some users like to close their eyes to eliminate distractions. Example: when you are doing Chest Presses, your Pectoralis Major (the main muscle of the chest) doesn't care where your hands are. Its only job is to pull your humerus (upper arm) around and closer to your chest. And on the return, its focus is to slowly allow it to move away from the chest.

Note: 60 seconds between sets is ideal for this program, but adjust that as you feel ready.`;

export const UPPER_BODY_20: CoachRoutine = {
  id: 'upper-body-20',
  title: '20 Minute Upper Body Workout',
  subtitle: '4-week program · 3×/week · Upper Body',
  instructions: UPPER_BODY_INSTRUCTIONS,
  programLength: 12,
  steps: [
    { group: 'CHEST', exercise: 'Chest Press', sets: 2, repRangeLabel: '15–30 Reps' },
    { group: 'BACK', exercise: 'Crossover Pulls', sets: 2, repRangeLabel: '15–30 Reps' },
    { group: 'SHOULDERS', exercise: 'Shoulder Press', sets: 2, repRangeLabel: '15–30 Reps' },
    { group: 'BACK', exercise: 'Pull-Ups', sets: 2, repRangeLabel: '15–30 Reps' },
    { group: 'ARMS', exercise: 'Seated Bicep Curls', sets: 2, repRangeLabel: '15–30 Reps' },
    { group: 'ARMS', exercise: 'Tricep Dips', sets: 2, repRangeLabel: '15–30 Reps' },
  ],
};

export const COACH_ROUTINES: CoachRoutine[] = [UPPER_BODY_20];

// ---------------------------------------------------------------------------
// Multi-workout programs — a coach-built plan made of several distinct
// workouts you rotate through over a number of weeks. Each workout is a full
// CoachRoutine (so it runs on the same guided runner and earns its own
// trophies); the program just groups them and describes the weekly schedule.
// ---------------------------------------------------------------------------

export interface CoachProgram {
  id: string;
  title: string;
  subtitle: string;
  // The program overview: schedule, general rules, and week-by-week progression.
  overview: string;
  workouts: CoachRoutine[];
}

// ---- 4-Week Beginner Sliding Bench Gym Program --------------------------

const BTG_OVERVIEW = `4-Week Beginner Sliding Bench Gym Program

This 4-week beginner Sliding Bench Gym program is your simple on-ramp into consistent strength training. Each session is just 20–30 minutes, using only basic, repeatable movements so you can build confidence with the glideboard instead of feeling overwhelmed. You'll train your legs, back, chest, arms, and core in a joint-friendly way, with the first week focused on learning the moves and later weeks gradually adding reps and volume.

The goal isn't to crush you; it's to help you stack wins. Show up four days a week, follow the short sessions as written, and stop a rep or two before your form breaks down.

By the end of the month, you'll notice stronger legs, firmer arms, better posture, and more control on the machine — plus a clear sense that you finally "know what to do" on your Sliding Bench Gym.

If you complete the program exactly as written and stay on schedule for all 4 weeks, you'll earn a virtual trophy inside the app and unlock access to Next Level training. Finish this and you won't just be stronger — you'll have proven to yourself that you can show up, follow a plan, and be ready for the next step in your fitness journey.

WEEKLY SCHEDULE
• Day 1 — Workout 1 (Upper Body A)
• Day 2 — Workout 2 (Lower Body + Core A)
• Day 3 — Rest
• Day 4 — Workout 3 (Upper Body B)
• Day 5 — Workout 4 (Lower Body + Core B)
• Day 6 — Rest
• Day 7 — Rest

GENERAL RULES
• Do a 3–5 minute easy warm-up before each workout.
• Rest 30–45 sec between exercises, and 60 sec between rounds.
• Use a low to moderate incline.
• Stop 1–2 reps before your form breaks down.

HOW MANY ROUNDS & REPS EACH WEEK
• Week 1 — 1–2 rounds · 10 reps per exercise.
• Week 2 — 2 rounds · 10–12 reps per exercise.
• Week 3 — 2 rounds · 12 reps per exercise (raise the incline slightly on 1–2 exercises only if needed).
• Week 4 — 2 rounds · 12–15 reps per exercise. Keep every rep smooth and controlled.

Calf Raises run a little higher: 12 reps in Week 1, 12–15 in Week 2, and 15 in Weeks 3–4.

Each workout guides you two sets per exercise (that's your two rounds). In Week 1 you can stop after one set if two feels like too much — just tap the back arrow when you're done.`;

// The per-week rep target block appended to each workout's instructions.
const BTG_WEEK_GUIDE = `Reps by week (most exercises):
• Week 1 — 10 reps · 1–2 rounds
• Week 2 — 10–12 reps · 2 rounds
• Week 3 — 12 reps · 2 rounds
• Week 4 — 12–15 reps · 2 rounds

Calf Raises: 12 → 12–15 → 15 → 15 reps.

Pick an incline that lets you hit that week's reps with smooth, controlled form. Rest about 60 seconds between rounds.`;

// Small helper so each workout's steps read cleanly. Every exercise is done for
// two sets (the program's two rounds); the rep target changes by week, so the
// label shows the full program range and the week guide spells out the details.
function btgStep(group: string, exercise: string, repRangeLabel = '10–15 Reps'): RoutineStep {
  return { group, exercise, sets: 2, repRangeLabel };
}

const BEGINNER_TOTAL_GYM: CoachProgram = {
  id: 'beginner-total-gym',
  title: '4-Week Beginner Sliding Bench',
  subtitle: '4 weeks · 4 workouts/week · Full Body',
  overview: BTG_OVERVIEW,
  workouts: [
    {
      id: 'btg-workout-1',
      title: 'Workout 1 · Upper Body A',
      subtitle: '5 exercises · 2 rounds',
      instructions: `Workout 1 — Upper Body A\n\nThe first of your two upper-body days. Move through all five exercises, two sets each.\n\n${BTG_WEEK_GUIDE}`,
      programLength: 4,
      steps: [
        btgStep('BACK', 'Rows (Mid)'),
        btgStep('CHEST', 'Chest Press'),
        btgStep('ARMS', 'Seated Bicep Curls'),
        btgStep('ARMS', 'Tricep Cable Extensions'),
        btgStep('CORE', 'Pullover Crunch'),
      ],
    },
    {
      id: 'btg-workout-2',
      title: 'Workout 2 · Lower Body + Core A',
      subtitle: '5 exercises · 2 rounds',
      instructions: `Workout 2 — Lower Body + Core A\n\nLegs and core, plus a little back to finish. Two sets each.\n\n${BTG_WEEK_GUIDE}`,
      programLength: 4,
      steps: [
        btgStep('LEGS', 'Squats'),
        btgStep('LEGS', 'Calf Raise', '12–15 Reps'),
        btgStep('LEGS', 'Hamstring Curl'),
        btgStep('CORE', 'Crunch'),
        btgStep('BACK', 'Rows (Mid)'),
      ],
    },
    {
      id: 'btg-workout-3',
      title: 'Workout 3 · Upper Body B',
      subtitle: '5 exercises · 2 rounds',
      instructions: `Workout 3 — Upper Body B\n\nYour second upper-body day — same movements, chest first this time. Two sets each.\n\n${BTG_WEEK_GUIDE}`,
      programLength: 4,
      steps: [
        btgStep('CHEST', 'Chest Press'),
        btgStep('BACK', 'Rows (Mid)'),
        btgStep('ARMS', 'Seated Bicep Curls'),
        btgStep('ARMS', 'Tricep Cable Extensions'),
        btgStep('CORE', 'Pullover Crunch'),
      ],
    },
    {
      id: 'btg-workout-4',
      title: 'Workout 4 · Lower Body + Core B',
      subtitle: '5 exercises · 2 rounds',
      instructions: `Workout 4 — Lower Body + Core B\n\nYour second lower-body day, finishing with a little chest. Two sets each.\n\n${BTG_WEEK_GUIDE}`,
      programLength: 4,
      steps: [
        btgStep('LEGS', 'Squats'),
        btgStep('LEGS', 'Hamstring Curl'),
        btgStep('LEGS', 'Calf Raise', '12–15 Reps'),
        btgStep('CORE', 'Crunch'),
        btgStep('CHEST', 'Chest Press'),
      ],
    },
  ],
};

export const COACH_PROGRAMS: CoachProgram[] = [BEGINNER_TOTAL_GYM];

// Every workout across all programs, flattened — so the runner can resolve a
// workout by its id just like a standalone routine.
const PROGRAM_WORKOUTS: CoachRoutine[] = COACH_PROGRAMS.flatMap(p => p.workouts);

export function getProgram(id: string): CoachProgram | undefined {
  return COACH_PROGRAMS.find(p => p.id === id);
}

// Progress toward finishing a whole program. A program counts as complete once
// EVERY workout has been finished at least `programLength` times (once per week
// for the full run — e.g. 4 completions each × 4 workouts = the full 4 weeks).
export interface ProgramProgress {
  complete: boolean;
  // How many of the program's workouts have hit their required completions.
  workoutsMet: number;
  totalWorkouts: number;
  // Total finished sessions vs. the total the program calls for.
  sessionsDone: number;
  sessionsRequired: number;
  // ISO date the program was completed (when the final requirement was met), or
  // null if it isn't complete yet. Stable once earned.
  completedAt: string | null;
}

export function getProgramProgress(
  program: CoachProgram,
  completions: { routineId: string; completedAt: string }[],
): ProgramProgress {
  const targets = new Map(program.workouts.map(w => [w.id, w.programLength]));
  const counts = new Map(program.workouts.map(w => [w.id, 0]));
  const totalWorkouts = program.workouts.length;
  const sessionsRequired = program.workouts.reduce((sum, w) => sum + w.programLength, 0);

  // Walk completions oldest-first so we can capture the exact session that
  // finished the program.
  const relevant = completions
    .filter(c => targets.has(c.routineId))
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

  let sessionsDone = 0;
  let workoutsMet = 0;
  let completedAt: string | null = null;

  for (const c of relevant) {
    const target = targets.get(c.routineId) ?? 0;
    const prev = counts.get(c.routineId) ?? 0;
    if (prev >= target) continue; // this workout already satisfied — extra reps don't count
    const next = prev + 1;
    counts.set(c.routineId, next);
    sessionsDone += 1;
    if (next === target) {
      workoutsMet += 1;
      if (workoutsMet === totalWorkouts && completedAt === null) {
        completedAt = c.completedAt;
      }
    }
  }

  return {
    complete: workoutsMet === totalWorkouts,
    workoutsMet,
    totalWorkouts,
    sessionsDone,
    sessionsRequired,
    completedAt,
  };
}

export function getRoutine(id: string): CoachRoutine | undefined {
  return COACH_ROUTINES.find(r => r.id === id) ?? PROGRAM_WORKOUTS.find(r => r.id === id);
}

// ---------------------------------------------------------------------------
// "Build your own routine" — user-built, saved on this device.
// ---------------------------------------------------------------------------

// One exercise as chosen in the builder, before it becomes a RoutineStep.
export interface CustomRoutineExercise {
  group: string;
  exercise: string;
  sets: number;
  reps: number; // the user's target reps for this exercise
}

const CUSTOM_INSTRUCTIONS = `Your Custom Routine

This is a routine you built yourself. We'll guide you through each exercise, one at a time, and load the next one automatically once you finish your sets.

You picked a target number of sets and reps for each exercise. Treat the rep target as a goal — pick an incline level that lets you hit it with good, controlled form. You can change the incline for any exercise right on the exercise screen.

Rest about 60 seconds between sets, and stop if anything hurts.`;

// Build a saveable CoachRoutine from a name + the user's chosen exercises.
export function createCustomRoutine(
  name: string,
  exercises: CustomRoutineExercise[],
  // When editing an existing routine, pass its id to keep it (and its trophies).
  existingId?: string,
): CoachRoutine {
  const id = existingId ?? `custom-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return {
    id,
    title: name.trim(),
    subtitle: `Custom routine · ${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`,
    instructions: CUSTOM_INSTRUCTIONS,
    programLength: 12,
    isCustom: true,
    steps: exercises.map(e => ({
      group: e.group,
      exercise: e.exercise,
      sets: e.sets,
      targetReps: e.reps,
      repRangeLabel: `${e.reps} ${e.reps === 1 ? 'Rep' : 'Reps'} target`,
    })),
  };
}

// The medal tier for a 1-based completion count. The program is 3×/week for 4
// weeks (12 completions): week 1 → ribbon, week 2 → bronze, week 3 → silver,
// week 4 → gold, and the 12th (3rd of week 4) is the grand "Mr. Olympia"
// finale. Completions beyond 12 keep earning gold.
export function medalTierForIndex(index: number): MedalTier {
  if (index >= 12 && (index - 12) % 12 === 0) return 'olympia';
  if (index <= 3) return 'ribbon';
  if (index <= 6) return 'bronze';
  if (index <= 9) return 'silver';
  return 'gold';
}

export const MEDAL_LABELS: Record<MedalTier, string> = {
  ribbon: 'Ribbon',
  bronze: 'Bronze Medal',
  silver: 'Silver Medal',
  gold: 'Gold Medal',
  olympia: 'Mr. Olympia',
};

// Display colors per tier (used for the trophy icons on the Trophies page).
export const MEDAL_COLORS: Record<MedalTier, string> = {
  ribbon: '#f97316',  // orange
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#fbbf24',
  olympia: '#fde047', // bright gold
};
