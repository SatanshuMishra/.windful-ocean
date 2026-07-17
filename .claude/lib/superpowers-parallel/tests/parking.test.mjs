import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ParkRecord,
  transitiveDependents,
  park,
  selectResumeUnits,
  selectResumeBuilt,
  selectPreservedBuilt,
  descendantsToInvalidate,
} from '../parking.mjs';
import { mspContentHash } from '../recovery.mjs';
import { checkpointRef } from '../checkpoint.mjs';

function manifestWith(msps) {
  return {
    logicalRunId: 'deadbeef',
    sourcePrefix: 'mitosis',
    baseBranch: 'main',
    clusters: [msps.map((m) => m.id)],
    msps: msps.map((m) => ({
      id: m.id,
      status: m.status ?? 'planned',
      dependsOn: m.dependsOn ?? [],
      fileScope: m.fileScope ?? [],
      integrationBranch: `mitosis/${m.id}-integration`,
      prUrl: m.prUrl ?? null,
      mergedAt: m.mergedAt ?? null,
    })),
  };
}

test('ParkRecord: normalizes request/resumePoint defaults and freezes the record', () => {
  const rec = ParkRecord({
    unitId: 'auth',
    stage: 'parallelize',
    diagnosis: 'sandbox denies package install',
    request: { kind: 'install', what: 'libpq-dev' },
    remediation: 'install libpq-dev then resume',
  });
  assert.equal(rec.unitId, 'auth');
  assert.equal(rec.stage, 'parallelize');
  assert.deepEqual(rec.request, { kind: 'install', what: 'libpq-dev', detail: null });
  assert.deepEqual(rec.resumePoint, { branch: null, ref: null, stage: 'parallelize' });
  assert.deepEqual(rec.triedSet, []);
  assert.deepEqual(rec.dependents, []);
  assert.ok(Object.isFrozen(rec));
  assert.throws(() => {
    rec.unitId = 'mutated';
  });
});

test('ParkRecord: copies triedSet and dependents arrays rather than aliasing inputs', () => {
  const tried = ['acquisition:raw-http'];
  const deps = ['api'];
  const rec = ParkRecord({
    unitId: 'auth',
    stage: 'execute',
    request: { kind: 'grant', what: 'network', detail: 'egress blocked' },
    resumePoint: { branch: 'mitosis/auth-integration', ref: 'abc123', stage: 'execute' },
    triedSet: tried,
    dependents: deps,
  });
  tried.push('mutated');
  deps.push('mutated');
  assert.deepEqual(rec.triedSet, ['acquisition:raw-http']);
  assert.deepEqual(rec.dependents, ['api']);
  assert.deepEqual(rec.request, { kind: 'grant', what: 'network', detail: 'egress blocked' });
});

test('transitiveDependents: reverse reachability over dependsOn, excludes self, deterministic order', () => {
  const msps = manifestWith([
    { id: 'core' },
    { id: 'auth', dependsOn: ['core'] },
    { id: 'api', dependsOn: ['auth'] },
    { id: 'ui', dependsOn: ['api'] },
    { id: 'unrelated' },
  ]).msps;
  assert.deepEqual(transitiveDependents(msps, 'core'), ['auth', 'api', 'ui']);
  assert.deepEqual(transitiveDependents(msps, 'auth'), ['api', 'ui']);
  assert.deepEqual(transitiveDependents(msps, 'ui'), []);
  assert.deepEqual(transitiveDependents(msps, 'unrelated'), []);
});

test('transitiveDependents: diamond graph parks every prereq-reachable dependent once', () => {
  const msps = manifestWith([
    { id: 'root' },
    { id: 'left', dependsOn: ['root'] },
    { id: 'right', dependsOn: ['root'] },
    { id: 'join', dependsOn: ['left', 'right'] },
    { id: 'sibling' },
  ]).msps;
  assert.deepEqual(transitiveDependents(msps, 'root'), ['left', 'right', 'join']);
});

test('descendantsToInvalidate: identical merged content (squash preserved) invalidates nothing', () => {
  const manifest = manifestWith([
    { id: 'root' }, { id: 'left', dependsOn: ['root'] }, { id: 'right', dependsOn: ['root'] },
  ]);
  assert.deepEqual(descendantsToInvalidate(manifest, 'root', { priorSha: 'abc', mergedSha: 'abc' }), []);
});

