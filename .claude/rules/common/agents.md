# Agent Orchestration

## Parallelism is decided by shared state, not by role

Two dispatches that touch disjoint files and share no state go out in ONE message, as multiple tool calls. Two that do not — where one consumes the other's output, or both would edit the same file — go sequentially.

Role is not the test. Two reviewers of the same diff share no state and run together. Two makers editing the same file share a working tree and do not.

## A dispatching agent's clock is the sum of its children

An agent that dispatches eight children one at a time takes as long as those eight children take. Measured over 144 `delivery-lead` runs in this configuration (September 2026 observer log), the sum of child time was 97% of the parent's wall time; the parent's own reasoning was the remaining 3%.

The levers that follow from that are dispatching FEWER children and overlapping the independent ones. Picking a faster model for the parent is not a lever — it targets the 3%.

## Turn lifetime (a harness property, not a setting)

A child agent does not survive its parent's turn ending, and there is no supported way for an agent to wait on a child, end its turn, and be resumed. A dispatching agent finishes its work inside one turn or hands back.

Never dispatch an agent whose only purpose is to keep a turn alive. It produces nothing, and its completion notices are noise for whoever reads the hand-back.

## Fan-out is paid for per dispatch

Every subagent re-receives CLAUDE.md and every `.claude/rules/**` file at dispatch. Fan-out multiplies that cost. Dispatch because a surface needs a different agent, never to parallelise for its own sake.

## Multi-Perspective Analysis

For complex problems, split-role sub-agents (where multiple subagents review the same artifact from different angles) produce higher-quality output than a single review pass. Use sparingly: complex security/architecture decisions, not routine reviews.

## See Also

Project-level rules in `<project>/.claude/agents/` define available subagents for that project. Global subagents in `~/.claude/agents/` apply across all projects (installed via Spec B of the 2026-05-14 redesign).
