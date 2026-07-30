# Mitosis core rebuild — step 6: fix pipeline, phase collapse, gate model

Status: approved architecture, not implemented
Author date: 2026-07-30
Landing-order position: step 6 of the eight-entry order amended by decision 0116.
Binding decisions: 0115 (phase collapse and deletions), 0117 (gate trust model), 0118 (two work types), 0119 (relaunch and resume envelope), 0120 (LSP seeding rules), 0121 (phase parity). Governing: 0106, 0107, 0108, 0109, 0110, 0111, 0112, 0113, 0114, 0116.
Supersedes nothing. It is the terminal step of the rebuild authorized by 0111, and it consumes the artifacts steps 0-5 land.

## 0. Purpose and success condition

Ship one work-type pipeline (`fix`) on a collapsed phase set, with review replaced by gates wherever a gate can decide the property.

Success condition, all three required:

1. A `fix`-typed spec ships end to end through the collapsed phase set, and its receipt is observed red on the base and green on the branch by a deterministic verb — not asserted by a model.
2. The engine's declared phase set and its phase call sites are identical, and a gate proves it.
3. Every claim on a pull request's `Verified:` lines is composed from a journaled gate manifest rather than from a model's restraint.

Not a success: a green run whose gates were never proven able to fail (0117); a pipeline that passes because the model got lucky rather than because the executor worked (0110); a dispatch count that beats the baseline by deleting the oracle rather than the exploration (0116).

## 1. Scope fence

0106 names the second-system effect as the primary danger, and 0115's directive is that deleting a phase beats optimizing it. This spec therefore adds no phase, no work type, and no scheduler.

In scope: the phase collapse and its parity gate; the gate model (probe by execution, manifest, differential comparison, per-work-type floors); the `fix` pipeline expressed as data over one interpreter; the Resume entry point and its args envelope as step 6 consumes them; the measurement that makes 0115's falsifiers payable.

Out of scope, each closed by a ratified decision:

| Excluded | Closed by |
|---|---|
| Pipelines for `refactor`, `perf`, `docs`, `chore` | 0118 |
| The `feat` pipeline (second, not now) | 0110, 0118 |
| Bootstrapping test infrastructure in a target repo | 0117 |
| An off-the-shelf durable-execution runtime | 0108 |
| A global adaptive speculation window | 0109 |
| Speculation depth above 1 for the first pipeline | 0109 |
| A webhook, daemon, or server for the relaunch trigger | 0119 |
| `fileScope`-only task-edge derivation | 0116, 0120 |
| Worktree reaping, the sandbox test harness, twinning removal, the state model, restack | steps 0-4, owned elsewhere |

## 2. Preconditions

Hard preconditions. Step 6 is not startable until each has landed, because step 6 has no fallback for its absence.

| Step | What it supplies | Why step 6 cannot proceed without it |
|---|---|---|
| 0 | worktree reaper (0113) | 12 leaked worktrees hold branches checked out, and git refuses `branch -f` on such a branch; the collapse edits the ref-moving paths |
| 1 | test harness reproducing the real sandbox global surface (0107) | `frontier-train-e2e.test.mjs:15-17` reconstructs the engine with `new AsyncFunction` in real Node, a strictly more permissive context than production, so today's green certifies nothing about a rebuilt core |
| 1.5 | streaming scheduler flip (0116) | Ship folds a CI wait of up to 1800s into one dispatch; under the tick join that wait holds the unit's slot |
| 2 | twinning tax removed (0112 revised order) | every engine edit below otherwise lands twice, byte-identically, in one commit |
| 3 | durable state model, journal, `journal-append` verb (0108, 0116) | the gate manifest, the prompt-hash journal key, and the resume envelope all read from the journal |

Soft precondition. Step 4 (restack) and step 5 (depth) may be absent: 0109 fixes the first pipeline at depth 1, which requires no restack. The depth constant must exist and read 1; raising it to 2 requires a restack proven for `fix` specifically, and that is a separate decision.

