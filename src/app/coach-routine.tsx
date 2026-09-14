import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
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
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { WorkoutSummary } from '@/components/WorkoutSummary';
import { Confetti } from '@/components/Confetti';
import { remoteLog } from '@/lib/remoteLog';

type Phase = 'instructions' | 'running' | 'complete' | 'summary';

// --- SUB-COMPONENTS ---

function RoutinePreview({ routine, onClose, customExercises, addCustomExercise, renameCustomExercise }: any) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isLarge = useSettingsStore(s => s.largeDisplayMode);
  const [isEditing, setIsEditing] = useState(false);
  const [steps, setSteps] = useState<RoutineStep[]>(routine.steps || []);
  const [showPicker, setShowPicker] = useState(false);

  const customizeRoutine = useCoachStore(s => s.customizeRoutine);
  const resetRoutine = useCoachStore(s => s.resetRoutine);
  const customizedRoutines = useCoachStore(s => s.customizedRoutines || {});

  useEffect(() => { if (!isEditing) setSteps(routine.steps || []); }, [routine.steps, isEditing]);

  const updateSetCount = (index: number, delta: number) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], sets: Math.max(1, newSteps[index].sets + delta) };
    setSteps(newSteps);
  };

  const handleDone = () => { customizeRoutine({ ...routine, steps }); setIsEditing(false); };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, zIndex: 100, paddingTop: Math.max(insets.top, 20) }]}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={onClose} className="p-1"><ChevronLeft size={30} color="#f97316" /></Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className="font-bold ml-1 flex-1 text-lg">Preview - {routine.title}</Text>
        <Pressable onPress={() => setIsEditing(!isEditing)} style={{ backgroundColor: isEditing ? '#f97316' : theme.divider }} className="w-10 h-10 items-center justify-center rounded-full ml-2">
          <Pencil size={20} color={isEditing ? '#fff' : '#f97316'} />
        </Pressable>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 100 }}>
        {customizedRoutines[routine.id] && !isEditing && (
          <View style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }} className="flex-row items-center rounded-xl px-4 py-3 mb-4 border">
            <Text className="text-orange-400 font-medium flex-1 text-sm">You customized this routine.</Text>
            <Pressable onPress={() => resetRoutine(routine.id)} className="flex-row items-center bg-orange-500/20 px-3 py-1.5 rounded-lg"><RotateCcw size={14} color="#f97316" /><Text className="text-orange-500 font-bold ml-1.5 text-xs uppercase">Reset</Text></Pressable>
          </View>
        )}
        {steps.map((s, i) => (
          <View key={`${s.exercise}-${i}`} style={{ backgroundColor: theme.card }} className="flex-row items-center rounded-xl px-4 py-3 mb-2">
            <View className="w-8 h-8 rounded-full bg-orange-500/20 items-center justify-center mr-3"><Text className="text-orange-500 font-bold">{i + 1}</Text></View>
            <View className="flex-1"><Text style={{ color: theme.text }} className="font-semibold">{s.exercise}</Text><Text style={{ color: theme.subText }} className="text-xs opacity-70">{s.group}</Text></View>
            {isEditing ? (
              <View className="flex-row items-center">
                <Pressable onPress={() => updateSetCount(i, -1)} className="p-2"><Minus size={16} color="#f97316" /></Pressable>
                <Text style={{ color: theme.text }} className="font-bold px-1">{s.sets}</Text>
                <Pressable onPress={() => updateSetCount(i, 1)} className="p-2"><Plus size={16} color="#f97316" /></Pressable>
                <Pressable onPress={() => setSteps(steps.filter((_, idx) => idx !== i))} className="ml-1 p-2"><Trash2 size={18} color="#ef4444" /></Pressable>
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
        <Pressable onPress={isEditing ? handleDone : onClose} className="py-4 rounded-xl items-center bg-orange-500"><Text className="text-white font-bold">{isEditing ? 'Done Editing' : 'Return'}</Text></Pressable>
      </View>
      <ExercisePickerModal visible={showPicker} onClose={() => setShowPicker(false)} onSelect={(ex, grp) => { setSteps([...steps, { group: grp, exercise: ex, sets: 2, repRangeLabel: '10-15 Reps' }]); setShowPicker(false); }} isLarge={isLarge} customExercises={customExercises} onAddCustom={addCustomExercise} onRenameCustom={renameCustomExercise} showCoachRoutines={false} />
    </View>
  );
}

function InstructionsView({ routine, onBegin, onBack, customExercises, addCustomExercise, renameCustomExercise }: any) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [showPreview, setShowPreview] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  const setDontShowInstructions = useCoachStore(s => s.setDontShowInstructions);
  const resetRoutine = useCoachStore(s => s.resetRoutine);
  const customizedRoutines = useCoachStore(s => s.customizedRoutines || {});

  const handleStart = () => {
    if (dontShow) setDontShowInstructions(routine.id, true);
    onBegin();
  };

  if (showPreview) return <RoutinePreview routine={routine} onClose={() => setShowPreview(false)} customExercises={customExercises} addCustomExercise={addCustomExercise} renameCustomExercise={renameCustomExercise} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: Math.max(insets.top, 20) }}>
      <View className="flex-row items-center px-3 py-2">
        <Pressable onPress={onBack} hitSlop={12} className="active:opacity-60 p-1"><ChevronLeft size={30} color="#f97316" /></Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className="font-bold ml-1 flex-1 text-xl">{routine.title}</Text>
      </View>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }}>
        {customizedRoutines[routine.id] && (
          <View style={{ backgroundColor: 'rgba(249,115,22,0.1)', borderColor: 'rgba(249,115,22,0.3)' }} className="flex-row items-center rounded-xl px-4 py-3 mb-4 border">
            <Text className="text-orange-400 font-medium flex-1 text-sm">You customized this routine.</Text>
            <Pressable onPress={() => resetRoutine(routine.id)} className="flex-row items-center bg-orange-500/20 px-3 py-1.5 rounded-lg"><RotateCcw size={14} color="#f97316" /><Text className="text-orange-500 font-bold ml-1.5 text-xs uppercase">Reset</Text></Pressable>
          </View>
        )}
        <Text style={{ color: theme.text }} className="text-lg leading-7 opacity-90">{routine.instructions}</Text>
      </ScrollView>
      <View style={{ borderTopColor: theme.border }} className="px-4 pt-3 pb-8 border-t">
        <Pressable onPress={() => setDontShow(!dontShow)} className="flex-row items-center mb-4 active:opacity-70">
          <View style={{ backgroundColor: dontShow ? '#f97316' : theme.divider, borderColor: theme.border }} className="w-6 h-6 rounded mr-3 border items-center justify-center">
            {dontShow && <Check size={16} color="#fff" />}
          </View>
          <Text style={{ color: theme.subText }}>Do not show instructions again</Text>
        </Pressable>
        <View className="flex-row">
          <Pressable onPress={() => setShowPreview(true)} style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937' }} className="flex-1 mr-2 py-4 rounded-xl items-center active:opacity-70"><Text style={{ color: theme.text }} className="font-semibold">Preview</Text></Pressable>
          <Pressable onPress={handleStart} className="flex-1 ml-2 py-4 rounded-xl items-center bg-orange-500 active:opacity-80"><Text className="text-white font-bold">Begin</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

