# Mitosis Optimization — Design Spec

- Date: 2026-07-17
- Status: Draft (awaiting user review before plan/execution)
- Branch: feat/mitosis-robustness
- Provenance:
  - Diagnostic report: `.claude/reports/mitosis-optimization/2026-07-17-research-token-cost-audit.html`
  - Exhaustive audit run: workflow `wf_817702d1-a8c` (88 agents, 46 issues verified against current code, every proposed cut adversarially refuted; ~5.96M tokens)
  - Prior decisions consolidated: `.claude/ledger/decisions/2026-07-15-mitosis-review-optimization.md`, `2026-07-15-mitosis-model-selection-policy.md`, `2026-07-15-mitosis-throughput-parallelism.md`
  - Prior in-repo audits: `.claude/ledger/analysis/2026-07-15-mitosis-{throughput-audit,review-and-tiering-audit,model-selection-architecture}.md`

## 0. BLUF

The `/mitosis` engine burns ~10M tokens/run at ~65-70% completion. Two code-verified root causes explain the bulk of the waste, and **neither buys any robustness**:

1. **R-A — the Sonnet model tier is dead code.** `dependentCount` and `edgeReasons` are computed in `derive-edges.mjs:113-114` but dropped by both task-map builders (`generate-run-script.mjs:118`, `mitosis.js:3402`). `policySignalAmbiguous` (`mitosis.js:864`) requires `Number.isInteger(task.dependentCount)`, so it returns true for every real task and `policyModelFor` (`mitosis.js:873`) returns `opus` unconditionally. The A8 flip (`d4d3704`) is inert; the Sonnet→Opus escalation ladder and the `breakingContract`/`blastRadius` categorical gates are transitively dead. Unit tests pass only because `policy-model.test.mjs` synthesizes `dependentCount` into fixtures — the real `derive-edges → builder → policyModelFor` seam is untested.
2. **O-A — the Final review is inert.** `result.finalReview` is written (`mitosis.js:1189`, `run-engine.mjs:457`) and read by no code. Its deletion was locked in decision R7-1 (2026-07-15) and never landed.

This spec **adopts** the token cuts that leave the robustness floor intact, **defers** the redesigns that need a capability probe or a validation run, and **rejects** every cut that would thin the floor. It also installs the missing governance guardrails that let R-A and O-A exist in the first place.

The objective is **not a token cap**. It is the elimination of spend that buys no robustness. If a unit of work genuinely needs the tokens to be correct, spending them is correct.

## 1. Guiding constraints (authoritative; override any conflicting recommendation below)

These are the user-locked constraints. Where any workstream detail conflicts with them, they win.

- **C1 — Two models only. Haiku is NEVER used.** Only Opus and Sonnet. Every prior "Haiku" recommendation from the audit is realized as **Sonnet** (a strict robustness upgrade; the material savings are Opus→Sonnet, not Sonnet→Haiku).
- **C2 — Model-selection rule.** Use **Opus** whenever reasoning is required and/or the cost of a mistake is high. Use **Sonnet** where no reasoning is necessary, the task is already thoroughly planned, or the cost of a mistake is low.
- **C3 — Conscious failure remediation.** On failure, mitosis must make a conscious effort to identify the issue, remediate, and re-dispatch. A single failure must never derail a multi-million-token workflow, but it must also never be silently swallowed. Fail-closed isolation (park) plus bounded remediation is the posture.
- **C4 — Three Pillars.** Quality/Robustness > Optimization (tokens) > Speed. Never trade a higher pillar for a lower one. `~/.claude/rules/common/pillars.md`.
- **C5 — Recommended merges/commits are pre-approved** for this initiative (local commits; push remains gated on the separate leak-remediation work and is out of scope here).

## 2. The robustness floor (invariants that MUST NOT be thinned)

Every change in this spec preserves all of these. Several changes strengthen them. Any future proposal that weakens one is rejected by construction.

- **F1** — Deterministic CI (receipts + test suite + boundary check / D6 composed gate) is the **sole merge authority**. LLM review is advisory input to a gate, never a parallel re-adjudicator.
- **F2** — The **human merge gate** is inviolable. The engine never merges to a shared branch on its own authority.
- **F3** — **Security review** runs as an independent lens on every security-relevant diff, pinned to Opus.
- **F4** — **Fail-closed park** on ambiguity, error, timeout, or exhausted remediation budget. Degradation is always toward the safe/expensive path, never toward a silent merge.
- **F5** — **Worktree isolation** per unit of work (load-bearing per the CAID ablation; soft isolation scores below single-agent).
- **F6** — The single **boundary check** on the fully-integrated tree remains the gate that converts a failed integration into a halt.

