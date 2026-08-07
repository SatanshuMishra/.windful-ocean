# Continuity v2 — Plan 05: Drift Reconciliation + Branch Re-attach

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is plan 5 of 6; the shared contract lives in `2026-06-30-continuity-v2-00-overview.md` and is authoritative for every schema, interface, tool name, and constraint referenced here.

**Goal:** Ship the drift pipeline and re-attach flow. `runReconcile(ctx)` compares each open `BranchBinding` against LIVE git state (observed THROUGH the driver), emits the 8-signal drift report, dispositions each binding, applies the binding-status bookkeeping it owns, THEN scans the repo's branches for new/renamed ones with no binding and re-attaches them (pin 7), returning `{drift:[...], dispositions:[...]}` per Plan 00. `reattach` re-binds a Thread whose branch was renamed/re-created to the new branch via the `Thread-Id:` trailer, `first_commit` SHA match, and slug fallback, updating binding lineage. `runReconcile` stays COMMIT-FREE (pin 6): Plan 05 FILLS the engine `src/drift/reconcile.mjs` that Plan 03 stubbed, while the Plan-03-owned `reconcile` MCP tool wraps the result with `commitAndReindex`.

**Architecture:** Pure classification (`classifyObservation`) and pure disposition (`disposeBinding`) are separated from I/O orchestration (`reconcile`, `reattach`), so all 8 signals and every disposition branch are exhaustively unit-testable with hand-built observation objects and in-memory fake drivers — no live git needed at this layer. Live git is reached ONLY through two driver methods (`observeBranch`, `observeNewBranch`), so no `src/drift/*` file ever shells out to git. FSM enforcement stays in exactly one place (`transition_thread`, Plan 03): `reconcile` applies binding-status lifecycle updates (bookkeeping the tool owns, no FSM gate) and RECOMMENDS thread transitions in the disposition payload; it never bypasses the DoD gate.

**Tech Stack:** Node.js >= 20 (ESM), `node --test`, plain JS. Consumes Plan 01 (`newBinding`, `isUlid`, `isTerminal`) and Plan 00's `StorageDriver` contract. No new runtime dependency.

## Dependency note (Plans 02 and 03 not yet on disk)

At authoring time Plan 02 (`git-ref-driver`) and Plan 03 (`mcp-server`) were NOT present in `docs/superpowers/plans/`. This plan therefore:

- Consumes the `StorageDriver` interface from **Plan 00 verbatim** and adds the git observations it needs as **new GitRefDriver methods**, FLAGGED below for Plan 02 to implement (`observeBranch`, `observeNewBranch`, and the pin-7 scan's `listRepoBranches`). No `src/drift/*` file hard-codes a git command — every live-git fact arrives through the driver, per the global "storage reached ONLY through the driver" rule.
- FILLS the engine `src/drift/reconcile.mjs` (`runReconcile(ctx, opts?) -> {drift, dispositions}`) that Plan 03 stubs, against **Plan 00's pinned tool signature** (`reconcile({}) -> {drift, dispositions}`). The MCP tool `src/tools/reconcile.mjs` is Plan-03-owned: its handler returns `runReconcile(ctx)` and the Plan 03 wrapper adds `commitAndReindex` (pin 6). Plan 05 does not write or test the tool file; the load-bearing invariant is that the handler returns `runReconcile(ctx)` and preserves the `{drift, dispositions}` shape.

## Cross-plan seams introduced here (see the flags at the end of the file)

- `GitRefDriver.observeBranch(binding) -> BranchObservation` — NEW, Plan 02 must implement.
- `GitRefDriver.observeNewBranch(repo, branch) -> {thread_id_trailer, first_commit}` — NEW, Plan 02 must implement.
- `GitRefDriver.listRepoBranches(repo) -> string[]` — the branch-enumeration seam the pin-7 new/renamed-branch scan needs, ALREADY PINNED in Plan 00's `StorageDriver` interface (git-drivers-only, LocalDriver throwing stub), so no Plan 00 change is needed; FLAGGED for the consistency re-check only because Section C's Plan 02 row does not list it explicitly — see the flags section.
- `reattach(driver, {repo, branch}, opts?)` — library export; there is no pinned `reattach` MCP tool, so it is REACHABLE two ways: `runReconcile`'s pin-7 scan calls it, and Plan 03/04 may also invoke it directly (e.g. from `bind_branch` on an unmatched branch).
- `src/drift/reconcile.mjs` — Plan 03 stubs the module (exports `runReconcile(ctx)` ONLY); THIS plan fills that body AND adds the pure `closedBinding(...)` export (Task 4). The MCP tool `src/tools/reconcile.mjs` is Plan-03-owned and NOT touched here.

## Context to read first

- `2026-06-30-continuity-v2-00-overview.md` — FROZEN contract: `BranchBinding` schema, `StorageDriver` interface, MCP tool surface (`reconcile({}) -> {drift, dispositions}`), plan index.
- `2026-06-30-continuity-v2-01-core-and-local-driver.md` — consumed symbols: `newBinding` (`src/model/binding.mjs`), `isUlid` (`src/util/ulid.mjs`), `isTerminal` (`src/model/fsm.mjs`), `LocalDriver` (`src/drivers/local-driver.mjs`).
- `2026-06-30-continuity-redesign-v2-design.md` — spec §"Lifecycle and drift", acceptance criteria (8-signal fixtures + re-attach ladder).
- `docs/session-continuity-redesign/DESIGN-STATE.md` §6.2 (BranchBinding lifecycle), §6.3 (drift pipeline — the 8 signals + 3 dispositions), §6.4 (re-attach ladder).

## Global Constraints (verbatim from Plan 00 — apply to EVERY task)

- Runtime: Node.js >= 20, ES modules only (`.mjs`). No TypeScript. No build step.
- Tests: Node's built-in runner only — `node --test`. No jest/vitest/mocha.
- Dependencies: exactly three runtime deps across the whole plugin. This plan adds NONE.
- No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits.
- Immutability: never mutate a record in place; construct a new object and atomically write it (`reconcile` builds a fresh closed binding and calls `writeBinding`, which validates + atomic-writes). Small focused files (200–400 lines typical, 800 hard max). Comprehensive error handling; validate at every boundary; never silently swallow errors.
- All cross-references use a stable ULID. A slug or file path is NEVER a link target (slug match resolves TO a ULID, then binds by that ULID).
- Storage is reached ONLY through the driver interface. No task hard-codes a git command or a filesystem path outside a driver.
- Commit cadence: one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`).

## Contract shapes

`BranchObservation` is now PINNED in Plan 00 (the frozen contract) as the 11-field return of `observeBranch(binding)`; Plan 05 CONSUMES it verbatim through `signals.mjs` and never redefines it. Plan 02 (GitRefDriver) computes it. The pinned shape:

```
{
  branch_exists: boolean,
  head_sha: string | null,
  first_commit_present: boolean,
  merged: boolean,
  squash_merged: boolean,
  ahead: number,
  behind: number,
  force_push_detected: boolean,
  diverged_from_upstream: boolean,
  key_files_deleted: string[],
  key_files_modified: string[]
}
```

Field semantics (from Plan 00): `first_commit_present` is `true` when `binding.first_commit` is null (nothing to miss). `merged` = branch tip reachable from the integration base (true merge); `squash_merged` = patch-id of the branch content matches a commit on the base. `ahead`/`behind` are integers `>= 0` vs `origin/<branch>`. `diverged_from_upstream` (REPLACES the earlier `is_ancestor_of_base`) is computed against `origin/<vcs_ref>` as `NOT(head is-ancestor-of origin/<branch>) AND NOT(origin/<branch> is-ancestor-of head)` via bidirectional `git merge-base --is-ancestor`. It is `true` ONLY on genuine divergence / force-push; a healthy ahead / behind / in-sync branch, and a branch with no upstream, are `false` — so the derived `not-ancestor` signal does NOT fire on every live branch. `head_sha` is carried for other consumers even though `signals.mjs` does not read it. `key_files_deleted`/`key_files_modified` are ledger/thread key files changed out from under the tool.

`DriftEntry` (element of `drift[]`; defined here): `{ binding_id, thread_id, repo, branch, classification, signals: [{code, classification, detail}] }`.

**Classification field (cross-editor seam with Plan 06 e2e).** Every drift entry — and every per-signal element — carries a field LITERALLY named `classification` whose value is exactly one of `{"CRITICAL","WARNING","COMPLETE"}` (uppercase string constants `CRITICAL`/`WARNING`/`COMPLETE`, NOT the earlier `severity`/`complete-candidate` vocabulary). The entry's `classification` is the max over its signals (`CLASSIFICATION_RANK`: CRITICAL 3 > WARNING 2 > COMPLETE 1). Per-signal mapping (design-faithful per DESIGN-STATE §6.3 and `decisions/2026-06-30-continuity-durability-reframe.md` — "reconcile, not police"):
- `head-missing`, `force-push`, `key-file-deleted` -> **CRITICAL** (the recorded anchor is invalid; disposition re-verifies / resets the ledger to HEAD);
- `not-ancestor`, `divergence` (ahead/behind), `key-file-modified`, `branch-gone(deleted)` -> **WARNING** (a deleted/incomplete branch is a calm reconcile that dispositions to reopen-as-paused — the reframe DE-POLICES branch deletion, so `deleted` is WARNING, never CRITICAL);
- `squash-merged`, `branch-gone(merged)` -> **COMPLETE**.
Plan 06 binds to `classification` directly (no fall-back to a `severity`/`level` field). Dispositions are SEPARATE: they carry `action`/`kind` (e.g. `{kind:"reattach",...}`), never `classification`, and detect merged/deleted by the `branch-gone` `detail` (`'merged'`/`'deleted'`), decoupled from the classification value.
`Disposition` (element of `dispositions[]`; defined here). Two variants share the array:
- binding-drift disposition: `{ binding_id, thread_id, action, binding_status, closed_reason, thread_recommendation, dod_ready, reason }`.
- re-attach disposition (from the new/renamed-branch scan, pin 7): `{ kind: "reattach", thread_id, branch, repo, method }`.

The 8 signals (DESIGN-STATE §6.3) map to codes: `head-missing`, `not-ancestor`, `divergence`, `force-push`, `key-file-deleted`, `key-file-modified`, `squash-merged`, `branch-gone` (the "branch deleted / merged" signal; `classification` `COMPLETE` when the work landed, `WARNING` when the branch was deleted incomplete — the de-policed reconcile, per the classification seam above).

## File Structure (this plan creates)

- `src/drift/signals.mjs` — classification constants + pure `classifyObservation(binding, observation)`.
- `src/drift/dispose.mjs` — pure `disposeBinding(entry, thread)`.
- `src/drift/branch-slug.mjs` — pure `branchSlug(branch)`.
- `src/drift/reattach.mjs` — `reattach(driver, {repo, branch}, opts?)`.
- `test/unit/drift-signals.test.mjs`, `drift-dispose.test.mjs`, `drift-branch-slug.test.mjs`, `drift-reconcile.test.mjs`, `drift-reattach.test.mjs`.

This plan FILLS `src/drift/reconcile.mjs` (Plan 03 created the module + the `runReconcile(ctx)` stub — that export ONLY): it fills `runReconcile`'s body AND adds the pure `closedBinding(...)` export. This plan does NOT touch `src/tools/reconcile.mjs`; Plan 03 OWNS that tool file (see Task 6).

---

### Task 1: Drift classifier (the 8 signals)

**Files:**
- Create: `src/drift/signals.mjs`
- Test: `test/unit/drift-signals.test.mjs`

**Interfaces:**
- Consumes: nothing (pure; operates on a `BranchObservation` supplied by the caller).
- Produces: `CRITICAL`/`WARNING`/`COMPLETE` classification constants (string values `"CRITICAL"`/`"WARNING"`/`"COMPLETE"`), `CLASSIFICATION_RANK`, `classifyObservation(binding, observation): DriftEntry | null`. Each entry and each per-signal element carries a `classification` in that vocabulary, per the Plan 06 seam mapping above. Returns `null` when no signal fires. Consumed by `runReconcile` (Task 4).

- [ ] **Step 1: Write the failing test**

`test/unit/drift-signals.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyObservation, CRITICAL, WARNING, COMPLETE } from '../../src/drift/signals.mjs'

