---
Status: accepted
Date: 2026-08-10T16:02:34.037Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0317. The swap is operated by a dedicated fresh-context agent, honoring 0292's hazard rather than its session count

## Context

On 2026-08-10 the user approved proceeding and directed one session to complete every step necessary for the cutover and then perform the cutover. That collides with 0292, which moved the live swap to a session doing nothing else, and with c5, which states the cutover runs serially in a session doing nothing else. 0292's stated reason is specific and worth reading literally: the build consumed the prior session's context to the compaction threshold, and that is precisely the condition under which an operator performing an irreversible live migration should not be operating. The hazard 0292 names is therefore operator degradation plus concurrency with the swap, and session count was the proxy available to it. This session's architecture changes what that proxy measures. The work is executed by dispatched subagents, so the orchestrating context is not the operating context, and the agent that performs the swap can be spawned fresh with the swap as its only instruction. A second constraint was measured at dispatch time and is not a matter of preference: the PR merge is denied to the agent by the user's own permissions config, and 0286 and 0292 both require the binding rehearsal to run against the sha that actually ships, so the swap cannot follow the build without a human merge in between regardless of session policy.

## Options

- Run the swap in this session, operated by a dedicated fresh-context agent with nothing else in flight, after a human merge and a post-merge 0281 rehearsal - ADOPTED. It satisfies the hazard 0292 names rather than the count it used as a proxy, and the enforced human merge gate supplies the deliberation break the dedicated session was buying.
- Refuse the directive and defer the swap to a literally separate session per 0292. Rejected: the user reaffirmed the scope after the conflict was named, the operator-degradation hazard is removed by spawning the swap agent fresh, and the merge gate already forces a break between build and swap.
- Perform the swap in this session from the orchestrating context directly, as 0289 originally directed. Rejected for exactly 0292's reason: that context will have absorbed the review rounds and the rehearsal by the time the swap is reachable, which reproduces the condition 0292 was written to prevent.
- Ask the user to re-decide the session policy before any work starts. Rejected as a blocking question that buys nothing: every phase through the open PR is unaffected by the answer, and the answer is only needed at the swap, after the human merge has already interrupted the run.

## Outcome

Adopted 2026-08-10 on the user's explicit direction, recorded as a divergence rather than a silent reinterpretation, exactly as 0289 and 0292 each did for their own. 0292's substance is preserved and arguably strengthened: the swap operator is spawned fresh with the swap as its only instruction, which removes operator degradation more completely than a fresh session that also carries its own preceding conversation. Three obligations carry into the swap step and none of them are relaxed by this decision. The swap agent runs ALONE with no other agent in flight, per 0275's serialize-and-alone band. The binding 0281 rehearsal runs against the merged sha, with its three faithfulness parts intact, and the pre-merge rehearsal run during the build is explicitly non-authoritative evidence. And the swap remains gated behind a human merge that the agent cannot perform, so the build phase halts at an open PR by construction. What this decision does NOT change: c5's requirement that the first release is built and validated with zero live change before any entry link moves, and c6's requirement that criterion 10 is verified by diffing the live tree against the release rather than asserted.
