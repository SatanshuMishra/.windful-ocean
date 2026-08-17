import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from './file-scope-fixtures.mjs';
import { Done } from '../boundary.mjs';
import { runPhases } from '../phase-driver.mjs';

function runRequest() {
  return {
    specPath: '/spec.json',
    spec: {
      manifest: { logicalRunId: 'r1', clusters: [], msps: [{ id: 'alpha' }] },
      specs: [{ id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } }],
    },
    runId: '0a1b2c3d',
    at: '2026-08-15T12:00:00Z',
    repoRoot: '/repo',
    journalPath: '.mitosis/run.jsonl',
    repoSlug: 'acme/widgets',
    integrationBranch: 'integration',
    window: undefined,
  };
}

function stubbedPorts(overrides = {}) {
  const handle = Object.freeze({ runKey: 'a1b2c3d4e5f60718', attempt: 1 });
  const released = [];
  const gated = [];
  const dispatched = [];
  const enginePorts = {
    runUnit: async () => Done({ sha: 'sha-alpha', green: true }),
    writeGenesis: async () => {},
    appendJournal: async () => {},
    writeRef: async () => {},
    gh: async () => ({ state: 'OPEN' }),
  };
  return {
    handle,
    released,
    gated,
    dispatched,
    ports: Object.freeze({
      openRun: () => handle,
      readJournal: () => null,
      reconcile: () => [],
      release: (given) => { released.push(given); },
      makeObserver: () => () => {},
      makePorts: () => enginePorts,
      boundaryGate: (request) => { gated.push(request); return { pass: true, output: 'no new finding', blocking: [], baseCensus: null }; },
      dispatchPrompt: (request) => { dispatched.push(request); return { ok: true, outcome: 'success' }; },
      ...overrides,
    }),
  };
}

test('the driver advances one run through every declared phase, in the order the authority declares them', async () => {
  const stub = stubbedPorts();
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(
    Object.keys(driven.phases),
    ['Probe', 'Decompose', 'Resume', 'Prep', 'Execute', 'Integrate', 'Ship', 'Remediate'],
    'the driver must record one outcome per phase under its own title and in pipeline order; a length assertion would pass while Ship ran before Integrate or never ran at all',
  );
  assert.equal(driven.phases.Probe.handle, stub.handle, 'Probe holds the run store lock the rest of the run writes under');
  assert.equal(driven.phases.Execute.result.quiescent, true, 'Execute is the phase that runs the engine, so its outcome carries the engine result');
});

test('every phase a later change fills in returns its own empty result, so a body attaches without reshaping the driver', async () => {
  const driven = await runPhases(runRequest(), stubbedPorts().ports);
  assert.deepEqual(driven.phases.Decompose, { units: [] });
  assert.deepEqual(driven.phases.Ship, { opened: [], parked: [] });
  assert.deepEqual(driven.phases.Remediate, { remediated: [], parked: [] });
});

test('Integrate gates nothing on a run whose journal names no built unit, and never spawns a gate for one', async () => {
  const stub = stubbedPorts();
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(driven.phases.Integrate, {
    integrated: [],
    parked: [],
    diverged: [],
    divergedParents: [],
    outcomes: [],
  });
  assert.deepEqual(stub.gated, [], 'the boundary gate materializes a base worktree, so a run with nothing built must not reach it at all');
});

test('a built unit whose run declares no base branch parks rather than gating against a base nobody wrote', async () => {
  const journal = { logicalRunId: 'r1', clusters: [], msps: [{ id: 'alpha', status: 'built' }] };
  const stub = stubbedPorts({ readJournal: () => journal });
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(driven.phases.Integrate.outcomes, [{
    unitId: 'alpha',
    state: 'parked',
    boundaryFixes: 0,
    diagnosis: driven.phases.Integrate.outcomes[0].diagnosis,
    stage: 'execute',
    resumePoint: { branch: null, ref: null, stage: 'ship' },
  }]);
  assert.match(driven.phases.Integrate.outcomes[0].diagnosis, /declares no base branch/);
  assert.deepEqual(stub.gated, [], 'without a declared base branch there is no pre-MSP tree to collect, so no gate runs');
});

test('a built unit is gated once against the declared base branch, and integrates when the gate is clean', async () => {
  const journal = { logicalRunId: 'r1', baseBranch: 'main', clusters: [], msps: [{ id: 'alpha', status: 'built' }] };
  const stub = stubbedPorts({ readJournal: () => journal });
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(stub.gated, [{
    repoRoot: '/repo',
    gateBase: 'main',
    basePath: '/repo/.mitosis/boundary/r1/alpha',
  }]);
  assert.deepEqual(stub.dispatched, [], 'a clean gate composes no boundary-fix prompt');
  assert.deepEqual(driven.phases.Integrate.outcomes, [{
    unitId: 'alpha',
    state: 'integrated',
    boundaryFixes: 0,
    diagnosis: null,
    stage: null,
    resumePoint: { branch: null, ref: null, stage: 'ship' },
  }]);
});