// --- RUNNER VIEW ---

function RunnerView({ routine, onExit, onComplete }: { routine: CoachRoutine; onExit: () => void; onComplete: (w: Workout | null) => void; }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isLarge = useSettingsStore(s => s.largeDisplayMode);

  const [stepIndex, setStepIndex] = useState(-1);
  const [setsDone, setSetsDone] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSetSummary, setPendingSetSummary] = useState<{ repCount: number; totalActiveDuration: number; needsConfirmation: boolean } | null>(null);
  const [getReadyLeft, setGetReadyLeft] = useState<number | null>(null);
  const [inclineDropdownOpen, setInclineDropdownOpen] = useState(false);
  const autoEndHandledRef = useRef(false);

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
  const currentWorkoutSets = useWorkoutStore(s => s.currentWorkoutSets || []);

  const repCountingMode = useSettingsStore(s => s.repCountingMode);
  const setRepCountingMode = useSettingsStore(s => s.setRepCountingMode);
  const motionSensitivity = useSettingsStore(s => s.motionSensitivity);
  const paceSettings = useSettingsStore(s => s.paceSettings);

  const adaptiveSetState = useAdaptiveRepStore(s => s.setState);
  const adaptiveRepCount = useAdaptiveRepStore(s => s.repCount);
  const adaptiveStartSet = useAdaptiveRepStore(s => s.startSet);
  const adaptiveEndSet = useAdaptiveRepStore(s => s.endSet);
  const adaptiveProcessMotion = useAdaptiveRepStore(s => s.processMotion);
  const applyUserOverride = useAdaptiveRepStore(s => s.applyUserOverride);
  const adaptiveResetToIdle = useAdaptiveRepStore(s => s.resetToIdle);

  const timedRunnerRef = useRef<TimedRunnerHandle>(null);

  const step = useMemo(() => (stepIndex >= 0 && routine.steps) ? routine.steps[stepIndex] : null, [stepIndex, routine]);
  const category = useMemo(() => step ? getExerciseCategory(step.exercise, customExercises || {}) : 'standard', [step, customExercises]);
  const isTimed = category === 'timed';
  const effectiveMode = isTimed ? 'timed' : (category === 'freestyle' ? 'voice' : repCountingMode);

  useEffect(() => {
    if (isSetActive) { autoEndHandledRef.current = false; }
  }, [isSetActive]);

  const preloadInclineFor = (ex: string) => {
    const matches = exerciseHistory.filter(h => h.exercise === ex);
    if (matches.length === 0) return null;
    const latest = matches.reduce((a, b) => new Date(b.lastDate).getTime() > new Date(a.lastDate).getTime() ? b : a);
    return latest.inclineLevel;
  };

  const advanceAfterSet = useCallback(() => {
    if (!step) return;
    const newDone = setsDone + 1;
    adaptiveResetToIdle();
    autoEndHandledRef.current = true;

    if (newDone >= step.sets) {
      const next = stepIndex + 1;
      if (next < routine.steps.length) {
        const nextEx = routine.steps[next].exercise;
        setStepIndex(next); setSetsDone(0); setExercise(nextEx);
        const preload = preloadInclineFor(nextEx); if (preload != null) setInclineLevel(preload);
      } else {
        const workout = endWorkout({ routineId: routine.id, routineTitle: routine.title });
        onComplete(workout);
      }
    } else { setSetsDone(newDone); }
  }, [step, setsDone, stepIndex, routine, setExercise, endWorkout, preloadInclineFor, setInclineLevel, adaptiveResetToIdle, onComplete]);

  const handleEndSet = useCallback(() => {
    if (effectiveMode === 'motion') {
      const summary = adaptiveEndSet();
      if (summary && summary.repCount >= 0) {
        setCurrentTUT(summary.totalActiveDuration / 1000);
        setPendingSetSummary(summary); setShowConfirmModal(true); return;
      }
    } else if (effectiveMode === 'voice') {
      setPendingSetSummary({ repCount: currentReps, totalActiveDuration: 0, needsConfirmation: true });
      setShowConfirmModal(true); return;
    }
    endSet(); advanceAfterSet();
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
    endSet(); setShowConfirmModal(false); setPendingSetSummary(null); advanceAfterSet();
  }, [pendingSetSummary, currentExercise, currentInclineLevel, applyUserOverride, setReps, endSet, effectiveMode, advanceAfterSet, setCurrentTUT]);

  const handleVoiceRepCounted = useCallback((n: number) => setReps(n), [setReps]);
  const { isListening: isVoiceListening, error: voiceError, startListening: startVoice, stopListening: stopVoice } = useVoiceCounting(handleVoiceRepCounted, isSetActive && effectiveMode === 'voice');

  useEffect(() => {
    if (effectiveMode === 'voice') {
      if (isSetActive && !isVoiceListening && !showConfirmModal) startVoice();
      else if ((!isSetActive || showConfirmModal) && isVoiceListening) stopVoice();
    }
  }, [isSetActive, effectiveMode, isVoiceListening, showConfirmModal]);

  useEffect(() => {
    if (effectiveMode === 'motion' && isSetActive && adaptiveSetState === 'SET_ACTIVE') setReps(adaptiveRepCount);
  }, [adaptiveRepCount, effectiveMode, isSetActive, adaptiveSetState, setReps]);

  useEffect(() => {
    if (effectiveMode === 'motion' && isSetActive && adaptiveSetState === 'SET_IDLE' && !showConfirmModal) {
      const sensitivityMap = { low: 1.5, medium: 1.0, high: 0.6 };
      const jitterFloorMap = { low: 140, medium: 100, high: 70 };
      const cooldownFloorMap = { low: 1000, medium: 700, high: 450 };
      const expectedRepMs = (paceSettings.liftTime + paceSettings.holdTime + paceSettings.downTime) * 1000;
      adaptiveStartSet(currentExercise, currentInclineLevel, sensitivityMap[motionSensitivity], jitterFloorMap[motionSensitivity], Math.max(cooldownFloorMap[motionSensitivity], Math.round(expectedRepMs * 0.85)), 900);
    }
  }, [isSetActive, adaptiveSetState, effectiveMode, currentExercise, currentInclineLevel, paceSettings, motionSensitivity, showConfirmModal]);

  const { motion, isListening: isMotionListening } = useMotionContext();
  useEffect(() => {
    if (!isSetActive || !isMotionListening || adaptiveSetState !== 'SET_ACTIVE' || effectiveMode !== 'motion') return;
    const { x, y, z } = motion.accelerationIncludingGravity;
    adaptiveProcessMotion(Math.sqrt(x * x + y * y + z * z));
  }, [motion, isSetActive, isMotionListening, adaptiveSetState, effectiveMode, adaptiveProcessMotion]);

  useEffect(() => {
    if (adaptiveSetState === 'SET_ENDED' && isSetActive && effectiveMode === 'motion' && !autoEndHandledRef.current) {
      autoEndHandledRef.current = true;
      const summary = adaptiveEndSet();
      setPendingSetSummary(summary);
      setShowConfirmModal(true);
      adaptiveResetToIdle();
    }
  }, [adaptiveSetState, isSetActive, effectiveMode]);

  useEffect(() => {
    if (getReadyLeft === null) return;
    if (getReadyLeft <= 0) { setGetReadyLeft(null); startSet(); return; }
    const t = setTimeout(() => setGetReadyLeft(v => (v === null ? null : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [getReadyLeft, startSet]);

  if (stepIndex < 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', paddingTop: Math.max(insets.top, 20) }}>
        <Sparkles size={60} color="#f97316" />
        <Text style={{ color: theme.text }} className="font-bold text-3xl mt-6 text-center">Warmup Complete?</Text>
        <Text style={{ color: theme.subText }} className="text-center mt-4 text-lg px-8">We will guide you through each exercise automatically.</Text>
        <Pressable onPress={() => { startWorkout(); setStepIndex(0); setSetsDone(0); adaptiveResetToIdle(); }} className="mt-10 bg-orange-500 px-12 py-4 rounded-2xl active:opacity-80"><Text className="text-white font-bold text-xl">Begin</Text></Pressable>
      </View>
    );
  }

  const currentExSetsResults = useMemo(() => {
    if (!step) return [];
    // Only grab sets from THIS specific exercise step from the session history
    return currentWorkoutSets.filter(s => s.exercise === step.exercise).slice(-setsDone);
  }, [currentWorkoutSets, setsDone, step]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: Math.max(insets.top, 20) }}>
      {/* Header aligned with iOS image */}
      <View className="flex-row items-center px-4 py-2">
        <Pressable onPress={onExit} hitSlop={12} className="active:opacity-60"><ChevronLeft size={28} color="#f97316" /></Pressable>
        <Text numberOfLines={1} style={{ color: theme.text }} className="font-bold ml-2 flex-1 text-2xl">{routine.title}</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {/* Top Exercise Progress Bars */}
        <View className="flex-row justify-between mt-2 mb-5 px-1">
          {routine.steps.map((_, i) => (
            <View
              key={i}
              className="h-1.5 rounded-full"
              style={{
                flex: 1,
                marginHorizontal: 2,
                backgroundColor: i < stepIndex ? 'rgba(249,115,22,0.4)' : i === stepIndex ? '#f97316' : (theme.background === '#ffffff' ? '#e5e7eb' : '#374151')
              }}
            />
          ))}
        </View>

        {/* Main Exercise Card with Orange Border */}
        <View style={{ backgroundColor: theme.card, borderColor: '#f97316' }} className="rounded-2xl p-5 border-2 mt-2">
           <Text style={{ color: theme.subText }} className="text-xs uppercase font-bold tracking-tight opacity-60">
             Exercise {stepIndex + 1} of {routine.steps.length} · {step?.group}
           </Text>
           <Text style={{ color: theme.text }} className="font-bold text-3xl mt-1">{step?.exercise}</Text>

           <View className="flex-row items-end justify-between mt-5">
              <View className="flex-1">
                <Text className="text-orange-500 font-bold text-lg">{step?.repRangeLabel}</Text>
              </View>
              <View className="items-end">
                <Text style={{ color: theme.subText }} className="text-[10px] uppercase font-bold mb-1 opacity-60">Incline</Text>
                <InclineDropdown value={currentInclineLevel} onSelect={setInclineLevel} isOpen={inclineDropdownOpen} onToggle={() => setInclineDropdownOpen(!inclineDropdownOpen)} isLarge={isLarge} />
              </View>
           </View>

           {/* Internal Sets Progress Bars - lights up Green/Orange */}
           <View className="flex-row items-center mt-6">
             {step && Array.from({ length: step.sets }).map((_, i) => {
               let barColor = (theme.background === '#ffffff' ? '#e5e7eb' : '#374151');
               if (i < setsDone) {
                 const result = currentExSetsResults[i];
                 const target = step.targetReps || 0;
                 // Yoda logic: Green if hit target, Orange if short
                 barColor = (result && result.reps >= target) ? '#22c55e' : '#f97316';
               } else if (i === setsDone && isSetActive) {
                 barColor = '#f97316';
               }
               return (
                 <View key={i} className="flex-1 h-1.5 rounded-full mr-2" style={{ backgroundColor: barColor }} />
               );
             })}
           </View>

           <View className="flex-row items-center justify-between mt-4">
              <Text style={{ color: theme.subText }} className="text-sm font-medium opacity-70">
                Set {Math.min(setsDone + 1, step?.sets ?? 1)} of {step?.sets}
              </Text>
              <RepModeToggle value={effectiveMode === 'voice' ? 'voice' : 'motion'} isLarge={isLarge} disabled={isTimed} onToggle={() => { if (!isTimed) setRepCountingMode(repCountingMode === 'voice' ? 'motion' : 'voice'); }} />
           </View>
        </View>

        {/* Status indicator bubble */}
        {isSetActive && !isTimed && effectiveMode === 'motion' && (
          <View className="mt-4 self-center bg-yellow-500/10 px-4 py-1.5 rounded-full"><Text className="text-yellow-500 font-bold text-xs uppercase tracking-widest">{isStabilizing ? 'Positioning...' : showLearningIndicator ? 'Learning ROM...' : 'Counting Reps'}</Text></View>
        )}

        {/* Big Rep Counter / Timer Box */}
        <View style={{ backgroundColor: theme.card, borderColor: getReadyLeft !== null ? '#eab308' : '#f97316' }} className="mt-5 border-2 rounded-3xl p-8 items-center justify-center min-h-[220px]">
          {isTimed ? (
            <TimedExerciseRunner ref={timedRunnerRef} exercise={step?.exercise ?? ''} durationSeconds={30} isSetActive={isSetActive} isLarge={isLarge} onSetDuration={() => {}} onFinalized={(h) => { setReps(0); setCurrentTUT(h); handleConfirmReps(0); }} />
          ) : getReadyLeft !== null ? (
            <><Text className="text-yellow-500 font-black text-xl tracking-tighter">GET READY</Text><Text className="text-yellow-500 font-black text-9xl mt-2">{getReadyLeft}</Text></>
          ) : (
            <><Text style={{ color: theme.subText }} className="font-bold tracking-widest opacity-60">REPS</Text><Text className="text-orange-500 font-black text-9xl mt-1">{currentReps}</Text></>
          )}
        </View>

        {/* Bottom Action Button */}
        <Pressable
          onPress={() => {
            if (isSetActive) handleEndSet();
            else if (getReadyLeft !== null) setGetReadyLeft(null);
            else {
              adaptiveResetToIdle();
              const d = paceSettings.delayToStart;
              if (d > 0) setGetReadyLeft(Math.round(d));
              else startSet();
            }
          }}
          style={{ backgroundColor: isSetActive ? '#ef4444' : getReadyLeft !== null ? '#374151' : '#16a34a' }}
          className="mt-8 py-5 rounded-3xl items-center active:opacity-80 shadow-lg"
        >
          <Text className="text-white font-black text-2xl uppercase tracking-tighter">
            {isSetActive ? 'END SET' : getReadyLeft !== null ? 'CANCEL' : `START SET ${Math.min(setsDone + 1, step?.sets ?? 1)}`}
          </Text>
        </Pressable>
      </ScrollView>

      <RepConfirmationModal visible={showConfirmModal} autoCount={pendingSetSummary?.repCount ?? 0} onConfirm={handleConfirmReps} onDismiss={() => { handleConfirmReps(currentReps); }} onRedo={() => { adaptiveResetToIdle(); cancelSet(); setShowConfirmModal(false); }} isLarge={isLarge} />
    </View>
  );
}

