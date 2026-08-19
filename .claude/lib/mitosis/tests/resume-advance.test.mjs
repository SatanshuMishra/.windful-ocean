import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceResume } from '../resume-advance.mjs';

function resumeView(overrides = {}) {
  return {
    manifest: {
      logicalRunId: 'deadbeef',
      sourcePrefix: 'mitosis',
      baseBranch: 'main',
      clusters: [],
      msps: [
        { id: 'alpha', progress: 'planned', integrationBranch: 'mitosis/alpha-integration' },
        { id: 'beta', progress: 'built', integrationBranch: 'mitosis/beta-integration', checkpointRef: 'refs/mitosis/9e8d7c6b/beta' },
        { id: 'gamma', progress: 'pr-open', integrationBranch: 'mitosis/gamma-integration' },
      ],
    },
    built: [{
      unitId: 'beta',
      stage: 'ship',
      resumePoint: { branch: 'mitosis/beta-integration', ref: 'refs/mitosis/9e8d7c6b/beta', stage: 'ship' },
      triedSet: [],
    }],
    shipped: ['gamma'],
    ...overrides,
  };
}

const ALPHA_BUILT = Object.freeze({
  unitId: 'alpha',
  checkpointRef: 'refs/mitosis/0a1b2c3d/alpha',
  sha: 'sha-alpha',
  green: true,
  builtAgainst: {},
});

test('advancing twice equals advancing once, so folding the same deltas again reads the same view', () => {
  const once = advanceResume(resumeView(), [ALPHA_BUILT]);
  const twice = advanceResume(once, [ALPHA_BUILT]);
  assert.deepEqual(twice, once);
});

test('the deltas Execute recorded join the units the pre-Execute view already held, each under the ref its own run wrote', () => {
  const advanced = advanceResume(resumeView(), [ALPHA_BUILT]);
  assert.deepEqual(advanced.built.map((entry) => [entry.unitId, entry.resumePoint.ref]), [
    ['alpha', 'refs/mitosis/0a1b2c3d/alpha'],
    ['beta', 'refs/mitosis/9e8d7c6b/beta'],
  ]);
  assert.deepEqual(advanced.built.map((entry) => entry.resumePoint.branch), ['mitosis/alpha-integration', 'mitosis/beta-integration']);
});

test('the manifest handed on marks every recorded unit built, which is the field the divergence guard keys on', () => {
  const advanced = advanceResume(resumeView(), [ALPHA_BUILT]);
  assert.deepEqual(
    advanced.manifest.msps.map((msp) => [msp.id, msp.progress]),
    [['alpha', 'built'], ['beta', 'built'], ['gamma', 'pr-open']],
  );
});

test('the shipped set passes through untouched, because only the forge probe may name it', () => {
  const advanced = advanceResume(resumeView(), [ALPHA_BUILT]);
  assert.deepEqual(advanced.shipped, ['gamma']);
  assert.deepEqual(advanced.built.map((entry) => entry.unitId), ['alpha', 'beta'], 'a shipped unit is never re-reported built');
});

test('a unit reported shipped is not re-reported built even when a delta names it', () => {
  const advanced = advanceResume(resumeView(), [{ ...ALPHA_BUILT, unitId: 'gamma' }]);
  assert.deepEqual(advanced.built.map((entry) => entry.unitId), ['beta']);
  assert.deepEqual(advanced.manifest.msps.find((msp) => msp.id === 'gamma').progress, 'pr-open');
});

test('the view it was given is left as it was, so its caller still reads the state before the advance', () => {
  const before = resumeView();
  const snapshot = JSON.parse(JSON.stringify(before));
  advanceResume(before, [ALPHA_BUILT]);
  assert.deepEqual(before, snapshot);
});

test('a delta naming no unit is refused rather than folded onto a manifest it could never key', () => {
  assert.throws(
    () => advanceResume(resumeView(), [{ checkpointRef: 'refs/mitosis/0a1b2c3d/alpha' }]),
    (error) => error instanceof TypeError && /unitId/.test(error.message),
  );
  assert.throws(
    () => advanceResume(resumeView(), null),
    (error) => error instanceof TypeError && /array/.test(error.message),
  );
  assert.throws(
    () => advanceResume({ built: [], shipped: [] }, []),
    (error) => error instanceof TypeError && /manifest/.test(error.message),
  );
});
