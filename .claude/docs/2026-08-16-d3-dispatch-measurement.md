# D3 measurement: what a dispatch costs, and what we still cannot say

Date: 2026-08-16. Repository state: branch `feat/d3-measure`, parent commit `624c2d5a`.

## Answer first

The binding falsifier the SPEC sets for this unit -- "a run exceeding 10 dispatches per shipped MSP fails"
(`.claude/docs/specs/2026-08-12-mitosis-os-process-rearchitecture-design.md:567`) -- is **UNEVALUABLE**. It is
not cleared and it is not falsified. The engine has never run: there is no `.mitosis/` run directory anywhere
in this repository or in any of its worktrees, so there is not one engine dispatch to divide by one shipped
MSP. A ratio with no denominator cannot pass or fail. The human decides what follows from that.

Everything this report does publish about dispatch volume is a **proxy**, and it is a proxy for a *different
population* than the one the falsifier names. The proxy is the agent-ledger event log
(`~/.claude/agent-ledger/events/*.jsonl`), which records **human-orchestrated agent dispatches made from a
Claude Code session**. The falsifier counts **engine dispatches inside one mitosis run**. These are not the
same thing, they are not sampled the same way, and no number below may be compared to the 10-dispatch ceiling.
Doing so would be a category error. The proxy's further limits -- a token field that is a session-cumulative
watermark rather than a per-dispatch cost, no cache split, no cost field, 64.3 percent of rows carrying an
unknown agent type, and no MSP key at all -- are set out in full in the Limitations section, and each one is
load-bearing.

## What changed in the code

The instrument existed but was wired to nothing. `captureEnvelope` (`.claude/lib/mitosis/dispatch.mjs:570`)
already read input tokens, output tokens, cache-creation tokens, cache-read tokens and `total_cost_usd` off
the child's envelope and put them on the verdict. Every production consumer then dropped them on the floor.

| Seam | Before | After |
|---|---|---|
| Pool terminal record | `settle` narrowed the verdict to `ok` and `outcome` | `settle` carries the envelope into the frozen record (`.claude/lib/mitosis/pool.mjs:204`, `:266`) |
| CLI unit port | `Done({ sha, green })` | `Done({ sha, green, envelope })` (`.claude/lib/mitosis/cli.mjs:190`) |
| Decompose emit | result carried only the MSP list | result and CLI summary carry the envelope (`.claude/lib/mitosis/decompose-emit.mjs:234`, `:354`, `:362`) |
| Run store | no usage writer | `recordUsage` appends one per-attempt line to `usage.jsonl` (`.claude/lib/mitosis/run-store.mjs:298`) |

One normalizer (`.claude/lib/mitosis/dispatch.mjs:595`) guards all three seams. A token count that is not a
finite number becomes `null` rather than a fabricated figure, and the whole record is frozen. `recordUsage`
takes its timestamp as a validated ISO-8601 argument and reads no clock, so a run remains reproducible.

This makes the *next* run measurable. It measures nothing about runs that never happened.

## The proxy, and what it actually shows

Source: a pinned snapshot of `~/.claude/agent-ledger/events/*.jsonl` taken 2026-08-16, 46 files, 16142 rows.
The log is live-appending, so it was snapshotted before any figure was computed.

### Filtering (the leak gate)

The log is global across every project on this machine. Rows were filtered to this project by requiring the
`cwd` field to name `.windful-ocean`. This is not cosmetic: **4439 rows in the snapshot carry a `cwd` under a
different project whose name is a confidential cross-project identifier**. An unfiltered count, an unfiltered
`cwd` histogram or a pasted raw record would carry that identifier into this tracked file.

| Slice | Rows |
|---|---|
| Snapshot total | 16142 |
| Other projects (excluded, never rendered) | 7328 |
| This project | 8814 |
| This project, rows carrying the confidential identifier | 0 |

### This project's rows

| Row type | Count |
|---|---|
| `agent_run` | 8493 |
| `fallback_used` | 181 |
| `permission_denied` | 140 |

`agent_run` rows span 2026-07-07T18:10:49Z to 2026-08-16T07:50:33Z across 333 distinct sessions.

### Dispatch volume per session (the proxy figure)

| Population | Sessions | Rows | Min | p25 | p50 | p75 | p90 | Max | Mean |
|---|---|---|---|---|---|---|---|---|---|
| All this-project sessions | 333 | 8493 | 1 | 5 | 10 | 25 | 70 | 284 | 25.5 |
| Sessions running inside a worktree | 43 | 566 | 1 | 1 | 5 | 15 | 42 | 75 | 13.2 |

Only 566 of 8493 rows (6.7 percent) ran inside a worktree; 7927 (93.3 percent) ran in the primary checkout.
Since MSP work is done in worktrees, the worktree row is the closest thing the log has to MSP-scoped activity,
and it covers under a fifteenth of the data.

### Named agent types

| Agent type | Rows |
|---|---|
| unknown | 5460 |
| implementer | 1008 |
| general-purpose | 377 |
| code-reviewer | 349 |
| workflow-subagent | 323 |
| security-reviewer | 266 |
| codebase-analyst | 223 |
| researcher | 188 |
| solution-architect | 114 |
| test-engineer | 52 |
| all remaining types combined | 133 |

## The quality assertion

