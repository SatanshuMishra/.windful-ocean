---
Status: accepted
Date: 2026-08-13T18:36:20.254Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0393. The determinism census covers the shared libs, so their entropy was removed rather than the boundary drawn around it

## Context

SPEC A4 requires a determinism gate verb over "engine source" but never defines that term, and SPEC 2.1's diagram names cli.mjs and engine.mjs, neither of which exists until D1. Scoped honestly the verb was RED on the stack base: derive-edges.mjs:220 and generate-run-script.mjs:136 both called new Date(), and ledger-lint.mjs defaulted options.now to a wall-clock read. workflow-sandbox.mjs carried the banned identifiers only inside denial-reason string literals, the canonical classifiable-versus-unclassifiable case. mitosis.js had zero hits, because the sandbox already denies Date. A boundary excluding the libs would have shipped a green verb that guaranteed nothing.

## Options

- Scope the census to mitosis.js only, which is already entropy-free and would pass immediately - rejected: a guarantee that cannot fail is worse than no guarantee
- Scope it to the deterministic libs SPEC 2.1 names, and remove their entropy so the verb is honestly green - CHOSEN
- Ship the verb red and defer the entropy removal to a later MSP - rejected: a red leg in the deployed receipts template turns the enforcer red for every PR in the stack
- Allowlist the known sites - rejected by SPEC 3.2 and by the testing rule, both of which call a pinned count or sampled allowlist a change-detector wearing a census costume

## Outcome

The census covers the shared deterministic libs, and A4 removed the entropy at source rather than around it: the derive-edges audit stamp and the generate-run-script branch prefix are now injected, and ledger-lint takes a required epoch-ms now. Entropy enters through args only, per SPEC 3.2. This is why ledger-lint's signature changed and why derive-edges takes a stamp; neither is incidental refactoring, and reverting either reopens the verb. The census halts on the unclassifiable rather than pinning a count, and an absent declared engine root is a halt at exit 42 rather than a silently narrower scope - a reviewer proved the pre-fix behaviour silently shrank the dispatch table from 7 agents to 4 when mitosis.js was moved aside. Consequence for later MSPs: any new engine-source module is subject to this census, and C-cluster and D-cluster work must take timestamps and randomness through args.
