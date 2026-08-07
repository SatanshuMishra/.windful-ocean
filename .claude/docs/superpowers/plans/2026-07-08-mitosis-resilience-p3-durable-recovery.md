# Mitosis Resilience — Increment 3B (Pillar 3): Durable Recovery — Implementation Plan

Co-ships with Increment 3A (Pillar 4, already in the working tree). This plan delivers **reconcile-first, manifest-as-cache** durable recovery: a relaunch reconstructs the shipped-set from the real world (`gh`/`git`), reuses the prior decomposition instead of diverging, skips already-merged MSPs, and completes the remainder — with the run manifest as a *hint that can lie*, never an authority.

Grounded in spec §7 (`2026-07-07-mitosis-resilience-hardening-design.md`), the ratified scope (`decisions/2026-07-08-mitosis-resilience-3b-scope-ratified.md`), and the engine surface map (`.claude/docs/2026-07-08-mitosis-3b-engine-surface-map.md`). The 3A plan (`2026-07-08-mitosis-resilience-p4-replay-safe-effects.md`) is the twin/SDD/format template.

## Global Constraints

- **No code comments** anywhere (shebang/pragma carve-outs only). No emojis. No AI attribution in commits.
- **NO commits unless the user asks.** Edits land in the working tree on branch `feat/mitosis-resilience` (P1 = commit `2ee8720`; P2 + 3A + Task 8/8.5/8.5-fix uncommitted on top). The SDD ledger (`.superpowers/sdd/inc3b/progress.md`) records progress; a commit is a separate user-gated step. Per-task "review" is a **no-commit delta-diff** review, never a commit.
- **Determinism is Pillar 1 and load-bearing for prefix-replay.** No `Date.now()`, no `Math.random()`, no `new Date()`, no `setTimeout` in `mitosis.js` or any twin (grep-confirmed absent; the Workflow runtime forbids them). `logicalRunId = hash(spec + baseBranch)` is a **hand-rolled synchronous FNV-1a** in `recovery.mjs` — `node:crypto` is unreachable inline (imports break the raw `AsyncFunction` body AND the twin normalizer; `crypto.subtle.digest` is async). ISO timestamps (`mergedAt`) come ONLY from `gh`/`git` output inside agent prompt text, never from engine code.
- **`mitosis.js` has ZERO imports and NO `fs`** — it executes as a raw `AsyncFunction` body, signature `(args, agent, parallel, log, phase, workflow)`. Every manifest read/write, `gh`/`git`, and `.gitignore` op is **agent-instructed shell prose** (like the P1 ship-log), never a JS `fs`/`exec`/`import` call. Pure logic goes in the new `recovery.mjs` twin and is unit-tested with plain data; agent-facing I/O is tested by **prompt-contract** only.
- **The engine cannot see its own harness `wf_` runId** (not a body parameter; zero references — analyst-confirmed). So the engine's recovery is **COLD reconcile-first**: `gh pr list --state merged --base <baseBranch>` + `git log origin/<baseBranch>` are truth. `harnessRunId` is stored in the manifest ONLY if passed via `args` ("when known"). The same-session `resumeFromRunId` fast-path is an operator relaunch procedure documented in the skill, **NOT engine logic** — this plan does not implement it.
- **The reconciled shipped-set (gh/git) is the SOLE authority for skip decisions.** The manifest is never consulted for shipped-status. This is what makes P3 acceptance #2 pass: a corrupt manifest claiming an unmerged MSP is "shipped" cannot cause a skip, because skip keys on the reconciled set, not `manifest.status`. The manifest's only jobs are (a) relaunch-detection via `logicalRunId` and (b) Decompose-reuse (reuse `clusters`/`msps` to avoid a divergent fresh Decompose — acceptance #1).
- **MINIMAL-CORRECT checkpoint cadence (ratified).** The manifest is written at exactly two boundaries: **initial** (full `clusters`+`msps`, `status:'planned'`, written on the FRESH path post-Decompose) and **ship-transition** (per merged MSP: `status:'shipped'`/`prUrl`/`mergedAt`, folded into the ship agent, **REPLACING** P1's NDJSON append). The reuse path writes no initial checkpoint (Decompose is skipped); the existing manifest re-converges through ship-transitions. §7.4 (checkpoint-and-exit / continue-as-new) is **DEFERRED** — resume is MSP-level (skip shipped, re-run partial from start; safe because 3A effects are idempotent). No per-phase in-progress checkpoints. The coarse `phase` field is diagnostic only.
- **Twin mirror discipline — SIX twins after this plan (NO markers exist; byte-identical minus `export` and any `import ... from './*.mjs'` line):** every edit to a twin block updates BOTH files in the same task and re-runs `mirror-guard.test.mjs`.
  - Twin 1 `outcome.mjs` · Twin 2 `run-engine.mjs` · Twin 3 `retry.mjs` · Twin 4 `prepare-guard.mjs` (existing, all in the guard loop).
  - Twin 5 `recovery.mjs` (NEW, this increment) — added to the guard loop in Task 2.
  - Twin 6 `derive-clusters.mjs` (PRE-EXISTING but UNGUARDED — byte-identical to the inline `deriveClusters` block minus its `import { scopesOverlap } from './wave-planner.mjs'`; a silent-drift risk). Task 2 adds it to the guard loop. `scopesOverlap` top-level duplicate at `mitosis.js:~41` is a flagged followup, **NOT folded here**.
- **Line numbers drift on every edit. Locate every change site by CONTENT ANCHOR, never by a bare line number.** A verified orienting line map is given as a hint only — always confirm by reading the anchor text.
- **Node v26 test commands:** from the lib dir `/Users/satanshumishra/.claude/lib/superpowers-parallel/`, whole-suite = `node --test tests/*.test.mjs`; a single file = `node --test tests/<file>.test.mjs`. Scope "green" to TOUCHED files. **Pre-existing failures in `generate-run-script.test.mjs` are unrelated (Node v26)** — do not touch them.
- **Prompt-contract tests are the dominant test mode for agent-facing I/O.** Capture the prompts an agent receives for a label, then `assert.match(captured, /regex/)` (model on the P1 F3 ship-prompt test in `mitosis-scheduler.test.mjs`). No live git/gh/fs needed anywhere in this plan.
- **The scheduler test reads the LIVE engine.** `tests/mitosis-scheduler.test.mjs` reads `/Users/satanshumishra/.claude/workflows/mitosis.js`, compiles its body via `new AsyncFunction('args','agent','parallel','log','phase','workflow', body)`, and runs it with fakes (`createFakeAgent({ msps, sourcePrefix, planGate, shipResult })` — a switch on `opts.label` prefix). So inline-`mitosis.js` edits (T2–T4b) are exercised there; `recovery.mjs` pure fns (T1) are exercised by their own importing `.test.mjs`.

**Paths (absolute):**
- Engine: `/Users/satanshumishra/.claude/workflows/mitosis.js` (symlinked; repo path `.claude/workflows/mitosis.js`)
- Lib dir: `/Users/satanshumishra/.claude/lib/superpowers-parallel/` (symlinked; repo path `.claude/lib/superpowers-parallel/`)
- New twin: `<lib>/recovery.mjs` · Tests: `<lib>/tests/*.test.mjs`

**Verified orienting line map (hint only; locate by content anchor):**
- `meta.phases` array (`~:4-12`): `Decompose, Prepare, Plan, Harden, Branch, Execute, Ship`. 3B inserts `Reconcile` first.
- Twin boundaries: `function scopesOverlap` (~:41, top-level dup — NOT the twin) · `function indexMsps` (~:344) · `function deriveClusters(msps, discoveredEdges = [])` (~:402, the derive-clusters twin body) · run-engine twin `const STATUS_SCHEMA` … end of `runEngine`.
- `async function dispatchWithRetry(dispatchThunk, { isPermanent, maxAttempts, state, resetRef, worktree })` (~:159).
- Args parse/validate → `fatalReport('input', …)` guards ending (~:912); `log('mitosis: spec=… repo=… base=… source=…')` (~:915) = **earliest reconcile hook** (all inputs resolved, no agent fired). `phase('Decompose')` (~:917).
- Decompose block (~:917-974): `dispatchWithRetry(() => agent(…, { label:'decompose', schema: DECOMPOSE_SCHEMA }))` → quarantine/null guards → id-validation (`/^[a-z0-9][a-z0-9-]*$/`, dup, unknown-dep) → `deriveClusters(...)` → `const clusters`. `const msps = decomposition.msps` is declared here.
- `async function runClusterChain(clusterIds)` (~:1012): `const branchPrefix = \`${sourcePrefix}/${msp.id}\`` (~:1015), `const integrationBranch = \`${branchPrefix}-integration\`` (~:1016), then `phase('Plan')` (~:1019). **Per-MSP skip goes between `:1016` and `:1019`.**
- Ship step 8 NDJSON append (~:1181, gated `merged=true`): the `.mitosis/run.json` newline-delimited-JSON append + `.gitignore` ensure. **T4b replaces this.** `SHIP_SCHEMA` (~:860-871). This site is OUTSIDE every twin.
- `DECOMPOSE_SCHEMA` (~:776-798, fields `id, title, rationale, dependsOn, fileScope`). `mspById` map used by `runClusterChain`; `shipped` array declared (~:1008), pushed at ship (~:1189-1194).

**Integration-branch pattern (load-bearing, grounded):** `integrationBranch = ${sourcePrefix}/${mspId}-integration`. `branchToMspId` reverses exactly this. MSP ids are validated `/^[a-z0-9][a-z0-9-]*$/` (no `/`), so the reverse parse is unambiguous.

---

### Task 1: `recovery.mjs` pure core + `recovery.test.mjs`

Pure, dependency-free, fully unit-testable with plain objects. No `mitosis.js` change in this task. Establishes the deterministic building blocks for reconcile-first recovery. **Review: code-reviewer only** (no engine/git surface touched).

**Files:**
- Create: `<lib>/recovery.mjs`
- Test: `<lib>/tests/recovery.test.mjs`

**Interfaces (consumed by Tasks 3–4b):**
- `computeLogicalRunId(spec, baseBranch) -> string` — hand-rolled synchronous FNV-1a 32-bit over `\`${spec}\n${baseBranch}\``, returned as fixed-width lowercase hex. Deterministic; no clock/rng/crypto/io. The `\n` separator makes `(spec, baseBranch)` boundaries unambiguous.
- `branchToMspId(headRefName, sourcePrefix) -> string | null` — returns the mspId iff `headRefName === \`${sourcePrefix}/<id>-integration\`` with non-empty `<id>` containing no `/`; else `null`. Pure.
- `reconcileShippedSet(mergedPRs, sourcePrefix) -> Map<string, { prUrl, mergedAt }>` — maps each `{ headRefName, url, mergedAt }` whose branch matches this run's pattern to `mspId -> { prUrl: url, mergedAt }`; ignores non-matching headRefNames; `[]`/nullish → empty Map. Pure.
- `parseRunManifest(raw) -> object | null` — **defensive** (SURPRISE 5). Returns the parsed object iff `raw` is a single JSON object carrying `logicalRunId`, an array `clusters`, and a non-empty array `msps`; otherwise `null` (malformed, legacy NDJSON, missing fields → treat as no-manifest, fall back to gh/git truth). **Never throws.**
- `buildInitialManifest({ logicalRunId, harnessRunId, spec, repoRoot, baseBranch, sourcePrefix, clusters, msps }) -> object` — the fresh-run manifest: top-level identity fields, `phase: 'Decompose'`, `harnessRunId: harnessRunId ?? null`, `clusters` verbatim, and `msps` normalized to `{ id, status: 'planned', integrationBranch: \`${sourcePrefix}/${id}-integration\`, prUrl: null, mergedAt: null, dependsOn, fileScope }`. Pure/immutable (does not mutate inputs).
- `applyShipTransition(manifest, { mspId, prUrl, mergedAt }) -> object` — returns a NEW manifest with the `msps` entry `id === mspId` set to `status: 'shipped'`, `prUrl`, `mergedAt`; if no such entry, appends a defensive one. Input unchanged (immutable). This is the reference semantics the ship agent's read-modify-write must reproduce.
- `reconcileManifest(manifest, shippedMap) -> object` — returns a NEW manifest whose `msps` statuses are corrected to reconciled truth: id in `shippedMap` → `status: 'shipped'` with that map's `prUrl`/`mergedAt`; id marked `'shipped'` in the manifest but ABSENT from `shippedMap` → corrected DOWN to `'planned'` (the manifest lied). Input unchanged (immutable). Demonstrates "reconcile overrides the manifest" (acceptance #2).

- [ ] **Step 1: Write the failing tests** — `<lib>/tests/recovery.test.mjs`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLogicalRunId,
  branchToMspId,
  reconcileShippedSet,
  parseRunManifest,
  buildInitialManifest,
  applyShipTransition,
  reconcileManifest,
} from '../recovery.mjs';

