# Mitosis Cluster-Tier — Integration-Test SPEC (S1-S8 + N1-N3)

Status: draft (authored 2026-07-02, thread `mitosis-cluster-tier-e2e`)
Feature under test: the 2-layer fractal scheduler shipped by `mitosis-cluster-tier` (done).
Ground truth: behavioral map of `workflows/mitosis.js`, `lib/superpowers-parallel/{derive-clusters,run-engine,msp-file-scope}.mjs`, `wave-planner.mjs`, verified against current file contents 2026-07-02.

---

## 0. The two claims under test

- **Claim A — Acceptance invariant (headline).** The scheduler is a TOTAL function over well-formed (acyclic) SPECs. Parallelizability shapes the SCHEDULE, never gates ACCEPTANCE. Fully-parallel and fully-serial SPECs are both accepted and driven green, at BOTH the cluster tier AND the MSP-task tier. The ONLY rejection is a dependency CYCLE (malformed), which halts cleanly. Sharp distinction: over-serialized = accepted-but-slow; rejected = cycles only. Monotonic rule: on uncertainty, ADD serialization; never drop an edge.
- **Claim B — Both layers, positive observable evidence.** Layer 1: independent clusters run CONCURRENTLY. Layer 2: independent tasks within an MSP run in PARALLEL waves. Nested: parallel clusters x sequential-within-cluster MSPs x parallel task waves.

Every fixture below discharges some slice of A and/or B. Section 7 maps fixtures back to the thread's five completion criteria.

---

## 1. Behavioral contract (the facts the SPEC asserts against)

These are the load-bearing rules; every expected value in Section 3 derives from them. Citations are `file:line` into the current tree.

### 1.1 `deriveClusters(msps, discoveredEdges = [])` — `derive-clusters.mjs:61`
- **Reads per MSP:** `{ id, dependsOn?: string[], fileScope?: string[] }` (`:3-12`); missing → `[]`. Original array `index` is captured and is load-bearing for tie-breaks.
- **Output:** `{ clusters: string[][], audit: { clusterCount, addedEdgeCount, added: [{from,to,reason}] } }` (`:132-139`).
- **Partition** = connected components of an UNDIRECTED graph over `dependsOn` ∪ `discoveredEdges` ∪ `fileScope`-overlap (`:75-81, :91-93, :102-104`; components at `:109-122`).
- **Intra-cluster order** = `bottomUpOrder` over a SEPARATE DIRECTED `deps` map containing ONLY `dependsOn` ∪ directed `discoveredEdges`. `fileScope`-overlap edges are NEVER added to `deps` (`:102-104` links `adj` only). Ready batches are sorted by ORIGINAL ARRAY INDEX (`:49`), not by id.
- **Cluster array order** in the return is sorted by lexicographically-smallest member id (`:124-130`) — distinct from intra-cluster order.
- **Merge-vs-order table:**

  | Edge source | Merges membership (`adj`) | Imposes order (`deps`) |
  |---|---|---|
  | `dependsOn` | yes | yes |
  | `discoveredEdges` (skipped if `from===to` or already connected) | yes | yes (directed `from→to`) |
  | `fileScope`-overlap (skipped if `scopesOverlap` false or already directly connected) | yes | NO |

  Overlap audit edge is `{ from: later-indexed id, to: earlier-indexed id, reason: 'fileScope-overlap' }` (`:102-103`).
