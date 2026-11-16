# Portable game data

Everything here is written from the engine-agnostic core (`src/core`) by `npm run data:export`. Do not edit these files
by hand: change the core, run the export, and commit both. `tests/core/dataExport.test.ts` fails in CI when a file
here no longer matches what the core produces, and validates each document against its schema.

The web build does not read this folder. It exists so another engine can import the game's data without running
TypeScript: an Unreal Engine project in particular (see `data/unreal`).

## What is here

| Folder | Holds | Units and axes |
| --- | --- | --- |
| `game/` | Items, residents and their schedules, dialogue, inspections, everything the wanderer can act on, the score and the world's sound, spoken lines, display strings, animals and hunting, hostiles, the quest's vocabulary, and tuning values by system. | The core's: metres, seconds, radians. |
| `world/` | The authored layout (bounds, coast, water, roads, places, buildings, anchors), each room's furniture and dressing, where every tree stands, what lies and grows on the ground besides (the woodland floor, the loose stone, the shore's driftwood and scrub and its rock piles), the sky through the day, and the terrain as rasters. | The core's: `x` east, `z` south, `y` up; a yaw of 0 faces `+z`. |
| `schema/` | A JSON Schema (draft 2020-12) for every document in `game/` and `world/`. | |
| `unreal/` | The flat tables again, shaped for Unreal's importers, with positions already in Unreal's units. | Centimetres, degrees; X east, Y south, Z up. |

Every JSON document in `game/` and `world/` starts with `about` (what it holds) and `units`. The DataTables in
`unreal/` are bare arrays of rows, as Unreal's importer reads them, and `unreal/conventions.json` and
`unreal/tables.json` state their units in their text. Numbers are rounded to six decimals. A value that
JSON cannot hold (an animal kind that never returns to its range) is `null`.

## The terrain rasters

`world/terrain-height.png` is a 16-bit greyscale image, 631 × 379 samples one metre apart, covering the 580 m × 340 m
world with a margin on every side. That size is a valid Unreal Landscape: 10 × 6 components of one 63-quad section.
Row 0 is the northern edge and column 0 the western edge. A value of 32768 is sea level and 128 units are one metre, so
the Landscape's default Z scale of 100 reproduces the heights exactly.

`world/terrain-layer-<name>.png` are 8-bit weights for the eight ground materials (grass, heath, earth, gravel, sand,
wet sand, rock, path) on the same grid. They are computed without the trees' shade, which the game adds from its
tree models.

`world/terrain.json` gives the grid's origin, the Landscape's location and scale in Unreal units, and the heights of
named places to check an import against. The import has not been run in Unreal yet: check the
orientation against those points on the first import, and flip the image's rows if the lighthouse lands in the south.

## The trees

`unreal/DT_Trees.json` and `world/flora.json` hold the forest as the web build plants it: the core's planting rule,
told each tree's trunk and crown by the model that draws it. The core keeps that result as content
(`src/core/world/plantedForest.ts`), and `tests/presentation/plantedForest.test.ts` plants it again from the shipped
models and fails if the two part. Each tree has a radius as an obstacle and a larger one where the walk grid keeps clear
of its drawn wood. The stones and the shore's details in `world/placement.json` are laid round these trunks, as in the
game, and so are the weathered rock piles the shore keeps: `src/core/world/rockPiles.ts` leaves out any that would claim
a route, a tree or a stone, and `tests/presentation/sourceRockPile.test.ts` lays them among everything the game builds
first and fails if they part from the export.

`world/flora.json` also lists, as `offered`, the places the rule gives without measuring any tree model, with the
supplied trees' trunk sizes. The drawn models are wider, so the web build keeps fewer of them. A port that brings its
own tree assets plants through the same rule with their footprints.

## The Unreal tables

`unreal/DT_*.json` are arrays of rows, each with a `Name`: the shape Unreal's DataTable editor reads with *Import* and
writes with *Export as JSON*. `unreal/tables.json` lists each file with its row struct and every member's type. The
structs themselves are declared in `unreal/Source/Tervain/Public/Data/TervainRows.h`, which the same export writes, so
a row's fields and its struct's members cannot drift apart. The same export writes `TervainIds.h` beside it: the row
names and the quest's vocabulary as C++ constants. `npm run unreal:check` compares both headers, the tables and the
tuning values the C++ reads with the core, and a CI job runs it on every pull request. `ST_Tervain.csv` is a
string table (`Key,SourceString`). `conventions.json` states the unit and axis conversions used, including the two yaw
conversions: one for assets authored facing Unreal's `+X`, one for meshes imported from glTF.

## Regenerating

```sh
npm run data:export    # write every file
npm run data:check     # write nothing; fail if a file differs
```
