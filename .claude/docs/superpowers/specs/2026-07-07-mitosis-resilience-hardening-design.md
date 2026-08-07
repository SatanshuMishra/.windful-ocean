# Mitosis Resilience Hardening — Design Spec

Date: 2026-07-07
Status: approved design (brainstorm complete); ready for implementation planning
Thread: mitosis-resilience-hardening
Seed: `.claude/docs/2026-07-07-mitosis-resilience-audit-research-brief.md` (verified audit + 4-pillar research, 6-agent pass)
Prior art: `.claude/docs/superpowers/specs/2026-06-29-mitosis-design.md`, `2026-07-02-mitosis-cluster-tier-design.md`, `2026-07-03-mitosis-tier2-execution-runbook.md`
Engine under change: `.claude/workflows/mitosis.js` (845 lines; same inode as `~/.claude/workflows/mitosis.js` — editing the repo path edits live global config)

## 1. Problem

A single failure during a mitosis run can crash the entire workflow — losing potentially millions of tokens of parallel work — and there is no safe way to recover a run after a connection drop or crash. The trigger was a diagnostic run: a gate-scope mismatch and a gate clobber alongside a transient API drop with no fault isolation. The audit (seed brief, Part A) proved those symptoms trace to structural causes verified against `mitosis.js` and the trigger project's git history, cross-confirmed by two independent audit lenses.

Verified failure taxonomy (brief Part A):

