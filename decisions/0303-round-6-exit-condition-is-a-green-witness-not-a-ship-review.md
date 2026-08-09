---
Status: accepted
Date: 2026-08-09T16:38:15.843Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0303. Round 6's exit condition is a green witness plus a green meta-witness, not an independent review returning SHIP

## Context

Rounds 1 through 5 each ran implement, green CI, independent review, BLOCK, reimplement. Every round exited on the same condition: an independent review returns SHIP. That condition is the loop. Review samples rather than covers, so each round bought exactly one sample of the domain, at the cost of a full review lane plus a fix round; two of round 5's five blocking findings were regressions round 5 itself introduced hours earlier. The suite was green at 2159 of 2159 and mutation-proven throughout, so neither CI nor the registry was ever a mechanism capable of catching the defect. 0301 identified the shape defect and 0302 proved the four-part shape works by catching a false premise before implementation for the first time. A fresh audit dated 2026-08-10 then found three more instances of the original disease inside the two documents that define the cure: GUARDED_ENTRY_NAMES spreads PROMOTED_ENTRIES (10 members) where the vocabulary is CUTOVER_ENTRIES (11), dropping notes; LINK_WRITE_KINDS (cutover.mjs:70) hand-lists 3 of the 6 kinds cutoverWritePaths emits at :104-117; and 0302's correction still lives only in the decision record while the contract text carries the uncorrected clause in two places. The shape relocates the enumeration into the choice of which constant the domain points at, and nothing checks that choice.

## Options

- Change the exit condition to: the witnesses for the gating invariants exist, are red before the fix and green after, and the meta-witness is green; review runs as a second opinion, not as the oracle - ADOPTED
- Keep the review-returns-SHIP exit condition and add more lanes or more adversarial effort - rejected, four lanes already ran and review samples by construction, so more sampling cannot become coverage
- Witness every invariant in the system before shipping round 6 - rejected, each witness is real infrastructure (an fs-preload shim, a codegen step into shell hooks) and landing twenty at once stalls the thread in a way that looks like the loop while having a different cause
- Ship round 6 on the gating fix alone with no witness and defer all witnesses - rejected, that is round 5's exit condition renamed and it leaves human review as the only oracle

## Outcome

Adopted. Round 6 exits when three things hold, and an independent review is no longer the oracle for any of them.

First, the gating invariants carry executable witnesses that derive their cases from a named code constant rather than from a human's list: I2 over ENTRY_STATES, I3a over ENTRY_STATES crossed with the two disk conditions, I3b over CUTOVER_ENTRIES. Each is observed RED before the fix and GREEN after. A witness that has never been red proves nothing.

Second, the meta-witness is green. It checks that every DOMAIN clause names a constant that exists, is exported, and is not a proper subset of a larger closed set of the same vocabulary in the same file, and it censuses candidate domains so an unnamed axis is declared or waived rather than assumed absent. It is the check that catches the class the audit found three fresh instances of, and it is cheaper than any single cutover witness.

Third, the contract text a fix round reads carries every correction. A decision that corrects a contract edits the contract in the same act; corrections that live only in decision records leak, and 0302's did.

Scope is held deliberately narrow: only the invariants gating the CRITICAL are witnessed this round. I1's fs-shim, I6's Cartesian product and the remaining regrade items are correct and are not this unit's business; widening is how the work reached round six.

The honest claim, stated so nobody over-reads it: this does not guarantee round 6 is the last. It guarantees that a round 7, if there is one, is not another unsampled path inside a domain somebody already named. Changing which mechanism catches defects, from review to execution, is the only change that addresses the measured cause.