- **`fileScope` overlap** = `scopesOverlap` (`wave-planner.mjs:25-28`) true if ANY path pair overlaps per `pathsOverlap` (`:13-23`: exact / glob-prefix / dir-prefix).
- **Cycle handling:** `detectCycle` runs ONCE, GLOBALLY, over the full `deps` map BEFORE partitioning (`:107`, Kahn indegree walk). On a cycle it THROWS `Error('dependency cycle detected among: <sorted comma-space ids>')` (`:35-36`) — never a partial return; a 2-node cycle among 10 MSPs aborts the whole call. Overlap edges can NEVER cycle (they don't feed `deps`). An over-serialized-but-acyclic graph (e.g. all-overlap) resolves to ONE cluster with a valid index-tie-broken order and NO throw.

### 1.2 `mitosis.js` scheduler
- **Harness-wrapped script:** `export const meta = {...}` (`:1-13`) + top-level `await`/`return`. Ambient globals injected by the Workflow runtime: `args, agent, parallel, log, phase, workflow`. Not importable as an ES module.
- **`LIB_DIR` is a hardcoded absolute path** (`:17`), NOT `import.meta`-derived. Lib modules load via dynamic `await import(file://${LIB_DIR}/...)` (`:189-192`) — the confirmed static→dynamic import fix.
- **Input** (`:114-128`): `args` JSON → `{ spec, repoRoot, baseBranch, sourcePrefix, verify, build, models, fixLoopMax, worktreeRoot }`. MSPs are NOT in `args`; they come from the Decompose `agent()` call (DECOMPOSE_SCHEMA, `:19-41`).
- **Layer-1 driver** (`:396`): `await parallel(clusters.map(c => () => runClusterChain(c)))` — one thunk per cluster.
- **`runClusterChain`** (`:227-394`): sequential `for` over cluster ids; each MSP does Plan → Harden → invariant checks → Branch → Execute (`await runEngine(...)`, `:352`) → `await link` (ship) before advancing. MSP N+1 does not Plan until MSP N ships or halts.
- **`mergeQueue`** (`:224`, shared across all cluster chains): each ship attaches `link = (mergeQueue = mergeQueue.then(() => shipOneMsp(...)))` then `await link` (`:389-390`). FIFO by attachment order = real-time order reaching `:389`. `shipped.push({...})` (`:384`) happens in that same serial order — the only reliable ship-order signal.
- **`shipOneMsp`** (`:364-386`): ALL git/CI (fetch, `merge-base --is-ancestor`, rebase, force-with-lease push, PR, `gh run watch`, squash-merge) is PROMPT TEXT for a subagent (`:367-376`) conforming to SHIP_SCHEMA `{ merged, prUrl, receiptsPass, d6Pass, detail }` (`:101-112`). JS gate is exactly `if (!ship.merged) { halt }` (`:379`). Base-branch-unchanged holds only because the prompt tells the agent not to merge on red CI — no JS assertion enforces it.
- **Halt shapes:**
  - input JSON invalid → `{ halted, stage:'input', detail, shipped:[], mspCount:0 }` (`:118`).
  - cluster derivation throw caught → `{ halted, stage:'cluster', detail: err.message, shipped:[], mspCount: msps.length }` (`:194-202`) — hardcoded `shipped:[]`.
  - ship halt → `{ halted, stage:'ship', mspId, detail, receiptsPass, d6Pass, shipped, mspCount }` (`:381`), bubbled through `runClusterChain` (`:391`) then top-level `return { ...firstHalt, shipped, mspCount }` (`:399`) where the live `shipped`/`mspCount` overwrite the embedded ones.
- **`firstHalt = chainResults.find(r => r && r.halted)`** (`:397`) — selects the ALPHABETICALLY-FIRST halted cluster (array is smallest-id sorted), NOT the temporally-first failure.
- **`shipped` on halt is NOT necessarily `[]`** — it is a single shared mutable array holding every MSP that shipped before the halt. `shipped === []` on a ship-halt is valid ONLY when the halting MSP is the very first ship across the whole run.

### 1.3 `run-engine.mjs` (Layer 2) — `runEngine(engineArgs, ctx)` `:31`
- `ctx = { agent, parallel, log, phase }` destructured at `:32`.
- Wave loop `for (w...) { ... }` (`:176-228`); per-wave dispatch `await parallel(waveIds.map(id => () => runTask(id)))` (`:179`) — `outcomes` preserve `waveIds` index order regardless of resolution order.
- Returns `{ waves, halted, haltReason, isolation, boundary?, finalReview? }`.
- Exported pure helpers: `withModel, normalizePath, globToRegExp, scopeCovers, engineWorktreePath`.

### 1.4 `msp-file-scope.mjs` — `aggregateMspFileScope(tasksMap)` `:1`
- Input is an ID-KEYED OBJECT (throws on null / non-object / array, `:2-4`). Returns dedup+sorted union of all tasks' `fileScope`.
- **`aggregatedScope` is structurally INERT in `mitosis.js`** (computed `:333`, stored on the shipped record `:384`, never compared cross-cluster). No JS-level cross-cluster overlap gating exists; the backstop is entirely the Ship-stage CI (G8 fresh-base rebase + G9/D6 re-run). The SPEC MUST NOT assert JS-level overlap blocking.

### 1.5 Known implementation gaps surfaced by the map (candidate defects)
- **G-phase:** `phase('Plan'|'Harden'|'Branch'|'Execute'|'Ship')` in `runClusterChain` (`:234,246,336,351,365`) are NOT namespaced per cluster, contradicting the design spec's explicit call for per-cluster/MSP namespacing (`docs/superpowers/specs/2026-07-02-mitosis-cluster-tier-design.md:105`). Under concurrent clusters these race on the global progress-tree state. It does NOT affect the halt/ship functional contract. Layer-1 concurrency remains observable because `log()` lines are manually `mitosis[<id>]:`-prefixed (`:244,265,334,346,362,380,383`). Treat as a candidate product defect: if a fixture is made to assert progress-tree legibility under concurrency, that fixture is the red-first repro for a product fix (a sub-task requiring user sign-off per this thread's Out-of-Scope note).
- **G-deadcode:** `bottomUpOrder`'s own cycle guard (`:50-51`) is unreachable under the current call path (global `detectCycle` at `:107` already aborts). Defensive, not a functional risk; not a test target.

