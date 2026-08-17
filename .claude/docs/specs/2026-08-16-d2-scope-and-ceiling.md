# D2 scope and ceiling

This document is D2's G0 artifact under `receipts/gates@1.1`. Section 3 is the complete definition of done. It follows the precedent of `.claude/docs/specs/2026-08-15-c7-scope-and-ceiling.md`.

Base commit: `c067cfce`. Governing SPEC: `.claude/docs/specs/2026-08-12-mitosis-os-process-rearchitecture-design.md`, Cluster D at `:533-575`, D2 at `:549-557`.

Acceptance below is a CEILING. Anything discovered above it is filed as a new item under section 5; it is never folded into D2 and never reopens a unit that already met its criterion.

## 0. SPEC citation drift

The SPEC's admission requirement at `:28` demands every `path:line` resolve before implementation. Re-verified against `c067cfce`; four values have drifted and this section, not the SPEC, is authoritative for D2.

| SPEC claim | Location | Measured at `c067cfce` |
|---|---|---|
| `mitosis.js` is 5,515 lines | `:551` | 5,762 lines |
| the four workflow-sandbox tests are 28 tests | `:551` | 129 tests (78 + 29 + 14 + 8) |
| `mirror-guard.test.mjs` is 7 tests | `:551` | 31 tests |
| `CI_ENFORCER_CHECK_TOKENS` at `mitosis.js:2264` | `:359` | `mitosis.js:2500` |

`mitosis.js` lives at `.claude/workflows/mitosis.js`, not under `.claude/skills/mitosis/`. `.claude/workflows/mitosis-execute.js` is a separate file and is OUT of D2 scope.

## 1. Ratified rulings

Three questions were open at the D2 boundary. All three are ruled here, before work starts.

### 1.1 `dead-export-lint` is not written; D2's acceptance is amended

D2's acceptance at `:555` requires `` `dead-export-lint` is green ``. That lint does not exist in this tree and was deliberately retired at commit `80de7fa9` (2026-08-15), an ancestor of the base, on the express grounds that it "is a project-local verification mandate over the codebase, mapping to no receipts gate, and the pinned count is the change-detector testing.md forbids."

The SPEC is dated 2026-08-12 and named the lint three days before the repository removed it. Reviving it would reverse decision 0438 and criterion c17, both already merged to main, and would violate the closed-set rule in `receipts.md`.

The clause is struck. The concern behind it is real and is discharged by section 3.1 criterion 3, which is a closed enumerated check over a bounded set, not a liveness mandate over every export.

### 1.2 The PR-composability halt is dropped; the coarse-scope lint is wired

`prComposable` (`mitosis.js:3745-3748`, halt at `:4454-4457`) is DROPPED. It is subsumed three times over:

- `decompose-schema.mjs:41-45` constrains `changeType`, `scope`, `title` and `rationale` per field before any title is composed. Worst-case composed length is 68 against the 72 cap, and the title's terminal character class `[\x21-\x2D\x2F-\x7E]` already excludes trailing space and period. Enforced at `decompose-emit.mjs:229-232`.
- `pr.mjs:155-156` rejects a non-conforming title at PR creation.
- `receipts.yml:58` re-checks the live PR title in CI.

The single non-duplicated behavior is `PR_VALUE_SHELL` (`mitosis.js:3709`), which bans `$`, backtick and backslash in title and rationale. It existed because `mitosis.js` interpolated those values into a shell command string. `pr.mjs` is argv-only via `spawnSync` with no `shell` option, so there is no live exposure. Filed as section 5 item F4; no code is carried.

`lintCoarseScope` is WIRED. It already exists at `run-engine.mjs:159` with `COARSE_SCOPE_FILE_THRESHOLD` at `:88` and 11 test cases in `tests/coarse-scope-lint.test.mjs`. Nothing on the OS-process path calls it, and `prompt-plan.mjs:25` tells the decomposer that "a deterministic post-derivation lint flags suspiciously coarse scopes" — a claim that becomes false the moment its only caller at `mitosis.js:4478` is deleted. D2 makes that sentence true again.

### 1.3 The reference clause is scoped to executable references

D2's acceptance at `:555` requires "no surviving reference to `mitosis.js` in any skill, hook, doc or settings entry." Taken literally this is unsatisfiable and self-contradictory:

