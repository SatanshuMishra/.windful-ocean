# D3 measurement: what a dispatch costs, and what we still cannot say

Date: 2026-08-16. Repository state: branch `docs/d3-n1-measurement`, parent commit `2ed345e3`.

Supersedes the pre-run revision of this file, which reported the falsifier as UNEVALUABLE because no engine
run had ever existed. One run now exists. This revision reports it, and is at least as careful about what it
does not establish as the revision it replaces.

## Answer first

The binding falsifier the SPEC sets for this unit -- "a run exceeding 10 dispatches per shipped MSP fails"
(`.claude/docs/specs/2026-08-12-mitosis-os-process-rearchitecture-design.md:567`) -- resolves **CLEARED at
n=1**. Two billed dispatches produced two units in state `done`: a ratio of **1.0** against a ceiling of 10.
Counting the decompose child, which the run's own usage ledger does not record, the ratio is **1.5**. Both
readings sit under the ceiling.

**That clearance is vacuous as a throughput result, and the reason is structural rather than statistical, so
no larger sample would repair it.** The engine has exactly one `claude`-spawning site per unit -- `runUnit`
calls `dispatch` once (`.claude/lib/mitosis/cli.mjs:182`), which reaches a single `spawn`
(`.claude/lib/mitosis/dispatch.mjs:300`) -- and its import closure contains no plan, review, security, fix or
redispatch stage. **1.0 is therefore the floor the architecture cannot go below, not a figure the engine
earned.** A one-dispatch-per-unit engine with no retry path cannot exceed 1.0 unless a unit fails and is
redispatched; neither unit failed. The 10-dispatch ceiling was written for a richer engine that has those
stages, so clearing it here demonstrates that the stages are absent, not that dispatch thrash is controlled.
**Nothing in this run may be read as a throughput win, an efficiency gain, or evidence about behavior under
load.** What the run does establish is that the ratio is now *observable* -- it has a denominator for the
first time -- and that at the one point sampled, the engine did not thrash.

n=1 is n=1. Decision 0358 binds a baseline to at least three runs at pinned repository state reporting
variance. This is one run, and it is not a baseline.

## Where the run happened, and what that bounds

This matters more than any single number below, so it precedes them.

| Property | Value |
|---|---|
| Venue | A disposable synthetic substrate repository (`n1-substrate`), seeded for the run, with no git remote |
| Journal `repoSlug` | `SatanshuMishra/n1-substrate` -- no such GitHub repository exists |
| Units | Two trivial string/formatting tasks: `slugify-collapse-separators`, `format-duration-minutes` |
| Run id | `7c1a9f0e` (journal `logicalRunId`: `n1-c7-run`) |
| Terminal state | Both units `done`; `quiescent: true`, `aborted: false`; journal closes `{"kind":"quiescent-exit","at":"2026-08-16T23:29:53Z","outstanding":false}` |
| Checkpoint integrity | `refs/mitosis/7c1a9f0e/slugify-collapse-separators` = `ef8839cc`, `refs/mitosis/7c1a9f0e/format-duration-minutes` = `fab3b6a5`; both match the branch tips and the journal's `built` shas exactly |

The run therefore measures **the engine's own overhead on trivial work in a clean room**. It does not measure
the cost of a real MSP against this repository's code, and no figure below should be extrapolated to one. Two
trivial units in an empty substrate is close to the cheapest work the engine can be given; a unit that must
read an existing codebase, hold more context, or iterate against a failing check will cost more, by an amount
this run does not bound.

The run directory lives in an **ephemeral scratchpad outside this repository and is not preserved in version
control**. The figures below were transcribed from it while it existed; a future reader cannot re-derive them
from the repository alone. This is recorded as a downgrade rather than glossed over.

## The measurement

Every cost figure below is paired with the quality assertion in the next section. They are one claim, not two.

### Per dispatch

