---
name: mitosis
description: Use when implementing or executing an APPROVED spec or batch of work as parallel, independently shippable units (engages on "implement the spec", "execute the plan as MSPs", "ship this in parallel", "decompose into shippable units"). Owns the end-to-end MSP-driven flow — decompose into clusters of MSPs, fan out across isolated worktrees with risk-scaled review, serialize merges so every shared branch stays green. Supersedes parallel-subagent-development.
---

# Mitosis (orchestrator dispatcher)

You are the orchestrator's THIN entry point. Mitosis runs as an OS process; your only job is to gather the arguments that require user interaction, resolve the branch contract, then invoke the CLI ONCE through Bash. You do NOT decompose, plan, route, or merge here — the engine owns all of that.

## Preconditions

1. There must be an APPROVED spec or batch of work. If not approved, route to brainstorming/spec first.
2. There must be a RUN DOCUMENT — the JSON file `--spec` points at, holding an already-decomposed unit table. The approved markdown spec is NOT that document. One step turns one into the other: `.claude/lib/mitosis/decompose-emit.mjs`, described below. If the user cannot name a run document, run that emitter to produce one; do NOT hand-decompose the spec here and do NOT fabricate a unit table, because this entry point stays thin and a table invented in main is a decomposition no reviewer approved.

## Produce the run document (only when the user cannot name one)

`.claude/lib/mitosis/decompose-emit.mjs` dispatches the decompose child against the approved markdown spec, validates its structured answer against the decompose schema, composes the `{manifest, specs}` document, and writes it atomically. It parses and shape-checks every flag before any child is spawned.

    node .claude/lib/mitosis/decompose-emit.mjs \
      --spec /abs/path/to/SPEC.md \
      --repo-root /abs/path/to/repo \
      --base-branch main \
      --source-prefix feat \
      --branch-prefix feat \
      --worktree-root /abs/path/to/repo/.worktrees \
      --scoped-check '["npm","test"]' \
      --isolation worktree \
      --run-id run-thing-0001 \
      --out /abs/path/to/repo/.mitosis/run-document.json

`--spec` must sit inside `--repo-root` (it is fingerprinted through a containment-checked reader). `--scoped-check` is ONE JSON array of argv strings. `--isolation` is `worktree` or `scope-fence`. `--base-branch` and `--source-prefix` come from the branch contract resolved below, and `--branch-prefix` composes each unit's branch. Optional: `--harness-run-id`, `--decomposer-model` (defaults to `opus`), `--decomposer-timeout-ms`, and `--unit-agent-type` / `--unit-model` / `--unit-effort` / `--unit-timeout-ms`, which become the dispatch defaults inside every emitted `specs[].request`.

| Exit | Meaning |
|---|---|
| 0 | the run document was written; stdout names its path, its units and its clusters |
| 2 | the arguments were rejected; nothing ran |
| 3 | an input could not be resolved (the spec could not be fingerprinted, or the implementer preamble did not resolve) |
| 4 | the decompose child returned no conforming decomposition |
| 5 | the decomposition composed no run document |
| 6 | the run document could not be written |

Every non-zero exit names its cause on stderr and writes no partial document. Hand the emitted path to `--spec` below.

## Collect inputs (in MAIN, before dispatch)

`.claude/lib/mitosis/cli.mjs` reads exactly the flags below and rejects any argument that is not one of them. Collect these and nothing else — an input the CLI does not read has no path to the engine.

| Flag | Required | Where the value comes from | Shape enforced downstream |
|---|---|---|---|
| `--spec` | yes | absolute path to the run document from precondition 2 | JSON `{manifest, specs}`, shape below |
| `--run-id` | yes | a new run: 8 random lowercase hex characters. A resumed run: the id the earlier run used, or its checkpoint refs are unreachable | `^[a-f0-9]{8}$` |
| `--at` | yes | the current instant | ISO 8601 with seconds AND an offset, e.g. `2026-08-15T12:00:00Z`; epoch milliseconds are rejected |
| `--repo-root` | yes | absolute path to the target repository | must already exist |
| `--journal` | yes | ask, or use `.mitosis/run.jsonl` | RELATIVE to `--repo-root` and confined below it; created if absent, and its top path segment is added to `.gitignore` |
| `--repo-slug` | yes | the target repository's GitHub slug | literal `owner/repo` |
| `--integration-branch` | yes | composed from the branch contract below | a git ref token |
| `--window` | no | omit unless the user asks to widen or narrow build-ahead | positive integer; defaults to 8 |

Three of these are shape-checked only AFTER work has started: a bad `--run-id` fails at the first checkpoint, and a bad `--repo-slug` or `--integration-branch` fails at quiescence, discarding the whole run's summary. Read them back to the user before dispatching.

The run document is `{manifest, specs}`. `manifest` becomes the journal's genesis line and needs `logicalRunId`, `clusters` and a NON-EMPTY `msps`. Each entry in `specs` needs a unique `id` matching `^[a-z0-9][a-z0-9-]*$` and a `request` object whose only required field is a non-empty `prompt`; `prereqs` defaults to `[]` and every entry must name another unit's id; `fileScope`, when present, must carry all three of `edit`, `read` and `truncated`. The worked example is `.claude/lib/mitosis/tests/cli.test.mjs:25-30`.

### Inputs this entry point no longer collects

