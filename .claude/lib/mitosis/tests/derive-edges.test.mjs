import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEdges } from '../derive-edges.mjs';

function graphOf(...tasks) {
  return { tasks: tasks.map((t) => ({ dependsOn: [], fileScope: pack([]), ...t })) };
}

function deriveOutcome(graph) {
  try {
    return { refused: false, added: deriveEdges(graph, []).added };
  } catch (err) {
    return { refused: true, message: err.message };
  }
}

test('clean graph: all dependencies declared, nothing added', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't2', fileScope: pack(['lib/b.js']), dependsOn: ['t1'] },
  );
  const { graph, added, audit } = deriveEdges(g, []);
  assert.equal(added.length, 0);
  assert.equal(audit.addedEdgeCount, 0);
  assert.deepEqual(graph.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
});

test('fileScope overlap with no declared edge is auto-added later->earlier', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/shared.js']) },
    { id: 't2', fileScope: pack(['lib/shared.js']) },
  );
  const { graph, added, audit } = deriveEdges(g, []);
  assert.equal(added.length, 1);
  assert.deepEqual(added[0], { from: 't2', to: 't1', reason: 'fileScope-overlap' });
  assert.deepEqual(graph.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
  assert.equal(audit.addedEdgeCount, 1);
});

test('fileScope overlap already serialized either direction adds no edge', () => {
  const forward = graphOf(
    { id: 't1', fileScope: pack(['lib/shared.js']) },
    { id: 't2', fileScope: pack(['lib/shared.js']), dependsOn: ['t1'] },
  );
  assert.equal(deriveEdges(forward, []).added.length, 0);
  const reverse = graphOf(
    { id: 't1', fileScope: pack(['lib/shared.js']), dependsOn: ['t2'] },
    { id: 't2', fileScope: pack(['lib/shared.js']) },
  );
  assert.equal(deriveEdges(reverse, []).added.length, 0);
});

test('a scalar fileScope is refused instead of silently skipping the serializing overlap edge', () => {
  const outcome = deriveOutcome(graphOf(
    { id: 't1', fileScope: 'lib/shared.js' },
    { id: 't2', fileScope: pack(['lib/shared.js']) },
  ));
  assert.equal(outcome.refused, true, `expected a refusal; instead the two overlapping tasks were hardened with added edges ${JSON.stringify(outcome.added)}`);
  assert.match(outcome.message, /fileScope must be a context pack object/);
});

test('a non-string fileScope entry is refused instead of being narrowed away into a scope that serializes nothing', () => {
  const outcome = deriveOutcome(graphOf(
    { id: 't1', fileScope: pack([123]) },
    { id: 't2', fileScope: pack(['lib/shared.js']) },
  ));
  assert.equal(outcome.refused, true, `expected a refusal; instead the graph was hardened with added edges ${JSON.stringify(outcome.added)}`);
  assert.match(outcome.message, /fileScope.edit entries must be non-empty strings/);
});

test('an empty-string fileScope entry is refused instead of standing as an entry that overlaps nothing', () => {
  const outcome = deriveOutcome(graphOf(
    { id: 't1', fileScope: pack(['']) },
    { id: 't2', fileScope: pack(['lib/shared.js']) },
  ));
  assert.equal(outcome.refused, true, `expected a refusal; instead the graph was hardened with added edges ${JSON.stringify(outcome.added)}`);
  assert.match(outcome.message, /fileScope.edit entries must be non-empty strings/);
});

test('discovered semantic edge not declared is auto-added with its reason', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't2', fileScope: pack(['lib/b.js']) },
  );
  const { graph, added } = deriveEdges(g, [{ from: 't2', to: 't1', reason: 'lsp-call' }]);
  assert.deepEqual(added, [{ from: 't2', to: 't1', reason: 'lsp-call' }]);
  assert.deepEqual(graph.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
});