const BINDING = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  thread_id: '01ARZ3NDEKTSV4RRFFQ69G5FBW',
  repo: 'git@github.com:acme/app.git',
  branch: 'fix/signup-bug',
}

function obs(overrides = {}) {
  return {
    branch_exists: true,
    head_sha: '9f3a1c2',
    first_commit_present: true,
    merged: false,
    squash_merged: false,
    ahead: 0,
    behind: 0,
    force_push_detected: false,
    diverged_from_upstream: false,
    key_files_deleted: [],
    key_files_modified: [],
    ...overrides,
  }
}

function codes(entry) {
  return entry.signals.map((s) => s.code).sort()
}

test('a clean branch produces no drift (null)', () => {
  assert.equal(classifyObservation(BINDING, obs()), null)
})

test('force-push and a missing recorded commit are CRITICAL (recorded anchor invalid)', () => {
  const e1 = classifyObservation(BINDING, obs({ force_push_detected: true }))
  assert.deepEqual(codes(e1), ['force-push'])
  assert.equal(e1.classification, CRITICAL)
  const e2 = classifyObservation(BINDING, obs({ first_commit_present: false }))
  assert.deepEqual(codes(e2), ['head-missing'])
  assert.equal(e2.classification, CRITICAL)
})

test('divergence and not-ancestor and key-file-modified are WARNING', () => {
  const e = classifyObservation(BINDING, obs({ ahead: 2, behind: 1, diverged_from_upstream: true, key_files_modified: ['a.sql'] }))
  assert.deepEqual(codes(e), ['divergence', 'key-file-modified', 'not-ancestor'])
  assert.equal(e.classification, WARNING)
  assert.match(e.signals.find((s) => s.code === 'divergence').detail, /ahead 2, behind 1/)
})

test('a merged branch is COMPLETE via branch-gone', () => {
  const e = classifyObservation(BINDING, obs({ merged: true }))
  assert.deepEqual(codes(e), ['branch-gone'])
  const g = e.signals.find((s) => s.code === 'branch-gone')
  assert.equal(g.classification, COMPLETE)
  assert.equal(g.detail, 'merged')
  assert.equal(e.classification, COMPLETE)
})

test('a squash-merged branch reports both squash-merged and branch-gone(merged)', () => {
  const e = classifyObservation(BINDING, obs({ squash_merged: true }))
  assert.deepEqual(codes(e), ['branch-gone', 'squash-merged'])
  assert.equal(e.signals.find((s) => s.code === 'branch-gone').classification, COMPLETE)
})

