import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useWorkoutStore, type Workout } from '@/lib/workout';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { medalTierForIndex, MEDAL_LABELS, MEDAL_COLORS } from '@/lib/coach';
import { WorkoutSummary } from '@/components/WorkoutSummary';

// Start-of-week (Sunday, local midnight) for a given date — matches the weekly
// grouping the Trophies stats use.
function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}

// Opened by tapping a Coach Routine trophy. Shows the Coach sessions from the
// same week as the tapped completion, each with its full exercise/incline/rep
// breakdown, so the user can revisit their results.
export default function WorkoutSummaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    routineId?: string;
    index?: string;
    completedAt?: string;
    workoutId?: string;
  }>();

  const workoutHistory = useWorkoutStore(s => s.workoutHistory);
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription();

  const routineId = params.routineId ?? '';
  const tappedIndex = params.index ? parseInt(params.index, 10) : 0;
  const completedAt = params.completedAt ? new Date(params.completedAt) : null;
  const tier = tappedIndex ? medalTierForIndex(tappedIndex) : 'ribbon';
  const tierColor = MEDAL_COLORS[tier];

  // The coach workouts from the same week as the tapped completion. We prefer
  // an exact workoutId link; otherwise we fall back to matching this routine's
  // workouts within that calendar week (older completions predate the link).
  const weekWorkouts = useMemo<Workout[]>(() => {
    if (!completedAt) return [];
    const weekStart = startOfWeek(completedAt).getTime();
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

    // Only this routine's Coach sessions — never freestyle Tracker workouts
    // that happen to fall in the same week (e.g. a separate Leg day).
    const inWeek = workoutHistory.filter(w => {
      if (w.routineId !== routineId) return false;
      const t = new Date(w.date).getTime();
      return t >= weekStart && t < weekEnd;
    });

    // Ensure the directly-linked workout is present even if filtering missed it.
    if (params.workoutId && !inWeek.some(w => w.id === params.workoutId)) {
      const linked = workoutHistory.find(w => w.id === params.workoutId);
      if (linked) inWeek.unshift(linked);
    }

    return inWeek.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [workoutHistory, completedAt, routineId, params.workoutId]);

  const weekLabel = completedAt
    ? `Week of ${startOfWeek(completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : '';

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={() => router.back()} hitSlop={12} className="active:opacity-60 p-1">
          <ChevronLeft size={largeDisplayMode ? 26 : 30} color="#f97316" />
        </Pressable>
        <View className="flex-1 ml-1">
          <Text numberOfLines={1} className={`text-white font-bold ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
            Workout Summary
          </Text>
          {weekLabel ? (
            <Text className={`text-gray-500 ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>{weekLabel}</Text>
          ) : null}
        </View>
        {tappedIndex ? (
          <Text className={`font-semibold ${largeDisplayMode ? 'text-sm' : 'text-base'}`} style={{ color: tierColor }}>
            {MEDAL_LABELS[tier]}
          </Text>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {weekWorkouts.length === 0 ? (
          <View className="bg-gray-900 rounded-2xl p-5 mt-2">
            <Text className={`text-gray-400 text-center ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              The detailed breakdown for this session isn't available. New Coach Routine
              workouts you complete will show their full summary here.
            </Text>
          </View>
        ) : (
          <>
            <Text className={`text-gray-400 mb-3 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              {weekWorkouts.length} {weekWorkouts.length === 1 ? 'session' : 'sessions'} this week
            </Text>
            {weekWorkouts.map((w, i) => (
              <View key={w.id} className={i > 0 ? 'mt-4' : ''}>
                <WorkoutSummary workout={w} isLarge={largeDisplayMode} accentColor={tierColor} />
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <View className="px-4 pt-3 border-t border-gray-800" style={{ paddingBottom: insets.bottom + 12 }}>
        <Pressable
          onPress={() => router.back()}
          className="py-4 rounded-xl items-center bg-gray-800 active:opacity-80"
        >
          <Text className={`text-gray-200 font-semibold ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>Return</Text>
        </Pressable>
      </View>
    </View>
  );
}
