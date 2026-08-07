# Mitosis Ground-Up Fault Architecture — Design Spec

Date: 2026-07-10
Status: APPROVED — all 11 Open Design Decisions ruled 2026-07-10 (see ledger `decisions/2026-07-10-mitosis-groundup-spec-rulings.md`). Landing = BIG-BANG replacement (OD-11, overriding the incremental recommendation): build additively + test each component, integrate as ONE swap, dual-review + verify before landing; do NOT dogfood mitosis on itself. Remediation authority = dedicated diagnostician (OD-3); budgets = remediation 4 / Tier-0 +1 / Unknown-probe 1 (OD-5).
Thread: mitosis-groundup-fault-architecture
Supersedes (fault layer only): the retry/quarantine disposition path in `2026-07-07-mitosis-resilience-hardening-design.md`
Prior art: `.claude/docs/superpowers/specs/2026-07-07-mitosis-resilience-hardening-design.md`, `2026-07-02-mitosis-cluster-tier-design.md`, `2026-06-29-mitosis-design.md`, `2026-07-03-mitosis-tier2-execution-runbook.md`
Engine under rebuild: `/Users/satanshumishra/Documents/DevLabs/.windful-ocean/.claude/workflows/mitosis.js` (1506 lines; same inode as `/Users/satanshumishra/.claude/workflows/mitosis.js` — editing the repo path edits live global config)
Pure-logic twins: `/Users/satanshumishra/Documents/DevLabs/.windful-ocean/.claude/lib/superpowers-parallel/*.mjs` (byte-identity enforced by `tests/mirror-guard.test.mjs`)

This document formalizes an approved architecture. It is spec-only: it authors no engine code and modifies no running module. Genuine design forks that need a human ruling are collected in Section 12 (Open Design Decisions), not silently resolved.

---

## 0. Grounding — harness contract facts the architecture depends on

These were verified against the code and the existing audit artifacts before writing this spec. Every downstream obligation is built on them.

| Fact | Evidence (`path:line`) | Consequence for this design |
|---|---|---|
| The workflow body is loaded as one self-contained string into `new AsyncFunction('args','agent','parallel','log','phase','workflow', body)`. | `.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs:11-12` | The orchestrator must be self-contained (inline twins), not import-resolved. |
| `agent(prompt, opts)` accepts only `{ label, phase, schema, agentType, model }`. There is NO `timeout`, `signal`, `abort`, or `deadline` option. | grep across `.claude/`, `~/.claude/plugins` returned none; every call site in `mitosis.js` uses only those keys | The "every await has a deadline" obligation cannot be met with an app-level cancellable timeout. See CRITICAL A (Section 11.A). |
| `agent()` internally exhausts HTTP-transient retries and internally times out, then returns `null`. | prior spec Section 2; `2026-07-07-mitosis-resilience-p2-DESIGN-BRIEF.md:8` | A `null` is NOT a bare transient. The current `null -> 'transient'` collapse is the core bug. |
| `parallel(thunks)` is crash-isolating: a thrown/dead thunk maps to `null` in the returned array (allSettled-shaped). | audit brief line 30; `mitosis-scheduler.test.mjs` fake | The boundary must map every `null` element to a classified value, never skip it. |
| `pipeline()` is not available/used; `workflow` param is a dead stub; the parallel engine runs in-process (one harness run per invocation). | `2026-07-08-mitosis-3b-engine-surface-map.md:48`; audit brief line 21 | No child-workflow spawning; all fault handling is in-process. |
| `resumeFromRunId` + `journal.jsonl` prefix-replay is a Workflow-TOOL (outer-loop) capability, same-session only; the engine cannot see its own `wf_` runId. | `2026-07-08-mitosis-3b-engine-surface-map.md:8` | Cross-session recovery reconciles from git/GitHub, never from the journal. |
| Orchestrator determinism is load-bearing: no `Date.now`/`Math.random`/`new Date` in engine code (breaks prefix-replay). Entropy/timestamps arrive via `args`. | prior spec Section 3 | All fault-loop bounds must be a deterministic PROGRESS clock (counters), not a wall clock. |
| Journal granularity is whole-`agent()`; an interior crash re-runs the entire prompt. | prior spec Section 2 | Every git effect stays observe-then-converge (already implemented; reused). |

---

## 1. Goals and Non-goals

### 1.1 Goals

1. A failure becomes a CLASSIFIED VALUE the instant it crosses a unit's boundary. The orchestrator core consumes only values — never a raw throw, never a bare `null`, never an unbounded wait.
2. Replace the disposition defect at `mitosis.js:155` (`classifyOutcome` maps EVERY `null` to `'transient'`, making crash / sandbox-block / hang indistinguishable and all retried) with a three-tier disposition ladder that diagnoses before it acts.
3. Make in-run remediation — dispatching a DIFFERENT action that avoids a diagnosed cause — the dominant recovery path (~99.9%), bounded by a deterministic state machine that cannot run away.
4. Reduce genuine human-blocking (Tier 2) to a rare residual (~0.1%): park only the blocked unit and its dependents; everything else keeps running and ships; emit one typed human request; resume via a future run that re-drives only the parked subtree.
5. Preserve every load-bearing invariant of the current system (Section 1.4).

### 1.2 Non-goals

1. **This model does NOT catch plausible-but-wrong agent output.** A schema-valid `Done` that wraps a wrong implementation is a HEALTHY signal at the fault layer; only VERIFICATION GATES (tests-first, receipts CI red->green, D6 dependents, review agents) catch semantic wrongness. The fault model's only responsibility there is to treat a GATE FAILURE as a first-class Outcome (Section 4.1, Section 5). "Never crashes" must never be sold as "never wrong."
2. No move to a long-lived service model. Mitosis is a single-process, launch-scoped program that runs to completion or halt and exits. Durability is git history plus an on-disk ledger, not a database.
3. No new external orchestration framework, no message broker, no supervision runtime. Erlang/Akka/Temporal/Camunda are cited as PRECEDENT for the disposition semantics, not as dependencies.
4. No change to the D1 decomposition quality or the review/gate content beyond what the fault model requires (turning a gate failure into an Outcome).
5. No fix to any downstream target project; the engine is the subject.

### 1.3 What this rebuild is (and is not)

