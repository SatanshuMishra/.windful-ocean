---
Status: accepted
Date: 2026-08-11T16:28:41.270Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0337. Orchestrator autonomy is gated on evidence class, and 0330 is amended to permit typed cross-phase re-entry

## Context

0330 confined the orchestrator to judgment INSIDE a phase, forbidding reorder, skip and re-run. The user rejected that as too narrow, since the whole point of replacing a deterministic .js engine with an agent is that an agent can decide: when an implementer - the first reader of real code in the new model - finds the SPEC contradicted by reality, the orchestrator should resolve it rather than return to the human; when a planning subagent lacks context, the orchestrator should dispatch research itself. A research pass supported the goal but refuted the obvious mechanism. Anthropic's multi-agent research system has a lead agent that autonomously decides whether more research is needed, which is direct precedent for orchestrator-dispatched research. But verbalized confidence tracks commitment rather than correctness (arXiv:2606.29490) and clusters at 80-100% regardless of accuracy, so "escalate when not confident" cannot be built on self-assessment. UnderSpecBench (arXiv:2607.02294) measured explicit refusal at or below 2.5% while clarification requests reached 44.5% - agents ask far more readily than they decline.

## Options

- Evidence-class gate plus typed cross-phase re-entry under a hard budget - chosen
- Keep 0330 unamended: judgment strictly inside a phase
- Full next-step authority over the phase graph
- Self-assessed confidence threshold as the escalation gate

## Outcome

Autonomy is gated on EVIDENCE CLASS, never on self-assessed confidence: the operative question is not "am I confident?" but the checkable "does a deterministic artifact settle this?". 0330 is AMENDED - the orchestrator MAY re-enter an earlier phase for ONE MSP under a typed conflict class with a hard attempt budget held outside the model, and MAY dispatch research agents mid-phase. It still MAY NOT reorder or skip the sequence. 0330's enforcement construction survives in full. The taxonomy: auto-resolve when a verifiable artifact settles it (file absent, signature differs, test output), when in-repo convention already covers the gap, or when dispatched research converges across independent runs; escalate on irreversible or externally-visible consequence, on a novel edge case with no in-repo precedent, on disagreeing or single-source research, and on ANYTHING reaching fallthrough. Default-to-escalate on fallthrough is the load-bearing mechanism - it is the only one with direct evidence of reliability, since it is deterministic rather than judged.
