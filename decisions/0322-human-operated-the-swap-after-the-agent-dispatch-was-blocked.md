---
Status: accepted
Date: 2026-08-10T21:59:09.375Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0322. The human operated the live swap by hand, honoring 0317's hazard after the classifier removed its mechanism

## Context

0317 ruled that the swap is operated by a dedicated fresh-context agent, spawned with the swap as its only instruction, because 0292's real hazard is operator degradation plus concurrency rather than the session count it used as a proxy. On 2026-08-10, with the binding 0281 rehearsal green and the live plan matching the rehearsed classification exactly, that agent was dispatched and the auto-mode permission classifier denied it. The denial names an explicit remedy: stop and let the user decide rather than route around it. Two facts then constrained the choice. The orchestrating context was at 80 percent, so performing the swap inline would have reproduced precisely the condition 0292 and 0317 were written to prevent, and would also have been a workaround of the denial's intent. And the operation itself was as de-risked as it could be made without performing it: 13 rehearsal assertions passed against a faithful scratch root, rollback restored that root byte-for-byte, a second apply/rollback cycle proved repeatability, and the live plan reported the identical 8 link / 2 real / notes link classification the rehearsal had exercised.

## Options

- The user operates the apply by hand, from the tool extract, after the orchestrator surfaces the block and the exact command - ADOPTED. A human operator is not context-degraded, is not concurrent with any other agent, and carries the deliberation the dedicated operator was always meant to supply, so 0317's hazard is satisfied by a different mechanism.
- Re-issue the dispatch with the prompt softened until the classifier admits it. Rejected outright: the denial's own instruction forbids working around its intent, and rewording a live filesystem migration to read as benign is exactly that.
- Perform the apply inline from the orchestrating context. Rejected for 0292's stated reason, which had become literally true: the context stood at 80 percent, having absorbed the provenance investigation and the full rehearsal report.
- Defer the whole swap to a fresh session, as the orchestrator recommended. Not chosen, because the user elected to operate it immediately; it remains the correct fallback had they declined.

## Outcome

Adopted 2026-08-10 and recorded as a divergence rather than a silent reinterpretation, exactly as 0289, 0292 and 0317 each did for their own. 0317's substance is preserved: the operator was fresh, undegraded, uncontended and deliberate, which is what "dedicated fresh-context agent" was purchasing. Its letter is not: no agent operated the swap, and the general rule this sets is that when a control removes 0317's mechanism, the obligation transfers to the human operator rather than lapsing to the orchestrator. Everything downstream held. The apply relinked all 11 entries; verification passed on all seven checks, with one vacuous check caught and replaced by diffing the release against a git archive of 75b90a3d rather than against itself. Two obligations from 0317 were honored and are worth carrying: the rehearsal ran against the merged sha with its three faithfulness parts intact, and the swap ran with no other agent in flight. What this decision does not change: 0317 still governs any future swap, and a blocked dispatch is a stop-and-ask, never a self-authorization to operate live from a loaded context.
