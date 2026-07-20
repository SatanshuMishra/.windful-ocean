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

test('throws when tasksMap is a non-object primitive', () => {
  assert.throws(() => aggregateMspFileScope('not-an-object'), /non-null, non-array object/);
  assert.throws(() => aggregateMspFileScope(42), /non-null, non-array object/);
});
