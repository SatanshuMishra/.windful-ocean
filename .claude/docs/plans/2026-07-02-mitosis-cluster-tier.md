# Mitosis Cluster Tier — 2-Layer Parallelization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the shipped serial-MSP Mitosis workflow into a 2-layer fractal — SPEC → CLUSTERS (parallel) → MSPs (sequential-within-cluster, JIT-planned) → TASKS — with an instance-safe engine and a serialized cross-cluster merge gate, so independent MSP groups develop concurrently while every shared branch stays green.

**Architecture:** Extract the per-MSP wave engine (`workflows/parallel-plan-execution.js`) into a pure, injectable `runEngine(engineArgs, ctx)` library so Mitosis can call it inline at the top level (no nested `workflow()`); make it instance-safe by namespacing worktrees per `branchPrefix` and moving all HEAD-mutating git into per-instance integration worktrees; add an MSP-tier cluster deriver (connected components of `deps ∪ fileScope-overlap ∪ semantic`, reusing the task-tier overlap primitives) that replaces the serial loop with a parallel cluster scheduler; serialize the merge-into-shared-base step behind an async queue gated by fresh-base + combined-state CI.

**Tech Stack:** Node ≥ 20 ESM; the Workflow-tool script runtime (`agent()`/`parallel()`/`log()`/`phase()` primitives); `node:test` + `node:assert/strict` for unit tests (files in `tests/*.test.mjs`, run via `node --test`); git worktrees; the receipts CI enforcer + composed D6 step (unchanged).

## Global Constraints

- **Spec of record:** `docs/superpowers/specs/2026-07-02-mitosis-cluster-tier-design.md`. Every task traces to it.
- **Three Pillars:** Quality > Optimization > Speed. Over-serialization is the safe default; under-serialization is a correctness bug. Cluster derivation and the merge gate are MONOTONIC — they may only ADD serialization, never remove a declared/derived edge.
- **No comments** in any code (global rule). Derive intent from code. Directive/tooling pragmas only where functionally required.
- **Immutability:** never mutate inputs; return new objects (spread). Applies to test code too.
- **Parallel-safe ⇔ dependency-independent AND fileScope-disjoint AND no semantic-boundary interaction.** All three, not just dependencies.
- **Engine invocation guard stays green:** `hooks/block-inline-engine.mjs` must keep blocking a top-level `Workflow` tool call to the engine (by name or scriptPath) and allowing `mitosis.js`. The refactor keeps `parallel-plan-execution.js` as a thin, still-guarded wrapper.
- **`~/.claude` is non-git:** building THIS feature here is a serial, human-approved apply. The `protect-claude-config` PreToolUse hook returns "ask" on workflow/lib/skill/agent writes (expected). No worktrees/merge-queue/enforcer run against `~/.claude` itself.
- **No regression for the single-chain case:** a SPEC that is one dependency chain must yield exactly one cluster and behave identically to today.
- **Model tiering stays Opus-lead + Sonnet-workers** (ratified). Only the two flagged model knobs (Phase D) change.

---

## Locked Interface Contract (every task MUST use these exact names)

These names are frozen so tasks authored independently stay consistent. Do not rename.

### `lib/superpowers-parallel/run-engine.mjs` (NEW — extracted engine)
```
export async function runEngine(engineArgs, ctx)
```
- `engineArgs`: the existing 14-key object built by `buildEngineArgs` — `{ tasks, waves, branchPrefix, baseBranch, worktreeRoot, repoRoot, scopedCheckCmd, fullValidationCmd, prompts, fixLoopMax, isolation, launchCommit, runArtifacts, models }`. Unchanged shape.
- `ctx`: `{ agent, parallel, log, phase }` — the four Workflow-script primitives the engine uses, injected (never read from ambient globals). `pipeline` is NOT used by the engine and is NOT in `ctx`.
- Returns the existing engine result object: `{ waves, halted, haltReason, isolation, boundary?, finalReview? }`. Behavior byte-identical to today's `parallel-plan-execution.js` for a single MSP.
- Instance-safety invariants (Phase A):
  - `worktreeOf(id)` → `` `${worktreeRoot}/${branchPrefix}/task-${id}` `` (namespaced by `branchPrefix`; matches how `branchOf` already namespaces). Never `${worktreeRoot}/task-${id}`.
  - A per-instance integration worktree `` `${worktreeRoot}/${branchPrefix}/integration` `` (call it `integrationWt`) is created on `baseBranch`; the wave merge, boundary validation, and final review run via `git -C ${integrationWt}` / `cd ${integrationWt}`. The engine NEVER runs `git -C ${repoRoot} checkout`.

### `workflows/parallel-plan-execution.js` (REWRITE — thin wrapper)
Becomes: read `args`, then `return runEngine(args, { agent, parallel, log, phase })`. Keeps its `meta`, its entry point, and the block-inline-engine guard target.

### `lib/superpowers-parallel/derive-clusters.mjs` (NEW — MSP-tier clusterer)
```
export function deriveClusters(msps, discoveredEdges = [])
```
- `msps`: `[{ id, dependsOn: string[], fileScope: string[] }, ...]` (decomposition order preserved).
- `discoveredEdges`: `[{ from, to, reason }]` optional MSP-level semantic edges found at decompose time.
- Returns `{ clusters, audit }` where `clusters` is `string[][]` — each inner array is one cluster's MSP ids in bottom-up (topological) order; clusters are ordered deterministically by their lexicographically-smallest member id. `audit` = `{ clusterCount, addedEdgeCount, added: [{from,to,reason}] }`.
- Edges for CLUSTER MEMBERSHIP (undirected): declared `dependsOn` ∪ `fileScope-overlap` (via `scopesOverlap` imported from `./wave-planner.mjs`) ∪ `discoveredEdges`. Connected components = clusters.
- Intra-cluster ORDER (directed): topological sort over `dependsOn` ∪ directed `discoveredEdges`. A cycle throws with the same `dependency cycle detected among: <ids>` string convention as `wave-planner.mjs`/`derive-edges.mjs`.
- Reuse, do not fork: `scopesOverlap` from `wave-planner.mjs`; mirror the cycle-detection + `unknown task` + `duplicate task id` error strings from `derive-edges.mjs`.

### `workflows/mitosis.js` (REWRITE — scheduler)
- `DECOMPOSE_SCHEMA`: each MSP gains `fileScope: { type: 'array', items: { type: 'string' } }` (added to `required` and `properties`).
- After decomposition validation: `const { clusters } = deriveClusters(msps.map(m => ({ id: m.id, dependsOn: m.dependsOn, fileScope: m.fileScope })), discoveredEdges)`.
- The serial `for (let i…)` loop is replaced by `await parallel(clusters.map((cluster) => () => runClusterChain(cluster)))`, where `runClusterChain(clusterIds)` runs that cluster's MSPs SEQUENTIALLY (JIT plan → harden → branch → execute → ship, one MSP fully before the next).
- Inside `runClusterChain`, the Execute stage calls `await runEngine(hardened.engineArgs, { agent, parallel, log, phase })` INLINE — NOT `workflow({ scriptPath: ENGINE_PATH })`.
- "Earlier MSPs" references (currently `msps.slice(0, i)` at the Plan/Ship prompts) are re-scoped to *earlier MSPs in this cluster's chain*, computed from the cluster's own ordered id list, not global array position.
- Branch stage creates the integration branch WITHOUT moving repoRoot HEAD: `git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}` (not `checkout -B`). The engine's `integrationWt` checks it out.
- Ship-into-`baseBranch` is serialized across clusters by an async merge queue: `mergeQueue = mergeQueue.then(() => shipOneMsp(...))`. Each dequeued ship re-fetches `baseBranch`, requires the PR on a fresh base (G8), and re-passes combined-state CI (receipts red→green + G9 + D6) before squash-merge.
- Per-cluster `phase` labels (e.g. `` `${branchPrefix}:Plan` ``) so concurrent clusters don't race global `phase()` state and the progress tree stays legible.

### Phase D model knobs
- `models.decomposer` (default `'opus'`): mitosis Decompose agent runs with `model: models.decomposer || 'opus'`.
- `models.tester` (default unset → inherit): the engine dispatches `agentType: 'test-engineer'` tasks with `model: models.tester` when set (via the existing `withModel` helper). `agents/test-engineer.md` doc is corrected to reference this knob instead of promising unconditional Opus. The frontmatter `model: sonnet` default remains; the caller override wins.

---

## File Structure

- `lib/superpowers-parallel/run-engine.mjs` — NEW. `runEngine(engineArgs, ctx)`; the entire current engine body, parameterized over injected primitives + instance-safe worktrees.
- `lib/superpowers-parallel/tests/run-engine.test.mjs` — NEW. Unit tests for the pure/deterministic seams (worktree namespacing, config halts, arg passthrough) using injected fake `ctx`.
- `workflows/parallel-plan-execution.js` — REWRITE to a thin wrapper over `runEngine`.
- `lib/superpowers-parallel/derive-clusters.mjs` — NEW. `deriveClusters(msps, discoveredEdges)`.
- `lib/superpowers-parallel/tests/derive-clusters.test.mjs` — NEW. Unit tests (single chain → 1 cluster; independent MSPs → N clusters; overlap/semantic merges; cycle throw; deterministic order).
- `workflows/mitosis.js` — REWRITE. Schema `fileScope`, cluster derivation, parallel scheduler, inline engine, per-instance branch, serialized merge queue, per-cluster phases.
- `agents/test-engineer.md` — EDIT. Doc reconciliation for `models.tester`.
- `hooks/block-inline-engine.mjs` + `hooks/tests/block-inline-engine.test.mjs` — VERIFY still green after the wrapper refactor; extend only if the guard target path changes.

---

## Task Index (strict dependency order)

Phase A must land before Phase B; B before C; D is independent (any time). Within the mitosis run, Phase A is the prerequisite the current serial loop hides — parallelizing clusters over a non-instance-safe engine is a correctness regression, so it is built and proven first.

- **Phase A — Instance-safe engine + `runEngine` extraction (Fix 2 + Fix 4):** A1 extract `runEngine` (ctx injection) + rewrite the workflow wrapper; A2 namespace `worktreeOf` by `branchPrefix`; A3 per-instance integration worktree for merge/boundary/final-review + instance-safe Branch; A4 keep `block-inline-engine` guard green.
- **Phase B — Cluster tier (Fix 1):** B1 `derive-clusters.mjs` + tests; B2 `DECOMPOSE_SCHEMA` `fileScope` + decompose prompt; B3 replace serial loop with parallel cluster scheduler calling `runEngine` inline; re-scope "earlier MSPs" to the cluster chain.
- **Phase C — Cross-cluster gate + serialized merge queue (Fix 3):** C1 aggregate post-Harden MSP fileScope from task graphs; C2 async serialized merge queue for Ship-into-base across clusters; C3 fresh-base + combined-state CI gate before squash-merge.
- **Phase D — Model knobs (Section 8):** D1 `models.decomposer` (default opus); D2 `models.tester` + `agents/test-engineer.md` doc reconciliation.

---

## Phase A: Instance-safe engine + runEngine extraction (Fix 2 + Fix 4)

Extract the 263-line engine body of `workflows/parallel-plan-execution.js` into a directly-importable ES module `lib/superpowers-parallel/run-engine.mjs` exporting `runEngine(engineArgs, ctx)`, reduce the workflow file to a thin wrapper, then make the engine instance-safe (namespaced task worktrees + a per-instance integration worktree) so two concurrent MSP runs cannot collide in the main tree.

**Locked names (frozen — do not rename):** `runEngine(engineArgs, ctx)`, `engineWorktreePath(worktreeRoot, branchPrefix, taskId)`. `engineArgs` is the existing 14-key object; `ctx` is `{ agent, parallel, log, phase }`. Return shape unchanged: `{ waves, halted, haltReason, isolation, boundary?, finalReview? }`.

**Affected existing tests (verified couplings to the engine source file):**
- `lib/superpowers-parallel/tests/scope-covers.test.mjs:7-10` reads `~/.claude/workflows/parallel-plan-execution.js` and slices `normalizePath`..`implementerPrompt` to reconstruct `scopeCovers`. Those helpers move to `run-engine.mjs`, so this test MUST be repointed to a direct import (folded into Task 1). Not doing so leaves a red suite.
- `lib/superpowers-parallel/tests/generate-run-script.test.mjs:73-80` asserts the engine has exactly the 14 `const X = args.X;` lines, that `buildRunScript` replaces all of them (`out.match(/\bargs\./g) === null`), and that line count is preserved. The wrapper RETAINS all 14 arg-read lines verbatim, so `buildRunScript` (`generate-run-script.mjs:18-31`, `ARG_LINE = /^const (\w+) = args\.\w+.*;$/`) still matches and this test stays green with no edit. The wrapper's dynamic-import and `return runEngine(...)` lines contain no `args.`, so the no-residual-`args.` assertion holds.
- `hooks/block-inline-engine.mjs` guards by name (`parallel-plan-execution`) and by `scriptPath` regex `/(^|\/)parallel-plan-execution\.js$/`. The wrapper keeps the same filename and `meta.name`, so the guard is unaffected (Task 4 re-verifies).

**Execution-model note (why dynamic import in the wrapper):** the workflow file is evaluated with injected globals (`args`, `agent`, `parallel`, `log`, `phase`, `workflow`) and uses a top-level `return` alongside `export const meta` — a function-wrapped execution model, not a raw ES module. Static top-level `import` is therefore not guaranteed legal in the wrapped body, and the `generate-run-script` standalone path bakes the arg values in and does not inject an `args` object. The wrapper therefore (a) loads `runEngine` via dynamic `await import(...)` resolved from `homedir()`, and (b) passes a RECONSTRUCTED `{ tasks, ... }` built from the (kept) arg-read consts rather than raw `args`, so both the live `workflow()` path and the generated standalone `.run.js` behave correctly. This satisfies the frozen contract (names, `ctx` shape, arg-reads retained) while remaining correct on both engine execution paths.

---

### Task 1: Extract `runEngine(engineArgs, ctx)` into `run-engine.mjs`; reduce the workflow file to a thin wrapper

**Files:**
- Create: `lib/superpowers-parallel/run-engine.mjs`
- Modify: `workflows/parallel-plan-execution.js` (whole file: keep `meta` at :1-10 and the 14 arg-reads at :12-25; move :26-263 into `runEngine`; delegate)
- Modify: `lib/superpowers-parallel/tests/scope-covers.test.mjs:7-10` (repoint slice → direct import)
- Test: `lib/superpowers-parallel/tests/run-engine.test.mjs`

