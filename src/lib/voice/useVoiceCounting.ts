import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { remoteLog } from '@/lib/remoteLog';
import {
  setActiveRecording,
  releaseActiveRecorder,
  forceResetNativeRecorder,
  claimTeardown,
  safeUnload,
} from './micSlot';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

const SPEECH_THRESHOLD = -35;
const SILENCE_THRESHOLD = -45;
const SILENCE_AFTER_SPEECH_MS = 500;
const MAX_CHUNK_MS = 1800;
const MIN_CHUNK_MS = 300;
const METERING_POLL_MS = 80;
const MAX_START_FAILURES = 4;
const MAX_REP_JUMP = 6;
const VOICE_REP_COOLDOWN_MS = 1100;

// One-time audio mode setup to prevent screen flicker/bridge crashes
let isAudioModeSet = false;
async function ensureAudioMode() {
  if (isAudioModeSet) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldRouteAudioToSpeakerIfPreferred: true,
    });
    isAudioModeSet = true;
    console.log('[VOICE] Audio mode initialized');
  } catch (err) {
    console.warn('[VOICE] Mode initialization failed:', err);
  }
}

function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  const lowerText = text.toLowerCase().trim();
  const textNumMap: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
    'to': 2, 'too': 2, 'for': 4, 'fore': 4, 'ate': 8, 'nan': 9, 'nein': 9,
  };
  const digitMatches = lowerText.match(/\b\d+\b/g);
  if (digitMatches) {
    for (const match of digitMatches) {
      const num = parseInt(match, 10);
      if (num > 0 && num <= 100) numbers.push(num);
    }
  }
  Object.keys(textNumMap).forEach(word => {
    if (lowerText.includes(word)) numbers.push(textNumMap[word]);
  });
  return [...new Set(numbers)].sort((a, b) => a - b);
}

interface UseVoiceCountingResult {
  isListening: boolean;
  isProcessing: boolean;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  resetCount: () => void;
}

export function useVoiceCounting(
  onRepCounted: (repNumber: number) => void,
  isActive: boolean
): UseVoiceCountingResult {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldListenRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startingRef = useRef(false);
  const startFailureCountRef = useRef(0);
  const meteringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkStartTimeRef = useRef(0);
  const speechDetectedRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const lastCountedRef = useRef(0);
  const lastRepTimestampRef = useRef(0);
  const onRepCountedRef = useRef(onRepCounted);
  onRepCountedRef.current = onRepCounted;

  const transcribeAndProcess = useCallback(async (uri: string) => {
    if (!OPENAI_API_KEY) return;
    setIsProcessing(true);
    try {
      const fd = new FormData();
      // Use the robust structure for Android tablets
      const fileData = {
        uri: uri,
        name: 'recording.m4a',
        type: 'audio/mp4',
      };
      // @ts-ignore
      fd.append('file', fileData);
      fd.append('model', 'whisper-1');
      fd.append('language', 'en');

      const response = await fetch(TRANSCRIBE_URL, {
        method: 'POST',
        body: fd,
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
      });

      if (!response.ok) return;
      const data = await response.json();
      const text: string = data.text || '';
      if (!text) return;

      console.log('[VOICE] Hear:', text);
      const numbers = extractNumbers(text);

      for (const num of numbers) {
        if (num > lastCountedRef.current) {
          const nowMs = Date.now();
          if (nowMs - lastRepTimestampRef.current < VOICE_REP_COOLDOWN_MS) continue;
          const jump = num - lastCountedRef.current;
          const target = jump > MAX_REP_JUMP ? lastCountedRef.current + 1 : num;
          for (let i = lastCountedRef.current + 1; i <= target; i++) {
            onRepCountedRef.current(i);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          lastCountedRef.current = target;
          lastRepTimestampRef.current = nowMs;
          break;
        }
      }
    } catch (err) {
      console.error('[VOICE] Request Failed:', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const finishChunk = useCallback(async (recording: Audio.Recording) => {
    if (meteringTimerRef.current) clearTimeout(meteringTimerRef.current);
    if (recordingRef.current === recording) recordingRef.current = null;

    if (claimTeardown(recording)) {
      try {
        const status = await recording.getStatusAsync();
        const uri = recording.getURI();
        await recording.stopAndUnloadAsync();
        if ((status.durationMillis || 0) >= MIN_CHUNK_MS && uri) {
          transcribeAndProcess(uri);
        }
      } catch { }
    }
    if (shouldListenRef.current) startChunk();
  }, [transcribeAndProcess]);

  const finishChunkRef = useRef(finishChunk);
  finishChunkRef.current = finishChunk;

  const startChunk = useCallback(async () => {
    if (!shouldListenRef.current || startingRef.current) return;
    startingRef.current = true;

    let recording: Audio.Recording | null = null;
    try {
      await releaseActiveRecorder();
      recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setActiveRecording(recording);
      chunkStartTimeRef.current = Date.now();
      speechDetectedRef.current = false;
      silenceStartRef.current = null;
      startFailureCountRef.current = 0;
      startingRef.current = false;

      const active = recording;
      const pollMetering = async () => {
        if (!shouldListenRef.current || recordingRef.current !== active) return;
        let status;
        try { status = await active.getStatusAsync(); } catch { return; }
        if (!status.isRecording) return;

        const metering = status.metering ?? -160;
        const elapsed = Date.now() - chunkStartTimeRef.current;

        if (metering > SPEECH_THRESHOLD) {
          speechDetectedRef.current = true;
          silenceStartRef.current = null;
        } else if (metering < SILENCE_THRESHOLD && speechDetectedRef.current) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current >= SILENCE_AFTER_SPEECH_MS && elapsed >= MIN_CHUNK_MS) {
            finishChunkRef.current(active);
            return;
          }
        }
        if (elapsed >= MAX_CHUNK_MS) {
          finishChunkRef.current(active);
          return;
        }
        meteringTimerRef.current = setTimeout(pollMetering, METERING_POLL_MS);
      };
      meteringTimerRef.current = setTimeout(pollMetering, METERING_POLL_MS);
    } catch (err) {
      startingRef.current = false;
      startFailureCountRef.current += 1;
      if (recording) await safeUnload(recording);
      if (shouldListenRef.current && startFailureCountRef.current < MAX_START_FAILURES) {
        meteringTimerRef.current = setTimeout(() => startChunk(), 500);
      }
    }
  }, []);

  const startListening = useCallback(async () => {
    if (shouldListenRef.current) return;
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') return;

    await ensureAudioMode();
    shouldListenRef.current = true;
    setIsListening(true);
    await startChunk();
  }, [startChunk]);

  const stopListening = useCallback(async () => {
    if (!shouldListenRef.current) return;
    shouldListenRef.current = false;
    if (recordingRef.current) {
      const rec = recordingRef.current;
      recordingRef.current = null;
      await safeUnload(rec);
    }
    await releaseActiveRecorder();
    setIsListening(false);
  }, []);

  const resetCount = useCallback(() => { lastCountedRef.current = 0; }, []);

  useEffect(() => {
    if (isActive) {
      const t = setTimeout(() => startListening(), 250);
      return () => clearTimeout(t);
    } else stopListening();
  }, [isActive, startListening, stopListening]);

  return { isListening, isProcessing, error, startListening, stopListening, resetCount };
}
