# Mirror gaps: un-mirrored workflow logic (Gap 1) and the open twin census (Gap 2)

Anchored at `1bb149d` (`main`, clean). Every `file:line` below was re-derived against that checkout by executing measurement scripts, not copied from a spec. The specs in this repo are anchored at `450804e` and are stale by +68 to +81 lines; where this plan restates a spec claim it says so and gives the re-derived anchor.

Registry invariant **M2** ("closed census") and MSP milestone **M2** ("derive status from forge + git refs") are different namespaces. This document writes **registry M2** and **MSP M2** in full every time.

---

## 1. Method, and what is verified versus inferred

| Claim | Status |
|---|---|
| `.claude/workflows/mitosis.js` is 4,935 lines | verified (`wc -l`) |
| `.claude/lib/superpowers-parallel/` holds 37 `.mjs` files | verified (`readdirSync` filter `.endsWith('.mjs')`) |
| The mirror guard's declared twin list holds 21 names | verified (`mirror-guard.test.mjs:19`) |
| Twin containment results in §2 | verified by execution of the guard's own `normalize()` over all 37 files |
| Line coverage / uncovered ranges in §3 | verified by execution (offset-to-line mapping of each contained twin body) |
| MSP M3-M8 touch map in §4 | verified by grep of the identifiers each milestone names, mapped against the measured coverage map |
| Meaning of "the shepherd path" in MSP M3's scope line | **inferred, ambiguous** — see §4.3 |
| `runReconcileOnlyAdvance`'s closure set | verified by token count over the extracted range |
| MSP M2's existing status-derivation site and the three holes (H-A/H-B/H-C) | taken as given from the brief; the **anchors** were re-derived here, the **rulings** were not re-litigated |
| Estimated LOC per PR | **inferred** — derived from measured region sizes plus a test-to-prod ratio observed in this repo, not from a written diff |

Nothing in this plan invoked the compiled workflow. `compileWorkflow` returns a frozen async callable that dispatches real agents; every measurement here was pure text analysis over source files.

---

## 2. Gap 2 red check: the result

A throwaway script applied `mirror-guard.test.mjs`'s exact `normalize()` (lines 8-15) to all 37 `.mjs` files and tested whole-file containment in normalized `mitosis.js`, then cross-referenced the 21-name list at `mirror-guard.test.mjs:19`.

| Category | Count | Files |
|---|---|---|
| Declared **and** contained (guard is green and meaningful) | 21 | the full list at `mirror-guard.test.mjs:19` |
| Declared but **not** contained (guard red today) | 0 | — |
| **Contained but NOT declared — live unpoliced twin** | **1** | `msp-file-scope.mjs` |
| Not declared and not contained | 15 | see §2.2 |

### 2.1 The verdict: Gap 2 is a latent defect today, not only future-proofing

`msp-file-scope.mjs` (13 lines) is whole-file duplicated at `mitosis.js:67-78` and is absent from the declared list. It exports `aggregateMspFileScope`, which unions `task.fileScope` across a task map and returns a sorted array — the input to MSP file-scope overlap decisions. It has a unit test (`tests/msp-file-scope.test.mjs`) so the **lib** copy is tested; the **inline** copy is tested by nothing and policed by nothing. An edit to either copy alone is silent today. That is one live instance of exactly the failure mode registry M2 forbids.

### 2.2 The 15 non-contained files are not uniformly standalone — three are partial twins

Whole-file containment is too coarse a probe. Re-measuring at top-level-export granularity (extract each `export …` declaration block by brace matching, strip the leading `export `, test containment) found that three of the fifteen share code with `mitosis.js` without being whole-file twins:

| File | Top-level exports | Mirrored exports | Inline site |
|---|---|---|---|
| `engine-args.mjs` | 2 | `validateModelsKnob` | `mitosis.js:3627-3650` region |
| `pr-format.mjs` | 14 | `PR_TITLE_TYPES`, `PR_TITLE_PATTERN`, `PR_VALUE_CAP` | `mitosis.js:3241`, `:3242`, `:3249` |
| `wave-planner.mjs` | 3 | `pathsOverlap`, `scopesOverlap` | `mitosis.js:50-60`, `:62-65` |

The remaining twelve have **zero** mirrored exports and are genuine standalone CLIs / harnesses.

`engine-args.mjs` is already partly policed by the region test at `mirror-guard.test.mjs:38-48`. `pr-format.mjs` and `wave-planner.mjs` are policed by nothing. `wave-planner.mjs`'s pair is the more consequential of the two: `pathsOverlap` decides file-scope conflict, and `mitosis.js:40-48` also carries unexported `normalize` and `globPrefix` copies that `pathsOverlap` depends on.

This measurement is the single most important input to the Gap 2 design: **a file-granular census would have declared `pr-format.mjs` and `wave-planner.mjs` "standalone" and passed, while real duplicated logic drifted.** The census must be export-granular where partiality exists.

