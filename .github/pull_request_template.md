## What changed and why

## Checks

- [ ] `npm run typecheck` and `npm test`
- [ ] **Play gate on this pull request's head** (required check): build and preview the head, then run the budget gate,
      `npm run play-gate -- --budget-url https://0xaell.github.io/Tervain/ --url http://127.0.0.1:4173/ --head <head commit>`,
      or on a machine with a GPU the clip run, `npm run play-gate -- --url http://127.0.0.1:4173/ --against head`
      (see `docs/engineering/play-gate.md`). Paste the summary below; it must end with
      `play-gate: PASS <head commit>`. A change that alters how the game looks or plays also attaches before/after clips.
- [ ] **After the merge:** the `live-smoke` job on `main`, and `npm run play-gate` against the live build once the deploy lands.

```
play gate summary
```
