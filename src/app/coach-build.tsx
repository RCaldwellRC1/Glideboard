import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft, Plus, Minus, Trash2, X, ChevronUp, ChevronDown, NotebookText, Check,
} from 'lucide-react-native';
import { useCoachStore, createCustomRoutine, type CustomRoutineExercise } from '@/lib/coach';
import {
  EXERCISE_GROUPS, useWorkoutStore, FREE_STYLE_GROUP, TIMED_GROUP, CATEGORY_COLORS,
} from '@/lib/workout';
import { useSettingsStore, useTextScaleSubscription, useTheme } from '@/lib/settings';
import { remoteLog } from '@/lib/remoteLog';

const MIN_SETS = 1;
const MAX_SETS = 10;
const MIN_REPS = 1;
const MAX_REPS = 100;
const DEFAULT_SETS = 2;
const DEFAULT_REPS = 15;

export default function CoachBuildScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription();

  const addCustomRoutine = useCoachStore(s => s.addCustomRoutine);
  const updateCustomRoutine = useCoachStore(s => s.updateCustomRoutine);

  // When an `id` param is present we're editing an existing routine.
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = useCoachStore(s => (id ? s.customRoutines.find(r => r.id === id) : undefined));
  const isEditing = !!editing;

  const [name, setName] = useState(editing?.title ?? '');
  const [exercises, setExercises] = useState<CustomRoutineExercise[]>(
    editing?.steps.map(s => ({
      group: s.group,
      exercise: s.exercise,
      sets: s.sets,
      reps: s.targetReps ?? s.sets,
    })) ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addExercise = (group: string, exercise: string) => {
    setExercises(prev => [...prev, { group, exercise, sets: DEFAULT_SETS, reps: DEFAULT_REPS }]);
    setPickerOpen(false);
    setError(null);
  };

  const updateExercise = (index: number, patch: Partial<CustomRoutineExercise>) => {
    setExercises(prev => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const removeExercise = (index: number) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
  };

  const moveExercise = (index: number, dir: -1 | 1) => {
    setExercises(prev => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please give your routine a name.');
      return;
    }
    if (exercises.length === 0) {
      setError('Add at least one exercise.');
      return;
    }
    const routine = createCustomRoutine(trimmed, exercises, editing?.id);
    if (isEditing) {
      updateCustomRoutine(routine);
      remoteLog('coach_custom_routine_edited', { exerciseCount: exercises.length });
    } else {
      addCustomRoutine(routine);
      remoteLog('coach_custom_routine_created', { exerciseCount: exercises.length });
    }
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={() => router.back()} hitSlop={12} className="active:opacity-60 p-1">
          <ChevronLeft size={largeDisplayMode ? 26 : 30} color="#f97316" />
        </Pressable>
        <Text style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${largeDisplayMode ? 'text-lg' : 'text-2xl'}`}>
          {isEditing ? 'Edit Routine' : 'Build Your Own Routine'}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <Text style={{ color: theme.subText }} className={`mb-2 ${largeDisplayMode ? 'text-sm' : 'text-base'} opacity-70`}>
          Routine name
        </Text>
        <TextInput
          value={name}
          onChangeText={(t) => { setName(t); if (error) setError(null); }}
          placeholder="e.g. My Push Day"
          placeholderTextColor={theme.subText}
          maxLength={40}
          style={{ backgroundColor: theme.card, color: theme.text, borderColor: theme.border }}
          className={`rounded-xl px-4 border ${largeDisplayMode ? 'py-3 text-base' : 'py-4 text-lg'}`}
          returnKeyType="done"
        />

        {/* Exercises */}
        <Text style={{ color: theme.subText }} className={`mt-6 mb-2 ${largeDisplayMode ? 'text-sm' : 'text-base'} opacity-70`}>
          Exercises {exercises.length > 0 ? `(${exercises.length})` : ''}
        </Text>

        {exercises.length === 0 && (
          <View style={{ backgroundColor: `${theme.card}99`, borderColor: theme.divider }} className="rounded-2xl p-6 items-center border">
            <NotebookText size={32} color={theme.subText} />
            <Text style={{ color: theme.subText }} className={`text-center mt-2 ${largeDisplayMode ? 'text-sm' : 'text-base'} opacity-60`}>
              No exercises yet. Add one to get started.
            </Text>
          </View>
        )}

        {exercises.map((ex, i) => (
          <View key={`${ex.exercise}-${i}`} style={{ backgroundColor: theme.card, borderColor: theme.border }} className="rounded-2xl p-4 mb-3 border">
            <View className="flex-row items-start">
              <View className="w-7 h-7 rounded-full bg-orange-500/20 items-center justify-center mr-3 mt-0.5">
                <Text className={`text-orange-500 font-bold ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>{i + 1}</Text>
              </View>
              <View className="flex-1 mr-2">
                <Text style={{ color: theme.text }} className={`font-bold ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>{ex.exercise}</Text>
                <Text style={{ color: theme.subText }} className={`mt-0.5 ${largeDisplayMode ? 'text-xs' : 'text-sm'} opacity-70`}>{ex.group}</Text>
              </View>
              {/* Reorder + remove */}
              <View className="flex-row items-center">
                <Pressable onPress={() => moveExercise(i, -1)} disabled={i === 0} hitSlop={8} className="p-1 active:opacity-60">
                  <ChevronUp size={largeDisplayMode ? 18 : 20} color={i === 0 ? theme.divider : theme.subText} />
                </Pressable>
                <Pressable onPress={() => moveExercise(i, 1)} disabled={i === exercises.length - 1} hitSlop={8} className="p-1 active:opacity-60">
                  <ChevronDown size={largeDisplayMode ? 18 : 20} color={i === exercises.length - 1 ? theme.divider : theme.subText} />
                </Pressable>
                <Pressable onPress={() => removeExercise(i)} hitSlop={8} className="p-1 ml-1 active:opacity-60">
                  <Trash2 size={largeDisplayMode ? 18 : 20} color="#ef4444" />
                </Pressable>
              </View>
            </View>

            {/* Steppers */}
            <View className="flex-row mt-4">
              <Stepper
                label="SETS"
                value={ex.sets}
                min={MIN_SETS}
                max={MAX_SETS}
                onChange={(v) => updateExercise(i, { sets: v })}
                isLarge={largeDisplayMode}
              />
              <View className="w-3" />
              <Stepper
                label="TARGET REPS"
                value={ex.reps}
                min={MIN_REPS}
                max={MAX_REPS}
                step={1}
                onChange={(v) => updateExercise(i, { reps: v })}
                isLarge={largeDisplayMode}
              />
            </View>
          </View>
        ))}

        {/* Add exercise */}
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={{ borderColor: 'rgba(249,115,22,0.5)' }}
          className="mt-1 rounded-2xl p-4 border-2 border-dashed flex-row items-center justify-center active:opacity-80"
        >
          <Plus size={largeDisplayMode ? 20 : 22} color="#f97316" />
          <Text className={`text-orange-500 font-bold ml-2 ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
            Add Exercise
          </Text>
        </Pressable>

        <Text style={{ color: theme.subText }} className={`mt-4 leading-5 ${largeDisplayMode ? 'text-xs' : 'text-sm'} opacity-60`}>
          You'll pick the incline level for each exercise when you run the routine — not now.
        </Text>
      </ScrollView>

      {/* Footer save bar */}
      <View style={{ borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: insets.bottom + 12 }} className="absolute left-0 right-0 bottom-0 px-4 pt-3 border-t">
        {error && (
          <Text className={`text-red-400 text-center mb-2 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>{error}</Text>
        )}
        <Pressable
          onPress={handleSave}
          className="py-4 rounded-xl items-center bg-orange-500 active:opacity-80"
        >
          <Text className={`text-white font-bold ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>{isEditing ? 'Save Changes' : 'Save Routine'}</Text>
        </Pressable>
      </View>

      {/* Exercise picker */}
      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
        isLarge={largeDisplayMode}
      />
    </View>
  );
}

      {/* Exercise picker */}
      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
        isLarge={largeDisplayMode}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stepper — a labeled -/+ number control (no keyboard needed).
// ---------------------------------------------------------------------------

function Stepper({
  label, value, min, max, step = 1, onChange, isLarge,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  isLarge: boolean;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <View className="flex-1">
      <Text className={`text-gray-500 mb-1 tracking-wide ${isLarge ? 'text-xs' : 'text-sm'}`}>{label}</Text>
      <View className="flex-row items-center bg-gray-800 rounded-xl overflow-hidden">
        <Pressable
          onPress={dec}
          disabled={value <= min}
          className={`px-3 ${isLarge ? 'py-2.5' : 'py-3'} active:opacity-70`}
        >
          <Minus size={isLarge ? 18 : 20} color={value <= min ? '#4b5563' : '#f97316'} />
        </Pressable>
        <Text className={`flex-1 text-center text-white font-bold ${isLarge ? 'text-lg' : 'text-xl'}`}>
          {value}
        </Text>
        <Pressable
          onPress={inc}
          disabled={value >= max}
          className={`px-3 ${isLarge ? 'py-2.5' : 'py-3'} active:opacity-70`}
        >
          <Plus size={isLarge ? 18 : 20} color={value >= max ? '#4b5563' : '#f97316'} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Exercise picker — categorized list, tap to add.
//
// Shows the built-in exercises AND the user's own custom ones (which live in the
// same `customExercises` store the Tracker's EXERCISE dropdown reads), plus a
// "New exercise" row per section. Anything created here is saved to that same
// store, so it immediately appears in the Tracker dropdown too.
//
// TIMED holds are deliberately left out: the routine runner counts reps against
// a target, it has no countdown mode, so a Plank would be un-completable.
// ---------------------------------------------------------------------------

function ExercisePickerModal({
  visible, onClose, onPick, isLarge,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (group: string, exercise: string) => void;
  isLarge: boolean;
}) {
  const insets = useSafeAreaInsets();
  const customExercises = useWorkoutStore(s => s.customExercises);
  const addCustomExercise = useWorkoutStore(s => s.addCustomExercise);

  // Built-in body sections (orange) followed by Free Style (red), which is
  // entirely user-created. Same order as the Tracker's dropdown.
  const sections: { name: string; builtIn: string[]; color: string }[] = [
    ...EXERCISE_GROUPS.map(g => ({ name: g.name, builtIn: g.exercises, color: '#f97316' })),
    { name: FREE_STYLE_GROUP, builtIn: [], color: CATEGORY_COLORS.freestyle },
  ];

  // Create the exercise (saving it to the shared store so the Tracker sees it)
  // and drop it straight into the routine being built. Returns an error string
  // to show inline, or null on success.
  const createAndPick = (group: string, rawName: string): string | null => {
    const name = rawName.trim();
    if (!name) return null;

    const lower = name.toLowerCase();
    // Checked against EVERY built-in name, not just this section's: the store
    // prunes custom exercises that collide with a built-in when it reloads, so
    // allowing e.g. "Squats" under Free Style would silently lose it later.
    const clash = EXERCISE_GROUPS.find(g => g.exercises.some(e => e.toLowerCase() === lower));
    if (clash) {
      return `"${name}" already exists under ${clash.name} — pick it from there.`;
    }

    // If they retyped one of their existing exercises, just use that one —
    // matching on the stored spelling so the name stays consistent everywhere.
    const existing = (customExercises[group] ?? []).find(e => e.toLowerCase() === lower);
    if (existing) {
      onPick(group, existing);
      return null;
    }

    addCustomExercise(group, name);
    onPick(group, name);
    return null;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-gray-950 rounded-t-3xl border-t border-gray-800" style={{ maxHeight: '85%', paddingBottom: insets.bottom }}>
          <View className="flex-row items-center px-4 pt-4 pb-2">
            <Text className={`text-white font-bold flex-1 ${isLarge ? 'text-lg' : 'text-xl'}`}>Choose an Exercise</Text>
            <Pressable onPress={onClose} hitSlop={12} className="p-1 active:opacity-60">
              <X size={largeSize(isLarge)} color="#9ca3af" />
            </Pressable>
          </View>
          <ScrollView
            className="px-4"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {sections.map(section => {
              const mine = customExercises[section.name] ?? [];
              return (
                <View key={section.name} className="mb-4">
                  <Text
                    className={`font-bold mb-2 tracking-wide ${isLarge ? 'text-sm' : 'text-base'}`}
                    style={{ color: section.color }}
                  >
                    {section.name}
                  </Text>

                  {section.builtIn.map(exercise => (
                    <Pressable
                      key={`${section.name}-${exercise}`}
                      onPress={() => onPick(section.name, exercise)}
                      className="flex-row items-center bg-gray-900 rounded-xl px-4 py-3 mb-2 active:opacity-70"
                    >
                      <Text className={`text-white flex-1 ${isLarge ? 'text-base' : 'text-lg'}`}>{exercise}</Text>
                      <Plus size={isLarge ? 18 : 20} color="#f97316" />
                    </Pressable>
                  ))}

                  {/* The user's own exercises, in the section's colour — same
                      treatment as the Tracker's EXERCISE dropdown. */}
                  {mine.map(exercise => (
                    <Pressable
                      key={`${section.name}-custom-${exercise}`}
                      onPress={() => onPick(section.name, exercise)}
                      className="flex-row items-center bg-gray-900 rounded-xl px-4 py-3 mb-2 active:opacity-70"
                    >
                      <Text
                        className={`flex-1 ${isLarge ? 'text-base' : 'text-lg'}`}
                        style={{ color: section.color }}
                      >
                        {exercise}
                      </Text>
                      <Plus size={isLarge ? 18 : 20} color={section.color} />
                    </Pressable>
                  ))}

                  <CreateExerciseRow
                    group={section.name}
                    color={section.color}
                    isLarge={isLarge}
                    onCreate={createAndPick}
                  />
                </View>
              );
            })}

            <Text className={`text-gray-600 leading-5 ${isLarge ? 'text-xs' : 'text-sm'}`}>
              Anything you create here is also added to the EXERCISE dropdown on the Tracker
              screen. {TIMED_GROUP} holds aren't available in routines — they run a countdown
              instead of counting reps toward a target.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// A tap-to-type row that creates a brand-new exercise in this section and adds
// it to the routine in one step.
function CreateExerciseRow({
  group, color, isLarge, onCreate,
}: {
  group: string;
  color: string;
  isLarge: boolean;
  onCreate: (group: string, name: string) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const name = text.trim();
    if (!name) {
      setEditing(false);
      setError(null);
      Keyboard.dismiss();
      return;
    }
    const problem = onCreate(group, name);
    if (problem) {
      setError(problem);
      return;
    }
    setText('');
    setError(null);
    setEditing(false);
    Keyboard.dismiss();
  };

  if (editing) {
    return (
      <View>
        <View
          className="flex-row items-center bg-gray-900 rounded-xl px-4 py-3 mb-2 border"
          style={{ borderColor: color }}
        >
          <TextInput
            value={text}
            onChangeText={(t) => { setText(t); if (error) setError(null); }}
            autoFocus
            placeholder="Name your exercise"
            placeholderTextColor="#6b7280"
            maxLength={40}
            returnKeyType="done"
            autoCapitalize="words"
            onSubmitEditing={commit}
            className={`flex-1 ${isLarge ? 'text-base' : 'text-lg'}`}
            style={{ color }}
          />
          <Pressable onPress={commit} hitSlop={12} className="ml-2 active:opacity-60">
            <Check size={isLarge ? 20 : 22} color={color} />
          </Pressable>
          <Pressable
            onPress={() => { setText(''); setError(null); setEditing(false); Keyboard.dismiss(); }}
            hitSlop={12}
            className="ml-3 active:opacity-60"
          >
            <X size={isLarge ? 18 : 20} color="#9ca3af" />
          </Pressable>
        </View>
        {error && (
          <Text className={`text-red-400 mb-2 px-1 ${isLarge ? 'text-xs' : 'text-sm'}`}>{error}</Text>
        )}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => setEditing(true)}
      className="flex-row items-center rounded-xl px-4 py-3 mb-2 border border-dashed active:opacity-70"
      style={{ borderColor: `${color}80` }}
    >
      <Plus size={isLarge ? 16 : 18} color={color} />
      <Text className={`ml-2 italic ${isLarge ? 'text-sm' : 'text-base'}`} style={{ color: `${color}cc` }}>
        New {group.toLowerCase()} exercise
      </Text>
    </Pressable>
  );
}

function largeSize(isLarge: boolean) {
  return isLarge ? 22 : 26;
}