Human precondition. A guard hook holds every Edit and Write under `.claude/{hooks,rules,lib,workflows}` for human approval, by path and by resolved path. Every MSP below writes into those trees. Implementers cannot be fanned out unattended; plan for interactive approval per write.

## 3. Governing laws

These are not restatements for completeness. Each one decides a design question below, and an MSP that violates one is wrong even if it passes its own acceptance.

1. **Prose is the syscall ABI (0107).** `agent(prompt)` is the orchestrator's only effector. Every deterministic activity below is still one `agent()` dispatch carrying one command string. The saving is prose recipe to typed verb, never dispatch elimination.
2. **Never encode an invariant in a prompt (0107).** Encode it in a gate; the prompt may describe the gate. A prompt is advisory input to a sampler and guarantees nothing.
3. **Gates over reviews (0112 rule 1).** Anything a gate can decide never reaches a reviewer.
4. **A second reviewer needs a different lens (0112 rule 2).** Two correctness reviewers is one reviewer plus latency.
5. **Every claim carries its cheapest falsifier, run before elaboration (0112 rule 3).** Each MSP below names what would refute it.
6. **One oracle per property, at the cheapest layer that can decide it (0112 rule 4).**
7. **A pass never means "no issues" (0117).** It means the declared, failability-proven set is satisfied, and everything else is named residue.
8. **An unmet floor halts fail-closed, naming the missing capability (0117).** It never degrades silently to review.
9. **Pillar order (pillars.md).** Quality, then optimization including tokens, then wall-clock speed. Never trade down.

## 4. The phase model after collapse

Current state, verified in this session against `.claude/workflows/mitosis.js` at 4,851 lines: 13 declarations at `:5-17`, 13 `phase()` call sites, and 45 `phase:` literals in agent options spanning 13 distinct titles.

| Declaration (`mitosis.js:5-17`) | `phase()` call | Fate | Resulting title |
|---|---|---|---|
| Reconcile `:5` | `:3633` | fused with Prepare into one probe | Probe |
| Decompose `:6` | `:3802` | kept; absorbs the task cut | Decompose |
| Prepare `:7` | `:3916` | fused into Probe | Probe |
| Plan `:8` | `:4333` | deleted; survives only as a `needsPlan` escalation | — |
| Plan review `:9` | `:4357` | deleted; auto-approves by construction at `:889-899` | — |
| Parallelize `:10` | `:4402` | deleted as a dispatch; edges become a verb | — |
| Branch `:11` | `:4492` | deleted for root MSPs; frontier-only prep survives | Prep |
| Waves `:12` | `:1146` | renamed | Execute |
| Integrate `:13` | `:1156` | kept; absorbs Boundary as `gate-lint` | Integrate |
| Boundary `:14` | `:1231` | folded into Integrate; the prompt at `:1206-1228` is already fully mechanical | — |
| Final review `:15` | none | deleted; declared and never entered | — |
| Ship `:16` | `:4641` | kept | Ship |
| Remediate `:17` | `:3304` | kept; the exception path 0106 preserves | Remediate |
| undeclared | `:2906` `phase('Shepherd')` | declared under its honest name | Resume |

Resulting declared set, exactly eight: **Probe, Decompose, Prep, Execute, Integrate, Ship, Resume, Remediate**. Six on the happy path; Resume entered only on relaunch; Remediate only on failure.

Two ambiguities in the binding decisions are closed here, because an implementer would otherwise have to guess.

**Cut is not a title.** 0121's mapping reads "Decompose becomes Decompose plus Cut" while its resulting set has no Cut. The resulting set governs: decompose-and-cut is ONE dispatch under the single title Decompose, consistent with 0115's "3 round-trips (probe, decompose+cut, implementers)".

**Parity is static, not per-run.** Prep is entered only for frontier MSPs, so a single-root run never enters it. The gate therefore asserts a property of the source — every declared title has at least one call site and every called title is declared — never that a run entered every phase.

## 5. Findings that sharpen the binding decisions

