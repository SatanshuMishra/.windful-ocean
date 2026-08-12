# SPEC: Mitosis OS-process re-architecture

Status: proposed
Date: 2026-08-12
Thread: spec-b-review-and-rewrite-cost-decomposition-stacked-prs (01KZQ2BVF2386ATV5YFD43NQVX)
Supersedes: the 2026-08-06 SPEC B, in full
Governing decisions: 0370, 0371, 0372, 0373, 0374

## 0. Preamble

### 0.1 What this document supersedes and what governs it

This SPEC supersedes the 2026-08-06 SPEC B in full. Where the two disagree, this document wins and the older one carries no citation authority (0327, 0367).

Requirements come from this thread's decision records. The 2026-08-11 directive and the design brief are non-authoritative (0367). The 2026-07-30 core-rebuild document on the unmerged branch `docs/mitosis-core-rebuild-spec` is a source of analysis, not of authority; its eight-phase model is re-adopted here explicitly rather than by citation (0338, 0366), and its Law 1 is rewritten by section 3.1 below.

### 0.2 Citation provenance

Every citation in this document was derived on 2026-08-12 by one of three audits run in the authoring session:

- **Audit A** — a full read of `github.com/shaheershoaib/fanout` at commit `06ae1921`, cloned to a scratchpad. All `fanout.py:*`, `tests/test_fanout.py:*`, `README.md:*`, `adapters/claude-code/SKILL.md:*` and `LICENSE.md:*` citations.
- **Audit B** — a read of this repository. All `.claude/**` citations.
- **Audit C** — live verification against Claude Code v2.1.228, including four real `claude -p` invocations. All CLI-capability claims.
- **Audit D** — a full walk of every dispatch construction site in `mitosis.js`, run 2026-08-12 after initial authoring. Source of the section 1.1 census: the 38 total, the 27 mechanical, the b1/b2/b3 membership lists, and residuals 7 through 9. It supersedes the partial enumeration the first draft of that table carried.

`mitosis.js:NNNN` means `.claude/workflows/mitosis.js`. Behaviour is cited to that file and never to `.claude/lib/mitosis/*.mjs`, because `mitosis.js` has zero imports and calls its own inlined twins, so a `lib` citation would describe a mirror rather than the path that executes. The standalone CLIs are the exception and are cited directly.

**Admission requirement.** Before this SPEC is admitted for implementation, a citation re-verification pass must confirm every `path:line` still resolves. Line numbers drift. Claims are load-bearing; line numbers are pointers.

### 0.3 Terms

- **MSP** — a minimum shippable product. Under 0371 this means *independently reviewable and green*, not independently usable. See section 4.1.
- **Dispatch** — one invocation of a language model. Under this SPEC that is one `claude -p` subprocess.
- **Judgment dispatch** — one of the nine kinds in section 2.3 where a model is genuinely required.
- **Mechanical dispatch** — a dispatch whose whole job is work a deterministic program could do. This SPEC eliminates all of them.
- **The stack** — the ordered series of pull requests defined in section 5, all opened against base branch `feat/mitosis-os-process`.

## 1. Why

### 1.1 The diagnosis

Mitosis's control loop is already code. The defect is one layer beneath it: **the loop's syscalls are language models.**

The engine runs inside the Claude Code Workflow tool's capability-stripped JS sandbox. `HOOK_NAMES` is frozen at seven entries — `args, agent, parallel, pipeline, log, phase, workflow` (`.claude/lib/mitosis/workflow-sandbox.mjs:36`) — of which the engine uses five. The sandbox retains fifteen constructors and three value globals (`:18-23`) and denies everything else, including `process`, `require`, `eval`, static and dynamic `import`, the whole `Date` constructor, and `Math.random` (`:25-34`, `:39-50`). It cannot read a file. It cannot run a command.

The consequence is measurable. The dispatch surface is 38 construction sites: 30 direct `agent(...)` calls plus 8 through the `guard.dispatch` model-policy wrapper (`:1257-1270`), excluding that wrapper's own generic pass-through at `:1267`. Of those 38, **27 (~71%) exist only because the sandbox lacks filesystem and exec access:**

| Class | Count | What the model is actually asked to do |
|---|---|---|
| b1 — journal I/O | 6 | `mkdir`, append one line to `.gitignore`, append one JSON line **the engine already holds and interpolates into the prompt** (`mitosis.js:4269`). Sites: `:4263`, `:4520`, `:4545`, `:4604`, `:4626`, and `:5402` via the `appendRunJournal` helper (`:5390-5411`) |
| b2 — shell-out-and-transcribe | 18 | Run a fixed command, return stdout through a schema. `manifest-publish` is a ten-step git recipe in prose (`:4297-4312`). Sites: `reconcile`, `manifest-publish`, `prepare-probe` (`:4357`), `fence`, `integrate`, `checkpoint-push`, `ship-verify` (`:5103`), `ci-probe`, `ci-diff` (`:5192`), `ci-publish-verify` (`:5235`), `divergence-check`, `plan-probe`, `restore`, `supersede` (`:4580`), `branch-compose` (`:4989`), `branch-prep` (`:5020`), `ci-publish` (`:5222`), `ship` (`:5329`) |
| b3 — programs written in English | 3 | `parallelize` (`:4892-4908`) tells a model to write a script making seven library calls and to reverse-engineer a data shape by reading `mitosis-execute.js` (`:4903`); `boundary` (`:1508-1530`) specifies a diff-scoped lint gate as a 23-line algorithm including multiset comparison, and is dispatched twice against that same prose program — first pass (`:1534`) and recheck (`:1544`) |

