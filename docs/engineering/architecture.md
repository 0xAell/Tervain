# Technical architecture

Status: **the engine is chosen.** Tervain's desktop release is built with Unreal Engine, 5.9 first and 6 when it is
released ([A169](../decisions.md)). The browser build in this repository is the prototype, where the design is tried
and tuned, and it keeps deploying to GitHub Pages from `main`. This page describes how the code is divided and the
principles both builds share. How each system maps to Unreal, and the order of the port, are in the
[porting notes](../unreal/README.md). Nothing here has been measured on a reference device.

The owner's platform direction is **PC only** ([A34](../decisions.md)); mobile and touch are not requirements.

## Objective

Support a responsive third-person character, a convincing outdoor scene, a handful of active NPCs, authored encounters,
branching local quests, and reliable persistent state in a packaged single-player application. Keep the cost of
creating the next good location manageable.

## The layers

| Layer | Where | What it may depend on |
| --- | --- | --- |
| The engine-agnostic core | [`src/core`](../../src/core/README.md): state and commands, content, rules, world layout | Nothing outside `src/core`: no renderer, browser, Node API or package. `tests/core/boundary.test.ts` and the core's own typecheck (`tsconfig.core.json`) enforce it. |
| The web client | `src/presentation` (the Three.js scene, interface and sound), `src/app.ts` (the application and its step), `src/platform` (input, storage, settings, diagnostics), `src/physics` (the Rapier binding) | The core, and its own libraries. Never imported by the core. |
| Portable data | [`data/`](../../data/README.md): the core's tables as JSON with schemas, the terrain as Landscape rasters, DataTable-shaped files in Unreal's units | Written by `npm run data:export` from the core; CI fails when it is stale. |
| The asset manifest | [`data/assets`](../../data/assets/README.md) | Written by `npm run assets:manifest` from the files on disk and the licence ledger. |
| The Unreal seed | [`unreal/`](../../unreal/README.md): a source-only C++ project | Reads `data/`; its generated headers come from the same export. `npm run unreal:check` keeps it in step with the core. |

The web prototype's stack is TypeScript with strict type checking, Three.js on WebGL 2, Rapier for loose cargo, Vite
for development and the static build, and Vitest for the tests. None of it carries over to the desktop release except
as a description of what was built: the port carries over the core's data as files and its rules as code to rewrite,
with the core's tests as their specification ([what carries over](../unreal/README.md#what-carries-over-and-what-does-not)).

## Module boundaries

```text
Authored content: locations / NPCs / dialogue / quests / items / encounters
                         |
                 validated definitions
                         |
Input actions -> simulation -> persistent world state -> save adapter
                         |
                 presentation events
                         |
          renderer / animation / audio / interface

Platform adapter: local files / window lifecycle / optional Steam services
Asset catalog: exact revisions / hashes / transforms / runtime variants
```

The renderer displays state. A UI click, animation callback, or loading event should not independently grant an item
or resolve a quest. Simulation commands own meaningful effects and create presentation events. This makes saving and
automated scenario checks possible without a renderer, and it is what lets the rules move to another engine.

In the prototype that layout is:

```text
src/core/content/   authored definitions and their validation
src/core/game/      world state, commands, quests, journal, inventory, hunting, the save payload
src/core/rules/     moment-to-moment rules: the hero, residents, animals, hostiles, the bow, riding, the camera's numbers
src/core/world/     the authored geography and what derives from it: terrain, water, planting, buildings, colliders, navigation
src/core/export/    the core's data written for another engine
src/presentation/   the scene, animation, sound and interface; reads the core and never writes back
src/platform/       browser adapters: input, local saves, settings, diagnostics
src/physics/        the Rapier binding for loose cargo
tests/core/         the rules' unit tests: the specification a port mirrors
tests/scenarios/    whole quest and persistence paths, run without a renderer
```

The scene modules share one contract (`src/presentation/context.ts`): they build from a `BuildContext` and update from
a `FrameContext`, and never touch game state. The [system mapping](../unreal/system-mapping.md) names the core files
and the scene files of every system, and its last section lists what stays in the scene layer and why none of it is a
rule of the game.

