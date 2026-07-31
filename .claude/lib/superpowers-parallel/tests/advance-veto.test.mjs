import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCE_VETOES, VETO_CONDEMNED, VETO_PARKED, advanceVeto, foldObservedStatus, vetoLogLine } from '../status-facts.mjs';

const RUN_ID = 'a1b2c3d4';

function manifestOf(msps) {
  return { logicalRunId: RUN_ID, sourcePrefix: 'mitosis', clusters: [], msps };
}

function observed(overrides = {}) {
  return {
    mergedIds: [],
    shippedMeta: new Map(),
    manifestUnitIds: new Set(),
    builtUnits: [],
    builtShas: {},
    logicalRunId: RUN_ID,
    ...overrides,
  };
}

test('exactly two vetoes are named, and they are the parked and condemned vetoes', () => {
  assert.equal(VETO_PARKED, 'parked');
  assert.equal(VETO_CONDEMNED, 'condemned');
  assert.deepEqual([...ADVANCE_VETOES], [VETO_PARKED, VETO_CONDEMNED]);
});

test('a veto name outside the named two is rejected rather than rendered as a line', () => {
  assert.throws(
    () => vetoLogLine('u', 'frozen', 'built'),
    /"frozen" is not an advance veto; exactly 2 vetoes may hold a forward advance \(parked, condemned\)/,
  );
});

test('advanceVeto names the parked veto for a unit parked at stage plan and nothing else', () => {
  assert.equal(advanceVeto({ status: 'parked', resumePoint: { stage: 'plan' }, condemned: false }), VETO_PARKED);
  assert.equal(advanceVeto({ status: 'parked', resumePoint: { stage: 'ship' }, condemned: false }), null);
  assert.equal(advanceVeto({ status: 'parked', resumePoint: null, condemned: false }), null);
  assert.equal(advanceVeto({ status: 'built', resumePoint: { stage: 'plan' }, condemned: false }), null);
  assert.equal(advanceVeto(), null);
});

test('advanceVeto names the condemned veto for a unit invalidated by a divergent parent merge', () => {
  assert.equal(advanceVeto({ status: 'built', resumePoint: null, condemned: true }), VETO_CONDEMNED);
  assert.equal(advanceVeto({ status: 'parked', resumePoint: { stage: 'plan' }, condemned: true }), VETO_CONDEMNED);
});

test('each named veto renders a line that carries the unit, the veto name, the advance it holds and what it does to the unit', () => {
  assert.equal(
    vetoLogLine('d', VETO_PARKED, 'built'),
    'mitosis[d]: reconcile — PARKED VETO holds the forward advance to built; the derived status is unchanged',
  );
  assert.equal(
    vetoLogLine('d', VETO_CONDEMNED, 'awaiting'),
    'mitosis[d]: reconcile — CONDEMNED VETO holds the forward advance to awaiting; the unit is reset to parked and rebuilds from plan',
  );
});

test('the parked veto emits its named line through the injected logger when it holds the built advance', () => {
  const lines = [];
  const prior = manifestOf([
    { id: 'd', status: 'parked', integrationBranch: 'mitosis/d-integration', builtSha: 'sha-old', resumePoint: { branch: 'mitosis/d-integration', ref: 'main', stage: 'plan' } },
  ]);
  const folded = foldObservedStatus(prior, observed({
    manifestUnitIds: new Set(['d']),
    builtUnits: ['d'],
    builtShas: { d: 'sha-new' },
    log: (line) => lines.push(line),
  }));

  assert.equal(folded.msps[0].status, 'parked');
  assert.deepEqual(lines, ['mitosis[d]: reconcile — PARKED VETO holds the forward advance to built; the derived status is unchanged']);
});

test('a unit whose built advance is not vetoed emits no veto line', () => {
  const lines = [];
  const prior = manifestOf([{ id: 'c', status: 'planned', integrationBranch: 'mitosis/c-integration' }]);
  const folded = foldObservedStatus(prior, observed({
    manifestUnitIds: new Set(['c']),
    builtUnits: ['c'],
    builtShas: { c: 'sha-c' },
    log: (line) => lines.push(line),
  }));

  assert.equal(folded.msps[0].status, 'built');
  assert.deepEqual(lines, []);
});