**Interfaces:**
- Consumes (existing, unchanged): injected workflow globals `agent(prompt, opts) -> Promise<result|null>`, `parallel(thunks: (() => Promise<T>)[]) -> Promise<T[]>`, `log(msg)`, `phase(name)`; `engineArgs` = 14-key object `{ tasks, waves, branchPrefix, baseBranch, worktreeRoot, repoRoot, scopedCheckCmd, fullValidationCmd, prompts, fixLoopMax, isolation, launchCommit, runArtifacts, models }` (same shape mitosis.js passes to `workflow({ scriptPath: ENGINE_PATH }, hardened.engineArgs)` at `workflows/mitosis.js:336`).
- Produces: `export async function runEngine(engineArgs, ctx)` returning `{ waves, halted, haltReason, isolation, boundary?, finalReview? }`; plus `export function scopeCovers(scope, path)`, `export function normalizePath(p)`, `export function globToRegExp(glob)`, `export function withModel(opts, model)`.

- [ ] **Step 1: Write the failing test**

`lib/superpowers-parallel/tests/run-engine.test.mjs`
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine } from '../run-engine.mjs';

function baseArgs(overrides = {}) {
  return {
    tasks: { t1: { id: 't1', title: 'T1', fullText: 'do t1', fileScope: ['lib/a.js'], risk: 'low', agentType: 'implementer', validation: 'scoped' } },
    waves: [['t1']],
    branchPrefix: 'wf-test',
    baseBranch: 'main',
    worktreeRoot: '/tmp/wt',
    repoRoot: '/repo',
    scopedCheckCmd: 'npm test',
    fullValidationCmd: 'npm run ci',
    prompts: { implementer: 'IMPL', specReviewer: 'SPEC', qualityReviewer: 'QUAL', finalReviewer: 'FINAL' },
    fixLoopMax: 2,
    isolation: 'worktree',
    launchCommit: null,
    runArtifacts: [],
    models: {},
    ...overrides,
  };
}

function scriptedAgent(calls) {
  return async (prompt, opts) => {
    calls.push({ prompt, opts });
    const label = opts && opts.label ? opts.label : '';
    if (label.startsWith('impl:')) return { status: 'DONE' };
    if (label.startsWith('review:') || label.startsWith('spec:') || label.startsWith('qual:') || label.startsWith('sec:')) return { verdict: 'pass' };
    if (label.startsWith('integrate:')) return { merged: ['b'], conflict: false };
    if (label === 'boundary' || label === 'boundary-recheck') return { pass: true, output: 'ok' };
    if (label === 'final-review') return { summary: 'lgtm' };
    return {};
  };
}

function ctxWith(agent) {
  return {
    agent,
    parallel: async (thunks) => Promise.all(thunks.map((fn) => fn())),
    log: () => {},
    phase: () => {},
  };
}

test('unknown isolation halts at config stage without invoking agent', async () => {
  let agentCalls = 0;
  const ctx = ctxWith(async () => { agentCalls += 1; return {}; });
  const result = await runEngine(baseArgs({ isolation: 'bogus' }), ctx);
  assert.equal(result.halted, true);
  assert.equal(result.haltReason.stage, 'config');
  assert.equal(agentCalls, 0);
  assert.equal(result.isolation, 'bogus');
});