Measured with and without a minimum-block-length filter; the no-filter run surfaces exactly one additional name (`PR_VALUE_CAP`) and no spurious matches. No length threshold is needed, which matters because a threshold would itself be the "sampled allowlist" registry M2 forbids.

---

## 3. Gap 1 inventory: what has no twin

Subtracting every contained twin body (plus the `engine-args.mjs` knob region) from `mitosis.js`:

- **Covered by a policed twin: 2,589 lines (52.5%)**
- **Un-mirrored: 2,346 lines (47.5%)**, in 23 contiguous ranges

Of the un-mirrored lines, 187 named top-level declarations span 1,825 lines; the balance is workflow main-body statements with no declaration of their own. Split by kind: ~1,318 lines are logic functions, ~322 lines are prompt strings and JSON schemas.

### 3.1 The large un-mirrored blocks

| Range | Lines | Contents |
|---|---|---|
| `mitosis.js:1318-1675` | 358 | 14 `*_SCHEMA` literals, `evaluateManifestReuse` (`:1575-1674`) |
| `mitosis.js:2816-3427` | 612 | forge-PR classification, divergence probes, the reconcile-only shepherd, report assembly, PR-format helpers, prompts, `supervisedDispatch` |
| `mitosis.js:3651-4261` | 611 | the workflow main body: status derivation, relaunch orchestration, checkpoint persisters |
| `mitosis.js:4304-4936` | 633 | `runUnit` (`:4308-4782`, 475 lines), merge poll, review-decision read, tail reporting |

### 3.2 The confirmed instances from the brief, re-derived

| Item | Brief's anchor | Re-derived at 1bb149d | Agrees |
|---|---|---|---|
| built-state rescue reduce | `3783-3795` | `reconciledManifest` at `mitosis.js:3783-3795`, preceded by `shippedFoldedManifest` at `:3779-3782` | yes |
| `classifyRunOpenPRs` | `2828-2899` | `mitosis.js:2828-2899` | yes |
| `buildReconcileLiveSignals` | `2901-2918` | `mitosis.js:2901-2918` | yes |
| `evaluateManifestReuse` | starts `1575`, copy loop `1641-1650` | `mitosis.js:1575-1674` | yes |

All four are inside un-mirrored ranges. The rescue reduce is a bare top-level statement, not a function, confirming the brief.

---

## 4. What MSP M3-M8 will touch, measured

This is the evidence that decides both the admission criterion and the landing order.

### 4.1 Touch map

| MSP | Declared scope | Target identifiers | Mirror status |
|---|---|---|---|
| **M2** | derive status from forge + git refs (§3.1) | `reconciledManifest` `:3783-3795`, `shippedFoldedManifest` `:3779-3782`, `reconciledDoneIds` `:4058-4061`, `selectResumeBuilt` (`parking.mjs:111-132`) | rescue reduce and done-union **un-mirrored**; `parking.mjs` **mirrored** (`mitosis.js:2233-2391`) |
| | fact sources feeding that derivation | `classifyRunOpenPRs` `:2828-2899`, `buildReconcileLiveSignals` `:2901-2918`, `emptyOpenPrClassification` `:2817-2819`, `prHeadOwnerRepo` `:2821-2826` | **un-mirrored** |
| **M6** | run-identity manifest ref, read at derivation | same derivation site `:3758-3795`; `evaluateManifestReuse` `:1575-1674` | **un-mirrored** |
| **M3** | one advance loop; delete streaming path, shepherd path, its gate, `maxSteps` | `runScheduleStreaming`, `STREAMING_DISPATCH_ENABLED` `:2204`, `maxSteps` `:2094`/`:2158`, `progressPossible` `:2074` | **mirrored** (`leases.mjs`, `mitosis.js:1925-2212`) |
| | | `runReconcileOnlyAdvance` `:2977-3120` (144 lines) and its call site `:3818-3862` | **un-mirrored** |
| | | `planReconcile`, `shouldReconcileOnly` `:2748`, `hasBuildableWork` `:2752` | **mirrored** (`reconcile.mjs`, `mitosis.js:2677-2815`) |
| **M4** | fixed cap K; delete AIMD, window delta, review-decision read | `windowDelta` `:2225` | **mirrored** (`window.mjs`, `:2214-2227`) |
| | | `clampWindow` `:2229-2231`, `readReviewDecision` `:4811-4821`, `resolveReviewEvent` `:4823-4828`, `persistWindowCheckpoint` `:4830-4850`, `REVIEW_DECISION_SCHEMA` `:4789-4797` | **un-mirrored** |
| **M5** | quiescent exit + continuation block; delete bounded poll and `progressPossible` | `progressPossible` `:2074` | **mirrored** |
| | | `mergePoll` `:4852-4890`, `assembleReport` `:3141-3156`, `computeParkedStatus` `:3122-3135`, `reportOnlyResumePoint` `:4912-4915` | **un-mirrored** |
| **M7** | single divergence predicate, two states | `runDivergenceProbes` `:2934-2975`, `SHA_HEX_PATTERN` `:2920` | **un-mirrored** |
| | | divergence consumption in `reconcile.mjs` (`mitosis.js:2764`) | **mirrored** |
| **M8** | CI-to-green loop, six escalation classes | `CI_WATCH_MAX_SECONDS` `:4305`, `CI_WATCH_INTERVAL_SECONDS` `:4306`, and the CI wait inside `runUnit` `:4308-4782` | **un-mirrored** |

