---
Status: accepted
Date: 2026-07-31T22:26:23.849Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0169. D5 guards the emit rather than collecting after the fold, and knowingly accepts a swallowed sink error

## Context

0166's D5 named two options for restoring the fold's totality: collect the veto lines and emit after the fold returns, or guard the emit. The first reads tidier and keeps foldObservedStatus pure, so it was the tempting choice. The red receipt at 5684271 settles it: the injected throw escapes foldObservedStatus from inside Array.reduce (status-facts.mjs:37 -> :33 -> the caller). Moving the emit loop to after the reduce but before the return RELOCATES that throw without containing it - the exception still unwinds out of the function before the return executes, so the caller still receives nothing and the fully-computed manifest is still discarded. Collecting only satisfies the totality invariant if it is ALSO guarded, at which point the collection step is pure cost.

## Options

- Collect veto lines during the fold and emit after it returns, per the tidier reading of 0166
- Guard the sink call so a throwing observer cannot discard computed transitions
- Guard and also add a fallback reporting channel so the broken sink is surfaced rather than swallowed

## Outcome

Guard the emit; the collect-then-emit option is REJECTED on the receipt above, not on taste. Scope detail that matters: vetoLogLine(...) is evaluated OUTSIDE the guard, because it throws on an unknown veto name and that is a production invariant violation which must stay loud. Only the sink call is isolated. Coverage of the still-emitted lines needed no new test - advance-veto.test.mjs already asserts exact text, exact unit and the no-line-when-unvetoed case against the real module. KNOWN AND ACCEPTED TENSION: the guard swallows the sink's error, against the project rule that errors are never silently swallowed. Accepted because the only reporting channel inside this fold IS the sink that just failed, and every alternative breaks scope, totality, or the no-behavior-change invariant. Option 3 remains the real fix and is deliberately deferred: surfacing a broken sink needs a SECOND channel, which is a design question 0166 did not open and P2 cannot absorb. Anyone who wants the broken sink visible should treat that as the follow-up, not re-litigate the guard.
