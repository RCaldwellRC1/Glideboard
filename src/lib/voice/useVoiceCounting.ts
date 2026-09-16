import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { remoteLog } from '@/lib/remoteLog';
import {
  setActiveRecording,
  releaseActiveRecorder,
  claimTeardown,
  safeUnload,
} from './micSlot';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

const SPEECH_THRESHOLD = -38;
const SILENCE_THRESHOLD = -48;
const SILENCE_AFTER_SPEECH_MS = 450;
const MAX_CHUNK_MS = 1600;
const MIN_CHUNK_MS = 250;
const METERING_POLL_MS = 75;
const MAX_START_FAILURES = 3;
const MAX_REP_JUMP = 5;
const VOICE_REP_COOLDOWN_MS = 1000;

// One-time audio mode setup to prevent bridge flickering
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
    console.log('[VOICE] Audio hardware bridge established');
  } catch (err) {
    console.warn('[VOICE] Bridge error:', err);
  }
}

function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  const lowerText = text.toLowerCase().trim();
  const textNumMap: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
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

export function useVoiceCounting(
  onRepCounted: (repNumber: number) => void,
  isActive: boolean
) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldListenRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
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
      // Explicitly typed for Android tablet file picker
      const file = {
        uri,
        name: 'rec.m4a',
        type: 'audio/mp4',
      };
      // @ts-ignore
      fd.append('file', file);
      fd.append('model', 'whisper-1');
      fd.append('language', 'en');

      const response = await fetch(TRANSCRIBE_URL, {
        method: 'POST',
        body: fd,
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
      });

      if (!response.ok) return;
      const data = await response.json();
      const text = (data.text || '').trim();
      if (!text) return;

      console.log('[VOICE] Hear:', text);
      const numbers = extractNumbers(text);

      for (const num of numbers) {
        if (num > lastCountedRef.current) {
          const nowMs = Date.now();
          if (nowMs - lastRepTimestampRef.current < VOICE_REP_COOLDOWN_MS) continue;
          const target = num - lastCountedRef.current > MAX_REP_JUMP ? lastCountedRef.current + 1 : num;
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
      console.error('[VOICE] Transcription failed:', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const finishChunk = useCallback(async (recording: Audio.Recording) => {
    if (meteringTimerRef.current) clearTimeout(meteringTimerRef.current);
    if (recordingRef.current === recording) recordingRef.current = null;

    if (claimTeardown(recording)) {
      try {
        const uri = recording.getURI();
        await recording.stopAndUnloadAsync();
        if (uri) transcribeAndProcess(uri);
      } catch { }
    }
    if (shouldListenRef.current) startChunk();
  }, [transcribeAndProcess]);

  const startChunk = useCallback(async () => {
    if (!shouldListenRef.current) return;

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setActiveRecording(recording);
      chunkStartTimeRef.current = Date.now();
      speechDetectedRef.current = false;
      silenceStartRef.current = null;

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
          if (!silenceStartRef.current) silenceStartRef.current = Date.now();
          else if (Date.now() - silenceStartRef.current >= SILENCE_AFTER_SPEECH_MS && elapsed >= MIN_CHUNK_MS) {
            finishChunk(active);
            return;
          }
        }
        if (elapsed >= MAX_CHUNK_MS) {
          finishChunk(active);
          return;
        }
        meteringTimerRef.current = setTimeout(pollMetering, METERING_POLL_MS);
      };
      meteringTimerRef.current = setTimeout(pollMetering, METERING_POLL_MS);
    } catch (err) {
      if (shouldListenRef.current) {
        await releaseActiveRecorder();
        meteringTimerRef.current = setTimeout(() => startChunk(), 1000);
      }
    }
  }, [finishChunk]);

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
    if (meteringTimerRef.current) clearTimeout(meteringTimerRef.current);

    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) await safeUnload(rec);

    await releaseActiveRecorder();
    setIsListening(false);
  }, []);

  const resetCount = useCallback(() => { lastCountedRef.current = 0; }, []);

  useEffect(() => {
    if (isActive) {
      // Small buffer to prevent overlap with UI transitions
      const t = setTimeout(() => startListening(), 400);
      return () => clearTimeout(t);
    } else {
      stopListening();
    }
  }, [isActive, startListening, stopListening]);

  return { isListening, isProcessing, error, startListening, stopListening, resetCount };
}
