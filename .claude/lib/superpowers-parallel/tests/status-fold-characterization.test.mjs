import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyShipTransition, applyBuiltTransition } from '../recovery.mjs';
import { checkpointRef } from '../checkpoint.mjs';
import { statusFoldCases } from './status-fold-cases.mjs';

function foldAsWrittenBeforeExtraction(priorManifest, { mergedIds, shippedMeta, manifestUnitIds, builtUnits, builtShas, logicalRunId }) {
  const shippedFoldedManifest = mergedIds.reduce((mani, mspId) => {
    const meta = shippedMeta.get(mspId) || null;
    return applyShipTransition(mani, { mspId, prUrl: meta ? meta.prUrl : null, mergedAt: meta ? meta.mergedAt : null, title: null, rationale: null });
  }, priorManifest);
  return builtUnits
    .filter((unitId) => manifestUnitIds.has(unitId))
    .reduce((mani, unitId) => {
      const existing = mani.msps.find((m) => m.id === unitId);
      if (existing && existing.status === 'parked' && existing.resumePoint && existing.resumePoint.stage === 'plan') return mani;
      return applyBuiltTransition(mani, {
        unitId,
        checkpointRef: checkpointRef(logicalRunId, unitId),
        sha: builtShas[unitId] ?? (existing && typeof existing.builtSha === 'string' ? existing.builtSha : null),
        green: existing ? existing.green : undefined,
        builtAgainst: existing ? existing.builtAgainst : undefined,
      });
    }, shippedFoldedManifest);
}

test('the characterization table covers the ship fold, the built rescue, the parked-at-plan veto and the absent-unit drop', () => {
  const names = statusFoldCases().map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length, 'each characterized shape must be named uniquely');
  assert.ok(names.length >= 5, `expected at least the five characterized shapes, found ${names.length}`);
});

for (const shape of statusFoldCases()) {
  test(`reconcile status fold — ${shape.name}`, () => {
    assert.deepEqual(foldAsWrittenBeforeExtraction(shape.prior, shape.observed), shape.expected);
  });
}

test('the parked-at-plan veto is what withholds the built transition, not a missing checkpoint ref', () => {
  const shape = statusFoldCases().find((entry) => entry.prior.msps.some((m) => m.status === 'parked'));
  assert.ok(shape, 'the characterization table must carry a parked-at-plan shape');
  const vetoed = foldAsWrittenBeforeExtraction(shape.prior, shape.observed).msps.find((m) => m.id === 'd');
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

test('a null prior manifest with no observed facts folds to null rather than throwing', () => {
  const folded = foldAsWrittenBeforeExtraction(null, {
    mergedIds: [],
    shippedMeta: new Map(),
    manifestUnitIds: new Set(),
    builtUnits: [],
    builtShas: {},
    logicalRunId: 'a1b2c3d4',
  });
  assert.equal(folded, null);
});