Both were measured this session and neither widens scope. Flagged rather than assumed, because they change what an implementer builds.

**Finding 1: parity has a third surface.** 0121 names `meta.phases` and `phase()` call sites. The Workflow tool contract also assigns an agent to a progress group via `opts.phase`, where the same string means the same group box. The engine carries 45 such literals over 13 titles — `phase: 'Shepherd'` at `:2887`, `:2994`, `:3033` alongside its `phase('Shepherd')` call at `:2906`, all four undeclared. An `opts.phase` value that is not declared creates exactly the unnamed progress surface 0121 exists to prevent, so the gate covers all three surfaces. `Final review` has zero `opts.phase` occurrences, which confirms 0121's finding that it is wholly inert.

**Finding 2: the engine already contains a live instance of the mistake 0117 forbids.** 0117 requires probing gates by execution, never by config detection. The current prepare probe detects gate presence with `git cat-file -e origin/<base>:receipts.config.json`, `:.github/workflows/receipts.yml` and `:scripts/d6-check.cjs` at `:3925-3928` — file presence, never execution. That is the same inference 0103 made and 0107 caught: code presence read as evidence that code runs. `gate-probe` therefore replaces an existing defect rather than adding a new layer, and the `BROKEN` state (non-zero on a clean base) is invisible to the current probe by construction.

## 6. Dispatch budget

0115 fixes the census at 100 to 57: 3 fixed plus 6 x 9 for a 6-MSP zero-failure run, and its falsifier fires if dispatches per shipped MSP exceed roughly 10. 0116 then added an LSP-driven edge derivation that 0115 had assumed would be free and in-engine. The budget is preserved rather than inflated, by allocation:

| Bucket | Count | Composition |
|---|---|---|
| Fixed per run | 3 | `run-probe`; decompose-and-cut (which also invokes the edges verb for every MSP inside the same dispatch); `gate-probe` |
| Per MSP | 9 | 3 implementers, 3 design reviews, 2 integrate (`integrate`, `gate-lint`), 1 ship (`publish` then `ci-watch` in one dispatch) |

Two allocations are load-bearing and must not drift. The edges verb runs **inside** the decompose dispatch, because the decomposer already holds the repo picture when it emits `fileScope`, so invoking a verb there adds output, not exploration (0115), and adds no round trip. `publish` and `ci-watch` are two verb invocations in **one** dispatch; the CI wait blocks in a subprocess and costs zero model tokens, exactly as `rules/common/performance.md` prescribes.

Free prose git transcription goes to zero: 45 deterministic operations currently expressed as prose recipes become typed verbs (0114, 0115).

## 7. Verb surface

Today's surface is three verbs — `MITOSIS_GIT_VERBS = ['pr-create', 'pr-close', 'compare']` at `mitosis-git.mjs:30`, in 569 lines. Step 6 adds ten. Six are transcriptions of prose recipes the engine already dictates verbatim, so they are not new logic (0115); four are new capability from 0117, 0120, 0121 and the measurement requirement.

Three entry points, split by reason to change, not by taste. `mitosis-git.mjs` at 569 lines cannot absorb ten verbs under the 800-line ceiling in `rules/common/coding-style.md`, and two of the new concerns must not be able to perform an effect at all.

| CLI | Verbs | Reason to change |
|---|---|---|
| `mitosis-git.mjs` | `pr-create`, `pr-close`, `compare` (existing) + `run-probe`, `unit-prep`, `integrate`, `publish`, `ci-watch` | forge and ref effects; verb bodies live in per-verb modules so the dispatcher stays thin |
| `mitosis-gate.mjs` | `gate-probe`, `gate-lint`, `phase-parity`, `budget` | assertions only. These also run in target-repo CI, where the receipts workflow deploys them, so they must be invocable without the effect surface. A gate that can perform an effect is a category error |
| `mitosis-intel.mjs` | `derive-edges` | spawns a language server. Neither other CLI may |

