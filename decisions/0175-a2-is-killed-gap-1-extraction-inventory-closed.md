---
Status: accepted
Date: 2026-08-01T04:32:53.163Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0175. A2 is killed on byte-identity, closing Gap 1's extraction inventory

## Context

A2 (extract emptyOpenPrClassification, prHeadOwnerRepo, classifyRunOpenPRs, buildReconcileLiveSignals into forge-facts.mjs) was the last held Gap 1 item, held by 0162 pending a section 3.1 check of its "MSP M2 (fact source)" claim after 0164 refuted M2's monotone-forward premise. Gap 1's admission criterion (0157) admits an extraction only when a NAMED, IMMINENT milestone is about to touch the region.

## Options

- ADMIT A2 on the plan's stated M2/M7 justification
- KILL A2 - no named imminent milestone touches the region
- Defer A2 again until M7 becomes imminent
- Extract anyway for testability, ignoring the admission criterion

## Outcome

KILLED, high confidence. Proven by byte-identity rather than argument: the 102-line A2 region is byte-identical from 8933c2c (pre-M2) through HEAD across both engine commits, and M2's five hunks (old-lines 536, 2336, 3776, 3845, 3868) do not intersect old-range 2817-2918. The "M2 fact source" claim is falsified by dataflow DIRECTION, not just non-use - foldObservedStatus runs at :3831 sourcing reconcile.mjs, classifyRunOpenPRs not until :3860, so the fold cannot consume A2's output. The spec names no A2 function anywhere, and M6 (the actually-imminent milestone) sits on the opposite side of section 3.5's identity/status line. Stale anchors were a uniform +55; live at mitosis.js:2872-2973. Gap 1's extraction inventory is now fully closed: A7 shipped, A4/A6 dropped, A2 killed. The A3/A5 characterization-test debt before M3/M5 is separate and still owed.
