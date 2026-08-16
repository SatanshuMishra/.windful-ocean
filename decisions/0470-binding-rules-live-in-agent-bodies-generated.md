---
Status: accepted
Date: 2026-08-16T17:38:03.850Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0470. Put load-bearing rules in agent bodies, generated from shared fragments with a drift check

## Context

Two subagent lanes contradicted each other on whether subagents inherit CLAUDE.md and the rules chain. A live context-visibility probe settled it, and a binary probe found the mechanism. Claude Code delivers on TWO channels: the agent's markdown body becomes the system prompt and carries nothing else, while CLAUDE.md and every .claude/rules file arrive as a separate system-reminder user message headed "this context may or may not be relevant to your tasks". Only three built-ins (Explore, Plan, web-fetch) opt out, and that flag is not settable from frontmatter. This explains the CAPABILITY-BLOCKED result: the instruction is visible to every agent and quotable on demand, yet was emitted zero times across 15,573 runs. It is a framing failure, not a delivery failure.

## Options

- Rely on the rules chain to carry obligations - rejected: 15,573 runs of empirical disconfirmation
- Preload a shared house-rules skill via the skills: frontmatter field - insufficient alone: skills carry reference material well but the binding channel is still the body
- Hand-write the load-bearing rules into each of the 13 bodies - rejected: this is what the prior roster did, incompletely and with no way to detect a miss
- Generate agent bodies from shared fragments plus a per-agent section, with a drift check - chosen

## Outcome

Anything an agent MUST do goes in its body, the binding channel. Rules files are for shared reference, never for obligations. This inverts the prior audit's Fact 1, which diagnosed per-agent restatement of shared rules as copy-paste duplication: restatement is correct architecture given the two channels, and the actual defect was that it was hand-maintained, incomplete and unverifiable. The fix is build-time composition - agent bodies generated from shared fragments plus a per-agent section, with a check that fails when a generated file diverges from its source. That delivers the "detect a miss" property the audit found missing, as an executable check rather than a promise. The skills: frontmatter field does exist (confirmed in the 2.1.233 Zod schema) and carries genuinely shared reference material, but it is not the mechanism for obligations. Recorded as a live cost, unmeasured: every dispatch pays for CLAUDE.md plus roughly 25 rules files, and a 13-agent fan-out multiplies it.
