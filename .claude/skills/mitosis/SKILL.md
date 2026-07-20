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

When the workflow returns, relay its result to the user: the shipped MSPs (id + PR url) from `shipped`, and if `overallStatus !== 'all-shipped'`, the failing stage/MSP and reason (from the top-level `stage`/`mspId`/`detail` and the `crashed`/`halted` arrays). Do not re-run or "continue" the loop in main.
