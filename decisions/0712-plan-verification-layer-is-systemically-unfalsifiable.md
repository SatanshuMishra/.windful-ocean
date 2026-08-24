---
Status: accepted
Date: 2026-08-24T17:04:25.956Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0712. The migration plan is not implementable as written: every unit brief carries a check that cannot fail

## Context

The import unit met its declared acceptance criterion while shipping 141 unresolvable module specifiers across 84 files, with 69 of 127 test files unable to load. The unit's own verification passed because the brief declared a closed enumeration and then named a matching command that sees only one of the four specifier forms the language offers - three steps after the same brief warned that such a scan misses one of them. I first treated this as a single instance and proposed adding work to the plan; the user refused the middle ground and required the question settled either way. Four auditors then produced closed per-claim verdicts over all 21 remaining briefs.

## Options

- Treat the import unit as an isolated instance and continue shipping, repairing each brief as it is reached
- Audit every remaining brief for the same defect and decide once, with the whole picture
- Abandon the migration and leave the engine in the host repository

## Outcome

Audited, and the verdict is that the defect is systemic rather than isolated: 21 of 21 briefs, plus the exemplar, would ship an incorrect unit while passing every check they name, across roughly sixty defects. Three were demonstrated by execution rather than argued - the publication unit's checks pass against a licence naming the wrong repository with the machine-training reservation gutted; two units certify the suite with a count comparison whose extraction pattern matches nothing on this runtime, returning success against a deliberately fabricated summary; and the shipped test command does not enumerate its directory, so the suite runs no tests at all. The plan therefore cannot be implemented as written, and no further unit is started until the user directs the repair. The generalizable rule this establishes: a brief may not state a requirement in prose and name a command that cannot fail for that requirement, and where it claims a closed enumeration the command must enumerate and halt on what it cannot classify rather than match a pattern.
