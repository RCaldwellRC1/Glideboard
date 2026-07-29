import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Dumbbell, Repeat, Clock, TrendingUp } from 'lucide-react-native';
import type { Workout, WorkoutSet } from '@/lib/workout';

// One exercise's worth of sets, in the order they were performed.
interface ExerciseBlock {
  exercise: string;
  sets: WorkoutSet[];
}

// Group a workout's flat set list into per-exercise blocks, preserving the
// order exercises were first performed (so a Coach Routine reads top-to-bottom
// the way it was done). Consecutive runs of the same exercise stay together.
function groupByExercise(sets: WorkoutSet[]): ExerciseBlock[] {
  const blocks: ExerciseBlock[] = [];
  for (const set of sets) {
    const last = blocks[blocks.length - 1];
    if (last && last.exercise === set.exercise) {
      last.sets.push(set);
    } else {
      blocks.push({ exercise: set.exercise, sets: [set] });
    }
  }
  return blocks;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// A full breakdown of a single completed workout: exercises, the incline level
// and reps for each set, plus totals. Used by the Coach Routine completion
// summary and the Trophies weekly-summary screen.
export function WorkoutSummary({
  workout,
  isLarge,
  accentColor = '#f97316',
}: {
  workout: Workout;
  isLarge: boolean;
  accentColor?: string;
}) {
  const blocks = useMemo(() => groupByExercise(workout.sets), [workout.sets]);
  const totalReps = useMemo(() => workout.sets.reduce((s, set) => s + set.reps, 0), [workout.sets]);

  const dateLabel = new Date(workout.date).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <View className="bg-gray-900 rounded-2xl overflow-hidden">
      {/* Header */}
      <View className="px-4 pt-4 pb-3 border-b border-gray-800">
        <Text className={`text-white font-bold ${isLarge ? 'text-lg' : 'text-xl'}`} numberOfLines={2}>
          {workout.routineTitle ?? 'Workout'}
        </Text>
        <Text className={`text-gray-500 mt-0.5 ${isLarge ? 'text-xs' : 'text-sm'}`}>{dateLabel}</Text>

        {/* Stat chips */}
        <View className="flex-row mt-3">
          <View className="flex-row items-center mr-4">
            <Dumbbell size={isLarge ? 14 : 16} color={accentColor} />
            <Text className={`text-gray-300 ml-1.5 ${isLarge ? 'text-xs' : 'text-sm'}`}>
              {workout.sets.length} {workout.sets.length === 1 ? 'set' : 'sets'}
            </Text>
          </View>
          <View className="flex-row items-center mr-4">
            <Repeat size={isLarge ? 14 : 16} color={accentColor} />
            <Text className={`text-gray-300 ml-1.5 ${isLarge ? 'text-xs' : 'text-sm'}`}>{totalReps} reps</Text>
          </View>
          {workout.duration > 0 && (
            <View className="flex-row items-center">
              <Clock size={isLarge ? 14 : 16} color={accentColor} />
              <Text className={`text-gray-300 ml-1.5 ${isLarge ? 'text-xs' : 'text-sm'}`}>
                {formatDuration(workout.duration)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Per-exercise breakdown */}
      <View className="px-4 py-2">
        {blocks.map((block, bi) => {
          const best = Math.max(...block.sets.map(s => s.reps));
          return (
            <View key={`${block.exercise}-${bi}`} className="py-2.5 border-b border-gray-800/60">
              <View className="flex-row items-center justify-between">
                <Text className={`text-white font-semibold flex-1 mr-2 ${isLarge ? 'text-base' : 'text-lg'}`} numberOfLines={1}>
                  {block.exercise}
                </Text>
                <View className="flex-row items-center">
                  <TrendingUp size={isLarge ? 12 : 14} color="#6b7280" />
                  <Text className={`text-gray-500 ml-1 ${isLarge ? 'text-xs' : 'text-sm'}`}>best {best}</Text>
                </View>
              </View>

              {/* Each set: reps + the incline it was done at */}
              <View className="flex-row flex-wrap mt-1.5">
                {block.sets.map((s, si) => (
                  <View
                    key={si}
                    className="flex-row items-baseline bg-gray-800 rounded-lg px-2.5 py-1 mr-2 mb-1.5"
                  >
                    <Text className={`font-bold ${isLarge ? 'text-sm' : 'text-base'}`} style={{ color: accentColor }}>
                      {s.reps}
                    </Text>
                    <Text className={`text-gray-400 ml-1 ${isLarge ? 'text-[10px]' : 'text-xs'}`}>
                      reps · Lvl {s.inclineLevel}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
