import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { remoteLog } from '@/lib/remoteLog';
import {
  setActiveRecording,
  releaseActiveRecorder,
  forceResetNativeRecorder,
  claimTeardown,
  safeUnload,
} from './micSlot';

// Voice COMMAND recognition for Timed exercises. Commands are single spoken
// words ("start" / "done"), so all we need is to reliably capture the whole
// word and scan the transcription for a keyword.
//
// This used to record BLIND fixed-length chunks (~850ms) with a dead gap
// between each one (stop → unload → transcribe → prepare → start). A spoken
// "Start"/"Stop" only lasts ~400-500ms, so it kept getting sliced across a
// chunk boundary ("st…art") or landing in the dead gap — and neither half ever
// transcribed to a real word. That's why voice felt broken on Timed sets.
//
// So this now uses the SAME metering-based VAD loop that makes voice rep
// counting reliable: record continuously, watch the audio level, and only cut a
// clip when the user has clearly finished speaking (a short silence after
// speech) or a max window elapses. That guarantees the whole word lands in one
// clip, then the next chunk starts immediately.
//
// It shares the single global iOS recorder slot (owned by ./micSlot) with
// useVoiceCounting. Switching between a voice exercise and a Timed one hands the
// mic from one hook to the other; because both go through micSlot, whichever
// starts next always releases the previous recorder — from either hook — before
// preparing, instead of racing it and wedging (or crashing) the audio session.

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

// Voice activity detection thresholds (dBFS) — same values proven out in
// useVoiceCounting for reliably catching short, barked utterances.
const SPEECH_THRESHOLD = -35;        // Above this = someone is speaking
const SILENCE_THRESHOLD = -45;       // Below this = silence
const SILENCE_AFTER_SPEECH_MS = 300; // Silence for 300ms after speech → cut & transcribe
const MAX_CHUNK_MS = 1400;           // Force a cut after this even without silence
const MIN_CHUNK_MS = 250;            // Don't transcribe clips shorter than this
const METERING_POLL_MS = 80;         // Check the audio level this often
const MAX_START_FAILURES = 4;        // Give up after this many failed prepares

// Record as m4a/AAC using expo-av's HIGH_QUALITY preset verbatim (overriding it
// breaks iOS prepare), with metering enabled for voice-activity detection.
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export type VoiceCommand = 'start' | 'done';

// Keyword → command. We accept a few natural synonyms so the user isn't forced
// to say an exact magic word. Kept deliberately tight: broad words like "time"
// or "complete" used to match Whisper hallucinations (see below) and stop a
// hold early, so they're gone.
const START_WORDS = ['start', 'begin', 'go', 'ready'];
const DONE_WORDS = ['done', 'stop', 'finish', 'finished', "i'm done"];

// During a long silent hold the mic keeps recording, and Whisper "fills the
// silence" by hallucinating ad-reads, disclaimers and video outros
// (e.g. "Please see the complete disclaimer at https://sites.google.com",
// "Go to Beadaholique.com for all your beading needs!"). Those wrecked timed
// sets — a stray "complete"/"go" inside them was read as a Stop/Start command.
// Any chunk containing one of these markers is junk, never a command.
const HALLUCINATION_MARKERS = [
  'http', 'www', '.com', '.org', '.net', 'subscribe', 'disclaimer',
  'watching', 'next video', 'next time', 'channel', 'supply', 'thanks for',
];

function detectCommand(text: string): VoiceCommand | null {
  const raw = text.toLowerCase().trim();
  if (!raw) return null;

  // Throw out obvious hallucinations (URLs, ad-reads, outros) before matching.
  if (HALLUCINATION_MARKERS.some(m => raw.includes(m))) return null;

  // A real spoken command is short ("start", "okay done"). A clip of someone
  // actually saying Start/Stop is at most ~3 words; anything longer is
  // background chatter or a hallucinated sentence, not a command.
  const words = raw.replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;

  const t = ` ${words.join(' ')} `;
  // "done" takes priority — if someone says "okay I'm done" we should stop.
  if (DONE_WORDS.some(w => t.includes(` ${w} `))) return 'done';
  if (START_WORDS.some(w => t.includes(` ${w} `))) return 'start';
  return null;
}

interface UseVoiceCommandsResult {
  isListening: boolean;
  error: string | null;
}

