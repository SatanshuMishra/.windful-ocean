---
Status: accepted
Date: 2026-07-26T19:27:21.886Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0005. Step 0 executed: main carries the merged chore+msp3 tree, the anchor is live, and global config now resolves through main

## Context

User selected the land-both-into-main route over merging onto the chore branch or onto msp3, on the grounds that it is the only option that resolves the branch-transient fragility rather than relocating it. Executed under the constraint locked in decision 0004.

## Options

- Land both into main and move the checkout to main (CHOSEN by the user)
- Merge msp3 into the chore branch, no switch
- Merge chore into msp3 and switch the checkout there

## Outcome

DONE. `main` is now cd5c65d and fully contains BOTH source branches (main..chore = 0, main..msp3 = 0). 35 commits sit unpushed; pushing remains out of scope for this thread.

HOW IT WAS DONE SAFELY. The merge was built in a throwaway worktree on a temp branch, never on main. Its tree hashed to ef8b130 - byte-identical to the read-only `git merge-tree` result verified beforehand - so the thing tested is provably the thing landed. The full suite ran there GREEN at 1216/1216 pass, 0 fail, exit 0, matching the previously recorded figure exactly. Only then was main fast-forwarded (ancestry asserted first, so no commit could be lost) and the checkout moved. The temp worktree and branch were removed.

VERIFIED THROUGH THE LIVE SYMLINKS, not inferred. `~/.claude/lib/superpowers-parallel/mitosis-git.mjs` now resolves and EXECUTES, printing its frozen verb list (pr-create, pr-close, compare). Live `~/.claude/settings.json` reads 38 denies, ZERO `Write(...)` denies, `Bash(node:*)` still present. So the startup hazard did not fire and no PR blackout was introduced.

CONSEQUENCES. The live 3c defect recorded in 0003 is REPAIRED: the three PR-creation sites now reach a wrapper that exists. The branch-transient fragility is RESOLVED in its main form - global config resolves through `main`, a stable branch, instead of a feature branch. A residual remains: checking the main checkout out to any branch predating cd5c65d re-dangles the wrapper and, for msp3 specifically, would restore the 40-deny settings.

PRESERVED, NOT DISCARDED. The three colliding untracked paths (`gh-merge-shim.mjs` byte-identical, the superseded 528-line `tests/gh-merge-shim.test.mjs` carrying the disposed e2e tier, and `bin/`) were MOVED to the session scratchpad, never deleted. The four locally-modified tracked files and stash@{0} survived untouched and are still present on main.

STILL OPEN. 3b remains HELD - landing was necessary but is not sufficient, and the anchor grammar `[unverified]` is unchanged because the probe is a human task that no agent can run.
