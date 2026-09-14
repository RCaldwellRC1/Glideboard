import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Check, Loader, Trophy, Medal, Ribbon, Crown, PartyPopper, Pencil, Minus, Plus, Trash2, RotateCcw, FastForward, Sparkles, TriangleAlert, Mic } from 'lucide-react-native';

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
import { WorkoutSummary } from '@/components/WorkoutSummary';
import { Confetti } from '@/components/Confetti';
import { remoteLog } from '@/lib/remoteLog';

type Phase = 'instructions' | 'running' | 'complete' | 'summary';

// --- SUB-COMPONENTS (Defined outside main export for stability) ---

function RoutinePreviewInternal({
  routine, isLarge, onClose, customExercises, addCustomExercise, renameCustomExercise,
}: {
  routine: CoachRoutine;
  isLarge: boolean;
  onClose: () => void;
  customExercises: any;
  addCustomExercise: any;
  renameCustomExercise: any;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [steps, setSteps] = useState<RoutineStep[]>(routine.steps || []);
  const [showPicker, setShowPicker] = useState(false);

  const customizeRoutine = useCoachStore(s => s.customizeRoutine);
  const resetRoutine = useCoachStore(s => s.resetRoutine);
  const isCustomized = useCoachStore(s => !!s.customizedRoutines?.[routine.id]);

  useEffect(() => {
    if (!isEditing) setSteps(routine.steps || []);
  }, [routine.steps, isEditing]);

  const updateSetCount = (index: number, delta: number) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], sets: Math.max(1, newSteps[index].sets + delta) };
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
        <Pressable onPress={onClose} hitSlop={12} className="active:opacity-60 p-1"><ChevronLeft size={isLarge ? 26 : 30} color="#f97316" /></Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className={`font-bold ml-1 flex-1 ${isLarge ? 'text-lg' : 'text-xl'}`}>Preview - {routine.title}</Text>
        <Pressable onPress={() => setIsEditing(!isEditing)} style={{ backgroundColor: isEditing ? '#f97316' : theme.divider }} className="w-10 h-10 items-center justify-center rounded-full ml-2">
          <Pencil size={isLarge ? 20 : 22} color={isEditing ? '#fff' : '#f97316'} />
        </Pressable>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100 }}>
        {isCustomized && !isEditing && (
          <View style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }} className="flex-row items-center rounded-xl px-4 py-3 mb-4 border">
            <Text className="text-orange-400 font-medium flex-1 text-sm">You have customized this routine.</Text>
            <Pressable onPress={() => resetRoutine(routine.id)} className="flex-row items-center bg-orange-500/20 px-3 py-1.5 rounded-lg"><RotateCcw size={14} color="#f97316" /><Text className="text-orange-500 font-bold ml-1.5 text-xs uppercase">Reset</Text></Pressable>
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

