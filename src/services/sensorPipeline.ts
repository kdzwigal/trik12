/**
 * Real-time Sensor Processing Pipeline
 * Integrates Raw IMU data -> Calibration -> Dual Orientation Fusion -> Gesture Detection -> Ring Buffer
 */

import { RawSensorSample, CalibratedSample, SensorCalibration, FusionFilterMode, FilterConfig } from '../types/triki';
import { OrientationFusion } from './madgwickFilter';
import { RingBuffer } from './ringBuffer';
import { trikiBle } from './bleManager';

export class SensorPipeline {
  private fusion: OrientationFusion;
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
  private calibrationTargetCount: number = 150; // ~1.5 seconds

  // Configurable filtering pipeline settings
  private filterConfig: FilterConfig = {
    mode: 'complementary',
    compAlpha: 0.95,
    madgwickBeta: 0.08,
    rawAccelLpfFactor: 0.15,
    rawGyroDeadband: 0.025, // 0.025 rad/s (~1.4 deg/s) eliminates resting gyro noise
    swapPitchRoll: true, // Permanent Pitch ⇄ Roll swap
    invertPitch: true,   // Inverted as requested: "owroc pitch"
    invertRoll: false,   // Canceled as requested: "anuluj odwrocenie roll"
    invertYaw: true,     // Inverted
    yawScaleMultiplier: 1.0, // Fine-tuning multiplier for full 360° rotation
    accelScaleMultiplier: 1.0, // Multiplier for 1.00g resting Earth gravity
  };

  // Standstill / resting drift elimination state
  private stillFramesCount: number = 0;
  private prevAx: number = 0;
  private prevAy: number = 0;
  private prevAz: number = 1.0;
  private startupSamplesCount: number = 0;

  // Low-Pass Filter state for raw accelerometer
  private filteredAx: number = 0;
  private filteredAy: number = 0;
  private filteredAz: number = 1.0;
  private lpfInitialized: boolean = false;

  // Gesture state
  private lastTapTimestamp: number = 0;
  private tapCooldown: number = 250; // ms

  // Observers
  private sampleListeners: ((sample: CalibratedSample) => void)[] = [];
  private calibrationListeners: ((cal: SensorCalibration) => void)[] = [];
  private filterConfigListeners: ((cfg: FilterConfig) => void)[] = [];

  constructor(bufferCapacity: number = 500) {
    this.fusion = new OrientationFusion('complementary');
    this.fusion.swapPitchRoll = true;
    this.fusion.invertPitch = true;
    this.fusion.invertRoll = false;
    this.fusion.invertYaw = true;
    this.fusion.yawScaleMultiplier = 1.0;
    this.fusion.compAlpha = this.filterConfig.compAlpha;
    this.fusion.beta = this.filterConfig.madgwickBeta;
    this.ringBuffer = new RingBuffer<CalibratedSample>(bufferCapacity);
  }

  public getRingBuffer(): RingBuffer<CalibratedSample> {
    return this.ringBuffer;
  }

  public getCalibration(): SensorCalibration {
    return { ...this.calibration };
  }

  public getFilterConfig(): FilterConfig {
    return { ...this.filterConfig };
  }

  public updateFilterConfig(partial: Partial<FilterConfig>): void {
    this.filterConfig = { ...this.filterConfig, ...partial };
    if (partial.mode !== undefined) {
      this.fusion.setFilterMode(partial.mode);
    }
    if (partial.compAlpha !== undefined) {
      this.fusion.compAlpha = partial.compAlpha;
    }
    if (partial.madgwickBeta !== undefined) {
      this.fusion.beta = partial.madgwickBeta;
    }
    if (partial.swapPitchRoll !== undefined) {
      this.fusion.swapPitchRoll = partial.swapPitchRoll;
    }
    if (partial.invertPitch !== undefined) {
      this.fusion.invertPitch = partial.invertPitch;
    }
    if (partial.invertRoll !== undefined) {
      this.fusion.invertRoll = partial.invertRoll;
    }
    if (partial.invertYaw !== undefined) {
      this.fusion.invertYaw = partial.invertYaw;
    }
    if (partial.yawScaleMultiplier !== undefined) {
      this.fusion.yawScaleMultiplier = partial.yawScaleMultiplier;
    }
    if (partial.accelScaleMultiplier !== undefined) {
      this.filterConfig.accelScaleMultiplier = partial.accelScaleMultiplier;
    }
    this.notifyFilterConfigChanged();
  }

  public setFilterMode(mode: FusionFilterMode): void {
    this.updateFilterConfig({ mode });
  }

  public getFilterMode(): FusionFilterMode {
    return this.filterConfig.mode;
  }

