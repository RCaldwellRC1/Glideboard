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

// Transcription runs through our own backend, where the OpenAI proxy key is
// correctly authenticated. Calling OpenAI directly from the app returned 401
// unauthorized, which silently broke voice rep counting.
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;
const TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

// Voice activity detection thresholds (dBFS)
const SPEECH_THRESHOLD = -35;      // Above this = someone is speaking
const SILENCE_THRESHOLD = -45;     // Below this = silence
const SILENCE_AFTER_SPEECH_MS = 350; // Silence for 350ms after speech → transcribe now
const MAX_CHUNK_MS = 1500;         // Force transcribe after 1.5s even without silence —
                                   // keeps clips small/fast when counting continuously
const MIN_CHUNK_MS = 300;          // Don't transcribe clips shorter than 300ms
const METERING_POLL_MS = 80;       // Check audio level every 80ms
const MAX_START_FAILURES = 4;      // Give up (with a message) after this many failed prepares

// Largest jump we'll trust from a single transcription chunk. Whisper commonly
// mishears the "-teen" numbers as their "-ty" counterparts (thirteen→thirty,
// fourteen→forty, fifteen→fifty). Because we count UP to whatever number we
// hear, an unguarded "30" when you meant "13" would back-fill 13→30 — a huge
// over-count in one breath. Reps are spoken every couple seconds and chunks are
// ~1.5s, so you can realistically only miss one or two numbers between chunks;
// anything bigger is almost certainly a mis-hear, so we advance by just one.
const MAX_REP_JUMP = 3;

// Phrases Whisper hallucinates over breathing/grunting/silence. These never
// contain a real rep count, so we drop them before number extraction to cut
// noise (and avoid a stray digit inside one being miscounted). We saw several of
// these pollute a real workout — subtitle/credit lines like
// "Subs by www.zeoranger.co.uk" — so URL/credit markers are included too.
const HALLUCINATION_PHRASES = [
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  'see you next time',
  'see you in the next',
  'subs by',
  'subtitles by',
  'subtitle',
  'amara.org',
  'http',
  'www',
  '.com',
  '.org',
  '.net',
  '.co.uk',
];

// Standalone number-homophones. Whisper often returns a single mis-heard token
// INSTEAD of the digit for a rep called out mid-effort ("Nein!" for nine, "Age"
// for eight). We only trust these when the WHOLE transcription is one of them
// (stripped of punctuation), so a homophone buried in a sentence can't inflate
// the count. This directly recovers reps that were being dropped as junk.
// Deliberately excludes everyday filler words ("to", "for", "too") that show up
// as lone background chunks — those would over-count. These are the ones that
// realistically only appear when someone is barking a rep number.
const STANDALONE_HOMOPHONES: Record<string, number> = {
  won: 1,
  tree: 3,
  fore: 4,
  sex: 6,
  ate: 8, age: 8,
  nein: 9, nan: 9,
};

// Record as m4a/AAC. expo-av's iOS LINEARPCM `.wav` output does not write a
// valid RIFF/WAV header, so OpenAI Whisper rejected every chunk with
// "Invalid file format". Overriding the preset's bitrate ALSO breaks iOS with
// "recorder not prepared", so we use expo-av's HIGH_QUALITY preset verbatim —
// which reliably prepares and produces a valid m4a Whisper accepts — and just
// enable metering on top for voice-activity detection. Speed comes from shorter
// chunks (MAX_CHUNK_MS), not from shrinking the audio.
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

const NUMBER_WORDS: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24, 'twenty-five': 25,
  'twenty one': 21, 'twenty two': 22, 'twenty three': 23, 'twenty four': 24, 'twenty five': 25,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  '11': 11, '12': 12, '13': 13, '14': 14, '15': 15,
  '16': 16, '17': 17, '18': 18, '19': 19, '20': 20,
  '21': 21, '22': 22, '23': 23, '24': 24, '25': 25,
};

