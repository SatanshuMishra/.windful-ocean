import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAuthoritativeConstants, detectTaskModelDrift } from '../authoritative-constants.mjs';

const authoritative = {
  baseBranch: 'mitosis/cluster-a/integration',
  isolation: 'worktree',
  branchPrefix: 'mitosis/cluster-a',
  models: { review: 'opus', security: 'opus' },
};

function echoedBase(overrides) {
  return {
    baseBranch: authoritative.baseBranch,
    isolation: authoritative.isolation,
    branchPrefix: authoritative.branchPrefix,
    models: { review: 'opus', security: 'opus' },
    tasks: {},
    waves: [],
    ...overrides,
  };
}

test('a corrupt hand-copied scalar constant is overwritten with the authoritative value and reported as drift', () => {
  const echoed = echoedBase({ baseBranch: 'WRONG-BASE' });
  const { engineArgs, drift } = reconcileAuthoritativeConstants(echoed, authoritative);
  assert.equal(engineArgs.baseBranch, authoritative.baseBranch);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].field, 'baseBranch');
  assert.equal(drift[0].echoed, 'WRONG-BASE');
  assert.equal(drift[0].authoritative, authoritative.baseBranch);
});

test('an altered echoed models map is overwritten with the operator-authoritative map and reported', () => {
  const echoed = echoedBase({ models: { review: 'sonnet' } });
  const { engineArgs, drift } = reconcileAuthoritativeConstants(echoed, authoritative);
  assert.deepEqual(engineArgs.models, authoritative.models);
  assert.ok(drift.some((d) => d.field === 'models'));
});

test('multiple simultaneously drifted constants are all overwritten and each reported once', () => {
  const echoed = echoedBase({ isolation: 'scope-fence', branchPrefix: 'wrong/prefix' });
  const { engineArgs, drift } = reconcileAuthoritativeConstants(echoed, authoritative);
  assert.equal(engineArgs.isolation, 'worktree');
  assert.equal(engineArgs.branchPrefix, authoritative.branchPrefix);
  const fields = drift.map((d) => d.field).sort();
  assert.deepEqual(fields, ['branchPrefix', 'isolation']);
});

test('matching constants produce no drift and preserve the echoed structural payload', () => {
  const echoed = echoedBase({ tasks: { t1: { id: 't1' } }, waves: [['t1']] });
  const { engineArgs, drift } = reconcileAuthoritativeConstants(echoed, authoritative);
  assert.deepEqual(drift, []);
  assert.equal(engineArgs.baseBranch, authoritative.baseBranch);
  assert.deepEqual(engineArgs.tasks, { t1: { id: 't1' } });
  assert.deepEqual(engineArgs.waves, [['t1']]);
});

test('reconcile does not mutate the caller-supplied echoed object', () => {
  const echoed = echoedBase({ baseBranch: 'WRONG-BASE' });
  reconcileAuthoritativeConstants(echoed, authoritative);
  assert.equal(echoed.baseBranch, 'WRONG-BASE');
});

test('detectTaskModelDrift flags a per-task model that disagrees with the engine-authored policy model', () => {
  const tasks = { t1: { id: 't1', model: 'sonnet' }, t2: { id: 't2', model: 'opus' } };
  const drift = detectTaskModelDrift(tasks, () => 'opus');
  assert.equal(drift.length, 1);
  assert.equal(drift[0].field, 'tasks.t1.model');
  assert.equal(drift[0].echoed, 'sonnet');
  assert.equal(drift[0].authoritative, 'opus');
});

test('detectTaskModelDrift ignores tasks that echoed no model (nothing to reconcile against)', () => {
  const tasks = { t1: { id: 't1' }, t2: { id: 't2', model: null } };
  const drift = detectTaskModelDrift(tasks, () => 'opus');
  assert.deepEqual(drift, []);
});
