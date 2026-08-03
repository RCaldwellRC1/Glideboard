import { useEffect, useRef, useState, useCallback } from 'react';
import { DeviceMotion, Accelerometer } from 'expo-sensors';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import type {
  MotionState,
  MotionThresholds,
  Vector3,
  Rotation,
} from './types';
import { DEFAULT_THRESHOLDS, INITIAL_MOTION_STATE } from './types';
import {
  smoothVector3,
  smoothRotation,
  calculateMagnitude,
  calculateTiltAngle,
  determineTiltDirection,
  determineMotionDirection,
  isDeviceStationary,
} from './utils';

/**
 * WHY THIS HOOK HAS A FALLBACK PATH
 *
 * Rep counting reads `accelerationIncludingGravity`. On iOS that arrives from
 * expo-sensors' DeviceMotion on every device. On Android, DeviceMotion is a
 * COMPOSITE sensor and it fails in two silent ways:
 *
 *  1. `DeviceMotion.isAvailableAsync()` returns false unless the device has ALL
 *     of gyroscope, accelerometer, linear-acceleration, rotation-vector and
 *     gravity. Plenty of Android tablets have no gyroscope, so the whole motion
 *     pipeline never starts — no error, no crash, just zero reps forever.
 *  2. Even when it reports available, the native module only emits
 *     `accelerationIncludingGravity` once BOTH an accelerometer and a gravity
 *     event have landed. If gravity never fires we get `{0,0,0}` samples, which
 *     look like a perfectly still device rather than a broken sensor.
 *
 * So: try DeviceMotion first (it carries rotation data too), then PROVE it is
 * producing usable samples. If it doesn't within `PROBE_TIMEOUT_MS`, fall back
 * to the plain Accelerometer — one sensor, no cross-sensor gating, present on
 * essentially every phone and tablet. Everything the caller sees is normalised
 * to m/s² so thresholds tuned on iOS keep working.
 */

/** Standard gravity — converts the Accelerometer's g-force units to m/s². */
const GRAVITY_MS2 = 9.80665;
/** How long a sensor gets to produce one usable sample before we give up on it. */
const PROBE_TIMEOUT_MS = 1500;
/** No samples for this long while subscribed = the stream stalled. */
const STALL_TIMEOUT_MS = 3000;
/** How often the throttled diagnostics snapshot is refreshed. */
const DIAGNOSTICS_INTERVAL_MS = 500;
/** A real gravity-bearing sample sits near 9.8 m/s²; anything this small is noise or zeros. */
const MIN_USABLE_MAGNITUDE = 0.5;
/** Cap auto-recovery attempts so a genuinely dead sensor can't spin forever. */
const MAX_AUTO_RESTARTS = 3;
/** Low-pass coefficient used to peel gravity out of raw accelerometer samples. */
const GRAVITY_FILTER_ALPHA = 0.05;

/** Which underlying sensor is currently feeding the rep counter. */
export type MotionSensorSource = 'device-motion' | 'accelerometer' | 'none';

export interface MotionDiagnostics {
  /** Sensor currently subscribed, or 'none' if nothing could be started. */
  source: MotionSensorSource;
  /** Result of DeviceMotion.isAvailableAsync() — null until probed. */
  deviceMotionAvailable: boolean | null;
  /** Result of Accelerometer.isAvailableAsync() — null until probed. */
  accelerometerAvailable: boolean | null;
  /** Total samples received since the current subscription started. */
  sampleCount: number;
  /** Samples that actually carried gravity-bearing data (not {0,0,0}). */
  usableSampleCount: number;
  /** Measured delivery rate over the last diagnostics window. */
  sampleRateHz: number;
  /** Timestamp of the most recent sample, or null if none has arrived. */
  lastSampleAt: number | null;
  /** True when subscribed AND fresh usable samples are flowing. */
  isHealthy: boolean;
  /** Human-readable reason motion counting can't work, or null when fine. */
  error: string | null;
  /** How many times the watchdog has restarted the subscription. */
  restartCount: number;
}