function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  const lowerText = text.toLowerCase().trim();

  const digitMatches = lowerText.match(/\b\d+\b/g);
  if (digitMatches) {
    for (const match of digitMatches) {
      const num = parseInt(match, 10);
      if (num > 0 && num <= 100 && !numbers.includes(num)) numbers.push(num);
    }
  }

  const wordEntries = Object.entries(NUMBER_WORDS)
    .filter(([word]) => isNaN(Number(word)))
    .sort((a, b) => b[0].length - a[0].length);

  for (const [word, num] of wordEntries) {
    const regex = new RegExp(`\\b${word.replace('-', '[- ]?')}\\b`, 'i');
    if (regex.test(lowerText) && !numbers.includes(num)) numbers.push(num);
  }

  // Last resort: if we found no real number, see whether the entire utterance is
  // a single known mis-hear of a digit (e.g. "Nein!" → 9). Only for lone tokens
  // so a homophone inside a sentence can't be mistaken for a rep count.
  if (numbers.length === 0) {
    const soleWord = lowerText.replace(/[^a-z]/g, '');
    const homophone = STANDALONE_HOMOPHONES[soleWord];
    if (homophone) numbers.push(homophone);
  }

  return [...new Set(numbers)].sort((a, b) => a - b);
}

// The single global recorder slot is owned by ./micSlot and shared with
// useVoiceCommands, so a handoff between voice-counting and Timed voice-commands
// always releases the previous recorder before preparing the next one.

