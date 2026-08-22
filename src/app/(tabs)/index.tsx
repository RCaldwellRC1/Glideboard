import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Target, Loader, Plus, Check, ClipboardList, TriangleAlert, RefreshCw, Mic, X, Sparkles } from 'lucide-react-native';

import { useWorkoutStore } from '@/lib/workout/store';
import {
  DEFAULT_TIMED_SECONDS,
  categoryColor,
  getExerciseCategory
} from '@/lib/workout/categories';
import { FREE_STYLE_GROUP, TIMED_GROUP } from '@/lib/workout/constants';
import { INCLINE_LEVELS } from '@/lib/workout/types';

import { useHasFullAccess } from '@/lib/purchases';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { remoteLog } from '@/lib/remoteLog';
import { useAdaptiveRepStore, useMotionContext } from '@/lib/motion';
import { useVoiceCounting } from '@/lib/voice';
import { PaceSetterGauge } from '@/components/PaceSetterGauge';
import { RepConfirmationModal } from '@/components/RepConfirmationModal';
import { InclineDropdown } from '@/components/InclineDropdown';
import { WeightInput } from '@/components/WeightPad';
import { TimedExerciseRunner, type TimedRunnerHandle } from '@/components/TimedExerciseRunner';
import { RepModeToggle } from '@/components/RepModeToggle';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';

