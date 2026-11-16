# System mapping: the web build to Unreal Engine

For each system of the web build: where its data and rules live in this repository, what it becomes in Unreal Engine,
and what carries over. Descriptions of Unreal systems in quotation marks are Epic's own words, each checked against
its page on 15 November 2026 ([`sources.json`](sources.json)). The choices in the Unreal columns are this project's
proposals, to test in the port's first phases; none is a measured result.

The size of the task: a world of 580 m × 340 m, 19 buildings (18 with a room), 453 planted trees and shrubs, 12 named
residents, 3 silent ones, 3 hostiles, 19 animals, 20 items, 98 dialogue nodes, 245 spoken lines and one quest.

## The world

| Web build | Data and rules | Unreal (proposal) | Carries over |
| --- | --- | --- | --- |
| **Terrain.** A height field on a 2 m grid, drawn as tiles with a height-blended material. | `core/world/terrain.ts`, `coast.ts`, `layout.ts`; exported as `data/world/terrain-height.png` and `terrain.json`. | **Landscape**, 631 × 379 vertices at 1 m (10 × 6 components of 63 quads), Z scale 100. | The heightmap, imported as is. Stream beds, the spring basin and the mill race are already carved into it. |
| **Ground materials.** Eight layers weighted by height, slope, water, shore, roads and fields. | `core/world/groundLayers.ts`; exported as `terrain-layer-*.png`. | **Landscape layers** with imported weightmaps; one Landscape material. | The eight weight images. The textures are replaced (asset manifest, `surfaces`). The trees' shade on the ground is not in the exported weights. |
| **Roads and paths.** Polylines with widths, worn into the ground weights. | `ROADS`, `ARRIVAL_ROUTE`, `LANTERN_ROUTE` in `layout.ts`; `data/world/layout.json`. | **Landscape splines** for the visible track, on top of the imported `path` layer. | Points and widths. |
| **Sea, streams and the spring pool.** One water model: swell over a solved bed, streams within their banks, a pool; meshes, physics, swimming and sound all sample it. | `core/world/water/`, `STREAMS`, `SPRING_POOL`, `FORD`, `DECKS` in `layout.ts`. | The **Water** plugin: an ocean body at sea level (Z = 0), river bodies along the stream polylines, a lake body for the pool. Epic lists "Water System" and "Single Layer Water" as supported on the mobile renderer. | Sea level, stream paths and widths, the ford and deck positions. The wave model itself is replaced by the plugin's. |
| **Trees.** Planted by rule over stands, clearings, coast and biomes; drawn as instanced models at three levels of detail. | `core/world/flora.ts`, `forest.ts`, `forestStands.ts`, `biomes.ts`, `exclusions.ts`, `plantedForest.ts`; exported as `data/world/flora.json` and `data/unreal/DT_Trees.json`, as the web build plants the forest (the rule told each tree's footprint by its model). | **Instanced foliage.** Epic: painted static meshes are "rendered using hardware instancing". Place instances from `DT_Trees` with an editor utility or a **PCG** graph ("a toolset for creating your own procedural content and tools inside Unreal Engine"); later, re-create the planting rule in PCG if the forest is to be edited in the engine. | Every position, facing, scale, species and trunk radius of the forest as it is played, and the places the rule offers without any tree model, for a port that plants its own trees. The models are replaced. |
| **Grass and ground cover.** Streamed blades and plants placed from the ground's habitat; gusts and a trample field. | `core/world/habitat.ts` (where plants may grow: open ground, moisture, dry patches, shade) and `core/world/forestFloor.ts` (the woodland floor's planting); the blades, plants and their meshes in `presentation/grass/`, `groundcover.ts`, `forestFloor.ts`. | **Landscape Grass Types** driven by the grass and heath layers, or PCG; wind through material world-position offset; trampling through a render-target interaction field and **Niagara**. | The intent, the layer weights and the woodland floor's pieces (`world/placement.json`). The blades are rebuilt. |
| **Rocks and scatter.** Boulders, pebbles, driftwood, reeds, and the weathered rock piles on the shore. | `core/world/scatter.ts` (where every stone, driftwood and scrub lies, and which are obstacles) and `core/world/rockPiles.ts` (which rock piles the shore keeps); the stones' shapes and meshes in `presentation/rockGeometry.ts`, `scatter.ts`, `sourceRockPile.ts`. | Foliage instances or PCG over the rock and sand layers, with scanned rocks. | The placement, in `world/placement.json`: every stone with its kind, size and whether it is an obstacle, the shore's driftwood and scrub, and the rock piles kept. The meshes are rebuilt. |
| **Buildings.** Footprints with wall and roof kinds; the scene builds merged geometry and baked surfaces for each. | `BUILDINGS` in `layout.ts`; `data/unreal/DT_Buildings.json`. | A **modular building kit** assembled per building (as level instances or packed level actors), placed from `DT_Buildings`. | Positions, facing, footprints, wall heights, kinds. The geometry is replaced. |
| **Rooms, furniture and dressing.** Every house can be entered: a room, a hearth, 143 furniture pieces and 525 smaller pieces placed by rule. | `core/world/interiors.ts`, `furniture.ts`, `dressing.ts`, `houseYards.ts`, `homes.ts`; `data/world/interiors.json`. | Placed props inside each building's instance, from `interiors.json` (building-local positions). | Every placement. The models are replaced. |
| **World extent and streaming.** One world, loaded whole; models arrive in stages. | `WORLD` in `layout.ts`. | One level. **World Partition** is, per Epic, "an automatic data management and distance-based level streaming system that provides a complete solution for large world management"; Epic's page lists templates that "use World Partition but have Enable Streaming disabled by default". At 580 m × 340 m, start with streaming off and turn it on if the world grows. | The bounds. |
| **Colliders and navigation.** Circles and boxes with vertical bounds; a walkable grid with A*. | `core/world/colliders.ts`, `nav.ts`, `buildingEntries.ts`. | **Chaos** collision on the meshes themselves; a **navigation mesh** with modifiers for water and doors. | Nothing as data: both follow from the placed meshes. The rules they encode (what blocks, where a door is) are worth reading. |
| **Sky and time of day.** Keyframed sky, sun and moon arcs, fog, cloud cover; one game minute a second. | `core/rules/dayNight.ts` (daylight, sun angle, nightness, what answers the dark) and `core/rules/sky.ts` (the keyed colours and strengths, where the sun and the moon stand, the balance of the light); the dome, clouds and stars in `presentation/sky.ts`. | **Sky Atmosphere**, a directional light, a sky light and exponential height fog, driven by a time-of-day actor. On the mobile renderer Epic lists Sky Atmosphere as supported and Volumetric Clouds as not. | The clock rate, sunrise and sunset, the nightness curve (`tuning.json`, `clock`) and the thresholds for lanterns, music and sleepers; the sky's keys, the light's balance and the sun's and moon's directions (`world/sky.json`). |
| **Wind.** One prevailing wind for grass and trees. | `core/world/wind.ts`. | A wind source feeding foliage materials. | Direction, strengths and speed. |