// --- TOP LEVEL EXPORT ---

export default function CoachRoutineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const routineId = params.id ?? '';

  const customRoutines = useCoachStore(s => s.customRoutines);
  const customizedRoutines = useCoachStore(s => s.customizedRoutines || {});
  const dontShowInstructions = useCoachStore(s => s.dontShowInstructions || {});
  const loadCoach = useCoachStore(s => s.loadFromStorage);
  const coachLoaded = useCoachStore(s => s.isLoaded);

  const routine = useMemo(() => {
    const base = getRoutine(routineId) ?? (customRoutines || []).find(r => r.id === routineId);
    return (customizedRoutines || {})[routineId] ?? base;
  }, [routineId, customRoutines, customizedRoutines]);

  const [phase, setPhase] = useState<Phase>('instructions');
  const [completedWorkout, setCompletedWorkout] = useState<Workout | null>(null);
  const [completion, setCompletion] = useState<CoachCompletion | null>(null);

  const customExercises = useWorkoutStore(s => s.customExercises);
  const addCustomExercise = useWorkoutStore(s => s.addCustomExercise);
  const renameCustomExercise = useWorkoutStore(s => s.renameCustomExercise);

  useEffect(() => { loadCoach(); }, []);
  useEffect(() => { if (coachLoaded && routineId && dontShowInstructions?.[routineId]) { setPhase('running'); } }, [coachLoaded, routineId, dontShowInstructions]);

  if (!routine) {
    if (!coachLoaded) return <View style={{ flex: 1, backgroundColor: theme.background }} />;
    return <View style={{ flex: 1, backgroundColor: theme.background }} className="items-center justify-center"><Text style={{ color: theme.text }}>Routine not found.</Text></View>;
  }

  if (phase === 'summary' && completedWorkout) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: Math.max(insets.top, 20) }}>
        <View className="px-4 py-2 border-b" style={{ borderBottomColor: theme.divider }}><Text style={{ color: theme.text }} className="font-bold text-xl">Workout Summary</Text></View>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}><WorkoutSummary workout={completedWorkout} isLarge={useSettingsStore.getState().largeDisplayMode} accentColor={'#f97316'} /></ScrollView>
        <View className="p-4 border-t" style={{ borderTopColor: theme.border, paddingBottom: insets.bottom + 12 }}><Pressable onPress={() => router.replace('/(tabs)/trophies')} className="py-4 rounded-xl items-center bg-orange-500 active:opacity-80"><Text className="text-white font-bold text-lg">View Trophies</Text></Pressable></View>
      </View>
    );
  }

  if (phase === 'complete' && completion) {
    const tier = medalTierForIndex(completion.index);
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: Math.max(insets.top, 20) }} className="items-center justify-center px-8">
        <Trophy size={80} color={MEDAL_COLORS[tier]} />
        <Text style={{ color: theme.text }} className="font-bold text-3xl mt-4">Routine Complete!</Text>
        <Text className="font-semibold text-xl mt-2" style={{ color: MEDAL_COLORS[tier] }}>{MEDAL_LABELS[tier]} Earned</Text>
        <Pressable onPress={() => setPhase('summary')} className="mt-10 bg-orange-500 px-12 py-4 rounded-2xl active:opacity-80"><Text className="text-white font-bold text-xl">View Summary</Text></Pressable>
        <Confetti active intense={tier === 'olympia'} />
      </View>
    );
  }

  if (phase === 'running') {
    return <RunnerView routine={routine} onExit={() => router.back()} onComplete={(w) => { setCompletedWorkout(w); setPhase('complete'); }} />;
  }

  return <InstructionsView routine={routine} onBegin={() => setPhase('running')} onBack={() => router.back()} customExercises={customExercises} addCustomExercise={addCustomExercise} renameCustomExercise={renameCustomExercise} />;
}
