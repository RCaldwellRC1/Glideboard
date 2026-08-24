import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, ChevronDown, ClipboardList, CalendarDays, CheckCircle2 } from 'lucide-react-native';
import { getProgram, useCoachStore } from '@/lib/coach';
import { useSettingsStore, useTextScaleSubscription, useTheme } from '@/lib/settings';
import { remoteLog } from '@/lib/remoteLog';

export default function CoachProgramScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
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
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }} className="items-center justify-center">
        <Text style={{ color: theme.text }} className="text-lg">Program not found.</Text>
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
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={() => router.back()} hitSlop={12} className="active:opacity-60 p-1">
          <ChevronLeft size={largeDisplayMode ? 26 : 30} color="#f97316" />
        </Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${largeDisplayMode ? 'text-lg' : 'text-2xl'}`}>
          {program.title}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Program summary chip */}
        <View style={{ backgroundColor: theme.background === '#ffffff' ? '#d1fae5' : 'rgba(16,185,129,0.2)', borderColor: 'rgba(16,185,129,0.3)' }} className="flex-row items-center border rounded-2xl p-4 mb-4">
          <View style={{ backgroundColor: theme.background === '#ffffff' ? '#ffffff' : 'rgba(16,185,129,0.4)' }} className="w-12 h-12 rounded-xl items-center justify-center mr-3">
            <CalendarDays size={26} color="#10b981" />
          </View>
          <View className="flex-1">
            <Text className={`text-emerald-500 font-semibold ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
              {program.subtitle}
            </Text>
            <Text style={{ color: theme.subText }} className={`mt-0.5 ${largeDisplayMode ? 'text-xs' : 'text-sm'} opacity-70`}>
              Rotate through the {program.workouts.length} workouts below each week.
            </Text>
          </View>
        </View>

        {/* Collapsible overview (schedule, rules, week progression) */}
        <Pressable
          onPress={() => setOverviewOpen(o => !o)}
          style={{ backgroundColor: theme.card }}
          className="flex-row items-center justify-between rounded-2xl px-4 py-3.5 active:opacity-80"
        >
          <Text style={{ color: theme.text }} className={`font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
            Program details & weekly schedule
          </Text>
          {overviewOpen
            ? <ChevronDown size={largeDisplayMode ? 20 : 22} color={theme.subText} />
            : <ChevronRight size={largeDisplayMode ? 20 : 22} color={theme.subText} />}
        </Pressable>
        {overviewOpen && (
          <View style={{ backgroundColor: `${theme.card}80` }} className="rounded-2xl px-4 py-4 mt-2">
            <Text style={{ color: theme.text }} className={`leading-7 ${largeDisplayMode ? 'text-sm' : 'text-base'} opacity-90`}>
              {program.overview}
            </Text>
          </View>
        )}

        {/* Workout list */}
        <Text style={{ color: theme.subText }} className={`font-semibold mt-5 mb-2 tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'} opacity-70`}>
          WORKOUTS
        </Text>
        {program.workouts.map((workout) => {
          const done = countFor(workout.id);
          return (
            <Pressable
              key={workout.id}
              onPress={() => router.push(`/coach-routine?id=${workout.id}`)}
              style={{ backgroundColor: theme.card, borderColor: 'rgba(249,115,22,0.3)' }}
              className="rounded-2xl p-4 mb-3 border flex-row items-center active:opacity-80"
            >
              <View style={{ backgroundColor: theme.background === '#ffffff' ? '#ffedd5' : 'rgba(249,115,22,0.2)' }} className="w-11 h-11 rounded-xl items-center justify-center mr-3">
                <ClipboardList size={24} color="#f97316" />
              </View>
              <View className="flex-1 mr-2">
                <Text style={{ color: theme.text }} className={`font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
                  {workout.title}
                </Text>
                <Text style={{ color: theme.subText }} className={`mt-0.5 ${largeDisplayMode ? 'text-xs' : 'text-sm'} opacity-70`}>
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
              <ChevronRight size={largeDisplayMode ? 22 : 24} color={theme.subText} />
            </Pressable>
          );
        })}

        <Text style={{ color: theme.subText }} className={`text-center mt-3 leading-5 ${largeDisplayMode ? 'text-xs' : 'text-sm'} opacity-60`}>
          Not sure where to start? Do Workout 1 on day one, then work down the list across the week.
        </Text>
      </ScrollView>
    </View>
  );
}

