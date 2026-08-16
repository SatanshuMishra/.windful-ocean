---
Status: accepted
Date: 2026-08-16T06:57:46.916Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0465. D3 ships the plumbing and a labelled proxy, because no engine run has ever existed to measure

## Context

Reconnaissance established that D3's gap is missing OBSERVATIONS, not a missing aggregation. The instrument is built and complete: captureEnvelope at dispatch.mjs:570-593 returns input and output tokens, both cache fields and total_cost_usd, surfaced on the verdict at :714-715. It is wired to nothing. pool.mjs:290 narrows the verdict to ok and outcome, and all three production consumers — pool.mjs, decompose-emit.mjs and cli.mjs — discard the envelope. run-store's recordStart, recordOutput and commitState have zero non-test callers. Not one journal byte exists: no .mitosis directory in the repo, in any of 27 worktrees, or in any external checkout, and no gitignore entry the writer would have added. There has never been an engine run, so the falsifier's denominator does not exist. The only real dispatch series is the agent-ledger at 15,498 agent_run rows, but it counts human-orchestrated dispatches rather than engine dispatches, carries no cache split and no cost, reports a session-cumulative token watermark that three concurrent rows repeat identically, loses 55.5 percent of attribution to agent_type unknown, has no MSP key, and includes 264 rows from a different project. The 2026-07-17 baseline is a code-read cost model by its own confidence legend, not a billing export, describing a 3,699-line file that no longer exists in that form, and decision 0358 already binds a baseline to at least three runs at pinned repository state reporting variance. Separately the SPEC's claim at :573 that .claude/reports/ is git-tracked is false: .gitignore:11 ignores it, and that ignore landed three days after the baseline report and three weeks before the SPEC asserted otherwise.

## Options

- Publish the agent-ledger dispatch counts as the falsifier measurement
- Defer D3 entirely until an engine run exists to measure
- Ship the plumbing plus a labelled proxy, and downgrade every unmeasurable claim explicitly

## Outcome

D3 ships three things and claims nothing further. First, the plumbing that makes the NEXT run measurable: widen pool.mjs finish and ledger.settle to carry verdict.envelope through to the frozen record, retain it in decompose-emit.mjs and cli.mjs, and add a per-attempt usage writer to run-store.mjs rather than a new module, which also sidesteps the standalone-module liveness requirement since run-store already owns a CLI entrypoint. Any aggregation must take its timestamp as a validated argument, because a clock read reddens the determinism verb. Second, the agent-ledger dispatch-count PROXY, labelled a proxy in its first paragraph, with all six limitations stated up front, and filtered to project .windful-ocean before anything is rendered — 264 rows in the measurement window carry a confidential cross-project codename and an unfiltered count or cwd histogram would leak it into a tracked artifact. Third, the per-MSP CI check matrix as the fixed quality assertion, with post-merge rework count secondary: both are declared before the work, already recorded for all 41 merged PRs, and genuinely able to go red. Explicitly downgraded unverified-reasoned: the 10-dispatch falsifier itself, all four token metrics, total_cost_usd, the cold-versus-warm cache split, and the baseline comparison. The report lands under .claude/docs/, which is tracked, rather than .claude/reports/, which is ignored and would make the deliverable invisible to the enforcer and to a fresh clone.