### 4.2 Ruling on "why before M3 is load-bearing" — partly confirmed, partly refuted

The coordinator's hypothesis was that MSP M3's targets are largely un-mirrored, so Gap 1 must precede it. Measurement splits the answer, and the honest version is more useful than the flattering one:

- **The deletion half is already safe.** Everything MSP M3 names for deletion — the streaming path, its gate `STREAMING_DISPATCH_ENABLED` (`mitosis.js:2204`), `maxSteps` (`:2094`, `:2158`), `progressPossible` (`:2074`) — lives in `leases.mjs`, which is a policed twin with a unit test (`tests/leases.test.mjs`). Deleting those is a deletion against mirrored, import-tested code. Gap 1 buys nothing there.
- **The consolidation half is not.** "One advance loop" must absorb the *second* advance implementation, `runReconcileOnlyAdvance` (`mitosis.js:2977-3120`, 144 lines, 11 `await`s), plus its relaunch orchestration at `:3818-3862`. Both are un-mirrored, unit-untestable, and covered only by e2e. That is the real exposure, and it is the reason the gap work precedes MSP M3.

So "before M3" remains the right gate, but for a narrower and more specific reason than "M3's targets are un-mirrored". The precise statement: **MSP M3 collapses two advance implementations into one; exactly one of the two is currently un-mirrored, and it is the one being absorbed rather than deleted.**

### 4.3 Named ambiguity

MSP M3's scope line says "delete the streaming path, the shepherd path, its gate, `maxSteps`". "The shepherd path" has two candidate referents at 1bb149d: the poll shepherd inside `runScheduleTick` (`leases.mjs`, mirrored) and `runReconcileOnlyAdvance`, which the log strings at `mitosis.js:3009`, `:3011`, `:3020`, `:3031` literally name "reconcile-only shepherd". The neighbours in that sentence are all `leases.mjs` residents, which favours the first reading; the naming favours the second. **This is unresolved and must be settled before MSP M3 is planned.** This plan does not depend on the answer: `runReconcileOnlyAdvance` is admitted below because MSP M3 either deletes it or absorbs it, and both demand it be testable first.

---

## 5. Ruling 1 — Gap 1 fix: the admission criterion, and what is refused

Extracting everything is neither robust nor simple; a 2,346-line extraction programme would be a multi-month refactor with no behavioural payoff and would violate the diff budget many times over. The criterion is deliberately narrow.

### 5.1 Admission criterion (all three must hold)

1. **Imminence.** A named milestone in the `2026-07-28-mitosis-quiescent-advance.md` landing plan (MSP M2, M6, M3, M4, M5, M7, M8) modifies, absorbs or deletes the region. Code no milestone touches stays where it is regardless of how untested it looks — extracting stable code buys policing of something that is not changing, which is cost without risk reduction.
2. **Seam.** The region either is already a pure function of its arguments, or its hook usage (`agent`, `parallel`, `phase`, `log`) can be lifted into an injected context **without changing behaviour**. The precedent is `runEngine(engineArgs, ctx)` at `run-engine.mjs:296`, which destructures `{ agent, parallel, log, phase }` from `ctx`. Code with no such seam would become a lib file that no unit test can drive — mirror theatre.
3. **Extent.** The extraction lands under ~150 production lines, so the PR that carries it plus its tests fits the 200-400 LOC reviewable budget.

**Refusal rule, stated positively:** prompt-string assembly and JSON schema literals are refused on criterion 1 — they change only when the prompt changes, they make no state or control-flow decision, and a mirror guard over them would fire on every copy edit while proving nothing about behaviour.

### 5.2 Admitted

| # | Region | Lines | Destination | Driven by |
|---|---|---|---|---|
| A1 | `shippedFoldedManifest` `:3779-3782` + `reconciledManifest` rescue reduce `:3783-3795` | 17 | new `status-facts.mjs` | MSP M2 (in scope already), MSP M6 |
| A2 | `emptyOpenPrClassification` `:2817-2819`, `prHeadOwnerRepo` `:2821-2826`, `classifyRunOpenPRs` `:2828-2899`, `buildReconcileLiveSignals` `:2901-2918` | 102 | new `forge-facts.mjs` | MSP M2 (fact source), MSP M7 |
| A3 | `runReconcileOnlyAdvance` `:2977-3120` | 144 | new `reconcile-advance.mjs` | MSP M3 (absorb or delete) |
| A4 | `clampWindow` `:2229-2231` | 3 | **extend existing** `window.mjs` | MSP M4 |
| A5 | `readReviewDecision` `:4811-4821`, `resolveReviewEvent` `:4823-4828`, `mergePoll` `:4852-4890` | 60 | new `merge-poll.mjs` | MSP M4, MSP M5 |
| A6 | `computeParkedStatus` `:3122-3135`, `parkedReportEntry` `:3137-3139`, `assembleReport` `:3141-3156`, `fatalReportShipped` `:3158-3162`, `reportOnlyResumePoint` `:4912-4915` | 40 | new `report-assembly.mjs` | MSP M5 continuation block |
| A7 | `runDivergenceProbes` `:2934-2975` + `SHA_HEX_PATTERN` `:2920` | 43 | new `divergence.mjs` | MSP M7 |

