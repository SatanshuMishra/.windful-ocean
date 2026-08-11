import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLogicalRunId,
  branchToMspId,
  prUrlToRepoRef,
  reconcileShippedSet,
  manifestPrUrlById,
  parseRunManifest,
  buildInitialManifest,
  applyShipTransition,
  applyBuiltTransition,
  resolveResumeTarget,
  mspContentHash,
  buildPublishedManifest,
  parsePublishedManifest,
  resolveRunIdentity,
  PUBLISHED_RUN_FIELDS,
  PUBLISHED_MSP_FIELDS,
} from '../recovery.mjs';
import { park } from '../parking.mjs';

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
    { headRefName: 'mitosis/a-integration', url: 'https://github.com/me/target/pull/1', mergedAt: '2026-07-08T00:00:00Z' },
    { headRefName: 'feature/unrelated', url: 'https://github.com/me/target/pull/2', mergedAt: '2026-07-08T01:00:00Z' },
  ], 'mitosis', 'me/target');
  assert.deepEqual([...m.keys()], ['a']);
  assert.deepEqual(m.get('a'), { prUrl: 'https://github.com/me/target/pull/1', mergedAt: '2026-07-08T00:00:00Z' });
});

test('reconcileShippedSet: empty or nullish input yields an empty map', () => {
  assert.equal(reconcileShippedSet([], 'mitosis', 'me/target').size, 0);
  assert.equal(reconcileShippedSet(null, 'mitosis', 'me/target').size, 0);
});

test('prUrlToRepoRef: parses {host, ownerRepo} out of an https PR url', () => {
  assert.deepEqual(prUrlToRepoRef('https://github.com/me/target/pull/2'), { host: 'github.com', ownerRepo: 'me/target' });
  assert.deepEqual(prUrlToRepoRef('http://github.com/o/r/pull/7#discussion'), { host: 'github.com', ownerRepo: 'o/r' });
  assert.deepEqual(prUrlToRepoRef('https://github.com/o/r/pull/7?foo=bar'), { host: 'github.com', ownerRepo: 'o/r' });
});

test('prUrlToRepoRef: lowercases both host and owner/repo (GitHub identity is case-insensitive) and tolerates a leading-dot repo name and an enterprise host', () => {
  assert.deepEqual(prUrlToRepoRef('https://github.com/SatanshuMishra/.windful-ocean/pull/2'), { host: 'github.com', ownerRepo: 'satanshumishra/.windful-ocean' });
  assert.deepEqual(prUrlToRepoRef('https://GHE.Example.COM/Acme/Widgets/pull/9'), { host: 'ghe.example.com', ownerRepo: 'acme/widgets' });
});

test('prUrlToRepoRef: returns null on anything not a /pull/<n> url', () => {
  assert.equal(prUrlToRepoRef('https://github.com/me/target'), null);
  assert.equal(prUrlToRepoRef('https://github.com/me/target/pull/notanumber'), null);
  assert.equal(prUrlToRepoRef('http://pr/1'), null);
  assert.equal(prUrlToRepoRef('not a url'), null);
  assert.equal(prUrlToRepoRef(''), null);
  assert.equal(prUrlToRepoRef(null), null);
  assert.equal(prUrlToRepoRef(undefined), null);
  assert.equal(prUrlToRepoRef(42), null);
});

test('reconcileShippedSet defense-in-depth: a wrong-repo merged PR is NEVER added to the skip set when a target is given', () => {
  const merged = [
    { headRefName: 'mitosis/foo-integration', url: 'https://github.com/me/target/pull/2', mergedAt: '2026-07-14T00:00:00Z' },
    { headRefName: 'mitosis/bar-integration', url: 'https://github.com/other/repo/pull/9', mergedAt: '2026-07-14T01:00:00Z' },
  ];
  const m = reconcileShippedSet(merged, 'mitosis', 'me/target');
  assert.deepEqual([...m.keys()], ['foo'], 'only the target-repo PR maps to an mspId; the wrong-repo PR is rejected');
  assert.deepEqual(m.get('foo'), { prUrl: 'https://github.com/me/target/pull/2', mergedAt: '2026-07-14T00:00:00Z' });
  assert.equal(m.has('bar'), false);
});

