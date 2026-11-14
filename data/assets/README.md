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

## What to look for on Fab

`fab` in the manifest holds a brief for each kind of replacement (trees, rocks, surfaces, interiors, characters,
animation, animals, audio), its constraints, and candidate listings. A candidate is a listing found to exist, by title,
in search results on 14 November 2026. None was opened, bought or imported from this repository's environment. Check
each on its own page for licence tier, engine version, LODs and price before buying.

Fab content is never committed to this repository. The Fab Standard License allows sharing content with collaborators,
for example in a private repository; this one is public.

## Unreal conventions

`unrealConventions` in the manifest states them, and every `unreal` entry follows them:

- Units are centimetres; Z is up; the frame is left-handed; an asset's forward is `+X`. The glTF sources are metres,
  Y up and right-handed.
- Names are `[Prefix]_[Family]_[Name]` in PascalCase under `/Game/Tervain`. `SM_` (static mesh), `SK_` (skeletal mesh),
  `T_` (texture), `M_`, `MI_`, `AS_` (animation sequence) and `DT_` are Epic's recommended prefixes. `SW_` for sound
  waves and the texture suffixes `_D`, `_N` and `_ORM` are this project's, since Epic's page lists none.
- The near, middle and far files of one tree are `LOD0`, `LOD1` and `LOD2` of one static mesh, not three assets.