test('descendantsToInvalidate: diverged merged content resets exactly the true descendant set (never the whole suffix)', () => {
  const manifest = manifestWith([
    { id: 'root' }, { id: 'left', dependsOn: ['root'] }, { id: 'right', dependsOn: ['root'] }, { id: 'sibling' },
  ]);
  assert.deepEqual(descendantsToInvalidate(manifest, 'root', { priorSha: 'abc', mergedSha: 'xyz' }), ['left', 'right']);
});

test('park: marks the blocked unit and its transitive dependents parked, writes one ParkRecord, returns a NEW manifest', () => {
  const before = manifestWith([
    { id: 'core' },
    { id: 'auth', dependsOn: ['core'] },
    { id: 'api', dependsOn: ['auth'] },
    { id: 'unrelated' },
  ]);
  const snapshot = structuredClone(before);
  const after = park(before, {
    unitId: 'core',
    stage: 'plan',
    diagnosis: 'human decision required',
    request: { kind: 'approve-decision', what: 'schema choice', detail: 'A vs B' },
    remediation: 'pick a schema',
    resumePoint: { branch: 'mitosis/core-integration', ref: 'sha0', stage: 'plan' },
    triedSet: ['import-path:relative'],
  });
  assert.notEqual(after, before);
  assert.deepEqual(before, snapshot);

  const statusOf = (m, id) => m.msps.find((x) => x.id === id).status;
  assert.equal(statusOf(after, 'core'), 'parked');
  assert.equal(statusOf(after, 'auth'), 'parked');
  assert.equal(statusOf(after, 'api'), 'parked');
  assert.equal(statusOf(after, 'unrelated'), 'planned');

  assert.equal(after.parked.length, 1);
  const rec = after.parked[0];
  assert.equal(rec.unitId, 'core');
  assert.deepEqual(rec.dependents, ['auth', 'api']);
  assert.deepEqual(rec.triedSet, ['import-path:relative']);
  assert.deepEqual(rec.resumePoint, { branch: 'mitosis/core-integration', ref: 'sha0', stage: 'plan' });
});

test('park: records triedSet and resumePoint on the blocked unit; dependents carry an empty triedSet', () => {
  const before = manifestWith([
    { id: 'core' },
    { id: 'auth', dependsOn: ['core'] },
  ]);
  const after = park(before, {
    unitId: 'core',
    stage: 'execute',
    triedSet: ['acquisition:raw-http', 'acquisition:package-manager'],
    resumePoint: { branch: 'mitosis/core-integration', ref: 'sha9', stage: 'execute' },
  });
  const core = after.msps.find((m) => m.id === 'core');
  const auth = after.msps.find((m) => m.id === 'auth');
  assert.deepEqual(core.triedSet, ['acquisition:raw-http', 'acquisition:package-manager']);
  assert.deepEqual(core.resumePoint, { branch: 'mitosis/core-integration', ref: 'sha9', stage: 'execute' });
  assert.deepEqual(auth.triedSet, []);
});

test('park: appends to an existing parked ledger without dropping prior records', () => {
  const first = park(manifestWith([{ id: 'a' }, { id: 'b' }]), { unitId: 'a', stage: 'plan' });
  const second = park(first, { unitId: 'b', stage: 'parallelize' });
  assert.equal(second.parked.length, 2);
  assert.deepEqual(second.parked.map((r) => r.unitId), ['a', 'b']);
});

test('park: rejects an invalid manifest or an unknown unit rather than silently corrupting state', () => {
  assert.throws(() => park(null, { unitId: 'a', stage: 'plan' }), /manifest/);
  assert.throws(() => park({ msps: [] }, { unitId: 'a', stage: 'plan' }), /unit/);
  assert.throws(() => park(manifestWith([{ id: 'a' }]), { unitId: 'ghost', stage: 'plan' }), /unit/);
});

