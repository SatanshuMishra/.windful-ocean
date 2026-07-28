---
Status: accepted
Date: 2026-07-28T19:54:17.140Z
Thread-Id: 01KYKNBCAE9EH8W1S6HJ8XB9XF
---

# 0081. Close the protect-claude-config worktree hole before running mitosis, with a declared carve-out

## Context

protect-claude-config.sh matches guarded prefixes {hooks,rules,lib,workflows} by exact path prefix against exactly two bases: ~/.claude and the symlink-resolved repo .claude. A git worktree at any other root matches neither, so its .claude/workflows/mitosis.js is a real checked-out file that the guard never sees. Mitosis runs MSPs in worktrees by design, so the entire M1-M7 engine diff would have been edited unheld one day after the guard was deliberately hardened for exactly this class of miss.

## Options

- Proceed with worktrees and file the hole as a finding, relying on the human merge gate as the real control
- Close the hole so any .claude root is guarded, then grant an explicit declared carve-out for this run's worktree root
- Abandon worktrees and run the MSPs serially in the main tree with the guard live

## Outcome

Close the hole first, then carve out explicitly. The guard must mean what it claims before it is relied on; an accidental blanket hole is replaced by one narrow, reviewable, revocable exemption that a human must confirm. Branch fix/guard-any-claude-root created at beca874. A supporting discovery: the suite's own protect-claude-config tests already fail in a worktree, so this fix is expected to turn 2 of main's 20 failures green.
