# Portable game data

Everything here is written from the engine-agnostic core (`src/core`) by `npm run data:export`. Do not edit these files
by hand: change the core, run the export, and commit both. `tests/core/dataExport.test.ts` fails in CI when a file
here no longer matches what the core produces, and validates each document against its schema.

The web build does not read this folder. It exists so another engine can import the game's data without running
TypeScript: an Unreal Engine project in particular (see `data/unreal`).

## What is here

| Folder | Holds | Units and axes |
| --- | --- | --- |
| `game/` | Items, residents and their schedules, dialogue, inspections, spoken lines, display strings, animals and hunting, hostiles, the quest's vocabulary, and tuning values by system. | The core's: metres, seconds, radians. |
| `world/` | The authored layout (bounds, coast, water, roads, places, buildings, anchors), each room's furniture and dressing, where every tree stands, and the terrain as rasters. | The core's: `x` east, `z` south, `y` up; a yaw of 0 faces `+z`. |
| `schema/` | A JSON Schema (draft 2020-12) for every document in `game/` and `world/`. | |
| `unreal/` | The flat tables again, shaped for Unreal's importers, with positions already in Unreal's units. | Centimetres, degrees; X east, Y south, Z up. |

Every JSON document starts with `about` (what it holds) and `units`. Numbers are rounded to six decimals. A value that
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
named places to check an import against. The import has not been run in Unreal from this environment: check the
orientation against those points on the first import, and flip the image's rows if the lighthouse lands in the south.

## The trees

`world/flora.json` and `unreal/DT_Trees.json` hold the planting as the core's rule produces it on its own: 945 trees
and shrubs. The web build runs the same rule with the measured trunk and crown sizes of its tree models, which changes
which crowded sites are accepted, so its forest differs in detail. For a port that brings its own tree assets, this
model-independent planting is the starting point.

## The Unreal tables

`unreal/DT_*.json` are arrays of rows, each with a `Name`: the shape Unreal's DataTable editor reads with *Import* and
writes with *Export as JSON*. `unreal/tables.json` lists each file with its row struct and every member's type. The
structs themselves are declared in `unreal/Source/Tervain/Public/Data/TervainRows.h`, which the same export writes, so
a row's fields and its struct's members cannot drift apart. `ST_Tervain.csv` is a
string table (`Key,SourceString`). `conventions.json` states the unit and axis conversions used, including the two yaw
conversions: one for assets authored facing Unreal's `+X`, one for meshes imported from glTF.

## Regenerating

```sh
npm run data:export    # write every file
npm run data:check     # write nothing; fail if a file differs
```
