# Mitosis Resilience — Increment 1 (Pillar 1: Truthful Failure Surface) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a mitosis run incapable of reporting unqualified success when any unit of work crashed — replace the overloaded `null`/`{halted}` returns with an explicit outcome-record union and an honest run partition, and surface the two shared-fate crashes (Decompose/Prepare) truthfully instead of as unhandled rejections.

**Architecture:** Extract the outcome record and the run-partition logic into a new pure ES module `outcome.mjs` (canonical, `node:test`-tested), then hand-mirror it inline into the `mitosis.js` Workflow script per this repo's established mirror discipline. Rewire the orchestration layer so the outer `parallel()` over cluster chains maps every dead/`null` chain to a `crashed` outcome, folds the durably-tracked `shipped[]` into `shipped` outcomes, and returns a single honest partition `{ shipped, halted, crashed, quarantined, overallStatus }`. Wrap the pre-fan-out Decompose (`:603`) and Prepare (`:646`) awaits so a transient drop becomes a loud `crashed` fatal report, not a whole-script rejection. Persist each ship transition to a minimal `.mitosis/run.json` via the (filesystem-capable) ship agent, since the orchestrator itself has no filesystem access.

**Tech Stack:** Node.js v26 (built-in `node:test` + `node:assert/strict`), ES modules (`.mjs`), the harness Workflow tool (`agent`/`parallel`/`log`/`phase` globals). No new third-party dependencies in Increment 1.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from the spec (`.claude/docs/superpowers/specs/2026-07-07-mitosis-resilience-hardening-design.md`) and this repo's rules.