- 57 files reference `mitosis.js`; 31 are markdown, including the governing SPEC that mandates the clause.
- D1 shipped `block-inline-engine.mjs` one MSP ago, and `:541` of the SPEC requires that hook to "refuse a `Workflow` call naming `mitosis.js`." The hook must retain the name to do its job.

The clause is scoped to EXECUTABLE references: production code that reads, imports, targets or enumerates the file; test files that load it; gate targets; CI invocations. Exempt, and enumerated in section 4:

- Historical and governing documentation.
- `block-inline-engine.mjs:5,7`, where the basename is a deliberate refusal string and matching is by basename, not by file existence.
- Error and obligation prose at `derive-edges.mjs:43` and `journal-store.mjs:22`.

## 2. Decomposition

D2 ships as two stacked MSPs on base `feat/mitosis-os-process`. The split exists because there is no single-commit ordering that keeps the tree green: the un-wiring must precede the deletion.

- **D2a — un-wire.** Every consumer stops depending on `mitosis.js`. The file still exists. Tree green.
- **D2b — delete.** `git rm` of the file set plus the test files whose subject is gone. Tree green.

D2b depends on D2a. Neither may merge to main; both target `feat/mitosis-os-process`.

## 3. Definition of done

### 3.1 D2a — un-wire

1. `phase-parity` no longer targets `mitosis.js`. `DEFAULT_PHASE_PARITY_TARGET` (`mitosis-gate-core.mjs:29`) and the `PHASE_AUTHORITY_BY_TARGET` key (`:61`) resolve to `.claude/lib/mitosis/phases.mjs`. `node .claude/lib/mitosis/mitosis-gate.mjs phase-parity` exits 0, and `.github/workflows/test.yml:22` passes.
2. `determinism-lint.mjs:62` no longer declares `mitosis.js` as a census root. `node .claude/lib/mitosis/mitosis-gate.mjs determinism` exits 0. `determinism-lint.test.mjs:36,46` reconciled.
3. No lib export whose sole caller is `mitosis.js` is left without a caller. The check is a CLOSED enumeration over the modules `mitosis.js` imports or inlines, emitted as a list; it is not a pinned count and not a whole-tree liveness sweep. At minimum it covers `lintCoarseScope`.
4. `lintCoarseScope` runs on the OS-process path. It is invoked from `decompose-emit.mjs` on the fresh-decompose path, its flags are surfaced on stderr, and it is warn-only — it never halts a run. `decompose-emit.mjs` does not import `run-engine.mjs`; the lint and its glob dependencies (`normalizePath`, `scopeCovers`, `scopeDirPrefix`, `scopeIsSpecificFile`, `namedFilesInText`) reach it through a module that survives D2b.
5. `prompt-plan.mjs:25` is true as written, or amended to match what now runs.
6. `phase-model.test.mjs:204` no longer asserts `workflows.length >= 2`. That hard floor is a change-detector and fails the moment the directory shrinks.
7. An acceptance test is RED on the parent commit and GREEN on D2a, asserting that `lintCoarseScope` is reached from the decompose path. It survives an inertness mutation: remove the call site and the assertion turns red.
8. The suite is green. `node --test` over the project's declared test globs reports 0 failures.
9. `mitosis.js` still exists and is unmodified.

### 3.2 D2b — delete