test('Resume plans the whole spec when no journal names this run, and hands Execute that plan rather than the spec', async () => {
  const driven = await runPhases(runRequest(), stubbedPorts().ports);
  assert.equal(driven.phases.Resume.restarted, true, 'a run with no recoverable journal is a restart, and saying so is what lets a later reader tell one from a resume');
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), ['alpha']);
  assert.deepEqual(driven.phases.Resume.resumed.map((entry) => entry.unitId), ['alpha']);
  assert.deepEqual(driven.phases.Resume.built, []);
  assert.deepEqual(driven.phases.Resume.parked, []);
  assert.deepEqual(driven.phases.Resume.shipped, []);
});

test('Resume drops a unit the recovered journal already settled, and prunes the prereq that named it', async () => {
  const journal = {
    logicalRunId: 'r1',
    clusters: [],
    msps: [{ id: 'alpha', status: 'built' }, { id: 'beta', status: 'parked' }],
  };
  const base = runRequest();
  const request = {
    ...base,
    spec: {
      ...base.spec,
      specs: [
        { id: 'alpha', fileScope: pack(['alpha.mjs']), request: { prompt: 'do alpha' } },
        { id: 'beta', prereqs: ['alpha'], fileScope: pack(['beta.mjs']), request: { prompt: 'do beta' } },
      ],
    },
  };
  const driven = await runPhases(request, stubbedPorts({ readJournal: () => journal }).ports);
  assert.equal(driven.phases.Resume.restarted, false);
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), ['beta']);
  assert.deepEqual(driven.phases.Resume.specs[0].prereqs, [], 'a prereq naming a unit this run no longer schedules would fail the unit table, and it is already satisfied because that unit settled');
  assert.deepEqual(driven.phases.Resume.built.map((entry) => entry.unitId), ['alpha']);
  assert.deepEqual(driven.phases.Resume.parked.map((entry) => entry.unitId), ['beta']);
});

function shippedClaim(extra = {}) {
  return { logicalRunId: 'r1', clusters: [], msps: [{ id: 'alpha', status: 'shipped' }], ...extra };
}

test('a journal claiming a unit shipped does not retire it when the forge reports no merged pull request', async () => {
  const probed = [];
  const ports = stubbedPorts({
    readJournal: () => shippedClaim({ baseBranch: 'main', sourcePrefix: 'mitosis' }),
    reconcile: (values) => { probed.push(values); return []; },
  }).ports;
  const driven = await runPhases(runRequest(), ports);
  assert.deepEqual(driven.phases.Resume.shipped, [], 'the merged set observed from the forge is the authority, and it names nothing');
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), ['alpha']);
  assert.deepEqual(probed, [{ ownerRepo: 'acme/widgets', baseBranch: 'main', sourcePrefix: 'mitosis', repoHost: null }]);
});

test('a unit the forge reports merged is the one case a shipped claim retires work', async () => {
  const merged = [{ headRefName: 'mitosis/alpha-integration', url: 'https://github.com/acme/widgets/pull/7', mergedAt: '2026-08-01T00:00:00Z' }];
  const ports = stubbedPorts({
    readJournal: () => shippedClaim({ baseBranch: 'main', sourcePrefix: 'mitosis' }),
    reconcile: () => merged,
  }).ports;
  const driven = await runPhases(runRequest(), ports);
  assert.deepEqual(driven.phases.Resume.shipped, ['alpha']);
  assert.deepEqual(driven.phases.Resume.specs, []);
  assert.deepEqual(driven.phases.Execute.result.units, []);
});

test('a shipped claim the run cannot probe retires nothing, and the probe is never built from a half-named manifest', async () => {
  const probed = [];
  const ports = stubbedPorts({
    readJournal: () => shippedClaim({ baseBranch: 'main' }),
    reconcile: (values) => { probed.push(values); return []; },
  }).ports;
  const driven = await runPhases(runRequest(), ports);
  assert.deepEqual(probed, [], 'a manifest naming no source prefix cannot be turned into a branch-to-unit mapping, so no probe is spawned rather than one that would be read wrongly');
  assert.deepEqual(driven.phases.Resume.shipped, []);
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), ['alpha']);
});

test('a journal naming a different run is not this run evidence, so the whole spec is planned again', async () => {
  const journal = {
    logicalRunId: 'other',
    clusters: [],
    msps: [{ id: 'alpha', status: 'built' }],
  };
  const driven = await runPhases(runRequest(), stubbedPorts({ readJournal: () => journal }).ports);
  assert.equal(driven.phases.Resume.restarted, true, 'a journal folded from another run must not silently retire this run work');
  assert.deepEqual(driven.phases.Resume.specs.map((spec) => spec.id), ['alpha']);
});

test('the run store lock is released exactly once when a phase throws part way through the sequence', async () => {
  const stub = stubbedPorts({ makePorts: () => ({}) });
  await assert.rejects(
    runPhases(runRequest(), stub.ports),
    (error) => error instanceof TypeError && /runUnit/.test(error.message),
  );
  assert.deepEqual(stub.released, [stub.handle], 'a phase that throws after Probe must still hand the lock back, and hand it back once, or the next run on this key refuses forever');
});

test('a run request missing a field the phases read is refused before the run store lock is taken', async () => {
  const stub = stubbedPorts();
  const { repoSlug, ...incomplete } = runRequest();
  await assert.rejects(
    runPhases(incomplete, stub.ports),
    (error) => error instanceof TypeError && /repoSlug/.test(error.message),
  );
  assert.deepEqual(stub.released, [], 'the request is validated before Probe opens the run store, so a rejected request leaves no lock to release');
});