test('computeLogicalRunId: deterministic for identical inputs', () => {
  assert.equal(
    computeLogicalRunId('/specs/x.md', 'main'),
    computeLogicalRunId('/specs/x.md', 'main'),
  );
});

test('computeLogicalRunId: sensitive to spec and to baseBranch independently', () => {
  const base = computeLogicalRunId('/specs/x.md', 'main');
  assert.notEqual(base, computeLogicalRunId('/specs/y.md', 'main'));
  assert.notEqual(base, computeLogicalRunId('/specs/x.md', 'develop'));
});

test('computeLogicalRunId: separator prevents field-boundary collisions', () => {
  assert.notEqual(computeLogicalRunId('ab', 'c'), computeLogicalRunId('a', 'bc'));
});

test('computeLogicalRunId: fixed-width lowercase hex, no clock/rng dependence', () => {
  const id = computeLogicalRunId('/specs/x.md', 'main');
  assert.match(id, /^[0-9a-f]{8}$/);
});

test('branchToMspId: extracts id from the exact integration pattern', () => {
  assert.equal(branchToMspId('mitosis/auth-core-integration', 'mitosis'), 'auth-core');
});

test('branchToMspId: rejects wrong prefix, wrong suffix, empty id, and foreign branches', () => {
  assert.equal(branchToMspId('other/auth-core-integration', 'mitosis'), null);
  assert.equal(branchToMspId('mitosis/auth-core', 'mitosis'), null);
  assert.equal(branchToMspId('mitosis/-integration', 'mitosis'), null);
  assert.equal(branchToMspId('main', 'mitosis'), null);
});

