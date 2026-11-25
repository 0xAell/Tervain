import RAPIER from '@dimforge/rapier3d-compat';

let initialization: Promise<void> | undefined;
export function initializePhysics() {
  return (initialization ??= RAPIER.init());
}
