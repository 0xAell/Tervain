# The engine-agnostic core

Everything under `src/core` is the game without a renderer: its data, its rules and its saved state. It runs in plain
Node (the scenario tests play whole quests that way), and it is the part another engine, such as an Unreal Engine port,
imports as data or mirrors as code. The Three.js layer (`src/presentation`, `src/app.ts`), the browser adapters
(`src/platform`) and the Rapier physics binding (`src/physics`) read the core and never the other way round.

| Folder | Holds |
| --- | --- |
| `game/` | Persistent world state, the command vocabulary and its effects, quests, journal, inventory, hunting rules, the save payload. |
| `content/` | Authored definitions: items, residents and their schedules, the animal roster, dialogue, inspections, pickups, spoken lines, display strings, and their validation. |
| `rules/` | Moment-to-moment rules that need no renderer: where a resident should be at an hour, which remarks they may make, the hero's paces, riding, seats, hostile routing, animal habitat and paths, interaction targeting, and what the follow camera keeps clear of. |
| `world/` | The authored geography and what is derived from it: layout, coast, terrain heights, water, biomes, forest stands, buildings and rooms, furniture, colliders, navigation, ground contacts, the prevailing wind. |
| `util/` | Small helpers the core itself needs. |

## The boundary

A file in `src/core` may import only other files in `src/core`. No `three`, no physics engine, no DOM, no Node API, no
package of any kind. Two checks hold the line, and both run in CI:

- `tests/core/boundary.test.ts` reads every import in the core and fails on one that leaves it.
- `npm run typecheck` compiles the core a second time on its own (`tsconfig.core.json`) against the ECMAScript library
  alone. The few host functions the core is allowed (a timer, a clock, `structuredClone`, a warning log, cancellation)
  are declared in `tsconfig.core.host.d.ts`; anything else, such as `document` or `window`, does not compile.

Units are metres, seconds and radians. The ground plane is `x` (east) and `z` (south) with `y` up, right-handed, as in
glTF. Positions in the data are `{ x, z }` on the ground, with heights sampled from the terrain. A yaw of 0 faces `+z`
and the front direction of a yaw is `(sin yaw, cos yaw)` (`world/layout.ts`).
