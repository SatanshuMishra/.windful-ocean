---
Status: accepted
Date: 2026-08-24T23:40:40.426Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0727. receipts.config.json omits verify.suite_command, so gate G9 cannot block the units that green the suite

## Context

Measured against the pinned enforcer by running it on disposable synthetic repositories: gate G9 runs verify.suite_command on the head commit and nothing else. There is no base-side suite run anywhere in the enforcer, so it cannot tell a pre-existing failure from a regression, and it blocks while reporting the failure as a regression in code the changed test never exercised. A synthetic unit carrying a genuine red-on-base green-on-head receipt still exited 1 because two unrelated tests failed. With the suite red, G9 would block every source-touching pull request, including each unit that fixes part of the 41 - only the last one to reach zero could pass.

## Options

- Ship SPEC section 5.5 verbatim with verify.suite_command set to npm test - blocks the greening units and every other source change until the suite is green
- Omit verify.suite_command - G9 degrades to a printed warning naming the missing key on every run, while the other gates stay at full configured strength
- Set gates.disabled to G9 - reaches the same pass but silently, because the not-checked warning is itself behind the gate-on check

## Outcome

Omit verify.suite_command, a stated deviation from SPEC section 5.5. It is a visible, self-announcing downgrade of exactly one gate with a one-line reversal, and that reversal is a declared acceptance clause of U3. The disabled-gate route is rejected because it silences the warning that makes the downgrade legible. Two consequences carried: a work-type refactor or chore pull request blocks while the key is absent, and claim.downgrade_tags must never contain the word fixed, because tag matching is an unanchored case-insensitive substring test and the word prefixed in a body turns every gate off.
