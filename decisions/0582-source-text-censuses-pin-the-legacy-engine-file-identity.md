---
Status: accepted
Date: 2026-08-18T19:05:37.698Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0582. Three source-text censuses pin the legacy engine to its filename, and M12b's file list is short

## Context

M12a set out to move sensitiveScope from run-engine.mjs into coarse-scope-lint.mjs so a later unit can delete the legacy file. Its lead halted before writing code: coupling-hardening.test.mjs:768-771 reads run-engine.mjs as raw TEXT and regex-matches the SENSITIVE_SCOPE_KEYWORDS declaration out of it, with the path hardcoded at line 24. Moving the declaration makes the regex find nothing. An investigator reproduced it in a throwaway copy - 52 of 53 pass against a 53 of 53 baseline. The whole-solution design listed neither this file in M12a nor its siblings in M12b.

## Options

- Leave the keyword table behind and move only the function, so a leaf module imports the file being deleted
- Duplicate the literal back into run-engine.mjs so the regex still matches
- Widen M12a by one file and repoint the census at the declaration's new home
- Edit the unowned test file without authorization

## Outcome

Widened M12a's file list by exactly one file to repoint coupling-hardening.test.mjs:24 at coarse-scope-lint.mjs, leaving line 23's ESCALATION_SOURCE on the legacy file because CONTRACT_EDGE_RE is not moving. This is a scope correction, not a ceiling change: the declared ceiling never moved, and the file list was mis-scoped relative to a ceiling that always required this edit. Repointing is not gaming the check - the census measures the live routing vocabulary, and the vocabulary moved, so the census follows its subject and must still go red when the table is absent. Verified no collision: coupling-hardening.test.mjs is unowned across all six wave-1 units. THE DURABLE FINDING: three separate source-text censuses over run-engine.mjs couple a file's IDENTITY to a test outcome, so any move or delete of that file reddens tests that never call its functions. M12b's design file list is therefore short - it must also dispose of coupling-hardening.test.mjs:23, tests/run-engine.test.mjs:855, and the seven test files that import the legacy module, four of them by dynamic import. Those censuses are change-detectors and get a separate look once the deletion lands.
