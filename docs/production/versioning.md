# Version policy

The owner authorized **0.1.0** for the Alderweir patch, led by Astra 6.2 Ultra. All Astra 6.2 development takes place on `0.1.x`. Subsequent patches use `0.1.1`, `0.1.2` and so on. **Moving to `0.2.0` or any later series requires the project owner’s explicit authorization.**

## Builds and releases

`package.json` supplies the version shown on the title screen, in debug and benchmark reports and in save build stamps. Vite checks the approved series and both root version entries in `package-lock.json`. Save compatibility is controlled separately by `SAVE_FORMAT_VERSION`.

The browser prototype is the current playable target. Pull requests follow the [play gate](../engineering/play-gate.md). After deployment, verify the version and source revision on the [hosted build](https://0xaell.github.io/Tervain/).

Patch numbers identify builds. For a milestone, the Release workflow uses the [release record](releases) for the version on a checked commit of `main` to create a GitHub pre-release. The earlier `0.0.x` records and tags retain their original meaning, including [v0.0.48](releases/0.0.48.md).

## Evidence for a future milestone

The following criteria were proposed during `0.0.x` and remain available for the owner’s review.

- Complete the 30–45 minute [vertical slice](vertical-slice.md) and verify its acceptance scenarios.
- Resolve defects that break progress, controls or save and reload. Record remaining limitations against the candidate.
- Review art, animation, sound, interface and readability together in play.
- Run an independent playtest and address major comprehension and usability findings.
- Package the selected desktop target and measure performance and compatibility on a named reference machine.
