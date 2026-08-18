---
Status: accepted
Date: 2026-08-18T06:12:17.653Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0570. A green retirement census is not evidence the test tree is clean, and npm test is the only gate there

## Context

Wave 6 shipped with the retirement census at exit 0 and zero sites, all six gate verbs green, and both inertness mutations proven. CI then failed on pull request 211. The cause was a parallel twin U6.1 never swept: mitosis-gate.test.mjs:536 asserts the same derived dispatch table as agent-schema-lint.test.mjs and still expected codebase-analyst, so U6.1 updated one twin and left the other. A grep found two more of the same shape, e2e-substrate.mjs:203 and decompose-emit.test.mjs:226. All three sit under .claude/lib/mitosis/tests/, and the census excludes any directory named tests, fixtures or prompt-snapshots at any depth by declaration - it discloses exactly this in the fourth entry of its own RETIREMENT_NOT_ATTESTED list. So the census was honest and blind at the same moment, and its exit 0 was never a claim about the test tree. The SPEC compounded it: U6.1's deliverable named agent-schema-lint.test.mjs alone, so the twin was outside the written scope and outside the instrument's reach at once. Separately, the CI log's second red line was a Node todo carrying its own diagnostic, wave-planner.test.mjs:137, which is red on main too and is not wave 6's.

## Options

- Treat npm test as the gate for the test tree and sweep twins by hand per unit
- Widen the retirement census to scan tests directories
- Accept the gap and rely on the SPEC's per-unit deliverable lists

## Outcome

The retirement census keeps its declared exclusions and is never widened to scan test directories: the exclusion is what makes it a census over routing instructions rather than over every string in the repository, and a fixture that exists to exercise a code path is data, not an instruction to be rewritten. npm test is the gate for the test tree, and every unit that changes an agent name must sweep .claude/lib/mitosis/ INCLUDING tests, fixtures and prompt-snapshots for all nine names, classifying each hit as must-change, deliberate-synthetic-fixture, or belongs-to-a-later-wave. Relying on the SPEC's per-unit deliverable lists was rejected because those lists have now been measurably incomplete three times - U6.2's missed six sites, U7.1's inherited the wrong census, and U6.1's named one twin of two. The durable rule that falls out: a green census answers only the question its declared scope asks, so read the scope before reading the verdict. Two graders here disagree by construction rather than by fault, and neither is wrong.
