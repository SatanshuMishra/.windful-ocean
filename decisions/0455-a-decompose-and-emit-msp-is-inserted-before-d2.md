---
Status: accepted
Date: 2026-08-16T04:18:15.543Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0455. A decompose-and-emit MSP is inserted before D2 so the decomposer never dies without a replacement

## Context

D1 shipped the entry point but could not close its widened criterion 4 in full. cli.mjs reads --spec as a JSON run document carrying specs and manifest, where each unit needs id, prereqs, a full edit/read/truncated fileScope pack, and a request holding the claude -p prompt. Nothing on the stack base produces that document. The only decomposer lives inside .claude/workflows/mitosis.js at :4409-4466 with its schema at :1786-1818, and it is not liftable as written: it emits msps[] keyed on dependsOn with no request field, and it never serializes to disk - it hands the table directly to its own in-process engine at :5148. The manifest builder it feeds is recovery.mjs:108-130. D2 deletes mitosis.js wholesale. The SPEC's D-cluster order therefore destroys the only decomposer while the entry point D1 just built has nothing to feed it, leaving the base unrunnable from D2 until some later unit rebuilds the capability.

## Options

- Insert a new decompose-and-emit MSP before D2, so the run-document producer exists on the base before the file holding the old decomposer is removed
- Fold the port into D2, making one unit both delete mitosis.js and carry the new decompose-and-emit behavior
- Ship D2 as written and accept an unrunnable base across two MSPs, rebuilding the decomposer afterwards
- Investigate liftability before deciding where the port lands

## Outcome

Insert a decompose-and-emit MSP before D2. It builds a step that produces the {specs, manifest} run document cli.mjs reads, and it lands on the stack base before D2 removes mitosis.js. This preserves the green-branch invariant that makes MSPs meaningful: a capability is never deleted before its replacement exists, so no shared branch is left unrunnable between two units. Folding into D2 was refused because D2 already exceeds the review-size target as a pure deletion, and loading new behavior onto a deletion MSP is exactly the refactor-mixed-with-behavior-change the commit discipline forbids. The port is not a lift: the in-file decomposer's output shape is wrong in two ways at once - it names dependencies dependsOn rather than prereqs and it carries no request - so the new MSP authors an emitter against cli.mjs's actual reader rather than transplanting code.