- **Orchestrator determinism.** No `Date.now`, `Math.random`, or `new Date()` in `mitosis.js` engine code or in `outcome.mjs`. Any timestamp or entropy must arrive via `args`. This is what keeps the harness prefix-replay resume valid. (spec §3)
- **Orchestrator has no filesystem or network.** The top-level `mitosis.js` script and `runEngine` cannot read/write files or run git directly — every side effect is delegated to an `agent()` dispatch. Any manifest write in Increment 1 is performed by the ship agent, never by the orchestrator. (Workflow tool contract)
- **Mirror discipline.** Pure logic that exists both as an exported `.mjs` module and as an inline copy in `mitosis.js` (e.g. `deriveClusters`/`derive-clusters.mjs`, `aggregateMspFileScope`/`msp-file-scope.mjs`, `runEngine`/`run-engine.mjs`) MUST be kept byte-identical between the two, minus the `export` keyword. Any change to the inline copy is applied verbatim to the `.mjs` twin and vice-versa. New pure logic added in this increment (`outcome.mjs`) gets the same treatment.
- **No code comments.** Do not author comments in any file (`~/.claude/rules/common/no-comments.md`). Functional directives only (shebangs/pragmas) where a tool requires them; none are required here.
- **The engine file is live global config.** `.windful-ocean/.claude/workflows/mitosis.js` and `/Users/satanshumishra/.claude/workflows/mitosis.js` are the same physical file (shared inode 111252764). Editing the repo path edits live config. The test harness reads the absolute path `/Users/satanshumishra/.claude/workflows/mitosis.js`.
- **Commits and pushes only on explicit user request** (`~/.claude/rules/common/git/commits.md`). This plan never commits or pushes on its own. Recommended branch for the hardening: `feat/mitosis-resilience` (create off the current branch when the user asks to commit); until then, edits land in the working tree.
- **Test command.** `node --test <path-to-test-or-dir>`. Whole suite: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/`.
- **Return-contract invariant (enforced as a test).** The run may never return `overallStatus: 'all-shipped'` (or any unqualified success) if any unit is `crashed` or `quarantined`. (spec §5 Invariant)

## File Structure

- **Create** `/Users/satanshumishra/.claude/lib/superpowers-parallel/outcome.mjs` — the canonical pure module: outcome-record constructors, `partitionOutcomes`, `computeOverallStatus`, `assembleRunReport`, `fatalReport`. One responsibility: turn raw orchestration results into an honest partition. No I/O, no agents.
- **Create** `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs` — `node:test` unit tests for `outcome.mjs`, including the pure-logic F2b reproduction.
- **Modify** `/Users/satanshumishra/.claude/workflows/mitosis.js` — inline-mirror `outcome.mjs`; convert early validation returns to `fatalReport`; wrap Decompose/Prepare awaits; replace the silent-swallow at `:840-845` with `assembleRunReport`; extend the ship agent to append a minimal manifest entry.
- **Modify** `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs` — fix `trackedParallel` to the real null-mapping contract; migrate existing assertions to the new return shape; add the end-to-end F2b regression and the Decompose/Prepare crash tests.

**Interfaces produced by this increment (later increments consume these):**

```
// outcome.mjs
shippedOutcome(mspId, { prUrl, receiptsPass, d6Pass }?)      -> { kind:'shipped', mspId, prUrl, receiptsPass, d6Pass }
haltedOutcome(mspId, stage, reason)                          -> { kind:'halted', mspId, stage, reason }
crashedOutcome(mspId, stage, error)                          -> { kind:'crashed', mspId, stage, error }
quarantinedOutcome(mspId, stage, error, retries)             -> { kind:'quarantined', mspId, stage, error, retries }
computeOverallStatus({ shipped, crashed, quarantined, total }) -> 'all-shipped' | 'partial' | 'failed'
partitionOutcomes(outcomes, total?)                          -> { shipped, halted, crashed, quarantined, overallStatus }
assembleRunReport({ clusters, chainResults, shipped, mspCount }) -> { shipped, halted, crashed, quarantined, overallStatus, mspCount, stage?, mspId?, detail? }
fatalReport(stage, detail, mspCount, { crashed? }?)          -> { shipped:[], halted:[], crashed:[…], quarantined:[], overallStatus:'failed', stage, detail, mspCount }
```

The top-level `mitosis.js` return shape changes from `{ halted:<bool>, shipped:[…], mspCount }` to the partition shape above. `overallStatus` replaces the boolean `halted` as the success signal. For diagnostic back-compat, `assembleRunReport` also mirrors the first non-shipped problem's `stage`/`mspId`/`detail` at the top level when `overallStatus !== 'all-shipped'`.

---

### Task 1: Outcome record + partition pure logic (`outcome.mjs`)

**Files:**
- Create: `/Users/satanshumishra/.claude/lib/superpowers-parallel/outcome.mjs`
- Test: `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs`

**Interfaces:**
- Consumes: nothing (pure, no imports).
- Produces: `shippedOutcome`, `haltedOutcome`, `crashedOutcome`, `quarantinedOutcome`, `computeOverallStatus`, `partitionOutcomes` (signatures in File Structure above).

- [ ] **Step 1: Write the failing test**

Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shippedOutcome, haltedOutcome, crashedOutcome, quarantinedOutcome,
  computeOverallStatus, partitionOutcomes,
} from '../outcome.mjs';

test('outcome constructors tag kind and carry identity', () => {
  assert.deepEqual(shippedOutcome('m0', { prUrl: 'u', receiptsPass: true, d6Pass: true }),
    { kind: 'shipped', mspId: 'm0', prUrl: 'u', receiptsPass: true, d6Pass: true });
  assert.deepEqual(haltedOutcome('m1', 'ship', 'gate red'),
    { kind: 'halted', mspId: 'm1', stage: 'ship', reason: 'gate red' });
  assert.deepEqual(crashedOutcome('m2', 'cluster', 'thunk died'),
    { kind: 'crashed', mspId: 'm2', stage: 'cluster', error: 'thunk died' });
  assert.deepEqual(quarantinedOutcome('m3', 'execute', 'boom', 3),
    { kind: 'quarantined', mspId: 'm3', stage: 'execute', error: 'boom', retries: 3 });
});

test('all-shipped requires every MSP shipped and no crashed/quarantined', () => {
  assert.equal(computeOverallStatus({ shipped: [1, 2], crashed: [], quarantined: [], total: 2 }), 'all-shipped');
});

test('any crashed unit forbids all-shipped even if some shipped', () => {
  assert.equal(computeOverallStatus({ shipped: [1], crashed: [1], quarantined: [], total: 2 }), 'partial');
});

test('any quarantined unit forbids all-shipped', () => {
  assert.equal(computeOverallStatus({ shipped: [1, 2], crashed: [], quarantined: [1], total: 3 }), 'partial');
});

test('nothing shipped is failed', () => {
  assert.equal(computeOverallStatus({ shipped: [], crashed: [1], quarantined: [], total: 1 }), 'failed');
  assert.equal(computeOverallStatus({ shipped: [], crashed: [], quarantined: [], total: 0 }), 'failed');
});

test('partitionOutcomes splits by kind and computes overallStatus against total', () => {
  const outcomes = [
    shippedOutcome('a', { prUrl: 'ua' }),
    haltedOutcome('b', 'ship', 'gate red'),
    crashedOutcome('c', 'cluster', 'died'),
  ];
  const part = partitionOutcomes(outcomes, 3);
  assert.deepEqual(part.shipped.map((o) => o.mspId), ['a']);
  assert.deepEqual(part.halted.map((o) => o.mspId), ['b']);
  assert.deepEqual(part.crashed.map((o) => o.mspId), ['c']);
  assert.deepEqual(part.quarantined, []);
  assert.equal(part.overallStatus, 'partial');
});

test('partitionOutcomes defaults total to the outcome count', () => {
  const part = partitionOutcomes([shippedOutcome('a'), shippedOutcome('b')]);
  assert.equal(part.overallStatus, 'all-shipped');
});

test('partitionOutcomes rejects an unknown outcome kind', () => {
  assert.throws(() => partitionOutcomes([{ kind: 'bogus', mspId: 'x' }]), /unknown outcome kind/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs`
Expected: FAIL — `Cannot find module '../outcome.mjs'`.

- [ ] **Step 3: Write the module**

Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/outcome.mjs`:

```js
export function shippedOutcome(mspId, extra = {}) {
  return { kind: 'shipped', mspId, prUrl: extra.prUrl, receiptsPass: extra.receiptsPass, d6Pass: extra.d6Pass };
}

export function haltedOutcome(mspId, stage, reason) {
  return { kind: 'halted', mspId, stage, reason };
}

export function crashedOutcome(mspId, stage, error) {
  return { kind: 'crashed', mspId, stage, error };
}

export function quarantinedOutcome(mspId, stage, error, retries) {
  return { kind: 'quarantined', mspId, stage, error, retries };
}

