import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Pencil, Trophy, Target, Flame, Clock } from 'lucide-react-native';
import { useWorkoutStore, type Workout, type WorkoutSet, getExerciseCategory, categoryColor } from '@/lib/workout';
import { useSettingsStore, useTextScaleSubscription, TEXT_SIZE_FACTORS, useTheme } from '@/lib/settings';
import { EditSetModal } from '@/components/EditSetModal';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

interface CalendarDay {
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  hasWorkout: boolean;
  date: Date;
  dateStr: string;
}

function generateCalendarDays(year: number, month: number, workoutDates: Set<string>): CalendarDay[] {
  const days: CalendarDay[] = [];
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();

  // Previous month days
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const date = new Date(prevYear, prevMonth, day);
    const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push({
      day,
      isCurrentMonth: false,
      isToday: false,
      hasWorkout: workoutDates.has(dateStr),
      date,
      dateStr,
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday =
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year;
    days.push({
      day,
      isCurrentMonth: true,
      isToday,
      hasWorkout: workoutDates.has(dateStr),
      date,
      dateStr,
    });
  }

  // Next month days to fill grid (only add what's needed for complete weeks)
  const totalDays = days.length;
  const rowsNeeded = Math.ceil(totalDays / 7);
  const remainingDays = (rowsNeeded * 7) - totalDays;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;

  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(nextYear, nextMonth, day);
    const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push({
      day,
      isCurrentMonth: false,
      isToday: false,
      hasWorkout: workoutDates.has(dateStr),
      date,
      dateStr,
    });
  }

  return days;
}

interface ExerciseGroup {
  exercise: string;
  inclineLevel: number;
  isTimed: boolean;
  sets: { setNumber: number; reps: number; originalIndex: number; kind?: 'reps' | 'timed'; durationSeconds?: number; tutSeconds?: number }[];
}

// Format a Timed hold length for display (e.g. 90 → "1:30", 45 → "45s").
function fmtHold(total: number): string {
  if (total >= 60) {
    const m = Math.floor(total / 60);
    const s = Math.round((total % 60) * 10) / 10;
    // Show decimals if they exist, otherwise round seconds.
    const sStr = s % 1 === 0 ? String(Math.round(s)).padStart(2, '0') : s.toFixed(1).padStart(4, '0');
    return `${m}:${sStr}`;
  }
  return `${total.toFixed(total % 1 === 0 ? 0 : 1)}s`;
}

function groupSetsByExercise(sets: WorkoutSet[]): ExerciseGroup[] {
  const groups: Map<string, ExerciseGroup> = new Map();

  sets.forEach((set, index) => {
    const timed = set.kind === 'timed';
    // Timed holds carry no incline, so key them by name alone to keep all holds
    // of one exercise together.
    const key = timed ? `${set.exercise}-timed` : `${set.exercise}-${set.inclineLevel}`;
    if (!groups.has(key)) {
      groups.set(key, {
        exercise: set.exercise,
        inclineLevel: set.inclineLevel,
        isTimed: timed,
        sets: [],
      });
    }
    const group = groups.get(key)!;
    // originalIndex points back to the position within workout.sets so edits/deletes
    // target the exact saved set.
    group.sets.push({
      setNumber: group.sets.length + 1,
      reps: set.reps,
      originalIndex: index,
      kind: set.kind,
      durationSeconds: set.durationSeconds,
      tutSeconds: set.tutSeconds,
    });
  });

  return Array.from(groups.values());
}

interface EditingSet {
  workoutId: string;
  setIndex: number;
  exercise: string;
  inclineLevel: number;
  setNumber: number;
  reps: number;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [calendarVisible, setCalendarVisible] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'yearly'>('daily');

  const [editingSet, setEditingSet] = useState<EditingSet | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const workoutHistory = useWorkoutStore(s => s.workoutHistory);
  const updateSetReps = useWorkoutStore(s => s.updateSetReps);
  const deleteSet = useWorkoutStore(s => s.deleteSet);
  const justCompletedDate = useWorkoutStore(s => s.justCompletedDate);
  const clearJustCompleted = useWorkoutStore(s => s.clearJustCompleted);
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  const textSize = useTextScaleSubscription(); // re-render when global text size changes
  // History-screen type scale: every size is 4px smaller than the app's base
  // scale (and the smallest, 12, drops to 10), then multiplied by the current
  // Text Size factor so Small/Medium/Large still works on this screen.
  const factor = TEXT_SIZE_FACTORS[textSize] ?? 1;
  const fs = (base: number) => Math.round(base * factor);
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  useEffect(() => {
    loadSettings();
  }, []);

