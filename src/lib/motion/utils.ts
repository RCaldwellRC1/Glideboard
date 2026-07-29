import type { Vector3, Rotation, TiltDirection, MotionDirection, MotionThresholds } from './types';

/**
 * Low-pass filter for smoothing sensor data
 * Higher alpha = more responsive but noisier
 * Lower alpha = smoother but more latency
 */
export function lowPassFilter(
  current: number,
  previous: number,
  alpha: number = 0.2
): number {
  return previous + alpha * (current - previous);
}

export function smoothVector3(
  current: Vector3,
  previous: Vector3,
  alpha: number = 0.2
): Vector3 {
  return {
    x: lowPassFilter(current.x, previous.x, alpha),
    y: lowPassFilter(current.y, previous.y, alpha),
    z: lowPassFilter(current.z, previous.z, alpha),
  };
}

export function smoothRotation(
  current: Rotation,
  previous: Rotation,
  alpha: number = 0.2
): Rotation {
  return {
    alpha: lowPassFilter(current.alpha, previous.alpha, alpha),
    beta: lowPassFilter(current.beta, previous.beta, alpha),
    gamma: lowPassFilter(current.gamma, previous.gamma, alpha),
  };
}

/**
 * Calculate magnitude of acceleration vector
 */
export function calculateMagnitude(vector: Vector3): number {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
}

/**
 * Normalize vector to unit length
 */
export function normalizeVector(vector: Vector3): Vector3 {
  const magnitude = calculateMagnitude(vector);
  if (magnitude === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

/**
 * Calculate tilt angle from vertical (flat = 0°)
 * Uses gravity vector from accelerometer
 */
export function calculateTiltAngle(gravity: Vector3): number {
  // When flat, z should be ~9.8 (or -9.8 depending on orientation)
  // Tilt angle is the angle from the vertical axis
  const magnitude = calculateMagnitude(gravity);
  if (magnitude === 0) return 0;

  // z component represents alignment with gravity
  // cos(angle) = z / magnitude
  const cosAngle = Math.abs(gravity.z) / magnitude;
  const angleRad = Math.acos(Math.min(1, Math.max(-1, cosAngle)));
  return angleRad * (180 / Math.PI);
}

/**
 * Determine tilt direction based on rotation/gravity
 */
export function determineTiltDirection(
  rotation: Rotation,
  thresholds: MotionThresholds
): TiltDirection {
  const { beta, gamma } = rotation;
  const threshold = thresholds.tiltAngleThreshold;

  // Beta: pitch (forward/backward tilt)
  // Gamma: roll (left/right tilt)

  const absBeta = Math.abs(beta);
  const absGamma = Math.abs(gamma);

  // Check which axis has more tilt
  if (absBeta < threshold && absGamma < threshold) {
    return 'none';
  }

  if (absGamma > absBeta) {
    // Left/Right tilt is dominant
    return gamma > 0 ? 'right' : 'left';
  } else {
    // Forward/Backward tilt is dominant
    return beta > 0 ? 'forward' : 'backward';
  }
}

/**
 * Determine motion direction based on acceleration
 */
export function determineMotionDirection(
  acceleration: Vector3,
  thresholds: MotionThresholds
): MotionDirection {
  const { x, y, z } = acceleration;
  const threshold = thresholds.accelerationThreshold;

  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const absZ = Math.abs(z);

  // Find dominant axis
  const maxAbs = Math.max(absX, absY, absZ);

  if (maxAbs < threshold) {
    return 'none';
  }

  if (maxAbs === absX) {
    return x > 0 ? 'right' : 'left';
  } else if (maxAbs === absY) {
    return y > 0 ? 'forward' : 'backward';
  } else {
    return z > 0 ? 'up' : 'down';
  }
}

/**
 * Check if device is stationary
 */
export function isDeviceStationary(
  acceleration: Vector3,
  thresholds: MotionThresholds
): boolean {
  const magnitude = calculateMagnitude(acceleration);
  return magnitude < thresholds.stationaryThreshold;
}

/**
 * Radians to degrees conversion
 */
export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Degrees to radians conversion
 */
export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