The other 11 sites are ten judgment dispatch sites realizing the nine kinds of section 2.3 — `decompose` (`:4171`), `plan` (`:4826`), `plan-review` (`:4854`), `replan` (`:4875`), `review` (`:1376`), `fix` (`:1385`), `implement` (`:1402`), `boundary-fix` (`:1541`), `ci-fix` (`:5176`), `diagnose` (`:3556`) — plus `redispatch` (`:3569`), which resists classification at the call site and is governed by residual 7. Kinds and sites are not one-to-one: `fix` and `boundary-fix` are one kind at two sites.

Four of the b2 dispatches exist explicitly so the engine never takes another agent's word for what a change touched: `ci-diff` (`:5192`), `ci-publish-verify` (`:5235`), `ship-verify` (`:5103`) and `prepare-probe` (`:4357`). They are a **subset of the 18, never an addition to it** — the arithmetic trap that produced this section's earlier 24/63% figure. In a process they are `spawnSync` calls, and the trust problem they solve disappears with them.

Three b2 sites carry a bounded interpretive step inside an otherwise deterministic script, and are flagged rather than assumed pure: `supersede` (`:4580`) composes a one-line interdiff summary; `ci-publish` (`:5222`) and `ship` (`:5329`) extract structured facts from raw CI log output under a report-what-you-observed constraint. Residual 8 governs them.

A second cost rides along. Because the sandbox refuses `import`, `mitosis.js` inlines byte-identical twins of 25 library modules: **2,932 of its 5,515 lines (53%) are duplicated code**, policed by a mirror-guard test that exists only to keep the duplication honest.

### 1.2 What fanout actually demonstrates

fanout is a 965-line pure-stdlib Python file (`fanout.py:41-48`) that is two separable things: a deterministic scheduler (`fanout.py:58-618`) and an optional process runner (`fanout.py:733-859`). There is no LLM anywhere in its own loop, no SDK, no API client, and no network call in the file.

**Its primary mode is the inversion, and this must be stated plainly because it is easy to misread.** In skill mode the *model* shells out to fanout, reads the printed JSON plan, and dispatches using its own subagent primitive; the adapter names this repository's dispatcher explicitly — "the Workflow tool's `pipeline()`/`parallel()` with worktree isolation" (`adapters/claude-code/SKILL.md:196-199`). The `--exec` runner is the documented *fallback* "for an agent runtime with no subagent primitive" (`:50-52`).

fanout is therefore **not** evidence that a control loop should leave a sandbox. Its loop is an OS process because a calculator is a program.

What transfers is the thesis: **no sampler in the deterministic path.** Applied to mitosis, that thesis still forces the move, because in the sandbox mitosis's `appendFile` costs a language model.

The corroborating evidence is fanout's own second commit, `06ae1921`, titled "bounded worker returns and on-disk run state — two levers against orchestrator-context bloat." Its author's diagnosis: worker returns are "the single biggest source of bloat in a long run - and the part nobody notices, because each individual report looks reasonable" (`fanout.py:640-643`). Mitosis pays the maximal form of that cost, because every state load is a self-reporting dispatch.

### 1.3 What the move costs

Two guarantees are today **structural** and become **policy**:

1. **Non-determinism is impossible.** `Date` is bound to a callable denial Proxy and `Math.random` is hidden from `ownKeys` and throws on read (`workflow-sandbox.mjs:39-46`, `:140-171`). The stated reason is policy, not sandbox defect: "the determinism contract requires identical output for identical input" (`:40`).
2. **Merging is impossible.** The sandbox has no exec at all. Today `gh-merge-shim.mjs` denies merge at the tool layer for *subagents* (`MERGE_DENY_EXIT = 13` at `:6`, `MERGE_MUTATION_RE` at `:17`). A supervisor that can exec is the one process that must never merge, and nothing structurally stops it.

Section 3.2 replaces both structurally rather than procedurally. This is the single largest risk in the SPEC and it is discharged before the loop moves, not after.

One cost that turned out **not** to exist: the engine depends on `agent()` retrying HTTP transients internally, treating `null` as terminal (`.claude/docs/specs/2026-07-07-mitosis-resilience-hardening-design.md:31`). Audit C confirmed `claude -p` retries transients internally and emits `system/api_retry`. The dependency is preserved, not rebuilt.

### 1.4 The instrument arrives with the architecture

0359 concluded that prompt-byte figures must be dropped because nothing on disk captures a composed dispatch prompt, and section 8 of the old SPEC named the instrument source its single largest open question. Both close as a side effect of this design:

- The supervisor composes every prompt in a real process, so the composed prompt exists (C2 pins it on disk).
- `claude -p --output-format json` returns `usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`), `total_cost_usd`, `modelUsage`, `session_id` and `num_turns` per invocation (Audit C).

The engine reads no cost data today. After A1 it reads all of it.

## 2. Target architecture

### 2.1 Shape

A deterministic Node process owns the control loop. It has **no context window and no model.** It reaches a model only at the nine judgment kinds, by spawning `claude -p` subprocesses.

```
.claude/skills/mitosis/SKILL.md   thin entry, gathers args, resolves branch contract (can ASK)
        |  Bash
        v
.claude/lib/mitosis/cli.mjs       argv -> typed input
        v
.claude/lib/mitosis/engine.mjs    the loop: phases, scheduling, gates
        |                    |                       |
        | imports            | exec-policy           | dispatch
        v                    v                       v
 deterministic libs      git / gh / graphify     claude -p subprocess
 (derive-edges,          (allowlisted,           (--agent --model --effort
  wave-planner,           gh via merge-shim)      --json-schema -w)
  derive-clusters,
  route-planner,
  recovery, saga,
  leases, parking, ...)
```