## 3. Model policy (realizes C1/C2)

The policy is engine-enforced, not prompt-suggested. It has one deterministic dimension (categorical gates) and one discretionary dimension (signal-driven).

### 3.1 Force-Opus categorical gates (cost-of-mistake HIGH)

A task resolves **Opus** if ANY hold: `sensitiveScope`, `irreversible`, `breakingContract`, `blastRadius >= 3`, `risk === 'high'`, `planIncomplete`. These gates must be fed live signals (see WS-2) — today they are transitively dead.

### 3.2 Fail-closed ambiguity (cost-of-mistake UNKNOWN → treat as HIGH)

`policySignalAmbiguous` resolves **Opus** if the routing signals are absent or internally inconsistent. New rule: `dependentCount` present while `edgeReasons` absent (partial threading) is treated as ambiguous → Opus, so a builder that drops one field cannot silently route contract-breaking work to Sonnet with `breakingContract` disabled.

### 3.3 Discretionary Sonnet (already-planned AND cost-of-mistake LOW)

A task resolves **Sonnet** only when no categorical gate fires, signals are complete and unambiguous, and it is a low-risk / reversible / low-blast implementer against an already-approved plan. On any downstream review or CI failure, it escalates to Opus (C3).

### 3.4 Dispatch-site model assignments

| Dispatch | Model | Rationale (C2) |
|---|---|---|
| Discretionary low-risk implementer | Sonnet | Already-planned, low cost of mistake; escalates on failure |
| Categorically-gated / ambiguous implementer | Opus | Reasoning + high cost of mistake |
| Per-task review-FIX loop (`mitosis.js:1030`, new `kind:'fix'`) | Sonnet | Fix is fully specified by the review that precedes it; re-verified by the next Opus review → low cost |
| Code / spec (merged) review | Opus | Judgment; verifier ≥ generator |
| Security review (independent lens) | Opus | F3; Fable can refuse benign security work |
| Plan review — trivial single-file, low-blast, non-sensitive MSP | Sonnet | Low reasoning, low cost |
| Plan review — multi-file / sensitive / high-blast MSP | Opus | Reasoning + high cost |
| Boundary gate, boundary-fix, boundary-recheck | Opus | Floor gate; high cost |
| Integrate / merge decision | Opus | Floor gate; high cost |
| Scope-fence dispatch (`mitosis.js:1110`) | Opus (interim) | Feeds a fail-closed completeness gate; down-tier deferred to D6 pending deterministic re-verification |
| Decomposer / planner / parallelize | Opus | Reasoning |
| Diagnostician (remediation reasoning) | Opus | Reasoning; high cost |
| Read-only probes (prepare-probe, plan-probe, ship-verify read-back) | Sonnet | Mechanical; low cost |
| Journal / checkpoint appends + checkpoint-push | Sonnet | Append-only clerical |
| Merge-watch poll (`mitosis.js:3650`) | Sonnet (interim) | Clerical poll; prefer deterministic engine-side poll (deferred) |

**Routing telemetry (mandatory):** every run logs `model routing: opus=N sonnet=M ambiguous(reason)=K`. A run that is 100% ambiguous or 100% Opus emits a loud warning — the fail-closed-to-expensive path is the one failure mode that never screams (guardrail G1).

## 4. Workstreams (ADOPT)

Every engine change lands atomically across **both twins** (`mitosis.js` inline + `lib/superpowers-parallel/*.mjs`) and updates its asserting tests in the same commit. A single-file edit that leaves the mirror stale ships a red suite (once WS-0 wires CI).

All `file:line` anchors in this spec are as-of the audit snapshot (2026-07-17); the implementer re-confirms each against live code at edit time — on any drift, the code wins. All threshold parameters written as `N` (staleness days, round-trip budgets) are operator-configurable, defaulted at implementation.

### WS-0 — Prerequisite: wire the deterministic backstop + commit the pending CRITICAL fix

Closes critique blocking-gap #1 and recurring-mistakes G4/G6. **Gates every subsequent twin-editing workstream** — without it, a half-landed twin edit passes a green local run.

