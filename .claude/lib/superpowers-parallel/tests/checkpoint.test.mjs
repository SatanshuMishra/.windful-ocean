import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkpointRef, parseCheckpointRef, parentCheckpointRefs, CHECKPOINT_REF_PREFIX } from '../checkpoint.mjs';

test('CHECKPOINT_REF_PREFIX is the dedicated non-head/tag namespace', () => {
  assert.equal(CHECKPOINT_REF_PREFIX, 'refs/mitosis');
});

test('checkpointRef composes a namespaced ref from a validated runId and unitId', () => {
  assert.equal(checkpointRef('a1b2c3d4', 'auth-core'), 'refs/mitosis/a1b2c3d4/auth-core');
  assert.equal(checkpointRef('00000000', 'm0'), 'refs/mitosis/00000000/m0');
});

test('checkpointRef throws on a runId that is not 8 lowercase hex', () => {
  assert.throws(() => checkpointRef('A1B2C3D4', 'auth-core'), /runId/);
  assert.throws(() => checkpointRef('a1b2c3d', 'auth-core'), /runId/);
  assert.throws(() => checkpointRef('a1b2c3d4e', 'auth-core'), /runId/);
  assert.throws(() => checkpointRef('zzzzzzzz', 'auth-core'), /runId/);
  assert.throws(() => checkpointRef('', 'auth-core'), /runId/);
});

test('checkpointRef throws on a unitId with traversal, slash, uppercase or unsafe chars', () => {
  assert.throws(() => checkpointRef('a1b2c3d4', '..'), /unitId/);
  assert.throws(() => checkpointRef('a1b2c3d4', 'a/b'), /unitId/);
  assert.throws(() => checkpointRef('a1b2c3d4', '/auth'), /unitId/);
  assert.throws(() => checkpointRef('a1b2c3d4', 'Auth'), /unitId/);
  assert.throws(() => checkpointRef('a1b2c3d4', '-auth'), /unitId/);
  assert.throws(() => checkpointRef('a1b2c3d4', 'a b'), /unitId/);
  assert.throws(() => checkpointRef('a1b2c3d4', ''), /unitId/);
});

test('parseCheckpointRef inverts checkpointRef for a matching runId', () => {
  assert.equal(parseCheckpointRef('refs/mitosis/a1b2c3d4/auth-core', 'a1b2c3d4'), 'auth-core');
});

test('parseCheckpointRef returns null for a foreign runId, a heads ref or a malformed ref', () => {
  assert.equal(parseCheckpointRef('refs/mitosis/deadbeef/auth-core', 'a1b2c3d4'), null);
  assert.equal(parseCheckpointRef('refs/heads/a1b2c3d4/auth-core', 'a1b2c3d4'), null);
  assert.equal(parseCheckpointRef('refs/mitosis/a1b2c3d4/auth/core', 'a1b2c3d4'), null);
  assert.equal(parseCheckpointRef('refs/mitosis/a1b2c3d4/', 'a1b2c3d4'), null);
  assert.equal(parseCheckpointRef('refs/mitosis/a1b2c3d4/..', 'a1b2c3d4'), null);
  assert.equal(parseCheckpointRef('', 'a1b2c3d4'), null);
  assert.equal(parseCheckpointRef(null, 'a1b2c3d4'), null);
  assert.equal(parseCheckpointRef('refs/mitosis/a1b2c3d4/auth-core', 'ZZZ'), null);
});

test('round-trip: parseCheckpointRef(checkpointRef(r,u), r) === u', () => {
  for (const [r, u] of [['a1b2c3d4', 'auth-core'], ['00ff00ff', 'm12'], ['deadbeef', 'x']]) {
    assert.equal(parseCheckpointRef(checkpointRef(r, u), r), u);
  }
});

test('parentCheckpointRefs composes ordered {unitId, ref} pairs for a run and its parents', () => {
  assert.deepEqual(parentCheckpointRefs('a1b2c3d4', ['auth-core', 'db-layer']), [
    { unitId: 'auth-core', ref: 'refs/mitosis/a1b2c3d4/auth-core' },
    { unitId: 'db-layer', ref: 'refs/mitosis/a1b2c3d4/db-layer' },
  ]);
});

test('parentCheckpointRefs preserves dependency order and returns [] for no parents', () => {
  assert.deepEqual(parentCheckpointRefs('00000000', []), []);
  assert.deepEqual(parentCheckpointRefs('00000000', null), []);
  assert.deepEqual(parentCheckpointRefs('00000000', undefined), []);
  assert.deepEqual(
    parentCheckpointRefs('deadbeef', ['m2', 'm0', 'm1']).map((p) => p.unitId),
    ['m2', 'm0', 'm1'],
  );
});

test('parentCheckpointRefs fails closed: throws on an unsafe parent id or runId (never emits an unsafe ref)', () => {
  assert.throws(() => parentCheckpointRefs('a1b2c3d4', ['ok', '../evil']), /unitId/);
  assert.throws(() => parentCheckpointRefs('a1b2c3d4', ['a/b']), /unitId/);
  assert.throws(() => parentCheckpointRefs('BADRUNID', ['ok']), /runId/);
});
