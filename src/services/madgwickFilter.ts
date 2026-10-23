/**
 * Madgwick AHRS sensor fusion implementation in TypeScript
 * Reference: S.O.H. Madgwick, "An efficient orientation filter for inertial and inertial/magnetic sensor arrays"
 */

export class MadgwickFilter {
  // Quaternion state [w, x, y, z]
  public q0: number = 1.0;
  public q1: number = 0.0;
  public q2: number = 0.0;
  public q3: number = 0.0;

  // Algorithm parameter - filter gain beta (controls convergence speed vs gyro drift rejection)
  public beta: number = 0.12;

  // Sampling period in seconds
  public samplePeriod: number = 1.0 / 100.0; // default 100 Hz

  private lastTimestamp: number = 0;

  constructor(beta: number = 0.12, sampleRateHz: number = 100) {
    this.beta = beta;
    this.samplePeriod = 1.0 / sampleRateHz;
  }

  public reset(w: number = 1.0, x: number = 0.0, y: number = 0.0, z: number = 0.0): void {
    this.q0 = w;
    this.q1 = x;
    this.q2 = y;
    this.q3 = z;
    this.lastTimestamp = 0;
  }

  /**
   * Update filter state with 6-DOF IMU reading
   * @param gx Gyroscope X in rad/s
   * @param gy Gyroscope Y in rad/s
   * @param gz Gyroscope Z in rad/s
   * @param ax Accelerometer X (normalized or m/s^2)
   * @param ay Accelerometer Y (normalized or m/s^2)
   * @param az Accelerometer Z (normalized or m/s^2)
   * @param timestamp Optional current timestamp in ms for adaptive delta-t
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

    let q1 = this.q0;
    let q2 = this.q1;
    let q3 = this.q2;
    let q4 = this.q3;

    // Rate of change of quaternion from gyroscope
    let qDot1 = 0.5 * (-q2 * gx - q3 * gy - q4 * gz);
    let qDot2 = 0.5 * (q1 * gx + q3 * gz - q4 * gy);
    let qDot3 = 0.5 * (q1 * gy - q2 * gz + q4 * gx);
    let qDot4 = 0.5 * (q1 * gz + q2 * gy - q3 * gx);

    // Compute feedback only if accelerometer measurement valid (avoids NaN in norm)
    const accelNormSq = ax * ax + ay * ay + az * az;
    if (accelNormSq > 0.000001) {
      // Normalise accelerometer measurement
      const recipNorm = 1.0 / Math.sqrt(accelNormSq);
      ax *= recipNorm;
      ay *= recipNorm;
      az *= recipNorm;

      // Auxiliary variables to avoid repeated arithmetic
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

      // Gradient descent algorithm corrective step
      let s1 = _4q1 * q3q3 + _2q3 * ax + _4q1 * q2q2 - _2q2 * ay;
      let s2 = _4q2 * q4q4 - _2q4 * ax + 4.0 * q1q1 * q2 - _2q1 * ay - _4q2 + _8q2 * q2q2 + _8q2 * q3q3 + _4q2 * az;
      let s3 = 4.0 * q1q1 * q3 + _2q1 * ax + _4q3 * q4q4 - _2q4 * ay - _4q3 + _8q3 * q2q2 + _8q3 * q3q3 + _4q3 * az;
      let s4 = 4.0 * q2q2 * q4 - _2q2 * ax + 4.0 * q3q3 * q4 - _2q3 * ay;

      // Normalise step magnitude
      const stepNormSq = s1 * s1 + s2 * s2 + s3 * s3 + s4 * s4;
      if (stepNormSq > 0.000001) {
        const recipStepNorm = 1.0 / Math.sqrt(stepNormSq);
        s1 *= recipStepNorm;
        s2 *= recipStepNorm;
        s3 *= recipStepNorm;
        s4 *= recipStepNorm;

        // Apply feedback step
        qDot1 -= this.beta * s1;
        qDot2 -= this.beta * s2;
        qDot3 -= this.beta * s3;
        qDot4 -= this.beta * s4;
      }
    }

    // Integrate rate of change of quaternion to yield quaternion
    q1 += qDot1 * dt;
    q2 += qDot2 * dt;
    q3 += qDot3 * dt;
    q4 += qDot4 * dt;

    // Normalise quaternion
    const normSq = q1 * q1 + q2 * q2 + q3 * q3 + q4 * q4;
    const recipNorm = 1.0 / Math.sqrt(normSq > 0.000001 ? normSq : 1.0);
    this.q0 = q1 * recipNorm;
    this.q1 = q2 * recipNorm;
    this.q2 = q3 * recipNorm;
    this.q3 = q4 * recipNorm;
  }

  /**
   * Get current quaternion
   */
  public getQuaternion(): { w: number; x: number; y: number; z: number } {
    return {
      w: this.q0,
      x: this.q1,
      y: this.q2,
      z: this.q3,
    };
  }

  /**
   * Calculate Euler angles (Roll, Pitch, Yaw) in degrees
   */
  public getEuler(): { roll: number; pitch: number; yaw: number } {
    const q0 = this.q0;
    const q1 = this.q1;
    const q2 = this.q2;
    const q3 = this.q3;

    // Roll (x-axis rotation)
    const sinr_cosp = 2 * (q0 * q1 + q2 * q3);
    const cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2);
    const roll = Math.atan2(sinr_cosp, cosr_cosp) * (180.0 / Math.PI);

    // Pitch (y-axis rotation)
    const sinp = 2 * (q0 * q2 - q3 * q1);
    let pitch: number;
    if (Math.abs(sinp) >= 1) {
      pitch = sinp > 0 ? 90 : -90;
    } else {
      pitch = Math.asin(sinp) * (180.0 / Math.PI);
    }

    // Yaw (z-axis rotation)
    const siny_cosp = 2 * (q0 * q3 + q1 * q2);
    const cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3);
    const yaw = Math.atan2(siny_cosp, cosy_cosp) * (180.0 / Math.PI);

    return { roll, pitch, yaw };
  }
}
