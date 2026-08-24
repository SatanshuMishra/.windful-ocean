---
Status: accepted
Date: 2026-08-24T23:04:25.663Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0723. The retired-roster carry satisfies the census but not run-time resolution

## Context

U2.2 step 6 carried retired-roster.json into the engine tree to close a path-literal census gap, byte-identical to the host at the import commit. Review found the reader resolves its data file through the canonical configuration directory rather than its own module directory, so nothing in the repository actually reads the carried copy. The carry closed the census gap and left the run-time dependency open. A later session that sees the file present and the census green would reasonably conclude the dependency is satisfied; it is not.

## Options

- Fix the resolution inside U2.2, since the unit is the one that carried the file
- Ship the carry as census-only and assign run-time resolution to the unit that owns path decoupling
- Revert the carry as ineffective and re-derive the whole data-dependency class first

## Outcome

Option two. The carry ships as census-only. U2.2's acceptance criterion asked that the carried data file resolve for the census with no allowlist entry standing, and it does; changing how the reader resolves paths is above that ceiling and belongs to the hermetic-decoupling unit. Filed in the plan as item 2 with U3 as the suggested owner, marked unassigned if U3's ceiling does not reach it. The census being green is therefore NOT evidence the dependency works at run time, and no later unit may treat it as such.
