# Mitosis Resilience — Increment 2 (Pillar 2): Fault Isolation + Bounded Retry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single application-level bounded-retry layer, per-MSP fault isolation, and dead-letter quarantine to the mitosis engine so one transient blip re-dispatches (worktree reset first) and one permanent MSP failure is set aside while the rest of the fleet completes — without ever amplifying retries or breaking Pillar 1's truthful report.

**Architecture:** A new pure module `retry.mjs` (classifyOutcome / withinRetryBudget / resetPreamble / dispatchWithRetry) is inlined into `mitosis.js` as a third byte-identical twin. The implementer dispatch inside `runEngine` calls it via an injected `ctx.dispatchWithRetry`; the retry state (a shared mutable counter) is injected into `engineArgs.retry` at the `runEngine` call site, keeping the harden-agent boundary and the `run-engine.mjs` mirror import-free. `runClusterChain` gains per-stage guards that map failures to accurate `crashed`/`halted`/`quarantined` outcomes; `assembleRunReport` (a twin) learns to surface `quarantined`. The `mergeQueue` link gets a `.catch` so one thrown ship cannot poison sibling clusters.

**Tech Stack:** Node v26, `node:test`, ESM `.mjs`. No new dependencies. No clock/RNG/sleep (determinism is load-bearing — see Global Constraints).

## Global Constraints

- **No code comments** anywhere (shebang/pragma carve-outs only). No emojis. No AI attribution in commits.
- **NO commits unless the user asks.** Edits land in the working tree on branch `feat/mitosis-resilience` (P1 = commit `2ee8720`). The SDD ledger records progress; commit is a separate user-gated step.
- **Determinism is Pillar 1.** OMIT literal backoff/jitter and per-dispatch timeouts — no `Date.now()`, no `Math.random()`, no `setTimeout`. The harness `agent()` already backs off + times out (surfacing a drop as `null`); the retry layer is single-application-level and never stacks a second HTTP retry loop. "The SDK already retries HTTP transients" is an **assumption** (unverified from code) on which no-amplification rests — state it as such, never as a code fact.
- **Twin mirror discipline (NO markers exist; byte-identical minus `export`):** three twins must stay in lockstep. Every edit to a twin updates BOTH files in the same task and re-runs `mirror-guard.test.mjs`:
  - Twin 1 `outcome.mjs` (73 lines) ↔ `mitosis.js` `function shippedOutcome` … `function fatalReport` block (currently ~lines 59–131).
  - Twin 2 `run-engine.mjs` (271 lines) ↔ `mitosis.js` `const STATUS_SCHEMA` … end of `runEngine` block (currently ~lines 272–542).
  - Twin 3 `retry.mjs` (NEW, this increment) ↔ a new inline block in `mitosis.js` (added in Task 2). `run-engine.mjs` must NOT import `retry.mjs` — it receives `dispatchWithRetry` via `ctx`.
- **Line numbers drift on every edit. Locate every change site by CONTENT ANCHOR, never by line number.** Anchors are given per task.
- **Retry surface (safety-scoped):** RETRY = decompose (then fail-fast), plan, harden, implementer (+worktree reset). GUARDED-NOT-RETRIED = prepare, branch, ship, boundary, merge, fence (a null/throw maps to an accurate `crashed`/`halted`/`quarantined`, no re-dispatch). SHARED-REF-PUSH retry (ship, prepare base-push) is DEFERRED to Increment 3/P4 — a local reset cannot undo a push.
- **Shared mutable retry counter is intentional.** `state = { used, max }` is mutated in place, consistent with the file's existing `shipped[]` / `mergeQueue =` style. JS single-threading makes check-then-increment atomic between awaits (no race). This is a deliberate, documented exception to the immutability rule (follow established file patterns).
- **Engine has NO git/fs.** The worktree reset is PROMPT TEXT prepended to the re-dispatch, exactly `git -C <worktree> reset --hard <ref>\ngit -C <worktree> clean -fdx\n`. Tests assert the preamble via regex (model on the P1 F3 ship-prompt test).
- **Node v26 test command:** from the lib dir `~/.claude/lib/superpowers-parallel/`, whole-suite = `node --test tests/*.test.mjs`. A single file = `node --test tests/<file>.test.mjs`. Scope "green" to TOUCHED files. **7 pre-existing failures in `generate-run-script.test.mjs` are unrelated** (Node-v26 subprocess/arg-parsing) — do not attempt to fix them here.
- **The scheduler test reads the LIVE engine:** `tests/mitosis-scheduler.test.mjs` reads `/Users/satanshumishra/.claude/workflows/mitosis.js` (same inode as the repo file `.claude/workflows/mitosis.js`), compiles its body via `new AsyncFunction('args','agent','parallel','log','phase','workflow', body)`, and calls `runMitosis(argsJson, agent, trackedParallel, log, phase, {})`. So inline-`mitosis.js` edits are exercised end-to-end there; `run-engine.mjs`/`outcome.mjs`/`retry.mjs` edits are exercised by their own `.mjs`-importing tests.

**Paths (absolute):**
- Engine: `/Users/satanshumishra/.claude/workflows/mitosis.js`
- Lib dir: `/Users/satanshumishra/.claude/lib/superpowers-parallel/` (symlinked; repo path `.claude/lib/superpowers-parallel/`)
- Twins: `<lib>/outcome.mjs`, `<lib>/run-engine.mjs`, `<lib>/retry.mjs` (new)
- Tests: `<lib>/tests/*.test.mjs`

---

### Task 1: `retry.mjs` pure core + `retry.test.mjs`

Pure, dependency-free, fully unit-testable with fake thunks. No `mitosis.js` change in this task.

**Files:**
- Create: `<lib>/retry.mjs`
- Test: `<lib>/tests/retry.test.mjs`

**Interfaces:**
- Produces (consumed by Tasks 2–6):
  - `classifyOutcome(result, isPermanent) -> 'transient' | 'permanent' | 'ok'`
  - `withinRetryBudget({ attempt, maxAttempts, state }) -> boolean`
  - `resetPreamble(worktree, ref) -> string`
  - `dispatchWithRetry(dispatchThunk, { isPermanent, maxAttempts, state, resetRef, worktree }) -> Promise<result | { __quarantined: true, attempts, lastResult }>`
  - `dispatchThunk` signature: `(attemptNo, preamble) => Promise<result>` — agent-agnostic so it is unit-testable with fake thunks. `preamble` is `''` on attempt 1 and `resetPreamble(worktree, resetRef)` on retries when `resetRef` is provided.