test('selectResumeUnits: returns exactly the parked units at their recorded stage, carrying triedSet forward (6.4)', () => {
  const parked = park(manifestWith([
    { id: 'core' },
    { id: 'auth', dependsOn: ['core'] },
    { id: 'unrelated' },
  ]), {
    unitId: 'core',
    stage: 'parallelize',
    triedSet: ['acquisition:raw-http'],
    resumePoint: { branch: 'mitosis/core-integration', ref: 'sha1', stage: 'parallelize' },
  });
  const resume = selectResumeUnits(parked, new Map());
  assert.deepEqual(resume.map((u) => u.unitId), ['core', 'auth']);
  const core = resume.find((u) => u.unitId === 'core');
  assert.equal(core.stage, 'parallelize');
  assert.deepEqual(core.triedSet, ['acquisition:raw-http']);
  assert.deepEqual(core.resumePoint, { branch: 'mitosis/core-integration', ref: 'sha1', stage: 'parallelize' });
  assert.ok(!resume.some((u) => u.triedSet.includes('acquisition:raw-http') === false && u.unitId === 'core'));
});

test('selectResumeUnits: never re-touches a unit reconciled as shipped, even if it is still marked parked (6.2)', () => {
  const parked = park(manifestWith([
    { id: 'core' },
    { id: 'auth', dependsOn: ['core'] },
  ]), { unitId: 'core', stage: 'plan', triedSet: ['x:y'] });
  const shipped = new Map([['core', { prUrl: 'http://pr/core', mergedAt: '2026-07-10T00:00:00Z' }]]);
  const resume = selectResumeUnits(parked, shipped);
  assert.deepEqual(resume.map((u) => u.unitId), ['auth']);
});