It is a ground-up rebuild of the FAULT-HANDLING architecture: the disposition ladder, the typed-outcome boundary, the supervisor, the bounded remediation loop, the lease-based scheduler, the parking lot, saga compensation, and ship-as-you-go. It REUSES the durable substrate that already works (worktrees, `.mitosis/run.json`, the `gh pr list --merged` done-oracle, squash-per-MSP, receipts + D6 gate, observe-then-converge git preambles, refuse-to-weaken, reconcile-first). Section 7 gives the exact REUSE / RETIRE / REPLACE map.

### 1.4 Preserved invariants (hard)

- Never plow ahead unsafely; a unit that cannot proceed safely is disposed as a value, never ignored.
- Every shared branch stays green: serialized merges through the mergeQueue, fresh-base rebase before merge, receipts CI red->green, the composed D6 dependents gate at the published boundary.
- One squash per MSP.
- Deterministic orchestrator (no clock/RNG); resumable from durable state.
- No code comments, no emojis, no AI attribution (project-wide rules).

---

## 2. Core principle and the closed Outcome type

### 2.1 Core principle

> A failure becomes a classified value the instant it crosses a unit's boundary. The core consumes only values.

Analogues (precedent, not dependency): Erlang turns a crash into a supervisor message; Rust/Go turn errors into returns; Temporal wraps faults in a typed `Failure`; Camunda raises typed incidents. In every case the executing core never touches a raw exception; it reads a value that already carries its own disposition.

### 2.2 The closed Outcome type (per unit-stage)

Every unit-stage (Reconcile, Decompose, Prepare, Plan, Harden, Branch, each Execute wave-task, Boundary gate, Ship) returns exactly one value drawn from this CLOSED set. This is the ONLY type the boundary emits and the ONLY type the supervisor consumes.

```
Outcome =
  | Done(value)
  | Transient(evidence)
  | ApproachFixable(cause)
  | NeedsHuman(request)
  | Unknown(raw)
```

Payload contracts (annotations are prose here, not code comments):

- `Done(value)` — `value` is the schema-valid structured object the stage produced. Success. This includes a passing verification gate.
- `Transient(evidence)` — `evidence = { signal, detail, attemptNo }` where `signal ∈ {'null-suspected-transient','rate-limit','throw-io'}`. Meaning: an IDENTICAL retry could plausibly succeed. This is a NARROW class (see Section 2.4), not the default for `null`.
- `ApproachFixable(cause)` — `cause = { mechanism, diagnosis, evidence }` where `mechanism` is the causal-mechanism fingerprint token (Section 4.3.3), `diagnosis` is a one-line human-readable cause, `evidence` is the raw signal that grounds it. Meaning: deterministic given the SAME strategy, but a DIFFERENT strategy/tool/input/acquisition-path works. This is the dominant class.
- `NeedsHuman(request)` — `request = { kind, what, remediation, resumePoint }` where `kind ∈ {'install','grant','provide-asset','approve-decision'}`. Meaning: an out-of-band human ACT or DECISION is required; no re-planned dispatch could satisfy it.
- `Unknown(raw)` — `raw` is the uninterpretable raw signal (`null` with no self-report, an unexpected `throw`, a shape the classifier cannot map). Meaning: not yet classifiable. `Unknown` is a first-class value with a defined disposition (Section 3.4), never a silent skip and never auto-`Transient`.

### 2.3 Totality: the map from four raw signals is total

The four raw signals a stage can emit are `{ structured, null, throw, hang }`. `hang` is subsumed by `null` because the only wall clock available is `agent()`'s internal timeout, which surfaces a hang as `null` (Section 0, CRITICAL A). The boundary classifier `classify(raw, ctx) -> Outcome` is a TOTAL function:

| Raw signal | Classifier decision |
|---|---|
| `structured`, no fault field | `Done(value)` |
| `structured`, self-reported `fault.kind='transient'` | `Transient(evidence)` |
| `structured`, self-reported `fault.kind='approach-fixable'` | `ApproachFixable(cause)` from the reported mechanism |
| `structured`, self-reported `fault.kind='needs-human'` | `NeedsHuman(request)` |
| `null` | `Unknown({ raw: null })` — NEVER auto-`Transient` (this is the fix for `:156`) |
| `throw`, recognized typed `EngineFault` | its declared class |
| `throw`, anything else (Error or non-Error) | `Unknown({ raw: error })` |

The classifier has no `else` that returns nothing and no branch that throws on ordinary input; the impossible-input guard uses an `assertNever` helper so the exhaustiveness is lintable (Section 5, obligation 2).

### 2.4 Why `null` is `Unknown`, not `Transient`

`agent()` already exhausts HTTP-transient retries internally and only then returns `null` (Section 0). So a `null` is far more likely a sandbox block, a worker death, or an internal-timeout hang than a fresh network blip. Auto-classifying `null` as `Transient` (`:156`) makes the engine retry a doomed identical action — the exact AutoGPT failure mode. Classifying `null` as `Unknown` routes it through disambiguation (Section 4.1.3) and gives it a single cautious bounded probe rather than unbounded identical retry.

---

## 3. The three-tier disposition ladder as a state machine

The ladder is the required BEHAVIOR. It is driven entirely by the supervisor (Section 4.2) over the Outcome type. It is a deterministic state machine; the only nondeterminism (the diagnostician LLM) is wrapped inside a finite contract (Section 4.3).

### 3.1 States

```
UNIT STATES:  Ready -> Dispatched -> Evaluating -> { Done | Remediating | Parked | Exhausted }
                                                      Remediating -> (loop) -> { Done | Exhausted }
                                                      Exhausted -> Parked
TERMINAL:     Done (shipped), Parked (Tier 2 residual)
```

### 3.2 Tier 0 — Transient

Trigger: `Transient(evidence)`.
Action: bounded re-dispatch of the IDENTICAL action, small budget (default 1 additional attempt; see OD-5). No timed backoff at the app level — the harness already backed off; app-level backoff would need a clock and break determinism (OD-8). On budget exhaustion the outcome is re-evaluated; a still-`Transient` result after the cap escalates to `Unknown` handling (a transient that will not clear is not transient).

### 3.3 Tier 1 — Approach-fixable (the dominant path, ~99.9%)

Trigger: `ApproachFixable(cause)`.
Action: enter the bounded remediation loop (Section 4.3): Diagnose why -> pick a strategy NOT already tried -> re-dispatch a CORRECTED task, in-run, no human. Remediation is NOT retry: a retry repeats the same doomed action; remediation dispatches a DIFFERENT action that avoids the diagnosed cause. Closest published analog: Reflexion (memory of failed trials conditions the next attempt), NOT Self-Refine (which polishes the same approach). Terminal states of the loop: `Done` or `Exhausted`.

