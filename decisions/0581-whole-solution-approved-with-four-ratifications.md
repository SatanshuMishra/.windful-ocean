---
Status: accepted
Date: 2026-08-18T19:03:28.714Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0581. The whole solution is approved: keep the pipeline, five chokepoints, sixteen MSPs

## Context

The architect lead delivered the judgment half of 0573 and one whole solution at artifacts-2026-08-18-whole-solution/whole-solution.md. Its verdict: the engine's shape is sound and its vocabulary is not, so all thirteen root causes are fixed by replacing five ad-hoc conventions with five structural chokepoints rather than by restructuring. Four questions in the document were decisions rather than derivations and needed the owner.

## Options

- Restructure into per-phase invocations with a durable phase cursor
- Keep the eight-phase single-invocation pipeline and fix the thirteen root causes as sixteen ordered MSPs
- Implement the two reports' candidate remedies as a menu without a single settled design

## Outcome

Approved the whole solution as written. ARCHITECTURE IS KEEP: twelve of thirteen root causes live strictly inside one phase body or the journal format, the thirteenth is a probe in the wrong phase whose fix is deletion, and restructuring would invalidate 126 test files to fix nothing - the rejected alternative would make every phase boundary a process boundary, which is exactly where the losses occur. The five chokepoints are a unit-state lattice, an append-only journal, one terminal-state function, evidence-typed measurement, and one wired remediation loop. Sixteen MSPs in nine waves; largest is 380 lines. Four owner ratifications, all leaving the design unchanged: the stale-lock reversal of the written never-broken-automatically rule is RATIFIED under three simultaneous conditions with EPERM read as live; the --remediate operator override for a NeedsHuman park is INCLUDED; the unwatched-CI-counts-as-shipped behaviour is KEPT as committed intent with ciUnwatchedCount merely surfaced; and the status rename is a CLEAN CUT with no deprecation window because nothing outside the repository parses the run summary. M15's fourth check is flagged in advance as an honest ladder downgrade - proving merges stay serialized needs a human to merge, since the engine structurally never merges.
