# Tervain: Unreal Engine port seed

A minimal Unreal Engine C++ project that mirrors the data types of the game's engine-agnostic core. It is a starting
point for the port, not a playable project: there is no level, no content and no gameplay here yet.

**Status: not built in Unreal Engine.** These files were written without the engine at hand, so nothing here has been
opened in the editor or built by the engine's tools. The first task of the port is to generate project files, build
the editor target and fix whatever the compiler finds. The code keeps to long-standing engine APIs (DataTables, a
game-instance subsystem, developer settings, the JSON reader) to make that step small. What the repository's own tests
do check, with an ordinary C++ compiler, is set out [below](#what-is-checked-without-the-engine).

The web build does not depend on anything in this folder, and nothing here is built by the engine or deployed by
this repository's CI. One CI job, *Unreal seed*, checks that this folder still agrees with the core
([below](#keeping-this-folder-in-step-with-the-core)). The repository holds source and configuration only: no binaries, no `.uasset` or `.umap` files, and no content
from Fab (`.gitignore` here ignores `Content/`).

## What is here

| Path | Holds |
| --- | --- |
| `Tervain.uproject` | The project: one runtime module, `Tervain`, for Unreal Engine 5.9. |
| `Source/Tervain.Target.cs`, `Source/TervainEditor.Target.cs` | Game and editor build targets. |
| `Source/Tervain/Tervain.Build.cs` | The module's dependencies: Core, CoreUObject, Engine, DeveloperSettings, Json. |
| `Source/Tervain/Public/Data/TervainRows.h` | **Generated.** One row struct per DataTable under `data/unreal/`, with the enums and nested structs they use. Written by `npm run data:export` from `src/core/export/unrealTables.ts`; do not edit it. |
| `Source/Tervain/Public/Data/TervainIds.h` | **Generated.** The core's ids as constants: items, residents, hostiles and their posts, animal species, places, buildings, and the quest's phases, evidence, allocations, gate states, parties, principals and decision makers, with four single values: the save format version, the content revision, the number of quick slots and the pickup that gives the first weapon. Written by the same export from `src/core/export/unrealIds.ts`; do not edit it. Name an id through it (`FName(TervainIds::Item::Bread)`) so that an id the core renames stops the build instead of failing to find a row. |
| `Source/Tervain/Public/TervainUnits.h` | Conversions between the core's units (metres, radians, x east, y up, z south) and Unreal's (centimetres, degrees, X east, Y south, Z up). |
| `Source/Tervain/Public/TervainSettings.h` | Project settings: where the exported data folder is, and which DataTable asset holds each table. |
| `Source/Tervain/Public/TervainDataSubsystem.h` | A game-instance subsystem that reads `data/game/tuning.json`, loads the tables the settings name when it starts and holds them for its lifetime, and finds rows in them. |
| `Source/Tervain/Public/Rules/TervainHeroRules.h` | Three of the wanderer's rules mirrored from the core as a worked example: the stamina meter's step, a blow on a raised guard, and the pace kept wading. |
| `Source/Tervain/Public/Rules/TervainBowRules.h` | A fourth: the bow's launch, the low arc that carries an arrow through its target. |
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
   The data subsystem loads the tables when a game starts, so a setting changed during play takes effect at the next.
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

## Keeping this folder in step with the core

The core (`src/core`) is the source, and this folder mirrors it. `npm run unreal:check` fails when the two stop
agreeing, and the CI job *Unreal seed* (`.github/workflows/unreal-seed.yml`) runs it on every pull request and on
`main`. It checks:

- **Generated files.** `data/`, `TervainRows.h` and `TervainIds.h` are exactly what the core's export writes today
  (`npm run data:export` rewrites them; `tests/core/dataExport.test.ts` makes the same comparison in the test run).
- **Ids.** `tests/tools/unrealDrift.test.ts` takes the ids from the core's own modules and compares them with
  `TervainIds.h`: every group, every id, the constant's name, the order, and the four single values (the save format
  version, the content revision, the number of quick slots and the first weapon's pickup). It compiles the header and compares the values the C++ holds. Entity groups must equal the row names of
  the table they point at. The test also alters copies of the header (an id renamed, removed, added, reordered, a
  stale version) and requires each to be reported.
- **Tables.** `tests/tools/unrealSkeleton.test.ts` checks that every row has exactly its struct's members with values
  of the declared types, that the settings name every table, and that no binary or content file is committed here.
- **Tuning.** Every member of the four tuning structs is filled from a number that exists in `data/game/tuning.json`,
  each from its own path, and the stamina, guard and bow keys the C++ does not read are listed in the test, so a key
  added to the core is noticed; every wade key is read. `TervainUnits.h` uses the factor the exported tables were converted
  with.
- **Rules and build.** The two tests described [above](#what-is-checked-without-the-engine).

After changing ids, tables or tuning in the core: `npm run data:export`, then `npm run unreal:check`.

## What is checked without the engine

Unreal Engine is not available where this repository's tests run, so two tests stand in for a build as far as they
can. Both use an ordinary C++ compiler and small stand-ins for the engine names the seed uses
(`tests/tools/unreal-standin`):

- `tests/tools/unrealSeedBuild.test.ts` compiles **every source file of the module** with warnings as errors, links
  them, and runs the result against the repository's exported data. The data subsystem must read every number in
  `data/game/tuning.json` to the value in the file, give the default for a path that names no number, and
  log a warning when the data folder is not where the settings point. The settings must find `data/` beside the
  project, and a row must be found by name in the table the settings name. Every generated row struct is made.
- `tests/tools/unrealRulesParity.test.ts` runs the four mirrored rules and the unit conversions on a few thousand
  cases and compares every result with the TypeScript rule it mirrors.

That shows the seed's C++ is well-formed and consistent with itself, and that its logic gives the right answers on
the real data. It does **not** show that the project builds in Unreal Engine.

### How far the engine's public record supports it

Epic's engine source is not public, so the stand-ins could not be written from the engine's headers. Instead, every
engine name the seed and the stand-ins use is entered in a register,
[`docs/unreal/engine-symbols.json`](../docs/unreal/engine-symbols.json), with the page of Epic's documentation it was
checked against and the passage that supports it (for the one rule of the C++ language it relies on, the C++20 working
draft, the standard Epic says the engine builds with). [The page made from it](../docs/unreal/engine-symbols.md) lists
them all, and first the ones the public record does not settle.

- Of 200 names, 190 are confirmed by a quoted passage, 8 are documented in part, one could not be found, and one, the
  game module macro, is shown with a different argument list on the only page that shows it, a page that reads as
  dated. Each of the ten says what is missing; none can be settled from public pages, only by a build.
- The check corrected the stand-ins in four places where they did not behave as the engine is documented to (a JSON
  field name is a string view, names compare without regard to case, a default-constructed vector is not zeroed, and
  a relative path is resolved against the process's base directory), and the seed in five (it calls the rounding
  function whose rounding is documented, names the JSON reader's character type, includes the documented header of
  every engine name it uses instead of relying on what another header brings in, passes every argument of the file,
  JSON and asset loading calls because the reference prints no default values, and declares its log category in the
  form Epic's logging guide gives).
- The stand-ins' character type is wide, as Epic documents TCHAR, so a narrow string passed where the engine wants
  TCHARs does not compile here.
- The stand-ins are stricter than the engine about includes: `CoreMinimal.h` gives only the primitive types and the
  reflection markup, so a source file that forgets a header does not compile here.
- `npm run unreal:symbols` fails when the seed or a stand-in uses an engine name that is not entered, and
  `npm run unreal:symbols -- --online` opens every cited page again and looks for each passage. `npm run unreal:check`
  includes the first.

What this cannot reach: the reflection markup (`UCLASS`, `USTRUCT`, `UPROPERTY`, the `.generated.h` headers), the
build files (`.Build.cs`, `.Target.cs`) and the `.uproject` are read only by the engine's own tools; the reference
documents no macros; and the seed targets Unreal Engine 5.9, whose API reference was
not published when this was checked, so the 5.8 reference was read. The first build on a machine with the engine is
still the first real test.
