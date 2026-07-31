---
Status: accepted
Date: 2026-07-31T22:26:08.460Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0168. D4 re-points the fold's two uniquely-covered assertions at the real module rather than deleting them wholesale

## Context

0166's D4 said plainly: delete the transcription and its bespoke tests, keep status-fold-cases.mjs. Reading both files before acting showed that instruction taken literally would drop real coverage. status-fold-characterization.test.mjs carried four things, not one: the per-shape golden loop and the null-prior test, both already asserted against the real foldObservedStatus in status-facts.test.mjs; but ALSO a table-shape guard (unique names, at least five shapes) and a parked-at-plan veto CAUSATION test whose contrast against a direct applyBuiltTransition call proves the veto is what withholds the built transition rather than a missing checkpoint ref. Nothing else in the suite asserts that causation.

## Options

- Delete the whole file as 0166's text reads, accepting the loss of the causation and table-shape assertions
- Keep the file and merely re-point its transcription at the real module, leaving a second home for goldens status-facts.test.mjs already owns
- Delete the transcription and the two redundant tests, re-point the two unique survivors at the real module, and move them into status-facts.test.mjs so the file goes away

## Outcome

Option 3. The transcription foldAsWrittenBeforeExtraction and the two tests already covered elsewhere are deleted; the table-shape guard and the veto-causation test move to status-facts.test.mjs re-pointed at the real foldObservedStatus; status-fold-characterization.test.mjs is deleted entirely; status-fold-cases.mjs is byte-unchanged. This satisfies 0166's actual intent - kill the unpoliced third copy mirror-guard cannot see, since libModuleNames() reads only the lib directory - while honoring the project rule that a behavior has ONE home and a superseded test is deleted in the same change. Net coverage does not shrink: every behavior asserted before is still asserted after, now through the production surface. The suite count drop from 1820 to 1813 is exactly the 8 duplicated transcription assertions, minus D5's one addition. This does NOT weaken the M4 receipt: characterize-before-extract is receipted by commit ORDER in history (f04b8de precedes 9363558), and history is not edited by deleting the file today. Recorded because a future reader diffing 0166's text against the landed change would otherwise read this as the instruction being ignored.
