---
Status: accepted
Date: 2026-08-04T06:04:29.139Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0230. Repair rounds are gated on a fixed invariant set, and stop at NOT READY rather than declare a false green

## Context

The first workflow's re-baselined SPEC came back SOUND WITH FIXES NEEDED on 16 defects, four of them wrong anchor corrections produced by reasoning from drift bands instead of opening files. A stored memory recorded the failure mode directly: a prior effort ran five fix rounds and each introduced a new defect on a path nobody had named, because each round was scoped to the previous round's finding list.

## Options

- Dispatch a fix round scoped to the 16 named defects; Define invariants the document must satisfy and gate each round on those, treating the defects as evidence; Abandon the re-baseline and re-author the SPEC from the approved original

## Outcome

INVARIANTS, not the finding list. Eight were fixed before dispatch: anchor truth, no silent deletion, marker-class discipline, decision closure, internal consistency, scope fence, evidence-that-runs, and implementability. Each round rewrote, then a verifier re-derived every invariant independently and returned a verdict; the loop was bounded at three rounds and instructed to stop rather than ship. It stopped: SPEC NOT READY after round 3, with I1, I2, I6, I7 and I8 holding and three violations remaining across 8 named defects. The gating worked as intended in two measurable ways. First, round 1's four wrong anchor corrections were caught and the anchor table was rebuilt under an explicit ban on band-reasoning, then passed adversarial check TABLE SOUND with 15 rows independently re-opened. Second, the bound prevented a false green: the honest NOT READY is worth more than a declared success, because the residual defects are now named, located and small. LIMIT FOUND: invariants govern what is checked, not what is retrieved. Defects 1 and 2 - missing decisions 0130 and 0210 - were records INSIDE the searched band that the reground agents simply did not return, a recall failure no invariant caught. A future pass must require every in-band record be enumerated and marked bearing or non-bearing.