test('reconcileShippedSet defense-in-depth: owner/repo comparison is case-insensitive (GitHub identity)', () => {
  const merged = [
    { headRefName: 'mitosis/foo-integration', url: 'https://github.com/Me/Target/pull/2', mergedAt: '2026-07-14T00:00:00Z' },
  ];
  assert.deepEqual([...reconcileShippedSet(merged, 'mitosis', 'me/target').keys()], ['foo']);
});

test('reconcileShippedSet defense-in-depth: a merged PR whose url is unparseable is rejected when a target is set', () => {
  const merged = [
    { headRefName: 'mitosis/foo-integration', url: 'http://pr/1', mergedAt: '2026-07-14T00:00:00Z' },
  ];
  assert.equal(reconcileShippedSet(merged, 'mitosis', 'me/target').size, 0);
});

test('reconcileShippedSet deny-by-default: an absent, empty, or non-string target repo yields an EMPTY shipped set — an unidentifiable target trusts nothing, never everything', () => {
  const merged = [
    { headRefName: 'mitosis/foo-integration', url: 'https://github.com/me/target/pull/1', mergedAt: '2026-07-14T00:00:00Z' },
  ];
  assert.equal(reconcileShippedSet(merged, 'mitosis').size, 0);
  assert.equal(reconcileShippedSet(merged, 'mitosis', null).size, 0);
  assert.equal(reconcileShippedSet(merged, 'mitosis', '').size, 0);
  assert.equal(reconcileShippedSet(merged, 'mitosis', 42).size, 0);
  assert.deepEqual([...reconcileShippedSet(merged, 'mitosis', 'me/target').keys()], ['foo'], 'a usable target keeps the existing narrow acceptance unchanged');
});

test('manifestPrUrlById deny-by-default: an absent, empty, or non-string target repo yields an EMPTY url map — an unidentifiable target trusts nothing, never everything', () => {
  const manifest = { msps: [{ id: 'a', prUrl: 'https://github.com/me/target/pull/3' }] };
  assert.equal(manifestPrUrlById(manifest).size, 0);
  assert.equal(manifestPrUrlById(manifest, null).size, 0);
  assert.equal(manifestPrUrlById(manifest, '').size, 0);
  assert.equal(manifestPrUrlById(manifest, 42).size, 0);
  assert.deepEqual([...manifestPrUrlById(manifest, 'me/target').entries()], [['a', 'https://github.com/me/target/pull/3']], 'a usable target keeps the existing narrow acceptance unchanged');
});

test('manifestPrUrlById defense-in-depth: wrong-repo, wrong-host, and unparseable prUrl entries are rejected under a usable target', () => {
  const manifest = {
    msps: [
      { id: 'a', prUrl: 'https://github.com/me/target/pull/1' },
      { id: 'b', prUrl: 'https://github.com/other/repo/pull/2' },
      { id: 'c', prUrl: 'https://evil.example/me/target/pull/3' },
      { id: 'd', prUrl: 'http://pr/4' },
    ],
  };
  assert.deepEqual([...manifestPrUrlById(manifest, 'me/target', 'github.com').keys()], ['a']);
});

test('reconcileShippedSet host defense-in-depth: a same-slug wrong-HOST merged PR is rejected when a target host is given', () => {
  const merged = [
    { headRefName: 'mitosis/foo-integration', url: 'https://github.com/me/target/pull/1', mergedAt: '2026-07-14T00:00:00Z' },
    { headRefName: 'mitosis/bar-integration', url: 'https://evil.example/me/target/pull/2', mergedAt: '2026-07-14T01:00:00Z' },
  ];
  const m = reconcileShippedSet(merged, 'mitosis', 'me/target', 'github.com');
  assert.deepEqual([...m.keys()], ['foo'], 'only the matching-host PR maps to an mspId; the same-slug wrong-host PR is rejected');
  assert.equal(m.has('bar'), false);
});

test('reconcileShippedSet host defense-in-depth: host comparison is case-insensitive', () => {
  const merged = [
    { headRefName: 'mitosis/foo-integration', url: 'https://GitHub.COM/Me/Target/pull/1', mergedAt: '2026-07-14T00:00:00Z' },
  ];
  assert.deepEqual([...reconcileShippedSet(merged, 'mitosis', 'me/target', 'GITHUB.com').keys()], ['foo']);
});