Cost claims are meaningless without a quality floor: an instrument that counts tokens cannot see whether a
cheaper decomposition also cuts worse. The fixed quality assertion, declared before this work started, is the
**per-MSP CI check matrix**, with **post-merge rework count** secondary. Both are already recorded for every
merged pull request, and both can genuinely go red -- as the table shows, they do.

Method: for each merged pull request, every check in the status rollup is grouped by name and the run with the
latest completion time is taken, so a red run superseded by a green re-run does not count against the pull
request. 131 merged pull requests were examined (all except the two pre-2024 repository-setup ones).

| Population | Pull requests | All checks green | Not all green |
|---|---|---|---|
| All merged | 131 | 115 | 16 |
| Receipts-enforcer era | 79 | 71 | 8 |
| Pre-enforcer | 52 | 44 | 8 |
| Ran the three mitosis gate checks | 36 | 35 | 1 |

The 16 that are not all green break down as: 11 merged with a final `test` failure, 2 with a final `sast`
failure, 1 with a final `invariant-coverage` failure, 1 with a cancelled `receipts` run, and 1 that ran no
checks at all.

Secondary -- rework: 30 of the 131 merged pull requests (22.9 percent) carry the Conventional Commit type
`fix`. This is an **upper bound** on post-merge rework, not a measurement of it: a `fix` pull request may
address code that never shipped through an MSP.

## Limitations

Every one of these is a reason a number in this report cannot be pushed further than it is pushed.

| Limitation | Evidence |
|---|---|
| The token field is a **session-cumulative watermark**, not a per-dispatch cost. Summing it across rows massively over-counts. | 8490 token-bearing rows collapse to 2295 distinct (session, token) pairs. One session's 284 rows carry only 24 distinct values. The value is non-decreasing within every one of the 333 sessions, with zero exceptions. |
| **No cache split.** The field is a single bare number, so cold-creation and warm-read tokens cannot be separated. | `tokens` is type `number` on 8490 rows and `null` on 3; it is never an object. |
| **No cost.** There is no `total_cost_usd` or any monetary field. | Absent from all three row schemas in the log. |
| **64.3 percent of rows carry `agent_type: unknown`** (5460 of 8493), and 53 of 333 sessions are entirely unknown. | Direct census. |
| **No MSP key.** Nothing in the log names an MSP. | No row schema in this project's slice carries an `msp` field. |
| **MSP attribution is an inference from `cwd` and time, not a record.** Worktree names include ephemeral test fixtures alongside real units. | 46 distinct worktree names appear; many carry 1 to 3 rows and are generated fixtures rather than units of work. |
| **`emitter` is a constant.** It is the literal string `main` on 100 percent of rows and explains nothing. | 8493 of 8493. |
| **`outcome` is always null**, so no row says whether the work succeeded. | 8493 of 8493. |
| **`transcript_ptr` identifies the session, not the run.** A row cannot be traced to an individual dispatch. | 8493 rows resolve to 333 distinct pointers, exactly one per session. |
| Consequently, **it cannot be established from the log alone whether one `agent_run` row is one subagent dispatch or one main-thread turn.** | Follows from the constant `emitter`, the unknown agent type on most rows, and the session-scoped transcript pointer. |

## Downgrades

These are recorded as `unverified-reasoned` under the receipts honesty ladder. Each is a thing this unit was
asked to publish and could not.

| Item | Status | Reason |
|---|---|---|
| The 10-dispatch-per-MSP falsifier | `unverified-reasoned` | Unevaluable. No engine run has ever occurred, so the ratio has no denominator. |
| Input tokens per dispatch | `unverified-reasoned` | The only available field is a session-cumulative watermark; no per-dispatch value exists. |
| Output tokens per dispatch | `unverified-reasoned` | Same watermark; the log does not separate input from output at all. |
| Cache-creation tokens | `unverified-reasoned` | No cache field exists in the log. |
| Cache-read tokens | `unverified-reasoned` | No cache field exists in the log. |
| `total_cost_usd` | `unverified-reasoned` | No cost field exists in the log. |
| Cold-versus-warm cache split required at SPEC `:571` | `unverified-reasoned` | Requires the cache split above, which the log does not carry. Prompt caching is content-keyed, so a benchmark reusing a fixed payload would under-report creation cost; no such benchmark was run. |
| Comparison against the 2026-07-17 baseline | `unverified-reasoned` | That baseline is a code-read cost model by its own confidence legend, not a billing export, and it describes a file that no longer exists in that form. Decision 0358 binds a baseline to at least three runs at pinned repository state reporting variance; there are zero runs. |

## Corrections to the SPEC

Two statements in the D3 section of the SPEC are false as written and should not be relied on.

| SPEC claim | Reality |
|---|---|
| `:573` "`.claude/reports/` is git-tracked." | It is ignored at `.gitignore:11` (`/.claude/reports/`), and git tracks zero files under it. A report written there is invisible to the enforcer, to the pull request and to a fresh clone. This report is therefore under `.claude/docs/`, which is tracked. |
| `:563` "a measurement report under `.claude/reports/`, plus the aggregation in `run-store`." | The report location is corrected as above. The `run-store` aggregation could not be built against real data, because no run data exists; what shipped is the per-attempt writer that will record it on the first run. |

## What would make the falsifier evaluable

One engine run, at a pinned repository state, producing a `.mitosis/runs/<key>/attempt-N/usage.jsonl`. The
plumbing shipped here is what writes that file. Decision 0358 asks for three such runs before a baseline is
binding. Until then, dispatch cost in this repository is an estimate, and this report declines to dress one up
as a measurement.
