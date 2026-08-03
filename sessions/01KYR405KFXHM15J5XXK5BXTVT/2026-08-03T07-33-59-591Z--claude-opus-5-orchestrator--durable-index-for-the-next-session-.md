M8's TEN INVARIANTS I1-I10, TRANSCRIBED HERE BECAUSE THEIR ONLY OTHER HOME IS EPHEMERAL.

These are the section-1 headings of the M8 final plan (scratchpad m8/plan-final.md, lines 77/106/127/147/170/184/206/227/243/257). That scratchpad is under /private/tmp and a fresh session gets a different directory, so the list is copied here verbatim. The NEXT SESSION'S TASK is to explain these ten to a reader with minimal domain knowledge - what an invariant is, why mitosis is planned invariant-first, what each one says, and how each is enforced plus which test reddens if the enforcement is removed.

I1 - The attempt cap is never exceeded, and a relaunch never spends a fresh cap on a published head.
I2 - No attempt is ever made without a new failure fingerprint.
I3 - Every escalation class parks without a publish, and classes 1-5 park without any dispatch at all.
I4 - A published head is only ever advanced append-only.
I5 - The loop never asserts green.
I6 - The engine never reports a status it cannot substantiate.
I7 - Uncertainty always resolves toward escalation, never toward another attempt.
I8 - Every twinned edit lands in both halves in the same commit.
I9 - The flake probe is at most one no-code-change rerun per published head, and it costs an attempt.
I10 - The two M7 residuals fail closed.

GROUNDING NOTE FOR THE EXPLAINER. Do not explain these from this list alone - the plan is a design document and the code is the authority (F1: anchors stale until re-derived). Re-derive each against the merged tree at 4fd03c2. The principal surfaces: `.claude/lib/superpowers-parallel/ci-escalation.mjs` (the classifier and its constants CI_ATTEMPT_CAP, CI_PUBLISHED_TOKEN, CI_PROBE_TOKEN, CI_FIX_PREFIX, CI_TERMINAL_CONCLUSIONS, CI_ENFORCER_CHECK_TOKENS, CI_SECURITY_CHECK_TOKENS, CI_ORDINARY_CHECK_TOKENS; the functions classifyCiReport, assertionGuardBlocks, ciScopeViolations, sensitivePathsTouched, ciFailureFingerprint, ciAttemptsSpent, ciHeadPublished, ciProbeConsumed), its byte-identical inline twin inside `.claude/workflows/mitosis.js`, the two classifier call sites at mitosis.js:5209 (probe/publish) and mitosis.js:5327 (the diagnose inside runRemediationLoop, which is the one that actually gates every fix dispatch), and the durable `ciAttempts` field that survives park() replacing triedSet wholesale.

TESTS THAT ENFORCE THEM, useful for the "how does it work" half: `.claude/lib/superpowers-parallel/tests/ci-escalation.test.mjs` holds the unit deny-cases for classes 0-6 plus the fingerprint and attempt-counting tests; `.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs:4696` (`CI-CLASS-DENY`) drives all five classes end to end through the real engine and carries the load-bearing assertion that a parked unit makes ZERO ci-probe/ci-fix/ci-diff/ci-publish/ci-publish-verify dispatches; mirror-guard enforces I8; recovery.test.mjs carries the ciAttempts carry-over row that I1 depends on.

CANDID CAVEAT TO CARRY INTO THE EXPLANATION. I1's durability is workspace-scoped, not universal: `.mitosis/` is untracked, so a relaunch from a fresh clone or a CI workspace restores no ciAttempts and the cap restarts, with the reconcile agent observing the open PR as the only remaining brake. Publishing attempt state to the identity ref is forbidden by spec section 12 item 5. That is a recorded spec-conformance bound, not a defect, and an honest explanation of I1 has to name it.