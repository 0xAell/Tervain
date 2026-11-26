type HouseCraft = 'weave' | 'timber' | 'garden' | 'hunt' | 'grain' | 'cask' | 'bell' | 'record' | 'tide';
interface HouseStyle {
  depth: number; hall: number; west: number; east: number; back: number; front: number;
  wall: string; trim: string; motif: HouseCraft;
}
const style = (motif: HouseCraft, depth: number, hall: number, west: number, east: number, back: number, front: number, wall: string, trim: string): HouseStyle =>
  ({ motif, depth, hall, west, east, back, front, wall, trim });
const houses = {
  weave: style('weave', 7.7, 8.2, 12, 7.6, 0.4, 2.1, '#43525c', '#d9bc87'),
  timber: style('timber', 6.8, 8.1, 12.9, 8.1, 0.6, 0.2, '#63452e', '#b99b67'),
  garden: style('garden', 8.6, 7.8, 8.1, 11, 3.6, 2.7, '#485446', '#bfc293'),
  hunt: style('hunt', 8, 8.3, 10.5, 8, 2.2, 0.1, '#604941', '#d1a37e'),
  grain: style('grain', 7.5, 8.9, 9.4, 11, 0.1, 3.1, '#73543c', '#d7bc85'),
  cask: style('cask', 7, 8, 8.1, 12.5, 2.8, 0.2, '#58463d', '#aa9277'),
  bell: style('bell', 9, 9.5, 9.3, 10.4, 4, 3.8, '#4d595b', '#d5be8e'),
  record: style('record', 7.6, 8.3, 12.5, 9.5, 0.3, 0.8, '#654946', '#c6b39a'),
  tide: style('tide', 8.2, 8, 8.3, 11.3, 2.5, 1.6, '#405858', '#aac8b7'),
};
const occupations: Record<string, HouseCraft> = {
  house_a: 'weave', house_b: 'timber', house_c: 'garden', house_d: 'hunt', house_e: 'grain', house_f: 'cask',
  mill: 'grain', bakery: 'grain', inn: 'cask', reeve_house: 'record', sluice_hut: 'timber', shrine_hall: 'bell',
  archive: 'record', quarry_office: 'record', crew_bunks: 'timber', overlook_lodge: 'hunt', fisher_house: 'tide',
  net_store: 'tide', keeper_cottage: 'garden', hunter_lean_to: 'hunt', lantern_tower: 'bell', forest_ruin: 'bell',
};
// Plaster, boarded walls and wet masonry belong to different working rooms.
const workshopWalls: Partial<Record<HouseCraft, { surface: string; height: number; masonryFloor?: boolean }>> = {
  weave: { surface: 'room_plaster', height: 38 },
  timber: { surface: 'room_floor_timber', height: 30 },
  garden: { surface: 'room_plaster', height: 36, masonryFloor: true },
  hunt: { surface: 'room_floor_hunt', height: 31 },
  grain: { surface: 'room_plaster', height: 32, masonryFloor: true },
  cask: { surface: 'room_masonry', height: 35, masonryFloor: true },
};
export function workshopWall(motif: HouseCraft) { return workshopWalls[motif]; }
export function houseStyle(id: string): HouseStyle { return houses[occupations[id] ?? 'timber']; }
