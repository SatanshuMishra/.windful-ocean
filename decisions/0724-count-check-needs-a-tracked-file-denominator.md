---
Status: accepted
Date: 2026-08-24T23:04:35.951Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0724. The acceptance parser cannot catch the defect it was written for, and moves to the vacuity unit

## Context

U2.2's brief specified a total-tests parser that halts if it cannot find the field and otherwise requires a total greater than zero. Under the enumeration mutation the runner reported a total of one, so the parser passed while the suite had not enumerated anything. The mutation was still caught, but by a separate assertion the implementation added that compares the reported total against the count of tracked test files. The brief's own check is therefore insensitive to the exact defect the unit exists to fix.

## Options

- Rewrite the brief's parser inside U2.2 so the shipped unit carries a sound check
- Keep the shipped denominator assertion, file the brief's weaker form, and assign the general rule to the vacuity-guard unit
- Treat a greater-than-zero total as sufficient and close the item

## Outcome

Option two. The shipped unit already carries the stronger denominator comparison, which is what fired during the mutation, so the acceptance criterion was met by a check that can fail. The general rule - a count check needs the tracked-file denominator on the other side of the comparison, never a bare greater-than-zero - is filed as item 1 against U5a, whose subject is precisely a check that cannot pass vacuously. Recorded because a bare greater-than-zero total reads as a real check and is not one.