test('monotonic: a declared edge is never removed', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't2', fileScope: pack(['lib/b.js']), dependsOn: ['t1'] },
  );
  const { graph } = deriveEdges(g, []);
  assert.ok(graph.tasks.find((t) => t.id === 't2').dependsOn.includes('t1'));
});

test('discovered edge contradicting a declared edge halts with the wave-planner cycle string', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']), dependsOn: ['t2'] },
    { id: 't2', fileScope: pack(['lib/b.js']) },
  );
  assert.throws(
    () => deriveEdges(g, [{ from: 't2', to: 't1', reason: 'lsp-call' }]),
    /dependency cycle detected among: /,
  );
});

test('discovered edge to an unknown task throws', () => {
  const g = graphOf({ id: 't1', fileScope: pack(['lib/a.js']) });
  assert.throws(
    () => deriveEdges(g, [{ from: 't1', to: 'tX', reason: 'lsp-call' }]),
    /unknown task/,
  );
});

test('declared dependency on an unknown task throws (mirrors wave-planner)', () => {
  const g = graphOf({ id: 't1', fileScope: pack(['lib/a.js']), dependsOn: ['tZ'] });
  assert.throws(() => deriveEdges(g, []), /unknown task/);
});

test('duplicate task id throws', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't1', fileScope: pack(['lib/b.js']) },
  );
  assert.throws(() => deriveEdges(g, []), /duplicate task id/);
});

test('hardened dependsOn is sorted and deduplicated', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't2', fileScope: pack(['lib/a.js']) },
    { id: 't3', fileScope: pack(['lib/a.js']), dependsOn: ['t2', 't1', 't2'] },
  );
  const { graph } = deriveEdges(g, []);
  assert.deepEqual(graph.tasks.find((t) => t.id === 't3').dependsOn, ['t1', 't2']);
});

test('exposes reverse-transitive-dependent counts on each hardened task', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't2', fileScope: pack(['lib/b.js']), dependsOn: ['t1'] },
    { id: 't3', fileScope: pack(['lib/c.js']), dependsOn: ['t2'] },
    { id: 't4', fileScope: pack(['lib/d.js']), dependsOn: ['t2'] },
  );
  const { graph } = deriveEdges(g, []);
  const byId = Object.fromEntries(graph.tasks.map((t) => [t.id, t]));
  assert.equal(byId.t1.dependentCount, 3);
  assert.equal(byId.t2.dependentCount, 2);
  assert.equal(byId.t3.dependentCount, 0);
  assert.equal(byId.t4.dependentCount, 0);
});

test('reverse-transitive-dependent count includes auto-added overlap edges', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/shared.js']) },
    { id: 't2', fileScope: pack(['lib/shared.js']) },
  );
  const { graph } = deriveEdges(g, []);
  const byId = Object.fromEntries(graph.tasks.map((t) => [t.id, t]));
  assert.equal(byId.t1.dependentCount, 1);
  assert.equal(byId.t2.dependentCount, 0);
});

test('exposes edgeReasons for tasks participating in derived edges', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't2', fileScope: pack(['lib/b.js']) },
  );
  const { graph } = deriveEdges(g, [{ from: 't2', to: 't1', reason: 'api-contract' }]);
  const byId = Object.fromEntries(graph.tasks.map((t) => [t.id, t]));
  assert.deepEqual(byId.t2.edgeReasons, ['api-contract']);
  assert.deepEqual(byId.t1.edgeReasons, ['api-contract']);
});

