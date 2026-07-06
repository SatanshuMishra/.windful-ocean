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