Do not create placeholder packages for all possible systems. Start with the few modules the game actually uses;
extract common code only after the boundary is understood.

## Simulation and animation

The world advances in fixed steps of 1/60 s and moving things are drawn between their last two steps
([record](a71-backlog.md)); what runs while play is held, during a blow's hold or while the hero lies fallen is the
core's `WHAT_RUNS`. Avoid allocating transient
objects in heavily repeated update paths; measure before complicated optimization. Clamp recovery from stalls and
handle pause explicitly so backgrounding cannot advance a combat encounter unexpectedly.

Velocity, facing, foot contact, collision, and attack timing must agree, whether movement is driven by root motion or by
code. Store gameplay attack windows in authored definitions and reconcile them with animation events; a missed
animation event must not leave a character invulnerable forever.

The character controller needs reliable walking, running, grounded steps, slope handling, attack, defense, hit
response, interaction, and recoverable falls. A cinematic traversal system is not required. Camera obstruction should
preserve the player's view without clipping through walls or fighting the input.

NPC schedules choose goals such as work, rest, shelter, or a specific quest location. Navigation carries them there.
Quest changes can replace a goal; offscreen residents need only a bounded schedule/state update. Persistent simulation
of every animal or falling leaf is outside the slice.

## Quest and dialogue architecture

The prototype lets the wanderer observe residents rather than open conversation windows: `Game.observeNpc` returns an
authored notice without changing meeting or trust state or applying dialogue effects. Environmental inspection and the
ledger provide nonblocking text with persistent evidence. The dialogue graph and the quest commands are kept, with
their tests, for the conversation interface still to come; their existence is not proof that every
conversation-dependent resolution is reachable in play. See the [prototype guide](prototype.md).

Use stable content identifiers with display text separated for localization. Author conditions, effects, and links as
validated data where useful; reserve scripts for behavior that genuinely needs them. Definitions should identify who
knows a fact, how it was learned, and what local institution can act on it.

Persist facts, one-time rewards, dispositions, and selected outcomes. Re-entering a dialogue node or reloading a scene
must not repeat an economic grant. Apply a resolution's persistent changes together or leave it unresolved;
presentation can recover from saved state after interruption.

Provide a small debug view to inspect facts and jump to authored test conditions. Keep those helpers out of ordinary
player interfaces: in the web build they are offered only on the development server or with `?debug`. See
[quests and consequences](../design/quests-and-consequences.md) for the Dry Bell state model and required recovery
cases.

## Saves and progression continuity

Local saves are a core feature. The web build keeps them in browser storage behind a narrow adapter
(`src/platform/storage.ts`); the desktop release keeps them in the engine's save games. Do not bind game state to one
UI framework, an active server, or a Steam session.

The save envelope:

| Field | Purpose |
| --- | --- |
| `saveFormatVersion` | Controlled migration path; not the same thing as the game version. |
| `gameBuild` / `contentRevision` | Identify which logic and definitions wrote the save. |
| `slotId` / timestamps / play time | Player-facing slot identity and recovery context. |
| `player` | Transform, inventory, skills, vitals, relevant input-independent state. |
| `worldFacts` / `quests` | Chosen outcomes, observed evidence, actor availability, one-time rewards. |
| `npcStates` / `locationChanges` | Necessary persistent differences from the content baseline. |
| `randomState` where needed | Reproducibility of gameplay systems, not every decorative animation. |

Write to a temporary file, validate it, then replace the selected save while retaining a recoverable previous version.
Validate reads, bound sizes, distinguish incompatible/corrupt saves, and give a useful recovery message. Decide safe
saving behavior during combat and multi-step quest effects before exposing manual save everywhere.

