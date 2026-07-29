import React, {
  useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef,
} from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Play, Square, Clock } from 'lucide-react-native';
import { useCoachSounds } from '@/lib/sound/useCoachSounds';
import { useVoiceCommands, type VoiceCommand } from '@/lib/voice';
import { TIMED_DURATION_OPTIONS, categoryColor } from '@/lib/workout';
import { remoteLog } from '@/lib/remoteLog';

const PURPLE = categoryColor('timed');

export interface TimedRunnerHandle {
  // Called by the parent's END SET button to stop a hold in progress.
  finalize: () => void;
}

type Phase = 'idle' | 'armed' | 'running';

interface Props {
  exercise: string;
  durationSeconds: number;
  isSetActive: boolean;
  isLarge: boolean;
  onSetDuration: (seconds: number) => void;
  // Reports the held seconds when a hold completes (naturally, by voice "Done",
  // or by the END SET button). The parent records the set and ends it.
  onFinalized: (heldSeconds: number) => void;
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
}

export const TimedExerciseRunner = forwardRef<TimedRunnerHandle, Props>(function TimedExerciseRunner(
  { exercise, durationSeconds, isSetActive, isLarge, onSetDuration, onFinalized },
  ref
) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(durationSeconds);

  const { playMarker, playTick, playWhistle } = useCoachSounds();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAtRef = useRef(0);
  const lastRemainingRef = useRef(durationSeconds);
  const finalizingRef = useRef(false);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Emit the correct cue for a given remaining-seconds boundary.
  const cueForRemaining = useCallback((r: number) => {
    if (r <= 0) {
      playWhistle();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (r <= 10) {
      playTick();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (r % 10 === 0) {
      playMarker();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [playMarker, playTick, playWhistle]);

  const finish = useCallback((heldSeconds: number, natural: boolean) => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;
    clearTimer();
    if (natural) {
      cueForRemaining(0); // whistle
    } else {
      // Early stop ("Stop" / END SET): a soft marker to acknowledge, not the
      // full time's-up whistle.
      playMarker();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    remoteLog('timed_finish', { exercise, held: heldSeconds, natural });
    onFinalized(heldSeconds);
  }, [clearTimer, cueForRemaining, playMarker, onFinalized, exercise]);

  const beginRun = useCallback(() => {
    if (phaseRef.current === 'running') return;
    finalizingRef.current = false;
    startAtRef.current = Date.now();
    lastRemainingRef.current = durationSeconds;
    setRemaining(durationSeconds);
    setPhase('running');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    remoteLog('timed_start', { exercise, duration: durationSeconds });

    clearTimer();
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startAtRef.current) / 1000;
      const r = Math.max(0, Math.ceil(durationSeconds - elapsed));
      if (r !== lastRemainingRef.current) {
        // Fire a cue for every second-boundary we crossed (guards against a slow
        // tick skipping a second). We stop at 1 — the zero cue (the whistle) is
        // owned by finish() so it never double-fires.
        for (let x = lastRemainingRef.current - 1; x >= Math.max(r, 1); x--) cueForRemaining(x);
        lastRemainingRef.current = r;
        setRemaining(r);
      }
      if (r <= 0) {
        finish(durationSeconds, true);
      }
    }, 200);
  }, [durationSeconds, clearTimer, cueForRemaining, finish, exercise]);

  // Voice commands: listen while armed (for "start") or running (for "stop").
  const handleCommand = useCallback((cmd: VoiceCommand) => {
    if (cmd === 'start' && phaseRef.current === 'armed') {
      beginRun();
    } else if (cmd === 'done' && phaseRef.current === 'running') {
      const elapsed = Math.round((Date.now() - startAtRef.current) / 1000);
      finish(Math.max(1, elapsed), false);
    }
  }, [beginRun, finish]);

  useVoiceCommands(handleCommand, phase === 'armed' || phase === 'running');

  useImperativeHandle(ref, () => ({
    finalize: () => {
      if (phaseRef.current === 'running') {
        const elapsed = Math.round((Date.now() - startAtRef.current) / 1000);
        finish(Math.max(1, elapsed), false);
      } else {
        // Armed but never started — nothing held.
        finalizingRef.current = true;
        clearTimer();
        onFinalized(0);
      }
    },
  }), [finish, clearTimer, onFinalized]);

  // React to the parent's set lifecycle.
  useEffect(() => {
    if (isSetActive && phaseRef.current === 'idle') {
      finalizingRef.current = false;
      setRemaining(durationSeconds);
      lastRemainingRef.current = durationSeconds;
      setPhase('armed');
    } else if (!isSetActive && phaseRef.current !== 'idle') {
      clearTimer();
      setPhase('idle');
      setRemaining(durationSeconds);
    }
  }, [isSetActive, durationSeconds, clearTimer]);

  // Keep the idle display in sync when the user changes the target duration.
  useEffect(() => {
    if (phaseRef.current === 'idle') {
      setRemaining(durationSeconds);
      lastRemainingRef.current = durationSeconds;
    }
  }, [durationSeconds]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const bigText = isLarge ? 'text-7xl' : 'text-8xl';

  // ---- IDLE: pick a duration, then tell the user how to begin ----
  if (phase === 'idle') {
    return (
      <View
        className={`flex-1 mr-2 rounded-2xl p-3 items-center justify-center ${isLarge ? 'min-h-[140px]' : 'min-h-[160px]'}`}
        style={{ borderWidth: 2, borderColor: PURPLE }}
      >
        <View className="flex-row items-center">
          <Clock size={isLarge ? 14 : 16} color={PURPLE} />
          <Text numberOfLines={1} className={`ml-1 tracking-wide ${isLarge ? 'text-sm' : 'text-base'}`} style={{ color: PURPLE }}>
            TIME
          </Text>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit className={`font-bold ${bigText}`} style={{ color: PURPLE }}>
          {fmt(durationSeconds)}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 2 }}
          className="mt-1"
        >
          {TIMED_DURATION_OPTIONS.map(opt => {
            const active = opt === durationSeconds;
            return (
              <Pressable
                key={opt}
                onPress={() => onSetDuration(opt)}
                className="px-2.5 py-1 rounded-full mx-1"
                style={{ backgroundColor: active ? PURPLE : 'rgba(168,85,247,0.15)' }}
              >
                <Text className={`${isLarge ? 'text-xs' : 'text-sm'} font-semibold`} style={{ color: active ? '#fff' : PURPLE }}>
                  {fmt(opt)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ---- ARMED: waiting for "Start" (voice or button) ----
  if (phase === 'armed') {
    return (
      <View
        className={`flex-1 mr-2 rounded-2xl p-3 items-center justify-center ${isLarge ? 'min-h-[140px]' : 'min-h-[160px]'}`}
        style={{ borderWidth: 2, borderColor: PURPLE }}
      >
        <Text numberOfLines={1} className={`tracking-wide ${isLarge ? 'text-sm' : 'text-base'}`} style={{ color: PURPLE }}>
          READY
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit className={`font-bold ${bigText}`} style={{ color: PURPLE }}>
          {fmt(durationSeconds)}
        </Text>
        <Pressable
          onPress={beginRun}
          className="flex-row items-center px-4 py-2 rounded-full mt-1"
          style={{ backgroundColor: PURPLE }}
        >
          <Play size={isLarge ? 16 : 18} color="#fff" fill="#fff" />
          <Text className={`text-white font-bold ml-2 ${isLarge ? 'text-sm' : 'text-base'}`}>
            Say “Start” or tap
          </Text>
        </Pressable>
      </View>
    );
  }

  // ---- RUNNING: live countdown ----
  const isFinalTen = remaining <= 10;
  return (
    <View
      className={`flex-1 mr-2 rounded-2xl p-3 items-center justify-center ${isLarge ? 'min-h-[140px]' : 'min-h-[160px]'}`}
      style={{ borderWidth: 2, borderColor: isFinalTen ? '#fff' : PURPLE, backgroundColor: 'rgba(168,85,247,0.10)' }}
    >
      <Text numberOfLines={1} className={`tracking-wide ${isLarge ? 'text-sm' : 'text-base'}`} style={{ color: PURPLE }}>
        {isFinalTen ? 'FINISH STRONG' : 'TIME'}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        className={`font-bold ${bigText}`}
        style={{ color: isFinalTen ? '#fff' : PURPLE }}
      >
        {fmt(remaining)}
      </Text>
      <Pressable
        onPress={() => {
          const elapsed = Math.round((Date.now() - startAtRef.current) / 1000);
          finish(Math.max(1, elapsed), false);
        }}
        className="flex-row items-center px-4 py-2 rounded-full mt-1"
        style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
      >
        <Square size={isLarge ? 12 : 14} color="#fff" fill="#fff" />
        <Text className={`text-white font-semibold ml-2 ${isLarge ? 'text-sm' : 'text-base'}`}>
          Say “Stop” or tap
        </Text>
      </Pressable>
    </View>
  );
});
