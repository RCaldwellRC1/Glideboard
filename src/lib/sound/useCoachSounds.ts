import { useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';

// Preloads and plays the three short countdown cues used by Timed exercises:
//   • marker  — soft beep at each 10-second boundary
//   • tick    — sharp beep for each of the final 10 seconds
//   • whistle — coach's whistle at zero
//
// All three are tiny, self-generated mp3s bundled in assets/sounds (no network,
// no cost). We keep one loaded Sound per cue and `replayAsync()` it, which
// restarts playback from 0 even if the previous play hasn't finished.
const MARKER = require('../../../assets/sounds/marker.mp3');
const TICK = require('../../../assets/sounds/tick.mp3');
const WHISTLE = require('../../../assets/sounds/whistle.mp3');

export function useCoachSounds() {
  const markerRef = useRef<Audio.Sound | null>(null);
  const tickRef = useRef<Audio.Sound | null>(null);
  const whistleRef = useRef<Audio.Sound | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Let cues sound even when the phone's ringer is on silent. We
        // deliberately don't touch allowsRecordingIOS here so we never fight
        // the voice recorder's own audio-session management.
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

        // Loud source files played at full volume so the cues carry across a
        // noisy room / gym: marker & tick are full-scale synthesized tones (the
        // old ones were ~130ms clicks that were too short to sound loud), and
        // the whistle is amplified.
        const [m, t, w] = await Promise.all([
          Audio.Sound.createAsync(MARKER, { volume: 1.0 }),
          Audio.Sound.createAsync(TICK, { volume: 1.0 }),
          Audio.Sound.createAsync(WHISTLE, { volume: 1.0 }),
        ]);
        if (cancelled) {
          m.sound.unloadAsync();
          t.sound.unloadAsync();
          w.sound.unloadAsync();
          return;
        }
        markerRef.current = m.sound;
        tickRef.current = t.sound;
        whistleRef.current = w.sound;
        loadedRef.current = true;
      } catch (err) {
        console.warn('[SOUND] Failed to preload coach sounds:', err);
      }
    })();

    return () => {
      cancelled = true;
      markerRef.current?.unloadAsync();
      tickRef.current?.unloadAsync();
      whistleRef.current?.unloadAsync();
      markerRef.current = null;
      tickRef.current = null;
      whistleRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  const play = useCallback((ref: React.MutableRefObject<Audio.Sound | null>) => {
    const sound = ref.current;
    if (!sound) return;
    // replayAsync restarts from 0; ignore errors so a missed cue never throws
    // into the countdown loop.
    sound.replayAsync().catch(() => {});
  }, []);

  const playMarker = useCallback(() => play(markerRef), [play]);
  const playTick = useCallback(() => play(tickRef), [play]);
  const playWhistle = useCallback(() => play(whistleRef), [play]);

  return { playMarker, playTick, playWhistle };
}
