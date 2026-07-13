import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makePublishIntent,
  appendIntent,
  markIntent,
  nextDrainAction,
  classifyDrainResult,
} from '../outbox.mjs';

const baseIntentArgs = {
  unitId: 'auth-core',
  head: 'mitosis/auth-core-integration',
  sha: 'a1b2c3d',
  base: 'main',
  title: 'Ship auth-core',
  body: 'Body with $(rm -rf ~) and `backticks` kept as data',
  mergePolicy: 'autonomous',
};

test('makePublishIntent returns a frozen SHA-pinned record with title/body stored as inert data', () => {
  const intent = makePublishIntent(baseIntentArgs);
  assert.ok(Object.isFrozen(intent));
  assert.equal(intent.unitId, 'auth-core');
  assert.equal(intent.sha, 'a1b2c3d');
  assert.equal(intent.state, 'pending');
  assert.equal(intent.title, 'Ship auth-core');
  assert.equal(intent.body, 'Body with $(rm -rf ~) and `backticks` kept as data');
});

test('makePublishIntent rejects an absent or malformed sha (pinned to a specific built commit, not latest head)', () => {
  assert.throws(() => makePublishIntent({ ...baseIntentArgs, sha: undefined }), /sha/);
  assert.throws(() => makePublishIntent({ ...baseIntentArgs, sha: '' }), /sha/);
  assert.throws(() => makePublishIntent({ ...baseIntentArgs, sha: 'xyz' }), /sha/);
  assert.throws(() => makePublishIntent({ ...baseIntentArgs, sha: 'A1B2C3D' }), /sha/);
  assert.throws(() => makePublishIntent({ ...baseIntentArgs, sha: 'a'.repeat(41) }), /sha/);
});

test('makePublishIntent rejects an unsafe unitId, head or base', () => {
  assert.throws(() => makePublishIntent({ ...baseIntentArgs, unitId: '../etc' }), /unitId/);
  assert.throws(() => makePublishIntent({ ...baseIntentArgs, head: '' }), /head/);
  assert.throws(() => makePublishIntent({ ...baseIntentArgs, base: '' }), /base/);
});

test('appendIntent immutably upserts a row keyed by unitId', () => {
  const i1 = makePublishIntent(baseIntentArgs);
  const i2 = makePublishIntent({ ...baseIntentArgs, unitId: 'billing', head: 'mitosis/billing-integration' });
  const o0 = [];
  const o1 = appendIntent(o0, i1);
  const o2 = appendIntent(o1, i2);
  assert.equal(o0.length, 0);
  assert.equal(o1.length, 1);
  assert.equal(o2.length, 2);
  assert.ok(Object.isFrozen(o2));
  const reEmit = makePublishIntent({ ...baseIntentArgs, sha: 'ffffff0' });
  const o3 = appendIntent(o2, reEmit);
  assert.equal(o3.length, 2, 're-emitting an intent for the same unit upserts rather than duplicating');
  assert.equal(o3.find((i) => i.unitId === 'auth-core').sha, 'ffffff0');
});

test('markIntent immutably transitions a row state and leaves the input outbox untouched', () => {
  const i1 = makePublishIntent(baseIntentArgs);
  const o1 = appendIntent([], i1);
  const o2 = markIntent(o1, 'auth-core', 'merged');
  assert.equal(o1[0].state, 'pending');
  assert.equal(o2[0].state, 'merged');
  assert.notEqual(o1, o2);
  assert.ok(Object.isFrozen(o2));
  assert.deepEqual(markIntent(o1, 'absent', 'merged').map((i) => i.state), ['pending']);
});

test('nextDrainAction: the drain state machine truth table', () => {
  assert.equal(nextDrainAction({}, { prState: 'none' }), 'create');
  assert.equal(nextDrainAction({}, { prState: 'open', ci: 'pending' }), 'wait');
  assert.equal(nextDrainAction({}, { prState: 'open', ci: 'green', baseMoved: true }), 'rebase');
  assert.equal(nextDrainAction({}, { prState: 'open', ci: 'green', baseMoved: false }), 'merge');
  assert.equal(nextDrainAction({}, { createError: '422-exists' }), 'adopt');
  assert.equal(nextDrainAction({}, { ci: 'red' }), 'eject');
  assert.equal(nextDrainAction({}, { prState: 'open', ci: 'red' }), 'eject');
});

test('nextDrainAction: an already-merged row is outbox-row-resumable and skips (no duplicate PR)', () => {
  assert.equal(nextDrainAction({}, { prState: 'merged' }), 'skip');
  assert.equal(nextDrainAction({ state: 'merged' }, { prState: 'open', ci: 'green', baseMoved: false }), 'skip');
});

test('nextDrainAction: never merges without positive CI-green + base-current evidence', () => {
  assert.equal(nextDrainAction({}, {}), 'wait');
  assert.equal(nextDrainAction({}, { prState: 'open' }), 'wait');
});

test('classifyDrainResult: only a verified read-back ships; unknown or failed ejects (verify-before-next)', () => {
  assert.deepEqual(classifyDrainResult({ merged: true, compare: { ahead_by: 0, status: 'identical' } }), { disposition: 'shipped', verdict: 'verified' });
  assert.deepEqual(classifyDrainResult({ merged: true, compare: null }), { disposition: 'eject', verdict: 'unknown' });
  assert.deepEqual(classifyDrainResult({ readError: 'http-404' }), { disposition: 'eject', verdict: 'unknown' });
  assert.deepEqual(classifyDrainResult({ merged: false, compare: { ahead_by: 0, status: 'identical' } }), { disposition: 'eject', verdict: 'failed' });
});

test('per-item isolation: draining [a green, b red, c green] ships a and c, ejects b with a reason', () => {
  const outbox = [
    makePublishIntent({ ...baseIntentArgs, unitId: 'a', head: 'mitosis/a-integration' }),
    makePublishIntent({ ...baseIntentArgs, unitId: 'b', head: 'mitosis/b-integration' }),
    makePublishIntent({ ...baseIntentArgs, unitId: 'c', head: 'mitosis/c-integration' }),
  ];
  const observedByUnit = {
    a: { prState: 'open', ci: 'green', baseMoved: false },
    b: { prState: 'open', ci: 'red' },
    c: { prState: 'open', ci: 'green', baseMoved: false },
  };
  const actions = outbox.map((i) => [i.unitId, nextDrainAction(i, observedByUnit[i.unitId])]);
  assert.deepEqual(actions, [['a', 'merge'], ['b', 'eject'], ['c', 'merge']]);
});