### 3.4 Tier 2 — Genuinely-blocked (the rare residual, ~0.1%)

Trigger: `NeedsHuman(request)` directly, OR `Exhausted` from the remediation loop.
Action: park ONLY this unit and its dependents (Section 4.5); release the unit's file-lease (Section 4.4); emit ONE typed human request; write the park record to the ledger. Everything else keeps running and ships. Resume is a FUTURE run that re-drives only the parked subtree at its recorded stage.

### 3.5 `Unknown` handling (the disambiguation branch)

`Unknown(raw)` is dispositioned deterministically:
1. If a pre-dispatch capability declaration flagged this stage as sandbox-sensitive (Section 4.1.3), classify as `NeedsHuman({kind:'grant', ...})` before spending any retry.
2. Else give it ONE cautious probe re-dispatch (it might be a genuine transient the SDK did not absorb).
3. On the probe result: `Done` -> done; a second `Unknown` with the SAME fingerprint -> convergence failure -> escalate to `ApproachFixable` (hand it to the diagnostician; a recurring identical Unknown is a deterministic cause) or, if the diagnostician also fails, `Exhausted` -> Park. This bounds `Unknown` to at most one probe plus the normal remediation budget; it can never loop.

### 3.6 Ladder transition table

| Current | Outcome observed | Next |
|---|---|---|
| Dispatched | `Done` | Done (terminal) |
| Dispatched | `Transient` | Tier 0 retry (budget--); re-Dispatched |
| Dispatched | `ApproachFixable` | Tier 1 Remediating |
| Dispatched | `NeedsHuman` | Tier 2 Parked (terminal) |
| Dispatched | `Unknown` | Section 3.5 probe |
| Remediating | `Done` | Done (terminal) |
| Remediating | `ApproachFixable(new mechanism)` | loop (budget--, tried-set +=) |
| Remediating | `ApproachFixable(tried mechanism)` | zero-cost reject; if no untried proposal -> Exhausted |
| Remediating | `NeedsHuman` | Tier 2 Parked (terminal) |
| Remediating | budget/tried-set exhausted | Exhausted -> Parked (terminal) |

Every transition appends a cycle record to the unit ledger (auditable).

---

## 4. Component-by-component design (the seven-component stack)

Each component is the canonical answer to one problem; they compose without overlap.

### 4.1 Component 1 — Typed-outcome boundary (per unit-stage)

**Problem:** the core must never see a raw throw, `null`, or hang.

**Data schema.** The Outcome type (Section 2.2). Plus the optional agent self-report discriminator appended to EVERY stage schema:

```
fault?: {
  kind: 'transient' | 'approach-fixable' | 'needs-human',
  mechanism?: string,
  diagnosis?: string,
  request?: { kind: 'install'|'grant'|'provide-asset'|'approve-decision', what: string }
}
```

**Behavior.**
- `runStage(dispatchThunk, ctx) -> Outcome` wraps exactly one `agent()` dispatch. It try/catches the await; a throw becomes `{raw:'throw', error}`, a `null`/`undefined` return becomes `{raw:'null'}`, a structured return becomes `{raw:'structured', value}`. It then calls the total `classify(raw, ctx)` (Section 2.3) and returns an Outcome.
- The core (supervisor + scheduler) calls ONLY `runStage`; it never calls `agent()` directly. This is the single choke point where raw signals become values.
- `classify` is pure and deterministic (no clock, no RNG); it is the most heavily unit-tested function in the system (Section 8).

**4.1.3 Block vs crash vs hang disambiguation (resolves CRITICAL B).** The harness returns `null` for all three. Disambiguation is a COMPOSITE with a fixed precedence:
1. **Structured self-report (primary, authoritative).** When the permission classifier returns a denial TO the agent, the agent is still alive and returns `{fault:{kind:'needs-human', request:{kind:'grant',...}}}`. The boundary maps that directly. This is the common block case and needs no guessing.
2. **Pre-dispatch capability declaration (pre-emptive).** Decompose/Plan declare per-unit `sandboxSensitive` plus the forbidden actions (network install, credential access, etc.). A stage whose declared action is sandbox-forbidden is classified `NeedsHuman` BEFORE dispatch — it is never attempted, never burns a retry. (Adds one field to the decompose schema; see OD-2.)
3. **Convergence signal (fallback for silent kills).** When the agent is killed before it can self-report, the boundary sees `null -> Unknown`. A single identical-fingerprint recurrence (Section 3.5) proves the cause is deterministic (block or approach-fixable), not a blip, and routes it out of the retry lane.
Precedence when signals disagree: self-report > capability-declaration > convergence. No harness "block event" exists to consume (verified absent), so this composite is the mechanism; the residual ambiguity (a silent kill that is actually a one-off transient) costs at most one wasted probe.

### 4.2 Component 2 — Supervisor-per-unit (OR-semantics)

**Problem:** who decides disposition, and how is one unit's failure isolated from siblings.

**Data schema.**
```
SupervisorState {
  unitId, stage,
  budget: { remaining: int, cost: 'dispatch-count' },
  triedSet: Set<mechanism>,
  ledger: CycleRecord[],
  status: 'ready'|'dispatched'|'remediating'|'done'|'parked'
}
```

**Behavior.**
- One supervisor per MSP (unit). It does NO work; it only dispositions Outcomes. Verb set (from Akka): `resume` (Tier 0 retry), `retry` (re-dispatch corrected), `stop` (terminal Done or Exhausted), `escalate` (to Tier 2 park).
- **OR-semantics (from Erlang one-for-one), AND-semantics rejected.** A fault in one unit disposes only that unit; it NEVER restarts or aborts siblings. The all-for-one (restart-the-whole-fleet) strategy is explicitly out.
- The supervisor's dominant internal behavior is the Tier-1 remediation loop (Section 4.3).
- Budgets are PER-UNIT (each supervisor owns its own counter and tried-set). This replaces the single global `retryState` at `mitosis.js:1200-1201` — a shared global budget lets one pathological unit starve the fleet.

### 4.3 Component 3 — The bounded remediation loop (the center)

**Problem:** run nondeterministic reasoning to fix a failure without ever running away.

**4.3.1 State machine.** States `{Diagnose, Remediate, Re-dispatch, Evaluate}`; the ONLY terminal states are `Done` and `Exhausted`.

