---
Status: accepted
Date: 2026-08-11T05:32:48.418Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0327. A new SPEC supersedes SPEC B rather than amending it in place

## Context

The re-architecture changes the premises SPEC B was built on. Part III loses its reason to exist once orchestration leaves the sandbox; Part I's instrument source changes because an SDK host reads ResultMessage.usage directly rather than depending on the unprobed in-sandbox budget global of section 2.2; Part IV's frontier-train justification shifts once the engine can pause for a human instead of parking. Patching would leave one document carrying two architectures' worth of history.

## Options

- New SPEC superseding SPEC B, surviving parts folded in - chosen
- Amend SPEC B in place, preserving its section 0 ground truth
- Two documents: a re-architecture SPEC plus a trimmed SPEC B

## Outcome

Author a new SPEC that supersedes the 2026-08-06 document. SPEC B is marked superseded, not deleted, and its surviving content is folded in: the section 0 verified ground truth, the falsifiable-hypothesis discipline, the instrument-first ordering, and Part IV stacked PRs. Two section 0 corrections already re-derived this session travel with it - there are 25 top-level *_SCHEMA declarations and not 26 (the 26th match was PUBLISHED_SCHEMA_VERSION at mitosis.js:510), and parallel-plan-execution.js is confirmed vestigial as section 4.7 asserted.
