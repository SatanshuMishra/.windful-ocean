---
Status: accepted
Date: 2026-08-16T20:59:10.136Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0482. Keep the code-reviewer agent, adopt receiving-code-review, drop requesting-code-review

## Context

The user asked why the roster uses a code-reviewer agent rather than the /code-review command, and what requesting-code-review and receiving-code-review do.

An audit found FIVE distinct surfaces sharing the name, not two. The built-in /code-review at five effort levels, compiled into the CLI binary, with its own fan-out and a CONFIRMED/PLAUSIBLE/REFUTED verification pass reporting through a ReportFindings tool. The built-in /code-review ultra, cloud-hosted and billed, whose own text says an agent cannot launch it. A marketplace plugin /code-review:code-review that shares the name but is CI automation posting a PR comment. superpowers requesting-code-review, which dispatches one general-purpose subagent from a template. superpowers receiving-code-review, which dispatches nothing.

The configuration had already drawn the boundary itself at .claude/agents/code-reviewer.md:14 - the main-thread review commands are the surfaces that apply or comment on fixes, and this agent's sole job is to find and report.

An Anthropic verification-skills video was reviewed for input here. It contributed a receipt shape but says nothing about review loops, when review ends, or subagents, and that is reported rather than overstated.

## Options

- Route the roster's review through the built-in /code-review command
- Adopt superpowers requesting-code-review as the dispatch procedure
- Keep the code-reviewer agent as the dispatchable primitive and adopt only receiving-code-review

## Outcome

code-reviewer remains the dispatchable find primitive, because it is the only surface built against this project's own standards and the only one that returns a value to the caller rather than printing or posting.

receiving-code-review is ADOPTED and preloaded by both code-reviewer and security-reviewer. It is orthogonal to whichever reviewer is used and improves all of them: verify each claim against the codebase before implementing, stop and ask when feedback is unclear rather than implementing half of it, apply a YAGNI check to do-it-properly suggestions, and never respond with performative agreement. It is the natural partner to the closed-question mechanism.

requesting-code-review is DROPPED. It duplicates what delivery-lead already does and routes to a generic general-purpose agent instead of the project-aware one.

/code-review stays the user's own main-thread tool. Its ultra mode is categorically closed to agents.

From the same video, the Receipt mechanism gains a fixed four-field shape including "Tests weakened: no" - the same invariant as gate G11, but stated as a field the agent must fill rather than a check it never sees.
