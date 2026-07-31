---
Status: accepted
Date: 2026-07-31T21:47:12.305Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0166. P2 defect register, anchors re-derived at 9e36674 by the orchestrator

## Context

Decision 0165 blocked the P2 PR on prose findings from a code review. This record is the precise, actionable form: every anchor below was re-derived by orchestrator execution against the live tree on fix/m2-monotone-status at 9e36674, NOT copied from the reviewer, per M5 and 0148. Fix these in a fresh session before the PR opens. Branch is local only, nothing pushed. Suite is green at 1818 pass / 0 fail WITH these defects present, so the suite is not the gate here.

## Options

- Open the PR and fix in follow-ups
- Fix all five, re-verify, then open

## Outcome

FIX ALL FIVE BEFORE THE PR. Ordered, each with the anchor VERIFIED at 9e36674 and the required change.

D1 HIGH, false log line pinned by a test. status-facts.mjs:18 hardcodes the suffix 'the derived status is unchanged' for BOTH vetoes, and mitosis.js:3885 emits it with heldAdvance 'awaiting' for the CONDEMNED case, where the code immediately below rewrites those same ids to status parked with a fresh resumePoint. The sentence is false for the condemned path and contradicts the RESET line above it. The two frontier-train-e2e assertions added in 6b11f25 assert that text verbatim, so it is now a contract. FIX: give the condemned case its own rendering that states the unit is reset to parked, and update both e2e assertions in the SAME commit. Note the twin: status-facts.mjs:18 has its inline copy at mitosis.js:553, so both land together.

D2 MEDIUM, fabricated derivation wrapping an unguarded throw, same call site. mitosis.js:3885 passes advanceVeto({ status: 'built', resumePoint: null, condemned: true }) - three literals unrelated to the unit's real state, engineered so advanceVeto's first branch (status-facts.mjs:9, twin mitosis.js:544) returns the constant. vetoLogLine THROWS on any name outside ADVANCE_VETOES (status-facts.mjs:15-17, twin mitosis.js:550-552) and this call is NOT wrapped, while the sibling persistParkCheckpoint three lines above IS. Reordering advanceVeto's two branches would crash the reconcile loop. FIX: log(vetoLogLine(id, VETO_CONDEMNED, 'awaiting')) with the corrected rendering from D1.

D3 MEDIUM, the H-C error class repeated - the most consequential. parking.mjs:114 coerces builtUnits to an EMPTY Set whenever it is not a Set and not an Array, and :120 gates ref synthesis on builtSet.has(msp.id). So a MISSING observation and a genuinely-empty one collapse to the same value, and both yield no ref for any unit. The value comes from mitosis.js:3817-3818, mergePaginated over recon.checkpointRefPages, and the agent prompt at mitosis.js:3766 explicitly instructs 'Return checkpointRefPages=[] (an empty array) if there is no remote or no such ref'. An empty array is therefore an EXPECTED agent return, indistinguishable from unobserved. Consequence: every manifest-built unit gets ref null, is still routed built, and parks for a human. This is exactly what 0159 refuted for H-C - absence from an incomplete listing treated as evidence of non-existence - with pagination in place of the 200-item PR cap. The new parking test 'an omitted or unusable built-unit fact carries no id, so no ref is synthesized for anyone' BLESSES the failure mode and must be rewritten, not kept. FIX: distinguish three states - observation absent or unusable (fall back to the deterministic ref, preserving today's behaviour), observation present and populated but omitting the id (gate, which is the honest H-B fix), observation present and empty (decide explicitly and record it). Twin at mitosis.js, land together.

D4 MEDIUM, unpoliced third copy. status-fold-characterization.test.mjs:7 declares foldAsWrittenBeforeExtraction, a standalone reimplementation of the fold used at :35, :42 and :60. It does not import the extracted module. After 9363558 it asserts the same goldens from status-fold-cases.mjs that status-facts.test.mjs asserts against the real foldObservedStatus, so it can no longer catch a production regression while looking like it does, and mirror-guard cannot police it because libModuleNames() reads only the lib directory. This is the same shape as how msp-file-scope.mjs became an unpoliced twin. FIX: delete the transcription and its bespoke tests, keep status-fold-cases.mjs, now that M4 is discharged by commit order (f04b8de precedes 9363558, verified).

D5 LOW, the fold is no longer total. status-facts.mjs:22 defaults log to a no-op and emit is called INSIDE the second reduce. If an injected sink throws, the fold aborts and every transition already accumulated is discarded; the pre-extraction veto branch was a bare return and could not throw. FIX: collect veto lines and emit after the fold returns, or guard the emit.

Also required before push, not code: unset the upstream on docs/track-m2-mirror-gaps-plan, the only branch of the three carrying branch.<name>.remote=origin with merge=refs/heads/main, inherited from autoSetupMerge; and retitle P2 away from any monotone-status claim, which 0164 refutes - registry M2 is the closed census, not monotone status.