test('a trivial single-wave worktree run threads through to final review', async () => {
  const calls = [];
  const result = await runEngine(baseArgs(), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);
  assert.equal(result.haltReason, null);
  assert.equal(result.boundary.pass, true);
  assert.ok(result.finalReview);
  assert.equal(result.waves.length, 1);
  assert.ok(calls.some((c) => c.opts && c.opts.label === 'impl:t1'));
  assert.ok(calls.some((c) => c.opts && c.opts.label === 'integrate:wave-0'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/superpowers-parallel/tests/run-engine.test.mjs`
Expected: FAIL with `Cannot find module '.../lib/superpowers-parallel/run-engine.mjs'` (ERR_MODULE_NOT_FOUND) — the module does not exist yet.

- [ ] **Step 3: Create `run-engine.mjs` (byte-identical body) and rewrite the workflow file as the thin wrapper; repoint scope-covers.test.mjs**

Create `lib/superpowers-parallel/run-engine.mjs` (pure helpers + schemas hoisted to module scope so `scopeCovers` is importable; every arg-bound closure and the whole driver live inside `runEngine`; `agent`/`parallel`/`log` calls are textually unchanged because they are destructured from `ctx` under the same names):
```js
const STATUS_SCHEMA = { type: 'object', properties: { status: { enum: ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT'] }, summary: { type: 'string' } }, required: ['status'] };
const REVIEW_SCHEMA = { type: 'object', properties: { verdict: { enum: ['pass', 'fail'] }, issues: { type: 'array', items: { type: 'string' } } }, required: ['verdict'] };
const MERGE_SCHEMA = { type: 'object', properties: { merged: { type: 'array', items: { type: 'string' } }, conflict: { type: 'boolean' }, conflictDetail: { type: 'string' } }, required: ['merged', 'conflict'] };
const BOUNDARY_SCHEMA = { type: 'object', properties: { pass: { type: 'boolean' }, output: { type: 'string' } }, required: ['pass'] };
const FENCE_SCHEMA = { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] };
const EXEC_AGENT_TYPES = new Set(['implementer', 'test-engineer', 'general-purpose']);

export function withModel(opts, model) { return model ? { ...opts, model } : opts; }

export function normalizePath(p) { return p.replace(/^\.\//, '').replace(/\/+$/, ''); }
export function globToRegExp(glob) {
  const body = glob.split(/(\*\*|\*|\?)/).map((part) => {
    if (part === '**') return '.*';
    if (part === '*') return '[^/]*';
    if (part === '?') return '[^/]';
    return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return new RegExp(`^${body}$`);
}
export function scopeCovers(scope, path) {
  const ns = normalizePath(scope);
  const np = normalizePath(path);
  if (/[*?]/.test(ns)) return globToRegExp(ns).test(np);
  return ns === np || np.startsWith(ns + '/');
}

export async function runEngine(engineArgs, ctx) {
  const { agent, parallel, log, phase } = ctx;

  const tasks = engineArgs.tasks;
  const waves = engineArgs.waves;
  const branchPrefix = engineArgs.branchPrefix;
  const baseBranch = engineArgs.baseBranch;
  const worktreeRoot = engineArgs.worktreeRoot;
  const repoRoot = engineArgs.repoRoot;
  const scopedCheckCmd = engineArgs.scopedCheckCmd;
  const fullValidationCmd = engineArgs.fullValidationCmd;
  const prompts = engineArgs.prompts;
  const fixLoopMax = engineArgs.fixLoopMax;
  const isolation = engineArgs.isolation || 'worktree';
  const launchCommit = engineArgs.launchCommit || null;
  const runArtifacts = engineArgs.runArtifacts;
  const models = engineArgs.models || {};

  const reviewerModel = models.reviewer || 'sonnet';
  const fixerModel = models.fixer || 'sonnet';
  const implementerModel = null;

  function branchOf(id) { return `${branchPrefix}/task-${id}`; }
  function worktreeOf(id) { return `${worktreeRoot}/task-${id}`; }

  function implementerPrompt(task, branch, wt) {
    if (isolation === 'scope-fence') {
      return `${prompts.implementer}\n\n--- THIS TASK ---\n` +
        `Work directly in the main repository working tree at ${repoRoot}. Do NOT create a worktree or a branch.\n` +
        `1. Edit ONLY files within this task's declared scope: ${JSON.stringify(task.fileScope)}. Creating or editing anything outside this scope is a hard failure.\n` +
        `2. Do NOT run any git mutation (no add, no commit, no branch, no checkout, no stash). Leave all changes uncommitted.\n` +
        `3. Follow TDD as the instructions above require.\n` +
        `4. For verification run ONLY the scoped check, never a full build/suite: \`${scopedCheckCmd}\`\n\n` +
        `Task: ${task.title}\n\n${task.fullText}\n\n` +
        `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
    }
    return `${prompts.implementer}\n\n--- THIS TASK ---\n` +
      `Set up an isolated workspace, then implement.\n` +
      `1. Create a dedicated worktree (retry once if git reports a lock):\n` +
      `   \`git -C ${repoRoot} worktree add -b ${branch} ${wt} ${baseBranch}\`\n` +
      `2. \`cd ${wt}\` and do ALL work there. Follow TDD as the instructions above require.\n` +
      `3. Bootstrap dependencies before any check (idempotent): \`ln -sfn ${repoRoot}/node_modules node_modules\`\n` +
      `4. For verification run ONLY the scoped check, never a full build/suite: \`${scopedCheckCmd}\`\n` +
      `5. Commit your work to \`${branch}\` (one or more commits). Do NOT remove the worktree.\n\n` +
      `Task: ${task.title}\n\n${task.fullText}\n\n` +
      `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
  }

  function reviewTarget(task, branch) {
    if (isolation === 'scope-fence') {
      return `Do NOT enter any worktree and do NOT mutate anything. From the main repo at ${repoRoot}, inspect READ-ONLY:\n` +
        `\`git diff ${launchCommit} -- ${task.fileScope.join(' ')}\` plus \`git status --porcelain -- ${task.fileScope.join(' ')}\`; read any untracked files the latter lists.`;
    }
    return `Do NOT create or enter a worktree. From the main repo at ${repoRoot}, inspect the change READ-ONLY:\n` +
      `\`git diff ${baseBranch}..${branch}\` and \`git diff --stat ${baseBranch}..${branch}\`.`;
  }

  function specReviewPrompt(task, branch) {
    return `${prompts.specReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n\n` +
      `Spec for this task:\n${task.fullText}\n\n` +
      `Return verdict 'pass' if the code matches the spec, else 'fail' with specific issues (file:line).`;
  }
  function qualityReviewPrompt(task, branch) {
    return `${prompts.qualityReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n` +
      `Return verdict 'pass' if quality is acceptable, else 'fail' with specific issues.`;
  }
  function mergedReviewPrompt(task, branch) {
    return `${prompts.specReviewer}\n\n${prompts.qualityReviewer}\n\n--- WHAT TO REVIEW ---\n${reviewTarget(task, branch)}\n\n` +
      `Spec for this task:\n${task.fullText}\n\n` +
      `Review in two stages. STAGE 1 (hard precondition): verify the code matches the spec; any spec mismatch is verdict 'fail' regardless of code quality. STAGE 2 (only if stage 1 passes): judge code quality. Return a single verdict: 'pass' only if BOTH stages pass, else 'fail' with specific issues (file:line).`;
  }
  function securityReviewPrompt(task, branch) {
    return `--- SECURITY REVIEW TARGET ---\n${reviewTarget(task, branch)}\n\n` +
      `Task id: ${task.id}\nTitle: ${task.title}\n\n${task.fullText}\n\n` +
      `File scope: ${JSON.stringify(task.fileScope)}\n\n` +
      `Return verdict 'pass' if no security issues are found, else 'fail' with specific issues (file:line).`;
  }
  function fixPrompt(task, branch, wt, issues) {
    if (isolation === 'scope-fence') {
      return `Apply fixes in the MAIN repository working tree at ${repoRoot} (no worktree, no branch, no git mutations; leave changes uncommitted).\n` +
        `Edit ONLY within this task's declared scope: ${JSON.stringify(task.fileScope)}.\n` +
        `1. Fix these issues:\n- ${(issues || []).join('\n- ')}\n` +
        `2. Re-run the scoped check: \`${scopedCheckCmd}\`\n\nTask context:\n${task.fullText}`;
    }
    return `Apply fixes in the EXISTING worktree for this task.\n` +
      `1. \`cd ${wt}\` (the worktree already exists on branch ${branch}).\n` +
      `2. Fix these issues:\n- ${(issues || []).join('\n- ')}\n` +
      `3. Re-run the scoped check: \`${scopedCheckCmd}\`\n` +
      `4. Commit the fixes to \`${branch}\`.\n\nTask context:\n${task.fullText}`;
  }

  async function reviewLoop(task, branch, wt, makePrompt, label, agentType) {
    let loops = 0;
    while (true) {
      const base = { label: `${label}:${task.id}`, phase: 'Waves', schema: REVIEW_SCHEMA };
      const opts = agentType ? { ...base, agentType } : base;
      const chosenModel = agentType ? (models.reviewer || null) : reviewerModel;
      const r = await agent(makePrompt(task, branch), withModel(opts, chosenModel));
      if (r && r.verdict === 'pass') return { ok: true };
      loops++;
      if (loops > fixLoopMax) return { ok: false, reason: `${label}-exhausted`, issues: r && r.issues };
      await agent(fixPrompt(task, branch, wt, r && r.issues), withModel({ label: `fix-${label}:${task.id}`, phase: 'Waves' }, fixerModel));
    }
  }

  async function runTask(taskId) {
    const task = tasks[taskId];
    const branch = branchOf(taskId);
    const wt = worktreeOf(taskId);
    const reviewMode = task.risk === 'high' ? 'three-lens' : 'merged';
    const status = await agent(implementerPrompt(task, branch, wt), withModel({ label: `impl:${taskId}`, phase: 'Waves', schema: STATUS_SCHEMA, agentType: EXEC_AGENT_TYPES.has(task.agentType) ? task.agentType : 'implementer' }, implementerModel));
    if (!status || status.status === 'BLOCKED' || status.status === 'NEEDS_CONTEXT')
      return { taskId, branch, wt, reviewMode, ok: false, reason: status ? status.status : 'null-status' };
    if (task.risk === 'high') {
      const spec = await reviewLoop(task, branch, wt, specReviewPrompt, 'spec');
      if (!spec.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: spec.reason, issues: spec.issues };
      const qual = await reviewLoop(task, branch, wt, qualityReviewPrompt, 'qual', 'code-reviewer');
      if (!qual.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: qual.reason, issues: qual.issues };
      const sec = await reviewLoop(task, branch, wt, securityReviewPrompt, 'sec', 'security-reviewer');
      if (!sec.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: sec.reason, issues: sec.issues };
    } else {
      const merged = await reviewLoop(task, branch, wt, mergedReviewPrompt, 'review', 'code-reviewer');
      if (!merged.ok) return { taskId, branch, wt, reviewMode, ok: false, reason: merged.reason, issues: merged.issues };
    }
    return { taskId, branch, wt, reviewMode, ok: true };
  }

  const result = { waves: [], halted: false, haltReason: null, isolation };

  if (isolation !== 'worktree' && isolation !== 'scope-fence') {
    result.halted = true;
    result.haltReason = { stage: 'config', detail: `unknown isolation mode: ${isolation}` };
  }
  if (!result.halted && isolation === 'scope-fence' && waves.length > 1) {
    result.halted = true;
    result.haltReason = { stage: 'config', detail: 'scope-fence isolation requires a single-wave graph' };
  }
  if (!result.halted && isolation === 'scope-fence' && !launchCommit) {
    result.halted = true;
    result.haltReason = { stage: 'config', detail: 'scope-fence isolation requires launchCommit' };
  }

  for (let w = 0; w < waves.length && !result.halted; w++) {
    const waveIds = waves[w];
    log(`Wave ${w + 1}/${waves.length}: ${waveIds.length} task(s) [${waveIds.join(', ')}] [${isolation}]`);
    const outcomes = await parallel(waveIds.map((id) => () => runTask(id)));
    const failed = outcomes.filter((o) => !o || !o.ok);
    if (failed.length > 0) {
      result.waves.push(isolation === 'scope-fence' ? { wave: w, outcomes, fence: null } : { wave: w, outcomes, merge: null });
      result.halted = true;
      result.haltReason = { stage: 'task', failed };
      break;
    }
    if (isolation === 'scope-fence') {
      const fence = await agent(
        `From the main repo at ${repoRoot}, run \`git status --porcelain=v1 -uall\` and return EVERY path it reports as a JSON array of repo-relative paths. For rename lines include both the old and the new path. Do not mutate anything.`,
        { label: `fence:wave-${w}`, phase: 'Integrate', schema: FENCE_SCHEMA });
      const declared = waveIds.flatMap((id) => tasks[id].fileScope);
      const exempt = runArtifacts || [];
      const undeclared = ((fence && fence.paths) || []).filter((p) => !exempt.includes(normalizePath(p)) && !declared.some((s) => scopeCovers(s, p)));
      result.waves.push({ wave: w, outcomes, fence: { paths: (fence && fence.paths) || [], undeclared } });
      if (!fence) {
        result.halted = true;
        result.haltReason = { stage: 'fence', detail: 'fence verification agent returned no result' };
        break;
      }
      if (undeclared.length > 0) {
        result.halted = true;
        result.haltReason = { stage: 'fence', detail: `undeclared paths touched: ${undeclared.join(', ')}`, waveTasks: waveIds };
        break;
      }
    } else {
      const okBranches = outcomes.map((o) => o.branch);
      const okWorktrees = outcomes.map((o) => o.wt);
      const merge = await agent(
        `Integrate this wave into \`${baseBranch}\` in the MAIN repo at ${repoRoot} (do not enter any worktree).\n` +
        `1. \`git -C ${repoRoot} checkout ${baseBranch}\`\n` +
        `2. For each branch in order ${JSON.stringify(okBranches)}: \`git -C ${repoRoot} merge --no-ff <branch>\`.\n` +
        `   If ANY merge reports a conflict: run \`git -C ${repoRoot} merge --abort\`, set conflict=true, record the conflicting files + branch in conflictDetail, and STOP (do not merge the rest).\n` +
        `3. If all merged cleanly, remove the spent worktrees: for each path in ${JSON.stringify(okWorktrees)} run \`git -C ${repoRoot} worktree remove --force <path>\`.\n` +
        `Return { merged: [branches merged], conflict, conflictDetail }.`,
        { label: `integrate:wave-${w}`, phase: 'Integrate', schema: MERGE_SCHEMA });
      result.waves.push({ wave: w, outcomes, merge });
      if (!merge) {
        result.halted = true;
        result.haltReason = { stage: 'merge', detail: 'merge agent returned no result' };
        break;
      }
      if (merge.conflict) {
        result.halted = true;
        result.haltReason = { stage: 'merge', detail: merge.conflictDetail };
        break;
      }
    }
  }

  if (!result.halted) {
    const where = isolation === 'scope-fence'
      ? `In the main repo working tree at ${repoRoot} (changes are uncommitted by design)`
      : `On \`${baseBranch}\` in the MAIN repo at ${repoRoot}`;
    let boundary = await agent(
      `${where}, run the FULL validation ONCE from the repo root and report pass plus the tail of output:\n\`cd ${repoRoot} && ${fullValidationCmd}\``,
      { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
    if (boundary && !boundary.pass) {
      const fixWhere = isolation === 'scope-fence'
        ? `in the main repo working tree at ${repoRoot}; stay within the union of the declared task scopes and leave changes uncommitted`
        : `on \`${baseBranch}\` (main repo at ${repoRoot}) so it passes, then commit`;
      await agent(
        `The boundary validation failed. Fix the integrated code ${fixWhere}. Failing output:\n${boundary.output}`,
        withModel({ label: 'boundary-fix', phase: 'Boundary' }, fixerModel));
      boundary = await agent(
        `${where}, re-run the full validation ONCE from the repo root and report: \`cd ${repoRoot} && ${fullValidationCmd}\``,
        { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
    }
    result.boundary = boundary;
    if (boundary && boundary.pass) {
      const reviewScope = isolation === 'scope-fence'
        ? `You are in the main repo at ${repoRoot}; the whole implementation is the uncommitted change set: \`git diff ${launchCommit}\` plus untracked files listed by \`git status --porcelain\`.`
        : `You are on \`${baseBranch}\` in the main repo at ${repoRoot} with all wave work merged.`;
      result.finalReview = await agent(
        `${prompts.finalReviewer}\n\n--- REVIEW THE WHOLE IMPLEMENTATION ---\n` +
        `Read-only. ${reviewScope} Review the complete set of changes for this effort and summarize strengths, issues, and an overall assessment.`,
        { label: 'final-review', phase: 'Final review', agentType: 'code-reviewer' });
    } else {
      result.halted = true;
      result.haltReason = { stage: 'boundary', detail: boundary && boundary.output };
    }
  }

  return result;
}
```

Rewrite `workflows/parallel-plan-execution.js` in full as the thin wrapper (keeps `meta`, keeps all 14 `const X = args.X` arg-read lines so `buildRunScript` still matches them, loads `runEngine` by dynamic import, delegates with a reconstructed args object + the four-primitive ctx):
```js
export const meta = {
  name: 'parallel-plan-execution',
  description: 'Execute an annotated plan: parallel waves with worktree or scope-fence isolation, risk-scaled spec+quality review, model-tiered agents, conflict-checked merge or deterministic fence verification, single boundary validation + final review.',
  phases: [
    { title: 'Waves' },
    { title: 'Integrate' },
    { title: 'Boundary' },
    { title: 'Final review' },
  ],
};

const tasks = args.tasks;
const waves = args.waves;
const branchPrefix = args.branchPrefix;
const baseBranch = args.baseBranch;
const worktreeRoot = args.worktreeRoot;
const repoRoot = args.repoRoot;
const scopedCheckCmd = args.scopedCheckCmd;
const fullValidationCmd = args.fullValidationCmd;
const prompts = args.prompts;
const fixLoopMax = args.fixLoopMax;
const isolation = args.isolation || 'worktree';
const launchCommit = args.launchCommit || null;
const runArtifacts = args.runArtifacts;
const models = args.models || {};

const { homedir } = await import('node:os');
const { runEngine } = await import(`file://${homedir()}/.claude/lib/superpowers-parallel/run-engine.mjs`);

return runEngine(
  { tasks, waves, branchPrefix, baseBranch, worktreeRoot, repoRoot, scopedCheckCmd, fullValidationCmd, prompts, fixLoopMax, isolation, launchCommit, runArtifacts, models },
  { agent, parallel, log, phase },
);
```

Repoint `lib/superpowers-parallel/tests/scope-covers.test.mjs:7-10` from source-slicing to a direct import (the helpers now live in `run-engine.mjs`). Replace lines 1-10:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeCovers } from '../run-engine.mjs';
```
Leave the four `test(...)` bodies (`scope-covers.test.mjs:12-33`) unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test lib/superpowers-parallel/tests/run-engine.test.mjs lib/superpowers-parallel/tests/scope-covers.test.mjs lib/superpowers-parallel/tests/generate-run-script.test.mjs`
Expected: PASS — new run-engine tests green; scope-covers green via direct import; generate-run-script `the real engine has exactly the expected arg lines...` still green (wrapper retains all 14 arg-read lines, no residual `args.`).

- [ ] **Step 5: Commit**

No commit — `~/.claude` is non-git; the change is applied in place and gated by the test above.

---

### Task 2: Namespace task worktrees by `branchPrefix` via an exported pure helper

**Files:**
- Modify: `lib/superpowers-parallel/run-engine.mjs` (add `engineWorktreePath`; change `worktreeOf` to call it)
- Test: `lib/superpowers-parallel/tests/run-engine.test.mjs` (append)

**Interfaces:**
- Consumes: `run-engine.mjs` module from Task 1.
- Produces: `export function engineWorktreePath(worktreeRoot, branchPrefix, taskId)` returning `` `${worktreeRoot}/${branchPrefix}/task-${taskId}` `` (mirrors the `branchOf` namespacing at the original `:39`). `worktreeOf(id)` inside `runEngine` becomes `engineWorktreePath(worktreeRoot, branchPrefix, id)`.

- [ ] **Step 1: Write the failing test**

Append to `lib/superpowers-parallel/tests/run-engine.test.mjs`:
```js
import { engineWorktreePath } from '../run-engine.mjs';

test('engineWorktreePath namespaces the task worktree under branchPrefix', () => {
  assert.equal(engineWorktreePath('/tmp/wt', 'wf-123', 't1'), '/tmp/wt/wf-123/task-t1');
});

test('engineWorktreePath path includes the branchPrefix segment', () => {
  const p = engineWorktreePath('/tmp/wt', 'wf-abc', 't9');
  assert.ok(p.includes('/wf-abc/'), `expected branchPrefix segment in ${p}`);
  assert.ok(p.endsWith('/task-t9'), `expected task suffix in ${p}`);
  assert.notEqual(p, '/tmp/wt/task-t9');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/superpowers-parallel/tests/run-engine.test.mjs`
Expected: FAIL with `engineWorktreePath is not a function` (the named export does not exist yet; the import binds `undefined`).

- [ ] **Step 3: Add the exported helper and route `worktreeOf` through it**

In `lib/superpowers-parallel/run-engine.mjs`, add at module scope (next to `scopeCovers`):
```js
export function engineWorktreePath(worktreeRoot, branchPrefix, taskId) {
  return `${worktreeRoot}/${branchPrefix}/task-${taskId}`;
}
```
Change the `worktreeOf` closure inside `runEngine` from:
```js
  function worktreeOf(id) { return `${worktreeRoot}/task-${id}`; }
```
to:
```js
  function worktreeOf(id) { return engineWorktreePath(worktreeRoot, branchPrefix, id); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test lib/superpowers-parallel/tests/run-engine.test.mjs`
Expected: PASS — `engineWorktreePath` returns the namespaced path; Task 1's config-halt and threaded-run tests remain green (neither asserts on the worktree path, and a single MSP with a unique `worktreeRoot` is unaffected by the extra `branchPrefix` segment).

- [ ] **Step 5: Commit**

No commit — `~/.claude` is non-git; the change is applied in place and gated by the test above.

---

### Task 3: Per-instance integration worktree for merge / boundary / final-review

**Files:**
- Modify: `lib/superpowers-parallel/run-engine.mjs` (add `integrationWt`; rewrite the worktree-isolation merge prompt, boundary run dir, boundary-fix target, and final-review scope)
- Test: `lib/superpowers-parallel/tests/run-engine.test.mjs` (append)

**Interfaces:**
- Consumes: `runEngine` and its `worktreeRoot`/`branchPrefix`/`baseBranch`/`repoRoot` locals.
- Produces: internal `const integrationWt = `${worktreeRoot}/${branchPrefix}/integration``. The worktree-isolation merge, boundary validation, boundary-fix, and final-review now operate in `integrationWt` (`git -C ${integrationWt}` / `cd ${integrationWt}`). The engine no longer emits `git -C ${repoRoot} checkout` anywhere. Scope-fence behavior is unchanged (it works in the main tree by design, single-wave only).

**Instance-safe Branch contract (documented here; edit lands in mitosis.js in Phase B/C):** because each MSP now integrates in its OWN `${worktreeRoot}/${branchPrefix}/integration` worktree cut from `${baseBranch}`, the mitosis Branch stage must stop running `git -C ${repoRoot} checkout -B ${integrationBranch}` in the shared main tree (`workflows/mitosis.js:325`) and instead prepare each MSP's integration branch without mutating the shared checkout. This task states the contract; the mitosis-side change is out of scope for Phase A.

- [ ] **Step 1: Write the failing test**

Append to `lib/superpowers-parallel/tests/run-engine.test.mjs`:
```js
test('worktree merge/boundary/final-review target the per-instance integration worktree, never a repoRoot checkout', async () => {
  const calls = [];
  const result = await runEngine(baseArgs(), ctxWith(scriptedAgent(calls)));
  assert.equal(result.halted, false);

  const integrationWt = '/tmp/wt/wf-test/integration';
  const merge = calls.find((c) => c.opts && c.opts.label === 'integrate:wave-0');
  const boundary = calls.find((c) => c.opts && c.opts.label === 'boundary');
  const final = calls.find((c) => c.opts && c.opts.label === 'final-review');

  assert.ok(merge, 'merge agent call captured');
  assert.ok(merge.prompt.includes(integrationWt), 'merge prompt targets integration worktree');
  assert.ok(merge.prompt.includes(`git -C /repo worktree add ${integrationWt} main`), 'merge prompt ensures the integration worktree exists');
  assert.ok(merge.prompt.includes(`git -C ${integrationWt} merge --no-ff`), 'merge happens inside the integration worktree');

  assert.ok(boundary.prompt.includes(`cd ${integrationWt} &&`), 'boundary validates inside the integration worktree');
  assert.ok(final.prompt.includes(integrationWt), 'final review reads the integration worktree');

  for (const c of [merge, boundary, final]) {
    assert.equal(c.prompt.includes('git -C /repo checkout'), false, `no main-tree checkout in ${c.opts.label}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/superpowers-parallel/tests/run-engine.test.mjs`
Expected: FAIL — the merge prompt still reads `git -C /repo checkout main` and contains no `/tmp/wt/wf-test/integration`, so `assert.ok(merge.prompt.includes(integrationWt), ...)` fails (and the `no main-tree checkout` assertion fails).

- [ ] **Step 3: Introduce `integrationWt` and rewrite the worktree-isolation merge / boundary / final-review**

In `lib/superpowers-parallel/run-engine.mjs`, add after the `models`-derived consts (near `implementerModel`):
```js
  const integrationWt = `${worktreeRoot}/${branchPrefix}/integration`;
```
Replace the worktree-branch merge `agent(...)` call (the `else` branch of the wave loop) with:
```js
      const okBranches = outcomes.map((o) => o.branch);
      const okWorktrees = outcomes.map((o) => o.wt);
      const merge = await agent(
        `Integrate this wave into \`${baseBranch}\` inside this MSP's dedicated integration worktree at ${integrationWt} (NEVER the main tree; do not enter any task worktree).\n` +
        `1. Ensure the integration worktree exists (idempotent): \`git -C ${repoRoot} worktree add ${integrationWt} ${baseBranch}\`. If it already exists, instead run \`cd ${integrationWt} && git checkout ${baseBranch}\`.\n` +
        `2. For each branch in order ${JSON.stringify(okBranches)}: \`git -C ${integrationWt} merge --no-ff <branch>\`.\n` +
        `   If ANY merge reports a conflict: run \`git -C ${integrationWt} merge --abort\`, set conflict=true, record the conflicting files + branch in conflictDetail, and STOP (do not merge the rest).\n` +
        `3. If all merged cleanly, remove the spent task worktrees: for each path in ${JSON.stringify(okWorktrees)} run \`git -C ${repoRoot} worktree remove --force <path>\`.\n` +
        `Return { merged: [branches merged], conflict, conflictDetail }.`,
        { label: `integrate:wave-${w}`, phase: 'Integrate', schema: MERGE_SCHEMA });
```
Replace the boundary/final-review block (`if (!result.halted) { ... }`) with the integration-worktree-aware version:
```js
  if (!result.halted) {
    const validationDir = isolation === 'scope-fence' ? repoRoot : integrationWt;
    const where = isolation === 'scope-fence'
      ? `In the main repo working tree at ${repoRoot} (changes are uncommitted by design)`
      : `On \`${baseBranch}\` inside this MSP's integration worktree at ${integrationWt}`;
    let boundary = await agent(
      `${where}, run the FULL validation ONCE and report pass plus the tail of output:\n\`cd ${validationDir} && ${fullValidationCmd}\``,
      { label: 'boundary', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
    if (boundary && !boundary.pass) {
      const fixWhere = isolation === 'scope-fence'
        ? `in the main repo working tree at ${repoRoot}; stay within the union of the declared task scopes and leave changes uncommitted`
        : `on \`${baseBranch}\` inside the integration worktree at ${integrationWt} so it passes, then commit`;
      await agent(
        `The boundary validation failed. Fix the integrated code ${fixWhere}. Failing output:\n${boundary.output}`,
        withModel({ label: 'boundary-fix', phase: 'Boundary' }, fixerModel));
      boundary = await agent(
        `${where}, re-run the full validation ONCE and report: \`cd ${validationDir} && ${fullValidationCmd}\``,
        { label: 'boundary-recheck', phase: 'Boundary', schema: BOUNDARY_SCHEMA });
    }
    result.boundary = boundary;
    if (boundary && boundary.pass) {
      const reviewScope = isolation === 'scope-fence'
        ? `You are in the main repo at ${repoRoot}; the whole implementation is the uncommitted change set: \`git diff ${launchCommit}\` plus untracked files listed by \`git status --porcelain\`.`
        : `You are on \`${baseBranch}\` inside this MSP's integration worktree at ${integrationWt} with all wave work merged.`;
      result.finalReview = await agent(
        `${prompts.finalReviewer}\n\n--- REVIEW THE WHOLE IMPLEMENTATION ---\n` +
        `Read-only. ${reviewScope} Review the complete set of changes for this effort and summarize strengths, issues, and an overall assessment.`,
        { label: 'final-review', phase: 'Final review', agentType: 'code-reviewer' });
    } else {
      result.halted = true;
      result.haltReason = { stage: 'boundary', detail: boundary && boundary.output };
    }
  }
```
The scope-fence branches of merge/boundary/final are untouched: scope-fence still works in the main tree at `repoRoot`, single-wave only. The engine now emits no `git -C ${repoRoot} checkout` (the only remaining `checkout` is `cd ${integrationWt} && git checkout ${baseBranch}`, which runs inside the per-instance worktree).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test lib/superpowers-parallel/tests/run-engine.test.mjs`
Expected: PASS — merge/boundary/final-review prompts contain `/tmp/wt/wf-test/integration`, the merge prompt ensures the worktree exists and merges inside it, boundary runs `cd /tmp/wt/wf-test/integration && ...`, and none of the three contain `git -C /repo checkout`. Task 1's threaded test still passes (it asserts only halt/boundary/finalReview shape).

- [ ] **Step 5: Commit**

No commit — `~/.claude` is non-git; the change is applied in place and gated by the test above.

---

### Task 4: Verify the `block-inline-engine` guard is still green after the refactor

**Files:**
- Test (existing, unchanged): `hooks/tests/block-inline-engine.test.mjs`
- No hook edit expected: `hooks/block-inline-engine.mjs`

**Interfaces:**
- Consumes: `decide(payload)` from `hooks/block-inline-engine.mjs` — guards the top-level `Workflow` TOOL call by `name === 'parallel-plan-execution'` and by `scriptPath` regex `/(^|\/)parallel-plan-execution\.js$/`.
- Produces: nothing new. The wrapper keeps the same filename (`workflows/parallel-plan-execution.js`) and `meta.name` (`parallel-plan-execution`), so both guard predicates still fire.

- [ ] **Step 1: Write the failing test**

No new test. The existing `hooks/tests/block-inline-engine.test.mjs` (5 tests) is the regression gate — it asserts the guard blocks the engine by name and by scriptPath, allows `mitosis.js`, allows non-`Workflow` tools, and allows a neutral `Workflow` call. The refactor keeps the wrapper's scriptPath and name identical, so this suite is the correct proof-of-no-regression as-is.

- [ ] **Step 2: Run test to verify it fails**

Not applicable — no behavior change targets the hook, so there is no red-first step. (Per the test admission gate: this task changes no hook behavior; the existing suite is the guard.) Proceed directly to Step 4 to confirm the guard stayed green through the refactor.

- [ ] **Step 3: Confirm no hook edit is required**

Inspect `hooks/block-inline-engine.mjs:1,9`: `ENGINE_NAME = 'parallel-plan-execution'` and the scriptPath regex both key on the unchanged filename/name. Because Task 1's wrapper preserves `workflows/parallel-plan-execution.js` and `meta.name`, no edit to the hook is needed. Only extend the hook if a later phase MOVES or RENAMES the engine scriptPath (e.g. if the guard target became `run-engine.mjs`); it did not — `run-engine.mjs` is imported by the wrapper, not invoked through the `Workflow` tool.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test hooks/tests/block-inline-engine.test.mjs`
Expected: PASS — all 5 tests green (blocks by name, blocks by scriptPath, allows mitosis.js, allows non-Workflow tools, allows neutral Workflow call).

- [ ] **Step 5: Commit**

No commit — `~/.claude` is non-git; the change is applied in place and gated by the test above.

---

## Phase B — Cluster tier (Fix 1)

Phase B introduces the deterministic MSP-level clusterer and rewires the mitosis scheduler from a single serial MSP loop into per-cluster sequential chains that run concurrently. The decomposer now declares each MSP's `fileScope`; `deriveClusters` folds `dependsOn`, `fileScope`-overlap, and discovered semantic edges into connected components (clusters), orders each cluster bottom-up, and the scheduler runs one chain per cluster in parallel. Phase B consumes `scopesOverlap` (from `wave-planner.mjs`) and `runEngine` (from Phase A's `run-engine.mjs`).

---

### Task 5: `deriveClusters` — the MSP-level clusterer and its tests

**Files:**
- Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/derive-clusters.mjs`
- Create `/Users/satanshumishra/.claude/lib/superpowers-parallel/tests/derive-clusters.test.mjs`

**Interfaces:**
- Consumes: `scopesOverlap` from `./wave-planner.mjs` (undirected fileScope-overlap predicate — do NOT reimplement path overlap).
- Produces: `export function deriveClusters(msps, discoveredEdges = [])` returning `{ clusters, audit }` where `clusters: string[][]` (each inner array = one cluster's MSP ids in bottom-up topological order; clusters ordered by lexicographically-smallest member id) and `audit: { clusterCount, addedEdgeCount, added: [{ from, to, reason }] }`.

Steps:

- [ ] Write the full test file first (RED — the module does not exist yet). Mirror the `derive-edges.test.mjs` convention exactly (`node:test`, `node:assert/strict`, a small factory helper):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveClusters } from '../derive-clusters.mjs';

function msp(id, extra = {}) {
  return { id, dependsOn: [], fileScope: [], ...extra };
}

test('a linear dependency chain forms exactly one cluster in bottom-up order', () => {
  const { clusters, audit } = deriveClusters([
    msp('a', { fileScope: ['lib/a.js'] }),
    msp('b', { fileScope: ['lib/b.js'], dependsOn: ['a'] }),
    msp('c', { fileScope: ['lib/c.js'], dependsOn: ['b'] }),
  ]);
  assert.deepEqual(clusters, [['a', 'b', 'c']]);
  assert.equal(audit.clusterCount, 1);
  assert.equal(audit.addedEdgeCount, 0);
});

test('two independent MSPs with disjoint fileScope form two clusters', () => {
  const { clusters, audit } = deriveClusters([
    msp('a', { fileScope: ['lib/a.js'] }),
    msp('b', { fileScope: ['lib/b.js'] }),
  ]);
  assert.deepEqual(clusters, [['a'], ['b']]);
  assert.equal(audit.clusterCount, 2);
  assert.equal(audit.addedEdgeCount, 0);
});

test('fileScope overlap with no declared dependency merges into one cluster', () => {
  const { clusters, audit } = deriveClusters([
    msp('alpha', { fileScope: ['lib/shared.js'] }),
    msp('beta', { fileScope: ['lib/shared.js'] }),
  ]);
  assert.deepEqual(clusters, [['alpha', 'beta']]);
  assert.equal(audit.clusterCount, 1);
  assert.equal(audit.addedEdgeCount, 1);
  assert.deepEqual(audit.added, [{ from: 'beta', to: 'alpha', reason: 'fileScope-overlap' }]);
});

test('a discovered semantic edge merges two otherwise-independent MSPs into one ordered cluster', () => {
  const { clusters, audit } = deriveClusters(
    [
      msp('a', { fileScope: ['lib/a.js'] }),
      msp('b', { fileScope: ['lib/b.js'] }),
    ],
    [{ from: 'b', to: 'a', reason: 'lsp-call' }],
  );
  assert.deepEqual(clusters, [['a', 'b']]);
  assert.equal(audit.clusterCount, 1);
  assert.equal(audit.addedEdgeCount, 1);
  assert.deepEqual(audit.added, [{ from: 'b', to: 'a', reason: 'lsp-call' }]);
});

test('clusters are ordered by their lexicographically smallest member id, not by decomposition order', () => {
  const { clusters } = deriveClusters([
    msp('b1', { fileScope: ['lib/one.js'] }),
    msp('b2', { fileScope: ['lib/two.js'], dependsOn: ['b1'] }),
    msp('a1', { fileScope: ['lib/three.js'] }),
  ]);
  assert.deepEqual(clusters, [['a1'], ['b1', 'b2']]);
});

test('a discovered edge contradicting a declared dependency throws the standard cycle string', () => {
  assert.throws(
    () => deriveClusters(
      [
        msp('a', { fileScope: ['lib/a.js'], dependsOn: ['b'] }),
        msp('b', { fileScope: ['lib/b.js'] }),
      ],
      [{ from: 'b', to: 'a', reason: 'lsp-call' }],
    ),
    /dependency cycle detected among: a, b/,
  );
});

test('a declared dependency cycle throws the standard cycle string', () => {
  assert.throws(
    () => deriveClusters([
      msp('x', { dependsOn: ['y'] }),
      msp('y', { dependsOn: ['x'] }),
    ]),
    /dependency cycle detected among: x, y/,
  );
});

test('a dependsOn referencing an unknown MSP throws', () => {
  assert.throws(
    () => deriveClusters([msp('a', { dependsOn: ['ghost'] })]),
    /references unknown task: ghost/,
  );
});

test('a discovered edge referencing an unknown MSP throws', () => {
  assert.throws(
    () => deriveClusters([msp('a')], [{ from: 'a', to: 'ghost', reason: 'lsp-call' }]),
    /references unknown task: ghost/,
  );
});

test('the audit tallies every derived edge with its reason', () => {
  const { audit } = deriveClusters(
    [
      msp('a', { fileScope: ['lib/shared.js'] }),
      msp('b', { fileScope: ['lib/shared.js'] }),
      msp('c', { fileScope: ['lib/c.js'] }),
    ],
    [{ from: 'c', to: 'a', reason: 'lsp-call' }],
  );
  assert.equal(audit.addedEdgeCount, 2);
  assert.deepEqual(audit.added, [
    { from: 'c', to: 'a', reason: 'lsp-call' },
    { from: 'b', to: 'a', reason: 'fileScope-overlap' },
  ]);
});

test('a duplicate MSP id throws', () => {
  assert.throws(
    () => deriveClusters([msp('a'), msp('a')]),
    /duplicate task id: a/,
  );
});
```

  Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/derive-clusters.test.mjs`
  Expected: FAIL with `ERR_MODULE_NOT_FOUND` — `Cannot find module '.../derive-clusters.mjs' imported from '.../derive-clusters.test.mjs'` (the module does not exist yet).

- [ ] Write the full module implementation (GREEN). It imports `scopesOverlap`, mirrors `derive-edges.mjs`'s indexing / `assertKnown` / Kahn cycle detection and error strings verbatim, builds an undirected adjacency for connected-components (membership over `dependsOn` ∪ `fileScope`-overlap ∪ discovered edges), and a directed dep map (`dependsOn` ∪ directed discovered edges) for the per-cluster bottom-up sort. `fileScope`-overlap contributes to membership and to the audit, but NOT to the directed ordering:

```js
import { scopesOverlap } from './wave-planner.mjs';

function indexMsps(msps) {
  if (!Array.isArray(msps)) throw new Error('msps must be an array');
  const byId = new Map();
  msps.forEach((m, index) => {
    if (!m.id) throw new Error('msp missing id');
    if (byId.has(m.id)) throw new Error(`duplicate task id: ${m.id}`);
    byId.set(m.id, { id: m.id, dependsOn: m.dependsOn || [], fileScope: m.fileScope || [], index });
  });
  return byId;
}

function assertKnown(byId, id, label) {
  if (!byId.has(id)) throw new Error(`${label} references unknown task: ${id}`);
}

function detectCycle(byId, deps) {
  const indeg = new Map();
  for (const id of byId.keys()) indeg.set(id, 0);
  for (const id of byId.keys()) for (const dep of deps.get(id)) indeg.set(id, indeg.get(id) + 1);
  const queue = [...indeg.keys()].filter((id) => indeg.get(id) === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited++;
    for (const other of byId.keys()) {
      if (deps.get(other).has(id)) {
        indeg.set(other, indeg.get(other) - 1);
        if (indeg.get(other) === 0) queue.push(other);
      }
    }
  }
  if (visited !== byId.size) {
    const remaining = [...byId.keys()].filter((id) => indeg.get(id) > 0).sort();
    throw new Error(`dependency cycle detected among: ${remaining.join(', ')}`);
  }
}

function bottomUpOrder(groupIds, deps, byId) {
  const inGroup = new Set(groupIds);
  const remaining = new Map(
    groupIds.map((id) => [id, new Set([...deps.get(id)].filter((d) => inGroup.has(d)))]),
  );
  const order = [];
  while (remaining.size > 0) {
    const ready = [...remaining.keys()]
      .filter((id) => remaining.get(id).size === 0)
      .sort((x, y) => byId.get(x).index - byId.get(y).index);
    if (ready.length === 0)
      throw new Error(`dependency cycle detected among: ${[...remaining.keys()].sort().join(', ')}`);
    for (const id of ready) {
      order.push(id);
      remaining.delete(id);
    }
    for (const set of remaining.values()) for (const id of ready) set.delete(id);
  }
  return order;
}

export function deriveClusters(msps, discoveredEdges = []) {
  const byId = indexMsps(msps);

  const deps = new Map();
  for (const [id, m] of byId) {
    const set = new Set();
    for (const dep of m.dependsOn) {
      assertKnown(byId, dep, `msp ${id} dependsOn`);
      set.add(dep);
    }
    deps.set(id, set);
  }

  const ids = [...byId.keys()];
  const adj = new Map(ids.map((id) => [id, new Set()]));
  const link = (a, b) => {
    if (a === b) return;
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const [id, set] of deps) for (const dep of set) link(id, dep);

  const added = [];
  const haveDirected = (from, to) => deps.get(from).has(to);
  const connectedDirect = (a, b) => deps.get(a).has(b) || deps.get(b).has(a);

  for (const e of discoveredEdges) {
    assertKnown(byId, e.from, 'discovered edge from');
    assertKnown(byId, e.to, 'discovered edge to');
    if (e.from === e.to || haveDirected(e.from, e.to)) continue;
    deps.get(e.from).add(e.to);
    link(e.from, e.to);
    added.push({ from: e.from, to: e.to, reason: e.reason });
  }

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[j]);
      if (!scopesOverlap(a.fileScope, b.fileScope)) continue;
      if (connectedDirect(a.id, b.id)) continue;
      link(b.id, a.id);
      added.push({ from: b.id, to: a.id, reason: 'fileScope-overlap' });
    }
  }

  detectCycle(byId, deps);

  const seen = new Set();
  const components = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    seen.add(id);
    const members = [];
    while (stack.length) {
      const cur = stack.pop();
      members.push(cur);
      for (const nb of adj.get(cur)) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    components.push(members);
  }

  const clusters = components
    .map((members) => bottomUpOrder(members, deps, byId))
    .sort((x, y) => {
      const mx = [...x].sort()[0];
      const my = [...y].sort()[0];
      return mx < my ? -1 : mx > my ? 1 : 0;
    });

  return {
    clusters,
    audit: {
      clusterCount: clusters.length,
      addedEdgeCount: added.length,
      added: added.map((e) => ({ ...e })),
    },
  };
}
```

  Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/derive-clusters.test.mjs`
  Expected: PASS — `# pass 11`, `# fail 0`.

- [ ] No commit — `~/.claude` is non-git; applied in place, gated by the test above.

---

### Task 6: Decomposer declares `fileScope` — schema + prompt

**Files:**
- Edit `/Users/satanshumishra/.claude/workflows/mitosis.js` (`DECOMPOSE_SCHEMA` at :19-40; decompose agent prompt at :151-158).

**Interfaces:**
- Consumes: nothing new.
- Produces: `DECOMPOSE_SCHEMA` whose each MSP item requires `fileScope` (`required` includes `'fileScope'`; `properties.fileScope = { type: 'array', items: { type: 'string' } }`), and a decompose prompt that instructs declaring each MSP's coarse best-effort `fileScope` grounded in the D1 stack and updates the return shape.

Verification note: `DECOMPOSE_SCHEMA` is a non-exported `const` inside `mitosis.js`, and `mitosis.js` is a harness-wrapped script (top-level `return`, ambient `args`/`agent`/`parallel`/`phase`/`log`/`workflow`), so it cannot be `import`ed and unit-tested in isolation — `node --test` is not applicable. The honest verification is a static grep assertion on the applied edit (shown below).

Steps:

- [ ] Edit `DECOMPOSE_SCHEMA` — add `'fileScope'` to `required` and add the `fileScope` property.
  Replace:

```js
        required: ['id', 'title', 'rationale', 'dependsOn'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          rationale: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
```

  with:

```js
        required: ['id', 'title', 'rationale', 'dependsOn', 'fileScope'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          rationale: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          fileScope: { type: 'array', items: { type: 'string' } },
        },
```

- [ ] Edit the decompose agent prompt (last two lines of the `agent(...)` string at :156-157) to instruct `fileScope` declaration and update the return shape.
  Replace:

```js
  `Order the MSPs BOTTOM-UP: an MSP must appear AFTER every MSP it depends on. Express every cross-MSP dependency in dependsOn using the MSP ids you assign. Assign each MSP a stable kebab-case id unique within this run.\n\n` +
  `Return ONLY the structured object: { msps: [ { id, title, rationale, dependsOn } ] }, ordered bottom-up.`,
```

  with:

```js
  `Order the MSPs BOTTOM-UP: an MSP must appear AFTER every MSP it depends on. Express every cross-MSP dependency in dependsOn using the MSP ids you assign. Assign each MSP a stable kebab-case id unique within this run.\n\n` +
  `For each MSP, declare its fileScope: the coarse, best-effort set of repository paths and globs (e.g. "src/auth/**", "lib/config.ts") naming the surface that MSP writes or owns. Ground fileScope in the SAME D1 code-intelligence stack you used above (the Graphify map for orientation, Serena / native LSP for the symbols each MSP touches, targeted Read/Grep for the seams the oracle cannot see). Coarse and slightly over-broad is correct: fileScope overlap is what clusters MSPs that must not run in parallel, so err toward naming a path when unsure.\n\n` +
  `Return ONLY the structured object: { msps: [ { id, title, rationale, dependsOn, fileScope } ] }, ordered bottom-up.`,
```

- [ ] Verify the edit statically (grep — `node --test` not applicable, per the note above):

```bash
grep -q "required: \['id', 'title', 'rationale', 'dependsOn', 'fileScope'\]," /Users/satanshumishra/.claude/workflows/mitosis.js \
  && grep -q "fileScope: { type: 'array', items: { type: 'string' } }," /Users/satanshumishra/.claude/workflows/mitosis.js \
  && grep -q "{ id, title, rationale, dependsOn, fileScope }" /Users/satanshumishra/.claude/workflows/mitosis.js \
  && echo "task6 schema+prompt OK"
```

  Expected: prints `task6 schema+prompt OK` and exits 0 (all three anchors present).

- [ ] No commit — `~/.claude` is non-git; applied in place, gated by the grep check above.

---

### Task 7: Parallel cluster scheduler — `runClusterChain` + inline `runEngine`

**Files:**
- Edit `/Users/satanshumishra/.claude/workflows/mitosis.js` — insert the clusterer call after the decompose validation (after :185), and replace the serial `for (let i = 0; i < msps.length; i++) { ... }` loop plus the final `return` (:205-381) with the parallel cluster scheduler.

**Interfaces:**
- Consumes: `deriveClusters` (Task 5) via dynamic import; `runEngine` (Phase A's `lib/superpowers-parallel/run-engine.mjs`) via dynamic import, called inline as `await runEngine(hardened.engineArgs, { agent, parallel, log, phase })`; ambient `parallel`, `agent`, `phase`, `log` (Phase C hardens `phase`/`parallel` for concurrency — out of scope here).
- Produces: `clusters` derived from the MSP graph; an `async function runClusterChain(clusterIds)` that runs a cluster's MSPs sequentially through the existing Plan→Harden→Branch→Execute→Ship body (JIT, one MSP fully before the next); and the driver `await parallel(clusters.map((cluster) => () => runClusterChain(cluster)))` with fail-first halt aggregation.

Design notes (load-bearing):
- `mitosis.js` is a harness-wrapped async function body (it uses top-level `return` and top-level `await`), so modules are loaded with dynamic `import()` using explicit `file://` URLs (base-independent), not top-level `import` statements.
- `runClusterChain` closes over the surrounding scope: `spec`, `repoRoot`, `baseBranch`, `sourcePrefix`, `verify`, `models`, `fixLoopMax`, `worktreeRoot`, `shipped`, `mspById`, `runEngine`, plus the ambient `agent`/`parallel`/`phase`/`log`. `shipped.push(...)` from concurrent chains is safe on Node's single-threaded event loop.
- The per-MSP `return { halted: true, ... }` statements now return from `runClusterChain` (ending that chain early) rather than from the workflow. The driver collects chain results and returns the first halt (with shared `shipped`/`mspCount` merged in), else success.
- "Earlier MSPs" is re-scoped from global array position (`msps.slice(0, i)`) to the prefix of THIS cluster's ordered chain (`clusterIds.slice(0, chainIdx)`).

Steps:

- [ ] Insert the dynamic imports and the clusterer call immediately after the `orderingErrors` halt block (after :185), before `phase('Prepare')`:

```js
const importLib = (name) => import(`file://${LIB_DIR}/${name}`);
const { deriveClusters } = await importLib('derive-clusters.mjs');
const { runEngine } = await importLib('run-engine.mjs');

let clusters;
try {
  ({ clusters } = deriveClusters(
    msps.map((m) => ({ id: m.id, dependsOn: m.dependsOn, fileScope: m.fileScope })),
    [],
  ));
} catch (err) {
  return { halted: true, stage: 'cluster', detail: err.message, shipped: [], mspCount: msps.length };
}
log(`mitosis: ${clusters.length} cluster(s) -> ${clusters.map((c) => c.join('>')).join(' | ')}`);
```

- [ ] Replace the entire serial loop and the trailing `return` (current :205-381) with the cluster scheduler. Everything inside `runClusterChain` below is the CURRENT Plan/Harden/Branch/Execute/Ship body, with exactly three changes: (a) `msp` comes from `mspById.get(...)`, (b) the "earlier MSPs" phrasing uses `earlierInChain` (this cluster's chain prefix), (c) Execute calls `runEngine(...)` inline instead of `workflow({ scriptPath: ENGINE_PATH })`, and the per-MSP halts drop `shipped`/`mspCount` (the driver merges them once):

```js
const shipped = [];
const mspById = new Map(msps.map((m) => [m.id, m]));

async function runClusterChain(clusterIds) {
  for (let chainIdx = 0; chainIdx < clusterIds.length; chainIdx++) {
    const msp = mspById.get(clusterIds[chainIdx]);
    const branchPrefix = `${sourcePrefix}/${msp.id}`;
    const integrationBranch = `${branchPrefix}-integration`;
    const earlierInChain = clusterIds.slice(0, chainIdx).join(', ') || '(none)';

    phase('Plan');
    const planned = await agent(
      `You are the planning stage for MSP "${msp.id}" (${msp.title}) of a mitosis run. You have NO Skill tool.\n\n` +
      `Locate the superpowers writing-plans skill WITHOUT hardcoding its version: run \`node ${LIB_DIR}/resolve-superpowers.mjs\` if it prints a skillsDir, otherwise glob \`/Users/satanshumishra/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/writing-plans/SKILL.md\`. Read that SKILL.md and follow it exactly.\n\n` +
      `Scope: produce an implementation plan for ONLY this MSP: ${msp.rationale}\n` +
      `Target repo: ${repoRoot}. Earlier MSPs in this cluster's chain (already planned/merged) you may depend on: ${earlierInChain}.\n\n` +
      `Write the plan to: ${repoRoot}/.mitosis/${msp.id}.plan.md (create the .mitosis directory if absent).\n\n` +
      `Return ONLY: { planPath: "<absolute path to the plan you wrote>", summary: "<one sentence>" }.`,
      { agentType: 'implementer', schema: PLAN_SCHEMA, label: `plan:${msp.id}`, phase: 'Plan' }
    );
    log(`mitosis[${msp.id}]: planned -> ${planned.planPath}`);

    phase('Harden');
    const hardened = await agent(
      `You are the harden+route stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
      `Read and follow: ${GRAPH_SKILL}\n` +
      `Input plan: ${planned.planPath}\n\n` +
      `1. Follow plan-to-task-graph to author the intent layer and run semantic discovery (native LSP call hierarchy + Graphify), writing the discovered-edges JSON, then run the deterministic hardener exactly:\n` +
      `   node ${LIB_DIR}/derive-edges.mjs ${planned.planPath.replace(/\.md$/, '.graph.json')} ${planned.planPath.replace(/\.md$/, '.discovered-edges.json')} --out ${planned.planPath.replace(/\.md$/, '.graph.json')} --audit ${planned.planPath.replace(/\.md$/, '.edges-audit.json')}\n` +
      `   If it exits non-zero (dependency cycle), STOP and return an engineArgs/route that you could not build is NOT acceptable — instead fix the plan's dependsOn and re-run; a cycle is a hard error.\n\n` +
      `2. Compute waves and route via Node (one-off script using the repo's installed modules):\n` +
      `   - import { validateGraph } from '${LIB_DIR}/generate-run-script.mjs' and call it on the parsed graph to get { waves }.\n` +
      `   - import { planRoute } from '${LIB_DIR}/route-planner.mjs'; gather the runtime signals from the repo at ${repoRoot} (T = task count, W = wave count, D = max wave width, S = total file scopes, GIT = is the repo a git repo, WF = workflows enabled, cleanTree = git status clean, plus exploratory/consentRecorded/wallClockOver30m/topTierSession as false unless you can determine otherwise) and call planRoute to get { rule, lane, isolation, N, notes }.\n` +
      `   - import { resolveAll } from '${LIB_DIR}/resolve-superpowers.mjs' and call it to get resolved.prompts, an object shaped { key: { text, source, path } }. Flatten it to a plain string map BEFORE passing it anywhere: prompts = Object.fromEntries(Object.entries(resolved.prompts).map(([k, v]) => [k, v.text])). Do NOT pass resolved.prompts itself.\n` +
      `   - Determine runArtifacts: read ${ENGINE_PATH}, find every use of \`runArtifacts\`, and construct an object that satisfies those reads (include the plan path ${planned.planPath} and the graph path).\n\n` +
      `3. Assemble the engine args with the pure helper, passing the orchestration context so all 14 keys are present:\n` +
      `   First build the id-keyed tasks map (the engine indexes tasks by id, NOT by array position): tasks = Object.fromEntries(graph.tasks.map((t) => [t.id, { id: t.id, title: t.title, fullText: t.fullText, fileScope: t.fileScope, risk: t.risk, agentType: t.agentType || 'implementer', validation: t.validation }])). Do NOT pass the raw graph.tasks array as tasks.\n` +
      `   import { buildEngineArgs } from '${LIB_DIR}/engine-args.mjs' and call buildEngineArgs({ tasks, waves, branchPrefix: ${JSON.stringify(branchPrefix)}, baseBranch: ${JSON.stringify(integrationBranch)}, worktreeRoot: ${JSON.stringify(worktreeRoot)}, repoRoot: ${JSON.stringify(repoRoot)}, scopedCheckCmd: ${JSON.stringify(verify.scopedCheckCmd || '')}, fullValidationCmd: ${JSON.stringify(verify.fullValidationCmd || '')}, prompts, fixLoopMax: ${fixLoopMax}, isolation: 'worktree', launchCommit: null, runArtifacts, models: ${JSON.stringify(models)} }). It throws if any required key is missing.\n\n` +
      `Return ONLY: { engineArgs: <the 14-key object>, route: { rule, lane, isolation, N, notes } }.`,
      { agentType: 'implementer', schema: HARDEN_SCHEMA, label: `harden:${msp.id}`, phase: 'Harden' }
    );
    log(`mitosis[${msp.id}]: hardened lane=${hardened.route.lane} isolation=worktree(forced) N~${hardened.route.N}`);

    if (
      hardened.engineArgs.baseBranch !== integrationBranch ||
      hardened.engineArgs.isolation !== 'worktree' ||
      hardened.engineArgs.branchPrefix !== branchPrefix
    ) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: `engineArgs invariant violated: baseBranch=${hardened.engineArgs.baseBranch} isolation=${hardened.engineArgs.isolation} branchPrefix=${hardened.engineArgs.branchPrefix}`,
      };
    }

    if (
      typeof hardened.engineArgs.tasks !== 'object' ||
      hardened.engineArgs.tasks === null ||
      Array.isArray(hardened.engineArgs.tasks)
    ) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: `engineArgs.tasks must be a non-null, non-array object; got ${Array.isArray(hardened.engineArgs.tasks) ? 'array' : typeof hardened.engineArgs.tasks}`,
      };
    }

    if (!Array.isArray(hardened.engineArgs.waves)) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: `engineArgs.waves must be an array; got ${typeof hardened.engineArgs.waves}`,
      };
    }

    const waveTaskIds = (hardened.engineArgs.waves || []).flat();
    const taskKeys = Object.keys(hardened.engineArgs.tasks);
    const taskKeySet = new Set(taskKeys);
    const waveIdSet = new Set(waveTaskIds);
    const tasksWavesMismatch =
      taskKeySet.size !== waveIdSet.size ||
      waveTaskIds.some((id) => !taskKeySet.has(id)) ||
      taskKeys.some((id) => !waveIdSet.has(id));
    if (tasksWavesMismatch) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: `engineArgs.tasks keys (${taskKeys.join(', ')}) do not match the task ids referenced in engineArgs.waves (${waveTaskIds.join(', ')})`,
      };
    }

    if (
      typeof hardened.engineArgs.prompts !== 'object' ||
      hardened.engineArgs.prompts === null ||
      Array.isArray(hardened.engineArgs.prompts) ||
      !Object.values(hardened.engineArgs.prompts).every((v) => typeof v === 'string')
    ) {
      return {
        halted: true,
        stage: 'harden',
        mspId: msp.id,
        detail: 'engineArgs.prompts must be a non-null, non-array object whose values are all strings',
      };
    }

    phase('Branch');
    const branched = await agent(
      `You are the branch-prep stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
      `Cut this MSP's integration branch FRESH from the latest pushed base so it stacks bottom-up on already-merged MSPs and re-fetches origin each iteration. Operate against the main repo at ${repoRoot}; do NOT enter any worktree.\n` +
      `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`\n` +
      `2. \`git -C ${repoRoot} checkout -B ${integrationBranch} origin/${baseBranch}\`\n\n` +
      `If both succeed, set ready=true. If the fetch or checkout fails (no remote, missing base, detached state), set ready=false and explain in detail.\n\n` +
      `Return ONLY: { ready: <bool>, detail: "<what happened>" }.`,
      { agentType: 'implementer', schema: BRANCH_SCHEMA, label: `branch:${msp.id}`, phase: 'Branch' }
    );
    log(`mitosis[${msp.id}]: branch ready=${branched.ready} (${branched.detail})`);
    if (!branched.ready) {
      return { halted: true, stage: 'branch', mspId: msp.id, detail: branched.detail };
    }

    phase('Execute');
    const engineResult = await runEngine(hardened.engineArgs, { agent, parallel, log, phase });
    if (engineResult.halted) {
      log(`mitosis[${msp.id}]: engine HALTED at ${engineResult.haltReason && engineResult.haltReason.stage}`);
      return {
        halted: true,
        stage: 'execute',
        mspId: msp.id,
        haltReason: engineResult.haltReason,
      };
    }
    log(`mitosis[${msp.id}]: engine OK boundary=${engineResult.boundary && engineResult.boundary.pass}`);

    phase('Ship');
    const ship = await agent(
      `You are the ship stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
      `Repo: ${repoRoot}. The engine has already integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, merged, never pushed).\n` +
      `Branch contract is PRE-RESOLVED: head = ${JSON.stringify(integrationBranch)}, base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
      `1. Publish the integration branch: \`git -C ${repoRoot} push -u origin ${integrationBranch}\`.\n` +
      `2. Open ONE pull request with head ${integrationBranch} onto base ${baseBranch}, stacked bottom-up (this MSP depends on already-merged MSPs in this cluster: ${earlierInChain}).\n` +
      `3. Wait for CI to complete (receipts enforcer + D6 cluster-boundary check + PR-title lint) using \`gh run watch --exit-status\`.\n` +
      `4. If green, squash-merge the PR at the published boundary (one squash per MSP). If red, do NOT merge.\n\n` +
      `Return ONLY: { merged: <bool>, prUrl: "<url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<summary>" }.`,
      { agentType: 'implementer', schema: SHIP_SCHEMA, label: `ship:${msp.id}`, phase: 'Ship' }
    );
    if (!ship.merged) {
      log(`mitosis[${msp.id}]: ship BLOCKED (${ship.detail})`);
      return {
        halted: true,
        stage: 'ship',
        mspId: msp.id,
        detail: ship.detail,
        receiptsPass: ship.receiptsPass,
        d6Pass: ship.d6Pass,
      };
    }
    log(`mitosis[${msp.id}]: shipped -> ${ship.prUrl}`);

    shipped.push({ mspId: msp.id, prUrl: ship.prUrl, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass });
  }
  return { halted: false };
}

const chainResults = await parallel(clusters.map((cluster) => () => runClusterChain(cluster)));
const firstHalt = chainResults.find((r) => r && r.halted);
if (firstHalt) {
  return { ...firstHalt, shipped, mspCount: msps.length };
}
return { halted: false, shipped, mspCount: msps.length };
```

- [ ] Verify the "earlier MSPs" re-scope is semantics-preserving. Before → after of the computation used in the Plan prompt (:216) and Ship prompt (:356):

  Before (global array position):
  ```js
  msps.slice(0, i).map((m) => m.id).join(', ') || '(none)'
  ```
  After (this cluster's ordered chain prefix):
  ```js
  clusterIds.slice(0, chainIdx).join(', ') || '(none)'
  ```

  For a fully linear declared chain (`m0`, `m1 dependsOn m0`, `m2 dependsOn m1`, ...), `deriveClusters` returns exactly ONE cluster whose order equals the decomposition order `[m0, m1, m2, ...]`. Then `clusterIds === [m0, m1, m2, ...]`, and for the MSP at `chainIdx = i`, `clusterIds.slice(0, i)` yields exactly the ids `msps.slice(0, i).map((m) => m.id)` produced — byte-identical earlier-MSP list. With a single cluster, `await parallel([() => runClusterChain(chain)])` runs that one chain sequentially, i.e. identical to today's serial `for` loop.

- [ ] Prove the single-chain equivalence with the tested Task 5 module (runnable):

```bash
node --input-type=module -e "import { deriveClusters } from 'file:///Users/satanshumishra/.claude/lib/superpowers-parallel/derive-clusters.mjs'; import assert from 'node:assert/strict'; const { clusters } = deriveClusters([{id:'m0',dependsOn:[],fileScope:['a']},{id:'m1',dependsOn:['m0'],fileScope:['b']},{id:'m2',dependsOn:['m1'],fileScope:['c']}]); assert.equal(clusters.length, 1); assert.deepEqual(clusters[0], ['m0','m1','m2']); console.log('single-chain-equivalence OK');"
```

  Expected: prints `single-chain-equivalence OK`, exit 0 (one cluster, decomposition order preserved ⇒ the re-scoped slice equals the old global slice ⇒ a linear plan behaves exactly as today).

- [ ] Verify the loop shape swap structurally (grep):

```bash
grep -q 'await parallel(clusters.map((cluster) => () => runClusterChain(cluster)))' /Users/satanshumishra/.claude/workflows/mitosis.js \
  && grep -q 'await runEngine(hardened.engineArgs, { agent, parallel, log, phase })' /Users/satanshumishra/.claude/workflows/mitosis.js \
  && ! grep -q 'for (let i = 0; i < msps.length; i++)' /Users/satanshumishra/.claude/workflows/mitosis.js \
  && ! grep -q "workflow({ scriptPath: ENGINE_PATH }" /Users/satanshumishra/.claude/workflows/mitosis.js \
  && echo "task7 scheduler shape OK"
```

  Expected: prints `task7 scheduler shape OK`, exit 0 (parallel driver + inline `runEngine` present; serial loop and `workflow({ scriptPath: ENGINE_PATH })` gone).

- [ ] No commit — `~/.claude` is non-git; applied in place, gated by the checks above.

---

## Phase C — Cross-cluster overlap gate + serialized merge queue (Fix 3)

Phase B replaced the serial per-MSP `for` loop with `await parallel(clusters.map((cluster) => () => runClusterChain(cluster)))`, so multiple clusters now reach the Ship stage at the same time and every MSP PR still merges into the ONE shared `baseBranch`. Phase C makes those merges safe: it (a) exposes each MSP's authoritative write-set as the union of its task-graph `fileScope`s, (b) funnels every merge-into-`baseBranch` through a single module-level promise chain so exactly one ship runs at a time, and (c) re-validates each ship on the FRESH combined base (rebase → receipts red→green + G9 + D6 on the post-rebase state) before squash-merge. A cross-cluster interaction the coarse plan-time clustering missed (native-LSP recall < 100%) can therefore never land unrevalidated.

Note on testability: only the pure helper `aggregateMspFileScope` is unit-testable in isolation and gets real `node --test` coverage. The `mitosis.js` workflow-script edits (mergeQueue, `shipOneMsp`, the Branch and ship prompts) are agent-orchestration glue that cannot run under `node --test`; those steps carry the real code plus an honest concrete verification (a reasoning proof and/or a `grep -F` / `node -e` assertion with exact expected output).

---

### Task 8: `aggregateMspFileScope` pure helper + post-Harden wiring

**Files:**
- `lib/superpowers-parallel/msp-file-scope.mjs` (NEW)
- `lib/superpowers-parallel/tests/msp-file-scope.test.mjs` (NEW)
- `workflows/mitosis.js` (add import at top; insert the post-Harden call after the Harden validation block, before `phase('Branch')` at :320)

**Interfaces:**
- Consumes: `hardened.engineArgs.tasks` — the id-keyed tasks map built at `mitosis.js:237` (`Object.fromEntries(graph.tasks.map((t) => [t.id, { id, title, fullText, fileScope, risk, agentType, validation }]))`).
- Produces: `export function aggregateMspFileScope(tasksMap) -> string[]` (sorted, de-duplicated union of every task's `fileScope`); a per-MSP local `const aggregatedScope` in `mitosis.js` available to the ship/audit path.

Steps:

- [ ] Write the RED test `lib/superpowers-parallel/tests/msp-file-scope.test.mjs` FIRST (module does not exist yet). Follow the `derive-edges.test.mjs` convention exactly (`node:test`, `node:assert/strict`, relative import):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMspFileScope } from '../msp-file-scope.mjs';

test('unions fileScope across all tasks in the id-keyed map', () => {
  const tasksMap = {
    t1: { id: 't1', fileScope: ['lib/a.js', 'lib/b.js'] },
    t2: { id: 't2', fileScope: ['lib/c.js'] },
  };
  assert.deepEqual(aggregateMspFileScope(tasksMap), ['lib/a.js', 'lib/b.js', 'lib/c.js']);
});

test('deduplicates paths shared across tasks and repeated within a task', () => {
  const tasksMap = {
    t1: { id: 't1', fileScope: ['lib/shared.js', 'lib/shared.js'] },
    t2: { id: 't2', fileScope: ['lib/shared.js', 'lib/only.js'] },
  };
  assert.deepEqual(aggregateMspFileScope(tasksMap), ['lib/only.js', 'lib/shared.js']);
});

test('returns the union sorted lexicographically regardless of input order', () => {
  const tasksMap = {
    t1: { id: 't1', fileScope: ['zeta/z.js', 'alpha/a.js'] },
    t2: { id: 't2', fileScope: ['mid/m.js'] },
  };
  assert.deepEqual(aggregateMspFileScope(tasksMap), ['alpha/a.js', 'mid/m.js', 'zeta/z.js']);
});

test('an empty task map yields an empty array', () => {
  assert.deepEqual(aggregateMspFileScope({}), []);
});

test('a single task passes its fileScope through (sorted, deduped)', () => {
  const tasksMap = { only: { id: 'only', fileScope: ['src/two.js', 'src/one.js', 'src/two.js'] } };
  assert.deepEqual(aggregateMspFileScope(tasksMap), ['src/one.js', 'src/two.js']);
});

test('throws when tasksMap is not a non-null, non-array object', () => {
  assert.throws(() => aggregateMspFileScope(null), /non-null, non-array object/);
  assert.throws(() => aggregateMspFileScope([{ fileScope: ['x'] }]), /non-null, non-array object/);
});
```

  Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/msp-file-scope.test.mjs`
  Expected: FAIL with "Cannot find module '/Users/satanshumishra/.claude/lib/superpowers-parallel/msp-file-scope.mjs'" (ERR_MODULE_NOT_FOUND — the import cannot resolve).

- [ ] Create the module `lib/superpowers-parallel/msp-file-scope.mjs` to turn it GREEN. Immutable (never mutates `tasksMap` or any `fileScope`); validates its boundary even though `mitosis.js:259-272` already guarantees a non-null non-array object (defense in depth):

```js
export function aggregateMspFileScope(tasksMap) {
  if (tasksMap === null || typeof tasksMap !== 'object' || Array.isArray(tasksMap)) {
    throw new Error('aggregateMspFileScope: tasksMap must be a non-null, non-array object keyed by task id');
  }
  const union = new Set();
  for (const task of Object.values(tasksMap)) {
    for (const path of (task && task.fileScope) || []) {
      union.add(path);
    }
  }
  return [...union].sort();
}
```

  Run: `node --test /Users/satanshumishra/.claude/lib/superpowers-parallel/tests/msp-file-scope.test.mjs`
  Expected: PASS with "# pass 6" and "# fail 0".

- [ ] Wire the helper into `mitosis.js`. First add the static import (mitosis.js is already an ES module — it uses top-level `await` at :151 — so a top-level `import` is valid). Insert as the first line of the file, before `export const meta`:

```js
import { aggregateMspFileScope } from '/Users/satanshumishra/.claude/lib/superpowers-parallel/msp-file-scope.mjs';
```

  Then insert the post-Harden call immediately after the prompts-validation block closes at `:318` and before `phase('Branch')` at `:320` (i.e. after all four Harden invariant guards have passed, so `hardened.engineArgs.tasks` is a validated non-null non-array object):

```js
  const aggregatedScope = aggregateMspFileScope(hardened.engineArgs.tasks);
  log(`mitosis[${msp.id}]: aggregated write-set = ${aggregatedScope.length} path(s)`);
```

  Verification (workflow glue is not unit-testable — assert with `node -e` on the real helper plus `grep -F` on the wiring):
  `node -e "import('/Users/satanshumishra/.claude/lib/superpowers-parallel/msp-file-scope.mjs').then(m => console.log(JSON.stringify(m.aggregateMspFileScope({ a: { fileScope: ['lib/b.js','lib/a.js'] }, b: { fileScope: ['lib/a.js'] } }))))"`
  Expected stdout: `["lib/a.js","lib/b.js"]`
  `grep -F 'import { aggregateMspFileScope }' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.
  `grep -F 'const aggregatedScope = aggregateMspFileScope(hardened.engineArgs.tasks);' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.

- [ ] No commit — ~/.claude is non-git; applied in place, gated by the test and assertions above.

---

### Task 9: Serialized merge queue (`mergeQueue` + `shipOneMsp`) and non-mutating Branch ref

**Files:**
- `workflows/mitosis.js` (add module-level `mergeQueue`; change the Branch stage to `branch -f`; extract the inline Ship stage into `shipOneMsp` and serialize it)

**Interfaces:**
- Consumes: the inline Ship stage (`mitosis.js:350-378`); the Branch stage (`:320-329`); `clusterIds` (the Phase B `runClusterChain(cluster)` parameter — the sole Phase B surface Phase C reads); `aggregatedScope` (Task 8).
- Produces: module-level `let mergeQueue = Promise.resolve();`; `async function shipOneMsp(msp, clusterIds, i)`; `shipped[]` entries extended to `{ mspId, prUrl, receiptsPass, d6Pass, clusterIds, aggregatedScope }`.

Steps:

- [ ] Declare the module-level merge queue next to `shipped` (currently `const shipped = [];` at `:205`, module scope, above the Phase B parallel fan-out so it is shared by every cluster). Add immediately after it:

```js
let mergeQueue = Promise.resolve();
```

  Verification: `grep -F 'let mergeQueue = Promise.resolve();' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.

- [ ] Change the Branch stage so it creates/moves the integration REF without moving the main-repo HEAD (parallel clusters share `repoRoot`'s working tree; the engine's per-instance integration worktree from Phase A is what checks the ref out). Replace `git -C ${repoRoot} checkout -B ${integrationBranch} origin/${baseBranch}` with `git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}` and adjust the narrative.

  BEFORE (`:320-329`):

```js
  phase('Branch');
  const branched = await agent(
    `You are the branch-prep stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
    `Cut this MSP's integration branch FRESH from the latest pushed base so it stacks bottom-up on already-merged MSPs and re-fetches origin each iteration. Operate against the main repo at ${repoRoot}; do NOT enter any worktree.\n` +
    `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`\n` +
    `2. \`git -C ${repoRoot} checkout -B ${integrationBranch} origin/${baseBranch}\`\n\n` +
    `If both succeed, set ready=true. If the fetch or checkout fails (no remote, missing base, detached state), set ready=false and explain in detail.\n\n` +
    `Return ONLY: { ready: <bool>, detail: "<what happened>" }.`,
    { agentType: 'implementer', schema: BRANCH_SCHEMA, label: `branch:${msp.id}`, phase: 'Branch' }
  );
```

  AFTER:

```js
  phase('Branch');
  const branched = await agent(
    `You are the branch-prep stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
    `Create/move this MSP's integration REF FRESH onto the latest pushed base so it stacks bottom-up on already-merged MSPs, WITHOUT moving the main-repo HEAD (sibling clusters share this repo's working tree; the engine's per-instance integration worktree is what checks the ref out). Operate against the main repo at ${repoRoot}; do NOT check out the branch and do NOT enter any worktree.\n` +
    `1. \`git -C ${repoRoot} fetch origin ${baseBranch}\`\n` +
    `2. \`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\`\n\n` +
    `If both succeed, set ready=true. If the fetch or branch update fails (no remote, missing base), set ready=false and explain in detail.\n\n` +
    `Return ONLY: { ready: <bool>, detail: "<what happened>" }.`,
    { agentType: 'implementer', schema: BRANCH_SCHEMA, label: `branch:${msp.id}`, phase: 'Branch' }
  );
```

  Verification: `grep -Fc 'checkout -B ${integrationBranch}' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: `0`. `grep -F 'branch -f ${integrationBranch} origin/${baseBranch}' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.

- [ ] Extract the inline Ship stage (`:350-378`: `phase('Ship')`, the ship `agent(...)`, the `!ship.merged` halt, `log`, and `shipped.push(...)`) into a named `async function shipOneMsp(msp, clusterIds, i)` declared in the per-MSP scope of `runClusterChain` (so it closes over `integrationBranch`, `branchPrefix`, `aggregatedScope`, `repoRoot`, `baseBranch`, `shipped`, `msps`); `msp`/`i` are passed explicitly so the deferred merge-queue callback binds the exact MSP and index rather than a possibly-advanced loop variable. Replace the inline stage with the serialized append + await. This task keeps the EXISTING ship prompt verbatim (Task 10 hardens it):

```js
  async function shipOneMsp(msp, clusterIds, i) {
    phase('Ship');
    const ship = await agent(
      `You are the ship stage for MSP "${msp.id}" of a mitosis run. You have NO Skill tool.\n\n` +
      `Repo: ${repoRoot}. The engine has already integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, merged, never pushed).\n` +
      `Branch contract is PRE-RESOLVED: head = ${JSON.stringify(integrationBranch)}, base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
      `1. Publish the integration branch: \`git -C ${repoRoot} push -u origin ${integrationBranch}\`.\n` +
      `2. Open ONE pull request with head ${integrationBranch} onto base ${baseBranch}, stacked bottom-up (this MSP depends on already-merged MSPs: ${msps.slice(0, i).map((m) => m.id).join(', ') || '(none)'}).\n` +
      `3. Wait for CI to complete (receipts enforcer + D6 cluster-boundary check + PR-title lint) using \`gh run watch --exit-status\`.\n` +
      `4. If green, squash-merge the PR at the published boundary (one squash per MSP). If red, do NOT merge.\n\n` +
      `Return ONLY: { merged: <bool>, prUrl: "<url>", receiptsPass: <bool>, d6Pass: <bool>, detail: "<summary>" }.`,
      { agentType: 'implementer', schema: SHIP_SCHEMA, label: `ship:${msp.id}`, phase: 'Ship' }
    );
    if (!ship.merged) {
      log(`mitosis[${msp.id}]: ship BLOCKED (${ship.detail})`);
      return { halted: true, stage: 'ship', mspId: msp.id, detail: ship.detail, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass, shipped, mspCount: msps.length };
    }
    log(`mitosis[${msp.id}]: shipped -> ${ship.prUrl}`);
    shipped.push({ mspId: msp.id, prUrl: ship.prUrl, receiptsPass: ship.receiptsPass, d6Pass: ship.d6Pass, clusterIds, aggregatedScope });
    return { halted: false, mspId: msp.id, prUrl: ship.prUrl };
  }

  const clusterIds = clusterIds;
  const link = (mergeQueue = mergeQueue.then(() => shipOneMsp(msp, clusterIds, i)));
  const ship = await link;
  if (ship.halted) return ship;
```

  Verification (reasoning proof of the serialization invariant plus `grep -F` anchors):

  Serialization — at most one `shipOneMsp` body in its merge section at a time. Each MSP's Ship stage runs `mergeQueue = mergeQueue.then(() => shipOneMsp(...))`. `.then` callbacks on one promise chain execute strictly in append order and each begins only after the previous link's promise has resolved (i.e. after the previous `shipOneMsp` has fully returned — merged or halted). Node is single-threaded, so the synchronous `mergeQueue = mergeQueue.then(...)` reassignments from two clusters cannot interleave mid-statement: one runs fully (reading the current `mergeQueue`, chaining onto it, reassigning) before the other, producing a total order Q0 → shipOneMsp_A → shipOneMsp_B. Capturing the appended promise into the local `const link` before `await link` means a later reassignment by another cluster cannot make this MSP await the wrong link. Therefore exactly one ship body — and thus one push/rebase/merge-into-`baseBranch` — is active at any instant.

  Concurrency preserved — Plan/Harden/Branch/Execute still run across clusters in parallel: those stages live in `runClusterChain(cluster)` and are awaited concurrently by `await parallel(clusters.map(...))`. Only the Ship stage funnels through the shared `mergeQueue`. While cluster A is suspended at `await link` waiting for its queued ship, cluster B's Plan/Harden/Branch/Execute keep progressing on the event loop; nothing outside the ship section is serialized. Within a single cluster, `await link` (the ship result) still blocks that cluster's next MSP, preserving bottom-up stacking.

  `grep -F 'async function shipOneMsp(msp, clusterIds, i)' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.
  `grep -F 'mergeQueue = mergeQueue.then(() => shipOneMsp(msp, clusterIds, i))' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.
  `grep -F 'clusterIds, aggregatedScope' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line (the extended `shipped.push`).

- [ ] No commit — ~/.claude is non-git; applied in place, gated by the reasoning proof and assertions above.

---

### Task 10: Fresh-base + combined-state gate inside `shipOneMsp`

**Files:**
- `workflows/mitosis.js` (rewrite the ship agent prompt body inside `shipOneMsp` — fetch → advance-check → rebase + force-with-lease re-push → wait-for-combined-CI → squash-merge-or-halt)

**Interfaces:**
- Consumes: `shipOneMsp` (Task 9); `origin/${baseBranch}` and `integrationBranch`; the `receipts.yml` `pull_request` job (receipts enforcer at `:18` + the D6 cluster-boundary step at `:20-21`); the `d6-check.cjs` contract (NEW dependents of `--base <sha> --head <sha>`, i.e. `base..head`).
- Produces: the receipts-G8 fresh-base + combined-state merge gate as the ship agent's instruction sequence. Output shape is unchanged (`SHIP_SCHEMA`).

Steps:

- [ ] Replace the four-step ship prompt body (introduced verbatim in Task 9) with the six-step fresh-base gate. Only the prompt string changes; the `agent(...)` options, the `!ship.merged` halt, the `log`, the `shipped.push`, and the return are unchanged from Task 9.

  BEFORE (the prompt body lines inside `shipOneMsp`):

```js
      `Repo: ${repoRoot}. The engine has already integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, merged, never pushed).\n` +
      `Branch contract is PRE-RESOLVED: head = ${JSON.stringify(integrationBranch)}, base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
      `1. Publish the integration branch: \`git -C ${repoRoot} push -u origin ${integrationBranch}\`.\n` +
      `2. Open ONE pull request with head ${integrationBranch} onto base ${baseBranch}, stacked bottom-up (this MSP depends on already-merged MSPs: ${msps.slice(0, i).map((m) => m.id).join(', ') || '(none)'}).\n` +
      `3. Wait for CI to complete (receipts enforcer + D6 cluster-boundary check + PR-title lint) using \`gh run watch --exit-status\`.\n` +
      `4. If green, squash-merge the PR at the published boundary (one squash per MSP). If red, do NOT merge.\n\n` +
```

  AFTER:

```js
      `Repo: ${repoRoot}. The engine has already integrated this MSP's work onto the LOCAL branch ${JSON.stringify(integrationBranch)} (boundary-validated, merged, never pushed). Sibling clusters merge into ${JSON.stringify(baseBranch)} concurrently, so you MUST revalidate on the FRESH combined base before merging.\n` +
      `Branch contract is PRE-RESOLVED: head = ${JSON.stringify(integrationBranch)}, base/target = ${JSON.stringify(baseBranch)}. Do NOT derive a base from the platform default; use exactly this base.\n\n` +
      `1. Refresh the base: \`git -C ${repoRoot} fetch origin ${baseBranch}\`.\n` +
      `2. Detect whether a sibling cluster advanced the base since this integration ref was cut: run \`git -C ${repoRoot} merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}\`. Exit 0 = the base tip is already contained (no rebase needed); exit 1 = the base advanced, a sibling landed, rebase required.\n` +
      `3. Fresh-base (receipts G8): if the base advanced, run \`git -C ${repoRoot} rebase origin/${baseBranch} ${integrationBranch}\`. If the rebase reports conflicts, run \`git -C ${repoRoot} rebase --abort\` and STOP with merged=false and detail naming the conflicting paths (a cross-cluster file collision the coarse clustering missed — a human must resolve). If it replays cleanly, republish the rebased head: \`git -C ${repoRoot} push --force-with-lease -u origin ${integrationBranch}\`. If the base did NOT advance, publish normally: \`git -C ${repoRoot} push -u origin ${integrationBranch}\`.\n` +
      `4. Open ONE pull request (or reuse the already-open one) with head ${integrationBranch} onto base ${baseBranch}, stacked bottom-up on already-merged MSPs (${msps.slice(0, i).map((m) => m.id).join(', ') || '(none)'}).\n` +
      `5. Wait for CI to finish on the FRESH head+base with \`gh run watch --exit-status\`: the receipts red->green enforcer + G9 full-suite + the D6 cluster-boundary step. Because the PR base is origin/${baseBranch} (now including every sibling that already merged) and the head is the rebased tip, the D6 step computes NEW base..head dependents over the COMBINED post-rebase state — not this cluster's changes in isolation.\n` +
      `6. If CI is GREEN, squash-merge the PR at the published boundary (one squash per MSP) and set merged=true. If CI is RED on the fresh base, do NOT merge: set merged=false and put the failing job/step and first failing assertion in detail.\n\n` +
```

  Verification (reasoning proof of the gate + `grep -F` anchors):

  A sibling landing between branch-time and merge-time forces revalidation. At Branch (Task 9) the ref was set to `origin/${baseBranch}` at that instant. Suppose while this MSP runs Execute, a sibling cluster's `shipOneMsp` (ahead in the merge queue) squash-merges into `baseBranch`, advancing its tip. When this MSP's turn comes: step 1 fetches the new `origin/${baseBranch}`; step 2's `merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}` now exits 1 (the new base tip is NOT an ancestor of the pre-sibling integration ref); step 3 rebases the integration ref onto the fresh base and force-with-lease re-pushes, so the PR head becomes the sibling-inclusive tip; step 5's `gh run watch` waits for receipts (red→green + G9) and the D6 step to run against base=`origin/${baseBranch}` (sibling-inclusive) .. head=(rebased tip) — the COMBINED state — and only a GREEN combined run reaches step 6's squash-merge. If the sibling's change semantically breaks a dependent this MSP touches, D6's NEW-dependent tests (or the receipts full suite) go red on the fresh base and the merge is blocked. Because the queue serializes ships, no two siblings can be in this section at once, so the fresh base each MSP rebases onto already reflects every prior merge. `--force-with-lease` scopes the rewrite to this MSP's own integration ref and refuses if the remote ref moved unexpectedly.

  `grep -F 'merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.
  `grep -F 'rebase origin/${baseBranch} ${integrationBranch}' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.
  `grep -F 'push --force-with-lease -u origin ${integrationBranch}' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: one line.
  `grep -Fc 'gh run watch --exit-status' /Users/satanshumishra/.claude/workflows/mitosis.js` → Expected: `1`.

- [ ] No commit — ~/.claude is non-git; applied in place, gated by the reasoning proof and assertions above.

---

## Phase D — Model knobs (the two UNINTENDED non-Opus gaps)

Scope is frozen: KEEP Opus-lead + Sonnet-workers; the broad worker-tier question is PARKED. Only two unintended gaps are closed here.

1. **Decompose runs with no model override.** The `models` contract (`input.models` at `mitosis.js:125`) is threaded into `parallel-plan-execution.js` for reviewer/fixer only. The Decompose agent — the highest-leverage judgment call in the whole run — is dispatched at `mitosis.js:151-159` with opts that carry NO `model` field, so it inherits the `codebase-analyst` frontmatter model rather than running on Opus.
2. **test-engineer promises Opus escalation nothing implements.** `agents/test-engineer.md:5` pins `model: sonnet`, and its doc at `:14` promises "the orchestrator dispatches you with Opus" for critical-contract / authorization / core-invariant tests. The engine dispatches agentTypes with no model override (`implementerModel` is `null` at `parallel-plan-execution.js:29`), so that promise is never kept.

A caller-passed `model:` opt on an `agent()` call OVERRIDES the agent-definition frontmatter model — the engine already relies on this for reviewer/fixer via `withModel`. So a `models.tester` override wins over the `sonnet` pin with NO frontmatter change: `model: sonnet` stays as the standalone default.

---

### Task 11: Add the `models.decomposer` knob to the mitosis Decompose agent

**Files:**
- `~/.claude/workflows/mitosis.js` (edit the Decompose agent opts at `:151-159`)

**Interfaces:**
- Consumes: `models` — already bound at `mitosis.js:125` (`const models = input.models || {}`), in scope at the Decompose dispatch.
- Produces: `models.decomposer` — read in the Decompose agent opts, defaulting to `'opus'`. When unset, decompose runs on Opus; when set (e.g. `'sonnet'`), the caller override wins.

**Steps:**

- [ ] Confirm `models` is in scope at the dispatch site. It is bound at `mitosis.js:125`:
  ```js
  const models = input.models || {};
  ```
  The Decompose `agent()` call at `:151-159` is in the same async function body below `:125`, so `models` is reachable with no new plumbing.

- [ ] Edit the opts object (the 4th argument, currently `mitosis.js:158`). Before:
  ```js
    { agentType: 'codebase-analyst', schema: DECOMPOSE_SCHEMA, label: 'decompose', phase: 'Decompose' }
  ```
  After:
  ```js
    { agentType: 'codebase-analyst', schema: DECOMPOSE_SCHEMA, label: 'decompose', phase: 'Decompose', model: models.decomposer || 'opus' }
  ```
  Only the opts object changes; the prompt string (`:152-157`) and the `agent(` call shape are untouched.

**Verification:**

- [ ] The knob is present on the Decompose opts line:
  ```bash
  cd ~/.claude && grep -n "models.decomposer" workflows/mitosis.js
  ```
  Expected: one line, the Decompose opts near `:158`, containing `model: models.decomposer || 'opus'`.

- [ ] The default resolves to Opus and an explicit override wins — proven by evaluating the exact defaulting expression:
  ```bash
  node -e "const models = {}; console.log(models.decomposer || 'opus')"
  ```
  Expected output: `opus`
  ```bash
  node -e "const models = { decomposer: 'sonnet' }; console.log(models.decomposer || 'sonnet-would-be-wrong', models.decomposer || 'opus')"
  ```
  Expected output: `sonnet sonnet`
  Reasoning check: with no `models.decomposer` passed, `models.decomposer` is `undefined`, so `|| 'opus'` yields `'opus'` and Decompose runs on Opus (closing gap 1). Passing `models.decomposer: 'sonnet'` yields `'sonnet'`, and because the caller-passed `model:` opt overrides frontmatter, Decompose runs on Sonnet — the parked worker-tier question stays overridable without touching this task.

- [ ] No commit — `~/.claude` is non-git; applied in place.

---

### Task 12: Add the `models.tester` knob in `run-engine.mjs` runTask, and reconcile the test-engineer doc

Phase A extracts the parallel engine into `run-engine.mjs`; the `runTask` body, the module-scope `const models = args.models || {}`, and the `withModel` helper move with it unchanged. Author this edit against `run-engine.mjs` `runTask` (identical to `parallel-plan-execution.js:139-159` pre-extraction). Both `models` and `withModel` are already in `runTask`'s closure scope post-extraction, so no new plumbing is needed.

**Files:**
- `~/.claude/workflows/run-engine.mjs` (edit `runTask`, the impl dispatch — `parallel-plan-execution.js:144` before extraction)
- `~/.claude/agents/test-engineer.md` (reconcile the doc line at `:14`)

**Interfaces:**
- Consumes: `models` and `withModel` (both in `run-engine.mjs` closure scope from the Phase A extraction), plus the existing `EXEC_AGENT_TYPES` set and `implementerModel` (`null`).
- Produces: `models.tester` — read in `run-engine.mjs` `runTask`. When the resolved dispatch agentType is `test-engineer` and `models.tester` is set (e.g. `'opus'`), it becomes the caller-passed `model:` opt and wins over the `agents/test-engineer.md:5` `model: sonnet` frontmatter. When unset, dispatch inheritance is unchanged. Also produces a corrected `agents/test-engineer.md:14` doc line matching this behavior.

**Steps:**

- [ ] Locate the impl dispatch in `runTask` (`parallel-plan-execution.js:144` pre-extraction; same line in `run-engine.mjs`). Before:
  ```js
    const status = await agent(implementerPrompt(task, branch, wt), withModel({ label: `impl:${taskId}`, phase: 'Waves', schema: STATUS_SCHEMA, agentType: EXEC_AGENT_TYPES.has(task.agentType) ? task.agentType : 'implementer' }, implementerModel));
  ```
  The inline `EXEC_AGENT_TYPES.has(task.agentType) ? task.agentType : 'implementer'` computes the resolved agentType directly inside the opts literal, so there is no place to branch the model on it. Hoist it into a name first.

- [ ] Replace that single statement with three statements — resolve the agentType, choose the model from it, then dispatch. After:
  ```js
    const resolvedAgentType = EXEC_AGENT_TYPES.has(task.agentType) ? task.agentType : 'implementer';
    const taskModel = resolvedAgentType === 'test-engineer' ? (models.tester || null) : implementerModel;
    const status = await agent(implementerPrompt(task, branch, wt), withModel({ label: `impl:${taskId}`, phase: 'Waves', schema: STATUS_SCHEMA, agentType: resolvedAgentType }, taskModel));
  ```
  `withModel(opts, null)` returns opts unchanged (`run-engine.mjs`, from `parallel-plan-execution.js:38`), so a non-test-engineer task or an unset `models.tester` produces byte-identical dispatch behavior to before. A set `models.tester` (e.g. `'opus'`) flows through `withModel` as the caller `model:` opt and overrides the `sonnet` frontmatter.

- [ ] Reconcile the unconditional escalation promise in `agents/test-engineer.md:14`. Before:
  ```md
  For tests on a public contract, an authorization boundary, or a core invariant, you reason at the highest tier (the orchestrator dispatches you with Opus); a green-but-weak test on those surfaces is worse than no test.
  ```
  After:
  ```md
  For tests on a public contract, an authorization boundary, or a core invariant, you reason at the highest tier; when the run warrants it (for example a security-in-scope run), the orchestrator dispatches you with an explicit Opus override via the `models.tester` knob rather than the standalone `sonnet` default. A green-but-weak test on those surfaces is worse than no test.
  ```
  The frontmatter `model: sonnet` at `:5` is deliberately left as-is — it is the standalone default the doc now names.

**Verification:**

- [ ] The knob and the hoisted agentType are present in the engine:
  ```bash
  cd ~/.claude && grep -n "models.tester" workflows/run-engine.mjs
  ```
  Expected: one line — the `taskModel` assignment containing `models.tester || null`.
  ```bash
  cd ~/.claude && grep -n "resolvedAgentType" workflows/run-engine.mjs
  ```
  Expected: two lines — the `const resolvedAgentType = ...` assignment and its use as `agentType: resolvedAgentType`.

- [ ] The old unconditional promise is gone and the accurate wording is in place:
  ```bash
  cd ~/.claude && grep -n "dispatches you with Opus)" agents/test-engineer.md
  ```
  Expected: no output (the parenthetical unconditional claim is removed).
  ```bash
  cd ~/.claude && grep -n "models.tester" agents/test-engineer.md
  ```
  Expected: one line — the reconciled `:14` doc sentence naming the `models.tester` knob.
  ```bash
  cd ~/.claude && grep -n "model: sonnet" agents/test-engineer.md
  ```
  Expected: the `:5` frontmatter line still present (default unchanged).

- [ ] The override reaches a test-engineer dispatch and wins, while unset leaves inheritance intact — proven by evaluating the exact selection logic against both resolved agentTypes:
  ```bash
  node -e "const EXEC=new Set(['implementer','test-engineer','general-purpose']); const withModel=(o,m)=>m?{...o,m}:o; for (const [task, models] of [[{agentType:'test-engineer'},{tester:'opus'}],[{agentType:'test-engineer'},{}],[{agentType:'implementer'},{tester:'opus'}]]) { const implementerModel=null; const r=EXEC.has(task.agentType)?task.agentType:'implementer'; const tm=r==='test-engineer'?(models.tester||null):implementerModel; console.log(r, JSON.stringify(withModel({agentType:r}, tm))); }"
  ```
  Expected output (three lines):
  ```
  test-engineer {"agentType":"test-engineer","m":"opus"}
  test-engineer {"agentType":"test-engineer"}
  implementer {"agentType":"implementer"}
  ```
  Reasoning check: line 1 — a `test-engineer` task with `models.tester: 'opus'` gets `model: 'opus'` on the opts, which as the caller-passed override beats the `sonnet` frontmatter (closing gap 2, exactly matching the reconciled doc). Line 2 — `models.tester` unset yields `taskModel = null`, `withModel` returns opts unchanged, so dispatch inherits the `sonnet` frontmatter, identical to pre-change behavior. Line 3 — a non-test-engineer task takes the `implementerModel` (`null`) branch, so all existing implementer/general-purpose dispatches are byte-identical to before. The `models.tester` knob is therefore additive and gap-scoped: it changes nothing until a run sets it.

- [ ] No commit — `~/.claude` is non-git; applied in place.

---

## Cross-Cutting Harness Note (applies to every workflow-script edit)

`workflows/mitosis.js` and `workflows/parallel-plan-execution.js` run as harness-wrapped async bodies: top-level `return`/`await` are legal and `agent`/`parallel`/`log`/`phase`/`workflow`/`args` are injected globals. Local library modules (`run-engine.mjs`, `derive-clusters.mjs`, `msp-file-scope.mjs`) are therefore loaded via dynamic `await import('file://' + <abs path>)`, NOT a top-level static `import`. Both the mitosis scheduler and the thin engine wrapper follow this. If a future harness build supports static local imports in workflow scripts, that is a simplification, not a correctness fix — verify before changing.

## Self-Review (run against the spec)

**1. Spec coverage** — every spec fix maps to tasks:
- Fix 1 (cluster tier) → Tasks 5–7 (deriveClusters, DECOMPOSE_SCHEMA fileScope, parallel scheduler).
- Fix 2 (instance-safe engine) → Tasks 2–3 (namespaced `engineWorktreePath`, per-instance `integrationWt`) + Task 9's non-mutating Branch ref.
- Fix 4 (inlined engine) → Task 1 (`runEngine(engineArgs, ctx)` + thin wrapper) + Task 7 (inline call in the scheduler).
- Fix 3 (cross-cluster gate + serialized merge) → Tasks 8–10 (`aggregateMspFileScope`, `mergeQueue`/`shipOneMsp`, fresh-base + combined-state gate).
- Section 8 model knobs → Tasks 11–12 (`models.decomposer`, `models.tester` + doc reconciliation).
- Guard preservation → Task 4 (block-inline-engine stays green).

**2. Placeholder scan** — clean (no TBD/TODO/"add appropriate"/"similar to Task N").

**3. Type consistency** — frozen names verified across sections: `runEngine(engineArgs, ctx)` with `ctx={agent,parallel,log,phase}` (produced Task 1, consumed Tasks 7 & 12); a cluster is `string[]` and `runClusterChain(clusterIds)` receives it (Phase C normalized from `cluster.mspIds` → `clusterIds`); `deriveClusters → {clusters,audit}`; `aggregateMspFileScope(tasksMap)`; `mergeQueue`/`shipOneMsp`; `engineWorktreePath(worktreeRoot,branchPrefix,taskId)`; `integrationWt`. Widened blast radius folded in: `scope-covers.test.mjs` repoint (Task 1), `generate-run-script.test.mjs` stays green (all 14 arg-reads retained).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-mitosis-cluster-tier.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with two-stage review between tasks (superpowers:subagent-driven-development). Best for a 12-task engine refactor where each task carries its own test/verify cycle.
2. **Inline Execution** — batch execution in-session with checkpoints (superpowers:executing-plans).

Note: `~/.claude` is non-git, so per-task "commit" steps are no-ops (apply-in-place, gated by each task's test); `protect-claude-config` will prompt "ask" on each workflow/lib/agent write. Phase A must land and prove green before Phase B (parallelizing over a non-instance-safe engine is a regression); B before C; D is independent.
