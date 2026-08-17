---
Status: accepted
Date: 2026-08-17T14:53:38.565Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0519. Retarget a stacked child explicitly; branch deletion closes it rather than moving it

## Context

receipts.md states that "GitHub retargets a child onto the trunk ONLY when its base branch is DELETED", and prescribes merge parent, delete parent branch, confirm the ref is gone, then merge the child. Both halves of that were falsified this session. First: PRs 179 through 183 each retargeted to main on the MERGE of their parent, while every parent branch still existed on the remote - deletion was demonstrably not what moved them. Second: when the six merged-but-undeleted refs were then deleted in one batch, PR 184 - which still named chore/retire-fix-prompt-kind as its base - was CLOSED by GitHub rather than retargeted. Recovery was a deadlock: gh refuses to change the base of a closed pull request, and refuses to reopen one whose base branch is missing. It took pushing the deleted ref back (safe, since its commit was already on main), reopening, retargeting, then deleting the ref again.

## Options

- Keep the receipts.md sequence: delete the parent branch to trigger the retarget
- Retarget each child explicitly with gh pr edit --base main and defer every branch deletion until the last pull request has merged
- Delete parent branches but verify each child retargeted before proceeding, restoring the ref if it closed
- Never stack pull requests at all; rebase each onto main before opening it

## Outcome

Retarget explicitly and defer deletion. The procedure is: merge the parent through the async endpoint, assert its content reached main, then check the child's base and set it with `gh pr edit <child> --base main` if GitHub has not already moved it, and only delete branches once no open pull request names any of them as base. Explicit retargeting still matters even with deletion deferred - a child whose base is a merged-but-present branch would land its content in that dead branch and never reach the trunk, which is the hazard receipts.md was right about even though its mechanism was wrong. Branch deletion is demoted to end-of-run hygiene with no role in retargeting. receipts.md's wording should be corrected; left as a proposed gap against the standard rather than edited unilaterally, per the closed-set rule.
