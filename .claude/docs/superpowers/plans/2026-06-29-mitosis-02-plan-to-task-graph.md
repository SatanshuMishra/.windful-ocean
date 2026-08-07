# Mitosis Plan 2 — plan-to-task-graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename and redesign `parallel-plan-annotation` into `plan-to-task-graph` — an internal callable of Mitosis that hardens the decomposer's declared task graph with a deterministic, monotonic, machine-owned dependency safety net (`derive-edges.mjs`) before the graph reaches the wave planner.

**Architecture:** Two ownership layers. The INTENT layer is the Mitosis decomposer's judgment (task intent, risk, agentType, validation, and its *declared* fileScope / dependency / contract-pair edges) — authored by the AI, never a human (D2). The STRUCTURE layer is deterministic ground truth: a new pure module `lib/superpowers-parallel/derive-edges.mjs` that unions the declared edges with (a) semantic edges the agent discovered via the D1 LSP oracle + Graphify map and (b) pure fileScope-overlap edges it computes itself. The union is MONOTONIC and add-only — it may ADD any edge the decomposer missed and logs it to an audit file, but NEVER removes or weakens a declared edge. The only halt is an irreconcilable contradiction (a newly-implied dependency cycle), which throws the exact error string the wave planner already uses. The hardened graph is emitted in the existing v2 `.graph.json` contract so the unchanged `generate-run-script.mjs` / `wave-planner.mjs` pipeline consumes it as-is.

**Tech Stack:** Node.js ESM (`.mjs`); the built-in `node:test` runner + `node:assert/strict`; reuse of `scopesOverlap`/`pathsOverlap` from `wave-planner.mjs`; Markdown skill prose; `grep`/`rg` for structural verification.

## Global Constraints

- `~/.claude` is NOT a git repository: NO `git` commands, NO commit steps. Per-task verification commands are the gate. The ledger has no commit step.
- The `protect-claude-config.sh` PreToolUse hook returns "ask" on writes under `rules/`, `skills/`, and `settings` paths — EXPECTED; the human approves each write. Writes under `lib/` and `workflows/` may or may not prompt; approve if asked. Do not treat the prompt as an error.
- NEVER write code comments (shebang/pragma carve-outs only). NEVER use emojis. NEVER add AI co-author attribution.
- Pinned versions, no auto-update in `~/.claude` config; version bumps are human-approved.
- Node 26 test invocation: NEVER pass a bare directory to the test runner (`node --test tests/` raises MODULE_NOT_FOUND under Node 26). ALWAYS use the glob form `node --test "tests/**/*.test.mjs"` run from `lib/superpowers-parallel/`. (decisions/2026-06-11-node26-test-invocation.md)
- Three Pillars priority: Quality > Optimization > Speed; never trade a higher for a lower. (rules/common/pillars.md, built in Plan 1)
- v2 graph contract — every per-task field, EXACT JSON keys and allowed values, preserved verbatim: `id` (string, unique), `title` (string), `fullText` (string, verbatim task body), `dependsOn` (string[], may be `[]`), `fileScope` (string[], non-empty, exhaustive), `risk` (`"low"` | `"high"`), `agentType` (optional; `"implementer"` | `"test-engineer"` | `"mechanical-editor"`; consumers default to `"implementer"`), `validation` (`"scoped"` | `"none"`).
- Edge direction convention (used by every task below): an edge `{ from, to }` means **`from` depends on `to`** — i.e., `to` must appear in `from.dependsOn`, and `to` runs in an earlier wave than `from`.

---

### Task 1: `derive-edges.mjs` — pure monotonic union of declared + overlap edges

**Files:**
- Create: `~/.claude/lib/superpowers-parallel/derive-edges.mjs`
- Create: `~/.claude/lib/superpowers-parallel/tests/derive-edges.test.mjs`

