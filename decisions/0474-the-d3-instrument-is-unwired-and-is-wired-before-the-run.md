---
Status: accepted
Date: 2026-08-16T18:14:05.136Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0474. The D3 instrument is unwired end to end, and is wired as its own MSP before any engine run

## Context

0473 commissioned one real engine run before ruling c7. Mapping what such a run requires found that the instrument D3 shipped is not connected. run-store.recordUsage exists at run-store.mjs:298 and its only non-test references are its own definition and its export in the returned handle, confirmed by a single grep over .claude/lib excluding tests; cli.mjs imports only execAllowed from that module and never openRun. engine.mjs's tickDispatcher at :39-46 returns only ok and outcome, discarding the Done envelope before pool.mjs's ledger can carry it, so every terminal record in a real cli.mjs run holds envelope null whatever the child reported. cli.mjs's realPorts.runUnit at :180-191 forwards the envelope on the success path only. The one seam genuinely wired end to end is decompose-emit.mjs, which threads the envelope to its own stdout and no further. 0466's premise that run-store can write per-attempt usage is true of the writer and false of the call path. Separately, the falsifier is a dispatch COUNT rather than a token measurement, and no durable dispatch record exists either: the count is observable only by capturing cli.mjs's stdout live, and its units array carries one entry per unit rather than per dispatch, so retries and redispatches go uncounted in the direction that would make the gate falsely pass. A second finding bounds the run's blast radius: cli.mjs takes seven flags and runs to quiescence in one shot with no phase, until or dry-run boundary, so a run that reaches Ship opens a real pull request, while merging stays blocked at three independent layers and the engine builds no gh pr merge argv anywhere.

## Options

- Commission the run now and capture cli.mjs stdout live for the count
- Run decompose-emit alone first as a zero-side-effect smoke test and defer the wiring
- Wire the instrument as its own MSP before any run, then smoke test, then run

## Outcome

The instrument is wired as its own new item before any engine run. Under receipts the discovery is filed as a NEW criterion rather than folded into c6 or c7, neither of which reopens to absorb it. The MSP connects tickDispatcher to the envelope, calls recordUsage from the engine dispatch path, and records dispatches durably per attempt so the ratio is computable after the fact rather than only from a live stdout capture. It is hand-shipped rather than run through mitosis, because 0378 prohibits mitosis as the engine of its own replacement. Running without the wiring was rejected because it would burn the single clean first-run opportunity on a count that undercounts retries and carries no token or cost data at all. The eventual full run executes against a disposable clone as --repo-root, never the primary checkout, because the engine's transcribed git steps run switch, rebase and push directly against whatever --repo-root names and no code guard refuses a shared checkout, while ~/.claude rules, CLAUDE.md and skills are symlinks into the primary checkout's working tree. Any pull request the run opens lands on the real repository and is closed by hand. One honest limit is recorded now rather than discovered later: a single-unit run yields n=1 while 0358 binds a baseline to three runs at pinned state, so c7 is expected to resolve as evaluated at n=1 rather than as a binding baseline.
