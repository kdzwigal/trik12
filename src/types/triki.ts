/**
 * Typings and interfaces for Triki BLE sensor telemetry and app state
 */

export interface RawSensorSample {
  timestamp: number; // performance.now() or sensor packet timestamp
  packetIndex: number;
  accel: {
    x: number; // g
    y: number;
    z: number;
  };
  gyro: {
    x: number; // rad/s
    y: number;
    z: number;
  };
  button: boolean;
  buttonRawByte?: number; // raw byte[1] value (e.g. 0x00 or 0x01)
  batteryLevel?: number; // 0-100%
  rawBytes?: Uint8Array;
}

export type FusionFilterMode = 'complementary' | 'madgwick';

export type ButtonMode = 'exact-01' | 'bit0' | 'inverted' | 'nonzero' | 'manual' | 'tap';

export interface CalibratedSample extends RawSensorSample {
  accelMagnitude: number;
  gyroMagnitude: number;
  buttonPressCount: number;
  quaternion: {
    w: number;
    x: number;
    y: number;
    z: number;
  };
  euler: {
    roll: number; // degrees
    pitch: number;
    yaw: number;
  };
  gesture: 'idle' | 'tap' | 'double_tap' | 'shake' | 'freefall' | 'tilt_left' | 'tilt_right';
}

export interface SensorCalibration {
  gyroBiasX: number;
  gyroBiasY: number;
  gyroBiasZ: number;
  accelOffsetX: number;
  accelOffsetY: number;
  accelOffsetZ: number;
  isCalibrated: boolean;
  samplesCollected: number;
}

export type LayoutMode = 'split' | 'aviation' | 'signal' | 'rn-architecture';

export type ThemeMode = 'clean-light' | 'eink';

export interface LedCommand {
  r: number;
  g: number;
  b: number;
  brightness: number; // 0-255
}

export type LedControlMethod = 'auto' | 'char-6e400004' | 'nus-rx-01' | 'nus-rx-vendor' | 'both';

export interface FilterConfig {
  mode: FusionFilterMode;
  compAlpha: number; // 0.50 - 0.999 (default: 0.95)
  madgwickBeta: number; // 0.01 - 0.50 (default: 0.08)
  rawAccelLpfFactor: number; // 0.0 - 0.80 (default: 0.15)
  rawGyroDeadband: number; // 0.0 - 0.10 rad/s (default: 0.005)
  swapPitchRoll: boolean; // default: true (permanent pitch ⇄ roll swap)
  invertPitch: boolean; // default: false
  invertRoll: boolean; // default: true (inverted on current roll axis)
  invertYaw: boolean; // default: true (inverted on current yaw axis)
  yawScaleMultiplier: number; // default: 1.0 (fine-tuning multiplier for full 360° rotation)
}

export interface BLEConnectionState {
  status: 'disconnected' | 'searching' | 'connecting' | 'connected' | 'error';
  deviceName?: string;
  deviceId?: string;
  serviceUuid?: string;
  packetsReceived: number;
  packetRateHz: number;
  latencyMs: number;
  errorMessage?: string;
  isWebBluetoothSupported: boolean;
  lastCommandStatus?: string;
  rawBytesHex?: string;
  buttonMode: ButtonMode;
  buttonPressCount: number;
  lastButtonRawByte?: number;
  ledEnabled?: boolean;
  ledMethod?: LedControlMethod;
  debugLogs: string[];
}

