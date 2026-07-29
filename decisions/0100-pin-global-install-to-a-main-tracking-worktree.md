---
Status: accepted
Date: 2026-07-29T02:57:38.361Z
Thread-Id: 01KYN9FH92YP5BPNG7ECCV9PJS
---

# 0100. Pin the global Claude install to a main-tracking worktree

## Context

R4, verified 2026-07-28. The global install is a farm of 38 symlinks (10 at ~/.claude depth 1, 26 under ~/.claude/hooks, 2 under ~/.claude/rules) resolving into the primary checkout's WORKING TREE, so it silently serves whatever branch that checkout has out. Today that is feat/centralized-pr-creation: 8 behind and 8 ahead of origin/main, cut at cd5c65d on 2026-07-26, one day before 457d6fa (#5) landed the merge boundary. Consequence: merge-boundary-preflight.mjs (410 lines) and its 668-line test have never existed in the running config - grep -rn merge-boundary-preflight over the live tree returns zero hits - so the gate was never installed, not merely broken. 7 of the 8 commits main has and the install lacks touch the install surface, including beca874 (#9) regex injection guards, b2f45bb (#6) glob ReDoS, 2ef7bb7 (#11) guardrail test hardening and 2c95405 (#10) restore-severed-call-sites; the install-surface diff against main is 1728 deletions across 18 files. The live config additionally carries 8 unmerged commits, 3 uncommitted edits and 2 untracked .bak-pre-promptsfix files inside the guardrail trees, so it exists on no branch and was never reviewed as a whole. Local main is itself stale at cd5c65d, so any pin must name origin/main explicitly.</context>
</invoke>


## Options

- Pin to a dedicated main-tracking git worktree and repoint all 38 symlinks at it
- Keep the symlinks on the primary checkout but park it permanently on main, enforced by a SessionStart guard
- Replace the symlinks with real copies installed from a recorded revision plus a drift check

## Outcome

Option 1, chosen by the user. The install becomes a dedicated git worktree at ~/.claude-install checked out DETACHED at origin/main - detached rather than on a branch so the pin is an explicit revision and cannot collide with a checkout of main elsewhere. It sits outside the repo working tree, so git clean -xfd in the checkout cannot destroy the live install (note .claude/worktrees/ is excluded only via .git/info/exclude), and outside the surface Claude Code scans under ~/.claude. Refresh becomes a deliberate fetch plus re-detach, never an implicit consequence of a branch switch. Rationale: this is the only option that makes the install a reviewed, merged revision BY CONSTRUCTION rather than by discipline, and discipline is exactly what failed here - the same fail-open bug class has now been recorded three times. Under the Three Pillars, Quality outranks the instant-edit ergonomics that are the sole thing given up. VERIFIED CONSEQUENCE, corrected from an earlier draft: repointing to origin/main withdraws almost nothing, because the branch's PR-tool work already shipped to main via 7e2e7d7 (#8) - pr-create appears 32 times in both revisions and .claude/settings.json is byte-identical to main even though 450804e touches it, so feat/centralized-pr-creation is stale duplicate history. .claude/agents, docs, rules, sounds, notes, CLAUDE.md, settings.json and keybindings.json are all byte-identical to main, and so are the hook scripts. The entire substantive regression is one line: main exports execGh from mitosis-git.mjs and the branch keeps it module-private. The migration is applied only under explicit human authorization, never as a silent side effect, because it rewrites the hooks and settings this very session executes.