Contract every verb obeys, without exception: argv in, exit code plus one JSON document out; no shell; no judgment. A verb that needs judgment is a design error, and the correct response is to hand that decision back to an LLM stage, never to add a heuristic inside the verb.

## 8. The gate model

### 8.1 Three tiers

| Tier | Gates | Portability |
|---|---|---|
| 1, universal | PR title grammar (`PR_TITLE_PATTERN`, `mitosis-git.mjs:152`), conventional-commit form, `fileScope` violation, secret scan, no-comment and no-emoji, diff size, phase parity | shipped free in any git repo |
| 2, discovered | lint, typecheck, build, test | found by probe, never assumed |
| 3, the receipt | one authored per change | the only gate whose failability is structurally proven every time, which is why 0110 chose `fix` first |

### 8.2 Probe by execution

`gate-probe` runs each candidate against the **unmodified base** and records `present`, `absent`, or `BROKEN`, where `BROKEN` means non-zero on a clean base. Config detection is forbidden (finding 2). Output is a gate manifest journaled with each gate's command string and its hash. The hash is part of the journal key per 0108 specific 1, so a changed gate cannot reuse a stale verdict.

### 8.3 Every project gate is differential

Never absolute. Run both sides and diff the multiset, gating only on new findings. `mitosis.js:1206-1228` already does this correctly — multiset identity diff plus a config-strictness diff, so a task cannot pass by loosening config. `gate-lint` generalizes that design; it does not replace it. Differential comparison is also what makes a `BROKEN` gate survivable rather than fatal.

### 8.4 Per-work-type floors

| Work type | Floor | On unmet floor |
|---|---|---|
| `fix` | a runnable test command **and** an authored receipt | no `fix` pipeline. Halt fail-closed, name the missing capability, point at the human-invoked `verify-setup` skill |
| `feat` | build or typecheck, plus whatever tests exist | halt fail-closed, same shape. Review still carries behaviour, because `feat` has no objective oracle |
| anything else | none defined | refuse at intake, naming the declared type. 0118 |

### 8.5 The infrastructure line

Mitosis deploys its **own** gates into a target repo — already established practice, since the receipts workflow ships `pr-title-lint` at `.claude/skills/mitosis/templates/receipts.yml:25` — and authors **one** receipt inside an existing runner. It does not choose a test framework, author a suite, or bootstrap infrastructure as a side effect of shipping a spec. The gap is made loud and named.

### 8.6 What review still owns

Is this the right design; does it satisfy spec intent; is this a security hole that is not a lint rule; is the abstraction wrong. Nothing else.

### 8.7 Failability is proven, never assumed

Every gate ships with a fixture that makes it fail. A gate without a red fixture does not land. This is the direct application of 0112: a test that cannot fail is worse than waste, because it manufactures false confidence.

## 9. Task-edge derivation

Edges stay LSP-grounded and derivation stops being a model exploration (0116). The four rules from 0120 are binding as written.

1. **Seed set** is the `fileScope` union plus the transitive importer closure of that union, walked to fixpoint by deterministic grep. One hop is insufficient: a barrel re-export hides the real caller two hops out. Whole-repo seeding is rejected — 1,531 candidate JS files and 24 MB in this repo alone.
2. **The verb declares its seed set** in its output. An answer means edges are complete within the declared seed, never that no other caller exists. This is 8.1's declared-coverage model applied to the dependency oracle.
3. **A closure exceeding its declared cap halts fail-closed**, naming the cap. It never answers partially.
4. **A canary receipt ships with the verb**: a fixture with a known cross-file call edge, asserting that the seeded query finds it **and** the unseeded query misses it.

Rule 4 is not defensive padding. Measured on 2026-07-30 against `derive-edges` at `.claude/lib/superpowers-parallel/derive-edges.mjs:44`, the unseeded query returned one caller, the same-file one, and zero of the two real cross-file callers — with no error and no empty result. Without the canary, a plausible non-empty wrong answer schedules two dependent tasks as parallel-safe.

