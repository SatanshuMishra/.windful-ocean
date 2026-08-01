---
name: mitosis
description: Use when implementing or executing an APPROVED spec or batch of work as parallel, independently shippable units (engages on "implement the spec", "execute the plan as MSPs", "ship this in parallel", "decompose into shippable units"). Owns the end-to-end MSP-driven flow — decompose into clusters of MSPs, fan out across isolated worktrees with risk-scaled review, serialize merges so every shared branch stays green. Supersedes parallel-subagent-development.
---

# Mitosis (orchestrator dispatcher)

You are the orchestrator's THIN entry point. Mitosis runs as a top-level Dynamic Workflow; your only job is to gather inputs that require user interaction, then dispatch ONCE. You do NOT decompose, plan, route, or merge here — the workflow owns all of that.

## Preconditions

1. Workflows must be enabled. If `CLAUDE_CODE_DISABLE_WORKFLOWS=1` (or workflows are otherwise disabled), STOP and tell the user: mitosis requires the Workflow engine; re-enable it and retry. Do NOT fall back to running the loop inline.
2. There must be an APPROVED spec or batch of work. If not approved, route to brainstorming/spec first.
3. The server-side merge boundary MUST be proven — see the `Prove the merge boundary` section below, which runs AFTER the branch contract is resolved because it gates on the resolved `baseBranch`.

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

## Prove the merge boundary (AFTER the branch contract, BEFORE dispatch)

The server-side merge boundary MUST be proven in real process space before the Workflow call. Run EXACTLY this, substituting the values you just resolved:

    MITOSIS_BOUNDARY_ORG=<owner of the target repo> MITOSIS_BOUNDARY_REPO=<name of the target repo> MITOSIS_BOUNDARY_BASE_BRANCH=<the resolved baseBranch> MITOSIS_BOUNDARY_MACHINE_USER=<the machine-user handle> node /Users/satanshumishra/.claude/lib/superpowers-parallel/merge-boundary-preflight.mjs

The MAIN thread runs this itself. NEVER delegate it to a subagent — its exit code is the authoritative gate.

The gate binary path above is ABSOLUTE and fixed. NEVER resolve it relative to `repoRoot`, and never run a copy that lives inside the repository being merged into: that would let the repository under management supply the script that authorizes merges into it.

Set the four variables INLINE on that command, from the contract you just resolved — never rely on values exported ambiently in a shell, which go stale across repositories and branches and would prove a boundary that is not this run's. `MITOSIS_BOUNDARY_ORG` and `MITOSIS_BOUNDARY_REPO` are the owner and name of the target repository (`repoRoot`'s remote), and `MITOSIS_BOUNDARY_BASE_BRANCH` is the resolved `baseBranch` verbatim. `MITOSIS_BOUNDARY_MACHINE_USER` is the non-secret handle of the account whose credential the run pushes with: take it from `MITOSIS_BOUNDARY_MACHINE_USER` in the environment if the operator exports it in their shell profile, otherwise STOP AND ASK the user for the handle, exactly as the branch contract does. Do NOT invent another config mechanism, and never guess the handle. If any value is unset or invalid the preflight exits 31 and mitosis STOPS.

Exit 0 means every gated invariant was positively proven. ANY non-zero exit means the server-side merge boundary is NOT in place: the Workflow MUST NOT be dispatched — report the preflight's stderr to the user and STOP.

The engine re-runs this same command from this same absolute path during reconcile, and compares the repository, base branch, and invocation path the re-run attests against the ones this run actually merges into. That second read is defense-in-depth corroboration reported by a subagent, NOT the authoritative gate; this section is.

## Dispatch notice, then dispatch ONCE

Dispatch ONLY if the merge-boundary preflight exited 0. On any non-zero exit, stop here and dispatch nothing.

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

`identity: 'published'` means the run's MSP table is durably published to a mitosis-owned git ref (`refs/mitosis-manifest/<logicalRunId>`; the spec's §3.5 sketch of `refs/mitosis/<id>/manifest` was moved so the identity ref cannot be mistaken for a unit checkpoint under `refs/mitosis/*`). Any clone, worktree or CI workspace can resume the run with the same logical run id, even one that has no `.mitosis/` directory at all. One limitation: on a workspace with no local journal, only `resume <logicalRunId>` resolves — `resume <harnessRunId>` of a PRIOR harness run does not, and the run logs that when it applies.

`identity: 'local-only'` means no published ref was adopted, so the run is resumable ONLY from the local `.mitosis/` journal on this machine — a fresh clone will not find it. Relay that limitation rather than leaving it implicit.

`identity: 'unresolved'` means the run halted before it got as far as resolving identity at all (an input or early reconcile halt). It is never a claim about portability in either direction.

`local-only` is expected for any run started before durable run identity landed. Otherwise the run log names which cause applied, and they are not interchangeable — read the log line rather than guessing:

| Cause | What the operator should do |
|---|---|
| the git remote was unreachable, or the publish could not be verified | retry; nothing durable is wrong |
| a manifest ref already existed for this logical run id and was left untouched | nothing; the ref is written once and never rewritten |
| the published payload is STALE against the spec's current content | expected after an in-place spec edit — the run id hashes the spec PATH, never its content, so the edited spec re-decomposes under the same id and can no longer adopt the published table |
| the published payload carries a FOREIGN logical run id | investigate; the ref does not belong to this run |
| the ref exists but its payload could not be READ | transient fetch failure — do NOT delete or republish the ref on this evidence |
| the ref exists and its payload did not validate | the payload really is malformed |
| the engine REFUSED to publish because its own reader rejected the composed payload | usually a spec whose content could not be hashed; fix the spec's readability and re-run |

A run whose identity probe could not be answered at all does not report `local-only` — it halts at reconcile, because inferring "no ref exists" from a read that never ran would re-decompose a fresh MSP table over a ref that may already own one.
