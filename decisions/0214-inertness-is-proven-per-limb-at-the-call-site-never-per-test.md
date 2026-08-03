---
Status: accepted
Date: 2026-08-03T07:29:03.875Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0214. Inertness is proven per limb and mutated at the call site, never per test and never at the shared constant

## Context

PR 37 shipped M8 with a disclosed Risk line: the deny-case tests for escalation classes 2, 3, 4 and 5 existed but their non-inertness was unproven, only classes 1 and 6 having had a mutation applied. The user directed that the four be proven after the merge. The naive reading is one mutation per test, which is how the previous MSP's inertness claims were made. Three facts defeat that reading. First, a single deny-case test asserts several independent mechanisms: class 2 rests on a predicate, a class label, and an 8-element whitelist whose elements are 8 separate data limbs, and because node assert is fail-fast inside the test's for loop a single run can only ever witness one token's redness. Class 3 rests on six mechanisms behind five assertions. Second, classifyCiReport runs a class-0 readability and check-name census BEFORE classes 1-5, so a mutation applied to a shared census CONSTANT can make the input escalate as class 0 rather than as the class under test - red for a reason unrelated to the guard being probed. Third, ci-escalation.mjs is a WHOLE twin inlined in mitosis.js, so a lib-only mutation reddens mirror-guard as drift and changes no engine behaviour at all, while an engine-only mutation leaves the unit tests untouched.

## Options

- One mutation per test, the previous MSP's approach - rejected, it proves one limb and leaves every other limb exactly as unproven as before
- One mutation per limb, applied at the class's own CALL SITE with the shared census constant held intact, in both mirror halves, fanned out across isolated worktrees
- Mutate the shared constants - rejected by measurement, it produces class-0 shadowing and proves the census rather than the guard
- Delete whole functions as the mutation - rejected, that proves only that the module loads

## Outcome

Per limb, at the call site, in both halves, one agent per class in its own isolated worktree. 40 mutations across 5 agents; every one applied to BOTH mirror halves, run against the full 1887-test suite so collateral redness is data, and restored with a verified-empty diff plus a re-run landing on exact baseline. Four rules made the proof mean something and are the reusable part. (1) A proof requires the redness to land on the assertion EXPRESSING THE INVARIANT and the agent to report the ACTUAL OBSERVED VALUE - `class: undefined` (fall-through to a licensed fix attempt) and `class: 0` (halted at the census) are both red and mean opposite things. (2) Isolate the class from the census by neutering the matcher at the call site while leaving the constant in the class-0 list, so the probed name stays classifiable-as-known and an observed `undefined` is a value class 0 could not have produced. (3) Report collateral count as a negative control: a mutation reddening 29 tests is blunt and proves nothing specific, which is exactly what inverting class 1's shared containment helper did. (4) Prove ENGINE wiring separately, by making the engine honour every class EXCEPT N - unit-level mutation cannot distinguish a correct classifier the engine consults from a correct classifier it ignores. Isolated worktrees were load-bearing rather than tidy: five agents mutating the same two shared files in one tree would have collided, and all five auto-cleaned because each ended unchanged.