In-engine `fileScope` overlap survives as a **pruning input only** — `pathsOverlap` at `wave-planner.mjs:14` and `scopesOverlap` at `:26`, consumed by `deriveEdges` at `derive-edges.mjs:78`. It is not the oracle, and no edge may exist solely because overlap suggested it.

## 10. The `fix` pipeline

### 10.1 Shape

One pipeline expressed as data over one interpreter (0106 error 3). A stage is a record, never a closure: `{ name, kind: 'verb' | 'llm', phase, verb | promptId, floor, onFail: 'halt' | 'remediate' | 'park' }`. The interpreter is deterministic and holds no per-stage special case.

Pipeline-as-data is 0106's lowest-confidence claim, rated MEDIUM-HIGH against HIGH for the effector boundary and the durability model, so it carries the sharpest falsifier in this spec (section 12, MSP-12).

### 10.2 The oracle

`fix` was sequenced first because its receipt is machine-checkable (0110). The oracle is therefore differential and mechanical: the receipt is executed on the base and must exit non-zero, then on the branch and must exit zero. Either half unsatisfied halts fail-closed. A model's assertion that a fix works is not an input to this decision. This is what distinguishes "the deterministic executor worked" from "the model got lucky".

### 10.3 Depth

Depth 1. The first pipeline ships at depth 1 regardless of whether step 4 landed, because 0109 licenses depth by restack capability **proven for that work type**, and no restack has been proven for `fix`. On changes-requested at a node, prune and restack within that node's subtree only.

### 10.4 Review economics

| Property | Decided by | Not by |
|---|---|---|
| spec conformance for `fix` | the receipt gate | a reviewer |
| lint, types, suppressions | `gate-lint` | a reviewer |
| title grammar, file-scope violation, diff size | tier 1 gates | a reviewer |
| design quality | one review per task at policy tier: sonnet default, opus by blast radius | opus on every task |
| security, when the diff touches auth, input handling, data access, secrets, or external integrations | a conditional second review — the one genuinely different lens 0112 rule 2 permits | more correctness reviewers |

The fix-loop re-review reads the **fix delta plus the open issue list**, never the whole diff again; the current loop re-dispatches a full review at `:1074`.

### 10.5 Named limitations, not to be softened

A `fix` pipeline will not validate the two-layer fan-out semantics, and will not reproduce the estimated 1-2M tokens per 6-MSP run, because that cost lives in multi-MSP `feat` runs (0110). Wall-clock shipping speed will barely improve, because the binding constraint is human merge latency and it is out of scope (0104, 0111). The wins claimed here are token cost, crash loss, and time to first line of code.

## 11. Resume

The relaunch entry point is the reconcile-only advance that already exists at `mitosis.js:2904`, declared under the honest name Resume. No new phase is invented.

Resume state travels in `args`, closing 0108 specific 2. The launcher is an ordinary agent with file reads, so it reads the journal itself and pays **zero** bootstrap dispatches.

Envelope contents: run id; spec pointer and content hash; per-MSP status and PR number; frontier states; gate manifest hash; prompt-text hashes for the replayable prefix.

Cap, derived rather than tuned: 64 MSP rows at a 160-byte row budget is about 10 KB, plus a 2 KB header, rounded to **16 KB of serialized JSON**; hashes are truncated to 12 hex characters. At roughly 4k tokens paid once per relaunch, the envelope is strictly cheaper than the bootstrap dispatch it replaces. Over cap, the launcher emits a pointer plus exactly one bootstrap `agent()` call, which 0108 already permits. The cap is a gate, failable by a fixture over cap — not a comment.

Review state is read once at relaunch, which deletes 0105's `APPROVED` double-count by construction rather than fixing it.

Residual hole, not softened: a parked run resumes only at the next session start, or at the optional scheduled nudge that stays off by default. Merge-to-resume latency is human-paced. A missed trigger costs latency only and never correctness, because the content-keyed journal is the source of truth, and relaunching an already-advanced run replays the prefix and no-ops.

## 12. MSPs

