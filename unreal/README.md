# Tervain: Unreal Engine port seed

A minimal Unreal Engine C++ project that mirrors the data types of the game's engine-agnostic core. It is a starting
point for the port, not a playable project: there is no level, no content and no gameplay here yet.

**Status: not compiled.** These files were written without Unreal Engine at hand, so nothing here has been opened in
the editor or built. The first task of the port is to generate project files, build the editor target and fix
whatever the compiler finds. The code keeps to long-standing engine APIs (DataTables, a game-instance subsystem,
developer settings, the JSON reader) to make that step small.

The web build does not depend on anything in this folder, and nothing here is built or deployed by this repository's
CI. The repository holds source and configuration only: no binaries, no `.uasset` or `.umap` files, and no content
from Fab (`.gitignore` here ignores `Content/`).

## What is here

| Path | Holds |
| --- | --- |
| `Tervain.uproject` | The project: one runtime module, `Tervain`, for Unreal Engine 5.9. |
| `Source/Tervain.Target.cs`, `Source/TervainEditor.Target.cs` | Game and editor build targets. |
| `Source/Tervain/Tervain.Build.cs` | The module's dependencies: Core, CoreUObject, Engine, DeveloperSettings, Json. |
| `Source/Tervain/Public/Data/TervainRows.h` | **Generated.** One row struct per DataTable under `data/unreal/`, with the enums and nested structs they use. Written by `npm run data:export` from `src/core/export/unrealTables.ts`; do not edit it. |
| `Source/Tervain/Public/TervainUnits.h` | Conversions between the core's units (metres, radians, x east, y up, z south) and Unreal's (centimetres, degrees, X east, Y south, Z up). |
| `Source/Tervain/Public/TervainSettings.h` | Project settings: where the exported data folder is, and which DataTable asset holds each table. |
| `Source/Tervain/Public/TervainDataSubsystem.h` | A game-instance subsystem that reads `data/game/tuning.json` and finds rows in the imported tables. |
| `Source/Tervain/Public/Rules/TervainHeroRules.h` | Two rules mirrored from the core as a worked example: the stamina meter's step and a blow on a raised guard. |
| `Config/` | Default configuration: the project's name and the data folder. |
| `Content/` | Empty on purpose; see its README. |

## First steps on a machine with Unreal Engine

1. Install Unreal Engine 5.9 with its C++ toolchain. `EngineAssociation` in the `.uproject` is `5.9`; with a source
   build, use *Switch Unreal Engine version* on the `.uproject` instead.
2. Generate project files for `Tervain.uproject` and build the `TervainEditor` target (Development Editor).
3. Open the project. In *Project Settings > Game > Tervain*, check that *Data Directory* finds the repository's `data/`
   folder (the default, `../data`, is right when the project sits in the repository checkout).
4. For each `data/unreal/DT_*.json`, create a DataTable with the row struct named in `data/unreal/tables.json`, import
   the JSON file into it, and point the matching setting at it. Import `data/unreal/ST_Tervain.csv` as a string table.
5. Create a Landscape from `data/world/terrain-height.png` with the location, scale and component layout in
   `data/world/terrain.json`, import the eight layer images, and check the named heights listed there.

`docs/unreal/` in the repository maps each of the game's systems to Unreal's and sets out the port in phases.

## Keeping this folder off a machine

The web build needs nothing here. To leave this folder out of a checkout (for example on a machine used only to test
the web build):

```sh
git sparse-checkout init --no-cone
git sparse-checkout set '/*' '!/unreal/'
```

## Keeping the structs in step

`TervainRows.h` and the JSON tables are generated from the same definitions, and `tests/core/dataExport.test.ts` fails
in the repository's CI when either is out of date. `tests/tools/unrealSkeleton.test.ts` checks that every row has
exactly its struct's members with values of the declared types, that the settings name every table, that every tuning
value the C++ reads exists in `tuning.json`, and that no binary or content file is committed here.

## What is checked without the engine

The two mirrored rules and the unit conversions are plain C++ that needs only a handful of engine names.
`tests/tools/unrealRulesParity.test.ts` compiles them with an ordinary C++ compiler against small stand-ins for those
names (`tests/tools/unreal-standin`) and runs them on a few thousand cases, comparing every result with the
TypeScript rule it mirrors. That shows the logic was carried over correctly. It does not show that the project builds
in Unreal Engine: the reflection markup, the data subsystem and the settings are only compiled by the engine's own
tools.
