---
Status: accepted
Date: 2026-08-17T16:55:15.794Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0532. Waves 0 to 2 audit: three gaps become one flat remediation MSP, the census grammar gap is filed against U6.2

## Context

An independent on-disk audit of every merged wave 0 to 2 unit was run because this thread's ledger once asserted a wave was fully built while one unit had no implementation at all, with three merged pull requests making the false claim look corroborated. Five of six units verified PRESENT with real command output. Four gaps surfaced. U0.1's own acceptance command exits 1 on main because a stray copy of the producer script sits inside the archive directory, inflating the file count, byte total and aggregate hash; the 47 archived telemetry files are themselves byte-faithful. The two wave 2 skills shipped mutually incompatible checks, one hardcoding a routing header of Duty and Procedure while the other skill's table reads Duty and File, so neither unit's check covers both skills. Three of the four wave 0 to 2 checks are invoked only by hand and appear nowhere under .github, which is exactly why U0.1 drifted red unobserved. Separately, U1.2's census grammar requires a code span whose very next word is the role noun, so it misses references broken by punctuation or emphasis and sees nothing at all for four of the nine retiring agent names.

## Options

- Fix all four gaps inside the wave 3 stack, coupling unrelated repairs to the observer chain
- Reopen U0.1, U1.2, U2.1 and U2.2 against their original criteria, which acceptance-as-ceiling forbids
- Ship one flat remediation MSP off main for the three mechanical defects, and file the census grammar gap against the downstream unit it actually affects
- Fix the census grammar now as well, widening the remediation MSP into a fourth unit's territory

## Outcome

One flat remediation MSP off main, branch fix/wave-0-2-check-remediation, carrying exactly three repairs: the polluted archive plus the producer root cause that let it happen, the divergent skill router lint unified across both skills, and CI wiring for the checks that can run hermetically. It is flat rather than stacked because its file scope is disjoint from the observer chain, and it is one MSP rather than three because all three defects share a single cause - a check nobody runs is a check that rots. The archive verifier is the deliberate exception to the CI wiring: its subject lives outside the repository and will not exist on a runner, so it must not be wired in a way that passes vacuously when the archive is absent. The census grammar gap is FILED against U6.2 and not fixed here. It sits above U1.2's declared ceiling, so U1.2 passes its own criterion honestly, and the census itself discloses the limitation rather than hiding it. The transferable finding is sharper than the gap: U6.2's stated acceptance - that the U1.2 census is green with the nine retiring names still present on disk - is ALREADY satisfied today with those references untouched, so as written it cannot detect U6.2 being skipped, and U7.1 would then delete the definitions and leave dangling routing instructions behind. U6.2 needs a different acceptance criterion, not merely a wider census.
