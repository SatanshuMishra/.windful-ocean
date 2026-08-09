---
Status: accepted
Date: 2026-08-09T05:43:05.515Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0302. 0300's I3a derivation clause is corrected: an aside cannot be derived at record.sha, because the aside namespace is 8 hex and record.sha is 40

## Context

0300 adopted I3a symmetric corroboration, which states that a record in state already-linked or absent carries authority only while NO aside derivable for that name at journal.sha OR record.sha is present on disk. That pair of shas was written into the adopted outcome and would have been implemented verbatim in round 6.

The invariant regrade lane, re-deriving every domain against its backing code constant rather than trusting the prose, found the clause cannot be performed as written. asidePath keys the aside namespace on an 8-hex short sha, produced by shortSha at cutover.mjs:62 and consumed at :66-67. record.sha is a 40-hex value validated only by SHA_PATTERN and chosen by whoever writes the journal. There is no total function from a 40-hex record.sha to the 8-hex aside namespace, so "derivable at record.sha" names a derivation that does not exist.

The practical exposure today is bounded, because shortSha slices an isSha-validated value and the sha that actually keys any aside on disk is the plan's sha. The reason this is recorded rather than filed as a residual is that it is a FALSE PREMISE underneath the fix for a CRITICAL. Round 6 would have implemented a corroboration check against a derivation that cannot be computed, and would have believed the CRITICAL closed. That is the exact failure shape this thread has now paid for five times, caught before implementation for the first time.

It was caught by the four-part shape doing its job on its first application: the shape requires a domain to be verified against a named code constant, and verifying the constant is what exposed the width mismatch that four review lanes reading prose did not.

## Options

- Correct the clause to derive the aside solely from the sha that keys the namespace, and require round 6 to verify the derivation is total before implementing it - ADOPTED
- Widen the aside namespace to 40 hex so record.sha becomes derivable - rejected as a real change to the on-disk namespace made to rescue a sentence, and it lengthens every aside path for no safety gain
- Leave 0300 as written and let round 6 discover the mismatch - rejected, that is precisely the loop this session exists to stop, and a derivation that silently cannot be computed would leave the corroboration check believing it had evaluated a case it never reached
- File it as a residual rather than a decision - rejected, residuals are known-open items a fix round may defer, and this is a defect in the specification of a CRITICAL fix, which a fix round must not defer

## Outcome

0300 stands in substance and is corrected in one clause. Symmetric corroboration, the consumption gate, the permit sets, the falsifiers and every measurement behind them are unaffected; only the derivation clause changes.

I3a's corroboration check derives the candidate aside from the sha that actually keys the aside namespace, and from nothing else. Where a record's own sha is used at all, it is used as an equality check against that keying sha, never as an input to a path derivation.

Round 6 carries a standing obligation from this: before implementing any clause of the form "derivable at X", verify the derivation is TOTAL from X to the namespace it targets, and state the verification. A derivation that cannot be computed is worse than a missing check, because the surrounding code reports having evaluated a case it never reached.

Recorded as N2 in artifacts/2026-08-09-cutover-invariants-v2.md alongside the invariant that the aside namespace must identify its release.
