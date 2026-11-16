import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../../src/core/game/state';
import { CLAIMED_PLACE_FACTS, knownPlaces, placeClaimed, PLACE_ORDER } from '../../../src/core/game/journal';
import { bellWait, DROUGHT_BELL } from '../../../src/core/rules/journey';
import { zoneOnBody } from '../../../src/core/rules/archery';
import { STANDING_BODY } from '../../../src/core/rules/session';
import { ARCHIVE_FLOOR, archiveBarriers, insideArchive, occupiesArchive } from '../../../src/core/world/archive';
import { ARCHIVE_ROOM, bySpec } from '../../../src/core/world/layout';
import { PLAYER_BODY_RADIUS } from '../../../src/core/world/playerPlacement';

// The archive as a room one can be shut in, and a few small rules that had sat beside the scene.

describe('the archive', () => {
  const b = bySpec('archive');

  it('counts him inside on its floor, and still in while any of him is in the doorway or the shutter’s opening', () => {
    expect(insideArchive(ARCHIVE_FLOOR.x, ARCHIVE_FLOOR.z)).toBe(true);
    expect(insideArchive(ARCHIVE_FLOOR.x + ARCHIVE_FLOOR.halfWidth + 0.1, ARCHIVE_FLOOR.z)).toBe(false);
    const doorZ = b.z + b.d / 2, r = PLAYER_BODY_RADIUS;
    expect(occupiesArchive(b.x, doorZ, r)).toBe(true); // on the threshold
    expect(occupiesArchive(b.x, doorZ + ARCHIVE_ROOM.wallThickness + r - 0.01, r)).toBe(true); // a shoulder still in it
    expect(occupiesArchive(b.x, doorZ + ARCHIVE_ROOM.wallThickness + r + 0.01, r)).toBe(false); // clear of it
    expect(occupiesArchive(b.x + ARCHIVE_ROOM.doorHalfWidth + r + 0.01, doorZ, r)).toBe(false); // beside the door, against the wall
    const shutterZ = b.z - b.d / 2;
    expect(occupiesArchive(b.x, shutterZ - ARCHIVE_ROOM.wallThickness - r + 0.01, r)).toBe(true);
    expect(occupiesArchive(b.x + ARCHIVE_ROOM.shutterHalfWidth + r + 0.01, shutterZ, r)).toBe(false); // the shutter is the narrower
    expect(ARCHIVE_ROOM.shutterHalfWidth).toBeLessThan(ARCHIVE_ROOM.doorHalfWidth);
  });

  it('never closes around someone inside it', () => {
    expect(archiveBarriers('locked', 'sealed', false)).toEqual({ door: true, shutter: true });
    expect(archiveBarriers('locked', 'sealed', true)).toEqual({ door: false, shutter: false });
    expect(archiveBarriers('open', 'forced', false)).toEqual({ door: false, shutter: false });
    expect(archiveBarriers('open', 'shut', false)).toEqual({ door: false, shutter: true });
  });
});

describe('small rules that sat beside the scene', () => {
  it('shows on the map the places he has been to and those he has been told of', () => {
    const s = createInitialState();
    const told = Object.entries(CLAIMED_PLACE_FACTS)[0]! as [typeof PLACE_ORDER[number], string];
    expect(knownPlaces(s)).toEqual(PLACE_ORDER.filter((id) => s.discovered[id]));
    s.facts[told[1]] = true;
    expect(placeClaimed(s, told[0])).toBe(true);
    expect(knownPlaces(s)).toContain(told[0]);
    s.discovered[told[0]] = true;
    expect(placeClaimed(s, told[0])).toBe(false); // been there now: no longer hearsay
    expect(knownPlaces(s)).toContain(told[0]);
    expect(placeClaimed(s, 'shore')).toBe(false); // nobody tells him of the strand he woke on
  });

  it('thinks of the bell again at its interval while the drought holds, and not otherwise', () => {
    expect(bellWait(true)).toBe(DROUGHT_BELL.every);
    expect(bellWait(false)).toBeGreaterThan(1000);
  });

  it('lets a carcass stop an arrow and take no harm', () => {
    expect([zoneOnBody('head', false), zoneOnBody('body', false), zoneOnBody(null, false)]).toEqual(['head', 'body', null]);
    expect([zoneOnBody('head', true), zoneOnBody('body', true)]).toEqual([null, null]);
  });

  it('gives a hostile’s footing a wanderer narrower than the body that walks, and an animal a little margin', () => {
    expect(STANDING_BODY.heroRadius).toBeLessThan(PLAYER_BODY_RADIUS);
    expect(STANDING_BODY.heroHeight).toBeLessThan(STANDING_BODY.height);
    expect(STANDING_BODY.animalMargin).toBeGreaterThan(0);
  });
});
