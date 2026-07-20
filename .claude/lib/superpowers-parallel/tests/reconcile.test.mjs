import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRemaining, reconcileBuiltSet, reconcileBuiltShas, mergePaginated, planReconcile, assembleDivergenceVerdicts, shouldReconcileOnly, hasBuildableWork } from '../reconcile.mjs';

test('computeRemaining: remaining = planned - (merged U built U parked), keyed by unitId', () => {
  const r = computeRemaining({ planned: ['a', 'b', 'c', 'd'], merged: ['a'], built: ['b'], parked: ['c'] });
  assert.deepEqual(r.remaining, ['d']);
  assert.deepEqual(r.skipMerged, ['a']);
  assert.deepEqual(r.resumeBuilt, ['b']);
  assert.deepEqual(r.resumeParked, ['c']);
});

test('computeRemaining: precedence merged > built > parked (a merged unit is never re-shipped even with a stale checkpoint ref)', () => {
  const r = computeRemaining({ planned: ['a'], merged: ['a'], built: ['a'], parked: ['a'] });
  assert.deepEqual(r.skipMerged, ['a']);
  assert.deepEqual(r.resumeBuilt, []);
  assert.deepEqual(r.resumeParked, []);
  assert.deepEqual(r.remaining, []);
});

test('computeRemaining: built beats parked when a unit is in both', () => {
  const r = computeRemaining({ planned: ['a'], merged: [], built: ['a'], parked: ['a'] });
  assert.deepEqual(r.resumeBuilt, ['a']);
  assert.deepEqual(r.resumeParked, []);
});

test('computeRemaining: the four sets are disjoint and cover exactly the planned units', () => {
  const planned = ['a', 'b', 'c', 'd', 'e'];
  const r = computeRemaining({ planned, merged: ['a', 'b'], built: ['c'], parked: ['d'] });
  const union = [...r.skipMerged, ...r.resumeBuilt, ...r.resumeParked, ...r.remaining].sort();
  assert.deepEqual(union, [...planned].sort());
});

test('computeRemaining: tolerant of missing/non-array inputs', () => {
  const r = computeRemaining({ planned: ['a'] });
  assert.deepEqual(r.remaining, ['a']);
  assert.deepEqual(computeRemaining(), { remaining: [], skipMerged: [], resumeBuilt: [], resumeParked: [] });
});

test('reconcileBuiltSet: maps checkpoint refs to unitIds for the matching runId and rejects foreign runIds', () => {
  const refs = [
    'refs/mitosis/a1b2c3d4/auth-core',
    'refs/mitosis/a1b2c3d4/billing',
    'refs/mitosis/deadbeef/other',
    'refs/heads/main',
  ];
  assert.deepEqual(reconcileBuiltSet(refs, 'a1b2c3d4'), ['auth-core', 'billing']);
});

test('reconcileBuiltSet: parses raw ls-remote sha\\tref lines and dedups', () => {
  const lines = [
    '9f8e7d6c5b4a\trefs/mitosis/a1b2c3d4/auth-core',
    '1122334455667\trefs/mitosis/a1b2c3d4/auth-core',
    'aabbccddeeff\trefs/mitosis/a1b2c3d4/billing',
  ];
  assert.deepEqual(reconcileBuiltSet(lines, 'a1b2c3d4'), ['auth-core', 'billing']);
});

test('reconcileBuiltSet: non-array input yields an empty set', () => {
  assert.deepEqual(reconcileBuiltSet(null, 'a1b2c3d4'), []);
});

test('reconcileBuiltShas: keeps the sha column reconcileBuiltSet discards, mapping each unitId to its durable ref tip (first-seen wins, foreign runIds and ref-only lines dropped)', () => {
  const lines = [
    '9f8e7d6c5b4a\trefs/mitosis/a1b2c3d4/auth-core',
    '1122334455667\trefs/mitosis/a1b2c3d4/auth-core',
    'aabbccddeeff\trefs/mitosis/a1b2c3d4/billing',
    'deadbeef0000\trefs/mitosis/deadbeef/other',
    'refs/mitosis/a1b2c3d4/no-sha-column',
  ];
  assert.deepEqual(reconcileBuiltShas(lines, 'a1b2c3d4'), { 'auth-core': '9f8e7d6c5b4a', billing: 'aabbccddeeff' });
});

test('reconcileBuiltShas: non-array input yields an empty map', () => {
  assert.deepEqual(reconcileBuiltShas(null, 'a1b2c3d4'), {});
});