A4 is the cheapest possible win and worth calling out: `clampWindow` sits two lines below the end of the `window.mjs` twin (`mitosis.js:2214-2227`) and belongs to it by subject. Moving it into `window.mjs` extends a policed twin instead of creating a file — strictly less mechanism, per binding decision 0065.

A3's seam is already half-built: the function is declared `async function runReconcileOnlyAdvance(advance, ctx)` at `:2977` and is called at `:3861` with a ctx carrying `manifest, reconciledShippedMeta, sourcePrefix, baseBranch, repoRoot, logicalRunId, merged, newlyMergedIds, targetOwnerRepo, targetRepoHost`. Measured free identifiers it still closes over lexically: `log` (9), `clean` (14), `phase` (3), `agent` (2), `persistWindowCheckpoint`, `persistParkCheckpoint`, `persistShipCheckpoint`, `assembleReport`, plus `mayRestack` (from `leases.mjs`) and `checkpointRef` (from `checkpoint.mjs`). The first eight move into `ctx`; the last two become real `import` lines in the lib file, which the guard's `normalize()` strips by design (`mirror-guard.test.mjs:12`). Note the ordering consequence: A6 must land before or with A3, because A3 injects `assembleReport`.

### 5.3 Refused, with reasons

| Region | Lines | Reason |
|---|---|---|
| 14 `*_SCHEMA` literals `:1319-1573` | ~230 | criterion 1 — data literals, no decision |
| `divergenceProbePrompt` `:2922-2932`, `diagnosticianPrompt` `:3210-3227`, `redispatchPrompt` `:3229-3239`, `planReviewPrompt` `:3298-3308`, `replanPrompt` `:3310-3319`, `reviewDecisionPrompt` `:4799-4809` | ~72 | criterion 1 — string assembly |
| `runUnit` `:4308-4782` | 475 | criterion 3 hard fail, and criterion 2 is doubtful: it is the dispatch body itself. MSP M8 touches only the CI-wait portion; extract that sub-region **if and when** MSP M8 defines its boundary, not speculatively |
| `parkUnit` `:4139-4157`, `persistParkCheckpoint` `:4159-4179`, `supersedeOpenPr` `:4181-4216`, `persistBuiltCheckpoint` `:4218-4238`, `persistShipCheckpoint` `:4240-4260` | 122 | criterion 2 — thin closures over `agent()`; a lib twin would assert only that a prompt string was built |
| `evaluateManifestReuse` `:1575-1674` | 100 | criterion 1 is **marginal**: MSP M6 touches run identity and may touch this. Deferred to MSP M6's own planning rather than pre-extracted here. Named explicitly so the deferral is a decision, not an oversight |
| `supervisedDispatch` `:3357-3397`, `supervisedEngineDispatch` `:3399-3410`, `makeRemediation` `:3321-3351` | 84 | criterion 1 — no milestone names them |
| `readBoundaryPreflightVerdict` `:127-160`, `validateRunPath` `:2630-2635`, `gateConfigDepth` `:3166-3176`, `refuseToWeakenBounded` `:3178-3187`, `normalizeFingerprint` `:3189-3194`, `normalizeDiagnosis` `:3196-3208`, PR helpers `:3259-3296`, `legacyModelKeysIn` `:3653-3656`, `withoutLegacyModelKeys` `:3657-3660`, `relaunchStateFor` `:4069-4077` | ~120 | criterion 1 |
| workflow main-body statements `:3412-3427`, `:3662-3830`, `:4048-4137` | ~300 | not extractable — these are the script body. Only decision-computing sub-expressions within them are admitted (A1) |
| `clean` `:32-34`, `cleanUrl` `:36-38`, `normalize` `:40-42`, `globPrefix` `:44-48`, `pathsOverlap` `:50-60`, `scopesOverlap` `:62-65` | 34 | criterion 1 — but `pathsOverlap`/`scopesOverlap` are partial twins of `wave-planner.mjs` and are handled by **Gap 2**, not Gap 1 |

Total admitted: **409 production lines** across 7 items, against 2,346 un-mirrored. That ratio is the point of the criterion.

---

## 6. Ruling 2 — Gap 2 fix: the closed census

### 6.1 Design

Replace the hand-typed array at `mirror-guard.test.mjs:19` with a classification table over a `readdirSync`-derived domain, asserted in both directions. Both halves of this idiom already exist in the repo and are reused rather than invented (binding decision 0065):