Test persistence at dialogue transitions, rewards, travel boundaries, actor death/unavailability, resolution, and
quit/restart. An autosave icon should correspond to a completed write. Cloud saves are an optional later transport for
compatible local saves; define conflict and migration behavior before enabling synchronization.
[Steam Cloud documentation](https://partner.steamgames.com/doc/features/cloud).

## Desktop and Steam boundaries

Bundle the local content required by the supported offline experience. A packaged game should not need a developer
server, GitHub asset download, social login, wallet, or running Warpkeep backend to enter the valley. Packaging, save
locations, controller support and text scale are Phase 6 of the [port's roadmap](../unreal/roadmap.md).

Represent controls as game actions, with keyboard/mouse and controller bindings. Menus, dialogue, inventory, save
selection, and pause all need controller navigation and visible focus. Test hotplugging and switching devices. Steam
Input can be evaluated after the game's own action model works.
[Steam Input developer guide](https://partner.steamgames.com/doc/features/steam_controller/getting_started_for_devs).

Do not promise Steam Deck verification from a controller demo. Actual device resolution, frame pacing, text,
suspend/resume, video playback if any, and startup behavior require their own test record. Windows, Linux, and macOS
packages are separate support commitments.

## Terrain and content authoring

Begin with an authored valley. Terrain-generation research can produce a useful starting shape; designer edits
establish encounter visibility, safe routes, landmarks, and plausible water levels. Rendering, collision, and
navigation should derive from the same approved location source so a pretty riverbank is not an invisible wall. In the
prototype that source is `src/core/world`; the port imports it as a Landscape and tables.

Use chunks and explicit asset lifetime ownership when the game needs them. A full world-streaming service is not a
prerequisite for one valley. Loading a new location should release obsolete geometry, materials, textures, audio, and
navigation state predictably.

The authoring workflow must let us move a path, place an NPC, adjust a quest condition, and rebuild the package without
editing many unrelated systems. Record the time this takes; tooling debt is a production risk as real as GPU cost.

## Performance

Targets are planning hypotheses, not minimum specifications or measured outcomes. Before benchmarking, record a real
development/reference PC and its CPU, GPU, RAM, OS, runtime, and driver. Do not select a marketing minimum spec from
these numbers.

- Desktop hypothesis: 1080p at a stable 60 FPS on an agreed mid-range reference machine; approximately 16.7 ms/frame.
- Initial budget exercise: roughly 6 ms main-thread simulation/presentation work and 10 ms GPU work, measured
  separately because they overlap; do not add the two as a valid frame-time model.
- Report median, 95th/99th percentile frame times, worst transition hitches, process memory, GPU estimates, and a
  repeatable route through the densest view.
- Instrument draw calls, triangles, materials, texture residency, skinned characters, active navigation, shadow
  casters, and foliage overdraw. A low triangle count does not establish fast rendering.
- Test the packaged build with twelve named NPCs scheduled, up to six close actors actively updating at full fidelity,
  and the slice's heaviest foliage/water view. Increase any limit only after measuring it.
- Test a lower quality preset, reduced motion, different camera angles, foreground/background cycles, and repeated
  save/load/location resets. Check memory returns to a stable range.

If the target is missed, first identify the bottleneck. Adjust vegetation layers, shadow range, alpha coverage,
material count, update frequency, or world scope according to evidence. Do not silently replace lush art with empty
terrain and call the original target achieved.

The web build holds its own budget against the live build on every pull request ([the play gate](play-gate.md)); the
port's budgets per view are set on the minimum desktop hardware in Phase 6 of its roadmap.

## Meaningful verification

Tests should exercise invariants: one-time rewards, valid state transitions, save migration, local reputation
propagation, interrupted writes, controller focus, and actor availability recovery. Manual play should cover movement
feel, encounter readability, dialogue understanding, and world reactions. Asset checks should verify the exact shipped
bytes and their geometry/material/animation properties.

## Where the prototype started

The browser prototype began from the stack of Warpkeep, the owner's other project: the inspected Warpkeep revision
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32` declares TypeScript, Three.js, React, Vite, and Vitest dependencies, with
online identity and SpacetimeDB integrations specific to that product. Tervain took the renderer and asset pipeline
without Warpkeep's application or backend ([A10](../decisions.md)); sources are listed in the
[reference ledger](../references.md). The question this page once left open, which engine and desktop runtime should
ship (O04), was answered by A169.
