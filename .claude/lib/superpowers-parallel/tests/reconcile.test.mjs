import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRemaining, reconcileBuiltSet, mergePaginated } from '../reconcile.mjs';

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