export function useVoiceCommands(
  onCommand: (cmd: VoiceCommand) => void,
  isActive: boolean
): UseVoiceCommandsResult {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldListenRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startingRef = useRef(false);          // guards against overlapping chunk starts
  const startFailureCountRef = useRef(0);     // consecutive prepare failures
  const meteringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkStartTimeRef = useRef(0);
  const speechDetectedRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;

  const transcribe = useCallback(async (uri: string) => {
    if (!OPENAI_API_KEY) return;
    try {
      const fd = new FormData();
      fd.append('file', { uri, name: 'command.m4a', type: 'audio/mp4' } as unknown as Blob);
      fd.append('model', 'whisper-1');
      fd.append('language', 'en');
      const res = await fetch(TRANSCRIBE_URL, {
        method: 'POST',
        body: fd,
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      const text: string = data.text || '';
      if (!text) return;
      const cmd = detectCommand(text);
      if (cmd) {
        remoteLog('voice_command', { text, cmd });
        onCommandRef.current(cmd);
      }
    } catch {
      // A dropped chunk is harmless — the next one will catch the command.
    }
  }, []);

  // Stop the current recording, (maybe) transcribe it, then immediately start
  // the next one. `shouldTranscribe` is false when we're just recycling a silent
  // window — no point sending pure silence to Whisper.
  const finishChunk = useCallback(async (recording: Audio.Recording, shouldTranscribe: boolean) => {
    if (meteringTimerRef.current) {
      clearTimeout(meteringTimerRef.current);
      meteringTimerRef.current = null;
    }
    if (recordingRef.current === recording) recordingRef.current = null;

    // Atomically claim teardown so a stop()/unmount racing this can't double
    // stop-and-unload the same recorder (which crashes native on iOS).
    if (claimTeardown(recording)) {
      try {
        const status = await recording.getStatusAsync();
        const duration = status.durationMillis ?? 0;
        const uri = recording.getURI();
        await recording.stopAndUnloadAsync();
        if (shouldTranscribe && duration >= MIN_CHUNK_MS && uri) {
          transcribe(uri); // fire-and-forget so the next chunk starts immediately
        }
      } catch { /* ignore cleanup errors */ }
    }

    if (shouldListenRef.current) startChunk();
  }, [transcribe]); // startChunk referenced below via ref

  const finishChunkRef = useRef(finishChunk);
  finishChunkRef.current = finishChunk;

  const startChunk = useCallback(async () => {
    if (!shouldListenRef.current) return;
    // Prevent two startChunk calls from racing to prepare two recorders — iOS
    // only allows one prepared recorder and a collision wedges the session.
    if (startingRef.current) return;
    startingRef.current = true;

    let recording: Audio.Recording | null = null;
    try {
      if (recordingRef.current) {
        const stale = recordingRef.current;
        recordingRef.current = null;
        await safeUnload(stale);
      }
      // Reclaim the shared slot from any recorder the OTHER hook (voice counting)
      // left loaded — e.g. after switching from a voice exercise to this Timed
      // one — before we try to prepare, so we never collide with it.
      await releaseActiveRecorder();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      recording = new Audio.Recording();
      try {
        await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      } catch (prepareErr) {
        if (String(prepareErr).includes('Only one Recording')) {
          await safeUnload(recording);
          await forceResetNativeRecorder();
          recording = new Audio.Recording();
          await recording.prepareToRecordAsync(RECORDING_OPTIONS);
        } else {
          throw prepareErr;
        }
      }
      await recording.startAsync();
      recordingRef.current = recording;
      setActiveRecording(recording);
      chunkStartTimeRef.current = Date.now();
      speechDetectedRef.current = false;
      silenceStartRef.current = null;
      startFailureCountRef.current = 0;
      startingRef.current = false;
      setError(null);

      const active = recording;

      // Poll the audio level to find the end of a spoken word, exactly like
      // useVoiceCounting. This keeps the mic recording continuously so the onset
      // of "Start"/"Stop" is never chopped off, then cuts the clip once the word
      // is done so the whole word lands in a single transcription.
      const pollMetering = async () => {
        if (!shouldListenRef.current || recordingRef.current !== active) return;

        let status: Awaited<ReturnType<typeof active.getStatusAsync>>;
        try {
          status = await active.getStatusAsync();
        } catch {
          return;
        }
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
            // End of the spoken word — cut and transcribe now.
            finishChunkRef.current(active, true);
            return;
          }
        }

        if (elapsed >= MAX_CHUNK_MS) {
          // Recycle the window. Only bother transcribing if we actually heard
          // speech in it; a pure-silence window is just dropped.
          finishChunkRef.current(active, speechDetectedRef.current);
          return;
        }

        meteringTimerRef.current = setTimeout(pollMetering, METERING_POLL_MS);
      };

      meteringTimerRef.current = setTimeout(pollMetering, METERING_POLL_MS);
    } catch (err) {
      startingRef.current = false;
      startFailureCountRef.current += 1;
      if (recording) {
        recordingRef.current = null;
        await safeUnload(recording);
      }
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch { /* ignore */ }
      if (!shouldListenRef.current) return;

      if (startFailureCountRef.current >= MAX_START_FAILURES) {
        remoteLog('voice_error', { reason: 'command_recorder_prepare', message: String(err).slice(0, 200) });
        setError("Couldn't start the mic — tap End Set, then start a new set");
        shouldListenRef.current = false;
        setIsListening(false);
        return;
      }
      // Back off a touch longer each time while the session recovers.
      meteringTimerRef.current = setTimeout(() => startChunk(), 400 * startFailureCountRef.current);
    }
  }, [transcribe]);

  const start = useCallback(async () => {
    if (shouldListenRef.current) return;
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      setError('Microphone permission denied');
      return;
    }
    setError(null);
    startFailureCountRef.current = 0;
    startingRef.current = false;
    shouldListenRef.current = true;
    setIsListening(true);
    await startChunk();
  }, [startChunk]);

  const stop = useCallback(async () => {
    if (!shouldListenRef.current) return;
    shouldListenRef.current = false;
    startingRef.current = false;
    if (meteringTimerRef.current) {
      clearTimeout(meteringTimerRef.current);
      meteringTimerRef.current = null;
    }
    if (recordingRef.current) {
      const rec = recordingRef.current;
      recordingRef.current = null;
      await safeUnload(rec);
    }
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch { /* ignore */ }
    setIsListening(false);
  }, []);

  // Drive listening from the isActive flag.
  useEffect(() => {
    if (isActive) start();
    else stop();
  }, [isActive, start, stop]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (meteringTimerRef.current) clearTimeout(meteringTimerRef.current);
      if (recordingRef.current) {
        const rec = recordingRef.current;
        recordingRef.current = null;
        safeUnload(rec);
      }
    };
  }, []);

  return { isListening, error };
}
