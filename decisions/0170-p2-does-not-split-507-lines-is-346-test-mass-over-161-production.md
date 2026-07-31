---
Status: accepted
Date: 2026-07-31T22:39:47.492Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0170. P2 does not split: 507 changed lines is 346 of test mass over 161 of production

## Context

The prior session withdrew its size estimate and measured P2's own increment at 484 changed lines against its PR base, over the 200-400 reviewable-diff budget in rules/common/git/commits.md, and left the split-or-not question open as step 2 of the next step. Re-measured by the orchestrator at the current tip ef92657 against the PR base test/mirror-census-closure at 7b8acd2: 9 files, +476/-31 = 507 changed lines. The number rose from 484 because ef92657 (the D5 fold-totality fix) landed after that measurement. The split by class is the fact that decides it. Production is 161 changed lines - parking.mjs +9/-5, status-facts.mjs +53, mitosis.js +71/-23 - and roughly 38 of mitosis.js's added lines are the mandated inline twin of status-facts.mjs, so genuinely new production logic is near 70 lines. Test mass is 346, of which status-fold-cases.mjs is 117 lines of golden-case fixture data rather than logic.

## Options

- Split the eight commits into a refactor PR (f04b8de characterization plus 9363558 extraction) and a behavior PR (the vetoes, the H-B gate and the five defect fixes)
- Split the five 0166 defect fixes out as a follow-up PR on top of a smaller M2 PR
- Ship all eight commits as one PR and record the measurement with its class breakdown

## Outcome

NO SPLIT; ship all eight commits as one PR, with the 507/161/346 breakdown stated in the PR body rather than hidden. The budget in commits.md governs reviewable change, and at 161 changed production lines P2 sits comfortably inside it; the overage is test mass, which is the receipt surface registry M3 demands and the last thing to trade away for a smaller diff. Both split options are rejected on stronger grounds than size. Splitting the defect fixes into a follow-up is the exact option 0165 and 0166 already rejected - 0166 reads FIX ALL FIVE BEFORE THE PR - and it would land the D3 H-C-class defect on a shared branch, breaking the green-branch invariant that MSPs exist to protect. Splitting at the refactor seam is worse than it looks: 5684271 DELETES the characterization transcription that f04b8de introduces, so a refactor-only PR would land an unpoliced third copy of the fold on the shared branch and the follow-up would immediately remove it - churn that ships a known defect in between. Separating a fix from the acceptance test that proves it red-before-green would also violate M3 directly. Recorded limit: this ruling is about reviewability of ONE stacked PR, and P2 is stacked on P1's 229 lines, so a reviewer reading the two together sees 736. That is the argued cost of the stack, accepted when 0156 ordered the census to land first.