test('mergePaginated: concatenates every page in order so no page is truncated', () => {
  const page1 = Array.from({ length: 100 }, (_, i) => `p1-${i}`);
  const page2 = Array.from({ length: 100 }, (_, i) => `p2-${i}`);
  const page3 = ['p3-0'];
  const all = mergePaginated([page1, page2, page3]);
  assert.equal(all.length, 201);
  assert.equal(all[0], 'p1-0');
  assert.equal(all[100], 'p2-0');
  assert.equal(all[200], 'p3-0');
});

test('mergePaginated: tolerant of empty or non-array pages', () => {
  assert.deepEqual(mergePaginated([]), []);
  assert.deepEqual(mergePaginated([['a'], null, ['b']]), ['a', 'b']);
  assert.deepEqual(mergePaginated(null), []);
});

test('shouldReconcileOnly: trips ONLY when it is a byte-identical relaunch AND persisted frontier state exists AND no buildable work remains', () => {
  assert.equal(shouldReconcileOnly({ isRelaunch: true, specByteIdentical: true, hasFrontierState: true, buildableWorkRemains: false }), true);
  assert.equal(shouldReconcileOnly({ isRelaunch: false, specByteIdentical: true, hasFrontierState: true, buildableWorkRemains: false }), false);
  assert.equal(shouldReconcileOnly({ isRelaunch: true, specByteIdentical: false, hasFrontierState: true, buildableWorkRemains: false }), false);
  assert.equal(shouldReconcileOnly({ isRelaunch: true, specByteIdentical: true, hasFrontierState: false, buildableWorkRemains: false }), false);
});

test('shouldReconcileOnly: falls through to the build path whenever buildable work remains (a planned or parked unit), never freezing in reconcile-only', () => {
  assert.equal(shouldReconcileOnly({ isRelaunch: true, specByteIdentical: true, hasFrontierState: true, buildableWorkRemains: true }), false);
  assert.equal(shouldReconcileOnly({ isRelaunch: true, specByteIdentical: true, hasFrontierState: true }), false);
});

test('hasBuildableWork: true when any msp is neither built nor shipped (planned or parked counts as buildable), false when every unit is built/shipped', () => {
  assert.equal(hasBuildableWork({ msps: [{ id: 'a', status: 'built' }, { id: 'b', status: 'shipped' }] }), false);
  assert.equal(hasBuildableWork({ msps: [{ id: 'a', status: 'built' }, { id: 'b', status: 'planned' }] }), true);
  assert.equal(hasBuildableWork({ msps: [{ id: 'a', status: 'built' }, { id: 'b', status: 'parked' }] }), true);
  assert.equal(hasBuildableWork({ msps: [] }), false);
});

test('hasBuildableWork: fails TOWARD work (true) on a malformed or missing manifest — an unreadable manifest must never be the value that SATISFIES the reconcile-only gate and freezes the run', () => {
  assert.equal(hasBuildableWork(null), true);
  assert.equal(hasBuildableWork({}), true);
  assert.equal(hasBuildableWork([]), true);
});

test('shouldReconcileOnly: fails closed on absent or non-boolean input (never trips reconcile-only by accident)', () => {
  assert.equal(shouldReconcileOnly(), false);
  assert.equal(shouldReconcileOnly({}), false);
  assert.equal(shouldReconcileOnly({ isRelaunch: 1, specByteIdentical: 1, hasFrontierState: 1, buildableWorkRemains: false }), false);
});

test('planReconcile: opens the next-layer PR for a built-unpublished unit whose parents all merged, and restacks a unit with only some parents merged', () => {
  const manifest = { window: 3, msps: [
    { id: 'p1', status: 'shipped', dependsOn: [] },
    { id: 'p2', status: 'built', dependsOn: ['p1'], builtSha: 'p2sha' },
    { id: 'child', status: 'built', dependsOn: ['p1', 'p2'], builtSha: 'c0' },
  ] };
  const plan = planReconcile(manifest, { merged: [], published: [] });
  assert.deepEqual(plan.toOpen, ['p2']);
  assert.deepEqual(plan.toRestack, ['child']);
  assert.deepEqual(plan.toParkSubtree, []);
  assert.equal(plan.buildRunNeeded, false);
});

