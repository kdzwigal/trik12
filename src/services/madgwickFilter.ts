/**
 * Dual Orientation Fusion Engine for Triki IMU (Complementary Filter + Madgwick AHRS)
 * Inspired by Maku-hub/TrikiScope dual filter architecture:
 * 1. Complementary Filter (like official Zappka app): zero gimbal lock, instant 360-degree responsiveness, rock-solid
 * 2. Madgwick AHRS: gradient descent quaternion estimation
 */

import { FusionFilterMode } from '../types/triki';

export class OrientationFusion {
  public filterMode: FusionFilterMode = 'complementary';

  // Madgwick state quaternion [w, x, y, z]
  public q0: number = 1.0;
  public q1: number = 0.0;
  public q2: number = 0.0;
  public q3: number = 0.0;
  public beta: number = 0.08;

  // Complementary filter state (in degrees)
  public compPitch: number = 0.0;
  public compRoll: number = 0.0;
  public compYaw: number = 0.0;
  public compAlpha: number = 0.95; // Gyro weighting factor

  // Tare offsets
  private tarePitch: number = 0.0;
  private tareRoll: number = 0.0;
  private tareYaw: number = 0.0;

  // Inversion, Axis Swap, and Sensitivity flags
  public invertPitch: boolean = false;
  public invertRoll: boolean = true; // Inverted by default on current roll axis: "dodaj odwrocenie na obecnych osiach yaw i roll"
  public invertYaw: boolean = true;  // Inverted by default on current yaw axis: "dodaj odwrocenie na obecnych osiach yaw i roll"
  public swapPitchRoll: boolean = true; // Permanent by default: "zastosuj zamiane pitch roll na stale"
  public yawScaleMultiplier: number = 1.0; // Fine-tuning multiplier for full 360° rotation

  private lastTimestamp: number = 0;
  public samplePeriod: number = 0.01; // 100 Hz

  constructor(mode: FusionFilterMode = 'complementary') {
    this.filterMode = mode;
  }

  public setFilterMode(mode: FusionFilterMode): void {
    this.filterMode = mode;
    this.reset();
  }

  public reset(): void {
    this.q0 = 1.0;
    this.q1 = 0.0;
    this.q2 = 0.0;
    this.q3 = 0.0;
    this.compPitch = 0.0;
    this.compRoll = 0.0;
    this.compYaw = 0.0;
    this.lastTimestamp = 0;
  }

  public tare(): void {
    this.tarePitch = this.compPitch;
    this.tareRoll = this.compRoll;
    this.tareYaw = this.compYaw;
  }

  public resetTare(): void {
    this.tarePitch = 0.0;
    this.tareRoll = 0.0;
    this.tareYaw = 0.0;
  }