The libraries on the left already exist and already carry 1,086 tests across 55 files. They are the surviving substrate. Nothing about them is sandbox-coupled.

### 2.2 Why the entry point stays a skill

A process cannot ASK a question. The branch contract is resolved by declare-or-pass-or-ASK in the skill precisely because "workflows cannot ASK" (`.claude/skills/mitosis/SKILL.md:23-27`), and that constraint is unchanged by the move. The skill stays thin: gather arguments, resolve the branch contract, invoke the CLI.

There is no blocking-question primitive inside a run either before or after this change. An escalation parks the unit and surfaces in the report a human reads after the run returns.

### 2.3 The nine judgment kinds

These survive unchanged. They are the only places a model is invoked.

| Kind | Agent type | Model |
|---|---|---|
| decompose | codebase-analyst | opus |
| plan | implementer | task-declared |
| plan-review | solution-architect | opus |
| replan | implementer | task-declared |
| implement / escalate | task-declared | tiered |
| review | code-reviewer | opus |
| security | security-reviewer | opus (conditional) |
| fix / boundary-fix | task-declared | tiered |
| diagnose / redispatch | debugger | opus |

Risk-scaled review is unchanged: `BLAST_RADIUS_K = 3` (`mitosis.js:1093`), `securityReviewRequired` (`:1129-1131`), two-lens mode selection (`:1395`), opus escalation at `dependentCount >= K` (`:1180`), sonnet-to-opus escalation on gate failure (`:1420-1421`). These are pure arithmetic over the task record and port without change.

### 2.4 What is unique to mitosis and survives

Establishing this was a precondition of the move. None of it is sandbox-coupled.

| Mechanism | Where | Ports |
|---|---|---|
| MSP decomposition, green-branch invariant | prompt text, `mitosis.js:4175-4181` | unchanged |
| Graphify / LSP parallel-safety | prompt + `derive-edges.mjs:78` | **improves** — a process can spawn a language server; the sandbox cannot |
| Receipts CI, `pr-title-lint`, d6 | `.claude/skills/mitosis/templates/receipts.yml`, tokens at `mitosis.js:2264` | unchanged, runs in GitHub Actions |
| Human-gated merge | `merge-policy.mjs:17-19`, `gh-merge-shim.mjs:6,:17` | unchanged, already an OS process |
| Risk-scaled review | `mitosis.js:1093-1421` | unchanged |
| Provenance / commit binding | `mitosis.js:3182-3230`, `.claude/lib/git/pr.mjs` | unchanged |
| Gates | `mitosis-gate.mjs:12` | already a CLI |
| recovery / saga / leases / parking | four modules, ~865 lines | unchanged, already run under `node --test` |

## 3. Binding laws

Each law names the mechanism that makes the wrong path unreachable. A law with no such mechanism is a preference, not a law, and does not belong here.

### 3.1 Law 1, rewritten

The 2026-07-30 document's Law 1 reads: "Prose is the syscall ABI. `agent(prompt)` is the orchestrator's only effector. The saving is prose recipe to typed verb, never dispatch elimination."

**It is rewritten as:** dispatch elimination is the goal for mechanical work. Prose remains the ABI only for the nine judgment kinds of section 2.3.

The original law was derived when `agent()` was the only effector. `claude -p --agent` refutes that premise (Audit C, 0372). Retaining the law would preserve five dispatches that return zero information.

*Unreachable-path mechanism:* D3's falsifier. A run exceeding 10 dispatches per shipped MSP fails the gate.

### 3.2 The two structural guarantees

**Determinism.** No engine source may reference `Date`, `Date.now`, `new Date` or `Math.random`. Entropy enters through `args` only.

*Unreachable-path mechanism:* the `determinism` gate verb (A4), run in receipts CI. It is a closed census over the engine directory that halts on the unclassifiable — no pinned count, no sampled allowlist, both of which are change-detectors wearing a census costume.

**No merge.** The supervisor may never merge a pull request.

*Unreachable-path mechanism:* three layers. (1) `exec-policy` is deny-by-default: only `claude`, `git`, `gh`, `node` and `graphify` are spawnable, and an unlisted binary throws. (2) Every `gh` invocation is routed through `gh-merge-shim`, which already denies `mergePullRequest`, `enablePullRequestAutoMerge` and `pulls/N/merge` at exit 13. (3) argv matching `MERGE_MUTATION_RE` is refused in-process before spawn. The `exec-allowlist` gate verb proves layers 1 and 3 in CI.

**Schema capability.** Audit C measured that `--json-schema` silently degrades to prose when the named agent's `tools:` frontmatter omits `StructuredOutput`: the run returns `subtype: success`, `is_error: false`, and no `structured_output` key. Observed on `--agent code-reviewer` (`~/.claude/agents/code-reviewer.md:4`) versus `--agent general-purpose`.

*Unreachable-path mechanism:* two layers. (1) The dispatch adapter treats a schema request answered without `structured_output` as a failure, never a success (A1). (2) The `dispatchable-agent-schema-capable` gate verb fails if any agent named in the dispatch table omits `StructuredOutput` from its `tools:` list (A4).

### 3.3 No silent drops

No mechanism may drop content without leaving a marker that content was dropped (0343). This binds context-pack truncation (B2), bounded returns (A1), and the unsatisfiable-dependency path (A2).

*Unreachable-path mechanism:* every truncating call site returns a `truncated` field; the consuming schema marks it required and nullable, so omitting it is a validation throw rather than a default.

### 3.4 fanout wins conflicts

Per user directive, where mitosis conflicts with fanout the mitosis element changes. Six resolutions, all binding (0373):

