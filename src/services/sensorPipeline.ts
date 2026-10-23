/**
 * Real-time Sensor Processing Pipeline
 * Integrates Raw IMU data -> Calibration -> Madgwick AHRS -> Gesture Detection -> Ring Buffer
 */

import { RawSensorSample, CalibratedSample, SensorCalibration } from '../types/triki';
import { MadgwickFilter } from './madgwickFilter';
import { RingBuffer } from './ringBuffer';

export class SensorPipeline {
  private madgwick: MadgwickFilter;
  private ringBuffer: RingBuffer<CalibratedSample>;
  private calibration: SensorCalibration = {
    gyroBiasX: 0,
    gyroBiasY: 0,
    gyroBiasZ: 0,
    accelOffsetX: 0,
    accelOffsetY: 0,
    accelOffsetZ: 0,
    isCalibrated: false,
    samplesCollected: 0,
  };

  private calibrationAccumulator = {
    gx: 0,
    gy: 0,
    gz: 0,
    ax: 0,
    ay: 0,
    az: 0,
    count: 0,
  };

  private isCalibrating: boolean = false;
  private calibrationTargetCount: number = 200; // ~2 seconds of 100 Hz data

  // Gesture state
  private lastTapTimestamp: number = 0;
  private tapCooldown: number = 250; // ms

  // Observers
  private sampleListeners: ((sample: CalibratedSample) => void)[] = [];
  private calibrationListeners: ((cal: SensorCalibration) => void)[] = [];

  constructor(bufferCapacity: number = 500) {
    this.madgwick = new MadgwickFilter(0.12, 100);
    this.ringBuffer = new RingBuffer<CalibratedSample>(bufferCapacity);
  }

  public getRingBuffer(): RingBuffer<CalibratedSample> {
    return this.ringBuffer;
  }

  public getCalibration(): SensorCalibration {
    return { ...this.calibration };
  }

  public resetOrientation(): void {
    this.madgwick.reset(1.0, 0.0, 0.0, 0.0);
  }

  public startCalibration(targetCount: number = 200): void {
    this.isCalibrating = true;
    this.calibrationTargetCount = targetCount;
    this.calibrationAccumulator = { gx: 0, gy: 0, gz: 0, ax: 0, ay: 0, az: 0, count: 0 };
    this.calibration.samplesCollected = 0;
    this.notifyCalibrationChanged();
  }

  public subscribe(listener: (sample: CalibratedSample) => void): () => void {
    this.sampleListeners.push(listener);
    return () => {
      this.sampleListeners = this.sampleListeners.filter((l) => l !== listener);
    };
  }

  public onCalibrationChange(listener: (cal: SensorCalibration) => void): () => void {
    this.calibrationListeners.push(listener);
    return () => {
      this.calibrationListeners = this.calibrationListeners.filter((l) => l !== listener);
    };
  }

  private notifyCalibrationChanged(): void {
    this.calibrationListeners.forEach((l) => l({ ...this.calibration }));
  }

  /**
   * Process raw sensor packet in real time
   */
  public processRawSample(raw: RawSensorSample): CalibratedSample {
    // 1. Handle live calibration routine if active
    if (this.isCalibrating) {
      this.calibrationAccumulator.gx += raw.gyro.x;
      this.calibrationAccumulator.gy += raw.gyro.y;
      this.calibrationAccumulator.gz += raw.gyro.z;
      this.calibrationAccumulator.ax += raw.accel.x;
      this.calibrationAccumulator.ay += raw.accel.y;
      this.calibrationAccumulator.az += raw.accel.z - 1.0; // Assume 1g on Z when flat
      this.calibrationAccumulator.count++;
      this.calibration.samplesCollected = this.calibrationAccumulator.count;

      if (this.calibrationAccumulator.count >= this.calibrationTargetCount) {
        const count = this.calibrationAccumulator.count;
        this.calibration.gyroBiasX = this.calibrationAccumulator.gx / count;
        this.calibration.gyroBiasY = this.calibrationAccumulator.gy / count;
        this.calibration.gyroBiasZ = this.calibrationAccumulator.gz / count;
        this.calibration.accelOffsetX = this.calibrationAccumulator.ax / count;
        this.calibration.accelOffsetY = this.calibrationAccumulator.ay / count;
        this.calibration.accelOffsetZ = this.calibrationAccumulator.az / count;
        this.calibration.isCalibrated = true;
        this.isCalibrating = false;
        this.notifyCalibrationChanged();
      }
    }

    // 2. Apply calibration offsets
    const ax = raw.accel.x - this.calibration.accelOffsetX;
    const ay = raw.accel.y - this.calibration.accelOffsetY;
    const az = raw.accel.z - this.calibration.accelOffsetZ;

    const gx = raw.gyro.x - this.calibration.gyroBiasX;
    const gy = raw.gyro.y - this.calibration.gyroBiasY;
    const gz = raw.gyro.z - this.calibration.gyroBiasZ;

    // 3. Compute vector magnitudes
    const accelMag = Math.sqrt(ax * ax + ay * ay + az * az);
    const gyroMag = Math.sqrt(gx * gx + gy * gy + gz * gz);

    // 4. Update Madgwick AHRS filter
    this.madgwick.update(gx, gy, gz, ax, ay, az, raw.timestamp);
    const quat = this.madgwick.getQuaternion();
    const euler = this.madgwick.getEuler();

    // 5. Detect Gestures
    let gesture: CalibratedSample['gesture'] = 'idle';

    if (accelMag < 0.25) {
      gesture = 'freefall';
    } else if (gyroMag > 12.0 || accelMag > 3.0) {
      gesture = 'shake';
    } else if (euler.roll > 40) {
      gesture = 'tilt_right';
    } else if (euler.roll < -40) {
      gesture = 'tilt_left';
    } else if (accelMag > 2.2) {
      const now = raw.timestamp;
      if (now - this.lastTapTimestamp < 400 && now - this.lastTapTimestamp > 60) {
        gesture = 'double_tap';
        this.lastTapTimestamp = now;
      } else if (now - this.lastTapTimestamp > this.tapCooldown) {
        gesture = 'tap';
        this.lastTapTimestamp = now;
      }
    }

    const calibratedSample: CalibratedSample = {
      timestamp: raw.timestamp,
      packetIndex: raw.packetIndex,
      accel: { x: ax, y: ay, z: az },
      gyro: { x: gx, y: gy, z: gz },
      button: raw.button,
      batteryLevel: raw.batteryLevel,
      rawBytes: raw.rawBytes,
      accelMagnitude: accelMag,
      gyroMagnitude: gyroMag,
      quaternion: quat,
      euler,
      gesture,
    };

    // 6. Push to RingBuffer
    this.ringBuffer.push(calibratedSample);

    // 7. Notify listeners
    for (let i = 0; i < this.sampleListeners.length; i++) {
      this.sampleListeners[i](calibratedSample);
    }

    return calibratedSample;
  }
}

// Global pipeline singleton
export const sensorPipeline = new SensorPipeline(500);