  /**
   * Update orientation with 6-DOF IMU sample
   * @param gx Gyroscope X in rad/s
   * @param gy Gyroscope Y in rad/s
   * @param gz Gyroscope Z in rad/s
   * @param ax Accelerometer X in g
   * @param ay Accelerometer Y in g
   * @param az Accelerometer Z in g
   * @param timestamp in ms
   */
  public update(
    gx: number,
    gy: number,
    gz: number,
    ax: number,
    ay: number,
    az: number,
    timestamp?: number
  ): void {
    let dt = this.samplePeriod;
    if (timestamp && this.lastTimestamp > 0) {
      const delta = (timestamp - this.lastTimestamp) / 1000.0;
      if (delta > 0.001 && delta < 0.2) {
        dt = delta;
      }
    }
    if (timestamp) {
      this.lastTimestamp = timestamp;
    }

    // Safety checks against non-finite values
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) ||
        !Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(gz)) {
      return;
    }

    if (this.filterMode === 'complementary') {
      this.updateComplementary(gx, gy, gz, ax, ay, az, dt);
    } else {
      this.updateMadgwick(gx, gy, gz, ax, ay, az, dt);
    }
  }

  /**
   * Complementary Filter update (Fast, accurate, full 360-degree range of motion)
   */
  private updateComplementary(
    gx: number,
    gy: number,
    gz: number,
    ax: number,
    ay: number,
    az: number,
    dt: number
  ): void {
    // Gyroscope in degrees per second
    const gxDeg = gx * (180.0 / Math.PI);
    const gyDeg = gy * (180.0 / Math.PI);
    const gzDeg = gz * (180.0 / Math.PI);

    // Compute Pitch & Roll directly from Accelerometer
    // When Triki is flat: ax~0, ay~0, az~1.0
    const rollAcc = Math.atan2(ay, az) * (180.0 / Math.PI);
    const pitchAcc = Math.atan2(-ax, Math.sqrt(ay * ay + az * az)) * (180.0 / Math.PI);

    // Complementary blend
    const alpha = this.compAlpha;
    this.compRoll = alpha * (this.compRoll + gxDeg * dt) + (1.0 - alpha) * rollAcc;
    this.compPitch = alpha * (this.compPitch + gyDeg * dt) + (1.0 - alpha) * pitchAcc;
    this.compYaw += gzDeg * dt * this.yawScaleMultiplier;

    // Keep yaw within -180..+180
    if (this.compYaw > 180) this.compYaw -= 360;
    if (this.compYaw < -180) this.compYaw += 360;

    // Convert Euler angles to unit quaternion representation
    const rRad = THREE_DEG_TO_RAD(this.compRoll);
    const pRad = THREE_DEG_TO_RAD(this.compPitch);
    const yRad = THREE_DEG_TO_RAD(this.compYaw);

    const cy = Math.cos(yRad * 0.5);
    const sy = Math.sin(yRad * 0.5);
    const cp = Math.cos(pRad * 0.5);
    const sp = Math.sin(pRad * 0.5);
    const cr = Math.cos(rRad * 0.5);
    const sr = Math.sin(rRad * 0.5);

    this.q0 = cr * cp * cy + sr * sp * sy;
    this.q1 = sr * cp * cy - cr * sp * sy;
    this.q2 = cr * sp * cy + sr * cp * sy;
    this.q3 = cr * cp * sy - sr * sp * cy;
  }

  /**
   * Madgwick AHRS Gradient Descent update
   */
  private updateMadgwick(
    gx: number,
    gy: number,
    gz: number,
    ax: number,
    ay: number,
    az: number,
    dt: number
  ): void {
    let q1 = this.q0;
    let q2 = this.q1;
    let q3 = this.q2;
    let q4 = this.q3;

    // Rate of change of quaternion from gyroscope (with yawScaleMultiplier applied)
    const effectiveGz = gz * this.yawScaleMultiplier;
    let qDot1 = 0.5 * (-q2 * gx - q3 * gy - q4 * effectiveGz);
    let qDot2 = 0.5 * (q1 * gx + q3 * effectiveGz - q4 * gy);
    let qDot3 = 0.5 * (q1 * gy - q2 * effectiveGz + q4 * gx);
    let qDot4 = 0.5 * (q1 * effectiveGz + q2 * gy - q3 * gx);

    const accelNormSq = ax * ax + ay * ay + az * az;
    if (accelNormSq > 0.0001) {
      const recipNorm = 1.0 / Math.sqrt(accelNormSq);
      ax *= recipNorm;
      ay *= recipNorm;
      az *= recipNorm;

      const _2q1 = 2.0 * q1;
      const _2q2 = 2.0 * q2;
      const _2q3 = 2.0 * q3;
      const _2q4 = 2.0 * q4;
      const _4q1 = 4.0 * q1;
      const _4q2 = 4.0 * q2;
      const _4q3 = 4.0 * q3;
      const _8q2 = 8.0 * q2;
      const _8q3 = 8.0 * q3;
      const q1q1 = q1 * q1;
      const q2q2 = q2 * q2;
      const q3q3 = q3 * q3;
      const q4q4 = q4 * q4;

      let s1 = _4q1 * q3q3 + _2q3 * ax + _4q1 * q2q2 - _2q2 * ay;
      let s2 = _4q2 * q4q4 - _2q4 * ax + 4.0 * q1q1 * q2 - _2q1 * ay - _4q2 + _8q2 * q2q2 + _8q2 * q3q3 + _4q2 * az;
      let s3 = 4.0 * q1q1 * q3 + _2q1 * ax + _4q3 * q4q4 - _2q4 * ay - _4q3 + _8q3 * q2q2 + _8q3 * q3q3 + _4q3 * az;
      let s4 = 4.0 * q2q2 * q4 - _2q2 * ax + 4.0 * q3q3 * q4 - _2q3 * ay;

      const stepNormSq = s1 * s1 + s2 * s2 + s3 * s3 + s4 * s4;
      if (stepNormSq > 0.000001) {
        const recipStepNorm = 1.0 / Math.sqrt(stepNormSq);
        s1 *= recipStepNorm;
        s2 *= recipStepNorm;
        s3 *= recipStepNorm;
        s4 *= recipStepNorm;

        qDot1 -= this.beta * s1;
        qDot2 -= this.beta * s2;
        qDot3 -= this.beta * s3;
        qDot4 -= this.beta * s4;
      }
    }

    q1 += qDot1 * dt;
    q2 += qDot2 * dt;
    q3 += qDot3 * dt;
    q4 += qDot4 * dt;

    const normSq = q1 * q1 + q2 * q2 + q3 * q3 + q4 * q4;
    const recipNorm = 1.0 / Math.sqrt(normSq > 0.000001 ? normSq : 1.0);
    this.q0 = q1 * recipNorm;
    this.q1 = q2 * recipNorm;
    this.q2 = q3 * recipNorm;
    this.q3 = q4 * recipNorm;
  }

  public getQuaternion(): { w: number; x: number; y: number; z: number } {
    return {
      w: Number.isFinite(this.q0) ? this.q0 : 1.0,
      x: Number.isFinite(this.q1) ? this.q1 : 0.0,
      y: Number.isFinite(this.q2) ? this.q2 : 0.0,
      z: Number.isFinite(this.q3) ? this.q3 : 0.0,
    };
  }

  /**
   * Calculate Euler angles with Tare and Inversion applied
   */
  public getEuler(): { roll: number; pitch: number; yaw: number } {
    let roll: number;
    let pitch: number;
    let yaw: number;

    if (this.filterMode === 'complementary') {
      roll = this.compRoll;
      pitch = this.compPitch;
      yaw = this.compYaw;
    } else {
      const q0 = this.q0;
      const q1 = this.q1;
      const q2 = this.q2;
      const q3 = this.q3;

      const sinr_cosp = 2 * (q0 * q1 + q2 * q3);
      const cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2);
      roll = Math.atan2(sinr_cosp, cosr_cosp) * (180.0 / Math.PI);

      const sinp = 2 * (q0 * q2 - q3 * q1);
      if (Math.abs(sinp) >= 1) {
        pitch = sinp > 0 ? 90 : -90;
      } else {
        pitch = Math.asin(sinp) * (180.0 / Math.PI);
      }

      const siny_cosp = 2 * (q0 * q3 + q1 * q2);
      const cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3);
      yaw = Math.atan2(siny_cosp, cosy_cosp) * (180.0 / Math.PI);
    }

    // Apply Tare offsets
    roll -= this.tareRoll;
    pitch -= this.tarePitch;
    yaw -= this.tareYaw;

    // 1. Swap Pitch ⇄ Roll permanently (default true: "zastosuj zamiane pitch roll na stale")
    if (this.swapPitchRoll) {
      const prevRoll = roll;
      roll = pitch;
      pitch = prevRoll;
    }

    // 2. Apply Inversions on CURRENT axes ("dodaj odwrocenie na obecnych osiach yaw i roll")
    if (this.invertRoll) roll = -roll;
    if (this.invertPitch) pitch = -pitch;
    if (this.invertYaw) yaw = -yaw;

    // Wrap to -180..+180
    roll = wrapAngle(roll);
    pitch = wrapAngle(pitch);
    yaw = wrapAngle(yaw);

    return { roll, pitch, yaw };
  }
}

function THREE_DEG_TO_RAD(deg: number): number {
  return deg * (Math.PI / 180.0);
}

function wrapAngle(deg: number): number {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

// Backward-compatible alias for existing imports
export { OrientationFusion as MadgwickFilter };