Ordering is bottom-up. Every MSP leaves the branch green on merge, per the green-branch invariant. Each declares its change type from the conventional-commits vocabulary, which stays the full set even though pipelines are limited to two types (0118).

Bootstrap note: step 6 rebuilds the pipeline, so it cannot be shipped by the pipeline it builds. MSPs typed `refactor` or `chore` do not route through a mitosis pipeline at all under 0118 and ship as ordinary single-branch work; the `feat` and `fix` MSPs here may route through the **current** engine or by hand dispatch.

### MSP-0 — phase parity gate and honest declarations

`feat(gate)`. Ships first, because it fences every later phase edit.

Delete `Final review` from `meta.phases` at `:15`; rename `phase('Shepherd')` at `:2906` and its three `opts.phase` literals at `:2887`, `:2994`, `:3033` to `Resume`, and declare `Resume`. Add `mitosis-gate.mjs phase-parity`: a pure function over three extracted sets — declared titles, `phase()` call arguments, `opts.phase` literals — asserting declared equals called-or-assigned in both directions.

The checker is pure and the gate applies it to live source, so the failability proof is a unit test over the two recorded defects as **fixtures**, not over live source. That keeps both the proof and the green-branch invariant.

Acceptance: the checker returns a violation for the fixture pair `{declared: [... 'Final review'], called: [...]}` and for `{called: [... 'Shepherd'], declared: [...]}`; it returns clean against post-MSP source; the gate runs in CI and on the pre-commit path.

Falsifier: if the extractor cannot enumerate `opts.phase` literals from source without evaluating it, the third surface is not statically decidable and finding 1 must be reopened as a decision rather than implemented as a rule.

### MSP-1 — baseline census before any collapse

`feat(gate)`. Must land before MSP-2, or the before-and-after replay 0115 owes is unpayable forever.

Add `mitosis-gate.mjs budget`: fold the journal into dispatch counts per phase, per unit, and per run, plus wall-clock per phase. Capture the baseline on the **current** engine. Then assert the section 6 budget — 3 fixed, 9 per MSP — as a gate on later runs.

Acceptance: a baseline record exists for one real current-engine run; the gate fails on a synthetic journal exceeding the budget.

Falsifier: if the journal after step 3 does not record dispatch boundaries recoverably, 0115's three falsifiers cannot be evaluated at all, and every performance claim in this spec must be labelled unmeasured until step 3 is amended.

### MSP-2 — Probe: fuse Reconcile and Prepare

`refactor`. One `run-probe` verb replaces both dispatches; `checkpoint-init` moves off the critical path and is not awaited before Decompose (its failure already only logs, `:3907-3913`). Under an explicit fresh-run flag, probe and decompose run in parallel, taking time-to-first-code to 2 round trips.

Acceptance: one dispatch under phase Probe replaces the two at `:3633` and `:3916`; the receipts prerequisite assertion still halts fail-closed on a base missing its artifacts.

Falsifier: if the fused verb cannot resolve the authoritative remote ref and read prerequisite state in one invocation, the fuse is unsound and Reconcile stays separate.

### MSP-3 — Decompose and cut: task briefs, no Plan

`feat`. The decomposer emits, per MSP, a task list of `{title, brief of 2-5 sentences, acceptance criterion, fileScope, spec-section pointer}`, plus a `needsPlan` flag for an MSP it cannot confidently cut. Delete the Plan dispatch at `:4333` and the Plan review dispatch at `:4357`; the mis-cut stop rule moves into the implementer brief.

Acceptance: implementers receive briefs rather than a one-sentence rationale; `needsPlan` on any MSP still produces a plan document for that MSP only; no dispatch remains that can auto-approve its own outcome.

Falsifier: if implementers given briefs produce work that fails design review at a materially higher rate than plan-fed implementers on comparable tasks, the Plan deletion is wrong and Plan returns as a default for `feat`.

### MSP-4 — derive-edges verb, LSP-seeded

