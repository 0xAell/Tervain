# Conventions for the port

How values, names and files cross from the web build to Unreal Engine. Statements marked **Epic** are quoted from
Epic's documentation, and each was checked against the page itself on 15 November 2026: [`sources.json`](sources.json)
lists the pages and passages, and `npm run docs:sources` checks them again. The rest are this project's choices, to be
tested on the first import.

## Units and axes

| | Core and glTF sources | Unreal |
| --- | --- | --- |
| Length | metres | centimetres |
| Angle | radians | degrees |
| Up | `+y` | `+Z` |
| Ground plane | `x` east, `z` south | `X` east, `Y` south |
| Handedness | right-handed | left-handed |
| A yaw of 0 faces | `+z` (south); front = `(sin yaw, cos yaw)` | `+X` (east); positive yaw turns towards `+Y` |

**Epic:** "In the Unreal Editor the coordinate system is left-handed and uses a Z-up axis." Positive X is forward,
positive Y is to the right and positive Z is up. Distance defaults to centimetres.

The conversions, used by the export for everything under `data/unreal` and provided in C++ by
`unreal/Source/Tervain/Public/TervainUnits.h`:

- **Position:** Unreal `(X, Y, Z)` = core `(x, z, y) × 100`. This is the same exchange of the up and south axes that
  an import of a glTF model makes, so imported models and imported positions agree.
- **Yaw, for an asset authored facing Unreal's forward (`+X`):** `UnrealYaw = 90 − coreYaw × 180/π`.
- **Yaw, for a mesh imported from glTF**, whose front (`+z`) arrives as `+Y`: `UnrealYaw = −coreYaw × 180/π`.
- **Scale:** uniform scales carry over unchanged.

None of the pages read for this document names a default north. Here east is `+X` and south is `+Y`, so north is `−Y`. Set a
SunSky actor's north offset to match rather than rotating the world.

### Field of view

The web build's camera uses a **vertical** field of view of 60° (`CAMERA.fov` in `src/core/rules/camera.ts`). Unreal's
camera field of view is horizontal. At 16:9, 60° vertical is about 91.5° horizontal:
`horizontal = 2 · atan(tan(vertical / 2) · aspect)`. Set the camera's aspect-ratio axis constraint so the vertical view
is the one kept when the window's shape changes, or the view will tighten on wide screens.

## Importing the data

All of it is under [`data/`](../../data/README.md). None of these imports has been run from this repository.

**DataTables.** Each `data/unreal/DT_*.json` is an array of rows with a `Name`. **Epic:** a row container "must
inherit from `FTableRowBase` to be recognized by the importer", and the import key "uses Name for `.JSON`". The row
structs are in `unreal/Source/Tervain/Public/Data/TervainRows.h`, generated from the same definitions as the files;
`data/unreal/tables.json` pairs each file with its struct. The row names C++ may need to spell out (items, residents,
hostiles, places, buildings) and the quest's vocabulary are constants in
`unreal/Source/Tervain/Public/Data/TervainIds.h`, written by the same export; `npm run unreal:check` fails when
either header and the core disagree.

**Strings.** `data/unreal/ST_Tervain.csv` is a string table. **Epic:** "The CSV format used for string tables has two
mandatory columns, Key and SourceString", and "CSV string tables aren't staged automatically": add it to the
packaging settings when the game is first packaged.

**The Landscape.** `data/world/terrain-height.png` is 631 × 379 samples, one metre apart.

- **Epic:** "you could have any Landscape of AxB Components with a total size in vertices of (A63+1 , B63+1)." Ten by
  six components of 63 quads give 631 × 379.
- **Epic:** "Unreal Engine calculates your heightmap's height by using values between -256 and 255.992, stored with
  16-bit precision", so "at the default Z scale value of 100, your height values will be between 256 m and -256 m."
  The image stores sea level as 32768 and 128 units to the metre, so a Z scale of 100 reproduces the terrain. Its
  heights run from −22 m to +36.3 m.
