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
 *
 * `beforeShip` states the open question about a family's source or licence terms. A file with such a question (a
 * licence status that begins with "unresolved") is marked `replaceBeforeShip` in the manifest, and its family must be
 * one that is replaced: by the owner's decision of 15 November 2026 nothing with an open question is released.
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

const CHARACTERS_WHY = 'The only candidate that is modular, dresses men and women, and lists current engine versions (5.0 to 5.8), so one set can make seventeen residents and the hero. It is by far the dearest. Modular Medieval Citizens is cheaper but lists versions up to 5.0 only and is rated 3.5. For the web target, the five low-poly villagers of Medieval NPC Pack v1 are light enough.';
const TREES_WHY = 'The exact species of the game’s woods (oak, with birch, pine and spruce in the same series), free. They need Nanite and list 5.7 and 5.8 on Windows only, so the LOD-based Megascans Trees stand in on the web target, with the palm and apple packs for the kinds neither series has.';

/**
 * Groups in matching order: the first whose `match` fits a path owns it. `unreal(path)` names the asset an import of
 * that file would produce, or returns null when nothing is imported from it.
 */
export const GROUPS = [
  {
    id: 'hero', title: 'The wanderer (hero body and animation)', kind: 'model', role: 'hero', match: /^public\/models\/hero\//,
    plan: 'replace', fab: 'characters', pack: 'Modular Medieval NPC V2 - Metahuman', webTarget: 'Medieval NPC Pack v1',
    packWhy: CHARACTERS_WHY,
    why: 'A generated body on a generated rig, with unresolved provenance for two of its sources. A commercial port needs a character with clear terms: a MetaHuman or a modular medieval character from one pack, on the engine’s standard skeleton so animation packs retarget.',
    source: 'Generated with Meshy; see docs/engineering/main-hero.md and the model ledger.',
    beforeShip: 'Where two of its sources came from is not settled: generated for the project, or downloaded from a community listing. The model ledger lists them under toConfirm.',
    unreal: mesh('SkeletalMesh', '/Game/Tervain/Characters/Hero', (base) => `Hero_${pascal(base.replace(/^weathered-wanderer-/, ''))}`),
  },
  {
    id: 'residents', title: 'Residents and hostiles (17 figures)', kind: 'model', role: 'resident', match: /^public\/models\/npcs\/[^/]+\.glb$/,
    plan: 'replace', fab: 'characters', pack: 'Modular Medieval NPC V2 - Metahuman', webTarget: 'Medieval NPC Pack v1',
    packWhy: CHARACTERS_WHY,
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
    packWhy: 'Village work, idling and sitting are most of what residents do, and this set is on the current skeleton and lists engine versions up to 5.8. Locomotion, sword combat and swimming come from the three companions; the swim set lists versions up to 5.4 only.',
    why: 'Generated clips fitted to the generated rigs. Locomotion, work, sitting and combat should come from an animation pack on the standard skeleton.',
    source: 'Meshy animation library output; see docs/engineering/resident-motion-0.0.13.md.',
    licence: { id: 'LicenseRef-meshy-paid-plan-output', status: 'meshy-paid-plan-output' },
    unreal: (path) => (path.endsWith('.glb') ? { type: 'AnimationSequence', folder: '/Game/Tervain/Characters/Residents/Animations', name: `${UNREAL_PREFIX.AnimationSequence}Resident_Library`, lod: null } : null),
  },
  {
    id: 'animals', title: 'Animals (19 rigged models)', kind: 'model', role: 'animal', match: /^public\/models\/animals\//,
    plan: 'replace', fab: 'animals', pack: 'FOREST ANIMALS PACK', with: ['ANIMAL VARIETY PACK', 'African Animals', 'Cats Pack'],
    packWhy: 'It has the deer, wolf, bear, boar and fox of the game’s woods in three levels of detail from one maker. The lion comes from African Animals and the cats from Cats Pack; no tiger and no dog pack was found. It lists engine versions up to 5.4, so migrating it is part of the work.',
    why: 'Community models of mixed quality with in-place clips only. An animal pack supplies matched skeletons, gaits, LODs and often sounds.',
    source: 'Meshy Community downloads, optimised and rigged; see docs/engineering/meshy-animal-assets.json.',
    unreal: mesh('SkeletalMesh', '/Game/Tervain/Animals', (base) => `Animal_${pascal(base)}`),
  },
  {
    id: 'trees-supplied', title: 'Supplied trees (15 kinds, three levels each)', kind: 'model', role: 'tree', match: /^public\/models\/flora\/meshy-012\//,
    plan: 'replace', fab: 'trees', pack: 'Megaplants: English Oak', with: ['DZ Trees - Low Poly Palms'], webTarget: 'European Beech',
    packWhy: TREES_WHY,
    why: 'Generated trees with card crowns rebuilt in code. Scanned tree sets bring real bark, leaf and wind data and proper LODs; the planting (data/world/flora.json) carries over.',
    source: 'Meshy Community downloads, rebuilt by tools/build-meshy-trees.py; see docs/engineering/meshy-tree-assets.json.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Flora/Trees', (base) => `Tree_${treeName(base)}`),
  },
  {
    id: 'trees-generated', title: 'Generated trees (hero oak, birch, apple, pear, bush, sentinel, pine)', kind: 'model', role: 'tree', match: /^public\/models\/flora\/hero\//,
    plan: 'replace', fab: 'trees', pack: 'Megaplants: English Oak', with: ['Apple Tree Pack (Mobile/Desktop)'], webTarget: 'European Beech',
    packWhy: TREES_WHY,
    why: 'The project’s own procedural trees (tools/tree-gen), built for the web build’s triangle budget. They are original and may be kept as a fallback, but a port should use one tree source throughout.',
    source: 'Generated by tools/tree-gen and tools/tree-gen-pine; project-original.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Flora/Trees', (base) => `Tree_${treeName(base)}`),
  },
  {
    id: 'trees-pine', title: 'Solitary pine (three levels)', kind: 'model', role: 'tree', match: /^public\/models\/flora\/solitary-pine/,
    plan: 'replace', fab: 'trees', pack: 'Megaplants: English Oak', webTarget: 'European Beech', packWhy: TREES_WHY, why: 'As the supplied trees: replaced with the conifers of the chosen tree set.',
    source: 'Meshy Community download, adapted; see docs/engineering/solitary-pine.md.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Flora/Trees', (base) => `Tree_${treeName(base)}`),
  },
  {
    id: 'scenery', title: 'Scenery model (rock pile)', kind: 'model', role: 'scenery', match: /^public\/models\/scenery\//,
    plan: 'replace', fab: 'rocks', pack: 'Nordic Beach Rock Formation', with: ['Nordic Coastal Cliff'],
    packWhy: 'A free scanned formation of the northern coast the game’s strand is modelled on, with the cliff piece for the lighthouse rock. Both are single assets: more pieces of the same Nordic series are needed for variety.', why: 'A one-off generated model. Rocks come from the scanned rock sets.',
    source: 'A Meshy Community download, adapted; see docs/engineering/rock-pile-assets.json.',
    unreal: mesh('StaticMesh', '/Game/Tervain/Scenery', (base) => pascal(base.replace(/-under-\d+k$/, ''))),
  },
  {
    id: 'furniture', title: 'Furniture and household pieces (29 models)', kind: 'model', role: 'furniture', match: /^public\/models\/furniture\/[^/]+\.glb$/,
    plan: 'replace', fab: 'interiors', pack: 'Medieval Props: Kit', with: ['Medieval Fantasy Furniture Pack 01'],
    packWhy: 'The widest set in one material language: furniture, kitchen and cellar pieces with collision and two LODs each, listed up to 5.8. The furniture pack adds beds and chests with four LODs.',
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
    packWhy: 'The one modular kit found whose buildings can be entered, with collision and LODs and engine versions up to 5.8. Its timber frame is richer than the game’s poor village: use the plain pieces and its interiors.',
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
    plan: 'replace', fab: 'trees', pack: 'Megaplants: English Oak', webTarget: 'European Beech', packWhy: TREES_WHY, why: 'Leaf cards cut for the web build’s crowns from the supplied trees’ textures. Replaced together with the trees.',
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
    plan: 'replace', fab: 'audio', pack: 'Medieval Fantasy Game Music Pack',
    packWhy: 'The music listing among the candidates: 32 tracks, an hour of music with full pieces, loops and diegetic pieces, so a title theme and quiet loops come from one set under one licence. The menu’s grove is choreographed to the present theme’s timing and is re-timed to the piece chosen.',
    why: 'The title theme the menu’s grove is choreographed to. The terms of the service it was made with are not settled, so it is replaced before anything is released; until then it stands in for length and mood.',
    source: 'Supplied by the project owner; see docs/engineering/menu-score.md and menu-audio-assets.json.', licence: { id: 'LicenseRef-Service-Terms', status: 'unresolved' },
    beforeShip: 'Whether the terms of the service the theme was made with allow a commercial release is not settled.',
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

const WEB_TARGET = 'The Unreal web target uses the mobile renderer, which has no Nanite, Virtual Shadow Maps or Lumen: choose meshes with real LODs and no Nanite requirement. Epic’s mobile guidance is at most 500,000 triangles and 700 draw calls in view.';

/** The day every listing below was opened on Fab. */
const CHECKED = '2026-11-15';
/**
 * A Fab listing as its page gave it on CHECKED: title, publisher, the Unreal Engine versions it lists (null when it has
 * no Unreal Engine format), and the prices of its Personal and Professional licences in US dollars.
 */
const listing = (title, publisher, id, engine, personal, professional, note) => ({
  title, publisher, url: `https://www.fab.com/listings/${id}`, engine, price: { personal, professional, currency: 'USD' }, note, verified: 'listing page', checked: CHECKED,
});

/**
 * What to look for on Fab for each replacement, and the packs found. Every candidate's page was opened on CHECKED:
 * title, publisher, prices and supported engine versions are as the page gave them, and the notes say what its
 * technical details state. Nothing was bought or imported, so what a page does not state (how good the LODs are, how
 * well a pack migrates to a newer engine) is still to be checked. A group's `pack` is the first choice among its
 * category's candidates. Never commit Fab content to this public repository: the Fab Standard License allows sharing
 * only with collaborators, for example in a private one.
 */
export const FAB = {
  trees: {
    brief: 'Temperate northern European trees with bark, leaf and wind data and three or more LODs: oak, birch, hazel or other shrubs, Scots pine, fir or spruce, apple and pear, and a few palms for the warm woodland in the east.',
    constraints: `${WEB_TARGET} Megaplants are the exact species but are listed for Unreal Engine 5.7 and 5.8 on Windows only, with Nanite and no LODs, and are edited in the Procedural Vegetation Editor, which Epic marks experimental; the older Megascans Trees are LOD-based.`,
    candidates: [
      listing('European Beech', 'Quixel Megascans', 'd11cc01d-9422-41b7-950f-416c9ce79caf', '5.1 to 5.6', 0, 0, 'Megascans Trees: 17 meshes with up to nine LODs, impostors and Pivot Painter wind; rated 4.7 by 108. Hornbeam, alder, maple and hazel of the same series were seen in search results, not opened. A northern broadleaf wood without oak or birch.'),
      listing('Megaplants: English Oak', 'Quixel Megaplants', '83642c38-7661-4df1-8629-0422e1898d26', '5.7 to 5.8', 0, 0, 'Procedural vegetation: 14 skeletal meshes, Nanite yes, LODs no, Windows only. Silver Birch, Baltic Pine and Norway Spruce of the same series were seen in search results, not opened. The right species for a desktop build; not for the web target.'),
      listing('Apple Tree Pack (Mobile/Desktop)', 'Next Spring', '1d83287e-b523-4b10-9e36-d3a452668e42', '4.26 to 5.8', 3.99, 3.99, '17 meshes at 2,000 to 3,000 vertices for mobile and 6,500 to 7,500 for desktop; no LODs; no ratings yet. No pear.'),
      listing('DZ Trees - Low Poly Palms', 'DropZone Studios', '47188c0c-6a96-4060-9877-fc7c6b833d4f', '5.1 to 5.8', 59.99, 179.99, 'Made for low-end machines, with LODs; the page says the minimum LODs need adjusting for mobile devices.'),
    ],
  },
  rocks: {
    brief: 'Scanned northern coastal cliffs, beach boulders and rock formations for the strand, the lighthouse rock, the quarry and scattered stones, in a medium or low quality tier.',
    constraints: `${WEB_TARGET} These are single scanned Megascans assets, free, delivered as FBX and glTF in quality tiers, not packs: take the Mid or Low tier and gather the set piece by piece.`,
    candidates: [
      listing('Nordic Coastal Cliff', 'Quixel Megascans', '35d695d8-ac00-4ac5-8bba-1d46e973af68', null, 0, 0, 'One scanned cliff piece, 1.0 × 2.6 × 4.1 m, as FBX and glTF; displacement on the high tier only. Huge and Massive variants were seen in search results, not opened.'),
      listing('Nordic Beach Rock Formation', 'Quixel Megascans', '56575b1b-45b6-4d86-bc8e-15819cae003c', null, 0, 0, 'One scanned formation, 4.2 × 4.2 × 1.3 m, as FBX and glTF. Nordic Beach Boulder and Rock were seen in search results, not opened.'),
    ],
  },
  buildings: {
    brief: 'One modular kit of plain northern European village buildings that can be entered: timber-frame and rubble-stone walls, plaster, plank, thatch or tile roofs, doors, windows and stairs, with interior walls and floors. The mill, the quarry sheds and the watchtower are assembled from it or dressed around it.',
    constraints: `${WEB_TARGET} The game’s buildings are placed from data/unreal/DT_Buildings.json by footprint, wall height and roof kind: a kit of fixed whole houses will not fit those footprints, a modular one will.`,
    candidates: [
      listing('Medieval Modular Town (With Interiors)', 'Jemini Studio', '432fa0f0-bbc4-411a-b5ac-72ad05b4a4c8', '4.21 to 5.8', 119.99, 499.99, '393 static meshes with collision and LODs (generated, some custom), 31 materials with 122 instances, and explorable interiors; rated 4.7 by 18.'),
    ],
  },
  surfaces: {
    appliesTo: 'The Landscape’s eight ground layers. The web build generates its ground textures in code, so no file in this manifest stands for them.',
    brief: 'Tiling ground surfaces for the Landscape’s eight layers: forest floor, heath, earth path, gravel, sand and wet sand; and plaster, timber, rubble stone, slate and thatch only if the building kit does not bring its own.',
    constraints: 'A Landscape material on the mobile renderer is limited in texture samplers: plan the eight layers as few shared texture sets. No scanned surface was found for heath, wet sand or a dirt path.',
    candidates: [
      listing('Forest Floor', 'Quixel Megascans', 'dae56d09-862c-4f77-9e72-a41281c49633', null, 0, 0, 'A scanned 2 × 2 m surface as a texture set. Mossy Forest Floor was seen in search results, not opened.'),
      listing('Gravel on Soil', 'Quixel Megascans', '6fe7b621-ea13-4218-b2e4-ec70ddfda3b4', null, 0, 0, 'A scanned 0.39 × 0.39 m surface as a texture set. Ground Gravel was seen in search results, not opened.'),
      listing('Nordic Beach Rocky Ground', 'Quixel Megascans', '4a6cf0ef-005e-4c42-ac12-18526274658c', null, 0, 0, 'A scanned ground patch, 2.3 × 2.9 m, as FBX and glTF.'),
    ],
  },
  interiors: {
    brief: 'Plain medieval household furniture and props in one material language: beds and bunks, tables, benches, chairs, shelves, chests, a loom, a workbench, barrels, crates, sacks, pots, a cauldron, bread, candles, and an oven and hearth dressing.',
    constraints: `${WEB_TARGET} Avoid throne-room and high-fantasy pieces; the look is weathered and poor.`,
    candidates: [
      listing('Medieval Banquet', 'Quixel Megascans', 'd422ac6c-ce50-4273-8d4a-2ac594a3a2b2', '5.4 to 5.8', 0, 0, '84 scanned meshes with LODs and no collision: tableware and food more than furniture.'),
      listing('Medieval Props: Kit', 'Dragon Motion', 'c2946e73-7554-43cd-975c-ff993ada714e', '4.22 to 5.8', 44.99, 89.99, '266 unique models in six sets (furniture, kitchen, cellar, books and more) with custom collision and two LODs each, about 3,500 triangles at LOD0. Pick the plain pieces.'),
      listing('Medieval Fantasy Furniture Pack 01', 'Bartosz Wozny', '222da434-25a6-4576-9f1a-1c5e0780df0a', '4.10 to 5.6', 9.99, 20.99, '31 low-poly furniture models with three material variants and four LODs each.'),
    ],
  },
  characters: {
    brief: 'One modular set of grounded medieval villagers on the engine’s standard skeleton, enough to dress seventeen residents (reeve, steward, foreman, workers, baker, hunter, recorder, warden, caravan master, bandits) and a hero, with LODs; or MetaHumans with medieval clothing for a desktop build.',
    constraints: `${WEB_TARGET} MetaHuman bodies are heavy for the web target. No miller, baker, priest or hero figure was found as such: they come from dressing a modular set.`,
    candidates: [
      listing('Modular Medieval Citizens', 'Assets3D', '3c45dc48-1b07-4e3c-8d9f-52d194d89d5c', '4.12 to 5.0', 44.99, 89.99, 'One modular peasant with 13 body parts, colour masks and face blend shapes, rigged to the Epic skeleton, with two LODs. Listed for engine versions up to 5.0 only; rated 3.5 by 10.'),
      listing('Medieval NPC Pack v1', 'Feyloom', 'e6ff5eb2-f24a-4ee9-8004-fe1a80a496ed', '5.5 to 5.6', 54.99, 109.99, 'Five fixed villagers of 4,200 to 5,400 vertices on the Unreal Engine 5 skeleton with 101 in-place animations; no LODs.'),
      listing('Modular Medieval NPC V2 - Metahuman', 'Polyphoria', '4eb02787-c32d-4a10-b36b-bb237cffd738', '5.0 to 5.8', 599.99, 1499.99, 'About 130 modular clothing meshes for men and women on the Unreal Engine 5 skeleton, with MetaHuman integration; no animations; rated 4.3 by 8. By far the dearest candidate.'),
    ],
  },
  animation: {
    brief: 'Animation on the standard skeleton for locomotion, work and idling, sitting and lying down, unarmed and sword combat with guard and dodge, the bow, swimming, and mounting and riding.',
    constraints: 'No bow set and no deer-riding set was found; a horse rider set is the nearest. Epic’s Game Animation Sample shows the standard Personal and Professional licences on its page; an earlier report that it is limited to Unreal Engine products was not confirmed there, so read its licence before using it elsewhere.',
    candidates: [
      listing('Game Animation Sample', 'Epic Games', '880e319a-a59e-4ed2-b268-b32dac7fa016', '5.4 to 5.8', 0, 0, 'A complete project with motion-matched locomotion and traversal; rated 4.7 by 358. No combat, swimming, bow or riding.'),
      listing('Sword Animset Pro', 'Kubold', '12783d2f-2bcf-4f3e-9a4a-d554cc3c579a', '4.8 to 5.8', 64.99, 64.99, '178 motion-captured sword animations on the Unreal Engine 4 template skeleton, in place and with root motion; retarget them to the newer skeleton. Fighting Animset Pro for unarmed combat was seen in search results, not opened.'),
      listing('MC Village Life Animation Pack', 'MoCap Central', '409592b5-f8f8-4be0-b921-e6e9f3cc63dd', '5.0 to 5.8', 79.99, 239.99, 'Motion-captured village work, idle and sitting motions on the Unreal Engine 5 mannequin skeleton, in place and with root motion; rated 4.5 by 6.'),
      listing('Swim Animset', 'Filmstorm', 'a584a2c9-91ea-448f-8476-69f895fda567', '4.26 to 5.4', 40.99, 65.99, 'Freestyle, breaststroke at three speeds, floating idles, turns and diving on the Epic skeleton. Listed up to 5.4 only; rated 3.1 by 7.'),
    ],
  },
  animals: {
    brief: 'Rigged, animated animals with LODs and gaits: deer and stag, wolf, bear, boar, lion and tiger, cat and dog; a saddled deer or a mount that can stand in for it; ideally with their calls.',
    constraints: `${WEB_TARGET} No standalone realistic animated tiger was found, and no dog pack was opened.`,
    candidates: [
      listing('FOREST ANIMALS PACK', 'PROTOFACTOR INC', '7097a489-67e6-47f7-a85d-55ad2674277a', '4.15 to 5.4', 49.99, 149.99, 'Bear, boar, doe, stag, fox, rabbit and wolf at about 5,000 vertices, each in three levels of detail with 8 to 24 animations; rated 4.4 by 41. Listed up to 5.4 only.'),
      listing('ANIMAL VARIETY PACK', 'PROTOFACTOR INC', '2dd7964c-a601-4264-a53d-465dcae1644c', '4.15 to 5.5', 0, 0, 'A free assortment from the same maker, 1,200 to 5,700 vertices with 17 to 26 animations each; rated 4.7 by 337. Search results named stag, doe, wolf, fox, pig and crow.'),
      listing('African Animals', 'JUNNICHI SUKO', 'a8e0d184-2d52-44d7-9e35-a1ae4fa45b1d', '4.26 to 5.8', 119.99, 199.99, '21 animals with 1,318 animations, among them a lion with a groomed mane.'),
      listing('Cats Pack', 'Radik Bilalov', '43c831f0-fc9f-499d-8d53-9596047dbb5e', '5.1 to 5.7', 59.99, 179.99, 'Twelve cats (four builds in several coats) with 175 animations; models and animations only, no controllers.'),
    ],
  },
  audio: {
    brief: 'Sound libraries to fill gaps in the game’s own set: nature ambience beds (forest, coast, wind, stream), footsteps by surface, medieval village and work foley, weapon and bow foley, and restrained medieval music.',
    constraints: 'The game’s own clips are balanced against each other; replace single weak clips, not the set. Check that a library’s licence covers game distribution.',
    candidates: [
      listing('Wilderness Nature Loops', 'ESM Team', '1b83c6fa-42f3-4459-9ea7-7c004792e03f', '5.4', 49.99, 49.99, '200 seamless nature loops, 349 minutes, 44.1 kHz 16-bit.'),
      listing('Foley: Footsteps Sound Effects Pack', 'Ovani Sound', 'fa9e8b89-f316-49e0-98e5-5d6e104d2ae6', '4.0 to 5.4', 19.99, 99.99, '324 footstep samples on several surfaces, shod and barefoot, meant to be played at random.'),
      listing('Medieval Fantasy Game Music Pack', 'Skyhammer Sound', '1c044e57-086d-4d0b-8538-02f54baaf6fc', '4.26 to 5.6', 24.99, 49.99, '32 tracks, an hour of music: 14 full pieces, 14 loops and 4 diegetic pieces.'),
    ],
  },
};
