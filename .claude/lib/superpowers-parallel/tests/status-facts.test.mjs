import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldObservedStatus } from '../status-facts.mjs';
import { statusFoldCases } from './status-fold-cases.mjs';

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