- **WS-0.1** — Add a CI workflow (`.github/workflows/test.yml`) that runs `node --test .claude/lib/superpowers-parallel/tests/` on push/PR, including `mirror-guard.test.mjs`, `gh-scope-lint.test.mjs`, and the full lib suite. Add a lightweight repo-root test entrypoint (a `package.json` with a `test` script invoking `node --test`, or a `Makefile`/script) so the runner is discoverable and stable.
- **WS-0.2** — Add a pre-commit hook (husky or a plain `.git/hooks/pre-commit` committed via a bootstrap script) running the same suite, so a stale twin is caught before commit, not only in CI.
- **WS-0.3** — Commit the pending CRITICAL gh-scope-lint fix already in the working tree (`mitosis.js`, `recovery.mjs`, `saga.mjs` modified; `gh-scope-lint.test.mjs` untracked). The implementer must first confirm the working-tree diff is exactly the gh-scoping fix and nothing unrelated, then commit atomically. This is guardrail G6 (a confirmed CRITICAL fix must not live only as uncommitted working-tree state — one `git reset --hard` would erase it while the ledger says "done").
- **Acceptance:** CI is green on a clean checkout; deliberately staleing one twin turns the suite red locally and in CI; the gh-scope fix is committed with its red-before/green-after receipt recorded.

### WS-1 — Dead-code & inert-substrate deletion (Group 4; correctness-positive)

Sequenced first among code changes (guardrail G2: a zero-behavior-change deletion is the cheapest, safest commit). Each deletion lands atomically across twins with its asserting test updated.

