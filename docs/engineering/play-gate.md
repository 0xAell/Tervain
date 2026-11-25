# The play gate

Unit tests and the benchmark laps passed while the hosted build flickered and stuttered in real play. The play gate
plays the game the way a player does and fails on what a player would see. No change counts as done until the gate
passes on the live build.

    npm run play-gate                     # live build, checked against main, both profiles
    npm run play-gate -- --url http://127.0.0.1:4173/ --against head   # a local preview of the checked-out commit

## A required check

Every pull request needs a `play-gate: PASS <head commit>` line, pasted into its description or a comment. The
**Play gate** workflow looks for that line for the current head commit and sets the `play-gate` status, which branch
protection on `main` requires. Every new push to the pull request needs a new run. Build and preview the head first
(`npm run build`, then `npm run preview`, which serves it at `http://127.0.0.1:4173/`); either of two runs gives the line
when it passes:

- **The budget gate**, the rule every pull request has been held to since 18 October 2026
  ([the rule and why](../perf/LATEST.md#the-play-gates-rule-from-2026-10-18)):

      npm run play-gate -- --budget-url https://0xaell.github.io/Tervain/ --url http://127.0.0.1:4173/ --head <head commit>

  It loads the live build twice and the head once at the same spot. Each visit records the first four completed
  frames after the 15-second warm-up, with the animal and figure IDs present in each frame. It returns to the
  starting view while models stream, then repeats the placement and records four more frames. This second
  sample requires furniture, all 19 animals and the full cast from the exported game data, including residents
  away from the camera. The live build uses its own cast manifest and waits for its complete wildlife group to
  attach. The head must match the checked-in game exports. The gate reports different complete rosters as
  incomparable. A missing model or stalled arrival fails the check.

  The original early ceiling always applies: the candidate's maximum across all four early frames must fit
  the larger of the two live maxima, even if different models have arrived. When both visits encountered the
  same early population, its budget is checked as well. The fully streamed frames must independently fit
  the fully streamed live budget. The report names each comparison. In both
  stages, the head's draw calls and triangles must stay within the live maxima, both builds must be free of
  console errors and the page must serve the head's revision. It counts
  rather than times, so a machine without a GPU can run it on a software renderer: start it under a virtual display
  (`xvfb-run -a npm run play-gate -- ...`), and behind a proxy with `NODE_USE_ENV_PROXY=1`, so that it reaches the
  live build.
- **The clip run**, on a machine with a GPU: `npm run play-gate -- --url http://127.0.0.1:4173/ --against head`. It
  plays the head with real input, as described below. Use this route for the isometric release. Its Canvas sprite passes and water shader use different rendering primitives from the preceding 3D build.

After the merge, CI's `live-smoke` job plays the published build, and `npm run play-gate` runs the clip run on the
live build once the deploy lands. Run it on an otherwise idle machine with a visible Chrome window: other work running
alongside skews frame times.

## What it does

1. **Stale build check.** The hosted build's `version.json` must name the commit on `main`, and the title screen must
   print it. A stale deploy or a page the browser kept from before fails before anything is played.
2. **Real play with real input** (key and mouse events through the browser): New journey from the title menu, pause
   and resume, walk then run along the fence and around the house turning the camera, inside a house looking out of the
   window, then aim and loose the bow twice. Only placing the hero at the start of each stage is scripted.
3. **Every presented frame** records its vsync-aligned time, whether the hero is drawn, the camera distance, the
   hero's pose (root upright, head height above the root), where his hips land on screen and the drawing pixel ratio.
   Long tasks and console errors are collected, and the screen is recorded to `clip.mp4` (`--video false` skips it).

The isometric route walks and runs on the Grey Strand, clicks onto the Rillford bridge, walks the riverbank, enters a house through its marked front door, walks through the hall, clicks the stairs to the loft and fires two arrows back outside. Its sampler observes the hero’s actual sprite blit on the final canvas and measures its orientation, visible height and screen position. The gate also checks for a hardware water context, movement, arrival on the selected deck and ammunition consumed. The two display profiles and frame-time checks apply to both editions.

## What fails it

| Check | Limit |
| --- | --- |
| Hero hidden while the camera is clear of him | any frame |
| Hero visibility flipping | more than 4 flips within one second |
| Hero pose broken (root tilted, head under 0.8 m above the root) | any frame, except swimming |
| Hero jumping across the screen between frames | any frame within a stage |
| 95th-percentile frame | over 20 ms |
| Frames over 50 ms | more than 2, or any over 100 ms |
| Frames over 25 ms (a missed refresh) | more than 3% |
| Long tasks in play | more than 3, or any over 100 ms |
| Console errors or exceptions | any |

## Profiles

- `desktop`: a 1280×720 window at 1×.
- `mac`: a MacBook's 1440×900 window at 2× (the Retina pixel count). The test machine's GPU is much faster than an
  Apple laptop's, so this profile shows the cost of Retina resolution, not an Apple GPU. The game's dynamic resolution
  covers a weaker GPU. `--mac-cpu 2` adds a main thread slowed by half as a stress case.

Each run writes `<out>/<tag>.md` and `<tag>.json`, and a folder per profile with `clip.mp4` and the per-frame samples.

## Live GPU log

Every run also writes `<tag>-log.md`: for each profile the frame-time p50, p95, p99 and max, the frames over 25 and
50 ms, the main thread's idle share (time from an animation frame's start to its draw, against the frame interval), the
bytes uploaded to the GPU (buffers and textures) in play and in the worst frame, the glitched frames, and a table of the
slow frames with their stage, main-thread time and uploads. The first eight slow frames also get a 480×270 still of what
was on screen, with the hero's and camera's positions (`spike-N.jpg`); the frame after a still carries its cost and is
left out of the timing.

`node tools/publish-gate.mjs --tag <tag>` publishes it: the stills and clips go to the `gate-media` branch (media only;
no workflow runs on it) and the log is posted on the pinned issue "Live GPU gate data" with links pinned to that
commit. Timing runs record no video, so `--clips <tag>` links the clips of a recorded run of the same build. Every GPU
run of the gate is published this way, so slow frames can be chased from real data.
