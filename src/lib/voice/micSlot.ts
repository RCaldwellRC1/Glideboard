import { Audio } from 'expo-av';
import { requireNativeModule } from 'expo-modules-core';

// expo-av allows only ONE prepared Recording across the entire JS runtime.
let ExponentAV: { stopAudioRecording?: () => Promise<unknown>; unloadAudioRecorder?: () => Promise<unknown> } | null = null;
try {
  ExponentAV = requireNativeModule('ExponentAV');
} catch {
  ExponentAV = null;
}

let activeRecording: Audio.Recording | null = null;
const tearingDown = new WeakSet<Audio.Recording>();

export function claimTeardown(rec: Audio.Recording): boolean {
  if (tearingDown.has(rec)) return false;
  tearingDown.add(rec);
  if (activeRecording === rec) activeRecording = null;
  return true;
}

export async function safeUnload(rec: Audio.Recording | null | undefined): Promise<void> {
  if (!rec || !claimTeardown(rec)) return;
  try {
    const status = await rec.getStatusAsync();
    if (status.isRecording) {
      await rec.stopAndUnloadAsync();
    } else if (status.canRecord) {
      await rec.stopAndUnloadAsync();
    }
  } catch {
    /* already unloaded */
  }
}

export function setActiveRecording(rec: Audio.Recording): void {
  activeRecording = rec;
}

export function clearActiveRecording(rec: Audio.Recording): void {
  if (activeRecording === rec) activeRecording = null;
}

export async function releaseActiveRecorder(): Promise<void> {
  if (activeRecording) {
    await safeUnload(activeRecording);
  }
  // Force reset the native module to clear any "ghost" locks
  await forceResetNativeRecorder();
}

export async function forceResetNativeRecorder(): Promise<void> {
  activeRecording = null;
  if (!ExponentAV) return;
  try { await ExponentAV.stopAudioRecording?.(); } catch { }
  try { await ExponentAV.unloadAudioRecorder?.(); } catch { }
}
