# Agent Orchestration

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

- When multiple agents have NO shared state or sequential dependencies, dispatch them in a single message with multiple tool calls.
- When operations depend on each other, run sequentially.

## Multi-Perspective Analysis

For complex problems, split-role sub-agents (where multiple subagents review the same artifact from different angles) produce higher-quality output than a single review pass. Use sparingly: complex security/architecture decisions, not routine reviews.

## See Also

Project-level rules in `<project>/.claude/agents/` define available subagents for that project. Global subagents in `~/.claude/agents/` apply across all projects (installed via Spec B of the 2026-05-14 redesign).
