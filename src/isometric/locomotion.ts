import type { V2 } from '../core/world/layout';

export const JUMP_TIME = 0.52;
const accelerationTime = 0.09;
const braking = 82;

export class Locomotion {
  private heading: V2 = { x: 0, z: 0 };
  private speed = 0;
  private routed = false;

  reset() {
    this.speed = 0;
    this.routed = false;
  }

  advance(dx: number, dz: number, dt: number, topSpeed: number, manual: boolean, direct: boolean) {
    const length = Math.hypot(dx, dz);
    if (direct || (!length && (!manual || this.routed))) this.reset();
    if (dt <= 0 || (!length && !this.speed)) return;

    let speed = this.speed;
    if (length) {
      const heading = { x: dx / length, z: dz / length };
      if (direct) return { ...heading, stride: topSpeed * dt };
      const alignment = this.heading.x * heading.x + this.heading.z * heading.z;
      // Apply turns immediately. A reversal sheds speed without carrying the traveller backwards.
      if (alignment < 0) speed *= 1 + alignment * 0.7;
      this.heading = heading;
      this.routed = !manual;
    }

    const target = length ? topSpeed : 0;
    const rate = target >= speed ? topSpeed / accelerationTime : braking;
    const duration = Math.abs(target - speed) / rate;
    const ramp = Math.min(dt, duration);
    this.speed = dt >= duration ? target : speed + Math.sign(target - speed) * rate * dt;
    const stride = (speed + this.speed) * 0.5 * ramp + this.speed * (dt - ramp);
    if (stride > 0) return { ...this.heading, stride };
  }
}