test('tasks with no derived edges expose an empty edgeReasons array', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't2', fileScope: pack(['lib/b.js']), dependsOn: ['t1'] },
  );
  const { graph } = deriveEdges(g, []);
  const byId = Object.fromEntries(graph.tasks.map((t) => [t.id, t]));
  assert.deepEqual(byId.t1.edgeReasons, []);
  assert.deepEqual(byId.t2.edgeReasons, []);
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack } from './file-scope-fixtures.mjs';

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
      { id: 't1', title: 'a', fullText: 'A', fileScope: pack(['lib/shared.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: pack(['lib/shared.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
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
      { id: 't1', title: 'a', fullText: 'A', fileScope: pack(['lib/a.js']), dependsOn: ['t2'], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: pack(['lib/b.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
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

test('T22: a discovered edge lands in dependentCount and in edgeReasons on both endpoints', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['lib/a.js']) },
    { id: 't2', fileScope: pack(['lib/b.js']), dependsOn: ['t1'] },
    { id: 't3', fileScope: pack(['lib/c.js']), dependsOn: ['t2'] },
    { id: 't4', fileScope: pack(['lib/d.js']) },
  );
  const { graph } = deriveEdges(g, [{ from: 't4', to: 't1', reason: 'api-contract' }]);
  const byId = Object.fromEntries(graph.tasks.map((t) => [t.id, t]));
  assert.equal(byId.t1.dependentCount, 3);
  assert.equal(byId.t2.dependentCount, 1);
  assert.equal(byId.t3.dependentCount, 0);
  assert.equal(byId.t4.dependentCount, 0);
  assert.deepEqual(byId.t1.edgeReasons, ['api-contract']);
  assert.deepEqual(byId.t4.edgeReasons, ['api-contract']);
  assert.deepEqual(byId.t2.edgeReasons, []);
  assert.deepEqual(byId.t3.edgeReasons, []);
});

test('T23: the CLI hardened graph carries dependentCount and edgeReasons on every task', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-contract-'));
  const declared = join(dir, 'plan.graph.json');
  writeFileSync(declared, JSON.stringify({
    tasks: [
      { id: 't1', title: 'a', fullText: 'A', fileScope: pack(['lib/a.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: pack(['lib/b.js']), dependsOn: ['t1'], risk: 'low', validation: 'scoped' },
    ],
  }));
  const stdout = runCli([declared], dir);
  assert.match(stdout, /"outPath"/);
  const out = JSON.parse(readFileSync(join(dir, 'plan.hardened.graph.json'), 'utf8'));
  for (const task of out.tasks) {
    assert.ok(
      Number.isInteger(task.dependentCount) && task.dependentCount >= 0,
      `task ${task.id} lost dependentCount; mitosis.js:4959 parks the unit when this field is not a non-negative integer`,
    );
    assert.ok(
      Array.isArray(task.edgeReasons),
      `task ${task.id} lost edgeReasons; mitosis.js:4962 parks the unit when this field is not an array`,
    );
    for (const reason of task.edgeReasons) assert.equal(typeof reason, 'string');
  }
  assert.equal(out.tasks.find((t) => t.id === 't1').dependentCount, 1);
  assert.deepEqual(out.tasks.find((t) => t.id === 't2').edgeReasons, []);
});

test('T19: a file-disjoint pair carrying a signal is emitted for coupling review', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['srv/auth/login.ts']) },
    { id: 't2', fileScope: pack(['web/auth/form.tsx']) },
  );
  const { graph, added, coupling } = deriveEdges(g, []);
  assert.equal(added.length, 0, 'a file-disjoint pair is still not serialized by an added edge');
  assert.deepEqual(coupling, [{ pair: ['t1', 't2'], signals: ['shared-risk-marker:auth'], default: 'serialize' }]);
  assert.deepEqual(graph.coupling, coupling);
});

test('T20: a pair whose fileScope overlaps is not emitted, because the added edge already serializes it', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['srv/auth/login.ts']) },
    { id: 't2', fileScope: pack(['srv/auth/login.ts']) },
  );
  const { added, coupling } = deriveEdges(g, []);
  assert.equal(added.length, 1);
  assert.deepEqual(coupling, []);
});

