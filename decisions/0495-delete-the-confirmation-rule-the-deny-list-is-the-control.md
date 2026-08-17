---
Status: accepted
Date: 2026-08-17T04:18:21.248Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0495. Delete the destructive-operation confirmation rule; the deny list is the whole control

## Context

Four files state that destructive shell or git operations require explicit confirmation. An audit established the claim cannot be backed by anything. The receipts gates G0 through G17 are post-hoc verification run by a CI enforcer at the pull request and contain no pre-execution concept at all, so the only candidate was the bash gate - and the bash gate's ASK verdict was deleted in two commits: dc8bfb60 on 2026-08-13, which removed exactly the git-specific branches for force-push, reset --hard, clean -f, filter-branch, branch -D and history rewrite that the rule files name almost verbatim, and b4371098 the next day, which removed the VERDICT_ASK token itself and flipped the fault path from ask to deny. The gate can now emit only deny or no-opinion. The confirmation portion has no independent existence in code, so there is nothing to toggle; the only off-switch is the hook registration, which is all-or-nothing and would also drop the live deny protections. The user framed the real question: the configuration's direction is unattended autonomy with guards only on true catastrophes, so a rule instructing the agent to stop and ask a human points the wrong way regardless of how it is worded.

## Options

- Restore the gate's ask verdict - rejected, an interruption prompt is the opposite of the unattended-autonomy goal
- Reword the four lines to describe behaviour rather than claim enforcement - rejected as too conservative, it keeps an anti-autonomous instruction with honest wording
- Replace it with a recoverability rule stopping only on an irreversible uncovered operation - proposed and rejected by the user as unnecessary complexity
- Delete the four claims outright and let the deny list be the whole control

## Outcome

The four claims are deleted outright. The deny list was deliberately designed to cover the cases worth handling, and the residual - irreversible operations that are not deny-listed, such as reset --hard over unpushed work or rm -rf of untracked files - is an accepted risk by explicit user ruling. Nothing about the bash gate script, its deny rules, or its hook registration changes; the deletion is prose only, across .claude/CLAUDE.md, rules/common/git-workflow.md, rules/common/git/commits.md, rules/common/git/branching.md, and any further instance a repo-wide census finds. Note for future readers: none of the four lines literally asserted an enforced block - all four used the ambiguous requirement grammar "X require explicit confirmation" - which is precisely why the drift went unnoticed. The lines survived the code that backed them because the wording never named the mechanism, so nothing tied them to the gate's fate. A rule that describes an outcome without naming its enforcer cannot be invalidated by that enforcer's removal.
