---
Status: accepted
Date: 2026-08-01T08:52:43.713Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0187. The orphaned toRestack log line is assigned to the next MSP that rewrites the region, not hotfixed, and the restore-path residual gates M5

## Context

M3 left advance.toRestack computed in planReconcile (reconcile.mjs:122/:130 and the mitosis.js twin at :3026/:3034) and printed at mitosis.js:3996, with zero consumers at HEAD - the parent consumed it at mitosis.js:3349. The user asked directly whether this needs fixing. Measured rather than argued: an exhaustive grep confirms the log line is the sole consumer, and restoreIntegrationFromBuiltCheckpoint (mitosis.js:4545) unconditionally instructs git branch -f integrationBranch FETCH_HEAD off the durable checkpoint before ship, so the deleted restack's only product - a move of a local, never-pushed branch - is overwritten before any consumer reads it on the built-resume path.

## Options

- Hotfix the log line now as a standalone one-clause deletion in both twins
- Delete toRestack from planReconcile entirely now, touching reconcile.mjs, its mitosis.js twin and reconcile.test.mjs
- Assign the fix to the next MSP that rewrites the region and record the restore-path residual as an M5 precondition
- Leave it; it is already declared in PR 30's Risk line

## Outcome

ASSIGNED, NOT HOTFIXED, and the two halves are adjudicated separately. The DROPPED BEHAVIOR is probably inert on the evidence above, with one residual that is NOT verified and that gates M5: whether every route by which a built unit reaches ship passes through restoreIntegrationFromBuiltCheckpoint (two callers, :4586 and :4592). If some path ships a built unit without restoring, the restack was load-bearing there and its deletion is a real regression. Check that before M5 builds on this region. The LOG LINE is wrong today and does need fixing - it is the same class as the mislabelled failed that spec section 1 exists to delete, a run reporting something false about itself - but a standalone patch is the wrong shape for three measured reasons: the same string also prints the AIMD W= clause that M4 deletes, M5 rewrites this whole region for the quiescent exit, and the correct fix may extend past the string to removing toRestack from planReconcile, which is a KEPT mechanism (ledger row 16) and a policed twin, making it a three-file change; prompt-snapshot.test.mjs may additionally pin the string, unverified. Patching now would mean three consecutive MSPs editing one line. NOT URGENT: the engine takes no action on toRestack, so nothing is corrupted and no work is lost; the exposure is a misled operator, bounded and already declared in PR 30's Risk line.