test('T21: a pair already ordered through an intermediate dependency is not emitted', () => {
  const g = graphOf(
    { id: 't1', fileScope: pack(['srv/auth/login.ts']) },
    { id: 't2', fileScope: pack(['lib/mid.ts']), dependsOn: ['t1'] },
    { id: 't3', fileScope: pack(['web/auth/form.tsx']), dependsOn: ['t2'] },
  );
  const { coupling } = deriveEdges(g, []);
  assert.deepEqual(coupling, [], 't1 and t3 are already ordered transitively through t2');
});

test('T19b: coupling context supplied on the graph reaches the detectors', () => {
  const g = {
    tasks: [
      { id: 't1', fileScope: pack(['lib/a.js']), dependsOn: [] },
      { id: 't2', fileScope: pack(['lib/b.js']), dependsOn: [] },
    ],
    couplingContext: { importAdjacency: { 'lib/a.js': ['lib/b.js'] } },
  };
  const { coupling } = deriveEdges(g, []);
  assert.deepEqual(coupling, [{ pair: ['t1', 't2'], signals: ['import-adjacent'], default: 'parallel' }]);
});

test('T19c: the CLI carries the coupling emission into the hardened graph without disturbing edgeReasons', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-coupling-'));
  const declared = join(dir, 'plan.graph.json');
  writeFileSync(declared, JSON.stringify({
    tasks: [
      { id: 't1', title: 'a', fullText: 'A', fileScope: pack(['srv/auth/login.ts']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: pack(['web/auth/form.tsx']), dependsOn: [], risk: 'low', validation: 'scoped' },
    ],
  }));
  const stdout = JSON.parse(runCli([declared], dir));
  assert.equal(stdout.couplingPairCount, 1);
  const out = JSON.parse(readFileSync(join(dir, 'plan.hardened.graph.json'), 'utf8'));
  assert.deepEqual(out.coupling, [{ pair: ['t1', 't2'], signals: ['shared-risk-marker:auth'], default: 'serialize' }]);
  const audit = JSON.parse(readFileSync(join(dir, 'plan.edges-audit.json'), 'utf8'));
  assert.deepEqual(audit.coupling, out.coupling);
  for (const task of out.tasks) {
    assert.ok(Number.isInteger(task.dependentCount), `task ${task.id} lost dependentCount; mitosis.js:4959 parks the unit`);
    assert.ok(Array.isArray(task.edgeReasons), `task ${task.id} lost edgeReasons; mitosis.js:4962 parks the unit`);
    assert.deepEqual(task.edgeReasons, [], 'coupling signals must never leak into edgeReasons, which mitosis.js:1130 regex-matches for opus escalation');
  }
});

function couplingGraphFile(dir) {
  const declared = join(dir, 'plan.graph.json');
  writeFileSync(declared, JSON.stringify({
    tasks: [
      { id: 't1', title: 'a', fullText: 'A', fileScope: pack(['srv/auth/login.ts']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: pack(['web/auth/form.tsx']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't3', title: 'c', fullText: 'C', fileScope: pack(['srv/crypto/seal.ts']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't4', title: 'd', fullText: 'D', fileScope: pack(['web/crypto/open.tsx']), dependsOn: [], risk: 'low', validation: 'scoped' },
    ],
  }));
  return declared;
}

test('T24d: the CLI refuses to harden a graph whose verdicts miss an emitted pair, and writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-verdict-gap-'));
  const declared = couplingGraphFile(dir);
  const verdicts = join(dir, 'verdicts.json');
  writeFileSync(verdicts, JSON.stringify([{ pair: ['t1', 't2'], decision: 'serialize', rationale: null }]));
  let failed = false;
  try {
    execFileSync('node', [CLI, declared, '--verdicts', verdicts], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.equal(err.status, 1, `expected the validation exit code 1, received ${err.status}`);
    assert.match(String(err.stderr), /derive-edges error: [\s\S]*t3\/t4 was emitted for review and no verdict answers it/);
  }
  assert.ok(failed, 'a hardened graph must not be produced from a plan that leaves an emitted pair unreviewed');
  assert.equal(existsSync(join(dir, 'plan.hardened.graph.json')), false);
  assert.equal(existsSync(join(dir, 'plan.edges-audit.json')), false);
});

test('T24e: the CLI refuses a serialize default overridden to parallel with no rationale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-verdict-override-'));
  const declared = couplingGraphFile(dir);
  const verdicts = join(dir, 'verdicts.json');
  writeFileSync(verdicts, JSON.stringify([
    { pair: ['t1', 't2'], decision: 'parallel', rationale: null },
    { pair: ['t3', 't4'], decision: 'serialize', rationale: null },
  ]));
  let failed = false;
  try {
    execFileSync('node', [CLI, declared, '--verdicts', verdicts], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.match(String(err.stderr), /t1\/t2 defaults to serialize and is overridden to parallel with no rationale/);
  }
  assert.ok(failed, 'the skeptical default must survive the derive-edges entrypoint, not only the coupling-review one');
});

