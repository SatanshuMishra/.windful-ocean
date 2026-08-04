---
Status: accepted
Date: 2026-08-04T18:16:00.395Z
Thread-Id: 01KZ4M2VJHW4W1MNGTM0YGHY98
---

# 0237. A repair edits every site of a claim or it does not start, because round 5 proved site-keyed repair half-lands

## Context

Round 5 recorded "91 edits, 27 pairs, 0 half-landed". The round 6 gate falsified that claim four separate times, and the four were found by four DIFFERENT verifiers who were not looking for each other's findings. Round 5 corrected the corpus figure to 233 and withdrew round 4's numbers at SPEC:752, while "all 227 records" still stands at SPEC:400 and SPEC:617 carrying a corpus-wide negative on that stale surface. It established at four sites that 0161 does not authorize the streaming deletion, while SPEC:649 still reads "removed it under 0161/0185". It downgraded D-13's third assumption from measured to asserted in the item body AND logged the downgrade in its own changelog, while DOCKET:401's header still says "one is now measured" - and that header is byte-identical to the .pre-round5 file. It withdrew 0211's "measured on a real killed run" at SPEC:677, while DOCKET:243 and DOCKET:526 still call it a measurement, which is the strength D-05's option A is scored on. The shape is identical every time: the body of a claim was corrected and its header, summary row, BLUF entry or duplicate site was not. 0231 and 0235 already govern the ACROSS-DOCUMENT half of this (a two-document fold is authored as matched pairs and applied by one agent). Neither reaches the WITHIN-document half, where one claim appears in a header, a BLUF, a body paragraph and a changelog entry of the same file.

## Options

- Repair the four half-landed pairs as four more defects on the finding list
- Extend the matched-pair discipline of 0231/0235 from documents to claims: locate every site of a claim before editing any site, and land them together or not at all
- Add a post-repair grep sweep that re-checks each edited claim for surviving duplicates
- Accept the drift as unavoidable in documents this size and mark known-stale sites in place

## Outcome

CLAIM-KEYED. A repair's unit of work is the CLAIM, not the line: before editing any site, enumerate every site where that claim appears - header, BLUF or summary row, body, changelog, and the companion document - and land them in one atomic edit set or not at all.

The first option is rejected on 0230's central lesson, which this round re-proved at a new altitude. A finding list is the wrong artifact; each of these four defects WAS invisible to the round that created it precisely because that round was working a site list. Adding them to a list reproduces the shape that generated them.

The third option is strictly weaker than the second and was rejected for a specific reason: a post-hoc sweep can only find duplicates of the wording it is given, and three of the four survivors here differ in wording from the corrected site ("all 227 records" versus "233"; "measured" versus "asserted"). The sweep would have to already know the claim's semantic identity - which is exactly what enumerating sites BEFORE editing establishes. Doing it first is cheaper and complete; doing it after is a filter with known false negatives.

The fourth is the false-green failure 0230 exists to prevent, one step removed: a document that marks its own known-stale sites still ships them.

This extends 0231 and 0235 rather than replacing them. 0231 governs whether a repair STARTS (it does not, unless the session can finish it); 0235 governs how a many-record two-document fold is AUTHORED (matched-pair patches, single applier). This one governs the unit: a claim, wherever it lives. The three compose - enumerate the claim's sites, author the matched set, apply atomically, start only if all of it can land.

The measurement that forces this is not a judgment call. Four independent verifiers, each auditing a different invariant, each surfaced one instance without knowledge of the others. That is a systematic property of the editing method, not four coincidences.
