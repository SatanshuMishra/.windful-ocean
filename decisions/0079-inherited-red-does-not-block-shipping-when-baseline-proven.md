---
Status: accepted
Date: 2026-07-28T19:44:13.388Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0079. A PR ships onto a red base when the red is proven inherited, never when it is merely assumed

## Context

origin/main's test job was red (20 failures) before this thread's work and is still red after PR #9 merged. The green-branch invariant says a PR merged into any branch must not break that branch's functionality. Read naively it would have frozen all shipping until an unrelated thread fixed the suite. The question was whether inherited red blocks a PR that neither causes nor fixes it, and what standard of proof "inherited" requires.

## Options

- Block shipping until the suite is green - safest reading, but freezes every thread behind one unrelated defect and the suite has no owner in this thread
- Ship on the assertion that the failures look unrelated - fast, but 'looks unrelated' is exactly the reasoning that lets a real regression through
- Ship only after empirically proving the failure set is identical to the base - costs one extra worktree and suite run per PR

## Outcome

Ship, but only on empirical proof. The standard applied: build a pristine worktree at the base commit, run the full suite there, and diff the SORTED FAILING-TEST-NAME SETS against the candidate tree. Identical sets means the PR adds no failure; anything else halts. Baseline measured 1513/1533 pass, candidate 1520/1540, sets identical. Counting failures is NOT sufficient - a fixed failure and a new one net to zero. The invariant is preserved in substance (the PR breaks nothing) rather than in letter (the branch is not green). The PR body carries the inherited red as an explicit Risk so no reviewer reads the merge as an all-clear.