**Interfaces:**
- Consumes: `scopesOverlap(aScopes: string[], bScopes: string[]): boolean` exported from `./wave-planner.mjs` (DRY — do not re-implement path overlap).
- Produces: `deriveEdges(graph, discoveredEdges) -> { graph, added, audit }` and the named helpers below, imported by Task 2 (the CLI) and Plan 3 (the Mitosis flow).
  - `graph`: `{ tasks: Array<{ id: string, dependsOn?: string[], fileScope?: string[], [k: string]: unknown }> }` — the decomposer's DECLARED v2 graph.
  - `discoveredEdges`: `Array<{ from: string, to: string, reason: string }>` — semantic edges the agent found via the D1 oracle / Graphify (`from` depends on `to`). `reason` is a short tag, e.g. `"lsp-call"`, `"graphify-import"`, `"contract-pair"`.
  - Return: `graph` = a NEW hardened graph (every task's `dependsOn` is the sorted union; all other fields untouched, all original tasks preserved); `added` = `Array<{ from, to, reason }>` of edges the safety net injected; `audit` = `{ declaredEdgeCount: number, addedEdgeCount: number, added: Array<{from,to,reason}> }` (no timestamp — the CLI stamps it).
  - On an irreconcilable contradiction (the union is cyclic), throws `Error` with message exactly `dependency cycle detected among: <id>, <id>, ...` — mirroring `wave-planner.mjs:48`.

- [ ] **Step 1: Write the failing tests**

Create `~/.claude/lib/superpowers-parallel/tests/derive-edges.test.mjs` with this exact content:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEdges } from '../derive-edges.mjs';

function graphOf(...tasks) {
  return { tasks: tasks.map((t) => ({ dependsOn: [], fileScope: [], ...t })) };
}

