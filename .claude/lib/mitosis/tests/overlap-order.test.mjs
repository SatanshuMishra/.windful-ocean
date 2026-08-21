import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveOverlapEdges, overlapPredecessorsOf, withOverlapDependsOn } from '../overlap-order.mjs';
import { pack } from './file-scope-fixtures.mjs';

function msp(id, fileScope, dependsOn = []) {
  return { id, dependsOn, fileScope };
}

test('two units declared with overlapping fileScope.edit and no dependsOn produce one edge from the later declared unit to the earlier one', () => {
  const edges = deriveOverlapEdges([
    msp('alpha', pack(['src/strings.mjs'])),
    msp('beta', pack(['src/strings.mjs'])),
  ]);

  assert.deepEqual(edges, [
    { from: 'beta', to: 'alpha', reason: 'fileScope-overlap', detail: 'src/strings.mjs' },
  ]);
});

test('two units with disjoint fileScope.edit and no dependsOn produce no overlap edge', () => {
  const edges = deriveOverlapEdges([
    msp('alpha', pack(['src/a.mjs'])),
    msp('beta', pack(['src/b.mjs'])),
  ]);

  assert.deepEqual(edges, []);
});

test('a msp with no fileScope at all is read as overlapping every other unit rather than none', () => {
  const edges = deriveOverlapEdges([
    msp('alpha', undefined),
    msp('beta', pack(['src/b.mjs'])),
  ]);

  assert.deepEqual(edges.map((edge) => [edge.from, edge.to, edge.reason]), [['beta', 'alpha', 'fileScope-overlap']]);
  assert.match(edges[0].detail, /declares no fileScope/);
});

test('a scalar fileScope is read as overlapping every other unit rather than none', () => {
  const edges = deriveOverlapEdges([
    msp('alpha', 'src/a.mjs'),
    msp('beta', pack(['src/b.mjs'])),
  ]);

  assert.deepEqual(edges.map((edge) => [edge.from, edge.to, edge.reason]), [['beta', 'alpha', 'fileScope-overlap']]);
});

test('a fileScope missing the required read/truncated keys is unparseable and is read as overlapping every other unit rather than none', () => {
  const edges = deriveOverlapEdges([
    msp('alpha', { edit: ['src/a.mjs'] }),
    msp('beta', pack(['src/b.mjs'])),
  ]);

  assert.deepEqual(edges.map((edge) => [edge.from, edge.to, edge.reason]), [['beta', 'alpha', 'fileScope-overlap']]);
  assert.match(edges[0].detail, /could not be read as a context pack/);
});

test('a fileScope.edit entry naming a glob is read as overlapping every other unit rather than compared prefix-by-prefix', () => {
  const edges = deriveOverlapEdges([
    msp('alpha', pack(['src/auth/**'])),
    msp('beta', pack(['src/unrelated.mjs'])),
  ]);

  assert.deepEqual(edges.map((edge) => [edge.from, edge.to, edge.reason]), [['beta', 'alpha', 'fileScope-overlap']]);
  assert.match(edges[0].detail, /names the glob/);
});

test('two units that both declare a fully empty fileScope.edit produce no overlap edge, because an explicit empty edit set is not the same as a missing one', () => {
  const edges = deriveOverlapEdges([
    msp('alpha', pack([])),
    msp('beta', pack([])),
  ]);

  assert.deepEqual(edges, []);
});

test('withOverlapDependsOn merges the overlap precursor into the later unit dependsOn without touching the earlier one, and returns new objects', () => {
  const msps = [
    msp('alpha', pack(['src/strings.mjs'])),
    msp('beta', pack(['src/strings.mjs'])),
  ];

  const merged = withOverlapDependsOn(msps);

  assert.notEqual(merged, msps);
  assert.notEqual(merged[0], msps[0]);
  assert.deepEqual(merged.find((m) => m.id === 'alpha').dependsOn, []);
  assert.deepEqual(merged.find((m) => m.id === 'beta').dependsOn, ['alpha']);
  assert.deepEqual(msps.find((m) => m.id === 'beta').dependsOn, [], 'the input msp was mutated');
});

test('withOverlapDependsOn does not duplicate an overlap precursor that is already declared', () => {
  const merged = withOverlapDependsOn([
    msp('alpha', pack(['src/strings.mjs'])),
    msp('beta', pack(['src/strings.mjs']), ['alpha']),
  ]);

  assert.deepEqual(merged.find((m) => m.id === 'beta').dependsOn, ['alpha']);
});

test('overlapPredecessorsOf reports one predecessor set per unit, empty when no overlap edge names that unit as the later side', () => {
  const predecessors = overlapPredecessorsOf([
    msp('alpha', pack(['src/strings.mjs'])),
    msp('beta', pack(['src/strings.mjs'])),
    msp('gamma', pack(['src/unrelated.mjs'])),
  ]);

  assert.deepEqual([...predecessors.get('alpha')], []);
  assert.deepEqual([...predecessors.get('beta')], ['alpha']);
  assert.deepEqual([...predecessors.get('gamma')], []);
});

test('a duplicate msp id refuses rather than guessing a declaration order', () => {
  assert.throws(
    () => deriveOverlapEdges([
      msp('alpha', pack(['src/a.mjs'])),
      msp('alpha', pack(['src/b.mjs'])),
    ]),
    /declared twice/,
  );
});

test('an msps argument that is not an array is refused naming the exact shape that arrived, so a null, a missing value and an object are told apart', () => {
  assert.throws(
    () => deriveOverlapEdges(null),
    { name: 'TypeError', message: 'overlap-order: msps must be an array, received null' },
  );
  assert.throws(
    () => deriveOverlapEdges(undefined),
    { name: 'TypeError', message: 'overlap-order: msps must be an array, received undefined' },
  );
  assert.throws(
    () => deriveOverlapEdges({ msps: [] }),
    { name: 'TypeError', message: 'overlap-order: msps must be an array, received object' },
  );
});

test('the same refusal names the arrived shape through every exported entry point, not only the edge derivation', () => {
  assert.throws(
    () => overlapPredecessorsOf(undefined),
    { name: 'TypeError', message: 'overlap-order: msps must be an array, received undefined' },
  );
  assert.throws(
    () => withOverlapDependsOn({ msps: [] }),
    { name: 'TypeError', message: 'overlap-order: msps must be an array, received object' },
  );
  assert.throws(
    () => withOverlapDependsOn(null),
    { name: 'TypeError', message: 'overlap-order: msps must be an array, received null' },
  );
});
