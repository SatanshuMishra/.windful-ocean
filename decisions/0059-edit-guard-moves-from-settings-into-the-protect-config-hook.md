---
Status: accepted
Date: 2026-07-28T03:58:44.130Z
Thread-Id: 01KYKBMK8J5TTXVV6PHDCHVCCR
---

# 0059. The lib and workflows edit guard moves out of settings.json into protect-claude-config.sh

## Context

Decision 0058 lifted the Edit denies on .claude/lib/** and .claude/workflows/** to "ask" so the centralized-PR-creation work could modify those trees, and left the disposition owed. Reading the config to settle it surfaced that the two settings entries never delivered what they appeared to, in EITHER state: they covered Edit() only, so a Write to the same paths was unrestricted, and they matched a literal repo path while ~/.claude/lib and ~/.claude/workflows are symlinks to those same directories, so an edit addressed through the ~/.claude/... path never matched the glob. Restoring "deny" would therefore have restored a control that was already open in two directions. Meanwhile .claude/hooks/** - which holds the Bash gate itself, the strongest control in the PR system - was already protected only at "ask", by protect-claude-config.sh, a hook that DOES resolve realpath and DOES cover both Edit and Write. A test written before the change came back RED on exactly the four lib/workflows cases and GREEN on hooks/rules/settings, confirming both holes empirically rather than by inspection.

## Options

- Move the guard into protect-claude-config.sh by extending its prefixes tuple from (hooks, rules) to (hooks, rules, lib, workflows), and drop the now-redundant settings entries - one perimeter, covering Edit and Write, resolving the symlinked paths, with the same ask-with-reason semantics already guarding the gate
- Restore the two Edit() entries to deny - status quo ante, which preserves both holes and re-blocks all future maintenance of the PR tool and the mitosis engine until a human lifts it again
- Restore deny and additionally add Write() entries plus ~/.claude/... glob variants - the hardest block available in settings, still bypassable via Bash, and still blocking routine maintenance
- Leave it at ask and close 0058 as-is - no new work, both holes stay open, perimeter stays inconsistent with .claude/hooks

## Outcome

Chosen: move the guard into the hook. protect-claude-config.sh's prefixes went from ("hooks","rules") to ("hooks","rules","lib","workflows") and the two settings entries were removed, leaving permissions.ask absent entirely. Committed as 269e897 with a new test, .claude/hooks/tests/protect-claude-config.test.mjs, that pins all four trees plus settings.json as guarded, a non-guarded control path, and the no-file-path case. Verified 9/9 on the new suite and 1415/1415 on the full suite via the pre-commit hook. This supersedes the ask state recorded in 0058. Note the residual limit, accepted: the guard governs the Edit and Write tools only and does not close Bash-mediated writes.