test('a branch deleted while incomplete is branch-gone(deleted) WARNING (de-policed reconcile)', () => {
  const e = classifyObservation(BINDING, obs({ branch_exists: false, head_sha: null }))
  assert.deepEqual(codes(e), ['branch-gone'])
  const g = e.signals.find((s) => s.code === 'branch-gone')
  assert.equal(g.classification, WARNING)
  assert.equal(g.detail, 'deleted')
})

test('a deleted key file is CRITICAL and classification is the max across signals', () => {
  const e = classifyObservation(BINDING, obs({ key_files_deleted: ['schema.sql'], ahead: 1 }))
  assert.equal(e.classification, CRITICAL)
  assert.deepEqual(codes(e), ['divergence', 'key-file-deleted'])
})

test('the entry carries binding identity', () => {
  const e = classifyObservation(BINDING, obs({ merged: true }))
  assert.equal(e.binding_id, BINDING.id)
  assert.equal(e.thread_id, BINDING.thread_id)
  assert.equal(e.branch, 'fix/signup-bug')
})

test('a malformed observation is rejected at the boundary', () => {
  assert.throws(() => classifyObservation(BINDING, { branch_exists: true }), /malformed BranchObservation/)
  assert.throws(() => classifyObservation({ id: 'x' }, obs()), /thread_id/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/drift-signals.test.mjs`
Expected: FAIL — cannot import from `../../src/drift/signals.mjs` (module not found).

- [ ] **Step 3: Write the implementation**

`src/drift/signals.mjs`:

```js
export const CRITICAL = 'CRITICAL'
export const WARNING = 'WARNING'
export const COMPLETE = 'COMPLETE'

export const CLASSIFICATION_RANK = { [CRITICAL]: 3, [WARNING]: 2, [COMPLETE]: 1 }

function isValidObservation(o) {
  return Boolean(
    o && typeof o === 'object'
    && typeof o.branch_exists === 'boolean'
    && typeof o.first_commit_present === 'boolean'
    && typeof o.merged === 'boolean'
    && typeof o.squash_merged === 'boolean'
    && Number.isInteger(o.ahead) && o.ahead >= 0
    && Number.isInteger(o.behind) && o.behind >= 0
    && typeof o.force_push_detected === 'boolean'
    && typeof o.diverged_from_upstream === 'boolean'
    && Array.isArray(o.key_files_deleted)
    && Array.isArray(o.key_files_modified),
  )
}

export function classifyObservation(binding, observation) {
  if (!binding || !binding.id || !binding.thread_id) {
    throw new Error('classifyObservation: a binding with id and thread_id is required')
  }
  if (!isValidObservation(observation)) {
    throw new Error('classifyObservation: malformed BranchObservation')
  }

  const signals = []
  const add = (code, classification, detail) => signals.push({ code, classification, detail })

  if (!observation.first_commit_present) {
    add('head-missing', CRITICAL, 'recorded first_commit is unreachable')
  }
  if (observation.force_push_detected) {
    add('force-push', CRITICAL, 'non-fast-forward rewrite reported by the driver')
  }
  if (observation.key_files_deleted.length > 0) {
    add('key-file-deleted', CRITICAL, observation.key_files_deleted.join(', '))
  }
  if (observation.branch_exists && observation.diverged_from_upstream) {
    add('not-ancestor', WARNING, 'head and origin/<branch> have diverged; neither is an ancestor of the other')
  }
  if (observation.ahead > 0 || observation.behind > 0) {
    add('divergence', WARNING, `ahead ${observation.ahead}, behind ${observation.behind}`)
  }
  if (observation.key_files_modified.length > 0) {
    add('key-file-modified', WARNING, observation.key_files_modified.join(', '))
  }
  if (observation.squash_merged) {
    add('squash-merged', COMPLETE, 'patch-id match on the integration base')
  }

  const workMerged = observation.merged || observation.squash_merged
  if (workMerged || !observation.branch_exists) {
    add('branch-gone', workMerged ? COMPLETE : WARNING, workMerged ? 'merged' : 'deleted')
  }

  if (signals.length === 0) {
    return null
  }

  const classification = signals.reduce(
    (acc, s) => (CLASSIFICATION_RANK[s.classification] > CLASSIFICATION_RANK[acc] ? s.classification : acc),
    COMPLETE,
  )

  return {
    binding_id: binding.id,
    thread_id: binding.thread_id,
    repo: binding.repo,
    branch: binding.branch,
    classification,
    signals,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/drift-signals.test.mjs`
Expected: PASS — 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drift/signals.mjs test/unit/drift-signals.test.mjs
git commit -m "feat: add drift classifier for the eight git signals"
```

---

### Task 2: Disposition policy

**Files:**
- Create: `src/drift/dispose.mjs`
- Test: `test/unit/drift-dispose.test.mjs`

**Interfaces:**
- Consumes: `isTerminal` (Plan 01 `src/model/fsm.mjs`).
- Produces: `disposeBinding(entry, thread): Disposition`. Pure. Maps a `DriftEntry` + its Thread to exactly one disposition. `binding_status`/`closed_reason` are the bookkeeping `reconcile` will APPLY; `thread_recommendation` is advisory (the caller applies it through `transition_thread`, which enforces the FSM/DoD gate). Called only for bindings that produced a drift entry, so it always returns a concrete action.

- [ ] **Step 1: Write the failing test**

`test/unit/drift-dispose.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disposeBinding } from '../../src/drift/dispose.mjs'

const IDS = { binding_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', thread_id: '01ARZ3NDEKTSV4RRFFQ69G5FBW' }

function entry(signals) {
  return { ...IDS, repo: 'r', branch: 'fix/x', classification: signals[0].classification, signals }
}

const MERGED = entry([{ code: 'branch-gone', classification: 'COMPLETE', detail: 'merged' }])
const ORPHANED = entry([{ code: 'branch-gone', classification: 'WARNING', detail: 'deleted' }])
const DIVERGED = entry([{ code: 'divergence', classification: 'WARNING', detail: 'ahead 1, behind 0' }])

const pausedThread = { status: 'paused', completion_criteria: [{ text: 'a', done: true }] }
const doneThread = { status: 'done', completion_criteria: [{ text: 'a', done: true }] }
const incompleteThread = { status: 'active', completion_criteria: [{ text: 'a', done: false }] }

test('a merged binding is marked merged and recommends completion when the thread is open', () => {
  const d = disposeBinding(MERGED, pausedThread)
  assert.equal(d.action, 'mark-merged')
  assert.equal(d.binding_status, 'merged')
  assert.equal(d.closed_reason, 'merged')
  assert.equal(d.thread_recommendation, 'complete')
  assert.equal(d.dod_ready, true)
  assert.equal(d.binding_id, IDS.binding_id)
})

test('a merged binding whose thread is already terminal recommends nothing', () => {
  const d = disposeBinding(MERGED, doneThread)
  assert.equal(d.action, 'mark-merged')
  assert.equal(d.thread_recommendation, 'none')
})

test('dod_ready is false when criteria are not all checked', () => {
  const d = disposeBinding(MERGED, incompleteThread)
  assert.equal(d.dod_ready, false)
})

test('an orphaned binding is marked orphaned and recommends reopen-paused', () => {
  const d = disposeBinding(ORPHANED, incompleteThread)
  assert.equal(d.action, 'mark-orphaned')
  assert.equal(d.binding_status, 'orphaned')
  assert.equal(d.closed_reason, 'deleted')
  assert.equal(d.thread_recommendation, 'reopen-paused')
})

test('a diverged binding recommends re-verify and touches no binding status', () => {
  const d = disposeBinding(DIVERGED, pausedThread)
  assert.equal(d.action, 're-verify')
  assert.equal(d.binding_status, null)
  assert.equal(d.closed_reason, null)
  assert.equal(d.thread_recommendation, 're-verify')
})

test('a null thread degrades gracefully', () => {
  const d = disposeBinding(MERGED, null)
  assert.equal(d.action, 'mark-merged')
  assert.equal(d.thread_recommendation, 'complete')
  assert.equal(d.dod_ready, false)
})

test('a malformed entry is rejected', () => {
  assert.throws(() => disposeBinding({ binding_id: 'x' }, null), /signals/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/drift-dispose.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/drift/dispose.mjs`:

```js
import { isTerminal } from '../model/fsm.mjs'

function criteriaReady(thread) {
  const c = thread?.completion_criteria
  return Array.isArray(c) && c.length > 0 && c.every((x) => x && x.done === true)
}

export function disposeBinding(entry, thread) {
  if (!entry || !entry.binding_id || !Array.isArray(entry.signals)) {
    throw new Error('disposeBinding: a drift entry with signals is required')
  }

  const codes = new Set(entry.signals.map((s) => s.code))
  const merged = codes.has('squash-merged')
    || entry.signals.some((s) => s.code === 'branch-gone' && s.detail === 'merged')
  const orphaned = entry.signals.some((s) => s.code === 'branch-gone' && s.detail === 'deleted')

  const base = { binding_id: entry.binding_id, thread_id: entry.thread_id }
  const terminal = thread ? isTerminal(thread.status) : false

  if (merged) {
    return {
      ...base,
      action: 'mark-merged',
      binding_status: 'merged',
      closed_reason: 'merged',
      thread_recommendation: terminal ? 'none' : 'complete',
      dod_ready: criteriaReady(thread),
      reason: 'branch work landed on the integration base',
    }
  }

  if (orphaned) {
    return {
      ...base,
      action: 'mark-orphaned',
      binding_status: 'orphaned',
      closed_reason: 'deleted',
      thread_recommendation: terminal ? 'none' : 'reopen-paused',
      dod_ready: false,
      reason: 'branch deleted before the work completed',
    }
  }

  return {
    ...base,
    action: 're-verify',
    binding_status: null,
    closed_reason: null,
    thread_recommendation: 're-verify',
    dod_ready: false,
    reason: 'branch diverged from its recorded pointer; re-verify against HEAD',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/drift-dispose.test.mjs`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drift/dispose.mjs test/unit/drift-dispose.test.mjs
git commit -m "feat: add drift disposition policy"
```

---

### Task 3: Branch-name to slug derivation

**Files:**
- Create: `src/drift/branch-slug.mjs`
- Test: `test/unit/drift-branch-slug.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `branchSlug(branch): string` — the slug-match key for re-attach's fallback lookup (`by-slug` index). `feat/foo` -> `feat-foo`, matching the Thread-slug/branch-name convention in DESIGN-STATE §7.2 (`fix/signup-bug` <-> `fix-signup-bug`).

- [ ] **Step 1: Write the failing test**

`test/unit/drift-branch-slug.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { branchSlug } from '../../src/drift/branch-slug.mjs'

test('replaces slashes with dashes to match the on-store slug convention', () => {
  assert.equal(branchSlug('fix/signup-bug'), 'fix-signup-bug')
  assert.equal(branchSlug('feat/a/b'), 'feat-a-b')
  assert.equal(branchSlug('standalone'), 'standalone')
})

test('trims surrounding whitespace', () => {
  assert.equal(branchSlug('  fix/x  '), 'fix-x')
})

test('rejects a non-string or empty branch', () => {
  assert.throws(() => branchSlug(''), /non-empty/)
  assert.throws(() => branchSlug(null), /non-empty/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/drift-branch-slug.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/drift/branch-slug.mjs`:

```js
export function branchSlug(branch) {
  if (typeof branch !== 'string' || branch.trim() === '') {
    throw new Error('branchSlug: branch must be a non-empty string')
  }
  return branch.trim().replace(/\//g, '-')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/drift-branch-slug.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drift/branch-slug.mjs test/unit/drift-branch-slug.test.mjs
git commit -m "feat: add branch-name to slug derivation for re-attach"
```

---

### Task 4: `runReconcile(ctx)` orchestration (FILL Plan 03's stub, body-only)

**Files:**
- Fill: `src/drift/reconcile.mjs` — Plan 03 provides the already-tested `runReconcile(ctx)` stub (that export ONLY); this task fills that body AND adds the pure `closedBinding(...)` export. Do NOT create/clobber the module or rename the existing `runReconcile` export.
- Test: `test/unit/drift-reconcile.test.mjs`

**Ordering note:** the filled `runReconcile` body imports `reattach` from `src/drift/reattach.mjs` (Task 5) for the Phase-2 scan. Implement Task 5 BEFORE this task (or the two together), so the reattach-scan test's `runReconcile` import resolves; the Task-1/2 pure modules it also imports are already on disk.

**Interfaces:**
- Consumes: `classifyObservation` (Task 1), `disposeBinding` (Task 2), `reattach` (Task 5); `ctx.driver` (the selected `StorageDriver`) and `ctx.now` (a FUNCTION returning an ISO timestamp). Driver methods: `isGit()`, `listBindings()`, `readThread(id)`, `writeBinding(b)` (Plan 00 / Plan 01), the git-only `observeBranch(binding)` and `observeNewBranch(repo, branch)` (Plan 02 — FLAGGED), plus the git-only `listRepoBranches(repo)` NEW SEAM the re-attach scan needs (Plan 02 — FLAGGED; see seams section).
- Produces: `runReconcile(ctx, opts?): Promise<{drift, dispositions}>` (exactly Plan 00's `reconcile` return shape) and pure `closedBinding(binding, status, reason, nowIso): BranchBinding`. Non-git drivers short-circuit to `{drift:[], dispositions:[]}` (non-git acceptance criterion).
  - Phase 1 (binding drift): only `status === 'active'` bindings are examined (terminal bindings are already resolved); the ONLY binding side effect is applying `binding_status` bookkeeping via `writeBinding`. Thread transitions are recommended, never applied.
  - Phase 2 (pin 7 / H3 — new/renamed-branch scan makes the re-attach ladder REACHABLE from the existing `reconcile` tool/CLI/SessionStart, no new tool): for every branch in each bound repo that has NO binding, invoke `reattach` (which itself calls `observeNewBranch` and applies the trailer → first_commit → slug → manual ladder). Every MATCHED re-attach is appended to `dispositions[]` as `{ kind: "reattach", thread_id, branch, repo, method }`; unmatched (manual) branches are left alone.
- **Timestamp (M7):** `const now = opts.now ?? (typeof ctx.now === 'function' ? ctx.now() : new Date().toISOString())`. `ctx.now` is a FUNCTION; NEVER stamp the function object itself into a record field.
- **Commit-free (pin 6 / H1):** `runReconcile` MUTATES bindings (via `writeBinding`) but performs NO `commit`/`sync`/re-index. The Plan 03 `reconcile` tool wrapper wraps the result with `commitAndReindex` (like the other write-capable tools), so the commit is neither dropped nor doubled.

- [ ] **Step 1: Write the failing test**

`test/unit/drift-reconcile.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runReconcile, closedBinding } from '../../src/drift/reconcile.mjs'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'

const NOW = '2026-06-30T12:00:00Z'

function cleanObs(overrides = {}) {
  return {
    branch_exists: true,
    head_sha: 'abc',
    first_commit_present: true,
    merged: false,
    squash_merged: false,
    ahead: 0,
    behind: 0,
    force_push_detected: false,
    diverged_from_upstream: false,
    key_files_deleted: [],
    key_files_modified: [],
    ...overrides,
  }
}

function fakeGitDriver({ bindings, threads, observations }) {
  const written = []
  return {
    _written: written,
    isGit: () => true,
    listBindings: async () => bindings,
    readThread: async (id) => threads[id] ?? null,
    observeBranch: async (b) => observations[b.id],
    listRepoBranches: async () => [],
    writeBinding: async (b) => {
      written.push(b)
      return b
    },
  }
}

test('a non-git driver reconciles to an empty report', async () => {
  const root = join(await mkdtemp(join(tmpdir(), 'ledger-reconcile-')), 'ledger')
  const d = new LocalDriver(root)
  await d.init()
  assert.deepEqual(await runReconcile({ driver: d }), { drift: [], dispositions: [] })
  await rm(root, { recursive: true, force: true })
})

test('a merged binding is marked merged; a diverged binding is left untouched', async () => {
  const merged = { id: '01ARZ3NDEKTSV4RRFFQ69G5F01', thread_id: '01ARZ3NDEKTSV4RRFFQ69G5T01', repo: 'r', branch: 'fix/a', status: 'active', created_at: NOW, closed_at: null, closed_reason: null, first_commit: 'aaa', trailer_present: true }
  const diverged = { id: '01ARZ3NDEKTSV4RRFFQ69G5F02', thread_id: '01ARZ3NDEKTSV4RRFFQ69G5T02', repo: 'r', branch: 'fix/b', status: 'active', created_at: NOW, closed_at: null, closed_reason: null, first_commit: 'bbb', trailer_present: true }
  const d = fakeGitDriver({
    bindings: [merged, diverged],
    threads: {
      '01ARZ3NDEKTSV4RRFFQ69G5T01': { status: 'paused', completion_criteria: [{ text: 'x', done: true }] },
      '01ARZ3NDEKTSV4RRFFQ69G5T02': { status: 'active', completion_criteria: [{ text: 'y', done: false }] },
    },
    observations: {
      '01ARZ3NDEKTSV4RRFFQ69G5F01': cleanObs({ squash_merged: true }),
      '01ARZ3NDEKTSV4RRFFQ69G5F02': cleanObs({ ahead: 3 }),
    },
  })

  const { drift, dispositions } = await runReconcile({ driver: d, now: () => NOW })
  assert.equal(drift.length, 2)
  const byId = Object.fromEntries(dispositions.filter((x) => x.binding_id).map((x) => [x.binding_id, x]))
  assert.equal(byId[merged.id].action, 'mark-merged')
  assert.equal(byId[diverged.id].action, 're-verify')

  assert.equal(d._written.length, 1)
  assert.equal(d._written[0].id, merged.id)
  assert.equal(d._written[0].status, 'merged')
  assert.equal(d._written[0].closed_reason, 'merged')
  assert.equal(d._written[0].closed_at, NOW)
})

test('the new/renamed-branch scan re-attaches an unbound branch and reports it', async () => {
  const T01 = '01ARZ3NDEKTSV4RRFFQ69G5T01'
  const bound = { id: '01ARZ3NDEKTSV4RRFFQ69G5F01', thread_id: T01, repo: 'r', branch: 'fix/a', status: 'active', created_at: NOW, closed_at: null, closed_reason: null, first_commit: 'aaa', trailer_present: true }
  const written = []
  const d = {
    _written: written,
    isGit: () => true,
    listBindings: async () => [bound],
    readThread: async (id) => (id === T01 ? { id: T01, status: 'paused', completion_criteria: [] } : null),
    readIndexFile: async () => ({}),
    observeBranch: async () => cleanObs(),
    observeNewBranch: async (repo, branch) => (branch === 'fix/renamed' ? { thread_id_trailer: T01, first_commit: 'bbb' } : { thread_id_trailer: null, first_commit: null }),
    listRepoBranches: async () => ['fix/a', 'fix/renamed'],
    writeBinding: async (b) => { written.push(b); return b },
  }
  const { drift, dispositions } = await runReconcile({ driver: d, now: () => NOW })
  assert.equal(drift.length, 0)
  const reattached = dispositions.find((x) => x.kind === 'reattach')
  assert.ok(reattached)
  assert.equal(reattached.thread_id, T01)
  assert.equal(reattached.branch, 'fix/renamed')
  assert.equal(reattached.method, 'trailer')
  assert.equal(written.some((b) => b.branch === 'fix/renamed' && b.thread_id === T01), true)
})

test('non-active bindings are never observed', async () => {
  const closed = { id: '01ARZ3NDEKTSV4RRFFQ69G5F03', thread_id: '01ARZ3NDEKTSV4RRFFQ69G5T03', repo: 'r', branch: 'fix/c', status: 'merged', created_at: NOW, closed_at: NOW, closed_reason: 'merged', first_commit: 'ccc', trailer_present: true }
  let observed = 0
  const d = {
    isGit: () => true,
    listBindings: async () => [closed],
    readThread: async () => null,
    writeBinding: async (b) => b,
    observeBranch: async () => {
      observed += 1
      return cleanObs()
    },
    observeNewBranch: async () => ({ thread_id_trailer: null, first_commit: null }),
    readIndexFile: async () => ({}),
    listRepoBranches: async () => [],
  }
  const out = await runReconcile({ driver: d, now: () => NOW })
  assert.deepEqual(out, { drift: [], dispositions: [] })
  assert.equal(observed, 0)
})

test('a git driver without observeBranch fails loudly', async () => {
  const d = { isGit: () => true, listBindings: async () => [{ id: 'x', thread_id: 'y', status: 'active' }] }
  await assert.rejects(() => runReconcile({ driver: d, now: () => NOW }), /observeBranch/)
})

test('closedBinding is immutable and stamps closure fields', () => {
  const original = { id: 'b', status: 'active', closed_at: null, closed_reason: null }
  const closed = closedBinding(original, 'orphaned', 'deleted', NOW)
  assert.equal(original.status, 'active')
  assert.equal(closed.status, 'orphaned')
  assert.equal(closed.closed_reason, 'deleted')
  assert.equal(closed.closed_at, NOW)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/drift-reconcile.test.mjs`
Expected: FAIL — Plan 03's `runReconcile` stub body returns a placeholder (not the real `{drift, dispositions}`), so the assertions fail (or module-not-found if the stub is not yet on disk).

- [ ] **Step 3: Write the implementation (fill the body)**

`src/drift/reconcile.mjs` (fill `runReconcile`'s body; keep the exports Plan 03 stubbed):

```js
import { classifyObservation } from './signals.mjs'
import { disposeBinding } from './dispose.mjs'
import { reattach } from './reattach.mjs'

export function closedBinding(binding, status, reason, nowIso) {
  if (typeof nowIso !== 'string' || nowIso.trim() === '') {
    throw new Error('closedBinding: nowIso timestamp is required')
  }
  return { ...binding, status, closed_at: nowIso, closed_reason: reason }
}

export async function runReconcile(ctx, opts = {}) {
  const driver = ctx?.driver
  if (!driver || typeof driver.isGit !== 'function') {
    throw new Error('runReconcile: ctx.driver (a StorageDriver) is required')
  }
  if (!driver.isGit()) {
    return { drift: [], dispositions: [] }
  }
  if (typeof driver.observeBranch !== 'function') {
    throw new Error('runReconcile: a git driver must implement observeBranch(binding)')
  }

  const now = opts.now ?? (typeof ctx.now === 'function' ? ctx.now() : new Date().toISOString())
  const bindings = await driver.listBindings()
  const drift = []
  const dispositions = []

  for (const binding of bindings) {
    if (binding.status !== 'active') {
      continue
    }
    const observation = await driver.observeBranch(binding)
    const entry = classifyObservation(binding, observation)
    if (!entry) {
      continue
    }
    const thread = await driver.readThread(binding.thread_id)
    const disposition = disposeBinding(entry, thread)
    if (disposition.binding_status) {
      const updated = closedBinding(binding, disposition.binding_status, disposition.closed_reason, now)
      await driver.writeBinding(updated)
    }
    drift.push(entry)
    dispositions.push(disposition)
  }

  const boundKeys = new Set(bindings.map((b) => `${b.repo} ${b.branch}`))
  const repos = [...new Set(bindings.map((b) => b.repo))]
  for (const repo of repos) {
    if (typeof driver.listRepoBranches !== 'function') {
      throw new Error('runReconcile: a git driver must implement listRepoBranches(repo) for the re-attach scan')
    }
    const branches = await driver.listRepoBranches(repo)
    for (const branch of branches) {
      if (boundKeys.has(`${repo} ${branch}`)) {
        continue
      }
      const result = await reattach(driver, { repo, branch }, { now })
      if (result.matched) {
        dispositions.push({ kind: 'reattach', thread_id: result.thread_id, branch, repo, method: result.method })
      }
    }
  }

  return { drift, dispositions }
}
```

`runReconcile` performs NO commit/sync/re-index (pin 6). The Plan 03 `reconcile` tool wrapper adds `commitAndReindex` around this result. `ctx.now` is a function (M7); the ternary guard means the function object is never stamped into a field.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/drift-reconcile.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drift/reconcile.mjs test/unit/drift-reconcile.test.mjs
git commit -m "feat: add reconcile drift orchestration"
```

---

### Task 5: `reattach` — re-bind a Thread to a new branch

**Files:**
- Create: `src/drift/reattach.mjs`
- Test: `test/unit/drift-reattach.test.mjs`

**Interfaces:**
- Consumes: `isUlid` (Plan 01 `src/util/ulid.mjs`), `isTerminal` (Plan 01 `src/model/fsm.mjs`), `newBinding` (Plan 01 `src/model/binding.mjs`), `branchSlug` (Task 3); the driver's `isGit()`, `readThread(id)`, `listBindings()`, `readIndexFile('by-slug')`, `writeBinding(b)` (Plan 00 / Plan 01) and the NEW `observeNewBranch(repo, branch)` (Plan 02 — FLAGGED).
- Produces: `reattach(driver, {repo, branch}, opts?): Promise<result>`. Resolution ladder (DESIGN-STATE §6.4 pins trailer, slug, and manual; the `first_commit` SHA rung is this plan's additive extension): (1) `Thread-Id:` trailer, (2) `first_commit` SHA match against existing bindings, (3) slug match via `by-slug`, (4) manual (no match). On a non-terminal match it writes a NEW binding (Continued lifecycle — same Thread, new branch) and recommends resuming the Thread to `active`; on a terminal match it writes NO binding and recommends creating a successor (`predecessor_id`). Thread transitions are recommended, never applied (they go through `transition_thread`).

- [ ] **Step 1: Write the failing test**

`test/unit/drift-reattach.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reattach } from '../../src/drift/reattach.mjs'

const T_PAUSED = '01ARZ3NDEKTSV4RRFFQ69G5T01'
const T_DONE = '01ARZ3NDEKTSV4RRFFQ69G5T02'
const NOW = '2026-06-30T12:00:00Z'

function fakeDriver({ threads = {}, bindings = [], bySlug = {}, observation }) {
  const written = []
  return {
    _written: written,
    isGit: () => true,
    readThread: async (id) => threads[id] ?? null,
    listBindings: async () => bindings,
    readIndexFile: async (name) => (name === 'by-slug' ? bySlug : {}),
    observeNewBranch: async () => observation,
    writeBinding: async (b) => {
      written.push(b)
      return b
    },
  }
}

test('a non-git driver cannot re-attach', async () => {
  const d = { isGit: () => false }
  const r = await reattach(d, { repo: 'r', branch: 'fix/x' })
  assert.equal(r.matched, false)
  assert.equal(r.method, 'unsupported')
})

test('trailer match binds a new binding and recommends resume', async () => {
  const d = fakeDriver({
    threads: { [T_PAUSED]: { id: T_PAUSED, status: 'paused', completion_criteria: [] } },
    observation: { thread_id_trailer: T_PAUSED, first_commit: 'aaa' },
  })
  const r = await reattach(d, { repo: 'r', branch: 'fix/x' }, { now: NOW })
  assert.equal(r.matched, true)
  assert.equal(r.method, 'trailer')
  assert.equal(r.thread_id, T_PAUSED)
  assert.equal(r.recommendation.action, 'resume')
  assert.equal(r.recommendation.thread_to, 'active')
  assert.equal(d._written.length, 1)
  assert.equal(d._written[0].thread_id, T_PAUSED)
  assert.equal(d._written[0].branch, 'fix/x')
  assert.equal(d._written[0].trailer_present, true)
  assert.equal(d._written[0].first_commit, 'aaa')
})

test('first_commit SHA match is the fallback when no trailer resolves', async () => {
  const d = fakeDriver({
    threads: { [T_PAUSED]: { id: T_PAUSED, status: 'blocked', completion_criteria: [] } },
    bindings: [{ id: '01ARZ3NDEKTSV4RRFFQ69G5B01', thread_id: T_PAUSED, first_commit: 'sha-9' }],
    observation: { thread_id_trailer: null, first_commit: 'sha-9' },
  })
  const r = await reattach(d, { repo: 'r', branch: 'feat/y' }, { now: NOW })
  assert.equal(r.method, 'first-commit')
  assert.equal(r.thread_id, T_PAUSED)
  assert.equal(d._written[0].trailer_present, false)
})

test('slug match is the last automatic fallback', async () => {
  const d = fakeDriver({
    threads: { [T_PAUSED]: { id: T_PAUSED, status: 'paused', completion_criteria: [] } },
    bySlug: { 'fix-signup-bug': T_PAUSED },
    observation: { thread_id_trailer: null, first_commit: null },
  })
  const r = await reattach(d, { repo: 'r', branch: 'fix/signup-bug' }, { now: NOW })
  assert.equal(r.method, 'slug')
  assert.equal(r.thread_id, T_PAUSED)
})

test('no signal resolves to a manual prompt', async () => {
  const d = fakeDriver({ observation: { thread_id_trailer: null, first_commit: null } })
  const r = await reattach(d, { repo: 'r', branch: 'fix/unknown' }, { now: NOW })
  assert.equal(r.matched, false)
  assert.equal(r.method, 'manual')
  assert.equal(d._written.length, 0)
})

test('a terminal thread offers a successor and binds nothing', async () => {
  const d = fakeDriver({
    threads: { [T_DONE]: { id: T_DONE, status: 'done', completion_criteria: [{ text: 'a', done: true }] } },
    observation: { thread_id_trailer: T_DONE, first_commit: 'zzz' },
  })
  const r = await reattach(d, { repo: 'r', branch: 'feat/evolve' }, { now: NOW })
  assert.equal(r.matched, true)
  assert.equal(r.method, 'trailer')
  assert.equal(r.binding, null)
  assert.equal(r.recommendation.action, 'offer-successor')
  assert.equal(r.recommendation.predecessor_id, T_DONE)
  assert.equal(d._written.length, 0)
})

test('a target with missing repo or branch is rejected', async () => {
  const d = fakeDriver({ observation: { thread_id_trailer: null, first_commit: null } })
  await assert.rejects(() => reattach(d, { branch: 'x' }), /repo/)
  await assert.rejects(() => reattach(d, { repo: 'r' }), /branch/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/drift-reattach.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/drift/reattach.mjs`:

```js
import { isUlid } from '../util/ulid.mjs'
import { isTerminal } from '../model/fsm.mjs'
import { newBinding } from '../model/binding.mjs'
import { branchSlug } from './branch-slug.mjs'

function validateTarget(target) {
  const repo = target?.repo
  const branch = target?.branch
  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new Error('reattach: target.repo must be a non-empty string')
  }
  if (typeof branch !== 'string' || branch.trim() === '') {
    throw new Error('reattach: target.branch must be a non-empty string')
  }
  return { repo, branch }
}

async function resolveThreadId(driver, branch, observation) {
  if (isUlid(observation.thread_id_trailer)) {
    const t = await driver.readThread(observation.thread_id_trailer)
    if (t) {
      return { thread_id: t.id, method: 'trailer' }
    }
  }
  if (observation.first_commit) {
    const bindings = await driver.listBindings()
    const hit = bindings.find((b) => b.first_commit && b.first_commit === observation.first_commit)
    if (hit) {
      const t = await driver.readThread(hit.thread_id)
      if (t) {
        return { thread_id: t.id, method: 'first-commit' }
      }
    }
  }
  const bySlug = await driver.readIndexFile('by-slug')
  const candidate = bySlug[branchSlug(branch)]
  if (isUlid(candidate)) {
    const t = await driver.readThread(candidate)
    if (t) {
      return { thread_id: t.id, method: 'slug' }
    }
  }
  return null
}

export async function reattach(driver, target, opts = {}) {
  if (!driver || typeof driver.isGit !== 'function') {
    throw new Error('reattach: a StorageDriver is required')
  }
  const { repo, branch } = validateTarget(target)
  if (!driver.isGit()) {
    return { matched: false, method: 'unsupported', repo, branch, reason: 'non-git project has no bindings' }
  }
  if (typeof driver.observeNewBranch !== 'function') {
    throw new Error('reattach: a git driver must implement observeNewBranch(repo, branch)')
  }

  const now = opts.now ?? new Date().toISOString()
  const observation = await driver.observeNewBranch(repo, branch)
  const resolved = await resolveThreadId(driver, branch, observation)

  if (!resolved) {
    return { matched: false, method: 'manual', repo, branch, reason: 'no trailer, first_commit, or slug match' }
  }

  const thread = await driver.readThread(resolved.thread_id)
  if (isTerminal(thread.status)) {
    return {
      matched: true,
      method: resolved.method,
      thread_id: thread.id,
      binding: null,
      recommendation: { action: 'offer-successor', predecessor_id: thread.id, thread_to: null },
      reason: `matched terminal thread via ${resolved.method}; offer a successor`,
    }
  }

  const binding = newBinding({
    thread_id: thread.id,
    repo,
    branch,
    first_commit: observation.first_commit ?? null,
    trailer_present: resolved.method === 'trailer',
    now,
  })
  await driver.writeBinding(binding)

  return {
    matched: true,
    method: resolved.method,
    thread_id: thread.id,
    binding,
    recommendation: { action: 'resume', thread_to: 'active', predecessor_id: null },
    reason: `re-attached ${branch} to its thread via ${resolved.method}`,
  }
}
```

Note: `newBinding` (Plan 01) validates and normalizes; passing `first_commit: null` and `trailer_present` false is legal per the BranchBinding schema. The new binding's `thread_id` IS the lineage link (Continued lifecycle, DESIGN-STATE §6.2); terminal-thread lineage (`predecessor_id`) is created downstream by `create_successor` (Plan 03) using the `offer-successor` recommendation.

Re-attach ladder (confirmed, LOW): the four rungs — (1) `Thread-Id:` trailer, (2) `first_commit` SHA match, (3) `by-slug` slug match, (4) manual — are INTENDED additive robustness, tried in order, each strictly more heuristic than the last. Every rung resolves TO a stable ULID before binding (`isUlid` guards the trailer and slug candidates; the first_commit rung resolves through an existing binding's `thread_id`); a slug or SHA is only a lookup key, never a link target, per the global ULID-only-keys rule. The rung-3 `by-slug` index is keep-EARLIEST on slug collision (first-created thread wins) per Plan 00, so the slug fallback is deterministic and stable across rebuilds — two threads that ever shared a slug never flip which one the fallback resolves.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/drift-reattach.test.mjs`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drift/reattach.mjs test/unit/drift-reattach.test.mjs
git commit -m "feat: add branch re-attach flow"
```

---

### Task 6: Confirm the reconcile-tool seam (Plan-03-owned) + full-suite checkpoint

**Files:** none created, replaced, or tested by Plan 05. `src/tools/reconcile.mjs` is OWNED by Plan 03; Plan 05 must NOT create, overwrite, or ship a test for it (dropping the earlier overwrite avoids clobbering Plan 03's file, per Drift #6/D).

**The seam (bind to Plan 00 / Plan 03):** the `reconcile` MCP tool module Plan 03 authors has shape `{ name, description, inputSchema, handler(args, ctx) }`. Its `handler` calls `runReconcile(ctx)` (Task 4) and returns the engine's `{drift, dispositions}` UNCHANGED; `inputSchema` is the empty-object schema (`type:'object'`, `additionalProperties:false`, `properties:{}`); `ctx.driver` is the selected `StorageDriver`, `ctx.now` the timestamp FUNCTION. Per pin 6 (H1) the Plan 03 write wrapper wraps the handler result with `commitAndReindex` (like the other write-capable tools); `runReconcile` itself stays commit-free, so the commit is neither dropped nor doubled. Plan 05's only load-bearing contribution is the two invariants the handler preserves: it returns `runReconcile(ctx)` and keeps the `{drift, dispositions}` shape. Plan 05 does NOT redefine the tool name, its schema, or its return shape.

- [ ] **Step 1: Run the full suite (integration checkpoint)**

Run: `npm test`
Expected: PASS — every unit test green, including this plan's `drift-signals`, `drift-dispose`, `drift-branch-slug`, `drift-reconcile`, `drift-reattach`, alongside all Plan 01 tests and Plan 03's own reconcile-tool test (which drives `runReconcile` through the tool handler + `commitAndReindex` wrapper). Plan 05 ships no tool test of its own.

Plan 05 creates no files in this task, so there is nothing new to commit here: `src/drift/reconcile.mjs` was committed in Task 4 and `src/drift/reattach.mjs` in Task 5.

---

## Plan 05 Self-Review

- **Spec coverage:** Drift pipeline (§6.3) — `classifyObservation` emits all 8 signals (`head-missing`, `not-ancestor`, `divergence`, `force-push`, `key-file-deleted`, `key-file-modified`, `squash-merged`, `branch-gone`), each carrying a `classification` in `{CRITICAL, WARNING, COMPLETE}` (design-faithful, §6.3 "reconcile, not police": head-missing + force-push + key-file-deleted -> CRITICAL; not-ancestor + divergence + key-file-modified + branch-gone(deleted) -> WARNING; squash-merged + branch-gone(merged) -> COMPLETE); the `not-ancestor` signal now fires off `diverged_from_upstream` (pin 5/8), so it no longer false-positives on every live branch. `disposeBinding` maps them to re-verify / reopen-paused / mark-merged / mark-orphaned. BranchBinding lifecycle (§6.2) — merged -> binding `merged`+`closed_reason:merged` (thread `complete` recommended iff non-terminal); orphaned -> binding `orphaned`+`closed_reason:deleted` (thread `reopen-paused`); Continued -> `reattach` writes a new binding on the same Thread. Re-attach ladder (§6.4, plus the additive first_commit SHA rung) — trailer -> first_commit SHA -> slug -> manual, then non-terminal resume vs terminal successor, now REACHABLE from `runReconcile`'s Phase-2 new/renamed-branch scan (pin 7/H3) via the existing `reconcile` tool/CLI/SessionStart. Non-git degradation (S3) — `runReconcile` and `reattach` short-circuit when `!driver.isGit()`. Tool surface (Plan 00) — `reconcile({}) -> {drift, dispositions}`; the engine `runReconcile(ctx)` is filled here, the tool wrapper is Plan-03-owned.
- **FSM containment:** No `src/drift/*` file applies a Thread transition; `runReconcile`/`reattach` only apply binding-status bookkeeping (no FSM/DoD gate on bindings) and RECOMMEND thread transitions for `transition_thread` (Plan 03) to enforce. This keeps FSM/DoD enforcement in exactly one place.
- **Commit containment (pin 6):** `runReconcile` performs no commit/sync/re-index; the Plan 03 tool wrapper adds `commitAndReindex`. The commit is neither dropped nor doubled.
- **Driver-only git:** No `src/drift/*` file imports `git`/`isGitWorkTree` or shells out; every live-git fact arrives via `driver.observeBranch` / `driver.observeNewBranch` / `driver.listRepoBranches`. Fixture-backed integration of those methods against throwaway git repos is Plan 02's (GitRefDriver) and Plan 06's (e2e) responsibility; Plan 05 tests are deterministic against fake drivers, satisfying the "no real network / no shared mutable state" testing rule.
- **Immutability:** `closedBinding` and `reattach` build fresh objects; `writeBinding` validates + atomic-writes. Verified `original.status` unchanged after `closedBinding`. Timestamps flow from `ctx.now()` (a function, M7); the function object is never stamped into a field.
- **Placeholder scan:** none — every step ships complete code and a concrete run command with expected output.
- **Type consistency:** `runReconcile` returns exactly `{drift, dispositions}`; binding-drift disposition `binding_status` values (`merged`/`orphaned`) and `closed_reason` values (`merged`/`deleted`) are members of the BranchBinding schema enums (Plan 00); re-attach dispositions carry `{kind:"reattach", thread_id, branch, repo, method}`; `newBinding` output validates against the same schema the driver enforces on write.

**Downstream contract produced by Plan 05 (consumed by Plan 06 e2e):**
- `runReconcile(ctx, opts?) -> {drift, dispositions}` (the engine filled here; the `mcp__ledger__reconcile` tool is Plan-03-owned and wraps it with `commitAndReindex`). Plan 06 drives it end-to-end over throwaway git fixtures (squash-merge, force-push, deleted branch, modified/deleted key file) through the REAL `GitRefDriver.observeBranch`, asserting each signal classifies and dispositions correctly, that a merged binding is written `merged`, and that the new/renamed-branch scan re-attaches an unbound branch.
- `reattach(driver, {repo, branch}, opts?)` — Plan 06 asserts trailer (primary), first_commit SHA, slug (fallback), and manual (last resort) re-attach on real branches, and that a new binding lands on the matched Thread.
- Pure `classifyObservation`, `disposeBinding`, `branchSlug`, `closedBinding` for targeted unit reuse.

---

## Cross-plan seams and flags (feeds reconciliation)

- **GitRefDriver methods Plan 02 must add:**
  - `observeBranch(binding) -> BranchObservation` — computes the 11-field `BranchObservation` PINNED in Plan 00 (shape reproduced above) for one open binding against the project repo + `origin/<branch>`. Responsible for: `first_commit_present:true` when `binding.first_commit` is null; best-effort `merged`/`squash_merged` (patch-id) even after branch deletion; `ahead`/`behind` vs remote; `force_push_detected` always the literal `false` in v2 (no reflog-based detection — deferred post-v2 per decision 2026-07-01-continuity-v2-force-push-detected-false; the force-push CRITICAL rung is retained but unreachable, and divergence is carried by `diverged_from_upstream`); `diverged_from_upstream` (bidirectional `git merge-base --is-ancestor` against `origin/<branch>`, TRUE only on genuine divergence — Plan 02's Section-C row); `key_files_deleted`/`key_files_modified`.
  - `observeNewBranch(repo, branch) -> { thread_id_trailer: string|null, first_commit: string|null }` — scans the branch's commits for a `Thread-Id:` trailer and returns its first commit SHA.
  - `listRepoBranches(repo) -> string[]` — the pin-7 new/renamed-branch scan needs to enumerate the repo's branches to find unbound ones; Plan 00 ALREADY PINS this method in the `StorageDriver` interface (git-drivers-only, LocalDriver throwing stub), so no Plan 00 change is needed. Keeping git behind the driver (the plan's core rule) forces this to be a driver method rather than a shelled-out git call in `reconcile.mjs`. FLAG for the consistency re-check: Section C's Plan 02 row does not list it explicitly — confirm Plan 02's GitRefDriver implements `listRepoBranches(repo)` alongside `observeBranch`/`observeNewBranch`.
  These three are the ONLY live-git surface Plan 05 consumes; if Plan 02 names them differently, reconcile the calls in `reconcile.mjs` / `reattach.mjs`.
- **Library export `reattach(...)` (no pinned MCP tool):** Plan 00's tool surface has no `reattach` tool, so re-attach is a library function reached two ways: (a) `runReconcile`'s Phase-2 scan calls it for every unbound branch (pin 7 — this is the primary path, making the ladder reachable with NO new tool), and (b) Plan 03/04 may also invoke it directly (e.g. `bind_branch` on an unmatched branch). No thin `reattach` tool is needed; the scan is the reachability guarantee.
- **Plan 03 reconcile-tool seam:** Plan 03 OWNS `src/tools/reconcile.mjs` with shape `{ name, description, inputSchema, handler(args, ctx) }`, `ctx.driver` the selected driver; its handler returns `runReconcile(ctx)` and the Plan 03 wrapper adds `commitAndReindex` (pin 6). Plan 05 fills the engine `src/drift/reconcile.mjs` (`runReconcile(ctx, opts?)`) that Plan 03 stubbed; Plan 05 does NOT write or test the tool file. Preserve the `{drift, dispositions}` shape and the tool name.
- **Unpinned pointer (designed around):** the "recorded head SHA" pointer that PostToolUse captures (Plan 04) is not a pinned field, so Plan 05 anchors the `head-missing` signal to `BranchObservation.first_commit_present` (derived from the pinned `BranchBinding.first_commit`) and treats "re-verify" as advisory (no pointer mutation). If Plan 04 introduces a recorded-SHA field, `observeBranch` may sharpen `head-missing`.
