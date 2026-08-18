---
Status: accepted
Date: 2026-08-18T22:40:03.451Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0596. M7 ships its visibility half and the ship-with-downgrade rule stops at the green-branch invariant

## Context

M7 was released to ship once M0 landed per-unit tree isolation, on the premise that its refusal would then measure the fix rather than the fixture. Its lead measured both trees instead of assuming: the base is green at 3102 passing, and its own branch is 22 red. Nothing is inherited, so there is no residual to subtract. The refusal is CORRECT - M0 isolated per-unit trees, but the head operand is still HEAD in the operator's checkout, so the gate truthfully reports that the comparison is vacuous, which pre-M8a it genuinely is. The e2e suite currently encodes the vacuous pass as expected behaviour.

## Options

- Ship the whole unit under the ship-with-downgrade rule and accept 22 red on the target branch
- Split: ship the visibility half now and move the refusal into M8a
- Re-sequence M7 whole, landing it with or strictly after M8a

## Outcome

Chose the split. M7 ships comparedIdentities, notComparable, strict declaredNoOp validation and named unresolved-probe reasons - vacuity becomes VISIBLE, which is what the unit is named for - against a green base. The refusal itself moves into M8a, the only unit where it can be correct, because M8a supplies the checkpoint ref as the head operand; separating the refusal from the operand fix would leave an intermediate commit refusing on a comparison it cannot yet make. No unit is added and the freeze holds at twenty-four: M7 gets smaller, M8a absorbs the refusal into its own acceptance test. THE RULE CORRECTION MATTERS MORE THAN THE RULING. The orchestrator's freeze rule said a lead that cannot be unblocked in one exchange ships what it can with an honest downgrade. The lead refused to apply it here and was right: ship-with-downgrade covers a VERIFICATION GAP - a check that could not be run, a gate that could not be cleared - and never covers breaking the target branch. The green-branch invariant is a user-level rule and an agent cannot waive it on the user's behalf, no matter what another agent instructs. The lead found the boundary of the orchestrator's own rule by measuring both trees rather than assuming its failures were inherited.