test('T24f: the CLI hardens the graph when every emitted pair carries a verdict', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-verdict-ok-'));
  const declared = couplingGraphFile(dir);
  const verdicts = join(dir, 'verdicts.json');
  writeFileSync(verdicts, JSON.stringify([
    { pair: ['t1', 't2'], decision: 'serialize', rationale: null },
    { pair: ['t4', 't3'], decision: 'parallel', rationale: 'the two crypto files share no symbol and sit either side of the boundary' },
  ]));
  const stdout = JSON.parse(runCli([declared, '--verdicts', verdicts], dir));
  assert.equal(stdout.couplingPairCount, 2);
  const out = JSON.parse(readFileSync(join(dir, 'plan.hardened.graph.json'), 'utf8'));
  assert.deepEqual(out.coupling.map((c) => c.pair), [['t1', 't2'], ['t3', 't4']]);
});

test('T24g: the CLI refuses a repeated --verdicts flag rather than honouring only the last one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-verdict-twice-'));
  const declared = couplingGraphFile(dir);
  const first = join(dir, 'first.json');
  const second = join(dir, 'second.json');
  writeFileSync(first, JSON.stringify([]));
  writeFileSync(second, JSON.stringify([
    { pair: ['t1', 't2'], decision: 'serialize', rationale: null },
    { pair: ['t3', 't4'], decision: 'serialize', rationale: null },
  ]));
  let failed = false;
  try {
    execFileSync('node', [CLI, declared, '--verdicts', first, '--verdicts', second], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.match(String(err.stderr), /derive-edges error: --verdicts was supplied twice/);
  }
  assert.ok(failed, 'a second --verdicts must not silently discard the first path');
  assert.equal(existsSync(join(dir, 'plan.hardened.graph.json')), false);
});

test('T24h: a graph with no --verdicts hardens exactly as before, so an existing plan stays green', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-verdict-absent-'));
  const declared = couplingGraphFile(dir);
  const stdout = JSON.parse(runCli([declared], dir));
  assert.equal(stdout.couplingPairCount, 2);
  const out = JSON.parse(readFileSync(join(dir, 'plan.hardened.graph.json'), 'utf8'));
  assert.equal(out.tasks.length, 4);
});

function inPlaceRun(dir, tasks, discoveredEdges) {
  const declared = join(dir, 'plan.graph.json');
  const audit = join(dir, 'plan.edges-audit.json');
  writeFileSync(declared, JSON.stringify({ tasks }));
  const args = [declared, '--out', declared, '--audit', audit];
  if (discoveredEdges !== null) {
    const discovered = join(dir, 'plan.discovered-edges.json');
    writeFileSync(discovered, JSON.stringify(discoveredEdges));
    args.splice(1, 0, discovered);
  }
  runCli(args, dir);
  const first = JSON.parse(readFileSync(declared, 'utf8'));
  runCli(args, dir);
  return { first, second: JSON.parse(readFileSync(declared, 'utf8')) };
}

