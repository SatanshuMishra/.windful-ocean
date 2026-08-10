---
Status: accepted
Date: 2026-08-10T03:33:43.878Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0312. A coverage receipt is removed once its change merges, because a registry designed to grow cannot keep re-validating history

## Context

Deleting M2, M3 and M4 from the registry was blocked by a measured cascade. In scripts/invariant-coverage-check.mjs the unknown-id check at :319 is ungated while the totality check at :318 is gated by options.scoped, and every file in the coverage directory is validated at :481-490 regardless of scope. So the three ids had to leave all 24 committed coverage entries in the same change - but committing that sweep pulls all 24 into diff scope, which switches totality on for the 22 entries that predate the G track and carry only 12 ids. That demanded 110 rows of verdict prose about already-merged diffs, which is fabricated assurance and was refused. A second defect surfaced in the same measurement: scope reads the committed diff at :396-397, so a working-tree run of the checker reports a false ok and cannot see a failure that only appears at commit time; the receipt as originally specified would have certified a red branch green. The user then named the structural point that reframes all of it - the registry is built to grow, so any model that re-validates every past entry against the live registry means each added or retired invariant retroactively invalidates all history.

## Options

- Remove a coverage receipt once its change is merged, shrinking the checker's domain to current work, with git as the archive - ADOPTED
- Gate the unknown-id check by options.scoped, symmetric with the totality check - rejected, it buys the deletion by making the gate quieter on every untouched entry, and a gate that goes quiet to let a change through is how this thread reached round six
- Add a RETIRED_IDS constant so historical rows may name ids the registry no longer registers - rejected as narrower but still a patch that preserves the broken model and makes the registry remember its dead
- Author the 110 missing rows - rejected outright as fabricated assurance about diffs nobody re-verified
- Archive the entries into a sibling directory instead of deleting them - rejected, git already preserves them with full provenance, so the archive mostly duplicates history while inventing a second place for an escape hatch to live

## Outcome

Adopted. A coverage entry is a point-in-time receipt about one change; its discipline is spent at write time, and once the change merges the receipt is history. Entries whose introducing commit is an ancestor of origin/main are removed from the repository; entries for work still open stay and must be total over the surviving registry ids. Classification is by measured git ancestry, never by a hand-written list of filenames.

No gate is weakened by this. The unknown-id check stays unconditional and the totality check keeps its current scoping; what changes is the checker's DOMAIN, from every receipt ever written to the receipts for current work. That is a data decision rather than a semantics decision, which is why it is preferable to either patch considered above.

The receipt defect is corrected in the same act rather than left to leak: the green half of a coverage receipt is observed AFTER the commit, because scope is defined over the committed diff and a pre-commit green measures the wrong state.

Two residuals are stated rather than closed. First, deletion is safe only if nothing but the checker consumes those entries; that is a gate on the implementing lane, not an assumption. Second, this settles for this lane a tension the invariant-coverage-tax thread was opened to settle in general, and that thread should consume this decision rather than re-derive it.