1. These seven SPEC-named paths are removed: `.claude/workflows/mitosis.js`; `.claude/lib/mitosis/workflow-sandbox.mjs`; `tests/workflow-sandbox.test.mjs`; `tests/workflow-sandbox-census.test.mjs`; `tests/workflow-sandbox-traps.test.mjs`; `tests/workflow-sandbox-policy.test.mjs`; `tests/mirror-guard.test.mjs`.
2. Every test file whose subject is `mitosis.js` and which fails at module load is removed in the SAME commit: `mitosis-scheduler.test.mjs` (195), `frontier-train-e2e.test.mjs` (54), `prompt-divergence.test.mjs` (29), `gh-scope-lint.test.mjs` (18), `reconcile-only-advance-characterization.test.mjs` (6), `prepare-probe-template-scope.test.mjs` (5). A split that deletes the source and keeps the test has no green intermediate.
3. `mirror-guard.test.mjs` is DELETED, not rewritten. Its entire premise is a lib module against its inline copy in `mitosis.js`; with the file gone the check has an empty domain, which is the vacuity trap.
4. Partial failures are resolved rather than suppressed: `no-self-merge-consent.test.mjs:20,63,64,72`, `coupling-hardening.test.mjs:404`, `remediation.test.mjs`, `transcription-conversions.test.mjs:25`.
5. No EXECUTABLE reference to `mitosis.js` survives, per the scope in section 1.3. The exempt set is exactly: markdown under `.claude/docs/` and `docs/`; `block-inline-engine.mjs:5,7`; `derive-edges.mjs:43`; `journal-store.mjs:22`; synthetic fixture strings in `.claude/hooks/tests/`. Any reference outside that set is a failure.
6. `.claude/skills/mitosis/SKILL.md` carries no instruction that resolves to a deleted file.
7. The suite is green, and the count of removed tests is REPORTED as measured, not asserted against the SPEC's 35.
8. `.claude/workflows/mitosis-execute.js`, `run-engine.mjs`, `engine-args.mjs` and `ci-escalation.mjs` are NOT touched. They are section 5 item F1.
9. `mitosis-gate-core.mjs:1` imports `compileWorkflow` from `workflow-sandbox.mjs`, which criterion 3.2.1 deletes. `compileUnderSandbox` has zero production callers after D2a and only two test callers. Both the import and `compileUnderSandbox` are removed in the same commit that deletes `workflow-sandbox.mjs`, and the two test callers are resolved rather than suppressed.

Criterion 9 is an amendment pinned before D2b started, on a gap D2a surfaced after this document was written. Deleting the module without it leaves the gate importing a file that no longer exists, so every gate verb would fail at module load.

## 4. Verification ceiling

Both MSPs clear, at their own commit:

- `node --test` over the declared globs, 0 failures.
- All four gate verbs: `determinism`, `dispatchable-agent-schema-capable`, `exec-allowlist`, `phase-parity`.
- `semgrep scan --config p/default` over the diff, clean. Semgrep is installed locally and does not wait for CI. It blocked D1b2 on a rule none of the four verbs cover (decision 0458).
- The receipts enforcer green on the pull request.

No other check is admitted. A reviewer finding that breaks no gate is filed under section 5, not fixed in flight.

## 5. Filed out of D2

These are real and are NOT in D2's ceiling.

- **F1 — the three legacy modules.** `run-engine.mjs` (661), `engine-args.mjs` (90), `ci-escalation.mjs` (153), plus `.claude/workflows/mitosis-execute.js`. Unreachable from `cli.mjs`, but `ci-escalation.mjs` is not independently deletable: `ci-facts.mjs:1` consumes `CI_SHA_PATTERN`, `CI_TERMINAL_CONCLUSIONS` and `classifyCiReport`, and `ci-escalation.mjs:1` consumes `normalizePath`, `scopeCovers` and `sensitiveScope` from `run-engine.mjs`. The chain `run-engine <- ci-escalation <- ci-facts <- transcription-conversions <- git-command-separation` carries roughly 240 test cases. Deleting these requires a prior rehoming MSP and is its own unit.
- **F2 — `generate-run-script.mjs`.** Its only non-test importer is `engine-args.mjs:1`. It is orphaned when F1 lands, not before.
- **F3 — the second `scopedCheckCmd` seam.** `generate-run-script.mjs:154`, un-normalized, not named by decision 0453.
- **F4 — the shell-metacharacter residual.** If any future path re-introduces string interpolation of `title` or `rationale`, the `$`/backtick/backslash ban must be restored, correctly as a test inside `pr-format.mjs`'s `inertValue`, never as a new module.
- **F5 — the journal-append duplication.** `appendRunJournal` is declared at `mitosis.js:5637` and called once at `:5689`; five sites at `:4504`, `:4758`, `:4783`, `:4842` and `:4864` are hand-duplicated inline blocks. This dies with the file in D2b and needs no remediation; the obligation note at `journal-store.mjs:22` cites a stale line (`5574`) and is corrected as prose only.

## 6. Known operational hazards

- `block-destructive-bash.sh:17` treats `workflows/` as a guardrail prefix. Removing `.claude/workflows/mitosis.js` is asserted as an ASK, not a deny, at `block-destructive-bash.test.mjs:368,373-375`. Expect a confirmation prompt.
- The base is 265 ahead of and 56 behind `origin/main`. Whether to fold `origin/main` into the base is a separate decision at the D2/D3 boundary and is not D2's to make.
- Compare branch state against `origin/feat/mitosis-os-process`, never the local ref, which is stale at `995616e6`.