function reasonsOf(graph, id) {
  return graph.tasks.find((t) => t.id === id).edgeReasons;
}

test('T28: re-running the CLI over the graph it rewrote in place keeps the discovered edge reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-rerun-discovered-'));
  const { first, second } = inPlaceRun(
    dir,
    [
      { id: 't1', title: 'a', fullText: 'A', fileScope: pack(['lib/a.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: pack(['lib/b.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
    ],
    [{ from: 't2', to: 't1', reason: 'api-contract' }],
  );
  assert.deepEqual(reasonsOf(first, 't1'), ['api-contract']);
  assert.deepEqual(reasonsOf(first, 't2'), ['api-contract']);
  for (const id of ['t1', 't2']) {
    assert.deepEqual(
      reasonsOf(second, id),
      ['api-contract'],
      `the second in-place run erased ${id}.edgeReasons; mitosis.js:1130 regex-matches this list to force opus on a contract-breaking task, so an emptied list silently downgrades the task on every replan`,
    );
  }
  assert.deepEqual(second, first, 'derive-edges is run with --out equal to its input at mitosis.js:4906, so a re-run must be a fixed point');
});

test('T28b: re-running the CLI in place keeps the fileScope-overlap reason on the pair it serialized', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-rerun-overlap-'));
  const { first, second } = inPlaceRun(
    dir,
    [
      { id: 't1', title: 'a', fullText: 'A', fileScope: pack(['lib/shared.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: pack(['lib/shared.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
    ],
    null,
  );
  assert.deepEqual(reasonsOf(first, 't1'), ['fileScope-overlap']);
  assert.deepEqual(reasonsOf(first, 't2'), ['fileScope-overlap']);
  for (const id of ['t1', 't2']) {
    assert.deepEqual(
      reasonsOf(second, id),
      ['fileScope-overlap'],
      `the second in-place run erased ${id}.edgeReasons; the overlap edge it justifies is still present in dependsOn, so the reason must survive with it`,
    );
  }
  assert.deepEqual(second, first, 'derive-edges is run with --out equal to its input at mitosis.js:4906, so a re-run must be a fixed point');
});

test('T28c: a reason whose discovered edge is withdrawn does not survive the next run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'derive-cli-rerun-stale-'));
  const declared = join(dir, 'plan.graph.json');
  const discovered = join(dir, 'plan.discovered-edges.json');
  const audit = join(dir, 'plan.edges-audit.json');
  writeFileSync(declared, JSON.stringify({
    tasks: [
      { id: 't1', title: 'a', fullText: 'A', fileScope: pack(['lib/a.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
      { id: 't2', title: 'b', fullText: 'B', fileScope: pack(['lib/b.js']), dependsOn: [], risk: 'low', validation: 'scoped' },
    ],
  }));
  writeFileSync(discovered, JSON.stringify([{ from: 't2', to: 't1', reason: 'api-contract' }]));
  const args = [declared, discovered, '--out', declared, '--audit', audit];
  runCli(args, dir);
  assert.deepEqual(reasonsOf(JSON.parse(readFileSync(declared, 'utf8')), 't1'), ['api-contract']);
  writeFileSync(discovered, JSON.stringify([]));
  runCli(args, dir);
  const after = JSON.parse(readFileSync(declared, 'utf8'));
  for (const id of ['t1', 't2']) {
    assert.deepEqual(
      reasonsOf(after, id),
      [],
      `${id} kept a reason after the discovery pass withdrew it; reasons are a function of the asserted edges, so carrying one forward unconditionally would pin the task to opus forever`,
    );
  }
  assert.deepEqual(after.tasks.find((t) => t.id === 't2').dependsOn, ['t1'], 'the serializing edge itself stays, because dependsOn is monotonic');
});
