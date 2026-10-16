---
name: retro
description: Retrospective on a session transcript that proposes environment changes, most severe first; suggest-only.
disable-model-invocation: true
---

The user asked for a **retrospective**: read a session and propose changes to the agent's **environment** so the next session does not hit the same friction. You are suggest-only. Every file stays as it is; your output is a ranked list of suggestions and, for the ones the user keeps, ready-to-run briefs.

## Steps

1. **Digest the transcript.** Run `node ~/.claude/skills/retro/digest.mjs [transcript.jsonl | session-id]`. With no argument it reads the current session; a session id is looked up under `~/.claude/projects/`. It prints JSON: `friction` (each `hook_block`, `permission_denied`, `tool_error`, `hook_feedback` and `interrupt`, from the session and every subagent), `humanMessages` (what the user typed, so corrections and redirects), `repeatedCalls`, `largeResults`, `fallbackDispatches` (work sent to `general-purpose` or `claude`) and `toolCalls`. Each entry carries the transcript `line`; open one with `sed -n '<line>p' <transcript> | jq` when its excerpt is not enough. Done when every friction entry, human message and repeated call has a cause you can state in one sentence.

2. **Read the environment that shaped it.** For the repository the session worked in: its `CLAUDE.md`, its check commands (`package.json` scripts, Makefile, pre-commit config, CI workflows) and any standards file its reviewers use. For this configuration: the rules in `~/.claude/rules/`, the hooks in `~/.claude/settings.json`, and the agents in `~/.claude/agents/`. Find the guardrail that already exists before proposing one: a check that exists but is unwired or silently broken is the finding, and a repository with no pre-commit hook and no CI job running its lint, typecheck and tests is a finding of its own.

3. **Turn each cause into a candidate**, placed by where its fix lives:

   | The cause | The fix | Where |
   |---|---|---|
   | A **mechanical** mistake: a fixed pattern, a banned command or API, an import shape, a file in the wrong place, a step skipped | A deterministic check that goes red on exactly this mistake | A lint rule, pre-commit hook or CI job in the target repository when it concerns that repository's code; a hook in `.claude/hooks/` wired in `.claude/settings.json` when it concerns how the agent works in every repository |
   | A **judgement call** a reviewer missed | A reviewer standard | The target repository's standards file, or the "Standards to review against" list in `~/.claude/skills/reviewing-code/SKILL.md` for a standard that holds everywhere |
   | Time spent finding a file, command or fact | A **navigation pointer**: one line naming where it lives and when to go there | The target repository's `CLAUDE.md`; the global `CLAUDE.md` only when it holds across repositories |
   | A fact the agent could not reach | Access: a log it can tail, a read-only role, a command | Tooling or a permission allow rule |
   | Repeated calls, oversized results, a slow loop | A narrower command, a script, or an allow rule that removes a prompt | Wherever the call came from |
   | A hook block or permission denial | When the gate was right, the wanted behaviour stated where the agent reads it before acting; when it was wrong, the rule corrected | The rule the gate enforces, or `settings.json` |
   | Work sent to `general-purpose` that a roster agent covers | A sharper description on that agent | `~/.claude/agents/<agent>.md` |
   | A capability no roster agent covers | Extend the closest agent. Propose a new one only when the gap recurs across at least three sessions, has its own reason to change, and makes routing clearer than extending would | `~/.claude/agents/` |
   | Steering text that misled, said nothing, or repeated another file | Restate it positively, or delete it | The rule or `CLAUDE.md` line itself |

   Prefer a check to a sentence: a sentence can be overlooked, a check goes red. A judgement call stays with the reviewer rather than the implementing agent, because the reviewer reads a diff with little else in context while the implementer is busy exploring, writing and debugging.

4. **Rank and write the suggestions**, most severe first: wrong output shipped or data put at risk, then the user having to correct the agent, then wasted time or tokens, then friction that cost little. Each suggestion states the evidence (transcript lines and what happened), the exact change (the file path and the check's command or pattern, or the exact line to add, restate or delete), how that change would have caught this session's mistake, and its cost. A session with no friction worth fixing gets one line saying so.

5. **Let the user choose.** Ask which suggestions to keep, as a multi-select. For each kept one, write a brief that a fresh session can run with nothing else: the repository, the files, the change, and the check that proves it done. Changes to this configuration go to the `.windful-ocean` repository through a pull request, because `~/.claude` links into its live clone.

## Writing a steering change

- State the behaviour wanted. A prohibition makes the banned behaviour more available to the model; keep a ban only where a hook or deny rule enforces it, and pair it with the positive form.
- Delete any instruction the model already follows by default, and any line that restates another file: keep each meaning in one place.
- Always-loaded text costs context on every turn. Put a pointer in `CLAUDE.md` and the detail in the file it points at, and word the pointer so it names the case that should send the agent there.
- Leave to the environment what one command can look up (scripts, config, directory layout); write down only what no file confesses: the convention, the reason, the gotcha.
