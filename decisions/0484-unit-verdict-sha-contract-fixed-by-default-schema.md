---
Status: accepted
Date: 2026-08-16T21:54:00.790Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0484. The unit verdict sha contract is fixed by a default schema conditioned on isolation mode

## Context

The engine could not complete a single unit, and no decision record had caught it. A probe established empirically that claude -p --output-format json omits structured_output entirely when no --json-schema is passed. The chain: decompose-emit.mjs:114-119 UNIT_DEFAULT_FIELDS exposes only agentType, model, effort and timeoutMs, so unitDefaults never sets schema; dispatch.mjs:193 therefore sets schemaText null for every unit; dispatch.mjs:234-236 appends --json-schema only when schemaText is non-null; cli.mjs:168-172 shaOfVerdict finds no structured object and returns null; cli.mjs:157-162 requireSha throws when writeRef fires. Every unit settles failed and the CLI exits 3. No production run had ever exercised the seam because the only success-path test stubs the verdict at tests/cli.test.mjs:140. This is a new item discovered above the acceptance ceiling, not a fold-in to c6 or c7, but it gates c6: without it the falsifier denominator is zero again and a run reproduces 0466 at full cost.

## Options

- Attach a default unit verdict schema requiring sha, conditioned on isolation mode
- Derive the sha from the repository via git after the child commits
- Both a default schema and git verification, reconciled
- Add a --unit-schema flag with no default
- Make requireSha tolerate a null sha

## Outcome

A hardcoded UNIT_VERDICT_SCHEMA (required sha, additionalProperties false, 40-hex pattern) is attached in unitDefaults only when isolation is worktree. The isolation condition is load-bearing, not scope-trimming: prompt-execute.mjs:60 forbids scope-fence children from any git mutation, so a blanket schema would compel a child to fabricate a sha it is barred from producing; prompt-execute.mjs:74 is the only branch that instructs a commit. The fix activates the already-dead guard at dispatch.mjs:669-671, so a child that commits nothing parks as NeedsHuman and never reaches Done, keeping requireSha a genuine invariant rather than a fail-open. The defect was a missing entry in one lookup table, not a missing capability: schema was already a legal request key at run-document.mjs:9. Git-derived sha rejected because the unit spec carries no branch field and an empty branch yields the base sha, a checkpoint that looks valid and carries no work, while leaving the dispatch guard dead. A --unit-schema flag rejected as actively wrong: a caller could substitute a schema without sha and reinstate the throw, and the sha contract is what requireSha demands, not a caller-tunable option. Shipped as stacked PR #147 on feat/d3-instrument-wiring with a red-on-parent acceptance test asserting the reported symptom, an inertness mutation, and all four gate verbs green. Two new items filed and not fixed: scope-fence units cannot checkpoint at all (engine.mjs:204-205 versus prompt-execute.mjs:60), and a legacy duplicate implement prompt at run-engine.mjs:324,335 still carries the old no-sha report line.
