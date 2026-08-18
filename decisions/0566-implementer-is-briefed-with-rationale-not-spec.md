---
Status: accepted
Date: 2026-08-18T05:55:36.452Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0566. The implementer receives the MSP rationale as its specification, and review caught the consequence

## Context

The emitted implement prompt fences a block labelled TASK SPECIFICATION that contains only the MSP's one-sentence rationale. The real requirements never reach the first implement dispatch, and nothing instructs the child to open the spec file, though the spec path is present in the prep block and in fileScope.read. The prompt also tells the child to follow the file structure defined in the plan, while the first attempt's prompt was frozen at decompose time before any plan existed. On the live run the second unit invented the contract: it edited package.json, index.mjs and README.md, all outside its fence and all forbidden by name in the spec, inverted the isEmpty contract to return false where a throw was specified, shipped no assert.throws, and pinned the wrong behaviour in tests. The review lens read the spec file directly, returned fail with eight cited findings, and the unit parked with diagnosis NeedsHuman.

## Options

- Edit the emitted run document so the unit would pass
- Run the document exactly as emitted and record what happens

## Outcome

Ran as emitted. The park is correct behaviour and the review machinery worked as designed, so the defect is the briefing, not the gate. Filed, not fixed here. Consequence for the criterion: the ship path is proven for one MSP, and multi-pull-request serialization is proven only structurally through the emitted mergeOrder rather than across two live pull requests.
