---
Status: accepted
Date: 2026-08-16T20:58:46.384Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0480. Skills reach agents only by preload, and the dispatch tool goes to Leads only

## Context

The round-2 report claimed an agent "can preload skills via the skills frontmatter field, and can invoke others on demand". An audit of the live configuration falsified the second half and found a harder limit behind it.

An agent's tools line is a STRICT allowlist: a tool absent from it does not exist for that agent. Zero of the 15 current agents list Skill. So no current agent can invoke any skill on demand. Separately and more absolutely, a dispatched subagent can NEVER invoke a slash command, because it receives its system prompt and tool list rather than the session's command layer. That is a platform fact, not a configuration gap.

Consequence for the design: the pairing table's entire on-demand column was unreachable, and anything in it that was a slash command rather than a skill was unreachable permanently.

Separately, the coupling was measured. Skills name agents as live dispatch instructions in at least four skill files; agents name skills three times, all descriptive, never an invocation. Nothing checks either direction. There is no lint on the main branch that detects a dangling skill name or agent name; agent-schema-lint.mjs is not on main and checks something else.

## Options

- Grant the Skill tool to every agent so the on-demand column works as written
- Grant Skill to no agent and rely on preloading alone
- Grant Skill to the four Leads only, and leave Makers, Verifiers and the Scribe on preloading

## Outcome

The Skill tool goes to the four Leads only. Leads compose work, so choosing a procedure is their job; an agent executing a closed instruction should not pick new procedures mid-task. Makers, Verifiers and the Scribe get preloading only. No agent gets slash-command access, because none can have it.

This is the one place the design trades a structural boundary for flexibility, and it is filed as pre-mortem risk R11 rather than hidden - if a Lead starts wandering mid-task, this grant is the first place to look.

Maintenance answer for the user's question about changing the installed skill set: adding a skill is one SKILL.md with two frontmatter fields, no registry and no build step. Removing one is silent until something runs, and then returns a recoverable structured error naming a suggestion. The recommendation is to extend the agent-body drift check with name-integrity checking, because a dangling reference is the same defect as body drift in a different file, and this rebuild's thesis is that a miss must be detectable.