| # | Failure | Root cause (`mitosis.js`) |
|---|---|---|
| F2a | Fatal bare awaits | Decompose `:603`, Prepare `:646` — `await agent()` with no try/catch; one transient drop rejects the whole script |
| F2b | Silent-failure (worst) | `parallel()` maps a thrown/dead thunk to `null`; `chainResults.find(r => r && r.halted)` `:841` skips the `null` — a crashed cluster is reported as `{halted:false}` success (CWE-390/392) |
| F2c | Merge-queue poisoning | `mergeQueue = mergeQueue.then(...)` `:664`/`:833`, no `.catch` — one thrown ship blocks every later MSP's merge |
| F2d | No retry | "retry" exists only as English in agent prompts |
| F3 | No safe recovery | zero `resumeFromRunId`/manifest wiring; git effects non-idempotent on replay (`:268`, `:781`, `:812`, `:815`); memory-only `shipped[]` `:663`/`:828` |
| F1-A/C | Repo-wide gate | `fullValidationCmd` over the whole tree `:438-440` blocks an MSP for pre-existing errors it did not introduce |
| F1-B | Gate clobber | Prepare commits+pushes `receipts.config.json` to base guarded only by "skip if equivalent" `:654`; a stricter scoped gate was overwritten by a lax one and pushed (the trigger project's `6214a951`, reverted `1b5f6830`) |

## 2. Diagnosis (BLUF) — "accidental Temporal"

Mitosis already has the shape of a durable, event-sourced execution engine: a deterministic orchestrator (no `Date.now`/`Math.random`/`new Date`), side effects confined to journaled `agent()` "activities," and a native prefix-replay resume (`resumeFromRunId` + `journal.jsonl`, longest-unchanged-prefix caching). It violates the three disciplines that make that shape survivable — truthful failure surfacing, fault isolation, and replay-safe effects. **The fix wires up the safety layer the substrate was built for. It is not a rewrite.** Both audit lenses agreed.

Two harness facts settle prior open questions and constrain the design:
- **`agent()` already retries HTTP transients** internally and returns `null` only after exhausting them (harness Workflow tool contract). A naive inner retry loop would be a second layer — the Google SRE 4³=64 amplification trap. The retry we add is a single application-level re-dispatch, not a retry-within-retry.
- **Journal granularity is whole-`agent()`.** Resume caches at `agent()`-call boundaries and re-runs from the first changed call forward; any interior crash re-runs the entire prompt. This is exactly why every git effect needs an observe-then-converge preamble (Pillar 4).
- **`resumeFromRunId` is same-session only** (harness contract). Cross-session / cold-machine recovery therefore cannot rely on it; it must reconcile from durable git/GitHub state (Pillar 3).

## 3. Design stance and principles

- **Fix in place.** No new orchestration framework; no topology change. Keep the nested double-`parallel()` + serial `mergeQueue`.
- **Preserve orchestrator determinism.** No `Date.now`/`Math.random`/`new Date` in engine code; timestamps and any entropy arrive via `args`. This is what keeps prefix-replay valid.
- **Every effect is a check-before-act against a durable oracle.** Git refs and PR state are the oracles; the house style to copy is the existing `merge-base --is-ancestor` guard at `:811`.
- **The real world is truth; memory and the journal are caches.** Recovery reconstructs shipped-state from `gh`/`git`, never from memory or a manifest alone.
- **Fail loud, never silent.** A run may never report unqualified success if any unit crashed or quarantined. This is enforced as a test, not a convention.

## 4. Core abstraction — the outcome record (threads P1→P3)

Replace today's overloaded `null` / `{ halted }` returns (which conflate *skipped* / *died* / *threw*) with an explicit discriminated union, one record per unit of work (cluster chain, MSP, and each stage):

```
Outcome =
  | { kind: 'shipped',     mspId, prUrl, receiptsPass, d6Pass }
  | { kind: 'halted',      mspId, stage, reason }            // clean, expected stop: gate red, cross-cluster conflict
  | { kind: 'crashed',     mspId, stage, error }             // unexpected throw, OR a null agent() return
  | { kind: 'quarantined', mspId, stage, error, retries }    // retries exhausted; set aside, fleet continues
```

Rules:
- Every stage function (`decompose`, `prepare`, `plan`, `wave`, `boundary`, `shipOneMsp`, `runClusterChain`) returns exactly one `Outcome`.
- At any `parallel()` collection site, a `null` element (a dead or thrown thunk) is *mapped* to `{ kind: 'crashed' }` with whatever identity is recoverable — it is never skipped.
- The engine's final return is always an honest partition:

```
{ shipped: [...], halted: [...], crashed: [...], quarantined: [...],
  overallStatus: 'all-shipped' | 'partial' | 'failed' }
```

`overallStatus` is `all-shipped` only if `crashed` and `quarantined` are both empty and every MSP is `shipped`; `failed` if nothing shipped; `partial` otherwise.

## 5. Pillar 1 — Truthful failure surface (Increment 1)

The foundation: you cannot isolate, retry, or recover failures you cannot see.

1. **Kill the silent swallow** at `:840-841`. After the outer `parallel()` over cluster chains, map every `null` chainResult to a `crashed` outcome, then partition all cluster/MSP outcomes into `shipped / halted / crashed / quarantined`. Build the final honest-partition return (Section 4).
2. **Wrap the shared-fate bare awaits.** `:603` (Decompose) and `:646` (Prepare) each get a try/catch producing a `crashed` outcome and a loud fail-fast return. Pre-fan-out, isolation is meaningless — but the crash must be *reported truthfully*, not rejected into the void.
3. **Durably persist `shipped[]`.** Today it is memory-only (`:663`/`:828`) and lost on crash. Persist each ship transition to the run manifest (Section 7) so the final report and any recovery reflect what actually merged. In Increment 1 this can be the minimal manifest write (append shipped MSP id + PR url); the full manifest schema lands with P3.

### Invariant (enforced as a test)
> The run may never return `overallStatus: 'all-shipped'` (or any unqualified success) if any unit is `crashed` or `quarantined`.

### Acceptance (P1)
- **RED-first regression (the trigger incident):** a test injects a cluster chain that throws/dies (surfaces as `null` from `parallel()`), and asserts the engine returns `overallStatus: 'partial'` naming the crashed MSP — not `{ halted: false }` success. This test is red against current `mitosis.js` and green after.
- A Decompose/Prepare injected crash returns a `crashed` outcome with a clear stage+detail, not an unhandled rejection.

## 6. Pillar 2 — Fault isolation + bounded retry (Increment 2)

Built on P1's outcome record.

### 6.1 Single retry layer — `dispatchWithRetry`
One helper wraps `agent()` dispatch. Signature (conceptual):

```
dispatchWithRetry(prompt, opts, { retryable, sideEffecting, resetRef, maxAttempts = 3, runBudget })
```

Algorithm:
1. Call `agent(prompt, opts)`.
2. On a non-null result → return it.
3. On `null` or a classified-**transient** failure (API drop, timeout, rate-limit surfaced as null after SDK retries) → if attempts remain and the run-level retry budget is not exhausted: back off (full-jitter exponential), apply the idempotency precondition (6.2), and re-dispatch.
4. On a **permanent** failure (gate red, cross-cluster conflict, validation error, schema mismatch) → do not retry; return the corresponding `halted`/`crashed` outcome.
5. On exhausting attempts or budget → return `quarantined`.

Classification is explicit (transient vs permanent); only transient re-dispatches. There is exactly one application-level layer — it never stacks additional HTTP retries on top of the SDK's.

### 6.2 Idempotency precondition (resolves brief Q7)
Before re-dispatching any **side-effecting** agent (`implementer`, `ship`, `prepare`), reset its worktree to the ref captured *before the first attempt*:

```
git -C <worktree> reset --hard <pre-dispatch-ref>
git -C <worktree> clean -fdx
```

Never re-dispatch a mutating agent onto a half-written tree. Read-only agents (`decompose`, `plan`) skip the reset. The pre-dispatch ref is captured by the engine (deterministic; passed to the wrapper), not by the agent.

### 6.3 Bulkheads
- Wrap each `runClusterChain` so an internal throw becomes a `crashed` outcome, never a `null` propagated to `:840`.
- Give each `mergeQueue` link a per-link `.catch` (`:833`) that converts a thrown ship into a `crashed`/`halted` outcome for that MSP only — one bad ship can no longer poison later MSPs' merges (fixes F2c).

### 6.4 Timeouts and deadlines
- Per-dispatch timeout, phase-sized (Decompose/Prepare/Plan/wave/Ship each get a sensible cap), pairing every long dispatch with a hard `timeout` so a hung agent cannot stall the fleet.
- Per-run deadline. On breach, checkpoint the manifest and return an honest partial report (`overallStatus: 'partial'`), resumable later.

### 6.5 Dead-letter quarantine
An MSP that exhausts retries is set aside as `quarantined` with its worktree **preserved** and a redrive hint (branch, last ref, failing stage). The rest of the fleet keeps moving. Quarantined MSPs appear in the final partition and block `all-shipped`.

### 6.6 Shared-fate stages
Decompose and Prepare are pre-fan-out: isolation is meaningless. They use bounded-retry-then **fail-fast loudly** — a permanent failure there stops the run with a truthful `crashed` report and no partial fan-out.

### Acceptance (P2)
- Transient blip injected on one implementer → it re-dispatches (worktree reset first) and the MSP still ships.
- Permanent failure injected on one MSP → it `quarantined`s with worktree preserved, while other clusters complete; final report is `partial`.
- No amplification: assert the wrapper re-dispatches at most `maxAttempts` and does not itself wrap a second retry loop.

## 7. Pillar 3 — Durable recovery (Increment 3, co-shipped with P4)

"Reconcile-first, manifest-as-cache." This is the pillar that saves the tokens.

### 7.1 Two identifiers, kept distinct
- **Harness Workflow runId** (`wf_...`): assigned by the harness per invocation, required by `resumeFromRunId`. Same-session only. Stored in the manifest when known.
- **Logical run-id**: derived deterministically from `hash(spec path + baseBranch)`. Detects "this is a relaunch of the same logical run" and locates the manifest. No entropy, no clock.

### 7.2 Run manifest — `.mitosis/run.json`
```
{
  logicalRunId, harnessRunId, spec, repoRoot, baseBranch, sourcePrefix,
  phase,                       // last completed phase boundary
  clusters: [[mspId, ...], ...],
  msps: [
    { id, status,             // planned | in-progress | shipped | halted | quarantined
      integrationBranch, prUrl, dependsOn, fileScope }
  ]
}
```
- **Location:** `.mitosis/run.json` in the target repo, **gitignored** (Prepare adds `.mitosis/` to `.gitignore`). It is ephemeral machine run-state, categorically distinct from the committed continuity ledger (resolves brief Q8). The manifest may point *to* a ledger thread; the ledger never depends on the manifest. No authority overlap.
- **Checkpoint cadence:** written at every phase boundary — after Decompose, after Prepare, and on each MSP's plan/wave/boundary/ship transition.

### 7.3 Reconcile-first, then replay (startup procedure)
On launch, if a `.mitosis/run.json` with a matching logical run-id exists (a relaunch):
1. **Do not trust the manifest.** Reconstruct the shipped-set from the real world:
   - `gh pr list --state merged --base <baseBranch> --json headRefName,url,mergedAt`
   - `git log origin/<baseBranch>` for the merged integration-branch tips.
   Treat this reconciled set as truth.
2. **Correct the manifest** against reconciled truth (entries that disagree are overwritten; the manifest is a hint that can lie if a crash struck mid-write).
3. **Replay:** skip already-merged MSPs; resume the fleet for the remainder.
   - **Same-session fast path:** if the harness runId is still valid, pass it to `resumeFromRunId` so journal prefix-replay returns cached `agent()` results instantly.
   - **Cross-session / cold-machine path:** the journal and harness runId are gone; rebuild from the reconciled manifest and re-enter the fleet at the first unshipped MSP. The merged-PR done-oracle (Pillar 4) outranks both manifest and journal at every ship.

### 7.4 Planned checkpoint-and-exit / continue-as-new
- Before starting a new MSP, if `budget.remaining()` is below a threshold, checkpoint the manifest and exit with a resumable partial report ("relaunch to continue").
- If a script edit invalidates the journal prefix (continue-as-new), fall back to manifest+reconcile rather than trusting stale journal cache.

### Acceptance (P3)
- Kill a run after 2 of 4 MSPs have merged; relaunch. Assert it reconciles the 2 merged from `gh`/`git` (not memory), skips them, completes the remaining 2 — with no re-run of merged work and no divergent fresh Decompose.
- Corrupt the manifest to claim an unmerged MSP is shipped; assert reconcile overrides it and the MSP is actually shipped.

## 8. Pillar 4 — Replay-safe effects + non-clobbering gates (Increment 3)

Removes the causes observed and makes resume *safe* to run.

### 8.1 Done-oracle-first ship step
Command #1 of `shipOneMsp` becomes: "is this MSP's PR already merged?" (`gh pr view --json state,mergedAt`, or the reconciled merged-set). If merged → skip-and-report `shipped`. This closes the one silent-corruption path: re-rebasing onto a base that already contains the squash produces a garbled second PR, today misdiagnosed at `:812` as a human-resolve conflict.

### 8.2 Observe-then-converge preamble on every git effect
Each git side effect becomes a check-before-act block against a durable oracle (ref SHA / PR state), written as **exact command blocks, not prose**, in the agent dispatch instructions. Sites and their oracles:

| Site | Effect | Oracle / guard |
|---|---|---|
| `:268` | worktree add | does the worktree/branch already exist at the expected ref? |
| `:781` | branch force | is the branch already at the intended SHA? |
| `:411-417` | wave merge | is the wave commit already an ancestor of the integration branch? |
| `:812` | push | is `origin/<branch>` already at head? (fast-forward vs already-published) |
| `:813` | PR create/reuse | does an open PR for head→base already exist? |
| `:815` | squash-merge | is the PR already merged? (8.1 done-oracle) |
| `:646-654` | Prepare commit/push to base | is the config already present and equivalent-or-stricter? (8.5 refuse-to-weaken) |

Pattern to copy: the existing `merge-base --is-ancestor` guard at `:811`. Result: every git effect is idempotent under whole-`agent()` replay.

### 8.3 Compensation policy
- Local / never-pushed state → destructive `git reset` / `git worktree remove` is allowed.
- Shared / pushed state → forward-only `git revert`; **never** history rewrite on shared refs (Saga compensation).

### 8.4 Betterer gates (replaces the repo-wide validation)
The gate mechanism is Betterer — one unified snapshot tool that tracks lint, types, and tests that "must get better," accepting the added dependency in target repos.
- **Install (Prepare):** add Betterer to the target repo — `.betterer.ts` config with the TypeScript tester, the ESLint tester, and a test-suite tester; commit the `.betterer.results` snapshot to base as the baseline.
- **Gate (boundary/ship):** run `betterer ci`, which **fails only if the snapshot got worse** (new issues introduced by this MSP) and passes if same-or-better. This replaces `fullValidationCmd` over the whole tree (`:438-440`), which blocked MSPs on pre-existing errors they did not introduce (F1-A/C). The committed results file *is* the "new vs pre-existing" baseline.
- **Backstop:** the G9 full-suite (receipts red→green + D6 dependents) remains the final gate at squash-merge — Betterer narrows *which* failures block an MSP; it does not remove the final full-suite backstop.
- Exact Betterer version and tester packages are pinned at plan time.

### 8.5 Prepare = write-only-if-absent + read-and-adopt + refuse-to-weaken (fixes F1-B)
This incident is accidental indirect Poisoned-Pipeline-Execution (OWASP CICD-SEC-04). Prepare must:
- **Read** any existing `receipts.config.json` / Betterer config and **adopt** it rather than overwrite.
- **Write only if absent.**
- **Refuse to weaken (fail closed):** if Prepare's intended config would relax an existing stricter gate, return `ready: false` with a detail naming the conflict — never clobber-and-push. The base commit+push (`:654`) is additionally guarded by the observe-then-converge preamble (8.2).

### Acceptance (P4)
- Replay a ship whose PR already merged → it skips (no second, garbled PR).
- An MSP touches a file with pre-existing lint errors but adds none → passes `betterer ci`.
- Prepare run against a repo with a stricter existing config → fails closed (`ready: false`), does not clobber or push.
- Any git effect re-run after a simulated interior crash → idempotent (no duplicate branch/PR/merge).

## 9. Sequencing and increments

Delivery is staged; each increment leaves the engine strictly better and is independently shippable.

1. **Increment 1 — Pillar 1** (truthful failure surface + outcome record + minimal shipped-persistence). Merges first; it is the correctness foundation and unblocks the rest.
2. **Increment 2 — Pillar 2** (fault isolation, `dispatchWithRetry`, idempotency reset, quarantine, timeouts). Built on Increment 1's outcome record.
3. **Increment 3 — Pillars 3 + 4** (durable recovery + replay-safe effects + Betterer gates + Prepare fail-closed). P3 and P4 co-ship: recovery is only *safe* to resume once effects are idempotent.

## 10. Testing strategy

- **Extract pure decision logic** into small, injectable functions and test them deterministically with fakes for `agent()`, `git`, and `gh`:
  - outcome partitioning + `overallStatus` computation,
  - retry classification (transient vs permanent) and budget accounting,
  - reconcile-diff (real-world merged-set vs manifest),
  - refuse-to-weaken config comparison.
- **Git-effect idempotency** is tested against a **local throwaway git repo** (local disposable, no remote or live project — within the test-only-local exception). Exercise each observe-then-converge preamble by running the effect twice and asserting idempotence.
- **Red-first:** each increment opens with a test reproducing the failure (trigger-incident-style) that is red against current `mitosis.js` and green after. This satisfies the test admission gate — new behavior, asserted through the engine's returned report (a public surface), not implementation details.

## 11. Implementation approach and review

- **Hand / Opus-driven, all four pillars.** No dogfooding: mitosis is never run on itself during the hardening. Direct Opus-driven edits with `code-reviewer` on every increment and `+ security-reviewer` on Pillar 4 (git effects + CI-config surface, per the CICD-SEC-04 exposure).
- **Branch:** work lands in the dotfiles repo (`feat/claude-config-migration`, or a dedicated `feat/mitosis-resilience` branch decided at plan time); edits at `.claude/workflows/mitosis.js` are edits to live global config (shared inode).
- **Commits and pushes only on explicit user request** (global git rule; overrides the brainstorming skill's auto-commit default).

## 12. Non-goals / out of scope

- No rewrite of the orchestration topology; no new execution framework.
- No fix to the trigger project itself — the engine is the target, the trigger project was only the diagnostic trigger.
- No change to the D1 decomposition or cluster-derivation logic beyond what truthful outcomes and idempotent effects require.
- No dogfooding of mitosis during the hardening.

## 13. Open items deferred to plan time

- Exact Betterer version + tester package set, and the shape of the test-suite tester.
- Concrete timeout values per phase and the run-level retry/deadline budget defaults.
- Whether Increment 1's minimal manifest write is folded forward into P3's schema as one file from the start (recommended) or introduced minimally then expanded.
- Branch name for the hardening work.

## 14. Citations

Full verified URLs live in the seed brief's citation index and the six 2026-07-07 agent reports (`.claude/docs/2026-07-07-mitosis-resilience-audit-research-brief.md`, Part D). Load-bearing sources by name, grouped:
- **Truthful surface:** MDN `Promise.allSettled`; CWE-390 / CWE-392.
- **Fault isolation + retry:** Google SRE (cascading failures, layered-retry amplification); AWS backoff-and-jitter; Azure Retry / Bulkhead / Circuit-Breaker; Erlang/OTP supervision; AWS SQS DLQ; Stripe idempotency.
- **Durable recovery:** Temporal (workflow-id reuse, continue-as-new, activities, determinism); Azure Durable Functions code constraints; Airflow metadata-DB / catchup; PostgreSQL WAL + checkpoint; K8s controllers; Terraform refresh; NERSC checkpoint/restore.
- **Replay-safe effects:** Temporal determinism/idempotency; AWS Builders' Library idempotent APIs; git-scm (worktree/branch/merge/push); GitHub REST pulls/merge-state; microservices.io Saga.
- **Gates:** Betterer; SonarQube Clean-as-You-Code; Nx affected; ESLint bulk suppressions; git-scm three-dot diff; OWASP CICD-SEC-04; GitHub CODEOWNERS.

In-repo claims are grounded to `.claude/workflows/mitosis.js` line numbers throughout (Section 15).

## 15. `mitosis.js` line index (change sites)

`:268` worktree add · `:347` implementer · `:382` wave barrier · `:411-417` wave merge · `:438-440`/`:448-450` boundary full-validation · `:461-464` boundary halt · `:603` Decompose agent (fatal) · `:646-654` Prepare agent + receipts commit/push (fatal + clobber) · `:663`/`:828` memory-only `shipped[]` · `:664`/`:833` mergeQueue (poisonable) · `:781` branch force · `:804-830` `shipOneMsp` · `:811` `merge-base --is-ancestor` guard (good pattern to copy) · `:812` push · `:813` PR create/reuse · `:815` squash-merge · `:840-841` outer `parallel()` + silent-swallow `find`.
