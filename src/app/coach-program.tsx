import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, ChevronDown, ClipboardList, CalendarDays, CheckCircle2 } from 'lucide-react-native';
import { getProgram, useCoachStore } from '@/lib/coach';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { remoteLog } from '@/lib/remoteLog';

export default function CoachProgramScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const programId = params.id ?? '';
  const program = getProgram(programId);

  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription();
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  const completions = useCoachStore(s => s.completions);
  const loadCoach = useCoachStore(s => s.loadFromStorage);

  // The program overview is long; keep it collapsed by default.
  const [overviewOpen, setOverviewOpen] = useState(false);

  useEffect(() => {
    loadSettings();
    loadCoach();
  }, []);

  useEffect(() => {
    if (program) remoteLog('coach_program_opened', { programId });
  }, [programId]);

  if (!program) {
    return (
      <View className="flex-1 bg-black items-center justify-center" style={{ paddingTop: insets.top }}>
        <Text className="text-white text-lg">Program not found.</Text>
        <Pressable onPress={() => router.back()} className="mt-4 px-5 py-3 bg-orange-500 rounded-xl">
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // How many times each workout has been completed (so the user can see progress).
  const countFor = (routineId: string) =>
    completions.filter(c => c.routineId === routineId).length;

  return (
    <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={() => router.back()} hitSlop={12} className="active:opacity-60 p-1">
          <ChevronLeft size={largeDisplayMode ? 26 : 30} color="#f97316" />
        </Pressable>
        <Text numberOfLines={1} className={`text-white font-bold ml-1 flex-1 ${largeDisplayMode ? 'text-lg' : 'text-2xl'}`}>
          {program.title}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Program summary chip */}
        <View className="flex-row items-center bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-4 mb-4">
          <View className="w-12 h-12 rounded-xl bg-emerald-900/40 items-center justify-center mr-3">
            <CalendarDays size={26} color="#10b981" />
          </View>
          <View className="flex-1">
            <Text className={`text-emerald-400 font-semibold ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              {program.subtitle}
            </Text>
            <Text className={`text-gray-400 mt-0.5 ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>
              Rotate through the {program.workouts.length} workouts below each week.
            </Text>
          </View>
        </View>

        {/* Collapsible overview (schedule, rules, week progression) */}
        <Pressable
          onPress={() => setOverviewOpen(o => !o)}
          className="flex-row items-center justify-between bg-gray-900 rounded-2xl px-4 py-3.5 active:opacity-80"
        >
          <Text className={`text-white font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
            Program details & weekly schedule
          </Text>
          {overviewOpen
            ? <ChevronDown size={largeDisplayMode ? 20 : 22} color="#9ca3af" />
            : <ChevronRight size={largeDisplayMode ? 20 : 22} color="#9ca3af" />}
        </Pressable>
        {overviewOpen && (
          <View className="bg-gray-900/60 rounded-2xl px-4 py-4 mt-2">
            <Text className={`text-gray-200 leading-7 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              {program.overview}
            </Text>
          </View>
        )}

        {/* Workout list */}
        <Text className={`text-gray-500 font-semibold mt-5 mb-2 tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
          WORKOUTS
        </Text>
        {program.workouts.map((workout) => {
          const done = countFor(workout.id);
          return (
            <Pressable
              key={workout.id}
              onPress={() => router.push(`/coach-routine?id=${workout.id}`)}
              className="bg-gray-900 rounded-2xl p-4 mb-3 border border-orange-500/40 flex-row items-center active:opacity-80"
            >
              <View className="w-11 h-11 rounded-xl bg-orange-900/40 items-center justify-center mr-3">
                <ClipboardList size={24} color="#f97316" />
              </View>
              <View className="flex-1 mr-2">
                <Text className={`text-white font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
                  {workout.title}
                </Text>
                <Text className={`text-gray-500 mt-0.5 ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>
                  {workout.subtitle}
                </Text>
                {done > 0 && (
                  <View className="flex-row items-center mt-1.5">
                    <CheckCircle2 size={largeDisplayMode ? 13 : 15} color="#22c55e" />
                    <Text className={`text-green-500 ml-1 font-medium ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>
                      Completed {done}×
                    </Text>
                  </View>
                )}
              </View>
              <ChevronRight size={largeDisplayMode ? 22 : 24} color="#6b7280" />
            </Pressable>
          );
        })}

        <Text className={`text-gray-600 text-center mt-3 leading-5 ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>
          Not sure where to start? Do Workout 1 on day one, then work down the list across the week.
        </Text>
      </ScrollView>
    </View>
  );
}

