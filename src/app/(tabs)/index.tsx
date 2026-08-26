import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Keyboard, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Target, Loader, Plus, Check, ClipboardList, TriangleAlert, RefreshCw, Mic, X, Sparkles } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useWorkoutStore } from '@/lib/workout/store';
import {
  DEFAULT_TIMED_SECONDS,
  categoryColor,
  getExerciseCategory
} from '@/lib/workout/categories';
import { FREE_STYLE_GROUP, TIMED_GROUP } from '@/lib/workout/constants';
import { INCLINE_LEVELS } from '@/lib/workout/types';

import { useHasFullAccess } from '@/lib/purchases';
import { useSettingsStore, useTextScaleSubscription, useTheme } from '@/lib/settings';
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
  const theme = useTheme();
  const valueColor = categoryColor(getExerciseCategory(value, customExercises));

  return (
    <View className="flex-1 mr-2 relative">
      <Text style={{ color: theme.subText }} className={`mb-1 tracking-wide ${isLarge ? 'text-xs' : 'text-sm'}`}>EXERCISE</Text>
      <Pressable
        onPress={onToggle}
        style={{ backgroundColor: theme.card }}
        className={`rounded-lg flex-row items-center justify-between ${isLarge ? 'px-3 py-3' : 'px-4 py-3'}`}
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
  const theme = useTheme();
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
    repModeUserSet ? repCountingMode : autoMode;
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

  const perfLevel = isFreestyle ? currentWeight : currentInclineLevel;
  const levelLabel = isFreestyle ? `${currentWeight} lb` : `Level ${currentInclineLevel}`;
  const lastPerformance = getLastPerformance(currentExercise, perfLevel);
  const targetReps = lastPerformance?.lastReps ?? 0;

  const currentExerciseColor = categoryColor(category);

  const closeDropdowns = () => {
    setExerciseDropdownOpen(false);
    setInclineDropdownOpen(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEnabled={!exerciseDropdownOpen && !inclineDropdownOpen}>
        {(exerciseDropdownOpen || inclineDropdownOpen) && (
          <Pressable
            onPress={closeDropdowns}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }}
          />
        )}

        {/* Header Buttons */}
        <View className="flex-row justify-between items-start px-3 pt-2">
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              if (isWorkoutActive) endWorkout();
              else if (!isAccessLoading) {
                if (!hasFullAccess) router.push('/unlock');
                else startWorkout();
              }
            }}
            hitSlop={{ top: 16, bottom: 20, left: 16, right: 0 }}
            className="active:opacity-70 flex-1 items-center py-2"
          >
            <Text allowFontScaling={false} className={`font-bold ${isWorkoutActive ? 'text-red-500' : 'text-green-500'} ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
              {isWorkoutActive ? 'END' : 'START'}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} className={`font-bold ${isWorkoutActive ? 'text-red-500' : 'text-green-500'} ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
              WORKOUT
            </Text>
          </Pressable>

          <View className="px-3">
            <RepModeToggle
              value={effectiveMode === 'voice' ? 'voice' : 'motion'}
              isLarge={largeDisplayMode}
              labelOverride={effectiveMode === 'timed' ? 'TIMED' : undefined}
              onToggle={() => {
                const nextMode = effectiveMode === 'voice' ? 'motion' : 'voice';
                setRepCountingMode(nextMode);
                remoteLog('rep_mode_toggled', { mode: nextMode, source: 'tracker' });
              }}
            />
          </View>

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              if (isSetActive) handleEndSet();
              else startSet();
            }}
            disabled={!isWorkoutActive}
            hitSlop={{ top: 16, bottom: 20, left: 0, right: 16 }}
            className="active:opacity-70 items-center flex-1 py-2"
          >
            <Text allowFontScaling={false} className={`font-bold text-center ${largeDisplayMode ? 'text-lg' : 'text-xl'} ${isWorkoutActive ? (isSetActive ? 'text-red-500' : 'text-green-500') : 'text-gray-600'}`}>
              {isSetActive ? 'END SET' : 'START NEXT'}
            </Text>
            {!isSetActive && (
              <Text allowFontScaling={false} className={`font-bold text-center ${largeDisplayMode ? 'text-lg' : 'text-xl'} ${isWorkoutActive ? 'text-green-500' : 'text-gray-600'}`}>
                SET
              </Text>
            )}
          </Pressable>
        </View>

        <View className="flex-row px-3 mt-3">
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
            <WeightInput value={currentWeight} onSelect={setCurrentWeight} isLarge={largeDisplayMode} />
          ) : !isTimed ? (
            <InclineDropdown
              value={currentInclineLevel}
              onSelect={setInclineLevel}
              isOpen={inclineDropdownOpen}
              onToggle={() => setInclineDropdownOpen(o => !o)}
              isLarge={largeDisplayMode}
            />
          ) : null}
        </View>

        {isSetActive && effectiveMode === 'motion' && !showSensorFailure && (
          <View className="mx-3 mt-3">
            {ignoreMotion ? (
              <View className="flex-row items-center justify-center bg-yellow-500/20 rounded-lg py-2 px-4">
                <Loader size={16} color="#eab308" />
                <Text numberOfLines={1} adjustsFontSizeToFit className={`text-yellow-500 ml-2 font-medium flex-shrink ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  Get into position{setupSecondsLeft > 0 ? `... ${setupSecondsLeft}s` : '...'}
                </Text>
              </View>
            ) : isLearningROM ? (
              <View className="flex-row items-center justify-center bg-blue-500/20 rounded-lg py-2 px-4">
                <Sparkles size={16} color="#60a5fa" />
                <Text numberOfLines={1} adjustsFontSizeToFit className={`text-blue-400 font-medium ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  Learning your movement pattern...
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/20 rounded-lg py-2 px-4">
                <Check size={16} color="#22c55e" />
                <Text className={`text-green-500 font-medium ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>Counting reps</Text>
              </View>
            )}
          </View>
        )}

        {isSetActive && effectiveMode === 'voice' && (
          <View className="mx-3 mt-3">
            {voiceError ? (
              <View className="flex-row items-center justify-center bg-red-500/20 rounded-lg py-2 px-4">
                <TriangleAlert size={16} color="#ef4444" />
                <Text numberOfLines={2} adjustsFontSizeToFit className={`text-red-400 font-medium text-center flex-shrink ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>{voiceError}</Text>
              </View>
            ) : isVoiceProcessing ? (
              <View className="flex-row items-center justify-center bg-blue-500/20 rounded-lg py-2 px-4">
                <Loader size={16} color="#60a5fa" />
                <Text className="text-blue-400 font-medium ml-2 text-lg">Listening...</Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/20 rounded-lg py-2 px-4">
                <Mic size={16} color="#22c55e" />
                <Text className="text-green-500 font-medium ml-2">Count your reps out loud</Text>
              </View>
            )}
          </View>
        )}

        {showSensorFailure && (
          <View className="mx-3 mt-3 bg-red-500/15 border border-red-500/40 rounded-lg py-3 px-4">
            <View className="flex-row items-center">
              <TriangleAlert size={16} color="#ef4444" />
              <Text className="text-red-400 font-bold ml-2">Motion counting unavailable</Text>
            </View>
            <Text className="text-red-300 mt-1 text-xs">Try restarting the app or switch to Voice.</Text>
            <Pressable onPress={restartMotionSensor} className="mt-2 flex-row items-center bg-red-500/20 self-start px-3 py-1.5 rounded-lg">
              <RefreshCw size={12} color="#ef4444" />
              <Text className="text-red-400 font-bold ml-1.5 text-xs">Restart Sensor</Text>
            </Pressable>
          </View>
        )}

        <View className="flex-row px-3 mt-3">
          {isTimed ? (
            <TimedExerciseRunner
              ref={timedRunnerRef}
              exercise={currentExercise}
              durationSeconds={timedSeconds}
              isSetActive={isSetActive}
              isLarge={largeDisplayMode}
              onSetDuration={(s) => setTimedDuration(currentExercise, s)}
              onFinalized={(h) => endTimedSet(h)}
            />
          ) : isPaceSetterMode ? (
            <Pressable className="flex-1 mr-2" onPress={() => setIsPaceSetterMode(false)}>
              <PaceSetterGauge size={largeDisplayMode ? 140 : 160} isActive={isSetActive} currentReps={currentReps} isLarge={largeDisplayMode} />
            </Pressable>
          ) : (
            <Pressable
              className={`flex-1 mr-2 border-2 border-orange-500 rounded-2xl p-3 items-center justify-center ${largeDisplayMode ? 'min-h-[140px]' : 'min-h-[160px]'}`}
              onPress={() => setIsPaceSetterMode(true)}
            >
              <Text className={`text-gray-500 tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>REPS</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit className={`text-orange-500 font-bold ${largeDisplayMode ? 'text-7xl' : 'text-8xl'}`}>{currentReps}</Text>
            </Pressable>
          )}

          <View className={`flex-1 ml-2 border-2 border-orange-500 rounded-2xl p-3 items-center justify-center ${largeDisplayMode ? 'min-h-[140px]' : 'min-h-[160px]'}`} style={{ backgroundColor: theme.card }}>
            <Text style={{ color: theme.subText }} className={`tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>SET</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: theme.text }} className={`font-bold ${largeDisplayMode ? 'text-7xl' : 'text-8xl'}`}>{currentSet}</Text>
          </View>
        </View>

        {!isTimed && (
          <Pressable onPress={() => setIsPaceSetterMode(!isPaceSetterMode)} className="mx-3 mt-2">
            <Text className={`text-gray-500 text-center ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>
              {isPaceSetterMode ? 'Tap Pace-Setter to return to Rep Counter' : 'Tap Rep Counter to switch to Pace-Setter Mode'}
            </Text>
          </Pressable>
        )}

        <View
          style={{
            backgroundColor: theme.card,
            borderColor: theme.border,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: theme.background === '#ffffff' ? 0.08 : 0,
            shadowRadius: 12,
            elevation: theme.background === '#ffffff' ? 3 : 0
          }}
          className="mx-3 mt-5 rounded-3xl p-4 border min-h-[140px] justify-center"
        >
          {targetReps === 0 ? (
            <View>
              <View className="flex-row justify-between items-center mb-4">
                <Text style={{ color: theme.subText }} className="font-bold tracking-widest text-xs uppercase">Last Performance</Text>
                <Target size={16} color={theme.subText} />
              </View>
              <Text style={{ color: theme.subText }} className="italic">No history yet for this exercise.</Text>
            </View>
          ) : (
            <View>
              <View className="mb-4">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 mr-4">
                    <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: theme.text }} className="font-bold tracking-tight text-xs uppercase">
                      Highest Reps on <Text className="text-orange-500 font-black">{currentExercise} {levelLabel}</Text>
                    </Text>
                    <Text style={{ color: theme.text }} className="font-bold tracking-tight text-xs uppercase mt-0.5">Let's Beat It!</Text>
                  </View>
                  <Target size={24} color="#f97316" />
                </View>
              </View>

              <View style={{ backgroundColor: theme.background === '#ffffff' ? '#e5e7eb' : '#1f2937', borderColor: 'rgba(0,0,0,0.05)' }} className={`rounded-xl flex-row items-center overflow-hidden ${largeDisplayMode ? 'h-12' : 'h-14'} border`}>
                {/* Progress Bar Fill: Target reps is now mapped to 70% width */}
                <LinearGradient
                  colors={currentReps > targetReps ? ['#22c55e', '#16a34a'] : ['#f97316', '#ea580c']}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  className="h-full rounded-l-lg"
                  style={{ width: `${Math.min(Math.max(0, (currentReps * 70) / (targetReps || 1)), 100)}%` }}
                />

                {/* Text overlay */}
                <View className="absolute inset-0 flex-row items-center justify-center">
                  <Text numberOfLines={1} style={{ color: theme.text }} className={`font-black ${largeDisplayMode ? 'text-xl' : 'text-2xl'}`}>
                    {currentReps} / {targetReps}
                  </Text>
                </View>

                {/* Target marker line fixed at 70% */}
                <View
                  className={`absolute w-0.5 ${largeDisplayMode ? 'h-8' : 'h-10'}`}
                  style={{ left: '70%', marginLeft: -1, backgroundColor: theme.text, opacity: 0.3 }}
                />
              </View>

              <View className="items-center mt-3">
                <Text style={{ color: theme.text }} className="font-black text-[9px] uppercase tracking-[0.3em] opacity-80">Every Rep Counts.</Text>
              </View>

              {currentReps > targetReps && (
                <View className="flex-row items-center justify-center mt-2.5 bg-green-500/10 py-1 rounded-full">
                  <Sparkles size={12} color="#22c55e" />
                  <Text className="text-green-500 font-bold ml-1.5 text-[10px] uppercase tracking-widest">New Personal Best!</Text>
                </View>
              )}
            </View>
          )}
        </View>
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
