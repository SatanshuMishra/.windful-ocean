---
Status: accepted
Date: 2026-07-28T19:58:20.387Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0084. Criterion 5 closes on a measured scan of merged main, and the secret-scanner shebang gap is refuted

## Context

Criterion 5 was deliberately left unchecked because its receipt (exit 0, 0 findings, 0 errors) had been measured on the PREDICTED merge result rather than on merged main. A security-reviewer re-ran it against a detached worktree at beca874 (HEAD verified beca8747574ec041bc6860832b9a80525adc20d4, git status clean), reproducing the else-branch of .github/workflows/security.yml:69 with no --baseline-commit. Semgrep 1.170.0 and pyyaml 6.0.3 were the versions actually used, matching the CI pins at security.yml:30 exactly, with no venv substitution. Result: exit 0, Findings 0 (0 blocking), Rules run 507, Targets scanned 298 (113 skipped via .semgrepignore), Parsed lines ~99.8%. Semgrep emitted no error section and a grep for error over stderr returned nothing - a read result, not an inference from exit 0. Pin check computed d9f73571cb16f43a3a51b5c9c29d712a77bfe5133f684bd7d713347205a55c96 against the identical expected value in .semgrep/p-default.sha256: MATCH. The live curl to semgrep.dev (security.yml:51) was DENIED by the permission sandbox and is not run; the hash was computed over four independently cached copies from prior sessions, all four canonicalizing to the expected pin. PartialParsing re-measured at 15 warnings across 9 distinct files, confirming the prior count exactly.

The spine carried a NEW risk asserting that .claude/hooks/secret-scanner.sh, having a python3 shebang under a .sh name, is parsed by semgrep as bash so that its entire body fails and none of the 243 Python rules apply to the repo's own blocking secret-scanner. The reviewer tested the claim rather than restating it.

## Options

- Accept the criterion as closed and accept the secret-scanner risk as previously recorded
- Close the criterion and REFUTE the secret-scanner conclusion on measured counter-evidence, keeping only the residual gap that survives testing
- Leave the criterion open because the live upstream fetch was blocked

## Outcome

Criterion 5 is CLOSED on measurement, and the secret-scanner conclusion is REFUTED.

Criterion 5: merged main beca874 is proven sast-clean by a no-baseline full-repo scan with a config content-identical to the pinned p/default. The blocked live fetch does not hold the criterion open, because the criterion is about main being clean under the pinned ruleset, not about whether the pin itself has drifted upstream - that is the separate CI pin-drift guard. Scoped caveats, recorded rather than glossed: (a) whether upstream p/default has drifted since the pin is NOT RUN; (b) the 113 files excluded by .semgrepignore and anything untracked were not scanned; (c) the two ledger hooks reporting ~97.5% and ~97.8% of lines skipped were not individually root-caused - not run.

The secret-scanner claim: its premises hold but its conclusion is false. Semgrep language-detects by SHEBANG as well as extension, so the file is enqueued as both a python target and a bash target - its own language table reads python 243 1 AND bash 4 1. Three tests: a cmp-verified byte-identical pair where vuln.py and vuln.sh (python shebang) both produced the SAME 2 findings (subprocess-shell-true and eval-detected); and an exact copy of the real secret-scanner.sh with one eval(content) appended and its header untouched, which produced Findings 1 (1 blocking), python.lang.security.audit.eval-detected, despite Parsed lines ~6.9%. Rules run was 293 for the .sh form versus 290 for the .py form, the delta being the bash rules. The PartialParsing on lines 3-28 is the BASH parser choking on Python syntax; the python parse succeeds and python rules do run. The depressed parsed-lines percentage is an aggregate dragged down by the failed bash parse, not evidence that python analysis was skipped. The 0-finding result on main is therefore a genuine measured clean, not an artifact of the shebang issue.

Residual real but lower-severity gap, which replaces the overstated risk: 4 bash rules are wasted on that file, and the partial-parse noise masks genuinely-unanalyzed files - the ~97.5% and ~97.8% ledger hooks are the more suspicious entries and remain un-root-caused.
