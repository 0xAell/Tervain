import type { ItemId } from '../core/game/types';

export interface Household {
  name: string;
  workroom: string;
  loft: string;
  cellar: string;
  tool: string;
  supplies: ItemId;
  book: string;
  passage: string;
  task: 'read' | 'herbs' | 'fletch' | 'cook' | 'ledger' | 'rite';
}
function home(
  name: string,
  workroom: string,
  loft: string,
  cellar: string,
  tool: string,
  supplies: ItemId,
  task: Household['task'],
  book: string,
  passage: string
): Household {
  return { name, workroom, loft, cellar, tool, supplies, task, book, passage };
}
export const households: Record<string, Household> = {
  house_a: home(
    'Weaver’s House',
    'Dye room',
    'Spinning loft',
    'Dye cellar',
    'loom',
    'healing_herb',
    'read',
    'The weaver’s pattern book',
    'Four indigo threads cross one gold. The pattern repeats the little windows in the footbridge rail.'
  ),
  house_b: home(
    'Woodcutter’s House',
    'Saw room',
    'Timber loft',
    'Wood store',
    'workbench',
    'iron_scrap',
    'fletch',
    'Coppice marks',
    'A fork cut above a stump means the tree will grow again. A cross means leave the hollow trunk for owls.'
  ),
  house_c: home(
    'Herbalist’s House',
    'Stillroom',
    'Drying loft',
    'Root cellar',
    'herbs',
    'healing_herb',
    'herbs',
    'A pressed-leaf folio',
    'Silverleaf keeps its colour in shade. Fold the dried leaf in damp linen for a travelling poultice.'
  ),
  house_d: home(
    'Hunter’s House',
    'Fletching room',
    'Trophy loft',
    'Smoke cellar',
    'rack',
    'iron_scrap',
    'fletch',
    'Rowan’s field notes',
    'Watch where the reeds bend against the flow. A deer crossing leaves a wake long after it reaches the bank.'
  ),
  house_e: home(
    'Farmer’s House',
    'Seed room',
    'Hayloft',
    'Root cellar',
    'sacks',
    'field_mushroom',
    'cook',
    'A planting calendar',
    'Sow the lower rows when the first blue iris opens. Keep the upper rows for years when the sluice runs high.'
  ),
  house_f: home(
    'Brewer’s House',
    'Brewhouse',
    'Malt loft',
    'Cask cellar',
    'cauldron',
    'shore_apple',
    'cook',
    'The small-beer book',
    'Roast the malt until it smells of toast. The oldest cask stays by the cold earth of the north wall.'
  ),
  bakery: home(
    'Rillford Bakery',
    'Bakehouse',
    'Flour loft',
    'Cool pantry',
    'oven',
    'bread',
    'cook',
    'The baker’s slate',
    'The morning batch travels to the bridge before sunrise. A shallow cross marks the loaves set aside for the mill hands.'
  ),
  inn: home(
    'The Wayfarer’s Inn',
    'Taproom',
    'Guest chambers',
    'Cask cellar',
    'counter',
    'field_mushroom',
    'cook',
    'The inn register',
    'Last night a ferryman paid with a brass button. Somebody drew a kingfisher in the margin beside his name.'
  ),
  mill: home(
    'Rillford Mill',
    'Grinding room',
    'Hoist loft',
    'Wheel cellar',
    'tools',
    'iron_scrap',
    'fletch',
    'The miller’s tally',
    'A slow wheel tears the grain. The mill hand listens for an even three-beat knock before opening another sack.'
  ),
  reeve_house: home(
    'The Reeve’s House',
    'Council room',
    'Records loft',
    'Deed vault',
    'desk',
    'bread',
    'read',
    'The village roll',
    'Each household signed for a length of new bridge rail. The shortest signatures belong to the children who carried the pegs.'
  ),
  sluice_hut: home(
    'Sluice Keeper’s Hut',
    'Gauge room',
    'Watch loft',
    'Valve cellar',
    'workbench',
    'iron_scrap',
    'fletch',
    'A keeper’s notebook',
    'A pale chalk ring marks each spring flood. The highest one is dated the year the ash tree fell.'
  ),
  shrine_hall: home(
    'Spring Shrine',
    'Offering chapel',
    'Choir gallery',
    'Spring crypt',
    'altar',
    'votive_reed',
    'rite',
    'The spring hymn',
    'The first verse names the spring; the last names every field its water reaches. The refrain is worn smooth by many thumbs.'
  ),
  archive: home(
    'The Spring Archive',
    'Reading room',
    'Manuscript gallery',
    'Record vault',
    'desk',
    'healing_herb',
    'ledger',
    'The water ledger',
    'Silt has gathered between the oldest leaves. The allocation entries survive in a narrow column of iron-gall ink.'
  ),
  quarry_office: home(
    'Quarry Office',
    'Survey room',
    'Survey loft',
    'Sample vault',
    'desk',
    'iron_scrap',
    'read',
    'The surveyor’s section',
    'Blue marks run beneath the lowest cut. The surveyor drew the old seep twice and underlined it in red.'
  ),
  crew_bunks: home(
    'Quarry Bunkhouse',
    'Mess room',
    'Sleeping gallery',
    'Provision cellar',
    'cauldron',
    'field_mushroom',
    'cook',
    'The shift board',
    'A striker rings once for water and twice for stone. Someone has scratched a spare shift beside every injured worker.'
  ),
  overlook_lodge: home(
    'Overlook Lodge',
    'Map room',
    'Lookout loft',
    'Trail cellar',
    'rack',
    'iron_scrap',
    'fletch',
    'The ridge chart',
    'The safest winter trail loops above the quarry. Small ink feathers mark the places where ravens nest.'
  ),
  fisher_house: home(
    'The Fisher’s House',
    'Net room',
    'Net loft',
    'Salt cellar',
    'rack',
    'field_mushroom',
    'cook',
    'Tide and shoal',
    'Watch the gold glint before a shoal turns. A clear pool reflects the whole willow when the trout have settled.'
  ),
  net_store: home(
    'The Net Store',
    'Mending room',
    'Rigging loft',
    'Supply cellar',
    'loom',
    'iron_scrap',
    'fletch',
    'A knot sampler',
    'The narrow net is mended with a sheet bend. The heavier river rope needs two turns before it will hold.'
  ),
  keeper_cottage: home(
    'Keeper’s Cottage',
    'Lamp room',
    'Keeper’s loft',
    'Oil cellar',
    'tools',
    'healing_herb',
    'herbs',
    'A keeper’s log',
    'The wick is trimmed before dusk. A steady light lets the shore boats find the gap between the two black rocks.'
  ),
  hunter_lean_to: home(
    'Hunter’s Shelter',
    'Hide room',
    'Watch platform',
    'Trail cache',
    'rack',
    'iron_scrap',
    'fletch',
    'Tracks in the deepwood',
    'A clean claw mark points uphill. Two overlapping pads mean the wolf turned back to examine its own trail.'
  ),
  lantern_tower: home(
    'Lantern Point Tower',
    'Watch room',
    'Lantern gallery',
    'Oil vault',
    'workbench',
    'iron_scrap',
    'read',
    'The lightkeeper’s register',
    'One lamp faces the open water, one the strand. In fog the keeper takes time from the bell instead of the sun.'
  ),
  forest_ruin: home(
    'Deepwood Ruin',
    'Old sacristy',
    'Bell gallery',
    'Undercroft',
    'altar',
    'healing_herb',
    'herbs',
    'The weathered inscription',
    'Beneath the moss, a carved spring runs from a cup to an open hand. The foot of the stone is still damp.'
  ),
};
