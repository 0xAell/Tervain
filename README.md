# Tervain

**A serious single-player high-fantasy RPG for PC, being developed toward a Steam release.**

Explore a rugged coast, woodland roads and inhabited settlements in an original world of old orders, independent peoples and obligations older than its rulers. A Templar-inspired order affiliated with the Hegemony anchors the setting. Regional loyalties, dangerous travel and the freedom to find your own place guide the design.

*Gothic 3* and *Hyperion* are creative inspirations. Tervain's characters, geography, stories and visual identity are original; reference material is separate from the original game.

## License and commercial permissions

Eligible original Tervain software code is offered under the [PolyForm Noncommercial License 1.0.0](LICENSE), subject to the [exact scope and exceptions](LICENSE-SCOPE.md). **Commercial use of covered code requires separate permission.** Contact [ael.dev@proton.me](mailto:ael.dev@proton.me) for permission requests.

This is a source-available project. Public access does not make its art, music, 3D models, story, branding or other non-code content freely reusable. Those materials retain their own rights and provenance. Dependencies and separately licensed files keep their existing terms; see [NOTICE](NOTICE) and [third-party notices](public/third-party-notices.txt). Gothic 3 study and reconstruction material is expressly outside this grant.

For models, see the [3D asset credits and license ledger](docs/engineering/model-licenses.md), also linked from the game's About screen. A confirmed Creative Commons asset retains its own permitted uses, including commercial uses where its license allows them; the code license does not restrict those rights. Model entries with unresolved provenance are explicitly marked pending.

## Status

Tervain is a **browser prototype** in the `0.0.x` stage (`package.json` holds the version; the title screen shows it and F3 shows the source revision). It is the test bed where the world, the rules and the feel of the game are worked out, and it stays in that stage until its [quality gate](docs/production/versioning.md) is met. The destination is a desktop release built in Unreal Engine; this repository is arranged so that the game's data and rules carry over ([porting to Unreal Engine](#porting-to-unreal-engine)). A desktop package and Steam integration are not yet available.