export function computeOverallStatus({ shipped, crashed, quarantined, total }) {
  if (total > 0 && shipped.length === total && crashed.length === 0 && quarantined.length === 0) {
    return 'all-shipped';
  }
  if (shipped.length === 0) return 'failed';
  return 'partial';
}

export function partitionOutcomes(outcomes, total = outcomes.length) {
  const shipped = [];
  const halted = [];
  const crashed = [];
  const quarantined = [];
  for (const o of outcomes) {
    if (o.kind === 'shipped') shipped.push(o);
    else if (o.kind === 'halted') halted.push(o);
    else if (o.kind === 'crashed') crashed.push(o);
    else if (o.kind === 'quarantined') quarantined.push(o);
    else throw new Error(`partitionOutcomes: unknown outcome kind: ${o && o.kind}`);
  }
  const overallStatus = computeOverallStatus({ shipped, crashed, quarantined, total });
  return { shipped, halted, crashed, quarantined, overallStatus };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit** (only if the user has asked for commits)

```bash
git add .claude/lib/superpowers-parallel/outcome.mjs .claude/lib/superpowers-parallel/tests/outcome.test.mjs
git commit -m "feat(mitosis): add outcome-record union and run partition (P1)"
```

---

### Task 2: Run-report assembly + pure F2b reproduction (`assembleRunReport`, `fatalReport`)

**Files:**
- Modify: `/Users/satanshumishra/.claude/lib/superpowers-parallel/outcome.mjs`
- Test: `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs`

**Interfaces:**
- Consumes: `shippedOutcome`, `haltedOutcome`, `crashedOutcome`, `partitionOutcomes` from Task 1.
- Produces: `assembleRunReport({ clusters, chainResults, shipped, mspCount })`, `fatalReport(stage, detail, mspCount, { crashed })`.

`assembleRunReport` is the pure heart of the F2b fix: it turns the outer `parallel()` results (`chainResults`, one per cluster, each `null` | a halt object | `{ halted: false }`) plus the durable `shipped[]` list into an honest partition. A `null` chain result — the silent-swallow bug — becomes a `crashed` outcome. `fatalReport` is the uniform pre-fan-out fatal-return shape.

- [ ] **Step 1: Write the failing test**

Append to `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs`:

```js
import { assembleRunReport, fatalReport } from '../outcome.mjs';

test('assembleRunReport maps a null cluster chain to crashed, never skips it (F2b)', () => {
  const report = assembleRunReport({
    clusters: [['a'], ['b']],
    chainResults: [{ halted: false }, null],
    shipped: [{ mspId: 'a', prUrl: 'ua', receiptsPass: true, d6Pass: true }],
    mspCount: 2,
  });
  assert.equal(report.overallStatus, 'partial');
  assert.deepEqual(report.shipped.map((o) => o.mspId), ['a']);
  assert.deepEqual(report.crashed.map((o) => o.mspId), ['b']);
  assert.equal(report.crashed[0].stage, 'cluster');
  assert.equal(report.mspCount, 2);
});

test('assembleRunReport blames the first unshipped MSP in a crashed multi-MSP cluster', () => {
  const report = assembleRunReport({
    clusters: [['a', 'b', 'c']],
    chainResults: [null],
    shipped: [{ mspId: 'a', prUrl: 'ua' }],
    mspCount: 3,
  });
  assert.deepEqual(report.crashed.map((o) => o.mspId), ['b']);
});

test('assembleRunReport maps a halt object to a halted outcome and mirrors it at top level', () => {
  const report = assembleRunReport({
    clusters: [['a'], ['b']],
    chainResults: [{ halted: false }, { halted: true, stage: 'ship', mspId: 'b', detail: 'CI red on fresh base' }],
    shipped: [{ mspId: 'a', prUrl: 'ua' }],
    mspCount: 2,
  });
  assert.equal(report.overallStatus, 'partial');
  assert.deepEqual(report.halted.map((o) => o.mspId), ['b']);
  assert.equal(report.halted[0].stage, 'ship');
  assert.equal(report.stage, 'ship');
  assert.equal(report.mspId, 'b');
  assert.equal(report.detail, 'CI red on fresh base');
});

test('assembleRunReport returns all-shipped when every cluster completed and all MSPs shipped', () => {
  const report = assembleRunReport({
    clusters: [['a'], ['b']],
    chainResults: [{ halted: false }, { halted: false }],
    shipped: [{ mspId: 'a', prUrl: 'ua' }, { mspId: 'b', prUrl: 'ub' }],
    mspCount: 2,
  });
  assert.equal(report.overallStatus, 'all-shipped');
  assert.equal(report.stage, undefined);
});

test('fatalReport is a failed partition carrying stage and detail', () => {
  const r = fatalReport('input', 'args is not valid JSON', 0);
  assert.equal(r.overallStatus, 'failed');
  assert.deepEqual(r.shipped, []);
  assert.deepEqual(r.crashed, []);
  assert.equal(r.stage, 'input');
  assert.equal(r.detail, 'args is not valid JSON');
  assert.equal(r.mspCount, 0);
});

test('fatalReport with crashed:true records a crashed outcome (Decompose/Prepare crash)', () => {
  const r = fatalReport('decompose', 'agent() returned null', 0, { crashed: true });
  assert.equal(r.overallStatus, 'failed');
  assert.deepEqual(r.crashed.map((o) => o.stage), ['decompose']);
  assert.equal(r.stage, 'decompose');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs`
Expected: FAIL — `assembleRunReport is not a function` / `fatalReport is not a function`.

- [ ] **Step 3: Add the functions to `outcome.mjs`**

Append to `/Users/satanshumishra/.claude/lib/superpowers-parallel/outcome.mjs`:

```js
export function assembleRunReport({ clusters, chainResults, shipped, mspCount }) {
  const shippedIds = new Set(shipped.map((s) => s.mspId));
  const outcomes = shipped.map((s) => shippedOutcome(s.mspId, s));
  clusters.forEach((clusterIds, i) => {
    const r = chainResults[i];
    if (r === null || r === undefined) {
      const blamed = clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(crashedOutcome(blamed, 'cluster', `cluster chain returned ${r} (thunk crashed or was killed); cluster ids: ${clusterIds.join(', ')}`));
      return;
    }
    if (r.halted) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      const reason = r.detail || (r.haltReason && (r.haltReason.detail || JSON.stringify(r.haltReason))) || 'halted';
      outcomes.push(haltedOutcome(blamed, r.stage || 'unknown', reason));
    }
  });
  const partition = partitionOutcomes(outcomes, mspCount);
  const report = { ...partition, mspCount };
  if (partition.overallStatus !== 'all-shipped') {
    const firstProblem = partition.crashed[0] || partition.halted[0] || partition.quarantined[0];
    if (firstProblem) {
      report.stage = firstProblem.stage;
      report.mspId = firstProblem.mspId;
      report.detail = firstProblem.error || firstProblem.reason;
    }
  }
  return report;
}

export function fatalReport(stage, detail, mspCount, opts = {}) {
  const crashed = opts.crashed ? [crashedOutcome(null, stage, detail)] : [];
  return { shipped: [], halted: [], crashed, quarantined: [], overallStatus: 'failed', stage, detail, mspCount };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/outcome.test.mjs`
Expected: PASS — all Task 1 + Task 2 tests green.

- [ ] **Step 5: Commit** (only if the user has asked for commits)

```bash
git add .claude/lib/superpowers-parallel/outcome.mjs .claude/lib/superpowers-parallel/tests/outcome.test.mjs
git commit -m "feat(mitosis): assembleRunReport turns dead cluster chains into crashed outcomes (P1 F2b)"
```

---

### Task 3: Wire the honest partition into `mitosis.js` + end-to-end F2b regression

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` (inline-mirror `outcome.mjs`; convert early returns to `fatalReport`; replace the silent-swallow at `:840-845`)
- Modify: `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs` (fix `trackedParallel`; migrate existing assertions; add the end-to-end F2b regression)

**Interfaces:**
- Consumes: `assembleRunReport`, `fatalReport`, and the outcome constructors — inlined verbatim (mirror discipline) into `mitosis.js`.
- Produces: the new top-level return contract on `mitosis.js`.

This is the headline fix (F2b, spec §5.1). The orchestrator has no imports, so `outcome.mjs`'s functions are copied inline. The end-to-end regression is RED against current `mitosis.js` (it returns `{halted:false}` false-success) and GREEN after.

- [ ] **Step 1: Write the failing end-to-end regression test**

First, in `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`, replace the `trackedParallel` definition inside `invokeMitosis` (currently `return Promise.all(thunks.map((fn) => fn()));`) with a faithful null-mapping version that matches the real `parallel()` contract (a thrown thunk resolves to `null`, the call never rejects):

```js
  const trackedParallel = async (thunks) => {
    parallelCalls.push(thunks.length);
    return Promise.all(thunks.map((fn) => Promise.resolve().then(fn).then((v) => v, () => null)));
  };
```

Then append this test to the same file:

```js
function crashingAgent(msps, crashMspId, stage = 'plan') {
  const base = createFakeAgent({ msps });
  return async (prompt, opts = {}) => {
    if ((opts.label || '') === `${stage}:${crashMspId}`) {
      throw new Error(`injected ${stage} crash for ${crashMspId}`);
    }
    return base(prompt, opts);
  };
}

test('F2b regression: a cluster chain that dies (null from parallel) is reported as crashed, not silent success', async () => {
  const msps = twoIndependentMsps();
  const agent = crashingAgent(msps, 'b', 'plan');
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'partial');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['a']);
  assert.deepEqual(result.crashed.map((c) => c.mspId), ['b']);
  assert.equal(result.crashed[0].stage, 'cluster');
  assert.equal(result.mspCount, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails against current `mitosis.js`**

Run: `node --test --test-name-pattern='F2b regression' /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`
Expected: FAIL — current engine returns `{ halted: false, shipped: [{mspId:'a',…}], mspCount: 2 }`; `result.overallStatus` is `undefined` (not `'partial'`) and `result.crashed` is `undefined`. This is the silent-swallow reproduced.

- [ ] **Step 3: Inline-mirror `outcome.mjs` into `mitosis.js`**

Open `/Users/satanshumishra/.claude/workflows/mitosis.js`. Immediately after the `aggregateMspFileScope` function (it ends at the line `}` on line 57, before `function indexMsps(`), insert the verbatim function bodies from `outcome.mjs`, minus the `export` keywords:

```js
function shippedOutcome(mspId, extra = {}) {
  return { kind: 'shipped', mspId, prUrl: extra.prUrl, receiptsPass: extra.receiptsPass, d6Pass: extra.d6Pass };
}

function haltedOutcome(mspId, stage, reason) {
  return { kind: 'halted', mspId, stage, reason };
}

function crashedOutcome(mspId, stage, error) {
  return { kind: 'crashed', mspId, stage, error };
}

function quarantinedOutcome(mspId, stage, error, retries) {
  return { kind: 'quarantined', mspId, stage, error, retries };
}

function computeOverallStatus({ shipped, crashed, quarantined, total }) {
  if (total > 0 && shipped.length === total && crashed.length === 0 && quarantined.length === 0) {
    return 'all-shipped';
  }
  if (shipped.length === 0) return 'failed';
  return 'partial';
}

function partitionOutcomes(outcomes, total = outcomes.length) {
  const shipped = [];
  const halted = [];
  const crashed = [];
  const quarantined = [];
  for (const o of outcomes) {
    if (o.kind === 'shipped') shipped.push(o);
    else if (o.kind === 'halted') halted.push(o);
    else if (o.kind === 'crashed') crashed.push(o);
    else if (o.kind === 'quarantined') quarantined.push(o);
    else throw new Error(`partitionOutcomes: unknown outcome kind: ${o && o.kind}`);
  }
  const overallStatus = computeOverallStatus({ shipped, crashed, quarantined, total });
  return { shipped, halted, crashed, quarantined, overallStatus };
}

function assembleRunReport({ clusters, chainResults, shipped, mspCount }) {
  const shippedIds = new Set(shipped.map((s) => s.mspId));
  const outcomes = shipped.map((s) => shippedOutcome(s.mspId, s));
  clusters.forEach((clusterIds, i) => {
    const r = chainResults[i];
    if (r === null || r === undefined) {
      const blamed = clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(crashedOutcome(blamed, 'cluster', `cluster chain returned ${r} (thunk crashed or was killed); cluster ids: ${clusterIds.join(', ')}`));
      return;
    }
    if (r.halted) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      const reason = r.detail || (r.haltReason && (r.haltReason.detail || JSON.stringify(r.haltReason))) || 'halted';
      outcomes.push(haltedOutcome(blamed, r.stage || 'unknown', reason));
    }
  });
  const partition = partitionOutcomes(outcomes, mspCount);
  const report = { ...partition, mspCount };
  if (partition.overallStatus !== 'all-shipped') {
    const firstProblem = partition.crashed[0] || partition.halted[0] || partition.quarantined[0];
    if (firstProblem) {
      report.stage = firstProblem.stage;
      report.mspId = firstProblem.mspId;
      report.detail = firstProblem.error || firstProblem.reason;
    }
  }
  return report;
}

function fatalReport(stage, detail, mspCount, opts = {}) {
  const crashed = opts.crashed ? [crashedOutcome(null, stage, detail)] : [];
  return { shipped: [], halted: [], crashed, quarantined: [], overallStatus: 'failed', stage, detail, mspCount };
}
```

- [ ] **Step 4: Replace the silent-swallow at the end of the file**

In `mitosis.js`, replace the current final block (lines 840–845):

```js
const chainResults = await parallel(clusters.map((cluster) => () => runClusterChain(cluster)));
const firstHalt = chainResults.find((r) => r && r.halted);
if (firstHalt) {
  return { ...firstHalt, shipped, mspCount: msps.length };
}
return { halted: false, shipped, mspCount: msps.length };
```

with:

```js
const chainResults = await parallel(clusters.map((cluster) => () => runClusterChain(cluster)));
return assembleRunReport({ clusters, chainResults, shipped, mspCount: msps.length });
```

- [ ] **Step 5: Convert the pre-fan-out validation returns to `fatalReport`**

Replace each early fatal `return { halted: true, stage: …, detail: …, shipped: [], mspCount: … }` in `mitosis.js` with the equivalent `fatalReport(...)` call, preserving the exact `stage`/`detail`/`mspCount` values. The sites and replacements:

- Line 569 (invalid args JSON):
  `return fatalReport('input', \`args is not valid JSON: ${err.message}\`, 0);`
- Line 594 (missing required fields):
  `return fatalReport('input', \`missing or empty required fields: ${missingFields.join(', ')}\`, 0);`
- Line 597 (bad fixLoopMax):
  `return fatalReport('input', 'fixLoopMax must be a non-negative integer', 0);`
- Line 620 (duplicate MSP ids):
  `return fatalReport('decompose', \`duplicate MSP ids: ${[...new Set(duplicateIds)].join(', ')}\`, msps.length);`
- Line 624 (invalid MSP id):
  `return fatalReport('decompose', \`invalid MSP id(s) (must match ^[a-z0-9][a-z0-9-]*$): ${invalidIds.join(', ')}\`, msps.length);`
- Line 631 (unknown dependsOn):
  `return fatalReport('decompose', \`dependsOn references unknown id(s): ${unknownDepErrors.join('; ')}\`, msps.length);`
- Line 641 (cluster derivation error):
  `return fatalReport('cluster', err.message, msps.length);`

(Leave the Prepare halt at line 660 and the Decompose/Prepare awaits for Task 4.)

- [ ] **Step 6: Migrate the existing scheduler-test assertions to the new return contract**

In `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`, update the existing tests so success and failure are read from `overallStatus` and the partition arrays rather than the removed boolean `halted`. Apply these exact edits:

- **`S3 fully-serial …`**, **`S4 fully-parallel …`**, **`S6 maximally over-serialized …`**, **`an acyclic-but-misordered …`**, **`Layer 1: independent clusters …`**: replace `assert.equal(result.halted, false);` with `assert.equal(result.overallStatus, 'all-shipped');`.
- **`merge serialization: shipped[] order …`**: replace `assert.equal(result.halted, false);` with `assert.equal(result.overallStatus, 'all-shipped');` (leave the `maxActive()` and `shipped` order assertions unchanged).
- **`firstHalt selects the alphabetically-first cluster …`**: replace `assert.equal(result.halted, true);` with `assert.equal(result.overallStatus, 'partial');`. Keep `assert.equal(result.stage, 'ship');`, `assert.equal(result.mspId, 'a');`, `assert.equal(result.detail, 'a failed second');` (the top-level mirror preserves these). Replace `assert.equal(result.receiptsPass, false);` with `assert.equal(result.halted.find((o) => o.mspId === 'a').stage, 'ship');`. Replace `assert.deepEqual(result.shipped, []);` with `assert.deepEqual(result.shipped.map((s) => s.mspId), []);`.
- **`N1: a Ship-stage failure on a dependent MSP …`**: replace `assert.equal(result.halted, true);` with `assert.equal(result.overallStatus, 'failed');` (m0 ships, m1 halts — but m0 and m1 are one linear cluster; the chain halts at m1 after shipping m0, so `shipped=['m0']`, `halted=['m1']`, and with mspCount 2 and 1 shipped that is `partial`). Correct expectation: `assert.equal(result.overallStatus, 'partial');`. Keep `assert.equal(result.stage, 'ship');`, `assert.equal(result.mspId, 'm1');`. Replace `assert.equal(result.receiptsPass, false);` with `assert.equal(result.halted.find((o) => o.mspId === 'm1').stage, 'ship');`. Keep `assert.deepEqual(result.shipped.map((s) => s.mspId), ['m0']);` and `assert.equal(result.mspCount, msps.length);`.
- **`a decomposition whose dependsOn references an id not among … (decompose)`**: replace `assert.equal(result.halted, true);` with `assert.equal(result.overallStatus, 'failed');`. Keep `assert.equal(result.stage, 'decompose');`, the two `assert.match(result.detail, …)` lines, and `assert.equal(result.mspCount, msps.length);`. Replace `assert.deepEqual(result.shipped, []);` with `assert.deepEqual(result.shipped, []);` (unchanged — `fatalReport` yields `shipped: []`).
- **`N2: a genuine dependsOn cycle … (cluster)`**: replace `assert.equal(result.halted, true);` with `assert.equal(result.overallStatus, 'failed');`. Keep `assert.equal(result.stage, 'cluster');`, `assert.match(result.detail, /dependency cycle detected among:/);`, `assert.deepEqual(result.shipped, []);`, `assert.equal(result.mspCount, msps.length);`.
- **`malformed args JSON … (input)`**: replace `assert.equal(result.halted, true);` with `assert.equal(result.overallStatus, 'failed');`. Keep `assert.equal(result.stage, 'input');`, `assert.deepEqual(result.shipped, []);`, `assert.equal(result.mspCount, 0);`, `assert.equal(agentCalls, 0);`.

- [ ] **Step 7: Run the scheduler suite to verify all pass**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`
Expected: PASS — the migrated existing tests and the new `F2b regression` test are all green.

- [ ] **Step 8: Run the whole suite to confirm no mirror drift or collateral breakage**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/`
Expected: PASS — `outcome.test.mjs`, `mitosis-scheduler.test.mjs`, `run-engine.test.mjs`, and all pure-helper tests green.

- [ ] **Step 9: Verify no other consumer depends on the old boolean `halted` return**

Run: `grep -rn "\.halted" /Users/satanshumishra/.claude/workflows/parallel-plan-execution.js /Users/satanshumishra/.claude/skills/mitosis /Users/satanshumishra/.claude/skills/plan-to-task-graph`
Expected: review each hit. `runEngine`'s internal `result.halted` (a different, engine-local boolean) is unchanged and correct. If `parallel-plan-execution.js` or a SKILL reads the top-level mitosis return's boolean `halted`, update it to read `overallStatus` (report the exact change back for review before applying).

- [ ] **Step 10: Commit** (only if the user has asked for commits)

```bash
git add .claude/workflows/mitosis.js .claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs
git commit -m "feat(mitosis): honest run partition replaces silent-swallow null find (P1 F2b)"
```

---

### Task 4: Isolate the shared-fate Decompose/Prepare awaits (F2a)

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js:603` (Decompose await) and `:646` (Prepare await)
- Modify: `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`

**Interfaces:**
- Consumes: `fatalReport` (inlined in Task 3), `agent()` return contract (a transient drop surfaces as `null` after SDK retries; a hard failure throws).
- Produces: truthful `crashed` fatal reports for pre-fan-out failures instead of unhandled rejections.

Decompose and Prepare run once, serially, before any fan-out — isolation is meaningless there, so the discipline is bounded-catch-then fail-fast loudly (spec §5.2, §6.6). Increment 1 adds the truthful catch; the bounded re-dispatch is Increment 2.

- [ ] **Step 1: Write the failing tests**

Append to `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`:

```js
test('F2a: a Decompose transient drop (agent returns null) is a crashed fatal report, not an unhandled rejection', async () => {
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') return null;
    throw new Error(`unexpected agent call after decompose crash: ${opts.label}`);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'decompose');
  assert.deepEqual(result.crashed.map((o) => o.stage), ['decompose']);
  assert.deepEqual(result.shipped, []);
});

test('F2a: a Decompose throw is caught and reported as a crashed fatal report', async () => {
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') throw new Error('boom in decompose');
    throw new Error(`unexpected agent call: ${opts.label}`);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'decompose');
  assert.match(result.detail, /boom in decompose/);
});