`feat`. Add `mitosis-intel.mjs derive-edges` implementing section 9 rules 1-4. Invoke it inside the Decompose dispatch. Delete the Parallelize dispatch at `:4402`, its payload transport at `:4420`, and the echo-then-overwrite of authoritative constants at `:4478-4487`.

Acceptance: the canary fixture proves both halves — seeded finds the cross-file edge, unseeded misses it; the verb declares its seed set; a closure over cap halts naming the cap; the engine rejects an edge set that arrives without a declared seed.

Falsifier: if the transitive importer closure for a realistic `fileScope` union exceeds the cap on this repo, the seeding strategy does not scale and edge derivation returns to one scoped model dispatch, as 0116 allowed.

### MSP-5 — Prep: unit-prep verb, no Branch for roots

`refactor`. Root MSPs branch via the implementer's own worktree add at `:1019`. A frontier-only `unit-prep` verb remains, declared as Prep. Delete the Branch dispatch at `:4492` and its four `opts.phase` sites at `:4516`, `:4518`, `:4543`, `:4545`, including the opus pins for git transcription.

Acceptance: a single-root run enters no Prep phase and still branches correctly; a frontier MSP prepares through the verb; parity stays clean.

Falsifier: if any root MSP requires a branch to exist before its implementer dispatch, the deletion is unsound and Branch stays for roots.

### MSP-6 — gate-probe and the gate manifest

`feat(gate)`. Add `mitosis-gate.mjs gate-probe` per section 8.2, replacing the config-detection probe at `:3925-3928`. Journal the manifest with each command string and hash; make the hash part of the journal key.

Acceptance: a repo whose test command exits non-zero on a clean base is recorded `BROKEN`, not `present`; editing a gate command invalidates the cached verdict.

Falsifier: if executing candidate gates against an unmodified base is not safely repeatable in a target repo — a gate with side effects — probe-by-execution needs a sandbox and this MSP blocks on it.

### MSP-7 — universal gate pack with red fixtures

`feat(gate)`. Tier 1 gates from section 8.1, each shipped with a fixture that makes it fail. Deploy them into target repos the way `pr-title-lint` already deploys.

Acceptance: every tier 1 gate has a red fixture in the suite; removing any fixture fails the pack's own meta-assertion.

Falsifier: if a gate has no input that makes it fail, it is not a gate; delete it rather than shipping it.

### MSP-8 — gate-lint and integrate

`feat`. `gate-lint` generalizes the differential comparison at `:1206-1228`; `integrate` transcribes the mechanical integrate recipe. Delete Boundary as a standalone dispatch at `:1231` and its three `opts.phase` sites at `:1234`, `:1241`, `:1244`.

Acceptance: a task that loosens config to pass is still caught by the config-strictness half; a `BROKEN` base gate yields a differential verdict rather than a halt.

Falsifier: if the differential diff produces false new-finding reports on an unchanged file because of ordering or path nondeterminism, the multiset key is wrong and must be normalized before the gate can be trusted.

### MSP-9 — work-type floors, fail-closed

`feat`. Section 8.4. Intake refuses any declared type other than `fix` or `feat`, naming the type. An unmet floor halts fail-closed naming the missing capability and pointing at `verify-setup`.

Acceptance: a repo with no runnable test command gets no `fix` pipeline and halts with the gap named; no path degrades an unmet floor to review.

Falsifier: if any code path can reach an implementer dispatch with an unmet floor, the floor is decorative and this MSP has failed regardless of its tests.

### MSP-10 — manifest into pull-request verification lines

`feat`. Compose `pr-create`'s `--verified` and `--not-verified` values mechanically from the journaled manifest. `pr-create` already requires at least one such value (`mitosis-git.mjs:170`).

Acceptance: every `Verified:` line traces to a manifest entry with a recorded exit code; a gate recorded `absent` or `BROKEN` renders as `--not-verified` with the reason; no line is composable without a recorded result.

Falsifier: if any manifest state has no honest rendering, the honesty rule still depends on model restraint and the manifest vocabulary is incomplete.

### MSP-11 — Ship: publish then ci-watch in one dispatch

