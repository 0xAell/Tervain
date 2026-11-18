import { JUMP_SPEED } from '../../core/rules/hero';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp01(n); return t * t * (3 - 2 * t); };

export type JumpPose =
  | { airborne: true; phase: number; leadLeft: boolean; launched: boolean }
  | { airborne: false; weight: number };

/** The controller owns all displacement. These signals follow the actual ascent and instant of contact,
 * including a curtailed jump under a ceiling, a step off a ledge, and the controller's authored vault arc. */
export class JumpMotion {
  private airborne = false;
  private launched = false;
  private leadLeft = true;
  private downSpeed = 0;
  private impact = 0;
  private recovery = 0;

  reset() {
    this.airborne = false;
    this.downSpeed = this.impact = this.recovery = 0;
  }

  update(dt: number, grounded: boolean, verticalSpeed: number, stride: number, vaultPhase?: number): JumpPose | undefined {
    if (!grounded) {
      if (!this.airborne) {
        this.launched = verticalSpeed > 0 || vaultPhase !== undefined;
        this.leadLeft = Math.cos(2 * Math.PI * stride) >= 0;
      }
      this.airborne = true;
      const phase = vaultPhase ?? clamp01((1 - verticalSpeed / JUMP_SPEED) / 2);
      this.downSpeed = vaultPhase === undefined ? Math.max(0, -verticalSpeed) : Math.max(0, (2 * phase - 1) * JUMP_SPEED);
      return { airborne: true, phase, launched: this.launched, leadLeft: this.leadLeft };
    }
    if (this.airborne) {
      this.airborne = false;
      this.impact = clamp01((this.downSpeed - 1.3) / 5);
      this.recovery = 0;
    }
    if (this.impact <= 0) return;
    this.recovery += dt;
    // Weight arrives quickly through the knees, then leaves more slowly through the hips.
    const weight = this.impact * smooth(this.recovery / .075) * (1 - smooth((this.recovery - .075) / .21));
    if (this.recovery >= .285) { this.impact = 0; return; }
    return { airborne: false, weight };
  }
}

/** Lower the pelvis while leaving this ankle at the same point on the floor. Distances are
 * in bind-pose metres of the native human frame. Preserve the sole's pitch as its knee folds. */
function absorb(angles: Record<string, number>, side: 'L' | 'R', drop: number) {
  const leg = 'leg' + side, knee = 'knee' + side, sole = 'sole' + side;
  const hipAngle = angles[leg]!, kneeAngle = angles[knee]!, total = hipAngle + kneeAngle;
  const ahead = -.45 * Math.sin(hipAngle) - .42 * Math.sin(total);
  const down = .45 * Math.cos(hipAngle) + .42 * Math.cos(total) - drop;
  const bend = Math.acos(Math.max(-1, Math.min(1, (down * down + ahead * ahead - .45 ** 2 - .42 ** 2) / (2 * .45 * .42))));
  const thigh = Math.atan2(-ahead, down) - Math.atan2(.42 * Math.sin(bend), .45 + .42 * Math.cos(bend));
  angles[leg] = thigh;
  angles[knee] = bend;
  angles[sole] = angles[sole]! + total - thigh - bend;
}

export function poseJump(a: Record<string, number>, jump: JumpPose, speed: number, amp: number) {
  if (!jump.airborne) {
    const weight = jump.weight * amp, drop = .19 * weight;
    absorb(a, 'L', drop);
    absorb(a, 'R', drop);
    a.lower! -= drop;
    a.torsoX! += .26 * weight;
    a.headX! -= .10 * weight;
    a.armLz! += .25 * weight;
    a.armRz! -= .25 * weight;
    a.elbowL! -= .22 * weight;
    a.elbowR! -= .22 * weight;
    return;
  }

  const t = jump.phase, tuck = jump.launched ? Math.sin(Math.PI * t) : 0;
  const reach = smooth((t - .55) / .40), drive = (1 - smooth((t - .19) / .58)) * amp;
  const stride = (jump.leadLeft ? 1 : -1) * speed * tuck;
  // The takeoff foot trails as the opposite knee leads. Both boots unfold before contact.
  // Walking off an edge opens the arms for balance without performing the thrust of a jump.
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;
    const lead = sign * stride;
    const thigh = -.14 - (.78 * tuck + .48 * lead) * amp - .12 * reach;
    const knee = .24 + (1.15 * tuck - .24 * lead) * amp + .12 * reach;
    a['leg' + side] = thigh;
    a['knee' + side] = knee;
    a['step' + side] = sign * (.05 + .06 * tuck) * amp;
    a['sole' + side] = (.32 * (1 - reach) * amp - .09 * reach) - thigh - knee;
    a['arm' + side + 'x'] = -.12 - (jump.launched ? .58 * drive : 0) + .46 * lead * amp + .15 * reach;
    a['arm' + side + 'z'] = sign * (.13 + (.15 + .36 * reach) * amp);
    a['elbow' + side] = -.24 - (.48 * tuck + .17 * Math.max(0, -lead)) * amp;
  }
  a.lower = -.025 * tuck * amp;
  a.torsoX = .08 + (.14 * tuck + .10 * speed) * amp;
  a.shoulderYaw = .15 * stride * amp;
  a.hipYaw = -.10 * stride * amp;
  a.headX = -.07 * drive + .09 * reach;
}
