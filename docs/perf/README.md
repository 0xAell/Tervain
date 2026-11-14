# Performance records

What is kept here:

- [LATEST.md](LATEST.md): the most recent play-gate run on a GPU machine. `tools/publish-gate.mjs --latest` rewrites it.
- [MAC-BUDGET.md](MAC-BUDGET.md): the frame budget for a MacBook Air at the High preset, and how to measure against it.
- [AIR-CUTS.md](AIR-CUTS.md): the cuts made toward that budget and where the remaining time goes.

The [play gate](../engineering/play-gate.md) describes the check itself.

Until November 2026 this folder also held a short record for each performance or correctness fix (about 270 pages),
with captures, traces and clips under `docs/perf/proofs` and a top-level `proofs/` folder, and the one-off scripts that
produced them under `tools/repro-*.mjs`. They described the Three.js renderer change by change and were removed from
the working tree to keep it small; nothing in the build or the tests read them. They remain in the repository's
history:

```sh
git log --diff-filter=D --format=%H -1 -- docs/perf/GRASS-CATCHUP.md   # the commit that removed them
git show <that commit>^:docs/perf/GRASS-CATCHUP.md                     # any record, as it was
```