- [ ] **Step 1: Write the failing tests** — `<lib>/tests/retry.test.mjs`

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOutcome, withinRetryBudget, resetPreamble, dispatchWithRetry } from '../retry.mjs';

test('classifyOutcome: null is transient, isPermanent-true is permanent, else ok', () => {
  const isPerm = (r) => r.status === 'BLOCKED';
  assert.equal(classifyOutcome(null, isPerm), 'transient');
  assert.equal(classifyOutcome(undefined, isPerm), 'transient');
  assert.equal(classifyOutcome({ status: 'BLOCKED' }, isPerm), 'permanent');
  assert.equal(classifyOutcome({ status: 'DONE' }, isPerm), 'ok');
});

test('withinRetryBudget gates on both attempt count and shared run budget', () => {
  assert.equal(withinRetryBudget({ attempt: 1, maxAttempts: 3, state: { used: 0, max: 4 } }), true);
  assert.equal(withinRetryBudget({ attempt: 3, maxAttempts: 3, state: { used: 0, max: 4 } }), false);
  assert.equal(withinRetryBudget({ attempt: 1, maxAttempts: 3, state: { used: 4, max: 4 } }), false);
});

test('resetPreamble emits the exact idempotency reset commands for the worktree and ref', () => {
  const p = resetPreamble('/tmp/wt/task-t0', 'src/feat-integration');
  assert.match(p, /git -C \/tmp\/wt\/task-t0 reset --hard src\/feat-integration/);
  assert.match(p, /git -C \/tmp\/wt\/task-t0 clean -fdx/);
});

test('dispatchWithRetry returns a non-null ok result on the first attempt without retrying', async () => {
  let calls = 0;
  const result = await dispatchWithRetry(
    async () => { calls += 1; return { status: 'DONE' }; },
    { isPermanent: (r) => r.status === 'BLOCKED', maxAttempts: 3, state: { used: 0, max: 4 } },
  );
  assert.deepEqual(result, { status: 'DONE' });
  assert.equal(calls, 1);
});

test('dispatchWithRetry re-dispatches once on a transient null then succeeds, prepending the reset preamble on the retry only', async () => {
  const preambles = [];
  let calls = 0;
  const state = { used: 0, max: 4 };
  const result = await dispatchWithRetry(
    async (attemptNo, preamble) => { calls += 1; preambles.push(preamble); return calls === 1 ? null : { status: 'DONE' }; },
    { isPermanent: (r) => r.status === 'BLOCKED', maxAttempts: 3, state, resetRef: 'main', worktree: '/tmp/wt/task-t0' },
  );
  assert.deepEqual(result, { status: 'DONE' });
  assert.equal(calls, 2);
  assert.equal(preambles[0], '');
  assert.match(preambles[1], /reset --hard main/);
  assert.equal(state.used, 1);
});

test('dispatchWithRetry returns a permanent result immediately without retrying', async () => {
  let calls = 0;
  const result = await dispatchWithRetry(
    async () => { calls += 1; return { status: 'BLOCKED' }; },
    { isPermanent: (r) => r.status === 'BLOCKED', maxAttempts: 3, state: { used: 0, max: 4 } },
  );
  assert.deepEqual(result, { status: 'BLOCKED' });
  assert.equal(calls, 1);
});

test('no amplification: an always-transient dispatch is called exactly maxAttempts times then quarantines', async () => {
  let calls = 0;
  const state = { used: 0, max: 99 };
  const result = await dispatchWithRetry(
    async () => { calls += 1; return null; },
    { isPermanent: () => false, maxAttempts: 3, state },
  );
  assert.equal(calls, 3);
  assert.equal(result.__quarantined, true);
  assert.equal(result.attempts, 3);
  assert.equal(state.used, 2);
});

