---
Status: accepted
Date: 2026-08-18T19:28:23.022Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0585. The status rename goes expand-migrate-contract, and the file lists were drawn from writers not readers

## Context

M2 halted before dispatching any maker: its acceptance leg requiring the literal 'shipped' to survive only in the adapter was unsatisfiable, because that literal lives in six production files and three of them - ship-plan.mjs, reconcile.mjs, divergence.mjs - were named in no unit across all sixteen. A straight rename would break unowned readers and collide with M4's file; adding progress alongside a retained status would leave the writers emitting 'shipped' forever. This was the second consecutive unit blocked on the same shape of defect, after M12a.

## Options

- Rename status to progress inside M2 and let the unowned readers break
- Add progress alongside a hand-written status and accept that the census leg can never pass
- Phase the rename expand-migrate-contract with a derived mirror, and sweep every remaining unit's file list for the same defect

## Outcome

Chose the phased rename, which is a third option that did not exist inside M2's file set - and that was the diagnosis: unit boundaries were drawn from what each unit WRITES, never from what READS the data it changes. EXPAND in M2: writers emit progress as authoritative and keep status as a DERIVED MIRROR computed by legacyStatusOf, never hand-written, so every existing reader keeps working untouched and recovery.mjs:184's terminal guard is replaced by mergeProgress rather than kept. MIGRATE in M4 and a new M4b. CONTRACT in a new M17 that deletes the mirror last, which is the only point where the census leg becomes satisfiable. This does not contradict the clean-cut ratification, which was about external consumers; nothing outside the repo parses the summary, and in-repo readers are what force the phasing. THE SWEEP FOUND FOUR MORE UNITS WRONG THE SAME WAY: M3 missed fold-run-log.mjs, a standalone CLI, and the journal fixtures; M8 missed a SECOND boundary-gate path carrying the identical defect at run-engine.mjs:303,508, which moves M12b-2 from wave 5 to wave 3 so the legacy path dies first; M6 missed the e2e CLI runner that parses the summary; and M12b-3's green deletion moves into M5 because it orphans greenOf. The census rule becomes a syntactic-role classifier over eight token classes built on js-scan's existing halt primitive, so outcome.mjs and ship-plan.mjs are classified BY RULE rather than exempted by hand. ship-plan.mjs:22 turned out not to be an orphan at all - it is a correctly-named member of ship's own outcome vocabulary. The fold's silent park-swallow at run-log.mjs:47-50 hardens inside M2, because A1 makes the throw frequent and shipping M2 without it would have M2 itself increase silent data loss. Stack grows from sixteen units to twenty.
