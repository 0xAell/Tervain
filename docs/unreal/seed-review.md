# Review of the Unreal seed, 15 November 2026

A scored review of the five things this repository was reworked to provide for an Unreal Engine port, written by the
same hand that did the work, with the evidence for each score and what is missing from a ten. The scores are for the
state of `main` on the day above. Nothing here has been run in Unreal Engine; where that is what a ten needs, the
score says so.

| Requirement | Score | In one line |
| --- | --- | --- |
| [Engine-agnostic core](#1-engine-agnostic-core) | 8 / 10 | The data and rules are out of the renderer, with a boundary CI enforces. Some control flow is still in the scene layer. |
| [Asset manifest](#2-asset-manifest) | 9 / 10 | Every file has a source, a licence, a plan and a named replacement. Files with an open question are marked replace-before-ship. |
| [Unreal mapping documents](#3-unreal-mapping-documents) | 9 / 10 | Every quotation is checked against its page and every number against the data. Four sources could not be read. |
| [C++ skeleton](#4-c-skeleton) | 8 / 10 | It compiles, links and runs against stand-ins and cannot drift from the core unnoticed. It has never been built by the engine. |
| [Cleanup](#5-cleanup) | 9 / 10 | The tree is clean of private material and stays so by a CI check. Two unused pieces of scene code remain. |

## 1. Engine-agnostic core

**Score: 8 / 10.**

What is there:

- [`src/core`](../../src/core/README.md): 86 files holding the game's state and commands, its content tables, its
  rules and its world, with no import outside the folder. [`tests/core/boundary.test.ts`](../../tests/core/boundary.test.ts)
  reads every import and fails on one that leaves, and `npm run typecheck` compiles the core a second time on its own
  against the ECMAScript library alone (`tsconfig.core.json`), so a use of the DOM or of Node does not compile.
- The rules that were moved out of the renderer each have a test, and
  [`tests/core/ruleCoverage.test.ts`](../../tests/core/ruleCoverage.test.ts) fails when a rules module has none.
- The core's data is exported to [`data/`](../../data/README.md) as JSON with a schema each, the terrain as Landscape
  rasters, and DataTable-shaped files in Unreal's units. `npm run data:check` fails in CI when `data/` is not what the
  core writes today.
- Pull requests: [#775](https://github.com/ael-dev3/Tervain/pull/775), [#776](https://github.com/ael-dev3/Tervain/pull/776),
  [#777](https://github.com/ael-dev3/Tervain/pull/777), [#778](https://github.com/ael-dev3/Tervain/pull/778),
  [#784](https://github.com/ael-dev3/Tervain/pull/784).

What is missing from a ten, and the plan:

- The numbers and decisions of the player's actions, the residents' walking and the animals' behaviour are in the
  core, but the state machines that call them are still in `src/presentation/player.ts`, `actors.ts` and `animals.ts`.
  The table of interactables, the score's director with the soundscape's rules, the placing of stones, grass habitat
  and the woodland floor, and the sky's keys have since been lifted. [System mapping](system-mapping.md#still-in-the-scene-layer) lists them.
- Plan: lift them one pull request each, smallest first: the interactable table, then the player's action states (the
  port's Phase 3 needs it), the residents' route following, the animals, the music director, the placement rules, the
  sky keyframes. Each lands with its tests and without a change in the budget gate's figures.

## 2. Asset manifest

**Score: 9 / 10.**

What is there:

- [`data/assets/manifest.json`](../../data/assets/README.md): all 1,670 model, texture and sound files with source,
  licence, size, the Unreal asset each would become, and a plan: 189 to replace, 595 to keep, 886 to drop. Everything
  marked for replacement names a first-choice pack on Fab and the alternatives.
- The manifest is generated (`npm run assets:manifest`), has a schema, and `npm run assets:check` fails in CI when it
  no longer matches the files on disk.
- The 27 Fab listings it names were read on their own pages: price, licence tier, engine versions, publisher
  ([#789](https://github.com/ael-dev3/Tervain/pull/789)).
- Pull requests: [#779](https://github.com/ael-dev3/Tervain/pull/779), [#786](https://github.com/ael-dev3/Tervain/pull/786),
  [#789](https://github.com/ael-dev3/Tervain/pull/789).

What is missing from a ten, and the plan:

- Two provenance questions in the model ledger and the terms of the music are open. They no longer hold anything
  up: by the owner's decision the five files are marked [`replaceBeforeShip`](../../data/assets/README.md#replace-before-ship),
  each with a named pack, and the generator refuses a manifest that keeps such a file.
- The listings were read once. Prices and supported engine versions change.
- No pack has been opened in the engine, so whether its levels of detail suit the mobile renderer is unknown.
- Plan: the listings are read again before anything is bought; each pack's levels of detail are checked in the
  port's Phase 5 before it replaces a stand-in.

## 3. Unreal mapping documents

**Score: 9 / 10.**

What is there:

- [System mapping](system-mapping.md), [conventions](conventions.md), [the web target](web-target.md) and the
  [roadmap](roadmap.md), with an [index](README.md) that says what carries over.
- [`sources.json`](sources.json) registers 28 sources and the 70 passages and 22 table rows taken from them.
  `npm run docs:sources` read 24 of those sources on their own pages on 15 November 2026 and found every passage and
  row, including the whole mobile renderer table. The check corrected the documents in six places.
- In CI, [`tests/tooling/docSources.test.ts`](../../tests/tooling/docSources.test.ts) fails on a quotation without a
  source, [`tests/tooling/docNumbers.test.ts`](../../tests/tooling/docNumbers.test.ts) compares every number about this
  repository with its data and fails on a bare number, and
  [`tests/tooling/docLinks.test.ts`](../../tests/tooling/docLinks.test.ts) follows every link, anchor and file name.
- Pull requests: [#780](https://github.com/ael-dev3/Tervain/pull/780), [#794](https://github.com/ael-dev3/Tervain/pull/794).

What is missing from a ten, and the plan:

- Four sources could not be read from where this was written: Epic's forum announcement of the 5.9 preview, Epic's
  Unreal Engine 6 post, the third-party tests of the web target, and GitHub's page of Pages limits. The documents say
  that what comes from them is reported, and a test fails if that is removed, but it is not checked.
- Unreal Engine 5.9 is a preview. What is written about its web target can change at release.
- Plan: read the four sources where they can be reached, mark them as read in the register and run
  `npm run docs:sources`; run it again when 5.9 is released and correct the web target page.

## 4. C++ skeleton

**Score: 8 / 10.**

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
- Pull requests: [#781](https://github.com/ael-dev3/Tervain/pull/781), [#790](https://github.com/ael-dev3/Tervain/pull/790),
  [#792](https://github.com/ael-dev3/Tervain/pull/792).

What is missing from a ten, and the plan:

- It has never been built by Unreal's build tool or opened in the editor. The stand-ins were written from the engine's
  public API as understood here and were not checked against the engine's headers or Epic's API reference, which
  could not be reached. The reflection markup, the build files and the project file are read only by the engine's own
  tools. A wrong signature or a missing include can still turn up.
- Plan: the roadmap's Phase 1, on a machine with the engine: build the editor target, fix what the compiler finds,
  keep the fixes here, and import the tables and the Landscape. No amount of work in this repository replaces that
  step.

## 5. Cleanup

**Score: 9 / 10.**

What is there:

- About 2,120 files of superseded records, proofs and clutter removed, 30 unused exports deleted, and the README and
  the documents' index rewritten for a reader new to the project
  ([#782](https://github.com/ael-dev3/Tervain/pull/782), [#783](https://github.com/ael-dev3/Tervain/pull/783)).
- Private material removed from the tree: personal paths, account wording, tool and working-branch names, in the game's
  documents and in the separate Gothic 3 study ([#785](https://github.com/ael-dev3/Tervain/pull/785),
  [#787](https://github.com/ael-dev3/Tervain/pull/787), [#788](https://github.com/ael-dev3/Tervain/pull/788)).
- It stays clean: the CI job *Hygiene* fails a pull request whose commits, added lines, title, description or branch
  name carry a mailbox identity, a session link, a host name, a network address, a home or temporary path, or a key
  ([#795](https://github.com/ael-dev3/Tervain/pull/795)). On its first run it caught a session link that the tool
  which opens pull requests had put into a description. The same rules run over all 69,650 text files of the tree
  found none of those.

What is missing from a ten, and the plan:

- The two pieces of scene code that were built and tested but unused have been removed with the records and tests
  that named them: the prepared broadleaf with its model, and the asset library hook with its empty lists of needs.
- The Gothic 3 study is most of the repository's files. It stays in this repository by the owner's decision, as a
  separate project: no file of the game imports it or is imported by it, it is compiled and tested as its own project
  in its own CI jobs, and the seed's checks do not cover it
  ([`tests/tooling/gothic3Study.test.ts`](../../tests/tooling/gothic3Study.test.ts) fails when any of that changes).

## How the seed was verified

- **The play gate.** Its chance failures had one cause, found on 15 November 2026: on a software renderer the game's
  first view can outlast the browser's GPU watchdog, which kills the GPU process, and the page loses its graphics
  context. The gate now starts its browser without the watchdog and reports a failed load at once
  ([#791](https://github.com/ael-dev3/Tervain/pull/791), [#793](https://github.com/ael-dev3/Tervain/pull/793);
  [the record](../perf/LATEST.md)). Five runs on `main` in a row passed afterwards, fifteen loads, with no GPU process
  exit in the browser's log.
- **A clean checkout.** A fresh clone of `main` (82,461 files) installs, typechecks, passes the data and manifest
  checks, builds, and passes the whole test suite: 524 files, 5,172 tests, 1 skipped
  ([#797](https://github.com/ael-dev3/Tervain/pull/797)). Its one finding, four advisories in the development
  tooling, was fixed in the pull request that followed by updating Vite and Vitest in the lockfile.
- **The published build.** After every deploy, CI plays the live build: it must load, draw, pause and resume, walk and
  log no error (`npm run smoke:live`, [#797](https://github.com/ael-dev3/Tervain/pull/797)).
- **One loose end.** `tests/presentation/npcSchedules.test.ts` failed once in CI on a pull request that did not touch
  it and passed on the re-run. It could not be reproduced and is unexplained. If it recurs it needs that run's log.
