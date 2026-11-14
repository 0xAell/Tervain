/**
 * The authored half of the asset manifest (data/assets/manifest.json): what each family of files is for, where it came
 * from, what happens to it in an Unreal Engine port, and how its files are named there. `tools/asset-manifest.mjs`
 * joins these rules with the files on disk, their sizes and hashes, and the model licence ledger.
 *
 * `plan` is one of:
 *   replace  a coherent pack (Fab, Megascans, MetaHuman) takes its place; the file is a stand-in for scale and intent.
 *            `pack` names the first-choice pack among the candidates of the group's Fab category, `with` any
 *            companion packs it needs, and `webTarget` the pack to use instead where Nanite is not available
 *   keep     it is the game's own and carries over; re-import it from the path given
 *   rework   the content carries over but must be re-authored for Unreal (re-rigged, re-cut, re-baked)
 *   drop     only the web build or its tooling needs it
 */

/**
 * Unreal asset-name prefixes by asset type. SM_, SK_, T_, M_, MI_, AS_ and DT_ are Epic's own ("Recommended Asset
 * Naming Conventions in Unreal Engine Projects"); that page lists no prefix for sounds, so SW_ is this project's.
 */
export const UNREAL_PREFIX = {
  StaticMesh: 'SM_', SkeletalMesh: 'SK_', Texture: 'T_', Material: 'M_', MaterialInstance: 'MI_', AnimationSequence: 'AS_',
  DataTable: 'DT_', SoundWave: 'SW_',
};

/** Texture-name suffixes by what the texture holds. Epic's page gives the pattern but no suffix list; these are this project's. */
export const TEXTURE_SUFFIX = { albedo: '_D', color: '_D', normal: '_N', data: '_ORM' };

/** PascalCase from any file name: every run of letters and digits becomes a capitalised part. */
const pascal = (text) => text.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
const lodOf = (name) => (/-near\b|under-\d+k|hero-50k|-sealed|animated-hero/.test(name) ? 0 : /-mid\b/.test(name) ? 1 : /-far\b/.test(name) ? 2 : null);
const stem = (path) => path.split('/').pop().replace(/\.[a-z0-9]+$/i, '');

const mesh = (type, folder, name) => (path) => ({ type, folder, name: `${UNREAL_PREFIX[type]}${name(stem(path))}`, lod: lodOf(stem(path)) });
const sound = (folder, name) => (path) => ({ type: 'SoundWave', folder, name: `${UNREAL_PREFIX.SoundWave}${name(stem(path))}`, lod: null });
const texture = (folder, name) => (path) => {
  const base = stem(path), kind = Object.keys(TEXTURE_SUFFIX).find((key) => base.endsWith(`-${key}`));
  return { type: 'Texture', folder, name: `${UNREAL_PREFIX.Texture}${name(kind ? base.slice(0, -kind.length - 1) : base)}${kind ? TEXTURE_SUFFIX[kind] : ''}`, lod: null };
};
const none = () => null;
const treeName = (base) => pascal(base.replace(/-(near|mid|far)$/, '').replace(/-under-\d+k$/, ''));

/**
 * Groups in matching order: the first whose `match` fits a path owns it. `unreal(path)` names the asset an import of
 * that file would produce, or returns null when nothing is imported from it.
 */
