import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import {
  ChevronLeft, ChevronRight, Check, Loader, Trophy, Medal, Ribbon, Crown, PartyPopper, Pencil, Minus, Plus, Trash2, RotateCcw, FastForward
} from 'lucide-react-native';
import { getRoutine, useCoachStore, medalTierForIndex, MEDAL_LABELS, MEDAL_COLORS, type CoachCompletion, type CoachRoutine, type RoutineStep } from '@/lib/coach';
import { useWorkoutStore, type Workout, EXERCISE_GROUPS } from '@/lib/workout';
import { useSettingsStore, useTextScaleSubscription, useTheme } from '@/lib/settings';
import { useAdaptiveRepStore, useMotionContext } from '@/lib/motion';
import { useVoiceCounting } from '@/lib/voice';
import { RepConfirmationModal } from '@/components/RepConfirmationModal';
import { InclineDropdown } from '@/components/InclineDropdown';
import { RepModeToggle } from '@/components/RepModeToggle';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { WorkoutSummary } from '@/components/WorkoutSummary';
import { Confetti } from '@/components/Confetti';
import { remoteLog } from '@/lib/remoteLog';

type Phase = 'instructions' | 'running' | 'complete' | 'summary';

export default function CoachRoutineScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const routineId = params.id ?? '';
  const customRoutines = useCoachStore(s => s.customRoutines);
  const customizedRoutines = useCoachStore(s => s.customizedRoutines);

  // Resolution order: Customized > User-built (customRoutines) > Built-in defaults.
  const baseRoutine = getRoutine(routineId) ?? customRoutines.find(r => r.id === routineId);
  const routine = customizedRoutines[routineId] ?? baseRoutine;

  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription();
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  const dontShowInstructions = useCoachStore(s => s.dontShowInstructions);
  const setDontShowInstructions = useCoachStore(s => s.setDontShowInstructions);
  const recordCompletion = useCoachStore(s => s.recordCompletion);
  const loadCoach = useCoachStore(s => s.loadFromStorage);
  const coachLoaded = useCoachStore(s => s.isLoaded);

  const [phase, setPhase] = useState<Phase>('instructions');
  const [dontShowChecked, setDontShowChecked] = useState(false);
  const [completion, setCompletion] = useState<CoachCompletion | null>(null);
  // The finished workout, captured so the post-confetti summary can show it.
  const [completedWorkout, setCompletedWorkout] = useState<Workout | null>(null);
  // Ensures we only auto-decide the initial phase once, after stores load.
  const initializedRef = useRef(false);

  useEffect(() => {
    loadSettings();
    loadCoach();
  }, []);

  // Once coach prefs are loaded, skip the instructions if the user opted out.
  useEffect(() => {
    if (!coachLoaded || initializedRef.current) return;
    initializedRef.current = true;
    if (dontShowInstructions[routineId]) {
      startRunning();
    }
  }, [coachLoaded]);

  if (!routine) {
    // Custom routines live in the coach store - don't flash "not found" while it
    // is still loading from the device.
    if (!coachLoaded) {
      return <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }} />;
    }
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }} className="items-center justify-center">
        <Text style={{ color: theme.text }} className="text-lg">Routine not found.</Text>
        <Pressable onPress={() => router.back()} className="mt-4 px-5 py-3 bg-orange-500 rounded-xl">
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  function startRunning() {
    if (dontShowChecked) setDontShowInstructions(routineId, true);
    remoteLog('coach_routine_started', { routineId });
    setPhase('running');
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      {phase === 'instructions' && (
        <InstructionsView
          routine={routine}
          isLarge={largeDisplayMode}
          dontShowChecked={dontShowChecked}
          onToggleDontShow={() => setDontShowChecked(v => !v)}
          onBegin={startRunning}
          onBack={() => router.back()}
          isCustomized={!!customizedRoutines[routineId]}
        />
      )}

      {phase === 'running' && (
        <RunnerView
          routine={routine}
          isLarge={largeDisplayMode}
          onExit={() => router.back()}
          onComplete={(workout) => {
            const entry = recordCompletion(routineId, workout?.id);
            remoteLog('coach_routine_completed', { routineId, index: entry.index });
            setCompletion(entry);
            setCompletedWorkout(workout);
            setPhase('complete');
          }}
        />
      )}

      {phase === 'complete' && completion && (
        <CompleteView
          completion={completion}
          isLarge={largeDisplayMode}
          onNext={() => setPhase('summary')}
        />
      )}

      {phase === 'summary' && completedWorkout && (
        <SummaryView
          workout={completedWorkout}
          completion={completion}
          isLarge={largeDisplayMode}
          onDone={() => router.replace('/(tabs)/trophies')}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Routine Preview - list of exercises (no instructions, no setup).
// Reused by the disclaimer/instructions screen and the warmup-complete screen.
// ---------------------------------------------------------------------------

function RoutinePreview({
  routine, isLarge, onClose,
}: {
  routine: CoachRoutine;
  isLarge: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [steps, setSteps] = useState<RoutineStep[]>(routine.steps);
  const [showPicker, setShowPicker] = useState(false);

  const customizeRoutine = useCoachStore(s => s.customizeRoutine);
  const resetRoutine = useCoachStore(s => s.resetRoutine);
  const isCustomized = useCoachStore(s => !!s.customizedRoutines[routine.id]);

  const customExercises = useWorkoutStore(s => s.customExercises);
  const addCustomExercise = useWorkoutStore(s => s.addCustomExercise);
  const renameCustomExercise = useWorkoutStore(s => s.renameCustomExercise);

  // Sync steps with routine when not editing (e.g. on Reset)
  useEffect(() => {
    if (!isEditing) setSteps(routine.steps);
  }, [routine.steps, isEditing]);

  const updateSetCount = (index: number, delta: number) => {
    const newSteps = [...steps];
    newSteps[index] = {
      ...newSteps[index],
      sets: Math.max(1, newSteps[index].sets + delta),
    };
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const addStep = (exercise: string, group: string) => {
    const newStep: RoutineStep = {
      group,
      exercise,
      sets: 2,
      repRangeLabel: '10-15 Reps',
    };
    setSteps([...steps, newStep]);
    setShowPicker(false);
  };

  const handleDoneEditing = () => {
    customizeRoutine({ ...routine, steps });
    setIsEditing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={onClose} hitSlop={12} className="active:opacity-60 p-1">
          <ChevronLeft size={isLarge ? 26 : 30} color="#f97316" />
        </Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${isLarge ? 'text-lg' : 'text-xl'}`}>
          Preview - {routine.title}
        </Text>
        <Pressable
          onPress={() => setIsEditing(!isEditing)}
          style={{ backgroundColor: isEditing ? '#f97316' : theme.divider }}
          className={`w-10 h-10 items-center justify-center rounded-full ml-2`}
        >
          <Pencil size={isLarge ? 20 : 22} color={isEditing ? '#fff' : '#f97316'} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: theme.subText }} className={`mb-2 ${isLarge ? 'text-sm' : 'text-base'} opacity-70`}>
          {steps.length} {steps.length === 1 ? 'exercise' : 'exercises'} in this routine.
        </Text>

        {isCustomized && !isEditing && (
          <View style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }} className="flex-row items-center rounded-xl px-4 py-3 mb-4 border">
            <Text className="text-orange-400 font-medium flex-1 text-sm">
              You've customized this routine.
            </Text>
            <Pressable
              onPress={() => resetRoutine(routine.id)}
              className="flex-row items-center bg-orange-500/20 px-3 py-1.5 rounded-lg active:opacity-70"
            >
              <RotateCcw size={14} color="#f97316" />
              <Text className="text-orange-500 font-bold ml-1.5 text-xs uppercase tracking-wider">Reset</Text>
            </Pressable>
          </View>
        )}

        {steps.map((s, i) => (
          <View
            key={`${s.exercise}-${i}`}
            style={{ backgroundColor: theme.card }}
            className="flex-row items-center rounded-xl px-4 py-3 mb-2"
          >
            <View className="w-8 h-8 rounded-full bg-orange-500/20 items-center justify-center mr-3">
              <Text className={`text-orange-500 font-bold ${isLarge ? 'text-sm' : 'text-base'}`}>{i + 1}</Text>
            </View>
            <View className="flex-1">
              <Text style={{ color: theme.text }} className={`font-semibold ${isLarge ? 'text-base' : 'text-lg'}`}>{s.exercise}</Text>
              <Text style={{ color: theme.subText }} className={`mt-0.5 ${isLarge ? 'text-xs' : 'text-sm'} opacity-70`}>
                {s.group} - {s.repRangeLabel}
              </Text>
            </View>

            {isEditing ? (
              <View className="flex-row items-center">
                <View style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className="flex-row items-center rounded-lg p-1 mr-3">
                  <Pressable
                    onPress={() => updateSetCount(i, -1)}
                    className="w-8 h-8 items-center justify-center active:bg-gray-700 rounded-md"
                  >
                    <Minus size={16} color="#f97316" />
                  </Pressable>
                  <View className="w-8 items-center">
                    <Text style={{ color: theme.text }} className="font-bold text-base">{s.sets}</Text>
                  </View>
                  <Pressable
                    onPress={() => updateSetCount(i, 1)}
                    className="w-8 h-8 items-center justify-center active:bg-gray-700 rounded-md"
                  >
                    <Plus size={16} color="#f97316" />
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => removeStep(i)}
                  style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
                  className="w-9 h-9 items-center justify-center rounded-lg active:bg-red-500/20"
                >
                  <Trash2 size={18} color="#ef4444" />
                </Pressable>
              </View>
            ) : (
              <Text className="text-orange-500 font-bold text-lg">{s.sets} sets</Text>
            )}
          </View>
        ))}

        {isEditing && (
          <Pressable
            onPress={() => setShowPicker(true)}
            style={{ borderColor: theme.divider }}
            className="mt-2 py-4 rounded-xl items-center border-2 border-dashed active:opacity-60"
          >
            <View className="flex-row items-center">
              <Plus size={18} color="#f97316" />
              <Text className="text-orange-500 font-bold ml-2 text-lg">Add Exercise</Text>
            </View>
          </Pressable>
        )}
      </ScrollView>

      <View style={{ borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: insets.bottom + 12 }} className="px-4 pt-3 border-t">
        {isEditing ? (
          <Pressable
            onPress={handleDoneEditing}
            className="py-4 rounded-xl items-center bg-green-600 active:opacity-80"
          >
            <Text className={`text-white font-bold ${isLarge ? 'text-lg' : 'text-xl'}`}>Done Editing</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onClose}
            className="py-4 rounded-xl items-center bg-orange-500 active:opacity-80"
          >
            <Text className={`text-white font-bold ${isLarge ? 'text-lg' : 'text-xl'}`}>Return</Text>
          </Pressable>
        )}
      </View>

      <ExercisePickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={addStep}
        isLarge={isLarge}
        customExercises={customExercises}
        onAddCustom={addCustomExercise}
        onRenameCustom={renameCustomExercise}
        showCoachRoutines={false}
        title="Add to Routine"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

function InstructionsView({
  routine, isLarge, dontShowChecked, onToggleDontShow, onBegin, onBack, isCustomized,
}: {
  routine: CoachRoutine;
  isLarge: boolean;
  dontShowChecked: boolean;
  onToggleDontShow: () => void;
  onBegin: () => void;
  onBack: () => void;
  isCustomized: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [showPreview, setShowPreview] = useState(false);
  const resetRoutine = useCoachStore(s => s.resetRoutine);

  // Preview list of the exercises in this routine (no instructions, no setup).
  if (showPreview) {
    return <RoutinePreview routine={routine} isLarge={isLarge} onClose={() => setShowPreview(false)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={onBack} hitSlop={12} className="active:opacity-60 p-1">
          <ChevronLeft size={isLarge ? 26 : 30} color="#f97316" />
        </Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${isLarge ? 'text-lg' : 'text-xl'}`}>
          {routine.title}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {isCustomized && (
          <View style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }} className="flex-row items-center rounded-xl px-4 py-3 mb-4 border">
            <Text className="text-orange-400 font-medium flex-1 text-sm">
              You've customized this routine.
            </Text>
            <Pressable
              onPress={() => resetRoutine(routine.id)}
              className="flex-row items-center bg-orange-500/20 px-3 py-1.5 rounded-lg active:opacity-70"
            >
              <RotateCcw size={14} color="#f97316" />
              <Text className="text-orange-500 font-bold ml-1.5 text-xs uppercase tracking-wider">Reset</Text>
            </Pressable>
          </View>
        )}

        <Text style={{ color: theme.text }} className={`leading-7 ${isLarge ? 'text-base' : 'text-lg'} opacity-90`}>
          {routine.instructions}
        </Text>
      </ScrollView>

      {/* Footer controls */}
      <View
        style={{ borderTopColor: theme.border }}
        className="px-4 pt-3 border-t"
      >
        <Pressable onPress={onToggleDontShow} className="flex-row items-center mb-3 active:opacity-70">
          <View
            style={{ backgroundColor: dontShowChecked ? '#f97316' : theme.divider, borderColor: theme.border }}
            className={`w-6 h-6 rounded items-center justify-center mr-2 ${!dontShowChecked ? 'border' : ''}`}
          >
            {dontShowChecked && <Check size={16} color="#fff" />}
          </View>
          <Text style={{ color: theme.subText }} className={isLarge ? 'text-sm' : 'text-base'}>Don't show me this again</Text>
        </Pressable>

        <View className="flex-row">
          <Pressable
            onPress={() => setShowPreview(true)}
            style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }}
            className="flex-1 mr-2 py-4 rounded-xl items-center active:opacity-60"
          >
            <Text style={{ color: theme.text }} className={`font-semibold ${isLarge ? 'text-lg' : 'text-xl'}`}>Preview Routine</Text>
          </Pressable>
          <Pressable
            onPress={onBegin}
            className="flex-1 ml-2 py-4 rounded-xl items-center bg-orange-500 active:opacity-80"
          >
            <Text className={`text-white font-bold ${isLarge ? 'text-lg' : 'text-xl'}`}>Ready to Begin</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Runner - guided, auto-advancing. Reuses the Tracker's motion/voice counting.
// ---------------------------------------------------------------------------

function RunnerView({
  routine, isLarge, onExit, onComplete,
}: {
  routine: NonNullable<ReturnType<typeof getRoutine>>;
  isLarge: boolean;
  onExit: () => void;
  onComplete: (workout: Workout | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  // -1 = warmup intro; 0..n-1 = active exercise step.
  const [stepIndex, setStepIndex] = useState(-1);
  const [setsDone, setSetsDone] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSetSummary, setPendingSetSummary] = useState<{ repCount: number; needsConfirmation: boolean } | null>(null);
  const [isWaitingForVoiceToEndSet, setIsWaitingForVoiceToEndSet] = useState(false);
  const [setupSecondsLeft, setSetupSecondsLeft] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  // Seconds left on the pre-set "get into position" countdown (null = not counting).
  const [getReadyLeft, setGetReadyLeft] = useState<number | null>(null);

  // Settings
  const repCountingMode = useSettingsStore(s => s.repCountingMode);
  const setRepCountingMode = useSettingsStore(s => s.setRepCountingMode);
  const motionSensitivity = useSettingsStore(s => s.motionSensitivity);
  const paceSettings = useSettingsStore(s => s.paceSettings);

  const sensitivityMultiplierMap = { low: 1.5, medium: 1.0, high: 0.6 } as const;
  const jitterFloorMsMap = { low: 140, medium: 100, high: 70 } as const;
  const cooldownFloorMsMap = { low: 1000, medium: 700, high: 450 } as const;
  const expectedRepMs = (paceSettings.liftTime + paceSettings.holdTime + paceSettings.downTime) * 1000;
  const minRepDurationMs = jitterFloorMsMap[motionSensitivity];
  const baseRepCooldownMs = Math.max(cooldownFloorMsMap[motionSensitivity], Math.round(expectedRepMs * 0.85));
  // "Get into position" prep shown before EVERY set, in BOTH counting modes, so
  // every exercise behaves identically. Length comes from the user's pace setting.
  const getReadySeconds = Math.max(0, Math.round(paceSettings.delayToStart));
  // Motion counting still needs a short window to read a steady baseline once the
  // set begins - but the actual positioning is handled by the get-ready countdown
  // above, so keep this brief to avoid making the user wait twice.
  const setupDelayMs = 900;

  // Workout store
  const isWorkoutActive = useWorkoutStore(s => s.isWorkoutActive);
  const isSetActive = useWorkoutStore(s => s.isSetActive);
  const currentExercise = useWorkoutStore(s => s.currentExercise);
  const currentInclineLevel = useWorkoutStore(s => s.currentInclineLevel);
  const currentReps = useWorkoutStore(s => s.currentReps);
  const startWorkout = useWorkoutStore(s => s.startWorkout);
  const endWorkout = useWorkoutStore(s => s.endWorkout);
  const startSet = useWorkoutStore(s => s.startSet);
  const endSet = useWorkoutStore(s => s.endSet);
  const cancelSet = useWorkoutStore(s => s.cancelSet);
  const setReps = useWorkoutStore(s => s.setReps);
  const setExercise = useWorkoutStore(s => s.setExercise);
  const setInclineLevel = useWorkoutStore(s => s.setInclineLevel);
  const setCurrentTUT = useWorkoutStore(s => s.setCurrentTUT);
  const exerciseHistory = useWorkoutStore(s => s.exerciseHistory);

  const [inclineDropdownOpen, setInclineDropdownOpen] = useState(false);

  // The incline to start an exercise at: the level you last used for it, so each
  // exercise comes "preloaded" to where you left off. Falls back to whatever's
  // currently set if you've never done this exercise before.
  const preloadInclineFor = useCallback((exercise: string): number | null => {
    const matches = exerciseHistory.filter(h => h.exercise === exercise);
    if (matches.length === 0) return null;
    const latest = matches.reduce((a, b) =>
      new Date(b.lastDate).getTime() > new Date(a.lastDate).getTime() ? b : a
    );
    return latest.inclineLevel;
  }, [exerciseHistory]);

  // Adaptive rep store
  const adaptiveSetState = useAdaptiveRepStore(s => s.setState);
  const adaptiveRepCount = useAdaptiveRepStore(s => s.repCount);
  const adaptiveSetStartTime = useAdaptiveRepStore(s => s.setStartTime);
  const ignoreMotion = useAdaptiveRepStore(s => s.ignoreMotion);
  const isLearningROM = useAdaptiveRepStore(s => s.isLearningROM);
  const adaptiveStartSet = useAdaptiveRepStore(s => s.startSet);
  const adaptiveEndSet = useAdaptiveRepStore(s => s.endSet);
  const adaptiveProcessMotion = useAdaptiveRepStore(s => s.processMotion);
  const applyUserOverride = useAdaptiveRepStore(s => s.applyUserOverride);
  const adaptiveResetToIdle = useAdaptiveRepStore(s => s.resetToIdle);
  const loadAdaptiveProfiles = useAdaptiveRepStore(s => s.loadFromStorage);

  const learnedCooldownFactor = useAdaptiveRepStore(s => {
    const f = s.cooldownAdjustments[`${currentExercise}::${currentInclineLevel}`]?.factor;
    return typeof f === 'number' && isFinite(f) ? f : 1;
  });
  const repCooldownMs = Math.min(4000, Math.max(250, Math.round(baseRepCooldownMs * learnedCooldownFactor)));

  const { motion, isListening } = useMotionContext();

  const handleVoiceRepCounted = useCallback((repNumber: number) => {
    setReps(repNumber);
  }, [setReps]);

  const {
    isListening: isVoiceListening,
    isProcessing: isVoiceProcessing,
    error: voiceError,
    startListening: startVoiceListening,
    stopListening: stopVoiceListening,
  } = useVoiceCounting(handleVoiceRepCounted, isSetActive && repCountingMode === 'voice');

  useEffect(() => {
    loadAdaptiveProfiles();
  }, []);

  // The active step's definition (null during warmup intro / after finish).
  const step = stepIndex >= 0 && stepIndex < routine.steps.length ? routine.steps[stepIndex] : null;

  // Advance after a set has been saved to the workout store.
  const advanceAfterSet = useCallback(() => {
    if (!step) return;
    const newDone = setsDone + 1;
    if (newDone >= step.sets) {
      const next = stepIndex + 1;
      if (next < routine.steps.length) {
        const nextExercise = routine.steps[next].exercise;
        setStepIndex(next);
        setSetsDone(0);
        setExercise(nextExercise);
        // Preload this exercise's last-used incline (user can still change it).
        const preload = preloadInclineFor(nextExercise);
        if (preload != null) setInclineLevel(preload);
      } else {
        // Finished the whole routine.
        const workout = endWorkout({ routineId: routine.id, routineTitle: routine.title });
        onComplete(workout);
      }
    } else {
      setSetsDone(newDone);
    }
  }, [step, setsDone, stepIndex, routine.steps, setExercise, endWorkout, onComplete, preloadInclineFor, setInclineLevel]);

  // Skip the current exercise entirely and move to the next step.
  const skipExercise = useCallback(() => {
    if (!step) return;
    remoteLog('coach_exercise_skipped', { routineId: routine.id, exercise: step.exercise });

    const next = stepIndex + 1;
    if (next < routine.steps.length) {
      const nextExercise = routine.steps[next].exercise;
      setStepIndex(next);
      setSetsDone(0);
      setExercise(nextExercise);
      const preload = preloadInclineFor(nextExercise);
      if (preload != null) setInclineLevel(preload);
    } else {
      const workout = endWorkout({ routineId: routine.id, routineTitle: routine.title });
      onComplete(workout);
    }
  }, [step, stepIndex, routine, setExercise, endWorkout, onComplete, preloadInclineFor, setInclineLevel]);

  // ---- Voice auto start/stop (mirrors Tracker) ----
  useEffect(() => {
    if (repCountingMode === 'voice') {
      if (isSetActive && !isVoiceListening && !showConfirmModal) {
        startVoiceListening();
      } else if ((!isSetActive || showConfirmModal) && isVoiceListening) {
        stopVoiceListening();
      }
    }
  }, [isSetActive, repCountingMode, isVoiceListening, showConfirmModal, startVoiceListening, stopVoiceListening]);

  // ---- Sync adaptive rep count to workout store ----
  useEffect(() => {
    if (repCountingMode === 'motion' && isSetActive && adaptiveSetState === 'SET_ACTIVE') {
      setReps(adaptiveRepCount);
    }
  }, [adaptiveRepCount, repCountingMode, isSetActive, adaptiveSetState, setReps]);

  // ---- Start adaptive set when a set starts ----
  useEffect(() => {
    if (repCountingMode !== 'motion') return;
    if (isSetActive && adaptiveSetState === 'SET_IDLE' && !showConfirmModal) {
      adaptiveStartSet(
        currentExercise,
        currentInclineLevel,
        sensitivityMultiplierMap[motionSensitivity],
        minRepDurationMs,
        repCooldownMs,
        setupDelayMs,
      );
    }
  }, [isSetActive, adaptiveSetState, repCountingMode, currentExercise, currentInclineLevel, adaptiveStartSet, motionSensitivity, minRepDurationMs, repCooldownMs, setupDelayMs, showConfirmModal]);

  // ---- Process motion data ----
  useEffect(() => {
    if (!isSetActive || !isListening || adaptiveSetState !== 'SET_ACTIVE' || repCountingMode !== 'motion') return;
    const { x, y, z } = motion.accelerationIncludingGravity;
    const accelMagnitude = Math.sqrt(x * x + y * y + z * z);
    adaptiveProcessMotion(accelMagnitude);
  }, [motion, isSetActive, isListening, adaptiveSetState, repCountingMode, adaptiveProcessMotion]);

  // ---- "Get into position" countdown ----
  useEffect(() => {
    const isSettingUp = ignoreMotion && adaptiveSetState === 'SET_ACTIVE' && repCountingMode === 'motion';
    if (!isSettingUp) {
      setSetupSecondsLeft(0);
      return;
    }
    const update = () => {
      const remaining = Math.ceil((adaptiveSetStartTime + setupDelayMs - Date.now()) / 1000);
      setSetupSecondsLeft(Math.max(0, remaining));
    };
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [ignoreMotion, adaptiveSetState, repCountingMode, adaptiveSetStartTime, setupDelayMs]);

  // ---- Pre-set "get into position" countdown (both counting modes) ----
  // Ticks once a second; when it reaches 0 the set actually begins. This runs
  // before every set so each exercise gives the same time to get set up.
  useEffect(() => {
    if (getReadyLeft === null) return;
    if (getReadyLeft <= 0) {
      setGetReadyLeft(null);
      startSet();
      return;
    }
    const t = setTimeout(() => {
      setGetReadyLeft(v => (v === null ? null : v - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [getReadyLeft, startSet]);

  // ---- Handle motion auto-end (inactivity) ----
  const autoEndHandled = useRef(false);
  useEffect(() => {
    if (adaptiveSetState === 'SET_ENDED' && isSetActive && repCountingMode === 'motion' && !autoEndHandled.current) {
      autoEndHandled.current = true;
      setPendingSetSummary({ repCount: adaptiveRepCount, needsConfirmation: true });
      setShowConfirmModal(true);
      adaptiveResetToIdle();
    }
    if (!isSetActive) {
      autoEndHandled.current = false;
    }
  }, [adaptiveSetState, isSetActive, repCountingMode, adaptiveRepCount, adaptiveResetToIdle]);

  // ---- End set (manual) ----
  const handleEndSet = useCallback(() => {
    if (repCountingMode === 'motion') {
      const summary = adaptiveEndSet();
      if (summary.repCount >= 0) {
        // Capture TUT (convert ms to seconds)
        setCurrentTUT(summary.totalActiveDuration / 1000);
        setPendingSetSummary(summary);
        setShowConfirmModal(true);
        return;
      }
    } else if (repCountingMode === 'voice') {
      stopVoiceListening();

      if (isVoiceProcessing) {
        console.log('[VOICE] Delaying summary modal until final transcription finishes...');
        setIsWaitingForVoiceToEndSet(true);
      } else {
        setPendingSetSummary({ repCount: currentReps, needsConfirmation: true });
        setShowConfirmModal(true);
      }
      return;
    }
    endSet();
    advanceAfterSet();
  }, [repCountingMode, adaptiveEndSet, endSet, currentReps, stopVoiceListening, advanceAfterSet, isVoiceProcessing]);

  // When we're waiting for the final voice transcription to finish, watch the
  // processing flag. Once it drops to false, we can safely show the summary
  // with the absolute latest count.
  useEffect(() => {
    if (isWaitingForVoiceToEndSet && !isVoiceProcessing) {
      console.log('[VOICE] Final transcription finished, showing summary modal.');
      setIsWaitingForVoiceToEndSet(false);
      setPendingSetSummary({ repCount: currentReps, needsConfirmation: true });
      setShowConfirmModal(true);
    }
  }, [isWaitingForVoiceToEndSet, isVoiceProcessing, currentReps]);

  const handleConfirmReps = useCallback((confirmedCount: number) => {
    setReps(confirmedCount);
    if (repCountingMode === 'motion' && pendingSetSummary && confirmedCount !== pendingSetSummary.repCount) {
      applyUserOverride(currentExercise, currentInclineLevel, confirmedCount);

      // Update TUT proportionally based on the user's correction so the
      // Intensity (seconds per rep) stays consistent.
      if (pendingSetSummary.repCount > 0) {
        const measuredTUT = pendingSetSummary.totalActiveDuration / 1000;
        const adjustedTUT = (measuredTUT / pendingSetSummary.repCount) * confirmedCount;
        setCurrentTUT(adjustedTUT);
      }
    }
    // Record voice auto-count vs. the user's correction so we can measure and
    // keep tuning voice accuracy.
    if (repCountingMode === 'voice' && pendingSetSummary && confirmedCount !== pendingSetSummary.repCount) {
      remoteLog('voice_set_corrected', {
        exercise: currentExercise,
        auto: pendingSetSummary.repCount,
        confirmed: confirmedCount,
      });
    }
    endSet();
    setShowConfirmModal(false);
    setPendingSetSummary(null);
    advanceAfterSet();
  }, [pendingSetSummary, currentExercise, currentInclineLevel, applyUserOverride, setReps, endSet, repCountingMode, advanceAfterSet]);

  const handleDismissModal = useCallback(() => {
    endSet();
    setShowConfirmModal(false);
    setPendingSetSummary(null);
    advanceAfterSet();
  }, [endSet, advanceAfterSet]);

  // Delete & redo: throw this set away (nothing recorded) and stay on the same
  // set so the user can start it over. Used when "End Set" was tapped by mistake.
  const handleRedoSet = useCallback(() => {
    adaptiveResetToIdle();
    cancelSet();
    setShowConfirmModal(false);
    setPendingSetSummary(null);
    // No advanceAfterSet() - setsDone is unchanged, so the same set is next up.
  }, [adaptiveResetToIdle, cancelSet]);

  // Start a set, but first give the user a visible "get into position" countdown.
  const beginSet = useCallback(() => {
    if (getReadySeconds <= 0) {
      startSet();
    } else {
      setGetReadyLeft(getReadySeconds);
    }
  }, [getReadySeconds, startSet]);

  const cancelGetReady = useCallback(() => {
    setGetReadyLeft(null);
  }, []);

  // ---- Begin the routine (from warmup intro) ----
  const beginRoutine = () => {
    startWorkout();
    const first = routine.steps[0].exercise;
    setExercise(first);
    const preload = preloadInclineFor(first);
    if (preload != null) setInclineLevel(preload);
    setStepIndex(0);
    setSetsDone(0);
  };

  const isStabilizing = ignoreMotion && adaptiveSetState === 'SET_ACTIVE' && repCountingMode === 'motion';
  const showLearningIndicator = isLearningROM && adaptiveSetState === 'SET_ACTIVE' && repCountingMode === 'motion';

  // ---- Warmup intro ----
  if (stepIndex < 0) {
    if (showPreview) {
      return <RoutinePreview routine={routine} isLarge={isLarge} onClose={() => setShowPreview(false)} />;
    }
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View className="flex-row items-center px-3 py-2">
          <Pressable onPress={onExit} hitSlop={12} className="active:opacity-60 p-1">
            <ChevronLeft size={isLarge ? 26 : 30} color="#f97316" />
          </Pressable>
          <Text numberOfLines={1} style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${isLarge ? 'text-lg' : 'text-xl'}`}>
            {routine.title}
          </Text>
        </View>

        <View className="flex-1 items-center justify-center px-8">
          <Text className={isLarge ? 'text-5xl' : 'text-6xl'}>🔥</Text>
          <Text style={{ color: theme.text }} className={`font-bold text-center mt-4 ${isLarge ? 'text-2xl' : 'text-3xl'}`}>
            Warmup Complete?
          </Text>
          <Text style={{ color: theme.subText }} className={`text-center mt-3 leading-6 ${isLarge ? 'text-base' : 'text-lg'} opacity-80`}>
            Make sure you've warmed up. When you're ready, we'll guide you through each
            exercise. The app loads the next one automatically once you finish your sets.
          </Text>
          <View className="flex-row items-stretch mt-8 w-full">
            <Pressable
              onPress={() => setShowPreview(true)}
              style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }}
              className="flex-1 mr-2 px-4 py-4 rounded-2xl items-center justify-center active:opacity-60"
            >
              <Text
                numberOfLines={2}
                style={{ color: theme.text }}
                className={`font-semibold text-center ${isLarge ? 'text-base' : 'text-lg'}`}
              >
                Preview{"\n"}Routine
              </Text>
            </Pressable>
            <Pressable
              onPress={beginRoutine}
              className="flex-1 ml-2 bg-orange-500 px-4 py-4 rounded-2xl items-center justify-center active:opacity-80"
            >
              <Text
                numberOfLines={2}
                className={`text-white font-bold text-center ${isLarge ? 'text-base' : 'text-lg'}`}
              >
                Begin{"\n"}Routine
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const totalSteps = routine.steps.length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={onExit} hitSlop={12} className="active:opacity-60 p-1">
          <ChevronLeft size={isLarge ? 26 : 30} color="#f97316" />
        </Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${isLarge ? 'text-base' : 'text-lg'}`}>
          {routine.title}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress dots */}
        <View className="flex-row justify-center mt-1 mb-4">
          {routine.steps.map((_, i) => (
            <View
              key={i}
              className={`h-2 rounded-full mx-1 ${
                i < stepIndex ? 'bg-orange-500 w-6' : i === stepIndex ? 'bg-orange-400 w-8' : (theme.background === '#ffffff' ? 'bg-gray-300 w-6' : 'bg-gray-700 w-6')
              }`}
            />
          ))}
        </View>

        {/* Current exercise card */}
        <View style={{ backgroundColor: theme.card }} className="rounded-2xl p-4 border-2 border-orange-500">
          <View className="flex-row items-center justify-between mb-1">
            <Text style={{ color: theme.subText }} className={isLarge ? 'text-xs' : 'text-sm'}>
              Exercise {stepIndex + 1} of {totalSteps} - {step?.group}
            </Text>
            <Pressable
              onPress={skipExercise}
              style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }}
              className="flex-row items-center px-3 py-1.5 rounded-lg active:opacity-60"
            >
              <FastForward size={14} color={theme.subText} />
              <Text style={{ color: theme.subText }} className="font-bold ml-1.5 text-xs uppercase tracking-wider">Skip</Text>
            </Pressable>
          </View>

          <Text style={{ color: theme.text }} className={`font-bold ${isLarge ? 'text-xl' : 'text-2xl'}`}>
            {step?.exercise}
          </Text>

          {/* Rep-range target + the incline picker (preloaded to your last level
              for this exercise, changeable any time) + Rep Mode Toggle. */}
          <View className="flex-row items-center justify-between mt-3" style={{ zIndex: 50 }}>
            <View className="flex-1 mr-2">
              <Text className={`text-orange-500 font-semibold ${isLarge ? 'text-sm' : 'text-base'}`}>
                {step?.repRangeLabel}
              </Text>
              <Text style={{ color: theme.subText }} className={`mt-2 ${isLarge ? 'text-xs' : 'text-sm'} opacity-70`}>
                Set {Math.min(setsDone + 1, step?.sets ?? 1)} of {step?.sets} {isSetActive ? '- in progress' : ''}
              </Text>
            </View>

            <View className="flex-row items-center">
              <View className="mr-3">
                <RepModeToggle
                  value={repCountingMode === 'voice' ? 'voice' : 'motion'}
                  isLarge={isLarge}
                  onToggle={() => {
                    setRepCountingMode(repCountingMode === 'voice' ? 'motion' : 'voice');
                  }}
                />
              </View>
              <InclineDropdown
                value={currentInclineLevel}
                onSelect={setInclineLevel}
                isOpen={inclineDropdownOpen}
                onToggle={() => setInclineDropdownOpen(o => !o)}
                isLarge={isLarge}
              />
            </View>
          </View>

          {/* Set progress */}
          <View className="flex-row items-center mt-4">
            {step && Array.from({ length: step.sets }).map((_, i) => (
              <View
                key={i}
                className={`flex-1 h-2.5 rounded-full mr-1.5 ${
                  i < setsDone ? 'bg-green-500' : i === setsDone && isSetActive ? 'bg-orange-500' : (theme.background === '#ffffff' ? 'bg-gray-300' : 'bg-gray-700')
                }`}
              />
            ))}
          </View>
        </View>

        {/* Status indicators */}
        {isSetActive && repCountingMode === 'motion' && (
          <View className="mt-3">
            {isStabilizing ? (
              <View className="flex-row items-center justify-center bg-yellow-500/20 rounded-lg py-2 px-4">
                <Loader size={16} color="#eab308" />
                <Text className={`text-yellow-500 ml-2 font-medium ${isLarge ? 'text-sm' : 'text-base'}`}>
                  Get into position{setupSecondsLeft > 0 ? `... ${setupSecondsLeft}s` : '...'}
                </Text>
              </View>
            ) : showLearningIndicator ? (
              <View className="flex-row items-center justify-center bg-blue-500/20 rounded-lg py-2 px-4">
                <Text className={`text-blue-400 font-medium ${isLarge ? 'text-sm' : 'text-base'}`}>
                  Learning your movement pattern...
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/20 rounded-lg py-2 px-4">
                <Text className={`text-green-500 font-medium ${isLarge ? 'text-sm' : 'text-base'}`}>Counting reps</Text>
              </View>
            )}
          </View>
        )}
        {isSetActive && repCountingMode === 'voice' && (
          <View className="mt-3">
            {voiceError ? (
              <View className="flex-row items-center justify-center bg-red-500/20 rounded-lg py-2 px-4">
                <Text numberOfLines={2} className={`text-red-400 font-medium text-center ${isLarge ? 'text-sm' : 'text-base'}`}>
                  {voiceError}
                </Text>
              </View>
            ) : isVoiceProcessing ? (
              <View className="flex-row items-center justify-center bg-blue-500/20 rounded-lg py-2 px-4">
                <Loader size={16} color="#60a5fa" />
                <Text className={`text-blue-400 ml-2 font-medium ${isLarge ? 'text-sm' : 'text-base'}`}>
                  Counting your voice...
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/20 rounded-lg py-2 px-4">
                <Text className={`text-green-500 font-medium ${isLarge ? 'text-sm' : 'text-base'}`}>
                  Listening - count your reps out loud
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Rep counter - doubles as the "get into position" countdown before a set */}
        <View style={{ backgroundColor: theme.card, borderColor: getReadyLeft !== null ? '#eab308' : '#f97316' }} className={`mt-4 border-2 rounded-2xl p-3 items-center justify-center ${isLarge ? 'min-h-[150px]' : 'min-h-[180px]'}`}>
          {getReadyLeft !== null ? (
            <>
              <Text className={`text-yellow-500 tracking-wide font-semibold ${isLarge ? 'text-sm' : 'text-base'}`}>GET INTO POSITION</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit className={`text-yellow-500 font-bold ${isLarge ? 'text-7xl' : 'text-8xl'}`}>
                {getReadyLeft}
              </Text>
              <Text style={{ color: theme.subText }} className={`${isLarge ? 'text-xs' : 'text-sm'} opacity-60`}>Starting soon…</Text>
            </>
          ) : (
            <>
              <Text style={{ color: theme.subText }} className={`tracking-wide ${isLarge ? 'text-sm' : 'text-base'} opacity-70`}>REPS</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit className={`text-orange-500 font-bold ${isLarge ? 'text-7xl' : 'text-8xl'}`}>
                {currentReps}
              </Text>
            </>
          )}
        </View>

        {/* Start / End / Cancel button */}
        <Pressable
          onPress={() => {
            if (isSetActive) handleEndSet();
            else if (getReadyLeft !== null) cancelGetReady();
            else beginSet();
          }}
          style={{ backgroundColor: isSetActive ? '#ef4444' : getReadyLeft !== null ? (theme.background === '#ffffff' ? '#e5e7eb' : '#374151') : '#16a34a' }}
          className={`mt-4 py-5 rounded-2xl items-center active:opacity-80`}
        >
          <Text className={`text-white font-bold ${isLarge ? 'text-xl' : 'text-2xl'}`}>
            {isSetActive
              ? 'END SET'
              : getReadyLeft !== null
                ? 'CANCEL'
                : `START SET ${Math.min(setsDone + 1, step?.sets ?? 1)}`}
          </Text>
        </Pressable>

        <Text style={{ color: theme.subText }} className={`text-center mt-3 ${isLarge ? 'text-xs' : 'text-sm'} opacity-60`}>
          Rest about 60 seconds between sets. The next exercise loads automatically.
        </Text>
      </ScrollView>

      <RepConfirmationModal
        visible={showConfirmModal}
        autoCount={pendingSetSummary?.repCount ?? 0}
        onConfirm={handleConfirmReps}
        onDismiss={handleDismissModal}
        onRedo={handleRedoSet}
        isLarge={isLarge}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Completion - confetti + trophy (plus a Mr. Olympia finale on the 12th)
// ---------------------------------------------------------------------------

function CompleteView({
  completion, isLarge, onNext,
}: {
  completion: CoachCompletion;
  isLarge: boolean;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const tier = medalTierForIndex(completion.index);
  const isFinale = tier === 'olympia';

  // Flashing background for the finale.
  const flash = useSharedValue(0);
  const trophyScale = useSharedValue(0.6);

  useEffect(() => {
    trophyScale.value = withSequence(
      withTiming(1.15, { duration: 350 }),
      withTiming(1, { duration: 250 })
    );
    if (isFinale) {
      flash.value = withRepeat(withTiming(1, { duration: 450 }), -1, true);
    }
  }, []);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.35 }));
  const trophyStyle = useAnimatedStyle(() => ({ transform: [{ scale: trophyScale.value }] }));

  const TierIcon = tier === 'ribbon' ? Ribbon : tier === 'olympia' ? Crown : tier === 'gold' ? Trophy : Medal;
  const tierColor = MEDAL_COLORS[tier];

  const dateLabel = new Date(completion.completedAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      {/* Flashing finale backdrop */}
      {isFinale && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fde047' }, flashStyle]}
        />
      )}

      <View className="flex-1 items-center justify-center px-8">
        <Animated.View style={trophyStyle} className="items-center">
          <View
            className="w-32 h-32 rounded-full items-center justify-center mb-2"
            style={{ backgroundColor: isFinale ? 'rgba(253,224,71,0.18)' : 'rgba(249,115,22,0.15)' }}
          >
            <TierIcon size={isLarge ? 64 : 72} color={tierColor} />
          </View>
        </Animated.View>

        {isFinale ? (
          <>
            <View className="flex-row items-center mt-3">
              <PartyPopper size={isLarge ? 24 : 28} color="#fde047" />
              <Text className={`text-yellow-300 font-bold mx-2 text-center ${isLarge ? 'text-3xl' : 'text-4xl'}`}>
                CHAMPION!
              </Text>
              <PartyPopper size={isLarge ? 24 : 28} color="#fde047" />
            </View>
            <Text style={{ color: theme.text }} className={`font-bold text-center mt-2 ${isLarge ? 'text-xl' : 'text-2xl'}`}>
              You finished the full 4-week program!
            </Text>
            <Text style={{ color: theme.subText }} className={`text-center mt-2 leading-6 ${isLarge ? 'text-base' : 'text-lg'} opacity-90`}>
              That's all 12 sessions. You earned the Mr. Olympia trophy. You are stronger than when you
              started - be proud of the work you put in.
            </Text>
          </>
        ) : (
          <>
            <Text style={{ color: theme.text }} className={`font-bold text-center mt-3 ${isLarge ? 'text-2xl' : 'text-3xl'}`}>
              Routine Complete!
            </Text>
            <Text className={`font-semibold text-center mt-2 ${isLarge ? 'text-lg' : 'text-xl'}`} style={{ color: tierColor }}>
              {MEDAL_LABELS[tier]} earned - Session #{completion.index}
            </Text>
            <Text style={{ color: theme.subText }} className={`text-center mt-2 leading-6 ${isLarge ? 'text-base' : 'text-lg'} opacity-90`}>
              Great work. Your trophy has been added to your shelf. Keep it up - consistency is what builds
              strength.
            </Text>
          </>
        )}

        <Text style={{ color: theme.subText }} className={`text-center mt-4 ${isLarge ? 'text-sm' : 'text-base'} opacity-60`}>
          {dateLabel}
        </Text>

        <Pressable
          onPress={onNext}
          className="mt-8 bg-orange-500 px-12 py-4 rounded-2xl active:opacity-80 flex-row items-center"
        >
          <Text className={`text-white font-bold mr-2 ${isLarge ? 'text-xl' : 'text-2xl'}`}>Next</Text>
          <ChevronRight size={isLarge ? 22 : 26} color="#fff" />
        </Pressable>
      </View>

      {/* Confetti on top */}
      <Confetti active intense={isFinale} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Summary - the full breakdown of the workout just completed.
// ---------------------------------------------------------------------------

function SummaryView({
  workout, completion, isLarge, onDone,
}: {
  workout: Workout;
  completion: CoachCompletion | null;
  isLarge: boolean;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const tier = completion ? medalTierForIndex(completion.index) : 'ribbon';
  const tierColor = MEDAL_COLORS[tier];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-2">
        <Text style={{ color: theme.text }} className={`font-bold flex-1 ${isLarge ? 'text-xl' : 'text-2xl'}`}>
          Workout Summary
        </Text>
        {completion && (
          <Text className={`font-semibold ${isLarge ? 'text-sm' : 'text-base'}`} style={{ color: tierColor }}>
            {MEDAL_LABELS[tier]} - #{completion.index}
          </Text>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <WorkoutSummary workout={workout} isLarge={isLarge} accentColor={tierColor} />
        <Text style={{ color: theme.subText }} className={`text-center mt-4 ${isLarge ? 'text-xs' : 'text-sm'} opacity-60`}>
          Nice work. This summary is saved - you can revisit it any time from the Trophies page.
        </Text>
      </ScrollView>

      <View style={{ borderTopColor: theme.border, paddingBottom: insets.bottom + 12 }} className="px-4 pt-3 border-t">
        <Pressable
          onPress={onDone}
          className="py-4 rounded-xl items-center bg-orange-500 active:opacity-80"
        >
          <Text className={`text-white font-bold ${isLarge ? 'text-lg' : 'text-xl'}`}>View Trophies</Text>
        </Pressable>
      </View>
    </View>
  );
}
