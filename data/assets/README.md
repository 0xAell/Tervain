# Asset manifest

`manifest.json` lists every model, texture, image and sound in the repository's asset folders (`public/` and `assets/`,
without the separate Gothic 3 study). For each file it gives the size, the SHA-256 hash, the source and
licence, the family it belongs to, what an Unreal Engine port does with it, and the Unreal asset an import would
produce. `../schema/assets/manifest.schema.json` is its JSON Schema.

It is written by `npm run assets:manifest` from the files on disk, the model licence ledger
(`public/model-licenses.json`) and the authored families in `tools/asset-manifest/groups.mjs`.
`tests/tools/assetManifest.test.ts` fails in CI when a file is added, changed or removed without regenerating it.

## Plans

Every file carries one of four plans, decided per family (`groups` in the manifest, each with its reason):

| Plan | Meaning |
| --- | --- |
| `replace` | A coherent pack takes its place in the port; the file stands in for scale and intent. |
| `keep` | The game's own; it carries over and is imported from the path given. |
| `rework` | The content carries over but is re-authored for Unreal. |
| `drop` | Only the web build or its tooling needs it (browser encodings, loader manifests, an archive). |

`totals.byPlan` in the manifest counts the files and bytes under each.

Models, building surfaces and leaf atlases have replacements for the port. Keep the Alderweir score, river sounds,
interaction effects, paintings, dialogue and emblem. Each Alderweir cue has one import identity shared by its two
browser encodings. The archived 0.0.x title theme has its own replacement plan below.

## Which pack replaces what

Every family with the plan `replace` names the pack that takes its place, in `replaceWith`: the first-choice Fab
listing with its publisher, address, prices and supported engine versions, the reason for the choice, any companion
packs it needs (`with`), and, where the first choice needs Nanite or is heavy, the pack to use instead on the web
target (`webTarget`). Every file of that family carries the pack's title in its own `replaceWith`.

| Family | First choice | With | On the web target |
| --- | --- | --- | --- |
| The wanderer; residents and hostiles | Modular Medieval NPC V2 - Metahuman (Polyphoria) | | Medieval NPC Pack v1 (Feyloom) |
| Resident motion | MC Village Life Animation Pack (MoCap Central) | Game Animation Sample, Sword Animset Pro, Swim Animset | |
| Animals | FOREST ANIMALS PACK (PROTOFACTOR INC) | ANIMAL VARIETY PACK, African Animals, Cats Pack | |
| Trees and leaf atlases | Megaplants: English Oak (Quixel Megaplants) | DZ Trees - Low Poly Palms; Apple Tree Pack (Mobile/Desktop) | European Beech (Quixel Megascans) |
| Rock pile and landmark scenery | Nordic Beach Rock Formation (Quixel Megascans) | Nordic Coastal Cliff | |
| Furniture and household pieces | Medieval Props: Kit (Dragon Motion) | Medieval Fantasy Furniture Pack 01 | |
| Building surfaces | Medieval Modular Town (With Interiors) (Jemini Studio) | | |
| Archived 0.0.x title music | Medieval Fantasy Game Music Pack (Skyhammer Sound) | | |

The game's own sound (voices, world sound, animal calls, hunting sounds) is kept, not replaced; the `audio` brief
lists libraries to fill gaps.

## Replace before ship

A file with an open question about where it came from or what its terms allow is marked `replaceBeforeShip`, and its
family states the question. By the owner's decision of 15 November 2026 such a file is replaced by the pack its family
names before anything is released, whatever the answer turns out to be, so nothing waits on the question.
`replaceBeforeShip` at the top of the manifest states the rule and `totals.replaceBeforeShip` counts the files.

| Files | The open question | Replaced by |
| --- | --- | --- |
| The hero's two sources, `weathered-wanderer-hero-50k.glb` and `weathered-wanderer-animated-hero.glb` | Whether they were generated for the project or downloaded from a community listing (the model ledger's `toConfirm`) | Modular Medieval NPC V2 - Metahuman (Polyphoria) |
| The archived 0.0.x title theme in its three encodings (`the-sovereigns-oath`) | Whether the terms of the service it was made with allow a commercial release | Medieval Fantasy Game Music Pack (Skyhammer Sound) |

The generator refuses to write a manifest in which a file with an unresolved licence is kept, and
`tests/tools/assetManifest.test.ts` holds the list above. The web build goes on serving these files as it does
today; the marking is about a commercial release.

`fab` in the manifest holds, for each kind of replacement (trees, rocks, buildings, surfaces, interiors, characters,
animation, animals, audio), a brief of what the game needs, its constraints, and the candidate listings the choice
was made from.

**What was checked.** Every candidate's listing page was opened on 15 November 2026. Its title, publisher, the prices
of its Personal and Professional licences and the engine versions it lists are recorded as the page gave them
(`verified: "listing page"`, `checked`), and each note says what the page's technical details state: counts, LODs,
skeleton, ratings. Where a note mentions another listing of the same series, it says that listing was only seen in
search results.

**What was not.** Nothing was bought or imported, so the quality of a pack's LODs, how well a listing made for an
older engine version migrates, and whether a licence fits a commercial release are still to be checked before buying.
Prices change. The choices are first choices from the pages, with their reasons; change them in
`tools/asset-manifest/groups.mjs` when a listing does not hold up.

What the pages showed that matters for the choice:

- The characters' first choice is the only modular set that lists current engine versions, and by far the dearest
  listing here. The cheaper modular set lists versions up to 5.0 only.
- The Megaplants trees list 5.7 and 5.8 on Windows only, with Nanite and no LODs: a desktop choice.
- The forest animals and the swim animations list versions up to 5.4 only.
- The rocks and ground surfaces are single free Megascans assets, not packs.

## Unreal conventions

`unrealConventions` in the manifest states them, and every `unreal` entry follows them:

- Units are centimetres; Z is up; the frame is left-handed; an asset's forward is `+X`. The glTF sources are metres,
  Y up and right-handed. That Unreal's glTF import multiplies positions by 100 and exchanges Y and Z is expected, not
  read on any page: check it on the first import.
- Names are `[Prefix]_[Family]_[Name]` in PascalCase under `/Game/Tervain`. `SM_` (static mesh), `SK_` (skeletal mesh),
  `T_` (texture), `M_`, `MI_`, `AS_` (animation sequence) and `DT_` are Epic's recommended prefixes. `SW_` for sound
  waves and the texture suffixes are this project's, since Epic's page lists none: `_D` base colour, `_N` normal, `_M`
  a packed mask (a leaf atlas's `-data` image: red alpha, green thickness, blue underside gain) and `_ORM` packed
  occlusion, roughness and metallic.
- The near, middle and far files of one tree are `LOD0`, `LOD1` and `LOD2` of one static mesh, not three assets, and
  a file that is a model's only level is its `LOD0`. Imported LOD meshes are named `<Asset>_LOD0`, `_LOD1`, `_LOD2`.
- The web build's loader manifests (sizes, hashes, layouts) are its own: every one is dropped and none becomes an asset.