```
Diagnose --> (proposal) --> Guard(tried-set) --> Remediate --> Re-dispatch --> Evaluate
   ^                                                                              |
   |------------------- ApproachFixable(new, untried) ----------------------------|
Evaluate --> Done            (terminal)
Evaluate --> NeedsHuman  --> escalate -> Parked (terminal via Tier 2)
Evaluate --> Exhausted       (terminal, deterministic bail)
```

**4.3.2 Transitions in detail.**
- **Diagnose.** Invoke the remediation authority (Section 4.3.5) with the failure evidence and the current tried-set. It must return either a candidate `{ mechanism, correctedTask }` whose mechanism is NOT in the tried-set, or a `NeedsHuman` verdict, or (on its own failure) an `Unknown`.
- **Guard (tried-set check).** If the proposed mechanism is already in the tried-set, REJECT it at ZERO cost (no dispatch, no budget spend) and ask once more for an untried mechanism; if none is offered, transition to `Exhausted`.
- **Remediate.** Run per-attempt saga compensation (Section 4.6): reset the worktree to the pre-attempt ref so the corrected dispatch starts from a known-clean state.
- **Re-dispatch.** Dispatch the corrected task through the boundary (`runStage`). Append the mechanism to the tried-set (monotonic). Decrement the budget by one.
- **Evaluate.** Boundary-classify the result:
  - `Done` -> terminal `Done`.
  - `ApproachFixable(newCause)` -> convergence check: if `newCause.mechanism != prevCause.mechanism`, loop to Diagnose; if EQUAL, the diagnosis was wrong — apply an EXTRA budget decrement (converge faster) then loop or bail.
  - `Transient` -> Tier 0 bounded retry then re-evaluate.
  - `NeedsHuman` -> escalate to Tier 2.
  - `Unknown` -> Section 3.5 (one probe) then convergence-decrement.
  - budget <= 0 OR no untried mechanism -> `Exhausted`.

**4.3.3 Mandatory bounds (a)-(f).**
- **(a) Hard attempt/cost budget per unit.** A deterministic integer counter (`budget.remaining`), decremented per dispatch, seeded from `args` (default in OD-5). Cost unit is dispatch-count (deterministic), not tokens (non-deterministic without a meter).
- **(b) Monotonic tried-set fingerprinted on the CAUSAL MECHANISM.** The set stores mechanism tokens shaped `<category>:<mechanism>`, e.g. `acquisition:raw-http` vs `acquisition:package-manager`, `import-path:relative` vs `import-path:alias`, `test-double:real-network`. The token names WHAT the diagnosis claims to fix, NOT the raw error text (which is line-noise). A proposal already in the set is rejected at ZERO cost.
- **(c) Convergence check.** The new failure must DIFFER (by fingerprint) from the prior. A recurring identical failure means the diagnosis was wrong and consumes budget FASTER (extra decrement), so a wrong diagnosis cannot spin.
- **(d) Anti-oscillation.** The tried-set NEVER shrinks. A mechanism, once tried, is permanently excluded, so the loop cannot ping-pong between two doomed strategies.
- **(e) Deterministic bail to Tier 2.** Exhaustion is decided by pure code comparing counters and sets — NOT by an LLM judgment call. The bail is not a state the reasoning can decline to enter.
- **(f) Same typed-outcome boundary wraps the loop.** The core sees only `{ Done | StillRemediating(n, fingerprint) | Exhausted }`. Every cycle appends a `CycleRecord { attemptNo, mechanism, diagnosis, outcomeKind, budgetAfter }` to the unit ledger.

**4.3.4 Key insight (stated as a design invariant).** Nondeterministic reasoning is safe exactly when wrapped in a deterministic contract with FINITE exit states. Running away is not a state the machine can enter. Cautionary tale designed against: AutoGPT burned 300+ calls looping with no repeat-detection, no completion metric, and no cost breaker. Anthropic's "Building Effective Agents" mandates explicit stopping conditions; bounds (a)-(e) ARE those stopping conditions, made structural.

**4.3.5 Remediation authority (resolves CRITICAL D).** A DEDICATED diagnostician sub-agent, distinct from the planner:
- Input: the failure evidence (raw signal, prior tried-set, the failing task text, the stage).
- Output (schema): `{ verdict: 'remediable'|'needs-human', mechanism?, correctedTask?, request? }`.
- It reads failure evidence and emits a corrected task plus its causal-mechanism token; it does NOT re-plan the whole MSP.
Rationale for a dedicated agent over re-invoking the planner: (i) distinct reason-to-change — diagnosis of a failed trial is a different job from planning; (ii) clearer routing — the supervisor reasons about "diagnose this failure" as a named role; (iii) it keeps the planner's context clean and cheap (the planner is not re-run with a growing failure transcript). This is a new role; it clears the anti-sprawl rule-of-three because remediation recurs on the ~99.9% Tier-1 path. Flagged OD-3 because it materially affects cost and roster.

### 4.4 Component 4 — Bulkhead isolation + readiness predicate + resource leases

**Problem:** overlapping file scopes must not run concurrently, but they do not depend on each other; the current connected-components collapse over-serializes them.

**Data schema — a FLAT unit table** (replaces `deriveClusters` connected-components at `mitosis.js:511-590`):
```
Unit {
  id,
  state: 'planned'|'ready'|'dispatched'|'done'|'parked',
  prereqs: id[],
  fileScope: (path|glob)[],
  leaseHeld: bool
}
LeaseTable: Map<path-or-glob, unitId>
```
Field meanings: `prereqs` are true dependency edges only (bottom-up), never a fileScope-overlap edge; `fileScope` is the write-set the unit owns; `LeaseTable` records which unit currently holds each overlapping path.

