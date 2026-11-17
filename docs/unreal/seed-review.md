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
in the [roadmap](roadmap.md); the seed mirrors two of them as a worked example.

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
  settings, a data subsystem that reads the tuning values, and two rules mirrored as a worked example.
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
  elsewhere, and the woodland floor, the export's trees and the Unreal tables followed it (PR_FOREST).

Next:

- The woodland floor the core exports is laid with an estimate of the crowns' shade, the game's with the drawn crowns
  themselves; check whether the two agree, and export the one that is played.
- Loading: building the 25 tree models is about 13 s of the woodland stage on a four-core machine without a GPU. The canopy atlas
  painter, the nearest-wood search and the procedural bark and water textures can do the same work in less time.
- Hardware demand: the world holds 93 textures, about 600 MB uncompressed, most of them 2048² RGBA, and compiles 230
  shader programs before the first view.