| Dispatch | Model | Turns | Input | Output | Cold `cache_creation` | Warm `cache_read` | Cost USD |
|---|---|---|---|---|---|---|---|
| `slugify-collapse-separators` | claude-sonnet-5 | 17 | 30 | 4,886 | 85,853 | 1,151,513 | 0.9339519 |
| `format-duration-minutes` | claude-sonnet-5 | 18 | 34 | 4,598 | 87,587 | 1,328,844 | 0.9932472 |
| decompose child | claude-opus-5 | 6 | 8 | 2,502 | 44,386 | 126,668 | 0.5697840 |

Both unit records carry `permission_denials: []` and `api_error_status: null`.

### Totals

| Slice | Dispatches | Input | Output | Cold | Warm | Cost USD |
|---|---|---|---|---|---|---|
| Recorded in `usage.jsonl` (the two units) | 2 | 64 | 9,484 | 173,440 | 2,480,357 | 1.9271991 |
| Decompose child (not recorded) | 1 | 8 | 2,502 | 44,386 | 126,668 | 0.5697840 |
| **Whole run** | **3** | **72** | **11,986** | **217,826** | **2,607,025** | **2.4969831** |

Roughly **2.50 USD, or about 1.25 USD per trivial unit shipped**, decompose included.

### Cold versus warm

The SPEC requires this split and requires the caching caveat to appear with it (`:571`): prompt caching is
content-keyed rather than session-keyed, so a benchmark reusing a fixed payload silently under-reports
creation cost. **This run does not have that defect** -- the two units carry distinct prompts, so each cold
figure is a genuine first-write rather than a warm read misread as cold.

| Dispatch | Warm : cold |
|---|---|
| `slugify-collapse-separators` | 13.4 : 1 |
| `format-duration-minutes` | 15.2 : 1 |
| decompose child | 2.9 : 1 |

**Cache traffic is 99.6 percent of all token volume in this run.** Input and output tokens together are 12,058
of 2,836,909. The practical consequences are two, and both are easy to get wrong:

- A bare "total tokens" figure for this engine is **not proportional to cost** and must not be used as a cost
  proxy. The two unit dispatches differ by 15.4 percent in warm tokens but only 6.3 percent in cost, so across
  two samples of the same shape the quantities do not even track each other.
- Any estimate built from input and output tokens alone would miss more than 99 percent of what is billed.

The decompose child is the outlier on every axis -- the lowest warm:cold ratio, the fewest turns, the highest
cost per turn (0.095 USD against 0.055 for both units), because it alone runs on claude-opus-5. It accounts
for **22.8 percent of the run's total spend across 14.6 percent of its turns**.

## The quality assertion

Cost claims are meaningless without a quality floor: an instrument that counts tokens cannot see whether a
cheaper decomposition also cuts worse. Two assertions apply, and they are distinct.

**For this run, the assertion that holds is:** both units' scoped check ran **green** in the journal's `built`
entries -- each carries `"green":true` alongside its checkpoint ref and sha -- and both children made real
commits carrying tests that assert the spec's literal examples. The 2.4969831 USD above bought two units that
are `done` and green, not two units that merely terminated. This is the pairing for every cost figure in this
document, and it is the reason those figures may be quoted at all.

**The pre-declared assertion, unchanged from before this run,** is the per-MSP CI check matrix with post-merge
rework count secondary. It does not apply to this run and was not claimed for it: the synthetic substrate has
no remote, no CI and no pull requests. It remains the standing assertion for MSP work in this repository, and
is reproduced below as the record.

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

## How the run became measurable

The instrument existed before this branch but was wired to nothing. `captureEnvelope`
(`.claude/lib/mitosis/dispatch.mjs:570`) already read input, output, cache-creation and cache-read tokens and
`total_cost_usd` off the child's envelope; every production consumer then dropped them. Two commits closed
that gap on this branch: `d31c2cb7` added the `recordUsage` writer (`.claude/lib/mitosis/run-store.mjs:298`,
appending to `usage.jsonl` at `:305`), and the `feat/d3-instrument-wiring` work added the production caller
(`.claude/lib/mitosis/cli.mjs:135`). One normalizer (`.claude/lib/mitosis/dispatch.mjs:595`) guards the seam,
so a token count that is not a finite number becomes `null` rather than a fabricated figure.

