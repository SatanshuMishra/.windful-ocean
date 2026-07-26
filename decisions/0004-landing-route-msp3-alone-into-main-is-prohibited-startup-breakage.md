---
Status: accepted
Date: 2026-07-26T19:23:11.817Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0004. Landing msp3 alone is prohibited: it carries the two startup-breaking D4 denies; only the merged chore+msp3 tree is safe

## Context

Executing the corrected Step 0 from decision 0003 (land fix/mitosis-msp3-low-folds). Verifying preconditions before merging surfaced a hazard that voids the landing plan as recommended. Nothing was merged, switched, or deleted.

## Options

- Land fix/mitosis-msp3-low-folds alone into main and check out main (the plan as recommended in 0003)
- Land only the merged chore+msp3 pair, never checking out a branch that carries the 40-deny settings (CHOSEN constraint)
- Do not land at all and leave the anchor dangling

## Outcome

CHOSEN: option 2 as a binding CONSTRAINT. The specific landing route remains the user's call; what is locked is that any route passing through a 40-deny checkout is prohibited.

THE HAZARD. `fix/mitosis-msp3-low-folds` carries settings.json with 40 denies INCLUDING both D4 `Write(...)` entries - the exact two that break Claude Code startup and whose removal is the #1 standing risk on this thread. The removal commit a923763 lives ONLY on `chore/ledger-v2-archive-and-seed`. The two branches DIVERGED at f9e43a5 (chore +4, msp3 +14) and neither is an ancestor of the other. Counts verified: chore 38 denies / 0 Write denies, msp3 40 / 2, main 29 / 0.

WHY THE RECOMMENDED PLAN FAILS TWICE. (a) Merging msp3 into main does NOT undangle the anchor at all, because `~/.claude/lib` resolves through the main checkout's WORKING TREE and that checkout sits on `chore/ledger-v2-archive-and-seed`, not main. (b) Following through to make it effective - checking out main after landing msp3 alone - writes the 40-deny settings into the live global config through the `~/.claude/settings.json` symlink and restores the startup breakage. The 0003 Step 0 is therefore necessary but not sufficient.

THE SAFE TREE EXISTS AND IS VERIFIED. `git merge-tree` of chore + msp3 is CONFLICT-FREE and yields tree ef8b130. msp3 never touched settings.json after the fork, so the merge takes chore's version. That tree simultaneously satisfies every constraint: 38 denies, 0 Write denies, `Bash(node:*)` still present (no PR blackout), `mitosis-git.mjs` present (anchor undangles), `bin/` absent and `gh-merge-shim.mjs` tracked (the ratified 3a dispositions).

UNTRACKED COLLISION, DISPOSED. Two untracked working-tree files would be overwritten: `gh-merge-shim.mjs` is BYTE-IDENTICAL to the tracked version (zero loss), and `tests/gh-merge-shim.test.mjs` is the SUPERSEDED 528-line pre-disposition copy still carrying the `bin/`-dependent e2e tier that the ratified 3a decision deliberately deleted; the merged 374-line file is its ratified successor. Clearing these three untracked paths re-applies a dual-reviewed disposition rather than discarding new work - but per the standing risk they get MOVED ASIDE, never deleted.

LOCAL WORK IS SAFE. The four modified tracked files (both block-destructive-bash hook files, .drift-state.json, no-self-merge-consent.test.mjs) do NOT intersect the merge's 12 changed paths, so the merge preserves them. stash@{0} is untouched.

NOTE: option 1 was the plan carried in 0003 and is now retired by evidence; 0003's other findings stand.
