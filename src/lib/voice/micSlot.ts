import { Audio } from 'expo-av';
import { requireNativeModule } from 'expo-modules-core';

// expo-av allows only ONE prepared Recording across the entire JS runtime. Both
// voice hooks record audio — useVoiceCounting (rep numbers) and useVoiceCommands
// (Timed "start"/"stop") — and the app hands the mic from one to the other when
// you switch between a voice exercise and a Timed one mid-workout.
//
// Previously each hook tracked its own recorder in a private module variable, so
// neither could release a recorder the OTHER hook had orphaned. During a handoff
// they raced on iOS's single AVAudioRecorder, wedging the audio session (and, at
// worst, crashing native) until a full app restart. This module is the single
// shared owner of that slot so whichever hook starts next always tears down the
// previous recorder — no matter which hook created it — before preparing.

// Direct handle to expo-av's native recorder module. Wrapped in try/catch so a
// missing/renamed native module can never crash the app — voice just degrades.
let ExponentAV: { stopAudioRecording?: () => Promise<unknown>; unloadAudioRecorder?: () => Promise<unknown> } | null = null;
try {
  ExponentAV = requireNativeModule('ExponentAV');
} catch {
  ExponentAV = null;
}

// The recorder currently holding expo-av's global slot, shared across both hooks.
let activeRecording: Audio.Recording | null = null;

// Recorders whose teardown has already begun. On iOS, calling
// stopAndUnloadAsync() (or getStatusAsync()) twice on the SAME Recording can
// crash native — and that double call happens easily when a chunk finishes at
// the exact moment a set ends (finishChunk and stopListening both grab the same
// recorder). This set makes teardown claimable exactly once per recorder so only
// one path ever touches the native object. Weak so unloaded recorders can be GC'd.
const tearingDown = new WeakSet<Audio.Recording>();

// Atomically claim the right to tear down `rec`. Returns true for the FIRST
// caller (which must then stop/unload it) and false for every later caller
// (which must not touch it). Because JS is single-threaded, the check-and-add is
// atomic, so two concurrent code paths can never both unload the same recorder.
export function claimTeardown(rec: Audio.Recording): boolean {
  if (tearingDown.has(rec)) return false;
  tearingDown.add(rec);
  if (activeRecording === rec) activeRecording = null;
  return true;
}

// Fire-and-forget safe unload for paths that don't need the URI/duration first.
// No-op if another path already claimed this recorder's teardown.
export async function safeUnload(rec: Audio.Recording | null | undefined): Promise<void> {
  if (!rec || !claimTeardown(rec)) return;
  try {
    const status = await rec.getStatusAsync();
    if (status.isRecording) {
      await rec.stopAndUnloadAsync();
    } else if (status.canRecord) {
      // Just unload if it was prepared but not started
      await rec.stopAndUnloadAsync();
    }
  } catch {
    /* already unloaded or in invalid state */
  }
}

// Claim the slot for a freshly-started recorder.
export function setActiveRecording(rec: Audio.Recording): void {
  activeRecording = rec;
}

// Release the slot, but only if `rec` is still the one holding it (so a late
// cleanup from an old recorder can't clobber a newer one).
export function clearActiveRecording(rec: Audio.Recording): void {
  if (activeRecording === rec) activeRecording = null;
}

// Cheap, normal-path cleanup: unload whatever recorder still holds the slot
// (from either hook) before preparing the next one. No-op once it's cleared.
export async function releaseActiveRecorder(): Promise<void> {
  await safeUnload(activeRecording);
}

// Heavy recovery for when prepare reports the slot is stuck and no JS object
// holds it (a Fast Refresh / remount / reload orphaned it). Calling expo-av's
// NATIVE module tears down the iOS recorder regardless of which JS object
// prepared it AND emits the `recorderUnloaded` event that flips expo-av's stuck
// `_recorderExists` flag back to false — the only thing that frees a truly
// orphaned recorder without a full app restart.
export async function forceResetNativeRecorder(): Promise<void> {
  activeRecording = null;
  if (!ExponentAV) return;
  try { await ExponentAV.stopAudioRecording?.(); } catch { /* not recording */ }
  try { await ExponentAV.unloadAudioRecorder?.(); } catch { /* nothing loaded */ }
}