  public setSwapPitchRoll(swap: boolean): void {
    this.updateFilterConfig({ swapPitchRoll: swap });
  }

  public getSwapPitchRoll(): boolean {
    return this.filterConfig.swapPitchRoll;
  }

  public setInversions(pitch: boolean, roll: boolean, yaw: boolean): void {
    this.updateFilterConfig({ invertPitch: pitch, invertRoll: roll, invertYaw: yaw });
  }

  public onFilterConfigChange(listener: (cfg: FilterConfig) => void): () => void {
    this.filterConfigListeners.push(listener);
    return () => {
      this.filterConfigListeners = this.filterConfigListeners.filter((l) => l !== listener);
    };
  }

  private notifyFilterConfigChanged(): void {
    this.filterConfigListeners.forEach((l) => l({ ...this.filterConfig }));
  }

  public resetOrientation(): void {
    this.fusion.reset();
    this.fusion.tare();
    this.lpfInitialized = false;
    this.stillFramesCount = 0;
  }

  public resetCalibrationBias(): void {
    this.calibration.gyroBiasX = 0;
    this.calibration.gyroBiasY = 0;
    this.calibration.gyroBiasZ = 0;
    this.calibration.accelOffsetX = 0;
    this.calibration.accelOffsetY = 0;
    this.calibration.accelOffsetZ = 0;
    this.startupSamplesCount = 0;
    this.lpfInitialized = false;
    this.stillFramesCount = 0;
    this.fusion.reset();
    this.fusion.tare();
    this.notifyCalibrationChanged();
  }

  public tare(): void {
    this.fusion.tare();
  }

