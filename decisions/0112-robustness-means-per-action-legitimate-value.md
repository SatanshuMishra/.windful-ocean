---
Status: accepted
Date: 2026-07-30T04:39:38.581Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0112. Robustness means every action carries legitimate value, not repeated verification

## Context

The user flagged as CRITICAL that reviewing something ten times does not make it robust, that robustness means every action having legitimate value, and that the current approach is very slow at development. This sharpens pillar 1 and therefore changes how every trade-off in the rebuild resolves. Evidence from this thread supports it: 0107 found the test suite evaluates the engine in a more permissive context than production, so its runs had NEGATIVE value by manufacturing false confidence; 0103 reasoned from code presence rather than running a 30-second probe, so an entire audit and research pass rested on an unverified premise that one cheap action would have refuted; and 0103 records a 21-module byte-identity twinning tax where every fix lands twice, the second landing carrying zero information.

## Options

- Keep risk-scaled review depth as the robustness mechanism and accept the development latency
- Redefine robustness as per-action legitimate value: an action earns its place only if it can change a decision
- Reduce verification broadly to gain speed

## Outcome

ADOPTED as a governing principle, ranking with the pillar order. THE TEST: an action earns its place only if it can change a decision. Corollaries - a review that cannot change the outcome is waste; a test that cannot fail is worse than waste because it manufactures false confidence; a check whose result nobody reads is the fabricated-Verified failure the PR honesty rule already forbids, and the remedy is not to run it. FOUR OPERATIVE RULES. (1) Gates over reviews: a gate is deterministic and paid once at install, a review is stochastic and paid per change, so anything a gate can decide - title grammar, file-scope violation, receipt red/green, type errors - never reaches a reviewer. This is simultaneously faster and more robust, which is why speed and robustness are NOT in tension here. (2) A second reviewer is justified only by a DIFFERENT LENS, never by more caution: split-role security plus correctness on an auth diff is legitimate because they see different things, two correctness reviewers is one reviewer plus latency. (3) Falsification before elaboration: order work by cost-to-refute, so every spec carries its cheapest falsifier and that runs BEFORE the spec is written - the 0103-to-0107 sequence is the case study, where 30 seconds of probe would have redirected an entire research pass. (4) One oracle per property at the cheapest layer that can decide it, extending the existing testing.md placement rule from tests to verification and review generally. WHAT IS NOT CUT: actions with asymmetric downside stay even when they rarely fire - fail-closed halting, the green-branch invariant, the receipt, and the deny-gates are high value PER ACTION precisely because their absence is catastrophic. This principle cuts redundancy, never floors. ACKNOWLEDGED TENSION: 0106 names the second-system effect as the primary danger and determinism as a discipline, so cutting process during a rebuild raises that risk; the mitigation is 0110's fix-first ordering with a machine-checkable oracle, not additional reviewers. REVISED LANDING ORDER: (1) test harness that can actually fail, (2) kill the 21-module twinning tax via the workflow() sub-dispatch escape, moved up because it halves the cost of every later step, (3) state model per 0108, (4) restack as a deterministic activity, (5) depth per 0109, (6) fix pipeline per 0110.
