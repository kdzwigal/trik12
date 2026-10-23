/**
 * Typings and interfaces for Triki BLE sensor telemetry and app state
 */

export interface RawSensorSample {
  timestamp: number; // performance.now() or sensor packet timestamp
  packetIndex: number;
  accel: {
    x: number; // g or m/s^2
    y: number;
    z: number;
  };
  gyro: {
    x: number; // deg/s or rad/s
    y: number;
    z: number;
  };
  button: boolean;
  batteryLevel?: number; // 0-100%
  rawBytes?: Uint8Array;
}

export interface CalibratedSample extends RawSensorSample {
  accelMagnitude: number;
  gyroMagnitude: number;
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
  debugLogs: string[];
}

export interface LedCommand {
  r: number;
  g: number;
  b: number;
  brightness: number; // 0-255
}
