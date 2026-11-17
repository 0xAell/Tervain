# Contributing to Tervain

Tervain is a playable browser prototype and the seed of an Unreal Engine port ([README](README.md)). Contributions should make the next production decision or playable milestone more concrete.

## Read before working

1. [Vision](docs/vision.md) for the intended experience.
2. [Decision register](docs/decisions.md) for the distinction between accepted direction and working proposals.
3. [Vertical slice](docs/production/vertical-slice.md) for the first bounded delivery.
4. The relevant design document and its linked dependencies.

## Proposing a change

Explain the player problem, the proposed behavior, the smallest useful implementation, and how we can evaluate it. For a narrative change, identify affected faction motives, quest evidence, and later consequences. For an asset change, identify its source, intended use, and verification state.

Use stable identifiers for quest facts and content once implementation begins. Display names may change without silently breaking saves. Working names in this seed are not an instruction to freeze every proper noun.

## Reviews and validation

- Keep a change focused enough to review as a coherent experience or decision.
- Include the relevant build, scenario, screenshot, or measurement when one exists.
- Preserve explicit costs and alternate outcomes in quests; avoid making a hidden perfect branch invalidate every other choice.
- Check controller navigation, text readability, and save behavior alongside the main interaction when they are affected.
- Test on the packaged target when packaging or runtime behavior changes; browser success alone is not desktop proof.
- For documentation-only changes, verify links, consistency, and clean diffs without pretending to run a game.
- After a merge, CI plays the published build once it is live (`live-smoke`: it must load, draw, take input and log no error). `npm run smoke:live` runs the same test against the live link from any machine with a browser.
- Preserve required checks, workflow triggers, and deployment behavior. Passing local checks or pushing a commit does not establish that a release is live; verify the published build separately.

## Checks before a pull request

CI runs these on every pull request; running them first saves a round trip. `npm run check` runs the game's typecheck
and tests, the check of the exported data and the hygiene check in turn; the C++ check and the play gate are separate.

- `npm run typecheck:game` and `npm run test:game`: the game and the port seed. `npm run typecheck` and `npm test` add the separate Gothic 3 study and take much longer.
- `npm run unreal:check`: the exported data matches the core, and the Unreal ids, row structs, mirrored rules and C++ seed agree with it. After changing the core's content, `npm run data:export` regenerates `data/`; after adding or changing a shipped file, `npm run assets:manifest` regenerates the asset manifest and `node tools/model-files.mjs` the model table.
- `npm run hygiene:check -- --base origin/main`: nothing private in the new commits (below).
- The play gate on the pull request's head, which branch protection requires: `npm run build`, `npm run preview`, then `npm run play-gate -- --budget-url https://0xaell.github.io/Tervain/ --url http://127.0.0.1:4173/ --head <head commit>`, and its last line, `play-gate: PASS <commit>`, in the pull request's description or a comment. [The play gate](docs/engineering/play-gate.md) says how to run it without a GPU.

## A public repository

This repository is public, so a pull request must not add anything private to it. CI checks every pull request (*Hygiene / Nothing private in new commits*), and `npm run hygiene:check -- --base origin/main` runs the same check before a push:

- Commit with a GitHub no-reply address as both author and committer: `git config user.email "<id>+<login>@users.noreply.github.com"`.
- Keep links to working sessions, machine host names, network addresses, paths inside a home or temporary folder, and keys or tokens out of commit messages, pull request titles and descriptions, branch names and committed files.

Only what a pull request adds is checked; history is left as it is. The rules and their examples are in `tools/commit-hygiene.mjs` and `tests/tooling/commitHygiene.test.ts`.

## Shared work and assets

Keep reusable art sources and provenance discoverable in Warpkeep-Assets when appropriate; keep Tervain's selected runtime inventory and transformations in this repository. Record exact upstream revisions rather than assuming a floating branch stays compatible. Avoid copying generated client bindings, private world exports, accounts, or deployment machinery from Warpkeep into a local RPG.

Before contributing code or assets, check [LICENSE-SCOPE.md](LICENSE-SCOPE.md), [NOTICE](NOTICE), and the relevant file headers and provenance records. The PolyForm Noncommercial license covers only eligible original Tervain software code; separately licensed code and externally governed assets keep their terms. Contributions remain subject to their authors' rights unless a separate permission says otherwise. Submitting a contribution does not assign copyright or authorize relicensing by itself.
