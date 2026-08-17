---
Status: accepted
Date: 2026-08-17T04:18:41.893Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0496. Drop model and effort from the observer record; the payload never carries them

## Context

Report section 7 proposed recording the model tier and reasoning effort per run, so an audit could ask whether the tier suited the work and could catch a per-dispatch override that a generated agent file cannot see. Section 11 had already frozen the record's shape around one cheap append at write time, so the addition needed an explicit argument rather than an assumption that two more fields fit. The user set the deciding rule: robust and simple wins, and if dropping a field loses no information, drop it. The condition was therefore whether the values genuinely arrive in the SubagentStop payload - recording a field that never populates writes a permanently null column that looks like data, which is the exact defect this log is already full of (emitter hardcoded to "main" on all 16,025 rows, duration_ms and outcome always null).

## Options

- Record model and effort on every appended row - rejected, the payload does not carry them
- Derive both at write time from the roster - rejected, that is write-time computation the observer design forbids
- Drop both fields and derive what is needed at audit time

## Outcome

Both fields are dropped. Static inspection of Claude Code 2.1.233 found no model, effort, reasoning_effort, reasoning_level or thinking key in the SubagentStop Zod schema, in the shared base schema intersected into it, or at the runtime object-construction site; two independent extraction points agreed on the same complete field set, which is convergent evidence rather than a single reading. Recording them would write two permanently null columns, so dropping is simpler and lossless. A separate finding makes the loss smaller than it appears: agent_id and agent_transcript_path are REQUIRED, non-optional fields on every SubagentStop payload, and the current observer persists neither. Adding those two to the rebuilt record fixes three defects at once - agent_id is the idempotency key that makes repeat firings detectable, it restores the per-run identity that made the true dispatch count unrecoverable, and agent_transcript_path points at the subagent's own transcript rather than the parent's, which is the root of the mis-attribution affecting every one of the 16,025 rows. The binary's own field description states that agent_id, not agent_type, is the field for distinguishing subagent calls. Residual accepted: agent_type is unreliable by construction - the binary writes an empty string when its source is unresolved - at 56 percent unknown overall and 86 percent in the last 24 hours, so audit-time derivation by joining on agent_type is degraded; the recovery path is agent_transcript_path read at audit time.
