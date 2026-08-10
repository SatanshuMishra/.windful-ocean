---
Status: accepted
Date: 2026-08-10T20:11:38.802Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0318. settings.json stays a real live file rather than a promoted symlink, resolving 0286's internal conflict for 0270

## Context

0286 closed without settling whether settings.json ends up a promoted symlink or a real live file, and named that conflict as something this unit must resolve internally. The two sides were the guard's own test at .claude/hooks/tests/protect-claude-config.test.mjs:194, which probed as though settings.json were promoted, and decision 0270, which held it real. The question is load-bearing rather than cosmetic: if settings.json were promoted, every converge would rewrite a symlink target under the live root, and the guard that protects the checkout would be reasoning about the wrong object. Measured on 2026-08-10 against the unit at c536028, the code had already answered it and the answer was never written down: settings.json appears in neither PROMOTED_ENTRIES (10 entries) nor CUTOVER_ENTRIES (11 entries), and commit af08c0b reconciles the declared settings ONTO the live file rather than replacing it with a link.

## Options

- settings.json is a real live file that promotion reconciles onto - ADOPTED, and it is what the shipped code already does. It keeps one writable live file that a human can edit directly, and it keeps ownership arbitration in manifest.mjs where unknown keys default to LIVE WINS and are flagged rather than dropped.
- settings.json becomes a promoted symlink like the other ten entries. Rejected: it makes every human edit to live settings a write into a release directory that the next promotion replaces, and it would require the ownership manifest to arbitrate against a file it does not own.
- Leave the conflict unresolved and let the guard test stand as written. Rejected: 0286 names this as a conflict the unit must settle, and an unresolved probe set is exactly how the guard silently falls through to a weaker match after cutover.

## Outcome

Adopted 2026-08-10, confirming 0270 and retiring the opposing reading. settings.json is a real live file; the cutover does not link it and promotion reconciles declared settings onto it. The guard test's old probe set was on the wrong side of the question and was corrected inside this unit rather than left to be discovered after a live swap. This closes the one item 0286 explicitly deferred into the unit, so no part of 0286 is now outstanding. Consequence to carry into the swap: the live settings.json is NOT restored by a cutover rollback, because rollback authority only covers entries the verb links, so any settings.json change made during or after the swap is a separate human-owned edit with no tool-supported undo.