  // When arriving here right after finishing (or recovering) a workout, jump
  // straight to that day's summary instead of making the user tap the calendar.
  useFocusEffect(
    useCallback(() => {
      if (justCompletedDate) {
        setSelectedDate(justCompletedDate);
        setCalendarVisible(false);
        clearJustCompleted();
      }
    }, [justCompletedDate, clearJustCompleted])
  );

  // Create map of ALL workouts by date (multiple workouts per day)
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, Workout[]>();
    if (!workoutHistory) return map;

    workoutHistory.forEach(workout => {
      if (!workout || !workout.date) return;
      const date = new Date(workout.date);
      if (isNaN(date.getTime())) return;

      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const existing = map.get(dateStr) ?? [];
      existing.push(workout);
      map.set(dateStr, existing);
    });
    return map;
  }, [workoutHistory]);

  const workoutDates = useMemo(() => new Set(workoutsByDate.keys()), [workoutsByDate]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(
    () => generateCalendarDays(year, month, workoutDates),
    [year, month, workoutDates]
  );

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDayPress = (dayInfo: CalendarDay) => {
    // Allow tapping any day
    setSelectedDate(dayInfo.dateStr);
    setCalendarVisible(false);
  };

  const selectedWorkouts = selectedDate ? workoutsByDate.get(selectedDate) ?? [] : [];
  const hasWorkoutsOnSelectedDay = selectedWorkouts.length > 0;

  // Combine all sets from all workouts on the selected day
  const allSets = selectedWorkouts.flatMap(w => (w && Array.isArray(w.sets)) ? w.sets : []);
  const exerciseGroups = groupSetsByExercise(allSets);
  const totalExercises = exerciseGroups.length;
  const totalSets = allSets.length;
  const totalReps = allSets.reduce((sum: number, s: WorkoutSet) => sum + (s?.reps ?? 0), 0);

  // --- Aggregate Data for Monthly / Yearly Views ---
  const aggregatedData = useMemo(() => {
    if (viewMode === 'daily') return [];

    const isMonthly = viewMode === 'monthly';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Filter workouts by month or year
    const filteredWorkouts = workoutHistory.filter(w => {
      const d = new Date(w.date);
      if (isMonthly) {
        return d.getFullYear() === year && d.getMonth() === month;
      }
      return d.getFullYear() === year;
    });

    const statsMap = new Map<string, { exercise: string; sets: number; reps: number; category: string; tut: number }>();

    filteredWorkouts.forEach(w => {
      w.sets.forEach(s => {
        const stats = statsMap.get(s.exercise) ?? {
          exercise: s.exercise,
          sets: 0,
          reps: 0,
          tut: 0,
          category: getExerciseCategory(s.exercise, useWorkoutStore.getState().customExercises)
        };
        stats.sets += 1;
        stats.reps += (s.reps ?? 0);
        stats.tut += (s.tutSeconds ?? 0);
        statsMap.set(s.exercise, stats);
      });
    });

    return Array.from(statsMap.values()).sort((a, b) => b.reps - a.reps);
  }, [viewMode, currentDate, workoutHistory]);

  const viewLabel = viewMode === 'monthly'
    ? `${MONTHS[month]} ${year}`
    : viewMode === 'yearly'
    ? `${year} Summary`
    : '';

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: theme.background }}
      className="flex-1"
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <View className="items-center mt-6">
        <Text style={{ fontSize: fs(largeDisplayMode ? 28 : 34), color: theme.text }} className="font-bold">
          Workout History
        </Text>

        {/* View Toggles */}
        <View style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }} className="flex-row rounded-xl p-1 mt-4 mx-4">
          {(['daily', 'monthly', 'yearly'] as const).map((mode) => {
            const active = viewMode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => setViewMode(mode)}
                style={{ backgroundColor: active ? '#f97316' : 'transparent' }}
                className="flex-1 py-2 rounded-lg items-center justify-center"
              >
                <Text
                  style={{
                    color: active ? '#fff' : theme.subText,
                    fontSize: fs(largeDisplayMode ? 13 : 11)
                  }}
                  className="font-bold uppercase tracking-widest"
                >
                  {mode}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Toggle Calendar */}
      {viewMode === 'daily' && (
        <Pressable
          onPress={() => setCalendarVisible(!calendarVisible)}
          className="flex-row items-center justify-center mt-6"
        >
          {calendarVisible ? (
            <View className="flex-row items-center justify-center w-full">
              <ChevronUp size={largeDisplayMode ? 24 : 20} color={theme.subText} />
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: fs(largeDisplayMode ? 16 : 12), color: theme.subText }} className="ml-2 text-center flex-shrink">Tap to Show Workout Summaries</Text>
            </View>
          ) : (
            <>
              <ChevronDown size={largeDisplayMode ? 24 : 20} color="#f97316" />
              <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-orange-500 ml-2">Show Calendar</Text>
            </>
          )}
        </Pressable>
      )}

      {/* Calendar (only in daily view) */}
      {viewMode === 'daily' && calendarVisible && (
        <View style={{ backgroundColor: theme.card }} className="mx-4 mt-4 rounded-2xl p-3">
          {/* Month Navigation */}
          <View className="flex-row items-center justify-between mb-3">
            <Pressable onPress={goToPrevMonth} className="p-2">
              <ChevronLeft size={largeDisplayMode ? 28 : 24} color="#f97316" />
            </Pressable>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: fs(largeDisplayMode ? 18 : 16), color: theme.text }} className="font-semibold flex-1 text-center mx-1">
              {MONTHS[month]} {year}
            </Text>
            <Pressable onPress={goToNextMonth} className="p-2">
              <ChevronRight size={largeDisplayMode ? 28 : 24} color="#f97316" />
            </Pressable>
          </View>

          {/* Day Headers */}
          <View className="flex-row mb-1">
            {DAYS_OF_WEEK.map(day => (
              <View key={day} className="flex-1 items-center">
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontSize: fs(largeDisplayMode ? 12 : 10), color: theme.subText }}
                >
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          <View className="flex-row flex-wrap">
            {calendarDays.map((dayInfo, index) => (
              <Pressable
                key={index}
                className="w-[14.28%] items-center py-1"
                onPress={() => handleDayPress(dayInfo)}
              >
                <View
                  className={`items-center justify-center rounded-full ${largeDisplayMode ? 'w-9 h-9' : 'w-8 h-8'} ${
                    dayInfo.isToday
                      ? 'bg-orange-500'
                      : selectedDate === dayInfo.dateStr
                      ? theme.background === '#ffffff' ? '#e5e7eb' : '#374151'
                      : ''
                  }`}
                >
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontSize: fs(largeDisplayMode ? 12 : 10),
                      color: dayInfo.isToday
                        ? '#ffffff'
                        : dayInfo.isCurrentMonth
                        ? (theme.background === '#ffffff' ? '#000000' : '#ffffff')
                        : (theme.background === '#ffffff' ? '#9ca3af' : '#4b5563')
                    }}
                  >
                    {dayInfo.day}
                  </Text>
                </View>
                {/* Workout indicator dot */}
                {dayInfo.hasWorkout && !dayInfo.isToday && (
                  <View className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-0.5" />
                )}
                {/* Spacer for days without dot to maintain alignment */}
                {!dayInfo.hasWorkout && !dayInfo.isToday && (
                  <View className="w-1.5 h-1.5 mt-0.5" />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Workout Summary - shown when calendar is hidden and a date is selected */}
      {viewMode === 'daily' && !calendarVisible && hasWorkoutsOnSelectedDay && (
        <>
          {/* Day Summary Card */}
          <View style={{ backgroundColor: theme.card }} className="mx-4 mt-4 rounded-2xl p-4">
            <Text style={{ fontSize: fs(largeDisplayMode ? 18 : 16), color: theme.subText }} className="mb-3">Day Summary</Text>
            <View className="flex-row justify-around">
              <View className="items-center">
                <Text style={{ fontSize: fs(largeDisplayMode ? 30 : 22) }} className="text-orange-500 font-bold">{totalExercises}</Text>
                <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12), color: theme.subText }} className="mt-1">Exercises</Text>
              </View>
              <View className="items-center">
                <Text style={{ fontSize: fs(largeDisplayMode ? 30 : 22) }} className="text-orange-500 font-bold">{totalSets}</Text>
                <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12), color: theme.subText }} className="mt-1">Sets</Text>
              </View>
              <View className="items-center">
                <Text style={{ fontSize: fs(largeDisplayMode ? 30 : 22) }} className="text-orange-500 font-bold">{totalReps}</Text>
                <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12), color: theme.subText }} className="mt-1">Reps</Text>
              </View>
            </View>
          </View>

          {/* Individual Workout Sessions */}
          {selectedWorkouts.map((workout, workoutIndex) => {
            if (!workout) return null;
            const workoutDate = new Date(workout.date);
            const timeStr = isNaN(workoutDate.getTime())
              ? '--:--'
              : workoutDate.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                });
            const workoutExerciseGroups = groupSetsByExercise(workout.sets ?? []);

            return (
              <View key={workout.id} className="mx-4 mt-4">
                {/* Workout Session Header */}
                <View style={{ backgroundColor: theme.background === '#ffffff' ? '#f3f4f6' : '#1f2937' }} className="rounded-t-2xl px-4 py-3 flex-row justify-between items-center">
                  <Text numberOfLines={1} style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-orange-500 font-semibold flex-shrink-0 mr-2">
                    Workout {workoutIndex + 1}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: fs(largeDisplayMode ? 12 : 10), color: theme.subText }} className="flex-shrink-0">
                    {timeStr}
                  </Text>
                </View>

                {/* Exercise Details for this workout */}
                <View style={{ backgroundColor: theme.card }} className="rounded-b-2xl p-4">
                  <Text style={{ fontSize: fs(10), color: theme.subText }} className="mb-3 opacity-60">
                    Tap a set to edit or delete its count
                  </Text>
                  {workoutExerciseGroups.map((group, index) => (
                    <View key={index} className={index > 0 ? 'mt-4 pt-4 border-t' : ''} style={{ borderTopColor: theme.border }}>
                      <View className="flex-row justify-between items-center mb-2">
                        <Text
                          style={{ fontSize: fs(largeDisplayMode ? 16 : 12), color: theme.text }}
                          className="flex-1 mr-2 font-semibold"
                          numberOfLines={1}
                        >
                          {group.exercise}
                        </Text>
                        {group.isTimed ? (
                          <Text style={{ fontSize: fs(largeDisplayMode ? 12 : 10), color: '#a855f7' }} className="flex-shrink-0">Timed</Text>
                        ) : (
                          <Text style={{ fontSize: fs(largeDisplayMode ? 12 : 10) }} className="text-orange-500 flex-shrink-0">Level {group.inclineLevel}</Text>
                        )}
                      </View>
                      {group.sets.map((set) => (
                        group.isTimed ? (
                          // Timed holds display their duration and aren't rep-editable.
                          <View
                            key={set.setNumber}
                            style={{ backgroundColor: theme.background === '#ffffff' ? '#f9fafb' : '#1f2937' }}
                            className="rounded-lg px-4 py-2 mb-2 self-start flex-row items-center"
                          >
                            <Text numberOfLines={1} style={{ fontSize: fs(largeDisplayMode ? 16 : 12), color: theme.text }} className="opacity-80">
                              Set {set.setNumber}: <Text className="font-medium" style={{ color: '#a855f7' }}>{fmtHold(set.durationSeconds ?? 0)}</Text>
                            </Text>
                          </View>
                        ) : (
                          <Pressable
                            key={set.setNumber}
                            onPress={() => setEditingSet({
                              workoutId: workout.id,
                              setIndex: set.originalIndex,
                              exercise: group.exercise,
                              inclineLevel: group.inclineLevel,
                              setNumber: set.setNumber,
                              reps: set.reps,
                            })}
                            style={{ backgroundColor: theme.background === '#ffffff' ? '#f9fafb' : '#1f2937' }}
                            className="rounded-lg px-4 py-2 mb-2 self-start flex-row items-center active:opacity-70"
                          >
                            <Text numberOfLines={1} style={{ fontSize: fs(largeDisplayMode ? 16 : 12), color: theme.text }} className="opacity-80">
                              Set {set.setNumber}: <Text style={{ color: theme.text }} className="font-medium">{set.reps} reps</Text>
                            </Text>
                            {set.tutSeconds ? (
                              <View className="flex-row items-center ml-3 opacity-60">
                                <Clock size={11} color={theme.subText} />
                                <Text style={{ color: theme.subText, fontSize: fs(largeDisplayMode ? 12 : 10) }} className="ml-1 font-medium">{fmtHold(set.tutSeconds)}</Text>
                              </View>
                            ) : null}
                            <Pencil size={largeDisplayMode ? 13 : 12} color={theme.subText} style={{ marginLeft: 8 }} />
                          </Pressable>
                        )
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </>
      )}

      {/* Empty state when no workout selected */}
      {viewMode === 'daily' && !calendarVisible && !hasWorkoutsOnSelectedDay && (
        <View className="mx-4 mt-6">
          <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12), color: theme.subText }} className="text-center">
            No workout recorded on this day
          </Text>
        </View>
      )}

      {/* Monthly / Yearly Insights List */}
      {viewMode !== 'daily' && (
        <View className="mx-4 mt-6">
          <View className="flex-row items-center justify-between mb-4 px-1">
            <View>
              <Text style={{ color: theme.text }} className={`font-bold ${largeDisplayMode ? 'text-xl' : 'text-2xl'}`}>
                {viewMode === 'monthly' ? 'Monthly Leaderboard' : 'Year in Review'}
              </Text>
              <Text style={{ color: theme.subText }} className={`mt-0.5 ${largeDisplayMode ? 'text-sm' : 'text-base'} opacity-70`}>
                {viewLabel}
              </Text>
            </View>
            <View style={{ backgroundColor: 'rgba(249,115,22,0.1)' }} className="p-2.5 rounded-2xl">
              <Trophy size={28} color="#f97316" />
            </View>
          </View>

          {aggregatedData.length === 0 ? (
            <View style={{ backgroundColor: theme.card, borderColor: theme.divider }} className="rounded-3xl p-8 items-center border border-dashed mt-4">
              <Flame size={32} color={theme.subText} style={{ opacity: 0.3 }} />
              <Text style={{ color: theme.subText }} className="text-center mt-3 leading-6 opacity-60">
                No data recorded for this period yet.{"\n"}Keep pushing to see your results!
              </Text>
            </View>
          ) : (
            aggregatedData.map((item, index) => {
              const accentColor = categoryColor(item.category as any);
              return (
                <View
                  key={item.exercise}
                  style={{
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: theme.background === '#ffffff' ? 0.06 : 0,
                    shadowRadius: 10,
                    elevation: theme.background === '#ffffff' ? 3 : 0
                  }}
                  className="rounded-2xl p-4 mb-3 flex-row items-center border"
                >
                  {/* Rank Badge */}
                  <View
                    style={{ backgroundColor: index < 3 ? 'rgba(249,115,22,0.1)' : (theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937') }}
                    className="w-9 h-9 rounded-full items-center justify-center mr-3"
                  >
                    <Text
                      style={{ color: index < 3 ? '#f97316' : theme.text }}
                      className="font-black text-xs"
                    >
                      {index + 1}
                    </Text>
                  </View>

                  <View className="flex-1 mr-2">
                    <Text style={{ color: theme.text }} className={`font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`} numberOfLines={1}>
                      {item.exercise}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <View style={{ backgroundColor: `${accentColor}15` }} className="px-2 py-0.5 rounded-full">
                        <Text style={{ color: accentColor }} className="text-[10px] font-black uppercase tracking-widest">{item.category}</Text>
                      </View>
                      <Text style={{ color: theme.subText }} className="text-xs ml-2 font-medium opacity-60">
                        {item.sets} {item.sets === 1 ? 'set' : 'sets'}
                      </Text>
                    </View>
                  </View>

                  <View className="items-end">
                    <Text className="text-orange-500 font-black text-2xl">{item.reps}</Text>
                    <Text style={{ color: theme.subText }} className="text-[9px] uppercase font-black tracking-widest opacity-60">Total Reps</Text>
                    {item.tut > 0 && (
                      <View className="flex-row items-center mt-0.5">
                        <Clock size={10} color={theme.subText} />
                        <Text style={{ color: theme.subText }} className="text-[10px] font-bold ml-1 opacity-60">{fmtHold(item.tut)} TUT</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}

          <View className="mt-4 mb-10 px-6">
            <Text style={{ color: theme.subText }} className="text-center text-xs italic opacity-40">
              Exercises are sorted by total reps achieved in this period.
            </Text>
          </View>
        </View>
      )}

      {/* Edit / delete a saved set */}
      <EditSetModal
        visible={editingSet !== null}
        exercise={editingSet?.exercise ?? ''}
        inclineLevel={editingSet?.inclineLevel ?? 0}
        setNumber={editingSet?.setNumber ?? 0}
        currentReps={editingSet?.reps ?? 0}
        isLarge={largeDisplayMode}
        onSave={(reps) => {
          if (editingSet) updateSetReps(editingSet.workoutId, editingSet.setIndex, reps);
          setEditingSet(null);
        }}
        onDelete={() => {
          if (editingSet) deleteSet(editingSet.workoutId, editingSet.setIndex);
          setEditingSet(null);
        }}
        onCancel={() => setEditingSet(null)}
      />
    </ScrollView>
  );
}
