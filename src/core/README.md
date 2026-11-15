# The engine-agnostic core

Everything under `src/core` is the game without a renderer: its data, its rules and its saved state. It runs in plain
Node (the scenario tests play whole quests that way), and it is the part another engine, such as an Unreal Engine port,
imports as data or mirrors as code. The Three.js layer (`src/presentation`, `src/app.ts`), the browser adapters
(`src/platform`) and the Rapier physics binding (`src/physics`) read the core and never the other way round.

| Folder | Holds |
| --- | --- |
| `game/` | Persistent world state, the command vocabulary and its effects, quests, journal, inventory, hunting rules, the save payload. |
| `content/` | Authored definitions: items, residents and their schedules, the hamlet's silent residents, the animal roster, hostile archetypes, dialogue, inspections, pickups, spoken lines, the pieces of the score, display strings, and their validation. |
| `rules/` | Moment-to-moment rules that need no renderer: the hero's actions, stamina, guard, jump, vault and swim; his paces; riding; how residents move, settle, sleep and remark; how animals rest, call, wander and flee; how a hostile notices, chases, strikes and gives up; the bow and its arrows; the day's clock and what answers the dark; saving, falling and returning, threats, witnesses and the drought bell; the follow camera's feel; house doors; where a resident should be at an hour and which remarks they may make; seats; hostile routing; animal habitat and paths; interaction targeting and the table of what can be acted on; what the follow camera keeps clear of; the score's director; what the world sounds like at a place and an hour; the sky's colours through the day and where the sun and the moon stand. |
| `world/` | The authored geography and what is derived from it: layout, coast, terrain heights, water, biomes, forest stands, buildings and rooms, furniture, colliders, navigation, ground contacts, loose cargo, the prevailing wind; where every tree stands, the ground kept clear of planting, what the ground is made of at each point, where plants may grow, where the loose stone lies and what grows on the woodland floor. |
| `export/` | The core's data as plain documents for another engine: the tables under `data/`, their schemas, the terrain as Landscape rasters, and Unreal-shaped tables (`npm run data:export`). |
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