function InstructionsViewInternal({
  routine, isLarge, dontShowChecked, onToggleDontShow, onBegin, onBack, isCustomized, customExercises, addCustomExercise, renameCustomExercise,
}: {
  routine: CoachRoutine;
  isLarge: boolean;
  dontShowChecked: boolean;
  onToggleDontShow: () => void;
  onBegin: () => void;
  onBack: () => void;
  isCustomized: boolean;
  customExercises: any;
  addCustomExercise: any;
  renameCustomExercise: any;
}) {
  const theme = useTheme();
  const [showPreview, setShowPreview] = useState(false);
  const resetRoutine = useCoachStore(s => s.resetRoutine);

  if (showPreview) return <RoutinePreviewInternal routine={routine} isLarge={isLarge} onClose={() => setShowPreview(false)} customExercises={customExercises} addCustomExercise={addCustomExercise} renameCustomExercise={renameCustomExercise} />;

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
        <Text style={{ color: theme.text }} className="text-lg leading-7 opacity-90">{routine.instructions}</Text>
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

// -- MAIN COMPONENT --

export default function CoachRoutineScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const routineId = params.id ?? '';

  // -- Store Selectors --
  const customRoutines = useCoachStore(s => s.customRoutines);
  const customizedRoutines = useCoachStore(s => s.customizedRoutines || {});
  const dontShowInstructions = useCoachStore(s => s.dontShowInstructions || {});
  const setDontShowInstructions = useCoachStore(s => s.setDontShowInstructions);
  const recordCompletion = useCoachStore(s => s.recordCompletion);
  const loadCoach = useCoachStore(s => s.loadFromStorage);
  const coachLoaded = useCoachStore(s => s.isLoaded);

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
  const exerciseHistory = useWorkoutStore(s => s.exerciseHistory || []);
  const customExercises = useWorkoutStore(s => s.customExercises);
  const addCustomExercise = useWorkoutStore(s => s.addCustomExercise);
  const renameCustomExercise = useWorkoutStore(s => s.renameCustomExercise);

  const repCountingMode = useSettingsStore(s => s.repCountingMode);
  const setRepCountingMode = useSettingsStore(s => s.setRepCountingMode);
  const motionSensitivity = useSettingsStore(s => s.motionSensitivity);
  const paceSettings = useSettingsStore(s => s.paceSettings);
  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);

  const adaptiveSetState = useAdaptiveRepStore(s => s.setState);
  const adaptiveRepCount = useAdaptiveRepStore(s => s.repCount);
  const adaptiveStartSet = useAdaptiveRepStore(s => s.startSet);
  const adaptiveEndSet = useAdaptiveRepStore(s => s.endSet);
  const adaptiveProcessMotion = useAdaptiveRepStore(s => s.processMotion);
  const applyUserOverride = useAdaptiveRepStore(s => s.applyUserOverride);
  const adaptiveResetToIdle = useAdaptiveRepStore(s => s.resetToIdle);
  const loadAdaptiveProfiles = useAdaptiveRepStore(s => s.loadFromStorage);

  // -- Local State --
  const [phase, setPhase] = useState<Phase>('instructions');
  const [stepIndex, setStepIndex] = useState(-1);
  const [setsDone, setSetsDone] = useState(0);
  const [dontShowChecked, setDontShowChecked] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSetSummary, setPendingSetSummary] = useState<{ repCount: number; totalActiveDuration: number; needsConfirmation: boolean } | null>(null);
  const [isWaitingForVoiceToEndSet, setIsWaitingForVoiceToEndSet] = useState(false);
  const [getReadyLeft, setGetReadyLeft] = useState<number | null>(null);
  const [completion, setCompletion] = useState<CoachCompletion | null>(null);
  const [completedWorkout, setCompletedWorkout] = useState<Workout | null>(null);
  const [inclineDropdownOpen, setInclineDropdownOpen] = useState(false);

  const timedRunnerRef = useRef<TimedRunnerHandle>(null);
  const autoEndHandledRef = useRef(false);
  const initializedRef = useRef(false);

  // -- Derived Data --
  const routine = useMemo(() => {
    const base = getRoutine(routineId) ?? customRoutines.find(r => r.id === routineId);
    return customizedRoutines[routineId] ?? base;
  }, [routineId, customRoutines, customizedRoutines]);

  const step = useMemo(() =>
    (routine && stepIndex >= 0 && stepIndex < (routine.steps?.length || 0)) ? routine.steps[stepIndex] : null,
  [stepIndex, routine]);

  const category = useMemo(() =>
    step ? getExerciseCategory(step.exercise, customExercises || {}) : 'standard',
  [step, customExercises]);

  const isTimed = category === 'timed';
  const effectiveMode = isTimed ? 'timed' : (category === 'freestyle' ? 'voice' : repCountingMode);

  // -- Lifecycle --
  useEffect(() => {
    loadCoach();
    loadAdaptiveProfiles();
  }, []);

  useEffect(() => {
    if (!coachLoaded || initializedRef.current || !routineId) return;
    initializedRef.current = true;
    if (dontShowInstructions[routineId]) {
      setPhase('running');
    }
  }, [coachLoaded, routineId, dontShowInstructions]);

  useEffect(() => {
    if (isSetActive) {
      autoEndHandledRef.current = false;
    }
  }, [isSetActive]);

  // -- Handlers --
  const preloadInclineFor = useCallback((exercise: string): number | null => {
    const matches = exerciseHistory.filter(h => h.exercise === exercise);
    if (matches.length === 0) return null;
    const latest = matches.reduce((a, b) => new Date(b.lastDate).getTime() > new Date(a.lastDate).getTime() ? b : a);
    return latest.inclineLevel;
  }, [exerciseHistory]);

  const startRunning = () => {
    if (dontShowChecked) setDontShowInstructions(routineId, true);
    remoteLog('coach_routine_started', { routineId });
    setPhase('running');
  };

  const beginRoutine = () => {
    if (!routine) return;
    startWorkout();
    const first = routine.steps[0].exercise;
    setExercise(first);
    const preload = preloadInclineFor(first);
    if (preload != null) setInclineLevel(preload);
    setStepIndex(0);
    setSetsDone(0);
  };

  const advanceAfterSet = useCallback(() => {
    if (!step || !routine) return;
    const newDone = setsDone + 1;
    adaptiveResetToIdle();
    autoEndHandledRef.current = false;

    if (newDone >= step.sets) {
      const next = stepIndex + 1;
      if (next < routine.steps.length) {
        const nextEx = routine.steps[next].exercise;
        setStepIndex(next);
        setSetsDone(0);
        setExercise(nextEx);
        const preload = preloadInclineFor(nextEx);
        if (preload != null) setInclineLevel(preload);
      } else {
        const workout = endWorkout({ routineId: routine.id, routineTitle: routine.title });
        const entry = recordCompletion(routineId, workout?.id);
        setCompletion(entry);
        setCompletedWorkout(workout);
        setPhase('complete');
      }
    } else {
      setSetsDone(newDone);
    }
  }, [step, setsDone, stepIndex, routine, setExercise, endWorkout, preloadInclineFor, setInclineLevel, adaptiveResetToIdle, routineId, recordCompletion]);

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
      setPendingSetSummary({ repCount: currentReps, totalActiveDuration: 0, needsConfirmation: true });
      setShowConfirmModal(true);
      return;
    } else if (effectiveMode === 'timed') {
      timedRunnerRef.current?.finalize();
      return;
    }
    endSet();
    advanceAfterSet();
  }, [effectiveMode, adaptiveEndSet, endSet, currentReps, advanceAfterSet, setCurrentTUT]);

  const handleConfirmReps = useCallback((confirmedCount: number) => {
    setReps(confirmedCount);
    if (effectiveMode === 'motion' && pendingSetSummary && confirmedCount !== pendingSetSummary.repCount) {
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
  }, [pendingSetSummary, currentExercise, currentInclineLevel, applyUserOverride, setReps, endSet, effectiveMode, advanceAfterSet, setCurrentTUT]);

  // -- Rep Counting Loop Hooks --
  const handleVoiceRepCounted = useCallback((n: number) => setReps(n), [setReps]);
  const { isListening: isVoiceListening, isProcessing: isVoiceProcessing, error: voiceError, startListening: startVoice, stopListening: stopVoice } = useVoiceCounting(handleVoiceRepCounted, isSetActive && effectiveMode === 'voice');

  useEffect(() => {
    if (effectiveMode === 'voice') {
      if (isSetActive && !isVoiceListening && !showConfirmModal) startVoice();
      else if ((!isSetActive || showConfirmModal) && isVoiceListening) stopVoice();
    }
  }, [isSetActive, effectiveMode, isVoiceListening, showConfirmModal]);

  useEffect(() => {
    if (effectiveMode === 'motion' && isSetActive && adaptiveSetState === 'SET_ACTIVE') {
      setReps(adaptiveRepCount);
    }
  }, [adaptiveRepCount, effectiveMode, isSetActive, adaptiveSetState, setReps]);

  useEffect(() => {
    if (effectiveMode !== 'motion') return;
    if (isSetActive && adaptiveSetState === 'SET_IDLE' && !showConfirmModal) {
      const sensitivityMap = { low: 1.5, medium: 1.0, high: 0.6 };
      const jitterFloorMap = { low: 140, medium: 100, high: 70 };
      const cooldownFloorMap = { low: 1000, medium: 700, high: 450 };
      const expectedRepMs = (paceSettings.liftTime + paceSettings.holdTime + paceSettings.downTime) * 1000;
      adaptiveStartSet(currentExercise, currentInclineLevel, sensitivityMap[motionSensitivity], jitterFloorMap[motionSensitivity], Math.max(cooldownFloorMap[motionSensitivity], Math.round(expectedRepMs * 0.85)), 900);
    }
  }, [isSetActive, adaptiveSetState, effectiveMode, currentExercise, currentInclineLevel, paceSettings, motionSensitivity]);

  const { motion, isListening: isMotionListening } = useMotionContext();
  useEffect(() => {
    if (!isSetActive || !isMotionListening || adaptiveSetState !== 'SET_ACTIVE' || effectiveMode !== 'motion') return;
    const { x, y, z } = motion.accelerationIncludingGravity;
    adaptiveProcessMotion(Math.sqrt(x * x + y * y + z * z));
  }, [motion, isSetActive, isMotionListening, adaptiveSetState, effectiveMode]);

  useEffect(() => {
    if (adaptiveSetState === 'SET_ENDED' && isSetActive && effectiveMode === 'motion' && !autoEndHandledRef.current) {
      autoEndHandledRef.current = true;
      setPendingSetSummary({ repCount: adaptiveRepCount, totalActiveDuration: 0, needsConfirmation: true });
      setShowConfirmModal(true);
      adaptiveResetToIdle();
    }
  }, [adaptiveSetState, isSetActive, effectiveMode, adaptiveRepCount]);

  useEffect(() => {
    if (getReadyLeft === null) return;
    if (getReadyLeft <= 0) { setGetReadyLeft(null); startSet(); return; }
    const t = setTimeout(() => setGetReadyLeft(v => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [getReadyLeft]);

  // -- Render Logic --
  if (!routine) {
    if (!coachLoaded) return <View style={{ flex: 1, backgroundColor: theme.background }} />;
    return <View style={{ flex: 1, backgroundColor: theme.background }} className="items-center justify-center"><Text style={{ color: theme.text }}>Routine not found.</Text></View>;
  }

  // --- Summary Phase ---
  if (phase === 'summary' && completedWorkout) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
        <View className="px-4 py-2 border-b" style={{ borderBottomColor: theme.divider }}><Text style={{ color: theme.text }} className="font-bold text-xl">Workout Summary</Text></View>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}><WorkoutSummary workout={completedWorkout} isLarge={largeDisplayMode} accentColor={completion ? MEDAL_COLORS[medalTierForIndex(completion.index)] : '#f97316'} /></ScrollView>
        <View className="p-4 border-t" style={{ borderTopColor: theme.border, paddingBottom: insets.bottom + 12 }}><Pressable onPress={() => router.replace('/(tabs)/trophies')} className="py-4 rounded-xl items-center bg-orange-500"><Text className="text-white font-bold text-lg">View Trophies</Text></Pressable></View>
      </View>
    );
  }

  // --- Complete Phase ---
  if (phase === 'complete' && completion) {
    const tier = medalTierForIndex(completion.index);
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }} className="items-center justify-center px-8">
        <Trophy size={80} color={MEDAL_COLORS[tier]} />
        <Text style={{ color: theme.text }} className="font-bold text-3xl mt-4">Routine Complete!</Text>
        <Text className="font-semibold text-xl mt-2" style={{ color: MEDAL_COLORS[tier] }}>{MEDAL_LABELS[tier]} Earned</Text>
        <Pressable onPress={() => setPhase('summary')} className="mt-10 bg-orange-500 px-12 py-4 rounded-2xl"><Text className="text-white font-bold text-xl">View Summary</Text></Pressable>
        <Confetti active intense={tier === 'olympia'} />
      </View>
    );
  }

  // --- Running Phase ---
  if (phase === 'running' && stepIndex >= 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
        <View className="flex-row items-center px-3 py-2"><Pressable onPress={() => router.back()} className="p-1"><ChevronLeft size={30} color="#f97316" /></Pressable><Text numberOfLines={1} style={{ color: theme.text }} className="font-bold ml-1 flex-1 text-lg">{routine.title}</Text></View>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
          <View style={{ backgroundColor: theme.card }} className="rounded-2xl p-4 border-2 border-orange-500 mt-2">
             <Text style={{ color: theme.subText }} className="text-xs">Exercise {stepIndex + 1} of {routine.steps.length}</Text>
             <Text style={{ color: theme.text }} className="font-bold text-2xl mt-1">{step?.exercise}</Text>
             <View className="flex-row items-center justify-between mt-4">
                <View><Text className="text-orange-500 font-bold">{step?.repRangeLabel}</Text><Text style={{ color: theme.subText }} className="text-xs mt-1">Set {Math.min(setsDone + 1, step?.sets ?? 1)} of {step?.sets}</Text></View>
                <View className="flex-row items-center">
                  <RepModeToggle value={effectiveMode === 'voice' ? 'voice' : 'motion'} isLarge={largeDisplayMode} disabled={isTimed} onToggle={() => { if (!isTimed) setRepCountingMode(repCountingMode === 'voice' ? 'motion' : 'voice'); }} />
                  <InclineDropdown value={currentInclineLevel} onSelect={setInclineLevel} isOpen={inclineDropdownOpen} onToggle={() => setInclineDropdownOpen(!inclineDropdownOpen)} isLarge={largeDisplayMode} />
                </View>
             </View>
          </View>
          <View style={{ backgroundColor: theme.card, borderColor: getReadyLeft !== null ? '#eab308' : '#f97316' }} className="mt-4 border-2 rounded-2xl p-6 items-center justify-center min-h-[180px]">
            {isTimed ? (
              <TimedExerciseRunner ref={timedRunnerRef} exercise={step?.exercise ?? ''} durationSeconds={30} isSetActive={isSetActive} isLarge={largeDisplayMode} onSetDuration={() => {}} onFinalized={(h) => { setReps(0); setCurrentTUT(h); handleConfirmReps(0); }} />
            ) : getReadyLeft !== null ? (
              <><Text className="text-yellow-500 font-bold text-lg">GET READY</Text><Text className="text-yellow-500 font-bold text-8xl">{getReadyLeft}</Text></>
            ) : (
              <><Text style={{ color: theme.subText }} className="text-lg">REPS</Text><Text className="text-orange-500 font-bold text-9xl">{currentReps}</Text></>
            )}
          </View>
          <Pressable onPress={() => { if (isSetActive) handleEndSet(); else if (getReadyLeft !== null) setGetReadyLeft(null); else { const delay = paceSettings.delayToStart; if (delay > 0) setGetReadyLeft(Math.round(delay)); else startSet(); } }} style={{ backgroundColor: isSetActive ? '#ef4444' : getReadyLeft !== null ? '#374151' : '#16a34a' }} className="mt-6 py-5 rounded-2xl items-center"><Text className="text-white font-bold text-2xl">{isSetActive ? 'END SET' : getReadyLeft !== null ? 'CANCEL' : 'START SET'}</Text></Pressable>
        </ScrollView>
        <RepConfirmationModal visible={showConfirmModal} autoCount={pendingSetSummary?.repCount ?? 0} onConfirm={handleConfirmReps} onDismiss={() => { endSet(); setShowConfirmModal(false); setPendingSetSummary(null); advanceAfterSet(); }} onRedo={() => { adaptiveResetToIdle(); cancelSet(); setShowConfirmModal(false); }} isLarge={largeDisplayMode} />
      </View>
    );
  }

  // --- Default: Instructions/Intro Phase ---
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <InstructionsViewInternal
        routine={routine}
        isLarge={largeDisplayMode}
        dontShowChecked={dontShowChecked}
        onToggleDontShow={() => setDontShowChecked(!dontShowChecked)}
        onBegin={startRunning}
        onBack={() => router.back()}
        isCustomized={!!customizedRoutines[routineId]}
        customExercises={customExercises}
        addCustomExercise={addCustomExercise}
        renameCustomExercise={renameCustomExercise}
      />
      {stepIndex < 0 && phase === 'running' && (
        <View style={{ position: 'absolute', bottom: insets.bottom + 40, left: 20, right: 20 }}>
           <Pressable onPress={beginRoutine} className="py-4 rounded-xl items-center bg-orange-500 shadow-lg"><Text className="text-white font-bold text-xl">Confirm Warmup Complete</Text></Pressable>
        </View>
      )}
    </View>
  );
}
