# Review of the Unreal seed, 16 November 2026

A scored review of the five things this repository was reworked to provide for an Unreal Engine port, written by the
same hand that did the work, with the evidence for each score and what is missing from a ten. The scores are for the
state of `main` on the day above. Nothing here has been run in Unreal Engine; where that is what a ten needs, the
score says so. It replaces the review of 15 November, which scored 8, 9, 9, 8 and 9. A seventh reading, the same day,
read the documents a newcomer opens first and the notices, against the port the repository is for, rather than the
code alone. It found stale documents the earlier readings had not opened, so the Cleanup score given earlier that day
was too high; with them corrected it stands at ten ([what it found](#5-cleanup)).

| Requirement | Score | In one line |
| --- | --- | --- |
| [Engine-agnostic core](#1-engine-agnostic-core) | 10 / 10 | Every rule of the game is in the core, with a boundary CI enforces. After six readings of the scene layer, the last two adversarial and each run beside a clean-checkout audit of the commit it read, nothing known to decide play is left there. |
| [Asset manifest](#2-asset-manifest) | 10 / 10 | Every file has a source, a licence, a size and a plan, and every one to be replaced names its pack. Files with an open question are replaced before anything ships. |
| [Unreal mapping documents](#3-unreal-mapping-documents) | 10 / 10 | Every quotation is checked against its page and every number against the data. The one page no tool can read is cited, never quoted. |
| [C++ skeleton](#4-c-skeleton) | 9 / 10 | It compiles, links and runs against stand-ins, cannot drift from the core unnoticed, and every engine name it assumes is entered with its evidence. It has never been built by the engine: that build is the ceiling. |
| [Cleanup](#5-cleanup) | 10 / 10 | The tree is clean of private material and stays so by a CI check. No exported name, member or field of the game's source is left that nothing reads, and no living document still treats the engine as open. |

## 1. Engine-agnostic core

**Score: 10 / 10.**

What is there:

- [`src/core`](../../src/core/README.md): 110 files holding the game's state and commands, its content tables, its
  rules and its world, with no import outside the folder. [`tests/core/boundary.test.ts`](../../tests/core/boundary.test.ts)
  reads every import and fails on one that leaves, and `npm run typecheck` compiles the core a second time on its own
  against the ECMAScript library alone (`tsconfig.core.json`), so a use of the DOM or of Node does not compile.
- The rules moved out of the renderer each have a test, and
  [`tests/core/ruleCoverage.test.ts`](../../tests/core/ruleCoverage.test.ts) fails when an exported name of a rules
  module is named in no test.
- The core's data is exported to [`data/`](../../data/README.md), 62 files written by `npm run data:export`: JSON
  documents with a schema each, the terrain as Landscape rasters, and DataTable-shaped files in Unreal's units.
  `npm run data:check` fails in CI when `data/` is not what the core writes today. The export carries what is played, not only what is authored: the forest as the web build
  plants it, the stones and the rock piles laid round it, the props the rules lean on, and how long each spoken line
  lasts.
- The scene layer was read end to end six times for anything that still decides how the game plays, and each
  reading's findings were lifted in pull requests of their own. The fifth, on 16 November 2026, read the scene and
  rendering layer of `main` after [#832](https://github.com/0xAell/Tervain/pull/832) as an adversary would, with a clean-checkout audit of the same commit, and found
  what the earlier four had passed over: the
  camera's view deciding whether a figure was there at all (a toll-jumper walked up to in view never fought), the F3
  panel's cheats shipping to every player, a capture able to save over a player's journey, a second rule for what runs
  while play is held, the water clock's halt under reduced motion written down nowhere, a collider that followed a
  figure's visibility rather than the core's rule, values typed again, a check made twice and six unused pieces of
  code. All of it is lifted ([#835](https://github.com/0xAell/Tervain/pull/835), [#836](https://github.com/0xAell/Tervain/pull/836), [#837](https://github.com/0xAell/Tervain/pull/837)).
  A sixth reading, the same day, read `main` after [#839](https://github.com/0xAell/Tervain/pull/839) the same way, beside a clean-checkout audit of that commit
  (82,546 files; typecheck, the data, manifest and Unreal checks and the build pass; 556 test files and 5,462 tests
  pass; `npm audit` finds nothing, development tools included), and found what the fifth had missed: a change of
  graphics quality put every hostile back at its post with its health whole, a way out of any fight ([#840](https://github.com/0xAell/Tervain/pull/840)); held
  play holding different things behind different panels, and the benchmark running the world unattended ([#841](https://github.com/0xAell/Tervain/pull/841));
  the physics typing the doorstep and archive stones and the surfaces' friction a second time ([#842](https://github.com/0xAell/Tervain/pull/842)); four small
  rules outside the core: when a resident stops to talk, which save Continue loads, whether the bow may loose, and an
  unrecorded line's length ([#843](https://github.com/0xAell/Tervain/pull/843)); and code nothing read that the export scan could not see ([#844](https://github.com/0xAell/Tervain/pull/844)). All of it
  is lifted.
  [System mapping](system-mapping.md#still-in-the-scene-layer) names what stays in the scene layer and why none of it is
  a rule of the game: the order of a step, what a ray meets, the camera's smoothing, how a model loads, where the arrow
  leaves the bow, where props stand, which device does what, a body's measured size, when the page is left and what the
  tools reach.
- Pull requests: [#775](https://github.com/0xAell/Tervain/pull/775),
  [#776](https://github.com/0xAell/Tervain/pull/776), [#777](https://github.com/0xAell/Tervain/pull/777),
  [#778](https://github.com/0xAell/Tervain/pull/778), [#784](https://github.com/0xAell/Tervain/pull/784),
  [#800](https://github.com/0xAell/Tervain/pull/800), [#802](https://github.com/0xAell/Tervain/pull/802),
  [#804](https://github.com/0xAell/Tervain/pull/804), [#807](https://github.com/0xAell/Tervain/pull/807),
  [#809](https://github.com/0xAell/Tervain/pull/809), [#810](https://github.com/0xAell/Tervain/pull/810),
  [#811](https://github.com/0xAell/Tervain/pull/811), [#812](https://github.com/0xAell/Tervain/pull/812),
  [#815](https://github.com/0xAell/Tervain/pull/815), [#816](https://github.com/0xAell/Tervain/pull/816),
  [#817](https://github.com/0xAell/Tervain/pull/817), [#818](https://github.com/0xAell/Tervain/pull/818),
  [#819](https://github.com/0xAell/Tervain/pull/819), [#820](https://github.com/0xAell/Tervain/pull/820),
  [#821](https://github.com/0xAell/Tervain/pull/821), [#822](https://github.com/0xAell/Tervain/pull/822),
  [#823](https://github.com/0xAell/Tervain/pull/823), [#824](https://github.com/0xAell/Tervain/pull/824),
  [#825](https://github.com/0xAell/Tervain/pull/825), [#826](https://github.com/0xAell/Tervain/pull/826),
  [#827](https://github.com/0xAell/Tervain/pull/827), [#828](https://github.com/0xAell/Tervain/pull/828),
  [#829](https://github.com/0xAell/Tervain/pull/829), [#830](https://github.com/0xAell/Tervain/pull/830),
  [#831](https://github.com/0xAell/Tervain/pull/831), [#835](https://github.com/0xAell/Tervain/pull/835), [#836](https://github.com/0xAell/Tervain/pull/836), [#837](https://github.com/0xAell/Tervain/pull/837),
  [#840](https://github.com/0xAell/Tervain/pull/840), [#841](https://github.com/0xAell/Tervain/pull/841), [#842](https://github.com/0xAell/Tervain/pull/842), [#843](https://github.com/0xAell/Tervain/pull/843), [#844](https://github.com/0xAell/Tervain/pull/844).

What is missing from a ten: nothing the repository can do. Porting the rules to C++ is the port's work, phase by phase
in the [roadmap](roadmap.md); the seed mirrors six of them as a worked example.

## 2. Asset manifest

**Score: 10 / 10.**

What is there:

- [`data/assets/manifest.json`](../../data/assets/README.md): all 1,670 model, texture and sound files with source,
  licence, size, the Unreal asset each would become, and a plan: 188 to replace, 595 to keep, 887 to drop. Everything
  marked for replacement names a first-choice pack on Fab and the alternatives. Each asset's name says what it holds
  and each family's source says how its files were made: the leaf atlases' masks are no longer named as packed
  occlusion-roughness-metallic, only the fir's atlas, redrawn from a supplied model, carries that model's licence, and
  no loader manifest becomes an asset ([#834](https://github.com/0xAell/Tervain/pull/834)).
- The manifest is generated (`npm run assets:manifest`), has a schema, and `npm run assets:check` fails in CI when it
  no longer matches the files on disk.
- The 27 Fab listings it names were read on their own pages: price, licence tier, engine versions, publisher
  ([#789](https://github.com/0xAell/Tervain/pull/789)).
- The two provenance questions in the model ledger and the terms of the music no longer hold anything up: by the
  owner's decision the five files are marked [`replaceBeforeShip`](../../data/assets/README.md#replace-before-ship),
  each with a named pack, and the generator refuses a manifest that keeps such a file
  ([#801](https://github.com/0xAell/Tervain/pull/801)).
- Pull requests: [#779](https://github.com/0xAell/Tervain/pull/779), [#786](https://github.com/0xAell/Tervain/pull/786),
  [#789](https://github.com/0xAell/Tervain/pull/789), [#801](https://github.com/0xAell/Tervain/pull/801), [#834](https://github.com/0xAell/Tervain/pull/834).

What a ten does not cover: whether each pack's levels of detail suit the mobile renderer can only be seen in the engine,
in the port's Phase 5 before a pack replaces a stand-in; and the listings, read once, are to be read again before
anything is bought, since prices and supported versions change.

## 3. Unreal mapping documents

**Score: 10 / 10.**

What is there:

- [System mapping](system-mapping.md), [conventions](conventions.md), [the web target](web-target.md) and the
  [roadmap](roadmap.md), with an [index](README.md) that says what carries over.
- [`sources.json`](sources.json) registers 29 sources and the 87 passages and 22 table rows taken from them.
  `npm run docs:sources` reads 28 of those sources on their own pages and finds every passage and row, including the
  whole mobile renderer table and the known issues of the 5.9 preview
  ([#794](https://github.com/0xAell/Tervain/pull/794), [#814](https://github.com/0xAell/Tervain/pull/814)).
- In CI, [`tests/tooling/docSources.test.ts`](../../tests/tooling/docSources.test.ts) fails on a quotation without a
  source, [`tests/tooling/docNumbers.test.ts`](../../tests/tooling/docNumbers.test.ts) compares every number about this
  repository with its data and fails on a bare number, and
  [`tests/tooling/docLinks.test.ts`](../../tests/tooling/docLinks.test.ts) follows every link, anchor and file name.
- The one source no tool here can read, Epic's post on Unreal Engine 6, answers every automated reader with a security
  check, a headless browser included. The documents take nothing from it: they link it, say it could not be read, and
  quote only what users of Epic's forum report of it, from a thread read on its page.
- On 16 November 2026 every document under `docs/unreal`, with the seed's and the data's READMEs, was read against the
  code as it stands, and what had gone stale or said more than its evidence was corrected: what the seed's build is,
  which documents the checks cover, the ids header's groups, the glTF import's axes (an assumption, now marked so), the
  quick slots, the source build the preview asks for, and four of the preview's known issues now quoted from registered
  passages ([#833](https://github.com/0xAell/Tervain/pull/833)).
- The conventions were then checked statement by statement against the core, `data/`, the manifest and the C++ seed:
  units and axes, positions and yaws over every building, animal and tree, the camera's field of view, the tables and
  strings, the Landscape's size, heights and orientation, naming and levels of detail. One thing was missing: the
  texture suffixes name a material's maps, and the title's emblem, an interface image, rightly carries none; the
  conventions now say so ([#848](https://github.com/0xAell/Tervain/pull/848)).
- Pull requests: [#780](https://github.com/0xAell/Tervain/pull/780), [#794](https://github.com/0xAell/Tervain/pull/794),
  [#814](https://github.com/0xAell/Tervain/pull/814), [#833](https://github.com/0xAell/Tervain/pull/833),
  [#848](https://github.com/0xAell/Tervain/pull/848).

What a ten does not cover: Unreal Engine 5.9 is a preview, and what is written about its web target can change at
release; `npm run docs:sources` is to be run again then, and the web target page corrected.

## 4. C++ skeleton

**Score: 9 / 10.**

What is there:

- [`unreal/`](../../unreal/README.md): a source-only project for Unreal Engine 5.9 with one module: row structs
  generated from the same definitions as the tables, the core's ids as generated constants, unit conversions, project
  settings, a data subsystem that reads the tuning values, and six rules mirrored as a worked example.
- Every source file of the module compiles with warnings as errors, links and runs against stand-ins for the engine's
  headers ([`tests/tools/unrealSeedBuild.test.ts`](../../tests/tools/unrealSeedBuild.test.ts)); the mirrored rules
  return what the core returns on a few thousand cases
  ([`tests/tools/unrealRulesParity.test.ts`](../../tests/tools/unrealRulesParity.test.ts)).
- It cannot drift from the core unnoticed: `npm run unreal:check` and the CI job *Unreal seed* fail when an id, a table
  shape, a tuning value the C++ reads or a generated header no longer agrees
  ([`tests/tools/unrealDrift.test.ts`](../../tests/tools/unrealDrift.test.ts)).
- Every engine name the seed and its stand-ins use is in [the register](engine-symbols.md), with the files that use it,
  what is assumed and the evidence: 190 of 200 are confirmed by a passage quoted from Epic's documentation, 8 are
  documented in part, one is not documented and one is shown in an older form on a dated page. Three of those ten are
  corroborated by a public project built against Unreal Engine 5.5, which uses them as the seed does. `npm run
  unreal:symbols -- --online` opened all 93 cited pages and files on 16 November 2026 and found every passage
  ([#813](https://github.com/0xAell/Tervain/pull/813), [#832](https://github.com/0xAell/Tervain/pull/832)).
- Read as an Unreal engineer would read it, the data subsystem had a fault no compiler would report: it loaded a
  DataTable for every lookup and held it nowhere, so garbage collection could unload the table while a row found in it
  was still in use, and a lookup could load a table in the middle of play. Epic: "you typically need to maintain a
  UPROPERTY reference to any Object you wish to keep alive". The subsystem now loads the tables the settings name when
  it starts and holds them in a `UPROPERTY(Transient)` array of `TObjectPtr`, the pointer Epic recommends there; a
  table that cannot be loaded is named in a warning, and the test shows a held table still answers once nothing is left
  at its path. The tuning file is read from `data/` beside the project, which a packaged game does not carry: the
  roadmap's Phase 6 now says to import or stage it ([#853](https://github.com/0xAell/Tervain/pull/853)).
- Pull requests: [#781](https://github.com/0xAell/Tervain/pull/781), [#790](https://github.com/0xAell/Tervain/pull/790),
  [#792](https://github.com/0xAell/Tervain/pull/792), [#813](https://github.com/0xAell/Tervain/pull/813),
  [#832](https://github.com/0xAell/Tervain/pull/832).

What is missing from a ten, and the plan:

- It has never been built by Unreal's build tool or opened in the editor. The reflection markup, the build files and the
  project file are read only by the engine's own tools, and a wrong signature can still turn up. This is the one step
  no work in this repository can replace.
- Plan: the roadmap's Phase 1, on a machine with the engine: build the editor target, fix what the compiler finds, keep
  the fixes here, settle the eight open names in the register, and import the tables and the Landscape.

## 5. Cleanup

**Score: 10 / 10.**

What is there:

- About 2,120 files of superseded records, proofs and clutter removed, 30 unused exports deleted, and the README and
  the documents' index rewritten for a reader new to the project
  ([#782](https://github.com/0xAell/Tervain/pull/782), [#783](https://github.com/0xAell/Tervain/pull/783)). The two
  pieces of scene code that were built and tested but unused, the prepared broadleaf and the asset library hook, went
  with the records and tests that named them ([#805](https://github.com/0xAell/Tervain/pull/805)). No exported name in
  the game's source is left that nothing else in the repository refers to. What the later readings found unused inside
  the code went too: six members and values the fifth found ([#837](https://github.com/0xAell/Tervain/pull/837)); a camera view never used, a pose
  blend no caller asked for, save-store methods with no caller and a context field written and never read, found by the
  sixth ([#844](https://github.com/0xAell/Tervain/pull/844)); and nine methods nothing called and a field nothing read, found by scanning every class
  member and field ([#845](https://github.com/0xAell/Tervain/pull/845)).
- The teaser is intact: its film and poster under `docs/media/teaser` are the same files, to the byte, as before this
  rework began, and the film decodes from end to end as its record describes it (44.9 s, 1920 × 1080 at 60 frames a
  second, H.264 with AAC sound).
- Private material removed from the tree: personal paths, account wording, tool and working-branch names, in the game's
  documents and in the separate Gothic 3 study ([#785](https://github.com/0xAell/Tervain/pull/785),
  [#787](https://github.com/0xAell/Tervain/pull/787), [#788](https://github.com/0xAell/Tervain/pull/788)).
- A seventh reading, of the documents a newcomer reads first and of the notices, found what the readings of the code
  had not opened, and all of it is corrected ([#851](https://github.com/0xAell/Tervain/pull/851)). The
  [decision register](../decisions.md) did not record the port at all: it still proposed Three.js as the runtime (P04)
  and asked which engine should ship (O04); the port is now its accepted decision A169. The
  [architecture](../engineering/architecture.md) still treated the engine as open, with Electron as the desktop shell
  and a table of modules written at `0.0.5` whose names had drifted; it now describes the layers as they stand. The
  [play gate's page](../engineering/play-gate.md) set out its required check twice and did not describe the budget gate
  every pull request is held to. `NOTICE`, the licence's scope and the two notices the site carries named two Warpkeep
  adaptations removed in `0.0.13`;
  [`tests/tooling/softwareNotices.test.ts`](../../tests/tooling/softwareNotices.test.ts) now holds all four to the
  headers of the source files. And a headed browser in a fresh profile stopped at its first-run page, which kept the play
  gate from starting on a machine that had not run it before (`--no-first-run` in `tools/cdp.mjs`). The same reading
  ran the online checks again: every quotation of the porting documents (109 passages and rows on 28 pages) and the
  passage of every engine name (91 pages) was found; and the teaser's film and poster are still the bytes they were
  before the rework, the film decoding from end to end.
- No pull request is left open, as the decision register's A59 asks. The 270 still open from the automated series of
  13 to 21 October 2026 were closed as superseded by the owner's decision, each with its measured reason: 199 no longer
  merged after the rework, and the 71 that still merged would have brought back repro tools and perf records the
  cleanup had removed. Their branches are kept. Three older ones were carried instead: the development server's
  security fix and a hole in the budget gate ([#852](https://github.com/0xAell/Tervain/pull/852)), and 0.0.49's tree
  fix ([#854](https://github.com/0xAell/Tervain/pull/854)).
- It stays clean: the CI job *Hygiene* fails a pull request whose commits, added lines, title, description or branch
  name carry a mailbox identity, a session link, a host name, a network address, a home or temporary path, or a key
  ([#795](https://github.com/0xAell/Tervain/pull/795)).
- The Gothic 3 study is most of the repository's files. It stays in this repository by the owner's decision, as a
  separate project: no file of the game imports it or is imported by it, it is compiled and tested as its own project
  in its own CI jobs, and the seed's checks do not cover it
  ([`tests/tooling/gothic3Study.test.ts`](../../tests/tooling/gothic3Study.test.ts) fails when any of that changes;
  [#803](https://github.com/0xAell/Tervain/pull/803)).

## How the seed was verified

- **The play gate.** Every pull request above passed it: on its head, the game drew no more draw calls and triangles than
  the live build and logged no console error. From [#800](https://github.com/0xAell/Tervain/pull/800) on, every lift
  left the figures where they were, through [#854](https://github.com/0xAell/Tervain/pull/854): 284 draw calls and 2,915,743 triangles. Its chance failures had one cause, found
  on 15 November 2026: on a software renderer the game's first view can outlast the browser's GPU watchdog, which kills
  the GPU process. The gate now starts its browser without the watchdog
  ([#791](https://github.com/0xAell/Tervain/pull/791), [#793](https://github.com/0xAell/Tervain/pull/793);
  [the record](../perf/LATEST.md)).
- **Two test failures, each to its cause.** `tests/presentation/npcSchedules.test.ts` failed now and then, always the
  same to the last digit: a house's cached room grid read back the origin of the grid built after it, a fractional
  number kept in an object's own field. The grid now keeps whole numbers and its cells only and works its origin out
  from the room; the test then ran 120 times under load without a failure
  ([#806](https://github.com/0xAell/Tervain/pull/806)). The hero-turn test's one failure was a timeout, not a pose:
  locally a test had five seconds, in CI ninety, and the machine was busy. The game's tests now have one limit wherever
  they run ([#808](https://github.com/0xAell/Tervain/pull/808)).
- **A clean checkout.** A fresh clone of `main` after [#837](https://github.com/0xAell/Tervain/pull/837) (82,546 files), installed from the lockfile,
  typechecks, passes the data, manifest and Unreal checks, builds, and passes the whole test suite of both projects:
  556 files, 5,461 tests. `npm audit` finds no vulnerability, development tools included. The same audit of `main`
  after [#832](https://github.com/0xAell/Tervain/pull/832), before the fifth reading, had passed too (554 files, 5,456 tests).
  At the end of the day, `main` after [#854](https://github.com/0xAell/Tervain/pull/854) typechecks, passes the data, manifest
  and Unreal checks and the game's and seed's suite (429 files, 3,460 tests), and `npm audit` finds no vulnerability at
  any level, development tools included.
- **No dead code.** Of the 2,490 names the game's source exports, none is left that nothing refers to (408 are used
  only in their own file). The compiler's checks for unused locals and parameters, on in `tsconfig.json`, find none.
  Read with the bundler's own parser, none of the game's 1,161 class methods, getters and setters is named anywhere
  but in its own declaration, and none of its 1,362 class fields is written and never read. The same scan of `main`
  after [#844](https://github.com/0xAell/Tervain/pull/844) found nine such methods and one such field, and they went in [#845](https://github.com/0xAell/Tervain/pull/845). The scan counts a field
  filled with `??=` as read, and a counter whose new value is used as read as it counts.
- **The published build.** After every deploy, CI plays the live build: it must load, draw, pause and resume, walk and
  log no error (`npm run smoke:live`, [#797](https://github.com/0xAell/Tervain/pull/797)). The deploy and that check
  passed after every merge from [#797](https://github.com/0xAell/Tervain/pull/797) to
  [#847](https://github.com/0xAell/Tervain/pull/847). After [#850](https://github.com/0xAell/Tervain/pull/850) the
  check failed: the account's rename had moved the hosted build to https://0xaell.github.io/Tervain/, and the check
  still loaded the old address. [#849](https://github.com/0xAell/Tervain/pull/849) moved it, and the deploy and the
  check passed at the new address after its merge.

## After the review: what was improved and what is next

A running list, kept short; each line names the pull request that did it.

Improved:

- Every CI job has a time limit: a checkout that hung held its run for 23 minutes
  ([#856](https://github.com/0xAell/Tervain/pull/856)).
- The canvases the game reads back are CPU canvases. The rugs and the residents' sheets are made while the world is
  already drawing, and reading back a GPU canvas waits for every frame queued before it: in the first minute of play on
  a software renderer the page was stalled for 46 s and drew a frame a second, now three, its main thread idle 90% of
  the time; on a GPU each read was a hitch ([#857](https://github.com/0xAell/Tervain/pull/857)).
- The forest the core exports is the one the game plants. It was planted without the hero pines the game draws by
  default, whose crowns and seats decide which trees fit: it had 453 trees where the game plants 451, 307 of them
  elsewhere, and the woodland floor, the export's trees and the Unreal tables followed it ([#858](https://github.com/0xAell/Tervain/pull/858)).
- The trees are built faster, to the same bytes. The canopy atlas painter visits only the pixels a leaf can cover (a
  fifth of what it visited), and the nearest-wood search compares squared distances instead of calling Math.hypot. In
  node the 25 tree models take 10.2 s where they took 12.9 s and the atlas 1.2 s where it took 3.2 s; in the browser the
  woodland stage is 2.6 s shorter. Every model, the atlas and both plantings hash the same as before, and tests hold the
  painter and the search to the ones they replace ([#859](https://github.com/0xAell/Tervain/pull/859)).
- The woodland floor the core exports is the one the game lays. Its rule reads the shade the drawn crowns cast, which
  only the models give; the export laid it with an estimate from the trees' sizes and had 296 pieces where the game lays
  720 (669: the test drew the supplied trees, corrected by [#869](https://github.com/0xAell/Tervain/pull/869)). The core keeps the game's floor as it keeps the forest,
  checked by the same test ([#860](https://github.com/0xAell/Tervain/pull/860)).
- The fractal noise the faces, the menu's materials, the bark and the ground are painted from (`fbmField`) hashes each
  lattice corner once for the rows that share it, where every pixel hashed its four again: 2.5 times as fast, to the
  bit, and 0.6 s less of the load between the click and the woodland ([#861](https://github.com/0xAell/Tervain/pull/861)).
- The tests read and decode the shipped model files through one fixture (`tests/presentation/glbFixture.ts`): five
  fixtures and seven tests each had their own copy of the bytes that re-pack a glTF file without its images, and of
  the checks that it is one ([#862](https://github.com/0xAell/Tervain/pull/862)).
- The README's account of the prototype (the region's size, the residents, the animals and their kinds, those hunted
  and those left alone, the hostiles, the hotbar) is checked against the exported data, as the porting docs' numbers
  already were ([#863](https://github.com/0xAell/Tervain/pull/863)).
- The 36 generated hero tree files are compressed losslessly, as every other model already was: 29.3 MiB become
  18.3 MiB, 11 MiB less for a first visit (the model host sends them uncompressed). The trees built from them hash the
  same as before, and the generators' instructions now include the step ([#864](https://github.com/0xAell/Tervain/pull/864)).
- The title menu fetches what a journey needs ahead: its list had missed the 36 generated trees (18 MiB), which were
  downloaded only once a journey began, and the world's own code (1.7 MB) is fetched and compiled there too. At
  10 Mbit/s, after a minute in the menu, the ground is ready 3 s sooner; at 20 Mbit/s the downloads had overlapped the
  preparation and nothing changes ([#865](https://github.com/0xAell/Tervain/pull/865)).
- CONTRIBUTING.md lists the checks CI runs on a pull request and how to run each first, the play gate's command and
  where its PASS line goes among them, and no longer calls the repository an outline ([#866](https://github.com/0xAell/Tervain/pull/866)).
- The prototype guide's table of what is real says what the game does: it counted eleven residents where there are
  twelve, gave the hero the 49,500-triangle model of 0.0.5 where he has had a 149,974-triangle body since A74, and
  described the other people as the generated eleven-bone figures that A49 and A65 replaced with the supplied models
  on rigs of their own. The README's numbers test now holds the guide's numbers too, and fails with the missing phrase
  instead of printing the page ([#867](https://github.com/0xAell/Tervain/pull/867)).
- The models the game keeps no longer keep their files. Three's glTF result carries its parser, which holds the whole
  file and what it decoded from it, and the caches that keep the residents', animals', trees' and hero's models for the
  life of the page kept their parsers too. The game parses through `parseModel`, which keeps of the parser only the
  JSON and the associations it reads afterwards: at a settled journey the page's array buffers take 654 MB where they
  took 810 ([#868](https://github.com/0xAell/Tervain/pull/868)).
- The core's forest and floor are planted with the generated trees the game draws. The test that keeps them drew the
  supplied trees: its fixture read only those files, while the game draws generated oaks, birches, bushes, orchard
  trees and a sentinel in their slots by default. A tree keeps the supplied model's spacing, but the drawn model's roots
  seat it, its wood sets the walk grid's clearance and its crown the floor's shade. Compared with a running game tree
  for tree and piece for piece: 13 oaks sat up to 0.24 m too high in the copy, 27 trees kept the wrong clearance (by up
  to 7.5 m), and the floor has 669 pieces, not 720. The export follows ([#869](https://github.com/0xAell/Tervain/pull/869)).
- The game takes its forest from the core's copy instead of planting it again. Planting builds every supplied tree a
  generated one replaces (the oaks, birches, bushes, orchard trees and sentinel, by default) only to measure where it
  would stand: most of the woodland stage of the load. The core keeps the planting to the bit, with the models and
  flags it was planted with; a world planted with those takes it, and any other plants as before. On the four-core
  test machine the woodland stage takes 11 to 12 s where it took 17 to 21 s, and every tree's world matrix, tree
  collider and floor piece is the same, to the bit; the scripts are 40 KB (gzip) larger. The supplied trees built only
  to be measured had been kept with the drawn ones, so a settled journey also holds 80 MB less of array buffers (574 MB)
  and 17 MB less of JavaScript heap ([#870](https://github.com/0xAell/Tervain/pull/870)).
- A journey loads only the tree models its forest draws. After #870 it still downloaded, parsed and kept the seven
  supplied trees the generated ones replace, which only a forest planted afresh measures by: 21 files, 16 MB of a first
  visit's 48 MB of trees. The world and the menu's warm-up ask for the models the planted forest is drawn with, and for
  every model only when a journey plants afresh (under a flag). The world is the same, tree for tree, and holds 13 MB
  less ([#871](https://github.com/0xAell/Tervain/pull/871)).
- A built world lets go of the caches only its build reads: the leaf cards' decoded alpha, which the tree models' leaf
  sites and the island pass sample, and the trees' wood edges and basal polygons, which the planting and the colliders
  measure. Each was keyed by something the world keeps, so it lived as long as the world. A module registers how to
  empty its cache (`presentation/buildCaches.ts`), and the world empties them once built; a later build fills them
  again. A settled journey holds 515 MB of array buffers where it held 556 to 560 MB, and the world is the same
  ([#872](https://github.com/0xAell/Tervain/pull/872)).
- Merged regions let go of their building arrays. The settlement's and the scatter's merged geometry is built in arrays
  that grow by doubling, so they hold up to twice what is drawn; the meshes copy what they draw, but the regions were
  kept by the closures of the world they were built for, and the arrays with them. A region lets its batches' arrays go
  once merged (`Region.toGroup`), keeps their counts, and refuses more geometry or a second merge. A settled journey
  holds 448 MB of array buffers where it held 515 to 516 MB: since the morning's 810 MB, 45% less ([#873](https://github.com/0xAell/Tervain/pull/873)).
- `npm run check` runs what a pull request needs before the play gate: the game's typecheck, the check of the exported
  data, the game's tests and the hygiene check, in turn. CONTRIBUTING and the README listed them one by one ([#874](https://github.com/0xAell/Tervain/pull/874)).
- The Unreal seed mirrors a third rule, the first of movement: the pace kept wading (`TervainRules::WadeFactor`, its
  numbers read from `hero.wade`). It returns what the core's `wadeFactor` returns at every centimetre from half a metre
  out of the water to 3 m deep, and every wade key is read ([#875](https://github.com/0xAell/Tervain/pull/875)).
- The trees are built faster again, to the same bytes. The leaf-island pass keeps each grid cell's parts in a linked
  list over typed arrays, where it looked cells up in a map of sets for every part it linked and emptied; the leaf
  sampler indexes pixels inside the image without wrapping them; the wood search runs from a stack; the clump search
  welds leaf corners through a typed-array table and sorts its bounds tree on precomputed keys. In three alternating
  pairs on the four-core test machine the woodland stage takes 7.6 s where it took 10.4 s (medians), and all 63 drawn
  tree levels' wood and leaves, and every planted tree's matrix, hash the same ([#876](https://github.com/0xAell/Tervain/pull/876)).
- The water's three procedural textures (ripples, foam, caustics) look each wave's sine up by lattice step instead of
  working it out for every texel: a texel's angle depends only on an integer step, which a 512² tile reaches at most
  41,000 times where it has 262,144 texels. Every byte of the three is the same, and in a profiled load on the
  four-core test machine they take 0.57 s of the terrain stage where they took 1.08 s ([#877](https://github.com/0xAell/Tervain/pull/877)).
- The world's cooperative construction (the terrain, its surface and tiles, the walking routes) works in 48 ms slices
  while the loading screen covers it. It worked 8 ms and then waited for a painted frame, so those stages were idle
  about as long as they worked; the loading screen's animations run on the compositor, and only its progress text now
  changes less often. In three alternating pairs on the four-core test machine the build from the terrain to the first
  view's preparation takes 12.5 to 12.7 s where it took 16.5 to 17.1 s, and the world is the same ([#878](https://github.com/0xAell/Tervain/pull/878)).
- `npm run perf:load` times each stage of a journey's load from the loading screen's own updates (polling its text
  missed the short stages), alternating between builds served on two ports and printing each stage's median: the
  measurements of this list's loading entries, made repeatable ([#879](https://github.com/0xAell/Tervain/pull/879)).
- Loading no longer waits for paints that do not come. Each turn of the build waited for the browser to paint, and a
  browser whose GPU process is busy compiling shaders presents no frame: on the four-core test machine without a GPU
  the turns waited up to 4.4 s each while the models loaded. A turn now goes on after 100 ms without a paint. Rapier
  also compiles from the menu (or the build's start), where the build began it only once every model had loaded. In
  three alternating pairs the journey reaches its first view's preparation 19.2 s after the click where it took 22.8 s
  (medians). Splitting the ground's eight textures across three workers gained 0.2 s more, within the noise, and
  slowed the residents and the terrain by contention: not taken ([#880](https://github.com/0xAell/Tervain/pull/880)).
- The Unreal seed mirrors a fourth rule: the bow's launch (`TervainRules::ArrowLaunchDirection`, its speed and gravity
  read from `bow`), the low arc that carries an arrow through its target, in double precision as the core computes it.
  It returns the core's direction within a millionth on 305 targets, from under the archer to beyond the bow's reach;
  `FMath::Sqrt` joins the register with the page that documents it ([#881](https://github.com/0xAell/Tervain/pull/881)).
- `npm run perf:load -- --until view` ends a run where the first view's preparation begins, a third of the time
  without a GPU, where the rest is the software renderer compiling shaders; the Loading item below gives today's
  stages and the three overlaps tried and not taken ([#883](https://github.com/0xAell/Tervain/pull/883)).
- The Unreal seed mirrors a fifth and a sixth rule: how the saddled deer answers the reins (`TervainRules::SteerMount`,
  its paces, rates and back-up cone read from `riding.ride`) and its gallop's stamina (`MountStaminaStep`, from
  `riding.stamina`). On 14,400 steps of speed, facing, reins, push, gait and time the C++ gives the core's speed, turn
  and facing within a ten-thousandth; `FMath::Atan2`, `Sin`, `Cos` and `Abs` join the register, every page of
  which was opened again and still holds its passage ([#884](https://github.com/0xAell/Tervain/pull/884)).
- The trees are built faster a third time, to the same bytes: the canopy atlas skips the samples a leaf cannot
  cover (nearly half of its 9.7 million), every bark of one size is painted from one set of noise fields (oak, dead
  wood and pine each made the same three), and the searches for the nearest wood find a triangle's closest point with
  three's arithmetic in scalars. Profiles of the load put it at about 0.4 s less work in the trees' build, which the
  woodland stage's own time, varying as much between runs on the test machine, cannot show; every drawn tree level
  and planted tree comes out the same ([#886](https://github.com/0xAell/Tervain/pull/886)). A stable key sort and flat-array boxes for the two bounding trees were
  measured too, saved nothing, and were not kept.
- `npm run perf:frame` counts where a frame's draw calls and triangles go, by pass (the main view and its leaf depth
  pre-pass, the sun's shadow map, the water's reflection and composite) and by part of the world, at the benchmark
  route's stops with the wanderer standing at each as in play. [AIR-CUTS.md](../perf/AIR-CUTS.md) gives the live
  build's frame at High and its three largest costs: the forest at full detail, the water's reflection when the sea is
  in view, and the sun's shadow map ([#887](https://github.com/0xAell/Tervain/pull/887)).
- The wanderer's shadow is drawn from 15,000 of his own 150,000 triangles, chosen by meshoptimizer over the same
  vertices within 2 mm of his surface, in a worker: the sun's shadow map draws 135,000 fewer skinned triangles every
  daytime frame (12 to 22 % of it at three stops of the route), and a frame drawn both ways differs in 72 of its
  2.9 million pixels, along the shadow's contact line under a boot ([#888](https://github.com/0xAell/Tervain/pull/888)).
- The sky's light no longer costs a frame every 1.8 s. Each repaint of the sky's image made a new texture, so three
  filtered it into a new target and looked up the shader program of every lit material the next frame drew again; the
  image and its filtered target are now kept for the whole journey, and the image is painted from directions worked
  out once. With the loop stopped at the landing, the frame after a repaint makes 10 program lookups where it made 34
  (a steady frame's 10) and takes 6.3–7.2 ms of JavaScript where it took 8.8 (a steady frame about 6), and painting
  takes 0.8 ms where it took 1.9, to the same half floats; the same frame lit both ways is identical ([#889](https://github.com/0xAell/Tervain/pull/889)). Drawing
  into the water's reflection only what can appear where the sea shows was measured too: on the route the sea's part
  of the screen is the whole screen whenever it shows, so it would leave nothing out.
- The rooms' doors are drawn as one batch per material: three's batched mesh holds the 18 leaves, each following its
  hinge as the door swings, where each leaf was two meshes and two draw calls in every pass that drew it. At the
  route's five village stops a frame makes 26 to 78 fewer draw calls (377 to 327 at the median) with the same
  triangles, and the same frame drawn both ways differs in 2 of 1.3 million pixels, by 1/255 ([#890](https://github.com/0xAell/Tervain/pull/890)).
- The pushable barrels and crates are drawn as batches as well, by the doors' batch made general: each prop's parts
  follow its body as the physics moves it, where each prop was two or three meshes and as many draw calls in every
  pass. With the doors' batch, the route's five village stops draw 6 to 22 fewer calls again (308 at the median); the
  same frame drawn both ways differs only on one stretch of a barrel's shadow edge ([#891](https://github.com/0xAell/Tervain/pull/891)).
- The settlement's other moving parts join those batches: the inn sign swinging on its bracket, the archive's door
  and shutter, the mill and sluice wheels, the sluice gate, brace and cracks, the shortcut gate and lever, the bell's
  timber, the schedule board's posts, the guard's pole and the quest's pickups, each following what holds it and
  hiding with it. The five village stops draw 19 to 40 fewer calls again; with the doors and the props, 15 to 24 %
  fewer than 0.0.49 there, for the same triangles ([#892](https://github.com/0xAell/Tervain/pull/892)).
- The scatter's chunks (rocks, the shore's driftwood, scrub and wrack, the streams' reeds) are drawn as one batch per
  material, each chunk still culled on its own: six route stops draw 15 to 63 fewer calls a frame for the same
  triangles. The water's reflection again hides batched parts too small to see in it, as it did before they were
  batched. A first version that merged the small things into two pieces saved fewer calls and drew up to 3,000 more
  triangles, which the play gate refused ([#893](https://github.com/0xAell/Tervain/pull/893)).
- The water's reflection draws the wanderer from the 15,000 triangles his shadow is drawn from, where it drew all
  150,000: at the route stop where he is reflected, the reflection draws 135,000 fewer skinned triangles a frame
  and the frame drawn both ways is identical ([#894](https://github.com/0xAell/Tervain/pull/894)).
- A resident at work finds where their hands rest on the real counter by skinning the hand's outermost vertices, up
  to ten times a frame. Each vertex walked the scene graph above the resident twice and multiplied every weighted
  bone's matrices again; the matrices are now worked out once a query (`posedVertices.ts` skins as three does, step
  for step). The supplier, the quarry hand and the steward work exactly as before, to the last bit. Over 600 steps
  profiled at a village spot, the hand queries took 39 and 43 ms where they took 266 and 293 (0.07 ms a step where
  they took 0.44 to 0.49). The route's frames were also counted again on the live build after this round of cuts: 293
  draw calls a frame where 0.0.49 drew 385 ([AIR-CUTS.md](../perf/AIR-CUTS.md)) ([#895](https://github.com/0xAell/Tervain/pull/895)).
- The first view is prepared with 182 shader programs where it took 244. Preparing the sun's shadow programs compiled the
  whole world a third time, under a stand-in light set without the point lights, for a shadow pass drawn after a pass
  without them. Every pass now sees every light, and a dark lamp stays in the scene at no intensity, so no pass is
  without them, and none of those 62 programs was ever drawn with. A tour of the route's 13 stops and two rooms, at
  noon and at night, compiles nothing the old build had prepared, and one program fewer during play. On the software
  renderer a journey loads 2.6 s sooner (78.4 → 75.8 s, medians of three alternating runs); on a GPU each program is
  driver compile time and memory ([#896](https://github.com/0xAell/Tervain/pull/896)).
- `npm run perf:programs` lists the shader programs compiled for the first view, by shader and by the lights each was
  made for, then stands the wanderer at the route's 13 stops and in two rooms at noon and at night and counts each
  program compiled meanwhile: by a preparation, ahead of the first draw of what it is for, or inside a draw, which
  stalls that frame. A fresh material shown at the end must be caught inside its draw, or the run fails. On 0.1.1, 181
  programs are compiled for the first view and ten more during the tour, at noon as at night: nine by the arrivals'
  preparation, and one inside a draw, the shrine hall's panes the first time they show the view its window capture took
  ([#898](https://github.com/0xAell/Tervain/pull/898)).
- No shader program is compiled inside a frame on the tour any more. Once the shrine hall's window capture is whole,
  its panes show the capture's view, which needs a program of its own, and three made it inside the first frame that
  drew them, the first time the hall was entered: on a GPU, a stall. The first view's preparation now compiles the
  panes in that look as well, as the view draws them, and puts them back. On 0.1.1, `npm run perf:programs` finds 182
  programs at the first view where it found 181, and nine more during the tour, at noon as at night, all prepared
  ahead of their first draw. A transition test that failed when run on its own, because it counted a yield of the loading work
  as a frame of the main loop, now passes alone as in its file ([#901](https://github.com/0xAell/Tervain/pull/901)).
- A preparation now waits for every shader program its materials hold. Three's wait (`compileAsync`) resolved once each
  compiled material's latest program was linked, but a material drawn on several kinds of object, such as the shadow
  warm-up's shared depth material on a static mesh and on a skinned animal, has a program for each, and a program's
  first draw waits for its link. On 0.1.2 the first view's preparation left 10 of the 136 programs it made unwaited,
  and a wild cat's arrival the program its skinned shadow is drawn with: the frame that first drew it in the sun's
  shadow stalled (`compileWait.ts`) ([#902](https://github.com/0xAell/Tervain/pull/902)).
- The first view is prepared with 134 shader programs where it took 181. The sun's shadow warm-up compiled the whole
  world under a fog-free stand-in scene, so every mesh that casts no shadow got a fog-free copy of its colour program,
  which no pass draws: the world always has fog. It now compiles the casters' depth programs alone (17 where it made
  64). On the software renderer the first view's preparation takes 44.6 s where it took 47.2, and a journey loads in
  62.1 s where it took 65.1 (medians of three alternating runs); on a GPU each program is driver compile time and
  memory (PR_X).

Next:

- Loading: on the four-core test machine without a GPU, `npm run perf:load` times a journey from the click to its
  first view's preparation at about 19 s: 2 s for the residents, under 1 s for the models, 1.7 s waiting for the
  ground's textures (painted in a worker), 2.9 s for the terrain, 8.6 s for the woodland and 2.4 s for paths and
  shelter; the first view then takes about 50 s more, nearly all of it the software renderer compiling shaders. The
  drawn trees' models are most of the woodland, and the leaf-island pass (`anchorLeafIslands`, run by flora.ts) 1.7 s
  of it. One tree level's wood is searched by three passes in turn (the clump snap, the card seat and the island
  pass), each building its own bounding tree over it, about 0.5 s in all. Built once, each wood's tree would be held
  from its level's build to the island pass, which runs after every level of the tree is built: about 100 bytes a
  triangle for every tree's wood at once, to save perhaps 0.3 s; holding only the latest saves only the snap's.
  Three ways to overlap the work were tried and not taken, each within the noise on that machine, whose four cores the
  work already fills: the ground's textures in three workers (0.2 s); the trees' models built while the textures are
  painted (the woodland 1.0 s shorter, the wait for the textures 1.0 s longer: a model takes up to a second and runs
  past them, and the worker slows); the terrain and the woodland built during the earlier waits. Each is worth
  measuring again on a machine with a GPU, as is building the models in workers or keeping them between visits.
- Hardware demand: the world holds 93 textures, about 600 MB uncompressed, most of them 2048² RGBA; compressed GPU
  textures (KTX2) would cut that several times. 134 shader programs are compiled before the first view (0.1.2 with
  the shadow warm-up compiling the casters alone): the world's materials under its lights, the sun's shadow pass, the
  menu's lights, the leaves' depth and shade passes and the shrine hall's panes as its window capture shows them. On a
  tour of the route and two
  rooms (`npm run perf:programs`) nine more are compiled, at noon as at night, all by the preparation of pieces that
  arrive after the world opens, before they are first drawn; none inside a draw. Fewer programs would need fewer
  distinct materials or light sets.
- Memory: at a settled journey the JavaScript heap is about 49 MB and its array buffers about 448 MB. A heap snapshot
  names the largest holders left. Rapier's memory is 100 MB. Its 1,501 colliders include 517 triangle meshes, 991,000
  triangles, 840,000 of them the planted trees' contact wood (19 meshes, each copied for every tree that uses it); in
  node Rapier keeps a triangle mesh in 20 to 45 bytes a triangle, so those take about 20 to 40 MB, and what holds the
  rest is not yet known. A lighter contact mesh would change what can be stood on. The geometry three keeps on the CPU
  after uploading it is about 200 MB, and the ground's two eight-layer textures 64 MB: three needs both again only if
  a lost WebGL context is restored, which the game does not otherwise handle, so freeing them trades that recovery for
  the memory. The procedural bark's cache (25 MB) is the same case: the pixels of textures in use, which only a
  restored context would read again.
- Draws: at High the live build's frame is 293 draw calls and 4.97 M triangles (medians over the benchmark route's
  stops, the wanderer at each; 385 and 5.10 M in 0.0.49): the forest at full detail is 57 % of its triangles, the
  water's reflection up to a third of a frame when the sea is in view (182 draws and 2.39 M at stop 11), the sun's
  shadow map 27 % of its draw calls. The cuts that keep the picture, and those a GPU must judge, are in
  [AIR-CUTS.md](../perf/AIR-CUTS.md).
- Simulation: at that village spot a fixed step takes about 1.8 to 2.8 ms on the four-core test machine (runs vary by
  a fifth). The residents' poses are nearly a third of it: the work reach, the feet planted, the hands kept out of the torso,
  the clips sampled, each 0.06 to 0.14 ms a step. The wanderer's own update is a fifth. The forest's per-step refresh
  (`flora.ts`, 0.12 ms) and the groundcover's (0.1 ms) come next. The render's own JavaScript, profiled on 0.1.2 over
  eight steady frames at each of three route stops (480×300, so that the software renderer keeps up; the JavaScript does
  not depend on the size): 10.5 ms a frame at the landing, 8.6 in the village, 11.5 with the sea in view. Three's work
  for each draw is most of it: the colour passes' draws 55 to 65 % (choosing programs and uploading uniforms as the
  material changes), the sun's shadow map about a fifth, the scene's traversal for culling about a tenth, the world's
  matrices 7 %. Fewer draw calls and material changes are what cut it.
