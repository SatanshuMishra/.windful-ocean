---
Status: accepted
Date: 2026-08-04T22:29:26.730Z
Thread-Id: 01KZ7E99K1XD4SCXTFHKNCRARZ
---

# 0244. Teach the PR tool through a global skill and a CLAUDE.md bullet, keeping the gate as backstop

## Context

Models only learned the correct PR tool after being denied. Verified causes: ~/.claude/commands does not exist, so the /pr command carrying the exact template was invisible outside this repo; ~/.claude/CLAUDE.md, the one file loaded in every project on every turn, had no git or PR bullet while every other hard invariant had one; and the command description said "in this repo", scoping itself away elsewhere. The rules prose does load globally but arrives buried in roughly 6,000 words of uniformly imperative text, three levels down. Meanwhile gh pr create is one of the strongest priors a coding model has.

## Options

- Keep relying on the gate's deny message as the teaching surface - it is a complete runnable template and the retry always succeeds
- Symlink ~/.claude/commands so /pr works everywhere - still requires the human to type it, never fires for the model
- Convert to a skill under the already-symlinked .claude/skills, plus a one-line CLAUDE.md bullet
- Add a PreToolUse hook that silently rewrites gh pr create into the correct call

## Outcome

Chose the skill plus the CLAUDE.md bullet, with the gate unchanged as backstop. .claude/skills is already symlinked into ~/.claude, so a skill is globally visible with no new plumbing, and unlike a command a skill carries a description the model self-triggers from - the description was made intent-based and repo-neutral, dropping "in this repo". The auto-rewrite hook was rejected on principle: it would have to invent the Why/What/Verification field values, manufacturing exactly the false assurance the honesty rule exists to prevent - a wrong Verified line is worse than a blocked command. Guidance raises the first-attempt rate; only the gate guarantees the invariant, so both layers stay. Confirmed working in-session: the skill appeared in this session's own skill list after #39 landed.
