---
Status: accepted
Date: 2026-08-24T23:40:31.824Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0726. U3's ceiling widens to assert the suite exits zero, because no unit could fail for leaving it red

## Context

U3 and U4 both assert count identity - identical pass, fail and total counts across locations - which a red suite satisfies exactly as well as a green one. U3's brief says outright that the suite may be non-green and that U4 makes it green; U4 then never asserts it. So no unit in the plan can fail for leaving the suite red, which is why a 41-failure baseline arrived at U2.3 as a scheduling surprise rather than a scheduled dependency. The residue outside both ceilings is host-coupling defects - censuses resolving paths against the host layout rather than the extracted repository - which is U3's own subject matter.

## Options

- Widen U3's ceiling to add that npm test exits zero, since the residue is its subject matter and anti-sprawl favours widening over adding
- Create a dedicated green-the-suite unit owning the measured 18-file failure census, keeping U3's ceiling as estimated
- Re-derive the failure census by root-cause class first and decide the ownership shape against that

## Outcome

Widen U3. Its acceptance criterion gains a clause that npm test exits zero, so the unit can fail for leaving the suite red. U3 also owns turning gate G9 back on by setting verify.suite_command in receipts.config.json, which is the one-line reversal of the downgrade U2.3a ships under. The uncarried prompt-snapshots fixture remains a carry rather than a decoupling and still needs its own owner.