export const GROUPS = [
  {
    id: 'hero', title: 'The wanderer (hero body and animation)', kind: 'model', role: 'hero', match: /^public\/models\/hero\//,
    plan: 'replace', fab: 'characters', pack: 'Modular Medieval Citizens',
    why: 'A generated body on a generated rig, with unresolved provenance for two of its sources. A commercial port needs a character with clear terms: a MetaHuman or a modular medieval character from one pack, on the engine’s standard skeleton so animation packs retarget.',
    source: 'Generated with Meshy; see docs/engineering/main-hero.md and the model ledger.',
    unreal: mesh('SkeletalMesh', '/Game/Tervain/Characters/Hero', (base) => `Hero_${pascal(base.replace(/^weathered-wanderer-/, ''))}`),
  },
  {
    id: 'residents', title: 'Residents and hostiles (17 figures)', kind: 'model', role: 'resident', match: /^public\/models\/npcs\/[^/]+\.glb$/,
    plan: 'replace', fab: 'characters', pack: 'Modular Medieval Citizens',
    why: 'Seventeen separately generated figures of uneven proportion and surface. One modular villager set gives a coherent cast, shared skeleton and LODs.',
    source: 'Generated or downloaded Meshy models, adapted; see docs/engineering/meshy-npcs.md and the model ledger.',
    unreal: mesh('SkeletalMesh', '/Game/Tervain/Characters/Residents', (base) => `Resident_${pascal(base)}`),
  },
  {
    id: 'resident-rigs', title: 'Resident rig measurements', kind: 'data', role: 'resident', match: /^public\/models\/npcs\/(rigs\/[^/]+\.json|manifest\.json)$/,
    plan: 'drop', fab: null, why: 'Per-figure joint and garment measurements for the web build’s own posing. A port’s characters bring their own rigs.',
    source: 'Written by tools/meshy-rig.', licence: { id: 'LicenseRef-Tervain-Original', status: 'project-original' }, unreal: none,
  },
  {
    id: 'resident-motion', title: 'Resident motion library', kind: 'model', role: 'animation', match: /^public\/models\/npcs\/motion\//,
    plan: 'replace', fab: 'animation', pack: 'MC Village Life Animation Pack', with: ['Game Animation Sample', 'Sword Animset Pro', 'Swim Animset'],
    why: 'Generated clips fitted to the generated rigs. Locomotion, work, sitting and combat should come from an animation pack on the standard skeleton.',
    source: 'Meshy animation library output; see docs/engineering/resident-motion-0.0.13.md.',
    licence: { id: 'LicenseRef-meshy-paid-plan-output', status: 'meshy-paid-plan-output' },
    unreal: (path) => (path.endsWith('.glb') ? { type: 'AnimationSequence', folder: '/Game/Tervain/Characters/Residents/Animations', name: `${UNREAL_PREFIX.AnimationSequence}Resident_Library`, lod: null } : null),
  },
  {
    id: 'animals', title: 'Animals (19 rigged models)', kind: 'model', role: 'animal', match: /^public\/models\/animals\//,
    plan: 'replace', fab: 'animals', pack: 'FOREST ANIMALS PACK', with: ['ANIMAL VARIETY PACK', 'African Animals', 'Cats Pack'],
    why: 'Community models of mixed quality with in-place clips only. An animal pack supplies matched skeletons, gaits, LODs and often sounds.',
    source: 'Meshy Community downloads, optimised and rigged; see docs/engineering/meshy-animal-assets.json.',
    unreal: mesh('SkeletalMesh', '/Game/Tervain/Animals', (base) => `Animal_${pascal(base)}`),
  },
  {
    id: 'trees-supplied', title: 'Supplied trees (15 kinds, three levels each)', kind: 'model', role: 'tree', match: /^public\/models\/flora\/meshy-012\//,
    plan: 'replace', fab: 'trees', pack: 'Megaplants: English Oak', with: ['DZ Trees - Low Poly Palms'], webTarget: 'European Beech (Megascans Trees)',
    why: 'Generated trees with card crowns rebuilt in code. Scanned tree sets bring real bark, leaf and wind data and proper LODs; the planting (data/world/flora.json) carries over.',
    source: 'Meshy Community downloads, rebuilt by tools/build-meshy-trees.py; see docs/engineering/meshy-tree-assets.json.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Flora/Trees', (base) => `Tree_${treeName(base)}`),
  },
  {
    id: 'trees-generated', title: 'Generated trees (hero oak, birch, apple, pear, bush, sentinel, pine)', kind: 'model', role: 'tree', match: /^public\/models\/flora\/hero\//,
    plan: 'replace', fab: 'trees', pack: 'Megaplants: English Oak', with: ['Apple Tree Pack (Mobile/Desktop)'], webTarget: 'European Beech (Megascans Trees)',
    why: 'The project’s own procedural trees (tools/tree-gen), built for the web build’s triangle budget. They are original and may be kept as a fallback, but a port should use one tree source throughout.',
    source: 'Generated by tools/tree-gen and tools/tree-gen-pine; project-original.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Flora/Trees', (base) => `Tree_${treeName(base)}`),
  },
  {
    id: 'trees-pine', title: 'Solitary pine (three levels)', kind: 'model', role: 'tree', match: /^public\/models\/flora\/solitary-pine/,
    plan: 'replace', fab: 'trees', pack: 'Megaplants: English Oak', webTarget: 'European Beech (Megascans Trees)', why: 'As the supplied trees: replaced with the conifers of the chosen tree set.',
    source: 'Meshy Community download, adapted; see docs/engineering/solitary-pine.md.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Flora/Trees', (base) => `Tree_${treeName(base)}`),
  },
  {
    id: 'scenery', title: 'Scenery models (rock pile, ancient broadleaf)', kind: 'model', role: 'scenery', match: /^public\/models\/scenery\//,
    plan: 'replace', fab: 'rocks', pack: 'Nordic Beach Rock Formation', with: ['Nordic Coastal Cliff'], why: 'Two one-off generated models. Rocks and landmark trees come from the scanned rock and tree sets.',
    source: 'Meshy Community downloads, adapted; see docs/engineering/rock-pile-assets.json and broadleaf-assets.json.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Scenery', (base) => pascal(base.replace(/-under-\d+k$/, ''))),
  },
  {
    id: 'furniture', title: 'Furniture and household pieces (29 models)', kind: 'model', role: 'furniture', match: /^public\/models\/furniture\/[^/]+\.glb$/,
    plan: 'replace', fab: 'interiors', pack: 'Medieval Props: Kit', with: ['Medieval Fantasy Furniture Pack 01'],
    why: 'Generated pieces at inconsistent texel density. A medieval interior pack gives one material language; sizes and placements (data/world/interiors.json) carry over.',
    source: 'Generated with Meshy for the project; see docs/engineering/rooms-0.0.13.md.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Props/Furniture', (base) => `Furniture_${pascal(base)}`),
  },
  {
    id: 'furniture-manifest', title: 'Furniture size manifest', kind: 'data', role: 'furniture', match: /^public\/models\/furniture\/manifest\.json$/,
    plan: 'drop', fab: null, why: 'Measured sizes for the web build’s loader; the sizes the game uses are in the core.',
    source: 'Written by tools/prepare-meshy-furniture.py.', licence: { id: 'LicenseRef-Tervain-Original', status: 'project-original' }, unreal: none,
  },
  {
    id: 'debug', title: 'Wind test tree', kind: 'model', role: 'debug', match: /^public\/debug\//,
    plan: 'drop', fab: null, why: 'A fixture for the web build’s foliage wind tests.',
    source: 'Generated by tools/wind-test-tree.mjs; project-original.', licence: { id: 'LicenseRef-Tervain-Original', status: 'project-original' }, unreal: none,
  },
  {
    id: 'building-textures', title: 'Baked building surfaces (12 materials, colour and normal)', kind: 'texture', role: 'building-material', match: /^public\/textures\/buildings\/[^/]+\.jpg$/,
    plan: 'replace', fab: 'buildings', pack: 'Medieval Modular Town (With Interiors)',
    why: 'Procedurally baked plaster, timber, stone and metal for the web build’s merged building geometry. Buildings in a port come as modular kits with their own scanned or authored materials.',
    source: 'Baked by tools/textures/bake-buildings.py; project-original.', licence: { id: 'LicenseRef-Tervain-Original', status: 'project-original' },
    unreal: texture('/Game/Tervain/Architecture/Textures', (base) => `Building_${pascal(base)}`),
  },
  {
    id: 'building-textures-manifest', title: 'Building surface manifest', kind: 'data', role: 'building-material', match: /^public\/textures\/buildings\/manifest\.json$/,
    plan: 'drop', fab: null, why: 'Hashes for the web build’s texture loader.', source: 'Written by tools/textures/bake-buildings.py.',
    licence: { id: 'LicenseRef-Tervain-Original', status: 'project-original' }, unreal: none,
  },
  {
    id: 'leaf-atlases', title: 'Leaf atlases', kind: 'texture', role: 'foliage-texture', match: /^public\/textures\/leaf\//,
    plan: 'replace', fab: 'trees', pack: 'Megaplants: English Oak', webTarget: 'European Beech (Megascans Trees)', why: 'Leaf cards cut for the web build’s crowns from the supplied trees’ textures. Replaced together with the trees.',
    source: 'Built by tools/leaf-atlas from the supplied tree textures.', licence: { id: 'CC0-1.0', status: 'owner-recollection' },
    unreal: texture('/Game/Tervain/Flora/Textures', (base) => `Leaf_${pascal(base)}`),
  },
  {
    id: 'emblem', title: 'Hegemony emblem', kind: 'image', role: 'identity', match: /^public\/assets\/menu\//,
    plan: 'keep', fab: null, why: 'The approved faction emblem of the title screen: part of the game’s identity. Import the PNG; the WebP is the web build’s smaller copy.',
    source: 'Approved identity artwork from the Warpkeep-Assets repository; see docs/engineering/menu-assets.json.', licence: { id: 'LicenseRef-Tervain-Identity', status: 'project-owned' },
    unreal: (path) => (path.endsWith('.png') ? { type: 'Texture', folder: '/Game/Tervain/UI/Textures', name: 'T_UI_HegemonyEmblem', lod: null } : null),
  },
  {
    id: 'menu-music', title: 'Title music: The Sovereign’s Oath', kind: 'audio', role: 'music', match: /^(public\/assets\/audio\/the-sovereigns-oath\.|assets\/audio\/source\/the-sovereigns-oath)/,
    plan: 'keep', fab: null, why: 'The title theme the menu’s grove is choreographed to. Import the archived original; the OGG and M4A are web encodings. Its service terms are recorded as unresolved and must be cleared before a commercial release.',
    source: 'Supplied by the project owner; see docs/engineering/menu-score.md and menu-audio-assets.json.', licence: { id: 'LicenseRef-Service-Terms', status: 'unresolved' },
    unreal: (path) => (path.startsWith('assets/') ? { type: 'SoundWave', folder: '/Game/Tervain/Audio/Music', name: 'SW_Music_TheSovereignsOath', lod: null } : null),
  },
  {
    id: 'voice-web', title: 'Spoken lines, web sprites (240 sprite files in two encodings)', kind: 'audio', role: 'voice', match: /^public\/assets\/audio\/voice\//,
    plan: 'drop', fab: null, why: 'Each speaker’s lines joined end to end for the browser. A port imports the single takes from the source archive.',
    source: 'Cut from assets/audio/source/voice by tools/world-audio/prepare.mjs.', licence: { id: 'LicenseRef-ElevenLabs-Paid-Output', status: 'service-terms' }, unreal: none,
  },
  {
    id: 'voice-source', title: 'Spoken lines, single takes', kind: 'audio', role: 'voice', match: /^assets\/audio\/source\/voice\//,
    plan: 'keep', fab: null, why: 'The game’s own dialogue, one file a line, keyed as data/game/voice.json. Synthetic voices: keep as the working track and decide on recorded actors before release.',
    source: 'ElevenLabs text to speech with designed voices; see docs/engineering/voice-assets.json.', licence: { id: 'LicenseRef-ElevenLabs-Paid-Output', status: 'service-terms' },
    unreal: sound('/Game/Tervain/Audio/Voice', (base) => `Voice_${pascal(base)}`),
  },
  {
    id: 'world-audio-web', title: 'World sound, web banks and loops', kind: 'audio', role: 'sound', match: /^public\/assets\/audio\/world\//,
    plan: 'drop', fab: null, why: 'Effects packed into banks, and loops and music re-encoded, for the browser. A port imports the source clips.',
    source: 'Packed from assets/audio/source/world by tools/world-audio/prepare.mjs.', licence: { id: 'LicenseRef-ElevenLabs-Paid-Output', status: 'service-terms' }, unreal: none,
  },
  {
    id: 'world-audio-source', title: 'World sound, source clips (effects, ambience beds, music)', kind: 'audio', role: 'sound', match: /^assets\/audio\/source\/world\//,
    plan: 'keep', fab: 'audio',
    why: 'Foley, ambience and the adaptive score, generated for this world and already balanced against each other. Keep them; where a bed or effect is weak, a sound library from Fab fills the gap.',
    source: 'ElevenLabs Sound Effects and Eleven Music; see docs/engineering/world-audio-assets.json.', licence: { id: 'LicenseRef-ElevenLabs-Paid-Output', status: 'service-terms' },
    unreal: sound('/Game/Tervain/Audio/World', (base) => `World_${pascal(base)}`),
  },
  {
    id: 'animal-audio-web', title: 'Animal calls, web encodings', kind: 'audio', role: 'sound', match: /^public\/audio\/animals\//,
    plan: 'drop', fab: null, why: 'Browser encodings of the calls in the source archive.',
    source: 'Encoded from assets/audio/source/animals.', licence: { id: 'LicenseRef-ElevenLabs-Paid-Output', status: 'service-terms' }, unreal: none,
  },
  {
    id: 'animal-audio-source', title: 'Animal calls, source clips', kind: 'audio', role: 'sound', match: /^assets\/audio\/source\/animals\//,
    plan: 'keep', fab: 'audio', why: 'Two generated calls per kind, made for these animals. Keep them: no Fab library with the calls of all of them was found. Where the chosen animal pack brings recorded calls for an animal, use those.',
    source: 'ElevenLabs Sound Effects; see docs/engineering/animal-audio-assets.json.', licence: { id: 'LicenseRef-ElevenLabs-Paid-Output', status: 'service-terms' },
    unreal: sound('/Game/Tervain/Audio/Animals', (base) => `Animal_${pascal(base)}`),
  },
  {
    id: 'hunting-audio', title: 'Hunting sounds (bow, arrow, skinning)', kind: 'audio', role: 'sound', match: /^public\/assets\/audio\/hunting\/[^/]+\.mp3$/,
    plan: 'keep', fab: 'audio', why: 'Six effects made for the bow and the knife. Keep; a weapon foley library can replace any that read as synthetic.',
    source: 'ElevenLabs Sound Effects; see docs/engineering/hunting-sounds.json.', licence: { id: 'LicenseRef-ElevenLabs-Paid-Output', status: 'service-terms' },
    unreal: sound('/Game/Tervain/Audio/Hunting', (base) => `Hunting_${pascal(base)}`),
  },
  {
    id: 'hunting-audio-manifest', title: 'Hunting sound manifest', kind: 'data', role: 'sound', match: /^public\/assets\/audio\/hunting\/manifest\.json$/,
    plan: 'drop', fab: null, why: 'Hashes for the web build’s loader.', source: 'Written with the sounds.', licence: { id: 'LicenseRef-Tervain-Original', status: 'project-original' }, unreal: none,
  },
  {
    id: 'warpkeep-archive', title: 'Warpkeep model archive (209 models)', kind: 'model', role: 'archive', match: /^assets\/warpkeep\/.*\.glb$/,
    plan: 'drop', fab: null, why: 'Byte-exact copies of another project’s models, kept for provenance and not built into the game. They are not offered under an open licence and do not go into a port.',
    source: 'Warpkeep at revision 786c0b2; see docs/engineering/warpkeep-provenance.json.', unreal: none,
  },
  {
    id: 'warpkeep-archive-manifest', title: 'Warpkeep archive manifest', kind: 'data', role: 'archive', match: /^assets\/warpkeep\/manifest\.json$/,
    plan: 'drop', fab: null, why: 'The archive’s own file list.', source: 'Written by tools/import-warpkeep-assets.mjs.', licence: { id: 'LicenseRef-Warpkeep-Provenance-Required', status: 'project-specific-permission' }, unreal: none,
  },
];