The two-line `usage.jsonl` this report draws on has exactly the shape that writer emits: a per-attempt record
of `unitId`, `attempt`, `observedAt` and the frozen `envelope`.

**What is not established: which engine build produced the run.** The run artifacts record the substrate's
`repoRoot`, `baseBranch`, `repoSlug` and the invoking `pid`, but no engine source path, no commit sha of the
engine code and no package version. The wiring described above is present on this branch, and the artifact
shape matches it, but the identity of the binary that ran is an inference, not a record. It is downgraded
below and filed as a gap.

## What this run does not support

Stated plainly, because each is a reading the numbers invite and do not carry.

| Not supported | Why |
|---|---|
| "The engine is efficient at 1.0 dispatches per MSP." | 1.0 is the structural floor of a one-dispatch-per-unit engine with no redispatch path, not an achieved result. |
| "Dispatch thrash is under control." | The stages that would produce thrash -- plan, review, security, fix, redispatch -- are absent from the import closure. The ceiling was written for an engine that has them. |
| "An MSP costs about 1.25 USD." | Two trivial units in an empty synthetic substrate. Real MSP work reads an existing codebase and may iterate; this run does not bound that. |
| "These figures are a baseline." | n=1, no variance, unpinned against decision 0358's three-run requirement. |
| "Cost scales with token volume." | Cache traffic is 99.6 percent of volume; across the two units, volume and cost move by 15.4 and 6.3 percent respectively. |
| "The run cost 1.93 USD." | That is the `usage.jsonl` total. It omits the decompose child and understates the run by 22.8 percent. |
| "The measurement is reproducible from this repository." | The run directory was ephemeral and outside version control. |

## Status ledger

Under the receipts honesty ladder. The pre-run revision of this file carried eight `unverified-reasoned`
rows; seven are now measured, one is struck as unsatisfiable, and the remainder are joined by the new items
this run put in view.

### Moved to measured by this run

| Item | Status | Evidence |
|---|---|---|
| The 10-dispatch-per-MSP falsifier | `measured` -- CLEARED at n=1, vacuously | 2 billed dispatches / 2 units `done` = 1.0; 3/2 = 1.5 counting decompose. Vacuity is stated in the verdict, not here. |
| Input tokens per dispatch | `measured` | 30 / 34 / 8 |
| Output tokens per dispatch | `measured` | 4,886 / 4,598 / 2,502 |
| Cache-creation (cold) tokens per dispatch | `measured` | 85,853 / 87,587 / 44,386 |
| Cache-read (warm) tokens per dispatch | `measured` | 1,151,513 / 1,328,844 / 126,668 |
| `total_cost_usd` per dispatch | `measured` | 0.9339519 / 0.9932472 / 0.5697840 |
| Cold-versus-warm split required at SPEC `:571` | `measured` | Split reported per dispatch above, with distinct payloads, so cold figures are genuine first-writes. |

### Struck, not met

| Item | Status | Reason |
|---|---|---|
| Measured comparison against the pre-move baseline (c6 sub-clause) | **`struck` -- unsatisfiable** | Per decision 0485. `origin/main:.claude/workflows/mitosis.js` contains zero occurrences of `total_cost_usd`, `cache_read_input_tokens` or `cache_creation_input_tokens`. The pre-move engine never recorded cost or cache figures at all, so there is nothing on the other side of the comparison and **no merge order recovers it**. This is not a check that was skipped or deferred; the comparison cannot be constructed. It is struck rather than downgraded, and must never be recorded as met. |

### Still downgraded

