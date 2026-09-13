import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
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
  ChevronLeft, ChevronRight, Check, Loader, Trophy, Medal, Ribbon, Crown, PartyPopper, Pencil, Minus, Plus, Trash2, RotateCcw, FastForward, Sparkles, TriangleAlert, Mic
} from 'lucide-react-native';
import { getRoutine, useCoachStore, medalTierForIndex, MEDAL_LABELS, MEDAL_COLORS, type CoachCompletion, type CoachRoutine, type RoutineStep } from '@/lib/coach';
import { useWorkoutStore, type Workout, EXERCISE_GROUPS } from '@/lib/workout';
import { getExerciseCategory } from '@/lib/workout/categories';
import { useSettingsStore, useTextScaleSubscription, useTheme } from '@/lib/settings';
import { useAdaptiveRepStore, useMotionContext } from '@/lib/motion';
import { useVoiceCounting } from '@/lib/voice';
import { RepConfirmationModal } from '@/components/RepConfirmationModal';
import { InclineDropdown } from '@/components/InclineDropdown';
import { TimedExerciseRunner, type TimedRunnerHandle } from '@/components/TimedExerciseRunner';
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

  // Use individual selectors for stability
  const customRoutines = useCoachStore(s => s.customRoutines);
  const customizedRoutines = useCoachStore(s => s.customizedRoutines);
  const dontShowInstructions = useCoachStore(s => s.dontShowInstructions);
  const setDontShowInstructions = useCoachStore(s => s.setDontShowInstructions);
  const recordCompletion = useCoachStore(s => s.recordCompletion);
  const loadCoach = useCoachStore(s => s.loadFromStorage);
  const coachLoaded = useCoachStore(s => s.isLoaded);

  const routine = useMemo(() => {
    const base = getRoutine(routineId) ?? customRoutines.find(r => r.id === routineId);
    return customizedRoutines[routineId] ?? base;
  }, [routineId, customRoutines, customizedRoutines]);

  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription();
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  const [phase, setPhase] = useState<Phase>('instructions');
  const [dontShowChecked, setDontShowChecked] = useState(false);
  const [completion, setCompletion] = useState<CoachCompletion | null>(null);
  const [completedWorkout, setCompletedWorkout] = useState<Workout | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    loadSettings();
    loadCoach();
  }, []);

  useEffect(() => {
    if (!coachLoaded || initializedRef.current) return;
    initializedRef.current = true;
    if (dontShowInstructions[routineId]) {
      setPhase('running');
    }
  }, [coachLoaded, routineId, dontShowInstructions]);

  if (!routine) {
    if (!coachLoaded) return <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }} />;
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }} className="items-center justify-center">
        <Text style={{ color: theme.text }} className="text-lg">Routine not found.</Text>
        <Pressable onPress={() => router.back()} className="mt-4 px-5 py-3 bg-orange-500 rounded-xl">
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const startRunning = () => {
    if (dontShowChecked) setDontShowInstructions(routineId, true);
    remoteLog('coach_routine_started', { routineId });
    setPhase('running');
  };

  const handleComplete = (workout: Workout | null) => {
    const entry = recordCompletion(routineId, workout?.id);
    remoteLog('coach_routine_completed', { routineId, index: entry.index });
    setCompletion(entry);
    setCompletedWorkout(workout);
    setPhase('complete');
  };

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
          onComplete={handleComplete}
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

