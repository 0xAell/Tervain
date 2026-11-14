# Roadmap for the port

The port in phases. Each phase ends with something that can be checked, and the next does not start until it holds.
The order puts the cheapest proofs first: that the data imports and the units agree, then that the game's feel
survives, then content.

Throughout, the Three.js build in this repository remains the place where design and tuning happen. A change to a rule
or a number is made in `src/core`, tested there, exported with `npm run data:export`, and picked up by the Unreal
project from `data/`. The port never becomes a second place where the game's numbers are typed.

## Phase 0: the seed (this repository)

Done here, without the engine:

- The game's data and rules are in an engine-agnostic core with a boundary CI enforces, and unit tests for its rules.
- The core's data is exported as JSON with schemas, Landscape rasters and DataTable-shaped files in Unreal's units.
- Every asset is listed with its source, licence and a plan.
- A source-only Unreal project mirrors the data types, and two rules as a worked example.
- Each system has a proposed Unreal counterpart ([system mapping](system-mapping.md)).

Not done, and the first thing the next phase does: none of the Unreal code has been compiled, and none of the imports
has been run.

## Phase 1: stand the project up

On a Windows machine with Unreal Engine 5.9 and its C++ toolchain.

1. Build the `TervainEditor` target from `unreal/`. Fix what the compiler finds; keep the fixes in this repository.
2. Import the ten DataTables and the string table. Confirm row counts against `data/unreal/tables.json`.
3. Create the Landscape from the height image and import the eight layers.
4. Check orientation and scale: the heights of the named places in `data/world/terrain.json` must match within a few
   centimetres, the lighthouse must stand in the south-west on its rock, and the sea must lie to the west.
5. Place a default character and walk from the landing to Rillford.

**Holds when:** the editor target compiles from a clean checkout; the tables import without warnings; the check points
match; a walk across the map crosses the same ground as in the web build. Record any change the import needed (for
example a flipped axis) in `data/README.md` and fix it in the export, not by hand in the editor.

## Phase 2: the world in grey

1. Sea, streams and the spring pool with the Water plugin, from the layout's stream paths and sea level.
2. Trees as instanced placeholder meshes from `DT_Trees`, one mesh per species, with trunk collision.
3. Buildings as boxes of the right footprint and height from `DT_Buildings`, with their doors and rooms from
   `data/world/interiors.json`.
4. Time of day: sun arc, sky, fog and lanterns driven by the clock values in `tuning.json`.
5. A first frame-time and memory measurement on the development machine.

**Holds when:** every place of the map is recognisable from the web build with nothing floating or buried; a day
passes in 24 minutes; the measurements are written down with the machine they were taken on.

## Phase 3: the player

1. Movement on the engine's character movement: paces, step height, jump, slopes, swimming and wading, from
   `tuning.json`.
2. The camera: boom, limits, aim view, room view, with the field of view converted.
3. Stamina and combat on plain components, calling the mirrored rules; then the bow.
4. Riding.
5. Mirror each ported rule's unit tests as automation tests. Lift the player's action state machine out of
   `src/presentation/player.ts` into the core first if it helps, so there is one description to port.

**Holds when:** the mirrored tests pass on the same numbers as `tests/core`; a playtest of the same route feels the
same in both builds for walking, running, a fight with each hostile, a hunt and a ride. Decide here between components
and the Gameplay Ability System.

## Phase 4: state, quest and people

1. The world state and its commands as a game-instance subsystem; save and load.
2. Mirror `tests/scenarios`: the quest's paths and the persistence cases.
3. Residents: schedules through StateTree and Smart Objects, walking between anchors, sitting, working, sleeping.
4. Hostiles and animals.
5. Talk: spoken lines, exchanges and overheard scenes; inspections and pickups; journal and map.

**Holds when:** the Dry Bell can be played from the landing to each of its settlements and saved and resumed at every
step, as the scenario tests describe; every resident is where their schedule says at each hour.

## Phase 5: content

1. Choose the packs: trees, rocks and surfaces, buildings and interiors, characters and animation, animals. The asset
   manifest names a first choice for each, with a brief and the other candidates; check each listing's licence, LODs
   and engine version first.
2. Replace the grey stand-ins family by family, keeping the placements.
3. Import the kept sound: voice takes, world clips, music. Rebuild the ambience and the music director.
4. Interface in UMG; effects in Niagara; grass and ground cover.

**Holds when:** no asset marked `replace` in the manifest is still in the build; every asset in the build has a clear
licence for a commercial release; the look matches the art direction in `docs/art`.

Fab content stays out of this repository.

## Phase 6: performance and release shape

1. Budgets per view on the minimum desktop hardware chosen for release: triangles, draw calls, memory, frame time.
2. Quality tiers: a desktop tier that may use Nanite, Virtual Shadow Maps and Lumen, and a compatibility tier that
   does not.
3. Packaging, save locations, controller support and text scale.

**Holds when:** the measured numbers meet the budgets on the minimum hardware with the compatibility tier.

## Phase 7: the web target, if still wanted

Only after Unreal Engine 5.9 is released, not in preview.

1. Build the compatibility tier for the web target and measure it in Chrome: load time, download size, memory against
   the 2 GB ceiling, frame time.
2. Confirm saving works across reloads.
3. Decide hosting. GitHub Pages cannot send custom headers and limits a site to 1 GB.

**Holds when:** a build of the whole game runs in Chrome within memory with saved games that persist. If it does not,
the Three.js build remains the browser version and the Unreal build is desktop only. See [the web target](web-target.md).

## Later: Unreal Engine 6

Epic's stated plan is early access at the end of 2027, with gameplay moving to Verse and Actors and Blueprints
deprecated in time. Nothing needs doing now beyond the habit this repository already has: rules that are small,
tested and free of engine classes, and data in files.

## Work that can be done in this repository meanwhile

Each of these shortens a later phase and can be done on the web build alone:

- Lift the remaining design decisions out of the scene layer ([system mapping](system-mapping.md), last section): the
  interactable list, the player's, residents' and animals' state machines, the music director, the rock and grass
  placement, the sky's keyframes.
- Decide the two open provenance questions in the model ledger and the music's terms before anything is shipped.
- Keep `data/` in step: CI already fails when it is not.
- Finish the tidy-up of the scene layer. Two pieces are built and tested but unused: the prepared Ancient Guardian
  broadleaf (`src/presentation/sourceBroadleaf.ts`; no scene places it) and the Warpkeep asset library hook
  (`src/presentation/assets/library.ts`; its lists of needs are empty). Each is tied into the model ledger and the
  load-budget tests, so removing or using them is a change of its own.
- Consider moving the separate Gothic 3 study to its own repository. It is most of this repository's files and shares
  no code with the game.
