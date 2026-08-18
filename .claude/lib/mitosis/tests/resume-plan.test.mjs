import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planResume, resumeSummary, MERGED_PROBE_STATE } from '../resume-plan.mjs';
import { advanceResume } from '../resume-advance.mjs';

function baseManifest(msps) {
  return {
    logicalRunId: 'a1b2c3d4',
    sourcePrefix: 'mitosis',
    baseBranch: 'main',
    clusters: [msps.map((m) => m.id)],
    msps,
  };
}

function spec(id) {
  return { id };
}

function refusingReconcile(message) {
  return async () => {
    throw new Error(message);
  };
}

async function requestFor(manifest, specs, reconcile) {
  return planResume({
    manifest,
    specs,
    runId: 'a1b2c3d4',
    repoSlug: 'acme/widgets',
    journal: null,
    reconcile,
  });
}

test('a unit at pr-open with no merged PR reported resumes at ship via built, carrying its checkpoint ref, and is dropped from specs', async () => {
  const msp = {
    id: 'unit-a',
    progress: 'pr-open',
    integrationBranch: 'mitosis/unit-a-integration',
    checkpointRef: 'refs/mitosis/a1b2c3d4/unit-a',
  };
  const plan = await requestFor(baseManifest([msp]), [spec('unit-a')], async () => []);
  assert.deepEqual(plan.built, [{
    unitId: 'unit-a',
    stage: 'ship',
    resumePoint: { branch: 'mitosis/unit-a-integration', ref: 'refs/mitosis/a1b2c3d4/unit-a', stage: 'ship' },
    triedSet: [],
  }]);
  assert.deepEqual(plan.specs.map((s) => s.id), []);
  assert.equal(plan.mergedProbe, MERGED_PROBE_STATE.CONFIRMED_NONE);
  assert.equal(plan.mergedProbeReason, null);
});

test('a parked unit is excluded from Prep: it appears in parked and never in specs, and the forge is never asked about it', async () => {
  const msp = {
    id: 'unit-b',
    status: 'parked',
    integrationBranch: 'mitosis/unit-b-integration',
    resumePoint: { branch: 'mitosis/unit-b-integration', ref: null, stage: 'plan' },
    triedSet: [],
  };
  const plan = await requestFor(
    baseManifest([msp]),
    [spec('unit-b')],
    refusingReconcile('reconcile must not run for a unit that never claimed pr-open or merged'),
  );
  assert.deepEqual(plan.parked.map((entry) => entry.unitId), ['unit-b']);
  assert.deepEqual(plan.specs.map((s) => s.id), []);
  assert.equal(plan.mergedProbe, MERGED_PROBE_STATE.NOT_ASKED);
});

test('mergedProbe is not-asked when no planned unit claims pr-open or merged, and the forge is never called', async () => {
  const msp = {
    id: 'unit-c',
    progress: 'built',
    integrationBranch: 'mitosis/unit-c-integration',
    checkpointRef: 'refs/mitosis/a1b2c3d4/unit-c',
  };
  const plan = await requestFor(
    baseManifest([msp]),
    [spec('unit-c')],
    refusingReconcile('reconcile must not run when nothing claims pr-open or merged'),
  );
  assert.equal(plan.mergedProbe, MERGED_PROBE_STATE.NOT_ASKED);
  assert.equal(plan.mergedProbeReason, null);
});

test('mergedProbe is failed, naming what failed, when reconcile throws', async () => {
  const msp = {
    id: 'unit-d',
    progress: 'pr-open',
    integrationBranch: 'mitosis/unit-d-integration',
    checkpointRef: 'refs/mitosis/a1b2c3d4/unit-d',
  };
  const plan = await requestFor(baseManifest([msp]), [spec('unit-d')], refusingReconcile('forge unreachable'));
  assert.equal(plan.mergedProbe, MERGED_PROBE_STATE.FAILED);
  assert.equal(plan.mergedProbeReason, 'reconcile threw: forge unreachable');
});

