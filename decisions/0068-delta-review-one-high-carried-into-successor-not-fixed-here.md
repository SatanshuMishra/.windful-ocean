---
Status: accepted
Date: 2026-07-28T07:12:01.648Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0068. The final delta review found one HIGH; it is carried into the successor, not fixed on a dead thread

## Context

The single delta review 0063 authorized ran over 351a931..d102fb8 (11 commits, 16 files, +462/-133). code-reviewer: 0 CRITICAL, 1 HIGH. security-reviewer: 0 CRITICAL, 0 HIGH, but flagged the SAME installer defect at MEDIUM - two lenses converged. Orchestrator confirmed the code facts: hooks/lib/installer.mjs:51 reads via `config --get` with no --local and :8 applies only clearedGitLocationEnv(), while src/drivers/local-driver.mjs:23 and src/util/git-scope.mjs:52,76,85 apply the config-isolating env; the merged value is then written back as LOCAL repo config at :96 and restored at :124. So 0042's config-loading fix was never carried into the installer, and installCommitMsgHook runs on every SessionStart with errors swallowed. Fresh receipts at d102fb8: 622/622 pass, check-packaging ok, clean tree - NOT exculpatory, since this machine has no global core.hooksPath and no GIT_CONFIG* vars, the exact condition under which the reviewer's hostile-config run fails 4 installer tests. The bar was no new CRITICAL/HIGH, so the if-clean branch does not fire; but `done` stays unreachable either way because the criteria fixed at creation describe the parser 0029 deleted.

## Options

- Fix the HIGH here, then re-review - restarts the exact review recursion 0063 ended, and exceeds 0063's grant of CRITICAL-only work.
- Close as clean and drop the finding - dishonest, and loses a confirmed defect that mutates the user's real repo config on every SessionStart.
- Abandon as planned and carry the HIGH as the successor's first completion criterion - terminates the dead specification, preserves the finding in an active thread, leaves the fix to a user go.

## Outcome

Option 3. paused -> abandoned; successor opened carrying the installer config-scope fix as criterion 1, plus test hermeticity, the two isolatedScope repo-local-config gaps (content filters via info/attributes, merge.verifySignatures), the six drifted README line citations, and the recovery-repair gaps. No code change, no push, no PR - the 30 commits stay unpushed pending an explicit go.