| # | Conflict | Resolution |
|---|---|---|
| 1 | Law 1 forbids dispatch elimination | Rewritten, section 3.1 |
| 2 | 0353 keeps the engine in the sandbox | Superseded by 0370 |
| 3 | `wave-planner` emits barriers; `parallel()` at `mitosis.js:1449` is a barrier | Becomes a `ready_after` DAG. fanout tests that a DAG beats a barrier chain (`tests/test_fanout.py:246-255`). Waves survive as a diagnostic only |
| 4 | `derive-edges` decides coupling silently | Refuse-to-decide: emit `{pair, signals, default}`; an unrendered verdict is a hard stop (`fanout.py:382-430`) |
| 5 | `.mitosis/run.json` genesis overwrites (`mitosis.js:4268`) | Content-keyed run directory, mirroring `.fanout/<plan_id>` (`fanout.py:948-949`) |
| 6 | `fileScope` is one undifferentiated list | Splits into edit-set and read-set with truncation reported (`fanout.py:461-491`) |

### 3.5 Three fanout defects explicitly not inherited

Audit A found these in fanout. They are named here so no implementer imports them while porting an idea.

| Defect | fanout | This SPEC |
|---|---|---|
| Success is exit code 0; the worker's own `"status":"failed"` is recorded and never read (`fanout.py:784`, `:794-796`) | a worker exiting 0 after refusing the task unblocks its dependents | schema-validated returns; `ok` requires exit 0 **and** `is_error: false` **and** a present `structured_output` (A1) |
| No run lock; two runs on one plan interleave `os.replace` on `state.json` (`fanout.py:948-949`, `:721`) | lost updates | `O_EXCL` lockfile; a second run on the same key refuses (A3) |
| `--resume` key omits task prose (`fanout.py:599-618`), so rewritten tasks are skipped as done | silent skip of changed work | the run key covers task prose (A3) |

Also not inherited: fanout's lossy `_safe()` filename mangling, which is not injective — `a/b` and `a_b` collide (`fanout.py:708`). A3 validates unit ids against a strict pattern and rejects rather than mangles.

### 3.6 Licence

fanout is PolyForm Noncommercial 1.0.0 (`LICENSE.md:31-41`), not OSI-open. This SPEC adopts its architecture, which is not copyrightable. **No fanout source may be copied into this repository.** Ideas are cited to `fanout.py:*` as prior art, the way a paper is cited.

## 4. Decomposition doctrine

### 4.1 What MSP means here

Under 0371, an MSP is **independently reviewable and green**, not independently usable.

- **Green, per MSP:** `node --test` passes, lints pass, and every gate verb passes at that commit.
- **Not required, per MSP:** that the engine runs a spec end to end.

End-to-end capability is deliberately absent from A1 through C6 and returns at C7. **This is stated so no reviewer treats its absence as a regression.**

### 4.2 Stacking and release

All work happens on base branch `feat/mitosis-os-process`, cut from `main`. Each MSP is one pull request whose base is the previous MSP's head — a true stack. Every PR is opened. PRs may merge into the stack base; nothing reaches `main` until the release gate.

**Release gate:** the base branch merges to `main` only after D2 lands and D3's measured comparison clears its falsifier.

This is what makes a clean bottom-up rebuild legitimate rather than a big-bang in disguise: the discipline that replaces incremental usability is that **every MSP is provable in isolation by its own tests.**

### 4.3 Consequence for Part III

The old SPEC's Part III scoped a codegen decomposition, a generator, and a byte-identity proof to remove the inlined twins. Under 0371 that work does not happen. The real `lib/mitosis/*.mjs` modules already exist and are already tested; the twins exist only inside `mitosis.js`, and `mitosis.js` is deleted wholesale at D2. **Part III collapses to `git rm`.** Its generator and byte-identity proof become unnecessary rather than unmooted.

## 5. The stack

Eighteen MSPs in four clusters, in dependency order.

---

### Cluster A — Substrate

#### A0 — wave-planner characterization tests

**Why first.** `planWaves` enforces the refusal of same-wave `fileScope` overlap (`.claude/lib/mitosis/wave-planner.mjs:53`) and **has no dedicated test file**; it is covered only transitively through `generate-run-script.test.mjs`. B and C change scheduling semantics above it. Changing to a DAG on top of untested parallel-safety code is the one move in this plan that could break safety silently.

**Files.** `.claude/lib/mitosis/tests/wave-planner.test.mjs` (new).

**Acceptance.**
1. A test per throw path: missing id (`:37`), duplicate id (`:37`), unknown dependency (`:42`), cycle (`:49`), same-wave `fileScope` overlap (`:53`).
2. A test pinning the success shape `{waves, diagnostics:{taskCount, waveCount, maxWidth}}` (`:59`).
3. **Inertness mutation, per test:** deleting the guard under test turns that test red. A test that survives deletion of its guard is not testing it.

**Depends on.** Nothing.

---

#### A1 — dispatch adapter

**Files.** `.claude/lib/mitosis/dispatch.mjs`, `tests/dispatch.test.mjs`.

**Surface.** `dispatch(request, deps) -> DispatchResult`, where `request` is `{prompt, agentType, model, effort, schema, worktree, cwd, timeoutMs, signal}`.

**Argv construction.** `claude -p --output-format json`, plus conditionally `--agent`, `--model`, `--effort`, `--json-schema`, `-w`. Tokens are built as an array and never as a shell string; `shell` is never enabled. This is fanout's split-then-substitute property (`fanout.py:699-702`), which its own tests exercise against `'fix "it"; rm -rf /; \`whoami\` $(id)'` (`tests/test_fanout.py:358-364`).

**Success discipline — binding.** `ok` requires all three:
1. exit code 0,
2. `is_error === false`,
3. when a schema was requested, `structured_output` present and non-null.