| Item | Status | Reason |
|---|---|---|
| A binding cost baseline | `unverified-reasoned` | Decision 0358 requires at least three runs at pinned repository state reporting variance. There is one run, on a synthetic substrate. Tracked as a separate item, not filed by this report. |
| Variance across runs | `unverified-reasoned` | One sample yields no variance. The 6.3 percent cost spread between two units of the same shape is a within-run observation, not a variance estimate. |
| Dispatch behavior under load or on failure | `unverified-reasoned` | Neither unit failed, so the redispatch path was never entered. Whether the ratio holds when a unit fails is untested. |
| Cost of a non-trivial unit | `unverified-reasoned` | Both units were trivial and the substrate was empty. |
| Identity of the engine build that produced the run | `unverified-reasoned` | The run artifacts record no engine source path, commit sha or version. |
| Reproducibility of these figures from the repository | `unverified-reasoned` | The run directory was ephemeral, outside version control, and is not preserved. |
| The agent-ledger proxy's per-dispatch figures | `unverified-reasoned` | Unchanged and now moot for the falsifier. The proxy's limitations are retained below. |

## The proxy, retained as the pre-run record

This section is kept because it documents why the question was unanswerable before today. **It is no longer
the basis for any claim in this report**, and none of its figures may be compared to the 10-dispatch ceiling:
it counts human-orchestrated agent dispatches from Claude Code sessions, a different population from engine
dispatches inside one mitosis run.

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

### Limitations of the proxy

Every one of these is a reason a proxy number cannot be pushed further than it is pushed. They are unchanged
by this run.

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

## Corrections to the SPEC

Three statements in the D3 section of the SPEC are false or superseded as written and should not be relied on.

| SPEC claim | Reality |
|---|---|
| `:573` "`.claude/reports/` is git-tracked." | It is ignored at `.gitignore:11` (`/.claude/reports/`), and git tracks zero files under it. A report written there is invisible to the enforcer, to the pull request and to a fresh clone. This report is therefore under `.claude/docs/`, which is tracked. |
| `:563` "a measurement report under `.claude/reports/`, plus the aggregation in `run-store`." | The report location is corrected as above. The aggregation remains a per-attempt writer rather than a roll-up; with one run there is nothing to aggregate across. |
| The predicted non-zero exit on a failing terminal action | **It did not occur.** The terminal `gh pr view` failed -- the substrate's `repoSlug` names no existing GitHub repository -- and the CLI surfaced that as a structured `prState.status: 1` while the process itself exited **0**. |

That last row is the one worth carrying forward. A zero exit code did not mean the terminal action succeeded,
which is precisely the inference receipts forbids. The engine did the right thing by putting the failure in a
structured field, but any consumer reading only the exit code would have recorded this run as wholly clean.

## Filed as new items, not folded into this unit

Acceptance is a ceiling. These were discovered above the criterion this unit was given, and are recorded here
rather than fixed in flight.

1. **`usage.jsonl` omits the decompose child**, because decompose runs before `openRun`. Any consumer that
   sums the file and calls the result "run cost" is low by the decompose dispatch -- 22.8 percent on this run,
   and proportionally more on a run with fewer or cheaper units.
2. **Run artifacts record no engine build identity** -- no engine source path, commit sha or version -- so a
   run cannot be attributed to the code that produced it.
3. **Run artifacts are not preserved.** The run directory is ephemeral and outside version control, so a
   published figure cannot later be re-derived from its source.
4. **A three-run pinned-state baseline** per decision 0358 remains unfiled and unstarted.

## What would make the falsifier non-vacuous

Not more runs of this engine. A run of an engine that *has* a plan, review, security, fix or redispatch stage,
or a run in which a unit fails and is redispatched. Until one of those exists, the ratio is bounded below by
the architecture at 1.0, and any measurement of it will clear a ceiling of 10 without carrying information.
Adding runs raises n; it does not make a structurally floored number mean more than it means.