test('reconcileShippedSet: maps matching PRs by mspId, ignores foreign branches', () => {
  const m = reconcileShippedSet([
    { headRefName: 'mitosis/a-integration', url: 'http://pr/1', mergedAt: '2026-07-08T00:00:00Z' },
    { headRefName: 'feature/unrelated', url: 'http://pr/2', mergedAt: '2026-07-08T01:00:00Z' },
  ], 'mitosis');
  assert.deepEqual([...m.keys()], ['a']);
  assert.deepEqual(m.get('a'), { prUrl: 'http://pr/1', mergedAt: '2026-07-08T00:00:00Z' });
});

test('reconcileShippedSet: empty or nullish input yields an empty map', () => {
  assert.equal(reconcileShippedSet([], 'mitosis').size, 0);
  assert.equal(reconcileShippedSet(null, 'mitosis').size, 0);
});

test('parseRunManifest: valid single-object manifest is returned', () => {
  const raw = JSON.stringify({ logicalRunId: 'deadbeef', clusters: [['a']], msps: [{ id: 'a' }] });
  const m = parseRunManifest(raw);
  assert.equal(m.logicalRunId, 'deadbeef');
});

test('parseRunManifest: malformed, legacy-NDJSON, or field-incomplete input yields null (fall back to gh/git)', () => {
  assert.equal(parseRunManifest('{not json'), null);
  assert.equal(parseRunManifest('{"mspId":"a"}\n{"mspId":"b"}'), null);
  assert.equal(parseRunManifest(JSON.stringify({ clusters: [], msps: [] })), null);
  assert.equal(parseRunManifest(''), null);
  assert.equal(parseRunManifest(null), null);
});

