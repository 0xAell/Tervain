import type { V2 } from '../core/world/layout';
import { groundAt } from './land';
import { onBridge } from './water';
import { groundProject } from './relief';

export interface Footprint {
  x: number;
  y: number;
  angle: number;
  born: number;
  sand: boolean;
  running: boolean;
  landing: boolean;
  side: number;
}

/** Count steps from the distance the collision solver actually allowed the traveller to move. */
export class Footfalls {
  phase = 0;
  serial = 0;
  speed = 0;
  material = '';
  readonly prints: Footprint[] = [];

  private stamp(foot: V2, dx: number, dz: number, side: number, born: number, sand: boolean, landing: boolean) {
    const at = groundProject({ x: foot.x + dz * side * 0.24, z: foot.z - dx * side * 0.24 });
    this.prints.push({
      ...at,
      angle: Math.atan2((dx + dz) * 0.5, dx - dz),
      born,
      sand,
      running: this.speed > 6.4,
      landing,
      side,
    });
    if (this.prints.length > 38) this.prints.shift();
  }

  land(foot: V2, yaw: number, time: number, material: string) {
    if (material !== 'sand' && material !== 'trail') return;
    for (const side of [-1, 1])
      this.stamp(foot, Math.sin(yaw), Math.cos(yaw), side, time, material === 'sand', true);
  }

  advance(
    from: V2,
    to: V2,
    dt: number,
    time: number,
    grounded: boolean,
    surface: string | ((point: V2) => string),
    mount: boolean,
    swim: boolean
  ) {
    while (this.prints.length && time - this.prints[0]!.born > 12) this.prints.shift();
    const dx = to.x - from.x,
      dz = to.z - from.z,
      metres = Math.hypot(dx, dz);
    this.speed = grounded && dt > 0 ? metres / dt : 0;
    if (this.speed < 0.05 || this.speed > 22) return;
    const stride = swim ? 2.55 : mount ? 3.7 : Math.min(2.58, 1.45 + this.speed * 0.125);
    const next = this.phase + metres / stride;
    for (let contact = Math.floor(this.phase) + 1; contact <= next; contact++) {
      const fraction = (contact - this.phase) / (next - this.phase);
      const foot = { x: from.x + dx * fraction, z: from.z + dz * fraction };
      this.serial++;
      this.material = typeof surface === 'function' ? surface(foot) : surface || (onBridge(foot) ? 'wood' : groundAt(foot.x, foot.z));
      if (!mount && !swim && (this.material === 'sand' || this.material === 'trail')) {
        const side = this.serial % 2 ? 1 : -1;
        const born = time - dt * (1 - fraction);
        this.stamp(foot, dx / metres, dz / metres, side, born, this.material === 'sand', false);
      }
    }
    this.phase = next % 2;
  }
}