---

## 2. Two-tier strategy — what each tier can and cannot prove

### Tier 1 — deterministic scheduler tests (runnable in NON-GIT `~/.claude`)
- **Environment:** plain `node --test`; fake `ctx` (`agent, parallel, log, phase`), no git, no network.
- **Proves:** cluster partition/order (all shapes), cycle halt, Layer-2 wave concurrency (via reverse-resolution), merge-queue serialization order, `firstHalt`-by-index selection, every halt-shape, and the acceptance invariant end-to-end (S3/S4/S6 all accepted and driven "green" with a success-mock agent).
- **Cannot prove:** real git worktrees, real receipts/D6/CI, real semantic-break DETECTION (only its halt-SHAPE given a mocked `ship.merged=false`), real wall-clock concurrency (only call-shape + reverse-resolution ordering as a proxy).
- **This tier carries the comprehensive coverage.**

### Tier 2 — true e2e on a DISPOSABLE real git repo
- **Environment:** scratch GitHub repo (as `mitosis-integration-test` did for the base build); real agents, real `git` worktrees, receipts CI + D6, real Workflow harness.
- **Proves:** mitosis.js LOADS + RUNS under the real harness (closes the executed-thread open risk), real cross-cluster merge serialization, real instance-safety, real receipts red→green + D6, real cross-MSP semantic-break halt with base unchanged.
- **Minimal set:** S3, S5, N1 (must-run); S4, N2 if budget allows. Fixtures are TINY (1-3 line changes per task) so topology is exercised cheaply.

---

## 3. Fixture matrix — expected outputs per fixture

Legend: **partition** = `deriveClusters` clusters array; **order** = intra-cluster order; **wave** = Layer-2 shape; **halt** = expected terminal state; **evidence** = the positive observable required; **tier** = where it runs.

### Positive fixtures (every one MUST be accepted and driven green)

| ID | Input shape | Expected partition | Expected order / wave | Accept? | Tier |
|----|-------------|--------------------|-----------------------|---------|------|
| **S1** | 1 MSP, 1 task | `[[m0]]`; audit `{clusterCount:1, addedEdgeCount:0, added:[]}` | single task, single wave | yes | 1 |
| **S2a** | 1 MSP, N independent tasks | `[[m0]]` | 1 wave dispatching N>1 tasks in parallel (Layer 2) | yes | 1 |
| **S2b** | 1 MSP, serial task chain t0←t1←t2 | `[[m0]]` | N sequential waves; task-tier fully-serial STILL accepted | yes | 1 |
| **S3** | linear MSP chain m0←m1←m2, disjoint scopes | `[[m0,m1,m2]]`, `addedEdgeCount:0` | order == dep chain (m0,m1,m2); single cluster ⇒ NON-REGRESSION vs base build | yes | 1 + 2 |
| **S4** | N independent MSPs, disjoint scopes, no deps | N singleton clusters, **sorted alphabetically by id** (e.g. ids `[b,a]` → `[[a],[b]]`) | Layer 1: N clusters run concurrently | yes | 1 (+2 if budget) |
| **S5** | 2 independent clusters, each a 2-MSP chain, each MSP has parallel tasks | 2 clusters, each `[chainRoot, chainLeaf]` | FULL nested fractal: 2 clusters concurrent x sequential-within x parallel task waves | yes | 2 (Tier-1 proves the derive+schedule shape) |
| **S6** | all MSPs share fileScope overlap, no declared deps | single cluster `[[all]]`; `addedEdgeCount` = pairwise overlap edges added; each `reason:'fileScope-overlap'`, `from`=later-index, `to`=earlier-index | order == INPUT ARRAY ORDER (overlap adds no `deps` edge); "maximally unparallelizable" yet ACCEPTED | yes | 1 |
| **S7** | no deps, disjoint scope, `discoveredEdges:[{from:b,to:a}]` | single cluster `[[a,b]]` | order follows edge direction (`to` first ⇒ a before b); semantic-only merge path | yes | 1 |
| **S8** | diamond m0←{m1,m2}←m3, disjoint scopes | single cluster `[[m0, <m1/m2 by input index>, m3]]` | m0 first; m1&m2 simultaneously-ready, TIE-BROKEN BY INPUT INDEX; m3 last | yes | 1 (NEW coverage — no diamond test exists today) |