interface UseVoiceCountingResult {
  isListening: boolean;
  isProcessing: boolean;
  lastTranscription: string;
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
  const [lastTranscription, setLastTranscription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const shouldListenRef = useRef(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startingRef = useRef(false);          // guards against overlapping chunk starts
  const startFailureCountRef = useRef(0);     // consecutive prepare failures
  const meteringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunkStartTimeRef = useRef(0);
  const speechDetectedRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const lastCountedRef = useRef(0);
  const onRepCountedRef = useRef(onRepCounted);
  onRepCountedRef.current = onRepCounted;

  const transcribeAndProcess = useCallback(async (uri: string) => {
    if (!OPENAI_API_KEY) {
      console.warn('[VOICE] No OpenAI API key configured');
      remoteLog('voice_error', { reason: 'no_api_key' });
      return;
    }
    setIsProcessing(true);
    try {
      const buildForm = () => {
        const fd = new FormData();
        fd.append('file', {
          uri,
          name: 'recording.m4a',
          type: 'audio/mp4',
        } as unknown as Blob);
        fd.append('model', 'whisper-1');
        fd.append('language', 'en');
        return fd;
      };

      let response: Response | null = null;
      let lastNetworkErr: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await fetch(TRANSCRIBE_URL, {
            method: 'POST',
            body: buildForm(),
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
            }
          });
          break;
        } catch (err) {
          lastNetworkErr = err;
          response = null;
        }
      }

      if (!response) {
        console.warn('[VOICE] Transcription network error:', lastNetworkErr);
        remoteLog('voice_error', { reason: 'network', message: String(lastNetworkErr).slice(0, 200) });
        setError("Can't reach the counter — check your connection");
        return;
      }

      setError(null);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.warn('[VOICE] Transcription failed:', response.status, body);
        remoteLog('voice_error', { reason: 'http', status: response.status, body: body.slice(0, 200) });
        return;
      }
      const data = await response.json();
      const text: string = data.text || '';
      if (!text) return;

      console.log('[VOICE] Transcription:', text);
      setLastTranscription(text);
      remoteLog('voice_transcription', { text });

      // Drop known Whisper hallucinations outright — they carry no rep count.
      const lowered = text.toLowerCase();
      if (HALLUCINATION_PHRASES.some(p => lowered.includes(p))) {
        console.log('[VOICE] Ignored hallucination phrase');
        return;
      }

      const numbers = extractNumbers(text);
      console.log('[VOICE] Detected numbers:', numbers);

      for (const num of numbers) {
        if (num > lastCountedRef.current) {
          // Guard against a single mis-heard number (e.g. "thirty" for
          // "thirteen") back-filling a huge run of reps. If the jump is larger
          // than we could plausibly have missed between chunks, treat it as one
          // rep instead of trusting the inflated value.
          const target =
            num - lastCountedRef.current > MAX_REP_JUMP ? lastCountedRef.current + 1 : num;
          if (target !== num) {
            console.log(`[VOICE] Implausible jump to ${num}; counting one rep instead`);
            remoteLog('voice_jump_clamped', { heard: num, from: lastCountedRef.current });
          }
          for (let i = lastCountedRef.current + 1; i <= target; i++) {
            onRepCountedRef.current(i);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            console.log('[VOICE] Rep counted:', i);
            remoteLog('rep_counted', { rep: i, via: 'voice' });
          }
          lastCountedRef.current = target;
          break;
        }
      }
    } catch (err) {
      // We already reached the server above (network failures are handled
      // explicitly), so this is a post-response error like a malformed body.
      // Drop the chunk and keep listening rather than blaming the connection.
      console.error('[VOICE] Transcription error:', err);
      remoteLog('voice_error', { reason: 'parse', message: String(err).slice(0, 200) });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Stop the current recording, transcribe it, then immediately start the next one
  const finishChunk = useCallback(async (recording: Audio.Recording) => {
    if (meteringTimerRef.current) {
      clearTimeout(meteringTimerRef.current);
      meteringTimerRef.current = null;
    }

    // Clear ref only if it's still our recording
    if (recordingRef.current === recording) recordingRef.current = null;

    // Atomically claim this recorder's teardown. If stopListening (or any other
    // path) already claimed it, DON'T touch the native object again — a second
    // getStatusAsync/stopAndUnloadAsync on the same recorder crashes iOS. Just
    // move on to the next chunk.
    if (claimTeardown(recording)) {
      try {
        const status = await recording.getStatusAsync();
        const duration = status.durationMillis ?? 0;
        const uri = recording.getURI();
        await recording.stopAndUnloadAsync();

        if (duration >= MIN_CHUNK_MS && uri) {
          // Fire-and-forget transcription so the next chunk starts immediately
          transcribeAndProcess(uri);
        }
      } catch {
        // ignore cleanup errors
      }
    }

    // Start the next chunk right away if still active
    if (shouldListenRef.current) {
      startChunk();
    }
  }, [transcribeAndProcess]); // startChunk added below via ref

  const finishChunkRef = useRef(finishChunk);
  finishChunkRef.current = finishChunk;

  const startChunk = useCallback(async () => {
    if (!shouldListenRef.current) return;
    // Prevent two startChunk calls from racing to prepare two recorders at once
    // — iOS only allows one prepared AVAudioRecorder, and a collision leaves the
    // audio session wedged ("recorder not prepared") for every subsequent try.
    if (startingRef.current) return;
    startingRef.current = true;

    // Tracked outside the try so the catch can unload it. expo-av allows only
    // ONE prepared Recording globally: if prepareToRecordAsync succeeds but a
    // later step (startAsync) throws, this object stays "prepared" and, unless
    // we unload it here, leaks the global lock — making EVERY future prepare
    // throw "Only one Recording object can be prepared" until the app restarts.
    let recording: Audio.Recording | null = null;

    try {
      // Tear down any recorder still loaded from a prior chunk/set before
      // preparing a new one, otherwise iOS refuses to prepare the next one.
      if (recordingRef.current) {
        const stale = recordingRef.current;
        recordingRef.current = null;
        await safeUnload(stale);
      }
      // Reclaim expo-av's single global slot from any orphaned recorder (e.g.
      // one stranded by a Fast Refresh or remount) before we try to prepare.
      await releaseActiveRecorder();

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      // Prepare, retrying once if the global slot is still held: the first
      // failure unloads the orphan, the retry then succeeds. Without this a
      // single lost reference wedges voice counting until a full app restart.
      recording = new Audio.Recording();
      try {
        await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      } catch (prepareErr) {
        if (String(prepareErr).includes('Only one Recording')) {
          // The slot is held by a recorder we don't have a handle to. Force the
          // native module to unload it (also clears expo-av's stuck JS flag),
          // then build a brand-new recorder and try once more.
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
      startFailureCountRef.current = 0; // healthy start clears the failure streak
      startingRef.current = false;

      console.log('[VOICE] Chunk recording started');

      // Non-null handle for the polling closure (recording is nullable so the
      // catch can unload it on failure).
      const activeRecording = recording;

      // Poll audio metering to detect when a word has been spoken
      const pollMetering = async () => {
        if (!shouldListenRef.current || recordingRef.current !== activeRecording) return;

        let status: Awaited<ReturnType<typeof activeRecording.getStatusAsync>>;
        try {
          status = await activeRecording.getStatusAsync();
        } catch {
          return;
        }

        if (!status.isRecording) return;

        const metering = status.metering ?? -160;
        const elapsed = Date.now() - chunkStartTimeRef.current;

        if (metering > SPEECH_THRESHOLD) {
          // Speech detected
          speechDetectedRef.current = true;
          silenceStartRef.current = null;
        } else if (metering < SILENCE_THRESHOLD && speechDetectedRef.current) {
          // Silence after speech
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current >= SILENCE_AFTER_SPEECH_MS && elapsed >= MIN_CHUNK_MS) {
            // End of utterance — transcribe immediately
            finishChunkRef.current(activeRecording);
            return;
          }
        }

        // Force transcribe after max chunk duration
        if (elapsed >= MAX_CHUNK_MS) {
          finishChunkRef.current(activeRecording);
          return;
        }

        meteringTimerRef.current = setTimeout(pollMetering, METERING_POLL_MS);
      };

      meteringTimerRef.current = setTimeout(pollMetering, METERING_POLL_MS);
    } catch (err) {
      startingRef.current = false;
      startFailureCountRef.current += 1;
      console.warn('[VOICE] Failed to start chunk:', err);

      // Release the recorder we just created. If prepareToRecordAsync succeeded
      // but a later step threw, this object still holds expo-av's single global
      // "prepared recorder" slot — leaving it would make every future prepare
      // fail with "Only one Recording object can be prepared at a given time".
      if (recording) {
        recordingRef.current = null;
        await safeUnload(recording);
      }

      // A failed prepare can leave the iOS audio session wedged, so toggling
      // recording off resets it before the next attempt — without this the same
      // error repeats forever.
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch { /* ignore */ }

      if (!shouldListenRef.current) return;

      if (startFailureCountRef.current >= MAX_START_FAILURES) {
        // Give up gracefully instead of spamming errors; surface a message and
        // stop listening so the user can retry by toggling the set.
        remoteLog('voice_error', { reason: 'recorder_prepare', message: String(err).slice(0, 200) });
        setError("Couldn't start the mic — tap End Set, then start a new set");
        shouldListenRef.current = false;
        setIsListening(false);
        return;
      }
      // Back off a touch longer each time while the session recovers.
      meteringTimerRef.current = setTimeout(() => startChunk(), 400 * startFailureCountRef.current);
    }
  }, []);

  const startListening = useCallback(async () => {
    if (shouldListenRef.current) return;

    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      setError('Microphone permission denied');
      return;
    }

    setError(null);
    lastCountedRef.current = 0;
    startFailureCountRef.current = 0;
    startingRef.current = false;
    shouldListenRef.current = true;
    setIsListening(true);
    console.log('[VOICE] Listening started');
    await startChunk();
  }, [startChunk]);

  const stopListening = useCallback(async () => {
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
      // Claim teardown so a chunk finishing at this exact moment can't also
      // stop-and-unload the same recorder (double unload crashes native).
      if (claimTeardown(rec)) {
        try {
          const status = await rec.getStatusAsync();
          const uri = rec.getURI();
          await rec.stopAndUnloadAsync();
          if ((status.durationMillis ?? 0) >= MIN_CHUNK_MS && uri) {
            transcribeAndProcess(uri);
          }
        } catch { /* ignore */ }
      }
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    setIsListening(false);
    console.log('[VOICE] Listening stopped');
  }, [transcribeAndProcess]);

  // Start a fresh count without stopping the mic. Used when the user switches
  // exercises mid-set: reps are counted UP from the last number heard, so a
  // leftover count (e.g. 7 from the previous exercise) would swallow every "1,
  // 2, 3…" on the new one. Zeroing it here makes the new exercise count again.
  const resetCount = useCallback(() => {
    lastCountedRef.current = 0;
  }, []);

  useEffect(() => {
    if (!isActive && shouldListenRef.current) stopListening();
  }, [isActive, stopListening]);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (meteringTimerRef.current) clearTimeout(meteringTimerRef.current);
      if (recordingRef.current) {
        const rec = recordingRef.current;
        recordingRef.current = null;
        // Unloading here releases expo-av's global slot so the recorder is not
        // orphaned across remounts — the most common cause of the wedge.
        // safeUnload guards against double-unload if a chunk is finishing too.
        safeUnload(rec);
      }
    };
  }, []);

  return { isListening, isProcessing, lastTranscription, error, startListening, stopListening, resetCount };
}
