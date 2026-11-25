# Version policy

The owner authorized **0.1.0** for the Alderweir patch, led by Astra 6.2 Ultra. All Astra 6.2 development takes place on `0.1.x`. The original-art rebuild shipped as `0.1.1`. The valley, character and rendering update shipped as `0.1.2`. The Grey Strand, jumping and camera update was `0.1.3`. The isometric Bellwether riverlands release is [`0.1.4`](releases/0.1.4.md). The household interiors release is [`0.1.5`](releases/0.1.5.md). The fieldcraft release is [`0.1.6`](releases/0.1.6.md). The spoken-vale release is [`0.1.7`](releases/0.1.7.md). The terrain and household relief release is [`0.1.8`](releases/0.1.8.md). The loose-object physics release is [`0.1.9`](releases/0.1.9.md). The in-world voice and room acoustics release is [`0.1.10`](releases/0.1.10.md). The world-only narration update is [`0.1.11`](releases/0.1.11.md). The wagon road and optional interface narration release is [`0.1.12`](releases/0.1.12.md). **Moving to `0.2.0` or any later series requires the project owner’s explicit authorization.**

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
