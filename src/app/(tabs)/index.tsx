import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Keyboard, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Target, Loader, Plus, Check, ClipboardList, TriangleAlert, RefreshCw, Mic, X } from 'lucide-react-native';
import {
  useWorkoutStore,
  EXERCISE_GROUPS,
  INCLINE_LEVELS,
  FREE_STYLE_GROUP,
  TIMED_GROUP,
  CATEGORY_COLORS,
  categoryColor,
  getExerciseCategory,
  DEFAULT_TIMED_SECONDS,
} from '@/lib/workout';
import { useHasFullAccess } from '@/lib/purchases';
import { useSettingsStore, useTextScaleSubscription } from '@/lib/settings';
import { remoteLog } from '@/lib/remoteLog';
import { useAdaptiveRepStore } from '@/lib/motion';
import { useMotionContext } from '@/lib/motion';
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
  // Short "we adjusted the tracker" message shown in the confirm modal after a
  // correction. null = show the normal rep-entry UI.
  const [learningMsg, setLearningMsg] = useState<string | null>(null);
  const [setupSecondsLeft, setSetupSecondsLeft] = useState(0);

  const largeDisplayMode = useSettingsStore(s => s.largeDisplayMode);
  useTextScaleSubscription(); // re-render when global text size changes
  const repCountingMode = useSettingsStore(s => s.repCountingMode);
  const repModeUserSet = useSettingsStore(s => s.repModeUserSet);
  const setRepCountingMode = useSettingsStore(s => s.setRepCountingMode);
  const motionSensitivity = useSettingsStore(s => s.motionSensitivity);
  const paceSettings = useSettingsStore(s => s.paceSettings);
  const loadSettings = useSettingsStore(s => s.loadFromStorage);

  const sensitivityMultiplierMap = { low: 1.5, medium: 1.0, high: 0.6 } as const;

  // The accelerometer is only "in motion" for a fraction of a rep (the start &
  // end accelerations), so motion-duration is a poor rep length — for short-ROM
  // moves like Calf Raises it's only ~100ms even when paced slowly. So duration
  // is just a tiny jitter filter; the real anti-double-count gate is the cooldown
  // (minimum time between two counted reps), derived from the user's pace.
  const jitterFloorMsMap = { low: 140, medium: 100, high: 70 } as const;
  const cooldownFloorMsMap = { low: 1000, medium: 700, high: 450 } as const;

  // A real rep on this machine is a push-OUT then a pull-BACK. The accelerometer
  // sees both strokes as equally strong bursts (it only measures magnitude, not
  // direction), so ONE physical rep produces TWO bursts — the return-stroke lands
  // ~halfway through the rep. The cooldown (minimum time between two counted reps)
  // is what collapses that return-stroke into the same rep. It must therefore sit
  // BETWEEN the return-stroke (~50% of a rep) and the next rep (~100%): we gate at
  // ~85% of the expected rep length. Earlier this was 55%, which sat right on top
  // of the return-stroke and let it through whenever a user's real reps ran longer
  // than their configured pace — counting each rep twice. Never below the
  // sensitivity floor (covers fast or unset pace).
  const expectedRepMs = (paceSettings.liftTime + paceSettings.holdTime + paceSettings.downTime) * 1000;
  const minRepDurationMs = jitterFloorMsMap[motionSensitivity];
  // Base cooldown from pace + sensitivity. The per-exercise learned factor (from
  // the user's confirmation corrections) is applied to this further below, once
  // currentExercise/currentInclineLevel are available.
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

  // Which category the current exercise belongs to, and the "effective" rep
  // mode it forces: Free Style is always voice-counted; Timed runs a countdown
  // (no rep counting at all); everything else follows the user's chosen mode.
  //
  // Once the user has picked a mode by hand (repModeUserSet — set by EITHER the
  // Tracker toggle or the App Settings switch, which share repCountingMode),
  // that pick beats the automatic selection — e.g. Motion on a Free Style
  // exercise. Timed is the one exception: those exercises count seconds, not
  // reps, so there's nothing for the toggle to switch between.
  const category = getExerciseCategory(currentExercise, customExercises);
  const autoMode: 'motion' | 'voice' | 'timed' =
    category === 'timed' ? 'timed' : category === 'freestyle' ? 'voice' : repCountingMode;
  const effectiveMode: 'motion' | 'voice' | 'timed' =
    autoMode === 'timed' ? 'timed' : repModeUserSet ? repCountingMode : autoMode;
  const isTimed = category === 'timed';
  // Free Style exercises use a Weight pad (lbs) in place of the incline picker.
  const isFreestyle = category === 'freestyle';
  const timedSeconds = timedDurations[currentExercise] ?? DEFAULT_TIMED_SECONDS;
  const timedRunnerRef = useRef<TimedRunnerHandle>(null);

  // Adaptive rep counter store
  const adaptiveSetState = useAdaptiveRepStore(s => s.setState);
  const adaptiveRepCount = useAdaptiveRepStore(s => s.repCount);
  const adaptiveSetStartTime = useAdaptiveRepStore(s => s.setStartTime);
  const ignoreMotion = useAdaptiveRepStore(s => s.ignoreMotion);
  const repState = useAdaptiveRepStore(s => s.repState);
  const isLearningROM = useAdaptiveRepStore(s => s.isLearningROM);
  const adaptiveStartSet = useAdaptiveRepStore(s => s.startSet);
  const adaptiveEndSet = useAdaptiveRepStore(s => s.endSet);
  const adaptiveProcessMotion = useAdaptiveRepStore(s => s.processMotion);
  const applyUserOverride = useAdaptiveRepStore(s => s.applyUserOverride);
  const loadAdaptiveProfiles = useAdaptiveRepStore(s => s.loadFromStorage);

  // Cooldown multiplier learned from this user's past confirmation corrections
  // for THIS exercise + incline. Defaults to 1 (no change) until they correct a
  // count. Over-counts push it up (longer gap → kills double-counts); under-counts
  // pull it down. This is what makes corrections actually self-correct over time.
  const learnedCooldownFactor = useAdaptiveRepStore(s => {
    const f = s.cooldownAdjustments[`${currentExercise}::${currentInclineLevel}`]?.factor;
    return typeof f === 'number' && isFinite(f) ? f : 1;
  });
  const repCooldownMs = Math.min(4000, Math.max(250, Math.round(baseRepCooldownMs * learnedCooldownFactor)));

  // Motion context for raw sensor data
  const {
    motion,
    isListening,
    diagnostics: motionDiagnostics,
    restart: restartMotionSensor,
  } = useMotionContext();

  // Voice counting - callback when a rep number is heard
  const handleVoiceRepCounted = useCallback((repNumber: number) => {
    console.log('[VOICE] Setting reps to:', repNumber);
    setReps(repNumber);
  }, [setReps]);

  // Voice counting hook
  const {
    isListening: isVoiceListening,
    isProcessing: isVoiceProcessing,
    error: voiceError,
    startListening: startVoiceListening,
    stopListening: stopVoiceListening,
    resetCount: resetVoiceCount,
  } = useVoiceCounting(handleVoiceRepCounted, isSetActive && effectiveMode === 'voice');

  // Switching exercises starts a fresh count. The workout store already resets
  // currentReps to 0, but the voice counter tracks its own "last number heard"
  // and only advances to higher numbers — without this reset it would ignore
  // every rep on the new exercise until you passed the old exercise's count.
  const prevExerciseRef = useRef(currentExercise);
  useEffect(() => {
    if (prevExerciseRef.current !== currentExercise) {
      prevExerciseRef.current = currentExercise;
      resetVoiceCount();
    }
  }, [currentExercise, resetVoiceCount]);

  // Auto-start/stop voice listening when set starts/ends
  useEffect(() => {
    if (effectiveMode === 'voice') {
      // Don't (re)start the mic while the confirmation modal is open — the set
      // is effectively over and we're just waiting on the user to confirm.
      if (isSetActive && !isVoiceListening && !showConfirmModal) {
        startVoiceListening();
      } else if ((!isSetActive || showConfirmModal) && isVoiceListening) {
        stopVoiceListening();
      }
    }
  }, [isSetActive, effectiveMode, isVoiceListening, showConfirmModal, startVoiceListening, stopVoiceListening]);

  // Load data on mount
  useEffect(() => {
    loadFromStorage();
    loadSettings();
    loadAdaptiveProfiles();
  }, []);

  // Sync adaptive rep count to workout store
  useEffect(() => {
    if (effectiveMode === 'motion' && isSetActive && adaptiveSetState === 'SET_ACTIVE') {
      setReps(adaptiveRepCount);
    }
  }, [adaptiveRepCount, effectiveMode, isSetActive, adaptiveSetState, setReps]);

  // Handle adaptive set state changes (start/end)
  useEffect(() => {
    if (effectiveMode !== 'motion') return;

    // Start adaptive set when workout set starts and adaptive is idle
    // NOTE: Don't start if SET_ENDED - let the auto-end handler process it first
    // Don't auto-start a new set while the confirm modal is still pending —
    // otherwise a phantom set spins up in the background and the next tap "ends" it.
    if (isSetActive && adaptiveSetState === 'SET_IDLE' && !showConfirmModal) {
      console.log('[TRACKER] Starting adaptive set, previous state:', adaptiveSetState);
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

  // Process motion data for adaptive counter
  useEffect(() => {
    if (!isSetActive || !isListening || adaptiveSetState !== 'SET_ACTIVE' || effectiveMode !== 'motion') return;

    const { x, y, z } = motion.accelerationIncludingGravity;

    // Calculate acceleration magnitude
    const accelMagnitude = Math.sqrt(x * x + y * y + z * z);

    adaptiveProcessMotion(accelMagnitude);
  }, [motion, isSetActive, isListening, adaptiveSetState, effectiveMode, adaptiveProcessMotion]);

  // Tick the "get into position" countdown while the set is stabilizing
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

  // ---- Motion sensor health -------------------------------------------------
  // Motion counting used to fail completely silently: on Android devices without
  // a gyroscope the sensor never started, so the countdown ran, "Get into
  // position" stayed on screen forever and the rep count sat at zero with no
  // explanation. The sensor layer now reports its own health; here we turn an
  // unhealthy sensor into something the user can actually see and act on.
  //
  // The 2s grace period stops the banner flashing during the normal startup
  // probe or a brief stall right after the app returns from the background.
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

  // Log it once per occurrence so a device that can't count reps is visible in
  // the logs, not just on the user's screen.
  const sensorFailureLoggedRef = useRef(false);
  useEffect(() => {
    if (!showSensorFailure) {
      sensorFailureLoggedRef.current = false;
      return;
    }
    if (sensorFailureLoggedRef.current) return;
    sensorFailureLoggedRef.current = true;
    remoteLog('motion_counting_unavailable', {
      source: motionDiagnostics.source,
      deviceMotionAvailable: motionDiagnostics.deviceMotionAvailable,
      accelerometerAvailable: motionDiagnostics.accelerometerAvailable,
      sampleRateHz: motionDiagnostics.sampleRateHz,
      duringActiveSet: isSetActive,
    });
  }, [showSensorFailure, motionDiagnostics, isSetActive]);

  const sensorFailureMessage =
    motionDiagnostics.error ??
    (motionDiagnostics.source === 'none'
      ? "This device isn't reporting any motion data, so reps can't be counted."
      : "The motion sensor stopped sending data, so reps aren't being counted.");

  // One-line technical summary, shown under the warning so the cause is
  // visible on the device itself instead of only in the logs.
  const sensorDetailLine = [
    `sensor: ${motionDiagnostics.source}`,
    `${motionDiagnostics.sampleRateHz} Hz`,
    motionDiagnostics.deviceMotionAvailable === false ? 'no device-motion' : null,
    motionDiagnostics.accelerometerAvailable === false ? 'no accelerometer' : null,
    motionDiagnostics.restartCount > 0 ? `${motionDiagnostics.restartCount} retries` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Handle auto-end from adaptive store (inactivity timeout)
  const autoEndHandled = React.useRef(false);
  const adaptiveResetToIdle = useAdaptiveRepStore(s => s.resetToIdle);

  useEffect(() => {
    if (adaptiveSetState === 'SET_ENDED' && isSetActive && effectiveMode === 'motion' && !autoEndHandled.current) {
      console.log('[TRACKER] Adaptive store auto-ended set');
      autoEndHandled.current = true;

      // Always show confirmation modal for auto-ended sets
      const currentRepCount = adaptiveRepCount;
      setPendingSetSummary({ repCount: currentRepCount, needsConfirmation: true });
      setShowConfirmModal(true);

      // Don't call endSet() yet — wait for user to confirm count
      // Reset adaptive store to idle so next set can start
      adaptiveResetToIdle();
    }
    // Reset the flag when set becomes inactive
    if (!isSetActive) {
      autoEndHandled.current = false;
    }
  }, [adaptiveSetState, isSetActive, effectiveMode, endSet, adaptiveRepCount, adaptiveResetToIdle]);

  // Handle set end with confirmation modal
  const handleEndSet = useCallback(() => {
    remoteLog('set_ended', { exercise: currentExercise, incline: currentInclineLevel, reps: currentReps, mode: effectiveMode });
    if (effectiveMode === 'timed') {
      // Hand off to the timed runner, which stops the countdown and reports the
      // held seconds via onFinalized (which records & ends the set).
      timedRunnerRef.current?.finalize();
      return;
    }
    if (effectiveMode === 'motion') {
      const summary = adaptiveEndSet();

      // Always show confirmation modal for motion counting
      if (summary.repCount >= 0) {
        setPendingSetSummary(summary);
        setShowConfirmModal(true);
        return; // Don't save the set yet — wait for user to confirm count
      }
    } else if (effectiveMode === 'voice') {
      // Stop the mic. If Whisper is already processing a chunk (e.g. the user
      // just said "ten"), we wait for it to finish before showing the summary
      // modal. Otherwise the summary "snapshot" would miss that final rep.
      stopVoiceListening();

      if (isVoiceProcessing) {
        console.log('[VOICE] Delaying summary modal until final transcription finishes...');
        setIsWaitingForVoiceToEndSet(true);
      } else {
        setPendingSetSummary({ repCount: currentReps, needsConfirmation: true });
        setShowConfirmModal(true);
      }
      return; // Don't save the set yet — wait for user to confirm count
    }
    endSet();
  }, [effectiveMode, adaptiveEndSet, endSet, currentReps, currentExercise, currentInclineLevel, stopVoiceListening, isVoiceProcessing]);

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

  // Called by the timed runner when a hold completes (timer done, "Done", or
  // END SET). Records the held seconds as a timed set.
  const handleTimedFinalized = useCallback((heldSeconds: number) => {
    endTimedSet(heldSeconds);
  }, [endTimedSet]);

  // Handle confirmation modal response
  const handleConfirmReps = useCallback((confirmedCount: number) => {
    remoteLog('set_confirmed', { exercise: currentExercise, incline: currentInclineLevel, reps: confirmedCount, mode: effectiveMode });

    // Self-contained accuracy record: the tracker's auto count vs. what the user
    // confirmed, in one event. Logged for EVERY confirmation (including perfect
    // ones, delta 0) so the accuracy dashboard isn't skewed pessimistic. delta =
    // confirmed - auto: >0 the tracker under-counted, <0 it over-counted.
    if (pendingSetSummary) {
      const auto = pendingSetSummary.repCount;
      remoteLog('rep_accuracy', {
        exercise: currentExercise,
        incline: currentInclineLevel,
        mode: effectiveMode,
        auto,
        confirmed: confirmedCount,
        delta: confirmedCount - auto,
      });
    }

    // Apply the confirmed count BEFORE saving the set
    setReps(confirmedCount);

    let feedback: string | null = null;
    if (effectiveMode === 'motion' && pendingSetSummary && confirmedCount !== pendingSetSummary.repCount) {
      // User corrected the count - apply learning for future motion sets. The
      // result tells us which way (and how hard) we nudged, so we can show the
      // user that the tracker is actually adapting for this exercise.
      const result = applyUserOverride(currentExercise, currentInclineLevel, confirmedCount);
      if (result.adjusted) {
        const name = currentExercise?.trim() || 'this exercise';
        if (result.direction === 'tighter') {
          feedback = result.strong
            ? `That was a few too many on ${name} — I'll count noticeably tighter next time.`
            : `I'll count ${name} a little tighter next time.`;
        } else {
          feedback = result.strong
            ? `I missed a few ${name} reps — I'll catch a lot more next time.`
            : `I'll catch more of your ${name} reps next time.`;
        }
      }
    }

    endSet(); // Now save the set with the confirmed rep count

    if (feedback) {
      // Keep the modal open in its "learning" state; it auto-closes shortly.
      setLearningMsg(feedback);
    } else {
      setShowConfirmModal(false);
      setPendingSetSummary(null);
    }
  }, [pendingSetSummary, currentExercise, currentInclineLevel, applyUserOverride, setReps, endSet, effectiveMode]);

  // Close the modal once the learning-feedback beat is over.
  const handleFinishFeedback = useCallback(() => {
    setShowConfirmModal(false);
    setPendingSetSummary(null);
    setLearningMsg(null);
  }, []);

  const handleDismissModal = useCallback(() => {
    endSet(); // Save with the auto-counted reps
    setShowConfirmModal(false);
    setPendingSetSummary(null);
    setLearningMsg(null);
  }, [endSet]);

  // Free Style history keys on the weight (stored in the inclineLevel slot);
  // everything else keys on the incline level.
  const perfLevel = isFreestyle ? currentWeight : currentInclineLevel;
  const levelLabel = isFreestyle ? `${currentWeight} lb` : `Level ${currentInclineLevel}`;
  const lastPerformance = getLastPerformance(currentExercise, perfLevel);
  const targetReps = lastPerformance?.lastReps ?? 0;

  // Best previous hold (seconds) for the current Timed exercise, from history.
  const bestHoldSeconds = React.useMemo(() => {
    if (!isTimed) return 0;
    let best = 0;
    for (const w of workoutHistory) {
      for (const s of w.sets) {
        if (s.kind === 'timed' && s.exercise === currentExercise) {
          best = Math.max(best, s.durationSeconds ?? 0);
        }
      }
    }
    return best;
  }, [isTimed, workoutHistory, currentExercise]);

  const closeDropdowns = () => {
    setExerciseDropdownOpen(false);
    setInclineDropdownOpen(false);
  };

  // Determine status indicator
  const isStabilizing = ignoreMotion && adaptiveSetState === 'SET_ACTIVE' && effectiveMode === 'motion';
  const showLearningIndicator = isLearningROM && adaptiveSetState === 'SET_ACTIVE' && effectiveMode === 'motion';

  return (
    // NOTE: the screen root is a plain View, NOT a Pressable. Wrapping the
    // ScrollView in a Pressable made it fight the scroll gesture and get stranded
    // in an overscrolled position (couldn't swipe back down — worst on the short
    // Timed screen). Instead we close open dropdowns by scrolling or by tapping
    // the transparent overlay below, which only exists while a dropdown is open.
    <View className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!exerciseDropdownOpen && !inclineDropdownOpen}
      >
        {/* Tap-catcher: closes an open dropdown on a tap anywhere else. Mounted
            only while a dropdown is open (so it never interferes with scrolling)
            and layered below the dropdown row (z-50) but above the rest. */}
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
              if (isWorkoutActive) {
                endWorkout();
              } else if (isAccessLoading) {
                // Access check hasn't resolved yet (query still fetching on
                // launch). Don't wrongly bounce an entitled user to the paywall —
                // just wait; they can tap again once it settles a moment later.
                return;
              } else if (!hasFullAccess) {
                // Model B: users can browse the app, but starting a workout
                // requires a Glideboard Pro subscription. Send them to the paywall.
                router.push('/unlock');
              } else {
                startWorkout();
              }
            }}
            // No slop on the inner (right) edge — it used to reach 24px toward
            // the centre control and swallow taps meant for it.
            hitSlop={{ top: 16, bottom: 20, left: 16, right: 0 }}
            className="active:opacity-70 flex-1 items-center py-2"
          >
            <Text
              allowFontScaling={false}
              className={`font-bold ${isWorkoutActive ? 'text-red-500' : 'text-green-500'} ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}
            >
              {isWorkoutActive ? 'END' : 'START'}
            </Text>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              className={`font-bold ${isWorkoutActive ? 'text-red-500' : 'text-green-500'} ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}
            >
              WORKOUT
            </Text>
          </Pressable>

          {/* Motion ⇄ Voice counting toggle. Replaces the old Settings gear
              (App Settings is still reachable from the Profile tab) — the gear
              sat too close to START NEXT SET and was being mis-tapped. */}
          <View className="px-3">
            <RepModeToggle
              value={effectiveMode === 'voice' ? 'voice' : 'motion'}
              disabled={isTimed}
              disabledLabel="TIMED"
              isLarge={largeDisplayMode}
              onToggle={() => {
                // Whatever mode is showing, tapping flips to the other one. This
                // writes the SAME setting the App Settings switch uses, so both
                // toggles always agree and the most recent tap wins.
                setRepCountingMode(effectiveMode === 'voice' ? 'motion' : 'voice');
              }}
            />
          </View>

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              console.log('[BUTTON] Start/End Set pressed. isSetActive:', isSetActive, 'isWorkoutActive:', isWorkoutActive);
              if (isSetActive) {
                handleEndSet();
              } else {
                startSet();
              }
            }}
            disabled={!isWorkoutActive}
            // As above: no slop on the inner (left) edge, so the centre toggle
            // keeps its own tap area.
            hitSlop={{ top: 16, bottom: 20, left: 0, right: 16 }}
            className="active:opacity-70 items-center flex-1 py-2"
          >
            <Text
              allowFontScaling={false}
              className={`font-bold text-center ${largeDisplayMode ? 'text-lg' : 'text-xl'} ${
                isWorkoutActive
                  ? isSetActive
                    ? 'text-red-500'
                    : 'text-green-500'
                  : 'text-gray-600'
              }`}
            >
              {isSetActive ? 'END SET' : 'START NEXT'}
            </Text>
            {!isSetActive && (
              <Text
                allowFontScaling={false}
                className={`font-bold text-center ${largeDisplayMode ? 'text-lg' : 'text-xl'} ${
                  isWorkoutActive ? 'text-green-500' : 'text-gray-600'
                }`}
              >
                SET
              </Text>
            )}
          </Pressable>
        </View>

        {/* Dropdowns */}
        <View className="flex-row px-3 mt-3">
          <ExerciseDropdown
            value={currentExercise}
            onSelect={setExercise}
            isOpen={exerciseDropdownOpen}
            isLarge={largeDisplayMode}
            customExercises={customExercises}
            onAddCustom={addCustomExercise}
            onRenameCustom={renameCustomExercise}
            onOpenCoach={() => router.push('/coach')}
            onToggle={() => {
              setExerciseDropdownOpen(!exerciseDropdownOpen);
              setInclineDropdownOpen(false);
            }}
          />
          {/* Free Style tracks WEIGHT (lbs) via a number pad; Timed holds show
              nothing (incline is irrelevant); everything else uses the incline
              picker. */}
          {isFreestyle ? (
            <WeightInput
              value={currentWeight}
              onSelect={setCurrentWeight}
              isLarge={largeDisplayMode}
            />
          ) : !isTimed ? (
            <InclineDropdown
              value={currentInclineLevel}
              onSelect={setInclineLevel}
              isOpen={inclineDropdownOpen}
              isLarge={largeDisplayMode}
              onToggle={() => {
                setInclineDropdownOpen(!inclineDropdownOpen);
                setExerciseDropdownOpen(false);
              }}
            />
          ) : null}
        </View>

        {/* Motion sensor failure. Deliberately shown even when no set is
            running, so the user finds out BEFORE doing a set that won't
            count — and gets a one-tap escape to Voice counting. */}
        {effectiveMode === 'motion' && showSensorFailure && (
          <View className="mx-3 mt-3 bg-red-500/15 border border-red-500/40 rounded-lg py-3 px-4">
            <View className="flex-row items-center">
              <TriangleAlert size={16} color="#f87171" />
              <Text className={`text-red-400 font-bold ml-2 flex-shrink ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                Motion counting isn't working
              </Text>
            </View>
            <Text className={`text-red-300/90 mt-1 ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>
              {sensorFailureMessage}
            </Text>
            <Text className="text-red-300/50 mt-1 text-xs">{sensorDetailLine}</Text>
            <View className="flex-row mt-3">
              <Pressable
                onPress={() => { restartMotionSensor(); }}
                hitSlop={8}
                className="flex-row items-center bg-red-500/25 rounded-lg px-3 py-2 mr-2 active:opacity-70"
              >
                <RefreshCw size={14} color="#fca5a5" />
                <Text className="text-red-200 font-semibold ml-1.5 text-sm">Retry sensor</Text>
              </Pressable>
              <Pressable
                onPress={() => { setRepCountingMode('voice'); }}
                hitSlop={8}
                className="flex-row items-center bg-blue-500/25 rounded-lg px-3 py-2 active:opacity-70"
              >
                <Mic size={14} color="#93c5fd" />
                <Text className="text-blue-200 font-semibold ml-1.5 text-sm">Use voice instead</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Status Indicator */}
        {isSetActive && effectiveMode === 'motion' && !showSensorFailure && (
          <View className="mx-3 mt-3">
            {isStabilizing ? (
              <View className="flex-row items-center justify-center bg-yellow-500/20 rounded-lg py-2 px-4">
                <Loader size={16} color="#eab308" />
                <Text numberOfLines={1} adjustsFontSizeToFit className={`text-yellow-500 ml-2 font-medium flex-shrink ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  Get into position{setupSecondsLeft > 0 ? `... ${setupSecondsLeft}s` : '...'}
                </Text>
              </View>
            ) : showLearningIndicator ? (
              <View className="flex-row items-center justify-center bg-blue-500/20 rounded-lg py-2 px-4">
                <Text numberOfLines={1} adjustsFontSizeToFit className={`text-blue-400 font-medium ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  Learning your movement pattern...
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/20 rounded-lg py-2 px-4">
                <Text className={`text-green-500 font-medium ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  Counting reps
                </Text>
                {/* Name the sensor when we're on the fallback, so it's obvious
                    which path is live if counting behaves differently. */}
                {motionDiagnostics.source === 'accelerometer' && (
                  <Text className="text-green-600/70 ml-2 text-xs">accelerometer</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Voice Status Indicator */}
        {isSetActive && effectiveMode === 'voice' && (
          <View className="mx-3 mt-3">
            {voiceError ? (
              <View className="flex-row items-center justify-center bg-red-500/20 rounded-lg py-2 px-4">
                <Text numberOfLines={2} adjustsFontSizeToFit className={`text-red-400 font-medium text-center flex-shrink ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  {voiceError}
                </Text>
              </View>
            ) : isVoiceProcessing ? (
              <View className="flex-row items-center justify-center bg-blue-500/20 rounded-lg py-2 px-4">
                <Loader size={16} color="#60a5fa" />
                <Text numberOfLines={1} className={`text-blue-400 ml-2 font-medium ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  Counting your voice...
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center bg-green-500/20 rounded-lg py-2 px-4">
                <Text className={`text-green-500 font-medium ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  Listening — count your reps out loud
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Timed Status Indicator */}
        {isSetActive && isTimed && (
          <View className="mx-3 mt-3">
            <View className="flex-row items-center justify-center rounded-lg py-2 px-4" style={{ backgroundColor: 'rgba(168,85,247,0.18)' }}>
              <Text numberOfLines={1} adjustsFontSizeToFit className={`font-medium flex-shrink ${largeDisplayMode ? 'text-sm' : 'text-base'}`} style={{ color: CATEGORY_COLORS.timed }}>
                Say “Start” to begin • “Stop” to stop early
              </Text>
            </View>
          </View>
        )}

        {/* Reps/Pace-Setter/Timer and Set Counter */}
        <View className="flex-row px-3 mt-3">
          {/* Timed exercises replace the rep counter with a live countdown. */}
          {isTimed ? (
            <TimedExerciseRunner
              ref={timedRunnerRef}
              exercise={currentExercise}
              durationSeconds={timedSeconds}
              isSetActive={isSetActive}
              isLarge={largeDisplayMode}
              onSetDuration={(s) => setTimedDuration(currentExercise, s)}
              onFinalized={handleTimedFinalized}
            />
          ) : isPaceSetterMode ? (
            <Pressable
              className="flex-1 mr-2"
              onPress={() => setIsPaceSetterMode(false)}
            >
              <PaceSetterGauge
                isActive={isSetActive}
                currentReps={currentReps}
                isLarge={largeDisplayMode}
              />
            </Pressable>
          ) : (
            <Pressable
              className={`flex-1 mr-2 border-2 border-orange-500 rounded-2xl p-3 items-center justify-center ${largeDisplayMode ? 'min-h-[140px]' : 'min-h-[160px]'}`}
              onPress={() => setIsPaceSetterMode(true)}
            >
              <Text numberOfLines={1} className={`text-gray-500 tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>REPS</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit className={`text-orange-500 font-bold ${largeDisplayMode ? 'text-7xl' : 'text-8xl'}`}>{currentReps}</Text>
            </Pressable>
          )}

          {/* Set */}
          <View className={`flex-1 ml-2 bg-gray-900 border-2 border-orange-500 rounded-2xl p-3 items-center justify-center ${largeDisplayMode ? 'min-h-[140px]' : 'min-h-[160px]'}`}>
            <Text numberOfLines={1} className={`text-gray-500 tracking-wide ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>SET</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit className={`text-white font-bold ${largeDisplayMode ? 'text-7xl' : 'text-8xl'}`}>{currentSet}</Text>
          </View>
        </View>

        {/* Toggle Hint Text (rep/pace only — not applicable to Timed) */}
        {!isTimed && (
          <Pressable
            onPress={() => setIsPaceSetterMode(!isPaceSetterMode)}
            className="mx-3 mt-2"
          >
            <Text className={`text-gray-500 text-center ${largeDisplayMode ? 'text-xs' : 'text-sm'}`}>
              {isPaceSetterMode
                ? 'Tap Pace-Setter to return to Rep Counter'
                : 'Tap Rep Counter to switch to Pace-Setter Mode'}
            </Text>
          </Pressable>
        )}

        {/* Timed: Best-Hold card instead of the rep-based Last Performance. */}
        {isTimed ? (
          <View className="mx-3 mt-5 bg-gray-900 rounded-2xl p-4">
            <Text className={`text-white ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
              <Text className="font-semibold" style={{ color: CATEGORY_COLORS.timed }}>{currentExercise}</Text>
              {' — timed'}
            </Text>
            {bestHoldSeconds > 0 ? (
              <View className="flex-row items-center mt-2">
                <Target size={largeDisplayMode ? 16 : 18} color={CATEGORY_COLORS.timed} />
                <Text className={`text-white ml-2 flex-1 ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
                  Best time:{' '}
                  <Text className="font-bold">
                    {bestHoldSeconds >= 60
                      ? `${Math.floor(bestHoldSeconds / 60)}:${String(bestHoldSeconds % 60).padStart(2, '0')}`
                      : `${bestHoldSeconds}s`}
                  </Text>
                  . Beat it!
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center justify-center mt-2">
                <Text className={largeDisplayMode ? 'text-base' : 'text-lg'}>⏱️</Text>
                <Text className={`text-gray-400 ml-2 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>
                  Set your time, then start your first set!
                </Text>
              </View>
            )}
          </View>
        ) : (
        /* Last Performance Card */
        <View className="mx-3 mt-5 bg-gray-900 rounded-2xl p-4">
          {targetReps === 0 ? (
            // First time doing this exercise at this level
            <>
              <Text className={`text-white ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
                First time doing{' '}
                <Text className="text-orange-500 font-semibold">
                  {currentExercise}, {levelLabel}
                </Text>
              </Text>
              {/* Progress Bar - shows 0 reps */}
              <View className={`mt-3 bg-gray-800 rounded-lg flex-row items-center justify-center overflow-hidden ${largeDisplayMode ? 'h-10' : 'h-12'}`}>
                <Text className={`text-white font-medium ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
                  {currentReps} reps
                </Text>
              </View>

              <View className="flex-row items-center justify-center mt-2">
                <Text className={largeDisplayMode ? 'text-base' : 'text-lg'}>💪</Text>
                <Text className={`text-gray-400 ml-2 ${largeDisplayMode ? 'text-sm' : 'text-base'}`}>Every rep counts!</Text>
              </View>
            </>
          ) : (
            // Has previous record
            <>
              <Text className={`text-white ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
                Last time on{' '}
                <Text className="text-orange-500 font-semibold">
                  {currentExercise}, {levelLabel}
                </Text>
              </Text>
              <View className="flex-row items-center mt-1">
                <Target size={largeDisplayMode ? 16 : 18} color="#f97316" />
                <Text className={`text-white ml-2 flex-1 ${largeDisplayMode ? 'text-base' : 'text-lg'}`}>
                  you did <Text className="font-bold">{targetReps}</Text> reps. Beat it!
                </Text>
              </View>

              {/* Progress Bar */}
              {(() => {
                const exceededTarget = currentReps > targetReps;
                const fillPercent = Math.min((currentReps / targetReps) * 100, 110);
                const barColor = exceededTarget ? 'bg-green-500' : 'bg-orange-500';

                return (
                  <View className={`mt-3 bg-gray-800 rounded-lg flex-row items-center overflow-hidden ${largeDisplayMode ? 'h-10' : 'h-12'}`}>
                    {/* Fill */}
                    <View
                      className={`h-full ${barColor} rounded-l-lg`}
                      style={{ width: `${fillPercent}%` }}
                    />
                    {/* Text overlay */}
                    <View className="absolute inset-0 flex-row items-center justify-center">
                      <Text numberOfLines={1} className={`text-white font-medium ${largeDisplayMode ? 'text-lg' : 'text-xl'}`}>
                        {currentReps} / {targetReps}
                      </Text>
                    </View>
                    {/* Target marker line */}
                    <View
                      className={`absolute w-0.5 bg-white ${largeDisplayMode ? 'h-6' : 'h-8'}`}
                      style={{ right: 16 }}
                    />
                  </View>
                );
              })()}
            </>
          )}
        </View>
        )}
      </ScrollView>

      {/* Rep Confirmation Modal */}
      <RepConfirmationModal
        visible={showConfirmModal}
        autoCount={pendingSetSummary?.repCount ?? 0}
        onConfirm={handleConfirmReps}
        onDismiss={handleDismissModal}
        learningMessage={learningMsg}
        onFinishFeedback={handleFinishFeedback}
        isLarge={largeDisplayMode}
      />
    </View>
  );
}