test('buildInitialManifest: planned msps, derived integration branch, immutable inputs', () => {
  const msps = [{ id: 'a', dependsOn: [], fileScope: ['src/a/**'] }];
  const manifest = buildInitialManifest({
    logicalRunId: 'deadbeef', harnessRunId: undefined, spec: '/s.md', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a']], msps,
  });
  assert.equal(manifest.harnessRunId, null);
  assert.equal(manifest.phase, 'Decompose');
  assert.deepEqual(manifest.msps[0], {
    id: 'a', status: 'planned', integrationBranch: 'mitosis/a-integration',
    prUrl: null, mergedAt: null, dependsOn: [], fileScope: ['src/a/**'],
  });
  assert.deepEqual(msps[0], { id: 'a', dependsOn: [], fileScope: ['src/a/**'] });
});

test('applyShipTransition: marks the msp shipped and does not mutate the input', () => {
  const before = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a', 'b']],
    msps: [{ id: 'a', dependsOn: [], fileScope: [] }, { id: 'b', dependsOn: [], fileScope: [] }],
  });
  const after = applyShipTransition(before, { mspId: 'a', prUrl: 'http://pr/1', mergedAt: '2026-07-08T00:00:00Z' });
  assert.equal(after.msps.find((m) => m.id === 'a').status, 'shipped');
  assert.equal(after.msps.find((m) => m.id === 'a').prUrl, 'http://pr/1');
  assert.equal(after.msps.find((m) => m.id === 'b').status, 'planned');
  assert.equal(before.msps.find((m) => m.id === 'a').status, 'planned');
});

