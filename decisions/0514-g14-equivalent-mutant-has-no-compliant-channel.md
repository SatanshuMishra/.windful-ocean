---
Status: accepted
Date: 2026-08-17T08:17:21.296Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0514. G14's equivalent-mutant declaration has no compliant channel, and is proposed as a gap

## Context

MSP 9 opened PR 175 and the receipts enforcer blocked at G14 with 12 of 12 sampled mutants surviving. Under the one-attempt overnight policy the implementer built a local mutation harness over every changed production line, deleted the unassertable surface, pinned the rest by behaviour, and drove the local run to 95 mutants with zero survivors and CI to 1 of 12. The single survivor is ship-plan.mjs:38, the branch returning the string undefined under a return-to-undefined mutation. It is PROVABLY EQUIVALENT: describe() is consumed only inside template literals, and interpolating undefined renders the literal text undefined, byte-identical to what the branch returns. No assertion can distinguish the two programs, so no test can kill it. The enforcer's remedy is to declare an equivalent mutant in the pull request body. But the sampled mutant is unknowable before the pull request exists, because sampling happens in CI after creation, and a pull request body is IMMUTABLE after creation by the same rule set that forbids gh pr edit on title and body. So the remedy names a channel that cannot be used.

## Options

- Loop on the gate until the mutant dies; OR delete the line to satisfy the referee; OR record unverified-reasoned and propose the gap against the standard

## Outcome

Recorded as unverified-reasoned on PR 175 rather than looped on or papered over, which is the ladder outcome receipts.md prescribes: a tracked downgrade beats a false fixed. The gap is PROPOSED against receipts/gates@1.1, never legislated locally — an agent may surface a gap in the standard and may never promote a finding into a project-local verification mandate, so no home-grown census or bypass is added here. The gap as stated: G14's equivalent-mutant escape requires a declaration in an immutable body about a sample drawn after that body was fixed, leaving an honest author with no compliant path. A workable fix would be an out-of-band acknowledgement the enforcer reads, such as a labelled comment or a tracked file, rather than the body. Two collateral facts worth keeping: deleting an unassertable surface is usually the better half of a G14 fix, because a line no test can distinguish is a line carrying no behaviour; and a local mutation harness whose operator only matches statement-initial returns will miss exactly this mutant, which is why the CI sample found what the local run of ninety-five did not.
