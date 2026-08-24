---
Status: accepted
Date: 2026-08-24T04:14:30.560Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0701. The extraction ships as twenty-two units in a corrected order, not the sixteen the spec listed

## Context

The extraction specification lists sixteen units and a dependency order. Reading it in full against the live tree found twenty-two places where it is silent, self-contradictory, or not executable as written. Three are structural. The publication gate is specified to run first, but it must be built inside a repository that the import unit creates and it cannot pass until a later unit removes a host path from a test, so it cannot be first. The host-removal unit must prove the skill loads from the installed plugin, which requires a published repository, so it depends on the publication unit and the specification's graph has no such edge. And no unit owns the import of the out-of-repo harness, the live-lane directory, or the relocation of the test tree and its import rewrite, all of which the specification describes in prose and assigns to nobody. Separately the specification states that each step of the host cleanup is its own pull request, which contradicts bundling three steps into one unit.

## Options

- Execute the sixteen units in the stated order and resolve each contradiction when it is reached
- Re-derive an order from the real dependencies, split the units that cannot ship green as one change, file the missing work as a new item, and assign every unowned file to exactly one unit before starting

## Outcome

Option 2. The publication gate moves after the units that clean the tree. Publication moves before host removal. Two host units split into three each, because the specification's own sentence about one pull request per step is more specific than its unit boundaries. The vacuity guard splits in two, because three of its six required proofs need a replay lane that a later unit builds, and declaring a lane with no scenarios makes its own empty-domain check fail. One new unit is filed above the specification's ceiling for bootstrap continuous integration, because otherwise seven units would ship on local evidence alone; it is filed as a new item rather than folded into an existing unit, as the ceiling rule requires. A file-ownership matrix assigns every harness script and every engine module to exactly one unit or to deletion, and a machine census of that matrix confirms no file is owned twice. The specification remains the ceiling: every acceptance criterion is carried verbatim, and no unit's scope grows.