A `subtype: "success"` carrying no `structured_output` after a schema request is a **failure**. Exit code alone never implies success.

**Timeout.** No `--timeout` flag exists (Audit C). The adapter arms a timer, sends SIGTERM, and expects exit 143; after a grace window it escalates to SIGKILL. A timeout is a distinct terminal outcome, not a generic failure.

**Retry.** None. The harness retries HTTP transients internally and emits `system/api_retry`. A second layer would compound backoff.

**Envelope capture.** Retains `usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`, `total_cost_usd`, `modelUsage`, `session_id`, `num_turns`, `permission_denials`, `api_error_status`. This is the instrument of section 1.4.

**Bounded return.** The structured payload is retained whole up to a size cap; over-cap payloads are truncated **with a `truncated` marker** (law 3.3). Free-text `result` is retained only as a capped tail when no structured payload was produced. This closes fanout's own gap, where a parsed JSON object is stored whole with no size or key validation (`fanout.py:794-796`, `:690-691`).

**Test seam.** A stub executable on `PATH` standing in for `claude`, following fanout's seam — its tests dispatch real subprocesses (`true`, `false`, `bash -c`) rather than mocking an abstraction (`tests/test_fanout.py:377`, `:387`, `:443`).

**Acceptance.** Cases: success with schema; success without schema; **schema requested and `structured_output` absent, asserted as failure**; `is_error: true`; non-zero exit; malformed JSON on stdout; timeout to SIGTERM to 143; SIGKILL escalation; oversized payload truncated with marker; argv integrity against shell metacharacters.

**Depends on.** A0.

---

#### A2 — DAG pool

**Files.** `.claude/lib/mitosis/pool.mjs`, `tests/pool.test.mjs`.

**Surface.** `runGraph({nodes, readyAfter}, dispatchFn, {concurrency, signal})`.

**Scheduling.** `ready_after` DAG, not wave barriers (resolution 3 of section 3.4). A node is dispatchable when every dependency is `ok`. Waves are retained as a diagnostic output only and drive nothing.

**Concurrency.** Semaphore, default 8, matching today's `BUILD_AHEAD_CAP` (`mitosis.js:2582`). An override may only narrow it, following the existing precedent (`mitosis.js:3935-3936`).

**Failure propagation.** A failed node marks its transitive dependents `blocked` with a reason; independent nodes continue (`fanout.py:773-777`, `:803-810`).

**Unsatisfiable set.** When no remaining node can ever become dispatchable, all remaining nodes are marked `blocked` with an explicit reason. Never a silent drop (`fanout.py:845-850`; law 3.3).

**Cancellation.** An aborted signal sends SIGTERM to every in-flight child and records each as `cancelled`. fanout has no cancellation at all and orphans children mid-edit on a shared tree; that gap is closed here, not inherited.

**In-flight crash safety.** A record is written at dispatch **start**, not only at reap. fanout writes records only on reap (`fanout.py:800-802`), so items in flight at crash time have no record and are re-dispatched over a tree already holding their partial edits.

**Determinism.** Ordering never reads a clock. Ties break on node id.

**Acceptance.** Diamond DAG completes correctly; **a slow node does not block an unrelated branch whose dependencies are satisfied** (the barrier-versus-DAG assertion, the point of resolution 3); failure blocks dependents and only dependents; unsatisfiable detection fires with reasons; cancellation SIGTERMs all in-flight and records them; observed concurrency never exceeds the cap; ordering is identical across two runs with the same input.

**Depends on.** A1.

---

#### A3 — run store

**Files.** `.claude/lib/mitosis/run-store.mjs`, `tests/run-store.test.mjs`.

**Run key.** `sha256` over the canonicalized spec, MSP table **and task prose**. Task prose is included deliberately: fanout's `plan_id` omits it (`fanout.py:599-618`), so rewriting every task while keeping names and files identical yields the same key and `--resume` reports unrun work as done.

**Layout.** `.mitosis/runs/<runKey>/attempt-<n>/` containing `plan.json` (once), `state.json` (after every transition), and `items/<unitId>.out`.

**Atomicity.** Write to `<name>.tmp`, then `os.replace`. Following `fanout.py:718-721`, which is correct and worth copying as a technique.

**Unit id.** Validated against `/^[a-z0-9][a-z0-9-]*$/`, the existing checkpoint pattern (`.claude/lib/mitosis/checkpoint.mjs:4`). Invalid ids are **rejected, never mangled** — fanout's `_safe()` is not injective and collides (`fanout.py:708`).

**Lock.** `O_EXCL` lockfile carrying pid and start marker. A second run on the same key refuses with a clear error. fanout has no lock and two runs silently corrupt each other.

**History.** A new attempt never overwrites a previous one. This replaces the current unconditional overwrite of `.mitosis/run.json` at genesis (`mitosis.js:4268`), which destroys prior-run history outright.

**Retirement.** `retire()` covering both run directories and the git ref namespaces `refs/mitosis/*` and `refs/mitosis-manifest/*`. **No retire step exists today**; both namespaces grow monotonically and forever, and the manifest ref is content-keyed so every spec edit mints another.

**Acceptance.** Atomic write survives a simulated mid-write crash; lock refuses a second concurrent run; run key changes when task prose changes; invalid unit id throws rather than mangles; a second attempt leaves the first intact; `retire()` removes only what it targets.

**Depends on.** A1.

---

#### A4 — the guarantee layer

**Files.** `.claude/lib/mitosis/exec-policy.mjs`, `.claude/lib/mitosis/determinism-lint.mjs`, additions to `.claude/lib/mitosis/mitosis-gate.mjs`, `.claude/skills/mitosis/templates/receipts.yml`, plus tests. Also: `StructuredOutput` added to the `tools:` frontmatter of every dispatchable agent.

