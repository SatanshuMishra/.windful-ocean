---
name: mitosis
description: Use when implementing or executing an APPROVED spec or batch of work as parallel, independently shippable units (engages on "implement the spec", "execute the plan as MSPs", "ship this in parallel", "decompose into shippable units"). Owns the end-to-end MSP-driven flow — decompose into clusters of MSPs, fan out across isolated worktrees with risk-scaled review, serialize merges so every shared branch stays green. Supersedes parallel-subagent-development.
---

# Mitosis (orchestrator dispatcher)

You are the orchestrator's THIN entry point. Mitosis runs as a top-level Dynamic Workflow; your only job is to gather inputs that require user interaction, then dispatch ONCE. You do NOT decompose, plan, route, or merge here — the workflow owns all of that.

## Preconditions

1. Workflows must be enabled. If `CLAUDE_CODE_DISABLE_WORKFLOWS=1` (or workflows are otherwise disabled), STOP and tell the user: mitosis requires the Workflow engine; re-enable it and retry. Do NOT fall back to running the loop inline.
2. There must be an APPROVED spec or batch of work. If not approved, route to brainstorming/spec first.

## Collect inputs (in MAIN, before dispatch)

- `spec`: absolute path to the approved spec/batch document. If the user gave inline text, write it to a file and use that path.
- `repoRoot`: absolute path to the target repository.
- `verify`: `{ scopedCheckCmd, fullValidationCmd }` — detect from the repo (e.g. package.json scripts) or ask the user.
- `build`: receipts config seeds (test_command, suite_command, integration_branch, sha_source) — detect or ask.
- `models`: optional model-tiering map; default `{}`.
- `worktreeRoot`: absolute path for worktrees; default a temp dir outside the repo.
- `fixLoopMax`: default `2`.

## Resolve the branch contract (MUST happen here — workflows cannot ASK)

For BOTH source/head AND base/target, apply declare-or-pass-or-ASK, NEVER default:
explicit pass -> declared machine-readable config -> STOP AND ASK the user.
NEVER derive the base from the platform default branch; NEVER assume the source.
Set `baseBranch` (resolved base) and `sourcePrefix` (resolved source-branch prefix) from this.

## Dispatch notice, then dispatch ONCE

Print a one-line notice: mitosis will run as a background workflow that may spawn many agents (multi-agent ~15x chat tokens; engine capped 16 concurrent / 1000 total). Then make exactly ONE call:

    Workflow({
      scriptPath: "/Users/satanshumishra/.claude/workflows/mitosis.js",
      args: { spec, repoRoot, baseBranch, sourcePrefix, verify, build, models, worktreeRoot, fixLoopMax }
    })

Do nothing else until it returns.

## Relay the report

When the workflow returns, relay its result to the user: the shipped MSPs (id + PR url) from `shipped`, the run's `identity` (present on every report, including failed ones), and if `overallStatus !== 'all-shipped'`, the failing stage/MSP and reason (from the top-level `stage`/`mspId`/`detail` and the `crashed`/`halted` arrays). Do not re-run or "continue" the loop in main.

## Run identity and portability

EVERY report carries an `identity` field saying where this run can be resumed from — the successful ones and the failed ones alike. Relay it on a halt too: "where can I resume this from?" is the operator's first question at exactly the stops where the run did not finish.

`identity: 'published'` means the run's MSP table is durably published to a mitosis-owned git ref (`refs/mitosis-manifest/<logicalRunId>/<specContentHash>`; the spec's §3.5 sketch of `refs/mitosis/<id>/manifest` was moved so the identity ref cannot be mistaken for a unit checkpoint under `refs/mitosis/*`). Any clone, worktree or CI workspace can resume the run with the same logical run id, even one that has no `.mitosis/` directory at all. One limitation: on a workspace with no local journal, only `resume <logicalRunId>` resolves — `resume <harnessRunId>` of a PRIOR harness run does not, and the run logs that when it applies.

The ref is CONTENT-KEYED on the sha-256 of the spec, because the logical run id hashes the spec PATH and never its content. An in-place spec edit therefore re-decomposes a different MSP table under the same run id, and each spec content owns its own ref: the edit publishes a new identity instead of colliding with the write-once ref the previous content already owns. Every ref stays write-once and forward-only; none is ever rewritten. The payload carries the spec path REPO-RELATIVE — the ref is pushed to a shared remote, and an absolute path would leak the originating machine's home directory to every other clone. A spec that lies outside `repoRoot` composes no portable reference and is reported as a refusal to publish.

`identity: 'local-only'` means no published ref was adopted, so the run is resumable ONLY from the local `.mitosis/` journal on this machine — a fresh clone will not find it. Relay that limitation rather than leaving it implicit.

`identity: 'unresolved'` means the run halted before it got as far as resolving identity at all (an input or early reconcile halt). It is never a claim about portability in either direction.

`local-only` is expected for any run started before durable run identity landed. Otherwise the run log names which cause applied, and they are not interchangeable — read the log line rather than guessing:

| Cause | What the operator should do |
|---|---|
| the git remote was unreachable, or the publish could not be verified | re-run; the next relaunch that finds the ref still unclaimed RETRIES the publish, so a transient failure is not permanent |
| a manifest ref already existed for this content-keyed ref and was left untouched | nothing; the ref is written once and never rewritten |
| the published payload's own `specContentHash` DISAGREES with the ref it was read from | an INTEGRITY failure, not staleness — the ref name is the spec content hash, so the payload contradicts its own path; the ref is corrupt or misfiled |
| the published payload carries a FOREIGN logical run id | investigate; the ref does not belong to this run |
| the ref exists but its payload could not be READ | transient fetch failure — do NOT delete or republish the ref on this evidence |
| the ref exists and its payload did not validate | the payload really is malformed |
| the engine REFUSED to publish because its own reader rejected the composed payload | the log names the field: an unhashable spec, a spec outside `repoRoot`, or a journal whose recorded table cannot be projected into an identity payload |
| no content-keyed ref NAME exists because the spec content could not be hashed | fix the spec's readability and re-run; the engine never fabricates a ref name, and never reads a fabricated ref's emptiness as absence |

A run whose identity probe could not be answered at all does not report `local-only` — it halts at reconcile, because inferring "no ref exists" from a read that never ran would re-decompose a fresh MSP table over a ref that may already own one. The engine re-derives the content-keyed ref from its own copy of the spec hash and compares it against the ref the reconcile stage reports probing; any mismatch is an undetermined probe, never an absence.

A publish is RETRIED on any later launch that finds the content-keyed ref unclaimed, whether or not that launch reused the recorded MSP table — the retry composes from the reconciled manifest and passes through the same pre-publish validator as the genesis path, so an invalid payload is refused rather than pushed to a ref that could never be repaired. One gap remains: a relaunch that ends in reconcile-only advance (everything already built, nothing left to build) returns before the publish stage, so it does not retry.
