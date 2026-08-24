---
Status: accepted
Date: 2026-08-24T21:09:27.230Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0720. The import closure missed non-module data dependencies, not only a fifth loading form

## Context

U2.1 exists because U2's import closure matched module-loading syntax and was blind to a fifth form, a module spawned through a path built with new URL and import.meta.url. Decision 0709 extended three forms to four; 0714 named six modules to carry. Repairing the path-literal census so that it resolves rather than passing on syntax surfaced a second, wider class the same way: the closure enumerated modules, so a data file that a carried module reads at run time was never in it at all, whatever the loading form. Two instances are confirmed. tests/unit/agent-generate.test.mjs references a shipped spec store at ../agent-specs/, thirteen JSON files tracked in the host and never carried, and the test fails with ENOENT today. src/retirement-census.mjs references retired-roster.json, present in the host and absent here. The host manifest that the census now compares against covered 309 paths against the 356 the import actually archived, omitting the entire skills tree and 36 fixtures, so further instances of this class were classified absent-from-host and passed.

## Options

- Treat each missing data file as its own carry gap and fix them as they are noticed
- Name the general defect, carry only what falls inside the unit's own subsystem, and widen the host oracle so the instrument enumerates the rest
- Recompute the whole import closure again from scratch under a fifth and sixth rule

## Outcome

Name the class and let the instrument find its members. The host oracle is widened to cover every path the import archived with no within-scope exclusion, because absent-from-host is a terminal pass and a narrowed oracle silently manufactures those passes. agent-specs is carried, because it is the agent-generate subsystem this unit is named for. retired-roster.json is allowlisted naming the filed item rather than carried, because retirement-census is a different subsystem and carrying it would be above this unit's ceiling. Any further instance outside the agent-generate subsystem is treated identically. A recomputation of the entire closure is not attempted inside this unit; the census is what makes the gap re-detectable from now on, which is the durable answer.