test('planReconcile: a built branch that already has an open PR is frozen — never re-opened or restacked', () => {
  const manifest = { window: 3, msps: [
    { id: 'p1', status: 'shipped', dependsOn: [] },
    { id: 'pub', status: 'built', dependsOn: ['p1'], builtSha: 'x' },
  ] };
  const plan = planReconcile(manifest, { merged: [], published: ['pub'] });
  assert.deepEqual(plan.toOpen, []);
  assert.deepEqual(plan.toRestack, []);
});

function divergenceManifest(rootOverrides = {}) {
  return { window: 3, msps: [
    { id: 'root', status: 'shipped', dependsOn: [], builtSha: 'r-built', fileScope: ['scope/root/**'], ...rootOverrides },
    { id: 'a', status: 'built', dependsOn: ['root'], builtSha: 'a0' },
    { id: 'b', status: 'built', dependsOn: ['a'], builtSha: 'b0' },
  ] };
}

test('planReconcile: a divergent probe (non-empty changed paths in the parent scope) parks exactly the true descendant subtree and flags a build run — it NEVER rebuilds', () => {
  const plan = planReconcile(divergenceManifest(), { merged: ['root'], mergedShas: { root: 'r-merged' }, divergenceProbes: { root: { paths: ['scope/root/reviewer-amended.txt'], error: null } } });
  assert.deepEqual([...plan.toParkSubtree].sort(), ['a', 'b']);
  assert.equal(plan.buildRunNeeded, true);
  assert.deepEqual(plan.toOpen, []);
  assert.deepEqual(plan.toRestack, []);
  assert.ok(!('toBuild' in plan) && !('toRebuild' in plan), 'reconcile-only emits no rebuild directive');
});

test('planReconcile: a divergent parent NEVER re-parks an already-done descendant — only the still-built part of the subtree is invalidated', () => {
  const manifest = { window: 3, msps: [
    { id: 'p', status: 'shipped', dependsOn: [], builtSha: 'p-built', fileScope: ['scope/p/**'] },
    { id: 'c1', status: 'shipped', dependsOn: ['p'], builtSha: 'c1-built' },
    { id: 'c2', status: 'built', dependsOn: ['p'], builtSha: 'c2-built' },
  ] };
  const plan = planReconcile(manifest, {
    merged: ['p'],
    mergedShas: { p: 'p-merged' },
    divergenceProbes: { p: { paths: ['scope/p/reviewer-amended.txt'], error: null } },
  });
  assert.deepEqual(plan.toParkSubtree, ['c2'], 'c1 already MERGED to the base — condemning and rebuilding it would re-ship merged content; only the still-built c2 is invalidated');
  assert.equal(plan.buildRunNeeded, true, 'a non-empty park subtree still flags the follow-up build run');
});

test('planReconcile: a clean probe (no changed paths in the parent scope) invalidates nothing even when the raw merge SHA differs from the built tip, and lets the next layer open', () => {
  const plan = planReconcile(divergenceManifest(), { merged: ['root'], mergedShas: { root: 'r-squash-rewritten' }, divergenceProbes: { root: { paths: [], error: null } } });
  assert.deepEqual(plan.toParkSubtree, []);
  assert.equal(plan.buildRunNeeded, false);
  assert.deepEqual(plan.toOpen, ['a']);
});

test('planReconcile: fail-closed matrix — a merged parent gating a built subtree parks that subtree whenever the divergence oracle is anything but a clean probe (missing sha / missing scope / missing verdict / probe failure)', () => {
  const cases = [
    { label: 'absent parent builtSha', root: { builtSha: undefined }, live: { mergedShas: { root: 'r-merged' }, divergenceProbes: { root: { paths: [], error: null } } } },
    { label: 'empty parent builtSha', root: { builtSha: '' }, live: { mergedShas: { root: 'r-merged' }, divergenceProbes: { root: { paths: [], error: null } } } },
    { label: 'missing parent fileScope', root: { fileScope: [] }, live: { mergedShas: { root: 'r-merged' }, divergenceProbes: { root: { paths: [], error: null } } } },
    { label: 'unknown merged sha (absent from mergedShas)', root: {}, live: { mergedShas: {}, divergenceProbes: { root: { paths: [], error: null } } } },
    { label: 'null merged sha', root: {}, live: { mergedShas: { root: null }, divergenceProbes: { root: { paths: [], error: null } } } },
    { label: 'empty merged sha', root: {}, live: { mergedShas: { root: '' }, divergenceProbes: { root: { paths: [], error: null } } } },
    { label: 'missing verdict (no probe supplied)', root: {}, live: { mergedShas: { root: 'r-merged' } } },
    { label: 'probe failure (paths null + error)', root: {}, live: { mergedShas: { root: 'r-merged' }, divergenceProbes: { root: { paths: null, error: 'ref unresolved' } } } },
    { label: 'probe non-object', root: {}, live: { mergedShas: { root: 'r-merged' }, divergenceProbes: { root: 'garbage' } } },
  ];
  for (const c of cases) {
    const plan = planReconcile(divergenceManifest(c.root), { merged: ['root'], ...c.live });
    assert.deepEqual([...plan.toParkSubtree].sort(), ['a', 'b'], `${c.label}: parks the whole built subtree`);
    assert.equal(plan.buildRunNeeded, true, `${c.label}: flags a build run`);
    assert.deepEqual(plan.toOpen, [], `${c.label}: opens nothing`);
    assert.deepEqual(plan.toRestack, [], `${c.label}: restacks nothing`);
  }
});