### Negative / safety fixtures (must HALT cleanly)

| ID | Input shape | Expected terminal state | Evidence | Tier |
|----|-------------|-------------------------|----------|------|
| **N1** | cross-MSP semantic break (a later MSP breaks a dependent's tests) | ship-halt: `{halted, stage:'ship', mspId, receiptsPass:false or d6Pass:false, ...}`; base branch UNCHANGED; nothing further shipped | Tier-1 proves the halt-SHAPE given mocked `ship.merged=false`; Tier-2 proves REAL detection via receipts/D6 red on fresh base | 1 (shape) + 2 (real) |
| **N2** | dependency cycle among MSPs | Passes the decompose unknown-id pre-check (all ids are known) and halts at `deriveClusters`'s `detectCycle` → `{halted, stage:'cluster', detail:/dependency cycle detected among: .../, shipped:[], mspCount:n}`. THE ONLY structural rejection; distinct from S6 over-serialization. (Option A, 2026-07-02: the decompose-ordering index-reject at `mitosis.js:179-180` was removed, so any acyclic decomposition — whatever its array order — is accepted and re-sorted by `bottomUpOrder`; `deriveClusters` is now the single validator that rejects true cycles, reviving the `stage:'cluster'` catch at `:189-196`.) | 1 (+2 if budget) |
| **N3** | 2 clusters running simultaneously whose task worktrees would collide WITHOUT `branchPrefix` namespacing | both complete, no cross-contamination | Tier-2 only (needs real worktrees); Tier-1 asserts `engineWorktreePath` namespacing is per-task/prefix distinct | 2 (path-unit slice in 1) |

**The invariant assertion (crux):** S3 (fully-serial chain), S4 (fully-parallel), S6 (maximally over-serialized) MUST all reach `halted:false` with `shipped` == all MSPs under a success-mock agent. The invariant now holds UNCONDITIONALLY: any acyclic decomposition is accepted regardless of its input array ordering — a dependent listed BEFORE its dependency is accepted and re-sorted by `deriveClusters` (`bottomUpOrder`), never rejected. N2 (a true cycle) MUST be the only shape that rejects. Asserting these together IS the acceptance-invariant proof. Option A (2026-07-02) removed the decompose-ordering index-reject at `mitosis.js:179-180`, making `deriveClusters` the single validator for dependency cycles.

---

## 4. Tier 1 test design (deterministic, `~/.claude`)

Placement: `lib/superpowers-parallel/tests/` alongside the existing `derive-clusters.test.mjs` (11 tests) and `run-engine.test.mjs` (5 tests). New scheduler-level tests that drive `mitosis.js` go in a new `tests/mitosis-scheduler.test.mjs`. Apply the test admission gate: EXTEND existing suites where they already cover a behavior; add only genuinely new coverage (S8 diamond, tie-break, wave-concurrency, merge-serialization, halt-shapes).

### 4a. `deriveClusters` pure tests — extend `derive-clusters.test.mjs`
Add the currently-missing cases (S1 already ~covered; S3/S4/S6/S7/N2 have near-equivalents — do NOT duplicate, assert only the delta):
- **S8 diamond (NEW, highest value):** `m0←{m1,m2}←m3`, assert `clusters==[['m0','m1','m2','m3']]` with input order `[m0,m1,m2,m3]`; then a SECOND assertion with input order `[m0,m2,m1,m3]` proving the tie-break flips to `['m0','m2','m1','m3']` — this is the only place the index-tie-break rule is exercised with >1 simultaneously-ready node under `dependsOn`.
- **S6 order-is-input-index (NEW delta):** all-overlap, assert order equals input array order (not id-sorted), plus `addedEdgeCount` and one `added` edge's `{from,to,reason}` shape.
- Gate check: if `derive-clusters.test.mjs` already asserts a shape (linear chain, two-independent, overlap-pair, discovered-edge-pair, lexicographic cluster order, cycle throw), REFERENCE it in the SPEC's coverage map rather than re-adding.

### 4b. `run-engine` wave-parallelism — extend `run-engine.test.mjs` (S2a)
Prove Layer 2 directly: a single MSP with a 2-task wave; make the two mock `agent()` calls resolve in REVERSE order of their `waveIds` position; assert `outcomes` is STILL in `waveIds` index order. That proves the thunks were dispatched together (Promise.all), not awaited serially. (No existing test does this.) Add S2b serial-chain (2 waves) asserting task-tier serial is accepted.

### 4c. `aggregateMspFileScope` — small unit slice
Assert union/dedupe/sort correctness and the three throw cases (null / non-object / array). Do NOT assert any cross-cluster gating (it doesn't exist — §1.4).

### 4d. `mitosis.js` scheduler via eval-inject wrapper (`tests/mitosis-scheduler.test.mjs`)
**Wrapper (resolved approach):** read `workflows/mitosis.js` source, strip the leading `export ` from `export const meta` (the ONLY transform needed — `export` is illegal in a Function body; `LIB_DIR` is hardcoded absolute so no `import.meta` shim is required and the dynamic `import(file://...)` at `:189-192` resolves as-is), then:
```
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const body = source.replace(/^export const meta/m, 'const meta');
const run = new AsyncFunction('args','agent','parallel','log','phase','workflow', body);
const result = await run(JSON.stringify(specInput), fakeAgent, fakeParallel, fakeLog, fakePhase, fakeWorkflow);
```
`result` is mitosis.js's top-level `return` (`:401` or an earlier halt return). This exercises the real cluster-derivation call/catch wiring, `runClusterChain`, `shipOneMsp`, the shared `mergeQueue`, and `firstHalt` selection — none of which are importable.
- **Fallback escalation:** if the wrapper proves infeasible (it should not, per §1.2), the only alternative is a test-only extraction of `runClusterChain`/`shipOneMsp`/`mergeQueue` into an importable module — a change to shipped product code, OUT OF SCOPE without explicit user sign-off (per thread Out-of-Scope). Prefer the wrapper.

**`fakeAgent` design:** a router keyed by `opts.label`/`opts.phase`/`opts.agentType` returning schema-valid results per stage:
- Decompose → the fixture's `{ msps: [...] }` (this is where topology is injected).
- Prepare → `{ ready:true, detail:'' }`; Plan → `{ planPath:'/x', summary:'' }`; Harden → a minimal valid `{ engineArgs:{...}, route:{lane, N} }`; Branch → `{ ready:true, detail:'' }`; Ship → `{ merged:true, prUrl:'', receiptsPass:true, d6Pass:true, detail:'' }`.
- Execute stage calls `runEngine` with the real lib module and the fake ctx — so the engine's wave logic is real; only leaf `agent()` task calls are mocked to success.
- For N1: the Ship router returns `{ merged:false, receiptsPass:false, ... }` for the target MSP.
- For controlling merge-queue ORDER: gate specific Execute-stage mock `agent()` resolutions behind deferred promises so a chosen cluster reaches `:389` first, then assert `shipped[]` order.

**Tier-1d assertions:**
1. **Acceptance invariant:** run S3, S4, S6 through the wrapper with the all-success agent; assert each returns `halted:false` and `shipped.length == mspCount` (== number of MSPs). This is the crux proof that serial, parallel, and over-serialized SPECs are all accepted and driven green.
2. **Layer-1 concurrency (observable):** S4/S5 — assert `parallel` was invoked once with a thunk array of length == cluster count (call-shape), and that `mitosis[<id>]:` log lines from different clusters interleave (capture via `fakeLog`). Do NOT assert on `phase()` ordering (§1.5 G-phase).
3. **Merge serialization:** with gated Execute resolutions, assert `shipped[]` order == merge-queue attachment order and that no two `shipOneMsp` agent calls overlap (serial via `.then`).
4. **`firstHalt` by index:** two clusters both halting; assert the returned `firstHalt` is the alphabetically-first cluster's halt, not the temporally-first.
5. **Halt shapes:** N2 → `{stage:'cluster', shipped:[], detail:/dependency cycle detected among:/}`; N1 → `{stage:'ship', mspId, receiptsPass:false}` with `shipped` == the set that shipped before the halt.
6. **Input guard:** malformed `args` JSON → `{stage:'input', shipped:[], mspCount:0}`.

---

## 5. Tier 2 test design (disposable real git repo)

Follow the `mitosis-integration-test` template. Scratch GitHub repo with receipts CI + D6 configured. Fixtures TINY.

- **Setup:** create disposable repo; seed a trivial baseline; configure the receipts gate + D6 check exactly as the base-build integration test did; record repo URL + teardown command in the session log.
- **S3 (single-chain non-regression):** 3-MSP linear chain, each MSP a 1-line change in a disjoint file. Expected: 1 cluster, sequential ship, base green throughout, all 3 PRs squash-merged in chain order.
- **S5 (full nested fractal):** 2 independent 2-MSP chains, each MSP with 2 parallel-task files. Capture BOTH layers concurrently:
  - Layer 1 evidence: both clusters' namespaced integration worktrees existing simultaneously, and interleaved `mitosis[<id>]:` progress lines from the two clusters.
  - Layer 2 evidence: engine wave artifacts showing a >1-task wave dispatched within an MSP.
  - Merge evidence: ordered base-merge commits proving one-at-a-time serialization across clusters.
- **N1 (semantic break):** a later MSP changes a symbol a dependent MSP's test relies on. Expected: fresh-base rebase surfaces the break, receipts/D6 go RED on the fresh base, that MSP's ship halts (`merged:false`), base branch UNCHANGED past the last good ship, run reports the ship-halt.
- **Optional if budget:** S4 (pure Layer-1, N independent clusters) and N2 (cycle halts before any git op).
- **Teardown:** delete the disposable repo; log findings (pass/fail per fixture, observed evidence, any product defect uncovered) into the thread session log.

**Cost control:** Tier 2 runs the MINIMUM set. Do not run all 11 shapes with real agents — Tier 1 owns comprehensive coverage; Tier 2 proves harness/git/CI integration and real concurrency on representative fixtures.

---

## 6. Candidate defects the SPEC may surface (and how to handle them)

Per the thread's Out-of-Scope rule, product code changes only if a test uncovers a REAL defect, and then the fix is a sub-task with the test as red-first repro, requiring user sign-off.
- **G-phase (§1.5):** non-namespaced `phase()` under concurrent clusters. If the user wants progress-tree legibility asserted, a fixture becomes the red repro for a namespacing fix. Otherwise documented as known, Layer-1 concurrency proven via logs instead.
- **`aggregatedScope` inert (§1.4):** not a defect per the design (CI is the backstop), but the SPEC explicitly must NOT assert JS-level cross-cluster gating; if the user expected JS-level blocking, that's a design conversation, not a test.

---

## 7. Completion-criteria → evidence map (DoD discharge)

| Thread DoD criterion | Discharged by |
|---|---|
| 1. Integration-test SPEC/plan formalizing the matrix | THIS document (§3 matrix + §4/§5 designs) |
| 2. Tier 1 GREEN: every acyclic shape → expected partition/order/waves + merge order; invariant holds UNCONDITIONALLY (no acyclic SPEC rejected at cluster OR task level regardless of input array order — deriveClusters re-sorts misordered decompositions; only true cycles halt) | §4a-4d; crux = 4d.1 (S3/S4/S6 all green) + 4d.5 (N2 only rejection) |
| 3. Tier 2 e2e on disposable repo for ≥ S3, S5, N1; torn down; findings logged | §5 |
| 4. BOTH layers proven with positive evidence + invariant across matrix (parallel S4 and serial S3/S6 both accepted+green) | Layer 1: 4d.2 + S5 Tier-2; Layer 2: 4b + S5 Tier-2; invariant: 4d.1 |
| 5. mitosis.js LOADS + RUNS under the real harness | §5 (Tier-2 run is the proof; closes the static/dynamic-import open risk) |

---

## 8. Execution order

1. Tier 1 first (cheap, comprehensive, runs here): 4a → 4b → 4c → 4d. Land green before touching Tier 2.
2. Tier 2 second (needs disposable repo + real agents/CI): S3 → S5 → N1, then optional S4/N2.
3. Any real defect uncovered → red-first repro test + user sign-off before a product fix.
