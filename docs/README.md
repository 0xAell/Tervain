# Tervain documentation

What is here and where to start. Most pages are dated records: they say what was decided or built at a version and are not rewritten afterwards. `package.json` holds the current version; the [decision register](decisions.md) has a row for every change since.

## Reading paths

| Reader / task | Read in order |
| --- | --- |
| Understand the game | [Vision](vision.md) → [setting](world/setting.md) → [factions](world/factions.md) → [slice](production/vertical-slice.md). |
| Design a quest | [Gameplay](design/gameplay.md) → [factions](world/factions.md) → [quests and consequences](design/quests-and-consequences.md) → [narrative](world/narrative.md). |
| Work on the browser build | [Decisions](decisions.md) → [architecture](engineering/architecture.md) → [the core](../src/core/README.md) → [prototype guide](engineering/prototype.md) → [play gate](engineering/play-gate.md). |
| Port the game to Unreal Engine | [Porting notes](unreal/README.md) → [system mapping](unreal/system-mapping.md) → [conventions](unreal/conventions.md) → [roadmap](unreal/roadmap.md) → [portable data](../data/README.md) → [asset manifest](../data/assets/README.md) → [project seed](../unreal/README.md). |
| Make environment or character art | [Art, audio and interface](art/art-audio-ui.md) → [setting](world/setting.md) → [shared assets](engineering/shared-assets.md). |
| Repaint a person | [Retexture guide](art/people-retexture.md) → [people sheets inventory](engineering/asset-inventory.md#replacement-people-sheets-008). |
| Check where an asset came from and its terms | [Model license ledger](engineering/model-licenses.md) → [asset inventory](engineering/asset-inventory.md) → [asset manifest](../data/assets/README.md) → [NOTICE](../NOTICE). |
| Check a source or assumption | [Reference ledger](references.md) → the dated upstream record named there. |
| Plan the project | [Vision](vision.md) → [roadmap](production/roadmap.md) → [decisions](decisions.md). |

## Design

- [Vision](vision.md), [decision register](decisions.md), [reference ledger](references.md).
- World: [setting](world/setting.md), [factions](world/factions.md), [narrative](world/narrative.md).
- Play: [gameplay](design/gameplay.md), [quests and consequences](design/quests-and-consequences.md).
- Art: [art, audio and interface direction](art/art-audio-ui.md), [people retexture guide](art/people-retexture.md), and dated revisions and evidence under [`art/`](art).

## Engineering

- [Architecture](engineering/architecture.md) and the [engine-agnostic core](../src/core/README.md).
- [Prototype guide](engineering/prototype.md): controls, what is implemented, and its limits.
- [Play gate](engineering/play-gate.md): the check a pull request must pass, with the latest [GPU run](perf/LATEST.md), the [Mac budget](perf/MAC-BUDGET.md) and the [cuts made toward it](perf/AIR-CUTS.md).
- Provenance and terms: [model licenses](engineering/model-licenses.md), [asset inventory](engineering/asset-inventory.md), [shared assets](engineering/shared-assets.md), [world audio](engineering/world-audio.md), [animal audio](engineering/animal-audio.md), [current score and audio hashes](engineering/tervain-audio.json), [archived 0.1.0 score](engineering/alderweir-audio.json), [archived 0.0.x menu score](engineering/menu-score.md), [menu grove score](engineering/menu-grove-score.md), [main hero](engineering/main-hero.md), [resident models](engineering/meshy-npcs.md), [solitary pine](engineering/solitary-pine.md), with their machine-readable receipts (`engineering/*.json`).
- System descriptions written at a release (`engineering/*-0.0.10.md`, `*-0.0.12.md`, `*-0.0.13.md`): water, grass, foliage, physics, rooms, residents and their rigs and motion, hunting, the weathered look.
- Change records `engineering/a70-*.md` to `a170-*.md`: one per round of work, with what was found, what changed and how it was checked. The decision register links each.

## Porting to Unreal Engine

[`unreal/`](unreal/README.md) in this folder holds the porting notes: system mapping, conventions, the engine's web target and a phased roadmap. The data and the project seed are at the repository root under `data/` and `unreal/`.

## Production

- [Roadmap](production/roadmap.md), [vertical slice](production/vertical-slice.md), [version policy](production/versioning.md).
- [Release records](production/releases) for `0.0.4` to `0.0.18`, and for [`0.0.48`](production/releases/0.0.48.md), the first milestone tagged since `0.0.5`. The versions between are recorded in the decision register and the change records.
- [Playtest records](playtests).
- The [teaser](media/teaser) and how it was made: [teaser record](production/teaser-presentable.md).
- The README's two screenshots, [the village road](media/screenshots/village-road.jpg) and [the meadow in the evening](media/screenshots/meadow-evening.jpg): frames of the `0.0.48` build on the High preset, with the interface hidden, taken on 16 November 2026 from a local build in a headless browser through the game's capture mode. The wanderer walks into the village in the morning, and through the meadow by the ford in the early evening.

## The separate Gothic 3 study

Not part of Tervain: [reconstruction method](engineering/gothic3-reconstruction-method.md), [overview](engineering/gothic3-rebuild-overview.md), [guide](engineering/gothic3-rebuild-guide.md), [workflow](engineering/gothic3-rebuild-workflow.md), [checkpoint history](engineering/gothic3-rebuilding-process.md), [browser port scope](engineering/gothic3-browser-port.md), [local-install viewer](engineering/gothic3-local.md), the [look reference](art/gothic3-reference.md), the [vegetation study](art/gothic3-vegetation-study.md) and the [video audit](art/studies/gothic3-video-2026-10-05/README.md).

## Document authority

The [decision register](decisions.md) records owner-established direction. Domain documents expand it with proposed implementation and lore. In a conflict, preserve the explicit user decision, identify the inconsistency, and update the affected documents together. A long description or precise number does not make a proposal approved or implemented.

## Shared vocabulary

- **Tervain:** selected game title; proposed local setting name. Its precise geographic scale is open.
- **Templars:** working label for our original ecological religious order; final formal name and identity are open.
- **Accord of the Wells:** proposed original founding settlement around shared water, sanctuary, and land obligations.
- **Bellwether Vale / Rillford:** proposed first-playable valley and village.
- **The Dry Bell:** proposed first complete quest.
- **Deepwood:** working label and internal habitat footprint for the `0.0.5` arrival forest; its history is not approved canon.
- **Inland waystation:** the former beach camp moved beyond the forest walk, before Rillford; it is not a new regional town or quest chain.
- **Slice:** the bounded experience in the [slice brief](production/vertical-slice.md), not the whole eventual game.
- **Target:** an intended result to test. **Measured:** a result with a build, device, settings, and procedure attached.

All of the proper nouns below the selected title are working design material. Their inclusion is permission to iterate on a coherent proposal, not a claim that naming, localization, or commercial clearance is complete.