test('selectResumeUnits: accepts a Map, a Set, or an array as the reconciled shipped-set', () => {
  const parked = park(manifestWith([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), { unitId: 'a', stage: 'plan' })
  const withB = park(parked, { unitId: 'b', stage: 'plan' });
  assert.deepEqual(selectResumeUnits(withB, new Set(['a'])).map((u) => u.unitId), ['b']);
  assert.deepEqual(selectResumeUnits(withB, ['b']).map((u) => u.unitId), ['a']);
  assert.deepEqual(selectResumeUnits(withB, null).map((u) => u.unitId), ['a', 'b']);
});

test('selectResumeUnits: a manifest with no parked units yields an empty resume set', () => {
  assert.deepEqual(selectResumeUnits(manifestWith([{ id: 'a', status: 'shipped' }]), new Map()), []);
});

function builtManifest(msps) {
  return { logicalRunId: 'deadbeef', sourcePrefix: 'mitosis', baseBranch: 'main', clusters: [msps.map((m) => m.id)], msps };
}

test('selectResumeBuilt: built units yield a ship-stage resume descriptor carrying the checkpoint ref, and parked units are ignored', () => {
  const manifest = builtManifest([
    { id: 'a', status: 'built', integrationBranch: 'mitosis/a-integration', checkpointRef: 'refs/mitosis/deadbeef/a' },
    { id: 'b', status: 'parked' },
    { id: 'c', status: 'planned' },
  ]);
  const resume = selectResumeBuilt(manifest, new Map());
  assert.deepEqual(resume, [{
    unitId: 'a',
    stage: 'ship',
    resumePoint: { branch: 'mitosis/a-integration', ref: 'refs/mitosis/deadbeef/a', stage: 'ship' },
  }]);
});

test('selectResumeBuilt: an already-shipped built unit is excluded from the resume set', () => {
  const manifest = builtManifest([{ id: 'a', status: 'built', integrationBranch: 'mitosis/a-integration', checkpointRef: 'refs/mitosis/deadbeef/a' }]);
  assert.deepEqual(selectResumeBuilt(manifest, new Set(['a'])), []);
});

function priorManifestWithHashes(defs) {
  return {
    logicalRunId: 'deadbeef',
    sourcePrefix: 'mitosis',
    baseBranch: 'main',
    clusters: [defs.map((d) => d.id)],
    msps: defs.map((d) => ({
      id: d.id,
      title: d.title ?? d.id,
      rationale: d.rationale ?? `rationale for ${d.id}`,
      status: 'built',
      integrationBranch: `mitosis/${d.id}-integration`,
      dependsOn: d.dependsOn ?? [],
      fileScope: d.fileScope ?? [`src/${d.id}.ts`],
      contentHash: 'contentHash' in d ? d.contentHash : mspContentHash({ id: d.id, title: d.title ?? d.id, rationale: d.rationale ?? `rationale for ${d.id}`, dependsOn: d.dependsOn ?? [], fileScope: d.fileScope ?? [`src/${d.id}.ts`] }),
    })),
  };
}

function freshMsp(id, overrides = {}) {
  return { id, title: id, rationale: `rationale for ${id}`, dependsOn: [], fileScope: [`src/${id}.ts`], ...overrides };
}

test('selectPreservedBuilt: a fresh MSP whose content hash matches the prior durable-built record replay-forward-skips at ship, carrying the reconstructed checkpoint ref', () => {
  const prior = priorManifestWithHashes([{ id: 'a' }, { id: 'b' }]);
  const fresh = [freshMsp('a'), freshMsp('b')];
  const preserved = selectPreservedBuilt(prior, fresh, ['a', 'b'], new Set());
  assert.deepEqual(preserved.map((r) => r.unitId).sort(), ['a', 'b']);
  const a = preserved.find((r) => r.unitId === 'a');
  assert.equal(a.stage, 'ship');
  assert.equal(a.built, true);
  assert.equal(a.resumePoint.stage, 'ship');
  assert.equal(a.resumePoint.branch, 'mitosis/a-integration');
  assert.equal(a.resumePoint.ref, checkpointRef('deadbeef', 'a'));
});

test('selectPreservedBuilt: editing MSP-K slice invalidates ONLY MSP-K — the changed unit is dropped, the unaffected sibling still replay-forward-skips', () => {
  const prior = priorManifestWithHashes([{ id: 'a' }, { id: 'b' }]);
  const fresh = [freshMsp('a', { title: 'a-EDITED' }), freshMsp('b')];
  const preserved = selectPreservedBuilt(prior, fresh, ['a', 'b'], new Set());
  assert.deepEqual(preserved.map((r) => r.unitId), ['b'], 'only the content-changed MSP is invalidated; the sibling is preserved');
});

test('selectPreservedBuilt: a malformed or absent prior per-MSP hash degrades ONLY that MSP, never the siblings', () => {
  const cases = [
    { label: 'absent', contentHash: undefined },
    { label: 'null', contentHash: null },
    { label: 'non-string number', contentHash: 1234 },
    { label: 'garbage string', contentHash: '!!!not-a-hash!!!' },
  ];
  for (const c of cases) {
    const prior = priorManifestWithHashes([{ id: 'a', contentHash: c.contentHash }, { id: 'b' }]);
    const fresh = [freshMsp('a'), freshMsp('b')];
    const preserved = selectPreservedBuilt(prior, fresh, ['a', 'b'], new Set());
    assert.deepEqual(preserved.map((r) => r.unitId), ['b'], `${c.label}: the malformed-hash MSP degrades to fresh, the sibling is preserved`);
  }
});

test('selectPreservedBuilt: a fresh MSP with no observed durable checkpoint ref (not in builtUnits) is never preserved even when its hash matches', () => {
  const prior = priorManifestWithHashes([{ id: 'a' }, { id: 'b' }]);
  const fresh = [freshMsp('a'), freshMsp('b')];
  const preserved = selectPreservedBuilt(prior, fresh, ['b'], new Set());
  assert.deepEqual(preserved.map((r) => r.unitId), ['b'], 'only a unit with a real observed durable checkpoint replay-forward-skips');
});

test('selectPreservedBuilt: an already-shipped fresh MSP is excluded from the preserved set', () => {
  const prior = priorManifestWithHashes([{ id: 'a' }, { id: 'b' }]);
  const fresh = [freshMsp('a'), freshMsp('b')];
  const preserved = selectPreservedBuilt(prior, fresh, ['a', 'b'], new Set(['a']));
  assert.deepEqual(preserved.map((r) => r.unitId), ['b']);
});

test('selectPreservedBuilt: a fresh MSP id absent from the prior manifest is never preserved (new ids build fresh)', () => {
  const prior = priorManifestWithHashes([{ id: 'a' }]);
  const fresh = [freshMsp('a'), freshMsp('z')];
  const preserved = selectPreservedBuilt(prior, fresh, ['a', 'z'], new Set());
  assert.deepEqual(preserved.map((r) => r.unitId), ['a']);
});

test('selectPreservedBuilt: tolerates a null prior manifest and a non-array fresh set without throwing', () => {
  assert.deepEqual(selectPreservedBuilt(null, [freshMsp('a')], ['a'], new Set()), []);
  assert.deepEqual(selectPreservedBuilt(priorManifestWithHashes([{ id: 'a' }]), null, ['a'], new Set()), []);
});
