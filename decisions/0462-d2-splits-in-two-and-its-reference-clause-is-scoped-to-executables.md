---
Status: accepted
Date: 2026-08-16T06:23:52.002Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0462. D2 splits into un-wire and delete, and its reference clause is scoped to executable references

## Context

D2's acceptance at SPEC :555 requires "no surviving reference to mitosis.js in any skill, hook, doc or settings entry". Taken literally that is unsatisfiable and self-contradictory: 57 files reference the name, 31 of them markdown including the governing SPEC that mandates the clause, and D1 shipped block-inline-engine.mjs one MSP ago which per SPEC :541 must refuse a Workflow call NAMING mitosis.js, so the hook must retain the string to work. Separately, deleting mitosis.js reddens roughly 383 test cases: eight test files read it at module load and fail before any test registers, determinism-lint.mjs:62 declares it a census root and halts fail-closed, and mitosis-gate-core.mjs:29 targets it for phase-parity which .github/workflows/test.yml:22 runs unconditionally on every push. A blast-radius analysis concluded no ordering splits the work into two green commits, but that conclusion assumed run-engine.mjs, engine-args.mjs and ci-escalation.mjs were in scope. They are not in the SPEC's D2 file list, which names exactly seven paths; they came from a ledger watch-out. ci-escalation.mjs is not independently deletable in any case, since ci-facts.mjs:1 consumes its exports and it consumes run-engine.mjs's.

## Options

- Ship D2 as one MSP covering the SPEC paths and the three legacy modules together
- Satisfy the reference clause literally across all 57 files
- Split into D2a un-wire and D2b delete, scope the clause to executable references, and file the three legacy modules out

## Outcome

Split into two stacked MSPs on the base: D2a un-wires every consumer while mitosis.js still exists and the tree stays green, D2b deletes the file set together with the test files whose subject is gone. At SPEC scope the green intermediate that the blast-radius analysis found impossible does exist, because the three legacy modules stay put. Those modules plus mitosis-execute.js are filed as ceiling item F1, requiring a prior rehoming MSP of their own — receipts.md makes acceptance a ceiling, so a discovery above it is a new item and is never folded into the work in hand. The reference clause is scoped to EXECUTABLE references: code that reads, imports, targets or enumerates the file, test files that load it, gate targets and CI invocations. Exempt and enumerated: historical and governing markdown, block-inline-engine.mjs:5,7 where the basename is a deliberate refusal string matched by name rather than by file existence, error prose at derive-edges.mjs:43 and journal-store.mjs:22, and synthetic fixture strings under .claude/hooks/tests/.
