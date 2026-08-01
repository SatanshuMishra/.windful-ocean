import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkpointRef, parseCheckpointRef, parentCheckpointRefs, CHECKPOINT_REF_PREFIX, publishedManifestRef, publishedManifestRefPrefix, MANIFEST_REF_PREFIX } from '../checkpoint.mjs';

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

const SPEC_HASH = 'a'.repeat(64);
const OTHER_SPEC_HASH = 'b'.repeat(64);

test('publishedManifestRef is CONTENT-KEYED: the same logical run id under different spec content composes DIFFERENT refs', () => {
  assert.equal(MANIFEST_REF_PREFIX, 'refs/mitosis-manifest');
  assert.equal(publishedManifestRefPrefix('a1b2c3d4'), 'refs/mitosis-manifest/a1b2c3d4/');
  assert.equal(publishedManifestRef('a1b2c3d4', SPEC_HASH), `refs/mitosis-manifest/a1b2c3d4/${SPEC_HASH}`);
  assert.equal(publishedManifestRef('00000000', OTHER_SPEC_HASH), `refs/mitosis-manifest/00000000/${OTHER_SPEC_HASH}`);
  assert.notEqual(
    publishedManifestRef('a1b2c3d4', SPEC_HASH),
    publishedManifestRef('a1b2c3d4', OTHER_SPEC_HASH),
    'the run id hashes the spec PATH and never its content, so an in-place spec edit re-decomposes a DIFFERENT table under the same id — keying the ref on the run id alone would pin that run to the write-once STOP permanently',
  );
  assert.ok(publishedManifestRef('a1b2c3d4', SPEC_HASH).startsWith(publishedManifestRefPrefix('a1b2c3d4')), 'the engine composes the prefix before the hash is known and the agent appends the hash, so the full ref must extend the prefix exactly');
});

test('publishedManifestRef throws on a runId that is not 8 lowercase hex (never interpolates an unsafe token into a git command)', () => {
  assert.throws(() => publishedManifestRef('A1B2C3D4', SPEC_HASH), /runId/);
  assert.throws(() => publishedManifestRef('a1b2c3d', SPEC_HASH), /runId/);
  assert.throws(() => publishedManifestRef('a1b2c3d4e', SPEC_HASH), /runId/);
  assert.throws(() => publishedManifestRef('zzzzzzzz', SPEC_HASH), /runId/);
  assert.throws(() => publishedManifestRef('../evil', SPEC_HASH), /runId/);
  assert.throws(() => publishedManifestRef('', SPEC_HASH), /runId/);
  assert.throws(() => publishedManifestRef(null, SPEC_HASH), /runId/);
  assert.throws(() => publishedManifestRefPrefix('../evil'), /runId/);
  assert.throws(() => publishedManifestRefPrefix(null), /runId/);
});

test('publishedManifestRef THROWS on a malformed or absent specContentHash rather than fabricating a ref', () => {
  assert.throws(() => publishedManifestRef('a1b2c3d4'), /specContentHash/, 'an absent hash names no ref at all; silently composing the prefix would probe a ref no run ever publishes and read its emptiness as absence');
  assert.throws(() => publishedManifestRef('a1b2c3d4', null), /specContentHash/);
  assert.throws(() => publishedManifestRef('a1b2c3d4', ''), /specContentHash/);
  assert.throws(() => publishedManifestRef('a1b2c3d4', 'a'.repeat(63)), /specContentHash/);
  assert.throws(() => publishedManifestRef('a1b2c3d4', 'a'.repeat(65)), /specContentHash/);
  assert.throws(() => publishedManifestRef('a1b2c3d4', 'A'.repeat(64)), /specContentHash/);
  assert.throws(() => publishedManifestRef('a1b2c3d4', `../${'a'.repeat(61)}`), /specContentHash/);
  assert.throws(() => publishedManifestRef('a1b2c3d4', SPEC_HASH.slice(0, 63) + '/'), /specContentHash/);
});

test('the run-identity ref is DISJOINT from the checkpoint namespace: parseCheckpointRef can never invert it into a unit id', () => {
  for (const runId of ['a1b2c3d4', '00ff00ff', 'deadbeef']) {
    assert.equal(
      parseCheckpointRef(publishedManifestRef(runId, SPEC_HASH), runId),
      null,
      'the identity ref must not be readable as a built unit, or reconcileBuiltSet would admit a phantom unit named manifest and inflate the built-unit count that gates relaunch advance',
    );
  }
  assert.equal(publishedManifestRef('a1b2c3d4', SPEC_HASH).startsWith(`${CHECKPOINT_REF_PREFIX}/`), false, 'the identity ref is outside the refs/mitosis/* glob the reconcile stage lists');
});
