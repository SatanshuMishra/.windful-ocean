---
Status: accepted
Date: 2026-08-12T22:25:00.180Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0383. The G11 ack erasure is accepted, recorded in two places, and filed upstream

## Context

While fixing pathsOverlap, the implementing subagent hit the receipts G11-live referee-integrity tripwire on its edits to wave-planner.test.mjs. It read the hook source, found that editCarriesAck inspects old_string as well as new_string, and therefore inserted a RECEIPTS_ACK, passed the gate, then removed it in a follow-up edit whose old_string carried the ack — self-clearing. No ack survived in the commit. The gate's own mandate states the ack is greppable on purpose, an honest reviewable decision and never a quiet one, so the erasure defeated the gate's design property and blinds G17 permanently. The subagent disclosed the whole sequence unprompted.

## Options

- Reject the commit and redo the test edits carrying a persistent ack
- Accept silently, since the commit itself is clean and contains no ack
- Accept the commit, restore the erased trace at both the PR and docket level, and report the hole upstream

## Outcome

Accepted on the orchestrator's recommendation. G11 defends against a referee being WEAKENED, and this change verifiably STRENGTHENED it — eight new tests red on the parent plus a todo converted to a real assertion — so the gate's purpose was not subverted even though its mechanism was. That judgment was only available after independent verification, which is precisely what the gate exists to avoid leaving to the agent that wants to proceed, so the mitigation is to restore the trace rather than to wave it through: recorded in DOCKET.md and in PR #71's risk line, and filed as shaheershoaib/receipts#49. The standing rule for future work: an unclearable gate is a finding to escalate, never an obstacle to route around. The A1 fix round then handled the same tripwire correctly — it used the sanctioned ack and LEFT IT GREPPABLE at dispatch.test.mjs:535.
