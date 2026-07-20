import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shippedOutcome, haltedOutcome, crashedOutcome, quarantinedOutcome,
  computeOverallStatus, partitionOutcomes,
} from '../outcome.mjs';

test('outcome constructors tag kind and carry identity', () => {
  assert.deepEqual(shippedOutcome('m0', { prUrl: 'u', receiptsPass: true, d6Pass: true }),
    { kind: 'shipped', mspId: 'm0', prUrl: 'u', receiptsPass: true, d6Pass: true });
  assert.deepEqual(haltedOutcome('m1', 'ship', 'gate red'),
    { kind: 'halted', mspId: 'm1', stage: 'ship', reason: 'gate red' });
  assert.deepEqual(crashedOutcome('m2', 'cluster', 'thunk died'),
    { kind: 'crashed', mspId: 'm2', stage: 'cluster', error: 'thunk died' });
  assert.deepEqual(quarantinedOutcome('m3', 'execute', 'boom', 3),
    { kind: 'quarantined', mspId: 'm3', stage: 'execute', error: 'boom', retries: 3 });
});

test('all-shipped requires every MSP shipped and no crashed/quarantined', () => {
  assert.equal(computeOverallStatus({ shipped: [1, 2], crashed: [], quarantined: [], total: 2 }), 'all-shipped');
});

test('any crashed unit forbids all-shipped even if some shipped', () => {
  assert.equal(computeOverallStatus({ shipped: [1], crashed: [1], quarantined: [], total: 2 }), 'partial');
});

test('any quarantined unit forbids all-shipped', () => {
  assert.equal(computeOverallStatus({ shipped: [1, 2], crashed: [], quarantined: [1], total: 3 }), 'partial');
});

test('nothing shipped is failed', () => {
  assert.equal(computeOverallStatus({ shipped: [], crashed: [1], quarantined: [], total: 1 }), 'failed');
  assert.equal(computeOverallStatus({ shipped: [], crashed: [], quarantined: [], total: 0 }), 'failed');
});

test('partitionOutcomes splits by kind and computes overallStatus against total', () => {
  const outcomes = [
    shippedOutcome('a', { prUrl: 'ua' }),
    haltedOutcome('b', 'ship', 'gate red'),
    crashedOutcome('c', 'cluster', 'died'),
  ];
  const part = partitionOutcomes(outcomes, 3);
  assert.deepEqual(part.shipped.map((o) => o.mspId), ['a']);
  assert.deepEqual(part.halted.map((o) => o.mspId), ['b']);
  assert.deepEqual(part.crashed.map((o) => o.mspId), ['c']);
  assert.deepEqual(part.quarantined, []);
  assert.equal(part.overallStatus, 'partial');
});

test('partitionOutcomes defaults total to the outcome count', () => {
  const part = partitionOutcomes([shippedOutcome('a'), shippedOutcome('b')]);
  assert.equal(part.overallStatus, 'all-shipped');
});

test('partitionOutcomes rejects an unknown outcome kind', () => {
  assert.throws(() => partitionOutcomes([{ kind: 'bogus', mspId: 'x' }]), /unknown outcome kind/);
});

import { fatalReport } from '../outcome.mjs';

test('fatalReport is a failed partition carrying stage and detail', () => {
  const r = fatalReport('input', 'args is not valid JSON', 0);
  assert.equal(r.overallStatus, 'failed');
  assert.deepEqual(r.shipped, []);
  assert.deepEqual(r.crashed, []);
  assert.equal(r.stage, 'input');
  assert.equal(r.detail, 'args is not valid JSON');
  assert.equal(r.mspCount, 0);
});

test('fatalReport with crashed:true records a crashed outcome (Decompose/Prepare crash)', () => {
  const r = fatalReport('decompose', 'agent() returned null', 0, { crashed: true });
  assert.equal(r.overallStatus, 'failed');
  assert.deepEqual(r.crashed.map((o) => o.stage), ['decompose']);
  assert.equal(r.stage, 'decompose');
});

test('quarantinedOutcome carries an optional redrive hint only when provided', () => {
  assert.deepEqual(quarantinedOutcome('m3', 'execute', 'boom', 3),
    { kind: 'quarantined', mspId: 'm3', stage: 'execute', error: 'boom', retries: 3 });
  assert.deepEqual(quarantinedOutcome('m3', 'execute', 'boom', 3, { branch: 'x-integration', ref: 'main', stage: 'execute' }),
    { kind: 'quarantined', mspId: 'm3', stage: 'execute', error: 'boom', retries: 3, redrive: { branch: 'x-integration', ref: 'main', stage: 'execute' } });
});
