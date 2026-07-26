---
Status: accepted
Date: 2026-07-26T19:05:03.450Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0003. 3b stays HELD: recorded Step 0 names the wrong branch, and the dangling anchor is already a live 3c defect

## Context

Disposition of increment 3b (the permission flip) on evidence rather than on the recorded design. Verified against the live tree on 2026-07-26: all 13 branches, both ~/.claude symlinks, the engine anchor literal, and the gh permission surface.

## Options

- Apply 3b now: replace Bash(node:*) with four anchored allows plus the global gh pr create deny
- Keep 3b HELD, correct its Step 0 to the branch that actually carries the wrapper, and land that branch first (CHOSEN)
- Abandon 3b: drop the narrowing permanently and keep Bash(node:*) as the standing grant

## Outcome

CHOSEN: option 2. 3b stays HELD. The four recorded corrections stand and a FIFTH is added; the grounds for holding are now stronger, not weaker.

FIFTH CORRECTION - THE RECORDED STEP 0 NAMES THE WRONG BRANCH. The 2026-07-25 four-corrections record states that `~/.claude/lib` symlinks to the main checkout "(on fix/mitosis-git-actions-robustness)" and that "STEP 0 of any application is landing this branch". Verified false: `fix/mitosis-git-actions-robustness` (f9e43a5) does NOT contain `.claude/lib/superpowers-parallel/mitosis-git.mjs`. A cat-file sweep of all 13 branches finds it on exactly ONE: `fix/mitosis-msp3-low-folds` (9051764). Landing the branch the record names would undangle nothing and would still produce the PR blackout the record was written to prevent.

NEW - THE DANGLING ANCHOR IS ALREADY A LIVE 3c DEFECT, NOT A FUTURE 3b HAZARD. `LIB_DIR` is hardcoded absolute at mitosis.js:23 to `/Users/satanshumishra/.claude/lib/superpowers-parallel`, so it resolves through the MAIN checkout no matter which worktree the engine runs from. 3c routed all three PR-creation sites (:3006, :4066, :4595) through `node ${LIB_DIR}/mitosis-git.mjs pr-create`, removed the free-form gh prose fallback, and 0ecf1bc removed the raw `gh pr create` allow. There is no existsSync guard on the wrapper. Therefore a mitosis run off `fix/mitosis-msp3-low-folds` that reaches a PR-create site today invokes a file that is not at that path: PR creation is BROKEN on that branch right now, with `Bash(node:*)` still live. The permission layer is not the cause and 3b is not the fix.

NEW - THE ANCHOR IS BRANCH-TRANSIENT. Both `~/.claude/lib` and `~/.claude/settings.json` resolve through the main checkout's WORKING TREE, so the global lib dir and the global permission set both track whatever branch that checkout happens to sit on. It currently sits on `chore/ledger-v2-archive-and-seed`, which is neither mitosis branch. Landing to main repairs the anchor only while the checkout stays on a branch containing the wrapper. The record captured the settings half of this; the lib half is new.

THE PROBE IS DECOUPLED FROM LANDING. The permission matcher decides on the command STRING, so the anchor grammar can be probed with the target file absent: an allowed call runs and fails ENOENT, a blocked call never runs, and those outcomes are distinguishable. The anchor probe therefore does NOT depend on Step 0 and can run immediately.

LANDING IS CLEAN. `fix/mitosis-msp3-low-folds..main` = 0 commits and `main..fix/mitosis-msp3-low-folds` = 30, so the branch strictly contains main and f9e43a5; landing is a fast-forward with no divergence, and its worktree is clean.

CORRECTED ORDER: (0) run the human anchor probe now - if the grammar is inert, 3b is dead as designed and the wrapper needs another activation mechanism; (1) land `fix/mitosis-msp3-low-folds`, which is required for 3c correctness regardless of 3b's fate and is NOT merely a 3b precondition; (2) only then re-open 3b, four anchored allows, three-token for pr-create. Landing mutates main and is the user's call; nothing was landed, applied, or pushed in this session.

REJECTED: option 1 (applying today points four allows at an absent file and removes the grant the live engine runs on - PR blackout, and 3-of-7 coverage still reproduces exactly). Option 3 (abandoning strands the recorded stall and misexecution classes and the inexpressible `git -C` class, which the wrapper is the only expressible anchor for).