- the `readdirSync` domain derivation: `dead-export-lint.test.mjs:12-17` (`libModuleNames()`)
- the classify-then-assert-closure shape: `workflow-sandbox-census.test.mjs:184-207` (`ENGINE_IDENTIFIER_CLASSES`) and `:258-265` (the `unclassified` / `stale` pair)

```js
const MIRROR_CENSUS = Object.freeze({
  'authoritative-constants.mjs': 'whole',
  'boundary.mjs': 'whole',
  'checkpoint.mjs': 'whole',
  'derive-clusters.mjs': 'whole',
  'handoff.mjs': 'whole',
  'leases.mjs': 'whole',
  'merge-policy.mjs': 'whole',
  'merge-watch.mjs': 'whole',
  'msp-file-scope.mjs': 'whole',
  'outcome.mjs': 'whole',
  'parking.mjs': 'whole',
  'prepare-guard.mjs': 'whole',
  'prepare-plan.mjs': 'whole',
  'reconcile.mjs': 'whole',
  'recovery.mjs': 'whole',
  'remediation.mjs': 'whole',
  'retry.mjs': 'whole',
  'run-engine.mjs': 'whole',
  'run-log.mjs': 'whole',
  'saga.mjs': 'whole',
  'supervisor.mjs': 'whole',
  'window.mjs': 'whole',
  'engine-args.mjs': ['validateModelsKnob'],
  'pr-format.mjs': ['PR_TITLE_TYPES', 'PR_TITLE_PATTERN', 'PR_VALUE_CAP'],
  'wave-planner.mjs': ['pathsOverlap', 'scopesOverlap'],
  'branch-contract.mjs': 'standalone',
  'derive-edges.mjs': 'standalone',
  'fold-run-log.mjs': 'standalone',
  'generate-run-script.mjs': 'standalone',
  'gh-merge-shim.mjs': 'standalone',
  'ledger-lint.mjs': 'standalone',
  'merge-boundary-preflight.mjs': 'standalone',
  'mitosis-gate.mjs': 'standalone',
  'mitosis-git.mjs': 'standalone',
  'resolve-superpowers.mjs': 'standalone',
  'route-planner.mjs': 'standalone',
  'workflow-sandbox.mjs': 'standalone',
});
```

Three classes. A string value is a whole-file verdict; an array value means "exactly these named exports are mirrored".

### 6.2 The assertions

| Assertion | Enforces |
|---|---|
| `readdirSync` names minus census keys is empty | **halts on the unclassified** — a new lib file is a hard failure until a human classifies it |
| census keys minus `readdirSync` names is empty | halts on a stale row after a file is deleted or renamed |
| `whole` → normalized file body is contained in normalized `mitosis.js` | the existing guarantee, unchanged |
| `standalone` → normalized file body is **not** contained, **and no top-level export block of it is contained** | this is the load-bearing addition — it is what makes the table unfalsifiable by omission |
| array → each named export's block **is** contained, **and no unnamed export of that file is contained**, and the whole file is not contained | closes partiality in both directions |
| extractor tripwire: the block extractor finds a known set of anchors and a non-trivial total count | guards against a silently-empty scan, exactly as `dead-export-lint.test.mjs:77-89` does |

### 6.3 Why this cannot become a hand-maintained list in disguise

The objection to any allowlist is that a developer can quiet it by editing the list. Here they cannot, because **every row is checked against measured containment in both directions**:

- Moving a real twin to `standalone` to get green **fails** — the "no export block contained" check fires. This is precisely what would happen to `msp-file-scope.mjs`, `pr-format.mjs` and `wave-planner.mjs` today.
- Shrinking a partial-twin array to drop an inconvenient name **fails** — the "no unnamed export contained" check fires.
- Deleting a row entirely **fails** — the domain closure check fires.

The table declares *intent*; containment is *measured*. The only writable degree of freedom is which honest class a file is in, and every class carries an assertion that contradicts a dishonest choice. A pinned count appears nowhere, and no sampling threshold is used (§2.2 confirmed none is needed).

### 6.4 The failure message a developer sees

For an unclassified file, the message must say what to do, not just what broke:

> `these lib modules have no MIRROR_CENSUS row: derive-frontier.mjs — classify each as 'whole' (whole-file twin inlined in mitosis.js), an array of mirrored export names (partial twin), or 'standalone' (no inline copy). A row is checked against measured containment, so an inaccurate class fails.`

For a mis-declared standalone:

> `pr-format.mjs is classified 'standalone' but these of its top-level exports appear verbatim inside mitosis.js: PR_TITLE_TYPES, PR_TITLE_PATTERN, PR_VALUE_CAP — reclassify it as a partial twin listing exactly those names, or delete the duplication.`

### 6.5 Disposition of `msp-file-scope.mjs`

It is classified `'whole'`, which is the truth: it is contained today. No source change is needed — the census simply starts policing an existing correct duplication. This matters for the landing order (§8): the census goes green on arrival without any accompanying fix, so it does not need an exclusion list, and no real twin is parked on one to buy green. Same for `pr-format.mjs` and `wave-planner.mjs`, which become honest partial rows.