  public startCalibration(targetCount: number = 150): void {
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
    // 1. Handle live stationary calibration routine if active
    if (this.isCalibrating) {
      this.calibrationAccumulator.gx += raw.gyro.x;
      this.calibrationAccumulator.gy += raw.gyro.y;
      this.calibrationAccumulator.gz += raw.gyro.z;
      this.calibrationAccumulator.ax += raw.accel.x;
      this.calibrationAccumulator.ay += raw.accel.y;
      this.calibrationAccumulator.az += raw.accel.z;
      this.calibrationAccumulator.count++;
      this.calibration.samplesCollected = this.calibrationAccumulator.count;

      if (this.calibrationAccumulator.count >= this.calibrationTargetCount) {
        const count = this.calibrationAccumulator.count;
        this.calibration.gyroBiasX = this.calibrationAccumulator.gx / count;
        this.calibration.gyroBiasY = this.calibrationAccumulator.gy / count;
        this.calibration.gyroBiasZ = this.calibrationAccumulator.gz / count;

        // Auto-calibrate resting gravity on desk to exactly 1.000g if stationary
        const avgAx = this.calibrationAccumulator.ax / count;
        const avgAy = this.calibrationAccumulator.ay / count;
        const avgAz = this.calibrationAccumulator.az / count;
        const measuredMag = Math.sqrt(avgAx * avgAx + avgAy * avgAy + avgAz * avgAz);
        if (measuredMag > 0.5 && measuredMag < 2.0) {
          this.filterConfig.accelScaleMultiplier = 1.0 / measuredMag;
        }

        // Zero gyro bias
        this.calibration.accelOffsetX = 0;
        this.calibration.accelOffsetY = 0;
        this.calibration.accelOffsetZ = 0;
        this.calibration.isCalibrated = true;
        this.isCalibrating = false;
        this.fusion.tare();
        this.notifyCalibrationChanged();
        this.notifyFilterConfigChanged();
      }
    }

    // Auto-bias baseline calibration on first 50 packets (~0.5s) if resting still
    if (this.startupSamplesCount < 50) {
      this.startupSamplesCount++;
      const magRawG = Math.sqrt(raw.gyro.x * raw.gyro.x + raw.gyro.y * raw.gyro.y + raw.gyro.z * raw.gyro.z);
      if (magRawG < 0.4) {
        this.calibration.gyroBiasX = (this.calibration.gyroBiasX * (this.startupSamplesCount - 1) + raw.gyro.x) / this.startupSamplesCount;
        this.calibration.gyroBiasY = (this.calibration.gyroBiasY * (this.startupSamplesCount - 1) + raw.gyro.y) / this.startupSamplesCount;
        this.calibration.gyroBiasZ = (this.calibration.gyroBiasZ * (this.startupSamplesCount - 1) + raw.gyro.z) / this.startupSamplesCount;
        if (this.startupSamplesCount === 50) {
          this.calibration.isCalibrated = true;
          this.notifyCalibrationChanged();
        }
      }
    }

    // 2. Apply calibration offsets and acceleration scale multiplier (normalizes 0.89g to 1.00g)
    const accelScale = this.filterConfig.accelScaleMultiplier ?? 1.0;
    let ax = (raw.accel.x - this.calibration.accelOffsetX) * accelScale;
    let ay = (raw.accel.y - this.calibration.accelOffsetY) * accelScale;
    let az = (raw.accel.z - this.calibration.accelOffsetZ) * accelScale;

    let gx = raw.gyro.x - this.calibration.gyroBiasX;
    let gy = raw.gyro.y - this.calibration.gyroBiasY;
    let gz = raw.gyro.z - this.calibration.gyroBiasZ;

    // Apply Gyro deadband if configured (suppresses idle drift)
    if (this.filterConfig.rawGyroDeadband > 0) {
      if (Math.abs(gx) < this.filterConfig.rawGyroDeadband) gx = 0;
      if (Math.abs(gy) < this.filterConfig.rawGyroDeadband) gy = 0;
      if (Math.abs(gz) < this.filterConfig.rawGyroDeadband) gz = 0;
    }

    // Apply Accelerometer Low-Pass Filter (LPF) to damp sensor vibration noise
    const lpf = this.filterConfig.rawAccelLpfFactor;
    if (lpf > 0) {
      if (!this.lpfInitialized) {
        this.filteredAx = ax;
        this.filteredAy = ay;
        this.filteredAz = az;
        this.lpfInitialized = true;
      } else {
        this.filteredAx = this.filteredAx * lpf + ax * (1.0 - lpf);
        this.filteredAy = this.filteredAy * lpf + ay * (1.0 - lpf);
        this.filteredAz = this.filteredAz * lpf + az * (1.0 - lpf);
        ax = this.filteredAx;
        ay = this.filteredAy;
        az = this.filteredAz;
      }
    }

    // 3. Compute vector magnitudes and detect standstill (Zero-Velocity Update)
    const accelMag = Math.sqrt(ax * ax + ay * ay + az * az);
    const rawGyroMag = Math.sqrt(raw.gyro.x * raw.gyro.x + raw.gyro.y * raw.gyro.y + raw.gyro.z * raw.gyro.z);

    const dAx = Math.abs(ax - this.prevAx);
    const dAy = Math.abs(ay - this.prevAy);
    const dAz = Math.abs(az - this.prevAz);
    this.prevAx = ax;
    this.prevAy = ay;
    this.prevAz = az;

    // Detect if Triki is stationary / resting in standstill on desk:
    const isStationary = rawGyroMag < 0.06 && dAx < 0.04 && dAy < 0.04 && dAz < 0.04 && Math.abs(accelMag - 1.0) < 0.25;

    if (isStationary) {
      this.stillFramesCount++;
      if (this.stillFramesCount > 3) {
        // Slowly adapt Z gyro bias to track and absorb any resting thermal DC offset
        this.calibration.gyroBiasZ += (raw.gyro.z - this.calibration.gyroBiasZ) * 0.03;
        this.calibration.gyroBiasX += (raw.gyro.x - this.calibration.gyroBiasX) * 0.03;
        this.calibration.gyroBiasY += (raw.gyro.y - this.calibration.gyroBiasY) * 0.03;
        // In standstill, freeze gyro rates to strictly 0: ELIMINATES IDLE YAW DRIFT 100%!
        gx = 0;
        gy = 0;
        gz = 0;
      }
    } else {
      this.stillFramesCount = 0;
    }

    const gyroMag = Math.sqrt(gx * gx + gy * gy + gz * gz);

    // 4. Update Orientation Fusion filter
    this.fusion.update(gx, gy, gz, ax, ay, az, raw.timestamp);
    const quat = this.fusion.getQuaternion();
    const euler = this.fusion.getEuler();

    // 5. Detect Gestures
    let gesture: CalibratedSample['gesture'] = 'idle';

    if (accelMag < 0.25) {
      gesture = 'freefall';
    } else if (gyroMag > 12.0 || accelMag > 3.0) {
      gesture = 'shake';
    } else if (euler.roll > 45) {
      gesture = 'tilt_right';
    } else if (euler.roll < -45) {
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

    const isTapMode = trikiBle.getButtonMode() === 'tap';
    const effectiveButton = isTapMode ? gesture === 'tap' || gesture === 'double_tap' : raw.button;

    const calibratedSample: CalibratedSample = {
      timestamp: raw.timestamp,
      packetIndex: raw.packetIndex,
      accel: { x: ax, y: ay, z: az },
      gyro: { x: gx, y: gy, z: gz },
      button: effectiveButton,
      buttonRawByte: raw.buttonRawByte,
      buttonPressCount: trikiBle.getButtonPressCount(),
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