`refactor`. Two verb invocations, one dispatch. `ci-watch` blocks on `gh run watch --exit-status` in a backgrounded subprocess and reports one result. Keep the ship read-back at `:4618-4638`, which fires only on a `merged=true` claim and is the cheap anti-fabrication check.

Acceptance: the per-MSP Ship bucket is one dispatch; a red CI parks honestly; the read-back still fires.

Falsifier: if `ci-watch` cannot bound its wait without holding the unit's slot, the streaming flip at step 1.5 did not deliver its property and this MSP blocks on it.

### MSP-12 — the fix pipeline as data

`feat`. The capstone. Encode `fix` as the stage list of section 10.1 and write the interpreter. Depth 1. Receipt oracle per section 10.2. Review economics per section 10.4.

Acceptance: one real `fix` spec ships end to end; the receipt is observed red on base and green on branch by the verb; dispatch counts match section 6 as asserted by MSP-1's gate.

Falsifier, the sharpest in this spec: if any stage requires a closure over run state to be expressible, pipeline-as-data is refuted for this engine, the `fix` pipeline stays imperative, and the `feat` pipeline must not be designed as data either. 0106 rates this claim MEDIUM-HIGH and it is the only claim here below HIGH.

### MSP-13 — Resume and the args envelope

`feat`. Section 11. Declare Resume; add the launcher envelope composer and its cap gate; wire the pointer-plus-one-bootstrap fallback.

Acceptance: a parked run resumes from `args` alone with zero bootstrap dispatches; an over-cap envelope falls back to exactly one; relaunching an already-advanced run no-ops.

Falsifier: if a realistic 6-MSP envelope exceeds 16 KB, the row budget is wrong and the bootstrap fallback becomes the default rather than the exception.

## 13. Deferred, with reasons

| Item | Why deferred |
|---|---|
| The `feat` pipeline | 0110 sequences it second, after the effector boundary and durability model are proven on a machine-checkable oracle |
| Speculation depth above 1 | 0109 requires a restack proven for `fix` first |
| Leases demoted to a speculation-pruning heuristic reconciled against observed write-sets | 0106 keeps it, but merge-time detection is already the safety net; demotion is not required for a depth-1 pipeline |
| Cluster-aware scheduling | clusters are derived at `:3883` then ignored by the flat scheduler; a real defect, but it changes the scheduler, which section 1 fences out |
| Journal paging through model output in 2,000-character chunks | step 3 owns the journal transport |
| Ratifying finding 1 as a decision record | the parity rule already covers it; a record is warranted only if the user wants the third surface named explicitly |

## 14. Verification

Diff-scoped per `rules/common/testing.md`; the full suite runs at the integration boundary and pre-push only.

Three claims in this spec are unmeasured today and must be labelled as such until MSP-1's baseline exists: time to first code falling from 8 round trips to 3 or 2; the census falling from 100 to 57; tokens per shipped MSP dropping by the share the deleted phases represent. 0115's falsifiers are the acceptance test for all three, and MSP-1 is what makes them payable.

Do not regress. Each was verified in this session at the line cited.

| Property | Anchor |
|---|---|
| fail-closed halting | `mitosis.js:3660-3666` reconcile, `:3846-3851` decompose, `:944-968` model policy |
| built / awaiting / done frontier | `:4610-4616` |
| worktree isolation with file-scope leases | `:1019` |
| per-MSP pull requests through `pr-create` | `mitosis-git.mjs:30`, `:152`, `:170` |
| ship read-back on a `merged=true` claim | `:4618-4638` |
| differential multiset with config-strictness | `:1206-1228` |

## 15. Provenance

Architecture settled across decision records 0106 to 0121 in the session-continuity ledger, thread `mitosis-architecture-rebuild-exploration`. Every line citation in this document was re-verified against the working tree on 2026-07-30 at `mitosis.js` 4,851 lines; the phase and `opts.phase` census in sections 4 and 5 is a measurement taken the same day, not a restatement of the 0115 audit.