### 6.6 What to do with the existing `knobRegion` test

Keep `mirror-guard.test.mjs:29-48` unchanged. The census's `engine-args.mjs` partial row covers `validateModelsKnob`; the region test additionally pins the two **unexported** constants `KNOB_MODEL_WHITELIST` and `REVIEW_PINNED_KNOB_KEYS`, which an export-granular census cannot see. Deleting it would lose coverage; rebuilding its capability inside the census would add mechanism to regain what already works. Leave it.

---

## 7. Ruling 3 — PR decomposition

Sequencing is the binding constraint: all of this lands during or after MSP M2 and strictly before MSP M3. Packaging is free. Five PRs, each of which delivers something standing alone and leaves `main` green.

| # | Branch | Delivers standing alone | Prod / test LOC (estimated) |
|---|---|---|---|
| **P1** | `test/mirror-census-closure` | The mirror guard stops being an open census: 37 of 37 lib modules classified, `msp-file-scope.mjs` policed for the first time, `pr-format.mjs` and `wave-planner.mjs` partial twins policed for the first time. Closes registry M2 for this gate. **Zero production change.** | 0 / ~130 |
| **P2** | `fix/m2-monotone-status` (MSP M2) | The status derivation becomes monotone-forward with two named logged vetoes, `selectResumeBuilt` is gated on the ref fact (H-B), and A1 is extracted to `status-facts.mjs`. This is MSP M2 **re-scoped smaller** than first written. | **stale — re-measure**; see note |
| **P3** | `refactor/forge-and-divergence-facts` | A2 and A7 extracted (`forge-facts.mjs`, `divergence.mjs`): forge-PR classification and divergence probing become unit-testable and policed. Standalone worth: the inputs to MSP M2's own derivation gain import-level tests they have never had. | ~145 / ~180 |
| **P4** | `refactor/reconcile-advance-seam` | A3 and A6 extracted (`reconcile-advance.mjs`, `report-assembly.mjs`): the second advance implementation gets an injected context and a unit test before MSP M3 absorbs or deletes it. | ~184 / ~200 |
| **P5** | `refactor/window-and-merge-poll` | A4 and A5 (`window.mjs` extended, `merge-poll.mjs` created): MSP M4's and MSP M5's deletion targets become policed and testable. | ~63 / ~110 |

**P2's LOC estimate is withdrawn, not adjusted.** The original `~115 / ~160` assumed a scope containing hole H-C and a rewrite of the `:3787` veto. Decision 0159 refutes H-C and decision 0160 keeps the veto, so both are gone from the scope and the number no longer describes the work. What remains is H-B, the veto naming and logging, and the A1 extraction. Re-measure against the written diff; do not reuse the withdrawn figure, and do not treat its absence as licence to overrun the 200-400 LOC reviewable budget.

Notes on the packaging choices:

- **P1 is deliberately alone and first.** It is a pure test change with no production diff, which makes it the cheapest possible thing to review and the safest thing to land. Bundling it into MSP M2 would mix a gate change with a behaviour change in one reviewable range for no gain.
- **P3 groups A2 with A7** because `runDivergenceProbes` (`:2934-2975`) and `buildReconcileLiveSignals` (`:2901-2918`) are adjacent, both feed the same `liveSignals` object consumed at `:3828`, and both serve MSP M7. Splitting them would produce two sub-100-line PRs touching neighbouring lines.
- **P4 groups A3 with A6** because A3 injects `assembleReport`, so A6 must precede or accompany it. Accompanying is fewer PRs for the same review surface.
- **A4 is not given its own PR.** Three lines moved into an existing twin does not justify a PR; it rides with A5, which serves the same milestones (MSP M4, M5).
- **P5 could be deferred past MSP M3** on dependency grounds alone, since its consumers are MSP M4 and M5. It is kept inside the pre-M3 gate because the gate as stated is "all of it precedes M3", and because MSP M3's "one advance loop" rewrite is likely to move the poll call site, which is easier against a policed `merge-poll.mjs`. Flagging this as the one PR whose placement is a judgement call rather than a dependency.

Every one of P1, P3, P4, P5 is behaviour-preserving. Together with P2 they hold the green-branch invariant: no PR here changes a public surface another PR depends on except P2, and P2's dependants (P3-P5) only add extraction, not new callers.

---

## 8. Ruling 4 — sequencing hazard, and the safe order

The hazard as originally framed was that Gap 2's census would go red on Gap 1's in-flight extractions. **The empirical result inverts it.**

The census only turns red on an *unclassified* file. A Gap 1 extraction creates a new lib file, which is unclassified, which is a hard failure — but that failure lands in the same PR as the extraction, on the extractor's own branch, and is cleared by adding one honest row (`'whole'`) in that same diff. That is not a hazard; that is the guard working. It is also exactly the protection Gap 1 needs: without the census, a new extraction that is mirrored but never added to line 19 becomes a new unpoliced twin, silently — which is how `msp-file-scope.mjs` came to exist.

