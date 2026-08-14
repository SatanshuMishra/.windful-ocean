---
Status: accepted
Date: 2026-08-14T09:01:34.665Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0422. B3's long-pole test stays at the discriminating assertion rather than a full-sequence one

## Context

B3 orders dispatch by longest downstream path. Review asked whether the long-pole test should assert the entire dispatch sequence rather than only which task starts first, on the general principle that a stronger assertion catches more.

## Options

- Strengthen to a full-sequence assertion - rejected: the tail of the sequence is not pinned by the contract, so the expected value would be copied from actual output
- Keep started[0] as the assertion - chosen

## Outcome

The test keeps asserting started[0]. That single value already discriminates all four rival orderings, so the fuller assertion adds no discriminating power while pinning tail order the contract does not specify - the shape of a change-detector whose expected value is copied from actual output, which the testing rules forbid. A stronger assertion is not automatically a better one when the extra strength lands on unspecified behavior.