test('reconcileShippedSet host back-compat: a 3-arg call (no target host) enforces owner/repo only, never host', () => {
  const merged = [
    { headRefName: 'mitosis/foo-integration', url: 'https://evil.example/me/target/pull/1', mergedAt: '2026-07-14T00:00:00Z' },
  ];
  assert.deepEqual([...reconcileShippedSet(merged, 'mitosis', 'me/target').keys()], ['foo'], 'without a target host the same-slug PR still matches (old behavior preserved)');
  assert.deepEqual([...reconcileShippedSet(merged, 'mitosis', 'me/target', undefined).keys()], ['foo']);
  assert.deepEqual([...reconcileShippedSet(merged, 'mitosis', 'me/target', '').keys()], ['foo']);
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

test('buildInitialManifest: planned msps, derived integration branch, title/rationale/changeType/scope persisted verbatim, immutable inputs', () => {
  const msps = [{ id: 'a', title: 'Alpha title', rationale: 'Alpha rationale', changeType: 'feat', scope: 'alpha', dependsOn: [], fileScope: ['src/a/**'] }];
  const manifest = buildInitialManifest({
    logicalRunId: 'deadbeef', harnessRunId: undefined, spec: '/s.md', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a']], msps,
  });
  assert.equal(manifest.harnessRunId, null);
  assert.equal(manifest.phase, 'Decompose');
  assert.deepEqual(manifest.msps[0], {
    id: 'a', title: 'Alpha title', rationale: 'Alpha rationale', changeType: 'feat', scope: 'alpha', status: 'planned', integrationBranch: 'mitosis/a-integration',
    prUrl: null, mergedAt: null, dependsOn: [], fileScope: ['src/a/**'], contentHash: mspContentHash(msps[0]),
  });
  assert.deepEqual(msps[0], { id: 'a', title: 'Alpha title', rationale: 'Alpha rationale', changeType: 'feat', scope: 'alpha', dependsOn: [], fileScope: ['src/a/**'] });
});

test('mspContentHash: the declared changeType and scope are inside the canonical tuple, so a re-declared change type is a content change', () => {
  const base = { id: 'a', title: 'alpha title', rationale: 'Alpha rationale', changeType: 'feat', scope: 'alpha', dependsOn: [], fileScope: ['src/a/**'] };
  assert.notEqual(mspContentHash(base), mspContentHash({ ...base, changeType: 'fix' }), 'a changed changeType must change the hash, or a stale pre-migration manifest would be replay-forward-skipped under a title it cannot compose');
  assert.notEqual(mspContentHash(base), mspContentHash({ ...base, scope: 'beta' }), 'a changed scope must change the hash for the same reason');
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

test('applyShipTransition: appends a full defensive shipped entry carrying the passed title/rationale/changeType/scope when the mspId is absent', () => {
  const before = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a', 'b']],
    msps: [{ id: 'a', title: 'A', rationale: 'ra', dependsOn: [], fileScope: [] }, { id: 'b', title: 'B', rationale: 'rb', dependsOn: [], fileScope: [] }],
  });
  const snapshot = structuredClone(before);
  const after = applyShipTransition(before, { mspId: 'c', prUrl: 'http://pr/c', mergedAt: '2026-07-08T00:00:00Z', title: 'C title', rationale: 'C rationale', changeType: 'chore', scope: 'c' });
  assert.equal(after.msps.length, before.msps.length + 1);
  assert.deepEqual(after.msps.find((m) => m.id === 'c'), {
    id: 'c', title: 'C title', rationale: 'C rationale', changeType: 'chore', scope: 'c', status: 'shipped', integrationBranch: 'mitosis/c-integration',
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

test('applyBuiltTransition: clears the resumePoint, so a rebuilt unit re-parked by an ancestor cascade no longer reads as stage plan', () => {
  const base = buildInitialManifest({
    logicalRunId: 'x', harnessRunId: null, spec: '/s', repoRoot: '/r',
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a', 'b']],
    msps: [
      { id: 'a', title: 'A', rationale: 'ra', dependsOn: [], fileScope: [] },
      { id: 'b', title: 'B', rationale: 'rb', dependsOn: ['a'], fileScope: [] },
    ],
  });
  const parkedAtPlan = park(base, {
    unitId: 'b',
    stage: 'plan',
    diagnosis: 'planner stalled',
    resumePoint: { branch: 'mitosis/b-integration', ref: null },
    triedSet: [],
  });
  assert.equal(parkedAtPlan.msps.find((m) => m.id === 'b').resumePoint.stage, 'plan');

  const rebuilt = applyBuiltTransition(parkedAtPlan, { unitId: 'b', checkpointRef: 'refs/mitosis/x/b', sha: 'abc1234' });
  const cascaded = park(rebuilt, { unitId: 'a', stage: 'execute', diagnosis: 'ancestor failed', triedSet: [] });

  const b = cascaded.msps.find((m) => m.id === 'b');
  assert.equal(b.status, 'parked', 'the ancestor cascade parks the dependent');
  assert.notEqual(
    b.resumePoint && b.resumePoint.stage,
    'plan',
    'a rebuilt unit carries no plan-stage resumePoint; otherwise the relaunch guard skips its built transition and git-ref rescue and it re-plans despite holding a live checkpoint',
  );
  assert.equal(b.checkpointRef, 'refs/mitosis/x/b', 'the checkpoint ref survives the cascade for the rescue to use');
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

const IDENTITY_SPEC_HASH = 'a'.repeat(64);

function identityMsp(overrides = {}) {
  return { id: 'a', dependsOn: [], fileScope: ['src/a/**'], changeType: 'feat', scope: 'alpha', title: 'alpha title', rationale: 'Alpha rationale', ...overrides };
}

const IDENTITY_REPO_ROOT = '/r';
const IDENTITY_SPEC_ABS = '/r/specs/x.md';
const IDENTITY_SPEC_REL = 'specs/x.md';

function publishedPayloadObject(overrides = {}) {
  return {
    schemaVersion: 1,
    logicalRunId: 'deadbeef',
    spec: IDENTITY_SPEC_REL,
    baseBranch: 'main',
    sourcePrefix: 'mitosis',
    specContentHash: IDENTITY_SPEC_HASH,
    clusters: [['a']],
    msps: [identityMsp()],
    ...overrides,
  };
}

function identityCtx(overrides = {}) {
  return {
    logicalRunId: 'deadbeef',
    observedSpecHash: IDENTITY_SPEC_HASH,
    harnessRunId: 'harness-now',
    spec: IDENTITY_SPEC_ABS,
    repoRoot: IDENTITY_REPO_ROOT,
    baseBranch: 'main',
    sourcePrefix: 'mitosis',
    refPresent: true,
    ...overrides,
  };
}

function localJournalFixture(overrides = {}) {
  return {
    logicalRunId: 'deadbeef',
    harnessRunId: 'harness-before',
    spec: IDENTITY_SPEC_ABS,
    repoRoot: IDENTITY_REPO_ROOT,
    baseBranch: 'main',
    sourcePrefix: 'mitosis',
    specContentHash: IDENTITY_SPEC_HASH,
    phase: 'Execute',
    window: 4,
    parked: [],
    clusters: [['a'], ['z']],
    msps: [
      {
        id: 'a', title: 'alpha title', rationale: 'Alpha rationale', changeType: 'feat', scope: 'alpha',
        status: 'built', integrationBranch: 'mitosis/a-integration', prUrl: null, mergedAt: null,
        dependsOn: [], fileScope: ['old/**'], checkpointRef: 'refs/mitosis/deadbeef/a',
        builtSha: 'a'.repeat(40), green: true, builtAgainst: {},
      },
      {
        id: 'z', title: 'zeta title', rationale: 'Zeta rationale', changeType: 'chore', scope: 'zeta',
        status: 'planned', integrationBranch: 'mitosis/z-integration', prUrl: null, mergedAt: null,
        dependsOn: [], fileScope: ['z/**'],
      },
    ],
    ...overrides,
  };
}

function absolutePathsIn(value, path = 'payload') {
  if (typeof value === 'string') {
    const absolute = value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
    return absolute ? [`${path}=${JSON.stringify(value)}`] : [];
  }
  if (Array.isArray(value)) return value.flatMap((entry, index) => absolutePathsIn(entry, `${path}[${index}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => absolutePathsIn(entry, `${path}.${key}`));
  }
  return [];
}

test('I1 write side: buildPublishedManifest is a WHITELIST projection, so no run-state field can leak into the durable identity payload', () => {
  const genesis = buildInitialManifest({
    logicalRunId: 'deadbeef', harnessRunId: 'harness-before', spec: IDENTITY_SPEC_ABS, repoRoot: IDENTITY_REPO_ROOT,
    baseBranch: 'main', sourcePrefix: 'mitosis', clusters: [['a']],
    msps: [{ id: 'a', title: 'alpha title', rationale: 'Alpha rationale', changeType: 'feat', scope: 'alpha', dependsOn: [], fileScope: ['src/a/**'] }],
    specContentHash: IDENTITY_SPEC_HASH,
  });
  const decorated = {
    ...genesis,
    phase: 'Execute',
    window: 5,
    parked: [{ unitId: 'a' }],
    msps: genesis.msps.map((m) => ({
      ...m,
      status: 'built',
      resumePoint: { branch: 'mitosis/a-integration', ref: 'main', stage: 'plan' },
      triedSet: ['solo'],
      prUrl: 'https://example.test/pr/1',
      mergedAt: '2026-07-10T00:00:00Z',
      checkpointRef: 'refs/mitosis/deadbeef/a',
      builtSha: 'a'.repeat(40),
      green: true,
      builtAgainst: { main: 'b'.repeat(40) },
    })),
  };
  const payload = buildPublishedManifest(decorated);

  assert.deepEqual(Object.keys(payload), [...PUBLISHED_RUN_FIELDS], 'the envelope carries exactly the declared identity fields, in the declared order, so JSON.stringify is byte-stable');
  assert.deepEqual(Object.keys(payload.msps[0]), [...PUBLISHED_MSP_FIELDS], 'each msp carries exactly the declared identity fields — status, resumePoint, triedSet, prUrl, mergedAt, checkpointRef, builtSha, green, builtAgainst, integrationBranch and contentHash are all absent');
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.logicalRunId, 'deadbeef');
  assert.equal(payload.specContentHash, IDENTITY_SPEC_HASH);
  assert.deepEqual(payload.msps[0].fileScope, ['src/a/**']);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'repoRoot'), false, 'repoRoot is a machine-local absolute path and is precisely the non-portable field the durable ref must not carry');
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'harnessRunId'), false, 'harnessRunId is per-invocation, not identity');
  assert.equal(payload.spec, IDENTITY_SPEC_REL, 'spec is carried repo-RELATIVE: the payload is pushed to a shared remote, and the absolute form leaks the originating machine home directory to every other clone');
  assert.deepEqual(
    absolutePathsIn(payload),
    [],
    'NO absolute path of any shape reaches the durable payload — not the spec, not a fileScope entry, not a POSIX root, a Windows drive or a UNC share',
  );
  assert.equal(JSON.stringify(payload).includes(IDENTITY_REPO_ROOT), false, 'the originating repository root never appears anywhere in the published bytes');
  assert.deepEqual(
    [...PUBLISHED_MSP_FIELDS],
    ['id', 'dependsOn', 'fileScope', 'changeType', 'scope', 'title', 'rationale'],
    'transcribed from spec 3.5: a future field addition must be a VISIBLE edit to this test, never silent drift',
  );
});

test('I1 read side: parsePublishedManifest is a CLOSED census that halts on the unclassifiable instead of sanitising it', () => {
  assert.deepEqual(parsePublishedManifest(JSON.stringify(publishedPayloadObject())), publishedPayloadObject(), 'a well-formed identity payload parses');

  const smuggledStatus = publishedPayloadObject({ msps: [{ ...identityMsp(), status: 'shipped' }] });
  assert.equal(parsePublishedManifest(JSON.stringify(smuggledStatus)), null, 'an msp carrying status is REJECTED, not sanitised — smuggled status degrades the run to local-only rather than becoming a second authority');

  const smuggledResumePoint = publishedPayloadObject({ msps: [{ ...identityMsp(), resumePoint: { stage: 'plan' } }] });
  assert.equal(parsePublishedManifest(JSON.stringify(smuggledResumePoint)), null, 'an msp carrying resumePoint is rejected');

  const smuggledTriedSet = publishedPayloadObject({ msps: [{ ...identityMsp(), triedSet: [] }] });
  assert.equal(parsePublishedManifest(JSON.stringify(smuggledTriedSet)), null, 'an msp carrying triedSet is rejected');

  assert.equal(parsePublishedManifest(JSON.stringify({ ...publishedPayloadObject(), window: 5 })), null, 'a top-level window is rejected');

  const { specContentHash, ...noHash } = publishedPayloadObject();
  assert.equal(specContentHash, IDENTITY_SPEC_HASH);
  assert.equal(parsePublishedManifest(JSON.stringify(noHash)), null, 'a payload missing specContentHash is rejected — the staleness gate cannot run without it');

  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ schemaVersion: 2 }))), null, 'an unrecognised schemaVersion is rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ logicalRunId: 'DEADBEEF' }))), null, 'a non-8-lowercase-hex logicalRunId is rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ specContentHash: 'short' }))), null, 'a malformed specContentHash is rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ spec: '/Users/someone/repo/specs/x.md' }))), null, 'an ABSOLUTE spec path is rejected — it is another machine home directory, and reading it as this run spec would resolve a path that does not exist here');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ spec: '../outside/x.md' }))), null, 'a spec path that escapes the repository root with .. is rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ spec: 'specs/../../outside/x.md' }))), null, 'a .. segment anywhere in the spec path is rejected, not only in the leading position');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ spec: 'C:/repo/specs/x.md' }))), null, 'a Windows drive prefix is rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ spec: 'specs/x.md' }))).spec, 'specs/x.md', 'a repo-relative POSIX path is the one accepted shape');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ msps: [] }))), null, 'an empty msp table is rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ clusters: ['a'] }))), null, 'clusters that are not arrays of arrays of strings are rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ msps: [identityMsp({ id: 'Bad Id' })] }))), null, 'a malformed msp id is rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ msps: [identityMsp({ dependsOn: 'a' })] }))), null, 'a non-array dependsOn is rejected');
  assert.equal(parsePublishedManifest(JSON.stringify(publishedPayloadObject({ msps: [identityMsp({ title: null })] }))), null, 'a non-string title is rejected');

  assert.equal(parsePublishedManifest('{"mspId":"a"}\n{"mspId":"b"}'), null, 'a legacy NDJSON journal blob is rejected');
  assert.equal(parsePublishedManifest('{not json'), null);
  assert.equal(parsePublishedManifest('[]'), null);
  assert.equal(parsePublishedManifest(''), null);
  assert.equal(parsePublishedManifest(null), null);
});

test('I3 precedence: the published identity table WINS a disagreement with the local journal, the journal-only id is dropped, and run state is still carried', () => {
  const lines = [];
  const local = localJournalFixture();
  const published = publishedPayloadObject({ msps: [identityMsp({ fileScope: ['new/**'] })] });
  const resolved = resolveRunIdentity(published, local, identityCtx({ log: (line) => lines.push(line) }));

  assert.equal(resolved.identity, 'published');
  assert.deepEqual(resolved.manifest.msps.map((m) => m.id), ['a'], 'the id present only in the local journal is DROPPED — the published table is the identity authority');
  assert.deepEqual(resolved.manifest.msps[0].fileScope, ['new/**'], 'the published fileScope wins over the local journal copy');
  assert.equal(resolved.manifest.msps[0].status, 'built', 'status is run state, not identity, and is carried from the local journal');
  assert.equal(resolved.manifest.msps[0].builtSha, 'a'.repeat(40), 'the durable build provenance the journal owns survives the overlay');
  assert.equal(resolved.manifest.msps[0].checkpointRef, 'refs/mitosis/deadbeef/a');
  assert.equal(resolved.manifest.window, undefined, 'a journal-persisted window is NOT carried — the build-ahead width is a fixed engine constant and the manifest is never a second authority for it');
  assert.equal(resolved.manifest.harnessRunId, 'harness-before', 'the journal harnessRunId is carried so resume <harnessRunId> still resolves when a journal exists');

  const disagreement = lines.filter((l) => /a\.fileScope/.test(l));
  assert.equal(disagreement.length, 1, 'exactly ONE line names every disagreement');
  assert.match(disagreement[0], /ids present only in the local journal and dropped: z/, 'the same line names the dropped journal-only id');
  assert.match(disagreement[0], /published copy WINS/i, 'the line states which copy won');

  assert.equal(local.msps[0].fileScope[0], 'old/**', 'the local journal is never mutated');
  assert.deepEqual(published.msps[0].fileScope, ['new/**'], 'the published payload is never mutated');
});

test('I3 continuity: the ci attempt record survives the published-identity overlay, so a relaunch that reads a published manifest still refuses to re-ship an already-published head', () => {
  const local = localJournalFixture();
  local.msps[0].ciAttempts = ['ci-published:pr', 'ci-fix:abcd1234'];
  const published = publishedPayloadObject();
  const resolved = resolveRunIdentity(published, local, identityCtx({ refPresent: true }));

  assert.equal(resolved.identity, 'published');
  assert.deepEqual(
    resolved.manifest.msps[0].ciAttempts,
    ['ci-published:pr', 'ci-fix:abcd1234'],
    'ciAttempts is machine-local run state the journal owns; dropping it on the published path would hand the unit a fresh attempt cap on a head that is already published and under human review',
  );
});

test('I3 continuity: the recorded quiescent-exit instant survives the published path, so the latency emitter is not dead on every run that published a manifest ref', () => {
  const local = localJournalFixture({ quiescentExitAt: '2026-07-31T10:00:00Z' });
  const published = publishedPayloadObject();

  const localOnly = resolveRunIdentity(null, local, identityCtx({ refPresent: false }));
  assert.equal(localOnly.identity, 'local-only');
  assert.equal(localOnly.manifest.quiescentExitAt, '2026-07-31T10:00:00Z');

  const resolved = resolveRunIdentity(published, local, identityCtx({ refPresent: true }));
  assert.equal(resolved.identity, 'published');
  assert.equal(
    resolved.manifest.quiescentExitAt,
    '2026-07-31T10:00:00Z',
    'quiescentExitAt is machine-local run state the journal owns, exactly like window and harnessRunId — dropping it on the published path would silence the latency emitter for every run whose manifest ref exists, which is every run M6 published',
  );

  assert.equal(PUBLISHED_RUN_FIELDS.includes('quiescentExitAt'), false, 'the instant is carried from the LOCAL journal only; publishing it to the identity ref would make the ref carry status, which identity-only exists to forbid');
  assert.equal(resolveRunIdentity(published, localJournalFixture(), identityCtx({ refPresent: true })).manifest.quiescentExitAt, undefined, 'a journal with no recorded exit yields no field to carry, rather than a fabricated one');

  const outstanding = resolveRunIdentity(published, localJournalFixture({ quiescentExitAt: '2026-07-31T10:00:00Z', quiescentExitOutstanding: true }), identityCtx({ refPresent: true }));
  assert.equal(outstanding.manifest.quiescentExitOutstanding, true, 'the instant travels with the fact of whether that exit waited on a human; carrying one without the other leaves the next advance unable to tell a human wait from post-completion idle time');
  assert.equal(PUBLISHED_RUN_FIELDS.includes('quiescentExitOutstanding'), false, 'the flag is machine-local run state for the same reason the instant is, and publishing it would put status on the identity ref');
});

test('I3 guard: resolveRunIdentity REFUSES a published payload whose own specContentHash disagrees with the content-keyed ref it was read from, and falls back to the local journal', () => {
  const staleLines = [];
  const local = localJournalFixture();
  const published = publishedPayloadObject();
  const stale = resolveRunIdentity(published, local, identityCtx({ observedSpecHash: 'b'.repeat(64), log: (line) => staleLines.push(line) }));

  assert.equal(stale.identity, 'local-only', 'the ref is content-keyed, so a payload read from the observed-hash ref that carries a DIFFERENT hash is corrupt or misfiled, never merely stale');
  assert.equal(stale.manifest, local, 'the local journal is returned unchanged');
  const integrity = staleLines.filter((l) => /INTEGRITY/i.test(l));
  assert.equal(integrity.length, 1, 'the refusal is reported, never silent');
  assert.match(integrity[0], /disagrees with the ref it was read from/i, 'the line names what actually failed — a payload contradicting its own ref path — rather than the spec-edit staleness the content-keyed ref made impossible');
  assert.equal(staleLines.filter((l) => /re-decomposes under the same id/i.test(l)).length, 0, 'the retired spec-edit-staleness wording is gone: a spec edit now names a DIFFERENT ref and can never produce this line');

  const unreadableLines = [];
  const unreadable = resolveRunIdentity(published, local, identityCtx({ observedSpecHash: null, log: (line) => unreadableLines.push(line) }));
  assert.equal(unreadable.identity, 'local-only', 'an unreadable spec fails CLOSED rather than trusting the published copy');
  assert.equal(unreadable.manifest, local);
  assert.equal(unreadableLines.filter((l) => /INTEGRITY/i.test(l)).length, 1);

  const foreignLines = [];
  const foreign = resolveRunIdentity(publishedPayloadObject({ logicalRunId: 'a1b2c3d4' }), local, identityCtx({ log: (line) => foreignLines.push(line) }));
  assert.equal(foreign.identity, 'local-only', 'a payload for a FOREIGN logicalRunId is never adopted');
  assert.equal(foreign.manifest, local);
  assert.equal(foreignLines.filter((l) => /FOREIGN/i.test(l)).length, 1);
});

test('I4 taxonomy: a FAILED probe, an unread payload, an invalid payload and a genuine absence each report a DISTINCT line, and a failed probe never asserts absence', () => {
  const local = localJournalFixture();
  const capture = (overrides) => {
    const lines = [];
    const resolved = resolveRunIdentity(null, local, identityCtx({ ...overrides, log: (line) => lines.push(line) }));
    assert.equal(resolved.identity, 'local-only');
    assert.equal(resolved.manifest, local);
    assert.equal(lines.length, 1, 'exactly one identity line is emitted per resolution');
    return lines[0];
  };

  const absent = capture({ refPresent: false });
  const probeFailed = capture({ refPresent: false, probeFailed: true });
  const unread = capture({ refPresent: true, payloadUnreadable: true });
  const invalid = capture({ refPresent: true });

  assert.match(absent, /no published run-identity manifest ref/, 'a definite absence is stated as an absence');
  assert.match(probeFailed, /does NOT assert that the ref is absent/, 'a failed probe explicitly declines to assert absence — absence is reported, never inferred from a read that did not run');
  assert.doesNotMatch(probeFailed, /a fresh clone will not find it/, 'a failed probe never borrows the confident wording of a genuine absence');
  assert.match(unread, /could not be READ/, 'a ref whose payload could not be fetched is reported as unread');
  assert.match(unread, /do NOT delete or republish that ref/, 'the unread case names the action an operator must NOT take on this evidence');
  assert.match(invalid, /did not validate as an identity-only manifest/, 'a payload that was read but is malformed is reported as invalid');

  assert.equal(new Set([absent, probeFailed, unread, invalid]).size, 4, 'four operationally different causes never collapse into one indistinguishable message');
});

test('I3 envelope: a published run-level identity field that DISAGREES with the invocation is logged with the consequence, and sourcePrefix is named as the field the run id does not pin', () => {
  const lines = [];
  const local = localJournalFixture();
  const published = publishedPayloadObject({ sourcePrefix: 'wave' });
  const resolved = resolveRunIdentity(published, local, identityCtx({ log: (line) => lines.push(line) }));

  assert.equal(resolved.identity, 'published', 'an envelope disagreement is reported, not a refusal — the identity table itself is still authoritative');
  const envelope = lines.filter((l) => /run-level identity field/.test(l));
  assert.equal(envelope.length, 1, 'the disagreement is reported exactly once');
  assert.match(envelope[0], /sourcePrefix \(published "wave", in effect "mitosis"\)/, 'the line names the field, the published value and the value actually in effect');
  assert.match(envelope[0], /will NOT be recognised as shipped/, 'the line names the operational consequence: already-merged branches under the published prefix go unrecognised');

  const quiet = [];
  resolveRunIdentity(publishedPayloadObject(), local, identityCtx({ log: (line) => quiet.push(line) }));
  assert.equal(quiet.filter((l) => /run-level identity field/.test(l)).length, 0, 'an envelope that agrees emits no disagreement line');
});

test('I3 envelope: the spec comparison runs in the REPO-RELATIVE form both sides are written in, so a portable payload never reports a permanent false disagreement', () => {
  const local = localJournalFixture();
  const agreeing = [];
  const resolved = resolveRunIdentity(publishedPayloadObject(), local, identityCtx({ log: (line) => agreeing.push(line) }));
  assert.equal(resolved.identity, 'published');
  assert.equal(
    agreeing.filter((l) => /run-level identity field/.test(l)).length,
    0,
    'the payload carries specs/x.md and the invocation carries /r/specs/x.md; comparing the relative payload against the ABSOLUTE invocation path would disagree on every run forever, drowning the real disagreements this line exists to surface',
  );

  const disagreeing = [];
  resolveRunIdentity(publishedPayloadObject({ spec: 'specs/other.md' }), local, identityCtx({ log: (line) => disagreeing.push(line) }));
  const line = disagreeing.filter((l) => /run-level identity field/.test(l));
  assert.equal(line.length, 1, 'a GENUINE spec disagreement is still reported once the comparison is like-for-like');
  assert.match(line[0], /spec \(published "specs\/other\.md", in effect "specs\/x\.md"\)/, 'both sides of the reported disagreement are shown in the same repo-relative form');
});