function RunnerView({
  routine, isLarge, onExit, onComplete,
}: {
  routine: CoachRoutine;
  isLarge: boolean;
  onExit: () => void;
  onComplete: (workout: Workout | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const [stepIndex, setStepIndex] = useState(-1);
  const [setsDone, setSetsDone] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSetSummary, setPendingSetSummary] = useState<{ repCount: number; totalActiveDuration: number; needsConfirmation: boolean } | null>(null);
  const [isWaitingForVoiceToEndSet, setIsWaitingForVoiceToEndSet] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const timedRunnerRef = useRef<TimedRunnerHandle>(null);
  const [getReadyLeft, setGetReadyLeft] = useState<number | null>(null);

  const repCountingMode = useSettingsStore(s => s.repCountingMode);
  const setRepCountingMode = useSettingsStore(s => s.setRepCountingMode);
  const motionSensitivity = useSettingsStore(s => s.motionSensitivity);
  const paceSettings = useSettingsStore(s => s.paceSettings);

  const isWorkoutActive = useWorkoutStore(s => s.isWorkoutActive);
  const isSetActive = useWorkoutStore(s => s.isSetActive);
  const currentExercise = useWorkoutStore(s => s.currentExercise);
  const currentInclineLevel = useWorkoutStore(s => s.currentInclineLevel);
  const currentReps = useWorkoutStore(s => s.currentReps);
  const currentSet = useWorkoutStore(s => s.currentSet);
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
  const customExercises = useWorkoutStore(s => s.customExercises);

  const [inclineDropdownOpen, setInclineDropdownOpen] = useState(false);

  const sensitivityMultiplierMap = { low: 1.5, medium: 1.0, high: 0.6 } as const;
  const jitterFloorMsMap = { low: 140, medium: 100, high: 70 } as const;
  const cooldownFloorMsMap = { low: 1000, medium: 700, high: 450 } as const;
  const expectedRepMs = (paceSettings.liftTime + paceSettings.holdTime + paceSettings.downTime) * 1000;
  const minRepDurationMs = jitterFloorMsMap[motionSensitivity] || 100;
  const baseRepCooldownMs = Math.max(cooldownFloorMsMap[motionSensitivity] || 700, Math.round(expectedRepMs * 0.85));
  const getReadySeconds = Math.max(0, Math.round(paceSettings.delayToStart));
  const setupDelayMs = 900;

  const preloadInclineFor = useCallback((exercise: string): number | null => {
    const matches = (exerciseHistory || []).filter(h => h.exercise === exercise);
    if (matches.length === 0) return null;
    const latest = matches.reduce((a, b) =>
      new Date(b.lastDate).getTime() > new Date(a.lastDate).getTime() ? b : a
    );
    return latest.inclineLevel;
  }, [exerciseHistory]);

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

  const step = useMemo(() =>
    (stepIndex >= 0 && stepIndex < routine.steps.length) ? routine.steps[stepIndex] : null,
  [stepIndex, routine.steps]);

  const category = useMemo(() =>
    step ? getExerciseCategory(step.exercise, customExercises || {}) : 'standard',
  [step, customExercises]);

  const isTimed = category === 'timed';
  const effectiveMode = isTimed ? 'timed' : (category === 'freestyle' ? 'voice' : repCountingMode);

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
  } = useVoiceCounting(handleVoiceRepCounted, isSetActive && effectiveMode === 'voice');

  useEffect(() => {
    loadAdaptiveProfiles();
  }, []);

  useEffect(() => {
    adaptiveResetToIdle();
  }, [stepIndex, adaptiveResetToIdle]);

  const advanceAfterSet = useCallback(() => {
    if (!step) return;
    const newDone = setsDone + 1;
    adaptiveResetToIdle();

    if (newDone >= step.sets) {
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
    } else {
      setSetsDone(newDone);
    }
  }, [step, setsDone, stepIndex, routine.steps, setExercise, endWorkout, onComplete, preloadInclineFor, setInclineLevel, adaptiveResetToIdle]);

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

  useEffect(() => {
    if (effectiveMode === 'voice') {
      if (isSetActive && !isVoiceListening && !showConfirmModal) {
        startVoiceListening();
      } else if ((!isSetActive || showConfirmModal) && isVoiceListening) {
        stopVoiceListening();
      }
    }
  }, [isSetActive, effectiveMode, isVoiceListening, showConfirmModal, startVoiceListening, stopVoiceListening]);

  useEffect(() => {
    if (effectiveMode === 'motion' && isSetActive && adaptiveSetState === 'SET_ACTIVE') {
      setReps(adaptiveRepCount);
    }
  }, [adaptiveRepCount, effectiveMode, isSetActive, adaptiveSetState, setReps]);

  useEffect(() => {
    if (effectiveMode !== 'motion') return;
    if (isSetActive && adaptiveSetState === 'SET_IDLE' && !showConfirmModal) {
      adaptiveStartSet(
        currentExercise,
        currentInclineLevel,
        sensitivityMultiplierMap[motionSensitivity] || 1.0,
        minRepDurationMs,
        repCooldownMs,
        setupDelayMs,
      );
    }
  }, [isSetActive, adaptiveSetState, effectiveMode, currentExercise, currentInclineLevel, adaptiveStartSet, motionSensitivity, minRepDurationMs, repCooldownMs, setupDelayMs, showConfirmModal]);

  useEffect(() => {
    if (!isSetActive || !isListening || adaptiveSetState !== 'SET_ACTIVE' || effectiveMode !== 'motion') return;
    const { x, y, z } = motion.accelerationIncludingGravity;
    const accelMagnitude = Math.sqrt(x * x + y * y + z * z);
    adaptiveProcessMotion(accelMagnitude);
  }, [motion, isSetActive, isListening, adaptiveSetState, effectiveMode, adaptiveProcessMotion]);

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

  useEffect(() => {
    if (adaptiveSetState === 'SET_ENDED' && isSetActive && effectiveMode === 'motion') {
      setPendingSetSummary({ repCount: adaptiveRepCount, totalActiveDuration: 0, needsConfirmation: true });
      setShowConfirmModal(true);
      adaptiveResetToIdle();
    }
  }, [adaptiveSetState, isSetActive, effectiveMode, adaptiveRepCount, adaptiveResetToIdle]);

  const handleEndSet = useCallback(() => {
    if (effectiveMode === 'motion') {
      const summary = adaptiveEndSet();
      if (summary && summary.repCount >= 0) {
        setCurrentTUT(summary.totalActiveDuration / 1000);
        setPendingSetSummary(summary);
        setShowConfirmModal(true);
        return;
      }
    } else if (effectiveMode === 'voice') {
      stopVoiceListening();
      if (isVoiceProcessing) {
        setIsWaitingForVoiceToEndSet(true);
      } else {
        setPendingSetSummary({ repCount: currentReps, totalActiveDuration: 0, needsConfirmation: true });
        setShowConfirmModal(true);
      }
      return;
    } else if (effectiveMode === 'timed') {
      timedRunnerRef.current?.finalize();
      return;
    }
    endSet();
    advanceAfterSet();
  }, [effectiveMode, adaptiveEndSet, endSet, currentReps, stopVoiceListening, advanceAfterSet, isVoiceProcessing, setCurrentTUT]);

  useEffect(() => {
    if (isWaitingForVoiceToEndSet && !isVoiceProcessing) {
      setIsWaitingForVoiceToEndSet(false);
      setPendingSetSummary({ repCount: currentReps, totalActiveDuration: 0, needsConfirmation: true });
      setShowConfirmModal(true);
    }
  }, [isWaitingForVoiceToEndSet, isVoiceProcessing, currentReps]);

  const handleConfirmReps = useCallback((confirmedCount: number) => {
    setReps(confirmedCount);
    if (repCountingMode === 'motion' && pendingSetSummary && confirmedCount !== pendingSetSummary.repCount) {
      applyUserOverride(currentExercise, currentInclineLevel, confirmedCount);
      if (pendingSetSummary.repCount > 0) {
        const measuredTUT = pendingSetSummary.totalActiveDuration / 1000;
        const adjustedTUT = (measuredTUT / pendingSetSummary.repCount) * confirmedCount;
        setCurrentTUT(adjustedTUT);
      }
    }
    if (repCountingMode === 'voice' && pendingSetSummary && confirmedCount !== pendingSetSummary.repCount) {
      remoteLog('voice_set_corrected', { exercise: currentExercise, auto: pendingSetSummary.repCount, confirmed: confirmedCount });
    }
    endSet();
    setShowConfirmModal(false);
    setPendingSetSummary(null);
    advanceAfterSet();
  }, [pendingSetSummary, currentExercise, currentInclineLevel, applyUserOverride, setReps, endSet, repCountingMode, advanceAfterSet, setCurrentTUT]);

  const beginSet = useCallback(() => {
    if (isTimed) {
      startSet();
    } else if (getReadySeconds <= 0) {
      startSet();
    } else {
      setGetReadyLeft(getReadySeconds);
    }
  }, [isTimed, getReadySeconds, startSet]);

  const beginRoutine = () => {
    startWorkout();
    const first = routine.steps[0].exercise;
    setExercise(first);
    const preload = preloadInclineFor(first);
    if (preload != null) setInclineLevel(preload);
    setStepIndex(0);
    setSetsDone(0);
  };

  const isStabilizing = ignoreMotion && adaptiveSetState === 'SET_ACTIVE' && effectiveMode === 'motion';
  const showLearningIndicator = isLearningROM && adaptiveSetState === 'SET_ACTIVE' && effectiveMode === 'motion';

  if (stepIndex < 0) {
    if (showPreview) return <RoutinePreview routine={routine} isLarge={isLarge} onClose={() => setShowPreview(false)} />;
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View className="flex-row items-center px-3 py-2">
          <Pressable onPress={onExit} hitSlop={12} className="active:opacity-60 p-1"><ChevronLeft size={isLarge ? 26 : 30} color="#f97316" /></Pressable>
          <Text numberOfLines={1} style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${isLarge ? 'text-lg' : 'text-xl'}`}>{routine.title}</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: theme.text }} className={`font-bold text-center mt-4 ${isLarge ? 'text-2xl' : 'text-3xl'}`}>Warmup Complete?</Text>
          <Text style={{ color: theme.subText }} className={`text-center mt-3 leading-6 ${isLarge ? 'text-base' : 'text-lg'} opacity-80`}>
            Make sure you've warmed up. When you're ready, we'll guide you through each exercise.
          </Text>
          <View className="flex-row items-stretch mt-8 w-full">
            <Pressable onPress={() => setShowPreview(true)} style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className="flex-1 mr-2 px-4 py-4 rounded-2xl items-center justify-center active:opacity-60">
              <Text numberOfLines={2} style={{ color: theme.text }} className={`font-semibold text-center ${isLarge ? 'text-base' : 'text-lg'}`}>Preview Routine</Text>
            </Pressable>
            <Pressable onPress={beginRoutine} className="flex-1 ml-2 bg-orange-500 px-4 py-4 rounded-2xl items-center justify-center active:opacity-80">
              <Text numberOfLines={2} className={`text-white font-bold text-center ${isLarge ? 'text-base' : 'text-lg'}`}>Begin Routine</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={onExit} hitSlop={12} className="active:opacity-60 p-1"><ChevronLeft size={isLarge ? 26 : 30} color="#f97316" /></Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${isLarge ? 'text-base' : 'text-lg'}`}>{routine.title}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row justify-center mt-1 mb-4">
          {routine.steps.map((_, i) => (
            <View key={i} className={`h-2 rounded-full mx-1 ${i < stepIndex ? 'bg-orange-500 w-6' : i === stepIndex ? 'bg-orange-400 w-8' : (theme.background === '#ffffff' ? 'bg-gray-300 w-6' : 'bg-gray-700 w-6')}`} />
          ))}
        </View>

        <View style={{ backgroundColor: theme.card }} className="rounded-2xl p-4 border-2 border-orange-500">
          <View className="flex-row items-center justify-between mb-1">
            <Text style={{ color: theme.subText }} className={isLarge ? 'text-xs' : 'text-sm'}>Exercise {stepIndex + 1} of {routine.steps.length} - {step?.group}</Text>
            <Pressable onPress={skipExercise} style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className="flex-row items-center px-3 py-1.5 rounded-lg active:opacity-60">
              <FastForward size={14} color={theme.subText} /><Text style={{ color: theme.subText }} className="font-bold ml-1.5 text-xs uppercase tracking-wider">Skip</Text>
            </Pressable>
          </View>
          <Text style={{ color: theme.text }} className={`font-bold ${isLarge ? 'text-xl' : 'text-2xl'}`}>{step?.exercise}</Text>
          <View className="flex-row items-center justify-between mt-3" style={{ zIndex: 50 }}>
            <View className="flex-1 mr-2">
              <Text className="text-orange-500 font-semibold">{step?.repRangeLabel}</Text>
              <Text style={{ color: theme.subText }} className="mt-2 opacity-70">Set {Math.min(setsDone + 1, step?.sets ?? 1)} of {step?.sets}</Text>
            </View>
            <View className="flex-row items-center">
              <View className="mr-3">
                <RepModeToggle value={effectiveMode === 'voice' ? 'voice' : 'motion'} isLarge={isLarge} labelOverride={isTimed ? 'TIMED' : undefined} disabled={isTimed} onToggle={() => { if (!isTimed) setRepCountingMode(repCountingMode === 'voice' ? 'motion' : 'voice'); }} />
              </View>
              <InclineDropdown value={currentInclineLevel} onSelect={setInclineLevel} isOpen={inclineDropdownOpen} onToggle={() => setInclineDropdownOpen(o => !o)} isLarge={isLarge} />
            </View>
          </View>
          <View className="flex-row items-center mt-4">
            {step && Array.from({ length: step.sets }).map((_, i) => (
              <View key={i} className={`flex-1 h-2.5 rounded-full mr-1.5 ${i < setsDone ? 'bg-green-500' : i === setsDone && isSetActive ? 'bg-orange-500' : (theme.background === '#ffffff' ? 'bg-gray-300' : 'bg-gray-700')}`} />
            ))}
          </View>
        </View>

        {isSetActive && !isTimed && effectiveMode === 'motion' && (
          <View className="mt-3">
            {isStabilizing ? (
              <View className="flex-row items-center justify-center bg-yellow-500/20 rounded-lg py-2 px-4"><Loader size={16} color="#eab308" /><Text className="text-yellow-500 ml-2 font-medium">Get into position...</Text></View>
            ) : showLearningIndicator ? (
              <View className="flex-row items-center justify-center bg-blue-500/20 rounded-lg py-2 px-4"><Text className="text-blue-400 font-medium">Learning movement...</Text></View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/20 rounded-lg py-2 px-4"><Text className="text-green-500 font-medium">Counting reps</Text></View>
            )}
          </View>
        )}
        {isSetActive && !isTimed && effectiveMode === 'voice' && (
          <View className="mt-3">
            {voiceError ? (
              <View className="flex-row items-center justify-center bg-red-500/20 rounded-lg py-2 px-4"><Text numberOfLines={2} className="text-red-400 font-medium text-center">{voiceError}</Text></View>
            ) : isVoiceProcessing ? (
              <View className="flex-row items-center justify-center bg-blue-500/20 rounded-lg py-2 px-4"><Loader size={16} color="#60a5fa" /><Text className="text-blue-400 ml-2 font-medium">Counting voice...</Text></View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/20 rounded-lg py-2 px-4"><Text className="text-green-500 font-medium">Listening...</Text></View>
            )}
          </View>
        )}

        <View style={{ backgroundColor: theme.card, borderColor: getReadyLeft !== null ? '#eab308' : '#f97316' }} className={`mt-4 border-2 rounded-2xl p-3 items-center justify-center ${isLarge ? 'min-h-[150px]' : 'min-h-[180px]'}`}>
          {isTimed ? (
            <TimedExerciseRunner ref={timedRunnerRef} exercise={step?.exercise ?? ''} durationSeconds={30} isSetActive={isSetActive} isLarge={isLarge} onSetDuration={() => {}} onFinalized={(h) => { setReps(0); setCurrentTUT(h); handleConfirmReps(0); }} />
          ) : getReadyLeft !== null ? (
            <><Text className="text-yellow-500 tracking-wide font-semibold">GET INTO POSITION</Text><Text numberOfLines={1} adjustsFontSizeToFit className="text-yellow-500 font-bold text-7xl">{getReadyLeft}</Text><Text style={{ color: theme.subText }} className="opacity-60">Starting soon...</Text></>
          ) : (
            <><Text style={{ color: theme.subText }} className="tracking-wide opacity-70">REPS</Text><Text numberOfLines={1} adjustsFontSizeToFit className="text-orange-500 font-bold text-7xl">{currentReps}</Text></>
          )}
        </View>

        <Pressable onPress={() => { if (isSetActive) handleEndSet(); else if (getReadyLeft !== null) setGetReadyLeft(null); else beginSet(); }} style={{ backgroundColor: isSetActive ? '#ef4444' : getReadyLeft !== null ? '#374151' : '#16a34a' }} className="mt-4 py-5 rounded-2xl items-center active:opacity-80">
          <Text className="text-white font-bold text-xl">{isSetActive ? 'END SET' : getReadyLeft !== null ? 'CANCEL' : `START SET ${Math.min(setsDone + 1, step?.sets ?? 1)}`}</Text>
        </Pressable>
      </ScrollView>

      <RepConfirmationModal visible={showConfirmModal} autoCount={pendingSetSummary?.repCount ?? 0} onConfirm={handleConfirmReps} onDismiss={() => { endSet(); setShowConfirmModal(false); setPendingSetSummary(null); advanceAfterSet(); }} onRedo={handleRedoSet} isLarge={isLarge} />
    </View>
  );
}

