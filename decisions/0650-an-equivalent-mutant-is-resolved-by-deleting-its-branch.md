---
Status: accepted
Date: 2026-08-20T22:14:24.673Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0650. An unkillable equivalent mutant is resolved by deleting the redundant branch that hosts it

## Context

The mutation gate blocked a pull request on a mutant that flipped an or into an and inside a null-or-undefined guard. The implementer proved equivalence the right way - it applied the mutation and ran the whole 2276-test suite under it, rather than reasoning alone - and the logic is airtight: the mutated condition is false for every value in the universe, and the function it guards already returns null for null, for undefined and for any non-object, so original and mutant produce identical output for every possible input. No test can kill it. The enforcer's own escape hatch is to declare the equivalence in the pull-request body, but this project fixes a pull request's title and body at creation and denies every edit path afterwards, so the check would have stayed red permanently.

## Options

- Merge over a permanently red check and carry the explanation outside the pull request
- Declare the equivalence in the pull-request body, which the gate denies after creation
- Delete the redundant branch so the mutant has nowhere to live

## Outcome

The redundant branch is deleted, and the gate goes green for a real reason rather than by an argument nobody can read. This is legitimate because the branch is provably dead code, not because it clears a gate: the equivalence premise was re-confirmed before acting - the guard inside the called function was read directly, and every test was grepped to prove none pinned the ternary itself - and the full suite came back with identical counts before and after. The general rule: an equivalent mutant that cannot be declared is a signal that the code carries a branch with no behaviour behind it, and removing the branch is the honest resolution. A permanently red check that means nothing is the same noise this whole effort exists to eliminate. What is NOT licensed is changing behaviour, weakening a test, or deleting a live branch to make a gate pass.
