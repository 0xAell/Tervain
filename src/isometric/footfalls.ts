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
  side: number;
}

/** Count steps from the distance the collision solver actually allowed the traveller to move. */
export class Footfalls {
  phase = 0;
  serial = 0;
  speed = 0;
  material = '';
  readonly prints: Footprint[] = [];

  advance(
    from: V2,
    to: V2,
    dt: number,
    time: number,
    grounded: boolean,
    roomMaterial: string,
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
    if (Math.floor(next) > Math.floor(this.phase)) {
      this.serial++;
      this.material = roomMaterial || (onBridge(to) ? 'wood' : groundAt(to.x, to.z));
      if (!mount && (this.material === 'sand' || this.material === 'trail')) {
        const side = this.serial % 2 ? 1 : -1;
        const at = groundProject({
          x: to.x + (dz / metres) * side * 0.24,
          z: to.z - (dx / metres) * side * 0.24,
        });
        this.prints.push({
          ...at,
          angle: Math.atan2((dx + dz) * 0.5, dx - dz),
          born: time,
          sand: this.material === 'sand',
          running: this.speed > 6.4,
          side,
        });
        if (this.prints.length > 38) this.prints.shift();
      }
    }
    this.phase = next % 2;
  }
}