test('clean graph: all dependencies declared, nothing added', () => {
  const g = graphOf(
    { id: 't1', fileScope: ['lib/a.js'] },
    { id: 't2', fileScope: ['lib/b.js'], dependsOn: ['t1'] },
  );
  const { graph, added, audit } = deriveEdges(g, []);
  assert.equal(added.length, 0);
  assert.equal(audit.addedEdgeCount, 0);
  assert.deepEqual(graph.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
});

test('fileScope overlap with no declared edge is auto-added later->earlier', () => {
  const g = graphOf(
    { id: 't1', fileScope: ['lib/shared.js'] },
    { id: 't2', fileScope: ['lib/shared.js'] },
  );
  const { graph, added, audit } = deriveEdges(g, []);
  assert.equal(added.length, 1);
  assert.deepEqual(added[0], { from: 't2', to: 't1', reason: 'fileScope-overlap' });
  assert.deepEqual(graph.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
  assert.equal(audit.addedEdgeCount, 1);
});

test('fileScope overlap already serialized either direction adds no edge', () => {
  const forward = graphOf(
    { id: 't1', fileScope: ['lib/shared.js'] },
    { id: 't2', fileScope: ['lib/shared.js'], dependsOn: ['t1'] },
  );
  assert.equal(deriveEdges(forward, []).added.length, 0);
  const reverse = graphOf(
    { id: 't1', fileScope: ['lib/shared.js'], dependsOn: ['t2'] },
    { id: 't2', fileScope: ['lib/shared.js'] },
  );
  assert.equal(deriveEdges(reverse, []).added.length, 0);
});

test('discovered semantic edge not declared is auto-added with its reason', () => {
  const g = graphOf(
    { id: 't1', fileScope: ['lib/a.js'] },
    { id: 't2', fileScope: ['lib/b.js'] },
  );
  const { graph, added } = deriveEdges(g, [{ from: 't2', to: 't1', reason: 'lsp-call' }]);
  assert.deepEqual(added, [{ from: 't2', to: 't1', reason: 'lsp-call' }]);
  assert.deepEqual(graph.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
});

test('monotonic: a declared edge is never removed', () => {
  const g = graphOf(
    { id: 't1', fileScope: ['lib/a.js'] },
    { id: 't2', fileScope: ['lib/b.js'], dependsOn: ['t1'] },
  );
  const { graph } = deriveEdges(g, []);
  assert.ok(graph.tasks.find((t) => t.id === 't2').dependsOn.includes('t1'));
});

test('discovered edge contradicting a declared edge halts with the wave-planner cycle string', () => {
  const g = graphOf(
    { id: 't1', fileScope: ['lib/a.js'], dependsOn: ['t2'] },
    { id: 't2', fileScope: ['lib/b.js'] },
  );
  assert.throws(
    () => deriveEdges(g, [{ from: 't2', to: 't1', reason: 'lsp-call' }]),
    /dependency cycle detected among: /,
  );
});

test('discovered edge to an unknown task throws', () => {
  const g = graphOf({ id: 't1', fileScope: ['lib/a.js'] });
  assert.throws(
    () => deriveEdges(g, [{ from: 't1', to: 'tX', reason: 'lsp-call' }]),
    /unknown task/,
  );
});

test('declared dependency on an unknown task throws (mirrors wave-planner)', () => {
  const g = graphOf({ id: 't1', fileScope: ['lib/a.js'], dependsOn: ['tZ'] });
  assert.throws(() => deriveEdges(g, []), /unknown task/);
});

test('duplicate task id throws', () => {
  const g = graphOf(
    { id: 't1', fileScope: ['lib/a.js'] },
    { id: 't1', fileScope: ['lib/b.js'] },
  );
  assert.throws(() => deriveEdges(g, []), /duplicate task id/);
});

test('hardened dependsOn is sorted and deduplicated', () => {
  const g = graphOf(
    { id: 't1', fileScope: ['lib/a.js'] },
    { id: 't2', fileScope: ['lib/a.js'] },
    { id: 't3', fileScope: ['lib/a.js'], dependsOn: ['t2', 't1', 't2'] },
  );
  const { graph } = deriveEdges(g, []);
  assert.deepEqual(graph.tasks.find((t) => t.id === 't3').dependsOn, ['t1', 't2']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/derive-edges.test.mjs"
```
Expected: FAIL — every test errors with a module-resolution / "deriveEdges is not a function" failure because `derive-edges.mjs` does not exist yet.

- [ ] **Step 3: Write `derive-edges.mjs`**

Create `~/.claude/lib/superpowers-parallel/derive-edges.mjs` with this exact content:

```js
import { scopesOverlap } from './wave-planner.mjs';

function indexTasks(graph) {
  if (!graph || !Array.isArray(graph.tasks)) throw new Error('graph.tasks must be an array');
  const byId = new Map();
  for (const t of graph.tasks) {
    if (!t.id) throw new Error('task missing id');
    if (byId.has(t.id)) throw new Error(`duplicate task id: ${t.id}`);
    byId.set(t.id, t);
  }
  return byId;
}

function edgeKey(from, to) {
  return `${from} ${to}`;
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

export function deriveEdges(graph, discoveredEdges = []) {
  const byId = indexTasks(graph);
  const deps = new Map();
  let declaredEdgeCount = 0;
  for (const id of byId.keys()) {
    const declared = byId.get(id).dependsOn || [];
    const set = new Set();
    for (const dep of declared) {
      assertKnown(byId, dep, `task ${id} dependsOn`);
      set.add(dep);
      declaredEdgeCount++;
    }
    deps.set(id, set);
  }

  const added = [];
  const have = (from, to) => deps.get(from).has(to);
  const addEdge = (from, to, reason) => {
    if (from === to || have(from, to)) return;
    deps.get(from).add(to);
    added.push({ from, to, reason });
  };

  for (const e of discoveredEdges) {
    assertKnown(byId, e.from, 'discovered edge from');
    assertKnown(byId, e.to, 'discovered edge to');
    addEdge(e.from, e.to, e.reason);
  }

  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[j]);
      if (!scopesOverlap(a.fileScope || [], b.fileScope || [])) continue;
      if (have(b.id, a.id) || have(a.id, b.id)) continue;
      addEdge(b.id, a.id, 'fileScope-overlap');
    }
  }

  detectCycle(byId, deps);

  const tasks = graph.tasks.map((t) => ({
    ...t,
    dependsOn: [...deps.get(t.id)].sort(),
  }));

  return {
    graph: { ...graph, tasks },
    added,
    audit: {
      declaredEdgeCount,
      addedEdgeCount: added.length,
      added: added.map((e) => ({ ...e })),
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/derive-edges.test.mjs"
```
Expected: PASS — all 10 tests pass (`# pass 10`, `# fail 0`).

- [ ] **Step 5: Confirm `scopesOverlap` is actually exported by `wave-planner.mjs`**

The import in Step 3 depends on `wave-planner.mjs` exporting `scopesOverlap`. Verify:
```bash
grep -nE "export (function )?scopesOverlap" ~/.claude/lib/superpowers-parallel/wave-planner.mjs ; echo "exit=$?"
```
Expected: one matching line, `exit=0`. If `exit=1`, `scopesOverlap` is defined but not exported — add `export` to its declaration in `wave-planner.mjs` (e.g. `export function scopesOverlap`), then re-run Step 4. Do not duplicate the function into `derive-edges.mjs`.

No commit step — `~/.claude` is non-git.

---

### Task 2: `derive-edges.mjs` CLI — hardens a graph file and writes the audit log

**Files:**
- Modify: `~/.claude/lib/superpowers-parallel/derive-edges.mjs` (add a CLI entrypoint)
- Modify: `~/.claude/lib/superpowers-parallel/tests/derive-edges.test.mjs` (add CLI tests)

**Interfaces:**
- Consumes: `deriveEdges` from Task 1.
- Produces: the CLI `node derive-edges.mjs <declared.graph.json> <discovered-edges.json> [--out <path>] [--audit <path>]`. Defaults: `--out` = the input path with `.graph.json` replaced by `.hardened.graph.json`; `--audit` = input path with `.graph.json` replaced by `.edges-audit.json`. Writes the hardened graph (v2 contract, ready for `generate-run-script.mjs`) and the audit file (the `audit` object plus an `at` ISO timestamp). On a cycle, prints `derive-edges error: <message>` to stderr and exits 1, mirroring `wave-planner.mjs`'s CLI error behavior.

- [ ] **Step 1: Write the failing CLI tests**

Append these tests to `~/.claude/lib/superpowers-parallel/tests/derive-edges.test.mjs`:

```js
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../derive-edges.mjs', import.meta.url));

function runCli(args, cwd) {
  return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
}

test('CLI writes a hardened graph and an audit file with a timestamp', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-'));
  const declared = join(dir, 'plan.graph.json');
  const discovered = join(dir, 'edges.json');
  writeFileSync(declared, JSON.stringify({
    tasks: [
      { id: 't1', title: 'a', fullText: 'A', fileScope: ['lib/shared.js'], dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: ['lib/shared.js'], dependsOn: [], risk: 'low', validation: 'scoped' },
    ],
  }));
  writeFileSync(discovered, JSON.stringify([]));
  runCli([declared, discovered], dir);
  const out = JSON.parse(readFileSync(join(dir, 'plan.hardened.graph.json'), 'utf8'));
  assert.deepEqual(out.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
  const audit = JSON.parse(readFileSync(join(dir, 'plan.edges-audit.json'), 'utf8'));
  assert.equal(audit.addedEdgeCount, 1);
  assert.match(audit.at, /^\d{4}-\d{2}-\d{2}T/);
});

test('CLI exits non-zero and prints derive-edges error on a cycle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-cycle-'));
  const declared = join(dir, 'plan.graph.json');
  const discovered = join(dir, 'edges.json');
  writeFileSync(declared, JSON.stringify({
    tasks: [
      { id: 't1', title: 'a', fullText: 'A', fileScope: ['lib/a.js'], dependsOn: ['t2'], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: ['lib/b.js'], dependsOn: [], risk: 'low', validation: 'scoped' },
    ],
  }));
  writeFileSync(discovered, JSON.stringify([{ from: 't2', to: 't1', reason: 'lsp-call' }]));
  let failed = false;
  try {
    execFileSync('node', [CLI, declared, discovered], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.match(String(err.stderr), /derive-edges error: dependency cycle detected among:/);
  }
  assert.ok(failed, 'CLI should exit non-zero on a cycle');
  assert.equal(existsSync(join(dir, 'plan.hardened.graph.json')), false);
});
```

- [ ] **Step 2: Run the CLI tests to verify they fail**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/derive-edges.test.mjs"
```
Expected: the two new CLI tests FAIL (the script has no CLI entrypoint yet, so it produces no output files and does not exit non-zero on cycle). The Task-1 unit tests still pass.

- [ ] **Step 3: Add the CLI entrypoint to `derive-edges.mjs`**

Append this exact block to the end of `~/.claude/lib/superpowers-parallel/derive-edges.mjs`:

```js
import { readFileSync as _read, writeFileSync as _write } from 'node:fs';
import { fileURLToPath as _toPath } from 'node:url';

function cli(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = argv[++i];
    else if (argv[i] === '--audit') opts.audit = argv[++i];
    else positional.push(argv[i]);
  }
  const [declaredPath, discoveredPath] = positional;
  if (!declaredPath) throw new Error('usage: derive-edges <declared.graph.json> [discovered-edges.json] [--out p] [--audit p]');
  const graph = JSON.parse(_read(declaredPath, 'utf8'));
  const discovered = discoveredPath ? JSON.parse(_read(discoveredPath, 'utf8')) : [];
  const result = deriveEdges(graph, discovered);
  const outPath = opts.out || declaredPath.replace(/\.graph\.json$/, '.hardened.graph.json');
  const auditPath = opts.audit || declaredPath.replace(/\.graph\.json$/, '.edges-audit.json');
  _write(outPath, JSON.stringify(result.graph, null, 2) + '\n');
  _write(auditPath, JSON.stringify({ ...result.audit, at: new Date().toISOString() }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ outPath, auditPath, addedEdgeCount: result.audit.addedEdgeCount }) + '\n');
}

if (process.argv[1] && process.argv[1] === _toPath(import.meta.url)) {
  try {
    cli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`derive-edges error: ${err.message}\n`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run the full test file to verify all tests pass**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/derive-edges.test.mjs"
```
Expected: PASS — all 12 tests pass (`# pass 12`, `# fail 0`).

- [ ] **Step 5: Run the whole lib suite to confirm no regression**

Run:
```bash
cd ~/.claude/lib/superpowers-parallel && node --test "tests/**/*.test.mjs"
```
Expected: PASS — `derive-edges`, `route-planner`, `generate-run-script`, and `scope-covers` suites all pass; `# fail 0`.

No commit step — `~/.claude` is non-git.

---

### Task 3: Create the `plan-to-task-graph` skill (the rename + redesign)

**Files:**
- Create: `~/.claude/skills/plan-to-task-graph/SKILL.md`

**Interfaces:**
- Consumes: `derive-edges.mjs` (Tasks 1–2); `wave-planner.mjs`; the v2 graph contract (Global Constraints).
- Produces: the internal skill Mitosis (Plan 3) calls per MSP. Input: an approved plan markdown (read in session context). Output: `<plan>.graph.json` (the hardened graph, v2 contract) + `<plan>.edges-audit.json`. NOT a user-facing entry point.

**Context the implementer MUST read first:** the current `~/.claude/skills/parallel-plan-annotation/SKILL.md` (the source this rewrites). Read it fully so every still-valid v2 rule is carried forward verbatim. The redesign separates what the AI decides (INTENT) from what ground truth derives (STRUCTURE), and removes the old hand-off-to-executor line because `plan-to-task-graph` returns its graph to the Mitosis caller, not to a user-invoked executor.

- [ ] **Step 1: Verify the new skill does not exist yet (the "red" baseline)**

Run:
```bash
test -f ~/.claude/skills/plan-to-task-graph/SKILL.md && echo PRESENT || echo MISSING
```
Expected: `MISSING`.

- [ ] **Step 2: Read the current annotation skill to preserve its still-valid rules**

Run:
```bash
cat -n ~/.claude/skills/parallel-plan-annotation/SKILL.md
```
Expected: the full current skill prints. Note its v2 contract rules (verbatim `fullText`, exhaustive `fileScope`, contract-pair serialization, boundary-only shared-fixture tests, non-code-task exclusion, `risk` review-scaling, `agentType` routing) — every one is carried into the new skill below.

- [ ] **Step 3: Create `~/.claude/skills/plan-to-task-graph/SKILL.md`**

Write this exact content (the PreToolUse hook will prompt "ask"; approve it):

```markdown
---
name: plan-to-task-graph
description: Internal callable of the mitosis skill. Converts ONE approved implementation plan into a hardened, parallel-safe task graph (.graph.json) by separating the decomposer's declared intent from machine-derived dependency ground truth. NOT a user-facing entry point — the mitosis flow invokes it per MSP. Do not invoke directly for ad-hoc work.
---

# plan-to-task-graph

Convert an approved plan into a hardened `<plan>.graph.json` the wave planner and run-script generator consume unchanged. Two layers, separated by who owns them.

## Layer 1 — INTENT (the decomposer's judgment, authored by the Mitosis AI)

For each plan task emit one task object with the v2 contract fields:

- `id` — stable, derived from the plan task number/name.
- `title` — the task title.
- `fullText` — the ENTIRE task body verbatim (steps + code). Never summarize.
- `fileScope` — every file the task creates or modifies. Exhaustive; prefer exact paths over globs.
- `dependsOn` — the ids this task declares it needs. An edge `{from,to}` means `from` depends on `to`.
- `risk` — `high` for contract pairs, auth, migrations, concurrency, or public API shape; else `low`. Drives review scaling.
- `agentType` — omit or `implementer` for features/fixes/refactors; `test-engineer` for test-only tasks; `mechanical-editor` for rote single-file no-judgment edits.
- `validation` — `scoped` for code tasks; `none` for graph-included tasks with nothing runnable.

Contract pairs (an emitter and its consumer) MUST be edged emitter-before-consumer and MUST NOT land in the same wave. Shared-fixture / registry tests are boundary-only — never a per-task scoped check. Non-code tasks (pure docs, config without behavior) are excluded from the graph entirely.

This layer is authored by the AI from full plan context. There is no human review gate (D2): plan-to-task-graph is an internal callable of the mitosis flow.

## Layer 2 — STRUCTURE (machine-owned, deterministic ground truth)

The decomposer is fallible: AI judgment over a large plan can drop a real dependency edge. The structure layer is a MONOTONIC, add-only safety net that can only make the graph SAFER (more serialized), never less.

1. Semantic discovery (you run this): for each task's `fileScope` symbols, query the native LSP call hierarchy (the dependency ORACLE per rules/common/tool-routing.md) for caller/callee edges that cross task boundaries; query the Graphify map for file / import / inheritance edges. Corroborate the seams the oracle cannot see (dynamic dispatch, DI, FFI, SQL, codegen) with targeted reads. Emit each cross-task edge as `{ "from": "<dependent task id>", "to": "<prerequisite task id>", "reason": "lsp-call" | "graphify-import" | "contract-pair" }` into a discovered-edges JSON array.
2. Hardening (deterministic, automated, no human): run
   `node ~/.claude/lib/superpowers-parallel/derive-edges.mjs <plan>.graph.json <plan>.discovered-edges.json --out <plan>.graph.json --audit <plan>.edges-audit.json`
   `derive-edges` unions the declared edges with the discovered edges AND with pure fileScope-overlap edges it computes itself. It ADDS any edge you missed (logged to the audit file) and NEVER removes a declared edge.
3. The ONLY halt is a contradiction the monotonic add cannot resolve — a newly-implied dependency cycle, meaning the decomposition itself is wrong. `derive-edges` throws `dependency cycle detected among: ...` and exits non-zero, mirroring the wave planner. Fix the plan's task boundaries and re-run. No human approves the lint; the run proceeds automatically on the safer graph whenever no cycle exists.

## Output and preview

Write the hardened graph to `<plan>.graph.json` (in place, v2 contract) and the audit to `<plan>.edges-audit.json`. Preview the wave layout with:
`node ~/.claude/lib/superpowers-parallel/wave-planner.mjs <plan>.graph.json`
A clean run proves the graph is acyclic and that no two fileScope-overlapping tasks share a wave. Return the hardened graph path and the audit to the calling mitosis flow.
```

- [ ] **Step 4: Verify the skill exists and carries the two-layer / monotonic / cycle-halt anchors**

Run:
```bash
grep -n "Layer 1 — INTENT" ~/.claude/skills/plan-to-task-graph/SKILL.md && \
grep -n "Layer 2 — STRUCTURE" ~/.claude/skills/plan-to-task-graph/SKILL.md && \
grep -n "MONOTONIC, add-only" ~/.claude/skills/plan-to-task-graph/SKILL.md && \
grep -n "dependency cycle detected among" ~/.claude/skills/plan-to-task-graph/SKILL.md && \
grep -n "derive-edges.mjs" ~/.claude/skills/plan-to-task-graph/SKILL.md
```
Expected: all five lines print.

- [ ] **Step 5: Verify the v2 contract fields are all preserved**

Run:
```bash
for f in fullText fileScope dependsOn risk agentType validation; do \
  grep -q "\`$f\`" ~/.claude/skills/plan-to-task-graph/SKILL.md && echo "KEPT: $f" || echo "MISSING: $f"; \
done
```
Expected: all six print `KEPT`.

- [ ] **Step 6: Verify style invariants (no emoji)**

Run:
```bash
rg -n "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" ~/.claude/skills/plan-to-task-graph/SKILL.md ; echo "emoji-exit=$?"
```
Expected: `emoji-exit=1` (no matches).

No commit step — `~/.claude` is non-git.

---

### Task 4: Complete the rename — delete `parallel-plan-annotation`, repoint its one live consumer

**Files:**
- Delete: `~/.claude/skills/parallel-plan-annotation/` (the whole directory)
- Modify: `~/.claude/skills/parallel-subagent-development/SKILL.md:14` (transitional repoint; this skill is itself deleted in Plan 5)

**Interfaces:**
- Consumes: the `plan-to-task-graph` skill from Task 3.
- Produces: a clean rename — the old skill is gone and no live, user-owned pointer dangles. (`parallel-subagent-development` still exists until Plan 5; its line 14 is repointed so the intermediate state stays consistent.)

**Context:** a grep confirmed the ONLY live, user-owned forward pointer to `parallel-plan-annotation` (outside generated `graphify-out/`, runtime `tasks/`/`telemetry/`, and historical notes/docs/ledger) is `~/.claude/skills/parallel-subagent-development/SKILL.md:14`, which auto-invokes annotation when `<plan>.graph.json` is missing.

- [ ] **Step 1: Re-confirm the live-consumer set before deleting**

Run:
```bash
grep -rn "parallel-plan-annotation" ~/.claude/skills ~/.claude/hooks ~/.claude/rules ~/.claude/workflows ~/.claude/lib ~/.claude/CLAUDE.md 2>/dev/null | grep -v "plugins/cache"
```
Expected: exactly two lines — `skills/parallel-plan-annotation/SKILL.md:2` (the file being deleted, its own `name:`) and `skills/parallel-subagent-development/SKILL.md:14`. If any OTHER user-owned file appears, repoint it to `plan-to-task-graph` before proceeding.

- [ ] **Step 2: Repoint the one live consumer**

In `~/.claude/skills/parallel-subagent-development/SKILL.md`, line 14 currently reads:
```markdown
- An approved plan. If `<plan>.graph.json` is missing, invoke `parallel-plan-annotation` FIRST (automatically — do not ask), then continue here.
```
Replace `parallel-plan-annotation` with `plan-to-task-graph` so it reads:
```markdown
- An approved plan. If `<plan>.graph.json` is missing, invoke `plan-to-task-graph` FIRST (automatically — do not ask), then continue here.
```

- [ ] **Step 3: Delete the old annotation skill directory**

Run (destructive — the directory's only content is the superseded SKILL.md; the redesign now lives in `plan-to-task-graph`):
```bash
rm -rf ~/.claude/skills/parallel-plan-annotation
```

- [ ] **Step 4: Verify the rename is complete**

Run:
```bash
test -d ~/.claude/skills/parallel-plan-annotation && echo "STILL PRESENT (bad)" || echo "REMOVED"; \
test -f ~/.claude/skills/plan-to-task-graph/SKILL.md && echo "NEW SKILL PRESENT"; \
grep -rn "parallel-plan-annotation" ~/.claude/skills ~/.claude/hooks ~/.claude/rules ~/.claude/workflows ~/.claude/lib 2>/dev/null | grep -v "plugins/cache" ; echo "live-refs-exit=$?"
```
Expected: `REMOVED`, `NEW SKILL PRESENT`, and `live-refs-exit=1` (no remaining live references in those user-owned dirs). The generated `graphify-out/` cache still mentions the old name — it self-heals on the next graph refresh and is not edited by hand.

No commit step — `~/.claude` is non-git.

---

## Self-Review

**1. Spec coverage (this plan's slice — spec §5.2 rename + redesign):**
- Pure `derive-edges.mjs` enforcing the monotonic add-only union + audit log + cycle-halt mirroring wave-planner — Tasks 1–2. COVERED (mechanism A, decisions/2026-06-29-plan-to-task-graph-mechanism.md).
- INTENT/STRUCTURE ownership split, semantic discovery via D1 oracle + Graphify, automated lint with no human gate (D2) — Task 3 skill prose. COVERED.
- v2 contract preserved verbatim (fullText, fileScope, contract-pair serialization, boundary-only fixtures, non-code exclusion, risk scaling, agentType routing) — Global Constraints + Task 3 Steps 3/5. COVERED.
- Rename completed; old skill removed; sole live pointer repointed — Task 4. COVERED.
- Out of this plan's slice (later plans): Mitosis skill consuming this callable (§5.1, Plan 3); receipts/D6 + branch contract (§6/§7, Plan 4); deletion of parallel-subagent-development + spec-decomposition redirect (§5.3/§5.4, Plan 5). Tracked in the roadmap, not gaps.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step shows the full module or the full test block; every prose step shows the full file body. PASS.

**3. Type consistency:** The edge shape `{ from, to, reason }` (from depends on to) is identical across `deriveEdges`, the CLI, the tests, and the skill prose. The cycle error string `dependency cycle detected among: ` matches `wave-planner.mjs:48` verbatim, asserted in Task 1 Step 1 and Task 2 Step 1. The v2 field names match Agent-mapped reality. The CLI default output names (`.hardened.graph.json`, `.edges-audit.json`) in Task 2 match the skill's `--out <plan>.graph.json` in-place override in Task 3 (the skill writes in place; the CLI defaults differ and are overridden explicitly — consistent, intentional). PASS.

**Note on adapted template:** runtime modules (Tasks 1–2) use real `node:test` RED→GREEN TDD; prose tasks (3–4) use structural pre-state verification and have no commit steps, per the non-git Global Constraints.
