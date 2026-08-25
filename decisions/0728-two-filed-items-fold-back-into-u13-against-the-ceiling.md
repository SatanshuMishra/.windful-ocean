---
Status: accepted
Date: 2026-08-25T06:29:39.821Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0728. Two filed items fold back into U13 by user ruling, against the acceptance ceiling

## Context

PR 4 shipped U13 to its ceiling with all four dispositions met and the receipts gate cleared on a re-derived red-on-base green-on-fix receipt. The lead filed seven items above the ceiling. Two of them are not ordinary above-ceiling discoveries. First, bin/mitosis and bin/mitosis-pr exit 0 with no output even for a real verb, because both entry modules gate their main on direct invocation and a dynamic import never satisfies that gate, so the unit's own BIN disposition passed vacuously and proved nothing. Second, the branch turns the path census from green to red, halting on an extensionless file the census has no classification for, which is a break this diff introduces rather than a gap discovered beside it. The standing rule would file both and ship.

## Options

- Merge as shipped and file both as later work, which is the acceptance-ceiling default
- Fold both back into PR 4 before it merges
- Merge as shipped, fold the census entries into the next unit and leave the shims to the unit that consumes them

## Outcome

Both are fixed in PR 4 before it merges. The ceiling rule exists so that work can terminate, not to force a unit to ship a check that cannot fail or to hand on a guard it just broke; both items are attributable to this diff rather than found beside it. The other five filed items stay filed, and this ruling is explicitly not license to widen further. Two consequences carried. The pull request body is fixed at creation and cannot be amended, so if any line already in it becomes false the pull request is closed and reopened with a superseding reference rather than edited. And the mutation referee generated no mutants on the original diff because every added line was a JSON string literal or a shebang, so the shim repair is the first change in this unit that gate can actually grade, and a surviving mutant there is a real block rather than noise.