test('dispatchWithRetry stops at the run budget even when attempts remain', async () => {
  let calls = 0;
  const state = { used: 1, max: 2 };
  const result = await dispatchWithRetry(
    async () => { calls += 1; return null; },
    { isPermanent: () => false, maxAttempts: 5, state },
  );
  assert.equal(calls, 2);
  assert.equal(result.__quarantined, true);
  assert.equal(state.used, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/retry.test.mjs` (from `<lib>`)
Expected: FAIL — `Cannot find module '../retry.mjs'`.

- [ ] **Step 3: Write `<lib>/retry.mjs`**

```javascript
export function classifyOutcome(result, isPermanent) {
  if (result === null || result === undefined) return 'transient';
  if (isPermanent(result)) return 'permanent';
  return 'ok';
}

export function withinRetryBudget({ attempt, maxAttempts, state }) {
  return attempt < maxAttempts && state.used < state.max;
}

export function resetPreamble(worktree, ref) {
  return `git -C ${worktree} reset --hard ${ref}\ngit -C ${worktree} clean -fdx\n`;
}

export async function dispatchWithRetry(dispatchThunk, { isPermanent, maxAttempts, state, resetRef, worktree }) {
  let attempt = 0;
  let lastResult = null;
  while (true) {
    attempt += 1;
    const preamble = attempt > 1 && resetRef ? resetPreamble(worktree, resetRef) : '';
    const result = await dispatchThunk(attempt, preamble);
    const cls = classifyOutcome(result, isPermanent);
    if (cls === 'ok' || cls === 'permanent') return result;
    lastResult = result;
    if (!withinRetryBudget({ attempt, maxAttempts, state })) {
      return { __quarantined: true, attempts: attempt, lastResult };
    }
    state.used += 1;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/retry.test.mjs`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Verify no unrelated regressions on touched files**

Run: `node --test tests/retry.test.mjs && node --check retry.mjs`
Expected: PASS, no syntax errors.

---

### Task 2: Inline `retry.mjs` into `mitosis.js` + `mirror-guard.test.mjs` (all three twins)

Adds the third twin and the drift guard that did not exist before. No behavior change yet — just makes the retry helpers available inline and pins twin lockstep.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — insert the retry block AFTER the `function fatalReport(...) { ... }` block and BEFORE `function indexMsps(msps) {` (currently ~line 131→133).
- Test: `<lib>/tests/mirror-guard.test.mjs` (new)

**Interfaces:**
- Consumes: `retry.mjs` (Task 1) as the source of truth for the inline block.
- Produces: inline `classifyOutcome` / `withinRetryBudget` / `resetPreamble` / `dispatchWithRetry` available to top-level `mitosis.js` code (Tasks 3–6) and, via `ctx`, to the inline `runEngine`.

- [ ] **Step 1: Write the failing test** — `<lib>/tests/mirror-guard.test.mjs`

The guard normalizes each `.mjs` (drop leading `export `, drop any `import … from './*.mjs'` line) and asserts the normalized body appears verbatim as a contiguous substring of the normalized `mitosis.js`. Line-number independent; fails the instant a twin drifts.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LIB = new URL('..', import.meta.url).pathname;
const MITOSIS_PATH = '/Users/satanshumishra/.claude/workflows/mitosis.js';

function normalize(src) {
  return src
    .split('\n')
    .map((line) => line.replace(/^export /, ''))
    .filter((line) => !/^import .* from '\.\/[^']*\.mjs';?\s*$/.test(line))
    .join('\n')
    .trim();
}

const mitosis = normalize(readFileSync(MITOSIS_PATH, 'utf8'));

for (const twin of ['outcome.mjs', 'run-engine.mjs', 'retry.mjs']) {
  test(`${twin} is byte-identical (minus export/import) to its inline copy in mitosis.js`, () => {
    const body = normalize(readFileSync(`${LIB}${twin}`, 'utf8'));
    assert.ok(
      mitosis.includes(body),
      `${twin} has drifted from its inline mitosis.js twin — update BOTH copies. First 200 chars of the normalized twin:\n${body.slice(0, 200)}`,
    );
  });
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/mirror-guard.test.mjs`
Expected: `outcome.mjs` and `run-engine.mjs` PASS (already inline from P1); `retry.mjs` FAILS (not yet inlined into mitosis.js).

- [ ] **Step 3: Inline the retry block into `mitosis.js`**

Locate the anchor: the line `}` that closes `function fatalReport(stage, detail, mspCount, opts = {}) { ... }` (immediately before the blank line and `function indexMsps(msps) {`). Insert, between them, the retry block with `export ` removed from each declaration:

```javascript
function classifyOutcome(result, isPermanent) {
  if (result === null || result === undefined) return 'transient';
  if (isPermanent(result)) return 'permanent';
  return 'ok';
}

function withinRetryBudget({ attempt, maxAttempts, state }) {
  return attempt < maxAttempts && state.used < state.max;
}

function resetPreamble(worktree, ref) {
  return `git -C ${worktree} reset --hard ${ref}\ngit -C ${worktree} clean -fdx\n`;
}

async function dispatchWithRetry(dispatchThunk, { isPermanent, maxAttempts, state, resetRef, worktree }) {
  let attempt = 0;
  let lastResult = null;
  while (true) {
    attempt += 1;
    const preamble = attempt > 1 && resetRef ? resetPreamble(worktree, resetRef) : '';
    const result = await dispatchThunk(attempt, preamble);
    const cls = classifyOutcome(result, isPermanent);
    if (cls === 'ok' || cls === 'permanent') return result;
    lastResult = result;
    if (!withinRetryBudget({ attempt, maxAttempts, state })) {
      return { __quarantined: true, attempts: attempt, lastResult };
    }
    state.used += 1;
  }
}
```

The inline body MUST match `retry.mjs` character-for-character except the leading `export ` on each declaration. Do not reflow or rename.

- [ ] **Step 4: Run to verify the guard passes**

Run: `node --test tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js`
Expected: all three twin tests PASS; `node --check` clean.

- [ ] **Step 5: Confirm no regression in the full-stack scheduler suite**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: same green count as before this task (the inline block is dead code so far; adding it must not change any scheduler behavior). If any previously-green scheduler test now fails, the inline block was mis-inserted (e.g. inside another function) — fix placement.

---

### Task 3: Wire `dispatchWithRetry` into the implementer dispatch (THE HEADLINE)

The implementer dispatch inside `runEngine.runTask` becomes retryable with a worktree reset on retry. `run-engine.mjs` stays import-free — it calls `ctx.dispatchWithRetry`. Retry config is injected into `engineArgs.retry` at the `runEngine` call site (Task 3 also adds the input-parse + post-decompose plumbing in `mitosis.js`).

**Files:**
- Modify: `<lib>/run-engine.mjs` — `runEngine` top (read `engineArgs.retry`) and `runTask` (implementer dispatch).
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — mirror the `run-engine.mjs` edit into the inline `runEngine` twin; add retry-config parse at input; construct `retryState`/`retryMaxAttempts` after decompose; inject `retry` + `dispatchWithRetry` at the `runEngine` call site.
- Modify: `<lib>/tests/run-engine.test.mjs` — `ctxWith` must supply `dispatchWithRetry`.
- Test: `<lib>/tests/mitosis-scheduler.test.mjs` — headline transient-blip test + no-amplification test.

**Interfaces:**
- Consumes: `dispatchWithRetry`, `resetPreamble` (via `ctx.dispatchWithRetry`), `retry.mjs` in the test ctx.
- Produces: `engineArgs.retry = { maxAttempts, state: { used, max } }`; `ctx.dispatchWithRetry`; `runTask` returns `{ ...ok:false, quarantined: { stage: 'execute', retries, error } }` when the implementer exhausts retries (surfaced to the report in Task 4; shows as a task failure/halt in the interim).

- [ ] **Step 1: Write the failing headline + no-amplification tests** — append to `<lib>/tests/mitosis-scheduler.test.mjs`

`transientImplAgent`: returns `null` for the first `impl:<taskId>` call, then delegates to `createFakeAgent` (model on `crashingAgent`, but count-based). Assert (a) the 2nd impl prompt carries the reset preamble, (b) the MSP still ships, (c) impl is called exactly twice.

```javascript
function transientImplAgent(msps, blipMspTaskLabelPrefix = 'impl:') {
  const base = createFakeAgent({ msps });
  const seen = new Map();
  const prompts = [];
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label.startsWith(blipMspTaskLabelPrefix)) {
      prompts.push(prompt);
      const n = (seen.get(label) || 0) + 1;
      seen.set(label, n);
      if (n === 1) return null;
    }
    return base(prompt, opts);
  };
  return { agent, calls: (label) => seen.get(label) || 0, prompts: () => prompts };
}

test('P2 headline: a transient implementer drop re-dispatches with a worktree reset and the MSP still ships', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const { agent, calls, prompts } = transientImplAgent(msps);
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['solo']);
  assert.equal(calls('impl:t0'), 2, 'implementer dispatched exactly twice (one retry)');
  const retryPrompt = prompts()[1];
  assert.match(retryPrompt, /reset --hard/);
  assert.match(retryPrompt, /clean -fdx/);
});

test('P2 no-amplification: an always-null implementer is dispatched at most maxAttempts times', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  let implCalls = 0;
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('impl:')) { implCalls += 1; return null; }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis({ ...buildInput(), retry: { maxAttempts: 3, runBudget: 5 } }, agent);
  const result = await resultPromise;

  assert.equal(implCalls, 3, 'no more than maxAttempts implementer dispatches');
  assert.notEqual(result.overallStatus, 'all-shipped');
});
```

Note: the fake `createFakeAgent`'s harden stage builds `engineArgs` with a single task keyed `t0` (see `buildEngineArgs`), so the implementer label is `impl:t0`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: the two new tests FAIL — currently a `null` implementer status halts immediately (no retry), so `impl:t0` is called once and `overallStatus` is not `all-shipped`; the no-amplification test may pass vacuously today, so treat the headline failure as the RED signal.

- [ ] **Step 3a: `run-engine.mjs` — read retry config at `runEngine` top**

Anchor: the block of `const … = engineArgs.…;` reads near the top of `runEngine` (currently ~lines 44–47, ending `const models = engineArgs.models || {};`). Add immediately after it:

```javascript
  const retry = engineArgs.retry || { maxAttempts: 1, state: { used: 0, max: 0 } };
```

- [ ] **Step 3b: `run-engine.mjs` — retry the implementer dispatch in `runTask`**

Anchor: in `async function runTask(taskId)`, the line
`const status = await agent(implementerPrompt(task, branch, wt), withModel({ label: \`impl:${taskId}\`, phase: 'Waves', schema: STATUS_SCHEMA, agentType: resolvedAgentType }, taskModel));`
Replace it with:

```javascript
    const status = await ctx.dispatchWithRetry(
      (attemptNo, preamble) => agent(preamble + implementerPrompt(task, branch, wt), withModel({ label: `impl:${taskId}`, phase: 'Waves', schema: STATUS_SCHEMA, agentType: resolvedAgentType }, taskModel)),
      { isPermanent: (r) => r.status === 'BLOCKED' || r.status === 'NEEDS_CONTEXT', maxAttempts: retry.maxAttempts, state: retry.state, resetRef: baseBranch, worktree: wt },
    );
    if (status && status.__quarantined) {
      return { taskId, branch, wt, reviewMode, ok: false, reason: 'quarantined', quarantined: { stage: 'execute', retries: status.attempts, error: `implementer exhausted ${status.attempts} attempt(s) (transient drops)` } };
    }
```

The existing guard line immediately below is unchanged and still handles `BLOCKED` / `NEEDS_CONTEXT` / `null` permanent results:
`if (!status || status.status === 'BLOCKED' || status.status === 'NEEDS_CONTEXT') return { taskId, branch, wt, reviewMode, ok: false, reason: status ? status.status : 'null-status' };`
(After a full retry exhaustion the sentinel is caught above; a permanent `BLOCKED` returns through `dispatchWithRetry` and is handled here as before.)

- [ ] **Step 3c: Mirror 3a+3b into the inline `runEngine` twin in `mitosis.js`**

Apply the identical two edits inside the inline `runEngine` block in `mitosis.js` (anchor: the same `const models = engineArgs.models || {};` and the same `const status = await agent(implementerPrompt(...))` line, in the twin range ~272–542). Byte-identical minus `export`.

- [ ] **Step 3d: `mitosis.js` — parse retry config at input**

Anchor: after `const worktreeRoot = input.worktreeRoot;` (currently ~line 653) and before the `requiredFields` block. Add:

```javascript
const retryConfig = (input.retry && typeof input.retry === 'object' && !Array.isArray(input.retry)) ? input.retry : {};
```

After the `fixLoopMax` integer validation block (anchor: `if (!Number.isInteger(fixLoopMax) || fixLoopMax < 0) { return fatalReport('input', 'fixLoopMax must be a non-negative integer', 0); }`), add:

```javascript
if (retryConfig.maxAttempts !== undefined && (!Number.isInteger(retryConfig.maxAttempts) || retryConfig.maxAttempts < 1)) {
  return fatalReport('input', 'retry.maxAttempts must be a positive integer', 0);
}
if (retryConfig.runBudget !== undefined && (!Number.isInteger(retryConfig.runBudget) || retryConfig.runBudget < 0)) {
  return fatalReport('input', 'retry.runBudget must be a non-negative integer', 0);
}
```

- [ ] **Step 3e: `mitosis.js` — construct retry state after decompose**

Anchor: after `const msps = decomposition.msps;` (currently ~line 696) and its `log(...)`. Add:

```javascript
const retryMaxAttempts = Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3;
const retryState = { used: 0, max: Number.isInteger(retryConfig.runBudget) ? retryConfig.runBudget : 2 * msps.length };
```

- [ ] **Step 3f: `mitosis.js` — inject `retry` + `dispatchWithRetry` at the `runEngine` call site**

Anchor: `const engineResult = await runEngine(hardened.engineArgs, { agent, parallel, log, phase });` (currently ~line 882). Replace with:

```javascript
    const engineResult = await runEngine(
      { ...hardened.engineArgs, retry: { maxAttempts: retryMaxAttempts, state: retryState } },
      { agent, parallel, log, phase, dispatchWithRetry },
    );
```

This keeps `buildEngineArgs` (the 14-key harden-agent contract) unchanged and keeps the shared mutable counter out of the agent boundary.

- [ ] **Step 3g: `run-engine.test.mjs` — `ctxWith` supplies `dispatchWithRetry`**

Anchor: the top imports and the `ctxWith` helper. Add the import and extend `ctxWith`:

```javascript
import { dispatchWithRetry } from '../retry.mjs';
```

```javascript
function ctxWith(agent) {
  return {
    agent,
    parallel: async (thunks) => Promise.all(thunks.map((fn) => fn())),
    log: () => {},
    phase: () => {},
    dispatchWithRetry,
  };
}
```

(Existing `run-engine.test.mjs` cases pass `engineArgs` without `.retry`, so `runEngine` uses the `{ maxAttempts: 1, state: { used: 0, max: 0 } }` default: a `DONE` status returns on attempt 1, unchanged.)

- [ ] **Step 4: Run all touched suites to verify GREEN**

Run: `node --test tests/mitosis-scheduler.test.mjs tests/run-engine.test.mjs tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js && node --check run-engine.mjs`
Expected: headline + no-amplification PASS; all prior `run-engine`/scheduler/mirror tests still PASS. Mirror guard confirms the `run-engine` twin edit landed in both files.

- [ ] **Step 5: Commit gate**

Do NOT commit (user has not asked). Append the Task 3 line to the SDD ledger.

---

### Task 4: Per-MSP-per-stage isolation in `runClusterChain` + quarantine surfaced in the report

Guard-and-retry `plan` and `harden` (retryable, read-only — no reset); guard `branch`/`execute` (accurate `crashed`/`halted`, no retry); surface implementer-exhaustion + plan/harden-exhaustion as `quarantined` with a redrive hint; extend `assembleRunReport` (a twin) to emit `quarantined`/`crashed` from a chain result. `runClusterChain` is `mitosis.js`-only (outside both existing twins). `assembleRunReport` and `quarantinedOutcome` ARE twins (edit both files).

**Files:**
- Modify: `<lib>/outcome.mjs` — `quarantinedOutcome` (optional `redrive`) + `assembleRunReport` (quarantined/crashed branches).
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — mirror the `outcome.mjs` edits into the inline outcome twin; add per-stage guards in `runClusterChain`.
- Test: `<lib>/tests/outcome.test.mjs` — quarantined constructor `redrive` + `assembleRunReport` quarantined/crashed mapping.
- Test: `<lib>/tests/mitosis-scheduler.test.mjs` — quarantine acceptance (other clusters finish → partial).

**Interfaces:**
- Consumes: `quarantinedOutcome`, `crashedOutcome`, `dispatchWithRetry` (inline), `retryMaxAttempts`/`retryState` (Task 3).
- Produces: chain-result contract read by `assembleRunReport`:
  - `{ halted: false }` → cluster completed.
  - `{ halted: true, quarantined: true, stage, mspId, error, retries, redrive: { branch, ref, stage } }` → quarantined.
  - `{ halted: true, crashed: true, stage, mspId, error }` → crashed (guarded-not-retried stage returned null / threw).
  - `{ halted: true, stage, mspId, detail }` → halted (existing gate-red / conflict path).

- [ ] **Step 1a: Write failing `outcome.test.mjs` cases** — append

```javascript
test('quarantinedOutcome carries an optional redrive hint only when provided', () => {
  assert.deepEqual(quarantinedOutcome('m3', 'execute', 'boom', 3),
    { kind: 'quarantined', mspId: 'm3', stage: 'execute', error: 'boom', retries: 3 });
  assert.deepEqual(quarantinedOutcome('m3', 'execute', 'boom', 3, { branch: 'x-integration', ref: 'main', stage: 'execute' }),
    { kind: 'quarantined', mspId: 'm3', stage: 'execute', error: 'boom', retries: 3, redrive: { branch: 'x-integration', ref: 'main', stage: 'execute' } });
});

test('assembleRunReport maps a quarantined chain result to a quarantined outcome and blocks all-shipped', () => {
  const report = assembleRunReport({
    clusters: [['a'], ['b']],
    chainResults: [{ halted: false }, { halted: true, quarantined: true, stage: 'execute', mspId: 'b', error: 'exhausted', retries: 3, redrive: { branch: 'b-integration', ref: 'main', stage: 'execute' } }],
    shipped: [{ mspId: 'a', prUrl: 'ua' }],
    mspCount: 2,
  });
  assert.equal(report.overallStatus, 'partial');
  assert.deepEqual(report.quarantined.map((o) => o.mspId), ['b']);
  assert.equal(report.quarantined[0].stage, 'execute');
  assert.equal(report.quarantined[0].redrive.branch, 'b-integration');
});

test('assembleRunReport maps a crashed chain result (guarded stage) to a crashed outcome with accurate stage', () => {
  const report = assembleRunReport({
    clusters: [['a'], ['b']],
    chainResults: [{ halted: false }, { halted: true, crashed: true, stage: 'branch', mspId: 'b', error: 'branch agent returned null' }],
    shipped: [{ mspId: 'a', prUrl: 'ua' }],
    mspCount: 2,
  });
  assert.equal(report.overallStatus, 'partial');
  assert.deepEqual(report.crashed.map((o) => o.mspId), ['b']);
  assert.equal(report.crashed[0].stage, 'branch');
});
```

- [ ] **Step 1b: Run to verify they fail**

Run: `node --test tests/outcome.test.mjs`
Expected: FAIL — `quarantinedOutcome` ignores a 5th arg; `assembleRunReport` maps `{halted:true, quarantined:true}` to a `halted` outcome (no `quarantined`/`crashed` branch yet).

- [ ] **Step 2a: `outcome.mjs` — `quarantinedOutcome` optional redrive**

Replace the current `quarantinedOutcome`:

```javascript
export function quarantinedOutcome(mspId, stage, error, retries, redrive) {
  const outcome = { kind: 'quarantined', mspId, stage, error, retries };
  if (redrive) outcome.redrive = redrive;
  return outcome;
}
```

- [ ] **Step 2b: `outcome.mjs` — `assembleRunReport` quarantined/crashed branches**

Anchor: inside `clusters.forEach((clusterIds, i) => { ... })`, the `if (r.halted) { ... }` block. Replace that `if (r.halted)` block with a priority chain that checks `quarantined` then `crashed` then `halted` (the `r === null || r === undefined` block above it is unchanged):

```javascript
    if (r.halted && r.quarantined) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(quarantinedOutcome(blamed, r.stage || 'unknown', r.error || r.detail || 'quarantined', r.retries, r.redrive));
      return;
    }
    if (r.halted && r.crashed) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(crashedOutcome(blamed, r.stage || 'unknown', r.error || r.detail || 'crashed'));
      return;
    }
    if (r.halted) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      const reason = r.detail || (r.haltReason && (r.haltReason.detail || JSON.stringify(r.haltReason))) || 'halted';
      outcomes.push(haltedOutcome(blamed, r.stage || 'unknown', reason));
    }
```

(`partitionOutcomes` already buckets `quarantined`; `computeOverallStatus` already blocks `all-shipped` on any `quarantined`/`crashed`; the top-level `firstProblem` mirror already includes `partition.quarantined[0]` — no other `outcome.mjs` change needed.)

- [ ] **Step 2c: Mirror 2a+2b into the inline outcome twin in `mitosis.js`**

Apply identical edits to the inline `quarantinedOutcome` and inline `assembleRunReport` in `mitosis.js` (twin range ~59–131). Byte-identical minus `export`.

- [ ] **Step 2d: Run outcome + mirror suites**

Run: `node --test tests/outcome.test.mjs tests/mirror-guard.test.mjs`
Expected: new outcome cases PASS; mirror guard PASS (outcome twin still lockstep).

- [ ] **Step 3a: `mitosis.js` `runClusterChain` — guard+retry Plan and Harden**

Anchor Plan: `const planned = await agent( ... { agentType: 'implementer', schema: PLAN_SCHEMA, label: \`plan:${msp.id}\`, phase: 'Plan' });`. Wrap the dispatch in `dispatchWithRetry` (read-only → no `resetRef`), and quarantine on exhaustion. Concretely, replace `const planned = await agent(PROMPT, OPTS);` with:

```javascript
    const planned = await dispatchWithRetry(
      () => agent(PLAN_PROMPT, PLAN_OPTS),
      { isPermanent: () => false, maxAttempts: retryMaxAttempts, state: retryState },
    );
    if (planned && planned.__quarantined) {
      return { halted: true, quarantined: true, stage: 'plan', mspId: msp.id, error: `plan exhausted ${planned.attempts} attempt(s)`, retries: planned.attempts, redrive: { branch: integrationBranch, ref: baseBranch, stage: 'plan' } };
    }
```

(`PLAN_PROMPT`/`PLAN_OPTS` = the existing prompt string and options object, unchanged.) Do the identical transform for Harden: anchor `const hardened = await agent( ... label: \`harden:${msp.id}\` ...);` → wrap in `dispatchWithRetry` with `isPermanent: () => false`, quarantine-on-exhaust returning `stage: 'harden'`. Because `isPermanent` is `() => false`, any non-null object returns as `ok`; only repeated `null` drops retry/quarantine — so the existing `planned.planPath` / `hardened.route.lane` accesses below remain safe.

- [ ] **Step 3b: `mitosis.js` `runClusterChain` — guard Branch (crashed, no retry)**

Anchor: `const branched = await agent( ... label: \`branch:${msp.id}\` ...);` then `log(...)` then `if (!branched.ready) { return { halted: true, stage: 'branch', mspId: msp.id, detail: branched.detail }; }`. Add a null guard BEFORE the `.ready` access:

```javascript
    if (!branched) {
      return { halted: true, crashed: true, stage: 'branch', mspId: msp.id, error: 'branch agent returned null (transient drop or blocked, guarded-not-retried)' };
    }
```

- [ ] **Step 3c: `mitosis.js` `runClusterChain` — surface execute-stage quarantine**

Anchor: the `if (engineResult.halted) { ... return { halted: true, stage: 'execute', mspId: msp.id, haltReason: engineResult.haltReason }; }` block. Replace its body so a quarantined task inside the wave becomes a chain quarantine:

```javascript
    if (engineResult.halted) {
      log(`mitosis[${msp.id}]: engine HALTED at ${engineResult.haltReason && engineResult.haltReason.stage}`);
      const failed = (engineResult.haltReason && engineResult.haltReason.failed) || [];
      const q = failed.find((f) => f && f.quarantined);
      if (q) {
        return { halted: true, quarantined: true, stage: 'execute', mspId: msp.id, error: q.quarantined.error, retries: q.quarantined.retries, redrive: { branch: integrationBranch, ref: baseBranch, stage: 'execute' } };
      }
      return { halted: true, stage: 'execute', mspId: msp.id, haltReason: engineResult.haltReason };
    }
```

- [ ] **Step 4a: Write the quarantine acceptance test** — append to `<lib>/tests/mitosis-scheduler.test.mjs`

Two independent MSPs; MSP `b`'s implementer returns `null` every time (exhausts retries → quarantine); MSP `a` ships. Assert `a` ships, `b` is quarantined with a redrive hint, and `overallStatus === 'partial'` (other cluster finishes).

```javascript
test('P2 quarantine: an MSP whose implementer never succeeds is quarantined while the other cluster ships; report is partial', async () => {
  const msps = twoIndependentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '').startsWith('impl:')) {
      const engineArgs = buildEngineArgs({ sourcePrefix: SOURCE_PREFIX, mspId: 'b' });
      const bTaskLabel = `impl:${Object.keys(engineArgs.tasks)[0]}`;
      if ((opts.label || '') === bTaskLabel && prompt.includes('b')) return null;
    }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis({ ...buildInput(), retry: { maxAttempts: 2, runBudget: 6 } }, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'partial');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['a']);
  assert.deepEqual(result.quarantined.map((o) => o.mspId), ['b']);
  assert.equal(result.quarantined[0].redrive.stage, 'execute');
});
```

Note on the fake: `createFakeAgent`'s harden stage keys every MSP's engineArgs task as `t0` (see `buildEngineArgs`), so distinguishing MSP `a` from `b` at the `impl:` label is not possible by label alone — the fake above keys off the prompt containing the MSP id. **When implementing, verify how the impl prompt encodes the MSP identity** (the `implementerPrompt` embeds `task.fullText`/`task.title`, which for this fake is empty). If the prompt does not distinguish `a` from `b`, instead drive the blip by task worktree path (the `wt`/`branch` embeds the `branchPrefix` = `${sourcePrefix}/${mspId}`, which IS in the prompt via `git worktree add -b ${branch} ${wt}`). Prefer matching on `scope/b` or `${SOURCE_PREFIX}/b` in the prompt. Pin the exact discriminator during RED and adjust the fake so ONLY MSP `b`'s implementer drops.

- [ ] **Step 4b: Run the full touched set**

Run: `node --test tests/mitosis-scheduler.test.mjs tests/outcome.test.mjs tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js`
Expected: quarantine acceptance + all Task-3 headline tests + outcome + mirror all PASS. Confirm the earlier P1 tests (F2a/F2b/N1/firstHalt) are still GREEN — the new `quarantined`/`crashed` branches must not change existing `halted` mapping.

- [ ] **Step 5: Ledger + commit gate** — append Task 4 line to the SDD ledger; do not commit.

---

### Task 5: `mergeQueue` per-link `.catch` + LOW-1 outer fan-out guard + contract-pin test

One thrown ship must not poison the GLOBAL `mergeQueue` for sibling clusters (fixes F2c). Plus fold in LOW-1: guard the terminal fan-out await and pin the harness `parallel` rejected-thunk→null contract so F2b + quarantine cannot silently regress. `runClusterChain` and the fan-out are `mitosis.js`-only.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the `mergeQueue` link (currently ~line 924) and the outer fan-out await (currently ~line 931).
- Test: `<lib>/tests/mitosis-scheduler.test.mjs` — merge-queue-poisoning test + parallel-contract pin.

**Interfaces:**
- Consumes: the Task-4 chain-result `crashed` contract (a `.catch` returns `{ halted: true, crashed: true, stage: 'ship', mspId, error }`).
- Produces: sibling-cluster isolation across the global merge queue; a defended terminal await.

- [ ] **Step 1: Write the failing tests** — append to `<lib>/tests/mitosis-scheduler.test.mjs`

```javascript
test('P2 merge-queue isolation: a ship that THROWS for one cluster does not poison a sibling cluster’s merge; sibling still ships', async () => {
  const msps = twoIndependentMsps();
  const base = createFakeAgent({ msps });
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '';
    if (label === 'ship:a') throw new Error('injected ship throw for a');
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'partial');
  assert.deepEqual(result.shipped.map((s) => s.mspId), ['b']);
  assert.deepEqual(result.crashed.map((o) => o.mspId), ['a']);
  assert.equal(result.crashed[0].stage, 'ship');
});

test('LOW-1 contract: the harness parallel maps a rejected thunk to null (the invariant F2b + quarantine rely on)', async () => {
  const parallelImpl = async (thunks) => Promise.all(thunks.map((fn) => Promise.resolve().then(fn).then((v) => v, () => null)));
  const out = await parallelImpl([
    () => Promise.resolve('ok'),
    () => { throw new Error('thunk blew up'); },
    async () => { throw new Error('async thunk blew up'); },
  ]);
  assert.deepEqual(out, ['ok', null, null]);
});
```

The first test relies on `ship:a` being distinguishable by label — `shipOneMsp`'s agent call uses `label: \`ship:${msp.id}\``, so `ship:a` works directly (unlike the impl label). If the ship-throw for `a` currently rejects the shared `mergeQueue` and takes down `b`, this is RED today.

- [ ] **Step 2: Run to verify the poisoning test fails**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: the poisoning test FAILS (today the thrown ship rejects `mergeQueue`; because clusters chain onto the same global `mergeQueue`, `b`'s link rejects too — or the run throws). The contract-pin test PASSES immediately (it documents the invariant; keep it as a regression pin).

- [ ] **Step 3a: `mitosis.js` — per-link `.catch` on the merge queue**

Anchor: `const link = (mergeQueue = mergeQueue.then(() => shipOneMsp(msp, clusterIds, i)));`. Replace with:

```javascript
    const link = (mergeQueue = mergeQueue.then(() => shipOneMsp(msp, clusterIds, i)).catch((err) => ({ halted: true, crashed: true, stage: 'ship', mspId: msp.id, error: `ship threw: ${err.message}` })));
```

The `const ship = await link; if (ship.halted) return ship;` below is unchanged — the `.catch` now guarantees `link` resolves to a chain-shaped object (never rejects), so a throw in one cluster's ship returns a `crashed` chain result for that cluster and leaves `mergeQueue` resolved for the next cluster.

- [ ] **Step 3b: `mitosis.js` — guard the terminal fan-out await (LOW-1)**

Anchor: `const chainResults = await parallel(clusters.map((cluster) => () => runClusterChain(cluster)));`. Replace with:

```javascript
let chainResults;
try {
  chainResults = await parallel(clusters.map((cluster) => () => runClusterChain(cluster)));
} catch (err) {
  return fatalReport('cluster', `cluster fan-out await rejected: ${err.message}`, msps.length, { crashed: true });
}
```

This is belt-and-suspenders over the harness `parallel` contract (which maps rejected thunks to null): if a future harness ever reject-fasts, the run still returns a truthful `crashed` fatal report instead of throwing — never a silent all-shipped.

- [ ] **Step 4: Run the touched suites**

Run: `node --test tests/mitosis-scheduler.test.mjs tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js`
Expected: poisoning + contract-pin PASS; all prior scheduler tests still GREEN. (No twin touched, but run mirror guard to confirm nothing shifted.)

- [ ] **Step 5: Ledger + commit gate** — append Task 5 line; do not commit.

---

### Task 6: Shared-fate stages — decompose bounded-retry-then-fail-fast; confirm prepare stays fail-fast

Pre-fan-out stages cannot be isolated (there is no fleet yet), so they use bounded-retry-then **fail-fast loudly**. Decompose gains a retry; a final failure is a truthful `crashed` fatal report with no partial fan-out. Prepare stays fail-fast-only (base-push is unsafe to retry until P4) — lock that with a test.

**Files:**
- Modify: `/Users/satanshumishra/.claude/workflows/mitosis.js` — the decompose dispatch (currently ~lines 679–694).
- Test: `<lib>/tests/mitosis-scheduler.test.mjs` — decompose-retry-then-ship + decompose-exhaust-fail-fast + prepare-not-retried.

**Interfaces:**
- Consumes: inline `dispatchWithRetry`, `fatalReport`, `retryConfig`.
- Produces: decompose retries transient drops up to `retryMaxAttempts` (using a local budget — `msps.length` is not yet known), then `fatalReport('decompose', …, { crashed: true })`.

- [ ] **Step 1: Write the failing tests** — append to `<lib>/tests/mitosis-scheduler.test.mjs`

```javascript
test('P2 shared-fate: a single transient decompose drop retries then the run proceeds to all-shipped', async () => {
  const msps = [mspSpec('solo', { fileScope: ['scope/solo/**'] })];
  const base = createFakeAgent({ msps });
  let decomposeCalls = 0;
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') { decomposeCalls += 1; return decomposeCalls === 1 ? null : { msps }; }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'all-shipped');
  assert.equal(decomposeCalls, 2);
});

test('P2 shared-fate: decompose that never returns fails fast as a crashed report after at most maxAttempts, with no fan-out', async () => {
  let decomposeCalls = 0;
  let otherCalls = 0;
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'decompose') { decomposeCalls += 1; return null; }
    otherCalls += 1; return {};
  };
  const { resultPromise } = invokeMitosis({ ...buildInput(), retry: { maxAttempts: 3 } }, agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'decompose');
  assert.deepEqual(result.crashed.map((o) => o.stage), ['decompose']);
  assert.equal(decomposeCalls, 3);
  assert.equal(otherCalls, 0, 'no fan-out after a shared-fate decompose failure');
});

test('P2 shared-fate: prepare is NOT retried — a single prepare null fails fast (guarded-not-retried, base-push unsafe)', async () => {
  const msps = independentMsps();
  const base = createFakeAgent({ msps });
  let prepareCalls = 0;
  const agent = async (prompt, opts = {}) => {
    if ((opts.label || '') === 'prepare') { prepareCalls += 1; return null; }
    return base(prompt, opts);
  };
  const { resultPromise } = invokeMitosis(buildInput(), agent);
  const result = await resultPromise;

  assert.equal(result.overallStatus, 'failed');
  assert.equal(result.stage, 'prepare');
  assert.equal(prepareCalls, 1, 'prepare dispatched exactly once — never retried');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/mitosis-scheduler.test.mjs`
Expected: decompose-retry-then-ship FAILS (today a null decompose → immediate `fatalReport`, `decomposeCalls === 1`). decompose-exhaust asserts `decomposeCalls === 3` (today 1). prepare-not-retried likely PASSES already (prepare has no retry) — keep it as a regression lock.

- [ ] **Step 3: `mitosis.js` — wrap decompose in bounded retry**

Anchor: the decompose `try { decomposition = await agent(DECOMPOSE_PROMPT, DECOMPOSE_OPTS); } catch (err) { return fatalReport('decompose', \`decompose agent threw before fan-out: ${err.message}\`, 0, { crashed: true }); }` block, followed by `if (!decomposition || !Array.isArray(decomposition.msps)) { return fatalReport('decompose', 'decompose agent returned null or no msps ...', 0, { crashed: true }); }`.

Replace the `decomposition = await agent(...)` call inside the `try` with a bounded-retry dispatch that uses a LOCAL budget (the run budget needs `msps.length`, which decompose produces):

```javascript
    decomposition = await dispatchWithRetry(
      () => agent(DECOMPOSE_PROMPT, DECOMPOSE_OPTS),
      { isPermanent: (r) => !Array.isArray(r.msps), maxAttempts: Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3, state: { used: 0, max: Number.isInteger(retryConfig.maxAttempts) ? retryConfig.maxAttempts : 3 } },
    );
```

Then handle the quarantine sentinel as a fail-fast crashed report (shared-fate — never quarantine a pre-fan-out stage). Immediately after the `try/catch`, before the existing null/msps guard, add:

```javascript
if (decomposition && decomposition.__quarantined) {
  return fatalReport('decompose', `decompose exhausted ${decomposition.attempts} attempt(s) (transient drops before fan-out)`, 0, { crashed: true });
}
```

The existing `if (!decomposition || !Array.isArray(decomposition.msps))` guard remains as the final backstop. `isPermanent: (r) => !Array.isArray(r.msps)` means a decompose that returns an object lacking `msps` is a permanent error (returned, then caught by the backstop as a crashed report), while a `null`/`undefined` drop is transient and retried.

Note: `retryConfig` is available here (parsed at input in Task 3, Step 3d, which is BEFORE the decompose stage). `retryMaxAttempts`/`retryState` are NOT yet constructed at decompose time — do not reference them here; use the local budget shown above.

- [ ] **Step 4: Run the touched + regression set**

Run: `node --test tests/mitosis-scheduler.test.mjs tests/mirror-guard.test.mjs && node --check /Users/satanshumishra/.claude/workflows/mitosis.js`
Expected: all three shared-fate tests PASS; the P1 F2a decompose tests (null → crashed, throw → crashed) still PASS — with retry, a single-null decompose now retries; **verify the P1 F2a "Decompose transient drop (agent returns null)" test still holds** — it asserts one null → crashed `failed`. With retry it would now retry. That P1 test uses an agent that returns `null` for decompose and THROWS on any later call; under retry, the 2nd decompose attempt returns `null` again (same agent), exhausts a 3-attempt local budget, and still ends `failed`/`crashed` at `decompose` — assertion holds on outcome, but `decomposeCalls` rises. If that P1 test asserts a call count, reconcile it (update to allow retries) as part of this task and note it in the ledger. Confirm by reading the test before editing.

- [ ] **Step 5: Ledger + commit gate** — append Task 6 line; do not commit.

---

## Exit criteria (whole increment)

- [ ] `retry.mjs` + all three twins in lockstep (mirror-guard GREEN for outcome, run-engine, retry).
- [ ] Touched suites GREEN: `node --test tests/retry.test.mjs tests/outcome.test.mjs tests/run-engine.test.mjs tests/mitosis-scheduler.test.mjs tests/mirror-guard.test.mjs` (from `<lib>`). The 7 pre-existing `generate-run-script.test.mjs` failures remain out of scope.
- [ ] `node --check /Users/satanshumishra/.claude/workflows/mitosis.js` clean.
- [ ] P2 acceptance (spec §6.126–129) demonstrated by test: transient blip → re-dispatch+reset+ship; permanent MSP → quarantined with worktree preserved while others complete → partial; no amplification (≤ maxAttempts, single application-level layer).
- [ ] Final whole-branch review (superpowers:requesting-code-review, most capable model) over `git merge-base main HEAD`..HEAD — carry the P1 minor-findings roll-up + this increment's Task-per-review minors for triage.
- [ ] Commit is user-gated: do NOT commit or push. `feat/mitosis-resilience` remains unpushed (origin push gated by repo-wide leak remediation in the `claude-config-repo-native-architecture` thread).

## Deferred to Increment 3 (do NOT build here)

- Per-run deadline / checkpoint-and-exit (needs P3 manifest/reconcile; budget is non-deterministic).
- Ship + prepare base-push retry (needs P4 done-oracle / observe-then-converge; a local reset cannot undo a push).
- Literal backoff/jitter + per-dispatch timeouts (determinism-incompatible; harness already provides them).
