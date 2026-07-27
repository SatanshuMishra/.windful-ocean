---
Status: accepted
Date: 2026-07-27T22:20:11.245Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0042. Config loading is the uncovered half of the git-env fix; two adjacent scope items are held for the user

## Context

The fresh code review and security review both returned APPROVE-WITH-FIXES with no CRITICAL and no HIGH, satisfying the review half of completion criterion 4 for the first time on this thread. Both verified their findings by executing real git 2.55.0 rather than by reading. They converged independently on one root cause the implementation missed: the recovery repo's env pinning closed the repo-LOCATION axis completely (all seven location variables verified neutralized, including the ambient GIT_DIR hijack that motivated the work) but left the CONFIG-LOADING axis entirely open, and config is a code-execution surface. Verified: GIT_CONFIG_COUNT/KEY/VALUE, GIT_CONFIG_PARAMETERS, GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM each inject core.hooksPath and cause post-commit and post-index-change to execute; GIT_TEMPLATE_DIR installs hooks into the repo at init time that persist after the hostile env is gone; core.fsmonitor executes during git add -A; and git commit --no-verify suppresses only pre-commit and commit-msg, not the hooks that actually fire. Decisively for the accident model, the user's own ~/.gitconfig is read in full, so an ordinary developer with git config --global core.hooksPath gets their own post-commit hook run on every ledger commit, and a global core.excludesFile silently drops ledger records from history while commit() reports committed:true with a real sha. Separately, the security review verified that the identical GIT_DIR bug is still live in hooks/lib/git.mjs, where an ambient GIT_DIR makes gitCommonDir return an unrelated repo's .git so the guard is handed a root that does not exist and protects nothing.

## Options

- Ship on the met acceptance bar and defer every MEDIUM - rejected, two of them are verified silent-total-data-loss paths in the exact mechanism 0028 chose recoverability for
- Fix the config-loading axis and the guard's own root resolution now, and hold the two pre-existing-on-main items for the user - chosen
- Also apply the env pinning to GitRefDriver's own gitExec calls in this round - rejected for now, pre-existing on main and a scope widening the user has not authorised
- Add a .git trigger to catch rm -rf .git && git init - rejected for now, it contradicts a pinned noise test and carries a large prompt-fatigue cost, which is security-relevant because the prompt IS the protection

## Outcome

Fix now, in two parallel file-disjoint rounds: the full config-loading lockdown (clear GIT_CONFIG_PARAMETERS, GIT_TEMPLATE_DIR, GIT_CONFIG_SYSTEM; pin GIT_CONFIG_COUNT=0, GIT_CONFIG_NOSYSTEM=1, GIT_CONFIG_GLOBAL=os.devNull; prepend -c core.hooksPath and -c core.fsmonitor=false; --template= on init), repair-on-every-init instead of create-once, lstat+isDirectory on the .git probe, degraded state propagated into the MCP tool response, deletion of the verified-inert degrade latch, ambient commit dates cleared, the commit() message-validation contract made symmetric across both drivers, and on the guard side fail-closed restored for an unreadable Bash command, for the decode and writeResult paths in runGuardEntry, and for a JSON array on stdin, plus byte-accurate length measurement, the auto-allow intersected against the real TOOLS registry, and the literal CLAUDE_PLUGIN_DATA path added as a trigger spelling. The single GIT_CONFIG_GLOBAL pin subsumes the core.excludesFile data-loss finding. TWO items are explicitly NOT fixed and are held for the user because both are pre-existing on main rather than introduced by this branch: applying the env pinning to GitRefDriver's own gitExec calls (which the security review verified can write the ledger ref into an unrelated repository), and adding a .git trigger. Neither is deferred on merit; both are deferred because they widen scope beyond what was authorised.
