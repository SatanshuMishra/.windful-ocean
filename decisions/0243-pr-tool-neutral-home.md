---
Status: accepted
Date: 2026-08-04T22:29:17.121Z
Thread-Id: 01KZ7E99K1XD4SCXTFHKNCRARZ
---

# 0243. Relocate the PR tool to .claude/lib/git/pr.mjs with no shim at the old path

## Context

The centralized PR tool lived at .claude/lib/superpowers-parallel/mitosis-git.mjs. Both name segments misled: the directory was named for a superseded parallel-execution system, the filename for one consumer. A global rule and a global gate route every PR in every repo through it, so models reading that path concluded it was Mitosis-internal and reached for gh pr create. The 2026-07-27 centralization spec had re-ratified the location on purpose, so this reverses a considered prior decision rather than correcting an oversight.

## Options

- Leave it in place, as the 2026-07-27 spec decided - zero risk, but the misleading name keeps causing the failure
- Move only the generic parts (pr-format plus a new pr-create entry point) to a neutral home - two entry points, two things the gate must admit, drift
- Move the whole tool to a neutral home and leave a back-compat shim at the old path - two valid paths the gate must allow forever
- Move the whole tool to .claude/lib/git/pr.mjs with no shim, one tool one path

## Outcome

Chose the no-shim move. Everything here is one repo behind symlinks, so there is no external consumer to break, and a second valid path would mean the gate must admit both forever with drift between them. The three verbs (pr-create, pr-close, compare) keep their names - renaming them is cosmetic churn against a large passing suite. pr.mjs keeps importing gh-merge-shim, checkpoint and merge-watch from ../superpowers-parallel/ via relative path: moving those would break run-engine and many siblings, and duplicating them would create drift. That import edge is invisible to callers, and what a model sees - the invocation path - is now neutral. The gate's selfwrap was re-anchored on the path tail lib/git/pr.mjs rather than a bare filename, which is strictly tighter than the previous pattern that matched that name anywhere on disk.