- **Epic:** heightmaps import as "16-bit grayscale PNG". The eight `terrain-layer-*.png` files are 8-bit greyscale
  images at the Landscape's resolution, one per layer. Epic's current pages do not state the format a layer image must
  have, so that they import as they are is an assumption to confirm on the first import.
- Location and scale are in `data/world/terrain.json`: location `(−40500, −18900, 0)` cm, scale `(100, 100, 100)`.
- Row 0 of the image is the northern edge. Whether Unreal lays image rows along `+Y` as expected is to be confirmed on
  the first import: check the heights of the named places in `terrain.json`. The importer has a *Flip Y Axis* option.

**Everything else** (`data/game`, `data/world/*.json`) is canonical JSON in core units with a schema each. The
dialogue graph, the quest vocabulary, inspections, voice lines and tuning values have no built-in Unreal importer:
read them at runtime as `UTervainDataSubsystem` reads `tuning.json`, or write an editor importer into data assets.

## Naming

**Epic's** pattern is `[AssetTypePrefix]_[AssetName]_[Descriptor]_[OptionalVariantLetterOrNumber]`. The port uses it
as `[Prefix]_[Family]_[Name]` in PascalCase under `/Game/Tervain`.

| Asset | Prefix | Source |
| --- | --- | --- |
| Static mesh | `SM_` | Epic |
| Skeletal mesh | `SK_` | Epic |
| Skeleton, physics asset | `SKEL_`, `PHYS_` | Epic |
| Texture | `T_` | Epic |
| Material, material instance | `M_`, `MI_` | Epic |
| Animation sequence, montage, blend space, animation blueprint | `AS_`, `AM_`, `BS_`, `ABP_` | Epic |
| Blueprint, widget blueprint | `BP_`, `WBP_` | Epic |
| Data table, curve table | `DT_`, `CT_` | Epic |
| Niagara system, emitter | `FXS_`, `FXE_` | Epic |
| Enum, structure (Blueprint assets) | `E_`, `F_` | Epic |
| Sound wave | `SW_` | this project (Epic's page lists none for sounds) |
| Texture suffixes: base colour, normal, packed occlusion-roughness-metallic | `_D`, `_N`, `_ORM` | this project (Epic gives the descriptor slot but no list) |

C++ types follow the engine's own prefixes: `F` for structs, `E` for enums, `U` and `A` for object and actor classes,
`b` for booleans. Everything of this project is prefixed `Tervain`: `FTervainItemRow`, `ETervainActivity`,
`UTervainDataSubsystem`.

Suggested folders under `/Game/Tervain`: `Architecture`, `Animals`, `Audio` (`Voice`, `World`, `Music`, `Animals`,
`Hunting`), `Characters` (`Hero`, `Residents`), `Data`, `Flora` (`Trees`, `Grass`), `Maps`, `Props`, `Scenery`, `UI`,
`VFX`. The asset manifest gives the folder and name for every file that is imported.

## Levels of detail

The web build ships three files per tree (near, middle, far). In Unreal they are `LOD0`, `LOD1` and `LOD2` of **one**
static mesh, never three assets; the manifest records the level for each file. Models bought to replace them bring
their own LODs.

The web target uses the mobile renderer, which has no Nanite (see [the web target](web-target.md)). Anything meant to
run there needs real LODs: do not rely on a Nanite mesh's fallback.

Triangle budgets the web build holds, as a starting point: 20,000 for a tree, 50,000 for a resident or animal,
150,000 for the hero. They are far above Epic's mobile guidance and come down for a web target.

## Keeping content out of this repository

`unreal/Content` is ignored by git. Unreal content, and above all anything from Fab, is kept in the port's own storage.
Fab's summary of its Standard License lets a buyer "Share the asset (directly, via a private repository or in the
Project) with your collaborators that are working on the Project with you" and not "Resell or redistribute the asset
for free on a standalone basis or allow others to do the same". This repository is public, so nothing from Fab goes
into it.
