---
Status: accepted
Date: 2026-07-27T03:19:24.366Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0024. The engine's CI-status read requires the PAT permission Actions:Read, not Commit statuses or Checks

## Context

The merge-boundary runbook's PAT permission table originally specified the wrong permission for capability (d), reading CI status. Getting this wrong is a real failure mode with an unusually nasty shape, so it was chased to the source. A codebase read settled it from the code rather than from API-shape inference: the engine's CI-status read lives at exactly one place, the ship stage's prompt built at mitosis.js:4586-4599 and dispatched to an implementer subagent, with the CI-wait instruction at mitosis.js:4596. It resolves a run id via `gh run list` scoped to the target repo and integration branch requesting --json databaseId, polls `gh run view --json status` until status reads completed, then reads the terminal result once with `gh run view --json conclusion`, treating conclusion=success as GREEN and any other terminal conclusion as RED. Both `gh run list` and `gh run view` correspond to the GitHub Actions Workflow Runs REST API (GET /repos/{owner}/{repo}/actions/runs and .../runs/{run_id}) - a third surface distinct from both the Checks API and the Commit Statuses API. On a fine-grained PAT that surface is gated by the Actions repository permission at Read-only. Two supporting findings: a Checks permission is not assignable to a fine-grained PAT at all, since GitHub Support states only a GitHub App identity can reach the Checks API, so the earlier worry that the Checks constraint was engine-breaking was misplaced - the engine never called Checks. And the engine holds no token-scoping logic of its own: a grep across mitosis.js and .claude/lib/superpowers-parallel/*.mjs finds zero occurrences of GH_TOKEN, GITHUB_TOKEN, or `gh auth`, so every gh call runs under whatever identity the process is already authenticated as. This decision was locked in the prior session but its record_decision call was REJECTED on a required-property error across six encodings, so the finding survived only in that session's log and in commit 4575265. This record is the promoted straggler; record_decision has since been confirmed healthy.

## Options

- Grant Commit statuses: Read - correct only for projects whose CI reports through the older Commit Statuses API, which this engine does not call; would leave the CI poll unauthorized
- Grant Checks - impossible, since the Checks permission is not assignable to a fine-grained PAT and only a GitHub App identity can reach that API
- Grant Actions: Read-only - matches the Workflow Runs API the engine actually calls, and is the minimum that authorizes the poll
- Grant Actions: Read and write - rejected, since it would additionally allow cancelling, rerunning, approving or force-cancelling workflow runs, deleting artifacts and logs, and disabling or dispatching workflows, letting the token interfere with the very CI run the boundary depends on

## Outcome

Grant Actions at Read-only, and never higher. The runbook's Section 3 table and Section 8 failure mode were corrected accordingly in commit 4575265. Consequences: the previously ENGINE-BREAKING risk is CLOSED - the Checks-unavailable-to-fine-grained-PATs finding never actually threatened this engine. Omitting Actions:Read is its own distinct and easily-missed failure mode: pushes and PR creation still succeed because they depend on Contents and Pull requests, so the merge boundary itself is unaffected, but the engine silently loses the single GREEN/RED signal it uses to decide whether a PR is safe to hand to a human - a degradation rather than a clean fail-closed stop. Note for anyone extending the preflight: this permission is NOT one of the three gated invariants, which are provable with Metadata:read alone, and a fine-grained PAT's granted permissions cannot be read back via any gh api call, so Actions:Read can only be confirmed manually on the token's detail page.
