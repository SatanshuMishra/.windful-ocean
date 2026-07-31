import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBuiltTransition } from '../recovery.mjs';
import { checkpointRef } from '../checkpoint.mjs';
import { foldObservedStatus } from '../status-facts.mjs';
import { statusFoldCases } from './status-fold-cases.mjs';

test('the characterization table covers the ship fold, the built rescue, the parked-at-plan veto and the absent-unit drop', () => {
  const names = statusFoldCases().map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length, 'each characterized shape must be named uniquely');
  assert.ok(names.length >= 5, `expected at least the five characterized shapes, found ${names.length}`);
});

for (const shape of statusFoldCases()) {
  test(`foldObservedStatus reproduces the characterized fold — ${shape.name}`, () => {
    assert.deepEqual(foldObservedStatus(shape.prior, shape.observed), shape.expected);
  });
}

test('foldObservedStatus leaves the prior manifest and its msps untouched', () => {
  const shape = statusFoldCases()[0];
  const priorSnapshot = JSON.parse(JSON.stringify(shape.prior));
  foldObservedStatus(shape.prior, shape.observed);
  assert.deepEqual(shape.prior, priorSnapshot);
});

test('the parked-at-plan veto is what withholds the built transition, not a missing checkpoint ref', () => {
  const shape = statusFoldCases().find((entry) => entry.prior.msps.some((m) => m.status === 'parked'));
  assert.ok(shape, 'the characterization table must carry a parked-at-plan shape');
  const vetoed = foldObservedStatus(shape.prior, shape.observed).msps.find((m) => m.id === 'd');
  assert.equal(vetoed.status, 'parked');
  assert.equal(Object.hasOwn(vetoed, 'checkpointRef'), false, 'the vetoed unit is never given a checkpoint ref, so nothing downstream can ship-restore it');
  assert.deepEqual(vetoed.resumePoint, { branch: 'mitosis/d-integration', ref: 'main', stage: 'plan' }, 'the veto leaves the resumePoint intact so the unit relaunches from plan');

  const unvetoed = applyBuiltTransition(shape.prior, {
    unitId: 'd',
    checkpointRef: checkpointRef(shape.observed.logicalRunId, 'd'),
    sha: shape.observed.builtShas.d,
    green: undefined,
    builtAgainst: undefined,
  }).msps.find((m) => m.id === 'd');
  assert.equal(unvetoed.status, 'built', 'without the veto the same inputs flip the parked unit straight back to built');
  assert.equal(unvetoed.checkpointRef, 'refs/mitosis/a1b2c3d4/d');
  assert.equal(unvetoed.resumePoint, null);
});

test('a throwing log sink does not discard the transitions the fold already computed', () => {
  const vetoed = statusFoldCases().find((entry) => entry.prior.msps.some((m) => m.status === 'parked'));
  const rescued = statusFoldCases().find((entry) => entry.observed.builtUnits.includes('c'));
  assert.ok(vetoed && rescued, 'the characterization table must carry a parked-at-plan shape and a built-rescue shape');

  const folded = foldObservedStatus(
    { ...vetoed.prior, msps: [...vetoed.prior.msps, ...rescued.prior.msps] },
    {
      mergedIds: [],
      shippedMeta: new Map(),
      manifestUnitIds: new Set(['d', 'c']),
      builtUnits: ['d', 'c'],
      builtShas: { d: 'sha-d-new', c: 'sha-c' },
      logicalRunId: 'a1b2c3d4',
      log: () => {
        throw new Error('the log sink is down');
      },
    },
  );

  assert.deepEqual(folded, { ...vetoed.expected, msps: [...vetoed.expected.msps, ...rescued.expected.msps] });
});

test('foldObservedStatus returns the null prior unchanged when no merged id and no built unit is observed', () => {
  const folded = foldObservedStatus(null, {
    mergedIds: [],
    shippedMeta: new Map(),
    manifestUnitIds: new Set(),
    builtUnits: [],
    builtShas: {},
    logicalRunId: 'a1b2c3d4',
  });
  assert.equal(folded, null);
});
