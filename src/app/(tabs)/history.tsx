import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Pencil } from 'lucide-react-native';
import { useWorkoutStore, type Workout, type WorkoutSet } from '@/lib/workout';
import { useSettingsStore, useTextScaleSubscription, TEXT_SIZE_FACTORS } from '@/lib/settings';
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
  sets: { setNumber: number; reps: number; originalIndex: number; kind?: 'reps' | 'timed'; durationSeconds?: number }[];
}

// Format a Timed hold length for display (e.g. 90 → "1:30", 45 → "45s").
function fmtHold(total: number): string {
  if (total >= 60) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${total}s`;
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
  const [calendarVisible, setCalendarVisible] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [editingSet, setEditingSet] = useState<EditingSet | null>(null);

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
    workoutHistory.forEach(workout => {
      const date = new Date(workout.date);
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
  const allSets = selectedWorkouts.flatMap(w => w.sets);
  const exerciseGroups = groupSetsByExercise(allSets);
  const totalExercises = exerciseGroups.length;
  const totalSets = allSets.length;
  const totalReps = allSets.reduce((sum: number, s: WorkoutSet) => sum + s.reps, 0);

  return (
    <ScrollView
      className="flex-1 bg-black"
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <Text style={{ fontSize: fs(largeDisplayMode ? 30 : 38) }} className="text-white font-bold text-center mt-6">
        Workout
      </Text>
      <Text style={{ fontSize: fs(largeDisplayMode ? 30 : 38) }} className="text-white font-bold text-center">
        History
      </Text>

      {/* Toggle Calendar */}
      <Pressable
        onPress={() => setCalendarVisible(!calendarVisible)}
        className="flex-row items-center justify-center mt-6"
      >
        {calendarVisible ? (
          <View className="flex-row items-center justify-center w-full">
            <ChevronUp size={largeDisplayMode ? 24 : 20} color="#9ca3af" />
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-gray-400 ml-2 text-center flex-shrink">Tap to Show Workout Summaries</Text>
          </View>
        ) : (
          <>
            <ChevronDown size={largeDisplayMode ? 24 : 20} color="#f97316" />
            <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-orange-500 ml-2">Show Calendar</Text>
          </>
        )}
      </Pressable>

      {/* Calendar */}
      {calendarVisible && (
        <View className="mx-4 mt-4 bg-gray-900 rounded-2xl p-3">
          {/* Month Navigation */}
          <View className="flex-row items-center justify-between mb-3">
            <Pressable onPress={goToPrevMonth} className="p-2">
              <ChevronLeft size={largeDisplayMode ? 28 : 24} color="#f97316" />
            </Pressable>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: fs(largeDisplayMode ? 18 : 16) }} className="text-white font-semibold flex-1 text-center mx-1">
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
                  style={{ fontSize: fs(largeDisplayMode ? 12 : 10) }}
                  className="text-gray-500"
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
                      ? 'bg-gray-700'
                      : ''
                  }`}
                >
                  <Text
                    allowFontScaling={false}
                    style={{ fontSize: fs(largeDisplayMode ? 12 : 10) }}
                    className={`${
                      dayInfo.isToday
                        ? 'text-white font-bold'
                        : dayInfo.isCurrentMonth
                        ? 'text-white'
                        : 'text-gray-600'
                    }`}
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
      {!calendarVisible && hasWorkoutsOnSelectedDay && (
        <>
          {/* Day Summary Card */}
          <View className="mx-4 mt-4 bg-gray-900 rounded-2xl p-4">
            <Text style={{ fontSize: fs(largeDisplayMode ? 18 : 16) }} className="text-gray-400 mb-3">Day Summary</Text>
            <View className="flex-row justify-around">
              <View className="items-center">
                <Text style={{ fontSize: fs(largeDisplayMode ? 30 : 22) }} className="text-orange-500 font-bold">{totalExercises}</Text>
                <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-gray-500 mt-1">Exercises</Text>
              </View>
              <View className="items-center">
                <Text style={{ fontSize: fs(largeDisplayMode ? 30 : 22) }} className="text-orange-500 font-bold">{totalSets}</Text>
                <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-gray-500 mt-1">Sets</Text>
              </View>
              <View className="items-center">
                <Text style={{ fontSize: fs(largeDisplayMode ? 30 : 22) }} className="text-orange-500 font-bold">{totalReps}</Text>
                <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-gray-500 mt-1">Reps</Text>
              </View>
            </View>
          </View>

          {/* Individual Workout Sessions */}
          {selectedWorkouts.map((workout, workoutIndex) => {
            const workoutDate = new Date(workout.date);
            const timeStr = workoutDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
            const workoutExerciseGroups = groupSetsByExercise(workout.sets);

            return (
              <View key={workout.id} className="mx-4 mt-4">
                {/* Workout Session Header */}
                <View className="bg-gray-800 rounded-t-2xl px-4 py-3 flex-row justify-between items-center">
                  <Text numberOfLines={1} style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-orange-500 font-semibold flex-shrink-0 mr-2">
                    Workout {workoutIndex + 1}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: fs(largeDisplayMode ? 12 : 10) }} className="text-gray-400 flex-shrink-0">
                    {timeStr}
                  </Text>
                </View>

                {/* Exercise Details for this workout */}
                <View className="bg-gray-900 rounded-b-2xl p-4">
                  <Text style={{ fontSize: fs(10) }} className="text-gray-600 mb-3">
                    Tap a set to edit or delete its count
                  </Text>
                  {workoutExerciseGroups.map((group, index) => (
                    <View key={index} className={index > 0 ? 'mt-4 pt-4 border-t border-gray-800' : ''}>
                      <View className="flex-row justify-between items-center mb-2">
                        <Text
                          style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }}
                          className="flex-1 mr-2 text-white font-semibold"
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
                            className="bg-gray-800 rounded-lg px-4 py-2 mb-2 self-start flex-row items-center"
                          >
                            <Text numberOfLines={1} style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-gray-300">
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
                            className="bg-gray-800 rounded-lg px-4 py-2 mb-2 self-start flex-row items-center active:opacity-70"
                          >
                            <Text numberOfLines={1} style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-gray-300">
                              Set {set.setNumber}: <Text className="text-white font-medium">{set.reps} reps</Text>
                            </Text>
                            <Pencil size={largeDisplayMode ? 13 : 12} color="#6b7280" style={{ marginLeft: 8 }} />
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
      {!calendarVisible && !hasWorkoutsOnSelectedDay && (
        <View className="mx-4 mt-6">
          <Text style={{ fontSize: fs(largeDisplayMode ? 16 : 12) }} className="text-gray-500 text-center">
            No workout recorded on this day
          </Text>
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