function ExerciseDropdown({
  value,
  onSelect,
  isOpen,
  onToggle,
  isLarge,
  customExercises,
  onAddCustom,
  onRenameCustom,
  onOpenCoach,
}: {
  value: string;
  onSelect: (exercise: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  isLarge: boolean;
  customExercises: Record<string, string[]>;
  onAddCustom: (group: string, name: string) => void;
  onRenameCustom: (group: string, oldName: string, newName: string) => void;
  onOpenCoach: () => void;
}) {
  const valueColor = categoryColor(getExerciseCategory(value, customExercises));

  return (
    <View className="flex-1 mr-2 relative">
      <Text className={`text-gray-500 mb-1 tracking-wide ${isLarge ? 'text-xs' : 'text-sm'}`}>EXERCISE</Text>
      <Pressable
        onPress={onToggle}
        className={`bg-gray-900 rounded-lg flex-row items-center justify-between ${isLarge ? 'px-3 py-3' : 'px-4 py-3'}`}
      >
        <Text numberOfLines={1} adjustsFontSizeToFit className={`font-semibold uppercase flex-1 mr-1 ${isLarge ? 'text-base' : 'text-lg'}`} style={{ color: valueColor }}>{value}</Text>
        {isOpen ? (
          <ChevronUp size={isLarge ? 18 : 20} color={valueColor} />
        ) : (
          <ChevronDown size={isLarge ? 18 : 20} color={valueColor} />
        )}
      </Pressable>

      <ExercisePickerModal
        visible={isOpen}
        onClose={onToggle}
        onSelect={(exercise) => {
          onSelect(exercise);
          onToggle();
        }}
        isLarge={isLarge}
        customExercises={customExercises}
        onAddCustom={onAddCustom}
        onRenameCustom={onRenameCustom}
        onOpenCoach={onOpenCoach}
      />
    </View>
  );
}

export default function TrackerScreen() {
  const insets = useSafeAreaInsets();
  const [exerciseDropdownOpen, setExerciseDropdownOpen] = useState(false);
  const [inclineDropdownOpen, setInclineDropdownOpen] = useState(false);
  const [isPaceSetterMode, setIsPaceSetterMode] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingSetSummary, setPendingSetSummary] = useState<{ repCount: number; needsConfirmation: boolean } | null>(null);
  const [isWaitingForVoiceToEndSet, setIsWaitingForVoiceToEndSet] = useState(false);
  const [learningMsg, setLearningMsg] = useState<string | null>(null);
  const [setupSecondsLeft, setSetupSecondsLeft] = useState(0);

  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription();
  const repCountingMode = useSettingsStore(s => s.repCountingMode);
  const repModeUserSet = useSettingsStore(s => s.repModeUserSet);
  const setRepCountingMode = useSettingsStore(s => s.setRepCountingMode);
  const motionSensitivity = useSettingsStore(s => s.motionSensitivity);
  const paceSettings = useSettingsStore(s => s.paceSettings);
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  const sensitivityMultiplierMap = { low: 1.5, medium: 1.0, high: 0.6 } as const;
  const jitterFloorMsMap = { low: 140, medium: 100, high: 70 } as const;
  const cooldownFloorMsMap = { low: 1000, medium: 700, high: 450 } as const;

  const expectedRepMs = (paceSettings.liftTime + paceSettings.holdTime + paceSettings.downTime) * 1000;
  const minRepDurationMs = jitterFloorMsMap[motionSensitivity];
  const baseRepCooldownMs = Math.max(cooldownFloorMsMap[motionSensitivity], Math.round(expectedRepMs * 0.85));
  const setupDelayMs = paceSettings.delayToStart * 1000;

  const router = useRouter();
  const { hasFullAccess, isLoading: isAccessLoading } = useHasFullAccess();

  const isWorkoutActive = useWorkoutStore(s => s.isWorkoutActive);
  const isSetActive = useWorkoutStore(s => s.isSetActive);
  const currentExercise = useWorkoutStore(s => s.currentExercise);
  const currentInclineLevel = useWorkoutStore(s => s.currentInclineLevel);
  const currentWeight = useWorkoutStore(s => s.currentWeight);
  const currentReps = useWorkoutStore(s => s.currentReps);
  const currentSet = useWorkoutStore(s => s.currentSet);
  const startWorkout = useWorkoutStore(s => s.startWorkout);
  const endWorkout = useWorkoutStore(s => s.endWorkout);
  const startSet = useWorkoutStore(s => s.startSet);
  const endSet = useWorkoutStore(s => s.endSet);
  const setReps = useWorkoutStore(s => s.setReps);
  const setExercise = useWorkoutStore(s => s.setExercise);
  const setInclineLevel = useWorkoutStore(s => s.setInclineLevel);
  const setCurrentWeight = useWorkoutStore(s => s.setCurrentWeight);
  const getLastPerformance = useWorkoutStore(s => s.getLastPerformance);
  const workoutHistory = useWorkoutStore(s => s.workoutHistory);
  const loadFromStorage = useWorkoutStore(s => s.loadFromStorage);
  const customExercises = useWorkoutStore(s => s.customExercises);
  const addCustomExercise = useWorkoutStore(s => s.addCustomExercise);
  const renameCustomExercise = useWorkoutStore(s => s.renameCustomExercise);
  const timedDurations = useWorkoutStore(s => s.timedDurations);
  const setTimedDuration = useWorkoutStore(s => s.setTimedDuration);
  const endTimedSet = useWorkoutStore(s => s.endTimedSet);

  const category = getExerciseCategory(currentExercise, customExercises);
  const autoMode: 'motion' | 'voice' | 'timed' =
    category === 'timed' ? 'timed' : category === 'freestyle' ? 'voice' : repCountingMode;
  const effectiveMode: 'motion' | 'voice' | 'timed' =
    autoMode === 'timed' ? 'timed' : repModeUserSet ? repCountingMode : autoMode;
  const isTimed = category === 'timed';
  const isFreestyle = category === 'freestyle';
  const timedSeconds = timedDurations[currentExercise] ?? DEFAULT_TIMED_SECONDS;
  const timedRunnerRef = useRef<TimedRunnerHandle>(null);

  const adaptiveSetState = useAdaptiveRepStore(s => s.setState);
  const adaptiveRepCount = useAdaptiveRepStore(s => s.repCount);
  const adaptiveSetStartTime = useAdaptiveRepStore(s => s.setStartTime);
  const ignoreMotion = useAdaptiveRepStore(s => s.ignoreMotion);
  const isLearningROM = useAdaptiveRepStore(s => s.isLearningROM);
  const adaptiveStartSet = useAdaptiveRepStore(s => s.startSet);
  const adaptiveEndSet = useAdaptiveRepStore(s => s.endSet);
  const adaptiveProcessMotion = useAdaptiveRepStore(s => s.processMotion);
  const applyUserOverride = useAdaptiveRepStore(s => s.applyUserOverride);
  const loadAdaptiveProfiles = useAdaptiveRepStore(s => s.loadFromStorage);

  const learnedCooldownFactor = useAdaptiveRepStore(s => {
    const f = s.cooldownAdjustments[`${currentExercise}::${currentInclineLevel}`]?.factor;
    return typeof f === 'number' && isFinite(f) ? f : 1;
  });
  const repCooldownMs = Math.min(4000, Math.max(250, Math.round(baseRepCooldownMs * learnedCooldownFactor)));

  const {
    motion,
    isListening,
    diagnostics: motionDiagnostics,
    start: startMotionSensor,
    restart: restartMotionSensor,
  } = useMotionContext();

  const handleVoiceRepCounted = useCallback((repNumber: number) => {
    setReps(repNumber);
  }, [setReps]);

  const {
    isListening: isVoiceListening,
    isProcessing: isVoiceProcessing,
    error: voiceError,
    startListening: startVoiceListening,
    stopListening: stopVoiceListening,
    resetCount: resetVoiceCount,
  } = useVoiceCounting(handleVoiceRepCounted, isSetActive && effectiveMode === 'voice');

  const prevExerciseRef = useRef(currentExercise);
  useEffect(() => {
    if (prevExerciseRef.current !== currentExercise) {
      prevExerciseRef.current = currentExercise;
      resetVoiceCount();
    }
  }, [currentExercise, resetVoiceCount]);

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
    loadFromStorage();
    loadSettings();
    loadAdaptiveProfiles();

    // START MOTION SENSOR MANUALLY AFTER MOUNT
    // This is the definitive fix for Android startup crashes caused by
    // early hardware sensor probes.
    setTimeout(() => {
        startMotionSensor().catch(err => {
            console.warn('[TRACKER] Failed to start motion sensor:', err);
        });
    }, 1000);
  }, []);

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
        sensitivityMultiplierMap[motionSensitivity],
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
    const isSettingUp = ignoreMotion && adaptiveSetState === 'SET_ACTIVE' && effectiveMode === 'motion';
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

  const SENSOR_FAILURE_GRACE_MS = 2000;
  const [showSensorFailure, setShowSensorFailure] = useState(false);
  const motionSensorHealthy = motionDiagnostics.isHealthy;

  useEffect(() => {
    if (effectiveMode !== 'motion' || motionSensorHealthy) {
      setShowSensorFailure(false);
      return;
    }
    const timer = setTimeout(() => setShowSensorFailure(true), SENSOR_FAILURE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [effectiveMode, motionSensorHealthy]);

  const autoEndHandled = React.useRef(false);
  const adaptiveResetToIdle = useAdaptiveRepStore(s => s.resetToIdle);

  useEffect(() => {
    if (adaptiveSetState === 'SET_ENDED' && isSetActive && effectiveMode === 'motion' && !autoEndHandled.current) {
      autoEndHandled.current = true;
      setPendingSetSummary({ repCount: adaptiveRepCount, needsConfirmation: true });
      setShowConfirmModal(true);
      adaptiveResetToIdle();
    }
    if (!isSetActive) {
      autoEndHandled.current = false;
    }
  }, [adaptiveSetState, isSetActive, effectiveMode, adaptiveRepCount, adaptiveResetToIdle]);

  const handleEndSet = useCallback(() => {
    if (effectiveMode === 'motion') {
      const summary = adaptiveEndSet();
      if (summary.repCount >= 0) {
        setPendingSetSummary(summary);
        setShowConfirmModal(true);
        return;
      }
    } else if (effectiveMode === 'voice') {
      stopVoiceListening();
      if (isVoiceProcessing) {
        setIsWaitingForVoiceToEndSet(true);
      } else {
        setPendingSetSummary({ repCount: currentReps, needsConfirmation: true });
        setShowConfirmModal(true);
      }
      return;
    } else if (effectiveMode === 'timed') {
      const held = timedRunnerRef.current?.stop();
      if (held != null) {
        endTimedSet(held);
      }
      return;
    }
    endSet();
  }, [effectiveMode, adaptiveEndSet, endSet, currentReps, stopVoiceListening, isVoiceProcessing, endTimedSet]);

  useEffect(() => {
    if (isWaitingForVoiceToEndSet && !isVoiceProcessing) {
      setIsWaitingForVoiceToEndSet(false);
      setPendingSetSummary({ repCount: currentReps, needsConfirmation: true });
      setShowConfirmModal(true);
    }
  }, [isWaitingForVoiceToEndSet, isVoiceProcessing, currentReps]);

  const handleConfirmReps = useCallback((confirmedCount: number) => {
    setReps(confirmedCount);
    if (effectiveMode === 'motion' && pendingSetSummary && confirmedCount !== pendingSetSummary.repCount) {
      const { adjusted, direction, strong } = applyUserOverride(currentExercise, currentInclineLevel, confirmedCount);
      if (adjusted) {
        const nudged = direction === 'tighter' ? 'I\u0027ll count more tightly next time.' : 'I\u0027ll count more easily next time.';
        setLearningMsg(strong ? `Learned! ${nudged}` : `Nudged! ${nudged}`);
        setTimeout(() => setLearningMsg(null), 2500);
      }
    }
    if (effectiveMode === 'voice' && pendingSetSummary && confirmedCount !== pendingSetSummary.repCount) {
      remoteLog('voice_set_corrected', { exercise: currentExercise, auto: pendingSetSummary.repCount, confirmed: confirmedCount });
    }
    endSet();
    setShowConfirmModal(false);
    setPendingSetSummary(null);
  }, [pendingSetSummary, currentExercise, currentInclineLevel, applyUserOverride, setReps, endSet, effectiveMode]);

  const lastPerformance = getLastPerformance(currentExercise);
  const lastIncline = lastPerformance?.inclineLevel;
  const lastReps = lastPerformance?.lastReps;

  const currentExerciseColor = categoryColor(category);

  return (
    <View className="flex-1 bg-black">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row items-end px-4 mb-6">
          <ExerciseDropdown
            value={currentExercise}
            onSelect={setExercise}
            isOpen={exerciseDropdownOpen}
            onToggle={() => setExerciseDropdownOpen(o => !o)}
            isLarge={largeDisplayMode}
            customExercises={customExercises}
            onAddCustom={addCustomExercise}
            onRenameCustom={renameCustomExercise}
            onOpenCoach={() => router.push('/coach')}
          />
          {isFreestyle ? (
            <WeightInput value={currentWeight} onChange={setCurrentWeight} isLarge={largeDisplayMode} />
          ) : (
            <InclineDropdown
              value={currentInclineLevel}
              onSelect={setInclineLevel}
              isOpen={inclineDropdownOpen}
              onToggle={() => setInclineDropdownOpen(o => !o)}
              isLarge={largeDisplayMode}
            />
          )}
        </View>

        <View className="flex-row px-4 h-[280] mb-6">
          <View className="flex-1 mr-4 bg-gray-900 rounded-3xl items-center justify-center border border-gray-800 shadow-lg relative overflow-hidden">
            <View className="absolute top-4 left-4 flex-row items-center">
              <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: currentExerciseColor }} />
              <Text className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">{category}</Text>
            </View>

            {!isTimed && (
              <View className="absolute top-2 right-2">
                <RepModeToggle
                  value={effectiveMode === 'voice' ? 'voice' : 'motion'}
                  isLarge={largeDisplayMode}
                  onToggle={() => {
                    setRepCountingMode(effectiveMode === 'voice' ? 'motion' : 'voice');
                    remoteLog('rep_mode_toggled', { mode: effectiveMode === 'voice' ? 'motion' : 'voice', source: 'tracker' });
                  }}
                />
              </View>
            )}

            {isTimed ? (
              <TimedExerciseRunner
                ref={timedRunnerRef}
                exercise={currentExercise}
                seconds={timedSeconds}
                onDurationChange={(s) => setTimedDuration(currentExercise, s)}
                isLarge={largeDisplayMode}
              />
            ) : (
              <>
                <Text className={`text-gray-500 font-medium mb-1 tracking-widest ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>REPS</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit className={`font-black text-white ${largeDisplayMode ? 'text-7xl' : 'text-8xl'}`}>
                  {currentReps}
                </Text>
              </>
            )}
          </View>

          <View className="w-24 bg-gray-900 rounded-3xl items-center justify-center border border-gray-800 shadow-lg">
            <Text className={`text-gray-500 font-medium mb-1 tracking-widest ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>SET</Text>
            <Text className={`font-black text-white ${largeDisplayMode ? 'text-5xl' : 'text-6xl'}`}>
              {currentSet}
            </Text>
          </View>
        </View>

        {isSetActive && effectiveMode === 'motion' && (
          <View className="mx-4 mb-6">
            {ignoreMotion ? (
              <View className="flex-row items-center justify-center bg-yellow-500/10 rounded-2xl py-4 border border-yellow-500/20">
                <Loader size={20} color="#eab308" className="mr-3" />
                <Text className="text-yellow-500 font-bold text-lg">
                  Get into position{setupSecondsLeft > 0 ? `... ${setupSecondsLeft}s` : '...'}
                </Text>
              </View>
            ) : isLearningROM ? (
              <View className="flex-row items-center justify-center bg-blue-500/10 rounded-2xl py-4 border border-blue-500/20">
                <Sparkles size={20} color="#60a5fa" className="mr-3" />
                <Text className="text-blue-400 font-bold text-lg">Learning your movement...</Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/10 rounded-2xl py-4 border border-green-500/20">
                <Check size={20} color="#22c55e" className="mr-3" />
                <Text className="text-green-500 font-bold text-lg">Ready to count</Text>
              </View>
            )}
          </View>
        )}

        {isSetActive && effectiveMode === 'voice' && (
          <View className="mx-4 mb-6">
            {voiceError ? (
              <View className="flex-row items-center justify-center bg-red-500/10 rounded-2xl py-4 border border-red-500/20 px-4">
                <TriangleAlert size={20} color="#ef4444" className="mr-3" />
                <Text className="text-red-500 font-bold text-center flex-1">{voiceError}</Text>
              </View>
            ) : isVoiceProcessing ? (
              <View className="flex-row items-center justify-center bg-blue-500/10 rounded-2xl py-4 border border-blue-500/20">
                <Loader size={20} color="#60a5fa" className="mr-3" />
                <Text className="text-blue-400 font-bold text-lg">Listening to your voice...</Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/10 rounded-2xl py-4 border border-green-500/20">
                <Mic size={20} color="#22c55e" className="mr-3" />
                <Text className="text-green-500 font-bold text-lg">Count your reps out loud</Text>
              </View>
            )}
          </View>
        )}

        {showSensorFailure && (
          <View className="mx-4 mb-6 bg-red-500/10 rounded-2xl p-4 border border-red-500/20">
            <View className="flex-row items-center mb-1">
              <TriangleAlert size={18} color="#ef4444" />
              <Text className="text-red-500 font-bold ml-2">Motion counting unavailable</Text>
            </View>
            <Text className="text-red-400/80 text-xs">Try restarting the app or switch to Voice counting.</Text>
            <Pressable onPress={restartMotionSensor} className="mt-3 flex-row items-center bg-red-500/20 self-start px-3 py-1.5 rounded-lg active:bg-red-500/30">
              <RefreshCw size={14} color="#ef4444" />
              <Text className="text-red-500 font-bold ml-1.5 text-xs">Restart Sensor</Text>
            </Pressable>
          </View>
        )}

        <View className="px-4 mb-6">
          <Pressable
            onPress={isSetActive ? handleEndSet : startSet}
            className={`py-6 rounded-3xl items-center justify-center shadow-xl ${isSetActive ? 'bg-red-600' : 'bg-orange-500'} active:opacity-90`}
          >
            <Text className={`text-white font-black tracking-widest ${largeDisplayMode ? 'text-2xl' : 'text-3xl'}`}>
              {isSetActive ? 'END SET' : 'START SET'}
            </Text>
          </Pressable>
        </View>

        <View className="px-4">
          <View className="bg-gray-900 rounded-3xl p-5 border border-gray-800">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-gray-400 font-bold tracking-widest text-xs">LAST PERFORMANCE</Text>
              <Target size={16} color="#4b5563" />
            </View>
            {lastPerformance ? (
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-gray-500 text-xs mb-1 uppercase font-medium">Incline</Text>
                  <Text className="text-white text-2xl font-bold">Lvl {lastIncline}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-gray-500 text-xs mb-1 uppercase font-medium">Best Reps</Text>
                  <Text className="text-white text-2xl font-bold">{lastReps}</Text>
                </View>
              </View>
            ) : (
              <Text className="text-gray-600 italic">No history yet for this exercise.</Text>
            )}
          </View>
        </View>

        {!isSetActive && (
          <View className="px-4 mt-6">
            <Pressable
              onPress={() => setIsPaceSetterMode(!isPaceSetterMode)}
              className="flex-row items-center justify-between bg-gray-900/50 rounded-2xl p-4 border border-gray-800 active:bg-gray-800"
            >
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-xl bg-orange-500/10 items-center justify-center">
                  <RefreshCw size={20} color="#f97316" />
                </View>
                <View className="ml-3">
                  <Text className="text-white font-bold">Pace-Setter Gauge</Text>
                  <Text className="text-gray-500 text-xs">Match your speed to the goal</Text>
                </View>
              </View>
              <ChevronRight size={20} color="#4b5563" />
            </Pressable>
          </View>
        )}

        {isPaceSetterMode && (
          <View className="mx-4 mt-4 bg-gray-900 rounded-3xl p-6 border border-gray-800">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-white font-bold text-lg">Pace-Setter</Text>
              <Pressable onPress={() => setIsPaceSetterMode(false)}><X size={20} color="#6b7280" /></Pressable>
            </View>
            <PaceSetterGauge size={largeDisplayMode ? 180 : 220} />
            <Text className="text-gray-500 text-center mt-6 text-sm leading-5 px-4">
              Focus on <Text className="text-white font-bold">Time Under Tension</Text>. Match your glide to the orange bar for maximum results.
            </Text>
          </View>
        )}

        {!isWorkoutActive && (
          <View className="px-4 mt-8 mb-12">
            <Pressable
              onPress={() => router.push('/coach')}
              className="bg-green-600/10 border border-green-500/30 rounded-2xl p-5 flex-row items-center active:bg-green-600/20"
            >
              <View className="w-12 h-12 rounded-full bg-green-500 items-center justify-center">
                <ClipboardList size={24} color="#000" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-green-500 font-black text-lg">COACH'S ROUTINES</Text>
                <Text className="text-green-400/60 text-sm">Guided multi-set programs</Text>
              </View>
              <ChevronRight size={24} color="#22c55e" />
            </Pressable>
          </View>
        )}
      </ScrollView>

      <RepConfirmationModal
        visible={showConfirmModal}
        autoCount={pendingSetSummary?.repCount ?? 0}
        onConfirm={handleConfirmReps}
        onDismiss={() => { endSet(); setShowConfirmModal(false); setPendingSetSummary(null); }}
        onRedo={() => { adaptiveResetToIdle(); setShowConfirmModal(false); setPendingSetSummary(null); }}
        isLarge={largeDisplayMode}
        learningMsg={learningMsg}
      />
    </View>
  );
}
