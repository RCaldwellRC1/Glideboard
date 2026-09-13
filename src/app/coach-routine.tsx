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

// --- SUB-COMPONENTS (Defined above main export for stability) ---

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
  const [steps, setSteps] = useState<RoutineStep[]>(routine.steps || []);
  const [showPicker, setShowPicker] = useState(false);

  const customizeRoutine = useCoachStore(s => s.customizeRoutine);
  const resetRoutine = useCoachStore(s => s.resetRoutine);
  const isCustomized = useCoachStore(s => !!s.customizedRoutines?.[routine.id]);

  const customExercises = useWorkoutStore(s => s.customExercises);
  const addCustomExercise = useWorkoutStore(s => s.addCustomExercise);
  const renameCustomExercise = useWorkoutStore(s => s.renameCustomExercise);

  useEffect(() => {
    if (!isEditing) setSteps(routine.steps || []);
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
    const newStep: RoutineStep = { group, exercise, sets: 2, repRangeLabel: '10-15 Reps' };
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
          className="w-10 h-10 items-center justify-center rounded-full ml-2"
        >
          <Pencil size={isLarge ? 20 : 22} color={isEditing ? '#fff' : '#f97316'} />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100 }}>
        {isCustomized && !isEditing && (
          <View style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }} className="flex-row items-center rounded-xl px-4 py-3 mb-4 border">
            <Text className="text-orange-400 font-medium flex-1 text-sm">You have customized this routine.</Text>
            <Pressable onPress={() => resetRoutine(routine.id)} className="flex-row items-center bg-orange-500/20 px-3 py-1.5 rounded-lg">
              <RotateCcw size={14} color="#f97316" /><Text className="text-orange-500 font-bold ml-1.5 text-xs uppercase">Reset</Text>
            </Pressable>
          </View>
        )}
        {steps.map((s, i) => (
          <View key={`${s.exercise}-${i}`} style={{ backgroundColor: theme.card }} className="flex-row items-center rounded-xl px-4 py-3 mb-2">
            <View className="w-8 h-8 rounded-full bg-orange-500/20 items-center justify-center mr-3"><Text className="text-orange-500 font-bold">{i + 1}</Text></View>
            <View className="flex-1"><Text style={{ color: theme.text }} className="font-semibold">{s.exercise}</Text><Text style={{ color: theme.subText }} className="text-xs opacity-70">{s.group} - {s.repRangeLabel}</Text></View>
            {isEditing ? (
              <View className="flex-row items-center">
                <Pressable onPress={() => updateSetCount(i, -1)} className="p-2"><Minus size={16} color="#f97316" /></Pressable>
                <Text style={{ color: theme.text }} className="font-bold px-2">{s.sets}</Text>
                <Pressable onPress={() => updateSetCount(i, 1)} className="p-2"><Plus size={16} color="#f97316" /></Pressable>
                <Pressable onPress={() => removeStep(i)} className="ml-2 p-2"><Trash2 size={18} color="#ef4444" /></Pressable>
              </View>
            ) : <Text className="text-orange-500 font-bold">{s.sets} sets</Text>}
          </View>
        ))}
        {isEditing && (
          <Pressable onPress={() => setShowPicker(true)} style={{ borderColor: theme.divider }} className="mt-2 py-4 rounded-xl items-center border-2 border-dashed">
            <View className="flex-row items-center"><Plus size={18} color="#f97316" /><Text className="text-orange-500 font-bold ml-2">Add Exercise</Text></View>
          </Pressable>
        )}
      </ScrollView>
      <View style={{ borderTopColor: theme.border, paddingBottom: insets.bottom + 12 }} className="px-4 pt-3 border-t">
        <Pressable onPress={isEditing ? handleDoneEditing : onClose} className="py-4 rounded-xl items-center bg-orange-500"><Text className="text-white font-bold">{isEditing ? 'Done Editing' : 'Return'}</Text></Pressable>
      </View>
      <ExercisePickerModal visible={showPicker} onClose={() => setShowPicker(false)} onSelect={addStep} isLarge={isLarge} customExercises={customExercises} onAddCustom={addCustomExercise} onRenameCustom={renameCustomExercise} showCoachRoutines={false} />
    </View>
  );
}

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

  if (showPreview) return <RoutinePreview routine={routine} isLarge={isLarge} onClose={() => setShowPreview(false)} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={onBack} hitSlop={12} className="active:opacity-60 p-1"><ChevronLeft size={isLarge ? 26 : 30} color="#f97316" /></Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className="font-bold ml-1 flex-1 text-xl">{routine.title}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20 }}>
        {isCustomized && (
          <View style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }} className="flex-row items-center rounded-xl px-4 py-3 mb-4 border">
            <Text className="text-orange-400 font-medium flex-1 text-sm">You have customized this routine.</Text>
            <Pressable onPress={() => resetRoutine(routine.id)} className="flex-row items-center bg-orange-500/20 px-3 py-1.5 rounded-lg"><RotateCcw size={14} color="#f97316" /><Text className="text-orange-500 font-bold ml-1.5 text-xs uppercase">Reset</Text></Pressable>
          </View>
        )}
        <Text style={{ color: theme.text }} className="leading-7 opacity-90">{routine.instructions}</Text>
      </ScrollView>
      <View style={{ borderTopColor: theme.border }} className="px-4 pt-3 border-t">
        <Pressable onPress={onToggleDontShow} className="flex-row items-center mb-3">
          <View style={{ backgroundColor: dontShowChecked ? '#f97316' : theme.divider, borderColor: theme.border }} className="w-6 h-6 rounded items-center justify-center mr-2 border">
            {dontShowChecked && <Check size={16} color="#fff" />}
          </View>
          <Text style={{ color: theme.subText }}>Do not show me again</Text>
        </Pressable>
        <View className="flex-row">
          <Pressable onPress={() => setShowPreview(true)} style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className="flex-1 mr-2 py-4 rounded-xl items-center"><Text style={{ color: theme.text }} className="font-semibold">Preview</Text></Pressable>
          <Pressable onPress={onBegin} className="flex-1 ml-2 py-4 rounded-xl items-center bg-orange-500"><Text className="text-white font-bold">Start</Text></Pressable>
        </View>
      </View>
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
  const autoEndHandled = useRef(false);

  const repCountingMode = useSettingsStore(s => s.repCountingMode);
  const setRepCountingMode = useSettingsStore(s => s.setRepCountingMode);
  const motionSensitivity = useSettingsStore(s => s.motionSensitivity);
  const paceSettings = useSettingsStore(s => s.paceSettings);

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
    (stepIndex >= 0 && stepIndex < (routine.steps?.length || 0)) ? routine.steps[stepIndex] : null,
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

  useEffect(() => { loadAdaptiveProfiles(); }, []);

  // Force engine reset when switching exercises AND when starting a set
  useEffect(() => {
    adaptiveResetToIdle();
    autoEndHandled.current = false;
  }, [stepIndex, adaptiveResetToIdle, isSetActive]);

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
      adaptiveStartSet(currentExercise, currentInclineLevel, sensitivityMultiplierMap[motionSensitivity] || 1.0, minRepDurationMs, repCooldownMs, setupDelayMs);
    }
  }, [isSetActive, adaptiveSetState, effectiveMode, currentExercise, currentInclineLevel, adaptiveStartSet, motionSensitivity, minRepDurationMs, repCooldownMs, setupDelayMs, showConfirmModal]);

  useEffect(() => {
    if (!isSetActive || !isListening || adaptiveSetState !== 'SET_ACTIVE' || effectiveMode !== 'motion') return;
    const { x, y, z } = motion.accelerationIncludingGravity;
    adaptiveProcessMotion(Math.sqrt(x * x + y * y + z * z));
  }, [motion, isSetActive, isListening, adaptiveSetState, effectiveMode, adaptiveProcessMotion]);

  useEffect(() => {
    if (getReadyLeft === null) return;
    if (getReadyLeft <= 0) {
      setGetReadyLeft(null);
      startSet();
      return;
    }
    const t = setTimeout(() => { setGetReadyLeft(v => (v === null ? null : v - 1)); }, 1000);
    return () => clearTimeout(t);
  }, [getReadyLeft, startSet]);

  useEffect(() => {
    if (adaptiveSetState === 'SET_ENDED' && isSetActive && effectiveMode === 'motion' && !autoEndHandled.current) {
      autoEndHandled.current = true;
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
      if (isVoiceProcessing) setIsWaitingForVoiceToEndSet(true);
      else {
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
        const adjustedTUT = (pendingSetSummary.totalActiveDuration / pendingSetSummary.repCount) * confirmedCount;
        setCurrentTUT(adjustedTUT / 1000);
      }
    }
    endSet();
    setShowConfirmModal(false);
    setPendingSetSummary(null);
    advanceAfterSet();
  }, [pendingSetSummary, currentExercise, currentInclineLevel, applyUserOverride, setReps, endSet, repCountingMode, advanceAfterSet, setCurrentTUT]);

  const beginSet = useCallback(() => {
    if (isTimed) startSet();
    else if (getReadySeconds <= 0) startSet();
    else setGetReadyLeft(getReadySeconds);
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
          <Text numberOfLines={1} style={{ color: theme.text }} className="font-bold ml-1 flex-1 text-xl">{routine.title}</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: theme.text }} className="font-bold text-center mt-4 text-2xl">Warmup Complete?</Text>
          <Text style={{ color: theme.subText }} className="text-center mt-3 opacity-80">Make sure you have warmed up. When you are ready, we will guide you through each exercise.</Text>
          <View className="flex-row items-stretch mt-8 w-full">
            <Pressable onPress={() => setShowPreview(true)} style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className="flex-1 mr-2 px-4 py-4 rounded-2xl items-center"><Text style={{ color: theme.text }}>Preview</Text></Pressable>
            <Pressable onPress={beginRoutine} className="flex-1 ml-2 bg-orange-500 px-4 py-4 rounded-2xl items-center"><Text className="text-white font-bold">Begin</Text></Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={onExit} hitSlop={12} className="active:opacity-60 p-1"><ChevronLeft size={isLarge ? 26 : 30} color="#f97316" /></Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className="font-bold ml-1 flex-1 text-lg">{routine.title}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <View className="flex-row justify-center mt-1 mb-4">
          {routine.steps.map((_, i) => <View key={i} className={`h-2 rounded-full mx-1 ${i < stepIndex ? 'bg-orange-500 w-6' : i === stepIndex ? 'bg-orange-400 w-8' : 'bg-gray-700 w-6'}`} />)}
        </View>
        <View style={{ backgroundColor: theme.card }} className="rounded-2xl p-4 border-2 border-orange-500">
          <View className="flex-row items-center justify-between mb-1">
            <Text style={{ color: theme.subText }} className="text-xs">Exercise {stepIndex + 1} of {routine.steps.length}</Text>
            <Pressable onPress={skipExercise} className="bg-gray-700 px-3 py-1.5 rounded-lg"><Text style={{ color: theme.subText }} className="text-xs">Skip</Text></Pressable>
          </View>
          <Text style={{ color: theme.text }} className="font-bold text-xl">{step?.exercise}</Text>
          <View className="flex-row items-center justify-between mt-3">
            <View className="flex-1 mr-2"><Text className="text-orange-500 font-semibold">{step?.repRangeLabel}</Text><Text style={{ color: theme.subText }} className="text-xs">Set {Math.min(setsDone + 1, step?.sets ?? 1)} of {step?.sets}</Text></View>
            <View className="flex-row items-center">
              <RepModeToggle value={effectiveMode === 'voice' ? 'voice' : 'motion'} isLarge={isLarge} disabled={isTimed} onToggle={() => { if (!isTimed) setRepCountingMode(repCountingMode === 'voice' ? 'motion' : 'voice'); }} />
              <InclineDropdown value={currentInclineLevel} onSelect={setInclineLevel} isOpen={inclineDropdownOpen} onToggle={() => setInclineDropdownOpen(o => !o)} isLarge={isLarge} />
            </View>
          </View>
        </View>
        {isSetActive && !isTimed && effectiveMode === 'motion' && (
          <View className="mt-3 bg-yellow-500/10 p-2 rounded-lg items-center"><Text className="text-yellow-500 font-medium">{isStabilizing ? 'Get into position...' : showLearningIndicator ? 'Learning movement...' : 'Counting reps'}</Text></View>
        )}
        <View style={{ backgroundColor: theme.card, borderColor: getReadyLeft !== null ? '#eab308' : '#f97316' }} className="mt-4 border-2 rounded-2xl p-3 items-center justify-center min-h-[160px]">
          {isTimed ? (
            <TimedExerciseRunner ref={timedRunnerRef} exercise={step?.exercise ?? ''} durationSeconds={30} isSetActive={isSetActive} isLarge={isLarge} onSetDuration={() => {}} onFinalized={(h) => { setReps(0); setCurrentTUT(h); handleConfirmReps(0); }} />
          ) : getReadyLeft !== null ? (
            <><Text className="text-yellow-500 font-bold">GET READY</Text><Text className="text-yellow-500 font-bold text-7xl">{getReadyLeft}</Text></>
          ) : (
            <><Text style={{ color: theme.subText }}>REPS</Text><Text className="text-orange-500 font-bold text-7xl">{currentReps}</Text></>
          )}
        </View>
        <Pressable onPress={() => { if (isSetActive) handleEndSet(); else if (getReadyLeft !== null) setGetReadyLeft(null); else beginSet(); }} style={{ backgroundColor: isSetActive ? '#ef4444' : getReadyLeft !== null ? '#374151' : '#16a34a' }} className="mt-4 py-5 rounded-2xl items-center"><Text className="text-white font-bold text-xl">{isSetActive ? 'END SET' : getReadyLeft !== null ? 'CANCEL' : 'START SET'}</Text></Pressable>
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
  }, [isFinale, trophyScale, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value * 0.35 }));
  const trophyStyle = useAnimatedStyle(() => ({ transform: [{ scale: trophyScale.value }] }));
  const TierIcon = tier === 'ribbon' ? Ribbon : tier === 'olympia' ? Crown : tier === 'gold' ? Trophy : Medal;
  const tierColor = MEDAL_COLORS[tier];
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      {isFinale && <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fde047' }, flashStyle]} />}
      <View className="flex-1 items-center justify-center px-8">
        <Animated.View style={trophyStyle} className="items-center"><View className="w-32 h-32 rounded-full items-center justify-center mb-2" style={{ backgroundColor: 'rgba(249,115,22,0.15)' }}><TierIcon size={72} color={tierColor} /></View></Animated.View>
        <Text style={{ color: theme.text }} className="font-bold text-center mt-3 text-2xl">Routine Complete!</Text>
        <Text className="font-semibold text-center mt-2 text-lg" style={{ color: tierColor }}>{MEDAL_LABELS[tier]} earned</Text>
        <Pressable onPress={onNext} className="mt-8 bg-orange-500 px-12 py-4 rounded-2xl items-center"><Text className="text-white font-bold text-xl">Next</Text></Pressable>
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
      <View className="px-4 py-2"><Text style={{ color: theme.text }} className="font-bold text-xl">Workout Summary</Text></View>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}><WorkoutSummary workout={workout} isLarge={isLarge} accentColor={tierColor} /></ScrollView>
      <View style={{ borderTopColor: theme.border, paddingBottom: 12 }} className="px-4 pt-3 border-t"><Pressable onPress={onDone} className="py-4 rounded-xl items-center bg-orange-500"><Text className="text-white font-bold text-lg">View Trophies</Text></Pressable></View>
    </View>
  );
}
