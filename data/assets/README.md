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

In short: models, building surfaces and leaf atlases are stand-ins and are replaced; the game's own dialogue, sound
and music, and the emblem, are kept and imported from their source files; the browser's packed and re-encoded copies
are dropped.

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

The game's own sound (voices, world sound, animal calls, hunting sounds, music) is kept, not replaced; the `audio`
brief lists libraries to fill gaps.

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
  Y up and right-handed.
- Names are `[Prefix]_[Family]_[Name]` in PascalCase under `/Game/Tervain`. `SM_` (static mesh), `SK_` (skeletal mesh),
  `T_` (texture), `M_`, `MI_`, `AS_` (animation sequence) and `DT_` are Epic's recommended prefixes. `SW_` for sound
  waves and the texture suffixes `_D`, `_N` and `_ORM` are this project's, since Epic's page lists none.
- The near, middle and far files of one tree are `LOD0`, `LOD1` and `LOD2` of one static mesh, not three assets.