export const INITIAL_DIAGNOSTICS: MotionDiagnostics = {
  source: 'none',
  deviceMotionAvailable: null,
  accelerometerAvailable: null,
  sampleCount: 0,
  usableSampleCount: 0,
  sampleRateHz: 0,
  lastSampleAt: null,
  isHealthy: false,
  error: null,
  restartCount: 0,
};

interface UseMotionOptions {
  /** Update interval in milliseconds (default: 16ms = ~60fps) */
  updateInterval?: number;
  /** Smoothing factor 0-1 (higher = more responsive, default: 0.2) */
  smoothingFactor?: number;
  /** Custom thresholds for motion detection */
  thresholds?: Partial<MotionThresholds>;
  /** Whether to start listening immediately (default: true) */
  autoStart?: boolean;
  /** Called whenever the resolved sensor source or error changes (for logging) */
  onStatusChange?: (diagnostics: MotionDiagnostics) => void;
}

interface UseMotionResult {
  /** Current motion state */
  motion: MotionState;
  /** Whether ANY usable sensor was found on this device */
  isAvailable: boolean;
  /** Whether currently subscribed to a sensor */
  isListening: boolean;
  /** Live sensor health — use this to show the user when counting can't work */
  diagnostics: MotionDiagnostics;
  /** Start listening (probes DeviceMotion, falls back to Accelerometer) */
  start: () => Promise<void>;
  /** Stop listening to sensor */
  stop: () => void;
  /** Tear down and re-probe from scratch (resets the restart counter) */
  restart: () => Promise<void>;
  /** Current thresholds (can be updated) */
  thresholds: MotionThresholds;
  /** Update thresholds */
  setThresholds: (thresholds: Partial<MotionThresholds>) => void;
}

/** Minimal shape shared by both sensors' subscription handles. */
type SensorSubscription = { remove: () => void };