The precondition for census-first is that nothing is currently unpoliced-but-inlined *in a way the census cannot honestly classify*. §2 establishes that all three under-policed cases (`msp-file-scope.mjs`, `pr-format.mjs`, `wave-planner.mjs`) classify truthfully into existing classes and go green on arrival. **No exclusion list is required, and none is used.** Had one been required, parking a real twin on it to buy green would not have been acceptable and the fix would have had to precede the census.

**Safe order: P1 → P2 → P3 → P4 → P5, then MSP M3.**

MSP M2 sits second, after the census and before every other extraction. Landing P1 first costs one small PR and converts every subsequent extraction from "remember to update line 19" into a machine-enforced obligation. Rationale in one line: **the census is cheapest when it is empty of new work, and most valuable when work is about to arrive.**

The one thing this order does not protect: P1 through P5 all touch `mitosis.js` and each other's neighbourhoods, so they must land serially, not in parallel worktrees. Any edit to a policed twin lands in both copies in the same commit or the guard fails.

---

## 9. Ruling 5 — test receipts

The project's test admission gate owes a test only where behaviour changes and no coverage exists. Applying it rather than blanket-adding:

| PR | Test | Asserts | Red on parent because |
|---|---|---|---|
| P1 | domain-closure test in `mirror-guard.test.mjs` | `readdirSync` names and census keys are set-equal | **Red on 1bb149d if the census is seeded with only the current 21 names** — 16 files unclassified. Green once all 37 are classified. This is the receipt that Gap 2 was open |
| P1 | `msp-file-scope.mjs` containment | its normalized body is inside `mitosis.js` | Passes at 1bb149d — this is *new coverage of existing correct behaviour*, not a bug fix. Its receipt is the closure test above, plus an inertness check: perturbing the inline copy at `mitosis.js:67-78` must turn it red |
| P1 | mis-declared-standalone test | declaring `wave-planner.mjs` as `'standalone'` fails | Written as a fixture-driven negative test, not by mutating the real table |
| P2 | characterization test for the rescue reduce | current observable outputs of `mitosis.js:3779-3795` for merged-fold and ref-rescue inputs | **Green on parent by construction** — that is what a characterization test is. Written and committed *before* the extraction commit, which is how registry M4 discharges in-PR |
| P2 | monotone-forward test | a derived unit status advances `planned → built → awaiting → done` and is never lowered by a later fold in the same derivation | Red-on-parent basis is **to be established by execution, not asserted from this row**. The basis is the absence of a monotone comparator in the rescue reduce, NOT the veto at `:3787`. Per decision 0160 that veto is the **resurrection guard**, not hole H-A: it is what stops a condemned unit parked at stage `plan` from being flipped back to `built` and ship-restored from an invalidated checkpoint, and `tests/frontier-train-e2e.test.mjs:578` asserts exactly that. **Weakening, removing or routing around `:3787` to turn this test red is a safety regression and is forbidden.** The test must be red on the parent with that veto intact, or it is the wrong test |
| P2 | veto-is-named-and-logged test | `parked` and `condemned` are the only two vetoes and each emits a log line | Red on parent: no such logging exists |
| P2 | `selectResumeBuilt` ref-fact gate | it does not synthesize a checkpoint ref when `builtUnits` lacks the id | Red on parent: `parking.mjs:120` synthesizes unconditionally (hole H-B). Note the signature consequence: `selectResumeBuilt(manifest, shippedSet)` takes no built-unit fact today, so the gate needs a new input — and `parking.mjs` is a **whole policed twin**, so the signature change, every caller, and both copies land in ONE commit |
| P2 | non-regression | condemned content is not resurrected by a ref | Already covered at `tests/frontier-train-e2e.test.mjs:578`; **do not duplicate** — reference it, and confirm it still passes |
| P3, P4, P5 | mirror census rows for the new files | each new lib file is contained | Red the instant the file is created without a row — automatic, no authoring needed |
| P3, P4, P5 | one behavioural unit test per extracted function | the function's observable contract | These are **new coverage of unchanged behaviour**. Per the admission gate they are admissible only because criterion 2 of §5.1 makes the behaviour newly reachable through a public surface. Keep them thin: assert the contract each milestone is about to depend on, not every branch |

**Struck: the done-union fact gate.** This row previously demanded that journal `shipped` alone must not enter `done` without a merged-PR fact, red on parent because `mitosis.js:4057-4061` unions unconditionally (hole H-C). Decision 0159 **refutes** H-C rather than deferring it: the done-union is correct, and narrowing it is a liveness regression, because `gh pr list --limit 200` at the open-PR classifier means absence from the merged listing is not evidence of non-merge (decision 0154). Round one reached the opposite conclusion on a sole-caller claim that one grep falsified — `applyShipTransition` has a second caller at `mitosis.js:562`, journal replay. Re-opening H-C requires new evidence of an unconfirmed-ship producer, not a re-read. The related tamper surface stays open and unowned by P2: `.mitosis/run.json` is operator-hand-editable, so a hand-injected `status: shipped` is reachable even though no in-code path writes one.