test('F2a: a Prepare crash (agent returns null) is a crashed fatal report naming the prepare stage', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') return null;
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'prepare');
  assert.deepEqual(result.crashed.map((o) => o.stage), ['prepare']);
  assert.deepEqual(result.shipped, []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern='F2a' /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`
Expected: FAIL — the Decompose-null case throws `TypeError: Cannot read properties of null (reading 'msps')` at `const msps = decomposition.msps;` (an unhandled rejection); the Decompose-throw case rejects the whole run; the Prepare-null case throws at `prep.ready`.

- [ ] **Step 3: Wrap the Decompose await**

In `mitosis.js`, replace the Decompose block (lines 602–615, from `phase('Decompose');` through the `log(...)` after `const msps = decomposition.msps;`). Current:

```js
phase('Decompose');
const decomposition = await agent(
  `You are the decomposition stage of a mitosis run. …`,
  { agentType: 'codebase-analyst', schema: DECOMPOSE_SCHEMA, label: 'decompose', phase: 'Decompose', model: models.decomposer || 'opus' }
);

const msps = decomposition.msps;
log(`mitosis: ${msps.length} MSP(s) -> ${msps.map((m) => m.id).join(', ')}`);
```

Wrap the dispatch in try/catch and guard the null return (keep the full prompt text exactly as it currently is; only the control flow around it changes):

```js
phase('Decompose');
let decomposition;
try {
  decomposition = await agent(
    `You are the decomposition stage of a mitosis run. …`,
    { agentType: 'codebase-analyst', schema: DECOMPOSE_SCHEMA, label: 'decompose', phase: 'Decompose', model: models.decomposer || 'opus' }
  );
} catch (err) {
  return fatalReport('decompose', `decompose agent threw before fan-out: ${err.message}`, 0, { crashed: true });
}
if (!decomposition || !Array.isArray(decomposition.msps)) {
  return fatalReport('decompose', 'decompose agent returned null or no msps (transient drop or blocked before fan-out)', 0, { crashed: true });
}

const msps = decomposition.msps;
log(`mitosis: ${msps.length} MSP(s) -> ${msps.map((m) => m.id).join(', ')}`);
```

- [ ] **Step 4: Wrap the Prepare await**

In `mitosis.js`, replace the Prepare block (lines 645–661, from `phase('Prepare');` through the existing `if (!prep.ready) { … }`). Current:

```js
phase('Prepare');
const prep = await agent(
  `You are the prepare stage of a mitosis run. …`,
  { agentType: 'implementer', schema: PREP_SCHEMA, label: 'prepare', phase: 'Prepare' }
);
log(`mitosis: prepare ready=${prep.ready} (${prep.detail})`);
if (!prep.ready) {
  return { halted: true, stage: 'prepare', detail: prep.detail, shipped: [], mspCount: msps.length };
}
```

Replace with (keep the full prompt text exactly as it currently is):

```js
phase('Prepare');
let prep;
try {
  prep = await agent(
    `You are the prepare stage of a mitosis run. …`,
    { agentType: 'implementer', schema: PREP_SCHEMA, label: 'prepare', phase: 'Prepare' }
  );
} catch (err) {
  return fatalReport('prepare', `prepare agent threw before fan-out: ${err.message}`, msps.length, { crashed: true });
}
if (!prep) {
  return fatalReport('prepare', 'prepare agent returned null (transient drop or blocked before fan-out)', msps.length, { crashed: true });
}
log(`mitosis: prepare ready=${prep.ready} (${prep.detail})`);
if (!prep.ready) {
  return fatalReport('prepare', prep.detail, msps.length);
}
```

(The `!prep.ready` case is a clean, expected refusal — a validation halt, not a crash — so it uses `fatalReport` without `crashed:true`. The null/throw cases are crashes.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test --test-name-pattern='F2a' /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`
Expected: PASS — all three F2a tests green.

- [ ] **Step 6: Run the whole suite**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/`
Expected: PASS — no regression in the migrated scheduler tests or elsewhere.

- [ ] **Step 7: Commit** (only if the user has asked for commits)

```bash
git add .claude/workflows/mitosis.js .claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs
git commit -m "feat(mitosis): catch Decompose/Prepare crashes as truthful fatal reports (P1 F2a)"
```

---

### Task 5: Minimal durable `shipped[]` persistence via the ship agent (F3, minimal)

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the ship-agent prompt inside `shipOneMsp` (currently lines 806–818)
- Modify: `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`

**Interfaces:**
- Consumes: the ship agent's existing `{ merged, prUrl, receiptsPass, d6Pass, detail }` contract; the orchestrator's inability to write files (delegation required).
- Produces: a durable, append-only `.mitosis/run.json` ship log written by the ship agent after a successful squash-merge. This is the minimal manifest the spec (§5.3) folds forward into the full P3 schema.

Today `shipped[]` is memory-only (`:663`/`:828`) and lost on crash. The orchestrator cannot write files, so the ship agent — which already performs git side effects with filesystem access — appends the ship record. The write is last (after the merge succeeds) and idempotent (keyed by MSP id), so replay never double-counts.

- [ ] **Step 1: Write the failing test**

Append to `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`:

```js
test('F3 minimal: the ship prompt instructs a durable append to .mitosis/run.json after merge', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const captured = [];
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('ship:')) captured.push(prompt);
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(captured.length, 1);
  assert.match(captured[0], /\.mitosis\/run\.json/);
  assert.match(captured[0], /run\.json/);
  assert.match(captured[0], /ONLY after the squash-merge succeeds/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --test-name-pattern='F3 minimal' /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`
Expected: FAIL — the current ship prompt contains no `.mitosis/run.json` instruction; the `assert.match` on `\.mitosis\/run\.json` fails.

- [ ] **Step 3: Add the durable-append instruction to the ship prompt**

In `mitosis.js`, inside `shipOneMsp`, extend the ship-agent prompt. After the current step `6.` line (the one ending `…put the failing job/step and first failing assertion in detail.\n\n`) and before the `Return ONLY:` line, insert a new step `7.`:

```js
        `7. ONLY after the squash-merge succeeds (merged=true), durably record this ship so a crash or disconnect cannot lose it: in ${repoRoot}, ensure \`.mitosis/\` is gitignored (append \`.mitosis/\` to ${repoRoot}/.gitignore if absent), then append this MSP's ship record to ${repoRoot}/.mitosis/run.json as newline-delimited JSON — one object per line: \`{"mspId":"${msp.id}","prUrl":"<the pr url>","mergedAt":"<iso8601>"}\`. Create the file if absent. If a line with this mspId already exists (a replay), do NOT append a duplicate. This file is machine run-state, never committed.\n\n` +
```

Leave every other line of the ship prompt, and the `SHIP_SCHEMA`, unchanged. (The manifest is an agent-side side effect; the orchestrator's in-memory `shipped[]` and the honest partition are unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test --test-name-pattern='F3 minimal' /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/`
Expected: PASS — all suites green.

- [ ] **Step 6: Commit** (only if the user has asked for commits)

```bash
git add .claude/workflows/mitosis.js .claude/lib/superpowers-parallel/tests/mitosis-scheduler.test.mjs
git commit -m "feat(mitosis): ship agent durably logs each merge to .mitosis/run.json (P1 F3 minimal)"
```

---

## Increment 1 exit criteria (verify before declaring done)

- [ ] `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/` is fully green.
- [ ] The `F2b regression` test is red when `mitosis.js` is reverted to the `chainResults.find` version and green with the fix (the field false-success incident, spec §5 Acceptance P1).
- [ ] The invariant holds: no input can make `mitosis.js` return `overallStatus: 'all-shipped'` while `crashed` or `quarantined` is non-empty.
- [ ] `outcome.mjs` and its inline mirror in `mitosis.js` are byte-identical minus `export` (mirror discipline).
- [ ] `code-reviewer` dispatched on the full Increment 1 diff; CRITICAL/HIGH addressed.
- [ ] No `Date.now`/`Math.random`/`new Date` introduced; no code comments added.

## Self-Review (completed by plan author)

**Spec coverage (spec §5 + §4):**
- §5.1 kill the silent swallow at `:840-841` + honest partition → Task 3 (`assembleRunReport`, return-shape swap).
- §5.2 wrap the shared-fate bare awaits (`:603`, `:646`) → crashed outcome + loud fail-fast → Task 4.
- §5.3 durably persist `shipped[]` (minimal manifest write) → Task 5.
- §4 outcome-record union (`shipped|halted|crashed|quarantined`) + `overallStatus` partition rule → Tasks 1–2.
- §5 Invariant (enforced as a test) → Task 3 F2b regression + exit criteria.
- §5 Acceptance P1 (RED-first F2b regression; Decompose/Prepare injected crash) → Task 3 Step 1–2 (red-first), Task 4.

**Placeholder scan:** every code step contains complete code or an exact edit against a cited line range; test commands carry expected output. The two long agent prompts in `mitosis.js` (Decompose/Prepare) are shown with `…` only where the task explicitly says "keep the full prompt text exactly as it currently is" — the change there is purely the surrounding try/catch, not the prompt body.

**Type consistency:** `shippedOutcome/haltedOutcome/crashedOutcome/quarantinedOutcome`, `partitionOutcomes`, `computeOverallStatus`, `assembleRunReport`, `fatalReport` names and signatures are identical across `outcome.mjs`, its inline mirror, and every test. `overallStatus` values (`all-shipped`/`partial`/`failed`) are used consistently. `shipped` outcomes expose `.mspId`, matching existing `result.shipped.map((s) => s.mspId)` assertions.

**Out of scope for Increment 1 (carried to later plans):** `dispatchWithRetry` + idempotency reset + quarantine + timeouts (Increment 2 / Pillar 2); `.mitosis/run.json` full schema + reconcile-first recovery + done-oracle ship + observe-then-converge git preambles + Betterer gates + Prepare refuse-to-weaken (Increment 3 / Pillars 3–4). The minimal ship-log from Task 5 is designed to fold forward into the Increment 3 manifest schema.
