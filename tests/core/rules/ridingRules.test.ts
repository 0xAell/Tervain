import { describe, expect, it } from 'vitest';
import { DEER_BODY, MOUNT_STAMINA, RIDE, type RideMotion, deerBodyBlocked, deerBodyOverlap, deerBodyPoints, doorwayAhead, gaitBob, mountStaminaStep, roomAtDoor, steerMount } from '../../../src/core/rules/riding';
import { INTERIORS, fromBuildingLocal, roomHalfSize } from '../../../src/core/world/interiors';

const dt = 1 / 60;

describe('the reins', () => {
  it('gathers speed at the deer’s acceleration and never beyond its pace', () => {
    let state = { speed: 0, yaw: 0 };
    state = steerMount(state, 0, 1, 1, false, dt);
    expect(state.speed).toBeCloseTo(RIDE.accel * dt, 6);
    for (let i = 0; i < 600; i++) state = steerMount(state, 0, 1, 1, false, dt);
    expect(state.speed).toBeCloseTo(RIDE.walk, 5);
    for (let i = 0; i < 600; i++) state = steerMount(state, 0, 1, 1, true, dt);
    expect(state.speed).toBeCloseTo(RIDE.run, 5);
  });

  it('turns no faster than its limit, wider at a gallop than from a standstill', () => {
    const still = steerMount({ speed: 0, yaw: 0 }, 1, 0, 1, false, dt);
    expect(still.turn).toBeCloseTo(RIDE.turnStill, 6);
    const galloping = steerMount({ speed: RIDE.run, yaw: 0 }, 1, 0, 1, true, dt);
    expect(galloping.turn).toBeCloseTo(RIDE.turnRun, 6);
    expect(galloping.turn).toBeLessThan(still.turn);
  });

  it('backs up slowly when steered straight behind from a stand, and pulls up when the reins go slack', () => {
    let state = { speed: 0, yaw: 0 };
    for (let i = 0; i < 120; i++) state = steerMount(state, 0, -1, 1, false, dt);
    expect(state.speed).toBeCloseTo(-RIDE.back, 5);
    expect(state.yaw).toBeCloseTo(0, 6);
    let moving: RideMotion = { speed: RIDE.run, yaw: 0.4 };
    moving = steerMount(moving, 0, 0, 0, false, dt);
    expect(moving.speed).toBeCloseTo(RIDE.run - RIDE.brake * dt, 6);
    for (let i = 0; i < 120; i++) moving = steerMount(moving, 0, 0, 0, false, dt);
    expect(moving.speed).toBe(0);
    expect(moving.yaw).toBeCloseTo(0.4, 6);
  });
});

describe('the deer’s gallop stamina', () => {
  it('drains galloping and recovers otherwise, between empty and full', () => {
    expect(mountStaminaStep(50, true, 1)).toBe(50 - MOUNT_STAMINA.drain);
    expect(mountStaminaStep(50, false, 1)).toBe(50 + MOUNT_STAMINA.recover);
    expect(mountStaminaStep(1, true, 5)).toBe(0);
    expect(mountStaminaStep(MOUNT_STAMINA.max - 1, false, 5)).toBe(MOUNT_STAMINA.max);
    expect(MOUNT_STAMINA.spent).toBeLessThan(MOUNT_STAMINA.resume);
  });
});

describe('the saddle’s rise and fall', () => {
  it('is still at a stand, peaks twice a stride and rises higher at a gallop, within its cap', () => {
    expect(gaitBob(0.125, 0.1)).toBe(0);
    expect(gaitBob(0, RIDE.walk)).toBeCloseTo(0, 9);
    expect(gaitBob(0.5, RIDE.walk)).toBeCloseTo(0, 9);
    const walk = gaitBob(0.25, RIDE.walk), gallop = gaitBob(0.25, RIDE.run);
    expect(gaitBob(0.75, RIDE.walk)).toBeCloseTo(walk, 9);
    expect(gallop).toBeGreaterThan(walk);
    expect(gaitBob(0.25, 100)).toBeCloseTo(0.065, 9);
  });
});

describe('the deer’s body', () => {
  it('is checked at its nose, saddle and rump along its facing', () => {
    const [nose, saddle, rump] = deerBodyPoints(10, 20, Math.PI / 2);
    expect(nose!.x).toBeCloseTo(10 + DEER_BODY.front, 9); expect(nose!.z).toBeCloseTo(20, 9);
    expect(saddle).toEqual({ x: 10, z: 20 });
    expect(rump!.x).toBeCloseTo(10 - DEER_BODY.back, 9); expect(rump!.z).toBeCloseTo(20, 9);
  });

  it('counts scenery at each spine point within the body’s height band', () => {
    const seen: { minY: number; maxY: number }[] = [];
    const colliders = { blocked: (x: number, _z: number, radius: number, bounds?: { minY: number; maxY: number }) => { seen.push(bounds!); expect(radius).toBe(DEER_BODY.radius); return x > 500.5; } };
    expect(deerBodyOverlap(colliders, 500, 3, 500, Math.PI / 2)).toEqual({ scenery: 1, rooms: 0 });
    expect(deerBodyBlocked(colliders, 500, 3, 500, Math.PI / 2)).toBe(true);
    expect(deerBodyBlocked(colliders, 500, 3, 500, 0)).toBe(false);
    expect(seen[0]).toMatchObject({ minY: 3 + DEER_BODY.low, maxY: 3 + DEER_BODY.high });
  });

  it('may not stand in a doorway or on a room’s floor, and is told of a doorway ahead', () => {
    const room = INTERIORS[0]!, building = room.building, { hd } = roomHalfSize(room);
    const inside = fromBuildingLocal(building, room.door.x, 0);
    expect(roomAtDoor(inside.x, inside.z)).toBe(room);
    expect(deerBodyBlocked({ blocked: () => false }, inside.x, 0, inside.z, 0)).toBe(true);
    const before = fromBuildingLocal(building, room.door.x, building.d / 2 + 1);
    expect(doorwayAhead(before.x, before.z)).toBe(room);
    const beside = fromBuildingLocal(building, room.door.x + room.door.halfWidth + 3, building.d / 2 + 1);
    expect(doorwayAhead(beside.x, beside.z)).toBeNull();
    const far = fromBuildingLocal(building, room.door.x, hd + 30);
    expect(doorwayAhead(far.x, far.z)).toBeNull();
    expect(roomAtDoor(far.x, far.z)).toBeNull();
  });
});
