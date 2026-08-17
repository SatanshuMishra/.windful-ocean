# U3.3 acceptance criterion — audit-time query skill

Declared before implementation, per SPEC section 5 and receipts/gates@1.1 G0. This is a
CEILING. Anything discovered above it is filed as a new item, never folded in.

Parent commit: `cd96b820`. Base branch: `feat/observer-capability-blocked`.

## 0. Measurements taken before the criterion was written

DuckDB v1.5.5 (`d8cdaa33fd`) was installed and probed against synthetic corpora. The probe
changed the design, so it is recorded here rather than asserted later.

| Probe | Result |
|---|---|
| `columns=` declared, malformed `ts` | stays VARCHAR, `TRY_CAST` yields a countable null, no exception |
| `read_json_objects` + `json_keys` | returns raw per-line key sets with no inference; usable as a closed census |
| 20601-row file, no `sample_size`, no `columns=` | the three capability keys are SILENTLY DROPPED from the schema |
| 20601-row file, `sample_size=-1`, no `columns=` | the three capability keys are recovered |
| 20601-row file, `columns=` declared, default `sample_size` | the three capability keys are present |
| glob matching no files | DuckDB raises an IO Error and exits non-zero |
| month with no capability rows, `columns=` declared | `needed` binds and counts 0 |
| month with no capability rows, `columns=` removed | Binder Error: referenced column not found |

Two of those rows are load-bearing and were not anticipated:

1. **With an explicit `columns=` list, `sample_size` and `union_by_name` become no-ops for
   schema resolution.** All three stay pinned because they are the declared contract and
   because two of them become load-bearing the moment the third is dropped, but only
   `columns=` is independently killable. No mutation is claimed against the other two.
2. **The decisive behaviour of `columns=` is not sampling, it is binding.** A month that
   contains no `capability_blocked` row has no `needed` key at all, and without a declared
   column list the blocked question does not return zero — it crashes. That is the exact
   "zero versus nothing" confusion this unit exists to remove, so it is the reader mutation.

## 1. A check RED on the parent commit and GREEN on the head

`node --test .claude/lib/observer-audit/tests/audit-queries.test.mjs`

RED on `cd96b820` because the module under test does not exist there. GREEN on the head with
every question answered against the committed fixture. Both outputs are quoted in the report.

## 2. What each question must assert

| Id | Ships | Assertion |
|---|---|---|
| `ran-and-duration` | yes | per-agent-type counts and paired durations over the DISPATCH population only; the output carries no cost, token, cache or turn field |
| `fell-back` | which only | counts of the two fallback agent types over the DISPATCH population, denominator named; no `why` column exists |
| `blocked` | yes | `capability_blocked` rows grouped by `needed` AND `detected_from`, the split preserved |
| `failed` | yes | start-without-stop beyond the horizon; in-flight starts excluded; stop-without-start reported in a SEPARATE column |
| `never-observed` | yes | roster entries with no observed dispatch, labelled with the exact string `never-observed` and carrying a coverage figure; the string `unused` appears nowhere in the output |
| `downgrade-recurrence` | no | hard failure with a distinct exit code naming the candidate corpora; never an empty result set |

Every answer names the population it is computed over. No rate is computed over all rows.
`depth` null is carried as its own bucket, never folded into 1.

## 3. Inertness mutations, one per question plus two structural

Each is applied to a COPY in a temp directory. The runner never mutates its inputs, and the
committed fixture is never mutated. Every substitution is verified to have actually changed
the file before the result is trusted.

| # | Mutation | Expected red |
|---|---|---|
| 1 | corrupt the paired stop row's `ts` | `ran-and-duration` |
| 2 | rewrite the fallback agent type to a specialist name | `fell-back` |
| 3 | drop the `detected_from` split from the grouping | `blocked` |
| 4 | give the unpaired start a stop row | `failed` |
| 5 | add the never-observed agent to the observed set | `never-observed` |
| 6 | make the downgrade stub return an empty result instead of failing | `downgrade-recurrence` |
| 7 | remove `columns=` from the reader | the oversampled no-capability case |
| 8 | point the log root at an empty directory | ALL SIX questions exit non-zero |

## 4. Registry closure

The question registry's key set is asserted equal to exactly those six ids. A seventh added
without an expected answer halts the test rather than passing silently.

## 5. Key census closure

An inference-free census over raw JSON enumerates the key set of every event and compares it
against exactly two declared shapes. Any other shape HALTS and is named. Not a pinned count,
not a sampled allowlist.

## 6. No-collateral assertion

Asserted by diff. This unit must not touch:

- `.claude/hooks/`
- `.claude/settings.json`
- `.claude/agents/`
- `.claude/skills/platform-engineer/`
- `.claude/skills/conformance-auditor/`

## 7. Tool availability is part of the criterion

The runner resolves an env override, else `duckdb` on PATH, else exits with a distinct
non-zero code naming the install command. It never skips and never degrades. A pinned install
step is added to CI, because a check that runs on one laptop is not a re-runnable criterion.

## 8. Filed above the ceiling, not built here

- **U3.3c** — a source for WHY a dispatch fell back. The rationale lives in the dispatch
  description; the writer does not copy it and nothing emits a `fallback_reason` event.
- **U3.3d** — a source for downgrade-reason recurrence. No field, no event type, not in this
  log; the candidate corpora are pull request bodies and the enforcer run.
- **U3.3e** — registering the skill in a `repo-checks` CI job. Conditional on PR 193 merging;
  that job did not exist in this branch's ancestry when this criterion was pinned.
  DISCHARGED mid-run: PR 193 merged, the stack was rebased onto it, and the job now exists in
  the ancestry, so the skill is registered in it rather than left as a follow-up. Recording a
  filed item as done is not a new criterion; nothing above was added or relaxed.

## 9. Deviations discovered after the criterion was pinned

Neither was anticipated, and both sit outside the no-collateral set rather than inside it.

- The repository runs a deny-by-default spawn census over `.claude/lib`. The new DuckDB
  runner is a spawn site, so it is registered there as a declared exception with a written
  reason. Routing it instead would have required widening the allowlist that governs every
  `gh` and `git` spawn in the engine AND defeating its path-qualified guard.
- The name-integrity census reads a binding whose name ends in `agentType(s)` as declaring
  dispatch targets, and its platform list named only `general-purpose`. The fallback pair this
  unit must count is `general-purpose` and `claude`, which `.claude/rules/common/agent-roster.md`
  names together as the two built-ins. `claude` is added to that list and to its pinning
  assertion, which stays closed: an unknown type is still red.