**[Launch Tervain](https://ael-dev3.github.io/Tervain/)** — Published from `main` through the normal GitHub Pages workflow. Use a desktop WebGL browser; save data is stored in that browser. The title shows the version and F3 shows the source revision.

The prototype includes:

- A sparse coastal arrival, a continuous woodland journey and inland settlements.
- The animated Wanderer, 17 adapted Meshy NPC roles and diverse supplied-tree habitats, with protected custom Pine geometry.
- Residents on full-body rigs of their own, moving with authored motion: walks matched to the ground they cover,
  idles and conversation, sitting down on real benches and getting up, a working motion for every trade with tools in
  hand, and fights; skirts and capes that hold together in motion, and skin, cloth, leather and steel that shade as
  what they are.
- Rougher terrain, rooted vegetation and grounded scenery; every building can be walked into, through a door that swings
  open, to furnished rooms with a fire in the hearth.
- Weathered, high-resolution surfaces: rubble in dirty mortar, peeling damp-stained render, split boards, sooted tiles and
  mossy thatch, under matte materials and an earthy grade.
- One physical water system: a refracting, breaking sea with surf and swash, streams within their banks, a spring
  and its pool; floating cargo, wading, an authored breaststroke and a view under the surface.
- Lush blade-by-blade meadows that gusts sweep across and that the hero, residents, animals and cargo push through,
  leaving trails that slowly close.
- Woods that move in the same wind: trunks lean and sway, branches swing and leaves flutter and glow against the
  light; ferns part around the hero and a struck tree shakes and drops a few leaves.
- Nineteen supplied, optimized and rigged animals across settlement, forest and warm-woodland habitats.
- Bow hunting, grounded carcasses and saved skinning rewards for thirteen wild animals; cats, dogs and the saddled trail mount remain protected. Rowan Vale welcomes you at a solid woodland supply table with an offline Eleven v4 voice.
- Adaptive world music, surface footsteps, item/combat/work sounds, wildlife and captioned resident speech.
- World pickups, inventory, equipment, an initially empty ten-slot item hotbar, journal and map.
- Physical movable supplies, saved progress and keyboard/mouse or controller controls.
- A Templar vigil menu with The Sovereign's Oath, distant ships, a score-led spirit grove and a backlit heath that the sea wind, a grazing stag and your pointer move through.

See the [prototype guide](docs/engineering/prototype.md) for controls and boundaries. What changed in each version is in the [decision register](docs/decisions.md) and the dated [engineering records](docs/README.md#engineering); release records up to `0.0.18` are under [docs/production/releases](docs/production/releases).

## Repository layout

| Path | What it is |
| --- | --- |
| [`src/core`](src/core/README.md) | The game's data and rules with no renderer, browser or package dependency: state and commands, quests and dialogue, residents, hostiles, animals, the hero's rules, the world's layout, terrain, water and planting. CI enforces the boundary. |
| `src/presentation`, `src/app.ts` | The Three.js scene, interface and sound of the browser build. |
| `src/platform`, `src/physics` | Browser adapters (input, storage, settings) and the Rapier physics binding. |
| [`data/`](data/README.md) | The core's tables exported as JSON with schemas, the terrain as Landscape rasters, DataTable-shaped files in Unreal's units, and the [asset manifest](data/assets/README.md). Generated; CI fails when it is stale. |
| [`unreal/`](unreal/README.md) | A source-only Unreal Engine C++ project seed mirroring the data types. No binaries and no content. |
| [`docs/`](docs/README.md) | Design, decisions, engineering records, provenance ledgers and the [porting notes](docs/unreal/README.md). |
| `public/`, `assets/` | The files the browser build serves, and source archives they were prepared from. |
| `tools/`, `tests/` | Asset pipelines, checks and the play gate; unit and scenario tests. |
| `src/gothic3*`, `assets/gothic3`, `public/gothic3`, `tools/gothic3`, `tests/gothic3*`, `scripts/` | The separate [Gothic 3 study and reconstruction](#gothic-3-study-and-reconstruction). Not part of Tervain or of the port. |

## Porting to Unreal Engine

The browser prototype is the test bed for a later Unreal Engine version of the game. The repository is arranged so the
game's data and rules can be carried across:

- [The engine-agnostic core](src/core/README.md): data and rules with no renderer or browser dependency, enforced in CI.
- [Portable data](data/README.md): the core's tables as JSON with schemas, the terrain as Landscape rasters, and
  tables shaped for Unreal's importers.
- [The asset manifest](data/assets/README.md): every model, texture and sound with its source, licence and a plan.
- [The Unreal project seed](unreal/README.md): a source-only C++ project mirroring the data types. Not yet compiled.
- [Porting notes](docs/unreal/README.md): how each system maps to Unreal, conventions, the engine's web target and a
  phased roadmap.

## Develop locally

```sh
npm ci
npm run dev
```

Validate changes with:

```sh
npm run typecheck
npm test
npm run build
```

`npm run typecheck:game` and `npm run test:game` check the game alone, without the separate Gothic 3 study.

After changing the core's data or the shipped assets, regenerate the exports (CI checks that they are current):

```sh
npm run data:export
npm run assets:manifest
```

Browser checks do not establish packaged desktop compatibility or performance on other hardware. A pull request also needs the [play gate](docs/engineering/play-gate.md).

## Project documentation

The [documentation index](docs/README.md) lists everything. Starting points:

- [Vision](docs/vision.md)
- [Setting and original-world direction](docs/world/setting.md)
- [Decision register](docs/decisions.md)
- [Vertical slice](docs/production/vertical-slice.md)
- [Art direction](docs/art/art-audio-ui.md)
- [Architecture](docs/engineering/architecture.md) and the [engine-agnostic core](src/core/README.md)
- [Porting to Unreal Engine](docs/unreal/README.md)
- [Shared asset provenance](docs/engineering/shared-assets.md) and the [model license ledger](docs/engineering/model-licenses.md)

## Gothic 3 study and reconstruction

A separate project lives in this repository beside Tervain: a study of Gothic 3 and an incomplete TypeScript browser reconstruction of it, used as reference material for Tervain's look and feel. It shares no code with the game and is not part of the Unreal port.

What keeps it separate:

- **Where it lives.** `src/gothic3` and `src/gothic3local` (code), `tools/gothic3` and `scripts/` (its tools), `tests/gothic3*` (its tests), `assets/gothic3` and `public/gothic3` (its records and prepared data), and the two pages `gothic3/` and `gothic3-local/`. Its documents are the `gothic3-*` pages under `docs/engineering` and the dated studies under `docs/art`.
- **No shared code.** No file of the game imports a file of the study, and none of the study imports the game. Only configuration names both: the site's build, because one site serves them, and the two TypeScript projects that keep them apart. `tests/tooling/gothic3Study.test.ts` fails when that stops being true.
- **Outside the port seed and its checks.** The core, the exported data, the asset manifest and the Unreal project hold nothing of it. It is compiled and tested as a project of its own: `npm run typecheck:gothic3` and `npm run test:gothic3` are the study's, `npm run typecheck:game` and `npm run test:game` the game's, which are also the seed's. In CI they run in separate jobs. `npm run typecheck` and `npm test` run both.

- The [Gothic 3 / Ardea reconstruction](https://ael-dev3.github.io/Tervain/gothic3/) is a new browser implementation guided by the installed game. The Windows executable is not compiled into the site, and decompiled listings are not treated as original source code. Startup and campaign integration are still incomplete. See its [current scope and controls](docs/engineering/gothic3-browser-port.md).
- The [local-install study viewer](docs/engineering/gothic3-local.md) reads the visitor's own installed files in their browser and hosts no game data.
- How the rebuilding works: [concise process guide](docs/engineering/gothic3-reconstruction-method.md), [overview](docs/engineering/gothic3-rebuild-overview.md), [detailed guide](docs/engineering/gothic3-rebuild-guide.md), [step-by-step workflow and repository map](docs/engineering/gothic3-rebuild-workflow.md), [technical checkpoint history](docs/engineering/gothic3-rebuilding-process.md).
- The [illustrated Gothic 3 video and Tervain visual audit](docs/art/studies/gothic3-video-2026-10-05/README.md) is a dated study with comparisons and selected motion evidence.

Neither route grants rights to Gothic 3 material or establishes commercial-release clearance.

<p align="center">
  <img src="docs/engineering/gothic3-local/coast.jpg" width="49%" alt="Gothic 3: tall grass on a sea cliff above a sandy beach.">
  <img src="docs/engineering/gothic3-local/ardea.jpg" width="49%" alt="Gothic 3: Ardea's cobbled square, roofs and palisade.">
  <img src="docs/engineering/gothic3-local/forest.jpg" width="49%" alt="Gothic 3: lichen-covered rocks and dry grass beside a fir forest.">
  <img src="docs/engineering/gothic3-local/bay.jpg" width="49%" alt="Gothic 3: a watchtower on a cliff above a quiet bay.">
</p>

<sub>These pictures show the separate Gothic 3 local-install study viewer, 4 October 2026, not Tervain. Gothic 3 © THQ Nordic GmbH, developed by Piranha Bytes. The viewer is not affiliated with or endorsed by them. See [screenshot provenance](docs/engineering/gothic3-local.md#screenshots).</sub>

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [LICENSE-SCOPE.md](LICENSE-SCOPE.md) before proposing work. Identify authorship and applicable terms for code and assets. Contributions do not transfer copyright or create blanket relicensing permission.
