import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLogicalRunId,
  branchToMspId,
  reconcileShippedSet,
  parseRunManifest,
  buildInitialManifest,
  applyShipTransition,
} from '../recovery.mjs';

test('computeLogicalRunId: deterministic for identical inputs', () => {
  assert.equal(
    computeLogicalRunId('/specs/x.md', 'main'),
    computeLogicalRunId('/specs/x.md', 'main'),
  );
});

test('computeLogicalRunId: sensitive to spec and to baseBranch independently', () => {
  const base = computeLogicalRunId('/specs/x.md', 'main');
  assert.notEqual(base, computeLogicalRunId('/specs/y.md', 'main'));
  assert.notEqual(base, computeLogicalRunId('/specs/x.md', 'develop'));
});

test('computeLogicalRunId: separator prevents field-boundary collisions', () => {
  assert.notEqual(computeLogicalRunId('ab', 'c'), computeLogicalRunId('a', 'bc'));
});

test('computeLogicalRunId: fixed-width lowercase hex, no clock/rng dependence', () => {
  const id = computeLogicalRunId('/specs/x.md', 'main');
  assert.match(id, /^[0-9a-f]{8}$/);
});

test('computeLogicalRunId: golden FNV-1a vector pins the exact relaunch-detection key', () => {
  assert.equal(computeLogicalRunId('/specs/x.md', 'main'), 'e7f1df0b');
});

test('branchToMspId: extracts id from the exact integration pattern', () => {
  assert.equal(branchToMspId('mitosis/auth-core-integration', 'mitosis'), 'auth-core');
});

test('branchToMspId: rejects wrong prefix, wrong suffix, empty id, and foreign branches', () => {
  assert.equal(branchToMspId('other/auth-core-integration', 'mitosis'), null);
  assert.equal(branchToMspId('mitosis/auth-core', 'mitosis'), null);
  assert.equal(branchToMspId('mitosis/-integration', 'mitosis'), null);
  assert.equal(branchToMspId('main', 'mitosis'), null);
});

test('reconcileShippedSet: maps matching PRs by mspId, ignores foreign branches', () => {
  const m = reconcileShippedSet([
    { headRefName: 'mitosis/a-integration', url: 'http://pr/1', mergedAt: '2026-07-08T00:00:00Z' },
    { headRefName: 'feature/unrelated', url: 'http://pr/2', mergedAt: '2026-07-08T01:00:00Z' },
  ], 'mitosis');
  assert.deepEqual([...m.keys()], ['a']);
  assert.deepEqual(m.get('a'), { prUrl: 'http://pr/1', mergedAt: '2026-07-08T00:00:00Z' });
});

test('reconcileShippedSet: empty or nullish input yields an empty map', () => {
  assert.equal(reconcileShippedSet([], 'mitosis').size, 0);
  assert.equal(reconcileShippedSet(null, 'mitosis').size, 0);
});

test('parseRunManifest: valid single-object manifest is returned', () => {
  const raw = JSON.stringify({ logicalRunId: 'deadbeef', clusters: [['a']], msps: [{ id: 'a' }] });
  const m = parseRunManifest(raw);
  assert.equal(m.logicalRunId, 'deadbeef');
});

test('parseRunManifest: malformed, legacy-NDJSON, or field-incomplete input yields null (fall back to gh/git)', () => {
  assert.equal(parseRunManifest('{not json'), null);
  assert.equal(parseRunManifest('{"mspId":"a"}\n{"mspId":"b"}'), null);
  assert.equal(parseRunManifest(JSON.stringify({ clusters: [], msps: [] })), null);
  assert.equal(parseRunManifest(''), null);
  assert.equal(parseRunManifest(null), null);
});

test('buildInitialManifest: planned msps, derived integration branch, title/rationale persisted verbatim, immutable inputs', () => {
  const msps = [{ id: 'a', title: 'Alpha title', rationale: 'Alpha rationale', dependsOn: [], fileScope: ['src/a/**'] }];
  const manifest = buildInitialManifest({
    logicalRunId: 'deadbeef', harnessRunId: undefined, spec: '/s.md', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a']], msps,
  });
  assert.equal(manifest.harnessRunId, null);
  assert.equal(manifest.phase, 'Decompose');
  assert.deepEqual(manifest.msps[0], {
    id: 'a', title: 'Alpha title', rationale: 'Alpha rationale', status: 'planned', integrationBranch: 'mitosis/a-integration',
    prUrl: null, mergedAt: null, dependsOn: [], fileScope: ['src/a/**'],
  });
  assert.deepEqual(msps[0], { id: 'a', title: 'Alpha title', rationale: 'Alpha rationale', dependsOn: [], fileScope: ['src/a/**'] });
});

