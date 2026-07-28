---
Status: accepted
Date: 2026-07-28T19:25:42.367Z
Thread-Id: 01KYKS3C7VP16PXMP7D9G0TMHW
---

# 0073. fix/pre-tool-use-guard is pushed and opened as one PR through pr-create

## Context

The guard hardening work sat as 30 unpushed commits on fix/pre-tool-use-guard in DevLabs/continuity-ledger-plugin with no PR, plus the residual fixes landing in this session. The predecessor thread deferred the push/PR call to the user. A blocker that applies elsewhere was checked and does NOT apply here: decision 0052's p/default semgrep pin drift makes sast red on every push in the .windful-ocean repo, but continuity-ledger-plugin's .github/workflows/receipts.yml declares only the `receipts` and `pr-title-lint` jobs, with no SAST job at all.

## Options

- Push and open one PR through the centralized pr-create tool
- Push the branch only, defer the PR to a later session
- Hold both, keep the branch local

## Outcome

Push and open one PR, ruled by the user on 2026-07-28. The PR is opened through `mitosis-git.mjs pr-create` per rules/common/git/pull-requests.md, never ad-hoc `gh pr create`. Merge remains separately human-gated, so opening the PR does not ship anything. Verification lines on the PR state only checks actually run, per the honesty rule; anything not run is recorded as --not-verified rather than omitted or fabricated.
