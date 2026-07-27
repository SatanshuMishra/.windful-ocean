CI TRIAGE ON PR #5. The `sast` check is RED. Root cause is NOT Build A: the job aborted at the "Fetch and verify p/default ruleset" supply-chain step before scanning any code. Semgrep's p/default ruleset drifted upstream; the canonical SHA256 no longer matches .semgrep/p-default.sha256 (expected 39e9e106..., actual d9f73571...).

DISCONFIRMING CHECK RUN: `gh run list --workflow security` shows the pin was vendored 2026-07-20, the last green sast was also 2026-07-20, nothing ran in the seven days since, and PR #5 is the first PR after the drift. It would fail identically on main or any branch. Job died in 20s. test, secret-scan, sca and label all PASS.

RULING recorded as 0033: re-vendor the pin as its own PR with human re-adjudication of every nosemgrep pragma; never bundle it into PR #5 and never auto-bump the hash to clear a red build.

CARRY FORWARD, IMPORTANT: Build A is SAST-UNEVALUATED, not SAST-clean. The scan never ran against this diff. merge-boundary-preflight.mjs builds gh argv and parses untrusted JSON, exactly the shape semgrep rules target. Once the pin is re-vendored the scan hits this diff for the first time and MAY require real changes to c59ca79. Do not report PR #5 as security-clean on that basis.

SESSION STATE AT CLOSE: PR #5 open (36 commits until a human runs `git push origin main`; agents policy-denied per 0031). Runbook Sections 2-6 still unapplied, so Build A is shipped but inert. Thread remains paused and cannot reach `done` as chartered — six spec-shaped completion criteria, none satisfied, retroactive rewrite forbidden; disposition via create_successor is a user call.
