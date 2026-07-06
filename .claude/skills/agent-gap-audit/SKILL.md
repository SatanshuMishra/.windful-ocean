---
name: agent-gap-audit
description: Use when the user runs /agent-gap-audit or asks to audit the agent roster for capability gaps, missing specialists, permission failures, or inefficient agents. Replays the Agent Evolution Ledger, clusters gaps, applies the anti-sprawl gate, and produces a cited report with recommended roster changes. On-demand only.
---

# Agent Gap Audit

Manual audit of the Agent Evolution Ledger (`~/.claude/agent-ledger/`). Governed by `~/.claude/rules/common/agent-roster.md`. Never auto-runs.

Set `AGENT_LEDGER_SUPPRESS=1` in the environment for every subagent this skill dispatches, so audit-time research does not pollute the gap log.

## Steps

1. Rebuild the read-model:
   `AGENT_LEDGER_SUPPRESS=1 node ~/.claude/hooks/agent-ledger/agent-ledger-index.mjs`
   Then read `~/.claude/agent-ledger/index/gaps.json` and `index/agent-baselines.json`.

2. Select actionable gaps: entries with `status == "actionable"` (already past the Rule-of-Three gate). Also flag `agent_run` outliers: any agent whose recent runs exceed its own `p90_duplicate_ratio` or `p90_tool_calls` in the baselines. Surface outliers for human review only; never auto-conclude a step was wasteful.

3. Research each actionable gap: dispatch the `researcher` agent (recursively as needed) to characterize the missing capability and survey how the existing roster (`~/.claude/agents/`, via `roster-index.json`) does or does not cover it. Default hypothesis: extend an existing specialist.

4. Apply the anti-sprawl gate per gap. Compute the three inputs, then:
   `node ~/.claude/hooks/agent-ledger/agent-roster-gate.mjs '{"recurrenceCount":N,"distinctReasonToChange":BOOL,"clearerRouting":BOOL}'`
   A `create` verdict means propose a new agent; `extend` means modify an existing one; `reject` means leave it. Record a `recommendation_rejected` rationale for rejects.

5. Render the report via the `report` skill: pass the gap evidence, the researcher findings, the baselines, and the per-gap recommended diffs (exact agent-file changes). The report is cited and teaching-oriented.

6. On the user's per-recommendation approval, dispatch the appropriate specialist subagent to apply the agent-file change, then record it:
   `node ~/.claude/hooks/agent-ledger/agent-ledger-resolve.mjs '{"gap_id":"...","resolution":"modify|create|delete|merge|split","agent_refs":["..."],"change_summary":"...","notes":"..."}'`

7. Re-run step 1 so the resolved gaps drop out of the actionable set.
