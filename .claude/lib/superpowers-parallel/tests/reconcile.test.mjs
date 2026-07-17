import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRemaining, reconcileBuiltSet, mergePaginated, planReconcile, shouldReconcileOnly } from '../reconcile.mjs';

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

test('shouldReconcileOnly: trips ONLY when the flag is on AND it is a byte-identical relaunch AND persisted frontier state exists', () => {
  assert.equal(shouldReconcileOnly({ frontierTrain: true, isRelaunch: true, specByteIdentical: true, hasFrontierState: true }), true);
  assert.equal(shouldReconcileOnly({ frontierTrain: false, isRelaunch: true, specByteIdentical: true, hasFrontierState: true }), false);
  assert.equal(shouldReconcileOnly({ frontierTrain: true, isRelaunch: false, specByteIdentical: true, hasFrontierState: true }), false);
  assert.equal(shouldReconcileOnly({ frontierTrain: true, isRelaunch: true, specByteIdentical: false, hasFrontierState: true }), false);
  assert.equal(shouldReconcileOnly({ frontierTrain: true, isRelaunch: true, specByteIdentical: true, hasFrontierState: false }), false);
});

test('shouldReconcileOnly: fails closed on absent or non-boolean input (never trips reconcile-only by accident)', () => {
  assert.equal(shouldReconcileOnly(), false);
  assert.equal(shouldReconcileOnly({}), false);
  assert.equal(shouldReconcileOnly({ frontierTrain: 'yes', isRelaunch: 1, specByteIdentical: 1, hasFrontierState: 1 }), false);
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

test('planReconcile: divergent-invalidation parks exactly the true descendant subtree and flags a build run — it NEVER rebuilds', () => {
  const manifest = { window: 3, msps: [
    { id: 'root', status: 'shipped', dependsOn: [], builtSha: 'r-built' },
    { id: 'a', status: 'built', dependsOn: ['root'], builtSha: 'a0' },
    { id: 'b', status: 'built', dependsOn: ['a'], builtSha: 'b0' },
  ] };
  const plan = planReconcile(manifest, { merged: ['root'], mergedShas: { root: 'r-merged-diverged' } });
  assert.deepEqual([...plan.toParkSubtree].sort(), ['a', 'b']);
  assert.equal(plan.buildRunNeeded, true);
  assert.deepEqual(plan.toOpen, []);
  assert.deepEqual(plan.toRestack, []);
  assert.ok(!('toBuild' in plan) && !('toRebuild' in plan), 'reconcile-only emits no rebuild directive');
});

test('planReconcile: a content-preserving squash (merged sha equals the built tip) invalidates nothing and lets the next layer open', () => {
  const manifest = { window: 3, msps: [
    { id: 'root', status: 'shipped', dependsOn: [], builtSha: 'r-built' },
    { id: 'a', status: 'built', dependsOn: ['root'], builtSha: 'a0' },
    { id: 'b', status: 'built', dependsOn: ['a'], builtSha: 'b0' },
  ] };
  const plan = planReconcile(manifest, { merged: ['root'], mergedShas: { root: 'r-built' } });
  assert.deepEqual(plan.toParkSubtree, []);
  assert.equal(plan.buildRunNeeded, false);
  assert.deepEqual(plan.toOpen, ['a']);
});

test('planReconcile: an unknown parent built tip (absent builtSha) fails closed — the subtree parks rather than assuming a clean merge', () => {
  const manifest = { window: 3, msps: [
    { id: 'root', status: 'shipped', dependsOn: [] },
    { id: 'a', status: 'built', dependsOn: ['root'], builtSha: 'a0' },
  ] };
  const plan = planReconcile(manifest, { merged: ['root'], mergedShas: { root: 'whatever' } });
  assert.deepEqual(plan.toParkSubtree, ['a']);
  assert.equal(plan.buildRunNeeded, true);
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
