---
Status: accepted
Date: 2026-08-09T20:48:32.224Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0308. The aside name carries its release identity, resolving the cross-release case rather than accepting it as a residual

## Context

Running the cutover against release A and then against release B while an A-keyed aside still exists makes rollback refuse with a foreign-release error. Nothing is destroyed - both the journal and the aside are kept - but recovery becomes manual.

0302 established that automatic recovery cannot be derived. Aside names are keyed on an 8-hex short sha produced by shortSha at cutover.mjs:62 and consumed at :66-67, while a record carries a 40-hex value validated only by SHA_PATTERN. There is no total function from 40 hex back to the particular 8 that named a file, so any clause of the form "derivable at record.sha" names a derivation that does not exist.

The recommendation made this session was to accept the case as a stated residual travelling with N1 and N2, on the grounds that it already fails safe and that fixing it is a new invariant rather than one of the three currently in flight - the same scope creep that produced round six. The user considered that and directed a robust and simple resolution instead.

## Options

- Store the release identity in the aside name so recovery becomes a lookup - ADOPTED
- Accept it as a stated residual deferred to N2 - rejected by the user after the recommendation and its scope cost were stated
- Widen the aside namespace to 40 hex so record.sha becomes derivable - rejected in 0302 as a real change to the on-disk namespace made to rescue a sentence, lengthening every aside path for no safety gain
- Derive the aside from the record sha - rejected, 0302 proved the derivation cannot exist

## Outcome

Stop deriving; start storing. The aside filename carries its own release identity, so the cross-release case becomes a lookup rather than a computation, and foreign-release turns from refuse-and-escalate into recover. This removes the impossible derivation rather than building a workaround beside it, which is what makes it both the robust and the simple option.

Recorded explicitly as a deliberate scope addition, not a silent one: the recommendation was to defer, the concern about scope creep was stated plainly, and the user's direction supersedes it. This is the standing obligation from 0302 discharged rather than deferred - before implementing, verify the derivation from the stored identity to the namespace is total, and state that verification.

Landing this satisfies N2. The residual pairing of N1 with N2 therefore no longer holds, and N1 - that records are dropped silently - remains open on its own and must not be assumed closed alongside it.