**Behavior.**
- **Readiness predicate.** A unit is dispatchable iff (ALL `prereqs` are `done`) AND (no currently-held lease overlaps this unit's `fileScope`). Overlap is the existing `scopesOverlap`/`pathsOverlap` logic (`mitosis.js:39-54`), REUSED.
- **Write-safety is a LEASE, not a dependency edge.** Whoever holds the overlapping-path lease runs; ANY exit (Done / park / exhaust) releases it. This dissolves the "31-into-1 collapse": 31 MSPs that share a fileScope must not run CONCURRENTLY, but none NEEDS another to succeed, so they must not be forced into one serial chain — they interleave as leases free up.
- **Lease lifecycle.** Acquire on dispatch (mark every overlapping path in the LeaseTable to this unit). Release on ANY terminal (Done, Parked, Exhausted). A parked unit RELEASES its lease so an unrelated overlapping unit can still run; the parked unit's DEPENDENTS remain blocked by the prereq-Done requirement, not by a held lease (OD-9).
- **One tick.** Dispatch every ready unit; join with `parallel()` allSettled semantics; write each Outcome; recompute readiness; repeat until no unit is ready (all Done or Parked). Deterministic tie-break when two ready units contend for an overlapping lease: lower unit index/id acquires this tick, the other waits for the next (no starvation — the loser becomes ready as soon as the lease frees). Tick-vs-continuous is OD-6.
- **Cycle detection and bottom-up ordering are KEPT** (`detectCycle`, `bottomUpOrder` at `mitosis.js:468-509`) as inputs to `prereqs`; only the connected-component collapse into serial cluster chains is dropped.

### 4.5 Component 5 — Parking-lot ledger + typed human task + targeted future resume

**Problem:** the rare genuinely-blocked unit must not stop the fleet, and a future run must resume exactly it.

**Data schema — park record on disk** (in `.mitosis/`, gitignored; folded into `run.json`, OD-10):
```
ParkRecord {
  unitId,
  stage,
  diagnosis,
  request: { kind: 'install'|'grant'|'provide-asset'|'approve-decision', what, detail },
  remediation,
  resumePoint: { branch, ref, stage },
  triedSet: mechanism[],
  dependents: unitId[]
}
```
Field meanings: `stage` is where it blocked (plan | harden | branch | execute | ship); `diagnosis` is the one-line cause; `remediation` is the exact remediation attempted or recommended; `resumePoint` is where a future run re-enters this unit; `triedSet` is carried so resume never repeats a doomed strategy; `dependents` are the units parked because they depend on this one.

**Behavior.**
- On Tier 2 (a direct `NeedsHuman`, or `Exhausted` from the loop): write the park record; mark the unit and its transitive prereq-dependents `parked`; release the unit's lease; emit ONE typed human request (the `request.kind` + `what`), not a wall of prose.
- **Resume** = a future mitosis invocation that: reconciles the shipped-set from the real world (`gh pr list --state merged` + `git log origin/<base>`, REUSED), reads the ledger, and re-drives ONLY the resolved parked units at their recorded `resumePoint.stage`. NOTHING shipped is re-touched (done-oracle skip). This is exactly Step Functions redrive / DBOS checkpoint-skip rendered as files, built on the existing `.mitosis/run.json` + done-oracle substrate.

### 4.6 Component 6 — Saga compensation

**Problem:** a re-dispatch must start from a known-clean state, and an abandoned unit must not leave half-applied git effects.

**Data schema — per-unit compensation registry:**
```
Compensation { effect: string, undo: string, state: 'local'|'shared' }
CompensationStack: Compensation[]
```
The `CompensationStack` is per unit and unwound LIFO (reverse of registration order).

**Behavior.**
- Every git side effect registers its undo BEFORE performing it (register-then-act). Abandon/park runs the stack in REVERSE.
- **Per-attempt AND per-unit.** Each remediation cycle runs its per-attempt compensation (the `resetPreamble` at `mitosis.js:165-167`, REUSED) before the next dispatch, so each attempt starts clean. Per-unit compensation runs on park/abandon.
- **The merge is a point-of-no-return; prefer FORWARD recovery after merge.** Compensation policy:

| Effect | State | Compensation |
|---|---|---|
| worktree add | local | `git worktree remove --force` (destructive OK) |
| local integration `branch -f` | local, never pushed | reset/delete the local ref (destructive OK) |
| push integration branch | shared/pushed | forward-only; no history rewrite (except own-rebase `--force-with-lease`) |
| PR open | shared | close the PR (idempotent) |
| squash-merge | POINT OF NO RETURN | forward recovery only: `git revert`; never un-merge a shared squash |

This matches the existing observe-then-converge + forward-only policy in `shipOneMsp` (`mitosis.js:1459`), which is REUSED and generalized into an explicit registry.

### 4.7 Component 7 — Ship-as-you-go (never-lose-work)

**Problem:** never lose a completed MSP to a later failure elsewhere.

**Behavior.**
- Each MSP merges the INSTANT its own gate passes, independent of the rest of the run (already the mergeQueue behavior; REUSED). Merges stay serialized through the mergeQueue so every shared branch stays green.
- **Durability ordering (as atomic as tooling allows):** (1) squash-merge succeeds -> (2) immediately durable-write the `done` record to `.mitosis/run.json`. If the write fails AFTER the merge, the merge STANDS; report `manifestWritten:false`; recovery reconciles from `gh`/`git` on relaunch. The merged-PR done-oracle OUTRANKS the manifest at every ship (this is the existing `shipOneMsp` step 8 contract, `mitosis.js:1467-1472`, REUSED).
- **Partial success is the DEFAULT outcome.** Ship 30 of 31, park 1 = a SUCCESSFUL run with one open item. `overallStatus` reports it honestly (`all-shipped` only when zero parked and every unit shipped).

---

## 5. Never-crash — four checkable obligations (acceptance criteria)

Stated as acceptance criteria, each with a concrete test in Section 8.

1. **The boundary map from `{structured, null, throw, hang} -> Outcome` is TOTAL.** Acceptance: a property/exhaustive test drives `classify` with every raw-signal shape including adversarial inputs (`null`, `undefined`, a thrown `Error`, a thrown non-`Error` value, a structured object with a `fault` field, a structured object without one) and asserts each returns a valid Outcome constructor; there is no input for which `classify` returns nothing or throws.
2. **The core handles every Outcome constructor (exhaustive match, lintable).** Acceptance: the supervisor's disposition switch has one case per constructor (`Done`, `Transient`, `ApproachFixable`, `NeedsHuman`, `Unknown`) plus an `assertNever` default; a test enumerates the constructor set and asserts the matcher dispositions each without falling through.
3. **Every await carries a deadline (progress clock + wall clock; timeout -> `Unknown(hang)`).** Discharge, given CRITICAL A (no app-level cancellation): (i) every `agent()` await is bounded by the harness-internal WALL-CLOCK timeout, which surfaces as `null -> Unknown`; (ii) the remediation loop is bounded by the deterministic PROGRESS clock (per-unit dispatch-count budget, Section 4.3.3a); (iii) every non-`agent` await is structurally bounded (finite loops with a decrementing budget or a finite id-set; the tick join is `parallel()` allSettled over a finite ready-set). Acceptance: a static test asserts no unbounded loop (every loop body either iterates a finite set or decrements a budget) and that an injected `null`/timeout maps to `Unknown`, never to silent success. Residual: a wall-clock hang that violates the harness contract (an `agent()` that never returns even `null`) is outside the deterministic engine's control; mitigation is OD-1 (an outer-loop, non-replayed watchdog that kills-then-relaunches).
4. **Run-level failure is itself a VALUE written to the ledger (halting is a disposition, never an escaped throw).** Acceptance: an injected top-level throw (e.g. Reconcile or Prepare throws, or the cluster fan-out await rejects) causes the engine to RETURN a report value carrying `overallStatus`, the crash record, AND the already-`shipped` set preserved (not dropped). This closes the "`parallel` reject-all contract dropping shipped MSPs" gap at `mitosis.js:1500-1506`, where the current `catch` returns `fatalReport(...)` with `shipped:[]`.

These four close the audit's real crash gaps: the unwrapped `refuseToWeaken` recursion (`mitosis.js:1277`, an untrusted-config walk that can throw or recurse deeply on adversarial input) is wrapped in the boundary with a bounded recursion depth and its fault becomes a `NeedsHuman`/`halted` VALUE; the `parallel` reject-all shipped-drop is fixed by obligation 4 plus ship-then-durable-write; the no-timeout hang is addressed by obligation 3.

---

## 6. Never-lose-work — acceptance criteria and durability ordering

1. **Ship durability ordering.** Acceptance: after a squash-merge, the `done` record is written before the unit is considered settled; if the write is injected to fail, the merge stands and the returned report still lists the MSP as shipped (reconciled from the done-oracle), with `manifestWritten:false`.
2. **No shipped MSP is ever re-touched.** Acceptance: on relaunch, a unit whose PR is already merged is skipped by the done-oracle (`gh pr view --json state,mergedAt`) with no rebase/push/PR/merge — no garbled second PR.
3. **A crash after N of M merges loses nothing.** Acceptance: kill the run after N merges; relaunch; the engine reconciles the N from `gh`/`git` (not from memory or the journal), skips them, and completes or parks the remaining M-N. Reconcile OUTRANKS the manifest (a manifest that lies about an unmerged MSP being shipped is overridden by the real merged-set).
4. **Parked units survive to the next run.** Acceptance: a parked unit's `ParkRecord` (stage, tried-set, resumePoint) is on disk; a future run re-drives exactly it at its recorded stage without repeating a tried mechanism.

---

## 7. Migration / replacement map (REUSE / RETIRE / REPLACE)

Line numbers are the current `mitosis.js` (1506 lines) and its `.mjs` twins.

| Current site (`path:line`) | What it is | Disposition |
|---|---|---|
| `classifyOutcome` `mitosis.js:155-159` / `retry.mjs:1-5` | `null -> 'transient'` collapse (the core bug) | **REPLACE** with the total boundary `classify()` (Section 2.3); `null -> Unknown`. |
| `dispatchWithRetry` `mitosis.js:169-184` / `retry.mjs:15-30` | binary transient/permanent retry; `__quarantined` terminal | **REPLACE** with supervisor + 3-tier ladder + remediation loop (Sections 4.2-4.3). |
| `withinRetryBudget` `mitosis.js:161-163`, `resetPreamble` `:165-167` | budget check + worktree reset | **REUSE**: budget folds into per-unit `SupervisorState.budget`; `resetPreamble` becomes the per-attempt saga compensation. |
| `outcome.mjs` twin `mitosis.js:69-153` | `shipped/halted/crashed/quarantined` report partition, `assembleRunReport`, `fatalReport` | **REVISE**: report partition becomes `{ shipped, parked, ... }` derived from Outcomes + ledger; `fatalReport` MUST preserve `shipped` (obligation 4). `quarantined` retired in favor of `parked`. |
| `refuseToWeaken` + helpers `mitosis.js:210-352` / `prepare-guard.mjs`; call at `:1277` | fail-closed gate-weakening guard | **REUSE** the logic; **WRAP** the call in the boundary (bound recursion depth on untrusted config; fault -> `NeedsHuman`/`halted` value, never an escaped throw). |
| `recovery.mjs` twin `mitosis.js:357-451` | `computeLogicalRunId`, `reconcileShippedSet`, `parseRunManifest`, `buildInitialManifest`, `applyShipTransition` | **REUSE**; extend the manifest schema with `parked[]`, per-unit `triedSet`, `resumePoint`. |
| `deriveClusters` connected-components `mitosis.js:511-590` / `derive-clusters.mjs` | fileScope-overlap collapsed into serial cluster chains | **REPLACE** with the flat unit table + readiness predicate + leases (Section 4.4). KEEP `detectCycle`/`bottomUpOrder` as prereq inputs; DROP the component collapse. |
| `runEngine` / `runTask` retry `mitosis.js:622-883`, retry at `:744` / `run-engine.mjs` | wave execution, review loops, boundary gate | **REUSE** the wave/review/gate machinery; **REPLACE** `runTask`'s `dispatchWithRetry` with the supervisor/remediation loop. |
| boundary diff-scoped gate `mitosis.js:842-852` | new-vs-pre-existing lint/type gate | **REUSE**; a gate FAILURE becomes a first-class Outcome (`ApproachFixable` -> remediate, or `NeedsHuman`) — this is the fault model's only job on the plausible-but-wrong axis (Section 1.2.1). |
| global retry budget `mitosis.js:1200-1201` | one shared `retryState` for the whole run | **REPLACE** with per-unit budgets (Section 4.2). |
| `runClusterChain` serial chain + mergeQueue `mitosis.js:1290-1498` | serial per-cluster chain; quarantine-terminal returns | **REPLACE** the chain control flow with the flat tick scheduler (Section 4.4). **KEEP** the serialized mergeQueue at the published boundary and ship-then-durable-write. |
| quarantine (`quarantinedOutcome`, `__quarantined`) `mitosis.js:81-85,180,748-749,1318-1320,1345-1347,1447` | exhausted-retries terminal that blocks `all-shipped` | **REPLACE** with Tier 2 park: park only the unit + dependents, ship the rest. |
| `shipOneMsp` `mitosis.js:1453-1490` | done-oracle-first, observe-then-converge, ship-then-manifest-write | **REUSE** (already embodies Component 7 + forward recovery). |
| Reconcile stage `mitosis.js:1129-1161` | reconcile-first from `gh`/`git` | **REUSE**. |
| Branch-prep fresh-base `mitosis.js:1419-1435` | move integration ref onto pushed base | **REUSE**. |
| worktrees, `.mitosis/run.json`, done-oracle, squash-per-MSP, receipts + D6 gate, observe-then-converge preambles | durable substrate | **REUSE** wholesale. |
| SKILL.md dispatcher `.claude/skills/mitosis/SKILL.md` | thin entry; relay report | **REUSE**; extend the relay to surface `parked[]` + the typed human requests. |
| mirror-twin structure + `mirror-guard.test.mjs` | byte-identity of inline twins | **RESPECT/REUSE**: add new byte-identical twins for the new modules (Section 9). |

---

## 8. Test strategy

Unit-first, deterministic, with fakes for `agent()`, `git`, and `gh`. Every test asserts observable behavior through a public surface (a returned Outcome, the run report, the on-disk ledger), never an implementation detail.

- **Boundary totality (obligation 1).** Exhaustive/property test of `classify` over all raw-signal shapes + adversarial inputs. Red-first anchor: a `null` input currently returns `'transient'` (`retry.mjs`); the new `classify` returns `Unknown` — a test red against the current module and green after.
- **Exhaustive match (obligation 2).** Enumerate the Outcome constructor set; assert the disposition switch handles each and `assertNever` guards the impossible default.
- **Remediation loop bounding + tried-set.** With a fake diagnostician: (i) a diagnostician stuck proposing one mechanism -> zero-cost reject -> `Exhausted` within budget; (ii) a recurring identical failure -> extra decrement -> `Exhausted` FASTER than a converging one; (iii) the tried-set never shrinks (anti-oscillation); (iv) the bail is deterministic (no diagnostician call decides termination); (v) a run-away is structurally impossible (assert total dispatches <= budget for any diagnostician).
- **Isolation + leases.** A unit park/crash does not restart or block siblings (OR-semantics); two overlapping-lease units serialize across ticks but both can reach Done; the readiness predicate admits a unit only when prereqs are Done AND no overlapping lease is held; a parked unit releases its lease.
- **Compensation.** Per-attempt reset yields a known-clean tree before re-dispatch; abandon runs undos in reverse; a merged squash is compensated forward-only (no history rewrite on a shared ref). Git-effect idempotency is exercised against a LOCAL throwaway git repo (local-disposable test exception; no remote, no live project).
- **Resume.** Kill after N of M merged; relaunch reconciles the N from `gh`/`git` (not memory), skips them, re-drives only resolved parked units at their recorded stage, re-touches nothing shipped; a manifest that lies is overridden by the reconciled set.
- **Run-level failure as value (obligation 4).** Inject a top-level throw / a `parallel` reject-all; assert the engine returns a report VALUE preserving `shipped`, with the crash recorded.
- **Mirror-guard.** Each new `.mjs` twin is byte-identical (minus export/import) to its inline copy in `mitosis.js` (extend `mirror-guard.test.mjs`'s twin list).

Red-first discipline: each component lands with a test reproducing the failure it fixes (the `null`->infinite-retry misclassification is the flagship regression), red against current `mitosis.js` and green after.

---

## 9. Mirror-twin plan (resolves CRITICAL C)

The rebuild KEEPS the inline+mirror structure. Rationale: the harness loads `mitosis.js` as one self-contained `AsyncFunction` body (Section 0); inlining keeps the orchestrator self-contained and deterministic and keeps the existing string-load test harness (`mitosis-scheduler.test.mjs`) valid, while the `.mjs` twins remain unit-testable as ES modules. New pure-logic twins to add (each byte-identical, each with a `tests/*.test.mjs`, each added to the `mirror-guard.test.mjs` twin list):
- `boundary.mjs` — `classify`, `runStage`, the Outcome constructors.
- `supervisor.mjs` — `SupervisorState`, the disposition switch, the verb set.
- `remediation.mjs` — the bounded loop state machine, tried-set, convergence, deterministic bail.
- `leases.mjs` — the flat unit table, readiness predicate, lease acquire/release, tick scheduler.
- `parking.mjs` — `ParkRecord`, park/resume ledger operations.
- `saga.mjs` — the compensation registry + policy table.

The consolidation alternative (dynamic `import`, which `parallel-plan-execution.js:27-28` proves works in a workflow body) is deliberately NOT adopted here to avoid destabilizing the string-load test harness and self-containment guarantee in the same change; it is surfaced as OD-4 for a separate decision. The byte-identity maintenance tax is accepted as the cost of self-containment (Pillar 1 over Pillar 2).

---

## 10. Sequencing (for the decomposition that follows)

Boundary-first, because every later component consumes Outcomes. Recommended MSP order (bottom-up):
1. Component 1 (boundary + Outcome type) — the foundation; unblocks everything.
2. Components 2+3 (supervisor + bounded remediation loop) — the disposition core.
3. Component 4 (leases + readiness + tick scheduler) — replaces the cluster collapse.
4. Components 5+6+7 (parking + saga + ship-as-you-go) — the durability + residual-human layer.
Each MSP leaves the engine strictly better and independently shippable; each merges behind its own PR with the shared branch green. Exact decomposition is owned by the mitosis flow (spec-decomposition rule), not this spec.

---

## 11. Resolutions to the CRITICAL grounding questions

- **A. Per-dispatch timeout/cancellation on `agent()`?** NO — verified absent (Section 0). `agent()` has an internal wall-clock timeout that surfaces as `null`; there is no cancellable, app-driven deadline. Fallback adopted: the wall-clock deadline is DELEGATED to `agent()` (its `null` return is treated as `Unknown(hang)`); the app-level bound is the deterministic progress clock (per-unit dispatch budget). An app-level `Promise.race` deadline is REJECTED for the deterministic engine because (i) it needs a clock (breaks prefix-replay determinism) and (ii) it cannot cancel the underlying worker, so a raced-out worker keeps running and may still perform git side effects — a direct threat to never-lose-work and saga integrity. The residual (a wedged `agent()` that never returns even `null`) is handled, if the human elects, by an outer-loop non-replayed watchdog (OD-1): it kills the whole run; recovery is relaunch -> reconcile-first -> the wedged unit re-drives from its recorded stage, and its leaked partial work is discarded by per-attempt saga reset on relaunch.
- **B. Sandbox block vs crash vs hang, given `null` for all three?** Composite classifier with fixed precedence (Section 4.1.3): structured self-report > pre-dispatch capability declaration > convergence signal. No harness block-event exists to consume. Chosen mechanism, with the capability declaration flagged OD-2 because it touches the decompose schema.
- **C. Mirror-twin/byte-identity: keep or consolidate?** KEEP (Section 9). Consolidation is OD-4.
- **D. Remediation authority: dedicated diagnostician vs re-invoke the planner?** Dedicated diagnostician (Section 4.3.5), flagged OD-3 because it adds a roster role and affects cost/complexity.

---

## 12. Open Design Decisions (need the human's ruling)

All 11 were RULED by the user on 2026-07-10 (record: ledger `decisions/2026-07-10-mitosis-groundup-spec-rulings.md`). Rulings: OD-1 (a) trust harness timeout + document the watchdog; OD-2 (a) add `sandboxSensitive` to decompose; OD-3 (a) dedicated diagnostician; OD-4 (a) keep inline twins; OD-5 remediation budget 4 / Tier-0 +1 / Unknown-probe 1; OD-6 (a) tick+allSettled; OD-7 (a) free-form validated fingerprint token; OD-8 (a) no app-level backoff; OD-9 (a) park releases the lease; OD-10 (a) extend `run.json`; OD-11 (b) BIG-BANG replacement (OVERRIDES the incremental recommendation). The options + recommendations below are retained as rationale.

- **OD-1. Wedged-`agent()` watchdog.** A truly hung `agent()` (never returns even `null`) would stall its tick. Options: (a) trust the harness timeout (simplest, determinism-safe, no watchdog); (b) add an outer-loop, non-replayed wall-clock watchdog in the main-thread Workflow invocation that kills-then-relaunches on a hard cap. Recommendation: (a) for v1; document (b) as the safety-net, since the deterministic engine cannot wall-clock-abandon without a clock and cannot cancel a leaked worker.
- **OD-2. Pre-dispatch capability declaration.** Add `sandboxSensitive` + declared forbidden actions to the decompose/plan schema so sandbox-forbidden stages are pre-classified `NeedsHuman` and never attempted. Options: (a) add it; (b) rely only on the runtime self-report + convergence. Recommendation: (a) — cheap, pre-empts a whole park class; cost is one schema field. Flagged because it changes the decompose contract.
- **OD-3. Remediation authority.** Options: (a) dedicated diagnostician sub-agent; (b) re-invoke the planner with failure context. Recommendation: (a) — distinct reason-to-change, cleaner routing, keeps planner context cheap; it is a new roster role that clears rule-of-three on the ~99.9% path. Ruling needed because it adds an agent and shifts token cost.
- **OD-4. Twin structure.** Options: (a) keep inline byte-identical twins (accept the maintenance tax); (b) consolidate to dynamic `import` (proven to work in a workflow body). Recommendation: (a) for this change to avoid destabilizing the string-load test harness; revisit (b) separately.
- **OD-5. Budget defaults.** Per-unit remediation budget (dispatch-count), Tier-0 transient cap, Unknown-probe cap. Recommendation: remediation budget 4, Tier-0 cap 1 extra, Unknown-probe 1. Ruling needed on the exact numbers (they trade robustness-of-recovery against worst-case token spend).
- **OD-6. Tick barrier vs continuous dispatch.** The task prescribes tick + allSettled; a tick barrier has head-of-line blocking on the slowest unit. Options: (a) tick + allSettled (as specified, deterministic, simplest); (b) continuous dispatch (dispatch newly-ready units the instant any unit finishes). Recommendation: (a) for v1; note (b) as a later optimization.
- **OD-7. Fingerprint taxonomy.** Who owns the `<category>:<mechanism>` vocabulary. Options: (a) free-form token from the diagnostician with a validated shape; (b) a fixed enum of categories. Recommendation: (a) with a validated shape — the tried-set compares tokens verbatim; a fixed enum would under-fit novel causes.
- **OD-8. Backoff/jitter.** Full-jitter backoff needs `Math.random` (banned) and a clock. Options: (a) no app-level timed backoff — immediate single re-dispatch (the harness already backed off); (b) deterministic backoff schedule seeded from `args`. Recommendation: (a) — matches the determinism constraint and the prior P2 ruling.
- **OD-9. Parked-unit lease + dependent parking.** Options: (a) park releases the lease (overlapping non-dependents can run); dependents parked by prereq reachability; (b) conservative — a parked unit HOLDS its lease until resolved. Recommendation: (a) — maximizes shipped work; (b) only if the human wants to freeze the overlapping surface around a blocked unit.
- **OD-10. Where the run-level failure value lives.** Options: (a) extend the single `.mitosis/run.json` with `parked[]` + `runStatus` (one durable file, matches the existing substrate); (b) a separate parking file. Recommendation: (a).
- **OD-11. Full-replace vs incremental landing.** Options: (a) land as MSP clusters via the mitosis flow, boundary-first (Section 10); (b) one big-bang replacement. Recommendation: (a) — each increment leaves the engine strictly better and is independently shippable; it also dogfoods the very invariants being rebuilt (with the prior spec's no-dogfooding caution: do not run mitosis on itself during the fault-layer rebuild).

---

## 13. Grounding index

- Engine under rebuild and all `path:line` references: `/Users/satanshumishra/Documents/DevLabs/.windful-ocean/.claude/workflows/mitosis.js` (verified this session).
- Pure-logic twins and tests: `/Users/satanshumishra/Documents/DevLabs/.windful-ocean/.claude/lib/superpowers-parallel/{outcome,retry,recovery,derive-clusters,run-engine,prepare-guard}.mjs` and `tests/`.
- Harness contract facts: `2026-07-08-mitosis-3b-engine-surface-map.md`, `2026-07-07-mitosis-resilience-audit-research-brief.md`, `2026-07-07-mitosis-resilience-p2-DESIGN-BRIEF.md`, and `parallel-plan-execution.js` (dynamic-import proof).
- Prior fault-layer design: `2026-07-07-mitosis-resilience-hardening-design.md`.
- External precedent (named, for the disposition semantics; full URLs in the audit brief's citation index): Erlang/OTP supervision (AND/OR, one-for-one), Akka verb set (resume/retry/stop/escalate), Temporal typed Failure + workflow-id reuse + redrive, Camunda incidents, AWS Step Functions redrive, DBOS checkpoint-skip, Reflexion (failed-trial memory), Anthropic "Building Effective Agents" (explicit stopping conditions), the AutoGPT no-breaker cautionary tale, microservices.io Saga, MDN `Promise.allSettled`, CWE-390/392.