test('assembleDivergenceVerdicts: NEED-KEYED — probes only a merged parent that gates at least one still-built dependent, and returns the fail-closed verdict per parent', () => {
  const manifest = { window: 3, msps: [
    { id: 'gates-built', status: 'shipped', dependsOn: [], builtSha: 'g-built', fileScope: ['scope/g/**'] },
    { id: 'child', status: 'built', dependsOn: ['gates-built'], builtSha: 'c0', fileScope: ['scope/c/**'] },
    { id: 'no-built-dep', status: 'shipped', dependsOn: [], builtSha: 'n-built', fileScope: ['scope/n/**'] },
    { id: 'done-child', status: 'shipped', dependsOn: ['no-built-dep'], builtSha: 'd0', fileScope: ['scope/d/**'] },
  ] };
  const verdicts = assembleDivergenceVerdicts(manifest, {
    merged: ['gates-built', 'no-built-dep'],
    mergedShas: { 'gates-built': 'g-merged', 'no-built-dep': 'n-merged' },
    divergenceProbes: { 'gates-built': { paths: [], error: null }, 'no-built-dep': { paths: ['scope/n/x'], error: null } },
  });
  assert.deepEqual(Object.keys(verdicts), ['gates-built'], 'a merged parent with no still-built dependent is not keyed at all (its divergence cannot invalidate anything)');
  assert.equal(verdicts['gates-built'], 'clean');
});

test('planReconcile: folds review events through the AIMD window (approve opens, changes-requested slams)', () => {
  assert.equal(planReconcile({ window: 3, msps: [] }, { events: ['approved', 'approved'] }).nextW, 5);
  assert.equal(planReconcile({ window: 8, msps: [] }, { events: ['changes-requested'] }).nextW, 4);
  assert.equal(planReconcile({ window: 3, msps: [] }, {}).nextW, 3);
});

test('planReconcile: fails closed on a malformed manifest — empty advance, no rebuild, window clamped to the floor', () => {
  assert.deepEqual(planReconcile(null, { merged: ['x'] }), { toRestack: [], toOpen: [], toParkSubtree: [], nextW: 3, buildRunNeeded: false });
  assert.deepEqual(planReconcile({ msps: 'nope' }), { toRestack: [], toOpen: [], toParkSubtree: [], nextW: 3, buildRunNeeded: false });
});

test('planReconcile: never mutates the input manifest', () => {
  const manifest = { window: 3, msps: [
    { id: 'root', status: 'shipped', dependsOn: [], builtSha: 'r' },
    { id: 'a', status: 'built', dependsOn: ['root'], builtSha: 'a0' },
  ] };
  const snapshot = JSON.stringify(manifest);
  planReconcile(manifest, { merged: ['root'], mergedShas: { root: 'diverged' } });
  assert.equal(JSON.stringify(manifest), snapshot);
});

test('planReconcile: a null / array / non-object live is normalized to a safe snapshot and never dereferenced raw (fail closed, not crash)', () => {
  const manifest = { window: 3, msps: [
    { id: 'root', status: 'shipped', dependsOn: [] },
    { id: 'a', status: 'built', dependsOn: ['root'], builtSha: 'a0' },
  ] };
  const expected = { toRestack: [], toOpen: ['a'], toParkSubtree: [], nextW: 3, buildRunNeeded: false };
  assert.deepEqual(planReconcile(manifest, null), expected);
  assert.deepEqual(planReconcile(manifest, ['root']), expected);
  assert.deepEqual(planReconcile(manifest, 'garbage'), expected);
});

