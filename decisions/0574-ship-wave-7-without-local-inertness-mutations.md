---
Status: accepted
Date: 2026-08-18T17:31:33.056Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0574. Ship wave 7 with the inertness mutations unrun, and G14 did not stand in for them

## Context

Wave 7 was committed as 8395cf83 and the suite was green at 3082 tests / 3080 pass / 0 fail with pinned duckdb v1.5.5. The two owed inertness mutations could not be run: six consecutive API 529 Overloaded errors tore down two successive subagents, surviving a deliberate 150s backoff and a switch to short single-purpose turns. The tree was re-derived from git as clean after every teardown, so no work was lost and no mutation residue existed.

## Options

- Keep waiting and retrying until a subagent survives long enough to produce the local mutation pair, holding the push open-ended
- Ship now with the mutations declared not-verified, on the reasoning that the receipts enforcer re-runs G14 (block mode, max_mutants 12) at the pull request
- Have the main thread run the mutation experiment directly, bending the delegation-discipline rule that the orchestrator never performs

## Outcome

The user chose to ship. PR 212 opened via pr.mjs pr-create carrying "Not verified: local inertness mutations for the deletion and the test repair - not run"; every CI check passed, and the merged wave-6 remote branch was deleted with the ref proven gone. The reasoning behind the choice then failed: receipts returned "PASS - no production source changed (docs / tests / config only) - nothing to re-verify", so G14 never ran and never refereed the mutations. The enforcer does not classify .claude/agents/*.md or test files as production source. Inertness of both the deletion and the test repair therefore stands as unverified-reasoned, answered by no check, local or CI, and the ladder downgrade is real rather than a formality. Merge awaits a human.