test('applyShipTransition: marks the msp shipped and does not mutate the input', () => {
  const before = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a', 'b']],
    msps: [{ id: 'a', dependsOn: [], fileScope: [] }, { id: 'b', dependsOn: [], fileScope: [] }],
  });
  const after = applyShipTransition(before, { mspId: 'a', prUrl: 'http://pr/1', mergedAt: '2026-07-08T00:00:00Z' });
  assert.equal(after.msps.find((m) => m.id === 'a').status, 'shipped');
  assert.equal(after.msps.find((m) => m.id === 'a').prUrl, 'http://pr/1');
  assert.equal(after.msps.find((m) => m.id === 'b').status, 'planned');
  assert.equal(before.msps.find((m) => m.id === 'a').status, 'planned');
});

test('applyShipTransition: appends a full defensive shipped entry carrying the passed title/rationale when the mspId is absent', () => {
  const before = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a', 'b']],
    msps: [{ id: 'a', title: 'A', rationale: 'ra', dependsOn: [], fileScope: [] }, { id: 'b', title: 'B', rationale: 'rb', dependsOn: [], fileScope: [] }],
  });
  const snapshot = structuredClone(before);
  const after = applyShipTransition(before, { mspId: 'c', prUrl: 'http://pr/c', mergedAt: '2026-07-08T00:00:00Z', title: 'C title', rationale: 'C rationale' });
  assert.equal(after.msps.length, before.msps.length + 1);
  assert.deepEqual(after.msps.find((m) => m.id === 'c'), {
    id: 'c', title: 'C title', rationale: 'C rationale', status: 'shipped', integrationBranch: 'mitosis/c-integration',
    prUrl: 'http://pr/c', mergedAt: '2026-07-08T00:00:00Z', dependsOn: [], fileScope: [],
  });
  assert.deepEqual(after.msps[0], snapshot.msps[0]);
  assert.deepEqual(after.msps[1], snapshot.msps[1]);
  assert.deepEqual(before, snapshot);
});

test('buildInitialManifest: truncates an over-long title and rationale at the write layer, preserving null/undefined and shorter values verbatim', () => {
  const longTitle = 'T'.repeat(500);
  const longRationale = 'R'.repeat(5000);
  const manifest = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a'], ['b'], ['c']],
    msps: [
      { id: 'a', title: longTitle, rationale: longRationale, dependsOn: [], fileScope: [] },
      { id: 'b', title: 'short title', rationale: 'short rationale', dependsOn: [], fileScope: [] },
      { id: 'c', dependsOn: [], fileScope: [] },
    ],
    specContentHash: null,
  });
  assert.equal(manifest.msps[0].title.length, 200);
  assert.equal(manifest.msps[0].title, longTitle.slice(0, 200));
  assert.equal(manifest.msps[0].rationale.length, 1000);
  assert.equal(manifest.msps[0].rationale, longRationale.slice(0, 1000));
  assert.equal(manifest.msps[1].title, 'short title');
  assert.equal(manifest.msps[1].rationale, 'short rationale');
  assert.equal(manifest.msps[2].title, undefined);
  assert.equal(manifest.msps[2].rationale, undefined);
});

test('buildInitialManifest: persists the observed specContentHash as a top-level field, including null when the observed hash is null', () => {
  const hash = 'a'.repeat(64);
  const withHash = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a']],
    msps: [{ id: 'a', title: 'A', rationale: 'r', dependsOn: [], fileScope: [] }],
    specContentHash: hash,
  });
  assert.equal(withHash.specContentHash, hash);
  const withNull = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a']],
    msps: [{ id: 'a', title: 'A', rationale: 'r', dependsOn: [], fileScope: [] }],
    specContentHash: null,
  });
  assert.ok('specContentHash' in withNull, 'the top-level field is present even when null');
  assert.equal(withNull.specContentHash, null);
});