## The player

| Web build | Data and rules | Unreal (proposal) | Carries over |
| --- | --- | --- | --- |
| **Movement.** Walk, run, guard pace, step height, slopes, jump, fence vault, wading and swimming. | `core/rules/hero.ts`, `heroLocomotion.ts`, and `core/rules/wanderer.ts`, everything he does as one state machine: footing, the fall, the vault, wading and swimming; `tuning.json`, `hero`. `presentation/player.ts` adds the body. | `ACharacter` with the **Character Movement** component (walking, falling and swimming modes); a vault as a root-motion or scripted move. Epic's page on the newer Mover plugin says "Learn to use this Experimental feature, but use caution when shipping with it.": do not build on it yet. | Every number. |
| **Stamina and combat.** Light and heavy blows, dodge with a moment of invulnerability, guard, perfect block and parry, guard break; fists and a blade. | `core/rules/hero.ts` (`staminaStep`, `resolveGuardedHit`, the arms tables), mirrored in `unreal/.../Rules/TervainHeroRules`; `core/rules/wanderer.ts` runs the blow, the guard, the dodge, the flinch and dying, and tells the body what to show. | Two workable shapes: **plain components** on the character calling the mirrored rules, or the **Gameplay Ability System** ("a framework for building attributes, abilities, and interactions that an Actor can own and trigger") with health and stamina as attributes, blows, dodge and block as abilities, and costs and recovery as gameplay effects. | The rules and numbers. See the choice below. |
| **The bow.** Draw, a low ballistic arc through the reticle, arrows that lodge, splash, sink and float. | `core/rules/bow.ts`; ranges and hunting in `core/game/hunting.ts`. | A projectile actor with its own gravity and a sweep each tick; Niagara for the trail and splash. | Speeds, times, limits and the launch formula. |
| **Riding.** The saddled deer: reins with bounded turn and acceleration, gallop stamina, mounting and dismounting, doorways it will not enter. | `core/rules/riding.ts`. | A mount pawn the character attaches to and possesses or drives; the rules mirrored as functions. | Every number and the rules. |
| **Camera.** A follow boom that shortens for obstructions and tree crowns, an over-the-shoulder aim view, a room view, a ride view. | `core/rules/camera.ts`, `cameraObstruction.ts`, `cameraCrowns.ts`. | A **spring arm** and camera component (the arm's collision test replaces the hand-made obstruction), with the aim, room and ride offsets blended. Field of view: see [conventions](conventions.md). | Distances, limits and offsets. |
| **Input.** Keyboard, mouse and gamepad, with rebinding. | Actions in `platform/settings.ts`: move, sprint, jump, interact, skin, grab, throw, attack, heavy, block, dodge, heal, journal, map, inventory, camera, quick save and load, pause. The ten quick slots are the number keys, one per slot, read in `src/app.ts` (`quickSlotPressed`) and not rebindable; a number key bound to an action is that action's alone. | **Enhanced Input** (Epic: "Enhanced Input is enabled by default."): an input action per action above and per quick slot, and mapping contexts for on foot, mounted, aiming and the interface. | The action list and default bindings. |
| **Interaction.** The nearest thing within reach that he faces or looks at, not hidden by scenery, lowest priority first. | `core/rules/interaction.ts` (the ranking) and `core/rules/interactables.ts` (the table: place, reach, priority, prompt, when the state offers each, what it does); `data/game/interactables.json`. | An interaction component that gathers candidates by overlap and ranks them with the mirrored rule; prompts through the interface. | The ranking rule and the whole table. The scene only places moving things and carries out the action. |

### Components or the Gameplay Ability System

The game has one controllable character, a handful of actions and no multiplayer. That argues for plain components and
the mirrored rule functions first: less machinery, and the rules stay line for line comparable with the core's tests.
The Gameplay Ability System earns its weight when abilities multiply (skills, consumable effects, status effects on
hostiles), when effects must stack and expire by tag, or if cooperative play is ever wanted, since it replicates.
Decide at the end of the player phase of the [roadmap](roadmap.md), with the combat feeling right on components. The
numbers are in data either way.

## People, animals and hostiles

| Web build | Data and rules | Unreal (proposal) | Carries over |
| --- | --- | --- | --- |
| **Residents' days.** Each has a schedule of places and activities by hour, overrides by quest state, a home and a bed, indoor work posts. They walk routes, sit on real seats, work with tools, sleep, and wake to a fight. | `core/content/npcs.ts`, `core/rules/schedule.ts`, `resident.ts`, `seat.ts`, `core/world/homes.ts`, and `core/rules/residentWalk.ts`, the resident through the day as one state machine (the way to a place, walking it round whoever is in the way, settling, sitting, bed, the passing remark); `DT_Residents`, `data/game/residents.json`. `presentation/actors.ts` adds the body. | An AI controller per resident running a **StateTree** ("a general-purpose hierarchical state machine that combines the Selectors from behavior trees with States and Transitions from state machines"), choosing its goal with the mirrored schedule rule. Places to work, sit and sleep become **Smart Objects** ("a set of activities in the level that can be used through a reservation system"). | Schedules, anchors, movement numbers, the rule that picks a goal. |
| **Talk.** Passing remarks, exchanges with the wanderer, overheard scenes, his own remarks; a dialogue graph with conditions and effects kept for a conversation interface. | `core/content/voice.ts`, `dialogue.ts`, `core/game/dialogue.ts`, and `core/rules/speech.ts`, who says what and when: the next exchange a resident has, one speaker at a time, scenes overheard once a game day, the hero's remarks and their pauses; `data/game/voice.json` (with the timings and how long each recorded line lasts, `core/content/voiceLengths.ts`), `dialogue.json`. The scene plays the voices. | No built-in dialogue system: a small runtime over the imported graph, with conditions and effects evaluated by the ported game state. Lines as sound waves keyed as in `voice.json`. | The graph, the lines, the conditions. |
| **Hostiles.** Two bandits and a creature: notice, alert, chase, wind-up, strike, recover, stagger, return. | `core/content/enemies.ts`, `core/rules/hostile.ts`, `enemyRoute.ts`, and `core/rules/hostileActor.ts`, the fight as one state machine; `DT_EnemyArchetypes`, `DT_EnemyPosts`. `presentation/actors.ts` adds the body. | A StateTree or behaviour tree per hostile with the same states, deciding with the mirrored functions; perception by the same distance and angle test or the AI perception component. | Archetypes, posts, every number and decision. |
| **Animals.** Nineteen with homes and ranges: rest, graze, wander, watch, call, flee, break out when cornered; herds carry an alarm; predators hold their ground. | `core/content/animals.ts`, `core/rules/animalBehaviour.ts`, `animalNavigation.ts`, and `core/rules/animalMind.ts`, each animal's behaviour and the herd's shared alarm as one state machine; `DT_Animals`, `DT_AnimalSpecies`. `presentation/animals.ts` adds the body. | A StateTree per animal. Nineteen actors need no crowd system. | Roster, each animal's pace (the scene plays the stride to match it), temperaments, how long a gesture lasts, how far a call carries, behaviour numbers, and the behaviour itself, with tests that run a herd without a model. |
| **Hunting.** The draw, the arrow's flight and what it meets, hits by zone, wounds, carcasses, skinning, a hunter's trade and ranks, game that returns after days. | `core/game/hunting.ts` (what lasts), `core/rules/bow.ts` (the bow's numbers) and `core/rules/archery.ts` (the shot: the draw, the aim, the flight in air and water, what it meets, which part was struck, where to stand to skin). The scene answers what a ray meets (`presentation/huntingController.ts`). | Ported game state and commands; the flight as a projectile component or the mirrored function; line traces for what a ray meets. | All of it. |

## State, quest and saving

| Web build | Data and rules | Unreal (proposal) | Carries over |
| --- | --- | --- | --- |
| **World state and commands.** One persistent state; every meaningful change goes through a command, which emits events for the scene. | `core/game/state.ts`, `commands.ts`, `types.ts`, `game.ts`. | A **game-instance subsystem** holding the state as structs, with the commands as functions and events as delegates. This is the heart of the port and the part with the most tests to mirror (`tests/scenarios`). | The state's shape, every command, every scenario test. |
| **The quest.** The Dry Bell: evidence, phases, three parties' consent, an allocation, consequences. | `core/game/` and `core/content/`; `data/game/quest.json`, `inspections.json`. | Part of the same subsystem. | Everything. |
| **A sitting.** What passes while the world runs and is not saved: the clock handed its minutes in halves, the count to the next autosave and whether a new journey may overwrite the last, the pause on a blow, the fall and the waking at the checkpoint, where a loaded wanderer is set down (standing, afloat, or the nearest open ground), places discovered on coming near, getting onto and off the deer, the archive's door, timed work, and which objective is shown. | `core/rules/journey.ts` (the numbers) and `core/rules/session.ts` (when each applies); `src/app.ts` calls them in its loop. | The game mode and player controller call the ported functions; timers as timer handles. | The rules. The order in which the application steps its parts each frame is its own, and a port orders its ticks its own way. |
| **Saving.** A versioned envelope with a checksum in browser storage; autosave every 90 s. | `platform/storage.ts` (where a save is kept, its envelope and checksum); payload `WorldState`; `core/game/revive.ts`, what a save is revived as, field by field. | **Save games**: a `USaveGame` object holding the same state, saved asynchronously. | The payload's fields and the save format version. The envelope is replaced. |
| **Journal, map, hints, inventory.** Derived views of the state. | `core/game/journal.ts`, `map.ts`, `hints.ts`, `inventory.ts`. | Functions over the ported state, shown by widgets. | The rules. |

## Presentation

| Web build | Unreal (proposal) | Notes |
| --- | --- | --- |
| **Figures and animation.** Rigged models with authored clips, code-driven turns, foot placement and finger poses. | Skeletal meshes on the engine's standard skeleton, **animation blueprints**, blend spaces and montages; foot placement with IK. Motion matching is optional. | Replaced with packs (asset manifest). Timings that gameplay depends on (when a blow lands, how long a dodge lasts) are in the core and must drive the montages, not the other way round. |
| **Effects.** Leaf bursts, falling leaves, splashes, spray, hearth fire, smoke, dust, motes. | **Niagara**: per Epic, "Unreal Engine's next-generation VFX system". | Rebuilt. |
| **Sound.** Ambience beds by place, emitters, foley by surface, animal calls, voices, an adaptive score that follows place, time and threat. | Sound waves with attenuation and ambient zones; **MetaSounds** for layered beds and music; a small music director. | The clips are kept (asset manifest). `core/rules/music.ts` is the director (the mood of a place, the threat of a moment, pacing, stings) over the catalogue in `core/content/music.ts`; `core/rules/soundscape.ts` sets every bed's level and place and times the single calls. Tables in `game/sound.json`; `presentation/sound/` plays what they decide. |
| **Lighting and shadows.** One sun with a shadow map, lanterns and hearths as a few real lights, an image-based fill. | A directional light with cascaded shadows, point lights for lanterns and hearths. On desktop, Lumen and Virtual Shadow Maps are available. Epic's table lists neither for the mobile renderer the web target uses, so plan without them there. | See [the web target](web-target.md). |
| **Grade.** An earthy, low-saturation grade and a sharpen pass. | A post-process volume with colour grading. | The look's numbers: `core/content/look.ts`, exported as `data/world/look.json`. The pass that applies them (`presentation/grade.ts`) is the web renderer's own. |
| **Interface.** DOM panels: HUD, hotbar, inventory, journal, map, settings, title menu. | **UMG** widgets, with Common UI for gamepad focus. | The layout and the text (`ST_Tervain.csv`). The title scene (the vigil, the grove) is a set piece to rebuild or retire. |
| **Loading.** Staged downloads with a progress screen. | The engine's packaging and loading screens. | Nothing. |
| **Physics.** Rapier for loose cargo: pushing, lifting, throwing, floating. | **Chaos** rigid bodies; the Water plugin's buoyancy; a physics handle for what is carried. | The cargo table (`DT_LooseCargo`), masses and float lines, and the rules of carrying (`core/rules/cargo.ts`: what can be picked up, where it is held, when it is let fall, how it is thrown). The simulation itself (`physics/physics.ts`) is replaced. |

## Tests

The core's tests are the specification of the rules: `tests/core` (rules, data, export) and `tests/scenarios` (whole
quest and persistence paths, run without a renderer). Mirror them as Unreal **automation tests** as each rule is
ported, starting with the two already mirrored in C++ (`tests/core/rules/hero.test.ts`). A rule is ported when its
mirrored tests pass on the same numbers.

## Still in the scene layer

The scene layer was read end to end on 15 November 2026, after the lifts above, for anything that still decides how
the game plays rather than how it looks or sounds, and what it found has since been lifted: the shot, a sitting's
rules, who speaks when, carrying loose cargo and reviving a save. A second reading found more, and that has been
lifted too: an animal's pace, how long its gestures last and how far its call carries; what a shot frightens and
what cover stops; waking after a fall, entering a journey and saving; who may mount, which fight wakes sleepers and
who calls out at a trespass; and values the scene had typed again instead of reading them from the core.

A third reading found more, and all of it has been lifted or exported: the forest as the web build plants it, who
sees a trespass, the sizes figures are drawn at, the props the core's rules lean on (the benches, the noticeboard, the
kit table, the quarry's boulders and the field fences), which rock piles the shore keeps; values the scene had typed
again (the walk grids' widths, the heal key's item, the health bar's low mark, the night rule in sound and the heights
of shapes no mesh measured); and rules it still decided: which animals graze (`GRAZERS`), a resident's time to stand
(`RESIDENT.standUpSeconds`), the moments the journey saves itself (`autosaveAt`), and what the hero says and which sting
plays as things happen (`eventRemarks`, `warCry`, `defeatRemark`, `eventSting`, `fightWon`).

A fourth reading, of the whole scene layer again, found the last small things, and they have been lifted too: how long
a carcass falls before it may be skinned (`SKINNING.collapseSeconds`), how long each recorded line lasts, which paces
the exchanges and scenes and is now exported (`VOICE_LINE_SECONDS`), what goes on during a blow's hold and a fall
(`WHAT_RUNS`), how loose cargo slides and settles (`CARGO_BODY`), the silent residents' looks and heights, the kit
table's footprint, and three values typed again (the quick-slot count, the arrow's speed, the toll-jumper's size).
Nothing known to decide play is left in the scene layer.

What stays in the scene layer, and why it is not a rule of the game:

- **The order of a step** (`src/app.ts`, `step()`): which part is stepped before which each frame. It is the
  application's wiring; an engine has its own tick groups, and a port orders them its own way. What goes on in each
  moment, while he plays, during a blow's hold, while he lies fallen or while play is paused, is the core's (`WHAT_RUNS`).
- **What a ray meets**: the scene answers where a line strikes an animal's posed skin, a tree, a wall or loose cargo
  (`presentation/animals/hunting/hit.ts`, `physics/physics.ts`). The core decides what that means.
- **The camera's smoothing and its way round obstacles** (`presentation/cameraRig.ts`): feel, built on the core's
  numbers (`core/rules/camera.ts`), and replaced by a spring arm.
- **When a model arrives** (`presentation/residentArrivals.ts`): residents and hostiles wait unseen at their places
  until their models have loaded, a few a frame. That is loading, and an engine loads differently.
- **Where the arrow leaves the bow** (`presentation/playerHunting.ts`): the nocked arrow's place on the posed model.
- **Where the props stand and what they block** (`presentation/settlement.ts`, `hunterSupplies.ts`,
  `forestLandmarks.ts` and a few more): walls, haystacks, the camp fire, the hunter's board and the waymarkers are
  placed with the meshes they belong to, and what each blocks is measured from its mesh or, for a few (the haystacks'
  and the camp fire's footprints), typed beside it. That is level content: a port
  places these props in its level with collision from their meshes, as it does buildings. The props the core's rules
  lean on stand where its layout puts them (`BENCHES`, `NOTICEBOARD`, `KIT_TABLE`, `QUARRY_BOULDERS`, `fieldFenceRuns`),
  and the core names the ones its rules refer to (`PROP_COLLIDER`: the fences the hero vaults, the board, the kit table
  and the first waymarker the interactables see past), with the field fence's thickness the vault measures from. Tests
  fail if the world does not make every prop so named, or stands one of the core's anywhere else.
- **Which device does what** (`platform/input.ts`, `src/app.ts`): while the bow is equipped, drawn or not, a gamepad's
  right trigger draws instead of running, so on a gamepad he cannot sprint, swim fast or gallop with the bow equipped;
  and the quick save and load keys are read only while he plays. That is input mapping, and a choice a port makes again
  in its input contexts; the moves themselves and what they cost are the core's.
- **A body's measured size**: a resident's, a hostile's and an animal's height, and an animal's width, are measured
  from the drawn figure, which is drawn at the size the core gives (`figureScale`, `banditScale`, `ENEMY_FIGURE`; an
  animal's home is sought with `ANIMAL_HOME_MARGIN` round it); so is how far before a seat a resident's body gets down
  onto it, and where a fallen animal's body rests, which the scene measures from its skin over a few frames after its
  fall (`presentation/animals/hunting/corpse.ts`), on a budget it shares between carcasses. The core's rules for routes,
  beds, seats, homes and skinning take the measured body as an input, as they take the ground; a port passes its
  characters' capsules and its physics' resting bodies.
- **When the page is left** (`src/app.ts`): which browser events count as leaving play (the page hidden or closed) is
  the application's wiring; that leaving play saves, and when, is the core's (`autosaveAt`).

What else is there is presentation: meshes, materials and shaders, rigs and poses, effects, the interface, playing
sound, loading, and reading input devices.