test('reconcileManifest: overrides a manifest that lies about shipped status', () => {
  const lying = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a', 'b']],
    msps: [{ id: 'a', dependsOn: [], fileScope: [] }, { id: 'b', dependsOn: [], fileScope: [] }],
  });
  lying.msps.find((m) => m.id === 'b').status = 'shipped';
  const shippedMap = new Map([['a', { prUrl: 'http://pr/a', mergedAt: '2026-07-08T00:00:00Z' }]]);
  const fixed = reconcileManifest(lying, shippedMap);
  assert.equal(fixed.msps.find((m) => m.id === 'a').status, 'shipped');
  assert.equal(fixed.msps.find((m) => m.id === 'a').prUrl, 'http://pr/a');
  assert.equal(fixed.msps.find((m) => m.id === 'b').status, 'planned');
  assert.equal(lying.msps.find((m) => m.id === 'b').status, 'shipped');
});
```

- [ ] **Step 2: Run the tests to verify they fail** — `node --test tests/recovery.test.mjs` → FAIL (`Cannot find module '../recovery.mjs'`).

- [ ] **Step 3: Write `<lib>/recovery.mjs`** — implement the seven exports above. FNV-1a 32-bit: `let h = 0x811c9dc5; for each char code c: h = (h ^ c) >>> 0; h = Math.imul(h, 0x01000193) >>> 0;` then `h.toString(16).padStart(8, '0')`. `parseRunManifest` wraps `JSON.parse` in try/catch and validates shape (single object with `logicalRunId` + array `clusters` + non-empty array `msps`) before returning; any failure → `null`. All builders use spread/`map` to return new objects (immutability per coding-style.md). Zero imports.

- [ ] **Step 4: Run the tests to verify they pass** — `node --test tests/recovery.test.mjs` → PASS (all tests).

- [ ] **Step 5: Verify no syntax regressions** — `node --test tests/recovery.test.mjs && node --check recovery.mjs` → clean.

- [ ] **Step 6: No-commit review gate** — dispatch **code-reviewer** on the Task 1 delta-diff; address CRITICAL/HIGH, fix MEDIUM where possible; append the Task 1 line to `.superpowers/sdd/inc3b/progress.md`. Do NOT commit.

---

### Task 2: Inline `recovery.mjs` into `mitosis.js` (TWIN #5) + guard `recovery.mjs` AND `derive-clusters.mjs` (mirror-guard 6/6)

Adds the fifth twin and closes the pre-existing sixth (derive-clusters). No behavior change — the helpers are dead code until Task 3. **Review: code-reviewer only.**

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — insert the recovery block at TOP LEVEL, adjacent to the other twins (anchor: immediately BEFORE `function indexMsps(msps) {`, mirroring how `prepare-guard` was placed). It must sit at module top level, never inside a function.
- Modify: `<lib>/tests/mirror-guard.test.mjs` — extend the twin loop to include `'recovery.mjs'` and `'derive-clusters.mjs'`.

**Interfaces:** consumes `recovery.mjs` (Task 1) as the source of truth for the inline block; produces the inline `computeLogicalRunId` / `branchToMspId` / `reconcileShippedSet` / `parseRunManifest` / `buildInitialManifest` / `applyShipTransition` / `reconcileManifest` available to top-level `mitosis.js` code (Tasks 3–4b).

- [ ] **Step 1: Extend the mirror-guard twin loop** — `<lib>/tests/mirror-guard.test.mjs`. Anchor: `for (const twin of ['outcome.mjs', 'run-engine.mjs', 'retry.mjs', 'prepare-guard.mjs']) {`. Replace with:

```javascript
for (const twin of ['outcome.mjs', 'run-engine.mjs', 'retry.mjs', 'prepare-guard.mjs', 'recovery.mjs', 'derive-clusters.mjs']) {
```

- [ ] **Step 2: Run to verify it fails** — `node --test tests/mirror-guard.test.mjs` → the four existing twins PASS; `recovery.mjs` FAILS (body not yet inlined); `derive-clusters.mjs` result observed (it is byte-identical to the inline `deriveClusters` block minus its `import { scopesOverlap } …` line — the normalizer strips that import, so it should PASS immediately, confirming the pre-existing twin was correct-but-unguarded; if it FAILS, the block has already drifted — STOP and report the drift before proceeding).

- [ ] **Step 3: Inline the recovery block into `mitosis.js`** — paste the seven `recovery.mjs` declarations with `export ` removed from each, character-for-character otherwise (no reflow, no rename), at the top-level anchor. `recovery.mjs` has no imports, so nothing else is stripped.

- [ ] **Step 4: Run to verify the guard passes** — `node --test tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js` → all six twins PASS; `node --check` clean.

- [ ] **Step 5: Confirm no scheduler regression** — `node --test tests/mitosis-scheduler.test.mjs` → same green count as before (inline block is dead code so far). A new failure means mis-placement (block landed inside a function) — fix so it sits at top level.

- [ ] **Step 6: No-commit review gate** — dispatch **code-reviewer** on the Task 2 delta-diff (focus: byte-identity of the twin, top-level placement, guard 6/6); append the Task 2 line to progress.md. Do NOT commit.

---

### Task 3: Startup reconcile-first — `logicalRunId` + `Reconcile` phase + reconcile agent + Decompose-reuse guard (§7.1, §7.3)

Insert the cold reconcile-first startup procedure between the input-validation log and `phase('Decompose')`, and wrap the existing Decompose block so a valid relaunch reuses the prior decomposition instead of re-decomposing. All changes are in `mitosis.js` **OUTSIDE every twin**. **Review: code-reviewer + security-reviewer** (git-effect/manifest trust boundary).

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — add `Reconcile` to `meta.phases`; add `RECONCILE_SCHEMA`; insert `logicalRunId` + `phase('Reconcile')` + reconcile dispatch + Decompose-reuse guard around the Decompose block; thread `reconciledShipped` (a `Set` of already-merged mspIds) and `reconciledShippedMeta` (a `Map<id,{prUrl,mergedAt}>`) into scope for Task 4a.
- Modify: `<lib>/tests/mitosis-scheduler.test.mjs` — extend `createFakeAgent` with a `reconcile` branch; add reconcile prompt-contract + Decompose-reuse control-flow tests.

**Interfaces:**
- `RECONCILE_SCHEMA = { manifestFound: boolean, manifestRaw: string | null, mergedPRs: [{ headRefName, url, mergedAt }] }`. The agent returns the RAW manifest file contents (defensive parsing stays in tested engine code via `parseRunManifest`, never agent judgment).
- Reconcile prompt (agent-instructed shell, read-only; label `reconcile`, phase `Reconcile`): read `${repoRoot}/.mitosis/run.json` if present (return its raw contents as `manifestRaw`, `manifestFound` accordingly); run `gh pr list --state merged --base ${baseBranch} --json headRefName,url,mergedAt` and return the array as `mergedPRs`; `git log origin/${baseBranch}` for diagnostics only. It performs NO writes.
- Engine wiring (between `log('mitosis: spec=…')` and `phase('Decompose')`):

```
const logicalRunId = computeLogicalRunId(spec, baseBranch);
phase('Reconcile');
let recon;
try {
  recon = await dispatchWithRetry(
    () => agent(reconcilePrompt, { schema: RECONCILE_SCHEMA, label: 'reconcile', phase: 'Reconcile', model: models.reconciler || models.shipper || 'sonnet' }),
    { isPermanent: (r) => !Array.isArray(r.mergedPRs), maxAttempts: <retry-consistent>, state: { used: 0, max: <retry-consistent> } },
  );
} catch (err) {
  return fatalReport('reconcile', `reconcile agent threw: ${err.message}`, 0, { crashed: true });
}
const priorManifest = recon && recon.manifestFound ? parseRunManifest(recon.manifestRaw) : null;
const reconciledMap = reconcileShippedSet(recon ? recon.mergedPRs : [], sourcePrefix);
const reconciledShipped = new Set(reconciledMap.keys());
const reconciledShippedMeta = reconciledMap;
const isRelaunch = priorManifest && priorManifest.logicalRunId === logicalRunId;
```

- Decompose-reuse guard wraps the existing Decompose block:

```
let msps, clusters;
if (isRelaunch && Array.isArray(priorManifest.clusters) && Array.isArray(priorManifest.msps) && priorManifest.msps.length) {
  msps = priorManifest.msps.map((m) => ({ id: m.id, title: m.title, rationale: m.rationale, dependsOn: m.dependsOn || [], fileScope: m.fileScope || [] }));
  clusters = priorManifest.clusters;
  log(`mitosis: reconcile — relaunch detected (logicalRunId ${logicalRunId}); reusing ${msps.length} MSP(s), skipping fresh Decompose`);
} else {
  // existing phase('Decompose') block verbatim, assigning msps and clusters
}
```

  The reused `msps` still flow through the SAME id-validation the fresh path applies (dup/charset/unknown-dep) as a defense-in-depth check — factor the validation so both paths run it, or re-run it after the guard. The reconciled shipped-set (not the manifest) governs skipping in Task 4a.

- [ ] **Step 1: Write the failing tests** — `<lib>/tests/mitosis-scheduler.test.mjs`. Extend `createFakeAgent` with a `reconcile` branch returning a caller-supplied `reconcileResult` (default `{ manifestFound: false, manifestRaw: null, mergedPRs: [] }`), capturing the reconcile prompt. Add:
  - **Reconcile prompt-contract:** the `reconcile`-label prompt matches `/gh pr list --state merged --base /`, `/--json headRefName,url,mergedAt/`, `/\.mitosis\/run\.json/`, and contains NO write verb against the manifest (assert it does not match `/append|write .*run\.json/i`).
  - **Reconcile runs before Decompose:** with a default (no-manifest) reconcile result, a `decompose`-label dispatch still fires and the run proceeds (fresh path unchanged).
  - **Decompose-reuse:** given `reconcileResult` with `manifestFound: true` and a `manifestRaw` whose `logicalRunId` equals `computeLogicalRunId(spec, baseBranch)` and whose `clusters`/`msps` cover the run, assert NO `decompose`-label agent is dispatched and the run still plans/ships the (non-merged) MSPs. (Compute the expected `logicalRunId` by importing `computeLogicalRunId` from `../recovery.mjs` in the test — do not hardcode a hex.)
  - **Stale/mismatched manifest → fresh Decompose:** a `manifestRaw` with a non-matching `logicalRunId` (or malformed) → `decompose` IS dispatched.

- [ ] **Step 2: Run to verify they fail** — `node --test tests/mitosis-scheduler.test.mjs` → the new reconcile tests FAIL (no reconcile dispatch / no reuse yet).

- [ ] **Step 3: Implement** — add `Reconcile` to `meta.phases` (first entry); add `RECONCILE_SCHEMA`; insert the wiring + reuse guard above; keep the existing Decompose block intact inside the `else`. Confirm `dispatchWithRetry`'s `maxAttempts`/`state` mirror the Decompose call's retry-config resolution for consistency.

- [ ] **Step 4: Run to verify they pass** — `node --test tests/mitosis-scheduler.test.mjs` → new tests PASS; every previously-green scheduler test still PASS.

- [ ] **Step 5: Full touched-file sweep** — `node --test tests/mitosis-scheduler.test.mjs tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js` → clean (mirror-guard still 6/6; the reconcile wiring is non-twin).

- [ ] **Step 6: No-commit review gate** — dispatch **code-reviewer + security-reviewer** in parallel on the Task 3 delta-diff (security focus: manifest is treated as an untrusted hint — no code path lets `manifest.status` drive a skip; `parseRunManifest` never throws on hostile input; the reconcile agent performs no writes). Address CRITICAL/HIGH; append the Task 3 line to progress.md. Do NOT commit.

---

### Task 4a: Per-MSP skip in `runClusterChain` + initial-manifest checkpoint (§7.3 step 3, cadence)

Skip MSPs already merged (per the reconciled set — never the manifest), and write the initial manifest once on the fresh path. All changes are in `mitosis.js` **OUTSIDE every twin**. **Review: code-reviewer + security-reviewer.**

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the per-MSP skip inside `runClusterChain` (between `integrationBranch` derivation and `phase('Plan')`); the initial-manifest checkpoint on the fresh path (after `clusters` is derived, before `runClusterChain` is invoked).
- Modify: `<lib>/tests/mitosis-scheduler.test.mjs` — skip control-flow + initial-checkpoint prompt-contract tests.

**Interfaces:**
- Per-MSP skip (uses `reconciledShipped`/`reconciledShippedMeta` from Task 3):

```
if (reconciledShipped.has(msp.id)) {
  const meta = reconciledShippedMeta.get(msp.id) || {};
  shipped.push({ mspId: msp.id, prUrl: meta.prUrl || null, mergedAt: meta.mergedAt || null, detail: 'reconciled already-merged (skip)' });
  log(`mitosis: skipping ${msp.id} — reconciled as already merged`);
  continue;
}
```

  This is the **T4 head-branch-deletion LOW fix**: an already-merged MSP is skipped one level up, so the blindable `gh pr view <branch>` (which returns nothing when the merged head branch was auto-deleted) is never reached.

- Initial-manifest checkpoint (fresh path only — skipped on reuse, since the manifest already exists):

```
if (!isRelaunch) {
  const initialManifest = buildInitialManifest({ logicalRunId, harnessRunId: input.harnessRunId, spec, repoRoot, baseBranch, sourcePrefix, clusters, msps });
  await agent(initialManifestPrompt(initialManifest), { label: 'checkpoint-init', phase: 'Reconcile' });
}
```

  where `initialManifestPrompt` embeds `JSON.stringify(initialManifest, null, 2)` verbatim and instructs: create `${repoRoot}/.mitosis/` if absent, ensure `.mitosis/` is gitignored (append to `${repoRoot}/.gitignore` if absent), write the given JSON to `${repoRoot}/.mitosis/run.json` (overwrite). Engine builds the object; the agent only writes it — deterministic and prompt-contract testable. `input.harnessRunId` is `null` unless passed via `args`.

- [ ] **Step 1: Write the failing tests**:
  - **Skip:** configure the fake so `reconcile` returns `mergedPRs` covering one of two independent MSPs; assert NO `plan`/`ship` agent is dispatched for the merged MSP, that it appears in the final report's shipped set with `detail` matching `/reconciled already-merged/`, and that the other MSP is planned and shipped normally.
  - **Initial checkpoint (fresh):** assert a `checkpoint-init`-label prompt fires on the fresh path, contains the exact `logicalRunId` and both MSP ids, matches `/\.mitosis\/run\.json/` and `/\.gitignore/`, and embeds a single JSON object (assert it does NOT instruct newline-delimited/one-object-per-line).
  - **No initial checkpoint on reuse:** with a matching manifest (Decompose-reuse path from Task 3), assert NO `checkpoint-init` prompt fires.

- [ ] **Step 2: Run to verify they fail** — new tests FAIL.

- [ ] **Step 3: Implement** the skip and the fresh-path checkpoint per the interfaces above.

- [ ] **Step 4: Run to verify they pass** — `node --test tests/mitosis-scheduler.test.mjs` → new PASS; prior green unchanged.

- [ ] **Step 5: Touched-file sweep** — `node --test tests/mitosis-scheduler.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js` → clean.

- [ ] **Step 6: No-commit review gate** — dispatch **code-reviewer + security-reviewer** (security focus: skip is gated ONLY by `reconciledShipped`; a skipped MSP never re-runs a git effect; the checkpoint write cannot leak outside `${repoRoot}/.mitosis/` and cannot un-gitignore anything). Append the Task 4a line to progress.md. Do NOT commit.

---

### Task 4b: Ship-transition manifest write replaces the NDJSON append (§7.2 cadence, §8.1 co-safety)

Convert the P1 NDJSON ship-log append into a single-object manifest read-modify-write keyed on mspId, folded into the ship agent and consolidating the `.gitignore` ensure. Change is at the ship step 8 site in `mitosis.js` — **OUTSIDE every twin**. **Review: code-reviewer + security-reviewer.**

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the ship step 8 block (anchor: `ONLY after the squash-merge succeeds` … `.mitosis/run.json` … `newline-delimited JSON`).
- Modify: `<lib>/tests/mitosis-scheduler.test.mjs` — update the P1 ship-log prompt-contract test (`F3`) and add the single-object read-modify-write contract.

**Interfaces:** rewrite ship step 8 so that, gated on `merged=true`, the agent: ensures `${repoRoot}/.mitosis/` exists and `.mitosis/` is gitignored; then performs a **defensive read-modify-write** of `${repoRoot}/.mitosis/run.json` — read+parse the existing manifest (if missing or unparseable, reconstruct a minimal `{ logicalRunId: "${logicalRunId}", msps: [] }`), set the entry with `id === "${msp.id}"` to `status: "shipped"`, `prUrl: "<the pr url>"`, `mergedAt: "<iso8601 from gh>"` (append the entry if absent), and write the whole object back (pretty-printed, single JSON object). The engine embeds the target patch `{ mspId: "${msp.id}", status: "shipped", prUrl, mergedAt }` so the transformation is exact and matches `applyShipTransition`'s semantics. Replay-safe: re-running sets the same terminal state (idempotent), consistent with §8.1's done-oracle-first ship.

- [ ] **Step 1: Update/author the failing tests** — modify the existing NDJSON ship-log test (`/\.mitosis\/run\.json/` + `/ONLY after the squash-merge succeeds/`) to assert the NEW contract instead: the ship prompt matches `/ONLY after the squash-merge succeeds/`, `/\.mitosis\/run\.json/`, instructs a single-object read-modify-write keyed on `msp.id` (e.g. matches `/status.*shipped/` and references the mspId), ensures `.gitignore`, and NO LONGER instructs newline-delimited/one-object-per-line (assert it does not match `/newline-delimited|one object per line/i`). One behavior, one home — this replaces the F3 NDJSON assertion (per testing.md placement/consolidation), it does not duplicate it.

- [ ] **Step 2: Run to verify it fails** — the updated test FAILS against the current NDJSON prompt.

- [ ] **Step 3: Implement** the single-object ship-transition write per the interface; delete the NDJSON append prose.

- [ ] **Step 4: Run to verify it passes** — `node --test tests/mitosis-scheduler.test.mjs` → PASS; all prior green unchanged.

- [ ] **Step 5: Touched-file + whole-twin sweep** — `node --test tests/mitosis-scheduler.test.mjs tests/mirror-guard.test.mjs tests/recovery.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js` → clean (mirror-guard 6/6; the ship step is non-twin).

- [ ] **Step 6: No-commit review gate** — dispatch **code-reviewer + security-reviewer** (security focus: the write is confined to `${repoRoot}/.mitosis/run.json`; the read-modify-write is defensive against a hostile/corrupt existing file; the ship-transition only ever advances status to `shipped` and cannot weaken the `.gitignore`; idempotent under whole-`agent()` replay). Append the Task 4b line to progress.md. Do NOT commit.

---

## Exit criteria (whole Increment 3B)

- [ ] `recovery.mjs` exists as TWIN #5 (byte-identical inline minus `export`); mirror-guard loop is **6/6** (`outcome`, `run-engine`, `retry`, `prepare-guard`, `recovery`, `derive-clusters`).
- [ ] Startup runs `Reconcile` before `Decompose`; a relaunch with a matching `logicalRunId` reuses the decomposition (no fresh, divergent Decompose — acceptance #1).
- [ ] The reconciled shipped-set (gh/git) is the sole skip authority; a corrupt manifest cannot skip an unmerged MSP nor block shipping it (acceptance #2).
- [ ] Manifest written on exactly the ratified cadence: initial (fresh path, post-Decompose) + ship-transition (per merged MSP, single-object, replacing the NDJSON append). `.mitosis/` gitignored, never committed.
- [ ] Already-merged MSPs are skipped one level up, so the blindable `gh pr view <branch>` is never reached (T4 head-branch-deletion LOW fixed).
- [ ] Determinism preserved: no `Date.now`/`Math.random`/`new Date` in `mitosis.js` or any twin; all timestamps sourced from `gh`/`git` in prompt text.
- [ ] Touched-file suites green: `recovery.test.mjs`, `mirror-guard.test.mjs`, `mitosis-scheduler.test.mjs` (pre-existing `generate-run-script.test.mjs` Node-v26 failures excluded).
- [ ] **ONE final whole-Increment-3 Opus review** (code-reviewer + security-reviewer over `5b4a14d`..working-tree) — consolidates the 3A Task-8.5-fix re-review and re-examines all T7 findings. Do NOT re-review shipped 3A/Task-8 work per-task; it is covered once, here.

## Deferred / out of scope (do NOT build here)

- §7.4 checkpoint-and-exit / continue-as-new (budget-threshold mid-run checkpoint) — DEFERRED; resume stays MSP-level.
- Same-session `resumeFromRunId` fast-path — an operator relaunch procedure documented in the skill, not engine logic.
- `scopesOverlap` top-level duplicate (`mitosis.js:~41`) — flagged followup, not folded.
- LOW-5 recurring config charset-allowlist (T4+T6+T7); F4 (engine trusts agent-supplied config); mitosis.js over the 800-line ceiling (twin-aware extraction followup) — all tracked, out of scope.
