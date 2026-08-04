---
Status: accepted
Date: 2026-08-04T19:36:48.791Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0240. A contradiction that exists only in the composition of two correct patches is held unlanded, never reconciled by the applier

## Context

Round 7 surfaced a failure mode neither 0237 nor 0238 covers. K5 corrected a false count at DOCKET:9 and its SPEC twin, replacing the vague "most explicitly labelled" with an exact figure of six and enumerating the six items. K8, working a different cluster, added that same literal label to eight more Recommendation blocks. Each patch was individually correct and independently verified: measured against the untouched snapshot, six blocks carried the label pre-fold, K8 added eight, and 6 + 8 = 14. K5's "six" was true when authored and false the instant K8 landed. Neither author could have seen it - K8's cluster did not own the count, and K5's did not own the labelling. 0237 governs every site of ONE claim; 0238 governs the surface area of ONE issue. Neither reaches two individually-correct repairs whose COMPOSITION is false, and only the applier - the single agent that sees all patches at once - occupies the position where such a contradiction is visible at all.

## Options

- Applier renumbers to the now-known correct figure and lands both
- Applier holds the contradicting patch's edits together, unlanded, and reports
- Applier holds the other patch instead, preserving the first's figure
- Applier lands both and flags the inconsistency in place

## Outcome

HOLD, DO NOT RECONCILE. The applier landed K8 in full and held all four of K5's edits together as one claim under 0237, rather than write a figure no patch had authored. Renumbering would have been the applier improvising content outside any author's reasoning - precisely the unmapped-surface edit 0238 exists to prevent, and doubly so from the one agent whose role is mechanical fidelity. Holding K8 instead would have cost four times the edits and left I3-21 open. Landing both with a flag is the false-green failure 0230 forbids.

The hold was then closed properly rather than deferred: a dedicated closeout agent re-measured the domain from scratch, reconciled the two competing figures (15 occurrences = 14 Recommendation-block openers + 1 meta-use in DOCKET:9's own prose describing the convention), verified the two unlabelled blocks as D-01 and D-13, and landed the corrected matched pair with K5's authored form and marker placement preserved byte-for-byte, so the pending I3-23 ruling on where an [RB] note's scope ends was not pre-empted. I5-3 and I5-4 are closed.

The general rule this fixes: a fold-time contradiction is HELD and REPORTED, never resolved by the applier, and is closed by an agent that re-derives the disputed value from measurement. The applier's authority is fidelity to what was authored; the moment it invents a value it has become an unreviewed author with the widest blast radius in the round. Round 8 will fold again and should expect this class rather than be surprised by it: independently-correct patches whose composition is false are a property of parallel authoring, not a lapse by any author.