- **WS-1.1** — Delete `dispatchWithRetry` (`mitosis.js:181-196`) and its now-unreferenced helpers; at the call site drop the ignored `isPermanent`/`maxAttempts` options. Live retry resilience stays entirely in `supervisedDispatch` (tier-0 transient budget + remediation + fail-closed quarantine) — verify no live caller before deleting.
- **WS-1.2 — `maxAttempts` becomes honest.** Do NOT leave it validated-but-ignored (a validated-but-ignored bound is itself a robustness hazard — an operator believes they capped retries). **Wire it into `supervisedEngineDispatch`** as the operator-facing bound on remediation attempts (aligns with C3: bounded remediate-and-re-dispatch). The coordinated twin edit spans `mitosis.js` + `retry.mjs` + `run-engine.mjs`; every mirror-guard assertion must stay green (a half-edit silently defaults `run-engine` retry budget to 1 → immediate quarantine).
- **WS-1.3** — Delete the per-attempt `compensate` plumbing that never executes (the 7 wirings whose `await deps.compensate` result is discarded) but **keep** `undoCommandList`/`registerEffect`/`compensationStack` and `saga.mjs`'s `perAttemptCompensation` primitive.
- **WS-1.4** — Remove `models.implementer`/`models.fixer` from the accepted operator keys, OR wire them honestly through `policyModelFor` — but **not** as downgrade levers that bypass the policy. **Resume back-compat (critique gap #4):** gate the loud-reject on the reconcile/resume path first — an in-flight run or persisted `run.json` carrying those keys (valid under old code) must not hard-fail relaunch via `fatalReport`. Use an ignore-with-warning migration path for legacy manifests.
- **WS-1.5** — Cut the redundant built/ship checkpoint delta-appends (built is derived from refs, shipped from `gh`) OR fold the single-line append into the already-running adjacent agent. **Keep** the checkpoint ref push and `persistParkCheckpoint`.
- **WS-1.6 — Authoritative-substitute for the constant-echo guards.** Convert the guards that currently *park on* non-safety LLM transcription drift into orchestrator-overwrites-known-constants (mirror `authorTaskModels` at `mitosis.js:3494`), keeping structural validation of agent-computed tasks/waves/prompts. **Keep a logged drift canary** on the substituted constants (critique gap #8 / o-k) so a corrupt hand-copy remains observable rather than silently normalized.
- **WS-1.7** — Delete vestigial `deriveClusters`/`assembleRunReport` (computed/logged, unconsumed since `f3ffefb`).
- **WS-1.8 — Informed diagnostician retry.** Give the second attempt the rejected mechanism so it does not re-sample byte-identically. **Preserve freedom to escalate to needs-human** (critique gap #7 / r-j): the prompt must not force "propose a DIFFERENT mechanism" so hard that the model fabricates a novel-but-wrong fingerprint that passes `isValidFingerprint` + `!hasTried` and burns a compensate+redispatch. De-dup the two verbatim copies targeting the **live inline copy** (`mitosis.js` `runRemediationLoop` ~2624) behavior-identically.
- **WS-1.9 — Zero-live-caller lint (guardrail G3).** Add a dead-export / zero-caller check (ts-prune-style for the `.mjs` lib plus a caller-count check against `mitosis.js`) to the suite so a 0-caller export fails deterministically instead of awaiting an Opus review.
- **Acceptance:** suite green across twins; no live caller loses a behavior; `maxAttempts` provably bounds remediation (test); legacy-manifest resume does not hard-fail; drift canary fires on an injected corrupt constant.

### WS-2 — Activate the Sonnet tier (Group 1; highest-token lever)

Depends on WS-0 (CI backstop for the twin edits).

- **WS-2.1 — Thread BOTH signals together.** Add `dependentCount` AND `edgeReasons` to the field-pick at `generate-run-script.mjs:118` and the parallelize prompt at `mitosis.js:3402`. They must be threaded as a pair; a partial thread is a robustness hazard.
- **WS-2.2 — Fail-closed partial state** (§3.2): `policySignalAmbiguous` treats `dependentCount` present + `edgeReasons` absent as ambiguous → Opus.
- **WS-2.3 — Schema-require both signals** in the `engineArgs` invariant block so a builder that drops a field parks the run loudly (guardrail G1: any new producer field must update every whitelist/schema that reshapes the object, or fail loudly).
- **WS-2.4 — New `kind:'fix'` discriminator (critique blocking-gap #2).** The per-task review-fix at `mitosis.js:1030` currently shares `kind:'engine'` with fence (`:1110`), integrate/merge (`:1135`), boundary (`:1171`), boundary-fix (`:1178`), boundary-recheck (`:1181`). Introduce a distinct `kind:'fix'` for the review-fix loop so routing it to Sonnet does NOT down-tier the floor gates, which stay Opus. Enumerate every `kind:'engine'` site and assign its model per §3.4 explicitly.
- **WS-2.5 — Activation-receipt test (guardrail G1).** An end-to-end integration test piping REAL `derive-edges` output through the ACTUAL builder into `policyModelFor`, asserting: a clear low-risk implementer resolves `sonnet`; a contract-breaking / high-blast task resolves `opus`; the partial state (`dependentCount` present, `edgeReasons` missing) resolves `opus`. This replaces the fixture-synthesized `policy-model.test.mjs` seam that hid R-A.
- **WS-2.6 — Routing telemetry** (§3.4) with the 100%-ambiguous / 100%-Opus loud warning.
- **WS-2.7 — Escalation redesign (r-f / o-i).** The escalated attempt receives attempt-1's review issues instead of re-deriving them, and does not re-run the entire pipeline from scratch. (If the Sonnet tier were instead retired, this branch would be deleted as dead — but per C1/C2 we are activating it.)
- **Residual risk (critique gap #3, accepted within the A8 envelope):** `breakingContract` reads agent-authored `edgeReasons` and is therefore probabilistic — a contract-breaking task not independently caught by `sensitiveScope`/`irreversible`/`blastRadius>=3`/`risk=high` is not guaranteed Opus. Mitigations: (a) fail-closed on missing/ambiguous `edgeReasons` → Opus; (b) any `edgeReasons` signalling interface/contract/public-API touch forces Opus; (c) C3 escalation on review/CI failure recovers an under-classified task. The spec states this explicitly rather than assuming it away.
- **Acceptance:** activation-receipt test green; telemetry shows a non-trivial Sonnet fraction on a real low-risk-heavy run; a synthetic contract-breaking task routes Opus; floor gates provably still Opus after the `kind` split.

### WS-3 — Review architecture (Group 2)

Depends on WS-2 (`kind:'fix'`). The final-review deletion (WS-3.1) is a pure zero-enforcement-change deletion and must precede any finalReviewer prompt work in WS-5 (dependency p-j → o-a).

- **WS-3.1 — Delete the inert final review** in both twins; update `run-engine.test.mjs:66` to assert its absence. **CRITICAL structural guard:** preserve the `if (boundary && boundary.pass) { ... } else { halted }` structure — delete only the `finalReview` body inside the `if`, keep the `else`-halt (it is the sole converter of a failed boundary into a halt = F6). Deleting the whole if/else would let a boundary-FAILED MSP ship.
- **WS-3.2 — Collapse the high-risk path 3→2 lenses.** One `reviewLoop` over the existing `mergedReviewPrompt` (`mitosis.js:993`, which is literally the concatenation of the spec + quality prompts) plus the independent `securityReviewPrompt` loop. **Do NOT fold security into the merged prompt** (that would thin F3) — this is the rejected literal "triplicated read → one read" framing.
- **WS-3.3 — Reviewer scoping.** Put "skip what CI already enforces (lint / format / types / failing tests)" into every reviewer dispatch prompt (Anthropic Code Review guidance; completes neutral, never merge authority).
- **WS-3.4 — Optional round-trip budget.** Budget review+fix round-trips against `runBudget` with a fail-closed park on exhaustion (C3). Down-tier only the mechanical fix (WS-2.4, re-verified by the next Opus review) — every judgment review stays Opus.
- **Acceptance:** boundary-halt preserved (test); security remains an independent lens; final review provably gone; a budget-exhausted review loop parks rather than merges.

### WS-4 — Plan-review & decomposer right-sizing (Group 3; unblocked by C2)

Open Q1 (R7-4 vs the blanket Opus pin) is resolved by C2: plan review is risk-scaled — trivial low-blast MSPs → Sonnet, sensitive/multi-file/high-blast → Opus. Mark the losing same-day decision superseded (guardrail G2).

- **WS-4.1 — Flip the plan-review bias.** Require a concrete named finding to return needs-changes; make non-empty findings a structural precondition. **Fail-closed:** an empty-findings non-approval, or an unparseable verdict, is treated as approve-then-re-review-once — never silently as approve.
- **WS-4.2 — Risk-scale the plan-review model** per §3.4 (single non-iterating Sonnet pass for trivial MSPs; full adversarial Opus loop otherwise).
- **WS-4.3 — Seed the planner with ground truth.** Provide the approved spec path and this MSP's `msp.fileScope` as a verify-against-live-code hint, fenced to this MSP's slice. Park to re-decompose if the spec reveals the decomposition is wrong; forbid expanding into sibling-MSP territory (keeps the `dependsOn` ordering the boundary assumes intact; a scope collision surfaces as a merge conflict / CI failure / park, never a silent bad merge). `fileScope` is a hint to verify, not a trust boundary.
- **Acceptance:** an uncertainty-only plan review no longer manufactures a replan; a real named defect still triggers replan; trivial MSP plan review runs Sonnet; scope collision parks.

### WS-5 — Deterministic-ize mechanical dispatches + prompt distillation (Group 5 adopt-now)

Depends on WS-2 (`kind` discriminators) and WS-3.1 (final review deleted, for the finalReviewer distillation dependency). All "Haiku" from the audit → **Sonnet** (C1).

- **WS-5.1 — Down-tier clerical dispatches to Sonnet:** read-only probes (prepare-probe, plan-probe, ship-verify read-back), the four checkpoint journal appends + checkpoint-push, and the merge-watch poll (`mitosis.js:3650`). Hold branch-prep and scope-fence at Opus/floor per §3.4 (destructive git / completeness gate).
- **WS-5.2 — Template byte-copy.** Replace prompt-embedded template bytes with copy-from-source (`cp TEMPLATES_DIR/receipts.yml ...`); conditionalize the template fetch to the bootstrap case only. Removes two LLM fidelity hops (robustness-positive).
- **WS-5.3 — Fold the run-log via a node CLI** the agent executes (deterministic parse); the engine re-validates via `parseRunManifest` and fail-closes to null.
- **WS-5.4 — Distill worker-facing prompts.** Strip dispatcher-facing scaffolding (Task-tool YAML wrappers, template headers, placeholder legends, the finalReviewer 35-line example) while **preserving** the TDD contract, the `DONE`/`DONE_WITH_CONCERNS`/`BLOCKED`/`NEEDS_CONTEXT` status-token contract (`sanityWarnings` enforces it), the review criteria, and the verdict format. **Snapshot-pin** the distilled prompts so an upstream plugin update cannot re-inject scaffolding. finalReviewer distillation only after WS-3.1.
- **Acceptance:** clerical dispatches run Sonnet; status-token contract intact (test); no template transmitted through model output; prompt snapshot test guards against scaffolding re-injection.

### WS-6 — Throughput & completion cheap wins (Group 6 adopt-now)

- **WS-6.1 — Critical-path ready-set ordering.** Rank the ready-set by downstream-dependent-count / test-unlocking value instead of treating it as unordered. **Verify first (critique gap #6):** confirm the live scheduler currently treats the ready-set as unordered before claiming the ~0-token completion gain — the premise is research-derived (CAID: same-config completion swung 8.7%→34.3% purely on critical-path assignment) and code-unverified. Changes dispatch order only; leases, isolation, CI unchanged.
- **WS-6.2 — Base-census cache on boundary recheck.** Thread the base census forward, keyed on the immutable `fingerprintBase` (which cannot move mid-run); recollect only the HEAD census. Preserve the base config-strictness comparison so a suppression-based fake-fix cannot pass recheck.
- **Acceptance:** ready-set ordering verified-then-applied; boundary recheck no longer re-materializes the base worktree; base strictness comparison retained (test).

### WS-7 — Governance guardrails (process; can parallel WS-1)

Installs the discipline that would have prevented R-A and O-A (recurring-mistakes G2/G5/G7).

- **WS-7.1 — Ledger status split.** Distinguish `accepted-direction` from `landed:<commit-hash>`; a decision may not claim shipped behavior without a hash. When a new decision narrows/reverses a prior one, flip the prior to `superseded-by` in the same session (the R7-4-vs-model-policy conflict violated the existing write-once discipline).
- **WS-7.2 — Session-start ledger lint** flagging `accepted-direction` decisions older than N days with no landing commit, and any `const X_ENABLED = false` older than N days with no reachable true-path from the production call graph (guardrail G7).
- **WS-7.3 — Review-layer admission gate (documented).** Any new LLM review layer must state (a) the property it checks that no deterministic gate covers, and (b) the code path that READS its verdict and changes behavior on failure. A review whose output has no consumer is deleted by construction (this is exactly what O-A was).

## 5. Consolidated build order (closes critique gap #9)

Dependency-ordered. WS-0 first and blocking; WS-7 may run in parallel with WS-1.

1. **WS-0** (prereq) — CI + pre-commit wiring; commit the gh-scope fix. Everything else depends on the CI backstop.
2. **WS-1** + **WS-7** (parallel) — deletions and honest-`maxAttempts`; governance guardrails. Deletions first (cheapest, safest).
3. **WS-2** — Sonnet-tier activation (needs the `kind:'fix'` split and the CI backstop).
4. **WS-3** — review architecture (needs `kind:'fix'`; final-review deletion is the pure-deletion prerequisite for WS-5.4).
5. **WS-4** — plan-review + decomposer (needs the policy plumbing from WS-2).
6. **WS-5** — mechanical down-tiering + prompt distillation (needs WS-2 discriminators, WS-3.1).
7. **WS-6** — critical-path ordering + base-census cache (independent; can slot after WS-0, sequenced last to keep the diff surface small).

This spec is SPEC-shaped and multi-unit; execution routes through the `mitosis` skill itself (decompose into MSPs, worktree isolation, serialized human-gated merges) once the plan is written. Note the reflexive risk and validate the engine after each landed workstream.

## 6. Deferred (with explicit decision gates)

Nothing here ships without its gate cleared. Each is captured so it is not silently dropped.

- **D1 — In-process parallelize assembly (R-I).** Orchestrator reads `.graph.json`, calls `resolveAll`/`validateGraph`/`planRoute`/`buildEngineArgs` directly. Gate: confirm the workflow host grants `fs` + dynamic `import()` (open Q4). Pillar-1-positive (removes LLM non-determinism from a ~13.8KB blob round-trip). If unavailable, the WS-5 down-tiering is the ceiling.
- **D2 — Deterministic boundary census (O-F).** Extract the census+diff into `boundary-census.mjs`; keep the boundary-FIX as an LLM task. Gate: same host-capability probe; keep validation of the untrusted `graph.json`.
- **D3 — Streaming-dispatch flip.** `STREAMING_DISPATCH_ENABLED` is `const-false` with no runtime enable path. Gate: add a runtime enable path (engine input / env var) AND run a Mitosis validation A/B (no literature settles wave-vs-streaming) AND attach a dated flip-or-delete follow-up.
- **D4 — Resume skip-parallelize + per-wave completion checkpoint.** Tier-1: probe a durable `.graph.json`, mirror the plan-probe fail-closed park, guarded on `origin/base HEAD == the base SHA recorded at park`. Tier-2: per-wave pass-state checkpoint + resume-at-first-unfinished-wave. Gate: must fail-closed to a full re-run when the base moved since park; single boundary check + CI + human gate remain sole authority on the integrated tree. (This eliminates the single largest relaunch drain: multi-million-token re-derivation + re-execution of already-passing waves.)
- **D5 — Frontier-train build-ahead (O-Q; decision 2026-07-16 exists, uncommitted).** Gate: persist parent-tip SHAs in built checkpoints (currently `sha:null`); bind ship-time combined-CI-on-real-merged-base and lease-overlap re-enforcement as inviolable acceptance conditions.
- **D6 — Down-tier fence/merge to Sonnet.** Gate: add engine-side deterministic re-verification (re-run `merge-base --is-ancestor`; independently enumerate `git status`) so a cheaper-model result that drives control flow is re-checked. Until then fence/merge stay Opus (§3.4).
- **D7 — Two-axis model×effort routing (open Q3).** Run policy-pinned-but-mechanical Opus stages at `effort=medium` (Anthropic reports Opus-at-medium ~ Sonnet-max at ~76% fewer output tokens) without changing tier or thinning verifier≥generator. Gate: a small experiment before speccing; out of scope for this pass.
- **D8 — Git-plumbing fold (p-f; critique gap #5).** Re-home supervised git stages (branch-prep, integrate/merge, checkpoint-push, built/ship-checkpoint) into engine-owned deterministic code WITH the full `supervisedDispatch` remediation/compensation/lease-serialization layer intact. Explicitly deferred, not dropped.
- **D9 — Twin consolidation (dynamic-import).** Delete the `mitosis.js`-inline / `lib/*.mjs` twins via the accepted dynamic-import consolidation to remove the doubled-change surface (long-term fix for recurring-mistake G4). Gate: must ship its parity enforcement in the same commit; larger refactor, sequence after the ADOPT set stabilizes.

## 7. Rejected (explicit; do not re-litigate — Group 7)

Each was flagged as "waste" but verified load-bearing or a false positive. Cutting any trades Quality for Optimization (forbidden by C4). No cut to:

- **r-c** — the three dependency-graph passes extract DIFFERENT projections (MSP ordering / reverse blast-radius / intra-MSP wave edges), not identical facts.
- **r-m** — the autonomous-mode ship-verify read-back is the only fail-closed confirmation a CI-authorized merge actually landed.
- **r-n** — implementer self-review and reviewer independent-verification are orthogonal (the reviewer never receives the self-review; premise is a misdiagnosis).
- **r-o** — full post-fix re-review catches fix-induced regressions a fixes-only check misses (optionally thread prior issues as focusing context — an addition of signal, never a removal of coverage).
- **r-p** — per-dispatch `fullText` is fresh-context spec grounding; spec-conformance is the ONLY spec check in the pipeline; pointer indirection saves ~0 tokens and adds a fail-open hazard.
- **r-s** — the twins are a CI-guarded invariant (dedup is deferred to D9 with parity enforcement, not a floor cut).
- **o-c / o-m / o-n** — Opus on boundary/merge/ship gates, the blanket security lens on high-risk diffs, and the recall-biased sensitive-scope matcher are fail-closed gates; a weaker model would under-report a fence path, miss a security-relevant diff, or drop recall on abbreviated sensitive paths.
- **o-e / o-g / o-l** — the one-shot Unknown probe, belt-and-suspenders before sole-authority, and the multiple ship-merge confirmations are recovery/fail-closed gates.
- **p-e / p-g** — the review Opus pin (verifier ≥ generator) and the per-stage supervision stack are fail-closed recovery; escalating-to-Opus and keeping these is always robustness-safe.

## 8. Recurring-mistake guardrails (baked into WS-0/WS-2/WS-7)

The gap forensics found one failure class repeated seven times. Each guardrail is a spec requirement, not advice:

- **G1 — Activation receipt.** An activation commit (flag flip / gate enable) requires an end-to-end integration test piping REAL producer output through the ACTUAL builder into the consumer, plus a runtime counter that warns when a fail-safe default triggers (fail-closed-to-expensive never screams). Any new producer field must update every whitelist/schema that reshapes the object or fail loudly. (WS-2.3, WS-2.5, WS-2.6)
- **G2 — Landed ≠ accepted.** Ledger status splits `accepted-direction` vs `landed:<hash>`; sequence approved deletions first; supersede conflicting decisions in the same session. (WS-7.1)
- **G3 — Definition-of-done includes a live call site.** No new exported function/module without a live caller in the executed path in the same PR; zero-live-caller lint in the suite. (WS-1.9)
- **G4 — Parity enforcement ships with the copy.** The lib suite + mirror-guard run in CI/pre-commit now; any future byte-identical copy ships its parity enforcement in the same commit. (WS-0)
- **G5 — Review-layer admission gate.** A review layer must name the distinct property and the reader of its verdict; a consumer-less review is deleted by construction. (WS-7.3)
- **G6 — Fixes are state, not prose.** A confirmed cross-cutting defect lands its deterministic tripwire lint RED in the same session even if the fix is deferred; "shipped" requires a commit hash; commit the current gh-scope fix before further work. (WS-0.3)
- **G7 — Flags ship with an enable path + a deadline.** Every feature flag lands with a runtime enable path (so it can be proven without a source edit) and a dated flip-or-delete; a lint flags any long-lived `const X_ENABLED = false` with no reachable true-path. (WS-7.2, D3)

## 9. Testing strategy

Scoped per the project testing discipline (`~/.claude/rules/common/testing.md`) — behavior through public surfaces, RED-first for each activation/fix, no change-detector tests.

- **Activation-receipt / seam tests** (WS-2.5): the real `derive-edges → builder → policyModelFor` path, asserting Sonnet / Opus / fail-closed-Opus outcomes. This is the test whose absence hid R-A.
- **Boundary-halt preservation** (WS-3.1): a boundary-FAILED MSP still halts after the final-review deletion.
- **Fail-closed paths** (C3/F4): empty-findings plan non-approval → re-review-once not silent-approve; budget exhaustion → park; partial-signal → Opus; legacy-manifest resume → warn-and-continue not hard-fail.
- **Model-routing floor** (WS-2.4): floor gates provably Opus after the `kind` split; `kind:'fix'` provably Sonnet.
- **Dead-export lint** (WS-1.9) and **mirror-guard + full lib suite in CI** (WS-0).
- **Status-token contract + prompt-snapshot** (WS-5.4).
- **Drift canary** (WS-1.6): an injected corrupt constant is logged.
- Each landed workstream is followed by an engine self-validation run (the reflexive-risk mitigation): a Mitosis dry-run or the scoped suite proving the engine still executes end-to-end.

## 10. Definition of Done

- All ADOPT workstreams landed across both twins with green CI (mirror-guard + full lib suite + new tests), each with its RED-first receipt.
- Routing telemetry on a representative run shows a non-trivial Sonnet fraction with zero 100%-ambiguous warnings; the categorical Opus gates provably fire on gated tasks.
- The robustness floor (F1-F6) is demonstrably intact: sole-merge-authority CI, human gate, independent Opus security lens, fail-closed park, worktree isolation, boundary-halt.
- The pending gh-scope CRITICAL fix is committed; the CI/pre-commit backstop exists and catches a staleed twin.
- DEFERRED items are recorded with their gates; REJECTED items are recorded so they are not re-litigated; the R7-x decisions are reconciled (landed-with-hash or superseded) in the ledger.
- No ADOPT change lowers the Pillar-1 floor; every model down-tier lands on Sonnet (never Haiku) and escalates to Opus on failure.

## 11. Open decisions folded into this spec (resolutions)

| Open question | Resolution |
|---|---|
| Q1 — R7-4 vs model-selection-policy | Resolved by C2: risk-scale plan/review models (Sonnet for trivial low-blast, Opus otherwise); mark the blanket-Opus-pin decision superseded (WS-4, WS-7.1). |
| Q2 — Sonnet activation aggressiveness | Activate under the A8 envelope with routing telemetry as cheap insurance (WS-2.6); telemetry quantifies the low-risk fraction and prevents silent regression to the dead state. |
| Q3 — Two-axis model×effort | Deferred to D7 (future experiment; out of scope for this pass). |
| Q4 — Host `fs`/`import` capability | Probe gates D1/D2/D8; interim down-tiering (WS-5) is the ceiling until confirmed. |
| Q5 — Streaming dispatch | Deferred to D3 (runtime enable path + validation A/B + dated flip-or-delete). |
| Q6 — Frontier-train | Deferred to D5 (persist parent-tip SHAs; bind ship-time combined-CI + lease-overlap as acceptance conditions). |
| Q7 — `maxAttempts` | Wired honest into `supervisedEngineDispatch` (WS-1.2), aligning with C3. |
| Q8 — Governance in this spec | Yes — WS-7 (ledger-status split, session-start lint, CI wiring) is in scope; it is the guardrail set that would have prevented R-A/O-A. |
