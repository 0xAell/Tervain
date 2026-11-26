# Tervain

Tervain is a single-player, isometric pixel-art RPG set in Bellwether Vale. You wake on the Grey Strand beside a shattered boat. Salvage from the beach can earn your first four coin at Joss Merrin’s wagon. Inland, mill hands need grain ground, quarry crews need wages and the shrine keeps the water records. Who gets the stream changes what you hear at the mill and the quarry.

The browser game runs locally with `npm ci` and `npm run dev`. To create a single HTML file that opens offline, run `node tools/pack-isometric.mjs` and open `dist/Play Tervain.html`. Move with WASD or click a destination. E interacts, Space attacks, I opens the inventory, J opens the journal and M opens the map. F5 and F9 save and restore a journey.

The Grey Strand rises into coastal terraces, the woodland roads pass exposed ledges and the quarry has stepped rock faces. The wanderer, wildlife and shadows follow the shape of the land. Rillford’s houses stand on masonry foundations. Inside, stairs connect raised chambers, and window light falls across their floors.

The coast has crossing swells, breaking crests, run-up on the sand and reflections from the wreck and surrounding world. Currents follow the bends of each inland channel and the sluice allocation changes their speed and water level. Rillford’s timber footbridge follows the quarry road across the main channel. Waves break against the coastal rocks, scatter spray and ripple their reflections. River current parts around stones and piers. Floating timber rides the swell and collides with these obstacles. Dropped objects send ripples downstream. Wading scatters nearby trout. Kingfishers and dragonflies fly above planted shallows. Village doorsteps and footpaths meet the local ground. The spring has a separate surface driven by the inlet. The PixelLab art library includes the cast, animation sequences, terrain, structures, items, interface and typeface. The WebGL 2 water renderer shades each logical pixel and writes the local surface displacement into a second texture. That same displacement bends reflected sprites and swimming wakes. Canvas 2D provides a software rendering path. Run `node tools/check-isometric-water.mjs "dist/Play Tervain.html"` to check a standalone build, and append `--canvas` to exercise the software path.

Deepwood thins into glades and meadow, with taller firs in sheltered stands. Trees stand clear of beaches, water, roads, door paths and crop fields. The world map follows the shoreline, relief, roads and tree placements you see in play.

Cloud shadows move inland from the Grey Strand. Dusk brings warm light to the roads, and campfires and lanterns light the ground at night. The wanderer leaves bootprints in sand and earth. Footfalls follow each stride.

Gusts travel inland from the Grey Strand. Grass, crops, reeds and tree canopies bend as the wind passes. The wreck’s sail, the Hegemony standards and the cloth hanging in houses move at their ties.

The Hegemony marks a handful of civic buildings and checkpoints with its gold sword-and-wings crest on plum cloth. The world map shows the principal standards. Loose apples can be found among the Grey Strand wreck provisions and by Rillford’s supply crates.

Gold lanterns mark building entrances, exits and stairs between floors. Click a lantern to walk to it or use the interact key up close. Walk through interior arches to move between rooms. The 22 buildings each have a ground floor, a loft and a cellar. The map shows the current floor indoors. Household chests keep their contents between visits and the journal keeps the books you read.

The wanderer can pet village cats and dogs, take a seat, gather wild herbs and mushrooms, and cook at a campfire or household hearth. Carry trail stew for later or eat at the fire. An equipped bow has a travelling stance, a held draw and a release. Arrows travel through the scene and woodland game can be harvested with a knife.

Lift loose cargo with **G**, turn it with **R** or the mouse wheel, and click a nearby surface to set it down. Press **G** again to let go or use **Space** to toss it. Hold a movement direction into lighter cargo to give it a push. Click routes go around cargo. Heavy benches and tables move when you drag or shove them. Possessions keep their position and rotation when you leave a room or save your journey.

The wanderer and all twelve residents speak their dialogue. Choose a reply to hear the wanderer answer. Reading a book in a house, examining a noticeboard or inspecting something in the field can start narration. Press V to replay or stop an open book, note or conversation. Interface narration is off by default. To hear menus, journal entries, inventory descriptions and nearby prompts, open **Settings → Spoken audio** and select **Characters, world and interface narration**. With this setting, V can also read the current page or your surroundings. Your choice carries over between sessions. Petting the dog still earns an audible reaction. Voice, music and effects have separate controls in Settings. [Music and recording credits](public/world-audio-licenses.html).

