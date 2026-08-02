---
Status: accepted
Date: 2026-08-02T01:24:32.185Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0191. M5 halts pre-ship with the change preserved staged; two of its four blockers were manufactured by the workflow's own verify-before-ship ordering, and only one finding is substantive

## Context

The M5 workflow (wjy3c80jv / wf_eb7805da-fe1, 19 agents, 3.55M subagent tokens, 291 minutes, 0 agent errors) landed the whole change — quiescent exit, continuation block with the M6 identity value, section 11 latency emitter, and all five deletions across both policed twins — then exhausted its two-round remediation cap with four blocker-or-major findings and refused to ship. The orchestrator verified the tree first-hand rather than accepting the report: HEAD still 42e7d49, 12 paths staged, MERGE_POLL_MAX_CYCLES / const mergePoll / progressPossible / maxSteps at zero occurrences across both twins, the A5 instrument deleted with the mechanism it pinned, the five pre-existing dirty paths untouched. Triaging the four findings showed they are not four independent problems. Findings 3 and 4 are one issue and it is an artifact of the workflow script: the implementer and remediator were instructed not to commit, and the Verify phase was ordered before Ship, so the receipt lens ran invariant-coverage-check in pull_request mode against an empty merge-base..HEAD and got exit 1 for a staged-but-uncommitted receipt. Push mode exits 0, the receipt content is independently confirmed correct against the registry, and the receipt's own M1 row declares the obligation candidly. The entire second remediation round was spent on this manufactured condition.

## Options

- Accept all four findings at face value and remediate all four in the next dispatch
- Triage the findings, discard the two the harness manufactured, and carry forward only the two real ones
- Treat the halt as a failed MSP and re-run M5 from scratch on a fresh branch
- Ship as-is on the ground that the receipt declares its own open obligation

## Outcome

TRIAGE STANDS: ONE SUBSTANTIVE FINDING, ONE ONE-LINE HONESTY DEFECT, TWO MANUFACTURED. The change is PRESERVED staged and uncommitted on feat/m5-quiescent-exit and must not be discarded or re-run from scratch; re-running would burn another ~3.5M tokens to reproduce work that is already correct. (1) SUBSTANTIVE: termination on the no-actions path is not observable. Deleting only the quiescent exit's return from both twins (mitosis.js:2384-2387, leases.mjs:158-161) hangs all 60 test files under a 240s cap with ZERO tests reddened, because the spin is synchronous, blocks the event loop, and node:test's { timeout: N } can never fire — even though the project uses that option idiomatically at mitosis-scheduler.test.mjs:354,378,406,459,3242. The epoch-guard half of termination IS properly pinned and reddens cleanly; only the exit half is unprovable. M5 therefore deletes maxSteps while leaving the replacement guarantee unpinned exactly where the deletion made it load-bearing for liveness, and the receipt's M3 row does not disclose that exit-removal manifests as a hang rather than a red. (2) REAL BUT ONE LINE: the receipt's M6 row asserts 'the staged set is empty' while 12 paths are staged, contradicting the same file's M1 row; confirmed first-hand. The M6 verdict survives independent check — only the sentence is false. Nothing mechanical catches it because invariant-coverage-check.mjs never evaluates whether a check string is TRUE (:107-137), which is decision 0143 demonstrated live rather than argued. (3)+(4) MANUFACTURED and dissolve the moment the change is committed. REUSABLE HARNESS LESSON, and it is the durable output of this halt: NEVER place a lens that measures committed state before the phase that commits. Either move the receipt lens after Ship, or have the implementer commit and let Ship only push and open the PR. The A5 shape did not expose this only because A5's receipt lens happened to pass in push mode.
