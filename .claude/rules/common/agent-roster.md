# Agent Roster Governance

Governs how the specialized-agent roster is grown, observed, and pruned. The roster is a small "smart swiss-army-knife" set, never hundreds of narrow agents.

## Anti-sprawl gate (three-part test)

A recurring capability gap justifies a NEW specialized agent only when ALL three hold; otherwise EXTEND an existing agent (add a tool, widen scope, add a mode):

1. Distinct reason-to-change — genuinely separate scope from every existing agent.
2. Clearer orchestrator routing — the main thread reasons better with it as a named role than with one more parameter on an existing agent.
3. Recurrence — the gap has cleared the Rule-of-Three gate (3+ occurrences across distinct sessions).

Over-narrow proposals (e.g. a "WebGL 3.0 implementer") fail test 1 or 2 and are rejected or folded. Default posture: consolidate before proliferate.

## Observation conventions (model behavior)

These make the roster observable. Both degrade gracefully if omitted.

1. Fallback rationale: when dispatching the `general-purpose` or `claude` built-in agent, prefix the subagent `description` with `FALLBACK-RATIONALE: <why no specialist fit>`.
2. Capability self-report: any agent blocked by a missing tool or permission emits, before returning, a line `CAPABILITY-BLOCKED: needed=<tool-or-capability> task=<short description>`.

## Lifecycle

Gap detection, resolution, and roster edits are recorded in the Agent Evolution Ledger (`~/.claude/agent-ledger/`). Resolutions are new events, never edits to prior events. See the spec at `docs/superpowers/specs/2026-07-02-agent-evolution-ledger-design.md`.
