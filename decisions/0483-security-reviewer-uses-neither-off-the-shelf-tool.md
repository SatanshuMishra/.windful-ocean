---
Status: accepted
Date: 2026-08-16T20:59:19.744Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0483. security-reviewer uses neither /security-review nor claude-security

## Context

The user asked whether security-reviewer should use /security-review or the claude-security plugin, noting they may personalise this area later.

Two premises turned out to be wrong, the report's and the question's. The round-2 report described claude-security as a live choice with five sub-agents. It is NOT INSTALLED - absent from enabledPlugins in both the global and project settings and from the global config file, present only as a marketplace mirror on disk. It has six dispatchable agents plus an orchestrator, not five. What IS installed is a different plugin, security-guidance.

More decisively, neither tool is reachable by a dispatched agent. Subagents have no command layer at all, and claude-security additionally sets disable-model-invocation true, making it human-typed only.

The configuration had already drawn this boundary at .claude/agents/security-reviewer.md:14, in the same shape as its code-reviewer sibling.

Anthropic documents /security-review, the GitHub Action and the claude-security plugin as separate non-overlapping offerings and states no preference between them.

## Options

- Wire /security-review into the security-reviewer agent
- Install claude-security and route security review through its pipeline
- Use neither as an agent dependency; keep /security-review as a human-run second opinion

## Outcome

security-reviewer uses neither, because mechanically it cannot. It stays the isolated read-only find primitive it already is, dispatched by the orchestrator, preloading receiving-code-review.

/security-review stays available for the user to run by hand: bundled, free, cheap, scoped to the branch diff, and understood as a genuinely separate opinion rather than one merged with the agent's output. Running both on one diff would otherwise produce two unreconciled verdicts with nothing to reconcile them.

claude-security stays uninstalled. It is a periodic whole-repository audit tool, not a per-pull-request one, and it can be installed on demand for a deep sweep without disturbing the daily loop.