Each was collected for the retired workflow and has no flag on the CLI. Do not gather them here; their homes are named so nothing is silently dropped.

| Former input | Where it lives now |
|---|---|
| `verify.scopedCheckCmd`, `worktreeRoot`, `models` | collected by `decompose-emit.mjs` above (`--scoped-check`, `--worktree-root`, `--unit-model`) when the run document is produced, never by `cli.mjs`. Per-unit equivalents then travel inside each `specs[].request` (`prompt`, `agentType`, `model`, `effort`, `worktree`, `cwd`) in the run document |
| `verify.fullValidationCmd`, `fixLoopMax` | consumed only by `run-engine.mjs` and `engine-args.mjs`, which are outside `cli.mjs`'s import closure |
| `build` (test_command, suite_command, integration_branch, sha_source) | receipts-enforcer config keys read by CI, never by mitosis code. They belong in the target repository's `receipts.config.json` — seed from `.claude/skills/mitosis/templates/receipts.config.json` |

## Resolve the branch contract (MUST happen here — a process cannot ASK)

For BOTH source/head AND base/target, apply declare-or-pass-or-ASK, NEVER default:
explicit pass -> declared machine-readable config -> STOP AND ASK the user.
NEVER derive the base from the platform default branch; NEVER assume the source.
Set `baseBranch` (resolved base) and `sourcePrefix` (resolved source-branch prefix) from this.

Both are resolved here, though only one reaches the CLI:

- `sourcePrefix` composes `--integration-branch`. That flag names the branch whose pull request the run probes at quiescence — a branch under the resolved source prefix, NOT the merge target. It is shape-checked only at the end of the run, so a wrong value costs the whole run.
- `baseBranch` has no flag. The CLI reaches no step that takes a merge target, so the resolved base must already be reflected in the run document's `request` prompts and in the target repository's `receipts.config.json`. Resolve it anyway and state it to the user: the children that open pull requests need it, checking it against the run document is the only verification available before dispatch, and a base nobody resolved is exactly the defaulting this rule exists to prevent.

## Dispatch notice, then dispatch ONCE

Print a one-line notice: mitosis will run as an OS process that spawns a `claude -p` child per unit (multi-agent costs roughly 15x chat tokens; at most 8 built-but-unmerged units run ahead of the merge point unless `--window` says otherwise). Then make exactly ONE Bash call, from `--repo-root`:

    node .claude/lib/mitosis/cli.mjs \
      --spec /abs/path/to/run-document.json \
      --run-id 0a1b2c3d \
      --at 2026-08-15T12:00:00Z \
      --repo-root /abs/path/to/repo \
      --journal .mitosis/run.jsonl \
      --repo-slug acme/widgets \
      --integration-branch feat/thing-integration

Every value above is an example of the required shape, not a default: substitute the values collected above, and append `--window N` only if the user asked for it. Do nothing else until it returns.

## Relay the report

The CLI prints one JSON object to stdout and sets an exit code. Relay both.

The object carries exactly these top-level fields, in this order: `verdict`, `runKey`, `attempt`, `quiescent`, `aborted`, `ticks`, `units`, `prep`, `resume`, `integrate`, `ship`.

`verdict` is the run's terminal state and the only field the exit code is drawn from: `status`, `shipStatus`, `quiescent`, `unitsAllDone`, `unitCount`, `integrateOutcomeCount`, `shipOutcomeCount`, `ciUnwatchedCount`, `foldRefusalCount`. `units` names an `id` and a `state` per unit. `ship` carries `status`, `opened`, `prUrls`, `outcomes`, `ci`, `mergeOrder`, `retired`, `awaiting`, `blocked`, `parked`.

The exit code reads the build AND the shipping. Building every unit is not a successful run; opening the pull requests is.

| Exit | Meaning |
|---|---|
| 0 | quiescent, every unit reached `done`, and shipping handed off: `verdict.status` is `all-integrated-opened`, `awaiting-approval`, or `ci-unwatched` — or it is `nothing-pending` and nothing reached Integrate either, the run having held no work at all |
| 3 | the run stopped short: not quiescent, or a unit short of `done`, or work was pending and shipping did not hand it off — `verdict.status` `blocked`, `ci-red-exhausted`, `partial`, or `nothing-pending` over units that reached Integrate |
| 2 | the arguments were rejected; nothing ran |
| 1 | the run threw; the message names the field or the step |

0 never means merged. This engine opens pull requests and never merges, so `awaiting-approval` — pull requests open, waiting on a human — is the healthy terminal state and exits 0. A run that built every unit and opened no pull request exits 3, because there is nothing for the human to merge.

`ci-unwatched` is the pull requests being open while this run never managed to read their checks. `verdict.ciUnwatchedCount` names how many, and the withheld word is what reports the gap: `all-integrated-opened` is withheld because unread checks are not green checks, so the human reads them on the forge. The run still exits 0, because the pull requests were opened and handed off, and the hand-off is not retracted. `ship.status` still reports what the ship phase's merge policy alone saw, which is why it can read `all-integrated-opened` while the verdict does not.

Name the units that are not `done` and the state each stopped in, and name `verdict.status` with the pull requests in `ship.prUrls`. Do not re-run or "continue" the loop in main.

The `identity` reporting described below has no counterpart in the CLI's summary on this base: it documents the run-identity mechanism, not a field this entry point receives.

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
