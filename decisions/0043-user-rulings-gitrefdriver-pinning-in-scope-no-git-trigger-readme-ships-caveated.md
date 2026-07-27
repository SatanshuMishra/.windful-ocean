---
Status: accepted
Date: 2026-07-27T22:22:16.057Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0043. User rulings: GitRefDriver pinning comes in scope, the .git trigger is refused, and the README ships caveated

## Context

0042 held three questions for the user rather than deciding them unilaterally, because each either widened scope beyond what was authorised or required a human action. The user ruled on all three in one pass on 2026-07-27. Question one: the security review verified by execution that GitRefDriver's own gitExec calls are unpinned, so an ambient GIT_DIR causes update-ref to write the ledger ref into an unrelated repository, leaving refs/heads/_ledger absent from the real project repo - silent ledger loss on the git path, which is the path most users are on, and pre-existing on main rather than introduced by this branch. Question two: rm -rf .git && git init destroys the _ledger ref with no prompt, and a .git trigger would catch it at the cost of contradicting the pinned noise test at test/unit/hooks/pre-tool-use.test.mjs:76 and firing on a large volume of ordinary git work. Question three: 0037 permits the README to carry only the verified sandbox claims with the hooks/MCP question labelled unverified, while the more useful denyWrite recommendation depends on an empirical test that changes the user's live settings and is therefore a human action.

## Options

- GitRefDriver pinning: fix on this branch now - CHOSEN by the user
- GitRefDriver pinning: separate branch after this one merges - rejected
- GitRefDriver pinning: leave it as a logged known gap - rejected
- The .git trigger: do not add it, document the gap - CHOSEN by the user
- The .git trigger: add it - rejected
- The .git trigger: a narrower rm-shaped variant - rejected, it would require the guard to reason about command shape, which is parsing and forbidden by 0029 without reopening that decision first
- README: ship the labelled-unverified version now - CHOSEN by the user
- README: block on the user running the sandbox test first - rejected
- README: omit the sandbox section - rejected, already refused by 0037

## Outcome

Three rulings. (1) The env pinning IS applied to GitRefDriver's own gitExec calls on this branch, using the shared helper extracted for LocalDriver. This reverses the hold in 0042, which deferred it purely on scope grounds rather than on merit; the same bug class is now closed on both drivers and on the guard's own root resolution. (2) The .git trigger is REFUSED. This upholds 0036's reasoning rather than making an exception to it: prompt volume is the failure mode because the prompt IS the protection, so a trigger that fires across ordinary git work degrades the control it is meant to strengthen. The residual gap - rm -rf .git && git init destroys the _ledger ref unprompted - is accepted and MUST be documented in the README alongside the non-default ledger_branch gap, never silently carried. (3) The README ships now with the verified sandbox claims and the hooks/MCP exemption explicitly labelled untested, with the outage consequence spelled out, exactly as 0037 prescribed. The empirical test remains the correct eventual resolution and remains a human action; it is not a blocker for this thread.