/** Files under the asset roots that are documents, not assets. */
export const NOT_ASSETS = [
  /^public\/model-licenses\.(html|json)$/, /^public\/third-party-notices\.txt$/, /^public\/world-audio-licenses\.html$/, /^public\/source-license\//,
  /^public\/gothic3\//, /^assets\/gothic3\//,
];

const fab = (id) => `https://www.fab.com/listings/${id}`;
const WEB_TARGET = 'The Unreal web target uses the mobile renderer, which has no Nanite, Virtual Shadow Maps or Lumen: choose meshes with real LODs and no Nanite requirement. Epic’s mobile guidance is at most 500,000 triangles and 700 draw calls in view.';

/**
 * What to look for on Fab for each replacement, and the packs found. A candidate is a listing found to exist, by title,
 * in search results on 14 November 2026; none was opened on its listing page, bought or imported. A group's `pack` is
 * the first choice among its category's candidates, chosen from those descriptions. Check each on its page for licence
 * tier, supported engine version, LODs and price before buying, and never commit Fab content to this public
 * repository: the Fab Standard License allows sharing only with collaborators, for example in a private one.
 */
export const FAB = {
  trees: {
    brief: 'Temperate northern European trees with bark, leaf and wind data and three or more LODs: oak, birch, hazel or other shrubs, Scots pine, fir or spruce, apple and pear, and a few palms for the warm woodland in the east.',
    constraints: `${WEB_TARGET} Megaplants (English Oak, Silver Birch, Baltic Pine, Norway Spruce) are the exact species but need Nanite Foliage and the Procedural Vegetation Editor, both experimental; the older Megascans Trees packs are LOD-based.`,
    candidates: [
      { title: 'European Beech (Megascans Trees)', publisher: 'Quixel Megascans', url: fab('d11cc01d-9422-41b7-950f-416c9ce79caf'), note: 'LOD-based, with European Hornbeam, European Black Alder, Norway Maple and Common Hazel in the same series: a northern broadleaf wood without oak or birch.', verified: 'search result' },
      { title: 'Megaplants: English Oak', publisher: 'Quixel Megaplants', url: fab('83642c38-7661-4df1-8629-0422e1898d26'), note: 'With Megaplants: Silver Birch, Baltic Pine and Norway Spruce: the right species for a desktop build with Nanite Foliage; not for the web target.', verified: 'search result' },
      { title: 'Apple Tree Pack (Mobile/Desktop)', publisher: 'not recorded', url: fab('1d83287e-b523-4b10-9e36-d3a452668e42'), note: 'Mobile-targeted apple trees for the orchard; no pear.', verified: 'search result' },
      { title: 'DZ Trees - Low Poly Palms', publisher: 'not recorded', url: fab('47188c0c-6a96-4060-9877-fc7c6b833d4f'), note: 'Four LODs with Nanite off.', verified: 'search result' },
    ],
  },
  rocks: {
    brief: 'Scanned northern coastal cliffs, beach boulders and rock formations for the strand, the lighthouse rock, the quarry and scattered stones, in a medium or low quality tier.',
    constraints: `${WEB_TARGET} Megascans 3D assets come in quality tiers; take Mid or Low.`,
    candidates: [
      { title: 'Nordic Coastal Cliff', publisher: 'Quixel Megascans', url: fab('35d695d8-ac00-4ac5-8bba-1d46e973af68'), note: 'With Huge and Massive Nordic Coastal Cliff.', verified: 'search result' },
      { title: 'Nordic Beach Rock Formation', publisher: 'Quixel Megascans', url: fab('56575b1b-45b6-4d86-bc8e-15819cae003c'), note: 'With Nordic Beach Boulder and Nordic Beach Rock.', verified: 'search result' },
    ],
  },
  buildings: {
    brief: 'One modular kit of plain northern European village buildings that can be entered: timber-frame and rubble-stone walls, plaster, plank, thatch or tile roofs, doors, windows and stairs, with interior walls and floors. The mill, the quarry sheds and the watchtower are assembled from it or dressed around it.',
    constraints: `${WEB_TARGET} The game’s buildings are placed from data/unreal/DT_Buildings.json by footprint, wall height and roof kind: a kit of fixed whole houses will not fit those footprints, a modular one will.`,
    candidates: [
      { title: 'Medieval Modular Town (With Interiors)', publisher: 'Jemini Studio', url: fab('432fa0f0-bbc4-411a-b5ac-72ad05b4a4c8'), note: 'Modular timber-frame architecture on stone foundations with working interiors and example props; its version 1.1 is for Unreal Engine 5.1 onwards.', verified: 'search result' },
    ],
  },
  surfaces: {
    appliesTo: 'The Landscape’s eight ground layers. The web build generates its ground textures in code, so no file in this manifest stands for them.',
    brief: 'Tiling ground surfaces for the Landscape’s eight layers: forest floor, heath, earth path, gravel, sand and wet sand; and plaster, timber, rubble stone, slate and thatch only if the building kit does not bring its own.',
    constraints: 'A Landscape material on the mobile renderer is limited in texture samplers: plan the eight layers as few shared texture sets. No scanned surface was found for heath, wet sand or a dirt path.',
    candidates: [
      { title: 'Forest Floor', publisher: 'Quixel Megascans', url: fab('dae56d09-862c-4f77-9e72-a41281c49633'), note: 'With Mossy Forest Floor.', verified: 'search result' },
      { title: 'Gravel on Soil', publisher: 'Quixel Megascans', url: fab('6fe7b621-ea13-4218-b2e4-ec70ddfda3b4'), note: 'With Ground Gravel.', verified: 'search result' },
      { title: 'Nordic Beach Rocky Ground', publisher: 'Quixel Megascans', url: fab('4a6cf0ef-005e-4c42-ac12-18526274658c'), note: 'Coast surfaces.', verified: 'search result' },
    ],
  },
  interiors: {
    brief: 'Plain medieval household furniture and props in one material language: beds and bunks, tables, benches, chairs, shelves, chests, a loom, a workbench, barrels, crates, sacks, pots, a cauldron, bread, candles, and an oven and hearth dressing.',
    constraints: `${WEB_TARGET} Avoid throne-room and high-fantasy pieces; the look is weathered and poor.`,
    candidates: [
      { title: 'Medieval Banquet', publisher: 'Quixel Megascans', url: fab('d422ac6c-ce50-4273-8d4a-2ac594a3a2b2'), note: 'Scanned tableware and a banquet scene; a narrow range of furniture.', verified: 'search result' },
      { title: 'Medieval Props: Kit', publisher: 'not recorded', url: fab('c2946e73-7554-43cd-975c-ff993ada714e'), note: 'A large kit with furniture and kitchen sets; pick the plain pieces.', verified: 'search result' },
      { title: 'Medieval Fantasy Furniture Pack 01', publisher: 'not recorded', url: fab('222da434-25a6-4576-9f1a-1c5e0780df0a'), note: 'Beds, chests, shelves, tables and a bench; no barrels or pots.', verified: 'search result' },
    ],
  },
  characters: {
    brief: 'One modular set of grounded medieval villagers on the engine’s standard skeleton, enough to dress seventeen residents (reeve, steward, foreman, workers, baker, hunter, recorder, warden, caravan master, bandits) and a hero, with LODs; or MetaHumans with medieval clothing for a desktop build.',
    constraints: `${WEB_TARGET} MetaHuman bodies are heavy for the web target. No miller, baker, priest or hero figure was found as such: they come from dressing a modular set.`,
    candidates: [
      { title: 'Modular Medieval Citizens', publisher: 'Assets3D', url: fab('3c45dc48-1b07-4e3c-8d9f-52d194d89d5c'), note: 'Peasants from modular parts on the Epic skeleton; an old listing, check Unreal 5 support.', verified: 'search result' },
      { title: 'Medieval NPC Pack v1', publisher: 'Feyloom', url: fab('e6ff5eb2-f24a-4ee9-8004-fe1a80a496ed'), note: 'Five game-ready villagers on the Unreal 5 skeleton.', verified: 'search result' },
      { title: 'Modular Medieval NPC V2 - Metahuman', publisher: 'Polyphoria', url: fab('4eb02787-c32d-4a10-b36b-bb237cffd738'), note: 'Everyday medieval clothing for MetaHumans; costly, and for desktop.', verified: 'search result' },
    ],
  },
  animation: {
    brief: 'Animation on the standard skeleton for locomotion, work and idling, sitting and lying down, unarmed and sword combat with guard and dodge, the bow, swimming, and mounting and riding.',
    constraints: 'Epic’s Game Animation Sample is reported as licensed for Unreal Engine products only. No bow set and no deer-riding set was confirmed; a horse rider set is the nearest.',
    candidates: [
      { title: 'Game Animation Sample', publisher: 'Epic Games', url: fab('880e319a-a59e-4ed2-b268-b32dac7fa016'), note: 'Motion-matched locomotion and traversal; no combat, swimming, bow or riding.', verified: 'search result' },
      { title: 'Sword Animset Pro', publisher: 'Kubold', url: fab('12783d2f-2bcf-4f3e-9a4a-d554cc3c579a'), note: 'With Fighting Animset Pro for unarmed combat.', verified: 'search result' },
      { title: 'MC Village Life Animation Pack', publisher: 'MoCap Central', url: fab('409592b5-f8f8-4be0-b921-e6e9f3cc63dd'), note: 'Daily-life work, idle and sitting motions for villagers.', verified: 'search result' },
      { title: 'Swim Animset', publisher: 'not recorded', url: fab('a584a2c9-91ea-448f-8476-69f895fda567'), note: 'Swim, float and dive.', verified: 'search result' },
    ],
  },
  animals: {
    brief: 'Rigged, animated animals with LODs and gaits: deer and stag, wolf, bear, boar, lion and tiger, cat and dog; a saddled deer or a mount that can stand in for it; ideally with their calls.',
    constraints: `${WEB_TARGET} No standalone realistic animated tiger was found.`,
    candidates: [
      { title: 'FOREST ANIMALS PACK', publisher: 'PROTOFACTOR INC', url: fab('7097a489-67e6-47f7-a85d-55ad2674277a'), note: 'Bear, boar, stag, fox and wolf with three LODs and 13 to 24 animations each.', verified: 'search result' },
      { title: 'ANIMAL VARIETY PACK', publisher: 'PROTOFACTOR INC', url: fab('2dd7964c-a601-4264-a53d-465dcae1644c'), note: 'Deer (stag and doe), wolf, fox, pig and crow.', verified: 'search result' },
      { title: 'African Animals', publisher: 'JUNNICHI SUKO', url: fab('a8e0d184-2d52-44d7-9e35-a1ae4fa45b1d'), note: 'Includes a lion; animation range not confirmed.', verified: 'search result' },
      { title: 'Cats Pack', publisher: 'RedDeer3D', url: fab('43c831f0-fc9f-499d-8d53-9596047dbb5e'), note: 'Cats with many animations; a Labrador listing covers the dogs.', verified: 'search result' },
    ],
  },
  audio: {
    brief: 'Sound libraries to fill gaps in the game’s own set: nature ambience beds (forest, coast, wind, stream), footsteps by surface, medieval village and work foley, weapon and bow foley, and restrained medieval music.',
    constraints: 'The game’s own clips are balanced against each other; replace single weak clips, not the set. Check that a library’s licence covers game distribution.',
    candidates: [
      { title: 'Wilderness Nature Loops', publisher: 'ESM (Epic Stock Media)', url: fab('1b83c6fa-42f3-4459-9ea7-7c004792e03f'), note: 'Seamless forest, ocean and wind loops.', verified: 'search result' },
      { title: 'Foley: Footsteps Sound Effects Pack', publisher: 'not recorded', url: fab('fa9e8b89-f316-49e0-98e5-5d6e104d2ae6'), note: 'Footsteps on grass, wood, gravel, sand and stone.', verified: 'search result' },
      { title: 'Medieval Fantasy Game Music Pack', publisher: 'Skyhammer Sound', url: fab('1c044e57-086d-4d0b-8538-02f54baaf6fc'), note: 'Medieval and renaissance pieces, some diegetic.', verified: 'search result' },
    ],
  },
};
