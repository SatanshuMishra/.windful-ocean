---
Status: accepted
Date: 2026-08-18T20:14:06.490Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0590. Pin the closing unit for c5: sidecar-based population, dispatch-grain questions, conditional closure

## Context

PR 217 is merged and its three commits are confirmed ancestors of origin/main at c29829a2 by merge-base rather than by the MERGED label. It fixed the start-row misclassification but left the reciprocal one: the predicate still tests transcript non-nullity among its signals, so all 2631 artifact-less rows are admitted as dispatch. Per 0588 the correct discriminator is depth, populated only from a sidecar the harness creates solely for genuine Task dispatches. A second defect is now in scope rather than filed, and the reason is specific: c5's reworded clause requires THE AUDIT to derive a closed outcome census, and two of the audit's own questions - failed at questions.mjs:89 and fell-back at questions.mjs:55 - still count row-wise and overstate by 42 to 58 percent, with duplicate starts as well as duplicate stops present and one agent emitting 17 start rows. A census that is only correct when computed by a hand-written query outside the instrument does not satisfy a clause about the instrument. This acceptance is pinned BEFORE the work starts and before any re-derived number is read.

## Options

- Ship the predicate swap alone and close c5 on a census computed outside the audit by hand
- Include the two row-wise questions, because the clause is about what the audit derives, not what a hand query can reproduce
- Defer both and leave c5 open indefinitely
- Close c5 now on the measurements already taken, before the predicate is corrected

## Outcome

One closing unit, with acceptance pinned now. Population resolves at dispatch grain on SIDECAR presence via depth, with agent_transcript_path removed from the predicate entirely, since it is a stop-phase marker and never a dispatch signal. The two row-wise questions move to dispatch grain in the same unit. Five acceptance items, all re-runnable: a red-on-parent test whose fixture carries the artifact-less shape the writer really emits - transcript path present, depth null, no start row - currently labelled dispatch and required to be internal; green after; an inertness mutation restoring transcript presence to the predicate that turns the new assertion red; a full suite fail counter of zero; and the three c5 verdicts re-derived THROUGH the audit rather than by hand. c5 CLOSES ONLY IF all three hold on re-derivation: attribution complete over real dispatches in the window, Lead share at or above 50 percent with n at or above 20, and the outcome census closed and halting on the unclassifiable. If any verdict flips, that is the finding and c5 stays open - this conditional is pinned precisely so the result cannot be graded to whatever it turns out to be. Explicitly OUT of this unit and still filed: the 23 dropped starts and the pre-19:00Z regime, the unexplained 31-to-32-second signature whose mechanism was never identified, requireBinary not enforcing the pinned duckdb version, and the suspected-stale agent_type figure.