**exec-policy.** Deny-by-default. Spawnable binaries: `claude`, `git`, `gh`, `node`, `graphify`. An unlisted binary throws. Every `gh` invocation routes through `gh-merge-shim`. Any argv matching `MERGE_MUTATION_RE` (`gh-merge-shim.mjs:17`) is refused in-process before spawn.

**determinism-lint.** A closed census over the engine source: no `Date`, `Date.now`, `new Date`, `Math.random`. Halts on the unclassifiable. **No pinned count and no sampled allowlist** — both are change-detectors wearing a census costume.

**Three new gate verbs**, added to `MITOSIS_GATE_VERBS` (`mitosis-gate.mjs:12`), to `CI_ENFORCER_CHECK_TOKENS` (`mitosis.js:2264`), and to `receipts.yml`:

| Verb | Fails when |
|---|---|
| `exec-allowlist` | the allowlist is absent, widened beyond the five binaries, or the pre-spawn merge refusal is removed |
| `determinism` | engine source references a banned identifier |
| `dispatchable-agent-schema-capable` | an agent named in the dispatch table omits `StructuredOutput` from its `tools:` list |

**Acceptance.** Each verb ships a red case proving it detects its own violation: deleting the allowlist reddens `exec-allowlist`; introducing `Date.now()` reddens `determinism`; removing `StructuredOutput` from one dispatchable agent reddens the third.

**Open item this MSP must resolve first.** Determine whether the current Workflow `agent({schema, agentType})` path shares the allowlist trap Audit C measured on the CLI. If it does, schema enforcement is **already void today** on every dispatch to an allowlisted agent — `code-reviewer`, `codebase-analyst`, `security-reviewer` — and that is a live defect on `main`, not a cutover item, and is fixed here first.

**Depends on.** A3.

---

### Cluster B — Deterministic core

#### B1 — coupling review

**Files.** `.claude/lib/mitosis/coupling-review.mjs`, changes to `derive-edges.mjs`, tests.

**Change.** `derive-edges` stops deciding coupling silently. It emits `{pair, signals[], default}` per candidate pair, and the decision is rendered explicitly downstream (`fanout.py:382-430`).

**Skeptical default.** A pair defaulting to `serialize` stays serialized unless an explicit rationale is supplied.

*Unreachable-path mechanism:* the plan schema requires a `verdicts` array covering **every** emitted pair. A missing verdict is a validation throw, not a warning. This closes the gap fanout itself has, where `coupling_review` is its most-emphasized safety check and `run_plan` never reads it.

**Acceptance.** Signals detected per fanout's four signal classes; every emitted pair appears in exactly one verdict bucket with none dropped; a plan missing one verdict throws.

**Depends on.** A0.

---

#### B2 — context packs

**Files.** `.claude/lib/mitosis/msp-file-scope.mjs` and every consumer, tests.

**Change.** `fileScope` becomes `{edit: [], read: [], truncated: {dropped, reason} | null}`. Prompt composition uses `edit` for the collision fence and `read` for context. Truncation is reported, never hidden (law 3.3; `fanout.py:272-276`).

**Migration.** This is a type change, so every consumer moves in the same MSP. No compatibility shim.

**Acceptance.** Round-trip through composition preserves both sets; a truncated pack carries a non-null marker; a consumer receiving a pack without the `truncated` key throws.

**Depends on.** B1.

---

#### B3 — critical-path ordering

**Files.** `.claude/lib/mitosis/pool.mjs` ordering hook, tests.

**Change.** Within the DAG, dispatch order prefers longest downstream cost first — long poles first (`fanout.py:249-252`, `tests/test_fanout.py:224-244`).

**Explicitly unchanged.** Model tiering. `BLAST_RADIUS_K` opus escalation (`mitosis.js:1093`, `:1180`) is untouched; only **order** changes, never tier.

**Acceptance.** Critical path beats raw item count in ordering; ordering is deterministic across runs; tier assignment is byte-identical before and after.

**Depends on.** A2, B2.

---

### Cluster C — Engine port

#### C1 — phase model, thirteen to eight

**Files.** `.claude/lib/mitosis/phases.mjs`, parity gate update, tests.

**Change.** The eight-phase model is adopted explicitly as data: Probe, Decompose, Prep, Execute, Integrate, Ship, Resume, Remediate (0338, 0366). Adopted here, not cited to the 2026-07-30 document, whose citation authority this SPEC disclaims.

**Defect fixed in passing.** The `phase-parity` gate is currently violated by its own subject: `Resume` is declared in `meta.phases` (`mitosis.js:15`) with no `phase()` call site.

**Acceptance.** The parity gate is green against the new module; a declared phase with no call site reddens it.

**Depends on.** A4.

---

#### C2 — prompt registry

**Files.** `.claude/lib/mitosis/prompts/*.mjs`, tests.

**Change.** The nine judgment prompts of section 2.3 become modules with typed inputs, composing deterministically. This is the surviving prose, and it is the entirety of the surviving prose.

**Instrument.** Snapshot tests pin the composed bytes of each prompt. This produces on disk exactly what 0359 recorded as nonexistent: a captured composed dispatch prompt.

**Acceptance.** Each prompt composes deterministically from fixed inputs; snapshots pin the bytes; no prompt reads a clock or a random value.

**Depends on.** C1.

---

#### C3 — convert the six journal dispatches

**Files.** engine call sites for `checkpoint-init`, `ci-attempt-checkpoint`, `park-checkpoint`, `built-checkpoint`, `ship-checkpoint` (`mitosis.js:4263`, `:4520`, `:4545`, `:4604`, `:4626`), and `quiescent-exit-checkpoint` (`:5402`, reached through the `appendRunJournal` helper at `:5390-5411`), now calling `run-store` directly.