The editable PNG sequences, original provider images and typeface are in `assets/pixellab/sources.zip`. The source ledger records frame hashes in `assets/pixellab/provenance.json`. Rebuild the atlas with `python3 tools/pack-vale.py` using Pillow.

## Status

- **Version.** The current patch is [`0.1.27`](docs/production/releases/0.1.27.md) in the Astra 6.2 Ultra `0.1.x` series. The title screen shows the running version. [Version policy](docs/production/versioning.md).
- **Web build.** [Play Bellwether Vale in your browser](https://0xaell.github.io/Tervain/). The [Gothic 3 study](gothic3/) has its own build.
- **Port seed.** Phase 0 of the [roadmap](docs/unreal/roadmap.md) is done: the engine-agnostic core, the exported data, the asset manifest, the porting docs and the C++ skeleton. All of it was prepared without the engine at hand. CI compiles, links and runs the skeleton against stand-ins for the engine's headers, but nothing has been built or imported in Unreal Engine yet. That is the first job of phase 1. A dated [review](docs/unreal/seed-review.md) scores each piece and says what is missing.
- **Assets.** The playable cast, animals, scenery and instruments are built from editable source. [Village, terrain and character comparisons](docs/production/releases/0.1.27.md#gameplay-and-comparisons) · [Score and soundscapes](docs/engineering/bell-road-audio.json).
- **Not started.** A desktop package, and anything to do with a store release.

The road leads from the wreck through the old pines to a caravan camp above Rillford. A bell phrase from the title returns in the shoreline flute, Rillford’s struck wire and the old mill’s homecoming music. [The Bell Road score and soundscapes](docs/engineering/bell-road-audio.json).

## What is in the prototype

Tervain is meant to be a serious RPG about a region that already has people, work, beliefs and disputes, and about earning a place in it. *Gothic 3* is the reference for how it should feel to play. The world, its people and its story are original; the [vision](docs/vision.md) and the [setting](docs/world/setting.md) say what they are meant to be.

The prototype is one small region, 580 m by 340 m: a coast, a wood, a waystation and a village. In it today:

- Walkable household interiors with side rooms, staircases, animated hearths, storage, beds and trade workstations.
- Twelve named residents with a day of their own. They work a trade, sit on benches, talk, go home and sleep.
- Nineteen animals of eight kinds. Thirteen can be hunted with a bow and skinned, including highland wolves and hill boar. The cats, the dogs and the saddled deer are left alone during a hunt. You can pet the village animals and ride the saddled deer.
- Sword and bow against four kinds of hostile. Toll-jumpers pressure the ford, road archers cover the approaches, shield deserters guard the quarry track, and the Thornback holds the Cut.
- Reflective seas, flowing rivers and a spring. You can swim along the coast and wade among trout inland.
- Planted banks, trout shoals, kingfishers and dragonflies.
- A day and a night, adaptive music, footsteps by surface, and captioned speech.
- Inventory, equipment, a ten-slot hotbar, a journal and a map.

The Dry Bell has branching conversations, training, evidence and competing claims on the sluice. The journal follows the evidence from the wreck to the mill. Its field guide points to the next landmark, and the final entry records who receives water after you operate the gate.

<p align="center">
  <img src="docs/media/bell-road/0.1.27-houses.webp" width="100%" alt="Six Rillford interiors with the weaver’s indigo cloth, carpenter’s trestles, herb racks, hides, threshing floor and brewhouse drains.">
  <img src="docs/media/bell-road/0.1.27-native-pixels.webp" width="100%" alt="Four-times pixel details from the village, ford, forest and weaver’s floor in versions 0.1.26 and 0.1.27.">
</p>

## Playing it

The [live build](https://0xaell.github.io/Tervain/) is published from `main` on every merge.

- The game supports keyboard, pointer, controller and touch. WebGL 2 accelerates the river. Touch a destination to walk, drag from Attack to aim a bow, and use Guard or Dodge in a fight.
- Walk with WASD or click a destination. Shift runs, X jumps, C dodges and E interacts. A dodge with no movement input steps away from an engaged opponent. With a bow equipped, hold the right mouse button to aim with the pointer and release to shoot. Hold Space to draw. WASD strafes while the arrow keys aim. A chime and a closed sight mark full focus. A sword can chain a cut, a return and a finishing thrust. J or Tab opens the journal, M opens the map, I opens the inventory and Esc pauses.
- A controller works too. Open Controls on the title screen to review or change key bindings.
- Progress is saved in that browser. F5 saves and F9 loads.

## Run and build locally

You need Node 24, the version CI uses, and git.

```bash
git clone --depth 1 https://github.com/0xAell/Tervain.git
cd Tervain
npm ci
npm run dev
```

The dev server prints its address, `http://127.0.0.1:5173/`; it and `npm run preview` listen on this machine only. The working tree is more than a gigabyte of models, textures, audio and the separate study's data, hence the shallow clone.

To build the static site and serve the result:

```bash
npm run build
npm run preview
```

`npm run build` typechecks, then writes the site to `dist/`.

To check a change:

```bash
npm run check
```

It typechecks the game and the port seed, checks the exported data against the core, runs their tests and checks the commits not yet on the main branch for anything private: what CI runs on a pull request, short of the play gate, the C++ check and the study. `npm run typecheck:game` and `npm run test:game` run the typecheck and the tests alone. `npm run typecheck` and `npm test` add the separate Gothic 3 study and take much longer. After changing the core's data or the shipped assets, regenerate the exports with `npm run data:export` and `npm run assets:manifest`; CI fails when they are stale. `npm run unreal:check` confirms that the C++ skeleton still agrees with the core, and needs a C++ compiler.

`npm run perf:load -- --url http://127.0.0.1:4173/` times each stage of a journey's load in a served build; given a
second `--url`, it alternates between the two and compares their medians. `npm run perf:frame` counts where a frame's
draw calls and triangles go, pass by pass, at the benchmark route's stops. `npm run perf:programs` lists the shader
programs compiled before the first view and finds any compiled inside a draw during play.

## Repository map

| Path | What it is |
| --- | --- |
| [`src/core`](src/core/README.md) | The engine-agnostic core: the game's state, content, rules and world layout in TypeScript, with no renderer, browser or package dependency. CI enforces the boundary. This is the part a port imports or mirrors. |
| [`src/isometric/`](src/isometric/) | The live Bellwether Vale client, entered through `src/main.ts`. It draws the pixel world, houses and combat, presents the journal and inventory, and mixes music, speech and field sound. |
| `src/app.ts`, `src/presentation/` | The earlier Three.js client and its retained regression fixtures. |
| `src/platform/`, `src/physics/` | Browser storage, input adapters and the shared Rapier physics binding. |
| [`gothic3/`](gothic3/) | A separate reconstruction with its own entry point and build checks. |
| [`data/`](data/README.md) | The core's tables exported as JSON with schemas, the terrain as Landscape rasters, and DataTable-shaped files in Unreal's units. Generated, and checked in CI. |
| [`data/assets`](data/assets/README.md) | The asset manifest: every model, texture and sound with its source, its license, and whether a port keeps, replaces or drops it. |
| [`docs/unreal`](docs/unreal/README.md) | The porting docs: how each system maps to Unreal, the conventions, what the engine's web target can do, and a roadmap in phases. |
| [`unreal/`](unreal/README.md) | A source-only Unreal Engine 5.9 C++ skeleton that mirrors the core's data types. No binaries and no content. |
| [`docs/`](docs/README.md) | Everything else: vision, world, design, the decision register, dated engineering records and provenance ledgers. |
| `public/`, `assets/` | The files the web build serves, and the sources they were prepared from. |
| `tools/`, `tests/` | Asset pipelines and checks; unit and scenario tests. |

The [documentation index](docs/README.md) has reading paths by task. The paths of the separate Gothic 3 study are listed in [its own section](#gothic-3-study-and-reconstruction).

## Gothic 3 study and reconstruction

A separate project lives in this repository beside Tervain: a study of Gothic 3 and an incomplete TypeScript browser reconstruction of it, used as reference material for Tervain's look and feel. It shares no code with the game and is not part of the Unreal port.

- **Where it lives.** `src/gothic3` and `src/gothic3local` (code), `tools/gothic3` and `scripts/` (its tools), `tests/gothic3*` (its tests), `assets/gothic3` and `public/gothic3` (its records and prepared data), and the two pages `gothic3/` and `gothic3-local/`. Its documents are the `gothic3-*` pages under `docs/engineering` and the dated studies under `docs/art`.
- **No shared code.** No file of the game imports a file of the study, and none of the study imports the game. Only configuration names both: the site's build, because one site serves them, and the two TypeScript projects that keep them apart. `tests/tooling/gothic3Study.test.ts` fails when that stops being true.
- **Outside the port seed and its checks.** The core, the exported data, the asset manifest and the Unreal project hold nothing of it. `npm run typecheck:gothic3` and `npm run test:gothic3` are the study's; `npm run typecheck:game` and `npm run test:game` are the game's, which are also the seed's. In CI they run in separate jobs.

What it consists of:

- The [Gothic 3 / Ardea reconstruction](https://0xaell.github.io/Tervain/gothic3/) is a new browser implementation guided by the installed game. The Windows executable is not compiled into the site, and decompiled listings are not treated as original source code. Startup and campaign integration are incomplete. See its [scope and controls](docs/engineering/gothic3-browser-port.md).
- The [local-install study viewer](docs/engineering/gothic3-local.md) reads the visitor's own installed files in their browser and hosts no game data. Its page has [screenshots](docs/engineering/gothic3-local.md#screenshots).
- How the rebuilding works: a [short process guide](docs/engineering/gothic3-reconstruction-method.md), an [overview](docs/engineering/gothic3-rebuild-overview.md), a [detailed guide](docs/engineering/gothic3-rebuild-guide.md), a [workflow and repository map](docs/engineering/gothic3-rebuild-workflow.md) and a [checkpoint history](docs/engineering/gothic3-rebuilding-process.md).
- The [Gothic 3 video and Tervain visual audit](docs/art/studies/gothic3-video-2026-10-05/README.md) is a dated study with comparisons.

Neither route grants rights to Gothic 3 material or establishes commercial-release clearance. Gothic 3 is © THQ Nordic GmbH, developed by Piranha Bytes; this project is not affiliated with or endorsed by them.

## License and commercial permissions

**AI-generated media.** Tervain used PixelLab to make the isometric sprites, animations, scenery, title art, interface artwork and typeface. ElevenLabs generated prerecorded character voices, narration, sound effects and ambience. Eleven Music generated three earlier title, riverside and hearthside instrumentals. The Bell Road score and its seven environmental beds are rendered from the project’s original instruments, melodies and noise sources. The game plays its audio locally. Commercial use depends on the provider, the type of asset and, for ElevenLabs, the terms of the plan used for generation. [Commercial terms and provenance](LICENSE-SCOPE.md#ai-generated-game-media) · [Game credits](public/world-audio-licenses.html).

Source-available, not open source. Eligible original Tervain software code is offered under the [PolyForm Noncommercial License 1.0.0](LICENSE), subject to the [exact scope and exceptions](LICENSE-SCOPE.md). **Commercial use of covered code requires separate permission**; [how to ask](LICENSE-SCOPE.md#commercial-permissions) is in the same document.

The license covers code only. Public access does not make the art, music, 3D models, story, branding or other non-code content freely reusable: those keep their own rights and provenance. Dependencies and separately licensed files keep their existing terms; see [NOTICE](NOTICE) and the [third-party notices](public/third-party-notices.txt). The Gothic 3 study and reconstruction material is expressly outside the grant.

For models, see the [3D asset credits and license ledger](docs/engineering/model-licenses.md), also linked from the game's About screen. A confirmed Creative Commons asset keeps its own permitted uses, including commercial ones where its license allows them; the code license does not restrict those rights. Entries with unresolved provenance are marked pending.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE-SCOPE.md](LICENSE-SCOPE.md) before proposing work. Identify authorship and applicable terms for code and assets. Contributions do not transfer copyright or create blanket relicensing permission. A pull request has to pass CI and the [play gate](docs/engineering/play-gate.md).
