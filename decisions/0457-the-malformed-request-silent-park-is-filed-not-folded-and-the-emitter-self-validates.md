---
Status: accepted
Date: 2026-08-16T04:45:12.918Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0457. The malformed-request silent park is filed as its own MSP, and the emitter validates its own output

## Context

Orientation against the stack base found a fail-open defect in code D1 already shipped, verified end to end on a two-unit document. A unit whose request is missing or is not an object makes requireUnitRequest throw a TypeError inside ports.runUnit (cli.mjs:132-138); pool.mjs catches it and settles the node threw; joinTick returns null and dispositionOf reports parked. The pool's error note reaches onRecord, but engineRequest (cli.mjs:88-101) never sets onRecord, so engine.mjs:196 passes undefined and the message is dropped entirely. The run exits 3 with empty stderr, indistinguishable from a legitimate human-escalation park. The same swallow covers every dispatch.mjs validation failure, so a malformed prompt, model, cwd or timeoutMs is equally silent. This matters to the decompose-and-emit MSP because that MSP becomes the only producer of run documents, and it gets no feedback from the CLI when it produces a bad one.

## Options

- File the swallow as a new item and require the emitter to validate its own output before writing
- Fold the onRecord fix into the decompose-and-emit MSP, widening it the way 0454 widened D1
- Require emitter self-validation only, leaving the swallow undocumented and unfiled

## Outcome

File it, do not fold it. G0 makes acceptance a ceiling: the defect sits above the criterion 0455 declared for this unit, so it becomes a new item on the stack rather than scope added to work already estimated against a different bar. It is filed as its own planned criterion and will ship as its own MSP. Separately, and inside the decompose-and-emit MSP's own scope, the composer must refuse to emit an invalid document rather than trusting the CLI to report one: it validates against the real validators - requireFileScopePack, the dispatch request rules, the pool id pattern, the prereq closure - and throws a named refusal instead of returning a document that would park silently. That covers the risk from the producing side while the consuming side waits its turn. Fold-in was refused because it repeats the pattern the ceiling rule exists to stop; self-validation alone was refused because a hand-written run document would still hit the swallow undocumented.
