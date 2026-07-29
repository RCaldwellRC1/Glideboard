// Motion sensor types and configurations

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Rotation {
  alpha: number; // z-axis (yaw): 0-360°
  beta: number;  // x-axis (pitch): -180 to 180°
  gamma: number; // y-axis (roll): -90 to 90°
}

export type TiltDirection =
  | 'none'
  | 'left'
  | 'right'
  | 'forward'
  | 'backward';

export type MotionDirection =
  | 'none'
  | 'left'
  | 'right'
  | 'forward'
  | 'backward'
  | 'up'
  | 'down';

export type RepPhase = 'rest' | 'up' | 'top' | 'down';

export interface MotionState {
  // Raw sensor data (smoothed)
  acceleration: Vector3;
  accelerationIncludingGravity: Vector3;
  rotation: Rotation;
  rotationRate: Rotation;

  // Derived states
  tiltDirection: TiltDirection;
  motionDirection: MotionDirection;
  tiltAngle: number; // degrees from flat
  accelerationMagnitude: number;
  isStationary: boolean;
  isTilting: boolean;
  isMoving: boolean;

  // Device orientation (0, 90, 180, 270)
  orientation: number;
}

// Calibration data for a specific exercise/incline combination
export interface RepCalibration {
  exercise: string;
  inclineLevel: number;

  // Rest position (starting point)
  restRotation: Rotation;

  // Top position (peak of rep)
  topRotation: Rotation;

  // Thresholds derived from calibration
  rotationThreshold: number; // minimum rotation change to detect movement
  repDuration: number; // average time for one rep in ms

  // Timestamps
  calibratedAt: string;
}

export interface MotionThresholds {
  // Tilt thresholds (degrees)
  tiltAngleThreshold: number;

  // Acceleration thresholds (m/s²)
  accelerationThreshold: number;
  stationaryThreshold: number;

  // Time thresholds (ms)
  sustainedMotionDuration: number;

  // Rep detection
  idleTimeoutMs: number; // 20 seconds of no motion = end set
}

export const DEFAULT_THRESHOLDS: MotionThresholds = {
  tiltAngleThreshold: 15, // degrees
  accelerationThreshold: 1.5, // m/s²
  stationaryThreshold: 0.3, // m/s²
  sustainedMotionDuration: 150, // ms
  idleTimeoutMs: 20000, // 20 seconds
};

export const INITIAL_MOTION_STATE: MotionState = {
  acceleration: { x: 0, y: 0, z: 0 },
  accelerationIncludingGravity: { x: 0, y: 0, z: 0 },
  rotation: { alpha: 0, beta: 0, gamma: 0 },
  rotationRate: { alpha: 0, beta: 0, gamma: 0 },
  tiltDirection: 'none',
  motionDirection: 'none',
  tiltAngle: 0,
  accelerationMagnitude: 0,
  isStationary: true,
  isTilting: false,
  isMoving: false,
  orientation: 0,
};
