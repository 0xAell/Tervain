import type { WorldView } from '../core/game/worldView';

/** Twelve notches of the winding drum transfer lift from the mill leaf to the quarry leaf. */
export function sluiceSetting(view: WorldView) {
  if (view.gate === 'damaged') return { suffix: '', notch: 6, description: 'A split runs through the mill leaf. Water escapes beneath the other gate.' };
  if (view.gate === 'jammed') return { suffix: '--jammed', notch: 6, description: 'A timber is wedged across both leaves. The wheel cannot turn.' };
  if (view.scheduleBoard) return view.millTurning
    ? { suffix: '--rota', notch: 0, description: 'The keeper’s tablet shows the sun. The mill has the water until the night shift.' }
    : { suffix: '--rota', notch: 12, description: 'The keeper’s tablet shows the moon. The quarry has the water until the day shift.' };
  if (view.allocation === 'rillford') return { suffix: '--set', notch: 0, description: 'The mill leaf is raised. The quarry leaf rests on its sill.' };
  if (view.allocation === 'quarry') return { suffix: '--set', notch: 12, description: 'The quarry leaf is raised. The mill leaf rests on its sill.' };
  return { suffix: '--set', notch: 6, description: 'The iron brace holds. Both leaves are cracked open while the water hearing waits.' };
}