function CompleteView({ completion, isLarge, onNext }: { completion: CoachCompletion; isLarge: boolean; onNext: () => void; }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const tier = medalTierForIndex(completion.index);
  const isFinale = tier === 'olympia';
  const flash = useSharedValue(0);
  const trophyScale = useSharedValue(0.6);

  useEffect(() => {
    trophyScale.value = withSequence(withTiming(1.15, { duration: 350 }), withTiming(1, { duration: 250 }));
    if (isFinale) flash.value = withRepeat(withTiming(1, { duration: 450 }), -1, true);
  }, []);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.35 }));
  const trophyStyle = useAnimatedStyle(() => ({ transform: [{ scale: trophyScale.value }] }));
  const TierIcon = tier === 'ribbon' ? Ribbon : tier === 'olympia' ? Crown : tier === 'gold' ? Trophy : Medal;
  const tierColor = MEDAL_COLORS[tier];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      {isFinale && <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fde047' }, flashStyle]} />}
      <View className="flex-1 items-center justify-center px-8">
        <Animated.View style={trophyStyle} className="items-center">
          <View className="w-32 h-32 rounded-full items-center justify-center mb-2" style={{ backgroundColor: isFinale ? 'rgba(253,224,71,0.18)' : 'rgba(249,115,22,0.15)' }}>
            <TierIcon size={isLarge ? 64 : 72} color={tierColor} />
          </View>
        </Animated.View>
        <Text style={{ color: theme.text }} className="font-bold text-center mt-3 text-2xl">Routine Complete!</Text>
        <Text className="font-semibold text-center mt-2 text-lg" style={{ color: tierColor }}>{MEDAL_LABELS[tier]} earned</Text>
        <Pressable onPress={onNext} className="mt-8 bg-orange-500 px-12 py-4 rounded-2xl active:opacity-80 flex-row items-center">
          <Text className="text-white font-bold mr-2 text-xl">Next</Text><ChevronRight size={22} color="#fff" />
        </Pressable>
      </View>
      <Confetti active intense={isFinale} />
    </View>
  );
}

function SummaryView({ workout, completion, isLarge, onDone }: { workout: Workout; completion: CoachCompletion | null; isLarge: boolean; onDone: () => void; }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const tierColor = completion ? MEDAL_COLORS[medalTierForIndex(completion.index)] : '#f97316';

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-2">
        <Text style={{ color: theme.text }} className="font-bold flex-1 text-xl">Workout Summary</Text>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <WorkoutSummary workout={workout} isLarge={isLarge} accentColor={tierColor} />
      </ScrollView>
      <View style={{ borderTopColor: theme.border, paddingBottom: insets.bottom + 12 }} className="px-4 pt-3 border-t">
        <Pressable onPress={onDone} className="py-4 rounded-xl items-center bg-orange-500 active:opacity-80">
          <Text className="text-white font-bold text-lg">View Trophies</Text>
        </Pressable>
      </View>
    </View>
  );
}