**Change.** Six dispatches become `appendFile`. These are the purest case in the census: the engine already holds the exact bytes and interpolates them into the prompt (`mitosis.js:4269`), so the model returns no information at all.

**Note on the sixth.** `quiescent-exit-checkpoint` reaches `agent()` through a one-caller helper rather than inline, which is why an earlier pass missed it. Converting the helper converts the site; the helper itself is then deleted rather than left as a wrapper around `appendFile`.

**Genesis.** No longer overwrites; A3's content-keyed attempt directory replaces it.

**Acceptance.** Zero model invocations for journal writes, asserted by a dispatch counter in the test harness; journal contents byte-identical to what the prompt previously specified.

**Depends on.** A3, C2.

---

#### C4 — convert the eighteen transcription dispatches

**Files.** engine call sites for `reconcile`, `manifest-publish`, `prepare-probe`, `fence`, `integrate`, `checkpoint-push`, `ship-verify`, `ci-probe`, `ci-diff`, `ci-publish-verify`, `divergence-check`, `plan-probe`, `restore`, `supersede` (`:4580`), `branch-compose` (`:4989`), `branch-prep` (`:5020`), `ci-publish` (`:5222`), `ship` (`:5329`).

**Change.** Each becomes a `spawnSync` through `exec-policy`. `manifest-publish`'s ten-step git recipe (`:4297-4312`) becomes ten calls.

**The three hybrids.** `supersede`, `ci-publish` and `ship` are not pure transcription: each ends in a small interpretive step (an interdiff summary line; extracting `implicatedPaths` and `failingAssertionFiles` from raw CI log text). The command half converts to `spawnSync` here. The interpretive half either resolves to a deterministic parse over structured CI output — the preferred outcome, since the data is machine-readable at source — or is retained as a narrow judgment dispatch and **added to section 2.3's table**, which would make it ten kinds rather than nine. This MSP must decide which, per site, and record the decision in its PR body. It may not leave the question open.

**Preserved invariant.** The manifest ref stays write-once and forward-only; `--force` and `--force-with-lease` remain banned (`mitosis.js:4308`), now enforced by `exec-policy` rather than by asking a model not to.

**Note.** The four trust-motivated dispatches — `ci-diff`, `ci-publish-verify`, `ship-verify`, `prepare-probe` — exist so the engine never takes another agent's word (`:5192`). They lose their reason to exist: the engine now reads the exit code itself.

**Acceptance.** Per call site, a test asserting command shape and parse; a test asserting a merge-shaped argv is refused before spawn; zero model invocations across all eighteen, save any hybrid this MSP explicitly promotes to a judgment kind, which is then counted in section 2.3 rather than here.

**Depends on.** A4, C3.

---

#### C5 — parallelize becomes direct calls

**Files.** engine `Parallelize` path, replacing `mitosis.js:4892-4908`.

**Change.** The model-authored one-off script is replaced by direct imports: `deriveEdges`, `validateGraph`/`planWaves`, `planRoute`, `resolveAll`, `buildEngineArgs`. Seven library calls a model was instructed to make become seven library calls.

**The reverse-engineering instruction dies.** Step 5 of that prompt tells the model to read `mitosis-execute.js` and infer the required `runArtifacts` shape (`:4903`). It is replaced by a typed export.

**Downstream simplification.** The engine currently parks a unit when `dependentCount` or `edgeReasons` come back missing (`:4951`, `:4954`). Those values are now computed rather than reported, so the parking branch is deleted rather than retained.

**Also required.** `.claude/skills/plan-to-task-graph/SKILL.md` must be audited in this MSP: the Parallelize phase currently instructs an agent to read and follow it (`:4894`), so it may carry codebase-read instructions the dispatch census never saw.

**Acceptance.** Output is byte-identical to the schema the dispatch previously returned, on a fixture; the parking branch is gone and a test proves the condition can no longer arise; the SKILL.md audit is recorded in the PR body.

**Depends on.** C4.

---

#### C6 — boundary becomes a program

**Files.** `.claude/lib/mitosis/boundary-gate.mjs`, tests.

**Change.** The 23-line English algorithm (`mitosis.js:1508-1530`) becomes code: base worktree materialization, the symlink-versus-install `node_modules` strategy, per-tool expectation logic, machine-readable collection, the structural-identity tuple with `line:col` stripped, multiset count comparison, the added-suppression scan, the resolved-config strictness diff, and teardown. The cached-base variant (`:1521-1530`) becomes a branch.

**Two call sites, one program.** That prose algorithm is dispatched twice — first pass (`:1534`) and recheck (`:1544`) — so this MSP removes two of the census's 27 mechanical dispatches, not one. Both call sites must land on the same module; a recheck that diverges from the first pass is the defect this consolidation exists to prevent.

**Acceptance.** A known-red diff is caught; a benign diff passes; an added suppression is caught; a strictness downgrade in resolved config is caught; identical input yields identical output across runs.

**Depends on.** C5.

---

#### C7 — the loop

**Files.** `.claude/lib/mitosis/engine.mjs`, `.claude/lib/mitosis/cli.mjs`, integration tests.

**Change.** `runSchedule`, `runScheduleTick`, `joinTick` and `runEngine` port onto A2's pool. The `Promise.allSettled` tick loop (`mitosis.js:2544`, `:2552-2574`) is replaced by DAG scheduling. Quiescent exit is preserved (`:2563`).

**End-to-end capability returns here.** Every MSP before this one is green without it, by design (section 4.1).

