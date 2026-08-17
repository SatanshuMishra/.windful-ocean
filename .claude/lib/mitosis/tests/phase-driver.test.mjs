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
    ports: Object.freeze({
      openRun: () => handle,
      release: (given) => { released.push(given); },
      makeObserver: () => () => {},
      makePorts: () => enginePorts,
      ...overrides,
    }),
  };
}

test('the driver advances one run through every declared phase, in the order the authority declares them', async () => {
  const stub = stubbedPorts();
  const driven = await runPhases(runRequest(), stub.ports);
  assert.deepEqual(
    Object.keys(driven.phases),
    ['Probe', 'Decompose', 'Prep', 'Execute', 'Integrate', 'Ship', 'Resume', 'Remediate'],
    'the driver must record one outcome per phase under its own title and in pipeline order; a length assertion would pass while Ship ran before Integrate or never ran at all',
  );
  assert.equal(driven.phases.Probe.handle, stub.handle, 'Probe holds the run store lock the rest of the run writes under');
  assert.equal(driven.phases.Execute.result.quiescent, true, 'Execute is the phase that runs the engine, so its outcome carries the engine result');
});

test('every phase a later change fills in returns its own empty result, so a body attaches without reshaping the driver', async () => {
  const driven = await runPhases(runRequest(), stubbedPorts().ports);
  assert.deepEqual(driven.phases.Decompose, { units: [] });
  assert.deepEqual(driven.phases.Integrate, { integrated: [], parked: [] });
  assert.deepEqual(driven.phases.Ship, { opened: [], parked: [] });
  assert.deepEqual(driven.phases.Resume, { resumed: [], parked: [] });
  assert.deepEqual(driven.phases.Remediate, { remediated: [], parked: [] });
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
