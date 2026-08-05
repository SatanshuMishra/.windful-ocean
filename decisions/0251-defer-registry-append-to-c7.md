---
Status: accepted
Date: 2026-08-05T21:01:06.956Z
Thread-Id: 01KZ98CT0FT1SYQRH4D7TXH0Z5
---

# 0251. Defer the G1-G5 registry append to c7 rather than break 22 coverage artifacts now

## Context

c2 called for appending G1-G5 to docs/invariants/registry.json "in its existing shape", which the plan treated as trivial and tooling-free. It is not. scripts/invariant-coverage-check.mjs validates every file in docs/invariants/coverage/ against the full registry id set, not only the files a change touches, so five new ids immediately produce "missing invariant id(s): G1, G2, G3, G4, G5" against all 22 existing artifacts. Proved empirically against a scratch copy of docs/ rather than argued from reading. The invariant-coverage job runs on push as well as pull_request, so the break would land on the next push of this branch, not at PR time. Note also that M1's own statement says a change is verified against the full invariant set of ITS TRACK, while the checker ignores tracks entirely - a pre-existing divergence that adding a third track surfaces.

## Options

- Defer the append to c7, where this branch's own coverage artifact is authored anyway and the question can be answered with better information; the threat model is the source of truth for G1-G5 in the meantime
- Backfill all 22 existing artifacts with five rows each, 110 verdict rows whose honest content is 'this change did not touch the bash gate' - a large low-information diff that retroactively amends historical records with verdicts nobody made at the time
- Make the checker track-aware now, matching M1's own wording - the principled fix, but a code change to the enforcing gate (M6 applies, needs its own tests) inside a step whose whole point is to stop before any code

## Outcome

Deferred to c7, chosen by the user. Keeps c1/c2 a pure documentation step, which is the entire point of the write-it-down-before-code gate, and avoids detonating CI mid-thread. Cost accepted: G1-G5 are greppable in docs/security/bash-gate-threat-model.md but not machine-referenceable until c7. The goal statements were deliberately written as single sentences so they lift verbatim into the {id, statement, source} shape when c7 arrives. The backfill-versus-track-aware-checker choice is deferred with the append, not resolved here.