**Acknowledged.** This MSP exceeds the 200-400 LOC review target and **cannot be split** — the tick loop is one unit. Reviewers should expect it and budget accordingly. This is a deliberate, named exception rather than an oversight.

**Acceptance.** An integration test runs a fixture spec end to end against a stubbed dispatch, producing the expected journal, refs and PR calls; quiescent exit fires when a tick produces no dispatchable action; a mid-run abort leaves every in-flight unit recorded.

**Depends on.** C6.

---

### Cluster D — Cutover

#### D1 — entry point

**Files.** `.claude/skills/mitosis/SKILL.md`, `.claude/hooks/block-inline-engine.mjs`.

**Change.** The skill invokes `node .claude/lib/mitosis/cli.mjs` via Bash instead of calling `Workflow`. The branch-contract ASK stays in the skill (section 2.2).

**Hook update.** `block-inline-engine.mjs` currently blocks any `Workflow` call naming `mitosis-execute.js` (`:14-20`). It must additionally refuse a `Workflow` call naming `mitosis.js`, and must not block the CLI.

**Acceptance.** A hook test proves the CLI path is permitted and both Workflow paths are refused; the skill's precondition text no longer requires workflows to be enabled.

**Depends on.** C7.

---

#### D2 — deletion

**Files removed.** `.claude/workflows/mitosis.js` (5,515 lines, of which 2,932 are twins); `.claude/lib/mitosis/workflow-sandbox.mjs`; `tests/workflow-sandbox.test.mjs`, `workflow-sandbox-census.test.mjs`, `workflow-sandbox-traps.test.mjs`, `workflow-sandbox-policy.test.mjs` (28 tests); `tests/mirror-guard.test.mjs` (7 tests).

**Change.** This is Part III (section 4.3). The twins die with the file.

**Acceptance.** The suite is green with 35 tests and 2,932 duplicated lines gone; `dead-export-lint` is green; no surviving reference to `mitosis.js` remains in any skill, hook, doc or settings entry.

**Depends on.** D1.

---

#### D3 — measured comparison

**Files.** a measurement report under `.claude/reports/`, plus the aggregation in `run-store`.

**Change.** Publish, from A1's envelope: dispatches per shipped MSP, input and output tokens, cache creation versus cache read, and `total_cost_usd`. Compare against the pre-move baseline.

**Falsifier — binding.** A run exceeding **10 dispatches per shipped MSP** fails. This is the mechanism behind law 3.1.

**Closes 0359.** Its premise — that no instrument exists — dies with A1.

**Caveat that must appear in the report.** Prompt caching is content-keyed, not session-keyed, and a repeat payload reads warm across processes (Audit C measured `cache_read: 49725` on a second, fresh process). Any benchmark reusing a fixed payload silently under-reports creation cost. Measurements must vary the payload or report cold and warm separately.

**Report handling.** `.claude/reports/` is git-tracked. The report must be checked for confidential cross-project identifiers before commit.

**Depends on.** D2.

---

## 6. Residuals

Named rather than hidden.

1. **C7 exceeds the review-size target** and cannot be split. Mitigated by the fixture integration test and by every dependency being separately proven.
2. **A stack of eighteen PRs where nothing runs until C7** is a big-bang unless each MSP is genuinely provable alone. The discipline is section 4.1's green definition; if an MSP cannot be proven by its own tests, it is wrongly cut and must be re-cut.
3. **`wave-planner` is the only safety-critical module entering this work untested in isolation.** A0 exists to discharge this and must not be deferred.
4. **The Workflow-path schema question** (A4) may reveal a live defect on `main`. If it does, it is fixed before the stack proceeds.
5. **Quality blindness.** The instrument counts tokens and cannot see whether a re-architected Decompose cuts worse. Every cost hypothesis must be paired with a fixed quality assertion, or a token win carrying a quality regression will read as a success (0358).
6. **Cross-machine journal locality.** The journal is machine-local; only `refs/mitosis-manifest/*` is durable across machines, and it carries identity only, no status. Unchanged by this SPEC.
7. **One dispatch site resists classification.** `redispatch` (`mitosis.js:3569`) is the shared corrective wrapper `makeRemediation` reuses after ANY stage fails — mechanical or judgment. Its nature is fixed by the stage that triggered it, not by the call site, so it belongs to neither column of the section 1.1 census. C7 must give it a determinate home: either the retry becomes a property of each converted stage, or it survives as an eleventh judgment kind. **It may not be left as an unclassified dispatch**, which is exactly the unclassifiable that a closed census is required to halt on.
8. **Three b2 sites are hybrids, and the census rounds them toward mechanical.** `supersede`, `ci-publish` and `ship` each end in a bounded interpretive step. Counting them as fully mechanical slightly overstates the 27; counting them as judgment slightly understates it. C4 decides per site. Until it does, **27 is an upper bound on eliminable dispatches and 24 is the floor** — and the falsifier in D3 is measured against actual runs, not against either figure, so the ambiguity cannot leak into the pass/fail decision.
9. **The section 1.1 census is now a full walk, and earlier figures were not.** The published 24/63% was 20 (the then-enumerated table) plus the same four trust dispatches counted twice. A full walk of all 38 sites found 27. Any future edit to that table must re-walk the file rather than adjust the arithmetic — the failure mode being corrected here is precisely a total that was reasoned about instead of counted.

## 7. Out of scope

- Implementing any of this. A successor thread owns implementation (0324, 0374, criterion c4).
- SPEC A and the config staging and promotion machinery it shipped.
- The fix pipeline, excluded by the user from both SPECs.
- `pillars.md`, which stays a guiding-principles document carrying no measurements (0361).
- The deferred supervisor, rotation and spawn-cost research (0348-0351), which 0352 parked and which returns only after the engine update.