test('mergedProbe is failed, naming the received shape, when reconcile returns something other than an array', async () => {
  const msp = {
    id: 'unit-e',
    progress: 'pr-open',
    integrationBranch: 'mitosis/unit-e-integration',
    checkpointRef: 'refs/mitosis/a1b2c3d4/unit-e',
  };
  const plan = await requestFor(baseManifest([msp]), [spec('unit-e')], async () => ({ not: 'an array' }));
  assert.equal(plan.mergedProbe, MERGED_PROBE_STATE.FAILED);
  assert.equal(plan.mergedProbeReason, 'reconcile did not return an array, received object');
});

test('a unit already at merged progress is settled outright, without the forge reconfirming it', async () => {
  const msp = {
    id: 'unit-f',
    progress: 'merged',
    integrationBranch: 'mitosis/unit-f-integration',
  };
  const plan = await requestFor(baseManifest([msp]), [spec('unit-f')], async () => []);
  assert.deepEqual(plan.specs.map((s) => s.id), []);
  assert.deepEqual(plan.built.map((entry) => entry.unitId), []);
  assert.deepEqual(plan.parked.map((entry) => entry.unitId), []);
});

test('mergedProbe is confirmed-merged, and mergedShas carries the exact merge commit, when the forge reports a planned unit merged', async () => {
  const msp = {
    id: 'unit-g',
    progress: 'pr-open',
    integrationBranch: 'mitosis/unit-g-integration',
  };
  const mergedPr = {
    url: 'https://github.com/acme/widgets/pull/42',
    headRefName: 'mitosis/unit-g-integration',
    mergedAt: '2026-08-01T00:00:00Z',
    mergeCommit: { oid: 'a'.repeat(40) },
  };
  const plan = await requestFor(baseManifest([msp]), [spec('unit-g')], async () => [mergedPr]);
  assert.equal(plan.mergedProbe, MERGED_PROBE_STATE.CONFIRMED_MERGED);
  assert.deepEqual(plan.shipped, ['unit-g']);
  assert.deepEqual(plan.mergedShas, { 'unit-g': 'a'.repeat(40) });
  assert.deepEqual(plan.specs.map((s) => s.id), []);
  assert.deepEqual(plan.built.map((entry) => entry.unitId), []);
});

test('resumeSummary surfaces mergedProbe and mergedProbeReason additively, leaving every existing field untouched', async () => {
  const msp = {
    id: 'unit-j',
    progress: 'built',
    integrationBranch: 'mitosis/unit-j-integration',
    checkpointRef: 'refs/mitosis/a1b2c3d4/unit-j',
  };
  const plan = await requestFor(
    baseManifest([msp]),
    [spec('unit-j')],
    refusingReconcile('reconcile must not run when nothing claims pr-open or merged'),
  );
  const summary = resumeSummary(plan);
  assert.deepEqual(summary, {
    restarted: true,
    pending: [],
    parked: [],
    built: ['unit-j'],
    shipped: [],
    mergedShas: {},
    mergedProbe: MERGED_PROBE_STATE.NOT_ASKED,
    mergedProbeReason: null,
  });
});

test('advanceResume never admits a pr-open unit the view did not already carry, even though selectResumeBuilt now admits pr-open', () => {
  const manifest = {
    logicalRunId: 'a1b2c3d4',
    sourcePrefix: 'mitosis',
    baseBranch: 'main',
    clusters: [['unit-h', 'unit-i']],
    msps: [
      { id: 'unit-h', progress: 'built', integrationBranch: 'mitosis/unit-h-integration', checkpointRef: 'refs/mitosis/a1b2c3d4/unit-h' },
      { id: 'unit-i', progress: 'pr-open', integrationBranch: 'mitosis/unit-i-integration', checkpointRef: 'refs/mitosis/a1b2c3d4/unit-i' },
    ],
  };
  const view = {
    manifest,
    built: [{
      unitId: 'unit-h',
      stage: 'ship',
      resumePoint: { branch: 'mitosis/unit-h-integration', ref: 'refs/mitosis/a1b2c3d4/unit-h', stage: 'ship' },
    }],
    shipped: [],
  };
  const advanced = advanceResume(view, []);
  assert.deepEqual(advanced.built.map((entry) => entry.unitId), ['unit-h']);
});
