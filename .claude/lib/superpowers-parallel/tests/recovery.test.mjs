import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLogicalRunId,
  branchToMspId,
  reconcileShippedSet,
  parseRunManifest,
  buildInitialManifest,
  applyShipTransition,
  applyBuiltTransition,
  resolveResumeTarget,
  mspContentHash,
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
    prUrl: null, mergedAt: null, dependsOn: [], fileScope: ['src/a/**'], contentHash: mspContentHash(msps[0]),
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

function builtBase() {
  return buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a', 'b']],
    msps: [{ id: 'a', title: 'A', rationale: 'ra', dependsOn: [], fileScope: [] }, { id: 'b', title: 'B', rationale: 'rb', dependsOn: [], fileScope: [] }],
  });
}

test('applyBuiltTransition: marks the unit built with checkpointRef/builtSha, returns a new object, leaves siblings and the input untouched', () => {
  const before = builtBase();
  const snapshot = structuredClone(before);
  const after = applyBuiltTransition(before, { unitId: 'a', checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234' });
  assert.notEqual(after, before);
  const a = after.msps.find((m) => m.id === 'a');
  assert.equal(a.status, 'built');
  assert.equal(a.checkpointRef, 'refs/mitosis/x/a');
  assert.equal(a.builtSha, 'abc1234');
  assert.equal(a.green, false, 'green defaults false when omitted (field plumbing; value wired later)');
  assert.deepEqual(a.builtAgainst, {}, 'builtAgainst defaults to an empty map when omitted');
  assert.deepEqual(after.msps.find((m) => m.id === 'b'), snapshot.msps.find((m) => m.id === 'b'));
  assert.deepEqual(before, snapshot);
});

test('applyBuiltTransition: persists an explicit green + builtAgainst provenance record', () => {
  const before = builtBase();
  const after = applyBuiltTransition(before, { unitId: 'a', checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234', green: true, builtAgainst: { b: 'cafe123' } });
  const a = after.msps.find((m) => m.id === 'a');
  assert.equal(a.green, true);
  assert.deepEqual(a.builtAgainst, { b: 'cafe123' });
});

test('applyBuiltTransition: idempotent — applying twice equals applying once', () => {
  const before = builtBase();
  const once = applyBuiltTransition(before, { unitId: 'a', checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234' });
  const twice = applyBuiltTransition(once, { unitId: 'a', checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234' });
  assert.deepEqual(twice, once);
});

test('applyBuiltTransition: terminal-status guard — a shipped unit is NEVER downgraded to built', () => {
  const before = builtBase();
  const shipped = applyShipTransition(before, { mspId: 'a', prUrl: 'http://pr/a', mergedAt: '2026-07-08T00:00:00Z' });
  const after = applyBuiltTransition(shipped, { unitId: 'a', checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234' });
  assert.equal(after.msps.find((m) => m.id === 'a').status, 'shipped');
});

test('applyBuiltTransition: parked/planned units are promoted to built', () => {
  const before = builtBase();
  const after = applyBuiltTransition(before, { unitId: 'a', checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234' });
  assert.equal(after.msps.find((m) => m.id === 'a').status, 'built');
});

test('applyBuiltTransition: appends a defensive built entry with the derived integration branch when the id is absent', () => {
  const before = builtBase();
  const after = applyBuiltTransition(before, { unitId: 'c', checkpointRef: 'refs/mitosis/x/c', sha: 'def5678' });
  assert.equal(after.msps.length, before.msps.length + 1);
  const c = after.msps.find((m) => m.id === 'c');
  assert.equal(c.status, 'built');
  assert.equal(c.integrationBranch, 'mitosis/c-integration');
  assert.equal(c.checkpointRef, 'refs/mitosis/x/c');
  assert.equal(c.builtSha, 'def5678');
});

test('resolveResumeTarget: a known runId (logical or harness) resolves the manifest; an unknown runId returns the halt sentinel, never a silent fresh start', () => {
  const manifest = { logicalRunId: 'deadbeef', harnessRunId: 'run-42', clusters: [['a']], msps: [{ id: 'a' }] };
  assert.deepEqual(resolveResumeTarget(manifest, 'deadbeef'), { found: true, manifest });
  assert.deepEqual(resolveResumeTarget(manifest, 'run-42'), { found: true, manifest });
  assert.deepEqual(resolveResumeTarget(manifest, 'nope'), { found: false, reason: 'no such run' });
  assert.deepEqual(resolveResumeTarget(null, 'deadbeef'), { found: false, reason: 'no such run' });
  assert.deepEqual(resolveResumeTarget(manifest, ''), { found: false, reason: 'no such run' });
});

test('parseRunManifest: a built-containing manifest round-trips (status is an opaque passthrough)', () => {
  const raw = JSON.stringify({
    logicalRunId: 'deadbeef', clusters: [['a']],
    msps: [{ id: 'a', status: 'built', checkpointRef: 'refs/mitosis/deadbeef/a', builtSha: 'abc1234' }],
  });
  const m = parseRunManifest(raw);
  assert.ok(m);
  assert.equal(m.msps[0].status, 'built');
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

test('mspContentHash: deterministic 8-hex fingerprint, stable for byte-identical MSP content', () => {
  const msp = { id: 'a', title: 'A', rationale: 'r', dependsOn: ['x'], fileScope: ['src/a.ts'] };
  const copy = { id: 'a', title: 'A', rationale: 'r', dependsOn: ['x'], fileScope: ['src/a.ts'] };
  const h = mspContentHash(msp);
  assert.match(h, /^[a-f0-9]{8}$/, 'the per-MSP hash is a lowercase 8-char hex string');
  assert.equal(mspContentHash(copy), h, 'identical MSP content yields an identical hash');
});

test('mspContentHash: sensitive to each stable field (id, title, rationale, dependsOn, fileScope) independently', () => {
  const base = { id: 'a', title: 'A', rationale: 'r', dependsOn: ['x'], fileScope: ['src/a.ts'] };
  const h = mspContentHash(base);
  assert.notEqual(mspContentHash({ ...base, id: 'b' }), h);
  assert.notEqual(mspContentHash({ ...base, title: 'A2' }), h);
  assert.notEqual(mspContentHash({ ...base, rationale: 'r2' }), h);
  assert.notEqual(mspContentHash({ ...base, dependsOn: ['y'] }), h);
  assert.notEqual(mspContentHash({ ...base, fileScope: ['src/b.ts'] }), h);
});

test('mspContentHash: ignores non-stable fields (status, prUrl, checkpointRef) so a rebuilt-but-content-identical MSP hashes the same', () => {
  const base = { id: 'a', title: 'A', rationale: 'r', dependsOn: [], fileScope: ['src/a.ts'] };
  const decorated = { ...base, status: 'built', prUrl: 'https://x', checkpointRef: 'refs/mitosis/x/a', integrationBranch: 'mitosis/a-integration' };
  assert.equal(mspContentHash(decorated), mspContentHash(base));
});

test('mspContentHash: field-boundary safe (tuple positions prevent id/title/rationale run-together collisions)', () => {
  assert.notEqual(
    mspContentHash({ id: 'ab', title: '', rationale: '', dependsOn: [], fileScope: [] }),
    mspContentHash({ id: 'a', title: 'b', rationale: '', dependsOn: [], fileScope: [] }),
  );
});

test('mspContentHash: degrades gracefully on malformed input (null, array, number, missing fields) — returns a hex string, never throws', () => {
  for (const bad of [null, undefined, [], 42, 'str', {}]) {
    assert.match(mspContentHash(bad), /^[a-f0-9]{8}$/, `malformed input ${JSON.stringify(bad)} still hashes without throwing`);
  }
  assert.equal(mspContentHash(null), mspContentHash({}), 'null and empty object both normalize to the empty-content hash');
});

test('buildInitialManifest: authors a per-MSP contentHash on every entry, computed from the raw (untruncated) decomposer content', () => {
  const longTitle = 'T'.repeat(500);
  const rawMsps = [
    { id: 'a', title: 'A', rationale: 'r', dependsOn: [], fileScope: ['src/a.ts'] },
    { id: 'b', title: longTitle, rationale: 'r', dependsOn: ['a'], fileScope: ['src/b.ts'] },
  ];
  const manifest = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a'], ['b']],
    msps: rawMsps,
    specContentHash: null,
  });
  assert.equal(manifest.msps[0].contentHash, mspContentHash(rawMsps[0]));
  assert.equal(manifest.msps[1].contentHash, mspContentHash(rawMsps[1]));
  assert.match(manifest.msps[0].contentHash, /^[a-f0-9]{8}$/);
  assert.notEqual(
    manifest.msps[1].contentHash,
    mspContentHash({ ...rawMsps[1], title: manifest.msps[1].title }),
    'the per-MSP hash is over the raw untruncated title, not the stored truncated one',
  );
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
