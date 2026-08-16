---
Status: accepted
Date: 2026-08-16T23:34:49.320Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0489. The n=1 run clears the falsifier at 1.0 dispatches per unit, with the vacuity caveat in the verdict

## Context

The first real mitosis engine run in the project's history completed on 2026-08-16 against a disposable substrate. Both units reached done, the run reached quiescence cleanly (quiescent true, aborted false, outstanding false), and usage.jsonl carried two billed lines with zero unbilled. Checkpoint refs refs/mitosis/7c1a9f0e/* match the branch tips and the journal's built shas exactly, and both children produced real commits whose tests assert the spec's literal examples: formatDuration(120) is 2m, formatDuration(90) is 1m30s, slugify of a double-hyphen string is a-b. The predicted non-zero exit did not occur: the CLI caught the failing terminal gh pr view internally and surfaced it as a structured prState.status of 1 while the process itself exited 0, which refines the expectation recorded before the run.

## Options

- Record cleared at n=1 with the vacuity caveat inside the verdict
- Record cleared without the caveat
- Treat n=1 as insufficient evidence and hold c7 open

## Outcome

c7 resolves CLEARED at n=1. Measured: two billed usage lines over two units in state done gives 1.0 dispatches per shipped unit against a ceiling of 10. Cold versus warm, finally separated from real data: slugify 85853 cold and 1151513 warm, format-duration 87587 cold and 1328844 warm, so warm cache reads dominate by more than an order of magnitude. Cost was 0.9339519 and 0.9932472 USD for the two units plus 0.569784 for the decompose child, about 2.50 USD for two trivial units across three dispatches, at 17 and 18 turns with 6 for the decompose. The caveat sits in the verdict rather than a footnote: cli.mjs has exactly one claude-spawning site per unit and no plan, review, security, fix or redispatch stage in its import closure, so 1.0 is the structural floor and clearing a ceiling written for a richer engine proves nothing about thrash under load. The paired quality assertion holds: both units' scoped check ran green in the journal's built entries and both commits carry tests asserting the spec's literal examples. Under c7's text a cleared falsifier permits feat/mitosis-os-process to merge to main, and that merge stays a human action.