export function useMotion(options: UseMotionOptions = {}): UseMotionResult {
  const {
    updateInterval = 16,
    smoothingFactor = 0.2,
    thresholds: initialThresholds = {},
    autoStart = true,
    onStatusChange,
  } = options;

  const [motion, setMotion] = useState<MotionState>(INITIAL_MOTION_STATE);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [diagnostics, setDiagnostics] = useState<MotionDiagnostics>(INITIAL_DIAGNOSTICS);
  const [thresholds, setThresholdsState] = useState<MotionThresholds>({
    ...DEFAULT_THRESHOLDS,
    ...initialThresholds,
  });

  // Config read inside listeners lives in refs so start()/stop() can stay
  // referentially stable — otherwise every threshold tweak would resubscribe
  // the sensor mid-set.
  const thresholdsRef = useRef<MotionThresholds>(thresholds);
  const configRef = useRef({ updateInterval, smoothingFactor });
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => { thresholdsRef.current = thresholds; }, [thresholds]);
  useEffect(() => { configRef.current = { updateInterval, smoothingFactor }; }, [updateInterval, smoothingFactor]);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);

  // Refs for smoothing (persist across renders)
  const prevAcceleration = useRef<Vector3>({ x: 0, y: 0, z: 0 });
  const prevAccelGravity = useRef<Vector3>({ x: 0, y: 0, z: 0 });
  const prevRotation = useRef<Rotation>({ alpha: 0, beta: 0, gamma: 0 });
  const prevRotationRate = useRef<Rotation>({ alpha: 0, beta: 0, gamma: 0 });
  // The smoothing filter starts from zero, so the first samples after a
  // (re)subscribe would ramp 0 -> 9.8 and read as a big phantom movement.
  // Seeding from the first real sample avoids that spike mid-set.
  const smoothingPrimed = useRef(false);

  // Subscription + watchdog timers
  const subscriptionRef = useRef<SensorSubscription | null>(null);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Track sustained motion
  const motionStartTime = useRef<number | null>(null);

  // Live counters. These tick at 60Hz, so they are refs (not state) and get
  // published to React on a slow interval instead of every sample.
  const statsRef = useRef({
    source: 'none' as MotionSensorSource,
    deviceMotionAvailable: null as boolean | null,
    accelerometerAvailable: null as boolean | null,
    sampleCount: 0,
    usableSampleCount: 0,
    lastSampleAt: null as number | null,
    error: null as string | null,
    restartCount: 0,
  });
  const rateWindowRef = useRef({ at: Date.now(), count: 0 });

  // Gravity estimate for the accelerometer fallback. The raw sensor reports
  // gravity and user motion summed together; a slow low-pass filter tracks the
  // gravity component so the remainder can stand in for linear acceleration.
  const gravityEstimate = useRef<Vector3>({ x: 0, y: 0, z: 0 });
  const gravityPrimed = useRef(false);

  const setThresholds = useCallback((newThresholds: Partial<MotionThresholds>) => {
    setThresholdsState(prev => ({ ...prev, ...newThresholds }));
  }, []);

  /** Shared pipeline: smooth a raw sample, derive state, push it to React. */
  const publishSample = useCallback((raw: {
    acceleration: Vector3;
    accelerationIncludingGravity: Vector3;
    rotation: Rotation;
    rotationRate: Rotation;
    orientation: number;
  }) => {
    const { smoothingFactor: smoothing } = configRef.current;
    const activeThresholds = thresholdsRef.current;

    // Count the sample before anything can bail — the watchdog needs to know
    // the difference between "no data" and "data that decodes to nothing".
    const stats = statsRef.current;
    stats.sampleCount += 1;
    stats.lastSampleAt = Date.now();
    rateWindowRef.current.count += 1;
    if (calculateMagnitude(raw.accelerationIncludingGravity) > MIN_USABLE_MAGNITUDE) {
      stats.usableSampleCount += 1;
    }

    if (!smoothingPrimed.current) {
      smoothingPrimed.current = true;
      prevAcceleration.current = raw.acceleration;
      prevAccelGravity.current = raw.accelerationIncludingGravity;
      prevRotation.current = raw.rotation;
      prevRotationRate.current = raw.rotationRate;
    }

    // Apply smoothing
    const smoothedAccel = smoothVector3(raw.acceleration, prevAcceleration.current, smoothing);
    const smoothedAccelGravity = smoothVector3(raw.accelerationIncludingGravity, prevAccelGravity.current, smoothing);
    const smoothedRotation = smoothRotation(raw.rotation, prevRotation.current, smoothing);
    const smoothedRotationRate = smoothRotation(raw.rotationRate, prevRotationRate.current, smoothing);

    // Update refs
    prevAcceleration.current = smoothedAccel;
    prevAccelGravity.current = smoothedAccelGravity;
    prevRotation.current = smoothedRotation;
    prevRotationRate.current = smoothedRotationRate;

    // Calculate derived values
    const accelerationMagnitude = calculateMagnitude(smoothedAccel);
    const tiltAngle = calculateTiltAngle(smoothedAccelGravity);
    const tiltDirection = determineTiltDirection(smoothedRotation, activeThresholds);
    const motionDirection = determineMotionDirection(smoothedAccel, activeThresholds);
    const stationary = isDeviceStationary(smoothedAccel, activeThresholds);

    // Track sustained motion
    const now = Date.now();
    if (!stationary) {
      if (motionStartTime.current === null) {
        motionStartTime.current = now;
      }
    } else {
      motionStartTime.current = null;
    }

    const sustainedMotion =
      motionStartTime.current !== null &&
      now - motionStartTime.current >= activeThresholds.sustainedMotionDuration;

    const isTilting = tiltDirection !== 'none';
    const isMoving = sustainedMotion && motionDirection !== 'none';

    setMotion({
      acceleration: smoothedAccel,
      accelerationIncludingGravity: smoothedAccelGravity,
      rotation: smoothedRotation,
      rotationRate: smoothedRotationRate,
      tiltDirection,
      motionDirection,
      tiltAngle,
      accelerationMagnitude,
      isStationary: stationary,
      isTilting,
      isMoving,
      orientation: deviceOrientationOf(raw.orientation),
    });
  }, []);

  /** Drop the current subscription and any pending probe. */
  const teardown = useCallback(() => {
    if (probeTimerRef.current) {
      clearTimeout(probeTimerRef.current);
      probeTimerRef.current = null;
    }
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    teardown();
    statsRef.current.source = 'none';
    setIsListening(false);
  }, [teardown]);

  /** Reset per-subscription counters so a probe measures only the new stream. */
  const resetSampleStats = useCallback(() => {
    const stats = statsRef.current;
    stats.sampleCount = 0;
    stats.usableSampleCount = 0;
    stats.lastSampleAt = null;
    rateWindowRef.current = { at: Date.now(), count: 0 };
    gravityPrimed.current = false;
    gravityEstimate.current = { x: 0, y: 0, z: 0 };
    smoothingPrimed.current = false;
  }, []);

  /**
   * Subscribe to the plain Accelerometer. Values arrive in g-force including
   * gravity, so they scale to exactly the same m/s² signal iOS DeviceMotion
   * reports — the rep thresholds need no per-platform tuning.
   */
  const startAccelerometer = useCallback(async (): Promise<boolean> => {
    const stats = statsRef.current;
    let available = false;
    try {
      available = await Accelerometer.isAvailableAsync();
    } catch (err) {
      console.warn('[MOTION] Accelerometer.isAvailableAsync threw:', err);
    }
    stats.accelerometerAvailable = available;

    if (!available || !isMountedRef.current) {
      // Nothing left to try. Drop any half-working DeviceMotion subscription so
      // we aren't holding a sensor open that produces no usable data.
      teardown();
      resetSampleStats();
      stats.source = 'none';
      stats.error = 'No motion sensor found on this device. Switch to Voice counting.';
      setIsListening(false);
      return false;
    }

    teardown();
    resetSampleStats();
    Accelerometer.setUpdateInterval(configRef.current.updateInterval);

    subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
      // g-force -> m/s²
      const total: Vector3 = { x: x * GRAVITY_MS2, y: y * GRAVITY_MS2, z: z * GRAVITY_MS2 };

      // Track gravity with a slow filter, then treat the remainder as linear
      // acceleration. Seed it from the first sample so the estimate doesn't
      // have to climb from zero (which would read as a huge phantom motion).
      if (!gravityPrimed.current) {
        gravityEstimate.current = total;
        gravityPrimed.current = true;
      } else {
        const g = gravityEstimate.current;
        gravityEstimate.current = {
          x: g.x + GRAVITY_FILTER_ALPHA * (total.x - g.x),
          y: g.y + GRAVITY_FILTER_ALPHA * (total.y - g.y),
          z: g.z + GRAVITY_FILTER_ALPHA * (total.z - g.z),
        };
      }
      const g = gravityEstimate.current;

      publishSample({
        acceleration: { x: total.x - g.x, y: total.y - g.y, z: total.z - g.z },
        accelerationIncludingGravity: total,
        // The accelerometer has no gyroscope behind it, so there is no absolute
        // orientation to report. tiltAngle is still derived from gravity above.
        rotation: { alpha: 0, beta: 0, gamma: 0 },
        rotationRate: { alpha: 0, beta: 0, gamma: 0 },
        orientation: 0,
      });
    });

    stats.source = 'accelerometer';
    stats.error = null;
    setIsListening(true);
    console.log('[MOTION] Subscribed via Accelerometer fallback');
    return true;
  }, [publishSample, resetSampleStats, teardown]);

  /** Subscribe to DeviceMotion and schedule the "is it actually emitting?" probe. */
  const startDeviceMotion = useCallback(async (): Promise<boolean> => {
    const stats = statsRef.current;
    let available = false;
    try {
      available = await DeviceMotion.isAvailableAsync();
    } catch (err) {
      console.warn('[MOTION] DeviceMotion.isAvailableAsync threw:', err);
    }
    stats.deviceMotionAvailable = available;

    if (!available || !isMountedRef.current) {
      // Expected on Android hardware missing a gyroscope — not fatal, the
      // accelerometer fallback covers it.
      console.log('[MOTION] DeviceMotion unavailable, falling back to Accelerometer');
      return false;
    }

    teardown();
    resetSampleStats();
    DeviceMotion.setUpdateInterval(configRef.current.updateInterval);

    subscriptionRef.current = DeviceMotion.addListener((data) => {
      const rawAcceleration: Vector3 = data.acceleration ?? { x: 0, y: 0, z: 0 };
      const rawAccelGravity: Vector3 = data.accelerationIncludingGravity ?? { x: 0, y: 0, z: 0 };

      // Rotation comes in radians - convert to degrees
      const rawRotation: Rotation = data.rotation
        ? {
            alpha: data.rotation.alpha * (180 / Math.PI),
            beta: data.rotation.beta * (180 / Math.PI),
            gamma: data.rotation.gamma * (180 / Math.PI),
          }
        : { alpha: 0, beta: 0, gamma: 0 };
      const rawRotationRate: Rotation = data.rotationRate ?? { alpha: 0, beta: 0, gamma: 0 };

      publishSample({
        acceleration: rawAcceleration,
        accelerationIncludingGravity: rawAccelGravity,
        rotation: rawRotation,
        rotationRate: rawRotationRate,
        orientation: data.orientation ?? 0,
      });
    });

    stats.source = 'device-motion';
    stats.error = null;
    setIsListening(true);

    // DeviceMotion can report "available" and still deliver nothing usable
    // (see the header comment). Give it a moment, then verify.
    probeTimerRef.current = setTimeout(() => {
      probeTimerRef.current = null;
      if (!isMountedRef.current) return;
      if (statsRef.current.usableSampleCount > 0) return;
      console.warn(
        `[MOTION] DeviceMotion produced no usable samples in ${PROBE_TIMEOUT_MS}ms ` +
        `(${statsRef.current.sampleCount} empty samples) — switching to Accelerometer`,
      );
      startAccelerometer();
    }, PROBE_TIMEOUT_MS);

    console.log('[MOTION] Subscribed via DeviceMotion');
    return true;
  }, [publishSample, resetSampleStats, teardown, startAccelerometer]);

  const start = useCallback(async () => {
    if (Platform.OS === 'web') {
      statsRef.current.source = 'none';
      statsRef.current.error = 'Motion counting is not supported in the web preview.';
      return;
    }
    const startedDeviceMotion = await startDeviceMotion();
    if (!startedDeviceMotion) {
      await startAccelerometer();
    }
  }, [startDeviceMotion, startAccelerometer]);

  const restart = useCallback(async () => {
    statsRef.current.restartCount = 0;
    statsRef.current.error = null;
    stop();
    await start();
  }, [start, stop]);

  // Auto-start on mount
  useEffect(() => {
    isMountedRef.current = true;
    if (autoStart) {
      start();
    }
    return () => {
      isMountedRef.current = false;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Publish diagnostics + run the stall watchdog on a slow timer. Doing this
  // here (rather than per sample) keeps a 60Hz sensor from causing 60 extra
  // re-renders a second.
  useEffect(() => {
    const tick = () => {
      const stats = statsRef.current;
      const now = Date.now();

      // Measured rate over the window since the last tick.
      const window = rateWindowRef.current;
      const elapsedMs = Math.max(1, now - window.at);
      const sampleRateHz = Math.round((window.count / elapsedMs) * 1000);
      rateWindowRef.current = { at: now, count: 0 };

      const fresh = stats.lastSampleAt !== null && now - stats.lastSampleAt < STALL_TIMEOUT_MS;
      const healthy = stats.source !== 'none' && fresh && stats.usableSampleCount > 0;

      // A recovered sensor gets its retry budget back, so a stall much later in
      // the session is still auto-repaired.
      if (healthy && stats.restartCount > 0) {
        stats.restartCount = 0;
      }

      // Watchdog: we're subscribed but the stream died (sensor service dropped
      // us). Re-probe from scratch. Backgrounded apps stop receiving sensor
      // events by design, so don't spend the retry budget there — the AppState
      // listener below re-arms on resume.
      const stalled =
        appStateRef.current === 'active' &&
        stats.source !== 'none' &&
        stats.lastSampleAt !== null &&
        now - stats.lastSampleAt >= STALL_TIMEOUT_MS;

      if (stalled && stats.restartCount < MAX_AUTO_RESTARTS && probeTimerRef.current === null) {
        stats.restartCount += 1;
        console.warn(`[MOTION] Sensor stalled — restart attempt ${stats.restartCount}/${MAX_AUTO_RESTARTS}`);
        start();
      } else if (stalled && stats.restartCount >= MAX_AUTO_RESTARTS) {
        stats.error = 'The motion sensor stopped responding. Switch to Voice counting.';
      }

      const next: MotionDiagnostics = {
        source: stats.source,
        deviceMotionAvailable: stats.deviceMotionAvailable,
        accelerometerAvailable: stats.accelerometerAvailable,
        sampleCount: stats.sampleCount,
        usableSampleCount: stats.usableSampleCount,
        sampleRateHz,
        lastSampleAt: stats.lastSampleAt,
        isHealthy: healthy,
        error: stats.error,
        restartCount: stats.restartCount,
      };

      setDiagnostics(prev => (diagnosticsEqual(prev, next) ? prev : next));
    };

    const interval = setInterval(tick, DIAGNOSTICS_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [start]);

  // Android tears the sensor subscription down when the app backgrounds and
  // doesn't always resume cleanly. Re-probe on resume so the user never comes
  // back to a dead rep counter.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (next !== 'active' || previous === 'active') return;

      const stats = statsRef.current;
      const stale =
        stats.source === 'none' ||
        stats.lastSampleAt === null ||
        Date.now() - stats.lastSampleAt >= STALL_TIMEOUT_MS;
      if (stale) {
        stats.restartCount = 0;
        start();
      }
    });
    return () => sub.remove();
  }, [start]);

  // Surface source/health/error transitions to the caller (used for logging).
  const lastReportedRef = useRef<string>('');
  useEffect(() => {
    const signature = `${diagnostics.source}|${diagnostics.isHealthy}|${diagnostics.error ?? ''}`;
    if (signature === lastReportedRef.current) return;
    lastReportedRef.current = signature;
    onStatusChangeRef.current?.(diagnostics);
  }, [diagnostics]);

  return {
    motion,
    isAvailable: diagnostics.source !== 'none',
    isListening,
    diagnostics,
    start,
    stop,
    restart,
    thresholds,
    setThresholds,
  };
}

/** Coerce whatever the platform reports into the 0/90/180/-90 set we document. */
function deviceOrientationOf(value: number): number {
  if (value === 270) return -90;
  return value === 90 || value === 180 || value === -90 ? value : 0;
}

/**
 * Compare only the fields that should trigger a re-render. `sampleCount` and
 * `lastSampleAt` change on every tick by design, so they are deliberately
 * excluded — consumers care about health, not the raw counter.
 */
function diagnosticsEqual(a: MotionDiagnostics, b: MotionDiagnostics): boolean {
  return (
    a.source === b.source &&
    a.isHealthy === b.isHealthy &&
    a.error === b.error &&
    a.deviceMotionAvailable === b.deviceMotionAvailable &&
    a.accelerometerAvailable === b.accelerometerAvailable &&
    a.restartCount === b.restartCount &&
    // Rate is only shown in the diagnostics panel; bucket it so small jitter
    // doesn't re-render the tracker screen twice a second.
    Math.round(a.sampleRateHz / 5) === Math.round(b.sampleRateHz / 5) &&
    a.usableSampleCount > 0 === b.usableSampleCount > 0
  );
}