Explicitly **not** owed: no test for A4 (`clampWindow` moves into `window.mjs`, which `tests/window.test.mjs` already drives), and no new e2e anywhere — every receipt above sits at the unit layer, which is the lowest layer that can express it.

Registry M3 asks for an inertness mutation with each fix. For P2 the natural one is reverting the monotone comparator to an unconditional assign and confirming the monotone test turns red; for P1 it is perturbing an inline twin copy.

---

## 10. Ruling 6 — coverage entries

Every PR adds `docs/invariants/coverage/<branch-with-slashes-as-dashes>.json` **in its own diff**. Verified contract: a single top-level `rows` array; each row is exactly `{id, verdict, check}`; `verdict` is `"threatened"` or `"not-threatened"` and nothing else; every file must be set-equal to the registry id universe (12 ids today: B1-B6, M1-M6), with no missing, unknown or duplicate id. The checker validates *every* `.json` in that directory against the registry, so the branch-derived filename is convention, not enforcement — but the pull-request-mode check requires that some coverage file be added or modified between the merge base and `HEAD`, reading committed history via `git diff --name-only`, not the index.

Predicted filenames: `test-mirror-census-closure.json`, `fix-m2-monotone-status.json`, `refactor-forge-and-divergence-facts.json`, `refactor-reconcile-advance-seam.json`, `refactor-window-and-merge-poll.json`.

Ids each PR plausibly engages:

| Id | P1 | P2 | P3-P5 | Note |
|---|---|---|---|---|
| **M2** (closed census) | **threatened** | not-threatened | not-threatened | P1 *is* the closure of a census that classifies paths. Its `check` must name the domain-closure assertion and state that no threshold or pinned count is used |
| **M4** (refactor vs behaviour) | not-threatened | **threatened** | **threatened** | P2 mixes extraction with behaviour change; discharged by the characterization test committed before the extraction commit. P3-P5 are pure refactors, so M4 is engaged by the *claim* that they carry no behaviour change — the `check` must name what establishes that |
| **M3** (red-then-green receipt) | **threatened** | **threatened** | not-threatened | P1 and P2 both carry a red-on-parent assertion; P3-P5 do not fix a reported symptom |
| **M5** (re-derived citations) | **threatened** | **threatened** | **threatened** | every PR body and this plan cite `file:line`; all anchors here were re-derived at 1bb149d |
| **M1** (whole-set verdict recorded) | threatened in the trivial sense for all five | | | satisfied by the artifact existing |
| **M6** (versioned build of committed source) | not-threatened | not-threatened | not-threatened | unless a PR touches a deployed gate artifact |
| **B1-B6** | not-threatened | not-threatened | not-threatened | none of these PRs touch `workflow-sandbox.mjs` or the realm policy. **Exception to check at authoring time:** if any extraction adds an identifier that resolves in the workflow body, B5's identifier census at `workflow-sandbox-census.test.mjs:258` engages. Extractions here add `import` lines to lib files and remove nothing from `mitosis.js`'s identifier surface, so B5 should stay quiet — but this is the one B-track id worth re-checking per PR rather than defaulting |

---

## 11. Adversarial: the biggest thing that would make this wrong

**The strongest objection is that P3, P4 and P5 are speculative work justified by milestones that may not land as scoped.** The admission criterion's first and primary gate is "a named milestone touches it". That gate is only as good as the landing plan, and the landing plan has an unresolved ambiguity this plan itself identified (§4.3, "the shepherd path"). If MSP M3 is rescoped — or if MSP M4's "delete AIMD" turns out to delete `mergePoll` outright rather than rewrite it — then P5 extracted, tested and policed 60 lines that are about to be deleted. That is pure waste: three pillars says quality first, but extracting code in order to delete it is not quality, it is motion.

Three things reduce but do not eliminate this:

1. Extraction is cheap to unwind — deleting a lib file plus its census row and test is a smaller change than the extraction was.
2. Even code that is deleted benefits from being policed while it is deleted, because the deletion becomes verifiable against a unit test rather than an e2e.
3. P1 and P2 are immune to the objection: P1 fixes a defect that exists today independent of any milestone, and P2 is MSP M2 itself.

**The mitigation to apply:** treat P3-P5 as *conditional*. Before opening each, confirm the milestone that justifies it still names the region. If MSP M3's rescoping resolves §4.3's ambiguity toward "delete `runReconcileOnlyAdvance` entirely", P4 shrinks to a characterization test with no extraction — which would be the correct, less-mechanism answer, and this plan should not be read as committing to the extraction regardless.

A second, smaller objection: the census's "no unnamed export is contained" check compares text, so a *renamed* export whose body is unchanged will be reported as contained under the old name and missing under the new one. The failure is loud and the fix is a one-word row edit, but the message must be written to say so, or the first developer to hit it will misdiagnose it as drift.

A third: the LOC estimates in §7 are inferred, not measured against a written diff. If P4 overruns the 400-line budget once `runReconcileOnlyAdvance`'s ctx threading is real, split A6 back out into its own PR ahead of it — the ordering already permits that.
