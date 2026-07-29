import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const DEVICE_ID_KEY = 'device-id';

// Stable per-device ID (persists across restarts)
let deviceId = `dev-${Math.random().toString(36).slice(2, 10)}`;
let sessionUser = deviceId;

export async function initRemoteLog(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      deviceId = stored;
    } else {
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    // Only update sessionUser if profile hasn't overridden it yet
    if (!sessionUser || sessionUser === deviceId || sessionUser.startsWith('dev-')) {
      sessionUser = deviceId;
    }
  } catch {
    // Keep the randomly generated deviceId as fallback
  }
}

export function setRemoteLogUser(tag: string) {
  sessionUser = tag;
}

export function getDeviceId(): string {
  return deviceId;
}

// Resolve the persistent device ID, loading (or creating) it from storage.
// Unlike getDeviceId(), this guarantees the stored ID is used even if called
// before initRemoteLog() has finished — critical for the unlock/claim flow,
// where a transient random ID would tie the purchase to the wrong device.
export async function ensureDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      deviceId = stored;
    } else {
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch {
    // Keep the in-memory fallback ID.
  }
  return deviceId;
}

export function remoteLog(event: string, data?: Record<string, unknown>) {
  if (!BACKEND_URL) return;
  fetch(`${BACKEND_URL}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: sessionUser,
      deviceId,
      event,
      data: data ?? {},
    }),
  }).catch(() => {}); // fire-and-forget, never block the UI
}
